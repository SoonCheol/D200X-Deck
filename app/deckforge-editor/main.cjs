'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, clipboard, dialog, shell, screen, powerMonitor } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const {randomUUID}=require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const {parseWindowsArgs}=require('./windows-args.cjs');
const DeckHotkeys=require('./hotkey-keys.js');
const {runFolderHelper}=require('./folder-helper.cjs');
const {runAppFocus,focusOrLaunch,createAppLaunchQueue}=require('./app-focus.cjs');
const {NativeDropHost,physicalSlots}=require('./native-drop-host.cjs');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { D200XTransport } = require('./transport.cjs');
const { parseIconPack, parseIconFolder, readPacks, registerPack, removePack, exportIconImages } = require('./icon-pack.cjs');
const { safeStorage } = require('electron');
const HA = require('./ha-client.cjs');
const {StreamDeckPluginHost}=require('./sd-plugin-host.cjs');
require('./sdk-inspector-scope.cjs').registerInspectorScheme();
const {NativePluginHost,PluginRouter}=require('./deckforge-native-sdk.cjs');
const DeckForgePlugins=require('./deckforge-plugin.cjs');
const Bundled=require('./bundled-integration.cjs');
const FusionState=require('./fusion-state-client.cjs');
const {ProfileStore}=require('./profile-store.cjs');
const Backup=require('./backup.cjs');
const BackupPrivacy=require('./backup-privacy.cjs');
const {GoogleDrive}=require('./google-drive.cjs');
const UpdateCheck=require('./update-check.cjs');
const {StoreClient,storeLocalState,storeUpdateCandidate}=require('./store-client.cjs');
const storeClient=new StoreClient(app.getPath('userData'));
ipcMain.handle('d200x:store-status',event=>{assertEditor(event);return storeClient.status();});
ipcMain.handle('d200x:store-save',(event,origin)=>{assertEditor(event);return storeClient.save(origin);});
ipcMain.handle('d200x:store-reset-origin',event=>{assertEditor(event);return storeClient.resetOrigin();});
ipcMain.handle('d200x:store-check',event=>{assertEditor(event);return storeClient.check();});
ipcMain.handle('d200x:store-login',(event,username,password)=>{assertEditor(event);return storeClient.login(username,password);});
ipcMain.handle('d200x:store-logout',event=>{assertEditor(event);return storeClient.logout();});
ipcMain.handle('d200x:store-trust',(event,pem)=>{
  assertEditor(event);
  if(typeof pem!=='string')throw Error('공개키 형식 오류');
  return storeClient.setTrust(pem,async(fingerprint,origin)=>{
    const result=await dialog.showMessageBox(window,{type:'warning',title:fingerprint?'스토어 게시자 신뢰 등록':'스토어 게시자 신뢰 철회',message:origin,detail:fingerprint?'관리자로부터 별도로 전달받은 공개키 지문과 일치하는지 확인하세요.\nSHA256: '+fingerprint+'\n이 키가 서명한 자체 플러그인만 직접 설치할 수 있습니다.':'이 서버의 신뢰 키를 철회합니다. 설치된 플러그인은 변경하지 않습니다.',buttons:['취소',fingerprint?'신뢰 등록':'철회'],defaultId:0,cancelId:0,noLink:true});
    return result.response===1;
  });
});
ipcMain.handle('d200x:store-catalog',async(event,kind,cursor,filters)=>{
  assertEditor(event);
  const origin=storeClient.status().origin;
  const page=await storeClient.catalog(kind,cursor,filters);
  const session=storeClient.requireSession();
  let installed;
  if(kind==='iconpack'){await ensureIconPacksMigrated();installed=await readPacks(iconPacksFile());}
  else installed=await sdk().list();
  if(storeClient.requireSession()!==session||storeClient.status().origin!==origin)throw Error('스토어 세션이 변경되었습니다.');
  return {...page,items:page.items.map(item=>({...item,local:storeLocalState(item,installed,origin)}))};
});
ipcMain.handle('d200x:store-updates',async(event,kind,pluginId='')=>{
  assertEditor(event);
  if(!['iconpack','plugin'].includes(kind)||typeof pluginId!=='string'||pluginId.length>160)throw Error('스토어 종류 오류');
  const session=storeClient.requireSession(),origin=storeClient.status().origin;
  let installed;
  if(kind==='iconpack'){await ensureIconPacksMigrated();installed=await readPacks(iconPacksFile());if(!installed.some(p=>p.storeSource?.origin===origin&&p.source!=='bundled'))return [];}
  else installed=(await sdk().list()).filter(p=>p.runtime==='deckforge-sdk'&&p.uuid===pluginId);
  if(!installed.length)return [];
  const updates=[],seen=new Set();let cursor='';
  for(let n=0;n<50;n++){
    if(storeClient.requireSession()!==session||storeClient.status().origin!==origin)throw Error('스토어 세션이 변경되었습니다.');
    const page=await storeClient.catalog(kind,cursor,kind==='plugin'?{q:pluginId}:{});
    if(storeClient.requireSession()!==session||storeClient.status().origin!==origin)throw Error('스토어 세션이 변경되었습니다.');
    for(const item of page.items){
      const update=storeUpdateCandidate(item,installed,origin);
      if(update&&!seen.has(item.id)){seen.add(item.id);updates.push(update);}
    }
    if(!page.nextCursor)return updates;
    if(page.nextCursor===cursor)throw Error('스토어 페이지 오류');
    cursor=page.nextCursor;
  }
  throw Error('업데이트 확인 범위를 초과했습니다. 전체 확인이 완료되지 않았습니다.');
});
ipcMain.handle('d200x:store-local-state',async(event,item)=>{
  assertEditor(event);
  const session=storeClient.requireSession(),origin=storeClient.status().origin;
  if(!item||!['iconpack','plugin'].includes(item.kind))throw Error('스토어 종류 오류');
  let installed;
  if(item.kind==='iconpack'){await ensureIconPacksMigrated();installed=await readPacks(iconPacksFile());}
  else installed=await sdk().list();
  if(storeClient.requireSession()!==session||storeClient.status().origin!==origin)throw Error('스토어 세션이 변경되었습니다.');
  return storeLocalState(item,installed,origin);
});
ipcMain.handle('d200x:store-preview',(event,kind,id,releaseId,hash)=>{assertEditor(event);return storeClient.preview(kind,id,releaseId,hash);});
async function saveEditableIconImages(pack,mode,beforeWrite=()=>{}){
  if(!['zip','folder'].includes(mode))throw Error('내보내기 형식 오류');
  const name=String(pack.name||'icons').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,80)||'icons';
  const safeName='Icons-'+name;
  let target;
  if(mode==='zip'){
    const result=await dialog.showSaveDialog(window,{title:'일반 이미지 ZIP 내보내기',defaultPath:path.join(app.getPath('downloads'),safeName+'.zip'),filters:[{name:'ZIP 압축파일',extensions:['zip']}]});
    if(result.canceled||!result.filePath)return null;
    target=result.filePath;
  }else{
    const parent=await openRememberedPicker({title:'이미지 폴더를 생성할 위치 선택',properties:['openDirectory']},'folder');
    if(!parent)return null;
    target=path.join(parent,safeName);
    for(let n=2;n<=100;n++){try{await fs.promises.lstat(target);target=path.join(parent,safeName+'-'+n);}catch(e){if(e.code==='ENOENT')break;throw e;}}
  }
  beforeWrite();
  return exportIconImages(pack,target,mode);
}
ipcMain.handle('d200x:export-icon-images',async(event,id,mode)=>{
  assertEditor(event);
  if(typeof id!=='string'||id.length>128)throw Error('아이콘팩 ID 오류');
  const pack=(await listIconPacks()).find(p=>p.id===id);
  if(!pack)throw Error('아이콘팩을 찾을 수 없습니다.');
  return saveEditableIconImages(pack,mode);
});
ipcMain.handle('d200x:store-export-icon-images',(event,id,releaseId,hash,mode)=>{
  assertEditor(event);
  return storeClient.download('iconpack',id,releaseId,hash,async(item,bytes)=>{
    const pack=await parseIconPack(bytes,(raw,mime)=>'data:'+mime+';base64,'+raw.toString('base64'),item.name);
    if(pack.name!==item.name||pack.version!==item.version)throw Error('아이콘팩 이름 또는 버전이 카탈로그와 다릅니다.');
    return saveEditableIconImages(pack,mode,()=>storeClient.requireSession());
  });
});
ipcMain.handle('d200x:store-download',(event,kind,id,releaseId,hash,installIconPack=false,installPlugin=false,updateOnly=false)=>{
  assertEditor(event);
  if(installPlugin===true&&kind!=='plugin')throw Error('플러그인 종류 오류');
  return storeClient.download(kind,id,releaseId,hash,async(item,bytes)=>{
    if(updateOnly===true){
      const installed=kind==='iconpack'?(await ensureIconPacksMigrated(),await readPacks(iconPacksFile())):await sdk().list();
      if(!storeUpdateCandidate({...item,trusted:storeClient.isTrusted(item)},installed,storeClient.status().origin))throw Error('설치된 콘텐츠 또는 최신 버전이 변경되었습니다. 다시 확인하세요.');
    }
    if(installPlugin===true){
      if(!storeClient.isTrusted(item))throw Error('신뢰되지 않은 패키지');
      const packageData=await DeckForgePlugins.parseDeckForgePackage(bytes);
      const native=packageData.native;
      if(!native||packageData.meta.source?.kind==='ulanzi-converted'||native.id!==item.packageId||native.name!==item.name||native.version!==item.version)throw Error('자체 독자 SDK 패키지 식별 정보가 일치하지 않습니다.');
      if(['com.deckforge.native.home-assistant','de.perdoctus.streamdeck.homeassistant','com.autodesk.fusionstreamdeck','com.deckforge.native.github-status'].includes(native.id.toLowerCase()))throw Error('기본 제공 플러그인은 스토어에서 설치하지 않습니다.');
      const plugin=await pluginAudit('install',native.id,async audit=>installNativePackage(packageData,audit,{forceConfirm:true,requireUpdate:updateOnly===true,source:'스토어 서명 확인',beforeExecute:()=>{storeClient.requireSession();if(!storeClient.isTrusted(item))throw Error('게시자 신뢰 확인 실패');}}));
      return plugin?{kind:'plugin-installed',name:native.name,version:native.version}:null;
    }
    if(installIconPack===true){
      if(item.kind!=='iconpack')throw Error('플러그인 직접 설치는 아직 지원하지 않습니다.');
      const pack=await parseIconPack(bytes,normalizeImportedIcon,item.name);
      if(pack.name!==item.name||pack.version!==item.version)throw Error('아이콘팩 이름 또는 버전이 카탈로그와 다릅니다.');
      const existing=(await listIconPacks()).find(p=>p.id===pack.id);
      if(existing)return {kind:'already-installed',name:existing.name};
      const confirm=await dialog.showMessageBox(window,{type:'question',title:'스토어 아이콘팩 설치',message:pack.name+' '+pack.version,detail:'다운로드 해시와 아이콘팩 형식을 확인했습니다. '+pack.icons.length+'개 아이콘을 별도 팩으로 등록합니다. 이전 버전 및 기존 버튼 이미지는 그대로 유지됩니다.',buttons:['취소','설치'],defaultId:0,cancelId:0,noLink:true});
      if(confirm.response!==1)return null;
      storeClient.requireSession();
      if((await listIconPacks()).some(p=>p.id===pack.id))return {kind:'already-installed',name:pack.name};
      if(updateOnly===true&&!storeUpdateCandidate(item,await readPacks(iconPacksFile()),storeClient.status().origin))throw Error('설치된 아이콘팩 버전이 변경되었습니다. 다시 확인하세요.');
      // Preserve each archive ID and the previous pack; do not migrate button artwork.
      pack.storeSource={origin:storeClient.status().origin,itemId:item.id,releaseId:item.releaseId,sha256:item.sha256,platform:item.platform};
      await ensureIconPacksMigrated();await registerPack(iconPacksFile(),pack);
      return {kind:'installed',name:pack.name};
    }
    const safeName=item.name.replace(/[^a-zA-Z0-9가-힣 _.-]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,80)||'package';
    const result=await dialog.showSaveDialog(window,{title:'스토어 패키지 저장 (설치하지 않음)',defaultPath:path.join(app.getPath('downloads'),safeName+'.'+item.format),filters:[{name:'스토어 패키지',extensions:[item.format]}]});
    if(result.canceled||!result.filePath)return null;
    if(path.extname(result.filePath).toLowerCase()!=='.'+item.format.toLowerCase())throw Error('패키지 확장자가 일치하지 않습니다.');
    storeClient.requireSession();
    await fs.promises.writeFile(result.filePath,bytes,{flag:'wx'});
    return {kind:'saved',name:item.name};
  },installPlugin===true);
});
let sdkHost=null;
const pluginAudit=require('./plugin-audit.cjs').createPluginAudit({userData:app.getPath('userData'),appVersion:app.getVersion(),onError:()=>console.warn('DeckForge plugin audit write failed')});
function sdk(){
  if(!sdkHost){
    const userData=app.getPath('userData'),update=payload=>send('d200x:sdk-event',payload);
    sdkHost=new PluginRouter(new StreamDeckPluginHost(userData,update,()=>window),new NativePluginHost(userData,update,null,{browserOpen:href=>shell.openExternal(href)}));
  }
  return sdkHost;
}
// Local-only Fusion artwork cache: filenames are stable SDK command IDs.
// The Fusion add-in publishes its *own* HTTP endpoint. The SDK plugin may
// remain connected while Fusion itself has exited, so SDK WS is not a health signal.
const fusionDiscoveryFile=()=>path.join(process.env.LOCALAPPDATA||path.join(app.getPath('home'),'AppData','Local'),'FusionStreamDeck','endpoint.json');
async function fusionAddinAvailable(){
  try{
    const discovery=JSON.parse(await fs.promises.readFile(fusionDiscoveryFile(),'utf8'));
    if(discovery?.status!=='running'||!Number.isInteger(discovery.port)||
      discovery.port<1||discovery.port>65535)return false;
    return await new Promise(resolve=>{
      const req=http.get({hostname:'127.0.0.1',port:discovery.port,path:'/health',
        timeout:1200,headers:{accept:'application/json'},agent:false},res=>{
        if(res.statusCode!==200){res.resume();resolve(false);return;}
        let body='',total=0;
        res.on('data',chunk=>{total+=chunk.length;if(total>8192){req.destroy();resolve(false);}else body+=chunk;});
        res.on('end',()=>{try{resolve(JSON.parse(body)?.ok===true);}catch{resolve(false);}});
        res.on('error',()=>resolve(false));
      });
      req.on('timeout',()=>{req.destroy();resolve(false);});
      req.on('error',()=>resolve(false));
    });
  }catch{return false;}
}
ipcMain.handle('d200x:fusion-health',async event=>{
  assertEditor(event);
  return fusionAddinAvailable();
});
const fusionCacheDir=()=>path.join(app.getPath('userData'),'Cache','Fusion','generated');
function safeFusionCommand(id){return typeof id==='string'&&id!=='.'&&id!=='..'&&
  /^[a-zA-Z0-9._-]{1,180}$/.test(id);}
