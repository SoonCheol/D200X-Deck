'use strict';
// Serve each installed plugin's inspector in its own standard origin and
// in-memory session. A file:// opener cannot reliably access a sibling file.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {protocol,session,net,shell,screen}=require('electron');
const SCHEME='deckforge-pi',ORIGIN=SCHEME+'://local';
const sessions=new WeakSet();
function registerInspectorScheme(){
  protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
}
function below(root,file){
  const rel=path.relative(root,file);
  return !!rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);
}
function inspectorFile(root,raw,htmlOnly=false){
  try{
    const u=new URL(raw);
    if(u.protocol!==SCHEME+':'||u.host!=='local'||u.username||u.password)return null;
    const parts=u.pathname.slice(1).split('/').map(decodeURIComponent);
    if(parts.some(p=>!p||p==='.'||p==='..'||/[\\/:\x00-\x1f\x7f]/.test(p)||/[ .]$/.test(p)))return null;
    const file=path.resolve(root,...parts);
    if(!below(root,file)||htmlOnly&&!/\.html?$/i.test(file))return null;
    const actual=fs.realpathSync.native(file);
    if(!below(root,actual)||!fs.statSync(actual).isFile())return null;
    return actual;
  }catch{return null;}
}
function createInspectorScope(directory){
  const root=fs.realpathSync.native(directory);
  const partition='deckforge-pi-'+createHash('sha256').update(root).digest('hex');
  const ses=session.fromPartition(partition);
  if(!sessions.has(ses)){
    ses.protocol.handle(SCHEME,async request=>{
      const file=inspectorFile(root,request.url);
      if(!file||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
      try{return await net.fetch(pathToFileURL(file).href,{method:request.method});}
      catch{return new Response('Not found',{status:404});}
    });
    // Renderer requests must not access local file URLs outside this protocol.
    ses.webRequest.onBeforeRequest({urls:['file://*/*']},(_details,callback)=>callback({cancel:true}));
    sessions.add(ses);
  }
  function url(relative){
    return ORIGIN+'/'+relative.split('/').map(encodeURIComponent).join('/');
  }
  return {session:ses,url,html:raw=>inspectorFile(root,raw,true)};
}
// DefaultWindowSize applies to windows opened from the property inspector,
// not the property inspector itself. Explicit width/height override defaults.
function inspectorPopupSize(defaultSize,features='',workArea={width:1920,height:1080}){
  const valid=n=>Number.isSafeInteger(n)&&n>0;
  const declared=Array.isArray(defaultSize)&&defaultSize.length===2&&defaultSize.every(valid)?defaultSize:[500,650];
  const requested={};
  for(const feature of String(features).split(',')){
    const m=/^\s*(width|height)\s*=\s*(\d+)\s*$/i.exec(feature);
    if(m&&valid(Number(m[2])))requested[m[1].toLowerCase()]=Number(m[2]);
  }
  const bounded=(value,max)=>Math.min(Math.max(1,Math.floor(max)),Math.max(240,value));
  return {width:bounded(requested.width??declared[0],workArea.width),height:bounded(requested.height??declared[1],workArea.height)};
}
function bindInspectorWindows(win,scope,externalUrl,depth=0,defaultSize){
  const contents=win.webContents;
  contents.setWindowOpenHandler(({url,features})=>{
    if(depth<2&&scope.html(url)){
      const dimensions=inspectorPopupSize(defaultSize,features,screen.getDisplayMatching(win.getBounds()).workArea);
      return {action:'allow',outlivesOpener:false,overrideBrowserWindowOptions:{
        parent:win,modal:true,autoHideMenuBar:true,...dimensions,
        webPreferences:{session:scope.session,nodeIntegration:false,nodeIntegrationInSubFrames:false,
          contextIsolation:false,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false}
      }};
    }
    const external=externalUrl(url);
    if(external)shell.openExternal(external).catch(()=>{});
    return {action:'deny'};
  });
  const guard=(event,url)=>{if(!scope.html(url))event.preventDefault();};
  contents.on('will-navigate',guard);
  contents.on('will-redirect',guard);
  contents.on('did-create-window',child=>bindInspectorWindows(child,scope,externalUrl,depth+1,defaultSize));
}
module.exports={registerInspectorScheme,createInspectorScope,bindInspectorWindows,inspectorFile,inspectorPopupSize};
