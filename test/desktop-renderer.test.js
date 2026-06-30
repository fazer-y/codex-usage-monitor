'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('renderer HTML uses local assets and expected panel anchors', () => {
  const html = read('desktop/renderer/index.html');

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'/);
  assert.match(html, /id="title"/);
  assert.match(html, /id="metrics"/);
  assert.match(html, /id="rows"/);
  assert.match(html, /id="refresh"/);
  assert.match(html, /aria-label="Refresh"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>(.|\n)*<\/script>/);
});

test('renderer CSS keeps compact stable dimensions without viewport font scaling', () => {
  const css = read('desktop/renderer/styles.css');

  assert.match(css, /min-width:\s*380px/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /font-size:\s*[^;]*vw/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
});

test('renderer script updates text with DOM APIs instead of raw HTML strings', () => {
  const source = read('desktop/renderer/app.js');

  assert.match(source, /window\.codexUsageMonitor\.getSnapshot/);
  assert.match(source, /window\.codexUsageMonitor\.onSnapshot/);
  assert.match(source, /textContent/);
  assert.match(source, /replaceChildren/);
  assert.doesNotMatch(source, /innerHTML/);
});
