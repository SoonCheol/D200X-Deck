'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('deckBridge', Object.freeze({
  readProfile: () => ipcRenderer.sendSync('d200x:profile-read'),
  writeProfile: state => ipcRenderer.sendSync('d200x:profile-write',state),
  foregroundApp: () => ipcRenderer.invoke('d200x:foreground-app'),
  appVersion: () => ipcRenderer.invoke('d200x:app-version'),
  checkForUpdates: () => ipcRenderer.invoke('d200x:check-updates'),
  haStatus: () => ipcRenderer.invoke('d200x:ha-status'),
  sdkList: () => ipcRenderer.invoke('d200x:sdk-list'),
  fusionHealth: () => ipcRenderer.invoke('d200x:fusion-health'),
  openFusionManager: () => ipcRenderer.invoke('d200x:open-fusion-manager'),
  installFusionAddin: () => ipcRenderer.invoke('d200x:fusion-addin-install'),
  fusionIconRead: id => ipcRenderer.invoke('d200x:fusion-icon-read',id),
  fusionIconWrite: (id,png) => ipcRenderer.invoke('d200x:fusion-icon-write',id,png),
  sdkInstall: () => ipcRenderer.invoke('d200x:sdk-install'),
  sdkInstallFolder: () => ipcRenderer.invoke('d200x:sdk-install-folder'),
  sdkSync: contexts => ipcRenderer.invoke('d200x:sdk-sync',contexts),
  sdkKey: (context,gesture,ticks=1) => ipcRenderer.invoke('d200x:sdk-key',context,gesture,ticks),
  sdkInspector: context => ipcRenderer.invoke('d200x:sdk-inspector',context),
  onSdkEvent: fn => ipcRenderer.on('d200x:sdk-event',(_event,data)=>fn(data)),
  haSave: (url,token) => ipcRenderer.invoke('d200x:ha-save',{url,token}),
  haEntities: () => ipcRenderer.invoke('d200x:ha-entities'),
  haToggle: entityId => ipcRenderer.invoke('d200x:ha-toggle',entityId),
  ready: () => ipcRenderer.send('d200x:renderer-ready'),
  readClipboardImage: () => ipcRenderer.invoke('d200x:clipboard-image'),
  choosePath: kind => ipcRenderer.invoke('d200x:choose-path', kind),
  inspectAppFile: filePath => ipcRenderer.invoke('d200x:inspect-app-file',filePath),
  inspectDroppedTarget: (filePath,allowAppId=false) => ipcRenderer.invoke('d200x:inspect-dropped-target',{filePath,allowAppId}),
  droppedFilePath: file => webUtils.getPathForFile(file),
  chooseImportFile: kind => ipcRenderer.invoke('d200x:choose-import-file',kind),
  listIconPacks: () => ipcRenderer.invoke('d200x:list-icon-packs'),
  importIconPack: () => ipcRenderer.invoke('d200x:import-icon-pack'),
  importIconFolder: () => ipcRenderer.invoke('d200x:import-icon-folder'),
  removeIconPack: id => ipcRenderer.invoke('d200x:remove-icon-pack',id),
  openWebsite: (url,mode,browserPath='') => ipcRenderer.invoke('d200x:open-website', {url,mode,browserPath}),
  adjustWindows: (target,direction,count=1) => ipcRenderer.invoke('d200x:adjust-windows', {target,direction,count}),
  scrollWindows: (axis,direction,count=1) => ipcRenderer.invoke('d200x:scroll-windows', {axis,direction,count}),
  editHistory: (operation,count=1) => ipcRenderer.invoke('d200x:edit-history', {operation,count}),
  switchWindows: (target,direction,count=1) => ipcRenderer.invoke('d200x:switch-windows', {target,direction,count}),
  sleepDisplay: () => ipcRenderer.invoke('d200x:sleep-display'),
  adjustBrightness: (direction,count=1) => ipcRenderer.invoke('d200x:device-brightness', {direction,count}),
  setBrightness: value => ipcRenderer.invoke('d200x:set-safe-brightness', {value}),
  systemShortcut: (target,operation) => ipcRenderer.invoke('d200x:system-shortcut', {target,operation}),
  openLocalPath: (filePath,target,args='') => ipcRenderer.invoke('d200x:open-local-path', {filePath,target,args}),
  mediaControl: operation => ipcRenderer.invoke('d200x:media-control', {operation}),
  sendHotkey: keys => ipcRenderer.invoke('d200x:send-hotkey', {keys}),
  typeText: (text,enter=false) => ipcRenderer.invoke('d200x:type-text', {text,enter}),
  pasteText: (text,enter=false) => ipcRenderer.invoke('d200x:paste-text', {text,enter}),
  focusLocalApp: filePath => ipcRenderer.invoke('d200x:focus-local-app',{filePath}),
  audioFileUrl: filePath => ipcRenderer.invoke('d200x:audio-file-url', {filePath}),
  closeLocalApp: (filePath,force=false) => ipcRenderer.invoke('d200x:close-local-app', {filePath,force}),
  syncPage: (images,mode='blank') => ipcRenderer.send('d200x:sync-page', images,mode),
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
