'use strict';
((root)=>{
const matches=text=>typeof text==='string'&&/^(?:autodesk\s+)?(?:fusion(?:\s*360)?|퓨[전젼])\s*(?:초기\s*)?연결(?:\s*해\s*(?:줘|주|주세요|주라))?[.!?\s]*$/i.test(text.trim());
const choose=rows=>{
 const found=rows.filter(x=>x&&typeof x.appId==='string'&&x.appId!=='[숨김]'&&(
   /^AutodeskInc\.Fusion360$/i.test(x.appId)||/^(?:Autodesk\s+)?Fusion(?:\s*360)?$/i.test(x.name)));
 const ids=[...new Set(found.map(x=>x.appId))];
 return ids.length===1?{status:'found',id:ids[0]}:{status:ids.length?'ambiguous':'not-found'};
};
async function run(deps,signal){
 const rows=[];
 const add=(name,status,detail)=>rows.push({name,status,detail});
 const check=()=>signal?.throwIfAborted();
 const attempt=async(fn,fallback)=>{check();try{const r=await fn();check();return r;}catch(e){check();return fallback;}};
 const pick=await attempt(async()=>choose(await deps.apps(signal)),{status:'unavailable'});
 add('Fusion 시작 메뉴',pick.status==='found'?'완료':'확인 필요',({found:'등록된 Fusion 앱 확인',ambiguous:'후보가 여러 개여서 임의 실행하지 않음','not-found':'등록된 앱을 찾지 못함',unavailable:'시작 메뉴 조회 실패'})[pick.status]);
 const plugin=await attempt(deps.plugin,'failed');
 add('SDK 플러그인',['existing','installed'].includes(plugin)?'완료':'확인 필요',({existing:'기존 설치 유지',installed:'누락된 Fusion 플러그인 설치','not-bundled':'내장 플러그인 없음',failed:'설치 또는 조회 실패'})[plugin]||'상태 확인 필요');
 let addin=await attempt(deps.addin,{status:'failed'}),online=await attempt(deps.health,false),launch='not-needed';
 if(!online&&pick.status==='found'&&['installed','existing','fusion-not-ready'].includes(addin.status)&&['existing','installed'].includes(plugin)){
   const state=await attempt(()=>deps.probe(pick.id,signal),'unavailable');
   if(state==='missing'){
     launch=await attempt(async()=>{await deps.launch(pick.id);return 'requested';},'failed');
   }else launch=['present','focused','matched-not-focused','running-gui','running-protected'].includes(state)?'already-running':'unavailable';
   if(launch==='requested'||launch==='already-running'){
     // Bounded wait. Do not relaunch, terminate, restart or send Fusion UI keystrokes.
     for(let i=0;i<12;i++){
       check();await deps.sleep(2000,signal);check();
       if(addin.status==='fusion-not-ready')addin=await attempt(deps.addin,{status:'failed'});
       online=await attempt(deps.health,false);
       if(online)break;
     }
   }
 }
 add('Fusion 애드인',['existing','installed'].includes(addin.status)?'완료':'확인 필요',
  ({existing:'기존 애드인 유지',installed:'누락된 애드인 설치','existing-incomplete':'불완전한 기존 폴더 보존','not-bundled':'설치 파일 누락','fusion-not-ready':'Fusion 최초 실행 필요',ambiguous:'설치 위치 중복 또는 모호함',failed:'설치 또는 조회 실패'})[addin.status]||'상태 확인 필요');
 add('자동 시작 설정',['enabled','already-enabled'].includes(addin.startup)?'완료':'확인 필요',
  ({enabled:'manifest 자동 시작 설정 활성화', 'already-enabled':'manifest 자동 시작 설정 유지',unverified:'manifest 확인 또는 변경 실패'})[addin.startup]||'설정 확인 필요');
 add('Fusion 실행',launch==='requested'||launch==='already-running'||online?'완료':'확인 필요',
  ({'requested':'시작 메뉴 실행 요청 1회','already-running':'기존 프로세스 유지',failed:'실행 요청 실패',unavailable:'실행 상태 확인 불가, 중복 실행 방지를 위해 요청하지 않음','not-needed':online?'이미 연결됨':'실행 조건 미충족'})[launch]);
 add('애드인 연결',online?'완료':'확인 필요',online?'로컬 health 응답 정상':'로컬 health 응답 미확인');
 const ready=online&&['installed','existing'].includes(plugin);
 return {ready,rows};
}
function format(result){
 const lines=['## Fusion 초기 연결 결과','',...result.rows.map(x=>'- **'+x.name+' · '+x.status+'**: '+x.detail),''];
 lines.push(result.ready?'Fusion 애드인 연결과 SDK 플러그인 설치를 확인했습니다. 실제 명령 실행은 별도 확인이 필요합니다.':'아직 연결 완료가 아닙니다. Fusion이 실행 중이면 로그인 상태와 Scripts and Add-Ins의 FusionStreamDeck Run 및 Run on Startup을 확인한 후 다시 실행하세요. 기존 앱을 종료하거나 재시작하지 않았습니다.');
 return lines.join('\n');
}
 const api={matches,choose,run,format};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckForgeFusionSetup=api;
})(typeof globalThis==='object'?globalThis:this);
