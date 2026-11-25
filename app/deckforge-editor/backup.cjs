'use strict';
// Portable, password-encrypted configuration snapshots. No network or OAuth
// credentials, executable plugin folders, cache, logs or browser data are read.
// The chosen folder may be managed by Google Drive for desktop or be local.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Core=require('./deck-core.js');
const MAGIC=Buffer.from('DECKFORGE-BACKUP-1\n','ascii');
const LIMIT=256*1024*1024;
const HEADER=MAGIC.length+16+12+16;
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const int=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;
function checkPassword(password){
  if(typeof password!=='string'||password.length<4||password.length>256)throw Error('백업 비밀번호는 4~256자로 입력하세요.');
}
function image(value,limit){
  return typeof value==='string'&&value.length<=limit&&/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function validateAppearance(a){
  if(!obj(a)||!['line','color','button'].includes(a.theme)||!obj(a.overrides)||Object.keys(a.overrides).length>100||
    Object.entries(a.overrides).some(([id,value])=>!/^[a-z][a-z0-9-]{0,79}$/.test(id)||!image(value,200000)))
    throw Error('액션 목록 디자인 백업이 올바르지 않습니다.');
}
function validatePacks(packs){
  if(!Array.isArray(packs)||packs.length>32)throw Error('사용자 아이콘팩 목록이 올바르지 않습니다.');
  const seen=new Set();
  for(const pack of packs){
    if(!obj(pack)||typeof pack.id!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(pack.id)||
      pack.id.startsWith('builtin-')||pack.source==='bundled'||seen.has(pack.id)||
      typeof pack.name!=='string'||!pack.name.trim()||pack.name.length>250||
      !Array.isArray(pack.icons)||!int(pack.icons.length,1,2500))
      throw Error('사용자 아이콘팩 정보가 올바르지 않습니다.');
    seen.add(pack.id);
    if(pack.icons.some(icon=>!obj(icon)||typeof icon.name!=='string'||icon.name.length>500||
      !image(icon.image,8*1024*1024+100)))throw Error('사용자 아이콘 이미지가 올바르지 않습니다.');
  }
}
function validateProfiles(s){
  if(!obj(s)||!Array.isArray(s.pages)||!int(s.pages.length,1,128)||
    !Array.isArray(s.profileNames)||!int(s.profileNames.length,1,50)||
    !Array.isArray(s.inactiveProfiles)||s.inactiveProfiles.length!==s.profileNames.length-1||
    typeof s.profileId!=='string')throw Error('프로필 백업 형식이 올바르지 않습니다.');
  const ids=new Set();
  for(const p of s.profileNames){
    if(!obj(p)||typeof p.id!=='string'||!p.id||p.id.length>40||ids.has(p.id)||
      typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw Error('프로필 이름 또는 ID가 올바르지 않습니다.');
    ids.add(p.id);
  }
  if(!ids.delete(s.profileId))throw Error('활성 프로필 정보가 없습니다.');
  for(const p of s.inactiveProfiles){
    if(!obj(p)||!ids.delete(p.id)||!Array.isArray(p.pages)||!int(p.pages.length,1,128))throw Error('비활성 프로필 정보가 올바르지 않습니다.');
  }
  if(ids.size)throw Error('누락된 프로필이 있습니다.');
  return Core.migrateState(s);
}
function validateSnapshot(data){
  if(!obj(data)||data.format!=='deckforge-backup-v1'||typeof data.createdAt!=='string'||
    !Number.isFinite(Date.parse(data.createdAt))||typeof data.version!=='string'||!/^\d+\.\d+\.\d+$/.test(data.version))
    throw Error('지원하는 DeckForge 백업 파일이 아닙니다.');
  validatePacks(data.packs);validateAppearance(data.appearance);
  if(data.sections!==undefined&&(!obj(data.sections)||typeof data.sections.appearance!=='boolean'))
    throw Error('백업 항목 메타데이터가 올바르지 않습니다.');
  return validateProfiles(data.profiles);
}
function snapshot({store,packsFile,appearance,version}){
  const profiles=store.read();
  if(!profiles)throw Error('먼저 프로필을 저장하세요.');
  const raw=readOptional(packsFile);
  const packs=raw?JSON.parse(raw.toString('utf8')):[];
  const data={format:'deckforge-backup-v1',createdAt:new Date().toISOString(),version,profiles,packs,appearance};
  validateSnapshot(data);
  return data;
}

/* A selected archive is still a valid, self-contained DeckForge snapshot.
   Do not mutate the live ProfileStore state or expose its fields to the UI. */
function backupChoices(data){
  validateSnapshot(data);
  const named=list=>list.map(item=>({id:item.id,name:item.name}));
  return {profiles:named(data.profiles.profileNames),
    templates:named(data.profiles.profileTemplates||[]),
    packs:named(data.packs),appearance:true};
}
function selectSnapshot(data,selection){
  validateSnapshot(data);
  if(selection===undefined||selection===null)return data;
  if(!obj(selection)||typeof selection.appearance!=='boolean')throw Error('백업 항목 선택 정보가 올바르지 않습니다.');
  const available=backupChoices(data);
  const setFor=kind=>{
    const ids=selection[kind],found=new Set(available[kind].map(item=>item.id));
    if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!found.has(id)))
      throw Error('백업 '+kind+' 선택 정보가 올바르지 않습니다.');
    return new Set(ids);
  };
  const profiles=setFor('profiles'),templates=setFor('templates'),packs=setFor('packs');
  if(!profiles.size)throw Error('백업할 프로필을 최소 하나 선택하세요.');
  const source=data.profiles;
  const keptProfiles=source.profileNames.filter(item=>profiles.has(item.id));
  const activeId=profiles.has(source.profileId)?source.profileId:keptProfiles[0].id;
  const main=Core.exportSingleProfile(source,activeId).snapshot;
  const next={...source,...main,selected:null,profileId:activeId,
    profileNames:keptProfiles,
    inactiveProfiles:keptProfiles.filter(item=>item.id!==activeId).map(item=>({
      id:item.id,...Core.exportSingleProfile(source,item.id).snapshot
    })),
    profileTemplates:(source.profileTemplates||[]).filter(item=>templates.has(item.id))};
  if(!Object.hasOwn(main,'indicatorCommon'))delete next.indicatorCommon;
  const archive={...data,profiles:next,packs:data.packs.filter(item=>packs.has(item.id)),
    appearance:selection.appearance?data.appearance:{theme:'line',overrides:{}},
    sections:{appearance:selection.appearance}};
  validateSnapshot(archive);
  return archive;
}

