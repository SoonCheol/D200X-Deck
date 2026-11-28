'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReader,resolvePage,emptySlots,action,logRecord,validate}=require('../app/deckforge-editor/ai/read-tools.cjs');
const {chat,cleanHistory}=require('../app/deckforge-editor/ai/responses.cjs');
const Core=require('../app/deckforge-editor/deck-core.js');
const empty=()=>Array(19).fill(null);
const query=(section,extra={})=>({section,profile:null,page:null,folder:null,query:null,offset:null,...extra});
const fixture=()=>{
  const state=Core.migrateState(null),page=state.pages[0];
  state.profileNames=[{id:'default',name:'Work'},{id:'aux',name:'Other'}];
  state.profileId='default';state.inactiveProfiles=[{id:'aux',pages:[empty()],page:0}];
  page[0]={type:'folder',title:'Test Folder',children:[{type:'hotkey',title:'Copy',settings:{keys:'Ctrl+C'}}],pages:[[null,{type:'text',settings:{body:'DO_NOT_SEND_BODY'}}]],pageIndex:1};
  state.pinned[2]={type:'open-app',title:'Editor',settings:{app:'C:\\Private\\Editor.exe',args:'DO_NOT_SEND_ARGS',preventDuplicate:true}};
  state.controls.global[2].down={type:'hotkey',title:'Paste',settings:{keys:'Ctrl+V'}};
  state.folderPath=[0];return state;
};
const opts=(state,overrides={})=>({root:'unused',userData:'unused',readState:async()=>state,
  view:async()=>({profileNumber:1,page:1,dirty:true}),device:async()=>({connected:true}),
  inputs:()=>[{index:1,pressed:true},{index:17,gesture:'left'}],ha:async()=>({configured:true,entities:[{entity_id:'light.room',name:'Room',state:'on',token:'DO_NOT_SEND_TOKEN'}]}),
  fusion:async()=>true,apps:async()=>[{name:'Notepad',appId:'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'}],
  icons:async()=>({packs:[{name:'Pack',source:'installed',icons:[{name:'Light',tags:['light']},{name:'Fan',tags:['fan']}]}],warnings:[]}),
  plugins:async()=>[{name:'Plugin',uuid:'org.test',actions:[{name:'Action',uuid:'org.test.action'}]}],...overrides});
