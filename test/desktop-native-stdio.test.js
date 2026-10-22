'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { createMonitorBridge, monitorAddress } = require('../desktop/monitor-bridge');
const executable = path.join(__dirname, '../desktop/native/bin/Codex Usage Monitor.exe');

test('native launcher forwards small MCP frames immediately and exits on stdin EOF', {
  skip: process.platform !== 'win32' || !fs.existsSync(executable), timeout: 15000,
}, async t => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-stdio-'));
  const bridge = createMonitorBridge({ address: monitorAddress(userData), getSnapshot: async () => ({ status: 'ready', title: 'Fixture conversation' }) });
  await bridge.listen();
  const child = spawn(executable, ['--mcp'], { windowsHide: true, env: { ...process.env,
    CODEX_USAGE_MONITOR_USER_DATA: userData, CODEX_USAGE_MONITOR_NODE: process.execPath } });
  t.after(() => { child.kill(); bridge.close(); assert.match(path.basename(userData), /^cum-stdio-/); fs.rmSync(userData, { recursive: true, force: true }); });
  let error = '';
  child.stderr.on('data', data => { error += data; });
  const lines = readline.createInterface({ input: child.stdout });
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  let response = once(lines, 'line');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'stdio-test', version: '1' } } });
  assert.equal(JSON.parse((await response)[0]).id, 1, error);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  response = once(lines, 'line');
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_usage', arguments: {} } });
  assert.equal(JSON.parse((await response)[0]).result.structuredContent.title, 'Fixture conversation', error);
  const exited = once(child, 'exit');
  child.stdin.end();
  assert.equal((await exited)[0], 0, error);
});
