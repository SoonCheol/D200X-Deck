'use strict';
// Sign in with ChatGPT (OSS local client). No Codex or API-key fallback.
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const ISSUER='https://auth.openai.com',RESOURCE='https://api.openai.com/v1';
const PLAN='chatgpt.tokens.use.direct';
const SCOPES='openid profile email offline_access resource.invoke '+PLAN;
const random=()=>crypto.randomBytes(32).toString('base64url');
const clientOK=x=>typeof x==='string'&&/^[A-Za-z0-9._-]{1,256}$/.test(x)&&x!=='dynamic_agent_client';
const hasPlan=x=>typeof x==='string'&&x.split(/\s+/).includes(PLAN);
function pkce(){const verifier=random();return {verifier,challenge:crypto.createHash('sha256').update(verifier).digest('base64url')};}
function fault(message,code){return Object.assign(Error(message),{code});}
async function jsonRequest(fetcher,url,options={},signal){
  const response=await fetcher(url,{...options,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
  let data;try{data=await response.json();}catch{throw fault('ChatGPT 서버 응답 형식 오류','bad-response');}
  if(!response.ok)throw fault('ChatGPT 인증 요청 실패 (HTTP '+response.status+')',typeof data.error==='string'?data.error:'http-error');
  return data;
}
async function verifyId(jwt,clientId,nonce,fetcher=fetch,signal){
  if(typeof jwt!=='string'||jwt.length>32000)throw Error('ID 토큰 없음');
  const parts=jwt.split('.');if(parts.length!==3)throw Error('ID 토큰 형식 오류');
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('ID 토큰 서명 형식 오류');
  const jwks=await jsonRequest(fetcher,ISSUER+'/.well-known/jwks.json',{},signal);
  const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(!jwk||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('ID 토큰 서명 검증 실패');
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==ISSUER||!audience.includes(clientId)||(audience.length>1&&claims.azp!==clientId)||(claims.azp!==undefined&&claims.azp!==clientId)||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||claims.nonce!==nonce||typeof claims.sub!=='string'||!claims.sub)throw Error('ID 토큰 신원 검증 실패');
  return {sub:claims.sub,email:typeof claims.email==='string'?claims.email.slice(0,254):''};
}
function authorizationUrl({clientId,hostId,redirectUri,state,nonce,challenge,idToken,email}){
  const u=new URL(ISSUER+'/api/accounts/authorize');
  u.search=new URLSearchParams({client_id:clientId||'dynamic_agent_client',ext_agent_host_id:hostId,redirect_uri:redirectUri,response_type:'code',scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  if(!clientId)u.searchParams.set('agent_name_hint','DeckForge');
  else {if(idToken)u.searchParams.set('id_token_hint',idToken);if(email)u.searchParams.set('login_hint',email);}
  return u.href;
}
async function callbackListener({state,clientId,signal,open}){
  let resolveResult,rejectResult,settled=false,accepted=false,timer;
  const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
  // Attach immediately: browser-launch failure or cancellation can settle before await.
  result.catch(()=>{});
  const settle=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);server.close();server.closeAllConnections?.();if(err)rejectResult(err);else resolveResult(value);};
  const abort=()=>settle(fault('로그인이 취소되었습니다.','cancelled'));
  const server=http.createServer((req,res)=>{
    let u;try{u=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400).end();return;}
    if(req.method!=='GET'||u.pathname!=='/auth/callback'){res.writeHead(404).end();return;}
    if(u.searchParams.getAll('state').length!==1||u.searchParams.get('state')!==state){res.writeHead(400).end('Invalid state');return;}
    if(accepted||settled){res.writeHead(409).end();return;}
    accepted=true;
    const issued=u.searchParams.get('client_id')||clientId;
    const code=u.searchParams.get('code');
    const error=u.searchParams.has('error')||!code||!clientOK(issued)||(clientId&&issued!==clientId);
    res.writeHead(error?400:200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Connection':'close','X-Content-Type-Options':'nosniff'});
    res.end(error?'DeckForge 로그인 실패 또는 취소. 앱으로 돌아가세요.':'DeckForge 인증 응답을 받았습니다. 앱에서 연결 결과를 확인하세요.',()=>settle(error?fault('로그인 승인 실패','denied'):null,{code,clientId:issued,redirectUri}));
  });
  let redirectUri;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    redirectUri='http://127.0.0.1:'+server.address().port+'/auth/callback';
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    timer=setTimeout(()=>settle(fault('로그인 시간이 초과되었습니다.','timeout')),600000);
    if(!settled)await open(redirectUri);
    return await result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);server.close();server.closeAllConnections?.();}
}
class ChatAuth{
  constructor({directory,safeStorage,openExternal,fetcher=fetch}){
    this.file=path.join(directory,'connection.enc');this.safe=safeStorage;this.openExternal=openExternal;this.fetcher=fetcher;this.record=null;this.refreshing=null;this.loading=null;
  }
  async load(){
    if(this.record)return this.record;
    if(!this.loading)this.loading=(async()=>{
      if(!this.safe.isEncryptionAvailable())throw Error('Windows 보안 저장 기능을 사용할 수 없습니다.');
      try{
        const bytes=await fs.readFile(this.file);
        const r=JSON.parse(this.safe.decryptString(bytes));if(!r||typeof r.hostId!=='string')throw Error('인증 저장 형식 오류');
        return this.record=r;
      }catch(e){if(e.code!=='ENOENT')throw Error('ChatGPT 인증 정보 읽기 실패. 기존 파일은 보존됩니다.');}
      const fresh={hostId:'urn:uuid:'+crypto.randomUUID()};await this.save(fresh);return fresh;
    })().finally(()=>{this.loading=null;});
    return this.loading;
  }
  async save(record){
    if(!this.safe.isEncryptionAvailable())throw Error('보안 저장 기능을 사용할 수 없습니다.');
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try{await fs.writeFile(tmp,this.safe.encryptString(JSON.stringify(record)),{flag:'wx',mode:0o600});await fs.rename(tmp,this.file);this.record=record;}
    finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  }
  async status(){const r=await this.load();return {connected:!!(r.accessToken&&r.refreshToken&&hasPlan(r.scope)),account:r.email||'',registered:clientOK(r.clientId)};}
  async token(form,signal){return jsonRequest(this.fetcher,ISSUER+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...form,resource:RESOURCE})},signal);}
  tokenRecord(r,t,identity,initial){
    const scope=typeof t.scope==='string'?t.scope:(initial?'':r.scope);
    if(!hasPlan(scope)||!scope.split(/\s+/).includes('resource.invoke'))throw fault('ChatGPT 구독 사용 권한이 승인되지 않았습니다.','no-plan');
    if(typeof t.access_token!=='string'||!t.access_token||typeof (t.refresh_token||(!initial&&r.refreshToken))!=='string'||!Number.isFinite(t.expires_in)||t.expires_in<=0||String(t.token_type).toLowerCase()!=='bearer')throw Error('인증 토큰 응답 형식 오류');
    return {...r,...identity,accessToken:t.access_token,refreshToken:t.refresh_token||r.refreshToken,idToken:initial?t.id_token:r.idToken,scope,expiresAt:Date.now()+t.expires_in*1000};
  }
  async signIn(signal){
    const r=await this.load(),{verifier,challenge}=pkce(),state=random(),nonce=random();
    const cb=await callbackListener({state,clientId:r.clientId,signal,open:redirectUri=>this.openExternal(authorizationUrl({clientId:r.clientId,hostId:r.hostId,redirectUri,state,nonce,challenge,idToken:r.idToken,email:r.email}))});
    signal?.throwIfAborted();
    // Retain the issued registration ID even if the one-time code expires.
    const base={...r,clientId:cb.clientId};
    if(!r.clientId)await this.save(base);
    const t=await this.token({grant_type:'authorization_code',client_id:cb.clientId,code:cb.code,code_verifier:verifier,redirect_uri:cb.redirectUri},signal);
    const identity=await verifyId(t.id_token,cb.clientId,nonce,this.fetcher,signal);
    if(r.sub&&r.sub!==identity.sub)throw Error('등록된 계정과 다른 계정입니다.');
    signal?.throwIfAborted();
    await this.save(this.tokenRecord(base,t,identity,true));return {...await this.status(),firstConnection:!r.sub};
  }
  async clearSession(){const r=await this.load();const {accessToken,refreshToken,idToken,scope,expiresAt,...registration}=r;await this.save(registration);}
  async access(signal){
    const r=await this.load();
    if(!r.accessToken||!r.refreshToken||!hasPlan(r.scope))throw fault('ChatGPT로 로그인하세요.','signed-out');
    if(r.expiresAt>Date.now()+60000)return r.accessToken;
    if(!this.refreshing)this.refreshing=(async()=>{
      try{
        // Do not abort a rotating refresh because a single chat was cancelled.
        const t=await this.token({grant_type:'refresh_token',client_id:r.clientId,refresh_token:r.refreshToken});
        const next=this.tokenRecord(r,t,{},false);await this.save(next);return next.accessToken;
      }catch(e){if(['invalid_grant','invalid_client','no-plan'].includes(e.code))await this.clearSession();throw e;}
    })().finally(()=>{this.refreshing=null;});
    const token=await this.refreshing;signal?.throwIfAborted();return token;
  }
  async signOut(){
    if(this.refreshing)await this.refreshing.catch(()=>{});
    const r=await this.load();let revoked=!r.refreshToken;
    if(r.refreshToken){
      try{
        const config=await jsonRequest(this.fetcher,ISSUER+'/.well-known/openid-configuration');
        const url=new URL(config.revocation_endpoint);
        if(url.origin!==ISSUER||url.username||url.password)throw Error('폐기 주소 오류');
        for(let i=0;i<2&&!revoked;i++){
          try{const response=await this.fetcher(url.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:r.refreshToken,token_type_hint:'refresh_token',client_id:r.clientId}),signal:AbortSignal.timeout(10000)});revoked=response.status===200;if(!revoked&&response.status<500)break;}catch{}
          if(!revoked&&i===0)await new Promise(r=>setTimeout(r,500));
        }
      }catch{}
    }
    await this.clearSession();return {revoked,...await this.status()};
  }
}
module.exports={ChatAuth,pkce,authorizationUrl,verifyId,hasPlan,callbackListener};
