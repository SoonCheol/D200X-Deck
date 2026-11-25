'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('../app/node_modules/jszip');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {StreamDeckPluginHost,parseArchive,validateManifest}=require('../app/deckforge-editor/sd-plugin-host.cjs');
const M={UUID:'de.perdoctus.streamdeck.homeassistant',Name:'Home Assistant',Version:'3.8.4',
  CodePath:'plugin.html',Actions:[
    {UUID:'de.perdoctus.streamdeck.homeassistant.entity',Name:'Entity (generic)',PropertyInspectorPath:'pi.html'}
  ]};
async function zipWith(entries){
  const z=new JSZip();for(const [name,body] of Object.entries(entries))z.file(name,body);
  return z.generateAsync({type:'nodebuffer'});
}
test('Stream Deck SDK manifest is compatible with HTML Home Assistant action',()=>{
  assert.equal(validateManifest(M).UUID,M.UUID);
  assert.throws(()=>validateManifest({...M,CodePath:'plugin.exe'}),/HTML 또는 Node.js CodePath/);
});
test('SDK plugin importer extracts nested sdPlugin folder and preserves manifest',async()=>{
  const prefix=M.UUID+'.sdPlugin/';
  const bytes=await zipWith({[prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'<html></html>',
    [prefix+'pi.html']:'<html></html>'});
  const pack=await parseArchive(bytes);
  assert.equal(pack.manifest.UUID,M.UUID);
  assert.deepEqual(pack.files.map(x=>x.name).sort(),['manifest.json','pi.html','plugin.html']);
});
test('SDK plugin importer blocks unsafe paths and missing manifest',async()=>{
  await assert.rejects(parseArchive(await zipWith({'other/file.txt':'x'})),/manifest/);
  const prefix=M.UUID+'.sdPlugin/';
  await assert.rejects(parseArchive(await zipWith({
    [prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'ok','outside.txt':'bad'
  })),/외부 파일/);
});

test('SDK manifest dual-state icon can be read without modifying the profile',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-sdk-'));
  try{
    const uuid=M.UUID,dir=path.join(tmp,'StreamDeck','Plugins',uuid+'.sdPlugin');
    await fs.mkdir(path.join(dir,'images'),{recursive:true});
    await fs.writeFile(path.join(dir,'images','off.png'),Buffer.from([137,80,78,71]));
    const host=new StreamDeckPluginHost(tmp);
    host.instances.set(uuid,{uuid,dir,manifest:{Actions:[{UUID:M.Actions[0].UUID,States:[{Image:'images/off'}]}]}});
    const result=await host.stateArtwork({pluginUUID:uuid,actionUUID:M.Actions[0].UUID},0);
    assert.equal(result,'data:image/png;base64,iVBORw==');
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
});


test('SDK property inspector save notifies the running plugin as well as the inspector',async()=>{
  const host=new StreamDeckPluginHost('/tmp/d200x-sdk-test');
  const sent=[];
  host.send=(ws,msg)=>{if(ws)sent.push({ws:ws.name,msg});};
  const uuid=M.UUID,context='profile:0::0:down',actionUUID=M.Actions[0].UUID;
  const settings={version:8,display:{entityId:'switch.living_1'},button:{serviceShortPress:{
    serviceId:'switch.toggle',entityId:'switch.living_1',serviceData:''}}};
  host.contexts.set(context,{context,slot:0,pluginUUID:uuid,actionUUID,settings:{}});
  host.instances.set(uuid,{uuid,ws:{name:'plugin'}});
  host.inspectors.set(context,{context,pluginUUID:uuid,ws:{name:'inspector'}});
  await host.message({event:'setSettings',context,payload:settings},null,{
    pluginUUID:uuid,context
  },{name:'inspector'});
  assert.equal(host.contexts.get(context).settings.display.entityId,'switch.living_1');
  assert.deepEqual(sent.map(x=>x.ws),['plugin','inspector']);
  assert.equal(sent[0].msg.event,'didReceiveSettings');
  assert.equal(sent[0].msg.payload.settings.button.serviceShortPress.serviceId,'switch.toggle');
});


test('HA custom-icons action follows actual HA on/off state and ignores unknown states',async()=>{
  const uuid=M.UUID,actionUUID=uuid+'.dual-state-entity',context='profile:0::1:down';
  const states=[],calls=[];
  const host=new StreamDeckPluginHost('/tmp/d200x-ha-test',event=>states.push(event));
  host.contexts.set(context,{context,pluginUUID:uuid,actionUUID,slot:1,
    settings:{display:{entityId:'switch.living_1'}}});
  host.global.set(uuid,{serverUrl:'https://ha.example.test',accessToken:'secret'});
  const fetchMock=async (url,options)=>{
    calls.push({url,auth:options.headers.Authorization});
    return {ok:true,json:async()=>({state:calls.length===1?'on':calls.length===2?'off':'unavailable',attributes:{friendly_name:'거실등'}})};
  };
  await host.refreshHaDualStates(fetchMock);
  await host.refreshHaDualStates(fetchMock);
  await host.refreshHaDualStates(fetchMock);
  assert.deepEqual(states.filter(x=>x.kind==='setState').map(x=>x.payload.state),[1,0]);
  assert.deepEqual(states.filter(x=>x.kind==='haEntityName'),[{kind:'haEntityName',context,entity:'switch.living_1',name:'거실등'}]);
  assert.ok(calls.every(x=>x.auth==='Bearer secret'));
  assert.ok(calls.every(x=>x.url.endsWith('/api/states/switch.living_1')));
  assert.equal(host.contexts.get(context).lastState,0);
});
test('HA fallback does not query settings for generic actions or unconfigured entities',async()=>{
  const uuid=M.UUID;
  const host=new StreamDeckPluginHost('/tmp/d200x-ha-test');
  host.global.set(uuid,{serverUrl:'https://ha.example.test',accessToken:'secret'});
  host.contexts.set('key',{context:'key',pluginUUID:uuid,
    actionUUID:uuid+'.entity',settings:{display:{entityId:'switch.living_1'}}});
  let called=0;
  await host.refreshHaDualStates(async()=>{called++;return {ok:true,json:async()=>({state:'on'})};});
  assert.equal(called,0);
});

const fusionManifest={UUID:'com.autodesk.fusionstreamdeck',Name:'Fusion 360',Version:'1.0.0.0',
  CodePath:'bin/plugin.js',Nodejs:{Version:'24'},SDKVersion:2,Actions:[
    {UUID:'com.autodesk.fusionstreamdeck.runcommand',Name:'Run Command',
      PropertyInspectorPath:'ui/run-command.html'}]};
test('FusionStreamDeck Node.js 24 manifest accepted without changing original SDK fields',()=>{
  assert.equal(validateManifest(fusionManifest).CodePath,'bin/plugin.js');
  assert.equal(validateManifest(fusionManifest).Nodejs.Version,'24');
  assert.throws(()=>validateManifest({...fusionManifest,CodePath:'bin/plugin.exe'}),/HTML 또는 Node.js/);
  assert.throws(()=>validateManifest({...fusionManifest,CodePath:'../outside.js'}),/HTML 또는 Node.js/);
});
test('Node plugin importer preserves its entrypoint and inspector assets',async()=>{
  const prefix=fusionManifest.UUID+'.sdPlugin/';
  const pack=await parseArchive(await zipWith({
    [prefix+'manifest.json']:JSON.stringify(fusionManifest),
    [prefix+'bin/plugin.js']:'// Node stub',
    [prefix+'ui/run-command.html']:'<html></html>'
  }));
  assert.equal(pack.manifest.Nodejs.Version,'24');
  assert.deepEqual(pack.files.map(x=>x.name).sort(),['bin/plugin.js','manifest.json','ui/run-command.html']);
});
test('Node.js runtime enforces requested major version',async()=>{
  const {nodeRuntime}=require('../app/deckforge-editor/sd-plugin-host.cjs');
  const runtime=await nodeRuntime(20);
  assert.ok(Number(runtime.version.split('.')[0])>=20);
  await assert.rejects(nodeRuntime(99),/Node.js 99 이상/);
});


test('Node SDK plugin runs a real WebSocket handshake and key event with original registration arguments',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-node-plugin-'));
  const uuid='com.d200x.nodeintegration',actions=[{UUID:uuid+'.button',Name:'Test Button'}];
  const installed=path.join(dir,'StreamDeck','Plugins',uuid+'.sdPlugin');
  const events=[];
  const host=new StreamDeckPluginHost(dir,message=>events.push(message));
  try{
    await fs.mkdir(installed,{recursive:true});
    const manifest={UUID:uuid,Name:'Test Node Plugin',Version:'1.0.0',
      CodePath:'plugin.js',Nodejs:{Version:'20'},Actions:actions};
    const script=[
      "const args=process.argv;",
      "const value=key=>args[args.indexOf(key)+1];",
      "const ws=new WebSocket('ws://127.0.0.1:'+value('-port'));",
      "ws.addEventListener('open',()=>ws.send(JSON.stringify({event:value('-registerEvent'),uuid:value('-pluginUUID')})));",
      "ws.addEventListener('message',event=>{",
      " const data=JSON.parse(event.data);",
      " if(data.event==='keyDown')ws.send(JSON.stringify({event:'setTitle',context:data.context,payload:{title:'NODE_OK'}}));",
      "});"
    ].join('\n');
    await fs.writeFile(path.join(installed,'manifest.json'),JSON.stringify(manifest));
    await fs.writeFile(path.join(installed,'plugin.js'),script);
    const context='default:0::0:down';
    await host.sync([{context,slot:0,pluginUUID:uuid,actionUUID:actions[0].UUID,settings:{}}]);
    const deadline=Date.now()+5000;
    while(!host.instances.get(uuid)?.ws&&Date.now()<deadline)
      await new Promise(r=>setTimeout(r,30));
    assert.ok(host.instances.get(uuid)?.ws,'Node process must register over SDK WebSocket');
    assert.equal(host.key(context,'down'),true);
    while(!events.some(x=>x.kind==='setTitle')&&Date.now()<deadline)
      await new Promise(r=>setTimeout(r,30));
    assert.equal(events.find(x=>x.kind==='setTitle')?.payload?.title,'NODE_OK');
  }finally{
    await host.close();
    await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150});
  }
});

