'use strict';
// A closed, read-only projection of DeckForge data. Never execute a model-supplied path or command.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const Core=require('../deck-core.js');
const {search:searchFusionCommands}=require('./fusion-commands.cjs');
const run=promisify(execFile);
const LIMIT=20;
const ACTION_LABELS={"audio-play":"효과음 재생","audio-stop":"효과음 정지","timer":"타이머","brightness":"D200X 밝기 설정","sleep":"D200X 화면 끄기","virtual":"Virtual DeckForge 토글","multi":"다중 동작","multi-switch":"다중 동작 스위치","random":"무작위 동작","logic":"Key Logic","website":"웹페이지","hotkey-switch":"단축키 전환","hotkey":"단축키","open":"열기 (통합)","open-app":"프로그램 열기","close":"프로그램 종료","text":"텍스트 입력","media":"재생 제어","folder":"덱폴더","profile":"프로필 전환","previous":"이전 페이지","next":"다음 페이지","goto":"선택 페이지","indicator":"페이지 표시","ha-toggle":"HA 장치 켜기/끄기","system-volume":"윈도우 음량 조절","system-mute":"윈도우 음소거","system-scroll":"윈도우 스크롤","edit-history":"실행 취소·다시 실행","window-switch":"창 전환","desktop-switch":"가상 데스크톱 전환","device-brightness":"D200X 밝기 조절","system-zoom":"앱 확대·축소","screenshot":"화면 캡처","clipboard-edit":"클립보드 편집","window-state":"창 상태","window-monitor":"다른 모니터로 이동","explorer-open":"파일 탐색기 열기","brush-size":"브러시 크기","timeline-step":"타임라인 한 단계","timeline-zoom":"타임라인 확대·축소 (앱별)","file-open":"파일 열기","folder-shortcut":"폴더 열기","terminal":"터미널","terminal-admin":"터미널(관리자)","sd-plugin":"DeckForge 플러그인 (Stream Deck SDK)"};
const arr=v=>Array.isArray(v)?v:[];
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const bool=v=>typeof v==='boolean'?v:undefined;
const num=v=>Number.isFinite(v)?v:undefined;
const code=v=>typeof v==='string'&&/^[A-Za-z0-9_.:+ -]{1,90}$/.test(v)&&!/(?:eyJ[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})/.test(v)?v:undefined;
const appId=v=>typeof v==='string'&&/^[A-Za-z0-9_.!{}-]{1,180}$/.test(v)&&!/(?:eyJ[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})/.test(v)?v:undefined;
// Labels can contain user data; remove common credential patterns and paths.
function label(v,max=80){
  if(typeof v!=='string')return '';
  if(/(?:https?:\/\/|[A-Za-z]:[\\/]|\\\\|(?:bearer|token|password|secret|api[_ -]?key)\s*[:= ]|eyJ[A-Za-z0-9_-]{12,}\.|sk-[A-Za-z0-9_-]{12,})/i.test(v))return '[숨김]';
  return v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
}
function targetName(v){
  if(typeof v!=='string'||!v)return undefined;
  if(v.startsWith('shell:AppsFolder\\'))return appId(v.slice('shell:AppsFolder\\'.length))||'[AppID]';
  return label(path.win32.basename(v))||undefined;
}
function action(a,depth=0){
  if(!a||typeof a!=='object'||depth>1)return null;
  const type=code(a.type)||'unknown',s=a.settings||{};
  const result={type,label:ACTION_LABELS[type],title:label(a.title),icon:a.icon?{kind:code(a.icon.kind),pack:code(a.icon.packId)}:undefined};
  if(['hotkey','hotkey-switch'].includes(type))Object.assign(result,{keys:code(s.keys),first:code(s.first),second:code(s.second)});
  if(['open','open-app','close','file-open','folder-shortcut','audio-play'].includes(type))Object.assign(result,{target:targetName(s.app||s.path||s.file),hasArgs:typeof s.args==='string'&&!!s.args,foreground:bool(s.foreground),preventDuplicate:bool(s.preventDuplicate),alwaysNewWindow:bool(s.alwaysNewWindow),hold:code(s.hold),force:bool(s.force)});
  if(type==='website')result.configured=typeof s.url==='string'&&!!s.url;
  if(type==='text')result.configured=typeof s.body==='string'&&!!s.body;
  if(type==='ha-toggle')result.entityId=/^(light|switch|fan|input_boolean)\.[a-z0-9_]+$/.test(s.entityId)?s.entityId:undefined;
  if(type==='sd-plugin')Object.assign(result,{plugin:code(s.pluginUUID),action:code(s.actionUUID)});
  if(type==='goto')result.targetPage=integer(s.page,0,127)?s.page+1:undefined;
  if(type==='folder')result.folderPages=1+arr(a.pages).length;
  if(['multi','multi-switch','random'].includes(type))Object.assign(result,{steps:arr(a.children).length,sequences:arr(a.sequences).map(x=>arr(x).length).slice(0,2)});
  if(type==='logic')result.gestures=['single','double','hold'].filter(k=>a.slots?.[k]);
  for(const k of ['operation','direction','axis','op','mode'])if(code(s[k]))result[k]=code(s[k]);
  for(const k of ['step','seconds','volume'])if(Number.isFinite(s[k]))result[k]=s[k];
  return result;
}
function control(profile,page,i){
  const c=profile.controls||{},scope=c.scopes?.[i]==='page'?'page':'global';
  const binding=(scope==='page'?c.pages?.[page]?.[i]:c.global?.[i]);
  const out={control:['side-first','side-back','knob-1','knob-2','knob-3'][i],scope};
  if(!binding)return {...out,down:action(profile.pages?.[page]?.[i+14]),legacy:true};
  if(i<2){
    for(const [field,gesture] of [['shortNavigation','down'],['longNavigation','hold']]){
      const config=Core.sideActionConfig(binding,i+14,gesture);
      out[field]={action:code(config.navigation),name:Core.SIDE_NAV_LABELS[config.navigation],page:integer(config.page,0,127)?config.page+1:undefined,profile:code(config.profile),rootPage:integer(config.rootPage,0,127)?config.rootPage+1:undefined,folderRoute:config.route?.map(x=>[x[0]+1,x[1]+1])};
    }
    return out;
  }
  for(const k of ['mode','target','heldMode','heldTarget'])out[k]=code(binding[k]);
  for(const k of ['autoAssign','heldEnabled','heldAutoAssign','reverseDirection','heldReverseDirection'])out[k]=bool(binding[k]);
  for(const k of ['step','heldStep'])out[k]=num(binding[k]);
  for(const k of ['stack','heldStack','inactiveRotations'])out[k]=arr(binding[k]).map(code).filter(Boolean).slice(0,5);
  for(const k of ['down','left','right','holdLeft','holdRight'])if(binding[k])out[k]=action(binding[k]);
  return out;
}
const filtered=(items,q)=>!q?items:items.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));
function slice(items,offset=0,limit=LIMIT){return {total:items.length,offset,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null};}
function profileList(s,offset){
  const profiles=arr(s.profileNames).map((p,i)=>({number:i+1,name:label(p.name),active:p.id===s.profileId,pageCount:arr(p.id===s.profileId?s.pages:arr(s.inactiveProfiles).find(x=>x.id===p.id)?.pages).length,smart:bool(p.smartEnabled),application:targetName(p.appPath)}));
  if(!profiles.length&&arr(s.pages).length)profiles.push({number:1,name:'기본 프로필',active:true,pageCount:s.pages.length});
  return {...slice(profiles,offset),source:'saved',activePage:integer(s.page,0,127)?s.page+1:null};
}
function resolvePage(s,args){
  const names=arr(s.profileNames),pmeta=args.profile==null?names.find(p=>p.id===s.profileId):names[args.profile-1];
  if(args.profile!=null&&!pmeta&&!(args.profile===1&&!names.length))return {error:'profile_not_found'};
  const profile=pmeta&&pmeta.id!==s.profileId?arr(s.inactiveProfiles).find(p=>p.id===pmeta.id):s;
  if(!profile)return {error:'profile_not_found'};
  const page=args.page==null?(profile.page||0):args.page-1;
  let items=profile.pages?.[page];
  if(!Array.isArray(items))return {error:'page_not_found'};
  // User-facing folder route uses one-based visible slot:folder-page pairs.
  // Null means root page, "current" follows the saved folder navigation.
  let route=[];
  if(args.folder==='current'){
    for(const slot of arr(profile.folderPath).slice(0,8)){
      const a=items?.[slot]||(route.length===0?profile.pinned?.[slot]:null);
      if(a?.type!=='folder')return {error:'saved_folder_not_found'};
      const p=Number.isInteger(a.pageIndex)?a.pageIndex:0;
      route.push([slot+1,p+1]);items=p===0?a.children:a.pages?.[p-1];
    }
  }else if(args.folder){
    route=args.folder.split('/').map(x=>x.split(':').map(Number));
    for(let i=0;i<route.length;i++){
      const [slot,p]=route[i],a=items?.[slot-1]||(i===0?profile.pinned?.[slot-1]:null);
      if(a?.type!=='folder')return {error:'folder_not_found',at:i+1};
      items=p===1?a.children:a.pages?.[p-2];if(!Array.isArray(items))return {error:'folder_page_not_found',at:i+1};
    }
  }
  if(!Array.isArray(items))return {error:'folder_page_not_found'};
  const keys=Array.from({length:14},(_,i)=>{
    const inherited=!route.length&&!items[i]&&!!profile.pinned?.[i];
    return {slot:i+1,...(i<13?{}:{wide:true}),...(inherited?{pinned:true}:{}),action:action(items[i]||(inherited?profile.pinned[i]:null))};
  });
  return {source:'saved',profile:pmeta?label(pmeta.name):'기본 프로필',page:page+1,pageCount:arr(profile.pages).length,folder:route.map(x=>x.join(':')).join('/')||null,keys,controls:Array.from({length:5},(_,i)=>control(profile,page,i)),wide:{current:code(profile.wideDisplay?.current),enabled:arr(profile.wideDisplay?.enabled).map(code).filter(Boolean).slice(0,10)},note:'Saved configuration only; wide/folder reserved controls and runtime overrides may differ.'};
}
async function jsonFile(file,max){
  const h=await fs.open(file,'r');try{const st=await h.stat();if(!st.isFile()||st.size>max)throw Error('file-limit');const buffer=Buffer.alloc(st.size);const {bytesRead}=await h.read(buffer,0,buffer.length,0);if(bytesRead!==st.size)throw Error('file-changed');return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/,''));}finally{await h.close();}
}
async function tail(file,max=65536){
  try{const h=await fs.open(file,'r');try{const st=await h.stat();if(!st.isFile())return [];const size=Math.min(st.size,max),b=Buffer.alloc(size);const {bytesRead}=await h.read(b,0,size,st.size-size);const lines=b.subarray(0,bytesRead).toString('utf8').split('\n');if(st.size>size)lines.shift();return lines.flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});}finally{await h.close();}}catch(e){if(e.code==='ENOENT')return [];throw e;}
}
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)?v:undefined;
// Only exact, bounded native diagnostic formats are projected; arbitrary details
// (including shortcut paths, exception messages and command lines) are never copied.
function appDetails(details){
  const running=[],packages=[],policy=[],cloaked=[],windowReasons=[];
  for(const item of arr(details).slice(0,100)){
    if(typeof item!=='string'||item.length>120)continue;
    let m=/^running-pid=(\d{1,10}) subsystem=(\d{1,5}) no-eligible-window$/.exec(item);
    if(m&&integer(+m[1],1,4294967295)&&integer(+m[2],0,65535)){
      if(running.length<8)running.push({pid:+m[1],subsystem:+m[2],noEligibleWindow:true});
      continue;
    }
    m=/^package-pid=(\d{1,10}) verified=(true|false)$/.exec(item);
    if(m&&integer(+m[1],1,4294967295)){
      if(packages.length<8)packages.push({pid:+m[1],verified:m[2]==='true'});
      continue;
    }
    m=/^policy-pid=(\d{1,10}) path=(available|missing) decision=(allow|block) reason=(shared-host|console|gui|verified-package|unknown-or-nongui)$/.exec(item);
    if(m&&integer(+m[1],1,4294967295)){
      if(policy.length<8)policy.push({pid:+m[1],pathAvailable:m[2]==='available',decision:m[3],reason:m[4]});
      continue;
    }
    // Older logs retain their original cloak diagnostics.
    m=/^cloaked=(-1|[0-7])$/.exec(item);
    if(m&&!cloaked.includes(+m[1]))cloaked.push(+m[1]);
    if(item==='window-reason=app-cloaked-packaged'&&!windowReasons.length)windowReasons.push('app-cloaked-packaged');
  }
  return {...(running.length?{running}:{}),...(packages.length?{packages}:{}),...(policy.length?{policy}:{}),...(cloaked.length?{cloaked}:{}),...(windowReasons.length?{windowReasons}:{})};
}
function logRecord(r){
  const x=r.result||{},rec=r.record||{},trace=r.trace||{},spec=r.spec||{};
  const specKind=['AppID','EXE','Terminal','EditorHwnd'].includes(spec.kind)?spec.kind:undefined;
  const target=specKind==='AppID'?appId(spec.target):specKind==='EXE'?targetName(spec.target):specKind==='Terminal'&&['admin','normal'].includes(spec.target)?spec.target:undefined;
  return {at:iso(r.at),trace:code(r.traceId),version:code(r.version),specKind,target,...appDetails(x.details),stage:code(r.stage||r.type),mode:code(r.mode),status:code(x.status),reason:code(x.reason),found:bool(x.found),ok:bool(r.ok),error:!!r.error||!!x.error,errorFieldPresent:Object.hasOwn(r,'error'),rendererStage:code(rec.stage),slot:num(rec.slot??trace.slot),page:Number.isInteger(rec.page??trace.page)?(rec.page??trace.page)+1:undefined,dirty:bool(rec.dirty??trace.dirty),force:bool(r.force),foreground:bool(r.foreground),steps:arr(x.steps).slice(-8).map(y=>({stage:code(y.stage),pid:num(y.pid),reason:code(y.reason),result:bool(y.detail)})),remaining:Array.isArray(x.remaining)?x.remaining.length:num(x.remaining)};
}
const START_SCRIPT="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-StartApps | Select-Object Name,AppID) | ConvertTo-Json -Compress";
const WINDOW_SCRIPT=String.raw`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeckForgeAiWindowRead {
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$front=[DeckForgeAiWindowRead]::GetForegroundWindow()
@(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object {
  $h=$_.MainWindowHandle
  [pscustomobject]@{Name=$_.ProcessName;Pid=$_.Id;Minimized=[DeckForgeAiWindowRead]::IsIconic($h);Foreground=($h -eq $front)}
}) | ConvertTo-Json -Compress`;
async function windowsApps(kind,signal){
  if(process.platform!=='win32')throw Error('windows-only');
  const script=kind==='start_apps'?START_SCRIPT:WINDOW_SCRIPT;
  // Fixed scripts; arguments and query strings never enter the shell.
  const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const {stdout}=await run(exe,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:2*1024*1024,signal});
  const data=JSON.parse(String(stdout).trim().replace(/^\uFEFF/,'')||'[]');
  return (Array.isArray(data)?data:[data]).filter(x=>x&&typeof x.Name==='string').map(x=>kind==='start_apps'?{name:label(x.Name),appId:appId(x.AppID)||'[숨김]'}:{name:label(x.Name),pid:num(x.Pid),minimized:bool(x.Minimized),foreground:bool(x.Foreground)});
}
const BUILTIN=[['DeckForge_IoT_COLOR_ON_OFF.streamDeckIconPack','DeckForge IoT COLOR ON/OFF'],['DeckForge_IoT_LINE_ON_OFF.streamDeckIconPack','DeckForge IoT LINE ON/OFF'],['DeckForge_Logo_Icons_White_Color.streamDeckIconPack','DeckForge Logo Icons White Color']];
async function iconMetadata(root,userData){
  const result=[],warnings=[];
  const add=(packs,source)=>{for(const p of arr(packs))if(p&&Array.isArray(p.icons))result.push({name:label(p.name,120),source,icons:p.icons.map(x=>({name:label(x?.name||path.posix.basename(String(x?.path||'')).replace(/\.[^.]+$/,'')),tags:arr(x?.tags).map(t=>label(t,40)).slice(0,8)}))});};
  try{add(await jsonFile(path.join(root,'builtin-iconpacks.json'),128*1024*1024),'bundled');}catch{warnings.push('fluent_catalog_unavailable');}
  for(const [file,name] of BUILTIN){
    try{
      const JSZip=require('jszip'),f=path.join(root,'bundled',file),st=await fs.stat(f);
      if(st.size>60*1024*1024)throw Error('size');
      const z=await JSZip.loadAsync(await fs.readFile(f)),entries=Object.values(z.files);
      const index=entries.find(e=>!e.dir&&/(?:^|\/)icons\.json$/i.test(e.name));
      const rows=index&&index._data?.uncompressedSize<=1024*1024?JSON.parse(await index.async('string')):entries.filter(e=>!e.dir&&/\.(png|jpe?g|gif|webp|svg)$/i.test(e.name)&&!/(?:^|\/)(?:icon|categoryicon|preview)\.(?:png|svg|jpe?g)$/i.test(e.name)).map(e=>({name:path.posix.basename(e.name).replace(/\.[^.]+$/,'')}));
      add([{name,icons:rows}],'bundled');
    }catch{warnings.push('bundled_icon_catalog_unavailable');}
  }
  try{add(await jsonFile(path.join(userData,'Resources','IconPacks','icon-packs-v1.json'),128*1024*1024),'installed');}catch(e){if(e.code==='ENOENT'){try{add(await jsonFile(path.join(userData,'StreamDeck','IconPacks','streamdeck-icon-packs-v1.json'),128*1024*1024),'legacy');}catch(x){if(x.code!=='ENOENT')warnings.push('installed_icon_catalog_unavailable');}}else warnings.push('installed_icon_catalog_unavailable');}
  return {packs:result,warnings};
}
async function pluginMetadata(userData){
  const dir=path.join(userData,'Plugins');let entries;
  try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const items=[];
  for(const entry of entries.filter(x=>x.isDirectory()&&/^[A-Za-z0-9_.-]+\.sdPlugin$/.test(x.name)).slice(0,100)){
    try{
      const p=await jsonFile(path.join(dir,entry.name,'manifest.json'),1024*1024);
      if(entry.name!==p.UUID+'.sdPlugin'||!Array.isArray(p.Actions))continue;
      items.push({name:label(p.Name),uuid:code(p.UUID),version:code(p.Version),actions:p.Actions.slice(0,500).map(a=>({name:label(a.Name),uuid:code(a.UUID),controllers:arr(a.Controllers).map(code).filter(Boolean)}))});
    }catch{}
  }
  return items;
}
const {walkTemplates}=require('./advanced-plan.js');

