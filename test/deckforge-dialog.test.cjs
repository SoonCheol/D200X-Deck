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
