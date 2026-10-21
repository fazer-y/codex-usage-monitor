'use strict';

const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = require('../desktop/mcp-server');
const { monitorAddress, createMonitorBridge, connectMonitor } = require('../desktop/monitor-bridge');

test('MCP initializes, lists its read-only tool, and returns live usage through the SDK', async t => {
  let snapshot = { status: 'ready', title: 'GPT-6.1 Sol', metrics: [{ kind: 'speed', value: '35.0 token/s' }] };
  let starts = 0;
  let closed = 0;
  const server = createMcpServer({ getConnection: async () => { starts++; return { request: async () => snapshot }; }, onClose: () => closed++ });
  const client = new Client({ name: 'usage-monitor-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(() => { client.close(); server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  assert.equal(starts, 1);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'get_usage');
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.deepEqual((await client.listResources()).resources, []);
  assert.deepEqual((await client.listResourceTemplates()).resourceTemplates, []);
  assert.deepEqual((await client.callTool({ name: 'get_usage', arguments: {} })).structuredContent, snapshot);
  snapshot = { ...snapshot, title: 'GPT-6 Luna', metrics: [] };
  assert.deepEqual((await client.callTool({ name: 'get_usage', arguments: {} })).structuredContent, snapshot);
  await assert.rejects(client.callTool({ name: 'unknown', arguments: {} }), /Unknown usage tool/);
  await client.close();
  assert.equal(closed, 1);
});

test('local bridge shares fresh snapshots and tracks independent MCP connections', async t => {
  const address = monitorAddress(path.join(os.tmpdir(), 'usage-monitor-test-' + process.pid + '-' + Date.now()));
  const events = new EventEmitter();
  const counts = [];
  let snapshot = { status: 'ready', title: 'First conversation' };
  const bridge = createMonitorBridge({ address, getSnapshot: async () => snapshot,
    onConnectionsChanged: count => { counts.push(count); events.emit('count', count); } });
  await bridge.listen();
  t.after(() => bridge.close());
  const first = await connectMonitor(address);
  const second = await connectMonitor(address);
  t.after(() => { first.close(); second.close(); });
  assert.deepEqual(await first.request('attach'), snapshot);
  await first.request('attach');
  await second.request('attach');
  assert.deepEqual(counts, [1, 2]);
  snapshot = { status: 'ready', title: 'Second conversation' };
  assert.deepEqual(await first.request('snapshot'), snapshot);
  await assert.rejects(first.request('unknown'), /Unknown bridge request/);
  const firstClosed = once(events, 'count');
  first.close();
  assert.deepEqual(await firstClosed, [1]);
  assert.deepEqual(await second.request('snapshot'), snapshot);
  const secondClosed = once(events, 'count');
  second.close();
  assert.deepEqual(await secondClosed, [0]);
  assert.deepEqual(counts, [1, 2, 1, 0]);
});

test('Windows bridge addresses share the user profile without exposing its path', () => {
  const first = monitorAddress('./Example/Profile/Codex Usage Monitor', 'win32');
  const second = monitorAddress('./example/profile/codex usage monitor', 'win32');
  assert.equal(first, second);
  assert.ok(first.startsWith('\\\\.\\pipe\\codex-usage-monitor-'));
  assert.doesNotMatch(first, /Example|AppData/);
});

test('a missing monitor rejects connection without an unhandled stream error', async () => {
  const address = monitorAddress(path.join(os.tmpdir(), 'missing-monitor-' + process.pid + '-' + Date.now()));
  await assert.rejects(connectMonitor(address), /ENOENT|ECONNREFUSED/);
  await new Promise(resolve => setImmediate(resolve));
});
