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
  assert.equal(validateManifest({...M,CodePath:'plugin.exe'}).CodePath,'plugin.exe');
  assert.throws(()=>validateManifest({...M,CodePath:'plugin.bat'}),/CodePath/);
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
  assert.equal(validateManifest({...fusionManifest,CodePath:'bin/plugin.exe'}).CodePath,'bin/plugin.exe');
  assert.throws(()=>validateManifest({...fusionManifest,CodePath:'../outside.js'}),/CodePath/);
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

test('property inspector appear is sent only after both sockets and action are ready',()=>{
 const host=new StreamDeckPluginHost('/unused'),id=M.UUID,context='test-pi',actionUUID=M.Actions[0].UUID;
 const ctx={context,pluginUUID:id,actionUUID,appeared:false},pi={context,pluginUUID:id,actionUUID,ws:null};
 const sent=[];host.send=(ws,msg)=>{sent.push(msg.event);return true;};host.contexts.set(context,ctx);host.inspectors.set(context,pi);
 const inst={uuid:id,ws:null};host.instances.set(id,inst);
 assert.equal(host.notifyInspectorReady(pi),false);
 inst.ws={readyState:1};ctx.appeared=true;assert.equal(host.notifyInspectorReady(pi),false);
 pi.ws={readyState:1};assert.equal(host.notifyInspectorReady(pi),true);assert.equal(host.notifyInspectorReady(pi),false);
 inst.ws={readyState:1};assert.equal(host.notifyInspectorReady(pi),true);
 assert.deepEqual(sent,['propertyInspectorDidAppear','propertyInspectorDidAppear']);
});
test('active SDK logs changing after approval do not block removal; retained logs remain protected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-legacy-logs-'));
 const host=new StreamDeckPluginHost(root),id=M.UUID,prefix=id+'.sdPlugin/';
 try{
  await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'<html></html>',[prefix+'logs/plugin.log']:'one'}));
  const plan=await host.retainedRecord(id);await fs.appendFile(path.join(host.root,id+'.sdPlugin','logs','plugin.log'),'two');
  await host.removeKeepingData(id,plan.revision);
  const retained=await host.planRetainedPurge(id);await fs.appendFile(path.join(host.retainedPath(id),'logs','plugin.log'),'three');
  await assert.rejects(host.purgeRetained(id,retained.revision),/변경 감지/);
 }finally{await host.close();await fs.rm(root,{recursive:true,force:true});}
});

test('SDK external link grant is one-shot, scoped to live user action and expires',()=>{
 const host=new StreamDeckPluginHost('/unused'),uuid=M.UUID,context='link',ws={readyState:1};
 const inst={uuid,ws},ctx={context,pluginUUID:uuid,actionUUID:M.Actions[0].UUID,slot:0};
 host.instances.set(uuid,inst);host.contexts.set(context,ctx);host.send=()=>true;
 assert.equal(host.consumeUserLinkGrant(inst,undefined),false);
 assert.equal(host.key(context,'down'),true);
 assert.equal(host.consumeUserLinkGrant(inst,'foreign'),false);
 assert.equal(host.consumeUserLinkGrant(inst,undefined),true);
 assert.equal(host.consumeUserLinkGrant(inst,undefined),false);
 assert.equal(host.key(context,'up'),true);
 assert.equal(host.consumeUserLinkGrant(inst,undefined),false);
 host.key(context,'down');assert.equal(host.consumeUserLinkGrant(inst,context,Date.now()+4000),false);
 host.key(context,'up');assert.equal(host.consumeUserLinkGrant(inst,context),true);
 host.key(context,'down');inst.ws={readyState:1};assert.equal(host.consumeUserLinkGrant(inst,undefined),false);
});

test('SDK percent encoded SVG images reach the existing renderer as base64',async()=>{
 const {normalizeSdkImage}=require('../app/deckforge-editor/sd-plugin-host.cjs');
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>Success · 성공 100%</text></svg>';
 const encoded=encodeURIComponent(svg),expected='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
 for(const uri of ['data:image/svg+xml,'+encoded,'data:image/svg+xml;charset=utf8,'+encoded,'data:image/svg+xml;charset=UTF-8,'+encoded,expected])assert.equal(normalizeSdkImage(uri),expected);
 for(const uri of ['data:text/html,'+encoded,'data:image/svg+xml,%ZZ','data:image/svg+xml,'+'x'.repeat(1024*1024),'https://example.com/icon.svg'])assert.equal(normalizeSdkImage(uri),null);
 assert.equal(normalizeSdkImage('data:image/png;base64,iVBORw=='),'data:image/png;base64,iVBORw==');
 const events=[],host=new StreamDeckPluginHost('/unused',msg=>events.push(msg)),uuid=M.UUID,context='image';
 host.contexts.set(context,{context,pluginUUID:uuid,actionUUID:M.Actions[0].UUID});
 await host.message({event:'setImage',context,payload:{image:'data:image/svg+xml,'+encoded}},{uuid},null,{});
 assert.deepEqual(events,[{kind:'setImage',context,payload:{image:expected}}]);
 await host.message({event:'setImage',context,payload:{image:'data:image/svg+xml,%ZZ'}},{uuid},null,{});
 assert.equal(events.length,1);
});


test('compatibility artwork is UI-only and failed artwork cannot hide installed identity',async()=>{
 const {NativePluginHost,PluginRouter}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-catalog-artwork-'));
 const events=[],legacy=new StreamDeckPluginHost(tmp,e=>events.push(e)),native=new NativePluginHost(tmp);
 const router=new PluginRouter(legacy,native);
 const nativeId='com.deckforge.native.artwork-test';
 const collisionId='com.deckforge.native.artwork-collision';
 const legacyManifest={...M,UUID:collisionId,Actions:[{...M.Actions[0],UUID:collisionId+'.action'}]};
 const nativeManifest={apiVersion:1,id:nativeId,name:'Native test',version:'1.0.0',permissions:['display'],actions:[
  {id:nativeId+'.toggle',name:'Toggle',controllers:['Keypad'],states:2,events:{press:[{op:'toggleState'}]}}]};
 try{
  const dir=path.join(legacy.root,legacyManifest.UUID+'.sdPlugin');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(legacyManifest));
  await fs.writeFile(path.join(dir,'plugin.html'),'<html></html>');
  let reads=0;
  legacy.defaultArtwork=async()=>{reads++;if(reads===1)throw Error('fixture artwork denied');return 'data:image/png;base64,iVBORw==';};
  native.manifests=async()=>[nativeManifest];native.loadServicePolicy=async()=>{};
  const catalogue=await router.catalog();
  assert.equal(catalogue.legacy[0].uuid,legacyManifest.UUID);
  assert.equal(catalogue.legacy[0].actions[0].uuid,legacyManifest.Actions[0].UUID);
  assert.equal(Object.hasOwn(catalogue.legacy[0].actions[0],'defaultImages'),false);
  assert.equal(reads,0);
  const cfg={context:'native-artwork-free',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
  await router.sync([cfg]);
  assert.equal(router.key(cfg.context,'down'),true);
  assert.equal(reads,0);
  const collision={...nativeManifest,id:legacyManifest.UUID,actions:[{...nativeManifest.actions[0],id:legacyManifest.UUID+'.toggle'}]};
  await assert.rejects(router.checkNativeCandidate(collision),/plugin ID already installed/);
  assert.equal(reads,0);
  const displayed=(await router.list()).find(p=>p.uuid===legacyManifest.UUID);
  assert.ok(displayed);
  assert.deepEqual(displayed.actions[0].defaultImages,{off:null,on:'data:image/png;base64,iVBORw=='});
  assert.equal(reads,2);
  assert.ok(events.some(e=>e.kind==='error'&&e.message.includes('fixture artwork denied')));
 }finally{await router.close();await fs.rm(tmp,{recursive:true,force:true});}
});


