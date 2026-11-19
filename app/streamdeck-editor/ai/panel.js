'use strict';
(()=>{
const $=id=>document.getElementById(id),api=window.aiBridge;
let connected=false,busy='',models=[],history=[],current=null,stream=null;
const notice=t=>{$('notice').textContent=t||'';};
const check=r=>{if(!r?.ok)throw Error(r?.error||'AI 연결 오류');return r.value;};
function controls(){
  $('status').textContent=busy?({login:'로그인 중',models:'모델 조회 중',chat:'응답 중',logout:'연결 해제 중',history:'기록 처리 중'}[busy]||'처리 중'):connected?'연결됨':'연결 안 됨';
  $('login').hidden=connected;$('login').disabled=!!busy;$('logout').hidden=!connected;$('logout').disabled=!!busy;
  $('cancelLogin').hidden=busy!=='login';$('stop').disabled=busy!=='chat';
  $('model').disabled=!!busy||!connected||!models.length;$('refresh').disabled=!!busy||!connected;
  $('send').disabled=!!busy||!connected||!$('model').value||!$('input').value.trim();
  $('new').disabled=!!busy;$('history').disabled=!!busy;$('delete').disabled=!!busy||!history.some(c=>c.id===current);
  $('tool').disabled=!!busy;$('input').disabled=!!busy;
}
function addMessage(role,text){
  const div=document.createElement('div');div.className='message '+role;const label=document.createElement('b');label.textContent=role==='user'?'사용자':'ChatGPT';
  const content=document.createElement('span');content.textContent=text;div.append(label,content);$('messages').append(div);$('messages').scrollTop=$('messages').scrollHeight;return content;
}
function draw(){
  $('messages').replaceChildren();const c=history.find(x=>x.id===current);
  if(c)c.messages.forEach(m=>addMessage(m.role,m.content));
  else{const p=document.createElement('p');p.className='empty';p.textContent='새 대화 · 1단계에서는 일반 대화와 버전 조회 테스트만 지원합니다.';$('messages').append(p);}
  $('history').replaceChildren(new Option('새 대화',''),...history.map(c=>new Option(c.title,c.id)));$('history').value=c?.id||'';controls();
}
async function status(){
  const s=check(await api.status());connected=s.connected;$('account').textContent=s.account||'ChatGPT 계정 연결';if(!connected){models=[];$('model').replaceChildren();}controls();
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
  if(event.type==='tool'){notice('로컬 버전 조회 결과: '+event.version);}
});
$('send').onclick=()=>run('chat',async()=>{
  const text=$('input').value.trim(),id=current||crypto.randomUUID(),model=$('model').value,toolTest=$('tool').checked;
  notice('응답 요청 중');$('messages').querySelector('.empty')?.remove();addMessage('user',text);stream=addMessage('assistant','');
  try{const r=check(await api.send({id,model,text,toolTest}));history=[r.conversation,...history.filter(c=>c.id!==id)];current=id;$('input').value='';draw();notice(toolTest?(r.called?'함수 호출 및 응답 완료':'응답 완료 · 모델이 조회 함수를 호출하지 않았습니다.'):'응답 완료');}
  catch(e){stream.textContent+=(stream.textContent?'\n\n':'')+'[미완료 · 저장하지 않음]';throw e;}
  finally{stream=null;}
});
run('history',async()=>{await status();history=check(await api.history());current=history[0]?.id||null;draw();if(connected){busy='models';controls();await modelList();}});
})();
