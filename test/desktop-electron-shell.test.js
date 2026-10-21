'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Electron main process uses a secure local renderer configuration', () => {
  const source = read('desktop/main.js');

  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /loadFile/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test('preload exposes only the usage monitor IPC bridge', () => {
  const source = read('desktop/preload.js');

  assert.match(source, /contextBridge\.exposeInMainWorld\('codexUsageMonitor'/);
  assert.match(source, /usage:getSnapshot/);
  assert.match(source, /usage:refresh/);
  assert.match(source, /usage:snapshot/);
  assert.doesNotMatch(source, /require\('node:fs'\)/);
});

test('desktop packaging config includes Windows targets and local files', () => {
  const config = JSON.parse(read('desktop/electron-builder.json'));

  assert.equal(config.appId, 'dev.codex-usage-monitor.desktop');
  assert.equal(config.extraMetadata.main, 'desktop/main.js');
  assert.equal(config.win.signExecutable, false);
  assert.deepEqual(config.win.target, ['nsis']);
  assert.equal(config.nsis.oneClick, true);
  assert.equal(config.files.includes('desktop/**/*'), true);
  assert.equal(config.files.includes('lib/**/*'), true);
});

test('package scripts separate unpacked packaging from installer distribution', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.match(pkg.scripts.desktop, /electron desktop\/main\.js/);
  assert.match(pkg.scripts['desktop:package'], /electron-builder --dir/);
  assert.match(pkg.scripts['desktop:dist'], /electron-builder --config desktop\/electron-builder\.json/);
});

test('tray icon asset exists', () => {
  const bytes = fs.readFileSync(path.join(root, 'desktop/assets/tray.png'));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
