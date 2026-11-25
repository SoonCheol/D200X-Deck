'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const OPS=['install','update','rollback','remove','restore','purge'];
const STAGES=['select','validate','confirm','execute'];
const STATUSES=['success','cancelled','failed','incomplete'];
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{2,180}$/.test(v)&&!/(?:eyJ[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})/.test(v)?v:undefined;
const version=v=>typeof v==='string'&&/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(v)?v:undefined;
function name(v){
 if(typeof v!=='string'||/(?:https?:\/\/|[\\/:]|bearer|token|password|secret|api[_ -]?key|eyJ[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})/i.test(v))return undefined;
 return v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,100);
}
function reason(error){
 const code=error?.code;
 if(['ENOENT','EACCES','EPERM','EBUSY','ENOSPC','EEXIST','EIO'].includes(code))return code;
 const m=String(error?.message||'');
 if(/dependen|의존/.test(m))return 'dependency';
 if(/revision|변경 감지|data changed|retained file changed/.test(m))return 'revision_changed';
 if(/already installed|이미 있|identical version/.test(m))return 'already_installed';
 if(/manifest|invalid|unsupported|호환|형식/.test(m))return 'validation';
 return 'operation_error';
}
function project(r){
 if(!r||!OPS.includes(r.operation)||!STAGES.includes(r.stage)||!STATUSES.includes(r.status))return null;
 const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000?v:undefined;
 return {at:typeof r.at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at)?r.at:undefined,
  trace:safeId(r.trace),deckForgeVersion:version(r.deckForgeVersion),operation:r.operation,stage:r.stage,status:r.status,
  pluginId:safeId(r.pluginId),pluginName:name(r.pluginName),pluginVersion:version(r.pluginVersion),previousVersion:version(r.previousVersion),
  mode:['keepData','purge'].includes(r.mode)?r.mode:undefined,deleted:count(r.deleted),total:count(r.total),
  reason:['ENOENT','EACCES','EPERM','EBUSY','ENOSPC','EEXIST','EIO','dependency','revision_changed','already_installed','validation','operation_error'].includes(r.reason)?r.reason:undefined};
}
function createPluginAudit({userData,appVersion,clock=()=>new Date(),maxBytes=1024*1024,onError=()=>{}}){
 let queue=Promise.resolve();
 async function append(record){
  const row=project(record);if(!row)return;
  const job=queue.then(async()=>{
   const dir=path.join(userData,'diagnostics'),file=path.join(dir,'plugin-management.jsonl');
   await fs.mkdir(dir,{recursive:true});
   const line=JSON.stringify(row)+'\n';
   try{if((await fs.stat(file)).size+Buffer.byteLength(line)>maxBytes)await fs.rename(file,file+'.previous');}
   catch(e){if(e.code!=='ENOENT')throw e;}
   await fs.appendFile(file,line,'utf8');
  });
  queue=job.catch(()=>{});try{await job;}catch{onError();}
 }
 return async function run(operation,id,fn){
  const record={operation,stage:'validate',pluginId:id,trace:randomUUID(),deckForgeVersion:appVersion};
  const audit={
   stage(v){if(STAGES.includes(v))record.stage=v;},
   identify(p){if(!p)return;record.pluginId=p.id||p.uuid||record.pluginId;record.pluginName=p.name||record.pluginName;record.pluginVersion=p.version||p.nextVersion||record.pluginVersion;record.previousVersion=p.currentVersion||record.previousVersion;},
   operation(v){if(OPS.includes(v))record.operation=v;},
   mode(v){record.mode=v;}
  };
  try{
   const result=await fn(audit);audit.identify(result);
   await append({...record,at:clock().toISOString(),status:result==null?'cancelled':result.status==='incomplete'?'incomplete':'success',deleted:result?.deleted,total:result?.total});
   return result;
  }catch(error){await append({...record,at:clock().toISOString(),status:'failed',reason:reason(error)});throw error;}
 };
}
module.exports={createPluginAudit,project};
