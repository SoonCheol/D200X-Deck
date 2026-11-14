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
  assert.throws(()=>validateManifest({...M,CodePath:'plugin.exe'}),/HTML CodePath/);
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
