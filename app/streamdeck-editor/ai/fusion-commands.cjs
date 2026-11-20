'use strict';
// Only the pinned Autodesk local bridge's read-only endpoints are used.
const fs=require('node:fs/promises');
const MAX_BYTES=8*1024*1024;
const PLUGIN='com.autodesk.fusionstreamdeck',ACTION=PLUGIN+'.runcommand';
function safeId(id){return typeof id==='string'&&id!=='.'&&id!=='..'&&/^[A-Za-z0-9._-]{1,180}$/.test(id)&&!/(?:eyJ[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})/.test(id);}
function clean(s,max=120){
 if(typeof s!=='string'||/(?:https?:\/\/|[A-Za-z]:[\\/]|\\\\|(?:bearer|token|password|secret|api[_ -]?key)\s*[:= ]|eyJ[A-Za-z0-9_-]{12,}\.|sk-[A-Za-z0-9_-]{12,})/i.test(s))return '';
 return s.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
}
function normaliseCatalog(raw){
 let list=Array.isArray(raw)?raw:(raw?.commands||raw?.items||raw?.catalogue||raw?.catalog||[]);
 if(list&&!Array.isArray(list))list=Object.values(list);
 const names=new Map();
 for(const row of list||[]){
  const id=row?.id||row?.commandId||row?.command_id;
  if(!safeId(id)||names.has(id))continue;
  const ko=clean(row.koName||row.koreanName||row.nameKo||row.name_ko||(/[가-힣]/.test(row.name||'')?row.name:'')),en=clean(row.englishName||row.nameEn||row.name_en||row.enName||(!/[가-힣]/.test(row.name||'')?row.name:''));
  names.set(id,{ko,en,category:clean(row.category,80)});
 }
 return names;
}
function projectCommands(raw,names=new Map()){
 if(raw?.ok!==true||!Array.isArray(raw.commands)||raw.commands.length>30000)throw Error('invalid-fusion-commands');
 const out=[],seen=new Set();
 for(const row of raw.commands){
  if(!safeId(row?.id)||seen.has(row.id))continue;
  const name=clean(row.name);if(!name)continue;seen.add(row.id);
  const known=names.get(row.id)||{};
  out.push({id:row.id,name,ko:known.ko||(/[가-힣]/.test(name)?name:''),en:known.en||(!/[가-힣]/.test(name)?name:''),category:known.category||'',tooltip:clean(row.tooltip,140)});
 }
 return out;
}
function search(rows,query,offset=0,limit=20){
 const q=String(query||'').trim().toLowerCase(),terms=q.split(/\s+/).filter(Boolean);
 const found=rows.filter(r=>{const hay=[r.id,r.name,r.ko,r.en,r.category,r.tooltip].join(' ').toLowerCase();return terms.every(t=>hay.includes(t));});
 if(q)found.sort((a,b)=>{
  const score=r=>r.id.toLowerCase()===q?0:[r.name,r.ko,r.en].some(x=>x.toLowerCase()===q)?1:2;
  return score(a)-score(b);
 });
 return {total:found.length,offset,items:found.slice(offset,offset+limit),nextOffset:offset+limit<found.length?offset+limit:null};
}
async function limitedJson(response,limit){
 if(!response.ok||!response.body)throw Error('fusion-http-unavailable');
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
   if(bytes>limit)throw Error('fusion-response-too-large');
   text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode());
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function readBounded(file,limit,io=fs){
 const st=await io.stat(file);if(!st.isFile()||st.size>limit)throw Error('fusion-file-invalid');
 const data=await io.readFile(file,'utf8');if(data.length>limit)throw Error('fusion-file-invalid');return JSON.parse(data.replace(/^\uFEFF/,''));
}
function createClient({discoveryFile,catalogFile,fetcher=fetch,io=fs}){
 let namesPromise;
 const names=()=>namesPromise??=readBounded(catalogFile,MAX_BYTES,io).then(normaliseCatalog).catch(()=>new Map());
 async function commands({id=null,signal}={}){
  signal?.throwIfAborted();
  if(id!==null&&!safeId(id))throw Error('invalid-fusion-id');
  const info=await readBounded(discoveryFile,8192,io);
  if(info?.status!=='running'||!Number.isInteger(info.port)||info.port<1||info.port>65535)throw Error('fusion-offline');
  const url='http://127.0.0.1:'+info.port+'/commands?refresh=1'+(id===null?'':'&q='+encodeURIComponent(id));
  const timeout=AbortSignal.timeout(11000);
  const raw=await limitedJson(await fetcher(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:signal?AbortSignal.any([timeout,signal]):timeout}),MAX_BYTES);
  signal?.throwIfAborted();
  return projectCommands(raw,await names());
 }
 return {list:signal=>commands({signal}),exact:async(id,signal)=>{
  const rows=await commands({id,signal});return rows.find(r=>r.id===id)||null;
 }};
}
module.exports={PLUGIN,ACTION,safeId,normaliseCatalog,projectCommands,search,createClient};
