'use strict';
// Native, read-only GitHub Actions monitor. Authentication stays in the SDK vault.
const ID='com.deckforge.native.github-status';
function buildKey(event,settings,state,memory,api){
  const repo=String(settings.repository||'').trim().split('/');
  const workflow=String(settings.workflow||'').trim();
  const branch=String(settings.branch||'').trim();
  const segment=s=>/^[A-Za-z0-9_.~-]{1,128}$/.test(s)&&s!=='.'&&s!=='..';
  const ready=repo.length===2&&repo.every(segment)&&segment(workflow)&&branch.length<=256;
  const label=String(settings.label||repo[1]||'GitHub').trim().slice(0,24);
  const colors={success:'#39D98A',failure:'#FF6262',running:'#FFD35A',queued:'#80C4FF',neutral:'#FFFFFF'};
  const render=(status,kind='neutral',number='')=>{
    const frame=JSON.stringify([label,status,kind,number]);
    if(memory.frame===frame&&event.type!=='appear'&&event.type!=='settings')return;
    memory.frame=frame;
    const text=(text,y,size,color,bold=true)=>({type:'text',x:72,y,text,size,color,bold});
    api.setTitle('');
    api.drawKey({width:144,height:144,commands:[
      {type:'rect',x:8,y:7,width:128,height:5,color:colors[kind]},
      text(label,30,Math.max(13,Math.min(24,Math.floor(135/Math.max(1,label.length)*1.5))),'#FFFFFF'),
      text(status,77,status.length>6?19:26,colors[kind]),
      text(number,119,18,'#FFFFFF')
    ]});
  };
  if(event.type==='appear'||event.type==='settings'){
    memory.lastRequest=0;memory.pending=false;render(ready?'조회 준비':'설정 확인');return;
  }
  if(!ready){render('설정 확인');return;}
  if(event.type==='networkResult'){
    memory.pending=false;
    const r=event.response||{};
    if(!r.ok){
      const label=r.error==='credential-required'?'토큰 등록':r.status===401?'인증 실패':r.status===403?'권한 확인':r.status===404?'경로 확인':r.error==='response-limit'?'응답 초과':'조회 실패';
      render(label,'failure');return;
    }
    let runs;try{runs=JSON.parse(r.body).workflow_runs;}catch{render('응답 오류','failure');return;}
    if(!Array.isArray(runs)){render('응답 오류','failure');return;}
    const run=runs[0];if(!run){render('빌드 없음');return;}
    let status='상태 확인',kind='neutral';
    if(run.status==='completed'){
      if(run.conclusion==='success'){status='빌드 성공';kind='success';}
      else if(['failure','timed_out','startup_failure'].includes(run.conclusion)){status='빌드 실패';kind='failure';}
      else if(run.conclusion==='cancelled')status='빌드 취소';
      else if(run.conclusion==='skipped')status='빌드 생략';
      else if(run.conclusion==='action_required'){status='확인 필요';kind='queued';}
    }else if(run.status==='in_progress'){status='빌드 중';kind='running';}
    else if(['queued','requested','waiting','pending'].includes(run.status)){status='대기 중';kind='queued';}
    render(status,kind,Number.isSafeInteger(run.run_number)?'#'+run.run_number:'');return;
  }
  if(event.type!=='tick'&&event.type!=='press')return;
  const now=Date.now();
  if(memory.pending&&now-(memory.lastRequest||0)<10000)return;
  if(event.type==='tick'&&now-(memory.lastRequest||0)<30000)return;
  memory.lastRequest=now;memory.pending=true;
  api.request('runs',null,{per_page:'1',...(branch?{branch}:{})},{path:{owner:repo[0],repo:repo[1],category:'actions',collection:'workflows',workflow,resource:'runs'}});
}
function createGitHubManifest(){
  const field=(key,label,value,maxLength=128)=>({key,label,type:'text',default:value,maxLength});
  return {apiVersion:2,id:ID,name:'GitHub 개발 현황',version:'0.1.0',requiresDeckForge:'>=2.0.33',
    permissions:['display','network.request','network.poll','timer.tick'],
    networkEndpoints:[{id:'runs',url:'https://api.github.com/repos/',method:'GET',auth:'bearer',pathKeys:['owner','repo','category','collection','workflow','resource'],queryKeys:['per_page','branch'],maxResponseBytes:32768}],
    actions:[{id:ID+'.build',name:'빌드 상태',controllers:['Keypad'],states:1,visualPolicy:'foreground',
      script:'return ('+buildKey.toString()+')(event,settings,state,memory,api);',tickIntervalMs:5000,
      settingsSchema:[field('label','표시 이름','DeckForge',24),field('repository','저장소 (소유자/이름)','SoonCheol/D200X-Deck',256),field('workflow','빌드 파일명 또는 ID','deckforge-windows-build.yml'),field('branch','브랜치 (빈 값: 전체)','codex/streamdeck-761-clean-editor',256)]}]
  };
}
module.exports={createGitHubManifest,buildKey};
