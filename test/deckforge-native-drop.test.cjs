'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=path.join(__dirname,'../app/streamdeck-editor');
const {physicalSlots,nativeDropPath}=require(path.join(root,'native-drop-host.cjs'));
const editor=fs.readFileSync(path.join(root,'editor.js'),'utf8');
test('physical slot mapping respects zoom, negative monitor origin and reserved wide key',()=>{
 const rects=[{index:0,x:10,y:20,width:30,height:40},{index:12,x:60,y:20,width:30,height:40}];
 const bounds={x:-800,y:100,width:500,height:400};
 const convert=p=>({x:p.x*2,y:p.y*2});
 assert.deepEqual(physicalSlots(rects,bounds,1.25,convert),[
  {index:0,x:-1574,y:250,width:74,height:100},{index:12,x:-1450,y:250,width:76,height:100}]);
 for(const bad of [[{...rects[0],index:13}],[{...rects[0],x:-1}],[{...rects[0],width:600}],[rects[0],rects[0]]])
  assert.deepEqual(physicalSlots(bad,bounds,1,convert),[]);
});
test('native helper resolves to physical ASAR unpacked path',()=>{
 assert.equal(nativeDropPath(path.join('resources','app.asar','streamdeck-editor')),path.join('resources','app.asar.unpacked','streamdeck-editor','native-drop-helper.exe'));
 assert.ok(JSON.parse(fs.readFileSync(path.join(root,'deckforge-installer.json'),'utf8')).asarUnpack.includes('streamdeck-editor/native-drop-helper.exe'));
});
test('external route preserves original slot, manual picker and internal drag paths',()=>{
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 assert.match(editor,/nativeSlotUnchanged\(snapshot,index\)/);
 assert.match(editor,/nativeDropWarning\?\.\(\)/);
 assert.match(editor,/choosePath\('app'\)/);
 assert.match(editor,/inspectDroppedTarget\(selected,false\)/);
 assert.match(editor,/if\(importFusionDraggedCommand\(ev,i\)\)return/);
 assert.match(editor,/getData\("application\/x-d200x-action"\)/);
 assert.match(main,/buttons:\['취소','프로그램 열기'\]/);
});
function harness(options={}){
 const calls=[],page=[null],info={kind:'file',path:'C:\\Tools\\app.exe',name:'App',icon:''},snapshot={visible:[null]};
 let unchanged=true;
 const start=editor.indexOf('async function registerDroppedApplication('),end=editor.indexOf('\nfunction renderFolderInspector',start);
 assert.ok(start>=0&&end>start);
 const ctx=vm.createContext({nativeGridBusy:false,inspectorSession:null,nativeSlotUnchanged:()=>unchanged,
   captureNativeGrid:()=>snapshot,confirm:()=>true,newAction:type=>({type,settings:{}}),
   setItem:(index,item)=>{calls.push(['set',index,item]);page[index]=item;},rasterizeIcon:async()=>null,
   window:{deckBridge:{
     inspectDroppedTarget:async(value,appId)=>{calls.push(['inspect',value,appId]);if(options.invalid&&value==='bad')throw Error('unsupported');return info;},
     nativeDropWarning:async()=>{calls.push(['warning']);return options.warning!==false;},
     choosePath:async(kind)=>{calls.push(['picker',kind]);if(options.changed)unchanged=false;return options.cancel?null:info.path;}
   },d200xActionStatus:()=>{}}});
 vm.runInContext(editor.slice(start,end),ctx);
 return {run:(value,appId=false)=>ctx.registerDroppedApplication(0,value,appId,snapshot),calls,page};
}
test('native success and manual picker use existing action registration, cancellation does not write',async()=>{
 const direct=harness();await direct.run('id',true);assert.equal(direct.calls[0][0],'inspect');assert.equal(direct.calls[0][2],true);assert.equal(direct.page[0].settings.app,'C:\\Tools\\app.exe');assert.equal(direct.calls.length,2);
 const manual=harness({invalid:true});await manual.run('bad');assert.deepEqual(manual.calls.map(x=>x[0]),['inspect','warning','picker','inspect','set']);
 for(const options of [{warning:false},{cancel:true},{changed:true}]){
   const h=harness(options);await h.run(null);assert.equal(h.page[0],null);
   assert.ok(!h.calls.some(c=>c[0]==='set'||c[0]==='inspect'));
 }
});
test('packaged native helper launches and passes its real Windows smoke test',{skip:process.platform!=='win32'||!process.env.DECKFORGE_TEST_HELPER_DIR},()=>{
 const exe=nativeDropPath(process.env.DECKFORGE_TEST_HELPER_DIR);
 assert.ok(fs.existsSync(exe));
 require('node:child_process').execFileSync(exe,['--self-test'],{windowsHide:true,timeout:30000});
});
