'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../app/deckforge-editor/deck-core.js');
const editor=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
function section(start,end){const a=editor.indexOf(start),b=editor.indexOf(end,a);assert.ok(a>=0&&b>a);return editor.slice(a,b);}

test('one active action contract covers SDK registration and physical plans',()=>{
 const s=Core.migrateState(null),b=Core.controlBinding(s,16),sdk=()=>Core.createAction('sd-plugin');
 const down=b.down=sdk(),left=b.left=sdk(),held=b.holdLeft=sdk();
 const ev=n=>({kind:2,index:17,state:n});
 const check=(n,item,kind)=>{assert.equal(Core.resolveHardwareEvent(s,ev(n)).action,item);assert.equal(Core.planHardwareEvent(s,ev(n))?.outcome.kind,kind);};
 check(1,down,'sd-plugin');check(2,left,'sd-plugin');check(4,held,'sd-plugin');
 b.mode='stack';check(1,null,'stack-next');check(2,null,'page');
 b.heldEnabled=true;b.heldMode='stack';check(1,null,undefined);check(4,null,'page');
 b.heldMode='trigger';check(4,held,'sd-plugin');
 Core.automaticControl(b,true);assert.equal(b.holdLeft,held);check(4,null,'profile');
 b.heldEnabled=false;Core.automaticControl(b);b.target='volume';assert.equal(b.left,left);check(2,null,'adjust');
 Core.assignControlAction(b,'left',left);check(2,left,'sd-plugin');
 const instances=Core.sdkMountDescriptors(s);
 assert.deepEqual(instances.map(x=>x.gesture),['down','left']);
 b.heldEnabled=true;
 const after=Core.sdkMountDescriptors(s);
 assert.deepEqual(after.map(x=>x.gesture),['left']);
});
test('resolved composite uses pinned, folder and actual held rotary assignment',()=>{
 const s=Core.migrateState(null),make=()=>Core.createAction('multi');
 const pinned=s.pinned[2]=make();
 assert.equal(Core.resolveHardwareEvent(s,{kind:1,index:2,pressed:true}).action,pinned);
 const folder=s.pages[0][1]=Core.createAction('folder');folder.children=Array(14).fill(null);
 const child=folder.children[2]=make();Core.enterFolder(s,1);
 assert.equal(Core.resolveHardwareEvent(s,{kind:1,index:2,pressed:true}).action,child);
 const b=Core.controlBinding(s,16),held=b.holdLeft=make();b.down=Core.createAction('media');
 assert.equal(Core.resolveHardwareEvent(s,{kind:2,index:17,state:4}).action,held);
 assert.equal(Core.planHardwareEvent(s,{kind:2,index:17,state:4}).outcome.kind,'composite');
 assert.match(editor,/const action=resolved.action;\s*if\(!action\|\|action.type!==outcome.type\)/);
});
test('deferred legacy knob tap replays down and up, never starts an orphaned hold',()=>{
 const s=Core.migrateState(null),b=Core.controlBinding(s,16);b.holdLeft=Core.createAction('media');b.down=Core.createAction('open-app');
 let scope='a';const seen=[];
 const create=new Function('state','DeckCore','openAppHoldScope','handleWideWarningInput','reportInputEvidence','observeInputEvidence','seen',
   section('const knobPresses=new Map();','// One physical packet ID')+
   section('function executeHardwareAction(event,preview=false,skipKnobGesture=false,pressOverride=null,bypassPressBindings=false){','  const folderBackWide=')+
   'seen.push([event.state,event.pressed]);return String(event.state);};return executeHardwareAction;');
 const run=create(s,Core,()=>scope,()=>null,()=>{},()=>{},seen);
 const fire=n=>run({index:17,kind:2,state:n,pressed:n===1});
 fire(1);fire(0);assert.deepEqual(seen,[[1,true],[0,false]]);
 seen.length=0;fire(1);fire(2);fire(1);fire(0);assert.deepEqual(seen,[[4,false]]);
 seen.length=0;fire(1);scope='b';fire(0);assert.deepEqual(seen,[]);
 fire(1);b.down=Core.createAction('logic');fire(0);assert.deepEqual(seen,[]);
 b.heldEnabled=true;fire(1);fire(0);assert.deepEqual(seen,[]);
});
test('asynchronous inspector targets are checked including nested and pinned actions',()=>{
 const s=Core.migrateState(null),session={},context={};
 const fn=new Function('state','DeckCore','context', 'let inspectorSession=context.session,controlGesture="down";'+section('function inspectorTargetCurrent(session,item){','function persistInspectorChange(){')+';return inspectorTargetCurrent;');
 context.session=session;const isCurrent=fn(s,Core,context),p=s.pinned[0]=Core.createAction('file-open');s.selected=0;
 assert.ok(isCurrent(session,p));assert.equal(isCurrent({},p),false);
 const folder=s.pages[0][1]=Core.createAction('folder');folder.children=Array(14).fill(null);const parent=folder.children[0]=Core.createAction('multi');const child=Core.createAction('file-open');parent.children=[child];Core.enterFolder(s,1);s.selected=0;
 assert.ok(isCurrent(session,child));parent.children=[];assert.equal(isCurrent(session,child),false);
 Core.exitFolder(s);s.selected=16;const b=Core.controlBinding(s,16);b.down=p;assert.ok(isCurrent(session,p));b.heldEnabled=true;assert.equal(isCurrent(session,p),false);
 assert.match(editor,/if\(isAssignableAction\(id\)\)controlDrop\(index,id,gesture,false\)/);
 assert.match(editor,/binding\[targetKey\]=target.value;DeckCore.automaticControl\(binding,held\)/);
});
