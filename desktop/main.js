'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeTheme, net } = require('electron');
const { createUsageService } = require('./usage-service');
const { snapshotToViewModel } = require('./view-model');
const { observeCodexWindow } = require('./window-observer');
const { CodexTheme } = require('./theme');
const { createDetailAutoCollapse } = require('./detail-auto-collapse');
const { createManagedLifecycle } = require('./managed-lifecycle');
const { monitorAddress, createMonitorBridge } = require('./monitor-bridge');
const { createStartupPricing } = require('./pricing-updater');
const { translator } = require('./i18n');
const { dockBounds, snapPlacement, expandedBounds, foldedBounds, titlebarSpace, DEFAULT_PLACEMENT,
  STRIP_WIDTH, STRIP_MAX_WIDTH, STRIP_HEIGHT } = require('./docking');

const service = createUsageService();
const theme = new CodexTheme(service.codexHome);
const managedLifecycle = createManagedLifecycle(() => app.quit(), { managed: app.isPackaged || process.argv.includes('--managed') });
const detailAutoCollapse = createDetailAutoCollapse(() => {
  if (!isQuitting && panelWindow && !panelWindow.isDestroyed()) setExpanded(false);
});
let tray = null;
let panelWindow = null;
let latestViewModel = null;
let observer = null;
let monitorBridge = null;
let startupPricing = null;
let refreshTask = null;
let refreshAgain = false;
let isQuitting = false;
let ready = false;
let expanded = false;
let folded = false;
let detailsBelow = true;
let stripBounds = null;
let docked = true;
let placement = { ...DEFAULT_PLACEMENT };
let host = null;
let dragging = false;
let settingsFile = null;
let lastSignature = '';
let previousHostPid = null;
let revealUntil = 0;
let lastThemeSignature = '';
let systemLocale = 'en';
let trayLocale = null;

app.setName('Codex Usage Monitor');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv = []) => {
    if (argv.includes('--managed')) managedLifecycle.setManaged();
    else showWindow();
  });
  app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
}
app.on('window-all-closed', event => event.preventDefault());
app.on('before-quit', () => {
  isQuitting = true;
  observer?.close();
  monitorBridge?.close();
  startupPricing?.close();
  managedLifecycle.close();
  detailAutoCollapse.close();
  service.close();
  saveSettings();
});

async function start() {
  startupPricing = createStartupPricing({ file: path.join(app.getPath('userData'), 'pricing.json'), fetch: (url, options) => net.fetch(url, options) });
  await startupPricing.load();
  systemLocale = app.getLocale?.() || 'en';
  nativeTheme.themeSource = 'system';
  theme.forView(undefined, nativeTheme.shouldUseDarkColors, systemLocale);
  Menu.setApplicationMenu(null);
  settingsFile = path.join(app.getPath('userData'), 'window-state.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  if (saved.version === 2) {
    if (typeof saved.docked === 'boolean') docked = saved.docked;
    if (typeof saved.folded === 'boolean') folded = saved.folded;
    if (['top', 'bottom', 'left', 'right'].includes(saved.placement?.edge) && Number.isFinite(saved.placement.offset)) placement = saved.placement;
  }
  createTray();
  createWindow(saved.bounds);
  registerIpc();
  if (process.platform === 'win32') {
    monitorBridge = createMonitorBridge({ address: monitorAddress(app.getPath('userData')), getSnapshot: refreshSnapshot,
      onConnectionsChanged: count => managedLifecycle.setConnections(count) });
    await monitorBridge.listen();
  }
  observer = observeCodexWindow(updateHost, error => console.error('Window observer: ' + error.message));
  service.start(refreshSnapshot);
  await refreshSnapshot();
  startupPricing.refresh().then(result => {
    if (result.updated) refreshSnapshot();
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
    tray.setToolTip('Codex Usage Monitor');
    tray.on('click', showWindow);
    updateTrayLanguage(theme.theme?.locale);
  } catch (error) { console.error('Tray unavailable: ' + error.message); }
}

function updateTrayLanguage(locale) {
  if (!tray || locale === trayLocale) return;
  trayLocale = locale;
  const t = translator(locale);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('showStrip'), click: showWindow },
    { label: t('dockTitlebar'), click: () => setDocked(true) },
    { label: t('refresh'), click: refreshSnapshot },
    { type: 'separator' },
    { label: t('quit'), click: () => app.quit() },
  ]));
}

