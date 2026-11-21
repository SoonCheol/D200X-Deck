'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createEvidence,assess}=require('../app/streamdeck-editor/ai/evidence.cjs');
const Core=require('../app/streamdeck-editor/deck-core.js');
const {layoutReview,createReader}=require('../app/streamdeck-editor/ai/read-tools.cjs');
const Selection=require('../app/streamdeck-editor/ai/selection.js');
const {textMenuTemplate}=require('../app/streamdeck-editor/text-context-menu.cjs');
const req=(section,extra={})=>({section,profile:null,page:null,folder:null,query:null,offset:null,...extra});
test('correlates concurrent physical packets and actual helper results without disclosing paths',()=>{
 let t=0;const e=createEvidence({clock:()=>++t});
 const a=e.receive({index:2,kind:1,state:1,pressed:true},true),b=e.receive({index:3,kind:1,state:1,pressed:true},true);
 e.append(a,{stage:'renderer',page:2,dirty:false});e.append(a,{stage:'resolved',slot:2,gesture:'down',action:'open-app'});
 e.append(a,{stage:'planned',outcome:'open-local-path'});e.append(a,{stage:'request'});e.link('helper-a',a);
 e.append(b,{stage:'request'});e.link('helper-b',b);
 e.helper({traceId:'helper-b',stage:'focus-result',result:{status:'present'},path:'DO_NOT_SEND_PATH'});
 e.append(b,{stage:'request-resolved'});
 e.helper({traceId:'helper-a',stage:'focus-result',result:{status:'focused'},error:'',spec:{target:'DO_NOT_SEND_SECRET'}});
 e.append(a,{stage:'request-resolved'});
 const [x,y]=e.list().map(assess);
 assert.equal(x.slot,3);assert.equal(x.page,2);assert.equal(x.finding,'native_focus_reported');assert.equal(y.finding,'window_present_not_focus_proof');assert.equal(y.helper.trace,'helper-b');
 assert.ok(!JSON.stringify(e.list()).includes('DO_NOT_SEND'));
});
test('no rejection invented for missing evidence, release or unsaved confirmation',()=>{
 const e=createEvidence({limit:3}),a=e.receive({index:0,pressed:true},true),b=e.receive({index:0,pressed:false},true),c=e.receive({index:13,pressed:true},true);
 e.append(a,{stage:'request'});e.append(b,{stage:'release'});e.append(c,{stage:'unsaved-block'});
 assert.deepEqual(e.list().map(assess).map(x=>x.finding),['request_pending_or_evidence_missing','input_filtered_or_deferred','unsaved_confirmation']);
 assert.equal(e.append('unknown',{stage:'request-rejected'}),false);
 e.append(a,{stage:'request-rejected'});assert.equal(assess(e.list()[0]).finding,'request_reported_failure');
 e.receive({index:1},false);assert.equal(e.has(a),false);assert.equal(assess(e.list().at(-1)).finding,'editor_unavailable');
 for(let i=0;i<40;i++)e.append(c,{stage:'renderer'});
 assert.equal(e.list().find(x=>x.id===c).events.length,18);assert.equal(e.list().find(x=>x.id===c).truncated,true);
});
test('renderer promise observation preserves return value and uses input-specific ID',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const start=source.indexOf('function reportInputEvidence('),end=source.indexOf('function tracedPhysicalDispatch(',start);
 assert.ok(start>=0&&end>start);
 const rows=[],window={deckBridge:{inputEvidence:r=>rows.push(r)}};
 const observe=new Function('window',source.slice(start,end)+'\nreturn observeInputEvidence;')(window);
 const p=Promise.resolve(true);assert.equal(observe({inputId:'a'},p,'windows-hotkey'),p);await p;
 const q=Promise.reject(new Error('private detail'));observe({inputId:'b'},q,'open-local-path');await q.catch(()=>{});
 const r=Promise.resolve(false);observe({inputId:'c'},r,'sdk');await r;
 assert.deepEqual(rows.map(x=>[x.inputId,x.stage]),[['a','request'],['a','request-resolved'],['b','request'],['b','request-rejected'],['c','request'],['c','request-false']]);
 assert.ok(!JSON.stringify(rows).includes('private detail'));
});
test('local layout review identifies gaps and exact saved duplicates without modifying state',()=>{
 const s=Core.migrateState(null);
 const a=Core.createAction('hotkey');a.settings.keys='Ctrl+C';const b=Core.createAction('hotkey');b.settings.keys='Ctrl+C';
 s.pages[0][0]=a;s.pages[0][1]=b;s.pages[0][2]=Core.createAction('hotkey');
 s.pinned[3]=Core.createAction('indicator');
 const before=JSON.stringify(s),result=layoutReview(s,req('layout_review'));
 assert.deepEqual(result.findings.find(x=>x.kind==='same_saved_action_settings').slots,[1,2]);
 assert.equal(result.findings.find(x=>x.kind==='incomplete_configuration').slot,3);
 assert.equal(result.occupied,4);assert.equal(result.emptySlots.includes(4),false);assert.equal(JSON.stringify(s),before);
});
test('read-only trace detail and version knowledge are available with bounded data',async()=>{
 const e=createEvidence(),id=e.receive({index:0,state:1},true);e.append(id,{stage:'renderer'});e.append(id,{stage:'request-rejected'});
 const inspect=createReader({root:'unused',userData:'unused',view:async()=>null,device:async()=>({}),inputs:()=>[],evidence:()=>e.list(),version:'1.1.47'})();
 const r=await inspect(req('input_trace',{query:id}));assert.equal(r.ok,true);assert.equal(r.items[0].finding,'request_reported_failure');assert.equal(r.detail.id,id);
 const k=await inspect(req('knowledge',{query:'controls'}));assert.equal(k.version,'1.1.47');assert.ok(k.items.some(x=>x.topic==='controls'));
});
test('Ctrl+A selects messages only and preserves native input selection',()=>{
 let handler,chosen,prevent=0;
 const messages={querySelector:()=>({})},range={selectNodeContents:n=>{chosen=n;}},sel={removeAllRanges(){},addRange(r){assert.equal(r,range);}};
 const doc={getElementById:id=>id==='messages'?messages:null,getSelection:()=>sel,createRange:()=>range,addEventListener:(_name,fn)=>{handler=fn;}};
 Selection.install(doc);handler({ctrlKey:true,key:'a',target:{closest:()=>false},preventDefault:()=>prevent++});assert.equal(chosen,messages);assert.equal(prevent,1);
 handler({ctrlKey:true,key:'a',target:{closest:()=>true},preventDefault:()=>prevent++});assert.equal(prevent,1);
 assert.equal(Selection.inMessages({elementFromPoint:()=>({closest:()=>messages})},1,1),true);
});
test('AI read-only context menu offers scoped select even without existing selection; ordinary fields unchanged',()=>{
 let count=0;const wc={isDestroyed:()=>false,selectAll:()=>{throw Error('must not select whole window');}};
 const menu=textMenuTemplate({mediaType:'none',isEditable:false,selectionText:'',editFlags:{}},wc,true,()=>count++);
 assert.equal(menu.find(x=>x.label==='복사').enabled,false);menu.find(x=>x.label==='전체 선택').click();assert.equal(count,1);
 assert.deepEqual(textMenuTemplate({mediaType:'none',isEditable:false,selectionText:'',editFlags:{}},wc,true),[]);
 const editable=textMenuTemplate({mediaType:'none',isEditable:true,editFlags:{canSelectAll:true}},wc);
 assert.equal(editable.find(x=>x.label==='전체 선택').enabled,true);
});

