'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fusionManager',{
 catalog:()=>ipcRenderer.invoke('catalog'),
 menuCatalog:()=>ipcRenderer.invoke('menu-catalog'),
 helpMarkdown:()=>ipcRenderer.invoke('help-markdown'),
 openDeckForge:()=>ipcRenderer.invoke('manager-open-deckforge'),
 dock:operation=>ipcRenderer.invoke('manager-dock',operation),
 fusionScript:()=>ipcRenderer.invoke('fusion-ui-script'),
 copyFusionScript:()=>ipcRenderer.invoke('fusion-script-copy'),
 windowMode:mode=>ipcRenderer.invoke('window-mode',mode),
 openCapture:()=>ipcRenderer.invoke('open-ui-capture'),
 prepareEnglish:()=>ipcRenderer.invoke('fusion-english-prepare'),
 importEnglish:()=>ipcRenderer.invoke('fusion-english-import'),
 loadEnglish:()=>ipcRenderer.invoke('fusion-english-load'),
 loadDisplayLanguage:()=>ipcRenderer.invoke('fusion-display-language-load'),
 saveDisplayLanguage:language=>ipcRenderer.invoke('fusion-display-language-save',language),
 loadCapture:()=>ipcRenderer.invoke('capture-load'),
 loadVisibility:()=>ipcRenderer.invoke('curation-load'),
 saveVisibility:data=>ipcRenderer.invoke('curation-save',data),
 icon:id=>ipcRenderer.invoke('fusion-icon',id),
 iconHealth:()=>ipcRenderer.invoke('fusion-icon-health'),
 commandStatus:id=>ipcRenderer.invoke('fusion-command-status',id),
 collectIcon:id=>ipcRenderer.invoke('fusion-icon-collect',id),
 collectTooltips:()=>ipcRenderer.invoke('fusion-tooltip-collect'),
 save:(data,defaultName)=>ipcRenderer.invoke('save-json',{data,defaultName}),
 open:()=>ipcRenderer.invoke('open-json')
});
