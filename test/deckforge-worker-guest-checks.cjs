'use strict';
// Shared synthetic guest checks, without access to host capabilities.
function evaluateGuest(engine,source,{heap=8*1024*1024,maxOutput=8192}={}){
    const runtime=engine.newRuntime();
    runtime.setMemoryLimit(heap);
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
      if(new TextEncoder().encode(json).length>maxOutput)return {kind:'output-limit'};
      return {kind:'result',value:JSON.parse(json)};
    }finally{
      if(promiseValue&&promiseValue!==result?.value)promiseValue.dispose();
      result?.value?.dispose();result?.error?.dispose();
      ctx.dispose();runtime.dispose();
    }
}
function guestChecks(engine,assert,sdkPrograms=[],onSdkResults=()=>{}){
  const evaluate=source=>evaluateGuest(engine,source);
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
  onSdkResults(sdkPrograms.map(evaluate));
  return {guestGlobalsBlocked:true,importBlocked:true,asyncJson:true,interrupted:true,allocationRejected:true,outputLimited:true,pendingRejected:true,jobBudget:true,nextRecovered:true};
}
module.exports={guestChecks,evaluateGuest};
