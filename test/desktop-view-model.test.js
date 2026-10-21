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
  assert.equal(vm.title, '等待会话');
  assert.equal(vm.metrics.length, 0);
  assert.match(vm.footer, /本地/);
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
  assert.equal(vm.subtitle, 'medium');
  assert.equal(vm.metrics.find(metric => metric.kind === 'context').value, '12%');
  assert.equal(vm.metrics.find(metric => metric.kind === 'steps').value, '第1步');
  assert.equal(vm.metrics.find(metric => metric.kind === 'tools').value, '0次');
  assert.equal(vm.rows.some((row) => row.label === '本轮'), true);
  assert.equal(vm.rows.some((row) => row.label === 'Source'), false);
  assert.equal(JSON.stringify(vm).includes('session-basic.jsonl'), false);
  assert.match(vm.cost, /API/);
});

test('wide-strip metrics use current-turn output, tool count and recorded latency', async () => {
  const summary = await summarizeSessionFile(path.join(__dirname, 'fixtures', 'session-basic.jsonl'));
  summary.currentTurn = { steps: 8, toolCalls: 5, durationMs: 10000, timeToFirstTokenMs: 420,
    usage: { inputTokens: 2000, outputTokens: 500 }, generation: { outputTokens: 500, durationMs: 4000, requestCount: 8 } };
  const vm = snapshotToViewModel({ status: 'ready', summary });
  assert.equal(vm.metrics.find(metric => metric.kind === 'speed').label, '吞吐');
  assert.equal(vm.metrics.find(metric => metric.kind === 'speed').value, '125.0 token/s');
  assert.equal(vm.metrics.find(metric => metric.kind === 'tools').value, '5次');
  assert.equal(vm.metrics.find(metric => metric.kind === 'output').value, '500');
  assert.equal(vm.metrics.find(metric => metric.kind === 'ttft').value, '420ms');
  assert.equal(vm.metrics[0].kind, 'speed');
  assert.equal(vm.metrics.at(-1).kind, 'cost');
});

test('unknown prices keep token metrics and display an unavailable cost', async () => {
  const summary = await summarizeSessionFile(path.join(__dirname, 'fixtures', 'session-basic.jsonl'));
  summary.model = 'unknown';
  summary.modelName = 'unknown';
  summary.cost = { usd: null, knownUsd: 0, complete: false, breakdown: {} };
  const vm = snapshotToViewModel({ status: 'ready', summary });
  assert.equal(vm.metrics.find(metric => metric.kind === 'cost').value, '—');
  assert.equal(vm.metrics.find(metric => metric.kind === 'tokens').value, '2.5k');
  assert.equal(vm.rows.some(row => row.label === '费用明细'), false);
});