test('new page retires pending compatibility startup and prevents obsolete mount publication',async()=>{
 const {NativePluginHost,PluginRouter}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const legacy=new StreamDeckPluginHost('/unused'),native=new NativePluginHost('/unused');
 const uuid='com.deckforge.compat.pending',actionUUID=uuid+'.key';
 const nativeId='com.deckforge.native.next-page',manifest={apiVersion:1,id:nativeId,name:'Native next',version:'1.0.0',permissions:['display'],actions:[{id:nativeId+'.key',name:'Next',controllers:['Keypad'],states:1,events:{press:[{op:'title',value:'next'}]}}]};
 const first={context:'old-first',slot:0,gesture:'down',pluginUUID:uuid,actionUUID,settings:{}};
 const second={...first,context:'old-second',slot:1};
 const fresh={...first,context:'new-page',pluginUUID:nativeId,actionUUID:nativeId+'.key'};
 legacy.list=async()=>[{uuid,actions:[{uuid:actionUUID}]}];
 native.manifests=async()=>[manifest];native.loadServicePolicy=async()=>{};
 let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const messages=[],calls=[];
 legacy.send=(_ws,msg)=>messages.push(msg);
 legacy.ensure=async id=>{calls.push(id);entered();await gate;const inst={uuid:id,ws:{readyState:1}};legacy.instances.set(id,inst);return inst;};
 const router=new PluginRouter(legacy,native);
 let pending,next,management,timer;
 let mounted;const nativeReady=new Promise(r=>mounted=r);
 const syncNative=native.sync.bind(native);native.sync=(configs,manifests)=>{syncNative(configs,manifests);if(configs.some(c=>c.context===fresh.context))mounted();};
 let managementStarted=false;legacy.retainedRecord=async()=>{managementStarted=true;return {revision:'fixture'};};
 try{
  pending=router.sync([first,second]);pending.catch(()=>{});
  await ready;assert.ok(legacy.contexts.has(first.context));
  next=router.sync([fresh]);next.catch(()=>{});
  assert.equal(legacy.contexts.has(first.context),false);
  assert.equal(router.key(first.context,'down'),false);
  await Promise.race([nativeReady,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native mount waited for compatibility startup')),2000);})]);
  clearTimeout(timer);assert.equal(router.key(fresh.context,'down'),true);
  assert.equal(router.key(fresh.context,'down'),false,'duplicate press must still be rejected');
  assert.equal(router.key(fresh.context,'up'),true);
  management=router.planLegacyRemoval(uuid);
  await new Promise(r=>setImmediate(r));assert.equal(managementStarted,false,'management must still wait for compatibility startup');
  release();await Promise.all([pending,next,management]);
  assert.equal(managementStarted,true);
  assert.equal(legacy.contexts.size,0);
  assert.equal(messages.some(m=>m.event==='willAppear'),false);
  assert.deepEqual(calls,[uuid]);
  assert.equal(router.key(fresh.context,'down'),true);
  assert.equal(router.key(fresh.context,'up'),true);
 }finally{clearTimeout(timer);release();await Promise.allSettled([pending,next,management]);await router.close();}
});

test('shared Node process runtime supports plugin-local files and modules with literal arguments',async()=>{
  const {nodeRuntime,spawnNodePlugin}=require('../app/deckforge-editor/deckforge-node-runtime.cjs');
  const {once}=require('node:events');
  const runtime=await nodeRuntime(20);
  const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge runtime '));
  let child;
  try{
    await fs.writeFile(path.join(cwd,'data.txt'),'file-ok');
    await fs.writeFile(path.join(cwd,'local.cjs'),'module.exports="module-ok"');
    const entry=path.join(cwd,'plugin.cjs');
    await fs.writeFile(entry,"console.log(JSON.stringify([require('node:fs').readFileSync('data.txt','utf8'),require('./local.cjs'),process.argv[2]]))");
    child=spawnNodePlugin(runtime,entry,['A & B'],cwd);
    let output='';
    child.stdout.on('data',c=>output+=c);
    child.stderr.resume();
    const [code]=await once(child,'close');
    assert.equal(code,0);
    assert.deepEqual(JSON.parse(output),['file-ok','module-ok','A & B']);
  }finally{
    if(child&&child.exitCode===null&&!child.killed)child.kill();
    await fs.rm(cwd,{recursive:true,force:true,maxRetries:6,retryDelay:150});
  }
});

test('trusted Node task executes file, module and child process, returns JSON and cancels',async()=>{
  const {executeNodeTask}=require('../app/deckforge-editor/deckforge-trusted-node.cjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-node-task-'));
  try{
    await fs.writeFile(path.join(dir,'local.cjs'),'module.exports="module-ok"');
    const task={source:"const fs=require('node:fs/promises'); await fs.writeFile('local.txt',input.text); return {file:await fs.readFile('local.txt','utf8'),module:require('./local.cjs'),child:require('node:child_process').execFileSync(process.execPath,['-p','1+2'],{encoding:'utf8'}).trim()};"};
    assert.deepEqual(await executeNodeTask(task,{text:'한글 & literal'},dir),{status:'ok',value:{file:'한글 & literal',module:'module-ok',child:'3'}});
    assert.deepEqual(await executeNodeTask({source:'setInterval(()=>{},100); await new Promise(()=>{});',timeoutMs:1000},{},dir),{status:'timeout'});
    const abort=new AbortController(),pending=executeNodeTask({source:'setInterval(()=>{},100); await new Promise(()=>{});'},{},dir,abort.signal);
    setTimeout(()=>abort.abort(),150);
    assert.deepEqual(await pending,{status:'cancelled'});
    assert.deepEqual(await executeNodeTask({source:'return "x".repeat(9000);'},{},dir),{status:'result-limit'});
  }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('Windows entry override is selected and original package files preserved',async()=>{
  const {windowsEntry,pluginKind}=require('../app/deckforge-editor/sd-plugin-host.cjs');
  const m={...M,CodePath:'mac/plugin',CodePathMac:'mac/plugin',CodePathWin:'bin/worker.exe'};
  assert.equal(windowsEntry(validateManifest(m)),'bin/worker.exe');
  assert.equal(pluginKind(windowsEntry(m)),'exe');
  assert.equal(pluginKind('ui.htm'),'html');
  assert.throws(()=>validateManifest({...m,CodePathWin:'../worker.exe'}),/CodePath/);
  assert.throws(()=>validateManifest({...m,CodePathWin:'bin/worker.cmd'}),/CodePath/);
  const prefix=m.UUID+'.sdPlugin/';
  const pack=await parseArchive(await zipWith({[prefix+'manifest.json']:JSON.stringify(m),[prefix+'bin/worker.exe']:'fixture',[prefix+'pi.html']:'<html></html>'}));
  assert.deepEqual(pack.manifest,m);
  assert.deepEqual(pack.files.map(f=>f.name).sort(),['bin/worker.exe','manifest.json','pi.html']);
  await assert.rejects(parseArchive(await zipWith({[prefix+'manifest.json']:JSON.stringify(m),[prefix+'mac/plugin']:'mac'})),/Windows CodePath/);
});
test('original executable grant persists per package revision, denial and revocation',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-exe-grant-'));
  const m={...M,UUID:'com.deckforge.external.exefixture',CodePath:'worker.exe',Actions:[{UUID:'com.deckforge.external.exefixture.key',Name:'EXE'}]};
  const prefix=m.UUID+'.sdPlugin/';
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()}; // Mock encryption adapter.
  let prompts=0,allow=false;
  const make=()=>new StreamDeckPluginHost(root,()=>{},()=>null,{executableStorage:storage,executableApprove:async()=>{prompts++;return allow;}});
  let host=make();
  try{
    await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(m),[prefix+'worker.exe']:'fixture',[prefix+'dependency.dll']:'v1'}));
    assert.equal((await host.list())[0].executable,true);
    assert.equal(prompts,0);
    assert.equal(await host.authorizeExecutable(m.UUID),false);
    assert.equal(await host.authorizeExecutable(m.UUID),false);assert.equal(prompts,1);
    let info=await host.executablePermissionInfo(m.UUID);
    await host.setExecutablePermission(m.UUID,info.revision,true);
    assert.equal(await host.authorizeExecutable(m.UUID),true);assert.equal(prompts,1);
    await host.close();host=make();
    assert.equal(await host.authorizeExecutable(m.UUID),true);assert.equal(prompts,1);
    info=await host.executablePermissionInfo(m.UUID);await host.setExecutablePermission(m.UUID,info.revision,false);
    assert.equal(await host.authorizeExecutable(m.UUID),false);assert.equal(prompts,1);
    await fs.writeFile(path.join(host.root,prefix,'dependency.dll'),'v2');
    allow=true;assert.equal(await host.authorizeExecutable(m.UUID),true);assert.equal(prompts,2);
    await assert.rejects(host.setExecutablePermission(m.UUID,info.revision,true),/변경 감지/);
  }finally{await host.close();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});
