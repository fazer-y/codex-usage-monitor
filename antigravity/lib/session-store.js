'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { decodeGeneration, summarizeGenerations } = require('./generation');
const { selectConversation, SESSION_ID } = require('./window-selection');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED_SESSIONS = 64;
const FILE_CHECK_MS = 10_000;

function openDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 100');
  return db;
}

class ConversationCatalog {
  constructor(root) {
    this.file = path.join(root, 'conversation_summaries.db');
    this.db = null;
    this.version = null;
    this.rows = [];
  }

  read() {
    if (!fs.existsSync(this.file)) return [];
    this.db ??= openDatabase(this.file);
    const version = this.db.prepare('PRAGMA data_version').get().data_version;
    if (this.version !== version) {
      this.rows = this.db.prepare('SELECT conversation_id AS id, title FROM conversation_summaries WHERE title <> ?').all('');
      this.version = version;
    }
    return this.rows;
  }

  close() {
    this.db?.close();
    this.db = null;
    this.version = null;
    this.rows = [];
  }
}

class SessionReader {
  constructor(file, cache, onInvalidRow) {
    this.db = openDatabase(file);
    this.cache = cache;
    this.onInvalidRow = onInvalidRow;
    this.version = null;
    this.sample = null;
    try {
      this.readSteps = this.db.prepare('SELECT COUNT(*) FILTER (WHERE step_type = 14) AS turns,'
        + ' COUNT(*) FILTER (WHERE step_type = 132) AS tools,'
        + ' MAX(CASE WHEN step_type = 14 THEN idx END) AS lastTurnIndex FROM steps');
      this.readRange = this.db.prepare('SELECT COUNT(*) AS count, MAX(idx) AS last FROM gen_metadata');
      this.readGenerations = this.db.prepare('SELECT idx, data FROM gen_metadata WHERE idx >= ? ORDER BY idx');
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  read() {
    const version = this.db.prepare('PRAGMA data_version').get().data_version;
    if (version === this.version) return this.sample;

    this.db.exec('BEGIN');
    try {
      const stepStats = this.readSteps.get();
      const range = this.readRange.get();
      const previous = this.cache.range;
      const reset = !previous || range.last === null || range.last < previous.last
        || range.count < previous.count || range.count - previous.count > range.last - previous.last;
      // The newest generation can be updated in place by a later commit.
      const start = reset ? 0 : previous.last;
      const entries = new Map(reset ? [] : this.cache.entries);
      entries.delete(start);
      for (const { idx, data } of this.readGenerations.iterate(start)) {
        try {
          const call = data ? decodeGeneration(data) : null;
          if (call) entries.set(idx, call);
        } catch {
          this.onInvalidRow();
        }
      }
      this.sample = { ...stepStats, ...summarizeGenerations(entries.values(), stepStats.lastTurnIndex) };
      this.cache.entries = entries;
      this.cache.range = range;
      this.version = version;
      return this.sample;
    } finally {
      this.db.exec('ROLLBACK');
    }
  }

  close() {
    this.db.close();
  }
}

class SessionStore {
  constructor(root, { now = Date.now, onInvalidRow = () => {} } = {}) {
    this.root = root;
    this.now = now;
    this.onInvalidRow = onInvalidRow;
    this.catalog = new ConversationCatalog(root);
    this.cache = new Map();
    this.reader = null;
    this.current = null;
    this.nextFileCheck = 0;
  }

  read(windowTitle) {
    return this.readConversation(windowTitle ? selectConversation(windowTitle, this.catalog.read()) : null);
  }

  readId(id) {
    return this.readConversation(typeof id === 'string' && SESSION_ID.test(id)
      ? this.catalog.read().find(row => row.id === id) : null);
  }

  readConversation(conversation) {
    if (!conversation) return null;
    const { id, title } = conversation;
    const now = this.now();
    if (this.current !== id || now >= this.nextFileCheck) {
      const file = path.join(this.root, 'conversations', id + '.db');
      const identity = fs.statSync(file, { throwIfNoEntry: false, bigint: true });
      let entry = this.cache.get(id);
      const fresh = entry && identity && entry.ino === identity.ino && entry.birth === identity.birthtimeNs
        && now - entry.accessedAt < CACHE_TTL_MS;
      if (this.current !== id || !fresh) {
        this.release();
        if (!identity) return { title, stats: null };
        if (!fresh) entry = { ino: identity.ino, birth: identity.birthtimeNs };
        this.reader = new SessionReader(file, entry, this.onInvalidRow);
        this.current = id;
      }
      entry.accessedAt = now;
      this.cache.delete(id);
      this.cache.set(id, entry);
      for (const [key, value] of this.cache) {
        if (now - value.accessedAt >= CACHE_TTL_MS || this.cache.size > MAX_CACHED_SESSIONS) this.cache.delete(key);
      }
      this.nextFileCheck = now + FILE_CHECK_MS;
    }

    return { title, stats: this.reader.read() };
  }

  release() {
    this.reader?.close();
    this.reader = null;
    this.current = null;
  }

  close() {
    this.release();
    this.catalog.close();
    this.cache.clear();
  }
}

module.exports = { SessionStore };
