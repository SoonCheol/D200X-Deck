'use strict';
const FORMAT='deckforge-fusion-english-names-v1';
const ID=/^[A-Za-z0-9._-]{1,256}$/;
const HANGUL=/[가-힣]/,LATIN=/[A-Za-z]/;
const KINDS=['workspace','tab','panel','toolbar','dropdown'];
const safeId=v=>typeof v==='string'&&ID.test(v)&&!['__proto__','prototype','constructor','.','..'].includes(v);
const englishName=v=>{
 const s=typeof v==='string'?v.trim():'';
 return s&&s.length<=160&&!/[\x00-\x1f\x7f]/.test(s)&&!HANGUL.test(s)&&LATIN.test(s)?s:'';
};
function fromCapture(data){
 if(!data||!['deckforge-fusion-ui-placements-v1','deckforge-fusion-ui-placements-v2'].includes(data.format)||
 !Array.isArray(data.placements)||!Array.isArray(data.errors)||
 data.placements.length>250000||data.errors.length>50000)throw Error('Fusion UI 수집 JSON 형식 오류');
 const commands=Object.create(null),menus=Object.fromEntries(KINDS.map(k=>[k,Object.create(null)]));
 let latin=0,korean=0,conflicts=0;
 const put=(target,id,label)=>{
  if(!safeId(id)||!englishName(label))return;
  if(target[id]&&target[id]!==label){conflicts++;return}
  target[id]=label;
 };
 for(const p of data.placements){
  if(!p||typeof p!=='object')continue;
  const name=String(p.commandName||'').trim();
  if(safeId(p.commandId)&&name){
   if(HANGUL.test(name))korean++;
   else if(englishName(name)){latin++;put(commands,p.commandId,name)}
  }
  if(!Array.isArray(p.path)||p.path.length>30)continue;
  for(const node of p.path){
   if(!node||typeof node!=='object')continue;
   for(const kind of KINDS.slice(0,4)){
    const part=node[kind];
    if(part&&typeof part==='object')put(menus[kind],part.id,part.name);
   }
   if(/DropDownControl/.test(String(node.controlType||'')))put(menus.dropdown,node.controlId,node.controlName);
  }
 }
 const count=Object.keys(commands).length;
 if(!count||korean>latin)throw Error('영문 명칭을 확인할 수 없습니다. 영어 Fusion으로 변경·재시작 후 다시 수집하세요.');
 return {format:FORMAT,language:'en',fusionVersion:String(data.fusionVersion||'unknown').slice(0,80),
  collectedAtUTC:String(data.collectedAtUTC||'').slice(0,80),commands,menus,
  stats:{commands:count,menuLabels:KINDS.reduce((n,k)=>n+Object.keys(menus[k]).length,0),
   koreanNames:korean,conflicts,sourcePlacements:data.placements.length}};
}
function validateSaved(data){
 if(!data||data.format!==FORMAT||data.language!=='en'||!data.commands||!data.menus)throw Error('영문 이름 데이터 형식 오류');
 const commands=Object.create(null),menus=Object.fromEntries(KINDS.map(k=>[k,Object.create(null)]));
 for(const [id,name] of Object.entries(data.commands)){
  if(!safeId(id)||!englishName(name))throw Error('영문 명령 이름 오류');
  commands[id]=name;
 }
 if(Object.keys(commands).length>20000)throw Error('영문 명령 수 초과');
 for(const kind of KINDS){
  const src=data.menus[kind];
  if(!src||typeof src!=='object'||Array.isArray(src))throw Error('영문 메뉴 자료 오류');
  for(const [id,name] of Object.entries(src)){
   if(!safeId(id)||!englishName(name))throw Error('영문 메뉴 이름 오류');
   menus[kind][id]=name;
  }
  if(Object.keys(menus[kind]).length>5000)throw Error('영문 메뉴 수 초과');
 }
 return {...data,commands,menus};
}
module.exports={FORMAT,fromCapture,validateSaved};
