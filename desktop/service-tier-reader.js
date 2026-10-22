'use strict';

const fs = require('node:fs');
const path = require('node:path');

function serviceTierFromFeedback(body) {
  const match = typeof body === 'string' && body.match(/"service_tier"\s*:\s*"([a-z_]+)"/i);
  return match ? match[1].toLowerCase() : null;
}

class ServiceTierReader {
  constructor(codexHome, { now = Date.now, pollMs = 1000 } = {}) {
    this.codexHome = codexHome;
    this.now = now;
    this.pollMs = pollMs;
    this.database = null;
    this.file = null;
    this.identity = null;
    this.nextDiscovery = 0;
    this.cache = new Map();
  }

  read(threadId) {
    if (!threadId) return null;
    const now = this.now();
    const previous = this.cache.get(threadId);
    if (previous && now < previous.nextPoll) return previous.value;
    try {
      if (!this.file && now >= this.nextDiscovery) {
        const name = fs.readdirSync(this.codexHome).filter(name => /^logs_\d+\.sqlite$/.test(name))
          .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0];
        this.nextDiscovery = now + 10000;
        if (name) this.file = path.join(this.codexHome, name);
      }
      if (!this.file) return null;
      const stat = fs.statSync(this.file);
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      if (identity !== this.identity) {
        this.closeDatabase();
        const { DatabaseSync } = require('node:sqlite');
        this.database = new DatabaseSync(this.file, { readOnly: true });
        this.statement = this.database.prepare(`SELECT feedback_log_body, ts, ts_nanos FROM logs
          WHERE thread_id = ? AND target = 'feedback_tags' ORDER BY ts DESC, ts_nanos DESC, id DESC LIMIT 64`);
        this.identity = identity;
      }
      let signature = `${identity}:${stat.size}:${stat.mtimeMs}`;
      try {
        const wal = fs.statSync(this.file + '-wal');
        signature += `:${wal.size}:${wal.mtimeMs}`;
      } catch { /* A checkpoint may remove the write-ahead log. */ }
      let value = previous?.value || null;
      if (!previous || previous.signature !== signature) {
        value = null;
        for (const row of this.statement.iterate(threadId)) {
          const tier = serviceTierFromFeedback(row.feedback_log_body);
          if (tier) { value = { tier, recordedAt: row.ts * 1000 + row.ts_nanos / 1e6 }; break; }
        }
      }
      this.cache.delete(threadId);
      this.cache.set(threadId, { signature, value, nextPoll: now + this.pollMs });
      while (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value);
      return value;
    } catch {
      this.closeDatabase();
      this.file = null;
      this.nextDiscovery = now + 10000;
      return null;
    }
  }

  closeDatabase() {
    this.database?.close();
    this.database = null;
    this.identity = null;
    this.cache.clear();
  }

  close() { this.closeDatabase(); }
}

module.exports = { ServiceTierReader, serviceTierFromFeedback };
