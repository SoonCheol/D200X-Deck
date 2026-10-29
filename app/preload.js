'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('deckApp', {
  getState: () => ipcRenderer.invoke('app:state'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  pushPage: (images) => ipcRenderer.invoke('deck:push', images),
  setBrightness: (level) => ipcRenderer.invoke('deck:brightness', level),
  setSleepTime: (seconds) => ipcRenderer.invoke('deck:sleep', seconds),
  reconnect: () => ipcRenderer.invoke('deck:reconnect'),
  runAction: (action) => ipcRenderer.invoke('action:run', action),
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  syncPlugins: (actions) => ipcRenderer.invoke('plugins:sync', actions),
  runPluginAction: (actionid) => ipcRenderer.invoke('plugins:run', actionid),
  onKey: (cb) => subscribe('deck:key', cb),
  onStatus: (cb) => subscribe('deck:status', cb),
  onError: (cb) => subscribe('deck:error', cb),
  onBrightness: (cb) => subscribe('deck:brightness', cb),
  onPluginState: (cb) => subscribe('plugin:state', cb),
  onPluginSettings: (cb) => subscribe('plugin:settings', cb),
  onPluginTitle: (cb) => subscribe('plugin:title', cb),
  onPluginToast: (cb) => subscribe('plugin:toast', cb),
  onPluginError: (cb) => subscribe('plugin:error', cb),
  onPluginAlert: (cb) => subscribe('plugin:alert', cb),
});
