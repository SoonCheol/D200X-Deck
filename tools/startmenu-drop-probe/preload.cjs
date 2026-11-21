const {contextBridge,webUtils,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('probe',{pathForFile:file=>webUtils.getPathForFile(file),versions:{electron:process.versions.electron,chrome:process.versions.chrome},save:text=>ipcRenderer.invoke('save-log',text)});
