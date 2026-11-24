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
test('passwords support four or more characters for encryption and safety backups',t=>{
  const {root,make}=setup(t),data=make();
  for(const password of ['1234','test-only-passphrase']){
    const encrypted=Backup.encrypt(data,password);
    assert.deepEqual(Backup.decrypt(encrypted,password),data);
    const written=Backup.writeArchive(root,data,password,{safety:true});
    assert.deepEqual(Backup.readArchive(written.file,password),data);
  }
  for(const password of ['123','','abc']){
    assert.throws(()=>Backup.encrypt(data,password),/4~256자/);
    assert.throws(()=>Backup.decrypt(Backup.encrypt(data,'1234'),password),/4~256자/);
  }
});

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

test('plain DFJSON preserves scope and rejects legacy raw-profile payloads',t=>{
  const {root,make}=setup(t),data=make();
  const plain=Backup.encode(data,'','plain');
  assert.deepEqual(Backup.decode(plain,'','plain'),data);
  assert.equal(plain.includes(Buffer.from('private-action-data')),true);
  const file=Backup.writeArchive(root,data,'',{format:'plain'});
  assert.match(file.filename,/\.dfjson$/);
  assert.deepEqual(Backup.readArchive(file.file,'','plain'),data);
  assert.throws(()=>Backup.decode(Buffer.from(JSON.stringify(data.profiles)),'','plain',data),/지원하는 DeckForge 백업 파일/);
  assert.throws(()=>Backup.decode(Buffer.from('{}'),'','plain',data));
  assert.throws(()=>Backup.writeArchive(root,data,'',{format:'plain',safety:true}));
});


test('selected name conflicts have independent policies for profiles, templates and icon packs',t=>{
  const {make}=setup(t),current=make(),incoming=JSON.parse(JSON.stringify(current));
  current.profiles.pages[0][0].settings.body='local profile data';
  current.packs[0].icons[0].name='Local icon';
  incoming.profiles.pages[0][0].settings.body='backed-up profile data';
  incoming.packs[0].icons[0].name='Backup icon';
  const importedId=Core.createProfile(incoming.profiles,'New backup profile');
  incoming.packs.push({id:'new-backup-pack',name:'New backup pack',icons:[{name:'New',image:icon}]});
  const templateId=incoming.profiles.profileTemplates[0].id,packId=incoming.packs[0].id;
  const opts={mode:'select',conflict:'keep',appearance:false,
    profiles:[incoming.profiles.profileId,importedId],templates:[templateId],packs:[packId,'new-backup-pack'],
    conflicts:{profiles:{[incoming.profiles.profileId]:'overwrite'},templates:{[templateId]:'rename'},packs:{[packId]:'keep'}}};
  const result=Backup.planRestore(current,incoming,opts);
  assert.equal(result.data.profiles.pages[0][0].settings.body,'backed-up profile data');
  assert.ok(result.data.profiles.profileNames.some(p=>p.name==='New backup profile'));
  assert.equal(result.data.profiles.profileTemplates.length,2);
  assert.ok(result.data.profiles.profileTemplates.some(p=>p.name==='Template (복원)'));
  assert.equal(result.data.packs.find(p=>p.name==='User pack').icons[0].name,'Local icon');
  assert.ok(result.data.packs.some(p=>p.name==='New backup pack'));
  assert.equal(result.report.added,2);
  assert.equal(result.report.replaced,1);
  assert.equal(result.report.kept,1);
  assert.equal(result.report.renamed,1);
  assert.throws(()=>Backup.planRestore(current,incoming,{...opts,conflicts:{profiles:{unknown:'overwrite'}}}),/중복 처리 옵션/);
  assert.throws(()=>Backup.planRestore(current,incoming,{...opts,conflicts:{profiles:{[importedId]:'overwrite'}}}),/중복 처리 옵션/);
  assert.throws(()=>Backup.planRestore(current,incoming,{...opts,profiles:[importedId]}),/중복 처리 옵션/);
  assert.throws(()=>Backup.planRestore(current,incoming,{...opts,conflicts:{packs:{[packId]:'erase'}}}),/중복 처리 옵션/);
});

