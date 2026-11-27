'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const JSZip=require('../app/node_modules/jszip');
const {parseArchive}=require('../app/deckforge-editor/sd-plugin-host.cjs');
const {parseDeckForgePackage,packageSdPluginDirectory,validatePackageManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');

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


const {validateNativeManifest,NativePluginHost,PluginRouter}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
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
test('native package and declarative execution do not load the external compatibility host',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-native-independent-'));
 try{
  const {execFileSync}=require('node:child_process');
  const base=path.resolve(__dirname,'../app/deckforge-editor');
  const source=String.raw`
   const assert=require('node:assert/strict');
   const path=require('node:path');
   const Module=require('node:module');
   const [base,root,json]=process.argv.slice(1);
   const load=Module._load;
   Module._load=function(request,...args){
    if(path.basename(request)==='sd-plugin-host.cjs')throw Error('external compatibility host is unavailable');
    return load.call(this,request,...args);
   };
   (async()=>{
    const {packageNativeManifest,parseDeckForgePackage}=require(path.join(base,'deckforge-plugin.cjs'));
    const {NativePluginHost}=require(path.join(base,'deckforge-native-sdk.cjs'));
    const manifest=JSON.parse(json);
    const pack=await packageNativeManifest(manifest);
    const decoded=await parseDeckForgePackage(pack.archive);
    assert.deepEqual(decoded.native,manifest);
    const events=[],host=new NativePluginHost(root,e=>events.push(e));
    try{
     await host.install(decoded.native);
     host.sync([{context:'native-only',slot:0,gesture:'down',pluginUUID:manifest.id,actionUUID:manifest.actions[0].id,settings:{label:'Independent'}}],await host.manifests());
     assert.equal(events.find(e=>e.kind==='setTitle')?.payload.title,'Independent');
     assert.equal(host.key('native-only','down'),true);
     assert.equal(events.find(e=>e.kind==='setState')?.payload.state,1);
     assert.equal(host.key('native-only','up'),true);
     assert.ok(!Object.keys(require.cache).some(file=>path.basename(file)==='sd-plugin-host.cjs'));
    }finally{host.close();}
   })().catch(error=>{console.error(error);process.exitCode=1;});
  `;
  execFileSync(process.execPath,['-e',source,base,root,JSON.stringify(nativeManifest)],{timeout:30000,stdio:'pipe'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
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
  const {runProgram}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
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
  const {NativeSettingsVault}=require('../app/deckforge-editor/deckforge-native-settings.cjs');
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
  const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
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
  const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
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
  const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
  const {simulateCandidate}=require('../app/deckforge-editor/ulanzi-verifier.cjs');
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
    const newer={...original,version:'1.1.0',name:'New version',requiresDeckForge:'>=1.1.0 <3.0.0'};
    assert.throws(()=>validateNativeManifest({...newer,requiresDeckForge:'>=1.1.0 <2.0.0'}),/requires DeckForge/);
    const plan=await host.planInstall(newer);
    assert.equal(plan.kind,'update');
    await assert.rejects(host.replace(newer,'wrong-revision'),/revision changed/);
    const before=await fs.readFile(host.versions.currentFile(original.id),'utf8');
    await host.replace(newer,plan.currentRevision);
    const after=await fs.readFile(host.versions.currentFile(original.id),'utf8');
    assert.equal(JSON.parse(after).version,'1.1.0');
    const history=await host.versions.read(host.versions.historyFile(original.id,
      require('../app/deckforge-editor/deckforge-native-versions.cjs').fingerprint(original)));
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
  const {resolveDependencies,assertDependencyChange}=require('../app/deckforge-editor/deckforge-native-dependencies.cjs');
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
 const {validateWideOverlay}=require('../app/deckforge-editor/deckforge-native-wide.cjs');
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


test('native settings schema supports bounded typed fields, defaults and existing stored values',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const schema=[{key:'label',label:'Label',type:'text',maxLength:20,default:'Ready'},
  {key:'enabled',label:'Enabled',type:'boolean',default:true},
  {key:'count',label:'Count',type:'integer',min:0,max:10,default:1},
  {key:'mode',label:'Mode',type:'select',options:[{value:'a',label:'A'},{value:'b',label:'B'}],default:'a'}];
 const manifest={...nativeManifest,actions:[{...nativeManifest.actions[0],settingsSchema:schema}]};
 assert.doesNotThrow(()=>validateNativeManifest(manifest));
 assert.deepEqual(core.nativeEffectiveSettings(schema,{count:5,old:'preserve'}),{count:5,old:'preserve',label:'Ready',enabled:true,mode:'a'});
 assert.throws(()=>core.nativeEffectiveSettings(schema,{count:11}),/invalid setting/);
 assert.throws(()=>core.nativeEffectiveSettings(schema,{enabled:'false'}),/invalid setting/);
 assert.throws(()=>core.validateNativeSettingsSchema([{...schema[0],key:'__proto__'}]),/schema/);
 assert.throws(()=>core.validateNativeSettingsSchema([{...schema[0],type:'password'}]),/schema/);
 assert.throws(()=>core.validateNativeSettingsSchema([...schema,schema[0]]),/schema/);
 const events=[],host=new NativePluginHost('/unused',e=>events.push(e));
 try{
  host.sync([{context:'settings',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}}],[manifest]);
  assert.equal(events.find(e=>e.kind==='setTitle').payload.title,'Ready');
  const ctx={pluginUUID:nativeId,action:{...scriptManifest.actions[0],settingsSchema:schema},permissions:['display','settings.write']};
  assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'settings',value:{count:99}}]),/invalid setting/);
  assert.doesNotThrow(()=>host.validateScriptOps(ctx,'press',[{op:'settings',value:{count:3}}]));
 }finally{host.close();}
});
test('native version update cannot narrow or remove existing declared settings',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-schema-')),host=new NativePluginHost(temp);
 const schema=[{key:'count',label:'Count',type:'integer',min:0,max:10,default:1}];
 const m={...nativeManifest,actions:[{...nativeManifest.actions[0],settingsSchema:schema}]};
 try{
  await host.install(m);
  await assert.rejects(host.planInstall({...m,version:'2.0.0',actions:[{...m.actions[0],settingsSchema:[{...schema[0],max:5}]}]}),/settings contract/);
  assert.equal((await host.planInstall({...m,version:'1.1.0',actions:[{...m.actions[0],settingsSchema:[{...schema[0],label:'Number'},{key:'flag',label:'Flag',type:'boolean',default:false}]}]})).kind,'update');
 }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});


test('native network contract permits only declared HTTPS endpoints and input-triggered requests',()=>{
 const {validateNetworkEndpoints,validateNetworkRequest}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const permissions=['display','network.request'],endpoint={id:'status',url:'https://example.com/api/status',method:'GET'};
 const m={...scriptManifest,permissions,networkEndpoints:[endpoint]};
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,networkEndpoints:undefined}),/missing endpoints/);
 for(const url of ['http://example.com/','https://user:pass@example.com/','https://example.com/#secret','https://example.com/?secret=x']){
   assert.throws(()=>validateNetworkEndpoints([{...endpoint,url}],permissions),/HTTPS/);
 }
 const host=new NativePluginHost('/unused'),ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions,networkEndpoints:[endpoint]};
 const op={op:'networkRequest',endpoint:'status',body:null};
 assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).effects,[op]);
 assert.throws(()=>host.validateScriptOps(ctx,'networkResult',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps(ctx,'appear',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[op]),/unauthorized/);
 assert.throws(()=>validateNetworkRequest({...op,endpoint:'other'},[endpoint]),/not approved/);
 assert.throws(()=>validateNetworkRequest({...op,body:{}},[endpoint]),/GET/);
 const post={...endpoint,method:'POST'};
 assert.doesNotThrow(()=>validateNetworkRequest({...op,body:{value:1}},[post]));
 assert.throws(()=>validateNetworkRequest({...op,body:JSON.parse('{"__proto__":1}')},[post]),/invalid global settings/);
 host.close();
});
test('native HTTP extension permits approved methods and bounded query only',async()=>{
 const {validateNetworkEndpoints,validateNetworkRequest,resolveNetworkEndpoint,requestEndpoint,credentialBinding}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const {EventEmitter}=require('node:events');
 const permissions=['display','network.request'],base={id:'status',url:'https://example.com/api/status',method:'GET'};
 const op={op:'networkRequest',endpoint:'status',body:null};
 for(const method of ['GET','POST','PUT','PATCH','DELETE']){
   const e={...base,method,queryKeys:['search']};
   validateNetworkEndpoints([e],permissions);
   const body=method==='GET'?null:{value:1},query={search:'a&next=https://elsewhere.example/#x'};
   assert.equal(validateNetworkRequest({...op,body,query},[e]),e);
   const resolved=resolveNetworkEndpoint(e,query);
   const url=new URL(resolved.url);
   assert.equal(url.origin,'https://example.com');assert.equal(url.pathname,'/api/status');assert.equal(url.hash,'');
   assert.equal(url.searchParams.get('search'),query.search);assert.equal(url.searchParams.size,1);
   const mock=(url,opts,callback)=>{
     assert.equal(url.href,resolved.url);assert.equal(opts.method,method);assert.equal(opts.rejectUnauthorized,true);
     const req=new EventEmitter();req.destroy=()=>{};req.end=payload=>{
       assert.equal(payload?.toString(),body===null?undefined:JSON.stringify(body));
       const res=new EventEmitter();res.statusCode=204;res.headers={};res.destroy=()=>{};
       callback(res);res.emit('end');
     };return req;
   };
   assert.equal((await requestEndpoint(resolved,body,undefined,{request:mock})).ok,true);
 }
 for(const method of ['CONNECT','TRACE','OPTIONS','get'])assert.throws(()=>validateNetworkEndpoints([{...base,method}],permissions),/method/);
 for(const queryKeys of [[],['a','a'],['__proto__'],['a b']])assert.throws(()=>validateNetworkEndpoints([{...base,queryKeys}],permissions),/query/);
 for(const query of [{other:'x'},{search:1},{search:'x'.repeat(257)},null,JSON.parse('{"__proto__":"x"}')])
   assert.throws(()=>validateNetworkRequest({...op,query},[{...base,queryKeys:['search']}]),/query/);
 assert.throws(()=>validateNetworkRequest({...op,query:{search:'x'}},[base]),/query/);
 const bearer={...base,auth:'bearer'};
 assert.notEqual(credentialBinding(nativeId,bearer),credentialBinding(nativeId,{...bearer,queryKeys:['search']}));
 const host=new NativePluginHost('/unused');
 try{
   const ctx={pluginUUID:nativeId,action:{...scriptManifest.actions[0],tickIntervalMs:5000},permissions:[...permissions,'network.poll','timer.tick'],networkEndpoints:[{...base,method:'DELETE'}]};
   assert.throws(()=>host.validateScriptOps(ctx,'tick',[op]),/must use GET/);
   assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).effects,[op]);
 }finally{host.close();}
});

test('native HTTP dynamic path and headers remain inside the exact approved contract',async()=>{
 const {validateNetworkEndpoints,validateNetworkRequest,resolveNetworkEndpoint,requestEndpoint,credentialBinding}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const {EventEmitter}=require('node:events');
 const permissions=['display','network.request'],endpoint={id:'entity',method:'PATCH',url:'https://example.com/api/states/',auth:'bearer',pathKeys:['domain','entity'],queryKeys:['view'],headerKeys:['if-match','x-request-id']};
 const query={view:'full'},options={path:{domain:'light',entity:'living_room'},headers:{'if-match':'"rev-1"','x-request-id':'123'}};
 const op={op:'networkRequest',endpoint:'entity',body:{on:true},query,options};
 validateNetworkEndpoints([endpoint],permissions);assert.equal(validateNetworkRequest(op,[endpoint]),endpoint);
 const resolved=resolveNetworkEndpoint(endpoint,query,options);
 assert.equal(resolved.url,'https://example.com/api/states/light/living_room?view=full');
 assert.deepEqual(resolved.requestHeaders,options.headers);
 for(const value of ['..','.','%2e%2e','a/b','a\\b','https://evil.example','x?y','x#y','x%2fy','x'.repeat(129)])
   assert.throws(()=>validateNetworkRequest({...op,options:{...options,path:{domain:value,entity:'a'}}},[endpoint]),/path/);
 for(const path of [{domain:'light'}, {...options.path,other:'x'}, null])
   assert.throws(()=>validateNetworkRequest({...op,options:{...options,path}},[endpoint]),/path/);
 assert.throws(()=>validateNetworkRequest({...op,options:undefined},[endpoint]),/path/);
 for(const headers of [{'authorization':'x'},{'x-request-id':'a\r\nb'}, {'x-request-id':'x'.repeat(257)}, {'if-match':1},{'X-Request-ID':'x'},{'x-other':'x'}])
   assert.throws(()=>validateNetworkRequest({...op,options:{...options,headers}},[endpoint]),/header/);
 for(const h of ['authorization','cookie','host','content-length','transfer-encoding','connection','proxy-authorization','x-forwarded-for','x-http-method-override','x-api-key'])
   assert.throws(()=>validateNetworkEndpoints([{...endpoint,headerKeys:[h]}],permissions),/header/);
 assert.throws(()=>validateNetworkEndpoints([{...endpoint,url:'https://example.com/api/states'}],permissions),/slash/);
 assert.throws(()=>validateNetworkRequest({...op,options:{...options,url:'https://evil.example/'}},[endpoint]),/options/);
 assert.notEqual(credentialBinding(nativeId,endpoint),credentialBinding(nativeId,{...endpoint,pathKeys:['entity','domain']}));
 assert.notEqual(credentialBinding(nativeId,endpoint),credentialBinding(nativeId,{...endpoint,headerKeys:['if-match']}));
 const mock=(url,opts,callback)=>{
   assert.equal(url.href,resolved.url);assert.equal(opts.headers.authorization,'Bearer abc123');
   assert.equal(opts.headers['if-match'],'"rev-1"');assert.equal(opts.headers['x-request-id'],'123');
   assert.equal(opts.headers['content-type'],'application/json');assert.equal(opts.headers['accept-encoding'],'identity');
   const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
     const res=new EventEmitter();res.statusCode=204;res.headers={};res.destroy=()=>{};callback(res);res.emit('end');
   };return req;
 };
 assert.equal((await requestEndpoint(resolved,op.body,undefined,{request:mock,bearer:'abc123'})).ok,true);
});

