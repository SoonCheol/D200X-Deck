'use strict';
// Reuse the existing package-scoped origin; do not expose the editor preload.
const {BrowserWindow,screen}=require('electron');
const {createInspectorScope,bindInspectorWindows}=require('./sdk-inspector-scope.cjs');
const sessions=new WeakSet();
function createOriginalWindow(directory,entry,{parent=null,title='',visible=false,params={},width=560,height=650,x,y}={}){
  const scope=createInspectorScope(directory),url=new URL(scope.url(entry));
  if(!scope.html(url.href))throw Error('invalid original HTML entry');
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  if(!sessions.has(scope.session)){
    scope.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    scope.session.setPermissionCheckHandler(()=>false);
    scope.session.on('will-download',event=>event.preventDefault());
    sessions.add(scope.session);
  }
  const area=parent&&!parent.isDestroyed()?screen.getDisplayMatching(parent.getBounds()).workArea:screen.getPrimaryDisplay().workArea;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  width=clamp(width,Math.min(200,area.width),area.width);height=clamp(height,Math.min(200,area.height),area.height);
  const position={...(Number.isSafeInteger(x)?{x:clamp(x,area.x,area.x+area.width-width)}:{}),...(Number.isSafeInteger(y)?{y:clamp(y,area.y,area.y+area.height-height)}:{})};
  const win=new BrowserWindow({show:false,title,width,height,...position,autoHideMenuBar:true,
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
