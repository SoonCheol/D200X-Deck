'use strict';
const $=id=>document.getElementById(id);
let account=null,kind='iconpack',items=[],cursor='',adminCursor='',busy=false,epoch=0;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=()=>void run(fn);return n;};
function reset(){epoch++;account=null;items=[];cursor='';adminCursor='';for(const id of ['cards','detail','releases','accounts','review'])$(id).replaceChildren();$('detail').hidden=$('review').hidden=true;$('catalog').hidden=$('admin').hidden=$('logout').hidden=true;$('login').hidden=false;$('account').textContent='';}
async function api(path,options={}){
 const headers={'X-DeckForge-CSRF':'1',...options.headers};
 if(options.body&&!(options.body instanceof FormData)){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
 const res=await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store'});
 if(res.status===401){reset();throw Error('로그인이 필요하거나 만료되었습니다.');}
 if(!res.ok)throw Error('요청 실패 (HTTP '+res.status+')');
 return res.status===204?null:res.json();
}
async function run(fn){if(busy)return;busy=true;$('status').textContent='처리 중…';try{await fn();$('status').textContent='완료';}catch(e){$('status').textContent=e.message;}finally{busy=false;}}
function show(a){account=a;$('login').hidden=true;$('catalog').hidden=$('logout').hidden=false;$('admin-toggle').hidden=a.role!=='owner';$('account').textContent=a.username+' · '+(a.role==='owner'?'관리자':'사용자');}
function preview(src){if(typeof src!=='string'||! /^[A-Za-z0-9+/]+={0,2}$/.test(src)||src.length>90000)return el('span','');const img=el('img');img.src='data:image/png;base64,'+src;img.alt='아이콘 미리보기';img.loading='lazy';return img;}
const purposeOptions={general:'일반',ha:'HA · IoT',windows:'Windows · 단축키',fusion:'Fusion · CAD',media:'미디어',app:'프로그램'};
const namingOptions={'general-name':'일반 파일명','ha-name':'HA 형식 추정',state:'ON/OFF 상태 쌍'};
const designOptions={color:'컬러',white:'화이트',black:'블랙',gray:'회색',line:'라인','white-line':'화이트 라인','black-line':'블랙 라인',solid:'솔리드',unknown:'미분류'};
function optionList(select,options,all){
 select.replaceChildren();
 if(all){const option=el('option',all);option.value='';select.append(option);}
 for(const [value,label] of Object.entries(options)){const option=el('option',label);option.value=value;select.append(option);}
}
for(const [id,options,label] of [['purpose',purposeOptions,'전체 용도'],['naming',namingOptions,'전체 네이밍'],['design',designOptions,'전체 디자인']]){
 optionList($(id),options,label);$(id).onchange=render;
}
$('background').onclick=()=>{const light=document.body.classList.toggle('preview-white');$('background').textContent=light?'검정 배경':'흰 배경';};
function render(){
 const q=$('search').value.toLowerCase();$('cards').replaceChildren();
 const filters=kind==='iconpack'?['purpose','naming','design'].map(id=>$(id).value).filter(Boolean):[];
 for(const id of ['purpose','naming','design'])$(id).hidden=kind!=='iconpack';
 for(const item of items.filter(x=>filters.every(tag=>x.tags.includes(tag))&&[x.name,x.author,x.version,...x.tags].some(v=>String(v).toLowerCase().includes(q)))){
  const card=button('',()=>detail(item));card.className='card';
  if(item.cover){const art=el('div',undefined,'art');art.append(preview(item.cover));card.append(art);}
  card.append(el('strong',item.name),el('span',item.version+' · '+(item.visibility==='private'?'비공개':'공개')),el('span',item.tags.join(' · ')));
  $('cards').append(card);
 }
 if(!$('cards').children.length)$('cards').append(el('p','표시할 항목이 없습니다.'));
 $('more').hidden=!cursor;
}
async function load(resetList=true){
 if(resetList){items=[];cursor='';$('detail').hidden=true;$('detail').replaceChildren();}
 const page=await api('/api/v1/catalog?kind='+kind+'&limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
 items=[...new Map([...items,...page.items].map(x=>[x.id,x])).values()];cursor=page.nextCursor;render();
}
async function detail(item){
 const data=await api('/api/v1/items/'+encodeURIComponent(item.id));const i=data.item,section=$('detail');
 section.replaceChildren(el('h2',i.name),el('p',i.version+' · '+i.description),el('p','라이선스: '+i.license),el('p','SHA256: '+i.sha256));
 const grid=el('div',undefined,'preview-grid');for(const p of data.previews)grid.append(preview(p));section.append(grid);
 const a=el('a','원본 다운로드');a.href='/api/v1/items/'+encodeURIComponent(i.id)+'/releases/'+encodeURIComponent(i.releaseId)+'/download';section.append(a);section.hidden=false;
}
async function adminList(resetList=true){
 if(resetList){adminCursor='';$('releases').replaceChildren();$('review').hidden=true;$('review').replaceChildren();}
 const data=await api('/api/v1/admin/items'+(adminCursor?'?cursor='+encodeURIComponent(adminCursor):''));
 for(const r of data.items){
  const i=r.item,card=el('article',undefined,'release');
  card.append(el('strong',i.name+' '+i.version),el('p',r.status+(r.current?' · 현재 게시':'')+' · '+i.source),el('p','항목 ID: '+i.id+' · 릴리스: '+i.releaseId),el('p',i.license));
  const select=el('select');for(const value of ['private','public']){if(value==='public'&&i.source==='third-party')continue;const option=el('option',value==='private'?'비공개':'공개');option.value=value;select.append(option);}
  select.value=i.visibility;
  card.append(button('상세 검토',()=>reviewRelease(i.releaseId)),select,button('검토 후 게시',async()=>{if(!confirm('원본·라이선스·권한을 검토했습니까?'))return;await api('/api/v1/admin/releases/'+i.releaseId+'/publish',{method:'POST',body:{reviewed:true,visibility:select.value}});await adminList();await load();}));
  if(r.current)card.append(button('게시 철회',async()=>{if(!confirm('목록 및 다운로드를 중단합니다. 원본은 보존합니다.'))return;await api('/api/v1/admin/items/'+i.id+'/withdraw',{method:'POST',body:{}});await adminList();await load();}));
  $('releases').append(card);
 }
 adminCursor=data.nextCursor;$('admin-more').hidden=!adminCursor;
 const users=await api('/api/v1/admin/accounts');$('accounts').replaceChildren();
 for(const u of users.accounts){const row=el('div',u.username+' · '+u.role+(u.active?'':' · 비활성'));if(u.role==='user'&&u.active)row.append(button('비활성화',async()=>{if(!confirm('계정과 세션을 비활성화합니까?'))return;await api('/api/v1/admin/accounts/'+u.id+'/disable',{method:'POST',body:{}});await adminList();}));$('accounts').append(row);}
}
function link(label,path){const a=el('a',label);a.href=path;return a;}
async function reviewRelease(releaseId){
 const path='/api/v1/admin/releases/'+encodeURIComponent(releaseId),data=await api(path),i=data.item,section=$('review');
 section.replaceChildren(el('h2',i.name+' '+i.version),el('p',i.description),el('p','SHA256: '+i.sha256),el('p','라이선스: '+i.license),link('검토용 원본 다운로드',path+'/download'));
 const grid=el('div',undefined,'preview-grid');for(const p of data.previews)grid.append(preview(p));section.append(grid);
 if(i.kind==='iconpack'){
  const purpose=el('select');optionList(purpose,purposeOptions);purpose.value=i.tags.find(t=>t in purposeOptions)||'general';
  const naming=el('select');naming.multiple=true;optionList(naming,namingOptions);
  const styles=el('select');styles.multiple=true;optionList(styles,designOptions);
  for(const select of [naming,styles])for(const option of select.options)option.selected=i.tags.includes(option.value);
  section.append(el('p','자동 분류는 표본/파일명 추정입니다. Ctrl/Command를 이용해 여러 값을 선택할 수 있습니다.'),el('label','용도'),purpose,el('label','네이밍'),naming,el('label','디자인'),styles,
   button('분류 저장',async()=>{await api(path+'/classification',{method:'POST',body:{purpose:purpose.value,naming:[...naming.selectedOptions].map(x=>x.value),styles:[...styles.selectedOptions].map(x=>x.value)}});await reviewRelease(releaseId);await load();}));
 }
 if(i.kind==='plugin'&&i.source==='deckforge'&&data.status==='published'){
  section.append(el('p',i.signature?'서명 등록됨 · 공개키 지문 '+i.signature.keyId:'게시자 서명 미등록'),link('오프라인 서명 요청 저장',path+'/signing-request'));
  const file=el('input');file.type='file';file.accept='.json,application/json';
  section.append(file,button('서명 검증 및 등록',async()=>{if(!file.files[0]||file.files[0].size>16384)throw Error('16KiB 이하 서명 JSON을 선택하세요.');const body=JSON.parse(await file.files[0].text());await api(path+'/signature',{method:'POST',body});await reviewRelease(releaseId);await load();}));
 }
 section.hidden=false;section.scrollIntoView({block:'nearest'});
}
function formats(){const form=$('upload'),type=form.elements.kind.value;const list=type==='iconpack'?['streamDeckIconPack','sdIconPack','zip']:['deckforgePlugin','streamDeckPlugin','zip'];$('format').replaceChildren();for(const v of list){const option=el('option',v);option.value=v;$('format').append(option);}}
$('upload').elements.kind.onchange=formats;formats();
$('login').onsubmit=event=>{event.preventDefault();const f=event.target,password=f.elements.password.value,username=f.elements.username.value;f.elements.password.value='';void run(async()=>{const result=await api('/api/v1/auth/login',{method:'POST',body:{username,password,client:'web'}});show(result.account);await load();});};
$('logout').onclick=()=>void run(async()=>{try{await api('/api/v1/auth/logout',{method:'POST',body:{}});}finally{reset();}});
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>void run(async()=>{kind=b.dataset.kind;$('admin').hidden=true;await load();}));
$('search').oninput=render;$('refresh').onclick=()=>void run(()=>load());$('more').onclick=()=>void run(()=>load(false));
$('admin-toggle').onclick=()=>void run(async()=>{$('admin').hidden=!$('admin').hidden;if(!$('admin').hidden)await adminList();});
$('admin-refresh').onclick=()=>void run(()=>adminList());$('admin-more').onclick=()=>void run(()=>adminList(false));
$('upload').onsubmit=event=>{event.preventDefault();const form=event.target;void run(async()=>{await api('/api/v1/admin/items',{method:'POST',body:new FormData(form)});form.reset();formats();await adminList();});};
$('add-account').onsubmit=event=>{event.preventDefault();const form=event.target,data=Object.fromEntries(new FormData(form));form.elements.password.value='';void run(async()=>{await api('/api/v1/admin/accounts',{method:'POST',body:data});form.reset();await adminList();});};
void run(async()=>{const result=await api('/api/v1/me');show(result.account);await load();});
setInterval(()=>{if(account&&!busy){const current=epoch;void api('/api/v1/me').catch(()=>{if(current===epoch)reset();});}},15000);
