'use strict';
// Prefer published standalone EXE assets; retain legacy successful Actions builds as fallback.
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const REPO='SoonCheol/D200X-Deck';
const BRANCH='codex/streamdeck-761-clean-editor';
const API='https://api.github.com/repos/'+REPO;
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function versionParts(version){
  if(typeof version!=='string'||!VERSION.test(version))return null;
  const parts=version.split('.').map(Number);
  return parts.every(Number.isSafeInteger)?parts:null;
}
function compareVersions(a,b){
  const x=versionParts(a),y=versionParts(b);
  if(!x||!y)return null;
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
function githubJson(url){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='api.github.com'||
      !(u.pathname.startsWith('/repos/'+REPO+'/actions/')||u.pathname==='/repos/'+REPO+'/releases'))
    return Promise.reject(Error('업데이트 조회 주소가 올바르지 않습니다.'));
  return new Promise((resolve,reject)=>{
    const request=https.get(u,{headers:{
      'User-Agent':'DeckForge-update-check',
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'
    }},response=>{
      if(response.statusCode!==200){
        response.resume();reject(Error('GitHub API 응답 '+response.statusCode));return;
      }
      let bytes=0,body='';
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>1048576){request.destroy(Error('업데이트 응답 용량 초과'));return;}
        body+=chunk;
      });
      response.on('end',()=>{try{resolve(JSON.parse(body));}catch{reject(Error('GitHub 응답을 해석할 수 없습니다.'));}});
      response.on('error',reject);
    });
    request.setTimeout(8000,()=>request.destroy(Error('업데이트 확인 시간 초과')));
    request.on('error',reject);
  });
}
function releaseDownloadUrl(version){
  return versionParts(version)?'https://github.com/'+REPO+'/releases/download/deckforge-v'+version+'/DeckForge-'+version+'-Setup-win-x64.exe':null;
}
function publishedInstaller(releases){
  if(!Array.isArray(releases))return null;
  let latest=null;
  for(const release of releases){
    if(release?.draft!==false||!release.prerelease)continue;
    const version=typeof release.tag_name==='string'?release.tag_name.match(/^deckforge-v(\d+\.\d+\.\d+)$/)?.[1]:null;
    if(!versionParts(version))continue;
    const url=releaseDownloadUrl(version);
    const asset=Array.isArray(release.assets)&&release.assets.find(a=>a?.name==='DeckForge-'+version+'-Setup-win-x64.exe'&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===url);
    if(asset&&(!latest||compareVersions(version,latest)>0))latest=version;
  }
  return latest;
}
async function checkUpdateStatus(currentVersion,requestJson=githubJson){
  const unknown={state:'unavailable',currentVersion,latestVersion:null,runId:null};
  if(!versionParts(currentVersion))return unknown;
  let releasedVersion=null;
  try{releasedVersion=publishedInstaller(await requestJson(API+'/releases?per_page=100'));}catch{}
  if(releasedVersion&&compareVersions(releasedVersion,currentVersion)>=0){
    const available=compareVersions(releasedVersion,currentVersion)>0;
    return {state:available?'available':'current',currentVersion,latestVersion:releasedVersion,runId:null,
      ...(available?{downloadUrl:releaseDownloadUrl(releasedVersion)}:{})};
  }
  try{
    const url=API+'/actions/runs?branch='+encodeURIComponent(BRANCH)+'&per_page=20';
    const result=await requestJson(url);
    const runs=Array.isArray(result?.workflow_runs)?result.workflow_runs:[];
    for(const run of runs){
      if(run?.name!=='DeckForge integrated Windows build'||run?.event!=='push'||
        run?.status!=='completed'||run?.conclusion!=='success'||!Number.isSafeInteger(run.id)||run.id<1)continue;
      const artifacts=await requestJson(API+'/actions/runs/'+run.id+'/artifacts?per_page=50');
      const match=(Array.isArray(artifacts?.artifacts)?artifacts.artifacts:[]).find(item=>{
        const version=typeof item?.name==='string'
          ?item.name.match(/^DeckForge-(\d+\.\d+\.\d+)-Setup-win-x64(?:\.exe)?$/)?.[1]:null;
        return !!versionParts(version)&&item.expired===false&&item.size_in_bytes>0;
      });
      if(!match)continue;
      const latestVersion=match.name.match(/^DeckForge-(\d+\.\d+\.\d+)-Setup-win-x64(?:\.exe)?$/)[1];
      const available=compareVersions(latestVersion,currentVersion)>0;
      return {state:available?'available':'current',currentVersion,latestVersion,
        runId:available?run.id:null};
    }
  }catch{}
  if(releasedVersion)return {state:'current',currentVersion,latestVersion:releasedVersion,runId:null};
  return unknown;
}

