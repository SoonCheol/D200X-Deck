'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ProfileStore}=require('../app/streamdeck-editor/profile-store.cjs');
const png='data:image/png;base64,'+Buffer.from('test PNG bytes').toString('base64');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-profile-'));
 try{return fn(new ProfileStore(dir),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('new install begins with empty file-backed profile and never imports localStorage',()=>{
 fixture(store=>assert.equal(store.read(),null));
});
test('image file is deduplicated outside the profile JSON and reconstructed on reload',()=>{
 fixture((store,dir)=>{
  const state={pages:[[{type:'sd-plugin',icon:{kind:'file',value:png},settings:{
    sdkStateIcons:{off:{kind:'file',value:png},on:{kind:'file',value:png}}
  }}]],other:'retained'};
  store.write(state);
  const document=fs.readFileSync(store.file,'utf8');
  assert.ok(!document.includes('data:image/png;base64'));
  assert.ok(document.includes('deckforge-icon://'));
  assert.equal(fs.readdirSync(path.join(dir,'Resources','Icons')).length,1);
  const roundtrip=store.read();
  assert.deepEqual(roundtrip,state);
  assert.equal(state.pages[0][0].icon.value,png,'in-memory state must not be modified');
 });
});
test('profile replacement retains backup and does not overwrite on invalid input',()=>{
 fixture(store=>{
  store.write({pages:[],version:1});
  store.write({pages:[],version:2});
  assert.equal(store.read().version,2);
  assert.equal(JSON.parse(fs.readFileSync(store.file+'.bak','utf8')).version,1);
  assert.throws(()=>store.write(null));
  assert.equal(store.read().version,2);
 });
});
test('missing icon files refuse to load rather than silently replacing saved profile',()=>{
 fixture((store,dir)=>{
  store.write({icon:{kind:'file',value:png}});
  const file=fs.readdirSync(path.join(dir,'Resources','Icons'))[0];
  fs.rmSync(path.join(dir,'Resources','Icons',file));
  assert.throws(()=>store.read(),/ENOENT/);
  assert.ok(fs.existsSync(store.file));
 });
});
test('non-image data URLs and other settings remain unchanged',()=>{
 fixture(store=>{
  const state={token:'secret',settings:{other:'data:text/plain;base64,SGVsbG8=',count:2}};
  store.write(state);
  assert.deepEqual(store.read(),state);
 });
});
