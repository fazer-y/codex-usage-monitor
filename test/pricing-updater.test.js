'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseOfficialPrices, createStartupPricing } = require('../desktop/pricing-updater');
const { BUILTIN_BOOK, applyPriceBook, modelInfo, costForUsage, pricingMetadata } = require('../lib/pricing');
const { SessionReader } = require('../desktop/session-reader');

const checkedAt = '2026-10-21T02:00:00.000Z';
const document = `# Pricing
### Standard pricing data
| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Long context input | Long context output | Long context cached input | Long context 30m write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6.1-sol | $3.00 | $12.00 | $0.15 | $3.75 | $7.00 | $19.00 | $0.35 | $8.75 |
| gpt-5.5 (<272K context length) | $5.00 | $30.00 | $0.50 | - | $10.00 | $45.00 | $1.00 | - |

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5.4-mini | $0.75 | $4.50 | $0.075 |
| gpt-9.9-test | $1.00 | $2.00 | $0.10 |
### Batch pricing data
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6.1-sol | $999.00 | $999.00 | $999.00 |
#### Flex
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6.1-sol | $888.00 | $888.00 | $888.00 |
### Fast pricing data
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6.1-sol | $777.00 | $777.00 | $777.00 |
Long context: >272K input tokens.
Specialized models
Standard
### Grouped Pricing Table data
| Category | Model | Input | Output | Cached input |
| --- | --- | --- | --- | --- |
| Codex | gpt-5.3-codex | $1.75 | $14.00 | $0.175 |
| Embedding | text-embedding-3-small | $0.02 | - | - |
Fast
### Grouped Pricing Table data
| Category | Model | Input | Output | Cached input |
| --- | --- | --- | --- | --- |
| Codex | gpt-5.3-codex | $999.00 | $999.00 | $999.00 |
`;

function setup(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-pricing-'));
  t.after(() => {
    applyPriceBook(BUILTIN_BOOK);
    assert.equal(path.dirname(folder), os.tmpdir());
    assert.match(path.basename(folder), /^usage-pricing-/);
    fs.rmSync(folder, { recursive: true, force: true });
  });
  return path.join(folder, 'pricing.json');
}

test('official document parsing selects Standard prices and exact model IDs across tables', () => {
  const book = parseOfficialPrices(document, checkedAt);
  const sol = book.models.find(model => model.key === 'gpt-6.1-sol');
  assert.equal(sol.name, 'GPT-6.1 Sol');
  assert.equal(sol.input, 3);
  assert.equal(sol.cachedInput, 0.15);
  assert.equal(sol.cacheWrite, 3.75);
  assert.equal(sol.longRates.input, 7);
  assert.equal(sol.longRates.output, 19);
  assert.equal(book.models.find(model => model.key === 'gpt-5.3-codex').input, 1.75);
  assert.equal(book.models.find(model => model.key === 'gpt-5.5').cachedInput, 0.5);
  assert.equal(book.models.some(model => model.key.includes('(')), false);
  assert.equal(book.models.some(model => model.key.startsWith('text-embedding')), false);
});

test('unrecognized units, context thresholds, or incomplete tables reject the update', () => {
  for (const text of [document.replace('$3.00', '3.00 EUR'),
    document.replace('>272K input tokens', '>400K input tokens'),
    document.replace('gpt-5.4-mini', 'missing-model'), document.replace('### Standard pricing data', '### Batch only')]) {
    assert.throws(() => parseOfficialPrices(text, checkedAt));
  }
});

test('startup checks once, caches successful prices, and sends conditional requests next time', async t => {
  const file = setup(t);
  let calls = 0;
  const updater = createStartupPricing({ file, now: () => checkedAt, fetch: async (url, options) => {
    calls++;
    assert.equal(url, BUILTIN_BOOK.source + '.md');
    assert.equal(options.credentials, 'omit');
    return new Response(document, { headers: { etag: '"prices-v1"' } });
  } });
  assert.equal(await updater.load(), false);
  const first = updater.refresh();
  assert.strictEqual(updater.refresh(), first);
  assert.equal((await first).status, 'current');
  assert.equal(calls, 1);
  assert.equal(modelInfo('gpt-6.1-sol').input, 3);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).etag, '"prices-v1"');
  assert.equal(fs.existsSync(file + '.tmp'), false);
  const next = createStartupPricing({ file, now: () => '2026-10-22T02:00:00.000Z', fetch: async (_url, options) => {
    assert.equal(options.headers['If-None-Match'], '"prices-v1"');
    return new Response(null, { status: 304 });
  } });
  await next.load();
  assert.equal((await next.refresh()).status, 'current');
  assert.equal(pricingMetadata().verifiedAt, '2026-10-22');
  assert.equal(modelInfo('gpt-6.1-sol').input, 3);
});

