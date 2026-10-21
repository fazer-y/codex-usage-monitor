'use strict';

const fs = require('node:fs/promises');
const { createSessionAccumulator } = require('../lib/session');
const { pricingRevision } = require('../lib/pricing');

class SessionReader {
  constructor({ maxEntries = 4 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
    this.bytesRead = 0;
  }

  async read(file) {
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      let entry = this.entries.get(file);
      if (!entry || entry.identity !== identity || stat.size < entry.offset
          || (stat.size === entry.offset && stat.mtimeMs !== entry.mtimeMs)) {
        entry = { identity, offset: 0, mtimeMs: stat.mtimeMs, pending: [], pendingApplied: false,
          accumulator: createSessionAccumulator(file), snapshot: null };
      }
      this.entries.delete(file);
      this.entries.set(file, entry);
      while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      if (stat.size === entry.offset) {
        if (entry.pricingRevision !== pricingRevision()) {
          entry.snapshot = entry.accumulator.snapshot();
          entry.pricingRevision = pricingRevision();
        }
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
      entry.snapshot = entry.accumulator.snapshot();
      entry.pricingRevision = pricingRevision();
      return entry.snapshot;
    } finally {
      await handle.close();
    }
  }
}

module.exports = { SessionReader };
