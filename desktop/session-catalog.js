'use strict';

const fs = require('node:fs');
const path = require('node:path');

class SessionCatalog {
  constructor(codexHome) {
    this.codexHome = codexHome;
    this.files = new Map();
    this.database = null;
    this.scanned = false;
  }

  find(id) {
    const indexed = this.lookupDatabase(id);
    if (indexed) return indexed;
    if (!this.files.has(id)) this.scan();
    return this.files.get(id) || null;
  }

  lookupDatabase(id) {
    try {
      if (!this.database) {
        const name = fs.readdirSync(this.codexHome).filter(n => /^state_\d+\.sqlite$/.test(n))
          .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0];
        if (!name) return null;
        const { DatabaseSync } = require('node:sqlite');
        this.database = new DatabaseSync(path.join(this.codexHome, name), { readOnly: true });
      }
      const row = this.database.prepare('SELECT id, rollout_path, name, title FROM threads WHERE id = ?').get(id);
      const file = row?.rollout_path?.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
      if (!row || !this.isSessionPath(file)) return null;
      return { id: row.id, file, title: row.name || row.title?.split('\n')[0] || '' };
    } catch { return null; }
  }

  isSessionPath(file) {
    if (typeof file !== 'string' || !file.endsWith('.jsonl')) return false;
    return ['sessions', 'archived_sessions'].some(root => {
      const relative = path.relative(path.join(this.codexHome, root), file);
      return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
  }

  scan() {
    for (const name of ['sessions', 'archived_sessions']) {
      const stack = [path.join(this.codexHome, name)];
      while (stack.length) {
        let entries;
        const directory = stack.pop();
        try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) stack.push(file);
          else if (entry.isFile()) {
            const match = entry.name.match(/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\.jsonl$/i);
            if (match) this.files.set(match[1], { id: match[1], file, title: '' });
          }
        }
      }
    }
    this.scanned = true;
  }

  close() { this.database?.close(); this.database = null; }
}

module.exports = { SessionCatalog };
