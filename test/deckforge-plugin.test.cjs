'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const JSZip=require('../app/node_modules/jszip');
const {parseArchive}=require('../app/streamdeck-editor/sd-plugin-host.cjs');
const {parseDeckForgePackage,packageSdPluginDirectory,validatePackageManifest}=require('../app/streamdeck-editor/deckforge-plugin.cjs');

const id='com.deckforge.example';
const manifest={UUID:id,Name:'Example plugin',Version:'1.2.3',CodePath:'plugin.html',
  Actions:[{UUID:id+'.action',Name:'Example action'}]};
async function sdkFolder(root){
  const dir=path.join(root,id+'.sdPlugin');
  await fs.mkdir(path.join(dir,'assets'),{recursive:true});
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(dir,'plugin.html'),'<html></html>');
  await fs.writeFile(path.join(dir,'assets','icon.svg'),'<svg></svg>');
  return dir;
}
async function rewritePackage(buffer,edit){
  const zip=await JSZip.loadAsync(buffer);
  const meta=JSON.parse(await zip.file('deckforge-plugin.json').async('string'));
  edit(zip,meta);
  zip.file('deckforge-plugin.json',JSON.stringify(meta));
  return zip.generateAsync({type:'nodebuffer'});
}

test('DeckForge package uses its own extension and manifest and preserves original SDK folder',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-pkg-'));
  try{
    const folder=await sdkFolder(temp);
    const packed=await packageSdPluginDirectory(folder);
    assert.equal(packed.filename,'Example-plugin-1.2.3.deckforgePlugin');
    assert.equal(packed.meta.format,'deckforge-plugin');
    assert.equal(packed.meta.formatVersion,1);
    assert.equal(packed.meta.runtime.type,'streamdeck-sdk');
    assert.equal(packed.meta.source.kind,'streamdeck');
    const decoded=await parseDeckForgePackage(packed.archive);
    assert.equal(decoded.meta.plugin.id,id);
    const sdkArchive=await parseArchive(decoded.archive);
    assert.equal(sdkArchive.manifest.UUID,id);
    assert.deepEqual(sdkArchive.files.map(x=>x.name).sort(),
      ['assets/icon.svg','manifest.json','plugin.html']);
    assert.equal(await fs.readFile(path.join(folder,'plugin.html'),'utf8'),'<html></html>');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('DeckForge package rejects unsupported runtime/source and mismatched identifiers',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-pkg-reject-'));
  try{
    const pack=await packageSdPluginDirectory(await sdkFolder(temp));
    assert.throws(()=>validatePackageManifest({...pack.meta,runtime:{type:'ulanzi',directory:'payload'}}),/런타임/);
    assert.throws(()=>validatePackageManifest({...pack.meta,source:{kind:'ulanzi'}}),/Ulanzi/);
    await assert.rejects(parseDeckForgePackage(await rewritePackage(pack.archive,(_zip,meta)=>{
      meta.plugin.id='com.deckforge.mismatch';
    })),/일치하지 않습니다/);
    await assert.rejects(parseDeckForgePackage(await rewritePackage(pack.archive,(_zip,meta)=>{
      meta.source={kind:'ulanzi'};
    })),/Ulanzi/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('DeckForge package rejects unknown files and traversal records',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-pkg-path-'));
  try{
    const pack=await packageSdPluginDirectory(await sdkFolder(temp));
    await assert.rejects(parseDeckForgePackage(await rewritePackage(pack.archive,zip=>{
      zip.file('outside.txt','not allowed');
    })),/정의되지 않은 파일/);
    await assert.rejects(parseDeckForgePackage(await rewritePackage(pack.archive,zip=>{
      zip.file('payload/../../escape.txt','not allowed',{createFolders:false});
    })),/경로/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('DeckForge exporter blocks unexpected symlinks and never overwrites installed plugin data',async(t)=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-pkg-symlink-'));
  try{
    const folder=await sdkFolder(temp);
    try{
      await fs.symlink(path.join(folder,'plugin.html'),path.join(folder,'link.html'));
    }catch(error){
      if(['EPERM','ENOTSUP','EACCES'].includes(error.code)){t.diagnostic('Symlinks unavailable on this system');return;}
      throw error;
    }
    await assert.rejects(packageSdPluginDirectory(folder),/심볼릭 링크/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});


const {validateNativeManifest,NativePluginHost,PluginRouter}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
const nativeId='com.deckforge.native.counter';
const nativeManifest={apiVersion:1,id:nativeId,name:'Native counter',version:'1.0.0',permissions:['display'],actions:[
  {id:nativeId+'.toggle',name:'Toggle',controllers:['Keypad','Encoder'],states:2,
    events:{appear:[{op:'titleFromSetting',key:'label',fallback:'Ready'}],press:[{op:'toggleState'}],
      rotateRight:[{op:'toggleState'}],heldRotateLeft:[{op:'title',value:'Held'}]}}
]};
async function nativeArchive(m=nativeManifest,extra=false){
  const zip=new JSZip();
  zip.file('deckforge-plugin.json',JSON.stringify({format:'deckforge-plugin',formatVersion:2,
    plugin:{id:m.id,name:m.name,version:m.version},source:{kind:'deckforge'},
    runtime:{type:'deckforge-sdk',directory:'payload',apiVersion:1}}));
  zip.file('payload/native.json',JSON.stringify(m));if(extra)zip.file('payload/evil.js','throw Error()');
  return zip.generateAsync({type:'nodebuffer'});
}
test('native package v2 validates identity, permissions and executable-free payload',async()=>{
  assert.deepEqual((await parseDeckForgePackage(await nativeArchive())).native,nativeManifest);
  await assert.rejects(parseDeckForgePackage(await nativeArchive(nativeManifest,true)),/native.json/);
  assert.throws(()=>validateNativeManifest({...nativeManifest,permissions:['shell']}),/permissions/);
  const bad=structuredClone(nativeManifest);bad.actions[0].events.press=[{op:'exec',value:'bad'}];
  assert.throws(()=>validateNativeManifest(bad),/unsupported operation/);
});
test('native routing coexists, keeps separate context state, blocks overwrite and handles suspend',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-native-'));
  const events=[],legacyCalls=[];
  const legacy={list:async()=>[{uuid:'com.legacy.example',actions:[]}],sync:async c=>legacyCalls.push(c),
    key:()=>true,inspector:()=>true,onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
  const native=new NativePluginHost(temp,e=>events.push(e)),router=new PluginRouter(legacy,native);
  try{
    await router.installNative(nativeManifest);
    await assert.rejects(router.installNative(nativeManifest),/EEXIST/);
    assert.equal((await router.list()).length,2);
    const config=(context,slot,gesture='down')=>({context,slot,gesture,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{label:context}});
    const cfg=[config('a',0),config('b',1),config('dial',16,'hold-left'),{context:'legacy',pluginUUID:'com.legacy.example'}];
    await router.sync(cfg);assert.deepEqual(legacyCalls[0],[cfg[3]]);
    assert.equal(events.find(e=>e.context==='a').payload.title,'a');
    assert.equal(router.key('a','up'),false);
    assert.equal(router.key('a','down'),true);assert.equal(router.key('a','down'),false);
    assert.equal(router.key('a','up'),true);assert.equal(router.key('b','down'),true);
    assert.deepEqual(events.filter(e=>e.kind==='setState').map(e=>e.payload.state),[1,1]);
    assert.equal(router.key('dial','left'),true);
    assert.equal(events.at(-1).payload.title,'Held');
    router.onSystemSuspend();assert.equal(router.key('a','down'),false);router.onSystemResume();
    await router.sync([cfg[3]]);assert.equal(native.contexts.size,0);
    assert.equal(router.key('legacy','down'),true);
  }finally{await router.close();await fs.rm(temp,{recursive:true,force:true});}
});
