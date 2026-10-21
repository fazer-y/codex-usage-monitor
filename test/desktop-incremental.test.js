'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SessionReader } = require('../desktop/session-reader');
const { createSessionAccumulator } = require('../lib/session');
const { summarizeSessionFile } = require('./helpers/session-summary');
const { costBreakdownForUsage } = require('../lib/pricing');

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.match(path.basename(root), /^cum-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function fixture(t) {
  const file = path.join(directory(t), 'session.jsonl');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'session-basic.jsonl'), file);
  return file;
}
function line(value) { return JSON.stringify(value) + '\n'; }

test('incremental reads match the full parser and reuse unchanged snapshots', async t => {
  const file = fixture(t);
  const reader = new SessionReader();
  const first = await reader.read(file);
  assert.deepEqual(first, await summarizeSessionFile(file));
  const bytes = reader.bytesRead;
  assert.strictEqual(await reader.read(file), first);
  assert.equal(reader.bytesRead, bytes);
});

test('partial UTF-8 records are retained until complete and only new bytes are read', async t => {
  const file = fixture(t);
  const reader = new SessionReader();
  await reader.read(file);
  const before = reader.bytesRead;
  const record = Buffer.from(line({ type: 'response_item', timestamp: '2026-06-30T03:05:09Z',
    payload: { type: 'function_call', call_id: 'call_unicode', name: 'test', arguments: '中文' } }));
  const split = record.indexOf(Buffer.from('中')) + 1;
  fs.appendFileSync(file, record.subarray(0, split));
  assert.equal((await reader.read(file)).toolCallCount, 0);
  fs.appendFileSync(file, record.subarray(split));
  const result = await reader.read(file);
  assert.equal(result.toolCallCount, 1);
  assert.equal(result.parseFailures, 0);
  assert.equal(reader.bytesRead - before, record.length);
});

test('complete final records without a newline are counted once', async t => {
  const file = fixture(t);
  const text = fs.readFileSync(file, 'utf8').trimEnd();
  fs.writeFileSync(file, text);
  const reader = new SessionReader();
  assert.deepEqual(await reader.read(file), await summarizeSessionFile(file));
  fs.appendFileSync(file, '\n');
  assert.equal((await reader.read(file)).requestCount, 2);
});

test('truncation and file replacement reset previous accounting', async t => {
  const file = fixture(t);
  const reader = new SessionReader();
  await reader.read(file);
  fs.writeFileSync(file, line({ type: 'session_meta', payload: { id: 'replacement' } }));
  assert.equal((await reader.read(file)).sessionId, 'replacement');
  assert.equal((await reader.read(file)).requestCount, 0);
  fs.renameSync(file, file + '.old');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'session-basic.jsonl'), file);
  assert.equal((await reader.read(file)).sessionId, 'sess_basic');
});

test('desktop reads historical logs larger than 50 MiB', async t => {
  const file = fixture(t);
  const padding = line({ type: 'response_item', payload: { type: 'message', text: 'x'.repeat(1024 * 1024) } });
  const fd = fs.openSync(file, 'a');
  try { for (let i = 0; i < 51; i++) fs.writeSync(fd, padding); } finally { fs.closeSync(fd); }
  const reader = new SessionReader();
  const result = await reader.read(file);
  assert.equal(result.requestCount, 2);
  assert.equal(result.parseFailures, 0);
  assert.ok(reader.bytesRead > 50 * 1024 * 1024);
});

test('modern and legacy usage records share accounting without counting twice', () => {
  const accumulator = createSessionAccumulator('session');
  for (const value of [
    { type: 'session_meta', payload: { id: 's' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol', turn_id: 'turn' } },
    { type: 'event_msg', timestamp: '2026-10-21T00:00:00Z', payload: { type: 'task_started', turn_id: 'turn' } },
  ]) accumulator.consumeLine(JSON.stringify(value));
  const usage = { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100, total_tokens: 1100 };
  accumulator.consumeLine(JSON.stringify({ type: 'token_usage_record', payload: { turn_id: 'turn', usage, thread_token_usage: usage } }));
  accumulator.consumeLine(JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage } } }));
  accumulator.consumeLine(JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn', duration_ms: 2000, time_to_first_token_ms: 300 } }));
  const result = accumulator.snapshot();
  assert.equal(result.requestCount, 1);
  assert.equal(result.currentTurn.steps, 1);
  assert.equal(result.currentTurn.durationMs, 2000);
  assert.equal(result.currentTurn.timeToFirstTokenMs, 300);
  assert.equal(result.currentTurn.status, 'completed');
});

