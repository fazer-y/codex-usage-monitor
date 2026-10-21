'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { summarizeSessionFile } = require('./helpers/session-summary');
const { modelInfo, sessionCost, costForUsage } = require('../lib/pricing');


const fixture = path.join(__dirname, 'fixtures/session-basic.jsonl');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function summary(t, records) {
  const file = path.join(temp(t), 'session.jsonl');
  fs.writeFileSync(file, records.map(x => JSON.stringify(x)).join('\n') + '\n');
  return summarizeSessionFile(file);
}
function records() { return fs.readFileSync(fixture, 'utf8').trim().split('\n').map(JSON.parse); }
test('duplicate counts and quota-only events never charge again or erase usage', async t => {
  const r = records();
  const last = structuredClone(r.at(-1));
  last.payload.rate_limits.primary.used_percent = 57;
  const s = await summary(t, [...r, last, last, { type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: last.payload.rate_limits } }]);
  assert.equal(s.turnCount, 2);
  assert.equal(s.requestCount, 2);
  assert.equal(s.totalUsage.inputTokens, 2200);
  assert.equal(s.models['gpt-5.4-mini'].inputTokens, 1200);
  assert.equal(s.rateLimits.primary.usedPercent, 57);
  assert.equal(s.cost.usd, 0.008045);
});
test('duplicate after a model switch is not attributed to the new model', async t => {
  const r = records();
  const s = await summary(t, [...r, { type: 'turn_context', payload: { model: 'future-model', turn_id: 'third' } }, r.at(-1)]);
  assert.equal(s.model, 'future-model');
  assert.equal(s.models['future-model'], undefined);
  assert.equal(s.cost.complete, true);
});
test('equal request sizes in one turn are distinct when cumulative totals advance', async t => {
  const r = records().slice(0, 5);
  const next = structuredClone(r.at(-1));
  for (const key of Object.keys(next.payload.info.total_token_usage)) next.payload.info.total_token_usage[key] *= 2;
  const s = await summary(t, [...r, next, next]);
  assert.equal(s.requestCount, 2);
  assert.equal(s.turnCount, 1);
  assert.equal(s.models['gpt-5.5'].inputTokens, 2000);
  assert.equal(s.cost.usd, 0.0133);
});
test('rollback cannot erase high-water usage or invent a price', async t => {
  const r = records();
  const s = await summary(t, [...r, r[4]]);
  assert.equal(s.totalUsage.inputTokens, 2200);
  assert.equal(s.cost.usd, null);
  assert.equal(s.requestCount, 2);
});
test('missing accounting and cumulative gaps are explicitly unpriced', async t => {
  const r = records();
  r[4].payload.info.total_token_usage.input_tokens += 1;
  const s = await summary(t, r.slice(0, 5));
  assert.equal(s.cost.usd, null);
  assert.equal(s.cost.complete, false);
});
test('unknown model IDs cannot inherit known prices', () => {
  for (const id of ['gpt-5.50', 'gpt-5.4-mini-future', 'custom-gpt-5.5', 'gpt-5.5-pro-future', 'gpt-5.3', 'gpt-6-astra-unknown']) {
    assert.equal(modelInfo(id), null, id);
    assert.equal(costForUsage(id, { inputTokens: 1000 }), null, id);
  }
  const cost = sessionCost({ 'unknown': { inputTokens: 10 } });
  assert.equal(cost.usd, null);
  assert.equal(cost.complete, false);
});
test('official Standard rates include cache writes and request long-context pricing', () => {
  assert.equal(costForUsage('gpt-6-astra', { inputTokens: 100000, cachedInputTokens: 20000, cacheWriteInputTokens: 10000, outputTokens: 10000 }), 1.345);
  assert.equal(costForUsage('gpt-6-astra', { inputTokens: 300000, cachedInputTokens: 200000, outputTokens: 10000 }), 3.15);
});
