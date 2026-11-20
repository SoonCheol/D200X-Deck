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