ipcMain.handle('d200x:fusion-icon-read',async(event,id)=>{
  assertEditor(event);if(!safeFusionCommand(id))return null;
  const trusted=path.join(app.getPath('userData'),'Cache','Fusion','original');
  for(const [dir,ext,mime] of [[trusted,'png','image/png'],[trusted,'svg','image/svg+xml'],[fusionCacheDir(),'png','image/png']]){
    try{
      const bytes=await fs.promises.readFile(path.join(dir,id+'.'+ext));
      if(bytes.length>=8&&bytes.length<=768*1024&&(ext!=='png'||bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'))
        return 'data:'+mime+';base64,'+bytes.toString('base64');
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return null;
});
ipcMain.handle('d200x:fusion-icon-write',async(event,id,data)=>{
  assertEditor(event);
  if(!safeFusionCommand(id)||typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length>1024*1024)return false;
  const bytes=Buffer.from(data.slice('data:image/png;base64,'.length),'base64');
  if(bytes.length<8||bytes.length>768*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;
  await fs.promises.mkdir(fusionCacheDir(),{recursive:true});
  const target=path.join(fusionCacheDir(),id+'.png'),tmp=target+'.tmp';
  await fs.promises.writeFile(tmp,bytes);await fs.promises.rename(tmp,target);
  return true;
});
ipcMain.handle('d200x:sdk-list',async event=>{assertEditor(event);return sdk().list();});
ipcMain.handle('d200x:native-retained-list',async event=>{assertEditor(event);return [...await sdk().listRetainedNative(),...await sdk().listRetainedLegacy()];});
ipcMain.handle('d200x:legacy-plugin-remove',async(event,id)=>{
 assertEditor(event);
 let purgeAfter=false;
 const removed=await pluginAudit('remove',id,async audit=>{
 const plan=await sdk().planLegacyRemoval(id);audit.identify(plan);audit.mode('keepData');audit.stage('confirm');
 const choice=await dialog.showMessageBox(window,{type:'question',title:'플러그인 제거',message:plan.name+' '+plan.version+' 제거',
   detail:'DeckForge의 설치 폴더만 보존 영역으로 옮깁니다. 기존 버튼, 인증정보와 외부 애드인은 유지됩니다.',
   buttons:['취소','데이터 유지 후 제거','완전 삭제…'],defaultId:0,cancelId:0,noLink:true});
 if(![1,2].includes(choice.response))return null;
 purgeAfter=choice.response===2;
 audit.stage('execute');return sdk().removeLegacyKeepingData(id,plan.revision);
 });
 if(!removed||!purgeAfter)return removed;
 try{const purged=await purgeRetainedWithApproval(id,true);return {...removed,purgeStatus:purged?.status||'cancelled'};}
 catch(error){return {...removed,purgeStatus:'failed',purgeError:String(error?.message||error)};}
});
ipcMain.handle('d200x:legacy-retained-restore',async(event,id)=>{
 assertEditor(event);
 return pluginAudit('restore',id,async audit=>{
 const plan=await sdk().planLegacyRestore(id);audit.identify(plan);audit.mode('keepData');audit.stage('confirm');
 const choice=await dialog.showMessageBox(window,{type:'question',title:'보존 플러그인 다시 설치',message:plan.name+' '+plan.version+' 다시 설치',
   detail:'보존된 Stream Deck 호환 코드를 다시 실행할 수 있게 됩니다. 신뢰하는 플러그인만 설치하세요.',
   buttons:['취소','신뢰하고 다시 설치'],defaultId:0,cancelId:0,noLink:true});
 if(choice.response!==1)return null;
 audit.stage('execute');return sdk().restoreLegacyRetained(id,plan.revision);
 });
});
async function purgeRetainedWithApproval(id,legacy=false){
 return pluginAudit('purge',id,async audit=>{
 const plan=await (legacy?sdk().planLegacyPurge(id):sdk().planRetainedPurge(id));audit.identify(plan);audit.mode('purge');audit.stage('confirm');
 const c=plan.counts;
 const detail=['이 작업은 되돌릴 수 없습니다. 보존 데이터 삭제 성공 후 모든 프로필 및 템플릿에서 해당 플러그인의 등록 액션도 정리합니다. 다른 액션과 프로필, 외부 백업은 유지합니다.',
   '삭제 대상: 보존 원본 '+c.retained+'개, 이전 코드 '+c.history+'개, 암호화 전역 설정 '+c.settings+'개, 확인된 인증정보 '+c.credential+'개.',
   '기존 버튼에 필요한 인증정보는 다시 등록해야 할 수 있습니다. 물리적 완전 삭제나 확인되지 않은 과거 인증정보 삭제를 보장하지 않습니다.'].join('\n');
 const first=await dialog.showMessageBox(window,{type:'warning',title:'보존 데이터 삭제',message:plan.name+' '+plan.version,detail,
   buttons:['취소','삭제 대상 확인'],defaultId:0,cancelId:0,noLink:true});
 if(first.response!==1)return null;
 const second=await dialog.showMessageBox(window,{type:'warning',title:'최종 삭제 확인',message:plan.name+'의 보존 데이터를 삭제하시겠습니까?',detail,
   buttons:['취소','보존 데이터 삭제'],defaultId:0,cancelId:0,noLink:true});
 if(second.response!==1)return null;
 audit.stage('execute');return legacy?sdk().purgeRetainedLegacy(id,plan.revision):sdk().purgeRetainedNative(id,plan.revision);
 });
}
ipcMain.handle('d200x:legacy-retained-purge',async(event,id)=>{assertEditor(event);return purgeRetainedWithApproval(id,true);});
ipcMain.handle('d200x:native-retained-purge',async(event,id)=>{assertEditor(event);return purgeRetainedWithApproval(id);});
ipcMain.handle('d200x:native-retained-restore',async(event,id)=>{
 assertEditor(event);
 return pluginAudit('restore',id,async audit=>{
 const plan=await sdk().planRetainedNative(id);audit.identify(plan);audit.mode('keepData');audit.stage('confirm');
 const choice=await dialog.showMessageBox(window,{type:'question',title:'보존 플러그인 다시 설치',
   message:plan.name+' '+plan.version+' 다시 설치',
   detail:['기존 버튼과 설정을 유지합니다. 실행 및 네트워크 접근은 아래 권한으로 다시 허용됩니다.', '권한: '+plan.permissions.join(', '),...(plan.permissions.includes('browser.open')?['버튼을 눌렀을 때 기본 브라우저에서 HTTP/HTTPS 주소 열기']:[]),...plan.endpoints].join('\n'),
   buttons:['취소','신뢰하고 다시 설치'],defaultId:0,cancelId:0,noLink:true});
 if(choice.response!==1)return null;
 audit.stage('execute');return sdk().restoreRetainedNative(id,plan.revision,plan.permissions.includes('browser.open'));
 });
});
ipcMain.handle('d200x:native-remove',async(event,id)=>{
 assertEditor(event);
 let purgeAfter=false;
 const removed=await pluginAudit('remove',id,async audit=>{
 const plan=await sdk().planNativeRemoval(id);audit.identify(plan);audit.mode('keepData');audit.stage('confirm');
 if(plan.dependents.length)throw Error('이 플러그인을 사용하는 다른 플러그인: '+plan.dependents.map(p=>p.name).join(', '));
 const choice=await dialog.showMessageBox(window,{type:'question',title:'플러그인 제거',message:plan.name+' '+plan.version+' 제거',
   detail:'데이터 유지 제거는 원본 코드와 설정·인증정보를 보존합니다. 데이터까지 삭제를 선택하면 먼저 제거한 뒤 실제 삭제 대상과 개수를 확인합니다. 데이터 유지 제거는 등록 버튼을 유지합니다. 보존 데이터까지 삭제하면 해당 플러그인의 등록 액션도 정리합니다.',
   buttons:['취소','데이터 유지 제거','제거 후 보존 데이터 삭제…'],defaultId:1,cancelId:0,noLink:true});
 if(![1,2].includes(choice.response))return null;
 purgeAfter=choice.response===2;
 audit.stage('execute');return sdk().removeNativeKeepingData(id,plan.revision);
 });
 if(!removed||!purgeAfter)return removed;
 // Removal is already committed; cancellation or failure of the second
 // operation must never masquerade as failure of the completed removal.
 try{
   const purged=await purgeRetainedWithApproval(id);
   return {...removed,purgeStatus:purged?.status||'cancelled'};
 }catch(error){return {...removed,purgeStatus:'failed',purgeError:String(error?.message||error)};}
});
ipcMain.handle('d200x:native-service-status',async(event,id)=>{assertEditor(event);return sdk().serviceStatus(id);});
ipcMain.handle('d200x:native-service-control',async(event,id,mode)=>{
  assertEditor(event);return sdk().manageService(id,mode);
});
ipcMain.handle('d200x:native-dynamic-options',async(event,id,action)=>{assertEditor(event);return sdk().dynamicOptions(id,action);});
ipcMain.handle('d200x:native-ha-sensor-preview',async(event,settings,index)=>{assertEditor(event);return sdk().nativeHaSensorPreview(settings,index);});
ipcMain.handle('d200x:native-ha-install',async(event,url,mode='install')=>{
  assertEditor(event);
  if(!['install','export'].includes(mode))throw Error('잘못된 HA 플러그인 작업');
  const manifest=require('./deckforge-ha-plugin.cjs').createHomeAssistantManifest(url);
  if(mode==='export'){
    const pack=await DeckForgePlugins.packageNativeManifest(manifest);
    const result=await dialog.showSaveDialog(window,{title:'HA 전용 설치 파일 저장',
      defaultPath:pack.filename,filters:[{name:'DeckForge 플러그인',extensions:['deckforgePlugin']}]});
    if(result.canceled||!result.filePath)return null;
    if(path.extname(result.filePath).toLowerCase()!=='.deckforgeplugin')throw Error('확장자는 .deckforgePlugin이어야 합니다.');
    await fs.promises.writeFile(result.filePath,pack.archive,{flag:'wx'});
    return {name:manifest.name,version:manifest.version,filePath:result.filePath};
  }
  return pluginAudit('install',manifest.id,async audit=>{
  audit.identify(manifest);
  const plan=await sdk().planBuiltinHa(manifest);audit.identify(plan);audit.operation(plan.kind);audit.stage('confirm');
  if(plan.kind==='rollback')throw Error('이전 버전 복원은 패키지 설치에서 진행하세요.');
  if(plan.kind==='unchanged')return {uuid:manifest.id,name:manifest.name,version:manifest.version};
  const verb=plan.kind==='install'?'설치':plan.kind==='configure'?'서버 변경':'업데이트';
  const choice=await dialog.showMessageBox(window,{type:'question',title:'Home Assistant '+verb,
    message:'DeckForge Home Assistant '+verb,detail:'연결 주소: '+manifest.networkEndpoints[0].url+'\n버전: '+(plan.kind==='install'?manifest.version:plan.currentVersion+' → '+manifest.version)+'\n페이지 독립 서비스 및 상태 구독·선택한 기기 제어를 허용합니다.\n같은 서버의 인증정보와 기존 버튼 설정은 보존됩니다. 다른 서버 주소에는 별도 인증정보가 필요합니다.',
    buttons:['취소',verb],defaultId:0,cancelId:0,noLink:true});
  if(choice.response!==1)return null;
  audit.stage('execute');return plan.kind==='install'?sdk().installNative(manifest):sdk().replaceBuiltinHa(manifest,plan.currentRevision);
  });
});
ipcMain.handle('d200x:native-github-install',async event=>{
  assertEditor(event);
  const manifest=require('./deckforge-github-plugin.cjs').createGitHubManifest();
  return pluginAudit('install',manifest.id,async audit=>{
    audit.identify(manifest);
    const plan=await sdk().planNativeInstall(manifest);audit.identify(plan);audit.operation(plan.kind);audit.stage('confirm');
    if(plan.kind==='rollback')throw Error('이전 버전 복원은 패키지 설치에서 진행하세요.');
    const verb=plan.kind==='install'?'설치':'업데이트';
    const choice=await dialog.showMessageBox(window,{type:'question',title:'GitHub 개발 현황 '+verb,message:manifest.name+' '+verb,
      detail:'GitHub API의 읽기 전용 HTTPS GET 조회를 허용합니다.\n주소: https://api.github.com/repos/ · 선택 저장소의 Actions 읽기 토큰을 별도로 암호화 등록합니다.\n빌드 실행이나 소스 변경 권한은 필요하지 않습니다.'+(manifest.permissions.includes('browser.open')?'\n버튼을 눌렀을 때 현재 빌드 상세 페이지를 기본 브라우저에서 여는 권한을 허용합니다.':''),
      buttons:['취소',verb],defaultId:0,cancelId:0,noLink:true});
    if(choice.response!==1)return null;
    audit.stage('execute');return plan.kind==='install'?sdk().installNative(manifest,manifest.permissions.includes('browser.open')):sdk().replaceNative(manifest,plan.currentRevision,manifest.permissions.includes('browser.open'));
  });
});
ipcMain.handle('d200x:native-github-options',async(event,repository)=>{assertEditor(event);return sdk().githubBuildOptions(repository);});
ipcMain.handle('d200x:native-browser-permission',async(event,id)=>{
  assertEditor(event);
  const info=await sdk().browserPermissionInfo(id);
  const choice=await dialog.showMessageBox(window,{type:'question',title:'플러그인 권한 관리',message:info.name+' '+info.version,
    detail:'웹페이지 열기: '+(info.approved?'승인됨':'승인되지 않음')+'\n버튼을 누른 경우에만 HTTP/HTTPS 주소를 기본 브라우저에서 열 수 있습니다.\n승인은 현재 설치된 플러그인에만 적용됩니다.',
    buttons:['닫기',info.approved?'권한 철회':'권한 승인'],defaultId:0,cancelId:0,noLink:true});
  if(choice.response!==1)return null;
  return sdk().setBrowserPermission(id,info.digest,!info.approved);
});
ipcMain.handle('d200x:native-credential-info',async(event,id)=>{assertEditor(event);return sdk().credentialInfo(id);});
ipcMain.handle('d200x:native-credential-write',async(event,id,binding,revision,token)=>{
  assertEditor(event);
  try{return await sdk().writeCredential(id,binding,revision,token);}
  catch{throw Error('인증정보 저장 실패: 암호화 저장소 또는 등록 주소를 확인하세요.');}
});
ipcMain.handle('d200x:fusion-addin-install',async event=>{
 assertEditor(event);
 const result=await Bundled.installFusionAddin();
 if(result.status!=='existing')return result;
 const plan=await Bundled.planFusionStateUpgrade();
 if(plan.status!=='ready')return result;
 const choice=await dialog.showMessageBox(window,{type:'question',title:'Fusion 상태 연동 확장',
   message:'기존 Fusion 애드인에 읽기 전용 상태 연동을 추가하시겠습니까?',
   detail:'확인된 Autodesk 원본 파일만 변경하며 원본을 별도로 보존합니다. 적용 후 Fusion을 다시 시작해야 합니다.',
   buttons:['취소','확장 적용'],defaultId:0,cancelId:0,noLink:true});
 if(choice.response!==1)return result;
 return Bundled.applyFusionStateUpgrade(plan);
});
ipcMain.handle('d200x:fusion-live-state',async event=>{
 assertEditor(event);return FusionState.readFusionState(fusionDiscoveryFile());
});
// Editor and integrated manager use the same shipped/user catalog and preference.
const fusionManagerDir=()=>{const staged=path.join(__dirname,'../fusion-manager');return fs.existsSync(path.join(staged,'fusion-language-catalog.cjs'))?staged:path.join(__dirname,'../../tools/fusion-manager')};
let fusionKoreanNamesPromise=null;
async function fusionButtonLanguageData(){
 const dir=fusionManagerDir(),Language=require(path.join(dir,'fusion-language-catalog.cjs'));
 if(!fusionKoreanNamesPromise)fusionKoreanNamesPromise=(async()=>{
  const staged=path.join(dir,'fusion-command-catalog-final.json');
  const file=fs.existsSync(staged)?staged:path.join(dir,'../fusion-mcp/fusion-command-catalog-final.json');
  const raw=JSON.parse(await fs.promises.readFile(file,'utf8'));
  const names=require('./ai/fusion-commands.cjs').normaliseCatalog(raw);
  return Object.fromEntries([...names].filter(([,v])=>v.ko).map(([id,v])=>[id,v.ko]));
 })().catch(error=>{console.warn('Fusion 한글 카탈로그 읽기 실패:',error.message);return {}});
 const [ko,english,language]=await Promise.all([fusionKoreanNamesPromise,Language.loadEnglish(dir,app.getPath('userData')),Language.loadDisplayLanguage(app.getPath('userData'))]);
 return {ko,en:english.commands,language};
}
ipcMain.handle('d200x:fusion-button-language',async event=>{assertEditor(event);return fusionButtonLanguageData()});
// The existing manager renderer lives in one isolated child view, not another OS window.
let fusionPanelSession=null,fusionPanelOpening=null;
function fitFusionPanelWindow(bounds,width,area){
 const w=Math.min(area.width,Math.max(1,Math.round(width)));
 return {...bounds,width:w,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-w))};
}
function canResizeFusionPanel(win){return !win.isMaximized()&&!win.isFullScreen()&&!win.isSnapped?.();}
const integratedManager=()=>require(path.join(fusionManagerDir(),'main.cjs'));
function fusionManagerBridge(operation,argument){
 if(operation==='open-deckforge'){revealEditor();return true}
 if(operation==='language-changed'){send('d200x:fusion-language-changed',null);return true}
 if(operation==='collect-tooltips')return collectFusionTooltips();
 if(operation==='read-tooltip')return readCachedFusionTooltip(argument);
 if(operation==='dock')return {available:false,attached:false};
 return false;
}
let fusionMaintenanceBusy=false;
ipcMain.handle('d200x:fusion-manager-maintenance',async(event,operation)=>{
 assertEditor(event);
 if(event.senderFrame!==event.sender.mainFrame||!['prepareEnglish','importEnglish','importCapture','exploreIcons'].includes(operation))throw Error('허용되지 않은 Fusion 관리 요청');
 if(fusionMaintenanceBusy)throw Error('명령 데이터 관리 작업이 진행 중입니다.');
 fusionMaintenanceBusy=true;
 try{
   const editor=window;
   const view=await integratedManager().openEmbeddedManager(fusionManagerBridge,editor);
   if(editor!==window||editor.isDestroyed()||view.webContents.isDestroyed())throw Error('편집기가 닫혔습니다.');
   return await view.webContents.executeJavaScript('window.DeckForgeFusionMaintenance('+JSON.stringify(operation)+')',true);
 }finally{fusionMaintenanceBusy=false;}
});
function applyFusionPanelBounds(rect){
 if(!fusionPanelSession||!window||window.isDestroyed())return false;
 const zoom=window.webContents.getZoomFactor(),size=window.getContentBounds();
 if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key])))return false;
 const x=Math.max(0,Math.round(rect.x*zoom)),y=Math.max(0,Math.round(rect.y*zoom));
 const width=Math.max(0,Math.min(size.width-x,Math.round(rect.width*zoom)));
 const height=Math.max(0,Math.min(size.height-y,Math.round(rect.height*zoom)));
 return integratedManager().setEmbeddedPanelBounds(window,{x,y,width,height},rect.visible===true&&width>0&&height>0);
}
async function closeIntegratedManager(){
 const session=fusionPanelSession;if(!session)return false;
 fusionPanelSession=null;
 if(!window||window.isDestroyed())return false;
 integratedManager().hideEmbeddedPanel(window);
 try{await window.webContents.executeJavaScript('window.DeckForgeFusionPanel?.(false)');}
 finally{if(session.resized&&canResizeFusionPanel(window)){
   const bounds=window.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
   window.setBounds(fitFusionPanelWindow(bounds,session.width,area));
 }}
 return true;
}
async function openIntegratedManager(){
 if(!window||window.isDestroyed())return false;
 if(fusionPanelOpening)return fusionPanelOpening;
 if(fusionPanelSession){revealEditor();applyFusionPanelBounds(await window.webContents.executeJavaScript('window.DeckForgeFusionPanel?.(true)'));return true;}
 fusionPanelOpening=(async()=>{
  const editor=window;
  revealEditor();
  const sidebar=await editor.webContents.executeJavaScript("document.querySelector('.library').getBoundingClientRect().width");
  if(!Number.isFinite(sidebar))throw Error('오른쪽 패널을 찾을 수 없습니다.');
  const bounds=editor.getBounds(),zoom=editor.webContents.getZoomFactor(),area=screen.getDisplayMatching(bounds).workArea;
  fusionPanelSession={width:bounds.width,resized:false};
  try{
   const integrated=integratedManager();
   await integrated.openEmbeddedManager(fusionManagerBridge,editor);
   if(editor.isDestroyed()||window!==editor)throw Error('편집기 창이 닫혔습니다.');
   if(canResizeFusionPanel(editor)){
    const next=fitFusionPanelWindow(bounds,bounds.width+Math.max(0,699-sidebar)*zoom,area);
    if(next.width!==bounds.width){editor.setBounds(next);fusionPanelSession.resized=true;}
   }
   const rect=await editor.webContents.executeJavaScript('window.DeckForgeFusionPanel?.(true)');
   if(!rect)throw Error('Fusion 표시 영역을 만들지 못했습니다.');
   applyFusionPanelBounds(rect);return true;
  }catch(error){await closeIntegratedManager();throw error;}
 })().finally(()=>{fusionPanelOpening=null;});
 return fusionPanelOpening;
}
ipcMain.handle('d200x:open-fusion-manager',async event=>{
 assertEditor(event);return openIntegratedManager();
});
ipcMain.handle('d200x:close-fusion-manager',async event=>{
 assertEditor(event);return closeIntegratedManager();
});
ipcMain.on('d200x:fusion-panel-bounds',(event,rect)=>{
 if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return;
 applyFusionPanelBounds(rect);
});

