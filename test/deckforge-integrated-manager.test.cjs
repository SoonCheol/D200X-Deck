'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const integration=require('../app/deckforge-editor/bundled-integration.cjs');

class WindowMock extends EventEmitter{
 constructor(bounds){super();this.bounds={...bounds}}
 getBounds(){return {...this.bounds}}
 setBounds(next){const moved=this.bounds.x!==next.x||this.bounds.y!==next.y;
  const resized=this.bounds.width!==next.width||this.bounds.height!==next.height;
  this.bounds={...next};if(moved)this.emit('move');if(resized)this.emit('resize')}
 isDestroyed(){return false}
}
const display={getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})};
test('magnet joins windows at DeckForge height and restores independent size',()=>{
 const deck=new WindowMock({x:470,y:50,width:980,height:850});
 const manager=new WindowMock({x:40,y:80,width:698,height:873});
 const magnet=integration.createMagnet(deck,manager,display);
 assert.equal(magnet.attach(),true);
 let a=deck.getBounds(),b=manager.getBounds();
 assert.equal(b.x,a.x+a.width-7);assert.equal(b.y,a.y);assert.equal(b.height,a.height);
 deck.setBounds({x:70,y:70,width:980,height:760});
 a=deck.getBounds();b=manager.getBounds();
 assert.equal(b.y,a.y);assert.equal(b.height,760);
 assert.equal(magnet.toggle().enabled,false);
 assert.equal(manager.getBounds().height,873);
});
test('missing default plugins are installed but existing ones are never overwritten',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-bundled-'));
 try{
  const fusion=path.join(root,'com.autodesk.fusionstreamdeck.sdPlugin');
  await fs.mkdir(fusion);await fs.writeFile(path.join(fusion,'manifest.json'),'{}');
  const archive=path.join(root,'de.perdoctus.streamdeck.homeassistant.streamDeckPlugin');
  await fs.writeFile(archive,'fake zip for mocked installation');
  const calls=[];
  const host={list:async()=>[{uuid:'com.autodesk.fusionstreamdeck'}],
    installDirectory:async()=>calls.push('fusion'),install:async()=>calls.push('ha')};
  const result=await integration.installMissingPlugins(host,root);
  assert.deepEqual(result,{fusion:'existing',ha:'installed'});
  assert.deepEqual(calls,['ha']);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('integrated installer stages both runtime components without editing saved profiles',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../.github/workflows/deckforge-windows-build.yml'),'utf8');
 const main=await fs.readFile(path.join(__dirname,'../app/deckforge-editor/main.cjs'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const manager=await fs.readFile(path.join(__dirname,'../tools/fusion-manager/main.cjs'),'utf8');
 assert.match(source,/com\.autodesk\.fusionstreamdeck\.sdPlugin/);
 assert.match(source,/de\.perdoctus\.streamdeck\.homeassistant\.streamDeckPlugin/);
 assert.match(source,/fusion-manager\/main\.cjs/);
 assert.match(main,/d200x:open-fusion-manager/);
 assert.match(main,/d200x:fusion-addin-install/);
 assert.match(ui,/FusionStreamDeck 애드인 설치/);
 assert.match(ui,/Home Assistant 사용 방법/);
 assert.match(manager,/openEmbeddedManager/);
});

const FusionSetup=require('../app/deckforge-editor/ai/fusion-setup.js');
test('local Fusion template matches explicit requests only',()=>{
 for(const text of ['Fusion 초기 연결','퓨젼 초기 연결해 주','Fusion 초기 연결해 줘','퓨전 연결해주세요'])assert.equal(FusionSetup.matches(text),true,text);
 for(const text of ['Fusion 연결 실패 원인 분석','메모장 실행','Fusion 명령 등록'])assert.equal(FusionSetup.matches(text),false,text);
 assert.equal(FusionSetup.choose([{name:'Autodesk Fusion',appId:'a'},{name:'Fusion 360',appId:'b'}]).status,'ambiguous');
});
test('Fusion template requests at most one launch then verifies health',async()=>{
 const calls=[];let health=0;
 const result=await FusionSetup.run({
 apps:async()=>[{name:'Autodesk Fusion',appId:'AutodeskInc.Fusion360'}],
 plugin:async()=>{calls.push('plugin');return 'installed'},
 addin:async()=>{calls.push('addin');return {status:'installed',startup:'enabled'}},
 health:async()=>++health>1,probe:async()=>{calls.push('probe');return 'missing'},
 launch:async()=>calls.push('launch'),sleep:async()=>{}
 });
 assert.equal(result.ready,true);assert.deepEqual(calls,['plugin','addin','probe','launch']);
 assert.match(FusionSetup.format(result),/health 응답 정상/);
});
test('Fusion template never launches existing or uncertain process and does not claim offline success',async()=>{
 for(const state of ['running-protected','running-gui','present','unavailable']){
  let launches=0;
  const result=await FusionSetup.run({apps:async()=>[{name:'Fusion 360',appId:'a'}],plugin:async()=>'existing',
   addin:async()=>({status:'existing',startup:'already-enabled'}),health:async()=>false,probe:async()=>state,
   launch:async()=>launches++,sleep:async()=>{}});
  assert.equal(launches,0);assert.equal(result.ready,false);assert.match(FusionSetup.format(result),/아직 연결 완료가 아닙니다/);
 }
});
test('Fusion template handles uninitialized AddIns folder and does not launch twice',async()=>{
 let copies=0,launches=0,health=0;
 const result=await FusionSetup.run({apps:async()=>[{name:'Fusion 360',appId:'a'}],plugin:async()=>'existing',
  addin:async()=>++copies===1?{status:'fusion-not-ready'}:{status:'installed',startup:'enabled'},
  health:async()=>++health===3,probe:async()=>'missing',launch:async()=>launches++,sleep:async()=>{}});
 assert.equal(result.ready,true);assert.equal(launches,1);assert.equal(copies,2);
});
test('Fusion add-in supports both documented roots and preserves existing manifest except explicit startup',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-fusion-setup-'));
 try{
  const appData=path.join(root,'appdata'),source=path.join(root,'FusionStreamDeck');
  const base=path.join(appData,'Autodesk','Autodesk Fusion','API','AddIns');
  await fs.mkdir(source);await fs.mkdir(base,{recursive:true});
  await fs.writeFile(path.join(source,'FusionStreamDeck.py'),'original');
  const manifest={autodeskProduct:'Fusion360',type:'addin',runOnStartup:false,author:'original'};
  await fs.writeFile(path.join(source,'FusionStreamDeck.manifest'),JSON.stringify(manifest));
  let result=await integration.installFusionAddin(root,{appData});
  assert.equal(result.status,'installed');assert.equal(result.startup,'unchanged');
  const file=path.join(base,'FusionStreamDeck','FusionStreamDeck.manifest');
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),manifest);
  result=await integration.installFusionAddin(root,{appData,configureStartup:true});
  assert.equal(result.startup,'enabled');
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{...manifest,runOnStartup:true});
  assert.equal(await fs.readFile(path.join(base,'FusionStreamDeck','FusionStreamDeck.py'),'utf8'),'original');
  await fs.mkdir(path.join(appData,'Autodesk','Autodesk Fusion 360','API','AddIns','FusionStreamDeck'),{recursive:true});
  assert.equal((await integration.installFusionAddin(root,{appData,configureStartup:true})).status,'ambiguous');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('Fusion status extension preserves original and only upgrades byte-identical installed source',async()=>{
 const {extend}=require('../app/deckforge-editor/extend-fusion-status.cjs');
 const {projectState,readFusionState}=require('../app/deckforge-editor/fusion-state-client.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-fusion-state-'));
 try{
   const original="def get_status():\n    return {\n        'activeDocument': doc.name if doc else None,\n    }\n";
   const extended=extend(original);
   assert.ok(extended.includes('ui.activeWorkspace'));assert.throws(()=>extend(extended));
   const source=path.join(root,'FusionStreamDeck','lib'),appData=path.join(root,'appdata');
   const target=path.join(appData,'Autodesk','Autodesk Fusion','API','AddIns','FusionStreamDeck','lib');
   await fs.mkdir(source,{recursive:true});await fs.mkdir(target,{recursive:true});
   await fs.writeFile(path.join(root,'fusion-actions-original.py'),original);
   await fs.writeFile(path.join(source,'fusion_actions.py'),extended);
   const file=path.join(target,'fusion_actions.py');await fs.writeFile(file,original);
   const plan=await integration.planFusionStateUpgrade(root,{appData});assert.equal(plan.status,'ready');
   assert.equal((await integration.applyFusionStateUpgrade(plan)).status,'state-upgraded');
   assert.equal(await fs.readFile(file+'.deckforge-original.bak','utf8'),original);
   assert.equal(await fs.readFile(file,'utf8'),extended);
   assert.equal((await integration.planFusionStateUpgrade(root,{appData})).status,'already-extended');
   await fs.writeFile(file,'user-modified');
   assert.equal((await integration.planFusionStateUpgrade(root,{appData})).status,'unrecognized');
   const discovery=path.join(root,'endpoint.json');await fs.writeFile(discovery,JSON.stringify({status:'running',port:12345,pid:10}));
   const raw={ok:true,activeDocument:'private name',deckforgeState:{schema:1,pid:10,workspace:'Design',tab:'Sketch',command:'Select'}};
   assert.deepEqual(projectState(raw,10),{pid:10,workspace:'Design',tab:'Sketch',command:'Select'});
   assert.equal(projectState(raw,11),null);
   assert.equal(await readFusionState(discovery,11,{health:async()=>{throw Error('must not connect');}}),null);
   assert.equal((await readFusionState(discovery,10,{health:async()=>raw})).status,'ready');
   assert.equal((await readFusionState(discovery,10,{health:async()=>({ok:true})})).status,'unavailable');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('installed and retained plugin groups share help button and management actions stay in dialog',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const retained=ui.slice(ui.indexOf('function renderRetainedSdkPlugins('),ui.indexOf('const sdkActionNames='));
 const installed=ui.slice(ui.indexOf('function renderInstalledSdkPlugins('),ui.indexOf('async function configureHomeAssistant('));
 const help=ui.slice(ui.indexOf('function openSdkPluginHelp('),ui.indexOf('function launchFusionManager('));
 assert.match(retained,/pluginHelpButton\(plugin,true\)/);
 assert.match(installed,/pluginHelpButton\(plugin\)/);
 assert.doesNotMatch(retained,/nativeRetainedPurge|restoreRetainedPlugin/);
 assert.doesNotMatch(installed,/removePluginKeepingData/);
 assert.match(help,/restoreRetainedPlugin\(plugin\)/);
 assert.match(help,/purgeRetainedPlugin\(plugin\)/);
 assert.match(help,/removePluginKeepingData\(plugin\)/);
});
