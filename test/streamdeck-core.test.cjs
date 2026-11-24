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
  assert.deepEqual(core.D200X_ACTION_IDS,['system-volume','system-mute','system-scroll','edit-history','window-switch','desktop-switch','device-brightness','system-zoom',
    'screenshot','clipboard-edit','window-state','window-monitor','explorer-open','brush-size','timeline-step','timeline-zoom','file-open','folder-shortcut','terminal','terminal-admin','gesture-test']);
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

test('edit-history shares planner for buttons and knob rotation',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  const action=core.createAction('edit-history');
  assert.deepEqual(core.planAction(action,0,1),{kind:'edit-history',operation:'undo',count:1});
  action.settings.operation='redo';action.settings.step=5;
  assert.deepEqual(core.planAction(action,0,1),{kind:'edit-history',operation:'redo',count:5});
  const state=core.migrateState(null);
  state.pages[0][0]=action;
  assert.deepEqual(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome,
    {kind:'edit-history',operation:'redo',count:5});
  const knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='history';knob.step=2;
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome,
    {kind:'edit-history',operation:'undo',count:2});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,
    {kind:'edit-history',operation:'redo',count:2});
  knob.reverseDirection=true;
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.operation,'redo');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).target,'history');
});

test('window/desktop switching uses shared button and knob planner',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  const state=core.migrateState(null);
  for(const [type,target] of [['window-switch','window'],['desktop-switch','desktop']]){
    const action=core.createAction(type);
    assert.deepEqual(core.planAction(action,0,1),{kind:'windows-switch',target,direction:1,count:1});
    action.settings.direction='previous';
    state.pages[0][0]=action;
    assert.deepEqual(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome,
      {kind:'windows-switch',target,direction:-1,count:1});
    const knob=core.controlBinding(state,16);
    knob.mode='adjust';knob.target=target;knob.step=2;
    assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,
      {kind:'windows-switch',target,direction:1,count:2});
    knob.reverseDirection=true;
    assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.direction,1);
    knob.reverseDirection=false;
  }
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).target,'desktop');
});

test('composite model preserves legacy children, Delay, and unrelated page data',()=>{
  const legacy={
    pages:[[
      {type:'multi',title:'작업 묶음',children:[
        {type:'hotkey',settings:{keys:'Ctrl+A'}},
        {kind:'delay',ms:1200},
        {type:'media',settings:{op:'playpause'}}
      ]},
      {type:'folder',title:'기존 폴더',children:[{type:'website',settings:{url:'https://example.org'}}]},
      {type:'profile',settings:{profile:'next'}}
    ]],page:0
  };
  const state=core.migrateState(legacy);
  assert.deepEqual(state.pages[0][0].children[1],{kind:'delay',ms:1200});
  assert.equal(state.pages[0][1].children[0].type,'website');
  assert.equal(state.pages[0][2].settings.profile,'next');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.pages[0][0].children,state.pages[0][0].children);
  const planned=core.planComposite(restored.pages[0][0]);
  assert.equal(planned.kind,'composite');
  assert.deepEqual(planned.steps.map(x=>x.kind||x.type),['hotkey','delay','media']);
});

test('multi switch has independent states and legacy steps are retained',()=>{
  const sw=core.cleanAction({type:'multi-switch',children:[{type:'timer'}],sequences:[
    [{type:'hotkey',settings:{keys:'Ctrl+C'}}],
    [{type:'media',settings:{op:'next'}},{kind:'delay',ms:50}]
  ]});
  const model=core.compositeModel(sw);
  assert.deepEqual(model.states.map(x=>x.length),[1,2]);
  assert.equal(sw.children[0].type,'timer');
  assert.equal(core.planComposite(sw,{state:0}).steps[0].type,'hotkey');
  assert.equal(core.planComposite(sw,{state:1}).steps[0].type,'media');
  const legacy=core.cleanAction({type:'multi-switch',children:[{type:'hotkey'}]});
  assert.equal(core.planComposite(legacy,{state:0}).steps[0].type,'hotkey');
  assert.deepEqual(core.planComposite(legacy,{state:1}).steps,[]);
});

test('random and Key Logic use independent paths without invented physical events',()=>{
  const random=core.cleanAction({type:'random',children:[{type:'hotkey'},{type:'media'}]});
  assert.equal(core.planComposite(random,{random:0}).steps[0].type,'hotkey');
  assert.equal(core.planComposite(random,{random:0.999}).steps[0].type,'media');
  assert.equal(core.planComposite(random).kind,'invalid');
  assert.equal(core.planComposite(core.createAction('random'),{random:0.5}).kind,'invalid');
  const logic=core.cleanAction({type:'logic',slots:{
    single:{type:'hotkey'},double:{type:'media'},hold:{type:'timer'}
  }});
  assert.equal(core.planComposite(logic,{gesture:'double'}).steps[0].type,'media');
  assert.equal(core.planComposite(logic,{gesture:'hold'}).steps[0].type,'timer');
  assert.equal(core.planComposite(logic,{gesture:'down'}).kind,'invalid');
});

test('nested composite actions are rejected without silently removing saved data',()=>{
  const action=core.cleanAction({type:'multi',children:[{type:'multi',children:[{type:'media'}]}]});
  assert.equal(action.children[0].children[0].type,'media');
  assert.equal(core.planComposite(action).kind,'invalid');
  assert.equal(core.ACTION_IDS.length,24);
});

test('multi runner awaits each action, delay, and ordered completion',async()=>{
  const multi=core.cleanAction({type:'multi',children:[
    {type:'hotkey',settings:{keys:'Ctrl+A'}},{kind:'delay',ms:25},
    {type:'media',settings:{op:'playpause'}}
  ]});
  const sequence=[];
  const count=await core.runComposite(multi,{
    execute:async action=>{sequence.push(action.type+':start');await Promise.resolve();sequence.push(action.type+':done');},
    wait:async ms=>{sequence.push('delay:'+ms);}
  });
  assert.equal(count,3);
  assert.deepEqual(sequence,['hotkey:start','hotkey:done','delay:25','media:start','media:done']);
});

test('Multi Switch active state and visual overrides survive save and migration',()=>{
  const source=core.cleanAction({
    type:'multi-switch',title:'공통',icon:{kind:'glyph',glyph:'A'},
    settings:{activeState:1},
    stateVisuals:[
      {title:'켜기',icon:{kind:'glyph',glyph:'▶'}},
      {title:'끄기',icon:{kind:'glyph',glyph:'■'}}
    ],
    sequences:[[{type:'media'}],[{type:'hotkey'}]]
  });
  assert.equal(core.displaySwitchAction(source).title,'끄기');
  assert.equal(core.displaySwitchAction(source).icon.glyph,'■');
  const profile=core.migrateState({pages:[[source]]});
  const restored=core.migrateState(JSON.parse(JSON.stringify(profile)));
  assert.equal(restored.pages[0][0].settings.activeState,1);
  assert.equal(core.displaySwitchAction(restored.pages[0][0]).title,'끄기');
  assert.equal(core.planComposite(restored.pages[0][0],{state:1}).steps[0].type,'hotkey');
  restored.pages[0][0].settings.activeState=0;
  assert.equal(core.displaySwitchAction(restored.pages[0][0]).title,'켜기');
});

test('Multi Switch linked titles share the first title while preserving both originals',()=>{
  const source=core.cleanAction({
    type:'multi-switch',title:'공통',settings:{activeState:1,linkStateTitles:true},
    stateVisuals:[
      {title:'연결 제목',icon:{kind:'glyph',glyph:'1'}},
      {title:'독립 제목',icon:{kind:'glyph',glyph:'2'}}
    ]
  });
  assert.equal(core.displaySwitchAction(source).title,'연결 제목');
  assert.equal(core.displaySwitchAction(source).icon.glyph,'2');
  assert.equal(source.stateVisuals[1].title,'독립 제목');
  const restored=core.cleanAction(JSON.parse(JSON.stringify(source)));
  assert.equal(core.displaySwitchAction(restored).title,'연결 제목');
  restored.settings.linkStateTitles=false;
  assert.equal(core.displaySwitchAction(restored).title,'독립 제목');
});

test('Multi Switch visual input validation and legacy fallbacks preserve common icon',()=>{
  const legacy=core.cleanAction({type:'multi-switch',title:'원래',icon:{kind:'glyph',glyph:'●'},children:[{type:'media'}]});
  assert.strictEqual(core.displaySwitchAction(legacy),legacy);
  const clean=core.cleanAction({type:'multi-switch',
    settings:{activeState:7},
    stateVisuals:[{title:123,icon:{kind:'file',value:'file:///private'}} ,{title:'두번째'}]
  });
  assert.equal(clean.settings.activeState,0);
  assert.equal(core.displaySwitchAction(clean).title,'');
  clean.settings.activeState=1;
  assert.equal(core.displaySwitchAction(clean).title,'두번째');
});

test('Random Action plans actual hardware presses and selects exactly one candidate',async()=>{
  const a=core.cleanAction({type:'random',children:[
    {type:'hotkey',settings:{keys:'Ctrl+A'}},
    {type:'media',settings:{op:'playpause'}},
    {type:'text',settings:{body:'가'}}
  ]});
  const state=core.migrateState({pages:[[a]]});
  assert.deepEqual(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome,
    {kind:'composite',type:'random'});
  for(const [r,type] of [[0,'hotkey'],[0.33,'hotkey'],[0.34,'media'],[0.7,'text'],[0.9999,'text']]){
    let selected=[];
    const result=await core.runComposite(a,{random:r,execute:async step=>selected.push(step.type),wait:async()=>{}});
    assert.equal(result,1);
    assert.deepEqual(selected,[type]);
  }
  assert.equal(core.ACTION_IDS.length,24);
});

test('Random Action rejects missing candidates and Delay without running anything',async()=>{
  let called=0;
  const executor={execute:async()=>{called++},wait:async()=>{called++}};
  await assert.rejects(core.runComposite(core.createAction('random'),{random:0.5,...executor}),/후보/);
  const delayed=core.cleanAction({type:'random',children:[{type:'media'},{kind:'delay',ms:100}]});
  await assert.rejects(core.runComposite(delayed,{random:0.1,...executor}),/지연/);
  assert.equal(called,0);
});

test('multi switch dispatches both independent sequences and awaits the selected state',async()=>{
  const sw=core.cleanAction({type:'multi-switch',
    sequences:[
      [{type:'hotkey',settings:{keys:'Ctrl+C'}},{kind:'delay',ms:200}],
      [{type:'media',settings:{op:'playpause'}}]
    ]
  });
  assert.deepEqual(core.planAction(sw,0,1),{kind:'composite',type:'multi-switch'});
  const events=[];
  const bridge={
    execute:async a=>{events.push(a.type);},
    wait:async ms=>{events.push('wait:'+ms);}
  };
  const one=await core.runComposite(sw,{...bridge,state:0});
  const two=await core.runComposite(sw,{...bridge,state:1});
  const three=await core.runComposite(sw,{...bridge,state:0});
  assert.deepEqual([one,two,three],[2,1,2]);
  assert.deepEqual(events,['hotkey','wait:200','media','hotkey','wait:200']);
});

test('multi switch rejects nested composite and old profiles retain children',async()=>{
  const old=core.cleanAction({type:'multi-switch',children:[{type:'hotkey',settings:{keys:'Ctrl+Z'}}]});
  assert.equal(core.planComposite(old,{state:0}).steps[0].type,'hotkey');
  const migrated=core.migrateState({pages:[[old]]});
  assert.equal(migrated.pages[0][0].children[0].settings.keys,'Ctrl+Z');
  assert.deepEqual(core.planComposite(migrated.pages[0][0],{state:1}).steps,[]);
  const bad=core.cleanAction({type:'multi-switch',sequences:[[{type:'multi'}],[]]});
  await assert.rejects(core.runComposite(bad,{state:0,execute:async()=>{},wait:async()=>{}}),/중첩/);
});

