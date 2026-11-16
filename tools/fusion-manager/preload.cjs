'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fusionManager',{
 catalog:()=>ipcRenderer.invoke('catalog'),
 save:(data,defaultName)=>ipcRenderer.invoke('save-json',{data,defaultName}),
 open:()=>ipcRenderer.invoke('open-json')
});