test('Developer .sdPlugin folder installs through the same validated archive path',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-sdk-folder-'));
  try{
    const uuid=fusionManifest.UUID,folder=path.join(tmp,uuid+'.sdPlugin');
    await fs.mkdir(path.join(folder,'bin'),{recursive:true});
    await fs.mkdir(path.join(folder,'ui'),{recursive:true});
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(fusionManifest));
    await fs.writeFile(path.join(folder,'bin','plugin.js'),'// test fixture');
    await fs.writeFile(path.join(folder,'ui','run-command.html'),'<html></html>');
    const host=new StreamDeckPluginHost(path.join(tmp,'target'));
    const installed=await host.installDirectory(folder);
    assert.equal(installed.uuid,uuid);
    assert.equal((await host.list())[0].name,'Fusion 360');
    await assert.rejects(host.installDirectory(folder),/이미 있습니다/);
  }finally{await fs.rm(tmp,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});


test('new unified Plugins path non-destructively imports old SDK plugin and encrypted globals',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-plugin-migration-'));
  const uuid=M.UUID,old=path.join(tmp,'StreamDeck','Plugins');
  try{
    await fs.mkdir(path.join(old,uuid+'.sdPlugin'),{recursive:true});
    await fs.writeFile(path.join(old,uuid+'.sdPlugin','manifest.json'),JSON.stringify(M));
    await fs.writeFile(path.join(old,uuid+'.sdPlugin','plugin.html'),'<html></html>');
    await fs.writeFile(path.join(old,uuid+'.globals'),Buffer.from('preserved-secret'));
    const host=new StreamDeckPluginHost(tmp);
    const items=await host.list();
    assert.equal(items.length,1);
    assert.equal(items[0].uuid,uuid);
    const next=path.join(tmp,'Plugins');
    assert.equal((await fs.readFile(path.join(next,uuid+'.globals'))).toString(),'preserved-secret');
    assert.equal((await fs.readFile(path.join(old,uuid+'.globals'))).toString(),'preserved-secret');
    assert.ok((await fs.stat(path.join(old,uuid+'.sdPlugin','manifest.json'))).isFile());
    await fs.rm(path.join(next,uuid+'.sdPlugin'),{recursive:true});
    await host.list();
    assert.equal((await host.list()).length,0,'removed plugin must not reappear');
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
});