test('Multi pacing separates implicit next action gap from explicit Delay',async()=>{
  const multi=core.cleanAction({type:'multi',children:[
    {type:'media'},{type:'hotkey'},{kind:'delay',ms:200},{type:'media'}
  ]});
  const seen=[];
  const result=await core.runComposite(multi,{
    nextActionMs:100,
    execute:async item=>seen.push(item.type),
    wait:async ms=>seen.push('wait:'+ms)
  });
  assert.equal(result,4);
  assert.deepEqual(seen,['media','wait:100','hotkey','wait:200','media']);
});

test('Multi abort during last step is reported as cancellation, not success',async()=>{
  const controller=new AbortController();
  const multi=core.cleanAction({type:'multi',children:[{type:'media'}]});
  await assert.rejects(core.runComposite(multi,{
    execute:async()=>{controller.abort();},wait:async()=>{},
    signal:controller.signal
  }),/취소/);
});

test('multi runner refuses nested composites and honors cancellation',async()=>{
  const blocked=core.cleanAction({type:'multi',children:[{type:'multi'}]});
  await assert.rejects(core.runComposite(blocked,{execute:async()=>{},wait:async()=>{}}),/중첩/);
  const controller=new AbortController();
  const a=core.cleanAction({type:'multi',children:[{type:'media'},{type:'hotkey'}]});
  const executed=[];
  await assert.rejects(core.runComposite(a,{
    execute:async step=>{executed.push(step.type);controller.abort();},
    wait:async()=>{},signal:controller.signal
  }),/취소/);
  assert.deepEqual(executed,['media']);
});

test('folder navigation retains empty slot positions, nested actions and back navigation',()=>{
  const saved={pages:[[
    {type:'folder',title:'음악',children:[
      null,{type:'media',settings:{op:'next'}},
      {type:'folder',title:'하위',children:[null,{type:'hotkey',settings:{keys:'Ctrl+A'}}]}
    ]}
  ]]};
  const state=core.migrateState(saved);
  assert.equal(state.pages[0][0].children[0],null);
  assert.equal(state.pages[0][0].children[1].settings.op,'next');
  assert.equal(core.enterFolder(state,0),true);
  assert.equal(core.currentActions(state)[1].type,'media');
  assert.equal(core.planHardwareEvent(state,{kind:1,index:1,pressed:true}).outcome.kind,'media-control');
  assert.equal(core.enterFolder(state,2),true);
  assert.equal(core.currentActions(state)[1].settings.keys,'Ctrl+A');
  assert.equal(core.exitFolder(state),true);
  assert.equal(core.currentActions(state)[1].type,'media');
  assert.equal(core.exitFolder(state),true);
  assert.equal(core.exitFolder(state),false);
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.pages[0][0].children[2].children[1].settings.keys,'Ctrl+A');
});

test('nested folder back uses last free grid key or side key without overwriting data',()=>{
  const state=core.migrateState({pages:[[{type:'folder',children:[]}] ]});
  assert.equal(core.enterFolder(state,0),true);
  assert.equal(core.planHardwareEvent(state,{kind:1,index:13,pressed:true}).outcome.kind,'folder-back');
  assert.equal(core.planHardwareEvent(state,{kind:1,index:16,pressed:true}).outcome.kind,'folder-back');
  core.currentActions(state)[13]=core.createAction('media');
  assert.equal(core.planHardwareEvent(state,{kind:1,index:13,pressed:true}).outcome.kind,'media-control');
  assert.equal(core.planHardwareEvent(state,{kind:1,index:16,pressed:true}).outcome.kind,'folder-back');
});

test('folder migration safely restores valid active folder paths and removes invalid tails',()=>{
  const saved={pages:[[{type:'folder',children:[{type:'media'}]}]],folderPath:[0,3,7]};
  const state=core.migrateState(saved);
  assert.deepEqual(state.folderPath,[0]);
  assert.equal(core.currentActions(state)[0].type,'media');
  const again=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(again.folderPath,[0]);
  assert.equal(core.enterFolder(again,9),false);
  assert.equal(core.currentActions(again)[0].type,'media');
});

test('legacy state becomes default profile without changing buttons, folder and knobs',()=>{
  const legacy={pages:[[{type:'timer',title:'안전',settings:{seconds:42}},
    {type:'folder',children:[null,{type:'media'}]}]],page:0};
  const s=core.migrateState(legacy);
  assert.equal(s.profileId,'default');
  assert.equal(s.profileNames.length,1);
  assert.equal(s.pages[0][0].settings.seconds,42);
  assert.equal(s.pages[0][1].children[1].type,'media');
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.pages[0][0].title,'안전');
});

test('profile create, switch, rename and duplicate isolate page, knobs and folders',()=>{
  const s=core.migrateState(null);
  s.pages[0][0]=core.createAction('media');
  core.controlBinding(s,16).down=core.createAction('next');
  const second=core.createProfile(s,'포토샵');
  assert.ok(second);
  assert.equal(core.switchProfile(s,second),true);
  assert.equal(s.pages[0][0],null);
  assert.equal(core.controlBinding(s,16).down,null);
  s.pages[0][0]=core.createAction('folder');
  assert.equal(core.enterFolder(s,0),true);
  assert.equal(core.renameProfile(s,second,'영상 편집'),true);
  assert.equal(core.switchProfile(s,'default'),true);
  assert.equal(s.pages[0][0].type,'media');
  assert.equal(core.controlBinding(s,16).down.type,'next');
  assert.deepEqual(s.folderPath,[]);
  const duplicate=core.createProfile(s,'복사본',true);
  assert.ok(duplicate);
  assert.equal(core.switchProfile(s,duplicate),true);
  assert.equal(s.pages[0][0].type,'media');
  s.pages[0][0].title='바뀜';
  assert.equal(core.switchProfile(s,'default'),true);
  assert.equal(s.pages[0][0].title,'');
  const r=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(r.profileNames.length,3);
  assert.equal(core.switchProfile(r,second),true);
  assert.equal(r.pages[0][0].type,'folder');
  assert.deepEqual(r.folderPath,[0]);
  assert.equal(core.deleteProfile(r,second),true);
  assert.equal(r.profileNames.length,2);
  assert.equal(core.deleteProfile(r,'default'),true);
  assert.equal(core.deleteProfile(r,r.profileId),false);
});

test('pinned actions inherit only empty root slots and local overrides win',()=>{
  const s=core.migrateState({pages:[[{type:'media'}],[],[]]});
  assert.equal(core.togglePinned(s,0),true);
  s.page=1;
  assert.equal(core.currentActions(s)[0],null);
  assert.equal(core.visibleActions(s)[0].type,'media');
  assert.equal(core.planHardwareEvent(s,{kind:1,index:0,pressed:true}).outcome.kind,'media-control');
  s.pages[1][0]=core.createAction('hotkey');
  assert.equal(core.visibleActions(s)[0].type,'hotkey');
  s.page=2;
  assert.equal(core.visibleActions(s)[0].type,'media');
  assert.equal(core.togglePinned(s,0),true);
  assert.equal(core.visibleActions(s)[0],null);
  assert.equal(s.pages[0][0].type,'media');
  assert.equal(s.pages[1][0].type,'hotkey');
});

test('pinned folder opens from another page and preserves nested slot contents',()=>{
  const state=core.migrateState({pages:[
    [{type:'folder',title:'공유 폴더',children:[null,{type:'media'}]}],[]
  ]});
  assert.equal(core.togglePinned(state,0),true);
  state.page=1;
  assert.equal(core.visibleActions(state)[0].type,'folder');
  assert.equal(core.enterFolder(state,0),true);
  assert.equal(core.currentActions(state)[1].type,'media');
  assert.equal(core.activeFolder(state).title,'공유 폴더');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.folderPath,[0]);
  assert.equal(core.currentActions(restored)[1].type,'media');
});
test('pinned keys remain profile-specific, survive migration, and do not enter folders',()=>{
  const s=core.migrateState({pages:[[ {type:'media'},{type:'folder',children:[]} ],[]]});
  assert.equal(core.togglePinned(s,0),true);
  const other=core.createProfile(s,'두 번째');
  core.switchProfile(s,other);
  assert.equal(core.visibleActions(s)[0],null);
  core.switchProfile(s,'default');
  s.page=1;
  assert.equal(core.visibleActions(s)[0].type,'media');
  s.page=0;
  assert.equal(core.enterFolder(s,1),true);
  assert.equal(core.visibleActions(s)[0],null);
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.pinned[0].type,'media');
  assert.deepEqual(restored.folderPath,[1]);
  assert.equal(core.visibleActions(restored)[0],null);
});

test('Auto Folder Exit keeps enabled state separate from zero-second immediate return',()=>{
  const disabled=core.cleanAction({type:'folder',settings:{autoExitEnabled:false,autoExitSeconds:0}});
  const immediate=core.cleanAction({type:'folder',settings:{autoExitEnabled:true,autoExitSeconds:0}});
  assert.equal(disabled.settings.autoExitEnabled,false);
  assert.equal(immediate.settings.autoExitEnabled,true);
  assert.equal(immediate.settings.autoExitSeconds,0);
  const restored=core.migrateState({pages:[[immediate]]});
  assert.equal(restored.pages[0][0].settings.autoExitEnabled,true);
  assert.equal(restored.pages[0][0].settings.autoExitSeconds,0);
  const legacy=core.cleanAction({type:'folder',settings:{autoExitSeconds:25}});
  assert.equal(legacy.settings.autoExitEnabled,true);
  assert.equal(core.cleanAction({type:'folder',settings:{autoExitEnabled:true,autoExitSeconds:100}}).settings.autoExitSeconds,60);
});

test('Smart Profiles match only enabled exact Windows executable paths and persist',()=>{
  const s=core.migrateState(null);
  const id=core.createProfile(s,'편집기');
  const exe=String.raw`C:\\Program Files\\Editor\\Editor.exe`;
  assert.equal(core.setProfileApp(s,id,exe),true);
  assert.equal(core.matchForegroundProfile(s,exe),null);
  s.smartProfilesEnabled=true;
  s.profileNames.find(p=>p.id===id).smartEnabled=true;
  assert.equal(core.matchForegroundProfile(s,exe.toUpperCase()),id);
  assert.equal(core.matchForegroundProfile(s,String.raw`C:\\Program Files\\Editor\\NotEditor.exe`),null);
  assert.equal(core.setProfileApp(s,id,'calc.exe'),false);
  assert.equal(core.setProfileApp(s,id,String.raw`C:\\Temp\\script.bat`),false);
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.smartProfilesEnabled,true);
  assert.equal(restored.profileNames.find(p=>p.id===id).smartEnabled,true);
  assert.equal(core.matchForegroundProfile(restored,exe),id);
  assert.equal(core.switchProfile(restored,id),true);
  assert.equal(core.matchForegroundProfile(restored,exe),id);
});

test('original brightness action respects the 20 percent floor for fixed presets',()=>{
  const a=core.createAction('brightness');
  a.settings.mode='min';
  assert.deepEqual(core.planAction(a,0,1),{kind:'device-brightness-set',value:20});
  a.settings.mode='max';
  assert.deepEqual(core.planAction(a,0,1),{kind:'device-brightness-set',value:100});
  a.settings.mode='down';
  assert.deepEqual(core.planAction(a,0,1),{kind:'device-brightness',direction:-1,count:5});
});

