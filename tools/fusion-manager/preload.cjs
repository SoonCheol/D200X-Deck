'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fusionManager',{
 catalog:()=>ipcRenderer.invoke('catalog'),
 icon:id=>ipcRenderer.invoke('fusion-icon',id),
 iconHealth:()=>ipcRenderer.invoke('fusion-icon-health'),
 collectIcon:id=>ipcRenderer.invoke('fusion-icon-collect',id),
 save:(data,defaultName)=>ipcRenderer.invoke('save-json',{data,defaultName}),
 open:()=>ipcRenderer.invoke('open-json')
});
