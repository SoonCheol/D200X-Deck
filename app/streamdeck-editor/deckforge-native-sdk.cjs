'use strict';
// API 1 declarative; API 2 JavaScript in a sandboxed renderer.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {SdkScheduler}=require('./deckforge-sdk-scheduler.cjs');
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
const {pixelImage}=require('./deckforge-pixel-image.cjs');
const {NativeAnimationPlayer}=require('./deckforge-native-animation.cjs');
const {NativeSettingsVault,validateValue}=require('./deckforge-native-settings.cjs');
const {NativeVersionStore,assertAppRequirement}=require('./deckforge-native-versions.cjs');
const {validateDependencies,resolveDependencies,assertDependencyChange}=require('./deckforge-native-dependencies.cjs');
const {validateWideOverlay}=require('./deckforge-native-wide.cjs');
const {validateNativeSettingsSchema,nativeEffectiveSettings,nativeDynamicOptions}=require('./deck-core.js');
const {validateNetworkEndpoints,validateNetworkRequest,resolveNetworkEndpoint,validateSocketOperation,createSocket,requestEndpoint,networkFailure,normalizeNetworkResult,credentialBinding,validBearer,socketReceiveLimit}=require('./deckforge-native-network.cjs');
const APP_VERSION=require('./package.json').version;
const SUFFIX='.deckforge-native.json', LIMIT=1024*1024;
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
const EVENTS=new Set(['appear','disappear','settings','press','release','rotateLeft','rotateRight','heldRotateLeft','heldRotateRight']);
const OPS=new Set(['title','titleFromSetting','state','stateFromSetting','toggleState','image']);
const EXTRA_PERMISSIONS=['settings.write','navigation','wide.mode','global.settings','wide.overlay','network.request','timer.tick','network.poll','network.websocket','background.run'];
const SERVICE_PREFIX='@service:',MAX_SERVICES=8;
const MAX_PENDING_EVENTS=64,INPUT_RESERVE=4,MAX_NETWORK_GLOBAL=8,MAX_NETWORK_PLUGIN=2;
const INPUT_EVENTS=new Set(['press','release','rotateLeft','rotateRight','heldRotateLeft','heldRotateRight']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validText=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
function check(ok,message){if(!ok)throw Error('DeckForge SDK: '+message);}
function validateNativePng(value){
  check(typeof value==='string'&&value.length<=350000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value),'invalid PNG data URI');
  const bytes=Buffer.from(value.slice(22),'base64');
  check(bytes.toString('base64')===value.slice(22)&&verifyPng(bytes).ok,'invalid PNG integrity or unsupported encoding');
}
function validateNativeImage(value){
  if(typeof value==='string'&&value.startsWith('data:image/svg+xml;base64,')){
    const prefix='data:image/svg+xml;base64,',encoded=value.slice(prefix.length);
    check(value.length<=350000&&/^[A-Za-z0-9+/]+={0,2}$/.test(encoded),'invalid SVG data URI');
    const bytes=Buffer.from(encoded,'base64');
    check(bytes.toString('base64')===encoded&&require('./ulanzi-media-analysis.cjs').svgReport(bytes).status==='restricted-vector-review','invalid or unsupported SVG');
    return;
  }
  validateNativePng(value);
}
const sharedKey=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
function validateSharedView(view,schema){
  check(exact(view,['keys','map','selection'])&&Object.keys(view).length===3&&Array.isArray(view.keys)&&view.keys.length<=8&&
    view.keys.every(sharedKey)&&new Set(view.keys).size===view.keys.length&&sharedKey(view.map)&&!view.keys.includes(view.map)&&
    sharedKey(view.selection)&&schema?.some(f=>f.key===view.selection&&['dynamicSelect','dynamicMultiSelect','text'].includes(f.type)),'invalid shared state view');
}
function projectSharedState(ctx,snapshot){
  const view=ctx.action?.sharedStateView;
  if(ctx.service||!view)return structuredClone(snapshot);
  const out={};
  for(const key of view.keys)if(Object.hasOwn(snapshot,key))out[key]=snapshot[key];
  const field=ctx.action.settingsSchema?.find(f=>f.key===view.selection);
  const raw=Object.hasOwn(ctx.settings||{},view.selection)?ctx.settings[view.selection]:field?.default;
  const ids=(Array.isArray(raw)?raw:[raw]).filter(v=>typeof v==='string'&&v.length<=256).slice(0,8);
  const entries={},source=snapshot[view.map];
  if(obj(source))for(const id of ids)if(!['__proto__','constructor','prototype'].includes(id)&&Object.hasOwn(source,id))entries[id]=source[id];
  out[view.map]=entries;
  return structuredClone(out);
}
function validateNativeManifest(m){
  check(exact(m,['apiVersion','id','name','version','permissions','actions','requiresDeckForge','dependencies','networkEndpoints','service'])&&[1,2].includes(m.apiVersion)&&
    typeof m.id==='string'&&ID.test(m.id)&&!m.id.endsWith('.')&&!m.id.includes('..')&&
    validText(m.name,180)&&validText(m.version,64),'invalid manifest or API version');
  assertAppRequirement(m.requiresDeckForge,APP_VERSION);
  validateDependencies(m.id,m.dependencies);
  check(Array.isArray(m.permissions)&&m.permissions.includes('display')&&new Set(m.permissions).size===m.permissions.length&&
    m.permissions.every(p=>p==='display'||(m.apiVersion===2&&EXTRA_PERMISSIONS.includes(p))),'unsupported permissions');
  check((m.service!==undefined)===m.permissions.includes('background.run'),'background service requires explicit permission and declaration');
  if(m.service!==undefined){
    const service=m.service;
    check(m.apiVersion===2&&exact(service,['script','tickIntervalMs','sharedStateBytes'])&&typeof service.script==='string'&&service.script.length>0&&Buffer.byteLength(service.script)<=65536,'invalid background service');
    check(service.tickIntervalMs===undefined||(m.permissions.includes('timer.tick')&&Number.isInteger(service.tickIntervalMs)&&service.tickIntervalMs>=1000&&service.tickIntervalMs<=3600000),'invalid background tick');
    check(service.sharedStateBytes===undefined||[8192,262144].includes(service.sharedStateBytes),'invalid shared state limit');
    try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;new AsyncFunction('event','settings','state','memory','api','"use strict";\n'+service.script);}catch{throw Error('DeckForge SDK: invalid background JavaScript syntax');}
  }
  validateNetworkEndpoints(m.networkEndpoints,m.permissions);
  check(!m.permissions.includes('network.poll')||(m.permissions.includes('network.request')&&m.permissions.includes('timer.tick')),'network polling requires timer and network permissions');
  check(Array.isArray(m.actions)&&m.actions.length>0&&m.actions.length<=64,'invalid actions');
  const ids=new Set();
  for(const a of m.actions){
    check(exact(a,m.apiVersion===1?['id','name','controllers','states','events','settingsSchema','stateImages']:['id','name','controllers','states','script','settingsSchema','tickIntervalMs','stateImages','sharedStateView'])&&typeof a.id==='string'&&
      a.id.startsWith(m.id+'.')&&/^[a-z0-9.-]+$/.test(a.id)&&a.id.length<=180&&
      !a.id.endsWith('.')&&!a.id.includes('..')&&!ids.has(a.id)&&validText(a.name,180),'invalid action');
    ids.add(a.id);
    validateNativeSettingsSchema(a.settingsSchema);
    if(a.sharedStateView!==undefined){check(m.apiVersion===2&&m.permissions.includes('background.run'),'shared state view requires background service');validateSharedView(a.sharedStateView,a.settingsSchema);}
    check(Array.isArray(a.controllers)&&a.controllers.length>0&&a.controllers.length<=2&&
      new Set(a.controllers).size===a.controllers.length&&a.controllers.every(c=>['Keypad','Encoder'].includes(c))&&
      [1,2].includes(a.states),'invalid action controllers or states');
    if(a.stateImages!==undefined){
      check(Array.isArray(a.stateImages)&&a.stateImages.length===a.states,'invalid state image count');
      for(const image of a.stateImages)validateNativeImage(image);
    }
    if(m.apiVersion===2){
      check(a.tickIntervalMs===undefined||(m.permissions.includes('timer.tick')&&Number.isInteger(a.tickIntervalMs)&&a.tickIntervalMs>=1000&&a.tickIntervalMs<=3600000),'invalid or unauthorized tick interval');
      check(typeof a.script==='string'&&a.script.length>0&&Buffer.byteLength(a.script)<=65536,'invalid JavaScript source');
      // Compile for syntax validation only. Never invoke plugin code in Node.
      try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;new AsyncFunction('event','settings','state','memory','api','"use strict";\n'+a.script);}catch{throw Error('DeckForge SDK: invalid JavaScript syntax');}
      continue;
    }
    check(obj(a.events),'invalid events');
    for(const [event,program] of Object.entries(a.events)){
      check(EVENTS.has(event)&&Array.isArray(program)&&program.length<=16,'unsupported event or program size');
      for(const op of program){
        check(obj(op)&&OPS.has(op.op),'unsupported operation');
        switch(op.op){
          case 'title':check(exact(op,['op','value'])&&typeof op.value==='string'&&op.value.length<=256,'invalid title');break;
          case 'titleFromSetting':check(exact(op,['op','key','fallback'])&&typeof op.key==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(op.key)&&
            !['__proto__','constructor','prototype'].includes(op.key)&&typeof op.fallback==='string'&&op.fallback.length<=256,'invalid setting reference');break;
          case 'stateFromSetting':check(exact(op,['op','key','match','yes','no'])&&typeof op.key==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(op.key)&&
            !['__proto__','constructor','prototype'].includes(op.key)&&typeof op.match==='string'&&op.match.length<=256&&
            [op.yes,op.no].every(x=>Number.isInteger(x)&&x>=0&&x<a.states),'invalid setting state mapping');break;
          case 'state':check(exact(op,['op','value'])&&Number.isInteger(op.value)&&op.value>=0&&op.value<a.states,'invalid state');break;
          case 'toggleState':check(exact(op,['op'])&&a.states===2,'toggle requires two states');break;
          case 'image':check(exact(op,['op','value']),'invalid image operation');validateNativeImage(op.value);break;
        }
      }
    }
  }
  return m;
}
function catalog(m){return {uuid:m.id,name:m.name,version:m.version,runtime:'deckforge-sdk',permissions:[...m.permissions],dependencies:{...(m.dependencies||{})},background:!!m.service,
  actions:m.actions.map(a=>({uuid:a.id,name:a.name,states:a.states,controllers:a.controllers,
    propertyInspectorPath:'',defaultImages:{off:a.stateImages?.[0]||null,on:a.stateImages?.[1]||null},...(a.settingsSchema?{settingsSchema:a.settingsSchema}:{})}))};}
