'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexUsageMonitor', {
  getSnapshot: () => ipcRenderer.invoke('usage:getSnapshot'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  onSnapshot: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('usage:snapshot', listener);
    return () => ipcRenderer.removeListener('usage:snapshot', listener);
  },
});
