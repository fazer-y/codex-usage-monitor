'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { messages, resolveLocale, translator } = require('../desktop/i18n');
const { CodexTheme, themeFromConfig } = require('../desktop/theme');
const { snapshotToViewModel } = require('../desktop/view-model');
const { summarizeSessionFile } = require('./helpers/session-summary');

test('locale resolution supports regional and script tags with an English fallback', () => {
  for (const locale of ['zh', 'zh-CN', 'zh_SG', 'zh-Hans']) assert.equal(resolveLocale(locale), 'zh-CN');
  for (const locale of ['zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW']) assert.equal(resolveLocale(locale), 'zh-TW');
  for (const locale of ['en-US', 'en-GB', 'ja-JP', null]) assert.equal(resolveLocale(locale), 'en');
});

test('translations contain the same messages and preserve interpolation placeholders', () => {
  const keys = Object.keys(messages.en).sort();
  for (const [locale, dictionary] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys, locale);
    for (const key of keys) {
      assert.deepEqual([...dictionary[key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(),
        [...messages.en[key].matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), locale + ':' + key);
    }
  }
  assert.equal(translator('zh-CN')('stepNumber', { value: 12 }), '第12步');
  assert.equal(translator('en')('stepNumber', { value: 12 }), 'Step 12');
  assert.equal(translator('zh-TW')('cacheRead'), '快取讀取');
});

test('Codex locale overrides system language and reads only at startup and conversation entry', () => {
  assert.equal(themeFromConfig({}, false, 'zh-CN').locale, 'zh-CN');
  assert.equal(themeFromConfig({ desktop: { localeOverride: 'en-US' } }, false, 'zh-CN').locale, 'en');
  let reads = 0;
  let localeOverride = 'en';
  const theme = new CodexTheme('./unused', { loadConfig: () => { reads++; return { desktop: { localeOverride } }; } });
  assert.equal(theme.forView(undefined, false, 'zh-CN').locale, 'en');
  theme.forView('a', false, 'zh-CN');
  localeOverride = 'zh-Hant';
  for (let index = 0; index < 100; index++) assert.equal(theme.forView('a', false, 'zh-CN').locale, 'en');
  assert.equal(reads, 1);
  assert.equal(theme.forView('b', false, 'zh-CN').locale, 'zh-TW');
  assert.equal(reads, 2);
});

test('localized statistics retain token values, model names, and conversation titles', async () => {
  const summary = await summarizeSessionFile(path.join(__dirname, 'fixtures/session-basic.jsonl'));
  const snapshot = { status: 'ready', summary, conversationTitle: 'My conversation', selection: { mode: 'desktop' } };
  const english = snapshotToViewModel(snapshot, Date.now(), 'en-US');
  const chinese = snapshotToViewModel(snapshot, Date.now(), 'zh-CN');
  const traditional = snapshotToViewModel(snapshot, Date.now(), 'zh-TW');
  assert.equal(english.metrics.find(metric => metric.kind === 'steps').value, 'Step 1');
  assert.equal(chinese.metrics.find(metric => metric.kind === 'steps').value, '第1步');
  assert.equal(traditional.metrics.find(metric => metric.kind === 'cache').label, '快取');
  for (const model of [english, chinese, traditional]) {
    assert.equal(model.title, 'GPT-5.4 mini');
    assert.equal(model.conversationTitle, 'My conversation');
    assert.equal(model.metrics.find(metric => metric.kind === 'tokens').value, '2.5k');
  }
  assert.equal(/[\u3400-\u9fff]/.test(JSON.stringify(english)), false);
});
