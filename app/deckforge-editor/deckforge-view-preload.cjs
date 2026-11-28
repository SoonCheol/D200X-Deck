'use strict';
// Deliberately separate from the main editor preload.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('deckforgeView',Object.freeze({
  getInput:()=>ipcRenderer.invoke('deckforge:native-view-input'),
  submit:value=>ipcRenderer.invoke('deckforge:native-view-submit',value),
  close:()=>ipcRenderer.invoke('deckforge:native-view-close')
}));
