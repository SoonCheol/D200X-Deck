'use strict';
// DeckForge v1 installation package: independent envelope, Stream Deck SDK
// adapter runtime. This does NOT execute or automatically convert Ulanzi code.
const fs=require('node:fs/promises');
const path=require('node:path');
const JSZip=require('jszip');
const {parseArchive,validateManifest}=require('./sd-plugin-host.cjs');

const FORMAT='deckforge-plugin';
const FORMAT_VERSION=1;
const MAX_ARCHIVE=40*1024*1024;
const MAX_FILES=2500;
const MAX_EXPANDED=100*1024*1024;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,180}$/;
const safePart=value=>typeof value==='string'&&value.length>0&&value.length<1024&&
  !/[\\\\:\x00-\x1f\x7f]/.test(value)&&!value.startsWith('/')&&
  value.split('/').every(part=>part&&part!=='.'&&part!=='..');
const safeName=value=>String(value).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'plugin';

function validatePackageManifest(meta){
  if(!meta||typeof meta!=='object'||Array.isArray(meta)||
    meta.format!==FORMAT||meta.formatVersion!==FORMAT_VERSION)
    throw Error('지원하지 않는 DeckForge 플러그인 패키지 규격입니다.');
  const p=meta.plugin;
  if(!p||!ID.test(p.id)||typeof p.name!=='string'||!p.name.trim()||
    typeof p.version!=='string'||!p.version.trim()||p.name.length>180||p.version.length>64)
    throw Error('DeckForge 플러그인 식별 정보가 올바르지 않습니다.');
  if(meta.runtime?.type!=='streamdeck-sdk'||meta.runtime?.directory!=='payload')
    throw Error('지원하지 않는 DeckForge 플러그인 런타임입니다. v1은 streamdeck-sdk만 허용합니다.');
  if(!['streamdeck','deckforge'].includes(meta.source?.kind))
    throw Error('Ulanzi 플러그인은 코드/API 호환성 검증과 변환을 완료한 뒤에만 설치 패키지를 만들 수 있습니다.');
  return meta;
}

async function parseDeckForgePackage(data){
  if(!Buffer.isBuffer(data)||data.length<50||data.length>MAX_ARCHIVE)
    throw Error('DeckForge 플러그인 파일은 40MB 이하여야 합니다.');
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});
  const entries=Object.values(zip.files);
  const files=entries.filter(entry=>!entry.dir);
  if(!files.length||files.length>MAX_FILES+1)
    throw Error('DeckForge 플러그인 파일 개수가 허용 범위를 벗어났습니다.');
  const descriptor=zip.file('deckforge-plugin.json');
  if(!descriptor||descriptor.dir)throw Error('DeckForge 전용 manifest(deckforge-plugin.json)가 없습니다.');
  const descriptorBytes=await descriptor.async('nodebuffer');
  if(descriptorBytes.length>32768)throw Error('DeckForge 패키지 매니페스트가 너무 큽니다.');
  let meta;
  try{meta=validatePackageManifest(JSON.parse(descriptorBytes.toString('utf8')));}
  catch(error){throw Error('DeckForge 패키지 검증 실패: '+error.message);}
  const targetRoot=meta.plugin.id+'.sdPlugin/';
  const converted=new JSZip();
  let fileCount=0,total=0;
  for(const entry of entries){
    const entryPath=entry.dir&&entry.name.endsWith('/')?entry.name.slice(0,-1):entry.name;
    if(entry.unsafeOriginalName&&entry.unsafeOriginalName!==entry.name)
      throw Error('DeckForge 패키지에서 경로 정규화가 필요한 파일을 거부했습니다.');
    if(!safePart(entryPath)||(entry.unixPermissions&0xf000)===0xa000)
      throw Error('DeckForge 패키지에 허용되지 않는 경로/심볼릭 링크가 있습니다.');
    if(entry.dir)continue;
    if(entry.name==='deckforge-plugin.json')continue;
    if(!entry.name.startsWith('payload/'))
      throw Error('DeckForge 패키지에 정의되지 않은 파일이 포함되어 있습니다.');
    const relative=entry.name.slice('payload/'.length);
    if(!safePart(relative)||++fileCount>MAX_FILES)
      throw Error('DeckForge 플러그인 파일 경로나 개수가 허용 범위를 벗어났습니다.');
    const advertised=Number(entry._data?.uncompressedSize);
    if(Number.isFinite(advertised)&&advertised>=0&&total+advertised>MAX_EXPANDED)
      throw Error('DeckForge 패키지 압축 해제 크기 제한 초과');
    const bytes=await entry.async('nodebuffer');
    total+=bytes.length;
    if(total>MAX_EXPANDED)throw Error('DeckForge 패키지 압축 해제 크기 제한 초과');
    converted.file(targetRoot+relative,bytes);
  }
  if(fileCount===0)throw Error('DeckForge 플러그인 실행 파일이 없습니다.');
  const archive=await converted.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const parsed=await parseArchive(archive);
  if(parsed.manifest.UUID!==meta.plugin.id||
    parsed.manifest.Name!==meta.plugin.name||
    parsed.manifest.Version!==meta.plugin.version)
    throw Error('DeckForge 패키지 정보와 내부 SDK 매니페스트가 일치하지 않습니다.');
  return {meta,archive};
}

