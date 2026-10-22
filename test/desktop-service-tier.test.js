'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { ServiceTierReader, serviceTierFromFeedback } = require('../desktop/service-tier-reader');
const { createSessionAccumulator } = require('../lib/session');

test('feedback parsing accepts only the structured service-tier field', () => {
  assert.equal(serviceTierFromFeedback('tags={"service_tier":"priority"}'), 'priority');
  assert.equal(serviceTierFromFeedback('tags={"service_tier": "default"}'), 'default');
  assert.equal(serviceTierFromFeedback('fast_mode=true speed=fast'), null);
  assert.equal(serviceTierFromFeedback(null), null);
});

test('service tier reads follow per-conversation changes and use bounded indexed queries', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tier-'));
  const db = new DatabaseSync(path.join(home, 'logs_2.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE logs(id INTEGER PRIMARY KEY, thread_id TEXT, target TEXT, feedback_log_body TEXT, ts INTEGER, ts_nanos INTEGER);
    CREATE INDEX idx_logs_thread_id_ts ON logs(thread_id, ts DESC, ts_nanos DESC, id DESC);`);
  const insert = db.prepare('INSERT INTO logs(thread_id,target,feedback_log_body,ts,ts_nanos) VALUES (?,?,?,?,?)');
  insert.run('a', 'feedback_tags', '{"service_tier":"priority"}', 100, 0);
  insert.run('b', 'feedback_tags', '{"service_tier":"default"}', 101, 0);
  let now = 0;
  const reader = new ServiceTierReader(home, { now: () => now });
  t.after(() => { reader.close(); db.close(); fs.rmSync(home, { recursive: true, force: true }); });
  assert.deepEqual(reader.read('a'), { tier: 'priority', recordedAt: 100000 });
  assert.equal(reader.read('b').tier, 'default');
  assert.equal(reader.read('missing'), null);
  const original = reader.statement;
  reader.statement = { iterate() { throw new Error('An unchanged file must not be queried'); } };
  now = 1500;
  assert.equal(reader.read('a').tier, 'priority');
  reader.statement = original;
  insert.run('a', 'feedback_tags', '{"service_tier":"default"}', 102, 0);
  insert.run('a', 'user_content', '{"service_tier":"priority"}', 103, 0);
  now = 3000;
  assert.equal(reader.read('a').tier, 'default');
  const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT feedback_log_body, ts, ts_nanos FROM logs
    WHERE thread_id = ? AND target = 'feedback_tags' ORDER BY ts DESC, ts_nanos DESC, id DESC LIMIT 64`).all('a');
  assert.match(plan.map(row => row.detail).join(' '), /idx_logs_thread_id_ts/);
});

test('missing logs leave historical session statistics available', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tier-missing-'));
  const reader = new ServiceTierReader(home);
  t.after(() => { reader.close(); fs.rmSync(home, { recursive: true, force: true }); });
  assert.equal(reader.read('a'), null);
});

test('rollout tier metadata enables and clears Fast mode within the same conversation', () => {
  const session = createSessionAccumulator('fixture.jsonl');
  session.consumeLine(JSON.stringify({ type: 'session_meta', payload: { id: 'a' } }));
  const context = (service_tier, timestamp) => session.consumeLine(JSON.stringify({ type: 'turn_context', timestamp, payload: { model: 'gpt-6.1-sol', service_tier } }));
  assert.equal(session.snapshot().serviceTier, null);
  context('priority', '2026-10-22T00:00:00Z');
  assert.equal(session.snapshot().serviceTier, 'priority');
  context(null, '2026-10-22T00:01:00Z');
  assert.equal(session.snapshot().serviceTier, 'default');
  assert.equal(session.snapshot().serviceTierUpdatedAt, '2026-10-22T00:01:00.000Z');
});
