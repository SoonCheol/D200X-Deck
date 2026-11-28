'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {EventEmitter}=require('node:events');
const {promisify}=require('node:util');
const {NativePluginHost,validateNativeManifest,LIMIT}=require('./deckforge-native-sdk.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const {normalizeNetworkResult,networkFailure}=require('./deckforge-native-network.cjs');
const {digest}=require('./deckforge-trusted-node.cjs');
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
// Only documented, scalar snapshot fields may be asserted. No executable
// expressions, arbitrary object paths, or raw settings/credential access.
const EXPECT_STATES=['active','failed','paused','suspended'];
const EXPECT_SERVICE=['active','failed','suspended','stopped','unavailable','waiting','capacity','recovering','policy-error'];
const EXPECT_SOCKET=['connected','connecting','disconnected','reconnecting'];
function expectedSnapshot(value,m,hasFaults){
  const validators={title:v=>v===null||typeof v==='string'&&v.length<=256,
    state:v=>Number.isInteger(v)&&v>=0&&v<=1,image:v=>typeof v==='boolean',accepted:v=>typeof v==='boolean',
    status:v=>EXPECT_STATES.includes(v)};
  const count=v=>Number.isSafeInteger(v)&&v>=0;
  if(m.permissions.includes('network.request'))validators.httpRequestCount=count;
  if(m.permissions.includes('global.settings'))validators.globalRevision=count;
  if(m.service)validators.serviceStatus=v=>EXPECT_SERVICE.includes(v);
  if(m.permissions.includes('network.websocket')){validators.socket=v=>EXPECT_SOCKET.includes(v);if(m.service)validators.serviceSocket=validators.socket;}
  if(hasFaults){validators.recoveryAttempts=count;if(m.service)validators.serviceRecoveryAttempts=count;}
  requireOk(exact(value,Object.keys(validators))&&Object.keys(value).length>0&&Object.entries(value).every(([key,v])=>validators[key](v)),'invalid expected snapshot');
  return structuredClone(value);
}
function compareExpectations(scenario,report){
  let checked=0;const mismatches=[];
  const compare=(target,expected,actual)=>{
    for(const [field,value] of Object.entries(expected||{})){
      checked++;
      if(!Object.hasOwn(actual,field)||actual[field]!==value)mismatches.push({target,field,expected:value,actual:actual[field]??null});
    }
  };
  compare('initial',scenario.expectInitial,report.initial);
  for(const [i,step] of scenario.steps.entries())compare('steps['+i+']',step.expect,report.steps[i]);
  if(scenario.expectErrorTotal!==undefined)compare('errors',{total:scenario.expectErrorTotal},report.errors);
  return {checked,passed:checked-mismatches.length,failed:mismatches.length,mismatches};
}
function prepare(manifest,scenario){
  const m=validateNativeManifest(manifest);
  requireOk(m.permissions.every(p=>['display','network.request','node.run','settings.write','global.settings','background.run','network.websocket'].includes(p))&&!Object.keys(m.dependencies||{}).length&&!m.id.startsWith('com.deckforge.native.ulanzi-'),'display-only or supported offline independent manifest required');
  requireOk((m.networkEndpoints||[]).every(e=>e.auth===undefined),'authenticated endpoints are not supported in offline simulation');
  requireOk(exact(scenario,['actionId','slot','settings','steps','httpResponses','nodeResponses','settingsResponses','globalSettings','globalResponses','expectInitial','expectErrorTotal'])&&Number.isInteger(scenario.slot)&&scenario.slot>=0&&scenario.slot<=18,'invalid scenario');
  const action=m.actions.find(a=>a.id===scenario.actionId);
  requireOk(action&&action.controllers.includes(scenario.slot>=16?'Encoder':'Keypad'),'action/controller mismatch');
  requireOk(Array.isArray(scenario.steps)&&scenario.steps.length<=24,'invalid scenario steps');
  const hasFaults=scenario.steps.some(step=>step?.kind==='runtime-fault');
  const steps=scenario.steps.map(step=>{
    requireOk(exact(step,['kind','ticks','settings','scope','body','expect']),'invalid step');
    const expected=step.expect===undefined?{}:{expect:expectedSnapshot(step.expect,m,hasFaults)};
    const rotation=['left','right','hold-left','hold-right'].includes(step.kind);
    const serviceControl=['service-start','service-stop','service-restart'].includes(step.kind);
    const socketStep=['socket-message','socket-close','socket-disconnect','socket-error'].includes(step.kind);
    const fault=step.kind==='runtime-fault';
    requireOk(rotation||['down','up','settings','suspend','resume'].includes(step.kind)||serviceControl&&m.service||socketStep&&m.permissions.includes('network.websocket')||fault&&m.apiVersion===2,'unsupported step');
    if(socketStep||fault){
      const scope=step.scope??'button';
      requireOk((scope==='button'||scope==='service'&&m.service)&&step.ticks===undefined&&step.settings===undefined,'invalid simulation target');
      requireOk(step.kind==='socket-message'?typeof step.body==='string'&&Buffer.byteLength(JSON.stringify(step.body))<=8192:step.body===undefined,'invalid socket message fixture');
      return {kind:step.kind,scope,...(step.kind==='socket-message'?{body:step.body}:{}),...expected};
    }
    requireOk(step.scope===undefined&&step.body===undefined,'invalid step options');
    if(rotation)requireOk(scenario.slot>=16&&Number.isInteger(step.ticks??1)&&(step.ticks??1)>=1&&(step.ticks??1)<=8&&step.settings===undefined,'invalid rotation');
    else requireOk(step.ticks===undefined&&(step.kind==='settings'||step.settings===undefined),'invalid step options');
    return step.kind==='settings'?{kind:step.kind,settings:settings(step.settings),...expected}:{kind:step.kind,...(rotation?{ticks:step.ticks??1}:{}),...expected};
  });
  const responses=scenario.httpResponses??[];
  requireOk(Array.isArray(responses)&&responses.length<=64&&Buffer.byteLength(JSON.stringify(responses))<=48000,'invalid HTTP response fixtures');
  requireOk(m.permissions.includes('network.request')||responses.length===0,'HTTP fixtures require network.request');
  const httpResponses=responses.map(r=>{
    requireOk(exact(r,['endpoint','ok','status','body','error']),'invalid HTTP fixture');
    const endpoint=m.networkEndpoints?.find(e=>e.id===r.endpoint);
    requireOk(endpoint&&endpoint.method!=='WSS'&&typeof r.ok==='boolean'&&Number.isInteger(r.status)&&typeof r.body==='string','invalid HTTP fixture fields');
    if(r.ok)requireOk(r.status>=200&&r.status<300&&r.error===null,'invalid successful HTTP fixture');
    else requireOk(r.body===''&&['http-error','redirect-denied','timeout','connection-error','response-limit','unsupported-response','response-error'].includes(r.error)&&
      (r.error==='http-error'?r.status>=400&&r.status<=599:r.error==='redirect-denied'?r.status>=300&&r.status<400:r.status===0),'invalid failed HTTP fixture');
    const normalized=normalizeNetworkResult(endpoint,r);
    requireOk(normalized.error===r.error,'HTTP fixture rejected by SDK response contract');
    return normalized;
  });
  const nodes=scenario.nodeResponses??[],receipts=scenario.settingsResponses??[];
  requireOk(Array.isArray(nodes)&&nodes.length<=64&&Buffer.byteLength(JSON.stringify(nodes))<=48000,'invalid Node response fixtures');
  requireOk(m.permissions.includes('node.run')||nodes.length===0,'Node fixtures require node.run');
  const nodeResponses=nodes.map(r=>{
    requireOk(exact(r,['task','status','value'])&&typeof r.task==='string'&&Object.hasOwn(m.nodeTasks||{},r.task)&&
      ['ok','error','timeout','runtime-unavailable','result-limit','invalid-result'].includes(r.status),'invalid Node fixture');
    if(r.status==='ok'){requireOk(Object.hasOwn(r,'value'),'Node fixture value required');validateValue({value:r.value},8192);}
    else requireOk(!Object.hasOwn(r,'value'),'failed Node fixture cannot carry a value');
    return structuredClone(r);
  });
  requireOk(Array.isArray(receipts)&&receipts.length<=64&&receipts.every(x=>['saved','rejected','unknown'].includes(x)),'invalid settings response fixtures');
  requireOk(m.permissions.includes('settings.write')||receipts.length===0,'settings fixtures require settings.write');
  const globalResponses=scenario.globalResponses??[];
  requireOk(Array.isArray(globalResponses)&&globalResponses.length<=64&&globalResponses.every(x=>['saved','conflict'].includes(x)),'invalid global response fixtures');
  requireOk(m.permissions.includes('global.settings')||(scenario.globalSettings===undefined&&globalResponses.length===0),'global fixtures require global.settings');
  requireOk(scenario.expectErrorTotal===undefined||Number.isSafeInteger(scenario.expectErrorTotal)&&scenario.expectErrorTotal>=0,'invalid expected error total');
  return {m,scenario:{actionId:action.id,slot:scenario.slot,settings:settings(scenario.settings??{}),steps,httpResponses,nodeResponses,settingsResponses:[...receipts],
    ...(scenario.expectInitial===undefined?{}:{expectInitial:expectedSnapshot(scenario.expectInitial,m,hasFaults)}),...(scenario.expectErrorTotal===undefined?{}:{expectErrorTotal:scenario.expectErrorTotal}),
    ...(m.permissions.includes('global.settings')?{globalSettings:settings(scenario.globalSettings??{}),globalResponses:[...globalResponses]}:{})}};

}
async function runScenario(manifest,spec,root){
  const {m,scenario}=prepare(manifest,spec);
  requireOk(m.apiVersion===1||!!process.versions.electron,'API 2 requires sandboxed Electron');
  const context='offline-test',visual={title:null,image:false},steps=[];
  // All transport and external effects are simulated; no hardware or real user profile.
  // Explicit runtime-fault scenarios enable bounded recovery; other tests remain deterministic.
  let responseIndex=0;const httpRequests=[];
  const networkRequest=async(endpoint,_body,signal)=>{
    const fixture=scenario.httpResponses[responseIndex];
    const matched=fixture?.endpoint===endpoint.id;
    if(matched)responseIndex++;
    const response=signal.aborted?networkFailure(endpoint.id,'cancelled'):matched?fixture:networkFailure(endpoint.id,'connection-error');
    httpRequests.push({endpoint:endpoint.id,method:endpoint.method,matched,ok:response.ok,status:response.status,error:response.error});
    return structuredClone(response);
  };
  let nodeIndex=0,settingsIndex=0;const nodeRequests=[],settingsRequests=[];
  const taskIds=new Map(Object.entries(m.nodeTasks||{}).map(([id,task])=>[task,id]));
  // Only the simulated manifest receives an in-memory grant. Never access the OS grant store.
  const nodePermissions={read:async id=>({revision:null,value:id===m.id?{digest:digest(m),approved:true}:{}})};
  const nodeExecute=async(task,_input,_cwd,signal)=>{
    const id=taskIds.get(task),fixture=scenario.nodeResponses[nodeIndex],matched=!!id&&fixture?.task===id;
    if(matched)nodeIndex++;
    const result=signal.aborted?{status:'cancelled'}:matched?{status:fixture.status,...(fixture.status==='ok'?{value:structuredClone(fixture.value)}:{})}:{status:'error'};
    nodeRequests.push({task:id??null,matched,status:result.status});
    return result;
  };
  // A separate in-memory global vault, never a real credential or settings file.
  let globalValue=structuredClone(scenario.globalSettings??{}),globalRevision=0,globalIndex=0;
  const globalRequests=[];
  const vault={
    read:async id=>{requireOk(id===m.id,'unexpected global vault ID');return {value:structuredClone(globalValue),revision:globalRevision};},
    write:async(id,value,revision,active)=>{
      requireOk(id===m.id,'unexpected global vault ID');validateValue(value);
      if(!active())return false;
      const fixture=scenario.globalResponses?.[globalIndex],matched=fixture!==undefined;
      if(matched)globalIndex++;
      const saved=fixture==='saved'&&revision===globalRevision;
      globalRequests.push({matched,status:saved?'saved':'conflict'});
      if(saved){globalValue=structuredClone(value);globalRevision++;}
      return saved;
    }
  };
  const sockets=[],socketEvents=[];
  let injectedFaults=0;
  class OfflineSocket extends EventEmitter{
    constructor(endpoint){
      super();this.readyState=0;this.bufferedAmount=0;this.record={endpoint:endpoint.id,sends:0,terminated:false};sockets.push(this.record);
      queueMicrotask(()=>{if(this.readyState!==0)return;this.readyState=1;this.emit('open');});
    }
    send(_data,callback){if(this.readyState!==1)throw Error('mock socket closed');this.record.sends++;callback?.();}
    terminate(){this.readyState=3;this.record.terminated=true;}
    server(kind,body){
      if(this.readyState!==1)return false;
      if(kind==='socket-message')this.emit('message',Buffer.from(body,'utf8'),false);
      else if(kind==='socket-error'){this.readyState=3;const error=Error('mock connection reset');error.code='ECONNRESET';this.emit('error',error);}
      else{this.readyState=3;this.emit('close',kind==='socket-disconnect'?1006:1000);}
      return true;
    }
  }
  const socketFactory=endpoint=>new OfflineSocket(endpoint);
  const hasFaults=scenario.steps.some(s=>s.kind==='runtime-fault');
  // Service preference writes and Node working directories are isolated per run.
  const runRoot=await fs.mkdtemp(path.join(root,'scenario-'));
  const host=new NativePluginHost(runRoot,e=>{
    if(e.context!==context)return;
    if(e.kind==='setTitle')visual.title=e.payload.title;
    if(e.kind==='setImage')visual.image=!!e.payload.image;
    if(e.kind==='nativeSettingsCommit'){
      const fixture=scenario.settingsResponses[settingsIndex],matched=fixture!==undefined;
      if(matched)settingsIndex++;
      const status=fixture??'rejected';settingsRequests.push({matched,status});
      if(status!=='unknown')host.acknowledgeSettings(context,e.receiptId,status==='saved');
    }
  },null,{recoveryDelay:hasFaults?[20,40]:[],networkRequest,nodePermissions,nodeExecute,vault,socketFactory,socketRetryDelays:[25,50],settingsReceiptTimeout:250});
  const cfg={context,slot:scenario.slot,pluginUUID:m.id,actionUUID:scenario.actionId,settings:scenario.settings,configRevision:0};
  async function settle(){
    const deadline=Date.now()+15000;
    while(true){
      const ctx=host.contexts.get(context);
      requireOk(ctx,'context not registered');
      const pending=()=>[...host.contexts.values()].filter(c=>c.pending);
      const busy=()=>pending().length||host.networkPending.size||host.nodeTasks.jobs.size||host.retired.size||[...host.contexts.values()].some(c=>c.recoveryTimer||c.socketToken&&!c.socketToken.ready);
      if(!busy()){
        await new Promise(resolve=>setImmediate(resolve));
        if(!busy())return;
      }
      requireOk(Date.now()<deadline,'scenario event timeout');
      const queues=pending().map(c=>c.queue);
      if(!queues.length){await new Promise(resolve=>setTimeout(resolve,5));continue;}
      let timer;
      await Promise.race([Promise.all(queues),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('scenario event timeout')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
    }
  }
  function target(scope){return scope==='service'?[...host.contexts.values()].find(c=>c.service):host.contexts.get(context);}
  function socketState(ctx){const t=ctx?.socketToken;return t?(t.retryTimer?'reconnecting':t.ready?'connected':'connecting'):'disconnected';}
  function snapshot(kind,accepted){
    const ctx=host.contexts.get(context);
    return {kind,accepted,title:visual.title,state:ctx.state,image:visual.image,status:host.suspended?'suspended':ctx.failed?'failed':ctx.settingsUncertain?'paused':'active',...(m.permissions.includes('network.request')?{httpRequestCount:httpRequests.length}:{}),...(m.service?{serviceStatus:host.serviceStatus(m.id).state}:{}),...(m.permissions.includes('global.settings')?{globalRevision}:{}),...(m.permissions.includes('network.websocket')?{socket:socketState(ctx),...(m.service?{serviceSocket:socketState(target('service'))}:{})}:{}),...(hasFaults?{recoveryAttempts:ctx.recoveryAttempts||0,...(m.service?{serviceRecoveryAttempts:target('service')?.recoveryAttempts||0}:{})}:{})};
  }
  try{
    if(m.service)await host.loadServicePolicy();
    host.sync([cfg],[m]);await settle();
    const initial=snapshot('appear',true);
    for(const step of scenario.steps){
      let accepted=true;
      if(step.kind==='settings'){
        cfg.settings=step.settings;cfg.configRevision=(host.contexts.get(context).configRevision??cfg.configRevision)+1;host.sync([cfg],[m]);
      }else if(step.kind==='suspend')host.suspend();
      else if(step.kind==='resume')host.resume();
      else if(step.kind.startsWith('service-')){
        requireOk(!host.suspended,'resume before service control');await host.manageService([m],m.id,step.kind.slice(8));
      }else if(step.kind.startsWith('socket-')){
        const socket=target(step.scope)?.socketToken?.socket;
        accepted=socket instanceof OfflineSocket&&socket.server(step.kind,step.body);
        socketEvents.push({kind:step.kind,scope:step.scope,accepted});
      }else if(step.kind==='runtime-fault'){
        const ctx=target(step.scope);
        accepted=!!ctx&&!host.suspended&&!ctx.failed&&!ctx.settingsUncertain;
        if(accepted){const error=Error('injected runtime unavailable');error.code='SDK_RUNTIME_UNAVAILABLE';injectedFaults++;host.fail(ctx,error);}
      }else accepted=host.key(context,step.kind,step.ticks??1);
      await settle();steps.push(snapshot(step.kind,accepted));
    }
    const errors=host.diagnostics(m).errors;
    const http=m.permissions.includes('network.request')?{mode:'mock',requests:httpRequests,unusedResponses:scenario.httpResponses.length-responseIndex}:null;
    const node=m.permissions.includes('node.run')?{mode:'mock',requests:nodeRequests,unusedResponses:scenario.nodeResponses.length-nodeIndex}:null;
    const settingsMock=m.permissions.includes('settings.write')?{mode:'memory',requests:settingsRequests,unusedResponses:scenario.settingsResponses.length-settingsIndex}:null;
    const globalMock=m.permissions.includes('global.settings')?{mode:'memory',requests:globalRequests,unusedResponses:scenario.globalResponses.length-globalIndex,revision:globalRevision}:null;
    const socketMock=m.permissions.includes('network.websocket')?{mode:'mock',connections:structuredClone(sockets),events:socketEvents}:null;
    const expectedConflict=globalRequests.filter(r=>r.matched&&r.status==='conflict').length;
    const expectedRejected=settingsRequests.filter(r=>r.matched&&r.status==='rejected').length;
    const expectedUnknown=settingsRequests.filter(r=>r.matched&&r.status==='unknown').length;
    const errorMatch=errors.total===expectedRejected+expectedUnknown+expectedConflict+injectedFaults&&(errors.counts['runtime-unavailable']||0)===injectedFaults&&(errors.counts['settings-rejected']||0)===expectedRejected&&(errors.counts['settings-unknown']||0)===expectedUnknown&&(errors.counts['settings-conflict']||0)===expectedConflict;
    const complete=mock=>!mock||(!mock.unusedResponses&&mock.requests.every(r=>r.matched));
    const report={id:m.id,apiVersion:m.apiVersion,actionId:scenario.actionId,initial,steps,errors,...(http?{http}:{}),...(node?{node}:{}),...(settingsMock?{settingsMock}:{}),...(globalMock?{globalMock}:{}),...(socketMock?{socketMock}:{}),...(hasFaults?{injectedFaults}:{}),
      ok:initial.status!=='failed'&&initial.serviceStatus!=='failed'&&steps.every(s=>s.accepted&&s.status!=='failed'&&s.serviceStatus!=='failed')&&errorMatch&&complete(http)&&complete(node)&&complete(settingsMock)&&complete(globalMock)};
    const assertions=compareExpectations(scenario,report);
    return {...report,assertions,ok:report.ok&&assertions.failed===0};
  }finally{host.close();await fs.rm(runRoot,{recursive:true,force:true});}
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
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    try{await promisify(execFile)(electron,[path.join(__dirname,'deckforge-sdk-simulate-electron.cjs'),root],{timeout:180000,maxBuffer:1024*1024,windowsHide:true,env});}
    catch{throw Error('DeckForge SDK simulation: isolated Electron process failed or timed out');}
    return await readJson(resultFile,1024*1024);
  }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
module.exports={runScenario,simulateFile,readJson};
