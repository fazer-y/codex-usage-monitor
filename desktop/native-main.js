'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { createUsageService } = require('./usage-service');
const { snapshotToViewModel } = require('./view-model');
const { observeCodexWindow } = require('./window-observer');
const { CodexTheme } = require('./theme');
const { createDetailAutoCollapse } = require('./detail-auto-collapse');
const { createManagedLifecycle } = require('./managed-lifecycle');
const { monitorAddress, createMonitorBridge } = require('./monitor-bridge');
const { createStartupPricing } = require('./pricing-updater');
const { translator } = require('./i18n');
const { dockBounds, snapPlacement, expandedBounds, foldedBounds, titlebarSpace,
  DEFAULT_PLACEMENT, STRIP_WIDTH, STRIP_MAX_WIDTH, STRIP_HEIGHT } = require('./docking');

function createNativeController({ send, service, userData, observerFactory = observeCodexWindow,
  theme = new CodexTheme(service.codexHome), fetch = globalThis.fetch, now = Date.now,
  bridgeFactory = createMonitorBridge, pricingFactory = createStartupPricing,
  lifecycleOptions = { managed: process.argv.includes('--managed') }, onExit = () => {} }) {
  const settingsFile = path.join(userData, 'window-state.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  let docked = saved.version === 2 ? saved.docked !== false : true;
  let folded = saved.version === 2 && saved.folded === true;
  let placement = saved.version === 2 && ['top', 'bottom', 'left', 'right'].includes(saved.placement?.edge)
    ? saved.placement : { ...DEFAULT_PLACEMENT };
  let anchor = saved.version === 2 && Number.isFinite(saved.bounds?.x) ? saved.bounds : null;
  let expanded = false;
  let detailsBelow = true;
  let host = null;
  let native = null;
  let observer = null;
  let bridge = null;
  let pricing = null;
  let stopped = false;
  let refreshTask = null;
  let refreshAgain = false;
  let latest = null;
  let revealUntil = 0;
  let uiSignature = '';
  let snapshotSignature = '';
  let themeSignature = '';
  let previousHostPid = null;
  const collapse = createDetailAutoCollapse(() => { expanded = false; synchronize(); });
  const lifecycle = createManagedLifecycle(() => close(), lifecycleOptions);

  function save() {
    try {
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(settingsFile, JSON.stringify({ version: 2, docked, placement, folded, bounds: anchor }) + '\n');
    } catch (error) { console.error('Window preferences: ' + error.message); }
  }

  function normalize(rect, scale) {
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, rect[key] / scale]));
  }

  function synchronize() {
    if (!native || stopped) return;
    const scale = host?.found ? host.scale || 1 : native.scale || 1;
    const work = normalize(host?.found && host.workArea ? host.workArea : native.workArea, scale);
    let rightEdge;
    if (docked && host?.found) {
      const bounds = normalize(host, scale);
      const titlebar = placement.edge === 'top' && placement.side === 'inside';
      anchor = dockBounds(bounds, { width: titlebar ? STRIP_MAX_WIDTH : STRIP_WIDTH, height: STRIP_HEIGHT }, work, placement);
      if (titlebar) rightEdge = titlebarSpace(bounds).right;
    } else if (!anchor) {
      anchor = { x: work.x + (work.width - Math.min(STRIP_WIDTH, work.width)) / 2, y: work.y + 4,
        width: Math.min(STRIP_WIDTH, work.width), height: STRIP_HEIGHT };
    }
    const layout = folded ? { bounds: foldedBounds(anchor, work, rightEdge), detailsBelow }
      : expandedBounds(anchor, expanded, work, placement.edge === 'top' || detailsBelow);
    detailsBelow = layout.detailsBelow;
    const visible = !docked || !host?.found || (!host.minimized
      && (host.active || host.foregroundPid === native.pid || now() < revealUntil));
    const state = { bounds: Object.fromEntries(Object.entries(layout.bounds).map(([key, value]) => [key, Math.round(value * scale)])),
      docked, folded, expanded: expanded && !folded, detailsBelow,
      visible, topmost: Boolean(docked && host?.found), scale };
    const signature = JSON.stringify(state);
    if (signature !== uiSignature) { uiSignature = signature; send({ event: 'window', data: state }); }
  }

  function updateHost(value) {
    host = value;
    lifecycle.setHostPresent(value.found);
    if (value.found && value.pid !== previousHostPid) {
      previousHostPid = value.pid;
      service.setHostPid(value.pid);
      refresh();
    }
    synchronize();
  }

  function refresh() {
    if (stopped) return Promise.resolve(latest);
    if (refreshTask) { refreshAgain = true; return refreshTask; }
    refreshTask = service.getSnapshot().then(snapshot => {
      const key = snapshot.selection?.mode === 'desktop' ? snapshot.selection.id + ':' + snapshot.selection.viewedAt
        : snapshot.summary?.sessionId || snapshot.transcriptPath || 'waiting';
      const palette = theme.forView(key, native?.systemDark || false, native?.locale || 'en');
      const t = translator(palette.locale);
      const translated = { ...palette, labels: Object.fromEntries(['showStrip', 'dockTitlebar', 'refresh', 'quit',
        'detach', 'expandDetails', 'collapseDetails', 'foldStrip', 'expandStrip', 'dragStrip', 'fastMode'].map(key => [key, t(key)])) };
      const nextTheme = JSON.stringify(translated);
      if (nextTheme !== themeSignature) { themeSignature = nextTheme; send({ event: 'theme', data: translated }); }
      latest = snapshotToViewModel(snapshot, now(), palette.locale);
      latest.activeTurnStartedAt = snapshot.summary?.currentTurn?.status === 'active' ? snapshot.summary.currentTurn.startedAt : null;
      const signature = JSON.stringify({ ...latest, generatedAt: null });
      if (signature !== snapshotSignature) { snapshotSignature = signature; send({ event: 'snapshot', data: latest }); }
      return latest;
    }).catch(error => { console.error('Usage refresh: ' + error.message); return latest; }).finally(() => {
      refreshTask = null;
      if (refreshAgain && !stopped) { refreshAgain = false; setImmediate(refresh); }
    });
    return refreshTask;
  }

  async function start(value) {
    native = value;
    if (process.argv.includes('--show')) { folded = false; revealUntil = now() + 10000; }
    pricing = pricingFactory({ file: path.join(userData, 'pricing.json'), fetch });
    await pricing.load();
    bridge = bridgeFactory({ address: monitorAddress(userData), getSnapshot: refresh,
      onConnectionsChanged: count => lifecycle.setConnections(count) });
    await bridge.listen();
    observer = observerFactory(updateHost, error => console.error('Window observer: ' + error.message));
    service.start(refresh);
    await refresh();
    synchronize();
    pricing.refresh().then(result => { if (result.updated) refresh(); });
  }

  async function receive(value) {
    if (value.method === 'ready') return start(value.data);
    if (stopped || !native) return;
    if (value.method === 'show') { folded = false; revealUntil = now() + 10000; }
    else if (value.method === 'refresh') await refresh();
    else if (value.method === 'expanded') {
      expanded = typeof value.value === 'boolean' ? value.value && !folded : !expanded && !folded;
      collapse.setExpanded(expanded);
    } else if (value.method === 'folded') {
      folded = value.value === true;
      if (folded) { expanded = false; collapse.setExpanded(false); }
    } else if (value.method === 'docked') {
      docked = value.value === true;
      if (docked) placement = { ...DEFAULT_PLACEMENT };
    } else if (value.method === 'focus') { collapse.setFocused(value.value === true); }
    else if (value.method === 'dragged') {
      const scale = value.data.scale || native.scale || 1;
      const bounds = normalize(value.data.bounds, scale);
      anchor = { ...bounds, y: detailsBelow ? bounds.y : bounds.y + bounds.height - STRIP_HEIGHT, height: STRIP_HEIGHT };
      docked = false;
      if (host?.found && !host.minimized) {
        const match = snapPlacement(anchor, normalize(host, host.scale || 1));
        if (match) { placement = match; docked = true; }
      }
    } else if (value.method === 'quit') return close();
    synchronize();
    if (['docked', 'folded', 'dragged', 'show'].includes(value.method)) save();
  }

  async function close() {
    if (stopped) return;
    stopped = true;
    save();
    observer?.close();
    bridge?.close();
    pricing?.close();
    lifecycle.close();
    collapse.close();
    await service.close();
    send({ event: 'quit' });
    onExit();
  }

  return { receive, refresh, close };
}

if (require.main === module) {
  const userData = process.env.CODEX_USAGE_MONITOR_USER_DATA
    || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Codex Usage Monitor');
  const controller = createNativeController({ userData,
    service: createUsageService({ cacheDirectory: path.join(userData, 'session-cache') }),
    send: value => process.stdout.write(JSON.stringify(value) + '\n'), onExit: () => process.exit(0) });
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', line => {
    if (line.length > 65536) return;
    try { controller.receive(JSON.parse(line)).catch(error => console.error('Native command: ' + error.message)); }
    catch (error) { console.error('Native input: ' + error.message); }
  });
  process.stdin.once('end', () => controller.close());
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.close());
}

module.exports = { createNativeController };