test('offline or malformed refreshes preserve the last valid cache and verification date', async t => {
  const file = setup(t);
  const cache = JSON.stringify({ book: parseOfficialPrices(document, checkedAt), etag: '"valid"' });
  fs.writeFileSync(file, cache);
  for (const response of [() => { throw new Error('offline'); }, () => new Response('bad markdown'),
    () => new Response('unavailable', { status: 503 }), () => new Response('x'.repeat(256 * 1024 + 1))]) {
    const updater = createStartupPricing({ file, fetch: async () => response() });
    await updater.load();
    assert.equal((await updater.refresh()).status, 'cached');
    assert.equal(fs.readFileSync(file, 'utf8'), cache);
    assert.equal(pricingMetadata().verifiedAt, '2026-10-21');
    assert.equal(modelInfo('gpt-6.1-sol').input, 3);
  }
});

test('corrupt caches fall back to bundled prices and timeouts abort their single request', async t => {
  const file = setup(t);
  fs.writeFileSync(file, 'incomplete');
  let requests = 0;
  const updater = createStartupPricing({ file, timeoutMs: 5, fetch: (_url, { signal }) => {
    requests++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  assert.equal(await updater.load(), false);
  assert.equal((await updater.refresh()).status, 'bundled');
  assert.equal(requests, 1);
  assert.equal(modelInfo('gpt-6.1-sol').input, 2);
});

test('shutdown aborts an outstanding refresh without replacing prices or writing a cache', async t => {
  const file = setup(t);
  const updater = createStartupPricing({ file, fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('closed')), { once: true });
  }) });
  const task = updater.refresh();
  updater.close();
  assert.equal((await task).updated, false);
  assert.equal(fs.existsSync(file), false);
  assert.equal((await updater.refresh()).updated, false);
});

test('price changes reprice retained request tokens without rereading session bytes', async t => {
  const file = setup(t);
  fs.copyFileSync(path.join(__dirname, 'fixtures/session-basic.jsonl'), file);
  const reader = new SessionReader();
  const before = await reader.read(file);
  const bytes = reader.bytesRead;
  const next = structuredClone(BUILTIN_BOOK);
  for (const model of next.models) {
    for (const rates of [model, model.longRates].filter(Boolean)) {
      for (const key of ['input', 'cachedInput', 'cacheWrite', 'output']) if (rates[key] != null) rates[key] *= 2;
    }
  }
  applyPriceBook(next);
  const after = await reader.read(file);
  assert.equal(after.cost.usd, before.cost.usd * 2);
  assert.deepEqual(after.totalUsage, before.totalUsage);
  assert.equal(reader.bytesRead, bytes);
  assert.strictEqual(await reader.read(file), after);
  applyPriceBook(parseOfficialPrices(document, checkedAt));
  assert.equal(costForUsage('gpt-6.1-sol', { inputTokens: 300000, outputTokens: 1000 }), 2.119);
});

test('newly priced models gain estimates from retained request tokens without replaying logs', async t => {
  const file = setup(t);
  const usage = { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 };
  fs.writeFileSync(file, [
    { type: 'session_meta', payload: { id: 'historical' } },
    { type: 'turn_context', payload: { turn_id: 't', model: 'gpt-9.9-test' } },
    { type: 'token_usage_record', payload: { turn_id: 't', usage, thread_token_usage: usage } },
  ].map(record => JSON.stringify(record)).join('\n'));
  const reader = new SessionReader();
  assert.equal((await reader.read(file)).cost.complete, false);
  const bytes = reader.bytesRead;
  applyPriceBook(parseOfficialPrices(document, checkedAt));
  const result = await reader.read(file);
  assert.equal(result.cost.complete, true);
  assert.ok(Math.abs(result.cost.usd - 0.0012) < 1e-12);
  assert.equal(reader.bytesRead, bytes);
});

test('repricing keeps multiple short requests separate from a long request in the same model', async t => {
  const file = setup(t);
  const records = [{ type: 'session_meta', payload: { id: 'mixed-tiers' } },
    { type: 'turn_context', payload: { turn_id: 't', model: 'gpt-6.1-sol' } }];
  let input = 0;
  let cached = 0;
  let output = 0;
  for (const tokens of [150000, 150000, 300000]) {
    const reads = tokens === 300000 ? 200000 : 100000;
    input += tokens; cached += reads; output += 1000;
    records.push({ type: 'token_usage_record', payload: { turn_id: 't',
      usage: { input_tokens: tokens, cached_input_tokens: reads, output_tokens: 1000, total_tokens: tokens + 1000 },
      thread_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output },
    } });
  }
  fs.writeFileSync(file, records.map(record => JSON.stringify(record)).join('\n'));
  const reader = new SessionReader();
  assert.ok(Math.abs((await reader.read(file)).cost.usd - 0.695) < 1e-12);
  const bytes = reader.bytesRead;
  applyPriceBook(parseOfficialPrices(document, checkedAt));
  const result = await reader.read(file);
  assert.ok(Math.abs(result.cost.usd - 1.143) < 1e-12);
  assert.equal(result.requestCount, 3);
  assert.equal(result.totalUsage.inputTokens, 600000);
  assert.equal(reader.bytesRead, bytes);
});
