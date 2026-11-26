'use strict';
// Per-plugin encrypted settings. Never fall back to plaintext or overwrite
// an unreadable vault. No credential values are sent to editor IPC or logs.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
const MAX=8192;
function validateValue(value,maxBytes=MAX){
  const valid=(v,depth=0)=>{
    if(depth>12)return false;
    if(Array.isArray(v))return v.every(x=>valid(x,depth+1));
    if(v&&typeof v==='object')return Object.keys(v).every(k=>!['__proto__','constructor','prototype'].includes(k)&&valid(v[k],depth+1));
    return v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
  };
  if(!value||typeof value!=='object'||Array.isArray(value)||!valid(value)||Buffer.byteLength(JSON.stringify(value))>maxBytes)
    throw Error('invalid global settings');
  return value;
}
class NativeSettingsVault{
  constructor(userData,storage,scope='settings'){
    if(!['settings','credentials','browser'].includes(scope))throw Error('invalid vault scope');
    this.scope=scope;
    this.root=path.join(userData,'Plugins',scope==='credentials'?'NativeCredentials':scope==='browser'?'NativeBrowserPermissions':'NativeSettings');
    this.storage=storage;this.writers=new Map();this.pendingWrites=0;
  }
  file(id){
    if(typeof id!=='string'||!ID.test(id)||id.includes('..')||id.endsWith('.'))throw Error('invalid plugin ID');
    return path.join(this.root,id+'.encrypted');
  }
  async available(){
    if(!await this.storage.isAsyncEncryptionAvailable())throw Error('encrypted settings unavailable');
  }
  async read(id){
    const file=this.file(id);
    // Only a missing file at the initial lookup represents an empty vault.
    // A later read/decrypt error must never be interpreted as missing data.
    let st;
    try{st=await fs.lstat(file);}
    catch(error){
      if(error.code==='ENOENT')return {value:{},revision:null};
      throw Error('encrypted settings read failed');
    }
    try{
      if(!st.isFile()||st.size>65536)throw Error('invalid vault file');
      const bytes=await fs.readFile(file);
      if(bytes.length>65536)throw Error('invalid vault file size');
      await this.available();
      const decrypted=await this.storage.decryptStringAsync(bytes);
      const envelope=JSON.parse(decrypted.result);
      if(envelope?.id!==id||envelope?.version!==1||(envelope.scope||'settings')!==this.scope)throw Error('invalid vault identity');
      return {value:validateValue(envelope.value),revision:createHash('sha256').update(bytes).digest('hex')};
    }catch{
      throw Error('encrypted settings read failed');
    }
  }
  write(id,value,revision,active=()=>true){
    let file,snapshot;
    try{
      file=this.file(id);
      validateValue(value);
      snapshot=JSON.parse(JSON.stringify(value));
      validateValue(snapshot);
    }catch(error){return Promise.reject(error);}
    // Serialize only writes to the same identity. A slow encryption task
    // from one plugin must not stall all unrelated settings/credentials.
    let writer=this.writers.get(id);
    if(this.pendingWrites>=64||(writer?.pending||0)>=8)return Promise.reject(Error('encrypted settings write capacity'));
    if(!writer){writer={tail:Promise.resolve(),pending:0};this.writers.set(id,writer);}
    writer.pending++;this.pendingWrites++;
    const task=writer.tail.then(async()=>{
      if(!active())return false;
      await this.available();
      const prior=await this.read(id);
      if(prior.revision!==revision||!active())return false;
      await fs.mkdir(this.root,{recursive:true});
      const bytes=await this.storage.encryptStringAsync(JSON.stringify({id,version:1,value:snapshot,...(this.scope!=='settings'?{scope:this.scope}:{})}));
      if(!Buffer.isBuffer(bytes)||bytes.length>65536)throw Error('encrypted settings size limit');
      if(!active())return false;
      const tmp=file+'.'+randomUUID()+'.tmp';
      try{
        await fs.writeFile(tmp,bytes,{flag:'wx'});
        const latest=await this.read(id);
        if(latest.revision!==revision||!active())return false;
        // Atomic replacement within this app's serialized settings writer.
        if(revision===null){try{await fs.link(tmp,file);}catch(e){if(e.code==='EEXIST')return false;throw e;}}
        else await fs.rename(tmp,file);
        return true;
      }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    }).finally(()=>{
      this.pendingWrites--;writer.pending--;
      if(!writer.pending&&this.writers.get(id)===writer)this.writers.delete(id);
    });
    writer.tail=task.catch(()=>{});return task;
  }
}
module.exports={NativeSettingsVault,validateValue};
