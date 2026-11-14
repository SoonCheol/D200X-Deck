'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/streamdeck-editor/deck-core.js');

test('all 24 observed Stream Deck actions have independent defaults',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  assert.equal(new Set(core.ACTION_IDS).size,24);
  for(const type of core.ACTION_IDS){
    const a=core.createAction(type);
    assert.equal(a.type,type);
    assert.ok(a.settings&&typeof a.settings==='object');
    assert.equal(a.titleStyle.visible,true);
  }
  const first=core.createAction('audio-play'),second=core.createAction('audio-play');
  first.settings.volume=0;
  assert.equal(second.settings.volume,50);
});

test('separate D200X volume/mute actions preserve the original 24',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  assert.deepEqual(core.D200X_ACTION_IDS,['system-volume','system-mute','system-scroll']);
  const volume=core.createAction('system-volume');
  assert.deepEqual(core.planAction(volume,0,1),{kind:'adjust',target:'volume',direction:1,count:1});
  volume.settings.direction='down';volume.settings.step=5;
  assert.deepEqual(core.planAction(volume,0,1),{kind:'adjust',target:'volume',direction:-1,count:5});
  const mute=core.createAction('system-mute');
  assert.deepEqual(core.planAction(mute,0,1),{kind:'mute'});
  const state=core.migrateState(null);
  const knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='volume';knob.down=mute;
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,{kind:'adjust',target:'volume',direction:1});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome,{kind:'mute'});
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).down.type,'system-mute');
});

test('D200X scroll action uses shared planner for keys and rotary control',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  assert.ok(core.D200X_ACTION_IDS.includes('system-scroll'));
  const a=core.createAction('system-scroll');
  assert.deepEqual(core.planAction(a,0,1),{kind:'scroll',axis:'vertical',direction:1,count:1});
  a.settings.axis='horizontal';a.settings.direction='left';a.settings.step=5;
  assert.deepEqual(core.planAction(a,0,1),{kind:'scroll',axis:'horizontal',direction:-1,count:5});
  const state=core.migrateState(null);
  state.pages[0][0]=a;
  assert.deepEqual(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome,
    {kind:'scroll',axis:'horizontal',direction:-1,count:5});
  const knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='scroll';knob.step=2;
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,
    {kind:'scroll',axis:'vertical',direction:1,count:2});
  knob.target='scroll-x';
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome,
    {kind:'scroll',axis:'horizontal',direction:-1,count:2});
});

test('legacy state migration retains visible and physical slots, selected page and icon',()=>{
  const old={pages:[[{type:'timer',title:'내 타이머',settings:{seconds:45},
    icon:{kind:'glyph',glyph:'◴'},titleStyle:{color:'#ff0000'}}],[]],page:1,selected:15};
  const migrated=core.migrateState(old);
  assert.equal(migrated.pages.length,2);
  assert.equal(migrated.pages[0].length,19);
  assert.equal(migrated.pages[0][0].settings.seconds,45);
  assert.equal(migrated.pages[0][0].icon.glyph,'◴');
  assert.equal(migrated.pages[0][0].titleStyle.color,'#ff0000');
  assert.equal(migrated.page,1);
  assert.equal(migrated.selected,15);
});

test('malformed state and unknown actions do not poison valid slots',()=>{
  const value={pages:[[null,{type:'unknown'}, {type:'text',settings:{body:'hi'}}]],page:900,selected:-1};
  const next=core.migrateState(value);
  assert.equal(next.pages[0][0],null);
  assert.equal(next.pages[0][1],null);
  assert.equal(next.pages[0][2].settings.body,'hi');
  assert.equal(next.page,0);
  assert.equal(next.selected,null);
  assert.equal(core.migrateState({pages:'bad'}).pages.length,1);
});

test('invalid titles, style and file URI are filtered',()=>{
  const next=core.cleanAction({
    type:'hotkey',title:17,
    icon:{kind:'file',value:'file:///private/data'},
    titleStyle:{size:200,align:'diagonal',color:'red'}
  });
  assert.equal(next.title,'');
  assert.equal(next.icon,undefined);
  assert.equal(next.titleStyle.size,48);
  assert.equal(next.titleStyle.align,'bottom');
  assert.equal(next.titleStyle.color,'#ffffff');
});

test('legacy horizontal alignment migrates to title vertical overlay positions',()=>{
  assert.equal(core.createAction('timer').titleStyle.align,'bottom');
  for(const [legacy,position] of [['left','bottom'],['center','middle'],['right','top']]){
    const next=core.cleanAction({type:'timer',titleStyle:{align:legacy}});
    assert.equal(next.titleStyle.align,position);
  }
  assert.equal(core.cleanAction({type:'timer',titleStyle:{align:'top'}}).titleStyle.align,'top');
});

