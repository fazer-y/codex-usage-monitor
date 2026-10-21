'use strict';

const fs = require('node:fs/promises');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function selectionFromLine(line) {
  if (!line.includes('[AppServerConnection] response_routed ')
      || !/\bmethod=thread\/attachment\/list\b/.test(line)
      || !/\berrorCode=null\b/.test(line)
      || !/\bhadInternalHandler=false\b/.test(line)
      || !/\bhadPending=true\b/.test(line)
      || !/\btargetDestroyed=false\b/.test(line)) return null;
  const id = line.match(/\bconversationId=([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\b/i)?.[1];
  const windowId = line.match(/\boriginWebcontentsId=(\d+)\b/)?.[1];
  const time = Date.parse(line.slice(0, 24));
  return id && windowId && Number.isFinite(time) ? { id, windowId: Number(windowId), time } : null;
}

class CodexSelection {
  constructor({ logsRoot, logsRoots = logsRoot ? [logsRoot] : defaultLogsRoots() } = {}) {
    this.logsRoots = logsRoots;
    this.logsRoot = logsRoots[0];
    this.pid = null;
    this.selected = null;
    this.file = null;
    this.offset = 0;
    this.pending = '';
    this.nextDiscovery = 0;
  }

  setHostPid(pid) {
    if (pid === this.pid) return;
    this.pid = pid;
    this.file = null;
    this.offset = 0;
    this.pending = '';
    this.selected = null;
    this.nextDiscovery = 0;
  }

  async discover() {
    if (!this.pid) return;
    const matches = [];
    const walk = async (directory, depth) => {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory() && depth < 3 && /^\d+$/.test(entry.name)) await walk(full, depth + 1);
        else if (entry.isFile() && entry.name.includes(`-${this.pid}-t0-`) && entry.name.endsWith('.log')) {
          try { matches.push({ file: full, modified: (await fs.stat(full)).mtimeMs }); } catch {}
        }
      }
    };
    await Promise.all(this.logsRoots.map(root => walk(root, 0)));
    matches.sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file, undefined, { numeric: true }));
    if (matches[0] && matches[0].file !== this.file) {
      this.file = matches[0].file;
      this.offset = 0;
      this.pending = '';
    }
    this.nextDiscovery = Date.now() + 10000;
  }

  async poll() {
    if (!this.pid) return this.selected;
    if (!this.file || Date.now() >= this.nextDiscovery) await this.discover();
    if (!this.file) return this.selected;
    let handle;
    try {
      handle = await fs.open(this.file, 'r');
      const { size } = await handle.stat();
      if (size < this.offset) { this.offset = 0; this.pending = ''; }
      if (!this.offset && size > 2 * 1024 * 1024) {
        this.offset = size - 2 * 1024 * 1024;
        this.pending = '';
      }
      while (this.offset < size) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size - this.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        const lines = (this.pending + buffer.toString('utf8', 0, bytesRead)).split('\n');
        this.pending = lines.pop();
        for (const line of lines) {
          const candidate = selectionFromLine(line);
          if (candidate && (!this.selected || candidate.time >= this.selected.time)) this.selected = candidate;
        }
      }
    } catch {
      this.file = null;
    } finally { await handle?.close(); }
    return this.selected;
  }
}

function defaultLogsRoots(local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')) {
  const roots = [path.join(local, 'Codex', 'Logs')];
  const packages = path.join(local, 'Packages');
  try {
    for (const name of readdirSync(packages)) {
      if (/^OpenAI\.Codex_/i.test(name)) roots.push(path.join(packages, name, 'LocalCache', 'Local', 'Codex', 'Logs'));
    }
  } catch { /* Unpackaged installations use the ordinary local data folder. */ }
  return roots;
}

module.exports = { CodexSelection, selectionFromLine, defaultLogsRoots };