test('simulated gesture input trace includes selected action category but no secrets',async()=>{
 const e=createEvidence(),id=e.receive({index:0,kind:1,state:1,pressed:true},true);
 e.append(id,{stage:'renderer',page:1});
 e.append(id,{stage:'resolved',slot:0,gesture:'down',action:'gesture-test'});
 e.append(id,{stage:'gesture-test-input',outcome:'down'});
 e.append(id,{stage:'gesture-test-result',outcome:'double',target:'open-app',ms:180,status:'dry-run',privatePath:'secret'});
 const found=assess(e.list()[0]);
 assert.equal(found.finding,'gesture_test_double');
 assert.deepEqual(found.gestureTest,{gesture:'double',target:'open-app',elapsedMs:180,simulated:true});
 const inspect=createReader({root:'unused',userData:'unused',view:async()=>null,device:async()=>({}),
   inputs:()=>[],evidence:()=>e.list(),version:'1.1.93'})();
 const result=await inspect(req('input_trace',{query:id}));
 assert.equal(result.items[0].gestureTest.target,'open-app');
 assert.ok(!JSON.stringify(result).includes('secret'));
});
test('D200X dry-run detector distinguishes single double and hold without dispatching actions',()=>{
 const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const start=editor.indexOf('const gestureTestPresses='),end=editor.indexOf('// Generic ordinary-key gesture routing.',start);
 assert.ok(start>0&&end>start);
 const code=editor.slice(start,end);
 assert.doesNotMatch(code,/executeMultiStep|runComposite|runActionPreview|deckBridge\./);
 assert.match(editor,/resolved\.action\?\.type==='gesture-test'/);
 const timers=new Map(),observed=[],statuses=[];
 let now=0,id=0;
 const setFakeTimeout=(f,ms)=>{const key=++id;timers.set(key,{at:now+ms,fn:f});return key;};
 const advance=ms=>{
   const until=now+ms;
   while(true){
     const due=[...timers.entries()].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
     if(!due)break;
     now=due[1].at;timers.delete(due[0]);due[1].fn();
   }
   now=until;
 };
 const handle=new Function('DeckCore','state','window','Date','setTimeout','clearTimeout','reportInputEvidence','TEST_TOUCH_CHOICES',
   code+';return handleGestureTest;')(
   {runtimeActionKey:()=> 'p1-k1'}, {},
   {d200xActionStatus:s=>statuses.push(s)}, {now:()=>now},
   setFakeTimeout,id=>timers.delete(id),(event,stage,detail)=>observed.push({inputId:event.inputId,stage,...detail}),
   [['hotkey','단축키'],['open-app','프로그램 열기'],['folder-shortcut','폴더 열기']]
 );
 const action={settings:{single:'hotkey',double:'open-app',hold:'folder-shortcut',logEnabled:true}};
 handle(action,0,'down',{inputId:'s-down'},false);advance(40);
 handle(action,0,'up',{inputId:'s-up'},false);advance(300);
 handle(action,0,'down',{inputId:'d1-down'},false);advance(30);
 handle(action,0,'up',{inputId:'d1-up'},false);advance(120);
 handle(action,0,'down',{inputId:'d2-down'},false);advance(10);
 handle(action,0,'up',{inputId:'d2-up'},false);
 handle(action,0,'down',{inputId:'h-down'},false);advance(620);
 handle(action,0,'up',{inputId:'h-up'},false);
 const results=observed.filter(x=>x.stage==='gesture-test-result');
 assert.deepEqual(results.map(x=>[x.outcome,x.target,x.status,x.inputId]),[
   ['single','hotkey','dry-run','s-up'],['double','open-app','dry-run','d2-down'],
   ['hold','folder-shortcut','dry-run','h-down']]);
 assert.ok(statuses.every(x=>x.includes('실제 실행 없음')));
 action.settings.logEnabled=false;const count=observed.length;
 handle(action,0,'down',{inputId:'off-down'},false);advance(30);
 handle(action,0,'up',{inputId:'off-up'},false);advance(310);
 assert.equal(observed.length,count);
});

