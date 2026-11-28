'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fromCapture,validateSaved}=require('../tools/fusion-manager/fusion-language-catalog.cjs');
const input=(name='Line')=>({format:'deckforge-fusion-ui-placements-v2',fusionVersion:'2.0',errors:[],placements:[
 {commandId:'DrawPolyline',commandName:name,path:[{workspace:{id:'FusionSolidEnvironment',name:'Design'}},{tab:{id:'SketchTab',name:'Sketch'}},{panel:{id:'SketchCreatePanel',name:'Create'}},{controlId:'LineGroup',controlName:'Lines',controlType:'adsk::core::DropDownControl'}]},
 {commandId:'DrawPolyline',commandName:name,path:[]},{commandId:'CircleCenterRadius',commandName:'Center Diameter Circle',path:[]}]});
test('English names and menu labels are keyed by Fusion IDs',()=>{
 const source=input(),original=JSON.stringify(source),result=fromCapture(source);
 assert.equal(result.commands.DrawPolyline,'Line');
 assert.equal(result.menus.tab.SketchTab,'Sketch');
 assert.equal(result.menus.panel.SketchCreatePanel,'Create');
 assert.equal(result.menus.dropdown.LineGroup,'Lines');
 assert.equal(result.stats.commands,2);
 assert.equal(JSON.stringify(source),original);
 assert.equal(validateSaved(JSON.parse(JSON.stringify(result))).commands.DrawPolyline,'Line');
});
test('Korean captures are not accepted as English',()=>{
 const source=input('선');source.placements[2].commandName='중심 지름 원';
 assert.throws(()=>fromCapture(source),/영문/);
});
test('bad format and protected property IDs are rejected',()=>{
 assert.throws(()=>fromCapture({format:'bad',placements:[],errors:[]}),/형식/);
 const source=input();source.placements.push({commandId:'__proto__',commandName:'Unknown',path:[]});
 const result=fromCapture(source);
 assert.equal(Object.hasOwn(result.commands,'__proto__'),false);
 const bad=JSON.parse(JSON.stringify(result));bad.commands.Invalid='한국어';
 assert.throws(()=>validateSaved(bad),/오류/);
});
test('conflicting English names do not overwrite earlier ID match',()=>{
 const source=input();source.placements.push({commandId:'DrawPolyline',commandName:'Polyline',path:[]});
 const result=fromCapture(source);assert.equal(result.commands.DrawPolyline,'Line');assert.equal(result.stats.conflicts,1);
});


test('bundled catalog opens without an existing user capture',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {loadEnglish,loadDisplayLanguage}=require('../tools/fusion-manager/fusion-language-catalog.cjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-fusion-en-'));
 try{
  const data=await loadEnglish(path.join(__dirname,'../tools/fusion-manager'),temp);
  assert.equal(Object.keys(data.commands).length,1209);
  assert.equal(data.commands.DrawPolyline,'Line');
  assert.equal(data.menus.tab.SheetMetalTab,'SHEET METAL');
  assert.equal(await loadDisplayLanguage(temp),'ko');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('individual Fusion language modes render without modifying saved titles or styles',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const start=source.indexOf('function fusionLocalizedVisual('),end=source.indexOf('async function refreshFusionButtonLanguage(',start);
 assert.ok(start>=0&&end>start);
 const context={fusionCommandId:item=>item.settings.pluginSettings.commandId,fusionButtonNames:{ko:{DrawPolyline:'선'},en:{DrawPolyline:'Line'},language:'en'}};
 const render=vm.runInNewContext(source.slice(start,end)+'\nfusionLocalizedVisual',context);
 const item={title:'선',settings:{pluginSettings:{commandId:'DrawPolyline'},stateTitles:{up:{title:'선',style:{fontSize:13}}}}};
 const snapshot=JSON.stringify(item);
 assert.equal(render(item,item.title).title,'Line');
 assert.equal(render(item,item.title).settings.stateTitles.up.title,'Line');
 assert.equal(JSON.stringify(item),snapshot);
 assert.equal(render({...item,settings:{...item.settings,fusionTitleLanguage:'ko'}},item.title).title,'선');
 context.fusionButtonNames.language='ko';
 assert.equal(render({...item,settings:{...item.settings,fusionTitleLanguage:'en'}},item.title).title,'Line');
 assert.equal(render(item,item.title).title,'선');
 assert.equal(render(item,'').title,'');
});
