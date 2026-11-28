'use strict';
// Native, read-only GitHub Actions monitor. Authentication stays in the SDK vault.
const ID='com.deckforge.native.github-status';
function buildKey(event,settings,state,memory,api){
  const repo=String(settings.repository||'').trim().split('/');
  const workflow=String(settings.workflow||'').trim();
  const branch=String(settings.branch||'').trim();
  const segment=s=>/^[A-Za-z0-9_.~-]{1,128}$/.test(s)&&s!=='.'&&s!=='..';
  const ready=repo.length===2&&repo.every(segment)&&segment(workflow)&&branch.length<=256;
  const label=String(settings.label||repo[1]||'GitHub').trim().slice(0,100);
  const chars=Array.from(label),scroll=settings.marquee!==false&&chars.length>10;
  const speed=Number(settings.marqueeSpeed)||1000;
  const now=Date.now();
  const elapsed=Math.max(0,now-(memory.scrollStart??now));
  const loop=[...chars,' ',' ','•',' ',' '];
  const offset=scroll?Math.max(0,Math.floor(elapsed/speed)-2)%loop.length:0;
  const visibleLabel=scroll?Array.from({length:10},(_,i)=>loop[(offset+i)%loop.length]).join(''):label;
  const colors={success:'#39D98A',failure:'#FF6262',running:'#FFD35A',queued:'#80C4FF',neutral:'#FFFFFF'};
  const render=(status,kind='neutral',number='')=>{
    memory.display={status,kind,number};
    const frame=JSON.stringify([visibleLabel,status,kind,number]);
    if(memory.frame===frame&&event.type!=='appear'&&event.type!=='settings')return;
    memory.frame=frame;
    const text=(text,y,size,color,bold=true)=>({type:'text',x:72,y,text,size,color,bold});
    api.setTitle('');
    api.drawKey({width:144,height:144,commands:[
      {type:'rect',x:8,y:7,width:128,height:5,color:colors[kind]},
      text(visibleLabel,30,Math.max(13,Math.min(24,Math.floor(135/Math.max(1,visibleLabel.length)*1.5))),'#FFFFFF'),
      text(status,77,status.length>6?19:26,colors[kind]),
      text(number,119,23,'#FFFFFF')
    ]});
  };
  if(event.type==='appear'||event.type==='settings'){
    memory.runLink=null;memory.lastRequest=0;memory.pending=false;memory.scrollStart=now;memory.interval=5000;render(ready?'조회 준비':'설정 확인');return;
  }
  if(!ready){memory.runLink=null;render('설정 확인');return;}
  if(event.type==='networkResult'){
    memory.pending=false;memory.runLink=null;
    const r=event.response||{};
    if(!r.ok){
      memory.interval=15000;
      if(r.error==='capacity'&&memory.display)return;
      const label=r.error==='credential-required'?'토큰 등록':r.status===401?'인증 실패':r.status===403?'권한 확인':r.status===404?'경로 확인':r.error==='response-limit'?'응답 초과':'조회 실패';
      render(label,'failure');return;
    }
    memory.interval=15000;
    let runs;try{runs=JSON.parse(r.body).workflow_runs;}catch{render('응답 오류','failure');return;}
    if(!Array.isArray(runs)){render('응답 오류','failure');return;}
    const run=runs[0];if(!run){render('빌드 없음');return;}
    // Construct the link from the selected repository and numeric run ID.
    // Never forward a remote-provided html_url or attach credentials.
    if(Number.isSafeInteger(run.id)&&run.id>0&&Number.isSafeInteger(run.run_number)&&run.run_number>0)
      memory.runLink={repo:repo.join('/'),workflow,branch,id:run.id,number:run.run_number};
    let status='상태 확인',kind='neutral';
    if(run.status==='completed'){
      if(run.conclusion==='success'){status='빌드 성공';kind='success';}
      else if(['failure','timed_out','startup_failure'].includes(run.conclusion)){status='빌드 실패';kind='failure';}
      else if(run.conclusion==='cancelled')status='빌드 취소';
      else if(run.conclusion==='skipped')status='빌드 생략';
      else if(run.conclusion==='action_required'){status='확인 필요';kind='queued';}
    }else if(run.status==='in_progress'){status='빌드 중';kind='running';}
    else if(['queued','requested','waiting','pending'].includes(run.status)){status='대기 중';kind='queued';}
    if(kind==='running'||kind==='queued')memory.interval=5000;
    render(status,kind,Number.isSafeInteger(run.run_number)?'#'+run.run_number:'');return;
  }
  if(event.type!=='tick'&&event.type!=='press')return;
  const link=memory.runLink;
  if(event.type==='press'&&link&&link.repo===repo.join('/')&&link.workflow===workflow&&link.branch===branch&&
     Number.isSafeInteger(link.id)&&link.id>0&&Number.isSafeInteger(link.number)&&link.number>0&&memory.display?.number==='#'+link.number){
    api.openUrl('https://github.com/'+repo.map(encodeURIComponent).join('/')+'/actions/runs/'+link.id);return;
  }
  // If no valid displayed run exists, preserve the existing press-to-refresh fallback.
  if(event.type==='tick'&&memory.display)render(memory.display.status,memory.display.kind,memory.display.number);
  if(memory.pending&&now-(memory.lastRequest||0)<10000)return;
  const interval=settings.refresh==='auto'||!settings.refresh?(memory.interval||5000):Number(settings.refresh)||15000;
  if(event.type==='tick'&&now-(memory.lastRequest||0)<interval)return;
  memory.lastRequest=now;memory.pending=true;
  api.request('runs',null,{per_page:'1',...(branch?{branch}:{})},{path:{owner:repo[0],repo:repo[1],category:'actions',collection:'workflows',workflow,resource:'runs'}});
}
// Ordered monitor: a single in-flight request belongs to its original target.
function multiBuildKey(event,settings,state,memory,api,normalize,display,step){
  let targets;
  try{targets=normalize(settings.targets);}catch{
    memory.index=0;memory.requestIndex=null;
    return display(event,{...settings,repository:'',workflow:'',branch:'',label:'GitHub'},state,memory,api);
  }
  if(event.type==='appear'||event.type==='settings'){
    memory.index=0;memory.requestIndex=null;
  }
  if(!Number.isInteger(memory.index)||memory.index<0||memory.index>=targets.length)memory.index=0;
  const selected=()=>({...settings,...targets[memory.index]});
  if(event.type==='multiNext'||event.type==='multiPrevious'){
    const next=step(memory.index,targets.length,event.type==='multiNext'?1:-1);
    if(next===memory.index)return;
    memory.index=next;
    if(memory.requestIndex!=null)memory.requestIndex=-1;
    return display({type:'settings'},selected(),state,memory,api);
  }
  if(event.type==='networkResult'){
    const requested=memory.requestIndex;memory.requestIndex=null;
    if(requested!==memory.index)return;
  }
  if(event.type==='release')return;
  if(event.type==='press'&&!memory.runLink)return;
  // The host skips ticks during active requests; the timeout only recovers
  // from a host-side cancellation that deliberately delivers no result.
  if(event.type==='tick'&&memory.requestIndex!=null){
    if(Date.now()-(memory.requestAt||0)<10000)return;
    memory.requestIndex=null;memory.pending=false;
  }
  const wrapped={setTitle:(...args)=>api.setTitle(...args),drawKey:(...args)=>api.drawKey(...args),
    openUrl:(...args)=>api.openUrl(...args),request:(...args)=>{
      if(memory.requestIndex!=null)return;
      memory.requestIndex=memory.index;memory.requestAt=Date.now();api.request(...args);
    }};
  return display(event,selected(),state,memory,wrapped);
}
function createGitHubManifest(){
  const field=(key,label,value,maxLength=128)=>({key,label,type:'text',default:value,maxLength});
  const manifest={apiVersion:2,id:ID,name:'GitHub 개발 현황',version:'0.1.6',requiresDeckForge:'>=2.0.115',
    permissions:['display','network.request','network.poll','timer.tick','browser.open'],
    networkEndpoints:[{id:'runs',url:'https://api.github.com/repos/',method:'GET',auth:'bearer',pathKeys:['owner','repo','category','collection','workflow','resource'],queryKeys:['per_page','branch'],maxResponseBytes:32768}],
    actions:[{id:ID+'.build',name:'빌드 상태',controllers:['Keypad'],states:1,visualPolicy:'foreground',
      script:'return ('+buildKey.toString()+')(event,settings,state,memory,api);',tickIntervalMs:1000,pollIntervalMs:5000,
      settingsSchema:[field('label','표시 이름','DeckForge',100),field('repository','저장소 (소유자/이름)','SoonCheol/D200X-Deck',256),field('workflow','빌드 파일명 또는 ID','deckforge-windows-build.yml'),field('branch','브랜치 (빈 값: 전체)','codex/streamdeck-761-clean-editor',256),{key:'marquee',label:'긴 이름 흐르기',type:'boolean',default:true},{key:'marqueeSpeed',label:'마퀴 속도',type:'select',default:'1000',options:[{value:'1000',label:'빠르게 (1초)'},{value:'2000',label:'보통 (2초)'},{value:'3000',label:'느리게 (3초)'}]},{key:'refresh',label:'자동 갱신 간격',type:'select',default:'auto',options:[{value:'auto',label:'자동 (5/15초)'},...['5000','10000','15000','30000'].map(value=>({value,label:Number(value)/1000+'초'}))]}],settingsUI:[{key:'marqueeSpeed',visibleWhen:{key:'marquee',equals:true}}]}]
  };
  const single=manifest.actions[0];
  const targets={key:'targets',label:'저장소 목록',type:'recordList',maxItems:MAX_GITHUB_MONITOR_TARGETS,columns:[
    {key:'repository',label:'저장소',maxLength:256,default:''},
    {key:'workflow',label:'빌드 종류',maxLength:128,default:''},
    {key:'branch',label:'브랜치',maxLength:256,default:''},
    {key:'label',label:'표시 이름',maxLength:100,default:''}
  ],default:[]};
  manifest.actions.push({...single,id:ID+'.multi-build',name:'다중 저장소 빌드 상태',
    script:'const MAX_GITHUB_MONITOR_TARGETS='+MAX_GITHUB_MONITOR_TARGETS+';return ('+multiBuildKey.toString()+')(event,settings,state,memory,api,('+normalizeGitHubMonitorTargets.toString()+'),('+buildKey.toString()+'),('+stepGitHubMonitorIndex.toString()+'));',
    settingsSchema:[targets,...single.settingsSchema.filter(field=>['marquee','marqueeSpeed','refresh'].includes(field.key))]});
  return manifest;
}
// Host-only discovery. The renderer supplies a repository name, never a URL or token.
async function discoverGitHubBuildOptions(repository,bearer,request=require('./deckforge-native-network.cjs').requestEndpoint){
  const {validBearer}=require('./deckforge-native-network.cjs');
  if(!validBearer(bearer))throw Error('토큰 등록 필요');
  const segment=s=>/^[A-Za-z0-9_.~-]{1,128}$/.test(s)&&s!=='.'&&s!=='..';
  if(typeof repository!=='string'||repository.length>256||(repository&&(repository.split('/').length!==2||!repository.split('/').every(segment))))throw Error('저장소 이름 확인');
  const clean=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&!v.includes(bearer);
  const list=async(path,key,map)=>{
    const rows=[];let truncated=false;
    for(let page=1;page<=10;page++){
      const endpoint={id:'github-catalog',url:'https://api.github.com'+path+'?per_page=50&page='+page,method:'GET',auth:'bearer'};
      const result=await request(endpoint,null,null,{bearer,maxBytes:1048576});
      if(!result?.ok)throw Error(result?.status===401?'인증 실패':result?.status===403?'권한 또는 API 한도 확인':result?.status===404?'저장소 또는 Actions 권한 확인':'목록 조회 실패');
      if(typeof result.body!=='string'||result.body.length>1048576||result.body.includes(bearer))throw Error('목록 응답 오류');
      let json;try{json=JSON.parse(result.body);}catch{throw Error('목록 응답 오류');}
      const items=key?json?.[key]:json;
      if(!Array.isArray(items)||items.length>50)throw Error('목록 응답 오류');
      for(const row of items){const value=map(row);if(value)rows.push(value);}
      if(items.length<50)break;
      if(page===10)truncated=true;
    }
    return {items:[...new Map(rows.map(row=>[row.value,row])).values()].sort((a,b)=>a.label.localeCompare(b.label,'ko')),truncated};
  };
  if(!repository){
    const repositories=await list('/user/repos',null,row=>clean(row?.full_name,256)&&row.full_name.split('/').length===2&&row.full_name.split('/').every(segment)?{value:row.full_name,label:row.full_name}:null);
    return {repositories:repositories.items,truncated:repositories.truncated};
  }
  const base='/repos/'+repository.split('/').map(encodeURIComponent).join('/');
  const branches=await list(base+'/branches',null,row=>clean(row?.name,256)?{value:row.name,label:row.name}:null);
  const workflows=await list(base+'/actions/workflows','workflows',row=>Number.isSafeInteger(row?.id)&&row.id>0&&clean(row.name,256)&&clean(row.path,1024)?{value:String(row.id),label:row.name,file:row.path.split('/').at(-1)}:null);
  return {branches:branches.items,workflows:workflows.items,truncated:branches.truncated||workflows.truncated};
}
// Ordered monitor draft contract for the upcoming multi-repository action.
// Independent of the existing .build action and its persisted settings.
const MAX_GITHUB_MONITOR_TARGETS=10;
const {normalizeGitHubMonitorTargets}=require('./deck-core.js');
function stepGitHubMonitorIndex(current,count,direction){
  if(!Number.isInteger(count)||count<1||count>MAX_GITHUB_MONITOR_TARGETS||!Number.isInteger(current)||current<0||current>=count||![1,-1].includes(direction))
    throw Error('저장소 순환 위치 확인');
  return (current+direction+count)%count;
}
module.exports={createGitHubManifest,buildKey,multiBuildKey,discoverGitHubBuildOptions,normalizeGitHubMonitorTargets,stepGitHubMonitorIndex,MAX_GITHUB_MONITOR_TARGETS};
