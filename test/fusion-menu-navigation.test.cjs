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
