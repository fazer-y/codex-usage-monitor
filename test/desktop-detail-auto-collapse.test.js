'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createDetailAutoCollapse } = require('../desktop/detail-auto-collapse');

test('expanded details collapse three seconds after focus leaves', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let collapsed = 0;
  const controller = createDetailAutoCollapse(() => collapsed++);
  t.after(() => controller.close());
  controller.setExpanded(true);
  t.mock.timers.tick(5000);
  assert.equal(collapsed, 0);
  controller.setFocused(false);
  t.mock.timers.tick(2999);
  assert.equal(collapsed, 0);
  t.mock.timers.tick(1);
  assert.equal(collapsed, 1);
  t.mock.timers.tick(10000);
  assert.equal(collapsed, 1);
});

test('returning focus cancels collapse and a later blur starts a fresh delay', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let collapsed = 0;
  const controller = createDetailAutoCollapse(() => collapsed++);
  t.after(() => controller.close());
  controller.setExpanded(true);
  controller.setFocused(false);
  t.mock.timers.tick(2000);
  controller.setFocused(true);
  t.mock.timers.tick(10000);
  assert.equal(collapsed, 0);
  controller.setFocused(false);
  t.mock.timers.tick(3000);
  assert.equal(collapsed, 1);
});

test('manual collapse and shutdown cancel pending timers', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let collapsed = 0;
  const controller = createDetailAutoCollapse(() => collapsed++);
  controller.setFocused(false);
  controller.setExpanded(true);
  controller.setExpanded(false);
  t.mock.timers.tick(5000);
  assert.equal(collapsed, 0);
  controller.setExpanded(true);
  controller.close();
  t.mock.timers.tick(5000);
  assert.equal(collapsed, 0);
});
