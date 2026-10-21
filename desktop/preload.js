'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexUsageMonitor', {
  getSnapshot: () => ipcRenderer.invoke('usage:getSnapshot'),
  getWindowState: () => ipcRenderer.invoke('usage:getWindowState'),
  getTheme: () => ipcRenderer.invoke('usage:getTheme'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  setExpanded: value => ipcRenderer.invoke('usage:setExpanded', value),
  setDocked: value => ipcRenderer.invoke('usage:setDocked', value),
  hide: () => ipcRenderer.invoke('usage:hide'),
  onTheme: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, theme) => callback(theme);
    ipcRenderer.on('usage:theme', listener);
    return () => ipcRenderer.removeListener('usage:theme', listener);
  },
  onWindowState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('usage:windowState', listener);
    return () => ipcRenderer.removeListener('usage:windowState', listener);
  },
  onSnapshot: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('usage:snapshot', listener);
    return () => ipcRenderer.removeListener('usage:snapshot', listener);
  },
});
