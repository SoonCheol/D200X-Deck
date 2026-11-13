'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deckBridge', Object.freeze({
  ready: () => ipcRenderer.send('d200x:renderer-ready'),
  readClipboardImage: () => ipcRenderer.invoke('d200x:clipboard-image'),
  syncPage: images => ipcRenderer.send('d200x:sync-page', images),
  onStatus: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('d200x:status', (_event, status) => callback(status));
  },
  onKey: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('d200x:key', (_event, key) => callback(key));
  },
  onSynced: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('d200x:synced', (_event, details) => callback(details));
  },
  onError: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('d200x:error', (_event, message) => callback(String(message)));
  },
}));