test('native background service requires permission and cannot control physical actions',()=>{
 const service={script:'api.publishSharedState({ready:true});',tickIntervalMs:1000};
 const m={...scriptManifest,permissions:['display','background.run','timer.tick'],service};
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,permissions:['display','timer.tick']}),/background/);
 assert.throws(()=>validateNativeManifest({...m,service:undefined}),/background/);
 assert.throws(()=>validateNativeManifest({...m,permissions:['display','background.run']}),/tick/);
 assert.throws(()=>validateNativeManifest({...m,service:{script:'invalid )'}}),/syntax/);
 const host=new NativePluginHost('/unused');
 const ctx={service:true,pluginUUID:nativeId,permissions:m.permissions,action:{id:nativeId+'.service',tickIntervalMs:1000}};
 try{
   assert.deepEqual(host.validateScriptOps(ctx,'start',[{op:'publishSharedState',value:{ready:true}}]).normal,[{op:'publishSharedState',value:{ready:true}}]);
   for(const op of [{op:'title',value:'bad'},{op:'navigate',target:'page',value:0},{op:'settings',value:{}},{op:'globalSettings',value:{}},{op:'wideMode',value:'clock'}])
     assert.throws(()=>host.validateScriptOps(ctx,'start',[op]),/background service/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[]),/background event/);
   assert.throws(()=>host.validateScriptOps({...ctx,service:false,action:scriptManifest.actions[0]},'press',[{op:'publishSharedState',value:{}}]),/unauthorized/);
 }finally{host.close();}
});
test('native background WSS and shared snapshot survive page changes, clear on retirement and restart after suspend',async()=>{
 const {EventEmitter}=require('node:events');
 const ep={id:'live',url:'wss://example.com/events',method:'WSS'};
 const m={...scriptManifest,permissions:['display','background.run','network.websocket','timer.tick'],networkEndpoints:[ep],service:{script:'service',tickIntervalMs:1000}};
 const sockets=[],events=[],updates=[];
 class Mock extends EventEmitter{
   constructor(){super();this.readyState=0;this.bufferedAmount=0;this.closed=false;}
   terminate(){this.closed=true;this.readyState=3;this.emit('close',1006);}
 }
 let now=1000;
 const host=new NativePluginHost('/unused',e=>updates.push(e),()=>({async run(src,input){
   const {type,response,scope}=input.event;events.push({src,type,scope,state:input.sharedState});
   if(scope==='service'){
     if(type==='start')return {ops:[{op:'socketConnect',endpoint:'live'}],memory:{}};
     if(type==='socketEvent'&&response.event==='message')return {ops:[{op:'publishSharedState',value:{status:response.body}}],memory:{}};
     if(type==='tick')return {ops:[{op:'publishSharedState',value:{status:'tick'}}],memory:{}};
     return {ops:[],memory:{}};
   }
   if(type==='appear'||type==='sharedState')return {ops:[{op:'title',value:input.sharedState?.status||'empty'}],memory:{}};
   return {ops:[],memory:{}};
 },close(){}}),{socketFactory:()=>{const s=new Mock();sockets.push(s);return s;},now:()=>now});
 const key='@service:'+nativeId,cfg={context:'page1',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const drain=async()=>{for(let i=0;i<3;i++){await new Promise(r=>setImmediate(r));await Promise.all([...host.contexts.values()].map(c=>c.queue));}};
 try{
   host.sync([],[m]);await drain();assert.equal(sockets.length,1);
   const original=host.contexts.get(key);assert.ok(original.service);assert.equal(host.key(key,'down'),false);
   sockets[0].readyState=1;sockets[0].emit('open');
   sockets[0].emit('message',Buffer.from('on'),false);await drain();
   host.sync([cfg],[m]);await drain();assert.ok(updates.some(e=>e.context==='page1'&&e.payload?.title==='on'));
   host.sync([{...cfg,context:'page2'}],[m]);await drain();assert.equal(host.contexts.get(key),original);assert.equal(sockets.length,1);
   sockets[0].emit('message',Buffer.from('off'),false);await drain();
   assert.ok(updates.some(e=>e.context==='page2'&&e.payload?.title==='off'));
   assert.equal(updates.some(e=>e.context===key&&e.kind==='setTitle'),false);
   now=3000;host.tick(now);await drain();assert.ok(updates.some(e=>e.context==='page2'&&e.payload?.title==='tick'));
   host.suspend();assert.equal(sockets[0].closed,true);assert.deepEqual(original.sharedState,{});
   host.resume();await drain();assert.equal(sockets.length,2);
   // Resume-only notification: an existing socket must be discarded and
   // replaced even if the OS did not deliver a preceding suspend event.
   sockets[1].readyState=1;sockets[1].emit('open');
   sockets[1].emit('message',Buffer.from('on'),false);await drain();
   assert.equal(original.sharedState.status,'on');
   const epoch=original.epoch;
   host.resume();await drain();assert.equal(sockets[1].closed,true);
   assert.equal(sockets.length,3);assert.ok(original.epoch>epoch);assert.deepEqual(original.sharedState,{});
   sockets[1].emit('message',Buffer.from('stale'),false);await drain();assert.deepEqual(original.sharedState,{});
   sockets[2].readyState=1;sockets[2].emit('open');sockets[2].emit('message',Buffer.from('fresh'),false);await drain();
   assert.equal(original.sharedState.status,'fresh');assert.ok(updates.some(e=>e.context==='page2'&&e.payload?.title==='fresh'));
   host.sync([],[]);await drain();assert.equal(sockets[2].closed,true);assert.equal(host.contexts.size,0);
   assert.ok(events.filter(e=>e.scope==='service'&&e.type==='start').length>=2);
 }finally{host.close();}
});

test('native service stop preference persists, restart resets only service and blocked policy is preserved',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-service-policy-'));
 const m={...scriptManifest,permissions:['display','background.run'],service:{script:'service'}};
 const cfg={context:'button',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 let starts=0;
 const runner=()=>({async run(_s,input){if(input.event.type==='start')starts++;return {ops:[],memory:{}};},close(){}});
 let host=new NativePluginHost(temp,()=>{},runner);
 const drain=async()=>{await Promise.all([...host.contexts.values()].map(c=>c.queue));};
 try{
   await host.loadServicePolicy();host.sync([cfg],[m]);await drain();
   const key='@service:'+nativeId,button=host.contexts.get(cfg.context),first=host.contexts.get(key);
   assert.equal(starts,1);assert.equal(host.serviceStatus(nativeId).state,'active');
   assert.equal((await host.manageService([m],nativeId,'restart')).state,'active');await drain();
   assert.notEqual(host.contexts.get(key),first);assert.equal(host.contexts.get(cfg.context),button);assert.equal(starts,2);
   assert.equal((await host.manageService([m],nativeId,'stop')).state,'stopped');host.sync([cfg],[m]);assert.equal(host.contexts.has(key),false);
   host.close();host=new NativePluginHost(temp,()=>{},runner);await host.loadServicePolicy();host.sync([cfg],[m]);await drain();
   assert.equal(host.serviceStatus(nativeId).state,'stopped');assert.equal(starts,2);
   await host.manageService([m],nativeId,'start');await drain();assert.equal(starts,3);assert.ok(host.contexts.has(key));
   host.close();const pref=path.join(temp,'Plugins','NativeServicePreferences.json');await fs.writeFile(pref,'invalid');
   host=new NativePluginHost(temp,()=>{},runner);await host.loadServicePolicy();host.sync([cfg],[m]);assert.equal(host.serviceStatus(nativeId).state,'policy-error');
   await assert.rejects(host.manageService([m],nativeId,'start'),/preferences/);
   assert.equal(await fs.readFile(pref,'utf8'),'invalid');assert.equal(host.contexts.has(key),false);
 }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('concurrent native service policy readers await the same persisted stop or error decision',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-policy-concurrent-'));
 const m={...scriptManifest,permissions:['display','background.run'],service:{script:'service'}};
 const key='@service:'+nativeId;
 let host,starts=0;
 const runner=()=>({async run(_s,input){if(input.event.type==='start')starts++;return {ops:[],memory:{}};},close(){}});
 try{
  await fs.mkdir(path.join(temp,'Plugins'));
  const pref=path.join(temp,'Plugins','NativeServicePreferences.json');
  for(const [raw,expected] of [[JSON.stringify({version:1,disabled:[nativeId]}),'stopped'],['invalid','policy-error']]){
   await fs.writeFile(pref,raw);
   host=new NativePluginHost(temp,()=>{},runner);
   const first=host.loadServicePolicy(),second=host.loadServicePolicy();
   assert.equal(first,second,'both callers must await the same read');
   assert.equal(host.servicePolicyLoaded,false);
   host.sync([],[m]);
   assert.equal(host.contexts.has(key),false,'service cannot start during pending policy load');
   await second;
   assert.equal(host.servicePolicyLoaded,true);
   host.sync([],[m]);
   assert.equal(host.serviceStatus(nativeId).state,expected);
   assert.equal(host.contexts.has(key),false);
   await first;
   assert.equal(starts,0);
   assert.equal(await fs.readFile(pref,'utf8'),raw);
   host.close();host=null;
  }
 }finally{host?.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('native service management cannot recreate contexts after shutdown during policy IO',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-service-close-'));
 const m={...scriptManifest,permissions:['display','background.run'],service:{script:'service'}};
 const pref=path.join(temp,'Plugins','NativeServicePreferences.json');
 let host,starts=0,release,task;
 const runner=()=>({async run(_s,input){if(input.event.type==='start')starts++;return {ops:[],memory:{}};},close(){}});
 try{
  await fs.mkdir(path.dirname(pref));
  const stopped=JSON.stringify({version:1,disabled:[nativeId]});
  await fs.writeFile(pref,stopped);
  for(const phase of ['read','committed-write']){
   host=new NativePluginHost(temp,()=>{},runner);
   let entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
   if(phase==='read'){
    const original=host.readServicePolicy.bind(host);
    host.readServicePolicy=async()=>{entered();await gate;await original();};
   }else{
    await host.loadServicePolicy();
    const original=host.saveServicePolicy.bind(host);
    host.saveServicePolicy=async next=>{await original(next);entered();await gate;};
   }
   task=host.manageService([m],nativeId,'start');task.catch(()=>{});
   await ready;
   host.close();release();
   await assert.rejects(task,/native host closed/);
   assert.equal(host.contexts.size,0);
   assert.equal(host.tickTimer,null);
   assert.equal(starts,0);
   assert.deepEqual(JSON.parse(await fs.readFile(pref,'utf8')),
    {version:1,disabled:phase==='read'?[nativeId]:[]});
   await assert.rejects(host.manageService([m],nativeId,'start'),/native host closed/);
  }
 }finally{release?.();await task?.catch(()=>{});host?.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('native elapsed clock and socket rate limit ignore wall clock changes',()=>{
 const {performance}=require('node:perf_hooks');
 const host=new NativePluginHost('/unused',()=>{},()=>({close(){}}));
 const original=Date.now,token={};
 try{
  const before=performance.now(),observed=host.now();
  assert.ok(observed>=before&&observed<=performance.now());
  let elapsed=Math.ceil(observed);host.now=()=>elapsed;
  for(let i=0;i<128;i++)assert.equal(host.socketRate(token,'receive'),true);
  const started=token.receiveRate.start,wall=original();
  // Keep the simulation synchronous so no other asynchronous task observes it.
  Date.now=()=>wall+86400000;
  assert.equal(host.socketRate(token,'receive'),false);
  Date.now=()=>wall-86400000;
  assert.equal(host.socketRate(token,'receive'),false);
  assert.equal(token.receiveRate.start,started);
  elapsed+=1000;
  for(let i=0;i<64;i++)assert.equal(host.socketRate(token,'receive'),true);
  assert.equal(host.socketRate(token,'receive'),false);
  assert.ok(host.now()>=observed);
 }finally{Date.now=original;host.close();}
});
test('native action service message is same-plugin and input-only, delivered once across page change',async()=>{
 const m={...scriptManifest,permissions:['display','background.run','network.request'],service:{script:'service'},networkEndpoints:[{id:'toggle',method:'POST',url:'https://example.com/toggle'}]};
 const calls=[],events=[];
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({async run(_s,input){
   if(input.event.type==='press')return {ops:[{op:'serviceMessage',value:{entity:'light.kitchen'}}],memory:{}};
   if(input.event.type==='serviceMessage')return {ops:[{op:'networkRequest',endpoint:'toggle',body:input.event.response.message}],memory:{}};
   return {ops:[],memory:{}};
 },close(){}}),{networkRequest:async(ep,body)=>{calls.push({ep:ep.id,body});return {endpoint:ep.id,ok:true,status:200,body:'ok',error:null};}});
 const cfg={context:'button',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const flush=async()=>{for(let i=0;i<4;i++){await new Promise(r=>setImmediate(r));await Promise.all([...host.contexts.values()].map(c=>c.queue));}};
 try{
   host.sync([cfg],[m]);await flush();
   const action=host.contexts.get(cfg.context),op={op:'serviceMessage',value:{entity:'light.kitchen'}};
   assert.throws(()=>host.validateScriptOps(action,'appear',[op]),/input event/);
   assert.throws(()=>host.validateScriptOps(action,'sharedState',[op]),/input event/);
   assert.throws(()=>host.validateScriptOps({...action,permissions:['display']},'press',[op]),/unauthorized/);
   assert.throws(()=>host.validateScriptOps(action,'press',[{...op,value:{entity:'x'.repeat(8193)}}]),/invalid global settings/);
   assert.equal(host.key(cfg.context,'down'),true);await flush();
   host.sync([],[m]);await flush();assert.deepEqual(calls,[{ep:'toggle',body:{entity:'light.kitchen'}}]);
   assert.equal(host.contexts.size,1);
 }finally{host.close();}
});

test('native WSS endpoint is permission-bound and transport enforces TLS, limits and no redirects',()=>{
 const {validateNetworkEndpoints,validateNetworkRequest,validateSocketOperation,createSocket}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const endpoint={id:'live',url:'wss://example.com/events',method:'WSS',auth:'bearer'},permissions=['display','network.websocket'];
 validateNetworkEndpoints([endpoint],permissions);
 assert.throws(()=>validateNetworkEndpoints([endpoint],['display','network.request']),/method/);
 for(const url of ['ws://example.com/events','wss://user:pass@example.com/events','wss://example.com/events?token=x','wss://example.com/events#x'])
   assert.throws(()=>validateNetworkEndpoints([{...endpoint,url}],permissions),/HTTPS\/WSS/);
 assert.throws(()=>validateNetworkRequest({op:'networkRequest',endpoint:'live',body:null},[endpoint]),/not approved/);
 assert.throws(()=>validateSocketOperation({op:'socketConnect',endpoint:'other'},[endpoint]),/not approved/);
 assert.throws(()=>validateSocketOperation({op:'socketSend',value:'x'.repeat(8193)},[endpoint]),/limit/);
 let called=0;
 class MockSocket{constructor(url,options){
   called++;assert.equal(url,endpoint.url);assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');
   assert.equal(options.followRedirects,false);assert.equal(options.perMessageDeflate,false);assert.equal(options.maxPayload,8192);
   assert.equal(options.handshakeTimeout,5000);assert.equal(options.headers.authorization,'Bearer example.token');
 }}
 assert.throws(()=>createSocket(endpoint,{WebSocket:MockSocket}),/credential/);
 createSocket(endpoint,{bearer:'example.token',WebSocket:MockSocket});assert.equal(called,1);
 const host=new NativePluginHost('/unused'),ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions,networkEndpoints:[endpoint]};
 try{
   const op={op:'socketConnect',endpoint:'live'};
   assert.deepEqual(host.validateScriptOps(ctx,'appear',[op]).effects,[op]);
   assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[op]),/unauthorized/);
   assert.throws(()=>host.validateScriptOps(ctx,'socketEvent',[op]),/input event/);
   assert.throws(()=>host.validateScriptOps(ctx,'tick',[op]),/input event/);
   assert.deepEqual(host.validateScriptOps(ctx,'socketEvent',[{op:'socketSend',value:{subscribe:true}}]).effects,[{op:'socketSend',value:{subscribe:true}}]);
 }finally{host.close();}
});
test('native WebSocket lifecycle sends and receives, isolates stale context and limits message rate',async()=>{
 const {EventEmitter}=require('node:events');
 const endpoint={id:'live',url:'wss://example.com/events',method:'WSS'};
 const manifest={...scriptManifest,permissions:['display','network.websocket'],networkEndpoints:[endpoint]};
 const sockets=[],updates=[],calls=[];
 class MockSocket extends EventEmitter{
   constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];this.terminated=false;}
   open(){this.readyState=1;this.emit('open');}
   send(data,cb){this.sent.push(data);cb();}
   terminate(){this.terminated=true;this.readyState=3;this.emit('close');}
 }
 const host=new NativePluginHost('/unused',e=>updates.push(e),()=>({async run(_src,input){
   const {type,response}=input.event;calls.push(type);
   if(type==='appear')return {ops:[{op:'socketConnect',endpoint:'live'}],memory:{}};
   if(type==='socketEvent'&&response.event==='open')return {ops:[{op:'socketSend',value:{subscribe:true}}],memory:{}};
   if(type==='socketEvent'&&response.event==='message')return {ops:[{op:'title',value:response.body}],memory:{}};
   if(type==='press')return {ops:[{op:'socketClose'}],memory:{}};
   return {ops:[],memory:{}};
 },close(){}}),{socketFactory:()=>{const socket=new MockSocket();sockets.push(socket);return socket;},now:()=>1000});
 const cfg={context:'socket',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const drain=async()=>{await flush();await host.contexts.get(cfg.context)?.queue;await flush();};
 try{
   host.sync([cfg],[manifest]);await drain();assert.equal(sockets.length,1);
   sockets[0].open();await drain();assert.deepEqual(sockets[0].sent,['{"subscribe":true}']);
   sockets[0].emit('message',Buffer.from('ready'),false);await drain();
   assert.ok(updates.some(e=>e.kind==='setTitle'&&e.payload.title==='ready'));
   host.sync([],[manifest]);assert.equal(sockets[0].terminated,true);
   sockets[0].emit('message',Buffer.from('stale'),false);await flush();
   assert.equal(updates.some(e=>e.payload?.title==='stale'),false);
   host.sync([cfg],[manifest]);await drain();assert.equal(sockets.length,2);
   sockets[1].open();await drain();
   for(let i=0;i<30;i++)sockets[1].emit('message',Buffer.from('event'+i),false);
   const ctx=host.contexts.get(cfg.context);
   for(let i=0;i<40&&ctx.socketToken?.rxCount;i++)await drain();
   assert.equal(sockets[1].terminated,false);assert.equal(host.socketPending.size,1);
   assert.equal(ctx.socketToken.rxCount,0);assert.ok(updates.some(e=>e.payload?.title==='event29'));
   host.suspend();assert.equal(host.socketPending.size,0);
 }finally{host.close();}
});

test('native HA socket auth stays in host, reconnects without replay and cancels retry on retirement',async()=>{
 const {EventEmitter}=require('node:events');
 const {validateNetworkEndpoints,credentialBinding,createSocket}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const endpoint={id:'live',url:'wss://example.com/api/websocket',method:'WSS',auth:'home-assistant',reconnect:true};
 const manifest={...scriptManifest,permissions:['display','network.websocket'],networkEndpoints:[endpoint]};
 validateNetworkEndpoints([endpoint],manifest.permissions);
 assert.throws(()=>validateNetworkEndpoints([{...endpoint,method:'GET',url:'https://example.com/'}],['display','network.request']),/method/);
 assert.throws(()=>validateNetworkEndpoints([{...endpoint,reconnect:1}],manifest.permissions),/reconnect/);
 const secret='example.token-123';
 class HeaderCheck{constructor(url,opts){assert.equal(url,endpoint.url);assert.deepEqual(opts.headers,{});}}
 createSocket(endpoint,{bearer:secret,WebSocket:HeaderCheck});
 const sockets=[],inputs=[],updates=[];
 class Mock extends EventEmitter{
   constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];}
   open(){this.readyState=1;this.emit('open');}
   message(value){this.emit('message',Buffer.from(JSON.stringify(value)),false);}
   send(data,cb){this.sent.push(JSON.parse(data));cb?.();}
   terminate(){this.readyState=3;this.emit('close',1006);}
 }
 const host=new NativePluginHost('/unused',e=>updates.push(e),()=>({async run(_src,input){
   inputs.push(input);
   if(input.event.type==='appear')return {ops:[{op:'socketConnect',endpoint:'live'}],memory:{}};
   if(input.event.response?.event==='open')return {ops:[{op:'socketSend',value:{id:1,type:'subscribe_events'}}],memory:{}};
   if(input.event.response?.event==='message')return {ops:[{op:'title',value:'received'}],memory:{}};
   return {ops:[],memory:{}};
 },close(){}}),{credentials:{async read(binding){assert.equal(binding,credentialBinding(nativeId,endpoint));return {value:{token:secret},revision:null};}},
   socketFactory:(_e,opts)=>{assert.equal(opts.bearer,secret);const s=new Mock();sockets.push(s);return s;},socketRetryDelays:[5,10]});
 const cfg={context:'ha',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const drain=async()=>{await new Promise(resolve=>setImmediate(resolve));await host.contexts.get(cfg.context)?.queue;};
 try{
   host.sync([cfg],[manifest]);await drain();
   const a=sockets[0];a.open();await drain();assert.equal(a.sent.length,0);
   a.message({type:'auth_required'});assert.deepEqual(a.sent,[{type:'auth',access_token:secret}]);
   assert.equal(inputs.some(i=>i.event.response?.event==='open'),false);
   a.message({type:'auth_ok'});await drain();assert.deepEqual(a.sent[1],{id:1,type:'subscribe_events'});
   assert.equal(JSON.stringify(inputs).includes(secret),false);
   a.message({type:'event',id:1});await drain();assert.ok(updates.some(e=>e.payload?.title==='received'));
   a.emit('close',1006);await wait(25);await drain();assert.equal(sockets.length,2);
   const b=sockets[1];assert.deepEqual(b.sent,[]);b.open();b.message({type:'auth_required'});b.message({type:'auth_ok'});await drain();
   assert.deepEqual(b.sent,[{type:'auth',access_token:secret},{id:1,type:'subscribe_events'}]);
   b.emit('close',1006);host.sync([],[manifest]);await wait(25);assert.equal(sockets.length,2);assert.equal(host.socketPending.size,0);
   host.sync([cfg],[manifest]);await drain();const bad=sockets[2];bad.open();bad.message({type:'auth_required'});bad.message({type:'auth_invalid',message:secret});await drain();
   await wait(25);assert.equal(sockets.length,3);assert.equal(host.socketPending.size,0);
   assert.equal(JSON.stringify(inputs).includes(secret),false);assert.equal(JSON.stringify(updates).includes(secret),false);
 }finally{host.close();}
});
test('native WSS heartbeat timeout closes transport without unbounded retries',async()=>{
 const {EventEmitter}=require('node:events');
 const ep={id:'live',url:'wss://example.com/events',method:'WSS'};
 const manifest={...scriptManifest,permissions:['display','network.websocket'],networkEndpoints:[ep]};
 const sockets=[];
 class Mock extends EventEmitter{
   constructor(){super();this.readyState=1;this.bufferedAmount=0;this.pings=0;}
   ping(){this.pings++;}
   terminate(){this.readyState=3;}
 }
 const host=new NativePluginHost('/unused',()=>{},()=>({async run(_s,input){return {ops:input.event.type==='appear'?[{op:'socketConnect',endpoint:'live'}]:[],memory:{}};},close(){}}),
  {socketFactory:()=>{const s=new Mock();sockets.push(s);return s;},socketHeartbeatMs:5,socketPongMs:5});
 const cfg={context:'heartbeat',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 try{
   host.sync([cfg],[manifest]);await host.contexts.get(cfg.context).queue;await new Promise(r=>setImmediate(r));
   sockets[0].emit('open');await new Promise(r=>setTimeout(r,30));
   assert.equal(sockets[0].pings,1);assert.equal(sockets[0].readyState,3);assert.equal(host.socketPending.size,0);assert.equal(sockets.length,1);
 }finally{host.close();}
});

test('native HTTPS and HA WSS use real loopback TLS, reject untrusted certificates and keep tokens in host',{timeout:15000},async()=>{
 const https=require('node:https');
 const {once}=require('node:events');
 const {WebSocket,WebSocketServer}=require('../app/node_modules/ws');
 const {validateNetworkEndpoints,validateNetworkRequest,resolveNetworkEndpoint,requestEndpoint,createSocket}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 // TEST-ONLY public fixture identity. Never use this private key or trust
 // anchor outside this single loopback test; it is intentionally public.
 const key=`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgGOTTXaaPu1kpTwgj
284iiR1Cu8Gg+oGaIfG6NFEpEvKhRANCAASNneqmjFYG4wXVgG3VY9qKho0Rdc9t
XTj1CfiTnHgSGMDHXlxbWj8z333pMB2BNH+20QCfcBAJg8lAzD4DDcf9
-----END PRIVATE KEY-----`;
 const cert=`-----BEGIN CERTIFICATE-----
MIIBbTCCAROgAwIBAgIUVhcFqjqyv/hFNu4+oAHFAphMCq4wCgYIKoZIzj0EAwIw
HjEcMBoGA1UEAwwTRGVja0ZvcmdlIHRlc3Qgb25seTAeFw0yMDAxMDEwMDAwMDBa
Fw00MDAxMDEwMDAwMDBaMB4xHDAaBgNVBAMME0RlY2tGb3JnZSB0ZXN0IG9ubHkw
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASNneqmjFYG4wXVgG3VY9qKho0Rdc9t
XTj1CfiTnHgSGMDHXlxbWj8z333pMB2BNH+20QCfcBAJg8lAzD4DDcf9oy8wLTAa
BgNVHREEEzARhwR/AAABgglsb2NhbGhvc3QwDwYDVR0TAQH/BAUwAwEB/zAKBggq
hkjOPQQDAgNIADBFAiEAjn2Li/1ZDV7CAQ3OsI6UewIGLZMQHBSKE8vhqUjhQGoC
ICK4rG79B7PmPEgFai/KKbWsiufMAf+LK9jg5K/yxkZH
-----END CERTIFICATE-----`;
 const secret='loopback.fixture-token',requests=[],frames=[],inputs=[],updates=[];
 const server=https.createServer({key,cert},(req,res)=>{
   let body='';req.setEncoding('utf8');req.on('data',s=>body+=s);req.on('end',()=>{
     requests.push({method:req.method,url:req.url,headers:req.headers,body});
     if(req.url==='/redirect'){res.writeHead(302,{location:'/unapproved'});res.end();return;}
     res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');
   });
 });
 const wss=new WebSocketServer({server,path:'/api/websocket'});
 wss.on('connection',(socket,req)=>{
   socket.on('error',()=>{});
   frames.push({upgradeAuth:req.headers.authorization||null});
   socket.send('{"type":"auth_required"}');
   socket.on('message',bytes=>{
     let frame;try{frame=JSON.parse(bytes.toString());}catch{socket.close();return;}
     frames.push(frame);
     if(frame.type==='auth'){
       socket.send(JSON.stringify({type:frame.access_token===secret?'auth_ok':'auth_invalid'}));return;
     }
     if(frame.type==='subscribe_events')socket.send(JSON.stringify({type:'event',id:frame.id,event:{state:'on'}}));
   });
 });
 let host;
 try{
   server.listen(0,'127.0.0.1');await once(server,'listening');
   const address='127.0.0.1:'+server.address().port;
   const http={id:'entity',method:'PATCH',url:'https://'+address+'/states/',auth:'bearer',pathKeys:['id'],queryKeys:['view'],headerKeys:['if-match']};
   const ws={id:'live',method:'WSS',url:'wss://'+address+'/api/websocket',auth:'home-assistant'};
   const permissions=['display','network.request','network.websocket'];
   validateNetworkEndpoints([http,ws],permissions);
   const op={op:'networkRequest',endpoint:'entity',body:{state:'on'},query:{view:'full'},options:{path:{id:'light.kitchen'},headers:{'if-match':'revision'}}};
   validateNetworkRequest(op,[http]);
   const resolved=resolveNetworkEndpoint(http,op.query,op.options);
   assert.equal((await requestEndpoint(resolved,op.body,undefined,{bearer:secret})).ok,false);
   assert.equal(requests.length,0);
   const request=(url,opts,cb)=>https.request(url,{...opts,ca:cert},cb);
   const result=await requestEndpoint(resolved,op.body,undefined,{bearer:secret,request});
   assert.deepEqual(result,{endpoint:'entity',ok:true,status:200,body:'{"ok":true}',error:null});
   assert.equal(requests[0].method,'PATCH');assert.equal(requests[0].url,'/states/light.kitchen?view=full');
   assert.equal(requests[0].headers.authorization,'Bearer '+secret);assert.equal(requests[0].headers['if-match'],'revision');
   assert.equal(requests[0].body,JSON.stringify(op.body));
   const redirect={id:'redirect',method:'GET',url:'https://'+address+'/redirect'};
   assert.equal((await requestEndpoint(redirect,null,undefined,{request})).error,'redirect-denied');
   assert.equal(requests.some(r=>r.url==='/unapproved'),false);
   const rejected=createSocket(ws,{bearer:secret});
   await once(rejected,'error');assert.equal(frames.length,0);
   class TrustedTestSocket extends WebSocket{constructor(url,opts){super(url,{...opts,ca:cert});}}
   const m={...scriptManifest,permissions,networkEndpoints:[http,ws]};
   host=new NativePluginHost('/unused',e=>updates.push(e),()=>({async run(_src,input){
     inputs.push(input);
     if(input.event.type==='appear')return {ops:[{op:'socketConnect',endpoint:'live'}],memory:{}};
     if(input.event.response?.event==='open')return {ops:[{op:'socketSend',value:{id:1,type:'subscribe_events'}}],memory:{}};
     if(input.event.response?.event==='message')return {ops:[{op:'title',value:JSON.parse(input.event.response.body).event.state}],memory:{}};
     return {ops:[],memory:{}};
   },close(){}}),{credentials:{async read(){return {value:{token:secret},revision:null};}},socketFactory:(e,opts)=>createSocket(e,{...opts,WebSocket:TrustedTestSocket})});
   const cfg={context:'real-tls',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
   host.sync([cfg],[m]);
   const until=Date.now()+4000;
   while(!updates.some(e=>e.payload?.title==='on')&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
   assert.ok(updates.some(e=>e.payload?.title==='on'),'authenticated WSS event did not reach the native action');
   assert.deepEqual(frames,[{upgradeAuth:null},{type:'auth',access_token:secret},{id:1,type:'subscribe_events'}]);
   assert.equal(JSON.stringify(inputs).includes(secret),false);assert.equal(JSON.stringify(updates).includes(secret),false);
   host.sync([],[m]);assert.equal(host.socketPending.size,0);
 }finally{
   host?.close();
   for(const socket of wss.clients)socket.terminate();
   await new Promise(resolve=>wss.close(resolve));
   await new Promise(resolve=>server.close(resolve));
 }
});

test('native HTTPS broker bounds response, denies redirects, times out and uses verified TLS',async()=>{
 const {EventEmitter}=require('node:events');
 const {requestEndpoint}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const endpoint={id:'status',url:'https://example.com/api/status',method:'GET'};
 const mock=(status,body,headers={'content-type':'application/json'})=>(url,opts,callback)=>{
   assert.equal(url.href,endpoint.url);assert.equal(opts.rejectUnauthorized,true);assert.equal(opts.agent,false);
   assert.equal(opts.method,'GET');assert.equal(opts.headers.cookie,undefined);
   const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
     const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.destroy=()=>{};
     callback(res);res.emit('data',Buffer.from(body));res.emit('end');
   };return req;
 };
 const result=await requestEndpoint(endpoint,null,undefined,{request:mock(200,'{"ok":true}')});
 assert.deepEqual(result,{endpoint:'status',ok:true,status:200,body:'{"ok":true}',error:null});
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:mock(302,'',{})})).error,'redirect-denied');
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:mock(200,'x'.repeat(8193))})).error,'response-limit');
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:mock(200,'<html>',{'content-type':'text/html'})})).error,'unsupported-response');
 const never=()=>{const req=new EventEmitter();req.end=()=>{};req.destroy=()=>{};return req;};
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:never,deadline:5})).error,'timeout');
 const controller=new AbortController(),pending=requestEndpoint(endpoint,null,controller.signal,{request:never});
 controller.abort();assert.equal((await pending).error,'cancelled');
});
test('native async network continuation does not block release or replay input; removal aborts stale response',async()=>{
 const events=[],requests=[],calls=[];
 const endpoint={id:'status',url:'https://example.com/api/status',method:'GET'};
 const manifest={...scriptManifest,permissions:['display','network.request'],networkEndpoints:[endpoint]};
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({async run(_src,input){
   calls.push(input.event.type);
   if(input.event.type==='press')return {ops:[{op:'networkRequest',endpoint:'status',body:null}],memory:{}};
   if(input.event.type==='networkResult')return {ops:[{op:'title',value:input.event.response.body}],memory:{}};
   return {ops:[],memory:{}};
 },close(){}}),{networkRequest:(e,b,signal)=>new Promise(resolve=>requests.push({signal,resolve}))});
 const cfg={context:'network',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
   host.sync([cfg],[manifest]);await host.contexts.get(cfg.context).queue;
   host.key(cfg.context,'down');await host.contexts.get(cfg.context).queue;await flush();
   assert.equal(requests.length,1);
   host.key(cfg.context,'up');await host.contexts.get(cfg.context).queue;
   assert.ok(calls.includes('release'));
   requests[0].resolve({endpoint:'status',ok:true,status:200,body:'success',error:null});
   await flush();await host.contexts.get(cfg.context).queue;
   assert.equal(events.find(e=>e.kind==='setTitle').payload.title,'success');
   host.key(cfg.context,'down');await host.contexts.get(cfg.context).queue;await flush();
   assert.equal(requests.length,2);
   host.sync([],[manifest]);assert.equal(requests[1].signal.aborted,true);
   requests[1].resolve({endpoint:'status',ok:true,status:200,body:'stale',error:null});
   await flush();assert.equal(events.some(e=>e.payload?.title==='stale'),false);
   assert.equal(calls.filter(e=>e==='press').length,2);
 }finally{host.close();}
});


test('native bearer credentials are bound to exact plugin and endpoint and never returned by status',async()=>{
 const {NativeSettingsVault}=require('../app/deckforge-editor/deckforge-native-settings.cjs');
 const {credentialBinding,validBearer}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-credential-'));
 const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async v=>Buffer.from(v),
  decryptStringAsync:async b=>({result:b.toString()})}; // Mock only, never production encryption.
 const host=new NativePluginHost(temp,()=>{},undefined,{storage});
 const ep={id:'status',url:'https://example.com/status',method:'GET',auth:'bearer'};
 const m={...scriptManifest,permissions:['display','network.request'],networkEndpoints:[ep]};
 const binding=credentialBinding(m.id,ep),secret='example.token-123';
 try{
   assert.doesNotThrow(()=>validateNativeManifest(m));
   assert.equal(validBearer('bad\r\nheader'),false);
   const before=(await host.credentialInfo(m))[0];assert.equal(before.configured,false);
   assert.equal(before.binding,binding);
   await host.writeCredential(m,binding,before.revision,secret);
   const after=(await host.credentialInfo(m))[0];
   assert.equal(after.configured,true);assert.ok(!JSON.stringify(after).includes(secret));
   assert.equal((await host.credentials.read(binding)).value.token,secret);
   assert.deepEqual((await host.vault.read(binding)).value,{});
   const changed={...m,networkEndpoints:[{...ep,url:'https://example.com/other'}]};
   assert.equal((await host.credentialInfo(changed))[0].configured,false);
   await assert.rejects(host.writeCredential(changed,binding,after.revision,secret),/changed endpoint/);
   await assert.rejects(host.writeCredential(m,binding,null,'new-token'),/credential changed/);
   await host.writeCredential(m,binding,after.revision,null);
   assert.equal((await host.credentialInfo(m))[0].configured,false);
   const wrong=new NativeSettingsVault(temp,storage,'settings');
   await fs.copyFile(host.credentials.file(binding),wrong.file(binding)).catch(async()=>{await fs.mkdir(wrong.root,{recursive:true});await fs.copyFile(host.credentials.file(binding),wrong.file(binding));});
   await assert.rejects(wrong.read(binding),/read failed/);
 }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('native broker requires credential for bearer endpoint and rejects literal token echo',async()=>{
 const {EventEmitter}=require('node:events');
 const {requestEndpoint}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const endpoint={id:'status',url:'https://example.com/status',method:'GET',auth:'bearer'};
 const token='example.token-123';let calls=0;
 const mock=text=>(_url,opts,cb)=>{
   calls++;assert.equal(opts.headers.authorization,'Bearer '+token);assert.equal(opts.rejectUnauthorized,true);
   const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
     const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/plain'};res.destroy=()=>{};
     cb(res);res.emit('data',Buffer.from(text));res.emit('end');
   };return req;
 };
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:mock('ok')})).error,'credential-required');
 assert.equal(calls,0);
 assert.equal((await requestEndpoint(endpoint,null,undefined,{request:mock('ok'),bearer:token})).body,'ok');
 const echo=await requestEndpoint(endpoint,null,undefined,{request:mock(token),bearer:token});
 assert.equal(echo.error,'credential-in-response');assert.equal(echo.body,'');
 assert.equal((await requestEndpoint({...endpoint,auth:undefined},null,undefined,{request:mock('ok'),bearer:token})).error,'credential-not-approved');
});
test('native authenticated request receives credential only in host transport, not script input',async()=>{
 const events=[],inputs=[],calls=[];
 const ep={id:'status',url:'https://example.com/status',method:'GET',auth:'bearer'};
 const m={...scriptManifest,permissions:['display','network.request'],networkEndpoints:[ep]};
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-auth-host-'));
 const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async v=>Buffer.from(v),decryptStringAsync:async b=>({result:b.toString()})};
 const token='host-only-token';
 const host=new NativePluginHost(temp,e=>events.push(e),()=>({async run(_s,input){
   inputs.push(JSON.stringify(input));
   return {ops:input.event.type==='press'?[{op:'networkRequest',endpoint:'status',body:null}]:[],memory:{}};
 },close(){}}),{storage,networkRequest:async(e,_b,_signal,options)=>{
   calls.push([e.id,options.bearer]);return {endpoint:e.id,ok:true,status:200,body:'ok',error:null};
 }});
 try{
   const info=(await host.credentialInfo(m))[0];await host.writeCredential(m,info.binding,info.revision,token);
   const cfg={context:'auth',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
   host.sync([cfg],[m]);await host.contexts.get(cfg.context).queue;
   host.key(cfg.context,'down');await host.contexts.get(cfg.context).queue;
   for(let i=0;i<100&&host.networkPending.size;i++)await new Promise(r=>setTimeout(r,5));
   await host.contexts.get(cfg.context).queue;
   assert.deepEqual(calls,[['status',token]]);
   assert.equal(inputs.some(v=>v.includes(token)),false);assert.equal(JSON.stringify(events).includes(token),false);
   assert.ok(inputs.some(v=>v.includes('networkResult')));
 }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});


