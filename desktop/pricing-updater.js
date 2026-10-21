'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { SOURCE, validatePriceBook, applyPriceBook } = require('../lib/pricing');
const MAX_DOCUMENT_BYTES = 256 * 1024;

function parseOfficialPrices(markdown, checkedAt = new Date().toISOString()) {
  const sections = markdown.replace(/\r/g, '').split(/^### /m);
  const standard = sections.find(section => section.startsWith('Standard pricing data\n'));
  if (!standard || !/Long context:\s*>272K input tokens/.test(markdown)) throw new Error('Standard pricing format was not recognized.');
  const entries = new Map();
  function readTables(section, codexOnly = false) {
    let headers = [];
    for (const line of section.split('\n')) {
      if (!line.startsWith('|')) { headers = []; continue; }
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (cells.includes('Model')) { headers = cells; continue; }
      if (!headers.length || cells.every(cell => /^[-: ]+$/.test(cell))) continue;
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
      if (codexOnly && row.Category !== 'Codex') continue;
      const key = row.Model?.replace(/\s+\(<272K context length\)$/, '');
      if (!/^(gpt-[a-z0-9.-]+|o\d[a-z0-9.-]*)$/.test(key || '')) continue;
      function rate(label, optional = false) {
        const cell = row[label];
        if (optional && (cell == null || cell === '-')) return null;
        if (!/^\$\d+(?:\.\d+)?$/.test(cell || '')) throw new Error('Unrecognized Standard model rate.');
        return Number(cell.slice(1));
      }
      const tiered = headers.includes('Short context input');
      const prefix = tiered ? 'Short context ' : '';
      const entry = { key, name: displayName(key), ...(tiered ? { tiered: true } : {}), input: rate(prefix + (tiered ? 'input' : 'Input')),
        output: rate(prefix + (tiered ? 'output' : 'Output')),
        cachedInput: rate(prefix + (tiered ? 'cached input' : 'Cached input'), true),
        cacheWrite: rate(prefix + '30m write', true) };
      if (tiered && row['Long context input'] !== '-') entry.longRates = {
        input: rate('Long context input'), output: rate('Long context output'),
        cachedInput: rate('Long context cached input', true), cacheWrite: rate('Long context 30m write', true),
      };
      if (entries.has(key)) throw new Error('Duplicate Standard model rate.');
      entries.set(key, entry);
    }
  }
  readTables(standard);
  const specialized = markdown.replace(/\r/g, '').split(/^Specialized models\s*$/m)[1];
  const codexTable = specialized?.split(/^### /m).find(section => section.startsWith('Grouped Pricing Table data\n'));
  if (codexTable) readTables(codexTable, true);
  if (!entries.has('gpt-6.1-sol') || !entries.has('gpt-5.4-mini')) throw new Error('Standard price document is incomplete.');
  return validatePriceBook({ version: 1, source: SOURCE, currency: 'USD', unit: 1000000,
    checkedAt, models: [...entries.values()].sort((a, b) => a.key.localeCompare(b.key, 'en')) });
}

function displayName(key) {
  const words = key.split('-');
  if (words[0] === 'gpt') words[0] = 'GPT';
  return words.map((word, index) => index > 1 && !['mini', 'nano', 'pro', 'turbo'].includes(word)
    ? word.charAt(0).toUpperCase() + word.slice(1) : word).join('-').replace(/-(?=[A-Za-z])/g, ' ');
}

function createStartupPricing({ file, fetch, timeoutMs = 10000, now = () => new Date().toISOString() }) {
  let cached = null;
  let task = null;
  let controller = null;
  let closed = false;
  return {
    async load() {
      try {
        if ((await fs.stat(file)).size > MAX_DOCUMENT_BYTES) return false;
        const value = JSON.parse(await fs.readFile(file, 'utf8'));
        cached = { book: validatePriceBook(value.book), etag: typeof value.etag === 'string' ? value.etag : null };
        return applyPriceBook(cached.book);
      } catch { return false; }
    },
    refresh() {
      if (task) return task;
      if (closed) return Promise.resolve({ status: 'closed', updated: false });
      task = (async () => {
        controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(SOURCE + '.md', { signal: controller.signal, credentials: 'omit', redirect: 'error',
            headers: { Accept: 'text/markdown', ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}) } });
          let next;
          if (response.status === 304 && cached) next = { ...cached, book: { ...cached.book, checkedAt: now() } };
          else {
            if (!response.ok) throw new Error('Pricing request returned HTTP ' + response.status + '.');
            const reader = response.body.getReader();
            const chunks = [];
            let bytes = 0;
            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > MAX_DOCUMENT_BYTES) throw new Error('Pricing document exceeded the size limit.');
                chunks.push(Buffer.from(value));
              }
            } finally { await reader.cancel(); }
            next = { book: parseOfficialPrices(Buffer.concat(chunks).toString('utf8'), now()), etag: response.headers.get('etag') };
          }
          if (closed) return { status: 'closed', updated: false };
          const updated = applyPriceBook(next.book);
          cached = next;
          try {
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file + '.tmp', JSON.stringify(cached) + '\n');
            await fs.rename(file + '.tmp', file);
          } catch { /* Updated rates remain available for this process. */ }
          return { status: 'current', updated, models: next.book.models.length };
        } catch (error) {
          return { status: cached ? 'cached' : 'bundled', updated: false, error: error.message };
        } finally { clearTimeout(timer); controller = null; }
      })();
      return task;
    },
    close() { closed = true; controller?.abort(); },
  };
}

module.exports = { parseOfficialPrices, createStartupPricing };
