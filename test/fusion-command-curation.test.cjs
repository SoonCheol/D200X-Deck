'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../tools/fusion-manager/command-curation.cjs');
const toolbar={id:'Tool',name:'같은 명령',category:'direct_toolbar',paths:[{source:'fusion-api',location:'toolbar',path:[{kind:'workspace',id:'design'},{kind:'command',id:'Tool'}]}]};
const dropdown={id:'Dropdown',name:'같은 명령',category:'toolbar_dropdown',paths:[{source:'static',location:'toolbar',path:[{kind:'dropdown',id:'menu'},{kind:'command',id:'Dropdown'}]}]};
const menu={id:'Menu',name:'메뉴만',category:'menu_only',paths:[{source:'static',location:'menu',path:[]}]};
const unplaced={id:'Internal',name:'미배치',category:'unplaced',paths:[]};
const debug={id:'Debug',name:'디버그',category:'debug_only',paths:[]};
test('triage preserves all IDs but shows toolbar and dropdown first',()=>{
 const all=[toolbar,dropdown,menu,unplaced,debug];
 assert.deepEqual(all.map(C.classify),['primary','primary','review','hidden','hidden']);
 assert.deepEqual(C.visibleItems(all,'primary',null).map(x=>x.id),['Tool','Dropdown']);
 assert.deepEqual(C.visibleItems(all,'all',null).map(x=>x.id),all.map(x=>x.id));
 assert.deepEqual(C.visibleItems(all,'review',null).map(x=>x.id),['Menu']);
});
test('same Korean display name never merges distinct IDs',()=>{
 const groups=C.nameCollisionGroups([toolbar,dropdown,menu]);
 assert.deepEqual(groups,[{name:'같은 명령',ids:['Tool','Dropdown']}]);
});
test('capture supports historical v1 and enriched v2 and never deletes missing records',()=>{
 const capture=C.validateCapture({format:'deckforge-fusion-ui-placements-v2',fusionVersion:'2.0',errors:[{error:'test'}],placements:[
  {commandId:'Menu',placementKind:'dropdown',path:[{workspace:{id:'Fusion'}},{controlId:'x',position:3}],isVisible:false},
  {commandId:'Menu',path:[{workspace:{id:'Fusion'}}]},
  {commandId:'Tool',path:[{toolbar:{id:'QAT'}}],isVisible:true}
 ]});
 assert.equal(capture.entries.size,2);
 assert.equal(capture.errors,1);
 assert.equal(C.captureClassify(menu,capture),'primary');
 assert.equal(C.captureClassify(unplaced,capture),'hidden');
 assert.equal(C.captureClassify(debug,capture),'hidden');
 assert.equal(C.captureClassify(dropdown,capture),'primary');
 assert.equal(C.validateCapture({format:'deckforge-fusion-ui-placements-v1',errors:[],placements:[]}).entries.size,0);
});
test('invalid capture is rejected and priority overrides remain reversible',()=>{
 assert.throws(()=>C.validateCapture({format:'wrong',placements:[],errors:[]}),/형식/);
 assert.deepEqual(C.visibleItems([toolbar,menu,unplaced],'primary',null,{Menu:'primary'}).map(x=>x.id),['Tool','Menu']);
 assert.deepEqual(C.visibleItems([toolbar,menu,unplaced],'hidden',null,{Tool:'hidden'}).map(x=>x.id),['Tool','Internal']);
});
test('ordering follows UI placement keys instead of name keyword importance',()=>{
 const b={id:'b',name:'Line',paths:[{path:[{kind:'workspace',id:'z'},{kind:'command',id:'b'}]}]};
 const a={id:'a',name:'Zoom',paths:[{path:[{kind:'workspace',id:'a'},{kind:'command',id:'a'}]}]};
 assert.deepEqual([b,a].sort((x,y)=>C.sortByPlacement(x,y,null)).map(x=>x.id),['a','b']);
});
