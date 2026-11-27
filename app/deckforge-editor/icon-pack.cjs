'use strict';
// Stream Deck icon-pack parser and private library storage. No archive paths
// are written to disk; only validated image data is persisted as JSON.
const JSZip=require('jszip');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const MAX_ARCHIVE=60*1024*1024;
const MAX_EXPANDED=100*1024*1024;
const MAX_ICON=6*1024*1024;
const MAX_ICONS=2500;
const MAX_PACKS=32;
const MEDIA={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'};

function safePart(value){
  return typeof value==='string'&&value.length>0&&value.length<=250&&
    !value.includes('\\')&&!value.includes('\0')&&value!=='.'&&value!=='..'&&
    !value.includes('/')&&!/[\x00-\x1f\x7f]/.test(value);
}
function checkedJSON(buffer,description){
  if(buffer.length>1024*1024)throw new Error(description+' 파일이 너무 큽니다.');
  try{return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/,''));}
  catch{throw new Error(description+' JSON 형식이 올바르지 않습니다.');}
}
function mimeOf(name){
  const ext=name.split('.').pop()?.toLowerCase();
  return MEDIA[ext]||null;
}
function validImage(bytes,mime){
  if(mime==='image/png')return bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  if(mime==='image/jpeg')return bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8;
  if(mime==='image/gif')return bytes.subarray(0,6).toString('ascii').match(/^GIF8[79]a$/)!==null;
  if(mime==='image/webp')return bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(mime==='image/svg+xml')return /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString('utf8'))&&
    !/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*['"]\s*(?:https?:|file:|javascript:)/i.test(bytes.toString('utf8'));
  return false;
}
async function parseIconPack(input,render,displayName='가져온 아이콘팩'){
  if(!Buffer.isBuffer(input)||input.length<10||input.length>MAX_ARCHIVE)
    throw new Error('아이콘팩 크기는 60MB 이하여야 합니다.');
  if(input.toString('latin1',0,2)!=='PK')throw new Error('ZIP 기반 Stream Deck 아이콘팩이 아닙니다.');
  const zip=await JSZip.loadAsync(input,{checkCRC32:false,createFolders:false});
  const entries=Object.values(zip.files);
  if(entries.length>MAX_ICONS+30)throw new Error('압축 파일에 항목이 너무 많습니다.');
  let expanded=0;
  for(const entry of entries){
    if(entry.dir)continue;
    const length=Number(entry._data?.uncompressedSize);
    if(!Number.isSafeInteger(length)||length<0)
      throw new Error('압축 해제 크기를 확인할 수 없습니다.');
    expanded+=length;
    if(expanded>MAX_EXPANDED)throw new Error('압축 해제 용량 제한을 초과했습니다.');
  }
  const indexes=entries.filter(e=>!e.dir&&/(?:^|\/)icons\.json$/i.test(e.name));
  const indexed=indexes.length===1;
  const root=indexed?indexes[0].name.slice(0,-'icons.json'.length):'';
  const manifestEntry=entries.find(e=>!e.dir&&e.name===root+'manifest.json');
  const manifest=manifestEntry?checkedJSON(await manifestEntry.async('nodebuffer'),'manifest'):{};
  const name=String(manifest.Name||manifest.name||displayName).trim().slice(0,120);
  const version=String(manifest.Version||manifest.version||'1.0.0').trim().slice(0,40);
  if(!name||!version)throw new Error('아이콘팩 이름 또는 버전이 올바르지 않습니다.');
  const items=indexed?checkedJSON(await indexes[0].async('nodebuffer'),'icons'):
    entries.filter(e=>!e.dir&&mimeOf(e.name)&&!/(?:^|\/)(?:icon|categoryicon|preview)\.(?:png|svg|jpe?g)$/i.test(e.name))
      .map(e=>({path:e.name,name:path.posix.basename(e.name).replace(/\.[^.]+$/,'')}));
  if(!Array.isArray(items)||items.length===0||items.length>MAX_ICONS)
    throw new Error('아이콘은 1~2500개만 지원합니다.');
  const named=file=>zip.file((indexed?root+'icons/':'')+file);
  let size=0;
  const icons=[];
  for(const [i,item] of items.entries()){
    if(!item||!safeImagePath(item.path)||!mimeOf(item.path))
      throw new Error('아이콘 '+(i+1)+'의 파일 경로 또는 형식이 지원되지 않습니다.');
    const entry=named(item.path);
    if(!entry||entry.dir)throw new Error('아이콘 파일이 없습니다: '+item.path);
    const mime=mimeOf(item.path);
    const bytes=await entry.async('nodebuffer');
    if(bytes.length===0||bytes.length>MAX_ICON||!validImage(bytes,mime))
      throw new Error('아이콘 이미지가 올바르지 않습니다: '+item.path);
    size+=bytes.length;
    if(size>MAX_EXPANDED)throw new Error('아이콘 전체 용량이 너무 큽니다.');
    const image=render?await render(bytes,mime,item.path):
      (mime==='image/svg+xml'?null:'data:'+mime+';base64,'+bytes.toString('base64'));
    if(!image)throw Error('SVG 이미지 변환기가 필요합니다.');
    icons.push({
      name:typeof item.name==='string'&&item.name.trim()?item.name.slice(0,100):item.path,
      filename:item.path,
      tags:Array.isArray(item.tags)?item.tags.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,60)):[],
      image
    });
  }
  return {
    id:crypto.createHash('sha256').update(input).digest('hex').slice(0,20),
    name,version,
    packageProfile:indexed?(/\.sdIconPack\/$/i.test(root)?'elgato-icon-index':'indexed-icons'):'raster-images',
    author:typeof manifest.Author==='string'?manifest.Author.slice(0,120):'',
    icons
  };
}

