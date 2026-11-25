'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const B=require('../app/deckforge-editor/fusion-batch.js');
const MCP=require('../tools/fusion-mcp/server.cjs');
const Core=require('../app/deckforge-editor/deck-core.js');
const fixture=[{id:'Extrude',name:'돌출'},{id:'SaveCommand',name:'저장'},
  {id:'UndoCommand',name:'실행 취소'}];

test('MCP discovers running Fusion local-only endpoint',async()=>{
  const loc=await MCP.findEndpoint({env:{LOCALAPPDATA:'C:/Local'},readFile:async()=>JSON.stringify({status:'running',port:59237})});
  assert.equal(loc,'http://127.0.0.1:59237');
  await assert.rejects(MCP.findEndpoint({readFile:async()=>JSON.stringify({status:'stopped',port:59237})}),/실행되지/);
});
test('MCP searches real Fusion add-in HTTP protocol',async()=>{
  const xs=await MCP.catalogue('extrude',true,{discovery:async()=> 'http://127.0.0.1:59237',
    fetcher:async u=>{
      assert.equal(u.hostname,'127.0.0.1');
      assert.equal(u.searchParams.get('q'),'extrude');
      return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({ok:true,commands:fixture})};
    }});
  assert.equal(xs.length,3);
});
test('Command batch exports a new profile plan without modifying any existing D200X profile',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'fusion-batch-'));
  try{
    const menuFixture=[{id:'DrawPolyline',name:'선'}, {id:'SketchMidpointLine',name:'중간점 선'},
      {id:'InternalOnly',name:'내부 명령'}];
    const out=await MCP.exportBatch({command_ids:['SketchMidpointLine','DrawPolyline'],profile_name:'Fusion 매크로'},
      {getCommands:async()=>menuFixture,env:{D200X_FUSION_BATCH_DIR:tmp},now:new Date('2026-11-15T00:00:00Z')});
    const raw=JSON.parse(await fs.readFile(out.path,'utf8'));
    assert.equal(out.count,2);assert.deepEqual(raw.commands.map(c=>c.id),['DrawPolyline','SketchMidpointLine']);
    const state=Core.migrateState(null);
    const previous=JSON.stringify(state);
    const result=B.apply(state,raw,Core);
    assert.equal(result.pageCount,1);
    assert.equal(state.pages[0][0].settings.pluginSettings.commandId,'DrawPolyline');
    assert.equal(state.pages[0][1].settings.pluginSettings.name,'중간점 선');
    assert.equal(state.profileNames.length,2);
    assert.equal(state.inactiveProfiles.find(p=>p.id==='default').pages[0][0],null);
    assert.notEqual(JSON.stringify(state),previous);
    await assert.rejects(MCP.exportBatch({command_ids:['DrawPolyline']},
      {getCommands:async()=>menuFixture,env:{D200X_FUSION_BATCH_DIR:tmp},now:new Date('2026-11-15T00:00:00Z')}),/EEXIST/);
  }finally{await fs.rm(tmp,{force:true,recursive:true});}
});
test('only captured menu IDs are exportable; duplicate placements collapse and names do not drive identity',()=>{
  const live=[{id:'SurfaceExtrude',name:'돌출'}, {id:'Extrude',name:'돌출'},
    {id:'DrawPolyline',name:'선'},{id:'InternalOnly',name:'내부 명령'}];
  const allowed=MCP.menuCommands(live);
  assert.ok(allowed.some(x=>x.id==='DrawPolyline'));
  assert.ok(allowed.some(x=>x.id==='Extrude'));
  assert.ok(allowed.some(x=>x.id==='SurfaceExtrude'));
  assert.ok(!allowed.some(x=>x.id==='InternalOnly'));
  assert.equal(new Set(allowed.map(x=>x.id)).size,allowed.length);
  assert.deepEqual(MCP.selectMenuCommands(live,{all:true}).map(x=>x.id),
    allowed.map(x=>x.id));
  assert.throws(()=>MCP.selectMenuCommands(live,{command_ids:['InternalOnly']}),/메뉴에 없거나/);
});
test('Batch preserves existing assignments and spreads 15 commands over two pages',()=>{
  const state=Core.migrateState(null);
  state.pages[0][0]=Core.createAction('hotkey');
  const cmds=Array.from({length:15},(_,i)=>({id:'command'+i,name:'명령 '+i}));
  const result=B.apply(state,{format:B.FORMAT,pluginUUID:B.PLUGIN,actionUUID:B.ACTION,
    profileName:'Fusion',commands:cmds},Core);
  assert.equal(result.pageCount,2);
  assert.equal(state.pages[0][13],null,'wide information display must remain unassigned');
  assert.equal(state.pages[1][0].settings.pluginSettings.commandId,'command13');
  assert.equal(state.inactiveProfiles.find(p=>p.id==='default').pages[0][0].type,'hotkey');
});
test('Invalid, duplicate and excessive command batches rejected',()=>{
  const raw={format:B.FORMAT,pluginUUID:B.PLUGIN,actionUUID:B.ACTION,
    profileName:'Fusion',commands:[fixture[0],fixture[0]]};
  assert.throws(()=>B.validate(raw),/중복/);
  assert.throws(()=>B.validate({...raw,commands:[]}),/올바른/);
  assert.throws(()=>B.validate({...raw,commands:[{id:'../unsafe\n',name:'bad'}]}),/형식/);
});
test('MCP exposes read-only list and safe export tools',async()=>{
  const init=await MCP.dispatch({jsonrpc:'2.0',id:1,method:'initialize'});
  assert.equal(init.result.serverInfo.name,'d200x-fusion-bulk');
  const listed=await MCP.dispatch({jsonrpc:'2.0',id:2,method:'tools/list'});
  assert.deepEqual(listed.result.tools.map(x=>x.name),['fusion_list_commands','fusion_export_batch']);
});
