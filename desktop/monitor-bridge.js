'use strict';

const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { createHash } = require('node:crypto');

function monitorAddress(userData, platform = process.platform) {
  const id = createHash('sha256').update(path.resolve(userData).toLowerCase()).digest('hex').slice(0, 20);
  return platform === 'win32' ? '\\\\.\\pipe\\codex-usage-monitor-' + id : path.join(os.tmpdir(), 'codex-usage-' + id + '.sock');
}

function createMonitorBridge({ address, getSnapshot, onConnectionsChanged = () => {} }) {
  const sockets = new Set();
  const attached = new Set();
  let closing = false;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    const lines = readline.createInterface({ input: socket });
    lines.on('error', () => socket.destroy());
    lines.on('line', async line => {
      let request;
      try {
        if (line.length > 1024) throw new Error('Bridge request is too large.');
        request = JSON.parse(line);
        if (request.method === 'attach') {
          if (!attached.has(socket)) {
            attached.add(socket);
            onConnectionsChanged(attached.size);
          }
        } else if (request.method !== 'snapshot') throw new Error('Unknown bridge request.');
        const result = await getSnapshot();
        if (!socket.destroyed) socket.write(JSON.stringify({ id: request.id, result }) + '\n');
      } catch (error) {
        if (!socket.destroyed) socket.write(JSON.stringify({ id: request?.id ?? null, error: error.message }) + '\n');
      }
    });
    socket.on('close', () => {
      lines.close();
      sockets.delete(socket);
      if (attached.delete(socket) && !closing) onConnectionsChanged(attached.size);
    });
  });
  return {
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ path: address, readableAll: false, writableAll: false }, () => {
        server.removeListener('error', reject);
        resolve();
      });
    }),
    close() {
      closing = true;
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

function connectMonitor(address, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(address);
    const pending = new Map();
    let nextId = 0;
    let connected = false;
    const lines = readline.createInterface({ input: socket });
    lines.on('error', error => { if (!connected) reject(error); socket.destroy(); });
    socket.on('error', error => { if (!connected) reject(error); });
    socket.on('close', () => {
      lines.close();
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Monitor connection closed.')); }
      pending.clear();
    });
    lines.on('line', line => {
      let response;
      try { response = JSON.parse(line); } catch { socket.destroy(); return; }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timer);
      if (response.error) request.reject(new Error(response.error));
      else request.resolve(response.result);
    });
    socket.once('connect', () => {
      connected = true;
      resolve({
        get closed() { return socket.destroyed; },
        request(method) {
          if (socket.destroyed) return Promise.reject(new Error('Monitor connection closed.'));
          return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('Monitor request timed out.')); }, timeoutMs);
            pending.set(id, { resolve, reject, timer });
            socket.write(JSON.stringify({ id, method }) + '\n');
          });
        },
        close() { socket.destroy(); },
      });
    });
  });
}

module.exports = { monitorAddress, createMonitorBridge, connectMonitor };
