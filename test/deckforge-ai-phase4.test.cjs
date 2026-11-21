'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../app/streamdeck-editor/deck-core.js');
const A=require('../app/streamdeck-editor/ai/advanced-plan.js');
const MD=require('../app/streamdeck-editor/ai/markdown.js');
const {chat}=require('../app/streamdeck-editor/ai/responses.cjs');
const req=(kind,c,extra={})=>({kind,page:null,folder:null,slot:null,configJson:JSON.stringify(c),...extra});
function fixture(){const s=Core.migrateState(null);s.pages[0][1]=Core.createAction('folder');s.pages[0][1].children=Array(14).fill(null);s.pages[0][1].pages=[];s.pages[0][1].children[0]=Core.createAction('hotkey');s.pages[0][1].children[0].settings.keys='Ctrl+A';s.pages[0][4]=Core.createAction('sd-plugin');s.pages[0][4].settings.pluginUUID='com.autodesk.fusionstreamdeck';s.pages[0][4].settings.actionUUID='com.autodesk.fusionstreamdeck.runcommand';s.pages[0][4].settings.pluginSettings={commandId:'VerifiedCommand',name:'Verified'};s.pinned[8]=Core.createAction('indicator');return s;}
test('folder copy-on-write, target resolution, child app, add page, protected slots',()=>{
 const s=fixture(),before=JSON.stringify(s),plugin=s.pages[0][4],oldControl=s.controls;
 const q=req('folder_keys',{keys:[{slot:1,op:'update',value:'Ctrl+C'},{slot:2,op:'put',type:'open-app',value:'App.Name',title:'App'},{slot:3,op:'put',type:'folder',title:'Nested'}]},{folder:'2:1'});
 assert.deepEqual(A.folderTargetTypes(s,q),['hotkey','open-app','folder']);
 const p=A.makePlan(s,q,{targets:[null,{type:'open-app',requested:'App.Name',path:'shell:AppsFolder\\App.Name',name:'App'},null]}).next;
 assert.equal(p.pages[0][1].children[0].settings.keys,'Ctrl+C');
 assert.equal(p.pages[0][1].children[1].settings.app,'shell:AppsFolder\\App.Name');
 assert.equal(p.pages[0][4],plugin);assert.equal(p.controls,oldControl);
 assert.equal(JSON.stringify(s),before);
 const fp=A.makePlan(p,req('folder_page',{},{folder:'2:1/3:1'})).next;assert.equal(fp.pages[0][1].children[2].pages.length,1);
 assert.throws(()=>A.makePlan(s,req('folder_keys',{keys:[{slot:14,op:'put',type:'hotkey',value:'Ctrl+C'}]},{folder:'2:1'})));
 assert.throws(()=>A.makePlan(s,req('plugin',{kind:'fusion',id:'VerifiedCommand'},{slot:9}),{template:{kind:'fusion',id:'VerifiedCommand'}}));
});
test('control automatic target disables overrides, scoped stack, held input, wide',()=>{
 const s=fixture(),b=s.controls.global[2];b.left=Core.createAction('hotkey');b.left.settings.keys='Ctrl+A';
 const before=JSON.stringify(s);
 const next=A.makePlan(s,req('control',{target:'volume',step:5,reverse:true},{slot:3})).next;
 assert.equal(next.controls.global[2].target,'volume');assert.equal(next.controls.global[2].autoAssign,true);assert.equal(next.controls.global[2].inactiveRotations.includes('left'),true);
 assert.equal(next.controls.global[2].left,b.left);
 const st=A.makePlan(next,req('control',{scope:'page',mode:'stack',stack:['page','volume']},{slot:3})).next;
 assert.equal(st.controls.pages[0][2].mode,'stack');assert.equal(st.controls.scopes[2],'page');
 assert.throws(()=>A.makePlan(st,req('control',{gesture:'left',action:{type:'hotkey',value:'Ctrl+C'}},{slot:3})));
 const wide=A.makePlan(s,req('wide',{enabled:['datetime','knobs'],current:'knobs'})).next;
 assert.deepEqual(wide.wideDisplay.enabled,['datetime','knobs']);assert.equal(wide.wideDisplay.current,'knobs');
 assert.equal(JSON.stringify(s),before);
});
test('composite creation validates delay and nested types; existing protected actions stay unchanged',()=>{
 const s=fixture();
 const p=A.makePlan(s,req('composite',{type:'multi',steps:[{type:'hotkey',value:'Ctrl+C'},{type:'delay',value:'200'},{type:'hotkey',value:'Ctrl+V'}]},{slot:3})).next;
 assert.equal(p.pages[0][2].children[1].ms,200);assert.equal(Core.planComposite(p.pages[0][2]).kind,'composite');
 const m=A.makePlan(s,req('composite',{type:'multi-switch',steps:[{type:'hotkey',value:'Ctrl+C'}],second:[{type:'hotkey',value:'Ctrl+V'}]},{slot:3})).next;
 assert.equal(m.pages[0][2].sequences.length,2);
 assert.throws(()=>A.makePlan(s,req('composite',{type:'random',steps:[{type:'delay',value:'100'}]},{slot:3})));
 assert.throws(()=>A.makePlan(s,req('composite',{type:'multi',steps:[{type:'multi',value:null}]},{slot:3})));
 assert.throws(()=>A.makePlan(p,req('composite',{type:'multi',steps:[{type:'hotkey',value:'Ctrl+A'}]},{slot:3})));
});
test('native HA and verified installed template only; state art and titles preserve unrelated settings',()=>{
 const s=fixture(),q=req('plugin',{kind:'fusion',id:'VerifiedCommand',title:'Fusion'},{slot:3});
 assert.equal(A.walkTemplates(s)[0].id,'VerifiedCommand');assert.throws(()=>A.makePlan(s,q));
 const p=A.makePlan(s,q,{template:{kind:'fusion',id:'VerifiedCommand'}}).next;
 assert.equal(p.pages[0][2].settings.pluginSettings.commandId,'VerifiedCommand');assert.ok(p.pages[0][2]!==s.pages[0][4]);
 const ha=req('plugin',{kind:'ha',id:'light.room'},{slot:4});assert.throws(()=>A.makePlan(s,ha));assert.equal(A.makePlan(s,ha,{ha:{id:'light.room',name:'Room'}}).next.pages[0][3].settings.entityId,'light.room');
 const png={kind:'file',value:'data:image/png;base64,AAAA',packId:'pack'},design=req('state_design',{first:{title:'Up',enabled:true,iconName:'One'},second:{title:'Down',enabled:true,color:'#123456'}},{slot:5});
 const after=A.makePlan(s,design,{icons:{first:{name:'One',pack:'pack',data:png}}}).next.pages[0][4];
 assert.equal(after.settings.keyPressIcons.up,png);assert.equal(after.settings.stateTitles.second.title,'Down');assert.equal(after.settings.pluginSettings,s.pages[0][4].settings.pluginSettings);
 assert.equal(s.pages[0][4].settings.stateTitles,undefined);
 assert.throws(()=>A.validate(req('control',{target:'volume',command:'anything'},{slot:3})));
});
test('Markdown parses headings tables lists and code, never treats HTML as markup',()=>{
 const blocks=MD.parse('# Title\n\n| A | B |\n|---|---:|\n| **one** | two |\n\n- item\n\n'+String.fromCharCode(96).repeat(3)+'\n<script>bad</script>\n'+String.fromCharCode(96).repeat(3)+'\n\n<img src=x onerror=x>');
 assert.deepEqual(blocks.map(b=>b.tag),['h1','table','ul','pre','p']);
 assert.deepEqual(blocks[1].rows,[['**one**','two']]);
 assert.equal(MD.inline('**bold**')[0].tag,'strong');assert.equal(MD.inline('<script>evil</script>')[0].tag,'text');
 const tags=[];const mk=tag=>({tag,ownerDocument:doc,children:[],append(...kids){this.children.push(...kids);},replaceChildren(){this.children=[];}});
 const doc={createElement:tag=>{tags.push(tag);return mk(tag);},createTextNode:text=>({text})};
 const root=mk('root');MD.render(root,'<img src=x onerror=x>\n\n**hello**');assert.equal(tags.includes('img'),false);assert.equal(tags.includes('strong'),true);
});
const event=output=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output}})+'\n\n',{status:200});
const call=(id,name,args)=>({type:'function_call',name,namespace:'deckforge',call_id:id,arguments:JSON.stringify(args)});
test('advanced proposal shares same authorization and one-proposal limit',async()=>{
 const base={token:'mock',model:'mock',messages:[{role:'user',content:'test'}],version:'1.1.46'},q=req('wide',{enabled:['clock']});
 let n=0,requests=0;const propose=async input=>{n++;assert.ok(input.advanced);return {ok:true,applied:false};};
 await assert.rejects(chat({...base,readOnly:true,propose,fetcher:async()=>event([call('1','propose_advanced',q)])}),/허용되지 않은/);assert.equal(n,0);
 const result=await chat({...base,readOnly:true,editMode:true,propose,fetcher:async(_url,o)=>{
   const body=JSON.parse(o.body);assert.ok(body.tools[0].tools.some(t=>t.name==='propose_advanced'));
   if(++requests===1)return event([call('2','propose_advanced',q)]);
   return event([]);
 }});assert.equal(n,1);assert.equal(result.requests,2);
 await assert.rejects(chat({...base,readOnly:true,editMode:true,propose,fetcher:async()=>event([call('3','propose_advanced',q),call('4','propose_advanced',q)])}),/한 개/);assert.equal(n,1);
});

