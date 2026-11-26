'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { observeAntigravityWindow } = require('./window-observer');
const { presentation } = require('./presentation');
const { dockBounds, snapPlacement, foldedBounds, titlebarSpace,
  DEFAULT_PLACEMENT, STRIP_WIDTH, STRIP_MAX_WIDTH, STRIP_HEIGHT } = require('./docking');

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const READ_INTERVAL = 900;
const DETAILS_CAPTION = /^Usage Monitor - Antigravi(?:ty|\.\.\.)$/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function rectangleToDip(rect, scale) {
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, rect[key] / scale]));
}

function createController({ store, userData, send, exit, observe = observeAntigravityWindow,
  appSettings = path.join(appData, 'Antigravity', 'app_storage.json') }) {
  const file = path.join(userData, 'window-state.json');
  const saved = readJson(file) || {};
  let docked = saved.docked !== false;
  let folded = saved.folded === true;
  let placement = ['top', 'bottom', 'left', 'right'].includes(saved.placement?.edge)
    && Number.isFinite(saved.placement.offset) ? saved.placement : { ...DEFAULT_PLACEMENT };
  let anchor = ['x', 'y'].every(key => Number.isFinite(saved.anchor?.[key]))
    ? { x: saved.anchor.x, y: saved.anchor.y, width: STRIP_WIDTH, height: STRIP_HEIGHT } : null;
  let displayed = false;
  let native = null;
  let host = null;
  let observer = null;
  let poll = null;
  let closeTimer = null;
  let closed = false;
  let view;
  let lastCaption = '';
  let loggedError = null;
  const previous = new Map();

  function publish(event, data) {
    const signature = JSON.stringify(data);
    if (previous.get(event) === signature) return;
    previous.set(event, signature);
    send({ event, data });
  }

  function updateTheme() {
    const surface = readJson(appSettings)?.hubSurfaceBackgroundColor;
    view = presentation(native.locale, native.systemDark, surface);
    publish('theme', view.theme);
  }

  function layout() {
    if (!native || closed) return;
    const scale = host?.found ? host.scale || 1 : native.scale || 1;
    const work = rectangleToDip(host?.workArea || native.workArea, scale);
    let rightEdge;
    if (docked && host?.found) {
      const bounds = rectangleToDip(host, scale);
      const titlebar = placement.edge === 'top' && placement.side === 'inside';
      const size = { width: STRIP_WIDTH, maxWidth: STRIP_MAX_WIDTH, height: STRIP_HEIGHT };
      anchor = dockBounds(bounds, size, work, placement);
      if (titlebar) rightEdge = titlebarSpace(bounds).right;
    }
    if (!anchor) {
      const width = Math.min(work.width, STRIP_WIDTH);
      anchor = { x: work.x + (work.width - width) / 2, y: work.y + 4, width, height: STRIP_HEIGHT };
    }
    const bounds = folded ? foldedBounds(anchor, work, rightEdge) : anchor;
    const visible = Boolean(host?.found && !host.minimized && !DETAILS_CAPTION.test(host.title)
      && (!docked || host.active || host.foregroundPid === native.pid));
    publish('window', {
      bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value * scale)])),
      docked, folded, visible, topmost: docked,
    });
    const wasDisplayed = displayed;
    displayed = visible && !folded;
    if (!displayed) stopPoll();
    if (displayed && !wasDisplayed) refresh();
  }

  function save() {
    try {
      fs.mkdirSync(userData, { recursive: true });
      const temp = file + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ docked, folded, placement, anchor }) + '\n');
      fs.renameSync(temp, file);
    } catch (error) { console.error('Window preferences: ' + error.code); }
  }

  function stopPoll() {
    clearTimeout(poll);
    poll = null;
  }

  function refresh() {
    stopPoll();
    if (!displayed || closed) return;
    try {
      const session = store.read(host.title);
      if (session) lastCaption = host.title;
      publish('snapshot', view.snapshot(session).bar);
      loggedError = null;
    } catch (error) {
      const code = error.code || error.name;
      if (code !== loggedError) console.error('Usage refresh: ' + code);
      loggedError = code;
      // Wait for the writer to release transient SQLite locks.
      if (error.errcode !== 5 && error.errcode !== 6) publish('snapshot', view.snapshot(null, true).bar);
    }
    poll = setTimeout(refresh, READ_INTERVAL);
  }

  function updateHost(value) {
    const switched = value.title !== host?.title || value.handle !== host?.handle;
    const first = host === null;
    if (switched && host?.found && host.active && !displayed) {
      try { if (store.read(host.title)) lastCaption = host.title; } catch {}
    }
    host = value;
    if (value.found) clearTimeout(closeTimer);
    else if (first || switched) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, first ? 30_000 : 2200);
    }
    if (switched) {
      if (!value.found) store.release();
      updateTheme();
    }
    const wasDisplayed = displayed;
    layout();
    if (switched && wasDisplayed && displayed) refresh();
  }

  function receive({ method, value, data }) {
    if (closed) return;
    if (method === 'ready' && !native) {
      native = data;
      if (native.reveal) folded = false;
      updateTheme();
      layout();
      observer = observe(updateHost, error => { console.error('Window observer: ' + error.message); close(); });
      return;
    }
    if (!native) return;
    if (method === 'quit') { close(); return; }
    if (method === 'show') folded = false;
    if (method === 'refresh') {
      updateTheme();
      refresh();
    }
    if (method === 'folded') folded = value === true;
    if (method === 'docked') {
      docked = value === true;
      if (docked) placement = { ...DEFAULT_PLACEMENT };
      else if (anchor) anchor = { ...anchor, width: STRIP_WIDTH };
    }
    if (method === 'dragged') {
      const bounds = rectangleToDip(data.bounds, data.scale || native.scale || 1);
      anchor = { ...bounds, width: STRIP_WIDTH, height: STRIP_HEIGHT };
      const match = host?.found && !host.minimized ? snapPlacement(bounds, rectangleToDip(host, host.scale || 1)) : null;
      docked = Boolean(match);
      if (match) placement = match;
    }
    layout();
    if (['docked', 'folded', 'dragged', 'show'].includes(method)) save();
  }

  function close() {
    if (closed) return;
    closed = true;
    stopPoll();
    clearTimeout(closeTimer);
    observer?.close();
    store.close();
    send({ event: 'quit' }, exit);
  }

  function details(id) {
    const ui = view || presentation('en', false);
    try {
      const current = id ? store.readId(id) : null;
      if (current) return ui.snapshot(current).details;
      const byCaption = host?.found && !DETAILS_CAPTION.test(host.title) ? store.read(host.title) : null;
      if (byCaption) lastCaption = host.title;
      const session = byCaption || (lastCaption ? store.read(lastCaption) : null);
      return ui.snapshot(session).details;
    } catch {
      return ui.snapshot(null, true).details;
    }
  }

  return { receive, close, details };
}

module.exports = { createController };
