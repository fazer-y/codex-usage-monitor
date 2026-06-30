'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { snapshotToViewModel } = require('../desktop/view-model');
const { summarizeSessionFile } = require('../lib/session');

test('snapshotToViewModel renders waiting state', () => {
  const vm = snapshotToViewModel({
    status: 'waiting',
    codexHome: '/tmp/codex',
    transcriptPath: null,
    summary: null,
    message: 'No Codex session JSONL files found under /tmp/codex.',
    generatedAt: '2026-06-30T00:00:00.000Z',
  });

  assert.equal(vm.status, 'waiting');
  assert.equal(vm.title, 'Waiting for Codex usage');
  assert.equal(vm.rows.length, 0);
  assert.match(vm.footer, /local files only/i);
});

test('snapshotToViewModel renders usage rows from a summary', async () => {
  const summary = await summarizeSessionFile(path.join(__dirname, 'fixtures', 'session-basic.jsonl'));
  const vm = snapshotToViewModel({
    status: 'ready',
    codexHome: '/tmp/codex',
    transcriptPath: '/tmp/codex/sessions/session-basic.jsonl',
    summary,
    message: 'Usage loaded from local Codex session files.',
    generatedAt: '2026-06-30T00:00:00.000Z',
  });

  assert.equal(vm.status, 'ready');
  assert.equal(vm.title, 'GPT-5.4 mini');
  assert.equal(vm.subtitle, 'think medium · prolite');
  assert.deepEqual(vm.metrics[0], { label: 'Context', value: '12%', percent: 12 });
  assert.equal(vm.rows.some((row) => row.label === 'This turn'), true);
  assert.match(vm.cost, /API/);
});
