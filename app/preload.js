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
  listApps: () => ipcRenderer.invoke('apps:list'),
  appIcon: (path) => ipcRenderer.invoke('apps:icon', path),
  fetchSiteIcon: (url) => ipcRenderer.invoke('fetch:site-icon', url),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  syncPlugins: (actions) => ipcRenderer.invoke('plugins:sync', actions),
  runPluginAction: (actionid) => ipcRenderer.invoke('plugins:run', actionid),
  installPluginFolder: () => ipcRenderer.invoke('plugins:install-folder'),
  installPluginZip: () => ipcRenderer.invoke('plugins:install-zip'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  removePlugin: (uuid) => ipcRenderer.invoke('plugins:remove', uuid),
  openPluginsFolder: () => ipcRenderer.invoke('plugins:open-folder'),
  revealPlugin: (uuid) => ipcRenderer.invoke('plugins:reveal', uuid),
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
  onSeizePermission: (cb) => subscribe('seize:permission', cb),
  onPluginsChanged: (cb) => subscribe('plugins:changed', cb),
});
