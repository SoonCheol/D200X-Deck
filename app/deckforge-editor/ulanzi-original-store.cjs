'use strict';
// Original Ulanzi packages are stored separately from native and other SDKs.
// No original source is rewritten, no dependencies installed or executed here.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {validateOriginalNodeManifest,UlanziNodeHost}=require('./ulanzi-node-host.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const ID=/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){3}$/;
const MAX_FILES=2500,MAX_BYTES=100*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const segment=s=>s&&s!=='.'&&s!=='..'&&!/[\\/:*?"<>|\x00-\x1f\x7f]/.test(s)&&!/[. ]$/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s);
const BACKUP_LIMIT=150*1024*1024;
const BACKUP_FORMAT='deckforge-ulanzi-original-backup-v1';
async function scanOriginal(directory,{copyTo=null,onFile=null}={}){
  const root=path.resolve(directory),st=await fs.lstat(root);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('invalid original directory');
  const real=await fs.realpath(root),files=[],names=new Set();let total=0,manifestBytes=null;
  async function walk(dir,rel=''){
    const entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const ent of entries){
      if(!segment(ent.name)||ent.isSymbolicLink()||(!ent.isDirectory()&&!ent.isFile()))throw Error('unsafe original path');
      const name=rel+ent.name,fold=name.toLowerCase();
      if(name.length>1000||names.has(fold))throw Error('duplicate or long original path');
      names.add(fold);
      const from=path.join(dir,ent.name),info=await fs.lstat(from);
      if(info.isSymbolicLink())throw Error('unsafe original link');
      if(info.isDirectory()){await walk(from,name+'/');continue;}
      if(!info.isFile()||files.length>=MAX_FILES||(total+=info.size)>MAX_BYTES)throw Error('original package size limit');
      const actual=await fs.realpath(from),relative=path.relative(real,actual);
      if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('original path escaped');
      const bytes=await fs.readFile(actual);
      if(bytes.length!==info.size)throw Error('original file changed');
      files.push([name,hash(bytes)]);if(onFile)onFile(name,bytes);
      if(name==='manifest.json')manifestBytes=bytes;
      if(copyTo){const to=path.join(copyTo,...name.split('/'));await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,bytes,{flag:'wx'});}
    }
  }
  await walk(root);
  if(!manifestBytes||manifestBytes.length>65536)throw Error('invalid original manifest size');
  const manifest=validateOriginalNodeManifest(JSON.parse(manifestBytes.toString('utf8')));
  if(!files.some(([name])=>name===manifest.CodePath))throw Error('missing original entry');
  for(const a of manifest.Actions)if(a.PropertyInspectorPath&&!files.some(([name])=>name===a.PropertyInspectorPath))throw Error('missing original inspector');
  return {manifest,revision:hash(JSON.stringify(files)),fileCount:files.length,totalBytes:total};
}
function parseOriginalBackup(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>BACKUP_LIMIT)throw Error('invalid original backup size');
  const data=JSON.parse(bytes.toString('utf8'));
  if(!data||data.format!==BACKUP_FORMAT||!ID.test(data.id)||!/^[a-f0-9]{64}$/.test(data.revision)||!Array.isArray(data.files)||!data.files.length||data.files.length>MAX_FILES)throw Error('invalid original backup');
  const names=new Set(),files=[],hashes=[];let total=0,manifestBytes;
  for(const item of data.files){
    if(!item||typeof item.path!=='string'||item.path.length>1000||!item.path.split('/').every(segment)||typeof item.bytes!=='string'||item.bytes.length%4!==0||item.bytes.length>Math.ceil(MAX_BYTES/3)*4)throw Error('invalid original backup file');
    const name=item.path,fold=name.toLowerCase();
    if(names.has(fold))throw Error('duplicate original backup path');
    names.add(fold);
    const raw=Buffer.from(item.bytes,'base64');
    if(raw.toString('base64')!==item.bytes||(total+=raw.length)>MAX_BYTES)throw Error('invalid original backup contents');
    files.push({name,bytes:raw});hashes.push([name,hash(raw)]);
    if(name==='manifest.json')manifestBytes=raw;
  }
  for(const name of names){const parts=name.split('/');for(let n=1;n<parts.length;n++)if(names.has(parts.slice(0,n).join('/')))throw Error('conflicting original backup path');}
  if(!manifestBytes||manifestBytes.length>65536||hash(JSON.stringify(hashes))!==data.revision)throw Error('original backup revision changed');
  const manifest=validateOriginalNodeManifest(JSON.parse(manifestBytes.toString('utf8')));
  if(manifest.UUID!==data.id||!files.some(f=>f.name===manifest.CodePath))throw Error('invalid original backup manifest');
  for(const action of manifest.Actions)if(action.PropertyInspectorPath&&!files.some(f=>f.name===action.PropertyInspectorPath))throw Error('missing original backup inspector');
  return {manifest,revision:data.revision,files,fileCount:files.length,totalBytes:total};
}
class UlanziOriginalStore{
  constructor(userData,{storage,getParent=()=>null,sendHotkey=async()=>false,hostFactory=(dir,emit)=>new UlanziNodeHost(dir,emit)}={}){
    this.root=path.join(userData,'Plugins','UlanziOriginal');
    this.retained=path.join(userData,'Plugins','UlanziOriginalRetained');
    this.grants=path.join(userData,'Plugins','UlanziOriginalApprovals');
    this.settings=path.join(userData,'Plugins','UlanziOriginalSettings');
    this.storage=storage;this.hostFactory=hostFactory;this.getParent=getParent;this.sendHotkey=sendHotkey;this.queue=Promise.resolve();this.active=new Map();this.managing=new Set();this.draft=null;this.closed=false;
  }
  serial(fn){const work=this.queue.then(()=>{if(this.closed)throw Error('original store closed');return fn();});this.queue=work.catch(()=>{});return work;}
  directory(id){if(typeof id!=='string'||!ID.test(id))throw Error('invalid Ulanzi ID');return path.join(this.root,id+'.ulanziPlugin');}
  grantFile(id){this.directory(id);return path.join(this.grants,hash(id)+'.encrypted');}
  async prepareRoot(root){
    await fs.mkdir(root,{recursive:true});const st=await fs.lstat(root);
    if(!st.isDirectory()||st.isSymbolicLink())throw Error('invalid original store root');
  }
  inspect(source){return scanOriginal(source);}
  install(source,expectedRevision){return this.serial(async()=>{
    await this.prepareRoot(this.root);
    const stage=path.join(this.root,'.stage-'+randomUUID());await fs.mkdir(stage);
    try{
      const record=await scanOriginal(source,{copyTo:stage});
      if(record.revision!==expectedRevision)throw Error('original package changed');
      const id=record.manifest.UUID,target=this.directory(id);
      const entries=await fs.readdir(this.root);
      if(entries.some(n=>n.toLowerCase()===path.basename(target).toLowerCase()))throw Error('original plugin already installed');
      await this.clearApproval(id);
      await this.clearRetainedCode(id);
      await fs.rename(stage,target);
      return record;
    }finally{await fs.rm(stage,{recursive:true,force:true});}
  });}
  async list(){
    await this.prepareRoot(this.root);
    const entries=await fs.readdir(this.root,{withFileTypes:true}),result=[];
    for(const ent of entries){
      if(!ent.isDirectory()||ent.isSymbolicLink()||!ent.name.endsWith('.ulanziPlugin'))continue;
      const id=ent.name.slice(0,-'.ulanziPlugin'.length);
      if(!ID.test(id))continue;
      try{
        const dir=this.directory(id),file=path.join(dir,'manifest.json'),st=await fs.lstat(file);
        if(!st.isFile()||st.isSymbolicLink()||st.size>65536)continue;
        const m=validateOriginalNodeManifest(JSON.parse(await fs.readFile(file,'utf8')));
        if(m.UUID!==id)continue;
        result.push({uuid:id,name:m.Name,version:m.Version,runtime:'ulanzi-original',privateAPI:!!m.PrivateAPI,
          actions:m.Actions.map(a=>({uuid:a.UUID,name:a.Name,states:Array.isArray(a.States)?a.States.length:1,
            controllers:a.Controllers||['Keypad'],propertyInspectorPath:a.PropertyInspectorPath||''}))});
      }catch{/* Invalid package is not exposed to the action catalogue. */}
    }
    return result;
  }
  async retainedEntries(){
    await this.prepareRoot(this.retained);
    const entries=await fs.readdir(this.retained,{withFileTypes:true}),result=[];
    for(const ent of entries){
      const match=/^(.+)--([a-f0-9]{64})\.ulanziPlugin$/.exec(ent.name);
      if(!match||!ID.test(match[1]))continue;
      result.push({id:match[1],revision:match[2],directory:path.join(this.retained,ent.name),safe:ent.isDirectory()&&!ent.isSymbolicLink()});
    }
    return result;
  }
  async retainedEntry(id){
    this.directory(id);
    const entries=(await this.retainedEntries()).filter(e=>e.id.toLowerCase()===id.toLowerCase());
    if(entries.length>1)throw Error('ambiguous retained original');
    return entries[0]||null;
  }
  async retainedRecord(id){
    const entry=await this.retainedEntry(id);
    if(!entry||!entry.safe||entry.id!==id)throw Error('invalid retained original');
    const record=await scanOriginal(entry.directory);
    if(record.manifest.UUID!==id||record.revision!==entry.revision)throw Error('retained original revision changed');
    return {id,name:record.manifest.Name,version:record.manifest.Version,revision:record.revision,runtime:'ulanzi-original',directory:entry.directory};
  }
  async listRetained(){
    const result=[];
    for(const id of new Set((await this.retainedEntries()).map(e=>e.id))){
      try{const {directory,...record}=await this.retainedRecord(id);result.push({...record,available:true});}
      catch{result.push({id,name:id,runtime:'ulanzi-original',available:false});}
    }
    return result;
  }
  // Only manage copies inside DeckForge's own validated store roots.
  async clearRetainedCode(id){
    this.directory(id);
    const entries=(await this.retainedEntries()).filter(e=>e.id.toLowerCase()===id.toLowerCase());
    for(const entry of entries){
      if(!entry.safe)throw Error('안전하지 않은 이전 보존 폴더: 자동 삭제하지 않았습니다.');
      const stat=await fs.lstat(entry.directory);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('이전 보존 폴더 변경 감지');
      await fs.rm(entry.directory,{recursive:true,force:false});
    }
  }
  async clearApproval(id){
    await this.prepareRoot(this.grants);
    await fs.rm(this.grantFile(id),{force:true});
  }
  async removalPlan(id){
    const record=await this.installed(id);
    return {id,name:record.manifest.Name,version:record.manifest.Version,revision:record.revision,runtime:'ulanzi-original'};
  }
  removeKeepingData(id,revision,purge=false){return this.serial(async()=>{
    const plan=await this.removalPlan(id);
    if(plan.revision!==revision)throw Error('original revision changed');
    this.managing.add(id);
    try{
      await this.cancelDraft(id);
      const host=this.active.get(id);this.active.delete(id);await host?.close();
      const current=await this.removalPlan(id);
      if(current.revision!==revision)throw Error('original revision changed');
      await this.clearApproval(id);
      await this.clearRetainedCode(id);
      await fs.rm(this.directory(id),{recursive:true,force:false});
      if(purge===true){
        try{
          await this.prepareRoot(this.settings);
          await fs.rm(this.globalFile(id),{force:true});
          return {...plan,status:'removed',purgeStatus:'purged'};
        }catch(error){return {...plan,status:'removed',purgeStatus:'failed',purgeError:String(error?.message||error)};}
      }
      return {...plan,status:'removed'};
    }finally{this.managing.delete(id);}
  });}
  restoreRetained(id,revision){return this.serial(async()=>{
    const record=await this.retainedRecord(id);
    if(record.revision!==revision)throw Error('retained original revision changed');
    await this.prepareRoot(this.root);
    const target=this.directory(id),entries=await fs.readdir(this.root);
    if(entries.some(n=>n.toLowerCase()===path.basename(target).toLowerCase()))throw Error('original plugin already installed');
    // Restore without execution approval. Existing encrypted global settings remain untouched.
    await this.writePermission(id,revision,false);
    const current=await this.retainedRecord(id);
    if(current.revision!==revision)throw Error('retained original revision changed');
    await fs.rename(current.directory,target);
    const {directory,...result}=record;return {...result,status:'restored',originalApproved:false};
  });}
  exportBackup(id,retained=false){return this.serial(async()=>{
    this.directory(id);
    const prior=retained?await this.retainedRecord(id):await this.installed(id),files=[];
    const source=retained?prior.directory:this.directory(id);
    const record=await scanOriginal(source,{onFile:(name,bytes)=>files.push({path:name,bytes:bytes.toString('base64')})});
    if(record.manifest.UUID!==id||record.revision!==prior.revision)throw Error('original backup revision changed');
    const bytes=Buffer.from(JSON.stringify({format:BACKUP_FORMAT,id,revision:record.revision,files}),'utf8');
    if(bytes.length>BACKUP_LIMIT)throw Error('original backup size limit');
    return {id,name:record.manifest.Name,version:record.manifest.Version,revision:record.revision,bytes};
  });}
  importBackup(bytes,expectedRevision){return this.serial(async()=>{
    const record=parseOriginalBackup(bytes),id=record.manifest.UUID;
    if(record.revision!==expectedRevision)throw Error('original backup revision changed');
    await this.prepareRoot(this.root);
    const target=this.directory(id),entries=await fs.readdir(this.root);
    if(entries.some(n=>n.toLowerCase()===path.basename(target).toLowerCase()))throw Error('original plugin already installed');
    const stage=path.join(this.root,'.stage-'+randomUUID());await fs.mkdir(stage);
    try{
      for(const file of record.files){
        const dest=path.join(stage,...file.name.split('/'));
        await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.bytes,{flag:'wx'});
      }
      const verified=await scanOriginal(stage);
      if(verified.manifest.UUID!==id||verified.revision!==record.revision)throw Error('original backup staged revision changed');
      await this.clearApproval(id);
      await this.clearRetainedCode(id);
      await fs.rename(stage,target);
      return {id,name:record.manifest.Name,version:record.manifest.Version,revision:record.revision,status:'restored',runtime:'ulanzi-original',originalApproved:false};
    }finally{await fs.rm(stage,{recursive:true,force:true});}
  });}
  async installed(id){
    const record=await scanOriginal(this.directory(id));
    if(record.manifest.UUID!==id)throw Error('original plugin identity mismatch');
    return record;
  }
  async grant(id){
    let bytes;
    try{const file=this.grantFile(id),st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error('invalid original grant');bytes=await fs.readFile(file);}
    catch(e){if(e.code==='ENOENT')return {};throw e;}
    if(!this.storage?.isEncryptionAvailable())throw Error('original grant encryption unavailable');
    const value=JSON.parse(this.storage.decryptString(bytes));
    if(value.id!==id||!/^[a-f0-9]{64}$/.test(value.revision)||typeof value.approved!=='boolean')throw Error('invalid original grant');
    return value;
  }
  async info(id){
    const record=await this.installed(id),grant=await this.grant(id);
    return {...record,approved:grant.revision===record.revision&&grant.approved===true,decided:grant.revision===record.revision&&typeof grant.approved==='boolean'};
  }
  async writePermission(id,revision,approved){
    if(typeof approved!=='boolean'||!/^[a-f0-9]{64}$/.test(revision))throw Error('invalid original permission');
    if(!this.storage?.isEncryptionAvailable())throw Error('original grant encryption unavailable');
    await this.prepareRoot(this.grants);
    const file=this.grantFile(id),tmp=file+'.'+randomUUID()+'.tmp';
    try{
      await fs.writeFile(tmp,this.storage.encryptString(JSON.stringify({id,revision,approved})),{flag:'wx'});
      await fs.rename(tmp,file);
    }finally{await fs.rm(tmp,{force:true});}
  }
  setPermission(id,revision,approved){return this.serial(async()=>{
    const record=await this.installed(id);
    if(record.revision!==revision)throw Error('original package changed');
    await this.writePermission(id,revision,approved);
    // Permission changes never leave a process running under an older approval.
    await this.cancelDraft(id);
    const host=this.active.get(id);this.active.delete(id);await host?.close();
    return {approved};
  });}
  globalFile(id){this.directory(id);return path.join(this.settings,hash(id)+'.encrypted');}
  async readGlobal(id){
    const file=this.globalFile(id);let st;
    try{st=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return {};throw e;}
    if(!st.isFile()||st.isSymbolicLink()||st.size>65536||!this.storage?.isEncryptionAvailable())throw Error('original global settings unavailable');
    const value=JSON.parse(this.storage.decryptString(await fs.readFile(file)));
    if(value.id!==id||value.version!==1)throw Error('original global identity mismatch');
    return validateValue(value.settings);
  }
  async writeGlobal(id,value,active){
    validateValue(value);
    if(!active()||this.closed||!this.storage?.isEncryptionAvailable())return false;
    await this.readGlobal(id);await this.prepareRoot(this.settings);
    const file=this.globalFile(id),tmp=file+'.'+randomUUID()+'.tmp';
    const bytes=this.storage.encryptString(JSON.stringify({id,version:1,settings:value}));
    if(bytes.length>65536)throw Error('original global size limit');
    try{await fs.writeFile(tmp,bytes,{flag:'wx'});if(!active()||this.closed)return false;await fs.rename(tmp,file);return true;}
    finally{await fs.rm(tmp,{force:true});}
  }
  startApproved(id,onUpdate=()=>{},language='ko'){return this.serial(async()=>{
    const info=await this.info(id);
    if(!info.approved){const existing=this.active.get(id);this.active.delete(id);await existing?.close();throw Error('original plugin approval required');}
    const existing=this.active.get(id);
    if(existing&&existing.approvedRevision===info.revision&&existing.alive())return existing;
    if(existing){this.active.delete(id);await existing.close();}
    const host=this.hostFactory(this.directory(id),onUpdate);host.getParent=this.getParent;host.sendHotkey=this.sendHotkey;
    try{
      host.globalSettings=await this.readGlobal(id);host.globalWrite=(value,active)=>this.writeGlobal(id,value,active);
      await host.start({approved:true,language,verifyBeforeSpawn:async()=>{
        const current=await this.info(id);
        return current.approved&&current.revision===info.revision&&!this.closed;
      }});
      host.approvedRevision=info.revision;this.active.set(id,host);return host;
    }catch(error){await host.close();throw error;}
  });}
  async cancelDraft(id=null){
    const record=this.draft;if(!record||id&&record.id!==id)return;
    record.cancelled=true;await record.host?.close();
  }
  async editDraft(id,actionId,slot,settings,active=()=>true){
    this.directory(id);validateValue(settings);
    if(!settings||typeof settings!=='object'||Array.isArray(settings)||!Number.isInteger(slot)||slot<0||slot>18)throw Error('invalid original draft');
    if(this.closed||!active()||this.draft||this.managing.has(id))throw Error('original draft unavailable or busy');
    const record={id,cancelled:false,host:null};this.draft=record;
    const current=()=>!this.closed&&!record.cancelled&&this.draft===record&&active();
    try{
      const info=await this.info(id),action=info.manifest.Actions.find(a=>a.UUID===actionId);
      if(!current())return {status:'cancelled'};
      if(!info.approved)throw Error('원본 실행 권한 확인 필요');
      if(!action?.PropertyInspectorPath||!(action.Controllers||['Keypad']).includes(slot>=16?'Encoder':'Keypad'))throw Error('원본 속성창을 사용할 수 없습니다.');
      const context='draft:'+randomUUID(),host=this.hostFactory(this.directory(id),()=>{});record.host=host;
      host.getParent=this.getParent;host.globalSettings=await this.readGlobal(id);
      // Temporary process: never publish visuals, send physical input, or write global settings.
      host.sendHotkey=async()=>false;host.globalWrite=null;
      if(!current())return {status:'cancelled'};
      await host.start({approved:true,language:'ko',verifyBeforeSpawn:async()=>{
        const next=await this.info(id);return current()&&next.approved&&next.revision===info.revision;
      }});
      const deadline=Date.now()+5000;
      while(current()&&host.alive()&&!host.socket&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
      if(!current())return {status:'cancelled'};
      if(!host.socket||!host.alive())throw Error('원본 속성창 연결 실패');
      const socket=host.socket;
      host.sync([{context,slot,pluginUUID:id,actionUUID:actionId,settings:structuredClone(settings)}]);
      const win=await host.openInspector(context,this.getParent());
      if(!win.isDestroyed())await new Promise(resolve=>win.once('closed',resolve));
      if(!current()||host.closed||host.socket!==socket||!host.alive())return {status:'cancelled'};
      const next=await this.info(id);
      if(!current()||!next.approved||next.revision!==info.revision||host.socket!==socket||!host.alive())return {status:'cancelled'};
      const value=host.mounts.get(context)?.settings;
      validateValue(value);
      return {status:'submitted',settings:structuredClone(value)};
    }catch(error){if(!current())return {status:'cancelled'};throw error;}
    finally{try{await record.host?.close();}finally{if(this.draft===record)this.draft=null;}}
  }
  stop(id){return this.serial(async()=>{const host=this.active.get(id);this.active.delete(id);await host?.close();});}
  async close(){
    this.closed=true;await this.cancelDraft();await this.queue;
    const hosts=[...this.active.values()];this.active.clear();await Promise.all(hosts.map(host=>host.close()));
  }
}
module.exports={scanOriginal,UlanziOriginalStore,parseOriginalBackup,BACKUP_LIMIT};
