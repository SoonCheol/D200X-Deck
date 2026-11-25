'use strict';
// Experiment only: trusted browser Worker executes a WASM guest VM.
// The guest gets no host functions or references. Never execute plugin code
// in the outer Worker. Existing Model 2 runtime is unchanged.
const {app,BrowserWindow,session,protocol}=require('electron');
const {randomUUID}=require('node:crypto');
const {createRequire}=require('node:module');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createScriptRunner,deadline,runProgram}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
const {resolveWorkerDrawProgram,paintValidatedDrawSpec}=require('../app/deckforge-editor/deckforge-draw-ops.cjs');
const scheme='df-guest-vm-probe';
protocol.registerSchemesAsPrivileged([{scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,bypassCSP:false,allowServiceWorkers:false}}]);
const base=scheme+'://probe',page=base+'/index.html',worker=base+'/worker.js';
const hostCsp="default-src 'none'; worker-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const workerCsp="default-src 'none'; script-src 'wasm-unsafe-eval'; worker-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";


// Synthetic SDK parity only. The existing program is transformed for this
// experiment; no real plugin, filesystem, or privileged effect is invoked.
const sdkInput={event:{type:'press',slot:0},settings:{name:'DeckForge'},state:0,memory:{n:1},globalSettings:{enabled:true},sharedState:{value:7}};
const sdkCases=[
  'api.setTitle(settings.name);api.setState(state);api.toggleState();api.setImage("sample");api.setAnimation({frames:[]});api.stopAnimation();api.setSettings({a:1});api.patchSettings({b:2});',
  'memory.global=api.getGlobalSettings();api.setGlobalSettings({enabled:false});api.goToPage(2);api.switchProfile("example");api.enterFolder("folder");api.exitFolder();api.setWideMode("clock");api.setWideOverlay("example");api.clearWideOverlay();',
  'api.request("endpoint",{value:1},{q:"x"},{timeoutMs:100});api.connectSocket("live",{id:"test"});api.sendSocket({value:2});api.closeSocket();const shared=api.getSharedState();shared.value=9;memory.shared=api.getSharedState();api.publishSharedState({value:3});api.sendServiceMessage({value:4});memory.n+=await Promise.resolve(1);',
  'api.drawKey({width:8,height:8,background:"#000000",commands:[{type:"rect",color:"#ff0000",x:1,y:1,width:4,height:4},{type:"circle",color:"#00ff00",x:4,y:4,radius:2}]});'
];
function guestPrograms(){
 const original=runProgram.toString();
 const from=original.indexOf('  let drawings=0;'),to=original.indexOf('  const api=Object.freeze({');
 assert.ok(from>=0&&to>from,'SDK drawing boundary changed');
 const source=(original.slice(0,from)+
 '  let drawings=0;const drawKey=spec=>{if(sealed||++drawings>2)throw Error("key drawing limit");append({op:"drawKey",spec});};\n'+
 original.slice(to)).replace('structuredClone(input.sharedState||{})','parse(stringify(input.sharedState||{}))');
 const apiNames=[...original.slice(to,original.indexOf('  // Reduce access',to)).matchAll(/^\s+(\w+)(?::|,)/gm)].map(m=>m[1]);
 const called=new Set(sdkCases.flatMap(s=>[...s.matchAll(/api\.(\w+)\(/g)].map(m=>m[1])));
 assert.equal(apiNames.length,25);assert.deepEqual([...called].sort(),[...apiNames].sort());
 return sdkCases.map(script=>'('+source+')('+JSON.stringify(script)+','+JSON.stringify(sdkInput)+')');
}

async function buildBundle(prefix){
 const load=createRequire(path.join(prefix,'package.json'));
 const {build}=load('esbuild');
 const outfile=path.join(prefix,'guest-worker.js');
 const checks=path.join(__dirname,'deckforge-worker-guest-checks.cjs');
 const source='import {newQuickJSWASMModuleFromVariant} from "quickjs-emscripten-core";\n'+
 'import variant from "@jitl/quickjs-singlefile-browser-release-sync";\n'+
 'import {guestChecks} from '+JSON.stringify(checks)+';\n'+
 'const sdkPrograms='+JSON.stringify(guestPrograms())+';\n'+
 'const assert={ok(v,m){if(!v)throw Error(m||"assertion failed")},equal(a,b,m){this.ok(Object.is(a,b),m||"equal failed")},notEqual(a,b){this.ok(!Object.is(a,b),"notEqual failed")},deepEqual(a,b){this.equal(JSON.stringify(a),JSON.stringify(b),"deepEqual failed")},match(a,b){this.ok(b.test(a),"match failed")}};\n'+
 'self.onmessage=async e=>{try{if(e.data==="ping"){self.postMessage({ping:true});return}if(e.data!=="checks")throw Error("invalid test request");const engine=await newQuickJSWASMModuleFromVariant(variant);let sdkResults;const result=guestChecks(engine,assert,sdkPrograms,v=>sdkResults=v);let evalBlocked=false;try{Function("return 1")()}catch{evalBlocked=true}const nested=await Promise.all([location.href,"data:text/javascript,postMessage(1)"].map(url=>new Promise(resolve=>{let w,t;const done=v=>{clearTimeout(t);w?.terminate();resolve(v)};try{w=new Worker(url);w.onmessage=()=>done("allowed");w.onerror=e=>{e.preventDefault();done("blocked")};t=setTimeout(()=>done("inconclusive"),1200);w.postMessage("ping")}catch{done("blocked")}})));const nodeTypes=Object.fromEntries(["process","require","Buffer","ipcRenderer","module"].map(k=>[k,typeof globalThis[k]]));self.postMessage({kind:"result",checks:result,sdkResults,outerEvalBlocked:evalBlocked,outerNestedBlocked:nested.every(v=>v==="blocked"),nested,nodeAbsent:Object.values(nodeTypes).every(v=>v==="undefined"),nodeTypes})}catch(e){self.postMessage({kind:"error",message:String(e.message).slice(0,240)})}};\n';
 await build({stdin:{contents:source,resolveDir:prefix,sourcefile:'guest-worker-entry.js'},outfile,bundle:true,platform:'browser',format:'iife',target:'chrome140',logLevel:'warning'});
 return readFile(outfile,'utf8');
}
function runWorker(url){
 return new Promise(resolve=>{
   let w,timer;
   const done=r=>{clearTimeout(timer);w?.terminate();resolve(r);};
   try{w=new Worker(url);w.onmessage=e=>done(e.data);w.onerror=e=>{e.preventDefault();done({kind:'worker-error',message:e.message});};timer=setTimeout(()=>done({kind:'timeout'}),12000);w.postMessage('checks');}
   catch(e){done({kind:'construction-error',message:String(e.message)});}
 });
}
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const prefix=process.env.DECKFORGE_VM_PROBE_DIR;
 assert.ok(prefix,'temporary dependency directory required');
 const bundle=await buildBundle(prefix);
 const ses=session.fromPartition('df-guest-vm-'+randomUUID(),{cache:false});
 ses.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
 ses.setPermissionCheckHandler(()=>false);
 ses.on('will-download',e=>e.preventDefault());
 let denied=0;
 ses.webRequest.onBeforeRequest((d,cb)=>{const cancel=d.url!==page&&d.url!==worker;if(cancel)denied++;cb({cancel});});
 ses.protocol.handle(scheme,req=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(req.url===page)return new Response('<!doctype html><title>Guest VM probe</title>',{headers:{...headers,'Content-Type':'text/html','Content-Security-Policy':hostCsp}});
  if(req.url===worker)return new Response(bundle,{headers:{...headers,'Content-Type':'text/javascript','Content-Security-Policy':workerCsp}});
  return new Response('',{status:404,headers});
 });
 const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webSecurity:true,webviewTag:false,backgroundThrottling:false,devTools:false}});
 const wc=win.webContents;
 wc.setWindowOpenHandler(()=>({action:'deny'}));
 for(const name of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])wc.on(name,e=>e.preventDefault());
 const close=()=>{if(!win.isDestroyed())win.destroy();};
 const service=createScriptRunner('com.deckforge.native.guest-probe','service');
 const input={event:{type:'start',scope:'service'},settings:{},state:0,memory:{}};
 try{
   await deadline(()=>win.loadURL(page),5000,close);
   assert.equal((await service.run("api.setTitle('before');",input)).ops[0].value,'before');
   const pending=deadline(()=>wc.executeJavaScript('('+runWorker.toString()+')('+JSON.stringify(worker)+')'),15000,close);
   // Observe service survival during the independent worker test.
   const alive=await service.run("api.setTitle('alive');",input);
   const result=await pending;
   const pids={button:wc.getOSProcessId(),service:service.processId()};
   console.log('MODEL5_GUEST_VM_CHROMIUM '+JSON.stringify({result,pids,serviceAlive:alive.ops[0].value==='alive',denied,bundleBytes:Buffer.byteLength(bundle),actualChromiumWorker:true,productionEnabled:false}));
   assert.equal(result.kind,'result',JSON.stringify(result));
   assert.ok(Object.values(result.checks).every(v=>v===true));
   assert.equal(result.outerEvalBlocked,true);
   assert.equal(result.outerNestedBlocked,true);
   assert.equal(result.nodeAbsent,true);
   assert.ok(pids.button>0&&pids.service>0&&pids.button!==pids.service);
   assert.equal(alive.ops[0].value,'alive');
   assert.equal(result.sdkResults.length,sdkCases.length);
   for(let i=0;i<sdkCases.length;i++){
     const candidate=result.sdkResults[i];assert.equal(candidate.kind,'result',JSON.stringify(candidate));
     const actual=await resolveWorkerDrawProgram(JSON.stringify(candidate.value),spec=>deadline(()=>wc.executeJavaScript('('+paintValidatedDrawSpec.toString()+')('+JSON.stringify(spec)+')'),3000,close));
     const expected=await service.run(sdkCases[i],sdkInput);
     assert.deepEqual(actual,expected,`SDK fixture ${i} parity`);
   }
   console.log('MODEL5_SDK_API_PARITY '+JSON.stringify({apiCount:25,fixtures:sdkCases.length,drawPixelsEqual:true,actualChromiumWorker:true,hostEffectsExecuted:false,productionEnabled:false}));
 }finally{service.close();close();ses.protocol.unhandle(scheme);await ses.clearStorageData();}
 app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
