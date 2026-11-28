'use strict';
// Trusted plugin code runs with the user's OS permissions, NOT in a security sandbox.
const path=require('node:path');
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {nodeRuntime,spawnNodeTask}=require('./deckforge-node-runtime.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const MAX_RESULT=8192;
const TASK_ID=/^[a-z][a-z0-9_-]{0,63}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=m=>createHash('sha256').update(JSON.stringify(m)).digest('hex');
function validateNodeTasks(tasks,enabled){
  if(!enabled){if(tasks!==undefined)throw Error('nodeTasks requires node.run');return;}
  if(!object(tasks)||Object.keys(tasks).length<1||Object.keys(tasks).length>16)throw Error('invalid nodeTasks');
  for(const [id,task] of Object.entries(tasks)){
    if(!TASK_ID.test(id)||['constructor','prototype','__proto__'].includes(id)||!object(task)||Object.keys(task).some(k=>!['source','timeoutMs'].includes(k))||
      typeof task.source!=='string'||!task.source.trim()||Buffer.byteLength(task.source)>65536||
      (task.timeoutMs!==undefined&&(!Number.isInteger(task.timeoutMs)||task.timeoutMs<1000||task.timeoutMs>120000)))throw Error('invalid Node task');
    try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;new AsyncFunction('input','require','"use strict";\n'+task.source);}catch{throw Error('invalid Node task syntax');}
  }
}
function validateNodeOperation(op,tasks){
  if(!object(op)||Object.keys(op).length!==3||op.op!=='runNode'||typeof op.task!=='string'||!tasks||!Object.hasOwn(tasks,op.task))throw Error('unknown Node task');
  validateValue(op.input,32768);
}
// Fixed bootstrap; plugin source and input arrive over stdin, not shell or command line.
const BOOTSTRAP=String.raw`(async()=>{
  const {createRequire}=require('node:module');
  const {Console}=require('node:console');
  const localRequire=createRequire(require('node:path').join(process.cwd(),'plugin.cjs'));
  global.console=new Console(process.stderr,process.stderr);
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const {source,input}=JSON.parse(raw);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const value=await new AsyncFunction('input','require','"use strict";\n'+source)(input,localRequire);
  process.stdout.write(JSON.stringify({value:value===undefined?null:value}));
})().catch(()=>{process.exitCode=1;});`;
async function executeNodeTask(task,input,cwd,signal){
  if(signal?.aborted)return {status:'cancelled'};
  let runtime;
  try{runtime=await nodeRuntime(20);}catch{return {status:'runtime-unavailable'};}
  if(signal?.aborted)return {status:'cancelled'};
  return new Promise(resolve=>{
    let child,timer,done=false,bytes=0,chunks=[];
    const finish=(result,terminate=false)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(terminate&&child){try{child.kill();}catch{}child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();}
      resolve(result);
    };
    const abort=()=>finish({status:'cancelled'},true);
    try{child=spawnNodeTask(runtime,BOOTSTRAP,cwd);}catch{return finish({status:'runtime-unavailable'});}
    child.on('error',()=>finish({status:'runtime-unavailable'},true));
    child.stdin.on('error',()=>finish({status:'error'},true));
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>MAX_RESULT)return finish({status:'result-limit'},true);chunks.push(chunk);
    });
    child.stderr.resume(); // Do not forward possibly sensitive plugin output.
    child.on('close',code=>{
      if(code!==0)return finish({status:'error'});
      try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));validateValue(value,MAX_RESULT);
        if(!Object.hasOwn(value,'value')||Object.keys(value).length!==1)throw Error('invalid response');
        finish({status:'ok',value:value.value});
      }catch{finish({status:'invalid-result'});}
    });
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)return abort();
    timer=setTimeout(()=>finish({status:'timeout'},true),task.timeoutMs??30000);
    child.stdin.end(JSON.stringify({source:task.source,input}));
  });
}
class TrustedNodeTasks{
  constructor(root,vault,approve=null,execute=executeNodeTask){
    this.root=root;this.vault=vault;this.approve=approve;this.execute=execute;this.jobs=new Map();this.changes=new Set();
  }
  async info(m){
    const {value}=await this.vault.read(m.id),revision=digest(m);
    return {id:m.id,name:m.name,version:m.version,digest:revision,approved:value.digest===revision&&value.approved===true,decided:value.digest===revision&&typeof value.approved==='boolean'};
  }
  cancel(ctx){const job=this.jobs.get(ctx.pluginUUID);if(job?.ctx===ctx)job.controller.abort();}
  async set(m,approved,active=()=>true){
    if(!m.permissions.includes('node.run')||typeof approved!=='boolean'||this.changes.has(m.id))throw Error('Node permission update busy or invalid');
    this.changes.add(m.id);if(!approved)this.jobs.get(m.id)?.controller.abort();
    try{const {revision}=await this.vault.read(m.id);
      if(!await this.vault.write(m.id,{digest:digest(m),approved},revision,active))throw Error('Node permission not saved');
      return {approved};
    }finally{this.changes.delete(m.id);}
  }
  async run(ctx,op,active){
    const m=ctx.nodeManifest,id=ctx.pluginUUID;
    if(!m||!m.permissions.includes('node.run')||!active())return {status:'cancelled'};
    if(this.jobs.has(id)||this.jobs.size>=8||this.changes.has(id))return {status:'busy'};
    const controller=new AbortController(),job={ctx,controller};this.jobs.set(id,job);
    const current=()=>active()&&!controller.signal.aborted&&!this.changes.has(id);
    try{
      validateNodeOperation(op,m.nodeTasks);
      const info=await this.info(m);
      if(!current())return {status:'cancelled'};
      if(!info.approved){
        if(info.decided||!this.approve)return {status:'denied'};
        const approved=await this.approve(info)===true;
        if(!current())return {status:'cancelled'};
        if(!approved){await this.set(m,false,active);return {status:'denied'};}
        await this.set(m,true,()=>active()&&!controller.signal.aborted);
      }
      if(!current())return {status:'cancelled'};
      const cwd=path.join(this.root,id);await fs.mkdir(cwd,{recursive:true});
      if(!current())return {status:'cancelled'};
      const result=await this.execute(m.nodeTasks[op.task],op.input,cwd,controller.signal);
      return current()?result:{status:'cancelled'};
    }catch{return {status:'error'};}
    finally{if(this.jobs.get(id)===job)this.jobs.delete(id);}
  }
}
module.exports={validateNodeTasks,validateNodeOperation,executeNodeTask,TrustedNodeTasks,digest};
