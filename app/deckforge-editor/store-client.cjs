'use strict';
// Store connection state is private to the editor main process; no SDK bridge.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');
const {randomUUID,createHash}=require('node:crypto');
const semver=require('semver');

function normalizeStoreOrigin(value){
  if(typeof value!=='string'||value.length>1024)throw Error('HTTPS 스토어 주소를 확인하세요.');
  const text=value.trim();
  if(!text)return '';
  if(!/^https:\/\//i.test(text)||/[\s\\?#]/.test(text))throw Error('HTTPS 서버 주소만 입력하세요.');
  let url;
  try{url=new URL(text);}catch{throw Error('HTTPS 서버 주소를 확인하세요.');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.hostname)
    throw Error('경로·계정 정보 없이 HTTPS 서버 주소만 입력하세요.');
  return url.origin;
}
function storeRequest(origin,route,{method='GET',body,token,binarySize=0,jsonLimit=65536}={}){
  // Only fixed API paths from this module. No redirects or TLS bypass.
  const target=new URL(route,origin);
  const payload=body===undefined?null:Buffer.from(JSON.stringify(body),'utf8');
  return new Promise((resolve,reject)=>{
    let timer,req,finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const headers={accept:binarySize?'application/octet-stream':'application/json','cache-control':'no-store'};
    if(payload){headers['content-type']='application/json';headers['content-length']=payload.length;}
    if(token)headers.authorization='Bearer '+token;
    try{
      req=https.request(target,{method,headers,agent:false,rejectUnauthorized:true},res=>{
        const status=res.statusCode||0;
        if(status>=300&&status<400){res.destroy();finish(Error('스토어 리디렉션은 허용되지 않습니다.'));return;}
        if(status===401||status===403){res.destroy();finish(Error('로그인 정보 또는 접근 권한을 확인하세요.'));return;}
        if(status<200||status>=300){res.destroy();finish(Error('스토어 요청 실패 (HTTP '+status+')'));return;}
        if(status===204&&!binarySize){res.resume();finish(null,null);return;}
        if(!(binarySize?/^application\/(?:octet-stream|zip)(?:\s*;|$)/i:/^application\/json(?:\s*;|$)/i).test(String(res.headers['content-type']||''))){res.destroy();finish(Error('스토어 API 응답 형식이 올바르지 않습니다.'));return;}
        const chunks=[];let size=0;
        res.on('data',chunk=>{size+=chunk.length;if(size>(binarySize||jsonLimit)){res.destroy();finish(Error('스토어 응답 크기 제한 초과'));}else chunks.push(chunk);});
        res.on('aborted',()=>finish(Error('스토어 응답이 중단되었습니다.')));
        res.on('error',()=>finish(Error('스토어 응답을 읽을 수 없습니다.')));
        res.on('end',()=>{try{const bytes=Buffer.concat(chunks);finish(null,binarySize?bytes:JSON.parse(bytes.toString('utf8')));}catch{finish(Error('스토어 JSON 응답이 올바르지 않습니다.'));}});
      });
      req.on('error',()=>finish(Error('스토어에 연결할 수 없습니다. HTTPS 인증서와 서버 주소를 확인하세요.')));
      timer=setTimeout(()=>{finish(Error('스토어 연결 시간 초과'));req.destroy();},binarySize?60000:8000);
      req.end(payload||undefined);
    }catch{finish(Error('스토어 요청을 시작할 수 없습니다.'));}
  });
}
const STORE_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const STORE_BUILTINS=new Set(['com.deckforge.native.home-assistant','de.perdoctus.streamdeck.homeassistant','com.autodesk.fusionstreamdeck','com.deckforge.native.github-status']);
function storeId(value){if(typeof value!=='string'||!STORE_ID.test(value))throw Error('스토어 항목 식별자 오류');return value;}
// Preview data is bounded PNG only, never SVG, HTML or an arbitrary URL.
function storePreviewPng(value,maxBytes=65536){
  if(typeof value!=='string'||value.length>Math.ceil(maxBytes/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
  const bytes=Buffer.from(value,'base64');
  if(bytes.length<33||bytes.length>maxBytes||bytes.toString('base64')!==value||
     bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(8)!==13||
     bytes.toString('ascii',12,16)!=='IHDR')return null;
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width>512||height>512)return null;
  return 'data:image/png;base64,'+value;
}
function storeInstalledState(item,installed,origin){
  const rows=Array.isArray(installed)?installed:[];
  if(item.kind==='iconpack'){
    // Original archive ID is a SHA256 prefix; no name-only matches.
    const exact=rows.find(p=>p.id===item.sha256.slice(0,20));
    if(exact)return {state:'installed',version:String(exact.version||'')};
    const linked=rows.filter(p=>p.storeSource?.origin===origin&&p.storeSource?.itemId===item.id);
    if(!linked.length)return {state:'not-found',version:''};
    const target=semver.valid(item.version),versions=linked.map(p=>semver.valid(p.version)).filter(Boolean);
    if(!target||versions.length!==linked.length)return {state:'different',version:String(linked.at(-1).version||'')};
    const latest=versions.sort(semver.rcompare)[0];
    return {state:semver.gt(target,latest)?'update':semver.lt(target,latest)?'newer':'different',version:latest};
  }
  const plugin=rows.find(p=>typeof p.uuid==='string'&&p.uuid.toLowerCase()===item.packageId.toLowerCase());
  if(!plugin)return {state:'not-found',version:''};
  const local=String(plugin.version||''),a=semver.valid(local),b=semver.valid(item.version);
  if(!a||!b)return {state:'different',version:local};
  return {state:semver.lt(a,b)?'update':semver.gt(a,b)?'newer':'same-version',version:local};
}
function storeCatalogItem(raw,kind,role){
  if(!raw||raw.kind!==kind||!['iconpack','plugin'].includes(kind))throw Error('스토어 항목 종류 오류');
  const str=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error('스토어 항목 정보 오류');return v;};
  const id=storeId(raw.id),releaseId=storeId(raw.releaseId);
  if(!['deckforge','third-party'].includes(raw.source)||!['public','private'].includes(raw.visibility))throw Error('스토어 공개 정책 오류');
  if((raw.visibility==='private'||raw.source==='third-party')&&role!=='owner')return null;
  if(raw.source==='third-party'&&raw.visibility!=='private')return null;
  const packageId=kind==='plugin'?str(raw.packageId,160):'';
  if(kind==='plugin'&&STORE_BUILTINS.has(packageId.toLowerCase()))return null;
  const format=raw.format;
  if(kind==='plugin'?!['deckforgePlugin','streamDeckPlugin','zip'].includes(format):!['streamDeckIconPack','sdIconPack','zip'].includes(format))throw Error('스토어 파일 형식 오류');
  const max=(kind==='plugin'?40:60)*1024*1024;
  if(!Number.isSafeInteger(raw.size)||raw.size<1||raw.size>max||typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sha256))throw Error('스토어 파일 검증 정보 오류');
  const tags=Array.isArray(raw.tags)?raw.tags.slice(0,20).filter(v=>typeof v==='string'&&v.length<=80):[];
  return {id,releaseId,kind,packageId,format,size:raw.size,sha256:raw.sha256,name:str(raw.name,120),version:str(raw.version,40),
    author:typeof raw.author==='string'?raw.author.slice(0,120):'',description:typeof raw.description==='string'?raw.description.slice(0,1500):'',source:raw.source,visibility:raw.visibility,tags,cover:storePreviewPng(raw.cover,12288)};
}
function verifyStoreBytes(item,bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length!==item.size||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('다운로드 크기 또는 SHA256이 일치하지 않습니다.');
  return bytes;
}
class StoreClient{
  constructor(directory,{request=storeRequest,now=Date.now}={}){
    this.file=path.join(directory,'store-connection.json');this.request=request;this.now=now;
    this.origin='';this.checked=false;this.session=null;this.busy=false;this.settingsError=false;
    try{
      const bytes=fs.readFileSync(this.file);
      if(bytes.length>4096)throw Error('settings size');
      const saved=JSON.parse(bytes.toString('utf8'));if(saved?.version!==1)throw Error('settings version');
      this.origin=normalizeStoreOrigin(saved.origin);
    }catch(error){if(error.code!=='ENOENT')this.settingsError=true;}
  }
  status(){
    if(this.session&&this.session.expiresAt<=this.now())this.session=null;
    return {origin:this.origin,checked:this.checked,account:this.session?{...this.session.account}:null,settingsError:this.settingsError};
  }
  async exclusive(fn){
    if(this.busy)throw Error('스토어 작업이 진행 중입니다.');
    this.busy=true;try{return await fn();}finally{this.busy=false;}
  }
  save(value){
    return this.exclusive(()=>{
      const next=normalizeStoreOrigin(value);
      this.status();
      if(this.session&&next!==this.origin)throw Error('서버 주소를 바꾸려면 먼저 로그아웃하세요.');
      if(next===this.origin&&!this.settingsError)return this.status();
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      const tmp=this.file+'.'+randomUUID()+'.tmp';
      try{
        fs.writeFileSync(tmp,JSON.stringify({version:1,origin:next}),{encoding:'utf8',mode:0o600,flag:'wx'});
        fs.renameSync(tmp,this.file);
      }finally{fs.rmSync(tmp,{force:true});}
      this.origin=next;this.checked=false;this.session=null;this.settingsError=false;return this.status();
    });
  }
  check(){
    return this.exclusive(async()=>{
      if(!this.origin)throw Error('스토어 서버 주소를 먼저 저장하세요.');
      this.checked=false;
      const result=await this.request(this.origin,'/api/v1/health');
      if(result?.service!=='deckforge-store'||result.apiVersion!==1||result.ok!==true)throw Error('호환되는 DeckForge Store 서버가 아닙니다.');
      this.checked=true;return this.status();
    });
  }
  login(username,password){
    return this.exclusive(async()=>{
      if(!this.origin||!this.checked)throw Error('저장된 서버의 연결 확인을 먼저 실행하세요.');
      if(this.status().account)throw Error('먼저 로그아웃하세요.');
      if(typeof username!=='string'||!username.trim()||username.length>128||typeof password!=='string'||!password||password.length>1024)
        throw Error('계정과 비밀번호를 확인하세요.');
      const result=await this.request(this.origin,'/api/v1/auth/login',{method:'POST',body:{username:username.trim(),password,client:'desktop'}});
      const account=result?.account,token=result?.accessToken,seconds=result?.expiresIn;
      if(typeof token!=='string'||!/^[-A-Za-z0-9._~+\/=]{16,4096}$/.test(token)||!Number.isInteger(seconds)||seconds<1||seconds>86400||
        typeof account?.id!=='string'||!account.id||account.id.length>128||typeof account.username!=='string'||!account.username||account.username.length>128||
        !['owner','user'].includes(account.role))throw Error('스토어 로그인 응답이 올바르지 않습니다.');
      this.session={token,account:{id:account.id,username:account.username,role:account.role},expiresAt:this.now()+seconds*1000};
      return this.status();
    });
  }
  requireSession(){
    this.status();
    if(!this.origin||!this.checked||!this.session)throw Error('스토어 연결 확인 및 로그인이 필요합니다.');
    return this.session;
  }
  catalog(kind,cursor=''){
    return this.exclusive(async()=>{
      const session=this.requireSession();
      if(!['iconpack','plugin'].includes(kind))throw Error('스토어 종류 오류');
      if(cursor)storeId(cursor);
      const result=await this.request(this.origin,'/api/v1/catalog?kind='+kind+'&limit=20'+(cursor?'&cursor='+cursor:''),{token:session.token,jsonLimit:524288});
      this.requireSession();
      if(!Array.isArray(result?.items)||result.items.length>20)throw Error('스토어 목록 응답 오류');
      const items=result.items.map(raw=>storeCatalogItem(raw,kind,session.account.role)).filter(Boolean);
      if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('스토어 항목 중복');
      return {items,nextCursor:result.nextCursor?storeId(result.nextCursor):''};
    });
  }
  preview(kind,id,releaseId,expectedHash){
    return this.exclusive(async()=>{
      const session=this.requireSession();storeId(id);storeId(releaseId);
      const raw=await this.request(this.origin,'/api/v1/items/'+id,{token:session.token,jsonLimit:1048576});
      this.requireSession();
      const item=storeCatalogItem(raw?.item,kind,session.account.role);
      if(!item||item.id!==id||item.releaseId!==releaseId||item.sha256!==expectedHash)throw Error('스토어 항목이 변경되었거나 접근할 수 없습니다.');
      const previews=Array.isArray(raw.previews)?raw.previews.slice(0,12).map(value=>storePreviewPng(value)).filter(Boolean):[];
      return {cover:item.cover,previews};
    });
  }
  download(kind,id,releaseId,expectedHash,consume){
    return this.exclusive(async()=>{
      const session=this.requireSession();storeId(id);storeId(releaseId);
      const raw=await this.request(this.origin,'/api/v1/items/'+id,{token:session.token,jsonLimit:1048576});
      const item=storeCatalogItem(raw?.item,kind,session.account.role);
      if(!item||item.id!==id||item.releaseId!==releaseId||item.sha256!==expectedHash)throw Error('스토어 항목이 변경되었거나 접근할 수 없습니다. 목록을 새로 고침하세요.');
      this.requireSession();
      const bytes=await this.request(this.origin,'/api/v1/items/'+id+'/releases/'+releaseId+'/download',{token:session.token,binarySize:item.size});
      verifyStoreBytes(item,bytes);this.requireSession();
      return consume(item,bytes);
    });
  }
  logout(){
    return this.exclusive(async()=>{
      this.status();const current=this.session;this.session=null;
      if(!current)return {...this.status(),revoked:true};
      let revoked=false;
      try{await this.request(this.origin,'/api/v1/auth/logout',{method:'POST',token:current.token});revoked=true;}catch{}
      return {...this.status(),revoked};
    });
  }
}
module.exports={normalizeStoreOrigin,StoreClient,storeCatalogItem,verifyStoreBytes,storePreviewPng,storeInstalledState};
