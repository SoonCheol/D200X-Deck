'use strict';
// Feasibility only: trusted Node worker hosts a WASM guest JS engine.
// No real plugins, user data, bridge functions, or production dependencies.
// Passing does NOT establish the Chromium Worker/DrawOps security boundary.
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createRequire}=require('node:module');
const {performance}=require('node:perf_hooks');
const path=require('node:path');

async function guestProbe(prefix){
  const load=createRequire(path.join(prefix,'package.json'));
  const {getQuickJS}=load('quickjs-emscripten');
  const engine=await getQuickJS();
  const {guestChecks}=require('./deckforge-worker-guest-checks.cjs');
  return {...guestChecks(engine,assert),actualChromiumWorker:false,productionEnabled:false};
}

if(isMainThread){
  const prefix=process.env.DECKFORGE_VM_PROBE_DIR;
  if(!prefix)throw Error('test dependency directory required');
  const worker=new Worker(__filename,{workerData:prefix,resourceLimits:{maxOldGenerationSizeMb:128}});
  const timer=setTimeout(()=>{worker.terminate();console.error('VM probe watchdog expired');process.exitCode=1;},15000);
  let answered=false;
  worker.once('message',result=>{answered=true;clearTimeout(timer);console.log('MODEL5_GUEST_VM_PREFLIGHT '+JSON.stringify(result));});
  worker.once('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
  worker.once('exit',code=>{clearTimeout(timer);if(code!==0||!answered)process.exitCode=1;});
}else{
  guestProbe(workerData).then(result=>parentPort.postMessage(result)).catch(error=>{console.error(error);process.exitCode=1;});
}
