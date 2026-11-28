'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ProfileStore}=require('../app/deckforge-editor/profile-store.cjs');
const png='data:image/png;base64,'+Buffer.from('test PNG bytes').toString('base64');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-profile-'));
 try{return fn(new ProfileStore(dir),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('new install begins with empty file-backed profile and never imports localStorage',()=>{
 fixture(store=>assert.equal(store.read(),null));
});
test('image file is deduplicated outside the profile JSON and reconstructed on reload',()=>{
 fixture((store,dir)=>{
  const state={pages:[[{type:'sd-plugin',icon:{kind:'file',value:png},settings:{
    sdkStateIcons:{off:{kind:'file',value:png},on:{kind:'file',value:png}}
  }}]],other:'retained'};
  store.write(state);
  const document=fs.readFileSync(store.file,'utf8');
  assert.ok(!document.includes('data:image/png;base64'));
  assert.ok(document.includes('deckforge-icon://'));
  assert.equal(fs.readdirSync(path.join(dir,'Resources','Icons')).length,1);
  const roundtrip=store.read();
  assert.deepEqual(roundtrip,state);
  assert.equal(state.pages[0][0].icon.value,png,'in-memory state must not be modified');
 });
});
test('profile replacement retains backup and does not overwrite on invalid input',()=>{
 fixture(store=>{
  store.write({pages:[],version:1});
  store.write({pages:[],version:2});
  assert.equal(store.read().version,2);
  assert.equal(JSON.parse(fs.readFileSync(store.file+'.bak','utf8')).version,1);
  assert.throws(()=>store.write(null));
  assert.equal(store.read().version,2);
 });
});
test('missing icon files refuse to load rather than silently replacing saved profile',()=>{
 fixture((store,dir)=>{
  store.write({icon:{kind:'file',value:png}});
  const file=fs.readdirSync(path.join(dir,'Resources','Icons'))[0];
  fs.rmSync(path.join(dir,'Resources','Icons',file));
  assert.throws(()=>store.read(),/ENOENT/);
  assert.ok(fs.existsSync(store.file));
 });
});
test('non-image data URLs and other settings remain unchanged',()=>{
 fixture(store=>{
  const state={token:'secret',settings:{other:'data:text/plain;base64,SGVsbG8=',count:2}};
  store.write(state);
  assert.deepEqual(store.read(),state);
 });
});

function nativeFixture(store){
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),item=state.pages[0][0]=Core.createAction('sd-plugin');
 item.settings.pluginUUID='com.deckforge.native.test';item.settings.actionUUID='com.deckforge.native.test.key';
 item.settings.pluginSettings={count:0};state.pages[0][1]=Core.createAction('text');state.pages[0][1].title='retain';
 store.write(state);
 const cfg=Core.createSdkMountTracker().reconcile('test',Core.sdkMountDescriptors(state))[0];
 const id=require('node:crypto').randomUUID();
 return {...cfg,requestId:id,receiptId:id,expectedRevision:cfg.configRevision,expectedSettings:{count:0},
  operation:{op:'settings',value:{count:1}},expiresAt:Date.now()+60000};
}
test('native saved receipt and profile share atomic replacement and survive restart',()=>{
 fixture((store,dir)=>{
  const request=nativeFixture(store);
  assert.deepEqual(store.commitNativeSettings(request),{status:'saved'});
  const reopened=new ProfileStore(dir),state=reopened.read();
  assert.equal(reopened.nativeReceipt(request.context,request.requestId),'saved');
  assert.equal(state.pages[0][0].settings.pluginSettings.count,1);
  assert.equal(state.pages[0][1].title,'retain');
  assert.ok(!Object.hasOwn(state,'_deckforgeNativeSettingsReceiptsV1'));
  const raw=fs.readFileSync(store.file,'utf8');
  assert.deepEqual(reopened.commitNativeSettings(request),{status:'saved',duplicate:true});
  assert.equal(fs.readFileSync(store.file,'utf8'),raw,'duplicate must not write');
  assert.equal(reopened.commitNativeSettings({...request,operation:{op:'settings',value:{count:9}}}).status,'rejected');
  state.pages[0][0].settings.pluginSettings.count=2;reopened.write(state);
  assert.equal(reopened.commitNativeSettings(request).status,'rejected');
  assert.equal(new ProfileStore(dir).nativeReceipt(request.context,request.requestId),'saved');
  assert.equal(new ProfileStore(dir).read().pages[0][0].settings.pluginSettings.count,2);
 });
});
test('native settings reject expiry, replaced action and stale values before write',()=>{
 fixture(store=>{
  const request=nativeFixture(store),raw=fs.readFileSync(store.file,'utf8');
  assert.equal(store.commitNativeSettings(request,request.expiresAt+1).status,'rejected');
  assert.equal(store.commitNativeSettings({...request,expectedSettings:{count:99}}).status,'rejected');
  assert.equal(fs.readFileSync(store.file,'utf8'),raw);
  const state=store.read();state.pages[0][0].instanceId=require('node:crypto').randomUUID();store.write(state);
  assert.equal(store.commitNativeSettings(request).status,'rejected');
  assert.equal(store.nativeReceipt(request.context,request.requestId),null);
 });
});
test('profile write failure leaves both native setting and durable receipt absent',()=>{
 fixture((store,dir)=>{
  const request=nativeFixture(store);
  const rename=fs.renameSync;fs.renameSync=(from,to)=>{if(to===store.file)throw Error('simulated disk failure');return rename(from,to);};
  try{assert.throws(()=>store.commitNativeSettings(request),/simulated disk failure/);}finally{fs.renameSync=rename;}
  const reopened=new ProfileStore(dir);
  assert.equal(reopened.read().pages[0][0].settings.pluginSettings.count,0);
  assert.equal(reopened.nativeReceipt(request.context,request.requestId),null);
  assert.equal(reopened.commitNativeSettings(request).status,'saved');
 });
});

test('lost reply after atomic rename is recovered by reading, without a second write',()=>{
 fixture((store,dir)=>{
  const request=nativeFixture(store),write=store.writeDocument.bind(store);let writes=0;
  store.writeDocument=(state,receipts)=>{writes++;write(state,receipts);throw Error('reply lost after replacement');};
  assert.deepEqual(store.commitNativeSettingsChecked(request),{status:'saved',recovered:true});
  assert.equal(writes,1);
  const reopened=new ProfileStore(dir);
  assert.deepEqual(reopened.nativeSettingsOutcome(request),{status:'saved',recovered:true});
  assert.equal(reopened.read().pages[0][0].settings.pluginSettings.count,1);
  const state=reopened.read();state.pages[0][0].settings.pluginSettings.count=7;reopened.write(state);
  assert.deepEqual(reopened.nativeSettingsOutcome(request),{status:'unknown'});
 });
});
test('failed rename and intact prior state give confirmed rejection; unreadable disk gives unknown',()=>{
 fixture(store=>{
  const request=nativeFixture(store),raw=fs.readFileSync(store.file,'utf8');
  store.writeDocument=()=>{throw Error('disk full');};
  assert.deepEqual(store.commitNativeSettingsChecked(request),{status:'rejected'});
  assert.equal(fs.readFileSync(store.file,'utf8'),raw);
  fs.writeFileSync(store.file,'invalid JSON');
  assert.deepEqual(store.nativeSettingsOutcome(request),{status:'unknown'});
  assert.deepEqual(store.commitNativeSettingsChecked(request),{status:'unknown'});
 });
});

test('abrupt child exit before and after profile replacement preserves atomic setting/receipt pair',()=>{
 fixture((store,dir)=>{
  const request=nativeFixture(store);
  const {spawnSync}=require('node:child_process');
  const modulePath=require.resolve('../app/deckforge-editor/profile-store.cjs');
  const script='const fs=require("node:fs");const {ProfileStore}=require(process.argv[1]);'+
    'const store=new ProfileStore(process.argv[2]);const request=JSON.parse(process.argv[3]);'+
    'const rename=fs.renameSync;fs.renameSync=(from,to)=>{if(to!==store.file)return rename(from,to);'+
    'if(process.argv[4]==="before")process.exit(73);rename(from,to);process.exit(73);};'+
    'store.commitNativeSettings(request);process.exit(99);';
  for(const phase of ['before','after']){
   const child=spawnSync(process.execPath,['-e',script,modulePath,dir,JSON.stringify(request),phase],{encoding:'utf8',timeout:15000});
   assert.equal(child.status,73,child.stderr||String(child.error||''));
   const reopened=new ProfileStore(dir),state=reopened.read();
   assert.equal(state.pages[0][0].settings.pluginSettings.count,phase==='before'?0:1);
   assert.equal(reopened.nativeReceipt(request.context,request.requestId),phase==='before'?null:'saved');
   assert.equal(reopened.nativeSettingsOutcome(request).status,phase==='before'?'rejected':'saved');
  }
 });
});

test('pending save cannot target moved action, copied action, or a duplicate profile',()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 fixture(store=>{
  const request=nativeFixture(store),state=store.read();
  const original=state.pages[0][0];
  state.pages[0][2]=original;state.pages[0][0]=Core.cloneActionInstances(original);
  store.write(state);
  assert.equal(store.commitNativeSettings(request).status,'rejected');
  assert.equal(store.read().pages[0][2].settings.pluginSettings.count,0);
  assert.equal(store.read().pages[0][0].settings.pluginSettings.count,0);
  const copied=Core.createProfile(state,'Copy',true);
  assert.ok(copied);assert.ok(Core.switchProfile(state,copied));
  store.write(state);
  assert.equal(store.commitNativeSettings(request).status,'rejected');
  assert.equal(store.nativeReceipt(request.context,request.requestId),null);
  assert.equal(store.read().pages[0][0].settings.pluginSettings.count,0);
 });
});

test('pending native setting request cannot write a different page or a deleted slot',()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 fixture(store=>{
  const request=nativeFixture(store),state=store.read();
  state.pages.push(Core.blankPage());state.pages[1][0]=Core.cloneActionInstances(state.pages[0][0]);
  state.page=1;store.write(state);
  assert.equal(store.commitNativeSettings(request).status,'rejected');
  assert.equal(store.read().pages[1][0].settings.pluginSettings.count,0);
  state.page=0;state.pages[0][0]=null;store.write(state);
  const raw=fs.readFileSync(store.file,'utf8');
  assert.equal(store.commitNativeSettings(request).status,'rejected');
  assert.equal(fs.readFileSync(store.file,'utf8'),raw);
  assert.equal(store.nativeReceipt(request.context,request.requestId),null);
 });
});