test('Ulanzi inspector analysis proposes only bounded native fields and never loads scripts or secret defaults',()=>{
 const {analyzeHtml,localRef}=require('../app/deckforge-editor/ulanzi-inspector-analysis.cjs');
 const source='<form id="property-inspector"><div class="uspi-item"><div class="uspi-item-label">Label &amp; name</div><input name="label" maxlength="32" value="Ready"></div>'+
 '<select name="mode"><option value="a">A</option><option value="b" selected>B</option></select>'+
 '<input name="count" type="number" min="0" max="10" value="2">'+
 '<input name="enabled" type="checkbox" value="digital"><select name="dynamic"></select>'+
 '<input name="token" value="do-not-export"><textarea name="request_headers">secret</textarea></form>'+
 '<script src="../lib.js"></script><script src="https://example.com/ex.js"></script><script>throw Error("never execute")</script>';
 const report=analyzeHtml('pi/inspector.html',source,{inspector:true});
 assert.deepEqual(report.settingsSchemaCandidate.map(f=>[f.key,f.default]),[['label','Ready'],['mode','b'],['count',2]]);
 assert.equal(report.settingsSchemaCandidate[0].label,'Label & name');
 assert.equal(report.fields.find(f=>f.key==='enabled').reason,'checkbox-serialization-review');
 assert.equal(report.fields.find(f=>f.key==='dynamic').reason,'dynamic-options');
 assert.equal(report.fields.find(f=>f.key==='token').reason,'sensitive-or-external-value');
 assert.equal(JSON.stringify(report).includes('do-not-export'),false);
 assert.deepEqual(report.scripts.map(s=>s.kind),['local','external','inline']);
 assert.equal(localRef('pi/inspector.html','../../outside.js'),null);
 assert.equal(localRef('pi/inspector.html','../lib.js'),'lib.js');
});
test('Ulanzi directory analysis inventories HTML entry, inspector proposals and state artwork without installing',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ulanzi-html-'));
 const root=path.join(temp,'demo.ulanziPlugin');await fs.mkdir(root);
 const id='com.ulanzi.ulanzistudio.HtmlDemo';
 const manifest={Type:'JavaScript',UUID:id,Name:'Demo',Version:'1.0.0',CodePath:'app.html',Actions:[
  {UUID:id+'.action',Name:'Action',PropertyInspectorPath:'pi.html',States:[{Image:'icon.png'}]}]};
 try{
   await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
   await fs.writeFile(path.join(root,'app.html'),'<script src="app.js"></script>');
   await fs.writeFile(path.join(root,'app.js'),'throw Error("not executed")');
   await fs.writeFile(path.join(root,'pi.html'),'<form id="property-inspector"><input name="label" value="Ready"></form>');
   const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(13,8);
   png.write('IHDR',12);png.writeUInt32BE(144,16);png.writeUInt32BE(144,20);
   await fs.writeFile(path.join(root,'icon.png'),png);
   const result=await analyzeDirectory(root);
   assert.equal(result.converterVersion,3);assert.equal(result.installationAllowed,false);
   assert.equal(result.candidate,null);assert.equal(result.htmlEntry.scripts[0].status,'review');
   assert.equal(result.inspectors[0].settingsSchemaCandidate[0].default,'Ready');
   assert.equal(result.resources[0].status,'header-candidate');assert.equal(result.resources[0].width,144);
   assert.match(result.resources[0].sha256,/^[a-f0-9]{64}$/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});


test('Ulanzi documented temporary PNG image maps to the native host trace without executing source',()=>{
 const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const id='com.ulanzi.ulanzistudio.ImageDemo',m={Type:'JavaScript',UUID:id,Name:'Image',Version:'1.0.0',
 CodePath:'app.js',Actions:[{UUID:id+'.image',Name:'Image'}]};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 const image='data:image/png;base64,'+png.toString('base64');
 const source="$UD.connect('"+id+"');$UD.onKeyDown(m=>$UD.setImage(m.context,{isDefault:false,icons:{source:'base64',base64:"+JSON.stringify(image)+"}}));";
 const report=analyzeSource(m,source);
 assert.deepEqual(report.candidate.actions[0].events.press,[{op:'image',value:image}]);
 assert.equal(report.verification.status,'pass');
 for(const bad of [source.replace('isDefault:false','isDefault:true'),source.replace("source:'base64'","source:'path'"),source.replace('isDefault:false','isDefault:false,isDefault:false'),source.replace('isDefault:false','...x,isDefault:false')])
   assert.equal(analyzeSource(m,bad).candidate,null);
});
test('native author package round-trips through installer validation and refuses overwrite or unreviewed candidate',async()=>{
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const {packageFile,prepareReview}=require('../app/deckforge-editor/deckforge-sdk-cli.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-author-'));
 try{
   const pack=await packageNativeManifest(scriptManifest);
   assert.deepEqual((await parseDeckForgePackage(pack.archive)).native,scriptManifest);
   const input=path.join(temp,'native.json');await fs.writeFile(input,JSON.stringify(scriptManifest));
   const file=await packageFile(input,temp);
   assert.equal(path.extname(file),'.deckforgePlugin');
   await assert.rejects(packageFile(input,temp),/EEXIST/);
   const folder=path.join(temp,'source.ulanziPlugin');await fs.mkdir(folder);
   const id='com.ulanzi.ulanzistudio.Review',m={Type:'JavaScript',UUID:id,Name:'Review',Version:'1.0.0',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A'}]};
   await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(m));
   await fs.writeFile(path.join(folder,'app.js'),"$UD.connect('"+id+"');$UD.onKeyDown(m=>$UD.setTitle(m.context,'Ready'));");
   const reviewPath=await prepareReview(folder,temp),report=JSON.parse(await fs.readFile(reviewPath,'utf8'));
   assert.equal(report.installationAllowed,false);assert.ok(report.candidate);
   await assert.rejects(prepareReview(folder,folder),/outside source/);
   await fs.writeFile(input,JSON.stringify(report.candidate));
   await assert.rejects(packageFile(input,temp),/reviewed conversion/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});


test('official pinned Ulanzi examples are analyzed without pretending unsupported code is convertible',async()=>{
 const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {analyzeHtml}=require('../app/deckforge-editor/ulanzi-inspector-analysis.cjs');
 const dir=path.join(__dirname,'fixtures','ulanzi-sdk');
 const info=JSON.parse(await fs.readFile(path.join(dir,'sources.json'),'utf8'));
 assert.equal(info.commit,'550ab80c69285ecf259bd494a7fff767c14f0c0f');
 // Git may normalize line endings on Windows checkout. Verify exact upstream
 // bytes or the LF/CRLF equivalent, without rewriting any fixture.
 const hash=b=>require('node:crypto').createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 for(const item of info.files){
   const raw=await fs.readFile(path.join(dir,item.file)),lf=raw.toString('utf8').replace(/\r\n/g,'\n');
   assert.ok([raw,Buffer.from(lf),Buffer.from(lf.replace(/\n/g,'\r\n'))].some(b=>hash(b)===item.gitBlobSha),item.file+' fixture provenance');
 }
 const load=(name,file)=>fs.readFile(path.join(dir,name,file),'utf8');
 for(const name of ['api','clock']){
   const m=JSON.parse(await load(name,'manifest.json'));
   // API Request source entry is inspected, not its bundled dist artifact.
   // Clock app.js is an HTML-loaded source, not a direct manifest entry.
   const result=analyzeSource(m,await load(name,'app.js'));
   assert.equal(result.candidate,null);
   assert.ok(result.findings.some(f=>f.code==='private-api'));
   assert.ok(result.calls.some(c=>c.name==='onRun'&&c.support==='review'));
   assert.ok(result.calls.some(c=>c.name==='onParamFromApp'&&c.support==='candidate'));
   const inspector=analyzeHtml('property-inspector/action/inspector.html',await load(name,'inspector.html'),{inspector:true});
   const {analyzeInspectorScript}=require('../app/deckforge-editor/ulanzi-inspector-analysis.cjs');
   const behavior=analyzeInspectorScript(await load(name,'inspector.js'));
   assert.equal(behavior.status,'static-inventory');
   assert.ok(behavior.sdkMethods.includes('sendParamFromPlugin'));
   for(const flag of ['dynamic-options','form-serialization','form-restoration','setting-rewrite'])assert.ok(behavior.behaviors.includes(flag),name+' '+flag);
   if(name==='api')assert.ok(behavior.behaviors.includes('conditional-visibility'));
   assert.equal(behavior.requiresReview,true);
   assert.equal(inspector.requiresReview,true);
   assert.ok(inspector.scripts.some(s=>s.kind==='local'));
   if(name==='api'){
     assert.ok(inspector.fields.some(f=>f.key==='request_headers'&&f.reason==='sensitive-or-external-value'));
     assert.ok(inspector.fields.some(f=>f.key==='response_color'&&f.reason==='dynamic-options'));
     assert.ok(inspector.settingsSchemaCandidate.some(f=>f.key==='request_method'&&f.default==='GET'));
   }else{
     assert.ok(inspector.fields.some(f=>f.key==='clock_index'&&f.reason==='dynamic-options'));
     assert.ok(inspector.fields.some(f=>f.key==='clock_type'&&f.reason==='checkbox-serialization-review'));
     const html=analyzeHtml('plugin/app.html',await load(name,'app.html'));
     assert.ok(html.scripts.some(s=>s.path==='plugin/app.js'));
   }
 }
});


test('native periodic display uses permission, skips busy ticks and stops on context retirement',async()=>{
 let now=1000;const calls=[],events=[];
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({async run(_s,input){
   calls.push(input.event.type);return {ops:input.event.type==='tick'?[{op:'title',value:'Tick'}]:[],memory:{}};
 },close(){}}),{now:()=>now});
 const m={...scriptManifest,permissions:['display','timer.tick'],actions:[{...scriptManifest.actions[0],tickIntervalMs:1000}]};
 const cfg={context:'tick',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,permissions:['display']}),/tick interval/);
 assert.throws(()=>validateNativeManifest({...m,actions:[{...m.actions[0],tickIntervalMs:1}]}),/tick interval/);
 try{
   host.sync([cfg],[m]);const ctx=host.contexts.get(cfg.context);await ctx.queue;
   host.tick(1999);assert.deepEqual(calls,['appear']);
   now=2000;host.tick();await ctx.queue;assert.equal(calls.at(-1),'tick');
   now=100000;host.tick();await ctx.queue;assert.equal(calls.filter(x=>x==='tick').length,2);
   ctx.pending=1;now=101000;host.tick();ctx.pending=0;
   assert.equal(calls.filter(x=>x==='tick').length,2);
   host.suspend();assert.equal(host.tickTimer,null);now=200000;host.tick();
   host.resume();await ctx.queue;assert.equal(calls.at(-1),'appear');
   assert.equal(ctx.tickDue,201000);
   host.sync([],[m]);assert.equal(host.tickTimer,null);
   host.tick(300000);assert.equal(calls.filter(x=>x==='tick').length,2);
 }finally{host.close();}
});
test('periodic network permits only explicitly authorized GET and never chains networkResult',()=>{
 const endpoint={id:'status',url:'https://example.com/status',method:'GET'};
 const m={...scriptManifest,permissions:['display','timer.tick','network.request','network.poll'],networkEndpoints:[endpoint],
  actions:[{...scriptManifest.actions[0],tickIntervalMs:5000}]};
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,permissions:['display','network.request','network.poll']}),/polling requires/);
 const host=new NativePluginHost('/unused');
 const ctx={pluginUUID:nativeId,action:m.actions[0],permissions:m.permissions,networkEndpoints:[endpoint]};
 const op={op:'networkRequest',endpoint:'status',body:null};
 assert.deepEqual(host.validateScriptOps(ctx,'tick',[op]).effects,[op]);
 assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display','timer.tick','network.request']},'tick',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps({...ctx,action:{...ctx.action,tickIntervalMs:1000}},'tick',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps({...ctx,networkEndpoints:[{...endpoint,method:'POST'}]},'tick',[{...op,body:{}}]),/must use GET/);
 assert.throws(()=>host.validateScriptOps(ctx,'networkResult',[op]),/input event/);
 assert.throws(()=>host.validateScriptOps(ctx,'tick',[{op:'navigate',target:'page',value:1}]),/input event/);
 host.close();
});


test('periodic sweep cap does not starve contexts beyond the first eight',async()=>{
 let now=0;const events=[];
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({async run(_s,input){
   return {ops:input.event.type==='tick'?[{op:'title',value:'Tick'}]:[],memory:{}};
 },close(){}}),{now:()=>now});
 const m={...scriptManifest,permissions:['display','timer.tick'],actions:[{...scriptManifest.actions[0],tickIntervalMs:1000}]};
 const configs=Array.from({length:10},(_,slot)=>({context:'tick-'+slot,slot,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}}));
 const flush=()=>Promise.all([...host.contexts.values()].map(c=>c.queue));
 try{
   host.sync(configs,[m]);await flush();
   now=1000;host.tick();await flush();assert.equal(events.filter(e=>e.kind==='setTitle').length,8);
   now=2000;host.tick();await flush();
   assert.equal(new Set(events.filter(e=>e.kind==='setTitle').map(e=>e.context)).size,10);
 }finally{host.close();}
});


test('reviewed Ulanzi package requires exact source and candidate revision plus explicit manual evidence',async()=>{
 const {prepareReview,releaseReviewed}=require('../app/deckforge-editor/deckforge-sdk-cli.cjs');
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-release-review-'));
 const folder=path.join(temp,'source.ulanziPlugin');await fs.mkdir(folder);
 const id='com.ulanzi.ulanzistudio.Release',manifest={Type:'JavaScript',UUID:id,Name:'Review',Version:'1.0.0',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A'}]};
 try{
   await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest));
   await fs.writeFile(path.join(folder,'app.js'),"$UD.connect('"+id+"');$UD.onKeyDown(m=>$UD.setTitle(m.context,'Ready'));");
   const other=path.join(folder,'dependency.js');await fs.writeFile(other,'// revision 1');
   const reviewPath=await prepareReview(folder,temp);
   const report=JSON.parse(await fs.readFile(reviewPath,'utf8')),record=report.review;
   assert.match(record.source.treeSha256,/^[a-f0-9]{64}$/);
   const recordPath=path.join(temp,'record.json');
   await fs.writeFile(recordPath,JSON.stringify(record));
   await assert.rejects(releaseReviewed(folder,recordPath,temp),/manual review evidence/);
   await assert.rejects(packageNativeManifest(report.candidate),/런타임 또는 원본/);
   // Synthetic evidence tests only the workflow, not a real hardware pass.
   for(const check of record.checks){check.status='passed';check.evidence='synthetic test fixture';}
   await fs.writeFile(recordPath,JSON.stringify(record));
   await fs.writeFile(other,'// revision 2');
   await assert.rejects(releaseReviewed(folder,recordPath,temp),/conversion changed/);
   await fs.writeFile(other,'// revision 1');
   const archive=await releaseReviewed(folder,recordPath,temp);
   const parsed=await parseDeckForgePackage(await fs.readFile(archive));
   assert.equal(parsed.meta.source.kind,'ulanzi-converted');
   assert.deepEqual(parsed.native,report.candidate);
   const altered=structuredClone(report.candidate);altered.actions[0].events.press[0].value='Changed';
   await assert.rejects(packageNativeManifest(altered,parsed.meta.source),/무결성/);
   await assert.rejects(releaseReviewed(folder,recordPath,temp),/EEXIST/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});


test('native state PNGs populate catalog and survive package roundtrip without changing user settings',async()=>{
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
 const m={...nativeManifest,actions:[{...nativeManifest.actions[0],stateImages:[png,png]}]};
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-state-art-')),host=new NativePluginHost(temp);
 try{
   assert.throws(()=>validateNativeManifest({...m,actions:[{...m.actions[0],stateImages:[png]}]}),/state image count/);
   assert.throws(()=>validateNativeManifest({...m,actions:[{...m.actions[0],stateImages:[png,'https://example.com/x.png']}]}),/PNG/);
   const catalog=await host.install(m);assert.deepEqual(catalog.actions[0].defaultImages,{off:png,on:png});
   const pack=await packageNativeManifest(m);
   assert.deepEqual((await parseDeckForgePackage(pack.archive)).native,m);
 }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});
test('Ulanzi state PNG bytes are embedded while unrelated artwork blocks reviewed release',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-art-review-'));
 const dir=path.join(root,'original.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.Art',m={Type:'JavaScript',UUID:id,Name:'Art',Version:'1.0.0',CodePath:'app.js',
 Actions:[{UUID:id+'.action',Name:'Action',Icon:'off.png',States:[{Image:'off.png'},{Image:'on.png'}]}]};
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 const attest=report=>{const record=buildReviewRecord(report);for(const c of record.checks){c.status='passed';c.evidence='synthetic fixture only';}return record;};
 try{
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
   await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onKeyDown(m=>$UD.setState(m.context,1));");
   for(const name of ['off.png','on.png','category.png'])await fs.writeFile(path.join(dir,name),bytes);
   const report=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.deepEqual(report.candidate.actions[0].stateImages,Array(2).fill('data:image/png;base64,'+bytes.toString('base64')));
   assert.equal(report.verification.status,'pass');
   assert.deepEqual(report.artworkPreservation.remainingPaths,[]);
   assert.equal(validateReviewRecord(attest(report),report).kind,'ulanzi-converted');
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({...m,CategoryIcon:'category.png'}));
   const extra=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.deepEqual(extra.artworkPreservation.remainingPaths,['category.png']);
   assert.throws(()=>validateReviewRecord(attest(extra),extra),/manual conversion/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('conversion PNG verification rejects CRC corruption, truncation, extra data and decompression overflow',()=>{
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const {crc32,deflateSync}=require('node:zlib');
 const valid=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 assert.deepEqual(verifyPng(valid),{ok:true,width:1,height:1,verification:'crc-and-bounded-scanlines'});
 const corrupt=Buffer.from(valid);corrupt[45]^=1;
 assert.equal(verifyPng(corrupt).ok,false);
 assert.equal(verifyPng(valid.subarray(0,-1)).ok,false);
 assert.equal(verifyPng(Buffer.concat([valid,Buffer.from([0])])).ok,false);
 const chunk=(type,data)=>{
   const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);
   const tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data])));
   return Buffer.concat([head,data,tail]);
 };
 const oversized=Buffer.concat([valid.subarray(0,33),chunk('IDAT',deflateSync(Buffer.alloc(4096))),valid.subarray(-12)]);
 assert.equal(verifyPng(oversized).ok,false);
 const badFilter=Buffer.concat([valid.subarray(0,33),chunk('IDAT',deflateSync(Buffer.from([5,0,0]))),valid.subarray(-12)]);
 assert.equal(verifyPng(badFilter).ok,false);
 const animation=Buffer.concat([valid.subarray(0,33),chunk('acTL',Buffer.alloc(8)),valid.subarray(33)]);
 assert.equal(verifyPng(animation).ok,false);
});

test('Ulanzi restricted multi-action routing separates declared UUID branches and controllers',()=>{
  const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
  const id='com.ulanzi.ulanzistudio.Multi',key=id+'.key',dial=id+'.dial',other=id+'.other';
  const m={Type:'JavaScript',UUID:id,Name:'Multi',Version:'1',CodePath:'app.js',Actions:[
    {UUID:key,Name:'Key',States:[{},{}]},{UUID:dial,Name:'Dial',Controllers:['Encoder']},{UUID:other,Name:'Other'}]};
  const src="$UD.connect('"+id+"');$UD.onAdd(m=>{if(m.uuid === '"+key+"'){$UD.setTitle(m.context,'Key');}else if(m.uuid === '"+dial+"'){$UD.setTitle(m.context,'Dial');}else{$UD.setTitle(m.context,'Other');}});"+
    "$UD.onKeyDown(m=>{if(m.uuid === '"+key+"'){$UD.setState(m.context,1);}else{$UD.setTitle(m.context,'Other down');}});"+
    "$UD.onDialRotateLeft(m=>$UD.setTitle(m.context,'Left'));";
  const result=analyzeSource(m,src);
  assert.ok(result.candidate);
  assert.equal(result.verification.status,'pass');
  assert.equal(result.verification.installationAllowed,false);
  const [a,b,c]=result.candidate.actions;
  assert.equal(new Set([a.id,b.id,c.id]).size,3);
  assert.deepEqual(a.events.press,[{op:'state',value:1}]);
  assert.deepEqual(b.events.rotateLeft,[{op:'title',value:'Left'}]);
  assert.equal(b.events.press,undefined);
  assert.deepEqual(c.events.press,[{op:'title',value:'Other down'}]);
  assert.equal(result.verification.checks.find(x=>x.name==='multi-appear').pass,true);
  for(const bad of [src.replace('m.uuid ===','m.actionid ==='),src.replace(key,id+'.unknown'),src+"$UD.onKeyDown(m=>{});",src.replace("'Other down'","m.param.title")])
    assert.equal(analyzeSource(m,bad).candidate,null);
  const reordered=analyzeSource({...m,Actions:[m.Actions[2],m.Actions[0],m.Actions[1]]},src);
  assert.equal(reordered.candidate.actions.find(x=>x.name==='Key').id,a.id);
});

test('multi-action Ulanzi PNG preservation keeps resource ownership and requires full reviewed evidence',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-multi-art-'));
 const dir=path.join(root,'original.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.MultiArt',m={Type:'JavaScript',UUID:id,Name:'Multi Art',Version:'1.0.0',CodePath:'app.js',
 Actions:[{UUID:id+'.a',Name:'A',Icon:'a.png',States:[{Image:'a.png'}]},{UUID:id+'.b',Name:'B',Icon:'b.png',States:[{Image:'b.png'}]}]};
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 const attest=report=>{const record=buildReviewRecord(report);for(const c of record.checks){c.status='passed';c.evidence='synthetic fixture only';}return record;};
 try{
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
   await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));");
   for(const name of ['a.png','b.png'])await fs.writeFile(path.join(dir,name),bytes);
   const report=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.equal(report.verification.status,'pass');
   assert.equal(report.artworkPreservation.actions.length,2);
   assert.deepEqual(report.artworkPreservation.remainingPaths,[]);
   assert.equal(report.artworkPreservation.actions[1].actionId,report.candidate.actions[1].id);
   assert.equal(report.artworkPreservation.actions[1].stateImages[0].path,'b.png');
   assert.equal(report.candidate.actions[1].stateImages.length,1);
   assert.throws(()=>validateReviewRecord(buildReviewRecord(report),report),/manual review evidence/);
   assert.equal(validateReviewRecord(attest(report),report).kind,'ulanzi-converted');
   const swapped=structuredClone(m);swapped.Actions[0].Icon='b.png';
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(swapped));
   const cross=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.deepEqual(cross.artworkPreservation.remainingPaths,['b.png']);
   assert.throws(()=>validateReviewRecord(attest(cross),cross),/manual conversion/);
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
   await fs.writeFile(path.join(dir,'b.png'),bytes.subarray(0,-1));
   const corrupt=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.equal(corrupt.candidate.actions[1].stateImages,undefined);
   assert.throws(()=>validateReviewRecord(attest(corrupt),corrupt),/manual conversion/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Ulanzi type-guarded dynamic titles map settings events and reject sensitive or arbitrary expressions',()=>{
 const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const id='com.ulanzi.ulanzistudio.Dynamic',m={Type:'JavaScript',UUID:id,Name:'Dynamic',Version:'1.0.0',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A'}]};
 const display="m=>$UD.setTitle(m.context,typeof m.param?.label === 'string' ? m.param.label : 'Ready')";
 const source="$UD.connect('"+id+"');$UD.onAdd("+display+");$UD.onParamFromApp("+display+");";
 const result=analyzeSource(m,source);
 assert.deepEqual(result.candidate.actions[0].events.settings,[{op:'titleFromSetting',key:'label',fallback:'Ready'}]);
 assert.equal(result.verification.status,'pass');
 assert.equal(result.verification.checks.find(c=>c.name==='settings-sync').pass,true);
 assert.equal(result.verification.checks.find(c=>c.name==='settings-non-string-fallback').pass,true);
 assert.ok(result.findings.some(f=>f.code==='dynamic-settings'));
 assert.equal(result.installationAllowed,undefined);
 for(const bad of [source.replaceAll('label','token'),source.replaceAll('m.param.label','m.param.other'),source.replaceAll('typeof m.param?.label','typeof m.param.label'),source.replaceAll("'string'","'number'")])
   assert.equal(analyzeSource(m,bad).candidate,null);
 const multi=analyzeSource({...m,Actions:[...m.Actions,{UUID:id+'.b',Name:'B'}]},source);
 assert.equal(multi.verification.status,'pass');
});

test('Ulanzi media inventory preserves animation structure and rejects unsafe SVG without rendering',()=>{
 const {gifReport,svgReport}=require('../app/deckforge-editor/ulanzi-media-analysis.cjs');
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==','base64');
 const result=gifReport(gif);
 assert.equal(result.status,'bounded-animation-review');assert.equal(result.frames,1);
 assert.equal(result.verification,'bounded-lzw-indices');
 const noEnd=Buffer.from(gif);noEnd[noEnd.length-3]=0;
 assert.equal(gifReport(noEnd).status,'manual-resource-review');
 const frameStart=gif.indexOf(0x2c,19);
 const animated=Buffer.concat([gif.subarray(0,-1),gif.subarray(frameStart,-1),gif.subarray(-1)]);
 assert.equal(gifReport(animated).frames,2);
 assert.equal(gifReport(gif.subarray(0,-1)).status,'manual-resource-review');
 const oversized=Buffer.from(gif);oversized.writeUInt16LE(145,6);
 assert.equal(gifReport(oversized).status,'manual-resource-review');
 const src='<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><path d="M0 0 L144 144" stroke="#fff"/></svg>';
 const svg=svgReport(Buffer.from(src));
 assert.equal(svg.status,'restricted-vector-review');assert.equal(svg.verification,'syntax-subset-only');
 for(const bad of [src.replace('<path','<script'),src.replace('stroke="#fff"','stroke="url(http://a)"'),src.replace('<path','<path onload="x"'),src.replace('</svg>',''),src.replace('width="144"','width="999"'),src.replace('<path','<path href="x"')])
   assert.equal(svgReport(Buffer.from(bad)).status,'manual-resource-review');
});