function createWindow(savedBounds) {
  const work = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Number.isFinite(savedBounds?.width) && savedBounds.width > 0 ? savedBounds.width : STRIP_WIDTH, work.width);
  const initial = savedBounds && Number.isFinite(savedBounds.x) && Number.isFinite(savedBounds.y)
    ? { x: savedBounds.x, y: savedBounds.y }
    : { x: work.x + Math.round((work.width - Math.min(STRIP_WIDTH, work.width)) / 2), y: work.y + 4 };
  panelWindow = new BrowserWindow({
    ...initial, width, height: STRIP_HEIGHT,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    show: false, resizable: false, maximizable: false, skipTaskbar: true,
    title: 'Codex Usage Monitor',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  stripBounds = panelWindow.getBounds();
  panelWindow.setMenuBarVisibility(false);
  panelWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panelWindow.webContents.on('will-navigate', event => event.preventDefault());
  panelWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  panelWindow.once('ready-to-show', () => {
    ready = true;
    sendWindowState();
    if (process.argv.includes('--show') || !tray) showWindow();
    else synchronizeWindow();
  });
  panelWindow.on('will-move', () => { dragging = true; docked = false; sendWindowState(); });
  panelWindow.on('moved', () => {
    if (!dragging) return;
    dragging = false;
    if (host?.found && !host.minimized) {
      const match = snapPlacement(compactBounds(), hostBounds());
      if (match) { placement = match; docked = true; }
    }
    saveSettings();
    sendWindowState();
    synchronizeWindow();
  });
  panelWindow.on('close', event => { if (!isQuitting) { event.preventDefault(); setFolded(true); } });
  panelWindow.on('focus', () => detailAutoCollapse.setFocused(true));
  panelWindow.on('blur', () => detailAutoCollapse.setFocused(false));
}

function registerIpc() {
  const fromPanel = event => panelWindow && event.sender === panelWindow.webContents;
  ipcMain.handle('usage:getSnapshot', () => latestViewModel);
  ipcMain.handle('usage:getTheme', event => fromPanel(event) ? theme.theme : null);
  ipcMain.handle('usage:getWindowState', event => fromPanel(event) ? windowState() : null);
  ipcMain.handle('usage:refresh', event => fromPanel(event) ? refreshSnapshot() : null);
  ipcMain.handle('usage:setExpanded', (event, value) => {
    if (!fromPanel(event) || typeof value !== 'boolean') return;
    detailAutoCollapse.setFocused(panelWindow.isFocused());
    return setExpanded(value);
  });
  ipcMain.handle('usage:setDocked', (event, value) => {
    if (fromPanel(event) && typeof value === 'boolean') setDocked(value);
  });
  ipcMain.handle('usage:setFolded', (event, value) => {
    if (fromPanel(event) && typeof value === 'boolean') return setFolded(value);
  });
}

function updateHost(value) {
  host = value;
  managedLifecycle.setHostPresent(value.found);
  if (value.found && value.pid !== previousHostPid) {
    previousHostPid = value.pid;
    service.setHostPid(value.pid);
    refreshSnapshot();
  }
  synchronizeWindow();
}

function hostBounds() {
  return screen.screenToDipRect(null, { x: host.x, y: host.y, width: host.width, height: host.height });
}

function compactBounds() {
  if (folded && stripBounds) return { ...stripBounds };
  const bounds = panelWindow.getBounds();
  return { ...bounds, y: detailsBelow ? bounds.y : bounds.y + bounds.height - STRIP_HEIGHT, height: STRIP_HEIGHT };
}

function applyBounds(anchor, workArea, preferBelow, rightEdge) {
  stripBounds = { ...anchor };
  const layout = folded ? { bounds: foldedBounds(anchor, workArea, rightEdge), detailsBelow: preferBelow }
    : expandedBounds(anchor, expanded, workArea, preferBelow);
  const changed = detailsBelow !== layout.detailsBelow;
  detailsBelow = layout.detailsBelow;
  const current = panelWindow.getBounds();
  if (['x', 'y', 'width', 'height'].some(key => Math.abs(current[key] - layout.bounds[key]) > 1)) panelWindow.setBounds(layout.bounds);
  if (changed) sendWindowState();
}

function synchronizeWindow() {
  if (!ready || panelWindow.isDestroyed() || dragging) return;
  if (docked && host?.found) {
    if (host.minimized) { panelWindow.hide(); return; }
    const bounds = hostBounds();
    const workArea = screen.getDisplayMatching(bounds).workArea;
    const inTitlebar = placement.edge === 'top' && placement.side === 'inside';
    const width = inTitlebar ? STRIP_MAX_WIDTH : STRIP_WIDTH;
    const target = dockBounds(bounds, { width, height: STRIP_HEIGHT }, workArea, placement);
    applyBounds(target, workArea, placement.edge === 'top', inTitlebar ? titlebarSpace(bounds).right : undefined);
    const active = host.active || host.foregroundPid === process.pid || Date.now() < revealUntil;
    if (!active) { panelWindow.hide(); return; }
    if (!panelWindow.isAlwaysOnTop()) panelWindow.setAlwaysOnTop(true, 'floating');
    if (!panelWindow.isVisible()) panelWindow.showInactive();
  } else {
    const anchor = compactBounds();
    applyBounds(anchor, screen.getDisplayMatching(anchor).workArea, detailsBelow);
    if (panelWindow.isAlwaysOnTop()) panelWindow.setAlwaysOnTop(false);
    if (!panelWindow.isVisible()) panelWindow.showInactive();
  }
}

function refreshSnapshot() {
  if (isQuitting) return Promise.resolve(latestViewModel);
  if (refreshTask) { refreshAgain = true; return refreshTask; }
  refreshTask = service.getSnapshot().then(snapshot => {
    const viewKey = snapshot.selection?.mode === 'desktop' ? snapshot.selection.id + ':' + snapshot.selection.viewedAt
      : snapshot.summary?.sessionId || snapshot.transcriptPath || 'waiting';
    const palette = theme.forView(viewKey, nativeTheme.shouldUseDarkColors, systemLocale);
    updateTrayLanguage(palette.locale);
    const themeSignature = JSON.stringify(palette);
    if (themeSignature !== lastThemeSignature && panelWindow && !panelWindow.isDestroyed()) {
      lastThemeSignature = themeSignature;
      panelWindow.webContents.send('usage:theme', palette);
    }
    latestViewModel = snapshotToViewModel(snapshot, Date.now(), palette.locale);
    const signature = JSON.stringify({ ...latestViewModel, generatedAt: null });
    if (signature !== lastSignature && panelWindow && !panelWindow.isDestroyed()) {
      lastSignature = signature;
      panelWindow.webContents.send('usage:snapshot', latestViewModel);
      tray?.setToolTip('Codex Usage Monitor · ' + (snapshot.conversationTitle || latestViewModel.title));
    }
    return latestViewModel;
  }).catch(error => { console.error(error); return latestViewModel; }).finally(() => {
    refreshTask = null;
    synchronizeWindow();
    if (refreshAgain && !isQuitting) { refreshAgain = false; setImmediate(refreshSnapshot); }
  });
  return refreshTask;
}

function setDocked(value) {
  docked = value;
  if (value) placement = { ...DEFAULT_PLACEMENT };
  synchronizeWindow();
  saveSettings();
  sendWindowState();
}

function setExpanded(value) {
  const anchor = compactBounds();
  expanded = value && !folded;
  detailAutoCollapse.setExpanded(expanded);
  if (!docked || !host?.found) applyBounds(anchor, screen.getDisplayMatching(anchor).workArea, detailsBelow);
  synchronizeWindow();
  sendWindowState();
  return windowState();
}

function setFolded(value) {
  if (value === folded) return windowState();
  const anchor = compactBounds();
  folded = value;
  if (folded) {
    expanded = false;
    detailAutoCollapse.setExpanded(false);
  }
  if (!docked || !host?.found) applyBounds(anchor, screen.getDisplayMatching(anchor).workArea, detailsBelow);
  synchronizeWindow();
  saveSettings();
  sendWindowState();
  return windowState();
}

function windowState() { return { docked, expanded, folded, detailsBelow }; }

function sendWindowState() {
  if (ready && !panelWindow.isDestroyed()) panelWindow.webContents.send('usage:windowState', windowState());
}

function saveSettings() {
  if (!settingsFile || !panelWindow || panelWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(settingsFile, JSON.stringify({ version: 2, docked, placement, folded, bounds: compactBounds() }) + '\n');
  } catch (error) { console.error('Window preferences: ' + error.message); }
}

function showWindow() {
  revealUntil = Date.now() + 10000;
  if (!ready) { folded = false; return; }
  setFolded(false);
  synchronizeWindow();
  panelWindow.show();
  panelWindow.focus();
}
