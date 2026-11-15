'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('../app/node_modules/jszip');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {StreamDeckPluginHost,parseArchive,validateManifest}=require('../app/streamdeck-editor/sd-plugin-host.cjs');
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
    const uuid=M.UUID,dir=path.join(tmp,'streamdeck-sdk-plugins',uuid+'.sdPlugin');
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
    return {ok:true,json:async()=>({state:calls.length===1?'on':calls.length===2?'off':'unavailable'})};
  };
  await host.refreshHaDualStates(fetchMock);
  await host.refreshHaDualStates(fetchMock);
  await host.refreshHaDualStates(fetchMock);
  assert.deepEqual(states.filter(x=>x.kind==='setState').map(x=>x.payload.state),[1,0]);
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
  const {nodeRuntime}=require('../app/streamdeck-editor/sd-plugin-host.cjs');
  const runtime=await nodeRuntime(20);
  assert.ok(Number(runtime.version.split('.')[0])>=20);
  await assert.rejects(nodeRuntime(99),/Node.js 99 이상/);
});
