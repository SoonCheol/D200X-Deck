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

test('captured 959 Fusion menu placements retain tab/panel order without alphabetical sorting',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/fusion-mcp/fusion-menu-catalog.json'),'utf8'));
 assert.equal(catalog.entries.length,959);
 const all=[...new Set(catalog.entries.map(x=>x.id))].map(id=>({id,name:id}));
 const areas=Menu.fromMenuCatalog(catalog,all);
 assert.deepEqual(areas.map(x=>x.name),['스케치','솔리드','곡면','메쉬','판금','플라스틱','매니지','유틸리티','자동화']);
 for(const area of areas){
  const expected=catalog.entries.filter(x=>x.tabId===area.key);
  assert.deepEqual([...area.children.keys()],[...new Set(expected.map(x=>x.panelId||x.panel||'other'))]);
  const result=[...area.children.values()].flatMap(panel=>Menu.descendants(panel).map(x=>x.id));
  assert.deepEqual(new Set(result),new Set(expected.map(x=>x.id)));
 }
});

test('Fusion Manager help stays available offline in Windows packaging source',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../tools/fusion-manager');
 const help=fs.readFileSync(path.join(root,'HELP.md'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/fusion-manager-preview.yml'),'utf8');
 assert.match(help,/FusionStreamDeck/);
 assert.match(help,/Codex MCP/);
 assert.match(help,/오프라인/);
 assert.match(html,/id="helpOpen"/);
 assert.match(html,/id="helpDialog"/);
 assert.doesNotMatch(html,/<footer>/);
 assert.match(renderer,/helpMarkdown\(\)/);
 assert.match(main,/help-markdown/);
 assert.match(workflow,/fusion-manager\/HELP\.md/);
});

test('Manager opens at requested size and expands nested menu without extra dropdown filters',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../tools/fusion-manager');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/fusion-manager-preview.yml'),'utf8');
 assert.doesNotMatch(html,/id="dropdowns"/);
 assert.doesNotMatch(script,/explorerDropdown/);
 assert.match(script,/const node=panel/);
 assert.match(html,/#workspaces\{display:flex;flex-wrap:nowrap/);
 assert.match(html,/#workspaces button\{flex:1 1 0;min-width:max-content/);
 assert.match(script,/fitWorkspaceWidth/);
 assert.match(main,/fusion-fit-workspace-width/);
 assert.match(html,/#menus\{display:flex;flex-wrap:nowrap/);
 assert.match(html,/#menus button\{flex:1 1 0;padding-inline:4px;white-space:nowrap;min-width:max-content/);
 assert.match(html,/#menus\.wrap-limited button,#workspaces\.wrap-limited button\{flex:0 0 auto/);
 assert.match(script,/const navs=\[\$\('workspaces'\),\$\('menus'\)\]/);
 assert.match(script,/const extra=Math\.max\(\.\.\.navs\.map\(overflow\)\)/);
 assert.match(main,/Math\.min\(698,area\.width\),height=Math\.min\(873,area\.height\)/);
 assert.match(html,/fonts\/PretendardVariable\.woff2/);
 assert.match(workflow,/49c54b5152a184a243e85f7281ed338b6569987e/);
});

test('context help offers original Fusion UI Python collector and icon guidance',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../tools/fusion-manager');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/fusion-manager-preview.yml'),'utf8');
 for(const id of ['captureHelp','iconsHelp','scriptShow','scriptCopy'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(renderer,/openManagerHelp\('Fusion UI JSON 불러오기'\)/);
 assert.match(renderer,/openManagerHelp\('현재 목록 원본 아이콘 수집'\)/);
 assert.match(main,/fusion-ui-script/);
 assert.match(workflow,/fusion-ui-inventory\.py.*fusion-ui-inventory\.py/);
});

// The English display layer must not reorder/rename native Korean catalogue nodes.
test('localized manager labels change by stable IDs while preserving menu order and missing-label fallback',()=>{
 const menu={format:'deckforge-fusion-menu-catalog-v1',tabIds:['SketchTab','SolidTab'],entries:[
  {id:'DrawPolyline',tabId:'SketchTab',panel:'작성',panelId:'SketchCreatePanel',dropdowns:[]},
  {id:'Extrude',tabId:'SolidTab',panel:'작성',panelId:'SolidCreatePanel',dropdowns:[]}
 ]};
 const commands=[{id:'DrawPolyline',name:'선',ko:'선',en:'Line'},{id:'Extrude',name:'돌출',ko:'돌출',en:'Extrude'}];
 const groups=Menu.fromMenuCatalog(menu,commands);
 const localized={menus:{tab:{SketchTab:'Sketch'},panel:{SketchCreatePanel:'Create'}}};
 assert.deepEqual(groups.map(x=>x.key),['SketchTab','SolidTab']);
 assert.equal(Menu.localizedLabel(groups[0],'tab','en',localized),'Sketch');
 assert.equal(Menu.localizedLabel(groups[1],'tab','en',localized),'솔리드');
 assert.equal(Menu.localizedLabel(groups[0],'tab','ko',localized),'스케치');
 assert.equal(Menu.localizedLabel([...groups[0].children.values()][0],'panel','en',localized),'Create');
 assert.equal(Menu.localizedCommand(commands[0],'en'),'Line');
 assert.equal(Menu.localizedCommand(commands[0],'ko'),'선');
 assert.equal(groups[0].name,'스케치');
 assert.deepEqual(Menu.descendants([...groups[0].children.values()][0]).map(x=>x.id),['DrawPolyline']);
});


test('menu path renders Korean and English in collection order and removes duplicate placements',()=>{
 const path=[{kind:'workspace',id:'FusionSolidEnvironment',name:'디자인'},{kind:'tab',id:'SketchTab',name:'스케치'},{kind:'panel',id:'SketchCreatePanel',name:'작성'},{kind:'command',id:'DrawPolyline'}];
 const command={id:'DrawPolyline',ko:'선',en:'Line',paths:[{path},{path}]};
 const overlay={menus:{workspace:{FusionSolidEnvironment:'Design'},tab:{SketchTab:'SKETCH'},panel:{SketchCreatePanel:'CREATE'}}};
 assert.deepEqual(Menu.bilingualPaths(command,null,overlay),[{ko:'디자인 › 스케치 › 작성 › 선',en:'Design › SKETCH › CREATE › Line'}]);
});
