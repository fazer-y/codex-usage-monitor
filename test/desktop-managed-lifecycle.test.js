'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createManagedLifecycle } = require('../desktop/managed-lifecycle');

function harness(managed) {
  const timers = new Map();
  let next = 0;
  let exits = 0;
  const lifecycle = createManagedLifecycle(() => exits++, { managed,
    schedule: (callback, delay) => { assert.equal(delay, 2000); timers.set(++next, callback); return next; },
    cancel: id => timers.delete(id),
  });
  return { lifecycle, timers, exits: () => exits, fire() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

test('managed strips exit after Codex disappears and cancel exit when the host returns', () => {
  const h = harness(true);
  h.lifecycle.setHostPresent(true);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setHostPresent(false);
  h.lifecycle.setHostPresent(false);
  assert.equal(h.timers.size, 1);
  h.lifecycle.setHostPresent(true);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setHostPresent(false);
  h.fire();
  assert.equal(h.exits(), 1);
  h.lifecycle.close();
});

test('temporary MCP discovery connections retain the strip while Codex is open', () => {
  const h = harness(false);
  h.lifecycle.setHostPresent(true);
  h.lifecycle.setConnections(2);
  h.lifecycle.setConnections(1);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setConnections(0);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setConnections(1);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setConnections(0);
  h.lifecycle.setHostPresent(false);
  h.fire();
  assert.equal(h.exits(), 1);
  h.lifecycle.close();
});

test('disconnected MCP startup exits when host detection has not completed', () => {
  const h = harness(false);
  h.lifecycle.setConnections(1);
  h.lifecycle.setConnections(0);
  assert.equal(h.timers.size, 1);
  h.lifecycle.setHostPresent(true);
  assert.equal(h.timers.size, 0);
  h.lifecycle.close();
});

test('standalone use retains its window and shutdown cancels pending lifecycle timers', () => {
  const h = harness(false);
  h.lifecycle.setHostPresent(false);
  h.lifecycle.setConnections(0);
  assert.equal(h.timers.size, 0);
  h.lifecycle.setManaged();
  assert.equal(h.timers.size, 1);
  h.lifecycle.close();
  assert.equal(h.timers.size, 0);
  h.fire();
  assert.equal(h.exits(), 0);
});
