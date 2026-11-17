'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
const start=editor.indexOf('function hasStateTitlePair(item){'),end=editor.indexOf('function displayKeyPressItem(item,index){',start);
assert.ok(start>=0&&end>start);
const style={visible:true,align:'bottom',family:'default',size:12,color:'#fff'};
function render(config,second){
 const item={type:'sd-plugin',title:'기본 제목',titleStyle:style,settings:{stateTitles:config}};
 return vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,second)',{
   item,second,DEFAULT_TITLE_STYLE:style,isMomentaryIconAction:()=>false
 });
}
test('state-specific titles use respective independent text and style when both checked',()=>{
 const first={enabled:true,title:'꺼짐',style:{...style,color:'#111'}};
 const second={enabled:true,title:'켜짐',style:{...style,color:'#eee'}};
 assert.equal(render({first,second},false).title,'꺼짐');
 assert.equal(render({first,second},true).title,'켜짐');
 assert.equal(render({first,second},false).titleStyle.color,'#111');
 assert.equal(render({first,second},true).titleStyle.color,'#eee');
});
test('only one checked title and style applies to both states and inactive contents remain',()=>{
 const first={enabled:false,title:'기억할 제목',style:{...style,color:'#123'}};
 const second={enabled:true,title:'공통 표시',style:{...style,color:'#456'}};
 assert.equal(render({first,second},false).title,'공통 표시');
 assert.equal(render({first,second},true).title,'공통 표시');
 assert.equal(first.title,'기억할 제목');
 assert.equal(first.style.color,'#123');
});
test('both titles disabled hides text without removing saved input',()=>{
 const first={enabled:false,title:'꺼짐',style:{...style}},second={enabled:false,title:'켜짐',style:{...style}};
 const visible=render({first,second},true);
 assert.equal(visible.title,'');assert.equal(visible.titleStyle.visible,false);
 assert.equal(first.title,'꺼짐');assert.equal(second.title,'켜짐');
});
test('legacy title remains intact if no separate state titles exist',()=>{
 assert.equal(render(undefined,false).title,'기본 제목');
});
test('state row retains preview, paired cards and edit/save button alignment',()=>{
 assert.match(editor,/layout\.append\(preview,iconRegion\)/);
 assert.match(editor,/toolbar\.append\(pluginButton\)/);
 assert.match(editor,/toolbar\.append\(saveBar\)/);
 assert.match(editor,/attachStateTitleControls\(group,item,key==='off'/);
 assert.match(editor,/attachStateTitleControls\(card,item,key==='up'/);
 assert.match(editor,/root\._openStateTitleStyle\?\.\(which,styleButton\)/);
 assert.match(editor,/const entry=\{name,style:validPresetStyle\(style\)\}/);
 assert.match(css,/\.state-title-inspector \.state-title-layout\{[\s\S]*?grid-template-columns:98px minmax\(0,1fr\)/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-icons\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-preview\{[\s\S]*?aspect-ratio:1\/1/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-buttons button\{[\s\S]*?height:25px/);
 assert.match(css,/\.state-title-inspector\{overflow-x:hidden\}/);
});
