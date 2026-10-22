'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SessionReader } = require('../desktop/session-reader');
const { summarizeSessionFile } = require('./helpers/session-summary');

const WEEK = 7 * 24 * 60 * 60 * 1000;
const record = value => JSON.stringify(value) + '\n';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cum-cache-'));
  const readers = [];
  t.after(async () => {
    for (const item of readers) await item.flush();
    assert.equal(path.dirname(root), os.tmpdir());
    assert.match(path.basename(root), /^cum-cache-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'session.jsonl');
  await fs.copyFile(path.join(__dirname, 'fixtures/session-basic.jsonl'), file);
  const cacheDirectory = path.join(root, 'cache');
  const reader = () => {
    const value = new SessionReader({ cacheDirectory, ...options });
    readers.push(value);
    return value;
  };
  return { root, file, cacheDirectory, reader };
}

test('persisted session checkpoints skip original bytes after restart and consume only appends', async t => {
  const { file, reader } = await fixture(t);
  const first = reader();
  const original = await first.read(file);
  await first.flush();
  const next = reader();
  assert.deepEqual(await next.read(file), original);
  assert.equal(next.bytesRead, 0);
  const extra = record({ type: 'response_item', timestamp: '2026-10-22T00:00:00Z',
    payload: { type: 'function_call', call_id: 'persisted-tool', name: 'read_file' } });
  await fs.appendFile(file, extra);
  assert.deepEqual(await next.read(file), await summarizeSessionFile(file));
  assert.equal(next.bytesRead, Buffer.byteLength(extra));
});

test('partial UTF-8 and applied records without a newline survive restart', async t => {
  const { file, reader } = await fixture(t);
  const extra = Buffer.from(record({ type: 'response_item',
    payload: { type: 'function_call', call_id: 'unicode', name: 'test', arguments: '中文' } }));
  const split = extra.indexOf(Buffer.from('中')) + 1;
  await fs.appendFile(file, extra.subarray(0, split));
  const first = reader();
  await first.read(file); await first.flush();
  const second = reader();
  assert.equal((await second.read(file)).toolCallCount, 0);
  assert.equal(second.bytesRead, 0);
  await fs.appendFile(file, extra.subarray(split, extra.length - 1));
  assert.equal((await second.read(file)).toolCallCount, 1);
  await second.flush();
  const third = reader();
  assert.equal((await third.read(file)).toolCallCount, 1);
  assert.equal(third.bytesRead, 0);
  await fs.appendFile(file, '\n');
  assert.deepEqual(await third.read(file), await summarizeSessionFile(file));
  assert.equal(third.bytesRead, 1);
});

test('in-flight tools and accounting deduplication survive checkpoints', async t => {
  const { file, reader } = await fixture(t);
  const call = record({ type: 'response_item', timestamp: '2026-10-22T00:00:00Z',
    payload: { type: 'function_call', call_id: 'pending', name: 'test' } });
  await fs.appendFile(file, call);
  const first = reader(); await first.read(file); await first.flush();
  await fs.appendFile(file, call + record({ type: 'response_item', timestamp: '2026-10-22T00:00:02Z',
    payload: { type: 'function_call_output', call_id: 'pending' } }));
  assert.deepEqual(await reader().read(file), await summarizeSessionFile(file));
});

test('one-week idle expiry is renewed on access and unchanged reads avoid disk writes', async t => {
  let now = Date.now();
  const { file, reader } = await fixture(t, { now: () => now });
  const first = reader(); await first.read(file); await first.flush();
  const cache = first.cacheFile(file);
  const initial = await fs.readFile(cache, 'utf8');
  now += 1000;
  await first.read(file); await first.flush();
  assert.equal(await fs.readFile(cache, 'utf8'), initial);
  now += WEEK - 2000;
  const warm = reader(); await warm.read(file); await warm.flush();
  assert.equal(warm.bytesRead, 0);
  now += WEEK - 1;
  const renewed = reader(); await renewed.read(file); await renewed.flush();
  assert.equal(renewed.bytesRead, 0);
  now += WEEK;
  const expired = reader(); await expired.read(file);
  assert.equal(expired.bytesRead, (await fs.stat(file)).size);
});

test('LRU eviction retains disk entries and cleanup touches only owned expired cache files', async t => {
  const { file, root, cacheDirectory, reader } = await fixture(t, { maxEntries: 1 });
  const other = path.join(root, 'other.jsonl'); await fs.copyFile(file, other);
  const first = reader(); await first.read(file); await first.read(other); await first.flush();
  assert.equal(first.entries.size, 1);
  const before = first.bytesRead; await first.read(file);
  assert.equal(first.bytesRead, before);
  const expired = path.join(cacheDirectory, 'a'.repeat(64) + '.json');
  const unrelated = path.join(cacheDirectory, 'keep.json');
  await fs.writeFile(expired, '{}'); await fs.writeFile(unrelated, '{}');
  const old = new Date(Date.now() - WEEK - 1000);
  await fs.utimes(expired, old, old); await fs.utimes(unrelated, old, old);
  await reader().flush();
  await assert.rejects(fs.stat(expired), { code: 'ENOENT' });
  assert.ok(await fs.stat(unrelated));
});

test('corrupt caches and replaced transcripts rebuild from the source', async t => {
  const { file, reader } = await fixture(t);
  const first = reader(); await first.read(file); await first.flush();
  await fs.writeFile(first.cacheFile(file), '{');
  const second = reader(); assert.deepEqual(await second.read(file), await summarizeSessionFile(file));
  assert.equal(second.bytesRead, (await fs.stat(file)).size); await second.flush();
  await fs.rename(file, file + '.old');
  await fs.writeFile(file, record({ type: 'session_meta', payload: { id: 'new-session' } }));
  const third = reader(); assert.equal((await third.read(file)).sessionId, 'new-session');
});
