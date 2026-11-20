'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Core=require('../app/streamdeck-editor/deck-core.js');
const {ProfileStore}=require('../app/streamdeck-editor/profile-store.cjs');
const Backup=require('../app/streamdeck-editor/backup.cjs');
const password='test-only-passphrase';
const appearance={theme:'line',overrides:{}};
const icon='data:image/png;base64,YQ==';
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-backup-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new ProfileStore(root),packsFile=path.join(root,'Resources','IconPacks','icon-packs-v1.json');
  const s=Core.migrateState(null);s.pages[0][0]=Core.createAction('text');
  s.pages[0][0].settings.body='private-action-data';s.pages[0][0].icon={kind:'file',value:icon};
  const templated=Core.saveProfileTemplate(s,s.profileId,'Template').next;
  store.write(templated);
  fs.mkdirSync(path.dirname(packsFile),{recursive:true});
  fs.writeFileSync(packsFile,JSON.stringify([{id:'user-pack',name:'User pack',icons:[{name:'Test',image:icon}]}]));
  // These separate credential/program files must never be read.
  fs.writeFileSync(path.join(root,'home-assistant-connection-v1.json'),'HA-TOKEN-EXCLUDED');
  fs.mkdirSync(path.join(root,'AI'));fs.writeFileSync(path.join(root,'AI','connection.enc'),'AI-TOKEN-EXCLUDED');
  fs.mkdirSync(path.join(root,'Plugins'));fs.writeFileSync(path.join(root,'Plugins','example.globals'),'SDK-GLOBAL-TOKEN-EXCLUDED');
  const make=()=>Backup.snapshot({store,packsFile,appearance,version:'1.1.76'});
  return {root,store,packsFile,make};
}
test('portable authenticated backups preserve settings and never include separate credential files',t=>{
  const {root,make}=setup(t),data=make(),bytes=Backup.encrypt(data,password);
  assert.equal(bytes.includes(Buffer.from('private-action-data')),false);
  const decoded=Backup.decrypt(bytes,password);
  assert.deepEqual(decoded,data);
  const json=JSON.stringify(decoded);
  for(const secret of ['HA-TOKEN-EXCLUDED','AI-TOKEN-EXCLUDED','SDK-GLOBAL-TOKEN-EXCLUDED'])assert.equal(json.includes(secret),false);
  assert.equal(decoded.profiles.pages[0][0].icon.value,icon);
  assert.equal(decoded.profiles.profileTemplates.length,1);
  assert.throws(()=>Backup.decrypt(bytes,'wrong-password'),/비밀번호/);
  const tampered=Buffer.from(bytes);tampered[tampered.length-1]^=1;
  assert.throws(()=>Backup.decrypt(tampered,password),/손상/);
  const one=Backup.writeArchive(root,data,password),two=Backup.writeArchive(root,data,password);
  assert.notEqual(one.file,two.file);assert.deepEqual(Backup.readArchive(one.file,password),data);
  assert.equal(fs.existsSync(one.file),true);
  assert.throws(()=>Backup.encrypt({...data,packs:[{...data.packs[0],id:'builtin-forbidden'}]},password));
  assert.throws(()=>Backup.encrypt({...data,profiles:{...data.profiles,profileId:'missing'}},password));
});
test('restore creates independent encrypted safety file before replacing profiles and packs',t=>{
  const {root,store,packsFile,make}=setup(t);const incoming=make();
  const modified=store.read();modified.pages[0][0].settings.body='changed';store.write(modified);
  fs.writeFileSync(packsFile,'[]');const current=make();
  assert.notEqual(Backup.fingerprint(incoming),Backup.fingerprint(current));
  const result=Backup.restore({store,packsFile,safetyDirectory:path.join(root,'Backups'),current,incoming,password});
  assert.equal(store.read().pages[0][0].settings.body,'private-action-data');
  assert.equal(JSON.parse(fs.readFileSync(packsFile,'utf8')).length,1);
  assert.deepEqual(Backup.readArchive(result.safetyFile,password),current);
  assert.equal(store.read().profileTemplates.length,1);
});
test('restore failure rolls back icon packs and retains existing profiles and safety file',t=>{
  const {root,store,packsFile,make}=setup(t),incoming=make();
  const modified=store.read();modified.pages[0][0].settings.body='keep-me';store.write(modified);
  fs.writeFileSync(packsFile,'[]');const current=make();
  const safetyDirectory=path.join(root,'Backups');
  assert.throws(()=>Backup.restore({store:{write(){throw Error('simulated disk error');}},packsFile,safetyDirectory,current,incoming,password}),/복원 실패/);
  assert.equal(store.read().pages[0][0].settings.body,'keep-me');
  assert.equal(fs.readFileSync(packsFile,'utf8'),'[]');
  assert.equal(fs.readdirSync(safetyDirectory).length,1);
  assert.deepEqual(Backup.readArchive(path.join(safetyDirectory,fs.readdirSync(safetyDirectory)[0]),password),current);
  assert.throws(()=>Backup.restore({store,packsFile,safetyDirectory,current,incoming:{...incoming,appearance:{theme:'invalid',overrides:{}}},password}));
  assert.equal(fs.readdirSync(safetyDirectory).length,1);
});
