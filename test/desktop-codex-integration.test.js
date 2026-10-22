'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { installIntegration, removeIntegration, findCodexCli } = require('../desktop/codex-integration');
const root = path.join(__dirname, '..');

test('Codex registration creates a small plugin that reuses installed binaries', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-plugin-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const installed = path.join(folder, 'Installed App');
  const userData = path.join(folder, 'User Data');
  fs.mkdirSync(path.join(installed, 'app', 'desktop'), { recursive: true });
  fs.mkdirSync(path.join(installed, '.codex-plugin'), { recursive: true });
  for (const name of ['plugin.json', '.codex-plugin/plugin.json']) fs.copyFileSync(path.join(root, name), path.join(installed, name));
  const executable = path.join(installed, 'Codex Usage Monitor.exe');
  fs.writeFileSync(executable, 'application');
  fs.writeFileSync(path.join(installed, 'app', 'desktop', 'mcp-server.js'), 'server');
  fs.mkdirSync(userData);
  fs.writeFileSync(path.join(userData, 'window-state.json'), '{"folded":true}');
  const calls = [];
  const options = { monitorExecutable: executable, userData, codexCli: 'codex.exe',
    run: (command, args) => { calls.push({ command, args }); return { status: 0 }; } };
  const result = installIntegration(options);
  assert.equal(result.plugin, 'codex-usage-monitor@codex-usage-monitor-local');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'codex.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['plugin', 'marketplace', 'add']);
  assert.deepEqual(calls[1].args, ['plugin', 'add', result.plugin, '--json']);
  const config = JSON.parse(fs.readFileSync(path.join(result.root, 'plugin', 'mcp.json'), 'utf8'));
  assert.equal(config.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.equal(config.mcpServers.usage.command, path.basename(executable));
  assert.ok(config.mcpServers.usage.env.PATH.startsWith(installed + path.delimiter));
  assert.equal(config.mcpServers.usage.env?.ELECTRON_RUN_AS_NODE, undefined);
  assert.deepEqual(config.mcpServers.usage.args, ['--mcp']);
  assert.deepEqual(fs.readdirSync(path.join(result.root, 'plugin')).sort(), ['.codex-plugin', 'mcp.json', 'plugin.json']);
  installIntegration(options);
  assert.equal(calls.length, 4);
  assert.equal(fs.readFileSync(path.join(userData, 'window-state.json'), 'utf8'), '{"folded":true}');
});

test('setup finds Codex on PATH or through its Windows app package without machine-specific paths', () => {
  const calls = [];
  const fromPath = path.join('runtime', 'codex.exe');
  assert.equal(findCodexCli({ env: {}, exists: file => file === fromPath,
    run: command => { calls.push(command); return { stdout: fromPath + '\n' }; } }), fromPath);
  assert.deepEqual(calls, ['where.exe']);
  const bundled = path.join('store-package', 'app', 'resources', 'codex.exe');
  assert.equal(findCodexCli({ env: {}, exists: file => file === bundled,
    run: command => ({ stdout: command === 'powershell.exe' ? 'store-package\n' : '' }) }), bundled);
});

test('plugin metadata stays aligned with the packaged runtime', () => {
  const pkg = require('../package.json');
  const manifest = require('../plugin.json');
  const compatibility = require('../.codex-plugin/plugin.json');
  const config = require('../mcp.json');
  assert.equal(manifest.version, pkg.version);
  assert.equal(compatibility.version, pkg.version);
  assert.equal(manifest.extensions['com.openai'].requires_local_executor, true);
  assert.equal(config.mcpServers.usage.env?.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(config.mcpServers.usage.command, './Codex Usage Monitor.exe');
  assert.equal(compatibility.mcpServers, './mcp.json');
});

test('disconnect removes only this plugin and marketplace through Codex CLI', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-disconnect-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const configFile = path.join(folder, 'config.toml');
  fs.writeFileSync(configFile, '[plugins."codex-usage-monitor@codex-usage-monitor-local"]\nenabled=true\n[plugins.other]\nenabled=true\n[marketplaces.codex-usage-monitor-local]\nsource="local"\n');
  const calls = [];
  const run = (command, args) => { calls.push({ command, args }); return { status: 0 }; };
  assert.equal(removeIntegration({ configFile, codexCli: 'codex.exe', run }).removed, true);
  assert.deepEqual(calls.map(call => call.args), [
    ['plugin', 'remove', 'codex-usage-monitor@codex-usage-monitor-local', '--json'],
    ['plugin', 'marketplace', 'remove', 'codex-usage-monitor-local', '--json'],
  ]);
  fs.writeFileSync(configFile, '[plugins.other]\nenabled=true\n');
  assert.equal(removeIntegration({ configFile, codexCli: 'codex.exe', run }).removed, false);
  assert.equal(calls.length, 2);
});
