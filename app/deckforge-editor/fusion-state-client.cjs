'use strict';
const fs=require('node:fs/promises');
const http=require('node:http');
const MAX=8192;
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,180}$/.test(v);
function projectState(raw,pid){
  const state=raw?.deckforgeState;
  if(raw?.ok!==true||state?.schema!==1||state.pid!==pid)return null;
  return {pid,workspace:validId(state.workspace)?state.workspace:null,
    tab:validId(state.tab)?state.tab:null,command:validId(state.command)?state.command:null};
}
async function readDiscovery(file,io=fs){
  try{
    const st=await io.stat(file);if(!st.isFile()||st.size>MAX)return null;
    const bytes=await io.readFile(file,'utf8');if(Buffer.byteLength(bytes)>MAX)return null;
    const d=JSON.parse(bytes);
    return d.status==='running'&&Number.isInteger(d.port)&&d.port>0&&d.port<=65535&&Number.isSafeInteger(d.pid)&&d.pid>0
      ?{pid:d.pid,port:d.port}:null;
  }catch{return null;}
}
function readHealth(port){
  return new Promise(resolve=>{
    let req,timer,done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    try{
      req=http.get({hostname:'127.0.0.1',port,path:'/health',agent:false,headers:{accept:'application/json'}},res=>{
        if(res.statusCode!==200){res.destroy();finish(null);return;}
        const chunks=[];let total=0;
        res.on('data',chunk=>{total+=chunk.length;if(total>MAX){finish(null);req.destroy();}else chunks.push(chunk);});
        res.on('end',()=>{try{finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(null);}});
        res.on('error',()=>finish(null));res.on('aborted',()=>finish(null));
      });
      timer=setTimeout(()=>{finish(null);req.destroy();},1600);
      req.on('error',()=>finish(null));
    }catch{finish(null);}
  });
}
async function readFusionState(file,foregroundPid=null,{io=fs,health=readHealth}={}){
  const discovery=await readDiscovery(file,io);
  if(!discovery||(foregroundPid!==null&&discovery.pid!==foregroundPid))return null;
  const raw=await health(discovery.port);
  // Discovery is mutable across Fusion restarts. Never match a different PID.
  const after=await readDiscovery(file,io);
  if(!after||after.pid!==discovery.pid||after.port!==discovery.port)return null;
  const state=projectState(raw,discovery.pid);
  return state?{status:'ready',...state}:{status:'unavailable',pid:discovery.pid};
}
module.exports={readFusionState,projectState,readDiscovery};
