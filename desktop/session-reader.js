'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createSessionAccumulator } = require('../lib/session');
const { pricingRevision } = require('../lib/pricing');

class SessionReader {
  constructor({ maxEntries = 64, idleTtlMs = 7 * 24 * 60 * 60 * 1000, now = Date.now, cacheDirectory = null, saveDelayMs = 2500 } = {}) {
    this.maxEntries = maxEntries;
    this.idleTtlMs = idleTtlMs;
    this.now = now;
    this.cacheDirectory = cacheDirectory;
    this.saveDelayMs = saveDelayMs;
    this.writes = new Map();
    this.saveTimer = null;
    this.nextCleanupAt = 0;
    this.entries = new Map();
    this.bytesRead = 0;
  }

  async read(file) {
    const now = this.now();
    for (const [name, entry] of this.entries) {
      if (now - entry.accessedAt >= this.idleTtlMs) this.entries.delete(name);
    }
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      let entry = this.entries.get(file);
      if (!entry && this.cacheDirectory) entry = await this.restore(file, stat, identity, now);
      if (!entry || entry.identity !== identity || stat.size < entry.offset
          || (stat.size === entry.offset && stat.mtimeMs !== entry.mtimeMs)) {
        entry = { identity, offset: 0, mtimeMs: stat.mtimeMs, pending: [], pendingApplied: false,
          accumulator: createSessionAccumulator(file), snapshot: null };
      }
      this.entries.delete(file);
      entry.accessedAt = now;
      this.entries.set(file, entry);
      while (this.entries.size > this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        this.persist(oldest, this.entries.get(oldest));
        this.entries.delete(oldest);
      }
      if (this.cacheDirectory && (!entry.persistedAccessAt || now - entry.persistedAccessAt >= 60 * 60 * 1000)) entry.dirty = true;
      if (stat.size === entry.offset) {
        if (entry.pricingRevision !== pricingRevision()) {
          entry.snapshot = entry.accumulator.snapshot();
          entry.pricingRevision = pricingRevision();
        }
        this.scheduleSave(entry);
        return entry.snapshot;
      }

      const end = stat.size;
      while (entry.offset < end) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, end - entry.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, entry.offset);
        if (!bytesRead) break;
        entry.offset += bytesRead;
        this.bytesRead += bytesRead;
        let start = 0;
        let newline;
        while ((newline = buffer.indexOf(10, start)) >= 0 && newline < bytesRead) {
          const fragment = buffer.subarray(start, newline);
          const line = entry.pending.length ? Buffer.concat([...entry.pending, fragment]) : fragment;
          if (!entry.pendingApplied) entry.accumulator.consumeLine(line.toString('utf8'));
          entry.pending = [];
          entry.pendingApplied = false;
          start = newline + 1;
        }
        if (start < bytesRead) entry.pending.push(buffer.subarray(start, bytesRead));
      }
      if (entry.pending.length && !entry.pendingApplied) {
        const tail = Buffer.concat(entry.pending).toString('utf8');
        try {
          JSON.parse(tail);
          entry.accumulator.consumeLine(tail);
          entry.pendingApplied = true;
        } catch { /* A writer may still be appending the final JSON record. */ }
      }
      entry.mtimeMs = stat.mtimeMs;
      entry.dirty = true;
      entry.snapshot = entry.accumulator.snapshot();
      entry.pricingRevision = pricingRevision();
      this.scheduleSave(entry);
      return entry.snapshot;
    } finally {
      await handle.close();
    }
  }

  cacheFile(file) {
    const resolved = path.resolve(file);
    return path.join(this.cacheDirectory, createHash('sha256').update(process.platform === 'win32' ? resolved.toLowerCase() : resolved).digest('hex') + '.json');
  }

  async restore(file, stat, identity, now) {
    try {
      const cache = this.cacheFile(file);
      if ((await fs.stat(cache)).size > 16 * 1024 * 1024) return null;
      const value = JSON.parse(await fs.readFile(cache, 'utf8'));
      if (value.version !== 1 || value.identity !== identity || !Number.isSafeInteger(value.offset) || value.offset < 0
          || value.offset > stat.size || !Number.isFinite(value.accessedAt) || value.accessedAt > now
          || now - value.accessedAt >= this.idleTtlMs
          || (value.offset === stat.size && value.mtimeMs !== stat.mtimeMs)) return null;
      const accumulator = createSessionAccumulator(file, value.accumulator);
      return { identity, offset: value.offset, mtimeMs: value.mtimeMs, pending: value.pending ? [Buffer.from(value.pending, 'base64')] : [],
        pendingApplied: value.pendingApplied === true, accumulator, snapshot: accumulator.snapshot(), pricingRevision: pricingRevision(),
        accessedAt: value.accessedAt, persistedAccessAt: value.accessedAt };
    } catch { return null; }
  }

  scheduleSave(entry) {
    if (!this.cacheDirectory || this.saveTimer || !entry.dirty) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flush().catch(() => {}); }, this.saveDelayMs);
    this.saveTimer.unref?.();
  }

  persist(file, entry) {
    if (!this.cacheDirectory || !entry?.dirty) return;
    const destination = this.cacheFile(file);
    const text = JSON.stringify({ version: 1, identity: entry.identity, offset: entry.offset, mtimeMs: entry.mtimeMs,
      pending: entry.pending.length ? Buffer.concat(entry.pending).toString('base64') : '', pendingApplied: entry.pendingApplied,
      accessedAt: entry.accessedAt, accumulator: entry.accumulator.checkpoint() });
    if (Buffer.byteLength(text) > 16 * 1024 * 1024) return;
    entry.dirty = false;
    entry.persistedAccessAt = entry.accessedAt;
    const previous = this.writes.get(destination) || Promise.resolve();
    const task = previous.then(async () => {
      await fs.mkdir(this.cacheDirectory, { recursive: true });
      await fs.writeFile(destination + '.tmp', text);
      await fs.rename(destination + '.tmp', destination);
    }).catch(() => { entry.dirty = true; });
    this.writes.set(destination, task);
    task.finally(() => { if (this.writes.get(destination) === task) this.writes.delete(destination); });
  }

  async flush() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    for (const [file, entry] of this.entries) this.persist(file, entry);
    await Promise.all(this.writes.values());
    if (this.cacheDirectory && this.now() >= this.nextCleanupAt) {
      this.nextCleanupAt = this.now() + 24 * 60 * 60 * 1000;
      try {
        for (const name of await fs.readdir(this.cacheDirectory)) {
          if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
          const file = path.join(this.cacheDirectory, name);
          if (this.now() - (await fs.stat(file)).mtimeMs >= this.idleTtlMs) await fs.unlink(file);
        }
      } catch { /* Cache cleanup does not affect the original conversation files. */ }
    }
  }
}

module.exports = { SessionReader };
