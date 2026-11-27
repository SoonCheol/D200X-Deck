'use strict';
const $=id=>document.getElementById(id);
let account=null,kind='iconpack',items=[],cursor='',adminCursor='',busy=false,epoch=0;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=()=>void run(fn);return n;};
function reset(){epoch++;account=null;items=[];cursor='';adminCursor='';for(const id of ['cards','detail','releases','accounts'])$(id).replaceChildren();$('detail').hidden=true;$('catalog').hidden=$('admin').hidden=$('logout').hidden=true;$('login').hidden=false;$('account').textContent='';}
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
function render(){
 const q=$('search').value.toLowerCase();$('cards').replaceChildren();
 for(const item of items.filter(x=>[x.name,x.author,x.version,...x.tags].some(v=>String(v).toLowerCase().includes(q)))){
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
 if(resetList){adminCursor='';$('releases').replaceChildren();}
 const data=await api('/api/v1/admin/items'+(adminCursor?'?cursor='+encodeURIComponent(adminCursor):''));
 for(const r of data.items){
  const i=r.item,card=el('article',undefined,'release');
  card.append(el('strong',i.name+' '+i.version),el('p',r.status+(r.current?' · 현재 게시':'')+' · '+i.source),el('p','항목 ID: '+i.id+' · 릴리스: '+i.releaseId),el('p',i.license));
  const select=el('select');for(const value of ['private','public']){if(value==='public'&&i.source==='third-party')continue;const option=el('option',value==='private'?'비공개':'공개');option.value=value;select.append(option);}
  card.append(select,button('검토 후 게시',async()=>{if(!confirm('원본·라이선스·권한을 검토했습니까?'))return;await api('/api/v1/admin/releases/'+i.releaseId+'/publish',{method:'POST',body:{reviewed:true,visibility:select.value}});await adminList();await load();}));
  if(r.current)card.append(button('게시 철회',async()=>{if(!confirm('목록 및 다운로드를 중단합니다. 원본은 보존합니다.'))return;await api('/api/v1/admin/items/'+i.id+'/withdraw',{method:'POST',body:{}});await adminList();await load();}));
  $('releases').append(card);
 }
 adminCursor=data.nextCursor;$('admin-more').hidden=!adminCursor;
 const users=await api('/api/v1/admin/accounts');$('accounts').replaceChildren();
 for(const u of users.accounts){const row=el('div',u.username+' · '+u.role+(u.active?'':' · 비활성'));if(u.role==='user'&&u.active)row.append(button('비활성화',async()=>{if(!confirm('계정과 세션을 비활성화합니까?'))return;await api('/api/v1/admin/accounts/'+u.id+'/disable',{method:'POST',body:{}});await adminList();}));$('accounts').append(row);}
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