test('restricted SVG native images retain bytes, reject active content, and require review for conversion',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f00"/></svg>';
 const uri=s=>'data:image/svg+xml;base64,'+Buffer.from(s).toString('base64');
 const image=uri(svg);
 const action={...nativeManifest.actions[0],stateImages:[image,image],events:{press:[{op:'image',value:image}]}};
 const m={...nativeManifest,actions:[action]};
 assert.deepEqual((await parseDeckForgePackage((await packageNativeManifest(m)).archive)).native,m);
 for(const bad of [svg.replace('<rect','<rect onload="x"'),svg.replace('#f00','url(http://a)'),svg.replace('width="16" height="16" fill','width="1e999" height="16" fill')])
   assert.throws(()=>validateNativeManifest({...m,actions:[{...action,stateImages:[uri(bad),image]}]}),/SVG/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-svg-art-')),dir=path.join(root,'source.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.Vector';
 try{
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({Type:'JavaScript',UUID:id,Name:'Vector',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A',States:[{Image:'icon.svg'}]}]}));
  await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Vector'));");
  await fs.writeFile(path.join(dir,'icon.svg'),svg);
  const report=await analyzeDirectory(dir,{fullFingerprint:true});
  assert.equal(report.candidate.actions[0].stateImages[0],image);
  assert.equal(report.artworkPreservation.verification,'bounded-png-and-restricted-svg');
  assert.throws(()=>validateReviewRecord(buildReviewRecord(report),report),/manual review evidence/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('opaque GIF decoder retains complete frames, colors, timing and PNG output without installing',()=>{
 const {decodeOpaqueGif,opaqueGifPngFrames,gifReport}=require('../app/deckforge-editor/ulanzi-media-analysis.cjs');
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const {inflateSync}=require('node:zlib');
 const header=Buffer.from('47494638396101000100800000ff00000000ff','hex');
 const frame=(index,delay)=>Buffer.from([0x21,0xf9,4,0,delay,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,4|(index<<3)|(5<<6&255),1,0]);
 const gif=Buffer.concat([header,frame(0,5),frame(1,10),Buffer.from([0x3b])]);
 const decoded=decodeOpaqueGif(gif);
 assert.equal(decoded.frames,2);
 assert.deepEqual(decoded.decodedFrames.map(f=>[f.delayMs,[...f.rgba]]),[[50,[255,0,0,255]],[100,[0,0,255,255]]]);
 const rendered=opaqueGifPngFrames(gif);
 assert.equal(rendered.frames.length,2);
 for(const [i,f] of rendered.frames.entries()){
   assert.equal(verifyPng(f.png).ok,true);
   const n=f.png.readUInt32BE(33),raw=inflateSync(f.png.subarray(41,41+n));
   assert.deepEqual([...raw],[0,...decoded.decodedFrames[i].rgba]);
 }
 const transparent=Buffer.from(gif);transparent[22]=1;
 assert.equal(gifReport(transparent).status,'bounded-animation-review');
 assert.throws(()=>decodeOpaqueGif(transparent),/compositing/);
});

test('GIF partial frames honor transparency and restore background or previous pixels',()=>{
 const {decodeCompositeGif,gifPngFrames}=require('../app/deckforge-editor/ulanzi-media-analysis.cjs');
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const header=Buffer.from('47494638396102000100800000ff00000000ff','hex');
 const frame=(x,w,indices,packed=0)=>{
   // Clear between pixels: fixed 3-bit codes, no dictionary-width transition.
   const codes=indices.flatMap(i=>[4,i]).concat(5);
   const data=Buffer.alloc(Math.ceil(codes.length*3/8));
   codes.forEach((c,i)=>{for(let b=0;b<3;b++)if(c&(1<<b))data[(i*3+b)>>3]|=1<<((i*3+b)&7);});
   return Buffer.concat([Buffer.from([0x21,0xf9,4,packed,5,0,0,0,0x2c,x,0,0,0,w,0,1,0,0,2,data.length]),data,Buffer.from([0])]);
 };
 const bytes=Buffer.concat([header,frame(0,2,[0,1],1),frame(0,1,[1],13),frame(1,1,[0],1),frame(0,1,[1],9),frame(1,1,[1],1),Buffer.from([0x3b])]);
 const decoded=decodeCompositeGif(bytes);
 const red=[255,0,0,255],blue=[0,0,255,255],clear=[0,0,0,0];
 assert.deepEqual(decoded.decodedFrames.map(f=>[...f.rgba]),[[...clear,...blue],[...blue,...blue],[...clear,...blue],[...blue,...blue],[...clear,...blue]]);
 const encoded=gifPngFrames(bytes);
 assert.equal(encoded.frames.length,5);
 assert.ok(encoded.frames.every(f=>verifyPng(f.png).ok&&f.delayMs===50));
 const interactive=Buffer.from(bytes);interactive[22]|=2;
 assert.throws(()=>decodeCompositeGif(interactive),/interactive/);
});

test('animation clock skips late frames, preserves finite loops, isolates pages and serializes writers',()=>{
 const {animationTimeline,AnimationClock}=require('../app/deckforge-editor/deckforge-animation-clock.cjs');
 const {gifPngFrames}=require('../app/deckforge-editor/ulanzi-media-analysis.cjs');
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==','base64');
 const png=gifPngFrames(gif).frames[0].png;
 const animation={loopCount:1,frames:[{png,delayMs:20},{png,delayMs:150},{png,delayMs:100}]};
 const tl=animationTimeline(animation);
 assert.equal(tl.at(99).index,0);assert.equal(tl.at(100).index,1);assert.equal(tl.at(349).index,2);
 assert.equal(tl.at(350).index,0);assert.equal(tl.at(700).done,true);
 let time=0;const clock=new AnimationClock(()=>time);
 clock.replace([{slot:0,animation},{slot:1,animation}]);
 const a=clock.next();assert.equal(a.slot,0);assert.equal(clock.next(),null);
 clock.settle(a,true);const b=clock.next();assert.equal(b.slot,1);clock.settle(b,true);
 time=275;const late=clock.next();assert.equal(late.index,2);
 clock.replace([{slot:3,animation}]);
 assert.equal(clock.isCurrent(late),false);assert.equal(clock.next(),null);
 assert.equal(clock.settle(late,true),false);
 const next=clock.next();assert.equal(next.slot,3);assert.equal(next.index,0);clock.settle(next,true);
 clock.pause();assert.equal(clock.next(),null);clock.resume();
 const resumed=clock.next();assert.equal(resumed.index,0);clock.settle(resumed,true);
 clock.clear();assert.equal(clock.next(),null);
 assert.throws(()=>clock.replace([{slot:13,animation}]),/slot/);
 assert.throws(()=>animationTimeline({...animation,frames:[{png:Buffer.from('bad'),delayMs:5}]}),/frame/);
});

test('inert Ulanzi inspector schema is bound only to matching source settings and remains review-only',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-inspector-bind-')),dir=path.join(root,'source.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.Form',m={Type:'JavaScript',UUID:id,Name:'Form',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A',PropertyInspectorPath:'pi.html'}]};
 const form='<form id="property-inspector"><label for="label">Label</label><input id="label" name="label" maxlength="8" value="Ready"></form>';
 const display="m=>$UD.setTitle(m.context,typeof m.param?.label === 'string' ? m.param.label : 'Ready')";
 const src="$UD.connect('"+id+"');$UD.onAdd("+display+");$UD.onParamFromApp("+display+");";
 try{
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
  await fs.writeFile(path.join(dir,'app.js'),src);
  await fs.writeFile(path.join(dir,'pi.html'),form);
  const report=await analyzeDirectory(dir,{fullFingerprint:true});
  assert.equal(report.inspectors[0].staticSchema,true);
  assert.deepEqual(report.candidate.actions[0].settingsSchema,[{key:'label',label:'Label',type:'text',maxLength:8,default:'Ready'}]);
  assert.equal(report.verification.status,'pass');
  const record=buildReviewRecord(report);for(const c of record.checks){c.status='passed';c.evidence='synthetic fixture only';}
  assert.throws(()=>validateReviewRecord(record,report),/manual conversion/);
  for(const bad of [form.replace('Ready','Other'),form.replace('</form>','<input name="extra"></form>'),form+'<script src="pi.js"></script>',form.replace('<input','<input onchange="update()"')]){
    await fs.writeFile(path.join(dir,'pi.html'),bad);
    assert.equal((await analyzeDirectory(dir)).candidate,null);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('API 2 settings generation cancels stale queued and in-flight effects even after ABA changes',async()=>{
 const events=[],calls=[];let finish;
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({
  async run(_source,input){
   calls.push([input.event.type,input.settings.label]);
   if(input.event.type==='press')return new Promise(resolve=>{finish=resolve;});
   if(input.event.type==='settings')return {ops:[{op:'title',value:input.settings.label}],memory:{}};
   return {ops:[],memory:{}};
  },close(){}
 }));
 const m={...scriptManifest,permissions:['display','navigation']};
 const cfg=label=>({context:'generation',slot:0,pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{label}});
 try{
   host.sync([cfg('A')],[m]);const ctx=host.contexts.get('generation');await ctx.queue;
   assert.equal(host.key('generation','down'),true);
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(typeof finish,'function');
   assert.equal(host.key('generation','up'),true);
   host.sync([cfg('B')],[m]);host.sync([cfg('A')],[m]);
   finish({ops:[{op:'title',value:'stale'},{op:'navigate',target:'page',value:1}],memory:{stale:true}});
   await ctx.queue;
   assert.deepEqual(calls,[['appear','A'],['press','A'],['settings','A']]);
   assert.equal(events.some(e=>e.payload?.title==='stale'||e.kind==='nativeEffect'),false);
   assert.deepEqual(ctx.memory,{});assert.equal(ctx.pending,0);
   assert.equal(host.key('generation','up'),false);
 }finally{host.close();}
});

test('API 2 rotation bursts use bounded atomic admission instead of killing the action',async()=>{
 const events=[],calls=[];let release;
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({
  async run(_source,input){
   calls.push(input.event.type);
   if(input.event.type==='heldRotateRight'&&!release)await new Promise(resolve=>{release=resolve;});
   return {ops:[],memory:{}};
  },close(){}
 }));
 const manifest={...scriptManifest,actions:[{...scriptManifest.actions[0],controllers:['Encoder']}]};
 const cfg={context:'burst',slot:16,pluginUUID:nativeId,actionUUID:manifest.actions[0].id,settings:{}};
 try{
   host.sync([cfg],[manifest]);const ctx=host.contexts.get('burst');await ctx.queue;
   assert.equal(host.key('burst','down'),true);
   assert.equal(host.key('burst','right',32),true);
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(typeof release,'function');
   const before=ctx.pending;
   assert.equal(host.key('burst','right',32),false);
   assert.equal(ctx.pending,before);assert.equal(ctx.failed,false);
   assert.equal(host.key('burst','up'),true);
   release();await ctx.queue;
   assert.equal(calls.filter(x=>x==='heldRotateRight').length,32);
   assert.equal(calls.at(-1),'release');assert.equal(ctx.pending,0);assert.equal(ctx.failed,false);
   assert.equal(events.filter(e=>e.kind==='error'&&e.message.includes('queue busy')).length,1);
   assert.equal(host.key('burst','right',2),true);await ctx.queue;
   assert.equal(calls.filter(x=>x==='rotateRight').length,2);
 }finally{host.close();}
});

test('SDK global scheduler limits one plugin, admits another and cancels obsolete waiting work',async()=>{
 const {SdkScheduler}=require('../app/deckforge-editor/deckforge-sdk-scheduler.cjs');
 const scheduler=new SdkScheduler({globalLimit:3,pluginLimit:2});
 const calls=[],release=[];
 const gate=id=>()=>new Promise(resolve=>{calls.push(id);release.push(()=>resolve(id));});
 let active=true;
 const a=scheduler.run('A',()=>true,gate('a1')),b=scheduler.run('A',()=>true,gate('a2'));
 const stale=scheduler.run('A',()=>active,gate('a3')),other=scheduler.run('B',()=>true,gate('b1'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['a1','a2','b1']);assert.equal(scheduler.running,3);
 active=false;scheduler.prune();assert.equal(await stale,undefined);
 release.splice(0).forEach(fn=>fn());assert.deepEqual(await Promise.all([a,b,other]),['a1','a2','b1']);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(scheduler.running,0);assert.equal(scheduler.byPlugin.size,0);
 await assert.rejects(scheduler.run('A',()=>true,()=>{throw Error('failure');}),/failure/);
 assert.equal(await scheduler.run('B',()=>true,()=>42),42);
 scheduler.close();assert.equal(await scheduler.run('B',()=>true,()=>{throw Error('closed');}),undefined);
});
test('native renderer scheduling prevents one plugin from blocking an unrelated plugin',async()=>{
 const calls=[],release=[];
 const host=new NativePluginHost('/unused',()=>{},id=>({async run(_source,input){
  calls.push([id,input.settings.label]);
  if(id===nativeId)return new Promise(resolve=>release.push(()=>resolve({ops:[],memory:{}})));
  return {ops:[],memory:{}};
 },close(){}}));
 const otherId=nativeId+'-other',other={...scriptManifest,id:otherId,actions:[{...scriptManifest.actions[0],id:otherId+'.toggle'}]};
 const cfg=(context,id)=>({context,slot:0,pluginUUID:id,actionUUID:id+'.toggle',settings:{label:context}});
 try{
  host.sync([cfg('a1',nativeId),cfg('a2',nativeId),cfg('a3',nativeId),cfg('b1',otherId)],[scriptManifest,other]);
  await host.contexts.get('b1').queue;
  assert.deepEqual(calls.map(x=>x[1]),['a1','a2','b1']);
  const stale=host.contexts.get('a3').queue;
  host.sync([cfg('a1',nativeId),cfg('a2',nativeId),cfg('b1',otherId)],[scriptManifest,other]);
  await stale;release.forEach(fn=>fn());
  await Promise.all([host.contexts.get('a1').queue,host.contexts.get('a2').queue]);
  assert.equal(calls.some(x=>x[1]==='a3'),false);
 }finally{release.forEach(fn=>fn());host.close();}
});

test('SDK network quotas reserve capacity for another plugin and return bounded failure',async()=>{
 const calls=[],requests=[];
 const endpoint={id:'status',url:'https://example.com/status',method:'GET'};
 const manifest={...scriptManifest,permissions:['display','network.request'],networkEndpoints:[endpoint]};
 const otherId=nativeId+'-net',other={...manifest,id:otherId,actions:[{...manifest.actions[0],id:otherId+'.toggle'}]};
 const host=new NativePluginHost('/unused',()=>{},()=>({async run(_source,input){
   if(input.event.type==='press')return {ops:[{op:'networkRequest',endpoint:'status',body:null}],memory:{}};
   if(input.event.type==='networkResult')calls.push([input.settings.label,input.event.response]);
   return {ops:[],memory:{}};
 },close(){}}),{networkRequest:(e,b,signal)=>new Promise(resolve=>requests.push({resolve,signal}))});
 const cfg=(context,id)=>({context,slot:0,pluginUUID:id,actionUUID:id+'.toggle',settings:{label:context}});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
   const entries=[cfg('a1',nativeId),cfg('a2',nativeId),cfg('a3',nativeId),cfg('b1',otherId)];
   host.sync(entries,[manifest,other]);
   await Promise.all([...host.contexts.values()].map(c=>c.queue));
   for(const entry of entries){host.key(entry.context,'down');await host.contexts.get(entry.context).queue;await flush();}
   await host.contexts.get('a3').queue;
   assert.equal(requests.length,3);assert.equal(host.networkPending.size,3);
   assert.deepEqual(calls,[['a3',{endpoint:'status',ok:false,status:0,body:'',error:'capacity'}]]);
   requests[2].resolve({endpoint:'status',ok:true,status:200,body:'ok',error:null});
   await flush();await host.contexts.get('b1').queue;
   assert.equal(calls.at(-1)[0],'b1');assert.equal(calls.at(-1)[1].body,'ok');
   host.sync([], [manifest,other]);assert.ok(requests.slice(0,2).every(r=>r.signal.aborted));
 }finally{requests.forEach(r=>r.resolve({endpoint:'status',ok:false,status:0,body:'',error:'cancelled'}));host.close();}
});
test('SDK transport result boundary rejects malformed, unbounded and credential-bearing responses',()=>{
 const {normalizeNetworkResult}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const endpoint={id:'status'},valid={endpoint:'status',ok:true,status:200,body:'ready',error:null};
 assert.deepEqual(normalizeNetworkResult(endpoint,valid),valid);
 for(const result of [null,{...valid,extra:'secret'},{...valid,body:'x'.repeat(9000)},{...valid,endpoint:'other'},{...valid,status:302}])
   assert.equal(normalizeNetworkResult(endpoint,result).error,'invalid-response');
 assert.equal(normalizeNetworkResult(endpoint,{...valid,body:'Bearer sample'},'sample').error,'credential-in-response');
 assert.deepEqual(normalizeNetworkResult(endpoint,{...valid,ok:false,error:'private details',body:'hidden'}),{endpoint:'status',ok:false,status:200,body:'',error:'connection-error'});
});

test('API 2 syntax supports async event bodies and cancellable deadlines settle promptly',async()=>{
 const {deadline}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 assert.doesNotThrow(()=>validateNativeManifest({...scriptManifest,actions:[{...scriptManifest.actions[0],script:"const value=await Promise.resolve('OK');api.setTitle(value);"}]}));
 const controller=new AbortController();
 let started=false;
 const pending=deadline(()=>{started=true;return new Promise(()=>{});},10000,()=>{},controller.signal);
 await Promise.resolve();assert.equal(started,true);
 controller.abort();await assert.rejects(pending,/closed/);
 assert.equal(await deadline(()=>42,100,()=>{}),42);
 await assert.rejects(deadline(()=>new Promise(()=>{}),5,()=>{}),/timeout/);
});

test('encrypted vault isolates writers by plugin, snapshots input and never treats decrypt errors as absence',async()=>{
 const {NativeSettingsVault}=require('../app/deckforge-editor/deckforge-native-settings.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-isolated-vault-'));
 let unblock,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const wait=new Promise(resolve=>{unblock=resolve;});
 let failDecrypt=false;
 const storage={isAsyncEncryptionAvailable:async()=>true,
   encryptStringAsync:async value=>{const parsed=JSON.parse(value);if(parsed.id===nativeId&&parsed.value.label==='first'){started();await wait;}return Buffer.from(value);},
   decryptStringAsync:async bytes=>{if(failDecrypt){const error=Error('provider missing');error.code='ENOENT';throw error;}return {result:bytes.toString()};}};
 const vault=new NativeSettingsVault(temp,storage),other=nativeId+'-isolated';
 try{
   const input={label:'first'};
   const first=vault.write(nativeId,input,null);
   input.label='mutated';
   await ready;
   const queued=vault.write(nativeId,{label:'second'},null);
   assert.equal(await vault.write(other,{label:'other'},null),true);
   assert.equal((await vault.read(other)).value.label,'other');
   unblock();
   assert.equal(await first,true);assert.equal(await queued,false);
   assert.equal((await vault.read(nativeId)).value.label,'first');
   assert.equal(vault.pendingWrites,0);assert.equal(vault.writers.size,0);
   failDecrypt=true;
   await assert.rejects(vault.read(nativeId),/read failed/);
   await assert.rejects(vault.write(nativeId,{label:'overwrite'},null),/read failed/);
   failDecrypt=false;
   assert.equal((await vault.read(nativeId)).value.label,'first');
 }finally{unblock();await fs.rm(temp,{recursive:true,force:true});}
});

test('Ulanzi static radio inspector binds strict setting state mapping without running source',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {analyzeHtml}=require('../app/deckforge-editor/ulanzi-inspector-analysis.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-radio-bind-')),dir=path.join(root,'source.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.Radio',m={Type:'JavaScript',UUID:id,Name:'Radio',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A',PropertyInspectorPath:'pi.html',States:[{},{}]}]};
 const form='<form id="property-inspector"><label for="off">Off</label><input id="off" type="radio" name="mode" value="off" checked><label for="on">On</label><input id="on" type="radio" name="mode" value="on"></form>';
 const display="m=>$UD.setState(m.context,m.param?.mode === 'on' ? 1 : 0)";
 const src="$UD.connect('"+id+"');$UD.onAdd("+display+");$UD.onParamFromApp("+display+");";
 try{
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));await fs.writeFile(path.join(dir,'app.js'),src);
  await fs.writeFile(path.join(dir,'pi.html'),form);
  const report=await analyzeDirectory(dir,{fullFingerprint:true});
  assert.equal(report.inspectors[0].staticSchema,true);
  assert.deepEqual(report.candidate.actions[0].settingsSchema,[{key:'mode',label:'mode',type:'select',options:[{value:'off',label:'Off'},{value:'on',label:'On'}],default:'off'}]);
  assert.deepEqual(report.candidate.actions[0].events.settings,[{op:'stateFromSetting',key:'mode',match:'on',yes:1,no:0}]);
  assert.equal(report.verification.status,'pass');
  const record=buildReviewRecord(report);for(const check of record.checks){check.status='passed';check.evidence='fixture';}
  assert.throws(()=>validateReviewRecord(record,report),/manual conversion/);
  for(const bad of [form.replace(' checked',''),form.replace('value="on"','value="off"'),form.replace('value="on"','value="on" disabled')])
    assert.equal(analyzeHtml('pi.html',bad,{inspector:true}).staticSchema,false);
  await fs.writeFile(path.join(dir,'pi.html'),form.replace(' checked','').replace('value="on"','value="on" checked'));
  assert.equal((await analyzeDirectory(dir)).candidate,null);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('single inert Ulanzi HTML entry can produce a trace candidate but active HTML remains manual',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {buildReviewRecord,validateReviewRecord}=require('../app/deckforge-editor/ulanzi-release-review.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-html-wrapper-')),dir=path.join(temp,'source.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.Wrapper',manifest={Type:'JavaScript',UUID:id,Name:'Wrapper',Version:'1',CodePath:'app.html',Actions:[{UUID:id+'.a',Name:'A'}]};
 const html='<script type="module" src="app.js"></script>';
 try{
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
   await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));");
   await fs.writeFile(path.join(dir,'app.html'),html);
   const report=await analyzeDirectory(dir,{fullFingerprint:true});
   assert.equal(report.htmlEntry.staticWrapper,true);assert.equal(report.verification.status,'pass');
   const record=buildReviewRecord(report);for(const check of record.checks){check.status='passed';check.evidence='fixture';}
   assert.throws(()=>validateReviewRecord(record,report),/manual conversion/);
   for(const bad of [html+'<img src="remote.png">',html+'<script>run()</script>',html.replace('src=', 'async src='),html+'<script src="other.js"></script>']){
     await fs.writeFile(path.join(dir,'app.html'),bad);assert.equal((await analyzeDirectory(dir)).candidate,null);
   }
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('Ulanzi UUID switch routing validates all branches and rejects ambiguous fallthrough',()=>{
 const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const id='com.ulanzi.ulanzistudio.Switch',a=id+'.a',b=id+'.b',c=id+'.c';
 const m={Type:'JavaScript',UUID:id,Name:'Switch',Version:'1',CodePath:'app.js',Actions:[{UUID:a,Name:'A'},{UUID:b,Name:'B'},{UUID:c,Name:'C',Controllers:['Encoder']}]};
 const source="$UD.connect('"+id+"');$UD.onAdd(m=>{switch(m.uuid){case '"+a+"':$UD.setTitle(m.context,'A');break;case '"+b+"':$UD.setTitle(m.context,'B');break;default:$UD.setTitle(m.context,'C');break;}});";
 const result=analyzeSource(m,source);
 assert.equal(result.verification.status,'pass');
 assert.deepEqual(result.candidate.actions.map(x=>x.events.appear[0].value),['A','B','C']);
 for(const bad of [source.replace("break;case","case"),source.replace(b,a),source.replace(b,id+'.unknown'),source.replace('switch(m.uuid)','switch(m.actionid)'),source.replace("break;default","break;default:eval('1');break;case '"+c+"':")])
   assert.equal(analyzeSource(m,bad).candidate,null);
 const unreachable="$UD.connect('"+id+"');$UD.onKeyDown(m=>{if(m.uuid === '"+c+"'){eval('1');}else{$UD.setTitle(m.context,'Ready');}});$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));";
 assert.equal(analyzeSource(m,unreachable).candidate,null);
});
test('Ulanzi declared resource inventory cannot silently omit over-budget paths',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-resource-cap-')),dir=path.join(root,'source.ulanziPlugin');await fs.mkdir(dir);
 const id='com.ulanzi.ulanzistudio.ResourceCap',m={Type:'JavaScript',UUID:id,Name:'Cap',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A',States:Array.from({length:257},(_,i)=>({Image:'img'+i+'.png'}))}]};
 try{
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
  await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));");
  await assert.rejects(analyzeDirectory(dir),/resource inventory limit/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('native image validation rejects malformed PNGs both at install and on API 2 display output',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 const uri=b=>'data:image/png;base64,'+b.toString('base64');
 const damaged=Buffer.from(png);damaged[45]^=1;
 const action=nativeManifest.actions[0];
 const host=new NativePluginHost('/unused');
 try{
  for(const bytes of [png.subarray(0,24),damaged,Buffer.concat([png,Buffer.from([0])])]){
   const image=uri(bytes);
   assert.throws(()=>validateNativeManifest({...nativeManifest,actions:[{...action,stateImages:[image,image]}]}),/PNG integrity/);
   assert.throws(()=>validateNativeManifest({...nativeManifest,actions:[{...action,events:{press:[{op:'image',value:image}]}}]}),/PNG integrity/);
   assert.throws(()=>host.validateScriptOps({pluginUUID:nativeId,action:scriptManifest.actions[0],permissions:['display']},'press',[{op:'image',value:image}]),/PNG integrity/);
  }
  const image=uri(png);
  assert.doesNotThrow(()=>validateNativeManifest({...nativeManifest,actions:[{...action,stateImages:[image,image]}]}));
  assert.deepEqual(host.validateScriptOps({pluginUUID:nativeId,action:scriptManifest.actions[0],permissions:['display']},'press',[{op:'image',value:image}]).normal,[{op:'image',value:image}]);
 }finally{host.close();}
});

test('Ulanzi verifier exercises every setting comparison and isolates multi-action settings changes',()=>{
 const {analyzeSource}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const {simulateCandidate}=require('../app/deckforge-editor/ulanzi-verifier.cjs');
 const id='com.ulanzi.ulanzistudio.Probes',m={Type:'JavaScript',UUID:id,Name:'Probes',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A',States:[{},{}]}]};
 const body="m=>{$UD.setState(m.context,m.param?.mode === 'first' ? 1 : 0);$UD.setState(m.context,m.param?.mode === 'second' ? 1 : 0);}";
 const source="$UD.connect('"+id+"');$UD.onAdd("+body+");$UD.onParamFromApp("+body+");";
 const result=analyzeSource(m,source);
 assert.equal(result.verification.status,'pass');
 assert.equal(result.verification.checks.filter(c=>/^setting-probe-\d+-appear$/.test(c.name)).length,3);
 const calls=[{method:'setStateFromParam',key:'mode',match:'first',yes:1,no:0},{method:'setStateFromParam',key:'mode',match:'second',yes:1,no:0}];
 const trace=[{method:'onAdd',calls},{method:'onParamFromApp',calls}];
 const altered=structuredClone(result.candidate);
 altered.actions[0].events.settings[1].yes=0;
 assert.equal(simulateCandidate(altered,trace).status,'fail');
 const multi=analyzeSource({...m,Actions:[...m.Actions,{UUID:id+'.b',Name:'B',States:[{},{}]}]},source);
 assert.equal(multi.verification.status,'pass');
 assert.equal(multi.verification.checks.filter(c=>c.name.endsWith(':isolated-settings')).length,2);
});

test('corpus audit summarizes candidates and blockers without executing or exporting original source',async()=>{
 const {writeCorpusAudit}=require('../app/deckforge-editor/deckforge-sdk-cli.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-corpus-')),src=path.join(root,'source'),out=path.join(root,'reports');
 await fs.mkdir(src);await fs.mkdir(out);
 try{
  for(const [name,priv] of [['a',false],['b',true]]){
   const dir=path.join(src,name+'.ulanziPlugin');await fs.mkdir(dir);
   const id='com.ulanzi.ulanzistudio.Audit'+name;
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({Type:'JavaScript',UUID:id,Name:name,Version:'1',CodePath:'app.js',PrivateAPI:priv,Actions:[{UUID:id+'.a',Name:'A'}]}));
   await fs.writeFile(path.join(dir,'app.js'),"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'NEVER_EXPORT_SOURCE_LITERAL'));"+(priv?"$UD.onRun(m=>{});":""));
  }
  await fs.mkdir(path.join(src,'broken.ulanziPlugin'));
  const file=await writeCorpusAudit(src,out),raw=await fs.readFile(file,'utf8'),report=JSON.parse(raw);
  assert.deepEqual(report.counts,{candidateReviewRequired:1,manualConversionRequired:1,unreadable:1});
  assert.equal(report.total,3);
  assert.ok(report.blockerFrequency.unsupportedMethods.some(x=>x.name==='onRun'&&x.count===1));
  assert.ok(report.plugins[0].treeSha256);
  assert.equal(report.installationAllowed,false);
  assert.ok(!raw.includes('NEVER_EXPORT_SOURCE_LITERAL')&&!raw.includes(root));
  await assert.rejects(writeCorpusAudit(src,out),/EEXIST/);
  await assert.rejects(writeCorpusAudit(src,src),/outside source/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('pinned community plugin manifests and source are inventoried without granting conversion permission',async()=>{
 const {analyzeSource,validateSourceManifest}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const root=path.join(__dirname,'fixtures','ulanzi-community');
 const sources=JSON.parse(await fs.readFile(path.join(root,'sources.json'),'utf8'));
 const hash=b=>require('node:crypto').createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 for(const item of sources){
   const folder=path.join(root,item.name);
   for(const record of item.files){
     const raw=await fs.readFile(path.join(folder,record.file)),lf=raw.toString('utf8').replace(/\r\n/g,'\n');
     assert.ok([raw,Buffer.from(lf),Buffer.from(lf.replace(/\n/g,'\r\n'))].some(b=>hash(b)===record.gitBlobSha),item.name+' '+record.file+' provenance');
   }
   const m=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
   const result=analyzeSource(m,await fs.readFile(path.join(folder,'app.js'),'utf8'));
   assert.throws(()=>validateSourceManifest(m),/manifest/);
   assert.equal(result.candidate,null);
   assert.ok(result.findings.some(f=>f.code==='community-identity'));
   assert.ok(result.findings.some(f=>f.code==='private-api'));
   assert.ok(result.calls.some(c=>c.name==='onRun'&&c.support==='review'));
   if(item.name==='n8n'){
     assert.ok(result.calls.some(c=>c.name==='setBaseDataIcon'&&c.support==='review'));
     assert.ok(result.findings.some(f=>f.code==='external-runtime'));
   }
 }
 const id='io.example.deck.simple';
 const m={Type:'JavaScript',UUID:id,Name:'Simple',Version:'1',CodePath:'app.js',Actions:[{UUID:id+'.a',Name:'A'}]};
 const result=analyzeSource(m,"$UD.connect('"+id+"');$UD.onAdd(m=>$UD.setTitle(m.context,'Ready'));");
 assert.equal(result.candidate,null);
 assert.throws(()=>analyzeSource({...m,UUID:'../bad'},''),/manifest/);
});

test('multi-script HTML audit records available real community source and missing dependencies without translation',async()=>{
 const {analyzeDirectory}=require('../app/deckforge-editor/ulanzi-converter.cjs');
 const fixture=path.join(__dirname,'fixtures','ulanzi-community','zentala');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-html-inventory-'));
 const dir=path.join(root,'community.ulanziPlugin');
 try{
  await fs.mkdir(path.join(dir,'plugin','actions'),{recursive:true});
  for(const [src,dst] of [['manifest.json','manifest.json'],['LICENSE','LICENSE'],['app.html','plugin/app.html'],['app.js','plugin/app.js'],['CounterAction.js','plugin/actions/CounterAction.js']])
    await fs.copyFile(path.join(fixture,src),path.join(dir,dst));
  const report=await analyzeDirectory(dir,{fullFingerprint:true});
  assert.equal(report.candidate,null);
  assert.equal(report.htmlEntry.scripts.length,14);
  assert.equal(report.htmlEntry.inventory.analyzedCount,2);
  assert.equal(report.htmlEntry.inventory.complete,false);
  assert.equal(report.htmlEntry.scripts.filter(s=>s.status==='missing').length,12);
  const counter=report.htmlEntry.scripts.find(s=>s.path.endsWith('CounterAction.js'));
  assert.ok(counter.analysis.calls.some(c=>c.name==='setBaseDataIcon'&&c.support==='review'));
  assert.ok(report.calls.some(c=>c.name==='sendParamFromPlugin'&&c.support==='review'));
  assert.ok(report.findings.some(f=>f.code==='community-identity'));
  assert.equal(report.installationAllowed,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('dynamic key RGBA is bounded and converted to a verified PNG before host display',()=>{
 const {pixelImage}=require('../app/deckforge-editor/deckforge-pixel-image.cjs');
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const rgba=Buffer.from([255,0,0,255,0,0,255,128]);
 const op={op:'pixels',width:2,height:1,rgba:rgba.toString('base64')};
 const expected=pixelImage(op),png=Buffer.from(expected.value.slice(22),'base64');
 assert.equal(verifyPng(png).ok,true);
 const raw=require('node:zlib').inflateSync(png.subarray(41,41+png.readUInt32BE(33)));
 assert.deepEqual([...raw],[0,...rgba]);
 const host=new NativePluginHost('/unused');
 const ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions:['display']};
 try{
   assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).normal,[expected]);
   for(const bad of [{...op,width:145},{...op,rgba:'AAAA'},{...op,extra:true},{...op,rgba:op.rgba.replace(/=$/,'A')}])
     assert.throws(()=>host.validateScriptOps(ctx,'press',[bad]),/key pixel/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[op,op,op]),/drawing limit/);
 }finally{host.close();}
});

test('settings patch preserves unrelated settings and retains input, permission, and schema restrictions',()=>{
 const host=new NativePluginHost('/unused');
 const settings={count:3,other:{keep:true}};
 const action={...scriptManifest.actions[0],settingsSchema:[{key:'count',label:'Count',type:'integer',min:0,max:10,default:0}]};
 const ctx={pluginUUID:nativeId,action,permissions:['display','settings.write'],settings};
 const patch={op:'settingsPatch',value:{count:4}};
 try{
   const result=host.validateScriptOps(ctx,'press',[patch]);
   assert.deepEqual(result.effects,[{op:'settings',value:{count:4,other:{keep:true}}}]);
   assert.deepEqual(settings,{count:3,other:{keep:true}});
   assert.deepEqual(patch,{op:'settingsPatch',value:{count:4}});
   assert.throws(()=>host.validateScriptOps(ctx,'settings',[patch]),/input event/);
   assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[patch]),/unauthorized/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[patch,patch]),/one privileged/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'settingsPatch',value:{count:99}}]),/invalid setting/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'settingsPatch',value:JSON.parse('{"__proto__":{"bad":true}}')}]),/settings patch/);
   assert.throws(()=>host.validateScriptOps(ctx,'press',[{op:'settingsPatch',value:{count:NaN}}]),/settings patch/);
 }finally{host.close();}
});

