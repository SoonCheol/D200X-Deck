'use strict';
const FORMAT='d200x-fusion-batch-v1',PROJECT='fusion-command-manager-project-v1';
const PLUGIN='com.autodesk.fusionstreamdeck',ACTION=PLUGIN+'.runcommand';
const MAXP=128,PER=13;
const $=id=>document.getElementById(id);
let commands=[],pages=[],drag=null,context=null;
const iconCache=new Map(),iconPending=new Set();
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
  path:JSON.stringify(v.paths||v.path||v.category||v.workspace||'')}))
 .filter(v=>v.id&&v.name&&v.id.length<=256&&v.name.length<=160&&!seen.has(v.id)&&seen.add(v.id));
}
function category(v){
 const t=(v.name+' '+v.id+' '+v.path).toLowerCase();
 if(/sketch|스케치/.test(t))return 'sketch';
 if(/solid|솔리드|model|모델링/.test(t))return 'solid';
 if(/surface|서피스|patch/.test(t))return 'surface';
 if(/file|save|open|export|import|저장|열기|파일/.test(t))return 'file';
 return 'other';
}
const importance=v=>{
 const s=(v.id+' '+v.name).toLowerCase();
 const preferred=['line','rectangle','circle','dimension','trim','extrude','fillet','chamfer','hole','revolve','offset','project','move','mirror','pattern','save','undo','redo'];
 const i=preferred.findIndex(w=>s.includes(w));
 return i<0?1000:i;
};
function makePagesFromCatalog(type){
 const items=commands.filter(v=>type==='all'||category(v)===type).sort((a,b)=>importance(a)-importance(b)||a.name.localeCompare(b.name,'ko'));
 if(!items.length){status('이 범주의 카탈로그 명령이 없습니다.');return;}
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
function fallbackIcon(v){
 const t=(v?.id||'')+' '+(v?.name||'');
 if(/circle|원형|원/.test(t))return '◯';
 if(/rectangle|square|사각/.test(t))return '▣';
 if(/line|선/.test(t))return '╱';
 if(/extrud|돌출/.test(t))return '⬡';
 if(/fillet|모깎|모따|chamfer/.test(t))return '◩';
 if(/move|이동/.test(t))return '✥';
 if(/trim|자르/.test(t))return '✂';
 if(/dimension|치수/.test(t))return '↔';
 if(/pattern|패턴/.test(t))return '▦';
 if(/save|저장/.test(t))return '▤';
 return {sketch:'✎',solid:'⬡',surface:'◈',file:'▤',other:'⌘'}[category(v||{})]||'⌘';
}
function requestIcon(id,el,v){
 if(!id||iconPending.has(id))return;
 if(iconCache.has(id)){const cached=iconCache.get(id);if(cached)setArt(el,cached);return}
 iconPending.add(id);
 window.fusionManager.icon(id).then(data=>{
  iconCache.set(id,data||null);
  if(data&&el.isConnected)setArt(el,data);
 }).catch(()=>iconCache.set(id,null)).finally(()=>iconPending.delete(id));
}
function setArt(el,src){
 const symbol=el.querySelector('.cmd-symbol');
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
 const ko=v.ko||(/［[가-힣]｜[가-힣]/.test(v.name)?v.name:'한글 이름 정보 없음');
 const en=v.en||'영문명 정보 없음';
 hoverTimer=setTimeout(()=>{
  const tip=$('tooltip');tip.textContent=ko+'\n'+en;tip.style.display='block';
  const rect=event.currentTarget.getBoundingClientRect();
  tip.style.left=Math.max(8,Math.min(rect.left,innerWidth-tip.offsetWidth-8))+'px';
  tip.style.top=(rect.bottom+tip.offsetHeight+8<innerHeight?rect.bottom+5:Math.max(8,rect.top-tip.offsetHeight-5))+'px';
 },500);
}
function showDetail(v){
 hideTooltip();const dl=$('detailFields');dl.replaceChildren();
 $('detailTitle').textContent=v.ko||v.name;
 for(const [label,value] of [['명령 ID',v.id],['영문명',v.en||'정보 없음'],['한글명',v.ko||'정보 없음'],['작업 영역',category(v)],['메뉴·툴바 경로',v.path||'정보 없음']]){
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=value;dl.append(dt,dd);
 }
 $('detail').style.display='block';
}
$('detailClose').onclick=()=>$('detail').style.display='none';
function render(){
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
      const art=document.createElement('span');art.className='cmd-symbol';art.textContent=fallbackIcon(v);el.append(art);
      const label=document.createElement('span');label.className='cmd-name';label.textContent=v?.ko||v?.name||id;el.append(label);
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
    el.ondragover=e=>{if(drag&&!p.reserved.includes(i)){e.preventDefault();el.classList.add('over')}};
    el.ondragleave=()=>el.classList.remove('over');
    el.ondrop=e=>{e.preventDefault();el.classList.remove('over');if(drag)insertAt(drag,{p:pi,i});drag=null};
    el.oncontextmenu=e=>{e.preventDefault();context={p:pi,i};$('context').style.display='block';$('context').style.left=Math.min(e.clientX,innerWidth-210)+'px';$('context').style.top=Math.min(e.clientY,innerHeight-100)+'px';$('toggleReserve').textContent=p.reserved.includes(i)?'예약 해제':'예약 슬롯으로 지정';$('remove').disabled=!id};
    rowNode.append(el);
   }
   panel.append(rowNode);
  }
  root.append(panel);
 });
 const existing=usedIds();const type=$('category').value;const q=$('search').value.toLowerCase();
 const matches=commands.filter(v=>!existing.has(v.id)&&(type==='all'||category(v)===type)&&(v.name.toLowerCase().includes(q)||v.id.toLowerCase().includes(q))).slice(0,120);
 $('remaining').textContent='(표시 '+matches.length+'개)';
 const list=$('queue');list.replaceChildren();
 for(const v of matches){const b=document.createElement('button');b.className='chip';b.textContent=v.name;b.title=v.id;b.onclick=()=>{
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
$('addPage').onclick=()=>{if(pages.length>=MAXP)return status('최대 128페이지입니다.');pages.push(empty());render()};
$('fill').onclick=()=>{if(pages.some(p=>p.slots.some(Boolean))&&!confirm('기존 배치를 추천 순서로 다시 만들까요?'))return;makePagesFromCatalog($('category').value)};
$('category').onchange=render;$('search').oninput=render;
$('toggleReserve').onclick=()=>{if(context)reserve(context.p,context.i);$('context').style.display='none'};
$('remove').onclick=()=>{if(context){pages[context.p].slots[context.i]=null;render()}$('context').style.display='none'};
document.addEventListener('click',e=>{if(!$('context').contains(e.target))$('context').style.display='none'});
$('save').onclick=async()=>{try{const result=await window.fusionManager.save(project(),'Fusion-Layout.project.json');if(result)status('프로젝트 저장: '+result)}catch(e){status(e.message)}};
$('open').onclick=async()=>{try{const result=await window.fusionManager.open();if(!result)return;validateProject(result.data);pages=result.data.pages.map(p=>({name:p.name,enabled:p.enabled,reserved:p.reserved,slots:p.slots}));$('profile').value=result.data.profileName;render();status('프로젝트 불러오기 완료')}catch(e){status('불러오기 실패: '+e.message)}};
$('export').onclick=async()=>{try{const data=exportData();const result=await window.fusionManager.save(data,'D200X-Fusion-Commands.json');if(result)status('DeckForge 등록용 JSON 생성: '+result)}catch(e){status('내보내기 실패: '+e.message)}};
window.fusionManager.catalog().then(data=>{commands=normalizeCatalogue(data);if(!commands.length)throw Error('명령 카탈로그를 읽었지만 지원되는 명령이 없습니다.');pages=[empty()];makePagesFromCatalog('sketch');}).catch(e=>{pages=[empty()];render();status('카탈로그 오류: '+e.message)});
