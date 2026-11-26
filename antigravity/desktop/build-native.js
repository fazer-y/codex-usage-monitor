'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const native = path.join(__dirname, 'native');
const bin = path.join(native, 'bin');
const executable = path.join(bin, 'Antigravity Usage Monitor.exe');

function frameworkDirectory() {
  return path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
}

function compile(output, options, sources) {
  const compiler = path.join(frameworkDirectory(), 'csc.exe');
  const args = ['/nologo', '/optimize+', '/platform:x64', '/out:' + output,
    ...options, ...sources.map(file => path.join(native, file))];
  const result = spawnSync(compiler, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Native build failed.');
}

function buildNative() {
  if (process.platform !== 'win32') throw new Error('The native statistics bar requires Windows.');
  const wpf = path.join(frameworkDirectory(), 'WPF');
  fs.mkdirSync(bin, { recursive: true });
  compile(path.join(bin, 'window-observer.exe'), ['/target:exe'], ['WindowObserver.cs']);
  compile(executable, ['/target:winexe', '/main:NativeLauncher', '/win32manifest:' + path.join(native, 'monitor.manifest'),
    ...['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll'].map(name => '/r:' + path.join(wpf, name)),
    '/r:System.Xaml.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll'],
  ['NativeLauncher.cs', 'MonitorWindow.cs']);
  return executable;
}

if (require.main === module) console.log(buildNative());

module.exports = { buildNative, compile, executable };
