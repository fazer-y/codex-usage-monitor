'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createUsageService, secondsFromEnv } = require('../desktop/usage-service');
const { snapshotToViewModel } = require('../desktop/view-model');

function tempCodexHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-usage-desktop-'));
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  return home;
}

function copyFixture(codexHome, name = 'session.jsonl') {
  const target = path.join(codexHome, 'sessions', name);
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'session-basic.jsonl'), target);
  return target;
}

test('secondsFromEnv returns default for missing, invalid, or non-positive values', () => {
  assert.equal(secondsFromEnv({}, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: 'abc' }, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: '0' }, 'X', 5), 5);
  assert.equal(secondsFromEnv({ X: '-1' }, 'X', 5), 5);
});

test('secondsFromEnv parses positive numbers', () => {
  assert.equal(secondsFromEnv({ X: '2.5' }, 'X', 5), 2.5);
});

test('snapshot reports waiting state when no session exists', async () => {
  const codexHome = tempCodexHome();
  const service = createUsageService({ codexHome });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.status, 'waiting');
  assert.equal(snapshot.codexHome, codexHome);
  assert.equal(snapshot.summary, null);
  assert.match(snapshot.message, /No Codex session/);
});

test('snapshot summarizes the latest local session without network access', async () => {
  const codexHome = tempCodexHome();
  const transcriptPath = copyFixture(codexHome);
  const service = createUsageService({ codexHome });

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.codexHome, codexHome);
  assert.equal(snapshot.transcriptPath, transcriptPath);
  assert.equal(snapshot.summary.modelName, 'GPT-5.4 mini');
  assert.equal(snapshot.summary.turnCount, 2);
});

test('a metadata-only log waits for usage and resolves a new model by its logged ID', async t => {
  const codexHome = tempCodexHome();
  const transcriptPath = path.join(codexHome, 'sessions', 'new-session.jsonl');
  const file = path.join(codexHome, 'models_cache.json');
  const model = 'gpt-future-sol';
  const record = (type, payload) => JSON.stringify({ type, payload }) + '\n';
  fs.writeFileSync(transcriptPath, record('session_meta', { id: 'new-session', model_provider: 'openai' }));
  const service = createUsageService({ codexHome });
  t.after(async () => {
    await service.close();
    assert.equal(path.dirname(codexHome), os.tmpdir());
    assert.match(path.basename(codexHome), /^codex-usage-desktop-/);
    fs.rmSync(codexHome, { recursive: true, force: true });
  });
  const waiting = await service.getSnapshot();
  assert.equal(waiting.reason, 'noUsage');
  assert.equal(snapshotToViewModel(waiting, Date.now(), 'zh-CN').title, '等待用量');

  const usage = { input_tokens: 100, output_tokens: 10, total_tokens: 110 };
  fs.appendFileSync(transcriptPath, record('turn_context', { model, turn_id: 'turn' })
    + record('token_usage_record', { turn_id: 'turn', usage, thread_token_usage: usage }));
  const unpriced = await service.getSnapshot();
  assert.equal(unpriced.status, 'ready');
  assert.equal(unpriced.summary.modelName, model);
  assert.equal(unpriced.summary.cost.usd, null);

  fs.writeFileSync(file, JSON.stringify({ models: [{ slug: model, display_name: 'GPT Future Sol' }] }));
  const bytes = service.reader.bytesRead;
  const named = await service.getSnapshot();
  assert.equal(named.summary.modelName, 'GPT Future Sol');
  assert.equal(named.summary.cost.usd, null);
  assert.equal(named.summary.totalUsage.totalTokens, 110);
  assert.equal(service.reader.bytesRead, bytes);
});
