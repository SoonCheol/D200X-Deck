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
    'text':['enter','mode'],
    'folder':['autoExitEnabled','autoExitSeconds']
  };
  for(const [action,fields] of Object.entries(expected)){
    assert.deepEqual(Array.from(groups[action][0]),fields,action);
  }
  assert.match(editor,/groupCompactActionFields\(root,item\.type\)/);
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
  assert.match(editor,/event\.target\.closest\('#inspector-unsaved-dialog'\)\)return;/);
  assert.match(editor,/add\('저장 안 함',/);
  assert.match(editor,/add\('저장 후 이동',/);
  assert.match(editor,/if\(inspectorSession\?\.dirty\|\|smartProfileBusy/);
});
