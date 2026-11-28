'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('../app/deckforge-editor/fusion-batch.js');
const Core=require('../app/deckforge-editor/deck-core.js');
const mk=id=>({id,name:id});
const base=()=>({format:B.FORMAT,pluginUUID:B.PLUGIN,actionUUID:B.ACTION,profileName:'Fusion',commands:[mk('Line'),mk('Circle'),mk('Extrude')]});
test('legacy Fusion JSON remains compatible',()=>{const state=Core.migrateState(null);const result=B.apply(state,base(),Core);assert.equal(result.pageCount,1);assert.equal(state.pages[0][0].settings.pluginSettings.commandId,'Line');assert.equal(state.pages[0][1].settings.pluginSettings.commandId,'Circle');});
test('sparse pages preserve reservation gaps, profile and wide screen',()=>{const state=Core.migrateState(null);state.pages[0][0]=Core.createAction('hotkey');const layoutPages=[{name:'Sketch',slots:[mk('Line'),null,mk('Circle'),...Array(10).fill(null)]},{name:'Solid',slots:[null,null,mk('Extrude'),...Array(10).fill(null)]}];const result=B.apply(state,{...base(),layoutPages},Core);assert.equal(result.pageCount,2);assert.equal(state.pages[0][1],null);assert.equal(state.pages[1][2].settings.pluginSettings.commandId,'Extrude');assert.equal(state.pages[0][13],null);assert.equal(state.inactiveProfiles.find(p=>p.id==='default').pages[0][0].type,'hotkey');});
test('bad explicit layout is refused',()=>{assert.throws(()=>B.validate({...base(),layoutPages:[{slots:[mk('Circle'),mk('Line'),mk('Extrude'),...Array(10).fill(null)]}]}),/순서/);assert.throws(()=>B.validate({...base(),layoutPages:[{slots:Array(12).fill(null)}]}),/슬롯/);});

test('search sits above Fusion tabs with independent Korean English display buttons',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../tools/fusion-manager');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 assert.ok(html.indexOf('id="exploreSearch"')<html.indexOf('id="workspaces"'));
 assert.ok(html.indexOf('id="exploreReset"')<html.indexOf('id="workspaces"'));
 assert.match(html,/class="explore-toolbar"/);
 assert.match(html,/id="exploreKorean"/);
 assert.match(html,/id="exploreEnglish"/);
 assert.match(html,/class="explore-language"/);
 assert.match(renderer,/selectDisplayLanguage\('en'\)/);
 assert.match(renderer,/displayMenu\(area/);
 assert.match(renderer,/displayCommand\(v\)/);
 assert.match(main,/fusion-display-language-save/);
 assert.match(renderer,/commandById\.get\(id\)\?\.name/); // exports remain independent of display language
});


test('Fusion button descriptions use local cache and detail replaces toolbar path',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const renderer=read('tools/fusion-manager/renderer.js');
 const hover=renderer.slice(renderer.indexOf('function showTooltip('),renderer.indexOf('function showDetail('));
 const detail=renderer.slice(renderer.indexOf('function showDetail('),renderer.indexOf(' const nameKey=',renderer.indexOf('function showDetail(')));
 assert.match(hover,/readTooltip\(v.id\)/);
 assert.match(hover,/revision!==hoverRevision\|\|!anchor.isConnected/);
 assert.doesNotMatch(hover,/scrollHeight<=/);
 assert.match(detail,/명령 설명/);
 assert.match(detail,/readTooltip\(v.id\)/);
 assert.doesNotMatch(detail,/메뉴·툴바 경로|bilingualPaths/);
 const editor=read('app/deckforge-editor/editor.js');
 assert.match(editor,/fusionTooltipRead\?\.\(id\)/);
 const main=read('app/deckforge-editor/main.cjs');
 const cached=main.slice(main.indexOf('async function readCachedFusionTooltip('),main.indexOf("ipcMain.handle('d200x:fusion-tooltip-read'"));
 assert.match(cached,/readFusionTooltipCatalog/);
 assert.doesNotMatch(cached,/fetch\(|fusionCommands\.|fusionMcp\./);
});


