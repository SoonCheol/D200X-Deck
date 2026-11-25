'use strict';
// 04B feasibility probe ONLY. No production protocol or worker is registered.
// No actual plugin scripts, profile data, credentials or external services.
const {app,BrowserWindow,protocol,session}=require('electron');
const {randomUUID}=require('node:crypto');
const {createScriptRunner,deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
const assert=require('node:assert/strict');
const schemes=['df-worker-standard-probe','df-worker-opaque-probe','df-worker-sandbox-probe'];
protocol.registerSchemesAsPrivileged(schemes.map((scheme,i)=>({scheme,privileges:{
  standard:i!==1,secure:true,supportFetchAPI:true,corsEnabled:true,bypassCSP:false,allowServiceWorkers:false
}})));
const hostCsp="default-src 'none'; worker-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const workerCsp="default-src 'none'; script-src 'unsafe-eval'; worker-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
async function workerProbe(){
  const settle=(promise,ms=1200)=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve('inconclusive'),ms))]);
  const attempt=async fn=>{try{await fn();return 'allowed';}catch{return 'blocked';}};
  const child=async url=>{
    try{
      const w=new Worker(url);
      try{return await settle(new Promise(resolve=>{w.onmessage=()=>resolve('allowed');w.onerror=e=>{e.preventDefault();resolve('blocked');};}));}
      finally{w.terminate();}
    }catch{return 'blocked';}
  };
  const storage=async fn=>settle(attempt(fn));
  onmessage=async e=>{
    if(e.data==='hang'){while(true){}}
    if(e.data==='ping'){postMessage({ping:true});return;}
    const r={origin:self.origin};
    try{
      const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
      r.asyncFunction=await new AsyncFunction('return await Promise.resolve(42)')()===42;
    }catch{r.asyncFunction=false;}
    r.node=typeof require==='undefined'&&typeof process==='undefined'&&typeof Buffer==='undefined'&&typeof ipcRenderer==='undefined';
    r.fetch=await settle(attempt(()=>fetch(new URL('/sample',location.href))));
    r.importScripts=await attempt(()=>importScripts(new URL('/nested.js',location.href)));
    r.nested=await child(new URL('/nested.js',location.href));
    const blob=URL.createObjectURL(new Blob(['postMessage("nested")'],{type:'text/javascript'}));
    try{r.nestedBlob=await child(blob);}finally{URL.revokeObjectURL(blob);}
    r.nestedData=await child('data:text/javascript,postMessage("nested")');
    r.webSocket=await settle(new Promise(resolve=>{
      try{const ws=new WebSocket('wss://worker-probe.invalid/');
        ws.onopen=()=>{ws.close();resolve('allowed');};ws.onerror=()=>resolve('blocked');
      }catch{resolve('blocked');}
    }));
    r.indexedDB=await storage(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('df-probe');
      request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(Error('blocked'));
    }));
    r.cacheStorage=await storage(()=>caches.open('df-probe'));
    r.fileSystem=await storage(()=>navigator.storage.getDirectory());
    r.localStorage=await attempt(()=>{localStorage.setItem('df-probe','1');});
    postMessage(r);
  };
}
function startWorker(url,command,timeout){
  return new Promise(resolve=>{
    let w,timer;
    const finish=result=>{clearTimeout(timer);w?.terminate();resolve(result);};
    try{
      w=new Worker(url);
      w.onmessage=e=>finish({kind:'message',value:e.data});
      w.onerror=e=>{e.preventDefault();finish({kind:'error'});};
      timer=setTimeout(()=>finish({kind:'timeout'}),timeout);
      w.postMessage(command);
    }catch{finish({kind:'construction-error'});}
  });
}
async function probe(scheme){
  const origin=scheme+'://probe',page=origin+'/index.html',worker=origin+'/worker.js';
  // Candidate only: ask the browser to enforce sandbox on the worker
  // response itself. Do not infer origin isolation from the header alone.
  const sandboxCandidate=scheme==='df-worker-sandbox-probe';
  const responseCsp=workerCsp+(sandboxCandidate?'; sandbox allow-scripts':'');
  const ses=session.fromPartition('df-worker-probe-'+randomUUID(),{cache:false});
  const permitted=new Set([page,worker,origin+'/nested.js',origin+'/sample']);
  let denied=0;
  ses.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
  ses.setPermissionCheckHandler(()=>false);
  ses.on('will-download',e=>e.preventDefault());
  ses.webRequest.onBeforeRequest((d,cb)=>{const cancel=!permitted.has(d.url);if(cancel)denied++;cb({cancel});});
  ses.protocol.handle(scheme,req=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(req.url===page)return new Response('<!doctype html><title>Worker probe</title>',{headers:{...headers,'Content-Type':'text/html','Content-Security-Policy':hostCsp}});
    if(req.url===worker)return new Response('('+workerProbe.toString()+')();',{headers:{...headers,'Content-Type':'text/javascript','Content-Security-Policy':responseCsp}});
    if(req.url===origin+'/nested.js')return new Response('postMessage("nested");',{headers:{...headers,'Content-Type':'text/javascript'}});
    if(req.url===origin+'/sample')return new Response('synthetic probe data',{headers});
    return new Response('',{status:404,headers});
  });
  const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webSecurity:true,webviewTag:false,backgroundThrottling:false,devTools:false}});
  const wc=win.webContents;
  wc.setWindowOpenHandler(()=>({action:'deny'}));
  for(const name of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])wc.on(name,e=>e.preventDefault());
  const close=()=>{if(!win.isDestroyed())win.destroy();};
  const execute=(command,ms)=>deadline(()=>wc.executeJavaScript('('+startWorker.toString()+')('+JSON.stringify(worker)+','+JSON.stringify(command)+','+ms+')'),ms+3000,close);
  const service=createScriptRunner('com.deckforge.native.worker-probe','service');
  const input={event:{type:'start',scope:'service'},settings:{},state:0,memory:{}};
  try{
    await deadline(()=>win.loadURL(page),5000,close);
    const result=await execute('security',15000);
    if(result.kind!=='message')return {scheme,result,eligible:false};
    const checks=result.value;
    const blocked=['fetch','importScripts','nested','nestedBlob','nestedData','webSocket','indexedDB','cacheStorage','fileSystem','localStorage'];
    const initial=await service.run("api.setTitle('before');",input);
    assert.equal(initial.ops[0].value,'before');
    const hang=execute('hang',1000);
    const alive=await service.run("api.setTitle('alive');",input);
    const timed=await hang;
    const next=await execute('ping',3000);
    const serviceAlive=alive.ops[0].value==='alive';
    const recovered=timed.kind==='timeout'&&next.kind==='message'&&next.value.ping===true;
    const pids={button:wc.getOSProcessId(),service:service.processId()};
    return {scheme,checks,serviceAlive,recovered,pids,denied,eligible:(!sandboxCandidate||checks.origin==='null')&&checks.asyncFunction===true&&checks.node===true&&blocked.every(k=>checks[k]==='blocked')&&serviceAlive&&recovered&&pids.button>0&&pids.service>0&&pids.button!==pids.service};
  }catch(e){return {scheme,error:String(e.message).slice(0,240),eligible:false};}
  finally{service.close();close();ses.protocol.unhandle(scheme);await ses.clearStorageData();}
}
// Keep the probe alive while the first candidate's final window is destroyed.
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const results=[];
  for(const scheme of schemes)results.push(await probe(scheme));
  console.log('MODEL5_WORKER_CSP_PROBE '+JSON.stringify({electron:process.versions.electron,chromium:process.versions.chrome,results,eligible:results.some(r=>r.eligible),productionEnabled:false}));
  // Negative feasibility is evidence, not permission to weaken the policy.
  // Existing Model 2 release is unaffected. Full OOM, DrawOps and resource
  // limits remain separate gates even when this probe is eligible.
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