test('brightness and zoom action planner',()=>{
  const a=core.createAction('device-brightness');
  assert.deepEqual(core.planAction(a,0,1),{kind:'device-brightness',direction:1,count:5});
  const z=core.createAction('system-zoom');
  assert.equal(core.planAction(z,0,1).target,'zoom');
  z.settings.operation='reset';assert.deepEqual(core.planAction(z,0,1),{kind:'zoom-reset'});
  const s=core.migrateState(null),k=core.controlBinding(s,16);
  k.mode='adjust';k.target='brightness';k.step=10;
  assert.deepEqual(core.planHardwareEvent(s,{kind:2,index:17,state:2}).outcome,
    {kind:'device-brightness',direction:-1,count:10});
});

test('P1/P2 closed shortcut actions preserve 24 original entries',()=>{
  assert.equal(core.ACTION_IDS.length,24);
  for(const [id,op] of [['screenshot','capture'],['clipboard-edit','copy'],['window-state','maximize'],
    ['window-monitor','right'],['explorer-open','open'],['brush-size','increase'],['timeline-step','next'],['timeline-zoom','in']]){
    const a=core.createAction(id);
    assert.deepEqual(core.planAction(a,0,1),{kind:'system-shortcut',target:id,operation:op});
    const state=core.migrateState(null);state.pages[0][0]=a;
    assert.equal(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome.target,id);
  }
});

test('original Soundboard actions expose playback and stop planning',()=>{
  const audio=core.createAction('audio-play');audio.settings.file='C:\\Audio\\sample.mp3';
  audio.settings.volume=65;audio.settings.mode='play-stop';
  assert.deepEqual(core.planAction(audio,0,1),{kind:'audio-play',file:'C:\\Audio\\sample.mp3',mode:'play-stop',volume:65,fade:'none',fadeDuration:2,output:'default'});
  assert.deepEqual(core.planAction(core.createAction('audio-stop'),0,1),{kind:'audio-stop'});
});

test('text action defaults to typing and preserves existing clipboard settings',()=>{
  const a=core.createAction('text');a.settings.body='한글과 English';a.settings.enter=true;
  assert.deepEqual(core.planAction(a,0,1),{kind:'type-text',text:'한글과 English',enter:true,mode:'typing'});
  a.settings.mode='clipboard';
  assert.equal(core.planAction(a,0,1).mode,'clipboard');
  a.settings.mode='typing';
  assert.equal(core.planAction(a,0,1).mode,'typing');
  const old=core.cleanAction({type:'text',settings:{body:'기존 텍스트'}});
  assert.equal(old.settings.mode,'clipboard');
  assert.equal(core.planAction(old,0,1).mode,'clipboard');
});

test('original timer planning validates bounds',()=>{
  const a=core.createAction('timer');
  assert.deepEqual(core.planAction(a,0,1),{kind:'timer',seconds:30});
  a.settings.seconds=0;assert.equal(core.planAction(a,0,1).seconds,30);
  a.settings.seconds=999999;assert.equal(core.planAction(a,0,1).seconds,86400);
});

test('original media/hotkey/open actions share execution planning',()=>{
  const media=core.createAction('media');media.settings.op='next';
  assert.deepEqual(core.planAction(media,0,1),{kind:'media-control',operation:'next'});
  const hotkey=core.createAction('hotkey');hotkey.settings.keys='Ctrl+Z';
  assert.deepEqual(core.planAction(hotkey,0,1),{kind:'windows-hotkey',keys:'Ctrl+Z'});
  const sw=core.createAction('hotkey-switch');
  sw.settings.first='Ctrl+C';sw.settings.second='Ctrl+V';
  assert.deepEqual(core.planAction(sw,0,1),{kind:'windows-hotkey-switch',first:'Ctrl+C',second:'Ctrl+V'});
  const open=core.createAction('open');open.settings.path='C:\\Temp';
  assert.deepEqual(core.planAction(open,0,1),{kind:'open-local-path',path:'C:\\Temp',target:'auto'});
  const close=core.createAction('close');close.settings.path='C:\\Tools\\app.exe';close.settings.force=true;
  assert.deepEqual(core.planAction(close,0,1),{kind:'close-local-app',path:'C:\\Tools\\app.exe',force:true});
  const app=core.createAction('open-app');app.settings.app='C:\\Program Files\\Example\\app.exe';
  assert.equal(core.planAction(app,0,1).target,'file');
});

test('local path action planning preserves user selected path safely',()=>{
  const a=core.createAction('folder-shortcut');a.settings.path='C:\\Users\\Public';
  assert.deepEqual(core.planAction(a,0,1),{kind:'open-local-path',path:'C:\\Users\\Public',target:'folder'});
  const state=core.migrateState(null);state.pages[0][1]=a;
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.pages[0][1].settings.path,a.settings.path);
  assert.equal(restored.pages[0][1].settings.alwaysNewWindow,false);
  delete a.settings.alwaysNewWindow;
  assert.equal(core.cleanAction(a).settings.alwaysNewWindow,false);
  a.settings.alwaysNewWindow=true;
  assert.deepEqual(core.planAction(a,0,1),{kind:'open-local-path',path:a.settings.path,target:'folder',alwaysNewWindow:true});
  assert.equal(core.cleanAction(a).settings.alwaysNewWindow,true);
  a.settings.alwaysNewWindow='true';
  assert.equal(core.planAction(a,0,1).alwaysNewWindow,undefined);
});

test('conflicting legacy page bindings and global single knob both survive migration',()=>{
  const a=core.blankPage(),b=core.blankPage(),c=core.blankPage();
  a[14]=core.createAction('next');b[14]=core.createAction('previous');
  a[16]=core.createAction('next');
  const s=core.migrateState({pages:[a,b,c],page:0});
  assert.equal(s.controls.scopes[0],'page');
  assert.equal(s.controls.scopes[2],'global');
  s.page=1;
  assert.equal(core.planHardwareEvent(s,{kind:1,index:15,pressed:true}).outcome.page,0);
  assert.equal(core.planHardwareEvent(s,{kind:2,index:17,state:3}).outcome.page,2);
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

test('editor preview produces the same virtual events as physical D200X controls',()=>{
  assert.deepEqual(core.previewHardwareEvent(0),{kind:1,index:0,state:1,pressed:true});
  assert.deepEqual(core.previewHardwareEvent(14),{kind:1,index:15,state:1,pressed:true});
  assert.deepEqual(core.previewHardwareEvent(16,'left'),{kind:2,index:17,state:2,pressed:false});
  assert.deepEqual(core.previewHardwareEvent(18,'right'),{kind:2,index:19,state:3,pressed:false});
  assert.equal(core.previewHardwareEvent(15,'left'),null);
  assert.equal(core.previewHardwareEvent(19),null);
  const state=core.migrateState(null);
  core.controlBinding(state,16).mode='adjust';
  core.controlBinding(state,16).target='volume';
  assert.deepEqual(core.planHardwareEvent(state,core.previewHardwareEvent(16,'right')).outcome,
    {kind:'adjust',target:'volume',direction:1});
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
  assert.deepEqual(core.planAction(site,1,3),{kind:'website',url:'https://example.org/',mode:'default',browserPath:''});
  assert.equal(core.planAction(core.createAction('hotkey'),1,3).kind,'windows-hotkey');
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
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.kind,'timer');
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

test('Sleep plans a device-only sleep command and Key Logic uses gesture slots',async()=>{
  assert.deepEqual(core.planAction(core.createAction('sleep'),0,1),{kind:'device-sleep'});
  const logic=core.createAction('logic');
  logic.slots={single:core.createAction('hotkey'),double:core.createAction('media'),hold:core.createAction('open')};
  logic.slots.single.settings.keys='Ctrl+A';
  assert.deepEqual(core.planAction(logic,0,1),{kind:'composite',type:'logic'});
  assert.equal(core.planComposite(logic,{gesture:'double'}).steps[0].type,'media');
  assert.equal(core.planComposite(logic,{gesture:'hold'}).steps[0].type,'open');
  assert.equal(core.planComposite(logic,{gesture:'single'}).steps[0].settings.keys,'Ctrl+A');
  const restored=core.migrateState({pages:[[logic]],page:0});
  assert.equal(restored.pages[0][0].slots.double.type,'media');
  const calls=[];
  await core.runComposite(logic,{gesture:'single',execute:async a=>calls.push(a.settings.keys),wait:async()=>{}});
  assert.deepEqual(calls,['Ctrl+A']);
});

test('unfinished built-in action plans carry their configured executable options',()=>{
  const sound=core.createAction('audio-play');
  sound.settings.fade='in-out';sound.settings.fadeDuration=5;sound.settings.output='speaker-device-1';
  const audio=core.planAction(sound,0,3);
  assert.equal(audio.kind,'audio-play');
  assert.equal(audio.fade,'in-out');
  assert.equal(audio.fadeDuration,5);
  assert.equal(audio.output,'speaker-device-1');
  const website=core.createAction('website');
  website.settings.open='choose';website.settings.browserPath='C:\\Programs\\browser.exe';
  assert.deepEqual(core.planAction(website,0,3),{
    kind:'website',url:'',mode:'choose',browserPath:'C:\\Programs\\browser.exe'});
  const opened=core.createAction('open-app');
  opened.settings.app='C:\\Programs\\app.exe';
  opened.settings.foreground=true;opened.settings.hold='close';
  assert.deepEqual(core.planAction(opened,0,3),{
    kind:'open-local-path',path:'C:\\Programs\\app.exe',
    target:'file',foreground:true,preventDuplicate:true,hold:'close'});
  const text=core.createAction('text');text.settings.mode='clipboard';
  assert.equal(core.planAction(text,0,3).mode,'clipboard');
  assert.equal(core.planAction(core.createAction('virtual'),0,3).kind,'unsupported');
});

test('Multi Action retains bounded delays and rejects unsupported nested composites',async()=>{
  const multi=core.createAction('multi');
  multi.children=[core.createAction('audio-play'),{kind:'delay',ms:2},core.createAction('close')];
  const planned=core.planComposite(multi,{});
  assert.deepEqual(planned.steps.map(step=>step.kind||step.type),['audio-play','delay','close']);
  const calls=[];
  await core.runComposite(multi,{
    execute:async action=>calls.push(action.type),
    wait:async ms=>calls.push('wait:'+ms),
    nextActionMs:5
  });
  assert.deepEqual(calls,['audio-play','wait:2','close']);
  const nested=core.createAction('multi');
  nested.children=[core.createAction('multi')];
  assert.equal(core.planComposite(nested).kind,'invalid');
});


test('HA plugin action is separate and survives profile migration and hardware planning',()=>{
  assert.deepEqual(core.PLUGIN_ACTION_IDS,['ha-toggle','sd-plugin']);
  assert.equal(core.ACTION_IDS.length,24);
  assert.equal(core.D200X_ACTION_IDS.length,21);
  const state=core.migrateState(null);
  const action=core.createAction('ha-toggle');
  action.settings.entityId='switch.kitchen';
  state.pages[0][0]=action;
  const knob=core.controlBinding(state,16);
  knob.mode='trigger';knob.down=core.createAction('ha-toggle');
  knob.down.settings.entityId='fan.bathroom';
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.pages[0][0].settings.entityId,'switch.kitchen');
  assert.deepEqual(core.planAction(restored.pages[0][0],0,1),
    {kind:'ha-toggle',entityId:'switch.kitchen'});
  assert.equal(core.controlBinding(restored,16).down.settings.entityId,'fan.bathroom');
});

test('SDK plugin binding is kept separately from its old HA REST toggle',()=>{
  const a=core.createAction('sd-plugin');
  a.settings.pluginUUID='de.perdoctus.streamdeck.homeassistant';
  a.settings.actionUUID='de.perdoctus.streamdeck.homeassistant.entity';
  a.settings.pluginSettings={display:{entityId:'switch.kitchen'}};
  const state=core.migrateState(null);
  state.pages[0][0]=a;
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.pages[0][0].settings.pluginUUID,a.settings.pluginUUID);
  assert.equal(restored.pages[0][0].settings.pluginSettings.display.entityId,'switch.kitchen');
  assert.deepEqual(core.planAction(restored.pages[0][0],0,1),{
    kind:'sd-plugin',pluginUUID:a.settings.pluginUUID,actionUUID:a.settings.actionUUID
  });
});


test('nested folders keep independent pages and preserve content through migration',()=>{
  const state=core.migrateState(null);
  const folder=core.createAction('folder');
  state.pages[0][0]=folder;
  assert.equal(core.enterFolder(state,0),true);
  assert.equal(core.folderPageCount(state),1);
  core.currentActions(state)[1]=core.createAction('website');
  assert.equal(core.addFolderPage(state),true);
  assert.equal(core.folderPageCount(state),2);
  const nested=core.createAction('folder');
  core.currentActions(state)[2]=nested;
  assert.equal(core.enterFolder(state,2),true);
  assert.equal(core.addFolderPage(state),true);
  core.currentActions(state)[3]=core.createAction('hotkey');
  assert.equal(core.exitFolder(state),true);
  assert.equal(core.changeFolderPage(state,0),true);
  assert.equal(core.currentActions(state)[1].type,'website');
  assert.equal(core.currentActions(state)[2],null);
  assert.equal(core.changeFolderPage(state,1),true);
  assert.equal(core.currentActions(state)[2].type,'folder');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.folderPageCount(restored),2);
  assert.equal(core.currentActions(restored)[2].type,'folder');
  assert.equal(core.enterFolder(restored,2),true);
  assert.equal(core.folderPageCount(restored),2);
  assert.equal(core.currentActions(restored)[3].type,'hotkey');
  assert.equal(core.deleteFolderPage(restored),true);
  assert.equal(core.folderPageCount(restored),1);
});


