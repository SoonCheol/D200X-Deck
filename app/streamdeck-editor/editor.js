"use strict";
/* DeckForge editor for D200X. */
const ORIGINAL_CATALOG = [
  ["Soundboard", [["audio-play","효과음 재생","♫"],["audio-stop","효과음 정지","◼"]]],
  ["DeckForge", [["timer","타이머","◴"],["brightness","D200X 밝기 설정","☼"],["sleep","D200X 화면 끄기","☾"],["virtual","Virtual DeckForge 토글","▣"]]],
  ["순차 동작", [["multi","순차 동작","▤"],["multi-switch","순차 동작 스위치","⇄"],["random","무작위 동작","⚄"],["logic","Key Logic","⇧"],["gesture-test","터치 입력 검증","◎"]]],
  ["시스템", [["website","웹페이지","◎"],["hotkey-switch","단축키 전환","⇄"],["hotkey","단축키","⌨"],["open","열기 (통합)","▢"],["open-app","프로그램 열기","▣"],["close","프로그램 종료","×"],["text","텍스트 입력","¶"],["media","재생 제어","♫"]]],
  ["탐색", [["folder","덱폴더","▣"],["profile","프로필 전환","⇆"],["previous","이전 페이지","←"],["next","다음 페이지","→"],["goto","선택 페이지","↗"],["indicator","페이지 표시","①"]]],
  ["플러그인 · Home Assistant", [["ha-toggle","HA 장치 켜기/끄기","⌂"]]],
  ["D200X 추가 액션", [["system-volume","윈도우 음량 조절","🔊"],["system-mute","윈도우 음소거","🔇"],["system-scroll","윈도우 스크롤","↕"],["edit-history","실행 취소·다시 실행","↶"],["window-switch","창 전환","▣"],["desktop-switch","가상 데스크톱 전환","⇄"],["device-brightness","D200X 밝기 조절","☀"],["system-zoom","앱 확대·축소","⊕"],["screenshot","화면 캡처","▣"],["clipboard-edit","클립보드 편집","▤"],["window-state","창 상태","□"],["window-monitor","다른 모니터로 이동","⇆"],["explorer-open","파일 탐색기 열기","▢"],["brush-size","브러시 크기","◉"],["timeline-step","타임라인 한 단계","▶"],["timeline-zoom","타임라인 확대·축소 (앱별)","⊕"],["file-open","파일 열기","▣"],["folder-shortcut","폴더 열기","▢"],["terminal","터미널","▣"],["terminal-admin","터미널(관리자)","▣"]]]
];
// The catalogue changes presentation only: stable IDs, settings and executable actions remain unchanged.
const CATALOG = window.D200XPanelIcons.groups.map(([category,ids])=>[
  category,ids.map(id=>{
    const entry=ORIGINAL_CATALOG.flatMap(([,items])=>items).find(item=>item[0]===id);
    if(!entry)throw new Error("액션 목록 누락: "+id);
    return entry;
  })
]);
const HOTKEY_PRESETS={
  copy:'Ctrl+C',paste:'Ctrl+V',cut:'Ctrl+X',
  undo:'Ctrl+Z',redo:'Ctrl+Y',save:'Ctrl+S',
  selectAll:'Ctrl+A',find:'Ctrl+F',newWindow:'Ctrl+N',
  switchWindow:'Alt+Tab',showDesktop:'Win+D',
  explorer:'Win+E',lock:'Win+L',taskManager:'Ctrl+Shift+Escape',
  screenshot:'Win+Shift+S',
  switchWindowPrevious:'Alt+Shift+Tab',
  windowMaximize:'Win+Up',
  windowRestore:'Win+Down',
  monitorLeft:'Win+Shift+Left',
  monitorRight:'Win+Shift+Right',
  desktopPrevious:'Win+Ctrl+Left',
  desktopNext:'Win+Ctrl+Right',
  brushDecrease:'BracketLeft',
  brushIncrease:'BracketRight',
  timelinePrevious:'Left',
  timelineNext:'Right',
  timelineZoomIn:'Ctrl+Plus',
  timelineZoomOut:'Ctrl+Minus'
};
const HOTKEY_PRESET_LABELS=[
  ['','직접 지정'],['copy','복사'],['paste','붙여넣기'],['cut','잘라내기'],
  ['undo','실행 취소'],['redo','다시 실행'],['save','저장'],
  ['selectAll','전체 선택'],['find','찾기'],['newWindow','새 창'],
  ['switchWindow','창 전환'],['showDesktop','바탕화면 보기'],
  ['explorer','파일 탐색기'],['lock','윈도우 잠금'],['taskManager','작업 관리자'],
  ['screenshot','영역 캡처'],
  ['switchWindowPrevious','이전 창 전환'],
  ['windowMaximize','창 최대화'],
  ['windowRestore','창 복원·최소화'],
  ['monitorLeft','왼쪽 모니터로 이동'],
  ['monitorRight','오른쪽 모니터로 이동'],
  ['desktopPrevious','이전 가상 데스크톱'],
  ['desktopNext','다음 가상 데스크톱'],
  ['brushDecrease','브러시 축소 (앱별)'],
  ['brushIncrease','브러시 확대 (앱별)'],
  ['timelinePrevious','이전 타임라인 단계 (앱별)'],
  ['timelineNext','다음 타임라인 단계 (앱별)'],
  ['timelineZoomIn','타임라인 확대 (앱별)'],
  ['timelineZoomOut','타임라인 축소 (앱별)']
];
const PANEL_SHORTCUTS={
  "window-monitor":"Win + Shift + ← / →",
  "window-state":"Win + ↑ / ↓",
  "window-switch":"Alt + Tab",
  "desktop-switch":"Win + Ctrl + ← / →",
  "screenshot":"Win + Shift + S",
  "explorer-open":"Win + E",
  "clipboard-edit":"Ctrl + C / V / X",
  "edit-history":"Ctrl + Z / Y",
  "system-zoom":"Ctrl + + / - / 0 (앱별)",
  "brush-size":"[ / ] (앱별)",
  "timeline-step":"← / → (앱별)",
  "timeline-zoom":"Ctrl + + / - (앱별)",
  "hotkey":"사용자 지정",
  "hotkey-switch":"사용자 지정",
  "text":"유니코드 텍스트 입력"
};
const ACTIONS = new Map(CATALOG.flatMap(([category, entries]) => entries.map(([id,label,icon]) => [id,{category,id,label,icon}])));
ACTIONS.set('sd-plugin',{category:'플러그인',id:'sd-plugin',label:'DeckForge 플러그인 (Stream Deck SDK)',icon:'▣'});
const STORAGE_KEY="d200x-streamdeck-editor-prototype-v1";
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const KEY_COUNT = 14;
const CONTROLS = [{name:"첫 페이지",kind:"side"},{name:"뒤로 가기",kind:"side"},{name:"노브 1",kind:"knob"},{name:"노브 2",kind:"knob"},{name:"노브 3",kind:"knob"}];
const blankPage = () => DeckCore.blankPage();
let controlGesture="down";
let knobTab='normal';
const stackPositions=[0,0,0];
let state=DeckCore.migrateState(null);
let backupPending=false;
let folderExitTimer=null;
function cancelFolderAutoExit(){
  if(folderExitTimer!==null)clearTimeout(folderExitTimer);
  folderExitTimer=null;
}
function scheduleFolderExitAfterAction(){
  cancelFolderAutoExit();
  const settings=DeckCore.activeFolder(state)?.settings;
  if(settings?.autoExitEnabled!==true)return;
  const seconds=Number(settings.autoExitSeconds);
  if(!Number.isInteger(seconds)||seconds<0||seconds>60)return;
  const profile=state.profileId,path=JSON.stringify(state.folderPath);
  folderExitTimer=setTimeout(()=>{
    folderExitTimer=null;
    if(state.profileId!==profile||JSON.stringify(state.folderPath)!==path)return;
    if(DeckCore.exitFolder(state)){persist();render();}
  },seconds*1000);
}
let profileStorageFailure=false;
let profileStorageError='';
try {
  if(window.deckBridge?.readProfile){
    const saved=window.deckBridge.readProfile();
    if(!saved?.ok)throw Error(saved?.error||'프로필 파일을 읽지 못했습니다.');
    if(saved.state)state=DeckCore.migrateState(saved.state);
  }else{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){
      state=DeckCore.migrateState(JSON.parse(raw));
      backupPending=!localStorage.getItem(STORAGE_KEY+'-pre-profiles-backup');
    }
  }
}catch(error){
  console.error('프로필 불러오기 실패',error);
  profileStorageFailure=true; // Never overwrite an unreadable profile with blank state.
  profileStorageError=String(error?.message||error);
  state=DeckCore.migrateState(null);
}
const pageVisitTracker=DeckCore.createPageVisitTracker();
pageVisitTracker.observe(state);
let inspectorSession=null;
let inspectorEditing=false;
const persist=(scheduleSync=true)=>{
  if(inspectorSession&&(inspectorEditing||inspectorSession.dirty)){
    inspectorSession.dirty=JSON.stringify(state)!==inspectorSession.snapshot;
    updateInspectorSaveButtons();return true;
  }
  try {
    if(profileStorageFailure)throw Error('프로필 파일 읽기 실패 상태에서는 덮어쓰지 않습니다.');
    if(window.deckBridge?.writeProfile){
      const saved=window.deckBridge.writeProfile(state);
      if(!saved?.ok)throw Error(saved?.error||'프로필 파일 저장 실패');
    }else{
      if(backupPending){
        const old=localStorage.getItem(STORAGE_KEY);
        if(old&&!localStorage.getItem(STORAGE_KEY+'-pre-profiles-backup'))
          localStorage.setItem(STORAGE_KEY+'-pre-profiles-backup',old);
        backupPending=false;
      }
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    }
  } catch(error) {
    console.error('D200X 설정 저장 실패',error);
    window.d200xActionStatus?.('설정 저장 실패: 저장 공간/권한을 확인하세요.');
    return false;
  }
  if(inspectorSession&&!inspectorSession.dirty)inspectorSession.snapshot=JSON.stringify(state);
  if(scheduleSync)window.scheduleDeckSync?.();
  return true;
};
// Migration: preserve the existing 14 key assignments and extend with 5 physical controls.
state.pages.forEach(page=>{while(page.length<KEY_COUNT+CONTROLS.length)page.push(null);});
const valueOf=(item,field,fallback="")=>item?.settings?.[field]??fallback;
function keyName(item){const visual=item?.pressMeta?pressDisplayAction(item):item;return visual?.title||ACTIONS.get(visual?.type)?.label||"";}
const sdkVisuals=new Map();
const FUSION_PLUGIN='com.autodesk.fusionstreamdeck';
let fusionButtonNames={ko:{},en:{},language:'ko'},fusionLanguageRequest=0;
function fusionLocalizedVisual(item,title){
  const id=fusionCommandId(item),mode=item.settings?.fusionTitleLanguage;
  const language=mode==='en'||mode==='ko'?mode:fusionButtonNames.language;
  const localize=original=>{
    if(typeof original!=='string'||!original)return original||'';
    if(language==='ko'&&/[가-힣]/.test(original))return original;
    const names=fusionButtonNames[language]||{};
    return Object.prototype.hasOwnProperty.call(names,id)?names[id]:original;
  };
  const pair=item.settings?.stateTitles;
  const settings=pair?{...item.settings,stateTitles:Object.fromEntries(Object.entries(pair).map(([key,value])=>[key,value&&typeof value==='object'?{...value,title:localize(value.title)}:value]))}:item.settings;
  return {...item,settings,title:localize(title)};
}
async function refreshFusionButtonLanguage(){
  if(!window.deckBridge?.fusionButtonLanguage)return;
  const request=++fusionLanguageRequest;
  try{
    const data=await window.deckBridge.fusionButtonLanguage();
    if(request!==fusionLanguageRequest||!data)return;
    fusionButtonNames=data;
    renderGrid();void refreshSelectedVisual();
    const selected=DeckCore.visibleActions(state)[state.selected];
    const item=pressIsOrdinary(selected)?pressSlotAction(selected,activePressTab):selected;
    if(item)void refreshStateTitleCards(item);
    window.scheduleDeckSync?.();
  }catch(error){console.warn('Fusion 표시 언어 읽기 실패:',error.message);}
}
const fusionIconCache=new Map(),fusionCachePending=new Set(),fusionCacheMisses=new Map(),
  fusionConnected=new Set(),fusionOfflineContexts=new Set(),fusionLiveContexts=new Set(),unverifiedFusionContexts=new Set();
let fusionHealthAvailable=null,fusionHealthBusy=false;
async function refreshFusionHealth(){
  if(fusionHealthBusy||!window.deckBridge?.fusionHealth)return;
  fusionHealthBusy=true;
  try{
    const available=await window.deckBridge.fusionHealth();
    if(typeof available==='boolean'&&available!==fusionHealthAvailable){
      fusionHealthAvailable=available;
      renderGrid();window.scheduleDeckSync?.();
    }
  }catch(error){console.warn('Fusion 연결 상태 조회 실패',error);
    if(fusionHealthAvailable!==false){fusionHealthAvailable=false;renderGrid();window.scheduleDeckSync?.();}
  }finally{fusionHealthBusy=false;}
}

function fusionCommandId(item){return isFusionAction(item)?item.settings?.pluginSettings?.commandId:null;}
function fusionDisabledImage(uri){
  if(typeof uri!=='string'||!uri.startsWith('data:image/svg+xml;base64,'))return false;
  try{
    const svg=atob(uri.slice('data:image/svg+xml;base64,'.length));
    return (svg.includes('id="disabled"')&&svg.includes('opacity="0.35"'))||
      (svg.includes('stroke="#999"')&&svg.includes('opacity="0.35"')&&svg.includes('<circle'));
  }catch{return false;}
}
function isFusionAction(item){return item?.type==='sd-plugin'&&
  item.settings?.pluginUUID===FUSION_PLUGIN&&
  typeof item.settings?.actionUUID==='string'&&item.settings.actionUUID.startsWith(FUSION_PLUGIN+'.');}
function requestFusionIcon(id){
  if(!id||fusionIconCache.has(id)||fusionCachePending.has(id)||(fusionCacheMisses.has(id)&&Date.now()-fusionCacheMisses.get(id)<5000)||!window.deckBridge?.fusionIconRead)return;
  fusionCachePending.add(id);
  window.deckBridge.fusionIconRead(id).then(png=>{
    if(typeof png==='string'){fusionIconCache.set(id,png);renderGrid();window.scheduleDeckSync?.();}
    else fusionCacheMisses.set(id,Date.now());
  }).catch(error=>console.warn('Fusion 아이콘 캐시 읽기 실패',error))
    .finally(()=>fusionCachePending.delete(id));
}
async function rememberFusionIcon(id,image){
  if(!window.deckBridge?.fusionIconWrite||typeof image!=='string')return;
  try{
    const png=image.startsWith('data:image/png;base64,')?image:await rasterizeIcon(image);
    if(await window.deckBridge.fusionIconWrite(id,png)){fusionCacheMisses.delete(id);fusionIconCache.set(id,png);}
  }catch(error){console.warn('Fusion 아이콘 캐시 저장 실패',error);}
}

const fusionActionTokens=new WeakMap();
let fusionTokenSerial=0,pageStructureEpoch=0;
function sdkContext(index,gesture='down'){
  const folder=DeckCore.activeFolder(state);
  const base=String(state.profileId)+':'+state.page+':'+(state.folderPath||[]).join('-')+
    (folder?'-p'+(folder.pageIndex||0):'')+':'+index+':'+gesture+(pageStructureEpoch?':layout'+pageStructureEpoch:'');
  const key=({'hold-left':'holdLeft','hold-right':'holdRight'})[gesture]||gesture;
  const item=index<14?DeckCore.visibleActions(state)[index]:DeckCore.controlBinding(state,index)?.[key];
  if(!isFusionAction(item))return base;
  let token=fusionActionTokens.get(item);
  if(!token){token='i'+(++fusionTokenSerial);fusionActionTokens.set(item,token);}
  return base+':'+token;
}
function clearOldSdkVisual(index,gesture='down'){
  const ctx=sdkContext(index,gesture);
  sdkVisuals.delete(ctx);fusionLiveContexts.delete(ctx);
  fusionOfflineContexts.delete(ctx);unverifiedFusionContexts.delete(ctx);
}
function pluginSlotContext(item){
  if(item?.type!=='sd-plugin')return '';
  if(state.selected>=14)return sdkContext(state.selected,({holdLeft:'hold-left',holdRight:'hold-right'})[controlGesture]||controlGesture);
  return sdkContext(state.selected,'down');
}
function sdkActionInstances(){
  const entries=[];
  const append=(item,index,gesture)=>{
    if(item?.type!=='sd-plugin')return;
    const settings=item.settings||{};
    entries.push({context:sdkContext(index,gesture),slot:index,gesture,
      pluginUUID:settings.pluginUUID,actionUUID:settings.actionUUID,
      settings:settings.pluginSettings||{}});
  };
  DeckCore.visibleActions(state).slice(0,14).forEach((item,index)=>append(item,index,'down'));
  // Side controls are navigation-only. Register only actions the knob
  // dispatcher can actually execute, including supported legacy held bindings.
  for(let index=16;index<=18;index++){
    const binding=DeckCore.controlBinding(state,index);
    for(const gesture of ['down','left','right','hold-left','hold-right'])
      append(DeckCore.activeControlAction(binding,gesture),index,gesture);
  }
  return entries;
}
let sdkSyncSerial=0;
function scheduleSdkSync(){
  if(!window.deckBridge?.sdkSync)return;
  const serial=++sdkSyncSerial;
  Promise.resolve().then(async()=>{
    if(serial!==sdkSyncSerial)return;
    await window.deckBridge.sdkSync(sdkActionInstances());
  }).catch(error=>window.d200xActionStatus?.('SDK 플러그인 등록 오류: '+String(error?.message||error)));
}
function displayItem(item,index,preserveGesture=false){
  // The physical key uses the representative gesture. Inspector previews use
  // the exact action selected in the tab, even if the representative differs.
  if(item?.pressMeta&&!preserveGesture)item=pressDisplayAction(item);
  if(item?.type==='text'&&!item.settings?.stateTitles&&item.titleStyle?.visible!==false)
    return {...item,title:textActionDisplayTitle(item,item.title)};
  if(item?.type==='multi-switch')return DeckCore.displaySwitchAction(item);

  if(item?.type==='sd-plugin'){
    // Resolve by physical slot, not object identity: the hardware renderer clones actions.
    const slot=Number.isInteger(index)?index:DeckCore.visibleActions(state).findIndex(x=>x===item);
    const visual=slot>=0?sdkVisuals.get(sdkContext(slot,'down')):null;
    const stateName=visual?.state===1?'on':'off';
    const assigned=item.settings?.sdkStateIcons?.[stateName];
    const stateIcon=assigned?.kind==='file'&&typeof assigned.value==='string'?assigned:null;
    if(item?.settings?.pluginUUID==='com.autodesk.fusionstreamdeck'&&
      item.settings?.actionUUID==='com.autodesk.fusionstreamdeck.runcommand'){
      const id=fusionCommandId(item),connected=fusionConnected.has(FUSION_PLUGIN);
      if(id)requestFusionIcon(id);
      const cached=id?fusionIconCache.get(id):null;
      // A live icon response proves that this command reached Fusion, even when
      // the SDK connection event was emitted before the renderer subscribed.
      const context=sdkContext(slot,'down');
      // Fusion's /health endpoint is authoritative. Its Stream Deck plugin
      // remains online after Fusion quits, and last-known-good art can persist.
      const offline=fusionHealthAvailable===null
        ?(fusionOfflineContexts.has(context)||(!connected&&!fusionLiveContexts.has(context)))
        :!fusionHealthAvailable;
      const runtimeImage=!offline&&visual?.image?visual.image:null;
      const icon=stateIcon||item.icon||(runtimeImage?{kind:'file',value:runtimeImage}:null)||
        (cached?{kind:'file',value:cached}:null)||
        (visual?.image?{kind:'file',value:visual.image}:null);
      const fusionVisual=typeof fusionLocalizedVisual==='function'?fusionLocalizedVisual(item,item.title||visual?.title||''):{...item,title:visual?.title??item.title};
      return {...fusionVisual,...(icon?{icon}:{}),fusionOffline:offline};
    }
    const defaultImage=sdkActionDefaults.get(item.settings?.actionUUID)?.[stateName];
    const icon=stateIcon||item.icon||(visual?.image?{kind:'file',value:visual.image}:null)||
      (defaultImage?{kind:'file',value:defaultImage}:null);
    if(icon||visual)return {...item,title:visual?.title??item.title,...(icon?{icon}:{})};
  }
  if(!item||item.type!=="indicator")return item;
  const common=DeckCore.indicatorCommon(state,item);
  return {...item,indicatorNumber:String((DeckCore.activeFolder(state)?.pageIndex??state.page)+1),
    indicatorNumberStyle:common.indicatorNumberStyle,indicatorDownNumberStyle:common.indicatorDownNumberStyle||common.indicatorNumberStyle};
}
function inspectorDisplayItem(item,index){
  return displayItem(item,index,true);
}
// Visual press policy is separate from action execution and SDK keyUp delivery.
const previewPressKeys=new Set();
// Inspector-only HA preview; never sends a key event or changes a saved entity.
const haPreviewStates=new WeakMap();
function isMomentaryIconAction(item){
  if(!item)return false;
  if(item.type==='sd-plugin')return isFusionAction(item);
  return !['ha-toggle','indicator','multi-switch','hotkey-switch','timer',
    'logic','sleep','virtual','wide-display','folder-back'].includes(item.type);
}
// A pair of state titles shares the preset library, not the individual style.
function hasStateTitlePair(item){
  return item?.type==='sd-plugin'||item?.type==='timer'||item?.type==='hotkey-switch'||isMomentaryIconAction(item);
}
// Text action labels are render-only; never copy the body into a stored title.
function textActionDisplayTitle(item,title){
  if(item?.type!=='text'||title)return title||'';
  const body=typeof item.settings?.body==='string'?item.settings.body.trim():'';
  // Bound the preview work for large pasted strings, preserving Unicode characters.
  return Array.from(body.slice(0,512)).slice(0,256).join('');
}
function defaultStateTitlePair(item){
  if(item?.type==='hotkey-switch')return {first:{enabled:true,title:item.title||'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}},second:{enabled:true,title:item.title||'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}}};
  if(item?.type==='timer')return {first:{enabled:true,title:'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}},second:{enabled:true,title:DeckCore.formatTimerTime(DeckCore.timerSeconds(item.settings?.seconds),item.settings?.seconds),style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}}};
  if(item?.type==='multi')return {first:{enabled:item.titleStyle?.visible!==false,title:item.title||'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}},second:{enabled:item.titleStyle?.visible!==false,title:'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}}};
  return {
    first:{enabled:item.titleStyle?.visible!==false,title:item.title||'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}},
    second:{enabled:false,title:item.title||'',style:{...DEFAULT_TITLE_STYLE,...item.titleStyle}}
  };
}
function ensureStateTitlePair(item){
  item.settings??={};
  if(!item.settings.stateTitles)item.settings.stateTitles=defaultStateTitlePair(item);
  return item.settings.stateTitles;
}
// Resolve every display property without changing the saved independent states.
const legacyStatePairCache=new WeakMap();
function isNamedStateIconPair(icons){
  const off=icons?.off,on=icons?.on;
  if(!off||!on||off.kind!=='file'||on.kind!=='file'||!off.packId||off.packId!==on.packId)return false;
  if(typeof off.statePair==='string'&&off.statePair&&off.statePair===on.statePair)return true;
  if(off.statePair||on.statePair)return false;
  const previous=legacyStatePairCache.get(icons);
  if(previous?.off===off&&previous?.on===on)return previous.matched===true;
  if(typeof requestLegacyStatePair==='function')requestLegacyStatePair(icons,off,on);
  return false;
}
function resolveStateTitle(item,second,artwork=null){
  const pair=item?.settings?.stateTitles;
  const choices=pair||defaultStateTitlePair(item);
  const one=choices.first,two=choices.second;
  const source=one?.enabled&&two?.enabled?(second?'second':'first'):one?.enabled?'first':two?.enabled?'second':null;
  const selected=source?choices[source]:null;
  const background=source?item?.settings?.keyBackgrounds?.[source]:null;
  const result={...item,keyBackground:background||{enabled:false,color:'#08090c'}};
  if(artwork){
    const actual=second?'second':'first';
    // Named ON/OFF pairs and uncustomized live SDK art keep their real states.
    const key=source&&!artwork.paired&&!artwork.runtimeOnly?source:actual;
    result.icon=artwork[key];
  }
  if(!pair){
    // Preserve legacy dynamic SDK titles until explicitly edited.
    if(item?.type==='text'&&item.titleStyle?.visible!==false)
      return {...result,title:textActionDisplayTitle(item,result.title)};
    return result;
  }
  return {...result,title:selected?textActionDisplayTitle(item,selected.title):'',titleStyle:{...DEFAULT_TITLE_STYLE,...(selected?.style||{}),visible:!!selected}};
}
function stateDisplayArtwork(item,index,momentary){
  const keyRoot=DeckCore.visibleActions(state)[index];
  // The displayed and actively edited gesture can differ from the stored root.
  const raw=keyRoot?.pressMeta||Object.values(keyRoot?.pressActions||{}).includes(item)
    ?item:(keyRoot||item);
  const valid=icon=>icon?.kind==='file'&&typeof icon.value==='string';
  if(raw?.type==='timer'){
    const icons=raw.settings?.sdkStateIcons||{};
    return {first:valid(icons.off)?icons.off:raw.icon,second:valid(icons.on)?icons.on:raw.icon,paired:isNamedStateIconPair(icons)};
  }
  if(momentary){
    const icons=item.settings?.keyPressIcons||{};
    const up=valid(icons.up)?icons.up:item.icon;
    return {first:up,second:valid(icons.down)?icons.down:up};
  }
  const icons=raw.settings?.sdkStateIcons||{};
  const runtime=index>=0?sdkVisuals.get(sdkContext(index,'down')):null;
  const defaults=typeof sdkActionDefaults!=='undefined'?sdkActionDefaults.get(raw.settings?.actionUUID):null;
  const fallback=(key,second)=>raw.icon||
    (runtime?.image&&(runtime.state===undefined?!second:runtime.state===(second?1:0))?{kind:'file',value:runtime.image}:null)||
    (defaults?.[key]?{kind:'file',value:defaults[key]}:null);
  return {first:valid(icons.off)?icons.off:fallback('off',false),
    second:valid(icons.on)?icons.on:fallback('on',true),
    paired:isNamedStateIconPair(icons),
    runtimeOnly:!valid(icons.off)&&!valid(icons.on)&&!raw.icon};
}
function resolveTimerVisual(item,second,remaining,artwork,configured=item.settings?.seconds){
  const pair=item.settings?.stateTitles||defaultStateTitlePair(item);
  const prepared={...item,settings:{...item.settings,stateTitles:pair}};
  const visual=resolveStateTitle(prepared,second,artwork);
  return {...visual,title:second&&visual.titleStyle?.visible!==false?DeckCore.formatTimerTime(remaining,configured):'',keyPressAlternate:true};
}
function multiProgressTitle(item,progress){
  const total=progress?.total??DeckCore.multiRows(item).rows.length;
  return (progress?.gate?.paused?'Ⅱ ':'')+(progress?.step??(total?1:0))+'/'+total;
}
function resolveMultiVisual(item,second,artwork,progress){
  const pair=item.settings?.stateTitles||defaultStateTitlePair(item);
  const prepared={...item,settings:{...item.settings,stateTitles:pair}};
  const visual=resolveStateTitle(prepared,second,artwork);
  const title=second?multiProgressTitle(item,progress):pair.first?.enabled?pair.first.title:'';
  return {...visual,title:visual.titleStyle?.visible!==false?title:'',keyPressAlternate:true};
}
function indicatorPressVisual(item,pressed){
  const icons=item.settings?.keyPressIcons||{},backgrounds=item.settings?.keyBackgrounds||{};
  const up=icons.up||item.icon,down=icons.down||up;
  const first=backgrounds.default||{enabled:false,color:'#08090c'},second=backgrounds.second||first;
  const background=entry=>entry?.enabled===true?entry.color:'#08090c';
  const downTitle=item.settings?.indicatorDownTitle??item.title;
  const downTitleStyle=item.settings?.indicatorDownTitleStyle||item.titleStyle;
  const downNumberStyle=item.indicatorDownNumberStyle||item.indicatorNumberStyle;
  const distinct=JSON.stringify([up||null,background(first),item.title,item.titleStyle,item.indicatorNumberStyle])!==
    JSON.stringify([down||null,background(second),downTitle,downTitleStyle,downNumberStyle]);
  return {...item,title:pressed?downTitle:item.title,titleStyle:pressed?downTitleStyle:item.titleStyle,
    indicatorNumberStyle:pressed?downNumberStyle:item.indicatorNumberStyle,
    icon:pressed?down:up,keyBackground:pressed?second:first,keyPressAlternate:distinct};
}
function displayKeyPressItem(item,index){
  const inspectorPreview=arguments[2]===true;
  if(item?.type==='indicator'&&Number.isInteger(index)&&index>=0&&index<13)return indicatorPressVisual(item,previewPressKeys.has(index)||window.D200XPhysicalKeyPressed?.(index)===true);
  if(item?.type==='timer'&&Number.isInteger(index)&&index>=0&&index<13){
    const runtime=activeActionTimers.get(DeckCore.runtimeActionKey(state,index,'down'));
    return resolveTimerVisual(item,!!runtime,runtime?Math.max(0,Math.ceil((runtime.deadline-Date.now())/1000)):DeckCore.timerSeconds(item.settings?.seconds),stateDisplayArtwork(item,index,false),runtime?.seconds??item.settings?.seconds);
  }
  if(item?.type==='hotkey-switch'&&Number.isInteger(index)&&index>=0&&index<13){
    const second=(hotkeySwitchPositions.get(hotkeySwitchRuntimeKey(index,item))||0)===1;
    return resolveStateTitle(item,second,stateDisplayArtwork(item,index,false));
  }
  if(!isMomentaryIconAction(item)||!Number.isInteger(index)||index<0||index>=13){
    if(item?.type==='sd-plugin'){
      const raw=DeckCore.visibleActions(state)[index];
      const selected=inspectorPreview&&raw&&haPreviewStates.get(raw);
      const runtime=index>=0?sdkVisuals.get(sdkContext(index,'down')):null;
      const second=selected?selected==='on':runtime?.state===1;
      return resolveStateTitle(item,second,stateDisplayArtwork(item,index,false));
    }
    return item;
  }
  const artwork=stateDisplayArtwork(item,index,true);
  const up=resolveStateTitle(item,false,artwork),down=resolveStateTitle(item,true,artwork);
  const bg=entry=>entry?.enabled===true&&/^#[0-9a-fA-F]{6}$/.test(entry.color)?entry.color.toLowerCase():'#08090c';
  const signature=visual=>JSON.stringify([visual.icon?.kind,visual.icon?.value,visual.icon?.glyph,bg(visual.keyBackground),visual.title,visual.titleStyle]);
  const same=signature(up)===signature(down);
  if(item.type==='multi'){
    const progress=runningMultiProgress.get(DeckCore.runtimeActionKey(state,index,'down'));
    return resolveMultiVisual(item,!!progress,artwork,progress);
  }
  const pressed=previewPressKeys.has(index)||window.D200XPhysicalKeyPressed?.(index)===true;
  return {...(pressed?down:up),keyPressAlternate:!same};
}
window.D200XIconMode={eligible:isMomentaryIconAction};
// Share actual key visuals (including timer countdown) with the USB renderer.
window.getD200XDisplayItem=(item,index)=>index===13&&wideDisplayAvailable()?wideVisual():displayKeyPressItem(displayItem(DeckCore.visibleActions(state)[index]||item,index),index);
function iconNode(item,defaultGlyph){
  if(item?.icon?.kind==="file"&&typeof item.icon.value==="string"){
    const image=document.createElement("img");image.className="icon-image";image.src=item.icon.value;image.alt="";return image;
  }
  if(item?.type==='indicator'&&item.indicatorNumber!==undefined&&!item.icon){
    const number=document.createElement('span');number.className='icon-glyph';number.textContent=item.indicatorNumber;return number;
  }
  if(!item?.icon?.glyph && window.D200XPanelIcons?.keyArtwork?.(item?.type)){
    const image=document.createElement("img");image.className="icon-image";
    image.src=window.D200XPanelIcons.keyArtwork(item.type);image.alt="";return image;
  }
  const symbol=document.createElement("span");symbol.className="icon-glyph";
  symbol.textContent=item?.icon?.glyph||defaultGlyph;return symbol;
}
function updateTitleAppearance(label,item){
  const style=item?.titleStyle;if(!style)return;
  label.hidden=style.visible===false;
  label.style.textAlign="center";
  label.style.fontFamily=style.family==="default"?"":style.family;
  label.style.fontSize=(Number(style.size)||12)+"px";
  label.style.fontWeight=style.bold?"700":"400";
  label.style.fontStyle=style.italic?"italic":"normal";
  label.style.textDecoration=style.underline?"underline":"none";
  label.style.color=style.color||"#ffffff";
}
function isAssignableAction(id){return (ACTIONS.has(id)&&id!=='virtual')||String(id).startsWith('sd::');}
function newAction(id){
  if(!String(id).startsWith('sd::'))return DeckCore.createAction(id);
  const parts=String(id).split('::');
  if(parts.length!==3)return null;
  const item=DeckCore.createAction('sd-plugin');
  item.settings.pluginUUID=parts[1];item.settings.actionUUID=parts[2];
  item.settings.actionName=sdkActionNames.get(parts[2])||parts[2];
  return item;
}
function currentPage(){return DeckCore.currentActions(state);}
function reservedWideSlot(index){return index===13;}
function sideDropConfig(id,item=null){
  if(id==='folder')return {navigation:'folder-target',rootPage:-1,route:[]};
  if(!['previous','next','goto','profile','side-nav'].includes(id))return null;
  return DeckCore.sideConfig(item||newAction(id));
}
function assignSideControl(index,gesture,config,draft=false){
  const binding=DeckCore.controlBinding(state,index);
  if(!binding||!['down','hold'].includes(gesture))return false;
  if(gesture==='down'){
    clearOldSdkVisual(index);
    binding.down=DeckCore.makeSideAction(config);
  }else binding.sideHold=config.navigation==='none'?null:DeckCore.makeSideAction(config);
  if(draft){persistInspectorChange();renderPhysicalControls();renderControlInspector();}
  else {state.selected=index;controlGesture='down';persist();render();}
  return true;
}
function setItem(index,item){
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>setItem(index,item));return;}
  if(reservedWideSlot(index)){
    window.d200xActionStatus?.('가로 화면은 표시 모드 전용입니다. 일반 액션을 등록할 수 없습니다.');
    state.selected=index;render();return;
  }
  if(index===14||index===15){
    const config=item?sideDropConfig(item.type,item):{navigation:'none'};
    if(!config){window.d200xActionStatus?.('측면 단추에는 페이지·프로필·덱폴더 이동만 등록할 수 있습니다.');return;}
    assignSideControl(index,'down',config);return;
  }
  if(index>=14){
    const binding=DeckCore.controlBinding(state,index);
    if(index>=16&&((knobTab==='held'&&!binding.heldEnabled)||(controlGesture==='down'&&binding.heldEnabled)||((knobTab==='held'?binding.heldMode:binding.mode)==='stack')))return;
    if(binding.mode!=='trigger'&&!(index>=16&&(
      controlGesture==='holdLeft'||controlGesture==='holdRight'||
      (controlGesture==='down'&&binding.mode==='adjust'))))binding.mode='trigger';
    clearOldSdkVisual(index,({'holdLeft':'hold-left','holdRight':'hold-right'})[controlGesture]||controlGesture);
    DeckCore.assignControlAction(binding,controlGesture,item);
  }else {clearOldSdkVisual(index);if(item?.type==='indicator'&&!state.indicatorCommon)DeckCore.updateIndicatorCommon(state,item,{});currentPage()[index]=item;}
  state.selected=index;persist();render();
}
function removeSlotAction(index){
  if(reservedWideSlot(index))return false;
  if(index<14&&!currentPage()[index]&&state.pinned?.[index]){
    if(!confirm('고정 액션을 모든 페이지에서 해제하시겠습니까?'))return false;
    clearOldSdkVisual(index);
    if(DeckCore.togglePinned(state,index)){persist();render();return true;}
    return false;
  }
  if(!currentPage()?.[index])return false;
  if(!confirm('이 동작을 삭제하시겠습니까?'))return false;
  setItem(index,null);
  return true;
}
function removeControlAction(index,gesture='down'){
  if(index===14||index===15){
    if(!confirm('이 입력에 할당된 액션을 삭제하시겠습니까?'))return false;
    return assignSideControl(index,gesture,{navigation:'none'});
  }
  const binding=DeckCore.controlBinding(state,index);
  if(!binding||!binding[gesture])return false;
  if(!confirm('이 입력에 할당된 액션을 삭제하시겠습니까?'))return false;
  clearOldSdkVisual(index,({'holdLeft':'hold-left','holdRight':'hold-right'})[gesture]||gesture);
  DeckCore.assignControlAction(binding,gesture,null);
  state.selected=index;controlGesture=gesture;
  persist();render();
  return true;
}
function showControlMenu(index,x,y){
  const menu=$('key-menu');menu.replaceChildren();
  const binding=DeckCore.controlBinding(state,index);
  const item=binding?.down;
  const option=document.createElement('button');
  option.type='button';option.role='menuitem';
  option.textContent='누르기 액션 삭제';
  option.disabled=index<16?DeckCore.sideActionConfig(binding,index).navigation==='none':!item;
  option.addEventListener('click',()=>{
    menu.hidden=true;
    removeControlAction(index,'down');
  });
  menu.append(option);
  if(index<16){
    const held=document.createElement('button');held.type='button';held.role='menuitem';
    held.textContent='길게 누르기 액션 삭제';held.disabled=DeckCore.sideActionConfig(binding,index,'hold').navigation==='none';
    held.addEventListener('click',()=>{menu.hidden=true;removeControlAction(index,'hold');});menu.append(held);
  }
  menu.style.left=Math.max(0,Math.min(x,window.innerWidth-230))+'px';
  menu.style.top=Math.max(0,Math.min(y,window.innerHeight-150))+'px';
  menu.hidden=false;
}
function choose(index){
  if(state.selected===index){
    return; // Re-selecting the same key must not switch the gesture being edited.
  }
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>choose(index));return;}
  if(state.selected!==index){controlGesture='down';knobTab='normal';}
  activePressTab='single';state.selected=index;persist();render();
}
function controlDrop(index,id,gesture='down',direct=true){
  if(!isAssignableAction(id))return;
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>controlDrop(index,id,gesture,direct));return;}
  const binding=DeckCore.controlBinding(state,index);
  if(!binding)return;
  if(index===14||index===15){
    const config=sideDropConfig(id);
    if(!config){window.d200xActionStatus?.('측면 단추에는 페이지·프로필·덱폴더 이동만 등록할 수 있습니다.');return;}
    assignSideControl(index,gesture==='hold'?'hold':'down',config);return;
  }
  if(index>=16&&!direct&&((knobTab==='held'&&!binding.heldEnabled)||(gesture==='down'&&binding.heldEnabled)||((knobTab==='held'?binding.heldMode:binding.mode)==='stack')))return;
  clearOldSdkVisual(index,({'holdLeft':'hold-left','holdRight':'hold-right'})[gesture]||gesture);
  if(index>=16&&direct&&gesture==='down'&&['system-volume','system-scroll','edit-history','window-switch','desktop-switch','device-brightness','system-zoom'].includes(id)){
    // Rotation runs the shared adjustment planner; preserve the press assignment.
    DeckCore.automaticControl(binding);binding.target=({
      'system-volume':'volume','system-scroll':'scroll','edit-history':'history',
      'window-switch':'window','desktop-switch':'desktop',
      'device-brightness':'brightness','system-zoom':'zoom'
    })[id];
  }else if(index>=16&&direct&&gesture==='down'&&['previous','next'].includes(id)){
    // Dropping a navigation action directly on the knob preserves the
    // familiar bidirectional rotation behavior; per-gesture tiles remain
    // available for independent left/right assignments.
    DeckCore.automaticControl(binding);
    binding.target='page';
    binding.down=newAction(id);
  }else{
    // A knob press action can coexist with rotate-to-adjust (volume/page/zoom).
    if(binding.mode!=='trigger' && !(index>=16&&(
      gesture==='holdLeft'||gesture==='holdRight'||
      (gesture==='down'&&binding.mode==='adjust'))))
      {binding.mode='trigger';binding.autoAssign=true;}
    DeckCore.assignControlAction(binding,gesture,newAction(id));
  }
  state.selected=index;controlGesture=gesture;
  persist();render();
}
const WIDE_LABELS={clock:'아날로그 + 디지털 시계',datetime:'날짜 · 시간 · 요일',stats:'CPU · RAM · GPU',knobs:'노브 정보'};
function wideDisplayAvailable(){
  // The physical wide screen is reserved on root pages. Previously stored
  // actions remain in saved profile data but are not displayed or executed.
  return !state.folderPath?.length;
}
function wideVisual(){
  return {type:'wide-display',title:WIDE_LABELS[state.wideDisplay?.current]||WIDE_LABELS.clock};
}
// Runtime-only alert. Never write it into a profile, wide mode, or slot.
function wideUnsavedWarningActive(){return document.querySelector('#inspector-unsaved-dialog')?.open===true;}
function wideUnsavedVisual(){return {type:'wide-display',title:'저장하지 않은 변경 사항',wideNotice:true};}
window.D200XUnsavedWarning=wideUnsavedWarningActive;
function refreshWideUnsavedWarning(){
  renderGrid();
  window.scheduleD200XWarningSync?.();
}
function revealWideUnsavedWarning(){
  window.deckBridge?.revealUnsavedEditor?.().then(focused=>{
    if(!focused)window.d200xActionStatus?.('DeckForge 확인창을 작업 표시줄에서 확인하세요.');
  }).catch(error=>window.d200xActionStatus?.('확인창 표시 실패: '+String(error?.message||error)));
}
window.D200XWideModeName=()=>wideDisplayAvailable()?state.wideDisplay?.current:null;
const KNOB_TARGET_LABELS={page:'페이지 이동',profile:'프로필 전환',volume:'Windows 음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'};
function wideKnobLabels(binding,position){
  const active=binding?.mode==='stack'
    ?binding.stack?.[position%binding.stack.length]
    :binding?.target;
  const describe=action=>action.title?.trim()||ACTIONS.get(action.type)?.label||action.type;
  const unique=labels=>[...new Set(labels.filter(Boolean))].join(' / ');
  const normal=['left','right','down'].map(key=>DeckCore.activeControlAction(binding,key)).filter(Boolean);
  const title=binding?.mode==='adjust'||binding?.mode==='stack'||binding?.autoAssign
    ?KNOB_TARGET_LABELS[active]||'조절'
    :unique(normal.map(describe))||'미설정';
  let held=[];
  if(binding?.heldEnabled&&binding.heldMode==='stack'){
    const stack=binding.heldStack||[];
    if(stack.length)held.push(KNOB_TARGET_LABELS[stack[position%stack.length]]);
  }else{
    for(const gesture of ['holdLeft','holdRight']){
      const action=DeckCore.activeControlAction(binding,gesture);
      if(action)held.push(describe(action));
      else if(binding?.heldEnabled&&binding.heldAutoAssign)held.push(KNOB_TARGET_LABELS[binding.heldTarget]);
    }
  }
  return {title,detail:unique(held)};
}
window.D200XKnobInfo=()=>[16,17,18].map((index,i)=>({
  name:'노브 '+(i+1),...wideKnobLabels(DeckCore.controlBinding(state,index),stackPositions[i])
}));
window.renderGridWideClock=()=>{if(wideDisplayAvailable())renderGrid();};
window.getD200XWideMode=()=>wideDisplayAvailable()
  ?(state.wideDisplay?.current==='clock'?'clock':state.wideDisplay?.current==='stats'?'stats':'blank'):'blank';
function renderWideInspector(){
  const root=$('inspector');
  root.replaceChildren();root.className='inspector';
  const title=document.createElement('div');title.className='action-head';
  const strong=document.createElement('strong');strong.textContent='가로 화면 표시 설정';
  title.append(strong);root.append(title);
  const instructions=document.createElement('p');instructions.className='hint';
  instructions.textContent='체크한 화면만 버튼을 누를 때마다 순환합니다. 항목을 끌어서 순서를 변경하세요.';
  root.append(instructions);
  const list=document.createElement('div');list.className='wide-mode-list';
  const cfg=state.wideDisplay=DeckCore.cleanWideDisplay(state.wideDisplay);
  let moving=null;
  for(const id of cfg.order){
    const row=document.createElement('div');row.className='wide-mode-row';
    row.draggable=false;row.dataset.mode=id;
    const handle=document.createElement('span');handle.textContent='☰';handle.className='wide-mode-handle';handle.draggable=true;handle.setAttribute('aria-label','순서 끌기');
    const input=document.createElement('input');input.type='checkbox';input.checked=cfg.enabled.includes(id);
    input.setAttribute('aria-label',WIDE_LABELS[id]+' 표시');
    input.addEventListener('change',()=>{
      if(!input.checked&&cfg.enabled.length===1){input.checked=true;return;}
      cfg.enabled=input.checked?Array.from(new Set([...cfg.enabled,id])):cfg.enabled.filter(v=>v!==id);
      if(!cfg.enabled.includes(cfg.current))cfg.current=cfg.order.find(v=>cfg.enabled.includes(v));
      persist();render();
    });
    const text=document.createElement('span');text.textContent=WIDE_LABELS[id];
    const current=document.createElement('small');current.textContent=cfg.current===id?'현재 표시':'';
    row.append(handle,input,text,current);
    handle.addEventListener('dragstart',event=>{moving=id;event.dataTransfer?.setData('text/plain',id);});
    row.addEventListener('dragover',event=>{event.preventDefault();});
    row.addEventListener('drop',event=>{
      event.preventDefault();const source=moving;if(!source||source===id)return;
      const order=cfg.order.filter(v=>v!==source);
      order.splice(order.indexOf(id),0,source);
      cfg.order=order;moving=null;persist();renderWideInspector();
    });
    handle.addEventListener('dragend',()=>{moving=null;});
    list.append(row);
  }
  root.append(list);
  const notice=document.createElement('p');notice.className='hint';
  notice.textContent='노브 정보는 기본 해제입니다. 선택하면 현재 프로필의 노브 1~3 설정을 표시합니다.';
  root.append(notice);
  const advance=document.createElement('button');advance.type='button';
  advance.className='wide-mode-reset';advance.textContent='다음 화면 표시 ▶';
  advance.addEventListener('click',()=>{advanceWideDisplay();});
  root.append(advance);
  const reset=document.createElement('button');reset.type='button';
  reset.className='wide-mode-reset';reset.textContent='기본 순서로 복원 (시계 → 날짜·시간·요일 → CPU·RAM·GPU)';
  reset.addEventListener('click',()=>{state.wideDisplay=DeckCore.cleanWideDisplay(null);persist();render();});
  root.append(reset);
  appendInspectorSaveBar(root);
}
function importFusionDraggedCommand(event,index){
  if(inspectorSession?.dirty){window.d200xActionStatus?.('속성 편집을 저장하거나 취소한 후 드래그하세요.');return true;}
 const drag=window.DeckForgeFusionDrag;
 const cmd=drag?.decode(event.dataTransfer?.getData('text/plain')||'');
 if(!cmd)return false;
 if(index===13||reservedWideSlot(index)){
   window.d200xActionStatus?.('와이드 정보 화면에는 Fusion 명령을 등록할 수 없습니다.');
   return true;
 }
 if(!sdkPlugins.some(plugin=>plugin.uuid===drag.PLUGIN)){
   window.d200xActionStatus?.('Autodesk FusionStreamDeck 플러그인을 먼저 설치해야 합니다.');
   return true;
 }
 const existing=currentPage()[index];
 if(existing&&!confirm('버튼 '+(index+1)+'에 등록된 동작을 '+cmd.name+'(으)로 교체할까요?'))return true;
 const action=DeckCore.createAction('sd-plugin');
 action.title=cmd.name.slice(0,30);
 action.settings.pluginUUID=drag.PLUGIN;
 action.settings.actionUUID=drag.ACTION;
 action.settings.actionName='Fusion 명령 실행';
 action.settings.pluginSettings={commandId:cmd.id,name:cmd.name};
 const art=cmd.png||cmd.svg;
  if(art){fusionIconCache.set(cmd.id,art);fusionCacheMisses.delete(cmd.id);void rememberFusionIcon(cmd.id,art);}
 setItem(index,action);
 window.d200xActionStatus?.('Fusion 명령 등록: '+cmd.name+' ('+cmd.id+')');
 return true;
}
let nativeGridDrag=null,nativeGridSequence=0,nativeGridBusy=false;
function externalGridDrop(ev){
  const types=Array.from(ev.dataTransfer?.types||[]);
  return types.includes('Files')&&!types.includes('application/x-d200x-action');
}
function captureNativeGrid(){
  const page=currentPage();
  return {state,page,previous:page.slice(),visible:DeckCore.visibleActions(state).slice()};
}
function nativeSlotUnchanged(snapshot,index){
  return state===snapshot.state&&currentPage()===snapshot.page&&
    snapshot.page[index]===snapshot.previous[index]&&DeckCore.visibleActions(state)[index]===snapshot.visible[index];
}
function clearNativeGridDrag(session,cancel=false){
  if(nativeGridDrag!==session)return;
  nativeGridDrag=null;
  if(cancel)window.deckBridge?.nativeDropCancel?.(session.id);
  document.querySelectorAll('#key-grid .drag-over').forEach(node=>node.classList.remove('drag-over'));
}
function armNativeGrid(ev){
  if(!externalGridDrop(ev)||nativeGridDrag||nativeGridBusy||inspectorSession?.dirty||!window.deckBridge?.nativeDropStart)return;
  if(document.querySelector('dialog[open]')||!$('icon-library').hidden||!$('icon-maker').hidden)return;
  const rects=Array.from($('key-grid').querySelectorAll('.deck-key')).filter(node=>Number(node.dataset.index)<13).map(node=>{
    const r=node.getBoundingClientRect();return {index:Number(node.dataset.index),x:r.x,y:r.y,width:r.width,height:r.height};
  });
  const session={id:Date.now().toString(36)+'-'+(++nativeGridSequence),snapshot:captureNativeGrid(),armed:false};
  nativeGridDrag=session;
  void window.deckBridge.nativeDropStart(session.id,rects).then(armed=>{
    if(nativeGridDrag!==session){if(armed)window.deckBridge.nativeDropCancel(session.id);return;}
    session.armed=armed;
  }).catch(()=>{session.armed=false;});
}
function finishExternalGridDrop(index){
  const session=nativeGridDrag;
  const snapshot=session?.snapshot||captureNativeGrid();
  if(session)clearNativeGridDrag(session,true);
  if(inspectorSession?.dirty){window.d200xActionStatus?.('속성 편집을 저장하거나 취소한 후 드래그하세요.');return;}
  void registerDroppedApplication(index,null,false,snapshot);
}
window.deckBridge?.onNativeDrop?.(message=>{
  const session=nativeGridDrag;
  if(!session||message.id!==session.id)return;
  if(message.type==='entered'){session.armed=true;return;}
  clearNativeGridDrag(session);
  if(message.type!=='result')return;
  const result=message.result;
  const candidate=result?.candidate;
  if(!Number.isInteger(result?.index)||result.index<0||result.index>=13)return;
  void registerDroppedApplication(result.index,candidate?.value||null,candidate?.kind==='appid',session.snapshot);
});
let pressDropOverlay=null;
function hidePressDropOverlay(){
  pressDropOverlay?.node.remove();pressDropOverlay=null;
}
function showPressDropOverlay(index,key){
  if(pressDropOverlay?.index===index&&pressDropOverlay.node.isConnected)return;
  hidePressDropOverlay();
  const root=DeckCore.visibleActions(state)[index];
  if(root&&!pressIsOrdinary(root))return;
  const card=document.createElement('div');card.className='press-drop-picker';
  card.setAttribute('aria-label','누르기 동작 배치');
  for(const [slot,label,number] of PRESS_TABS){
    const target=pressSlotAction(root,slot);
    const zone=document.createElement('div');zone.className='press-drop-choice';
    const art=document.createElement('div');art.className='press-drop-art';
    art.append(iconNode(pressTabArtwork(target,index),ACTIONS.get(target?.type)?.icon||'+'));
    const numberTag=document.createElement('span');numberTag.className='press-drop-number';
    numberTag.textContent=number;art.append(numberTag);
    const title=document.createElement('strong');title.textContent=label;
    const action=document.createElement('span');action.textContent=target?(ACTIONS.get(target.type)?.label||target.type):'미등록';
    zone.append(art,title,action);
    if(target&&!pressEnabled(root,slot))zone.classList.add('disabled-action');
    zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop',ev=>{
      ev.preventDefault();ev.stopPropagation();
      const id=ev.dataTransfer?.getData('application/x-d200x-action');
      hidePressDropOverlay();
      if(isAssignableAction(id))setPressSlot(index,slot,newAction(id),true);
    });
    card.append(zone);
  }
  document.body.append(card);
  const rect=key.getBoundingClientRect();
  const width=card.offsetWidth,height=card.offsetHeight;
  card.style.left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2))+'px';
  card.style.top=Math.max(8,Math.min(window.innerHeight-height-8,rect.bottom+6))+'px';
  pressDropOverlay={index,node:card};
}
document.addEventListener('dragend',hidePressDropOverlay,true);
document.addEventListener('drop',()=>setTimeout(hidePressDropOverlay,0),true);
function appendKeyPressNumber(button,root){
  // Editor-only badge for the action whose image is displayed on this key.
  // The actual device PNG remains pixel-for-pixel unchanged.
  if(!pressIsOrdinary(root))return;
  const displayed=pressDisplayAction(root);
  if(!displayed||displayed.type==='press-empty')return;
  const match=PRESS_TABS.find(([slot])=>pressSlotAction(root,slot)===displayed);
  const number=match?.[2]||'1';
  const badge=document.createElement('span');
  badge.className='deck-key-press-number';badge.textContent=number;
  badge.title=number+'번 누르기의 대표 이미지';badge.setAttribute('aria-hidden','true');
  button.append(badge);
}
function renderGrid(){
  if(nativeGridDrag&&(state!==nativeGridDrag.snapshot.state||currentPage()!==nativeGridDrag.snapshot.page))clearNativeGridDrag(nativeGridDrag,true);
  const grid=$("key-grid");hideReplacedTooltip(grid);grid.replaceChildren();
  DeckCore.visibleActions(state).slice(0,KEY_COUNT).forEach((raw,i)=>{
    const folderBack=state.folderPath?.length>0&&i===13&&!raw;
    const item=i===13&&wideUnsavedWarningActive()?wideUnsavedVisual():folderBack?{type:'folder-back',title:'뒤로',icon:{kind:'glyph',glyph:'↩'}}:(i===13&&wideDisplayAvailable()?wideVisual():raw);
    const b=document.createElement("button");b.type="button";b.className="deck-key"+(i===13?" wide":"")+(state.selected===i?" selected":"");
    b.dataset.index=i;b.setAttribute("aria-label",`키 ${i+1}: ${keyName(item)||"비어 있음"}`);
    const pin=!state.folderPath?.length&&i<13?state.pinned?.[i]:null;
    if(pin)b.classList.add(currentPage()[i]?'pin-shadowed':'pin-shared');
    if(item)setDeckForgeTooltip(b,()=>({title:keyName(item)||item.type,lines:[shortActionDescription(item),...(pin?[currentPage()[i]?'페이지별 액션 우선 적용 · 고정 액션: '+keyName(pin):'모든 페이지의 고정 액션']:[])]}));
    const visual=displayKeyPressItem(displayItem(item,i),i);
    const glyph=iconNode(visual,ACTIONS.get(item?.type)?.icon||"+");glyph.classList.add("glyph");
    const label=document.createElement("span");label.className="caption";label.textContent=String(visual?.title||"").replace(/<br\s*\/?>/gi,"\n");updateTitleAppearance(label,visual);
    b.append(glyph,label);appendKeyPressNumber(b,item);
    // Render the actual D200X PNG as the editor key surface. Icon and title
    // must stay in fixed coordinates, independent of the title font size.
    if(item&&window.renderDeckKeyImage){
      window.renderDeckKeyImage(visual,i).then(png=>{
        if(!b.isConnected||(item.type!=='wide-display'&&DeckCore.visibleActions(state)[i]!==item))return;
        const preview=document.createElement("img");
        preview.className="rendered-key-image";
        preview.alt="";
        preview.src="data:image/png;base64,"+png;
        b.replaceChildren(preview);appendKeyPressNumber(b,item);
      }).catch(error=>console.warn("버튼 이미지 미리보기 실패",error));
    }
    b.addEventListener("click",()=>{
      if(folderBack){
        if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>{DeckCore.exitFolder(state);persist();render();});return;}
        DeckCore.exitFolder(state);persist();render();
      }else if(i===13&&wideDisplayAvailable()){
        if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>{state.selected=i;advanceWideDisplay();});return;}
        state.selected=i;advanceWideDisplay();
      }else choose(i);
    });
    b.addEventListener("contextmenu",ev=>{
      ev.preventDefault();
      const open=()=>{choose(i);showMenu(i,ev.clientX,ev.clientY);};
      if(inspectorSession?.dirty&&state.selected!==i)showInspectorLeaveDialog(open);
      else open();
    });
    const allowGridDrop=ev=>{
      if(reservedWideSlot(i))return;
      ev.preventDefault();b.classList.add("drag-over");
      if(Array.from(ev.dataTransfer?.types||[]).includes('application/x-d200x-action'))showPressDropOverlay(i,b);
      const d=ev.dataTransfer;
      if(d&&Array.from(d.types).includes('Files')&&['link','linkMove'].includes(d.effectAllowed))d.dropEffect='link';
      armNativeGrid(ev);
    };
    b.addEventListener("dragenter",allowGridDrop);
    b.addEventListener("dragover",allowGridDrop);
    b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
    b.addEventListener("drop",ev=>{
      if(reservedWideSlot(i))return;
      ev.preventDefault();b.classList.remove("drag-over");
      if(importFusionDraggedCommand(ev,i))return;
      if(Array.from(ev.dataTransfer?.types||[]).includes('Files')||ev.dataTransfer?.files?.length){finishExternalGridDrop(i);return;}
      const id=ev.dataTransfer.getData("application/x-d200x-action");
      if(isAssignableAction(id))setPressSlot(i,'single',newAction(id),true);
      hidePressDropOverlay();
    });
    grid.append(b);
  });
  renderPhysicalControls();
  const folder=DeckCore.activeFolder(state);
  $("page-label").textContent=folder
    ?`폴더 ${state.folderPath.length}단계 · 페이지 ${(folder.pageIndex||0)+1} / ${DeckCore.folderPageCount(state)}`
    :`페이지 ${state.page+1} / ${state.pages.length}`;
  $("delete-page").disabled=folder?DeckCore.folderPageCount(state)<=1:state.pages.length<=1;
}
// One compact, text-only tooltip for the canvas and action catalogue.
const deckForgeTooltipData=new WeakMap();
let deckForgeTooltipNode=null,deckForgeTooltipAnchor=null,deckForgeTooltipTimer=null;
function setDeckForgeTooltip(element,getContent){
  element.removeAttribute('title');
  element.dataset.deckforgeTooltip='';
  deckForgeTooltipData.set(element,getContent);
}
function hideDeckForgeTooltip(){
  clearTimeout(deckForgeTooltipTimer);deckForgeTooltipTimer=null;
  deckForgeTooltipAnchor=null;
  if(deckForgeTooltipNode)deckForgeTooltipNode.hidden=true;
}
function showDeckForgeTooltip(anchor){
  if(deckForgeTooltipAnchor!==anchor||!anchor.isConnected)return;
  const content=deckForgeTooltipData.get(anchor)?.();
  if(!content?.title||!content.lines?.length)return;
  if(!deckForgeTooltipNode){
    deckForgeTooltipNode=document.createElement('div');
    deckForgeTooltipNode.className='deckforge-tooltip';deckForgeTooltipNode.setAttribute('role','tooltip');
    document.body.append(deckForgeTooltipNode);
  }
  const heading=document.createElement('div');heading.className='deckforge-tooltip-title';heading.textContent=content.title;
  const body=document.createElement('div');body.className='deckforge-tooltip-body';
  for(const line of content.lines){
    const row=document.createElement('div');row.textContent=line;body.append(row);
  }
  const tip=deckForgeTooltipNode;
  tip.replaceChildren(heading,body);tip.hidden=false;
  const rect=anchor.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
  const left=Math.max(8,Math.min(rect.left+(rect.width-w)/2,window.innerWidth-w-8));
  const top=rect.bottom+h+14<=window.innerHeight?rect.bottom+6:rect.top-h-6;
  tip.style.left=left+'px';tip.style.top=Math.max(8,Math.min(top,window.innerHeight-h-8))+'px';
}
document.addEventListener('pointerover',event=>{
  const target=event.target;
  const anchor=target.closest?.('[data-deckforge-tooltip]');
  const native=target.closest?.('[title]');
  if(!anchor||(native&&anchor.contains(native)&&native!==anchor)){
    if(deckForgeTooltipAnchor)hideDeckForgeTooltip();
    return;
  }
  if(anchor===deckForgeTooltipAnchor)return;
  hideDeckForgeTooltip();deckForgeTooltipAnchor=anchor;
  deckForgeTooltipTimer=setTimeout(()=>showDeckForgeTooltip(anchor),550);
});
document.addEventListener('pointerout',event=>{
  if(deckForgeTooltipAnchor&&!deckForgeTooltipAnchor.contains(event.relatedTarget instanceof Node?event.relatedTarget:null))hideDeckForgeTooltip();
});
for(const type of ['pointerdown','dragstart','scroll','contextmenu'])document.addEventListener(type,hideDeckForgeTooltip,true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideDeckForgeTooltip();},true);
window.addEventListener('blur',hideDeckForgeTooltip);
window.addEventListener('resize',hideDeckForgeTooltip);
function hideReplacedTooltip(root){
  if(deckForgeTooltipAnchor&&root.contains(deckForgeTooltipAnchor))hideDeckForgeTooltip();
}
function shortSideDescription(config){
  const nav=config.navigation;
  switch(nav){
    case 'first':return '현재 덱의 첫 페이지로 이동';
    case 'previous':return '현재 덱의 이전 페이지로 이동';
    case 'next':return '현재 덱의 다음 페이지로 이동';
    case 'last':return '현재 덱의 마지막 페이지로 이동';
    case 'goto':return Number.isInteger(config.page)&&config.page>=0?'지정한 '+(config.page+1)+'번 페이지로 이동':'지정한 페이지로 이동';
    case 'profile-previous':return '이전 프로필로 전환';
    case 'profile-next':return '다음 프로필로 전환';
    case 'profile-select':return '선택한 프로필로 전환';
    case 'folder-target':return '지정한 덱폴더로 이동';
    case 'folder-back':return '한 단계 위의 폴더로 이동';
    case 'folder-root':return '모든 폴더를 나와 현재 루트 페이지로 이동';
    case 'home':return '현재 프로필의 최상위 첫 페이지로 복귀';
    default:return '동작 없음';
  }
}
function shortActionDescription(action){
  if(!action)return '동작 없음';
  if(!action.settings&&PANEL_ACTION_HELP[action.type])return PANEL_ACTION_HELP[action.type].split('. ')[0].replace(/\.$/,'');
  const s=action.settings||{};
  switch(action.type){
    case 'side-nav':return shortSideDescription(DeckCore.sideConfig(action));
    case 'open-app':return '지정한 프로그램 열기'+(s.foreground!==false?' 또는 기존 창 활성화':'');
    case 'close':return s.force?'지정한 프로그램 강제 종료':'지정한 프로그램 일반 종료';
    case 'previous':return '현재 덱의 이전 페이지로 이동';
    case 'next':return '현재 덱의 다음 페이지로 이동';
    case 'goto':return '지정한 페이지로 이동';
    case 'folder-back':return '한 단계 위의 폴더로 이동';
    case 'folder':return '덱폴더 안으로 이동';
    case 'profile':return s.profile==='next'?'다음 프로필로 전환':s.profile==='previous'?'이전 프로필로 전환':'지정한 프로필로 전환';
    case 'hotkey':return s.keys?'단축키 '+String(s.keys).slice(0,36)+' 입력':'설정한 단축키 입력';
    case 'system-volume':return s.direction==='down'?'윈도우 음량 낮추기':'윈도우 음량 높이기';
    case 'system-scroll':return (s.axis==='horizontal'?'가로':'세로')+' 스크롤 이동';
    case 'system-mute':return '윈도우 음소거 상태 전환';
    case 'edit-history':return s.operation==='redo'?'현재 앱의 다시 실행 요청':'현재 앱의 실행 취소 요청';
    case 'wide-display':return action.wideNotice?'미저장 변경 사항 확인창 표시':'가로 화면 표시 모드 전환';
    case 'sd-plugin':return isFusionAction(action)?'지정한 Fusion 명령 실행':'설정한 플러그인 동작 실행';
    case 'ha-toggle':return '지정한 Home Assistant 장치 상태 전환';
    default:return PANEL_ACTION_HELP[action.type]?.split('. ')[0].replace(/\.$/,'')||'설정한 액션 실행';
  }
}
function knobRotationDescription(binding,offset,held){
  if(!binding)return '동작 없음';
  const mode=held?binding.heldMode:binding.mode;
  const enabled=!held||binding.heldEnabled;
  const stack=held?binding.heldStack:binding.stack;
  const stackTarget=stack?.length?stack[stackPositions[offset-2]%stack.length]:undefined;
  const target=mode==='stack'?stackTarget:held?binding.heldTarget:binding.target;
  const automatic=enabled&&(mode==='stack'||(!held&&mode==='adjust')||(held?binding.heldAutoAssign:binding.autoAssign));
  const prefix=held?'누른 채 ':'';
  const targetText=KNOB_TARGET_LABELS[target]||'지정 대상 조절';
  const descriptions=(held?['holdLeft','holdRight']:['left','right']).map(key=>{
    const action=enabled&&(mode==='stack'||(!held&&mode==='adjust'))?null:DeckCore.controlAction(binding,key);
    return action?{text:shortActionDescription(action),auto:false}:automatic?{text:targetText,auto:true}:null;
  });
  let summary='';
  if(descriptions.every(x=>x?.auto)){
    summary=prefix+'좌우 회전으로 '+targetText;
    if((held?binding.heldReverseDirection:binding.reverseDirection)===true)summary+=' (방향 반대)';
  }else if(descriptions.some(Boolean)){
    summary=prefix+descriptions.map((x,i)=>x?(i?'오른쪽: ':'왼쪽: ')+x.text:'').filter(Boolean).join(' / ');
  }
  if(!held&&!binding.heldEnabled){
    const press=binding.mode==='stack'?'조절 대상 변경':binding.down?shortActionDescription(binding.down):'';
    if(press)summary+=(summary?' · ':'')+'누르기: '+press;
  }
  return summary||'동작 없음';
}
function physicalTooltipContent(index,name,kind){
  const binding=DeckCore.controlBinding(state,index);
  if(kind==='side')return {title:'물리 단추 '+(index-KEY_COUNT+1),lines:['S: '+shortSideDescription(DeckCore.sideActionConfig(binding,index)),'L: '+shortSideDescription(DeckCore.sideActionConfig(binding,index,'hold'))]};
  return {title:name,lines:['S: '+knobRotationDescription(binding,index-KEY_COUNT,false),'L: '+knobRotationDescription(binding,index-KEY_COUNT,true)]};
}
function renderPhysicalControls(){
  const root=$("physical-controls");
  hideReplacedTooltip(root);root.replaceChildren();
  CONTROLS.forEach(({name,kind},offset)=>{
    const index=KEY_COUNT+offset, binding=DeckCore.controlBinding(state,index);
    const item=binding?.down;
    const button=document.createElement("button");button.type="button";
    button.className="physical-control "+kind+(state.selected===index?" selected":"");
    button.setAttribute("aria-label",name+" — "+(keyName(item)||"비어 있음"));
    const symbol=document.createElement("span");symbol.className="physical-symbol";
    const label=document.createElement("span");label.className="physical-name";
    label.textContent=(binding?.mode==='adjust'||(binding?.mode==='trigger'&&binding?.autoAssign))?'조절: '+({page:'페이지',profile:'프로필',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.target])
      :binding?.mode==='stack'?'스택: '+({page:'페이지',profile:'프로필',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.stack[stackPositions[offset-2]%binding.stack.length]])
      :(item?keyName(item):name);
    const heldLabel=document.createElement("span");heldLabel.className="physical-held-name";
    if(kind==='side'){
      const normal=DeckCore.sideActionConfig(binding,index),held=DeckCore.sideActionConfig(binding,index,'hold');
      label.textContent=normal.navigation==='none'?'':DeckCore.SIDE_NAV_LABELS[normal.navigation];
      heldLabel.textContent=held.navigation==='none'?'':DeckCore.SIDE_NAV_LABELS[held.navigation];
    }else{
      const labels=[];
      if(binding?.heldEnabled&&binding.heldMode==='stack'){
        const stack=binding.heldStack||[];
        if(stack.length)labels.push(KNOB_TARGET_LABELS[stack[stackPositions[offset-2]%stack.length]]);
      }else{
        for(const gesture of ['holdLeft','holdRight']){
          const a=DeckCore.controlAction(binding,gesture);
          if(a)labels.push(ACTIONS.get(a.type)?.label||keyName(a));
          else if(binding?.heldEnabled&&binding.heldAutoAssign)labels.push(KNOB_TARGET_LABELS[binding.heldTarget]);
        }
      }
      heldLabel.textContent=[...new Set(labels.filter(Boolean))].join(' / ');
    }
    setDeckForgeTooltip(button,()=>physicalTooltipContent(index,name,kind));
    button.setAttribute('aria-label',[name,label.textContent,heldLabel.textContent].filter(Boolean).join(' — '));
    button.append(symbol,label,heldLabel);
    button.addEventListener("click",()=>choose(index));
    button.addEventListener("contextmenu",event=>{
      event.preventDefault();
      const open=()=>{
        state.selected=index;controlGesture='down';
        renderPhysicalControls();renderControlInspector();
        showControlMenu(index,event.clientX,event.clientY);
      };
      if(inspectorSession?.dirty&&state.selected!==index)showInspectorLeaveDialog(open);
      else open();
    });
    button.addEventListener("dragenter",()=>{
      // Reveal the gesture targets below while an action is dragged over
      // the physical button/knob, without replacing the drop target.
      if(state.selected!==index){
        if(inspectorSession?.dirty)return;
        state.selected=index;controlGesture='down';
        persist();renderControlInspector();
      }
    });
    button.addEventListener("dragover",event=>{event.preventDefault();button.classList.add("drag-over");});
    button.addEventListener("dragleave",()=>button.classList.remove("drag-over"));
    button.addEventListener("drop",event=>{
      event.preventDefault();button.classList.remove("drag-over");
      const id=event.dataTransfer.getData("application/x-d200x-action");
      if(isAssignableAction(id))controlDrop(index,id);
    });
    root.append(button);
  });
}
async function chooseNativeImage(kind='image'){
  if(!window.deckBridge?.chooseImportFile)return null;
  return window.deckBridge.chooseImportFile(kind);
}
let libraryTab='keys';
let sdkPlugins=[];
const sdkActionNames=new Map();
const sdkActionDefaults=new Map();
async function refreshSdkPlugins(){
  if(!window.deckBridge?.sdkList)return;
  try{
    sdkPlugins=await window.deckBridge.sdkList();
    sdkActionNames.clear();sdkActionDefaults.clear();
    for(const plugin of sdkPlugins)for(const action of plugin.actions){
      sdkActionNames.set(action.uuid,sdkCatalogueLabel(action));
      if(action.defaultImages)sdkActionDefaults.set(action.uuid,action.defaultImages);
    }
    renderGrid();void refreshSelectedVisual();
    // Update default-card thumbnails in place: do not disturb an open inspector's focus.
    const selectedItem=state.selected!==null&&state.selected<14?DeckCore.visibleActions(state)[state.selected]:null;
    if(selectedItem)void refreshStateTitleCards(selectedItem);
    if(libraryTab==='plugins')renderLibrary();
  }catch(error){window.d200xActionStatus?.('SDK 플러그인 목록 오류: '+String(error?.message||error));}
}
async function installSdkPlugin(fromFolder=false){
  if(!window.deckBridge?.sdkInstall)return window.d200xActionStatus?.('Windows EXE에서만 설치 가능합니다.');
  try{
    const plugin=fromFolder?await window.deckBridge.sdkInstallFolder():await window.deckBridge.sdkInstall();
    if(!plugin)return;
    await refreshSdkPlugins();
    window.d200xActionStatus?.('DeckForge 플러그인 설치: '+plugin.name+' '+plugin.version);
  }catch(error){window.d200xActionStatus?.('플러그인 설치 실패: '+String(error?.message||error));}
}
async function exportDeckForgePlugin(){
  if(!window.deckBridge?.deckforgeExportPlugin)
    return window.d200xActionStatus?.('Windows EXE에서만 패키징 가능합니다.');
  try{
    const result=await window.deckBridge.deckforgeExportPlugin();
    if(result)window.d200xActionStatus?.('DeckForge 전용 설치 파일 저장 완료: '+result.name+' '+result.version);
  }catch(error){window.d200xActionStatus?.('패키지 저장 실패: '+String(error?.message||error));}
}
// Only change what the user can add from the catalogue. Existing action IDs,
// saved profiles and the original SDK plugin remain intact.
const HA_GENERIC_ACTION='de.perdoctus.streamdeck.homeassistant.entity';
const HA_CUSTOM_ACTION='de.perdoctus.streamdeck.homeassistant.dual-state-entity';
function sdkCatalogueLabel(action){
  return action.uuid===HA_CUSTOM_ACTION?'Home Assistant 장치 제어':action.name;
}
function openSdkPluginHelp(plugin,isFusion){
  let dialog=document.getElementById('sdk-plugin-help-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='sdk-plugin-help-dialog';
    dialog.setAttribute('aria-label','플러그인 사용 설명');
    dialog.style.cssText='max-width:min(500px,calc(100vw - 28px));width:460px;max-height:80vh;overflow:auto;background:#292d33;color:#f0f0f0;border:1px solid #6b7785;border-radius:8px;padding:18px;box-shadow:0 12px 40px #000a';
    document.body.append(dialog);
  }
  dialog.replaceChildren();
  const heading=document.createElement('div');heading.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px';
  const label=document.createElement('strong');label.textContent=isFusion?'Fusion 360 사용 방법':'Home Assistant 사용 방법';
  const close=document.createElement('button');close.type='button';close.className='sdk-plugin-help-close';close.textContent='닫기 ×';
  close.onclick=()=>dialog.close();
  heading.append(label,close);dialog.append(heading);
  if(isFusion){
    const install=document.createElement('button');install.type='button';
    install.textContent='FusionStreamDeck 애드인 설치';
    install.style.cssText='width:100%;padding:9px;border:1px solid #67717c;background:#393f49;color:#fff;border-radius:5px;margin-bottom:8px';
    const output=document.createElement('p');output.style.cssText='font-size:12px;line-height:1.5;margin:4px 0 12px;white-space:pre-wrap';
    output.textContent='Fusion 360이 설치되어 있지 않아도 DeckForge를 사용할 수 있습니다. Fusion 설치 후 이 버튼을 눌러 애드인을 설치하세요.';
    install.onclick=async()=>{
      install.disabled=true;
      try{
        const result=await window.deckBridge.installFusionAddin();
        output.textContent=({
          installed:'애드인을 복사했습니다. Fusion 360에서 실행하고 시작 시 자동 실행을 설정하세요.',
          existing:'FusionStreamDeck 애드인이 이미 설치되어 있습니다.',
          'fusion-not-ready':'Fusion 360을 설치하고 한 번 실행한 다음 다시 시도하세요.',
          'existing-incomplete':'기존 애드인 폴더가 있어 자동 덮어쓰지 않았습니다.',
          'not-bundled':'이 설치본에 Fusion 애드인 파일이 없습니다.'
        })[result?.status]||result?.message||'설치 상태를 확인하세요.';
      }catch(error){output.textContent='설치 실패: '+String(error?.message||error)}
      finally{install.disabled=false}
    };
    dialog.append(install,output);
  }
  const guide=document.createElement('div');guide.style.cssText='white-space:pre-line;line-height:1.75;font-size:13px';
  guide.textContent=isFusion
    ?'1. Fusion 360을 실행합니다.\n2. 스크립트 및 애드인에서 FusionStreamDeck을 실행하고 시작 시 자동 실행을 선택합니다.\n3. DeckForge의 Run Command를 D200X 버튼에 등록합니다.\n4. 버튼 속성에서 원하는 명령을 검색하고 선택합니다.\n5. 연결된 Fusion의 원본 아이콘이 나타나며 버튼으로 명령을 실행할 수 있습니다.'
    :'1. Home Assistant에서 장기 액세스 토큰을 발급합니다.\n2. Home Assistant 장치 제어를 D200X 버튼에 등록합니다.\n3. 속성의 설정 열기를 눌러 HA 서버 주소와 장기 토큰을 입력합니다.\n4. 인증 성공 후 조회되는 엔티티 목록에서 제어할 장치를 선택합니다.\n5. 토큰은 비밀번호처럼 보관하고 GitHub에 업로드하지 않습니다.';
  dialog.append(guide);dialog.showModal();
}
function launchFusionManager(){
  window.deckBridge.openFusionManager().catch(error=>window.d200xActionStatus?.('Fusion Manager 실행 실패: '+String(error?.message||error)));
}
function renderInstalledSdkPlugins(root,query){
  for(const plugin of sdkPlugins){
    const matching=plugin.actions.filter(a=>a.uuid!==HA_GENERIC_ACTION &&
      (plugin.name+' '+sdkCatalogueLabel(a)+' '+a.name+' '+a.uuid).toLowerCase().includes(query));
    if(!matching.length)continue;
    const section=document.createElement('section');section.className='group';
    const title=document.createElement('div');title.className='group-title';
    const heading=document.createElement('span');heading.textContent=plugin.name+' ('+plugin.version+')';
    title.append(heading);
    const isFusion=plugin.uuid==='com.autodesk.fusionstreamdeck';
    const isHa=plugin.uuid==='de.perdoctus.streamdeck.homeassistant';
    if(isFusion||isHa){
      const info=document.createElement('button');info.type='button';info.textContent='?';
      info.title=plugin.name+' 사용법';info.setAttribute('aria-label',plugin.name+' 도움말');
      info.style.cssText='float:right;border:1px solid #777;border-radius:50%;height:22px;width:22px;background:#414141;color:white';
      info.onclick=event=>{event.stopPropagation();openSdkPluginHelp(plugin,isFusion)};
      title.append(info);
    }
    const body=document.createElement('div');
    title.addEventListener('click',()=>{body.hidden=!body.hidden;});
    for(const action of matching){
      const id='sd::'+plugin.uuid+'::'+action.uuid;
      const tile=document.createElement('div');tile.className='action-item';tile.draggable=true;
      tile.textContent='▣  '+sdkCatalogueLabel(action);
      setDeckForgeTooltip(tile,()=>({title:sdkCatalogueLabel(action),lines:[isFusion?'등록한 Fusion 명령 실행':isHa?'지정한 Home Assistant 장치 제어':'설정한 플러그인 동작 실행']}));
      tile.addEventListener('dragstart',ev=>ev.dataTransfer.setData('application/x-d200x-action',id));
      body.append(tile);
    }
    if(isFusion){
      const manager=document.createElement('button');manager.type='button';
      manager.className='fusion-manager-launch';
      manager.textContent='Fusion 명령 관리자 열기';
      manager.title='Fusion Command Manager 실행';
      manager.addEventListener('click',event=>{event.stopPropagation();launchFusionManager()});
      body.append(manager);
    }
    section.append(title,body);root.append(section);
  }
}
async function configureHomeAssistant(){
  if(!window.deckBridge?.haSave)return window.d200xActionStatus?.('HA 플러그인은 Windows EXE에서 사용 가능합니다.');
  try{
    const current=await window.deckBridge.haStatus();
    const url=await askDeckForgeText('Home Assistant 서버 주소',current.url||'http://192.168.0.100:8123',2048);
    if(url===null)return;
    const token=await askDeckForgeText('Home Assistant 장기 액세스 토큰 (기존 토큰은 표시되지 않음)','',4096);
    if(token===null)return;
    await window.deckBridge.haSave(url,token);
    window.d200xActionStatus?.('Home Assistant 연결 확인 및 설정 저장 완료');
  }catch(error){window.d200xActionStatus?.('Home Assistant 연결 실패: '+String(error?.message||error));}
}
const PANEL_ACTION_HELP={
  "brightness":"D200X 화면의 밝기를 설정합니다. 최대·높음·중간·낮음·최소 단계(100/75/50/30/20%) 또는 밝게·어둡게 동작을 선택합니다. PC 모니터 밝기는 변경하지 않습니다.",
  "device-brightness":"D200X 화면 밝기를 지정한 방향으로 조절합니다. 변화량 1·2·5·10을 선택할 수 있으며 노브 밝기 조절과 같은 장치 제어를 사용합니다. PC 모니터 밝기와 별개입니다.",
  "sleep":"D200X 화면을 끕니다. 이후 처음 누르는 물리 버튼은 화면을 깨우는 데 사용됩니다. 윈도우 절전이나 PC 종료가 아닙니다.",
  "virtual":"가상 DeckForge 표시를 전환하기 위한 예약 액션입니다. 현재 DeckForge에서 지원하지 않으며 등록 및 실행할 수 없습니다.",
  "folder":"덱 안에 하위 버튼 공간을 만들어 같은 프로필에서 폴더로 진입합니다. 폴더 안 페이지와 자동 나가기(동작 실행 후 0~60초)를 설정할 수 있습니다. 윈도우 파일 탐색기의 폴더를 만드는 기능은 아닙니다.",
  "profile":"다음·이전 프로필 또는 지정한 프로필로 전환합니다. 프로필마다 버튼과 페이지 구성을 관리할 때 사용합니다.",
  "previous":"현재 덱 또는 덱폴더의 이전 페이지로 이동합니다. 첫 페이지에서는 더 이전으로 이동하지 않습니다.",
  "next":"현재 덱 또는 덱폴더의 다음 페이지로 이동합니다. 마지막 페이지에서는 더 다음으로 이동하지 않습니다.",
  "goto":"속성에서 선택한 페이지로 바로 이동합니다. 대상 페이지가 실제 존재해야 합니다.",
  "indicator":"현재 페이지 번호를 표시합니다. 짧게·길게 누르기에 탐색 또는 DeckForge 열기를 지정할 수 있습니다.",
  "terminal":"Windows Terminal의 기본 프로필을 실행합니다. 기존 일반 권한 창 활성화와 중복 실행 방지를 설정할 수 있습니다.",
  "terminal-admin":"Windows Terminal을 관리자 권한으로 실행합니다. 일반 권한 창과 구분하며 새로 실행할 때 Windows의 관리자 승인 창이 나타날 수 있습니다.",
  "open-app":"지정한 실행 파일이나 등록된 시작 메뉴 앱을 실행합니다. 앞으로 가져오기를 켜면 지원되는 기존 앱 창 활성화를 먼저 시도합니다. 길게 누르기는 일반 종료·강제 종료·아무것도 하지 않음 중 선택합니다. 시작 메뉴 AppID는 별도 명령줄 인수를 지원하지 않습니다.",
  "close":"지원되는 응용 프로그램을 종료합니다. 일반 종료는 앱에 종료 요청을 전달하고 저장 확인 창이 나타날 수 있습니다. 강제 종료는 저장하지 않은 작업을 잃을 수 있습니다. 대상 식별이 불확실하면 종료하지 않습니다.",
  "file-open":"지정한 파일을 윈도우 기본 연결 프로그램으로 엽니다. 파일을 선택하거나 경로를 입력하고 저장합니다. 앱의 전경 활성화나 길게 누르기 종료 옵션은 없습니다.",
  "folder-shortcut":"지정한 파일시스템 폴더를 엽니다. 항상 새 창으로 열기를 선택하면 새 탐색기 창을 요청하고, 해제하면 동일 폴더 창 또는 탭을 찾아 전경으로 가져오며 없으면 엽니다. 윈도우 기본 파일 탐색기 기준이며 전경 전환에는 윈도우 정책의 제한이 있습니다.",
  "explorer-open":"Win+E 단축키로 윈도우 파일 탐색기를 엽니다. 특정 경로를 지정하려면 폴더 열기를 사용하세요.",
  "website":"URL을 기본 브라우저 또는 지정한 브라우저에서 엽니다. 백그라운드 GET 요청 방식도 선택할 수 있습니다. HTTPS 체크와 URL을 확인하세요.",
  "open":"앱·파일·폴더를 범용 방식으로 엽니다. 명령줄 인수는 EXE 실행에 사용할 수 있습니다. 폴더 열기의 중복 창 방지 또는 프로그램 열기의 전경 활성화·길게 누르기 종료는 제공하지 않습니다.",
  "system-volume":"윈도우 음량을 높이거나 낮춥니다. 변화량 1·2·5·10은 음량 키 입력 횟수입니다. 노브 조절 모드에서도 사용할 수 있습니다.",
  "system-mute":"윈도우 음소거 키를 보내 현재 음소거 상태를 전환합니다. DeckForge 자체 오디오만 정지하는 기능과 다릅니다.",
  "media":"윈도우 미디어 키로 재생/일시정지, 이전·다음 트랙, 정지, 음소거 및 음량 증감을 요청합니다. 실제 반응은 미디어 앱 지원 여부에 따라 달라집니다.",
  "audio-play":"지정한 로컬 오디오 파일을 DeckForge에서 재생합니다. 재생/정지, 겹쳐 재생, 재시작, 반복/정지, 페이드 시간, 음량과 출력 장치를 설정할 수 있습니다. 출력 장치 변경은 지원되는 환경에서만 동작합니다.",
  "audio-stop":"DeckForge의 오디오 재생 액션에서 현재 재생 중인 오디오를 모두 정지합니다. 다른 음악 플레이어나 윈도우 전체 음소거는 제어하지 않습니다.",
  "window-switch":"Alt+Tab 계열 입력을 보내 현재 윈도우 창을 전환합니다. 다음·이전 방향을 선택할 수 있으며 노브 조절에도 사용할 수 있습니다.",
  "window-state":"현재 활성 창에 Win+↑ 또는 Win+↓를 보내 최대화 또는 복원/최소화를 요청합니다. 결과는 현재 창 상태와 윈도우 동작에 따라 달라집니다.",
  "window-monitor":"Win+Shift+←/→를 보내 현재 활성 창을 왼쪽 또는 오른쪽 모니터로 이동합니다. 여러 모니터가 연결된 환경에서 사용합니다.",
  "desktop-switch":"Win+Ctrl+←/→를 보내 이전 또는 다음 윈도우 가상 데스크톱으로 이동합니다. 가상 데스크톱을 미리 만들어 두어야 합니다.",
  "hotkey":"사용자가 정한 키 조합을 한 번 실행합니다. 직접 지정하거나 복사·저장·창 전환 등의 프리셋을 선택하세요. 대상 앱이 해당 단축키를 지원해야 합니다.",
  "hotkey-switch":"두 개의 단축키를 등록하고 누를 때마다 번갈아 실행합니다. 실제 앱 상태를 자동으로 판별하는 기능은 아닙니다.",
  "text":"등록한 텍스트를 현재 입력 위치에 입력합니다. 기본은 타이핑 시뮬레이션이며, '클립보드에 추가'를 체크하면 클립보드에 저장하고 Ctrl+V로 붙여넣습니다. Enter 추가 옵션을 선택할 수 있습니다.",
  "system-scroll":"세로 또는 가로 스크롤 방향과 변화량을 지정합니다. 노브의 좌우 회전에도 적합합니다. 실제 스크롤은 활성 앱의 입력 처리에 따릅니다.",
  "edit-history":"Ctrl+Z 또는 Ctrl+Y를 보내 실행 취소·다시 실행을 요청합니다. 횟수 1·2·5·10을 선택할 수 있으며 실제 동작은 앱의 단축키 지원에 따릅니다.",
  "system-zoom":"Ctrl+Plus, Ctrl+Minus 또는 Ctrl+0을 보내 현재 앱의 확대·축소·원래 크기를 요청합니다. 반복 횟수를 정할 수 있습니다. 윈도우 디스플레이 배율을 변경하지 않습니다.",
  "multi":"동작 목록을 위에서 아래 순서대로 실행합니다. 단계 사이에 지연을 넣고 순서를 변경할 수 있습니다. 다른 복합 동작의 중첩은 지원하지 않으며 실행 중인 단계가 즉시 중단되지 않을 수 있습니다.",
  "multi-switch":"두 상태에 각각 실행할 동작 목록을 등록합니다. 현재 상태의 순서가 성공하면 다음 상태로 전환됩니다. 상태별 제목과 아이콘을 지정할 수 있으며 복합 동작 중첩은 지원하지 않습니다.",
  "random":"등록한 후보 중 하나를 무작위로 실행합니다. 후보가 없으면 실행할 동작이 없습니다. 복합 동작 중첩과 지연 단계는 지원하지 않습니다.",
  "logic":"한 번·두 번·길게 누르기에 다른 동작을 배정합니다. 물리 버튼의 입력 유형으로 구분하며 다른 복합 동작을 중첩할 수 없습니다.",
  "gesture-test":"D200X 버튼 하나에서 싱글·더블·롱 터치 판정을 검증합니다. 각 입력별 테스트 종류는 기록 전용이며 실제 단축키·프로그램·HA 동작은 실행하지 않습니다. AI 검증 로그 기록을 선택하면 최근 입력의 판정 결과를 AI 도우미에서 조회할 수 있습니다.",
  "timer":"설정한 초 단위 시간으로 카운트다운을 실행하고 종료 사운드를 선택합니다. 복합 동작의 단계 사이 대기와는 별개입니다.",
  "screenshot":"Win+Shift+S를 보내 윈도우 영역 캡처 도구를 엽니다. 캡처 영역은 사용자가 선택합니다.",
  "clipboard-edit":"복사·붙여넣기·잘라내기 중 하나를 지정합니다. Ctrl+C/V/X를 현재 앱에 전달합니다. 클립보드 내역을 편집하는 별도 관리 기능은 아닙니다.",
  "brush-size":"대괄호 [ 또는 ] 키로 브러시 크기 감소·증가를 요청합니다. 이 단축키를 지원하는 드로잉 앱에서 사용하며 노브 회전 방향에 각각 등록할 수 있습니다.",
  "timeline-step":"좌우 화살표 키로 타임라인 이전·다음 단계 이동을 요청합니다. 편집 앱의 단축키 설정에 따라 실제 동작이 달라집니다.",
  "timeline-zoom":"Ctrl+Plus 또는 Ctrl+Minus를 보내 타임라인 확대·축소를 요청합니다. 해당 단축키를 지원하는 편집 앱에서만 원하는 결과를 얻을 수 있습니다."
};
function showPanelActionHelp(id,label){
  const description=PANEL_ACTION_HELP[id];if(!description)return;
  const dialog=document.createElement('dialog');dialog.className='inspector-help-dialog';
  const heading=document.createElement('strong');heading.textContent=label+' 설명';
  const body=document.createElement('p');body.textContent=description;
  const close=document.createElement('button');close.type='button';close.className='inspector-help-close';close.textContent='닫기';
  close.addEventListener('click',()=>dialog.close());
  dialog.append(heading,body,close);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function dismissPanelActionOptions(event){
  if(event.target.closest?.('.action-customize, .action-override-controls'))return;
  document.querySelectorAll('#library-list .action-override-controls').forEach(menu=>menu.remove());
}
document.addEventListener('click',dismissPanelActionOptions,true);
// Hide duplicates only from the basic catalogue; keep persisted action IDs and bindings.
const HIDDEN_BASIC_ACTION_IDS=new Set(["explorer-open","screenshot","clipboard-edit","window-switch","window-state","window-monitor","desktop-switch","brush-size","timeline-step","timeline-zoom"]);
function renderLibrary(){
  const root=$("library-list");hideReplacedTooltip(root);root.replaceChildren();
  const query=$("action-search").value.trim().toLocaleLowerCase();
  if(libraryTab==='plugins'){
    // SDK plugins own their connection settings via the original Property Inspector.
    // The old standalone HA REST setup control was redundant and looked like a white bar.
    renderInstalledSdkPlugins(root,query);
  }
  for(const [category,entries] of CATALOG){
    // The legacy built-in HA action stays executable for saved profiles, but is no longer offered.
    if(category==='플러그인 · Home Assistant')continue;
    if(libraryTab==='plugins')continue;
    const visible=entries.filter(([id,label])=>!HIDDEN_BASIC_ACTION_IDS.has(id)&&(category+" "+label+" "+(PANEL_SHORTCUTS[id]||"")).toLocaleLowerCase().includes(query));
    if(!visible.length)continue;
    const section=document.createElement("section");section.className="group";
    const title=document.createElement("div");title.className="group-title";title.textContent=category;
    const body=document.createElement("div");title.addEventListener("click",()=>{body.hidden=!body.hidden;});
    for(const [id,label] of visible){
      const disabled=id==='virtual';
      const entry=document.createElement("div");entry.className="action-item"+(disabled?" action-disabled":"");entry.draggable=!disabled;
      if(disabled)entry.setAttribute("aria-disabled","true");
      setDeckForgeTooltip(entry,()=>({title:label,lines:[disabled?'추후 지원 예정 · 현재 등록 불가':shortActionDescription({type:id})]}));
      const symbol=document.createElement("span");symbol.className="action-icon";symbol.append(window.D200XPanelIcons.create(id));
      const caption=document.createElement("span");caption.className="action-caption";
      const name=document.createElement("span");name.textContent=label;caption.append(name);
      if(disabled){const note=document.createElement("small");note.className="action-unavailable";note.textContent="지원 예정 · 비활성화";caption.append(note);}
      const customise=document.createElement("button");customise.type="button";customise.className="action-customize";
      customise.textContent="⋯";customise.title=label+" 설명 및 아이콘 설정";customise.setAttribute("aria-label",label+" 설명 및 아이콘 설정");
      customise.addEventListener("click",event=>{
        event.stopPropagation();
        const old=root.querySelector(".action-override-controls");
        const same=old?.parentElement===entry;
        root.querySelectorAll(".action-override-controls").forEach(menu=>menu.remove());
        if(same)return;
        const tools=document.createElement("div");tools.className="action-override-controls";
        const description=document.createElement("button");description.type="button";description.textContent="액션 설명";
        description.addEventListener("click",ev=>{ev.stopPropagation();tools.remove();showPanelActionHelp(id,label);});
        tools.append(description);
        const upload=document.createElement("button");upload.type="button";upload.textContent="이미지 선택";
        const file=document.createElement("input");file.type="file";file.hidden=true;
        file.accept="image/png,image/jpeg,image/webp,image/gif";
        upload.addEventListener("click",async ev=>{
          ev.stopPropagation();
          if(!window.deckBridge?.chooseImportFile){file.click();return;}
          try{
            const chosen=await chooseNativeImage('panel-icon');
            if(chosen?.dataUrl&&window.D200XPanelIcons.setOverride(id,chosen.dataUrl)){
              renderLibrary();renderGrid();renderInspector();window.scheduleDeckSync?.();
            }
          }catch(error){window.d200xActionStatus?.('이미지 선택 실패: '+String(error?.message||error));}
        });
        file.addEventListener("change",()=>{
          const selected=file.files?.[0];
          if(!selected)return;
          if(!["image/png","image/jpeg","image/webp","image/gif"].includes(selected.type)||selected.size>140000){
            window.d200xActionStatus?.("이미지 파일은 PNG/JPG/WebP/GIF, 140KB 이하만 가능합니다.");return;
          }
          const reader=new FileReader();
          reader.onload=()=>{
            if(window.D200XPanelIcons.setOverride(id,String(reader.result))){renderLibrary();renderGrid();renderInspector();window.scheduleDeckSync?.();}
          };
          reader.readAsDataURL(selected);
        });
        const reset=document.createElement("button");reset.type="button";reset.textContent="기본 아이콘";
        reset.addEventListener("click",ev=>{ev.stopPropagation();window.D200XPanelIcons.clearOverride(id);renderLibrary();renderGrid();renderInspector();window.scheduleDeckSync?.();});
        tools.addEventListener("click",ev=>ev.stopPropagation());
        if(!disabled)tools.append(upload,file,reset);
        entry.append(tools);
        if(tools.getBoundingClientRect().bottom>root.getBoundingClientRect().bottom){
          tools.style.top='auto';tools.style.bottom='100%';
        }
      });
      entry.append(symbol,caption,customise);
      if(!disabled)entry.addEventListener("dragstart",ev=>ev.dataTransfer.setData("application/x-d200x-action",id));
      body.append(entry);
    }
    section.append(title,body);root.append(section);
  }
}
function bindActionAppearance(){
  const host=document.createElement("div");host.className="action-appearance";
  const label=document.createElement("label");label.textContent="액션 아이콘";
  const select=document.createElement("select");select.setAttribute("aria-label","오른쪽 액션 아이콘 테마");
  Object.entries(window.D200XPanelIcons.themeNames).forEach(([value,name])=>{
    const option=document.createElement("option");option.value=value;option.textContent=name;select.append(option);
  });
  select.value=window.D200XPanelIcons.theme;
  select.addEventListener("change",()=>{window.D200XPanelIcons.setTheme(select.value);renderLibrary();renderGrid();renderInspector();window.scheduleDeckSync?.();});
  const reset=document.createElement("button");reset.type="button";reset.textContent="개별 초기화";
  reset.title="오른쪽 목록의 개별 아이콘 설정만 초기화";
  reset.addEventListener("click",()=>{
    if(confirm("오른쪽 액션 목록의 개별 아이콘만 모두 초기화할까요?")){
      window.D200XPanelIcons.clearAll();renderLibrary();renderGrid();renderInspector();window.scheduleDeckSync?.();
    }
  });
  host.append(label,select,reset);
  host.id='action-appearance-toolbar';
  $("library-list").before(host);
  const pluginToolbar=document.createElement('div');
  pluginToolbar.id='plugin-install-toolbar';pluginToolbar.className='action-appearance plugin-install-toolbar';
  const add=document.createElement('button');add.type='button';add.className='plugin-add-button';
  add.textContent='＋ 플러그인 추가';
  add.addEventListener('click',()=>installSdkPlugin());pluginToolbar.append(add);
  const fromDir=document.createElement('button');fromDir.type='button';
  fromDir.className='plugin-add-button';fromDir.textContent='＋ 폴더에서 추가';
  fromDir.title='기존 Stream Deck 호환 .sdPlugin 폴더 설치';
  fromDir.addEventListener('click',()=>installSdkPlugin(true));pluginToolbar.append(fromDir);
  const exportButton=document.createElement('button');exportButton.type='button';
  exportButton.className='plugin-add-button';exportButton.textContent='패키지 저장';
  exportButton.title='선택한 .sdPlugin 폴더를 단일 .deckforgePlugin 설치 파일로 저장합니다. 원본은 변경하지 않습니다.';
  exportButton.addEventListener('click',exportDeckForgePlugin);pluginToolbar.append(exportButton);
  host.after(pluginToolbar);
  updatePluginToolbar();
}
function updatePluginToolbar(){
  const plugins=libraryTab==='plugins';
  if($("action-appearance-toolbar"))$("action-appearance-toolbar").hidden=plugins;
  if($("plugin-install-toolbar"))$("plugin-install-toolbar").hidden=!plugins;
}
function escapeHtml(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const FIXED_SHORTCUT_OPTIONS={
  'window-monitor':{left:'Win + Shift + ←',right:'Win + Shift + →'},
  'window-state':{maximize:'Win + ↑',minimize:'Win + ↓'},
  'window-switch':{next:'Alt + Tab',previous:'Alt + Shift + Tab'},
  'desktop-switch':{next:'Win + Ctrl + →',previous:'Win + Ctrl + ←'},
  'clipboard-edit':{copy:'Ctrl + C',paste:'Ctrl + V',cut:'Ctrl + X'},
  'edit-history':{undo:'Ctrl + Z',redo:'Ctrl + Y'},
  'system-zoom':{in:'Ctrl + +',out:'Ctrl + -',reset:'Ctrl + 0'},
  'brush-size':{increase:']',decrease:'['},
  'timeline-step':{previous:'←',next:'→'},
  'timeline-zoom':{in:'Ctrl + +',out:'Ctrl + -'}
};
// Native <option> cannot reliably align a label left and shortcut right
// on Windows, so only fixed-shortcut selectors receive this compact popup.
function bindShortcutOptionPreviews(root,item){
  const mapping=FIXED_SHORTCUT_OPTIONS[item.type];
  if(!mapping)return;
  for(const original of root.querySelectorAll('select[data-field]')){
    if(!Array.from(original.options).some(option=>mapping[option.value]))continue;
    const holder=document.createElement('div');holder.className='shortcut-select-wrap';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='shortcut-select-trigger';
    const menu=document.createElement('div');menu.className='shortcut-select-menu';menu.hidden=true;
    const redraw=()=>{
      const opt=original.selectedOptions[0];
      trigger.replaceChildren();
      const label=document.createElement('span');label.textContent=opt?.textContent||'';
      const short=document.createElement('small');short.textContent=mapping[original.value]||'';
      const arrow=document.createElement('span');arrow.textContent='⌄';
      trigger.append(label,short,arrow);
    };
    for(const option of original.options){
      const button=document.createElement('button');button.type='button';
      const label=document.createElement('span');label.textContent=option.textContent;
      const shortcut=document.createElement('small');shortcut.textContent=mapping[option.value]||'';
      button.append(label,shortcut);
      button.addEventListener('click',()=>{
        original.value=option.value;
        original.dispatchEvent(new Event('change',{bubbles:true}));
        menu.hidden=true;trigger.setAttribute('aria-expanded','false');redraw();
      });
      menu.append(button);
    }
    trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',()=>{
      menu.hidden=!menu.hidden;
      trigger.setAttribute('aria-expanded',String(!menu.hidden));
    });
    document.addEventListener('pointerdown',e=>{
      if(!holder.contains(e.target)){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}
    },{signal:inspectorListener.signal});
    original.addEventListener('change',redraw);
    original.parentNode.insertBefore(holder,original);
    holder.append(original,trigger,menu);
    redraw();
  }
}
// Compact groups only reposition existing controls. Keep their data-field values,
// native listeners and persisted settings unchanged; long inputs stay full-width.
const COMPACT_FIELD_GROUPS={
  'system-scroll':[['axis','direction','step']],
  'system-volume':[['direction','step']],
  'device-brightness':[['direction','step']],
  'system-zoom':[['operation','step']],
  'edit-history':[['operation','step']],
  'timer':[['seconds','sound']],
  'audio-play':[['mode','fade','fadeDuration'],['output','volume']],
  'text':[['enter','mode']]
};
const COMPACT_FIELD_LABELS={
  'autoExitEnabled':'자동 나가기','autoExitSeconds':'대기 시간',
  'fadeDuration':'페이드 시간','seconds':'지속 시간','enter':'Enter 추가'
};
function groupCompactActionFields(root,actionType){
  const sequences=COMPACT_FIELD_GROUPS[actionType];
  if(!sequences)return;
  const fields=root.querySelector('.properties>.fields');
  if(!fields)return;
  for(const keys of sequences){
    const nodes=keys.map(key=>fields.querySelector('.field [data-field="'+key+'"]')?.closest('.field'));
    if(nodes.some(node=>!node||node.parentElement!==fields))continue;
    const position=Array.from(fields.children).indexOf(nodes[0]);
    if(position<0||nodes.some((node,i)=>Array.from(fields.children).indexOf(node)!==position+i))continue;
    const group=document.createElement('div');
    group.className='compact-property-group compact-count-'+nodes.length+(actionType==='audio-play'?' audio-play-property-group':'');
    group.setAttribute('role','group');
    fields.insertBefore(group,nodes[0]);
    for(const [i,node] of nodes.entries()){
      const field=keys[i],label=node.querySelector('label');
      if(label&&COMPACT_FIELD_LABELS[field]){
        label.title=label.textContent;
        label.textContent=COMPACT_FIELD_LABELS[field];
      }
      group.append(node);
    }
  }
}
// Place the selected preset's actual shortcut inside the title input, to
// the left of the existing T⌄ control. Never show placeholder "user-defined"
// or text-entry hints as if they were a real keyboard shortcut.
function inspectorShortcut(item,root){
  const values=FIXED_SHORTCUT_OPTIONS[item.type];
  if(values){
    for(const select of root.querySelectorAll('select[data-field]')){
      if(Object.prototype.hasOwnProperty.call(values,select.value))
        return values[select.value];
    }
  }
  if(item.type==='hotkey')return String(item.settings?.keys||'').trim();
  if(item.type==='hotkey-switch'||item.type==='text')return '';
  return PANEL_SHORTCUTS[item.type]||'';
}
function bindInspectorShortcut(root,item){
  const line=root.querySelector('.title-line');
  if(!line)return;
  const caption=document.createElement('span');
  caption.className='title-shortcut-display';
  caption.setAttribute('aria-live','polite');
  line.append(caption);
  const update=()=>{
    const value=inspectorShortcut(item,root);
    caption.textContent=value;
    caption.title=value;
    line.classList.toggle('has-shortcut',Boolean(value));
  };
  root.querySelectorAll('[data-field]').forEach(field=>{
    field.addEventListener('change',update);
    field.addEventListener('input',update);
  });
  update();
}
const input=(field,label,placeholder="")=>`<div class="field"><label for="s-${field}">${label}</label><input id="s-${field}" data-field="${field}" value="${escapeHtml(valueOf(active,field))}" placeholder="${placeholder}"></div>`;
const select=(field,label,opts)=>`<div class="field"><label for="s-${field}">${label}</label><select id="s-${field}" data-field="${field}">${opts.map(([v,n])=>`<option value="${escapeHtml(v)}" ${(field==="page"?String(valueOf(active,field))===String(v):valueOf(active,field)===v)?"selected":""}>${escapeHtml(n)}</option>`).join("")}</select></div>`;
const pathPicker=(field,label,kind='file')=>
  '<div class="field"><label for="s-'+field+'">'+label+'</label><div class="compound">'+
  '<input id="s-'+field+'" data-field="'+field+'" value="'+escapeHtml(valueOf(active,field))+'">'+
  '<button type="button" data-path-picker="'+field+'" data-path-kind="'+kind+'" title="파일 찾아보기">…</button>'+
  (field==='path'&&active?.type==='open'
    ? '<button type="button" data-path-picker="'+field+'" data-path-kind="folder" title="폴더 선택">▣</button>' : '')+
  '</div></div>';
const check=(field,label,invert=false)=>`<div class="field checkbox-setting-field"><label for="s-${field}">${label}</label><input id="s-${field}" type="checkbox" data-field="${field}" ${invert?'data-inverted="true"':''} ${invert?!valueOf(active,field)?"checked":"":valueOf(active,field)?"checked":""}></div>`;
const fieldChecked=node=>node.dataset.textClipboard==='true'?(node.checked?'clipboard':'typing'):node.dataset.inverted==="true"?!node.checked:node.checked;
let active=null;
function openAppLegacyHold(item){
  const root=Number.isInteger(state.selected)&&state.selected<13
    ?DeckCore.visibleActions(state)[state.selected]:null;
  // This option belongs only to the primary Program Open action. The explicit
  // hold slot takes precedence, but must never delete the saved legacy choice.
  if(!root||item!==root)return '';
  const field=select("hold","길게 누르기",[["none","아무것도 하지 않음"],["close","프로그램 종료"],["force","프로그램 강제 종료"]]);
  return root.pressActions?.hold&&pressEnabled(root,'hold')
    ?field.replace('data-field="hold"','data-field="hold" disabled title="활성화된 길게 누르기 탭 동작이 우선 적용됩니다."')
    :field;
}
function actionFields(item){
  active=item;
  switch(item.type){
    case "audio-play":return pathPicker("file","파일")+select("mode","동작",[["play-stop","재생 / 정지"],["overlap","재생 / 오버랩"],["restart","재생 / 재시작"],["loop-stop","반복 / 정지"]])+select("fade","페이드",[["none","페이드 없음"],["in","페이드 인"],["out","페이드 아웃"],["in-out","페이드 인 앤 아웃"]])+select("fadeDuration","페이드 시간",[[1,"1초"],[2,"2초"],[3,"3초"],[4,"4초"],[5,"5초"]])+select("output","출력",[["default","기본"]])+`<div class="field"><label for="s-volume">음량</label><div class="compound"><input id="s-volume" type="range" min="0" max="100" data-field="volume" value="${valueOf(item,"volume",50)}"><output id="volume-display">${valueOf(item,"volume",50)}</output></div></div>`+`<div class="field"><span></span><span class="hint">연결된 출력 장치를 선택할 수 있습니다. 장치 전환은 실행 시 적용됩니다.</span></div>`;
    case "sd-plugin":return "";
    case "ha-toggle":return input("entityId","엔티티 ID","switch.living_room")+
      '<div class="field"><label>엔티티</label><button type="button" data-ha-entities>목록에서 선택</button></div>';
    case "audio-stop": case "previous": case "next": case "indicator":return "";
    case "timer":return `<div class="field"><label for="s-seconds">지속</label><div class="compound"><input type="number" min="1" id="s-seconds" data-field="seconds" value="${valueOf(item,"seconds",30)}"><span>초</span></div></div>`+select("sound","사운드",[["none","없음"],["connect","접속"],["disconnect","접속 끊김"],["release","접속 해제"],["find","찾기"],["other","기타"]]);
    case "brightness":return select("mode","동작",[["up","밝게"],["down","어둡게"],["max","최대"],["high","높음"],["medium","중간"],["low","낮음"],["min","최소"]]);
    case "sleep":return `<div class="field"><label>장치 화면</label><span class="hint">D200X 화면 잠자기 · 다음 물리 버튼 누름은 화면 깨우기에 사용 (PC 절전 아님)</span></div>`;
    case "virtual":return `<div class="field"><label>기기</label><span class="hint">구성된 Virtual DeckForge 없음</span></div>`;
    case "website":return `<div class="field website-url-field"><label for="s-url">URL</label><div class="website-url-control"><label class="https-toggle"><input id="url-https" type="checkbox" ${/^https:\/\//i.test(String(item.settings?.url||''))?'checked':''}>HTTPS</label><input id="s-url" data-field="url" value="${escapeHtml(valueOf(item,'url'))}" placeholder="example.com"></div></div>`+select("open","열기 방식",[["default","기본 브라우저"],["get","백그라운드에서 GET 요청"],["choose","브라우저 직접 선택"]])+pathPicker("browserPath","브라우저","app");
    case "open":return pathPicker("path","대상 경로")+input("args","실행 인수");
    case "terminal":case "terminal-admin":return check("foreground","맨 앞으로 가져오기")+check("preventDuplicate","중복 실행 방지");
    case "open-app":if(String(item.settings?.app||'').startsWith('shell:AppsFolder\\'))
      return '<div class="field"><label>프로그램</label><input readonly value="'+escapeHtml(item.settings.app)+'"></div>'+openAppLegacyHold(item)+check("foreground","맨 앞으로 가져오기")+check("preventDuplicate","중복 실행 방지");
      return pathPicker("app","프로그램","app")+input("args","실행 인수")+openAppLegacyHold(item)+check("foreground","맨 앞으로 가져오기")+check("preventDuplicate","중복 실행 방지");
    case "close":return pathPicker("path","대상 경로")+check("force","강제 종료");
    case "hotkey":return select("preset","동작 선택",HOTKEY_PRESET_LABELS)+input("keys","단축키","클릭하여 할당");
    case "hotkey-switch":return input("first","단축키 1")+input("second","단축키 2");
    case "text":return `<div class="field"><label for="s-body">텍스트</label><div><textarea id="s-body" data-field="body">${escapeHtml(valueOf(item,"body"))}</textarea><div class="hint" id="text-count">${String(valueOf(item,"body")).length} / -</div></div></div>`+check("enter","Enter 추가")+`<div class="field checkbox-setting-field"><label for="s-mode">클립보드에 추가</label><input id="s-mode" type="checkbox" data-field="mode" data-text-clipboard="true" ${item.settings?.mode==='typing'?'':'checked'}></div>`;
    case "media":return select("op","동작",[["previous","이전 트랙"],["playpause","재생 / 일시정지"],["next","다음 트랙"],["stop","정지"],["mute","음소거"],["up","음량 키우기"],["down","음량 줄이기"]]);
    case "system-volume":return select("direction","동작",[["up","음량 키우기"],["down","음량 줄이기"]])+select("step","변화량",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "system-mute":return '<div class="field"><span></span><span class="hint">누를 때마다 음소거 전환</span></div>';
    case "screenshot":case "explorer-open":return '';
    case "file-open":return pathPicker('path','파일 경로');
    case "folder-shortcut":return pathPicker('path','폴더 경로','folder')+check('foreground','맨 앞으로 가져오기')+check('alwaysNewWindow','중복 열기 방지',true);
    case "clipboard-edit":return select("operation","동작",[["copy","복사"],["paste","붙여넣기"],["cut","잘라내기"]]);
    case "window-state":return select("operation","동작",[["maximize","최대화"],["minimize","복원/최소화"]]);
    case "window-monitor":return select("direction","방향",[["left","왼쪽 모니터"],["right","오른쪽 모니터"]]);
    case "brush-size":return select("direction","동작",[["increase","브러시 확대 ([/] 지원 앱)"],["decrease","브러시 축소"]]);
    case "timeline-zoom":return select('operation','단축키',[["in","확대 (Ctrl++)"],["out","축소 (Ctrl+-)"]]);
    case "timeline-step":return select("direction","이동 방향",[["previous","이전 단계 (←)"],["next","다음 단계 (→)"]]);
    case "device-brightness":return select("direction","밝기",[["up","밝게"],["down","어둡게"]])+select("step","변화량",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "system-zoom":return select("operation","동작",[["in","확대"],["out","축소"],["reset","원래 크기 (Ctrl+0)"]])+select("step","횟수",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "window-switch":case "desktop-switch":return select("direction","전환 방향",[["next","다음"],["previous","이전"]]);
    case "edit-history":return select("operation","동작",[["undo","실행 취소 (Ctrl+Z)"],["redo","다시 실행 (Ctrl+Y)"]])+
      select("step","횟수",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "system-scroll":return select("axis","방향 축",[["vertical","세로"],["horizontal","가로"]])+
      select("direction","스크롤 방향",item.settings?.axis==='horizontal'
        ?[["right","오른쪽"],["left","왼쪽"]]:[["down","아래"],["up","위"]])+
      select("step","변화량",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "multi":return "";
    case "random":return "";
    case "folder":return check("autoExitEnabled","자동 나가기")+
      `<div class="field folder-wait-field"><label for="s-autoExitSeconds">대기 시간</label><div class="unit-field"><input id="s-autoExitSeconds" type="number" min="0" max="60" data-field="autoExitSeconds" value="${Number(item.settings?.autoExitSeconds)||0}"><span aria-hidden="true">초</span></div></div>`;
    case "multi-switch":return "";
    case "logic":return "";
    case "gesture-test":return "";
    case "profile":return select("profile","프로필",[
      ["next","다음 프로필"],["previous","이전 프로필"],...state.profileNames.map(p=>[p.id,p.name])
    ]);
    case "goto":{
      const count=DeckCore.activeFolder(state)?DeckCore.folderPageCount(state):state.pages.length;
      const options=Array.from({length:count},(_,i)=>[String(i),String(i+1)]);
      const selected=String(item.settings?.page??-1);
      if(!options.some(([value])=>value===selected))options.unshift([selected,'대상 없음 또는 삭제됨']);
      return select("page","대상",options);
    }
    default:return "";
  }
}
// Multi Action editor: uses the original right-hand action catalogue and does
// not change the approved editor layout. Unsupported nested composites are blocked.
// Directly executable simple actions; UI-only actions and nested composites stay excluded.
const MULTI_ALLOWED=['hotkey','hotkey-switch','media','website','open','open-app','close','text',
  'audio-play','audio-stop','timer','brightness','system-volume','system-mute',
  'system-scroll','edit-history','window-switch','desktop-switch',
  'system-zoom','device-brightness','screenshot','clipboard-edit',
  'window-state','window-monitor','explorer-open','brush-size',
  'timeline-step','timeline-zoom','file-open','folder-shortcut','terminal','terminal-admin'];

function orderedMultiDialog(step,apply){
  const draft=DeckCore.cleanAction(step),dialog=document.createElement('dialog');
  dialog.className='deckforge-input-dialog ordered-multi-dialog';
  const title=document.createElement('strong');title.textContent=ACTIONS.get(step.type)?.label||step.type;
  const fields=document.createElement('div');fields.className='fields';
  if(step.type==='hotkey'||step.type==='hotkey-switch'){
    const api=window.DeckHotkeys;
    for(const field of step.type==='hotkey'?['keys']:['first','second']){
      let parsed=api.parse(String(draft.settings[field]||'')),mods=parsed?.mods.slice()||[],key=parsed?.key.id||'';
      const label=document.createElement('label');label.textContent=field==='keys'?'단축키':field==='first'?'단축키 1':'단축키 2';
      const value=document.createElement('div');value.className='ordered-hotkey-value';
      const output=document.createElement('span'),hint=document.createElement('small');value.append(output,hint);
      const presets=document.createElement('select');
      presets.append(new Option('직접 지정',''));
      for(const [id,name] of HOTKEY_PRESET_LABELS.filter(x=>x[0]).sort((a,b)=>a[1].localeCompare(b[1],'ko')))presets.append(new Option(name,id));
      const choices=document.createElement('div');choices.className='hotkey-choices';
      const modifiers=[],menus=[];
      const sync=()=>{
        const raw=String(draft.settings[field]||'');
        output.textContent=raw?api.display(raw):'단축키 선택';
        const matched=api.matchPreset(raw,HOTKEY_PRESETS);
        hint.textContent=HOTKEY_PRESET_LABELS.find(x=>x[0]===matched)?.[1]||'';
        if(!matched)hint.textContent='';
        presets.value=matched||'';
        for(const [mod,button] of modifiers){button.classList.toggle('active',mods.includes(mod));button.setAttribute('aria-pressed',String(mods.includes(mod)));}
        for(const [group,menu] of menus)menu.value=group.keys.some(entry=>entry.id===key)?key:'';
      };
      const update=()=>{draft.settings[field]=key?api.format(mods,key):'';if(field==='keys'){draft.settings.preset=api.matchPreset(draft.settings[field],HOTKEY_PRESETS);draft.settings.source='custom';}sync();};
      presets.addEventListener('change',()=>{if(!presets.value)return;parsed=api.parse(api.canonical(HOTKEY_PRESETS[presets.value]));mods=parsed?.mods.slice()||[];key=parsed?.key.id||'';update();});
      for(const mod of api.order){const button=document.createElement('button');button.type='button';button.className='hotkey-modifier';button.textContent=mod;button.addEventListener('click',()=>{mods=mods.includes(mod)?mods.filter(x=>x!==mod):[...mods,mod];update();});modifiers.push([mod,button]);choices.append(button);}
      for(const group of api.groups){const menu=document.createElement('select');menu.title=group.label;menu.append(new Option(group.label,''));let category='',target=menu;for(const entry of group.keys){if(category!==entry.category){category=entry.category;target=menu;if(category){target=document.createElement('optgroup');target.label=category;menu.append(target);}}target.append(new Option(entry.label,entry.id));}menu.addEventListener('change',()=>{if(menu.value){key=menu.value;update();}});menus.push([group,menu]);choices.append(menu);}
      fields.append(label,presets,value,choices);sync();
    }
  }else{
    const prior=active;fields.innerHTML=actionFields(draft);active=prior;
    for(const node of fields.querySelectorAll('[data-field]'))node.addEventListener('change',()=>{draft.settings[node.dataset.field]=node.type==='checkbox'?fieldChecked(node):node.type==='number'||node.type==='range'?Number(node.value):node.value;});
    for(const button of fields.querySelectorAll('[data-path-picker]'))button.addEventListener('click',async()=>{try{const path=await window.deckBridge?.choosePath(button.dataset.pathKind);if(!path||!dialog.open)return;draft.settings[button.dataset.pathPicker]=path;const input=fields.querySelector('[data-field="'+button.dataset.pathPicker+'"]');if(input)input.value=path;}catch(e){window.d200xActionStatus?.(String(e?.message||e));}});
    if(draft.type==='ha-toggle')fields.querySelector('[data-ha-entities]')?.addEventListener('click',async()=>{
      try{
        const entities=await window.deckBridge?.haEntities?.();
        if(!dialog.open||!entities?.length)return;
        const selected=await chooseDeckForgeEntity(entities,draft.settings?.entityId||'');
        if(!dialog.open||selected===null||!entities.some(x=>x.entity_id===selected))return;
        draft.settings.entityId=selected;
        const input=fields.querySelector('[data-field="entityId"]');if(input)input.value=selected;
      }catch(error){window.d200xActionStatus?.('엔티티 선택 실패: '+String(error?.message||error));}
    });
    if(draft.type==='open-app')fields.querySelector('[data-field="hold"]')?.closest('.field')?.remove();
    if(draft.type==='website')fields.querySelector('#url-https')?.addEventListener('change',event=>{
      const input=fields.querySelector('[data-field="url"]');if(!input?.value.trim())return;
      input.value=(event.target.checked?'https://':'http://')+input.value.replace(/^https?:\/\//i,'');
      draft.settings.url=input.value;
    });
  }
  const footer=document.createElement('div');footer.className='inspector-save-bar';
  const button=(name,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',fn);footer.append(b);return b;};
  button('취소',()=>dialog.close());
  button('확인',()=>{if(['hotkey','hotkey-switch'].includes(draft.type)){const keys=draft.type==='hotkey'?[draft.settings.keys]:[draft.settings.first,draft.settings.second];if(keys.some(x=>!window.DeckHotkeys.canonical(x))){window.d200xActionStatus?.('단축키를 선택하세요.');return;}}apply(draft);dialog.close();});
  dialog.append(title,fields,footer);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
const ORDERED_PATH_TYPES={ 'open-app':['app','app'],open:['path','file'],close:['path','app'],'file-open':['path','file'],'folder-shortcut':['path','folder'],'audio-play':['file','file'] };
function orderedMultiSummary(step){
  const s=step.settings||{},label=ACTIONS.get(step.type)?.label||step.type;
  if(step.type==='hotkey'){const key=s.keys||'',id=window.DeckHotkeys.matchPreset(key,HOTKEY_PRESETS);return {value:key?window.DeckHotkeys.display(key):'단축키 지정',hint:HOTKEY_PRESET_LABELS.find(x=>x[0]&&x[0]===id)?.[1]||'',full:key};}
  if(step.type==='hotkey-switch')return {value:[s.first,s.second].filter(Boolean).join(' / ')||label,hint:label};
  if(ORDERED_PATH_TYPES[step.type]){const path=s[ORDERED_PATH_TYPES[step.type][0]]||'';return {value:path.split(/[\\/]/).pop()||'경로 선택',hint:label,full:path};}
  return {value:step.type==='website'?s.url||label:step.type==='text'?s.body||label:label,hint:''};
}
function refreshMultiRunControls(){
  const selected=state.selected;
  for(const stop of document.querySelectorAll('.ordered-multi-stop')){
    const record=runningMultiProgress.get(DeckCore.runtimeActionKey(state,selected,stop.dataset.gesture||'down'));
    stop.disabled=!record||record.controller.signal.aborted;
  }
}
function setSmallActionIcon(button,name){
  const paths={
    folder:'<path d="M3 19h15l3-9H9l-3 9M3 19V5h6l2 3h8v2" stroke-linejoin="round"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 16h10"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2 2m8.8 8.8 2 2m0-12.8-2 2m-8.8 8.8-2 2"/>',
    volume:'<path d="M3 9v6h4l5 4V5L7 9H3m12 0c2 2 2 4 0 6m3-9c4 4 4 8 0 12"/>'
  };
  button.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'+paths[name]+'</svg>';
}
function renderOrderedMulti(item,root){
  const area=document.createElement('section');area.className='multi-action-editor ordered-multi';
  const model=DeckCore.multiRows(item),rows=model.rows,session=inspectorSession;
  const current=()=>inspectorTargetCurrent(session,item);
  const rerender=()=>{if(state.selected>=14)renderControlInspector();else renderInspector();};
  const save=()=>{if(!current())return;DeckCore.setMultiRows(item,rows,model.tail);persistInspectorChange();rerender();};
  const select=document.createElement('select'),toolbar=document.createElement('div');toolbar.className='multi-action-toolbar';
  const primary=['hotkey','open-app','file-open','folder-shortcut'];
  for(const id of primary)select.append(new Option(ACTIONS.get(id)?.label||id,id));
  const group=document.createElement('optgroup');group.label='예약 동작';
  for(const id of MULTI_ALLOWED.filter(x=>!primary.includes(x)).sort((a,b)=>(ACTIONS.get(a)?.label||a).localeCompare(ACTIONS.get(b)?.label||b,'ko')))group.append(new Option(ACTIONS.get(id)?.label||id,id));
  select.append(group);
  const add=id=>{if(!current()||!MULTI_ALLOWED.includes(id)||rows.length>=100)return;rows.push({step:newAction(id),ms:rows.length?100:0});save();};
  const addButton=document.createElement('button');addButton.type='button';addButton.textContent='동작 추가';addButton.addEventListener('click',()=>add(select.value));toolbar.append(select,addButton);area.append(toolbar);
  if(state.selected>=14){
    const stop=document.createElement('button');stop.type='button';stop.className='ordered-multi-stop';stop.textContent='■ 실행 중단';
    stop.dataset.gesture=({'holdLeft':'hold-left','holdRight':'hold-right'})[controlGesture]||controlGesture;
    stop.addEventListener('click',()=>{runningMultiProgress.get(DeckCore.runtimeActionKey(state,state.selected,stop.dataset.gesture))?.controller.abort();refreshMultiRunControls();});
    area.prepend(stop);
  }
  const list=document.createElement('div');list.className='ordered-multi-list';
  const header=document.createElement('div');header.className='ordered-multi-row ordered-multi-header';
  for(const title of ['','지연 시간(ms)','동작','','']){const span=document.createElement('span');span.textContent=title;header.append(span);}list.append(header);
  let drag=-1;
  list.addEventListener('dragover',e=>e.preventDefault());
  list.addEventListener('drop',e=>{e.preventDefault();if(drag<0){const id=e.dataTransfer.getData('application/x-d200x-action');if(MULTI_ALLOWED.includes(id))add(id);}});
  rows.forEach((row,i)=>{
    const line=document.createElement('div');line.className='ordered-multi-row';line.draggable=true;
    line.addEventListener('dragstart',e=>{drag=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i+1));});
    line.addEventListener('dragend',()=>{drag=-1;});
    line.addEventListener('dragover',e=>{if(drag>=0)e.preventDefault();});
    line.addEventListener('drop',e=>{if(drag<0)return;e.preventDefault();e.stopPropagation();if(drag===i)return;const [moved]=rows.splice(drag,1);rows.splice(i,0,moved);drag=-1;save();});
    const num=document.createElement('span');num.textContent=String(i+1);num.title='드래그하여 순서 변경';
    const wait=document.createElement('input');wait.type='number';wait.min='0';wait.max=String(Math.max(600000,row.ms));wait.step='1';wait.value=String(row.ms);wait.title='해당 동작 실행 전 대기 (ms)';
    wait.addEventListener('change',()=>{row.ms=Math.max(0,Math.min(Number(wait.max),Math.round(Number(wait.value)||0)));save();});
    const {value,hint,full}=orderedMultiSummary(row.step);
    const summary=document.createElement('button');summary.type='button';summary.className='ordered-multi-value';summary.title=full||value;
    const v=document.createElement('span');v.textContent=value;const suffix=document.createElement('small');suffix.textContent=hint;summary.append(v,suffix);
    const edit=()=>orderedMultiDialog(row.step,draft=>{if(current()){row.step=draft;save();}});
    if(!['hotkey','hotkey-switch'].includes(row.step.type))summary.addEventListener('click',edit);
    else summary.tabIndex=-1;
    const config=document.createElement('button');config.type='button';config.className='ordered-multi-mini';config.setAttribute('aria-label','동작 설정');
    const pathInfo=ORDERED_PATH_TYPES[row.step.type];
    setSmallActionIcon(config,pathInfo?'folder':['hotkey','hotkey-switch'].includes(row.step.type)?'keyboard':'settings');
    config.title=pathInfo?'경로 선택':['hotkey','hotkey-switch'].includes(row.step.type)?'단축키 선택':'동작 설정';
    if(pathInfo)config.addEventListener('click',async()=>{try{const path=await window.deckBridge?.choosePath(pathInfo[1]);if(path&&current()){row.step.settings[pathInfo[0]]=path;save();}}catch(e){window.d200xActionStatus?.(String(e?.message||e));}});
    else config.addEventListener('click',edit);
    if(!pathInfo&&!['hotkey','hotkey-switch'].includes(row.step.type)){const prior=active,markup=actionFields(row.step);active=prior;if(!markup||!markup.includes('data-field')){config.disabled=true;config.style.visibility='hidden';summary.disabled=true;}}
    const remove=document.createElement('button');remove.type='button';remove.className='ordered-multi-mini';remove.textContent='−';remove.title='동작 삭제';remove.addEventListener('click',()=>{rows.splice(i,1);save();});
    line.append(num,wait,summary,config,remove);list.append(line);
  });
  if(model.tail){const note=document.createElement('p');note.className='hint';note.textContent='기존 마지막 대기 '+model.tail+'ms 유지';area.append(list,note);}else area.append(list);
  root.querySelector('.fields')?.append(area);refreshMultiRunControls();
}

const multiSwitchEditorTabs=new WeakMap();
function renderMultiEditor(item,root){
  if(item.type==='multi'){renderOrderedMulti(item,root);return;}
  const area=document.createElement('section');area.className='multi-action-editor';
  const switching=item.type==='multi-switch';
  const randomAction=item.type==='random';
  let steps=item.children;
  if(switching){
    if(!Array.isArray(item.sequences)){
      // Safely migrate legacy steps to state 1. Keep old children[] intact.
      item.sequences=[item.children.slice(),[]];persist();
    }
    const selected=multiSwitchEditorTabs.get(item)||0;
    steps=item.sequences[selected];
    const tabs=document.createElement('div');tabs.className='multi-switch-tabs';
    for(const i of [0,1]){
      const tab=document.createElement('button');tab.type='button';
      tab.textContent='상태 '+(i+1)+' · '+item.sequences[i].length+'개';
      tab.setAttribute('aria-pressed',String(selected===i));
      tab.addEventListener('click',()=>{
        multiSwitchEditorTabs.set(item,i);
        if(state.selected>=14)renderControlInspector();
        else renderInspector();
      });
      tabs.append(tab);
    }
    area.append(tabs);
    if(!Array.isArray(item.stateVisuals))item.stateVisuals=[{},{}];
    const visual=item.stateVisuals[selected]||(item.stateVisuals[selected]={});
    const fields=document.createElement('div');fields.className='multi-switch-visuals';
    const linked=document.createElement('label');
    const checkbox=document.createElement('input');checkbox.type='checkbox';
    checkbox.checked=item.settings?.linkStateTitles===true;
    linked.append(checkbox,document.createTextNode(' 두 상태 제목 연결'));
    checkbox.addEventListener('change',()=>{
      item.settings.linkStateTitles=checkbox.checked;persist();
      if(state.selected>=14)renderControlInspector();
      else renderInspector();
      renderGrid();
    });
    const titleLabel=document.createElement('label');
    titleLabel.textContent=checkbox.checked?'연결된 제목':'상태 '+(selected+1)+' 제목';
    const titleField=document.createElement('input');titleField.type='text';titleField.maxLength=256;
    const target=checkbox.checked?item.stateVisuals[0]:visual;
    titleField.value=target.title||'';titleField.placeholder='공통 제목 사용';
    titleField.addEventListener('change',()=>{
      target.title=titleField.value;persist();renderGrid();refreshSelectedVisual();
    });
    const iconLabel=document.createElement('label');iconLabel.textContent='상태 '+(selected+1)+' 아이콘 문자';
    const iconField=document.createElement('input');iconField.type='text';iconField.maxLength=8;
    iconField.value=visual.icon?.kind==='glyph'?visual.icon.glyph:'';
    iconField.placeholder='공통 아이콘 사용';
    iconField.addEventListener('change',()=>{
      visual.icon=iconField.value?{kind:'glyph',glyph:iconField.value}:undefined;
      persist();renderGrid();
    });
    const chooseImage=document.createElement('button');chooseImage.type='button';
    chooseImage.textContent='이미지 선택…';chooseImage.className='state-image-choose';
    const imageInput=document.createElement('input');imageInput.type='file';
    imageInput.accept='image/png,image/jpeg,image/webp,image/gif';imageInput.hidden=true;
    chooseImage.addEventListener('click',async()=>{
      if(!window.deckBridge?.chooseImportFile){imageInput.click();return;}
      try{
        const session=inspectorSession;
        const chosen=await chooseNativeImage('image');
        if(!chosen)return;
        const image=await rasterizeIcon(chosen.dataUrl);
        if(image.length>=1024*1024)throw new Error('변환된 PNG가 1MB를 넘습니다.');
        if(!inspectorPickerCurrent(session,item))return;
        visual.icon={kind:'file',value:image};
        persistInspectorChange();renderGrid();refreshSelectedVisual();
      }catch(error){window.d200xActionStatus?.('상태 이미지 선택 실패: '+String(error?.message||error));}
    });
    imageInput.addEventListener('change',async()=>{
      const file=imageInput.files?.[0];imageInput.value='';
      if(!file)return;
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024){
        window.d200xActionStatus?.('5MB 이하의 PNG/JPEG/WebP/GIF 이미지만 선택할 수 있습니다.');return;
      }
      try{
        const session=inspectorSession;
        const raw=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onerror=()=>reject(new Error('파일 읽기 실패'));
          reader.onload=()=>resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const image=await rasterizeIcon(raw);
        if(image.length>=1024*1024)throw new Error('변환된 PNG가 1MB를 넘습니다.');
        if(!inspectorPickerCurrent(session,item))return;
        visual.icon={kind:'file',value:image};
        persistInspectorChange();renderGrid();
      }catch(error){window.d200xActionStatus?.('상태별 이미지 적용 실패: '+String(error?.message||error));}
    });
    const resetIcon=document.createElement('button');resetIcon.type='button';
    resetIcon.textContent='공통 아이콘 사용';resetIcon.className='state-image-reset';
    resetIcon.addEventListener('click',()=>{
      delete visual.icon;iconField.value='';persist();renderGrid();
    });
    const imageActions=document.createElement('div');imageActions.className='state-image-actions';
    imageActions.append(chooseImage,resetIcon);
    const imageLabel=document.createElement('label');imageLabel.textContent='상태 '+(selected+1)+' 이미지';
    fields.append(linked,titleLabel,titleField,iconLabel,iconField,imageLabel,imageActions,imageInput);
    area.append(fields);
  }
  if(!randomAction){
    const spacing=document.createElement('div');spacing.className='control-config';
    const label=document.createElement('label');label.textContent='동작 간격 (2~200ms)';
    const input=document.createElement('input');input.type='number';input.min='2';input.max='200';input.step='1';
    input.value=String(Math.max(2,Math.min(200,Number(item.settings?.nextActionMs)||100)));
    input.addEventListener('change',()=>{
      item.settings.nextActionMs=Math.max(2,Math.min(200,Math.round(Number(input.value)||100)));
      input.value=String(item.settings.nextActionMs);persist();
    });
    spacing.append(label,input);area.append(spacing);
  }
  const heading=document.createElement('strong');
  heading.textContent=randomAction?'무작위 동작 · 후보 중 하나 실행':switching?'순차 동작 스위치 · 상태별 실행':'순차 동작 · 순서대로 실행';
  const note=document.createElement('p');note.className='hint';
  note.textContent=randomAction?'오른쪽 목록에서 후보를 추가하면 실행할 때 한 개를 무작위 선택합니다. 중첩 및 지연은 지원하지 않습니다.':
    '오른쪽 액션 목록에서 아래로 끌어놓기 · 지연은 별도 단계 · 중첩은 지원하지 않음';
  const list=document.createElement('div');list.className='multi-action-steps';
  const add=(id)=>{
    if(!MULTI_ALLOWED.includes(id)||steps.length>=100)return;
    steps.push(newAction(id));persist();
    if(state.selected>=14)renderControlInspector();
    else renderInspector();
  };
  list.addEventListener('dragover',e=>e.preventDefault());
  list.addEventListener('drop',e=>{
    e.preventDefault();
    const id=e.dataTransfer.getData('application/x-d200x-action');
    if(MULTI_ALLOWED.includes(id))add(id);
    else window.d200xActionStatus?.('지원하지 않는 하위 액션입니다.');
  });
  steps.forEach((step,i)=>{
    const row=document.createElement('div');row.className='multi-action-row';
    const title=document.createElement('span');
    title.textContent=(i+1)+'. '+(step.kind==='delay'?'지연 '+step.ms+'ms':keyName(step));
    row.append(title);
    const command=(text,fn)=>{
      const button=document.createElement('button');button.type='button';button.textContent=text;
      button.addEventListener('click',()=>{
        fn();persist();
        if(state.selected>=14)renderControlInspector();
        else renderInspector();
      });row.append(button);
    };
    if(i>0)command('↑',()=>{[steps[i-1],steps[i]]=[steps[i],steps[i-1]];});
    if(i<steps.length-1)command('↓',()=>{[steps[i],steps[i+1]]=[steps[i+1],steps[i]];});
    command('삭제',()=>steps.splice(i,1));
    list.append(row);
    if(step.kind==='delay'){
      const input=document.createElement('input');input.type='number';input.min='0';input.max='600000';
      input.value=String(step.ms);input.title='지연 (밀리초)';
      input.addEventListener('change',()=>{
        step.ms=Math.min(600000,Math.max(0,Math.round(Number(input.value)||0)));
        persist();renderInspector();
      });
      list.append(input);
    }else{
      const fields=document.createElement('div');fields.className='fields multi-step-fields';
      fields.innerHTML=actionFields(step);bindExtendedActionFields(fields,step);
      fields.querySelectorAll('[data-field]').forEach(node=>node.addEventListener('change',()=>{
        step.settings[node.dataset.field]=node.type==='checkbox'?fieldChecked(node):
          node.type==='number'||node.type==='range'?Number(node.value):node.value;
        persist();
      }));
      fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.deckBridge?.choosePath)return window.d200xActionStatus?.('Windows EXE에서만 파일 선택이 가능합니다.');
        try{
          const session=inspectorSession;
          const path=await window.deckBridge.choosePath(button.dataset.pathKind);
          if(!path||!inspectorTargetCurrent(session,step)||!steps.includes(step))return;
          step.settings[button.dataset.pathPicker]=path;persistInspectorChange();
          if(state.selected>=14)renderControlInspector();else renderInspector();
        }catch(error){window.d200xActionStatus?.('경로 선택 실패: '+String(error?.message||error));}
      }));
      list.append(fields);
    }
  });
  const toolbar=document.createElement('div');toolbar.className='multi-action-toolbar';
  const select=document.createElement('select');
  for(const id of MULTI_ALLOWED)select.add(new Option(ACTIONS.get(id)?.label||id,id));
  const addButton=document.createElement('button');addButton.type='button';addButton.textContent='동작 추가';
  addButton.addEventListener('click',()=>add(select.value));
  const delay=document.createElement('button');delay.type='button';delay.textContent='지연 추가';
  delay.hidden=randomAction;
  delay.addEventListener('click',()=>{
    if(steps.length>=100)return;
    steps.push({kind:'delay',ms:1000});persist();
    if(state.selected>=14)renderControlInspector();
    else renderInspector();
  });
  const cancel=document.createElement('button');cancel.type='button';
  cancel.textContent='■ 실행 중단';
  cancel.title='실행 중인 단계가 끝나거나 지연 중일 때 다음 단계를 중단합니다';
  cancel.addEventListener('click',()=>{
    const controller=runningMultiControllers.get(item);
    if(!controller)return window.d200xActionStatus?.('실행 중인 복합 동작이 없습니다.');
    controller.abort();
    window.d200xActionStatus?.('복합 동작 중단 요청');
  });
  toolbar.append(select,addButton,delay,cancel);
  area.append(list,toolbar);
  root.querySelector('.fields')?.append(area);
}
const TEST_TOUCH_CHOICES=[
  ['none','기록만 (동작 없음)'],
  ['hotkey','단축키'],['open-app','프로그램 열기'],
  ['file-open','파일 열기'],['folder-shortcut','폴더 열기'],
  ['text','텍스트 입력'],['ha-toggle','HA 장치 제어'],
  ['goto','페이지 이동'],['media','멀티미디어 제어']
];
function renderGestureTestEditor(item,root){
  const area=document.createElement('section');area.className='multi-action-editor gesture-test-editor';
  const hint=document.createElement('p');hint.className='hint';
  hint.textContent='D200X 실기 입력 판정만 검증합니다. 선택한 액션 종류는 이름만 기록하며 프로그램, 단축키, Home Assistant 등은 실제 실행하지 않습니다.';
  area.append(hint);
  for(const [slot,title] of [['single','한 번 누르기'],['double','두 번 누르기'],['hold','길게 누르기']]){
    const row=document.createElement('div');row.className='control-config';
    const label=document.createElement('label');label.textContent=title;
    const select=document.createElement('select');select.setAttribute('aria-label',title+' 테스트 종류');
    for(const [id,name] of TEST_TOUCH_CHOICES)select.add(new Option(name,id));
    select.value=item.settings?.[slot]||'none';
    select.addEventListener('change',()=>{item.settings[slot]=select.value;persist();});
    row.append(label,select);area.append(row);
  }
  const row=document.createElement('div');row.className='field checkbox-setting-field';
  const label=document.createElement('label');
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=item.settings?.logEnabled!==false;
  label.append(checkbox,document.createTextNode(' AI 검증 로그 기록'));
  checkbox.addEventListener('change',()=>{item.settings.logEnabled=checkbox.checked;persist();});
  row.append(label);area.append(row);
  const note=document.createElement('p');note.className='hint';
  note.textContent='체크 시 입력별 판정 결과가 AI 도우미의 input_trace에 기록됩니다. 공통 장치 입력 추적은 그대로 유지됩니다. 싱글 300ms 판정 대기, 롱 터치 600ms.';
  area.append(note);
  root.querySelector('.fields')?.append(area);
}
// Key Logic: three independent single-step assignments, no nested composites.
function renderLogicEditor(item,root){
  if(!item.slots)item.slots={single:null,double:null,hold:null};
  const area=document.createElement('section');area.className='multi-action-editor';
  // Detailed usage belongs in the header help modal.
  for(const [slot,label] of [['single','한 번 누르기'],['double','두 번 누르기'],['hold','길게 누르기']]){
    const row=document.createElement('div');row.className='control-config';
    const title=document.createElement('label');title.textContent=label;
    const select=document.createElement('select');
    select.add(new Option('동작 없음',''));
    for(const id of MULTI_ALLOWED)select.add(new Option(ACTIONS.get(id)?.label||id,id));
    select.value=item.slots[slot]?.type||'';
    const apply=()=>{
      const original=item.slots[slot];
      item.slots[slot]=select.value?(original?.type===select.value?original:newAction(select.value)):null;
      persist();
      if(state.selected>=14)renderControlInspector();else renderInspector();
    };
    select.addEventListener('change',apply);
    row.append(title,select);area.append(row);
    const action=item.slots[slot];
    if(action){
      const fields=document.createElement('div');fields.className='fields multi-step-fields';
      fields.innerHTML=actionFields(action);bindExtendedActionFields(fields,action);
      fields.querySelectorAll('[data-field]').forEach(node=>node.addEventListener(
        node.type==='range'||node.tagName==='TEXTAREA'?'input':'change',()=>{
          action.settings[node.dataset.field]=node.type==='checkbox'?fieldChecked(node):
            node.type==='number'||node.type==='range'?Number(node.value):node.value;
          persist();
        }));
      fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.deckBridge?.choosePath)return;
        try{
          const session=inspectorSession;
          const path=await window.deckBridge.choosePath(button.dataset.pathKind);
          if(!path||!inspectorTargetCurrent(session,action)||item.slots[slot]!==action)return;
          action.settings[button.dataset.pathPicker]=path;persistInspectorChange();
          if(state.selected>=14)renderControlInspector();else renderInspector();
        }catch(error){window.d200xActionStatus?.('파일 선택 실패: '+String(error?.message||error));}
      }));
      area.append(fields);
    }
  }
  root.querySelector('.fields')?.append(area);
}
// Common lower inspector for ordinary screen buttons. Key Up/Down artwork and
// the existing icon/title/preview regions are intentionally never relocated.
// One ordinary key, three independent action slots. Specialist inputs retain their own editor.
const PRESS_MAIN_EXCLUDED=new Set(['virtual','gesture-test','multi','multi-switch','random','logic','sd-plugin','indicator','folder']);
const PRESS_TABS=[['single','한 번 누르기','1'],['double','두 번 누르기','2'],['hold','길게 누르기','3']];
let activePressTab='single';
function pressIsOrdinary(action){return !!action&&!PRESS_MAIN_EXCLUDED.has(action.type);}
function pressSlotAction(root,slot){
  if(!root)return null;
  return slot==='single'?(root.type==='press-empty'?null:root):(root.pressActions?.[slot]||null);
}
function pressEnabled(root,slot){return root?.pressMeta?.enabled?.[slot]!==false;}
function pressDisplayAction(root){
  if(!root||!root.pressMeta)return root;
  const preferred=root.pressMeta.representative||'single';
  const available=slot=>pressEnabled(root,slot)&&pressSlotAction(root,slot);
  const selected=available(preferred)||['single','double','hold'].map(available).find(Boolean);
  return selected||{type:'press-empty',title:'',icon:{kind:'glyph',glyph:' '},settings:{}};
}
function pressTabArtwork(action,index){
  if(!action)return null;
  const visual=inspectorDisplayItem(action,index);
  const icon=action.settings?.keyPressIcons?.up||action.settings?.sdkStateIcons?.off||null;
  return icon?{...visual,icon}:visual;
}
function pressActionAssigned(item){
  return !!(item?.pressMeta||item?.pressActions?.double||item?.pressActions?.hold);
}
function isCurrentInspectorAction(item){
  const slot=state.selected;
  if(!Number.isInteger(slot)||slot<0)return false;
  const root=slot>=14?DeckCore.activeControlAction(DeckCore.controlBinding(state,slot),controlGesture):
    DeckCore.visibleActions(state)[slot];
  // Ignore an asynchronous icon/path picker once its gesture tab changed.
  if(!root)return false;
  if(slot<13&&pressIsOrdinary(root))return pressSlotAction(root,activePressTab)===item;
  return root===item;
}
// Pre-confirmation picker results belong to the exact unsaved inspector session.
function inspectorPickerCurrent(session,item){
  return !!session&&session===inspectorSession&&isCurrentInspectorAction(item);
}
function pressEnsureMeta(root){
  if(!root)return;
  root.pressMeta??={enabled:{single:true,double:true,hold:true},representative:'single'};
  root.pressMeta.enabled??={single:true,double:true,hold:true};
  // Never turn the Program Open legacy hold into a separate action. An
  // explicitly registered hold action only shadows the legacy setting.
}
function setPressSlot(index,slot,next,immediate=false){
  if(index<0||index>=13||!PRESS_TABS.some(x=>x[0]===slot))return false;
  if(immediate&&inspectorSession?.dirty){
    showInspectorLeaveDialog(()=>setPressSlot(index,slot,next,immediate));return false;
  }
  const current=DeckCore.visibleActions(state)[index]||null;
  const occupied=pressIsOrdinary(current)?pressSlotAction(current,slot):null;
  if(next&&occupied&&!confirm(PRESS_TABS.find(x=>x[0]===slot)[1]+'에 등록된 동작을 교체하시겠습니까?'))
    return false;
  if(current&&!pressIsOrdinary(current)){
    if(slot==='single'&&immediate){setItem(index,next);return true;}
    window.d200xActionStatus?.('특수 액션은 기존 전용 편집기에서 관리합니다.');return false;
  }
  if(next&&!DeckCore.PRESS_ACTION_TYPES.includes(next.type)){
    if(slot==='single'&&!current&&immediate){setItem(index,next);return true;}
    window.d200xActionStatus?.('이 액션은 전용 편집기로 등록해야 합니다.');return false;
  }
  let root=current;
  if(!root){
    root=slot==='single'&&next?next:DeckCore.createAction('press-empty');
    currentPage()[index]=root;
  }
  // A pinned button must not be modified across every page by an ordinary local drop.
  else if(!currentPage()[index]&&state.pinned?.[index]===root){
    root=DeckCore.cleanAction(root);currentPage()[index]=root;
  }
  pressEnsureMeta(root);
  if(slot==='single'){
    if(root!==next){
      const replacement=next||DeckCore.createAction('press-empty');
      replacement.pressActions=root.pressActions;
      replacement.pressMeta=root.pressMeta;
      currentPage()[index]=replacement;
      root=replacement;
    }
  }else{
    root.pressActions??={double:null,hold:null};
    root.pressActions[slot]=next||null;
  }
  if(slot!=='single'&&next?.type==='open-app')next.settings.hold='none';
  if(next){root.pressMeta.enabled[slot]=true;}
  state.selected=index;activePressTab=slot;
  if(immediate){
    inspectorSession=null;
    persist();render();
  }else{
    persistInspectorChange();renderGrid();renderInspector();
  }
  return true;
}
function attachPressPreviewBadges(root,inspector){
  // The gesture number and representative choice belong on the upper key preview,
  // never in the tab or in the PNG uploaded to the physical D200X.
  const stateIcons=Array.from(inspector.querySelectorAll('.sdk-state-icon[data-state-title] .sdk-state-preview'));
  const image=inspector.querySelector('#icon-preview');
  const images=stateIcons.length?stateIcons:(image?[image]:[]);
  if(!images.length)return;
  const action=pressSlotAction(root,activePressTab);
  const [,,number]=PRESS_TABS.find(([slot])=>slot===activePressTab);
  for(const [pos,host] of images.entries()){
    const badge=document.createElement('span');badge.className='press-image-number';
    badge.textContent=number;badge.title='현재 편집 중인 누르기: '+number+'번';
    host.append(badge);
    // One representative selector per action, regardless of Key Up/Down.
    if(pos!==0)continue;
    const button=document.createElement('button');button.type='button';
  button.className='press-image-representative';
  const preferred=(root.pressMeta?.representative||'single')===activePressTab;
  const displayed=!!action&&pressDisplayAction(root)===action;
  button.textContent=displayed?'✓':preferred?'◎':'○';
  button.title=displayed?'현재 표시되는 대표 아이콘':preferred
    ?'저장된 대표 선택 · 현재 비활성으로 다른 액션이 표시 중':'이 액션을 대표 아이콘으로 선택';
  button.setAttribute('aria-label','현재 탭의 액션을 대표 아이콘으로 선택');
  button.disabled=!action;
  if(displayed)button.classList.add('chosen');
  button.addEventListener('click',()=>{
    pressEnsureMeta(root);root.pressMeta.representative=activePressTab;
    persistInspectorChange();renderGrid();renderInspector();
  });
    host.append(button);
  }
}
function renderPressTabs(root,inspector){
  if(!pressIsOrdinary(root)||state.selected>=13)return;
  const host=document.createElement('section');
  host.className='press-tabs-section';host.setAttribute('aria-label','버튼 누르기 동작');
  const grid=document.createElement('div');grid.className='press-tabs-grid';
  for(const [slot,label,number] of PRESS_TABS){
    const action=pressSlotAction(root,slot);
    const enabled=!!action&&pressEnabled(root,slot);
    const tile=document.createElement('div');tile.className='press-tab-tile';
    if(activePressTab===slot)tile.classList.add('selected');
    if(!enabled)tile.classList.add('inactive');
    const heading=document.createElement('div');heading.className='press-tab-heading';
    const check=document.createElement('input');check.type='checkbox';
    check.checked=enabled;check.disabled=!action;check.title=label+' 동작 사용';
    check.setAttribute('aria-label',label+' 동작 사용');
    check.addEventListener('change',()=>{
      pressEnsureMeta(root);root.pressMeta.enabled[slot]=check.checked;
      persistInspectorChange();renderGrid();renderInspector();
    });
    const choose=document.createElement('button');choose.type='button';
    choose.className='press-tab-select';choose.textContent=label;
    choose.addEventListener('click',()=>{
      if(activePressTab!==slot){
        closeIconLibrary();closeIconMaker();fileIconTarget=null;fileIconSession=null;
        activePressTab=slot;
      }
      renderInspector();
    });
    heading.append(check,choose);
    const actionName=document.createElement('div');actionName.className='press-tab-name';
    actionName.textContent=action?(ACTIONS.get(action.type)?.label||action.type):'미등록';
    actionName.title=actionName.textContent;
    tile.append(heading,actionName);
    tile.addEventListener('dragover',ev=>{
      if(Array.from(ev.dataTransfer?.types||[]).includes('application/x-d200x-action')){
        ev.preventDefault();tile.classList.add('drag-over');
      }
    });
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag-over'));
    tile.addEventListener('drop',ev=>{
      ev.preventDefault();ev.stopPropagation();tile.classList.remove('drag-over');
      const id=ev.dataTransfer?.getData('application/x-d200x-action');
      if(isAssignableAction(id))setPressSlot(state.selected,slot,newAction(id),true);
    });
    grid.append(tile);
  }
  host.append(grid);
  attachPressPreviewBadges(root,inspector);
  const chosen=pressSlotAction(root,activePressTab);
  const controls=document.createElement('div');controls.className='press-tabs-controls';
  const del=document.createElement('button');del.type='button';del.className='press-tab-delete';
  del.textContent='동작 삭제';del.disabled=!chosen;
  del.addEventListener('click',()=>{
    if(!confirm(PRESS_TABS.find(x=>x[0]===activePressTab)[1]+' 동작과 속성을 삭제하시겠습니까?'))return;
    setPressSlot(state.selected,activePressTab,null);
  });
  controls.append(del);
  // Move the gesture tabs, not the existing artwork and preview components.
  const toolbar=inspector.querySelector(':scope > .action-layout-toolbar');
  if(toolbar)toolbar.prepend(host);
  else inspector.prepend(host);
  const properties=inspector.querySelector('.inspector-properties-region');
  if(properties)properties.append(controls);
  else inspector.append(controls);
}
async function updateApplicationArtwork(item,filePath,session=inspectorSession){
  if(!window.deckBridge?.inspectAppFile||!item||!/\.(exe|lnk|bat|cmd)$/i.test(filePath))return;
  const info=await window.deckBridge.inspectAppFile(filePath);
  const artwork=info?.icon?await rasterizeIcon(info.icon,144,100):null;
  if(!inspectorTargetCurrent(session,item)||
      ![item.settings?.path,item.settings?.app].includes(filePath))return;
  if(info?.name&&(!item.title||item.title===item.settings?.autoAppTitle)){
    item.title=info.name;item.settings.autoAppTitle=info.name;
  }
  if(artwork&&(!item.icon||item.settings?.autoAppIcon===true)){
    item.icon={kind:'file',value:artwork};item.settings.autoAppIcon=true;
  }
  persistInspectorChange();
  if(isCurrentInspectorAction(item))render();
  else renderGrid(); // A confirmed previous-tab choice must not steal current-tab focus.
}
async function registerDroppedApplication(index,filePath,allowAppId=false,snapshot=captureNativeGrid()){
  if(nativeGridBusy||!Number.isInteger(index)||index<0||index>=13||!window.deckBridge?.inspectDroppedTarget||!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
  nativeGridBusy=true;
  try{
    let info=null;
    if(filePath){
      try{info=await window.deckBridge.inspectDroppedTarget(filePath,allowAppId);}
      catch(error){window.d200xActionStatus?.('네이티브 드래그 등록 실패: '+String(error?.message||error));}
    }
    if(!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
    if(!info){
      if(!await window.deckBridge.nativeDropWarning?.())return;
      if(!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
      const selected=await window.deckBridge.choosePath('app');
      if(!selected||!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
      info=await window.deckBridge.inspectDroppedTarget(selected,false);
    }
    if(!info||!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
    const visible=snapshot.visible[index];
    if(visible&&!confirm('기존 버튼의 액션을 드래그한 대상으로 교체할까요?'))return;
    const artwork=info?.icon?await rasterizeIcon(info.icon,144,100):null;
    if(!nativeSlotUnchanged(snapshot,index)||inspectorSession?.dirty)return;
    const action=newAction(info.kind==='folder'?'folder-shortcut':'open-app');
    if(info.kind==='folder')action.settings.path=info.path;
    else {
      action.settings.app=info.path;
    }
    if(info.name){action.title=info.name;action.settings.autoAppTitle=info.name;}
    if(artwork){action.icon={kind:'file',value:artwork};action.settings.autoAppIcon=true;}
    setItem(index,action);
  }catch(error){window.d200xActionStatus?.('프로그램 드래그 등록 실패: '+String(error?.message||error));}
  finally{nativeGridBusy=false;}
}
function renderFolderInspector(item,root){
  const host=document.createElement('div');host.className='multi-action-editor folder-editor-actions';
  const open=document.createElement('button');open.type='button';open.textContent='폴더 내부 편집 →';
  open.addEventListener('click',()=>{
    const index=state.selected;
    if(index<14&&DeckCore.enterFolder(state,index)){persist();render();}
  });
  host.append(open);
  root.querySelector('.fields')?.append(host);
}
const DEFAULT_TITLE_STYLE = DeckCore.TITLE;
let previewRequest=0;
async function refreshSelectedVisual(){
  const root=state.selected===null?null:DeckCore.visibleActions(state)[state.selected];
  const item=pressIsOrdinary(root)?pressSlotAction(root,activePressTab):root;
  if(!item||!window.renderDeckKeyImage)return;
  const request=++previewRequest;
  try{
    const visible=inspectorDisplayItem(item,state.selected);
    const data=await window.renderDeckKeyImage(displayKeyPressItem(visible,state.selected,true),state.selected,previewPressKeys.has(state.selected));
    if(request!==previewRequest||!isCurrentInspectorAction(item))return;
    const host=$("icon-preview-content");
    if(!host)return;
    const image=document.createElement("img");
    image.className="icon-image rendered-key-image";
    image.src="data:image/png;base64,"+data;
    host.replaceChildren(image);
    const fallback=$("icon-preview")?.querySelector(".preview-title");
    if(fallback)fallback.hidden=true;
  }catch(error){console.warn("미리보기 이미지 생성 실패",error);}
}
window.refreshSelectedVisual=refreshSelectedVisual;
window.refreshKeyPressIcons=()=>{renderGrid();void refreshSelectedVisual();};
function refreshTitlePreview(item){
  const host=$("icon-preview");if(!host)return;
  let label=host.querySelector(".preview-title");
  if(!label){label=document.createElement("span");label.className="preview-title";host.append(label);}
  const current=displayKeyPressItem(inspectorDisplayItem(item,state.selected),state.selected,true);
  label.textContent=String(current?.title||"").replace(/<br\s*\/?>/gi,"\n");
  const style={...DEFAULT_TITLE_STYLE,...current?.titleStyle};
  label.hidden=style.visible===false;
  label.style.textAlign="center";
  label.style.fontFamily=style.family==="default"||style.family==="DeckForge Pretendard"?"DeckForge Pretendard, sans-serif":style.family;
  label.style.fontSize=(Math.max(8,Math.min(48,Number(style.size)||12))*98/72)+"px";
  label.style.fontWeight=style.bold?"bold":"normal";
  label.style.fontStyle=style.italic?"italic":"normal";
  label.style.textDecoration=style.underline?"underline":"none";
  label.style.color=style.color;
  label.style.top=style.align==="top"?"5px":style.align==="middle"?"50%":"auto";
  label.style.bottom=style.align==="bottom"?"5px":"auto";
  label.style.transform=style.align==="middle"?"translateY(-50%)":"none";
  refreshSelectedVisual();
  void refreshStateTitleCards(item);
}

const SHARED_COLOR_PALETTE=["#ffffff","#000000","#ff0000","#ff8800","#ffff00","#00cc66","#00ffff","#0088ff","#0000ff","#a855f7","#ff66cc","#808080","#ffb3ba","#ffd4b8","#fff0b3","#b9e8c4","#b5e3fa","#d9c2f0","#d98f95","#d9aa85","#d9c987","#8cb99a","#8cb5d2","#b39acb","#d64545","#d98236","#c3a42e","#3c9659","#377dbd","#8653b8","#702626","#754622","#756328","#285c3b","#244f78","#51346f","#f4c3e4","#b5e8df","#bfcbfa","#e4f4b5","#cf9ab8","#85b9b5","#1c1c1c","#333333","#505050","#707070","#909090","#b0b0b0","#d0d0d0","#eeeeee","#319a91","#5359b8","#bd548e","#86a63d","#245b58","#34386f","#753758","#505e2b","#919fcb","#b6c58b"];
const SHARED_COLOR_STORAGE='d200x-streamdeck-custom-title-colors-v1';
const PALETTE_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.3-3.5 1.2 1.2 0 0 1 1-2H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="11" cy="6.5" r="1"/><circle cx="16" cy="8" r="1"/></svg>';
function validPaletteColor(value){return typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);}
function sharedPaletteMarkup(prefix,heading){
  return '<div class="title-palette-header"><strong id="'+prefix+'-heading">'+heading+'</strong><button type="button" id="'+prefix+'-close" title="팔레트 닫기">×</button></div>'+
    '<div class="title-palette-label">나의 색상</div><div id="'+prefix+'-mine" class="title-palette-grid my-colors"></div>'+
    '<span id="'+prefix+'-empty" class="hint">저장된 색상이 없습니다.</span>'+
    '<div class="title-palette-label">기본 색상</div><div id="'+prefix+'-presets" class="title-palette-grid palette-default-colors"></div>'+
    '<button type="button" id="'+prefix+'-save" class="shared-palette-save">현재 색상을 나의 색상에 저장</button>';
}
function bindSharedColorPalette(palette,prefix,getColor,applyColor,close){
  const node=suffix=>palette.querySelector('#'+prefix+'-'+suffix);
  const load=()=>{
    try{const list=JSON.parse(localStorage.getItem(SHARED_COLOR_STORAGE));
      return Array.isArray(list)?[...new Set(list.filter(validPaletteColor).map(v=>v.toLowerCase()))].slice(0,24):[];
    }catch{return [];}
  };
  const store=colors=>{
    try{localStorage.setItem(SHARED_COLOR_STORAGE,JSON.stringify(colors));return true;}
    catch{alert('나의 색상을 저장할 수 없습니다. 저장소 공간을 확인해 주세요.');return false;}
  };
  let contextMenu=null,contextController=null;
  const dismissContext=()=>{
    contextController?.abort();contextController=null;
    contextMenu?.remove();contextMenu=null;
  };
  function openColorContext(event,color){
    event.preventDefault();event.stopPropagation();dismissContext();
    const menu=document.createElement('div');
    menu.className='key-menu palette-color-context';menu.setAttribute('role','menu');
    const remove=document.createElement('button');remove.type='button';
    remove.textContent='삭제';remove.setAttribute('role','menuitem');
    remove.addEventListener('click',event=>{
      event.stopPropagation();dismissContext();
      if(store(load().filter(c=>c!==color)))render();
    });
    menu.append(remove);palette.append(menu);contextMenu=menu;
    const bounds=menu.getBoundingClientRect();
    menu.style.left=Math.max(4,Math.min(event.clientX,window.innerWidth-bounds.width-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,window.innerHeight-bounds.height-4))+'px';
    contextController=new AbortController();
    const options={signal:contextController.signal};
    document.addEventListener('pointerdown',event=>{
      if(!menu.contains(event.target))dismissContext();
    },options);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();dismissContext();}
    },options);
    window.addEventListener('resize',dismissContext,options);
    inspectorListener.signal.addEventListener('abort',dismissContext,{once:true,signal:contextController.signal});
  }
  const render=()=>{
    dismissContext();
    const grid=node('presets'),mine=node('mine'),colors=load(),scroll=grid.scrollTop;
    grid.replaceChildren();mine.replaceChildren();
    const add=(parent,color,saved)=>{
      const tile=document.createElement('button');tile.type='button';tile.className='title-color-swatch';
      tile.style.backgroundColor=color;tile.title=color+(saved?' · 나의 색상':'');
      tile.setAttribute('aria-label',color+' 색상 적용');
      tile.addEventListener('click',()=>applyColor(color));
      parent.append(tile);
      if(saved){
        tile.title+=' · 우클릭: 삭제';
        tile.addEventListener('contextmenu',event=>openColorContext(event,color));
      }
    };
    colors.forEach(color=>add(mine,color,true));
    SHARED_COLOR_PALETTE.forEach(color=>add(grid,color,false));
    grid.scrollTop=scroll;node('empty').hidden=colors.length>0;
  };
  node('save').addEventListener('click',()=>{
    const color=String(getColor()||'').toLowerCase();
    if(validPaletteColor(color)&&store([...load().filter(c=>c!==color),color].slice(-24)))render();
  });
  node('close').addEventListener('click',()=>{dismissContext();close();});
  render();return render;
}
// Prefer the actions-panel side of the inspector, never the adjacent icon card.
function appearancePalettePosition(inspector,trigger,bounds,width,height){
  const margin=8;
  const right=inspector.right+margin;
  const x=right+bounds.width<=width-margin?right:Math.max(margin,width-bounds.width-margin);
  const y=Math.max(margin,Math.min(trigger.top,height-bounds.height-margin));
  return {x,y};
}
function positionAppearancePalette(popup,trigger){
  const {x,y}=appearancePalettePosition($('inspector').getBoundingClientRect(),trigger.getBoundingClientRect(),popup.getBoundingClientRect(),window.innerWidth,window.innerHeight);
  popup.style.left=x+'px';popup.style.top=y+'px';
}
function bindKeyBackgroundControl(preview,item,key){
  if(!preview||state.selected>=13)return;
  const root=$('inspector'),trigger=document.createElement('button');
  trigger.type='button';trigger.className='key-background-trigger';trigger.innerHTML=PALETTE_ICON;
  trigger.title='단추 배경색';trigger.setAttribute('aria-label','단추 배경색');
  trigger.setAttribute('aria-expanded','false');preview.append(trigger);
  let popup=null;
  const get=()=>item.settings?.keyBackgrounds?.[key]||{enabled:false,color:'#08090c'};
  const save=(field,value)=>{
    item.settings??={};item.settings.keyBackgrounds??={};
    const previous=get();
    item.settings.keyBackgrounds[key]={...previous,[field]:value};
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  };
  const close=()=>{popup?.remove();popup=null;trigger.setAttribute('aria-expanded','false');};
  trigger.addEventListener('click',event=>{
    event.stopPropagation();
    if(popup?.isConnected){close();return;}
    root.querySelector('.key-background-popover')?._close?.();
    popup=document.createElement('div');popup.className='title-palette key-background-popover';
    popup._close=close;
    popup.innerHTML='<div class="key-background-settings"><label><input type="checkbox" class="key-background-enabled"> 단추 배경색</label><input aria-label="단추 배경색" type="color" class="key-background-color"></div>'+sharedPaletteMarkup('key-palette','단추 배경색');
    const enabled=popup.querySelector('.key-background-enabled'),color=popup.querySelector('.key-background-color');
    enabled.checked=get().enabled===true;color.value=validPaletteColor(get().color)?get().color:'#08090c';
    enabled.addEventListener('change',()=>save('enabled',enabled.checked));
    color.addEventListener('input',()=>save('color',color.value));
    bindSharedColorPalette(popup,'key-palette',()=>get().color,value=>{color.value=value;save('color',value);},close);
    root.append(popup);trigger.setAttribute('aria-expanded','true');
    positionAppearancePalette(popup,trigger);
  });
  document.addEventListener('pointerdown',event=>{
    if(popup?.isConnected&&!popup.contains(event.target)&&!trigger.contains(event.target))close();
  },{signal:inspectorListener.signal});
  window.addEventListener('resize',close,{signal:inspectorListener.signal});
}

function bindTitleStyle(item){
  let indicatorField='title';
  let style={...DEFAULT_TITLE_STYLE,...item.titleStyle};
  let activeStateTitle=null;
  const commitStyle=()=>{
    if(activeStateTitle)ensureStateTitlePair(item)[activeStateTitle].style={...style};
    else if(item.type==='indicator')saveIndicatorStyle(indicatorField,style);
    else item.titleStyle={...style};
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  };
  const menu=$("title-style-popover"),toggle=$("title-style-trigger");
  const titleHost=menu.parentElement;
  toggle.addEventListener("click",()=>{
    if(item.type==='indicator'){root._openIndicatorStyle(toggle,'title');return;}
    else menu.hidden=!menu.hidden;
    toggle.setAttribute("aria-expanded",String(!menu.hidden));
  });
  const save=(field,value)=>{style[field]=value;commitStyle();};
  const visible=$("title-visible");visible.checked=style.visible;
  visible.addEventListener("change",()=>{if(item.type==='indicator')root._setIndicatorVisible('title',visible.checked);else save("visible",visible.checked);});
  menu.querySelectorAll("[data-align]").forEach(button=>{
    button.classList.toggle("active",button.dataset.align===style.align);
    button.addEventListener("click",()=>{
      save("align",button.dataset.align);
      menu.querySelectorAll("[data-align]").forEach(b=>b.classList.toggle("active",b===button));
    });
  });
  const family=$("title-family");family.value=style.family;
  family.addEventListener("change",()=>save("family",family.value));
  // Presets are copies of the complete title style, not references to profile data.
  // Keep them separate from the profile JSON and avoid silently changing a key.
  const presetKey="deckforge-title-style-presets-v1";
  const presetSelect=$("title-preset-select");
  const presetDelete=$("title-preset-delete");
  const validPresetStyle=value=>{
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    const cleaned={...DEFAULT_TITLE_STYLE};
    for(const field of Object.keys(cleaned)){
      if(Object.prototype.hasOwnProperty.call(value,field))cleaned[field]=value[field];
    }
    if(!["default","DeckForge Pretendard","Malgun Gothic","Segoe UI"].includes(cleaned.family))cleaned.family="default";
    cleaned.size=Math.max(8,Math.min(48,Number(cleaned.size)||12));
    cleaned.align=["top","middle","bottom"].includes(cleaned.align)?cleaned.align:"bottom";
    cleaned.visible=cleaned.visible!==false;
    for(const field of ["bold","italic","underline","backgroundEnabled"])cleaned[field]=cleaned[field]===true;
    cleaned.backgroundOpacity=Number.isFinite(cleaned.backgroundOpacity)?Math.max(0,Math.min(100,cleaned.backgroundOpacity)):65;
    for(const field of ["color","outlineColor","backgroundColor"])
      if(!/^#[0-9a-fA-F]{6}$/.test(cleaned[field]))cleaned[field]=DEFAULT_TITLE_STYLE[field];
    cleaned.outlineWidth=["none","thin","medium","thick"].includes(cleaned.outlineWidth)?cleaned.outlineWidth:"thin";
    return cleaned;
  };
  const loadPresets=()=>{
    try{
      const value=JSON.parse(localStorage.getItem(presetKey));
      if(!Array.isArray(value))return [];
      return value.slice(0,20).filter(entry=>typeof entry?.name==="string"&&entry.name.trim()&&entry.name.length<=40&&validPresetStyle(entry.style))
        .map(entry=>({name:entry.name,style:validPresetStyle(entry.style)}));
    }catch{return [];}
  };
  let presets=loadPresets();
  const writePresets=next=>{
    try{localStorage.setItem(presetKey,JSON.stringify(next));presets=next;return true;}
    catch{alert("글꼴 프리셋을 저장할 수 없습니다. 저장 공간을 확인해 주세요.");return false;}
  };
  const renderPresetOptions=(selected="")=>{
    presetSelect.replaceChildren();
    const empty=document.createElement("option");empty.value="";empty.textContent="프리셋 선택";presetSelect.append(empty);
    for(const entry of presets){
      const option=document.createElement("option");option.value=entry.name;option.textContent=entry.name;presetSelect.append(option);
    }
    presetSelect.value=selected;
    presetDelete.disabled=!selected;
  };
  renderPresetOptions();
  presetSelect.addEventListener("change",()=>{
    const chosen=presets.find(entry=>entry.name===presetSelect.value);
    presetDelete.disabled=!chosen;
    if(!chosen)return;
    // Mutate the existing style object so all field handlers keep the same reference.
    // Do not rebuild the inspector: the popover stays open and displays applied values.
    Object.assign(style,chosen.style);
    if(item.type==='indicator'){const n=indicatorCheckbox(indicatorField);if(n)n.checked=style.visible!==false;}else visible.checked=style.visible;
    menu.querySelectorAll("[data-align]").forEach(button=>
      button.classList.toggle("active",button.dataset.align===style.align));
    family.value=style.family;
    $("title-size").value=String(style.size);
    menu.querySelectorAll("[data-style]").forEach(button=>
      button.classList.toggle("active",Boolean(style[button.dataset.style])));
    $("title-color").value=style.color;
    $("outline-color").value=style.outlineColor;
    $("outline-width").value=style.outlineWidth;
    syncTitleBackgroundFields();
    commitStyle();
  });
  $("title-preset-save").addEventListener("click",async()=>{
    const input=await askDeckForgeText("프리셋 이름을 입력하세요 (현재 글꼴·크기·색상·외곽선·정렬 저장)",presetSelect.value||"",40);
    if(input===null)return;
    const name=input.trim();
    if(!name||name.length>40){alert("프리셋 이름은 1~40자로 입력해 주세요.");return;}
    const index=presets.findIndex(entry=>entry.name===name);
    if(index>=0&&!confirm('프리셋 "'+name+'"을(를) 현재 스타일로 덮어쓸까요?'))return;
    if(index<0&&presets.length>=20){alert("프리셋은 최대 20개까지 저장할 수 있습니다.");return;}
    const entry={name,style:validPresetStyle(style)};
    const next=[...presets];
    if(index>=0)next[index]=entry;else next.push(entry);
    if(writePresets(next))renderPresetOptions(name);
  });
  presetDelete.addEventListener("click",()=>{
    const name=presetSelect.value;
    if(!name||!presets.some(entry=>entry.name===name))return;
    if(!confirm('프리셋 "'+name+'"을(를) 삭제할까요? 현재 버튼의 스타일은 유지됩니다.'))return;
    if(writePresets(presets.filter(entry=>entry.name!==name)))renderPresetOptions();
  });
  const size=$("title-size");size.value=style.size;
  size.addEventListener("change",()=>{size.value=String(Math.max(8,Math.min(48,Number(size.value)||12)));save("size",Number(size.value));});
  menu.querySelectorAll("[data-style]").forEach(button=>{
    const field=button.dataset.style;button.classList.toggle("active",Boolean(style[field]));
    button.addEventListener("click",()=>{save(field,!style[field]);button.classList.toggle("active",style[field]);});
  });
  // The same palette and saved colors are used for all four appearance colors.
  const colorFields=[["title-color","color"],["outline-color","outlineColor"],["title-background-color","backgroundColor"]];
  const fieldIds=Object.fromEntries(colorFields.map(([id,field])=>[field,id]));
  const headings={color:"글자 색상",outlineColor:"외곽선 색상",backgroundColor:"제목 배경색"};
  let selectedColorField="color";
  const palette=$("title-palette");
  const updatePalette=bindSharedColorPalette(palette,'title-palette',()=>style[selectedColorField]??DEFAULT_TITLE_STYLE[selectedColorField],color=>{
    save(selectedColorField,color);$(fieldIds[selectedColorField]).value=color;
  },()=>{palette.hidden=true;});
  function openPalette(field,trigger){
    if(!palette.hidden&&selectedColorField===field){palette.hidden=true;return;}
    selectedColorField=field;palette.hidden=false;
    $("title-palette-heading").textContent=headings[field];updatePalette();
    positionAppearancePalette(palette,trigger);
  }
  colorFields.forEach(([id,field])=>{
    const color=$(id);color.value=style[field]??DEFAULT_TITLE_STYLE[field];
    color.addEventListener("input",()=>save(field,color.value));
    $(id+"-palette").addEventListener("click",event=>{event.stopPropagation();openPalette(field,event.currentTarget);});
  });
  window.addEventListener('resize',()=>{palette.hidden=true;},{signal:inspectorListener.signal});
  function syncTitleBackgroundFields(){
    $("title-background-enabled").checked=style.backgroundEnabled===true;
    $("title-background-color").value=validPaletteColor(style.backgroundColor)?style.backgroundColor:'#000000';
    const opacity=Number.isFinite(style.backgroundOpacity)?Math.max(0,Math.min(100,style.backgroundOpacity)):65;
    $("title-background-opacity").value=String(opacity);
    $("title-background-opacity-value").textContent=opacity+'%';
  }
  syncTitleBackgroundFields();
  $("title-background-enabled").addEventListener("change",()=>save("backgroundEnabled",$("title-background-enabled").checked));
  $("title-background-opacity").addEventListener("input",()=>{
    const opacity=Number($("title-background-opacity").value);
    $("title-background-opacity-value").textContent=opacity+'%';save("backgroundOpacity",opacity);
  });
  const outlineWidth=$("outline-width");outlineWidth.value=style.outlineWidth;
  outlineWidth.addEventListener("change",()=>save("outlineWidth",outlineWidth.value));
  $("title-reset").addEventListener("click",()=>{
    if(hasStateTitlePair(item)){
      const mode=$("inspector").dataset.activeTitle||'first';
      ensureStateTitlePair(item)[mode].style={...DEFAULT_TITLE_STYLE};
    }else if(item.type==='indicator')saveIndicatorStyle(indicatorField,indicatorField==='number'||indicatorField==='downNumber'?DeckCore.INDICATOR_NUMBER_STYLE:DEFAULT_TITLE_STYLE);
    else item.titleStyle={...DEFAULT_TITLE_STYLE};
    persistInspectorChange();renderGrid();renderInspector();
  });
  // The existing popover is reused: each card switches its own style object.
  const root=$("inspector");
  function syncIndicatorStyle(){
    menu.querySelectorAll("[data-align]").forEach(b=>b.classList.toggle("active",b.dataset.align===style.align));
    family.value=style.family;size.value=style.size;
    menu.querySelectorAll("[data-style]").forEach(b=>b.classList.toggle("active",!!style[b.dataset.style]));
    $("title-color").value=style.color;$("outline-color").value=style.outlineColor;outlineWidth.value=style.outlineWidth;
    syncTitleBackgroundFields();renderPresetOptions();palette.hidden=true;
  }
  function indicatorCheckbox(field){
    return $(field==='title'?'title-visible':field==='number'?'indicator-number-visible':field==='downTitle'?'indicator-down-title-visible':'indicator-down-number-visible');
  }
  function getIndicatorStyle(field){
    const common=DeckCore.indicatorCommon(state,item);
    if(field==='number')return {...common.indicatorNumberStyle};
    if(field==='downNumber')return {...(common.indicatorDownNumberStyle||common.indicatorNumberStyle)};
    if(field==='downTitle')return {...DEFAULT_TITLE_STYLE,...(item.settings?.indicatorDownTitleStyle||item.titleStyle)};
    return {...DEFAULT_TITLE_STYLE,...item.titleStyle};
  }
  function saveIndicatorStyle(field,next){
    if(field==='number'||field==='downNumber')DeckCore.updateIndicatorCommon(state,item,{[field==='number'?'indicatorNumberStyle':'indicatorDownNumberStyle']:{...next}});
    else if(field==='downTitle'){item.settings??={};item.settings.indicatorDownTitleStyle={...next};}
    else item.titleStyle={...next};
    for(const name of ['title','number','downTitle','downNumber']){
      const check=indicatorCheckbox(name);if(check)check.checked=getIndicatorStyle(name).visible!==false;
    }
  }
  root._openIndicatorStyle=(trigger,field)=>{
    const already=indicatorField===field&&!menu.hidden&&menu.parentElement===trigger.parentElement;
    indicatorField=field;style=getIndicatorStyle(field);syncIndicatorStyle();
    (field==='title'?titleHost:trigger.parentElement).append(menu);menu.hidden=already;
    root.querySelectorAll('.state-title-style').forEach(button=>button.setAttribute('aria-expanded',String(button===trigger&&!menu.hidden)));
  };
  root._openIndicatorNumberStyle=trigger=>root._openIndicatorStyle(trigger,'number');
  root._setIndicatorVisible=(field,checked)=>{
    saveIndicatorStyle(field,{...getIndicatorStyle(field),visible:checked});
    style=getIndicatorStyle(indicatorField);
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  };
  root._setIndicatorNumberVisible=checked=>root._setIndicatorVisible('number',checked);
  root._openStateTitleStyle=(which,trigger)=>{
    const entry=(item.settings?.stateTitles||defaultStateTitlePair(item))[which];
    activeStateTitle=which;
    style={...DEFAULT_TITLE_STYLE,...entry.style};
    root.dataset.activeTitle=which;
    menu.hidden=false;
    menu.querySelectorAll("[data-align]").forEach(b=>b.classList.toggle("active",b.dataset.align===style.align));
    family.value=style.family;
    visible.checked=entry.enabled;
    size.value=style.size;
    menu.querySelectorAll("[data-style]").forEach(b=>b.classList.toggle("active",!!style[b.dataset.style]));
    $("title-color").value=style.color;
    $("outline-color").value=style.outlineColor;
    outlineWidth.value=style.outlineWidth;
    syncTitleBackgroundFields();
    const host=trigger.closest('.state-title-control');
    if(host)host.append(menu);
    root.querySelectorAll('.state-title-style').forEach(b=>b.setAttribute('aria-expanded',String(b===trigger)));
    trigger.setAttribute('aria-expanded','true');
    if(palette)palette.hidden=true;
  };
  document.addEventListener("pointerdown",event=>{
    if(!menu.isConnected)return;
    if(!menu.contains(event.target)&&!toggle.contains(event.target)&&
      !event.target.closest?.('.state-title-style')){
      palette.hidden=true;menu.hidden=true;toggle.setAttribute("aria-expanded","false");
      root.querySelectorAll('.state-title-style').forEach(button=>
        button.setAttribute('aria-expanded','false'));
    }
  },{signal:inspectorListener.signal});
}

// Inspector writes remain drafts until explicitly saved. A single snapshot covers
// nested icon, SDK, button, and rotary settings without altering the export schema.
function beginInspectorSession(){
  const key=state.profileId+':'+state.page+':'+JSON.stringify(state.folderPath||[])+':'+state.selected;
  if(inspectorSession?.key===key)return;
  inspectorSession=state.selected===null?null:{key,snapshot:JSON.stringify(state),dirty:false};
}
// External SDK Property Inspector commits are independent of DeckForge drafts.
// Resolve snapshot items by physical slot/gesture; Fusion context tokens reference live objects.
function sdkItemAtLocation(source,slot,gesture){
  if(slot<14)return DeckCore.visibleActions(source)[slot];
  const key=({'hold-left':'holdLeft','hold-right':'holdRight'})[gesture]||gesture;
  return DeckCore.controlBinding(source,slot)?.[key];
}
function commitExternalSdkSettings(instance,settings){
  const live=sdkItemAtLocation(state,instance.slot,instance.gesture);
  if(live?.type!=='sd-plugin'||live.settings?.pluginUUID!==instance.pluginUUID||
    live.settings?.actionUUID!==instance.actionUUID)return false;
  const confirmed=JSON.parse(inspectorSession?.snapshot||JSON.stringify(state));
  const stored=sdkItemAtLocation(confirmed,instance.slot,instance.gesture);
  if(stored?.type!=='sd-plugin'||stored.settings?.pluginUUID!==instance.pluginUUID||
    stored.settings?.actionUUID!==instance.actionUUID)return false;
  stored.settings.pluginSettings=clone(settings);
  const next=JSON.stringify(confirmed);
  try{
    if(profileStorageFailure)throw Error('프로필 파일 읽기 실패 상태');
    if(window.deckBridge?.writeProfile){
      const saved=window.deckBridge.writeProfile(confirmed);
      if(!saved?.ok)throw Error(saved?.error||'SDK 프로필 파일 저장 실패');
    }else localStorage.setItem(STORAGE_KEY,next);
  }catch(error){
    console.error('외부 SDK 설정 저장 실패',error);
    window.d200xActionStatus?.('플러그인 속성 저장 실패: 저장 공간/권한을 확인하세요.');
    return false;
  }
  live.settings.pluginSettings=clone(settings);
  if(inspectorSession){
    inspectorSession.snapshot=next;
    inspectorSession.dirty=JSON.stringify(state)!==next;
    updateInspectorSaveButtons();
  }
  renderGrid();
  window.scheduleDeckSync?.();
  return true;
}
// Asynchronous pickers may outlive the selected slot, gesture or inspector.
function inspectorTargetCurrent(session,item){
  if(!session||session!==inspectorSession||!item)return false;
  const selected=state.selected;
  const current=selected>=14?DeckCore.activeControlAction(DeckCore.controlBinding(state,selected),controlGesture):
    Number.isInteger(selected)?DeckCore.visibleActions(state)[selected]:null;
  return !!current&&(current===item||Object.values(current.pressActions||{}).includes(item)||current.children?.includes(item)||
    current.sequences?.some(steps=>steps.includes(item))||Object.values(current.slots||{}).includes(item));
}
function persistInspectorChange(){
  if(inspectorSession){inspectorSession.dirty=JSON.stringify(state)!==inspectorSession.snapshot;updateInspectorSaveButtons();return true;}
  return persist();
}
function updateInspectorSaveButtons(){
  const dirty=inspectorSession?.dirty===true;
  document.querySelectorAll('.inspector-save,.inspector-cancel').forEach(button=>{button.disabled=!dirty;});
  document.querySelectorAll('.action-preview-test,.control-test-row button').forEach(button=>{button.disabled=dirty||button.dataset.blocked==='true';button.title=dirty?'먼저 변경 사항을 저장하세요.':'저장된 동작 실행 테스트';});
  refreshMultiRunControls();
}
function saveInspector(){
  if(!inspectorSession?.dirty)return;
  const previous=inspectorSession;
  inspectorSession=null;
  if(!persist()){inspectorSession=previous;return;}
  commitPendingAudioVolumes();
  beginInspectorSession();
  updateInspectorSaveButtons();
}
function discardInspector(){
  if(!inspectorSession?.dirty)return;
  revertPendingAudioVolumes();
  const snapshot=JSON.parse(inspectorSession.snapshot);
  inspectorSession=null;state=DeckCore.migrateState(snapshot);
  render();beginInspectorSession();
}
function showInspectorLeaveDialog(onProceed){
  if(!inspectorSession?.dirty){onProceed();return;}
  if(document.querySelector('#inspector-unsaved-dialog'))return;
  const dialog=document.createElement('dialog');dialog.id='inspector-unsaved-dialog';
  dialog.className='inspector-unsaved-dialog';
  const title=document.createElement('strong');title.textContent='저장하지 않은 변경 사항';
  const message=document.createElement('p');message.textContent='변경한 내용이 저장되지 않았습니다. 저장하지 않고 이동하시겠습니까?';
  const actions=document.createElement('div');actions.className='inspector-unsaved-actions';
  const add=(label,handler,primary=false)=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    if(primary)button.className='primary';
    button.addEventListener('click',()=>{dialog.close();dialog.remove();handler();});
    actions.append(button);
  };
  add('취소',()=>{});
  add('저장 안 함',()=>{discardInspector();onProceed();});
  add('저장 후 이동',()=>{saveInspector();if(!inspectorSession?.dirty)onProceed();},true);
  dialog.append(title,message,actions);document.body.append(dialog);
  dialog.addEventListener('close',()=>{
    dialog.remove();refreshWideUnsavedWarning();
  },{once:true});
  dialog.showModal();
  refreshWideUnsavedWarning();
}
function appendInspectorSaveBar(root){
  const footer=document.createElement('div');footer.className='inspector-save-bar';
  const cancel=document.createElement('button');cancel.type='button';
  cancel.className='inspector-cancel';cancel.textContent='취소';cancel.disabled=!inspectorSession?.dirty;
  cancel.addEventListener('click',discardInspector);
  const save=document.createElement('button');save.type='button';
  save.className='inspector-save';save.textContent='저장';save.disabled=!inspectorSession?.dirty;
  save.addEventListener('click',saveInspector);
  footer.append(cancel,save);footer.classList.add('inspector-footer-region');root.append(footer);
  updateInspectorSaveButtons();
}
// Capture outside clicks so a different key, profile, page, or tool cannot
// silently discard a dirty inspector. Programmatic profile switches are
// separately guarded where they originate.
for(const type of ['click','change','input','drop'])document.addEventListener(type,event=>{
  if($('inspector')?.contains(event.target)){
    inspectorEditing=true;
    setTimeout(()=>{inspectorEditing=false;},0);
  }
},true);
document.addEventListener('click',event=>{
  if(!inspectorSession?.dirty)return;
  // Viewing help, opening a picker, searching, or choosing an icon stays in the
  // same editing session. Do not mistake these separate overlays for navigation.
  if(event.target.closest('#inspector-unsaved-dialog, .inspector-help-dialog, #sdk-plugin-help-dialog, #icon-maker, .deckforge-input-dialog'))return;
  if(event.target.closest('#icon-library')&&!event.target.closest('.icon-pack-remove'))return;
  if(event.target.closest('.action-customize, .action-override-controls'))return;
  if(event.target.closest('#action-search, #action-search-clear, .library-tabs, #profile-trigger, .profile-row-gear, .profile-global-trigger, .settings-trigger, .group-title'))return;
  const root=$('inspector');
  if(root?.contains(event.target))return;
  // Key/knob selection already checks for unsaved edits in choose(index).
  // Let that handler own the navigation so it survives inspector re-render.
  if(event.target.closest('#key-grid, #physical-controls'))return;
  event.preventDefault();event.stopImmediatePropagation();
  const target=event.target;
  const targetProfileId=target.closest('.profile-list-select')?.dataset.profileId;
  showInspectorLeaveDialog(()=>{
    if(targetProfileId){
      const match=[...document.querySelectorAll('.profile-list-select')].find(
        node=>node.dataset.profileId===targetProfileId
      );
      if(match){match.click();return;}
    }
    if(target.isConnected)setTimeout(()=>target.click(),0);
  });
},true);

let inspectorListener=new AbortController();
// The page-number indicator is a navigation-only key: show its three fixed
// gestures without exposing the existing profile's legacy navigation settings.
function renderFixedIndicatorBindings(root){
  const box=document.createElement('div');box.className='indicator-fixed-bindings';
  for(const [gesture,title] of [['single','한 번 누르기'],['double','두 번 누르기'],['hold','길게 누르기']]){
    const row=document.createElement('div');row.className='field indicator-fixed-binding';
    const label=document.createElement('label');label.textContent=title;
    const value=document.createElement('input');value.type='text';value.readOnly=true;
    value.value=DeckCore.INDICATOR_NAV_LABELS[DeckCore.fixedIndicatorNavigation(gesture).navigation];
    value.setAttribute('aria-label',title+' 고정 동작');value.title='페이지 번호 버튼의 고정 동작 · 수정 불가';
    const preview=document.createElement('button');preview.type='button';preview.className='action-preview-test';
    preview.textContent='▶';preview.title=title+' 실행 테스트';preview.setAttribute('aria-label',title+' 실행 테스트');
    preview.addEventListener('click',()=>runActionPreview(gesture));
    const controls=document.createElement('div');controls.className='compound';controls.append(value,preview);
    row.append(label,controls);box.append(row);
  }
  root.append(box);
}
// Physical controls use a dedicated compact inspector instead of pretending
// each knob has a single key. Drag to an individual gesture or click it to edit.
function renderSideBindings(root,index,binding,indicator=null){
  const configFor=gesture=>indicator?DeckCore.sharedIndicatorConfig(state,indicator,gesture):DeckCore.sideActionConfig(binding,index,gesture);
  const assign=(gesture,next)=>{
    if(!indicator)return assignSideControl(index,gesture,next,true);
    DeckCore.updateIndicatorCommon(state,indicator,{[gesture==='hold'?'indicatorHold':'indicatorDown']:next});
    persistInspectorChange();renderGrid();renderInspector();
  };
  const pair=document.createElement('div');pair.className='side-binding-pair';
  for(const [gesture,title] of [['down','한 번 누르기'],['hold','길게 누르기']]){
    const config=configFor(gesture);
    const column=document.createElement('div');column.className='side-binding-column';pair.append(column);
    const row=document.createElement('div');row.className='control-config side-binding-choice';
    const label=document.createElement('label');label.textContent=title;
    const choice=document.createElement('select');choice.setAttribute('aria-label',title);
    for(const [value,name] of Object.entries(indicator?DeckCore.INDICATOR_NAV_LABELS:DeckCore.SIDE_NAV_LABELS))choice.add(new Option(name,value));
    choice.value=config.navigation;
    const chooseConfig=navigation=>{
      const next={navigation};
      if(navigation==='goto')next.page=config.navigation==='goto'?config.page:(DeckCore.activeFolder(state)?.pageIndex??state.page);
      if(navigation==='profile-select')next.profile=config.navigation==='profile-select'?config.profile:state.profileId;
      if(navigation==='folder-target'){
        next.rootPage=config.navigation==='folder-target'?config.rootPage:-1;
        next.route=config.navigation==='folder-target'?config.route:[];
      }
      return next;
    };
    choice.addEventListener('change',()=>assign(gesture,chooseConfig(choice.value)));
    const test=document.createElement('button');test.type='button';test.className='action-preview-test';test.textContent='▶';
    test.setAttribute('aria-label',title+' 실행 테스트');test.dataset.blocked=String(config.navigation==='none');
    test.addEventListener('click',()=>runActionPreview(gesture));row.append(label,choice,test);column.append(row);
    const raw=indicator?null:gesture==='down'?binding.down:binding.sideHold;
    if(raw&&config.navigation==='none'&&raw.type!=='side-nav'){
      const note=document.createElement('div');note.className='hint';note.textContent='기존 비탐색 액션은 보존되어 있으나 측면 단추에서 실행하지 않습니다.';column.append(note);
    }
    if(!['goto','profile-select','folder-target'].includes(config.navigation))continue;
    const targetRow=document.createElement('div');targetRow.className='control-config side-binding-target';
    const targetLabel=document.createElement('label');targetLabel.textContent='대상';
    const targetChoice=document.createElement('select');targetChoice.setAttribute('aria-label',title+' 대상');
    let options,selected;
    if(config.navigation==='goto'){
      const count=DeckCore.activeFolder(state)?DeckCore.folderPageCount(state):state.pages.length;
      options=Array.from({length:count},(_,i)=>[String(i),String(i+1)+' 페이지']);selected=String(config.page);
    }else if(config.navigation==='profile-select'){
      options=state.profileNames.map(x=>[x.id,x.name]);selected=config.profile;
    }else{
      options=DeckCore.sideFolderTargets(state).map(x=>[JSON.stringify([x.rootPage,x.route]),x.label]);
      selected=JSON.stringify([config.rootPage,config.route]);
    }
    if(!options.some(x=>x[0]===selected))targetChoice.add(new Option('대상 없음 또는 삭제됨',selected));
    for(const [value,name] of options)targetChoice.add(new Option(name,value));
    targetChoice.value=selected;
    targetChoice.addEventListener('change',()=>{
      const next={...config};
      if(config.navigation==='goto')next.page=Number(targetChoice.value);
      else if(config.navigation==='profile-select')next.profile=targetChoice.value;
      else [next.rootPage,next.route]=JSON.parse(targetChoice.value);
      assign(gesture,next);
    });
    targetRow.append(targetLabel,targetChoice);column.append(targetRow);
  }
  root.append(pair);
}
function renderControlInspector(){
  beginInspectorSession();
  const root=$("inspector"),index=state.selected,offset=index-14;
  const info=CONTROLS[offset],binding=DeckCore.controlBinding(state,index);
  root.replaceChildren();
  const knob=info.kind==='knob',held=knob&&knobTab==='held';
  root.className='inspector control-inspector'+(knob?' knob-inspector':' side-inspector');
  const heldDisabled=held&&binding.heldEnabled!==true;
  const currentMode=knob?(held?binding.heldMode:binding.mode):'trigger';
  const head=document.createElement('div');head.className='action-head control-head';
  const name=document.createElement('strong');name.textContent=info.name+(knob?'':' · 액션 할당');
  head.append(name);
  if(knob){
    const tabs=document.createElement('div');tabs.className='control-mode-tabs';
    for(const [value,label] of [['normal','좌우 회전'],['held','누르고 좌우 회전']]){
      const tab=document.createElement('button');tab.type='button';tab.textContent=label;
      tab.classList.toggle('active',knobTab===value);
      tab.addEventListener('click',()=>{knobTab=value;controlGesture=value==='held'?'holdLeft':'left';renderControlInspector();});
      tabs.append(tab);
    }
    head.append(tabs);
  }
  root.append(head);
  if(knob){
    appendInspectorSaveBar(root);
    head.append(root.querySelector('.inspector-save-bar'));
    // Keep room for the enable row in both tabs so the fields never shift.
    const useRow=document.createElement('div');useRow.className='knob-enable-row';
    const use=document.createElement('input');use.type='checkbox';use.checked=binding.heldEnabled===true;
    const label=document.createElement('label');label.className='control-held-enable';label.append(use,document.createTextNode('누르고 좌우 회전 사용'));
    useRow.append(label);
    if(!held){useRow.classList.add('knob-reserved-row');use.disabled=true;}
    useRow.setAttribute('aria-hidden',String(!held));
    use.addEventListener('change',()=>{
      if(use.checked&&!confirm('누르고 좌우 회전 기능을 활성화하면 노브 누르기에 등록된 액션이 비활성화됩니다.\n\n계속하시겠습니까?')){
        use.checked=false;return;
      }
      binding.heldEnabled=use.checked;persist();renderControlInspector();
    });
    root.append(useRow);
  }
  const scopeRow=document.createElement('div');scopeRow.className='control-config';
  const scopeLabel=document.createElement('label');scopeLabel.textContent='적용 범위';
  const scope=document.createElement('select');
  for(const [value,label] of [['global','모든 페이지 공통'],['page','현재 페이지에만']])scope.add(new Option(label,value));
  scope.value=state.controls.scopes[offset];
  scope.addEventListener('change',()=>{DeckCore.changeControlScope(state,index,scope.value);persist();render();});
  scope.disabled=heldDisabled;
  scopeRow.append(scopeLabel,scope);
  if(knob){
    const modeLabel=document.createElement('label');modeLabel.textContent='설정 방식';
    const mode=document.createElement('select');
    for(const [value,label] of [['trigger','동작별 할당'],['stack','다이얼 스택']])mode.add(new Option(label,value));
    mode.value=currentMode==='stack'?'stack':'trigger';
    mode.disabled=heldDisabled;
    mode.addEventListener('change',()=>{
      if(mode.value==='trigger')DeckCore.automaticControl(binding,held);
      else if(held)binding.heldMode=mode.value;
      else binding.mode=mode.value;
      persist();renderControlInspector();
    });
    scopeRow.append(modeLabel,mode);
  }
  if(!knob){
    root.append(scopeRow);renderSideBindings(root,index,binding);
    appendInspectorSaveBar(root);updateInspectorSaveButtons();return;
  }
  if(knob){
    const settings=document.createElement('div');settings.className='knob-settings';
    scopeRow.classList.add('knob-settings-row');settings.append(scopeRow);
    const config=document.createElement('div');config.className='control-config control-adjust-config';
    const label=document.createElement('label');label.textContent='회전 조절 대상';
    const target=document.createElement('select');
    const targets=[['page','페이지 이동'],['profile','프로필 전환'],['volume','Windows 음량'],['zoom','확대/축소'],['scroll','세로 스크롤'],['scroll-x','가로 스크롤'],['history','실행 취소·다시 실행'],['window','창 전환'],['desktop','가상 데스크톱'],['brightness','기기 밝기']];
    for(const [value,title] of targets)target.add(new Option(title,value));
    const targetKey=held?'heldTarget':'target',stepKey=held?'heldStep':'step',reverseKey=held?'heldReverseDirection':'reverseDirection',stackKey=held?'heldStack':'stack';
    target.value=binding[targetKey];
    target.disabled=heldDisabled||currentMode==='stack';
    target.addEventListener('change',()=>{if(target.disabled)return;binding[targetKey]=target.value;DeckCore.automaticControl(binding,held);persist();renderControlInspector();});
    config.append(label,target);
    const stepLabel=document.createElement('label');stepLabel.textContent='회전 변화량';
    const stepSelect=document.createElement('select');stepSelect.className='control-step';
    for(const n of [1,2,5,10])stepSelect.add(new Option(String(n),String(n)));
    stepSelect.value=String(binding[stepKey]||1);stepSelect.disabled=heldDisabled;
    stepSelect.addEventListener('change',()=>{binding[stepKey]=Number(stepSelect.value);persist();});
    const reverseLabel=document.createElement('label');reverseLabel.className='control-reverse';
    const reverse=document.createElement('input');reverse.type='checkbox';reverse.checked=binding[reverseKey]===true;
    reverse.disabled=heldDisabled;
    reverse.addEventListener('change',()=>{binding[reverseKey]=reverse.checked;persist();});
    reverseLabel.append(reverse,document.createTextNode('방향 반대로'));
    const stepGroup=document.createElement('div');stepGroup.className='knob-step-group';stepGroup.append(stepSelect,reverseLabel);
    config.append(stepLabel,stepGroup);
    if(heldDisabled)settings.classList.add('knob-disabled-region');
    settings.append(config);root.append(settings);
    {
      const area=document.createElement('fieldset');area.className='control-stack-targets knob-stack';
      const legend=document.createElement('legend');legend.textContent='스택 구성';area.append(legend);
      area.disabled=heldDisabled||currentMode!=='stack';
      if(currentMode!=='stack')area.classList.add('knob-reserved-row');
      area.setAttribute('aria-hidden',String(currentMode!=='stack'));
      if(heldDisabled)area.classList.add('knob-disabled-region');
      for(const [value,title] of targets){
        const lbl=document.createElement('label'),check=document.createElement('input');check.type='checkbox';
        check.checked=binding[stackKey].includes(value);
        check.addEventListener('change',()=>{
          const values=targets.map(x=>x[0]).filter(x=>x===value?check.checked:binding[stackKey].includes(x));
          if(!values.length||values.length>3){check.checked=!check.checked;return;}
          binding[stackKey]=values;stackPositions[offset-2]=0;persist();renderPhysicalControls();
        });
        lbl.append(check,document.createTextNode(title));area.append(lbl);
      }
      root.append(area);
    }
  }
  const gestures=!knob?[['down','●','누르기']]:
    held?[['holdLeft','●◀','누른 채 왼쪽 회전'],['holdRight','●▶','누른 채 오른쪽 회전']]:
    [['left','↶','왼쪽 회전'],['right','↷','오른쪽 회전'],['down','●','누르기']];
  const strip=document.createElement('div');strip.className='control-gesture-strip';
  for(const [gesture,glyph,title] of gestures){
    const tile=document.createElement('button');tile.type='button';
    tile.className='control-gesture-tile'+(controlGesture===gesture?' active':'');
    const assigned=DeckCore.controlAction(binding,gesture);
    const allowed=!heldDisabled&&currentMode!=='stack'&&!(knob&&gesture==='down'&&binding.heldEnabled===true);
    const targetKey=held?'heldTarget':'target',reverseKey=held?'heldReverseDirection':'reverseDirection';
    const reverse=binding[reverseKey]===true;
    const left=gesture==='left'||gesture==='holdLeft';
    const named={page:['이전 페이지','다음 페이지'],profile:['이전 프로필','다음 프로필'],volume:['음량 감소','음량 증가'],zoom:['축소','확대'],history:['실행 취소','다시 실행']};
    const auto=named[binding[targetKey]]?.[(left?0:1)^(reverse?1:0)]||'자동 조절';
    const automatic=held?binding.heldAutoAssign:binding.autoAssign;
    const description=gesture==='down'?(binding.heldEnabled||held?'누르기 비활성':currentMode==='stack'?'대상 전환':assigned?keyName(assigned):'＋ 액션 놓기'):currentMode==='stack'?'자동 조절':assigned?keyName(assigned):automatic?auto:'＋ 액션 놓기';
    tile.innerHTML=knob?'<span class="control-gesture-symbol">'+glyph+'</span><span class="knob-gesture-copy"><strong>'+title+'</strong><span class="control-gesture-value">'+escapeHtml(description)+'</span></span>':'<span class="control-gesture-symbol">'+glyph+'</span><strong>'+title+'</strong><span class="control-gesture-value">'+(assigned?escapeHtml(keyName(assigned)):'＋ 액션 놓기')+'</span>';
    tile.disabled=!allowed;
    tile.addEventListener('click',()=>{controlGesture=gesture;renderControlInspector();});
    tile.addEventListener('dragover',e=>{if(allowed){e.preventDefault();tile.classList.add('drag-over');}});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag-over'));
    tile.addEventListener('drop',e=>{if(!allowed)return;e.preventDefault();const id=e.dataTransfer.getData('application/x-d200x-action');if(isAssignableAction(id))controlDrop(index,id,gesture,false);});
    const remove=document.createElement('button');remove.type='button';remove.className='control-tile-remove';
    remove.textContent='×';remove.title='등록된 동작 삭제';
    remove.disabled=!assigned||!allowed;
    remove.addEventListener('click',e=>{e.stopPropagation();removeControlAction(index,gesture);});
    const holder=document.createElement('div');holder.className='control-tile-holder';
    holder.append(tile,remove);
    if(knob){
      const test=document.createElement('button');test.type='button';test.className='action-preview-test knob-card-test';test.textContent='▶';test.setAttribute('aria-label',title+' 실행 테스트');
      test.dataset.blocked=String(heldDisabled||(gesture==='down'&&binding.heldEnabled===true));
      test.addEventListener('click',()=>runActionPreview(({holdLeft:'hold-left',holdRight:'hold-right'})[gesture]||gesture));holder.append(test);
    }
    if(heldDisabled)holder.classList.add('knob-disabled-region');
    strip.append(holder);
  }
  root.append(strip);
  const chosen=gestures.some(x=>x[0]===controlGesture)?controlGesture:gestures[0][0];
  const current=DeckCore.controlAction(binding,chosen);
  if(current&&!heldDisabled&&currentMode!=='stack'&&!(knob&&chosen==='down'&&binding.heldEnabled)){
    const editor=document.createElement('div');editor.className='control-action-editor';
    const fields=document.createElement('div');fields.className='fields';
    fields.innerHTML=actionFields(current);bindExtendedActionFields(fields,current);
    fields.querySelectorAll('[data-field]').forEach(node=>node.addEventListener(node.tagName==='TEXTAREA'?'input':'change',()=>{
      current.settings[node.dataset.field]=node.type==='checkbox'?fieldChecked(node):node.type==='number'?Number(node.value):node.value;
      persist();
    }));
    editor.append(fields);root.append(editor);
    if(['multi','multi-switch','random'].includes(current.type))renderMultiEditor(current,editor);
    if(current.type==='logic')renderLogicEditor(current,editor);
    fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
      if(!window.deckBridge?.choosePath)return;
      const session=inspectorSession;
      const selected=await window.deckBridge.choosePath(button.dataset.pathKind);
      if(!selected||!inspectorTargetCurrent(session,current))return;
      const field=button.dataset.pathPicker;
      current.settings[field]=selected;persistInspectorChange();renderControlInspector();
      if(['open','open-app','file-open'].includes(current.type)&&['path','app'].includes(field))
        void updateApplicationArtwork(current,selected,session).catch(error=>window.d200xActionStatus?.('프로그램 아이콘 추출 실패: '+String(error?.message||error)));
    }));
  }
  if(!knob)appendInspectorSaveBar(root);
  updateInspectorSaveButtons();

}
// Preview state title artwork through the same compositor as the physical key.
async function refreshStateTitleCards(item){
  const root=$('inspector');
  if(!root?.classList.contains('state-title-inspector')||!window.renderDeckKeyImage)return;
  if(!isCurrentInspectorAction(item))return;
  const pair=root.querySelectorAll('.sdk-state-icon[data-state-title]');
  if(!pair.length)return;
  const slot=state.selected;
  const visual=inspectorDisplayItem(item,slot);
  const momentary=isMomentaryIconAction(item);
  const artwork=item.type==='indicator'?null:stateDisplayArtwork(visual,slot,momentary);
  const version=String((Number(root.dataset.stateCardVersion)||0)+1);
  root.dataset.stateCardVersion=version;
  for(const card of pair){
    const second=card.dataset.stateTitle==='second';
    const progress=item.type==='multi'?runningMultiProgress.get(DeckCore.runtimeActionKey(state,slot,'down')):null;
    const titleVisual=item.type==='indicator'?indicatorPressVisual(visual,second):item.type==='timer'?resolveTimerVisual(visual,second,DeckCore.timerSeconds(item.settings?.seconds),artwork):item.type==='multi'?resolveMultiVisual(visual,second,artwork,progress):resolveStateTitle(visual,second,artwork);
    if(item.type==='multi'&&second){const input=card.querySelector('.state-title-input');if(input)input.value=multiProgressTitle(item,progress);}
    if(item.type==='indicator'&&second){const downTitle=card.querySelector('.indicator-down-title');if(downTitle&&document.activeElement!==downTitle)downTitle.value=item.settings?.indicatorDownTitle??item.title??'';}
    // State previews are snapshots, not a physical key-down effect.
    const img=card.querySelector('.sdk-state-preview');
    if(!img)continue;
    try{
      const png=await window.renderDeckKeyImage(item.type==='indicator'?{...titleVisual,keyPressAlternate:true}:titleVisual,slot,false);
      if(root.dataset.stateCardVersion!==version||!img.isConnected||
        !isCurrentInspectorAction(item))return;
      const rendered=document.createElement('img');
      rendered.src='data:image/png;base64,'+png;
      rendered.alt=(second?'두 번째':'첫 번째')+' 상태 제목과 아이콘 미리보기';
      const paletteTrigger=img.querySelector('.key-background-trigger');
      const overlays=Array.from(img.querySelectorAll(':scope > .press-image-number,:scope > .press-image-representative'));
      img.replaceChildren(rendered,...overlays);
      if(paletteTrigger)img.append(paletteTrigger);
    }catch(error){console.warn('상태별 제목 이미지 미리보기 실패',error);}
  }
}
function attachStateTitleControls(card,item,which){
  // Rendering and selecting an action must never mutate its stored SDK settings.
  const config=(item.settings?.stateTitles||defaultStateTitlePair(item))[which];
  const row=document.createElement('div');row.className='state-title-control';
  const check=document.createElement('input');check.type='checkbox';check.checked=config.enabled;
  check.className='state-title-visible';check.title='표시 속성 선택';
  check.setAttribute('aria-label',(which==='first'?'첫 번째':'두 번째')+' 표시 속성 선택');
  const input=document.createElement('input');input.type='text';input.className='state-title-input';
  input.placeholder=item.type==='text'?'자동 제목':'제목';input.title=item.type==='text'?'제목을 비우면 입력 텍스트가 자동 표시됩니다. <br>로 강제 줄바꿈':'<br>로 강제 줄바꿈';input.setAttribute('aria-label',which==='first'?'제목 1':'제목 2');
  const timer=item.type==='timer',timerIdle=timer&&which==='first';
  const multiAuto=item.type==='multi'&&which==='second';
  input.maxLength=256;input.value=timer?(timerIdle?'':DeckCore.formatTimerTime(DeckCore.timerSeconds(item.settings?.seconds),item.settings?.seconds)):multiAuto?multiProgressTitle(item,runningMultiProgress.get(DeckCore.runtimeActionKey(state,state.selected,'down'))):config.title;input.readOnly=timer||multiAuto;input.disabled=timerIdle||!config.enabled;
  if(multiAuto)input.title='실행 단계 자동 표시';
  const styleButton=document.createElement('button');styleButton.type='button';
  styleButton.className='state-title-style';styleButton.textContent='T⌄';
  styleButton.title=(which==='first'?'제목 1':'제목 2')+' 글꼴 속성';
  styleButton.setAttribute('aria-label',styleButton.title);
  styleButton.setAttribute('aria-expanded','false');
  styleButton.addEventListener('click',()=>{
    if(input.disabled)return;
    const menu=$('title-style-popover');
    if(menu.parentElement===row&&!menu.hidden){
      menu.hidden=true;styleButton.setAttribute('aria-expanded','false');return;
    }
    $('inspector')._openStateTitleStyle?.(which,styleButton);
  });
  check.addEventListener('change',()=>{
    const saved=ensureStateTitlePair(item)[which];
    saved.enabled=check.checked;
    input.disabled=timerIdle||!check.checked;styleButton.disabled=timerIdle||!check.checked;
    if(!check.checked&&$('inspector').dataset.activeTitle===which){
      $('title-style-popover').hidden=true;
      styleButton.setAttribute('aria-expanded','false');
    }
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  });
  input.addEventListener('input',()=>{
    if(timer||multiAuto)return;
    const saved=ensureStateTitlePair(item)[which];
    saved.title=input.value;
    // The legacy title is a fallback for imported versions, not the active state title.
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  });
  styleButton.disabled=timerIdle||!config.enabled;
  row.append(check,input,styleButton);
  card.append(row);
}
function bindSdkStateIcons(root,item){
  if(item.type!=='timer'&&item.type!=='hotkey-switch'&&(item.type!=='sd-plugin'||isMomentaryIconAction(item)))return;
  const panel=root.querySelector('[data-inspector-icons]');
  if(!panel)return;
  const draw=()=>{
    panel.replaceChildren();
    const cards=document.createElement('div');
    cards.className='sdk-state-icons';
    for(const [key,label] of (item.type==='timer'?[['off','대기 상태'],['on','실행 상태']]:item.type==='hotkey-switch'?[['off','상태 1'],['on','상태 2']]:[['off','OFF'],['on','ON']])){
      const group=document.createElement('div');group.className='sdk-state-icon';
      const heading=document.createElement('strong');heading.textContent=label;
      const image=document.createElement('div');image.className='sdk-state-preview';
      const selected=item.settings?.sdkStateIcons?.[key];
      if(selected?.kind==='file'){
        const img=document.createElement('img');img.src=selected.value;img.alt=label+' 상태 아이콘';image.append(img);
      }else{
        const fallback=sdkActionDefaults.get(item.settings?.actionUUID)?.[key];
        if(fallback){const img=document.createElement('img');img.src=fallback;img.alt=label+' 기본 아이콘';image.append(img);}
        else image.textContent='기본';
      }
      const choose=document.createElement('button');choose.type='button';choose.textContent='라이브러리';
      choose.addEventListener('click',()=>openIconLibrary(item,key));
      const file=document.createElement('button');file.type='button';file.textContent='파일';
      file.addEventListener('click',async()=>{
        try{
          if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서 사용할 수 있습니다.');
          const session=inspectorSession;
          const chosen=await chooseNativeImage('image');
          if(!chosen?.dataUrl)return;
          const png=await rasterizeIcon(chosen.dataUrl);
          if(!inspectorPickerCurrent(session,item))return;
          applyStateIconData(item,key,png,session);
        }catch(error){window.d200xActionStatus?.('상태 아이콘 선택 실패: '+String(error?.message||error));}
      });
      const paste=document.createElement('button');paste.type='button';paste.textContent='클립보드';
      paste.addEventListener('click',()=>pasteIcon(item,key));
      const symbol=document.createElement('button');symbol.type='button';symbol.textContent='특수문자';
      symbol.addEventListener('click',()=>openIconMaker(item,key));
      const reset=document.createElement('button');reset.type='button';reset.textContent='초기화';
      reset.addEventListener('click',()=>{
        if(item.settings?.sdkStateIcons)delete item.settings.sdkStateIcons[key];
        persistInspectorChange();render();
      });
      const buttons=document.createElement('div');buttons.className='sdk-state-buttons';
      buttons.append(choose,file,paste,symbol,reset);
      bindKeyBackgroundControl(image,item,key==='off'?'first':'second');
      group.dataset.stateTitle=key==='off'?'first':'second';
      group.append(heading);attachStateTitleControls(group,item,key==='off'?'first':'second');group.append(image,buttons);cards.append(group);
    }
    panel.append(cards);
    void refreshStateTitleCards(item);
  };
  draw();
}

function bindKeyPressIconControls(root,item){
  if(!isMomentaryIconAction(item)||!Number.isInteger(state.selected)||state.selected>=13)return;
  const panel=root.querySelector('[data-inspector-icons]');
  if(!panel)return;
  // Use the exact existing OFF/ON card DOM and CSS: no separate layout.
  const cards=document.createElement('div');cards.className='sdk-state-icons key-press-icons';
  const visual=inspectorDisplayItem(item,state.selected);
  const stored=item.settings?.keyPressIcons||{};
  const up=stored.up||visual.icon;
  for(const [key,title,icon] of [['up',item.type==='multi'?'대기 상태':'Key Up',up],['down',item.type==='multi'?'실행 상태':'Key Down',stored.down||up]]){
    const card=document.createElement('div');card.className='sdk-state-icon';
    const heading=document.createElement('strong');heading.textContent=title;
    const preview=document.createElement('div');preview.className='sdk-state-preview';
    preview.append(iconNode({...visual,...(icon?{icon}:{})},ACTIONS.get(item.type)?.icon||'+'));
    const buttons=document.createElement('div');buttons.className='sdk-state-buttons';
    const library=document.createElement('button');library.type='button';library.textContent='라이브러리';
    library.addEventListener('click',()=>openIconLibrary(item,'press:'+key));
    const file=document.createElement('button');file.type='button';file.textContent='파일';
    file.addEventListener('click',async()=>{
      try{
        if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서 사용할 수 있습니다.');
        const session=inspectorSession;
        const chosen=await chooseNativeImage('image');if(!chosen?.dataUrl)return;
        const png=await rasterizeIcon(chosen.dataUrl);
        if(!inspectorPickerCurrent(session,item))return;
        item.settings.keyPressIcons??={};
        item.settings.keyPressIcons[key]={kind:'file',value:png};
        persistInspectorChange();render();
      }catch(error){window.d200xActionStatus?.('Key '+key+' 아이콘 선택 실패: '+String(error?.message||error));}
    });
    const reset=document.createElement('button');reset.type='button';reset.textContent='초기화';
    reset.addEventListener('click',()=>{
      if(item.settings?.keyPressIcons)delete item.settings.keyPressIcons[key];
      persistInspectorChange();render();
    });
    const paste=document.createElement('button');paste.type='button';paste.textContent='클립보드';
    paste.addEventListener('click',()=>pasteIcon(item,'press:'+key));
    const symbol=document.createElement('button');symbol.type='button';symbol.textContent='특수문자';
    symbol.addEventListener('click',()=>openIconMaker(item,'press:'+key));
    buttons.append(library,file,paste,symbol,reset);
    bindKeyBackgroundControl(preview,item,key==='up'?'first':'second');
    card.dataset.stateTitle=key==='up'?'first':'second';
    card.append(heading);attachStateTitleControls(card,item,key==='up'?'first':'second');card.append(preview,buttons);cards.append(card);
  }
  panel.append(cards);
  void refreshStateTitleCards(item);
}
function bindIndicatorInspector(root,item){
  const index=state.selected,fields=root.querySelector('.properties>.fields');
  if(!fields)return;
  const common=DeckCore.indicatorCommon(state,item);
  const num=document.createElement('div');num.className='field title-setting-field indicator-number-field';
  const label=document.createElement('label');label.className='title-visible-label';
  const check=document.createElement('input');check.type='checkbox';check.id='indicator-number-visible';check.checked=common.indicatorNumberStyle.visible;
  label.append(check,document.createTextNode(' 번호 표시'));
  const line=document.createElement('div');line.className='title-line';
  const text=document.createElement('input');text.readOnly=true;text.value=String((DeckCore.activeFolder(state)?.pageIndex??state.page)+1);
  const font=document.createElement('button');font.type='button';font.className='title-style-trigger state-title-style';font.textContent='T⌄';font.title='공통 번호 스타일';font.setAttribute('aria-expanded','false');
  font.addEventListener('click',()=>root._openIndicatorNumberStyle(font));check.addEventListener('change',()=>root._setIndicatorNumberVisible(check.checked));
  line.append(text,font);num.append(label,line);fields.querySelector('.title-setting-field').after(num);
  const options=document.createElement('div');options.className='indicator-management';
  const addButton=document.createElement('button');addButton.type='button';addButton.textContent='모든 페이지에 버튼 추가';
  const designButton=document.createElement('button');designButton.type='button';designButton.textContent='모든 페이지에 디자인 적용';
  const remove=document.createElement('button');remove.type='button';remove.textContent='모든 페이지에서 버튼 제거';
  function bulk(op){
    if(op==='remove'&&inspectorSession?.dirty){showInspectorLeaveDialog(()=>bulk(op));return;}
    if(runningMultiActions.size||activeActionTimers.size||allPlayingAudio.size||openAppHoldTimers.size||logicPresses.size||sidePressTimers.size){window.d200xActionStatus?.('진행 중인 동작을 먼저 중단하세요.');return;}
    const current=DeckCore.visibleActions(state)[index];if(current?.type!=='indicator')return;
    if(op==='remove'&&!confirm('현재 덱의 모든 페이지에서 페이지 표시 버튼만 제거할까요?'))return;
    if(op==='design'&&!confirm('현재 디자인을 모든 기존 페이지 표시 버튼에 적용할까요? 버튼 위치와 다른 액션은 유지됩니다.'))return;
    if((op==='add'||op==='design')&&inspectorSession?.dirty&&!confirm('현재 편집한 디자인을 저장하고 일괄 작업을 진행할까요?'))return;
    // Addition/design commit the visible draft and bulk result together.
    // Never discard the very artwork being used as the template.
    const before=clone(state),session=inspectorSession;const result=DeckCore.manageIndicators(state,op,current);
    if(op==='remove')state.selected=null;
    inspectorSession=null;
    if(!persist()){state=before;inspectorSession=session;render();return;}
    render();
    window.d200xActionStatus?.(op==='add'?'페이지 표시 추가 '+result.added+' · 기존 '+result.existing+' · 빈자리 없음 '+result.full:op==='design'?'페이지 표시 '+result.updated+'개 디자인 적용':'페이지 표시 '+result.removed+'개 제거');
  }
  addButton.addEventListener('click',()=>bulk('add'));designButton.addEventListener('click',()=>bulk('design'));remove.addEventListener('click',()=>bulk('remove'));
  const auto=document.createElement('label');const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=common.autoAdd;auto.append(enabled,document.createTextNode(' 새 페이지 생성 시 자동 추가'));
  enabled.addEventListener('change',()=>{DeckCore.updateIndicatorCommon(state,item,{autoAdd:enabled.checked});persistInspectorChange();});
  options.append(addButton,designButton,remove,auto);fields.append(options);
  renderFixedIndicatorBindings(fields);
  const panel=root.querySelector('[data-inspector-icons]');
  const cards=document.createElement('div');cards.className='sdk-state-icons indicator-icon-cards';
  const buildCard=(pressed)=>{
    const card=document.createElement('div');card.className='sdk-state-icon';
    card.dataset.stateTitle=pressed?'second':'first';
    const heading=document.createElement('strong');heading.textContent=pressed?'Key Down':'Key Up';
    const image=document.createElement('div');image.className='sdk-state-preview';
    image.append(iconNode(indicatorPressVisual(displayItem(item,index),pressed),'1'));
    const buttons=document.createElement('div');buttons.className='sdk-state-buttons';
    const key=pressed?'press:down':null;
    const add=(title,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',fn);buttons.append(b);};
    add('라이브러리',()=>openIconLibrary(item,key));
    add('파일',async()=>{try{const chosen=await chooseNativeImage('image');if(chosen?.dataUrl)applyStateIconData(item,key,await rasterizeIcon(chosen.dataUrl));}catch(error){window.d200xActionStatus?.('아이콘 선택 실패: '+String(error?.message||error));}});
    add('클립보드',()=>pasteIcon(item,key));
    add('특수문자',()=>openIconMaker(item,key));
    add('초기화',()=>{
      if(pressed){if(item.settings.keyPressIcons)delete item.settings.keyPressIcons.down;}
      else {delete item.icon;if(item.settings.keyPressIcons)delete item.settings.keyPressIcons.up;}
      persistInspectorChange();render();
    });
    bindKeyBackgroundControl(image,item,pressed?'second':'default');
    card.append(heading,image,buttons);
    return {card,heading,image,buttons};
  };
  const {card,heading,image,buttons}=buildCard(false);
  // Move the already bound title controls into the same standard card as the artwork.
  // Keep the original title-line element (the shared style popover's home).
  const titleField=fields.querySelector(':scope > .title-setting-field:not(.indicator-number-field)');
  const titleLine=titleField.querySelector('.title-line');
  const titleCheck=titleField.querySelector('#title-visible');
  const titleInput=titleLine.querySelector('#key-title');
  const titleStyle=titleLine.querySelector('#title-style-trigger');
  titleLine.className='state-title-control indicator-title-row';
  titleCheck.className='state-title-visible';titleCheck.setAttribute('aria-label','제목 표시');titleCheck.title='제목 표시';
  titleInput.className='state-title-input';titleInput.placeholder='제목';
  titleStyle.classList.add('state-title-style');
  titleLine.prepend(titleCheck);
  titleField.remove();
  line.className='state-title-control indicator-number-row';
  check.className='state-title-visible';check.setAttribute('aria-label','번호 표시');check.title='번호 표시';
  text.className='state-title-input';text.setAttribute('aria-label','현재 페이지 번호');text.title='현재 페이지 번호 자동 표시';
  const name=document.createElement('span');name.className='indicator-number-label';name.textContent='번호';
  line.prepend(check,name);num.remove();
  card.append(heading,titleLine,line,image,buttons);cards.append(card);
  const down=buildCard(true);
  const downField=(field,value,visible,number)=>{
    const row=document.createElement('div');row.className='state-title-control '+(number?'indicator-number-row':'indicator-title-row');
    const check=document.createElement('input');check.type='checkbox';check.className='state-title-visible';
    check.id=number?'indicator-down-number-visible':'indicator-down-title-visible';check.checked=visible;
    check.title=number?'번호 표시':'제목 표시';check.setAttribute('aria-label','Key Down '+check.title);
    check.addEventListener('change',()=>root._setIndicatorVisible(field,check.checked));row.append(check);
    if(number){const name=document.createElement('span');name.className='indicator-number-label';name.textContent='번호';row.append(name);}
    const input=document.createElement('input');input.className='state-title-input'+(number?'':' indicator-down-title');
    input.value=value;input.readOnly=number;input.maxLength=256;input.placeholder=number?'번호':'제목';
    input.title=number?'현재 페이지 번호 자동 표시':'Key Down 제목';input.setAttribute('aria-label',input.title);
    if(!number)input.addEventListener('input',()=>{item.settings.indicatorDownTitle=input.value;persistInspectorChange();renderGrid();refreshTitlePreview(item);});
    const font=document.createElement('button');font.type='button';font.className='state-title-style';font.textContent='T⌄';
    font.title=input.title+' 글꼴 속성';font.setAttribute('aria-label',font.title);font.setAttribute('aria-expanded','false');
    font.addEventListener('click',()=>root._openIndicatorStyle(font,field));row.append(input,font);return row;
  };
  const downTitle=downField('downTitle',item.settings?.indicatorDownTitle??item.title??'',(item.settings?.indicatorDownTitleStyle||item.titleStyle)?.visible!==false,false);
  const downNumber=downField('downNumber',text.value,(common.indicatorDownNumberStyle||common.indicatorNumberStyle).visible!==false,true);
  down.card.append(down.heading,downTitle,downNumber,down.image,down.buttons);cards.append(down.card);panel.append(cards);
  void refreshStateTitleCards(item);
}
function bindExtendedActionFields(root,item){
  if(item.type==='sd-plugin'){
    root.querySelector('[data-sdk-inspector]')?.addEventListener('click',async()=>{
      const context=pluginSlotContext(item);
      if(!context)return;
      try{
        await window.deckBridge.sdkSync(sdkActionInstances());
        await window.deckBridge.sdkInspector(context);
      }catch(error){window.d200xActionStatus?.('SDK 속성 편집기 오류: '+String(error?.message||error));}
    });
  }
  if(item.type==='ha-toggle'){
    root.querySelector('[data-ha-entities]')?.addEventListener('click',async()=>{
      try{
        const session=inspectorSession;
        const entities=await window.deckBridge.haEntities();
        if(!inspectorPickerCurrent(session,item))return;
        if(!entities.length)throw new Error('제어 가능한 엔티티가 없습니다.');
        const current=item.settings?.entityId||'';
        const selected=await chooseDeckForgeEntity(entities,current);
        if(selected===null||!inspectorPickerCurrent(session,item))return;
        if(!entities.some(e=>e.entity_id===selected))throw new Error('유효한 엔티티를 선택하세요.');
        item.settings.entityId=selected;
        const input=root.querySelector('[data-field="entityId"]');if(input)input.value=selected;
        persistInspectorChange();
      }catch(error){window.d200xActionStatus?.('HA 엔티티 조회 실패: '+String(error?.message||error));}
    });
  }
  if(item.type==='audio-play')populateAudioOutputs(root.querySelector('[data-field="output"]'),item);
  if(item.type==='hotkey'||item.type==='hotkey-switch')bindHotkeyFields(root,item);
}
let hotkeyInputSerial=0;
function bindHotkeyFields(root,item){
  const api=window.DeckHotkeys;
  const names=item.type==='hotkey'?['keys']:['first','second'];
  const inputs=names.map(field=>root.querySelector('[data-field="'+field+'"]')).filter(Boolean);
  if(!inputs.length)return;
  const preset=item.type==='hotkey'?root.querySelector('[data-field="preset"]'):null;
  let mode=item.settings.hotkeyInputMode==='select'?'select':'keyboard';
  const controls=[];
  const modeRow=document.createElement('div');modeRow.className='field hotkey-mode-row';
  const modeLabel=document.createElement('label');modeLabel.textContent='입력 방식';
  const modeBox=document.createElement('div');modeBox.className='hotkey-input-modes';modeBox.setAttribute('role','group');modeBox.setAttribute('aria-label','입력 방식');
  const radioName='hotkey-mode-'+(++hotkeyInputSerial);
  for(const [value,label] of [['keyboard','키보드 입력'],['select','선택 입력']]){
    const wrap=document.createElement('label'),radio=document.createElement('input');
    radio.type='radio';radio.name=radioName;radio.value=value;radio.checked=mode===value;
    wrap.append(radio,document.createTextNode(label));modeBox.append(wrap);
    radio.addEventListener('change',()=>{
      if(!radio.checked)return;
      mode=value;item.settings.hotkeyInputMode=value;
      for(const control of controls)control.sync();
      persistInspectorChange();
    });
  }
  if(preset){
    // Retain the original field label and combine its value with the input-mode controls.
    const presetRow=preset.closest('.field');
    const combined=document.createElement('div');combined.className='hotkey-preset-mode';
    preset.before(combined);
    combined.append(preset,modeLabel,modeBox);
  }else{
    modeRow.append(modeLabel,modeBox);inputs[0].closest('.field').before(modeRow);
  }
  function applyPresetTitle(id){
    if(!id||item.type!=='hotkey')return;
    const label=HOTKEY_PRESET_LABELS.find(([key])=>key===id)?.[1];
    if(!label)return;
    // Preserve manually named titles and independent visibility/style settings.
    const eligible=value=>!value||value==='단축키'||HOTKEY_PRESET_LABELS.some(([key,name])=>key&&name===value);
    const titleFields=root.querySelectorAll('.state-title-input');
    if(eligible(item.title))item.title=label;
    if(root.id==='inspector'&&hasStateTitlePair(item)){
      const pair=ensureStateTitlePair(item);
      for(const [i,which] of ['first','second'].entries()){
        const entry=pair[which];
        if(eligible(entry.title)){
          entry.title=label;
          if(titleFields[i])titleFields[i].value=label;
        }
      }
      const hiddenTitle=root.querySelector('#key-title');if(hiddenTitle)hiddenTitle.value=item.title;
    }
  }
  function commit(node,value){
    const field=node.dataset.field;
    item.settings[field]=value;node.value=value;
    if(field==='keys'){
      const id=api.matchPreset(value,HOTKEY_PRESETS);
      item.settings.preset=id;
      if(preset)preset.value=id;
      applyPresetTitle(id);
    }
    persistInspectorChange();
    node.dispatchEvent(new Event('input',{bubbles:true}));
    renderGrid();
    if(root.id==='inspector')refreshTitlePreview(item);
  }
  inputs.forEach(node=>{
    const field=node.dataset.field;
    let parsed=api.parse(String(item.settings[field]||''));
    let selected=parsed?parsed.mods.slice():[],key=parsed?.key.id||'';
    let legacy=parsed?'':String(item.settings[field]||'');
    node.readOnly=true;node.classList.add('hotkey-capture');
    const row=node.closest('.field');
    const captureWrap=document.createElement('div');captureWrap.className='hotkey-capture-wrap';
    const notice=document.createElement('span');notice.className='hotkey-function-name';notice.setAttribute('role','status');
    node.before(captureWrap);captureWrap.append(node,notice);
    const choiceRow=document.createElement('div');choiceRow.className='field hotkey-choice-row';
    const spacer=document.createElement('span');
    const choices=document.createElement('div');choices.className='hotkey-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',field==='keys'?'단축키 선택':field==='first'?'단축키 1 선택':'단축키 2 선택');
    const buttons=[],menus=[];
    const choose=()=>{
      legacy='';
      commit(node,key?api.format(selected,key):'');
      sync();
    };
    for(const mod of api.order){
      const button=document.createElement('button');button.type='button';button.textContent=mod;
      button.className='hotkey-modifier';button.title=mod+' 선택';
      button.addEventListener('click',()=>{
        if(mode!=='select')return;
        selected=selected.includes(mod)?selected.filter(value=>value!==mod):[...selected,mod];choose();
      });
      buttons.push([mod,button]);choices.append(button);
    }
    for(const group of api.groups){
      const menu=document.createElement('select');menu.title=group.label;menu.setAttribute('aria-label',group.label);
      menu.append(new Option(group.label,''));
      let category='',target=menu;
      for(const entry of group.keys){
        if(entry.category!==category){
          category=entry.category;
          if(category){target=document.createElement('optgroup');target.label=category;menu.append(target);}
          else target=menu;
        }
        target.append(new Option(entry.label,entry.id));
      }
      menu.addEventListener('change',()=>{
        if(mode!=='select')return;
        key=menu.value;choose();
      });
      menus.push([group,menu]);choices.append(menu);
    }
    choiceRow.append(spacer,choices);row.after(choiceRow);
    function sync(){
      const raw=legacy||api.format(selected,key);
      node.value=key||legacy?api.display(raw):raw.split('+').join(' + ');
      node.title=mode==='keyboard'?'클릭한 뒤 단축키를 누르세요 · Esc 취소 · Backspace 삭제':'선택한 단축키';
      node.placeholder=mode==='keyboard'?'클릭하여 할당':'아래에서 키 선택';
      node.disabled=mode!=='keyboard';
      for(const [mod,button] of buttons){
        button.disabled=mode!=='select';button.classList.toggle('active',selected.includes(mod));
        button.setAttribute('aria-pressed',String(selected.includes(mod)));
      }
      for(const [group,menu] of menus){
        menu.disabled=mode!=='select';menu.value=group.keys.some(entry=>entry.id===key)?key:'';
      }
      const matched=key?api.matchPreset(raw,HOTKEY_PRESETS):'';
      const label=matched?HOTKEY_PRESET_LABELS.find(([id])=>id===matched)?.[1]||'':'';
      const advisory=key?api.advisory(raw,HOTKEY_PRESETS):'';
      const message=label||advisory.replace(/^Windows 전역 단축키 · /,'Windows · ');
      notice.textContent=message;notice.title=label||advisory;notice.hidden=!message;
    }
    let armed=false;
    node.addEventListener('focus',()=>{armed=mode==='keyboard';if(armed)node.placeholder='단축키를 누르세요 (Esc 취소)';});
    node.addEventListener('blur',()=>{armed=false;sync();});
    function accept(event){
      if(!armed||mode!=='keyboard')return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='Escape'&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey){node.blur();return;}
      if(event.key==='Backspace'&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey){
        selected=[];key='';legacy='';commit(node,'');node.blur();return;
      }
      const combination=api.capture(event),found=api.parse(combination);
      if(!found)return;
      selected=found.mods.slice();key=found.key.id;legacy='';
      commit(node,combination);node.blur();
    }
    node.addEventListener('keydown',accept);
    // PrintScreen can arrive only on key-up on Windows; catch it if still armed.
    node.addEventListener('keyup',event=>{if(event.code==='PrintScreen'||event.key==='PrintScreen')accept(event);});
    controls.push({sync,set(value){
      parsed=api.parse(value);selected=parsed?.mods.slice()||[];
      key=parsed?.key.id||'';legacy=parsed?'':value;commit(node,value);sync();
    }});
    // Keep the visible input read-only; generic change handlers must not save
    // display strings such as PrtSc or arrows instead of the stored key token.
    node.addEventListener('change',event=>event.stopImmediatePropagation());
    sync();
  });
  if(preset){
    const matched=api.matchPreset(String(item.settings.keys||''),HOTKEY_PRESETS);
    preset.value=matched;
    preset.addEventListener('change',()=>{
      if(preset.value&&HOTKEY_PRESETS[preset.value])controls[0].set(api.canonical(HOTKEY_PRESETS[preset.value]));
      else{item.settings.preset='';persistInspectorChange();}
    });
  }
}
async function populateAudioOutputs(select,item){
  if(!select||!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const outputs=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audiooutput');
    if(!select.isConnected)return;
    select.replaceChildren(new Option('기본 출력 장치','default'));
    for(const [index,device] of outputs.entries()){
      if(device.deviceId==='default')continue;
      select.add(new Option(device.label||'오디오 출력 '+(index+1),device.deviceId));
    }
    if(item.settings?.output&&!Array.from(select.options).some(option=>option.value===item.settings.output))
      select.add(new Option('이전에 선택한 출력 장치 (연결 안 됨)',item.settings.output));
    select.value=item.settings?.output||'default';
  }catch(error){console.warn('출력 장치 목록 조회 실패',String(error?.message||error));}
}
// Show help only for actions needing usage/limitation explanations.
const INSPECTOR_HELP={
  multi:{
    title:'순차 동작',description:'등록한 단계를 위에서 아래 순서대로 실행합니다.',
    steps:['오른쪽 액션 목록을 아래 단계 목록에 끌어놓거나 동작 추가를 사용하세요.','각 행의 지연은 동작 실행 전 대기 시간입니다. 행을 드래그하면 지연과 동작이 함께 이동합니다.','일반 실기 버튼: 처음 누르면 실행, 실행 중 짧게 누르면 일시정지, 일시정지 중 짧게 누르면 재개합니다.','실행 또는 일시정지 중 1초 이상 길게 누르면 남은 동작을 취소합니다.'],
    cautions:['복합 동작 중첩은 지원하지 않습니다.','일시정지는 남은 지연 시간을 유지합니다. 이미 실행된 동작은 되돌리지 않으며, 진행 중인 Windows 요청은 완료될 수 있습니다.']
  },
  'multi-switch':{
    title:'순차 동작 스위치',description:'상태 1과 상태 2에 서로 다른 동작 목록을 등록하고 상태에 따라 실행합니다.',
    steps:['상태 탭을 선택해 각 상태의 실행 단계를 편집하세요.','제목 연결 옵션과 상태별 아이콘·이미지를 원하는 대로 지정하세요.'],
    cautions:['단계 안에 다른 복합 동작을 중첩할 수 없습니다.','상태별 설정은 선택된 상태에만 적용됩니다.']
  },
  random:{
    title:'무작위 동작',description:'등록한 후보 중 하나를 무작위로 선택하여 실행합니다.',
    steps:['오른쪽 목록에서 후보를 끌어놓거나 동작 추가 버튼을 사용하세요.','후보 목록에서 순서와 삭제를 관리하세요.'],
    cautions:['복합 동작 중첩 및 지연 단계는 지원하지 않습니다.','후보가 없으면 실행할 동작이 없습니다.']
  },
  logic:{
    title:'Key Logic',description:'한 번 누르기, 두 번 누르기, 길게 누르기에 서로 다른 동작을 연결합니다.',
    steps:['각 입력 유형의 동작을 선택하고 아래에서 해당 설정을 입력하세요.'],
    cautions:['중첩 복합 동작은 허용되지 않습니다.','물리 입력 패턴에 따라 선택한 동작이 실행됩니다.']
  },
  timer:{
    title:'타이머',description:'정해진 지속 시간에 맞춰 타이머를 사용하고 소리를 설정합니다.',
    steps:['시·분·초를 선택하고 알림음과 음량을 설정하세요.','아이콘 카드는 대기/실행 상태를 설정합니다. 실행 중에만 남은 시간이 표시됩니다.'],
    cautions:[]
  },
  'hotkey-switch':{
    title:'단축키 전환',description:'두 개의 단축키를 번갈아 실행합니다.',
    steps:['단축키 1과 단축키 2를 각각 입력하세요.','입력칸을 클릭하고 원하는 키 조합을 누르세요.'],
    cautions:['단축키 지원 범위는 실행 중인 Windows 앱에 따라 달라집니다.']
  },
  'sd-plugin':{
    title:'플러그인 설정',description:'DeckForge에 설치된 Stream Deck SDK 호환 플러그인의 동작과 표시 상태를 설정합니다.',
    steps:['플러그인 속성 열기로 해당 플러그인의 설정을 확인하세요.','OFF/ON 이미지는 필요할 때 각 상태에 지정하세요.'],
    cautions:['지원되는 설정은 설치된 플러그인의 구현에 따라 다릅니다.']
  },
  'ha-toggle':{
    title:'Home Assistant 장치 제어',description:'선택한 Home Assistant 엔티티를 켜거나 끕니다.',
    steps:['목록에서 사용할 엔티티를 선택하고 연결 상태를 확인하세요.'],
    cautions:['Home Assistant 서버에 연결되어 있어야 동작합니다.']
  }
};
function inspectorOverview(item){
  switch(item.type){
    case 'multi':return '';
    case 'multi-switch':return '상태 1 · '+(item.sequences?.[0]?.length||0)+'개 / 상태 2 · '+(item.sequences?.[1]?.length||0)+'개';
    case 'random':return (item.children?.length||0)+'개의 후보';
    case 'timer':return '지속 시간 및 사운드 설정';
    case 'logic':return '한 번 · 두 번 · 길게 누르기';
    case 'gesture-test':return '싱글 · 더블 · 롱 터치 · 실제 명령 실행 없음';
    default:return '';
  }
}
function appendInspectorHelp(head,item){
  const help=INSPECTOR_HELP[item.type];if(!help)return;
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='inspector-help-trigger';
  trigger.textContent='?';trigger.title=help.title+' 설명';trigger.setAttribute('aria-label',help.title+' 도움말');
  const dialog=document.createElement('dialog');dialog.className='inspector-help-dialog';
  const heading=document.createElement('strong');heading.textContent=help.title;
  const description=document.createElement('p');description.textContent=help.description;
  const addItems=(headingText,items)=>{
    if(!items.length)return;
    const h=document.createElement('h3');h.textContent=headingText;
    const list=document.createElement('ul');
    for(const text of items){const li=document.createElement('li');li.textContent=text;list.append(li);}
    dialog.append(h,list);
  };
  dialog.append(heading,description);
  addItems('사용 방법',help.steps);
  addItems('참고 사항',help.cautions);
  const close=document.createElement('button');close.type='button';close.className='inspector-help-close';close.textContent='닫기';
  close.addEventListener('click',()=>dialog.close());
  dialog.append(close);
  dialog.addEventListener('close',()=>dialog.remove());
  trigger.addEventListener('click',()=>{
    if(!dialog.isConnected)document.body.append(dialog);
    dialog.showModal();
  });
  const test=head.querySelector('.action-preview-test');
  if(test)head.insertBefore(trigger,test);else head.append(trigger);
}
let lastInspectorPreviewItem=null;
let timerSoundPreview=null;
function stopTimerSoundPreview(record=timerSoundPreview){
  if(!record||timerSoundPreview!==record)return;
  timerSoundPreview=null;
  record.signal?.removeEventListener('abort',record.cancel);
  record.button.textContent='▶';record.button.title='미리듣기';record.button.setAttribute('aria-label','미리듣기');
  try{record.stop?.();}catch{}
}
async function toggleTimerSoundPreview(settings,button,signal){
  if(timerSoundPreview){const same=timerSoundPreview.button===button;stopTimerSoundPreview();if(same)return;}
  if(signal?.aborted||!timerVolume(settings)||settings.sound==='none')return;
  const record={button,signal,cancel:null,stop:null};timerSoundPreview=record;
  record.cancel=()=>stopTimerSoundPreview(record);signal?.addEventListener('abort',record.cancel,{once:true});
  button.textContent='■';button.title='미리듣기 정지';button.setAttribute('aria-label','미리듣기 정지');
  try{
    if(settings.sound==='custom'){
      if(!settings.soundFile)throw Error('사용자 알림음 파일을 선택하세요.');
      const url=await window.deckBridge.audioFileUrl(settings.soundFile);
      if(timerSoundPreview!==record)return;
      const audio=new Audio(url);audio.volume=timerVolume(settings)/100;
      record.stop=()=>{audio.pause();audio.removeAttribute('src');audio.load();};
      audio.addEventListener('ended',record.cancel,{once:true});
      audio.addEventListener('error',record.cancel,{once:true});
      await audio.play();
    }else{
      await playTimerChime(settings.sound||'connect',timerVolume(settings),record);
      stopTimerSoundPreview(record);
    }
  }catch(error){if(timerSoundPreview===record){stopTimerSoundPreview(record);window.d200xActionStatus?.('타이머 미리듣기 실패: '+String(error?.message||error));}}
}

function renderTimerSettings(item,root){
  const area=document.createElement('div');area.className='timer-settings';
  const durationRow=document.createElement('div');durationRow.className='timer-duration-row';
  const label=document.createElement('label');label.textContent='지속 시간';durationRow.append(label);
  const parts=[];
  for(const [unit,max] of [['시',24],['분',59],['초',59]]){
    const select=document.createElement('select');select.setAttribute('aria-label',unit);
    for(let i=0;i<=max;i++)select.add(new Option(String(i).padStart(2,'0'),String(i)));
    const suffix=document.createElement('span');suffix.textContent=unit;durationRow.append(select,suffix);parts.push(select);
  }
  const updateTitle=()=>{
    const seconds=DeckCore.timerSeconds(item.settings.seconds),title=DeckCore.formatTimerTime(seconds,seconds);
    const card=root.querySelector('.sdk-state-icon[data-state-title="second"] .state-title-input');if(card)card.value=title;
    if(item.settings.stateTitles)item.settings.stateTitles.second.title=title;
    persistInspectorChange();renderGrid();refreshTitlePreview(item);
  };
  const sync=()=>{const n=DeckCore.timerSeconds(item.settings.seconds);parts[0].value=String(Math.floor(n/3600));parts[1].value=String(Math.floor(n/60)%60);parts[2].value=String(n%60);for(const select of parts.slice(1))select.disabled=n===86400;};
  for(const select of parts)select.addEventListener('change',()=>{const [h,m,s]=parts.map(x=>Number(x.value));item.settings.seconds=Math.max(1,Math.min(86400,h*3600+m*60+s));sync();updateTitle();});
  sync();area.append(durationRow);
  const soundRow=document.createElement('div');soundRow.className='timer-sound-row';
  const soundLabel=document.createElement('label');soundLabel.textContent='알림음';
  const sound=document.createElement('select');sound.title='내장 또는 사용자 지정 알림음';
  for(const [id,name] of [['none','없음'],['connect','접속'],['disconnect','접속 끊김'],['release','접속 해제'],['find','찾기'],['other','기타'],['custom','사용자 지정']])sound.add(new Option(name,id));
  sound.value=item.settings.sound||'connect';
  if(!sound.value)sound.value='connect';
  const btn=(name,glyph,fn)=>{const b=document.createElement('button');b.type='button';b.title=name;b.setAttribute('aria-label',name);b.textContent=glyph;b.addEventListener('click',fn);return b;};
  const choose=btn('MP3/WAV 파일 선택','▱',async()=>{
    try{const session=inspectorSession,path=await window.deckBridge?.choosePath('audio');if(!path||!inspectorPickerCurrent(session,item))return;if(!/\.(mp3|wav)$/i.test(path))throw Error('MP3 또는 WAV 파일을 선택하세요.');stopTimerSoundPreview();item.settings.soundFile=path;item.settings.sound='custom';sound.value='custom';persistInspectorChange();syncSound();}
    catch(e){window.d200xActionStatus?.(String(e?.message||e));}
  });
  const listen=btn('미리듣기','▶',()=>void toggleTimerSoundPreview({...item.settings},listen,inspectorListener.signal));
  const volume=btn('음량','♪',()=>{volumePanel.hidden=!volumePanel.hidden;if(!volumePanel.hidden)slider.focus();});
  setSmallActionIcon(choose,'folder');setSmallActionIcon(volume,'volume');
  const volumePanel=document.createElement('div');volumePanel.className='timer-volume-popup';volumePanel.hidden=true;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.value=String(timerVolume(item.settings));slider.setAttribute('aria-label','알림음 음량');
  const amount=document.createElement('output');
  const syncSound=()=>{choose.title=item.settings.soundFile||'MP3/WAV 파일 선택';sound.title=sound.value==='custom'?choose.title:'내장 알림음';listen.disabled=sound.value==='none'||sound.value==='custom'&&!item.settings.soundFile;volume.title='음량 '+timerVolume(item.settings)+'%';amount.textContent=timerVolume(item.settings)+'%';};
  sound.addEventListener('change',()=>{stopTimerSoundPreview();item.settings.sound=sound.value;persistInspectorChange();syncSound();});
  slider.addEventListener('input',()=>{item.settings.soundVolume=Number(slider.value);syncSound();persistInspectorChange();});
  volumePanel.append(slider,amount);soundRow.append(soundLabel,sound,choose,listen,volume,volumePanel);area.append(soundRow);syncSound();
  root.querySelector('.fields')?.append(area);
}

function renderInspector(){
  beginInspectorSession();
  inspectorListener.abort();inspectorListener=new AbortController();
  const rootItem=state.selected===null?null:state.selected>=14?null:DeckCore.visibleActions(state)[state.selected];
  const item=pressIsOrdinary(rootItem)&&state.selected<13?
    pressSlotAction(rootItem,activePressTab):rootItem;
  if(item!==lastInspectorPreviewItem){
    if(lastInspectorPreviewItem)haPreviewStates.delete(lastInspectorPreviewItem);
    lastInspectorPreviewItem=item;
  }
  if(state.selected!==null&&state.selected>=14){
    renderControlInspector();
    return;
  }
  const root=$("inspector");root.replaceChildren();
  if(state.selected===13&&wideDisplayAvailable()){renderWideInspector();return;}
  if(!item){
    if(pressIsOrdinary(rootItem)&&state.selected<13){
      root.className='inspector action-layout-inspector press-empty-inspector press-gesture-inspector';
      root.innerHTML='<div class="press-empty-message">오른쪽 목록의 액션을 이 속성창 또는 위의 누르기 탭으로 끌어놓으세요.</div>';
      const visual=document.createElement('div');visual.className='inspector-visual-placeholder';visual.setAttribute('aria-hidden','true');
      root.querySelector('.press-empty-message').before(visual);
      appendInspectorSaveBar(root);
      const toolbar=document.createElement('div');toolbar.className='state-title-toolbar action-layout-toolbar';
      const saveBar=root.querySelector('.inspector-footer-region');
      if(saveBar)toolbar.append(saveBar);
      root.prepend(toolbar);renderPressTabs(rootItem,root);return;
    }
    root.className="inspector empty";root.textContent=state.selected===null?"버튼을 선택하세요":"액션을 끌어 이 키에 놓으세요";
    if(inspectorSession?.dirty)appendInspectorSaveBar(root);return;
  }
  root.className="inspector action-layout-inspector"+(pressIsOrdinary(rootItem)&&state.selected<13?' press-gesture-inspector':'')+(item.type==='text'?' text-inspector':'')+(item.type==='hotkey-switch'?' hotkey-switch-inspector':'')+(item.type==='sd-plugin'?' sdk-plugin-inspector':'')+(hasStateTitlePair(item)||item.type==='indicator'?' state-title-inspector':'')+(item.type==='indicator'?' indicator-inspector':'');
  const action=ACTIONS.get(item.type),fields=item.type==='timer'?'':actionFields(item);
  const sdkName=item.type==='sd-plugin'
    ?(item.settings?.actionUUID===HA_CUSTOM_ACTION?'Home Assistant 장치 제어':
      sdkActionNames.get(item.settings?.actionUUID)||item.settings?.actionName||item.settings?.actionUUID||'설치된 플러그인')
    :null;
  const inspectorName=sdkName||action?.label;
  root.innerHTML=`<div class="action-head inspector-title-region"></div>
    <div class="properties inspector-properties-region"><div class="preview"><div class="preview-key" id="icon-preview">
      <span id="icon-preview-content"></span>
      <button class="icon-preview-control icon-preview-plus" type="button" id="icon-library-open" aria-label="아이콘 라이브러리 열기" title="아이콘 라이브러리">+</button>
      <button class="icon-preview-control icon-preview-menu" type="button" id="icon-menu-trigger" aria-label="아이콘 변경 메뉴" aria-expanded="false" aria-controls="icon-dropdown" title="아이콘 메뉴">⌄</button>
    </div>
    <div class="icon-dropdown" id="icon-dropdown" role="menu" hidden>
      <button type="button" data-icon-command="library">아이콘</button>
      <button type="button" data-icon-command="file">파일에서 설정</button>
      <button type="button" data-icon-command="paste">클립보드에서 붙여넣기</button>
      <button type="button" data-icon-command="new">새로운 아이콘</button>
      <button type="button" data-icon-command="library">DeckForge 아이콘 라이브러리 열기</button>
    </div></div>
    <div class="fields"><div class="field title-setting-field"><label class="title-visible-label"><input type="checkbox" id="title-visible"> 제목 표시</label>
      <div class="title-line"><input id="key-title" title="&lt;br&gt;로 강제 줄바꿈" value="${escapeHtml(item.title)}">
      <button type="button" class="title-style-trigger" id="title-style-trigger" aria-label="제목 글꼴 속성" aria-expanded="false" aria-controls="title-style-popover">T⌄</button>
      <div class="title-style-popover" id="title-style-popover" hidden>
         <div class="title-align" role="group" aria-label="제목 정렬">
          <button type="button" data-align="bottom" title="아래쪽 배치" aria-label="아래쪽 배치"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".7"/><path d="M7 11h10 M7 14h10 M7 17h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
          <button type="button" data-align="middle" title="가운데 배치" aria-label="가운데 배치"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".7"/><path d="M7 9h10 M7 12h10 M7 15h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
          <button type="button" data-align="top" title="위쪽 배치" aria-label="위쪽 배치"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".7"/><path d="M7 7h10 M7 10h10 M7 13h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
        </div>
        <select id="title-family" aria-label="글꼴"><option value="default">기본 (Pretendard)</option><option value="DeckForge Pretendard">Pretendard</option><option value="Malgun Gothic">맑은 고딕</option><option value="Segoe UI">Segoe UI</option></select>
         <div class="title-preset-row">
          <select id="title-preset-select" aria-label="저장한 제목 스타일 프리셋"></select>
          <button type="button" id="title-preset-save" title="현재 제목 스타일을 프리셋으로 저장" aria-label="현재 스타일 프리셋 저장">＋</button>
          <button type="button" id="title-preset-delete" title="선택한 프리셋 삭제" aria-label="선택한 프리셋 삭제">−</button>
        </div>
        <div class="title-format"><input id="title-size" type="number" min="8" max="48" aria-label="글꼴 크기">
        <button type="button" data-style="bold" aria-label="굵게">B</button><button type="button" data-style="italic" aria-label="기울임">I</button><button type="button" data-style="underline" aria-label="밑줄">U</button>
        <input id="title-color" type="color" aria-label="글꼴 색상">
        <button type="button" id="title-color-palette" class="title-palette-open" title="색상 팔레트">${PALETTE_ICON}</button></div>
        <div class="outline-settings">
          <span>외곽선</span>
          <select id="outline-width" aria-label="외곽선 두께">
            <option value="none">없음</option><option value="thin">얇게</option>
            <option value="medium">보통</option><option value="thick">두껍게</option>
          </select>
          <input id="outline-color" type="color" aria-label="외곽선 색상">
          <button type="button" id="outline-color-palette" class="title-palette-open" title="외곽선 색상 팔레트">${PALETTE_ICON}</button>
        </div>
        <div class="title-background-settings">
          <div class="outline-settings">
            <label><input type="checkbox" id="title-background-enabled"> 제목 배경</label>
            <input id="title-background-color" type="color" aria-label="제목 배경색">
            <button type="button" id="title-background-color-palette" class="title-palette-open" title="제목 배경색 팔레트">${PALETTE_ICON}</button>
          </div>
          <div class="title-background-opacity"><span>불투명도</span><input id="title-background-opacity" type="range" min="0" max="100" step="1" aria-label="제목 배경 불투명도"><output id="title-background-opacity-value">65%</output></div>
        </div>
        <div id="title-palette" class="title-palette" hidden>${sharedPaletteMarkup('title-palette','글자 색상')}</div>
        <button type="button" class="style-reset" id="title-reset" title="기본 스타일 복원">↺</button>
      </div></div></div>${fields}</div></div><section class="inspector-icon-section" data-inspector-icons aria-label="버튼 아이콘 설정"></section>`;
  const previewButton=document.createElement('button');previewButton.type='button';
  previewButton.textContent='▶ 실행 테스트';previewButton.className='action-preview-test';
  previewButton.title='실제 Windows/D200X 동작을 한 번 실행합니다';
  previewButton.addEventListener('click',()=>runActionPreview('down'));
  if(item.type==='gesture-test'){
    previewButton.disabled=true;previewButton.textContent='D200X 실기로 검증';
    previewButton.title='테스트 결과는 D200X 화면에서 직접 터치해야 기록됩니다';
  }
  root.querySelector('.action-head').append(previewButton);
  // The unused upper-left '?' inspector help button is intentionally omitted.
  const overview=inspectorOverview(item);
  if(overview){
    const mainFields=root.querySelector('.properties>.fields');
    const first=mainFields?.querySelector('.field');
    if(mainFields&&first){
      const line=document.createElement('div');line.className='field inspector-overview';
      const label=document.createElement('label');label.textContent='요약';
      const content=document.createElement('span');content.textContent=overview;
      line.append(label,content);first.after(line);
    }
  }
  if(item.type==='sd-plugin'){
    const titleLine=root.querySelector('.title-line');
    const controls=document.createElement('div');controls.className='sdk-title-controls';
    titleLine.before(controls);controls.append(titleLine);
    const settingsButton=document.createElement('button');settingsButton.type='button';
    settingsButton.className='sdk-settings-open';settingsButton.dataset.sdkInspector='';
    settingsButton.textContent='⚙ 플러그인 속성 열기';
    controls.append(settingsButton);
    if(isFusionAction(item)){
      const row=document.createElement('div');row.className='field fusion-title-language';
      const label=document.createElement('label');label.textContent='표시 언어';label.htmlFor='fusion-title-language';
      const select=document.createElement('select');select.id='fusion-title-language';
      for(const [value,name] of [['follow','관리자 언어 따라가기'],['ko','한국어 고정'],['en','English 고정']]){
        const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);
      }
      select.value=['ko','en'].includes(item.settings.fusionTitleLanguage)?item.settings.fusionTitleLanguage:'follow';
      select.addEventListener('change',()=>{
        item.settings.fusionTitleLanguage=select.value;
        persistInspectorChange();renderGrid();refreshTitlePreview(item);void refreshStateTitleCards(item);
      });
      row.append(label,select);root.querySelector('.properties>.fields').append(row);
    }
  }
  bindTitleStyle(item);
  bindIconControls(item);
  if(item.type==='indicator')bindIndicatorInspector(root,item);
  refreshTitlePreview(item);
  $("key-title").addEventListener("input",ev=>{item.title=ev.target.value;persist();renderGrid();refreshTitlePreview(item);});
  bindExtendedActionFields(root,item);
  if(item.type==='website'){
    const url=root.querySelector('[data-field="url"]');
    const toggle=root.querySelector('#url-https');
    const sync=()=>{
      const raw=url.value.trim();
      if(!raw)return;
      if(/^https?:\/\//i.test(raw))toggle.checked=/^https:\/\//i.test(raw);
      const normalized=/^https?:\/\//i.test(raw)?raw:(toggle.checked?'https://':'http://')+raw;
      url.value=normalized;item.settings.url=normalized;persistInspectorChange();
    };
    url.addEventListener('blur',sync);
    toggle.addEventListener('change',()=>{
      const raw=url.value.trim();
      if(!raw)return;
      const next=(toggle.checked?'https://':'http://')+raw.replace(/^https?:\/\//i,'');
      url.value=next;item.settings.url=next;persistInspectorChange();
    });
  }
  bindShortcutOptionPreviews(root,item);
  groupCompactActionFields(root,item.type);
  bindInspectorShortcut(root,item);
  root.querySelectorAll("[data-path-picker]").forEach(button=>{
    button.addEventListener("click",async()=>{
      if(!window.deckBridge?.choosePath){
        alert("파일 선택은 Windows 편집기 EXE에서 지원합니다.");return;
      }
      const field=button.dataset.pathPicker;
      try{
        const folderPicker=item.type==='folder-shortcut'&&field==='path';
        const session=inspectorSession;
        const selected=await window.deckBridge.choosePath(button.dataset.pathKind);
        if(!selected)return;
        if(inspectorSession!==session||!isCurrentInspectorAction(item))return;
        const inputNode=root.querySelector('[data-field="'+field+'"]');
        item.settings[field]=selected;
        if(inputNode){
          inputNode.value=selected;
          if(folderPicker)inputNode.title=inputNode.value;
        }
        persistInspectorChange();
        if(['open','open-app','file-open'].includes(item.type)&&['path','app'].includes(field))
          void updateApplicationArtwork(item,selected,session).catch(error=>window.d200xActionStatus?.('프로그램 아이콘 추출 실패: '+String(error?.message||error)));
      }catch(error){alert("파일 선택 오류: "+String(error?.message||error));}
    });
  });
  root.querySelectorAll("[data-field]").forEach(node=>{
    node.addEventListener(node.type==="range"||node.tagName==="TEXTAREA"?"input":"change",()=>{
      let value=node.type==="checkbox"?fieldChecked(node):node.type==="number"||node.type==="range"?Number(node.value):node.value;
      item.settings[node.dataset.field]=value;
      if(item.type==='system-scroll'&&node.dataset.field==='axis')
        item.settings.direction=value==='horizontal'?'right':'down';
      if(item.type==='audio-play')persistInspectorChange();else persist();
      if(item.type==='system-scroll'&&node.dataset.field==='axis')renderInspector();
      if(item.type==='audio-play'&&node.dataset.field==='volume'){
        $("volume-display").textContent=String(value);
        updateActiveAudioVolume(item.settings,value);
      }
      if(node.dataset.field==="body"){
        if($("text-count")) $("text-count").textContent=String(value.length)+" / -";
        if(item.type==='text'){renderGrid();refreshTitlePreview(item);}
      }
    });
  });
  if(item.type==='timer')renderTimerSettings(item,root);
  if(['multi','multi-switch','random'].includes(item.type))renderMultiEditor(item,root);
  if(item.type==='logic')renderLogicEditor(item,root);
  if(item.type==='gesture-test')renderGestureTestEditor(item,root);
  if(item.type==='folder')renderFolderInspector(item,root);
  // Preserve the original bound icon cards/preview; adjust only their surrounding toolbar.
  bindSdkStateIcons(root,item);
  bindKeyPressIconControls(root,item);
  appendInspectorSaveBar(root);
  // Move already-bound DOM nodes, preserving settings, event handlers and both cards.
  const properties=root.querySelector('.inspector-properties-region');
  const fieldsHost=properties.querySelector('.fields');
  const toolbar=document.createElement('div');toolbar.className='state-title-toolbar action-layout-toolbar';
  const options=document.createElement('div');options.className='action-layout-options';
  for(const option of Array.from(fieldsHost.querySelectorAll('.checkbox-setting-field'))){
    if(option.closest('.multi-action-editor,.logic-editor'))continue;
    const parent=option.parentElement;
    if(parent!==fieldsHost&&!parent.classList.contains('compact-property-group'))continue;
    const checkbox=option.querySelector('input[type="checkbox"]');
    if(!checkbox)continue;
    option.classList.add('action-layout-option');
    option.prepend(checkbox);
    options.append(option);
    if(parent.classList.contains('compact-property-group')&&parent.children.length<=1){
      parent.before(...Array.from(parent.children));parent.remove();
    }
  }
  const pluginButton=root.querySelector('.sdk-settings-open');
  if(pluginButton)options.append(pluginButton);
  const saveBar=root.querySelector('.inspector-footer-region');
  const ordinaryPress=pressIsOrdinary(rootItem)&&state.selected<13;
  // Move existing option controls below the image row to reserve this toolbar
  // for three gesture tabs on the left and Cancel/Save on the right.
  if(ordinaryPress){if(options.childElementCount)properties.prepend(options);}
  else toolbar.append(options);
  if(saveBar)toolbar.append(saveBar);
  const preview=properties.querySelector(':scope > .preview');
  const iconRegion=root.querySelector('.inspector-icon-section');
  if(preview){
    const card=document.createElement('div');card.className='action-preview-card';
    const title=document.createElement('strong');title.textContent='미리보기';
    card.append(title,...Array.from(preview.children));
    preview.append(card,previewButton);
    if(item.type==='multi'){
      const stop=document.createElement('button');stop.type='button';stop.className='ordered-multi-stop';stop.textContent='■ 실행 중단';
      stop.addEventListener('click',()=>{runningMultiProgress.get(DeckCore.runtimeActionKey(state,state.selected,'down'))?.controller.abort();refreshMultiRunControls();});
      preview.append(stop);refreshMultiRunControls();
    }
    if((hasStateTitlePair(item)||item.type==='indicator')&&iconRegion){
      const layout=document.createElement('div');layout.className='state-title-layout';
      // Keep the bound Key Up/Key Down cards together, then the original preview/test.
      layout.append(iconRegion,preview);
      properties.before(toolbar,layout);
      properties.classList.add('state-title-extra-properties');
    }else{
      // Single-image actions retain their own title editor and no extra icon cards.
      const layout=document.createElement('div');layout.className='properties inspector-properties-region action-single-visual';
      const titleFields=document.createElement('div');titleFields.className='fields';
      const titleSetting=fieldsHost.querySelector(':scope > .title-setting-field');
      if(titleSetting)titleFields.append(titleSetting);
      // Single-icon actions have no Key Up/Down pair; keep their existing
      // title editor while aligning the same-size preview/test on the right.
      layout.append(titleFields,preview);
      properties.before(toolbar,layout);
      properties.classList.add('action-single-extra');
    }
  }
  if(ordinaryPress)renderPressTabs(rootItem,root);
  const actionHeader=root.querySelector('.action-head');
  if(actionHeader&&!actionHeader.childElementCount)actionHeader.remove();
  if(item.type==='folder-shortcut'){
    const pathInput=properties.querySelector('[data-field="path"]');
    if(pathInput){
      pathInput.placeholder='폴더 선택';
      pathInput.title=pathInput.value;
      pathInput.addEventListener('input',()=>{pathInput.title=pathInput.value;});
    }
  }
}
function bindInspectorActionDrop(){
  const inspector=$('inspector');
  const isActionDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('application/x-d200x-action');
  const acceptsAction=()=>{
    const index=state.selected;
    if(!Number.isInteger(index)||index<0||index>=13)return false;
    const current=DeckCore.visibleActions(state)[index];
    // Keep folders, SDK, Key Logic and other specialist editors unchanged.
    return !current||pressIsOrdinary(current);
  };
  inspector.addEventListener('dragover',event=>{
    if(!isActionDrag(event)||!acceptsAction())return;
    event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
    inspector.classList.add('inspector-action-drop-over');
  });
  inspector.addEventListener('dragleave',event=>{
    if(!inspector.contains(event.relatedTarget))
      inspector.classList.remove('inspector-action-drop-over');
  });
  inspector.addEventListener('drop',event=>{
    inspector.classList.remove('inspector-action-drop-over');
    if(!isActionDrag(event)||!acceptsAction())return;
    // Gesture tabs already target their own slots and stop propagation.
    if(event.target.closest?.('.press-tab-tile'))return;
    const id=event.dataTransfer?.getData('application/x-d200x-action');
    if(!isAssignableAction(id))return;
    event.preventDefault();event.stopPropagation();
    setPressSlot(state.selected,activePressTab,newAction(id),true);
  });
  document.addEventListener('dragend',()=>inspector.classList.remove('inspector-action-drop-over'),true);
}
async function importSlotAction(index){
  if(reservedWideSlot(index))return window.d200xActionStatus?.('가로 화면에는 액션을 불러올 수 없습니다.');
  try{
    if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서만 액션을 불러올 수 있습니다.');
    const chosen=await window.deckBridge.chooseImportFile('action');
    if(!chosen)return;
    const parsed=JSON.parse(chosen.text);
    if(parsed?.format!=='d200x-action-v1')throw Error('D200X 액션 파일 형식이 아닙니다.');
    const action=DeckCore.cleanAction(parsed.action);
    if(!action)throw Error('지원되지 않는 액션입니다.');
    if(DeckCore.visibleActions(state)[index]&&!confirm('현재 버튼의 액션을 가져온 액션으로 교체하시겠습니까?'))return;
    setItem(index,action);
  }catch(error){window.d200xActionStatus?.('동작 불러오기 실패: '+String(error?.message||error));}
}
function exportSlotAction(action){
  try{
    const safe=DeckCore.cleanAction(action);
    if(!safe)throw Error('내보낼 수 없는 액션입니다.');
    const blob=new Blob([JSON.stringify({format:'d200x-action-v1',action:safe},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='D200X-action.json';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){window.d200xActionStatus?.('동작 내보내기 실패: '+String(error?.message||error));}
}
function canCutSlot(index){
  return Number.isInteger(index)&&index>=0&&index<13&&Boolean(currentPage()?.[index])&&
    (Boolean(state.folderPath?.length)||!state.pinned?.[index]);
}
function cutClipboardAction(index){
  if(!canCutSlot(index))return false;
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>cutClipboardAction(index));return false;}
  const page=currentPage(),item=page[index],previousClipboard=clipboard,previousSelected=state.selected;
  clipboard=clone(item);
  page[index]=null;state.selected=index;
  if(!persist()){
    page[index]=item;state.selected=previousSelected;clipboard=previousClipboard;
    render();return false;
  }
  clearOldSdkVisual(index);render();return true;
}
function pasteClipboardAction(index){
  if(!clipboard||!Number.isInteger(index)||index<0||index>=14||reservedWideSlot(index))return false;
  const existing=DeckCore.visibleActions(state)[index];
  if(existing&&!confirm('이 버튼의 기존 액션을 복사한 액션으로 교체하시겠습니까?'))return false;
  setItem(index,clone(clipboard));
  return true;
}
function showMenu(index,x,y){
  if(reservedWideSlot(index)){
    $("key-menu").hidden=true;
    state.selected=index;renderInspector();
    window.d200xActionStatus?.('가로 버튼은 화면 표시 전용입니다. 액션은 등록할 수 없습니다.');
    return;
  }
  const menu=$("key-menu");menu.replaceChildren();
  const item=DeckCore.visibleActions(state)[index];
  const add=(label,handler)=>{const b=document.createElement("button");b.type="button";b.role="menuitem";b.textContent=label;
    if(typeof handler==='function')b.addEventListener("click",()=>{menu.hidden=true;handler();});
    else{b.disabled=true;b.title=label.startsWith("붙여넣기")?"먼저 액션을 복사하세요.":"아직 구현되지 않은 기능입니다.";}menu.append(b);};
  const divider=()=>menu.append(document.createElement("hr"));
  if(!item){
    add("폴더 생성",()=>setItem(index,newAction("folder")));
    add("순차 동작 생성",()=>setItem(index,newAction("multi")));
    add("Key Logic 동작 생성",()=>setItem(index,newAction("logic")));
    divider();
    add("붙여넣기　Ctrl+V",clipboard?()=>pasteClipboardAction(index):null);
    add("동작 불러오기…",()=>importSlotAction(index));
  }else{
    const isLocal=Boolean(currentPage()[index]);
    if(!state.folderPath?.length&&item.type!=='indicator')add(state.pinned?.[index]?"고정 해제":"고정",()=>{
      if(state.pinned?.[index])clearOldSdkVisual(index);
      if(DeckCore.togglePinned(state,index)){persist();render();}
    });
    add("잘라내기　Ctrl+X",canCutSlot(index)?()=>cutClipboardAction(index):null);
    add("복사하기　Ctrl+C",()=>{clipboard=clone(item);});
    add("붙여넣기　Ctrl+V",clipboard?()=>pasteClipboardAction(index):null);
    add("폴더로 이동",isLocal?()=>{
      if(item.type==='folder')return;
      const folder=newAction('folder');folder.children=[DeckCore.cleanAction(item)];
      setItem(index,folder);
    }:null);
    add("Key Logic으로 이동",isLocal&&!['folder','logic','multi','multi-switch','random'].includes(item.type)?()=>{
      const logic=newAction('logic');logic.slots={single:DeckCore.cleanAction(item),double:null,hold:null};
      setItem(index,logic);
    }:null);
    divider();
    add("동작 불러오기…",()=>importSlotAction(index));
    add("동작 내보내기…",()=>exportSlotAction(item));
    divider();
    add("버튼 초기화",isLocal?()=>removeSlotAction(index):null);
    if(!state.folderPath?.length&&state.pinned?.[index])add("고정 버튼 초기화",()=>{
      const reset=()=>{
        if(!confirm('이 위치의 모든 페이지 고정 설정만 초기화할까요? 페이지별 설정은 유지됩니다.'))return;
        const before=clone(state);clearOldSdkVisual(index);state.pinned[index]=null;inspectorSession=null;
        if(!persist())state=before;render();
      };
      if(inspectorSession?.dirty)showInspectorLeaveDialog(reset);else reset();
    });
    add("삭제",()=>removeSlotAction(index));
  }
  menu.style.left=Math.max(0,Math.min(x,window.innerWidth-230))+"px";
  menu.style.top=Math.max(0,Math.min(y,window.innerHeight-415))+"px";
  menu.hidden=false;
}
let clipboard=null;
window.addEventListener("click",ev=>{if(!ev.target.closest("#key-menu"))$("key-menu").hidden=true;});
window.addEventListener("keydown",ev=>{
  if(ev.key==="Escape")$("key-menu").hidden=true;
  if(!ev.ctrlKey||ev.altKey||ev.metaKey||(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable))return;
  const key=ev.key.toLowerCase(),index=state.selected;
  if(index===null||index<0||index>=14||reservedWideSlot(index))return;
  if(key==="x"&&canCutSlot(index)){
    ev.preventDefault();cutClipboardAction(index);
  }else if(key==="c"){
    const item=DeckCore.visibleActions(state)[index];
    if(item){ev.preventDefault();clipboard=clone(item);}
  }else if(key==="v"&&clipboard){
    ev.preventDefault();pasteClipboardAction(index);
  }
});
const actionSearch=$("action-search"),actionSearchClear=$("action-search-clear");
function updateActionSearch(){
  actionSearchClear.hidden=!actionSearch.value;
  renderLibrary();
}
actionSearch.addEventListener("input",updateActionSearch);
actionSearchClear.addEventListener("click",()=>{
  actionSearch.value='';updateActionSearch();actionSearch.focus();
});
function pageStructureInfo(){
  const folder=DeckCore.activeFolder(state);
  return {folder,index:folder?(folder.pageIndex||0):state.page,count:folder?DeckCore.folderPageCount(state):state.pages.length};
}
function applyPageStructure(op,index,to){
  // The existing unsaved dialog owns the draft. No page changes while a
  // location-keyed execution is active, so no other button inherits its state.
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>applyPageStructure(op,index,to));return;}
  if(inspectorEditing||profileStorageFailure||nativeGridBusy||nativeGridDrag||openAppHoldTimers.size||
    runningMultiActions.size||activeActionTimers.size||allPlayingAudio.size||knobPresses.size||logicPresses.size||
    multiPhysicalPresses.size||sidePressTimers.size){
    window.d200xActionStatus?.('진행 중인 동작이나 저장 문제를 먼저 해결하세요.');return;
  }
  const info=pageStructureInfo();
  if(['append','insert','duplicate'].includes(op)&&info.count>=10){
    window.d200xActionStatus?.('새 페이지는 최대 10개입니다. 기존 페이지는 보존됩니다.');return;
  }
  if(op==='delete'){
    if(info.count<=1)return;
    if(!confirm('현재 '+(info.folder?'폴더 ':'')+'페이지 '+(info.index+1)+'을(를) 삭제하시겠습니까? 해당 페이지의 액션은 삭제되고, 삭제된 이동 대상은 대상 없음으로 표시됩니다.'))return;
  }
  // Work on a detached snapshot. On storage failure do not change live data or UI.
  const before=state,session=inspectorSession,next=clone(state);
  if(!DeckCore.editPageStructure(next,{op,index,to,folder:DeckCore.activeFolder(next)}))return;
  state=next;inspectorSession=null;
  if(!persist(false)){state=before;inspectorSession=session;return;}
  cancelFolderAutoExit();lastHardwareDown.clear();
  hotkeySwitchPositions.clear();clearMultiPhysicalPresses();
  clearOpenAppHoldTimers('page-structure');invalidateSidePresses();
  // Force fresh SDK registration so an old context cannot write settings into
  // a different action now occupying the same numbered page/slot.
  pageStructureEpoch++;
  sdkVisuals.clear();fusionLiveContexts.clear();fusionOfflineContexts.clear();unverifiedFusionContexts.clear();
  render();window.scheduleDeckSync?.(0);
  window.d200xActionStatus?.('페이지 구성 저장 완료');
}
$("add-page").addEventListener("click",()=>applyPageStructure('append'));
$("delete-page").addEventListener("click",()=>applyPageStructure('delete',pageStructureInfo().index));
$("page-label").title='우클릭하여 페이지 관리';
$("page-label").addEventListener('contextmenu',event=>{
  event.preventDefault();
  const {index,count}=pageStructureInfo(),menu=$('key-menu');menu.replaceChildren();
  const add=(label,enabled,fn)=>{
    const button=document.createElement('button');button.type='button';button.role='menuitem';button.textContent=label;button.disabled=!enabled;
    button.addEventListener('click',()=>{menu.hidden=true;fn();});menu.append(button);
  };
  add('앞에 빈 페이지 삽입',count<10,()=>applyPageStructure('insert',index));
  add('뒤에 빈 페이지 삽입',count<10,()=>applyPageStructure('insert',index+1));
  add('이전 위치로 이동',index>0,()=>applyPageStructure('move',index,index-1));
  add('다음 위치로 이동',index<count-1,()=>applyPageStructure('move',index,index+1));
  add('현재 페이지 복제',count<10,()=>applyPageStructure('duplicate',index));
  menu.style.left=Math.max(0,Math.min(event.clientX,window.innerWidth-230))+'px';
  menu.style.top=Math.max(0,Math.min(event.clientY,window.innerHeight-220))+'px';
  menu.hidden=false;
});
$("back-page").addEventListener("click",()=>{
  const folder=DeckCore.activeFolder(state);
  if(folder)DeckCore.changeFolderPage(state,Math.max(0,(folder.pageIndex||0)-1));
  else state.page=Math.max(0,state.page-1);
  state.selected=null;persist();render();
});
$("next-page").addEventListener("click",()=>{
  const folder=DeckCore.activeFolder(state);
  if(folder)DeckCore.changeFolderPage(state,Math.min(DeckCore.folderPageCount(state)-1,(folder.pageIndex||0)+1));
  else state.page=Math.min(state.pages.length-1,state.page+1);
  state.selected=null;persist();render();
});
// Physical D200X button presses run the selected page's action; clicking a
// PC editor key still only selects it for editing.
const activeAudioPlayers=new Map();
const allPlayingAudio=new Set();
const AUDIO_FADE_MS=800;
const audioFadeTimers=new WeakMap();
const audioActionSettings=new WeakMap();
const audioActionLevels=new WeakMap();
const pendingAudioVolumes=new WeakMap();
function cancelAudioFade(audio){
  const previous=audioFadeTimers.get(audio);
  if(previous)clearInterval(previous);
  audioFadeTimers.delete(audio);
}
function updateActiveAudioVolume(settings,percentage){
  const level=Math.max(0,Math.min(100,Number(percentage)||0))/100;
  for(const audio of allPlayingAudio){
    if(audioActionSettings.get(audio)!==settings)continue;
    const target=audioActionLevels.get(audio);
    if(!pendingAudioVolumes.has(audio))pendingAudioVolumes.set(audio,target?.level??audio.volume);
    if(target)target.level=level;
    audio.volume=level;
  }
}
function commitPendingAudioVolumes(){
  for(const audio of allPlayingAudio)pendingAudioVolumes.delete(audio);
}
function revertPendingAudioVolumes(){
  for(const audio of allPlayingAudio){
    if(!pendingAudioVolumes.has(audio))continue;
    const level=pendingAudioVolumes.get(audio);
    const target=audioActionLevels.get(audio);
    if(target)target.level=level;
    audio.volume=level;
    pendingAudioVolumes.delete(audio);
  }
}
function fadeAudio(audio,target,duration=AUDIO_FADE_MS){
  cancelAudioFade(audio);
  const start=performance.now(),initial=audio.volume;
  return new Promise(resolve=>{
    if(duration<=0){audio.volume=target;resolve();return;}
    const interval=setInterval(()=>{
      if(audio.paused){cancelAudioFade(audio);resolve();return;}
      const t=Math.min(1,(performance.now()-start)/duration);
      audio.volume=Math.max(0,Math.min(1,initial+((typeof target==='number'?target:target.level)-initial)*t));
      if(t===1){cancelAudioFade(audio);resolve();}
    },35);
    audioFadeTimers.set(audio,interval);
  });
}
function stopAudio(audio){
  cancelAudioFade(audio);
  audio.pause();audio.currentTime=0;
  allPlayingAudio.delete(audio);
  for(const [key,value] of activeAudioPlayers)if(value===audio)activeAudioPlayers.delete(key);
}
function stopAllAudio(){for(const audio of [...allPlayingAudio])stopAudio(audio);}
async function playAudioAction(outcome,key,settings){
  if(!window.deckBridge?.audioFileUrl)throw new Error('Windows 실행 환경에서만 사용할 수 있습니다.');
  if(!outcome.file)throw new Error('재생할 오디오 파일을 먼저 선택하세요.');
  const old=activeAudioPlayers.get(key);
  if(old&&['play-stop','loop-stop'].includes(outcome.mode)&&!old.paused){
    stopAudio(old);return '오디오 정지';
  }
  if(old&&outcome.mode!=='overlap')stopAudio(old);
  const url=await window.deckBridge.audioFileUrl(outcome.file);
  const audio=new Audio(url);
  const targetVolume={level:outcome.volume/100};
  audioActionSettings.set(audio,settings);
  audioActionLevels.set(audio,targetVolume);
  const fadeDuration=outcome.fadeDuration*1000;
  const fadeIn=['in','in-out'].includes(outcome.fade);
  const fadeOut=['out','in-out'].includes(outcome.fade);
  audio.volume=fadeIn?0:targetVolume.level;
  audio.loop=outcome.mode==='loop-stop';
  if(outcome.output&&outcome.output!=='default'){
    if(typeof audio.setSinkId!=='function')throw new Error('현재 오디오 출력 장치 선택을 지원하지 않습니다.');
    await audio.setSinkId(outcome.output);
  }
  activeAudioPlayers.set(key,audio);allPlayingAudio.add(audio);
  const cleanup=()=>{stopAudio(audio);};
  audio.addEventListener('ended',cleanup,{once:true});
  audio.addEventListener('error',cleanup,{once:true});
  if(fadeOut){
    audio.addEventListener('timeupdate',()=>{
      if(audio.loop||!Number.isFinite(audio.duration)||audio.duration<=0)return;
      const remaining=(audio.duration-audio.currentTime)*1000;
      if(remaining<=fadeDuration&&remaining>=0){
        cancelAudioFade(audio);
        audio.volume=targetVolume.level*Math.max(0,remaining/fadeDuration);
      }
    });
  }
  try{
    await audio.play();
    if(fadeIn)fadeAudio(audio,targetVolume,fadeDuration).catch(error=>console.warn('페이드 인 오류',error));
  }catch(error){cleanup();throw error;}
  return '오디오 재생 시작';
}
const activeActionTimers=new Map();
const timerDeadlines=new WeakMap();
const runningMultiActions=new Set();
const runningMultiControllers=new WeakMap();
const runningMultiProgress=new Map();
const multiPhysicalPresses=new Map();
function clearMultiPhysicalPresses(){
  for(const token of multiPhysicalPresses.values())clearTimeout(token.timer);
  multiPhysicalPresses.clear();
}
function handleMultiPhysicalPress(resolved,preview){
  if(preview||resolved.index<0||resolved.index>=13||!['down','up'].includes(resolved.gesture))return null;
  const index=resolved.index,key=DeckCore.runtimeActionKey(state,index,'down');
  const previous=multiPhysicalPresses.get(index);
  if(resolved.gesture==='up'){
    if(!previous)return null;
    clearTimeout(previous.timer);multiPhysicalPresses.delete(index);
    if(previous.record&&previous.key===key&&runningMultiProgress.get(key)===previous.record&&!previous.record.controller.signal.aborted){
      if(Date.now()-previous.at>=1000){previous.record.controller.abort();previous.record.update();}
      else if(previous.resume){previous.record.gate.resume();previous.record.update();}
    }
    return {message:null};
  }
  if(previous)return {message:null};
  if(resolved.action?.type!=='multi')return null;
  const record=runningMultiProgress.get(key);
  const token={key,record,at:Date.now(),resume:record?.gate.paused===true,timer:null};
  multiPhysicalPresses.set(index,token);
  if(!record)return null;
  if(!record.controller.signal.aborted){
    if(!token.resume){record.gate.pause();record.update();}
    token.timer=setTimeout(()=>{
      if(multiPhysicalPresses.get(index)===token&&runningMultiProgress.get(key)===record&&DeckCore.runtimeActionKey(state,index,'down')===key){
        record.controller.abort();record.update();
      }
    },1000);
  }
  return {message:token.resume?'순차 동작 재개 대기':'순차 동작 일시정지'};
}
// The original switch begins in state 1. Runtime state is distinct from the
// editor tab and advances only after its selected sequence succeeds.
// Runtime position is persisted only after the selected sequence succeeds.
const waitMultiDelay=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('복합 동작이 취소되었습니다.'));
  let onAbort;
  const timer=setTimeout(()=>{
    if(onAbort)signal?.removeEventListener('abort',onAbort);
    resolve();
  },ms);
  onAbort=()=>{
    clearTimeout(timer);signal.removeEventListener('abort',onAbort);
    reject(new Error('복합 동작이 취소되었습니다.'));
  };
  signal?.addEventListener('abort',onAbort,{once:true});
});
// Await the Windows bridge rather than firing each step concurrently.
// Unknown and UI-only actions stop the sequence with an explicit error.
async function executeMultiStep(action,signal,runtimeKey){
  const outcome=DeckCore.planAction(action,state.page,state.pages.length);
  const bridge=window.deckBridge;
  if(!bridge)throw new Error('순차 동작은 Windows EXE에서만 실행할 수 있습니다.');
  switch(outcome.kind){
    case 'sd-plugin':
      throw new Error('복합 동작의 SDK 플러그인은 아직 지원하지 않습니다.');
    case 'ha-toggle':
      return bridge.haToggle(outcome.entityId);
    case 'windows-hotkey':
      return bridge.sendHotkey(outcome.keys);
    case 'windows-hotkey-switch':{
      const signature=JSON.stringify([runtimeKey,'hotkey',outcome.first,outcome.second]);
      const current=compositeHotkeyPositions.get(signature)||0;
      const keys=current===0?outcome.first:outcome.second;
      if(!keys)throw new Error('순차 동작의 단축키 전환 설정이 비어 있습니다.');
      await bridge.sendHotkey(keys);compositeHotkeyPositions.set(signature,1-current);
      return true;
    }
    case 'timer':{
      if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
      const timer=setTimeout(()=>void playTimerAlert(action.settings||{}),outcome.seconds*1000);
      signal?.addEventListener('abort',()=>clearTimeout(timer),{once:true});
      return true;
    }
    case 'media-control':
      return bridge.mediaControl(outcome.operation);
    case 'close-local-app':
      return bridge.closeLocalApp(outcome.path,outcome.force,makeAppControlTrace('multi',null,action));

    case 'audio-play':
      return playAudioAction(outcome,runtimeKey);
    case 'audio-stop':
      stopAllAudio();return true;
    case 'website':
      return bridge.openWebsite(outcome.url,outcome.mode,outcome.browserPath);
    case 'open-terminal':
      return bridge.openTerminal(outcome.admin,outcome.foreground,outcome.preventDuplicate);
    case 'open-local-path':
      if(action.type==='open-app'&&bridge.openApplication)
        return bridge.openApplication(outcome.path,outcome.target,outcome.args||'',outcome.foreground,outcome.preventDuplicate);
      return bridge.openLocalPath(outcome.path,outcome.target,outcome.args||'',outcome.alwaysNewWindow===true,outcome.foreground!==false);
    case 'type-text':
      return outcome.mode==='clipboard'?bridge.pasteText(outcome.text,outcome.enter):bridge.typeText(outcome.text,outcome.enter);
    case 'mute':
      return bridge.adjustWindows('mute',0,1);
    case 'adjust':
      return bridge.adjustWindows(outcome.target,outcome.direction,outcome.count||1);
    case 'zoom-reset':
      return bridge.adjustWindows('zoom-reset',0,1);
    case 'device-brightness':
      return bridge.adjustBrightness(outcome.direction,outcome.count||1);
    case 'device-brightness-set':
      return bridge.setBrightness(outcome.value);
    case 'scroll':
      return bridge.scrollWindows(outcome.axis,outcome.direction,outcome.count||1);
    case 'edit-history':
      return bridge.editHistory(outcome.operation,outcome.count||1);
    case 'windows-switch':
      return bridge.switchWindows(outcome.target,outcome.direction,outcome.count||1);
    case 'system-shortcut':
      return bridge.systemShortcut(outcome.target,outcome.operation);
    default:
      throw new Error('아직 순차 동작에서 실행할 수 없는 액션: '+action.type);
  }
}

const compositeHotkeyPositions=new Map();
const logicPresses=new Map();
// runComposite validates and clones steps. Bind a stable parent+branch+step
// key before the async sequence starts, instead of reading the current page.
function compositeExecutor(parentKey,branch){
  let step=0;
  return (action,signal)=>executeMultiStep(action,signal,JSON.stringify([parentKey,branch,step++]));
}
function triggerLogicSlot(action,slot,index){
  const check=DeckCore.planComposite(action,{gesture:slot});
  if(check.kind!=='composite')return window.d200xActionStatus?.(check.message);
  if(check.steps.length===0)return;
  if(check.steps.some(step=>!MULTI_ALLOWED.includes(step.type)))
    return window.d200xActionStatus?.('Key Logic에 지원하지 않는 하위 액션이 있습니다.');
  const key=DeckCore.runtimeActionKey(state,index,'down');
  if(runningMultiActions.has(key))return window.d200xActionStatus?.('Key Logic 실행 중입니다.');
  runningMultiActions.add(key);
  DeckCore.runComposite(action,{gesture:slot,execute:compositeExecutor(key,'logic:'+slot),wait:waitMultiDelay})
    .then(()=>{scheduleFolderExitAfterAction();window.d200xActionStatus?.('Key Logic '+slot+' 실행 완료');},
      error=>window.d200xActionStatus?.('Key Logic 실행 실패: '+String(error?.message||error)))
    .finally(()=>runningMultiActions.delete(key));
}
// Single is delayed until the double-press window closes; hold fires once.
function handleLogicGesture(action,index,gesture,preview){
  const key=DeckCore.runtimeActionKey(state,index,'down');
  let prior=logicPresses.get(key);
  if(prior&&prior.action!==action){
    clearTimeout(prior.holdTimer);clearTimeout(prior.singleTimer);logicPresses.delete(key);prior=null;
  }
  if(preview){triggerLogicSlot(action,'single',index);return 'Key Logic 한 번 누르기 테스트';}
  if(gesture==='down'){
    if(prior?.held)return null;
    if(prior?.singleTimer){
      clearTimeout(prior.singleTimer);clearTimeout(prior.holdTimer);
      logicPresses.delete(key);triggerLogicSlot(action,'double',index);
      return 'Key Logic 두 번 누르기';
    }
    if(prior)return null;
    const record={action,held:true,holdFired:false,holdTimer:null,singleTimer:null};
    record.holdTimer=setTimeout(()=>{
      if(logicPresses.get(key)!==record||!record.held)return;
      record.holdFired=true;
      triggerLogicSlot(action,'hold',index);
    },600);
    logicPresses.set(key,record);return 'Key Logic 누름 감지';
  }
  if(gesture==='up'&&prior?.action===action){
    prior.held=false;clearTimeout(prior.holdTimer);
    if(prior.holdFired){logicPresses.delete(key);return 'Key Logic 길게 누르기 완료';}
    prior.singleTimer=setTimeout(()=>{
      if(logicPresses.get(key)!==prior)return;
      logicPresses.delete(key);triggerLogicSlot(action,'single',index);
    },300);
    return 'Key Logic 입력 확인 중';
  }
  return null;
}
// Read-only D200X gesture probe. Never execute the selected action kinds.
// Base HID input evidence stays enabled; logEnabled controls only the extra probe records.
const gestureTestPresses=new Map();
const GESTURE_TEST_DOUBLE_MS=300,GESTURE_TEST_HOLD_MS=600;
function emitGestureTestResult(action,index,slot,event,startedAt){
  const target=action.settings?.[slot]||'none';
  const name=TEST_TOUCH_CHOICES.find(([id])=>id===target)?.[1]||'기록만';
  const ms=Math.max(0,Date.now()-startedAt);
  if(action.settings?.logEnabled!==false)
    reportInputEvidence(event,'gesture-test-result',{
      outcome:slot,target,status:'dry-run',ms,count:slot==='double'?2:1
    });
  window.d200xActionStatus?.('터치 입력 검증 · '+({single:'싱글',double:'더블',hold:'롱'}[slot])+
    ' → '+name+' · 실제 실행 없음');
}
function handleGestureTest(action,index,gesture,event,preview){
  if(preview)return '터치 입력 검증은 D200X 실기 터치에서만 기록됩니다.';
  const key=DeckCore.runtimeActionKey(state,index,'down');
  let prior=gestureTestPresses.get(key);
  if(prior&&prior.action!==action){
    clearTimeout(prior.holdTimer);clearTimeout(prior.singleTimer);
    gestureTestPresses.delete(key);prior=null;
  }
  if(action.settings?.logEnabled!==false)
    reportInputEvidence(event,'gesture-test-input',{outcome:gesture});
  if(gesture==='down'){
    if(prior?.held)return null;
    if(prior?.singleTimer){
      clearTimeout(prior.singleTimer);clearTimeout(prior.holdTimer);
      gestureTestPresses.delete(key);
      emitGestureTestResult(action,index,'double',event,prior.startedAt);
      return '더블 터치 감지 · 실제 실행 없음';
    }
    if(prior)return null;
    const record={action,held:true,holdFired:false,startedAt:Date.now(),downEvent:event,
      upEvent:null,holdTimer:null,singleTimer:null};
    record.holdTimer=setTimeout(()=>{
      if(gestureTestPresses.get(key)!==record||!record.held)return;
      record.holdFired=true;
      emitGestureTestResult(action,index,'hold',record.downEvent,record.startedAt);
    },GESTURE_TEST_HOLD_MS);
    gestureTestPresses.set(key,record);return '터치 입력 검증 · 누름 감지';
  }
  if(gesture==='up'&&prior?.action===action){
    prior.held=false;clearTimeout(prior.holdTimer);
    if(prior.holdFired){gestureTestPresses.delete(key);return '롱 터치 검증 완료';}
    prior.upEvent=event;
    prior.singleTimer=setTimeout(()=>{
      if(gestureTestPresses.get(key)!==prior)return;
      gestureTestPresses.delete(key);
      emitGestureTestResult(action,index,'single',prior.upEvent,prior.startedAt);
    },GESTURE_TEST_DOUBLE_MS);
    return '싱글·더블 터치 판정 대기';
  }
  return null;
}
// Generic ordinary-key gesture routing. A saved action stays the single-press
// action; only explicitly assigned double / hold actions enable the new router.
const assignedKeyPresses=new Map();
const ASSIGNED_DOUBLE_MS=300,ASSIGNED_HOLD_MS=600;
function legacyOpenAppHoldAvailable(action){
  return action?.type==='open-app'&&(!action.pressActions?.hold||!pressEnabled(action,'hold'))&&
    ['close','force'].includes(action.settings?.hold);
}
function assignedPressStillCurrent(record){
  return DeckCore.runtimeActionKey(state,record.index,'down')===record.key&&
    DeckCore.visibleActions(state)?.[record.index]===record.action&&
    JSON.stringify([record.action.pressActions||{},record.action.pressMeta||{}])===record.bindings;
}
function runAssignedPress(action,index,slot,event){
  const assigned=pressSlotAction(action,slot);
  const legacyHold=slot==='hold'&&(!assigned||!pressEnabled(action,'hold'))&&
    (legacyOpenAppHoldAvailable(action)||action.type==='indicator'&&!action.pressMeta);
  if(!assigned&&!legacyHold)return null;
  // Disabled hold restores the primary Program Open suboption. A saved 'none'
  // consumes the long press without starting the single-press application.
  if(assigned&&!pressEnabled(action,slot)&&!legacyHold)return null;
  let result=null;
  if(slot==='single'&&action.type==='indicator'){
    result=executeSideNavigation(index,'down',event);
  }else if(slot==='hold'&&legacyHold){
    if(action.type==='indicator')result=executeSideNavigation(index,'hold',event);
    else if(legacyOpenAppHoldAvailable(action)){
      const target=action.settings?.app;
      if(!target)result='종료할 프로그램을 먼저 선택하세요.';
      else if(!window.deckBridge?.closeLocalApp)result='Windows 실행 환경에서만 사용할 수 있습니다.';
      else{
        const force=action.settings.hold==='force';
        observeInputEvidence(event,window.deckBridge.closeLocalApp(
          target,force,{...makeAppControlTrace('hold',index,action),inputId:event.inputId}), 'hold-close')
          ?.then(()=>window.d200xActionStatus?.('길게 누르기: 프로그램 종료 요청 완료'),
            error=>window.d200xActionStatus?.('길게 누르기 종료 실패: '+String(error?.message||error)));
        result='길게 누르기: 기존 프로그램 종료 요청';
      }
    }
  }else{
    const target=slot==='single'?action:action.pressActions?.[slot];
    if(!target||target.type==='press-empty')return null;
    result=executeHardwareAction({...event,state:1,pressed:true},false,true,target,true);
  }
  if(result)window.d200xActionStatus?.(result);
  return result;
}
function handleAssignedKeyPress(action,index,gesture,event){
  // Old profile/page or edited-gesture timer records must never fire.
  if(gesture==='down')for(const [stale,record] of assignedKeyPresses){
    if(assignedPressStillCurrent(record))continue;
    clearTimeout(record.holdTimer);clearTimeout(record.singleTimer);
    assignedKeyPresses.delete(stale);
  }
  const key=DeckCore.runtimeActionKey(state,index,'down'),now=Date.now();
  let prior=assignedKeyPresses.get(key);
  if(prior&&(!assignedPressStillCurrent(prior)||prior.action!==action)){
    clearTimeout(prior.holdTimer);clearTimeout(prior.singleTimer);
    assignedKeyPresses.delete(key);prior=null;
  }
  if(gesture==='down'){
    if(prior?.pressed)return null;
    if(prior?.singleTimer){
      clearTimeout(prior.singleTimer);clearTimeout(prior.holdTimer);
      prior.singleTimer=null;prior.doubleFired=true;prior.pressed=true;
      reportInputEvidence(event,'press-gesture',{outcome:'double',action:action.type});
      return runAssignedPress(action,index,'double',event)||'두 번 누르기 감지';
    }
    if(prior)return null;
    const record={key,index,action,pressed:true,holdFired:false,doubleFired:false,
      bindings:JSON.stringify([action.pressActions||{},action.pressMeta||{}]),
      downAt:now,holdTimer:null,singleTimer:null};
    const holdAssigned=!!action.pressActions?.hold;
    const legacyHold=(action.type==='open-app'&&(!holdAssigned||!pressEnabled(action,'hold')))||
      (action.type==='indicator'&&DeckCore.sharedIndicatorConfig(state,action,'hold').navigation!=='none');
    // Even a disabled hold or Program Open 'none' consumes a completed hold.
    // Otherwise the release incorrectly executes the single-press program.
    if(holdAssigned||legacyHold){
      record.holdTimer=setTimeout(()=>{
        if(assignedKeyPresses.get(key)!==record||!record.pressed||!assignedPressStillCurrent(record))return;
        record.holdFired=true;
        reportInputEvidence(event,'press-gesture',{outcome:'hold',action:action.type,ms:Date.now()-record.downAt});
        runAssignedPress(action,index,'hold',event);
      },action.type==='open-app'&&(!holdAssigned||!pressEnabled(action,'hold'))?650:ASSIGNED_HOLD_MS);
    }
    assignedKeyPresses.set(key,record);
    return '버튼 누르기 판정 중';
  }
  if(gesture!=='up'||!prior)return null;
  prior.pressed=false;
  clearTimeout(prior.holdTimer);
  if(prior.doubleFired){assignedKeyPresses.delete(key);return '두 번 누르기 완료';}
  if(prior.holdFired){assignedKeyPresses.delete(key);return '길게 누르기 완료';}
  const dispatchSingle=()=>{
    if(assignedKeyPresses.get(key)!==prior||!assignedPressStillCurrent(prior))return;
    assignedKeyPresses.delete(key);
    reportInputEvidence(event,'press-gesture',{outcome:'single',action:action.type,ms:Date.now()-prior.downAt});
    runAssignedPress(action,index,'single',event);
  };
  if(pressEnabled(action,'double')&&action.pressActions?.double){
    prior.singleTimer=setTimeout(dispatchSingle,ASSIGNED_DOUBLE_MS);
    return '한 번·두 번 누르기 판정 중';
  }
  dispatchSingle();return '한 번 누르기 완료';
}
// Generated local tones: no external sound files, commands or dependencies.
function timerVolume(settings){const raw=settings?.soundVolume;return Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):100;}
async function playTimerAlert(settings){
  const volume=timerVolume(settings);if(!volume||settings.sound==='none')return;
  try{if(settings.sound==='custom'){
    if(!settings.soundFile)throw Error('사용자 알림음 파일을 선택하세요.');
    const url=await window.deckBridge.audioFileUrl(settings.soundFile);const audio=new Audio(url);audio.volume=volume/100;await audio.play();
  }else playTimerChime(settings.sound||'connect',volume);}catch(e){window.d200xActionStatus?.('타이머 알림음 실패: '+String(e?.message||e));}
}
function playTimerChime(kind,volume=100,preview=null){
  if(kind==='none'||volume<=0)return;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  const context=new AudioContextClass();
  const close=()=>{if(context.state!=='closed')return context.close().catch(()=>{});};
  if(preview)preview.stop=close;
  const patterns={
    connect:[660,880],disconnect:[880,550],release:[880,660,440],
    find:[740,880,740],other:[523,659,784]
  };
  const tones=patterns[kind]||patterns.connect;
  return Promise.resolve(context.resume()).then(()=>{
    if(preview&&timerSoundPreview!==preview)return;
    tones.forEach((freq,i)=>{
      const oscillator=context.createOscillator();
      const gain=context.createGain();
      const start=context.currentTime+i*0.16;
      oscillator.type='sine';oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001,0.09*volume/100),start+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+0.14);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(start);oscillator.stop(start+0.145);
    });
    return new Promise(resolve=>setTimeout(resolve,tones.length*160+100));
  }).then(close).catch(error=>{
    if(!preview||timerSoundPreview===preview)console.warn('타이머 알림음 재생 실패',String(error?.message||error));
    return close();
  });
}
const openAppHoldTimers=new Map();
function makeAppControlTrace(stage,index,action){
  return {id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),stage,
    profile:state.profileId,page:state.page,folderPath:[...(state.folderPath||[])],
    folderPage:DeckCore.activeFolder(state)?.pageIndex||0,slot:index,
    pinned:Number.isInteger(index)&&index>=0&&index<14&&!(state.folderPath||[]).length&&
      !state.pages?.[state.page]?.[index]&&Boolean(action)&&state.pinned?.[index]===action,dirty:Boolean(inspectorSession?.dirty),
    hold:action?.settings?.hold,requestedAt:Date.now()};
}
const openAppHoldScope=()=>JSON.stringify([state.profileId,state.page,state.folderPath||[],DeckCore.activeFolder(state)?.pageIndex||0]);
let lastOpenAppHoldScope=openAppHoldScope();
const openAppHoldConfig=action=>JSON.stringify([action?.settings?.app,action?.settings?.hold,
  action?.settings?.args,action?.settings?.foreground]);
function openAppHoldStillCurrent(token,action){
  return token.action===action&&token.scope===openAppHoldScope()&&
    token.config===openAppHoldConfig(action);
}
function logOpenAppHold(record){window.deckBridge?.logAppControl?.(record).catch(()=>{});}
function clearOpenAppHoldTimers(reason){
  for(const [index,token] of openAppHoldTimers){
    clearTimeout(token.timer);
    logOpenAppHold({...token.trace,stage:'cancel',slot:index,reason,at:Date.now()});
  }
  openAppHoldTimers.clear();
}
window.clearD200XOpenAppHolds=clearOpenAppHoldTimers;
function handleOpenAppHold(action,index,event,gesture){
  if(gesture==='down'){
    if(openAppHoldTimers.has(index))return '프로그램 버튼 입력 유지 중';
    const downAt=Date.now();
    const trace={...makeAppControlTrace('down',index,action),downAt,inputId:event.inputId};
    const token={action,scope:openAppHoldScope(),config:openAppHoldConfig(action),fired:false,cancelled:false,timer:null,trace};
    logOpenAppHold({...trace,stage:'down',at:downAt});
    token.timer=setTimeout(()=>{
      if(openAppHoldTimers.get(index)!==token)return;
      const current=index<14?DeckCore.visibleActions(state)[index]:DeckCore.activeControlAction(DeckCore.controlBinding(state,index),'down');
      if(!openAppHoldStillCurrent(token,current)){
        token.cancelled=true;
        logOpenAppHold({...trace,stage:'cancel',reason:'scope-action-or-settings-changed',at:Date.now()});
        return; // Consume the physical release; do not rearm from duplicate down packets.
      }
      token.fired=true;
      const holdAt=Date.now();
      const requestTrace={...trace,stage:'hold',holdAt,heldMs:holdAt-downAt,
        actualHold:action.settings?.hold,dirtyAtHold:Boolean(inspectorSession?.dirty)};
      logOpenAppHold(requestTrace);
      const path=action.settings?.app;
      if(!path)return window.d200xActionStatus?.('종료할 프로그램을 먼저 선택하세요.');
      const force=action.settings?.hold==='force';
      observeInputEvidence(event,window.deckBridge?.closeLocalApp?.(path,force,requestTrace),'hold-close')?.then(
        ()=>window.d200xActionStatus?.('길게 누르기: 프로그램 '+(force?'강제 종료':'일반 종료')+' 요청 완료'),
        error=>window.d200xActionStatus?.('길게 누르기 '+(force?'강제 종료':'일반 종료')+' 실패: '+String(error?.message||error)));
    },650);
    openAppHoldTimers.set(index,token);
    return '프로그램 버튼 누름 대기';
  }
  const token=openAppHoldTimers.get(index);
  if(!token)return null;
  clearTimeout(token.timer);openAppHoldTimers.delete(index);
  const upAt=Date.now();
  logOpenAppHold({...token.trace,stage:'up',upAt,heldMs:upAt-token.trace.downAt,actualHold:action?.settings?.hold});
  if(token.fired)return '길게 누르기 동작 완료';
  if(token.cancelled)return null;
  if(!openAppHoldStillCurrent(token,action)){
    logOpenAppHold({...token.trace,stage:'cancel',reason:'scope-action-or-settings-changed',at:upAt});
    return null;
  }
  const pressed={...event,state:1,pressed:true};
  return executeHardwareAction(pressed,true);
}
const hotkeySwitchPositions=new Map();
function hotkeySwitchRuntimeKey(index,action,gesture='down'){
  // Independent LCD press gestures must have independent toggle positions.
  if(index>=13)return DeckCore.runtimeActionKey(state,index,gesture);
  const root=DeckCore.visibleActions(state)[index];
  const slot=pressIsOrdinary(root)?PRESS_TABS.find(([name])=>pressSlotAction(root,name)===action)?.[0]||'single':'single';
  return DeckCore.runtimeActionKey(state,index,'down')+':'+slot;
}
const lastHardwareDown=new Map();
function runActionPreview(gesture='down'){
  const index=state.selected;
  if(!Number.isInteger(index)||index<0||index>18)return;
  const root=index<13?DeckCore.visibleActions(state)[index]:null;
  if(pressIsOrdinary(root)&&(root.pressMeta||activePressTab!=='single')){
    const target=pressSlotAction(root,activePressTab);
    if(!target||!pressEnabled(root,activePressTab)){
      window.d200xActionStatus?.('사용 중인 동작이 없어 실행하지 않았습니다.');return;
    }
    const event=DeckCore.previewHardwareEvent(index,'down');
    if(!event)return;
    const result=executeHardwareAction(event,true,true,target,true);
    window.d200xActionStatus?.(result||'등록된 동작이 없어 실행하지 않았습니다.');return;
  }
  if(index===14||index===15||index<13&&DeckCore.visibleActions(state)[index]?.type==='indicator'){
    const selectedGesture=index<13?(gesture==='hold'?'hold':gesture==='double'?'double':'single'):(gesture==='hold'?'hold':'down');
    const result=executeSideNavigation(index,selectedGesture,null);
    window.d200xActionStatus?.(result||'등록된 동작이 없어 실행하지 않았습니다.');return;
  }
  const event=DeckCore.previewHardwareEvent(index,gesture);
  if(!event)return;
  const result=executeHardwareAction(event,true);
  window.d200xActionStatus?.(result||'등록된 동작이 없어 실행하지 않았습니다.');
}
let lastWideHardwarePress=0;
// Own only presses started on the warning. A pre-existing SDK/hold press
// must still receive its release, even if the dialog opened in between.
const wideWarningPresses=new Set();
let lastWarningPressAt=-Infinity;
window.clearD200XWarningPresses=()=>{wideWarningPresses.clear();lastWarningPressAt=-Infinity;};
function handleWideWarningInput(event,preview){
  if(preview||event?.knob===true)return null;
  const index=Number(event?.index);
  if(index!==13&&index!==14)return null;
  if(event?.pressed===false||Number(event?.state)===0){
    if(wideWarningPresses.delete(index))return {message:null};
    return null;
  }
  if(!DeckCore.isWideDisplayPress(event))return null;
  const now=Date.now(),active=wideUnsavedWarningActive();
  if(!active&&!wideWarningPresses.has(index)&&now-lastWarningPressAt>=240)return null;
  wideWarningPresses.add(index);
  if(active&&now-lastWarningPressAt>=240){
    lastWarningPressAt=now;
    revealWideUnsavedWarning();
  }
  return {message:'DeckForge 확인창 표시'};
}
function advanceWideDisplay(){
  if(!wideDisplayAvailable())return null;
  const mode=DeckCore.cycleWideDisplay(state);
  persist(false);render();
  // A wide-only switch must not race with 14 full-key repaints.
  if(window.scheduleD200XWideSync)window.scheduleD200XWideSync();
  else window.scheduleDeckSync?.(0);
  window.d200xActionStatus?.('가로 화면 전환: '+WIDE_LABELS[mode]);
  return mode;
}
// Raw D200X dial packets report press (1), release (0), left (2) and right (3).
// Ulanzi's higher-level SDK also names held rotations. Recognize both forms
// while leaving ordinary knob assignments and stack/adjust modes intact.
const knobPresses=new Map();
function heldKnobEvent(event,preview){
  if(preview)return {event,consume:false,replay:false};
  const rawIndex=Number(event?.index),stateByte=Number(event?.state);
  if(rawIndex<17||rawIndex>19||!Number.isInteger(rawIndex))return {event,consume:false,replay:false};
  const binding=DeckCore.controlBinding(state,rawIndex-1);
  const hasHeld=Boolean(binding?.heldEnabled||DeckCore.activeControlAction(binding,'holdLeft')||DeckCore.activeControlAction(binding,'holdRight'));
  if(stateByte===1){
    const prior=knobPresses.get(rawIndex);
    if(prior?.defer)return {event,consume:true,replay:false};
    knobPresses.set(rawIndex,{rotated:false,defer:hasHeld,scope:openAppHoldScope(),binding,action:DeckCore.activeControlAction(binding,'down')});
    return {event,consume:hasHeld,replay:false};}
  const pressed=knobPresses.get(rawIndex);
  if(stateByte===0){knobPresses.delete(rawIndex);
    return {event,consume:Boolean(pressed?.defer),replay:Boolean(pressed?.defer&&!pressed.rotated&&!binding?.heldEnabled&&pressed.scope===openAppHoldScope()&&pressed.binding===binding&&pressed.action===DeckCore.activeControlAction(binding,'down'))};}
  if(stateByte===2||stateByte===3){
    if(pressed){pressed.rotated=true;
      if(pressed.defer)return {event:{...event,state:stateByte===2?4:5},consume:false,replay:false};}
  }
  return {event,consume:false,replay:false};
}
// One physical packet ID is carried through the actual dispatch, never inferred from time.
function reportInputEvidence(event,stage,fields={}){
  if(typeof event?.inputId!=='string')return;
  try{window.deckBridge?.inputEvidence?.({inputId:event.inputId,stage,...fields});}catch{}
}
function observeInputEvidence(event,promise,kind){
  if(typeof event?.inputId!=='string'||!promise||typeof promise.then!=='function')return promise;
  const start=Date.now();
  reportInputEvidence(event,'request',{outcome:kind});
  promise.then(value=>{
    reportInputEvidence(event,value===false?'request-false':'request-resolved',{outcome:kind,ms:Date.now()-start,...(Number.isInteger(value)&&value>=0&&value<=10000?{count:value}:{})});
  },()=>reportInputEvidence(event,'request-rejected',{outcome:kind,ms:Date.now()-start}));
  return promise;
}
function tracedPhysicalDispatch(event){
  reportInputEvidence(event,'renderer',{page:state.page+1,profile:Math.max(1,(state.profileNames||[]).findIndex(p=>p.id===state.profileId)+1),folder:!!state.folderPath?.length,dirty:!!inspectorSession?.dirty});
  try{const result=executeHardwareAction(event);reportInputEvidence(event,'dispatch-return',{handled:!!result});return result;}
  catch(error){reportInputEvidence(event,'dispatch-throw');throw error;}
}
const sidePressTracker=DeckCore.createSidePressTracker(),sidePressTimers=new Map();
window.clearD200XSidePresses=()=>{
  for(const timer of sidePressTimers.values())clearTimeout(timer);
  sidePressTimers.clear();sidePressTracker.clear();
};
function invalidateSidePresses(){
  for(const timer of sidePressTimers.values())clearTimeout(timer);
  sidePressTimers.clear();sidePressTracker.invalidate();
}
function sidePressContext(index){
  if(index<13){const item=DeckCore.visibleActions(state)[index];return JSON.stringify([openAppHoldScope(),item?.type,DeckCore.sharedIndicatorConfig(state,item),DeckCore.sharedIndicatorConfig(state,item,'hold')]);}
  const b=DeckCore.controlBinding(state,index);
  return JSON.stringify([openAppHoldScope(),DeckCore.sideActionConfig(b,index),DeckCore.sideActionConfig(b,index,'hold')]);
}
function executeSideNavigation(index,gesture,event){
  const indicator=index<13;
  const outcome=indicator?DeckCore.planFixedIndicatorNavigation(state,index,gesture):DeckCore.planSideNavigation(state,index,gesture);
  if(!outcome)return null;
  reportInputEvidence(event,'planned',{outcome:outcome.kind});
  if(outcome.kind==='invalid')return outcome.message;
  if(outcome.kind==='editor-open'&&indicator){
    if(!window.deckBridge?.revealUnsavedEditor)return 'Windows EXE에서 사용할 수 있습니다.';
    revealWideUnsavedWarning();return 'DeckForge 열기';
  }
  if(inspectorSession?.dirty){
    reportInputEvidence(event,'unsaved-block');
    showInspectorLeaveDialog(()=>executeSideNavigation(index,gesture,event));
    return '저장하지 않은 변경 사항 확인';
  }
  cancelFolderAutoExit();
  const config=indicator?DeckCore.fixedIndicatorNavigation(gesture):DeckCore.sideActionConfig(DeckCore.controlBinding(state,index),index,gesture);
  if(indicator&&['history-back','profile-history','folder-history'].includes(outcome.kind)){
    if(!pageVisitTracker.returnPrevious(state,outcome.kind))return '돌아갈 '+({'history-back':'직전 페이지','profile-history':'직전 프로필','folder-history':'직전 덱폴더'}[outcome.kind])+'가 없습니다.';
  }else if(!DeckCore.applySideNavigation(state,outcome))return '이동할 대상이 없습니다.';
  lastHardwareDown.clear();persist();render();
  return (indicator?DeckCore.INDICATOR_NAV_LABELS:DeckCore.SIDE_NAV_LABELS)[config.navigation];
}
// Page-number keys use their own single/double/hold recognizer. Side buttons,
// Key Logic, ordinary gesture tabs and the wide display keep their original paths.
const fixedIndicatorPresses=new Map();
const FIXED_INDICATOR_DOUBLE_MS=300;
function handleFixedIndicatorInput(index,gesture,event,preview){
  if(preview)return gesture==='down'?executeSideNavigation(index,'single',event):null;
  if(gesture!=='down'&&gesture!=='up')return null;
  const currentAction=DeckCore.visibleActions(state)[index];
  const context=entry=>DeckCore.visibleActions(state)[index]===entry.action&&
    state.profileId===entry.profile&&state.page===entry.page&&
    JSON.stringify(state.folderPath||[])===entry.folder;
  const dispatch=(entry,press)=>{
    if(!context(entry))return null;
    const result=executeSideNavigation(index,press,entry.event);
    if(result)window.d200xActionStatus?.(result);
    return result;
  };
  const entry=fixedIndicatorPresses.get(index);
  if(gesture==='down'){
    if(entry?.down)return null;
    if(entry?.pending&&!context(entry)){
      clearTimeout(entry.singleTimer);fixedIndicatorPresses.delete(index);
    }
    const previous=fixedIndicatorPresses.get(index);
    if(previous?.pending){
      clearTimeout(previous.singleTimer);previous.pending=false;previous.down=true;
      previous.second=true;previous.event=event;
      previous.holdTimer=setTimeout(()=>{
        if(fixedIndicatorPresses.get(index)!==previous||!previous.down)return;
        previous.fired=true;dispatch(previous,'hold');
      },DeckCore.SIDE_HOLD_MS);
      return '페이지 표시 두 번째 누름 대기';
    }
    const next={action:currentAction,profile:state.profileId,page:state.page,
      folder:JSON.stringify(state.folderPath||[]),event,down:true,second:false,
      pending:false,fired:false,singleTimer:null,holdTimer:null};
    fixedIndicatorPresses.set(index,next);
    next.holdTimer=setTimeout(()=>{
      if(fixedIndicatorPresses.get(index)!==next||!next.down)return;
      next.fired=true;dispatch(next,'hold');
    },DeckCore.SIDE_HOLD_MS);
    return '페이지 표시 키 누름 대기';
  }
  if(!entry?.down)return null;
  entry.down=false;clearTimeout(entry.holdTimer);
  if(entry.fired){fixedIndicatorPresses.delete(index);return null;}
  if(entry.second){
    fixedIndicatorPresses.delete(index);
    return dispatch(entry,'double');
  }
  entry.pending=true;entry.event=event;
  entry.singleTimer=setTimeout(()=>{
    if(fixedIndicatorPresses.get(index)!==entry||!entry.pending)return;
    fixedIndicatorPresses.delete(index);dispatch(entry,'single');
  },FIXED_INDICATOR_DOUBLE_MS);
  return '페이지 표시 한 번 누르기 판정 대기';
}
function handleSideNavigationInput(index,gesture,event,preview){
  if(preview)return gesture==='down'?executeSideNavigation(index,'down',event):null;
  const indicator=index<13,binding=indicator?null:DeckCore.controlBinding(state,index);
  const hasHold=(indicator?DeckCore.sharedIndicatorConfig(state,DeckCore.visibleActions(state)[index],'hold'):DeckCore.sideActionConfig(binding,index,'hold')).navigation!=='none';
  const context=sidePressContext(index);
  const decision=sidePressTracker.input(index,gesture,hasHold,context,Date.now());
  if(gesture==='up'){
    clearTimeout(sidePressTimers.get(index));sidePressTimers.delete(index);
    if(!decision)reportInputEvidence(event,'release');
  }
  if(decision==='wait'){
    reportInputEvidence(event,'hold');
    const timer=setTimeout(()=>{
      sidePressTimers.delete(index);
      const action=sidePressTracker.input(index,'timeout',true,sidePressContext(index),Date.now());
      if(action==='hold'){
        const result=executeSideNavigation(index,'hold',event);
        if(result)window.d200xActionStatus?.(result);
      }
    },DeckCore.SIDE_HOLD_MS);
    sidePressTimers.set(index,timer);
    return indicator?'페이지 표시 키 누름 대기':'측면 단추 누름 대기';
  }
  if(decision)return executeSideNavigation(index,decision,event);
  return null;
}
function executeHardwareAction(event,preview=false,skipKnobGesture=false,pressOverride=null,bypassPressBindings=false){
  const report=(stage,fields={})=>reportInputEvidence(event,stage,fields);
  const observe=(promise,kind)=>observeInputEvidence(event,promise,kind);
  const warning=handleWideWarningInput(event,preview);
  if(warning){report('warning');return warning.message;}
  if(!skipKnobGesture){
    const held=heldKnobEvent(event,preview);
    if(held.replay){
      report('held-replay');
      // Release-time replay represents a completed tap, not a new hold.
      // Pair down/up for every action, including Key Logic and app hold.
      const result=executeHardwareAction({...event,state:1,pressed:true},false,true);
      const released=executeHardwareAction({...event,state:0,pressed:false},false,true);
      return released||result;
    }
    if(held.consume){report('held-consumed');return null;}
    event=held.event;
  }
  const folderBackWide=state.folderPath?.length>0&&!DeckCore.currentActions(state)?.[13];
  if(DeckCore.isWideDisplayPress(event)&&(wideDisplayAvailable()||folderBackWide)){
    // The merged key can report both halves of one physical press.
    // Ignore duplicate press packets, but do not affect other controls.
    const now=Date.now();
    if(!preview&&!skipKnobGesture&&now-lastWideHardwarePress<240){report('wide-debounce');return null;}
    if(!preview)lastWideHardwarePress=now;
    if(folderBackWide){event=DeckCore.folderWideBackEvent(state,event);report('wide-folder-back');}
    else {const mode=advanceWideDisplay();report('wide-switch',{status:mode});return '가로 화면 전환: '+WIDE_LABELS[mode];}
  }
  const resolved=DeckCore.resolveHardwareEvent(state,event);
  if(!resolved){report('unresolved');return null;}
  if(pressOverride)resolved.action=pressOverride;
  const index=resolved.index,offset=index-14;
  const bindingAction=resolved.action;
  report('resolved',{slot:index,gesture:resolved.gesture,action:bindingAction?.type});
  if(index===14||index===15)return handleSideNavigationInput(index,resolved.gesture,event,preview);
  if(index<13&&(resolved.action?.type==='indicator'||fixedIndicatorPresses.has(index))){
    if(resolved.gesture==='up')lastHardwareDown.delete(index);
    return handleFixedIndicatorInput(index,resolved.gesture,event,preview);
  }
  if(!preview&&!bypassPressBindings&&index<13&&pressActionAssigned(resolved.action)&&
    ['down','up'].includes(resolved.gesture))
    return handleAssignedKeyPress(resolved.action,index,resolved.gesture,event);
  if(index<13&&sidePressTracker.has(index)){
    if(resolved.gesture==='up')lastHardwareDown.delete(index);
    return handleSideNavigationInput(index,resolved.gesture,event,preview);
  }
  const multiPress=handleMultiPhysicalPress(resolved,preview);
  if(multiPress){if(resolved.gesture==='up')lastHardwareDown.delete(index);report('multi-control');return multiPress.message;}
  if(!bypassPressBindings&&!preview&&['down','up'].includes(resolved.gesture)&&
    (openAppHoldTimers.has(index)||legacyOpenAppHoldAvailable(resolved.action)))
    {report('hold');return handleOpenAppHold(resolved.action,index,event,resolved.gesture);}
  if(resolved.action?.type==='gesture-test'&&['down','up'].includes(resolved.gesture))
    return handleGestureTest(resolved.action,index,resolved.gesture,event,preview);
  if(resolved.action?.type==='logic'&&['down','up'].includes(resolved.gesture))
    {report('logic');return handleLogicGesture(resolved.action,index,resolved.gesture,preview);}
  const sdkAction=resolved.action;
  if(sdkAction?.type==='sd-plugin'){
    const ctx=sdkContext(index,
      resolved.gesture==='up'?'down':resolved.gesture);
    if(!window.deckBridge?.sdkKey)return 'SDK 플러그인은 Windows EXE에서만 실행됩니다.';
    if(resolved.gesture==='up')lastHardwareDown.delete(index);
    report('sdk-dispatch');observe(window.deckBridge.sdkKey(ctx,resolved.gesture),'sdk').then(ok=>{
      if(!ok)window.d200xActionStatus?.('SDK 플러그인이 활성화되지 않았습니다.');
    }).catch(error=>window.d200xActionStatus?.('SDK 플러그인 실행 실패: '+String(error?.message||error)));
    if(preview&&resolved.gesture==='down')setTimeout(()=>window.deckBridge.sdkKey(ctx,'up').catch(()=>{}),100);
    return 'DeckForge 플러그인 이벤트: '+resolved.gesture;
  }
  if(resolved.gesture==='up'){report('release');lastHardwareDown.delete(index);return null;}
  if(resolved.gesture==='down'&&!preview&&!bypassPressBindings){
    const now=Date.now();
    if(now-(lastHardwareDown.get(index)||0)<250){report('duplicate');return null;}
    lastHardwareDown.set(index,now);
  }
  const currentFolder=DeckCore.activeFolder(state);
  const planned=pressOverride?{index,gesture:resolved.gesture,
    outcome:DeckCore.planAction(pressOverride,
      currentFolder?(currentFolder.pageIndex||0):state.page,
      currentFolder?DeckCore.folderPageCount(state):state.pages.length)}:
    DeckCore.planHardwareEvent(state,event,offset>=2?stackPositions[offset-2]:0);
  if(!planned){report('no-plan');return null;}
  const outcome=planned.outcome;report('planned',{outcome:outcome.kind});
  // Hardware-driven navigation cannot silently abandon an unsaved inspector.
  if(!preview&&inspectorSession?.dirty&&
    ['page','profile','folder-back','folder-enter'].includes(outcome.kind)){
    report('unsaved-block');
    showInspectorLeaveDialog(()=>{
      lastHardwareDown.delete(index);
      executeHardwareAction(event,false,true);
    });
    return '저장하지 않은 변경 사항 확인';
  }
  if(!['stack-next','page','profile','folder-back','folder-enter','composite','unsupported','invalid'].includes(outcome.kind))
    scheduleFolderExitAfterAction();
  if(outcome.kind==='stack-next'){
    const idx=offset-2;
    stackPositions[idx]=(stackPositions[idx]+1)%outcome.size;
    renderPhysicalControls();
    window.scheduleD200XWideSync?.();
    const target=DeckCore.controlBinding(state,index).stack[stackPositions[idx]];
    return '노브 '+(idx+1)+' 조절 대상: '+({page:'페이지',profile:'프로필',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[target]);
  }
  if(outcome.kind==='profile'){
    cancelFolderAutoExit();
    const names=state.profileNames||[];
    const pos=names.findIndex(p=>p.id===state.profileId);
    const id=outcome.profile==='next'?names[(pos+1)%names.length]?.id:
      outcome.profile==='previous'?names[(pos-1+names.length)%names.length]?.id:outcome.profile;
    if(!id||!DeckCore.switchProfile(state,id))return '프로필을 찾을 수 없습니다.';
    lastHardwareDown.clear();persist();render();return '프로필 전환: '+state.profileNames.find(p=>p.id===id)?.name;
  }
  if(outcome.kind==='folder-back'){
    cancelFolderAutoExit();
    if(!DeckCore.exitFolder(state))return '상위 폴더가 없습니다.';
    lastHardwareDown.clear();persist();render();return '상위 폴더로 이동';
  }
  if(outcome.kind==='folder-enter'){
    cancelFolderAutoExit();
    if(!DeckCore.enterFolder(state,index))return '폴더를 열 수 없습니다.';
    lastHardwareDown.clear();persist();render();return '폴더 열기';
  }
  if(outcome.kind==='composite' && ['multi','multi-switch','random'].includes(outcome.type)){
    const action=resolved.action;
    if(!action||action.type!==outcome.type)return '복합 동작 설정이 없습니다.';
    const key=DeckCore.runtimeActionKey(state,index,resolved.gesture);
    if(runningMultiActions.has(key))return '복합 동작이 이미 실행 중입니다.';
    const position=outcome.type==='multi-switch'?(action.settings?.activeState===1?1:0):0;
    const random=outcome.type==='random'?Math.random():undefined;
    const check=DeckCore.planComposite(action,{state:position,random});
    if(check.kind!=='composite')return check.message;
    // Reject unsupported steps BEFORE running any command, so a late invalid
    // step cannot unexpectedly leave a partially-executed sequence.
    if(check.steps.some(step=>step.kind!=='delay'&&!MULTI_ALLOWED.includes(step.type)))
      return '지원하지 않는 하위 액션이 있어 실행하지 않았습니다.';
    runningMultiActions.add(key);
    const controller=new AbortController();
    runningMultiControllers.set(action,controller);
    const progress=outcome.type==='multi'?{controller,gate:DeckCore.createMultiPauseGate(controller.signal),step:1,total:check.steps.filter(x=>x.kind!=='delay').length}:null;
    const updateProgress=()=>{if(progress){renderGrid();void refreshSelectedVisual();refreshMultiRunControls();const selected=DeckCore.visibleActions(state)[state.selected];if(selected?.type==='multi')void refreshStateTitleCards(selected);window.scheduleDeckSync?.(0);}};
    if(progress){progress.update=updateProgress;runningMultiProgress.set(key,progress);updateProgress();}
    const executeStep=compositeExecutor(key,outcome.type==='random'?'random:'+Math.floor(random*DeckCore.compositeModel(action).choices.length):'state:'+position);
    observe(DeckCore.runComposite(action,{
      onStep:(step,total)=>{if(progress){progress.step=step;progress.total=total;updateProgress();}},
      execute:progress?async(step,signal)=>{await progress.gate.ready();if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');return executeStep(step,signal);}:executeStep,wait:progress?ms=>progress.gate.wait(ms):waitMultiDelay,
      state:position,random,signal:controller.signal,
      nextActionMs:Math.max(2,Math.min(200,Number(action.settings?.nextActionMs)||100))
    }),'composite').then(
      count=>{
        scheduleFolderExitAfterAction();
        if(outcome.type==='multi-switch'){
          action.settings.activeState=1-position;
          persist();renderGrid();
          window.d200xActionStatus?.('순차 동작 스위치 상태 '+(position+1)+' · '+count+'단계 완료');
        }else if(outcome.type==='random')window.d200xActionStatus?.('무작위 동작 '+count+'개 실행 완료');
        else window.d200xActionStatus?.('순차 동작 '+count+'단계 완료');
      },
      error=>window.d200xActionStatus?.('복합 동작 중단: '+String(error?.message||error))
    ).finally(()=>{
      runningMultiActions.delete(key);
      if(runningMultiControllers.get(action)===controller)runningMultiControllers.delete(action);
      if(progress&&runningMultiProgress.get(key)===progress){runningMultiProgress.delete(key);updateProgress();}
    });
    return outcome.type==='multi-switch'
      ?'순차 동작 스위치 상태 '+(position+1)+' 실행 요청':outcome.type==='random'?'무작위 동작 실행 요청':'순차 동작 실행 요청';
  }
  if(outcome.kind==='ha-toggle'){
    if(!window.deckBridge?.haToggle)return 'Home Assistant는 Windows EXE에서만 실행됩니다.';
    observe(window.deckBridge.haToggle(outcome.entityId),outcome.kind).then(
      ()=>window.d200xActionStatus?.('HA 장치 토글 요청 완료: '+outcome.entityId),
      error=>window.d200xActionStatus?.('HA 동작 실패: '+String(error?.message||error)));
    return 'HA 장치 토글 요청: '+outcome.entityId;
  }
  if(outcome.kind==='display-only')return '페이지 표시는 현재 페이지를 표시하는 전용 액션입니다.';
  if(outcome.kind==='device-sleep'){
    if(!window.deckBridge?.sleepDisplay)return 'D200X 화면 절전은 Windows EXE에서만 실행됩니다.';
    observe(window.deckBridge.sleepDisplay(),outcome.kind).then(
      ()=>window.d200xActionStatus?.('D200X 화면 잠자기 요청 완료 · 다음 버튼으로 깨우기'),
      error=>window.d200xActionStatus?.('D200X 잠자기 실패: '+String(error?.message||error)));
    return 'D200X 화면 잠자기 요청';
  }
  if(outcome.kind==='mute'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.adjustWindows('mute',0,1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('음소거 전환 완료'),
      error=>window.d200xActionStatus?.('음소거 전환 실패: '+String(error?.message||error))
    );
    return 'Windows 음소거 전환 요청';
  }
  if(outcome.kind==='close-local-app'){
    if(!window.deckBridge?.closeLocalApp)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.closeLocalApp(outcome.path,outcome.force,{...makeAppControlTrace('action',index,resolved.action),inputId:event.inputId}),outcome.kind).then(
      ()=>window.d200xActionStatus?.('선택한 프로그램 '+(outcome.force?'강제 종료':'일반 종료')+' 요청 완료'),
      error=>window.d200xActionStatus?.('프로그램 '+(outcome.force?'강제 종료':'일반 종료')+' 실패: '+String(error?.message||error)));
    return '선택한 프로그램 '+(outcome.force?'강제 종료':'닫기')+' 요청';
  }
  if(outcome.kind==='audio-stop'){
    stopAllAudio();return '오디오 재생 정지';
  }
  if(outcome.kind==='audio-play'){
    observe(playAudioAction(outcome,DeckCore.runtimeActionKey(state,index,resolved.gesture),resolved.action?.settings),outcome.kind).then(
      result=>window.d200xActionStatus?.(result),
      error=>window.d200xActionStatus?.('오디오 재생 실패: '+String(error?.message||error)));
    return '오디오 재생 요청';
  }
  if(outcome.kind==='type-text'){
    const useClipboard=outcome.mode==='clipboard';
    const command=useClipboard?window.deckBridge?.pasteText:window.deckBridge?.typeText;
    if(!command)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(command(outcome.text,outcome.enter),outcome.kind).then(
      ()=>window.d200xActionStatus?.(useClipboard?'클립보드에 기록하고 붙여넣기 완료':'유니코드 직접 입력 완료'),
      error=>window.d200xActionStatus?.('텍스트 입력 실패: '+String(error?.message||error)));
    return useClipboard?'Windows 클립보드 붙여넣기 요청':'유니코드 직접 입력 요청';
  }
  if(outcome.kind==='timer'){
    const key=DeckCore.runtimeActionKey(state,index,resolved.gesture);
    const active=activeActionTimers.get(key);
    if(active){
      clearTimeout(active.handle);clearInterval(active.interval);
      activeActionTimers.delete(key);timerDeadlines.delete(active.action);
      renderGrid();void refreshSelectedVisual();window.scheduleDeckSync?.();
      return '타이머 중지';
    }
    const seconds=outcome.seconds;
    const action=resolved.action;
    const deadline=Date.now()+seconds*1000;
    const soundSettings={...action.settings};
    timerDeadlines.set(action,deadline);
    const interval=setInterval(()=>{
      if(!activeActionTimers.has(key)){clearInterval(interval);return;}
      if(DeckCore.visibleActions(state).some((item,i)=>item?.type==='timer'&&DeckCore.runtimeActionKey(state,i,'down')===key)){
        renderGrid();
        void refreshSelectedVisual();window.scheduleDeckSync?.(0);
      }
    },1000);
    const handle=setTimeout(()=>{
      clearInterval(interval);activeActionTimers.delete(key);timerDeadlines.delete(action);
      renderGrid();window.scheduleDeckSync?.();
      void refreshSelectedVisual();void playTimerAlert(soundSettings);
      window.d200xActionStatus?.('타이머 '+seconds+'초 완료');
    },seconds*1000);
    activeActionTimers.set(key,{handle,interval,action,deadline,seconds});renderGrid();void refreshSelectedVisual();window.scheduleDeckSync?.();
    return '타이머 '+seconds+'초 시작 · 다시 누르면 취소';
  }
  if(outcome.kind==='media-control'){
    if(!window.deckBridge?.mediaControl)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.mediaControl(outcome.operation),outcome.kind).then(
      ()=>window.d200xActionStatus?.('미디어 키 전송 완료'),
      error=>window.d200xActionStatus?.('미디어 실행 실패: '+String(error?.message||error)));
    return '미디어 제어 요청';
  }
  if(outcome.kind==='windows-hotkey-switch'){
    if(!window.deckBridge?.sendHotkey)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    const key=hotkeySwitchRuntimeKey(index,resolved.action,resolved.gesture);
    const position=hotkeySwitchPositions.get(key)||0;
    const keys=position===0?outcome.first:outcome.second;
    if(!keys)return '전환할 단축키가 설정되지 않았습니다.';
    observe(window.deckBridge.sendHotkey(keys,event.inputId),outcome.kind).then(
      ()=>{hotkeySwitchPositions.set(key,1-position);renderGrid();void refreshSelectedVisual();window.scheduleDeckSync?.();window.d200xActionStatus?.('단축키 전환 '+(position+1)+' 실행');},
      error=>window.d200xActionStatus?.('단축키 전환 실패: '+String(error?.message||error)));
    return '단축키 전환 '+(position+1)+' 요청';
  }
  if(outcome.kind==='windows-hotkey'){
    if(!window.deckBridge?.sendHotkey)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.sendHotkey(outcome.keys,event.inputId),outcome.kind).then(
      ()=>window.d200xActionStatus?.('단축키 전송 완료'),
      error=>window.d200xActionStatus?.('단축키 실행 실패: '+String(error?.message||error)));
    return '단축키 실행 요청';
  }
  if(outcome.kind==='open-terminal'){
    if(!window.deckBridge?.openTerminal)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.openTerminal(outcome.admin,outcome.foreground,outcome.preventDuplicate,event.inputId),outcome.kind).then(
      ()=>window.d200xActionStatus?.('터미널 열기 완료'),error=>window.d200xActionStatus?.('터미널 열기 실패: '+String(error?.message||error)));
    return '터미널 열기 요청';
  }
  if(outcome.kind==='open-local-path'){
    if(!window.deckBridge?.openLocalPath)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe((resolved.action?.type==='open-app'&&window.deckBridge.openApplication
      ?window.deckBridge.openApplication(outcome.path,outcome.target,outcome.args||'',outcome.foreground,outcome.preventDuplicate,event.inputId)
      :window.deckBridge.openLocalPath(outcome.path,outcome.target,outcome.args||'',outcome.alwaysNewWindow===true,outcome.foreground!==false,event.inputId)),'open-local-path').then(
      ()=>window.d200xActionStatus?.('경로 열기 완료'),
      error=>window.d200xActionStatus?.('경로 열기 실패: '+String(error?.message||error)));
    return '지정 경로 열기 요청';
  }
  if(outcome.kind==='system-shortcut'){
    if(!window.deckBridge?.systemShortcut)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.systemShortcut(outcome.target,outcome.operation),outcome.kind).then(
      ()=>window.d200xActionStatus?.('단축키 전송 완료'),
      error=>window.d200xActionStatus?.('단축키 실패: '+String(error?.message||error)));
    return 'Windows 단축키 요청: '+outcome.target;
  }
  if(outcome.kind==='device-brightness-set'){
    if(!window.deckBridge?.setBrightness)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.setBrightness(outcome.value),outcome.kind).then(
      value=>window.d200xActionStatus?.('D200X 밝기: '+value+'%'),
      error=>window.d200xActionStatus?.('밝기 설정 실패: '+String(error?.message||error)));
    return 'D200X 밝기 '+outcome.value+'% 설정 요청';
  }
  if(outcome.kind==='device-brightness'){
    if(!window.deckBridge?.adjustBrightness)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.adjustBrightness(outcome.direction,outcome.count||1),outcome.kind).then(
      value=>window.d200xActionStatus?.('D200X 밝기: '+value),
      error=>window.d200xActionStatus?.('밝기 조절 실패: '+String(error?.message||error)));
    return 'D200X 밝기 조절 요청';
  }
  if(outcome.kind==='zoom-reset'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.adjustWindows('zoom-reset',0,1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('확대·축소 초기화 키 전송'),
      error=>window.d200xActionStatus?.('초기화 실패: '+String(error?.message||error)));
    return '활성 앱 원래 크기 요청';
  }
  if(outcome.kind==='windows-switch'){
    if(!window.deckBridge?.switchWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.switchWindows(outcome.target,outcome.direction,outcome.count||1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('전환 키 입력 완료'),
      error=>window.d200xActionStatus?.('전환 실패: '+String(error?.message||error))
    );
    return outcome.target==='window'?'창 전환 요청':'가상 데스크톱 전환 요청';
  }
  if(outcome.kind==='edit-history'){
    if(!window.deckBridge?.editHistory)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.editHistory(outcome.operation,outcome.count||1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('편집 동작 전송 완료'),
      error=>window.d200xActionStatus?.('편집 동작 실패: '+String(error?.message||error))
    );
    return outcome.operation==='undo'?'실행 취소 요청':'다시 실행 요청';
  }
  if(outcome.kind==='scroll'){
    if(!window.deckBridge?.scrollWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.scrollWindows(outcome.axis,outcome.direction,outcome.count||1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('스크롤 완료'),
      error=>window.d200xActionStatus?.('스크롤 실패: '+String(error?.message||error))
    );
    return 'Windows '+(outcome.axis==='horizontal'?'가로':'세로')+' 스크롤 요청';
  }
  if(outcome.kind==='adjust'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    observe(window.deckBridge.adjustWindows(outcome.target,outcome.direction,outcome.count||1),outcome.kind).then(
      ()=>window.d200xActionStatus?.('조절 완료: '+outcome.target),
      error=>window.d200xActionStatus?.('조절 실패: '+String(error?.message||error))
    );
    return (outcome.target==='volume'?'Windows 음량':'활성 앱 확대/축소')+
      (outcome.direction>0?' 증가':' 감소');
  }
  if(outcome.kind==='page'){
    cancelFolderAutoExit();
    if(state.folderPath?.length){
      const folder=DeckCore.activeFolder(state);
      const next=outcome.page;
      if(!DeckCore.changeFolderPage(state,next))return '폴더 페이지 이동 실패';
      lastHardwareDown.clear();persist();render();
      return '폴더 페이지 '+((folder.pageIndex||0)+1)+' 표시';
    }
    if(outcome.page===state.page)return '페이지 '+(state.page+1)+' · 이동 없음';
    state.page=outcome.page;state.folderPath=[];state.selected=null;
    lastHardwareDown.clear();persist();render();return '페이지 '+(outcome.page+1)+' 표시';
  }
  if(outcome.kind==='website'){
    if(!window.deckBridge?.openWebsite)return '웹사이트 열기는 Windows EXE에서만 실행됩니다.';
    observe(window.deckBridge.openWebsite(outcome.url,outcome.mode,outcome.browserPath),outcome.kind).then(
      ()=>window.d200xActionStatus?.('웹사이트 열기 완료'),
      error=>window.d200xActionStatus?.('웹사이트 열기 실패: '+String(error?.message||error))
    );
    return '웹사이트 열기 요청';
  }
  return outcome.message;
}
window.executeD200XKey=tracedPhysicalDispatch;

 // AI edit transactions are generated locally, never from model-written JS.
 // The original state and plugin object identities remain intact until user approval.
 let aiEditCapture=null,aiEditUndo=null;
 function aiEditReady(){
   if(profileStorageFailure||!window.deckBridge?.writeProfile)throw Error('프로필 저장 기능을 확인하세요.');
   if(inspectorEditing||inspectorSession?.dirty||document.querySelector('dialog[open]')||nativeGridBusy||nativeGridDrag||openAppHoldTimers.size)throw Error('미저장 편집 또는 진행 중인 동작을 먼저 마치세요.');
   // Folder navigation is allowed; advanced edits require an explicit folder route.
 }
 function aiEditCurrent(id){
   aiEditReady();
   if(!aiEditCapture||aiEditCapture.id!==id||aiEditCapture.base!==JSON.stringify(state))throw Error('편집 상태가 달라졌습니다. 새 변경안을 요청하세요.');
   return aiEditCapture;
 }
 function aiEditStore(next){
   // No dirty inspector shortcut: exactly one synchronous existing atomic profile write.
   const saved=window.deckBridge.writeProfile(next);
   if(!saved?.ok)throw Error('프로필 저장 실패. 기존 편집 상태를 보존했습니다.');
   state=next;inspectorSession=null;
   let refreshError=false;
   try{render();}catch(e){refreshError=true;console.warn('AI 편집 화면 갱신 실패',e);}
   try{window.scheduleDeckSync?.();}catch(e){refreshError=true;console.warn('AI 편집 동기화 예약 실패',e);}
   return {saved:true,refreshError};
 }
 function aiSavedRows(plan){
   return plan.rows.map(row=>{
     const base={op:row.op,page:row.page,slot:row.slot,folder:row.folder,control:row.control,state:row.state};
     if(['template_save','template_apply'].includes(row.op))return {...base,action:row.op==='template_save'?'템플릿 저장':'템플릿으로 새 프로필 생성',title:String(row.after?.title||'').slice(0,160)};
     if(plan.createdProfileId&&['control','wide'].includes(row.op))return {...base,action:row.op==='control'?'물리 컨트롤':'와이드 화면',title:String(row.after?.title||'').slice(0,160)};
     if(!Number.isInteger(row.slot)||['folder_page','folder_settings','control','wide','add_page','delete','move_source'].includes(row.op))return base;
     let items=(plan.createdProfileId?plan.next.inactiveProfiles.find(p=>p.id===plan.createdProfileId)?.pages:plan.next.pages)?.[row.page-1];
     for(const [slot,fp] of (row.folder||'').split('/').filter(Boolean).map(x=>x.split(':').map(Number))){
       const folder=items?.[slot-1];items=fp===1?folder?.children:folder?.pages?.[fp-2];
     }
     const item=items?.[row.slot-1];if(!item)return base;
     const settings=item.settings||{},p=settings.pluginSettings||{};
     const action=item.type==='sd-plugin'?(p.name||settings.actionName||sdkActionNames.get(settings.actionUUID)||settings.actionUUID||'플러그인'):
       ACTIONS.get(item.type)?.label||item.type;
     const value=item.type==='hotkey'?settings.keys:item.type==='hotkey-switch'?[settings.first,settings.second].filter(Boolean).join(' / '):settings.pluginUUID==='com.autodesk.fusionstreamdeck'?p.commandId:item.type==='folder'&&plan.createdProfileId?(1+(item.pages?.length||0))+'페이지':undefined;
     return {...base,action:String(action).slice(0,160),title:String(item.title||'').slice(0,160),...(value?{value:String(value).slice(0,160)}:{})};
   });
 }
 window.DeckForgeAiEdit=Object.freeze({
   capture(id){
     aiEditReady();aiEditCapture={id,base:JSON.stringify(state),before:state,plan:null};
     return {profile:state.profileNames?.find(p=>p.id===state.profileId)?.name||'기본 프로필',page:state.page+1,pageCount:state.pages.length};
   },
   types({id,input}){aiEditCurrent(id);return window.DeckForgeAiPlan.targetTypes(state,input);},
   async prepare({id,input,targets}){
     const snapshot=aiEditCurrent(id),operations=window.DeckForgeAiPlan.validate(input).operations;
     const resources=[];let packs;
     for(const [i,o] of operations.entries()){
       const target=targets[i]?{...targets[i]}:null,res={target};
       if(target?.artwork){
         const artwork=target.artwork;delete target.artwork;
         try{target.icon={kind:'file',value:await rasterizeIcon(artwork,144,100)};}catch{}
       }
       if(o.iconName!==null){
         packs??=await window.deckBridge.listIconPacks();
         const wanted=o.iconName.trim().toLowerCase();
         const matches=[];
         for(const pack of packs){
           if(o.iconPack!==null&&String(pack.name).toLowerCase()!==o.iconPack.trim().toLowerCase())continue;
           for(const icon of pack.icons||[])if(String(icon.name).toLowerCase()===wanted)matches.push({pack,icon});
         }
         if(matches.length!==1)throw Error('아이콘 이름이 없거나 중복됩니다. 아이콘팩과 정확한 이름을 지정하세요.');
         const {pack,icon}=matches[0];
         res.icon={name:o.iconName,pack:pack.name,data:{kind:'file',value:await rasterizeIcon(icon.image),packId:pack.id}};
       }
       resources.push(res);
     }
     if(aiEditCurrent(id)!==snapshot)throw Error('변경안이 취소되었습니다.');
     const plan=window.DeckForgeAiPlan.makePlan(state,input,resources);
     snapshot.plan=plan;
     // Render local button previews for the user only (never sent to the model).
     const rows=plan.rows.map(x=>({...x}));
     for(const row of rows){
       if(!row.slot)continue;
       const next=plan.next.pages[row.page-1]?.[row.slot-1];
       if(next?.icon?.kind==='file'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(next.icon.value||'')&&next.icon.value.length<1024*1024)row.previewImage=next.icon.value;
     }
     return {id,profile:plan.profile,rows};
   },
   advancedTypes({id,input}){aiEditCurrent(id);return window.DeckForgeAiAdvanced.folderTargetTypes(state,input);},
   async prepareAdvanced({id,input,resources}){
     const snapshot=aiEditCurrent(id),a=window.DeckForgeAiAdvanced.validate(input),c=JSON.parse(a.configJson);
     const local={...resources,icons:{},targets:[]};
     for(const target of resources.targets||[]){
       if(!target){local.targets.push(null);continue;}
       const out={...target};delete out.artwork;
       if(target.artwork)try{out.icon={kind:'file',value:await rasterizeIcon(target.artwork,144,100)};}catch{}
       local.targets.push(out);
     }
     if(a.kind==='plugin'&&['sdk-ha','fusion'].includes(c.kind)){
       const found=window.DeckForgeAiAdvanced.walkTemplates(state).find(x=>x.kind===c.kind&&x.id===c.id);
       if(!found)throw Error('등록된 플러그인 명령 또는 장치를 찾지 못했습니다.');
       const plugin=sdkPlugins.find(p=>p.uuid===found.action.settings.pluginUUID);
       if(!plugin?.actions?.some(x=>x.uuid===found.action.settings.actionUUID))throw Error('해당 플러그인을 먼저 설치하세요.');
       local.template={kind:c.kind,id:c.id};
     }
     if(a.kind==='state_design'){
       let packs;const matched={};
       for(const k of ['first','second']){
         const v=c[k];if(!v?.iconName)continue;
         packs??=await window.deckBridge.listIconPacks();
         const matches=[];
         for(const pack of packs){
           if(v.iconPack&&String(pack.name).toLowerCase()!==v.iconPack.trim().toLowerCase())continue;
           for(const icon of pack.icons||[])if(String(icon.name).toLowerCase()===v.iconName.trim().toLowerCase())matches.push({pack,icon});
         }
         if(matches.length!==1)throw Error('상태 아이콘 이름이 없거나 중복됩니다. 팩과 정확한 이름을 지정하세요.');
         const {pack,icon}=matches[0];
         local.icons[k]={name:v.iconName,pack:pack.name,data:{kind:'file',value:await rasterizeIcon(icon.image),packId:pack.id}};
         matched[k]={pack,icon,pair:iconPairType(icon)};
       }
       const one=matched.first,two=matched.second;
       if(one&&two&&one.pack.id===two.pack.id&&one.pair?.state==='off'&&two.pair?.state==='on'&&findIconCompanion(one.pack,one.icon)===two.icon){
         const pair=JSON.stringify([one.pack.id,one.pair.directory,one.pair.base,one.pair.source]);
         local.icons.first.data.statePair=pair;local.icons.second.data.statePair=pair;
       }
     }
     if(aiEditCurrent(id)!==snapshot)throw Error('변경안이 취소되었습니다.');
     const plan=window.DeckForgeAiAdvanced.makePlan(state,a,local);snapshot.plan=plan;
     return {id,profile:plan.profile,rows:plan.rows};
   },
   apply(id){
     const snapshot=aiEditCurrent(id);
     if(!snapshot.plan)throw Error('적용할 변경안이 없습니다.');
     const structural=snapshot.plan.rows.some(row=>row.op==='page_structure');
     if(structural&&(runningMultiActions.size||activeActionTimers.size||allPlayingAudio.size||knobPresses.size||logicPresses.size||multiPhysicalPresses.size||sidePressTimers.size))throw Error('진행 중인 동작을 먼저 중단하세요.');
     const rows=aiSavedRows(snapshot.plan);
     const result=aiEditStore(snapshot.plan.next);
     if(structural){pageStructureEpoch++;hotkeySwitchPositions.clear();lastHardwareDown.clear();invalidateSidePresses();clearMultiPhysicalPresses();cancelFolderAutoExit();render();}
     aiEditUndo={id,before:snapshot.before,after:JSON.stringify(state),structural};
     aiEditCapture=null;return {...result,rows};
   },
   discard(id){if(aiEditCapture?.id===id)aiEditCapture=null;return true;},
   undo(id){
     aiEditReady();
     if(!aiEditUndo||aiEditUndo.id!==id||aiEditUndo.after!==JSON.stringify(state))throw Error('적용 이후 설정이 달라졌습니다. 안전하게 되돌릴 수 없습니다.');
     const structural=aiEditUndo.structural;
     if(structural&&(runningMultiActions.size||activeActionTimers.size||allPlayingAudio.size||knobPresses.size||logicPresses.size||multiPhysicalPresses.size||sidePressTimers.size))throw Error('진행 중인 동작을 먼저 중단하세요.');
     const result=aiEditStore(aiEditUndo.before);
     if(structural){pageStructureEpoch++;hotkeySwitchPositions.clear();lastHardwareDown.clear();invalidateSidePresses();clearMultiPhysicalPresses();cancelFolderAutoExit();render();}
     aiEditUndo=null;aiEditCapture=null;return result;
   }
 });

let refreshProfilesMenu=()=>{};
function render(){
  pageVisitTracker.observe(state);
  const scope=openAppHoldScope();
  if(scope!==lastOpenAppHoldScope){
    clearOpenAppHoldTimers('navigation');invalidateSidePresses();clearMultiPhysicalPresses();
    for(const press of logicPresses.values()){clearTimeout(press.holdTimer);clearTimeout(press.singleTimer);}
    logicPresses.clear();lastOpenAppHoldScope=scope;
  }
  previewPressKeys.clear();renderGrid();renderInspector();refreshProfilesMenu();scheduleSdkSync();
}

// Installed packs are read from the application's packaged library.
// The prototype glyph groups have been removed; only genuine packs appear.
let libraryTarget=null;
let libraryStateKey=null;
let importedIconPacks=[];
const ICON_PAGE_SIZE=84;
const iconVisibleCounts=new Map();
const expandedIconPacks=new Set();
async function refreshImportedIconPacks(){
  if(!window.deckBridge?.listIconPacks)return;
  try{
    const installed=await window.deckBridge.listIconPacks();
    importedIconPacks=installed;
    if(!$("icon-library").hidden)renderIconLibrary();
  }catch(error){
    window.d200xActionStatus?.('아이콘팩 목록 읽기 실패: '+String(error?.message||error));
  }
}
async function importIconPackIntoLibrary(fromFolder=false){
  if(!window.deckBridge?.importIconPack){
    window.d200xActionStatus?.('아이콘팩 등록은 Windows EXE에서 사용할 수 있습니다.');
    return;
  }
  const button=$(fromFolder?"icon-pack-folder-import":"icon-pack-import");
  button.disabled=true;
  try{
    const pack=await (fromFolder?window.deckBridge.importIconFolder():window.deckBridge.importIconPack());
    if(!pack)return;
    await refreshImportedIconPacks();
    window.d200xActionStatus?.('아이콘팩 등록 완료: '+pack.name+' · '+pack.icons.length+'개');
  }catch(error){
    window.d200xActionStatus?.('아이콘팩 등록 실패: '+String(error?.message||error));
  }finally{button.disabled=false;}
}
// Every saved action keeps its applied PNG and the originating pack ID.
// Traversing the complete state includes inactive profiles, nested folders,
// pinned actions and knob bindings, without touching unrelated settings.
function visitIconReferences(root,packId,reset=false){
  const seen=new WeakSet();
  let count=0;
  function walk(value){
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    if(value.icon?.kind==='file'&&value.icon.packId===packId){
      count++;
      if(reset)delete value.icon; // built-in artwork/glyph becomes the default
    }
    for(const [key,child] of Object.entries(value)){
      if(key==='icon')continue;
      if(child&&typeof child==='object')walk(child);
    }
  }
  walk(root);
  return count;
}
async function removeIconPackFromLibrary(pack){
  if(pack.source==='bundled'||!window.deckBridge?.removeIconPack)return;
  const assigned=visitIconReferences(state,pack.id,false);
  const warning='아이콘팩 "'+pack.name+'"을(를) 삭제하시겠습니까?\n'+
    (assigned?'이 팩을 사용 중인 버튼/상태 아이콘 '+assigned+'개가 기본 아이콘으로 복구됩니다.\n':'')+
    '아이콘팩은 라이브러리에서 제거됩니다.\n계속하려면 확인을 누르세요.';
  if(!window.confirm(warning))return;
  try{
    const removed=await window.deckBridge.removeIconPack(pack.id);
    if(!removed){window.d200xActionStatus?.('등록된 아이콘팩을 찾을 수 없습니다.');return;}
    const reset=visitIconReferences(state,pack.id,true);
    if(reset)persist();
    render();
    await refreshImportedIconPacks();
    window.d200xActionStatus?.('아이콘팩 제거: '+pack.name+' · 기본 아이콘 복구 '+reset+'개');
  }catch(error){
    window.d200xActionStatus?.('아이콘팩 제거 실패: '+String(error?.message||error));
  }
}
// Pair icon files only while selecting artwork; never change HA execution logic.
function iconPairType(icon){
  // Do not mix basename variants or folder-local states across icon families.
  const filenameValue=String(icon.filename||'');
  const basename=filenameValue.split(/[\\/]/).pop();
  const directory=filenameValue.slice(0,filenameValue.length-basename.length);
  const withoutExt=basename.replace(/\.[^.]+$/,'').replace(/@(?:2|3)x$/i,'');
  const parsedFile=/^(.+?)[_\-\s]+(off|on)$/i.exec(withoutExt);
  if(parsedFile)return {base:parsedFile[1].toLowerCase(),state:parsedFile[2].toLowerCase(),directory,source:'filename'};
  const parsedName=/^(.+?)[_\-\s]+(off|on)$/i.exec(String(icon.name||''));
  if(parsedName)return {base:parsedName[1].toLowerCase(),state:parsedName[2].toLowerCase(),directory,source:'name'};
  return null;
}
function findIconCompanion(pack,icon){
  const pair=iconPairType(icon);
  if(!pair)return null;
  return pack.icons.find(other=>{
    if(other===icon)return false;
    const test=iconPairType(other);
    return test?.base===pair.base&&test.state!==pair.state&&
      test.directory===pair.directory&&test.source===pair.source;
  })||null;
}
function applyMatchedStateIcons(settings,pair,clickedPng,companionPng,packId){
  settings.sdkStateIcons??={};
  const opposite=pair.state==='on'?'off':'on';
  const statePair=JSON.stringify([packId,pair.directory,pair.base,pair.source]);
  settings.sdkStateIcons[pair.state]={kind:'file',value:clickedPng,packId,statePair};
  settings.sdkStateIcons[opposite]={kind:'file',value:companionPng,packId,statePair};
}
// 1.1.4 profiles retained only packId and PNG bytes. Recover a pair only
// after matching both actual images against a verified same-folder name pair.
let legacyPackRequest=null;
const legacyPackRasterCache=new WeakMap();
function requestLegacyStatePair(icons,off,on){
  if(!window.deckBridge?.listIconPacks)return;
  const record={off,on,matched:false};
  legacyStatePairCache.set(icons,record);
  const packs=()=>importedIconPacks.length?Promise.resolve(importedIconPacks):
    (legacyPackRequest??=window.deckBridge.listIconPacks().catch(error=>{legacyPackRequest=null;throw error;}));
  const raster=icon=>{
    if(!legacyPackRasterCache.has(icon))legacyPackRasterCache.set(icon,rasterizeIcon(icon.image).catch(()=>null));
    return legacyPackRasterCache.get(icon);
  };
  void (async()=>{
    try{
      const pack=(await packs()).find(entry=>entry.id===off.packId);
      if(!pack)return;
      for(const candidate of pack.icons){
        if(iconPairType(candidate)?.state!=='off')continue;
        const companion=findIconCompanion(pack,candidate);
        if(!companion||await raster(candidate)!==off.value||await raster(companion)!==on.value)continue;
        if(icons.off!==off||icons.on!==on||legacyStatePairCache.get(icons)!==record)return;
        record.matched=true;
        renderGrid();
        const selected=DeckCore.visibleActions(state)[state.selected];
        if(selected)refreshTitlePreview(selected);
        window.scheduleDeckSync?.();
        return;
      }
    }catch(error){console.warn('기존 ON/OFF 아이콘 페어 확인 실패',error);}
  })();
}
function renderIconLibrary(){
  const root=$("icon-library-groups");root.replaceChildren();
  const search=$("icon-library-search").value.trim().toLocaleLowerCase();
  let count=0;
  for(const pack of importedIconPacks){
    const matching=pack.icons.filter(icon=>{
      const text=[pack.name,icon.name,...icon.tags].join(' ').toLocaleLowerCase();
      return !search||text.includes(search);
    });
    if(!matching.length)continue;
    const title=document.createElement('button');
    title.type='button';title.className='icon-group-title';
    const arrow=document.createElement('span');arrow.className='icon-group-arrow';arrow.textContent='⌄';
    const name=document.createElement('span');name.textContent=pack.name+' · '+pack.version;
    const amount=document.createElement('span');amount.className='icon-group-count';amount.textContent='('+matching.length+'개)';
    title.append(arrow,name,amount);
    let heading=title;
    if(pack.source!=='bundled'){
      const wrapper=document.createElement('div');wrapper.className='icon-group-heading';
      const remove=document.createElement('button');remove.type='button';
      remove.className='icon-pack-remove';remove.textContent='삭제';
      remove.title=pack.name+' 제거';remove.setAttribute('aria-label',pack.name+' 아이콘팩 제거');
      remove.addEventListener('click',()=>removeIconPackFromLibrary(pack));
      wrapper.append(title,remove);heading=wrapper;
    }
    const grid=document.createElement('div');grid.className='icon-grid';
    grid.hidden=!expandedIconPacks.has(pack.id);
    arrow.textContent=grid.hidden?'▸':'⌄';
    title.addEventListener('click',()=>{
      grid.hidden=!grid.hidden;
      if(grid.hidden)expandedIconPacks.delete(pack.id);
      else expandedIconPacks.add(pack.id);
      arrow.textContent=grid.hidden?'▸':'⌄';
    });
    const limit=iconVisibleCounts.get(pack.id)||ICON_PAGE_SIZE;
    for(const icon of matching.slice(0,limit)){
      count++;
      const tile=document.createElement('button');tile.type='button';
      tile.className='icon-swatch icon-pack-swatch';tile.title=pack.name+' / '+icon.name;
      const image=document.createElement('img');image.src=icon.image;image.alt=icon.name;
      tile.append(image);
      tile.addEventListener('click',async()=>{
        const target=libraryTarget,session=librarySession;
        if(!target||!inspectorPickerCurrent(session,target))return;
        try{
          const png=await rasterizeIcon(icon.image);
          if(!inspectorPickerCurrent(session,target))return;
          if(libraryStateKey?.startsWith('press:')&&(isMomentaryIconAction(target)||target.type==='indicator')){
            target.settings.keyPressIcons??={};
            target.settings.keyPressIcons[libraryStateKey.slice(6)]={kind:'file',value:png,packId:pack.id};
          }else if(['off','on'].includes(libraryStateKey)&&['sd-plugin','timer','hotkey-switch'].includes(target.type)){
            // Only an actual, same-directory OFF/ON pair may update both states.
            const companion=findIconCompanion(pack,icon);
            const pair=iconPairType(icon);
            target.settings.sdkStateIcons??={};
            target.settings.sdkStateIcons[libraryStateKey]={kind:'file',value:png,packId:pack.id};
            if(companion&&pair){
              const oppositePng=await rasterizeIcon(companion.image);
              if(!inspectorPickerCurrent(session,target))return;
              applyMatchedStateIcons(target.settings,pair,png,oppositePng,pack.id);
            }
          }else {target.icon={kind:'file',value:png,packId:pack.id};if(target.settings)delete target.settings.autoAppIcon;}
          persistInspectorChange();render();closeIconLibrary();
        }catch(error){
          window.d200xActionStatus?.('팩 아이콘 적용 실패: '+String(error?.message||error));
        }
      });
      grid.append(tile);
    }
    if(matching.length>limit){
      const more=document.createElement('button');
      more.type='button';more.className='icon-pack-more';
      more.textContent='더 보기 ('+Math.min(ICON_PAGE_SIZE,matching.length-limit)+'개)';
      more.addEventListener('click',()=>{
        iconVisibleCounts.set(pack.id,limit+ICON_PAGE_SIZE);
        renderIconLibrary();
      });
      grid.append(more);
    }
    count+=matching.length-Math.min(limit,matching.length);
    root.append(heading,grid);
  }
  $("icon-library-count").textContent='아이콘 '+count+'개 · 등록된 팩 '+importedIconPacks.length+'개';
}
let librarySession=null;
function openIconLibrary(item,stateKey=null){
  libraryTarget=item;
  librarySession=inspectorSession;
  libraryStateKey=stateKey;
  $("icon-library-search").value="";
  iconVisibleCounts.clear();
  expandedIconPacks.clear();
  renderIconLibrary();
  $("icon-library").hidden=false;
  refreshImportedIconPacks();
  $("icon-library-search").focus();
}
function closeIconLibrary(){
  $("icon-library").hidden=true;libraryTarget=null;libraryStateKey=null;librarySession=null;
}
let fileIconTarget=null;
let fileIconSession=null;
let makerTarget=null;
let makerStateKey=null;
let makerSession=null;
function applyStateIconData(target,key,uri,session=inspectorSession){
  if(!target||!uri||!inspectorPickerCurrent(session,target))return;
  target.settings??={};
  if(key?.startsWith('press:')){
    target.settings.keyPressIcons??={};target.settings.keyPressIcons[key.slice(6)]={kind:'file',value:uri};
  }else if(key==='off'||key==='on'){
    target.settings.sdkStateIcons??={};target.settings.sdkStateIcons[key]={kind:'file',value:uri};
  }else{target.icon={kind:'file',value:uri};delete target.settings.autoAppIcon;}
  persistInspectorChange();render();
}
function applyIconData(target,uri,session=inspectorSession){applyStateIconData(target,null,uri,session);}
function rasterizeIcon(uri,size=196,contentSize=size){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d");
      ctx.imageSmoothingQuality="high";
      const scale=Math.min(contentSize/image.width,contentSize/image.height);
      const w=image.width*scale,h=image.height*scale;
      ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror=()=>reject(new Error("이미지를 열 수 없습니다."));
    image.src=uri;
  });
}
async function setIconFile(file,target=fileIconTarget,key=null,session=inspectorSession){
  if(!file||!target)return;
  if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)||file.size>5*1024*1024){
    alert("5MB 이하 PNG/JPEG/WebP/GIF 이미지 파일을 선택해 주세요.");return;
  }
  try{
    const uri=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("파일 읽기 실패"));
      reader.onload=()=>resolve(reader.result);
      reader.readAsDataURL(file);
    });
    applyStateIconData(target,key,await rasterizeIcon(uri),session);
  }catch(error){alert("아이콘 적용 실패: "+String(error?.message||error));}
}
async function pasteIcon(target,key=null,session=inspectorSession){
  try{
    if(window.deckBridge?.readClipboardImage){
      const image=await window.deckBridge.readClipboardImage();
      if(!image){alert("클립보드에 이미지가 없습니다.");return;}
      applyStateIconData(target,key,await rasterizeIcon(image),session);return;
    }
    if(!navigator.clipboard?.read)throw new Error("이미지 클립보드를 사용할 수 없습니다.");
    for(const entry of await navigator.clipboard.read()){
      const format=entry.types.find(type=>["image/png","image/jpeg","image/webp"].includes(type));
      if(format){await setIconFile(await entry.getType(format),target,key,session);return;}
    }
    alert("클립보드에 이미지가 없습니다.");
  }catch(error){alert("클립보드 이미지 접근 실패: "+String(error?.message||error));}
}
function renderIconMaker(){
  const canvas=$("icon-maker-canvas"),ctx=canvas.getContext("2d");
  ctx.fillStyle=$("icon-maker-background").value;ctx.fillRect(0,0,196,196);
  const glyph=$("icon-maker-text").value.trim()||"★";
  ctx.fillStyle=$("icon-maker-foreground").value;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=(Array.from(glyph).length>1?65:115)+'px "Segoe UI Symbol","Malgun Gothic",sans-serif';
  ctx.fillText(glyph,98,98,178);
}
function openIconMaker(target,key=null){
  makerTarget=target;makerStateKey=key;makerSession=inspectorSession;
  $("icon-maker").hidden=false;
  renderIconMaker();
}
function closeIconMaker(){makerTarget=null;makerStateKey=null;makerSession=null;$("icon-maker").hidden=true;}
function bindIconControls(item){
  const host=$("icon-preview-content");host.replaceChildren(iconNode(item,ACTIONS.get(item.type)?.icon||"+"));
  if((isMomentaryIconAction(item)||item.type==='indicator')&&state.selected<13){
    const slot=state.selected;
    const release=()=>{if(previewPressKeys.delete(slot))void refreshSelectedVisual();};
    host.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();previewPressKeys.add(slot);void refreshSelectedVisual();
      window.addEventListener('pointerup',release,{once:true,signal:inspectorListener.signal});
      window.addEventListener('pointercancel',release,{once:true,signal:inspectorListener.signal});
    });
    host.addEventListener('pointerleave',release);
  }
  const hasStateCards=hasStateTitlePair(item)||item.type==='indicator';
  if(hasStateCards){
    $("icon-library-open").remove();$("icon-menu-trigger").remove();$("icon-dropdown").remove();
    if(item.type==='sd-plugin'&&!isMomentaryIconAction(item)){
      $("icon-preview").title='클릭하면 OFF/ON 이미지를 미리 봅니다 (실제 장치 동작 없음)';
      $("icon-preview").style.cursor='pointer';
      $("icon-preview").addEventListener('click',()=>{
        const current=haPreviewStates.get(item);
        const runtime=sdkVisuals.get(sdkContext(state.selected,'down'));
        haPreviewStates.set(item,current===undefined?(runtime?.state===1?'off':'on'):(current==='on'?'off':'on'));
        void refreshSelectedVisual();
      });
    }
    return;
  }
  bindKeyBackgroundControl($("icon-preview"),item,"default");
  $("icon-library-open").addEventListener("click",()=>openIconLibrary(item));
  const dropdown=$("icon-dropdown"),toggle=$("icon-menu-trigger");
  toggle.addEventListener("click",()=>{
    dropdown.hidden=!dropdown.hidden;
    toggle.setAttribute("aria-expanded",String(!dropdown.hidden));
  });
  dropdown.querySelectorAll("[data-icon-command]").forEach(button=>{
    button.addEventListener("click",()=>{
      dropdown.hidden=true;toggle.setAttribute("aria-expanded","false");
      const cmd=button.dataset.iconCommand;
      if(cmd==="library")openIconLibrary(item);
      else if(cmd==="file"){
        if(window.deckBridge?.chooseImportFile){
          const session=inspectorSession;
          chooseNativeImage('image').then(async chosen=>{
            if(!chosen)return;
            applyIconData(item,await rasterizeIcon(chosen.dataUrl),session);
          }).catch(error=>window.d200xActionStatus?.('아이콘 선택 실패: '+String(error?.message||error)));
        }else{fileIconTarget=item;fileIconSession=inspectorSession;$("custom-icon-file").click();}
      }
      else if(cmd==="paste")pasteIcon(item);
      else if(cmd==="new")openIconMaker(item);
    });
  });
  document.addEventListener("pointerdown",event=>{
    if(!dropdown.isConnected)return;
    if(!dropdown.contains(event.target)&&!toggle.contains(event.target)){
      dropdown.hidden=true;toggle.setAttribute("aria-expanded","false");
    }
  },{signal:inspectorListener.signal});
}
// Standalone native dialogs must stay inside the editing-session navigation guard.
function askDeckForgeText(title,initialValue='',maxLength=80){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog deckforge-input-dialog';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('strong');heading.textContent=title;
    const input=document.createElement('input');input.type='text';input.maxLength=maxLength;
    input.value=initialValue;input.required=true;input.setAttribute('aria-label',title);
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
    const ok=document.createElement('button');ok.type='submit';ok.textContent='확인';ok.className='primary';
    cancel.addEventListener('click',()=>dialog.close('cancel'));
    form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){input.setCustomValidity('값을 입력하세요.');input.reportValidity();return;}dialog.close('save');});
    input.addEventListener('input',()=>input.setCustomValidity(''));
    actions.append(cancel,ok);form.append(heading,input,actions);dialog.append(form);
    dialog.addEventListener('close',()=>{const result=dialog.returnValue==='save'?input.value:null;dialog.remove();resolve(result);},{once:true});
    document.body.append(dialog);dialog.showModal();input.focus();input.select();
  });
}
function chooseDeckForgeEntity(entities,current=''){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog deckforge-input-dialog';
    dialog.style.width='min(440px,calc(100vw - 32px))';
    const heading=document.createElement('strong');heading.textContent='Home Assistant 엔티티 선택';
    const search=document.createElement('input');search.type='search';search.placeholder='엔티티 이름 또는 ID 검색';
    search.setAttribute('aria-label','HA 엔티티 검색');
    const options=document.createElement('select');options.size=9;
    options.style.cssText='width:100%;min-height:196px;background:#353942;color:white;border:1px solid #777;border-radius:5px';
    options.setAttribute('aria-label','HA 엔티티 검색 결과');
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
    const ok=document.createElement('button');ok.type='button';ok.textContent='선택';ok.className='primary';
    const fill=()=>{
      options.replaceChildren();
      const query=search.value.trim().toLowerCase();
      const found=entities.filter(entry=>(entry.name+' '+entry.entity_id).toLowerCase().includes(query)).slice(0,100);
      for(const entry of found){
        const option=document.createElement('option');option.value=entry.entity_id;
        option.textContent=entry.name+' ['+entry.entity_id+'] ('+entry.state+')';options.append(option);
      }
      if(found.length)options.value=found.some(entry=>entry.entity_id===current)?current:found[0].entity_id;
      ok.disabled=!found.length;
    };
    search.addEventListener('input',fill);
    const done=()=>dialog.close(options.value?'selected':'cancel');
    ok.addEventListener('click',done);options.addEventListener('dblclick',done);
    cancel.addEventListener('click',()=>dialog.close('cancel'));
    actions.append(cancel,ok);dialog.append(heading,search,options,actions);
    dialog.addEventListener('close',()=>{const result=dialog.returnValue==='selected'?options.value:null;dialog.remove();resolve(result);},{once:true});
    fill();document.body.append(dialog);dialog.showModal();search.focus();
  });
}
// Electron does not implement window.prompt; use an in-app modal.
function askProfileName(title,initialValue){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('strong');heading.textContent=title;
    const input=document.createElement('input');input.type='text';input.maxLength=80;
    input.required=true;input.value=initialValue;input.setAttribute('aria-label',title);
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
    const save=document.createElement('button');save.type='submit';save.textContent='확인';save.className='primary';
    cancel.addEventListener('click',()=>dialog.close('cancel'));
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(!input.value.trim()){input.setCustomValidity('프로필 이름을 입력하세요.');input.reportValidity();return;}
      dialog.close('save');
    });
    input.addEventListener('input',()=>input.setCustomValidity(''));
    actions.append(cancel,save);form.append(heading,input,actions);dialog.append(form);
    dialog.addEventListener('close',()=>{const value=dialog.returnValue==='save'?input.value.trim():null;dialog.remove();resolve(value);},{once:true});
    document.body.append(dialog);dialog.showModal();input.focus();input.select();
  });
}
function askBackupPassword(creating,safety=false){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('strong');heading.textContent=safety?'복원 전 안전 백업 비밀번호 설정':creating?'백업 비밀번호 설정':'백업 비밀번호 입력';
    const note=document.createElement('div');note.textContent=safety?'일반 파일 자체에는 비밀번호가 없습니다. 기존 데이터를 암호화하여 안전하게 보존할 비밀번호를 4자 이상으로 설정하세요.':creating?'4자 이상. 다른 PC에서도 같은 비밀번호가 필요합니다. 비밀번호는 저장하지 않으며 잊어버리면 복원할 수 없습니다. 인증 정보가 포함될 수 있는 설정은 암호화됩니다.':'백업 생성 시 사용한 비밀번호를 입력하세요.';
    const input=document.createElement('input');input.type='password';input.required=true;input.minLength=4;input.maxLength=256;input.autocomplete='off';input.placeholder='비밀번호';input.setAttribute('aria-label','백업 비밀번호');
    const repeat=document.createElement('input');repeat.type='password';repeat.required=creating;repeat.minLength=4;repeat.maxLength=256;repeat.autocomplete='off';repeat.placeholder='비밀번호 확인';repeat.setAttribute('aria-label','백업 비밀번호 확인');
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.addEventListener('click',()=>dialog.close('cancel'));
    const submit=document.createElement('button');submit.type='submit';submit.textContent='확인';submit.className='primary';
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(creating&&input.value!==repeat.value){repeat.setCustomValidity('비밀번호가 일치하지 않습니다.');repeat.reportValidity();return;}
      dialog.close('save');
    });
    repeat.addEventListener('input',()=>repeat.setCustomValidity(''));input.addEventListener('input',()=>repeat.setCustomValidity(''));
    actions.append(cancel,submit);form.append(heading,note,input);if(creating)form.append(repeat);form.append(actions);dialog.append(form);
    dialog.addEventListener('close',()=>{const password=dialog.returnValue==='save'?input.value:null;input.value='';repeat.value='';dialog.remove();resolve(password);},{once:true});
    document.body.append(dialog);dialog.showModal();input.focus();
  });
}
function backupReady(){
  aiEditReady();
  if(runningMultiActions.size||activeActionTimers.size||allPlayingAudio.size||knobPresses.size||logicPresses.size||multiPhysicalPresses.size||sidePressTimers.size)
    throw Error('진행 중인 동작을 먼저 중단하세요.');
}
let backupUiBusy=false;
async function inspectPlainBackupFormat(format,selection){
  if(format!=='plain')return format;
  backupReady();
  if(!window.deckBridge?.scanBackup)throw Error('민감정보 검사 기능을 사용할 수 없습니다.');
  if(!persist(false))throw Error('프로필 저장 실패');
  const result=await window.deckBridge.scanBackup(window.D200XPanelIcons.exportConfig(),selection);
  if(!result||!Array.isArray(result.findings)||!Number.isInteger(result.total))throw Error('백업 민감정보 검사 결과가 올바르지 않습니다.');
  if(!result.total&&!result.incomplete)return format;
  const shown=result.findings.slice(0,24);
  const extra=Math.max(0,result.total-shown.length);
  const detail=shown.map(item=>item.type+' · '+item.location).join('\n')
    +(extra?'\n외 '+extra+'건':'')+(result.incomplete?'\n일부 데이터의 검사 범위를 초과했습니다.':'');
  const decision=await window.DeckForgeDialogs.show({
    title:'백업 민감정보 검사 결과',kind:'warning',
    intro:result.total?'개인정보 또는 인증정보로 추정되는 항목 '+result.total+'건이 발견되었습니다.':'모든 항목을 검사하지 못했습니다.',
    detailLabel:'추정 항목과 저장 위치',detail:detail||'검사하지 못한 항목이 있습니다.',
    warning:'실제 값은 표시하지 않습니다. 검사는 일부 정보를 놓치거나 잘못 탐지할 수 있습니다. 일반 백업은 암호화되지 않습니다.',
    ask:true,cancelLabel:'취소',alternateLabel:'일반 백업 유지',actionLabel:'암호화 백업'
  });
  if(decision===false)return null;
  return decision===true?'encrypted':'plain';
}

/* Shared expandable backup/restore item list. Rendering never changes the
   selection: collapsing a group only hides its content. */
function makeBackupGroups(definitions,makeRow){
  const root=document.createElement('div');root.className='deckforge-backup-group-list';
  const groups={},rows=[];
  for(const definition of definitions){
    const section=document.createElement('section');section.className='deckforge-backup-group';
    const head=document.createElement('button');head.type='button';head.className='deckforge-backup-group-header';
    const arrow=document.createElement('span');arrow.className='deckforge-backup-group-arrow';
    const title=document.createElement('strong');title.textContent=definition.label;
    const count=document.createElement('span');count.className='deckforge-backup-group-count';
    head.append(arrow,title,count);
    const body=document.createElement('div');body.className='deckforge-backup-group-content';
    const own=[];
    for(const item of definition.items){
      const record=makeRow(definition.key,item);
      if(!record||!record.element||!record.check)throw Error('백업 항목을 표시할 수 없습니다.');
      record.id=item.id;record.kind=definition.key;
      own.push(record);rows.push(record);body.append(record.element);
    }
    let open=definition.key==='profiles';
    const setOpen=value=>{
      open=value;body.hidden=!open;arrow.textContent=open?'▾':'▸';
      head.setAttribute('aria-expanded',String(open));
    };
    head.addEventListener('click',()=>setOpen(!open));
    setOpen(open);section.append(head,body);root.append(section);
    groups[definition.key]=own;
    groups[definition.key].countNode=count;
  }
  function update(){
    let chosen=0;
    for(const own of Object.values(groups)){
      const count=own.filter(row=>row.check.checked).length;
      chosen+=count;own.countNode.textContent=count+' / '+own.length;
    }
    return chosen;
  }
  update();
  return {root,groups,rows,update};
}
function backupGroupDefinitions(items){
  return [
    {key:'profiles',label:'프로필',items:items.profiles||[]},
    {key:'templates',label:'사용자 템플릿',items:items.templates||[]},
    {key:'packs',label:'사용자 아이콘팩',items:items.packs||[]},
    {key:'appearance',label:'기타',items:items.appearance?[{id:'appearance',name:'액션 목록 디자인'}]:[]}
  ].filter(group=>group.key==='profiles'||group.items.length);
}

async function showBackupConfirmation(location,format,account='',items){
  const drive=location==='drive',plain=format==='plain';
  if(!items||!Array.isArray(items.profiles)||!Array.isArray(items.templates)||!Array.isArray(items.packs))
    throw Error('백업 항목 목록을 읽을 수 없습니다.');
  const makeRow=(kind,item)=>{
    const element=document.createElement('div');element.className='deckforge-backup-group-row';
    const label=document.createElement('label');label.className='deckforge-backup-group-item';
    const check=document.createElement('input');check.type='checkbox';check.checked=true;
    const name=document.createElement('span');name.textContent=item.name;
    label.append(check,name);element.append(label);
    return {element,check};
  };
  const picker=makeBackupGroups(backupGroupDefinitions(items),makeRow);
  const section=document.createElement('section');section.className='deckforge-backup-selection';
  const top=document.createElement('div');top.className='deckforge-backup-selection-tools';
  const heading=document.createElement('strong');heading.textContent='백업할 항목';
  const summary=document.createElement('span');summary.className='deckforge-backup-selection-count';
  const tools=document.createElement('div');tools.className='deckforge-backup-selection-buttons';
  const all=document.createElement('button');all.type='button';all.textContent='모두 선택';
  const none=document.createElement('button');none.type='button';none.textContent='모두 해제';
  tools.append(all,none);top.append(heading,summary,tools);
  const notice=document.createElement('div');notice.className='deckforge-backup-selection-notice';
  const selection=()=>({
    profiles:(picker.groups.profiles||[]).filter(row=>row.check.checked).map(row=>row.id),
    templates:(picker.groups.templates||[]).filter(row=>row.check.checked).map(row=>row.id),
    packs:(picker.groups.packs||[]).filter(row=>row.check.checked).map(row=>row.id),
    appearance:!!picker.groups.appearance?.some(row=>row.check.checked)
  });
  const refresh=()=>{
    const count=picker.update();
    summary.textContent=count+' / '+picker.rows.length+'개 선택';
    notice.textContent=picker.groups.profiles.some(row=>row.check.checked)
      ?'선택한 항목만 백업 파일에 저장됩니다.'
      :'백업할 프로필을 최소 하나 선택하세요.';
    notice.classList.toggle('is-warning',!picker.groups.profiles.some(row=>row.check.checked));
  };
  for(const row of picker.rows)row.check.addEventListener('change',refresh);
  all.addEventListener('click',()=>{for(const row of picker.rows)row.check.checked=true;refresh();});
  none.addEventListener('click',()=>{for(const row of picker.rows)row.check.checked=false;refresh();});
  section.append(top,picker.root,notice);refresh();
  const accepted=await window.DeckForgeDialogs.show({
    title:drive?'Google Drive 백업 확인':'로컬 백업 확인',
    kind:plain?'warning':'info',
    intro:drive?'선택한 항목을 Google Drive에 백업합니다.':'선택한 항목을 내 PC에 백업합니다.',
    fields:[
      ...(drive?[{label:'Google 계정',value:account}]:[]),
      {label:'저장 위치',value:drive?'내 드라이브 / DeckForge Backups':'내 PC / 다음 단계에서 폴더 선택'},
      {label:'백업 형식',value:plain?'일반 DFJSON (암호화 없음)':'암호화 백업 (.dfbackup)'}
    ],
    content:section,
    onAccept:()=>selection().profiles.length>0,
    excluded:['별도 로그인 정보 및 HA 연결 토큰 파일','플러그인 프로그램 및 전역 설정'],
    warning:plain?'일반 DFJSON은 암호화되지 않아 선택된 프로필의 민감한 설정이 노출될 수 있습니다.':'',
    ask:true,actionLabel:'백업 시작'
  });
  return accepted?selection():null;
}
function chooseBackupOptions(){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog';dialog.style.width='min(420px, calc(100vw - 32px))';
    const form=document.createElement('form');form.method='dialog';
    const title=document.createElement('strong');title.textContent='백업 및 복원';
    const field=(name,choices)=>{
      const label=document.createElement('label');label.style.display='grid';label.style.gap='5px';label.textContent=name;
      const select=document.createElement('select');select.setAttribute('aria-label',name);select.style.cssText='width:100%;background:#414141;color:#eee;border:1px solid #777;border-radius:5px;padding:8px';
      for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      label.append(select);form.append(label);return {label,select};
    };
    form.append(title);
    const operation=field('작업',[['backup','백업'],['restore','복원']]);
    const location=field('저장 위치',[['local','내 PC'],['drive','Google Drive']]);
    const format=field('파일 형식',[['encrypted','암호화 백업 (.dfbackup)'],['plain','일반 백업 (.dfjson)']]);
    const note=document.createElement('div');note.style.fontSize='12px';
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=()=>dialog.close('cancel');
    const submit=document.createElement('button');submit.type='submit';submit.className='primary';
    function refresh(){
      const restoring=operation.select.value==='restore',cloud=location.select.value==='drive';
      format.label.style.display=restoring&&cloud?'none':'grid';
      submit.textContent=restoring?'복원 파일 선택':'백업 시작';
      note.textContent=restoring?'복원 전 기존 데이터의 암호화 안전 백업을 저장합니다.':'전체 프로필·템플릿·사용자 아이콘팩·액션 목록 디자인을 저장합니다.'+(format.select.value==='plain'?' 일반 DFJSON은 암호화되지 않아 민감한 설정이 노출될 수 있습니다.':'');
    }
    for(const input of [operation.select,location.select,format.select])input.onchange=refresh;
    actions.append(cancel,submit);form.append(note,actions);dialog.append(form);
    form.onsubmit=event=>{event.preventDefault();dialog.close('save');};
    dialog.addEventListener('close',()=>{const result=dialog.returnValue==='save'?{operation:operation.select.value,location:location.select.value,format:format.select.value}:null;dialog.remove();resolve(result);},{once:true});
    refresh();document.body.append(dialog);dialog.showModal();
  });
}
async function openBackupManager(){
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  const choice=await chooseBackupOptions();if(!choice)return;
  if(choice.operation==='backup'){
    if(choice.location==='drive')await createGoogleBackup(choice.format);
    else await createLocalBackup(choice.format);
  }else if(choice.location==='drive')await restoreGoogleBackup();
  else await restoreBackup(null,choice.format);
}
async function createLocalBackup(format='encrypted'){
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  backupUiBusy=true;
  try{
    backupReady();
    if(!window.deckBridge?.createBackup)throw Error('Windows EXE에서 사용할 수 있습니다.');
    if(!persist(false))throw Error('프로필 저장 실패');
    const selection=await showBackupConfirmation('local',format,'',
      await window.deckBridge.getBackupItems(window.D200XPanelIcons.exportConfig()));
    if(!selection)return;
    const backupFormat=await inspectPlainBackupFormat(format,selection);if(!backupFormat)return;
    const password=backupFormat==='plain'?'':await askBackupPassword(true);if(password===null)return;
    backupReady();if(!persist(false))throw Error('프로필 저장 실패');
    const appearance=window.D200XPanelIcons.exportConfig();
    const result=await window.deckBridge.createBackup(password,appearance,backupFormat,selection);
    if(result){
      window.d200xActionStatus?.('로컬 백업 파일 저장 완료 · '+result.filename);
      await window.DeckForgeDialogs.show({title:'로컬 백업 완료',kind:'success',intro:'백업 파일이 정상적으로 저장되었습니다.',fields:[{label:'저장 위치',value:'내 PC'},{label:'백업 형식',value:backupFormat==='plain'?'일반 DFJSON (암호화 없음)':'암호화 백업 (.dfbackup)'}],detailLabel:'저장된 파일',detail:result.file});
    }
  }finally{backupUiBusy=false;}
}
async function googleConnect(){
  if(!window.deckBridge?.driveConnect)throw Error('Windows EXE에서 사용할 수 있습니다.');
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  backupUiBusy=true;
  try{
    if(!await window.DeckForgeDialogs.show({title:'Google Drive 계정 연결',kind:'info',intro:'Google Cloud에서 Drive API를 활성화하고 발급받은 Desktop app OAuth 클라이언트 JSON을 선택합니다.',fields:[{label:'인증 방법',value:'기본 브라우저에서 Google 계정 로그인'},{label:'연결 정보',value:'Windows 보안 저장소에 보관'},{label:'접근 범위',value:'DeckForge가 만든 Drive 파일'}],ask:true,actionLabel:'계정 연결'}))return;
    const result=await window.deckBridge.driveConnect();
    if(result?.connected){window.d200xActionStatus?.('Google Drive 연결 완료: '+result.email);await window.DeckForgeDialogs.show({title:'Google Drive 연결 완료',kind:'success',intro:'Google 계정 연결이 완료되었습니다.',fields:[{label:'Google 계정',value:result.email}]});}
  }finally{backupUiBusy=false;}
}
async function googleStatus(){
  if(!window.deckBridge?.driveStatus)throw Error('Windows EXE에서 사용할 수 있습니다.');
  const result=await window.deckBridge.driveStatus();
  await window.DeckForgeDialogs.show({title:result.connected?'Google Drive 연결됨':'Google Drive 연결 필요',kind:result.connected?'success':'warning',intro:result.connected?'Google Drive 계정이 연결되어 있습니다.':'먼저 Google 계정 연결을 선택하세요.',fields:result.connected?[{label:'Google 계정',value:result.email}]:[]});
}
async function googleDisconnect(){
  if(!window.deckBridge?.driveDisconnect)throw Error('Windows EXE에서 사용할 수 있습니다.');
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  if(!await window.DeckForgeDialogs.show({title:'Google Drive 연결 해제',kind:'warning',intro:'이 PC의 Google Drive 연결 정보만 삭제합니다. Drive에 저장된 백업 파일은 유지됩니다.',ask:true,actionLabel:'연결 해제'}))return;
  await window.deckBridge.driveDisconnect();window.d200xActionStatus?.('Google Drive 연결 해제 완료');
}
async function createGoogleBackup(format='encrypted'){
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  backupUiBusy=true;
  try{
    backupReady();if(!window.deckBridge?.driveCreate)throw Error('Windows EXE에서 사용할 수 있습니다.');
    const account=await window.deckBridge.driveStatus();
    if(!account.connected)throw Error('Google Drive 계정을 먼저 연결하세요.');
    if(!persist(false))throw Error('프로필 저장 실패');
    const selection=await showBackupConfirmation('drive',format,account.email,
      await window.deckBridge.getBackupItems(window.D200XPanelIcons.exportConfig()));
    if(!selection)return;
    const backupFormat=await inspectPlainBackupFormat(format,selection);if(!backupFormat)return;
    const password=backupFormat==='plain'?'':await askBackupPassword(true);if(password===null)return;
    backupReady();if(!persist(false))throw Error('프로필 저장 실패');
    window.d200xActionStatus?.('Google Drive 백업 업로드 중…');
    const result=await window.deckBridge.driveCreate(password,window.D200XPanelIcons.exportConfig(),account.email,backupFormat,selection);
    window.d200xActionStatus?.('Google Drive 백업 업로드 완료 · '+result.name);
    await window.DeckForgeDialogs.show({title:'Google Drive 백업 완료',kind:'success',intro:'백업 파일 업로드 및 파일 검증이 완료되었습니다.',fields:[{label:'Google 계정',value:result.email},{label:'저장 위치',value:'내 드라이브 / DeckForge Backups'},{label:'백업 형식',value:backupFormat==='plain'?'일반 DFJSON (암호화 없음)':'암호화 백업 (.dfbackup)'}],detailLabel:'저장된 파일명',detail:result.name});
  }finally{backupUiBusy=false;}
}
function chooseGoogleBackup(list){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog';
    dialog.style.width='min(600px, calc(100vw - 32px))';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('strong');heading.textContent='Google Drive 백업 선택';
    const note=document.createElement('div');note.textContent=list.email+' · '+list.items.length+'개'+(list.more?' (최근 목록만 표시)':'');
    const select=document.createElement('select');select.setAttribute('aria-label','복원할 Google Drive 백업');select.required=true;select.style.maxWidth='100%';
    for(const item of list.items){
      const option=document.createElement('option');option.value=item.id;
      option.textContent=new Date(item.createdTime).toLocaleString()+' · '+(item.size/1024/1024).toFixed(1)+' MB · '+item.name;
      select.append(option);
    }
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=()=>dialog.close('cancel');
    const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='선택';
    form.onsubmit=event=>{event.preventDefault();if(select.value)dialog.close('save');};
    actions.append(cancel,submit);form.append(heading,note,select,actions);dialog.append(form);
    dialog.addEventListener('close',()=>{const id=dialog.returnValue==='save'?select.value:null;dialog.remove();resolve(id);},{once:true});
    document.body.append(dialog);dialog.showModal();
  });
}
async function restoreGoogleBackup(){
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  backupUiBusy=true;let selected=null,list;
  try{
    backupReady();if(!window.deckBridge?.driveList)throw Error('Windows EXE에서 사용할 수 있습니다.');
    list=await window.deckBridge.driveList();
    if(!list.items.length){await window.DeckForgeDialogs.show({title:'백업 파일 없음',kind:'info',intro:'Google Drive의 DeckForge Backups 폴더에 복원할 백업 파일이 없습니다.'});return;}
    selected=await chooseGoogleBackup(list);
  }finally{backupUiBusy=false;}
  if(selected)await restoreBackup({id:selected,email:list.email},list.items.find(item=>item.id===selected)?.name.endsWith('.dfjson')?'plain':'encrypted');
}
function chooseRestorePlan(info){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='profile-name-dialog deckforge-restore-dialog';
    dialog.style.cssText='width:min(650px, calc(100vw - 32px));max-height:85vh;overflow:auto';
    const form=document.createElement('form');form.method='dialog';
    const heading=document.createElement('strong');heading.textContent='복원 방식 및 대상';
    const note=document.createElement('div');note.textContent=info.filename+(info.legacy?' · 이전 JSON 형식':' · '+new Date(info.createdAt).toLocaleString());
    note.style.cssText='overflow-wrap:anywhere;font-size:12px;color:#bbb';
    function selectField(name,choices){
      const label=document.createElement('label');label.style.cssText='display:grid;gap:5px';label.textContent=name;
      const select=document.createElement('select');select.style.cssText='width:100%;background:#414141;color:#eee;border:1px solid #777;border-radius:5px;padding:8px';
      select.setAttribute('aria-label',name);
      for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      label.append(select);return {label,select};
    }
    const mode=selectField('복원 방식',[
      ['select','선택 복원 — 복원할 프로필 선택'],
      ['all','전체 복원 — 모든 프로필을 백업 당시 상태로 교체']
    ]);
    const modeNote=document.createElement('div');modeNote.style.cssText='font-size:12px;color:#bbb';
    const groups={profiles:[],templates:[],packs:[]},rows=[];
    const types={profiles:'프로필',templates:'템플릿',packs:'아이콘팩'};
    let appearance=null;
    const makeRow=(kind,item)=>{
      const element=document.createElement('div');element.className='deckforge-backup-group-row';
      const left=document.createElement('div');left.className='deckforge-backup-row-left';
      const nameLabel=document.createElement('label');nameLabel.className='deckforge-backup-group-item';
      const check=document.createElement('input');check.type='checkbox';check.checked=false;
      const name=document.createElement('span');name.textContent=item.name;
      nameLabel.append(check,name);left.append(nameLabel);element.append(left);
      if(kind==='appearance'){
        appearance=check;return {element,check};
      }
      const status=document.createElement('div');status.className='deckforge-backup-row-status';
      status.style.color=item.matches?'#ffb777':'#9ccdb0';
      status.textContent=item.matches?'같은 이름 있음':'새 '+types[kind]+' (선택 시 추가)';
      left.append(status);
      let policy=null;
      if(item.matches){
        policy=document.createElement('select');policy.className='deckforge-backup-conflict-select';
        policy.setAttribute('aria-label',types[kind]+' '+item.name+' 이름 중복 처리');
        for(const [value,text] of [['keep','기존 유지'],['overwrite','백업본으로 교체'],['rename','새 '+types[kind]+' 이름으로 추가']]){
          const option=document.createElement('option');option.value=value;option.textContent=text;policy.append(option);
        }
        policy.value='keep';policy.disabled=true;element.append(policy);
      }
      // No placeholder in the empty right column.
      const row={id:item.id,kind,check,policy,status,matches:item.matches};
      groups[kind].push(row);rows.push(row);
      return {element,check,policy};
    };
    const picker=makeBackupGroups(backupGroupDefinitions(info.items),makeRow);
    const listTools=document.createElement('div');listTools.className='deckforge-backup-selection-tools';
    const listTitle=document.createElement('strong');listTitle.textContent='복원할 항목';
    const count=document.createElement('span');count.className='deckforge-backup-selection-count';
    const tools=document.createElement('div');tools.className='deckforge-backup-selection-buttons';
    const selectAll=document.createElement('button');selectAll.type='button';selectAll.textContent='모두 선택';
    const clearAll=document.createElement('button');clearAll.type='button';clearAll.textContent='모두 해제';
    tools.append(selectAll,clearAll);listTools.append(listTitle,count,tools);
    const list=picker.root;list.classList.add('deckforge-backup-restore-list');
    const bulk=document.createElement('div');bulk.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap';
    const bulkTitle=document.createElement('label');bulkTitle.textContent='같은 이름의 항목 일괄 설정';
    const bulkSelect=document.createElement('select');bulkSelect.style.cssText='width:210px;max-width:100%;background:#414141;color:#eee;border:1px solid #777;border-radius:5px;padding:6px';
    bulkSelect.setAttribute('aria-label','같은 이름의 항목 일괄 설정');
    for(const [value,text] of [['','일괄 처리 선택'],['keep','기존 유지'],['overwrite','백업본으로 교체'],['rename','새 이름으로 추가']]){
      const option=document.createElement('option');option.value=value;option.textContent=text;bulkSelect.append(option);
    }
    bulk.append(bulkTitle,bulkSelect);
    const explanation=document.createElement('div');explanation.style.cssText='font-size:11px;color:#bbb';
    explanation.textContent='기존 유지: 현재 항목 변경 없음 · 백업본으로 교체: 해당 항목 전체 덮어쓰기 · 새 이름으로 추가: 기존 항목 유지하고 (복원) 이름으로 추가';
    const warning=document.createElement('div');warning.style.fontSize='12px';
    const actions=document.createElement('div');actions.className='profile-name-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=()=>dialog.close('cancel');
    const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='복원 미리보기';
    function refresh(){
      const all=mode.select.value==='all',selected=rows.filter(row=>row.check.checked);
      modeNote.textContent=all?'현재 프로필뿐 아니라 템플릿·아이콘팩과 백업에 포함된 액션 목록 디자인까지 백업 당시 상태로 교체합니다.':'프로필·템플릿·아이콘팩 중 원하는 항목을 선택하세요. 이름 중복이 없는 항목은 새로 추가됩니다.';
      listTools.hidden=all;list.hidden=all;
      const conflicting=selected.filter(row=>row.policy);
      bulk.hidden=all||!conflicting.length;explanation.hidden=all||!conflicting.length;
      for(const row of rows){
        row.check.disabled=all;
        if(row.policy)row.policy.disabled=all||!row.check.checked;
        else row.status.textContent=row.check.checked?'새 '+types[row.kind]+' 추가':'새 '+types[row.kind]+' (선택 시 추가)';
      }
      if(appearance)appearance.disabled=all;
      const chosen=picker.update();
      count.textContent=chosen+' / '+picker.rows.length+'개 선택';
      warning.textContent=all?'주의: 백업에 없는 현재 프로필·템플릿·아이콘팩은 삭제됩니다. 복원 전 안전 백업을 저장합니다.'
        :'같은 이름의 항목은 해당 행에서 처리 방법을 선택하세요. 복원 전 기존 설정의 안전 백업을 저장합니다.';
      warning.style.color=all?'#ffb777':'#bbb';
      submit.disabled=!all&&!selected.some(row=>!row.policy||row.policy.value!=='keep')&&!(appearance?.checked);
    }
    selectAll.onclick=()=>{for(const row of picker.rows)row.check.checked=true;refresh();};
    clearAll.onclick=()=>{for(const row of picker.rows)row.check.checked=false;refresh();};
    bulkSelect.onchange=()=>{if(!bulkSelect.value)return;for(const row of rows)if(row.check.checked&&row.policy)row.policy.value=bulkSelect.value;bulkSelect.value='';refresh();};
    mode.select.onchange=refresh;
    for(const row of picker.rows)row.check.onchange=refresh;
    for(const row of rows)if(row.policy)row.policy.onchange=refresh;
    form.onsubmit=event=>{event.preventDefault();if(!submit.disabled)dialog.close('save');};
    actions.append(cancel,submit);
    form.append(heading,note,mode.label,modeNote,listTools,list,bulk,explanation,warning,actions);
    dialog.append(form);refresh();
    dialog.addEventListener('close',()=>{
      const result=dialog.returnValue==='save'?{
        mode:mode.select.value,conflict:'keep',appearance:!!appearance?.checked,
        ...Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.filter(row=>row.check.checked).map(row=>row.id)])),
        conflicts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,Object.fromEntries(v.filter(row=>row.check.checked&&row.policy).map(row=>[row.id,row.policy.value]))]))
      }:null;
      dialog.remove();resolve(result);
    },{once:true});
    document.body.append(dialog);dialog.showModal();
  });
}
async function restoreBackup(cloud=null,format='encrypted'){
  if(backupUiBusy)throw Error('백업 작업이 진행 중입니다.');
  backupUiBusy=true;let info=null;
  try{
    backupReady();
    if(!window.deckBridge?.previewBackup||cloud&&!window.deckBridge?.drivePreview)throw Error('Windows EXE에서 사용할 수 있습니다.');
    const password=format==='plain'?await askBackupPassword(true,true):await askBackupPassword(false);if(password===null)return;
    backupReady();if(!persist(false))throw Error('프로필 저장 실패');
    const before=JSON.stringify(state),appearance=window.D200XPanelIcons.exportConfig();
    if(cloud)window.d200xActionStatus?.('Google Drive 백업 다운로드 및 검증 중…');
    info=cloud?await window.deckBridge.drivePreview(cloud.id,password,appearance,cloud.email):await window.deckBridge.previewBackup(password,appearance,format);if(!info)return;
    backupReady();
    if(before!==JSON.stringify(state)||JSON.stringify(appearance)!==JSON.stringify(window.D200XPanelIcons.exportConfig()))
      throw Error('미리보기 중 편집 내용이 변경되었습니다. 다시 복원하세요.');
    if(!window.deckBridge.planBackup)throw Error('최신 DeckForge 버전이 필요합니다.');
    let plan=null;
    for(;;){
      const options=await chooseRestorePlan(info);if(!options)return;
      backupReady();
      if(before!==JSON.stringify(state)||JSON.stringify(appearance)!==JSON.stringify(window.D200XPanelIcons.exportConfig()))throw Error('설정이 변경되었습니다. 다시 복원하세요.');
      try{plan=await window.deckBridge.planBackup(info.id,options);}
      catch(error){await window.DeckForgeDialogs.show({title:'복원 계획 오류',kind:'error',intro:'복원 계획을 만들 수 없습니다.',detailLabel:'오류 내용',detail:String(error?.message||error)});return;}
      const r=plan.report,labels={profiles:'프로필',templates:'템플릿',packs:'아이콘팩'};
      const actionName=d=>d.action==='keep'?'기존 유지':d.action==='overwrite'?'백업본으로 교체':d.action==='rename'?'새 '+labels[d.kind]+' 이름으로 추가':'새 '+labels[d.kind]+' 추가';
      const details=r.details.slice(0,18).map(d=>labels[d.kind]+' · '+d.name+(d.resultName&&d.resultName!==d.name?' → '+d.resultName:'')+' : '+actionName(d)).join('\n');
      const message=r.mode==='all'?'전체 복원: 백업 당시 상태로 교체합니다. 백업에 없는 기존 항목은 삭제됩니다.':'선택 복원: 새 항목 '+r.added+'개 · 백업본으로 교체 '+r.replaced+'개 · 새 이름으로 추가 '+r.renamed+'개 · 기존 유지 '+r.kept+'개\n'+details+(r.details.length>18?'\n… 나머지 항목 포함':'')+(r.missingLinks?'\n주의: 연결할 대상 프로필을 찾지 못한 이동 버튼 '+r.missingLinks+'개는 잘못된 대상을 실행하지 않도록 연결 해제합니다.':'');
      if(await window.DeckForgeDialogs.show({
        title:r.mode==='all'?'전체 복원 최종 확인':'선택 복원 최종 확인',
        kind:r.mode==='all'?'warning':'info',
        intro:r.mode==='all'?'백업 당시 상태로 교체합니다. 백업에 없는 현재 항목은 삭제됩니다.':'선택한 항목을 다음 내용으로 복원합니다.',
        fields:[{label:'복원 후 프로필',value:plan.profiles+'개'},{label:'복원 후 템플릿',value:plan.templates+'개'},{label:'복원 후 아이콘팩',value:plan.packs+'개'}],
        detailLabel:'복원 적용 내역',detail:message,
        warning:'복원 전에 현재 설정의 암호화 안전 백업을 별도로 저장합니다.',
        ask:true,actionLabel:'복원 실행'
      }))break;
      return;
    }
    backupReady();
    if(before!==JSON.stringify(state)||JSON.stringify(appearance)!==JSON.stringify(window.D200XPanelIcons.exportConfig()))throw Error('설정이 변경되었습니다. 다시 복원하세요.');
    // Apply the existing appearance validator/storage first. If the protected
    // main transaction fails, roll this small localStorage change back.
    if(!window.D200XPanelIcons.restoreConfig(plan.appearance))throw Error('액션 목록 디자인을 복원할 수 없습니다.');
    let result;
    try{
      result=window.deckBridge.commitBackup(info.id,plan.token);
      if(!result?.ok)throw Error(result?.error||'백업 복원 실패');
    }catch(error){
      if(!window.D200XPanelIcons.restoreConfig(appearance))throw Error('복원 실패 및 액션 목록 디자인 원복 실패: '+String(error?.message||error));
      throw error;
    }
    state=result.state;inspectorSession=null;aiEditCapture=null;aiEditUndo=null;
    controlGesture='down';pageStructureEpoch++;hotkeySwitchPositions.clear();lastHardwareDown.clear();
    invalidateSidePresses();clearMultiPhysicalPresses();cancelFolderAutoExit();
    legacyPackRequest=null;await refreshImportedIconPacks();
    render();renderLibrary();window.scheduleDeckSync?.();
    window.d200xActionStatus?.('백업 복원 완료 · 이전 데이터 별도 보관');
    await window.DeckForgeDialogs.show({title:'백업 복원 완료',kind:'success',intro:'선택한 백업의 복원이 완료되었습니다. 복원 전 데이터는 안전 백업으로 보관했습니다.',detailLabel:'복원 전 안전 백업 파일',detail:result.safetyFile});
  }finally{
    if(info)try{window.deckBridge.cancelBackup(info.id);}catch{}
    backupUiBusy=false;
  }
}
function bindSidebarHeader(){
  const trigger=$("profile-trigger"),menu=$("profile-menu");
  window.deckBridge?.appVersion?.().then(version=>{
    $('current-version').textContent=version;
    document.title='DeckForge '+version+' — D200X 편집기';
  }).catch(()=>{});
  const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
  const run=(fn)=>async()=>{close();try{await fn();}catch(error){window.d200xActionStatus?.('프로필 작업 실패: '+String(error?.message||error));}};
  const renderProfiles=()=>{
    menu.replaceChildren();
    $("profile-name").textContent=state.profileNames.find(p=>p.id===state.profileId)?.name||'기본 프로필';
    const entry=(parent,label,fn,cls='')=>{
      const button=document.createElement('button');button.type='button';button.textContent=label;button.className=cls;
      button.addEventListener('click',fn);parent.append(button);return button;
    };
    for(const profile of state.profileNames){
      const row=document.createElement('div');row.className='profile-list-row';
      const profileSelect=entry(row,(profile.id===state.profileId?'✓ ':'　')+profile.name,run(()=>{
        if(DeckCore.switchProfile(state,profile.id)){controlGesture='down';persist();render();}
      }),'profile-list-select');
      profileSelect.dataset.profileId=profile.id;
      const gear=entry(row,'⚙',()=>{const open=tools.hidden;menu.querySelectorAll('.profile-row-tools').forEach(el=>el.hidden=true);tools.hidden=!open;},
        'profile-row-gear');
      gear.title=profile.name+' 설정';gear.setAttribute('aria-label',profile.name+' 설정');
      const tools=document.createElement('div');tools.className='profile-row-tools';tools.hidden=true;
      entry(tools,'이름 변경',run(async()=>{
        const name=await askProfileName('프로필 이름 변경',profile.name);
        if(name!==null&&DeckCore.renameProfile(state,profile.id,name)){persist();render();}
      }));
      entry(tools,'프로필 복제',run(async()=>{
        const name=await askProfileName('복사본 이름',profile.name+' 복사본');
        if(name===null)return;
        const id=DeckCore.createProfile(state,name,true,profile.id);
        if(id){DeckCore.switchProfile(state,id);persist();render();}
      }));
      entry(tools,'템플릿으로 저장',run(async()=>{
        aiEditReady();
        const name=await askProfileName('템플릿 이름',profile.name);
        if(name===null)return;
        aiEditReady();
        const {next,template}=DeckCore.saveProfileTemplate(state,profile.id,name);
        aiEditStore(next);
        window.d200xActionStatus?.('템플릿 저장 완료: '+template.name);
      }));
      entry(tools,'프로필 JSON 내보내기',run(()=>{
        const payload=DeckCore.exportSingleProfile(state,profile.id);
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob),link=document.createElement('a');
        const safeName=profile.name.replace(/[\\/:*?"<>|]/g,'_').replace(/[\u0000-\u001f]/g,'_').trim().slice(0,64)||'profile';
        try{
          link.href=url;
          link.download='D200X-profile-'+safeName+'.json';
          document.body.append(link);link.click();
          window.d200xActionStatus?.('개별 프로필 JSON 내보내기: '+profile.name);
        }finally{
          link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }
      }));
      entry(tools,(profile.smartEnabled?'✓ ':'')+'Smart Profile 사용',()=>{
        profile.smartEnabled=!profile.smartEnabled;
        state.smartProfilesEnabled=state.profileNames.some(p=>p.smartEnabled);
        persist();renderProfiles();
      });
      entry(tools,'연결 프로그램 선택'+(profile.appPath?' · '+profile.appPath.split(String.fromCharCode(92)).pop():''),run(async()=>{
        if(!window.deckBridge?.choosePath)return;
        const path=await window.deckBridge.choosePath('app');
        if(path&&DeckCore.setProfileApp(state,profile.id,path)){persist();renderProfiles();}
      }));
      const del=entry(tools,'프로필 삭제',run(()=>{
        if(state.profileNames.length<=1)return;
        if(confirm('프로필 "'+profile.name+'"과 설정을 삭제하시겠습니까?')){
          if(DeckCore.deleteProfile(state,profile.id)){
            state.smartProfilesEnabled=state.profileNames.some(p=>p.smartEnabled);
            persist();render();
          }
        }
      }));
      del.disabled=state.profileNames.length<=1;
      row.append(tools);menu.append(row);
    }
    menu.append(document.createElement('hr'));
    entry(menu,'＋ 새 프로필',run(async()=>{
      const name=await askProfileName('새 프로필 이름','새 프로필');
      if(name===null)return;
      const id=DeckCore.createProfile(state,name);
      if(id){DeckCore.switchProfile(state,id);persist();render();}
    }));
    const templatePanel=document.createElement('div');templatePanel.className='profile-global-panel';templatePanel.hidden=true;
    entry(menu,'사용자 템플릿 관리 ▸',()=>{templatePanel.hidden=!templatePanel.hidden;},'profile-global-trigger');
    const templates=(state.profileTemplates||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!templates.length){const empty=entry(templatePanel,'저장된 템플릿 없음',()=>{});empty.disabled=true;}
    for(const template of templates){
      const row=document.createElement('div');row.className='profile-list-row';
      entry(row,template.name+' · '+template.snapshot.pages.length+'페이지',run(async()=>{
        aiEditReady();
        const name=await askProfileName('템플릿으로 새 프로필 생성',template.name+' 복사본');
        if(name===null)return;
        aiEditReady();
        const result=DeckCore.applyProfileTemplate(state,template.id,name);
        if(!confirm('템플릿 "'+result.template.name+'"에서 새 프로필 "'+name+'"을 생성합니다. 기존 프로필은 변경하지 않습니다. 계속하시겠습니까?'))return;
        aiEditStore(result.next);
        window.d200xActionStatus?.('새 프로필 생성 완료: '+name+' · 프로필 목록에서 선택하세요.');
      }),'profile-list-select');
      const gear=entry(row,'⚙',()=>{const open=tools.hidden;menu.querySelectorAll('.profile-row-tools').forEach(el=>el.hidden=true);tools.hidden=!open;},'profile-row-gear');
      gear.setAttribute('aria-label',template.name+' 템플릿 설정');
      const tools=document.createElement('div');tools.className='profile-row-tools';tools.hidden=true;
      entry(tools,'이름 변경',run(async()=>{
        aiEditReady();
        const name=await askProfileName('템플릿 이름 변경',template.name);
        if(name===null)return;
        aiEditReady();aiEditStore(DeckCore.renameProfileTemplate(state,template.id,name));
      }));
      entry(tools,'템플릿 삭제',run(()=>{
        aiEditReady();
        if(!confirm('템플릿 "'+template.name+'"만 삭제하시겠습니까? 기존 프로필에는 영향이 없습니다.'))return;
        aiEditStore(DeckCore.deleteProfileTemplate(state,template.id));
      }));
      row.append(tools);templatePanel.append(row);
    }
    menu.append(templatePanel);
        entry(menu,'Fusion 360 명령 일괄 등록',run(async()=>{
      if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서만 이용할 수 있습니다.');
      const chosen=await window.deckBridge.chooseImportFile('fusion-batch');
      if(!chosen)return;
      const input=window.D200XFusionBatch.validate(JSON.parse(chosen.text));
      if(!sdkPlugins.some(plugin=>plugin.uuid===input.pluginUUID))
        throw Error('Fusion 360 플러그인을 먼저 설치해야 합니다.');
      if(state.profileNames.length>=50)throw Error('프로필 최대 50개 제한에 도달했습니다.');
      const pages=input.layoutPages?.length||Math.ceil(input.commands.length/window.D200XFusionBatch.KEYS_PER_PAGE);
      if(!confirm('Fusion 360 명령 '+input.commands.length+'개를 새 프로필 "'+
        input.profileName+'" ('+pages+'페이지)에 등록하시겠습니까?\\n'+
        '기존 프로필과 버튼은 보존됩니다.'))return;
      const snapshot=JSON.stringify(state);
      try{
        const outcome=window.D200XFusionBatch.apply(state,input,DeckCore);
        if(!persist()){
          state=JSON.parse(snapshot);
          throw Error('프로필 저장에 실패했습니다. 기존 데이터로 복구했습니다.');
        }
        render();renderLibrary();window.scheduleDeckSync?.();
        window.d200xActionStatus?.('Fusion 일괄 등록 완료: '+outcome.count+
          '개 · '+outcome.pageCount+'페이지 · '+outcome.profileName);
      }catch(error){
        state=DeckCore.migrateState(JSON.parse(snapshot));
        persist();render();
        throw error;
      }
    }));
  };
  refreshProfilesMenu=renderProfiles;
  renderProfiles();
  trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
  document.addEventListener('pointerdown',event=>{
    if(!menu.contains(event.target)&&!trigger.contains(event.target))close();
  });
  // The main settings screen remains explicitly disabled.
}
$("icon-pack-import").addEventListener("click",()=>importIconPackIntoLibrary(false));
$("icon-pack-folder-import").addEventListener("click",()=>importIconPackIntoLibrary(true));
$("close-icon-library").addEventListener("click",closeIconLibrary);
$("icon-library").addEventListener("click",event=>{if(event.target===$("icon-library"))closeIconLibrary();});
$("icon-library-search").addEventListener("input",renderIconLibrary);
$("icon-library-layout").addEventListener("click",()=>{
  const groups=$("icon-library-groups");groups.classList.toggle("compact");
  $("icon-library-layout").setAttribute("aria-pressed",String(groups.classList.contains("compact")));
});
$("custom-icon-file").addEventListener("change",event=>{
  const target=fileIconTarget,session=fileIconSession;
  fileIconTarget=null;fileIconSession=null;
  setIconFile(event.target.files?.[0],target,null,session);event.target.value="";
});
window.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!$("icon-library").hidden)closeIconLibrary();
  if(event.key==="Escape"&&!$("icon-maker").hidden)closeIconMaker();
});
["icon-maker-text","icon-maker-foreground","icon-maker-background"].forEach(id=>
  $(id).addEventListener("input",renderIconMaker));
$("icon-maker-close").addEventListener("click",closeIconMaker);
$("icon-maker-cancel").addEventListener("click",closeIconMaker);
$("icon-maker").addEventListener("click",event=>{if(event.target===$("icon-maker"))closeIconMaker();});
$("icon-maker-save").addEventListener("click",()=>{
  if(makerTarget)applyStateIconData(makerTarget,makerStateKey,$("icon-maker-canvas").toDataURL("image/png"),makerSession);
  closeIconMaker();
});
// General options: backup/restore is independent of the profile picker.
function bindSettingsMenu(){
  const trigger=$("settings-trigger"),menu=$("settings-menu"),update=$("check-update");
  const current=$("current-version"),latest=$("latest-version"),status=$("update-status");
  let requestNumber=0;
  const loadStatus=async()=>{
    const request=++requestNumber;
    update.disabled=true;latest.textContent='확인 중';status.textContent='설치 가능한 빌드 확인 중…';
    try{
      if(!window.deckBridge?.updateStatus)throw Error('Windows DeckForge에서만 사용할 수 있습니다.');
      const result=await window.deckBridge.updateStatus();
      if(request!==requestNumber||menu.hidden)return;
      if(result?.currentVersion)current.textContent=result.currentVersion;
      latest.textContent=result?.latestVersion||'확인 불가';
      update.disabled=result?.state!=='available';
      status.textContent=result?.state==='available'?(result.downloadUrl?'새 버전이 있습니다. 설치 파일(EXE)을 바로 다운로드합니다.':'새 버전이 있습니다. 설치 파일 페이지를 엽니다.'):
        result?.state==='current'?'최신 버전입니다.':'최신 빌드를 확인하지 못했습니다.';
    }catch{
      if(request!==requestNumber||menu.hidden)return;
      latest.textContent='확인 불가';status.textContent='네트워크 또는 GitHub 상태를 확인하세요.';
      update.disabled=true;
    }
  };
  const makeEntry=(parent,label,fn)=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.setAttribute('role','menuitem');button.addEventListener('click',fn);parent.append(button);return button;
  };
  const accountPanel=document.createElement('div');accountPanel.className='profile-global-panel';accountPanel.hidden=true;
  accountPanel.id='settings-drive-panel';accountPanel.setAttribute('role','group');
  const close=()=>{++requestNumber;menu.hidden=true;trigger.setAttribute('aria-expanded','false');accountPanel.hidden=true;accountToggle.textContent='Google 계정 관리 ▸';accountToggle.setAttribute('aria-expanded','false');};
  const run=(fn)=>async()=>{close();try{await fn();}catch(error){alert('백업 작업 실패: '+String(error?.message||error));}};
  makeEntry(menu,'백업 및 복원',run(openBackupManager));
  const accountToggle=makeEntry(menu,'Google 계정 관리 ▸',()=>{
    accountPanel.hidden=!accountPanel.hidden;accountToggle.textContent=accountPanel.hidden?'Google 계정 관리 ▸':'Google 계정 관리 ▾';
    accountToggle.setAttribute('aria-expanded',String(!accountPanel.hidden));
  });
  accountToggle.setAttribute('aria-controls',accountPanel.id);accountToggle.setAttribute('aria-expanded','false');
  for(const [name,fn] of [['Google 계정 연결',googleConnect],['연결 상태 확인',googleStatus],['연결 해제',googleDisconnect]])makeEntry(accountPanel,name,run(fn));
  menu.append(accountPanel);
  trigger.addEventListener('click',()=>{
    if(!menu.hidden){close();return;}
    menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    void loadStatus();
  });
  $('view-release-notes').addEventListener('click',async()=>{
    close();
    try{
      if(!window.deckBridge?.viewReleaseNotes)throw Error('Windows DeckForge에서만 사용할 수 있습니다.');
      await window.deckBridge.viewReleaseNotes();
    }catch(error){window.d200xActionStatus?.('변경사항 페이지 열기 실패: '+String(error?.message||error));}
  });
  update.addEventListener('click',async()=>{
    if(update.disabled)return;
    close();
    try{
      if(!window.deckBridge?.checkForUpdates)throw Error('Windows DeckForge에서만 사용할 수 있습니다.');
      const opened=await window.deckBridge.checkForUpdates();
      if(!opened)window.d200xActionStatus?.('설치 가능한 새 버전을 확인하지 못했습니다.');
    }catch(error){window.d200xActionStatus?.('업데이트 페이지 열기 실패: '+String(error?.message||error));}
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.contains(event.target)&&!trigger.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
}
bindSettingsMenu();
bindSidebarHeader();
const tabs=document.querySelectorAll('.library-tabs button');
tabs[1].disabled=false;tabs[1].removeAttribute('title');
tabs.forEach((button,index)=>button.addEventListener('click',()=>{
  libraryTab=index?'plugins':'keys';
  tabs.forEach((tab,i)=>tab.classList.toggle('active',i===index));
  updatePluginToolbar();
  renderLibrary();
  renderInspector();
}));
// Poll only when explicitly enabled. The native bridge refuses to identify
// foreground programs while the editor is not minimized.
let smartProfileBusy=false;
setInterval(async()=>{
  // Defer automatic profile switches while unsaved inspector edits exist.
  if(inspectorSession?.dirty||smartProfileBusy||!state.smartProfilesEnabled||runningMultiActions.size||
    !state.profileNames.some(p=>p.appPath)||!window.deckBridge?.foregroundApp)return;
  smartProfileBusy=true;
  try{
    const app=await window.deckBridge.foregroundApp();
    const matched=DeckCore.matchForegroundProfile(state,app);
    const activeProfile=state.profileNames.find(p=>p.id===state.profileId);
    const fallback=state.profileNames.find(p=>p.id==='default')?.id||state.profileNames[0]?.id;
    const id=matched||(activeProfile?.smartEnabled?fallback:null);
    if(id&&id!==state.profileId&&DeckCore.switchProfile(state,id)){
      cancelFolderAutoExit();lastHardwareDown.clear();
      persist();render();
    }
  }catch(error){
    console.warn('Smart Profile 확인 실패',String(error?.message||error));
  }finally{smartProfileBusy=false;}
},4000);

if(window.deckBridge?.onSdkEvent){
  window.deckBridge.onSdkEvent(message=>{
    const ctx=message?.context;
    if(message.kind==='settings'){
      const instance=sdkActionInstances().find(x=>x.context===ctx);
      if(instance&&message.settings&&typeof message.settings==='object'&&!Array.isArray(message.settings)){
        const item=sdkItemAtLocation(state,instance.slot,instance.gesture);
        const priorId=fusionCommandId(item);
        if(commitExternalSdkSettings(instance,message.settings)){
          if(isFusionAction(item)&&priorId!==fusionCommandId(item)){
            sdkVisuals.delete(ctx);fusionLiveContexts.delete(ctx);
            fusionOfflineContexts.delete(ctx);unverifiedFusionContexts.add(ctx);
          }
        }
      }
    }else if(message.kind==='pluginConnection'&&message.pluginUUID===FUSION_PLUGIN){
      if(message.connected)fusionConnected.add(FUSION_PLUGIN);
      else {fusionConnected.delete(FUSION_PLUGIN);fusionLiveContexts.clear();for(const [context] of sdkVisuals) {
        // Disconnected runtime art must not override the cached image.
        const entry=sdkActionInstances().find(x=>x.context===context);
        if(entry?.pluginUUID===FUSION_PLUGIN)sdkVisuals.delete(context);
      }}
      renderGrid();window.scheduleDeckSync?.();
    }else if(['setTitle','setImage','setState'].includes(message.kind)){
      const active=sdkActionInstances().find(x=>x.context===ctx);
      if(!active)return;
      const old=sdkVisuals.get(ctx)||{};
      if(message.kind==='setTitle'&&typeof message.payload?.title==='string')
        old.title=message.payload.title.slice(0,256);
      const validImage=message.kind==='setImage'&&typeof message.payload?.image==='string'&&
        /^data:image\/(png|jpeg|webp|svg\+xml);/.test(message.payload.image)&&
        message.payload.image.length<1024*1024;
      if(validImage)old.image=message.payload.image;
      if(message.kind==='setState')old.state=message.payload?.state;
      sdkVisuals.set(ctx,old);
      if(validImage){
        const cfg=active;
        if(cfg?.pluginUUID===FUSION_PLUGIN){
          // Refresh Fusion's actual add-in status when artwork changes, not
          // just on the periodic check; the SDK plugin is a separate process.
          void refreshFusionHealth();
          const disabled=fusionDisabledImage(old.image);
          if(disabled){
            fusionOfflineContexts.add(ctx);
            fusionLiveContexts.delete(ctx);
          }else{
            fusionOfflineContexts.delete(ctx);
            fusionLiveContexts.add(ctx);
            if(typeof cfg.settings?.commandId==='string'&&!unverifiedFusionContexts.has(ctx))
              void rememberFusionIcon(cfg.settings.commandId,old.image);
          }
        }
      }
      renderGrid();
      const selectedItem=DeckCore.visibleActions(state)[state.selected];
      if(!haPreviewStates.has(selectedItem))void refreshSelectedVisual();
      if(selectedItem)void refreshStateTitleCards(selectedItem);
      window.scheduleDeckSync?.();
    }else if(message.kind==='error')window.d200xActionStatus?.(message.message);
  });
}
$('key-grid').addEventListener('dragleave',event=>{
  const session=nativeGridDrag;
  if(session&&!session.armed&&!$('key-grid').contains(event.relatedTarget)){
    // A short handoff can produce dragleave before native DragEnter.
    setTimeout(()=>{if(nativeGridDrag===session&&!session.armed)clearNativeGridDrag(session,true);},1300);
  }
});
bindInspectorActionDrop();bindActionAppearance();renderLibrary();render();refreshSdkPlugins();
if(profileStorageFailure){
  const dialog=document.createElement('dialog');dialog.className='profile-name-dialog deckforge-input-dialog';
  const heading=document.createElement('strong');heading.textContent='프로필 파일을 읽지 못했습니다';
  const detail=document.createElement('p');detail.textContent='기존 프로필을 보호하기 위해 저장 기능이 차단되었습니다. 프로필 파일을 확인해 주세요.\n'+profileStorageError;
  const close=document.createElement('button');close.type='button';close.textContent='확인';close.className='primary';
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.append(heading,detail,close);document.body.append(dialog);dialog.showModal();
  window.d200xActionStatus?.('프로필 파일 읽기 실패: 저장 차단');
}
window.deckBridge?.onFusionLanguageChanged?.(()=>{void refreshFusionButtonLanguage();});
void refreshFusionButtonLanguage();
void refreshFusionHealth();
setInterval(()=>{if(sdkActionInstances().some(x=>x.pluginUUID===FUSION_PLUGIN))void refreshFusionHealth();},3000);
