'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function observeCodexWindow(onChange, onError) {
  if (process.platform !== 'win32') return { close() {} };
  const child = spawn(path.join(__dirname, 'native', 'bin', 'window-observer.exe'), [], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = readline.createInterface({ input: child.stdout });
  let closing = false;
  lines.on('line', line => {
    try { onChange(JSON.parse(line)); } catch (error) { onError(error); }
  });
  child.on('error', onError);
  child.on('exit', code => { if (!closing) onError(new Error(`Window observer exited (${code}).`)); });
  child.stderr.on('data', value => onError(new Error(value.toString().trim())));
  return { close() { closing = true; child.stdin.end(); lines.close(); child.kill(); } };
}

module.exports = { observeCodexWindow };
