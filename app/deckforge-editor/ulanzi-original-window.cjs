'use strict';
// Reuse the existing package-scoped origin; do not expose the editor preload.
const {BrowserWindow}=require('electron');
const {createInspectorScope,bindInspectorWindows}=require('./sdk-inspector-scope.cjs');
const sessions=new WeakSet();
function createOriginalWindow(directory,entry,{parent=null,title='',visible=false,params={}}={}){
  const scope=createInspectorScope(directory),url=new URL(scope.url(entry));
  if(!scope.html(url.href))throw Error('invalid original HTML entry');
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  if(!sessions.has(scope.session)){
    scope.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    scope.session.setPermissionCheckHandler(()=>false);
    scope.session.on('will-download',event=>event.preventDefault());
    sessions.add(scope.session);
  }
  const win=new BrowserWindow({show:false,title,width:560,height:650,autoHideMenuBar:true,
    ...(parent&&!parent.isDestroyed()?{parent}:{}),
    webPreferences:{session:scope.session,nodeIntegration:false,nodeIntegrationInSubFrames:false,nodeIntegrationInWorker:false,
      contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false}});
  win.on('page-title-updated',e=>e.preventDefault());
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  if(visible)bindInspectorWindows(win,scope,()=>null);
  else{
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const event of ['will-navigate','will-redirect'])win.webContents.on(event,e=>e.preventDefault());
  }
  return {win,url:url.href};
}
module.exports={createOriginalWindow};