test('assigned ordinary key gesture evidence distinguishes a selected command from its execution result',()=>{
 const e=createEvidence(),id=e.receive({index:1,kind:1,state:1,pressed:true},true);
 e.append(id,{stage:'resolved',slot:1,gesture:'down',action:'hotkey'});
 assert.equal(e.append(id,{stage:'press-gesture',outcome:'double',action:'hotkey',ms:337}),true);
 const found=assess(e.list()[0]);
 assert.equal(found.finding,'press_binding_selected_double');
 assert.deepEqual(found.pressGesture,{gesture:'double',elapsedMs:337,action:'hotkey'});
 assert.equal(found.requests,0);assert.equal(found.settled,0);
});


test('AI one-call action check verifies Windows hotkey insertion counts and actually sent keys',async()=>{
 const e=createEvidence(),s=Core.migrateState(null),item=s.pages[0][9]=Core.createAction('hotkey');item.settings.keys='Shift+PrintScreen';
 const id=e.receive({index:9,kind:1,state:1,pressed:true},true);
 e.append(id,{stage:'renderer',page:1,profile:1,folder:false});
 e.append(id,{stage:'resolved',slot:9,gesture:'down',action:'hotkey'});
 e.append(id,{stage:'planned',outcome:'windows-hotkey'});
 e.append(id,{stage:'request',outcome:'windows-hotkey'});
 e.append(id,{stage:'windows-input',keys:'Shift+PrintScreen',status:'inserted',count:4,expected:4});
 e.append(id,{stage:'request-resolved',outcome:'windows-hotkey'});
 const read=createReader({root:'unused',userData:'unused',readState:async()=>s,view:async()=>null,device:async()=>({}),inputs:()=>[],evidence:()=>e.list()})();
 const r=await read(req('action_check'));
 assert.equal(r.found,true);assert.equal(r.slot,10);assert.equal(r.outcome,'windows-hotkey');
 assert.deepEqual(r.windowsInput,{keys:'Shift+PrintScreen',status:'inserted',inserted:4,expected:4,result:'confirmed_inserted'});
 assert.equal(r.window.result,'unverified');assert.equal(r.request.state,'returned_without_error');
 const f=e.receive({index:9,kind:1,state:1,pressed:true},true);
 e.append(f,{stage:'renderer',page:1,profile:1,folder:false});
 e.append(f,{stage:'resolved',slot:9,gesture:'down',action:'hotkey'});
 e.append(f,{stage:'planned',outcome:'windows-hotkey'});
 e.append(f,{stage:'request',outcome:'windows-hotkey'});
 e.append(f,{stage:'request-resolved',outcome:'windows-hotkey'});
 const missing=await read(req('action_check'));
 assert.equal(missing.windowsInput.result,'unverified_no_sendinput_receipt');
 assert.equal(missing.request.state,'returned_without_error');
});
test('AI one-call action check distinguishes app and folder request from native window confirmation',async()=>{
 const e=createEvidence(),s=Core.migrateState(null),item=s.pages[0][2]=Core.createAction('open-app');item.settings.app='C:/Apps/Fusion.exe';
 const add=(index,kind)=>{
   const id=e.receive({index,kind:1,state:1,pressed:true},true);
   e.append(id,{stage:'renderer',page:1,profile:1,folder:false});
   e.append(id,{stage:'resolved',slot:index,gesture:'down',action:kind});
   e.append(id,{stage:'planned',outcome:'open-local-path'});
   e.append(id,{stage:'request',outcome:'open-local-path'});
   e.append(id,{stage:'request-resolved',outcome:'open-local-path'});
   return id;
 };
 const appId=add(2,'open-app');e.link('app-helper',appId);
 e.helper({traceId:'app-helper',stage:'launch-request-result',result:{status:'launch-requested'},spec:{target:'SECRET_FULL_PATH'}});
 const reader=createReader({root:'unused',userData:'unused',readState:async()=>s,view:async()=>null,device:async()=>({}),inputs:()=>[],evidence:()=>e.list()})();
 let r=await reader(req('action_check'));assert.equal(r.request.state,'returned_without_error');assert.equal(r.window.result,'unverified');assert.equal(r.savedAction.target,'Fusion.exe');
 assert.ok(!JSON.stringify(r).includes('SECRET_FULL_PATH'));
 e.helper({traceId:'app-helper',stage:'focus-result',result:{status:'focused'}});
 r=await reader(req('action_check'));assert.equal(r.window.result,'confirmed_existing_or_opened');
 const folderId=add(3,'folder-shortcut');e.link('folder-helper',folderId);
 e.helper({traceId:'folder-helper',stage:'open-missing',error:null,result:{status:'missing'}});
 r=await reader(req('action_check'));assert.equal(r.window.result,'unverified');assert.equal(r.request.state,'returned_without_error');
 e.append(folderId,{stage:'request-rejected',outcome:'open-local-path'});
 r=await reader(req('action_check'));assert.equal(r.request.state,'failed');
});
test('verified hotkey path uses SendInput rather than keybd_event and carries physical packet ID',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/preload.cjs'),'utf8');
 const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const start=main.indexOf('async function emitVerifiedWindowsHotkey('),end=main.indexOf('function parseWindowsHotkey(',start);
 assert.ok(start>=0&&end>start);
 assert.match(main.slice(start,end),/SendInput\(/);
 assert.doesNotMatch(main.slice(start,end),/keybd_event/);
 assert.match(main,/inputId\)aiEvidence\.append\(inputId,\{stage:'windows-input'/);
 assert.match(preload,/sendHotkey: \(keys,inputId\)/);
 assert.match(editor,/sendHotkey\(outcome\.keys,event\.inputId\)/);
});
