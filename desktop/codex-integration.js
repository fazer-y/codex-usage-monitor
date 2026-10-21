'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function findCodexCli({ run = spawnSync, exists = fs.existsSync, env = process.env } = {}) {
  const found = run('where.exe', ['codex.exe'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const candidates = (found.stdout || '').trim().split(/\r?\n/);
  if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'));
  let executable = candidates.find(candidate => candidate && exists(candidate));
  if (!executable) {
    const installed = run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
      "Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -ExpandProperty InstallLocation"],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const root = (installed.stdout || '').trim();
    const bundled = root ? path.join(root, 'app', 'resources', 'codex.exe') : null;
    if (bundled && exists(bundled)) executable = bundled;
  }
  if (!executable) throw new Error('Codex CLI was not found. Install Codex and run this installer again.');
  return executable;
}

function installIntegration({ monitorExecutable = process.execPath,
  userData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Codex Usage Monitor'),
  codexCli, run = spawnSync } = {}) {
  const root = path.dirname(monitorExecutable);
  const source = path.join(root, 'resources', 'app.asar');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const compatibility = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
  const entry = path.join(source, 'desktop', 'mcp-server.js');
  if (!fs.existsSync(entry)) throw new Error('The packaged MCP server was not found.');
  const integration = path.join(userData, 'codex-plugin');
  const plugin = path.join(integration, 'plugin');
  fs.mkdirSync(path.join(integration, '.agents', 'plugins'), { recursive: true });
  fs.mkdirSync(path.join(plugin, '.codex-plugin'), { recursive: true });
  function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
  write(path.join(plugin, 'plugin.json'), manifest);
  write(path.join(plugin, '.codex-plugin', 'plugin.json'), compatibility);
  write(path.join(plugin, 'mcp.json'), { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { usage: {
    type: 'stdio', command: path.basename(monitorExecutable), args: [entry],
    env: { ELECTRON_RUN_AS_NODE: '1', PATH: root + path.delimiter + (process.env.PATH || '') },
  } } });
  write(path.join(integration, '.agents', 'plugins', 'marketplace.json'), {
    name: 'codex-usage-monitor-local', plugins: [{ name: manifest.name,
      source: { source: 'local', path: './plugin' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
    }],
  });
  const executable = codexCli || findCodexCli();
  for (const args of [
    ['plugin', 'marketplace', 'add', integration, '--json'],
    ['plugin', 'add', 'codex-usage-monitor@codex-usage-monitor-local', '--json'],
  ]) {
    const result = run(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Codex plugin registration failed.').trim());
  }
  return { plugin: 'codex-usage-monitor@codex-usage-monitor-local', root: integration };
}

function removeIntegration({ configFile = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'),
  codexCli, run = spawnSync } = {}) {
  if (!fs.existsSync(configFile)) return { removed: false };
  const config = require('smol-toml').parse(fs.readFileSync(configFile, 'utf8'));
  const plugin = 'codex-usage-monitor@codex-usage-monitor-local';
  const commands = [];
  if (config.plugins?.[plugin]) commands.push(['plugin', 'remove', plugin, '--json']);
  if (config.marketplaces?.['codex-usage-monitor-local']) commands.push(['plugin', 'marketplace', 'remove', 'codex-usage-monitor-local', '--json']);
  if (!commands.length) return { removed: false };
  const executable = codexCli || findCodexCli();
  for (const args of commands) {
    const result = run(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Codex plugin removal failed.').trim());
  }
  return { removed: true };
}

if (require.main === module) {
  try {
    if (process.argv.includes('--remove')) {
      removeIntegration();
      console.log('Codex Usage Monitor plugin disconnected.');
    } else {
      const result = installIntegration();
      console.log('Installed ' + result.plugin + '. Restart Codex to connect it.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { installIntegration, removeIntegration, findCodexCli };
