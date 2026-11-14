'use strict';
// GitHub-first, hardware-free D200X execution-plan checks.
// No app source, user profiles, HID, or Windows state are changed by these tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/streamdeck-editor/deck-core.js');

const side=(index,pressed=true)=>({kind:1,index,pressed});
const knob=(index,state)=>({kind:2,index,state});
const make=(count=4)=>core.migrateState({pages:Array.from({length:count},()=>[])});

test('physical buttons 15/16 plan independent previous/next presses and ignore releases',()=>{
  const s=make();s.page=1;
  core.controlBinding(s,14).down=core.createAction('previous');
  core.controlBinding(s,15).down=core.createAction('next');
  assert.equal(core.planHardwareEvent(s,side(15)).outcome.page,0);
  assert.equal(core.planHardwareEvent(s,side(16)).outcome.page,2);
  assert.equal(core.planHardwareEvent(s,side(15,false)),null);
  assert.equal(core.planHardwareEvent(s,side(16,false)),null);
});

test('all three knobs distinguish left, right, press and release',()=>{
  const s=make();s.page=1;
  for(const slot of [16,17,18]){
    const b=core.controlBinding(s,slot);
    b.mode='trigger';b.left=core.createAction('previous');b.right=core.createAction('next');b.down=core.createAction('goto');b.down.settings.page=3;
    assert.equal(core.planHardwareEvent(s,knob(slot+1,2)).outcome.page,0);
    assert.equal(core.planHardwareEvent(s,knob(slot+1,3)).outcome.page,2);
    assert.equal(core.planHardwareEvent(s,knob(slot+1,1)).outcome.page,3);
    assert.equal(core.planHardwareEvent(s,knob(slot+1,0)),null);
  }
});

test('rotary steps 1/2/5/10 and inversion affect page limits and Windows adjust counts',()=>{
  const s=make(25);s.page=12;
  const b=core.controlBinding(s,16);
  b.mode='adjust';b.target='page';
  for(const step of [1,2,5,10]){
    b.step=step;b.reverseDirection=false;
    assert.equal(core.planHardwareEvent(s,knob(17,3)).outcome.page,12+step);
    b.reverseDirection=true;
    assert.equal(core.planHardwareEvent(s,knob(17,3)).outcome.page,12-step);
    b.target='volume';
    assert.deepEqual(core.planHardwareEvent(s,knob(17,2)).outcome,
      {kind:'adjust',target:'volume',direction:1,...(step===1?{}:{count:step})});
    b.target='page';
  }
  s.page=0;b.step=10;b.reverseDirection=false;
  assert.equal(core.planHardwareEvent(s,knob(17,2)).outcome.page,0);
});

test('stack knob cycles target in planner and persists validated settings',()=>{
  const s=make();const b=core.controlBinding(s,18);
  b.mode='stack';b.stack=['page','volume','zoom'];b.step=5;b.reverseDirection=true;
  assert.deepEqual(core.planHardwareEvent(s,knob(19,1)).outcome,{kind:'stack-next',size:3});
  assert.deepEqual(core.planHardwareEvent(s,knob(19,3),1).outcome,
    {kind:'adjust',target:'volume',direction:-1,count:5});
  assert.deepEqual(core.planHardwareEvent(s,knob(19,2),2).outcome,
    {kind:'adjust',target:'zoom',direction:1,count:5});
  const roundtrip=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(core.controlBinding(roundtrip,18).step,5);
  assert.equal(core.controlBinding(roundtrip,18).reverseDirection,true);
});

test('explicit page-scoped bindings remain independent after serialize/restore',()=>{
  const s=make(3);s.controls.scopes[0]='page';
  s.controls.pages[0][0].down=core.createAction('next');
  s.controls.pages[1][0].down=core.createAction('previous');
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  restored.page=0;
  assert.equal(core.planHardwareEvent(restored,side(15)).outcome.page,1);
  restored.page=1;
  assert.equal(core.planHardwareEvent(restored,side(15)).outcome.page,0);
});

test('REGRESSION C1: legacy DIFFERENT page-specific physical bindings must survive migration',()=>{
  const first=Array.from({length:19},()=>null);
  const second=Array.from({length:19},()=>null);
  first[14]={type:'next'};second[14]={type:'previous'};
  const s=core.migrateState({pages:[first,second],page:0});
  assert.equal(core.planHardwareEvent(s,side(15)).outcome.page,1);
  s.page=1;
  // Known Codex-reported defect: legacy page-specific assignment is hidden by global scope.
  assert.equal(core.planHardwareEvent(s,side(15)).outcome.page,0,
    'legacy second-page previous action must not become global next');
});

test('existing 24 built-in action IDs retained, not falsely reported as executable',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  assert.equal(new Set(core.ACTION_IDS).size,24);
  assert.equal(core.planAction(core.createAction('hotkey'),0,3).kind,'unsupported');
  assert.equal(core.planAction(core.createAction('media'),0,3).kind,'unsupported');
});