test('SDK openUrl accepts only credential-free HTTP(S) and refuses unsafe schemes',()=>{
 const {safeSdkExternalUrl}=require('../app/deckforge-editor/sd-plugin-host.cjs');
 assert.equal(safeSdkExternalUrl('https://example.com/oauth?redirect=1'),'https://example.com/oauth?redirect=1');
 for(const value of ['file:///C:/Users/a','javascript:alert(1)','data:text/html,bad',
   'https://name:password@example.com/','https://example.com/\nmalicious',null,
   'https://example.com/'.padEnd(2100,'x')])
   assert.equal(safeSdkExternalUrl(value),null,String(value)?.slice(0,45));
});

test('SDK openUrl context authorization supports absent context but refuses foreign contexts',()=>{
 const {allowedSdkOpenUrlContext}=require('../app/deckforge-editor/sd-plugin-host.cjs');
 const plugin='com.example.plugin';
 assert.equal(allowedSdkOpenUrlContext(plugin,undefined,undefined),true);
 assert.equal(allowedSdkOpenUrlContext(plugin,{pluginUUID:plugin},'known-context'),true);
 assert.equal(allowedSdkOpenUrlContext(plugin,{pluginUUID:'foreign'},'known-context'),false);
 assert.equal(allowedSdkOpenUrlContext(plugin,undefined,'unknown-context'),false);
 assert.equal(allowedSdkOpenUrlContext('',undefined,undefined),false);
});