async function installNativePackage(packageData,audit,{forceConfirm=false,requireUpdate=false,source='',beforeExecute}={}){
      const native=packageData.native;audit.identify(native);
      const labels={'settings.write':'현재 버튼 설정 저장','navigation':'프로필·페이지·덱폴더 이동','wide.mode':'와이드 화면 모드 전환','wide.overlay':'와이드 화면 임시 이미지·레이아웃 표시','global.settings':'플러그인 전역 암호화 설정 읽기·쓰기','network.request':'승인된 HTTPS 주소로 네트워크 요청','timer.tick':'활성 화면에서 주기적 표시 갱신','network.poll':'승인된 HTTPS GET 주소 주기적 조회','network.websocket':'승인된 WSS 실시간 연결 및 메시지 송수신','background.run':'페이지와 무관하게 독립 서비스 실행 및 상태 공유','browser.open':'버튼을 눌렀을 때 기본 브라우저에서 HTTP/HTTPS 주소 열기'};
      const plan=await sdk().planNativeInstall(native);if(requireUpdate&&plan.kind!=='update')throw Error('최신 버전 업데이트만 허용됩니다.');audit.identify(plan);audit.operation(plan.kind);audit.stage('confirm');
      const extra=native.permissions.filter(p=>p!=='display');
      const dependencies=Object.entries(native.dependencies||{}).map(([id,range])=>id+' '+range);
      const conversion=packageData.meta.source?.kind==='ulanzi-converted'?packageData.meta.source:null;
      if(forceConfirm||extra.length||dependencies.length||conversion||plan.kind!=='install'){
        const verb=plan.kind==='update'?'업데이트':plan.kind==='rollback'?'이전 버전 복원':'설치';
        const versions=plan.kind==='install'?native.version:plan.currentVersion+' → '+native.version;
        const result=await dialog.showMessageBox(window,{
          type:'question',title:'DeckForge 플러그인 '+verb,message:native.name+' '+verb+' 확인',
          detail:(source?source+'\n':'')+'ID: '+native.id+'\n버전: '+versions+'\n'+extra.map(p=>'• '+labels[p]).join('\n')+'\n'+
            (conversion?'Ulanzi 변환 원본: '+conversion.originalId+'\n검토 기록 해시: '+conversion.reviewSha256+'\n검토 기록은 전자서명 또는 실기 인증서가 아닙니다.\n':'')+
            (dependencies.length?'필요 플러그인: '+dependencies.join(', ')+'\n':'')+
            (native.networkEndpoints?.length?'허용할 네트워크 요청:\n'+native.networkEndpoints.map(e=>e.method+' '+e.url+(e.pathKeys?e.pathKeys.map(k=>'{'+k+'}').join('/'):'')+(e.queryKeys?' · 쿼리: '+e.queryKeys.join(', '):'')+(e.headerKeys?' · 헤더: '+e.headerKeys.join(', '):'')+(e.auth==='bearer'?' · Bearer 인증':e.auth==='home-assistant'?' · Home Assistant 메시지 인증':'')+(e.reconnect?' · 제한 자동 재연결':'')).join('\n')+'\n':'')+
            (plan.kind==='install'?'':'이전 코드 보존 · 설정과 프로필은 그대로 유지됩니다.\n')+'신뢰하는 플러그인만 설치하세요.',
          buttons:['취소',verb],defaultId:0,cancelId:0,noLink:true
        });
        if(result.response!==1)return null;
      }
      beforeExecute?.();audit.stage('execute');return plan.kind==='install'?sdk().installNative(native,native.permissions.includes('browser.open')):sdk().replaceNative(native,plan.currentRevision,native.permissions.includes('browser.open'));
}
ipcMain.handle('d200x:sdk-install',async event=>{
 assertEditor(event);
 return pluginAudit('install',null,async audit=>{
  audit.stage('select');const selected=await openRememberedPicker({
    title:'DeckForge 플러그인 설치',
    properties:['openFile'],
    filters:[
      {name:'DeckForge 플러그인',extensions:['deckforgePlugin']},
      {name:'Stream Deck 플러그인',extensions:['streamDeckPlugin','zip']}
    ]
  });
  if(!selected)return null;
  audit.stage('validate');const stat=await fs.promises.stat(selected);
  if(!stat.isFile()||stat.size>40*1024*1024)throw Error('40MB 이하의 플러그인만 가져올 수 있습니다.');
  const bytes=await fs.promises.readFile(selected);
  if(path.extname(selected).toLowerCase()==='.deckforgeplugin'){
    const packageData=await DeckForgePlugins.parseDeckForgePackage(bytes);
    // Preserve the SDK compatibility runtime; independent DeckForge package
    // metadata and payload have already passed validation.
    if(packageData.native){
      return installNativePackage(packageData,audit);
    }
    audit.stage('execute');return sdk().install(packageData.archive);
  }
  audit.stage('execute');return sdk().install(bytes);
 });
});
ipcMain.handle('d200x:deckforge-export-plugin',async event=>{
  assertEditor(event);
  const selected=await openRememberedPicker({
    title:'DeckForge 플러그인 패키지 만들기 · .sdPlugin 폴더 선택',
    properties:['openDirectory']
  },'deckforge-plugin-export');
  if(!selected)return null;
  const pack=await DeckForgePlugins.packageSdPluginDirectory(selected);
  const result=await dialog.showSaveDialog(window,{
    title:'DeckForge 전용 설치 파일 저장',
    defaultPath:path.join(path.dirname(selected),pack.filename),
    filters:[{name:'DeckForge 플러그인',extensions:['deckforgePlugin']}]
  });
  if(result.canceled||!result.filePath)return null;
  if(path.extname(result.filePath).toLowerCase()!=='.deckforgeplugin')
    throw Error('DeckForge 플러그인 설치 파일은 .deckforgePlugin 확장자여야 합니다.');
  try{
    await fs.promises.writeFile(result.filePath,pack.archive,{flag:'wx'});
  }catch(error){
    if(error.code==='EEXIST')throw Error('같은 이름의 파일이 이미 존재합니다. 원본 파일을 보존하기 위해 덮어쓰지 않았습니다.');
    throw error;
  }
  return {name:pack.meta.plugin.name,version:pack.meta.plugin.version,filePath:result.filePath};
});
ipcMain.handle('d200x:sdk-install-folder',async event=>{
 assertEditor(event);
 return pluginAudit('install',null,async audit=>{
  audit.stage('select');const selected=await openRememberedPicker({
    title:'DeckForge 플러그인 폴더 선택',
    properties:['openDirectory']
  },'sdk-plugin-folder');
  if(!selected)return null;
  audit.stage('execute');return sdk().installDirectory(selected);
 });
});
ipcMain.handle('d200x:sdk-sync',async(event,configs)=>{
  assertEditor(event);
  if(!Array.isArray(configs)||configs.length>32)throw Error('플러그인 액션 목록 크기 오류');
  const {validSdkMount}=require('./deck-core.js'),contexts=new Set(),instances=new Set(),locations=new Set();
  for(const cfg of configs){
    const location=cfg?.slot+':'+cfg?.gesture;
    if(!validSdkMount(cfg)||contexts.has(cfg.context)||instances.has(cfg.instanceId)||locations.has(location))
      throw Error('플러그인 실행 식별자 오류');
    contexts.add(cfg.context);instances.add(cfg.instanceId);locations.add(location);
  }
  await sdk().sync(configs);return true;
});
ipcMain.handle('d200x:native-settings-receipt',async(event,context,id,accepted)=>{
  assertEditor(event);
  if(typeof context!=='string'||context.length>160||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||typeof accepted!=='boolean')return false;
  // A success ACK must correspond to the durable, atomic profile receipt.
  const durable=profileStore.nativeReceipt(context,id)==='saved';
  if(durable!==accepted)return false;
  return sdk().acknowledgeSettings(context,id,accepted);
});
ipcMain.handle('d200x:sdk-key',async(event,context,gesture,ticks)=>{
  assertEditor(event);
  return sdk().key(context,gesture,ticks);
});
ipcMain.handle('d200x:sdk-inspector',async(event,context,anchor)=>{
  assertEditor(event);return sdk().inspector(context,anchor);
});