test('saved root, pinned fallback, controls, other profile, current and explicit folders are read-only',()=>{
  const state=fixture(),before=JSON.stringify(state);
  const root=resolvePage(state,query('page'));
  assert.equal(root.keys[0].action.folderPages,2);assert.equal(root.keys[2].pinned,true);assert.equal(root.keys[2].action.target,'Editor.exe');
  assert.equal(root.controls[2].down.keys,'Ctrl+V');assert.equal(root.keys.length,14);
  assert.equal(resolvePage(state,query('page',{profile:2})).profile,'Other');
  assert.equal(resolvePage(state,query('page',{folder:'1:1'})).keys[0].action.keys,'Ctrl+C');
  assert.equal(resolvePage(state,query('page',{folder:'current'})).keys[1].action.configured,true);
  assert.equal(resolvePage(state,query('page',{folder:'2:1'})).error,'folder_not_found');
  assert.equal(JSON.stringify(state),before);
});
test('private settings, image bytes, full paths and raw log strings never projected',()=>{
  const a=action({type:'sd-plugin',title:'token=SECRET',icon:{kind:'file',value:'DO_NOT_SEND_ICON'},settings:{pluginUUID:'org.test',actionUUID:'org.test.action',pluginSettings:{secret:'DO_NOT_SEND_SECRET'}}});
  const root=resolvePage(fixture(),query('page'));
  const row=logRecord({at:'2026-11-20T00:00:00.000Z',traceId:'test',stage:'ipc-result',error:'DO_NOT_SEND_ERROR',path:'DO_NOT_SEND_PATH',result:{status:'missing',steps:[{stage:'matched',pid:42,reason:'exe-path',detail:'DO_NOT_SEND_DETAIL'}]}});
  assert.equal(a.title,'[숨김]');assert.equal(root.keys[2].action.hasArgs,true);assert.equal(row.status,'missing');assert.equal(row.error,true);
  const data=JSON.stringify({a,root,row});assert.equal(data.includes('DO_NOT_SEND'),false);assert.equal(data.includes('Private'),false);
});
test('strict bounds reject unexpected keys, traversal and unbounded query',()=>{
  assert.throws(()=>validate(query('page',{folder:'../secret'})));
  assert.throws(()=>validate(query('read_file')));
  assert.throws(()=>validate({...query('device'),path:'C:\\test'}));
  assert.throws(()=>validate(query('page',{page:129})));
  assert.throws(()=>validate(query('icons',{query:'x'.repeat(101)})));
});
test('session reuses local reads, labels data source, filters and paginates',async()=>{
  let reads=0,appReads=0;const state=fixture();
  const inspect=createReader(opts(state,{readState:async()=>{reads++;return state;},apps:async()=>{appReads++;return [{name:'Notepad'},{name:'Paint'}];}}))();
  const profiles=await inspect(query('profiles'));assert.equal(profiles.total,2);assert.equal(profiles.liveView.dirty,true);
  const page=await inspect(query('page',{query:'copy'}));assert.equal(page.filtered,true);assert.equal(reads,1);
  assert.equal((await inspect(query('start_apps',{query:'note'}))).total,1);
  assert.equal((await inspect(query('start_apps',{query:'paint'}))).total,1);assert.equal(appReads,1);
  assert.equal((await inspect(query('icons',{query:'fan'}))).items[0].name,'Fan');
  assert.equal((await inspect(query('ha'))).items[0].state,'on');
  assert.equal(JSON.stringify(await inspect(query('ha'))).includes('DO_NOT_SEND_TOKEN'),false);
  assert.equal((await inspect(query('fusion'))).available,true);
  assert.equal((await inspect(query('device'))).connected,true);
  assert.equal((await inspect(query('recent_inputs'))).items[0].index,17);
  assert.equal((await inspect(query('page',{page:128}))).ok,false);
});
test('bounded recent history and no leading assistant',()=>{
  const messages=Array.from({length:16},(_,i)=>({role:i%2?'assistant':'user',content:'m'+i}));messages.push({role:'user',content:'last'});
  const h=cleanHistory(messages);assert.ok(h.length<=8);assert.equal(h[0].role,'user');assert.equal(h.at(-1).content,'last');
});
const events=(...items)=>new Response(items.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''),{status:200});
const complete=output=>({type:'response.completed',response:{status:'completed',output,usage:{input_tokens:12,output_tokens:4,total_tokens:16}}});
const call=(id,name,args)=>({type:'function_call',namespace:'deckforge',name,call_id:id,arguments:JSON.stringify(args)});
const base={token:'mock',model:'mock',messages:[{role:'user',content:'test'}],version:'1.1.44'};
test('read mode executes distinct queries once, aggregates API usage and has a hard round limit',async()=>{
  let requests=0,reads=0;const result=await chat({...base,readOnly:true,inspect:async()=>({connected:true,read:++reads}),fetcher:async(url,opts)=>{
    const req=JSON.parse(opts.body);assert.equal(req.store,false);
    assert.equal(req.tools[0].tools[1].name,'inspect');
    if(++requests===1)return events(complete([call('c1','inspect',query('device')),call('c2','inspect',query('device'))]));
    const outputs=req.input.filter(x=>x.type==='function_call_output');assert.equal(outputs.length,2);assert.equal(JSON.parse(outputs[0].output).connected,true);assert.equal(JSON.parse(outputs[1].output).error,'duplicate_query_already_returned');
    return events({type:'response.output_text.delta',delta:'ok'},complete([]));
  }});
  assert.equal(reads,1);assert.equal(result.requests,2);assert.equal(result.toolCalls,2);assert.equal(result.usage.total_tokens,32);
  let count=0;
  await assert.rejects(chat({...base,readOnly:true,inspect:async()=>({ok:true}),fetcher:async()=>events(complete([call('c'+(++count),'inspect',query('device'))]))}),/횟수/);
  assert.equal(count,3);
});
test('off mode, unknown functions and malformed batches never touch local data',async()=>{
  let reads=0,inspect=async()=>{reads++;return {};};
  await assert.rejects(chat({...base,inspect,fetcher:async()=>events(complete([call('c1','inspect',query('device'))]))}),/횟수/);
  await assert.rejects(chat({...base,readOnly:true,inspect,fetcher:async()=>events(complete([call('c1','inspect',query('device')),call('c2','run_shell',{})]))}),/허용되지 않은/);
  await assert.rejects(chat({...base,readOnly:true,inspect,fetcher:async()=>events(complete([call('c1','inspect',query('read_file'))]))}),/인자/);
  assert.equal(reads,0);
});

