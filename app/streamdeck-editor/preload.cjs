'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deckBridge', Object.freeze({
  ready: () => ipcRenderer.send('d200x:renderer-ready'),
  readClipboardImage: () => ipcRenderer.invoke('d200x:clipboard-image'),
  choosePath: kind => ipcRenderer.invoke('d200x:choose-path', kind),
  openWebsite: (url,mode) => ipcRenderer.invoke('d200x:open-website', {url,mode}),
  adjustWindows: (target,direction,count=1) => ipcRenderer.invoke('d200x:adjust-windows', {target,direction,count}),
  scrollWindows: (axis,direction,count=1) => ipcRenderer.invoke('d200x:scroll-windows', {axis,direction,count}),
  editHistory: (operation,count=1) => ipcRenderer.invoke('d200x:edit-history', {operation,count}),
  switchWindows: (target,direction,count=1) => ipcRenderer.invoke('d200x:switch-windows', {target,direction,count}),
  adjustBrightness: (direction,count=1) => ipcRenderer.invoke('d200x:device-brightness', {direction,count}),
  setBrightness: value => ipcRenderer.invoke('d200x:set-safe-brightness', {value}),
  systemShortcut: (target,operation) => ipcRenderer.invoke('d200x:system-shortcut', {target,operation}),
  openLocalPath: (filePath,target) => ipcRenderer.invoke('d200x:open-local-path', {filePath,target}),
  mediaControl: operation => ipcRenderer.invoke('d200x:media-control', {operation}),
  sendHotkey: keys => ipcRenderer.invoke('d200x:send-hotkey', {keys}),
  typeText: (text,enter=false) => ipcRenderer.invoke('d200x:type-text', {text,enter}),
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
