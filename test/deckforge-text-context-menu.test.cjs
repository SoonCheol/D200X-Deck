'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {textMenuTemplate,attachTextContextMenu}=require('../app/deckforge-editor/text-context-menu.cjs');
const flags={canUndo:true,canCut:true,canCopy:true,canPaste:true,canDelete:true,canSelectAll:true};
const field={mediaType:'none',isEditable:true,formControlType:'input-text',selectionText:'text',editFlags:flags};
const wc={isDestroyed:()=>false};
test('native editable menu respects flags and limits editing to this webContents',()=>{
  const calls=[];const contents={...wc,...Object.fromEntries(['undo','cut','copy','paste','delete','selectAll'].map(x=>[x,()=>calls.push(x)]))};
  const items=textMenuTemplate(field,contents).filter(x=>x.type!=='separator');
  assert.deepEqual(items.map(x=>x.label),['실행 취소','잘라내기','복사','붙여넣기','삭제','전체 선택']);
  items.forEach(x=>x.click());assert.deepEqual(calls,['undo','cut','copy','paste','delete','selectAll']);
  const disabled=textMenuTemplate({...field,editFlags:{}},contents).filter(x=>x.type!=='separator');
  assert.ok(disabled.every(x=>!x.enabled));disabled.forEach(x=>x.click());assert.equal(calls.length,6);
});
test('D200X buttons and icons are not intercepted; AI selected answer can be copied',()=>{
  const button={...field,isEditable:false,formControlType:'none'};
  assert.deepEqual(textMenuTemplate(button,wc),[]);
  assert.deepEqual(textMenuTemplate({...button,mediaType:'image'},wc,true),[]);
  assert.deepEqual(textMenuTemplate({...button,selectionText:''},wc,true),[]);
  assert.deepEqual(textMenuTemplate(button,wc,true).map(x=>x.label),['복사']);
  assert.deepEqual(textMenuTemplate({...button,formControlType:'input-text'},wc).map(x=>x.label),['복사']);
});
test('password fields never enable cut or copy',()=>{
  const items=textMenuTemplate({...field,formControlType:'input-password'},wc);
  assert.equal(items.find(x=>x.label==='잘라내기').enabled,false);assert.equal(items.find(x=>x.label==='복사').enabled,false);
});
test('popup belongs to requesting window and excludes other frames',()=>{
  const frame={};let listener,popup,template;
  const contents={...wc,mainFrame:frame,on:(type,fn)=>{assert.equal(type,'context-menu');listener=fn;}};
  const win={webContents:contents,isDestroyed:()=>false};
  const Menu={buildFromTemplate:t=>{template=t;return {popup:o=>{popup=o;}};}};
  attachTextContextMenu(win,Menu);
  listener({}, {...field,frame:{}});assert.equal(popup,undefined);
  listener({}, {...field,frame});assert.equal(popup.window,win);assert.ok(template.length>0);
});