test('copying an inactive profile keeps the new ID and preserves original action data',()=>{
  const state=core.migrateState(null);
  const first=core.createProfile(state,'첫 번째');
  assert.equal(core.switchProfile(state,first),true);
  state.pages[0][1]=core.createAction('website');
  const second=core.createProfile(state,'두 번째');
  assert.equal(core.switchProfile(state,second),true);
  const copied=core.createProfile(state,'첫 번째 복제',true,first);
  assert.notEqual(copied,first);
  assert.equal(state.inactiveProfiles.find(p=>p.id===copied)?.pages[0][1]?.type,'website');
  assert.equal(core.switchProfile(state,copied),true);
  assert.equal(state.profileId,copied);
  assert.equal(state.pages[0][1].type,'website');
  assert.equal(core.switchProfile(state,first),true);
  assert.equal(state.pages[0][1].type,'website');
});


test('wide display defaults to clock, date/week and CPU/RAM/GPU and cycles in saved order',()=>{
  const s=core.migrateState(null);
  assert.deepEqual(s.wideDisplay.order,['clock','datetime','stats','knobs']);
  assert.deepEqual(s.wideDisplay.enabled,['clock','datetime','stats']);
  assert.equal(s.wideDisplay.current,'clock');
  assert.equal(core.cycleWideDisplay(s),'datetime');
  assert.equal(core.cycleWideDisplay(s),'stats');
  assert.equal(core.cycleWideDisplay(s),'clock');
  s.wideDisplay.enabled.push('knobs');
  assert.equal(core.cycleWideDisplay(s),'datetime');
  assert.equal(core.cycleWideDisplay(s),'stats');
  assert.equal(core.cycleWideDisplay(s),'knobs');
  assert.equal(core.cycleWideDisplay(s),'clock');
  s.wideDisplay.order=['stats','clock','datetime','knobs'];
  s.wideDisplay.enabled=['clock','stats'];
  assert.equal(core.cycleWideDisplay(s),'stats');
  assert.equal(core.cycleWideDisplay(s),'clock');
  const profile=core.createProfile(s,'분리된 화면',true);
  assert.equal(core.switchProfile(s,profile),true);
  assert.deepEqual(s.wideDisplay.order,['stats','clock','datetime','knobs']);
  assert.deepEqual(s.wideDisplay.enabled,['clock','stats']);
  assert.equal(core.switchProfile(s,'default'),true);
  const copy=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(copy.wideDisplay.order,['stats','clock','datetime','knobs']);
  assert.deepEqual(copy.wideDisplay.enabled,['clock','stats']);
  const bad=core.cleanWideDisplay({order:['stats','invalid','stats'],enabled:[],current:'invalid'});
  assert.deepEqual(bad.order,['stats','clock','datetime','knobs']);
  assert.deepEqual(bad.enabled,['clock']);
});

test('wide merged screen press accepts both halves without changing ordinary key 14 action mapping',()=>{
  const state=core.migrateState(null);
  assert.equal(core.isWideDisplayPress({kind:1,index:13,state:1,pressed:true}),true);
  assert.equal(core.isWideDisplayPress({kind:1,index:14,state:1,pressed:true}),true);
  assert.equal(core.isWideDisplayPress({kind:1,index:14,state:0,pressed:false}),false);
  assert.equal(core.isWideDisplayPress({kind:0,index:13,state:1,pressed:true}),true);
  assert.equal(core.isWideDisplayPress({kind:2,index:14,state:1,pressed:true}),true);
  assert.equal(core.isWideDisplayPress({kind:2,index:17,state:1,pressed:true,knob:true}),false);
  assert.equal(core.isWideDisplayPress({kind:1,index:15,state:1,pressed:true}),false);
  assert.equal(core.physicalSlot({kind:1,index:14,pressed:true}),null);
  assert.equal(core.cycleWideDisplay(state),'datetime');
  assert.equal(core.cycleWideDisplay(state),'stats');
  assert.equal(core.cycleWideDisplay(state),'clock');
});

test('held dial rotations preserve normal action bindings, adjusted mode and saved profiles',()=>{
  const state=core.migrateState(null);
  state.pages.push(core.blankPage());
  state.controls.pages.push(Array.from({length:5},core.emptyBinding));
  state.profileNames.push({id:'fusion',name:'Fusion',appPath:'',smartEnabled:false});
  const knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='page';
  knob.down=core.createAction('media');
  knob.holdLeft=core.createAction('profile');
  knob.holdLeft.settings.profile='previous';
  knob.holdRight=core.createAction('profile');
  knob.holdRight.settings.profile='next';
  assert.equal(core.hardwareGesture({index:17,state:4}),'hold-left');
  assert.equal(core.hardwareGesture({index:17,state:5}),'hold-right');
  assert.equal(core.previewHardwareEvent(16,'hold-left').state,4);
  assert.equal(core.previewHardwareEvent(16,'hold-right').state,5);
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:4}).outcome,
    {kind:'profile',profile:'previous'});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:5}).outcome,
    {kind:'profile',profile:'next'});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,
    {kind:'page',page:1});
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:1}).outcome.kind,'media-control');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).mode,'trigger');
  assert.equal(core.controlBinding(restored,16).autoAssign,true);
  assert.equal(core.controlBinding(restored,16).holdLeft.settings.profile,'previous');
  assert.equal(core.controlBinding(restored,16).holdRight.settings.profile,'next');
  const other=core.controlBinding(restored,17);
  assert.equal(other.holdLeft,null);
  other.mode='trigger';other.left=core.createAction('media');
  other.holdRight=core.createAction('profile');
  assert.equal(core.planHardwareEvent(restored,{kind:2,index:18,state:2}).outcome.kind,'media-control');
  assert.equal(core.planHardwareEvent(restored,{kind:2,index:18,state:5}).outcome.kind,'profile');
});

test('separate normal and pressed rotary modes persist, profile direction works and press is disabled',()=>{
  const state=core.migrateState(null);
  state.profileNames.push({id:'extra',name:'Extra'});
  state.pages.push(core.blankPage());
  state.controls.pages.push(Array.from({length:5},core.emptyBinding));
  const knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='page';knob.step=1;
  knob.down=core.createAction('media');
  knob.heldEnabled=true;
  knob.heldMode='adjust';knob.heldTarget='profile';knob.heldStep=1;
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:1}),null);
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome,{kind:'page',page:0});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,{kind:'page',page:1});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:4}).outcome,{kind:'profile',profile:'previous'});
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:5}).outcome,{kind:'profile',profile:'next'});
  knob.heldMode='trigger';knob.holdLeft=core.createAction('media');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:4}).outcome.kind,'media-control');
  knob.heldMode='adjust';knob.heldReverseDirection=true;
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:4}).outcome,{kind:'profile',profile:'next'});
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).heldTarget,'profile');
  assert.equal(core.controlBinding(restored,16).heldEnabled,true);
  assert.equal(core.controlBinding(restored,16).heldReverseDirection,true);
  assert.equal(core.controlBinding(restored,16).mode,'trigger');
  assert.equal(core.controlBinding(restored,16).autoAssign,true);
  assert.equal(core.controlBinding(restored,16).target,'page');
});

test('individual rotary overrides preserve automatic action on the other direction',()=>{
  const state=core.migrateState(null);
  state.pages.push(core.blankPage());
  state.controls.pages.push(Array.from({length:5},core.emptyBinding));
  const knob=core.controlBinding(state,16);
  knob.mode='trigger';knob.autoAssign=true;knob.target='page';
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome,{kind:'page',page:1});
  knob.right=core.createAction('media');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.kind,'media-control');
  assert.deepEqual(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome,{kind:'page',page:0});
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(core.controlBinding(restored,16).autoAssign,true);
});

test('individual profile JSON export includes only selected active/inactive data without mutation',()=>{
  const state=core.migrateState(null);
  const named=core.createProfile(state,'Fusion 360');
  state.pages[0][0]=core.createAction('hotkey');
  state.pages.push(core.blankPage());
  state.controls.global[0].down=core.createAction('media');
  const before=JSON.stringify(state);
  const active=core.exportSingleProfile(state,'default');
  assert.equal(active.format,'d200x-single-profile-v1');
  assert.equal(active.profile.id,'default');
  assert.equal(active.snapshot.pages.length,2);
  assert.equal(active.snapshot.pages[0][0].type,'hotkey');
  assert.equal(active.snapshot.controls.global[0].down.type,'media');
  assert.equal(active.profile.name,'기본 프로필');
  assert.equal(active.profileNames,undefined);
  const inactive=core.exportSingleProfile(state,named);
  assert.equal(inactive.profile.id,named);
  assert.equal(inactive.profile.name,'Fusion 360');
  assert.equal(inactive.snapshot.pages.length,1);
  assert.equal(inactive.snapshot.pages[0][0],null);
  assert.equal(JSON.stringify(state),before);
  assert.throws(()=>core.exportSingleProfile(state,'missing'),/프로필/);
});

test('Start menu app plan keeps foreground and hold options without command arguments',()=>{
  const app=core.createAction('open-app');
  app.settings.app='shell:AppsFolder\\Example.App';
  app.settings.args='ignored';
  app.settings.foreground=true;
  app.settings.hold='force';
  assert.deepEqual(core.planAction(app,0,1),{kind:'open-local-path',path:app.settings.app,target:'appid',foreground:true,preventDuplicate:true,hold:'force'});
});

test('new launch policies default to prevention and preserve prior repeat-launch settings',()=>{
  const app=core.createAction('open-app');
  assert.equal(app.settings.preventDuplicate,true);
  delete app.settings.preventDuplicate;app.settings.foreground=false;
  assert.equal(core.cleanAction(app).settings.preventDuplicate,false);
  app.settings.foreground=true;app.settings.args='-NoProfile';
  assert.equal(core.cleanAction(app).settings.preventDuplicate,false);
  app.settings.preventDuplicate=true;
  assert.equal(core.planAction(app,0,1).preventDuplicate,true);
  const folder=core.createAction('folder-shortcut');folder.settings.foreground=false;
  assert.equal(core.planAction(folder,0,1).foreground,false);
});

