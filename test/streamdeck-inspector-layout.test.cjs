'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../app/streamdeck-editor');
const editor=fs.readFileSync(path.join(base,'editor.js'),'utf8');
const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
const block=editor.match(/const COMPACT_FIELD_GROUPS=([\s\S]*?);\s*const COMPACT_FIELD_LABELS/);
assert.ok(block,'compact field mapping must exist');
const groups=vm.runInNewContext('('+block[1]+')');
test('all approved short-parameter actions have correct grouped fields',()=>{
  const expected={
    'system-scroll':['axis','direction','step'],
    'system-volume':['direction','step'],
    'device-brightness':['direction','step'],
    'system-zoom':['operation','step'],
    'edit-history':['operation','step'],
    'timer':['seconds','sound'],
    'audio-play':['fade','fadeDuration'],
    'text':['enter','mode']
  };
  for(const [action,fields] of Object.entries(expected)){
    assert.deepEqual(Array.from(groups[action][0]),fields,action);
  }
  assert.match(editor,/groupCompactActionFields\(root,item\.type\)/);
  assert.equal(groups.folder,undefined,'folder must use aligned standard fields rather than compressed grouped checkboxes');
  assert.match(editor,/case "folder":return check\("autoExitEnabled","자동 나가기"\)/);
});
test('compact groups have a real grid layout with fixed total field width',()=>{
  assert.match(css,/\.fields>\.compact-property-group\s*\{[^}]*width:404px;[^}]*display:grid/s);
  assert.match(css,/\.compact-property-group\.compact-count-3\s*\{\s*grid-template-columns:/);
  assert.match(css,/\.compact-property-group\.compact-count-2\s*\{\s*grid-template-columns:/);
  assert.match(css,/\.compact-property-group>\.field\s*\{[^}]*flex-direction:column/s);
  assert.match(css,/\.fields>\.field>label\s*\{[^}]*white-space:nowrap/s);
  assert.match(css,/\.inspector\s*\{\s*padding:16px max\(20px,calc\(\(100% - 600px\)\/2\)\)/);
});
test('shortcut hint line removed; actual current shortcut appears inside title',()=>{
  assert.doesNotMatch(editor,/<label>단축키 안내<\/label>/);
  assert.match(editor,/function bindInspectorShortcut\(root,item\)/);
  assert.match(editor,/bindInspectorShortcut\(root,item\)/);
  assert.match(css,/\.title-line\.has-shortcut>input\s*\{[^}]*padding-right:/);
  assert.match(css,/\.title-shortcut-display\s*\{[^}]*position:absolute/s);
});
test('unsaved dialog remains interactive and original navigation is protected',()=>{
  assert.match(editor,/event\.target\.closest\('#inspector-unsaved-dialog, \.inspector-help-dialog, #sdk-plugin-help-dialog, #icon-maker, \.deckforge-input-dialog'\)\)return;/);
  assert.match(editor,/#icon-library/);
  assert.match(editor,/#action-search/);
  assert.match(editor,/add\('저장 안 함',/);
  assert.match(editor,/add\('저장 후 이동',/);
  assert.match(editor,/if\(inspectorSession\?\.dirty\|\|smartProfileBusy/);
});

test('breadcrumb starts with owning category and gives optional modal help',()=>{
  assert.match(editor,/function inspectorBreadcrumb\(item,action,inspectorName\)/);
  assert.match(editor,/const root=libraryTab==='plugins'\?'플러그인':'액션'/);
  assert.match(editor,/updatePluginToolbar\(\);\s*renderLibrary\(\);\s*renderInspector\(\)/);
  assert.match(editor,/function appendInspectorHelp\(head,item\)/);
  assert.match(editor,/dialog\.showModal\(\)/);
  for(const key of ['multi','multi-switch','random','logic','timer']){
    assert.match(editor,new RegExp("(?:'"+key+"'|"+key+")\\s*:\\s*\\{"));
  }
  assert.match(editor,/appendInspectorHelp\(root\.querySelector\('\.action-head'\),item\)/);
});
test('preview keeps icon controls but no longer deletes assigned action',()=>{
  assert.doesNotMatch(editor,/id="delete-action"/);
  assert.match(editor,/id="icon-library-open"/);
  assert.match(editor,/id="icon-menu-trigger"/);
  assert.match(editor,/function removeSlotAction\(index\)/);
});
test('composites use one summary row and no duplicated verbose inline guidance',()=>{
  assert.match(editor,/function inspectorOverview\(item\)/);
  assert.match(editor,/className='field inspector-overview'/);
  assert.doesNotMatch(editor,/area\.append\(heading,note,list,toolbar\)/);
  assert.doesNotMatch(editor,/case "multi":return `<div class="field"><label>내용/);
  assert.doesNotMatch(editor,/case "multi-switch":return `<div class="field"><label>상태/);
  assert.match(css,/\.properties>\.fields>\.multi-action-editor\s*\{[^}]*max-width:404px/s);
});
test('state image selector is a naturally sized button, not a full-width input',()=>{
  assert.match(editor,/chooseImage\.className='state-image-choose'/);
  assert.match(editor,/imageActions\.className='state-image-actions'/);
  assert.match(css,/\.multi-switch-visuals>\.state-image-actions>button\s*\{[^}]*width:auto/s);
  assert.match(css,/\.state-image-actions>\.state-image-choose\s*\{[^}]*background:/s);
});

test('title visibility is by the input and presets update all controls in place',()=>{
  assert.match(editor,/class="field title-setting-field"><label class="title-visible-label"><input type="checkbox" id="title-visible"> 제목 표시<\/label>/);
  assert.doesNotMatch(editor,/<label><input type="checkbox" id="title-visible"> 제목 보기<\/label>/);
  assert.doesNotMatch(editor,/class="title-preset-heading"/);
  assert.match(editor,/<select id="title-preset-select" aria-label="저장한 제목 스타일 프리셋"><\/select>/);
  assert.match(editor,/Object\.assign\(style,chosen\.style\)/);
  assert.match(editor,/visible\.checked=style\.visible/);
  assert.match(editor,/family\.value=style\.family/);
  assert.match(editor,/\$\("title-size"\)\.value=String\(style\.size\)/);
  assert.match(editor,/\$\("title-color"\)\.value=style\.color/);
  assert.match(editor,/\$\("outline-color"\)\.value=style\.outlineColor/);
  assert.match(editor,/\$\("outline-width"\)\.value=style\.outlineWidth/);
  assert.match(editor,/persist\(\);renderGrid\(\);refreshTitlePreview\(item\)/);
  assert.match(css,/\.fields>\.field\.title-setting-field\{grid-template-columns:92px minmax\(0,404px\);\}/);
});

test('title alignment keeps original three buttons but uses legible 20px SVG icons',()=>{
 const fragment=editor.slice(editor.indexOf('<div class="title-align"'),editor.indexOf('</div>',editor.indexOf('<div class="title-align"')));
 for(const key of ['bottom','middle','top']){
   assert.match(fragment,new RegExp('data-align="'+key+'"[^>]*aria-label="[^"]+"'));
 }
 assert.equal((fragment.match(/<svg width="20" height="20" viewBox="0 0 24 24"/g)||[]).length,3);
 assert.doesNotMatch(fragment,/[▤▥≡]/);
 assert.match(css,/\.title-align button\{flex:1;border:1px solid #666;border-radius:3px;background:#515151;padding:6px\}/);
 assert.match(css,/\.title-align button svg\{display:block;width:20px;height:20px;margin:auto;pointer-events:none\}/);
 assert.match(css,/\.title-align button.active\{background:#217ce5;border-color:#217ce5\}/);
});