test('pricing separates cache reads and charges long context per request', () => {
  const usage = { inputTokens: 100000, cachedInputTokens: 80000, cacheWriteInputTokens: 0, outputTokens: 1000 };
  const short = costBreakdownForUsage('gpt-6.1-sol', usage);
  assert.equal(short.input, 0.04);
  assert.equal(short.cachedInput, 0.008);
  assert.equal(short.output, 0.01);
  assert.ok(Math.abs(short.cacheSavings - 0.152) < 1e-12);
  const long = costBreakdownForUsage('gpt-6.1-sol', { ...usage, inputTokens: 300000 });
  assert.equal(long.cachedInput, 0.016);
  assert.equal(long.output, 0.015);
  assert.equal(costBreakdownForUsage('unknown', usage), null);
});

test('multiple short requests retain short-context rates above 272k cumulative input', () => {
  const accumulator = createSessionAccumulator('session');
  accumulator.consumeLine(line({ type: 'session_meta', payload: { id: 's' } }));
  accumulator.consumeLine(line({ type: 'turn_context', payload: { model: 'gpt-6.1-sol', turn_id: 't' } }));
  const usage = { input_tokens: 150000, cached_input_tokens: 100000, output_tokens: 1000, total_tokens: 151000 };
  accumulator.consumeLine(line({ type: 'token_usage_record', payload: { turn_id: 't', usage, thread_token_usage: usage } }));
  accumulator.consumeLine(line({ type: 'token_usage_record', payload: { turn_id: 't', usage,
    thread_token_usage: { input_tokens: 300000, cached_input_tokens: 200000, output_tokens: 2000, total_tokens: 302000 } } }));
  const cost = accumulator.snapshot().cost;
  assert.ok(Math.abs(cost.usd - 0.24) < 1e-12);
  assert.ok(Math.abs(cost.breakdown.cachedInput - 0.02) < 1e-12);
});

test('tool calls are deduplicated and parallel durations are cumulative', () => {
  const accumulator = createSessionAccumulator('session');
  accumulator.consumeLine(line({ type: 'session_meta', payload: { id: 's' } }));
  accumulator.consumeLine(line({ type: 'event_msg', timestamp: '2026-10-21T00:00:00Z', payload: { type: 'task_started', turn_id: 't' } }));
  for (const id of ['a', 'b', 'a']) accumulator.consumeLine(line({ type: 'response_item', timestamp: '2026-10-21T00:00:00Z', payload: { type: 'function_call', call_id: id } }));
  accumulator.consumeLine(line({ type: 'response_item', timestamp: '2026-10-21T00:00:02Z', payload: { type: 'function_call_output', call_id: 'a' } }));
  accumulator.consumeLine(line({ type: 'response_item', timestamp: '2026-10-21T00:00:03Z', payload: { type: 'function_call_output', call_id: 'b' } }));
  accumulator.consumeLine(line({ type: 'response_item', timestamp: '2026-10-21T00:00:03Z', payload: { type: 'function_call_output', call_id: 'b' } }));
  const summary = accumulator.snapshot();
  assert.equal(summary.currentTurn.toolCalls, 2);
  assert.equal(summary.toolCallCount, 2);
  assert.equal(summary.currentTurn.toolDurationMs, 5000);
});

test('request throughput excludes tool waits, duplicate usage and cumulative gaps', () => {
  const accumulator = createSessionAccumulator('timing');
  const record = (seconds, type, payload) => accumulator.consumeLine(line({
    timestamp: new Date(Date.UTC(2026, 9, 21, 0, 0, seconds)).toISOString(), type, payload,
  }));
  record(0, 'session_meta', { id: 'timing' });
  record(0, 'turn_context', { model: 'gpt-6.1-sol', turn_id: 't' });
  record(0, 'event_msg', { type: 'task_started', turn_id: 't' });
  const first = { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 };
  record(1, 'token_usage_record', { turn_id: 't', usage: first, thread_token_usage: first });
  record(1, 'event_msg', { type: 'token_count', info: { total_token_usage: first, last_token_usage: first } });
  for (const id of ['a', 'b']) record(1, 'response_item', { type: 'function_call', call_id: id });
  record(5, 'response_item', { type: 'function_call_output', call_id: 'a' });
  record(9, 'response_item', { type: 'function_call_output', call_id: 'b' });
  const second = { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 };
  record(11, 'token_usage_record', { turn_id: 't', usage: second,
    thread_token_usage: { input_tokens: 2000, output_tokens: 300, total_tokens: 2300 } });
  assert.deepEqual(accumulator.snapshot().currentTurn.generation,
    { outputTokens: 300, durationMs: 3000, requestCount: 2, estimated: true });
  record(12, 'token_usage_record', { turn_id: 't', usage: second,
    thread_token_usage: { input_tokens: 4000, output_tokens: 700, total_tokens: 4700 } });
  assert.equal(accumulator.snapshot().currentTurn.generation.outputTokens, 300);
  assert.equal(accumulator.snapshot().currentTurn.generation.requestCount, 2);
});
