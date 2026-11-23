'use strict';
const FORMAT='d200x-fusion-batch-v1',PROJECT='fusion-command-manager-project-v1';
const PLUGIN='com.autodesk.fusionstreamdeck',ACTION=PLUGIN+'.runcommand';
const MAXP=128,PER=13;
const $=id=>document.getElementById(id);
let commands=[],pages=[],drag=null,context=null,capturedUI=null,visibilityOverrides={},englishOverlay=null;
const Curation=window.FusionCuration,MenuTree=window.FusionMenuTree,FusionDrag=window.DeckForgeFusionDrag;
let explorerArea='',explorerPanel='',explorerItems=[],menuTreeCache=null,menuCatalog=null,displayLanguage='ko';
const iconCache=new Map(),iconPending=new Set();
const automaticIconAttempts=new Set();
let automaticIconBusy=false,automaticIconCheck=0,automaticIconConnected=false;
async function collectVisibleFusionIconsAutomatically(){
 if(automaticIconBusy||!explorerItems.length)return;
 const missing=explorerItems.slice(0,240).filter(v=>iconCache.get(v.id)==null&&!automaticIconAttempts.has(v.id));
 if(!missing.length)return;
 automaticIconBusy=true;
 try{
  if(Date.now()-automaticIconCheck>15000){
   const health=await window.fusionManager.iconHealth().catch(()=>null);
   automaticIconConnected=health?.available===true;automaticIconCheck=Date.now();
  }
  if(!automaticIconConnected)return;
  let position=0,changed=false;
  const worker=async()=>{
   while(position<missing.length){
    const id=missing[position++].id;automaticIconAttempts.add(id);
    try{
     const result=await window.fusionManager.collectIcon(id);
     if(result?.data){iconCache.set(id,result.data);changed=true}
    }catch{/* Fusion connection may change; manual collection remains available. */}
   }
  };
  await Promise.all(Array.from({length:Math.min(2,missing.length)},worker));
  if(changed)renderExplorer();
 }finally{automaticIconBusy=false}
}