async function packageSdPluginDirectory(folder){
  const dir=path.resolve(folder),folderName=path.basename(dir);
  const stat=await fs.lstat(dir);
  if(!stat.isDirectory()||!folderName.endsWith('.sdPlugin')||
    !ID.test(folderName.slice(0,-'.sdPlugin'.length)))
    throw Error('패키징할 *.sdPlugin 폴더를 선택하세요.');
  const content=new JSZip();
  const payload=new JSZip();
  let count=0,total=0,manifestBytes=null;
  async function walk(current,relative=''){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))
        throw Error('플러그인에 심볼릭 링크나 특수 파일이 포함되어 있습니다.');
      const name=relative?relative+'/'+entry.name:entry.name;
      if(!safePart(name)||name.split('/').includes('.git')||entry.name==='.env')
        throw Error('플러그인 패키징이 허용되지 않는 파일/경로: '+name);
      if(entry.isDirectory()){await walk(path.join(current,entry.name),name);continue;}
      if(++count>MAX_FILES)throw Error('플러그인 파일 개수 제한 초과');
      const itemPath=path.join(current,entry.name);
      const info=await fs.stat(itemPath);
      total+=info.size;
      if(total>MAX_EXPANDED)throw Error('플러그인 크기 제한 초과');
      const bytes=await fs.readFile(itemPath);
      if(name==='manifest.json')manifestBytes=bytes;
      content.file('payload/'+name,bytes);
      payload.file(folderName+'/'+name,bytes);
    }
  }
  await walk(dir);
  if(!manifestBytes||manifestBytes.length>32768)
    throw Error('플러그인 manifest.json이 없거나 너무 큽니다.');
  const manifest=validateManifest(JSON.parse(manifestBytes.toString('utf8')));
  if(folderName!==manifest.UUID+'.sdPlugin')
    throw Error('플러그인 폴더 이름과 manifest UUID가 일치하지 않습니다.');
  // The original, trusted SDK validator checks entrypoint and archive contents.
  await parseArchive(await payload.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  const meta={
    format:FORMAT,formatVersion:FORMAT_VERSION,
    plugin:{id:manifest.UUID,name:manifest.Name,version:manifest.Version},
    source:{kind:'streamdeck',originalId:manifest.UUID},
    runtime:{type:'streamdeck-sdk',directory:'payload'}
  };
  validatePackageManifest(meta);
  content.file('deckforge-plugin.json',JSON.stringify(meta,null,2));
  const archive=await content.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  if(archive.length>MAX_ARCHIVE)throw Error('DeckForge 패키지 크기 제한 40MB 초과');
  await parseDeckForgePackage(archive);
  const filename=safeName(manifest.Name)+'-'+safeName(manifest.Version)+'.deckforgePlugin';
  return {archive,meta,filename};
}

module.exports={FORMAT,FORMAT_VERSION,validatePackageManifest,parseDeckForgePackage,packageSdPluginDirectory};