test('app log safely projects exact package diagnostics and never raw details',()=>{
  const row=logRecord({traceId:'trace-1',version:'1.1.48',stage:'focus-result',mode:'Focus',
    spec:{kind:'AppID',target:'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'},result:{status:'running-gui',details:[
      'running-pid=34264 subsystem=0 no-eligible-window','package-pid=34264 verified=true','cloaked=2',
      'policy-pid=34264 path=missing decision=allow reason=verified-package',
      'policy-pid=7 path=available decision=block reason=shared-host','policy-pid=8 path=missing decision=allow reason=DO_NOT_SEND',
      'window-reason=app-cloaked-packaged','shortcut=C:\\Private\\DO_NOT_SEND.exe','activation: DO_NOT_SEND',
      'running-pid=7 subsystem=0 no-eligible-window DO_NOT_SEND','package-pid=4294967296 verified=true']}});
  assert.equal(row.target,'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App');
  assert.equal(row.trace,'trace-1');assert.equal(row.specKind,'AppID');
  assert.deepEqual(row.running,[{pid:34264,subsystem:0,noEligibleWindow:true}]);
  assert.deepEqual(row.packages,[{pid:34264,verified:true}]);
  assert.deepEqual(row.policy,[{pid:34264,pathAvailable:false,decision:'allow',reason:'verified-package'},{pid:7,pathAvailable:true,decision:'block',reason:'shared-host'}]);
  assert.deepEqual(row.cloaked,[2]);assert.deepEqual(row.windowReasons,['app-cloaked-packaged']);
  assert.equal(logRecord({spec:{kind:'EXE',target:'C:\\Private\\Editor.exe'}}).target,'Editor.exe');
  assert.ok(!JSON.stringify(row).includes('DO_NOT_SEND'));assert.ok(!JSON.stringify(row).includes('Private'));
  assert.equal(logRecord({spec:{kind:'EditorHwnd',target:'123:456'}}).target,undefined);
});

test('all root empty slots in one bounded query, pinned and physical keys excluded',async()=>{
  const s=fixture();
  s.pages=[Array(19).fill({type:'hotkey'}),empty(),empty()];
  s.page=0;s.pages[1][0]={type:'text',settings:{body:'DO_NOT_SEND_BODY'}};
  s.pages[2][12]={type:'hotkey'};
  const before=JSON.stringify(s),r=await createReader(opts(s))()(query('empty_slots'));
  assert.equal(r.ok,true);assert.equal(r.currentPage,1);assert.equal(r.pageCount,3);
  assert.deepEqual(r.pages[0],{page:2,slots:[2,4,5,6,7,8,9,10,11,12,13]});
  assert.deepEqual(r.pages[1],{page:3,slots:[1,2,4,5,6,7,8,9,10,11,12]});
  assert.equal(r.emptyCount,22);assert.equal(JSON.stringify(s),before);
  assert.equal(JSON.stringify(r).includes('DO_NOT_SEND'),false);
  assert.throws(()=>validate(query('empty_slots',{profile:2})));
  assert.throws(()=>validate(query('empty_slots',{folder:'current'})));
  assert.deepEqual(validate(validate(query('empty_slots'))),validate(query('empty_slots')));
  s.pages=Array.from({length:128},empty);
  assert.ok(JSON.stringify(emptySlots(s)).length<12000);
  assert.equal(emptySlots(s).pageCount,128);
  s.pages=[Array(19).fill({type:'hotkey'})];assert.equal(emptySlots(s).emptyCount,0);
});
test('known Fusion ID on another page uses one inventory call, one proposal, three requests',async()=>{
  const s=fixture();s.pages=[empty(),Array(19).fill({type:'hotkey'}),empty()];s.page=1;
  const inspect=createReader(opts(s))();
  let n=0,proposals=0;
  const result=await chat({...base,readOnly:true,editMode:true,inspect,
    propose:async raw=>{proposals++;assert.equal(raw.advanced.page,1);
      assert.equal(raw.advanced.slot,1);assert.equal(JSON.parse(raw.advanced.configJson).id,'CircleCenterRadius');
      return {ok:true,previewReady:true,applied:false};},
    fetcher:async(_url,o)=>{
      const body=JSON.parse(o.body);n++;
      assert.match(body.instructions,/empty_slots/);
      if(n===1)return events(complete([call('slots','inspect',query('empty_slots'))]));
      if(n===2){const r=JSON.parse(body.input.find(x=>x.call_id==='slots'&&x.type==='function_call_output').output);
        assert.equal(r.currentPage,2);assert.equal(r.pages[0].page,1);assert.equal(r.pages[0].slots[0],1);
        return events(complete([call('proposal','propose_advanced',{kind:'plugin',page:1,folder:null,slot:1,configJson:JSON.stringify({kind:'fusion-live',id:'CircleCenterRadius',title:'원'})})]));}
      assert.match(body.instructions,/FINAL RESPONSE ROUND/);
      return events({type:'response.output_text.delta',delta:'미리보기 준비'},complete([]));
    }});
  assert.equal(result.requests,3);assert.equal(result.toolCalls,2);assert.equal(proposals,1);
});

