'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { formatTokens, formatUsd } = require('../lib/format');

test('token and currency formatting keep readable units and useful precision', () => {
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(15_300), '15.3k');
  assert.equal(formatTokens(2_400_000), '2.4M');
  assert.equal(formatTokens(1_200_000_000), '1.2B');
  assert.equal(formatUsd(0.003373), '$0.0034');
  assert.equal(formatUsd(0.1234), '$0.123');
  assert.equal(formatUsd(12.3), '$12.30');
});