const {assess}=require('./evidence.cjs');
const KNOWLEDGE=[
  {topic:'layout',facts:'13 ordinary root keys (1–13), reserved wide slot 14, side controls 1–2, knobs 1–3. Physical packets: raw key 0–12, wide 13/14, sides 15/16, knobs 17–19. Root pinned keys provide fallback only for empty positions. Folder page 1=children, later pages=pages[], return key in empty slot 14; legacy contents may differ.'},
  {topic:'controls',facts:'Knob trigger mode can use explicit left/right actions or automatic target; stack mode cycles selected targets on press. Held rotation can disable ordinary press. Scope global applies across the active profile; page scope uses the per-page binding. Steps 1/2/5/10. Check configured and inactive rotations, not only target label.'},
  {topic:'wide',facts:'Wide modes clock/datetime/stats/knobs. Root wide key cycles enabled modes. An unsaved warning temporarily overrides wide display; pressing it requests editor focus. A USB transfer or focus request is not visual confirmation.'},
  {topic:'editing',facts:'propose_edit stages basic root edits; propose_advanced stages folder/control/wide/composite/state-design/plugin edits. Active profile, bounded operations, fixed validation, user Apply and Save confirmation, existing atomic profile write, then display sync request. Dirty or changed snapshot blocks apply; last change undo only within session and unchanged state. No model direct write or execution.'},
  {topic:'plugins',facts:'Native HA REST supported entities light/switch/fan/input_boolean require configured server and real entity verification. SDK HA and existing Fusion templates reuse saved settings. For new Fusion commands use fusion_commands and kind fusion-live; exact live ID and installed SDK runcommand action must be verified. Empty template list does not prove absence of installed commands or devices. SDK key acknowledgement is dispatch evidence, not remote action success.'},
  {topic:'diagnostics',facts:'input_trace uses explicit packet IDs and actual dispatch observations; last 128 post-sleep-filter inputs only, volatile, no historical reconstruction. Distinguish reception, renderer, resolved slot, plan, filter/deferred gesture, request, returned/failed and native helper stage. Use app_log with the exact helper trace to see safe AppID/EXE name, PID, PE subsystem, package identity, per-PID allow/block reason and path availability (older logs may include cloak), and launch error reason. Since 1.1.52 verified-package means exact OS package AppID; subsystem=0 in that case is not inspected, not an invalid image. launch-requested is only shell request acceptance, not evidence of a window. No result is not proof of failure. SDK/SendInput/REST or shell request acceptance is not proof of effect. Delayed logic, timer/chime, unsaved-dialog resume, separate release/hold and composite substeps may have incomplete evidence. A filtered up event normally does not execute.'},
  {topic:'optimization',facts:'layout_review checks saved page holes, exactly repeated basic action settings, incomplete configured fields and inactive rotations. These are review candidates, not proof of defects; duplicate keys can be intentional. No automatic changes. Use page and liveView before making an approved proposal.'},
  {topic:'usage',facts:'ChatGPT direct connection only. At most 3 API requests, 4 tool calls and one edit proposal per question; last 8 messages / 16000 characters. Approve/cancel/undo locally. Reported token usage is API usage, not exact subscription deduction.'}
];
function layoutReview(s,a){
  const page=resolvePage(s,a);if(page.error)return page;
  const names=arr(s.profileNames),meta=a.profile==null?names.find(p=>p.id===s.profileId):names[a.profile-1];
  const profile=meta&&meta.id!==s.profileId?arr(s.inactiveProfiles).find(x=>x.id===meta.id):s;
  let row=profile?.pages?.[page.page-1];
  if(page.folder)for(const [depth,pair] of page.folder.split('/').entries()){
    const [slot,fp]=pair.split(':').map(Number),f=row?.[slot-1]||(depth===0?profile.pinned?.[slot-1]:null);
    row=fp===1?f?.children:f?.pages?.[fp-2];
  }
  const findings=[],groups=new Map(),empty=[];
  for(let i=0;i<13;i++){
    const a=row?.[i]||(!page.folder?profile.pinned?.[i]:null);
    if(!a){empty.push(i+1);continue;}
    const st=a.settings||{},type=a.type;
    const missing=type==='hotkey'&&!String(st.keys||'').trim()||type==='open-app'&&!String(st.app||'').trim()||['file-open','folder-shortcut'].includes(type)&&!String(st.path||'').trim()||type==='ha-toggle'&&!String(st.entityId||'').trim()||type==='website'&&!String(st.url||'').trim();
    if(missing)findings.push({kind:'incomplete_configuration',slot:i+1,type});
    // Compare locally, do not disclose paths, bodies or arbitrary private settings.
    if(['hotkey','open-app','file-open','folder-shortcut','media','clipboard-edit','goto'].includes(type)&&!missing){
      const key=JSON.stringify([type,st]);
      const group=groups.get(key)||{type,slots:[]};group.slots.push(i+1);groups.set(key,group);
    }
  }
  for(const group of groups.values())if(group.slots.length>1)findings.push({kind:'same_saved_action_settings',...group});
  for(const c of page.controls)if(c.inactiveRotations?.length)findings.push({kind:'inactive_rotation_overrides',control:c.control,gestures:c.inactiveRotations});
  return {source:'saved page, local checks only',profile:page.profile,page:page.page,folder:page.folder,emptySlots:empty,occupied:13-empty.length,findings,note:'Candidates only; do not infer intent or automatically remove duplicates. Compare liveView/dirty before editing.'};
}

