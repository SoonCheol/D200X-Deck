'use strict';
// Real Electron smoke test, run from the Windows build before packaging.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {NativeSettingsVault}=require('../app/streamdeck-editor/deckforge-native-settings.cjs');
const assert=require('node:assert/strict');
const {createScriptRunner}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
const input={event:{type:'press',slot:0,gesture:'down'},settings:{},state:0,memory:{}};
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
 const {svgReport}=require('../app/streamdeck-editor/ulanzi-media-analysis.cjs');
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
  const {NativePluginHost,validateNativeManifest}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
  const id='com.deckforge.native.api-contract';
  const permissions=['display','settings.write','global.settings','navigation','wide.mode','wide.overlay','network.request','network.websocket','background.run'];
  const endpoints=[{id:'status',url:'https://example.com/status',method:'GET'},{id:'live',url:'wss://example.com/events',method:'WSS'},{id:'entity',url:'https://example.com/entities/',method:'PATCH',pathKeys:['id'],queryKeys:['view'],headerKeys:['if-match']}];
  const action={id:id+'.key',name:'Contract',controllers:['Keypad'],states:2,script:'api.setTitle("contract");'};
  validateNativeManifest({apiVersion:2,id,name:'Contract',version:'1.0.0',permissions,networkEndpoints:endpoints,service:{script:'void 0;'},actions:[action]});
  const host=new NativePluginHost('/unused');
  const ctx={slot:0,pluginUUID:id,action,permissions,networkEndpoints:endpoints,settings:{count:1,keep:true}};
  const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const png='data:image/png;base64,'+require('../app/streamdeck-editor/ulanzi-media-analysis.cjs').gifPngFrames(Buffer.from(gif.slice(22),'base64')).frames[0].png.toString('base64');
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
  const {createHomeAssistantManifest}=require('../app/streamdeck-editor/deckforge-ha-plugin.cjs');
  const {validateNativeManifest,NativePluginHost,projectSharedState}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
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
async function verifyModel2(){
 const {ScriptRunnerPool}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
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
 const {ScriptRunnerPool}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
 const pool=new ScriptRunnerPool(undefined,{idleLimit:3,idleMs:30000});
 const id='com.deckforge.native.repeat',started=Date.now();
 const button=pool.lease(id,'button'),service=pool.lease(id,'service');
 let buttonMemory={},serviceMemory={},maxEntries=0,buttonPid=null,servicePid=null;
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
   buttonPid??=pool.processId(id,'button');servicePid??=pool.processId(id,'service');
   assert.ok(buttonPid>0&&servicePid>0&&buttonPid!==servicePid);
   assert.equal(pool.processId(id,'button'),buttonPid);
   assert.equal(pool.processId(id,'service'),servicePid);
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
  console.log('MODEL2_REPETITION '+JSON.stringify({pairedRounds:24,additionalLeases:6,maxIdleEntries:maxEntries,elapsedMs:Date.now()-started,buttonPid,servicePid}));
 }finally{pool.close();assert.equal(pool.entries.size,0);}
}
async function verifyTrustedDrawOps(legacy){
 const {BrowserWindow}=require('electron');
 const {paintValidatedDrawSpec,resolveWorkerDrawProgram}=require('../app/streamdeck-editor/deckforge-draw-ops.cjs');
 const {NativePluginHost}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
 const {deadline}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
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

app.whenReady().then(async()=>{
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
    const {pixelImage}=require('../app/streamdeck-editor/deckforge-pixel-image.cjs');
    const pixels=Buffer.from(drawing.ops[0].rgba,'base64');
    assert.deepEqual([...pixels.subarray(0,4)],[0,0,255,255]);
    assert.deepEqual([...pixels.subarray(8*16*4+8*4,8*16*4+8*4+4)],[255,0,0,255]);
    assert.ok(pixelImage(drawing.ops[0]).value.startsWith('data:image/png;base64,'));
    const text=await b.run("api.drawKey({width:64,height:64,commands:[{type:'text',x:32,y:32,text:'42',size:28,color:'#ffffff',bold:true}]});",input);
    assert.ok(Buffer.from(text.ops[0].rgba,'base64').some((v,i)=>i%4===3&&v>0));
    const {validateNativeManifest,NativePluginHost}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
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
    await verifyTrustedDrawOps(b);
    await verifyPublicApi(b);
    await verifyHomeAssistant(b);
    await verifyWindowsEncryption();
    await verifyVectorRendering();
    a.close();b.close();app.exit(0);
  }catch(error){console.error(error);a.close();b.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