const haConfigPath=()=>path.join(app.getPath('userData'),'home-assistant-connection-v1.json');
function readHaConfig(){
  try{
    const saved=JSON.parse(fs.readFileSync(haConfigPath(),'utf8'));
    if(!saved?.tokenEncrypted||!safeStorage.isEncryptionAvailable())return null;
    return {url:HA.normalizeUrl(saved.url),token:safeStorage.decryptString(Buffer.from(saved.tokenEncrypted,'base64'))};
  }catch{return null;}
}
function saveHaConfig(url,token){
  if(!safeStorage.isEncryptionAvailable())throw new Error('암호화 저장을 사용할 수 없습니다. 토큰을 저장하지 않았습니다.');
  const next={url:HA.normalizeUrl(url),tokenEncrypted:safeStorage.encryptString(token).toString('base64')};
  const dest=haConfigPath(),tmp=dest+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(next),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,dest);}
  catch(error){try{fs.unlinkSync(tmp);}catch{}throw error;}
}
function assertEditor(event){
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
}
// Independent AI window; only a closed read-only query factory is provided.
const {createReader:createAiReader,windowsApps}=require('./ai/read-tools.cjs');
const FusionSetup=require('./ai/fusion-setup.js');
const LiveFusion=require('./ai/fusion-commands.cjs');
const DesktopMcp=require('./ai/fusion-desktop-mcp.cjs');
const fusionMcpSettingsFile=()=>path.join(app.getPath('userData'),'fusion-mcp-settings-v1.json');
async function loadFusionMcpEndpoint(){
 const file=fusionMcpSettingsFile();
 try{
   const stat=await fs.promises.stat(file);
   if(!stat.isFile()||stat.size>4096)throw Error('MCP 설정 파일 오류');
   return DesktopMcp.normalizeEndpoint(JSON.parse(await fs.promises.readFile(file,'utf8')).endpoint);
 }catch(error){if(error.code==='ENOENT')return DesktopMcp.DEFAULT_ENDPOINT;throw error;}
}
const fusionMcp=DesktopMcp.createClient(fetch,loadFusionMcpEndpoint);
ipcMain.handle('d200x:fusion-mcp-settings',async event=>{
 assertEditor(event);return {endpoint:await loadFusionMcpEndpoint()};
});
ipcMain.handle('d200x:fusion-mcp-check',async(event,address)=>{
 assertEditor(event);
 const endpoint=DesktopMcp.normalizeEndpoint(address);
 return {endpoint,...await DesktopMcp.createClient(fetch,()=>endpoint).check()};
});
ipcMain.handle('d200x:fusion-mcp-save',async(event,address)=>{
 assertEditor(event);
 const endpoint=DesktopMcp.normalizeEndpoint(address);
 const file=fusionMcpSettingsFile(),temp=file+'.'+randomUUID()+'.tmp';
 await fs.promises.mkdir(path.dirname(file),{recursive:true});
 try{await fs.promises.writeFile(temp,JSON.stringify({endpoint}),{encoding:'utf8',flag:'wx'});await fs.promises.rename(temp,file);}
 finally{await fs.promises.rm(temp,{force:true}).catch(()=>{});}
 return {endpoint};
});
const fusionCommands=LiveFusion.createClient({
  discoveryFile:fusionDiscoveryFile(),
  catalogFile:path.join(__dirname,'../fusion-manager/fusion-command-catalog-final.json')
});
// Bulk original Fusion descriptions; one bounded GET, no command execution.
const fusionTooltipFolder=()=>path.join(app.getPath('userData'),'Cache','Fusion','descriptions');
const fusionTooltipCatalog=()=>path.join(fusionTooltipFolder(),'catalog-v1.json');
let tooltipCatalogPromise=null,tooltipCollection=null;
function readFusionTooltipCatalog(){
 if(!tooltipCatalogPromise)tooltipCatalogPromise=(async()=>{
   try{
     const file=fusionTooltipCatalog(),stat=await fs.promises.stat(file);
     if(!stat.isFile()||stat.size>48*1024*1024)throw Error('tooltip-cache-size');
     const parsed=JSON.parse(await fs.promises.readFile(file,'utf8'));
     return LiveFusion.mergeTooltips(parsed?.tooltips,[]).data;
   }catch{return Object.create(null);}
 })();
 return tooltipCatalogPromise;
}
function collectFusionTooltips(inventory=null,signal){
 if(tooltipCollection)return tooltipCollection;
 tooltipCollection=(async()=>{
   let data=inventory;
   if(!data)try{data=await fusionMcp.listCommands(signal);}catch{signal?.throwIfAborted();}
   const rows=data?data.commands:await fusionCommands.listDetails(signal);
   const merged=LiveFusion.mergeTooltips(await readFusionTooltipCatalog(),rows.map(row=>({...row,tooltip:DesktopMcp.plainTooltip(row.tooltip)})));
   if(merged.collected){
     const file=fusionTooltipCatalog(),temp=file+'.'+randomUUID()+'.tmp';
     const payload=JSON.stringify({version:1,collectedAt:new Date().toISOString(),tooltips:merged.data});
     if(Buffer.byteLength(payload)>48*1024*1024)throw Error('tooltip-cache-size');
     await fs.promises.mkdir(fusionTooltipFolder(),{recursive:true});
     try{await fs.promises.writeFile(temp,payload,{encoding:'utf8',flag:'wx'});await fs.promises.rename(temp,file);}
     finally{await fs.promises.rm(temp,{force:true}).catch(()=>{});}
     tooltipCatalogPromise=Promise.resolve(merged.data);
   }
   return {scanned:merged.scanned,collected:merged.collected,missing:merged.missing,total:merged.total,source:data?'MCP':'addin',errors:data?.errors||0};
 })().finally(()=>{tooltipCollection=null;});
 return tooltipCollection;
}
// Hover reads cache only, never calls Fusion or triggers a collection.
async function readCachedFusionTooltip(id){
 if(!LiveFusion.safeId(id))return '';
 const bulk=await readFusionTooltipCatalog();
 if(bulk[id])return bulk[id];
 try{
   const file=path.join(fusionTooltipFolder(),id+'.json'),stat=await fs.promises.stat(file);
   if(stat.isFile()&&stat.size<=8192){
     const row=JSON.parse(await fs.promises.readFile(file,'utf8'));
     if(row.id===id&&typeof row.tooltip==='string')return DesktopMcp.plainTooltip(row.tooltip).slice(0,1000);
   }
 }catch{}
 return '';
}
ipcMain.handle('d200x:fusion-tooltip-read',async(event,id)=>{
 assertEditor(event);return readCachedFusionTooltip(id);
});
// Read-only command information, with per-command local tooltip cache.
ipcMain.handle('d200x:fusion-command-details',async(event,id)=>{
  assertEditor(event);
  if(!LiveFusion.safeId(id))throw Error('invalid-fusion-command-id');
  const folder=fusionTooltipFolder();
  const file=path.join(folder,id+'.json');
  const bulk=await readFusionTooltipCatalog();
  let cached=bulk[id]||'';
  try{const stat=await fs.promises.stat(file);if(stat.isFile()&&stat.size<=8192){const row=JSON.parse(await fs.promises.readFile(file,'utf8'));if(!cached&&row.id===id&&typeof row.tooltip==='string')cached=row.tooltip.slice(0,1000);}}catch{}
  const names=await fusionButtonLanguageData().catch(()=>({ko:{},en:{}}));
  let live=null;
  if(!cached)try{live=await fusionCommands.details(id);}catch{}
  const tooltip=live?.tooltip||cached;
  if(live?.tooltip&&live.tooltip!==cached){
    const temp=file+'.'+randomUUID()+'.tmp';
    try{await fs.promises.mkdir(folder,{recursive:true});await fs.promises.writeFile(temp,JSON.stringify({id,tooltip:live.tooltip}),'utf8');await fs.promises.rename(temp,file);}catch{await fs.promises.rm(temp,{force:true}).catch(()=>{});}
  }
  return {id,ko:names.ko[id]||live?.ko||'',en:names.en[id]||live?.en||'',tooltip};
});
// One-click bulk collection. Existing icon cache files are never overwritten.
async function collectInitialFusionIcons(rows,signal){
 const dir=path.join(app.getPath('userData'),'Cache','Fusion','original');
 const info=JSON.parse(await fs.promises.readFile(fusionDiscoveryFile(),'utf8'));
 if(info?.status!=='running'||!Number.isInteger(info.port)||info.port<1||info.port>65535)throw Error('Fusion icon server unavailable');
 await fs.promises.mkdir(dir,{recursive:true});
 const ids=[...new Set(rows.map(r=>r.id).filter(LiveFusion.safeId))];
 const counts={total:ids.length,saved:0,cached:0,missing:0,failed:0};
 let next=0;
 async function worker(){
  while(next<ids.length){
   signal?.throwIfAborted();
   const id=ids[next++];
   try{
    let present=false;
    for(const [folder,ext] of [[dir,'png'],[dir,'svg'],[fusionCacheDir(),'png']]){
     try{const st=await fs.promises.stat(path.join(folder,id+'.'+ext));if(st.isFile()&&st.size>=8&&st.size<=768*1024){present=true;break;}}catch{}
    }
    if(present){counts.cached++;continue;}
    const timeout=AbortSignal.timeout(6500);
    const reply=await fetch('http://127.0.0.1:'+info.port+'/icon?commandId='+encodeURIComponent(id)+'&size=32',{redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    if(reply.status===404){counts.missing++;await reply.body?.cancel();continue;}
    if(!reply.ok||!reply.body){await reply.body?.cancel();throw Error('icon HTTP');}
    const type=(reply.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const ext=type==='image/png'?'png':type==='image/svg+xml'?'svg':null;
    if(!ext){await reply.body.cancel();throw Error('icon type');}
    const reader=reply.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>768*1024)throw Error('icon size');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=Buffer.concat(chunks);
    if(bytes.length<8||(ext==='png'?bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a':!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString('utf8').replace(/<!--[\s\S]*?-->/g,''))))throw Error('icon format');
    const target=path.join(dir,id+'.'+ext),temp=target+'.'+randomUUID()+'.tmp';
    try{
     await fs.promises.writeFile(temp,bytes,{flag:'wx'});
     try{await fs.promises.link(temp,target);counts.saved++;}catch(error){if(error.code==='EEXIST')counts.cached++;else throw error;}
    }finally{await fs.promises.rm(temp,{force:true}).catch(()=>{});}
   }catch{signal?.throwIfAborted();counts.failed++;}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,ids.length)},worker));
 return counts;
}
async function collectInitialFusionData(signal){
 let inventory=null;
 try{inventory=await fusionMcp.listCommands(signal);}catch{signal?.throwIfAborted();}
 let descriptions=null,icons=null;
 try{descriptions=await collectFusionTooltips(inventory,signal);}catch{signal?.throwIfAborted();}
 try{icons=await collectInitialFusionIcons(inventory?.commands||await fusionCommands.list(signal),signal);}catch{signal?.throwIfAborted();}
 return {descriptions,icons};
}
async function runLocalFusionSetup(signal){
  if(process.platform!=='win32')throw Error('Windows에서만 지원합니다.');
  return FusionSetup.run({
    apps:s=>windowsApps('start_apps',s),
    plugin:()=>Bundled.installFusionPlugin(sdk()),
    addin:()=>Bundled.installFusionAddin(undefined,{configureStartup:true}),
    health:fusionAddinAvailable,
    ensure:(target,s)=>fusionMcp.ensureAddin(target,s),
    collect:collectInitialFusionData,
    probe:async id=>(await runAppFocus(__dirname,{kind:'AppID',target:requireStartAppId(id)},'Probe')).status,
    launch:id=>openLocalPath({target:'appid',filePath:APP_ID_PREFIX+requireStartAppId(id)}),
    sleep:(ms,s)=>require('node:timers/promises').setTimeout(ms,undefined,{signal:s})
  },signal);
}
function newAiReadSession(){
  return createAiReader({
    root:__dirname,userData:app.getPath('userData'),
    view:async()=>{
      if(!rendererReady||!window||window.isDestroyed())return null;
      // Constant expression only. No model-provided JavaScript or raw state transfer.
      return window.webContents.executeJavaScript(`(()=>{
        if(typeof state==='undefined')return null;
        let items=state.pages?.[state.page],folder=null,route=[];
        for(const [depth,slot] of (state.folderPath||[]).entries()){
          folder=items?.[slot]||(depth===0?state.pinned?.[slot]:null);
          if(folder?.type!=='folder'){folder=null;break;}
          const p=Number.isInteger(folder.pageIndex)?folder.pageIndex:0;
          route.push((slot+1)+':'+(p+1));items=p===0?folder.children:folder.pages?.[p-1];
        }
        return {profileNumber:(state.profileNames||[]).findIndex(p=>p.id===state.profileId)+1,
          page:state.page+1,folderSlots:(state.folderPath||[]).map(i=>i+1).slice(0,8),
          folderPage:(folder?.pageIndex||0)+1,folderRoute:route.join('/')||null,
          selected:Number.isInteger(state.selected)?state.selected+1:null,
          dirty:Boolean(inspectorSession?.dirty),storageFailure:Boolean(profileStorageFailure)};
      })()`);
    },
    device:async()=>({connected:!!transport.deck.connected,session:transport.session,sleeping:transport.sleeping,
      brightness:transport.brightness,wideRequested:transport.wideMode,wideApplied:transport.appliedWideMode,
      transferPending:Boolean(transport.pending||transport.inFlight),
      lastWriteAt:transport.lastWriteAt?new Date(transport.lastWriteAt).toISOString():null,
      source:'HID transport state, not proof of physical screen or action success'}),
    inputs:()=>aiEvidence.list().slice(-64).map(({events,...input})=>input),
    evidence:()=>aiEvidence.list(),
    version:app.getVersion(),
    ha:async()=>{
      const config=readHaConfig();
      if(!config)return {configured:false,entities:[]};
      try{return {configured:true,entities:await HA.listEntities(config,(url,options)=>fetch(url,{...options,redirect:'error'}))};}
      catch{return {configured:true,entities:[],error:'ha_read_unavailable'};}
    },
    fusion:fusionAddinAvailable,
    fusionCommands:signal=>fusionCommands.list(signal)
  })();
}
// Only fixed editor entry points. All arguments are JSON data; no model-authored scripts.
async function aiEditorCall(method,arg){
  if(!['capture','types','prepare','prepareAdvanced','advancedTypes','apply','discard','undo'].includes(method)||!rendererReady||!window||window.isDestroyed())throw Error('DeckForge 편집 화면을 열어 주세요.');
  const literal=JSON.stringify(JSON.stringify(arg)).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const result=await window.webContents.executeJavaScript('(async()=>{try{return {ok:true,value:await window.DeckForgeAiEdit.'+method+'(JSON.parse('+literal+'))};}catch(e){return {ok:false,error:String(e?.message||e).slice(0,200)};}})()');
  if(!result?.ok)throw Error(result?.error||'편집 화면 응답 오류');return result.value;
}
const {validate:validateAiEdit}=require('./ai/edit-plan.js');
const {validate:validateAdvancedEdit}=require('./ai/advanced-plan.js');
async function resolveAiTarget(type,value,userText){
    let info;
    const appId=value.startsWith('shell:AppsFolder\\')?value.slice('shell:AppsFolder\\'.length):value;
    if(type==='open-app'&&!/^[A-Za-z]:[\\/]/.test(value)){
      if(!/^[A-Za-z0-9_.!{}-]{1,180}$/.test(appId))throw Error('확인된 시작 메뉴 AppID가 필요합니다.');
      info=await inspectStartApplication(appId);
    }else{
      // Explicit user-provided absolute drive path only. No UNC, environment expansion,
      // command lines, alternate streams, device names, traversal or script targets.
      if(!/^[A-Za-z]:\\[^<>:"|?*\x00-\x1f]+$/.test(value)||value.slice(3).split('\\').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(x))||!userText.toLowerCase().includes(value.toLowerCase()))throw Error('파일 폴더 경로를 질문에 직접 입력해 주세요.');
      const ext=path.win32.extname(value).toLowerCase();
      if(type==='open-app'&&ext!=='.exe')throw Error('프로그램 실행 파일은 EXE만 지원합니다.');
      if(type==='file-open'&&['.exe','.com','.bat','.cmd','.ps1','.vbs','.js','.jse','.wsf','.wsh','.msi','.lnk','.url','.scr','.hta','.reg','.cpl','.pif'].includes(ext))throw Error('실행 파일은 프로그램 열기로 등록하세요.');
      const stat=await fs.promises.stat(value);
      if(type==='folder-shortcut'?!stat.isDirectory():!stat.isFile())throw Error('파일 또는 폴더 유형이 맞지 않습니다.');
      if(type==='open-app')info=await inspectWindowsApplication(value);
      else{
        let icon='';
        try{const image=await app.getFileIcon(value,{size:'large'});if(image&&!image.isEmpty())icon='data:image/png;base64,'+image.toPNG().toString('base64');}catch{}
        info={path:value,name:path.win32.basename(value)||value,icon};
      }
    }
    return {type,requested:value,path:info.path,name:info.name,artwork:info.icon||''};
}
async function prepareAiEdit(id,input,userText,signal){
  if(input?.advanced){
    const advanced=validateAdvancedEdit(input.advanced),c=JSON.parse(advanced.configJson),resources={};
    signal?.throwIfAborted();
    if(advanced.kind==='folder_keys'){
      const types=await aiEditorCall('advancedTypes',{id,input:advanced});resources.targets=[];
      for(const [i,x] of c.keys.entries()){
        signal?.throwIfAborted();
        const type=types[i];resources.targets.push(['open-app','file-open','folder-shortcut'].includes(type)&&typeof x.value==='string'?await resolveAiTarget(type,x.value,userText):null);
      }
    }
    if(advanced.kind==='profile_build'){
      resources.targets=[];
      for(const x of c.keys){
        signal?.throwIfAborted();
        resources.targets.push(['open-app','file-open','folder-shortcut'].includes(x.type)&&typeof x.value==='string'?await resolveAiTarget(x.type,x.value,userText):null);
      }
    }
    const fusionIds=advanced.kind==='fusion_batch'?c.keys.map(x=>x.id):advanced.kind==='profile_build'?c.keys.filter(x=>x.type==='fusion-live').map(x=>x.value):[];
    if(fusionIds.length){
      const plugin=(await sdk().list()).find(p=>p.uuid===LiveFusion.PLUGIN);
      if(!plugin?.actions?.some(x=>x.uuid===LiveFusion.ACTION))throw Error('Fusion SDK 플러그인을 먼저 설치하세요.');
      let available;try{available=await fusionCommands.list(signal);}catch{signal?.throwIfAborted();throw Error('Fusion 연결 또는 명령 조회에 실패했습니다. Fusion 연결을 확인하세요.');}
      const byId=new Map(available.map(x=>[x.id,x]));
      resources.fusionBatch=[...new Set(fusionIds)].map(id=>{
        const found=byId.get(id);
        if(!found)throw Error('현재 Fusion에서 일괄 등록할 명령 ID를 확인하지 못했습니다.');
        return {id:found.id,name:found.ko||found.name};
      });
    }
    if(advanced.kind==='plugin'&&c.kind==='fusion-live'){
      const plugin=(await sdk().list()).find(p=>p.uuid===LiveFusion.PLUGIN);
      if(!plugin?.actions?.some(x=>x.uuid===LiveFusion.ACTION))throw Error('Fusion SDK 플러그인을 먼저 설치하세요.');
      let found;try{found=await fusionCommands.exact(c.id,signal);}catch{signal?.throwIfAborted();throw Error('Fusion 연결 또는 명령 조회에 실패했습니다. Fusion 연결을 확인하세요.');}
      if(!found)throw Error('현재 Fusion에서 해당 명령 ID를 확인하지 못했습니다.');
      resources.fusionLive={id:found.id,name:found.ko||found.name};
    }
    if(advanced.kind==='plugin'&&c.kind==='ha'){
      const config=readHaConfig();
      if(!config)throw Error('내장 HA 연결 설정이 필요합니다.');
      const entities=await HA.listEntities(config,(url,options)=>fetch(url,{...options,redirect:'error'}));
      const found=entities.find(x=>x.entity_id===c.id);
      if(!found)throw Error('HA 엔티티를 확인하지 못했습니다.');
      resources.ha={id:found.entity_id,name:found.name};
    }
    signal?.throwIfAborted();
    return aiEditorCall('prepareAdvanced',{id,input:advanced,resources});
  }
  const valid=validateAiEdit(input),types=await aiEditorCall('types',{id,input:valid});
  const targets=[];
  for(const [i,o] of valid.operations.entries()){
    signal?.throwIfAborted();
    const type=types[i],value=o.value;
    if(!['put','update'].includes(o.op)||!['open-app','file-open','folder-shortcut'].includes(type)||value===null){targets.push(null);continue;}
    targets.push(await resolveAiTarget(type,value,userText));
  }
  signal?.throwIfAborted();return aiEditorCall('prepare',{id,input:valid,targets});
}
require('./ai/window.cjs').registerAiWindow(assertEditor,newAiReadSession,{capture:id=>aiEditorCall('capture',id),prepare:prepareAiEdit,apply:id=>aiEditorCall('apply',id),discard:id=>aiEditorCall('discard',id),undo:id=>aiEditorCall('undo',id)},runLocalFusionSetup);
ipcMain.handle('d200x:ha-status',event=>{
  assertEditor(event);
  const config=readHaConfig();
  return {configured:!!config,url:config?.url||''};
});
ipcMain.handle('d200x:ha-save',async(event,args)=>{
  assertEditor(event);
  if(typeof args?.token!=='string'||!args.token.trim()||args.token.length>4096)
    throw new Error('유효한 HA 장기 액세스 토큰을 입력하세요.');
  const config={url:HA.normalizeUrl(args.url),token:args.token.trim()};
  await HA.test(config);
  saveHaConfig(config.url,config.token);
  return {configured:true,url:config.url};
});
ipcMain.handle('d200x:ha-entities',async event=>{
  assertEditor(event);
  return HA.listEntities(readHaConfig());
});
ipcMain.handle('d200x:ha-toggle',async(event,entityId)=>{
  assertEditor(event);
  return HA.toggle(readHaConfig(),entityId);
});


// DeckForge owns a dedicated Windows roaming AppData directory.
// Do not migrate, copy, delete, or reuse legacy product data here.
app.setPath('userData',path.join(app.getPath('appData'),'DeckForge'));

// File-backed profiles are the default on Windows. Synchronous IPC preserves
// the existing inspector save/cancel contract while moving images off localStorage.
const profileStore=new ProfileStore(app.getPath('userData'));
ipcMain.on('d200x:profile-read',(event)=>{
  try{
    assertEditor(event);
    event.returnValue={ok:true,state:profileStore.read()};
  }catch(error){
    event.returnValue={ok:false,error:String(error?.message||error)};
  }
});
ipcMain.on('d200x:profile-write',(event,state)=>{
  try{
    assertEditor(event);
    profileStore.write(state);
    event.returnValue={ok:true};
  }catch(error){
    event.returnValue={ok:false,error:String(error?.message||error)};
  }
});

ipcMain.on('d200x:native-settings-commit',(event,context,id)=>{
  try{
    assertEditor(event);
    // An already completed synchronous atomic write stays committed.
    // Never admit another write or lazily instantiate a host during shutdown.
    if(quitting){event.returnValue={status:'rejected'};return;}
    const request=sdk().pendingSettingsRequest(context,id);
    event.returnValue=request?profileStore.commitNativeSettingsChecked(request):{status:'rejected'};
  }catch{event.returnValue={status:'unknown'};}
});

ipcMain.on('d200x:native-settings-outcome',(event,context,id)=>{
  try{
    assertEditor(event);
    const request=sdk().pendingSettingsRequest(context,id);
    event.returnValue=request?profileStore.nativeSettingsOutcome(request):{status:'unknown'};
  }catch{event.returnValue={status:'unknown'};}
});

// Local and Google Drive backups share the protected restore path.
const googleDrive=new GoogleDrive({directory:path.join(app.getPath('userData'),'GoogleDrive'),safeStorage,openExternal:url=>shell.openExternal(url)});
let backupBusy=false,backupPending=null,backupTimer=null;
function clearBackupPending(){
  if(backupTimer)clearTimeout(backupTimer);
  backupTimer=null;backupPending=null;
}
function backupEditor(event){
  assertEditor(event);
  if(event.senderFrame!==window.webContents.mainFrame)throw Error('허용되지 않은 백업 호출입니다.');
}
function currentBackup(appearance,selection=null){
  const data=Backup.snapshot({store:profileStore,packsFile:iconPacksFile(),
    appearance,version:require('./package.json').version});
  return selection?Backup.selectSnapshot(data,selection):data;
}
ipcMain.handle('d200x:backup-items',async(event,{appearance}={})=>{
  backupEditor(event);if(backupBusy)throw Error('백업 작업이 진행 중입니다.');
  backupBusy=true;
  try{
    Backup.validateAppearance(appearance);
    await ensureIconPacksMigrated();
    return Backup.backupChoices(currentBackup(appearance));
  }finally{backupBusy=false;}
});
// Copy only the user-visible dialog text. Never read or log matched secrets.
ipcMain.handle('d200x:dialog-copy-text',(event,text)=>{
  backupEditor(event);
  if(typeof text!=='string'||!text.length||text.length>32768)throw Error('복사할 텍스트가 올바르지 않습니다.');
  clipboard.writeText(text);
  return true;
});
ipcMain.handle('d200x:backup-scan',async(event,{appearance,selection}={})=>{
  backupEditor(event);if(backupBusy)throw Error('백업 작업이 진행 중입니다.');
  backupBusy=true;
  try{
    Backup.validateAppearance(appearance);
    await ensureIconPacksMigrated();
    return BackupPrivacy.scan(currentBackup(appearance,selection));
  }finally{backupBusy=false;}
});
ipcMain.handle('d200x:backup-create',async(event,{password,appearance,format='encrypted',selection}={})=>{
  backupEditor(event);if(backupBusy)throw Error('백업 작업이 진행 중입니다.');
  backupBusy=true;
  try{
    clearBackupPending();
    Backup.validateAppearance(appearance);
    const folder=await openRememberedPicker({title:'로컬 백업 폴더 선택',properties:['openDirectory','createDirectory']},'folder');
    if(!folder)return null;
    await ensureIconPacksMigrated();
    return Backup.writeArchive(folder,currentBackup(appearance,selection),password,{format});
  }finally{backupBusy=false;}
});
function stageBackup(incoming,filename,password,appearance){
  const current=currentBackup(appearance),id=randomUUID();
  backupPending={id,password,incoming,current,base:Backup.fingerprint(current)};
  backupTimer=setTimeout(clearBackupPending,5*60*1000);backupTimer.unref?.();
  return {id,filename,...Backup.summary(incoming),legacy:incoming.legacy===true,items:Backup.restoreItems(current,incoming)};
}
async function driveOperation(event,fn){
  backupEditor(event);if(backupBusy)throw Error('백업 또는 Google 연결 작업이 진행 중입니다.');
  backupBusy=true;try{return await fn();}finally{backupBusy=false;}
}
ipcMain.handle('d200x:drive-connect',event=>driveOperation(event,async()=>{
  clearBackupPending();
  const filename=await openRememberedPicker({title:'Google Cloud Desktop OAuth 클라이언트 JSON 선택',properties:['openFile'],filters:[{name:'OAuth JSON',extensions:['json']}]});
  if(!filename)return null;
  const stat=await fs.promises.stat(filename);
  if(!stat.isFile()||stat.size>65536||path.extname(filename).toLowerCase()!=='.json')throw Error('OAuth JSON 파일을 확인하세요.');
  const raw=await fs.promises.readFile(filename,'utf8');
  if(Buffer.byteLength(raw)>65536)throw Error('OAuth JSON 파일이 너무 큽니다.');
  return googleDrive.connect(JSON.parse(raw.replace(/^\uFEFF/,'')));
}));
ipcMain.handle('d200x:drive-status',event=>driveOperation(event,()=>googleDrive.status()));
ipcMain.handle('d200x:drive-disconnect',event=>driveOperation(event,()=>{clearBackupPending();return googleDrive.disconnect();}));
ipcMain.handle('d200x:drive-list',event=>driveOperation(event,async()=>{
  const account=await googleDrive.status();if(!account.connected)throw Error('Google Drive를 먼저 연결하세요.');
  return {...await googleDrive.list(),email:account.email};
}));
ipcMain.handle('d200x:drive-create',(event,{password,appearance,expectedEmail,format='encrypted',selection}={})=>driveOperation(event,async()=>{
  clearBackupPending();Backup.validateAppearance(appearance);
  const account=await googleDrive.status();
  if(!account.connected||account.email!==expectedEmail)throw Error('Google 계정이 변경되었거나 연결되지 않았습니다.');
  await ensureIconPacksMigrated();
  const current=currentBackup(appearance,selection);
  const filename='DeckForge-'+current.createdAt.replace(/[:.]/g,'-')+'-'+randomUUID()+'.'+Backup.extension(format);
  return {...await googleDrive.upload(filename,Backup.encode(current,password,format)),email:account.email};
}));
ipcMain.handle('d200x:drive-preview',(event,{id,password,appearance,expectedEmail}={})=>driveOperation(event,async()=>{
  clearBackupPending();Backup.validateAppearance(appearance);
  const account=await googleDrive.status();
  if(!account.connected||account.email!==expectedEmail)throw Error('Google 계정이 변경되었거나 연결되지 않았습니다.');
  const file=await googleDrive.download(id),incoming=Backup.decode(file.bytes,password,file.meta.name.endsWith('.dfjson')?'plain':'encrypted');
  await ensureIconPacksMigrated();
  return stageBackup(incoming,file.meta.name,password,appearance);
}));
ipcMain.handle('d200x:backup-preview',async(event,{password,appearance,format='encrypted'}={})=>{
  backupEditor(event);if(backupBusy)throw Error('백업 작업이 진행 중입니다.');
  backupBusy=true;
  try{
    clearBackupPending();
    Backup.validateAppearance(appearance);
    const ext=Backup.extension(format);
    const file=await openRememberedPicker({title:'DeckForge 백업 파일 복원',properties:['openFile'],
      filters:[{name:format==='plain'?'일반 백업 (DeckForge DFJSON)':'암호화 백업',extensions:[ext]}]});
    if(!file)return null;
    if(path.extname(file).toLowerCase()!=='.'+ext)throw Error('선택한 형식의 DeckForge 백업 파일을 선택하세요.');
    await ensureIconPacksMigrated();
    const incoming=Backup.readArchive(file,password,format,format==='plain'?currentBackup(appearance):null);
    return stageBackup(incoming,path.basename(file),password,appearance);
  }finally{backupBusy=false;}
});
ipcMain.handle('d200x:backup-plan',async(event,{id,options}={})=>{
  backupEditor(event);
  if(backupBusy||!backupPending||backupPending.id!==id)throw Error('복원 미리보기 만료 또는 취소. 다시 선택하세요.');
  const preview=backupPending;preview.plan=null;
  if(Backup.fingerprint(currentBackup(preview.current.appearance))!==preview.base)throw Error('미리보기 이후 설정이 변경되었습니다. 다시 복원하세요.');
  const {data,report}=Backup.planRestore(preview.current,preview.incoming,options);
  let catalogue=null;
  try{catalogue=await sdk().list();}catch{/* Unavailable catalogue is explicitly marked unknown. */}
  if(backupPending!==preview||Backup.fingerprint(currentBackup(preview.current.appearance))!==preview.base)throw Error('미리보기 이후 설정이 변경되었습니다. 다시 복원하세요.');
  report.sdkRequirements=Backup.restorePluginReport(data,catalogue);
  const token=randomUUID();preview.plan={data,token};
  if(backupTimer)clearTimeout(backupTimer);
  backupTimer=setTimeout(clearBackupPending,5*60*1000);backupTimer.unref?.();
  return {token,report,appearance:data.appearance,...Backup.summary(data)};
});
ipcMain.on('d200x:backup-commit',(event,{id,token}={})=>{
  try{
    backupEditor(event);
    if(backupBusy||!backupPending||backupPending.id!==id||!backupPending.plan||backupPending.plan.token!==token)throw Error('최종 복원 미리보기 만료 또는 취소. 다시 선택하세요.');
    const preview=backupPending;clearBackupPending();
    const current=currentBackup(preview.current.appearance);
    if(Backup.fingerprint(current)!==preview.base)throw Error('미리보기 이후 설정이 변경되었습니다. 다시 복원하세요.');
    const restored=Backup.restore({store:profileStore,packsFile:iconPacksFile(),
      safetyDirectory:path.join(app.getPath('userData'),'Backups'),
      current,incoming:preview.plan.data,password:preview.password});
    event.returnValue={ok:true,...restored};
  }catch(error){event.returnValue={ok:false,error:String(error?.message||error)};}
});
ipcMain.on('d200x:backup-cancel',(event,id)=>{
  try{backupEditor(event);if(backupPending?.id===id)clearBackupPending();event.returnValue=true;}
  catch{event.returnValue=false;}
});

// One editor process per user-data directory. A second launch focuses the first window.
const singleInstanceLock=app.requestSingleInstanceLock();
if(!singleInstanceLock){
  app.quit();
}else{
  app.on('second-instance',(_event,commandLine)=>{
    if(commandLine.includes('--fusion-manager')){openIntegratedManager().catch(e=>console.warn(e.message));return;}
    if(!window||window.isDestroyed())return;
    if(window.isMinimized())window.restore();
    window.show();
    window.focus();
  });
}
let window = null;
let rendererReady = false;
let tray = null;
let quitting = false;
let trayPreferences = null;
let cachedUpdate=null,cachedUpdateAt=0,pendingUpdate=null,pendingInstallerDownload=null;
async function installedUpdateStatus(force=false){
  if(pendingUpdate)return pendingUpdate;
  if(!force&&cachedUpdate&&Date.now()-cachedUpdateAt<60000)return cachedUpdate;
  pendingUpdate=UpdateCheck.checkUpdateStatus(app.getVersion())
    .then(info=>{cachedUpdate=info;cachedUpdateAt=Date.now();return info;})
    .finally(()=>{pendingUpdate=null;});
  return pendingUpdate;
}
ipcMain.handle('d200x:app-version',event=>{assertEditor(event);return app.getVersion();});
 ipcMain.handle('d200x:release-notes',async event=>{
   assertEditor(event);
   await shell.openExternal('https://github.com/SoonCheol/D200X-Deck/blob/codex/streamdeck-761-clean-editor/docs/DECKFORGE-CHANGELOG.md');
   return true;
 });
ipcMain.handle('d200x:update-status',async(event,force)=>{
  assertEditor(event);return installedUpdateStatus(force===true);
});
ipcMain.handle('d200x:check-updates',async event=>{
  assertEditor(event);
  const info=await installedUpdateStatus();
  if(info?.state!=='available')return false;
  if(info.downloadUrl&&info.downloadUrl===UpdateCheck.releaseDownloadUrl(info.latestVersion)){
    if(!pendingInstallerDownload){
      pendingInstallerDownload=(async()=>{
        const directory=path.join(app.getPath('downloads'),'DeckForge');
        let cleanupWarning=false;
        const sender=event.sender;
        const file=await UpdateCheck.downloadPublishedInstaller(info.latestVersion,directory,{
          onCleanupError:()=>{cleanupWarning=true;},
          onProgress:percent=>{if(!sender.isDestroyed())sender.send('d200x:update-progress',percent);}
        });
        // Recheck immediately before launch: edits or device actions may have begun during download.
        const kind=await UpdateCheck.startVerifiedInstaller(file,{
          confirm:async()=>{
            if(sender.isDestroyed()||!window||window.isDestroyed()||sender!==window.webContents)return false;
            const result=await dialog.showMessageBox(window,{
              type:'question',title:'DeckForge 업데이트',
              message:'DeckForge '+info.latestVersion+' 다운로드 완료',
              detail:'지금 설치하시겠습니까?\n설치가 완료되면 DeckForge가 자동으로 다시 실행됩니다.',
              buttons:['나중에','설치'],defaultId:1,cancelId:0,noLink:true
            });
            return result.response===1;
          },
          prepare:async()=>!sender.isDestroyed()&&window&&!window.isDestroyed()&&sender===window.webContents&&
            await sender.executeJavaScript('window.DeckForgePrepareUpdate?.()')===true,
          openInstaller:installer=>shell.openPath(installer),
          quit:quitDeckForge
        });
        return {kind,filePath:file,cleanupWarning};
      })().finally(()=>{pendingInstallerDownload=null;});
    }
    return pendingInstallerDownload;
  }
  if(!Number.isSafeInteger(info.runId)||info.runId<1)return false;
  await shell.openExternal('https://github.com/SoonCheol/D200X-Deck/actions/runs/'+info.runId);
  return {kind:'web'};
});
function trayPreferencePath(){return path.join(app.getPath('userData'),'deckforge-tray-preferences-v1.json');}
function isInstalledBuild(){
  if(process.platform!=='win32'||!app.isPackaged)return false;
  const folder=path.join(process.env.LOCALAPPDATA||'', 'Programs','DeckForge');
  return !!process.env.LOCALAPPDATA && path.normalize(process.execPath).toLowerCase()===
    path.join(folder,'DeckForge.exe').toLowerCase();
}
function readTrayPreferences(){
  try{
    const value=JSON.parse(fs.readFileSync(trayPreferencePath(),'utf8'));
    return {autoStart:value.autoStart===true};
  }catch{
    return {autoStart:isInstalledBuild()};
  }
}
function saveTrayPreferences(){
  const tmp=trayPreferencePath()+'.tmp';
  fs.mkdirSync(path.dirname(tmp),{recursive:true});
  fs.writeFileSync(tmp,JSON.stringify(trayPreferences),{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,trayPreferencePath());
}
function setLoginStart(enabled){
  if(!isInstalledBuild())return;
  app.setLoginItemSettings({openAtLogin:!!enabled,path:process.execPath,args:['--hidden']});
}
function revealEditor(){
  if(!window||window.isDestroyed())return;
  if(window.isMinimized())window.restore();
  window.show();
  window.focus();
}
// Only the trusted editor renderer may reveal its own existing modal.
let unsavedRevealPending=null;
async function revealUnsavedEditor(editor){
  const traceId=randomUUID();
  if(editor.isMinimized())editor.restore();
  editor.show();
  editor.focus();
  if(process.platform==='win32'){
    try{
      const native=editor.getNativeWindowHandle();
      const hwnd=native.length===8?native.readBigUInt64LE(0).toString():String(native.readUInt32LE(0));
      const spec={kind:'EditorHwnd',target:process.pid+':'+hwnd};
      await writeAppControlLog({traceId,stage:'wide-warning-focus-request',spec});
      const result=await inspectAppFocus(spec,'Focus',traceId);
      if(result.status==='focused')return true;
    }catch(error){
      await writeAppControlLog({traceId,stage:'wide-warning-focus-error',error:String(error?.message||error)});
    }
  }else if(editor.isFocused())return true;
  if(!editor.isDestroyed())editor.flashFrame(true);
  return false;
}
ipcMain.handle('d200x:reveal-unsaved-editor',event=>{
  assertEditor(event);
  if(!unsavedRevealPending){
    unsavedRevealPending=revealUnsavedEditor(window).finally(()=>{unsavedRevealPending=null;});
  }
  return unsavedRevealPending;
});
function quitDeckForge(){
  quitting=true;
  app.quit();
}
function updateTrayMenu(){
  if(!tray)return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'DeckForge 1.0 열기',click:revealEditor},
    {type:'separator'},
    {label:'Windows 로그인 시 자동 실행',type:'checkbox',
      enabled:isInstalledBuild(),checked:trayPreferences?.autoStart===true,
      click:item=>{
        try{
          setLoginStart(item.checked);
          trayPreferences.autoStart=item.checked;
          saveTrayPreferences();
        }catch(error){
          dialog.showErrorBox('자동 시작 설정 실패',String(error.message||error));
          updateTrayMenu();
        }
      }},
    {label:'GitHub에서 새 빌드 확인',click:()=>shell.openExternal(BUILDS_PAGE)},
    {type:'separator'},
    {label:'DeckForge 종료',click:quitDeckForge}
  ]));
}
function initializeTray(){
  // Use the high-contrast DeckForge application artwork rather than the tiny monochrome glyph.
  const file=path.join(__dirname,'tray.png');
  const icon=nativeImage.createFromPath(file);
  if(icon.isEmpty())throw Error('DeckForge 트레이 아이콘이 없습니다: '+file);
  tray=new Tray(icon.resize({width:20,height:20}));
  tray.setToolTip('DeckForge '+app.getVersion()+' · D200X');
  tray.on('double-click',revealEditor);
  trayPreferences=readTrayPreferences();
  try{if(isInstalledBuild())setLoginStart(trayPreferences.autoStart);}
  catch(error){console.warn('DeckForge login startup setup failed:',error.message);}
  updateTrayMenu();
}
const nativeDropHost=new NativeDropHost(__dirname,message=>send('d200x:native-drop-event',message));
ipcMain.handle('d200x:native-drop-start',(event,args)=>{
  if(!window||event.sender!==window.webContents||!window.isVisible()||window.isMinimized()||process.platform!=='win32')return false;
  const rects=physicalSlots(args?.rects,window.getContentBounds(),window.webContents.getZoomFactor(),point=>screen.dipToScreenPoint(point));
  if(!rects.length)return false;
  nativeDropHost.warm();
  const owner=window.getNativeWindowHandle().readBigUInt64LE(0).toString();
  return nativeDropHost.start(args?.id,owner,rects);
});
ipcMain.on('d200x:native-drop-cancel',(event,id)=>{
  if(window&&event.sender===window.webContents&&typeof id==='string')nativeDropHost.cancel(id);
});
ipcMain.handle('d200x:native-drop-warning',async event=>{
  if(!window||event.sender!==window.webContents||!window.isVisible())return false;
  const result=await dialog.showMessageBox(window,{type:'warning',title:'DeckForge',message:'드래그 등록 불가',detail:'이 프로그램은 드래그로 등록할 수 없습니다. 프로그램을 직접 선택하여 등록하시겠습니까?',buttons:['취소','프로그램 열기'],cancelId:0,defaultId:1,noLink:true});
  return result.response===1;
});
// Explicit per-process hardware trial; no persisted preference or remote toggle.
const keyTransportTrial=process.argv.includes('--test-key-transport');
const transport = new D200XTransport({incrementalKeys:keyTransportTrial});
function send(channel, payload) {
  if (rendererReady && window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}
transport.on('status', status => {
  if(!status?.connected)sdkHost?.cancelMultiMonitorInput();
  send('d200x:status',status);
});
// Runtime evidence is bounded in memory, independent of HID and disk logging.
const aiEvidence=require('./ai/evidence.cjs').createEvidence({id:randomUUID});
transport.on('key',event=>{
  const delivered=Boolean(rendererReady&&window&&!window.isDestroyed());
  const inputId=aiEvidence.receive(event,delivered);
  send('d200x:key',{...event,inputId});
});
ipcMain.on('d200x:input-evidence',(event,record)=>{
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return;
  if(!record||!aiEvidence.has(record.inputId))return;
  aiEvidence.append(record.inputId,record);
});
const linkInput=(traceId,inputId)=>{if(aiEvidence.has(inputId))aiEvidence.link(traceId,inputId);return traceId;};
transport.on('synced', details => send('d200x:synced', details));
transport.on('error-message', message => send('d200x:error', message));
let diagnosticPath = null;
let keepaliveLogCounter = 0;
function recordDeviceDiagnostic(info) {
  // A successful keep-alive every 5 seconds is routine. Summarize it once
  // per minute to keep logs small while preserving all failure transitions.
  if (info.type === 'keepalive' && ++keepaliveLogCounter % 12 !== 1) return;
  const line = JSON.stringify(info) + '\n';
  console.info('[D200X]', info.type, info.detail);
  if (!diagnosticPath) return;
  try {
    if (fs.existsSync(diagnosticPath) && fs.statSync(diagnosticPath).size > 1024 * 1024) {
      fs.renameSync(diagnosticPath, diagnosticPath + '.previous');
    }
    fs.appendFileSync(diagnosticPath, line, {encoding:'utf8'});
  } catch (error) {
    console.warn('[D200X] Cannot write diagnostic log:', error.message);
  }
}
transport.on('diagnostic',recordDeviceDiagnostic);

// Accept only the 14 known display slots, not arbitrary file paths or code.
function validImages(value) {
  if (!Array.isArray(value) || value.length !== 14) return false;
  const found = new Set();
  for (const entry of value) {
    if (!entry || !Number.isInteger(entry.index) || entry.index < 0 || entry.index >= 14 ||
        found.has(entry.index) || typeof entry.png !== 'string' ||
        entry.png.length > 1024 * 1024 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(entry.png)) return false;
    found.add(entry.index);
  }
  return found.size === 14;
}
ipcMain.on('d200x:renderer-ready', event => {
  if (!window || event.sender !== window.webContents) return;
  rendererReady = true;
  send('d200x:status', transport.deck.status());
});
ipcMain.on('d200x:sync-page', (event, images, wideMode='blank',liveOnly=false,pageToken=null) => {
  if (!window || event.sender !== window.webContents || event.senderFrame!==window.webContents.mainFrame) return;
  if (!validImages(images)) {
    send('d200x:error', '페이지 이미지 형식이 올바르지 않습니다.');
    return;
  }
  if(!['blank','clock','stats'].includes(wideMode)){
    send('d200x:error','지원되지 않는 가로 화면 모드입니다.');return;
  }
  if(pageToken!==null&&!(typeof pageToken==='string'&&/^[a-z0-9-]{1,80}$/.test(pageToken)))return;
  transport.schedule(images.map(entry => ({
    index: entry.index,
    png: Buffer.from(entry.png, 'base64'),
  })),wideMode,keyTransportTrial&&liveOnly===true,pageToken);
});

// Only user-configured HTTP(S) URLs may be opened by a physical key press.
// Additional URL execution modes (GET/browser selection) are not implemented here.
ipcMain.handle('d200x:open-website', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['default','get','choose'].includes(args.mode) || typeof args.url !== 'string'
      || args.url.length > 2048 || /[\x00-\x1f\x7f]/.test(args.url))
    throw new Error('지원하지 않는 웹사이트 열기 방식입니다.');
  let url;
  try { url = new URL(args.url.trim()); }
  catch { throw new Error('올바른 URL을 입력하세요.'); }
  if (!['http:','https:'].includes(url.protocol) || !url.hostname
      || url.username || url.password)
    throw new Error('HTTP 또는 HTTPS 웹사이트 주소만 지원합니다.');
  if(args.mode==='get'){
    // Deliberate user-configured request; no response body or cookies are stored.
    await new Promise((resolve,reject)=>{
      const request=(url.protocol==='https:'?https:http).get(url,{timeout:6000},response=>{
        response.resume();
        if((response.statusCode||0)>=400)reject(new Error('HTTP 상태 '+response.statusCode));
        else resolve(true);
      });
      request.on('timeout',()=>request.destroy(new Error('요청 시간 초과')));
      request.on('error',reject);
    });
  }else if(args.mode==='choose'){
    const browserPath=args.browserPath;
    if(typeof browserPath!=='string'||browserPath.length>4096||
      !path.win32.isAbsolute(browserPath)||!/\.exe$/i.test(browserPath)||
      /[\x00-\x1f\x7f]/.test(browserPath))
      throw new Error('브라우저 실행 파일(.exe)을 먼저 선택하세요.');
    const stat=await fs.promises.stat(browserPath);
    if(!stat.isFile())throw new Error('브라우저 실행 파일을 찾을 수 없습니다.');
    const child=require('node:child_process').spawn(browserPath,[url.href],{
      detached:true,stdio:'ignore',windowsHide:false
    });
    await new Promise((resolve,reject)=>{
      child.once('spawn',resolve);child.once('error',reject);
    });
    child.unref();
  }else await shell.openExternal(url.href);
  return true;
});

