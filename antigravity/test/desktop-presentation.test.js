'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { presentation } = require('../desktop/presentation');

test('the bar supplies the full model, effort, and metrics in display priority order', () => {
  const view = presentation('zh-CN', false);
  const stats = {
    model: 'Gemini 4 Neon', effort: 'High', measuredCalls: 22, tokensPerSecond: 139.2, hitRate: 0.924,
    lastPromptTokens: 351740, promptTokens: 8224603, outputTokens: 80025, steps: 46, turns: 8,
    tools: 130, firstTokenSeconds: 8.1, turnOutputTokens: 7286,
  };
  const { bar } = view.snapshot({ title: 'Example', stats });
  assert.equal(bar.title, 'Gemini 4 Neon');
  assert.equal(bar.effort, 'High');
  assert.deepEqual(bar.metrics.map(metric => metric.kind),
    ['rate', 'cache', 'context', 'tokens', 'steps', 'turns', 'tools', 'ttft', 'output']);
  assert.deepEqual(bar.metrics.slice(0, 6).map(metric => metric.value),
    ['139 token/s', '92.4%', '351.7K', '8.3M', '第46步', '第8轮']);

  const pending = view.snapshot({ title: 'Example', stats: { ...stats, tokensPerSecond: null } }).bar;
  assert.equal(pending.metrics[0].kind, 'cache');
});
