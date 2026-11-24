'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const DeckCore=require('../app/streamdeck-editor/deck-core.js');
const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const start=source.indexOf('function sdkItemAtLocation(source,slot,gesture){');
const end=source.indexOf('function persistInspectorChange(){',start);
assert.ok(start>=0&&end>start,'SDK committed snapshot functions found');
const script=source.slice(start,end);
function plugin(){
 const item=DeckCore.createAction('sd-plugin');
 item.settings.pluginUUID='example.plugin';item.settings.actionUUID='example.action';
 item.settings.pluginSettings={value:'before'};return item;
}
function run(mode='key',fail=false){
 const state=DeckCore.migrateState(null),slot=mode==='knob'?16:mode==='pinned'?1:mode==='folder'?2:0;
 const old=plugin();
 if(mode==='knob')DeckCore.controlBinding(state,slot).holdLeft=old;
 else if(mode==='pinned')state.pinned[slot]=old;
 else if(mode==='folder'){
  const folder=DeckCore.createAction('folder');folder.children[slot]=old;
  state.pages[0][0]=folder;state.folderPath=[0];
 }
 else state.pages[0][slot]=old;
 state.selected=0;
 const snapshot=JSON.stringify(state);
 const item=mode==='knob'?DeckCore.controlBinding(state,slot).holdLeft:
   DeckCore.visibleActions(state)[slot];
 item.title='UNSAVED TITLE';
 const writes=[];
 const inspectorSession={snapshot,dirty:true};
 const instance={slot,gesture:mode==='knob'?'hold-left':'down',instanceId:item.instanceId,pluginUUID:'example.plugin',actionUUID:'example.action'};
 const window={deckBridge:{writeProfile:confirmed=>{
   if(fail)return {ok:false,error:'full'};
   writes.push(JSON.parse(JSON.stringify(confirmed)));
   return {ok:true};
 }},scheduleDeckSync:()=>{}};
 const context={state,DeckCore,inspectorSession,window,profileStorageFailure:false,
   clone:value=>JSON.parse(JSON.stringify(value)),JSON,localStorage:{setItem:()=>assert.fail('must not use localStorage')},
   STORAGE_KEY:'test',renderGrid:()=>{},updateInspectorSaveButtons:()=>{},
   console:{error:()=>{}}};
 const ok=vm.runInNewContext(script+';commitExternalSdkSettings(instance,{value:"confirmed"})',{...context,instance});
 return {ok,inspectorSession,item,writes,slot,mode};
}
for(const mode of ['key','pinned','folder','knob']){
 test('SDK Property Inspector commits only settings for '+mode,()=>{
  const result=run(mode);
  assert.equal(result.ok,true);
  assert.equal(result.writes.length,1);
  const saved=result.writes[0];
  const persisted=result.mode==='knob'?DeckCore.controlBinding(saved,result.slot).holdLeft:
    DeckCore.visibleActions(saved)[result.slot];
  assert.equal(persisted.settings.pluginSettings.value,'confirmed');
  assert.notEqual(persisted.title,'UNSAVED TITLE');
  assert.equal(result.item.title,'UNSAVED TITLE');
  assert.equal(result.item.settings.pluginSettings.value,'confirmed');
  assert.equal(result.inspectorSession.dirty,true);
  const snapshot=JSON.parse(result.inspectorSession.snapshot);
  const stored=result.mode==='knob'?DeckCore.controlBinding(snapshot,result.slot).holdLeft:
    DeckCore.visibleActions(snapshot)[result.slot];
  assert.equal(stored.settings.pluginSettings.value,'confirmed','cancel must preserve externally committed settings');
 });
}
test('SDK save failure preserves snapshot and does not corrupt live settings',()=>{
 const r=run('key',true);
 assert.equal(r.ok,false);
 assert.equal(r.writes.length,0);
 assert.equal(r.item.settings.pluginSettings.value,'before');
 assert.equal(JSON.parse(r.inspectorSession.snapshot).pages[0][0].settings.pluginSettings.value,'before');
});
test('Electron input dialogs replace prompt and are ignored by inspector leave guard',()=>{
 assert.doesNotMatch(source,/(^|[^A-Za-z.])prompt\(/m);
 assert.match(source,/function askDeckForgeText\(/);
 assert.match(source,/function chooseDeckForgeEntity\(/);
 assert.match(source,/if\(event\.target\.closest\('[^']*\.deckforge-input-dialog'\)\)return;/);
 assert.match(source,/const rootItem=state\.selected===null\?null:state\.selected>=14\?null:DeckCore\.visibleActions\(state\)\[state\.selected\]/);
 assert.match(source,/const item=pressIsOrdinary\(rootItem\)&&state\.selected<13\?\s*pressSlotAction\(rootItem,activePressTab\):rootItem;/);
});

test('text dialog identifies whitespace-only values and resets validation while typing',()=>{
 assert.match(source,/input\.setCustomValidity\('값을 입력하세요\.'\);input\.reportValidity\(\)/);
 assert.match(source,/input\.addEventListener\('input',\(\)=>input\.setCustomValidity\(''\)\)/);
});
test('profile read failure is reported during startup and write lock remains',()=>{
 assert.match(source,/profileStorageError=String\(error\?\.message\|\|error\)/);
 assert.match(source,/if\(profileStorageFailure\)\{\s*const dialog=document\.createElement\('dialog'\)/);
 assert.match(source,/dialog\.showModal\(\);\s*window\.d200xActionStatus\?\.\('프로필 파일 읽기 실패: 저장 차단'\)/);
 assert.match(source,/if\(profileStorageFailure\)throw Error\('프로필 파일 읽기 실패 상태에서는 덮어쓰지 않습니다\.'\)/);
});

test('successful inspector save publishes SDK configuration; failed save does not',()=>{
 const code=source.slice(source.indexOf('function saveInspector(){'),source.indexOf('function discardInspector(){'));
 for(const success of [true,false]){
  const session={dirty:true},calls=[];
  const ctx={inspectorSession:session,persist:()=>success,commitPendingAudioVolumes:()=>{},beginInspectorSession:()=>{},updateInspectorSaveButtons:()=>{},scheduleSdkSync:()=>calls.push('sync')};
  vm.runInNewContext(code+';saveInspector();',ctx);
  assert.equal(calls.length,success?1:0);
  if(!success)assert.equal(ctx.inspectorSession,session);
 }
});

test('native receipt path does not fall back to an ordinary profile write on uncertain outcome',()=>{
 for(const status of ['saved','rejected','unknown']){
  const state=DeckCore.migrateState(null),item=state.pages[0][0]=plugin(),session={snapshot:JSON.stringify(state),dirty:false};
  const instance={slot:0,gesture:'down',instanceId:item.instanceId,pluginUUID:item.settings.pluginUUID,actionUUID:item.settings.actionUUID};
  const request={context:'test-context',requestId:'test-id'};let calls=0;
  const ctx={state,DeckCore,instance,request,inspectorSession:session,profileStorageFailure:false,
   clone:v=>JSON.parse(JSON.stringify(v)),window:{deckBridge:{writeProfile:()=>assert.fail('must not bypass durable receipt'),
    commitNativeSettings:(context,id)=>{assert.equal(context,request.context);assert.equal(id,request.requestId);calls++;return {status};}}},
   renderGrid(){},updateInspectorSaveButtons(){},console};
  const result=vm.runInNewContext(script+';commitExternalSdkSettings(instance,{value:"after"},request)',ctx);
  assert.equal(result,status==='saved'?true:status==='rejected'?false:null);assert.equal(calls,1);
  assert.equal(item.settings.pluginSettings.value,status==='saved'?'after':'before');
  assert.equal(ctx.profileStorageFailure,status==='unknown');
 }
});

test('lost native IPC response is reconciled by a read and never repeats the commit',()=>{
 const state=DeckCore.migrateState(null),item=state.pages[0][0]=plugin(),session={snapshot:JSON.stringify(state),dirty:false};
 const instance={slot:0,gesture:'down',instanceId:item.instanceId,pluginUUID:item.settings.pluginUUID,actionUUID:item.settings.actionUUID};
 let writes=0,reads=0;
 const ctx={state,DeckCore,instance,inspectorSession:session,profileStorageFailure:false,clone:v=>JSON.parse(JSON.stringify(v)),
  window:{deckBridge:{commitNativeSettings:()=>{writes++;throw Error('reply lost');},nativeSettingsOutcome:()=>{reads++;return {status:'saved',recovered:true};},
    writeProfile:()=>assert.fail('must not overwrite')}},renderGrid(){},updateInspectorSaveButtons(){},console};
 assert.equal(vm.runInNewContext(script+';commitExternalSdkSettings(instance,{value:"after"},{context:"ctx",requestId:"id"})',ctx),true);
 assert.equal(writes,1);assert.equal(reads,1);assert.equal(item.settings.pluginSettings.value,'after');assert.equal(ctx.profileStorageFailure,false);
});
