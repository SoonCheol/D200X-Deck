'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fakeDocument(){
  const body={children:[],append(...items){this.children.push(...items);}};
  function createElement(tag){
    return {
      tagName:tag.toUpperCase(),className:'',textContent:'',children:[],attributes:{},events:{},removed:false,
      append(...children){this.children.push(...children);},
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name];},
      addEventListener(name,handler){(this.events[name]??=[]).push(handler);},
      close(value){this.returnValue=value;(this.events.close||[]).forEach(fn=>fn());},
      showModal(){this.open=true;},
      focus(){this.focused=true;},
      remove(){this.removed=true;}
    };
  }
  return {body,createElement};
}
function descendants(node){return [node,...(node.children||[]).flatMap(descendants)];}
function load(){
  const document=fakeDocument(),window={};
  const file=path.join(__dirname,'../app/streamdeck-editor/deckforge-dialog.js');
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{document,window},{filename:file});
  return {document,window};
}
test('DeckForge dialog presents structured backup details and confirms only on explicit action',async()=>{
  const {document,window}=load();
  const pending=window.DeckForgeDialogs.show({
    title:'Google Drive 백업 완료',kind:'success',intro:'파일 검증 완료',
    fields:[{label:'Google 계정',value:'example@example.com'},{label:'저장 위치',value:'DeckForge Backups'}],
    detailLabel:'저장된 파일명',detail:'long-backup-file.json'
  });
  const dialog=document.body.children.at(-1),nodes=descendants(dialog);
  assert.equal(dialog.open,true);
  assert.ok(nodes.some(node=>node.textContent==='Google Drive 백업 완료'));
  assert.ok(nodes.some(node=>node.textContent==='long-backup-file.json'));
  assert.ok(nodes.some(node=>node.textContent==='example@example.com'));
  const accept=nodes.find(node=>node.className.includes('deckforge-message-primary'));
  assert.ok(accept.focused);
  accept.events.click[0]();
  assert.equal(await pending,true);
  assert.equal(dialog.removed,true);
});
test('cancel and window close never authorize a destructive operation',async()=>{
  const {document,window}=load();
  const pending=window.DeckForgeDialogs.show({title:'전체 복원',kind:'warning',ask:true,actionLabel:'복원 실행'});
  const dialog=document.body.children.at(-1),nodes=descendants(dialog);
  nodes.find(node=>node.textContent==='취소').events.click[0]();
  assert.equal(await pending,false);
  const second=window.DeckForgeDialogs.show({title:'백업 업로드',kind:'warning',ask:true});
  document.body.children.at(-1).close('cancel');
  assert.equal(await second,false);
});
test('common dialog is loaded before editor and backup messages avoid native confirm/alert',()=>{
  const base=path.join(__dirname,'../app/streamdeck-editor');
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  const editor=fs.readFileSync(path.join(base,'editor.js'),'utf8');
  assert.ok(html.indexOf('deckforge-dialog.js')>=0);
  assert.ok(html.indexOf('deckforge-dialog.js')<html.indexOf('editor.js'));
  const part=editor.slice(editor.indexOf('async function showBackupConfirmation'),editor.indexOf('function chooseGoogleBackup'));
  assert.doesNotMatch(part,/\b(?:confirm|alert)\(/);
  assert.match(editor,/title:'Google Drive 백업 완료'/);
  assert.match(editor,/title:'백업 복원 완료'/);
  const helper=fs.readFileSync(path.join(base,'deckforge-dialog.js'),'utf8');
  assert.doesNotMatch(helper,/.innerHTML\s*=/);
});

test('alternate dialog action is distinct from confirm and cancel',async()=>{
  const {document,window}=load();
  const first=window.DeckForgeDialogs.show({title:'민감정보 검사',kind:'warning',ask:true,alternateLabel:'일반 백업 유지',actionLabel:'암호화 백업'});
  let modal=document.body.children.at(-1);
  const options=descendants(modal);
  assert.equal(options.filter(x=>x.tagName==='BUTTON').length,4);
  options.find(x=>x.textContent==='일반 백업 유지').events.click[0]();
  assert.equal(await first,'alternate');
  const second=window.DeckForgeDialogs.show({title:'민감정보 검사',kind:'warning',ask:true,alternateLabel:'일반 백업 유지',actionLabel:'암호화 백업'});
  modal=document.body.children.at(-1);
  descendants(modal).find(x=>x.textContent==='암호화 백업').events.click[0]();
  assert.equal(await second,true);
});


test('backup confirmation supports a reusable checklist without saving on invalid selection',async()=>{
  const {document,window}=load();
  const custom=document.createElement('section');
  let allowed=false;
  const pending=window.DeckForgeDialogs.show({
    title:'백업 확인',ask:true,content:custom,
    onAccept:()=>allowed,actionLabel:'백업 시작'
  });
  const dialog=document.body.children.at(-1),nodes=descendants(dialog);
  assert.ok(nodes.includes(custom));
  assert.ok(dialog.className.includes('deckforge-message-dialog-selection'));
  const accept=nodes.find(node=>node.className.includes('deckforge-message-primary'));
  accept.events.click[0]();
  assert.equal(dialog.removed,false);
  allowed=true;accept.events.click[0]();
  assert.equal(await pending,true);
  assert.equal(dialog.removed,true);
});

test('privacy details are read-only text and can be copied with explicit click',async()=>{
  const {document,window}=load();
  const writes=[];
  window.deckBridge={copyDialogText:async value=>{writes.push(value);return true;}};
  const sample='사용자 폴더 경로 · 프로필 1 · 2페이지 · 8번 버튼\n주소 의심 · 프로필 2 · 1페이지 · 13번 버튼';
  const pending=window.DeckForgeDialogs.show({
    title:'백업 민감정보 검사 결과',kind:'warning',ask:true,alternateLabel:'일반 백업 유지',
    detailLabel:'추정 항목과 저장 위치',detail:sample,copyDetail:true,actionLabel:'암호화 백업'
  });
  const dialog=document.body.children.at(-1),nodes=descendants(dialog);
  const field=nodes.find(n=>n.tagName==='TEXTAREA');
  assert.ok(field);assert.equal(field.value,sample);assert.equal(field.readOnly,true);
  assert.equal(writes.length,0);
  const copy=nodes.find(n=>n.textContent==='내용 복사');
  assert.ok(copy);await copy.events.click[0]();
  assert.deepEqual(writes,[sample]);assert.equal(copy.textContent,'복사됨');
  assert.equal(dialog.removed,false);
  nodes.find(n=>n.textContent==='취소').events.click[0]();
  assert.equal(await pending,false);
});