test('Windows native executable receives original registration arguments', {skip:process.platform!=='win32',timeout:30000},async()=>{
  const {execFileSync}=require('node:child_process');
  const {spawnExecutablePlugin}=require('../app/deckforge-editor/deckforge-node-runtime.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge exe fixture '));
  let child;
  try{
    const exe=path.join(root,'fixture.exe'),source=path.join(root,'fixture.cs');
    await fs.writeFile(source,'using System; using System.IO; public class Fixture { public static void Main(string[] args) { File.WriteAllLines("received.txt",args); } }');
    const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
    execFileSync(compiler,['/nologo','/target:exe','/out:'+exe,source],{windowsHide:true,timeout:10000});
    const args=['-port','12345','-pluginUUID','com.deckforge.test.exe','-registerEvent','registerPlugin','-info','{"name":"A & B"}'];
    child=spawnExecutablePlugin(exe,args,root);child.stdout.resume();child.stderr.resume();
    const [code]=await require('node:events').once(child,'close');
    assert.equal(code,0);
    assert.deepEqual((await fs.readFile(path.join(root,'received.txt'),'utf8')).trim().split(/\r?\n/),args);
  }finally{if(child&&child.exitCode===null&&!child.killed)child.kill();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('plugin-wide property inspector inherited only when action does not override it',async()=>{
  const {propertyInspectorPath}=require('../app/deckforge-editor/sd-plugin-host.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-shared-inspector-'));
  const uuid='com.deckforge.test.sharedinspector';
  const m={...M,UUID:uuid,PropertyInspectorPath:'ui/common.htm',DefaultWindowSize:[620,540],
    Actions:[{UUID:uuid+'.common',Name:'Common'},{UUID:uuid+'.own',Name:'Own',PropertyInspectorPath:'ui/own.html'},
      {UUID:uuid+'.none',Name:'None',PropertyInspectorPath:''},{UUID:uuid+'.bad',Name:'Bad',PropertyInspectorPath:'../outside.html'}]};
  const prefix=uuid+'.sdPlugin/';
  const host=new StreamDeckPluginHost(root);
  try{
    assert.deepEqual(m.Actions.map(a=>propertyInspectorPath(m,a)),['ui/common.htm','ui/own.html','','']);
    await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(m),[prefix+'plugin.html']:'<html></html>',[prefix+'ui/common.htm']:'<html></html>',[prefix+'ui/own.html']:'<html></html>'}));
    const [plugin]=await host.list();
    assert.deepEqual(plugin.actions.map(a=>a.propertyInspectorPath),['ui/common.htm','ui/own.html','','']);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(host.root,prefix,'manifest.json'),'utf8')),m);
  }finally{await host.close();await fs.rm(root,{recursive:true,force:true});}
});
test('property inspector popup dimensions respect manifest default, feature overrides and display bounds',()=>{
  const {inspectorPopupSize}=require('../app/deckforge-editor/sdk-inspector-scope.cjs');
  const area={width:1200,height:900};
  assert.deepEqual(inspectorPopupSize(undefined,'',area),{width:500,height:650});
  assert.deepEqual(inspectorPopupSize([620,540],'',area),{width:620,height:540});
  assert.deepEqual(inspectorPopupSize([620,540],'width=700,height=400',area),{width:700,height:400});
  assert.deepEqual(inspectorPopupSize([620,540],'width=9999,height=10',area),{width:1200,height:240});
  assert.deepEqual(inspectorPopupSize(['bad',540],'width=0',area),{width:500,height:650});
});