test('read/edit preferences default off, persist, and keep edit dependent on read',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/ai/window.cjs'),'utf8');
 const start=source.indexOf('  let preferences=null;'),end=source.indexOf('  let preferenceTail=',start);
 assert.ok(start>=0&&end>start);
 const disk=new Map();let serial=0;
 const io={readFile:async f=>{if(!disk.has(f))throw Error('missing');return disk.get(f);},mkdir:async()=>{},writeFile:async(f,v)=>disk.set(f,v),rename:async(a,b)=>{disk.set(b,disk.get(a));disk.delete(a);},rm:async f=>disk.delete(f)};
 const load=()=>{const c={fs:io,path,dir:()=>'/ai',randomUUID:()=>String(++serial)};vm.runInNewContext(source.slice(start,end)+'\nthis.prefs={readPreferences,savePreferences};',c);return c.prefs;};
 let api=load();assert.deepEqual(JSON.parse(JSON.stringify(await api.readPreferences())),{read:false,edit:false});
 await api.savePreferences({read:false,edit:true});api=load();
 assert.deepEqual(JSON.parse(JSON.stringify(await api.readPreferences())),{read:true,edit:true});
 await api.savePreferences({read:false,edit:false});api=load();
 assert.deepEqual(JSON.parse(JSON.stringify(await api.readPreferences())),{read:false,edit:false});
 await assert.rejects(api.savePreferences({read:true,edit:true,command:'no'}),/형식/);
 const panel=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/ai/panel.js'),'utf8');
 const send=panel.slice(panel.indexOf("$('send').onclick="),panel.indexOf('function describeEdit'));
 assert.ok(!send.includes("checked=false"));
});

