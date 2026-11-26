'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const manifest = require('../plugin/plugin.json');

const project = path.join(__dirname, '..');
const profile = path.join(os.homedir(), '.gemini', 'config');
const sidecarName = 'usage_bar';
const runtimeFiles = [
  'desktop/native/bin/Antigravity Usage Monitor.exe',
  'desktop/native/bin/window-observer.exe',
  'desktop/run.js',
  'desktop/native-main.js',
  'desktop/docking.js',
  'desktop/window-observer.js',
  'desktop/presentation.js',
  'lib/protobuf.js',
  'lib/generation.js',
  'lib/window-selection.js',
  'lib/session-store.js',
  'web/index.html',
  'web/details.js',
  'LICENSE',
];

function replaceFile(file, content) {
  const temp = file + '.install-' + process.pid;
  try {
    fs.writeFileSync(temp, content, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function enablePlugin(configPath) {
  const original = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(original.replace(/^\uFEFF/, ''));
  config.plugins ??= {};
  config.sidecars ??= {};
  const id = manifest.name + '/' + sidecarName;
  if (config.plugins[manifest.name]?.enabled === true && config.sidecars[id]?.enabled === true) return;
  config.plugins[manifest.name] = { ...config.plugins[manifest.name], enabled: true };
  config.sidecars[id] = { ...config.sidecars[id], enabled: true };
  const temp = configPath + '.usage-monitor-' + process.pid;
  try {
    fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    if (fs.readFileSync(configPath, 'utf8') !== original) throw new Error('Antigravity changed its configuration. Run the installer again.');
    fs.renameSync(temp, configPath);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function install(prebuilt) {
  if (process.platform !== 'win32') throw new Error('The native statistics bar requires Windows.');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required.');
  const configPath = path.join(profile, 'config.json');
  if (!fs.existsSync(configPath)) throw new Error('Open Antigravity Desktop once before installing.');
  if (!prebuilt) require('./build-native').buildNative();
  const plugins = path.join(profile, 'plugins');
  const destination = path.join(plugins, manifest.name);
  const originalManifest = path.join(destination, 'plugin.json');
  const upgrading = fs.existsSync(destination);
  if (upgrading && (!fs.existsSync(originalManifest) || JSON.parse(fs.readFileSync(originalManifest, 'utf8')).name !== manifest.name)) {
    throw new Error('The plugin directory is already in use.');
  }
  const sidecar = path.join(destination, 'sidecars', sidecarName);
  const hash = createHash('sha256');
  for (const file of runtimeFiles) hash.update(file).update(fs.readFileSync(path.join(project, file)));
  const revision = 'runtime-' + hash.digest('hex').slice(0, 12);
  const runtime = path.join(sidecar, revision);
  fs.mkdirSync(sidecar, { recursive: true });
  const staging = fs.mkdtempSync(path.join(sidecar, '.install-'));
  const descriptor = path.join(sidecar, 'sidecar.json');
  const previous = fs.existsSync(descriptor) ? fs.readFileSync(descriptor) : null;
  let published = false;
  try {
    // A new runtime can be staged while Windows still has files from the earlier build open.
    if (!fs.existsSync(runtime)) {
      for (const file of runtimeFiles) {
        const target = path.join(staging, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(project, file), target);
      }
      fs.renameSync(staging, runtime);
    }
    replaceFile(descriptor, JSON.stringify({
      command: 'node',
      args: [revision + '/desktop/run.js'],
      display_name: 'Usage Monitor',
      description: 'A compact title bar and detailed conversation usage.',
      restart_policy: 'on-failure',
      has_web_ui: true,
      agent_permissions: { allows_user_interactions: false },
      ui_config: { display_name: 'Usage Monitor', views: [
        { path: '/', entrypoint: 'SIDECAR_UI_ENTRYPOINT_SIDEBAR', title: 'Usage Monitor' },
        { path: '/', entrypoint: 'SIDECAR_UI_ENTRYPOINT_AUX_PANE', title: 'Usage Monitor' },
      ] },
    }, null, 2) + '\n');
    published = true;
    replaceFile(originalManifest, fs.readFileSync(path.join(project, 'plugin', 'plugin.json')));
    enablePlugin(configPath);
  } catch (error) {
    if (published && previous) replaceFile(descriptor, previous);
    else if (published) fs.rmSync(descriptor, { force: true });
    throw error;
  } finally {
    if (fs.existsSync(staging) && path.dirname(fs.realpathSync(staging)) === fs.realpathSync(sidecar)) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  console.log('Installed Usage Monitor. Reopen Antigravity to start the bar.');
}

if (require.main === module) {
  try {
    install(process.argv.includes('--prebuilt'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { runtimeFiles };
