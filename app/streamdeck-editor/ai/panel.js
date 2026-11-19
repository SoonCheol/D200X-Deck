'use strict';
(()=>{
const $=id=>document.getElementById(id),api=window.aiBridge;
let connected=false,busy='',models=[],history=[],current=null,stream=null,preview=null,canUndo=false;
const notice=t=>{$('notice').textContent=t||'';};
const check=r=>{if(!r?.ok)throw Error(r?.error||'AI 연결 오류');return r.value;};

let preferenceSave=Promise.resolve();
function setChecks(settings){
  $('edit-mode').checked=settings?.edit===true;
  $('tool').checked=settings?.read===true||$('edit-mode').checked;
}
function rememberChecks(){
  const settings={read:$('tool').checked,edit:$('edit-mode').checked};
  preferenceSave=preferenceSave.catch(()=>{}).then(()=>api.setPreferences(settings)).then(check).catch(e=>notice('조회 설정 저장 실패: '+e.message));
}
$('tool').onchange=()=>{if(!$('tool').checked)$('edit-mode').checked=false;rememberChecks();};
$('edit-mode').onchange=()=>{if($('edit-mode').checked)$('tool').checked=true;rememberChecks();};

function controls(){
  $('status').textContent=busy?({login:'로그인 중',models:'모델 조회 중',chat:'응답 중',logout:'연결 해제 중',history:'기록 처리 중',apply:'변경 저장 중',undo:'복구 중'}[busy]||'처리 중'):connected?'연결됨':'연결 안 됨';
  $('login').hidden=connected;$('login').disabled=!!busy;$('logout').hidden=!connected;$('logout').disabled=!!busy;
  $('cancelLogin').hidden=busy!=='login';$('stop').disabled=busy!=='chat';
  $('model').disabled=!!busy||!connected||!models.length;$('refresh').disabled=!!busy||!connected;
  $('send').disabled=!!busy||!connected||!$('model').value||!$('input').value.trim();
  $('new').disabled=!!busy;$('history').disabled=!!busy;$('delete').disabled=!!busy||!history.some(c=>c.id===current);
  $('tool').disabled=!!busy||!!preview;$('edit-mode').disabled=!!busy||!!preview;$('input').disabled=!!busy||!!preview;
  if(preview){for(const id of ['send','new','history','delete','logout','refresh','model'])$(id).disabled=true;}
  $('edit-apply').disabled=!!busy||!preview;$('edit-cancel').disabled=!!busy||!preview;$('edit-undo').disabled=!!busy||!!preview||!canUndo;
}
function addMessage(role,text){
  const div=document.createElement('div');div.className='message '+role;const label=document.createElement('b');label.textContent=role==='user'?'사용자':'ChatGPT';
  const content=document.createElement('div');content.className='message-content'+(role==='assistant'&&!text?' is-streaming':'');if(role==='assistant'&&text)window.DeckForgeMarkdown.render(content,text);else content.textContent=text;div.append(label,content);$('messages').append(div);$('messages').scrollTop=$('messages').scrollHeight;return content;
}
function draw(){
  $('messages').replaceChildren();const c=history.find(x=>x.id===current);
  if(c)c.messages.forEach(m=>addMessage(m.role,m.content));
  else{const p=document.createElement('p');p.className='empty';p.textContent='새 대화 · 조회 또는 변경안 만들기를 선택하세요. 변경안은 승인 전 저장되지 않습니다.';$('messages').append(p);}
  $('history').replaceChildren(new Option('새 대화',''),...history.map(c=>new Option(c.title,c.id)));$('history').value=c?.id||'';controls();
}
async function status(){
  const s=check(await api.status());connected=s.connected;canUndo=!!s.canUndo;$('account').textContent=s.account||'ChatGPT 계정 연결';if(!connected){models=[];$('model').replaceChildren();}controls();
}
async function modelList(){
  const previous=$('model').value;models=check(await api.models());$('model').replaceChildren(...models.map(m=>new Option(m.label,m.id)));
  if(models.some(m=>m.id===previous))$('model').value=previous;
  if(!models.length)notice('사용 가능한 모델이 없습니다.');
}
async function run(kind,fn){
  if(busy)return;busy=kind;controls();
  try{await fn();}catch(e){notice(e.message);try{await status();}catch{}}
  finally{busy='';controls();}
}
$('login').onclick=()=>run('login',async()=>{notice('기본 브라우저에서 ChatGPT 로그인과 구독 사용을 승인하세요.');const result=check(await api.login());await status();if(result.firstConnection)alert('DeckForge의 AI 요청은 ChatGPT 구독 사용량에 포함됩니다. ChatGPT 사용량 관리에서 앱의 한도와 크레딧 사용 설정을 확인할 수 있습니다.');busy='models';controls();await modelList();notice('');});
$('cancelLogin').onclick=()=>api.cancel();
$('logout').onclick=()=>{if(confirm('DeckForge의 ChatGPT 연결을 해제하시겠습니까?'))run('logout',async()=>{const r=check(await api.logout());await status();notice(r.revoked?'연결 해제 완료':'로컬 연결 해제 완료. 원격 폐기 미확인: ChatGPT 설정에서 연결을 확인하세요.');});};
$('refresh').onclick=()=>run('models',async()=>{notice('');await modelList();});
$('usage').onclick=async()=>{try{check(await api.usage());}catch(e){notice(e.message);}};
$('new').onclick=()=>{current=null;$('input').value='';notice('');draw();};
$('history').onchange=()=>{current=$('history').value||null;$('input').value='';notice('');draw();};
$('delete').onclick=()=>{if(current&&confirm('이 대화 기록을 삭제하시겠습니까?'))run('history',async()=>{history=check(await api.delete(current));current=null;draw();});};
$('input').oninput=controls;
$('input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('send').disabled)$('send').click();}};
$('stop').onclick=()=>{api.cancel();notice('중지 요청 중');};
api.onEvent(event=>{
  if(busy!=='chat'||!stream)return;
  if(event.type==='delta'&&typeof event.text==='string'){stream.textContent+=event.text;$('messages').scrollTop=$('messages').scrollHeight;}
  if(event.type==='tool'){notice(['propose_edit','propose_advanced'].includes(event.name)?'변경안 준비 중':event.name==='get_version'?'로컬 버전 조회 결과: '+event.version:'로컬 조회: '+(event.section||'')+(event.ok===false?' · 제한 또는 실패':''));}
});
$('send').onclick=()=>run('chat',async()=>{
  const text=$('input').value.trim(),id=current||crypto.randomUUID(),model=$('model').value,editMode=$('edit-mode').checked,readOnly=$('tool').checked||editMode;
  notice('응답 요청 중');$('messages').querySelector('.empty')?.remove();addMessage('user',text);stream=addMessage('assistant','');
  try{const r=check(await api.send({id,model,text,readOnly,editMode}));history=[r.conversation,...history.filter(c=>c.id!==id)];current=id;$('input').value='';canUndo=!!r.canUndo;draw();showPreview(r.preview||null);if(r.previewFailure){notice('변경안 준비 실패: '+r.previewFailure);return;}notice((readOnly?(r.called?'조회 및 응답 완료 · '+r.toolCalls+'회 조회':'응답 완료 · 로컬 조회 없음'):'응답 완료')+' · 요청 '+r.requests+'회'+(r.usage?' · 입력 '+r.usage.input_tokens.toLocaleString()+' / 출력 '+r.usage.output_tokens.toLocaleString()+' 토큰':''));}
  catch(e){stream.textContent+=(stream.textContent?'\n\n':'')+'[미완료 · 저장하지 않음]';throw e;}
  finally{stream=null;}
});

function describeEdit(item){
  if(!item)return '';
  return [item.title,item.type,item.value,item.size!=null?'글자 '+item.size:null,item.color,item.font,item.bold===true?'굵게':item.bold===false?'보통':null,item.hasArgs?'기존 인수 있음':null,item.hold&&item.hold!=='none'?'길게 누르기 '+item.hold:null,item.foreground===false?'전경 비활성':null,item.preventDuplicate===false?'중복 허용':null,item.alwaysNewWindow===true?'항상 새 창':null,item.icon].filter(x=>x!==undefined&&x!==null&&x!=='').join(' · ');
}
function showPreview(value){
  preview=value;$('edit-preview').hidden=!value;$('edit-rows').replaceChildren();
  if(value){
    $('edit-profile').textContent=value.profile;
    const names={put:'등록',update:'수정',delete:'삭제',copy:'복사',move:'이동',move_source:'이동 원본',add_page:'페이지 추가',folder_page:'덱폴더 페이지 추가',folder_settings:'덱폴더 설정',control:'물리 컨트롤',wide:'와이드 화면',composite:'복합 동작',state_design:'상태별 디자인',plugin:'플러그인 등록'};
    for(const row of value.rows){
      const box=document.createElement('div');box.className='edit-row';
      if(typeof row.previewImage==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(row.previewImage)){
        const img=document.createElement('img');img.alt='변경 후 아이콘';img.src=row.previewImage;box.append(img);
      }
      const body=document.createElement('div'),title=document.createElement('strong'),data=document.createElement('pre');
      title.textContent=(names[row.op]||row.op)+' · 페이지 '+row.page+(row.folder?' / 폴더 '+row.folder:'')+(row.slot?' / 버튼 '+row.slot:'')+(row.control?' / '+row.control:'')+(row.state?' / '+row.state:'');
      data.textContent='전: '+describeEdit(row.before)+'\n후: '+describeEdit(row.after)+(row.icon?'\n아이콘: '+row.icon:'');
      body.append(title,data);box.append(body);$('edit-rows').append(box);
    }
  }
  controls();
}
$('edit-apply').onclick=()=>run('apply',async()=>{
  if(!preview||!confirm('미리보기의 변경 사항을 적용하고 저장하시겠습니까?'))return;
  const id=preview.id;
  try{const r=check(await api.applyEdit(id));canUndo=!!r.canUndo;notice(r.refreshError?'설정 저장 완료 · 화면 또는 동기화 확인 필요':'설정 저장 완료 · D200X 동기화 요청');}
  finally{showPreview(null);}
});
$('edit-cancel').onclick=()=>run('apply',async()=>{if(!preview)return;check(await api.discardEdit(preview.id));showPreview(null);notice('변경안 취소 · 저장하지 않음');});
$('edit-undo').onclick=()=>run('undo',async()=>{if(!canUndo||!confirm('최근 AI 변경을 되돌리시겠습니까?'))return;
  const r=check(await api.undoEdit());canUndo=!!r.canUndo;notice(r.refreshError?'복구 저장 완료 · 화면 확인 필요':'최근 AI 변경 되돌리기 완료');});

run('history',async()=>{setChecks(check(await api.preferences()));await status();history=check(await api.history());current=history[0]?.id||null;draw();if(connected){busy='models';controls();await modelList();}});
})();