// Only fixed, built-in Win32 media/zoom key codes; no user-provided script.
// The foreground app interprets Ctrl+plus/minus; actual zoom support varies.
ipcMain.handle('d200x:adjust-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['volume','zoom','mute','zoom-reset'].includes(args.target) ||
      (['mute','zoom-reset'].includes(args.target) ? args.direction!==0 : ![-1,1].includes(args.direction)) ||
      ![1,2,5,10].includes(args.count ?? 1) ||
      (['mute','zoom-reset'].includes(args.target) && (args.count ?? 1)!==1))
    throw new Error('지원하지 않는 노브 조절 동작입니다.');
  if (process.platform !== 'win32')
    throw new Error('Windows에서만 지원하는 조절 동작입니다.');
  const key = args.target === 'zoom-reset' ? 0x30 : args.target === 'mute' ? 0xAD
    : args.target === 'volume' ? (args.direction > 0 ? 0xAF : 0xAE)
    : (args.direction > 0 ? 0xBB : 0xBD);
  // Always use constant C# source; only the allowlisted numeric virtual key
  // changes. No shell, file paths, profile input, or arbitrary commands.
  const count=args.count ?? 1;
  const code = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${['zoom','zoom-reset'].includes(args.target) ? '[D200XKey]::keybd_event(0x11,0,0,[UIntPtr]::Zero);' : ''}
