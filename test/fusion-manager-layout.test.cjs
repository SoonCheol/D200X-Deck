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
