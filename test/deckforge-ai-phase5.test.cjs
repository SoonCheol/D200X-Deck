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
