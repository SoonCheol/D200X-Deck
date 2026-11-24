'use strict';
// User-approved HTTPS/WSS endpoints with bounded path/query/header parameters. No renderer socket, unapproved headers,
// redirect, script-visible credentials, or TLS verification bypass. WSS retry is opt-in and host-owned.
const https=require('node:https');
const {createHash}=require('node:crypto');
const {validateValue}=require('./deckforge-native-settings.cjs');
const MAX_RESPONSE=8192,MAX_BODY=8192,DEADLINE=5000;
const LARGE_SOCKET_RESPONSE=256*1024,DISCOVERY_SOCKET_RESPONSE=1024*1024;
function socketReceiveLimit(endpoint){return [LARGE_SOCKET_RESPONSE,DISCOVERY_SOCKET_RESPONSE].includes(endpoint?.maxReceiveBytes)?endpoint.maxReceiveBytes:MAX_RESPONSE;}
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
function check(ok,why){if(!ok)throw Error('DeckForge SDK network: '+why);}
const standardHeaders=new Set(['accept-language','if-match','if-none-match','if-modified-since','if-unmodified-since','idempotency-key','prefer']);
// Keep credentials, protocol framing, proxy/routing and method overrides out of plugin headers.
const headerKey=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(v)&&
  (standardHeaders.has(v)||(/^x-[a-z0-9]/.test(v)&&!/(?:auth|token|secret|password|api-key|cookie|session|csrf|xsrf|forwarded|proxy|host|real-ip|original|rewrite|override|http-method)/.test(v)));
