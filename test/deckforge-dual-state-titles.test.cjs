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
 assert.match(editor,/layout\.append\(iconRegion,preview\)/);
 assert.match(editor,/options\.append\(pluginButton\)/);
 assert.match(editor,/toolbar\.append\(saveBar\)/);
 assert.match(editor,/attachStateTitleControls\(group,item,key==='off'/);
 assert.match(editor,/attachStateTitleControls\(card,item,key==='up'/);
 assert.match(editor,/\$\('inspector'\)\._openStateTitleStyle\?\.\(which,styleButton\)/);
 assert.match(editor,/const entry=\{name,style:validPresetStyle\(style\)\}/);
 assert.match(css,/\.state-title-inspector \.state-title-layout\{\s*grid-template-columns:minmax\(0,1fr\) 98px/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-icons\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-preview\{[\s\S]*?aspect-ratio:1\/1/);
 assert.match(css,/\.state-title-inspector \.state-title-layout \.sdk-state-buttons button\{[\s\S]*?height:25px/);
 assert.match(css,/\.state-title-inspector\{overflow-x:hidden\}/);
});

test('opening inspector controls does not initialize state titles until the user edits',()=>{
 const fnStart=editor.indexOf('function attachStateTitleControls(card,item,which){');
 const fnEnd=editor.indexOf('function bindSdkStateIcons(root,item){',fnStart);
 const controls=editor.slice(fnStart,fnEnd);
 assert.ok(fnStart>=0&&fnEnd>fnStart);
 assert.match(controls,/const config=\(item\.settings\?\.stateTitles\|\|defaultStateTitlePair\(item\)\)\[which\]/);
 assert.doesNotMatch(controls.split("check.addEventListener('change'")[0],/ensureStateTitlePair\(item\)/);
 assert.match(controls,/check\.addEventListener\('change',[\s\S]*?ensureStateTitlePair\(item\)/);
 assert.match(controls,/input\.addEventListener\('input',[\s\S]*?ensureStateTitlePair\(item\)/);
});
test('SDK live title survives selection without an explicit title override',()=>{
 const item={type:'sd-plugin',title:'SDK 동적 제목',titleStyle:style,settings:{}};
 const before=JSON.stringify(item);
 const result=vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,false)',{
   item,DEFAULT_TITLE_STYLE:style,isMomentaryIconAction:()=>false
 });
 assert.equal(result.title,'SDK 동적 제목');
 assert.equal(JSON.stringify(item),before);
});
test('outside click treats card style button as toggle and resets accessibility state',()=>{
 assert.match(editor,/!event\.target\.closest\?\.\('\.state-title-style'\)/);
 assert.match(editor,/root\.querySelectorAll\('\.state-title-style'\)\.forEach\(button=>[\s\S]*?button\.setAttribute\('aria-expanded','false'\)/);
});

test('state title is composed directly onto both card images using device compositor',()=>{
 assert.match(editor,/async function refreshStateTitleCards\(item\)/);
 assert.match(editor,/const titleVisual=item\.type==='indicator'\?indicatorPressVisual\(visual,second\):item\.type==='timer'\?resolveTimerVisual\(visual,second,DeckCore\.timerSeconds\(item\.settings\?\.seconds\),artwork\):item\.type==='multi'\?resolveMultiVisual\(visual,second,artwork,progress\):resolveStateTitle\(visual,second,artwork\);/);
 assert.match(editor,/window\.renderDeckKeyImage\(item\.type==='indicator'\?\{\.\.\.titleVisual,keyPressAlternate:true\}:titleVisual,slot,false\)/);
 assert.match(editor,/card\.dataset\.stateTitle=pressed\?'second':'first'/);
 assert.match(editor,/replaceStateCardArtwork\(img,rendered\)/);
 assert.match(editor,/node\.matches\('\.key-background-trigger,\.press-image-number'\)/);
 assert.match(editor,/host\.prepend\(rendered\)/);

 assert.match(editor,/void refreshStateTitleCards\(item\)/);
 assert.match(editor,/group\.dataset\.stateTitle=key==='off'\?'first':'second'/);
 assert.match(editor,/card\.dataset\.stateTitle=key==='up'\?'first':'second'/);
 assert.match(editor,/root\.dataset\.stateCardVersion!==version/);
});

test('text action automatically displays body without mutating stored data',()=>{
 const item={type:'text',title:'',titleStyle:style,settings:{body:'DeckForge'}};
 const before=JSON.stringify(item);
 const display=(second)=>vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,second)',{
   item,second,DEFAULT_TITLE_STYLE:style,isMomentaryIconAction:()=>true
 });
 assert.equal(display(false).title,'DeckForge');
 assert.equal(display(true).title,'DeckForge');
 assert.equal(JSON.stringify(item),before);
 item.title='사용자 제목';
 assert.equal(display(false).title,'사용자 제목');
 item.title='';item.settings.body='새 텍스트';
 assert.equal(display(false).title,'새 텍스트');
 item.titleStyle={...style,visible:false};
 assert.equal(display(false).title,'');
 assert.equal(display(false).titleStyle.visible,false);
});
test('text action automatic labels honor independent and shared state titles',()=>{
 const first={enabled:true,title:'',style:{...style}};
 const second={enabled:true,title:'직접 제목',style:{...style}};
 const item={type:'text',title:'',titleStyle:style,settings:{body:'입력할 텍스트',stateTitles:{first,second}}};
 const display=(second)=>vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,second)',{
   item,second,DEFAULT_TITLE_STYLE:style,isMomentaryIconAction:()=>true
 });
 const before=JSON.stringify(item);
 assert.equal(display(false).title,'입력할 텍스트');
 assert.equal(display(true).title,'직접 제목');
 assert.equal(JSON.stringify(item),before);
 second.enabled=false;
 assert.equal(display(true).title,'입력할 텍스트');
 first.enabled=false;
 assert.equal(display(false).title,'');
 assert.equal(display(true).titleStyle.visible,false);
 assert.equal(second.title,'직접 제목');
});
test('text action preview is bounded without truncating the actual body',()=>{
 const body='😀'.repeat(300)+'\n끝';
 const item={type:'text',title:'',titleStyle:style,settings:{body}};
 const visible=vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,false)',{
   item,DEFAULT_TITLE_STYLE:style,isMomentaryIconAction:()=>true
 });
 assert.equal(visible.title,'😀'.repeat(256));
 assert.equal(item.settings.body,body);
 assert.match(editor,/if\(item\.type==='text'\)\{renderGrid\(\);refreshTitlePreview\(item\);\}/);
});

test('state card artwork refresh retains the actual palette and number nodes in place',()=>{
 const start=editor.indexOf('function replaceStateCardArtwork(host,rendered){');
 const end=editor.indexOf('// Preview state title artwork',start);
 assert.ok(start>=0&&end>start);
 const replace=vm.runInNewContext(editor.slice(start,end)+';replaceStateCardArtwork');
 const host={childNodes:[],prepend(node){this.childNodes.unshift(node);}};
 const node=(name,nodeType=1)=>({name,nodeType,matches(selector){return selector.split(',').includes(name);},remove(){host.childNodes.splice(host.childNodes.indexOf(this),1);}});
 const palette=node('.key-background-trigger'),number=node('.press-image-number'),old=node('.old'),text=node('text',3);
 host.childNodes=[old,palette,number,text];
 const next=node('.new');replace(host,next);
 assert.deepEqual(host.childNodes,[next,palette,number]);
 const newer=node('.newer');replace(host,newer);
 assert.deepEqual(host.childNodes,[newer,palette,number]);
});
