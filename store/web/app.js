'use strict';
const $=id=>document.getElementById(id);
let account=null,kind='iconpack',items=[],cursor='',adminCursor='',busy=false,epoch=0,catalogParams='',searchTimer=null;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=()=>void run(fn);return n;};
function reset(){clearTimeout(searchTimer);searchTimer=null;catalogParams='';clearFolder();$('upload').reset();formats();epoch++;account=null;items=[];cursor='';adminCursor='';for(const id of ['cards','detail','releases','accounts','review'])$(id).replaceChildren();$('detail').hidden=$('review').hidden=true;$('catalog').hidden=$('admin').hidden=$('logout').hidden=true;$('login').hidden=false;$('account').textContent='';}
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
const platformOptions={unknown:'출처 미확인',deckforge:'DeckForge',ulanzi:'Ulanzi',elgato:'Elgato',generic:'범용'};
const profileOptions={'elgato-icon-index':'Elgato 아이콘팩 규격','indexed-icons':'인덱스형 아이콘팩','raster-images':'범용 래스터 이미지','deckforge-sdk':'DeckForge SDK','elgato-sdk':'Elgato SDK 호환 형식'};
function provenanceLabel(item){
 const platform=Object.hasOwn(platformOptions,item.platform)?platformOptions[item.platform]:platformOptions.unknown;
 const profile=Object.hasOwn(profileOptions,item.packageProfile)?profileOptions[item.packageProfile]:'규격 미확인';
 return '출처: '+platform+(platform===platformOptions.unknown?'':' (등록 정보)')+' · 규격: '+profile;
}
const purposeOptions={general:'일반',ha:'HA · IoT',windows:'Windows · 단축키',fusion:'Fusion · CAD',media:'미디어',app:'프로그램'};
const namingOptions={'general-name':'일반 파일명','ha-name':'HA 형식 추정',state:'ON/OFF 상태 쌍'};
const designOptions={color:'컬러',white:'화이트',black:'블랙',gray:'회색',line:'라인','white-line':'화이트 라인','black-line':'블랙 라인',solid:'솔리드',unknown:'미분류'};
function optionList(select,options,all){
 select.replaceChildren();
 if(all){const option=el('option',all);option.value='';select.append(option);}
 for(const [value,label] of Object.entries(options)){const option=el('option',label);option.value=value;select.append(option);}
}
for(const [id,options,label] of [['purpose',purposeOptions,'전체 용도'],['naming',namingOptions,'전체 네이밍'],['design',designOptions,'전체 디자인']]){
 optionList($(id),options,label);$(id).onchange=queueSearch;
}
optionList($('platform-filter'),platformOptions,'전체 출처');$('platform-filter').onchange=queueSearch;
optionList($('upload-platform'),platformOptions);$('upload-platform').value='unknown';
$('background').onclick=()=>{const light=document.body.classList.toggle('preview-white');$('background').textContent=light?'검정 배경':'흰 배경';};
function render(){
 $('cards').replaceChildren();
 for(const id of ['purpose','naming','design'])$(id).hidden=kind!=='iconpack';
 for(const item of items){
  const card=button('',()=>detail(item));card.className='card';
  if(item.cover){const art=el('div',undefined,'art');art.append(preview(item.cover));card.append(art);}
  card.append(el('strong',item.name),el('span',item.version+' · '+(item.visibility==='private'?'비공개':'공개')),el('span',provenanceLabel(item)),el('span',item.tags.join(' · ')));
  $('cards').append(card);
 }
 if(!$('cards').children.length)$('cards').append(el('p','표시할 항목이 없습니다.'));
 $('more').hidden=!cursor;
}
function requestedCatalog(){
 const params=new URLSearchParams({kind,limit:'20'});
 const q=$('search').value.trim();if(q)params.set('q',q);
 if($('platform-filter').value)params.set('platform',$('platform-filter').value);
 if(kind==='iconpack')for(const id of ['purpose','naming','design'])if($(id).value)params.set(id,$(id).value);
 return params.toString();
}
function queueSearch(){
 clearTimeout(searchTimer);
 const session=epoch;
 const start=()=>{if(session!==epoch||!account)return;if(busy){searchTimer=setTimeout(start,150);return;}searchTimer=null;void run(()=>load());};
 searchTimer=setTimeout(start,250);
}
async function load(resetList=true){
 const query=requestedCatalog();
 if(query!==catalogParams)resetList=true;
 if(resetList){items=[];cursor='';catalogParams=query;$('detail').hidden=true;$('detail').replaceChildren();render();}
 const page=await api('/api/v1/catalog?'+catalogParams+(cursor?'&cursor='+encodeURIComponent(cursor):''));
 if(query!==requestedCatalog()){queueSearch();return;}
 items=[...new Map([...items,...page.items].map(x=>[x.id,x])).values()];cursor=page.nextCursor;render();
}
async function detail(item){
 const data=await api('/api/v1/items/'+encodeURIComponent(item.id));const i=data.item,section=$('detail');
 section.replaceChildren(el('h2',i.name),el('p',i.version+' · '+i.description),el('p',provenanceLabel(i)),el('p','패키지 규격 표시는 구조 확인이며 실제 실행 호환성 인증이 아닙니다.'),el('p','라이선스: '+i.license),el('p','SHA256: '+i.sha256));
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
function prepareVersion(item){
 const form=$('upload');
 if(!confirm('새 버전 등록 양식을 초기화합니까? 기존 등록 파일은 유지됩니다.'))return;
 clearFolder();form.reset();form.elements.kind.value=item.kind;form.elements.source.value=item.source;form.elements.platform.value=item.platform||'unknown';
 $('upload-mode').value='file';formats();form.elements.format.value=item.format;
 form.elements.itemId.value=item.id;form.elements.license.value=item.license;form.elements.description.value=item.description;
 $('pack-name').value=item.name;$('pack-author').value=item.author||'';$('pack-version').value='';
 form.scrollIntoView({block:'start'});form.elements.file.focus();
}
async function versionHistory(item,container,cursor=''){
 const data=await api('/api/v1/admin/items/'+encodeURIComponent(item.id)+'/releases'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
 if(!cursor)container.replaceChildren();
 for(const row of data.releases){
  const line=el('div',undefined,'release');
  line.append(el('strong',row.version),el('p',(row.current?'현재 게시':row.status==='draft'?'검토 대기':'이전 게시')+' · '+row.visibility+(row.signed?' · 서명 있음':'')),el('p','SHA256: '+row.sha256),button('버전 상세',()=>reviewRelease(row.releaseId)));
  container.append(line);
 }
 if(data.nextCursor){const more=button('이전 목록 더 보기',async()=>{await versionHistory(item,container,data.nextCursor);more.remove();});container.append(more);}
}
function link(label,path){const a=el('a',label);a.href=path;return a;}
async function reviewRelease(releaseId){
 const path='/api/v1/admin/releases/'+encodeURIComponent(releaseId),data=await api(path),i=data.item,section=$('review');
 section.replaceChildren(el('h2',i.name+' '+i.version),el('p',i.description),el('p',provenanceLabel(i)),el('p','SHA256: '+i.sha256),el('p','라이선스: '+i.license),link('검토용 원본 다운로드',path+'/download'));
 const grid=el('div',undefined,'preview-grid');for(const p of data.previews)grid.append(preview(p));section.append(grid);
 const description=el('textarea');description.maxLength=1500;description.value=i.description;
 const license=el('input');license.maxLength=300;license.value=i.license;
 const platform=el('select');optionList(platform,platformOptions);platform.value=i.platform||'unknown';
 section.append(el('label','설명'),description,el('label','출처·라이선스'),license,el('label','원본 출처 (관리자 확인)'),platform,
  button('정보 수정 저장',async()=>{if(!license.value.trim())throw Error('출처·라이선스를 입력하세요.');await api(path+'/metadata',{method:'POST',body:{description:description.value,license:license.value,platform:platform.value}});await adminList();await reviewRelease(releaseId);await load();}),
  button('새 버전 등록',()=>prepareVersion(i)),el('h3','버전 이력'));
 const history=el('div');section.append(history);await versionHistory(i,history);
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
const RASTER_EXT=/\.(png|jpe?g|gif|webp)$/i;
const SVG_EXT=/\.svg$/i;
let folderRows=[],folderPage=0,folderBlocked=false,aiSnapshot=null,previewUrls=[];
function revokePreviews(){for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls=[];}
function clearFolder(){revokePreviews();folderRows=[];folderPage=0;folderBlocked=false;aiSnapshot=null;$('folder-picker').value='';$('pack-name').value='';$('pack-version').value='1.0.0';$('pack-author').value='';$('icon-query').value='';$('bulk-tags').value='';$('ai-input').value=$('ai-result').value='';$('folder-status').textContent='';$('icon-rows').replaceChildren();renderFolder();}
function parseTags(text){const values=[...new Set(text.split(',').map(x=>x.trim()).filter(Boolean))];if(values.length>30||values.some(x=>x.length>60||/[\x00-\x1f\x7f]/.test(x)))throw Error('태그는 30개 이하, 각 60자 이하입니다.');return values;}
function mergedTags(old,extra){const tags=[...new Set([...old,...extra])];if(tags.length>30)throw Error('태그는 아이콘당 최대 30개입니다.');return tags;}
function folderMatches(){const q=$('icon-query').value.trim().toLocaleLowerCase();return folderRows.filter(r=>[r.path,...r.tags].some(x=>x.toLocaleLowerCase().includes(q)));}
function renderFolder(){
 revokePreviews();const matches=folderMatches();const pages=Math.max(1,Math.ceil(matches.length/40));folderPage=Math.min(folderPage,pages-1);
 $('icon-rows').replaceChildren();$('icon-page').textContent=(folderPage+1)+' / '+pages+' · '+folderRows.filter(r=>r.selected).length+'개 선택';
 $('icon-prev').disabled=folderPage===0;$('icon-next').disabled=folderPage>=pages-1;
 for(const r of matches.slice(folderPage*40,folderPage*40+40)){
  const row=el('div',undefined,'folder-icon-row'),check=el('input');check.type='checkbox';check.checked=r.selected;check.setAttribute('aria-label',r.path+' 선택');
  check.onchange=()=>{r.selected=check.checked;$('icon-page').textContent=(folderPage+1)+' / '+pages+' · '+folderRows.filter(x=>x.selected).length+'개 선택';};
  let img;
  if(SVG_EXT.test(r.path)){
   img=r.preview?preview(r.preview):button('SVG 미리보기',async()=>{const body=new FormData();body.append('file',r.file,r.path);const result=await api('/api/v1/admin/svg-preview',{method:'POST',body});if(!result.preview)throw Error('SVG 미리보기 생성 실패');r.preview=result.preview;renderFolder();});
  }else{img=el('img');const url=URL.createObjectURL(r.file);previewUrls.push(url);img.src=url;img.alt='';img.loading='lazy';}
  const col=el('div');const tags=el('input');tags.value=r.tags.join(', ');tags.placeholder='검색 태그 (쉼표 구분)';tags.setAttribute('aria-label',r.path+' 검색 태그');
  tags.onchange=()=>{try{r.tags=parseTags(tags.value);}catch(e){$('folder-status').textContent=e.message;}tags.value=r.tags.join(', ');};
  col.append(el('strong',r.path),tags);row.append(check,img,col);$('icon-rows').append(row);
 }
}
$('folder-picker').onchange=()=>{
 revokePreviews();folderRows=[];folderBlocked=false;folderPage=0;aiSnapshot=null;$('ai-input').value=$('ai-result').value='';
 const files=[...$('folder-picker').files],seen=new Set();let skipped=0,svg=0,total=0,root='';
 try{
  for(const file of files){
   const full=file.webkitRelativePath||'',parts=full.split('/');if(parts.length<2)throw Error('폴더 선택 기능을 지원하는 브라우저를 사용하세요.');
   if(!root)root=parts[0];if(parts[0]!==root)throw Error('한 번에 한 폴더만 선택하세요.');
   const path=parts.slice(1).join('/');
   if(SVG_EXT.test(path)){svg++;}else if(!RASTER_EXT.test(path)){skipped++;continue;}
   const stem=parts.at(-1).replace(/\.[^.]+$/,'');
   if(path.length>=490||parts.length>10||parts.slice(1).some(p=>!p||p==='.'||p==='..'||p.length>250||/[:\\\x00-\x1f\x7f]/.test(p))||!stem.trim()||stem.length>100||seen.has(path.toLowerCase()))throw Error('중복 또는 지원되지 않는 파일명: '+path);
   if(!file.size||file.size>(SVG_EXT.test(path)?256*1024:6*1024*1024))throw Error('개별 이미지 크기 제한: '+path);
   seen.add(path.toLowerCase());total+=file.size;folderRows.push({file,path,tags:[],selected:false});
  }
  if(svg>500||folderRows.length+svg+2>2530)throw Error('SVG 최대 500개, 원본 포함 압축 항목 2530개 제한');
  if(!folderRows.length||folderRows.length>2500||total>58*1024*1024)throw Error('이미지 1~2500개, 원본 합계 58MiB 이하로 선택하세요.');
  folderRows.sort((a,b)=>a.path.localeCompare(b.path));$('pack-name').value=root.slice(0,120);
  $('folder-status').textContent=folderRows.length+'개 이미지 · '+(total/1024/1024).toFixed(2)+' MiB'+(svg?' · SVG '+svg+'개 (서버 PNG 변환)':'')+(skipped?' · 이미지 외 파일 '+skipped+'개 제외':'');
 }catch(e){folderRows=[];folderBlocked=true;$('folder-status').textContent=e.message;}
 renderFolder();
};
$('icon-query').oninput=()=>{folderPage=0;renderFolder();};$('icon-prev').onclick=()=>{folderPage--;renderFolder();};$('icon-next').onclick=()=>{folderPage++;renderFolder();};
$('select-icons').onclick=()=>{for(const r of folderMatches())r.selected=true;renderFolder();};$('clear-icons').onclick=()=>{for(const r of folderRows)r.selected=false;renderFolder();};
function bulk(remove){try{const values=parseTags($('bulk-tags').value),selected=folderRows.filter(r=>r.selected);if(!selected.length||!values.length)throw Error('아이콘과 태그를 선택하세요.');const changes=selected.map(r=>remove?r.tags.filter(t=>!values.includes(t)):mergedTags(r.tags,values));selected.forEach((r,i)=>r.tags=changes[i]);renderFolder();}catch(e){$('folder-status').textContent=e.message;}}
$('add-tags').onclick=()=>bulk(false);$('remove-tags').onclick=()=>bulk(true);
$('ai-prompt').onclick=()=>{
 const selected=folderRows.filter(r=>r.selected);
 if(!selected.length||selected.length>100){$('folder-status').textContent='AI 태그는 한 번에 1~100개를 선택하세요.';return;}
 aiSnapshot=selected.map((r,id)=>({id,row:r}));
 $('ai-input').value='다음 파일명의 의미가 명확한 아이콘에만 한국어 검색 태그를 제안하세요. 모호하면 빈 배열. 파일명은 변경하지 마세요. JSON 배열만 반환: [{"id":0,"tags":["태그"]}]. 각 항목 최대 10개 태그, 태그 최대 60자. 입력 데이터:\n'+JSON.stringify(aiSnapshot.map(x=>({id:x.id,name:x.row.path.split('/').at(-1).replace(/\.[^.]+$/,'')})));
 $('ai-result').value='';
};
$('ai-apply').onclick=()=>{
 try{
  if(!aiSnapshot||$('ai-result').value.length>100000)throw Error('먼저 프롬프트를 생성하세요.');
  const data=JSON.parse($('ai-result').value),seen=new Set();
  if(!Array.isArray(data)||data.length>aiSnapshot.length)throw Error('JSON 배열을 확인하세요.');
  const changes=data.map(x=>{
   if(!x||!Number.isInteger(x.id)||!aiSnapshot[x.id]||seen.has(x.id)||!Array.isArray(x.tags)||x.tags.length>10||x.tags.some(v=>typeof v!=='string'||!v.trim()||v.length>60||/[,\x00-\x1f\x7f]/.test(v)))throw Error('ID 및 태그 형식 오류');
   seen.add(x.id);const row=aiSnapshot[x.id].row;return {row,tags:mergedTags(row.tags,x.tags.map(v=>v.trim()))};
  });
  if(!confirm(changes.length+'개 아이콘에 제안 태그를 추가합니까? 원본 태그는 유지됩니다.'))return;
  for(const x of changes)x.row.tags=x.tags;
  aiSnapshot=null;$('ai-input').value=$('ai-result').value='';renderFolder();
 }catch(e){$('folder-status').textContent=e.message;}
};
function formats(){
 const form=$('upload'),type=form.elements.kind.value;
 if(type!=='iconpack')$('upload-mode').value='file';
 $('upload-mode-label').hidden=type!=='iconpack';
 const folder=type==='iconpack'&&$('upload-mode').value==='folder';
 $('file-mode').hidden=folder;$('folder-mode').hidden=!folder;
 form.elements.file.required=!folder;form.elements.file.disabled=folder;
 $('folder-picker').required=folder;$('folder-picker').disabled=!folder;
 $('pack-name').required=folder;$('pack-version').required=folder;
 $('pack-name').disabled=$('pack-version').disabled=$('pack-author').disabled=!folder;
 const list=type==='iconpack'?['streamDeckIconPack','sdIconPack','zip']:['deckforgePlugin','streamDeckPlugin','zip'];$('format').replaceChildren();
 for(const v of list){const option=el('option',v);option.value=v;$('format').append(option);}
}
$('upload').elements.kind.onchange=formats;$('upload-mode').onchange=formats;formats();
$('login').onsubmit=event=>{event.preventDefault();const f=event.target,password=f.elements.password.value,username=f.elements.username.value;f.elements.password.value='';void run(async()=>{const result=await api('/api/v1/auth/login',{method:'POST',body:{username,password,client:'web'}});show(result.account);await load();});};
$('logout').onclick=()=>void run(async()=>{try{await api('/api/v1/auth/logout',{method:'POST',body:{}});}finally{reset();}});
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>void run(async()=>{kind=b.dataset.kind;$('admin').hidden=true;await load();}));
$('search').oninput=queueSearch;$('refresh').onclick=()=>void run(()=>load());$('more').onclick=()=>void run(()=>load(false));
$('admin-toggle').onclick=()=>void run(async()=>{$('admin').hidden=!$('admin').hidden;if(!$('admin').hidden)await adminList();});
$('admin-refresh').onclick=()=>void run(()=>adminList());$('admin-more').onclick=()=>void run(()=>adminList(false));
$('upload').onsubmit=event=>{
 event.preventDefault();const form=event.target;
 void run(async()=>{
  if($('upload-mode').value==='folder'&&form.elements.kind.value==='iconpack'){
   if(folderBlocked||!folderRows.length)throw Error('유효한 아이콘 폴더를 선택하세요.');
   const metadata={name:$('pack-name').value.trim(),version:$('pack-version').value.trim(),author:$('pack-author').value.trim(),icons:folderRows.map(r=>({path:r.path,tags:r.tags}))};
   const blob=new Blob([JSON.stringify(metadata)],{type:'application/json'});if(blob.size>1024*1024)throw Error('아이콘 메타데이터 크기 초과');
   const body=new FormData();for(const field of ['source','platform','license','description','itemId'])body.append(field,form.elements[field].value);
   body.append('metadata',blob,'metadata.json');for(const r of folderRows)body.append('icons',r.file,r.path);
   const result=await api('/api/v1/admin/folder-pack',{method:'POST',body});
   clearFolder();form.reset();formats();await adminList();await reviewRelease(result.item.releaseId);
  }else{await api('/api/v1/admin/items',{method:'POST',body:new FormData(form)});clearFolder();form.reset();formats();await adminList();}
 });
};
$('add-account').onsubmit=event=>{event.preventDefault();const form=event.target,data=Object.fromEntries(new FormData(form));form.elements.password.value='';void run(async()=>{await api('/api/v1/admin/accounts',{method:'POST',body:data});form.reset();await adminList();});};
void run(async()=>{const result=await api('/api/v1/me');show(result.account);await load();});
setInterval(()=>{if(account&&!busy){const current=epoch;void api('/api/v1/me').catch(()=>{if(current===epoch)reset();});}},15000);
