'use strict';
// GitHub Actions artifacts are not Release assets: navigate to a verified run page.
const https=require('node:https');
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
      !u.pathname.startsWith('/repos/'+REPO+'/actions/'))
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
async function checkUpdateStatus(currentVersion,requestJson=githubJson){
  const unknown={state:'unavailable',currentVersion,latestVersion:null,runId:null};
  if(!versionParts(currentVersion))return unknown;
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
          ?item.name.match(/^DeckForge-(\d+\.\d+\.\d+)-Setup-win-x64$/)?.[1]:null;
        return !!versionParts(version)&&item.expired===false&&item.size_in_bytes>0;
      });
      if(!match)continue;
      const latestVersion=match.name.match(/^DeckForge-(\d+\.\d+\.\d+)-Setup-win-x64$/)[1];
      const available=compareVersions(latestVersion,currentVersion)>0;
      return {state:available?'available':'current',currentVersion,latestVersion,
        runId:available?run.id:null};
    }
  }catch{return unknown;}
  return unknown;
}
module.exports={compareVersions,checkUpdateStatus,githubJson};