test('AI side control proposals cannot assign non-navigation actions',()=>{
  const s=fixture();
  assert.throws(()=>A.makePlan(s,req('control',{gesture:'down',action:{type:'hotkey',value:'Ctrl+C'}},{slot:1})));
  const change=A.makePlan(s,req('control',{gesture:'sideHold',action:{type:'previous',value:null}},{slot:1})).next;
  assert.equal(change.controls.global[0].sideHold.type,'previous');
  assert.throws(()=>A.makePlan(s,req('control',{gesture:'sideHold',action:{type:'previous',value:null}},{slot:3})));
});


const FusionLive=require('../app/streamdeck-editor/ai/fusion-commands.cjs');
test('live Fusion command catalog joins Korean names only by verified ID and searches bounded results',()=>{
 const names=FusionLive.normaliseCatalog([{id:'SketchLine',koName:'선',englishName:'Line'},{id:'Missing',koName:'없는 명령'}]);
 const rows=FusionLive.projectCommands({ok:true,commands:[{id:'SketchLine',name:'Line',tooltip:'Sketch line'},{id:'Other',name:'Other'},{id:'../bad',name:'Invalid'},{id:'SketchLine',name:'Duplicate'}]},names);
 assert.equal(rows.length,2);assert.equal(FusionLive.search(rows,'선').items[0].id,'SketchLine');
 assert.equal(FusionLive.search(rows,'Sketch line').total,1);assert.equal(FusionLive.search(rows,'없는 명령').total,0);
 assert.equal(FusionLive.search(rows,'',0,1).nextOffset,1);
 assert.throws(()=>FusionLive.projectCommands({ok:false,commands:[]}));
});
test('live Fusion client uses only loopback GET, rejects redirects, and verifies exact ID',async()=>{
 const calls=[],disk={endpoint:{status:'running',port:59237},catalog:[{id:'Line',koName:'선'}]};
 const io={stat:async()=>({isFile:()=>true,size:100}),readFile:async f=>JSON.stringify(disk[f])};
 const client=FusionLive.createClient({discoveryFile:'endpoint',catalogFile:'catalog',io,fetcher:async(url,opts)=>{
  calls.push({url,method:opts.method,redirect:opts.redirect});
  return new Response(JSON.stringify({ok:true,commands:[{id:'Line',name:'Line'},{id:'LineOther',name:'Other'}]}));
 }});
 assert.equal((await client.list())[0].ko,'선');
 assert.equal((await client.exact('Line')).id,'Line');
 assert.equal(await client.exact('Missing'),null);
 await assert.rejects(client.exact('../evil'));
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.url.startsWith('http://127.0.0.1:59237/commands?refresh=1')&&x.method==='GET'&&x.redirect==='error'));
 disk.endpoint={status:'stopped',port:59237};await assert.rejects(client.list());assert.equal(calls.length,3);
});
test('new live Fusion command registration requires local exact data and preserves occupied and pinned buttons',()=>{
 const s=fixture(),before=JSON.stringify(s),q=req('plugin',{kind:'fusion-live',id:'SketchLine',title:'선'},{slot:3});
 assert.throws(()=>A.makePlan(s,q));assert.throws(()=>A.makePlan(s,q,{fusionLive:{id:'Other',name:'Other'}}));
 const resource={fusionLive:{id:'SketchLine',name:'Line'}};
 const p=A.makePlan(s,q,resource),item=p.next.pages[0][2];
 assert.equal(item.type,'sd-plugin');assert.equal(item.title,'선');
 assert.equal(item.settings.pluginUUID,FusionLive.PLUGIN);assert.equal(item.settings.actionUUID,FusionLive.ACTION);
 assert.deepEqual(item.settings.pluginSettings,{commandId:'SketchLine',name:'Line'});
 assert.equal(JSON.stringify(s),before);assert.equal(p.next.pages[0][4],s.pages[0][4]);
 assert.throws(()=>A.makePlan(s,{...q,slot:5},resource));assert.throws(()=>A.makePlan(s,{...q,slot:9},resource));
 assert.throws(()=>A.validate(req('plugin',{kind:'fusion-live',id:'../invalid'},{slot:3})));
});