${Array.from({length:count},()=>`[D200XKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);\n[D200XKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);`).join('\n')}
${['zoom','zoom-reset'].includes(args.target) ? '[D200XKey]::keybd_event(0x11,0,2,[UIntPtr]::Zero);' : ''}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only fixed wheel events, never arbitrary shell input or scripts.
ipcMain.handle('d200x:scroll-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['vertical','horizontal'].includes(args.axis) ||
      ![-1,1].includes(args.direction) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 스크롤 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const flag=args.axis==='horizontal'?0x1000:0x0800;
  // Positive planner direction means down/right. Win32 vertical wheel is inverted.
  const delta=120*args.direction*(args.axis==='vertical'?-1:1)*(args.count??1);
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XWheel {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
}
'@;
[D200XWheel]::mouse_event(${flag},0,0,${delta},[UIntPtr]::Zero)`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only fixed Ctrl+Z / Ctrl+Y commands for the foreground Windows app.
ipcMain.handle('d200x:edit-history', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['undo','redo'].includes(args.operation) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 편집 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const key=args.operation==='undo'?0x5A:0x59;
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XEditKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${Array.from({length:args.count??1},()=>`[D200XEditKey]::keybd_event(0x11,0,0,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only allowlisted Windows shortcuts: Alt+Tab (reverse Alt+Shift+Tab)
// and Ctrl+Win+Left/Right. No arbitrary commands or shortcut strings.
ipcMain.handle('d200x:switch-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['window','desktop'].includes(args.target) ||
      ![-1,1].includes(args.direction) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 전환 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const target=args.target, direction=args.direction, count=args.count??1;
  const held=target==='window'?(direction<0?[0x12,0x10]:[0x12]):[0x11,0x5B];
  const key=target==='window'?0x09:(direction<0?0x25:0x27);
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XSwitchKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XSwitchKey]::keybd_event(${v},0,0,[UIntPtr]::Zero);`).join('\n')}
${Array.from({length:count},()=>`[D200XSwitchKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XSwitchKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);`).join('\n')}
${held.slice().reverse().map(v=>`[D200XSwitchKey]::keybd_event(${v},0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

ipcMain.handle('d200x:sleep-display',(event)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  return transport.sleepDisplay();
});

ipcMain.handle('d200x:set-safe-brightness',(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(!Number.isInteger(args?.value)||args.value<20||args.value>100)
    throw new Error('화면 보호 범위는 20~100%입니다.');
  return transport.setSafeBrightness(args.value);
});

ipcMain.handle('d200x:device-brightness',(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(!args||![-1,1].includes(args.direction)||![1,2,5,10].includes(args.count))throw new Error('잘못된 밝기 조절 요청입니다.');
  return transport.adjustBrightness(args.direction,args.count);
});

// Diagnostic records stay in this Windows user's DeckForge data, never in the source tree.
async function writeAppControlLog(record){
  aiEvidence.helper(record);
  try{
    const dir=path.join(app.getPath('userData'),'diagnostics');
    await fs.promises.mkdir(dir,{recursive:true});
    const file=path.join(dir,'app-control-'+new Date().toISOString().slice(0,10)+'.jsonl');
    await fs.promises.appendFile(file,JSON.stringify({at:new Date().toISOString(),...record})+'\n','utf8');
  }catch(error){console.warn('DeckForge app control diagnostic:',error.message);}
}
ipcMain.handle('d200x:app-control-event',async(event,record)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(!record||typeof record.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(record.id)||
      JSON.stringify(record).length>4096)throw new Error('잘못된 진단 이벤트입니다.');
  await writeAppControlLog({traceId:record.id,stage:'renderer-event',version:app.getVersion(),mainPid:process.pid,record});
  return true;
});
async function runCloseControl(filePath,force,traceId){
  const kind=filePath.startsWith(APP_ID_PREFIX)?'AppID':'EXE';
  const target=kind==='AppID'?requireStartAppId(filePath.slice(APP_ID_PREFIX.length)):filePath;
  const mode=force?'Force':'Close';
  const encoded=Buffer.from(target,'utf16le').toString('base64');
  let result;
  try{
    const script=await fs.promises.readFile(path.join(__dirname,'app-control.ps1'),'utf8');
    const command=Buffer.from(script,'utf16le').toString('base64');
    const {stdout,stderr}=await execFileAsync('powershell.exe',
      ['-NoProfile','-NonInteractive','-STA','-WindowStyle','Hidden','-EncodedCommand',command],{
        windowsHide:true,timeout:30000,maxBuffer:1024*1024,
        env:{...process.env,DECKFORGE_CONTROL_KIND:kind,DECKFORGE_CONTROL_MODE:mode,
          DECKFORGE_CONTROL_TARGET:encoded,DECKFORGE_CONTROL_TRACE:traceId}
      });
    result=JSON.parse(String(stdout));
    if(stderr)result.stderr=String(stderr).slice(0,4000);
  }catch(error){
    await writeAppControlLog({traceId,stage:'powershell-error',mode,kind,error:String(error.message||error)});
    throw error;
  }
  await writeAppControlLog({traceId,stage:'powershell-result',result});
  if(!result.found)throw new Error(mode==='Force'?'강제 종료할 안전한 대상이 없거나 종료에 실패했습니다.':'일반 종료할 창이 없거나 종료 요청에 실패했습니다.');
  return true;
}
// Only control validated AppIDs or user-selected executable paths.
ipcMain.handle('d200x:close-local-app',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  const traceId=typeof args?.trace?.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(args.trace.id)?args.trace.id:randomUUID();
  linkInput(traceId,args?.trace?.inputId);
  const mode=args?.force===true?'Force':'Close';
  await writeAppControlLog({traceId,stage:'ipc-request',version:app.getVersion(),mainPid:process.pid,
    force:args?.force,mode,filePath,trace:args?.trace||null});
  try{
    if(typeof filePath!=='string'||typeof args.force!=='boolean')throw new Error('잘못된 종료 요청입니다.');
    if(filePath.startsWith(APP_ID_PREFIX))requireStartAppId(filePath.slice(APP_ID_PREFIX.length));
    else{
      if(filePath.length>4096||!path.win32.isAbsolute(filePath)||!/\.exe$/i.test(filePath)||/[\x00-\x1f\x7f]/.test(filePath))
        throw new Error('닫을 Windows 실행 파일(.exe)을 지정하세요.');
      if(!(await fs.promises.stat(filePath)).isFile())throw new Error('대상 실행 파일이 존재하지 않습니다.');
    }
    if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
    const ok=await runCloseControl(filePath,args.force,traceId);
    await writeAppControlLog({traceId,stage:'ipc-result',mode,ok});
    return ok;
  }catch(error){
    await writeAppControlLog({traceId,stage:'ipc-result',mode,ok:false,error:String(error.message||error)});
    throw error;
  }
});

// Validate a user-selected audio file before handing its file:// URL to the
// isolated renderer. Playback/stop is in the renderer, not an external player.
ipcMain.handle('d200x:audio-file-url',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  if(typeof filePath!=='string'||filePath.length>4096||!path.win32.isAbsolute(filePath)||
      /[\x00-\x1f\x7f]/.test(filePath))throw new Error('올바른 Windows 오디오 파일을 선택하세요.');
  if(!/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(filePath))throw new Error('지원하지 않는 오디오 파일 확장자입니다.');
  const stat=await fs.promises.stat(filePath);
  if(!stat.isFile())throw new Error('파일을 찾을 수 없습니다.');
  return pathToFileURL(filePath).href;
});

// Explicit clipboard mode: clipboard contents deliberately change to the supplied text.
ipcMain.handle('d200x:paste-text',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(typeof args?.text!=='string'||args.text.length>2048||typeof args.enter!=='boolean')
    throw new Error('붙여넣을 텍스트는 최대 2048자입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  clipboard.writeText(args.text);
  await emitWindowsKeys([0x11],0x56);
  if(args.enter)await emitWindowsKeys([],0x0D);
  return true;
});

// Exact EXE / AppID window lookup, independent of the close/force control path.
function appFocusSpec(filePath,target){
  if(typeof filePath!=='string')return null;
  if(filePath.startsWith(APP_ID_PREFIX)){
    if(target&&target!=='appid')throw new Error('잘못된 프로그램 유형입니다.');
    return {kind:'AppID',target:requireStartAppId(filePath.slice(APP_ID_PREFIX.length))};
  }
  const requested=requireLocalWindowsPath(filePath);
  if(target&&target!=='file')return null;
  if(/\.exe$/i.test(requested))return {kind:'EXE',target:requested};
  if(/\.lnk$/i.test(requested)){
    try{
      const link=shell.readShortcutLink(requested);
      if(typeof link.target==='string'&&/\.exe$/i.test(link.target))
        return {kind:'EXE',target:requireLocalWindowsPath(link.target)};
    }catch{}
  }
  return null;
}
async function inspectAppFocus(spec,mode,traceId,exclude=[]){
  try{
    const result=await runAppFocus(__dirname,spec,mode,undefined,exclude);
    await writeAppControlLog({traceId,stage:'focus-result',version:app.getVersion(),mode,spec,result});
    return result;
  }catch(error){
    await writeAppControlLog({traceId,stage:'focus-error',mode,spec,error:String(error.message||error)});
    throw error;
  }
}
ipcMain.handle('d200x:focus-local-app',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const spec=appFocusSpec(args?.filePath);
  if(!spec)return false;
  const result=await inspectAppFocus(spec,'Focus',randomUUID());
  if(result.status==='focused')return true;
  if(result.status==='missing')return false;
  throw new Error(result.error||'실행 중인 창을 앞으로 가져오지 못했습니다.');
});
const queueAppLaunch=createAppLaunchQueue();
ipcMain.handle('d200x:open-terminal',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw Error('허용되지 않은 호출입니다.');
  if(process.platform!=='win32'||typeof args?.admin!=='boolean')throw Error('올바른 터미널 실행 요청이 아닙니다.');
  const foreground=args.foreground!==false,preventDuplicate=args.preventDuplicate!==false;
  const spec={kind:'Terminal',target:args.admin?'admin':'normal'};
  const traceId=linkInput(randomUUID(),args?.inputId);
  const launch=()=>focusOrLaunch({
    foreground,preventDuplicate,
    focus:(mode,exclude)=>inspectAppFocus(spec,mode,traceId,exclude),
    launch:async()=>{
      const result=await inspectAppFocus(spec,'Launch',traceId);
      if(result.status!=='launched')throw Error(result.error||'터미널 실행 실패');
      return true;
    },
    record:(stage,result)=>stage==='launch-unconfirmed'?writeAppControlLog({traceId,stage,spec,result}):undefined
  });
  return preventDuplicate?queueAppLaunch('Terminal:'+spec.target,launch):launch();
});

// Unicode typing uses SendInput/KEYEVENTF_UNICODE: no PowerShell source interpolation
// from user text (only a fixed, Base64-encoded UTF-16LE literal).
ipcMain.handle('d200x:type-text',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(typeof args?.text!=='string'||args.text.length>2048||typeof args.enter!=='boolean')
    throw new Error('텍스트 입력은 최대 2048자로 제한됩니다.');
  if(!args.text&&!args.enter)return false;
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const encoded=Buffer.from(args.text,'utf16le').toString('base64');
  const ps=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D200XUnicode {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk, wScan;
    public uint dwFlags, time;
    public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
  public static void Write(string text,bool enter) {
    foreach(char c in text) {
      INPUT[] input=new INPUT[2];
      input[0].type=1;input[0].ki.wScan=c;input[0].ki.dwFlags=4;
      input[1].type=1;input[1].ki.wScan=c;input[1].ki.dwFlags=6;
      if(SendInput(2,input,Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("SendInput failed");
    }
    if(enter){keybd_event(0x0D,0,0,UIntPtr.Zero);keybd_event(0x0D,0,2,UIntPtr.Zero);}
  }
}
'@;
$text=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));
[D200XUnicode]::Write($text,${args.enter?'$true':'$false'});`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],
    {windowsHide:true,timeout:15000,maxBuffer:32768});
  return true;
});

// DeckForge Windows media key mapping. Never execute user-supplied code.
const MEDIA_CODES=Object.freeze({previous:0xB1,playpause:0xB3,next:0xB0,stop:0xB2,mute:0xAD,up:0xAF,down:0xAE});
function emitWindowsKeys(held,key,options=null){
  const flags=options?.extended?1:0,scan=options?.scan||0;
  const modifierFlags=v=>options&&v===0x5B?1:0;
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XPreviewKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XPreviewKeys]::keybd_event(${v},0,${modifierFlags(v)},[UIntPtr]::Zero);`).join('\n')}
[D200XPreviewKeys]::keybd_event(${key},${scan},${flags},[UIntPtr]::Zero);
[D200XPreviewKeys]::keybd_event(${key},${scan},${flags|2},[UIntPtr]::Zero);
${held.slice().reverse().map(v=>`[D200XPreviewKeys]::keybd_event(${v},0,${modifierFlags(v)|2},[UIntPtr]::Zero);`).join('\n')}`;
  return execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
}
ipcMain.handle('d200x:media-control',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(typeof args?.operation!=='string'||!Object.hasOwn(MEDIA_CODES,args.operation))throw new Error('미지원 미디어 동작');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  await emitWindowsKeys([],MEDIA_CODES[args.operation]);return true;
});
// SendInput reports Windows input-stream insertion, not foreground-app action success.
async function emitVerifiedWindowsHotkey(parsed,foregroundPid=0){
  if(!Number.isSafeInteger(foregroundPid)||foregroundPid<0||foregroundPid>0xffffffff)throw Error('Invalid foreground PID');
  const keyFlags=parsed.extended?1:0;
  const inputs=[...parsed.held.map(v=>[v,0,0]),[parsed.key,parsed.scan||0,keyFlags],[parsed.key,parsed.scan||0,keyFlags|2],...parsed.held.slice().reverse().map(v=>[v,0,2])];
  const ps=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D200XVerifiedHotkey {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk,wScan;
    public uint dwFlags,time;
    public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Explicit,Size=40)] public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] input,int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  public static uint Write(int[] values,uint foregroundPid){
    var inputs=new INPUT[values.Length/3];
    for(int i=0;i<inputs.Length;i++){
      inputs[i].type=1;
      inputs[i].ki.wVk=(ushort)values[i*3];
      inputs[i].ki.wScan=(ushort)values[i*3+1];
      inputs[i].ki.dwFlags=(uint)values[i*3+2];
    }
    if(foregroundPid!=0){
      uint actual; IntPtr hwnd=GetForegroundWindow();
      if(hwnd==IntPtr.Zero||GetWindowThreadProcessId(hwnd,out actual)==0||actual!=foregroundPid)return 0;
    }
    return SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(INPUT)));
  }
}
'@;
[Console]::Write([D200XVerifiedHotkey]::Write(@(${inputs.flat().join(',')}),${foregroundPid}))`;
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return {inserted:Number(String(stdout).trim()),expected:inputs.length};
}
function parseWindowsHotkey(value){return DeckHotkeys.resolve(value);}
ipcMain.handle('d200x:fusion-escape',async(event,inputId)=>{
  assertEditor(event);
  if(process.platform!=='win32')return false;
  const fusion=await FusionState.readFusionState(fusionDiscoveryFile());
  if(fusion?.status!=='ready')return false;
  const {inserted,expected}=await emitVerifiedWindowsHotkey(parseWindowsHotkey('Escape'),fusion.pid);
  const confirmed=inserted===expected;
  if(typeof inputId==='string'&&aiEvidence.has(inputId))aiEvidence.append(inputId,{stage:'windows-input',keys:'Escape',status:confirmed?'inserted':'failed',count:inserted,expected});
  if(inserted!==0&&!confirmed)throw Error('Windows ESC 입력 삽입 개수가 일치하지 않습니다.');
  return confirmed;
});
ipcMain.handle('d200x:send-hotkey',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const parsed=parseWindowsHotkey(args?.keys);
  if(!parsed)throw new Error('지원하지 않는 단축키 형식입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const inputId=typeof args?.inputId==='string'&&aiEvidence.has(args.inputId)?args.inputId:null;
  const keys=DeckHotkeys.canonical(args.keys);
  try{
    const {inserted,expected}=await emitVerifiedWindowsHotkey(parsed);
    const confirmed=inserted===expected;
    if(inputId)aiEvidence.append(inputId,{stage:'windows-input',keys,status:confirmed?'inserted':'failed',count:inserted,expected});
    if(!confirmed)throw new Error('Windows 입력 삽입 개수가 일치하지 않습니다.');
    return true;
  }catch(error){
    if(inputId&&!aiEvidence.list().some(row=>row.id===inputId&&row.events.some(e=>e.stage==='windows-input')))
      aiEvidence.append(inputId,{stage:'windows-input',keys,status:'failed'});
    throw error;
  }
});

