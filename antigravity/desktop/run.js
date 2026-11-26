'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { createController } = require('./native-main');
const { SessionStore } = require('../lib/session-store');

async function startDetails(controller) {
  const { SidecarApp, Response } = await import('sidecar_sdk');
  const app = new SidecarApp();
  const web = path.join(__dirname, '..', 'web');
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(web, 'details.js'), 'utf8');
  app.page('/', () => new Response(html, { contentType: 'text/html; charset=utf-8' }));
  app.page('/details.js', () => new Response(script, { contentType: 'application/javascript; charset=utf-8' }));
  app.api('/api/snapshot', query => controller.details(query?.conversationId), 'GET');
  await app.run();
  return app;
}

function run({ sidecar = false } = {}) {
  const dataRoot = process.env.ANTIGRAVITY_USAGE_MONITOR_HOME || path.join(os.homedir(), '.gemini', 'antigravity');
  const userData = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Antigravity Usage Monitor');
  const exe = path.join(__dirname, 'native', 'bin', 'Antigravity Usage Monitor.exe');
  const child = spawn(exe, [sidecar ? '--sidecar' : '--show'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const input = readline.createInterface({ input: child.stdout });
  let web;
  let ending = false;
  let ready = false;
  const controller = createController({ store: new SessionStore(dataRoot), userData,
    send: (value, after) => {
      if (child.stdin.writable) child.stdin.write(JSON.stringify(value) + '\n', after);
      else after?.();
    },
    exit: async () => {
      ending = true;
      child.stdin.end();
      input.close();
      if (web) {
        try { await (await web).close(); } catch {}
      }
    },
  });
  child.stdin.on('error', error => { if (error.code !== 'EPIPE') console.error('Native channel: ' + error.code); });
  child.stderr.pipe(process.stderr, { end: false });
  child.once('error', error => { console.error('Native window: ' + error.message); process.exitCode = 1; controller.close(); });
  child.once('exit', (code, signal) => {
    if (!ending && !ready) console.error('Native window exited during startup (' + (signal || code) + ').');
    if (code) process.exitCode = code;
    controller.close();
  });
  input.on('line', line => {
    if (line.length > 65536) return;
    try {
      const message = JSON.parse(line);
      if (message.method === 'ready') ready = true;
      controller.receive(message);
    } catch (error) { console.error('Native command: ' + error.name); }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, controller.close);
  if (sidecar) {
    web = startDetails(controller);
    web.catch(error => {
      if (ending) return;
      console.error('Sidebar: ' + error.message);
      process.exitCode = 1;
      controller.close();
    });
  }
}

if (require.main === module) run({ sidecar: true });

module.exports = { run };