test('Fusion batch spans existing pages atomically and protects all existing slots',()=>{
 const s=fixture();s.pages.push(Array(14).fill(null),Array(14).fill(null));
 const before=JSON.stringify(s),one={page:1,slot:3,id:'SketchLine',title:'선'},two={page:2,slot:4,id:'CircleCenterRadius',title:'원'};
 const q=keys=>req('fusion_batch',{keys});
 const resources={fusionBatch:[{id:one.id,name:'Line'},{id:two.id,name:'Circle'}]};
 const p=A.makePlan(s,q([one,two]),resources);
 assert.equal(p.rows.length,2);assert.equal(p.rows[1].page,2);assert.equal(p.rows[1].slot,4);
 assert.equal(p.next.pages[0][2].title,'선');assert.equal(p.next.pages[1][3].settings.pluginSettings.commandId,two.id);
 assert.equal(p.next.pages[0][4],s.pages[0][4]);assert.equal(p.next.pages[2],s.pages[2]);assert.equal(p.next.controls,s.controls);
 for(const bad of [{...two,page:1,slot:5},{...two,slot:9},{...two,page:4},{...two,id:'Unknown'},{...two,page:1,slot:3},{...two,slot:14}]){
   assert.throws(()=>A.makePlan(s,q([one,bad]),resources));assert.equal(JSON.stringify(s),before);
 }
 assert.throws(()=>A.makePlan(s,q([one,two]),{fusionBatch:[resources.fusionBatch[0]]}));
 assert.throws(()=>A.validate({...q([one,two]),folder:'2:1'}));
 assert.throws(()=>A.validate(q(Array.from({length:14},(_,i)=>({...one,page:i+1})))));
 assert.equal(JSON.stringify(s),before);
});
test('Fusion multi-query search returns bounded distinct matches fairly',()=>{
 const rows=[{id:'Line',name:'Line',ko:'선',en:'Line',category:'Sketch',tooltip:''},{id:'Line2',name:'Line tool',ko:'선 도구',en:'Line tool',category:'Sketch',tooltip:''},{id:'Circle',name:'Circle',ko:'원',en:'Circle',category:'Sketch',tooltip:''}];
 const result=FusionLive.search(rows,'선|원',0,2);
 assert.deepEqual(result.items.map(r=>r.id),['Line','Circle']);assert.equal(result.total,3);assert.equal(result.nextOffset,2);
 assert.deepEqual(FusionLive.search(rows,'선|원',2,2).items.map(r=>r.id),['Line2']);
 assert.throws(()=>FusionLive.search(rows,'선||원'));
});

