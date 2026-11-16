'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fusionManager',{
 catalog:()=>ipcRenderer.invoke('catalog'),
 windowMode:mode=>ipcRenderer.invoke('window-mode',mode),
 openCapture:()=>ipcRenderer.invoke('open-ui-capture'),
 loadVisibility:()=>ipcRenderer.invoke('curation-load'),
 saveVisibility:data=>ipcRenderer.invoke('curation-save',data),
 icon:id=>ipcRenderer.invoke('fusion-icon',id),
 iconHealth:()=>ipcRenderer.invoke('fusion-icon-health'),
 collectIcon:id=>ipcRenderer.invoke('fusion-icon-collect',id),
 save:(data,defaultName)=>ipcRenderer.invoke('save-json',{data,defaultName}),
 open:()=>ipcRenderer.invoke('open-json')
});
