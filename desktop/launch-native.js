'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const child = spawn(path.join(__dirname, 'native/bin/Codex Usage Monitor.exe'), process.argv.slice(2), {
  stdio: 'ignore', detached: true, windowsHide: false,
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.unref();
