'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { buildNative, compile } = require('./build-native');
const { runtimeFiles } = require('./install-plugin');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const setupName = 'antigravity-usage-monitor-setup-windows-x64.exe';

buildNative();
fs.mkdirSync(dist, { recursive: true });
const work = fs.mkdtempSync(path.join(dist, '.package-'));
try {
  const archive = path.join(work, 'payload.zip');
  const zip = spawnSync('tar.exe', ['-a', '-cf', archive, '-C', root,
    ...runtimeFiles, 'desktop/install-plugin.js', 'plugin/plugin.json'],
  { stdio: 'inherit', windowsHide: true });
  if (zip.error) throw zip.error;
  if (zip.status !== 0) throw new Error('Could not package the installer payload.');

  const setup = path.join(work, setupName);
  compile(setup, ['/target:winexe', '/r:System.Windows.Forms.dll',
    '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll',
    '/resource:' + archive + ',UsageMonitor.zip'], ['Setup.cs']);
  const sha256 = createHash('sha256').update(fs.readFileSync(setup)).digest('hex');
  fs.renameSync(setup, path.join(dist, setupName));
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sha256 + '  ' + setupName + '\n');
  console.log(path.join(dist, setupName));
} finally {
  if (path.dirname(fs.realpathSync(work)) === fs.realpathSync(dist)) {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
