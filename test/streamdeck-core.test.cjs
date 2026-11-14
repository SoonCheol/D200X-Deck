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