const byId=()=>new Map(commands.map(v=>[v.id,v]));
const empty=()=>({name:'새 페이지',enabled:true,reserved:[],slots:Array(PER).fill(null)});
const status=s=>$('status').textContent=s;
function normalizeCatalogue(source){
 let arr=Array.isArray(source)?source:(source.commands||source.items||source.catalogue||source.catalog||[]);
 if(!Array.isArray(arr))arr=Object.values(arr).filter(x=>x&&typeof x==='object');
 const seen=new Set();
 return arr.map(v=>({id:String(v.id||v.commandId||v.command_id||''),name:String(v.name||v.label||v.title||v.id||''),
  ko:String(v.koName||v.koreanName||v.nameKo||v.name_ko||( /[가-힣]/.test(String(v.name||''))?v.name:'' )||''),
  en:String(v.englishName||v.nameEn||v.name_en||v.enName||(!/[가-힣]/.test(String(v.name||''))?v.name:'')||''),
  category:String(v.category||''),paths:Array.isArray(v.paths)?v.paths:[],
  path:JSON.stringify(v.paths||v.path||v.category||v.workspace||'')}))
 .filter(v=>v.id&&v.name&&v.id.length<=256&&v.name.length<=160&&!seen.has(v.id)&&seen.add(v.id));
}
function applyEnglishNames(){
 const names=englishOverlay?.commands||{};
 for(const v of commands)v.en=names[v.id]||v.en||'';
 const covered=commands.filter(v=>names[v.id]).length;
 $('englishStatus').textContent=englishOverlay
  ?'영문 명령 '+Object.keys(names).length+'개 내장/저장 · 카탈로그 일치 '+covered+'개 · 메뉴명 '+(englishOverlay.stats?.menuLabels??0)+'개'
  :'영문명 미수집';
}
function displayCommand(v){return MenuTree.localizedCommand(v,displayLanguage)}
function displayMenu(item,kind){return MenuTree.localizedLabel(item,kind,displayLanguage,englishOverlay)}
function updateDisplayLanguageControls(){
 if(displayLanguage==='en'&&!englishOverlay)displayLanguage='ko';
 for(const [id,lang] of [['exploreKorean','ko'],['exploreEnglish','en']]){
  const button=$(id),selected=displayLanguage===lang;
  button.classList.toggle('active',selected);
  button.setAttribute('aria-pressed',String(selected));
 }
 $('exploreEnglish').disabled=!englishOverlay;
 $('exploreEnglish').title=englishOverlay?'영문 메뉴·명령 이름 표시':'영문명 JSON을 먼저 불러오세요';
}
function selectDisplayLanguage(lang){
 if(lang==='en'&&!englishOverlay)return;
 if(!['ko','en'].includes(lang)||displayLanguage===lang)return;
 displayLanguage=lang;
 updateDisplayLanguageControls();
 render();
 void window.fusionManager.saveDisplayLanguage(lang).catch(e=>status('표시 언어 저장 실패: '+e.message));
}
// Keep the original compact window; only long labels receive a smaller font.
function fitMenuLabels(){
 const context=document.createElement('canvas').getContext('2d');
 if(!context)return;
 for(const label of document.querySelectorAll('.menu-tabs .menu-tab-label')){
  const button=label.parentElement,style=getComputedStyle(button);
  const available=button.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  if(available<=0)continue;
  const measure=(size,value)=>{
   context.font=style.fontWeight+' '+size+'px '+style.fontFamily;
   return context.measureText(value).width;
  };
  const name=label.textContent;
  const compact=measure(13,name)>available;
  label.classList.toggle('compact',compact);
  label.classList.toggle('compact-word',compact&&name.split(/\s+/).some(word=>measure(11,word)>available));
 }
}
document.fonts?.ready.then(fitMenuLabels);
function category(v){
 const t=(v.name+' '+v.id+' '+v.path).toLowerCase();
 if(/sketch|스케치/.test(t))return 'sketch';
 if(/solid|솔리드|model|모델링/.test(t))return 'solid';
 if(/surface|서피스|patch/.test(t))return 'surface';
 if(/file|save|open|export|import|저장|열기|파일/.test(t))return 'file';
 return 'other';
}
function makePagesFromCatalog(type){
 const mode=$('visibility').value;
 const items=Curation.visibleItems(commands,mode,capturedUI,visibilityOverrides)
  .filter(v=>type==='all'||category(v)===type)
  .sort((a,b)=>Curation.sortByPlacement(a,b,capturedUI));
 if(!items.length){status('이 범주의 카탈로그 명령이 없습니다.');return;}
 if(items.length>MAXP*PER){status('명령 '+items.length+'개는 최대 '+(MAXP*PER)+'개 슬롯을 초과합니다. 목록 범주를 좁혀 자동 배치하세요. 기존 페이지는 유지됩니다.');return;}
 const count=Math.max(1,Math.ceil(items.length/PER));
 const used=Math.min(count+1,MAXP);
 pages=Array.from({length:used},(_,p)=>({name:(type==='all'?'전체':({sketch:'스케치',solid:'솔리드',surface:'서피스',file:'파일',other:'기타'}[type]))+' '+(p+1),
  enabled:p<count,reserved:[],slots:Array.from({length:PER},(_,i)=>items[p*PER+i]?.id||null)}));
 render();status('추천 배치: '+items.length+'명령 · '+pages.length+'페이지');
}
function usedIds(){return new Set(pages.flatMap(p=>p.slots.filter(Boolean)))}
function slots(){return pages.flatMap((p,pi)=>p.slots.map((id,i)=>({p:pi,i,id,reserved:p.reserved.includes(i)})))}
function insertAt(source,dest){
 if(!dest||dest.reserved)return;
 const all=slots();
 const src=all.find(x=>x.p===source.p&&x.i===source.i);
 if(!src||!src.id||src.p===dest.p&&src.i===dest.i)return;
 const pool=all.filter(x=>!x.reserved).map(x=>x.id).filter(Boolean);
 const from=pool.indexOf(src.id);if(from<0)return;
 pool.splice(from,1);
 const eligible=all.filter(x=>!x.reserved);
 const target=eligible.findIndex(x=>x.p===dest.p&&x.i===dest.i);
 pool.splice(Math.min(target,pool.length),0,src.id);
 for(const x of eligible){pages[x.p].slots[x.i]=pool.shift()||null}
 render();
}
function reserve(pi,i){
 const p=pages[pi],was=p.reserved.includes(i);
 if(was){p.reserved=p.reserved.filter(v=>v!==i);render();return}
 const id=p.slots[i];p.slots[i]=null;p.reserved.push(i);
 if(id){
  const items=slots().filter(x=>!x.reserved&&!(x.p===pi&&x.i===i)).map(x=>x.id).filter(Boolean);
  const dest=slots().filter(x=>!x.reserved);
  const index=dest.findIndex(x=>x.p>pi||(x.p===pi&&x.i>i));
  items.splice(index<0?items.length:index,0,id);
  if(items.length>dest.length){
   if(pages.length<MAXP){pages.push(empty());dest.push(...slots().filter(x=>x.p===pages.length-1&&!x.reserved))}
   else{p.slots[i]=id;p.reserved=p.reserved.filter(x=>x!==i);status('최대 페이지 제한으로 예약할 수 없습니다.');render();return}
  }
  for(const d of dest)pages[d.p].slots[d.i]=items.shift()||null;
 }
 render();
}
function requestIcon(id,el,v){
 if(!id||iconPending.has(id))return;
 if(iconCache.has(id)){const cached=iconCache.get(id);if(cached)setArt(el,cached);return}
 iconPending.add(id);
 window.fusionManager.icon(id).then(data=>{
  if(data)iconCache.set(id,data);
  else if(!iconCache.has(id))iconCache.set(id,null);
  if(data&&el.isConnected)setArt(el,data);
 }).catch(()=>{if(!iconCache.has(id))iconCache.set(id,null)}).finally(()=>iconPending.delete(id));
}
function setArt(el,src){
 const symbol=el.querySelector('.cmd-art-missing');
 if(!symbol||!src)return;
 const img=document.createElement('img');img.className='cmd-art';img.alt='';img.draggable=false;img.src=src;symbol.replaceWith(img);
}
let hoverTimer=null;
function hideTooltip(){clearTimeout(hoverTimer);$('tooltip').style.display='none'}
function showTooltip(event,v,nameNode){
 hideTooltip();
 if(!v||!nameNode)return;
 // Only truncated names need a tooltip. Text is always exactly two lines.
 if(nameNode.scrollHeight<=nameNode.clientHeight+1&&nameNode.scrollWidth<=nameNode.clientWidth+1)return;
 const ko=v.ko||(/[가-힣]/.test(v.name)?v.name:'한글 이름 정보 없음');
 const en=v.en||'영문명 정보 없음';
 const rect=event.currentTarget.getBoundingClientRect();
 hoverTimer=setTimeout(()=>{
  const tip=$('tooltip');tip.textContent=ko+'\n'+en;tip.style.display='block';
  tip.style.left=Math.max(8,Math.min(rect.left,innerWidth-tip.offsetWidth-8))+'px';
  tip.style.top=(rect.bottom+tip.offsetHeight+8<innerHeight?rect.bottom+5:Math.max(8,rect.top-tip.offsetHeight-5))+'px';
 },500);
}
function showDetail(v){
 hideTooltip();const dl=$('detailFields');dl.replaceChildren();
 $('detailTitle').textContent=displayCommand(v);
 for(const [label,value] of [['명령 ID',v.id],['영문명',v.en||'정보 없음'],['한글명',v.ko||'정보 없음'],['작업 영역',category(v)]]){
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=value;dl.append(dt,dd);
 }
 const pathLabel=document.createElement('dt'),pathValue=document.createElement('dd');
 pathLabel.textContent='메뉴·툴바 경로';
 const paths=MenuTree.bilingualPaths(v,capturedUI,englishOverlay);
 if(!paths.length)pathValue.textContent='정보 없음';
 for(const entry of paths){
  const group=document.createElement('div');group.className='detail-path';
  for(const [language,value] of [['한국어',entry.ko],['English',entry.en]]){
   const label=document.createElement('small'),line=document.createElement('div');
   label.textContent=language;line.textContent=value;group.append(label,line);
  }
  pathValue.append(group);
 }
 dl.append(pathLabel,pathValue);
 const nameKey=String(v.ko||v.name||'').trim();
 const similar=commands.filter(other=>other.id!==v.id&&String(other.ko||other.name||'').trim()===nameKey);
 if(similar.length){
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent='동일 이름 ID';
  dd.textContent=similar.map(item=>item.id).join(', ')+' (서로 다른 명령 ID, 기능 동일 여부 미확인)';
  dl.append(dt,dd);
 }
 const dt=document.createElement('dt'),dd=document.createElement('dd'),select=document.createElement('select');
 dt.textContent='목록 표시';
 const opts=[['auto','자동 분류'],['primary','기본 표시'],['review','검토 대상'],['hidden','숨김 대상']];
 for(const [value,title] of opts){
  const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option)
 }
 select.value=visibilityOverrides[v.id]||'auto';
 select.onchange=async()=>{
  const prev={...visibilityOverrides};
  if(select.value==='auto')delete visibilityOverrides[v.id];else visibilityOverrides[v.id]=select.value;
  try{await window.fusionManager.saveVisibility(visibilityOverrides);menuTreeCache=null;render();}
  catch(e){visibilityOverrides=prev;select.value=prev[v.id]||'auto';status('분류 저장 실패: '+e.message)}
 };
 dd.append(select);dl.append(dt,dd);
 const checker=document.createElement('button');checker.type='button';
 checker.textContent='현재 Fusion에서 명령 ID 확인';
 const output=document.createElement('span');output.className='hint';output.style.display='block';
 checker.onclick=async()=>{
   checker.disabled=true;output.textContent='Fusion 명령 정의 조회 중…';
   try{
     const result=await window.fusionManager.commandStatus(v.id);
     output.textContent=result.state==='registered'
       ?'현재 Fusion에 등록된 ID입니다. 실행 가능 여부는 작업 상태에 따라 다릅니다. ('+(result.name||v.id)+')'
       :result.state==='missing'
        ?'현재 Fusion의 명령 정의 목록에 이 ID가 없습니다. 스케치 편집 모드/작업 영역을 전환해 다시 확인하세요.'
        :'확인 실패: '+(result.message||result.state);
   }catch(e){output.textContent='확인 실패: '+e.message}
   finally{checker.disabled=false}
 };
 const checkRow=document.createElement('dd');checkRow.style.gridColumn='1 / -1';checkRow.append(checker,output);dl.append(checkRow);
 $('detail').style.display='block';
}
$('detailClose').onclick=()=>$('detail').style.display='none';
function displayHelpMarkdown(markdown){
 const box=$('helpContent');box.replaceChildren();let list=null;
 for(const source of String(markdown).split(/\r?\n/)){
  const line=source.trim();
  if(!line){list=null;continue}
  const head=/^(#{1,3})\s+(.+)$/.exec(line);
  if(head){const h=document.createElement('h'+Math.min(head[1].length+1,3));h.textContent=head[2];box.append(h);list=null;continue}
  const bullet=/^[-*]\s+(.+)$/.exec(line),numbered=/^\d+\.\s+(.+)$/.exec(line);
  if(bullet||numbered){const tag=numbered?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=document.createElement(tag);box.append(list)}const li=document.createElement('li');li.textContent=(bullet||numbered)[1];list.append(li);continue}
  const p=document.createElement('p');p.textContent=line;box.append(p);list=null;
 }
}
async function openManagerHelp(section){
 try{
  const raw=await window.fusionManager.helpMarkdown();
  const from=section?'## '+section:-1;
  const start=section?raw.indexOf(from):-1;
  const until=start>=0?raw.indexOf('\n## ',start+4):-1;
  displayHelpMarkdown(start>=0?raw.slice(start,until>=0?until:undefined):raw);
  $('scriptActions').style.display=section==='Fusion UI JSON 불러오기'?'flex':'none';
  $('scriptText').hidden=true;
  $('helpDialog').showModal();
 }catch(e){status('도움말 파일을 읽을 수 없습니다: '+e.message)}
}
$('helpOpen').onclick=()=>openManagerHelp();
$('captureHelp').onclick=()=>openManagerHelp('Fusion UI JSON 불러오기');
$('iconsHelp').onclick=()=>openManagerHelp('현재 목록 원본 아이콘 수집');
$('scriptShow').onclick=async()=>{
 try{$('scriptText').value=await window.fusionManager.fusionScript();$('scriptText').hidden=false;}
 catch(e){status('수집기 코드를 읽을 수 없습니다: '+e.message)}
};
$('scriptCopy').onclick=async()=>{
 try{await window.fusionManager.copyFusionScript();status('Fusion UI Python 수집기 코드 복사 완료');}
 catch(e){status('수집기 코드 복사 실패: '+e.message)}
};
$('helpClose').onclick=()=>$('helpDialog').close();
window.fusionManager.dock('status').then(state=>{if(state.available)$('dockToggle').textContent=state.enabled?'자석 켜짐':'자석 꺼짐';}).catch(()=>{});
$('deckforgeOpen').onclick=async()=>{try{if(!await window.fusionManager.openDeckForge())status('설치된 DeckForge를 찾지 못했습니다.')}catch(e){status('DeckForge 실행 실패: '+e.message)}};
$('dockToggle').onclick=async()=>{
 try{const result=await window.fusionManager.dock('toggle');
  if(!result.available){status('자석 기능은 DeckForge 통합 설치에서 사용 가능합니다.');return}
  $('dockToggle').textContent=result.enabled?'자석 켜짐':'자석 꺼짐';
  // The button itself is the only magnet state indicator.
 }catch(e){status('자석 설정 오류: '+e.message)}
};