test('legacy plugin keepData removal and trusted recovery preserve globals and reject stale revisions',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-legacy-retained-'));
 const host=new StreamDeckPluginHost(root),uuid=M.UUID,prefix=uuid+'.sdPlugin/';
 try{
  await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'<html></html>'}));
  const globals=host.settingsFile(uuid);await fs.writeFile(globals,'local encrypted fixture');
  const plan=await host.retainedRecord(uuid);
  await assert.rejects(host.removeKeepingData(uuid,'stale'),/변경 감지/);
  assert.equal((await host.list()).length,1);
  await host.removeKeepingData(uuid,plan.revision);
  assert.equal((await host.list()).length,0);
  const retained=await host.listRetained();
  assert.equal(retained.length,1);assert.equal(retained[0].id,uuid);
  assert.equal(retained[0].revision,plan.revision);
  assert.equal(await fs.readFile(globals,'utf8'),'local encrypted fixture');
  await assert.rejects(host.restoreRetained(uuid,'stale'),/변경 감지/);
  await host.restoreRetained(uuid,plan.revision);
  assert.equal((await host.list()).length,1);assert.deepEqual(await host.listRetained(),[]);
  assert.equal(await fs.readFile(globals,'utf8'),'local encrypted fixture');
 }finally{await host.close();await fs.rm(root,{recursive:true,force:true});}
});


test('each compatibility sync uses a single fresh catalogue, including the router snapshot',async()=>{
 const {NativePluginHost,PluginRouter}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const legacy=new StreamDeckPluginHost('/unused'),native=new NativePluginHost('/unused');
 const uuid='com.deckforge.compat.test',actionUUID=uuid+'.button';
 let calls=0,installed=true;
 legacy.list=async()=>{calls++;return installed?[{uuid,actions:[{uuid:actionUUID}]}]:[];};
 native.manifests=async()=>[];native.loadServicePolicy=async()=>{};
 legacy.instances.set(uuid,{uuid});
 const configs=Array.from({length:13},(_,slot)=>({context:'compat-'+slot,slot,gesture:'down',pluginUUID:uuid,actionUUID,settings:{}}));
 const router=new PluginRouter(legacy,native);
 try{
  await legacy.sync(configs);
  assert.equal(calls,1);assert.equal(legacy.contexts.size,13);
  await router.sync(configs);
  assert.equal(calls,2);assert.equal(legacy.contexts.size,13);
  await legacy.sync([...configs,{...configs[0],context:'invalid-action',actionUUID:uuid+'.missing'}]);
  assert.equal(calls,3);assert.equal(legacy.contexts.has('invalid-action'),false);
  installed=false;
  await router.sync(configs);
  assert.equal(calls,4);assert.equal(legacy.contexts.size,0);
  await legacy.sync([]);
  assert.equal(calls,4);
 }finally{await router.close();}
});


test('compatibility mount completion does not wait for a pending HA state refresh',async()=>{
 const host=new StreamDeckPluginHost('/unused');
 const uuid=M.UUID,actionUUID=uuid+'.dual-state-entity';
 const cfg={context:'ha',slot:0,pluginUUID:uuid,actionUUID,settings:{display:{entityId:'switch.one'}}};
 host.list=async()=>[{uuid,actions:[{uuid:actionUUID}]}];host.instances.set(uuid,{uuid});
 let release,entered=false;
 const gate=new Promise(resolve=>{release=resolve;});
 host.refreshHaDualStates=async()=>{entered=true;await gate;};
 let timer;
 try{
  await Promise.race([host.sync([cfg]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('mount waited for HA polling')),1000);})]);
  assert.equal(entered,true);assert.equal(host.contexts.has('ha'),true);
 }finally{clearTimeout(timer);release();await host.close();}
});

