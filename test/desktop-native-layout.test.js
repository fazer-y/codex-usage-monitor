'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('native icon centers stay fixed during rotation and details use a working thin scrollbar', {
  skip: process.platform !== 'win32', timeout: 30000,
}, t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-layout-'));
  t.after(() => { assert.match(path.basename(folder), /^cum-layout-/); fs.rmSync(folder, { recursive: true, force: true }); });
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const wpf = path.join(path.dirname(compiler), 'WPF');
  const executable = path.join(folder, 'VisualLayoutChecks.exe');
  const root = path.join(__dirname, '..');
  const compiled = spawnSync(compiler, ['/nologo', '/target:exe', '/main:VisualLayoutChecks', '/out:' + executable,
    ...['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll'].map(name => '/r:' + path.join(wpf, name)),
    '/r:System.Xaml.dll', '/r:System.Web.Extensions.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
    ...['desktop/native/NativeLauncher.cs', 'desktop/native/MonitorWindow.cs', 'test/native/VisualLayoutChecks.cs'].map(name => path.join(root, name)),
  ], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const checked = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});
