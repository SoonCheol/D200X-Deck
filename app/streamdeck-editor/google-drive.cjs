'use strict';
// Google Desktop OAuth PKCE with loopback; Drive API scoped to files created by this app.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const AUTH='https://accounts.google.com/o/oauth2/v2/auth',TOKEN='https://oauth2.googleapis.com/token';
const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const SCOPE='https://www.googleapis.com/auth/drive.file',FOLDER='application/vnd.google-apps.folder',MIME='application/octet-stream',JSON_MIME='application/json';
const MAX_BYTES=256*1024*1024+128;
const fields='id,name,createdTime,size,mimeType,trashed,appProperties,md5Checksum';
const random=()=>crypto.randomBytes(32).toString('base64url');
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(x);
const filenameOK=x=>typeof x==='string'&&/^DeckForge-[A-Za-z0-9-]{1,180}\.(?:dfbackup|json)$/.test(x);
const mimeForName=name=>name.endsWith('.json')?JSON_MIME:MIME;
const backupMimeOK=(name,mime)=>mime===MIME||(name.endsWith('.json')&&mime===JSON_MIME);
function clientConfig(json){
  const c=json?.installed;
  if(!c||typeof c.client_id!=='string'||!/^[A-Za-z0-9._-]{1,250}\.apps\.googleusercontent\.com$/.test(c.client_id)||
    typeof c.client_secret!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(c.client_secret))
    throw Error('Google Cloud의 Desktop app OAuth 클라이언트 JSON을 선택하세요.');
  return {clientId:c.client_id,clientSecret:c.client_secret};
}
function endpoint(base,params){const url=new URL(base);url.search=new URLSearchParams(params).toString();return url.href;}
function authorizationUrl(client,redirectUri,state,challenge){
  return endpoint(AUTH,{client_id:client.clientId,redirect_uri:redirectUri,response_type:'code',
    scope:SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'});
}
async function receiveCode({client,state,challenge,openExternal}){
  let done=false,timer,resolve,reject,redirectUri;
  const result=new Promise((a,b)=>{resolve=a;reject=b;});result.catch(()=>{});
  const finish=(error,code)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(code);};
  const server=http.createServer((req,res)=>{
    let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400).end();return;}
    if(req.method!=='GET'||url.pathname!=='/google/callback'||req.headers.host!=='127.0.0.1:'+server.address().port){res.writeHead(404).end();return;}
    if(done||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid OAuth state');return;}
    const code=url.searchParams.get('code');
    const denied=url.searchParams.has('error')||url.searchParams.getAll('code').length!==1||!code||code.length>4096;
    res.writeHead(denied?400:200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Connection':'close','X-Content-Type-Options':'nosniff'});
    res.end(denied?'Google 연결이 취소되었습니다. DeckForge로 돌아가세요.':'Google 인증 응답을 받았습니다. DeckForge에서 결과를 확인하세요.');
    finish(denied?Error('Google 연결이 취소되었습니다.'):null,code);
  });
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    redirectUri='http://127.0.0.1:'+server.address().port+'/google/callback';
    timer=setTimeout(()=>finish(Error('Google 로그인 시간이 초과되었습니다.')),300000);
    await openExternal(authorizationUrl(client,redirectUri,state,challenge));
    return {code:await result,redirectUri};
  }finally{clearTimeout(timer);server.close();server.closeAllConnections?.();}
}
function readToken(data,refresh){
  if(!data||typeof data.access_token!=='string'||!data.access_token||data.access_token.length>8192||
    !Number.isFinite(data.expires_in)||data.expires_in<=0||
    (data.token_type!==undefined&&String(data.token_type).toLowerCase()!=='bearer')||
    (data.scope!==undefined&&(!String(data.scope).split(/\s+/).includes(SCOPE)||String(data.scope).split(/\s+/).some(s=>s!==SCOPE))))
    throw Error('Google Drive 토큰 또는 권한 응답이 올바르지 않습니다.');
  const refreshToken=data.refresh_token||refresh;
  if(typeof refreshToken!=='string'||!refreshToken||refreshToken.length>8192)throw Error('Google 오프라인 연결 권한이 없습니다. 다시 연결하세요.');
  return {access:data.access_token,expires:Date.now()+data.expires_in*1000,refreshToken};
}
function backupMeta(x){
  if(!x||!idOK(x.id)||!filenameOK(x.name)||x.trashed===true||!backupMimeOK(x.name,x.mimeType)||x.appProperties?.deckforge!=='backup-v1'||
    !Number.isSafeInteger(Number(x.size))||Number(x.size)<=0||Number(x.size)>MAX_BYTES||
    typeof x.createdTime!=='string'||!Number.isFinite(Date.parse(x.createdTime)))return null;
  return {id:x.id,name:x.name,size:Number(x.size),createdTime:x.createdTime,
    ...(typeof x.md5Checksum==='string'&&/^[a-f0-9]{32}$/.test(x.md5Checksum)?{md5Checksum:x.md5Checksum}:{})};
}
function uploadSession(value){
  let url;try{url=new URL(value);}catch{throw Error('Google 업로드 주소가 올바르지 않습니다.');}
  if(url.origin!=='https://www.googleapis.com'||url.pathname!=='/upload/drive/v3/files'||url.username||url.password||url.hash||!url.searchParams.get('upload_id'))
    throw Error('Google 업로드 주소가 올바르지 않습니다.');
  return url.href;
}
async function boundedBody(response,max){
  const len=response.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>max)){await response.body?.cancel();throw Error('Google 응답 용량 제한 초과');}
  if(!response.body)throw Error('Google 응답이 비어 있습니다.');
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
    if(total>max){await reader.cancel();throw Error('Google 응답 용량 제한 초과');}chunks.push(Buffer.from(value));}
    return Buffer.concat(chunks,total);}
  finally{reader.releaseLock();}
}
class GoogleDrive{
  constructor({directory,safeStorage,openExternal,fetcher=fetch,codeReceiver=receiveCode}){
    this.file=path.join(directory,'connection.enc');this.safe=safeStorage;this.openExternal=openExternal;
    this.fetcher=fetcher;this.codeReceiver=codeReceiver;this.record=null;this.access=null;
  }
  requireSafe(){
    if(!this.safe.isEncryptionAvailable()||this.safe.getSelectedStorageBackend?.()==='basic_text')
      throw Error('보안 저장 기능을 사용할 수 없습니다.');
  }
  load(){
    if(this.record)return this.record;
    try{
      const st=fs.statSync(this.file);if(!st.isFile()||st.size>65536)throw Error('Google 연결 파일 오류');
      this.requireSafe();const r=JSON.parse(this.safe.decryptString(fs.readFileSync(this.file)));
      const client=clientConfig({installed:{client_id:r.clientId,client_secret:r.clientSecret}});
      if(typeof r.refreshToken!=='string'||!r.refreshToken||r.refreshToken.length>8192)throw Error('Google 연결 파일 오류');
      this.record={...client,refreshToken:r.refreshToken};return this.record;
    }catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  save(record){
    this.requireSafe();fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(temp,this.safe.encryptString(JSON.stringify(record)),{flag:'wx',mode:0o600});fs.renameSync(temp,this.file);}
    finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
    this.record=record;
  }
  disconnect(){fs.rmSync(this.file,{force:true});this.record=null;this.access=null;return {connected:false};}
  async request(url,options={},timeout=30000){
    let response;
    try{response=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)});}
    catch{throw Error('Google 서버 연결 실패 또는 시간 초과. 네트워크를 확인하세요.');}
    if(!response.ok){
      if(response.status===401)this.access=null;
      await response.body?.cancel().catch(()=>{});
      throw Error('Google 요청 실패 (HTTP '+response.status+').'+(response.status===401?' 다시 연결하거나 재시도하세요.':response.status===403?' Drive API 활성화와 계정 권한을 확인하세요.':''));
    }
    return response;
  }
  async json(url,options={}){
    const response=await this.request(url,options);
    try{return JSON.parse((await boundedBody(response,2*1024*1024)).toString('utf8'));}
    catch{throw Error('Google 응답 형식 또는 크기가 올바르지 않습니다.');}
  }
  token(params){return this.json(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});}
  async about(access){
    const data=await this.json(endpoint(API+'/about',{fields:'user(displayName,emailAddress)'}),{headers:{Authorization:'Bearer '+access}});
    if(!data?.user||typeof data.user.emailAddress!=='string'||!data.user.emailAddress)throw Error('Google 계정을 확인하지 못했습니다.');
    return {connected:true,email:data.user.emailAddress.slice(0,254),name:String(data.user.displayName||'').slice(0,160)};
  }
  async connect(json){
    this.requireSafe();const client=clientConfig(json),state=random(),verifier=random();
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const {code,redirectUri}=await this.codeReceiver({client,state,challenge,openExternal:this.openExternal});
    const token=readToken(await this.token({client_id:client.clientId,client_secret:client.clientSecret,
      code,code_verifier:verifier,redirect_uri:redirectUri,grant_type:'authorization_code'}));
    const account=await this.about(token.access);
    this.save({...client,refreshToken:token.refreshToken});this.access={value:token.access,expires:token.expires};return account;
  }
  async accessToken(){
    const record=this.load();if(!record)throw Error('Google Drive를 먼저 연결하세요.');
    if(this.access&&this.access.expires>Date.now()+60000)return this.access.value;
    const token=readToken(await this.token({client_id:record.clientId,client_secret:record.clientSecret,
      refresh_token:record.refreshToken,grant_type:'refresh_token'}),record.refreshToken);
    if(token.refreshToken!==record.refreshToken)this.save({...record,refreshToken:token.refreshToken});
    this.access={value:token.access,expires:token.expires};return token.access;
  }
  async status(){if(!this.load())return {connected:false};return this.about(await this.accessToken());}
  async headers(extra={}){return {Authorization:'Bearer '+await this.accessToken(),...extra};}
  async listFiles(query,limit=200){
    const files=[];let pageToken='',pages=0;
    do{
      const data=await this.json(endpoint(API+'/files',{q:query,spaces:'drive',fields:'nextPageToken,files('+fields+')',pageSize:'100',orderBy:'createdTime desc',...(pageToken?{pageToken}:{})}),{headers:await this.headers()});
      if(!Array.isArray(data.files))throw Error('Google 파일 목록 형식 오류');
      files.push(...data.files);pageToken=typeof data.nextPageToken==='string'?data.nextPageToken:'';
      if(++pages>=10||files.length>=limit)break;
    }while(pageToken);
    return {files:files.slice(0,limit),more:!!pageToken||files.length>limit};
  }
  async folder(){
    const {files}=await this.listFiles("trashed = false and mimeType = '"+FOLDER+"' and appProperties has { key='deckforge' and value='folder-v1' }");
    const existing=files.find(x=>idOK(x.id)&&x.mimeType===FOLDER&&x.appProperties?.deckforge==='folder-v1'&&x.trashed!==true);
    if(existing)return existing.id;
    const created=await this.json(endpoint(API+'/files',{fields:'id'}),{method:'POST',headers:await this.headers({'Content-Type':'application/json'}),
      body:JSON.stringify({name:'DeckForge Backups',mimeType:FOLDER,appProperties:{deckforge:'folder-v1'}})});
    if(!idOK(created.id))throw Error('Google Drive 폴더 생성 결과를 확인하지 못했습니다.');
    return created.id;
  }
  async list(){
    const {files,more}=await this.listFiles("trashed = false and appProperties has { key='deckforge' and value='backup-v1' }");
    return {items:files.map(backupMeta).filter(Boolean),more};
  }
  async upload(name,bytes){
    if(!filenameOK(name)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES)throw Error('백업 파일 이름 또는 용량 오류');
    const mime=mimeForName(name),parent=await this.folder();
    const start=await this.request(endpoint(UPLOAD,{uploadType:'resumable',fields}),{method:'POST',headers:await this.headers({'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(bytes.length)}),
      body:JSON.stringify({name,mimeType:mime,parents:[parent],appProperties:{deckforge:'backup-v1'}})});
    const location=uploadSession(start.headers.get('location'));await start.body?.cancel();
    const result=await this.request(location,{method:'PUT',headers:await this.headers({'Content-Type':mime,'Content-Length':String(bytes.length)}),body:bytes},300000);
    let uploaded;
    try{uploaded=JSON.parse((await boundedBody(result,2*1024*1024)).toString('utf8'));}
    catch{throw Error('Google 업로드 결과 응답을 읽을 수 없습니다. 백업 목록에서 확인하세요.');}
    if(!idOK(uploaded?.id))throw Error('Google 업로드 파일 ID를 확인하지 못했습니다. 백업 목록에서 확인하세요.');
    // Drive may omit fields from the resumable final response. Read the
    // authoritative file metadata before treating the upload as verified.
    const details=await this.json(endpoint(API+'/files/'+encodeURIComponent(uploaded.id),{fields}),{headers:await this.headers()});
    const meta=backupMeta(details),digest=crypto.createHash('md5').update(bytes).digest('hex');
    if(!meta||meta.id!==uploaded.id||meta.name!==name||meta.size!==bytes.length||meta.md5Checksum!==digest)
      throw Error('Google 업로드 결과 검증 실패. 백업 목록에서 확인하세요.');
    return meta;
  }
  async download(id){
    if(!idOK(id))throw Error('백업 파일 ID 오류');
    const url=API+'/files/'+encodeURIComponent(id);
    const meta=backupMeta(await this.json(endpoint(url,{fields}),{headers:await this.headers()}));
    if(!meta||meta.id!==id||!meta.md5Checksum)throw Error('DeckForge에서 생성한 유효한 백업 파일이 아닙니다.');
    const response=await this.request(endpoint(url,{alt:'media'}),{headers:await this.headers()},300000);
    const bytes=await boundedBody(response,Math.min(MAX_BYTES,meta.size));
    if(bytes.length!==meta.size||crypto.createHash('md5').update(bytes).digest('hex')!==meta.md5Checksum)throw Error('Google 백업 다운로드 검증 실패');
    return {meta,bytes};
  }
}
module.exports={GoogleDrive,clientConfig,authorizationUrl,uploadSession,backupMeta,SCOPE,MAX_BYTES};
