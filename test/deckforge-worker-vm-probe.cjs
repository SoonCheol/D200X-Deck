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
  const evaluate=source=>{
    const runtime=engine.newRuntime();
    runtime.setMemoryLimit(8*1024*1024);
    runtime.setMaxStackSize(256*1024);
    const deadline=performance.now()+500;
    let interrupted=false;
    runtime.setInterruptHandler(()=>{if(performance.now()>=deadline)interrupted=true;return interrupted;});
    const ctx=runtime.newContext();
    let result,promiseValue;
    try{
      result=ctx.evalCode(source);
      if(result.error){const message=ctx.getString(result.error);return {kind:'error',message,interrupted};}
      for(let i=0;i<128&&runtime.hasPendingJob();i++){
        const job=runtime.executePendingJobs(1);
        if(job.error){try{return {kind:'error',message:ctx.getString(job.error),interrupted};}finally{job.error.dispose();}}
      }
      if(interrupted)return {kind:'interrupted',interrupted:true};
      if(runtime.hasPendingJob())return {kind:'job-limit'};
      const settled=ctx.getPromiseState(result.value);
      if(settled.type==='pending')return {kind:'pending'};
      if(settled.type==='rejected'){try{return {kind:'error',message:ctx.getString(settled.error),interrupted};}finally{settled.error.dispose();}}
      promiseValue=settled.value;
      if(ctx.typeof(promiseValue)!=='string')return {kind:'invalid-output'};
      const json=ctx.getString(promiseValue);
      if(Buffer.byteLength(json)>8192)return {kind:'output-limit'};
      return {kind:'result',value:JSON.parse(json)};
    }finally{
      if(promiseValue&&promiseValue!==result?.value)promiseValue.dispose();
      result?.value?.dispose();result?.error?.dispose();
      ctx.dispose();runtime.dispose();
    }
  };
  const forbidden=['fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','importScripts','indexedDB','caches','localStorage','sessionStorage','navigator','document','process','require','Buffer','ipcRenderer','postMessage','setTimeout','Deno','Bun','WebAssembly'];
  // The guest receives only JS literal data; no host object or function.
  const isolation=evaluate('(async()=>{const names='+JSON.stringify(forbidden)+';const missing=names.every(k=>typeof globalThis[k]==="undefined");let importBlocked=false;try{await import("node:fs")}catch{importBlocked=true}return JSON.stringify({missing,importBlocked,constructorCannotReachHost:Function("return typeof process")()==="undefined"})})()');
  assert.deepEqual(isolation,{kind:'result',value:{missing:true,importBlocked:true,constructorCannotReachHost:true}});
  const data=evaluate('(async()=>{const input={title:"before",count:1};return JSON.stringify({ops:[{op:"title",value:await Promise.resolve(input.title)}],memory:{count:input.count+1}})})()');
  assert.deepEqual(data,{kind:'result',value:{ops:[{op:'title',value:'before'}],memory:{count:2}}});
  const hang=evaluate('while(true){}');
  assert.equal(hang.interrupted,true,'guest loop must hit interpreter interrupt');
  const allocation=evaluate('new ArrayBuffer(64*1024*1024);JSON.stringify("unexpected")');
  assert.equal(allocation.kind,'error');assert.match(allocation.message,/out of memory|allocation/i);assert.notEqual(allocation.interrupted,true);
  const excessive=evaluate('JSON.stringify("x".repeat(9000))');
  assert.equal(excessive.kind,'output-limit');
  const pending=evaluate('new Promise(()=>{})');assert.equal(pending.kind,'pending');
  const jobs=evaluate('Promise.resolve().then(function recur(){Promise.resolve().then(recur)});JSON.stringify("done")');
  assert.ok(['job-limit','interrupted'].includes(jobs.kind)||jobs.interrupted===true,'unbounded jobs must be rejected');
  const next=evaluate('JSON.stringify({next:true})');
  assert.deepEqual(next,{kind:'result',value:{next:true}});
  return {guestGlobalsBlocked:true,importBlocked:true,asyncJson:true,interrupted:true,allocationRejected:true,outputLimited:true,pendingRejected:true,jobBudget:true,nextRecovered:true,actualChromiumWorker:false,productionEnabled:false};
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