test('terminal actions keep separate elevation identity, both options, and survive migration',()=>{
  for(const [type,admin] of [['terminal',false],['terminal-admin',true]]){
    const action=core.createAction(type);
    assert.deepEqual(core.planAction(action,0,1),{kind:'open-terminal',admin,foreground:true,preventDuplicate:true});
    action.settings.foreground=false;action.settings.preventDuplicate=false;
    assert.deepEqual(core.planAction(core.cleanAction(action),0,1),{kind:'open-terminal',admin,foreground:false,preventDuplicate:false});
  }
});

test('legacy adjustment migration preserves dormant rotations and never activates them implicitly',()=>{
  let state=core.migrateState(null),knob=core.controlBinding(state,16);
  knob.mode='adjust';knob.target='volume';knob.left=core.createAction('media');
  knob.down=core.createAction('media');knob.heldEnabled=true;
  knob.heldMode='adjust';knob.heldTarget='profile';knob.holdLeft=core.createAction('media');
  state=core.migrateState(JSON.parse(JSON.stringify(state)));knob=core.controlBinding(state,16);
  assert.equal(knob.mode,'trigger');assert.equal(knob.heldMode,'trigger');
  assert.ok(knob.left&&knob.holdLeft&&knob.down);
  assert.equal(core.controlAction(knob,'left'),null);
  assert.equal(core.controlAction(knob,'holdLeft'),null);
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.target,'volume');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:4}).outcome.kind,'profile');
  core.assignControlAction(knob,'left',core.createAction('media'));
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:2}).outcome.kind,'media-control');
  assert.equal(core.planHardwareEvent(state,{kind:2,index:17,state:3}).outcome.target,'volume');
});

test('side buttons restrict navigation, preserve old data, and persist independent hold settings',()=>{
  const s=core.migrateState({pages:[[],[],[]],page:1});
  const a=core.controlBinding(s,14),b=core.controlBinding(s,15);
  assert.equal(core.planSideNavigation(s,14).page,0);
  a.down=core.makeSideAction({navigation:'last'});
  a.sideHold=core.makeSideAction({navigation:'home'});
  b.down=core.createAction('hotkey');b.down.settings.keys='Ctrl+C';
  assert.equal(core.planSideNavigation(s,15),null);
  assert.equal(core.planSideNavigation(s,14).page,2);
  assert.equal(core.planSideNavigation(s,14,'hold').kind,'home');
  const loaded=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(core.controlBinding(loaded,15).down.settings.keys,'Ctrl+C');
  assert.equal(core.sideActionConfig(core.controlBinding(loaded,14),14,'hold').navigation,'home');
  core.controlBinding(loaded,14).down=core.makeSideAction({navigation:'none'});
  assert.equal(core.planSideNavigation(loaded,14),null);
  assert.equal(Object.keys(core.SIDE_NAV_LABELS).length,13);
  assert.equal(core.ACTION_IDS.length,24);
});
test('side folder navigation validates nested routes before changing page and distinguishes home from root',()=>{
  const s=core.migrateState({pages:[[],[{type:'folder',title:'A',children:[{type:'folder',title:'B',children:[]}]}]]});
  const targets=core.sideFolderTargets(s),t=targets.find(x=>x.route.length===2);
  assert.ok(t);
  core.controlBinding(s,14).down=core.makeSideAction({navigation:'folder-target',rootPage:t.rootPage,route:t.route});
  assert.equal(core.applySideNavigation(s,core.planSideNavigation(s,14)),true);
  assert.equal(s.page,1);assert.deepEqual(s.folderPath,[0,0]);
  assert.equal(core.applySideNavigation(s,{kind:'folder-root'}),true);
  assert.equal(s.page,1);assert.deepEqual(s.folderPath,[]);
  const snapshot=JSON.stringify(s);
  assert.equal(core.applySideNavigation(s,{kind:'folder-target',config:{rootPage:1,route:[[0,0],[8,0]]}}),false);
  assert.equal(JSON.stringify(s),snapshot);
  assert.equal(core.applySideNavigation(s,{kind:'home'}),true);assert.equal(s.page,0);
});
test('side short/hold state machine consumes duplicate downs and releases once, cancels changed context',()=>{
  const x=core.createSidePressTracker(),ctx='profile-page';
  assert.equal(x.input(14,'down',true,ctx,0),'wait');
  assert.equal(x.input(14,'down',true,ctx,50),null);
  assert.equal(x.input(14,'up',true,ctx,100),'down');
  assert.equal(x.input(14,'down',true,ctx,1000),'wait');
  assert.equal(x.input(14,'timeout',true,ctx,1650),'hold');
  assert.equal(x.input(14,'down',true,ctx,1660),null);
  assert.equal(x.input(14,'up',true,ctx,2000),null);
  assert.equal(x.input(14,'down',true,ctx,3000),'wait');
  assert.equal(x.input(14,'up',true,'other-page',3700),null);
  assert.equal(x.input(15,'down',false,ctx,4000),'down');
  assert.equal(x.input(15,'up',false,ctx,4100),null);
  x.input(15,'down',true,ctx,5000);x.clear();
  assert.equal(x.input(15,'up',true,ctx,5700),null);
  x.input(15,'down',true,ctx,6000);x.invalidate();
  assert.equal(x.input(15,'down',true,ctx,6700),null);
  assert.equal(x.input(15,'up',true,ctx,6800),null);
});

test('root page structure preserves logical destinations and page-local control rows',()=>{
  const s=core.migrateState({pages:[[],[],[]]});
  const goto=n=>({...core.createAction('goto'),settings:{page:n}});
  const [first,second,third]=s.pages;
  first[0]=goto(2);second[0]=goto('0');third[0]=goto(1);
  const pin=s.pinned[2]=goto(2),local=s.controls.pages[2][2];local.down=goto(1);
  s.controls.global[0].down=core.makeSideAction({navigation:'goto',page:2});
  const folder=second[4]=core.createAction('folder');folder.children[0]=goto(0);
  s.controls.global[1].sideHold=core.makeSideAction({navigation:'folder-target',rootPage:1,route:[[4,0]]});
  const original=JSON.stringify(folder);
  assert.equal(core.editPageStructure(s,{op:'insert',index:1,folder:null}),true);
  assert.equal(s.pages[0][0].settings.page,3);assert.equal(s.pages[3][0].settings.page,2);
  assert.equal(s.pinned[2].settings.page,3);assert.equal(s.controls.pages[3][2].down.settings.page,2);
  assert.equal(s.controls.global[0].down.settings.page,3);
  assert.equal(s.controls.global[1].sideHold.settings.rootPage,2);assert.equal(JSON.stringify(s.pages[2][4]),original);
  assert.equal(core.editPageStructure(s,{op:'move',index:3,to:0,folder:null}),true);
  assert.equal(s.pages[1][0].settings.page,0);assert.equal(s.pinned[2].settings.page,0);
  assert.equal(s.controls.pages[0][2].down.settings.page,3);assert.equal(s.controls.global[1].sideHold.settings.rootPage,3);
  assert.equal(core.editPageStructure(s,{op:'duplicate',index:3,folder:null}),true);
  assert.notEqual(s.pages[3][4],s.pages[4][4]);assert.deepEqual(s.pages[3][4],s.pages[4][4]);
  s.pages[4][4].title='copy';assert.notEqual(s.pages[3][4].title,'copy');
  assert.equal(core.editPageStructure(s,{op:'delete',index:0,folder:null}),true);
  assert.equal(s.pages[0][0].settings.page,-1);assert.equal(s.pinned[2].settings.page,-1);
  assert.equal(core.planAction(s.pages[0][0],0,s.pages.length).kind,'invalid');
  assert.equal(core.editPageStructure(s,{op:'append',folder:null}),true);
  assert.equal(s.pages[0][0].settings.page,-1);
  assert.equal(s.controls.pages.length,s.pages.length);
});
test('folder page edits keep routes and nested deck namespaces separate',()=>{
  const s=core.migrateState({pages:[[],[]]});
  const goto=n=>({...core.createAction('goto'),settings:{page:n}});
  const folder=s.pages[0][0]=core.createAction('folder');
  folder.children=Array(14).fill(null);folder.pages=[Array(14).fill(null),Array(14).fill(null)];
  folder.children[0]=goto(2);folder.pages[1][0]=goto(0);
  const nested=folder.pages[0][1]=core.createAction('folder');nested.children[0]=goto(0);
  s.pages[1][0]=goto(0);
  s.controls.global[0].down=core.makeSideAction({navigation:'folder-target',rootPage:0,route:[[0,1],[1,0]]});
  s.controls.global[1].down=core.makeSideAction({navigation:'goto',page:1});
  assert.equal(core.enterFolder(s,0),true);
  assert.equal(core.editPageStructure(s,{op:'insert',index:1}),true);
  assert.equal(folder.children[0].settings.page,3);
  assert.deepEqual(s.controls.global[0].down.settings.route,[[0,2],[1,0]]);
  assert.equal(s.controls.global[1].down.settings.page,1);
  assert.equal(folder.pages[1][1].children[0].settings.page,0);
  assert.equal(core.editPageStructure(s,{op:'move',index:2,to:0}),true);
  assert.deepEqual(s.controls.global[0].down.settings.route,[[0,0],[1,0]]);
  assert.equal(folder.pages[0][0].settings.page,3);
  assert.equal(core.editPageStructure(s,{op:'delete',index:0}),true);
  assert.equal(s.controls.global[0].down.settings.rootPage,-1);
  assert.equal(core.planSideNavigation(s,14).kind,'invalid');
  assert.equal(s.pages[1][0].settings.page,0);
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(core.planSideNavigation(restored,14).kind,'invalid');
});
test('new page cap preserves legacy large profiles and append does not select during AI preview',()=>{
  const s=core.migrateState({pages:Array.from({length:11},()=>[])});
  const before=JSON.stringify(s);
  for(const op of ['append','insert','duplicate'])assert.equal(core.editPageStructure(s,{op,index:0,folder:null}),false);
  assert.equal(JSON.stringify(s),before);
  assert.equal(core.editPageStructure(s,{op:'move',index:10,to:0,folder:null}),true);
  assert.equal(s.pages.length,11);
  const small=core.migrateState(null),a=small.pages[0][0]=core.createAction('sd-plugin');
  small.selected=0;assert.equal(core.editPageStructure(small,{op:'append',folder:null,select:false}),true);
  assert.equal(small.page,0);assert.equal(small.selected,0);assert.equal(small.pages[0][0],a);
});

