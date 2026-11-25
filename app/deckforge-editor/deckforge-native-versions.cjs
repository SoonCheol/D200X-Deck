'use strict';
// Version management for native manifests only. The existing Stream Deck
// importer remains independent. History contains code, never profile settings.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const semver=require('semver');
const LIMIT=1024*1024,MAX_HISTORY=64;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
function assert(ok,message){if(!ok)throw Error('DeckForge plugin version: '+message);}
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const fingerprint=m=>sha(canonical(m));
function assertAppRequirement(requirement,current){
  if(requirement===undefined)return;
  assert(typeof requirement==='string'&&requirement.length<=128&&requirement.trim()&&
    semver.validRange(requirement)!==null,'invalid required DeckForge version range');
  assert(semver.satisfies(current,requirement),'requires DeckForge '+requirement);
}
function assertCompatible(current,next){
  assert(current.id===next.id,'plugin identity changed');
  // Only the shipped HA manifest may retire the four superseded link fields.
  // Stored values remain in profiles; no legacy target is inferred or executed.
  const haId='com.deckforge.native.home-assistant';
  const retiredHaLink=new Set(['offEntity','offOperation','onEntity','onOperation']);
  const migrateHa=current.id===haId&&['0.1.9','0.1.10'].includes(current.version)&&
    fingerprint(next)===fingerprint(require('./deckforge-ha-plugin.cjs').createHomeAssistantManifest(next.networkEndpoints?.find(e=>e.id==='ha')?.url??null));
  // Profiles can contain references on hidden pages. Do not infer that any
  // removed action is unused. Keep action contracts valid without migration.
  for(const old of current.actions){
    const action=next.actions.find(a=>a.id===old.id);
    assert(action&&action.states===old.states&&old.controllers.every(c=>action.controllers.includes(c)),
      'existing action contract would be removed or changed: '+old.id);
    // Without a settings migration, existing declared fields must retain their value contract.
    for(const field of old.settingsSchema||[]){
      const updated=action.settingsSchema?.find(f=>f.key===field.key);
      if(!updated&&migrateHa&&old.id===haId+'.control'&&retiredHaLink.has(field.key))continue;
      const contract=({label,...rest})=>({...rest,...(rest.options?{options:rest.options.map(o=>o.value)}:{})});
      assert(updated&&canonical(contract(updated))===canonical(contract(field)),
        'existing settings contract would be changed: '+old.id+'.'+field.key);
    }
  }
}
class NativeVersionStore{
  constructor(root,validate){
    this.root=root;this.validate=validate;
  }
  currentFile(id){
    assert(typeof id==='string'&&ID.test(id)&&!id.includes('..')&&!id.endsWith('.'),'invalid plugin ID');
    return path.join(this.root,id+'.deckforge-native.json');
  }
  historyDir(id){this.currentFile(id);return path.join(this.root,'NativeHistory',id);}
  historyFile(id,digest){
    assert(typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest),'invalid revision');
    return path.join(this.historyDir(id),digest+'.json');
  }
  async read(file,allowMissing=false){
    try{
      const st=await fs.lstat(file);
      assert(st.isFile()&&st.size<=LIMIT,'invalid stored manifest');
      const raw=await fs.readFile(file);
      assert(raw.length<=LIMIT,'stored manifest exceeds limit');
      const manifest=this.validate(JSON.parse(raw.toString('utf8')));
      return {raw,manifest,revision:sha(raw),digest:fingerprint(manifest)};
    }catch(error){
      if(allowMissing&&error.code==='ENOENT')return null;
      throw error;
    }
  }
  removedFile(id){this.currentFile(id);return path.join(this.root,'NativeRemoved',id+'.json');}
  async removed(id){
    const file=this.removedFile(id),dir=path.dirname(file);
    try{const st=await fs.lstat(dir);assert(st.isDirectory()&&!st.isSymbolicLink(),'invalid retained directory');}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
    const prior=await this.read(file,true);
    assert(!prior||prior.manifest.id===id,'retained manifest identity mismatch');
    return prior;
  }
  async listRemoved(){
    const dir=path.dirname(this.removedFile('com.deckforge.native.placeholder'));
    let names;
    try{const st=await fs.lstat(dir);assert(st.isDirectory()&&!st.isSymbolicLink(),'invalid retained directory');names=await fs.readdir(dir);}
    catch(error){if(error.code==='ENOENT')return [];throw error;}
    const result=[];
    for(const name of names.sort()){
      const id=name.endsWith('.json')?name.slice(0,-5):'';
      if(!ID.test(id)||id.includes('..')||id.endsWith('.'))continue;
      try{
        const prior=await this.removed(id);
        if(prior)result.push({id,name:prior.manifest.name,version:prior.manifest.version,revision:prior.revision});
      }catch{result.push({id,name:id,available:false});}
    }
    return result;
  }
  async retainedHistory(id){
    const dir=this.historyDir(id),parent=path.dirname(dir);
    for(const folder of [parent,dir]){
      try{const st=await fs.lstat(folder);assert(st.isDirectory()&&!st.isSymbolicLink(),'invalid history directory');}
      catch(error){if(error.code==='ENOENT')return [];throw error;}
    }
    const result=[];
    for(const name of (await fs.readdir(dir)).sort()){
      assert(/^[a-f0-9]{64}\.json$/.test(name),'unrecognized history entry; no data deleted');
      const file=path.join(dir,name),record=await this.read(file);
      assert(record.manifest.id===id&&record.digest+'.json'===name,'history integrity mismatch');
      result.push({...record,file});
    }
    return result;
  }
  async assertReinstall(next){
    const prior=await this.removed(next.id);
    if(!prior)return;
    assertCompatible(prior.manifest,next);
    assert(prior.digest===fingerprint(next)||(semver.valid(prior.manifest.version)&&semver.valid(next.version)&&semver.gt(next.version,prior.manifest.version)),
      'reinstall requires preserved version or compatible newer version');
  }
  async planRemoval(id){
    const current=await this.read(this.currentFile(id));
    assert(current.manifest.id===id,'installed manifest identity mismatch');
    return {id,name:current.manifest.name,version:current.manifest.version,revision:current.revision,mode:'keepData'};
  }
  async removeKeepingData(id,expectedRevision,beforeCommit=()=>{}){
    const target=this.currentFile(id),current=await this.read(target);
    assert(current.manifest.id===id&&current.revision===expectedRevision,'installed revision changed; reopen removal');
    const removed=this.removedFile(id),dir=path.dirname(removed);
    await fs.mkdir(dir,{recursive:true});
    const prior=await this.removed(id);
    if(prior)await this.preserve(prior);
    await this.preserve(current);
    const latest=await this.read(target);
    assert(latest.revision===expectedRevision,'installed revision changed; reopen removal');
    beforeCommit();
    // Move only the active manifest. Previous code is already retained in
    // immutable history; profile data, vaults and service preferences are untouched.
    await fs.rename(target,removed);
    return {id,version:current.manifest.version,mode:'keepData'};
  }
  async plan(next){
    this.validate(next);
    const current=await this.read(this.currentFile(next.id),true);
    if(!current){await this.assertReinstall(next);return {kind:'install',currentVersion:null,nextVersion:next.version,currentRevision:null};}
    assert(current.manifest.id===next.id,'installed manifest identity mismatch');
    const digest=fingerprint(next);
    assert(current.digest!==digest,'identical version already installed');
    assert(semver.valid(current.manifest.version)&&semver.valid(next.version),'updates require valid semantic versions');
    assertCompatible(current.manifest,next);
    const order=semver.compare(next.version,current.manifest.version);
    assert(order!==0,'same version with different content is forbidden');
    if(order<0){
      const prior=await this.read(this.historyFile(next.id,digest),true);
      assert(prior&&prior.digest===digest&&prior.manifest.id===next.id,'rollback is allowed only to preserved original code');
    }
    return {kind:order>0?'update':'rollback',currentVersion:current.manifest.version,nextVersion:next.version,
      currentRevision:current.revision,previousPermissions:[...current.manifest.permissions],
      addedPermissions:next.permissions.filter(p=>!current.manifest.permissions.includes(p))};
  }
  async planHaConfiguration(next){
    const {createHomeAssistantManifest}=require('./deckforge-ha-plugin.cjs');
    const id='com.deckforge.native.home-assistant';
    assert(next.id===id,'invalid built-in HA identity');
    const generated=m=>createHomeAssistantManifest(m.networkEndpoints?.find(e=>e.id==='ha')?.url??null);
    assert(fingerprint(next)===fingerprint(generated(next)),'only built-in HA server configuration may change');
    const current=await this.read(this.currentFile(id),true);
    if(!current||current.manifest.version!==next.version)return this.plan(next);
    assert(fingerprint(current.manifest)===fingerprint(generated(current.manifest)),'only built-in HA server configuration may change');
    this.validate(next);assertCompatible(current.manifest,next);
    return {kind:current.digest===fingerprint(next)?'unchanged':'configure',currentVersion:current.manifest.version,nextVersion:next.version,currentRevision:current.revision,
      previousPermissions:[...current.manifest.permissions],addedPermissions:next.permissions.filter(p=>!current.manifest.permissions.includes(p))};
  }
  async preserve(current){
    const id=current.manifest.id,dir=this.historyDir(id),file=this.historyFile(id,current.digest);
    await fs.mkdir(dir,{recursive:true});
    const previous=await this.read(file,true);
    if(previous){assert(previous.digest===current.digest,'history integrity mismatch');return;}
    const names=await fs.readdir(dir);
    assert(names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).length<MAX_HISTORY,'history limit; no revisions deleted');
    const tmp=path.join(dir,'.history-'+randomUUID());
    try{
      await fs.writeFile(tmp,current.raw,{flag:'wx'});
      try{await fs.link(tmp,file);}catch(error){
        if(error.code!=='EEXIST')throw error;
        const existing=await this.read(file);
        assert(existing.digest===current.digest,'history integrity mismatch');
      }
    }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  }
  async replace(next,expectedRevision,beforeCommit=()=>{},onAbort=()=>{},haConfiguration=false){
    const plan=haConfiguration?await this.planHaConfiguration(next):await this.plan(next);
    assert(!['install','unchanged'].includes(plan.kind)&&plan.currentRevision===expectedRevision,'installed revision changed; reselect package');
    const target=this.currentFile(next.id),current=await this.read(target);
    assert(current.revision===expectedRevision,'installed revision changed');
    const nextBytes=Buffer.from(JSON.stringify(next));
    assert(nextBytes.length<=LIMIT,'program too large');
    await this.preserve(current);
    const tmp=path.join(this.root,'.native-update-'+randomUUID());
    let prepared=false,committed=false;
    try{
      await fs.writeFile(tmp,nextBytes,{flag:'wx'});
      const check=await this.read(target);
      assert(check.revision===expectedRevision,'installed revision changed');
      // The host serializes installs and pauses the affected contexts only.
      // Preserve the original first; do not delete or truncate the active file.
      beforeCommit();prepared=true;
      await fs.rename(tmp,target);committed=true;
      return plan;
    }finally{
      if(prepared&&!committed)onAbort();
      await fs.rm(tmp,{force:true}).catch(()=>{});
    }
  }
}
module.exports={NativeVersionStore,assertAppRequirement,fingerprint};
