'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform === 'win32') {
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const output = path.join(__dirname, 'native', 'bin', 'window-observer.exe');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${output}`,
    path.join(__dirname, 'native', 'WindowObserver.cs')], { encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  const wpf = path.join(path.dirname(compiler), 'WPF');
  const gui = spawnSync(compiler, ['/nologo', '/optimize+', '/target:winexe', '/main:NativeLauncher',
    `/out:${path.join(__dirname, 'native', 'bin', 'Codex Usage Monitor.exe')}`,
    `/win32manifest:${path.join(__dirname, 'native', 'monitor.manifest')}`,
    `/win32icon:${path.join(__dirname, 'assets', 'icon.ico')}`,
    ...['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll'].map(name => `/r:${path.join(wpf, name)}`),
    '/r:System.Xaml.dll', '/r:System.Web.Extensions.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
    path.join(__dirname, 'native', 'NativeLauncher.cs'), path.join(__dirname, 'native', 'MonitorWindow.cs')],
  { encoding: 'utf8', windowsHide: true });
  if (gui.stdout) process.stdout.write(gui.stdout);
  if (gui.stderr) process.stderr.write(gui.stderr);
  if (gui.error) throw gui.error;
  if (gui.status !== 0) process.exit(gui.status || 1);
}