test('empty inventory keeps current nested folder slots distinct from root slots',()=>{
 const s=fixture();s.pages=[empty()];s.page=0;
 const folder={type:'folder',children:empty(),pages:[],pageIndex:0};folder.children[2]={type:'hotkey'};
 s.pages[0][1]=folder;s.folderPath=[1];
 const result=emptySlots(s);
 assert.equal(result.currentFolder.folder,'2:1');assert.equal(result.currentFolder.slots.includes(3),false);
 assert.equal(result.currentFolder.slots.includes(4),true);
});

test('user template inventory exposes names and page counts only, never action settings or icon bytes',async()=>{
 const s=fixture();
 s.pages[0][0]=Core.createAction('text');s.pages[0][0].settings.body='DO_NOT_SEND_TEMPLATE_TEXT';
 const saved=Core.saveProfileTemplate(s,s.profileId,'My template').next;
 const inspect=createReader(opts(saved))();
 const result=await inspect(query('user_templates',{query:'My template'}));
 assert.equal(result.ok,true);assert.equal(result.total,1);assert.deepEqual(result.items,[{name:'My template',pageCount:s.pages.length}]);
 assert.equal(JSON.stringify(result).includes('DO_NOT_SEND_TEMPLATE_TEXT'),false);
});

test('plugin management audit reports actual results and safe metadata via inspect plugin_log',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {createPluginAudit}=require('../app/deckforge-editor/plugin-audit.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-plugin-audit-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const plugin={id:'com.deckforge.native.test',name:'DeckForge 테스트용',version:'1.0.0'};
 const run=createPluginAudit({userData:root,appVersion:'1.1.220'});
 await run('install',null,async a=>{a.identify(plugin);a.stage('execute');return {...plugin,token:'DO_NOT_SEND_TOKEN'};});
 await run('install',plugin.id,async a=>{a.identify(plugin);a.identify({currentVersion:'1.0.0',nextVersion:'1.1.0'});a.operation('update');a.stage('confirm');return null;});
 await run('remove',plugin.id,async a=>{a.identify(plugin);a.mode('keepData');a.stage('execute');return {id:plugin.id,mode:'keepData'};});
 await run('restore',plugin.id,async a=>{a.identify(plugin);a.stage('execute');return plugin;});
 await run('purge',plugin.id,async a=>{a.identify(plugin);a.mode('purge');a.stage('execute');return {id:plugin.id,status:'incomplete',deleted:2,total:3};});
 await assert.rejects(run('purge',plugin.id,async a=>{a.identify(plugin);throw Error('revision changed https://private.test/?token=DO_NOT_SEND_TOKEN');}),/revision changed/);
 const text=await fs.readFile(path.join(root,'diagnostics','plugin-management.jsonl'),'utf8');
 assert.doesNotMatch(text,/DO_NOT_SEND_TOKEN|private\.test/);
 const inspect=createReader(opts(fixture(),{userData:root}))();
 const result=await inspect(query('plugin_log',{query:'테스트용'}));
 assert.equal(result.ok,true);assert.equal(result.total,6);
 assert.deepEqual(result.items.map(x=>x.status),['failed','incomplete','success','success','cancelled','success']);
 assert.equal(result.items[0].reason,'revision_changed');
 assert.equal(result.items[1].deleted,2);assert.equal(result.items[1].total,3);
 assert.equal(result.items[4].operation,'update');assert.equal(result.items[4].previousVersion,'1.0.0');
 assert.equal(result.items[4].pluginVersion,'1.1.0');
 assert.equal(result.items[5].deckForgeVersion,'1.1.220');
 assert.equal((await inspect(query('plugin_log',{query:'unknown'}))).total,0);
});

test('USB log exposes only structured transfer evidence, not raw detail or claimed screen success',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-usb-log-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const records=[{type:'key-trial',incremental:true,session:0},{type:'page-sent',session:1,slots:14,zipBytes:12000,wideMode:'blank',cached:false,incremental:false},{type:'key-sent',session:1,slot:5,slots:1,zipBytes:900,wideMode:'blank',incremental:true}];
 await fs.writeFile(path.join(root,'d200x-connection.log'),records.map(r=>JSON.stringify({...r,at:'2026-11-24T16:00:00.000Z',detail:'PRIVATE_PATH_TOKEN',ack:true})).join('\n')+'\n');
 const inspect=createReader(opts(fixture(),{userData:root}))();
 const result=await inspect(query('usb_log'));
 assert.equal(result.ok,true);assert.equal(result.total,3);
 assert.equal(result.items[0].stage,'key-sent');assert.equal(result.items[0].slot,6);
 assert.equal(result.items[0].zipBytes,900);assert.equal(result.items[1].slots,14);
 assert.equal(result.items[1].zipBytes,12000);assert.equal(result.items[2].incremental,true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PATH_TOKEN|"ack"/);
});