test('outline defaults and user selections survive legacy migration',()=>{
  const a=core.createAction('timer');
  assert.equal(a.titleStyle.outlineColor,'#000000');
  assert.equal(a.titleStyle.outlineWidth,'thin');
  const b=core.migrateState({pages:[[{type:'timer',titleStyle:{
    color:'#80aaff',outlineColor:'#123456',outlineWidth:'thick'
  }}]]});
  assert.equal(b.pages[0][0].titleStyle.outlineColor,'#123456');
  assert.equal(b.pages[0][0].titleStyle.outlineWidth,'thick');
  const bad=core.cleanAction({type:'timer',titleStyle:{outlineColor:'bad',outlineWidth:'huge'}});
  assert.equal(bad.titleStyle.outlineColor,'#000000');
  assert.equal(bad.titleStyle.outlineWidth,'thin');
});

test('hardware release and unsupported slots cannot execute actions',()=>{
  const state=core.migrateState({pages:[[
    {type:'next'},null,null,null,null,null,null,null,null,null,null,null,null,
    {type:'website',settings:{url:'https://example.org'}}
  ]]});
  assert.equal(core.resolveKeyPress(state,{kind:1,index:0,pressed:false}),null);
  assert.equal(core.resolveKeyPress(state,{kind:2,index:0,pressed:true}),null);
  assert.equal(core.resolveKeyPress(state,{kind:1,index:14,pressed:true}),null);
  assert.equal(core.resolveKeyPress(state,{kind:1,index:1,pressed:true}),null);
  assert.equal(core.resolveKeyPress(state,{kind:1,index:0,pressed:true}).action.type,'next');
  assert.equal(core.resolveKeyPress(state,{kind:1,index:13,pressed:true}).action.type,'website');
});

test('first actions navigate within available page boundaries and plan websites',()=>{
  assert.deepEqual(core.planAction(core.createAction('next'),0,3),{kind:'page',page:1});
  assert.deepEqual(core.planAction(core.createAction('next'),2,3),{kind:'page',page:2});
  assert.deepEqual(core.planAction(core.createAction('previous'),0,3),{kind:'page',page:0});
  const goto=core.createAction('goto');goto.settings.page=2;
  assert.deepEqual(core.planAction(goto,0,3),{kind:'page',page:2});
  goto.settings.page=77;
  assert.equal(core.planAction(goto,0,3).kind,'invalid');
  const site=core.createAction('website');
  site.settings.url='https://example.org/';site.settings.open='default';
  assert.deepEqual(core.planAction(site,1,3),{kind:'website',url:'https://example.org/',mode:'default'});
  assert.equal(core.planAction(core.createAction('hotkey'),1,3).kind,'unsupported');
});

test('D200X side-key report 15 and 16 map to editor slots 14 and 15',()=>{
  assert.equal(core.physicalSlot({kind:1,index:0}),0);
  assert.equal(core.physicalSlot({kind:1,index:13}),13);
  assert.equal(core.physicalSlot({kind:1,index:14}),null);
  assert.equal(core.physicalSlot({kind:1,index:15}),14);
  assert.equal(core.physicalSlot({kind:1,index:16}),15);
  assert.equal(core.physicalSlot({kind:2,index:15}),null);
  assert.equal(core.physicalSlot({kind:1,index:17}),16);
  const state=core.migrateState({pages:[Array.from({length:19},(_,i)=>
    i===14?{type:'previous'}:i===15?{type:'next'}:null)]});
  assert.equal(core.resolveKeyPress(state,{kind:1,index:15,pressed:true}).action.type,'previous');
  assert.equal(core.resolveKeyPress(state,{kind:1,index:16,pressed:true}).action.type,'next');
  assert.equal(core.resolveKeyPress(state,{kind:1,index:15,pressed:false}),null);
});

test('deleting pages preserves other pages, never deletes final page',()=>{
  const state=core.migrateState({pages:[
    [{type:'website',title:'첫째'}],
    [{type:'next',title:'둘째'}],
    [{type:'previous',title:'셋째'}]
  ],page:1,selected:4});
  assert.equal(core.deletePage(state),true);
  assert.equal(state.pages.length,2);
  assert.equal(state.page,1);
  assert.equal(state.selected,null);
  assert.equal(state.pages[0][0].title,'첫째');
  assert.equal(state.pages[1][0].title,'셋째');
  assert.equal(core.deletePage(state),true);
  assert.equal(state.page,0);
  assert.equal(core.deletePage(state),false);
  assert.equal(state.pages.length,1);
});

test('D200X knob 17..19 rotation resolves to editor slots 16..18',()=>{
  for(const [hardware,slot] of [[17,16],[18,17],[19,18]]){
    for(const kind of [1,2]){
      assert.equal(core.physicalSlot({kind,index:hardware,state:2}),slot);
      assert.equal(core.hardwareGesture({kind,index:hardware,state:2}),'left');
      assert.equal(core.hardwareGesture({kind,index:hardware,state:3}),'right');
      assert.equal(core.hardwareGesture({kind,index:hardware,state:1}),'down');
      assert.equal(core.hardwareGesture({kind,index:hardware,state:0}),'up');
    }
  }
  assert.equal(core.hardwareGesture({kind:1,index:15,state:3,pressed:false}),'up');
  assert.equal(core.physicalSlot({kind:2,index:15,state:3}),null);
});

