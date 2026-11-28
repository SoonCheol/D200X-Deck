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
async function scanOriginal(directory,{copyTo=null}={}){
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
      files.push([name,hash(bytes)]);
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
class UlanziOriginalStore{
  constructor(userData,{storage,getParent=()=>null,sendHotkey=async()=>false,hostFactory=(dir,emit)=>new UlanziNodeHost(dir,emit)}={}){
    this.root=path.join(userData,'Plugins','UlanziOriginal');
    this.grants=path.join(userData,'Plugins','UlanziOriginalApprovals');
    this.settings=path.join(userData,'Plugins','UlanziOriginalSettings');
    this.storage=storage;this.hostFactory=hostFactory;this.getParent=getParent;this.sendHotkey=sendHotkey;this.queue=Promise.resolve();this.active=new Map();this.closed=false;
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
  setPermission(id,revision,approved){return this.serial(async()=>{
    if(typeof approved!=='boolean')throw Error('invalid original permission');
    const record=await this.installed(id);
    if(record.revision!==revision)throw Error('original package changed');
    if(!this.storage?.isEncryptionAvailable())throw Error('original grant encryption unavailable');
    await this.prepareRoot(this.grants);
    const file=this.grantFile(id),tmp=file+'.'+randomUUID()+'.tmp';
    try{
      await fs.writeFile(tmp,this.storage.encryptString(JSON.stringify({id,revision,approved})),{flag:'wx'});
      await fs.rename(tmp,file);
    }finally{await fs.rm(tmp,{force:true});}
    // Permission changes never leave a process running under an older approval.
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
  stop(id){return this.serial(async()=>{const host=this.active.get(id);this.active.delete(id);await host?.close();});}
  async close(){
    this.closed=true;await this.queue;
    const hosts=[...this.active.values()];this.active.clear();await Promise.all(hosts.map(host=>host.close()));
  }
}
module.exports={scanOriginal,UlanziOriginalStore};