test('HA fallback claims one poll before credential I/O and drops stale settings and suspend results',async()=>{
 const events=[],host=new StreamDeckPluginHost('/unused',e=>events.push(e));
 const uuid=M.UUID,actionUUID=uuid+'.dual-state-entity';
 const ctx={context:'ha',slot:0,pluginUUID:uuid,actionUUID,settings:{display:{entityId:'switch.one'}}};
 host.contexts.set(ctx.context,ctx);
 let release,reads=0,requests=0;
 const gate=new Promise(resolve=>{release=resolve;});
 host.readGlobal=async()=>{reads++;await gate;return {serverUrl:'https://ha.example.test',accessToken:'test'};};
 host.stateArtwork=async()=>null;
 const fetcher=async()=>{requests++;return {ok:true,json:async()=>({state:'on'})};};
 try{
  const first=host.refreshHaDualStates(fetcher);
  await host.refreshHaDualStates(fetcher);assert.equal(reads,1);
  ctx.settings={display:{entityId:'switch.two'}};release();await first;
  assert.equal(requests,0);assert.deepEqual(events,[]);
  let reply,started;const response=new Promise(resolve=>{reply=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const pending=host.refreshHaDualStates(async()=>{started();await response;return {ok:true,json:async()=>({state:'on'})};});
  await ready;host.onSystemSuspend();host.onSystemResume();
  reply();await pending;assert.deepEqual(events,[]);
  await host.refreshHaDualStates(fetcher);
  assert.equal(requests,1);assert.equal(events.filter(e=>e.kind==='setState').length,1);
  assert.equal(host.haPollBusy,false);
 }finally{release();await host.close();}
});

test('unchanged compatibility sync preserves an in-flight HA state observation',async()=>{
 const events=[],host=new StreamDeckPluginHost('/unused',e=>events.push(e));
 const uuid=M.UUID,actionUUID=uuid+'.dual-state-entity';
 const cfg={context:'ha',slot:0,pluginUUID:uuid,actionUUID,settings:{display:{entityId:'switch.one'}}};
 const ctx={...cfg,appeared:true};host.contexts.set(cfg.context,ctx);host.instances.set(uuid,{uuid});
 host.readGlobal=async()=>({serverUrl:'https://ha.example.test',accessToken:'test'});
 host.stateArtwork=async()=>null;
 let release,started;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{started=r;});
 try{
  const pending=host.refreshHaDualStates(async()=>{started();await gate;return {ok:true,json:async()=>({state:'on'})};});
  await ready;
  await host.sync([structuredClone(cfg)],[{uuid,actions:[{uuid:actionUUID}]}]);
  assert.equal(ctx.settings,cfg.settings);
  release();await pending;
  assert.equal(events.filter(e=>e.kind==='setState').length,1);
 }finally{release();await host.close();}
});


test('Fusion property inspector is compact and anchored in screen DIP coordinates',()=>{
 const {fusionInspectorBounds}=require('../app/deckforge-editor/sd-plugin-host.cjs');
 const content={x:100,y:60,width:1200,height:800},area={x:0,y:0,width:1600,height:1000};
 assert.deepEqual(fusionInspectorBounds(content,area,{left:20,right:252,top:350}),{x:360,y:410,width:440,height:460});
 assert.deepEqual(fusionInspectorBounds(content,area,{left:20,right:252,top:350},1.25),{x:423,y:498,width:440,height:460});
 const edge=fusionInspectorBounds(content,{x:0,y:0,width:1300,height:800},{left:750,right:980,top:700});
 assert.deepEqual(edge,{x:402,y:340,width:440,height:460});
 assert.deepEqual(fusionInspectorBounds(content,area,{left:NaN,right:252,top:350}),{x:480,y:230,width:440,height:460});
});

test('legacy retained full deletion removes only confirmed code and global data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-legacy-purge-'));
 try{
  const host=new StreamDeckPluginHost(root),id=M.UUID,prefix=id+'.sdPlugin/';
  await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'<html></html>'}));
  const other=path.join(host.root,'another.plugin.globals');await fs.writeFile(other,'other');
  await fs.writeFile(host.settingsFile(id),'retained global');
  await host.removeKeepingData(id,(await host.retainedRecord(id)).revision);
  const plan=await host.planRetainedPurge(id);
  assert.deepEqual(plan.counts,{retained:1,history:0,settings:1,credential:0});
  await assert.rejects(host.purgeRetained(id,'stale'),/변경 감지/);
  assert.equal((await host.purgeRetained(id,plan.revision)).status,'purged');
  assert.deepEqual(await host.listRetained(),[]);
  await assert.rejects(fs.access(host.settingsFile(id)),{code:'ENOENT'});
  assert.equal(await fs.readFile(other,'utf8'),'other');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