test('knob with previous or next action turns pages both directions and presses assigned action',()=>{
  const row=Array.from({length:19},()=>null);
  row[16]={type:'previous'};row[17]={type:'next'};row[18]={type:'goto',settings:{page:2}};
  const state=core.migrateState({pages:[row,row,row],page:1});
  for(const index of [17,18]){
    assert.equal(core.planHardwareEvent(state,{kind:2,index,state:2}).outcome.page,0);
    assert.equal(core.planHardwareEvent(state,{kind:2,index,state:3}).outcome.page,2);
  }
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome.page,0);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:18,state:1}).outcome.page,2);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:19,state:1}).outcome.page,2);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:19,state:3}),null);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:0}),null);
  state.page=0;
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.page,0);
  state.page=2;
  assert.equal(core.planHardwareEvent(state,{kind:2,index:18,state:3}).outcome.page,2);
});

test('knob with unsupported action never triggers it by rotation',()=>{
  const row=Array.from({length:19},()=>null);
  row[16]={type:'website',settings:{url:'https://example.org',open:'default'}};
  const state=core.migrateState({pages:[row]});
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}),null);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}),null);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome.kind,'website');
});

test('page-rotation knob persists across pages where that knob is empty',()=>{
  const first=Array.from({length:19},()=>null);
  const middle=Array.from({length:19},()=>null);
  const last=Array.from({length:19},()=>null);
  first[16]={type:'next'};
  const state=core.migrateState({pages:[first,middle,last],page:1});
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.page,2);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.page,0);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome.page,2);
  // Explicit page binding overrides the migrated global knob settings.
  core.changeControlScope(state,16,'page');
  const local=core.controlBinding(state,16);
  local.mode='trigger';local.right=core.createAction('timer');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.kind,'unsupported');
});

test('control gesture assignments, scope and stack are persisted independently',()=>{
  const state=core.migrateState(null);
  const knob=core.controlBinding(state,16);
  knob.mode='trigger';
  knob.left=core.createAction('previous');
  knob.right=core.createAction('next');
  knob.down=core.createAction('goto');knob.down.settings.page=0;
  const left=core.planHardwareEvent(state,{kind:2,index:17,state:2});
  assert.equal(left.outcome.kind,'page');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.kind,'page');
  knob.mode='adjust';knob.target='volume';
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,
    {kind:'adjust',target:'volume',direction:1});
  knob.target='zoom';
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.target,'zoom');
  knob.mode='stack';knob.down=null;knob.stack=['page','volume','zoom'];
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome,
    {kind:'stack-next',size:3});
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2},1).outcome.target,'volume');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3},2).outcome.target,'zoom');
  state.pages.push(core.blankPage());state.controls.pages.push(Array.from({length:5},core.emptyBinding));
  assert.equal(core.changeControlScope(state,16,'page'),true);
  const local=core.controlBinding(state,16);
  local.mode='trigger';local.left=core.createAction('next');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.kind,'page');
  state.page=1;
  assert.equal(core.controlBinding(state,16).left,null);
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.controls.scopes[2],'page');
  assert.equal(core.controlBinding(restored,16).mode,'trigger');
  restored.page=0;
  assert.equal(core.controlBinding(restored,16).left.type,'next');
});

test('knob step and reverse direction persist with legacy-safe defaults',()=>{
  const state=core.migrateState({pages:[[],[],[],[],[],[]],page:2});
  const knob=core.controlBinding(state,16);
  assert.equal(knob.step,1);
  assert.equal(knob.reverseDirection,false);
  knob.mode='adjust';knob.target='page';knob.step=2;knob.reverseDirection=true;
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.page,4);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.page,0);
  knob.target='volume';
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome,
    {kind:'adjust',target:'volume',direction:1,count:2});
  const saved=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(saved,16).step,2);
  assert.equal(core.controlBinding(saved,16).reverseDirection,true);
  const bad=core.cleanBinding({mode:'adjust',step:100,reverseDirection:'yes'});
  assert.equal(bad.step,1);
  assert.equal(bad.reverseDirection,false);
});

test('physical controls do not execute an action after a release',()=>{
  const state=core.migrateState(null);
  core.controlBinding(state,14).down=core.createAction('next');
  assert.equal(core.planHardwareEvent(state,{kind:1,index:15,pressed:false}),null);
  assert.equal(core.planHardwareEvent(state,{kind:1,index:15,pressed:true}).outcome.kind,'page');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:0}),null);
});

test('stack cycles even when a previous press action is still saved',()=>{
  const state=core.migrateState(null);
  const knob=core.controlBinding(state,16);
  knob.mode='stack';knob.stack=['page','volume','zoom'];
  knob.down=core.createAction('previous');
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome,
    {kind:'stack-next',size:3});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2},1).outcome,
    {kind:'adjust',target:'volume',direction:-1});
});
