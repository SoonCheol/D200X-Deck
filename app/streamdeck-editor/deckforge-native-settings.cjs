'use strict';
// Per-plugin encrypted settings. Never fall back to plaintext or overwrite
// an unreadable vault. No credential values are sent to editor IPC or logs.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
const MAX=8192;
function validateValue(value){
  const valid=(v,depth=0)=>{
    if(depth>12)return false;
    if(Array.isArray(v))return v.every(x=>valid(x,depth+1));
    if(v&&typeof v==='object')return Object.keys(v).every(k=>!['__proto__','constructor','prototype'].includes(k)&&valid(v[k],depth+1));
    return v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
  };
  if(!value||typeof value!=='object'||Array.isArray(value)||!valid(value)||Buffer.byteLength(JSON.stringify(value))>MAX)
    throw Error('invalid global settings');
  return value;
}
class NativeSettingsVault{
  constructor(userData,storage){
    this.root=path.join(userData,'Plugins','NativeSettings');
    this.storage=storage;this.queue=Promise.resolve();
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
    try{
      const st=await fs.lstat(file);
      if(!st.isFile()||st.size>65536)throw Error('invalid vault file');
      const bytes=await fs.readFile(file);
      await this.available();
      const decrypted=await this.storage.decryptStringAsync(bytes);
      const envelope=JSON.parse(decrypted.result);
      if(envelope?.id!==id||envelope?.version!==1)throw Error('invalid vault identity');
      return {value:validateValue(envelope.value),revision:createHash('sha256').update(bytes).digest('hex')};
    }catch(error){
      if(error.code==='ENOENT')return {value:{},revision:null};
      throw Error('encrypted settings read failed');
    }
  }
  write(id,value,revision,active=()=>true){
    const task=this.queue.then(async()=>{
      validateValue(value);
      const file=this.file(id);
      await this.available();
      const prior=await this.read(id);
      if(prior.revision!==revision||!active())return false;
      await fs.mkdir(this.root,{recursive:true});
      const bytes=await this.storage.encryptStringAsync(JSON.stringify({id,version:1,value}));
      if(!Buffer.isBuffer(bytes)||bytes.length>65536)throw Error('encrypted settings size limit');
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
    });
    this.queue=task.catch(()=>{});return task;
  }
}
module.exports={NativeSettingsVault,validateValue};
