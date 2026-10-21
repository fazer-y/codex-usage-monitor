'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { FOLDED_WIDTH } = require('../desktop/docking');

async function createHarness(saved = {}, argv = []) {
  const handlers = new Map();
  const preferences = [];
  const detailStates = [];
  const app = new EventEmitter();
  Object.assign(app, {
    setName() {}, requestSingleInstanceLock: () => true, whenReady: async () => {},
    getPath: () => '/preferences', quit() {},
  });
  let window;
  let tray;
  let updateHost;
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {}, send() {} });
      this.visible = false;
      this.onTop = false;
    }
    getBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; }
    setMenuBarVisibility() {}
    loadFile() {}
    isDestroyed() { return false; }
    isFocused() { return false; }
    isVisible() { return this.visible; }
    isAlwaysOnTop() { return this.onTop; }
    setAlwaysOnTop(value) { this.onTop = value; }
    hide() { this.visible = false; }
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    focus() {}
  }
  class Tray extends EventEmitter {
    constructor() { super(); tray = this; }
    setToolTip() {}
    setContextMenu() {}
  }
  const workArea = { x: 0, y: 0, width: 3000, height: 1600 };
  const modules = {
    'node:fs': {
      readFileSync: () => JSON.stringify(saved),
      writeFileSync: (_file, content) => preferences.push(JSON.parse(content)),
    },
    'node:path': path,
    electron: {
      app, BrowserWindow, Tray, Menu: { setApplicationMenu() {}, buildFromTemplate: value => value },
      ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
      screen: { getPrimaryDisplay: () => ({ workArea }), getDisplayMatching: () => ({ workArea }), screenToDipRect: (_window, bounds) => bounds },
      nativeTheme: { shouldUseDarkColors: false },
    },
    './usage-service': { createUsageService: () => ({ codexHome: '/codex', start() {}, close() {}, setHostPid() {}, getSnapshot: async () => ({}) }) },
    './view-model': { snapshotToViewModel: () => ({ title: 'Current conversation' }) },
    './window-observer': { observeCodexWindow: callback => { updateHost = callback; return { close() {} }; } },
    './theme': { CodexTheme: class { forView() { return {}; } } },
    './detail-auto-collapse': { createDetailAutoCollapse: () => ({ setFocused() {}, setExpanded: value => detailStates.push(value), close() {} }) },
    './managed-lifecycle': { createManagedLifecycle: () => ({ setManaged() {}, setHostPresent() {}, setConnections() {}, close() {} }) },
    './monitor-bridge': { monitorAddress() {}, createMonitorBridge() {} },
    './pricing-updater': { createStartupPricing: () => ({ load: async () => false, refresh: async () => ({ updated: false }), close() {} }) },
    './i18n': require('../desktop/i18n'),
    './docking': require('../desktop/docking'),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8'), {
    require: name => {
      if (!(name in modules)) throw new Error('Unexpected module: ' + name);
      return modules[name];
    },
    __dirname: path.join(__dirname, '../desktop'), process: { argv, pid: 999 }, console, setImmediate,
  });
  await new Promise(resolve => setImmediate(resolve));
  window.emit('ready-to-show');
  const invoke = (name, value, sender = window.webContents) => handlers.get('usage:' + name)({ sender }, value);
  return { app, window, tray, handlers, preferences, detailStates, updateHost: value => updateHost(value), invoke };
}

const host = { found: true, pid: 123, x: 100, y: 100, width: 2400, height: 900, active: true, minimized: false, foregroundPid: 123 };

test('folding shrinks the native window, follows the host, and restores current adaptive bounds', async () => {
  const harness = await createHarness();
  const { window, invoke, updateHost } = harness;
  updateHost(host);
  invoke('setExpanded', true);
  assert.equal(window.bounds.height, 284);
  assert.equal(invoke('setFolded', true).expanded, false);
  assert.deepEqual(window.bounds, { x: 2328, y: 104, width: FOLDED_WIDTH, height: 40 });
  assert.equal(harness.preferences.at(-1).bounds.width, 1280);
  assert.equal(harness.detailStates.at(-1), false);
  assert.equal(window.visible, true);
  assert.equal(invoke('setExpanded', true).expanded, false);
  const moved = { ...host, x: 200, y: 180, width: 1400 };
  updateHost(moved);
  assert.deepEqual(window.bounds, { x: 1428, y: 184, width: FOLDED_WIDTH, height: 40 });
  updateHost({ ...moved, minimized: true });
  assert.equal(window.visible, false);
  updateHost(moved);
  assert.equal(window.visible, true);
  updateHost({ ...moved, active: false, foregroundPid: 456 });
  assert.equal(window.visible, false);
  updateHost(moved);
  assert.equal(invoke('setFolded', false).folded, false);
  assert.deepEqual(window.bounds, { x: 540, y: 184, width: 920, height: 40 });
  assert.equal(harness.preferences.at(-1).folded, false);
  harness.app.emit('before-quit');
});

test('a saved floating fold restores its full position and native close keeps a visible handle', async () => {
  const original = { x: 170, y: 220, width: 1024, height: 40 };
  const harness = await createHarness({ version: 2, docked: false, folded: true, bounds: original });
  const { window, invoke } = harness;
  assert.deepEqual(window.bounds, { x: 1162, y: 220, width: FOLDED_WIDTH, height: 40 });
  invoke('setFolded', false);
  assert.deepEqual(window.bounds, original);
  invoke('setExpanded', true);
  let prevented = false;
  window.emit('close', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(window.visible, true);
  assert.equal(window.bounds.width, FOLDED_WIDTH);
  assert.equal(invoke('getWindowState').expanded, false);
  assert.deepEqual(harness.preferences.at(-1).bounds, original);
  harness.tray.emit('click');
  assert.deepEqual(window.bounds, original);
  assert.equal(invoke('getWindowState').folded, false);
  assert.equal(harness.handlers.has('usage:hide'), false);
  harness.app.emit('before-quit');
});

test('show requests unfold a saved tab and fold IPC accepts only trusted boolean requests', async () => {
  const harness = await createHarness({ version: 2, docked: false, folded: true }, ['--show']);
  assert.equal(harness.invoke('getWindowState').folded, false);
  assert.equal(harness.window.bounds.width, 760);
  harness.invoke('setFolded', true, {});
  harness.invoke('setFolded', 'true');
  assert.equal(harness.invoke('getWindowState').folded, false);
  harness.invoke('setFolded', true);
  harness.app.emit('second-instance');
  assert.equal(harness.invoke('getWindowState').folded, false);
  assert.equal(harness.window.bounds.width, 760);
  harness.app.emit('before-quit');
});
