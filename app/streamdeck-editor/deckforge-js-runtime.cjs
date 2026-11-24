'use strict';
// JavaScript SDK API 2 executes in a sandboxed Chromium renderer, not in Node.
// The host accepts only bounded, validated data. This is defense in depth, not
// a guarantee against Chromium vulnerabilities or all browser side channels.
const {createHash}=require('node:crypto');
const HTML='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-eval\'; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; worker-src \'none\'; base-uri \'none\'; form-action \'none\'"><meta http-equiv="x-dns-prefetch-control" content="off"><title>DeckForge SDK runtime</title>';
const PAGE='data:text/html;charset=utf-8,'+encodeURIComponent(HTML);
const configured=new WeakSet();
const MAX_OUTPUT=512*1024, MAX_INPUT=64*1024, MAX_SOCKET_INPUT=1536*1024, MAX_SHARED_INPUT=1536*1024;
function unavailable(message){const error=Error(message);error.code='SDK_RUNTIME_UNAVAILABLE';return error;}
function deadline(work,ms,onTimeout,signal){
  let timer,abort;
  if(signal?.aborted)return Promise.reject(unavailable('JavaScript SDK renderer closed'));
  const cancelled=new Promise((_,reject)=>{
    abort=()=>reject(unavailable('JavaScript SDK renderer closed'));
    signal?.addEventListener('abort',abort,{once:true});
  });
  return Promise.race([Promise.resolve().then(()=>{
    if(signal?.aborted)throw unavailable('JavaScript SDK renderer closed');
    return work();
  }),new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      reject(unavailable('JavaScript SDK execution timeout'));
      try{onTimeout();}catch{}
    },ms);
  }),cancelled]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);});
}
// This function is serialized into the isolated renderer. It cannot close over Node.
async function runProgram(source,input){
  'use strict';
  const stringify=JSON.stringify.bind(JSON),parse=JSON.parse.bind(JSON),ops=[];
  const push=Array.prototype.push.bind(ops);
  let sealed=false,budget=0;
  const append=op=>{
    if(sealed)throw Error('event already completed');
    if(ops.length>=16)throw Error('operation limit');
    const data=stringify(op);
    if(typeof data!=='string'||(budget+=data.length)>512*1024)throw Error('operation data limit');
    push(parse(data));
  };
  // A small, local drawing API for dynamically generated key artwork.
  // No external fonts/images, URLs, markup, or arbitrary host-side drawing.
  let drawings=0;
  const drawKey=spec=>{
    if(sealed||++drawings>2)throw Error('key drawing limit');
    const valid=(ok)=>{if(!ok)throw Error('invalid key drawing');};
    const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
    const color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v);
    const coord=v=>Number.isFinite(v)&&Math.abs(v)<=576;
    const size=v=>Number.isFinite(v)&&v>=0&&v<=288;
    valid(exact(spec,['width','height','background','commands'])&&[spec.width,spec.height].every(v=>Number.isInteger(v)&&v>=1&&v<=144)&&
      (spec.background===undefined||color(spec.background))&&Array.isArray(spec.commands)&&spec.commands.length<=32);
    const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});valid(ctx);
    if(spec.background){ctx.fillStyle=spec.background;ctx.fillRect(0,0,canvas.width,canvas.height);}
    for(const cmd of spec.commands){
      valid(cmd&&color(cmd.color));ctx.fillStyle=cmd.color;ctx.strokeStyle=cmd.color;
      if(cmd.type==='rect'){
        valid(exact(cmd,['type','color','x','y','width','height'])&&[cmd.x,cmd.y].every(coord)&&[cmd.width,cmd.height].every(size));
        ctx.fillRect(cmd.x,cmd.y,cmd.width,cmd.height);
      }else if(cmd.type==='circle'){
        valid(exact(cmd,['type','color','x','y','radius'])&&[cmd.x,cmd.y].every(coord)&&size(cmd.radius));
        ctx.beginPath();ctx.arc(cmd.x,cmd.y,cmd.radius,0,Math.PI*2);ctx.fill();
      }else if(cmd.type==='line'){
        valid(exact(cmd,['type','color','x','y','toX','toY','width'])&&[cmd.x,cmd.y,cmd.toX,cmd.toY].every(coord)&&Number.isFinite(cmd.width)&&cmd.width>0&&cmd.width<=32);
        ctx.lineWidth=cmd.width;ctx.beginPath();ctx.moveTo(cmd.x,cmd.y);ctx.lineTo(cmd.toX,cmd.toY);ctx.stroke();
      }else if(cmd.type==='text'){
        valid(exact(cmd,['type','color','x','y','text','size','font','align','bold'])&&[cmd.x,cmd.y].every(coord)&&
          typeof cmd.text==='string'&&cmd.text.length<=128&&!/[\x00-\x1f\x7f]/.test(cmd.text)&&
          Number.isInteger(cmd.size)&&cmd.size>=6&&cmd.size<=96&&['sans-serif','serif','monospace'].includes(cmd.font??'sans-serif')&&
          ['left','center','right'].includes(cmd.align??'center')&&(cmd.bold===undefined||typeof cmd.bold==='boolean'));
        ctx.font=(cmd.bold?'bold ':'')+cmd.size+'px '+(cmd.font??'sans-serif');
        ctx.textAlign=cmd.align??'center';ctx.textBaseline='middle';ctx.fillText(cmd.text,cmd.x,cmd.y,canvas.width);
      }else valid(false);
    }
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let binary='';for(let i=0;i<data.length;i+=4096)binary+=String.fromCharCode(...data.subarray(i,i+4096));
    append({op:'pixels',width:canvas.width,height:canvas.height,rgba:btoa(binary)});
  };
  const api=Object.freeze({
    setTitle:value=>append({op:'title',value}),
    setState:value=>append({op:'state',value}),
    toggleState:()=>append({op:'toggleState'}),
    setImage:value=>append({op:'image',value}),
    setAnimation:value=>append({op:'animation',value}),
    stopAnimation:()=>append({op:'stopAnimation'}),
    drawKey,
    setSettings:value=>append({op:'settings',value}),
    patchSettings:value=>append({op:'settingsPatch',value}),
    getGlobalSettings:()=>input.globalSettings||{},
    setGlobalSettings:value=>append({op:'globalSettings',value}),
    goToPage:value=>append({op:'navigate',target:'page',value}),
    switchProfile:value=>append({op:'navigate',target:'profile',value}),
    enterFolder:value=>append({op:'navigate',target:'folder',value}),
    exitFolder:()=>append({op:'navigate',target:'back',value:null}),
    setWideMode:value=>append({op:'wideMode',value}),
    setWideOverlay:(value,durationMs=5000)=>append({op:'wideOverlay',value,durationMs}),
    clearWideOverlay:()=>append({op:'wideOverlay',value:null,durationMs:0}),
    request:(endpoint,body=null,query,options)=>append({op:'networkRequest',endpoint,body,...(query===undefined?{}:{query}),...(options===undefined?{}:{options})}),
    connectSocket:(endpoint,query)=>append({op:'socketConnect',endpoint,...(query===undefined?{}:{query})}),
    sendSocket:value=>append({op:'socketSend',value}),
    closeSocket:()=>append({op:'socketClose'}),
    getSharedState:()=>structuredClone(input.sharedState||{}),
    publishSharedState:value=>append({op:'publishSharedState',value}),
    sendServiceMessage:value=>append({op:'serviceMessage',value})
  });
  // Reduce access to network-capable APIs beyond CSP/session controls.
  for(const key of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','Worker','SharedWorker','setTimeout','setInterval','requestAnimationFrame','requestIdleCallback','queueMicrotask']){
    try{Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});}catch{}
  }
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('event','settings','state','memory','api','"use strict";\n'+source);
  try{await run(Object.freeze(input.event),input.settings,input.state,input.memory,api);}
  finally{sealed=true;}
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
  let closed=false,busy=false;
  const lifetime=new AbortController();
  const close=()=>{if(closed)return;closed=true;lifetime.abort();if(!win.isDestroyed())win.destroy();};
  wc.on('render-process-gone',close);
  wc.on('will-prevent-unload',event=>event.preventDefault());
  const ready=deadline(()=>win.loadURL(PAGE),10000,close,lifetime.signal).catch(()=>{close();throw unavailable('JavaScript SDK initialization failed');});
  // Handle rejected initialization even if the owner disappears before run().
  ready.catch(()=>{});
  return {
    async run(source,input){
      if(closed)throw unavailable('JavaScript SDK renderer closed');
      const data=JSON.stringify(input);
      const largeShared=Buffer.byteLength(JSON.stringify(input.sharedState||{}))>8192;
      const inputLimit=largeShared?MAX_SHARED_INPUT:input.event?.type==='socketEvent'&&input.event.response?.event==='message'?MAX_SOCKET_INPUT:MAX_INPUT;
      if(Buffer.byteLength(data)>inputLimit)throw Error('JavaScript SDK input limit');
      if(busy)throw Error('JavaScript SDK renderer busy');
      busy=true;
      try{
        await ready;
        if(closed)throw unavailable('JavaScript SDK renderer closed');
        // Source and input are JSON string literals; no interpolation as executable source.
        const expression='('+runProgram.toString()+')('+JSON.stringify(source)+',JSON.parse('+JSON.stringify(data)+'))';
        const out=await deadline(()=>wc.executeJavaScript(expression,false),1500,close,lifetime.signal);
        if(typeof out!=='string'||Buffer.byteLength(out)>MAX_OUTPUT)throw Error('JavaScript SDK output limit');
        const result=JSON.parse(out);
        // Discard the previous document/realm before accepting its output.
        // Only host-validated memory survives; detached promises and globals
        // cannot carry over to the next event. A failed reset fails closed.
        await deadline(()=>win.loadURL(PAGE),3000,close,lifetime.signal);
        if(closed)throw unavailable('JavaScript SDK renderer closed');
        return result;
      }catch(error){
        const wasClosed=closed;
        close();
        if(error?.code==='SDK_RUNTIME_UNAVAILABLE')throw error;
        if(wasClosed)throw unavailable('JavaScript SDK renderer unavailable');
        throw error;
      }finally{busy=false;}
    },
    close
  };
}
module.exports={createScriptRunner,runProgram,deadline};