// Only the repository's exact published Setup EXE is eligible for local download.
const MAX_INSTALLER_BYTES=512*1024*1024;
function verifiedInstallerAsset(releases,version){
  const url=releaseDownloadUrl(version);
  if(!url||!Array.isArray(releases))return null;
  const name='DeckForge-'+version+'-Setup-win-x64.exe';
  const release=releases.find(r=>r?.tag_name==='deckforge-v'+version&&r.draft===false&&r.prerelease===true);
  const asset=Array.isArray(release?.assets)&&release.assets.find(a=>a?.name===name&&a.state==='uploaded'&&a.browser_download_url===url);
  if(!asset||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_INSTALLER_BYTES||
      typeof asset.digest!=='string'||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest))return null;
  return {name,url,size:asset.size,sha256:asset.digest.slice(7).toLowerCase()};
}
function installerUrlAllowed(url,original){
  try{
    const u=new URL(url);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
      (u.href===original||['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname));
  }catch{return false;}
}
function openInstallerResponse(url,original,remaining=5){
  if(!installerUrlAllowed(url,original))return Promise.reject(Error('허용되지 않은 설치 파일 다운로드 주소입니다.'));
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'User-Agent':'DeckForge-update-download','Accept':'application/octet-stream'}},response=>{
      if([301,302,303,307,308].includes(response.statusCode)){
        response.resume();
        if(remaining<1||!response.headers.location){reject(Error('설치 파일 리디렉션 오류'));return;}
        let next;try{next=new URL(response.headers.location,url).href;}catch(error){reject(error);return;}
        openInstallerResponse(next,original,remaining-1).then(resolve,reject);return;
      }
      if(response.statusCode!==200){response.resume();reject(Error('설치 파일 HTTP '+response.statusCode));return;}
      resolve(response);
    });
    request.setTimeout(30000,()=>request.destroy(Error('설치 파일 다운로드 시간 초과')));
    request.on('error',reject);
  });
}

