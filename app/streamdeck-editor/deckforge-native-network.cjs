'use strict';
// Fixed, user-approved HTTPS endpoints. No renderer socket, arbitrary headers,
// redirect, automatic retry, script-visible credentials, or TLS verification bypass.
const https=require('node:https');
const {createHash}=require('node:crypto');
const {validateValue}=require('./deckforge-native-settings.cjs');
const MAX_RESPONSE=8192,MAX_BODY=8192,DEADLINE=5000;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
function check(ok,why){if(!ok)throw Error('DeckForge SDK network: '+why);}
function validateNetworkEndpoints(endpoints,permissions){
  if(endpoints===undefined){check(!permissions.includes('network.request'),'missing endpoints');return;}
  check(permissions.includes('network.request')&&Array.isArray(endpoints)&&endpoints.length>0&&endpoints.length<=8,'invalid endpoint list or permission');
  const ids=new Set();
  for(const e of endpoints){
    check((exact(e,['id','url','method'])||(exact(e,['id','url','method','auth'])&&e.auth==='bearer'))&&key(e.id)&&!ids.has(e.id)&&['GET','POST'].includes(e.method),'invalid endpoint identity or method');
    ids.add(e.id);
    check(typeof e.url==='string'&&e.url.length<=1024,'invalid endpoint URL');
    let u;try{u=new URL(e.url);}catch{throw Error('DeckForge SDK network: invalid endpoint URL');}
    check(u.protocol==='https:'&&u.href===e.url&&!u.username&&!u.password&&!u.hash&&!u.search,'only canonical HTTPS URLs without credentials, query or fragment');
  }
}
function validateNetworkRequest(op,endpoints){
  check(exact(op,['op','endpoint','body'])&&op.op==='networkRequest'&&key(op.endpoint),'invalid request');
  const endpoint=endpoints?.find(e=>e.id===op.endpoint);
  check(endpoint,'endpoint not approved');
  if(endpoint.method==='GET')check(op.body===null,'GET must not contain a body');
  else{
    validateValue(op.body);
    check(Buffer.byteLength(JSON.stringify(op.body))<=MAX_BODY,'body limit');
  }
  return endpoint;
}
function credentialBinding(pluginId,endpoint){
  check(endpoint?.auth==='bearer','credential endpoint required');
  return 'com.deckforge.native.credential-'+createHash('sha256').update(JSON.stringify([pluginId,endpoint.id,endpoint.method,endpoint.url,endpoint.auth])).digest('hex');
}
function validBearer(token){return typeof token==='string'&&token.length>=1&&token.length<=4096&&/^[A-Za-z0-9._~+/-]+=*$/.test(token);}
function networkFailure(endpoint,error,status=0){return {endpoint,ok:false,status,body:'',error};}
function requestEndpoint(endpoint,body,signal,{request=https.request,deadline=DEADLINE,bearer=null}={}){
  return new Promise(resolve=>{
    let req,timer,done=false;
    const fail=(code,status)=>finish(networkFailure(endpoint.id,code,status));
    const finish=value=>{
      if(done)return;done=true;clearTimeout(timer);
      signal?.removeEventListener('abort',abort);resolve(value);
    };
    const abort=()=>{fail('cancelled');req?.destroy();};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{fail('timeout');req?.destroy();},deadline);
    try{
      if(endpoint.auth==='bearer'&&!validBearer(bearer)){fail('credential-required');return;}
      if(endpoint.auth!=='bearer'&&bearer!==null){fail('credential-not-approved');return;}
      const payload=body===null?null:Buffer.from(JSON.stringify(body),'utf8');
      const headers={accept:'application/json, text/plain','accept-encoding':'identity'};
      if(bearer!==null)headers.authorization='Bearer '+bearer;
      if(payload){headers['content-type']='application/json';headers['content-length']=payload.length;}
      req=request(new URL(endpoint.url),{method:endpoint.method,headers,agent:false,
        rejectUnauthorized:true,minVersion:'TLSv1.2',maxHeaderSize:8192},res=>{
        const status=Number(res.statusCode)||0;
        if(status<200||status>=300){fail(status>=300&&status<400?'redirect-denied':'http-error',status);res.destroy();return;}
        const content=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        const encoding=String(res.headers['content-encoding']||'identity').toLowerCase();
        if(encoding!=='identity'||(status!==204&&!['application/json','text/plain'].includes(content))){
          fail('unsupported-response',status);res.destroy();return;
        }
        const chunks=[];let bytes=0;
        res.on('data',chunk=>{
          bytes+=chunk.length;
          if(bytes>MAX_RESPONSE){fail('response-limit',status);res.destroy();req.destroy();}
          else chunks.push(chunk);
        });
        res.on('error',()=>fail('response-error',status));
        res.on('aborted',()=>fail('response-error',status));
        res.on('end',()=>{
          const text=Buffer.concat(chunks).toString('utf8');
          if(bearer!==null&&text.includes(bearer)){fail('credential-in-response',status);return;}
          // The serialized result must also fit within the renderer input cap.
          if(Buffer.byteLength(JSON.stringify(text))>MAX_RESPONSE){fail('response-limit',status);return;}
          finish({endpoint:endpoint.id,ok:true,status,body:text,error:null});
        });
      });
      req.on('error',()=>fail('connection-error'));
      req.on('upgrade',(_res,socket)=>{socket.destroy();fail('unsupported-response');});
      req.end(payload||undefined);
    }catch{fail('connection-error');req?.destroy();}
  });
}
module.exports={validateNetworkEndpoints,validateNetworkRequest,requestEndpoint,networkFailure,credentialBinding,validBearer};
