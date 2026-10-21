'use strict';

const fs = require('node:fs/promises');
const { createSessionAccumulator } = require('../../lib/session');

async function summarizeSessionFile(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch { return null; }
  const accumulator = createSessionAccumulator(file);
  for (const line of text.split(/\r?\n/)) accumulator.consumeLine(line);
  return accumulator.snapshot();
}

module.exports = { summarizeSessionFile };