// Fixed Win32 shortcuts; choices are validated against this closed allowlist.
const D200X_SHORTCUTS=Object.freeze({
  'screenshot':{capture:{held:[0x5B,0x10],key:0x53}},
  'clipboard-edit':{copy:{held:[0x11],key:0x43},paste:{held:[0x11],key:0x56},cut:{held:[0x11],key:0x58}},
  'window-state':{maximize:{held:[0x5B],key:0x26},minimize:{held:[0x5B],key:0x28}},
  'window-monitor':{left:{held:[0x5B,0x10],key:0x25},right:{held:[0x5B,0x10],key:0x27}},
  'explorer-open':{open:{held:[0x5B],key:0x45}},
  'brush-size':{increase:{held:[],key:0xDD},decrease:{held:[],key:0xDB}},
  'timeline-step':{next:{held:[],key:0x27},previous:{held:[],key:0x25}},
  'timeline-zoom':{in:{held:[0x11],key:0xBB},out:{held:[0x11],key:0xBD}}
});
ipcMain.handle('d200x:system-shortcut',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const group=typeof args?.target==='string'&&Object.prototype.hasOwnProperty.call(D200X_SHORTCUTS,args.target)
    ?D200X_SHORTCUTS[args.target]:null;
  const shortcut=group&&Object.prototype.hasOwnProperty.call(group,args.operation)?group[args.operation]:null;
  if(!shortcut)throw new Error('지원하지 않는 단축키입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const held=shortcut.held,key=shortcut.key;
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XSafeKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XSafeKey]::keybd_event(${v},0,0,[UIntPtr]::Zero);`).join('\n')}
[D200XSafeKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XSafeKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);
${held.slice().reverse().map(v=>`[D200XSafeKey]::keybd_event(${v},0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});


function requireLocalWindowsPath(value){
  if(typeof value!=='string'||value.length>4096||!path.win32.isAbsolute(value)||
      /[\x00-\x1f\x7f]/.test(value))throw new Error('올바른 Windows 파일 경로를 지정하세요.');
  return value;
}
// Prefer the requested 256px Windows icon resource; retain Electron's
// shell icon as a fallback for files without a suitable resource.
async function extractLargeApplicationIcon(filePath,index=0){
  if(process.platform!=='win32'||!path.win32.isAbsolute(filePath))return null;
  const code=`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeckForgeAppIcon {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern int SHDefExtractIconW(string path, int index, uint flags, out IntPtr large, IntPtr small, uint size);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
$handle=[IntPtr]::Zero
try {
  $result=[DeckForgeAppIcon]::SHDefExtractIconW($env:DECKFORGE_ICON_FILE,[int]$env:DECKFORGE_ICON_INDEX,0,[ref]$handle,[IntPtr]::Zero,256)
  if($result -ne 0 -or $handle -eq [IntPtr]::Zero){return}
  $icon=[System.Drawing.Icon]::FromHandle($handle)
  try {
    $bitmap=$icon.ToBitmap()
    try {
      $stream=New-Object System.IO.MemoryStream
      try {
        $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
        [Console]::Write([Convert]::ToBase64String($stream.ToArray()))
      } finally {$stream.Dispose()}
    } finally {$bitmap.Dispose()}
  } finally {$icon.Dispose()}
} finally {
  if($handle -ne [IntPtr]::Zero){[void][DeckForgeAppIcon]::DestroyIcon($handle)}
}`;
  try{
    const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{
      windowsHide:true,timeout:8000,maxBuffer:1024*1024,
      env:{...process.env,DECKFORGE_ICON_FILE:filePath,DECKFORGE_ICON_INDEX:String(index)}
    });
    const image=nativeImage.createFromBuffer(Buffer.from(String(stdout).trim(),'base64'));
    return image.isEmpty()?null:image;
  }catch{return null;}
}
async function inspectWindowsApplication(filePath){
  const requested=requireLocalWindowsPath(filePath);
  const ext=path.win32.extname(requested).toLowerCase();
  if(!['.exe','.lnk','.bat','.cmd'].includes(ext))throw new Error('실행 파일 또는 바로가기를 선택하세요.');
  if(!(await fs.promises.stat(requested)).isFile())throw new Error('실행 파일이 아닙니다.');
  let target=requested,shortcut=null;
  if(ext==='.lnk'){
    shortcut=shell.readShortcutLink(requested);
    if(typeof shortcut?.target==='string'&&path.win32.isAbsolute(shortcut.target))
      target=shortcut.target;
  }
  let name=path.win32.basename(ext==='.lnk'?requested:target,
    path.win32.extname(ext==='.lnk'?requested:target));
  if(/\.exe$/i.test(target)){
    try{
      const literal=target.replace(/'/g,"''");
      const cmd="$v=(Get-Item -LiteralPath '"+literal+"').VersionInfo;@($v.FileDescription,$v.ProductName)|Where-Object {$_ -and $_.Trim()}|Select-Object -First 1";
      const {stdout}=await execFileAsync('powershell.exe',
        ['-NoProfile','-NonInteractive','-Command',cmd],{windowsHide:true,timeout:5000,maxBuffer:4096});
      const title=String(stdout||'').trim();
      if(title&&title.length<=150)name=title;
    }catch{}
  }
  let icon='';
  try{
    const custom=typeof shortcut?.icon==='string'&&shortcut.icon.trim()?shortcut.icon:null;
    const iconPath=custom||target;
    const iconIndex=custom&&Number.isInteger(shortcut.iconIndex)?shortcut.iconIndex:0;
    const image=await extractLargeApplicationIcon(iconPath,iconIndex)||
      await app.getFileIcon(ext==='.lnk'?requested:target,{size:'large'});
    if(image&&!image.isEmpty())icon='data:image/png;base64,'+image.toPNG().toString('base64');
  }catch{}
  return {path:requested,name,icon};
}
ipcMain.handle('d200x:inspect-app-file',async(event,filePath)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  return inspectWindowsApplication(filePath);
});


const APP_ID_PREFIX='shell:AppsFolder\\';
function requireStartAppId(id){
  if(typeof id!=='string'||!id.trim()||id.length>512||/[\x00-\x1f\x7f\\/:"]/.test(id)||id==='.'||id==='..')
    throw new Error('올바른 시작 메뉴 AppID가 아닙니다.');
  return id;
}

async function inspectStartApplication(id){
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  requireStartAppId(id);
  const code="$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$id=$env:DECKFORGE_APP_ID\n$entry=Get-StartApps | Where-Object {[string]::Equals($_.AppID,$id,[StringComparison]::OrdinalIgnoreCase)} | Select-Object -First 1\nif(-not $entry){throw 'Start menu application not found'}\n$png=''\ntry {\n Add-Type -AssemblyName PresentationCore\n Add-Type -AssemblyName WindowsBase\n Add-Type -TypeDefinition @'\nusing System;\nusing System.Runtime.InteropServices;\n[StructLayout(LayoutKind.Sequential)]\npublic struct DFSize { public int cx; public int cy; }\n[ComImport, Guid(\"bcc18b79-ba16-442f-80c4-8a59c30c463b\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\npublic interface DFImageFactory {\n [PreserveSig] int GetImage(DFSize size,uint flags,out IntPtr bitmap);\n}\npublic static class DFAppImage {\n [DllImport(\"shell32.dll\",CharSet=CharSet.Unicode)]\n private static extern int SHCreateItemFromParsingName(string path,IntPtr ctx,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out DFImageFactory factory);\n [DllImport(\"gdi32.dll\")] public static extern bool DeleteObject(IntPtr handle);\n public static IntPtr Get(string id) {\n  Guid iid=typeof(DFImageFactory).GUID; DFImageFactory factory;\n  Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(\"shell:AppsFolder\\\\\"+id,IntPtr.Zero,ref iid,out factory));\n  try {\n   IntPtr bitmap;\n   Marshal.ThrowExceptionForHR(factory.GetImage(new DFSize{cx=256,cy=256},4,out bitmap));\n   return bitmap;\n  } finally { Marshal.ReleaseComObject(factory); }\n }\n}\n'@\n $handle=[DFAppImage]::Get($entry.AppID)\n try {\n  $bitmap=[System.Windows.Interop.Imaging]::CreateBitmapSourceFromHBitmap($handle,[IntPtr]::Zero,[System.Windows.Int32Rect]::Empty,[System.Windows.Media.Imaging.BitmapSizeOptions]::FromEmptyOptions())\n  $encoder=New-Object System.Windows.Media.Imaging.PngBitmapEncoder\n  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))\n  $stream=New-Object System.IO.MemoryStream\n  try {$encoder.Save($stream);$png=[Convert]::ToBase64String($stream.ToArray())} finally {$stream.Dispose()}\n } finally {if($handle -ne [IntPtr]::Zero){[void][DFAppImage]::DeleteObject($handle)}}\n} catch {}\n[Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((@{name=[string]$entry.Name;icon=$png}|ConvertTo-Json -Compress))))";
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',code],{
    windowsHide:true,timeout:20000,maxBuffer:4*1024*1024,env:{...process.env,DECKFORGE_APP_ID:id}
  });
  const info=JSON.parse(Buffer.from(String(stdout).trim(),'base64').toString('utf8'));
  if(typeof info.name!=='string'||!info.name.trim())throw new Error('시작 메뉴 앱을 찾지 못했습니다.');
  return {kind:'appid',path:APP_ID_PREFIX+id,name:info.name.slice(0,256),icon:info.icon?'data:image/png;base64,'+info.icon:''};
}
// Start-menu virtual file paths may begin with a Windows KNOWNFOLDERID.
function splitKnownFolderDrop(value){
  if(typeof value!=='string'||!value.startsWith('{'))return null;
  const match=/^(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\})\\(.+)$/i.exec(value);
  if(!match)return null;
  const relative=match[2],parts=relative.split('\\');
  if(value.length>4096||parts.some(part=>!part||part==='.'||part==='..'||/[\x00-\x1f\x7f/:*?"<>|]/.test(part)||/[. ]$/.test(part)))
    throw new Error('올바른 시작 메뉴 폴더 경로가 아닙니다.');
  return {id:match[1],relative};
}
async function resolveKnownFolderDrop(value){
  const parsed=splitKnownFolderDrop(value);
  if(!parsed)return null;
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const code=`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeckForgeKnownFolder {
  [DllImport("shell32.dll", ExactSpelling=true)]
  private static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);
  public static string Resolve(string text) {
    Guid id=new Guid(text);
    IntPtr ptr=IntPtr.Zero;
    try {
      Marshal.ThrowExceptionForHR(SHGetKnownFolderPath(ref id,0,IntPtr.Zero,out ptr));
      return Marshal.PtrToStringUni(ptr);
    } finally {
      if(ptr!=IntPtr.Zero)Marshal.FreeCoTaskMem(ptr);
    }
  }
}
'@
$root=[DeckForgeKnownFolder]::Resolve($env:DECKFORGE_KNOWN_FOLDER_ID)
[Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($root)))`;
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{
    windowsHide:true,timeout:8000,maxBuffer:32768,
    env:{...process.env,DECKFORGE_KNOWN_FOLDER_ID:parsed.id}
  });
  const root=requireLocalWindowsPath(Buffer.from(String(stdout).trim(),'base64').toString('utf8'));
  return requireLocalWindowsPath(path.win32.join(root,parsed.relative));
}
ipcMain.handle('d200x:inspect-dropped-target',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  const knownFolderPath=args?.allowAppId===true?await resolveKnownFolderDrop(filePath):null;
  if(knownFolderPath||(typeof filePath==='string'&&path.win32.isAbsolute(filePath))){
    const requested=requireLocalWindowsPath(knownFolderPath||filePath);
    const stat=await fs.promises.stat(requested);
    if(stat.isDirectory()){
      let icon='';
      try{
        const image=await app.getFileIcon(requested,{size:'large'});
        if(image&&!image.isEmpty())icon='data:image/png;base64,'+image.toPNG().toString('base64');
      }catch{}
      return {kind:'folder',path:requested,name:path.win32.basename(requested)||requested,icon};
    }
    return {...await inspectWindowsApplication(requested),kind:'file'};
  }
  if(args?.allowAppId===true)return inspectStartApplication(filePath);
  throw new Error('실행 파일, 바로가기 또는 폴더를 드래그하세요.');
});

// Dedicated folder control; do not reuse process-based app focus (multiple Explorer windows share a PID).
let folderControlTail=Promise.resolve();
async function writeFolderControlLog(record){
  aiEvidence.helper(record);
  try{
    const dir=path.join(app.getPath('userData'),'diagnostics');
    await fs.promises.mkdir(dir,{recursive:true});
    await fs.promises.appendFile(path.join(dir,'folder-control-'+new Date().toISOString().slice(0,10)+'.jsonl'),
      JSON.stringify({at:new Date().toISOString(),...record})+'\n','utf8');
  }catch(error){console.warn('DeckForge folder control diagnostic:',error.message);}
}
async function runFolderControl(filePath,alwaysNewWindow,foreground=true,inputId){
  const traceId=linkInput(randomUUID(),inputId);
  const record={traceId,version:app.getVersion(),mainPid:process.pid,path:filePath,alwaysNewWindow,
    foreground,mode:alwaysNewWindow?(foreground?'New':'NewPassive'):(foreground?'Focus':'Probe')};
  await writeFolderControlLog({...record,stage:'request'});
  try{
    const {stdout,stderr}=await runFolderHelper(__dirname,filePath,record.mode);
    const result=JSON.parse(String(stdout));
    await writeFolderControlLog({...record,stage:'helper-result',result,...(stderr?{stderr:String(stderr).slice(0,4000)}:{})});
    if(result.status==='focused'||result.status==='opened'||result.status==='present')return true;
    if(result.status==='missing'&&!alwaysNewWindow){
      const error=await shell.openPath(filePath);
      await writeFolderControlLog({...record,stage:'open-missing',error: error||null});
      if(error)throw new Error(error);
      await new Promise(resolve=>setTimeout(resolve,500));
      return true;
    }
    if(result.status==='matched-not-focused')throw new Error('동일 폴더를 찾았지만 창 또는 탭을 활성화하지 못했습니다. 새 창은 열지 않았습니다.');
    if(result.status==='new-not-confirmed')throw new Error('새 창 생성이 확인되지 않았습니다. 중복 실행을 방지하기 위해 다시 열지 않았습니다.');
    throw new Error('탐색기 폴더 제어 실패: '+String(result.reason||result.status));
  }catch(error){
    await writeFolderControlLog({...record,stage:'error',error:String(error.message||error)});
    throw error;
  }
}
function queueFolderControl(filePath,alwaysNewWindow,foreground=true,inputId){
  const task=folderControlTail.then(()=>runFolderControl(filePath,alwaysNewWindow,foreground,inputId));
  folderControlTail=task.catch(()=>{});
  return task;
}
async function openLocalPath(args){
  const filePath=args?.filePath;
  if(args?.target==='appid'){
    if(process.platform!=='win32'||typeof filePath!=='string'||!filePath.startsWith(APP_ID_PREFIX)||String(args?.args||'').trim())
      throw new Error('올바른 시작 메뉴 앱 실행 요청이 아닙니다.');
    const id=requireStartAppId(filePath.slice(APP_ID_PREFIX.length));
    const explorer=path.win32.join(process.env.SystemRoot||'C:\\Windows','explorer.exe');
    const child=spawn(explorer,[APP_ID_PREFIX+id],{detached:true,stdio:'ignore',shell:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();return true;
  }
  if(!['file','folder','auto'].includes(args?.target)||typeof filePath!=='string'||
      !path.win32.isAbsolute(filePath)||filePath.length>4096||/[\x00-\x1f\x7f]/.test(filePath))
    throw new Error('올바른 Windows 파일/폴더 경로를 선택하세요.');
  const stat=await fs.promises.stat(filePath);
  if(args.target==='file'&&!stat.isFile()||args.target==='folder'&&!stat.isDirectory())
    throw new Error('선택한 파일/폴더 유형이 일치하지 않습니다.');
  const extra=String(args?.args||'');
  if(process.platform==='win32'&&args.target==='folder'&&!extra.trim())
    return queueFolderControl(filePath,args.alwaysNewWindow===true,args.foreground!==false,args.inputId);
  if(!extra.trim()){
    const error=await shell.openPath(filePath);
    if(error)throw new Error(error);
    return true;
  }
  let executable=filePath,shortcutArgs='';
  if(/\.lnk$/i.test(filePath)){
    const link=shell.readShortcutLink(filePath);
    executable=requireLocalWindowsPath(link.target);
    shortcutArgs=String(link.args||'');
  }
  if(!/\.exe$/i.test(executable))throw new Error('명령줄 인수는 EXE 프로그램에만 지정할 수 있습니다.');
  const argv=[...parseWindowsArgs(shortcutArgs),...parseWindowsArgs(extra)];
  const child=spawn(executable,argv,{
    cwd:path.win32.dirname(executable),detached:true,stdio:'ignore',windowsHide:false,shell:false
  });
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();
  return true;
}
ipcMain.handle('d200x:open-local-path',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  return openLocalPath(args);
});
ipcMain.handle('d200x:open-application',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(process.platform!=='win32'||!['file','appid'].includes(args?.target)||typeof args?.filePath!=='string')
    throw new Error('올바른 프로그램 창 활성화 요청이 아닙니다.');
  const foreground=args.foreground!==false,preventDuplicate=args.preventDuplicate!==false;
  const traceId=linkInput(randomUUID(),args?.inputId);
  let spec=null;
  const log=(stage,result)=>writeAppControlLog({traceId,stage,version:app.getVersion(),spec,foreground,result});
  const launchRequest=async()=>{
    try{
      const result=await openLocalPath(args);
      await log('launch-request-result',{status:result===false?'launch-returned-false':'launch-requested',ok:result!==false});
      return result;
    }catch(error){
      await log('launch-error',{status:'error',reason:'shell-request-failed'});
      throw error;
    }
  };
  if(!foreground&&!preventDuplicate)return launchRequest();
  try{spec=appFocusSpec(args.filePath,args.target);}
  catch(error){await log('launch-error',{status:'error',reason:'invalid-focus-spec'});throw error;}
  if(!spec){
    // No reliable running-program identity for arbitrary scripts/documents.
    if(preventDuplicate){
      await log('launch-error',{status:'error',reason:'unsupported-focus-spec'});
      throw Error('중복 실행 방지는 EXE 또는 등록된 프로그램에서만 지원합니다. 옵션을 해제하고 실행하세요.');
    }
    return launchRequest();
  }
  const launch=()=>focusOrLaunch({
    foreground,preventDuplicate,
    focus:(mode,exclude)=>inspectAppFocus(spec,mode,traceId,exclude),
    launch:launchRequest,
    record:(stage,result)=>stage==='launch-unconfirmed'?log(stage,result):undefined
  });
  return preventDuplicate?queueAppLaunch(spec.kind+':'+spec.target.toLowerCase(),launch):launch();
});

