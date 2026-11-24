'use strict';
// JavaScript SDK API 2 executes in a sandboxed Chromium renderer, not in Node.
// The host accepts only bounded, validated data. This is defense in depth, not
// a guarantee against Chromium vulnerabilities or all browser side channels.
const {createHash}=require('node:crypto');
const HTML='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-eval\'; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; worker-src \'none\'; base-uri \'none\'; form-action \'none\'"><meta http-equiv="x-dns-prefetch-control" content="off"><title>DeckForge SDK runtime</title>';
const PAGE='data:text/html;charset=utf-8,'+encodeURIComponent(HTML);
const configured=new WeakSet();
const MAX_OUTPUT=512*1024, MAX_INPUT=64*1024;
function deadline(work,ms,onTimeout){
  let timer;
  return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
    timer=setTimeout(()=>{try{onTimeout();}finally{reject(Error('JavaScript SDK execution timeout'));}},ms);
  })]).finally(()=>clearTimeout(timer));
}
// This function is serialized into the isolated renderer. It cannot close over Node.
function runProgram(source,input){
  'use strict';
  const stringify=JSON.stringify.bind(JSON),ops=[];
  const append=op=>{if(ops.length>=16)throw Error('operation limit');ops.push(op);};
  const api=Object.freeze({
    setTitle:value=>append({op:'title',value}),
    setState:value=>append({op:'state',value}),
    toggleState:()=>append({op:'toggleState'}),
    setImage:value=>append({op:'image',value})
  });
  // Reduce access to network-capable APIs beyond CSP/session controls.
  for(const key of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','Worker','SharedWorker','setTimeout','setInterval','requestAnimationFrame','requestIdleCallback','queueMicrotask']){
    try{Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});}catch{}
  }
  const run=new Function('event','settings','state','memory','api','"use strict";\n'+source);
  const result=run(Object.freeze(input.event),input.settings,input.state,input.memory,api);
  if(result&&typeof result.then==='function')throw Error('asynchronous scripts are not supported');
  const out=stringify({ops,memory:input.memory});
  if(typeof out!=='string'||out.length>512*1024)throw Error('output limit');
  return out;
}
function createScriptRunner(pluginId){
  const {BrowserWindow,session}=require('electron');
  // A non-persistent partition per plugin separates it from the editor,
  // other plugins and ordinary browsing. Opaque data origins have no shared storage.
  const partition='deckforge-sdk-'+createHash('sha256').update(pluginId).digest('hex');
  const ses=session.fromPartition(partition,{cache:false});
  if(!configured.has(ses)){
    ses.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
    ses.setPermissionCheckHandler(()=>false);
    ses.setDisplayMediaRequestHandler?.((_request,cb)=>cb({}));
    ses.on('will-download',event=>event.preventDefault());
    ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:details.url!==PAGE}));
    configured.add(ses);
  }
  const win=new BrowserWindow({show:false,webPreferences:{
    session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,
    nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,
    webSecurity:true,webviewTag:false,backgroundThrottling:false,
    allowRunningInsecureContent:false,devTools:false
  }});
  const wc=win.webContents;
  wc.setWindowOpenHandler(()=>({action:'deny'}));
  for(const name of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])
    wc.on(name,event=>event.preventDefault());
  wc.setWebRTCIPHandlingPolicy?.('disable_non_proxied_udp');
  let closed=false;
  const close=()=>{closed=true;if(!win.isDestroyed())win.destroy();};
  wc.on('render-process-gone',close);
  const ready=deadline(()=>win.loadURL(PAGE),10000,close);
  // Handle rejected initialization even if the owner disappears before run().
  ready.catch(()=>{});
  return {
    async run(source,input){
      if(closed)throw Error('JavaScript SDK renderer closed');
      const data=JSON.stringify(input);
      if(Buffer.byteLength(data)>MAX_INPUT)throw Error('JavaScript SDK input limit');
      await ready;
      if(closed)throw Error('JavaScript SDK renderer closed');
      // Source and input are JSON string literals; no interpolation as executable source.
      const expression='('+runProgram.toString()+')('+JSON.stringify(source)+',JSON.parse('+JSON.stringify(data)+'))';
      const out=await deadline(()=>wc.executeJavaScript(expression,false),1500,close);
      if(typeof out!=='string'||Buffer.byteLength(out)>MAX_OUTPUT)throw Error('JavaScript SDK output limit');
      return JSON.parse(out);
    },
    close
  };
}
module.exports={createScriptRunner,runProgram,deadline};
