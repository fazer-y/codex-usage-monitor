'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const { createUsageService } = require('./usage-service');
const { snapshotToViewModel } = require('./view-model');

const service = createUsageService();
let tray = null;
let panelWindow = null;
let latestViewModel = null;
let pollTimer = null;
let isQuitting = false;

app.setName('Codex Usage Monitor');
app.whenReady().then(start).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (pollTimer) clearInterval(pollTimer);
});

async function start() {
  createTray();
  createWindow();
  registerIpc();
  await refreshSnapshot();
  pollTimer = setInterval(refreshSnapshot, service.intervalSeconds * 1000);
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray.svg'));
    tray.setToolTip('Codex Usage Monitor');
    tray.on('click', toggleWindow);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Refresh', click: refreshSnapshot },
      { label: 'Open Sessions Folder', click: openSessionsFolder },
      { label: 'Open Settings', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
  } catch (error) {
    console.error(`Tray unavailable: ${error.message}`);
  }
}

function createWindow() {
  panelWindow = new BrowserWindow({
    width: 420,
    height: 560,
    show: !tray,
    resizable: false,
    title: 'Codex Usage Monitor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panelWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  panelWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  panelWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
}

function registerIpc() {
  ipcMain.handle('usage:getSnapshot', () => latestViewModel);
  ipcMain.handle('usage:refresh', refreshSnapshot);
}

async function refreshSnapshot() {
  const snapshot = await service.getSnapshot();
  latestViewModel = snapshotToViewModel(snapshot);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('usage:snapshot', latestViewModel);
  }
  if (tray) tray.setToolTip(`Codex Usage Monitor - ${latestViewModel.title}`);
  return latestViewModel;
}

function toggleWindow() {
  if (!panelWindow) return;
  if (panelWindow.isVisible()) panelWindow.hide();
  else showWindow();
}

function showWindow() {
  if (!panelWindow) return;
  panelWindow.show();
  panelWindow.focus();
}

function openSessionsFolder() {
  shell.openPath(path.join(service.codexHome, 'sessions'));
}