// Only exact installer names (including the UUID suffix generated by 2.0.77)
// are managed. Never recurse into subdirectories or follow symbolic links.
function installerFileVersion(name){
  const version=typeof name==='string'&&name.match(/^DeckForge-(\d+\.\d+\.\d+)-Setup-win-x64(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.exe$/i)?.[1];
  return versionParts(version)?version:null;
}
async function localInstallerFiles(directory){
  const entries=await fs.promises.readdir(directory,{withFileTypes:true});
  return entries.filter(e=>e.isFile()&&installerFileVersion(e.name)).map(e=>e.name);
}
async function matchesInstaller(file,asset){
  try{
    const info=await fs.promises.lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size!==asset.size)return false;
    const hash=createHash('sha256');
    for await(const chunk of fs.createReadStream(file))hash.update(chunk);
    return hash.digest('hex')===asset.sha256;
  }catch{return false;}
}
function previousInstallerVersions(names,latest){
  return [...new Set(names.map(installerFileVersion).filter(v=>v&&compareVersions(v,latest)<0))].sort((a,b)=>compareVersions(b,a));
}
async function retainInstallerPair(directory,file,version,releases,onCleanupError){
  try{
    const names=await localInstallerFiles(directory);
    const keep=new Set([path.basename(file)]);
    const previous=previousInstallerVersions(names,version);
    if(previous.length){
      // Prefer the newest older version; use its verified copy when possible.
      const candidates=names.filter(n=>installerFileVersion(n)===previous[0]).sort((a,b)=>a.length-b.length||a.localeCompare(b));
      const asset=verifiedInstallerAsset(releases,previous[0]);
      let rollback=null;
      if(asset)for(const name of candidates){if(await matchesInstaller(path.join(directory,name),asset)){rollback=name;break;}}
      // Keep at least one prior installer even when its old release metadata is absent.
      keep.add(rollback||candidates[0]);
    }
    for(const name of names){
      if(keep.has(name)||compareVersions(installerFileVersion(name),version)>0)continue;
      const candidate=path.join(directory,name);
      try{
        const st=await fs.promises.lstat(candidate);
        if(st.isFile()&&!st.isSymbolicLink())await fs.promises.unlink(candidate);
      }catch(error){if(error.code!=='ENOENT')onCleanupError?.(error);}
    }
  }catch(error){onCleanupError?.(error);}
}

async function downloadPublishedInstaller(version,directory,{requestJson=githubJson,openResponse=openInstallerResponse,onCleanupError}={}){
  if(!versionParts(version))throw Error('설치 버전이 올바르지 않습니다.');
  const releases=await requestJson(API+'/releases?per_page=100');
  const asset=verifiedInstallerAsset(releases,version);
  if(!asset)throw Error('게시된 설치 파일 또는 SHA-256 정보를 확인할 수 없습니다.');
  await fs.promises.mkdir(directory,{recursive:true});
  if((await fs.promises.lstat(directory)).isSymbolicLink())throw Error('업데이트 폴더가 링크입니다.');
  const finish=async file=>{await retainInstallerPair(directory,file,version,releases,onCleanupError);return file;};
  // Verify an existing same-version file before reusing it; no network payload twice.
  const existing=(await localInstallerFiles(directory)).filter(n=>installerFileVersion(n)===version).sort((a,b)=>a.length-b.length||a.localeCompare(b));
  for(const name of existing){const file=path.join(directory,name);if(await matchesInstaller(file,asset))return finish(file);}
  const work=await fs.promises.mkdtemp(path.join(directory,'.deckforge-download-'));
  const temporary=path.join(work,'installer.part');
  try{
    const response=await openResponse(asset.url,asset.url);
    const hash=createHash('sha256');let size=0;
    const verify=new Transform({transform(chunk,encoding,done){
      size+=chunk.length;
      if(size>asset.size){done(Error('설치 파일 용량 초과'));return;}
      hash.update(chunk);done(null,chunk);
    }});
    await pipeline(response,verify,fs.createWriteStream(temporary,{flags:'wx'}),{signal:AbortSignal.timeout(10*60*1000)});
    if(size!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('설치 파일 크기 또는 SHA-256 검증 실패');
    // Do not replace a previous installer or expose an unverified executable.
    let file=path.join(directory,asset.name);
    try{await fs.promises.copyFile(temporary,file,fs.constants.COPYFILE_EXCL);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      file=path.join(directory,asset.name.slice(0,-4)+'-'+randomUUID()+'.exe');
      await fs.promises.copyFile(temporary,file,fs.constants.COPYFILE_EXCL);
    }
    return await finish(file);
  }finally{
    await fs.promises.rm(work,{recursive:true,force:true}).catch(()=>{});
  }
}

module.exports={compareVersions,checkUpdateStatus,githubJson,releaseDownloadUrl,verifiedInstallerAsset,installerUrlAllowed,downloadPublishedInstaller,installerFileVersion,previousInstallerVersions};
