'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../app/streamdeck-editor/deck-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor',p),'utf8');
const editor=read('editor.js'),windowSource=read('ai/window.cjs'),transportSource=read('transport.cjs'),iconSource=read('icon-pack.cjs');

test('runtime keys separate profiles, nested folder pages and control gestures',()=>{
 const s=Core.migrateState(null),key=(i,g)=>Core.runtimeActionKey(s,i,g);
 s.pages.push(Core.blankPage());s.controls.pages.push(Array.from({length:5},Core.emptyBinding));
 const root=key(0,'down'),secondGesture=key(0,'left');assert.notEqual(root,secondGesture);
 const folder=s.pages[0][1]=Core.createAction('folder');folder.children=Array(14).fill(null);folder.pages=[Array(14).fill(null)];
 Core.enterFolder(s,1);const nested=key(0,'down');assert.notEqual(root,nested);
 Core.changeFolderPage(s,1);assert.notEqual(nested,key(0,'down'));
 const g=key(16,'left');assert.notEqual(g,key(16,'right'));Core.exitFolder(s);s.page=1;assert.equal(g,key(16,'left'));
 s.controls.scopes[2]='page';const local=key(16,'left');s.page=0;assert.notEqual(local,key(16,'left'));
 s.pinned[3]=Core.createAction('timer');const pinned=key(3,'down');s.page=1;assert.equal(pinned,key(3,'down'));
 s.profileId='another';assert.notEqual(pinned,key(3,'down'));
 const pinnedFolder=s.pinned[4]=Core.createAction('folder');pinnedFolder.children=Array(14).fill(null);
 Core.enterFolder(s,4);const k=key(2,'down');Core.exitFolder(s);s.page=0;Core.enterFolder(s,4);assert.equal(k,key(2,'down'));
});
test('composite child runtime keys capture location, branch and step',()=>{
 const section=editor.slice(editor.indexOf('function compositeExecutor('),editor.indexOf('function triggerLogicSlot('));
 const keys=[];const make=new Function('executeMultiStep',section+';return compositeExecutor;')((a,s,k)=>keys.push(k));
 const a=make('folder-a','state:0'),b=make('folder-b','state:0'),c=make('folder-a','state:1');
 a();a();b();c();assert.equal(new Set(keys).size,4);
 const repeat=make('folder-a','state:0');repeat();assert.equal(keys[0],keys[4]);
 assert.match(editor,/playAudioAction\(outcome,DeckCore.runtimeActionKey\(state,index,resolved.gesture\)\)/);
});
test('local save receipt uses committed action and title and distinguishes failure',()=>{
 const segment=windowSource.slice(windowSource.indexOf('function formatSaveReceipt('),windowSource.indexOf('function registerAiWindow('));
 const format=new Function(segment+';return formatSaveReceipt;')();
 const saved=format({saved:true,rows:[{op:'plugin',page:4,slot:5,action:'중심 지름 원',title:'원'}]});
 assert.match(saved,/페이지 4 \/ 버튼 5 · 플러그인 등록 · 액션: 중심 지름 원 · 제목: 원/);
 assert.match(saved,/실제 실행 여부는 별도 확인/);
 assert.match(format({saved:false}),/저장 실패/);
 assert.match(format({saved:true,refreshError:true,rows:[]}),/동기화 확인 필요/);
 assert.match(windowSource,/undoId=id;pending=null;\s*return \{\.\.\.result,canUndo:true,\.\.\.await appendSaveReceipt/);
});
test('wide restore retains mode and import messages use actual limits',()=>{
 assert.match(transportSource,/this.schedule\(this.currentImages,\s*this.wideMode\)/g);
 assert.equal([...transportSource.matchAll(/schedule\(this.currentImages,\s*this.wideMode\)/g)].length,2);
 assert.match(editor,/input.layoutPages\?\.length\|\|Math.ceil\(input.commands.length\/window.D200XFusionBatch.KEYS_PER_PAGE\)/);
 assert.match(editor,/\['open','open-app','file-open'\].includes\(item.type\)/);
 assert.match(iconSource,/아이콘팩 크기는 60MB/);
});
