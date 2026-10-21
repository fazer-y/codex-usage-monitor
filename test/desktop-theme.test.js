'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CodexTheme, themeFromConfig } = require('../desktop/theme');

test('theme uses Codex custom colors, semantic colors and opacity', () => {
  const theme = themeFromConfig({ desktop: { appearanceTheme: 'light', appearanceLightChromeTheme: {
    surface: '#FAFCED', ink: '#3f453b', accent: '#798d38', opaqueWindows: false, semanticColors: { diffRemoved: '#ba2623' },
  } } }, true);
  assert.equal(theme.mode, 'light');
  assert.equal(theme.colors.surface, '#fafced');
  assert.equal(theme.colors.surfaceFill, '#fafcede6');
  assert.equal(theme.colors.text, '#3f453b');
  assert.equal(theme.colors.accent, '#798d38');
  assert.equal(theme.colors.danger, '#ba2623');
});

test('explicit dark and system preferences select the matching palette', () => {
  const config = { desktop: { appearanceTheme: 'dark', appearanceDarkChromeTheme: { surface: '#10131a', opaqueWindows: true } } };
  assert.equal(themeFromConfig(config, false).colors.surfaceFill, '#10131a');
  config.desktop.appearanceTheme = 'system';
  assert.equal(themeFromConfig(config, false).mode, 'light');
  assert.equal(themeFromConfig(config, true).mode, 'dark');
  assert.equal(themeFromConfig({}, true).mode, 'dark');
});

test('invalid color strings use the Codex base palette', () => {
  const theme = themeFromConfig({ desktop: { appearanceTheme: 'light', appearanceLightChromeTheme: { surface: 'url(https://example.com)' } } }, false);
  assert.equal(theme.colors.surface, '#ffffff');
  assert.ok(Object.values(theme.colors).every(value => /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)));
});

test('theme reads once at startup and on view changes with no reads during usage refreshes', () => {
  let reads = 0;
  let preference = 'light';
  const theme = new CodexTheme('/unused', { loadConfig: () => { reads++; return { desktop: { appearanceTheme: preference } }; } });
  theme.forView(undefined, false);
  theme.forView('chat-a:1', false);
  preference = 'dark';
  for (let index = 0; index < 100; index++) assert.equal(theme.forView('chat-a:1', true).mode, 'light');
  assert.equal(reads, 1);
  assert.equal(theme.forView('chat-b:2', false).mode, 'dark');
  assert.equal(reads, 2);
  theme.forView('chat-a:3', false);
  assert.equal(reads, 3);
  theme.forView('chat-a:4', false);
  assert.equal(reads, 4);
});

test('theme parses TOML and retains its last colors through an incomplete save', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-theme-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, 'config.toml');
  fs.writeFileSync(file, "[desktop]\nappearanceTheme = 'light'\n[desktop.appearanceLightChromeTheme]\nsurface = '#f1f8ff' # saved color\n");
  const theme = new CodexTheme(home);
  assert.equal(theme.forView('chat-a:1', false).colors.surface, '#f1f8ff');
  fs.writeFileSync(file, '[desktop\n');
  assert.equal(theme.forView('chat-b:2', false).colors.surface, '#f1f8ff');
  fs.writeFileSync(file, '[desktop]\nappearanceTheme = "dark"\n');
  assert.equal(theme.forView('chat-b:2', false).mode, 'light');
  assert.equal(theme.forView('chat-a:3', false).mode, 'dark');
});