test('page indicator has an independent short/hold navigation whitelist and defaults to no action',()=>{
  const s=core.migrateState({pages:[[],[],[]]});
  const indicator=s.pages[0][0]=core.createAction('indicator');
  assert.equal(core.planIndicatorNavigation(s,0),null);
  indicator.settings.indicatorDown={navigation:'goto',page:2};
  indicator.settings.indicatorHold={navigation:'home'};
  assert.deepEqual(core.planIndicatorNavigation(s,0),{kind:'page',page:2});
  assert.deepEqual(core.planIndicatorNavigation(s,0,'hold'),{kind:'home'});
  indicator.settings.indicatorHold={navigation:'editor-open'};
  assert.deepEqual(core.planIndicatorNavigation(s,0,'hold'),{kind:'editor-open'});
  indicator.settings.indicatorHold={navigation:'open-app',app:'bad'};
  assert.equal(core.planIndicatorNavigation(s,0,'hold'),null);
  assert.equal(core.cleanAction(indicator).settings.indicatorHold.navigation,'none');
  assert.equal(core.planAction(indicator,0,3).kind,'display-only');
});
test('legacy indicator pins migrate to independent visible slots without overwriting',()=>{
  const s=core.migrateState({pages:[[],[],[]]});
  const item=core.createAction('indicator');item.settings.indicatorDown={navigation:'next'};
  s.pinned[0]=item;s.pages[1][0]=core.createAction('hotkey');
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.pinned[0],null);
  assert.equal(restored.pages[0][0].type,'indicator');
  assert.equal(restored.pages[1][0].type,'hotkey');
  assert.equal(restored.pages[2][0].type,'indicator');
  assert.equal(core.sharedIndicatorConfig(restored,restored.pages[2][0]).navigation,'next');
  assert.equal(core.togglePinned(restored,0),false);
});
test('indicator bulk skips existing and full pages, shares navigation, keeps separate design and auto adds',()=>{
  const s=core.migrateState({pages:[[],[],[],[]]});
  const item=s.pages[0][0]=core.createAction('indicator');item.title='One';
  const existing=s.pages[1][3]=core.createAction('indicator');existing.title='Two';
  for(let i=0;i<13;i++)s.pages[2][i]=core.createAction('hotkey');
  s.pinned[0]=core.createAction('hotkey');
  core.updateIndicatorCommon(s,item,{indicatorDown:{navigation:'next'}});
  assert.deepEqual(core.manageIndicators(s,'add',item,null),{added:1,existing:2,full:1,removed:0});
  assert.equal(s.pages[3][0],null);assert.equal(s.pages[3][1].title,'One');
  assert.equal(existing.title,'Two');assert.equal(core.sharedIndicatorConfig(s,existing).navigation,'next');
  assert.equal(core.editPageStructure(s,{op:'append',folder:null}),true);
  assert.equal(s.pages[4][1].type,'indicator');
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.indicatorCommon.indicatorDown.navigation,'next');
  assert.equal(core.manageIndicators(restored,'remove',item,null).removed,4);
  assert.equal(restored.pages[2][0].type,'hotkey');
  assert.equal(restored.indicatorCommon.autoAdd,false);
  assert.equal(core.editPageStructure(restored,{op:'append',folder:null}),true);
  assert.equal(restored.pages[5].some(x=>x?.type==='indicator'),false);
});
test('common indicator targets follow root page changes and survive reload',()=>{
  const s=core.migrateState({pages:[[],[],[]]});
  const item=s.pages[0][0]=core.createAction('indicator');
  core.updateIndicatorCommon(s,item,{indicatorDown:{navigation:'goto',page:2},indicatorHold:{navigation:'goto',page:1}});
  assert.equal(core.editPageStructure(s,{op:'insert',index:1,folder:null}),true);
  assert.equal(s.indicatorCommon.indicatorDown.page,3);
  assert.equal(s.indicatorCommon.indicatorHold.page,2);
  assert.equal(core.editPageStructure(s,{op:'delete',index:2,folder:null}),true);
  assert.equal(s.indicatorCommon.indicatorDown.page,2);
  assert.equal(s.indicatorCommon.indicatorHold.page,-1);
  const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.indicatorCommon.indicatorHold.page,-1);
});
test('indicator and side use same one-shot short and hold tracker',()=>{
  const tracker=core.createSidePressTracker();
  assert.equal(tracker.input(0,'down',true,'p',0),'wait');
  assert.equal(tracker.input(0,'down',true,'p',10),null);
  assert.equal(tracker.input(0,'up',true,'p',300),'down');
  assert.equal(tracker.input(0,'down',true,'p',1000),'wait');
  assert.equal(tracker.input(0,'timeout',true,'p',1650),'hold');
  assert.equal(tracker.has(0),true);
  assert.equal(tracker.input(0,'up',true,'next',1700),null);
  assert.equal(tracker.has(0),false);
});

test('independent indicator Down title stays local and Down number style persists profile-wide',()=>{
 const s=core.migrateState({pages:[[],[]]});
 const first=s.pages[0][0]=core.createAction('indicator'),second=s.pages[1][0]=core.createAction('indicator');
 first.title='One';second.title='Two';
 first.settings.indicatorDownTitle='Pressed';first.settings.indicatorDownTitleStyle={...core.TITLE,visible:false,color:'#ff0000'};
 core.updateIndicatorCommon(s,first,{indicatorDownNumberStyle:{...core.INDICATOR_NUMBER_STYLE,visible:false,size:20}});
 const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.pages[0][0].settings.indicatorDownTitle,'Pressed');
 assert.equal(restored.pages[0][0].settings.indicatorDownTitleStyle.visible,false);
 assert.equal(restored.pages[1][0].settings.indicatorDownTitle,undefined);
 assert.equal(core.indicatorCommon(restored,restored.pages[1][0]).indicatorDownNumberStyle.visible,false);
 assert.equal(core.indicatorCommon(restored).indicatorNumberStyle.visible,true);
 assert.equal(core.indicatorCommon(restored).indicatorDownNumberStyle.size,20);
});

test('indicator history options remain distinct from numeric previous, persist and plan',()=>{
  const s=core.migrateState({pages:[[],[],[],[],[]]});
  const item=s.pages[4][0]=core.createAction('indicator');s.page=4;
  core.updateIndicatorCommon(s,item,{indicatorDown:{navigation:'previous'}});
  assert.deepEqual(core.planIndicatorNavigation(s,0),{kind:'page',page:3});
  for(const navigation of ['history-back','profile-history','folder-history']){
    core.updateIndicatorCommon(s,item,{indicatorHold:{navigation}});
    assert.deepEqual(core.planIndicatorNavigation(s,0,'hold'),{kind:navigation});
    assert.equal(core.indicatorCommon(core.migrateState(JSON.parse(JSON.stringify(s)))).indicatorHold.navigation,navigation);
  }
});
test('last visited page toggles, ignores same-page renders, resets on snapshot replacement',()=>{
  const s=core.migrateState({pages:[[],[],[],[],[]]});
  const tracker=core.createPageVisitTracker();
  s.page=4;tracker.observe(s);
  assert.equal(tracker.returnPrevious(s),false);
  s.page=0;tracker.observe(s);tracker.observe(s);
  assert.equal(tracker.returnPrevious(s),true);assert.equal(s.page,4);
  assert.equal(tracker.returnPrevious(s),true);assert.equal(s.page,0);
  s.pages[4]=core.blankPage();
  assert.equal(tracker.returnPrevious(s),false);
  const fresh=core.migrateState(JSON.parse(JSON.stringify(s)));
  tracker.observe(fresh);assert.equal(tracker.returnPrevious(fresh),false);
});
test('last visited folder restores nested pages and alternates distinct folders',()=>{
  const s=core.migrateState({pages:[[],[],[]]});
  const folder=s.pages[2][0]=core.createAction('folder');
  folder.children=Array(14).fill(null);folder.pages=[Array(14).fill(null)];folder.pageIndex=1;
  const nested=folder.pages[0][1]=core.createAction('folder');
  nested.children=Array(14).fill(null);nested.pages=[Array(14).fill(null)];nested.pageIndex=1;
  const tracker=core.createPageVisitTracker();
  s.page=2;s.folderPath=[0];tracker.observe(s);
  s.folderPath=[0,1];tracker.observe(s);
  s.page=0;s.folderPath=[];tracker.observe(s);
  folder.pageIndex=0;nested.pageIndex=0;
  assert.equal(tracker.returnPrevious(s,'folder-history'),true);
  assert.equal(s.page,2);assert.deepEqual(s.folderPath,[0,1]);
  assert.equal(folder.pageIndex,1);assert.equal(nested.pageIndex,1);
  assert.equal(tracker.returnPrevious(s,'folder-history'),true);assert.deepEqual(s.folderPath,[0]);
  assert.equal(tracker.returnPrevious(s,'folder-history'),true);assert.deepEqual(s.folderPath,[0,1]);
  assert.equal(tracker.returnPrevious(s,'history-back'),true);assert.deepEqual(s.folderPath,[0]);
  folder.pages[0][1]=core.createAction('folder');
  assert.equal(tracker.returnPrevious(s,'folder-history'),false);
});
test('history profile switches back and forth without changing saved profile contents',()=>{
  const s=core.migrateState(null),original=s.profileId;
  const other=core.createProfile(s,'Other');
  const tracker=core.createPageVisitTracker();tracker.observe(s);
  assert.equal(tracker.returnPrevious(s,'profile-history'),false);
  core.switchProfile(s,other);tracker.observe(s);
  assert.equal(tracker.returnPrevious(s,'profile-history'),true);assert.equal(s.profileId,original);
  assert.equal(tracker.returnPrevious(s,'profile-history'),true);assert.equal(s.profileId,other);
  core.deleteProfile(s,original);
  assert.equal(tracker.returnPrevious(s,'profile-history'),false);assert.equal(s.profileId,other);
});

test('indicator add and design are distinct, keep locations and artwork on reload, do not touch ordinary keys',()=>{
 const s=core.migrateState({pages:[[],[],[]]});
 const source=s.pages[1][4]=core.createAction('indicator');
 const existing=s.pages[0][3]=core.createAction('indicator');
 const other=s.pages[0][0]=core.createAction('hotkey');
 source.title='Source';source.settings.indicatorDownTitle='Pressed';
 source.icon={kind:'file',value:'data:image/png;base64,dGVzdA=='};
 source.settings.keyPressIcons={down:{kind:'file',value:'data:image/png;base64,dGVzdDI='}};
 source.settings.keyBackgrounds={default:{enabled:true,color:'#123456'}};
 source.settings.indicatorDownTitleStyle={...core.TITLE,color:'#abcdef'};
 existing.title='Existing';existing.settings.customFlag='keep';
 core.updateIndicatorCommon(s,source,{indicatorDown:{navigation:'home'},indicatorNumberStyle:{...core.INDICATOR_NUMBER_STYLE,color:'#200000'}});
 assert.equal(core.manageIndicators(s,'add',source,null).added,1);
 assert.equal(s.pages[0][3].title,'Existing');assert.equal(s.pages[0][3].icon,undefined);
 assert.equal(s.pages[2][0].icon.value,source.icon.value);
 assert.equal(core.manageIndicators(s,'design',source,null).updated,3);
 assert.equal(s.pages[0][3],existing);assert.equal(s.pages[0][0],other);
 assert.equal(existing.title,'Source');assert.equal(existing.settings.customFlag,'keep');
 assert.equal(existing.settings.keyPressIcons.down.value,source.settings.keyPressIcons.down.value);
 assert.notEqual(existing.settings.keyPressIcons,source.settings.keyPressIcons);
 assert.equal(existing.settings.keyBackgrounds.default.color,'#123456');
 assert.equal(existing.settings.indicatorDownTitle,'Pressed');
 assert.equal(core.indicatorCommon(s).indicatorDown.navigation,'home');
 const restored=core.migrateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.pages[0][3].icon.value,source.icon.value);
 assert.equal(restored.pages[2][0].settings.keyPressIcons.down.value,source.settings.keyPressIcons.down.value);
 assert.equal(core.indicatorCommon(restored).indicatorNumberStyle.color,'#200000');
 assert.equal(core.manageIndicators(restored,'remove',source,null).removed,3);
 assert.equal(restored.pages[0][0].type,'hotkey');
});
test('bare indicator number gets a visible outline only if foreground and background have low contrast',()=>{
 const dark={...core.INDICATOR_NUMBER_STYLE,color:'#200000',outlineWidth:'none'};
 const saved=JSON.stringify(dark);
 const corrected=core.indicatorNumberDisplayStyle(dark,'#08090c');
 assert.equal(corrected.color,dark.color);assert.equal(corrected.outlineColor,'#ffffff');
 assert.equal(corrected.outlineWidth,'medium');assert.equal(JSON.stringify(dark),saved);
 const light={...dark,color:'#ffffff'};
 assert.equal(core.indicatorNumberDisplayStyle(light,'#08090c'),light);
 assert.equal(core.indicatorNumberDisplayStyle(dark,'#08090c',true),dark);
 const hidden={...dark,visible:false};
 assert.equal(core.indicatorNumberDisplayStyle(hidden,'#08090c'),hidden);
 assert.equal(core.indicatorNumberDisplayStyle(light,'#eeeeee').outlineColor,'#000000');
});