const segment=v=>typeof v==='string'&&/^[A-Za-z0-9_.~-]{1,128}$/.test(v)&&v!=='.'&&v!=='..';
function keyList(list,max,predicate){return Array.isArray(list)&&list.length>0&&list.length<=max&&list.every(predicate)&&new Set(list).size===list.length;}
function validateNetworkEndpoints(endpoints,permissions){
  const http=permissions.includes('network.request'),socket=permissions.includes('network.websocket');
  if(endpoints===undefined){check(!http&&!socket,'missing endpoints');return;}
  check((http||socket)&&Array.isArray(endpoints)&&endpoints.length>0&&endpoints.length<=8,'invalid endpoint list or permission');
  const ids=new Set();
  for(const e of endpoints){
    check(obj(e)&&Object.keys(e).every(k=>['id','url','method','auth','queryKeys','pathKeys','headerKeys','reconnect','maxReceiveBytes'].includes(k))&&
      (e.auth===undefined||e.auth==='bearer'||(e.method==='WSS'&&e.auth==='home-assistant'))&&key(e.id)&&!ids.has(e.id)&&(e.method==='WSS'?socket:http&&['GET','POST','PUT','PATCH','DELETE'].includes(e.method)),'invalid endpoint identity or method');
    if(e.maxReceiveBytes!==undefined)check(e.method==='WSS'&&[MAX_RESPONSE,LARGE_SOCKET_RESPONSE,DISCOVERY_SOCKET_RESPONSE].includes(e.maxReceiveBytes),'invalid WSS receive limit');
    if(e.reconnect!==undefined)check(e.method==='WSS'&&typeof e.reconnect==='boolean','invalid WSS reconnect policy');
    if(e.queryKeys!==undefined)check(keyList(e.queryKeys,8,key),'invalid approved query keys');
    if(e.pathKeys!==undefined)check(e.method!=='WSS'&&keyList(e.pathKeys,4,key),'invalid approved path keys');
    if(e.headerKeys!==undefined)check(e.method!=='WSS'&&keyList(e.headerKeys,8,headerKey),'invalid approved header keys');
    ids.add(e.id);
    check(typeof e.url==='string'&&e.url.length<=1024,'invalid endpoint URL');
    let u;try{u=new URL(e.url);}catch{throw Error('DeckForge SDK network: invalid endpoint URL');}
    check(u.protocol===(e.method==='WSS'?'wss:':'https:')&&u.href===e.url&&!u.username&&!u.password&&!u.hash&&!u.search,'only canonical HTTPS/WSS URLs without credentials, query or fragment');
    if(e.pathKeys!==undefined)check(u.pathname.endsWith('/'),'approved path base must end in slash');
  }
  check(!http||endpoints.some(e=>e.method!=='WSS'),'missing HTTP endpoints');
  check(!socket||endpoints.some(e=>e.method==='WSS'),'missing WebSocket endpoints');
}
function validateNetworkRequest(op,endpoints){
  check(obj(op)&&Object.keys(op).every(k=>['op','endpoint','body','query','options'].includes(k))&&Object.hasOwn(op,'body')&&op.op==='networkRequest'&&key(op.endpoint),'invalid request');
  const endpoint=endpoints?.find(e=>e.id===op.endpoint);
  check(endpoint&&endpoint.method!=='WSS','HTTP endpoint not approved');
  if(endpoint.method==='GET')check(op.body===null,'GET must not contain a body');
  else if(endpoint.method!=='DELETE'||op.body!==null){
    validateValue(op.body);
    check(Buffer.byteLength(JSON.stringify(op.body))<=MAX_BODY,'body limit');
  }
  resolveNetworkEndpoint(endpoint,op.query,op.options);
  return endpoint;
}
function approvedHeaders(endpoint,headers){
  if(headers===undefined)return {};
  check(obj(headers)&&Object.keys(headers).length<=8&&Object.keys(headers).every(k=>
    headerKey(k)&&endpoint.headerKeys?.includes(k)&&typeof headers[k]==='string'&&
    headers[k].length<=256&&/^[ -~]*$/.test(headers[k])),'header not approved or invalid value');
  return {...headers};
}
// Origin and method remain fixed. Path keys are ordered, required single
// segments below the approved base; no slash, encoded slash or dot traversal.
function resolveNetworkEndpoint(endpoint,query,options){
  if(query===undefined&&options===undefined&&!endpoint.pathKeys)return endpoint;
  if(options!==undefined)check(obj(options)&&Object.keys(options).every(k=>['path','headers'].includes(k)),'invalid request options');
  const url=new URL(endpoint.url),path=options?.path;
  if(endpoint.pathKeys){
    check(obj(path)&&Object.keys(path).length===endpoint.pathKeys.length&&
      endpoint.pathKeys.every(k=>Object.hasOwn(path,k)&&segment(path[k])),'path not approved or invalid segment');
    url.pathname+=endpoint.pathKeys.map(k=>path[k]).join('/');
  }else check(path===undefined,'path not approved');
  if(query!==undefined){
    check(obj(query)&&Object.keys(query).length<=8&&Object.keys(query).every(k=>
      endpoint.queryKeys?.includes(k)&&typeof query[k]==='string'&&query[k].length<=256),'query not approved or invalid value');
    for(const k of Object.keys(query).sort())url.searchParams.set(k,query[k]);
  }
  const headers=approvedHeaders(endpoint,options?.headers);
  check(url.href.length<=2048,'query URL limit');
  return {...endpoint,url:url.href,...(Object.keys(headers).length?{requestHeaders:headers}:{})};
}
function validateSocketOperation(op,endpoints){
  if(op?.op==='socketConnect'){
    check((exact(op,['op','endpoint'])||exact(op,['op','endpoint','query']))&&key(op.endpoint),'invalid socket connect');
    const endpoint=endpoints?.find(e=>e.id===op.endpoint&&e.method==='WSS');
    check(endpoint,'WebSocket endpoint not approved');
    if(Object.hasOwn(op,'query'))resolveNetworkEndpoint(endpoint,op.query);
    return endpoint;
  }
  if(op?.op==='socketSend'){
    check(exact(op,['op','value']),'invalid socket send');
    if(typeof op.value!=='string')validateValue(op.value);
    check(Buffer.byteLength(JSON.stringify(op.value))<=MAX_BODY,'socket message limit');
    return;
  }
  check(op?.op==='socketClose'&&exact(op,['op']),'invalid socket close');
}
function createSocket(endpoint,{bearer=null,WebSocket=require('ws')}={}){
  check(endpoint.method==='WSS'&&new URL(endpoint.url).protocol==='wss:','invalid socket endpoint');
  check(endpoint.auth!==undefined?validBearer(bearer):bearer===null,'credential required or not approved');
  return new WebSocket(endpoint.url,{
    headers:endpoint.auth==='bearer'?{authorization:'Bearer '+bearer}:{},
    handshakeTimeout:DEADLINE,followRedirects:false,maxPayload:socketReceiveLimit(endpoint),
    perMessageDeflate:false,rejectUnauthorized:true,minVersion:'TLSv1.2'
  });
}
function credentialBinding(pluginId,endpoint){
  check(endpoint?.auth==='bearer'||(endpoint?.method==='WSS'&&endpoint.auth==='home-assistant'),'credential endpoint required');
  return 'com.deckforge.native.credential-'+createHash('sha256').update(JSON.stringify([pluginId,endpoint.id,endpoint.method,endpoint.url,endpoint.auth,...(endpoint.queryKeys?[['queryKeys',...endpoint.queryKeys.slice().sort()]]:[]),...(endpoint.pathKeys?[['pathKeys',...endpoint.pathKeys]]:[]),...(endpoint.headerKeys?[['headerKeys',...endpoint.headerKeys.slice().sort()]]:[])])).digest('hex');
}
function validBearer(token){return typeof token==='string'&&token.length>=1&&token.length<=4096&&/^[A-Za-z0-9._~+/-]+=*$/.test(token);}
function networkFailure(endpoint,error,status=0){return {endpoint,ok:false,status,body:'',error};}
// Do not forward arbitrary fields or transport/adapter error messages to
// plugin code. Keep a single bounded response contract at the host boundary.
const RESULT_ERRORS=new Set(['cancelled','timeout','credential-required','credential-not-approved','credential-in-response','redirect-denied','http-error','unsupported-response','response-limit','response-error','connection-error','credential-update-busy','credential-unavailable','capacity','invalid-response']);
function normalizeNetworkResult(endpoint,result,bearer=null){
  if(!exact(result,['endpoint','ok','status','body','error'])||result.endpoint!==endpoint.id||
     typeof result.ok!=='boolean'||!Number.isInteger(result.status)||result.status<0||result.status>599||
     typeof result.body!=='string'||Buffer.byteLength(JSON.stringify(result.body))>MAX_RESPONSE)
    return networkFailure(endpoint.id,'invalid-response');
  if(!result.ok)return networkFailure(endpoint.id,RESULT_ERRORS.has(result.error)?result.error:'connection-error',result.status);
  if(result.status<200||result.status>=300||result.error!==null)return networkFailure(endpoint.id,'invalid-response');
  if(bearer!==null&&result.body.includes(bearer))return networkFailure(endpoint.id,'credential-in-response',result.status);
  return {endpoint:endpoint.id,ok:true,status:result.status,body:result.body,error:null};
}
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
      const headers={accept:'application/json, text/plain','accept-encoding':'identity',...approvedHeaders(endpoint,endpoint.requestHeaders)};
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
module.exports={socketReceiveLimit,validateNetworkEndpoints,validateNetworkRequest,resolveNetworkEndpoint,validateSocketOperation,createSocket,requestEndpoint,networkFailure,normalizeNetworkResult,credentialBinding,validBearer};