test('page structure preview inserts and moves pages without mutating original or overwriting destination',()=>{
 const p=Core.migrateState({pages:[[],[],[],[],[]]});
 const marker=p.pages[4][0]=Core.createAction('hotkey');marker.title='fifth';
 p.pages[0][0]=Core.createAction('goto');p.pages[0][0].settings.page=4;
 const request=(config)=>({kind:'page_structure',page:null,folder:null,slot:null,configJson:JSON.stringify(config)});
 const before=JSON.stringify(p);
 const inserted=A.makePlan(p,request({op:'insert',index:5})).next;
 assert.equal(JSON.stringify(p),before);
 assert.equal(inserted.pages.length,6);assert.equal(inserted.pages[5][0].title,'fifth');
 assert.equal(inserted.pages[0][0].settings.page,5);
 const moved=A.makePlan(inserted,request({op:'move',index:6,to:2})).next;
 assert.equal(moved.pages[1][0].title,'fifth');assert.equal(moved.pages[0][0].settings.page,1);
 const duplicated=A.makePlan(moved,request({op:'duplicate',index:2})).next;
 assert.equal(duplicated.pages[2][0].title,'fifth');
 const deleted=A.makePlan(duplicated,request({op:'delete',index:2})).next;
 assert.equal(deleted.pages[0][0].settings.page,-1);
 assert.throws(()=>A.makePlan(p,request({op:'insert',index:9})));
});

