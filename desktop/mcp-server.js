'use strict';

const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema,
  McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { monitorAddress, connectMonitor } = require('./monitor-bridge');
const { version } = require('../package.json');

function createMcpServer({ getConnection, onClose = () => {} }) {
  const server = new Server({ name: 'codex-usage-monitor', version }, { capabilities: { tools: {}, resources: {} } });
  server.oninitialized = () => { getConnection().catch(error => console.error('Monitor startup: ' + error.message)); };
  server.onclose = onClose;
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{
    name: 'get_usage', description: 'Read live statistics for the current Codex desktop conversation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }] }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    if (request.params.name !== 'get_usage') throw new McpError(ErrorCode.InvalidParams, 'Unknown usage tool.');
    const connection = await getConnection();
    const snapshot = await connection.request('snapshot');
    return { content: [{ type: 'text', text: JSON.stringify(snapshot) }], structuredContent: snapshot || {} };
  });
  return server;
}

async function main() {
  const userData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Codex Usage Monitor');
  const address = monitorAddress(userData);
  let connection = null;
  let connecting = null;
  let stopped = false;
  async function getConnection() {
    if (connection && !connection.closed) return connection;
    if (connecting) return connecting;
    connecting = (async () => {
      try { connection = await connectMonitor(address); }
      catch {
        if (stopped) throw new Error('MCP connection closed.');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(process.execPath, ['--managed'], { env, detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', error => console.error('Monitor process: ' + error.message));
        child.unref();
        const deadline = Date.now() + 10000;
        while (!stopped && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try { connection = await connectMonitor(address); break; } catch {}
        }
      }
      if (stopped || !connection || connection.closed) throw new Error('Monitor did not become ready.');
      await connection.request('attach');
      return connection;
    })().finally(() => { connecting = null; });
    return connecting;
  }
  function closeConnection() { stopped = true; connection?.close(); }
  const server = createMcpServer({ getConnection, onClose: closeConnection });
  process.stdin.once('end', closeConnection);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { closeConnection(); server.close(); });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { createMcpServer };