function summary(data){
  return {createdAt:data.createdAt,version:data.version,profiles:data.profiles.profileNames.length,
    templates:data.profiles.profileTemplates?.length||0,packs:data.packs.length};
}
function key(password,salt){
  checkPassword(password);
  return crypto.scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
function encrypt(data,password){
  validateSnapshot(data);checkPassword(password);
  const plain=Buffer.from(JSON.stringify(data),'utf8');
  if(plain.length>LIMIT)throw Error('백업 데이터 용량 제한(256MB)을 초과했습니다.');
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),derived=key(password,salt);
  try{
    const cipher=crypto.createCipheriv('aes-256-gcm',derived,iv);cipher.setAAD(MAGIC);
    const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
    return Buffer.concat([MAGIC,salt,iv,cipher.getAuthTag(),encrypted]);
  }finally{derived.fill(0);plain.fill(0);}
}
function decrypt(bytes,password){
  checkPassword(password);
  if(!Buffer.isBuffer(bytes)||bytes.length<=HEADER||bytes.length>HEADER+LIMIT||!bytes.subarray(0,MAGIC.length).equals(MAGIC))
    throw Error('지원하는 백업 파일 형식 또는 용량이 아닙니다.');
  const start=MAGIC.length,salt=bytes.subarray(start,start+16),iv=bytes.subarray(start+16,start+28),tag=bytes.subarray(start+28,HEADER);
  const derived=key(password,salt);let plain;
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',derived,iv);decipher.setAAD(MAGIC);decipher.setAuthTag(tag);
    plain=Buffer.concat([decipher.update(bytes.subarray(HEADER)),decipher.final()]);
  }catch{throw Error('백업 비밀번호가 틀렸거나 파일이 손상되었습니다.');}
  finally{derived.fill(0);}
  let data;
  try{data=JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}
  validateSnapshot(data);
  return data;
}
function readOptional(file){
  try{
    const stat=fs.statSync(file);
    if(!stat.isFile()||stat.size>LIMIT+HEADER)throw Error('백업 파일 또는 설정 파일 크기가 올바르지 않습니다.');
    const bytes=fs.readFileSync(file);
    if(bytes.length>LIMIT+HEADER)throw Error('파일 용량 제한을 초과했습니다.');
    return bytes;
  }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function extension(format='encrypted'){
  if(format==='encrypted')return 'dfbackup';
  if(format==='plain')return 'dfjson';
  throw Error('지원하지 않는 백업 형식입니다.');
}
function encode(data,password,format='encrypted'){
  if(extension(format)==='dfbackup')return encrypt(data,password);
  validateSnapshot(data);
  const bytes=Buffer.from(JSON.stringify(data),'utf8');
  if(bytes.length>LIMIT)throw Error('백업 데이터 용량 제한(256MB)을 초과했습니다.');
  return bytes;
}
function decode(bytes,password,format='encrypted',current=null){
  if(extension(format)==='dfbackup')return decrypt(bytes,password);
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>LIMIT)throw Error('일반 백업 파일 용량이 올바르지 않습니다.');
  let data;
  try{data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Error('올바른 JSON 백업 파일이 아닙니다.');}
  validateSnapshot(data);return data;
}
function readArchive(file,password,format='encrypted',current=null){
  const bytes=readOptional(file);
  if(!bytes)throw Error('백업 파일을 찾을 수 없습니다.');
  return decode(bytes,password,format,current);
}
function writeAtomic(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
}
function writeArchive(directory,data,password,{safety=false,format='encrypted'}={}){
  if(safety&&format!=='encrypted')throw Error('복원 전 안전 백업은 암호화해야 합니다.');
  if(!fs.statSync(directory).isDirectory())throw Error('백업 폴더를 확인하세요.');
  const stamp=data.createdAt.replace(/[:.]/g,'-');
  const filename='DeckForge-'+(safety?'Before-Restore-':'')+stamp+'-'+crypto.randomUUID()+'.'+extension(format);
  const file=path.join(directory,filename);
  if(fs.existsSync(file))throw Error('동일 백업 파일이 이미 있습니다.');
  writeAtomic(file,encode(data,password,format));
  return {file,filename,...summary(data)};
}
// Describe only metadata to the renderer. The archive and final import plan
// remain in the main process until the explicit commit.
function restoreItems(current,incoming){
  const items=(source,target)=>source.map(item=>({id:item.id,name:item.name,
    matches:target.filter(t=>t.name.trim().toLowerCase()===item.name.trim().toLowerCase()).length}));
  return {profiles:items(incoming.profiles.profileNames,current.profiles.profileNames),
    templates:incoming.legacyTemplates?[]:items(incoming.profiles.profileTemplates||[],current.profiles.profileTemplates||[]),
    packs:incoming.legacy?[]:items(incoming.packs,current.packs),
    appearance:!incoming.legacyAppearance&&incoming.sections?.appearance!==false};
}
// Read-only report on the resulting configuration, including inactive
// profiles and templates. Do not expose plugin settings, secrets or code.
function restorePluginReport(data,catalogue){
  const profiles=validateSnapshot(data),groups=new Map();
  const visit=action=>{
    const id=action.settings?.pluginUUID;
    if(typeof id!=='string'||!id||id.length>180)return;
    const status=Core.sdkAvailability(action,catalogue)||'unknown';
    const key=JSON.stringify([id,status]);
    const old=groups.get(key);
    if(old)old.count++;
    else groups.set(key,{id,status,count:1});
  };
  Core.walkSdkActions(profiles,visit);
  for(const template of profiles.profileTemplates||[])Core.walkSdkActions(template.snapshot,visit);
  return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)||a.status.localeCompare(b.status));
}
function planRestore(current,incoming,options){
  const prior=validateSnapshot(current),source=validateSnapshot(incoming);
  if(!obj(options)||!['all','merge','select'].includes(options.mode))throw Error('복원 방식을 선택하세요.');
  if(options.mode==='all'){
    const hasAppearance=incoming.sections?.appearance!==false;
    // Project only the configuration contract. Unknown archive sections (including
    // executable plugins or external encrypted vaults) are not restored.
    const data={format:'deckforge-backup-v1',createdAt:incoming.createdAt,version:incoming.version,
      profiles:source,packs:incoming.packs,appearance:hasAppearance?incoming.appearance:current.appearance};
    return {data,report:{mode:'all',added:0,replaced:0,kept:0,renamed:0,missingLinks:0,details:[],appearance:hasAppearance}};
  }
  if(!['keep','overwrite','rename'].includes(options.conflict)||typeof options.appearance!=='boolean')throw Error('복원 옵션이 올바르지 않습니다.');
  const overrides=options.conflicts??{},kinds=['profiles','templates','packs'];
  if(!obj(overrides)||Object.keys(overrides).some(kind=>!kinds.includes(kind)))throw Error('복원 충돌 처리 옵션이 올바르지 않습니다.');
  const report={mode:options.mode,added:0,replaced:0,kept:0,renamed:0,missingLinks:0,details:[],appearance:options.appearance&&!incoming.legacyAppearance&&incoming.sections?.appearance!==false};
  const clone=value=>JSON.parse(JSON.stringify(value)),key=name=>name.trim().toLowerCase();
  const profiles=prior.profileNames.map(p=>({...p,snapshot:Core.exportSingleProfile(prior,p.id).snapshot}));
  const otherProfiles=source.profileNames.map(p=>({...p,snapshot:Core.exportSingleProfile(source,p.id).snapshot}));
  const templates=clone(prior.profileTemplates||[]),packs=clone(current.packs);
  const profileMap=new Map(),packMap=new Map(),imports=[];
  let profileSeq=prior.profileSeq,templateSeq=prior.profileTemplateSeq;
  const selection=(kind,list)=>{
    if(options.mode==='merge')return new Set(list.map(x=>x.id));
    const chosen=options[kind];
    if(!Array.isArray(chosen)||chosen.length>list.length||new Set(chosen).size!==chosen.length||chosen.some(id=>!list.some(item=>item.id===id)))throw Error('복원 선택 항목이 올바르지 않습니다.');
    return new Set(chosen);
  };
  // Each selected item may resolve its own name collision. Keep the legacy
  // global policy for existing callers; the new UI supplies item overrides.
  const lists={profiles:otherProfiles,templates:incoming.legacyTemplates?[]:source.profileTemplates||[],packs:incoming.legacy?[]:incoming.packs};
  const targets={profiles:prior.profileNames,templates:prior.profileTemplates||[],packs:current.packs};
  for(const kind of kinds){
    const rules=overrides[kind]??{};
    if(!obj(rules))throw Error('복원 충돌 처리 옵션이 올바르지 않습니다.');
    const selected=selection(kind,lists[kind]);
    for(const [id,action] of Object.entries(rules)){
      const item=lists[kind].find(value=>value.id===id);
      if(!selected.has(id)||!item||!['keep','overwrite','rename'].includes(action)||
        !targets[kind].some(value=>value.name.trim().toLowerCase()===item.name.trim().toLowerCase()))
        throw Error('선택한 항목의 이름 중복 처리 옵션이 올바르지 않습니다.');
    }
  }
  const uniqueName=(name,records,max)=>{
    for(let n=1;n<=1000;n++){
      const suffix=n===1?' (복원)':' (복원 '+n+')',candidate=name.slice(0,max-suffix.length)+suffix;
      if(!records.some(r=>key(r.name)===key(candidate)))return candidate;
    }
    throw Error('새 복원 이름을 만들 수 없습니다.');
  };
  const alloc=(kind,records)=>{
    if(kind==='packs'){
      for(let n=1;n<=1000;n++){const id='restored-pack-'+n;if(!records.some(r=>r.id===id))return id;}
    }else{
      let n=kind==='profiles'?profileSeq:templateSeq;
      const prefix=kind==='profiles'?'profile-':'template-';
      do{if(!Number.isSafeInteger(++n)||n>999999999999999)throw Error('복원 식별자 한도 초과');}while(records.some(r=>r.id===prefix+n));
      if(kind==='profiles')profileSeq=n;else templateSeq=n;
      return prefix+n;
    }
    throw Error('복원 식별자를 만들 수 없습니다.');
  };
  function apply(kind,records,list,limit,max,map){
    const selected=selection(kind,list),touched=new Set();
    for(const item of list){
      const matches=records.filter(r=>key(r.name)===key(item.name));
      if(!selected.has(item.id)){
        if(map&&matches.length===1)map.set(item.id,matches[0].id);
        continue;
      }
      const policy=overrides[kind]?.[item.id]??options.conflict;
      if(matches.length&&policy==='keep'){
        if(map&&matches.length===1)map.set(item.id,matches[0].id);
        report.kept++;report.details.push({kind,name:item.name,action:'keep'});continue;
      }
      const replacing=matches.length>0&&policy==='overwrite';
      if(replacing&&(matches.length!==1||touched.has(matches[0].id)))throw Error('동일 이름이 여러 개여서 안전하게 덮어쓸 수 없습니다: '+item.name+' · 기존 유지 또는 새 이름으로 복원하세요.');
      const next=clone(item);
      // Merge/select creates a new mounted identity, even on overwrite.
      // Whole-store restore preserves the archived valid instance IDs.
      if(kind==='profiles')next.snapshot=Core.cloneActionInstances(next.snapshot);
      if(replacing){
        next.id=matches[0].id;records[records.indexOf(matches[0])]=next;
        report.replaced++;
      }else{
        if(records.length>=limit)throw Error('복원 항목 최대 개수를 초과했습니다: '+kind+' '+limit+'개');
        next.id=alloc(kind,records);
        if(matches.length){next.name=uniqueName(item.name,records,max);report.renamed++;}
        else report.added++;
        records.push(next);
      }
      touched.add(next.id);
      if(map)map.set(item.id,next.id);
      if(kind!=='packs')imports.push(next.snapshot);
      report.details.push({kind,name:item.name,resultName:next.name,action:replacing?'overwrite':matches.length?'rename':'add'});
    }
  }
  apply('profiles',profiles,otherProfiles,50,80,profileMap);
  apply('templates',templates,incoming.legacyTemplates?[]:source.profileTemplates||[],50,80,null);
  apply('packs',packs,incoming.legacy?[]:incoming.packs,32,250,packMap);
  // Unselected source profiles can still resolve to an unambiguous name match,
  // but never silently bind a foreign profile ID to an unrelated local one.
  for(const item of otherProfiles){
    if(profileMap.has(item.id))continue;
    const matches=profiles.filter(p=>key(p.name)===key(item.name));
    if(matches.length===1&&!report.details.some(d=>d.kind==='profiles'&&d.name===item.name&&d.action==='keep'&&otherProfiles.filter(x=>key(x.name)===key(item.name)).length>1))profileMap.set(item.id,matches[0].id);
  }
  if(incoming.legacy)for(const pack of packs)packMap.set(pack.id,pack.id);
  for(const pack of incoming.packs){
    if(packMap.has(pack.id))continue;
    const matches=packs.filter(p=>key(p.name)===key(pack.name));
    if(matches.length===1)packMap.set(pack.id,matches[0].id);
  }
  let missingSeq=0;
  const missing=new Map(),missingIds=new Set(profiles.map(p=>p.id));
  function profileLink(id){
    if(typeof id!=='string'||!id||id==='next'||id==='previous')return id;
    if(profileMap.has(id))return profileMap.get(id);
    if(!missing.has(id)){
      let dest;do{dest='missing-restore-'+(++missingSeq);}while(missingIds.has(dest));
      missing.set(id,dest);missingIds.add(dest);
    }
    report.missingLinks++;
    return missing.get(id);
  }
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(value.type==='profile'&&obj(value.settings))value.settings.profile=profileLink(value.settings.profile);
    if(value.navigation==='profile-select')value.profile=profileLink(value.profile);
    if(value.kind==='file'&&typeof value.packId==='string'){
      const old=value.packId;
      if(packMap.has(old)){
        value.packId=packMap.get(old);
        if(typeof value.statePair==='string')try{
          const pair=JSON.parse(value.statePair);
          if(Array.isArray(pair)&&pair[0]===old){pair[0]=value.packId;value.statePair=JSON.stringify(pair);}
        }catch{}
      }else if(!old.startsWith('builtin-')){
        // Applied PNG stays intact even when the source library is omitted.
        // Keep a detached identity for paired state art without linking to
        // an unrelated installed pack.
        value.packId='detached-'+crypto.createHash('sha256').update(old).digest('hex').slice(0,32);
      }
    }
    for(const [field,child] of Object.entries(value))if(field!=='pluginSettings'&&child&&typeof child==='object')visit(child);
  }
  for(const imported of imports)visit(imported);
  const active=profiles.find(p=>p.id===prior.profileId);
  const metadata=({snapshot,...p})=>p;
  const state={...Core.profileSnapshot(active.snapshot),selected:prior.selected,profileId:active.id,
    profileNames:profiles.map(metadata),
    inactiveProfiles:profiles.filter(p=>p.id!==active.id).map(p=>({id:p.id,...p.snapshot})),
    profileSeq,profileTemplates:templates,profileTemplateSeq:templateSeq,
    smartProfilesEnabled:profiles.some(p=>p.smartEnabled)};
  const data={format:'deckforge-backup-v1',createdAt:incoming.createdAt,version:incoming.version,
    profiles:state,packs,appearance:report.appearance?incoming.appearance:current.appearance};
  data.profiles=validateSnapshot(data);
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>LIMIT)throw Error('복원 후 데이터 용량 제한(256MB)을 초과합니다.');
  if(!report.added&&!report.replaced&&!report.renamed&&!report.appearance)throw Error('복원할 새 항목이 없습니다. 다른 항목이나 충돌 처리 방식을 선택하세요.');
  return {data,report};
}
function fingerprint(data){
  // Ignore collection time only; cover all restored content.
  return crypto.createHash('sha256').update(JSON.stringify([data.profiles,data.packs,data.appearance])).digest('hex');
}
function restore({store,packsFile,safetyDirectory,current,incoming,password}){
  // No writes before validating the entire incoming snapshot and saving an
  // independent, immutable local recovery file. Main process calls this
  // synchronously after checking the current snapshot fingerprint.
  const state=validateSnapshot(incoming);
  validateSnapshot(current);
  const oldPacks=readOptional(packsFile);
  fs.mkdirSync(safetyDirectory,{recursive:true});
  const safety=writeArchive(safetyDirectory,current,password,{safety:true});
  let packsWritten=false;
  try{
    writeAtomic(packsFile,Buffer.from(JSON.stringify(incoming.packs),'utf8'));packsWritten=true;
    store.write(state);
  }catch(error){
    if(packsWritten){
      try{
        if(oldPacks)writeAtomic(packsFile,oldPacks);
        else fs.rmSync(packsFile,{force:true});
      }catch{throw Error('복원 실패 및 아이콘팩 원복 실패. 복원 전 백업: '+safety.file);}
    }
    throw Error('복원 실패. 이전 프로필 보존 및 아이콘팩 원복. 복원 전 백업: '+safety.file+' · '+String(error?.message||error));
  }
  return {state,safetyFile:safety.file};
}
module.exports={validateAppearance,validateSnapshot,snapshot,backupChoices,selectSnapshot,summary,encrypt,decrypt,encode,decode,extension,readArchive,writeArchive,restoreItems,restorePluginReport,planRestore,fingerprint,restore};