function renderExplorer(){
 if(!commands.length)return;
 if(!menuTreeCache){
   if(menuCatalog)menuTreeCache=MenuTree.fromMenuCatalog(menuCatalog,commands);
   else{
    const eligible=commands.filter(v=>Curation.captureClassify(v,capturedUI)!=='hidden'||visibilityOverrides[v.id]==='primary'||visibilityOverrides[v.id]==='review');
    menuTreeCache=MenuTree.structure(eligible,capturedUI);
   }
 }
 const groups=menuTreeCache;
 if(!groups.length)return;
 const areas=menuCatalog?groups:[...groups].sort((a,b)=>{
   const order=['스케치','솔리드','곡면','메쉬','판금'];
   const i=order.indexOf(a.name),j=order.indexOf(b.name);
   return (i<0?999:i)-(j<0?999:j)||a.name.localeCompare(b.name,'ko');
 });
 if(!areas.some(a=>a.key===explorerArea)){
   explorerArea=(menuCatalog?areas[0]:(areas.find(a=>a.name==='솔리드')||areas[0])).key;
   explorerPanel='';
 }
 const area=areas.find(a=>a.key===explorerArea);
 const fillTabs=(target,items,selected,onSelect)=>{
   target.replaceChildren();
   for(const item of items){
     const btn=document.createElement('button');btn.type='button';
     const name=displayMenu(item,target.id==='workspaces'?(menuCatalog?'tab':'workspace'):'panel');
     const label=document.createElement('span');label.className='menu-tab-label';label.textContent=name;
     btn.append(label);btn.title=name;btn.setAttribute('aria-label',name);btn.className=item.key===selected?'active':'';
     btn.onclick=()=>onSelect(item.key);target.append(btn);
   }
 };
 fillTabs($('workspaces'),areas,explorerArea,key=>{explorerArea=key;explorerPanel='';renderExplorer()});
 const panels=menuCatalog?[...area.children.values()]:[...area.children.values()].sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name,'ko'));
 if(!panels.some(x=>x.key===explorerPanel)){explorerPanel=(menuCatalog?panels[0]:(panels.find(x=>x.name==='작성')||panels[0]))?.key||''}
 fillTabs($('menus'),panels,explorerPanel,key=>{explorerPanel=key;renderExplorer()});
 fitMenuLabels();
 const panel=area.children.get(explorerPanel);
 if(!panel)return;
 // All commands under the selected panel are already expanded in captured Fusion order.
 const node=panel;
 const search=$('exploreSearch').value.trim().toLowerCase();
 // Search across the complete catalog; no longer restricted by the current tab.
 const list=search
   ?commands.filter(v=>v.id.toLowerCase().includes(search)||v.name.toLowerCase().includes(search)||(v.en||'').toLowerCase().includes(search))
   :MenuTree.descendants(node);
 const unique=new Map(list.map(v=>[v.id,v]));
 explorerItems=menuCatalog&&!search?[...unique.values()]:[...unique.values()].sort((a,b)=>Curation.sortByPlacement(a,b,capturedUI));
 $('explorePath').textContent=search?'전체 명령 검색':displayMenu(area,menuCatalog?'tab':'workspace')+' / '+displayMenu(panel,'panel');
 $('exploreCount').textContent=explorerItems.length+'개';
 const target=$('exploreCommands');target.replaceChildren();
 // Keep the compact browser responsive with large catalogs.
 for(const v of explorerItems.slice(0,240)){
   const card=document.createElement('div');card.className='command-card';
   card.draggable=true;card.tabIndex=0;card.setAttribute('role','button');
   card.setAttribute('aria-label',displayCommand(v)+' 명령, 드래그하여 등록');
   const art=document.createElement('span');art.className='cmd-art-missing';art.textContent='원본';card.append(art);
   const name=document.createElement('span');name.className='cmd-name';name.textContent=displayCommand(v);card.append(name);
   requestIcon(v.id,card,v);
   const info=document.createElement('button');info.type='button';info.textContent='ⓘ';
   info.className='info-button';info.draggable=false;info.title='명령 상세 정보';
   info.onclick=e=>{e.stopPropagation();showDetail(v)};
   info.onmousedown=e=>e.stopPropagation();
   card.append(info);
   card.addEventListener('mouseenter',e=>showTooltip(e,v,name));
   card.addEventListener('mouseleave',hideTooltip);
   card.onclick=()=>{showDetail(v)};
   card.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();showDetail(v)}};
   card.ondragstart=e=>{
     hideTooltip();drag=null;
     const art=iconCache.get(v.id)||null;
      const payload=FusionDrag.encode({id:v.id,name:v.ko||v.name,
        png:art?.startsWith('data:image/png;')?art:null,svg:art?.startsWith('data:image/svg+xml;')?art:null});
     e.dataTransfer.setData('text/plain',payload);
     e.dataTransfer.setData('application/x-deckforge-fusion-command',payload);
     e.dataTransfer.effectAllowed='copyMove';
   };
   target.append(card);
 }
 // An active Fusion add-in can provide licensed original icons on demand.
 // Cache locally; never embed Autodesk icon artwork in the installer.
 void collectVisibleFusionIconsAutomatically();
 if(explorerItems.length>240)$('exploreStatus').textContent='명령 '+explorerItems.length+'개 중 처음 240개 표시 · 검색어로 범위를 좁히세요.';
 else $('exploreStatus').textContent='';
}
function render(){
 renderPages();
 renderExplorer();
}
function renderPages(){
 const root=$('pages');root.replaceChildren();
 pages.forEach((p,pi)=>{
  const panel=document.createElement('section');panel.className='page';
  const head=document.createElement('div');head.className='pageHead';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=p.enabled;checkbox.title='DeckForge 등록 대상';checkbox.onchange=()=>p.enabled=checkbox.checked;
  const title=document.createElement('input');title.type='text';title.value=p.name;title.maxLength=60;title.oninput=()=>p.name=title.value;
  const deleteBtn=document.createElement('button');deleteBtn.textContent='페이지 삭제';deleteBtn.onclick=()=>{if(pages.length<=1)return; if(p.slots.some(Boolean)&&!confirm('명령이 포함된 페이지를 삭제할까요?'))return;pages.splice(pi,1);render()};
  const label=document.createElement('label');label.append(checkbox,document.createTextNode(' 등록 '));head.append(label,title,deleteBtn);panel.append(head);
  for(let row=0;row<3;row++){
   const rowNode=document.createElement('div');rowNode.className='buttonRow';
   for(let col=0;col<(row===2?3:5);col++){
    const i=row*5+col,el=document.createElement('div'),id=p.slots[i],v=commands.find(x=>x.id===id);
    el.className='slot'+(p.reserved.includes(i)?' reserved':id?'':' empty');
    const number=document.createElement('small');number.textContent=String(i+1);el.append(number);
    if(p.reserved.includes(i)){
      const symbol=document.createElement('span');symbol.className='cmd-symbol';symbol.textContent='🔒';el.append(symbol);
      const label=document.createElement('span');label.className='cmd-name';label.textContent='예약';el.append(label);
    }else if(id){
      const art=document.createElement('span');art.className='cmd-art-missing';art.textContent='원본 아이콘 없음';el.append(art);
      const label=document.createElement('span');label.className='cmd-name';label.textContent=v?displayCommand(v):id;el.append(label);
      requestIcon(id,el,v);
      el.addEventListener('mouseenter',event=>showTooltip(event,v||{id,name:id},label));
      el.addEventListener('mouseleave',hideTooltip);
      const info=document.createElement('button');info.type='button';info.className='info-button';info.textContent='ⓘ';
      info.setAttribute('aria-label','명령 상세 정보');info.title='상세 정보';info.draggable=false;
      info.addEventListener('mousedown',event=>event.stopPropagation());
      info.addEventListener('click',event=>{event.stopPropagation();showDetail(v||{id,name:id,path:''})});
      el.append(info);
    }else{
      const plus=document.createElement('span');plus.className='cmd-symbol';plus.textContent='＋';el.append(plus);
      const label=document.createElement('span');label.className='cmd-name';label.textContent='빈 슬롯';el.append(label);
    }
    if(id&&!p.reserved.includes(i)){el.draggable=true;el.ondragstart=e=>{if(e.target.closest?.('.info-button')){e.preventDefault();return;}hideTooltip();drag={p:pi,i};e.dataTransfer.effectAllowed='move';el.classList.add('dragging')};el.ondragend=()=>el.classList.remove('dragging')}
    el.ondragover=e=>{if(!p.reserved.includes(i)&&(drag||e.dataTransfer.types.includes('text/plain'))){e.preventDefault();el.classList.add('over')}};
    el.ondragleave=()=>el.classList.remove('over');
    el.ondrop=e=>{
      if(p.reserved.includes(i))return;
      e.preventDefault();el.classList.remove('over');
      if(drag){insertAt(drag,{p:pi,i});drag=null;return}
      const imported=FusionDrag.decode(e.dataTransfer.getData('text/plain'));
      if(!imported||!commands.some(c=>c.id===imported.id))return;
      if(usedIds().has(imported.id)){status('이미 페이지에 등록된 명령입니다. 위치 이동은 기존 버튼을 드래그하세요.');return}
      if(p.slots[i]&&!confirm('이미 등록된 버튼을 '+imported.name+' 명령으로 교체할까요?'))return;
      p.slots[i]=imported.id;render();status(imported.name+' 명령을 페이지 '+(pi+1)+' 버튼 '+(i+1)+'에 배치했습니다.');
    };
    el.oncontextmenu=e=>{e.preventDefault();context={p:pi,i};$('context').style.display='block';$('context').style.left=Math.min(e.clientX,innerWidth-210)+'px';$('context').style.top=Math.min(e.clientY,innerHeight-100)+'px';$('toggleReserve').textContent=p.reserved.includes(i)?'예약 해제':'예약 슬롯으로 지정';$('remove').disabled=!id};
    rowNode.append(el);
   }
   panel.append(rowNode);
  }
  root.append(panel);
 });
 const existing=usedIds();const type=$('category').value;const q=$('search').value.toLowerCase();
 const matches=Curation.visibleItems(commands,$('visibility').value,capturedUI,visibilityOverrides).filter(v=>!existing.has(v.id)&&(type==='all'||category(v)===type)&&(v.name.toLowerCase().includes(q)||v.id.toLowerCase().includes(q)||(v.en||'').toLowerCase().includes(q))).sort((a,b)=>Curation.sortByPlacement(a,b,capturedUI)).slice(0,120);
 $('remaining').textContent='(표시 '+matches.length+'개)';
 const list=$('queue');list.replaceChildren();
 for(const v of matches){const b=document.createElement('button');b.className='chip';b.textContent=displayCommand(v);b.title=v.id;b.onclick=()=>{
 let position=slots().find(x=>!x.reserved&&!x.id);
 if(!position&&pages.length<MAXP){pages.push(empty());position=slots().find(x=>!x.reserved&&!x.id)}
 if(!position){status('추가 가능한 슬롯이 없습니다.');return}
 pages[position.p].slots[position.i]=v.id;render();
 };list.append(b)}
}
function project(){
 return {format:PROJECT,profileName:$('profile').value.trim()||'Fusion 360',pages:pages.map(p=>({name:p.name,enabled:p.enabled,reserved:[...p.reserved],slots:[...p.slots]}))};
}
function validateProject(d){
 if(!d||d.format!==PROJECT||typeof d.profileName!=='string'||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>MAXP)throw Error('유효한 Fusion Command Manager 프로젝트가 아닙니다.');
 const seen=new Set();
 for(const p of d.pages){
  if(typeof p.name!=='string'||typeof p.enabled!=='boolean'||!Array.isArray(p.slots)||p.slots.length!==PER||!Array.isArray(p.reserved))throw Error('페이지 구성 오류');
  const r=new Set(p.reserved);
  if(p.reserved.some(i=>!Number.isInteger(i)||i<0||i>=PER)||r.size!==p.reserved.length)throw Error('예약 슬롯 오류');
  for(let i=0;i<PER;i++){const id=p.slots[i];if(id===null)continue;if(typeof id!=='string'||!id||r.has(i)||seen.has(id))throw Error('명령 ID 중복 또는 예약 슬롯 충돌');seen.add(id)}
 }
}
function exportData(){
 const included=pages.filter(p=>p.enabled);if(!included.length)throw Error('등록할 페이지를 체크하세요.');
 const commandById=new Map(commands.map(v=>[v.id,v]));
 const layoutPages=included.map(p=>({name:p.name,slots:p.slots.map((id,i)=>p.reserved.includes(i)?null:id?{id,name:commandById.get(id)?.name||id}:null)}));
 const list=layoutPages.flatMap(p=>p.slots.filter(Boolean));
 if(!list.length)throw Error('체크된 페이지에 명령이 없습니다.');
 if(layoutPages.length>MAXP)throw Error('페이지 수가 128개를 넘었습니다.');
 return {format:FORMAT,pluginUUID:PLUGIN,actionUUID:ACTION,profileName:$('profile').value.trim()||'Fusion 360',commands:list,layoutPages};
}
let iconCollecting=false;
$('collectIcons').onclick=async()=>{
 if(iconCollecting)return;
 const ids=[...new Set(pages.filter(p=>p.enabled).flatMap(p=>p.slots.filter(Boolean)))];
 if(!ids.length){$('iconStatus').textContent='등록 체크된 페이지에 명령이 없습니다.';return}
 iconCollecting=true;$('collectIcons').disabled=true;
 const statusNode=$('iconStatus');
 let saved=0,cached=0,missing=0,failed=0,processed=0;
 try{
  statusNode.textContent='Fusion 애드인 연결 확인 중…';
  const health=await window.fusionManager.iconHealth();
  if(!health?.available)throw Error(health?.message||'Fusion 360 원본 아이콘 서버에 연결할 수 없습니다.');
  statusNode.textContent='원본 아이콘 수집 중: 0 / '+ids.length;
  // Limit concurrent image requests; each remains a read-only GET.
  let position=0;
  const worker=async()=>{
   while(position<ids.length){
    const id=ids[position++];
    let item;
    try{item=await window.fusionManager.collectIcon(id)}
    catch(e){item={status:'failed',error:e.message}}
    if(item?.status==='saved')saved++;
    else if(item?.status==='cached')cached++;
    else if(item?.status==='missing')missing++;
    else failed++;
    if(item?.data)iconCache.set(id,item.data);
    processed++;
    if(processed%10===0||processed===ids.length){
      statusNode.textContent='수집 '+processed+'/'+ids.length+' · 신규 '+saved+' · 기존 '+cached+' · 원본 없음 '+missing+' · 실패 '+failed;
    }
   }
  };
  await Promise.all(Array.from({length:Math.min(3,ids.length)},()=>worker()));
  render();
  statusNode.textContent='완료 '+processed+'개 · 새로 저장 '+saved+' · 기존 캐시 '+cached+' · 원본 없음 '+missing+' · 오류 '+failed;
 }catch(e){statusNode.textContent='아이콘 수집 실패: '+e.message}
 finally{iconCollecting=false;$('collectIcons').disabled=false}
};