test('new profile preview builds multiple pages without modifying active or other profiles',()=>{
 const s=fixture();Core.createProfile(s,'Other');const saved=JSON.stringify(s);
 const c={name:'Fusion 제작',pageCount:3,keys:[{page:1,slot:1,type:'hotkey',value:'Ctrl+C',title:'복사'},{page:2,slot:12,type:'fusion-live',value:'SketchLine',title:'선'},{page:3,slot:2,type:'goto',value:'1',title:'홈'}]};
 const resources={fusionBatch:[{id:'SketchLine',name:'Line'}]};
 const plan=A.makePlan(s,req('profile_build',c),resources);
 assert.equal(JSON.stringify(s),saved);assert.equal(plan.next.pages,s.pages);assert.equal(plan.next.profileId,s.profileId);
 assert.equal(plan.next.inactiveProfiles[0],s.inactiveProfiles[0]);assert.equal(plan.rows.length,4);
 const fresh=plan.next.inactiveProfiles.find(x=>x.id===plan.createdProfileId);
 assert.equal(fresh.pages.length,3);assert.equal(fresh.pages[0][0].settings.keys,'Ctrl+C');assert.equal(fresh.pages[1][11].settings.pluginSettings.commandId,'SketchLine');assert.equal(fresh.pages[2][1].settings.page,0);assert.equal(fresh.pages[0][13],null);
 const reloaded=Core.migrateState(JSON.parse(JSON.stringify(plan.next)));
 assert.ok(Core.switchProfile(reloaded,plan.createdProfileId));assert.equal(reloaded.pages[1][11].title,'선');
 for(const bad of [{...c,name:'Other'},{...c,pageCount:11},{...c,keys:[c.keys[0],c.keys[0]]},{...c,keys:[{...c.keys[0],slot:14}]},{...c,keys:[{...c.keys[1],value:'Unknown'}]},{...c,keys:[{...c.keys[0],type:'open-app',value:'Unverified.App'}]}]){
   assert.throws(()=>A.makePlan(s,req('profile_build',bad),resources));assert.equal(JSON.stringify(s),saved);
 }
 const withApp={...c,keys:[{page:1,slot:1,type:'open-app',value:'Verified.App'}]};
 const app=A.makePlan(s,req('profile_build',withApp),{targets:[{type:'open-app',requested:'Verified.App',path:'shell:AppsFolder\\Verified.App',name:'Verified'}]});
 assert.equal(app.next.inactiveProfiles.find(x=>x.id===app.createdProfileId).pages[0][0].settings.app,'shell:AppsFolder\\Verified.App');
});

