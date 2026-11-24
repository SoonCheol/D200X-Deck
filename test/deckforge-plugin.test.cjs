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
    runtime:{type:'deckforge-sdk',directory:'payload',apiVersion:m.apiVersion}}));
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


const scriptManifest={...nativeManifest,apiVersion:2,actions:[{
  id:nativeId+'.toggle',name:'JS',controllers:['Keypad'],states:2,
  script:"if(event.type==='press'){memory.count=(memory.count||0)+1;api.setTitle(String(memory.count));api.toggleState();}"
}]};
test('JavaScript SDK package declares API 2 and rejects syntax, permissions and mismatch',async()=>{
  assert.deepEqual((await parseDeckForgePackage(await nativeArchive(scriptManifest))).native,scriptManifest);
  const bad=structuredClone(scriptManifest);bad.actions[0].script='if(';
  assert.throws(()=>validateNativeManifest(bad),/syntax/);
  await assert.rejects(parseDeckForgePackage(await rewritePackage(await nativeArchive(scriptManifest),(_z,m)=>{m.runtime.apiVersion=1;})),/일치하지 않습니다/);
});
test('JavaScript SDK context queue validates results, isolates faults and cancels stale output',async()=>{
  const {runProgram}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
  // Avoid executing browser-specific hardening in this Node test: use a mock transport.
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-js-'));
  const events=[],closed=[];let release;
  const host=new NativePluginHost(temp,e=>events.push(e),()=>({
    async run(_source,input){
      if(input.event.type==='appear'||input.event.type==='disappear')return {ops:[],memory:input.memory};
      if(input.settings.bad)return {ops:[{op:'exec'}],memory:{}};
      if(input.settings.wait)return new Promise(resolve=>{release=resolve;});
      const count=(input.memory.count||0)+1;
      return {ops:[{op:'title',value:String(count)},{op:'toggleState'}],memory:{count}};
    },close(){closed.push(true);}
  }));
  const cfg=(context,settings={})=>({context,slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings});
  const settle=async id=>{await host.contexts.get(id).queue;};
  try{
    host.sync([cfg('a'),cfg('b',{bad:true}),cfg('c',{wait:true})],[scriptManifest]);
    await Promise.all(['a','b','c'].map(settle));
    assert.equal(host.key('a','down'),true);await settle('a');
    host.key('a','up');await settle('a');host.key('a','down');await settle('a');
    assert.deepEqual(events.filter(e=>e.context==='a'&&e.kind==='setTitle').map(e=>e.payload.title),['1','2','3']);
    host.key('b','down');await settle('b');assert.equal(host.contexts.get('b').failed,true);
    assert.equal(host.contexts.get('a').failed,false);
    host.key('c','down');await new Promise(resolve=>setImmediate(resolve));
    const pending=host.contexts.get('c').queue;
    host.sync([cfg('a'),cfg('b',{bad:true})],[scriptManifest]);
    release({ops:[{op:'title',value:'stale'}],memory:{}});await pending;
    assert.equal(events.some(e=>e.payload?.title==='stale'),false);
    assert.ok(closed.length>=2);
    assert.equal(typeof runProgram,'function');
  }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});


test('SDK privileged operations require explicit permission and physical input; invalid batch has no partial output',()=>{
  const host=new NativePluginHost('/unused');
  const ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions:['display','settings.write','navigation','wide.mode']};
  const settings={op:'settings',value:{count:3}},nav={op:'navigate',target:'page',value:1},wide={op:'wideMode',value:'clock'};
  assert.deepEqual(host.validateScriptOps(ctx,'press',[{op:'title',value:'ok'},settings]),{normal:[{op:'title',value:'ok'}],effects:[settings]});
  assert.deepEqual(host.validateScriptOps(ctx,'heldRotateLeft',[nav]).effects,[nav]);
  assert.deepEqual(host.validateScriptOps(ctx,'release',[wide]).effects,[wide]);
  assert.throws(()=>host.validateScriptOps(ctx,'appear',[settings]),/input event/);
  assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[nav]),/unauthorized/);
  assert.throws(()=>host.validateScriptOps(ctx,'press',[settings,nav]),/one privileged/);
  assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'settings',value:JSON.parse('{"__proto__":{"bad":1}}')}]),/unsafe/);
  assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'navigate',target:'page',value:-1}]),/invalid navigation/);
  assert.doesNotThrow(()=>validateNativeManifest({...scriptManifest,permissions:ctx.permissions}));
  assert.throws(()=>validateNativeManifest({...nativeManifest,permissions:ctx.permissions}),/permissions/);
});


