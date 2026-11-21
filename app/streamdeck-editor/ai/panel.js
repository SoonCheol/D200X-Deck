'use strict';
(()=>{
const $=id=>document.getElementById(id),api=window.aiBridge,localSetup=window.DeckForgeFusionSetup.matches;
let connected=false,busy='',models=[],history=[],current=null,stream=null,preview=null,canUndo=false;
let attachments=[],readingAttachment=false;
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
  $('send').disabled=!!busy||readingAttachment||(!attachments.length&&!$('input').value.trim())||(!(!attachments.length&&localSetup($('input').value))&&(!connected||!$('model').value));
  $('attach').disabled=!!busy||!!preview||readingAttachment||!connected;
  $('attach-files').disabled=!!busy||!!preview||readingAttachment;
  $('templates').disabled=!!busy||!!preview;$('fusion-setup').disabled=!!busy||!!preview;
  $('new').disabled=!!busy||readingAttachment;$('history').disabled=!!busy||readingAttachment;$('delete').disabled=!!busy||!history.some(c=>c.id===current);
  $('tool').disabled=!!busy||!!preview;$('edit-mode').disabled=!!busy||!!preview;$('input').disabled=!!busy||!!preview;
  if(preview){for(const id of ['send','new','history','delete','logout','refresh','model'])$(id).disabled=true;}
  $('edit-apply').disabled=!!busy||!preview;$('edit-cancel').disabled=!!busy||!preview;$('edit-undo').disabled=!!busy||!!preview||!canUndo;
}
function addMessage(role,text,local=false,receipt=false){
  const div=document.createElement('div');div.className='message '+role;const label=document.createElement('b');label.textContent=role==='user'?'사용자':receipt?'DeckForge 저장 결과':local?'DeckForge 로컬 연결':'ChatGPT';
  const content=document.createElement('div');content.className='message-content'+(role==='assistant'&&!text?' is-streaming':'');if(receipt){content.textContent=text;content.style.whiteSpace='pre-wrap';}else if(role==='assistant'&&text)window.DeckForgeMarkdown.render(content,text);else content.textContent=text;div.append(label,content);$('messages').append(div);$('messages').scrollTop=$('messages').scrollHeight;return content;
}
function draw(){
  $('messages').replaceChildren();const c=history.find(x=>x.id===current);
  if(c)c.messages.forEach(m=>addMessage(m.role,m.content,m.local===true,m.receipt===true));
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
$('new').onclick=()=>{current=null;$('input').value='';clearAttachments();notice('');draw();};
$('history').onchange=()=>{current=$('history').value||null;$('input').value='';clearAttachments();notice('');draw();};
$('delete').onclick=()=>{if(current&&confirm('이 대화 기록을 삭제하시겠습니까?'))run('history',async()=>{history=check(await api.delete(current));current=null;clearAttachments();draw();});};
$('templates').onclick=()=>{const menu=$('template-list');menu.hidden=!menu.hidden;$('templates').setAttribute('aria-expanded',String(!menu.hidden));};
$('fusion-setup').onclick=()=>{$('input').value='Fusion 초기 연결해 줘';$('template-list').hidden=true;$('templates').setAttribute('aria-expanded','false');$('input').focus();controls();};

const MAX_ATTACH=3,MAX_FILE_BYTES=6*1024*1024,MAX_TOTAL_BYTES=12*1024*1024;
const ALLOWED_EXT=new Set(['png','jpg','jpeg','webp','pdf','txt','log','md','json','csv','xml','js','py','docx','xlsx']);
function renderAttachments(){
  const root=$('attachment-list');root.replaceChildren();root.hidden=!attachments.length;
  for(const [index,file] of attachments.entries()){
    const chip=document.createElement('div');chip.className='ai-attachment-chip';
    const name=document.createElement('span');name.title=file.name;name.textContent=file.name+' ('+Math.ceil(file.size/1024)+'KB)';
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';
    remove.setAttribute('aria-label',file.name+' 첨부 제거');
    remove.disabled=!!busy||readingAttachment;
    remove.addEventListener('click',()=>{attachments.splice(index,1);renderAttachments();controls();});
    chip.append(name,remove);root.append(chip);
  }
}
function clearAttachments(){attachments=[];$('attach-files').value='';renderAttachments();controls();}
function readAttachment(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('파일을 읽을 수 없습니다.'));
    reader.onerror=()=>reject(Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}
async function queueAttachments(files){
  if(!files.length)return;
  if(busy||preview||readingAttachment||!connected){notice('AI 연결 및 현재 작업 상태를 확인하세요.');return;}
  if(attachments.length+files.length>MAX_ATTACH){notice('첨부 파일은 최대 3개까지 선택할 수 있습니다.');return;}
  let total=attachments.reduce((sum,file)=>sum+file.size,0);
  for(const file of files){
    const ext=file.name.split('.').at(-1).toLowerCase();
    if(!ALLOWED_EXT.has(ext)||!file.name.includes('.')||file.name.length>120){
      notice('지원하지 않는 첨부 형식입니다: '+file.name.slice(0,80));return;
    }
    total+=file.size;
    if(!file.size||file.size>MAX_FILE_BYTES||total>MAX_TOTAL_BYTES){
      notice('첨부는 파일당 6MB, 전체 12MB 이하만 허용합니다.');return;
    }
  }
  readingAttachment=true;controls();notice('파일을 로컬에서 읽는 중…');
  try{
    const added=[];
    for(const file of files)added.push({name:file.name,size:file.size,dataUrl:await readAttachment(file)});
    attachments.push(...added);renderAttachments();notice('첨부 준비 완료 · 전송 버튼을 누르면 AI에 전달됩니다.');
  }catch(e){notice(e.message);}
  finally{readingAttachment=false;renderAttachments();controls();}
}
$('attach').onclick=()=>$('attach-files').click();
$('attach-files').addEventListener('change',()=>{
  const files=Array.from($('attach-files').files||[]);
  $('attach-files').value='';
  void queueAttachments(files);
});
// Clipboard screenshots are normally supplied as image/png via paste.
// Plain-text Ctrl+V is intentionally left to the native textarea.
function clipboardImageFiles(data){
  const imageItems=Array.from(data?.items||[]).filter(item=>item.kind==='file'&&/^image\/(?:png|jpeg|webp)$/i.test(item.type));
  return imageItems.map((item,index)=>{
    const file=item.getAsFile();
    if(!file)return null;
    const mime=item.type.toLowerCase(),ext=mime==='image/jpeg'?'jpg':mime.split('/')[1];
    return new File([file],'clipboard-'+Date.now()+'-'+(index+1)+'.'+ext,{type:mime});
  }).filter(Boolean);
}
document.addEventListener('paste',event=>{
  const files=clipboardImageFiles(event.clipboardData);
  if(!files.length)return;
  const target=event.target;
  // Do not override paste into other editable controls.
  if(target!==$('input')&&(target?.isContentEditable||target?.matches?.('input,textarea,[contenteditable="true"]')))return;
  event.preventDefault();
  if(busy||preview||readingAttachment||!connected){notice('첨부하려면 AI 연결 및 현재 작업 상태를 확인하세요.');return;}
  void queueAttachments(files);
});

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
  const files=attachments.map(({name,dataUrl})=>({name,dataUrl}));
  const displayText=(text||'첨부한 파일을 분석해 주세요.')+(files.length?'\n\n[첨부: '+files.map(f=>f.name).join(', ')+']':'');
  const local=!files.length&&localSetup(text);
  if(local&&!confirm('Fusion 초기 연결을 진행할까요? 누락된 Fusion 플러그인 및 애드인을 설치하고 자동 시작 manifest 설정을 활성화합니다. 필요한 경우 Fusion을 한 번 실행합니다. 기존 폴더와 프로필은 덮어쓰지 않고 실행 중인 Fusion은 종료하거나 재시작하지 않습니다.'))return;
  notice(local?'Fusion 로컬 초기 연결 중 · AI 요청 없음':'응답 요청 중');$('messages').querySelector('.empty')?.remove();addMessage('user',displayText);stream=addMessage('assistant','',local);
  try{const r=check(await api.send({id,model,text,attachments:files,readOnly,editMode,localApproved:local}));history=[r.conversation,...history.filter(c=>c.id!==id)];current=id;$('input').value='';clearAttachments();canUndo=!!r.canUndo;draw();showPreview(r.preview||null);if(r.previewFailure){notice('변경안 준비 실패: '+r.previewFailure);return;}if(r.local){notice('로컬 작업 종료 · AI 요청 0회 · 토큰 0');return;}notice((readOnly?(r.called?'조회 및 응답 완료 · '+r.toolCalls+'회 조회':'응답 완료 · 로컬 조회 없음'):'응답 완료')+' · 요청 '+r.requests+'회'+(r.usage?' · 입력 '+r.usage.input_tokens.toLocaleString()+' / 출력 '+r.usage.output_tokens.toLocaleString()+' 토큰':''));}
  catch(e){stream.textContent+=(stream.textContent?'\n\n':'')+(local?'[미완료 · 일부 로컬 설치 또는 설정은 이미 적용되었을 수 있습니다.]':'[미완료 · 저장하지 않음]');throw e;}
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
    const names={put:'등록',update:'수정',delete:'삭제',copy:'복사',move:'이동',move_source:'이동 원본',add_page:'페이지 추가',folder_page:'덱폴더 페이지 추가',folder_settings:'덱폴더 설정',control:'물리 컨트롤',wide:'와이드 화면',composite:'복합 동작',state_design:'상태별 디자인',plugin:'플러그인 등록',page_structure:'페이지 구조 변경',profile_build:'새 프로필 생성',template_save:'템플릿 저장',template_apply:'템플릿으로 새 프로필 생성'};
    for(const row of value.rows){
      const box=document.createElement('div');box.className='edit-row';
      if(typeof row.previewImage==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(row.previewImage)){
        const img=document.createElement('img');img.alt='변경 후 아이콘';img.src=row.previewImage;box.append(img);
      }
      const body=document.createElement('div'),title=document.createElement('strong'),data=document.createElement('pre');
      title.textContent=(names[row.op]||row.op)+(row.page==null?'':' · 페이지 '+row.page)+(row.folder?' / 폴더 '+row.folder:'')+(row.slot?' / 버튼 '+row.slot:'')+(row.control?' / '+row.control:'')+(row.state?' / '+row.state:'');
      data.textContent='전: '+describeEdit(row.before)+'\n후: '+describeEdit(row.after)+(row.icon?'\n아이콘: '+row.icon:'');
      body.append(title,data);box.append(body);$('edit-rows').append(box);
    }
  }
  controls();
}
$('edit-apply').onclick=()=>run('apply',async()=>{
  if(!preview||!confirm('미리보기의 변경 사항을 적용하고 저장하시겠습니까?'))return;
  const id=preview.id;
  try{
    const r=check(await api.applyEdit(id));canUndo=!!r.canUndo;
    if(r.conversation){history=[r.conversation,...history.filter(c=>c.id!==r.conversation.id)];draw();}
    else if(r.receipt)addMessage('assistant',r.receipt.content,true,true);
    const status=r.saved?(r.refreshError?'설정 저장 완료 · 화면 또는 동기화 확인 필요':'설정 저장 완료 · D200X 동기화 요청'):'변경안 저장 실패: '+r.error;
    notice(status+(r.historySaved===false?' · 대화 기록 저장 실패':''));
  }
  finally{showPreview(null);}
});
$('edit-cancel').onclick=()=>run('apply',async()=>{if(!preview)return;check(await api.discardEdit(preview.id));showPreview(null);notice('변경안 취소 · 저장하지 않음');});
$('edit-undo').onclick=()=>run('undo',async()=>{if(!canUndo||!confirm('최근 AI 변경을 되돌리시겠습니까?'))return;
  const r=check(await api.undoEdit());canUndo=!!r.canUndo;notice(r.refreshError?'복구 저장 완료 · 화면 확인 필요':'최근 AI 변경 되돌리기 완료');});

run('history',async()=>{setChecks(check(await api.preferences()));await status();history=check(await api.history());current=history[0]?.id||null;draw();if(connected){busy='models';controls();await modelList();}});
})();
