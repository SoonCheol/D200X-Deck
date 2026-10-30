'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popAPI', {
  onItems: (callback) => ipcRenderer.on('pop:items', (_event, items) => callback(items)),
  choose: (index) => ipcRenderer.send('pop:choice', index),
});
