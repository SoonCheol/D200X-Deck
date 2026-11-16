'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Menu=require('../tools/fusion-manager/menu-tree.cjs');
const Drag=require('../app/streamdeck-editor/fusion-drag.cjs');
const cmd=(id,name,parts)=>({id,name,paths:[{source:'fusion-api',location:'toolbar',path:parts}]});
const ws={kind:'workspace',id:'FusionSolidEnvironment'},tab={kind:'tab',id:'SolidTab'},panel={kind:'panel',id:'SolidCreatePanel'};
test('navigates workspace -> panel -> nested dropdown; preserves exact IDs',()=>{
 const entries=[
  cmd('Extrude','돌출',[ws,tab,panel,{kind:'command',id:'Extrude'}]),
  cmd('PatternA','패턴',[ws,tab,panel,{kind:'dropdown',id:'PatternMenu'},{kind:'command',id:'PatternA'}]),
  cmd('PatternB','패턴',[ws,tab,panel,{kind:'dropdown',id:'PatternMenu'},{kind:'command',id:'PatternB'}])
 ];
 const areas=Menu.structure(entries);
 const solid=areas.find(x=>x.name==='솔리드');
 assert.ok(solid);const create=[...solid.children.values()].find(x=>x.name==='작성');assert.ok(create);
 assert.deepEqual(Menu.descendants(create).map(x=>x.id).sort(),['Extrude','PatternA','PatternB']);
 const group=create.children.get('dropdown:PatternMenu');assert.ok(group);
 assert.deepEqual(Menu.descendants(group).map(x=>x.id).sort(),['PatternA','PatternB']);
 assert.equal(entries.length,3);
});
test('live API names and positions survive path conversion',()=>{
 const parts=Menu.pathParts([{workspace:{id:'SketchEnvironment',name:'스케치'}},{controlId:'ArcMenu',controlName:'호',position:2,controlType:'DropDownControl'}]);
 assert.equal(parts[0].label,'스케치');
 assert.equal(parts[1].id,'ArcMenu');
 assert.equal(parts[1].position,2);
});
test('native external drag payload round-trips Korean name and exact ID',()=>{
 const data=Drag.encode({id:'ExtrudeCmd',name:'돌출'});
 assert.deepEqual(Drag.decode(data),{id:'ExtrudeCmd',name:'돌출'});
 assert.equal(Drag.decode('ExtrudeCmd'),null);
 assert.equal(Drag.decode(Drag.PREFIX+'{"id":"../a","name":"돌출"}'),null);
 assert.equal(Drag.decode(Drag.PREFIX+'{"id":"ExtrudeCmd","name":"bad\\nnewline"}'),null);
 assert.throws(()=>Drag.encode({id:'bad/id',name:'test'}),/형식/);
});

test('small real PNG may accompany a drag, while SVG or oversized payload is omitted',()=>{
 const png='data:image/png;base64,iVBORw0KGgoAAA';
 const input={id:'ExtrudeCmd',name:'돌출',png};
 assert.deepEqual(Drag.decode(Drag.encode(input)),input);
 assert.deepEqual(Drag.decode(Drag.encode({id:'ExtrudeCmd',name:'돌출',png:'data:image/svg+xml;base64,PD94bWw='})),
   {id:'ExtrudeCmd',name:'돌출'});
 assert.deepEqual(Drag.decode(Drag.encode({id:'ExtrudeCmd',name:'돌출',png:'data:image/png;base64,'+'A'.repeat(130001)})),
   {id:'ExtrudeCmd',name:'돌출'});
});
test('actual capture panel and dropdown indices remain available for Fusion-order UI',()=>{
 const area=Menu.structure([
  cmd('x','X',[{kind:'workspace',id:'SketchEnvironment'},{kind:'tab',id:'SketchTab',position:0},{kind:'panel',id:'SketchModifyPanel',position:5},{kind:'dropdown',id:'Inner',position:3},{kind:'command',id:'x'}]),
  cmd('y','Y',[{kind:'workspace',id:'SketchEnvironment'},{kind:'tab',id:'SketchTab',position:0},{kind:'panel',id:'SketchCreatePanel',position:1},{kind:'command',id:'y'}])
 ])[0];
 const panels=[...area.children.values()].sort((a,b)=>a.rank-b.rank);
 assert.deepEqual(panels.map(p=>p.name),['작성','수정']);
 assert.equal(panels[1].children.get('dropdown:Inner').rank,3);
});

test('real Fusion menu tab, panel and nested dropdown ordering is preserved',()=>{
 const catalog={format:'deckforge-fusion-menu-catalog-v1',tabIds:['SketchTab','SolidTab','SurfaceTab','ParaMeshOuterTab','SheetMetalTab','PlasticTab','ManageTab','ToolsTab','AutomationTab'],entries:[
  {id:'A',tabId:'SketchTab',panel:'작성',panelId:'P1',dropdowns:[]},
  {id:'B',tabId:'SketchTab',panel:'작성',panelId:'P1',dropdowns:['Group','Nested']},
  {id:'C',tabId:'SketchTab',panel:'작성',panelId:'P1',dropdowns:['Group','Nested']},
  {id:'D',tabId:'SketchTab',panel:'수정',panelId:'P2',dropdowns:[]},
  {id:'E',tabId:'SolidTab',panel:'작성',panelId:'P3',dropdowns:[]}
 ]};
 const commands=['A','B','C','D','E'].map(id=>({id,name:id}));
 const tabs=Menu.fromMenuCatalog(catalog,commands);
 assert.deepEqual(tabs.map(x=>x.name),['스케치','솔리드','곡면','메쉬','판금','플라스틱','매니지','유틸리티','자동화']);
 const panels=[...tabs[0].children.values()];
 assert.deepEqual(panels.map(x=>x.name),['작성','수정']);
 assert.deepEqual(Menu.descendants(panels[0]).map(x=>x.id),['A','B','C']);
 assert.deepEqual(Menu.descendants(panels[0].children.get('dropdown:Group').children.get('dropdown:Nested')).map(x=>x.id),['B','C']);
 assert.deepEqual(Menu.descendants(panels[1]).map(x=>x.id),['D']);
});