test('D200X gesture probe keeps three selections without an executable action plan',()=>{
  const defaults=core.createAction('gesture-test');
  assert.deepEqual(defaults.settings,{single:'hotkey',double:'open-app',hold:'folder-shortcut',logEnabled:true});
  assert.deepEqual(core.planAction(defaults,0,1),{kind:'gesture-test'});
  defaults.settings.single='ha-toggle';
  defaults.settings.double='media';
  defaults.settings.hold='text';
  defaults.settings.logEnabled=false;
  const restored=core.cleanAction(JSON.parse(JSON.stringify(defaults)));
  assert.deepEqual(restored.settings,{single:'ha-toggle',double:'media',hold:'text',logEnabled:false});
  const invalid=core.cleanAction({type:'gesture-test',settings:{single:'multi',double:'bad',hold:null}});
  assert.deepEqual([invalid.settings.single,invalid.settings.double,invalid.settings.hold],
    ['hotkey','open-app','folder-shortcut']);
  const state=core.migrateState(null);state.pages[0][0]=defaults;
  assert.deepEqual(core.planHardwareEvent(state,{kind:1,index:0,pressed:true}).outcome,{kind:'gesture-test'});
});

test('1.1.94 ordinary key press slots keep the legacy action and discard unsafe nested types',()=>{
  const main=core.createAction('hotkey');main.settings.keys='Ctrl+S';
  const second=core.createAction('open-app');second.settings.app='C:\\Windows\\notepad.exe';
  const hold=core.createAction('goto');hold.settings.page=2;
  main.pressActions={double:second,hold};
  const original=JSON.stringify(main);
  const restored=core.cleanAction(JSON.parse(original));
  assert.equal(restored.settings.keys,'Ctrl+S');
  assert.equal(restored.pressActions.double.settings.app,'C:\\Windows\\notepad.exe');
  assert.equal(restored.pressActions.hold.settings.page,2);
  assert.equal(JSON.stringify(main),original);
  const state=core.migrateState(null);state.pages[0][0]=main;
  const migrated=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(migrated.pages[0][0].pressActions.double.type,'open-app');
  assert.equal(migrated.pages[0][0].pressActions.hold.type,'goto');
  assert.equal(core.cleanAction(core.createAction('hotkey')).pressActions,undefined);
  const forbidden=core.cleanAction({type:'hotkey',pressActions:{double:{type:'multi'},hold:{type:'sd-plugin'}}});
  assert.equal(forbidden.pressActions,undefined);
  const child=core.createAction('hotkey');child.pressActions={double:core.createAction('open-app')};
  const safe=core.cleanAction({type:'hotkey',pressActions:{hold:child}});
  assert.equal(safe.pressActions.hold.pressActions,undefined);
  assert.ok(core.PRESS_ACTION_TYPES.includes('ha-toggle'));
  assert.ok(core.PRESS_ACTION_TYPES.includes('profile'));
  for(const id of ['multi','multi-switch','random','logic','gesture-test','sd-plugin','folder','indicator'])
    assert.equal(core.PRESS_ACTION_TYPES.includes(id),false,id);
});
test('1.1.94 ordinary hardware dispatcher recognizes each gesture once without duplicate single',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
  const start=source.indexOf('const assignedKeyPresses=new Map();');
  const end=source.indexOf('// Generated local tones:',start);
  assert.ok(start>0&&end>start);
  const code=source.slice(start,end);
  const clock={value:0};let serial=0;
  const timers=new Map(),runs=[],logs=[];
  const schedule=(fn,delay)=>{const id=++serial;timers.set(id,{at:clock.value+delay,fn});return id;};
  const advance=ms=>{
    const end=clock.value+ms;
    while(true){
      const next=[...timers.entries()].filter(([,timer])=>timer.at<=end)
        .sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      clock.value=next[1].at;timers.delete(next[0]);next[1].fn();
    }
    clock.value=end;
  };
  const main=core.createAction('hotkey');
  main.pressActions={double:core.createAction('open-app'),hold:core.createAction('goto')};
  const fakeCore={runtimeActionKey:()=> 'key-0',visibleActions:()=>[main]};
  const handle=new Function('DeckCore','state','Date','setTimeout','clearTimeout','window',
    'pressEnabled','pressSlotAction','executeHardwareAction','executeSideNavigation','reportInputEvidence',
    'observeInputEvidence','makeAppControlTrace',
    code+';return handleAssignedKeyPress;')(
    fakeCore,{}, {now:()=>clock.value},schedule,id=>timers.delete(id),
    {d200xActionStatus(){}},
    (action,slot)=>action?.pressMeta?.enabled?.[slot]!==false,
    (action,slot)=>slot==='single'?(action.type==='press-empty'?null:action):action.pressActions?.[slot]||null,
    (event,preview,skip,selected,bypass)=>{
      assert.equal(preview,false);assert.equal(bypass,true);
      runs.push({gesture:selected===main?'single':selected===main.pressActions.double?'double':'hold',id:event.inputId});
      return '실행 요청';
    },()=>null,(event,stage,record)=>logs.push({id:event.inputId,stage,...record}),
    ()=>({then(){}}),()=>({})
  );
  handle(main,0,'down',{inputId:'s1'});advance(40);
  handle(main,0,'up',{inputId:'s2'});advance(300);
  handle(main,0,'down',{inputId:'d1'});advance(25);
  handle(main,0,'up',{inputId:'d2'});advance(100);
  handle(main,0,'down',{inputId:'d3'});advance(20);
  handle(main,0,'up',{inputId:'d4'});advance(310);
  handle(main,0,'down',{inputId:'h1'});advance(610);
  handle(main,0,'up',{inputId:'h2'});
  assert.deepEqual(runs,[
    {gesture:'single',id:'s2'},{gesture:'double',id:'d3'},{gesture:'hold',id:'h1'}
  ]);
  assert.deepEqual(logs.filter(x=>x.stage==='press-gesture').map(x=>x.outcome),
    ['single','double','hold']);
  assert.match(source,/!preview&&!bypassPressBindings&&index<13&&pressActionAssigned\(resolved\.action\)/);
  assert.match(source,/if\(resolved\.gesture==='down'&&!preview&&!bypassPressBindings\)/);
});
test('1.1.95 three separate action tabs preserve the existing icon regions and search clear',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const base=path.join(__dirname,'../app/streamdeck-editor');
  const editor=fs.readFileSync(path.join(base,'editor.js'),'utf8');
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
  assert.match(editor,/const PRESS_TABS=/);
  assert.match(editor,/function renderPressTabs\(root,inspector\)/);
  assert.match(editor,/function setPressSlot\(index,slot,next,immediate=false\)/);
  assert.match(editor,/renderPressTabs\(rootItem,root\)/);
  assert.match(editor,/function showPressDropOverlay\(index,key\)/);
  assert.match(editor,/function attachPressPreviewBadges\(root,inspector\)/);
  assert.match(editor,/press-image-representative/);
  assert.match(editor,/deck-key-press-number/);
  assert.doesNotMatch(editor,/className='press-tab-symbol'/);
  assert.doesNotMatch(editor,/className='press-tab-number'/);
  assert.match(editor,/pressMeta\.representative=activePressTab/);
  assert.match(editor,/pressMeta\.enabled\[slot\]=check\.checked/);
  assert.match(editor,/const item=pressIsOrdinary\(rootItem\)/);
  assert.match(editor,/layout\.append\(iconRegion,preview\)/);
  assert.match(css,/\.state-title-inspector \.state-title-layout\{/);
  assert.match(css,/\.press-tabs-grid/);
  assert.match(css,/\.press-drop-picker/);
  assert.match(html,/id="action-search-clear"/);
  assert.match(editor,/actionSearchClear\.hidden=!actionSearch\.value/);
  assert.match(editor,/actionSearch\.value='';updateActionSearch\(\);actionSearch\.focus\(\)/);
  assert.match(css,/\.library \.search #action-search-clear\[hidden\]\{display:none\}/);
});
test('1.1.95 slots retain disabled assignments and auto-selected representative after migration',()=>{
  const primary=core.createAction('hotkey');
  primary.settings.keys='Ctrl+S';
  primary.pressActions={double:core.createAction('open-app'),hold:core.createAction('goto')};
  primary.pressMeta={enabled:{single:false,double:false,hold:true},representative:'single'};
  const restored=core.cleanAction(JSON.parse(JSON.stringify(primary)));
  assert.equal(restored.pressMeta.enabled.single,false);
  assert.equal(restored.pressMeta.enabled.double,false);
  assert.equal(restored.pressMeta.enabled.hold,true);
  assert.equal(restored.pressMeta.representative,'single');
  assert.equal(restored.pressActions.double.type,'open-app');
  assert.equal(restored.pressActions.hold.type,'goto');
  const blank=core.createAction('press-empty');
  blank.pressMeta={enabled:{single:false,double:true,hold:false},representative:'single'};
  blank.pressActions={double:core.createAction('hotkey'),hold:null};
  const state=core.migrateState(null);
  state.pages[0][0]=blank;
  const migrated=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(migrated.pages[0][0].type,'press-empty');
  assert.equal(migrated.pages[0][0].pressActions.double.type,'hotkey');
  assert.equal(migrated.pages[0][0].pressMeta.enabled.single,false);
  assert.equal(core.planAction(blank,0,1).kind,'display-only');
  const untrusted=core.cleanAction({type:'hotkey',pressMeta:{enabled:{single:false,double:false,hold:false},representative:'invalid'}});
  assert.equal(untrusted.pressMeta.representative,'single');
});

test('Program Open legacy long-press option stays saved but is disabled when hold tab has an action',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
  const start=source.indexOf('function openAppLegacyHold(item){'),end=source.indexOf('function actionFields(item){',start);
  assert.ok(start>0&&end>start);
  const snippet=source.slice(start,end);
  const app=core.createAction('open-app');
  app.settings.hold='force';
  let selected=app;
  const select=(key,label)=>'<div><label>'+label+'</label><select data-field="'+key+'"></select></div>';
  const render=new Function('state','DeckCore','select','pressEnabled',snippet+';return openAppLegacyHold;')(
    {selected:0},{visibleActions:()=>[selected]},select,(root,slot)=>root?.pressMeta?.enabled?.[slot]!==false);
  const enabled=render(app);
  assert.match(enabled,/길게 누르기/);
  assert.doesNotMatch(enabled,/disabled/);
  app.pressActions={double:null,hold:core.createAction('hotkey')};
  const blocked=render(app);
  assert.match(blocked,/data-field="hold" disabled/);
  assert.match(blocked,/활성화된 길게 누르기 탭 동작이 우선/);
  assert.equal(app.settings.hold,'force','disable does not alter saved force setting');
  app.pressMeta={enabled:{single:true,double:true,hold:false},representative:'single'};
  assert.doesNotMatch(render(app),/disabled/,'unchecking hold restores primary Program Open option');
  app.pressActions.hold=null;
  assert.doesNotMatch(render(app),/disabled/,'removing explicit action re-enables legacy setting');
});

