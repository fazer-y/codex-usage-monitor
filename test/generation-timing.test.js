'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { GenerationTiming } = require('../lib/generation-timing');
const at = ms => new Date(ms);

test('generation timing excludes tool gaps and weights requests by duration', () => {
  const timing = new GenerationTiming();
  const turn = {};
  timing.start(turn, at(0));
  timing.recordUsage(turn, at(1000), 100);
  timing.toolCompleted(turn, at(9000));
  timing.recordUsage(turn, at(11000), 200);
  assert.deepEqual(turn.generation, { outputTokens: 300, durationMs: 3000, requestCount: 2, estimated: true });
});

test('parallel tools resume timing after the latest completed tool', () => {
  const timing = new GenerationTiming();
  const turn = {};
  timing.start(turn, at(0));
  timing.recordUsage(turn, at(1000), 100);
  timing.toolCompleted(turn, at(4000));
  timing.toolCompleted(turn, at(7000));
  timing.toolCompleted(turn, at(5000));
  timing.recordUsage(turn, at(8000), 100);
  assert.equal(turn.generation.durationMs, 2000);
  assert.equal(turn.generation.outputTokens, 200);
});

test('missing initial timing skips uncovered tokens and starts with the next request', () => {
  const timing = new GenerationTiming();
  const turn = {};
  timing.recordUsage(turn, at(1000), 1000);
  timing.recordUsage(turn, at(2000), 100);
  assert.equal(turn.generation.outputTokens, 100);
  assert.equal(turn.generation.durationMs, 1000);
  const next = {};
  timing.recordUsage(next, at(3000), 300);
  assert.equal(next.generation.requestCount, 0);
});

test('zero-output requests and invalid timestamps do not create generation samples', () => {
  const timing = new GenerationTiming();
  const turn = {};
  timing.start(turn, at(0));
  timing.recordUsage(turn, at(1000), 0);
  timing.recordUsage(turn, null, 100);
  timing.recordUsage(turn, at(500), 100);
  assert.equal(turn.generation.requestCount, 0);
  timing.recordUsage(turn, at(2000), 100);
  assert.equal(turn.generation.durationMs, 1000);
});