function safeImagePath(value){
  return typeof value==='string'&&value.length>0&&value.length<500&&
    !value.includes('\\')&&!value.startsWith('/')&&value.split('/').every(safePart);
}
async function parseIconFolder(folder,render){
  const root=path.resolve(folder),rootStat=await fs.lstat(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('아이콘팩 폴더를 선택하세요.');
  const zip=new JSZip();
  let count=0,total=0;
  async function collect(current,relative='',depth=0){
    if(depth>8)throw Error('아이콘팩 폴더 깊이 제한 초과');
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw Error('심볼릭 링크는 가져올 수 없습니다.');
      const name=relative?relative+'/'+entry.name:entry.name;
      if(!safeImagePath(name))throw Error('안전하지 않은 아이콘 경로');
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){await collect(full,name,depth+1);continue;}
      if(!entry.isFile())continue;
      if(++count>MAX_ICONS+30)throw Error('아이콘팩 항목 개수 제한 초과');
      const stat=await fs.stat(full);
      total+=stat.size;
      if((stat.size>MAX_ICON&&mimeOf(name))||total>MAX_EXPANDED)throw Error('아이콘팩 크기 제한 초과');
      if(mimeOf(name)||/(?:^|\/)(?:icons|manifest)\.json$/i.test(name))zip.file(name,await fs.readFile(full));
    }
  }
  await collect(root);
  const pack=await parseIconPack(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),render,path.basename(root));
  // The same directory is the same installed pack across repeated imports.
  pack.id=crypto.createHash('sha256').update('folder:'+root.toLowerCase()).digest('hex').slice(0,20);
  return pack;
}

async function readPacks(filename){
  try{
    const raw=await fs.readFile(filename,'utf8');
    const value=JSON.parse(raw);
    if(!Array.isArray(value))throw new Error('저장된 아이콘팩 목록이 손상되었습니다.');
    return value.filter(p=>p&&typeof p.id==='string'&&Array.isArray(p.icons)).slice(0,MAX_PACKS);
  }catch(error){
    if(error.code==='ENOENT')return [];
    throw error;
  }
}
async function registerPack(filename,pack){
  const packs=await readPacks(filename);
  const index=packs.findIndex(x=>x.id===pack.id);
  if(index<0&&packs.length>=MAX_PACKS)throw new Error('아이콘팩 최대 32개까지 등록할 수 있습니다.');
  if(index>=0)packs[index]=pack;
  else packs.push(pack);
  await fs.mkdir(path.dirname(filename),{recursive:true});
  const temp=filename+'.'+process.pid+'.tmp';
  try{
    await fs.writeFile(temp,JSON.stringify(packs),'utf8');
    await fs.rename(temp,filename);
  }catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
  return packs;
}
async function removePack(filename,id){
  if(typeof id!=='string'||!id||id.length>128||['builtin-fluentui-filled','builtin-fluentui-regular'].includes(id))
    throw new Error('기본 아이콘팩은 삭제할 수 없습니다.');
  const packs=await readPacks(filename);
  const found=packs.find(pack=>pack.id===id);
  if(!found)return false;
  if(found.source==='bundled')throw new Error('기본 아이콘팩은 삭제할 수 없습니다.');
  const remaining=packs.filter(pack=>pack.id!==id);
  const temp=filename+'.'+process.pid+'.tmp';
  try{
    await fs.writeFile(temp,JSON.stringify(remaining),'utf8');
    await fs.rename(temp,filename);
  }catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
  return true;
}
module.exports={parseIconPack,parseIconFolder,readPacks,registerPack,removePack};
