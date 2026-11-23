'use strict';
// Menu navigation preserves each real command ID and its appearance paths.
// Labels from live API are preferred; opaque IDs remain visible rather than
// inventing translations for unknown tabs and panels.
(function(root,factory){
 const value=factory();
 if(typeof module==='object'&&module.exports)module.exports=value;
 root.FusionMenuTree=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const workspaceName=id=>{
  const s=String(id||'').toLowerCase();
  if(/sketch/.test(s))return '스케치';
  if(/surface|patch/.test(s))return '곡면';
  if(/mesh/.test(s))return '메쉬';
  if(/sheet.?metal/.test(s))return '판금';
  if(/plastic/.test(s))return '플라스틱';
  if(/solid|model|fusionmodel|design/.test(s))return '솔리드';
  if(/manufactur|cam/.test(s))return '제조';
  if(/draw/.test(s))return '도면';
  if(/render/.test(s))return '렌더링';
  if(/animation/.test(s))return '애니메이션';
  if(/simulation|sim/.test(s))return '시뮬레이션';
  return String(id||'기타');
 };
 const panelName=id=>{
  const s=String(id||'').toLowerCase();
  if(/creat|draw/.test(s))return '작성';
  if(/modif|edit/.test(s))return '수정';
  if(/construct/.test(s))return '구성';
  if(/inspect|measure/.test(s))return '검사';
  if(/constraint/.test(s))return '구속조건';
  if(/insert/.test(s))return '삽입';
  if(/assemble/.test(s))return '조립';
  if(/select/.test(s))return '선택';
  if(/manage/.test(s))return '관리';
  return String(id||'기타');
 };
 function pathParts(path){
  const parts=[];
  for(const s of Array.isArray(path)?path:[]){
   const kind=s.kind||(['workspace','tab','panel','toolbar','dropdown'].find(k=>s[k])||(String(s.controlType||'').includes('DropDownControl')?'dropdown':'control'));
   const value=s[kind],id=s.id||value?.id||s.controlId||'';
   const label=s.name||value?.name||s.controlName||id;
   if(kind==='command')continue;
   parts.push({kind,id:String(id),label:String(label),position:Number.isInteger(s.position)?s.position:null});
  }
  return parts;
 }
 function paths(item,capture){
  const fromCapture=capture?.entries?.get(item.id)?.placements?.map(v=>({source:'live-ui',path:v.path}))||[];
  const raw=Array.isArray(item.paths)?item.paths:[];
  return [...fromCapture,...raw].map(p=>pathParts(p.path)).filter(parts=>parts.length);
 }
 function structure(commands,capture,filter=()=>true){
  const workspaces=new Map();
  const get=(map,key,name)=>{if(!map.has(key))map.set(key,{key,name,rank:Number.MAX_SAFE_INTEGER,children:new Map(),ids:new Map()});return map.get(key)};
  for(const item of commands){
   if(!filter(item))continue;
   const all=paths(item,capture);
   if(!all.length){const ws=get(workspaces,'unplaced','미배치·기타');const panel=get(ws.children,'unplaced','미분류');panel.ids.set(item.id,item);continue}
   for(const parts of all){
    const wsPart=parts.find(x=>x.kind==='workspace')||parts.find(x=>x.kind==='toolbar')||parts.find(x=>x.kind==='tab')||parts.find(x=>x.kind==='panel');
    const tab=parts.find(x=>x.kind==='tab');
    const panelPart=parts.find(x=>x.kind==='panel');
    const anchor=tab?.id||wsPart?.id||'';
    // A workspace can contain Solid/Surface/Sketch as tabs: use the most specific
    // known name, but never discard the actual raw ID.
    const wsKey=workspaceName(anchor)!==anchor?workspaceName(anchor):workspaceName(wsPart?.id||anchor);
    const ws=get(workspaces,wsKey,wsKey);
    if(Number.isInteger(tab?.position))ws.rank=Math.min(ws.rank,tab.position);
    const panName=panelPart?(panelPart.label&&panelPart.label!==panelPart.id?panelPart.label:panelName(panelPart.id)):'기타 툴바';
    const pan=get(ws.children,panName,panName);
    if(Number.isInteger(panelPart?.position))pan.rank=Math.min(pan.rank,panelPart.position);
    // Distinguish nested dropdown groups by original ID and order, not guessed labels.
    let dest=pan;
    for(const sub of parts.filter(x=>x.kind==='dropdown')){
      dest=get(dest.children,'dropdown:'+sub.id,sub.label||sub.id);
      if(Number.isInteger(sub.position))dest.rank=Math.min(dest.rank,sub.position);
    }
    dest.ids.set(item.id,item);
   }
  }
  return [...workspaces.values()];
 }
 function fromMenuCatalog(catalog,commands){
  if(catalog?.format!=='deckforge-fusion-menu-catalog-v1'||!Array.isArray(catalog.entries)||!Array.isArray(catalog.tabIds))throw Error('Fusion 메뉴 순서 자료 오류');
  const names=new Map([['SketchTab','스케치'],['SolidTab','솔리드'],['SurfaceTab','곡면'],['ParaMeshOuterTab','메쉬'],['SheetMetalTab','판금'],['PlasticTab','플라스틱'],['ManageTab','매니지'],['ToolsTab','유틸리티'],['AutomationTab','자동화']]);
  const available=new Map(commands.map(v=>[v.id,v]));
  const tabs=new Map();
  const node=(key,name)=>({key,name,rank:0,children:new Map(),ids:new Map(),ordered:[]});
  for(const id of catalog.tabIds)tabs.set(id,node(id,names.get(id)||id));
  for(const entry of catalog.entries){
   const item=available.get(entry.id),tab=tabs.get(entry.tabId);
   if(!item||!tab)continue;
   const panelId=entry.panelId||entry.panel||'other';
   if(!tab.children.has(panelId)){
    const p=node(panelId,entry.panel||panelId);
    tab.children.set(panelId,p);
   }
   let current=tab.children.get(panelId);
   for(const id of entry.dropdowns||[]){
    const key='dropdown:'+id;
    if(!current.children.has(key))current.children.set(key,node(key,id));
    let child=current.children.get(key);
    if(!current.ordered.includes(child))current.ordered.push(child);
    current=child;
   }
   if(!current.ids.has(item.id)){
    current.ids.set(item.id,item);
    current.ordered.push(item);
   }
  }
  return [...tabs.values()];
 }
 // Localized display uses IDs only; it does not mutate the captured Korean tree.
 function localizedLabel(item,kind,language,overlay){
  const fallback=String(item?.name||'');
  if(language!=='en')return fallback;
  const id=String(item?.key||'').replace(/^dropdown:/,'');
  const translated=overlay?.menus?.[kind]?.[id];
  return typeof translated==='string'&&translated.trim()?translated:fallback;
 }
 function localizedCommand(command,language){
  return language==='en'&&command?.en?command.en:command?.ko||command?.name||'';
 }
 // Both language paths use the original collected hierarchy, not guessed translations.
 function bilingualPaths(command,capture,overlay){
  const seen=new Set(),result=[];
  for(const parts of paths(command,capture)){
   const nodes=parts.filter(p=>['workspace','tab','panel','toolbar','dropdown'].includes(p.kind)&&p.id);
   if(!nodes.length)continue;
   const identity=nodes.map(p=>p.kind+':'+p.id).join('|');
   if(seen.has(identity))continue;seen.add(identity);
   const label=(p,lang)=>{
    if(lang==='en'){
     const translated=overlay?.menus?.[p.kind]?.[p.id];
     if(typeof translated==='string'&&translated.trim())return translated;
     return /[가-힣]/.test(p.label)?p.label+' (영문명 미수집)':p.label;
    }
    return p.label||p.id;
   };
   result.push({ko:[...nodes.map(p=>label(p,'ko')),command.ko||command.name||command.id].join(' › '),
    en:[...nodes.map(p=>label(p,'en')),command.en||((command.ko||command.name||command.id)+' (영문명 미수집)')].join(' › ')});
  }
  return result;
 }
 function descendants(node){
  const seen=new Map();
  if(Array.isArray(node.ordered)){
   for(const value of node.ordered){
    if(value&&value.children instanceof Map){for(const item of descendants(value))if(!seen.has(item.id))seen.set(item.id,item)}
    else if(value?.id&&!seen.has(value.id))seen.set(value.id,value);
   }
  }else{
   for(const [id,item] of node.ids)seen.set(id,item);
   for(const child of node.children.values())for(const item of descendants(child))seen.set(item.id,item);
  }
  return [...seen.values()];
 }
 return Object.freeze({structure,fromMenuCatalog,descendants,localizedLabel,localizedCommand,bilingualPaths,workspaceName,panelName,pathParts});
});