'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { summarizeSessionFile } = require('../lib/session');
const { modelInfo, sessionCost, costForUsage } = require('../lib/pricing');
const { formatMonitor, clipCells } = require('../lib/format');
const cli = path.resolve(__dirname, '../bin/codex-usage-monitor.js');
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
  for (const id of ['gpt-5.50', 'gpt-5.4-mini-future', 'custom-gpt-5.5', 'gpt-5.5-pro', 'gpt-5.3', 'gpt-6-astra-unknown']) {
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
test('all styles preview and terminal text is bounded and sanitized', async () => {
  const s = await summarizeSessionFile(fixture);
  const { STYLES } = require('../lib/config');
  for (const style of STYLES) {
    const output = formatMonitor(s, { style, color: false, columns: 161, rows: 6 });
    assert.match(output, new RegExp('\\[' + style + '\\]'));
    assert.match(output, /API 等价估算/);
    assert.ok(output.split('\n').length <= 6);
  }
  assert.equal(clipCells('中ab', 3), '中a');
  assert.equal(clipCells('a\u001bb\nc', 20), 'abc');
});
test('config persists styles, backs up prior config, rejects invalid changes', t => {
  const file = path.join(temp(t), 'config.json');
  const env = { ...process.env, CODEX_USAGE_MONITOR_CONFIG: file };
  const run = args => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  assert.equal(run(['config', '--style', 'minimal']).status, 0);
  assert.equal(run(['config', '--style', 'detailed']).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(file)).style, 'detailed');
  const backup = fs.readdirSync(path.dirname(file)).find(x => x.includes('.bak-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(file), backup))).style, 'minimal');
  assert.equal(run(['config', '--style', 'typo']).status, 1);
  assert.equal(JSON.parse(fs.readFileSync(file)).style, 'detailed');
  const preview = run(['preview', '--file', fixture]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /\[ascii\]/);
  assert.match(preview.stdout, /\[detailed\]/);
});
test('watch survives multiple intervals and rereads appended usage', { timeout: 10000 }, async t => {
  const dir = temp(t);
  const file = path.join(dir, 'session.jsonl');
  fs.copyFileSync(fixture, file);
  const child = spawn(process.execPath, [cli, 'watch', '--interval', '1', '--file', file, '--no-color'], {
    env: { ...process.env, CODEX_USAGE_MONITOR_CONFIG: path.join(dir, 'config.json') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let output = '', error = '';
  child.stderr.on('data', chunk => { error += chunk; });
  let frames = 0;
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error('watch exited early: ' + code + ' ' + error)));
    child.stdout.on('data', chunk => {
      output += chunk;
      frames = output.split('\n').length - 1;
      if (frames === 1) {
        const next = structuredClone(records().at(-1));
        for (const key of Object.keys(next.payload.info.total_token_usage)) next.payload.info.total_token_usage[key] += next.payload.info.last_token_usage[key];
        fs.appendFileSync(file, JSON.stringify(next) + '\n');
      }
      if (frames >= 3) resolve();
    });
  });
  assert.equal(child.exitCode, null);
  assert.match(output, /Σ in 3\.4k/);
  assert.doesNotMatch(output, /\x1b\[/);
  child.kill();
});
test('watch waits for a missing session file and later sees it', { timeout: 10000 }, async t => {
  const dir = temp(t), file = path.join(dir, 'later.jsonl');
  const child = spawn(process.execPath, [cli, 'watch', '--interval', '1', '--file', file, '--no-color'], {
    env: { ...process.env, CODEX_USAGE_MONITOR_CONFIG: path.join(dir, 'config.json') },
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error('premature exit ' + code)));
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('waiting')) fs.copyFileSync(fixture, file);
      if (String(chunk).includes('GPT-5.4 mini')) resolve();
    });
  });
  child.kill();
});
