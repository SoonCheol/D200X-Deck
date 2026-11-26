'use strict';
// Real Electron smoke test, run from the Windows build before packaging.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {NativeSettingsVault}=require('../app/deckforge-editor/deckforge-native-settings.cjs');
const assert=require('node:assert/strict');
const {createScriptRunner}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
const input={event:{type:'press',slot:0,gesture:'down'},settings:{},state:0,memory:{}};

async function verifyModel2SerializationBoundary(){
 const scripts=[
  'api.setTitle("legitimate");Object.prototype.toJSON=()=>({ops:[{op:"title",value:"forged"}],memory:{}});',
  'Object.prototype.toJSON=()=>({op:"title",value:"forged"});api.setTitle("legitimate");',
  'api.setTitle("legitimate");Array.prototype.toJSON=()=>[{op:"title",value:"forged"}];'
 ];
 for(let i=0;i<scripts.length;i++){
  const runner=createScriptRunner('com.deckforge.native.serialization-'+i,'button');
  try{await assert.rejects(runner.run(scripts[i],input),/unsafe SDK serialization hook/);}
  finally{runner.close();}
 }
 const safe=createScriptRunner('com.deckforge.native.serialization-safe','button');
 try{
  const result=await safe.run('api.setTitle("normal");memory.list=[1,{value:"ok"}];',input);
  assert.deepEqual(result,{ops:[{op:'title',value:'normal'}],memory:{list:[1,{value:'ok'}]}});
 }finally{safe.close();}
 const {NativePluginHost,validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const id='com.deckforge.native.memory-validation',updates=[];
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-memory-boundary-'));
 const host=new NativePluginHost(root,e=>updates.push(e));
 try{
  const cases=[
   'memory["__proto__"]=null;Object.defineProperty(memory,"__proto__",{value:{bad:1},enumerable:true});',
   'memory.nested={constructor:{bad:1}};',
   'memory.nested={prototype:{bad:1}};',
   'let n=memory;for(let i=0;i<14;i++){n.next={};n=n.next;}',
   'memory.text="x".repeat(8192);'
  ];
  for(let i=0;i<cases.length;i++){
   const action={id:id+'.key',name:'Memory validation',controllers:['Keypad'],states:2,script:'if(event.type==="press"){'+cases[i]+'api.setTitle("must-not-apply");}'};
   const manifest={apiVersion:2,id,name:'Memory validation',version:'1.0.0',permissions:['display'],actions:[action]};
   validateNativeManifest(manifest);
   const context='memory-'+i;
   host.sync([{context,pluginUUID:id,actionUUID:action.id,slot:0,gesture:'down',settings:{}}],[manifest]);
   const ctx=host.contexts.get(context);assert.ok(ctx);await ctx.queue;
   assert.equal(ctx.failed,false);
   assert.ok(host.key(context,'down'));await ctx.queue;
   assert.equal(ctx.failed,true);assert.deepEqual(ctx.memory,{});
   assert.equal(updates.some(e=>e.context===context&&e.payload?.title==='must-not-apply'),false);
  }
 }finally{host.close();await fs.rm(root,{recursive:true,force:true});}
 console.log('MODEL2_SERIALIZATION_BOUNDARY '+JSON.stringify({prototypeHooksRejected:3,normalRoundTrip:true,unsafeMemoryRejected:5,effectsNotApplied:true,actualElectron:true}));
}

async function verifyWindowsEncryption(){
  if(process.platform!=='win32')return;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-native-real-vault-'));
  const id='com.deckforge.native.smoke-vault',token=randomUUID();
  const storage={
    isAsyncEncryptionAvailable:()=>safeStorage.isAsyncEncryptionAvailable(),
    encryptStringAsync:value=>safeStorage.encryptStringAsync(value),
    decryptStringAsync:bytes=>safeStorage.decryptStringAsync(bytes)
  };
  try{
    const vault=new NativeSettingsVault(root,storage,'credentials');
    assert.equal(await storage.isAsyncEncryptionAvailable(),true);
    assert.equal(await vault.write(id,{token},null),true);
    const bytes=await fs.readFile(vault.file(id));
    assert.ok(bytes.length>0&&!bytes.includes(Buffer.from(token)));
    const reopened=new NativeSettingsVault(root,storage,'credentials');
    const record=await reopened.read(id);
    assert.equal(record.value.token===token,true);
    assert.equal(await reopened.write(id,{},null),false);
    assert.equal(await reopened.write(id,{},record.revision),true);
    assert.deepEqual((await reopened.read(id)).value,{});
    console.log('DeckForge Windows encrypted credential vault smoke passed');
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
async function verifyVectorRendering(){
 const {BrowserWindow}=require('electron');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f00"/></svg>';
 const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
 const {svgReport}=require('../app/deckforge-editor/ulanzi-media-analysis.cjs');
 assert.equal(svgReport(Buffer.from(svg)).status,'restricted-vector-review');
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"><canvas width="16" height="16"></canvas>'));
  const pixel=await win.webContents.executeJavaScript('(async()=>{const img=new Image();img.src='+JSON.stringify(uri)+';await img.decode();const ctx=document.querySelector("canvas").getContext("2d");ctx.drawImage(img,0,0);return Array.from(ctx.getImageData(8,8,1,1).data);})()');
  assert.deepEqual(pixel,[255,0,0,255]);
  console.log('DeckForge restricted SVG canvas pixel smoke passed');
 }finally{win.destroy();}
}

async function verifyPublicApi(runner){
  const {NativePluginHost,validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
  const id='com.deckforge.native.api-contract';
  const permissions=['display','settings.write','global.settings','navigation','wide.mode','wide.overlay','network.request','network.websocket','background.run'];
  const endpoints=[{id:'status',url:'https://example.com/status',method:'GET'},{id:'live',url:'wss://example.com/events',method:'WSS'},{id:'entity',url:'https://example.com/entities/',method:'PATCH',pathKeys:['id'],queryKeys:['view'],headerKeys:['if-match']}];
  const action={id:id+'.key',name:'Contract',controllers:['Keypad'],states:2,script:'api.setTitle("contract");'};
  validateNativeManifest({apiVersion:2,id,name:'Contract',version:'1.0.0',permissions,networkEndpoints:endpoints,service:{script:'void 0;'},actions:[action]});
  const host=new NativePluginHost('/unused');
  const ctx={slot:0,pluginUUID:id,action,permissions,networkEndpoints:endpoints,settings:{count:1,keep:true}};
  const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const png='data:image/png;base64,'+require('../app/deckforge-editor/ulanzi-media-analysis.cjs').gifPngFrames(Buffer.from(gif.slice(22),'base64')).frames[0].png.toString('base64');
  const frame={kind:'layout',background:'#000000',elements:[]};
  const cases=[
    ['setTitle','api.setTitle("ready")','title'],
    ['setState','api.setState(1)','state'],
    ['toggleState','api.toggleState()','toggleState'],
    ['setImage','api.setImage('+JSON.stringify(png)+')','image'],
    ['setAnimation','api.setAnimation('+JSON.stringify(gif)+')','animation'],
    ['stopAnimation','api.stopAnimation()','stopAnimation'],
    ['drawKey','api.drawKey({width:8,height:8,background:"#123456",commands:[]})','image'],
    ['setSettings','api.setSettings({count:2})','settings','settings.write'],
    ['patchSettings','api.patchSettings({count:2})','settings','settings.write'],
    ['getGlobalSettings','api.setTitle(api.getGlobalSettings().label)','title'],
    ['setGlobalSettings','api.setGlobalSettings({label:"ready"})','globalSettings','global.settings'],
    ['goToPage','api.goToPage(1)','navigate','navigation'],
    ['switchProfile','api.switchProfile("next")','navigate','navigation'],
    ['enterFolder','api.enterFolder(2)','navigate','navigation'],
    ['exitFolder','api.exitFolder()','navigate','navigation'],
    ['setWideMode','api.setWideMode("clock")','wideMode','wide.mode'],
    ['setWideOverlay','api.setWideOverlay('+JSON.stringify(frame)+')','wideOverlay','wide.overlay'],
    ['clearWideOverlay','api.clearWideOverlay()','wideOverlay','wide.overlay'],
    ['request','api.request("status")','networkRequest','network.request'],
    ['connectSocket','api.connectSocket("live")','socketConnect','network.websocket'],
    ['sendSocket','api.sendSocket({subscribe:true})','socketSend','network.websocket'],
    ['closeSocket','api.closeSocket()','socketClose','network.websocket'],
    ['getSharedState','api.setTitle(api.getSharedState().label||"empty")','title'],
    ['publishSharedState','api.publishSharedState({label:"ready"})','publishSharedState'],
    ['sendServiceMessage','api.sendServiceMessage({entity:"light"})','serviceMessage','background.run']
  ];
  try{
    const names=await runner.run('api.setTitle(Object.keys(api).sort().join(","));',input);
    // Title length is not a concern here: this is a renderer-only inventory.
    assert.deepEqual(names.ops[0].value.split(','),cases.map(c=>c[0]).sort());
    for(const [name,source,op,permission] of cases){
      const result=await runner.run(source,{...input,settings:ctx.settings,globalSettings:{label:'ready'}});
      if(name==='publishSharedState'){
        const service={...ctx,service:true,permissions:[...permissions,'background.run']};
        assert.equal(host.validateScriptOps(service,'start',result.ops).normal[0].op,op);
        assert.throws(()=>host.validateScriptOps(ctx,'press',result.ops),/unauthorized/);continue;
      }
      const validated=host.validateScriptOps(ctx,'press',result.ops);
      const commands=permission?validated.effects:validated.normal;
      assert.equal(commands.length,1,name);assert.equal(commands[0].op,op,name);
      if(name==='getGlobalSettings')assert.equal(commands[0].value,'ready');
      if(name==='patchSettings')assert.deepEqual(commands[0].value,{count:2,keep:true});
      if(permission){
        assert.throws(()=>host.validateScriptOps({...ctx,permissions:permissions.filter(p=>p!==permission)},'press',result.ops),/unauthorized/,name);
        if(name==='connectSocket')assert.equal(host.validateScriptOps(ctx,'appear',result.ops).effects[0].op,'socketConnect');
        else assert.throws(()=>host.validateScriptOps(ctx,'appear',result.ops),/input event/,name);
      }
    }
    const extended=await runner.run('api.request("entity",{state:1},{view:"full"},{path:{id:"light"},headers:{"if-match":"rev"}});',input);
    assert.deepEqual(host.validateScriptOps(ctx,'press',extended.ops).effects,[{op:'networkRequest',endpoint:'entity',body:{state:1},query:{view:'full'},options:{path:{id:'light'},headers:{'if-match':'rev'}}}]);
    console.log('DeckForge native SDK 25-function renderer/host contract passed');
  }finally{host.close();}
}

async function verifyHomeAssistant(runner){
  const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
  const {validateNativeManifest,NativePluginHost,projectSharedState}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
  const manifest=validateNativeManifest(createHomeAssistantManifest('https://example.com'));
  const host=new NativePluginHost('/unused'),action=manifest.actions[1];
  const settings={entities:['sensor.temp','sensor.humidity'],mode:'all',seconds:5,labels:true,unit:true,decimals:1,fontSize:36,color:'#FFFFFF'};
  const shared={status:'연결됨',entities:{'sensor.temp':{label:'온도',value:'23.5',unit:'°C'},'sensor.humidity':{label:'습도',value:'48',unit:'%'}}};
  const ctx={action,settings,pluginUUID:manifest.id,permissions:manifest.permissions,slot:0};
  const svc={service:true,sharedStateBytes:262144,pluginUUID:manifest.id,permissions:manifest.permissions,action:{id:manifest.id+'.service'},networkEndpoints:manifest.networkEndpoints};
  try{
    const initial=await runner.run(manifest.service.script,{...input,event:{type:'start',scope:'service'},sharedState:{}});
    const started=host.validateScriptOps(svc,'start',initial.ops);
    assert.equal(started.effects[0].op,'socketConnect');
    assert.equal(started.normal[0].op,'publishSharedState');
    const rendered=await runner.run(action.script,{...input,event:{type:'appear'},settings,sharedState:projectSharedState(ctx,shared)});
    assert.equal(host.validateScriptOps(ctx,'appear',rendered.ops).normal.at(-1).op,'image');
    const alpha=output=>{
      const pixels=Buffer.from(output.ops.find(op=>op.op==='pixels').rgba,'base64');
      assert.equal(pixels[3],0,'corner must be transparent');
      assert.ok(pixels.some((value,i)=>i%4===3&&value>0),'foreground remains visible');
    };
    alpha(rendered);
    for(const value of ['on','off']){
      const control=await runner.run(manifest.actions[0].script,{...input,event:{type:'appear'},settings:{entity:'switch.fan'},
        sharedState:{status:'연결됨',entities:{'switch.fan':{label:'환풍기',value}}}});
      alpha(control);
    }
    const changed=await runner.run(action.script,{...input,event:{type:'sharedState'},settings,memory:rendered.memory,sharedState:{...shared,entities:{...shared.entities,'sensor.temp':{label:'온도',value:'24.5',unit:'°C'}}}});
    assert.notEqual(rendered.ops.at(-1).rgba,changed.ops.at(-1).rgba);
    const same=await runner.run(action.script,{...input,event:{type:'sharedState'},settings,memory:rendered.memory,sharedState:shared});
    assert.deepEqual(same.ops,[]);
    console.log('DeckForge HA independent service and actual sensor key rendering smoke passed');
  }finally{host.close();}
}
async function verifyHaBurst(){
 const {EventEmitter}=require('node:events');
 const {NativePluginHost,validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const m=validateNativeManifest(createHomeAssistantManifest('https://example.com'));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ha-burst-')),updates=[],sockets=[];
 class Mock extends EventEmitter{
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];}
  send(body,cb){this.sent.push(JSON.parse(body));cb?.();}
  terminate(){this.readyState=3;}
  message(value){this.emit('message',Buffer.from(JSON.stringify(value)),false);}
 }
 const host=new NativePluginHost(root,e=>updates.push(e),null,{credentials:{read:async()=>({value:{token:'fixture.token'}})},socketFactory:()=>{const s=new Mock();sockets.push(s);return s;}});
 const until=async(fn,label)=>{const deadline=Date.now()+30000;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('HA burst timeout: '+label);};
 const ids=Array.from({length:13},(_,i)=>'switch.test_'+i);
 const configs=ids.map((id,slot)=>({context:'ha-burst-'+slot,slot,gesture:'down',pluginUUID:m.id,actionUUID:m.actions[0].id,settings:{entity:id}}));
 try{
  host.sync(configs,[m]);await until(()=>sockets.length===1,'socket start');const socket=sockets[0],svc=host.contexts.get('@service:'+m.id);
  assert.ok(host.runnerPool,'actual Model 2 pool required');
  socket.emit('open');socket.message({type:'auth_required'});socket.message({type:'auth_ok'});
  await until(()=>socket.sent.some(x=>x.id===1),'feature negotiation');
  assert.deepEqual(socket.sent.find(x=>x.id===1),{id:1,type:'supported_features',features:{coalesce_messages:1}});
  socket.message([{type:'result',id:1,success:true}]);
  await until(()=>socket.sent.some(x=>x.id===2),'device registry request');
  socket.message({type:'result',id:2,success:true,result:[]});
  await until(()=>socket.sent.some(x=>x.id===3),'entity registry request');
  socket.message({type:'result',id:3,success:true,result:{entities:[]}});
  await until(()=>socket.sent.some(x=>x.id===4),'subscribe request');
  assert.ok(socket.sent.find(x=>x.id===4).include.domains.includes('sensor'));
  const a={};for(const id of ids)a[id]={s:'off',a:{friendly_name:id}};
  for(let i=0;i<487;i++)a['sensor.fixture_'+i]={s:'0',a:{friendly_name:'Sensor '+i,unit_of_measurement:'W'}};
  socket.message({type:'event',id:4,event:{a}});
  await until(()=>svc.sharedState.status==='연결됨','500 entity snapshot');
  await until(()=>configs.every(c=>updates.some(x=>x.context===c.context&&x.kind==='setState')),'initial button state');
  const start=Date.now(),before=updates.length;
  const burst=Array.from({length:50},(_,i)=>({type:'event',id:4,event:{c:{[ids[i%13]]:{'+':{s:'on'}},'sensor.fixture_0':{'+':{s:String(i)}}}}}));
  socket.message(burst);
  await until(()=>svc.sharedState.entities['sensor.fixture_0']?.value==='49'&&svc.socketToken?.rxCount===0&&configs.every(c=>updates.slice(before).some(x=>x.context===c.context&&x.kind==='setState'&&x.payload.state===1)),'all final states');
  assert.equal(socket.readyState,1);assert.equal(sockets.length,1);assert.ok([...host.contexts.values()].every(c=>!c.failed));
  assert.ok(ids.every(id=>svc.sharedState.entities[id].value==='on'));
  console.log('MODEL2_HA_BURST_OK '+JSON.stringify({entities:Object.keys(svc.sharedState.entities).length,buttons:13,frames:50,elapsedMs:Date.now()-start,actualElectron:true,mockTransport:true}));
  // Actual renderer and host, simulated transport: reconnect to an older HA.
  socket.emit('close',1006);
  await until(()=>sockets.length===2,'reconnect transport');
  const fresh=sockets[1];fresh.emit('open');fresh.message({type:'auth_required'});fresh.message({type:'auth_ok'});
  await until(()=>fresh.sent.some(x=>x.id===1),'reconnect features');
  fresh.message({type:'result',id:1,success:false,error:{code:'unknown_command'}});
  await until(()=>fresh.sent.some(x=>x.id===2),'reconnect device registry');
  fresh.message({type:'result',id:2,success:true,result:[]});
  await until(()=>fresh.sent.some(x=>x.id===3),'reconnect entity registry');
  fresh.message({type:'result',id:3,success:true,result:{entities:[]}});
  await until(()=>fresh.sent.some(x=>x.id===4),'filtered subscription');
  fresh.message({type:'result',id:4,success:false,error:{code:'invalid_format'}});
  await until(()=>fresh.sent.some(x=>x.id===5),'legacy subscription fallback');
  assert.deepEqual(fresh.sent.find(x=>x.id===5),{id:5,type:'subscribe_entities'});
  fresh.message({type:'event',id:4,event:{a:{'switch.obsolete':{s:'on'}}}});
  fresh.message({type:'event',id:5,event:{a:{[ids[0]]:{s:'off'},'weather.ignore':{s:'sunny'}}}});
  await until(()=>svc.sharedState.status==='연결됨'&&svc.sharedState.entities[ids[0]]?.value==='off','fallback fresh snapshot');
  assert.deepEqual(Object.keys(svc.sharedState.entities),[ids[0]]);
  assert.equal(fresh.sent.filter(x=>x.id===5).length,1);
  assert.ok(!fresh.sent.some(x=>x.type==='call_service'));
  console.log('MODEL2_HA_FILTER_RECONNECT_OK');
  if(process.env.DECKFORGE_SDK_SOAK==='1'){
   // Exercise continuous HA traffic separately from the generic page soak.
   // Use the same real Electron host and a disposable simulated transport.
   const started=Date.now(),samples=[];let messages=0,rounds=0,reconnects=0;
   const reconnect=async(previous,close=true)=>{
    const count=sockets.length;
    if(close)previous.emit('close',1006);
    await until(()=>sockets.length===count+1,'soak reconnect');
    const next=sockets.at(-1);next.emit('open');next.message({type:'auth_required'});next.message({type:'auth_ok'});
    await until(()=>next.sent.some(x=>x.id===1),'soak features');
    next.message([{type:'result',id:1,success:true}]);
    await until(()=>next.sent.some(x=>x.id===2),'soak devices');
    next.message([{type:'result',id:2,success:true,result:[]}]);
    await until(()=>next.sent.some(x=>x.id===3),'soak registry');
    next.message([{type:'result',id:3,success:true,result:{entities:[]}}]);
    await until(()=>next.sent.some(x=>x.id===4),'soak subscription');
    assert.equal(svc.sharedState.status,'상태 구독 중');
    previous.message({type:'event',id:4,event:{a:{'switch.obsolete':{s:'on'}}}});
    next.message([{type:'result',id:4,success:true},{type:'event',id:4,event:{a}}]);
    await until(()=>svc.sharedState.status==='연결됨'&&Object.keys(svc.sharedState.entities).length===500&&svc.socketToken?.rxCount===0,'soak fresh snapshot');
    assert.equal(host.rxReservedBytes,0);assert.ok(!svc.sharedState.entities['switch.obsolete']);
    assert.ok(!next.sent.some(x=>x.type==='call_service'));
    reconnects++;return next;
   };
   let current=await reconnect(fresh);
   for(let epoch=0;epoch<2;epoch++){
    const deadline=Date.now()+30000;
    do{
     const marker=String(++rounds);
     const value=rounds%2?'on':'off';
     const burst=ids.map(id=>({type:'event',id:4,event:{c:{[id]:{'+':{s:value}}}}}));
     burst.push({type:'event',id:4,event:{c:{'sensor.fixture_0':{'+':{s:marker}}}}});
     current.message(burst);messages+=burst.length;
     await until(()=>svc.sharedState.entities['sensor.fixture_0']?.value===marker&&svc.socketToken?.rxCount===0,'soak ordered final state');
     assert.ok(ids.every(id=>svc.sharedState.entities[id]?.value===value));
     assert.equal(host.rxReservedBytes,0);
     assert.ok([...host.contexts.values()].every(c=>!c.failed));
     assert.equal(current.readyState,1);
     if(rounds%10===0)samples.push({rounds,hostHeapBytes:process.memoryUsage().heapUsed,runnerEntries:host.runnerPool.entries.size});
     await new Promise(resolve=>setTimeout(resolve,1000));
    }while(Date.now()<deadline);
    if(epoch===0)current=await reconnect(current);
   }
   // More than the entire logical-message burst budget, even in one frame.
   // This must invalidate the stream, not admit a partial update.
   const over=Array.from({length:129},()=>({type:'event',id:4,event:{a:{'switch.overflow':{s:'on'}}}}));
   current.message(over);
   await until(()=>current.readyState===3,'soak overload close');
   assert.equal(svc.socketError,'rate-limit');
   assert.ok(!svc.sharedState.entities['switch.overflow']);
   current=await reconnect(current,false);
   assert.ok(!svc.sharedState.entities['switch.overflow']);
   assert.ok(sockets.every(s=>!s.sent.some(x=>x.type==='call_service')));
   assert.ok(messages>=28&&reconnects===3);
   console.log('MODEL2_HA_SUSTAINED_OK '+JSON.stringify({elapsedMs:Date.now()-started,messages,rounds,reconnects,overloadRecovery:true,samples,actualElectron:true,mockTransport:true}));
  }

 }finally{host.close();await fs.rm(root,{recursive:true,force:true});}
}
async function verifyModel2(){
 const {ScriptRunnerPool}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(),id='com.deckforge.native.pool-smoke';
 const button=pool.lease(id,'button'),next=pool.lease(id,'button'),service=pool.lease(id,'service');
 try{
   const first=await button.run("globalThis.carry=1;memory.x=1;api.setTitle('button');",input);
   assert.equal(first.memory.x,1);
   const firstRunner=pool.entries.get(pool.key(id,'button')).runner;
   button.close();
   const second=await next.run("api.setTitle(typeof globalThis.carry+':'+typeof memory.x);",input);
   assert.deepEqual(second.ops,[{op:'title',value:'undefined:undefined'}]);
   assert.equal(pool.entries.get(pool.key(id,'button')).runner,firstRunner);
   await service.run("api.setTitle('service');",input);
   const serviceRunner=pool.entries.get(pool.key(id,'service')).runner;
   const buttonPid=pool.processId(id,'button'),servicePid=pool.processId(id,'service');
   assert.ok(buttonPid>0&&servicePid>0);
   console.log('Model 2 process IDs after realm reset:',{buttonPid,servicePid});
   await assert.rejects(next.run('while(true){}',input),/timeout/);
   const alive=await service.run("api.setTitle('alive');",input);
   assert.deepEqual(alive.ops,[{op:'title',value:'alive'}]);
   assert.equal(pool.entries.get(pool.key(id,'service')).runner,serviceRunner);
   await next.run("api.setTitle('recovered');",input);
   assert.notEqual(pool.entries.get(pool.key(id,'button')).runner,firstRunner);
   console.log('DeckForge Model 2 scoped reuse, reset, timeout and service survival passed');
 }finally{pool.close();}
}

// Bounded actual Electron repetition, not a wall-clock endurance claim.
// Exercise the same production pool, with independent service and button
// lanes and an eviction sequence across distinct plugin identities.
async function verifyModel2Repetition(){
 const {ScriptRunnerPool}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(undefined,{idleLimit:3,idleMs:30000});
 const id='com.deckforge.native.repeat',started=Date.now();
 const button=pool.lease(id,'button'),service=pool.lease(id,'service');
 let buttonMemory={},serviceMemory={},maxEntries=0,buttonRunner=null,serviceRunner=null;
 const buttonPids=new Set(),servicePids=new Set();
 try{
  for(let i=1;i<=24;i++){
   const run=(lease,memory,label)=>lease.run(
    "if(typeof globalThis.carry!=='undefined')throw Error('realm leaked');globalThis.carry=1;memory.n=(memory.n||0)+1;api.setTitle(settings.label+':'+memory.n);",
    {...input,settings:{label},memory});
   const [b,a]=await Promise.all([run(button,buttonMemory,'button'),run(service,serviceMemory,'service')]);
   assert.deepEqual(b.ops,[{op:'title',value:'button:'+i}]);
   assert.deepEqual(a.ops,[{op:'title',value:'service:'+i}]);
   assert.equal(b.memory.n,i);assert.equal(a.memory.n,i);
   buttonMemory=b.memory;serviceMemory=a.memory;
   // loadURL resets the opaque document and Chromium may swap processes.
   // Reuse is the runner object's lifetime, not a promise of a constant PID.
   buttonRunner??=pool.entries.get(pool.key(id,'button')).runner;
   serviceRunner??=pool.entries.get(pool.key(id,'service')).runner;
   assert.equal(pool.entries.get(pool.key(id,'button')).runner,buttonRunner);
   assert.equal(pool.entries.get(pool.key(id,'service')).runner,serviceRunner);
   const buttonPid=pool.processId(id,'button'),servicePid=pool.processId(id,'service');
   assert.ok(buttonPid>0&&servicePid>0&&buttonPid!==servicePid);
   buttonPids.add(buttonPid);servicePids.add(servicePid);
   maxEntries=Math.max(maxEntries,pool.entries.size);
   assert.equal(pool.entries.size,2);
  }
  button.close();service.close();
  const firstRunner=pool.entries.get(pool.key(id,'button')).runner;
  for(let i=0;i<6;i++){
   const lease=pool.lease('com.deckforge.native.repeat'+i,'button');
   try{
    const result=await lease.run("api.setTitle(typeof globalThis.carry);",input);
    assert.deepEqual(result.ops,[{op:'title',value:'undefined'}]);
   }finally{lease.close();}
   maxEntries=Math.max(maxEntries,pool.entries.size);
   assert.ok(pool.entries.size<=3);
  }
  assert.ok(!pool.entries.has(pool.key(id,'button')));
  assert.ok(firstRunner.isClosed?.()===true);
  console.log('MODEL2_REPETITION '+JSON.stringify({pairedRounds:24,additionalLeases:6,maxIdleEntries:maxEntries,elapsedMs:Date.now()-started,buttonPids:[...buttonPids],servicePids:[...servicePids]}));
 }finally{pool.close();assert.equal(pool.entries.size,0);}
}
// Bounded adversarial input/output, not an intentional system OOM test.
async function verifyModel2Limits(){
 const {ScriptRunnerPool}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(),id='com.deckforge.native.limits';
 const button=pool.lease(id,'button'),service=pool.lease(id,'service');
 const title=text=>({ops:[{op:'title',value:text}],memory:{}});
 const expectService=async()=>assert.deepEqual(await service.run("api.setTitle('alive');",input),title('alive'));
 try{
  await expectService();
  const serviceRunner=pool.entries.get(pool.key(id,'service')).runner;
  const rejectAndRecover=async(source,event,pattern)=>{
   await assert.rejects(button.run(source,event),pattern);
   assert.equal(pool.entries.has(pool.key(id,'button')),false,'failed runner must be removed');
   await expectService();
   assert.equal(pool.entries.get(pool.key(id,'service')).runner,serviceRunner);
   assert.deepEqual(await button.run("api.setTitle('recovered');",input),title('recovered'));
   assert.notEqual(pool.processId(id,'button'),pool.processId(id,'service'));
  };
  await rejectAndRecover("api.setTitle('must not execute');",{...input,settings:{payload:'a'.repeat(70*1024)}},/input limit/);
  await rejectAndRecover("for(let i=0;i<17;i++)api.setTitle('x');",input,/operation limit/);
  await rejectAndRecover("api.setTitle('x'.repeat(520*1024));",input,/operation data limit/);
  await rejectAndRecover("memory.payload='x'.repeat(520*1024);",input,/output limit/);
  await rejectAndRecover("api.drawKey({width:145,height:144,commands:[]});",input,/invalid key drawing/);
  const storage=await button.run(
   "const blocked=[];for(const key of ['localStorage','sessionStorage']){try{globalThis[key].setItem('probe','x');blocked.push(false)}catch{blocked.push(true)}}api.setTitle(blocked.join(':')+':'+typeof Worker+':'+typeof require);",input);
  assert.deepEqual(storage,title('true:true:undefined:undefined'));
  const noNetwork=await button.run("let denied=false;try{await fetch('data:text/plain,probe')}catch{denied=true}api.setTitle(String(denied));",input);
  assert.deepEqual(noNetwork,title('true'));
  // An ordinary plugin error must not become a recoverable renderer loss
  // merely by imitating Electron's disposed-frame error text.
  await assert.rejects(button.run("throw Error('Render frame was disposed before the request completed');",input),error=>error?.code!=='SDK_RUNTIME_UNAVAILABLE');
  assert.equal(pool.entries.has(pool.key(id,'button')),false);
  await expectService();
  assert.deepEqual(await button.run("api.setTitle('recovered');",input),title('recovered'));
  console.log('MODEL2_BOUNDED_LIMITS '+JSON.stringify({rejectedCases:5,serviceSurvived:true,buttonRecovered:true,opaqueStorageBlocked:true,dataFetchBlocked:true,spoofedCrashErrorRejected:true,oomTested:false}));
 }finally{pool.close();}
}
// Deliberate loss of a uniquely identified test renderer, not OOM injection.
async function verifyModel2ProcessLoss(){
 const {webContents}=require('electron');
 const {ScriptRunnerPool,deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(),id='com.deckforge.native.crash-smoke',peerId=id+'-peer';
 const button=pool.lease(id,'button'),service=pool.lease(id,'service'),peer=pool.lease(peerId,'button');
 const title=text=>({ops:[{op:'title',value:text}],memory:{}});
 const run=(lease,text)=>lease.run('api.setTitle('+JSON.stringify(text)+');',input);
 const entry=(plugin,scope)=>pool.entries.get(pool.key(plugin,scope));
 const pids=()=>({button:pool.processId(id,'button'),service:pool.processId(id,'service'),peer:pool.processId(peerId,'button')});
 const assertDistinct=ids=>{
  assert.ok(Object.values(ids).every(pid=>Number.isInteger(pid)&&pid>0&&pid!==process.pid));
  assert.equal(new Set(Object.values(ids)).size,3);
 };
 const getTarget=()=>{
  const ids=pids();assertDistinct(ids);
  const owners=webContents.getAllWebContents().filter(w=>!w.isDestroyed()&&w.getOSProcessId()===ids.button);
  assert.equal(owners.length,1,'only the dedicated test webContents may own the target PID');
  return {wc:owners[0],pid:ids.button,runner:entry(id,'button').runner};
 };
 // Observe both documented Electron notification surfaces. Separate an idle
 // crash (no event deadline/executeJavaScript in flight) from an active crash.
 // Do not treat a timeout or a destroyed window as proof of a renderer crash.
 const observe=(wc,phase)=>{
  let resolveGone;
  const gone=new Promise(resolve=>{resolveGone=resolve;});
  const record=(surface,details)=>{
   console.log('MODEL2_PROCESS_LOSS_NOTIFICATION '+JSON.stringify({phase,surface,reason:details?.reason,exitCode:details?.exitCode}));
   resolveGone(details);
  };
  const onApp=(_event,target,details)=>{if(target===wc)record('app',details);};
  const onContents=(_event,details)=>record('webContents',details);
  const onDestroyed=()=>console.log('MODEL2_PROCESS_LOSS_DESTROYED '+phase);
  app.prependListener('render-process-gone',onApp);
  wc.prependListener('render-process-gone',onContents);
  wc.once('destroyed',onDestroyed);
  return {gone,dispose(){
   app.removeListener('render-process-gone',onApp);
   wc.removeListener('render-process-gone',onContents);
   wc.removeListener('destroyed',onDestroyed);
  }};
 };
 const checkGone=async(observer,phase)=>{
  const details=await deadline(()=>observer.gone,5000,()=>console.log('MODEL2_PROCESS_LOSS_NO_NOTIFICATION '+phase));
  assert.ok(['killed','crashed'].includes(details?.reason),'unexpected renderer termination reason');
  return details.reason;
 };
 try{
  await run(button,'button');await run(service,'service');await run(peer,'peer');
  const before=pids();assertDistinct(before);
  const serviceRunner=entry(id,'service').runner,peerRunner=entry(peerId,'button').runner;
  const verifyPeers=async()=>{
   assert.equal(serviceRunner.isClosed(),false);assert.equal(peerRunner.isClosed(),false);
   assert.deepEqual(await run(service,'service alive'),title('service alive'));
   assert.deepEqual(await run(peer,'peer alive'),title('peer alive'));
   assert.equal(entry(id,'service').runner,serviceRunner);assert.equal(entry(peerId,'button').runner,peerRunner);
  };
  const idle=getTarget(),idleObserver=observe(idle.wc,'idle');
  let idleReason;
  try{
   console.log('MODEL2_PROCESS_LOSS_TARGET '+JSON.stringify({phase:'idle',pid:idle.pid}));
   idle.wc.forcefullyCrashRenderer();
   idleReason=await checkGone(idleObserver,'idle');
   assert.equal(idle.runner.isClosed(),true,'idle renderer must close');
  }finally{idleObserver.dispose();}
  await verifyPeers();
  assert.deepEqual(await run(button,'idle recovery'),title('idle recovery'));
  assert.notEqual(entry(id,'button').runner,idle.runner);
  const active=getTarget(),activeObserver=observe(active.wc,'active');
  let activeReason;
  try{
   const marker='DECKFORGE_TEST_PROCESS_LOSS_ENTERED';
   const entered=new Promise(resolve=>{
    const onMessage=(event,_level,message)=>{
     if((event?.message??message)!==marker)return;
     active.wc.removeListener('console-message',onMessage);resolve();
    };
    active.wc.on('console-message',onMessage);
   });
   const pending=button.run('console.log('+JSON.stringify(marker)+');await new Promise(()=>{});api.setTitle("must not commit");',input);
   const rejected=assert.rejects(pending,error=>{
    console.log('MODEL2_PROCESS_LOSS_REJECTED '+JSON.stringify({code:error?.code,message:error?.message}));
    return error?.code==='SDK_RUNTIME_UNAVAILABLE'&&/closed|unavailable/.test(error.message)&&!/timeout/.test(error.message);
   });
   rejected.catch(()=>{});
   await deadline(()=>entered,1000,()=>{});
   await new Promise(resolve=>setImmediate(resolve));
   const current=getTarget();
   assert.equal(current.wc,active.wc);assert.equal(current.runner,active.runner);
   console.log('MODEL2_PROCESS_LOSS_TARGET '+JSON.stringify({phase:'active',pid:current.pid}));
   active.wc.forcefullyCrashRenderer();
   activeReason=await checkGone(activeObserver,'active');
   await rejected;
   assert.equal(active.runner.isClosed(),true);
   assert.equal(pool.entries.has(pool.key(id,'button')),false);
  }finally{activeObserver.dispose();}
  await verifyPeers();
  assert.deepEqual(await run(button,'new event only'),title('new event only'));
  assert.notEqual(entry(id,'button').runner,active.runner);
  const after=pids();assertDistinct(after);
  console.log('MODEL2_PROCESS_LOSS '+JSON.stringify({idleReason,activeReason,failedEventRejected:true,serviceSurvived:true,peerSurvived:true,nextEventRecovered:true,before,after,oomTested:false}));
 }finally{pool.close();}
}
// Real Chromium process loss on either side of an actual temporary-profile
// commit. Host receipt delivery is controlled here, not production editor IPC.
async function verifySettingsProcessLoss(){
 const {webContents}=require('electron');
 const {NativePluginHost,validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {ProfileStore}=require('../app/deckforge-editor/profile-store.cjs');
 const Core=require('../app/deckforge-editor/deck-core.js');
 const {deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const waitFor=async(predicate,label,ms=5000)=>{
  const end=Date.now()+ms;
  while(!predicate()){
   if(Date.now()>=end)throw Error('settings process loss: '+label+' timeout');
   await new Promise(resolve=>setTimeout(resolve,10));
  }
 };
 const drain=async ctx=>{
  for(let i=0;i<10;i++){
   const q=ctx.queue;await q;
   if(q===ctx.queue&&ctx.pending===0)return;
  }
  throw Error('settings process loss: queue did not settle');
 };
 const results=[];
 for(const phase of ['before-request','after-write']){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-sdk-settings-crash-'));
  const id='com.deckforge.native.settings-crash-'+phase,actionId=id+'.key';
  const marker='DECKFORGE_SETTINGS_CRASH_ENTERED';
  const script='if(event.type==="press"){'+(phase==='before-request'?
   'console.log('+JSON.stringify(marker)+');await new Promise(()=>{});':'')+
   'memory.presses=(memory.presses||0)+1;api.patchSettings({count:settings.count+1});}'+
   'else if(event.type==="settingsResult"){memory.result=event.response.status;}';
  const manifest=validateNativeManifest({apiVersion:2,id,name:'Settings crash test',version:'1.0.0',
   permissions:['display','settings.write'],capabilities:['settingsResult'],
   actions:[{id:actionId,name:'Counter',controllers:['Keypad'],states:2,script}]});
  const requests=[];
  const host=new NativePluginHost(root,e=>{if(e.kind==='nativeSettingsCommit')requests.push(e);},null,
   {settingsReceiptTimeout:15000,recoveryDelay:[100,300]});
  try{
   assert.ok(host.runnerPool,'test requires production Model 2 pool');
   const store=new ProfileStore(root),state=Core.migrateState(null);
   const action=state.pages[0][0]=Core.createAction('sd-plugin');
   action.settings.pluginUUID=id;action.settings.actionUUID=actionId;action.settings.pluginSettings={count:0};
   state.pages[0][1]=Core.createAction('text');state.pages[0][1].title='retain';
   store.write(state);
   const original=await fs.readFile(store.file,'utf8');
   const cfg=Core.createSdkMountTracker().reconcile('settings-crash',Core.sdkMountDescriptors(state))[0];
   host.sync([cfg],[manifest]);const ctx=host.contexts.get(cfg.context);await drain(ctx);
   const pool=host.runnerPool,key=pool.key(id,'button'),runner=pool.entries.get(key).runner;
   const pid=pool.processId(id,'button');
   assert.ok(Number.isInteger(pid)&&pid>0&&pid!==process.pid);
   const owners=webContents.getAllWebContents().filter(w=>!w.isDestroyed()&&w.getOSProcessId()===pid);
   assert.equal(owners.length,1,'only dedicated test renderer may be crashed');
   const wc=owners[0];
   let resolveGone,resolveEntered;
   const gone=new Promise(resolve=>{resolveGone=resolve;});
   const entered=new Promise(resolve=>{resolveEntered=resolve;});
   const onGone=(_event,target,details)=>{if(target===wc)resolveGone(details);};
   const onContentsGone=(_event,details)=>resolveGone(details);
   const onMessage=(event,_level,message)=>{if((event?.message??message)===marker)resolveEntered();};
   app.prependListener('render-process-gone',onGone);
   wc.prependListener('render-process-gone',onContentsGone);
   wc.on('console-message',onMessage);
   try{
    assert.equal(host.key(cfg.context,'down'),true);
    let request=null,raw=null,writes=0;
    if(phase==='before-request'){
     await deadline(()=>entered,1000,()=>{});
     assert.equal(requests.length,0);
    }else{
     await waitFor(()=>requests.length===1,'commit request');
     request=host.pendingSettingsRequest(cfg.context,requests[0].requestId);
     assert.ok(request);assert.equal(request.operation.value.count,1);
     const write=store.writeDocument.bind(store);
     store.writeDocument=(...args)=>{writes++;return write(...args);};
     assert.deepEqual(store.commitNativeSettingsChecked(request),{status:'saved'});
     raw=await fs.readFile(store.file,'utf8');
     assert.equal(writes,1);assert.ok(host.pendingSettingsRequest(cfg.context,request.requestId));
    }
    // PID may change on realm reset; refuse to crash a different owner.
    assert.equal(pool.entries.get(key).runner,runner);
    assert.equal(pool.processId(id,'button'),wc.getOSProcessId());
    assert.equal(webContents.getAllWebContents().filter(w=>!w.isDestroyed()&&w.getOSProcessId()===wc.getOSProcessId()).length,1);
    wc.forcefullyCrashRenderer();
    const detail=await deadline(()=>gone,5000,()=>{});
    assert.ok(['crashed','killed'].includes(detail?.reason));
    assert.equal(runner.isClosed(),true);
    if(phase==='before-request'){
     await waitFor(()=>ctx.recoveryAttempts>0&&!ctx.failed,'host recovery');
     await drain(ctx);
     assert.equal(requests.length,0,'failed input must not replay');
     assert.equal(await fs.readFile(store.file,'utf8'),original);
     assert.equal(new ProfileStore(root).read().pages[0][0].settings.pluginSettings.count,0);
     assert.equal(ctx.settings.count,0);
    }else{
     // The script returned before the crash. Its already validated operation
     // was saved once; reconstruct the ACK only from the durable evidence.
     const reopened=new ProfileStore(root);
     const outcome=reopened.nativeSettingsOutcome(request);
     assert.deepEqual(outcome,{status:'saved',recovered:true});
     assert.equal(host.acknowledgeSettings(cfg.context,request.requestId,true),true);
     await drain(ctx);
     assert.equal(ctx.memory.result,'saved');assert.equal(ctx.memory.presses,1);
     assert.equal(ctx.settings.count,1);assert.ok(!ctx.settingsUncertain);
     assert.equal(reopened.read().pages[0][0].settings.pluginSettings.count,1);
     assert.equal(reopened.read().pages[0][1].title,'retain');
     assert.equal(requests.length,1);assert.equal(writes,1);
     assert.equal(await fs.readFile(store.file,'utf8'),raw);
     assert.equal(host.acknowledgeSettings(cfg.context,request.requestId,true),false);
    }
    assert.notEqual(pool.entries.get(key).runner,runner,'recovered renderer must be new');
    results.push({phase,reason:detail.reason,requests:requests.length,writes,storedCount:ctx.settings.count,noReplay:true});
   }finally{
    app.removeListener('render-process-gone',onGone);
    wc.removeListener('render-process-gone',onContentsGone);
    wc.removeListener('console-message',onMessage);
   }
  }finally{host.close();await fs.rm(root,{recursive:true,force:true});}
 }
 console.log('MODEL2_SETTINGS_PROCESS_LOSS '+JSON.stringify({results,actualRenderer:true,actualProfileStore:true,receiptDelivery:'test-controlled',powerLossTested:false}));
}


 // Bounded integration workload using the actual native host, scheduler and
 // Electron pool. No real device, external service, credentials or OOM claim.
async function verifyModel2MountedPageCycles(){
 const {NativePluginHost,validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const id='com.deckforge.native.page-cycles',actionId=id+'.key',events=[];
 const manifest=validateNativeManifest({apiVersion:2,id,name:'Page cycles',version:'1.0.0',
  permissions:['display','background.run','timer.tick'],
  service:{tickIntervalMs:1000,script:"if(event.type==='start')memory.starts=(memory.starts||0)+1;if(event.type==='tick')memory.ticks=(memory.ticks||0)+1;"},
  actions:[{id:actionId,name:'Cycle key',controllers:['Keypad'],states:2,
   script:"if(event.type==='press'){memory.count=(memory.count||0)+1;api.setTitle(settings.label+':'+memory.count);}"}]});
 const host=new NativePluginHost('/unused',e=>events.push(e));
 const makePage=page=>Array.from({length:13},(_,slot)=>({context:page+':'+slot,slot,gesture:'down',pluginUUID:id,actionUUID:actionId,settings:{label:page+':'+slot}}));
 const drain=()=>deadline(async()=>{
  for(;;){
   const contexts=[...host.contexts.values()];
   await Promise.all(contexts.map(c=>c.queue));
   if(contexts.every(c=>c.pending===0)&&host.scheduler.running===0&&host.scheduler.waiting.length===0&&host.retired.size===0)return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
 },30000,()=>host.close());
 const service=()=>[...host.contexts.values()].find(c=>c.service);
 const assertPage=(page,count)=>{
  const buttons=[...host.contexts.values()].filter(c=>!c.service);
  assert.equal(buttons.length,13);
  for(const c of buttons){assert.ok(c.context.startsWith(page+':'));assert.equal(c.failed,false);assert.equal(c.memory.count,count);}
  assert.equal(service().failed,false);
  assert.ok(host.runnerPool.entries.size<=2);
  const buttonPid=host.runnerPool.processId(id,'button'),servicePid=host.runnerPool.processId(id,'service');
  assert.ok(buttonPid>0&&servicePid>0&&buttonPid!==servicePid,JSON.stringify({buttonPid,servicePid,serviceTicks:service().memory.ticks||0}));
 };
 const pressPage=async configs=>{
  const mark=events.length;
  for(const c of configs){assert.equal(host.key(c.context,'down'),true);assert.equal(host.key(c.context,'up'),true);}
  await drain();
  const titles=events.slice(mark).filter(e=>e.kind==='setTitle');
  assert.equal(titles.length,13);
  for(const c of configs)assert.equal(titles.filter(e=>e.context===c.context).length,1);
 };
 const started=Date.now();let presses=0;
 try{
  assert.ok(host.runnerPool);
  const first=makePage('first'),second=makePage('second');
  host.sync(first,[manifest]);await drain();const originalService=service();
  assert.equal(originalService.memory.starts,1);
  await pressPage(first);presses+=13;assertPage('first',1);
  host.sync(second,[manifest]);await drain();
  assert.equal(service(),originalService);assert.equal(service().memory.starts,1);
  assert.equal(host.key(first[0].context,'down'),false);
  await pressPage(second);presses+=13;assertPage('second',1);
  host.suspend();assert.equal(host.runnerPool.entries.size,0);
  assert.equal(host.key(second[0].context,'down'),false);
  host.resume();await drain();assert.equal(service().memory.starts,2);
  await pressPage(second);presses+=13;assertPage('second',2);
  // Real renderer: wake-only notification invalidates already admitted inputs.
  const beforeWake=events.length,oldQueues=[];
  for(const c of second){
    assert.equal(host.key(c.context,'down'),true);
    assert.equal(host.key(c.context,'up'),true);
    oldQueues.push(host.contexts.get(c.context).queue);
  }
  host.resume();assert.equal(host.runnerPool.entries.size,0);
  await Promise.all(oldQueues);await drain();
  assert.equal(service().memory.starts,3);
  for(const c of second)assert.equal(host.contexts.get(c.context).memory.count,2);
  assert.equal(events.slice(beforeWake).filter(e=>e.kind==='setTitle').length,0);
  await pressPage(second);presses+=13;assertPage('second',3);
  console.log('MODEL2_WAKE_ONLY '+JSON.stringify({discardedPresses:13,recoveredPresses:13,serviceStarts:service().memory.starts,actualElectron:true,actualOSResume:false}));
  host.sync(first,[manifest]);await drain();assert.equal(service(),originalService);
  await pressPage(first);presses+=13;assertPage('first',1);
  // Bounded repeated mount/retire stress; not a long-duration soak.
  const samples=[];
  const soak=process.env.DECKFORGE_SDK_SOAK==='1';
  const repeatStarted=Date.now();
  const initialServiceTicks=service().memory.ticks||0;
  let cycle=0;
  for(;cycle<8||(soak&&Date.now()-repeatStarted<300000);cycle++){
   const next=cycle%2===0?second:first,previous=cycle%2===0?first:second;
   host.sync(next,[manifest]);await drain();
   assert.equal(service(),originalService);
   assert.equal(host.key(previous[0].context,'down'),false);
   await pressPage(next);presses+=13;assertPage(next===first?'first':'second',1);
   assert.equal(host.retired.size,0);
   assert.equal(host.scheduler.running,0);
   assert.equal(host.scheduler.waiting.length,0);
   assert.equal(events.some(e=>e.kind==='nativeEffect'||e.kind==='nativeSettingsCommit'),false);
   events.length=0;
   if(cycle%8===0) samples.push({cycle,hostHeapBytes:process.memoryUsage().heapUsed,runnerEntries:host.runnerPool.entries.size});
  }
  const serviceTicks=(service().memory.ticks||0)-initialServiceTicks;
  if(soak)assert.ok(serviceTicks>0,'background timer must actually execute during soak');
  console.log('MODEL2_REPEAT_RESOURCE_SAMPLES '+JSON.stringify({samples,additionalTransitions:cycle,additionalPresses:cycle*13,serviceTicks,elapsedMs:Date.now()-repeatStarted,longDurationSoak:soak}));
  assert.equal(events.some(e=>e.kind==='nativeEffect'||e.kind==='nativeSettingsCommit'),false);
  console.log('MODEL2_MOUNTED_PAGE_CYCLES '+JSON.stringify({buttonsPerPage:13,presses,pageTransitions:2+cycle,suspendResumeCycles:1,isolatedMemory:true,serviceSurvived:true,elapsedMs:Date.now()-started,actualElectron:true,physicalDevice:false,oomTested:false}));
 }finally{host.close();assert.equal(host.contexts.size,0);assert.equal(host.runnerPool.entries.size,0);}
}

async function verifyTrustedDrawOps(legacy){
 const {BrowserWindow}=require('electron');
 const {paintValidatedDrawSpec,resolveWorkerDrawProgram}=require('../app/deckforge-editor/deckforge-draw-ops.cjs');
 const {NativePluginHost}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 const host=new NativePluginHost('/unused');
 const spec={width:64,height:64,background:'#123456',commands:[
  {type:'rect',color:'#ff0000',x:0,y:0,width:4,height:4},
  {type:'circle',color:'#00ff00',x:12,y:12,radius:5},
  {type:'line',color:'#0000ff',x:0,y:22,toX:60,toY:22,width:2},
  {type:'text',color:'#ffffff',x:32,y:45,text:'42',size:18,font:'sans-serif',bold:true}
 ]};
 try{
  await win.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'">'));
  const original=await legacy.run('api.drawKey('+JSON.stringify(spec)+');',input);
  const raw=JSON.stringify({ops:[{op:'drawKey',spec}],memory:{}});
  const resolved=await resolveWorkerDrawProgram(raw,validated=>deadline(()=>win.webContents.executeJavaScript('('+paintValidatedDrawSpec.toString()+')('+JSON.stringify(validated)+')'),1500,()=>win.destroy()));
  assert.deepEqual(resolved,original);
  const pluginUUID='com.deckforge.native.drawops-smoke';
  const ctx={slot:0,pluginUUID,action:{id:pluginUUID+'.key',name:'DrawOps',controllers:['Keypad'],states:2},permissions:['display'],settings:{}};
  const expected=host.validateScriptOps(ctx,'press',original.ops);
  assert.deepEqual(host.validateScriptOps(ctx,'press',resolved.ops),expected);
  assert.throws(()=>host.validateScriptOps({...ctx,service:true,permissions:['background.run']},'start',resolved.ops),/background service/);
  console.log('Model 5 trusted DrawOps pixel parity and host effect boundary passed');
 }finally{host.close();if(!win.isDestroyed())win.destroy();}
}

// Separate opt-in CI process: a small renderer heap and bounded allocation.
// Never use OS-wide memory pressure or count a forced crash/timeout as OOM.
const oomOnly=process.env.DECKFORGE_SDK_OOM==='1';
if(oomOnly){
 app.commandLine.appendSwitch('js-flags','--max-old-space-size=64');
 // Dedicated synthetic CI test only. Initialize the local crash handler before
 // any renderer exists; never enable report uploads or use product data.
 if(process.platform==='win32'){
  const dumpDir=process.env.DECKFORGE_SDK_OOM_DUMPS;
  if(!dumpDir)throw Error('Dedicated Windows OOM test requires an isolated crash dump directory');
  require('node:fs').mkdirSync(dumpDir,{recursive:true});
  app.setPath('crashDumps',dumpDir);
  const {crashReporter}=require('electron');
  crashReporter.start({uploadToServer:false});
  assert.equal(crashReporter.getUploadToServer(),false);
  console.log('MODEL2_OOM_CRASH_REPORTER '+JSON.stringify({localOnly:true,isolatedDirectory:true}));
 }
}
// Windows renderer stderr is unavailable. Match only the target PID and
// Chromium's native Blink V8 OOM diagnostic, never a generic crash code.
async function nativeHeapOomEvidence(pid){
 const file=process.env.DECKFORGE_SDK_OOM_LOG;
 if(!file)return false;
 const prefix=new RegExp('^\\['+pid+':\\d+:');
 let lastLines=[],logBytes=0;
 for(let i=0;i<20;i++){
  let lines=[];
  try{const raw=await fs.readFile(file,'utf8');logBytes=Buffer.byteLength(raw);lines=raw.split(/\r?\n/);}catch(error){if(error.code!=='ENOENT')throw error;}
  lastLines=lines;
  const match=lines.find(line=>prefix.test(line)&&/\b(?:ERROR|FATAL):[^\]]*v8_initializer\.cc:\d+\]\s+V8 javascript OOM \(/i.test(line));
  if(match){console.log('MODEL2_OOM_NATIVE_EVIDENCE '+JSON.stringify({pid,line:match.slice(0,500)}));return true;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 // Missing evidence must remain a failure; report only bounded diagnostic
 // lines from the actual target renderer, not a generic fatal message.
 console.log('MODEL2_OOM_LOG_DIAGNOSTIC '+JSON.stringify({pid,logBytes,targetLines:lastLines.filter(line=>prefix.test(line)).length,diagnostics:lastLines.filter(line=>prefix.test(line)&&/oom|heap|crashpad|fatal/i.test(line)).slice(-8).map(line=>line.slice(0,500))}));
 return false;
}
async function verifyModel2HeapExhaustion(){
 const {webContents}=require('electron');
 const {ScriptRunnerPool,deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(undefined,{idleMs:60000}),id='com.deckforge.native.oom-test',other=id+'-peer';
 const button=pool.lease(id,'button'),service=pool.lease(id,'service'),peer=pool.lease(other,'button');
 const title=value=>({ops:[{op:'title',value}],memory:{}});
 const run=(lease,value)=>lease.run('api.setTitle('+JSON.stringify(value)+');',input);
 const entry=(plugin,scope)=>pool.entries.get(pool.key(plugin,scope));
 try{
  await run(button,'before');await run(service,'service');await run(peer,'peer');
  const ids=[pool.processId(id,'button'),pool.processId(id,'service'),pool.processId(other,'button')];
  assert.ok(ids.every(pid=>Number.isInteger(pid)&&pid>0&&pid!==process.pid));
  assert.equal(new Set(ids).size,3);
  const owners=webContents.getAllWebContents().filter(w=>!w.isDestroyed()&&w.getOSProcessId()===ids[0]);
  assert.equal(owners.length,1);
  const wc=owners[0],runner=entry(id,'button').runner,serviceRunner=entry(id,'service').runner,peerRunner=entry(other,'button').runner;
  let resolveGone;
  const gone=new Promise(resolve=>{resolveGone=resolve;});
  const onGone=(_event,details)=>resolveGone(details);
  const onAppGone=(_event,target,details)=>{if(target===wc)resolveGone(details);};
  wc.prependListener('render-process-gone',onGone);
  app.prependListener('render-process-gone',onAppGone);
  let actualOom=false,oomReason;
  try{
   // Finite upper bound (32 million array elements); the reduced heap is
   // applied only in this dedicated Electron test invocation.
   const pending=button.run('const chunks=[];for(let i=0;i<32;i++)chunks.push(new Array(1048576).fill(i));api.setTitle("allocation survived");',input);
   const rejected=assert.rejects(pending,error=>error?.code==='SDK_RUNTIME_UNAVAILABLE'&&!/timeout/i.test(error.message));
   rejected.catch(()=>{});
   const details=await deadline(()=>gone,5000,()=>{});
   console.log('MODEL2_OOM_NOTIFICATION '+JSON.stringify({reason:details?.reason,exitCode:details?.exitCode}));
   oomReason=details?.reason;
   await rejected;
   actualOom=oomReason==='oom'||(oomReason==='crashed'&&await nativeHeapOomEvidence(ids[0]));
   assert.equal(runner.isClosed(),true);
   assert.equal(pool.entries.has(pool.key(id,'button')),false);
  }finally{
   wc.removeListener('render-process-gone',onGone);
   app.removeListener('render-process-gone',onAppGone);
  }
  assert.deepEqual(await run(service,'service alive'),title('service alive'));
  assert.deepEqual(await run(peer,'peer alive'),title('peer alive'));
  assert.equal(entry(id,'service').runner,serviceRunner);
  assert.equal(entry(other,'button').runner,peerRunner);
  assert.deepEqual(await run(button,'new input'),title('new input'));
  assert.notEqual(entry(id,'button').runner,runner);
  console.log('MODEL2_HEAP_PRESSURE_ISOLATION '+JSON.stringify({actualOom,oomReason,failedEventRejected:true,serviceSurvived:true,peerSurvived:true,nextEventRecovered:true,reducedTestHeap:true}));
  assert.equal(actualOom,true,'OOM requires Electron oom notification or target PID native V8 heap OOM evidence');
  console.log('MODEL2_OOM_VERIFIED '+JSON.stringify({actualOom:true,oomReason,failedEventRejected:true,serviceSurvived:true,peerSurvived:true,nextEventRecovered:true,reducedTestHeap:true}));
 }finally{pool.close();}
}

app.whenReady().then(async()=>{
  if(oomOnly){await verifyModel2HeapExhaustion();app.exit(0);return;}

  const a=createScriptRunner('com.deckforge.native.smokea');
  const b=createScriptRunner('com.deckforge.native.smokeb');
  try{
    const result=await a.run("api.setTitle(typeof require+':'+typeof process);memory.n=1;",input);
    assert.deepEqual(result,{ops:[{op:'title',value:'undefined:undefined'}],memory:{n:1}});
    await assert.rejects(a.run('while(true){}',input),/timeout/);
    const good=await b.run("api.toggleState();",input);
    assert.deepEqual(good.ops,[{op:'toggleState'}]);
    const network=await b.run("api.request('status');",input);
    assert.deepEqual(network.ops,[{op:'networkRequest',endpoint:'status',body:null}]);
    const continuation=await b.run("if(event.type==='networkResult')api.setTitle(event.response.body);",{...input,event:{type:'networkResult',response:{body:'Ready'}}});
    assert.deepEqual(continuation.ops,[{op:'title',value:'Ready'}]);
    const asyncResult=await b.run("globalThis.carry='must vanish'; const value=await Promise.resolve('async ready'); api.setTitle(value); memory.saved=1;",input);
    assert.deepEqual(asyncResult,{ops:[{op:'title',value:'async ready'}],memory:{saved:1}});
    const clean=await b.run("api.setTitle(typeof globalThis.carry);api.setTitle(String(memory.saved));",{...input,memory:asyncResult.memory});
    assert.deepEqual(clean.ops,[{op:'title',value:'undefined'},{op:'title',value:'1'}]);
    const drawing=await b.run("api.drawKey({width:16,height:16,background:'#ff0000',commands:[{type:'rect',x:0,y:0,width:4,height:4,color:'#0000ff'}]});",input);
    const {pixelImage}=require('../app/deckforge-editor/deckforge-pixel-image.cjs');
    const pixels=Buffer.from(drawing.ops[0].rgba,'base64');
    assert.deepEqual([...pixels.subarray(0,4)],[0,0,255,255]);
    assert.deepEqual([...pixels.subarray(8*16*4+8*4,8*16*4+8*4+4)],[255,0,0,255]);
    assert.ok(pixelImage(drawing.ops[0]).value.startsWith('data:image/png;base64,'));
    const text=await b.run("api.drawKey({width:64,height:64,commands:[{type:'text',x:32,y:32,text:'42',size:28,color:'#ffffff',bold:true}]});",input);
    assert.ok(Buffer.from(text.ops[0].rgba,'base64').some((v,i)=>i%4===3&&v>0));
    const {validateNativeManifest,NativePluginHost}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
    const manifest=validateNativeManifest(JSON.parse(await fs.readFile(path.join(__dirname,'../examples/deckforge-sdk/visual-counter.native.json'),'utf8')));
    const action=manifest.actions[0],host=new NativePluginHost('/unused');
    try{
      const settings={count:3,step:2,direction:'up',unrelated:'keep'};
      const press=await b.run(action.script,{...input,settings});
      const validated=host.validateScriptOps({pluginUUID:manifest.id,action,permissions:manifest.permissions,settings},'press',press.ops);
      assert.deepEqual(validated,{normal:[],effects:[{op:'settings',value:{...settings,count:5}}]});
      const refreshed=await b.run(action.script,{...input,event:{...input.event,type:'settings'},settings:validated.effects[0].value});
      const other=await b.run(action.script,{...input,event:{...input.event,type:'settings'},settings:{count:17,step:1,direction:'down'}});
      assert.notEqual(refreshed.ops[0].rgba,other.ops[0].rgba);
      assert.equal(host.validateScriptOps({pluginUUID:manifest.id,action,permissions:manifest.permissions,settings},'settings',refreshed.ops).normal[0].op,'image');
    }finally{host.close();}
    const badDraw=createScriptRunner('com.deckforge.native.baddraw');
    try{await assert.rejects(badDraw.run("api.drawKey({width:9999,height:64,commands:[]});",input),/invalid key drawing/);}finally{badDraw.close();}
    const c=createScriptRunner('com.deckforge.native.smokec');
    try{
      await assert.rejects(c.run("await new Promise(()=>{});",input),/timeout/);
    }finally{c.close();}
    const cancelled=createScriptRunner('com.deckforge.native.cancelled');
    try{
      const pending=cancelled.run("await new Promise(()=>{});",input);
      cancelled.close();
      await assert.rejects(pending,/closed|initialization failed/);
    }finally{cancelled.close();}
    console.log('DeckForge JavaScript SDK renderer smoke passed');
    await verifyModel2();
    await verifyModel2Repetition();
    await verifyModel2Limits();
    await verifyModel2ProcessLoss();
    await verifyModel2MountedPageCycles();
    await verifySettingsProcessLoss();
    await verifyTrustedDrawOps(b);
    await verifyModel2SerializationBoundary();
    await verifyPublicApi(b);
    await verifyHomeAssistant(b);
    await verifyHaBurst();
    await verifyWindowsEncryption();
    await verifyVectorRendering();
    a.close();b.close();app.exit(0);
  }catch(error){console.error(error);a.close();b.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