test('native settings receipts serialize rapid inputs and preserve external edit generation cancellation',async()=>{
 const requests=[],events=[],counts=[];
 const m={...scriptManifest,permissions:['display','settings.write']};
 const cfg={context:'receipt',slot:16,gesture:'down',pluginUUID:m.id,actionUUID:m.actions[0].id,settings:{count:0}};
 const action={...m.actions[0],controllers:['Encoder']};m.actions=[action];
 const host=new NativePluginHost('/unused',e=>{events.push(e);if(e.kind==='nativeSettingsCommit')requests.push(e);},()=>({
   async run(_source,input){
     if(input.event.type==='rotateRight'){counts.push(input.settings.count);return {ops:[{op:'settingsPatch',value:{count:input.settings.count+1}}],memory:{}};}
     return {ops:[{op:'title',value:String(input.settings.count)}],memory:{}};
   },close(){}
 }),{settingsReceiptTimeout:500});
 const wait=async n=>{for(let i=0;i<100&&requests.length<n;i++)await new Promise(r=>setImmediate(r));assert.equal(requests.length,n);};
 try{
   host.sync([cfg],[m]);await host.contexts.get(cfg.context).queue;
   assert.equal(host.key(cfg.context,'right',3),true);
   await wait(1);
   assert.deepEqual(counts,[0]);
   assert.equal(host.acknowledgeSettings(cfg.context,'wrong',true),false);
   for(let i=0;i<3;i++){
     await wait(i+1);assert.equal(requests[i].operation.value.count,i+1);
     assert.equal(host.acknowledgeSettings(cfg.context,requests[i].receiptId,true),true);
     assert.equal(host.acknowledgeSettings(cfg.context,requests[i].receiptId,true),false);
   }
   const ctx=host.contexts.get(cfg.context);await ctx.queue;await ctx.queue;
   assert.deepEqual(counts,[0,1,2]);assert.equal(ctx.settings.count,3);
   assert.equal(host.key(cfg.context,'right',2),true);await wait(4);
   host.sync([{...cfg,settings:{count:99}}],[m]);
   assert.equal(host.acknowledgeSettings(cfg.context,requests[3].receiptId,true),false);
   await ctx.queue;assert.equal(ctx.settings.count,99);assert.equal(requests.length,4);
   assert.equal(host.key(cfg.context,'right'),true);await wait(5);
   assert.equal(host.acknowledgeSettings(cfg.context,requests[4].receiptId,false),false);
   await ctx.queue;assert.equal(ctx.settings.count,99);
   assert.ok(events.some(e=>e.kind==='error'&&e.message.includes('not confirmed')));
 }finally{host.close();}
});

test('native GIF playback uses bounded PNG events, stops on replacement and cancels stale contexts',async()=>{
 const {prepareGif,NativeAnimationPlayer}=require('../app/deckforge-editor/deckforge-native-animation.cjs');
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const header=Buffer.from('47494638396101000100800000ff00000000ff','hex');
 const frame=i=>Buffer.from([0x21,0xf9,4,0,5,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,4|(i<<3)|(5<<6&255),1,0]);
 const gif='data:image/gif;base64,'+Buffer.concat([header,frame(0),frame(1),Buffer.from([0x3b])]).toString('base64');
 const prepared=prepareGif(gif),frames=[];
 let time=0,active=true;
 const player=new NativeAnimationPlayer((ctx,image)=>frames.push({ctx,image}),()=>time);
 try{
   assert.equal(player.start('a',prepared,()=>active),true);
   time=499;player.tick();assert.equal(frames.length,1);
   time=500;player.tick();assert.equal(frames.length,2);assert.notEqual(frames[0].image,frames[1].image);
   assert.ok(frames.every(f=>verifyPng(Buffer.from(f.image.slice(22),'base64')).ok));
   time=1000;player.tick();assert.equal(player.entries.size,0);assert.equal(player.timer,null);
   time=1200;player.start('a',prepared,()=>active);active=false;time=1800;player.tick();assert.equal(player.entries.size,0);
   assert.throws(()=>prepareGif('data:image/gif;base64,AAAA'),/GIF/);
 }finally{player.close();}
 const observed=[],host=new NativePluginHost('/unused',e=>observed.push(e),()=>({
   async run(_s,input){return {ops:input.event.type==='appear'?[{op:'animation',value:gif}]:input.event.type==='press'?[{op:'stopAnimation'}]:[],memory:{}};},close(){}
 }),{animationNow:()=>time});
 const cfg={context:'gif',slot:0,gesture:'down',pluginUUID:scriptManifest.id,actionUUID:scriptManifest.actions[0].id,settings:{}};
 try{
   host.sync([cfg],[scriptManifest]);await host.contexts.get(cfg.context).queue;
   assert.ok(observed.some(e=>e.kind==='setImage'));
   assert.equal(host.animations.entries.size,1);
   host.key(cfg.context,'down');await host.contexts.get(cfg.context).queue;
   assert.equal(host.animations.entries.size,0);
   host.sync([],[scriptManifest]);assert.equal(host.animations.timer,null);
   assert.throws(()=>host.validateScriptOps({slot:13,action:scriptManifest.actions[0],pluginUUID:nativeId,permissions:['display']},'appear',[{op:'animation',value:gif}]),/normal key/);
 }finally{host.close();}
});

test('active GIF preparation reuses verified frames and rejects inactive duplicate starts',()=>{
 const {NativeAnimationPlayer}=require('../app/deckforge-editor/deckforge-native-animation.cjs');
 const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
 let active=true,time=0,updates=0;
 const player=new NativeAnimationPlayer(()=>updates++,()=>time);
 try{
   const prepared=player.prepare('key',gif);
   assert.equal(player.start('key',prepared,()=>active),true);
   assert.equal(player.prepare('key',gif).timeline,prepared.timeline);
   assert.equal(player.start('key',prepared,()=>false),false);
   assert.equal(updates,1);
   active=false;
   assert.notEqual(player.prepare('key',gif).timeline,prepared.timeline);
   time=500;player.tick();assert.equal(player.entries.size,0);assert.equal(player.timer,null);
 }finally{player.close();}
 const failing=new NativeAnimationPlayer(()=>{throw Error('display failure');});
 assert.throws(()=>failing.start('key',failing.prepare('key',gif),()=>true),/display failure/);
 assert.equal(failing.entries.size,0);assert.equal(failing.timer,null);
});

test('native wide PNG verifies complete bounded image rather than trusting its header',()=>{
 const {crc32,deflateSync}=require('node:zlib');
 const {verifyPng}=require('../app/deckforge-editor/ulanzi-png-verifier.cjs');
 const {validateWideOverlay}=require('../app/deckforge-editor/deckforge-native-wide.cjs');
 const chunk=(type,data)=>{
   const body=Buffer.concat([Buffer.from(type),data]),size=Buffer.alloc(4),crc=Buffer.alloc(4);
   size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([size,body,crc]);
 };
 const header=Buffer.alloc(13);header.writeUInt32BE(392,0);header.writeUInt32BE(196,4);header[8]=8;header[9]=6;
 const prefix=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header)]);
 const png=Buffer.concat([prefix,chunk('IDAT',deflateSync(Buffer.alloc((392*4+1)*196))),chunk('IEND',Buffer.alloc(0))]);
 const op=b=>({op:'wideOverlay',value:{kind:'png',data:'data:image/png;base64,'+b.toString('base64')},durationMs:1000});
 assert.equal(verifyPng(png).ok,false);assert.equal(verifyPng(png,{wide:true}).ok,true);
 assert.doesNotThrow(()=>validateWideOverlay(op(png)));
 assert.throws(()=>validateWideOverlay(op(prefix)),/invalid wide/);
 const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;
 assert.throws(()=>validateWideOverlay(op(corrupt)),/invalid wide/);
 const oversized=Buffer.concat([prefix,chunk('IDAT',deflateSync(Buffer.alloc((392*4+1)*197))),chunk('IEND',Buffer.alloc(0))]);
 assert.throws(()=>validateWideOverlay(op(oversized)),/invalid wide/);
});
test('all published native examples round-trip through real package parser and installer',async()=>{
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-sdk-examples-')),host=new NativePluginHost(root);
 try{
   const dir=path.join(__dirname,'../examples/deckforge-sdk');
   const names=(await fs.readdir(dir)).filter(n=>n.endsWith('.native.json')).sort();
   assert.ok(names.length>=3);
   for(const name of names){
     const m=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
     const parsed=await parseDeckForgePackage((await packageNativeManifest(m)).archive);
     assert.deepEqual(parsed.native,m);assert.equal((await host.install(parsed.native)).uuid,m.id);
   }
   assert.equal((await host.manifests()).length,names.length);
 }finally{host.close();await fs.rm(root,{recursive:true,force:true});}
});


test('native WSS large receive is opt-in, bounded and does not enlarge outgoing messages',()=>{
 const {validateNetworkEndpoints,validateSocketOperation,createSocket,socketReceiveLimit}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const ep={id:'large',url:'wss://example.com/events',method:'WSS'},permissions=['display','network.websocket'];
 assert.equal(socketReceiveLimit(ep),8192);
 const large={...ep,maxReceiveBytes:256*1024};
 validateNetworkEndpoints([large],permissions);
 assert.equal(socketReceiveLimit(large),256*1024);
 for(const invalid of [0,8193,256*1024+1,'262144'])
   assert.throws(()=>validateNetworkEndpoints([{...ep,maxReceiveBytes:invalid}],permissions),/receive limit/);
 assert.throws(()=>validateNetworkEndpoints([{...large,method:'GET',url:'https://example.com/events'}],['display','network.request']),/receive limit/);
 let checked=false;
 class Mock{constructor(_url,opts){assert.equal(opts.maxPayload,256*1024);assert.equal(opts.rejectUnauthorized,true);assert.equal(opts.followRedirects,false);checked=true;}}
 createSocket(large,{WebSocket:Mock});assert.equal(checked,true);
 assert.throws(()=>validateSocketOperation({op:'socketSend',value:'x'.repeat(8193)},[large]),/limit/);
});
test('native WSS opt-in large message reaches service but oversized frame closes transport',async()=>{
 const {EventEmitter}=require('node:events');
 const ep={id:'large',url:'wss://example.com/events',method:'WSS',maxReceiveBytes:256*1024};
 const manifest={...scriptManifest,permissions:['display','background.run','network.websocket'],networkEndpoints:[ep],service:{script:'service'}};
 const received=[],sockets=[];
 class Mock extends EventEmitter{
   constructor(){super();this.readyState=0;this.terminated=false;}
   terminate(){this.terminated=true;this.readyState=3;}
   send(_value,cb){cb?.();}
 }
 const host=new NativePluginHost('/unused',()=>{},()=>({async run(_s,input){
   if(input.event.type==='start')return {ops:[{op:'socketConnect',endpoint:'large'}],memory:{}};
   if(input.event.response?.event==='message')received.push(input.event.response.body.length);
   return {ops:[],memory:{}};
 },close(){}}),{socketFactory:()=>{const sock=new Mock();sockets.push(sock);return sock;}});
 const drain=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
 try{
   host.sync([],[manifest]);await drain();assert.equal(sockets.length,1);
   const sock=sockets[0];sock.readyState=1;sock.emit('open');await drain();
   sock.emit('message',Buffer.alloc(96*1024,120),false);await drain();
   assert.deepEqual(received,[96*1024]);assert.equal(sock.terminated,false);
   sock.emit('message',Buffer.alloc(256*1024+1,120),false);await drain();
   assert.equal(sock.terminated,true);assert.deepEqual(received,[96*1024]);
 }finally{host.close();}
});

test('native dynamic settings validate bounded selections and sanitize published choices',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const schema=[{key:'items',label:'센서',type:'dynamicMultiSelect',source:'sensors',maxItems:4,default:[]}];
 core.validateNativeSettingsSchema(schema);
 assert.deepEqual(core.nativeEffectiveSettings(schema,{items:['sensor.temp','sensor.humidity']}),{items:['sensor.temp','sensor.humidity']});
 assert.throws(()=>core.nativeEffectiveSettings(schema,{items:['a','a']}),/invalid setting/);
 assert.throws(()=>core.nativeEffectiveSettings(schema,{items:['a','b','c','d','e']}),/invalid setting/);
 assert.deepEqual(core.nativeDynamicOptions(schema[0],{sensors:[{value:'a',label:'온도',group:'발코니',secret:'ignored'},{value:'a',label:'duplicate'},{value:'b',label:'\n'}]}),[{value:'a',label:'온도',group:'발코니'}]);
});
test('HA native manifest, compressed entity state, device grouping, control and sensor drawing',()=>{
 const {createHomeAssistantManifest,service,sensorKey,controlKey}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const manifest=createHomeAssistantManifest('https://example.com');
 assert.equal(manifest.networkEndpoints[0].url,'wss://example.com/api/websocket');
 assert.doesNotThrow(()=>validateNativeManifest(manifest));
 const unconfigured=createHomeAssistantManifest(null);
 assert.doesNotThrow(()=>validateNativeManifest(unconfigured));
 assert.equal(unconfigured.networkEndpoints,undefined);assert.ok(!unconfigured.permissions.includes('network.websocket'));
 assert.equal(unconfigured.actions[0].settingsSchema.find(f=>f.key==='linked').default,false);
 assert.throws(()=>createHomeAssistantManifest('http://example.com'),/HTTPS/);
 assert.throws(()=>createHomeAssistantManifest('https://user:password@example.com'),/HTTPS/);
 let shared={},memory={},sent=[],drawn=[],commands=[],ops=[];
 const api={getSharedState:()=>structuredClone(shared),publishSharedState:s=>{shared=structuredClone(s);ops.push({op:'publishSharedState',value:s});},connectSocket:id=>{sent.push(id);ops.push({op:'socketConnect',endpoint:id});},sendSocket:v=>{sent.push(v);ops.push({op:'socketSend',value:v});},
   setTitle(){},setState(){},drawKey:v=>drawn.push(v),sendServiceMessage:v=>commands.push(v)};
 const host=new NativePluginHost('/unused');
 const ctx={service:true,permissions:manifest.permissions,networkEndpoints:manifest.networkEndpoints,sharedStateBytes:262144};
 const run=(type,response)=>{ops=[];service({type,response},{},0,memory,api);
   if(type==='serviceMessage'||type==='socketEvent'&&ops.some(o=>o.op==='socketSend'))host.validateScriptOps(ctx,type,ops);
   assert.ok(ops.filter(o=>o.op==='socketSend').length<=1);
 };
 const msg=m=>run('socketEvent',{event:'message',body:JSON.stringify(m)});
 run('start');run('socketEvent',{event:'open'});
 const device='a'.repeat(32);
 msg({type:'result',id:1,success:true});
 msg({type:'result',id:2,success:true,result:[{id:device,name:'발코니'}]});
 msg({type:'result',id:3,success:true,result:{entities:[{ei:'sensor.temp',di:device},{ei:'sensor.humidity',di:device}]}});
 assert.equal(sent.at(-1).type,'subscribe_entities');
 msg({type:'event',id:4,event:{a:{'sensor.temp':{s:'23.5',a:{friendly_name:'온도',unit_of_measurement:'°C'}},'sensor.humidity':{s:'48',a:{friendly_name:'습도',unit_of_measurement:'%'}},'switch.fan':{s:'off',a:{friendly_name:'환풍기'}}}}});
 assert.equal(shared.status,'연결됨');assert.equal(shared.sensors.length,2);assert.ok(shared.sensors.every(o=>o.group==='발코니'));
 msg({type:'event',id:4,event:{c:{'sensor.temp':{'+':{s:'24.0'}}}}});
 assert.equal(shared.entities['sensor.temp'].value,'24.0');assert.equal(shared.entities['sensor.temp'].unit,'°C');
 msg({type:'event',id:4,event:{c:{'sensor.temp':{'-':{a:['unit_of_measurement']}}}}});
 assert.equal(shared.entities['sensor.temp'].unit,'');
 const settings={entities:['sensor.temp','sensor.humidity'],mode:'all',labels:true,unit:true,decimals:1,fontSize:36,seconds:5,color:'#FFFFFF'};
 sensorKey({type:'appear'},settings,0,{},api);
 assert.equal(drawn.at(-1).background,undefined,'sensor artwork must allow button background');
 assert.ok(drawn.at(-1).commands.some(c=>c.text==='24.0'));assert.ok(drawn.at(-1).commands.some(c=>c.text==='48.0 %'));
 const sensorMemory={};
 sensorKey({type:'appear'},{...settings,mode:'press'},0,sensorMemory,api);sensorKey({type:'press'},{...settings,mode:'press'},0,sensorMemory,api);
 assert.ok(drawn.at(-1).commands.some(c=>c.text==='48.0 %'));
 controlKey({type:'press'},{entity:'switch.fan'},0,{},api);
 assert.deepEqual(commands,[{entity:'switch.fan'}]);
 run('serviceMessage',{message:commands[0]});assert.equal(sent.at(-1).service,'toggle');
 const count=sent.length;run('serviceMessage',{message:{entity:'sensor.temp'}});assert.equal(sent.length,count);
 msg({type:'event',id:4,event:{a:{'light.kitchen':{s:'off',a:{friendly_name:'주방등'}}}}});
 const linked={entity:'switch.fan',linked:true,linkEntity:'light.kitchen',linkOn:true,linkOff:true,linkReverse:false};
 controlKey({type:'press'},linked,0,{},api);run('serviceMessage',{message:commands.pop()});
 assert.equal(sent.at(-1).target.entity_id,'switch.fan');msg({type:'result',id:sent.at(-1).id,success:true});
 assert.deepEqual(sent.slice(-2).map(x=>[x.target.entity_id,x.service]),[['switch.fan','turn_on'],['light.kitchen','turn_on']]);
 msg({type:'event',id:4,event:{c:{'switch.fan':{'+':{s:'on'}}}}});
 run('serviceMessage',{message:linked});
 msg({type:'result',id:sent.at(-1).id,success:true});
 assert.deepEqual(sent.slice(-2).map(x=>[x.target.entity_id,x.service]),[['switch.fan','turn_off'],['light.kitchen','turn_off']]);
 for(const primary of ['off','on']){
   msg({type:'event',id:4,event:{c:{'switch.fan':{'+':{s:primary}}}}});
   for(const linkOn of [true,false])for(const linkOff of [true,false])for(const linkReverse of [true,false]){
     const start=sent.length,nextOn=primary==='off';
     controlKey({type:'press'},{...linked,linkOn,linkOff,linkReverse},0,{},api);
     run('serviceMessage',{message:commands.pop()});
     assert.equal(sent.length,start+1);
     const requestId=sent.at(-1).id;msg({type:'result',id:requestId,success:true});
     const after=sent.length;msg({type:'result',id:requestId,success:true});assert.equal(sent.length,after);
     const expected=[['switch.fan',nextOn?'turn_on':'turn_off']];
     if(nextOn?linkOn:linkOff)expected.push(['light.kitchen',nextOn!==linkReverse?'turn_on':'turn_off']);
     assert.deepEqual(sent.slice(start).map(x=>[x.target.entity_id,x.service]),expected);
   }
 }
 const rejected=sent.length;run('serviceMessage',{message:linked});msg({type:'result',id:sent.at(-1).id,success:false});assert.equal(sent.length,rejected+1);
 const stale=sent.length;run('serviceMessage',{message:linked});const oldId=sent.at(-1).id;
 run('serviceMessage',{message:{entity:'switch.fan'}});msg({type:'result',id:oldId,success:true});assert.equal(sent.length,stale+2);
 msg({type:'event',id:4,event:{a:{'automation.test':{s:'on',a:{friendly_name:'자동화'}},'button.test':{s:'2026-01-01',a:{friendly_name:'버튼'}}}}});
 assert.deepEqual(shared.controls.map(x=>x.value).sort(),['light.kitchen','switch.fan']);
 assert.deepEqual(shared.others.map(x=>x.value).sort(),['automation.test','button.test']);
 assert.equal(manifest.actions.length,3);
 const {otherKey}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 otherKey({type:'press'},{entity:'automation.test'},0,{},api);run('serviceMessage',{message:commands.pop()});assert.equal(sent.at(-1).service,'trigger');
 otherKey({type:'press'},{entity:'button.test'},0,{},api);run('serviceMessage',{message:commands.pop()});assert.equal(sent.at(-1).service,'press');
 run('serviceMessage',{message:{entity:'automation.test'}});assert.equal(sent.at(-1).service,'trigger','old configured control stays executable');
 for(const linkEntity of ['', 'sensor.temp','automation.test','switch.missing','switch.fan']){
   const start=sent.length;run('serviceMessage',{message:{...linked,linkEntity}});
   assert.deepEqual(sent.slice(start).map(x=>[x.target.entity_id,x.service]),[['switch.fan','turn_off']]);
 }
 msg({type:'event',id:4,event:{c:{'light.kitchen':{'+':{s:'unavailable'}}}}});
 const invalid=sent.length;run('serviceMessage',{message:linked});assert.equal(sent.length,invalid+1);assert.equal(sent.at(-1).target.entity_id,'switch.fan');
 const before=sent.length;run('serviceMessage',{message:{...linked,entity:'automation.test'}});assert.equal(sent.length,before);
 run('serviceMessage',{message:{entity:'switch.fan',other:true}});assert.equal(sent.length,before);
 msg({type:'event',id:4,event:{c:{'switch.fan':{'+':{s:'unknown'}}}}});
 run('serviceMessage',{message:linked});assert.equal(sent.length,before);
 run('socketEvent',{event:'close'});assert.equal(shared.status,'연결 끊김');
 controlKey({type:'press'},{entity:'switch.fan'},0,{},api);assert.equal(commands.length,1);
});

test('native shared state view limits per-key input and skips unrelated updates',()=>{
 const {projectSharedState}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const m=createHomeAssistantManifest('https://example.com'),a=m.actions[0];
 const ctx={action:a,settings:{entity:'switch.fan'},permissions:m.permissions};
 const snapshot={status:'연결됨',entities:{'switch.fan':{value:'off'},'sensor.temp':{value:'23'}},controls:[{value:'switch.fan',label:'fan'}]};
 assert.deepEqual(projectSharedState(ctx,snapshot),{status:'연결됨',entities:{'switch.fan':{value:'off'}}});
 assert.deepEqual(projectSharedState({...ctx,settings:{entity:'__proto__'}},snapshot),{status:'연결됨',entities:{}});
 assert.throws(()=>validateNativeManifest({...m,actions:[{...a,sharedStateView:{keys:['__proto__'],map:'entities',selection:'entity'}}]}),/shared state view/);
 assert.throws(()=>validateNativeManifest({...m,actions:[{...a,sharedStateView:{keys:['status'],map:'entities',selection:'missing'}}]}),/shared state view/);
 const host=new NativePluginHost('/unused');
 const service={sharedState:snapshot};
 const key={...ctx,context:'key',pluginUUID:m.id};
 host.contexts.set('@service:'+m.id,service);host.contexts.set('key',key);
 let calls=0;host.queueSharedRefresh=()=>{calls++;};
 try{
   host.notifyShared(m.id,{...snapshot,entities:{...snapshot.entities,'sensor.temp':{value:'22'}}});
   assert.equal(calls,0);
   host.notifyShared(m.id,{...snapshot,entities:{...snapshot.entities,'switch.fan':{value:'on'}}});
   assert.equal(calls,1);
 }finally{host.contexts.clear();host.close();}
});
test('HA plugin independent package round trip preserves address but contains no credentials',async()=>{
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const {packageNativeManifest}=require('../app/deckforge-editor/deckforge-plugin.cjs');
 const manifest=createHomeAssistantManifest('https://example.com');
 const pack=await packageNativeManifest(manifest);
 assert.ok(pack.filename.endsWith('.deckforgePlugin'));
 const parsed=await parseDeckForgePackage(pack.archive);
 assert.deepEqual(parsed.native,manifest);
});

test('native discovery WSS allows explicit 1 MiB receive while keeping default and outgoing limits',()=>{
 const {validateNetworkEndpoints,socketReceiveLimit,validateSocketOperation}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const ep={id:'ha',url:'wss://example.com/api/websocket',method:'WSS',auth:'home-assistant',maxReceiveBytes:1048576};
 validateNetworkEndpoints([ep],['display','network.websocket']);
 assert.equal(socketReceiveLimit(ep),1048576);
 assert.equal(socketReceiveLimit({...ep,maxReceiveBytes:undefined}),8192);
 assert.throws(()=>validateNetworkEndpoints([{...ep,maxReceiveBytes:1048577}],['display','network.websocket']),/receive limit/);
 assert.throws(()=>validateSocketOperation({op:'socketSend',value:'x'.repeat(8193)},[ep]),/limit/);
});

test('HA control publishes editable title independently from its status image',()=>{
 const {controlKey}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 let title,draw;
 const api={getSharedState:()=>({status:'연결됨',entities:{'switch.fan':{label:'주방등',value:'on'}}}),
  setTitle:value=>{title=value;},setState(){},drawKey:value=>{draw=value;}};
 controlKey({type:'appear'},{entity:'switch.fan'},0,{},api);
 assert.equal(title,'주방등');
 assert.equal(draw.background,undefined,'control artwork must allow button background');
 assert.ok(draw.commands.some(x=>x.text==='켜짐'));
 assert.ok(!draw.commands.some(x=>x.text==='주방등'));
});


test('router revokes old mount before catalogue awaits and skips obsolete sync generations',async()=>{
 const old={context:'old',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',slot:0,gesture:'down'};
 const fresh={...old,context:'fresh'},last={...old,context:'last'};
 const ctx={context:'old'},retired=[],applied=[],legacyApplied=[];
 let release,started;
 const entered=new Promise(resolve=>{started=resolve;});
 const block=new Promise(resolve=>{release=resolve;});
 let calls=0;
 const native={contexts:new Map([['old',ctx]]),retire:x=>retired.push(x),manifests:async()=>[nativeManifest],
   loadServicePolicy:async()=>{},sync:cfg=>applied.push(cfg.map(x=>x.context)),key:()=>true,close(){}};
 const legacy={list:async()=>{if(++calls===1){started();await block;}return [];},sync:async cfg=>legacyApplied.push(cfg),key:()=>true,close:async()=>{}};
 const router=new PluginRouter(legacy,native);
 const a=router.sync([fresh]);await entered;
 assert.equal(router.key('old','down'),false);assert.deepEqual(retired,[ctx]);
 const b=router.sync([last]);assert.equal(router.key('fresh','down'),false);
 release();await Promise.all([a,b]);
 assert.deepEqual(applied,[['last']]);assert.equal(legacyApplied.length,1);
 await router.close();
});

test('Model 2 pool reuses only reset renderer within scope and cancels only active owner',async()=>{
 const {ScriptRunnerPool}=require('../app/deckforge-editor/deckforge-js-runtime.cjs');
 const created=[];
 const pool=new ScriptRunnerPool((plugin,scope)=>{
   const runner={plugin,scope,closed:false,async run(source){if(source==='wait')return new Promise((_,reject)=>{this.reject=reject;});if(source==='fail')throw Error('failure');return {scope};},close(){this.closed=true;this.reject?.(Error('cancelled'));}};
   created.push(runner);return runner;
 },{idleLimit:2});
 const a=pool.lease('A','button'),b=pool.lease('A','button'),svc=pool.lease('A','service');
 try{
   await a.run('one');await b.run('two');assert.equal(created.length,1);
   await svc.run('three');assert.equal(created.length,2);
   a.close();assert.equal(created[0].closed,false);
   const pending=b.run('wait');b.close();await assert.rejects(pending,/cancelled/);
   assert.equal(created[0].closed,true);assert.equal(created[1].closed,false);
   const next=pool.lease('A','button');await next.run('new');assert.equal(created.length,3);
   await assert.rejects(next.run('fail'),/failure/);assert.equal(created[2].closed,true);
   await next.run('newer');assert.equal(created.length,4);
   await pool.lease('B','button').run('other');assert.equal(pool.entries.size,2);assert.equal(created[1].closed,true);
   pool.clear();assert.equal(pool.entries.size,0);assert.ok(created.every(x=>x.closed));
 }finally{pool.close();}
 await assert.rejects(svc.run('closed'),/closed/);
});
test('Model 2 scheduler serializes same lane without blocking a service lane',async()=>{
 const {SdkScheduler}=require('../app/deckforge-editor/deckforge-sdk-scheduler.cjs');
 const s=new SdkScheduler(),calls=[],releases=[];
 const gate=id=>()=>{calls.push(id);return new Promise(resolve=>releases.push(resolve));};
 const a=s.run('A',()=>true,gate('a'),'button');
 const b=s.run('A',()=>true,gate('b'),'button');
 const c=s.run('A',()=>true,gate('service'),'service');
 try{
   await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['a','service']);
   releases[0]();await a;await new Promise(resolve=>setImmediate(resolve));
   assert.deepEqual(calls,['a','service','b']);releases[1]();releases[2]();await Promise.all([b,c]);
 }finally{s.close();releases.forEach(fn=>fn());}
});

