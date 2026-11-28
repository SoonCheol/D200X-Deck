'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Core=require('../app/deckforge-editor/deck-core.js');
const Plan=require('../app/deckforge-editor/ai/edit-plan.js');
const {chat}=require('../app/deckforge-editor/ai/responses.cjs');
const op=(type,extra={})=>({op:type,page:null,slot:null,toPage:null,toSlot:null,type:null,value:null,title:null,iconPack:null,iconName:null,size:null,color:null,bold:null,font:null,...extra});
const req=(...operations)=>({operations});
const fixture=()=>{const s=Core.migrateState(null);s.pages[0][0]=Core.createAction('hotkey');s.pages[0][0].settings.keys='Ctrl+A';s.pages[0][0].title='Select all';s.pages[0][3]=Core.createAction('sd-plugin');s.pinned[4]=Core.createAction('indicator');return s;};
test('plan leaves live state untouched, preserves SDK identities and respects pinned/reserved slots',()=>{
  const s=fixture(),before=JSON.stringify(s),plugin=s.pages[0][3];
  const p=Plan.makePlan(s,req(op('put',{slot:2,type:'hotkey',value:'Ctrl+C',title:'Copy',size:16,font:'Segoe UI'})));
  assert.equal(JSON.stringify(s),before);assert.equal(p.next.pages[0][1].settings.keys,'Ctrl+C');assert.equal(p.next.pages[0][1].titleStyle.family,'Segoe UI');
  assert.equal(p.next.pages[0][3],plugin);assert.equal(p.next.pinned,s.pinned);assert.equal(p.next.controls,s.controls);
  assert.throws(()=>Plan.makePlan(s,req(op('delete',{slot:4}))),/보호/);
  assert.throws(()=>Plan.makePlan(s,req(op('copy',{slot:4,toSlot:2}))),/보호/);
  assert.throws(()=>Plan.makePlan(s,req(op('move',{slot:4,toSlot:2}))),/보호/);
  assert.equal(s.pages[0][3].instanceId,plugin.instanceId);
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:5,type:'hotkey',value:'Ctrl+C'}))),/고정/);
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:1,type:'hotkey',value:'Ctrl+C'}))),/비어/);
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:14,type:'hotkey',value:'Ctrl+C'}))),/번호/);
});
test('append, copy, move, update, delete are isolated and page controls stay aligned',()=>{
  const s=fixture(),before=JSON.stringify(s);
  const p=Plan.makePlan(s,req(op('add_page'),op('copy',{slot:1,toPage:2,toSlot:2}),op('move',{slot:1,toPage:2,toSlot:3})));
  assert.equal(JSON.stringify(s),before);assert.equal(p.next.pages.length,2);assert.equal(p.next.controls.pages.length,2);
  assert.equal(p.next.pages[0][0],null);assert.equal(p.next.pages[1][1].settings.keys,'Ctrl+A');assert.equal(p.next.pages[1][2].title,'Select all');
  const edit=Plan.makePlan(p.next,req(op('update',{page:2,slot:2,value:'Ctrl+B',color:'#ffee00',bold:true}),op('delete',{page:2,slot:3})));
  assert.equal(edit.next.pages[1][1].settings.keys,'Ctrl+B');assert.equal(edit.next.pages[1][2],null);assert.equal(p.next.pages[1][1].settings.keys,'Ctrl+A');
});
test('strict operation schema rejects arbitrary code and unresolved target or icon',()=>{
  const s=fixture();
  assert.throws(()=>Plan.validate(req({...op('put',{slot:2,type:'hotkey',value:'Ctrl+C'}),command:'bad'})));
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:2,type:'hotkey',value:'this is not a key'}))));
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:2,type:'open-app',value:'fake.exe'}))),/확인/);
  assert.throws(()=>Plan.makePlan(s,req(op('put',{slot:2,type:'hotkey',value:'Ctrl+C',iconName:'missing'}))),/아이콘/);
  assert.throws(()=>Plan.makePlan(s,req(op('update',{slot:1,title:'one'}),op('update',{slot:1,title:'two'}))),/나눠/);
  const target={type:'open-app',requested:'Test.App',path:'shell:AppsFolder\\Test.App',name:'Test app'};
  const p=Plan.makePlan(s,req(op('put',{slot:2,type:'open-app',value:'Test.App'})),[{target}]);
  assert.equal(p.next.pages[0][1].settings.app,target.path);assert.equal(p.next.pages[0][1].settings.hold,'none');assert.equal(p.next.pages[0][1].settings.args,'');
});
function editorFixture(){
  const source=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
  const start=source.indexOf(' let aiEditCapture=null,aiEditUndo=null;');
  const end=source.indexOf('\nlet refreshProfilesMenu=',start);
  assert.ok(start>=0&&end>start);
  const context={ACTIONS:new Map([['hotkey',{label:'단축키'}]]),sdkActionNames:new Map(),state:fixture(),profileStorageFailure:false,inspectorEditing:false,inspectorSession:null,nativeGridBusy:false,nativeGridDrag:null,openAppHoldTimers:new Map(),document:{querySelector:()=>null},writes:0,syncs:0,failSave:false,render:()=>{},console};
  context.window={DeckForgeAiPlan:Plan,deckBridge:{writeProfile:()=>{context.writes++;return {ok:!context.failSave};}},scheduleDeckSync:()=>{context.syncs++;}};
  vm.runInNewContext(source.slice(start,end),context);
  return {c:context,api:context.window.DeckForgeAiEdit};
}
test('renderer preview/cancel and stale refusal do not save; apply and undo each save exactly once',async()=>{
  const {c,api}=editorFixture(),input=req(op('put',{slot:2,type:'hotkey',value:'Ctrl+C'}));
  api.capture('a');await api.prepare({id:'a',input,targets:[]});assert.equal(c.writes,0);assert.equal(c.state.pages[0][1],null);
  api.discard('a');assert.throws(()=>api.apply('a'));assert.equal(c.writes,0);
  api.capture('b');await api.prepare({id:'b',input,targets:[]});c.state.selected=3;
  assert.throws(()=>api.apply('b'),/달라졌/);assert.equal(c.writes,0);
  api.capture('c');await api.prepare({id:'c',input,targets:[]});const receipt=api.apply('c');
  assert.equal(receipt.saved,true);assert.equal(receipt.rows.length,1);assert.equal(receipt.rows[0].action,'단축키');assert.equal(receipt.rows[0].title,'Ctrl+C');assert.equal(receipt.rows[0].page,1);assert.equal(receipt.rows[0].slot,2);
  assert.equal(c.writes,1);assert.equal(c.syncs,1);assert.equal(c.state.pages[0][1].settings.keys,'Ctrl+C');
  api.undo('c');assert.equal(c.writes,2);assert.equal(c.syncs,2);assert.equal(c.state.pages[0][1],null);
  assert.throws(()=>api.undo('c'));
});
test('renderer rejects dirty state, storage failure and stale undo without overwriting',async()=>{
  const {c,api}=editorFixture(),input=req(op('put',{slot:2,type:'hotkey',value:'Ctrl+C'}));
  c.inspectorSession={dirty:true};assert.throws(()=>api.capture('a'),/미저장/);c.inspectorSession=null;
  api.capture('a');await api.prepare({id:'a',input,targets:[]});c.failSave=true;assert.throws(()=>api.apply('a'),/저장 실패/);assert.equal(c.state.pages[0][1],null);assert.equal(c.syncs,0);
  c.failSave=false;api.capture('b');await api.prepare({id:'b',input,targets:[]});api.apply('b');
  const before=c.writes;c.state.pages[0][0].title='manual edit';assert.throws(()=>api.undo('b'),/달라졌/);assert.equal(c.writes,before);
});
const events=(...items)=>new Response(items.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''),{status:200});
const completed=output=>({type:'response.completed',response:{status:'completed',output}});
const call=(id,name,args)=>({type:'function_call',namespace:'deckforge',name,call_id:id,arguments:JSON.stringify(args)});
const args={token:'mock',model:'mock',messages:[{role:'user',content:'test'}],version:'1.1.45'};
test('API edit mode exposes only proposal, never apply; proposal once and only opt-in',async()=>{
  let count=0,requests=0;const input=req(op('put',{slot:2,type:'hotkey',value:'Ctrl+C'}));
  const propose=async()=>{count++;return {ok:true,applied:false,previewReady:true};};
  await assert.rejects(chat({...args,readOnly:true,propose,fetcher:async()=>events(completed([call('1','propose_edit',input)]))}),/허용되지 않은/);
  assert.equal(count,0);
  const result=await chat({...args,readOnly:true,editMode:true,propose,fetcher:async(_u,o)=>{
    const data=JSON.parse(o.body);assert.deepEqual(data.tools[0].tools.map(t=>t.name),['get_version','inspect','propose_edit','propose_advanced']);
    if(++requests===1)return events(completed([call('1','propose_edit',input)]));
    return events({type:'response.output_text.delta',delta:'preview'},completed([]));
  }});
  assert.equal(result.requests,2);assert.equal(count,1);
  await assert.rejects(chat({...args,readOnly:true,editMode:true,propose,fetcher:async()=>events(completed([call('2','applyEdit',{})]))}),/허용되지 않은/);
  assert.equal(count,1);
  await assert.rejects(chat({...args,readOnly:true,editMode:true,propose,fetcher:async()=>events(completed([call('3','propose_edit',input),call('4','propose_edit',input)]))}),/한 개/);
  assert.equal(count,1);
});
