'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { summarizeSessionFile } = require('./helpers/session-summary');

const fixture = path.join(__dirname, 'fixtures', 'session-basic.jsonl');

test('summarizeSessionFile extracts Codex usage, model, effort, context, limits, and cost', async () => {
  const summary = await summarizeSessionFile(fixture);

  assert.equal(summary.sessionId, 'sess_basic');
  assert.equal(summary.model, 'gpt-5.4-mini');
  assert.equal(summary.modelName, 'GPT-5.4 mini');
  assert.equal(summary.reasoningEffort, 'medium');
  assert.equal(summary.turnCount, 2);
  assert.equal(summary.contextWindow, 10000);
  assert.equal(summary.contextUsedPercent, 12);
  assert.equal(summary.latestUsage.inputTokens, 1200);
  assert.equal(summary.latestUsage.cachedInputTokens, 600);
  assert.equal(summary.latestUsage.cacheHitPercent, 50);
  assert.equal(summary.totalUsage.inputTokens, 2200);
  assert.equal(summary.totalUsage.cachedInputTokens, 900);
  assert.equal(summary.totalUsage.cacheHitPercent, 40.9);
  assert.equal(summary.rateLimits.primary.usedPercent, 42);
  assert.equal(summary.rateLimits.primary.label, '5h');
  assert.equal(summary.rateLimits.secondary.label, '7d');
  assert.equal(summary.planType, 'prolite');
  assert.equal(summary.cost.complete, true);
  assert.equal(summary.cost.perModel.length, 2);
  assert.ok(summary.cost.usd > 0);
});

test('summarizeSessionFile returns null for missing files', async () => {
  assert.equal(await summarizeSessionFile(path.join(__dirname, 'fixtures', 'missing.jsonl')), null);
});