test('merge/selection keep existing data, resolve conflicts, remap imported profile links and pack IDs',t=>{
  const {make}=setup(t),current=make(),incoming=JSON.parse(JSON.stringify(current));
  current.profiles.pages[0][0].settings.body='local';
  const local=Core.createProfile(current.profiles,'Only local');
  const id=Core.createProfile(incoming.profiles,'Imported');
  const localMatch=current.profiles.profileNames[0].id;
  const added=incoming.profiles.inactiveProfiles.find(p=>p.id===id);
  added.pages[0][0]=Core.createAction('profile');added.pages[0][0].settings.profile=incoming.profiles.profileId;
  added.pages[0][1]=Core.createAction('text');added.pages[0][1].icon={kind:'file',value:icon,packId:'user-pack'};
  incoming.packs[0].icons[0].name='different icon';
  incoming.appearance={theme:'color',overrides:{}};
  const opts={mode:'merge',conflict:'keep',appearance:false};
  const merged=Backup.planRestore(current,incoming,opts);
  assert.equal(merged.data.profiles.pages[0][0].settings.body,'local');
  assert.ok(merged.data.profiles.profileNames.some(p=>p.id===local&&p.name==='Only local'));
  const imported=merged.data.profiles.profileNames.find(p=>p.name==='Imported');
  assert.notEqual(imported.id,local);
  assert.equal(merged.data.profiles.inactiveProfiles.find(p=>p.id===imported.id).pages[0][0].settings.profile,localMatch);
  assert.equal(merged.data.appearance.theme,'line');
  const overwritten=Backup.planRestore(current,incoming,{...opts,conflict:'overwrite',appearance:true});
  assert.equal(overwritten.data.profiles.pages[0][0].settings.body,'private-action-data');
  assert.equal(overwritten.data.appearance.theme,'color');
  assert.ok(overwritten.data.profiles.profileNames.some(p=>p.id===local));
  const renamed=Backup.planRestore(current,incoming,{...opts,conflict:'rename'});
  const copied=renamed.data.profiles.profileNames.find(p=>p.name.endsWith(' (복원)'));
  const newImport=renamed.data.profiles.profileNames.find(p=>p.name==='Imported');
  assert.equal(renamed.data.profiles.inactiveProfiles.find(p=>p.id===newImport.id).pages[0][0].settings.profile,copied.id);
  assert.equal(renamed.data.profiles.inactiveProfiles.find(p=>p.id===newImport.id).pages[0][1].icon.packId,renamed.data.packs.find(p=>p.name.endsWith(' (복원)')).id);
  assert.equal(renamed.data.profiles.profileTemplates.length,2);
  const selected=Backup.planRestore(current,incoming,{mode:'select',conflict:'keep',appearance:false,profiles:[id],templates:[],packs:[]});
  assert.equal(selected.data.profiles.profileNames.length,3);
  assert.equal(selected.data.packs.length,1);
  assert.throws(()=>Backup.planRestore(current,incoming,{mode:'select',conflict:'keep',appearance:false,profiles:['unknown'],templates:[],packs:[]}));
  assert.equal(Backup.planRestore(current,incoming,{mode:'all'}).data.profiles.profileNames.some(p=>p.name==='Only local'),false);
});


test('selected archives include only checked profiles, templates, icon packs and appearance',t=>{
  const {store,make}=setup(t);
  const state=store.read();
  const id=Core.createProfile(state,'Second profile');
  assert.ok(id);
  const added=state.inactiveProfiles.find(p=>p.id===id);
  added.pages[0][0]=Core.createAction('text');added.pages[0][0].settings.body='second secret';
  store.write(state);
  const data=make(),choices=Backup.backupChoices(data);
  assert.equal(choices.profiles.length,2);
  assert.equal(choices.templates.length,1);
  assert.equal(choices.packs.length,1);
  const options={profiles:[id],templates:[],packs:[],appearance:false};
  const selected=Backup.selectSnapshot(data,options);
  assert.equal(selected.profiles.profileId,id);
  assert.deepEqual(selected.profiles.profileNames.map(p=>p.id),[id]);
  assert.equal(selected.profiles.inactiveProfiles.length,0);
  assert.equal(selected.profiles.profileTemplates.length,0);
  assert.equal(selected.packs.length,0);
  assert.equal(selected.sections.appearance,false);
  assert.deepEqual(selected.appearance,{theme:'line',overrides:{}});
  assert.equal(JSON.stringify(selected).includes('private-action-data'),false);
  assert.equal(selected.profiles.pages[0][0].settings.body,'second secret');
  assert.deepEqual(Backup.decode(Backup.encode(selected,'','plain'),'','plain'),selected);
  const listed=Backup.restoreItems(data,selected);
  assert.equal(listed.appearance,false);
  assert.equal(listed.profiles.length,1);
  const full=Backup.planRestore(data,selected,{mode:'all'});
  assert.deepEqual(full.data.appearance,data.appearance);
  assert.equal(full.report.appearance,false);
  assert.equal(Backup.selectSnapshot(data,null),data);
  assert.throws(()=>Backup.selectSnapshot(data,{...options,profiles:[]}),/프로필/);
  assert.throws(()=>Backup.selectSnapshot(data,{...options,packs:['unknown']}),/선택 정보/);
  assert.throws(()=>Backup.selectSnapshot(data,{...options,profiles:[id,id]}),/선택 정보/);
  assert.throws(()=>Backup.selectSnapshot(data,{...options,appearance:'no'}),/올바르지/);
});