test('Model 5 DrawOps host rejects unbounded, malformed and raw pixel worker commands before paint',async()=>{
 const {parseWorkerDrawProgram,resolveWorkerDrawProgram}=require('../app/deckforge-editor/deckforge-draw-ops.cjs');
 const spec={width:16,height:16,background:'#000000',commands:[{type:'rect',color:'#ff0000',x:0,y:0,width:4,height:4}]};
 const raw=(ops,memory={})=>JSON.stringify({ops,memory});
 const draw=spec=>({op:'drawKey',spec});
 const invalid=[
  raw([draw({...spec,width:145})]),raw([draw({...spec,commands:Array(33).fill(spec.commands[0])})]),
  raw([draw({...spec,commands:[{...spec.commands[0],url:'https://example.com'}]})]),
  raw([draw({...spec,commands:[{type:'text',color:'#ffffff',x:0,y:0,text:'bad\ntext',size:12}]})]),
  raw([draw({...spec,commands:[{type:'text',color:'#ffffff',x:0,y:0,text:'ok',size:12,font:'url(bad)'}]})]),
  raw([draw({...spec,commands:[{type:'image',color:'#ffffff'}]})]),
  raw([draw(spec),draw(spec),draw(spec)]),raw([draw(spec),{op:'pixels',width:1,height:1,rgba:'AAAAAA=='}]),
  raw(Array(17).fill({op:'title',value:'x'})),raw([],{value:'x'.repeat(8192)}),
  raw([{op:'title',value:'x'.repeat(512*1024)}]),'null','{}'
 ];
 let calls=0;
 for(const value of invalid)await assert.rejects(resolveWorkerDrawProgram(value,()=>{calls++;}),/invalid SDK draw operation/);
 assert.equal(calls,0);
 const original=raw([{op:'title',value:'before'},draw(spec),{op:'state',value:1}],{n:1});
 assert.equal(parseWorkerDrawProgram(original).ops.length,3);
 const rgba=Buffer.alloc(16*16*4).toString('base64');
 const painted=await resolveWorkerDrawProgram(original,async value=>{
  assert.deepEqual(value,spec);calls++;return {op:'pixels',width:16,height:16,rgba};
 });
 assert.deepEqual(painted,{ops:[{op:'title',value:'before'},{op:'pixels',width:16,height:16,rgba},{op:'state',value:1}],memory:{n:1}});
 await assert.rejects(resolveWorkerDrawProgram(original,async()=>({op:'pixels',width:1,height:1,rgba:'AAAAAA=='})),/invalid SDK draw operation/);
 let active=true;
 await assert.rejects(resolveWorkerDrawProgram(original,async()=>{active=false;return {op:'pixels',width:16,height:16,rgba};},()=>active),/cancelled/);
});

test('versioned settings receipts reject stale sync and pause after an uncertain write without replay',async()=>{
 const requests=[],events=[],counts=[];
 const m={...scriptManifest,permissions:['display','settings.write'],actions:[{...scriptManifest.actions[0],controllers:['Encoder']}]};
 const cfg={context:'revision-receipt',instanceId:'00000000-0000-4000-8000-000000000001',mountGeneration:1,configRevision:0,
  slot:16,gesture:'down',pluginUUID:m.id,actionUUID:m.actions[0].id,settings:{count:0}};
 const host=new NativePluginHost('/unused',e=>{events.push(e);if(e.kind==='nativeSettingsCommit')requests.push(e);},()=>({
  async run(_source,input){if(input.event.type==='rotateRight'){counts.push(input.settings.count);return {ops:[{op:'settingsPatch',value:{count:input.settings.count+1}}],memory:{}};}
   return {ops:[],memory:{}};},close(){}
 }),{settingsReceiptTimeout:100});
 const wait=async n=>{for(let i=0;i<100&&requests.length<n;i++)await new Promise(r=>setImmediate(r));assert.equal(requests.length,n);};
 try{
  host.sync([cfg],[m]);const ctx=host.contexts.get(cfg.context);await ctx.queue;
  assert.equal(host.key(cfg.context,'right',2),true);await wait(1);
  const first=requests[0];assert.equal(first.requestId,first.receiptId);assert.equal(first.instanceId,cfg.instanceId);
  assert.equal(first.mountGeneration,1);assert.equal(first.expectedRevision,0);
  assert.equal(host.acknowledgeSettings(cfg.context,first.requestId,true),true);await wait(2);
  assert.equal(requests[1].expectedRevision,1);
  host.sync([cfg],[m]);assert.equal(ctx.settings.count,1,'old sync must not roll back a confirmed write');
  await ctx.queue;
  assert.equal(ctx.settingsUncertain,true);assert.equal(host.key(cfg.context,'right'),false);
  assert.equal(host.acknowledgeSettings(cfg.context,requests[1].requestId,true),false);
  assert.deepEqual(counts,[0,1]);assert.ok(events.some(e=>e.kind==='error'&&e.message.includes('outcome unknown')));
  host.sync([{...cfg,configRevision:1,settings:{count:1}}],[m]);
  assert.equal(ctx.settingsUncertain,true,'same revision is not proof of a lost write outcome');
  host.sync([{...cfg,configRevision:2,settings:{count:2}}],[m]);await ctx.queue;
  assert.equal(ctx.settingsUncertain,false);assert.equal(ctx.settings.count,2);assert.deepEqual(counts,[0,1],'no automatic replay');
 }finally{host.close();}
});

test('HA sensor simultaneous display and rotation follow the saved selection order',()=>{
 const {sensorKey}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const shared={status:'연결됨',entities:{'sensor.outdoor':{label:'Outdoor',value:'10'},'sensor.indoor':{label:'Indoor',value:'20'}}};
 let frame;const api={getSharedState:()=>shared,setTitle(){},drawKey:spec=>frame=spec};
 const settings={entities:['sensor.outdoor','sensor.indoor'],mode:'all',labels:true,unit:false,decimals:-1,fontSize:36,seconds:5};
 sensorKey({type:'appear'},settings,0,{},api);
 assert.ok(frame.commands.find(c=>c.text==='Outdoor').y<frame.commands.find(c=>c.text==='Indoor').y);
 const reversed={...settings,entities:[...settings.entities].reverse()};
 sensorKey({type:'appear'},reversed,0,{},api);
 assert.ok(frame.commands.find(c=>c.text==='Indoor').y<frame.commands.find(c=>c.text==='Outdoor').y);
 const memory={};sensorKey({type:'appear'},{...reversed,mode:'press'},0,memory,api);
 assert.ok(frame.commands.some(c=>c.text==='Indoor'));
 sensorKey({type:'press'},{...reversed,mode:'press'},0,memory,api);
 assert.ok(frame.commands.some(c=>c.text==='Outdoor'));
});

test('settingsResult is opt-in, bounded, non-privileged, and never replays an uncertain input',async()=>{
 const m={...scriptManifest,permissions:['display','settings.write'],capabilities:['settingsResult'],actions:[{...scriptManifest.actions[0],controllers:['Encoder']}]};
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,permissions:['display']}),/capabilities/);
 assert.throws(()=>validateNativeManifest({...m,capabilities:['unknown']}),/capabilities/);
 assert.throws(()=>validateNativeManifest({...m,capabilities:['settingsResult','settingsResult']}),/capabilities/);
 const cfg={context:'result-test',slot:16,gesture:'down',pluginUUID:m.id,actionUUID:m.actions[0].id,settings:{count:0}};
 const req=[],results=[],inputs=[];
 const host=new NativePluginHost('/unused',e=>{if(e.kind==='nativeSettingsCommit')req.push(e);},()=>({
  async run(_source,input){
   if(input.event.type==='settingsResult'){results.push(input.event.response);return {ops:[{op:'title',value:input.event.response.status}],memory:{}};}
   if(input.event.type==='rotateRight'){inputs.push(input.settings.count);return {ops:[{op:'settingsPatch',value:{count:input.settings.count+1}}],memory:{}};}
   return {ops:[],memory:{}};
  },close(){}
 }),{settingsReceiptTimeout:100});
 const wait=async n=>{for(let i=0;i<100&&req.length<n;i++)await new Promise(r=>setImmediate(r));assert.equal(req.length,n);};
 const drain=async ctx=>{for(let i=0;i<8;i++){const queue=ctx.queue;await queue;if(queue===ctx.queue)return;}assert.fail('queue did not settle');};
 try{
  host.sync([cfg],[m]);const ctx=host.contexts.get(cfg.context);await drain(ctx);
  assert.throws(()=>host.validateScriptOps(ctx,'settingsResult',[{op:'settingsPatch',value:{count:99}}]),/privileged operation/);
  assert.equal(host.key(cfg.context,'right'),true);await wait(1);
  assert.equal(host.acknowledgeSettings(cfg.context,req[0].requestId,true),true);await drain(ctx);
  assert.deepEqual(results,[{status:'saved',requestId:req[0].requestId}]);assert.equal(ctx.settings.count,1);
  assert.equal(host.key(cfg.context,'right'),true);await wait(2);
  assert.equal(host.acknowledgeSettings(cfg.context,req[1].requestId,false),false);await drain(ctx);
  assert.deepEqual(results[1],{status:'rejected',requestId:req[1].requestId});assert.equal(ctx.settings.count,1);
  assert.equal(host.key(cfg.context,'right',2),true);await wait(3);await drain(ctx);
  assert.deepEqual(results[2],{status:'unknown',requestId:req[2].requestId});
  assert.deepEqual(inputs,[0,1,1]);assert.equal(ctx.settingsUncertain,true);
  assert.equal(host.key(cfg.context,'right'),false);assert.equal(req.length,3);
  host.sync([],[m]);host.sync([cfg],[{...m,capabilities:undefined}]);const next=host.contexts.get(cfg.context);await drain(next);
  assert.equal(host.key(cfg.context,'right'),true);await wait(4);host.acknowledgeSettings(cfg.context,req[3].requestId,true);await drain(next);
  assert.equal(results.length,3,'legacy manifests do not receive result events');
 }finally{host.close();}
});

test('router preserves unchanged native input on compatibility catalogue failure and rejects unconfirmed routes',async()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),item=state.pages[0][0]=Core.createAction('sd-plugin');
 item.settings.pluginUUID=nativeId;item.settings.actionUUID=nativeId+'.toggle';item.settings.pluginSettings={label:'Original'};
 const tracker=Core.createSdkMountTracker(),read=()=>tracker.reconcile('page',Core.sdkMountDescriptors(state));
 const cfg=read()[0],events=[],legacyCalls=[];
 let failed=false;
 const native=new NativePluginHost('/unused',e=>events.push(e));
 native.manifests=async()=>[nativeManifest];native.loadServicePolicy=async()=>{};
 const legacy={list:async()=>{if(failed)throw Error('compatibility catalogue unavailable');return [];},
   sync:async()=>{},key:(...args)=>{legacyCalls.push(args);return true;},inspector:()=>true,close:async()=>{}};
 const router=new PluginRouter(legacy,native);
 try{
  await router.sync([cfg]);
  failed=true;await assert.rejects(router.sync([cfg]),/compatibility catalogue unavailable/);
  assert.equal(router.key(cfg.context,'down'),true);
  assert.equal(router.key(cfg.context,'up'),true);
  item.settings.pluginSettings={label:'Changed'};const changed=read()[0];
  assert.equal(changed.context,cfg.context);
  const additional=state.pages[0][1]=Core.createAction('sd-plugin');
  additional.settings.pluginUUID=nativeId;additional.settings.actionUUID=nativeId+'.toggle';
  const latest=read(),fresh=latest.find(c=>c.context!==cfg.context);
  assert.ok(fresh);
  await assert.rejects(router.sync(latest),/compatibility catalogue unavailable/);
  const count=events.length;
  assert.equal(router.key(cfg.context,'down'),false,'old native settings are not a current route');
  assert.equal(router.key(fresh.context,'down'),false,'unconfirmed native mount never falls through');
  assert.equal(router.inspector(fresh.context),false);
  assert.equal(events.length,count);assert.deepEqual(legacyCalls,[]);
  failed=false;await router.sync(latest);
  assert.equal(router.key(cfg.context,'down'),true);
  assert.equal(router.key(fresh.context,'down'),true);
  assert.deepEqual(legacyCalls,[]);
 }finally{await router.close();}
});

test('native durable receipt is independent of a blocked compatibility catalogue',async()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),item=state.pages[0][0]=Core.createAction('sd-plugin');
 item.settings.pluginUUID=nativeId;item.settings.actionUUID=nativeId+'.toggle';item.settings.pluginSettings={count:0};
 const cfg=Core.createSdkMountTracker().reconcile('page',Core.sdkMountDescriptors(state))[0];
 const m={...scriptManifest,permissions:['display','settings.write']},requests=[];
 let entered,release,calls=0,blockedSync;
 const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const native=new NativePluginHost('/unused',e=>{if(e.kind==='nativeSettingsCommit')requests.push(e);},()=>({
  async run(_source,input){return {ops:input.event.type==='press'?[{op:'settingsPatch',value:{count:input.settings.count+1}}]:[],memory:{}};},close(){}
 }),{settingsReceiptTimeout:5000});
 native.manifests=async()=>[m];native.loadServicePolicy=async()=>{};
 const legacy={list:async()=>{if(++calls===2){entered();await gate;}return [];},sync:async()=>{},close:async()=>{}};
 const router=new PluginRouter(legacy,native);
 try{
  await router.sync([cfg]);const ctx=native.contexts.get(cfg.context);await ctx.queue;
  assert.equal(router.key(cfg.context,'down'),true);
  for(let i=0;i<100&&!requests.length;i++)await new Promise(r=>setImmediate(r));
  assert.equal(requests.length,1);
  const id=requests[0].requestId;
  blockedSync=router.sync([cfg]);await started;
  assert.ok(router.pendingSettingsRequest(cfg.context,id));
  let outcome;
  const ack=router.acknowledgeSettings(cfg.context,id,true).then(value=>{outcome=value;});
  // The unrelated catalogue is still blocked. A valid acknowledgement
  // must settle without requiring the gate to be released.
  await new Promise(r=>setImmediate(r));
  assert.equal(outcome,true);
  await ack;assert.equal(ctx.settings.count,1);
  assert.equal(await router.acknowledgeSettings(cfg.context,id,true),false);
  release();await blockedSync;
  assert.equal(requests.length,1);assert.equal(ctx.settings.count,1);
 }finally{release();if(blockedSync)await blockedSync.catch(()=>{});await router.close();}
});

test('router blocks a pending settings write immediately when a newer mount revision is queued',async()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),item=state.pages[0][0]=Core.createAction('sd-plugin');
 item.settings.pluginUUID=nativeId;item.settings.actionUUID=nativeId+'.toggle';item.settings.pluginSettings={count:0};
 const tracker=Core.createSdkMountTracker(),read=()=>tracker.reconcile('page',Core.sdkMountDescriptors(state));
 const cfg=read()[0],m={...scriptManifest,permissions:['display','settings.write']};
 let release,entered,calls=0;
 const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const requests=[];
 const native=new NativePluginHost('/unused',e=>{if(e.kind==='nativeSettingsCommit')requests.push(e);},()=>({
  async run(_source,input){return {ops:input.event.type==='press'?[{op:'settingsPatch',value:{count:input.settings.count+1}}]:[],memory:{}};},close(){}
 }),{settingsReceiptTimeout:2000});
 native.manifests=async()=>[m];native.loadServicePolicy=async()=>{};
 const legacy={list:async()=>{if(++calls===2){entered();await gate;}return [];},sync:async()=>{},close:async()=>{}};
 const router=new PluginRouter(legacy,native);
 try{
  await router.sync([cfg]);const ctx=native.contexts.get(cfg.context);await ctx.queue;
  assert.equal(router.key(cfg.context,'down'),true);
  for(let i=0;i<100&&!requests.length;i++)await new Promise(r=>setImmediate(r));
  assert.equal(requests.length,1);
  const request=requests[0];
  assert.equal(router.pendingSettingsRequest(cfg.context,request.requestId).requestId,request.requestId);
  item.settings.pluginSettings={count:8};read();
  item.settings.pluginSettings={count:0};const aba=read()[0];
  assert.equal(aba.configRevision,cfg.configRevision+2);
  const sync=router.sync([aba]);await started;
  assert.equal(router.pendingSettingsRequest(cfg.context,request.requestId),null);
  assert.equal(await router.acknowledgeSettings(cfg.context,request.requestId,true),false,'stale durable ACK must not bypass desired revision guard');
  release();await sync;await ctx.queue;
  assert.equal(native.acknowledgeSettings(cfg.context,request.requestId,true),false);
  assert.equal(ctx.settings.count,0);assert.equal(requests.length,1);
  // Same physical slot, new identity: the old request must remain revoked.
  state.pages[0][0]=Core.cloneActionInstances(item);
  const clone=read()[0];assert.notEqual(clone.instanceId,cfg.instanceId);
  const moved=router.sync([clone]);
  assert.equal(router.pendingSettingsRequest(cfg.context,request.requestId),null);
  await moved;
  assert.equal(native.contexts.has(cfg.context),false);
 }finally{release();await router.close();}
});
test('compound settings and global/network effects never publish a partial write or display',async()=>{
 const manifest={...scriptManifest,permissions:['display','settings.write','global.settings']};
 const cfg={context:'compound-test',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{count:0}};
 const events=[];
 const host=new NativePluginHost('/unused',e=>events.push(e),()=>({
  async run(_source,input){return {ops:input.event.type==='press'?[{op:'title',value:'partial'},{op:'settingsPatch',value:{count:1}},{op:'globalSettings',value:{count:2}}]:[],memory:{}};},close(){}
 }));
 let vaultWrites=0;host.vault={read:async()=>({value:{},revision:null}),write:async()=>{vaultWrites++;return true;}};
 try{
  host.sync([cfg],[manifest]);const ctx=host.contexts.get(cfg.context);await ctx.queue;
  assert.equal(host.key(cfg.context,'down'),true);await ctx.queue;
  assert.equal(vaultWrites,0);assert.equal(ctx.settings.count,0);
  assert.ok(!events.some(e=>e.kind==='nativeSettingsCommit'||e.payload?.title==='partial'));
  assert.equal(ctx.failed,true);
 }finally{host.close();}
});

test('socket loss invalidates queued stream data and delivers terminal notice despite saturated FIFO',async()=>{
 const {EventEmitter}=require('node:events');
 const ep={id:'live',url:'wss://example.com/events',method:'WSS'};
 const m={...scriptManifest,permissions:['display','network.websocket'],networkEndpoints:[ep]};
 const calls=[],sockets=[];
 let unblock,started;const gate=new Promise(r=>unblock=r),entered=new Promise(r=>started=r);
 let hold=false;
 class Mock extends EventEmitter{
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];}
  send(data,cb){this.sent.push(data);cb?.();}
  terminate(){this.readyState=3;}
 }
 const host=new NativePluginHost('/unused',()=>{},()=>({
  async run(_source,input){
   const {type,response}=input.event;
   if(type==='appear')return {ops:[{op:'socketConnect',endpoint:'live'}],memory:{}};
   if(type==='settings'&&hold){hold=false;started();await gate;}
   if(type==='socketEvent')calls.push(response);
   return {ops:[],memory:{}};
  },close(){}
 }),{socketFactory:()=>{const socket=new Mock();sockets.push(socket);return socket;}});
 const cfg={context:'socket-notice',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{}};
 const drain=async ctx=>{for(let i=0;i<10;i++){const q=ctx.queue;await q;await new Promise(r=>setImmediate(r));if(q===ctx.queue)return;}assert.fail('queue did not settle');};
 try{
  host.sync([cfg],[m]);const ctx=host.contexts.get(cfg.context);await drain(ctx);
  const socket=sockets[0];socket.emit('open');await drain(ctx);
  const gen=calls[0].generation;assert.equal(calls[0].gap,false);
  hold=true;assert.equal(host.runScript(ctx,'settings'),true);await entered;
  socket.emit('message',Buffer.from('queued-old-data'),false);
  for(let i=ctx.pending;i<64;i++)assert.equal(host.runScript(ctx,'settings'),true);
  // Ordinary FIFO pressure is buffered, but real ingress overflow invalidates
  // the generation and delivers the reserved terminal notice.
  socket.emit('message',Buffer.from('buffered'),false);assert.equal(socket.readyState,1);
  host.receiveSocketFrame(ctx,ctx.socketToken,'overflow',2*1024*1024);
  assert.equal(socket.readyState,3);assert.equal(host.socketPending.size,0);
  assert.equal(host.rxReservedBytes,Buffer.byteLength(JSON.stringify('queued-old-data')),'stale accepted data stays charged');
  assert.ok(ctx.pending<=66);
  unblock();await drain(ctx);assert.equal(host.rxReservedBytes,0);
  assert.equal(calls.some(x=>x.event==='message'),false);
  const last=calls.at(-1);assert.equal(last.event,'error');assert.ok(['queue-capacity','rate-limit'].includes(last.error));
  assert.equal(last.gap,true);assert.ok(last.generation>gen);assert.equal(ctx.socketNotice,null);
  assert.equal(socket.sent.length,0);
 }finally{unblock();host.close();}
});

test('HA reconnect preserves catalogue but invalidates live values until a fresh full snapshot',()=>{
 const {service}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 let shared={},memory={},sent=[];
 const api={getSharedState:()=>structuredClone(shared),publishSharedState:s=>shared=structuredClone(s),connectSocket:()=>{},sendSocket:v=>sent.push(v)};
 const event=(type,response)=>service({type,response},{},0,memory,api);
 const msg=(generation,m)=>event('socketEvent',{event:'message',generation,body:JSON.stringify(m)});
 const open=generation=>event('socketEvent',{event:'open',generation});
 const discover=generation=>{
  msg(generation,{type:'result',id:1,success:true});
  msg(generation,{type:'result',id:2,success:true,result:[]});
  msg(generation,{type:'result',id:3,success:true,result:{entities:[]}});
 };
 const snapshot=(generation,a)=>msg(generation,{type:'event',id:4,event:{a}});
 event('start');open(1);discover(1);
 snapshot(1,{'switch.fan':{s:'off',a:{friendly_name:'Fan'}},'sensor.temp':{s:'21'}});
 assert.equal(shared.status,'연결됨');
 event('socketEvent',{event:'reconnecting',generation:2,gap:true});
 assert.equal(shared.status,'재연결 중');assert.equal(shared.controls.length,1);assert.equal(shared.sensors.length,1);
 assert.deepEqual(shared.entities,{});
 const before=sent.length;
 event('serviceMessage',{message:{entity:'switch.fan'}});
 assert.equal(sent.length,before);
 msg(1,{type:'event',id:4,event:{a:{'switch.fan':{s:'on'}}}});
 assert.equal(shared.status,'재연결 중');
 open(2);discover(2);
 msg(2,{type:'event',id:4,event:{c:{'switch.fan':{'+':{s:'on'}}}}});
 assert.equal(shared.status,'상태 구독 중');assert.deepEqual(shared.entities,{});
 snapshot(2,{'switch.fan':{s:'off'},'sensor.new':{s:'22'}});
 assert.equal(shared.status,'연결됨');assert.deepEqual(shared.sensors.map(x=>x.value),['sensor.new']);
 event('serviceMessage',{message:{entity:'switch.fan'}});
 const command=sent.at(-1);assert.equal(command.service,'toggle');
 msg(2,{type:'result',id:command.id,success:true});
 assert.equal(shared.entities['switch.fan'].value,'off','command receipt must not invent state');
 msg(2,{type:'event',id:4,event:{c:{'switch.fan':{'+':{s:'on'}}},r:['sensor.new']}});
 assert.equal(shared.entities['switch.fan'].value,'on');assert.equal(shared.sensors.length,0);
});

test('conditional tick schedule runs only for auto multi-selection and follows confirmed settings',async()=>{
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const m=createHomeAssistantManifest('https://example.com'),action=m.actions[1];
 assert.doesNotThrow(()=>validateNativeManifest(m));
 for(const tickWhen of [{...action.tickWhen,minItems:0},{...action.tickWhen,setting:'missing'},{...action.tickWhen,equals:'invalid'},{...action.tickWhen,selection:'mode'}])
  assert.throws(()=>validateNativeManifest({...m,actions:[m.actions[0],{...action,tickWhen}]}),/tick condition/);
 let now=1000;const calls=[];
 const cfg={context:'conditional-tick',slot:0,gesture:'down',pluginUUID:m.id,actionUUID:action.id,settings:{mode:'all',entities:['sensor.a','sensor.b']}};
 // Isolate the action scheduler from real HA I/O.
 const manifest={...m,permissions:['display','timer.tick'],capabilities:undefined,networkEndpoints:undefined,service:undefined,actions:[{...action,sharedStateView:undefined}]};
 const host=new NativePluginHost('/unused',()=>{},()=>({async run(_source,input){calls.push(input.event.type);return {ops:[],memory:{}};},close(){}}),{now:()=>now});
 try{
  host.sync([cfg],[manifest]);const ctx=host.contexts.get(cfg.context);await ctx.queue;
  assert.equal(ctx.tickDue,null);assert.equal(host.tickTimer,null);
  host.sync([{...cfg,settings:{mode:'press',entities:['sensor.a','sensor.b']}}],[manifest]);await ctx.queue;assert.equal(ctx.tickDue,null);
  host.sync([{...cfg,settings:{mode:'auto',entities:['sensor.a']}}],[manifest]);await ctx.queue;assert.equal(ctx.tickDue,null);
  host.sync([{...cfg,settings:{mode:'auto',entities:['sensor.a','sensor.b']}}],[manifest]);await ctx.queue;
  assert.equal(ctx.tickDue,2000);assert.ok(host.tickTimer);
  now=1999;host.tick();assert.equal(calls.includes('tick'),false);
  now=2000;host.tick();await ctx.queue;assert.equal(calls.filter(x=>x==='tick').length,1);
  host.sync([cfg],[manifest]);await ctx.queue;assert.equal(ctx.tickDue,null);assert.equal(host.tickTimer,null);
  now=10000;host.tick();assert.equal(calls.filter(x=>x==='tick').length,1);
 }finally{host.close();}
});
test('HA shared state changes never reset or advance automatic sensor rotation',()=>{
 const {sensorKey}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const vm=require('node:vm');let now=1000;
 const render=vm.runInNewContext('('+sensorKey.toString()+')',{Date:{now:()=>now}});
 let shared={status:'연결됨',entities:{'sensor.a':{label:'A',value:'10'},'sensor.b':{label:'B',value:'20'}}},frame;
 const api={getSharedState:()=>shared,setTitle(){},drawKey:spec=>frame=spec};
 const settings={mode:'auto',entities:['sensor.a','sensor.b'],seconds:5,labels:true,unit:false,decimals:-1,fontSize:36};
 const memory={};render({type:'appear'},settings,0,memory,api);
 now=5500;shared.entities['sensor.a'].value='11';render({type:'sharedState'},settings,0,memory,api);
 assert.equal(memory.since,1000);assert.equal(memory.index,0);assert.ok(frame.commands.some(c=>c.text==='11'));
 now=6000;render({type:'tick'},settings,0,memory,api);assert.equal(memory.index,1);assert.equal(memory.since,6000);
 now=7000;render({type:'sharedState'},settings,0,memory,api);assert.equal(memory.index,1);assert.equal(memory.since,6000);
});