test('new profile supports nested folders, verified nested targets, and profile-only physical settings',()=>{
 const s=fixture();Core.createProfile(s,'Other');const before=JSON.stringify(s);
 const c={name:'전체 구성',pageCount:3,keys:[
  {page:1,folder:'2:2/3:1',slot:1,type:'fusion-live',value:'SketchLine',title:'선'},
  {page:1,folder:'2:2',slot:3,type:'folder',title:'하위 폴더',pageCount:2},
  {page:1,slot:2,type:'folder',title:'작업',pageCount:2},
  {page:1,folder:'2:2',slot:2,type:'goto',value:'1'},
  {page:1,folder:'2:2/3:2',slot:2,type:'open-app',value:'Verified.App'},
  {page:3,slot:1,type:'hotkey',value:'Ctrl+C'}
 ],controls:[
  {slot:1,actions:[{gesture:'down',action:{type:'previous'}}]},
  {slot:2,page:2,actions:[{gesture:'sideHold',action:{type:'goto',value:'3'}}]},
  {slot:3,config:{target:'volume',step:5},actions:[{gesture:'down',action:{type:'system-mute'}}]},
  {slot:4,config:{target:'zoom',heldEnabled:true,heldTarget:'scroll'}},
  {slot:5,config:{heldEnabled:true},actions:[{gesture:'left',action:{type:'hotkey',value:'Ctrl+Z'}},{gesture:'right',action:{type:'hotkey',value:'Ctrl+Y'}},{gesture:'holdLeft',action:{type:'previous'}},{gesture:'holdRight',action:{type:'next'}}]}
 ],wide:{enabled:['clock','knobs'],current:'knobs'}};
 const resources={fusionBatch:[{id:'SketchLine',name:'Line'}],targets:[null,null,null,null,{type:'open-app',requested:'Verified.App',path:'shell:AppsFolder\\Verified.App',name:'Verified'}]};
 const plan=A.makePlan(s,req('profile_build',c),resources),fresh=plan.next.inactiveProfiles.find(p=>p.id===plan.createdProfileId);
 assert.equal(JSON.stringify(s),before);assert.equal(plan.next.pages,s.pages);assert.equal(plan.next.controls,s.controls);assert.equal(plan.next.inactiveProfiles[0],s.inactiveProfiles[0]);
 assert.equal(fresh.pages[0][1].pages[0][2].children[0].settings.pluginSettings.commandId,'SketchLine');
 assert.equal(fresh.pages[0][1].pages[0][2].pages[0][1].settings.app,'shell:AppsFolder\\Verified.App');
 assert.equal(fresh.pages[0][1].pages[0][1].settings.page,0);
 assert.equal(fresh.controls.global[0].down.type,'previous');assert.equal(fresh.controls.scopes[1],'page');assert.equal(fresh.controls.pages[1][1].sideHold.settings.page,2);
 assert.equal(fresh.controls.global[2].target,'volume');assert.equal(fresh.controls.global[2].down.type,'system-mute');
 assert.equal(fresh.controls.global[3].heldTarget,'scroll');assert.equal(fresh.controls.global[4].autoAssign,false);assert.equal(fresh.controls.global[4].heldAutoAssign,false);assert.equal(fresh.controls.global[4].holdRight.type,'next');
 assert.equal(fresh.wideDisplay.current,'knobs');assert.equal(plan.rows.length,13);assert.ok(plan.rows.some(r=>r.folder==='2:2/3:1'&&r.slot===1));
 const reloaded=Core.migrateState(JSON.parse(JSON.stringify(plan.next)));assert.ok(Core.switchProfile(reloaded,plan.createdProfileId));
 assert.equal(reloaded.pages[0][1].pages[0][2].children[0].title,'선');assert.equal(reloaded.controls.global[4].holdRight.type,'next');assert.equal(reloaded.wideDisplay.current,'knobs');
 for(const bad of [
  {...c,keys:c.keys.filter(k=>k.title!=='작업')},
  {...c,keys:[...c.keys,{...c.keys[0]}]},
  {...c,keys:c.keys.map(k=>k.title==='작업'?{...k,pageCount:1}:k)},
  {...c,keys:c.keys.map(k=>k.type==='goto'?{...k,value:'3'}:k)},
  {...c,controls:[...c.controls,{slot:1,page:2,actions:[{gesture:'down',action:{type:'next'}}]}]},
  {...c,controls:[{slot:3,config:{heldEnabled:true},actions:[{gesture:'down',action:{type:'system-mute'}}]}]},
  {...c,controls:[{slot:3,config:{target:'volume'},actions:[{gesture:'left',action:{type:'previous'}}]}]},
  {...c,controls:[{slot:1,actions:[{gesture:'down',action:{type:'hotkey',value:'Ctrl+C'}}]}]},
  {...c,wide:{enabled:['unknown']}}
 ]){assert.throws(()=>A.makePlan(s,req('profile_build',bad),resources));assert.equal(JSON.stringify(s),before);}
 assert.throws(()=>A.makePlan(s,req('profile_build',c),{fusionBatch:resources.fusionBatch}));
 const only=A.makePlan(s,req('profile_build',{name:'시계',pageCount:1,keys:[],wide:{enabled:['clock']}}));
 assert.equal(only.next.inactiveProfiles.find(p=>p.id===only.createdProfileId).wideDisplay.current,'clock');
});