test('SDK identity survives full restore, merge/overwrite and select allocate new IDs',t=>{
  const {store,make}=setup(t);
  const state=store.read(),action=state.pages[0][0]=Core.createAction('sd-plugin');
  action.settings.pluginSettings={type:'sd-plugin',instanceId:'plugin-owned-value'};
  store.write(state);const current=make(),incoming=make();
  const full=Backup.planRestore(current,incoming,{mode:'all'}).data.profiles;
  assert.equal(full.pages[0][0].instanceId,action.instanceId);
  const merge=Backup.planRestore(current,incoming,{mode:'merge',conflict:'overwrite',appearance:false}).data.profiles;
  assert.notEqual(merge.pages[0][0].instanceId,action.instanceId);
  assert.deepEqual(merge.pages[0][0].settings.pluginSettings,action.settings.pluginSettings);
  const select=Backup.planRestore(current,incoming,{mode:'select',conflict:'rename',appearance:false,profiles:[state.profileId],templates:[],packs:[]}).data.profiles;
  const ids=[];Core.walkSdkActions(select,x=>ids.push(x.instanceId));
  assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);assert.ok(ids.includes(action.instanceId));
});

test('restore reports SDK references without reading secrets or accepting external plugin vaults',t=>{
 const {root,store,packsFile,make}=setup(t);
 const state=store.read(),id='com.deckforge.native.test';
 const action=state.pages[0][1]=Core.createAction('sd-plugin');
 action.settings.pluginUUID=id;action.settings.actionUUID=id+'.key';action.settings.pluginSettings={private:'DO-NOT-REPORT'};
 const withTemplate=Core.saveProfileTemplate(state,state.profileId,'SDK template').next;
 store.write(withTemplate);
 const current=make();
 const external={...make(),nativeCredentials:{[id]:'EXTERNAL-CREDENTIAL'},nativeSettings:{[id]:'EXTERNAL-VAULT'},plugins:[{id,script:'EXTERNAL-CODE'}]};
 const files=['NativeCredentials','NativeSettings','NativeHistory'].map(folder=>path.join(root,'Plugins',folder,id+'.fixture'));
 for(const file of files){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'LOCAL-ONLY');}
 const plan=Backup.planRestore(current,external,{mode:'all'});
 for(const k of ['nativeCredentials','nativeSettings','plugins'])assert.equal(Object.hasOwn(plan.data,k),false);
 const report=Backup.restorePluginReport(plan.data,[{uuid:id,actions:[{uuid:id+'.key'}]}]);
 assert.deepEqual(report,[{id,status:'available',count:2}]);
 assert.equal(JSON.stringify(report).includes('DO-NOT-REPORT'),false);
 assert.equal(Backup.restorePluginReport(plan.data,[])[0].status,'missing');
 assert.equal(Backup.restorePluginReport(plan.data,null)[0].status,'unknown');
 assert.equal(Backup.restorePluginReport(plan.data,[{uuid:id,available:false,actions:[]}])[0].status,'dependency');
 assert.equal(Backup.restorePluginReport(plan.data,[{uuid:id,actions:[]}])[0].status,'action-missing');
 const selected=Backup.planRestore(current,external,{mode:'select',conflict:'rename',appearance:false,profiles:[state.profileId],templates:[],packs:[]});
 assert.deepEqual(Backup.restorePluginReport(selected.data,[]),[{id,status:'missing',count:3}]);
 Backup.restore({store,packsFile,safetyDirectory:path.join(root,'Backups'),current,incoming:plan.data,password});
 for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),'LOCAL-ONLY');
 assert.deepEqual(store.read().pages[0][1].settings.pluginSettings,{private:'DO-NOT-REPORT'});
});