test('compatibility dial rotation preserves signed ticks and held state, rejects unsupported gestures',()=>{
  const host=new StreamDeckPluginHost('/unused');
  const uuid='com.deckforge.test.dial',context='dial',ws={readyState:1};
  host.contexts.set(context,{pluginUUID:uuid,actionUUID:uuid+'.key',slot:16,gesture:'left',settings:{}});
  host.instances.set(uuid,{uuid,ws});
  const sent=[];host.send=(_ws,msg)=>{sent.push(msg);return true;};
  assert.equal(host.key(context,'left',3),true);
  assert.equal(host.key(context,'hold-right',2),true);
  assert.equal(host.key(context,'down'),true);
  assert.equal(host.key(context,'right',4),true);
  assert.equal(host.key(context,'up'),true);
  assert.equal(host.key(context,'hold-left',1),true);
  assert.equal(host.key(context,'left',0),false);
  assert.equal(host.key(context,'left',33),false);
  assert.equal(host.key(context,'tap'),false);
  assert.deepEqual(sent.map(m=>[m.event,m.payload.ticks,m.payload.pressed]),[
    ['dialRotate',-3,false],['dialRotate',2,true],['dialDown',undefined,undefined],
    ['dialRotate',4,true],['dialUp',undefined,undefined],['dialRotate',-1,true]]);
});
test('external SDK context messages cannot cross plugin or inspector ownership',async()=>{
  const updates=[],sent=[],host=new StreamDeckPluginHost('/unused',e=>updates.push(e));
  const a='com.deckforge.test.alpha',b='com.deckforge.test.beta',wa={},wb={},pa={};
  host.contexts.set('a',{context:'a',pluginUUID:a,actionUUID:a+'.key',slot:0,settings:{value:1}});
  host.contexts.set('b',{context:'b',pluginUUID:b,actionUUID:b+'.key',slot:1,settings:{secret:2}});
  host.instances.set(a,{uuid:a,ws:wa});host.instances.set(b,{uuid:b,ws:wb});
  const pi={pluginUUID:a,context:'a',ws:pa};host.inspectors.set('a',pi);
  host.send=(ws,msg)=>{sent.push([ws,msg]);return true;};
  for(const event of ['getSettings','setSettings','sendToPlugin','sendToPropertyInspector','showAlert','showOk','setTitle'])
    await host.message({event,context:'b',payload:{value:9}}, {uuid:a},null,wa);
  assert.equal(sent.length,0);assert.equal(updates.length,0);
  assert.deepEqual(host.contexts.get('b').settings,{secret:2});
  await host.message({event:'getSettings',context:'a'},null,pi,pa);
  await host.message({event:'sendToPlugin',context:'a',payload:{value:7}},null,pi,pa);
  await host.message({event:'sendToPropertyInspector',context:'a',payload:{value:8}},{uuid:a},null,wa);
  assert.deepEqual(sent.map(([ws,msg])=>[ws,msg.event]),[[pa,'didReceiveSettings'],[wa,'sendToPlugin'],[pa,'sendToPropertyInspector']]);
});
test('Windows EXE registers over real WebSocket and responds to key and held dial events', {skip:process.platform!=='win32',timeout:45000},async()=>{
  const {execFileSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-exe-roundtrip-'));
  const uuid='com.deckforge.test.exeroundtrip',key=uuid+'.key',dial=uuid+'.dial',events=[];
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  let prompts=0;
  const host=new StreamDeckPluginHost(root,e=>events.push(e),()=>null,{executableStorage:storage,executableApprove:async()=>{prompts++;return true;}});
  try{
    const source=path.join(root,'fixture.cs'),exe=path.join(root,'fixture.exe');
    await fs.writeFile(source,[
      'using System; using System.Collections.Generic; using System.Net.WebSockets; using System.Text; using System.Threading; using System.Web.Script.Serialization;',
      'public class Fixture { static ClientWebSocket ws=new ClientWebSocket(); static JavaScriptSerializer js=new JavaScriptSerializer();',
      'static void Send(object message){var bytes=Encoding.UTF8.GetBytes(js.Serialize(message)); ws.SendAsync(new ArraySegment<byte>(bytes),WebSocketMessageType.Text,true,CancellationToken.None).GetAwaiter().GetResult();}',
      'public static void Main(string[] args){var options=new Dictionary<string,string>();for(int i=0;i+1<args.Length;i+=2)options[args[i]]=args[i+1];',
      'ws.ConnectAsync(new Uri("ws://127.0.0.1:"+options["-port"]),CancellationToken.None).GetAwaiter().GetResult();',
      'Send(new { @event=options["-registerEvent"],uuid=options["-pluginUUID"] });',
      'bool device=false;var buf=new byte[65536];while(ws.State==WebSocketState.Open){var r=ws.ReceiveAsync(new ArraySegment<byte>(buf),CancellationToken.None).GetAwaiter().GetResult();if(r.MessageType==WebSocketMessageType.Close)break;',
      'var m=js.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(buf,0,r.Count));string e=(string)m["event"];',
      'if(e=="deviceDidConnect")device=true;',
      'if(e=="keyDown"||e=="dialRotate"){var p=(Dictionary<string,object>)m["payload"];string title=e=="keyDown"?(device?"EXE_DEVICE_OK":"NO_DEVICE"):(Convert.ToBoolean(p["pressed"])?"HELD:":"FREE:")+p["ticks"];',
      'Send(new {@event="setTitle",context=m["context"],payload=new {title=title}});}}}}'
    ].join('\n'));
    const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
    execFileSync(compiler,['/nologo','/target:exe','/r:System.Web.Extensions.dll','/out:'+exe,source],{windowsHide:true,timeout:10000});
    const m={UUID:uuid,Name:'EXE roundtrip',Version:'1.0.0',CodePath:'fixture.exe',Actions:[{UUID:key,Name:'Key'},{UUID:dial,Name:'Dial',Controllers:['Encoder']}]};
    const prefix=uuid+'.sdPlugin/';
    await host.install(await zipWith({[prefix+'manifest.json']:JSON.stringify(m),[prefix+'fixture.exe']:await fs.readFile(exe)}));
    assert.equal(prompts,0);
    await host.sync([{context:'key',slot:0,pluginUUID:uuid,actionUUID:key,settings:{}},{context:'dial',slot:16,pluginUUID:uuid,actionUUID:dial,settings:{}}]);
    const until=async predicate=>{const deadline=Date.now()+10000;while(!predicate()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.ok(predicate(),'EXE registration or response missing');};
    await until(()=>!!host.instances.get(uuid)?.ws);
    assert.equal(prompts,1);
    assert.equal(host.key('key','down'),true);
    assert.equal(host.key('dial','hold-left',3),true);
    await until(()=>events.some(e=>e.kind==='setTitle'&&e.payload?.title==='EXE_DEVICE_OK')&&events.some(e=>e.kind==='setTitle'&&e.payload?.title==='HELD:-3'));
    const grant=await host.executablePermissionInfo(uuid);
    await host.setExecutablePermission(uuid,grant.revision,false);
    assert.equal(host.instances.has(uuid),false);
    assert.equal(await host.authorizeExecutable(uuid),false);assert.equal(prompts,1);
  }finally{await host.close();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('original Ulanzi Node host runs unmodified entry with V3.1 registration and isolated action contexts', {timeout:30000},async()=>{
  const {UlanziNodeHost,validateOriginalNodeManifest}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-node-'));
  const uuid='com.ulanzi.ulanzistudio.fixture',key=uuid+'.key',dial=uuid+'.dial',updates=[];
  const manifest={UUID:uuid,Name:'Original fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.cjs',PrivateAPI:true,
    Actions:[{UUID:key,Name:'Key',States:[{},{}]},{UUID:dial,Name:'Dial',Controllers:['Encoder']}]};
  const source=[
    "const [address,port,language]=process.argv.slice(2);",
    "const ws=new WebSocket('ws://'+address+':'+port);",
    "const send=m=>ws.send(JSON.stringify(m));",
    "ws.addEventListener('open',()=>send({cmd:'connected',uuid:"+JSON.stringify(uuid)+",code:0}));",
    "ws.addEventListener('message',event=>{",
    "const m=JSON.parse(event.data);if(m.code!==undefined)return;",
    "const {uuid,key,actionid}=m;const param={uuid,key,actionid};",
    "if(m.cmd==='add')send({cmd:'setTitle',param:{...param,text:'ADD:'+language}});",
    "if(m.cmd==='keydown'){send({cmd:'setSettings',...param,settings:{value:7}});send({cmd:'getSettings',...param});send({cmd:'setTitle',param:{...param,text:'KEY'}});send({cmd:'setTitle',param:{...param,actionid:'invalid',text:'FORGED'}});}",
    "if(m.cmd==='didReceiveSettings')send({cmd:'setState',param:{...param,state:1}});",
    "if(m.cmd==='dialrotate')send({cmd:'setTitle',param:{...param,text:m.rotateEvent}});",
    "if(m.cmd==='run')send({cmd:'unknownPrivateApi',...param});",
    "});"
  ].join('\n');
  const host=new UlanziNodeHost(root,e=>updates.push(e));
  const until=async predicate=>{const end=Date.now()+10000;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,25));assert.ok(predicate(),'Ulanzi protocol response missing');};
  try{
    validateOriginalNodeManifest(manifest);
    assert.throws(()=>validateOriginalNodeManifest({...manifest,CodePath:'../main.cjs'}),/manifest/);
    await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
    await fs.writeFile(path.join(root,'main.cjs'),source);
    await assert.rejects(host.start(),/approval required/);
    assert.equal(host.child,null);
    await host.start({approved:true});
    const configs=[{context:'key',pluginUUID:uuid,actionUUID:key,slot:0,settings:{}},{context:'dial',pluginUUID:uuid,actionUUID:dial,slot:16,gesture:'hold-left',settings:{}}];
    host.sync(configs);
    await until(()=>updates.some(e=>e.kind==='setTitle'&&e.context==='key'&&e.payload.title==='ADD:ko'));
    assert.equal(host.key('key','down'),true);
    assert.equal(host.key('key','up'),true);
    assert.equal(host.key('dial','hold-left',2),true);
    await until(()=>updates.some(e=>e.kind==='settings'&&e.context==='key'&&e.settings.value===7)&&updates.some(e=>e.kind==='setState'&&e.context==='key'&&e.payload.state===1)&&updates.filter(e=>e.kind==='setTitle'&&e.context==='dial'&&e.payload.title==='hold-left').length===2&&updates.some(e=>e.kind==='unsupportedUlanziCommand'&&e.command==='unknownPrivateApi'));
    assert.equal(updates.some(e=>e.payload?.title==='FORGED'),false);
    const before=host.mounts.get('key').actionid;
    host.sync([{...configs[0],mountGeneration:2}]);
    assert.notEqual(host.mounts.get('key').actionid,before);
    assert.equal(host.key('dial','left'),false);
    assert.equal(await fs.readFile(path.join(root,'main.cjs'),'utf8'),source);
  }finally{await host.close();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('Ulanzi original installer preserves files and binds execution to approved package revision', {timeout:30000},async()=>{
  const {UlanziOriginalStore}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-original-'));
  const source=path.join(root,'source.ulanziPlugin'),userData=path.join(root,'userdata');
  const id='com.ulanzi.ulanzistudio.installfixture',action=id+'.key',updates=[];
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  const manifest={UUID:id,Name:'Original fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.cjs',PrivateAPI:true,Actions:[{UUID:action,Name:'Key'}]};
  const script="const [address,port]=process.argv.slice(2);const ws=new WebSocket('ws://'+address+':'+port);ws.addEventListener('open',()=>ws.send(JSON.stringify({cmd:'connected',code:0,uuid:"+JSON.stringify(id)+"})));";
  let store=new UlanziOriginalStore(userData,{storage});
  try{
    await fs.mkdir(source);await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(manifest));
    await fs.writeFile(path.join(source,'main.cjs'),script);
    await fs.mkdir(path.join(source,'assets'));await fs.writeFile(path.join(source,'assets','data.txt'),'original');
    const plan=await store.inspect(source);
    assert.equal(plan.fileCount,3);assert.equal(plan.manifest.PrivateAPI,true);
    await assert.rejects(store.install(source,'0'.repeat(64)),/package changed/);
    const result=await store.install(source,plan.revision);assert.equal(result.revision,plan.revision);
    assert.equal(await fs.readFile(path.join(store.directory(id),'main.cjs'),'utf8'),script);
    await assert.rejects(store.install(source,plan.revision),/already installed/);
    await assert.rejects(store.startApproved(id),/approval required/);
    await store.setPermission(id,plan.revision,false);assert.equal((await store.info(id)).decided,true);
    await assert.rejects(store.startApproved(id),/approval required/);
    await store.setPermission(id,plan.revision,true);
    await store.close();store=new UlanziOriginalStore(userData,{storage});
    assert.equal((await store.info(id)).approved,true);
    const host=await store.startApproved(id,e=>updates.push(e));
    const deadline=Date.now()+10000;
    while(!host.socket&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
    assert.ok(host.socket,'approved original runtime registration missing');
    assert.equal(await store.startApproved(id),host);
    await store.setPermission(id,plan.revision,false);
    assert.equal(host.closed,true);assert.equal(store.active.size,0);
    await fs.writeFile(path.join(store.directory(id),'assets','data.txt'),'changed');
    assert.equal((await store.info(id)).decided,false);
    await assert.rejects(store.setPermission(id,plan.revision,true),/package changed/);
    await assert.rejects(store.startApproved(id),/approval required/);
    assert.equal(await fs.readFile(path.join(source,'assets','data.txt'),'utf8'),'original');
    assert.equal(await fs.readFile(path.join(source,'main.cjs'),'utf8'),script);
  }finally{await store.close();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('editor routes only approved original Ulanzi mounts without affecting existing hosts', {timeout:30000},async()=>{
  const {UlanziOriginalStore}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const {UlanziEditorHost}=require('../app/deckforge-editor/ulanzi-editor-host.cjs');
  const {PluginRouter}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-editor-')),source=path.join(root,'source.ulanziPlugin');
  const id='com.ulanzi.ulanzistudio.editorfixture',action=id+'.key',events=[],legacyCalls=[],nativeCalls=[];
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  const store=new UlanziOriginalStore(path.join(root,'userData'),{storage});
  const original=new UlanziEditorHost(store,e=>events.push(e));
  const legacy={list:async()=>[{uuid:'com.legacy.example',actions:[]}],retireUnmatched(){},sync:async c=>legacyCalls.push(c),key:()=>true,onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
  const native={contexts:new Map(),manifests:async()=>[],loadServicePolicy:async()=>{},sync:c=>nativeCalls.push(c),suspend(){},resume(){},close(){}};
  const router=new PluginRouter(legacy,native,original);
  const fixture={UUID:id,Name:'Original editor fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.cjs',Actions:[{UUID:action,Name:'Key'}]};
  const script="const [address,port]=process.argv.slice(2);const ws=new WebSocket('ws://'+address+':'+port);ws.addEventListener('open',()=>ws.send(JSON.stringify({cmd:'connected',code:0,uuid:"+JSON.stringify(id)+"})));ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.cmd==='keydown'&&m.code===undefined)ws.send(JSON.stringify({cmd:'setTitle',param:{uuid:m.uuid,key:m.key,actionid:m.actionid,text:'ROUTED'}}));});";
  const mount={context:'original-key',instanceId:'original-key-id',mountGeneration:1,configRevision:0,slot:0,gesture:'down',pluginUUID:id,actionUUID:action,settings:{}};
  const old={context:'legacy-key',slot:1,pluginUUID:'com.legacy.example',actionUUID:'com.legacy.example.key',settings:{}};
  const until=async predicate=>{const end=Date.now()+10000;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,25));assert.ok(predicate(),'editor original response missing');};
  try{
    await fs.mkdir(source);await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(fixture));await fs.writeFile(path.join(source,'main.cjs'),script);
    const plan=await store.inspect(source),installed=await router.installOriginal(source,plan.revision);
    assert.equal(installed.runtime,'ulanzi-original');assert.equal((await router.list()).find(p=>p.uuid===id).actions[0].uuid,action);
    // A missing catalogue record must never be acknowledged as installation success.
    const originalList=original.list.bind(original);original.list=async()=>[];
    const hiddenId='com.ulanzi.ulanzistudio.hiddenfixture',hiddenDir=path.join(root,'hidden.ulanziPlugin');
    await fs.mkdir(hiddenDir);await fs.writeFile(path.join(hiddenDir,'manifest.json'),JSON.stringify({...fixture,UUID:hiddenId,Actions:[{UUID:hiddenId+'.key',Name:'Key'}]}));await fs.writeFile(path.join(hiddenDir,'main.cjs'),script);
    try{const hiddenPlan=await store.inspect(hiddenDir);await assert.rejects(router.installOriginal(hiddenDir,hiddenPlan.revision),/액션 목록 등록 실패/);assert.equal((await fs.stat(store.directory(hiddenId))).isDirectory(),true);}finally{original.list=originalList;}
    await router.sync([mount,old]);assert.equal(router.key(mount.context,'down'),false);assert.equal(store.active.size,0);
    assert.deepEqual(legacyCalls.at(-1),[old]);assert.deepEqual(nativeCalls.at(-1),[]);
    await store.setPermission(id,plan.revision,true);await router.sync([mount,old]);
    await until(()=>!!store.active.get(id)?.socket);
    assert.equal(router.key(mount.context,'down'),true);
    await until(()=>events.some(e=>e.kind==='setTitle'&&e.payload?.title==='ROUTED'));
    router.onSystemSuspend();assert.equal(router.key(mount.context,'down'),false);await original.queue;assert.equal(store.active.size,0);
    router.onSystemResume();await router.sync([mount,old]);await until(()=>!!store.active.get(id)?.socket);
    assert.equal(router.key(mount.context,'down'),true);
    await store.setPermission(id,plan.revision,false);assert.equal(router.key(mount.context,'down'),false);
    await router.sync([old]);assert.equal(router.key(mount.context,'down'),false);assert.equal(router.key(old.context,'down'),true);
  }finally{await router.close();await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
});

test('Ulanzi runtime images support per-state defaults, temporary override and clear',async()=>{
  const {applyImage,currentImage,base64Image,pathImage}=require('../app/deckforge-editor/ulanzi-original-image.cjs');
  const {crc32,deflateSync}=require('node:zlib');
  function png(red){
    const chunk=(type,data)=>{const h=Buffer.alloc(8);h.writeUInt32BE(data.length);h.write(type,4);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([h.subarray(4),data])));return Buffer.concat([h,data,crc]);};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,red,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
  }
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-image-'));
  try{
    const a=png(10),b=png(20),c=png(30),data=x=>'data:image/png;base64,'+x.toString('base64');
    await fs.writeFile(path.join(root,'off.png'),a);await fs.writeFile(path.join(root,'on.png'),b);
    const action={States:[{Image:'off.png'},{Image:'on.png'}]};
    let v={state:0,temporary:null,defaults:new Map()};
    assert.equal(currentImage(root,action,v),data(a));
    v=applyImage(root,action,v,{isDefault:true,icons:[{state:1,source:'base64',base64:data(c)}]});
    v.state=1;assert.equal(currentImage(root,action,v),data(c));
    v=applyImage(root,action,v,{isDefault:false,icons:{source:'path',path:'./off.png'}});
    assert.equal(currentImage(root,action,v),data(a));
    v=applyImage(root,action,v,{clear:true});assert.equal(currentImage(root,action,v),data(b));
    assert.equal(pathImage(root,'../off.png'),null);assert.equal(base64Image('invalid'),null);
    assert.throws(()=>applyImage(root,action,v,{isDefault:true,icons:[{state:9,source:'clear'}]}),/invalid image state/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Ulanzi global settings persist separately and reject stale or unreadable writes',async()=>{
  const {UlanziOriginalStore}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-global-'));
  const id='com.ulanzi.ulanzistudio.globalfixture';
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  const store=new UlanziOriginalStore(root,{storage}),host=new UlanziNodeHost(root);
  try{
    host.manifest={UUID:id};const ws={readyState:1},messages=[];host.socket=ws;
    host.send=(m,target)=>{messages.push(m);return true;};
    host.globalWrite=(v,active)=>store.writeGlobal(id,v,active);
    host.receive({cmd:'setGlobalSettings',uuid:id,settings:{value:'fixture'}},ws);
    await host.globalQueue;
    assert.deepEqual(await store.readGlobal(id),{value:'fixture'});
    assert.equal(messages.at(-1).cmd,'didReceiveGlobalSettings');
    host.receive({cmd:'getGlobalSettings',uuid:id},ws);await host.globalQueue;
    assert.deepEqual(messages.at(-1).settings,{value:'fixture'});
    assert.equal(await store.writeGlobal(id,{value:'stale'},()=>false),false);
    await fs.writeFile(store.globalFile(id),'corrupt');
    await assert.rejects(store.writeGlobal(id,{value:'overwrite'},()=>true));
    assert.equal(await fs.readFile(store.globalFile(id),'utf8'),'corrupt');
  }finally{host.socket=null;await host.close();await store.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Ulanzi original dialog options and request ownership, result and cancellation',async()=>{
  const {pickerOptions,viewOptions}=require('../app/deckforge-editor/ulanzi-original-dialog.cjs');
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  assert.deepEqual(pickerOptions({type:'file',filter:'image(*.jpg *.png);;file(*.txt)'},'Pick'),{title:'Pick',properties:['openFile'],filters:[{name:'image',extensions:['jpg','png']},{name:'file',extensions:['txt']}]});
  assert.deepEqual(pickerOptions({type:'folder'},'Pick'),{title:'Pick',properties:['openDirectory']});
  assert.throws(()=>pickerOptions({type:'file',filter:'bad(C:\\*)'},'Pick'));
  assert.deepEqual(viewOptions({url:'./views/help.html',width:400,height:'320',x:0,param:{lang:'ko'}}),{entry:'views/help.html',params:{lang:'ko'},width:400,height:320,x:0,y:undefined});
  for(const url of ['../other.html','C:/test.html','https://example.com/x.html','//remote/x.html'])assert.throws(()=>viewOptions({url}));
  const host=new UlanziNodeHost('/unused'),id='com.ulanzi.ulanzistudio.dialogfixture',ws={readyState:1},sent=[];
  host.manifest={UUID:id,Name:'Fixture',Actions:[]};host.socket=ws;host.alive=()=>true;host.getParent=()=>({isDestroyed:()=>false});
  host.send=(m,target)=>{sent.push([m,target]);return true;};
  let finish,picks=0;
  host.pickDialog=()=>{picks++;return new Promise(resolve=>{finish=resolve;});};
  const request={cmd:'selectdialog',uuid:id,type:'file',filter:'file(*.txt)'};
  const tick=()=>new Promise(r=>setImmediate(r));
  host.receive(request,ws);await tick();assert.equal(picks,1);
  host.receive(request,ws);assert.equal(sent.at(-1)[0].code,1);
  finish({canceled:false,filePaths:['C:\\Music\\a.txt']});await tick();
  assert.deepEqual(sent.at(-1),[{cmd:'selectdialog',cmdType:'REQUEST',code:0,uuid:id,key:'',actionid:'',type:'file',path:'C:/Music/a.txt'},ws]);
  host.receive({...request,type:'folder'},ws);await tick();finish({canceled:true,filePaths:[]});await tick();assert.equal(sent.at(-1)[0].path,'');
  host.receive({...request,uuid:'wrong'},ws);await tick();assert.equal(picks,2);
  host.receive(request,ws);await tick();const count=sent.length;host.socket=null;finish({canceled:false,filePaths:['C:\\stale.txt']});await tick();assert.equal(sent.length,count);
  await host.close();
});

test('Ulanzi original JPEG WebP and GIF playback reuse bounded bitmap pipeline',async()=>{
  const {base64Image,rasterDimensions}=require('../app/deckforge-editor/ulanzi-original-image.cjs');
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const jpeg='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z',webp='UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=',gif='R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBMgABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7';
  assert.deepEqual(rasterDimensions(Buffer.from(jpeg,'base64')),{mime:'jpeg',width:2,height:2});
  assert.deepEqual(rasterDimensions(Buffer.from(webp,'base64')),{mime:'webp',width:2,height:2});
  assert.equal(base64Image(jpeg),'data:image/jpeg;base64,'+jpeg);
  assert.equal(base64Image(webp),'data:image/webp;base64,'+webp);
  assert.equal(base64Image(gif),'data:image/gif;base64,'+gif);
  assert.equal(base64Image(webp.slice(0,-12)),null);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-original-gif-'));
  const id='com.ulanzi.ulanzistudio.giffixture',action=id+'.key',events=[],host=new UlanziNodeHost(root,e=>events.push(e)),ws={readyState:1,send(){}};
  try{
    await fs.writeFile(path.join(root,'anim.gif'),Buffer.from(gif,'base64'));
    host.manifest={UUID:id,Actions:[{UUID:action,Name:'Key'}]};host.socket=ws;
    host.sync([{context:'gif',slot:0,pluginUUID:id,actionUUID:action,settings:{}}]);
    const address=host.address(host.mounts.get('gif'));let now=0;host.animations.now=()=>now;
    host.receive({cmd:'state',param:{statelist:[{...address,type:4,gifpath:'anim.gif'}]}},ws);
    const first=events.at(-1).payload.image;assert.match(first,/^data:image\/png;base64,/);
    now=500;host.animations.tick();assert.notEqual(events.at(-1).payload.image,first);
    host.receive({cmd:'setImage',param:{...address,icons:{source:'base64',base64:webp}}},ws);
    assert.equal(host.animations.entries.size,0);assert.equal(events.at(-1).payload.image,'data:image/webp;base64,'+webp);
    host.receive({cmd:'state',param:{statelist:[{...address,type:3,gifdata:gif}]}},ws);
    assert.equal(host.animations.entries.size,1);host.sync([]);assert.equal(host.animations.entries.size,0);
  }finally{host.socket=null;await host.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Ulanzi encoder feedback maps current $UA1 title and icon to only its own knob column',async()=>{
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const core=require('../app/deckforge-editor/deck-core.js');
  const {crc32,deflateSync}=require('node:zlib');
  const chunk=(type,data)=>{const h=Buffer.alloc(8);h.writeUInt32BE(data.length);h.write(type,4);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([h.subarray(4),data])));return Buffer.concat([h,data,c]);};
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(1,0);hdr.writeUInt32BE(1,4);hdr[8]=8;hdr[9]=6;
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',hdr),chunk('IDAT',deflateSync(Buffer.from([0,50,60,70,255]))),chunk('IEND',Buffer.alloc(0))]);
  const icon='data:image/png;base64,'+png.toString('base64');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-feedback-'));
  const id='com.ulanzi.ulanzistudio.feedbackfixture',action=id+'.dial',key=id+'.key',updates=[],sent=[];
  const host=new UlanziNodeHost(root,e=>updates.push(e)),ws={readyState:1,send:raw=>sent.push(JSON.parse(raw))};
  const mounts=[{context:'first',slot:16,gesture:'left',pluginUUID:id,actionUUID:action,settings:{}},{context:'second',slot:16,gesture:'right',pluginUUID:id,actionUUID:action,settings:{}},{context:'key',slot:0,pluginUUID:id,actionUUID:key,settings:{}}];
  try{
    await fs.writeFile(path.join(root,'icon.png'),png);
    host.manifest={UUID:id,Actions:[{UUID:action,Name:'Dial',Controllers:['Encoder']},{UUID:key,Name:'Key'}]};host.socket=ws;
    host.sync(mounts);
    const send=(context,cmd,layout)=>host.receive({cmd,...host.address(host.mounts.get(context)),layout},ws);
    send('first','setFeedbackLayout','$UA1');
    send('first','setFeedback',{title:{text:'Ready'},icon:{value:'icon.png'}});
    assert.deepEqual(updates.at(-1).payload,{layout:'$UA1',title:'Ready',icon});
    send('first','setFeedback',{title:{text:'45%'}});
    assert.deepEqual(updates.at(-1).payload,{layout:'$UA1',title:'45%',icon});
    send('first','setFeedbackLayout','custom-layout.json');assert.equal(sent.at(-1).code,1);
    send('key','setFeedback',{title:{text:'Denied'}});assert.equal(sent.at(-1).code,1);
    send('first','setFeedback',{icon:{value:'../outside.png'}});assert.equal(sent.at(-1).code,1);
    send('second','setFeedback',{title:{text:'Second'}});
    const visuals=new Map();let sequence=0;
    for(const e of updates.filter(e=>e.kind==='ulanziFeedback'))visuals.set(e.context,{feedback:{...e.payload,sequence:++sequence}});
    const plugins=[{uuid:id,runtime:'ulanzi-original'}];
    assert.deepEqual(core.originalKnobFeedback(16,mounts,visuals,plugins),{title:'Second'});
    assert.equal(core.originalKnobFeedback(17,mounts,visuals,plugins),null);
    assert.deepEqual(core.originalKnobFeedback(16,mounts.filter(m=>m.context!=='second'),visuals,plugins),{title:'45%',icon});
    assert.equal(core.originalKnobFeedback(16,[],visuals,plugins),null);
    host.sync([]);assert.equal(host.feedback.size,0);
  }finally{host.socket=null;await host.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Ulanzi openurl respects one-use input, confirmation, scope and diagnostic privacy',async()=>{
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const {externalUrl}=require('../app/deckforge-editor/ulanzi-original-dialog.cjs');
  assert.equal(externalUrl({url:'https://example.com/help',param:{q:'a b'}}),'https://example.com/help?q=a+b');
  for(const url of ['file:///C:/test','javascript:alert(1)','https://user:password@example.com/'])assert.throws(()=>externalUrl({url}));
  const id='com.ulanzi.ulanzistudio.linkfixture',action=id+'.key',sent=[],updates=[],opened=[],ws={readyState:1,send:raw=>sent.push(JSON.parse(raw))};
  const host=new UlanziNodeHost('/unused',e=>updates.push(e));
  host.manifest={UUID:id,Name:'Fixture',Actions:[{UUID:action,Name:'Key'}]};
  host.socket=ws;host.alive=()=>true;host.getParent=()=>({isDestroyed:()=>false});
  let confirms=0,choice=0;
  host.confirmExternal=async()=>{confirms++;return {response:choice};};
  host.openExternal=async href=>opened.push(href);
  const tick=()=>new Promise(r=>setImmediate(r));
  try{
    host.sync([{context:'key',slot:0,pluginUUID:id,actionUUID:action,settings:{}}]);
    const request={cmd:'openurl',uuid:id,url:'https://example.com/',local:false};
    host.receive(request,ws);await tick();assert.equal(confirms,1);assert.equal(opened.length,0);
    assert.equal(host.key('key','down'),true);
    host.receive(request,ws);await tick();assert.equal(confirms,1);assert.deepEqual(opened,['https://example.com/']);
    host.receive(request,ws);await tick();assert.equal(confirms,2);assert.equal(opened.length,1);
    choice=1;host.receive(request,ws);await tick();assert.equal(opened.length,2);
    host.receive({...request,uuid:'wrong'},ws);await tick();assert.equal(opened.length,2);
    host.receive({cmd:'toast',uuid:id,msg:'Ready'},ws);assert.equal(updates.at(-1).message,'Ready');
    host.receive({cmd:'logMessage',uuid:id,level:'warn',message:'secret fixture'},ws);
    const address=host.address(host.mounts.get('key'));
    host.receive({cmd:'unknownPrivateApi',...address,param:{secret:'private fixture'}},ws);
    assert.deepEqual(host.diagnosticSummary(),[{key:'warn:logMessage',count:1},{key:'unsupported:unknownPrivateApi',count:1}]);
    assert.ok(!JSON.stringify(host.diagnosticSummary()).includes('secret'));
    assert.equal(sent.at(-1).code,1);
  }finally{host.socket=null;await host.close();}
});

test('Ulanzi hotkey routes official keylist to Windows sender only for current input',async()=>{
  const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
  const id='com.ulanzi.ulanzistudio.hotkeyfixture',action=id+'.key',sent=[],keys=[];
  const ws={readyState:1,send:raw=>sent.push(JSON.parse(raw))},host=new UlanziNodeHost('/unused');
  host.manifest={UUID:id,Name:'Fixture',Actions:[{UUID:action,Name:'Key'}]};
  host.socket=ws;host.alive=()=>true;
  host.sendHotkey=async key=>{keys.push(key);return key!=='F2';};
  const request={cmd:'hotkey',uuid:id,keylist:'Ctrl+C'};
  const tick=()=>new Promise(r=>setImmediate(r));
  const mount={context:'key',slot:0,pluginUUID:id,actionUUID:action,settings:{}};
  try{
    host.sync([mount]);host.receive(request,ws);await tick();assert.equal(keys.length,0);assert.equal(sent.at(-1).code,1);
    host.key('key','down');host.receive({...request,keylist:'Ctrl++C'},ws);await tick();assert.equal(keys.length,0);
    host.receive({...request,uuid:'foreign'},ws);await tick();assert.equal(keys.length,0);
    host.receive(request,ws);await tick();assert.deepEqual(keys,['Ctrl+C']);assert.equal(sent.at(-1).code,0);
    host.receive(request,ws);await tick();assert.equal(keys.length,1);assert.equal(sent.at(-1).code,1);
    host.key('key','up');host.receive({...request,keylist:'F2'},ws);await tick();assert.equal(sent.at(-1).code,1);
    host.key('key','down');host.hotkeyGrant.expires=Date.now()-1;host.receive(request,ws);await tick();assert.equal(keys.length,2);
    host.key('key','down');host.receive(request,ws);host.sync([]);await tick();assert.equal(keys.length,2,'retired action must not send');
    host.sync([mount]);host.receive(request,ws);await tick();assert.equal(keys.length,2);
  }finally{host.socket=null;await host.close();}
});

 test('Ulanzi unregistered inspector returns only draft settings and cancels on revocation',async()=>{
  const {UlanziOriginalStore}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const {EventEmitter}=require('node:events');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-original-draft-'));
  const id='com.ulanzi.ulanzistudio.draftfixture',action=id+'.key';
  let approved=true,created=0,opened=0,host,win;
  const store=new UlanziOriginalStore(root,{hostFactory:()=>{
    created++;host={closed:false,mounts:new Map(),socket:null,alive(){return !this.closed;},
      async start({verifyBeforeSpawn}){assert.equal(await verifyBeforeSpawn(),true);this.socket={};},
      sync(configs){this.mounts=new Map(configs.map(c=>[c.context,c]));},
      async openInspector(context){opened++;this.mounts.get(context).settings={edited:opened};win=new EventEmitter();win.isDestroyed=()=>win.destroyed===true;win.destroy=()=>{if(!win.destroyed){win.destroyed=true;win.emit('closed');}};return win;},
      async close(){this.closed=true;win?.destroy();}};
    return host;
  }});
  store.info=async()=>({approved,revision:'fixture',manifest:{Actions:[{UUID:action,PropertyInspectorPath:'pi.html'}]}});
  store.readGlobal=async()=>({kept:true});
  const until=async n=>{for(let i=0;i<100&&opened<n;i++)await new Promise(r=>setTimeout(r,10));assert.equal(opened,n);};
  try{
    approved=false;await assert.rejects(store.editDraft(id,action,0,{}),/권한/);assert.equal(created,0);approved=true;
    const existing={};store.active.set(id,existing);
    const pending=store.editDraft(id,action,0,{initial:true});await until(1);
    assert.equal(store.active.get(id),existing);assert.equal(host.globalWrite,null);assert.equal(await host.sendHotkey('Ctrl+C'),false);
    await assert.rejects(store.editDraft(id,action,0,{}),/busy/);
    win.destroy();assert.deepEqual(await pending,{status:'submitted',settings:{edited:1}});assert.equal(store.draft,null);
    const cancelled=store.editDraft(id,action,0,{});await until(2);await store.cancelDraft(id);assert.deepEqual(await cancelled,{status:'cancelled'});
    const revoked=store.editDraft(id,action,0,{});await until(3);approved=false;win.destroy();assert.deepEqual(await revoked,{status:'cancelled'});
    assert.equal(store.active.get(id),existing);
  }finally{store.active.clear();await store.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Ulanzi original removal and restoration preserve exact package and encrypted settings',async()=>{
  const {UlanziOriginalStore}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-original-retained-'));
  const id='com.ulanzi.ulanzistudio.retainedfixture',source=path.join(root,'source');
  const storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  const store=new UlanziOriginalStore(path.join(root,'data'),{storage});
  try{
    await fs.mkdir(source);await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify({UUID:id,Name:'Fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.cjs',Actions:[{UUID:id+'.key',Name:'Key'}]}));await fs.writeFile(path.join(source,'main.cjs'),'// exact original');
    const plan=await store.inspect(source);await store.install(source,plan.revision);await store.setPermission(id,plan.revision,true);
    await store.writeGlobal(id,{kept:true},()=>true);const bytes=await fs.readFile(store.globalFile(id));
    let stopped=0;store.active.set(id,{async close(){stopped++;}});
    await assert.rejects(store.removeKeepingData(id,'bad'),/revision/);assert.equal(stopped,0);
    await store.removeKeepingData(id,plan.revision);assert.equal(stopped,1);assert.equal((await store.list()).length,0);
    const retained=await store.retainedRecord(id);assert.equal(retained.revision,plan.revision);assert.equal((await store.listRetained())[0].available,true);
    await assert.rejects(store.install(source,plan.revision),/retained/);
    await fs.writeFile(path.join(retained.directory,'main.cjs'),'tampered');
    assert.equal((await store.listRetained())[0].available,false);
    await assert.rejects(store.restoreRetained(id,plan.revision),/revision/);
    await fs.writeFile(path.join(retained.directory,'main.cjs'),'// exact original');
    await store.restoreRetained(id,plan.revision);
    assert.equal((await store.info(id)).approved,false);assert.equal((await store.listRetained()).length,0);
    assert.deepEqual(await fs.readFile(store.globalFile(id)),bytes);assert.deepEqual(await store.readGlobal(id),{kept:true});
    assert.equal(await fs.readFile(path.join(store.directory(id),'main.cjs'),'utf8'),'// exact original');
    assert.equal(await fs.readFile(path.join(source,'main.cjs'),'utf8'),'// exact original');
    await assert.rejects(store.startApproved(id),/approval required/);
  }finally{await store.close();await fs.rm(root,{recursive:true,force:true});}
});

test('portable Ulanzi original package backup validates files and restores without execution approval',async()=>{
  const {UlanziOriginalStore,parseOriginalBackup}=require('../app/deckforge-editor/ulanzi-original-store.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-original-portable-')),source=path.join(root,'source');
  const id='com.ulanzi.ulanzistudio.backupfixture',storage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()};
  const a=new UlanziOriginalStore(path.join(root,'a'),{storage}),b=new UlanziOriginalStore(path.join(root,'b'),{storage});
  try{
    await fs.mkdir(path.join(source,'assets'),{recursive:true});await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify({UUID:id,Name:'Fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.cjs',Actions:[{UUID:id+'.key',Name:'Key'}]}));
    await fs.writeFile(path.join(source,'main.cjs'),'// original');await fs.writeFile(path.join(source,'assets','bytes.bin'),Buffer.from([0,255,128]));
    const plan=await a.inspect(source);await a.install(source,plan.revision);await a.setPermission(id,plan.revision,true);await a.writeGlobal(id,{secret:'private-fixture'},()=>true);
    const pack=await a.exportBackup(id);assert.equal(parseOriginalBackup(pack.bytes).revision,plan.revision);assert.ok(!pack.bytes.toString().includes('private-fixture'));
    const raw=JSON.parse(pack.bytes);raw.files[0].path='../escape';assert.throws(()=>parseOriginalBackup(Buffer.from(JSON.stringify(raw))),/path|file/);
    const edited=JSON.parse(pack.bytes);edited.files[0].bytes=Buffer.from('tampered').toString('base64');assert.throws(()=>parseOriginalBackup(Buffer.from(JSON.stringify(edited))),/revision/);
    await assert.rejects(b.importBackup(pack.bytes,'bad'),/revision/);
    await b.importBackup(pack.bytes,plan.revision);assert.equal((await b.info(id)).approved,false);assert.deepEqual(await b.readGlobal(id),{});
    assert.deepEqual(await fs.readFile(path.join(b.directory(id),'assets','bytes.bin')),Buffer.from([0,255,128]));
    await assert.rejects(b.importBackup(pack.bytes,plan.revision),/already installed/);
    await a.removeKeepingData(id,plan.revision);assert.deepEqual((await a.exportBackup(id,true)).bytes,pack.bytes);
    await assert.rejects(a.importBackup(pack.bytes,plan.revision),/retained/);
  }finally{await a.close();await b.close();await fs.rm(root,{recursive:true,force:true});}
});