const SECTIONS=['input_trace','layout_review','knowledge','plugin_templates','profiles','page','actions','icon_packs','icons','start_apps','running_windows','device','recent_inputs','plugins','plugin_actions','ha','fusion','fusion_commands','app_log','folder_log','usb_log','guide'];
const TOOL={type:'function',name:'inspect',description:'Read only. sections: profiles; page (profile/page are 1-based, folder "current" or "2:1/3:2" = slot:folder-page, null=root); actions; icon_packs; icons; start_apps; running_windows; device; recent_inputs; input_trace (correlated physical input/dispatch/request/helper evidence, query by packet id or failure); layout_review (local saved-page review); knowledge (filter topic); plugins; plugin_actions; plugin_templates (configured Fusion command IDs / SDK HA entity IDs only); ha; fusion; fusion_commands (live Fusion IDs, localized names when available, query Korean or English, pagination; not proof of execute eligibility); app_log; folder_log; usb_log; guide. query filters locally, offset paginates. Null for unused arguments. No raw paths, commands or logs.',parameters:{type:'object',properties:{section:{type:'string',enum:SECTIONS},profile:{type:['integer','null']},page:{type:['integer','null']},folder:{type:['string','null']},query:{type:['string','null']},offset:{type:['integer','null']}},required:['section','profile','page','folder','query','offset'],additionalProperties:false},strict:true};
function validate(a){
  if(!a||Array.isArray(a)||typeof a!=='object'||Object.keys(a).length!==6||!SECTIONS.includes(a.section)||!['profile','page','folder','query','offset'].every(k=>Object.hasOwn(a,k)))throw Error('invalid-query');
  if(a.profile!==null&&!integer(a.profile,1,50)||a.page!==null&&!integer(a.page,1,128)||a.offset!==null&&!integer(a.offset,0,10000)||a.query!==null&&(typeof a.query!=='string'||a.query.length>100)||a.folder!==null&&(typeof a.folder!=='string'||a.folder!=='current'&& !/^(?:[1-9]|1[0-4]):(?:[1-9]|10)(?:\/(?:[1-9]|1[0-4]):(?:[1-9]|10)){0,7}$/.test(a.folder)))throw Error('invalid-query');
  return {...a,offset:a.offset??0,query:a.query||''};
}
const GUIDE={product:'DeckForge is a Windows editor for Ulanzi D200X; 13 ordinary LCD keys plus wide display, two side controls and three knobs. Root key positions shown one-based; hardware log indices are raw, zero-based (13/14 wide halves, 15/16 side, 17–19 knob). Profile/page/folder queries return saved data; current view may be different while editing. Pinned keys fill empty root slots. Folder paths use slot:page. A USB transfer or input receipt does not prove display rendering or action success. App/folder traces report specific stages; only verified native window focus is evidence of foreground. SDK plugin connection is not proof a HA entity or Fusion action executed. Inspect is read-only. In edit mode the separate propose_edit tool may stage a preview; only a human-approved local UI action saves settings. AI cannot run programs or send device inputs. For latest behavior query instead of guessing.'};
function createReader({root,userData,view,device,inputs,evidence=()=>[],version='unknown',ha,fusion,fusionCommands,apps=windowsApps,icons=iconMetadata,plugins=pluginMetadata,readState=()=>jsonFile(path.join(userData,'Profiles','profiles.json'),128*1024*1024)}){
  return function session(){
    let state,iconCache,pluginCache;
    const localCache=new Map();
    return async function inspect(raw,signal){
      const a=validate(raw),q=a.query,o=a.offset;
      signal?.throwIfAborted();
      try{
        let result;
        if(a.section==='guide')result={...GUIDE,version,sections:['input_trace','layout_review','knowledge'],note:'Use knowledge by topic for current implementation. No automatic repair.'};
        else if(a.section==='knowledge')result={version,...slice(filtered(KNOWLEDGE,q),o,8)};
        else if(a.section==='input_trace'){
          const snapshot=evidence();
          const rows=snapshot.slice().reverse().map(assess);
          const selected=filtered(rows,q),exact=q?snapshot.find(x=>x.id===q):null;
          result={...slice(selected,o,12),...(exact?{detail:exact}:{}),source:'bounded session post-filter packet IDs; delivered means sending attempted, renderer stage confirms receipt; only explicitly linked stages, not proof of external effects'};
        }else if(a.section==='layout_review'){
          state??=await readState();result={...layoutReview(state,a),liveView:await view().catch(()=>null)};
        }
        else if(a.section==='plugin_templates'){
          state??=await readState();
          const rows=walkTemplates(state).map(x=>({kind:x.kind,id:label(x.id,256),name:label(x.name,120)}));
          result={...slice(filtered(rows,q),o),source:'saved configured plugin commands and entities only; plugin installation verified separately before proposal'};
        }
        else if(a.section==='profiles'||a.section==='page'){
          state??=await readState();
          const v=await view().catch(()=>null);
          result=a.section==='profiles'?profileList(state,o):resolvePage(state,a);
          if(a.section==='page'&&q&&!result.error){result.keys=filtered(result.keys,q);result.controls=filtered(result.controls,q);result.filtered=true;}
          result={...result,liveView:v,note:result.note||'Saved profiles; live view is separate.'};
        }else if(a.section==='actions'){
          result=slice(filtered([...Core.ACTION_IDS,...Core.D200X_ACTION_IDS,...Core.PLUGIN_ACTION_IDS].map(type=>({type,label:ACTION_LABELS[type],settingsFields:Object.keys(Core.DEFAULTS[type]||{}).filter(k=>!['args','body','pluginSettings'].includes(k))})),q),o,50);
        }else if(['icons','icon_packs'].includes(a.section)){
          iconCache??=await icons(root,userData);
          const rows=a.section==='icon_packs'?iconCache.packs.map(p=>({name:p.name,source:p.source,count:p.icons.length})):iconCache.packs.flatMap(p=>p.icons.map(x=>({pack:p.name,source:p.source,name:x.name,tags:x.tags})));
          result={...slice(filtered(rows,q),o),warnings:iconCache.warnings};
        }else if(['start_apps','running_windows'].includes(a.section)){
          if(!localCache.has(a.section))localCache.set(a.section,await apps(a.section,signal));
          result={...slice(filtered(localCache.get(a.section),q),o),source:a.section==='start_apps'?'Get-StartApps (Start-menu applications, not every installed executable)':'Get-Process main windows only; no window titles or full paths'};
        }else if(a.section==='device')result=await device();
        else if(a.section==='recent_inputs')result={...slice(filtered(inputs().slice().reverse(),q),o),source:'runtime transport events after sleep filtering; receipt is not successful action execution'};
        else if(['plugins','plugin_actions'].includes(a.section)){
          pluginCache??=await plugins(userData);
          result={...slice(filtered(a.section==='plugins'?pluginCache.map(p=>({name:p.name,uuid:p.uuid,version:p.version,actionCount:p.actions.length})):pluginCache.flatMap(p=>p.actions.map(a=>({plugin:p.uuid,...a}))),q),o),source:'installed manifests; not proof of runtime connection'};
        }else if(a.section==='ha'){
          if(!localCache.has('ha'))localCache.set('ha',await ha());
          const h=localCache.get('ha');result={configured:h.configured,...(h.error?{error:h.error}:{}),...slice(filtered(arr(h.entities).map(e=>({entityId:/^(light|switch|fan|input_boolean)\.[a-z0-9_]+$/.test(e.entity_id)?e.entity_id:undefined,name:label(e.name),state:code(e.state)})),q),o),source:'built-in HA REST read only; SDK-only connection may be separate'};
        }else if(a.section==='fusion_commands'){
          if(typeof fusionCommands!=='function')return {section:a.section,ok:false,error:'fusion_commands_unavailable'};
          if(!localCache.has(a.section))localCache.set(a.section,await fusionCommands(signal));
          result={...searchFusionCommands(localCache.get(a.section),q,o),source:'live local Fusion /commands; Korean names joined by exact ID from bundled catalog when available; registered ID is not proof of successful execution'};
        }else if(a.section==='fusion')result={available:await fusion(),source:'local Fusion add-in /health; not proof of successful command'};
        else{
          const section=a.section,day=new Date(),previous=new Date(day.getTime()-86400000),dates=[previous,day].map(d=>d.toISOString().slice(0,10));
          const files=section==='usb_log'?['d200x-connection.log.previous','d200x-connection.log'].map(f=>path.join(userData,f)):dates.map(d=>path.join(userData,'diagnostics',(section==='app_log'?'app-control-':'folder-control-')+d+'.jsonl'));
          const rawRows=(await Promise.all(files.map(f=>tail(f)))).flat(),rows=rawRows.map(logRecord).reverse();
          result={...slice(filtered(rows,q),o,16),source:'bounded latest log tails (64 KiB each); only allowlisted structured fields, not raw log text',partial:true};
        }
        signal?.throwIfAborted();const out={section:a.section,ok:!result.error,...result};
        if(JSON.stringify(out).length>12000)return {section:a.section,ok:false,error:'result_too_large_narrow_query'};
        return out;
      }catch(e){signal?.throwIfAborted();return {section:a.section,ok:false,error:e.code==='ENOENT'?'not_saved_or_missing':'local_query_unavailable'};}
    };
  };
}
module.exports={TOOL,SECTIONS,validate,createReader,action,resolvePage,profileList,logRecord,label,tail,layoutReview,windowsApps};