// One shared last-used directory for every native import/file/folder chooser.
// A cancelled dialog does not change the remembered location.
let lastPickerDirectory=null;
function pickerLocationFile(){return path.join(app.getPath('userData'),'last-picker-folder.json');}
async function pickerDefaultPath(){
  if(lastPickerDirectory===null){
    lastPickerDirectory='';
    try{
      const saved=JSON.parse(await fs.promises.readFile(pickerLocationFile(),'utf8'));
      if(typeof saved.folder==='string'&&path.isAbsolute(saved.folder))
        lastPickerDirectory=saved.folder;
    }catch(error){if(error.code!=='ENOENT')console.warn('[D200X] Picker location ignored:',error.message);}
  }
  try{
    if(lastPickerDirectory&&(await fs.promises.stat(lastPickerDirectory)).isDirectory())
      return lastPickerDirectory;
  }catch{}
  return undefined;
}
async function savePickerLocation(selectedPath,kind='file'){
  const folder=kind==='folder'?selectedPath:path.dirname(selectedPath);
  if(!path.isAbsolute(folder))return;
  lastPickerDirectory=folder;
  await fs.promises.mkdir(path.dirname(pickerLocationFile()),{recursive:true});
  const temp=pickerLocationFile()+'.'+process.pid+'.tmp';
  try{
    await fs.promises.writeFile(temp,JSON.stringify({folder}),'utf8');
    await fs.promises.rename(temp,pickerLocationFile());
  }catch(error){
    await fs.promises.rm(temp,{force:true}).catch(()=>{});
    console.warn('[D200X] Could not remember picker folder:',error.message);
  }
}
async function openRememberedPicker(options,kind='file'){
  const defaultPath=await pickerDefaultPath();
  const result=await dialog.showOpenDialog(window,{...options,...(defaultPath?{defaultPath}:{})});
  if(result.canceled||!result.filePaths?.[0])return null;
  const selected=result.filePaths[0];
  await savePickerLocation(selected,kind);
  return selected;
}
// All imported icon packs share one device-neutral store; old user data stays intact.
function iconPacksFile(){return path.join(app.getPath('userData'),'Resources','IconPacks','icon-packs-v1.json');}
function legacyIconPacksFile(){return path.join(app.getPath('userData'),'StreamDeck','IconPacks','streamdeck-icon-packs-v1.json');}
let iconMigrationPromise=null;
async function ensureIconPacksMigrated(){
  if(!iconMigrationPromise)iconMigrationPromise=(async()=>{
    try{await fs.promises.access(iconPacksFile());return;}catch(e){if(e.code!=='ENOENT')throw e;}
    const legacy=await readPacks(legacyIconPacksFile());
    // No files are deleted. The new index is written atomically.
    await fs.promises.mkdir(path.dirname(iconPacksFile()),{recursive:true});
    const tmp=iconPacksFile()+'.'+process.pid+'.tmp';
    try{
      await fs.promises.writeFile(tmp,JSON.stringify(legacy),'utf8');
      await fs.promises.rename(tmp,iconPacksFile());
    }catch(e){await fs.promises.rm(tmp,{force:true}).catch(()=>{});throw e;}
  })().catch(e=>{iconMigrationPromise=null;throw e;});
  return iconMigrationPromise;
}
// Convert unsupported SVG, or oversized supported images, with Chromium's image
// renderer. No user-facing conversion step. Native-sized raster bytes are preserved.
async function normalizeImportedIcon(bytes,mime,filename){
  const original='data:'+mime+';base64,'+bytes.toString('base64');
  // Fast path for already-small PNG/GIF packs: no per-icon renderer round trip.
  if(mime==='image/png'&&bytes.length>=24&&
     bytes.readUInt32BE(16)<=196&&bytes.readUInt32BE(20)<=196)return original;
  if(mime==='image/gif'&&bytes.length>=10&&
     bytes.readUInt16LE(6)<=196&&bytes.readUInt16LE(8)<=196)return original;
  const animatedWebp=mime==='image/webp'&&bytes.length>21&&
    bytes.toString('ascii',12,16)==='VP8X'&&(bytes[20]&0x02)!==0;
  if(!window||window.isDestroyed())throw Error('아이콘 변환 창을 사용할 수 없습니다.');
  const script='(async()=>{'+
    'const src='+JSON.stringify(original)+';'+
    'const mime='+JSON.stringify(mime)+';'+
    'const animatedWebp='+JSON.stringify(animatedWebp)+';'+
    'const name='+JSON.stringify(filename)+';'+
    'const img=new Image();'+
    'await new Promise((ok,bad)=>{img.onload=ok;img.onerror=()=>bad(Error("이미지 디코딩 실패: "+name));img.src=src;});'+
    'if(img.naturalWidth<=0||img.naturalHeight<=0)throw Error("아이콘 크기를 확인할 수 없습니다.");'+
    'if(img.naturalWidth<=196&&img.naturalHeight<=196&&mime!=="image/svg+xml")return src;'+
    'if((mime==="image/gif"||animatedWebp)&&(img.naturalWidth>196||img.naturalHeight>196))'+
    'throw Error("대형 애니메이션 아이콘은 프레임 보존 변환이 필요합니다: "+name);'+
    'const scale=Math.min(1,196/img.naturalWidth,196/img.naturalHeight);'+
    'const w=mime==="image/svg+xml"?Math.min(196,Math.max(1,Math.round(img.naturalWidth*scale))):Math.max(1,Math.round(img.naturalWidth*scale));'+
    'const h=Math.max(1,Math.round(img.naturalHeight*scale));'+
    'const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;'+
    'canvas.getContext("2d").drawImage(img,0,0,w,h);'+
    'const format=mime==="image/jpeg"?"image/jpeg":mime==="image/webp"?"image/webp":"image/png";'+
    'return canvas.toDataURL(format);'+
    '})()';
  const result=await window.webContents.executeJavaScript(script,true);
  if(typeof result!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(result))
    throw Error('아이콘 변환 결과가 올바르지 않습니다.');
  return result;
}
let builtinPacksCache=null;
async function listIconPacks(){
  await ensureIconPacksMigrated();
  if(!builtinPacksCache){
    const file=path.join(__dirname,'builtin-iconpacks.json');
    const contents=await fs.promises.readFile(file,'utf8');
    const parsed=JSON.parse(contents);
    if(!Array.isArray(parsed)||parsed.length!==2||
      !parsed.every(pack=>pack.source==='bundled'&&pack.icons.length>1500))
      throw new Error('내장 Fluent UI 아이콘팩 데이터가 올바르지 않습니다.');
    // User-approved IoT and logo packs appear first, followed by Fluent UI.
    const variants=[
      {file:'DeckForge_IoT_COLOR_ON_OFF.streamDeckIconPack',id:'builtin-deckforge-iot-color',name:'DeckForge IoT COLOR ON/OFF'},
      {file:'DeckForge_IoT_LINE_ON_OFF.streamDeckIconPack',id:'builtin-deckforge-iot-line',name:'DeckForge IoT LINE ON/OFF'},
      {file:'DeckForge_Logo_Icons_White_Color.streamDeckIconPack',id:'builtin-deckforge-logo-white-color',name:'DeckForge Logo Icons White Color'}
    ];
    const iotPacks=[];
    for(const variant of variants){
      try{
        const iot=await parseIconPack(await fs.promises.readFile(path.join(__dirname,'bundled',variant.file)),undefined,variant.name);
        iot.id=variant.id;
        iot.source='bundled';
        iotPacks.push(iot);
      }catch(error){
        if(error.code!=='ENOENT')throw error;
      }
    }
    parsed.unshift(...iotPacks);
    builtinPacksCache=parsed;
  }
  const installed=await readPacks(iconPacksFile());
  return [...builtinPacksCache,...installed.filter(pack=>pack.source!=='bundled')];
}
ipcMain.handle('d200x:list-icon-packs',async event=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  return listIconPacks();
});
ipcMain.handle('d200x:remove-icon-pack',async(event,id)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  await ensureIconPacksMigrated();
  return removePack(iconPacksFile(),id);
});
ipcMain.handle('d200x:import-icon-pack',async event=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const file=await openRememberedPicker({
    title:'아이콘팩 파일 가져오기',
    properties:['openFile'],
    filters:[{name:'Stream Deck 아이콘팩',extensions:['streamDeckIconPack','sdIconPack']},
      {name:'ZIP 아이콘팩',extensions:['zip']}]
  });
  if(!file)return null;
  const stat=await fs.promises.stat(file);
  if(!stat.isFile()||stat.size>60*1024*1024)
    throw new Error('60MB 이하의 아이콘팩을 선택하세요.');
  const pack=await parseIconPack(await fs.promises.readFile(file),normalizeImportedIcon,path.parse(file).name);
  await ensureIconPacksMigrated();
  await registerPack(iconPacksFile(),pack);
  return pack;
});
ipcMain.handle('d200x:import-icon-folder',async event=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const folder=await openRememberedPicker({
    title:'아이콘팩 폴더 가져오기',properties:['openDirectory']
  },'folder');
  if(!folder)return null;
  const pack=await parseIconFolder(folder,normalizeImportedIcon);
  await ensureIconPacksMigrated();
  await registerPack(iconPacksFile(),pack);
  return pack;
});

// Local clipboard image only; never reads arbitrary files or executes clipboard content.
ipcMain.handle('d200x:clipboard-image', async event => {
  if (!window || event.sender !== window.webContents) return null;
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const png = image.resize({width:196,height:196,quality:'best'}).toPNG();
  if (png.length > 1024*1024) throw new Error('클립보드 이미지가 너무 큽니다.');
  return 'data:image/png;base64,' + png.toString('base64');
});

// Explicit user gesture only. Return a selected path; never open or execute it.
ipcMain.handle('d200x:choose-path', async (event, kind) => {
  if (!window || event.sender !== window.webContents) return null;
  if (!['file','folder','app','audio'].includes(kind)) throw new Error('지원하지 않는 선택 유형');
  const properties = kind === 'folder' ? ['openDirectory'] : ['openFile'];
  return openRememberedPicker({
    title: kind === 'folder' ? '폴더 선택' : kind === 'app' ? '프로그램 선택' : kind === 'audio' ? '알림음 선택' : '파일 선택',
    properties,
    ...(kind === 'app' ? {filters:[{name:'응용 프로그램',extensions:['exe','lnk','bat','cmd']},{name:'모든 파일',extensions:['*']}]} : kind==='audio'?{filters:[{name:'오디오 파일',extensions:['mp3','wav']}]}:{}),
  },kind);
});

// Browser file inputs cannot specify a safe initial directory. Route image
// and profile JSON imports through the same OS chooser instead.
ipcMain.handle('d200x:choose-import-file',async(event,kind)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const types={
    image:{title:'이미지 선택',extensions:['png','jpg','jpeg','webp','gif'],limit:5*1024*1024},
    'panel-icon':{title:'액션 아이콘 선택',extensions:['png','jpg','jpeg','webp','gif'],limit:140000},
    profile:{title:'전체 프로필 JSON 가져오기',extensions:['json'],limit:20*1024*1024},
    action:{title:'D200X 액션 JSON 불러오기',extensions:['json'],limit:5*1024*1024},
    'fusion-batch':{title:'Fusion 명령 일괄 등록 JSON',extensions:['json'],limit:2*1024*1024}
  };
  const type=types[kind];if(!type)throw new Error('지원하지 않는 파일 선택 유형입니다.');
  const selected=await openRememberedPicker({
    title:type.title,properties:['openFile'],
    filters:[{name:['profile','action'].includes(kind)?'JSON 파일':'이미지 파일',extensions:type.extensions}]
  });
  if(!selected)return null;
  const stat=await fs.promises.stat(selected);
  if(!stat.isFile()||stat.size>type.limit)throw new Error('파일 크기 또는 유형을 확인하세요.');
  const ext=path.extname(selected).slice(1).toLowerCase();
  if(!type.extensions.includes(ext))throw new Error('지원하지 않는 파일 확장자입니다.');
  const bytes=await fs.promises.readFile(selected);
  if(['profile','action','fusion-batch'].includes(kind))return {name:path.basename(selected),text:bytes.toString('utf8').replace(/^\uFEFF/,'')};
  const mime=ext==='jpg'?'image/jpeg':ext==='jpeg'?'image/jpeg':ext==='png'?'image/png':ext==='gif'?'image/gif':'image/webp';
  return {name:path.basename(selected),type:mime,size:bytes.length,
    dataUrl:'data:'+mime+';base64,'+bytes.toString('base64')};
});
// Read only the foreground process executable; never execute profile-provided
// values or return other window text. Smart Profiles require a minimized editor.
async function readForegroundApp(){
  if(!window||!window.isMinimized()||process.platform!=='win32')return null;
  const script=String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D200XFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@ -ErrorAction Stop
$handle=[D200XFocus]::GetForegroundWindow()
[uint32]$targetPid=0
[void][D200XFocus]::GetWindowThreadProcessId($handle,[ref]$targetPid)
if($targetPid -gt 0){try{$p=Get-Process -Id $targetPid -ErrorAction Stop; @{pid=[int]$targetPid;appPath=$p.Path}|ConvertTo-Json -Compress}catch{''}}
`;
  try{
    const result=await execFileAsync('powershell.exe',
      ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],
      {windowsHide:true,timeout:3500,maxBuffer:4096});
    const record=JSON.parse(String(result.stdout||'').trim()),value=record.appPath;
    return window?.isMinimized()&&Number.isSafeInteger(record.pid)&&record.pid>0&&typeof value==='string'&&
      /^[A-Za-z]:/.test(value)&&value.charCodeAt(2)===92&&value.toLowerCase().endsWith('.exe')
      ?{pid:record.pid,appPath:value}:null;
  }catch{return null;}
}
ipcMain.handle('d200x:foreground-app',async event=>{
  if(!window||event.sender!==window.webContents)return null;
  return (await readForegroundApp())?.appPath||null;
});
ipcMain.handle('d200x:smart-profile-context',async(event,includeFusion)=>{
  if(!window||event.sender!==window.webContents)return null;
  const foreground=await readForegroundApp();
  if(!foreground)return null;
  const fusion=includeFusion===true?await FusionState.readFusionState(fusionDiscoveryFile(),foreground.pid):null;
  return window?.isMinimized()?{...foreground,fusion}:null;
});

if(singleInstanceLock)app.whenReady().then(async () => {
  diagnosticPath = path.join(app.getPath('userData'), 'd200x-connection.log');
  transport.log('key-trial',keyTransportTrial?'Explicit KEY trial enabled for this process':'KEY disabled',{incremental:keyTransportTrial});
  const powerDiagnostic=type=>recordDeviceDiagnostic({time:new Date().toISOString(),type:'sdk-power-'+type,detail:{hostPresent:!!sdkHost,nativeSuspended:sdkHost?.native.suspended??null,contexts:sdkHost?.native.contexts.size??0}});
  powerMonitor.on('suspend',()=>{powerDiagnostic('suspend');sdkHost?.onSystemSuspend();});
  powerMonitor.on('resume',()=>{powerDiagnostic('resume');sdkHost?.onSystemResume();});
  Menu.setApplicationMenu(null);
  initializeTray();
  // Initial size fits the current monitor's usable work area (taskbar excluded).
  // Keep a compact editor width, and leave balanced free space above/below.
  const workArea=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const windowMargin=18;
  const usableWidth=Math.max(1,workArea.width-windowMargin*2);
  const usableHeight=Math.max(1,workArea.height-windowMargin*2);
  const initialWidth=Math.min(980,usableWidth);
  // Leave 20px more free space above and below without changing the minimum.
  const initialHeight=Math.max(Math.min(630,usableHeight),usableHeight-40);
  const minimumWidth=Math.min(960,initialWidth);
  const minimumHeight=Math.min(630,initialHeight);
  window = new BrowserWindow({
    x:workArea.x+Math.max(0,Math.floor((workArea.width-initialWidth)/2)),
    y:workArea.y+Math.max(0,Math.floor((workArea.height-initialHeight)/2)),
    width:initialWidth,
    height:initialHeight,
    minWidth:minimumWidth,
    minHeight:minimumHeight,
    backgroundColor: '#292929',
    icon: path.join(__dirname,'assets','deckforge-app.png'),
    show:!process.argv.includes('--hidden')&&!process.argv.includes('--fusion-manager'),
    title: 'DeckForge '+app.getVersion()+' — D200X'+(keyTransportTrial?' · USB 개별 키 시험 모드':''),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  // Built-in HA never invents an endpoint or replaces retained user data.
  try{console.info('기본 Home Assistant:',await sdk().ensureBuiltinHa());}
  catch(error){console.warn('기본 Home Assistant 준비 실패:',error.message);}
  // Install missing default SDK plugins without touching existing profiles/settings.
  try{
    const result=await Bundled.installMissingPlugins(sdk());
    console.info('기본 SDK 플러그인 확인:',result);
  }catch(error){console.warn('기본 플러그인 설치를 완료하지 못했습니다:',error.message);}
  // Copy Fusion add-in only when Fusion already initialized its API/AddIns folder.
  try{await Bundled.installFusionAddin()}catch(error){console.warn('Fusion 애드인 자동 복사 실패:',error.message);}
  window.on('show',()=>nativeDropHost.warm());
  window.on('hide',()=>nativeDropHost.stop());
  window.on('minimize',()=>nativeDropHost.cancel());
  window.on('move',()=>nativeDropHost.cancel());
  window.on('resize',()=>nativeDropHost.cancel());
  window.webContents.on('render-process-gone',()=>nativeDropHost.stop());
  if(window.isVisible())nativeDropHost.warm();
  require('./text-context-menu.cjs').attachTextContextMenu(window,Menu);
  await window.loadFile(path.join(__dirname, 'index.html'));
  if(process.argv.includes('--fusion-manager'))openIntegratedManager().catch(error=>console.warn('Fusion Manager 바로가기:',error.message));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  window.on('close',event=>{
    if(!quitting){
      event.preventDefault();
      window.hide(); // Renderer, plugin host, and HID input remain alive in the tray.
    }
  });
  window.on('closed', () => {nativeDropHost.stop();rendererReady=false;fusionPanelSession=null;window=null;});
  transport.start().catch(err => send('d200x:error', String(err)));
});
app.on('activate',revealEditor);
app.on('before-quit', () => {
  quitting=true;
  nativeDropHost.stop();
  transport.stop();
  sdkHost?.close().catch(error=>console.warn('SDK host shutdown:',error.message));
});
app.on('window-all-closed', () => {
  // The tray is the application owner; closing only the editor must not quit.
  if(quitting)app.quit();
});