test('generic native settings UI separates presentation, validates references and preserves stored values',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const manifest=require('../examples/deckforge-sdk/settings-ui.native.json'),action=manifest.actions[0];
 assert.doesNotThrow(()=>validateNativeManifest(manifest));
 const {settingsSchema:schema,settingsUI:ui}=action;
 const defaults=core.nativeEffectiveSettings(schema,{});
 assert.equal(core.nativeSettingVisible(ui[1],defaults),true);
 assert.equal(core.nativeSettingVisible(ui[1],{...defaults,enabled:false}),false);
 assert.deepEqual(core.nativeEffectiveSettings(schema,{enabled:false,amount:31,color:'#abcdef'}),{enabled:false,amount:31,color:'#abcdef'});
 for(const color of ['red','#fff','#11223344','url(x)'])assert.throws(()=>core.nativeEffectiveSettings(schema,{color}),/invalid setting/);
 for(const bad of [
  [...ui,{key:'missing'}],
  [...ui,ui[0]],
  [{key:'color',control:'slider'}],
  [{key:'amount',visibleWhen:{key:'amount',equals:50}}],
  [{key:'amount',visibleWhen:{key:'enabled',equals:'true'}}],
  [{key:'amount',visibleWhen:{key:'color',equals:'#FFFFFF'}}],
  [{key:'enabled',group:'<x>',html:'<script>'}],
  [{key:'enabled',visibleWhen:{key:'amount',equals:50}}]
 ])assert.throws(()=>validateNativeManifest({...manifest,actions:[{...action,settingsUI:bad}]}),/settings UI/);
 assert.doesNotThrow(()=>validateNativeManifest({...manifest,actions:[{...action,settingsUI:undefined}]}));
 const conditional=[{key:'a',label:'A',type:'boolean',default:true},{key:'b',label:'B',type:'boolean',default:true},{key:'c',label:'C',type:'boolean',default:false}];
 assert.throws(()=>core.validateNativeSettingsUI(conditional,[{key:'a',visibleWhen:{key:'b',equals:true}},{key:'b',visibleWhen:{key:'c',equals:false}}]),/settings UI/);
});

test('native title policy prioritizes explicit empty title, current selection, live and default',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const m=require('../examples/deckforge-sdk/settings-ui.native.json');
 assert.doesNotThrow(()=>validateNativeManifest(m));
 const schema=[{key:'entity',label:'Device',type:'dynamicSelect',source:'devices',default:''}];
 const policy={selectionLabel:'entity',defaultTitle:'Default'};
 assert.doesNotThrow(()=>core.validateNativeTitlePolicy(schema,policy));
 for(const bad of [{selectionLabel:'missing'},{defaultTitle:5},{html:'<b>'},{}])
   assert.throws(()=>core.validateNativeTitlePolicy(schema,bad),/title policy/);
 const item={title:'',settings:{pluginSettings:{entity:'a'}}};
 assert.equal(core.nativeTitle(item,policy),'Default');
 assert.equal(core.nativeTitle(item,policy,'Live'),'Live');
 assert.equal(core.nativeTitle(item,policy,''),'');
 item.settings.nativeTitleSelection=core.nativeTitleSelection(policy,item.settings.pluginSettings,'Device A');
 assert.equal(core.nativeTitle(item,policy,'Live'),'Device A');
 assert.deepEqual(core.nativeTitleSelection(policy,{entity:'a'},'',item.settings.nativeTitleSelection),item.settings.nativeTitleSelection);
 assert.equal(core.nativeTitleSelection(policy,{entity:'b'},'',item.settings.nativeTitleSelection),null);
 item.settings.pluginSettings.entity='b';assert.equal(core.nativeTitle(item,policy,'Live'),'Live');
 item.title='Manual';assert.equal(core.nativeTitle(item,policy,'Live'),'Manual');
 item.title='';item.settings.nativeTitleExplicit=true;assert.equal(core.nativeTitle(item,policy,'Live'),'');
});

test('HA title policy adopts legacy automatic titles without modifying source or explicit state text',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const m=require('../app/deckforge-editor/deckforge-ha-plugin.cjs').createHomeAssistantManifest('https://example.com');
 assert.doesNotThrow(()=>validateNativeManifest(m));
 const policy=m.actions[0].titlePolicy;
 assert.equal(policy.selectionLabel,'entity');
 const legacy={title:'Living',settings:{haAutoTitle:'Living',pluginSettings:{entity:'switch.a'},stateTitles:{first:{title:'Living',enabled:true},second:{title:'',enabled:true}}}};
 const before=JSON.stringify(legacy);
 const migrated=core.nativeAdoptLegacyTitle(legacy,policy,legacy.settings.haAutoTitle);
 assert.equal(JSON.stringify(legacy),before);
 assert.equal(migrated.title,'');
 assert.deepEqual(migrated.settings.nativeTitleAutoStates,{first:true,second:false});
 assert.equal(core.nativeTitle(migrated,policy,'New live'),'Living');
 const changed={...migrated,settings:{...migrated.settings,pluginSettings:{entity:'switch.b'}}};
 assert.equal(core.nativeTitle(changed,policy,'Kitchen'),'Kitchen');
 assert.equal(core.nativeAdoptLegacyTitle(changed,policy,'Living'),changed);
 const manual=core.nativeAdoptLegacyTitle({...legacy,title:''},policy,'Living');
 assert.equal(manual.settings.nativeTitleExplicit,true);
 assert.equal(core.nativeTitle(manual,policy,'Live'),'');
 const explicit=core.nativeAdoptLegacyTitle({...legacy,settings:{...legacy.settings,nativeTitleExplicit:true,nativeTitleAutoStates:{first:false}}},policy,'Living');
 assert.equal(explicit.title,'Living');
 assert.equal(explicit.settings.nativeTitleAutoStates.first,false);
});

test('native foreground policy is an opt-in single-keypad action contract',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const manifest=require('../examples/deckforge-sdk/settings-ui.native.json');
 const action=manifest.actions[0];
 assert.equal(action.visualPolicy,'foreground');
 assert.doesNotThrow(()=>validateNativeManifest(manifest));
 for(const patch of [{states:2},{visualPolicy:'unknown'},{controllers:['Encoder']}]){
  assert.throws(()=>validateNativeManifest({...manifest,actions:[{...action,...patch}]}),/visual policy/);
 }
 const plugin={uuid:manifest.id,runtime:'deckforge-sdk',actions:[{uuid:action.id,states:1,visualPolicy:'foreground'}]};
 const item={type:'sd-plugin',settings:{pluginUUID:manifest.id,actionUUID:action.id}};
 assert.equal(core.isNativeForeground(item,[plugin]),true);
 assert.equal(core.isNativeForeground(item,[]),false);
 assert.equal(core.isNativeForeground(item,[{...plugin,runtime:'streamdeck-sdk'}]),false);
 assert.equal(core.isNativeForeground({...item,settings:{...item.settings,pluginUUID:'other'}},[plugin]),false);
 assert.equal(core.isNativeForeground({type:'sd-plugin',settings:{actionUUID:'com.deckforge.native.home-assistant.sensor'}},[]),true);
});

test('native keepData removal requires current revision, blocks dependents and restores compatible package without touching data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-keepdata-'));
 const events=[],legacyCalls=[],legacy={list:async()=>[],sync:async c=>legacyCalls.push(c),key:()=>true,inspector:()=>true,onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
 const host=new NativePluginHost(root,e=>events.push(e)),router=new PluginRouter(legacy,host);
 const depId='com.deckforge.native.removal-dependent';
 const dependent={...nativeManifest,id:depId,dependencies:{[nativeId]:'^1.0.0'},actions:[{...nativeManifest.actions[0],id:depId+'.toggle'}]};
 const cfg={context:'keepdata',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{label:'Saved'}};
 try{
  await router.installNative(nativeManifest);
  await router.installNative(dependent);
  const blocked=await router.planNativeRemoval(nativeId);
  assert.deepEqual(blocked.dependents.map(p=>p.id),[depId]);
  await assert.rejects(router.removeNativeKeepingData(nativeId,blocked.revision),/dependents/);
  const depPlan=await router.planNativeRemoval(depId);
  await router.removeNativeKeepingData(depId,depPlan.revision);
  const plan=await router.planNativeRemoval(nativeId);
  await assert.rejects(router.removeNativeKeepingData(nativeId,'stale'),/revision changed/);
  const file=host.versions.currentFile(nativeId),before=await fs.readFile(file);
  const protectedFiles=[host.vault.file(nativeId),host.credentials.file(nativeId),path.join(root,'profile.json')];
  for(const file of protectedFiles){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'unchanged test bytes');}
  await router.sync([cfg]);assert.equal(router.key(cfg.context,'down'),true);
  const removed=await router.removeNativeKeepingData(nativeId,plan.revision);
  assert.equal(removed.mode,'keepData');
  assert.equal(host.contexts.has(cfg.context),false);
  assert.equal(router.key(cfg.context,'up'),false);
  await assert.rejects(fs.access(file),/ENOENT/);
  assert.deepEqual((await host.versions.removed(nativeId)).raw,before);
  assert.equal((await router.list()).some(p=>p.uuid===nativeId),false);
  await router.sync([cfg]);assert.deepEqual(legacyCalls.at(-1),[]);
  assert.equal(router.key(cfg.context,'down'),false);
  for(const file of protectedFiles)assert.equal(await fs.readFile(file,'utf8'),'unchanged test bytes');
  await assert.rejects(router.installNative({...nativeManifest,name:'Changed same version'}),/reinstall requires/);
  await assert.rejects(router.installNative({...nativeManifest,version:'2.0.0',actions:[{...nativeManifest.actions[0],states:1,events:{appear:[]}}]}),/contract/);
  await router.installNative(nativeManifest);
  await router.sync([cfg]);assert.equal(router.key(cfg.context,'down'),true);
  for(const file of protectedFiles)assert.equal(await fs.readFile(file,'utf8'),'unchanged test bytes');
  const again=await router.planNativeRemoval(nativeId);
  await router.removeNativeKeepingData(nativeId,again.revision);
  const newer={...nativeManifest,version:'1.1.0'};
  await router.installNative(newer);
  assert.equal((await router.list()).find(p=>p.uuid===nativeId).version,'1.1.0');
 }finally{await router.close();await fs.rm(root,{recursive:true,force:true});}
});

test('retained native recovery lists only absent plugins and checks revision and dependencies before reinstall',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-retained-'));
 const legacy={list:async()=>[],sync:async()=>{},key:()=>true,inspector:()=>true,onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
 const host=new NativePluginHost(root),router=new PluginRouter(legacy,host);
 const depId='com.deckforge.native.retained-dependent';
 const dependent={...nativeManifest,id:depId,dependencies:{[nativeId]:'^1.0.0'},actions:[{...nativeManifest.actions[0],id:depId+'.toggle'}]};
 try{
  await router.installNative(nativeManifest);await router.installNative(dependent);
  for(const id of [depId,nativeId]){
    const plan=await router.planNativeRemoval(id);await router.removeNativeKeepingData(id,plan.revision);
  }
  assert.deepEqual((await router.listRetainedNative()).map(p=>p.id).sort(),[nativeId,depId].sort());
  await assert.rejects(router.planRetainedNative(depId),/missing dependency/);
  const plan=await router.planRetainedNative(nativeId);
  assert.deepEqual(plan.permissions,['display']);
  assert.deepEqual(plan.endpoints,[]);
  await assert.rejects(router.restoreRetainedNative(nativeId,'stale'),/revision changed/);
  await router.restoreRetainedNative(nativeId,plan.revision);
  assert.deepEqual((await router.listRetainedNative()).map(p=>p.id),[depId]);
  await assert.rejects(router.planRetainedNative(nativeId),/identical version|already installed/);
  const dp=await router.planRetainedNative(depId);
  await router.restoreRetainedNative(depId,dp.revision);
  assert.deepEqual(await router.listRetainedNative(),[]);
  assert.equal((await router.list()).length,2);
 }finally{await router.close();await fs.rm(root,{recursive:true,force:true});}
});
test('SDK availability distinguishes missing action and dependency without modifying saved button',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const item={type:'sd-plugin',title:'Saved',icon:{kind:'glyph',glyph:'X'},settings:{pluginUUID:nativeId,actionUUID:nativeId+'.toggle',pluginSettings:{label:'Saved'}}};
 const prior=JSON.stringify(item);
 const plugin={uuid:nativeId,actions:[{uuid:nativeId+'.toggle'}]};
 assert.equal(core.sdkAvailability(item,null),null);
 assert.equal(core.sdkAvailability(item,[]),'missing');
 assert.equal(core.sdkAvailability(item,[{...plugin,available:false}]),'dependency');
 assert.equal(core.sdkAvailability(item,[{...plugin,actions:[]}]),'action-missing');
 assert.equal(core.sdkAvailability(item,[plugin]),'available');
 assert.equal(JSON.stringify(item),prior);
});

test('native retained purge targets only approved removed identity and known historical credentials',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-retained-purge-'));
 const legacy={list:async()=>[],sync:async()=>{},key:()=>true,inspector:()=>true,onSystemSuspend(){},onSystemResume(){},close:async()=>{}};
 const host=new NativePluginHost(root),router=new PluginRouter(legacy,host);
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const {credentialBinding}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const first=createHomeAssistantManifest('https://first.example.com');
 const second={...createHomeAssistantManifest('https://second.example.com'),version:'9.0.0'};
 const id=first.id;
 try{
  await router.installNative(first);
  await assert.rejects(router.planRetainedPurge(id),/keepData first/);
  const update=await router.planNativeInstall(second);await router.replaceNative(second,update.currentRevision);
  const oldCredential=host.credentials.file(credentialBinding(id,first.networkEndpoints[0]));
  const newCredential=host.credentials.file(credentialBinding(id,second.networkEndpoints[0]));
  const unrelated=host.credentials.file(credentialBinding(nativeId,second.networkEndpoints[0]));
  const global=host.vault.file(id),profile=path.join(root,'profile.json');
  for(const file of [oldCredential,newCredential,unrelated,global,profile]){
   await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture bytes');
  }
  const remove=await router.planNativeRemoval(id);await router.removeNativeKeepingData(id,remove.revision);
  const plan=await router.planRetainedPurge(id);
  assert.deepEqual(plan.counts,{credential:2,settings:1,history:2,retained:1});
  assert.equal(Object.hasOwn(plan,'files'),false);
  await assert.rejects(router.purgeRetainedNative(id,'stale'),/data changed/);
  await fs.writeFile(global,'changed');
  await assert.rejects(router.purgeRetainedNative(id,plan.revision),/data changed/);
  const foreign=path.join(host.versions.historyDir(id),'unknown.txt');await fs.writeFile(foreign,'keep');
  await assert.rejects(router.planRetainedPurge(id),/unrecognized history/);
  await fs.unlink(foreign);
  const latest=await router.planRetainedPurge(id);
  const result=await router.purgeRetainedNative(id,latest.revision);
  assert.deepEqual(result,{id,status:'purged',deleted:6,total:6});
  for(const file of [oldCredential,newCredential,global,host.versions.removedFile(id)])await assert.rejects(fs.access(file),/ENOENT/);
  assert.equal(await fs.readFile(unrelated,'utf8'),'fixture bytes');
  assert.equal(await fs.readFile(profile,'utf8'),'fixture bytes');
  assert.equal((await router.listRetainedNative()).length,0);
  assert.deepEqual(await fs.readdir(host.versions.historyDir(id)),[]);
 }finally{await router.close();await fs.rm(root,{recursive:true,force:true});}
});

test('native settings pending request is revoked on page retirement and host close',async()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),item=state.pages[0][0]=Core.createAction('sd-plugin');
 item.settings.pluginUUID=nativeId;item.settings.actionUUID=scriptManifest.actions[0].id;item.settings.pluginSettings={count:0};
 const tracker=Core.createSdkMountTracker(),m={...scriptManifest,permissions:['display','settings.write'],capabilities:['settingsResult']};
 const requests=[],resultEvents=[];
 const native=new NativePluginHost('/unused',e=>{if(e.kind==='nativeSettingsCommit')requests.push(e);},()=>({
  async run(_source,input){
   if(input.event.type==='settingsResult')resultEvents.push(input.event.response);
   return {ops:input.event.type==='press'?[{op:'settingsPatch',value:{count:1}}]:[],memory:{}};
  },close(){}
 }),{settingsReceiptTimeout:2000});
 native.manifests=async()=>[m];native.loadServicePolicy=async()=>{};
 const router=new PluginRouter({list:async()=>[],sync:async()=>{},close:async()=>{}},native);
 try{
  for(const [i,mode] of ['retire','close'].entries()){
   const cfg=tracker.reconcile('page-'+i,Core.sdkMountDescriptors(state))[0];
   await router.sync([cfg]);const ctx=native.contexts.get(cfg.context);await ctx.queue;
   assert.equal(router.key(cfg.context,'down'),true);
   for(let n=0;n<100&&requests.length<=i;n++)await new Promise(r=>setImmediate(r));
   assert.equal(requests.length,i+1);
   const request=requests[i],queued=ctx.queue;
   assert.ok(router.pendingSettingsRequest(cfg.context,request.requestId));
   if(mode==='retire')await router.sync([]);else await router.close();
   assert.equal(router.pendingSettingsRequest(cfg.context,request.requestId),null);
   assert.equal(native.acknowledgeSettings(cfg.context,request.requestId,true),false);
   await queued;
   assert.equal(ctx.settings.count,0);assert.equal(resultEvents.length,0);
  }
 }finally{await router.close();}
});


test('native mounts become usable before unrelated compatibility startup completes, after old routes retire',async()=>{
 const {StreamDeckPluginHost}=require('../app/deckforge-editor/sd-plugin-host.cjs');
 const legacy=new StreamDeckPluginHost('/unused'),native=new NativePluginHost('/unused');
 const uuid='com.deckforge.compat.startup',actionUUID=uuid+'.key';
 const nativeCfg={context:'replacement',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{label:'native'}};
 const legacyCfg={context:'slow',slot:1,gesture:'down',pluginUUID:uuid,actionUUID,settings:{}};
 const old={...nativeCfg,pluginUUID:uuid,actionUUID,appeared:true};
 legacy.contexts.set(old.context,old);
 legacy.list=async()=>[{uuid,actions:[{uuid:actionUUID}]}];
 native.manifests=async()=>[nativeManifest];native.loadServicePolicy=async()=>{};
 const retired=[],disappear=legacy.disappear.bind(legacy);
 legacy.disappear=ctx=>{retired.push(ctx.context);disappear(ctx);};
 let release,entered;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 legacy.ensure=async()=>{entered();await gate;throw Error('compatibility startup failed');};
 const router=new PluginRouter(legacy,native);
 let pending;
 try{
  pending=router.sync([nativeCfg,legacyCfg]);pending.catch(()=>{});
  await ready;
  assert.deepEqual(retired,['replacement']);
  assert.equal(legacy.contexts.has('replacement'),false);
  assert.equal(native.contexts.has('replacement'),true);
  assert.equal(router.key('replacement','down'),true);
  assert.equal(router.key('replacement','up'),true);
  assert.equal(router.key('slow','down'),false);
  release();await assert.rejects(pending,/compatibility startup failed/);
  assert.equal(router.key('replacement','down'),true);
  assert.equal(router.key('replacement','up'),true);
  assert.equal(router.key('slow','down'),false);
  legacy.ensure=async()=>{const inst={uuid};legacy.instances.set(uuid,inst);return inst;};
  await router.sync([nativeCfg,legacyCfg]);
  assert.equal(router.legacyMounts.has('slow'),true);
  assert.equal(router.key('replacement','down'),true);
 }finally{release();if(pending)await pending.catch(()=>{});await router.close();}
});

test('queued router synchronization applies its owned snapshot, not a subsequently mutated caller object',async()=>{
 let release,entered;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 const legacy={list:async()=>{entered();await gate;return [];},sync:async()=>{},close:async()=>{}};
 const native=new NativePluginHost('/unused');
 native.manifests=async()=>[nativeManifest];native.loadServicePolicy=async()=>{};
 const router=new PluginRouter(legacy,native);
 const cfg={context:'snapshot',slot:0,gesture:'down',pluginUUID:nativeId,actionUUID:nativeId+'.toggle',settings:{label:'before'}};
 let pending;
 try{
  pending=router.sync([cfg]);await ready;
  cfg.settings.label='after';cfg.slot=1;
  release();await pending;
  assert.equal(native.contexts.get('snapshot').settings.label,'before');
  assert.equal(native.contexts.get('snapshot').slot,0);
  assert.equal(router.key('snapshot','down'),true);
 }finally{release();if(pending)await pending.catch(()=>{});await router.close();}
});

test('native GitHub build monitor uses approved GET and renders Korean status',()=>{
 const {createGitHubManifest,buildKey}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const {validateNativeManifest}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const {resolveNetworkEndpoint,normalizeNetworkResult}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const m=validateNativeManifest(createGitHubManifest()),a=m.actions[0],settings=Object.fromEntries(a.settingsSchema.map(f=>[f.key,f.default])),memory={},requests=[],frames=[];
 const api={setTitle(){},drawKey:x=>frames.push(x),request:(...args)=>requests.push(args)};
 buildKey({type:'appear'},settings,0,memory,api);assert.equal(requests.length,0);
 buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,1);
 const [id,body,query,options]=requests[0];assert.equal(id,'runs');assert.equal(body,null);
 const resolved=resolveNetworkEndpoint(m.networkEndpoints[0],query,options);
 assert.equal(new URL(resolved.url).pathname,'/repos/SoonCheol/D200X-Deck/actions/workflows/deckforge-windows-build.yml/runs');
 const response={endpoint:'runs',ok:true,status:200,error:null,body:JSON.stringify({workflow_runs:[{status:'completed',conclusion:'success',run_number:35}],padding:'x'.repeat(12000)})};
 assert.equal(normalizeNetworkResult(m.networkEndpoints[0],response).ok,true);
 assert.equal(normalizeNetworkResult({...m.networkEndpoints[0],maxResponseBytes:undefined},response).ok,false);
 buildKey({type:'networkResult',response},settings,0,memory,api);
 assert.ok(frames.at(-1).commands.some(x=>x.text==='빌드 성공'));assert.ok(frames.at(-1).commands.some(x=>x.text==='#35'&&x.size===23&&x.bold));
 buildKey({type:'networkResult',response:{ok:false,status:403}},settings,0,memory,api);assert.ok(frames.at(-1).commands.some(x=>x.text==='권한 확인'));
});

test('GitHub adaptive refresh and marquee are independent, with bounded native polling',()=>{
 const {createGitHubManifest,buildKey}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const m=validateNativeManifest(createGitHubManifest()),a=m.actions[0],settings=Object.fromEntries(a.settingsSchema.map(f=>[f.key,f.default]));
 settings.label='MusicAssistantKOR';const memory={},requests=[],frames=[];
 const api={setTitle(){},drawKey:x=>frames.push(x),request:(...args)=>requests.push(args)};
 const realNow=Date.now;let now=100000;Date.now=()=>now;
 try{
  buildKey({type:'appear'},settings,0,memory,api);
  now+=1000;buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,1);
  const op={op:'networkRequest',endpoint:'runs',body:null,query:requests[0][2],options:requests[0][3]};
  const host=new NativePluginHost('/unused');
  const ctx={pluginUUID:m.id,permissions:m.permissions,action:a,networkEndpoints:m.networkEndpoints};
  assert.deepEqual(host.validateScriptOps(ctx,'tick',[op]).effects,[op]);host.close();
  assert.throws(()=>validateNativeManifest({...m,actions:[{...a,pollIntervalMs:1000}]}),/polling interval/);
  buildKey({type:'networkResult',response:{ok:true,body:JSON.stringify({workflow_runs:[{status:'in_progress',run_number:36}]})}},settings,0,memory,api);
  const first=frames.at(-1).commands[1].text;
  now+=3000;buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,1);assert.notEqual(frames.at(-1).commands[1].text,first);
  now+=2000;buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,2);
  buildKey({type:'networkResult',response:{ok:true,body:JSON.stringify({workflow_runs:[{status:'completed',conclusion:'success',run_number:36}]})}},settings,0,memory,api);
  now+=5000;buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,2);
  now+=10000;buildKey({type:'tick'},settings,0,memory,api);assert.equal(requests.length,3);
 }finally{Date.now=realNow;}
});

test('built-in HA preserves installed server and supports safe same-version configuration without general override',async()=>{
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-builtin-ha-'));
 const legacy={list:async()=>[],sync:async()=>{},close:async()=>{}};
 const host=new NativePluginHost(temp),router=new PluginRouter(legacy,host);
 try{
   assert.equal(await router.ensureBuiltinHa(),'installed');assert.equal(await router.ensureBuiltinHa(),'existing');
   const id='com.deckforge.native.home-assistant',next=createHomeAssistantManifest('https://example.com');
   assert.deepEqual(await router.credentialInfo(id),[]);
   await assert.rejects(router.planNativeInstall(next),/same version/);
   const plan=await router.planBuiltinHa(next);assert.equal(plan.kind,'configure');
   await router.replaceBuiltinHa(next,plan.currentRevision);
   const active=(await host.manifests()).find(m=>m.id===id);assert.equal(active.networkEndpoints[0].url,'wss://example.com/api/websocket');
   assert.equal(await router.ensureBuiltinHa(),'existing');
   assert.equal((await router.planBuiltinHa(next)).kind,'unchanged');
   await assert.rejects(router.planBuiltinHa({...next,name:'tampered'}),/only built-in/);
   await assert.rejects(router.replaceBuiltinHa(createHomeAssistantManifest('https://other.example'),plan.currentRevision),/revision changed/);
   const nextServer=createHomeAssistantManifest('https://other.example'),p=await router.planBuiltinHa(nextServer);
   await router.replaceBuiltinHa(nextServer,p.currentRevision);
   assert.equal((await host.manifests()).find(m=>m.id===id).networkEndpoints[0].url,'wss://other.example/api/websocket');
 }finally{await router.close();await fs.rm(temp,{recursive:true,force:true});}
});

test('built-in HA upgrade keeps previous endpoint credential and action setting contract',async()=>{
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const {credentialBinding}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ha-upgrade-'));
 const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async v=>Buffer.from(v),decryptStringAsync:async b=>({result:b.toString()})};
 const legacy={list:async()=>[],sync:async()=>{},close:async()=>{}};
 const host=new NativePluginHost(temp,()=>{},null,{storage}),router=new PluginRouter(legacy,host);
 const newer=createHomeAssistantManifest('https://example.com');
 const old=structuredClone(newer);delete old.capabilities;old.version='0.1.10';old.requiresDeckForge='>=2.0.48';
 const action=old.actions[0],legacyKeys=['offEntity','offOperation','onEntity','onOperation'];
 const operations=[['turn_on','켜기'],['turn_off','끄기'],['toggle','전환'],['trigger','자동화 실행'],['press','버튼 누르기']].map(([value,label])=>({value,label}));
 action.settingsSchema=[...action.settingsSchema.slice(0,2),
   {key:'offEntity',label:'기준 OFF · 제어 기기',type:'dynamicSelect',source:'controls',default:''},
   {key:'offOperation',label:'기준 OFF · 실행',type:'select',default:'turn_on',options:operations},
   {key:'onEntity',label:'기준 ON · 제어 기기',type:'dynamicSelect',source:'controls',default:''},
   {key:'onOperation',label:'기준 ON · 실행',type:'select',default:'turn_off',options:operations}];
 action.settingsUI=legacyKeys.map(key=>({key,visibleWhen:{key:'linked',equals:true}}));

 const binding=credentialBinding(old.id,old.networkEndpoints[0]),token='fixture.token-123';
 try{
   await router.installNative(old);
   const before=(await host.credentialInfo(old))[0];assert.equal(before.binding,binding);
   await host.writeCredential(old,binding,before.revision,token);
   const saved=await host.credentials.read(binding);
   await assert.rejects(router.planNativeInstall({...newer,name:'tampered HA'}),/existing settings contract/);
   assert.equal(await router.ensureBuiltinHa(),'updated');
   const actual=(await host.manifests()).find(m=>m.id===old.id);
   assert.deepEqual(actual,newer);
   assert.deepEqual(actual.actions[0].settingsSchema.map(f=>f.key),['entity','linked','linkEntity','linkOn','linkOff','linkReverse']);
   const stored={entity:'switch.base',linked:true,offEntity:'switch.a',onEntity:'switch.b',offOperation:'turn_on',onOperation:'turn_off'};
   const effective=require('../app/deckforge-editor/deck-core.js').nativeEffectiveSettings(actual.actions[0].settingsSchema,stored);
   assert.equal(effective.linkEntity,'');for(const key of legacyKeys)assert.equal(effective[key],stored[key]);
   const info=(await host.credentialInfo(actual))[0];assert.equal(info.binding,binding);assert.equal(info.configured,true);
   assert.deepEqual(await host.credentials.read(binding),saved);
   assert.equal(actual.actions[0].settingsSchema.find(f=>f.key==='linked').default,false);
   assert.equal(await router.ensureBuiltinHa(),'existing');
 }finally{await router.close();await fs.rm(temp,{recursive:true,force:true});}
});