let viewMode='explore';
async function switchMode(mode){
 // Page creation remains in source for possible future use, but is disabled in 1.1.
 if(mode!=='explore')return;
 viewMode=mode;
 document.body.classList.toggle('page-mode',mode==='pages');
 $('explorer').hidden=mode==='pages';$('pageEditor').hidden=mode!=='pages';
 $('modeExplore').classList.toggle('primary',mode==='explore');
 $('modePages').classList.toggle('primary',mode==='pages');
 try{await window.fusionManager.windowMode(mode)}catch(e){status('창 크기 변경 실패: '+e.message)}
 if(mode==='explore')renderExplorer();else renderPages();
}
$('modeExplore').onclick=()=>switchMode('explore');
$('modePages').onclick=()=>switchMode('pages');
$('exploreKorean').onclick=()=>selectDisplayLanguage('ko');
$('exploreEnglish').onclick=()=>selectDisplayLanguage('en');
$('exploreSearch').oninput=renderExplorer;
$('exploreReset').onclick=()=>{$('exploreSearch').value='';renderExplorer()};
$('exploreCapture').onclick=()=>$('importCapture').click();
$('exploreIcons').onclick=async()=>{
 const ids=explorerItems.slice(0,240).map(v=>v.id);
 if(!ids.length)return;
 const state=$('exploreStatus');state.textContent='원본 아이콘 서버 연결 확인…';
 const health=await window.fusionManager.iconHealth();
 if(!health?.available){state.textContent=health?.message||'Fusion 애드인 연결 실패';return}
 let next=0,saved=0,known=0,missing=0,failed=0;
 const worker=async()=>{
   while(next<ids.length){
     const id=ids[next++],r=await window.fusionManager.collectIcon(id);
     if(r.status==='saved')saved++;else if(r.status==='cached')known++;
     else if(r.status==='missing')missing++;else failed++;
     if(r.data)iconCache.set(id,r.data);
   }
 };
 $('exploreIcons').disabled=true;
 try{await Promise.all(Array.from({length:Math.min(3,ids.length)},worker));
     renderExplorer();state.textContent='원본 아이콘 수집: 새로 저장 '+saved+' · 기존 '+known+' · 없음 '+missing+' · 실패 '+failed;}
 catch(e){state.textContent='수집 오류: '+e.message}
 finally{$('exploreIcons').disabled=false}
};
$('addPage').onclick=()=>{if(pages.length>=MAXP)return status('최대 128페이지입니다.');pages.push(empty());render()};
$('fill').onclick=()=>{if(pages.some(p=>p.slots.some(Boolean))&&!confirm('기존 배치를 추천 순서로 다시 만들까요?'))return;makePagesFromCatalog($('category').value)};
$('category').onchange=render;$('search').oninput=render;$('visibility').onchange=render;
$('prepareEnglish').onclick=async()=>{
 try{
  const result=await window.fusionManager.prepareEnglish();
  $('englishStatus').textContent='수집기 '+(result.status==='existing'?'준비됨':'생성됨')+' · '+result.path;
  status('영문 Fusion으로 변경·재시작한 다음 Scripts and Add-Ins에서 수집기 폴더를 추가하여 실행하세요.');
 }catch(e){$('englishStatus').textContent='영문 수집 준비 실패: '+e.message}
};
$('importEnglish').onclick=async()=>{
 try{
  const result=await window.fusionManager.importEnglish();
  if(!result)return;
  englishOverlay=result;applyEnglishNames();updateDisplayLanguageControls();render();
  status('영문 명칭을 갱신했습니다. 기존 한글 메뉴 순서와 버튼 저장값은 유지됩니다.');
 }catch(e){$('englishStatus').textContent='영문 결과 불러오기 실패: '+e.message}
};
$('importCapture').onclick=async()=>{
 try{
  const data=await window.fusionManager.openCapture();
  if(!data)return;
  const result=Curation.validateCapture(data);
  capturedUI=result;menuTreeCache=null;
  $('captureStatus').textContent='UI 수집 '+result.entries.size+'개 고유 ID · 조회 오류 '+result.errors+'건 · Fusion '+result.version;
  // Do NOT regenerate or overwrite user-arranged pages automatically.
  render();
  status('Fusion UI 수집 결과를 분류에 반영했습니다. 현재 페이지 배치는 유지됩니다.');
 }catch(e){status('Fusion UI JSON 검증 실패: '+e.message)}
};
$('toggleReserve').onclick=()=>{if(context)reserve(context.p,context.i);$('context').style.display='none'};
$('remove').onclick=()=>{if(context){pages[context.p].slots[context.i]=null;render()}$('context').style.display='none'};
document.addEventListener('click',e=>{if(!$('context').contains(e.target))$('context').style.display='none'});
$('save').onclick=async()=>{try{const result=await window.fusionManager.save(project(),'Fusion-Layout.project.json');if(result)status('프로젝트 저장: '+result)}catch(e){status(e.message)}};
$('open').onclick=async()=>{try{const result=await window.fusionManager.open();if(!result)return;validateProject(result.data);pages=result.data.pages.map(p=>({name:p.name,enabled:p.enabled,reserved:p.reserved,slots:p.slots}));$('profile').value=result.data.profileName;render();status('프로젝트 불러오기 완료')}catch(e){status('불러오기 실패: '+e.message)}};
$('export').onclick=async()=>{try{const data=exportData();const result=await window.fusionManager.save(data,'D200X-Fusion-Commands.json');if(result)status('DeckForge 등록용 JSON 생성: '+result)}catch(e){status('내보내기 실패: '+e.message)}};
Promise.all([window.fusionManager.catalog(),window.fusionManager.loadVisibility().catch(()=>({})),window.fusionManager.loadCapture().catch(()=>null),window.fusionManager.menuCatalog(),window.fusionManager.loadEnglish().catch(()=>null),window.fusionManager.loadDisplayLanguage().catch(()=>'ko')]).then(([data,overrides,lastCapture,menu,storedEnglish,storedLanguage])=>{menuCatalog=menu;visibilityOverrides=overrides;if(lastCapture){try{capturedUI=Curation.validateCapture(lastCapture);$('captureStatus').textContent='저장된 Fusion UI 수집 '+capturedUI.entries.size+'개 ID';}catch{capturedUI=null}}commands=normalizeCatalogue(data);if(!commands.length)throw Error('명령 카탈로그를 읽었지만 지원되는 명령이 없습니다.');englishOverlay=storedEnglish;displayLanguage=storedLanguage;applyEnglishNames();updateDisplayLanguageControls();pages=[empty()];render();status('DeckForge 버튼으로 명령을 드래그하세요.');}).catch(e=>{pages=[empty()];render();status('카탈로그 오류: '+e.message)});
