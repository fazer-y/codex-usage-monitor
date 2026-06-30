'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createUsageService, secondsFromEnv } = require('../desktop/usage-service');

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
