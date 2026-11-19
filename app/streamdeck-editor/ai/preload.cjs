'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,arg)=>ipcRenderer.invoke('deckforge-ai:'+name,arg);
contextBridge.exposeInMainWorld('aiBridge',Object.freeze({
  status:()=>invoke('status'),login:()=>invoke('login'),logout:()=>invoke('logout'),models:()=>invoke('models'),
  history:()=>invoke('history'),delete:id=>invoke('delete',id),send:args=>invoke('send',args),
  cancel:()=>invoke('cancel'),usage:()=>invoke('usage'),
  applyEdit:id=>invoke('applyEdit',id),discardEdit:id=>invoke('discardEdit',id),undoEdit:()=>invoke('undoEdit'),
  onEvent:fn=>{if(typeof fn==='function')ipcRenderer.on('deckforge-ai:event',(_e,p)=>fn(p));}
}));