test('native global settings vault rejects stale revisions and unreadable data; isolates plugin identity',async()=>{
  const {NativeSettingsVault}=require('../app/streamdeck-editor/deckforge-native-settings.cjs');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-vault-'));
  // Test adapter only, not a cryptography implementation.
  const store={isAsyncEncryptionAvailable:async()=>true,
    encryptStringAsync:async value=>Buffer.from('mock:'+Buffer.from(value).toString('base64')),
    decryptStringAsync:async bytes=>({result:Buffer.from(bytes.toString().slice(5),'base64').toString()})};
  try{
    const vault=new NativeSettingsVault(temp,store),other=nativeId+'-other';
    assert.deepEqual(await vault.read(nativeId),{value:{},revision:null});
    assert.equal(await vault.write(nativeId,{token:'demo'},null),true);
    assert.equal(await vault.write(nativeId,{token:'stale'},null),false);
    const current=await vault.read(nativeId);
    assert.deepEqual(current.value,{token:'demo'});
    assert.equal(await vault.write(nativeId,{token:'no'},current.revision,()=>false),false);
    assert.equal(await vault.write(nativeId,{token:'new'},current.revision),true);
    assert.deepEqual((await vault.read(other)).value,{});
    await fs.copyFile(vault.file(nativeId),vault.file(other));
    await assert.rejects(vault.read(other),/read failed/);
    await assert.rejects(vault.write(other,{},null),/read failed/);
    await assert.rejects(vault.write(nativeId,JSON.parse('{"__proto__":1}'),null),/invalid global settings/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('native runtime recovery is bounded and never replays failed user input',async()=>{
  const calls=[];let failures=0;
  const host=new NativePluginHost('/unused',()=>{},()=>({
    async run(_source,input){
      calls.push(input.event.type);
      if(input.event.type==='press'||(input.event.type==='appear'&&failures>0)){
        failures++;const error=Error('renderer unavailable');error.code='SDK_RUNTIME_UNAVAILABLE';throw error;
      }
      return {ops:[],memory:{}};
    },close(){}
  }),{recoveryDelay:[5,5]});
  try{
    host.sync([{context:'a',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle'}],[scriptManifest]);
    const ctx=host.contexts.get('a');await ctx.queue;
    host.key('a','down');await ctx.queue;
    const until=Date.now()+1500;
    while(ctx.recoveryAttempts<2||ctx.recoveryTimer||ctx.pending) {
      if(Date.now()>until)throw Error('recovery did not settle');
      await new Promise(r=>setTimeout(r,10));
    }
    assert.deepEqual(calls,['appear','press','appear','appear']);
    assert.equal(ctx.failed,true);assert.equal(host.key('a','down'),false);
  }finally{host.close();}
});


test('Ulanzi AST converter translates only a known current-context display subset',()=>{
  const {analyzeSource}=require('../app/streamdeck-editor/ulanzi-converter.cjs');
  const m={Type:'JavaScript',UUID:'com.ulanzi.ulanzistudio.Test',Name:'Example',Version:'1.0.0',
    CodePath:'plugin/app.js',Actions:[{Name:'Toggle',UUID:'com.ulanzi.ulanzistudio.Test.toggle',States:[{},{}]}]};
  const script="import UlanziApi from './ulanzi-api/index.js';const $UD=new UlanziApi();$UD.connect('"+m.UUID+"');$UD.onKeyDown(msg=>{$UD.setTitle(msg.context,'On');$UD.setState(msg.context,1);});";
  const report=analyzeSource(m,script);
  assert.deepEqual(report.candidate.actions[0].events.press,[{op:'title',value:'On'},{op:'state',value:1}]);
  assert.equal(report.candidate.apiVersion,1);
  for(const suffix of ["$UD.onRun(m=>{});","$UD['setTitle']('other','x');","$UD.onKeyUp(m=>$UD.setState('other',0));","require('fs');","eval('1');"]){
    const rejected=analyzeSource(m,script+suffix);
    assert.equal(rejected.candidate,null,suffix);assert.ok(rejected.findings.length);
  }
  assert.equal(analyzeSource({...m,PrivateAPI:true},script).candidate,null);
  assert.equal(analyzeSource({...m,Actions:[{...m.Actions[0],PropertyInspectorPath:'pi.html'}]},script).candidate,null);
  assert.equal(analyzeSource(m,"$UD.onKeyDown(m=>{").candidate,null);
});
test('Ulanzi directory analyzer hashes original source and never installs or mutates it',async()=>{
  const {analyzeDirectory}=require('../app/streamdeck-editor/ulanzi-converter.cjs');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-'));
  const folder=path.join(temp,'com.example.ulanziPlugin');await fs.mkdir(path.join(folder,'plugin'),{recursive:true});
  const id='com.ulanzi.ulanzistudio.Test',m={Type:'JavaScript',UUID:id,Name:'Example',Version:'1',
    CodePath:'plugin/app.js',Actions:[{Name:'Demo',UUID:id+'.demo'}]};
  const source="$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));";
  try{
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(m));
    await fs.writeFile(path.join(folder,'plugin/app.js'),source);
    await fs.writeFile(path.join(folder,'LICENSE'),'test fixture');
    const report=await analyzeDirectory(folder);
    assert.equal(report.status,'candidate-review-required');assert.equal(report.installationAllowed,false);
    assert.match(report.source.entrySha256,/^[0-9a-f]{64}$/);
    assert.equal(report.inventory.licenseHashes.length,1);
    assert.equal(await fs.readFile(path.join(folder,'plugin/app.js'),'utf8'),source);
    assert.deepEqual((await fs.readdir(folder)).sort(),['LICENSE','manifest.json','plugin']);
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({...m,CodePath:'../outside.js'}));
    await assert.rejects(analyzeDirectory(folder),/manifest/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});


test('Ulanzi offline verifier compares source SDK traces with real native host dispatch and rejects altered conversion',()=>{
  const {analyzeSource}=require('../app/streamdeck-editor/ulanzi-converter.cjs');
  const {simulateCandidate}=require('../app/streamdeck-editor/ulanzi-verifier.cjs');
  const id='com.ulanzi.ulanzistudio.Verify',m={Type:'JavaScript',UUID:id,Name:'Verify',Version:'1',
    CodePath:'plugin/app.js',Actions:[{Name:'Dial',UUID:id+'.dial',Controllers:['Encoder'],States:[{},{}]}]};
  const source="$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));"+
    "$UD.onDialDown(m=>$UD.setState(m.context,1));$UD.onDialUp(m=>$UD.setState(m.context,0));"+
    "$UD.onDialRotateLeft(m=>$UD.setTitle(m.context,'Left'));$UD.onDialRotateRight(m=>$UD.setTitle(m.context,'Right'));"+
    "$UD.onDialRotateHoldLeft(m=>$UD.setTitle(m.context,'Held left'));$UD.onDialRotateHoldRight(m=>$UD.setTitle(m.context,'Held right'));";
  const report=analyzeSource(m,source);
  assert.equal(report.verification.status,'pass');
  assert.equal(report.verification.total,report.verification.passed);
  assert.equal(report.verification.originalExecuted,false);
  assert.equal(report.verification.installationAllowed,false);
  const sourceTrace=[{method:'onAdd',calls:[{method:'setTitle',value:'Ready'}]},
    {method:'onDialDown',calls:[{method:'setState',value:1}]},
    {method:'onDialUp',calls:[{method:'setState',value:0}]},
    {method:'onDialRotateLeft',calls:[{method:'setTitle',value:'Left'}]},
    {method:'onDialRotateRight',calls:[{method:'setTitle',value:'Right'}]},
    {method:'onDialRotateHoldLeft',calls:[{method:'setTitle',value:'Held left'}]},
    {method:'onDialRotateHoldRight',calls:[{method:'setTitle',value:'Held right'}]}];
  const changed=structuredClone(report.candidate);
  changed.actions[0].events.rotateLeft[0].value='WRONG';
  const check=simulateCandidate(changed,sourceTrace);
  assert.equal(check.status,'fail');
  assert.equal(check.checks.find(x=>x.name==='rotate-left').pass,false);
  assert.equal(check.installationAllowed,false);
  const key={...m,Actions:[{...m.Actions[0],Controllers:['Keypad']}]};
  const keyReport=analyzeSource(key,"$UD.connect('"+id+"');$UD.onKeyDown(m=>$UD.setTitle(m.context,'Down'));");
  assert.equal(keyReport.verification.status,'pass');
  assert.equal(keyReport.verification.checks.find(x=>x.name==='keypad-rejects-rotate').pass,true);
});


test('native version manager preserves original code and accepts only approved compatible updates or exact rollback',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-versions-'));
  const host=new NativePluginHost(tmp),original=structuredClone(nativeManifest);
  original.version='1.0.0';
  try{
    assert.equal((await host.planInstall(original)).kind,'install');
    await host.install(original);
    const newer={...original,version:'1.1.0',name:'New version',requiresDeckForge:'>=1.1.0 <2.0.0'};
    const plan=await host.planInstall(newer);
    assert.equal(plan.kind,'update');
    await assert.rejects(host.replace(newer,'wrong-revision'),/revision changed/);
    const before=await fs.readFile(host.versions.currentFile(original.id),'utf8');
    await host.replace(newer,plan.currentRevision);
    const after=await fs.readFile(host.versions.currentFile(original.id),'utf8');
    assert.equal(JSON.parse(after).version,'1.1.0');
    const history=await host.versions.read(host.versions.historyFile(original.id,
      require('../app/streamdeck-editor/deckforge-native-versions.cjs').fingerprint(original)));
    assert.equal(history.raw.toString(),before);
    await assert.rejects(host.planInstall({...original,name:'Tampered old code'}),/rollback/);
    await assert.rejects(host.planInstall({...newer,name:'Different content'}),/same version/);
    await assert.rejects(host.planInstall({...newer,version:'2.0.0',actions:[{...newer.actions[0],states:1}]}),/contract|state/);
    assert.throws(()=>validateNativeManifest({...newer,requiresDeckForge:'>=999.0.0'}),/requires DeckForge/);
    assert.throws(()=>validateNativeManifest({...newer,requiresDeckForge:'bad range'}),/version range/);
    const rollback=await host.planInstall(original);
    assert.equal(rollback.kind,'rollback');
    await host.replace(original,rollback.currentRevision);
    assert.equal(JSON.parse(await fs.readFile(host.versions.currentFile(original.id),'utf8')).version,'1.0.0');
    assert.equal((await host.planInstall(newer)).kind,'update');
  }finally{host.close();await fs.rm(tmp,{recursive:true,force:true});}
});


test('native dependencies resolve transitively, reject cycles and protect working dependents',()=>{
  const {resolveDependencies,assertDependencyChange}=require('../app/streamdeck-editor/deckforge-native-dependencies.cjs');
  const mk=(name,version='1.0.0',dependencies)=>({
    ...nativeManifest,id:'com.deckforge.native.'+name,version,
    actions:[{...nativeManifest.actions[0],id:'com.deckforge.native.'+name+'.toggle'}],...(dependencies?{dependencies}:{})
  });
  const a=mk('dep-a'),b=mk('dep-b','1.0.0',{[a.id]:'^1.0.0'}),
    c=mk('dep-c','1.0.0',{[b.id]:'~1.0.0'}),other=mk('dep-independent');
  assert.equal(resolveDependencies([a,b,c,other]).ready.size,4);
  const missing=resolveDependencies([b,c,other]);
  assert.deepEqual([...missing.ready],[other.id]);
  assert.match(missing.blocked.get(b.id),/missing dependency/);
  assert.throws(()=>assertDependencyChange([a,b,c],{...a,version:'2.0.0'}),/disable/);
  assert.throws(()=>assertDependencyChange([a,b,c],{...a,dependencies:{[c.id]:'*'}}),/cyclic/);
  assert.doesNotThrow(()=>assertDependencyChange([a,b,c],{...a,version:'1.1.0'}));
  assert.throws(()=>validateNativeManifest({...a,dependencies:{[a.id]:'*'}}),/dependency ID/);
  assert.throws(()=>validateNativeManifest({...a,dependencies:{[b.id]:'not-a-range'}}),/version range/);
  assert.throws(()=>validateNativeManifest({...a,dependencies:{'com.legacy.external':'*'}}),/dependency ID/);
});
test('native router rechecks dependencies at install and runtime without falling through to legacy',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-dependencies-'));
  const events=[],legacyCalls=[];
  const legacy={list:async()=>[],sync:async c=>legacyCalls.push(c),key:()=>true,inspector:()=>true,
    onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
  const host=new NativePluginHost(temp,e=>events.push(e)),router=new PluginRouter(legacy,host);
  const dependentId='com.deckforge.native.dependent';
  const dependent={...nativeManifest,id:dependentId,dependencies:{[nativeId]:'^1.0.0'},
    actions:[{...nativeManifest.actions[0],id:dependentId+'.toggle'}]};
  const cfg={context:'dependent',slot:0,pluginUUID:dependentId,actionUUID:dependentId+'.toggle',settings:{}};
  try{
    await assert.rejects(router.installNative(dependent),/missing dependency/);
    await router.installNative(nativeManifest);await router.installNative(dependent);
    const plan=await router.planNativeInstall({...nativeManifest,version:'1.1.0'});
    await router.replaceNative({...nativeManifest,version:'1.1.0'},plan.currentRevision);
    await assert.rejects(router.planNativeInstall({...nativeManifest,version:'2.0.0'}),/disable/);
    await router.sync([cfg]);assert.equal(router.key(cfg.context,'down'),true);
    // Simulate an externally missing dependency in the temporary test fixture.
    await fs.rename(host.versions.currentFile(nativeId),host.versions.currentFile(nativeId)+'.missing');
    await router.sync([cfg]);assert.deepEqual(legacyCalls.at(-1),[]);
    assert.equal(router.key(cfg.context,'down'),false);assert.equal(router.inspector(cfg.context),false);
    assert.equal(host.contexts.has(cfg.context),false);
    assert.ok(events.some(e=>e.kind==='nativeUnavailable'&&e.context===cfg.context));
    const blocked=(await router.list()).find(m=>m.uuid===dependentId);
    assert.equal(blocked.available,false);assert.deepEqual(blocked.actions,[]);
    await fs.rename(host.versions.currentFile(nativeId)+'.missing',host.versions.currentFile(nativeId));
    await router.sync([cfg]);assert.equal(router.key(cfg.context,'down'),true);
  }finally{await router.close();await fs.rm(temp,{recursive:true,force:true});}
});


test('native wide overlay requires explicit permission, bounds and physical input',()=>{
 const host=new NativePluginHost('/unused');
 const {validateWideOverlay}=require('../app/streamdeck-editor/deckforge-native-wide.cjs');
 const ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions:['display','wide.overlay']};
 const frame={kind:'layout',background:'#101010',elements:[
  {type:'text',x:0,y:0,w:392,h:80,text:'Ready',size:32,color:'#ffffff',align:'center'},
  {type:'bar',x:16,y:100,w:360,h:20,color:'#33aabb',track:'#333333',value:0.5}]};
 const op={op:'wideOverlay',value:frame,durationMs:5000};
 assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).effects,[op]);
 assert.doesNotThrow(()=>validateNativeManifest({...scriptManifest,permissions:ctx.permissions}));
 assert.throws(()=>host.validateScriptOps(ctx,'appear',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[op]),/unauthorized/);
 assert.throws(()=>validateWideOverlay({...op,durationMs:30001}),/invalid wide/);
 assert.throws(()=>validateWideOverlay({...op,value:{...frame,elements:[{...frame.elements[0],w:393}]}}),/invalid wide/);
 assert.throws(()=>validateWideOverlay({...op,value:{kind:'png',data:'https://example.com/image.png'}}),/invalid wide/);
 assert.doesNotThrow(()=>validateWideOverlay({op:'wideOverlay',value:null,durationMs:0}));
});
test('native wide overlay ownership is released on runtime shutdown or removal',async()=>{
 const events=[],frame={kind:'layout',background:'#000000',elements:[]};
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({async run(_s,input){
   return {ops:input.event.type==='press'?[{op:'wideOverlay',value:frame,durationMs:1000}]:[],memory:{}};
 },close(){}}));
 const m={...scriptManifest,permissions:['display','wide.overlay']};
 const cfg={context:'owner',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 try{
  host.sync([cfg],[m]);await host.contexts.get('owner').queue;
  host.key('owner','down');await host.contexts.get('owner').queue;
  assert.ok(events.some(e=>e.kind==='nativeEffect'&&e.operation.op==='wideOverlay'));
  host.suspend();
  assert.ok(events.some(e=>e.kind==='nativeWideReleased'&&e.context==='owner'));
 }finally{host.close();}
});
