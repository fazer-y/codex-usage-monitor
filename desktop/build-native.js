'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform === 'win32') {
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const output = path.join(__dirname, 'native', 'bin', 'window-observer.exe');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${output}`,
    path.join(__dirname, 'native', 'WindowObserver.cs')], { encoding: 'utf8', windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
