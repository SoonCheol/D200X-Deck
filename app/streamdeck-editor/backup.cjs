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
  if(typeof password!=='string'||password.length<8||password.length>256)throw Error('백업 비밀번호는 8~256자로 입력하세요.');
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
function readArchive(file,password){
  const bytes=readOptional(file);
  if(!bytes)throw Error('백업 파일을 찾을 수 없습니다.');
  return decrypt(bytes,password);
}
function writeAtomic(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
}
function writeArchive(directory,data,password,{safety=false}={}){
  if(!fs.statSync(directory).isDirectory())throw Error('백업 폴더를 확인하세요.');
  const stamp=data.createdAt.replace(/[:.]/g,'-');
  const filename='DeckForge-'+(safety?'Before-Restore-':'')+stamp+'-'+crypto.randomUUID()+'.dfbackup';
  const file=path.join(directory,filename);
  if(fs.existsSync(file))throw Error('동일 백업 파일이 이미 있습니다.');
  writeAtomic(file,encrypt(data,password));
  return {file,filename,...summary(data)};
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
module.exports={validateAppearance,validateSnapshot,snapshot,summary,encrypt,decrypt,readArchive,writeArchive,fingerprint,restore};
