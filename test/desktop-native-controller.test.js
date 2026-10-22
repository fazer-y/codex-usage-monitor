'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createNativeController } = require('../desktop/native-main');
const { themeFromConfig } = require('../desktop/theme');
const { FOLDED_WIDTH } = require('../desktop/docking');

async function harness(t, saved = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-native-'));
  fs.writeFileSync(path.join(root, 'window-state.json'), JSON.stringify(saved));
  let observe, changed, bridgeOptions, reads = 0, flushed = 0, clock = 100000;
  let snapshot = { status: 'waiting', reason: 'noSessions', summary: null, selection: { mode: 'activity' } };
  const events = [];
  const hostPids = [];
  const controller = createNativeController({ userData: root, send: value => events.push(value), now: () => clock,
    service: { codexHome: root, getSnapshot: async () => { reads++; return snapshot; },
      start: fn => { changed = fn; }, setHostPid: pid => hostPids.push(pid), close: async () => { flushed++; } },
    theme: { forView: () => themeFromConfig({}, false, 'en') },
    pricingFactory: () => ({ load: async () => {}, refresh: async () => ({ updated: false }), close() {} }),
    observerFactory: callback => { observe = callback; return { close() {} }; },
    bridgeFactory: options => { bridgeOptions = options; return { listen: async () => {}, close() {} }; },
  });
  t.after(async () => { await controller.close(); assert.match(path.basename(root), /^cum-native-/); fs.rmSync(root, { recursive: true, force: true }); });
  await controller.receive({ method: 'ready', data: { pid: 999, scale: 1, workArea: { x: 0, y: 0, width: 3000, height: 1600 }, locale: 'en' } });
  return { controller, events, hostPids, host: value => observe(value), command: (method, value) => controller.receive({ method, value }),
    state: () => events.findLast(value => value.event === 'window').data,
    preferences: () => JSON.parse(fs.readFileSync(path.join(root, 'window-state.json'), 'utf8')),
    counters: () => ({ reads, flushed }), advance: value => { clock += value; },
    update: async value => { snapshot = value; await changed(); }, bridge: () => bridgeOptions };
}

const host = { found: true, pid: 123, x: 100, y: 100, width: 2400, height: 900, active: true,
  minimized: false, foregroundPid: 123, scale: 1, workArea: { x: 0, y: 0, width: 3000, height: 1600 } };

test('native controller folds, follows host movement, restores adaptive titlebar width', async t => {
  const app = await harness(t);
  app.host(host);
  await app.command('expanded', true);
  assert.equal(app.state().bounds.height, 284);
  await app.command('folded', true);
  assert.deepEqual(app.state().bounds, { x: 2328, y: 104, width: FOLDED_WIDTH, height: 40 });
  assert.equal(app.state().expanded, false);
  app.host({ ...host, x: 200, y: 180, width: 1400 });
  await app.command('folded', false);
  assert.deepEqual(app.state().bounds, { x: 540, y: 184, width: 920, height: 40 });
  assert.equal(app.preferences().folded, false);
});

test('native controller hides for minimized or inactive hosts and reveals without changing host', async t => {
  const app = await harness(t);
  app.host({ ...host, minimized: true }); assert.equal(app.state().visible, false);
  app.host({ ...host, active: false, foregroundPid: 456 }); assert.equal(app.state().visible, false);
  await app.command('show'); assert.equal(app.state().visible, true);
  app.advance(10001);
  app.host({ ...host, active: false, foregroundPid: 456 }); assert.equal(app.state().visible, false);
  app.host({ ...host, active: false, foregroundPid: 999 }); assert.equal(app.state().visible, true);
  assert.deepEqual(app.hostPids, [123]);
});

test('native controller converts physical monitor bounds with per-monitor scale', async t => {
  const app = await harness(t);
  app.host({ ...host, x: 200, y: 200, width: 2800, height: 1800, scale: 2,
    workArea: { x: 0, y: 0, width: 6000, height: 3200 } });
  assert.deepEqual(app.state().bounds, { x: 880, y: 208, width: 1840, height: 80 });
  await app.command('folded', true); assert.equal(app.state().bounds.width, FOLDED_WIDTH * 2);
});

test('native controller reuses saved floating position and persists fold without losing width', async t => {
  const bounds = { x: 170, y: 220, width: 1024, height: 40 };
  const app = await harness(t, { version: 2, docked: false, folded: true, bounds });
  assert.deepEqual(app.state().bounds, { x: 1162, y: 220, width: FOLDED_WIDTH, height: 40 });
  await app.command('show'); assert.deepEqual(app.state().bounds, bounds);
  await app.command('folded', true); assert.deepEqual(app.preferences().bounds, bounds);
});

test('native updates coalesce stable snapshots and expose the same view through MCP', async t => {
  const app = await harness(t);
  const before = app.events.filter(value => value.event === 'snapshot').length;
  await app.controller.refresh();
  assert.equal(app.events.filter(value => value.event === 'snapshot').length, before);
  const view = await app.bridge().getSnapshot();
  assert.equal(view.title, app.events.findLast(value => value.event === 'snapshot').data.title);
  await app.controller.close();
  assert.equal(app.counters().flushed, 1);
  assert.equal(app.events.at(-1).event, 'quit');
});