test('HA batch preserves ordered deltas and publishes once; bounded send exception is batch-only',()=>{
 const {createHomeAssistantManifest,service}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const m=createHomeAssistantManifest('https://example.com'),host=new NativePluginHost('/unused');
 const ctx={service:true,permissions:m.permissions,capabilities:m.capabilities,networkEndpoints:m.networkEndpoints,sharedStateBytes:262144};
 let shared={status:'연결됨',entities:{'switch.a':{label:'A',value:'off',unit:'',kind:''}},controls:[{value:'switch.a',label:'A',group:'기기 미분류 스위치'}],sensors:[],others:[]},published=0;
 const memory={phase:'live',next:20,generation:2,subscriptionId:4,pending:[{id:11,base:'switch.a',target:'switch.a',operation:'turn_on'},{id:12,base:'switch.a',target:'switch.a',operation:'turn_off'}]};
 const ops=[],api={getSharedState:()=>structuredClone(shared),publishSharedState:v=>{published++;shared=v;ops.push({op:'publishSharedState',value:v});},sendSocket:v=>ops.push({op:'socketSend',value:v})};
 const event={type:'socketEvent',response:{event:'messages',generation:2,bodies:[
  {type:'event',id:4,event:{c:{'switch.a':{'+':{s:'on'}}}}},
  {type:'result',id:11,success:true},{type:'result',id:12,success:true},
  {type:'event',id:4,event:{r:['switch.a']}},
  {type:'event',id:4,event:{a:{'switch.a':{s:'off',a:{friendly_name:'Renamed'}}}}}
 ].map(x=>JSON.stringify(x))}};
 try{
  service(event,{},0,memory,api);assert.equal(published,1);
  assert.equal(shared.entities['switch.a'].value,'off');assert.equal(shared.controls[0].label,'Renamed');
  assert.equal(host.validateScriptOps(ctx,'socketEvent',ops,event.response).effects.length,2);
  assert.throws(()=>host.validateScriptOps(ctx,'socketEvent',ops),/one privileged/);
  assert.throws(()=>host.validateScriptOps({...ctx,capabilities:[]},'socketEvent',ops,event.response),/one privileged/);
 }finally{host.close();}
});
test('socket retry budget replenishes only after a stable connection',()=>{
 const host=new NativePluginHost('/unused',()=>{},()=>({close(){}}),{now:()=>now,socketStableMs:30000,socketRetryDelays:[100000,100000]});
 let now=1000;
 try{
  const ctx={socketGeneration:1,socketNotice:null},token={active:()=>true,generation:1,endpoint:{id:'x',reconnect:true},attempt:2,ready:true,openedAt:0};
  host.socketEvent=()=>true;ctx.socketToken=token;host.socketPending.add(token);
  host.finishSocket(ctx,token,'error','rate-limit',true);assert.equal(ctx.socketToken,null);
  Object.assign(token,{attempt:2,ready:true,openedAt:0,generation:ctx.socketGeneration});ctx.socketToken=token;host.socketPending.add(token);now=31000;
  host.finishSocket(ctx,token,'error','rate-limit',true);assert.equal(ctx.socketToken,token);assert.equal(token.attempt,1);
  host.disposeSocketTransport(token);host.socketPending.delete(token);
 }finally{host.close();}
});
test('scheduler admission pressure retries only unexecuted work and preserves context',async()=>{
 const host=new NativePluginHost('/unused',()=>{},()=>({close(){}}));
 const {SchedulerCapacityError}=require('../app/deckforge-editor/deckforge-sdk-scheduler.cjs');
 let calls=0,work=0;host.scheduler.run=async(_p,active,fn)=>{if(++calls===1)throw new SchedulerCapacityError();return active()?fn():undefined;};
 try{const result=await host.runAdmitted({pluginUUID:nativeId},'socketEvent',()=>true,()=>++work,'service');assert.equal(result,1);assert.equal(calls,2);assert.equal(work,1);
  await assert.rejects(host.runAdmitted({pluginUUID:nativeId},'socketEvent',()=>true,()=>{throw Object.assign(Error('execution failed'),{code:'SDK_SCHEDULER_CAPACITY'});},'service'),/execution failed/);
  assert.equal(calls,3,'an actual execution error is not replayed');}
 finally{host.close();}
});

test('GitHub build discovery returns bounded repository, branch and workflow selections without leaking tokens',async()=>{
  const {discoverGitHubBuildOptions}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
  const seen=[],bearer='fixture.secret-token';
  const request=async(endpoint,body,signal,opts)=>{
    seen.push(endpoint.url);assert.equal(endpoint.method,'GET');assert.equal(opts.bearer,bearer);
    const url=new URL(endpoint.url);assert.equal(url.origin,'https://api.github.com');
    const rows=url.pathname==='/user/repos'?[{full_name:'Owner/Repo'},{full_name:'Bad/../Repo'}]:
      url.pathname.endsWith('/branches')?[{name:'main'},{name:'feature/x'}]:
      {workflows:[{id:42,name:'Windows build',path:'.github/workflows/build.yml'}]};
    return {ok:true,body:JSON.stringify(rows)};
  };
  assert.deepEqual(await discoverGitHubBuildOptions('',bearer,request),{repositories:[{value:'Owner/Repo',label:'Owner/Repo'}],truncated:false});
  const detail=await discoverGitHubBuildOptions('Owner/Repo',bearer,request);
  assert.deepEqual(detail.workflows,[{value:'42',label:'Windows build',file:'build.yml'}]);
  assert.equal(detail.branches.length,2);assert.equal(seen.length,3);
  await assert.rejects(discoverGitHubBuildOptions('../Repo',bearer,request),/저장소 이름/);
  await assert.rejects(discoverGitHubBuildOptions('',null,request),/토큰 등록/);
  await assert.rejects(discoverGitHubBuildOptions('',bearer,async()=>({ok:false,status:401})),/인증 실패/);
});

test('HA domain subscription uses one legacy fallback per connection and rejects obsolete subscription frames',()=>{
 const {service}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 let shared={},memory={},sent=[];
 const api={getSharedState:()=>structuredClone(shared),publishSharedState:s=>shared=structuredClone(s),connectSocket:()=>{},sendSocket:v=>sent.push(v)};
 const event=(type,response)=>service({type,response},{},0,memory,api);
 const msg=(generation,m)=>event('socketEvent',{event:'message',generation,body:JSON.stringify(m)});
 const discover=gen=>{event('socketEvent',{event:'open',generation:gen});msg(gen,{type:'result',id:1,success:false,error:{code:'unknown_command'}});msg(gen,{type:'result',id:2,success:true,result:[]});msg(gen,{type:'result',id:3,success:true,result:{entities:[]}});};
 const reject=(gen,id,code='invalid_format')=>msg(gen,{type:'result',id,success:false,error:{code}});
 const snapshot=(gen,id,a)=>msg(gen,{type:'event',id,event:{a}});
 event('start');discover(1);
 assert.deepEqual(sent.at(-1),{id:4,type:'subscribe_entities',include:{domains:['switch','light','fan','input_boolean','script','scene','automation','button','input_button','sensor','binary_sensor']}});
 reject(1,4);assert.deepEqual(sent.at(-1),{id:5,type:'subscribe_entities'});
 const count=sent.length;reject(1,4);snapshot(1,4,{'switch.old':{s:'on'}});assert.equal(sent.length,count);assert.equal(shared.status,'상태 구독 중');
 snapshot(1,5,{'switch.new':{s:'off'},'weather.ignore':{s:'sunny'}});assert.equal(shared.status,'연결됨');assert.deepEqual(Object.keys(shared.entities),['switch.new']);
 snapshot(1,4,{'switch.old':{s:'on'}});assert.deepEqual(Object.keys(shared.entities),['switch.new']);
 event('socketEvent',{event:'reconnecting',generation:2,gap:true});discover(2);
 assert.equal(sent.at(-1).id,4);assert.ok(sent.at(-1).include);
 snapshot(1,5,{'switch.old':{s:'on'}});assert.equal(shared.status,'상태 구독 중');
 reject(2,4);reject(2,5);assert.equal(shared.status,'상태 구독 실패');
 const end=sent.length;reject(2,5);event('socketEvent',{event:'open',generation:2});assert.equal(sent.length,end);
 discover(3);reject(3,4,'unauthorized');assert.equal(shared.status,'상태 구독 실패');assert.equal(sent.at(-1).id,4);
});

test('opt-in socket JSON arrays preserve FIFO and atomically enforce logical message and byte budgets',()=>{
 const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
 const m=createHomeAssistantManifest('https://example.com'),host=new NativePluginHost('/unused');
 assert.doesNotThrow(()=>validateNativeManifest(m));
 assert.throws(()=>validateNativeManifest({...m,capabilities:['socketJsonArray']}),/capabilities/);
 const ctx={service:true,capabilities:m.capabilities},failures=[];
 host.now=()=>1000;host.flushSocketFrames=()=>{};host.finishSocket=(_c,_t,_e,reason,retry)=>failures.push({reason,retry});
 const token=()=>({rxQueue:[],rxCount:0,rxBytes:0,endpoint:m.networkEndpoints[0],bearer:'fixture.secret'});
 const push=(t,body,c=ctx)=>{const s=JSON.stringify(body);host.receiveSocketFrame(c,t,s,Buffer.byteLength(JSON.stringify(s)));};
 try{
  const t=token();
  push(t,[{id:1},{id:2}]);
  assert.deepEqual(t.rxQueue.map(x=>JSON.parse(x.body)),[{id:1},{id:2}]);
  assert.equal(t.rxCount,2);assert.equal(host.rxReservedBytes,t.rxBytes);
  assert.equal(t.rxBytes,t.rxQueue.reduce((sum,x)=>sum+x.bytes,0));
  const before=t.rxBytes;
  push(t,[{id:3},null]);assert.equal(failures.at(-1).reason,'invalid-message');
  push(t,Array.from({length:127},(_,id)=>({id})));assert.equal(failures.at(-1).reason,'rate-limit');
  assert.equal(t.rxCount,2);assert.equal(t.rxBytes,before);
  const legacy=token();push(legacy,[{id:1},{id:2}],{service:true,capabilities:['socketBatch']});
  assert.equal(legacy.rxCount,1);assert.deepEqual(JSON.parse(legacy.rxQueue[0].body),[{id:1},{id:2}]);
  const capped=token();capped.rxCount=255;push(capped,[{id:1},{id:2}]);
  assert.equal(failures.at(-1).reason,'queue-capacity');assert.equal(capped.rxQueue.length,0);
 }finally{host.close();}
});


test('native browser effect is press-only, permission-gated and HTTP(S)-only',async()=>{
  const opened=[],approvals=[];
  let now=1000,approved=false,active=true;
  const options={now:()=>now,browserOpen:async href=>opened.push(href),browserApproval:async(id,signature)=>{approvals.push([id,signature]);return approved;}};
  const host=new NativePluginHost('/unused',()=>{},()=>({close(){}}),options);
  const closedHost=new NativePluginHost('/unused',()=>{},()=>({close(){}}));
  const permissions=['display','browser.open'],ctx={pluginUUID:nativeId,action:scriptManifest.actions[0],permissions,signature:'fixture'};
  const op={op:'openUrl',value:'https://github.com/example/repo/actions/runs/123'};
  try{
    assert.doesNotThrow(()=>validateNativeManifest({...scriptManifest,permissions}));
    assert.throws(()=>validateNativeManifest({...nativeManifest,permissions}),/permissions/);
    assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).effects,[op]);
    for(const event of ['appear','settings','tick','networkResult','release','rotateLeft','heldRotateRight'])
      assert.throws(()=>host.validateScriptOps(ctx,event,[op]),/input event/);
    assert.throws(()=>host.validateScriptOps({...ctx,permissions:['display']},'press',[op]),/unauthorized/);
    assert.throws(()=>host.validateScriptOps({...ctx,service:true,permissions:[...permissions,'background.run']},'start',[op]),/background service/);
    assert.throws(()=>host.validateScriptOps(ctx,'press',[op,op]),/one privileged/);
    for(const value of ['file:///C:/Windows','javascript:alert(1)','ms-settings:','https://user:pass@example.com','https://example.com/a b','https://example.com\\evil','https://example.com/\n','https://','//example.com','https://example.com/'+ 'x'.repeat(2048)])
      assert.throws(()=>host.validateScriptOps(ctx,'press',[{...op,value}]),/invalid browser URL/);
    assert.equal(await closedHost.dispatchBrowserUrl(ctx,op,()=>true),false);
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),false);
    assert.deepEqual(opened,[]);
    approved=true;
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),true);
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),false,'rapid duplicate blocked');
    now+=1000;approved=false;
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),false,'revoked approval blocked');
    approved=true;active=false;
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),false,'stale context blocked');
    assert.deepEqual(opened,[op.value]);assert.ok(approvals.every(a=>a[0]===nativeId&&a[1]==='fixture'));
    active=true;host.browserApproval=async()=>{active=false;return true;};
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>active),false,'context retired during approval');
    assert.deepEqual(opened,[op.value]);
  }finally{host.close();closedHost.close();}
});


test('browser approval is encrypted separately, bound to installed manifest, and revocable across restart',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-browser-'));
  const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async v=>Buffer.from(v),decryptStringAsync:async b=>({result:b.toString()})};
  const opened=[],options={storage,browserOpen:async href=>opened.push(href),now:()=>1000};
  let host=new NativePluginHost(temp,()=>{},()=>({close(){}}),options);
  const m={...scriptManifest,permissions:['display','browser.open']};
  const op={op:'openUrl',value:'https://example.com/build'};
  try{
    const info=await host.browserPermissionInfo(m);
    const ctx={pluginUUID:m.id,permissions:m.permissions,browserRevision:info.digest};
    assert.equal(info.approved,false);
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>true),false);
    assert.deepEqual(await host.setBrowserPermission(m,true),{approved:true});
    assert.equal((await host.browserPermissionInfo(m)).approved,true);
    assert.deepEqual((await host.vault.read(m.id)).value,{});
    assert.deepEqual((await host.credentials.read(m.id)).value,{});
    host.close();host=new NativePluginHost(temp,()=>{},()=>({close(){}}),options);
    assert.equal((await host.browserPermissionInfo(m)).approved,true);
    const changed={...m,version:'9.0.0'};
    const changedInfo=await host.browserPermissionInfo(changed);
    assert.equal(changedInfo.approved,false);
    assert.equal(await host.dispatchBrowserUrl({...ctx,browserRevision:changedInfo.digest},op,()=>true),false);
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>true),true);
    await host.setBrowserPermission(m,false);
    host.close();host=new NativePluginHost(temp,()=>{},()=>({close(){}}),options);
    assert.equal((await host.browserPermissionInfo(m)).approved,false);
    assert.equal(await host.dispatchBrowserUrl(ctx,op,()=>true),false);
    assert.deepEqual(opened,[op.value]);
  }finally{host.close();await fs.rm(temp,{recursive:true,force:true});}
});


test('GitHub button opens only the displayed run ID and never a supplied external URL',()=>{
 const {createGitHubManifest,buildKey}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const {credentialBinding}=require('../app/deckforge-editor/deckforge-native-network.cjs');
 const m=validateNativeManifest(createGitHubManifest()),a=m.actions[0],settings=Object.fromEntries(a.settingsSchema.map(f=>[f.key,f.default]));
 assert.match(m.version,/^\d+\.\d+\.\d+$/);assert.ok(m.permissions.includes('browser.open'));
 assert.equal(credentialBinding(m.id,m.networkEndpoints[0]),credentialBinding(m.id,{...m.networkEndpoints[0]}));
 const memory={},requests=[],opened=[],frames=[];
 const api={setTitle(){},drawKey:x=>frames.push(x),request:(...args)=>requests.push(args),openUrl:url=>opened.push(url)};
 const send=(type,response)=>buildKey({type,response},settings,0,memory,api);
 const response=(id,run_number,status='in_progress',conclusion=null)=>({ok:true,body:JSON.stringify({workflow_runs:[{id,run_number,status,conclusion,html_url:'https://elsewhere.example/'}]})});
 const realNow=Date.now;let now=100000;Date.now=()=>now;
 try{
   send('appear');send('press');assert.equal(requests.length,1);assert.deepEqual(opened,[]);
   send('networkResult',response(12345,97));assert.equal(memory.display.number,'#97');assert.deepEqual(opened,[]);
   send('press');assert.deepEqual(opened,['https://github.com/SoonCheol/D200X-Deck/actions/runs/12345']);assert.equal(requests.length,1);
   now+=5000;send('tick');assert.equal(requests.length,2);assert.equal(opened.length,1);
   send('networkResult',response(12346,98,'completed','failure'));send('press');assert.equal(opened.at(-1),'https://github.com/SoonCheol/D200X-Deck/actions/runs/12346');
   send('networkResult',{ok:false,status:403});send('press');assert.equal(opened.length,2);
   send('networkResult',response('12347',99));send('press');assert.equal(opened.length,2);
   send('networkResult',response(12348,100,'completed','success'));
   settings.repository='SoonCheol/FusionMacroStudio';send('settings');send('press');assert.equal(opened.length,2);
   send('networkResult',response(23456,1,'completed','success'));send('press');assert.equal(opened.at(-1),'https://github.com/SoonCheol/FusionMacroStudio/actions/runs/23456');
   send('networkResult',{ok:true,body:JSON.stringify({workflow_runs:[]})});send('press');assert.equal(opened.length,3);
   send('networkResult',response(23457,2));send('networkResult',{ok:false,error:'capacity'});send('press');assert.equal(opened.length,3);
   send('networkResult',response(23458,3));send('release');send('tick');assert.equal(opened.length,3);
   const host=new NativePluginHost('/unused');
   try{
     const ctx={pluginUUID:m.id,permissions:m.permissions,action:a,networkEndpoints:m.networkEndpoints};
     const op={op:'openUrl',value:'https://github.com/SoonCheol/FusionMacroStudio/actions/runs/23458'};
     assert.deepEqual(host.validateScriptOps(ctx,'press',[op]).effects,[op]);
     assert.throws(()=>host.validateScriptOps(ctx,'tick',[op]),/input event/);
   }finally{host.close();}
 }finally{Date.now=realNow;}
});


test('GitHub multi-monitor drafts preserve order, validate targets and cycle in both directions',()=>{
 const {normalizeGitHubMonitorTargets:normalize,stepGitHubMonitorIndex:step,MAX_GITHUB_MONITOR_TARGETS:max}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const entries=[Object.freeze({repository:'Owner/First',workflow:'build.yml',branch:'main',label:'첫 번째'}),Object.freeze({repository:'Owner/Second',workflow:'123',branch:''}),Object.freeze({repository:'Owner/First',workflow:'build.yml',branch:'release'})];
 Object.freeze(entries);
 const original=JSON.stringify(entries),targets=normalize(entries);
 assert.deepEqual(targets,[{repository:'Owner/First',workflow:'build.yml',branch:'main',label:'첫 번째'},{repository:'Owner/Second',workflow:'123',branch:'',label:'Second'},{repository:'Owner/First',workflow:'build.yml',branch:'release',label:'First'}]);
 assert.equal(JSON.stringify(entries),original);
 assert.deepEqual(normalize([entries[2],entries[0],entries[1]]).map(x=>x.branch),['release','main','']);
 assert.equal(step(0,3,1),1);assert.equal(step(2,3,1),0);assert.equal(step(0,3,-1),2);assert.equal(step(0,1,-1),0);
 for(const entry of [{repository:'../Repo',workflow:'build.yml'},{repository:'Owner/Repo',workflow:'../build.yml'},{repository:'Owner/Repo',workflow:'https://example.org'},{repository:'Owner/Repo',workflow:'build.yml',branch:'main\n'},{repository:'Owner/Repo',workflow:'build.yml',label:'x'.repeat(101)}])assert.throws(()=>normalize([entry]));
 assert.throws(()=>normalize([]));assert.throws(()=>normalize(Array.from({length:max+1},(_,i)=>({repository:'Owner/Repo'+i,workflow:'123'}))));
 assert.throws(()=>normalize([entries[0],{...entries[0],repository:'owner/first'}]),/중복/);
 assert.throws(()=>step(-1,3,1));assert.throws(()=>step(0,3,0));assert.throws(()=>step(0,0,1));
});


test('bounded native record-list schema validates row shape, order and existing settings size',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const field={key:'targets',label:'저장소 목록',type:'recordList',maxItems:10,columns:[
   {key:'repository',label:'저장소',maxLength:256,default:''},
   {key:'workflow',label:'빌드 종류',maxLength:128,default:''},
   {key:'branch',label:'브랜치',maxLength:256,default:''},
   {key:'label',label:'표시 이름',maxLength:100,default:''}
 ],default:[]};
 const a={repository:'Owner/A',workflow:'build.yml',branch:'main',label:'A'},b={repository:'Owner/B',workflow:'123',branch:'',label:'B'};
 const manifest={...nativeManifest,actions:[{...nativeManifest.actions[0],settingsSchema:[field]}]};
 assert.doesNotThrow(()=>validateNativeManifest(manifest));
 assert.deepEqual(core.nativeEffectiveSettings([field],{}),{targets:[]});
 assert.deepEqual(core.nativeEffectiveSettings([field],{targets:[b,a],old:true}),{targets:[b,a],old:true});
 for(const targets of [[{...a,extra:'x'}],[{...a,branch:42}],[{...a,branch:'main\n'}],[{...a,label:'x'.repeat(101)}],Array(11).fill(a),[null],{}])assert.throws(()=>core.nativeEffectiveSettings([field],{targets}),/invalid setting/);
 for(const bad of [{...field,maxItems:11},{...field,columns:[...field.columns,field.columns[0]]},{...field,columns:[{...field.columns[0],key:'__proto__'}]},{...field,columns:[{...field.columns[0],type:'html'}]},{...field,columns:[{...field.columns[0],maxLength:257}]},{...field,default:[{}]}])assert.throws(()=>core.validateNativeSettingsSchema([bad]),/schema/);
 const large={repository:'가'.repeat(256),workflow:'가'.repeat(128),branch:'가'.repeat(256),label:'가'.repeat(100)};
 assert.throws(()=>core.nativeEffectiveSettings([field],{targets:Array(10).fill(large)}),/settings size limit/);
});

test('GitHub ordered action registers an empty draft and monitors first target and opens only the displayed link',async()=>{
 const {createGitHubManifest}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const m=validateNativeManifest(createGitHubManifest()),a=m.actions[1];
 assert.equal(m.actions[0].id,'com.deckforge.native.github-status.build');
 assert.equal(a.id,'com.deckforge.native.github-status.multi-build');
 const settings=Object.fromEntries(a.settingsSchema.map(f=>[f.key,f.default]));
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('event','settings','state','memory','api',a.script);
 const memory={},requests=[],frames=[],opened=[];
 const api={setTitle(){},drawKey(frame){frames.push(frame);},request(...args){requests.push(args);},openUrl(url){opened.push(url);}};
 const send=(type,response)=>run({type,response},settings,0,memory,api);
 await send('appear');assert.equal(memory.display.status,'설정 확인');
 await send('tick');assert.equal(requests.length,0);
 settings.targets=[{repository:'Owner/A',workflow:'42',branch:'main',label:'첫 번째'},{repository:'Owner/B',workflow:'99',branch:'',label:'두 번째'}];
 await send('settings');await send('tick');
 assert.equal(requests.length,1);assert.equal(requests[0][3].path.repo,'A');
 assert.equal(requests[0][3].path.workflow,'42');assert.equal(requests[0][2].branch,'main');
 await send('networkResult',{ok:true,body:JSON.stringify({workflow_runs:[{id:123,run_number:7,status:'completed',conclusion:'success'}]})});
 assert.equal(memory.display.number,'#7');assert.equal(memory.display.status,'빌드 성공');
 assert.ok(frames.at(-1).commands.some(x=>x.text==='첫 번째'));
 await send('press');assert.deepEqual(opened,['https://github.com/Owner/A/actions/runs/123']);
 settings.targets.push({...settings.targets[0]});await send('settings');await send('tick');
 assert.equal(memory.display.status,'설정 확인');assert.equal(requests.length,1);
});

test('GitHub multi-monitor switches in order and discards an old target response',async()=>{
 const {createGitHubManifest}=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 const a=validateNativeManifest(createGitHubManifest()).actions[1];
 const settings=Object.fromEntries(a.settingsSchema.map(f=>[f.key,f.default]));
 settings.targets=[{repository:'Owner/A',workflow:'42',branch:'main',label:'A'},{repository:'Owner/B',workflow:'99',branch:'',label:'B'}];
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('event','settings','state','memory','api',a.script);
 const memory={},requests=[],opened=[];
 const api={setTitle(){},drawKey(){},request(...args){requests.push(args);},openUrl(url){opened.push(url);}};
 const send=(type,response)=>run({type,response},settings,0,memory,api);
 const response=(id,number)=>({ok:true,body:JSON.stringify({workflow_runs:[{id,run_number:number,status:'completed',conclusion:'success'}]})});
 await send('appear');await send('tick');assert.equal(requests[0][3].path.repo,'A');
 await send('multiNext');assert.equal(memory.index,1);await send('multiPrevious');assert.equal(memory.index,0);await send('networkResult',response(111,11));assert.equal(memory.runLink,null);assert.equal(memory.display.status,'조회 준비');await send('tick');assert.equal(requests.length,2);await send('multiNext');assert.equal(memory.index,1);await send('tick');assert.equal(requests.length,2);
 await send('networkResult',response(111,11));assert.equal(memory.display.status,'조회 준비');assert.equal(memory.runLink,null);
 await send('press');assert.deepEqual(opened,[]);
 await send('tick');assert.equal(requests[2][3].path.repo,'B');
 await send('networkResult',response(222,22));await send('press');assert.deepEqual(opened,['https://github.com/Owner/B/actions/runs/222']);
 await send('multiPrevious');assert.equal(memory.index,0);await send('multiPrevious');assert.equal(memory.index,1);
 await send('settings');assert.equal(memory.index,0);assert.equal(memory.runLink,null);
});
test('GitHub multi-monitor input separates single double hold and cancels stale timers',async()=>{
 const {multiMonitorInput,clearMultiMonitorPress}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const ctx={},events=[];let live=true;
 const input=g=>multiMonitorInput(ctx,g,()=>live,e=>{events.push(e);return true;});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 input('down');input('up');await wait(350);assert.deepEqual(events,['multiNext']);
 input('down');input('up');input('down');input('up');await wait(350);assert.deepEqual(events,['multiNext','multiPrevious']);
 input('down');await wait(650);input('up');await wait(350);assert.deepEqual(events,['multiNext','multiPrevious','press']);
 input('down');input('up');clearMultiMonitorPress(ctx);await wait(350);assert.equal(events.length,3);
 input('down');live=false;await wait(650);clearMultiMonitorPress(ctx);assert.equal(events.length,3);
});

test('GitHub editor and native action share the exact target validator',()=>{
 const core=require('../app/deckforge-editor/deck-core.js');
 const plugin=require('../app/deckforge-editor/deckforge-github-plugin.cjs');
 assert.equal(plugin.normalizeGitHubMonitorTargets,core.normalizeGitHubMonitorTargets);
 assert.throws(()=>core.normalizeGitHubMonitorTargets([]),/등록/);
 assert.throws(()=>core.normalizeGitHubMonitorTargets([{repository:'Owner/A',workflow:'',branch:'',label:''}]),/빌드 종류/);
 assert.deepEqual(core.normalizeGitHubMonitorTargets([{repository:'Owner/A',workflow:'12',branch:'',label:''}]),[{repository:'Owner/A',workflow:'12',branch:'',label:'A'}]);
 const editor=require('node:fs').readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 assert.ok(editor.includes('next.targets=DeckCore.normalizeGitHubMonitorTargets(next.targets)'));
});

test('GitHub monitor disconnect invalidates pending input generation without changing other contexts',()=>{
 const {PluginRouter,multiMonitorInput}=require('../app/deckforge-editor/deckforge-native-sdk.cjs');
 const ctx={apiVersion:2,pluginUUID:'com.deckforge.native.github-status',action:{id:'com.deckforge.native.github-status.multi-build'}};
 const other={apiVersion:2,pluginUUID:'com.deckforge.native.example',action:{id:'com.deckforge.native.example.action'}};
 const router=new PluginRouter({}, {contexts:new Map([['multi',ctx],['other',other]])});
 multiMonitorInput(ctx,'down',()=>true,()=>true);
 assert.ok(ctx.multiMonitorPress);router.cancelMultiMonitorInput();
 assert.equal(ctx.multiMonitorPress,null);assert.equal(ctx.multiInputGeneration,1);assert.equal(other.multiInputGeneration,undefined);
 assert.equal(multiMonitorInput(ctx,'up',()=>true,()=>true),false);
});