test('ordinary-key legacy Program Open hold and explicit hold action never run together',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
  const start=source.indexOf('const assignedKeyPresses=new Map();');
  const end=source.indexOf('// Generated local tones:',start);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  const app=core.createAction('open-app');
  app.settings.app='C:\\Apps\\demo.exe';
  app.settings.hold='force';
  app.pressMeta={enabled:{single:true,double:true,hold:true},representative:'single'};
  const close=[],executed=[];
  const make=new Function('DeckCore','state','Date','setTimeout','clearTimeout','window',
    'pressEnabled','pressSlotAction','executeHardwareAction','executeSideNavigation','reportInputEvidence',
    'observeInputEvidence','makeAppControlTrace',
    body+';return {runAssignedPress,legacyOpenAppHoldAvailable};')(
    {runtimeActionKey:()=> 'key-0',visibleActions:()=>[app]}, {},Date,()=>0,()=>{},
    {deckBridge:{closeLocalApp:(path,force)=>{close.push({path,force});return Promise.resolve();}},d200xActionStatus(){}},
    (action,slot)=>action?.pressMeta?.enabled?.[slot]!==false,
    (action,slot)=>slot==='single'?action:action.pressActions?.[slot]||null,
    (event,preview,skip,selected)=>{executed.push(selected.type);return '실행 요청';},
    ()=>null,()=>{},(event,promise)=>promise,()=>({}));
  assert.equal(make.legacyOpenAppHoldAvailable(app),true);
  make.runAssignedPress(app,0,'hold',{inputId:'legacy'});
  assert.deepEqual(close,[{path:app.settings.app,force:true}]);
  app.pressActions={double:null,hold:core.createAction('hotkey')};
  assert.equal(make.legacyOpenAppHoldAvailable(app),false);
  make.runAssignedPress(app,0,'hold',{inputId:'explicit'});
  assert.equal(close.length,1,'explicit action suppresses the legacy close');
  assert.deepEqual(executed,['hotkey']);
  app.pressMeta.enabled.hold=false;
  assert.equal(make.legacyOpenAppHoldAvailable(app),true);
  make.runAssignedPress(app,0,'hold',{inputId:'disabled'});
  assert.equal(close.length,2,'unchecked hold restores saved force close');
  assert.deepEqual(executed,['hotkey'],'disabled terminal must not execute');
  app.pressActions.hold=null;
  make.runAssignedPress(app,0,'hold',{inputId:'fallback'});
  assert.equal(close.length,3,'legacy force close resumes after hold action removal');
  app.settings.hold='none';
  assert.equal(make.runAssignedPress(app,0,'hold',{inputId:'none'}),null);
  assert.equal(close.length,3);
  assert.equal(executed.length,1);
});

test('Program Open hold settings are not silently converted when switching tabs',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
  const begin=source.indexOf('function pressEnsureMeta(root){');
  const end=source.indexOf('function attachPressPreviewBadges(',begin);
  const section=source.slice(begin,end);
  assert.doesNotMatch(section,/root\.settings\.hold='none'/);
  assert.doesNotMatch(section,/const closing=DeckCore\.createAction\('close'\)/);
  assert.match(section,/if\(slot!=='single'&&next\?\.type==='open-app'\)next\.settings\.hold='none'/);
  assert.match(source,/if\(holdAssigned\|\|legacyHold\)/);
});

test('page-number fixed gesture plan ignores legacy choices without destroying stored settings',()=>{
  const state=core.migrateState({pages:[[],[],[]]});
  const indicator=state.pages[1][0]=core.createAction('indicator');
  state.page=1;
  indicator.settings.indicatorDown={navigation:'next'};
  indicator.settings.indicatorHold={navigation:'editor-open'};
  assert.deepEqual(core.fixedIndicatorNavigation('single'),{navigation:'home'});
  assert.deepEqual(core.fixedIndicatorNavigation('double'),{navigation:'history-back'});
  assert.deepEqual(core.fixedIndicatorNavigation('hold'),{navigation:'profile-history'});
  assert.deepEqual(core.planFixedIndicatorNavigation(state,0,'single'),{kind:'home'});
  assert.deepEqual(core.planFixedIndicatorNavigation(state,0,'double'),{kind:'history-back'});
  assert.deepEqual(core.planFixedIndicatorNavigation(state,0,'hold'),{kind:'profile-history'});
  assert.equal(core.planFixedIndicatorNavigation(state,1,'single'),null);
  assert.deepEqual(core.planIndicatorNavigation(state,0),{kind:'page',page:2},'old profile choice retained in data');
  const restored=core.migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.pages[1][0].settings.indicatorHold.navigation,'editor-open');
  assert.deepEqual(core.planFixedIndicatorNavigation(restored,0,'hold'),{kind:'profile-history'});
});

test('fixed page-number UI shows three read-only actions and leaves other controls unmodified',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const start=source.indexOf('function renderFixedIndicatorBindings(root){');
 const end=source.indexOf('function renderSideBindings(',start);
 assert.ok(start>0&&end>start);
 const ui=source.slice(start,end);
 assert.match(ui,/\['single','한 번 누르기'\]/);
 assert.match(ui,/\['double','두 번 누르기'\]/);
 assert.match(ui,/\['hold','길게 누르기'\]/);
 assert.match(ui,/value\.readOnly=true/);
 assert.doesNotMatch(ui,/\.addEventListener\('change'/);
 assert.match(source,/renderFixedIndicatorBindings\(fields\);/);
 assert.match(source,/renderSideBindings\(root,index,binding/);
 assert.match(source,/DeckCore\.planFixedIndicatorNavigation\(state,index,gesture\)/);
 assert.match(source,/index<13&&\(resolved\.action\?\.type==='indicator'\|\|fixedIndicatorPresses\.has\(index\)\)/);
});

test('fixed page-number recognizer distinguishes single, double and hold without touching side gestures',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const start=source.indexOf('const fixedIndicatorPresses=new Map();');
 const end=source.indexOf('function handleSideNavigationInput(',start);
 assert.ok(start>0&&end>start);
 const clock={time:0};const timers=new Map();let seq=0;
 const delay=(fn,ms)=>{const id=++seq;timers.set(id,{when:clock.time+ms,fn});return id;};
 const cancel=id=>timers.delete(id);
 const advance=ms=>{
   const until=clock.time+ms;
   while(true){
     const next=[...timers.entries()].filter(([,x])=>x.when<=until).sort((a,b)=>a[1].when-b[1].when)[0];
     if(!next)break;
     clock.time=next[1].when;timers.delete(next[0]);next[1].fn();
   }
   clock.time=until;
 };
 const indicator=core.createAction('indicator');
 const state={profileId:'A',page:0,folderPath:[]};const calls=[];
 const handle=new Function('DeckCore','state','setTimeout','clearTimeout','Date','executeSideNavigation','window',
   source.slice(start,end)+';return handleFixedIndicatorInput;')(
   {visibleActions:()=>[indicator],SIDE_HOLD_MS:650},
   state,delay,cancel,{now:()=>clock.time},
   (index,gesture)=>{calls.push(gesture);return gesture;},{d200xActionStatus(){}});
 handle(0,'down',{inputId:'a'},false);advance(40);handle(0,'up',{inputId:'a'},false);
 advance(299);assert.deepEqual(calls,[]);
 advance(1);assert.deepEqual(calls,['single']);
 handle(0,'down',{inputId:'b'},false);advance(40);handle(0,'up',{inputId:'b'},false);
 advance(120);handle(0,'down',{inputId:'c'},false);advance(40);handle(0,'up',{inputId:'c'},false);
 assert.deepEqual(calls,['single','double']);advance(400);assert.equal(calls.length,2);
 handle(0,'down',{inputId:'d'},false);advance(650);assert.deepEqual(calls,['single','double','hold']);
 handle(0,'up',{inputId:'d'},false);advance(350);assert.equal(calls.length,3);
 // A pending short press is discarded when the active profile changes.
 handle(0,'down',{inputId:'e'},false);advance(30);handle(0,'up',{inputId:'e'},false);
 state.profileId='B';advance(310);assert.equal(calls.length,3);
});

test('unchecked Program Open hold consumes release and invokes legacy close/force/none',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const body=source.slice(source.indexOf('const assignedKeyPresses=new Map();'),source.indexOf('// Generated local tones:'));
 const app=core.createAction('open-app');
 app.settings.app='C:\\Apps\\BatchRenamer.exe';
 app.pressActions={double:core.createAction('open-app'),hold:core.createAction('terminal')};
 app.pressMeta={enabled:{single:true,double:true,hold:false},representative:'single'};
 const timers=new Map(),close=[],executed=[];
 let clock=0,serial=0;
 const make=new Function('DeckCore','state','Date','setTimeout','clearTimeout','window',
   'pressEnabled','pressSlotAction','executeHardwareAction','executeSideNavigation','reportInputEvidence',
   'observeInputEvidence','makeAppControlTrace',
   body+';return {handleAssignedKeyPress,runAssignedPress};');
 const router=make({runtimeActionKey:()=> 'slot-0',visibleActions:()=>[app]}, {},{now:()=>clock},
   (fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},id=>timers.delete(id),
   {deckBridge:{closeLocalApp:(target,force)=>{close.push({target,force});return Promise.resolve();}},d200xActionStatus(){}},
   (item,slot)=>item?.pressMeta?.enabled?.[slot]!==false,
   (item,slot)=>slot==='single'?item:item.pressActions?.[slot]||null,
   (_event,_preview,_skip,action)=>{executed.push(action.type);return 'dispatched';},
   ()=>null,()=>{},(event,promise)=>promise,()=>({}));
 for(const [mode] of [['close'],['force'],['none']]){
   app.settings.hold=mode;
   router.handleAssignedKeyPress(app,0,'down',{inputId:mode});
   assert.equal(timers.size,1);
   const pending=[...timers.values()][0];
   assert.equal(pending.ms,650);
   clock+=650;pending.fn();
   router.handleAssignedKeyPress(app,0,'up',{inputId:mode});
 }
 assert.deepEqual(close,[{target:app.settings.app,force:false},{target:app.settings.app,force:true}]);
 assert.deepEqual(executed,[],'long press cannot fall through to the single-press app or terminal');
 app.pressMeta.enabled.hold=true;app.settings.hold='force';
 router.handleAssignedKeyPress(app,0,'down',{inputId:'explicit'});
 const active=[...timers.values()][0];
 assert.equal(active.ms,600);
 active.fn();router.handleAssignedKeyPress(app,0,'up',{inputId:'explicit'});
 assert.deepEqual(executed,['terminal'],'re-enabled hold resumes the saved terminal');
 assert.equal(close.length,2,'re-enabled hold suppresses legacy close');
});


test('Fusion smart profiles match exact workspace/tab and do not override manual choice in stable context',()=>{
 const s=core.migrateState(null),workspace=core.createProfile(s,'Design'),tab=core.createProfile(s,'Sketch');
 assert.equal(core.setProfileFusionScope(s,workspace,{workspace:'DesignWorkspace'}),true);
 assert.equal(core.setProfileFusionScope(s,tab,{workspace:'DesignWorkspace',tab:'SketchTab'}),true);
 assert.equal(core.setProfileFusionScope(s,tab,{workspace:'DesignWorkspace'}),false);
 const t=core.createSmartProfileTracker(),ctx={pid:5,appPath:'C:\\Fusion.exe',fusion:{status:'ready',workspace:'DesignWorkspace',tab:'SketchTab'}};
 assert.equal(t.observe(s,ctx),null);assert.equal(t.observe(s,ctx),tab);
 assert.equal(core.switchProfile(s,tab),true);assert.equal(core.switchProfile(s,'default'),true);
 assert.equal(t.observe(s,ctx),null);
 const change={...ctx,fusion:{...ctx.fusion,tab:'SolidTab'}};
 assert.equal(t.observe(s,change),null);assert.equal(t.observe(s,change),workspace);
 core.switchProfile(s,workspace);
 assert.equal(t.observe(s,{...ctx,fusion:{status:'unavailable',pid:5}}),null);
 assert.equal(t.observe(s,{...ctx,fusion:null}),null);
 assert.equal(t.observe(s,null),null);
 const persisted=core.migrateState(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(persisted.profileNames.find(p=>p.id===tab).fusionScope,{workspace:'DesignWorkspace',tab:'SketchTab'});
 assert.equal(core.matchFusionProfile(persisted,ctx.fusion),tab);
 assert.equal(core.matchForegroundProfile(persisted,'C:\\Fusion.exe'),null);
});