test('user templates copy whole profiles independently, persist, rename/delete and never activate new profiles',()=>{
 const s=fixture();Core.createProfile(s,'Other');s.pages[0][1].pages=[Array(14).fill(null)];s.pages[0][1].pages[0][0]=Core.createAction('system-mute');
 s.pages[0][0]=Core.createAction('hotkey');s.pages[0][0].settings.keys='Ctrl+C';s.pages[0][0].icon={kind:'file',value:'data:image/png;base64,YQ=='};
 s.controls.global[2].target='volume';s.controls.global[2].autoAssign=true;s.wideDisplay=Core.cleanWideDisplay({enabled:['knobs'],current:'knobs'});
 s.profileNames[0].appPath='C:\\Private\\Original.exe';s.profileNames[0].smartEnabled=true;
 const before=JSON.stringify(s),saved=A.makePlan(s,req('template_save',{name:'편집 구성'})),t=saved.next.profileTemplates[0];
 assert.equal(JSON.stringify(s),before);assert.equal(saved.next.pages,s.pages);assert.equal(saved.next.inactiveProfiles[0],s.inactiveProfiles[0]);
 assert.equal(t.snapshot.pages[0][0].icon.value,'data:image/png;base64,YQ==');assert.equal(t.snapshot.pages[0][4].settings.pluginSettings.commandId,'VerifiedCommand');
 assert.equal(t.snapshot.controls.global[2].target,'volume');assert.equal(t.snapshot.wideDisplay.current,'knobs');
 s.pages[0][0].settings.keys='Ctrl+V';assert.equal(t.snapshot.pages[0][0].settings.keys,'Ctrl+C');
 const reloaded=Core.migrateState(JSON.parse(JSON.stringify(saved.next))),base=JSON.stringify(reloaded);
 const reused=A.makePlan(reloaded,req('template_apply',{template:'편집 구성',name:'새 작업'}));
 assert.equal(JSON.stringify(reloaded),base);assert.equal(reused.next.profileId,reloaded.profileId);assert.equal(reused.next.pages,reloaded.pages);
 const fresh=reused.next.inactiveProfiles.find(p=>p.id===reused.createdProfileId);
 assert.equal(fresh.pages[0][0].settings.keys,'Ctrl+C');assert.equal(fresh.pages[0][1].pages[0][0].type,'system-mute');
 assert.equal(fresh.pages[0][4].settings.pluginSettings.commandId,'VerifiedCommand');assert.equal(fresh.wideDisplay.current,'knobs');
 assert.equal(reused.next.profileNames.find(p=>p.id===fresh.id).smartEnabled,false);
 assert.equal(reused.next.profileNames.find(p=>p.id===fresh.id).appPath,'');
 fresh.pages[0][0].title='새 이름';assert.equal(reused.next.profileTemplates[0].snapshot.pages[0][0].title,t.snapshot.pages[0][0].title);
 const renamed=Core.renameProfileTemplate(reused.next,t.id,'새 템플릿');assert.equal(renamed.profileTemplates[0].name,'새 템플릿');assert.equal(reused.next.profileTemplates[0].name,'편집 구성');
 const deleted=Core.deleteProfileTemplate(renamed,t.id);assert.equal(deleted.profileTemplates.length,0);assert.equal(deleted.inactiveProfiles.length,reused.next.inactiveProfiles.length);
 const resaved=Core.saveProfileTemplate(deleted,deleted.profileId,'새 템플릿');assert.notEqual(resaved.template.id,t.id);
 for(const q of [req('template_save',{name:'편집 구성'}),req('template_save',{name:'x',sourceProfile:'Missing'}),req('template_apply',{name:'Other',template:'편집 구성'}),req('template_apply',{name:'x',template:'Missing'}),req('template_apply',{name:'x',template:'편집 구성',settings:{}})])assert.throws(()=>A.makePlan(reloaded,q));
 assert.throws(()=>Core.migrateState({...reloaded,profileTemplates:[t,t]}));assert.equal(JSON.stringify(reloaded),base);
 const legacy=JSON.parse(base);delete legacy.profileTemplates;delete legacy.profileTemplateSeq;assert.equal(Core.migrateState(legacy).profileTemplates.length,0);
});