test('inline Fusion manager preserves left editor and existing drag route while replacing only sidebar body',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const html=read('app/deckforge-editor/index.html'),css=read('app/deckforge-editor/style.css'),editor=read('app/deckforge-editor/editor.js');
 const main=read('app/deckforge-editor/main.cjs'),manager=read('tools/fusion-manager/main.cjs'),renderer=read('tools/fusion-manager/renderer.js');
 assert.ok(html.indexOf('id="profile-trigger"')<html.indexOf('id="fusion-inline-panel"'));
 assert.match(css,/#app\.fusion-inline-open>\.library>\.search/);
 assert.match(css,/min\(699px,max\(320px,calc\(100vw - 640px\)\)\)/);
 assert.match(editor,/window\.DeckForgeFusionPanel=value/);
 assert.match(editor,/importFusionDraggedCommand\(ev,i\)/);
 assert.match(renderer,/application\/x-deckforge-fusion-command/);
 assert.match(manager,/new WebContentsView/);
 assert.match(manager,/parent\.contentView\.addChildView\(view\)/);
 assert.match(manager,/view\.webContents\.close\(\)/);
 assert.match(manager,/event\.senderFrame===event\.sender\.mainFrame/);
 assert.match(main,/window\.DeckForgeFusionPanel\?\.\(false\)/);
 assert.doesNotMatch(main,/Bundled\.createMagnet\(window,manager/);
 const start=main.indexOf('function fitFusionPanelWindow('),end=main.indexOf('function canResizeFusionPanel(',start);
 const fit=new Function(main.slice(start,end)+'\nreturn fitFusionPanelWindow')();
 assert.deepEqual(fit({x:1600,y:40,width:980,height:800},1358,{x:0,y:0,width:1920,height:1040}),{x:562,y:40,width:1358,height:800});
 assert.deepEqual(fit({x:-1700,y:20,width:980,height:800},1358,{x:-1280,y:0,width:1280,height:1000}),{x:-1280,y:20,width:1280,height:800});
});


test('inline Fusion manager maintenance moves to plugin help without replacing the original actions',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const editor=read('app/deckforge-editor/editor.js'),main=read('app/deckforge-editor/main.cjs'),renderer=read('tools/fusion-manager/renderer.js'),html=read('tools/fusion-manager/index.html'),css=read('app/deckforge-editor/style.css');
 const help=editor.slice(editor.indexOf('function openSdkPluginHelp('),editor.indexOf('function launchFusionManager('));
 assert.match(html,/\.embedded-manager>header,\.embedded-manager \.fusion-maintenance-row/);
 assert.match(html,/\.command-card\{height:76px/);
 assert.match(css,/\.fusion-inline-header strong\{font-size:15px\}/);
 assert.match(help,/Fusion 명령 데이터 관리/);
 for(const action of ['prepareEnglish','importEnglish','importCapture','exploreIcons']){
   assert.ok(help.includes("['"+action+"'"));
   assert.ok(renderer.includes("$('"+action+"').onclick="));
 }
 assert.match(main,/event\.senderFrame!==event\.sender\.mainFrame\|\|!\['prepareEnglish','importEnglish','importCapture','exploreIcons'\]\.includes\(operation\)/);
 assert.match(main,/openEmbeddedManager\(fusionManagerBridge,editor\)/);
 assert.match(renderer,/await catalogueReady/);
 assert.match(renderer,/return await \$\(operation\)\.onclick\(\)/);
});


test('Fusion inline panel hides injected management toolbars only in inline mode and uses matching title and entry icons',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const css=read('app/deckforge-editor/style.css'),editor=read('app/deckforge-editor/editor.js');
 assert.match(css,/#app\.fusion-inline-open>\.library>#plugin-install-toolbar,#app\.fusion-inline-open>\.library>#action-appearance-toolbar\{display:none!important\}/);
 assert.match(css,/\.fusion-inline-header strong::before,\.fusion-command-launch::before/);
 assert.match(editor,/manager\.className='fusion-manager-launch fusion-command-launch';\s*manager\.textContent='Fusion 명령 관리자'/);
 assert.match(editor,/summary\.textContent='플러그인 관리'/);
 assert.match(editor,/toolbar\.hidden=!plugins/);
});

test('Fusion search cards show recorded menu paths and retain detail click, keyboard and drag without redundant information icon',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../tools/fusion-manager');
 const js=fs.readFileSync(path.join(root,'renderer.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const cards=js.slice(js.indexOf('for(const v of explorerItems.slice(0,240))'),js.indexOf('// An active Fusion add-in'));
 assert.match(cards,/search\?commandPaths\(v\)/);
 assert.match(cards,/cmd-menu-path-label/);assert.match(cards,/메뉴 미수집/);
 assert.match(cards,/showTooltip\(e,v,name,menuPaths\)/);
 assert.match(cards,/card\.onclick=\(\)=>\{showDetail\(v\)\}/);
 assert.match(cards,/card\.onkeydown/);assert.match(cards,/card\.ondragstart/);
 assert.doesNotMatch(cards,/info-button|ⓘ/);
 assert.match(html,/\.command-card\.search-result\{height:94px/);
 assert.match(html,/\.command-card\{height:76px/);
 assert.match(js,/el\.append\(info\)/); // independent page slot detail control remains
});