class NativePluginHost{
  constructor(userData,onUpdate=()=>{},runnerFactory=id=>require('./deckforge-js-runtime.cjs').createScriptRunner(id),options={}){
    this.root=path.join(userData,'Plugins');this.onUpdate=onUpdate;
    this.contexts=new Map();this.serviceDisabled=new Set();this.servicePolicyLoaded=false;this.servicePolicyError=false;this.suspended=false;this.closed=false;this.runnerFactory=runnerFactory;this.retired=new Set();
    const storage=options.storage||{
      isAsyncEncryptionAvailable:()=>require('electron').safeStorage.isAsyncEncryptionAvailable(),
      encryptStringAsync:value=>require('electron').safeStorage.encryptStringAsync(value),
      decryptStringAsync:value=>require('electron').safeStorage.decryptStringAsync(value)
    };
    this.vault=options.vault||new NativeSettingsVault(userData,storage);
    const credentialStorage=options.storage||{...storage,isAsyncEncryptionAvailable:()=>process.platform==='win32'&&storage.isAsyncEncryptionAvailable()};
    this.credentials=options.credentials||new NativeSettingsVault(userData,credentialStorage,'credentials');
    this.credentialChanges=new Set();
    this.recoveryDelay=options.recoveryDelay||[1000,3000];
    this.versions=new NativeVersionStore(this.root,validateNativeManifest);
    this.dependencyWarnings=new Map();
    this.networkRequest=options.networkRequest||requestEndpoint;this.networkPending=new Set();
    this.socketFactory=options.socketFactory||createSocket;this.socketPending=new Set();
    this.socketRetryDelays=options.socketRetryDelays||[1000,3000,10000];
    this.socketHeartbeatMs=options.socketHeartbeatMs??30000;this.socketPongMs=options.socketPongMs??10000;
    this.socketAuthMs=options.socketAuthMs??5000;
    this.tickTimer=null;this.now=options.now||Date.now;
    this.scheduler=new SdkScheduler();
    this.settingsReceiptTimeout=options.settingsReceiptTimeout??5000;
    this.animations=new NativeAnimationPlayer((ctx,image)=>this.onUpdate({kind:'setImage',context:ctx.context,payload:{image}}),options.animationNow);
  }
  async loadServicePolicy(){
    if(this.servicePolicyLoaded)return;
    this.servicePolicyLoaded=true;
    const file=path.join(this.root,'NativeServicePreferences.json');
    try{
      let st;try{st=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
      check(st.isFile()&&st.size<=262144,'invalid background service preferences');
      const raw=await fs.readFile(file,'utf8');
      check(Buffer.byteLength(raw)<=262144,'invalid background service preferences');
      const data=JSON.parse(raw);
      check(exact(data,['version','disabled'])&&data.version===1&&Array.isArray(data.disabled)&&data.disabled.length<=1024&&
        data.disabled.every(id=>typeof id==='string'&&ID.test(id)&&!id.endsWith('.')&&!id.includes('..'))&&new Set(data.disabled).size===data.disabled.length,'invalid background service preferences');
      this.serviceDisabled=new Set(data.disabled);
    }catch{
      // Fail closed; never overwrite an unreadable user preference file.
      this.servicePolicyError=true;this.report('background',Error('service preferences unavailable'));
    }
  }
  async saveServicePolicy(next){
    check(!this.servicePolicyError&&next.size<=1024,'background service preferences unavailable');
    const data=JSON.stringify({version:1,disabled:[...next].sort()});
    check(Buffer.byteLength(data)<=262144,'background service preferences limit');
    const file=path.join(this.root,'NativeServicePreferences.json'),tmp=path.join(this.root,'.native-service-'+randomUUID());
    await fs.mkdir(this.root,{recursive:true});
    try{await fs.writeFile(tmp,data,{flag:'wx'});await fs.rename(tmp,file);}
    finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    this.serviceDisabled=next;
  }
  serviceStatus(id,available=true){
    const enabled=!this.serviceDisabled.has(id)&&!this.servicePolicyError;
    const ctx=this.contexts.get(SERVICE_PREFIX+id);
    const state=this.servicePolicyError?'policy-error':!enabled?'stopped':!available?'unavailable':this.suspended?'suspended':
      this.serviceCapacity?.has(id)?'capacity':!ctx?'waiting':ctx.failed?(ctx.recoveryTimer?'recovering':'failed'):'active';
    const token=ctx?.socketToken;
    return {enabled,state,socket:token?(token.retryTimer?'reconnecting':token.ready?'connected':'connecting'):'disconnected',...(ctx?.socketError?{socketError:ctx.socketError}:{}),...(ctx?.failed?{socketError:'runtime-failed'}:{})};
  }
  async manageService(manifests,id,mode){
    await this.loadServicePolicy();
    const manifest=manifests.find(m=>m.id===id&&m.service);
    check(manifest&&['start','stop','restart'].includes(mode),'invalid background service control');
    check(!this.servicePolicyError,'background service preferences unavailable');
    const graph=resolveDependencies(manifests);
    check(mode==='stop'||graph.ready.has(id),'background service dependency unavailable');
    const next=new Set(this.serviceDisabled);
    if(mode==='stop')next.add(id);else next.delete(id);
    if(next.size!==this.serviceDisabled.size||[...next].some(x=>!this.serviceDisabled.has(x)))await this.saveServicePolicy(next);
    if(mode==='restart'){
      const key=SERVICE_PREFIX+id,ctx=this.contexts.get(key);
      if(ctx){this.retire(ctx);this.contexts.delete(key);}
    }
    this.syncServices(new Map(manifests.filter(m=>graph.ready.has(m.id)).map(m=>[m.id,m])),new Set());
    this.reconcileTickTimer();
    return this.serviceStatus(id,graph.ready.has(id));
  }
  async manifests(){
    await fs.mkdir(this.root,{recursive:true});const items=[];
    for(const e of await fs.readdir(this.root,{withFileTypes:true})){
      if(!e.isFile()||!e.name.endsWith(SUFFIX))continue;
      try{
        const file=path.join(this.root,e.name),st=await fs.lstat(file);
        check(st.isFile()&&st.size<=LIMIT,'invalid installed program');
        const m=validateNativeManifest(JSON.parse(await fs.readFile(file,'utf8')));
        check(e.name===m.id+SUFFIX,'file ID mismatch');items.push(m);
      }catch(error){this.report(e.name,error);}
    }
    return items;
  }
  report(id,error){this.onUpdate({kind:'error',message:'DeckForge SDK '+id+': '+String(error?.message||error).slice(0,300)});}
  async credentialInfo(manifest){
    const endpoints=(manifest.networkEndpoints||[]).filter(e=>e.auth!==undefined);
    return Promise.all(endpoints.map(async e=>{
      const binding=credentialBinding(manifest.id,e);
      const {value,revision}=await this.credentials.read(binding);
      return {id:e.id,url:e.url,method:e.method,binding,revision,configured:validBearer(value.token)};
    }));
  }
  async writeCredential(manifest,binding,revision,token){
    const endpoint=(manifest.networkEndpoints||[]).find(e=>e.auth!==undefined&&credentialBinding(manifest.id,e)===binding);
    check(endpoint&&(revision===null||typeof revision==='string'&&/^[a-f0-9]{64}$/.test(revision))&&
      (token===null||validBearer(token)),'invalid credential input or changed endpoint');
    check(!this.credentialChanges.has(binding),'credential update busy');
    this.credentialChanges.add(binding);
    const cancel=()=>{
      for(const ctx of this.contexts.values())if(ctx.pluginUUID===manifest.id){
        if(ctx.networkToken?.binding===binding)this.cancelNetwork(ctx);
        if(ctx.socketToken?.binding===binding)this.cancelSocket(ctx);
      }
    };
    try{
      cancel();
      const ok=await this.credentials.write(binding,token===null?{}:{token},revision,()=>!this.closed);
      check(ok,'credential changed; reopen settings');
      cancel();
      return {configured:token!==null};
    }finally{this.credentialChanges.delete(binding);}
  }
  async checkDependencies(m,excluded=new Set()){
    validateNativeManifest(m);
    const manifests=(await this.manifests()).filter(p=>!excluded.has(p.id));
    return assertDependencyChange(manifests,m);
  }
  async install(m){
    await this.checkDependencies(m);const data=JSON.stringify(m);
    check(Buffer.byteLength(data)<=LIMIT,'program too large');
    await fs.mkdir(this.root,{recursive:true});
    const tmp=path.join(this.root,'.native-'+randomUUID()),target=path.join(this.root,m.id+SUFFIX);
    try{
      await fs.writeFile(tmp,data,{flag:'wx'});
      // Exclusive publication: never replace the existing installed program.
      await fs.link(tmp,target);
    }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    return catalog(m);
  }
  async planInstall(m){await this.checkDependencies(m);return this.versions.plan(m);}
  async replace(m,expectedRevision){
    await this.checkDependencies(m);
    const retired=[];
    const stop=()=>{
      for(const [id,ctx] of this.contexts)if(ctx.pluginUUID===m.id){
        this.resetScript(ctx);ctx.pressed=false;
        retired.push([id,ctx]);this.contexts.delete(id);
      }
    };
    const restore=()=>{
      if(this.closed)return;
      for(const [id,ctx] of retired){
        this.contexts.set(id,ctx);
        if(!ctx.failed&&!this.suspended)this.initialize(ctx);
      }
    };
    await this.versions.replace(m,expectedRevision,stop,restore);
    return catalog(m);
  }
  validateScriptOps(ctx,event,program){
    check(Array.isArray(program)&&program.length<=16,'invalid operation list');
    const normal=[],effects=[];let pixelCount=0,animationCount=0;
    const validSettings=(v,depth=0)=>{
      if(depth>12)return false;
      if(Array.isArray(v))return v.every(x=>validSettings(x,depth+1));
      if(obj(v))return Object.keys(v).every(k=>!['__proto__','constructor','prototype'].includes(k)&&validSettings(v[k],depth+1));
      return v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
    };
    if(ctx.service)check(ctx.permissions.includes('background.run')&&['start','settings','tick','networkResult','socketEvent','serviceMessage'].includes(event),'invalid background event');
    for(let op of program){
      if(op?.op==='publishSharedState'){
        check(ctx.service&&ctx.permissions.includes('background.run')&&exact(op,['op','value'])&&!normal.some(o=>o.op==='publishSharedState'),'unauthorized or duplicate shared state publication');
        validateValue(op.value,ctx.sharedStateBytes||8192);normal.push(op);continue;
      }
      if(ctx.service)check(['networkRequest','socketConnect','socketSend','socketClose'].includes(op?.op),'background service cannot operate physical controls or saved settings');
      if(op?.op==='animation'||op?.op==='stopAnimation'){
        check(ctx.slot>=0&&ctx.slot<13&&ctx.action.controllers.includes('Keypad')&&++animationCount===1,'animation requires a normal key and one command');
        if(op.op==='animation'){
          check(exact(op,['op','value']),'invalid animation operation');
          normal.push({op:'animation',prepared:this.animations.prepare(ctx,op.value)});
        }else{
          check(exact(op,['op']),'invalid animation stop');
          normal.push(op);
        }
        continue;
      }
      if(op?.op==='pixels'){
        check(++pixelCount<=2,'key drawing limit');
        normal.push(pixelImage(op));continue;
      }
      if(OPS.has(op?.op)){normal.push(op);continue;}
      const polling=event==='tick'&&op?.op==='networkRequest'&&ctx.permissions.includes('network.poll')&&ctx.action.tickIntervalMs>=5000;
      const socketLifecycle=op?.op==='socketConnect'&&['appear','settings','start'].includes(event)&&(event!=='start'||ctx.service);
      const socketContinuation=['socketSend','socketClose'].includes(op?.op)&&event==='socketEvent';
      const serviceInput=ctx.service&&event==='serviceMessage'&&['networkRequest','socketSend','socketClose','socketConnect'].includes(op?.op);
      check(INPUT_EVENTS.has(event)||polling||socketLifecycle||socketContinuation||serviceInput,'privileged operation requires input event');
      check(effects.length===0,'only one privileged operation per event');
      if(op?.op==='settingsPatch'){
        check(ctx.permissions.includes('settings.write')&&exact(op,['op','value'])&&obj(op.value)&&
          Object.keys(op.value).length>0&&Buffer.byteLength(JSON.stringify(op.value))<=8192&&
          validSettings(op.value)&&obj(ctx.settings),'invalid or unauthorized settings patch');
        // Shallow merge against the current generation's stored settings.
        // The existing expectedSettings receipt still rejects concurrent edits.
        op={op:'settings',value:{...ctx.settings,...structuredClone(op.value)}};
      }
      if(op?.op==='settings'){
        check(ctx.permissions.includes('settings.write')&&exact(op,['op','value'])&&obj(op.value)&&
          Buffer.byteLength(JSON.stringify(op.value))<=8192,'invalid or unauthorized settings');
        check(validSettings(op.value),'unsafe settings keys or values');
        if(ctx.action.settingsSchema)nativeEffectiveSettings(ctx.action.settingsSchema,op.value);
      }else if(op?.op==='globalSettings'){
        check(ctx.permissions.includes('global.settings')&&exact(op,['op','value']),'unauthorized global settings');
        validateValue(op.value);
      }else if(op?.op==='navigate'){
        check(ctx.permissions.includes('navigation')&&exact(op,['op','target','value']),'unauthorized navigation');
        const {target,value}=op;
        check((target==='page'&&Number.isInteger(value)&&value>=0&&value<128)||
          (target==='profile'&&validText(value,160))||
          (target==='folder'&&Number.isInteger(value)&&value>=0&&value<13)||
          (target==='back'&&value===null),'invalid navigation target');
      }else if(op?.op==='serviceMessage'){
        check(!ctx.service&&ctx.permissions.includes('background.run')&&exact(op,['op','value']),'unauthorized service message');
        validateValue(op.value);
      }else if(op?.op==='networkRequest'){
        check(ctx.permissions.includes('network.request'),'unauthorized network request');
        const endpoint=validateNetworkRequest(op,ctx.networkEndpoints);
        check(!polling||endpoint.method==='GET','periodic network request must use GET');
      }else if(['socketConnect','socketSend','socketClose'].includes(op?.op)){
        check(ctx.permissions.includes('network.websocket'),'unauthorized WebSocket operation');
        validateSocketOperation(op,ctx.networkEndpoints);
      }else if(op?.op==='wideOverlay'){
        check(ctx.permissions.includes('wide.overlay'),'unauthorized wide overlay');
        validateWideOverlay(op);
      }else if(op?.op==='wideMode'){
        check(ctx.permissions.includes('wide.mode')&&exact(op,['op','value'])&&['clock','datetime','stats','knobs'].includes(op.value),'invalid or unauthorized wide mode');
      }else throw Error('DeckForge SDK: unsupported operation');
      effects.push(op);
    }
    check(!animationCount||!normal.some(op=>op.op==='image'),'animation and static image cannot share an event');
    if(ctx.service)return {normal,effects};
    const {script,tickIntervalMs,stateImages,sharedStateView,...action}=ctx.action;
    validateNativeManifest({apiVersion:1,id:ctx.pluginUUID,name:'Runtime',version:'1',
      permissions:['display'],actions:[{...action,events:{press:normal.filter(op=>!['animation','stopAnimation'].includes(op.op))}}]});
    return {normal,effects};
  }
  sendServiceMessage(ctx,operation){
    const target=this.contexts.get(SERVICE_PREFIX+ctx.pluginUUID);
    if(!target||target.failed||target.pending>=MAX_PENDING_EVENTS-INPUT_RESERVE||this.suspended||this.closed){
      this.report(ctx.pluginUUID,Error('background service message not accepted'));return;
    }
    this.runScript(target,'serviceMessage',{actionId:ctx.action.id,message:structuredClone(operation.value)});
  }
  sharedSnapshot(ctx){
    if(!ctx.permissions.includes('background.run'))return {};
    const service=this.contexts.get(SERVICE_PREFIX+ctx.pluginUUID);
    return projectSharedState(ctx,service?.sharedState||{});
  }
  notifyShared(pluginUUID,previous){
    for(const other of this.contexts.values())if(!other.service&&other.pluginUUID===pluginUUID&&other.permissions.includes('background.run')&&!other.failed){
      if(previous&&other.action.sharedStateView&&JSON.stringify(projectSharedState(other,previous))===JSON.stringify(this.sharedSnapshot(other)))continue;
      other.sharedDirty=true;this.queueSharedRefresh(other);
    }
  }
  queueSharedRefresh(ctx){
    if(ctx.sharedDirty&&!ctx.sharedQueued&&!ctx.failed&&!this.closed&&!this.suspended&&this.contexts.get(ctx.context)===ctx&&ctx.pending<MAX_PENDING_EVENTS-INPUT_RESERVE){
      ctx.sharedDirty=false;ctx.sharedQueued=true;
      if(!this.runScript(ctx,'sharedState')){ctx.sharedQueued=false;ctx.sharedDirty=true;}
    }
  }
  applyOps(ctx,program){
      for(const op of program){
        if(op.op==='publishSharedState'){
          if(JSON.stringify(ctx.sharedState)!==JSON.stringify(op.value)){const previous=ctx.sharedState;ctx.sharedState=structuredClone(op.value);this.notifyShared(ctx.pluginUUID,previous);}
          continue;
        }
        const send=(kind,payload)=>this.onUpdate({kind,context:ctx.context,payload});
        if(op.op==='title')send('setTitle',{title:op.value});
        if(op.op==='titleFromSetting'){
          const effective=ctx.action.settingsSchema?nativeEffectiveSettings(ctx.action.settingsSchema,ctx.settings):ctx.settings;
          const value=Object.hasOwn(effective,op.key)?effective[op.key]:undefined;
          send('setTitle',{title:typeof value==='string'?value.slice(0,256):op.fallback});
        }
        if(op.op==='stateFromSetting'){
          const effective=ctx.action.settingsSchema?nativeEffectiveSettings(ctx.action.settingsSchema,ctx.settings):ctx.settings;
          ctx.state=Object.hasOwn(effective,op.key)&&effective[op.key]===op.match?op.yes:op.no;
          send('setState',{state:ctx.state});
        }
        if(op.op==='state'||op.op==='toggleState'){
          ctx.state=op.op==='state'?op.value:1-ctx.state;send('setState',{state:ctx.state});
        }
        if(op.op==='image'){this.animations.stop(ctx);send('setImage',{image:op.value});}
        if(op.op==='stopAnimation')this.animations.stop(ctx);
        if(op.op==='animation'){
          const epoch=ctx.epoch,revision=ctx.settingsRevision;
          const active=()=>!this.closed&&!this.suspended&&!ctx.failed&&this.contexts.get(ctx.context)===ctx&&ctx.epoch===epoch&&ctx.settingsRevision===revision;
          if(!this.animations.start(ctx,op.prepared,active))this.report(ctx.pluginUUID,Error('animation capacity or inactive context'));
        }
      }
  }
  cancelSettingsReceipt(ctx){
    const pending=ctx.settingsReceipt;
    if(pending){ctx.settingsReceipt=null;clearTimeout(pending.timer);pending.resolve(false);}
  }
  requestSettingsCommit(ctx,operation,expectedSettings,active){
    if(!active()||ctx.settingsReceipt)return Promise.resolve(false);
    return new Promise(resolve=>{
      const id=randomUUID(),expiresAt=Date.now()+this.settingsReceiptTimeout;
      const pending={id,active,resolve,value:structuredClone(operation.value),expiresAt,timer:null};
      ctx.settingsReceipt=pending;
      pending.timer=setTimeout(()=>this.cancelSettingsReceipt(ctx),this.settingsReceiptTimeout);
      try{
        this.onUpdate({kind:'nativeSettingsCommit',context:ctx.context,pluginUUID:ctx.pluginUUID,
          actionUUID:ctx.action.id,operation,expectedSettings,receiptId:id,expiresAt});
      }catch{this.cancelSettingsReceipt(ctx);}
    });
  }
  acknowledgeSettings(context,id,accepted){
    const ctx=this.contexts.get(context),pending=ctx?.settingsReceipt;
    if(!pending||pending.id!==id||typeof accepted!=='boolean')return false;
    const ok=accepted&&pending.active()&&Date.now()<=pending.expiresAt;
    ctx.settingsReceipt=null;clearTimeout(pending.timer);
    if(ok){
      // A confirmed write from this same action is not an external edit.
      // Already-admitted input events keep their generation and read the
      // newly saved settings when they reach the head of the FIFO.
      const changed=JSON.stringify(ctx.settings)!==JSON.stringify(pending.value);
      ctx.settings=pending.value;
      if(changed){this.cancelNetwork(ctx);this.cancelSocket(ctx);ctx.settingsRefresh=true;}
    }
    pending.resolve(ok);return ok;
  }
  queueSettingsRefresh(ctx){
    if(ctx.settingsRefresh&&ctx.pending<MAX_PENDING_EVENTS&&!ctx.failed&&!this.closed&&!this.suspended){
      ctx.settingsRefresh=false;this.runScript(ctx,'settings');
    }
  }
  resetScript(ctx){
    this.cancelSettingsReceipt(ctx);ctx.settingsRefresh=false;ctx.sharedDirty=false;ctx.sharedQueued=false;
    if(ctx.service&&Object.keys(ctx.sharedState||{}).length){const previous=ctx.sharedState;ctx.sharedState={};this.notifyShared(ctx.pluginUUID,previous);}
    this.animations.stop(ctx);
    ctx.tickDue=null;
    this.cancelNetwork(ctx);this.cancelSocket(ctx);
    if(ctx.wideOverlaySent){ctx.wideOverlaySent=false;this.onUpdate({kind:'nativeWideReleased',context:ctx.context});}
    clearTimeout(ctx.recoveryTimer);ctx.recoveryTimer=null;
    ctx.epoch=(ctx.epoch||0)+1;
    try{ctx.runner?.close();}catch{}
    ctx.runner=null;ctx.pending=0;ctx.queue=Promise.resolve();
    this.scheduler.prune();
  }
  fail(ctx,error){
    ctx.failed=true;ctx.pressed=false;this.resetScript(ctx);
    // Plugin exceptions may contain credentials; do not forward their text.
    const recoverable=ctx.apiVersion===2&&error?.code==='SDK_RUNTIME_UNAVAILABLE';
    this.report(ctx.pluginUUID,Error(recoverable?'runtime unavailable':'action stopped (execution or validation failure)'));
    const attempt=ctx.recoveryAttempts||0;
    if(!recoverable||this.closed||this.suspended||attempt>=this.recoveryDelay.length)return;
    ctx.recoveryAttempts=attempt+1;
    const epoch=ctx.epoch;
    ctx.recoveryTimer=setTimeout(()=>{
      ctx.recoveryTimer=null;
      if(this.closed||this.suspended||ctx.epoch!==epoch||this.contexts.get(ctx.context)!==ctx)return;
      ctx.failed=false;ctx.pressed=false;ctx.memory={};
      // Only initialize a new instance: never replay a press or write.
      this.initialize(ctx);
    },this.recoveryDelay[attempt]);
    ctx.recoveryTimer.unref?.();
  }
  cancelNetwork(ctx){
    const token=ctx.networkToken;
    if(token){ctx.networkToken=null;token.controller.abort();}
  }
  disposeSocketTransport(token){
    for(const name of ['retryTimer','heartbeatTimer','pongTimer','authTimer']){
      clearTimeout(token[name]);token[name]=null;
    }
    const socket=token.socket;token.socket=null;token.ready=false;
    try{socket?.terminate();}catch{}
  }
  cancelSocket(ctx){
    ctx.socketGeneration=(ctx.socketGeneration||0)+1;
    const token=ctx.socketToken;
    if(!token)return;
    ctx.socketToken=null;this.socketPending.delete(token);
    this.disposeSocketTransport(token);
  }
  socketEvent(ctx,token,event,body='',error=null){
    if(!token.active()||ctx.socketGeneration!==token.generation)return false;
    if(ctx.pending>=MAX_PENDING_EVENTS-INPUT_RESERVE){this.reportBackpressure(ctx);return false;}
    return this.runScript(ctx,'socketEvent',{endpoint:token.endpoint.id,event,body,error},token.settings,token.generation);
  }
  finishSocket(ctx,token,event,error=null,retry=false){
    if(ctx.socketToken!==token)return;
    ctx.socketError=error||null;
    this.disposeSocketTransport(token);
    if(retry&&token.endpoint.reconnect===true&&token.active()&&token.attempt<this.socketRetryDelays.length){
      // Invalidate all previously queued socket events before a new transport.
      // Reconnect the approved endpoint only, never replay a send or input.
      token.generation=ctx.socketGeneration=(ctx.socketGeneration||0)+1;
      const delay=this.socketRetryDelays[token.attempt++];
      token.retryTimer=setTimeout(()=>{
        token.retryTimer=null;
        if(ctx.socketToken===token&&token.active())this.openSocketTransport(ctx,token);
        else if(ctx.socketToken===token)this.cancelSocket(ctx);
      },delay);
      token.retryTimer.unref?.();
      if(this.socketEvent(ctx,token,'reconnecting','',error))return;
      this.disposeSocketTransport(token);
    }
    ctx.socketToken=null;this.socketPending.delete(token);
    this.socketEvent(ctx,token,event,'',error);
  }
  socketRate(token,direction){
    const now=this.now(),field=direction+'Rate';
    let rate=token[field];
    if(!rate||now<rate.start||now-rate.start>=1000)rate=token[field]={start:now,count:0};
    return ++rate.count<=8;
  }
  startSocket(ctx,operation,active){
    const endpoint=validateSocketOperation(operation,ctx.networkEndpoints);
    if(ctx.socketToken){this.report(ctx.pluginUUID,Error('WebSocket already active'));return;}
    const generation=ctx.socketGeneration=(ctx.socketGeneration||0)+1;
    const binding=endpoint.auth!==undefined?credentialBinding(ctx.pluginUUID,endpoint):null;
    const token={endpoint,binding,generation,active,settings:JSON.stringify(ctx.settings),plugin:ctx.pluginUUID,
      query:structuredClone(operation.query),socket:null,bearer:null,attempt:0,ready:false};
    if(this.socketPending.size>=8||[...this.socketPending].filter(t=>t.plugin===ctx.pluginUUID).length>=2){
      this.socketEvent(ctx,token,'error','','capacity');return;
    }
    ctx.socketError=null;ctx.socketToken=token;this.socketPending.add(token);
    this.openSocketTransport(ctx,token);
  }
  openSocketTransport(ctx,token){
    const {endpoint,binding,generation}=token;
    const active=()=>token.active()&&ctx.socketToken===token&&ctx.socketGeneration===generation;
    const fail=(error,retry=false)=>this.finishSocket(ctx,token,'error',error,retry);
    token.ready=false;token.bearer=null;token.sendRate=null;token.receiveRate=null;
    Promise.resolve().then(async()=>{
      if(!active())return;
      if(binding){
        if(this.credentialChanges.has(binding)){fail('credential-update-busy');return;}
        try{token.bearer=(await this.credentials.read(binding)).value.token;}
        catch{fail('credential-unavailable');return;}
        if(!active())return;
        if(!validBearer(token.bearer)){fail('credential-required');return;}
        if(this.credentialChanges.has(binding)){fail('credential-update-busy');return;}
      }
      if(!active())return;
      const socket=token.socket=this.socketFactory(resolveNetworkEndpoint(endpoint,token.query),{bearer:token.bearer});
      const live=()=>active()&&token.socket===socket;
      const later=(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref?.();return timer;};
      const heartbeat=()=>{
        if(!live()||!token.ready||typeof socket.ping!=='function')return;
        token.heartbeatTimer=later(()=>{
          if(!live()||!token.ready)return;
          token.pongTimer=later(()=>{if(live())fail('heartbeat-timeout',true);},this.socketPongMs);
          try{socket.ping(undefined,undefined,error=>{if(error&&live())fail('connection-error',true);});}
          catch{if(live())fail('connection-error',true);}
        },this.socketHeartbeatMs);
      };
      const opened=()=>{
        clearTimeout(token.authTimer);token.authTimer=null;token.ready=true;ctx.socketError=null;
        if(!this.socketEvent(ctx,token,'open')){fail('queue-capacity');return;}
        heartbeat();
      };
      let authPhase=endpoint.auth==='home-assistant'?'required':null;
      socket.on('error',error=>{
        if(!live())return;
        const code=error?.code;
        const reason=code==='WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'?'message-limit':
          /^(?:ERR_TLS|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET)/.test(String(code||''))?'tls-error':
          /^Unexpected server response: [0-9]{3}$/.test(String(error?.message||''))?'upgrade-rejected':'connection-error';
        fail(reason,['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN'].includes(code));
      });
      socket.on('close',code=>{if(live())this.finishSocket(ctx,token,'close',null,[1001,1006,1011,1012,1013].includes(code));});
      socket.on('pong',()=>{
        if(!live()||!token.pongTimer)return;
        clearTimeout(token.pongTimer);token.pongTimer=null;heartbeat();
      });
      socket.on('open',()=>{
        if(!live())return;
        if(authPhase)token.authTimer=later(()=>{if(live()&&!token.ready)fail('authentication-timeout');},this.socketAuthMs);
        else opened();
      });
      socket.on('message',(data,binary)=>{
        if(!live())return;
        // Authentication remains on the small default budget. Large frames are opt-in,
        // admitted only after authentication and bounded before queueing.
        const limit=authPhase?8192:socketReceiveLimit(endpoint);
        if(binary||!Buffer.isBuffer(data)||data.length>limit){fail('invalid-message');return;}
        const body=data.toString('utf8');
        const serializedBytes=Buffer.byteLength(JSON.stringify(body));
        if(serializedBytes>limit){fail('message-limit');return;}
        if(serializedBytes>8192&&ctx.pending>=4){fail('queue-capacity');return;}
        if(token.bearer!==null&&body.includes(token.bearer)){fail('credential-in-response');return;}
        if(authPhase){
          let message;try{message=JSON.parse(body);}catch{fail('authentication-protocol');return;}
          if(message?.type==='auth_invalid'){fail('authentication-rejected');return;}
          if(authPhase==='required'&&message?.type==='auth_required'){
            authPhase='waiting';
            try{socket.send(JSON.stringify({type:'auth',access_token:token.bearer}),error=>{if(error&&live())fail('connection-error');});}
            catch{if(live())fail('connection-error');}
            return;
          }
          if(authPhase==='waiting'&&message?.type==='auth_ok'){authPhase=null;opened();return;}
          fail('authentication-protocol');return;
        }
        if(!token.ready){fail('invalid-message');return;}
        if(!this.socketRate(token,'receive')){fail('rate-limit');return;}
        if(!this.socketEvent(ctx,token,'message',body))fail('queue-capacity');
      });
    }).catch(()=>{if(active())fail('connection-error');});
  }
  sendSocket(ctx,operation){
    const token=ctx.socketToken;
    if(!token||!token.active()||!token.ready||token.socket?.readyState!==1){this.report(ctx.pluginUUID,Error('WebSocket not open'));return;}
    const socket=token.socket,generation=token.generation;
    const fail=error=>{if(ctx.socketToken===token&&token.socket===socket&&token.generation===generation)this.finishSocket(ctx,token,'error',error);};
    if(!this.socketRate(token,'send')){fail('rate-limit');return;}
    const data=typeof operation.value==='string'?operation.value:JSON.stringify(operation.value);
    if(socket.bufferedAmount+Buffer.byteLength(data)>32768){fail('send-capacity');return;}
    try{socket.send(data,error=>{if(error)fail('connection-error');});}
    catch{fail('connection-error');}
  }
  closeSocket(ctx){
    const token=ctx.socketToken;
    if(token)this.finishSocket(ctx,token,'close');
  }
  startNetwork(ctx,operation,active){
    const endpoint=validateNetworkRequest(operation,ctx.networkEndpoints);
    if(ctx.networkToken){
      // An existing context request retains its single result contract.
      this.report(ctx.pluginUUID,Error('network request busy'));return;
    }
    const pluginPending=[...this.networkPending].filter(t=>t.plugin===ctx.pluginUUID).length;
    if(this.networkPending.size>=MAX_NETWORK_GLOBAL||pluginPending>=MAX_NETWORK_PLUGIN){
      this.report(ctx.pluginUUID,Error('network request capacity'));
      if(active())this.runScript(ctx,'networkResult',networkFailure(endpoint.id,'capacity'),JSON.stringify(ctx.settings));
      return;
    }
    const binding=endpoint.auth==='bearer'?credentialBinding(ctx.pluginUUID,endpoint):null;
    const controller=new AbortController(),token={controller,binding,plugin:ctx.pluginUUID};
    const settings=JSON.stringify(ctx.settings);
    ctx.networkToken=token;this.networkPending.add(token);
    Promise.resolve().then(async()=>{
      if(!active()||controller.signal.aborted)return networkFailure(endpoint.id,'cancelled');
      let bearer=null;
      if(binding){
        if(this.credentialChanges.has(binding))return networkFailure(endpoint.id,'credential-update-busy');
        try{bearer=(await this.credentials.read(binding)).value.token;}
        catch{return networkFailure(endpoint.id,'credential-unavailable');}
        if(!validBearer(bearer))return networkFailure(endpoint.id,'credential-required');
        if(this.credentialChanges.has(binding)||!active()||controller.signal.aborted)return networkFailure(endpoint.id,'cancelled');
      }
      return normalizeNetworkResult(endpoint,await this.networkRequest(resolveNetworkEndpoint(endpoint,operation.query,operation.options),operation.body,controller.signal,{bearer}),bearer);
    }).catch(()=>networkFailure(endpoint.id,'connection-error')).then(result=>{
      if(!active()||ctx.networkToken!==token||controller.signal.aborted)return;
      ctx.networkToken=null;
      if(settings!==JSON.stringify(ctx.settings))return;
      // A bounded continuation event, not a replay of the triggering input.
      this.runScript(ctx,'networkResult',result,settings);
    }).finally(()=>{
      if(ctx.networkToken===token)ctx.networkToken=null;
      this.networkPending.delete(token);
    });
  }
  initialize(ctx){
    ctx.tickDue=ctx.apiVersion===2&&ctx.permissions.includes('timer.tick')&&ctx.action.tickIntervalMs?
      this.now()+ctx.action.tickIntervalMs:null;
    this.run(ctx,ctx.service?'start':'appear');
    this.reconcileTickTimer();
  }
  reconcileTickTimer(){
    const needed=!this.closed&&!this.suspended&&[...this.contexts.values()].some(ctx=>!ctx.failed&&ctx.tickDue!==null&&ctx.tickDue!==undefined);
    if(needed&&!this.tickTimer){
      this.tickTimer=setInterval(()=>this.tick(),1000);this.tickTimer.unref?.();
    }else if(!needed&&this.tickTimer){clearInterval(this.tickTimer);this.tickTimer=null;}
  }
  tick(now=this.now()){
    if(this.closed||this.suspended)return;
    let dispatched=0;
    // Oldest due context first: the per-sweep cap must not starve later slots.
    const due=[...this.contexts.values()].filter(ctx=>!ctx.failed&&ctx.tickDue!=null&&now>=ctx.tickDue)
      .sort((a,b)=>a.tickDue-b.tickDue);
    for(const ctx of due){
      // Skip busy periods rather than queuing missed ticks. Limit work per
      // sweep so periodic plugins do not monopolize the input dispatcher.
      if(ctx.pending||ctx.networkToken){ctx.tickDue=now+ctx.action.tickIntervalMs;continue;}
      if(dispatched>=8)continue;
      ctx.tickDue=now+ctx.action.tickIntervalMs;
      dispatched++;this.runScript(ctx,'tick');
    }
    this.reconcileTickTimer();
  }
  reportBackpressure(ctx){
    const now=this.now();
    if(ctx.lastBackpressureAt===undefined||now-ctx.lastBackpressureAt>=1000){
      ctx.lastBackpressureAt=now;
      this.report(ctx.pluginUUID,Error('input queue busy; event not accepted'));
    }
  }
  runScript(ctx,event,response=null,expectedSettings=null,expectedSocket=null){
    // Saturation is backpressure, not a plugin failure. Keep admitted work
    // ordered and leave the renderer and context alive.
    if(ctx.pending>=MAX_PENDING_EVENTS){
      this.reportBackpressure(ctx);return false;
    }
    const epoch=ctx.epoch||0,revision=ctx.settingsRevision||0;
    // Every dispatch is tied to the settings generation at acceptance.
    // A changed setting invalidates old queued work, including ABA changes
    // where a user subsequently restores exactly the old values.
    const active=()=>!this.closed&&!this.suspended&&!ctx.failed&&ctx.epoch===epoch&&this.contexts.get(ctx.context)===ctx&&
      (ctx.settingsRevision||0)===revision&&
      (expectedSettings===null||expectedSettings===JSON.stringify(ctx.settings))&&
      (expectedSocket===null||expectedSocket===ctx.socketGeneration);
    ctx.pending++;
    ctx.queue=ctx.queue.then(async()=>{
      if(!active())return;
      try{
        const global=ctx.permissions.includes('global.settings')?
          await this.vault.read(ctx.pluginUUID):{value:{},revision:null};
        if(!active())return;
        const settingsSnapshot=structuredClone(ctx.settings);
        const result=await this.scheduler.run(ctx.pluginUUID,active,()=>{
          if(!ctx.runner)ctx.runner=this.runnerFactory(ctx.pluginUUID);
          return ctx.runner.run(ctx.action.script,{
            event:{type:event,slot:ctx.service?null:ctx.slot,gesture:ctx.service?null:ctx.gesture||'down',...(ctx.service?{scope:'service'}:{}),...(response?{response}:{})},
            settings:ctx.action.settingsSchema?nativeEffectiveSettings(ctx.action.settingsSchema,settingsSnapshot):structuredClone(settingsSnapshot),state:ctx.state,memory:structuredClone(ctx.memory),globalSettings:structuredClone(global.value),sharedState:this.sharedSnapshot(ctx)
          });
        });
        if(!active())return;
        check(exact(result,['ops','memory'])&&obj(result.memory)&&
          Buffer.byteLength(JSON.stringify(result.memory))<=8192,'invalid JavaScript memory');
        const {normal,effects}=this.validateScriptOps(ctx,event,result.ops);
        for(const operation of effects){
          if(operation.op==='settings'){
            const saved=await this.requestSettingsCommit(ctx,operation,settingsSnapshot,active);
            if(!active())return;
            if(!saved){this.report(ctx.pluginUUID,Error('settings write not confirmed'));return;}
          }
          if(operation.op==='globalSettings'){
            const saved=await this.vault.write(ctx.pluginUUID,operation.value,global.revision,active);
            if(!active())return;
            if(!saved){this.report(ctx.pluginUUID,Error('global settings conflict; write rejected'));return;}
            // Other active actions of the same plugin will read the new value.
            for(const other of this.contexts.values())if(other.pluginUUID===ctx.pluginUUID&&other.permissions.includes('global.settings'))
              this.run(other,'settings');
          }
        }
        if(!active())return;
        ctx.memory=result.memory;
        this.applyOps(ctx,normal);
        for(const operation of effects)if(!['globalSettings','settings'].includes(operation.op)){
          if(operation.op==='serviceMessage'){this.sendServiceMessage(ctx,operation);continue;}
          if(operation.op==='networkRequest'){this.startNetwork(ctx,operation,active);continue;}
          if(operation.op==='socketConnect'){this.startSocket(ctx,operation,active);continue;}
          if(operation.op==='socketSend'){this.sendSocket(ctx,operation);continue;}
          if(operation.op==='socketClose'){this.closeSocket(ctx);continue;}
          if(operation.op==='wideOverlay')ctx.wideOverlaySent=operation.value!==null;
          this.onUpdate({kind:'nativeEffect',context:ctx.context,
            pluginUUID:ctx.pluginUUID,actionUUID:ctx.action.id,operation});
        }
      }catch(error){if(active())this.fail(ctx,error);}
    }).finally(()=>{if(ctx.epoch===epoch){ctx.pending--;if(event==='sharedState')ctx.sharedQueued=false;this.queueSettingsRefresh(ctx);this.queueSharedRefresh(ctx);}});
    return true; // accepted for dispatch; not a claim of completed execution
  }
  retire(ctx){
    if(ctx.apiVersion!==2){this.run(ctx,'disappear');return;}
    // A disappearing context cannot emit stale output. If idle, allow a
    // bounded best-effort lifecycle callback, then dispose the renderer.
    const runner=ctx.runner,idle=ctx.pending===0;
    ctx.runner=null;this.resetScript(ctx);
    if(runner){
      if(idle&&!this.suspended&&!this.closed&&!ctx.failed&&this.retired.size<16){
        this.retired.add(runner);
        this.scheduler.run(ctx.pluginUUID,()=>!this.closed&&!this.suspended&&this.retired.has(runner),()=>runner.run(ctx.action.script,{event:{type:ctx.service?'stop':'disappear',slot:ctx.service?null:ctx.slot,gesture:ctx.service?null:ctx.gesture||'down',...(ctx.service?{scope:'service'}:{})},
          settings:structuredClone(ctx.settings),state:ctx.state,memory:structuredClone(ctx.memory)})).catch(()=>{}).finally(()=>{this.retired.delete(runner);runner.close();});
      }else runner.close();
    }
  }
  run(ctx,event){
    if(ctx.failed||this.closed||this.suspended)return false;
    if(ctx.apiVersion===2)return this.runScript(ctx,event);
    try{this.applyOps(ctx,ctx.action.events[event]||[]);return true;}
    catch(error){this.fail(ctx,error);return false;}
  }
  syncServices(plugins,seen){
    const eligible=this.servicePolicyError?[]:[...plugins.values()].filter(m=>m.service&&!this.serviceDisabled.has(m.id)).sort((a,b)=>a.id.localeCompare(b.id));
    const selected=eligible.slice(0,MAX_SERVICES),ids=new Set(selected.map(m=>SERVICE_PREFIX+m.id));
    for(const [id,ctx] of this.contexts)if(ctx.service&&!ids.has(id)){
      this.retire(ctx);this.contexts.delete(id);
    }
    for(const m of selected){
      const id=SERVICE_PREFIX+m.id;
      const signature=JSON.stringify([m.version,m.permissions,m.networkEndpoints||[],m.service]);
      let ctx=this.contexts.get(id);
      if(ctx&&ctx.signature!==signature){this.retire(ctx);this.contexts.delete(id);ctx=null;}
      if(!ctx){
        ctx={context:id,service:true,pluginUUID:m.id,action:{id:m.id+'.service',script:m.service.script,tickIntervalMs:m.service.tickIntervalMs},
          apiVersion:2,permissions:[...m.permissions],networkEndpoints:m.networkEndpoints||[],signature,settings:{},state:0,pressed:false,failed:false,sharedStateBytes:m.service.sharedStateBytes||8192,
          epoch:0,settingsRevision:0,pending:0,queue:Promise.resolve(),runner:null,memory:{},sharedState:{},recoveryAttempts:0,recoveryTimer:null};
        this.contexts.set(id,ctx);if(!this.suspended)this.initialize(ctx);
      }
      seen.add(id);
    }
    for(const m of eligible.slice(MAX_SERVICES))if(!this.serviceCapacity?.has(m.id))this.report(m.id,Error('background service capacity'));
    this.serviceCapacity=new Set(eligible.slice(MAX_SERVICES).map(m=>m.id));
  }
  sync(configs,manifests){
    if(this.closed)return;
    const graph=resolveDependencies(manifests);
    const plugins=new Map(manifests.filter(m=>graph.ready.has(m.id)).map(m=>[m.id,m])),seen=new Set();
    const warnings=new Map();
    for(const cfg of configs){
      const reason=graph.blocked.get(cfg?.pluginUUID);
      if(!reason)continue;
      warnings.set(cfg.pluginUUID,reason);
      if(this.dependencyWarnings.get(cfg.pluginUUID)!==reason&&!this.suspended)
        this.report(cfg.pluginUUID,Error(reason));
    }
    this.dependencyWarnings=warnings;
    this.syncServices(plugins,seen);
    for(const cfg of configs){
      if(!cfg||typeof cfg.context!=='string'||!cfg.context||cfg.context.length>160||cfg.context.startsWith(SERVICE_PREFIX)||
        !Number.isInteger(cfg.slot)||cfg.slot<0||cfg.slot>18||seen.has(cfg.context))continue;
      const plugin=plugins.get(cfg.pluginUUID),a=plugin?.actions.find(x=>x.id===cfg.actionUUID);
      if(!a||!a.controllers.includes(cfg.slot>=16?'Encoder':'Keypad'))continue;
      seen.add(cfg.context);
      const incoming=obj(cfg.settings)?cfg.settings:{};
      let ctx=this.contexts.get(cfg.context);
      const signature=JSON.stringify([plugin.apiVersion,plugin.permissions,plugin.networkEndpoints||[],a]);
      if(!ctx||ctx.pluginUUID!==cfg.pluginUUID||ctx.action.id!==a.id||ctx.signature!==signature||ctx.slot!==cfg.slot||ctx.gesture!==cfg.gesture){
        if(ctx)this.retire(ctx);
        ctx={...cfg,action:a,apiVersion:plugin.apiVersion,permissions:[...plugin.permissions],networkEndpoints:plugin.networkEndpoints||[],signature,settings:incoming,state:0,pressed:false,failed:false,
          epoch:0,settingsRevision:0,pending:0,queue:Promise.resolve(),runner:null,memory:{},recoveryAttempts:0,recoveryTimer:null};
        this.contexts.set(cfg.context,ctx);this.initialize(ctx);
      }else{
        const changed=JSON.stringify(ctx.settings)!==JSON.stringify(incoming);
        ctx.settings=incoming;
        if(changed){
          this.cancelSettingsReceipt(ctx);ctx.settingsRefresh=false;
          this.animations.stop(ctx);
          ctx.settingsRevision++;
          this.scheduler.prune();
          this.cancelNetwork(ctx);this.cancelSocket(ctx);
          // Reset input pairing across settings generations. Never turn a
          // discarded press into a release-triggered privileged operation.
          if(ctx.apiVersion===2)ctx.pressed=false;
          this.run(ctx,'settings');
        }
      }
    }
    for(const [id,ctx] of this.contexts)if(!seen.has(id)){
      if(graph.blocked.has(ctx.pluginUUID)||!manifests.some(m=>m.id===ctx.pluginUUID)){
        this.resetScript(ctx);
        this.onUpdate({kind:'nativeUnavailable',context:id});
      }else this.retire(ctx);
      this.contexts.delete(id);
    }
    this.reconcileTickTimer();
  }
  key(context,gesture,ticks=1){
    const ctx=this.contexts.get(context);
    if(!ctx||ctx.service||this.closed||this.suspended||ctx.failed)return false;
    if(gesture==='down'){
      if(ctx.pressed)return false;
      if(ctx.apiVersion===2&&ctx.pending>=MAX_PENDING_EVENTS-INPUT_RESERVE){this.reportBackpressure(ctx);return false;}
      ctx.pressed=true;
      const accepted=this.run(ctx,'press');
      if(!accepted)ctx.pressed=false;
      return accepted;
    }
    if(gesture==='up'){if(!ctx.pressed)return false;ctx.pressed=false;return this.run(ctx,'release');}
    if(ctx.slot<16||!['left','right','hold-left','hold-right'].includes(gesture)||!Number.isInteger(ticks)||ticks<1||ticks>32)return false;
    // Accept an entire hardware rotation packet or none of it. Reserve
    // queue capacity for release and lifecycle/settings events.
    if(ctx.apiVersion===2&&ctx.pending+ticks>MAX_PENDING_EVENTS-INPUT_RESERVE){this.reportBackpressure(ctx);return false;}
    const event=(gesture.startsWith('hold-')||ctx.gesture==='hold-left'||ctx.gesture==='hold-right'||ctx.pressed?'heldRotate':'rotate')+(gesture.endsWith('left')?'Left':'Right');
    for(let i=0;i<ticks;i++)if(!this.run(ctx,event))return false;
    return true;
  }
  closeRetired(){for(const runner of this.retired)runner.close();this.retired.clear();}
  suspend(){this.suspended=true;this.closeRetired();for(const ctx of this.contexts.values()){ctx.pressed=false;this.resetScript(ctx);}this.reconcileTickTimer();}
  resume(){if(this.closed)return;this.suspended=false;for(const ctx of this.contexts.values()){ctx.failed=false;ctx.recoveryAttempts=0;this.initialize(ctx);}}
  close(){this.closed=true;this.animations.close();this.scheduler.close();this.closeRetired();for(const ctx of this.contexts.values())this.resetScript(ctx);this.contexts.clear();this.reconcileTickTimer();}
}
// Compatibility host stays unchanged; only validated native IDs are routed here.
class PluginRouter{
  constructor(legacy,native){this.legacy=legacy;this.native=native;this.queue=Promise.resolve();this.closed=false;this.nativeContextIds=new Set();this.desiredContexts=null;this.syncRevision=0;}
  serial(fn){const task=this.queue.then(()=>{if(this.closed)throw Error('Plugin host closed');return fn();});this.queue=task.catch(()=>{});return task;}
  async catalog(){
    const legacy=await this.legacy.list(),ids=new Set(legacy.map(x=>x.uuid.toLowerCase()));
    const native=(await this.native.manifests()).filter(m=>!ids.has(m.id));
    return {legacy,native};
  }
  async list(){
    const {legacy,native}=await this.catalog(),graph=resolveDependencies(native);
    await this.native.loadServicePolicy();
    return [...legacy,...native.map(m=>{
      const entry=catalog(m),reason=graph.blocked.get(m.id);
      if(m.service)entry.serviceStatus=this.native.serviceStatus(m.id,!reason);
      return reason?{...entry,actions:[],available:false,dependencyError:reason}:{...entry,available:true};
    })];
  }
  async checkNativeCandidate(m){
    validateNativeManifest(m);
    const legacyIds=new Set((await this.legacy.list()).map(p=>p.uuid.toLowerCase()));
    check(!legacyIds.has(m.id),'plugin ID already installed');
    await this.native.checkDependencies(m,legacyIds);
  }
  install(bytes){return this.serial(async()=>{
    // Existing archive validator remains authoritative; native collisions cannot shadow a legacy plugin.
    const {parseArchive}=require('./sd-plugin-host.cjs');
    const {manifest}=await parseArchive(bytes);
    check(!(await this.native.manifests()).some(m=>m.id===manifest.UUID.toLowerCase()),'plugin ID already installed');
    return this.legacy.install(bytes);
  });}
  installDirectory(dir){return this.serial(async()=>{
    const installed=new Set((await this.native.manifests()).map(m=>m.id));
    const id=path.basename(dir).replace(/\.sdPlugin$/i,'').toLowerCase();
    check(!installed.has(id),'plugin ID already installed');
    // The existing folder importer ultimately uses the manifest UUID, not its folder name.
    if(installed.size){
      const file=path.join(dir,'manifest.json'),st=await fs.lstat(file);
      check(st.isFile()&&st.size<=LIMIT,'invalid SDK manifest');
      const m=JSON.parse(await fs.readFile(file,'utf8'));
      check(typeof m.UUID==='string'&&!installed.has(m.UUID.toLowerCase()),'plugin ID already installed');
    }
    return this.legacy.installDirectory(dir);
  });}
  installNative(m){return this.serial(async()=>{
    await this.checkNativeCandidate(m);
    return this.native.install(m);
  });}
  planNativeInstall(m){return this.serial(async()=>{
    await this.checkNativeCandidate(m);
    return this.native.planInstall(m);
  });}
  replaceNative(m,expectedRevision){return this.serial(async()=>{
    await this.checkNativeCandidate(m);
    return this.native.replace(m,expectedRevision);
  });}
  dynamicOptions(pluginId,actionId){return this.serial(async()=>{
    const {native}=await this.catalog(),manifest=native.find(m=>m.id===pluginId);
    const action=manifest?.actions.find(a=>a.id===actionId);
    check(action,'native plugin action not installed');
    const service=this.native.contexts.get(SERVICE_PREFIX+pluginId);
    const snapshot=service&&!service.failed&&!this.native.suspended?service.sharedState:{};
    const phase=typeof snapshot?.status==='string'&&snapshot.status.length<=100&&!/[\x00-\x1f\x7f]/.test(snapshot.status)?snapshot.status:'';
    return {status:this.native.serviceStatus(pluginId),phase,fields:Object.fromEntries((action.settingsSchema||[])
      .filter(f=>f.type==='dynamicSelect'||f.type==='dynamicMultiSelect')
      .map(f=>[f.key,nativeDynamicOptions(f,snapshot)]))};
  });}
  credentialInfo(pluginId){return this.serial(async()=>{
    const {native}=await this.catalog(),manifest=native.find(m=>m.id===pluginId);
    check(manifest,'native plugin not installed');return this.native.credentialInfo(manifest);
  });}
  writeCredential(pluginId,binding,revision,token){return this.serial(async()=>{
    const {native}=await this.catalog(),manifest=native.find(m=>m.id===pluginId);
    check(manifest,'native plugin not installed');
    const result=await this.native.writeCredential(manifest,binding,revision,token);
    // Credential replacement invalidates old sockets. Restart only an enabled
    // service, preserving an explicit user stop and never replaying input.
    if(manifest.service&&this.native.serviceStatus(pluginId).enabled&&!this.native.suspended&&resolveDependencies(native).ready.has(pluginId))
      await this.native.manageService(native,pluginId,'restart');
    return result;
  });}
  manageService(id,mode){return this.serial(async()=>{
    const {native}=await this.catalog();return this.native.manageService(native,id,mode);
  });}
  serviceStatus(id){return this.serial(async()=>{
    const {native}=await this.catalog(),manifest=native.find(m=>m.id===id&&m.service);
    check(manifest,'background service not installed');await this.native.loadServicePolicy();
    return this.native.serviceStatus(id,resolveDependencies(native).ready.has(id));
  });}
  sync(configs){
    // Invalidate removed mounts immediately, before slower catalogue/legacy work.
    const revision=++this.syncRevision;
    this.desiredContexts=new Set(configs.map(c=>c?.context));
    for(const [id,ctx] of this.native.contexts)if(!ctx.service&&!this.desiredContexts.has(id)){
      this.native.contexts.delete(id);this.native.retire(ctx);
    }
    return this.serial(async()=>{
    if(revision!==this.syncRevision)return;
    const {native,legacy}=await this.catalog(),ids=new Set(native.map(m=>m.id));
    await this.native.loadServicePolicy();
    if(revision!==this.syncRevision)return;
    const legacyIds=new Set(legacy.map(p=>p.uuid.toLowerCase()));
    const isNative=c=>ids.has(c?.pluginUUID)||(typeof c?.pluginUUID==='string'&&ID.test(c.pluginUUID)&&!legacyIds.has(c.pluginUUID.toLowerCase()));
    const local=configs.filter(isNative),other=configs.filter(c=>!isNative(c));
    this.nativeContextIds=new Set(local.map(c=>c.context));
    // Remove stale legacy contexts before publishing a new native context.
    try{await this.legacy.sync(other);}finally{if(!this.closed&&revision===this.syncRevision)this.native.sync(local,native);}
  });}
  acknowledgeSettings(context,id,accepted){return this.serial(()=>this.native.acknowledgeSettings(context,id,accepted));}
  key(context,gesture,ticks){if(this.closed||(this.desiredContexts&&!this.desiredContexts.has(context)))return false;return this.nativeContextIds.has(context)||this.native.contexts.has(context)?this.native.key(context,gesture,ticks):this.legacy.key(context,gesture,ticks);}
  inspector(context){if(this.closed||(this.desiredContexts&&!this.desiredContexts.has(context)))return false;return this.nativeContextIds.has(context)||this.native.contexts.has(context)?false:this.legacy.inspector(context);}
  onSystemSuspend(){this.native.suspend();this.legacy.onSystemSuspend();}
  onSystemResume(){this.native.resume();this.legacy.onSystemResume();}
  async close(){this.closed=true;this.native.close();await this.legacy.close();}
}
module.exports={validateNativeManifest,NativePluginHost,PluginRouter,projectSharedState,LIMIT};
