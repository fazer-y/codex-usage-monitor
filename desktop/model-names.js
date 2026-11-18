'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

class CodexModelNames {
  constructor(codexHome) {
    this.file = path.join(codexHome, 'models_cache.json');
    this.names = new Map();
    this.version = null;
  }

  async find(modelId) {
    try {
      const { size, mtimeMs } = await fs.stat(this.file);
      const version = size + ':' + mtimeMs;
      if (version !== this.version && size <= 4 * 1024 * 1024) {
        const { models } = JSON.parse(await fs.readFile(this.file, 'utf8'));
        if (Array.isArray(models)) {
          const names = new Map();
          for (const model of models) {
            if (typeof model?.slug !== 'string' || typeof model.display_name !== 'string') continue;
            const name = model.display_name.trim();
            if (name) names.set(model.slug, name);
          }
          this.names = names;
          this.version = version;
        }
      }
    } catch { /* Keep the last readable catalog while Codex replaces the file. */ }
    return this.names.get(modelId) || modelId;
  }
}

module.exports = { CodexModelNames };
