'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {NativePluginHost,validateNativeManifest,LIMIT}=require('./deckforge-native-sdk.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const {normalizeNetworkResult,networkFailure}=require('./deckforge-native-network.cjs');
const readJson=async(file,max)=>{
  const st=await fs.lstat(file);
  if(!st.isFile()||st.size>max)throw Error('invalid simulation input file');
  const raw=await fs.readFile(file);
  if(raw.length>max)throw Error('simulation input size limit');
  return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const requireOk=(v,message)=>{if(!v)throw Error('DeckForge SDK simulation: '+message);};
function settings(value){
  requireOk(value&&typeof value==='object'&&!Array.isArray(value),'invalid settings object');
  return structuredClone(validateValue(value,8192));
}
function prepare(manifest,scenario){
  const m=validateNativeManifest(manifest);
  requireOk(m.permissions.every(p=>['display','network.request'].includes(p))&&!Object.keys(m.dependencies||{}).length&&!m.id.startsWith('com.deckforge.native.ulanzi-'),'display-only or mock HTTPS independent manifest required');
  requireOk((m.networkEndpoints||[]).every(e=>e.method!=='WSS'&&e.auth===undefined),'authenticated or WebSocket endpoints are not supported in offline simulation');
  requireOk(exact(scenario,['actionId','slot','settings','steps','httpResponses'])&&Number.isInteger(scenario.slot)&&scenario.slot>=0&&scenario.slot<=18,'invalid scenario');
  const action=m.actions.find(a=>a.id===scenario.actionId);
  requireOk(action&&action.controllers.includes(scenario.slot>=16?'Encoder':'Keypad'),'action/controller mismatch');
  requireOk(Array.isArray(scenario.steps)&&scenario.steps.length<=24,'invalid scenario steps');
  const steps=scenario.steps.map(step=>{
    requireOk(exact(step,['kind','ticks','settings']),'invalid step');
    const rotation=['left','right','hold-left','hold-right'].includes(step.kind);
    requireOk(rotation||['down','up','settings','suspend','resume'].includes(step.kind),'unsupported step');
    if(rotation)requireOk(scenario.slot>=16&&Number.isInteger(step.ticks??1)&&(step.ticks??1)>=1&&(step.ticks??1)<=8&&step.settings===undefined,'invalid rotation');
    else requireOk(step.ticks===undefined&&(step.kind==='settings'||step.settings===undefined),'invalid step options');
    return step.kind==='settings'?{kind:step.kind,settings:settings(step.settings)}:{kind:step.kind,...(rotation?{ticks:step.ticks??1}:{})};
  });
  const responses=scenario.httpResponses??[];
  requireOk(Array.isArray(responses)&&responses.length<=64&&Buffer.byteLength(JSON.stringify(responses))<=48000,'invalid HTTP response fixtures');
  requireOk(m.permissions.includes('network.request')||responses.length===0,'HTTP fixtures require network.request');
  const httpResponses=responses.map(r=>{
    requireOk(exact(r,['endpoint','ok','status','body','error']),'invalid HTTP fixture');
    const endpoint=m.networkEndpoints?.find(e=>e.id===r.endpoint);
    requireOk(endpoint&&typeof r.ok==='boolean'&&Number.isInteger(r.status)&&typeof r.body==='string','invalid HTTP fixture fields');
    if(r.ok)requireOk(r.status>=200&&r.status<300&&r.error===null,'invalid successful HTTP fixture');
    else requireOk(r.body===''&&['http-error','redirect-denied','timeout','connection-error','response-limit','unsupported-response','response-error'].includes(r.error)&&
      (r.error==='http-error'?r.status>=400&&r.status<=599:r.error==='redirect-denied'?r.status>=300&&r.status<400:r.status===0),'invalid failed HTTP fixture');
    const normalized=normalizeNetworkResult(endpoint,r);
    requireOk(normalized.error===r.error,'HTTP fixture rejected by SDK response contract');
    return normalized;
  });
  return {m,scenario:{actionId:action.id,slot:scenario.slot,settings:settings(scenario.settings??{}),steps,httpResponses}};
}
async function runScenario(manifest,spec,root){
  const {m,scenario}=prepare(manifest,spec);
  requireOk(m.apiVersion===1||!!process.versions.electron,'API 2 requires sandboxed Electron');
  const context='offline-test',visual={title:null,image:false},steps=[];
  // HTTPS is handled exclusively by ordered response fixtures. No real transport,
  // hardware, editor or persistent profile. Disable recovery timers for deterministic traces.
  let responseIndex=0;const httpRequests=[];
  const networkRequest=async(endpoint,_body,signal)=>{
    const fixture=scenario.httpResponses[responseIndex];
    const matched=fixture?.endpoint===endpoint.id;
    if(matched)responseIndex++;
    const response=signal.aborted?networkFailure(endpoint.id,'cancelled'):matched?fixture:networkFailure(endpoint.id,'connection-error');
    httpRequests.push({endpoint:endpoint.id,method:endpoint.method,matched,ok:response.ok,status:response.status,error:response.error});
    return structuredClone(response);
  };
  const host=new NativePluginHost(root,e=>{
    if(e.context!==context)return;
    if(e.kind==='setTitle')visual.title=e.payload.title;
    if(e.kind==='setImage')visual.image=!!e.payload.image;
  },null,{recoveryDelay:[],networkRequest});
  const cfg={context,slot:scenario.slot,pluginUUID:m.id,actionUUID:scenario.actionId,settings:scenario.settings,configRevision:0};
  async function settle(){
    const deadline=Date.now()+15000;
    while(true){
      const ctx=host.contexts.get(context);
      requireOk(ctx,'context not registered');
      if(!ctx.pending&&!host.networkPending.size)return;
      requireOk(Date.now()<deadline,'scenario event timeout');
      if(!ctx.pending){await new Promise(resolve=>setImmediate(resolve));continue;}
      let timer;
      await Promise.race([ctx.queue,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('scenario event timeout')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
    }
  }
  function snapshot(kind,accepted){
    const ctx=host.contexts.get(context);
    return {kind,accepted,title:visual.title,state:ctx.state,image:visual.image,status:host.suspended?'suspended':ctx.failed?'failed':'active',...(m.permissions.includes('network.request')?{httpRequestCount:httpRequests.length}:{})};
  }
  try{
    host.sync([cfg],[m]);await settle();
    const initial=snapshot('appear',true);
    for(const step of scenario.steps){
      let accepted=true;
      if(step.kind==='settings'){
        cfg.settings=step.settings;cfg.configRevision++;host.sync([cfg],[m]);
      }else if(step.kind==='suspend')host.suspend();
      else if(step.kind==='resume')host.resume();
      else accepted=host.key(context,step.kind,step.ticks??1);
      await settle();steps.push(snapshot(step.kind,accepted));
    }
    const errors=host.diagnostics(m).errors;
    const http=m.permissions.includes('network.request')?{mode:'mock',requests:httpRequests,unusedResponses:scenario.httpResponses.length-responseIndex}:null;
    return {id:m.id,apiVersion:m.apiVersion,actionId:scenario.actionId,initial,steps,errors,...(http?{http}:{}),ok:initial.status!=='failed'&&steps.every(s=>s.accepted&&s.status!=='failed')&&errors.total===0&&(!http||(!http.unusedResponses&&http.requests.every(r=>r.matched)))};
  }finally{host.close();}
}
async function simulateFile(input,spec){
  const {m,scenario}=prepare(await readJson(input,LIMIT),await readJson(spec,65536));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-sdk-offline-'));
  try{
    if(m.apiVersion===1)return await runScenario(m,scenario,root);
    const electron=require('electron');
    requireOk(typeof electron==='string','run the CLI with Node and installed Electron development dependency');
    const manifestFile=path.join(root,'manifest.json'),scenarioFile=path.join(root,'scenario.json'),resultFile=path.join(root,'result.json');
    await fs.writeFile(manifestFile,JSON.stringify(m),{flag:'wx'});await fs.writeFile(scenarioFile,JSON.stringify(scenario),{flag:'wx'});
    try{await promisify(execFile)(electron,[path.join(__dirname,'deckforge-sdk-simulate-electron.cjs'),root],{timeout:180000,maxBuffer:1024*1024,windowsHide:true});}
    catch{throw Error('DeckForge SDK simulation: isolated Electron process failed or timed out');}
    return await readJson(resultFile,1024*1024);
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
module.exports={runScenario,simulateFile,readJson};
