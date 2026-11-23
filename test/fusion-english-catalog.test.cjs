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
