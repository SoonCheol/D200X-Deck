"use strict";
/* Independent Stream Deck 7.6.1-oriented UI. No legacy Ulanzi inspector imports.
 * D200X physical key dispatch: page navigation and default-browser URL only.
 * Packaging rebuild marker: no runtime behavior changes. */
const ORIGINAL_CATALOG = [
  ["Soundboard", [["audio-play","오디오 재생","♫"],["audio-stop","오디오 정지","◼"]]],
  ["Stream Deck", [["timer","타이머","◴"],["brightness","밝기","☼"],["sleep","잠자기","☾"],["virtual","Virtual Stream Deck 토글","▣"]]],
  ["다중 동작", [["multi","다중 동작","▤"],["multi-switch","다중 동작 스위치","⇄"],["random","무작위 동작","⚄"],["logic","Key Logic","⇧"]]],
  ["시스템", [["website","웹사이트","◎"],["hotkey-switch","단축키 전환","⇄"],["hotkey","단축키","⌨"],["open","열기","▢"],["open-app","응용 프로그램 열기","▣"],["close","닫기","×"],["text","텍스트","¶"],["media","멀티미디어","♫"]]],
  ["탐색", [["folder","폴더 생성","▣"],["profile","프로필 전환","⇆"],["previous","이전 페이지","←"],["next","다음 페이지","→"],["goto","페이지로 이동","↗"],["indicator","페이지 표시기","①"]]],
  ["플러그인 · Home Assistant", [["ha-toggle","HA 장치 켜기/끄기","⌂"]]],
  ["D200X 추가 액션", [["system-volume","Windows 음량 조절","🔊"],["system-mute","Windows 음소거","🔇"],["system-scroll","Windows 스크롤","↕"],["edit-history","실행 취소·다시 실행","↶"],["window-switch","창 전환","▣"],["desktop-switch","가상 데스크톱 전환","⇄"],["device-brightness","D200X 화면 밝기","☀"],["system-zoom","화면 확대·축소","⊕"],["screenshot","화면 캡처","▣"],["clipboard-edit","클립보드 편집","▤"],["window-state","창 상태","□"],["window-monitor","다른 모니터로 이동","⇆"],["explorer-open","파일 탐색기 열기","▢"],["brush-size","브러시 크기","◉"],["timeline-step","타임라인 한 단계","▶"],["timeline-zoom","타임라인 확대 단축키 (앱별)","⊕"],["file-open","지정 파일 열기","▣"],["folder-shortcut","지정 폴더 열기","▢"]]]
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
  screenshot:'Win+Shift+S'
};
const HOTKEY_PRESET_LABELS=[
  ['','직접 지정'],['copy','복사'],['paste','붙여넣기'],['cut','잘라내기'],
  ['undo','실행 취소'],['redo','다시 실행'],['save','저장'],
  ['selectAll','전체 선택'],['find','찾기'],['newWindow','새 창'],
  ['switchWindow','창 전환'],['showDesktop','바탕화면 보기'],
  ['explorer','파일 탐색기'],['lock','Windows 잠금'],['taskManager','작업 관리자'],
  ['screenshot','영역 캡처']
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
ACTIONS.set('sd-plugin',{category:'플러그인',id:'sd-plugin',label:'Stream Deck SDK 플러그인',icon:'▣'});
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
try {
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw){
    state=DeckCore.migrateState(JSON.parse(raw));
    backupPending=!localStorage.getItem(STORAGE_KEY+'-pre-profiles-backup');
  }
} catch {state=DeckCore.migrateState(null);}
let inspectorSession=null;
let inspectorEditing=false;
const persist=(scheduleSync=true)=>{
  if(inspectorSession&&(inspectorEditing||inspectorSession.dirty)){
    inspectorSession.dirty=JSON.stringify(state)!==inspectorSession.snapshot;
    updateInspectorSaveButtons();return true;
  }
  try {
    if(backupPending){
      const old=localStorage.getItem(STORAGE_KEY);
      if(old&&!localStorage.getItem(STORAGE_KEY+'-pre-profiles-backup'))
        localStorage.setItem(STORAGE_KEY+'-pre-profiles-backup',old);
      backupPending=false;
    }
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
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
function keyName(item){return item?.title||ACTIONS.get(item?.type)?.label||"";}
const sdkVisuals=new Map();
const FUSION_PLUGIN='com.autodesk.fusionstreamdeck';
const fusionIconCache=new Map(),fusionCachePending=new Set(),fusionCacheMisses=new Set(),
  fusionConnected=new Set(),fusionOfflineContexts=new Set(),fusionLiveContexts=new Set();
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
  if(!id||fusionIconCache.has(id)||fusionCachePending.has(id)||fusionCacheMisses.has(id)||!window.deckBridge?.fusionIconRead)return;
  fusionCachePending.add(id);
  window.deckBridge.fusionIconRead(id).then(png=>{
    if(typeof png==='string'){fusionIconCache.set(id,png);renderGrid();window.scheduleDeckSync?.();}
    else fusionCacheMisses.add(id);
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

function sdkContext(index,gesture='down'){
  const folder=DeckCore.activeFolder(state);
  return String(state.profileId)+':'+state.page+':'+(state.folderPath||[]).join('-')+
    (folder?'-p'+(folder.pageIndex||0):'')+':'+index+':'+gesture;
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
    entries.push({context:sdkContext(index,gesture),slot:index,
      pluginUUID:settings.pluginUUID,actionUUID:settings.actionUUID,
      settings:settings.pluginSettings||{}});
  };
  DeckCore.visibleActions(state).slice(0,14).forEach((item,index)=>append(item,index,'down'));
  for(let index=14;index<=18;index++){
    const binding=DeckCore.controlBinding(state,index);
    if(binding?.mode==='trigger')for(const gesture of (index>=16?['down','left','right']:['down']))
      append(binding[gesture],index,gesture);
    else if(binding?.mode==='adjust')append(binding?.down,index,'down');
    if(index>=16){
      append(binding?.holdLeft,index,'hold-left');
      append(binding?.holdRight,index,'hold-right');
    }
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
function displayItem(item,index){
  if(item?.type==='multi-switch')return DeckCore.displaySwitchAction(item);
  if(item?.type==='timer'&&timerDeadlines.has(item)){
    const remaining=Math.max(0,Math.ceil((timerDeadlines.get(item)-Date.now())/1000));
    return {...item,title:(item.title?item.title+'\n':'')+remaining+'초'};
  }
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
      const offline=fusionOfflineContexts.has(context)||
        (!connected&&!fusionLiveContexts.has(context));
      const runtimeImage=!offline&&visual?.image?visual.image:null;
      const icon=stateIcon||item.icon||(runtimeImage?{kind:'file',value:runtimeImage}:null)||
        (cached?{kind:'file',value:cached}:null)||
        (visual?.image?{kind:'file',value:visual.image}:null);
      return {...item,title:visual?.title??item.title,...(icon?{icon}:{}),fusionOffline:offline};
    }
    const icon=stateIcon||item.icon||(visual?.image?{kind:'file',value:visual.image}:null);
    if(icon||visual)return {...item,title:visual?.title??item.title,...(icon?{icon}:{})};
  }
  if(!item||item.type!=="indicator")return item;
  return {...item,icon:{kind:"glyph",glyph:String((DeckCore.activeFolder(state)?.pageIndex??state.page)+1)}};
}
// Share actual key visuals (including timer countdown) with the USB renderer.
window.getD200XDisplayItem=(item,index)=>index===13&&wideDisplayAvailable()?wideVisual():displayItem(DeckCore.visibleActions(state)[index]||item,index);
function iconNode(item,defaultGlyph){
  if(item?.icon?.kind==="file"&&typeof item.icon.value==="string"){
    const image=document.createElement("img");image.className="icon-image";image.src=item.icon.value;image.alt="";return image;
  }
  if(!item?.icon?.glyph && window.D200XPanelIcons?.artwork?.(item?.type)){
    const image=document.createElement("img");image.className="icon-image";
    image.src=window.D200XPanelIcons.artwork(item.type);image.alt="";return image;
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
function setItem(index,item){
  if(reservedWideSlot(index)){
    window.d200xActionStatus?.('가로 화면은 표시 모드 전용입니다. 일반 액션을 등록할 수 없습니다.');
    state.selected=index;render();return;
  }
  if(index>=14){
    const binding=DeckCore.controlBinding(state,index);
    if(binding.mode!=='trigger'&&!(index>=16&&(
      controlGesture==='holdLeft'||controlGesture==='holdRight'||
      (controlGesture==='down'&&binding.mode==='adjust'))))binding.mode='trigger';
    binding[controlGesture]=item;
  }else currentPage()[index]=item;
  state.selected=index;persist();render();
}
function removeSlotAction(index){
  if(reservedWideSlot(index))return false;
  if(index<14&&!currentPage()[index]&&state.pinned?.[index]){
    if(!confirm('고정 액션을 모든 페이지에서 해제하시겠습니까?'))return false;
    if(DeckCore.togglePinned(state,index)){persist();render();return true;}
    return false;
  }
  if(!currentPage()?.[index])return false;
  if(!confirm('이 동작을 삭제하시겠습니까?'))return false;
  setItem(index,null);
  return true;
}
function removeControlAction(index,gesture='down'){
  const binding=DeckCore.controlBinding(state,index);
  if(!binding||!binding[gesture])return false;
  if(!confirm('이 입력에 할당된 액션을 삭제하시겠습니까?'))return false;
  binding[gesture]=null;
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
  option.disabled=!item;
  option.addEventListener('click',()=>{
    menu.hidden=true;
    removeControlAction(index,'down');
  });
  menu.append(option);
  menu.style.left=Math.max(0,Math.min(x,window.innerWidth-230))+'px';
  menu.style.top=Math.max(0,Math.min(y,window.innerHeight-150))+'px';
  menu.hidden=false;
}
function choose(index){
  if(inspectorSession?.dirty){showInspectorLeaveDialog(()=>choose(index));return;}
  if(state.selected!==index){controlGesture='down';knobTab='normal';}
  state.selected=index;persist();render();
}
function controlDrop(index,id,gesture='down'){
  if(!isAssignableAction(id))return;
  const binding=DeckCore.controlBinding(state,index);
  if(!binding)return;
  if(index>=16&&gesture==='down'&&['system-volume','system-scroll','edit-history','window-switch','desktop-switch','device-brightness','system-zoom'].includes(id)){
    // Rotation runs the shared adjustment planner; preserve the press assignment.
    binding.mode='adjust';binding.target=({
      'system-volume':'volume','system-scroll':'scroll','edit-history':'history',
      'window-switch':'window','desktop-switch':'desktop',
      'device-brightness':'brightness','system-zoom':'zoom'
    })[id];
  }else if(index>=16&&gesture==='down'&&['previous','next'].includes(id)){
    // Dropping a navigation action directly on the knob preserves the
    // familiar bidirectional rotation behavior; per-gesture tiles remain
    // available for independent left/right assignments.
    binding.mode='adjust';
    binding.target='page';
    binding.down=newAction(id);
  }else{
    // A knob press action can coexist with rotate-to-adjust (volume/page/zoom).
    if(binding.mode!=='trigger' && !(index>=16&&(
      gesture==='holdLeft'||gesture==='holdRight'||
      (gesture==='down'&&binding.mode==='adjust'))))
      {binding.mode='trigger';binding.autoAssign=true;}
    binding[gesture]=newAction(id);
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
window.D200XWideModeName=()=>wideDisplayAvailable()?state.wideDisplay?.current:null;
const KNOB_TARGET_LABELS={page:'페이지 이동',profile:'프로필 전환',volume:'Windows 음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'};
window.D200XKnobInfo=()=>[16,17,18].map((index,i)=>{
  const binding=DeckCore.controlBinding(state,index);
  const active=binding?.mode==='stack'
    ?binding.stack?.[stackPositions[i]%binding.stack.length]
    :binding?.target;
  const assigned=[binding?.down,binding?.left,binding?.right,binding?.holdLeft,binding?.holdRight].filter(Boolean);
  const named=assigned.find(action=>typeof action.title==='string'&&action.title.trim());
  const functionName=binding?.mode==='adjust'||binding?.mode==='stack'
    ?KNOB_TARGET_LABELS[active]||'조절'
    :assigned.map(action=>ACTIONS.get(action.type)?.label||action.type).filter(Boolean).join(' / ')||'미설정';
  return {name:'노브 '+(i+1),title:named?.title?.trim()||functionName,detail:functionName};
});
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
function renderGrid(){
  const grid=$("key-grid");grid.replaceChildren();
  DeckCore.visibleActions(state).slice(0,KEY_COUNT).forEach((raw,i)=>{
    const folderBack=state.folderPath?.length>0&&i===13&&!raw;
    const item=folderBack?{type:'folder-back',title:'뒤로',icon:{kind:'glyph',glyph:'↩'}}:(i===13&&wideDisplayAvailable()?wideVisual():raw);
    const b=document.createElement("button");b.type="button";b.className="deck-key"+(i===13?" wide":"")+(state.selected===i?" selected":"");
    b.dataset.index=i;b.setAttribute("aria-label",`키 ${i+1}: ${keyName(item)||"비어 있음"}`);
    const visual=displayItem(item,i);
    const glyph=iconNode(visual,ACTIONS.get(item?.type)?.icon||"+");glyph.classList.add("glyph");
    const label=document.createElement("span");label.className="caption";label.textContent=visual?.title||"";updateTitleAppearance(label,visual);
    b.append(glyph,label);
    // Render the actual D200X PNG as the editor key surface. Icon and title
    // must stay in fixed coordinates, independent of the title font size.
    if(item&&window.renderDeckKeyImage){
      window.renderDeckKeyImage(visual,i).then(png=>{
        if(!b.isConnected||(item.type!=='wide-display'&&DeckCore.visibleActions(state)[i]!==item))return;
        const preview=document.createElement("img");
        preview.className="rendered-key-image";
        preview.alt="";
        preview.src="data:image/png;base64,"+png;
        b.replaceChildren(preview);
      }).catch(error=>console.warn("버튼 이미지 미리보기 실패",error));
    }
    b.addEventListener("click",()=>{if(folderBack){DeckCore.exitFolder(state);persist();render();}else if(i===13&&wideDisplayAvailable()){state.selected=i;advanceWideDisplay();}else choose(i);});
    b.addEventListener("contextmenu",ev=>{ev.preventDefault();choose(i);showMenu(i,ev.clientX,ev.clientY);});
    b.addEventListener("dragover",ev=>{if(!reservedWideSlot(i)){ev.preventDefault();b.classList.add("drag-over");}});
    b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
    b.addEventListener("drop",ev=>{if(reservedWideSlot(i))return;ev.preventDefault();b.classList.remove("drag-over");const id=ev.dataTransfer.getData("application/x-d200x-action");if(isAssignableAction(id))setItem(i,newAction(id));});
    grid.append(b);
  });
  renderPhysicalControls();
  const folder=DeckCore.activeFolder(state);
  $("page-label").textContent=folder
    ?`폴더 ${state.folderPath.length}단계 · 페이지 ${(folder.pageIndex||0)+1} / ${DeckCore.folderPageCount(state)}`
    :`페이지 ${state.page+1} / ${state.pages.length}`;
  $("delete-page").disabled=folder?DeckCore.folderPageCount(state)<=1:state.pages.length<=1;
}
function renderPhysicalControls(){
  const root=$("physical-controls");
  root.replaceChildren();
  CONTROLS.forEach(({name,kind},offset)=>{
    const index=KEY_COUNT+offset, binding=DeckCore.controlBinding(state,index);
    const item=binding?.down;
    const button=document.createElement("button");button.type="button";
    button.className="physical-control "+kind+(state.selected===index?" selected":"");
    button.setAttribute("aria-label",name+" — "+(keyName(item)||"비어 있음"));
    button.title=name+" — 클릭하거나 액션을 끌어 설정";
    const symbol=document.createElement("span");symbol.className="physical-symbol";
    const label=document.createElement("span");label.className="physical-name";
    label.textContent=binding?.mode==='adjust'?'조절: '+({page:'페이지',profile:'프로필',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.target])
      :binding?.mode==='stack'?'스택: '+({page:'페이지',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.stack[stackPositions[offset-2]%binding.stack.length]])
      :(item?keyName(item):name);
    button.append(symbol,label);
    button.addEventListener("click",()=>choose(index));
    button.addEventListener("contextmenu",event=>{
      event.preventDefault();
      state.selected=index;controlGesture='down';
      renderPhysicalControls();renderControlInspector();
      showControlMenu(index,event.clientX,event.clientY);
    });
    button.addEventListener("dragenter",()=>{
      // Reveal the gesture targets below while an action is dragged over
      // the physical button/knob, without replacing the drop target.
      if(state.selected!==index){
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
async function refreshSdkPlugins(){
  if(!window.deckBridge?.sdkList)return;
  try{
    sdkPlugins=await window.deckBridge.sdkList();
    sdkActionNames.clear();
    for(const plugin of sdkPlugins)for(const action of plugin.actions)
      sdkActionNames.set(action.uuid,sdkCatalogueLabel(action));
    if(libraryTab==='plugins')renderLibrary();
  }catch(error){window.d200xActionStatus?.('SDK 플러그인 목록 오류: '+String(error?.message||error));}
}
async function installSdkPlugin(fromFolder=false){
  if(!window.deckBridge?.sdkInstall)return window.d200xActionStatus?.('Windows EXE에서만 설치 가능합니다.');
  try{
    const plugin=fromFolder?await window.deckBridge.sdkInstallFolder():await window.deckBridge.sdkInstall();
    if(!plugin)return;
    await refreshSdkPlugins();
    window.d200xActionStatus?.('Stream Deck 플러그인 설치: '+plugin.name+' '+plugin.version);
  }catch(error){window.d200xActionStatus?.('플러그인 설치 실패: '+String(error?.message||error));}
}
// Only change what the user can add from the catalogue. Existing action IDs,
// saved profiles and the original SDK plugin remain intact.
const HA_GENERIC_ACTION='de.perdoctus.streamdeck.homeassistant.entity';
const HA_CUSTOM_ACTION='de.perdoctus.streamdeck.homeassistant.dual-state-entity';
function sdkCatalogueLabel(action){
  return action.uuid===HA_CUSTOM_ACTION?'Home Assistant 장치 제어':action.name;
}
function renderInstalledSdkPlugins(root,query){
  for(const plugin of sdkPlugins){
    const matching=plugin.actions.filter(a=>a.uuid!==HA_GENERIC_ACTION &&
      (plugin.name+' '+sdkCatalogueLabel(a)+' '+a.name+' '+a.uuid).toLowerCase().includes(query));
    if(!matching.length)continue;
    const section=document.createElement('section');section.className='group';
    const title=document.createElement('div');title.className='group-title';
    title.textContent=plugin.name+' ('+plugin.version+')';
    const body=document.createElement('div');
    title.addEventListener('click',()=>{body.hidden=!body.hidden;});
    for(const action of matching){
      const id='sd::'+plugin.uuid+'::'+action.uuid;
      const tile=document.createElement('div');tile.className='action-item';tile.draggable=true;
      tile.title='드래그하여 버튼에 놓기';tile.textContent='▣  '+sdkCatalogueLabel(action);
      tile.addEventListener('dragstart',ev=>ev.dataTransfer.setData('application/x-d200x-action',id));
      tile.addEventListener('click',()=>{
        if(state.selected===null)return;
        if(state.selected>=14)controlDrop(state.selected,id,controlGesture);
        else setItem(state.selected,newAction(id));
      });
      body.append(tile);
    }
    section.append(title,body);root.append(section);
  }
}
async function configureHomeAssistant(){
  if(!window.deckBridge?.haSave)return window.d200xActionStatus?.('HA 플러그인은 Windows EXE에서 사용 가능합니다.');
  try{
    const current=await window.deckBridge.haStatus();
    const url=prompt('Home Assistant 서버 주소',current.url||'http://192.168.0.100:8123');
    if(url===null)return;
    const token=prompt('Home Assistant 장기 액세스 토큰 (기존 토큰은 표시되지 않음)');
    if(token===null)return;
    await window.deckBridge.haSave(url,token);
    window.d200xActionStatus?.('Home Assistant 연결 확인 및 설정 저장 완료');
  }catch(error){window.d200xActionStatus?.('Home Assistant 연결 실패: '+String(error?.message||error));}
}
function renderLibrary(){
  const root=$("library-list");root.replaceChildren();
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
    const visible=entries.filter(([id,label])=>(category+" "+label+" "+(PANEL_SHORTCUTS[id]||"")).toLocaleLowerCase().includes(query));
    if(!visible.length)continue;
    const section=document.createElement("section");section.className="group";
    const title=document.createElement("div");title.className="group-title";title.textContent=category;
    const body=document.createElement("div");title.addEventListener("click",()=>{body.hidden=!body.hidden;});
    for(const [id,label] of visible){
      const disabled=id==='virtual';
      const entry=document.createElement("div");entry.className="action-item"+(disabled?" action-disabled":"");entry.draggable=!disabled;
      if(disabled){entry.setAttribute("aria-disabled","true");entry.setAttribute("title","추후 지원 예정 · 현재 등록 불가");}
      if(!disabled)entry.title="드래그하여 빈 버튼에 놓기";
      const symbol=document.createElement("span");symbol.className="action-icon";symbol.append(window.D200XPanelIcons.create(id));
      const caption=document.createElement("span");caption.className="action-caption";
      const name=document.createElement("span");name.textContent=label;caption.append(name);
      if(disabled){const note=document.createElement("small");note.className="action-unavailable";note.textContent="지원 예정 · 비활성화";caption.append(note);}
      const customise=document.createElement("button");customise.type="button";customise.className="action-customize";
      customise.textContent="⋯";customise.title=label+" 아이콘 개별 설정";customise.setAttribute("aria-label",label+" 아이콘 개별 설정");
      if(disabled)customise.disabled=true;
      customise.addEventListener("click",event=>{
        event.stopPropagation();
        const old=body.querySelector(".action-override-controls");
        if(old){const same=old.parentElement===entry;old.remove();if(same)return;}
        const tools=document.createElement("div");tools.className="action-override-controls";
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
        tools.append(upload,file,reset);entry.append(tools);
      });
      entry.append(symbol,caption,customise);
      if(!disabled)entry.addEventListener("dragstart",ev=>ev.dataTransfer.setData("application/x-d200x-action",id));
      entry.addEventListener("click",()=>{
        if(disabled)return;
        if(state.selected!==null){
          if(state.selected>=14)controlDrop(state.selected,id,controlGesture);
          else setItem(state.selected,newAction(id));
        }
      });
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
  fromDir.title='개발자 배포 .sdPlugin 폴더 설치';
  fromDir.addEventListener('click',()=>installSdkPlugin(true));pluginToolbar.append(fromDir);
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
  'audio-play':[['fade','fadeDuration']],
  'text':[['enter','mode']],
  'folder':[['autoExitEnabled','autoExitSeconds']]
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
    group.className='compact-property-group compact-count-'+nodes.length;
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
const select=(field,label,opts)=>`<div class="field"><label for="s-${field}">${label}</label><select id="s-${field}" data-field="${field}">${opts.map(([v,n])=>`<option value="${escapeHtml(v)}" ${valueOf(active,field)===v?"selected":""}>${escapeHtml(n)}</option>`).join("")}</select></div>`;
const pathPicker=(field,label,kind='file')=>
  '<div class="field"><label for="s-'+field+'">'+label+'</label><div class="compound">'+
  '<input id="s-'+field+'" data-field="'+field+'" value="'+escapeHtml(valueOf(active,field))+'">'+
  '<button type="button" data-path-picker="'+field+'" data-path-kind="'+kind+'" title="파일 찾아보기">…</button>'+
  (field==='path'&&active?.type==='open'
    ? '<button type="button" data-path-picker="'+field+'" data-path-kind="folder" title="폴더 선택">▣</button>' : '')+
  '</div></div>';
const check=(field,label)=>`<div class="field"><label for="s-${field}">${label}</label><input id="s-${field}" type="checkbox" data-field="${field}" ${valueOf(active,field)?"checked":""}></div>`;
let active=null;
function actionFields(item){
  active=item;
  switch(item.type){
    case "audio-play":return pathPicker("file","파일")+select("mode","동작",[["play-stop","재생 / 정지"],["overlap","재생 / 오버랩"],["restart","재생 / 재시작"],["loop-stop","반복 / 정지"]])+select("fade","페이드",[["none","페이드 없음"],["in","페이드 인"],["out","페이드 아웃"],["in-out","페이드 인 앤 아웃"]])+select("fadeDuration","페이드 시간",[[1,"1초"],[2,"2초"],[3,"3초"],[4,"4초"],[5,"5초"]])+`<div class="field"><label for="s-volume">음량</label><div class="compound"><input id="s-volume" type="range" min="0" max="100" data-field="volume" value="${valueOf(item,"volume",50)}"><output id="volume-display">${valueOf(item,"volume",50)}</output></div></div>`+select("output","출력",[["default","기본"]])+`<div class="field"><span></span><span class="hint">연결된 출력 장치를 선택할 수 있습니다. 장치 전환은 실행 시 적용됩니다.</span></div>`;
    case "sd-plugin":return '<div class="sdk-state-icons" data-sdk-state-icons></div>';
    case "ha-toggle":return input("entityId","HA 엔티티 ID","switch.living_room")+
      '<div class="field"><label>엔티티</label><button type="button" data-ha-entities>목록에서 선택</button></div>';
    case "audio-stop": case "previous": case "next": case "indicator":return "";
    case "timer":return `<div class="field"><label for="s-seconds">지속</label><div class="compound"><input type="number" min="1" id="s-seconds" data-field="seconds" value="${valueOf(item,"seconds",30)}"><span>초</span></div></div>`+select("sound","사운드",[["none","없음"],["connect","접속"],["disconnect","접속 끊김"],["release","접속 해제"],["find","찾기"],["other","기타"]]);
    case "brightness":return select("mode","동작",[["up","밝게"],["down","어둡게"],["max","최대"],["high","높음"],["medium","중간"],["low","낮음"],["min","최소"]]);
    case "sleep":return `<div class="field"><label>장치 화면</label><span class="hint">D200X 화면 잠자기 · 다음 물리 버튼 누름은 화면 깨우기에 사용 (PC 절전 아님)</span></div>`;
    case "virtual":return `<div class="field"><label>기기</label><span class="hint">구성된 Virtual Stream Decks 없음</span></div>`;
    case "website":return input("url","URL","https://")+select("open","다음으로 열기",[["default","기본 브라우저"],["get","백그라운드에서 GET 요청"],["choose","브라우저 직접 선택"]])+pathPicker("browserPath","선택 브라우저 (.exe)","app");
    case "open":return pathPicker("path","앱 / 파일");
    case "open-app":return pathPicker("app","앱","app")+select("hold","길게 누르기",[["none","아무것도 하지 않음"],["close","응용 프로그램 종료"],["force","응용 프로그램 강제 종료"]])+check("foreground","이미 실행 중이면 맨 앞으로");
    case "close":return pathPicker("path","앱 / 파일")+check("force","강제 종료");
    case "hotkey":return select("preset","동작 선택기",HOTKEY_PRESET_LABELS)+input("keys","단축키","클릭하여 할당");
    case "hotkey-switch":return input("first","단축키 1")+input("second","단축키 2");
    case "text":return `<div class="field"><label for="s-body">텍스트</label><div><textarea id="s-body" data-field="body">${escapeHtml(valueOf(item,"body"))}</textarea><div class="hint" id="text-count">${String(valueOf(item,"body")).length} / -</div></div></div>`+check("enter","메시지 뒤 Enter")+select("mode","텍스트 모드",[["clipboard","클립보드에서 붙여넣기"],["typing","타이핑 시뮬레이션"]]);
    case "media":return select("op","동작",[["previous","이전 트랙"],["playpause","재생 / 일시정지"],["next","다음 트랙"],["stop","정지"],["mute","음소거"],["up","음량 키우기"],["down","음량 줄이기"]]);
    case "system-volume":return select("direction","동작",[["up","음량 키우기"],["down","음량 줄이기"]])+select("step","변화량",[[1,"1"],[2,"2"],[5,"5"],[10,"10"]]);
    case "system-mute":return '<div class="field"><span></span><span class="hint">누를 때마다 음소거 전환</span></div>';
    case "screenshot":case "explorer-open":return '';
    case "file-open":return pathPicker('path','열 파일');
    case "folder-shortcut":return pathPicker('path','열 폴더','folder');
    case "clipboard-edit":return select("operation","동작",[["copy","복사"],["paste","붙여넣기"],["cut","잘라내기"]]);
    case "window-state":return select("operation","동작",[["maximize","최대화"],["minimize","복원/최소화"]]);
    case "window-monitor":return select("direction","방향",[["left","왼쪽 모니터"],["right","오른쪽 모니터"]]);
    case "brush-size":return select("direction","동작",[["increase","브러시 확대 ([/] 지원 앱)"],["decrease","브러시 축소"]]);
    case "timeline-zoom":return select('operation','앱별 Ctrl +/- 단축키',[["in","확대 (Ctrl++)"],["out","축소 (Ctrl+-)"]]);
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
    case "folder":return `<div class="field"><label>내용</label><div>폴더 내부 항목 편집은 아래 버튼을 사용하세요.</div></div>`+
      `<div class="field"><label>액션 실행 후 자동 나가기</label><input type="checkbox" data-field="autoExitEnabled" ${item.settings?.autoExitEnabled?'checked':''}></div>`+
      `<div class="field"><label>실행 후 대기 (0=즉시 나가기)</label><input type="number" min="0" max="60" data-field="autoExitSeconds" value="${Number(item.settings?.autoExitSeconds)||0}"><span>초</span></div>`;
    case "multi-switch":return "";
    case "logic":return "";
    case "profile":return select("profile","프로필",[
      ["next","다음 프로필"],["previous","이전 프로필"],...state.profileNames.map(p=>[p.id,p.name])
    ]);
    case "goto":return select("page","대상",state.pages.map((_,i)=>[String(i),String(i+1)]));
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
  'timeline-step','timeline-zoom','file-open','folder-shortcut'];
const multiSwitchEditorTabs=new WeakMap();
function renderMultiEditor(item,root){
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
        const chosen=await chooseNativeImage('image');
        if(!chosen)return;
        const image=await rasterizeIcon(chosen.dataUrl);
        if(image.length>=1024*1024)throw new Error('변환된 PNG가 1MB를 넘습니다.');
        visual.icon={kind:'file',value:image};
        persist();renderGrid();refreshSelectedVisual();
      }catch(error){window.d200xActionStatus?.('상태 이미지 선택 실패: '+String(error?.message||error));}
    });
    imageInput.addEventListener('change',async()=>{
      const file=imageInput.files?.[0];imageInput.value='';
      if(!file)return;
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024){
        window.d200xActionStatus?.('5MB 이하의 PNG/JPEG/WebP/GIF 이미지만 선택할 수 있습니다.');return;
      }
      try{
        const raw=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onerror=()=>reject(new Error('파일 읽기 실패'));
          reader.onload=()=>resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const image=await rasterizeIcon(raw);
        if(image.length>=1024*1024)throw new Error('변환된 PNG가 1MB를 넘습니다.');
        visual.icon={kind:'file',value:image};
        persist();renderGrid();
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
  heading.textContent=randomAction?'무작위 동작 · 후보 중 하나 실행':switching?'다중 동작 스위치 · 상태별 실행':'다중 동작 · 순서대로 실행';
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
        step.settings[node.dataset.field]=node.type==='checkbox'?node.checked:
          node.type==='number'||node.type==='range'?Number(node.value):node.value;
        persist();
      }));
      fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.deckBridge?.choosePath)return window.d200xActionStatus?.('Windows EXE에서만 파일 선택이 가능합니다.');
        try{
          const path=await window.deckBridge.choosePath(button.dataset.pathKind);
          if(!path)return;
          step.settings[button.dataset.pathPicker]=path;persist();renderInspector();
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
          action.settings[node.dataset.field]=node.type==='checkbox'?node.checked:
            node.type==='number'||node.type==='range'?Number(node.value):node.value;
          persist();
        }));
      fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.deckBridge?.choosePath)return;
        try{
          const path=await window.deckBridge.choosePath(button.dataset.pathKind);
          if(!path)return;
          action.settings[button.dataset.pathPicker]=path;persist();
          if(state.selected>=14)renderControlInspector();else renderInspector();
        }catch(error){window.d200xActionStatus?.('파일 선택 실패: '+String(error?.message||error));}
      }));
      area.append(fields);
    }
  }
  root.querySelector('.fields')?.append(area);
}
function renderFolderInspector(item,root){
  const host=document.createElement('div');host.className='multi-action-editor';
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
  const item=state.selected===null?null:DeckCore.visibleActions(state)[state.selected];
  if(!item||!window.renderDeckKeyImage)return;
  const request=++previewRequest;
  try{
    const data=await window.renderDeckKeyImage(displayItem(item));
    if(request!==previewRequest||currentPage()[state.selected]!==item)return;
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
function refreshTitlePreview(item){
  const host=$("icon-preview");if(!host)return;
  let label=host.querySelector(".preview-title");
  if(!label){label=document.createElement("span");label.className="preview-title";host.append(label);}
  label.textContent=item.title||"";
  const style={...DEFAULT_TITLE_STYLE,...item.titleStyle};
  label.hidden=style.visible===false;
  label.style.textAlign="center";
  label.style.fontFamily=style.family==="default"?"Malgun Gothic, sans-serif":style.family;
  label.style.fontSize=(Math.max(8,Math.min(48,Number(style.size)||12))*98/72)+"px";
  label.style.fontWeight=style.bold?"bold":"normal";
  label.style.fontStyle=style.italic?"italic":"normal";
  label.style.textDecoration=style.underline?"underline":"none";
  label.style.color=style.color;
  label.style.top=style.align==="top"?"5px":style.align==="middle"?"50%":"auto";
  label.style.bottom=style.align==="bottom"?"5px":"auto";
  label.style.transform=style.align==="middle"?"translateY(-50%)":"none";
  refreshSelectedVisual();
}
function bindTitleStyle(item){
  const style=item.titleStyle={...DEFAULT_TITLE_STYLE,...item.titleStyle};
  const menu=$("title-style-popover"),toggle=$("title-style-trigger");
  toggle.addEventListener("click",()=>{
    menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));
  });
  const save=(field,value)=>{style[field]=value;persist();renderGrid();refreshTitlePreview(item);};
  const visible=$("title-visible");visible.checked=style.visible;
  visible.addEventListener("change",()=>save("visible",visible.checked));
  menu.querySelectorAll("[data-align]").forEach(button=>{
    button.classList.toggle("active",button.dataset.align===style.align);
    button.addEventListener("click",()=>{
      save("align",button.dataset.align);
      menu.querySelectorAll("[data-align]").forEach(b=>b.classList.toggle("active",b===button));
    });
  });
  const family=$("title-family");family.value=style.family;
  family.addEventListener("change",()=>save("family",family.value));
  const size=$("title-size");size.value=style.size;
  size.addEventListener("change",()=>{size.value=String(Math.max(8,Math.min(48,Number(size.value)||12)));save("size",Number(size.value));});
  menu.querySelectorAll("[data-style]").forEach(button=>{
    const field=button.dataset.style;button.classList.toggle("active",Boolean(style[field]));
    button.addEventListener("click",()=>{save(field,!style[field]);button.classList.toggle("active",style[field]);});
  });
  // Shared palette is persistent across all actions; saving a color is explicit.
  const paletteKey="d200x-streamdeck-custom-title-colors-v1";
  const swatches=["#ffffff","#000000","#ff0000","#ff8800","#ffff00","#00cc66",
    "#00ffff","#0088ff","#0000ff","#a855f7","#ff66cc","#808080"];
  const validHex=value=>/^#[0-9a-fA-F]{6}$/.test(value);
  const loadCustom=()=>{
    try{
      const list=JSON.parse(localStorage.getItem(paletteKey));
      return Array.isArray(list)?[...new Set(list.filter(validHex).map(v=>v.toLowerCase()))].slice(0,24):[];
    }catch{return [];}
  };
  let customColors=loadCustom();
  const colorFields=[["title-color","color"],["outline-color","outlineColor"]];
  let selectedColorField="color";
  const palette=$("title-palette");
  function updatePalette(){
    const grid=$("title-palette-presets");grid.replaceChildren();
    const mine=$("title-palette-mine");mine.replaceChildren();
    const add=(parent,color,saved)=>{
      const tile=document.createElement("button");tile.type="button";
      tile.className="title-color-swatch";
      tile.style.backgroundColor=color;
      tile.title=color+(saved?" · 나의 색상":"");
      tile.setAttribute("aria-label",color+" 색상 적용");
      tile.addEventListener("click",()=>{
        save(selectedColorField,color);
        const fieldId=selectedColorField==="color"?"title-color":"outline-color";
        $(fieldId).value=color;
      });
      parent.append(tile);
      if(saved){
        const remove=document.createElement("button");remove.type="button";
        remove.className="title-color-remove";remove.textContent="×";
        remove.title=color+" 저장 색상 삭제";
        remove.addEventListener("click",()=>{
          customColors=customColors.filter(c=>c!==color);
          try{localStorage.setItem(paletteKey,JSON.stringify(customColors));}catch{}
          updatePalette();
        });
        parent.append(remove);
      }
    };
    swatches.forEach(color=>add(grid,color,false));
    customColors.forEach(color=>add(mine,color,true));
    $("title-palette-empty").hidden=customColors.length>0;
  }
  function openPalette(field){
    selectedColorField=field;
    palette.hidden=false;
    $("title-palette-heading").textContent=field==="color"?"글자 색상":"외곽선 색상";
    updatePalette();
  }
  colorFields.forEach(([id,field])=>{
    const color=$(id);color.value=style[field];
    color.addEventListener("input",()=>save(field,color.value));
    $(id+"-palette").addEventListener("click",()=>openPalette(field));
  });
  $("title-palette-save").addEventListener("click",()=>{
    const color=String(style[selectedColorField]||"").toLowerCase();
    if(!validHex(color))return;
    customColors=[...customColors.filter(value=>value!==color),color].slice(-24);
    try{localStorage.setItem(paletteKey,JSON.stringify(customColors));}catch{
      alert("나의 색상을 저장할 수 없습니다. 저장소 공간을 확인해 주세요.");
    }
    updatePalette();
  });
  $("title-palette-close").addEventListener("click",()=>{palette.hidden=true;});
  updatePalette();
  const outlineWidth=$("outline-width");outlineWidth.value=style.outlineWidth;
  outlineWidth.addEventListener("change",()=>save("outlineWidth",outlineWidth.value));
  $("title-reset").addEventListener("click",()=>{item.titleStyle={...DEFAULT_TITLE_STYLE};persist();renderGrid();renderInspector();});
  document.addEventListener("pointerdown",event=>{
    if(!menu.isConnected)return;
    if(!menu.contains(event.target)&&!toggle.contains(event.target)){
      menu.hidden=true;toggle.setAttribute("aria-expanded","false");
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
function persistInspectorChange(){
  if(inspectorSession){inspectorSession.dirty=JSON.stringify(state)!==inspectorSession.snapshot;updateInspectorSaveButtons();return true;}
  return persist();
}
function updateInspectorSaveButtons(){
  const dirty=inspectorSession?.dirty===true;
  document.querySelectorAll('.inspector-save,.inspector-cancel').forEach(button=>{button.disabled=!dirty;});
  document.querySelectorAll('.action-preview-test,.control-test-row button').forEach(button=>{button.disabled=dirty;button.title=dirty?'먼저 변경 사항을 저장하세요.':'저장된 동작 실행 테스트';});
}
function saveInspector(){
  if(!inspectorSession?.dirty)return;
  const previous=inspectorSession;
  inspectorSession=null;
  if(!persist()){inspectorSession=previous;return;}
  beginInspectorSession();
  updateInspectorSaveButtons();
}
function discardInspector(){
  if(!inspectorSession?.dirty)return;
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
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
}
function appendInspectorSaveBar(root){
  const footer=document.createElement('div');footer.className='inspector-save-bar';
  const cancel=document.createElement('button');cancel.type='button';
  cancel.className='inspector-cancel';cancel.textContent='취소';cancel.disabled=!inspectorSession?.dirty;
  cancel.addEventListener('click',discardInspector);
  const save=document.createElement('button');save.type='button';
  save.className='inspector-save';save.textContent='저장';save.disabled=!inspectorSession?.dirty;
  save.addEventListener('click',saveInspector);
  footer.append(cancel,save);root.append(footer);
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
  // The modal is not part of the inspector. Never intercept its own controls:
  // otherwise Cancel / Discard / Save and move all become unclickable.
  if(event.target.closest('#inspector-unsaved-dialog, .inspector-help-dialog'))return;
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
// Physical controls use a dedicated compact inspector instead of pretending
// each knob has a single key. Drag to an individual gesture or click it to edit.
function renderControlInspector(){
  beginInspectorSession();
  const root=$("inspector"),index=state.selected,offset=index-14;
  const info=CONTROLS[offset],binding=DeckCore.controlBinding(state,index);
  root.className="inspector control-inspector";
  root.replaceChildren();
  const knob=info.kind==='knob',held=knob&&knobTab==='held';
  const head=document.createElement('div');head.className='action-head control-head';
  const name=document.createElement('strong');name.textContent=info.name+(knob?'':' · 액션 할당');
  head.append(name);
  if(knob){
    const modeBadge=document.createElement('span');
    modeBadge.className='control-mode-badge '+(held?binding.heldMode:binding.mode);
    const snapshot=inspectorSession?.dirty?DeckCore.migrateState(JSON.parse(inspectorSession.snapshot)):null;
    const committed=snapshot?DeckCore.controlBinding(snapshot,index):binding;
    modeBadge.textContent=held&&committed.heldEnabled!==true?'사용 안 함':
      ({trigger:'동작별 할당',adjust:'조절형 액션',stack:'다이얼 스택'})[held?committed.heldMode:committed.mode];
    head.append(modeBadge);
    const tabs=document.createElement('div');tabs.className='control-mode-tabs';
    for(const [value,label] of [['normal','좌우 회전'],['held','누르고 좌우 회전']]){
      const tab=document.createElement('button');tab.type='button';tab.textContent=label;
      tab.classList.toggle('active',knobTab===value);
      tab.addEventListener('click',()=>{knobTab=value;controlGesture=value==='held'?'holdLeft':'left';renderControlInspector();});
      tabs.append(tab);
    }
    head.append(tabs);
  }
  const headTest=document.createElement('button');headTest.type='button';
  headTest.className='action-preview-test';headTest.textContent='▶ 실행 테스트';
  headTest.addEventListener('click',()=>runActionPreview(held?'hold-left':'down'));
  if(!knob)head.append(headTest);
  root.append(head);
  const scopeRow=document.createElement('div');scopeRow.className='control-config';
  const scopeLabel=document.createElement('label');scopeLabel.textContent='적용 범위';
  const scope=document.createElement('select');
  for(const [value,label] of [['global','모든 페이지 공통'],['page','현재 페이지에만']])scope.add(new Option(label,value));
  scope.value=state.controls.scopes[offset];
  scope.addEventListener('change',()=>{DeckCore.changeControlScope(state,index,scope.value);persist();render();});
  scopeRow.append(scopeLabel,scope);
  if(knob){
    const modeLabel=document.createElement('label');modeLabel.textContent='설정 방식';
    const mode=document.createElement('select');
    for(const [value,label] of [['trigger','동작별 할당'],['adjust','조절형 액션'],['stack','다이얼 스택']])mode.add(new Option(label,value));
    mode.value=held?binding.heldMode:binding.mode;
    mode.addEventListener('change',()=>{
      if(held){binding.heldMode=mode.value;if(mode.value==='trigger')binding.heldAutoAssign=true;}
      else{binding.mode=mode.value;if(mode.value==='trigger')binding.autoAssign=true;}
      persist();renderControlInspector();
    });
    scopeRow.append(modeLabel,mode);
  }
  root.append(scopeRow);
  if(knob){
    if(held){
      const useRow=document.createElement('div');useRow.className='control-config';
      const use=document.createElement('input');use.type='checkbox';use.checked=binding.heldEnabled===true;
      const label=document.createElement('label');label.className='control-held-enable';label.append(use,document.createTextNode('누르고 좌우 회전 사용'));
      use.addEventListener('change',()=>{
        if(use.checked&&!confirm('누르고 좌우 회전 기능을 활성화하면 노브 누르기에 등록된 액션이 비활성화됩니다.\n\n계속하시겠습니까?')){
          use.checked=false;return;
        }
        binding.heldEnabled=use.checked;persist();renderControlInspector();
      });
      useRow.append(label);root.append(useRow);
    }
    const currentMode=held?binding.heldMode:binding.mode;
    const config=document.createElement('div');config.className='control-config control-adjust-config';
    const label=document.createElement('label');label.textContent='회전 조절 대상';
    const target=document.createElement('select');
    const targets=[['page','페이지 이동'],['profile','프로필 전환'],['volume','Windows 음량'],['zoom','확대/축소'],['scroll','세로 스크롤'],['scroll-x','가로 스크롤'],['history','실행 취소·다시 실행'],['window','창 전환'],['desktop','가상 데스크톱'],['brightness','기기 밝기']];
    for(const [value,title] of targets)target.add(new Option(title,value));
    const targetKey=held?'heldTarget':'target',stepKey=held?'heldStep':'step',reverseKey=held?'heldReverseDirection':'reverseDirection',stackKey=held?'heldStack':'stack';
    target.value=binding[targetKey];
    target.addEventListener('change',()=>{binding[targetKey]=target.value;persist();renderControlInspector();});
    config.append(label,target);
    const stepLabel=document.createElement('label');stepLabel.textContent='회전 변화량';
    const stepSelect=document.createElement('select');stepSelect.className='control-step';
    for(const n of [1,2,5,10])stepSelect.add(new Option(String(n),String(n)));
    stepSelect.value=String(binding[stepKey]||1);
    stepSelect.addEventListener('change',()=>{binding[stepKey]=Number(stepSelect.value);persist();});
    const reverseLabel=document.createElement('label');reverseLabel.className='control-reverse';
    const reverse=document.createElement('input');reverse.type='checkbox';reverse.checked=binding[reverseKey]===true;
    reverse.addEventListener('change',()=>{binding[reverseKey]=reverse.checked;persist();});
    reverseLabel.append(reverse,document.createTextNode('방향 반대로'));
    config.append(stepLabel,stepSelect,reverseLabel);
    root.append(config);
    if(currentMode==='stack'){
      const area=document.createElement('div');area.className='control-stack-targets';
      for(const [value,title] of targets){
        const lbl=document.createElement('label'),check=document.createElement('input');check.type='checkbox';
        check.checked=binding[stackKey].includes(value);
        check.addEventListener('change',()=>{
          const values=targets.map(x=>x[0]).filter(x=>x===value?check.checked:binding[stackKey].includes(x));
          if(!values.length){check.checked=true;return;}
          binding[stackKey]=values;stackPositions[offset-2]=0;persist();renderPhysicalControls();
        });
        lbl.append(check,document.createTextNode(title));area.append(lbl);
      }
      root.append(area);
    }
  }
  const currentMode=knob?(held?binding.heldMode:binding.mode):'trigger';
  const gestures=!knob?[['down','●','누르기']]:
    held?[['holdLeft','●◀','누른 채 왼쪽 회전'],['holdRight','●▶','누른 채 오른쪽 회전']]:
    [['left','↶','왼쪽 회전'],['right','↷','오른쪽 회전'],['down','●','누르기']];
  const strip=document.createElement('div');strip.className='control-gesture-strip';
  for(const [gesture,glyph,title] of gestures){
    const tile=document.createElement('button');tile.type='button';
    tile.className='control-gesture-tile'+(controlGesture===gesture?' active':'');
    const assigned=binding[gesture];
    const allowed=currentMode==='trigger'&&!(knob&&gesture==='down'&&binding.heldEnabled===true);
    const targetKey=held?'heldTarget':'target',reverseKey=held?'heldReverseDirection':'reverseDirection';
    const reverse=binding[reverseKey]===true;
    const left=gesture==='left'||gesture==='holdLeft';
    const named={page:['이전 페이지','다음 페이지'],profile:['이전 프로필','다음 프로필'],volume:['음량 감소','음량 증가'],zoom:['축소','확대'],history:['실행 취소','다시 실행']};
    const auto=named[binding[targetKey]]?.[(left?0:1)^(reverse?1:0)]||'자동 조절';
    tile.innerHTML='<span class="control-gesture-symbol">'+glyph+'</span><strong>'+title+
      '</strong><span class="control-gesture-value">'+(allowed?(assigned?escapeHtml(keyName(assigned)):gesture==='down'?'＋ 액션 놓기':auto):gesture==='down'&&binding.heldEnabled?(assigned?escapeHtml(keyName(assigned))+' · 비활성':'누르기 비활성'):'조절 동작 자동 지정')+'</span>';
    tile.disabled=!allowed;
    tile.addEventListener('click',()=>{controlGesture=gesture;renderControlInspector();});
    tile.addEventListener('dragover',e=>{if(allowed){e.preventDefault();tile.classList.add('drag-over');}});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag-over'));
    tile.addEventListener('drop',e=>{if(!allowed)return;e.preventDefault();const id=e.dataTransfer.getData('application/x-d200x-action');if(ACTIONS.has(id))controlDrop(index,id,gesture);});
    const remove=document.createElement('button');remove.type='button';remove.className='control-tile-remove';
    remove.textContent='×';remove.title='등록된 동작 삭제';
    remove.disabled=!assigned||!allowed;
    remove.addEventListener('click',e=>{e.stopPropagation();removeControlAction(index,gesture);});
    const holder=document.createElement('div');holder.className='control-tile-holder';
    holder.append(tile,remove);strip.append(holder);
  }
  root.append(strip);
  const chosen=gestures.some(x=>x[0]===controlGesture)?controlGesture:gestures[0][0];
  const current=binding[chosen];
  if(current&&currentMode==='trigger'){
    const editor=document.createElement('div');editor.className='control-action-editor';
    const fields=document.createElement('div');fields.className='fields';
    fields.innerHTML=actionFields(current);bindExtendedActionFields(fields,current);
    fields.querySelectorAll('[data-field]').forEach(node=>node.addEventListener(node.tagName==='TEXTAREA'?'input':'change',()=>{
      current.settings[node.dataset.field]=node.type==='checkbox'?node.checked:node.type==='number'?Number(node.value):node.value;
      persist();
    }));
    editor.append(fields);root.append(editor);
    if(['multi','multi-switch','random'].includes(current.type))renderMultiEditor(current,editor);
    if(current.type==='logic')renderLogicEditor(current,editor);
    fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
      if(!window.deckBridge?.choosePath)return;
      const selected=await window.deckBridge.choosePath(button.dataset.pathKind);if(!selected)return;
      current.settings[button.dataset.pathPicker]=selected;persist();renderControlInspector();
    }));
  }
  const testBar=document.createElement('div');testBar.className='control-test-row';
  for(const [gesture,title] of (!knob?[['down','▶ 실행']]:held?
    [['hold-left','●◀ 왼쪽'],['hold-right','●▶ 오른쪽']]:
    [['left','◀ 왼쪽'],['right','오른쪽 ▶'],['down','● 누르기']])){
    const button=document.createElement('button');button.type='button';button.textContent=title;
    button.addEventListener('click',()=>runActionPreview(gesture));testBar.append(button);
  }
  if(knob)root.append(testBar);
  appendInspectorSaveBar(root);
}
function bindSdkStateIcons(root,item){
  const panel=root.querySelector('[data-sdk-state-icons]');
  if(!panel)return;
  const draw=()=>{
    panel.replaceChildren();
    for(const [key,label] of [['off','OFF'],['on','ON']]){
      const group=document.createElement('div');group.className='sdk-state-icon';
      const heading=document.createElement('strong');heading.textContent=label;
      const image=document.createElement('div');image.className='sdk-state-preview';
      const selected=item.settings?.sdkStateIcons?.[key];
      if(selected?.kind==='file'){
        const img=document.createElement('img');img.src=selected.value;img.alt=label+' 상태 아이콘';image.append(img);
      }else image.textContent='기본';
      const choose=document.createElement('button');choose.type='button';choose.textContent='라이브러리';
      choose.addEventListener('click',()=>openIconLibrary(item,key));
      const file=document.createElement('button');file.type='button';file.textContent='파일';
      file.addEventListener('click',async()=>{
        try{
          if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서 사용할 수 있습니다.');
          const chosen=await chooseNativeImage('image');
          if(!chosen?.dataUrl)return;
          const png=await rasterizeIcon(chosen.dataUrl);
          if(!currentPage().includes(item))return;
          item.settings.sdkStateIcons??={};
          // File picker provides one file only: prefill both slots with that image.
          // Pack selections can resolve a matching _on/_off companion.
          item.settings.sdkStateIcons.off={kind:'file',value:png};
          item.settings.sdkStateIcons.on={kind:'file',value:png};
          persistInspectorChange();render();
        }catch(error){window.d200xActionStatus?.('상태 아이콘 선택 실패: '+String(error?.message||error));}
      });
      const reset=document.createElement('button');reset.type='button';reset.textContent='초기화';
      reset.addEventListener('click',()=>{
        if(item.settings?.sdkStateIcons)delete item.settings.sdkStateIcons[key];
        persist();render();
      });
      const buttons=document.createElement('div');buttons.className='sdk-state-buttons';
      buttons.append(choose,file,reset);
      group.append(heading,image,buttons);panel.append(group);
    }
  };
  draw();
}
function bindExtendedActionFields(root,item){
  if(item.type==='sd-plugin'){
    bindSdkStateIcons(root,item);
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
        const entities=await window.deckBridge.haEntities();
        if(!entities.length)throw new Error('제어 가능한 엔티티가 없습니다.');
        const current=item.settings?.entityId||'';
        const names=entities.map((e,i)=>(i+1)+'. '+e.name+' ['+e.entity_id+'] ('+e.state+')').join('\n');
        // Native prompt may truncate enormous lists; offer a searchable ID first.
        const filter=prompt('엔티티 이름/ID 검색어 (빈칸은 처음 30개)',current);
        if(filter===null)return;
        const found=entities.filter(e=>(e.name+' '+e.entity_id).toLowerCase().includes(filter.trim().toLowerCase())).slice(0,30);
        if(!found.length)throw new Error('검색 결과가 없습니다.');
        const chosen=prompt(found.map((e,i)=>(i+1)+'. '+e.name+' ['+e.entity_id+']').join('\n')+'\n\n번호 또는 엔티티 ID 입력','1');
        if(chosen===null)return;
        const selected=/^\d+$/.test(chosen.trim())?found[Number(chosen.trim())-1]?.entity_id:chosen.trim();
        if(!entities.some(e=>e.entity_id===selected))throw new Error('유효한 엔티티를 선택하세요.');
        item.settings.entityId=selected;
        const input=root.querySelector('[data-field="entityId"]');if(input)input.value=selected;
        persist();
      }catch(error){window.d200xActionStatus?.('HA 엔티티 조회 실패: '+String(error?.message||error));}
    });
  }
  if(item.type==='audio-play')populateAudioOutputs(root.querySelector('[data-field="output"]'),item);
  if(item.type!=='hotkey')return;
  const preset=root.querySelector('[data-field="preset"]');
  preset?.addEventListener('change',()=>{
    item.settings.preset=preset.value;
    if(preset.value&&HOTKEY_PRESETS[preset.value]){
      item.settings.keys=HOTKEY_PRESETS[preset.value];
      const keys=root.querySelector('[data-field="keys"]');
      if(keys)keys.value=item.settings.keys;
    }
    persist();
  });
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
// The root breadcrumb reflects the catalogue that owns the assignment.
// Help is shown only for actions needing usage/limitation explanations.
const INSPECTOR_HELP={
  multi:{
    title:'다중 동작',description:'등록한 단계를 위에서 아래 순서대로 실행합니다.',
    steps:['오른쪽 액션 목록을 아래 단계 목록에 끌어놓거나 동작 추가를 사용하세요.','단계는 위/아래 버튼으로 순서를 바꾸고, 필요한 위치에 지연을 넣을 수 있습니다.'],
    cautions:['복합 동작 중첩은 지원하지 않습니다.','실행 중단은 진행 중인 단계를 즉시 취소하지 않을 수 있습니다.']
  },
  'multi-switch':{
    title:'다중 동작 스위치',description:'상태 1과 상태 2에 서로 다른 동작 목록을 등록하고 상태에 따라 실행합니다.',
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
    steps:['지속 시간을 초 단위로 입력하고 사운드를 선택하세요.'],
    cautions:[]
  },
  'hotkey-switch':{
    title:'단축키 전환',description:'두 개의 단축키를 번갈아 실행합니다.',
    steps:['단축키 1과 단축키 2를 각각 입력하세요.','입력칸을 클릭하고 원하는 키 조합을 누르세요.'],
    cautions:['단축키 지원 범위는 실행 중인 Windows 앱에 따라 달라집니다.']
  },
  'sd-plugin':{
    title:'플러그인 설정',description:'설치된 Stream Deck SDK 플러그인의 동작과 표시 상태를 설정합니다.',
    steps:['플러그인 속성 열기로 해당 플러그인의 설정을 확인하세요.','OFF/ON 이미지는 필요할 때 각 상태에 지정하세요.'],
    cautions:['지원되는 설정은 설치된 플러그인의 구현에 따라 다릅니다.']
  },
  'ha-toggle':{
    title:'Home Assistant 장치 제어',description:'선택한 Home Assistant 엔티티를 켜거나 끕니다.',
    steps:['목록에서 사용할 엔티티를 선택하고 연결 상태를 확인하세요.'],
    cautions:['Home Assistant 서버에 연결되어 있어야 동작합니다.']
  }
};
function inspectorBreadcrumb(item,action,inspectorName){
  const plugin=item.type==='sd-plugin';
  const root=libraryTab==='plugins'?'플러그인':'액션';
  const category=plugin
    ?sdkPlugins.find(p=>p.uuid===item.settings?.pluginUUID)?.name||
      (item.settings?.actionUUID===HA_CUSTOM_ACTION?'Home Assistant':'설치된 플러그인')
    :action?.category||'기타';
  return [root,category,inspectorName].filter(Boolean).join(' › ');
}
function inspectorOverview(item){
  switch(item.type){
    case 'multi':return (item.children?.length||0)+'개의 단계';
    case 'multi-switch':return '상태 1 · '+(item.sequences?.[0]?.length||0)+'개 / 상태 2 · '+(item.sequences?.[1]?.length||0)+'개';
    case 'random':return (item.children?.length||0)+'개의 후보';
    case 'timer':return '지속 시간 및 사운드 설정';
    case 'logic':return '한 번 · 두 번 · 길게 누르기';
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
function renderInspector(){
  beginInspectorSession();
  inspectorListener.abort();inspectorListener=new AbortController();
  if(state.selected!==null&&state.selected>=14){
    renderControlInspector();
    return;
  }
  const root=$("inspector");root.replaceChildren();const item=state.selected===null?null:DeckCore.visibleActions(state)[state.selected];
  if(state.selected===13&&wideDisplayAvailable()){renderWideInspector();return;}
  if(!item){root.className="inspector empty";root.textContent=state.selected===null?"버튼을 선택하세요":"액션을 끌어 이 키에 놓으세요";
    if(inspectorSession?.dirty)appendInspectorSaveBar(root);return;}
  root.className="inspector"+(item.type==='hotkey-switch'?' hotkey-switch-inspector':'')+(item.type==='sd-plugin'?' sdk-plugin-inspector':'');
  const action=ACTIONS.get(item.type),fields=actionFields(item);
  const sdkName=item.type==='sd-plugin'
    ?(item.settings?.actionUUID===HA_CUSTOM_ACTION?'Home Assistant 장치 제어':
      sdkActionNames.get(item.settings?.actionUUID)||item.settings?.actionName||item.settings?.actionUUID||'설치된 플러그인')
    :null;
  const inspectorName=sdkName||action?.label;
  root.innerHTML=`<div class="action-head"><strong>${escapeHtml(inspectorBreadcrumb(item,action,inspectorName))}</strong></div>
    <div class="properties"><div class="preview"><div class="preview-key" id="icon-preview">
      <span id="icon-preview-content"></span>
      <button class="icon-preview-control icon-preview-plus" type="button" id="icon-library-open" aria-label="아이콘 라이브러리 열기" title="아이콘 라이브러리">+</button>
      <button class="icon-preview-control icon-preview-menu" type="button" id="icon-menu-trigger" aria-label="아이콘 변경 메뉴" aria-expanded="false" aria-controls="icon-dropdown" title="아이콘 메뉴">⌄</button>
    </div>
    <div class="icon-dropdown" id="icon-dropdown" role="menu" hidden>
      <button type="button" data-icon-command="library">아이콘</button>
      <button type="button" data-icon-command="file">파일에서 설정</button>
      <button type="button" data-icon-command="paste">클립보드에서 붙여넣기</button>
      <button type="button" data-icon-command="new">새로운 아이콘</button>
      <button type="button" data-icon-command="library">Stream Deck 아이콘 라이브러리 열기</button>
    </div></div>
    <div class="fields"><div class="field"><label for="key-title">제목</label>
      <div class="title-line"><input id="key-title" value="${escapeHtml(item.title)}">
      <button type="button" class="title-style-trigger" id="title-style-trigger" aria-label="제목 글꼴 속성" aria-expanded="false" aria-controls="title-style-popover">T⌄</button>
      <div class="title-style-popover" id="title-style-popover" hidden>
        <label><input type="checkbox" id="title-visible"> 제목 보기</label>
        <div class="title-align" role="group" aria-label="제목 정렬">
          <button type="button" data-align="bottom" title="아래쪽 배치">▤</button>
          <button type="button" data-align="middle" title="가운데 배치">≡</button>
          <button type="button" data-align="top" title="위쪽 배치">▥</button>
        </div>
        <select id="title-family" aria-label="글꼴"><option value="default">기본</option><option value="Malgun Gothic">맑은 고딕</option><option value="Segoe UI">Segoe UI</option></select>
        <div class="title-format"><input id="title-size" type="number" min="8" max="48" aria-label="글꼴 크기">
        <button type="button" data-style="bold" aria-label="굵게">B</button><button type="button" data-style="italic" aria-label="기울임">I</button><button type="button" data-style="underline" aria-label="밑줄">U</button>
        <input id="title-color" type="color" aria-label="글꼴 색상">
        <button type="button" id="title-color-palette" class="title-palette-open" title="색상 팔레트">▦</button></div>
        <div class="outline-settings">
          <span>외곽선</span>
          <select id="outline-width" aria-label="외곽선 두께">
            <option value="none">없음</option><option value="thin">얇게</option>
            <option value="medium">보통</option><option value="thick">두껍게</option>
          </select>
          <input id="outline-color" type="color" aria-label="외곽선 색상">
          <button type="button" id="outline-color-palette" class="title-palette-open" title="외곽선 색상 팔레트">▦</button>
        </div>
        <div id="title-palette" class="title-palette" hidden>
          <div class="title-palette-header"><strong id="title-palette-heading">글자 색상</strong>
            <button type="button" id="title-palette-close" title="팔레트 닫기">×</button></div>
          <div class="title-palette-label">기본 색상</div>
          <div id="title-palette-presets" class="title-palette-grid"></div>
          <div class="title-palette-label">나의 색상</div>
          <div id="title-palette-mine" class="title-palette-grid my-colors"></div>
          <span id="title-palette-empty" class="hint">저장된 색상이 없습니다.</span>
          <button type="button" id="title-palette-save">현재 색상을 나의 색상에 저장</button>
        </div>
        <button type="button" class="style-reset" id="title-reset" title="기본 스타일 복원">↺</button>
      </div></div></div>${fields}</div></div>`;
  const previewButton=document.createElement('button');previewButton.type='button';
  previewButton.textContent='▶ 실행 테스트';previewButton.className='action-preview-test';
  previewButton.title='실제 Windows/D200X 동작을 한 번 실행합니다';
  previewButton.addEventListener('click',()=>runActionPreview('down'));
  root.querySelector('.action-head').append(previewButton);
  appendInspectorHelp(root.querySelector('.action-head'),item);
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
  }
  bindTitleStyle(item);
  bindIconControls(item);
  refreshTitlePreview(item);
  $("key-title").addEventListener("input",ev=>{item.title=ev.target.value;persist();renderGrid();refreshTitlePreview(item);});
  bindExtendedActionFields(root,item);
  bindShortcutOptionPreviews(root,item);
  groupCompactActionFields(root,item.type);
  bindInspectorShortcut(root,item);
  appendInspectorSaveBar(root);
  root.querySelectorAll("[data-path-picker]").forEach(button=>{
    button.addEventListener("click",async()=>{
      if(!window.deckBridge?.choosePath){
        alert("파일 선택은 Windows 편집기 EXE에서 지원합니다.");return;
      }
      const field=button.dataset.pathPicker;
      try{
        const selected=await window.deckBridge.choosePath(button.dataset.pathKind);
        if(!selected||!state.pages.some(page=>page.includes(item)))return;
        const inputNode=root.querySelector('[data-field="'+field+'"]');
        item.settings[field]=selected;
        if(inputNode)inputNode.value=selected;
        persist();
      }catch(error){alert("파일 선택 오류: "+String(error?.message||error));}
    });
  });
  // Capture combinations for supported native fields without actually sending
  // the shortcut to Windows. Escape cancels; Backspace clears an assignment.
  if(["hotkey","hotkey-switch"].includes(item.type)){
    for(const field of ["keys","first","second"]){
      const node=root.querySelector('[data-field="'+field+'"]');
      if(!node)continue;
      node.readOnly=true;node.title="클릭한 뒤 원하는 단축키를 누르세요 · Esc 취소 · Backspace 삭제";
      let armed=false;
      node.addEventListener("focus",()=>{armed=true;node.placeholder="단축키를 누르세요 (Esc 취소)";});
      node.addEventListener("blur",()=>{armed=false;node.placeholder="클릭하여 할당";});
      node.addEventListener("keydown",event=>{
        if(!armed)return;
        event.preventDefault();event.stopPropagation();
        if(event.key==="Escape"){node.blur();return;}
        if(event.key==="Backspace"&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey){
          node.value="";item.settings[field]="";persist();
          node.dispatchEvent(new Event('input',{bubbles:true}));node.blur();return;
        }
        if(["Control","Shift","Alt","Meta"].includes(event.key))return;
        const key=event.code?.startsWith("Key")?event.code.slice(3)
          :event.code?.startsWith("Digit")?event.code.slice(5)
          :event.key===" "?"Space":event.key;
        if(!key||key==="Unidentified")return;
        const combo=[event.ctrlKey?"Ctrl":null,event.altKey?"Alt":null,
          event.shiftKey?"Shift":null,event.metaKey?"Win":null,key].filter(Boolean).join("+");
        node.value=combo;item.settings[field]=combo;
        if(item.type==='hotkey'){
          item.settings.preset='';
          const preset=root.querySelector('[data-field="preset"]');
          if(preset)preset.value='';
        }
        persist();node.dispatchEvent(new Event('input',{bubbles:true}));node.blur();
      });
    }
  }
  root.querySelectorAll("[data-field]").forEach(node=>{
    node.addEventListener(node.type==="range"||node.tagName==="TEXTAREA"?"input":"change",()=>{
      let value=node.type==="checkbox"?node.checked:node.type==="number"||node.type==="range"?Number(node.value):node.value;
      item.settings[node.dataset.field]=value;
      if(item.type==='system-scroll'&&node.dataset.field==='axis')
        item.settings.direction=value==='horizontal'?'right':'down';
      persist();
      if(item.type==='system-scroll'&&node.dataset.field==='axis')renderInspector();
      if(node.dataset.field==="volume") $("volume-display").textContent=String(value);
      if(node.dataset.field==="body"&&$("text-count")) $("text-count").textContent=String(value.length)+" / -";
    });
  });
  if(['multi','multi-switch','random'].includes(item.type))renderMultiEditor(item,root);
  if(item.type==='logic')renderLogicEditor(item,root);
  if(item.type==='folder')renderFolderInspector(item,root);
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
    add("다중 동작 생성",()=>setItem(index,newAction("multi")));
    add("Key Logic 동작 생성",()=>setItem(index,newAction("logic")));
    divider();
    add("붙여넣기　Ctrl+V",clipboard?()=>pasteClipboardAction(index):null);
    add("동작 불러오기…",()=>importSlotAction(index));
  }else{
    const isLocal=Boolean(currentPage()[index]);
    if(!state.folderPath?.length)add(state.pinned?.[index]?"고정 해제":"고정",()=>{if(DeckCore.togglePinned(state,index)){persist();render();}});
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
    add("삭제",()=>removeSlotAction(index));
  }
  menu.style.left=Math.max(0,Math.min(x,window.innerWidth-230))+"px";
  menu.style.top=Math.max(0,Math.min(y,window.innerHeight-380))+"px";
  menu.hidden=false;
}
let clipboard=null;
window.addEventListener("click",ev=>{if(!ev.target.closest("#key-menu"))$("key-menu").hidden=true;});
window.addEventListener("keydown",ev=>{
  if(ev.key==="Escape")$("key-menu").hidden=true;
  if(!ev.ctrlKey||ev.altKey||ev.metaKey||["INPUT","TEXTAREA"].includes(document.activeElement.tagName))return;
  const key=ev.key.toLowerCase(),index=state.selected;
  if(index===null||index<0||index>=14||reservedWideSlot(index))return;
  if(key==="c"){
    const item=DeckCore.visibleActions(state)[index];
    if(item){ev.preventDefault();clipboard=clone(item);}
  }else if(key==="v"&&clipboard){
    ev.preventDefault();pasteClipboardAction(index);
  }
});
$("action-search").addEventListener("input",renderLibrary);
$("add-page").addEventListener("click",()=>{
  if(state.folderPath?.length){
    if(!DeckCore.addFolderPage(state))window.d200xActionStatus?.('폴더별 페이지는 최대 10개입니다.');
    else {persist();render();}
    return;
  }
  if(state.pages.length>=10){
    window.d200xActionStatus?.('원본 기준 새 페이지는 프로필당 최대 10개입니다. 기존 페이지는 보존됩니다.');
    return;
  }
  state.pages.push(blankPage());DeckCore.ensureControls(state).pages.push(Array.from({length:5},DeckCore.emptyBinding));
  state.page=state.pages.length-1;state.folderPath=[];state.selected=null;persist();render();
});
$("delete-page").addEventListener("click",()=>{
  if(state.folderPath?.length){
    if(DeckCore.folderPageCount(state)<=1)return;
    const folder=DeckCore.activeFolder(state);
    if(confirm('폴더 페이지 '+((folder?.pageIndex||0)+1)+'을 삭제하시겠습니까?')){
      if(DeckCore.deleteFolderPage(state)){persist();render();}
    }
    return;
  }
  if(state.pages.length<=1)return;
  if(!confirm("현재 페이지 "+(state.page+1)+"을(를) 삭제하시겠습니까? 이 페이지의 모든 액션이 삭제됩니다."))return;
  if(DeckCore.deletePage(state)){persist();render();}
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
function cancelAudioFade(audio){
  const previous=audioFadeTimers.get(audio);
  if(previous)clearInterval(previous);
  audioFadeTimers.delete(audio);
}
function fadeAudio(audio,target,duration=AUDIO_FADE_MS){
  cancelAudioFade(audio);
  const start=performance.now(),initial=audio.volume;
  return new Promise(resolve=>{
    if(duration<=0){audio.volume=target;resolve();return;}
    const interval=setInterval(()=>{
      if(audio.paused){cancelAudioFade(audio);resolve();return;}
      const t=Math.min(1,(performance.now()-start)/duration);
      audio.volume=Math.max(0,Math.min(1,initial+(target-initial)*t));
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
async function playAudioAction(outcome,index){
  if(!window.deckBridge?.audioFileUrl)throw new Error('Windows 실행 환경에서만 사용할 수 있습니다.');
  if(!outcome.file)throw new Error('재생할 오디오 파일을 먼저 선택하세요.');
  const key=String(state.page)+':'+index;
  const old=activeAudioPlayers.get(key);
  if(old&&['play-stop','loop-stop'].includes(outcome.mode)&&!old.paused){
    stopAudio(old);return '오디오 정지';
  }
  if(old&&outcome.mode!=='overlap')stopAudio(old);
  const url=await window.deckBridge.audioFileUrl(outcome.file);
  const audio=new Audio(url);
  const level=outcome.volume/100;
  const fadeDuration=outcome.fadeDuration*1000;
  const fadeIn=['in','in-out'].includes(outcome.fade);
  const fadeOut=['out','in-out'].includes(outcome.fade);
  audio.volume=fadeIn?0:level;
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
        audio.volume=level*Math.max(0,remaining/fadeDuration);
      }
    });
  }
  try{
    await audio.play();
    if(fadeIn)fadeAudio(audio,level,fadeDuration).catch(error=>console.warn('페이드 인 오류',error));
  }catch(error){cleanup();throw error;}
  return '오디오 재생 시작';
}
const activeActionTimers=new Map();
const timerDeadlines=new WeakMap();
const runningMultiActions=new Set();
const runningMultiControllers=new WeakMap();
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
async function executeMultiStep(action,signal){
  const outcome=DeckCore.planAction(action,state.page,state.pages.length);
  const bridge=window.deckBridge;
  if(!bridge)throw new Error('다중 동작은 Windows EXE에서만 실행할 수 있습니다.');
  switch(outcome.kind){
    case 'sd-plugin':
      throw new Error('복합 동작의 SDK 플러그인은 아직 지원하지 않습니다.');
    case 'ha-toggle':
      return bridge.haToggle(outcome.entityId);
    case 'windows-hotkey':
      return bridge.sendHotkey(outcome.keys);
    case 'windows-hotkey-switch':{
      const signature='multi-hotkey:'+outcome.first+'|'+outcome.second;
      const current=compositeHotkeyPositions.get(signature)||0;
      const keys=current===0?outcome.first:outcome.second;
      if(!keys)throw new Error('다중 동작의 단축키 전환 설정이 비어 있습니다.');
      await bridge.sendHotkey(keys);compositeHotkeyPositions.set(signature,1-current);
      return true;
    }
    case 'timer':{
      if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
      const timer=setTimeout(()=>playTimerChime(action.settings?.sound||'connect'),outcome.seconds*1000);
      signal?.addEventListener('abort',()=>clearTimeout(timer),{once:true});
      return true;
    }
    case 'media-control':
      return bridge.mediaControl(outcome.operation);
    case 'close-local-app':
      return bridge.closeLocalApp(outcome.path,outcome.force);

    case 'audio-play':
      return playAudioAction(outcome,'multi-'+action.type);
    case 'audio-stop':
      stopAllAudio();return true;
    case 'website':
      return bridge.openWebsite(outcome.url,outcome.mode,outcome.browserPath);
    case 'open-local-path':
      if(action.type==='open-app'&&outcome.foreground&&/\.exe$/i.test(outcome.path)&&
        await bridge.focusLocalApp(outcome.path))return true;
      return bridge.openLocalPath(outcome.path,outcome.target);
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
      throw new Error('아직 다중 동작에서 실행할 수 없는 액션: '+action.type);
  }
}

const compositeHotkeyPositions=new Map();
const logicPresses=new Map();
function triggerLogicSlot(action,slot,index){
  const check=DeckCore.planComposite(action,{gesture:slot});
  if(check.kind!=='composite')return window.d200xActionStatus?.(check.message);
  if(check.steps.length===0)return;
  if(check.steps.some(step=>!MULTI_ALLOWED.includes(step.type)))
    return window.d200xActionStatus?.('Key Logic에 지원하지 않는 하위 액션이 있습니다.');
  const key='logic:'+index;
  if(runningMultiActions.has(key))return window.d200xActionStatus?.('Key Logic 실행 중입니다.');
  runningMultiActions.add(key);
  DeckCore.runComposite(action,{gesture:slot,execute:executeMultiStep,wait:waitMultiDelay})
    .then(()=>{scheduleFolderExitAfterAction();window.d200xActionStatus?.('Key Logic '+slot+' 실행 완료');},
      error=>window.d200xActionStatus?.('Key Logic 실행 실패: '+String(error?.message||error)))
    .finally(()=>runningMultiActions.delete(key));
}
// Single is delayed until the double-press window closes; hold fires once.
function handleLogicGesture(action,index,gesture,preview){
  const prior=logicPresses.get(index);
  if(preview){triggerLogicSlot(action,'single',index);return 'Key Logic 한 번 누르기 테스트';}
  if(gesture==='down'){
    if(prior?.held)return null;
    if(prior?.singleTimer){
      clearTimeout(prior.singleTimer);clearTimeout(prior.holdTimer);
      logicPresses.delete(index);triggerLogicSlot(action,'double',index);
      return 'Key Logic 두 번 누르기';
    }
    if(prior)return null;
    const record={action,held:true,holdFired:false,holdTimer:null,singleTimer:null};
    record.holdTimer=setTimeout(()=>{
      if(logicPresses.get(index)!==record||!record.held)return;
      record.holdFired=true;
      triggerLogicSlot(action,'hold',index);
    },600);
    logicPresses.set(index,record);return 'Key Logic 누름 감지';
  }
  if(gesture==='up'&&prior?.action===action){
    prior.held=false;clearTimeout(prior.holdTimer);
    if(prior.holdFired){logicPresses.delete(index);return 'Key Logic 길게 누르기 완료';}
    prior.singleTimer=setTimeout(()=>{
      if(logicPresses.get(index)!==prior)return;
      logicPresses.delete(index);triggerLogicSlot(action,'single',index);
    },300);
    return 'Key Logic 입력 확인 중';
  }
  return null;
}
// Generated local tones: no external sound files, commands or dependencies.
function playTimerChime(kind){
  if(kind==='none')return;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  const context=new AudioContextClass();
  const patterns={
    connect:[660,880],disconnect:[880,550],release:[880,660,440],
    find:[740,880,740],other:[523,659,784]
  };
  const tones=patterns[kind]||patterns.connect;
  Promise.resolve(context.resume()).then(()=>{
    tones.forEach((freq,i)=>{
      const oscillator=context.createOscillator();
      const gain=context.createGain();
      const start=context.currentTime+i*0.16;
      oscillator.type='sine';oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,start);
      gain.gain.exponentialRampToValueAtTime(0.09,start+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+0.14);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(start);oscillator.stop(start+0.145);
    });
    return new Promise(resolve=>setTimeout(resolve,tones.length*160+100));
  }).then(()=>context.close()).catch(error=>{
    console.warn('타이머 알림음 재생 실패',String(error?.message||error));
    context.close().catch(()=>{});
  });
}
const openAppHoldTimers=new Map();
function handleOpenAppHold(action,index,event,gesture){
  if(gesture==='down'){
    if(openAppHoldTimers.has(index))return '프로그램 버튼 입력 유지 중';
    const token={action,page:state.page,profile:state.profileId,fired:false,timer:null};
    token.timer=setTimeout(()=>{
      if(openAppHoldTimers.get(index)!==token)return;
      const current=index<14?DeckCore.visibleActions(state)[index]:DeckCore.controlBinding(state,index)?.down;
      if(state.page!==token.page||state.profileId!==token.profile||current!==action){
        openAppHoldTimers.delete(index);return;
      }
      token.fired=true;
      const path=action.settings?.app;
      if(!path)return window.d200xActionStatus?.('종료할 프로그램을 먼저 선택하세요.');
      window.deckBridge?.closeLocalApp?.(path,action.settings?.hold==='force').then(
        ()=>window.d200xActionStatus?.('길게 누르기: 프로그램 종료 요청 완료'),
        error=>window.d200xActionStatus?.('길게 누르기 종료 실패: '+String(error?.message||error)));
    },650);
    openAppHoldTimers.set(index,token);
    return '프로그램 버튼 누름 대기';
  }
  const token=openAppHoldTimers.get(index);
  if(!token)return null;
  clearTimeout(token.timer);openAppHoldTimers.delete(index);
  if(token.fired)return '길게 누르기 동작 완료';
  if(token.action!==action||token.page!==state.page||token.profile!==state.profileId)return null;
  const pressed={...event,state:1,pressed:true};
  return executeHardwareAction(pressed,true);
}
const hotkeySwitchPositions=new Map();
const lastHardwareDown=new Map();
function runActionPreview(gesture='down'){
  const index=state.selected;
  if(!Number.isInteger(index)||index<0||index>18)return;
  const event=DeckCore.previewHardwareEvent(index,gesture);
  if(!event)return;
  const result=executeHardwareAction(event,true);
  window.d200xActionStatus?.(result||'등록된 동작이 없어 실행하지 않았습니다.');
}
let lastWideHardwarePress=0;
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
  const hasHeld=Boolean(binding?.heldEnabled||binding?.holdLeft||binding?.holdRight);
  if(stateByte===1){knobPresses.set(rawIndex,{rotated:false,defer:hasHeld});
    return {event,consume:hasHeld,replay:false};}
  const pressed=knobPresses.get(rawIndex);
  if(stateByte===0){knobPresses.delete(rawIndex);
    return {event,consume:Boolean(pressed?.defer),replay:Boolean(pressed?.defer&&!pressed.rotated&&!binding?.heldEnabled)};}
  if(stateByte===2||stateByte===3){
    if(pressed){pressed.rotated=true;
      if(pressed.defer)return {event:{...event,state:stateByte===2?4:5},consume:false,replay:false};}
  }
  return {event,consume:false,replay:false};
}
function executeHardwareAction(event,preview=false,skipKnobGesture=false){
  if(!skipKnobGesture){
    const held=heldKnobEvent(event,preview);
    if(held.replay){
      const index=Number(event.index);
      const result=executeHardwareAction({...event,state:1},false,true);
      // The physical release is still forwarded for SDK actions.
      if(DeckCore.controlBinding(state,index-1)?.down?.type==='sd-plugin')
        executeHardwareAction({...event,state:0},false,true);
      return result;
    }
    if(held.consume)return null;
    event=held.event;
  }
  if(DeckCore.isWideDisplayPress(event)&&wideDisplayAvailable()){
    // The merged key can report both halves of one physical press.
    // Ignore duplicate press packets, but do not affect other controls.
    const now=Date.now();
    if(!preview&&now-lastWideHardwarePress<240)return null;
    if(!preview)lastWideHardwarePress=now;
    const mode=advanceWideDisplay();
    return '가로 화면 전환: '+WIDE_LABELS[mode];
  }
  const resolved=DeckCore.resolveHardwareEvent(state,event);
  if(!resolved)return null;
  const index=resolved.index,offset=index-14;
  if(!preview&&resolved.action?.type==='open-app'&&
    ['close','force'].includes(resolved.action.settings?.hold)&&
    ['down','up'].includes(resolved.gesture))
    return handleOpenAppHold(resolved.action,index,event,resolved.gesture);
  if(resolved.action?.type==='logic'&&['down','up'].includes(resolved.gesture))
    return handleLogicGesture(resolved.action,index,resolved.gesture,preview);
  const sdkAction=index>=16&&['left','right','hold-left','hold-right'].includes(resolved.gesture)
    ?resolved.binding?.[({'hold-left':'holdLeft','hold-right':'holdRight'})[resolved.gesture]||resolved.gesture]:resolved.action;
  if(sdkAction?.type==='sd-plugin'){
    const ctx=sdkContext(index,
      resolved.gesture==='up'?'down':resolved.gesture);
    if(!window.deckBridge?.sdkKey)return 'SDK 플러그인은 Windows EXE에서만 실행됩니다.';
    if(resolved.gesture==='up')lastHardwareDown.delete(index);
    window.deckBridge.sdkKey(ctx,resolved.gesture).then(ok=>{
      if(!ok)window.d200xActionStatus?.('SDK 플러그인이 활성화되지 않았습니다.');
    }).catch(error=>window.d200xActionStatus?.('SDK 플러그인 실행 실패: '+String(error?.message||error)));
    if(preview&&resolved.gesture==='down')setTimeout(()=>window.deckBridge.sdkKey(ctx,'up'),100);
    return 'Stream Deck 플러그인 이벤트: '+resolved.gesture;
  }
  if(resolved.gesture==='up'){lastHardwareDown.delete(index);return null;}
  if(resolved.gesture==='down'&&!preview){
    const now=Date.now();
    if(now-(lastHardwareDown.get(index)||0)<250)return null;
    lastHardwareDown.set(index,now);
  }
  const planned=DeckCore.planHardwareEvent(state,event,
    offset>=2?stackPositions[offset-2]:0);
  if(!planned)return null;
  const outcome=planned.outcome;
  // Hardware-driven navigation cannot silently abandon an unsaved inspector.
  if(!preview&&inspectorSession?.dirty&&
    ['page','profile','folder-back','folder-enter'].includes(outcome.kind)){
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
    return '노브 '+(idx+1)+' 조절 대상: '+({page:'페이지',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[target]);
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
    const action=index<14?state.pages[state.page][index]:
      DeckCore.controlBinding(state,index)?.[resolved.gesture];
    if(!action||action.type!==outcome.type)return '복합 동작 설정이 없습니다.';
    const scope=index>=14&&state.controls.scopes[index-14]==='global'?'global':String(state.page);
    const key=scope+':'+index+':'+resolved.gesture;
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
    DeckCore.runComposite(action,{
      execute:executeMultiStep,wait:waitMultiDelay,
      state:position,random,signal:controller.signal,
      nextActionMs:Math.max(2,Math.min(200,Number(action.settings?.nextActionMs)||100))
    }).then(
      count=>{
        scheduleFolderExitAfterAction();
        if(outcome.type==='multi-switch'){
          action.settings.activeState=1-position;
          persist();renderGrid();
          window.d200xActionStatus?.('다중 동작 스위치 상태 '+(position+1)+' · '+count+'단계 완료');
        }else if(outcome.type==='random')window.d200xActionStatus?.('무작위 동작 '+count+'개 실행 완료');
        else window.d200xActionStatus?.('다중 동작 '+count+'단계 완료');
      },
      error=>window.d200xActionStatus?.('복합 동작 중단: '+String(error?.message||error))
    ).finally(()=>{
      runningMultiActions.delete(key);
      if(runningMultiControllers.get(action)===controller)runningMultiControllers.delete(action);
    });
    return outcome.type==='multi-switch'
      ?'다중 동작 스위치 상태 '+(position+1)+' 실행 요청':outcome.type==='random'?'무작위 동작 실행 요청':'다중 동작 실행 요청';
  }
  if(outcome.kind==='ha-toggle'){
    if(!window.deckBridge?.haToggle)return 'Home Assistant는 Windows EXE에서만 실행됩니다.';
    window.deckBridge.haToggle(outcome.entityId).then(
      ()=>window.d200xActionStatus?.('HA 장치 토글 요청 완료: '+outcome.entityId),
      error=>window.d200xActionStatus?.('HA 동작 실패: '+String(error?.message||error)));
    return 'HA 장치 토글 요청: '+outcome.entityId;
  }
  if(outcome.kind==='display-only')return '페이지 표시기는 현재 페이지를 표시하는 전용 액션입니다.';
  if(outcome.kind==='device-sleep'){
    if(!window.deckBridge?.sleepDisplay)return 'D200X 화면 절전은 Windows EXE에서만 실행됩니다.';
    window.deckBridge.sleepDisplay().then(
      ()=>window.d200xActionStatus?.('D200X 화면 잠자기 요청 완료 · 다음 버튼으로 깨우기'),
      error=>window.d200xActionStatus?.('D200X 잠자기 실패: '+String(error?.message||error)));
    return 'D200X 화면 잠자기 요청';
  }
  if(outcome.kind==='mute'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.adjustWindows('mute',0,1).then(
      ()=>window.d200xActionStatus?.('음소거 전환 완료'),
      error=>window.d200xActionStatus?.('음소거 전환 실패: '+String(error?.message||error))
    );
    return 'Windows 음소거 전환 요청';
  }
  if(outcome.kind==='close-local-app'){
    if(!window.deckBridge?.closeLocalApp)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.closeLocalApp(outcome.path,outcome.force).then(
      ()=>window.d200xActionStatus?.('선택한 프로그램 닫기 요청 완료'),
      error=>window.d200xActionStatus?.('프로그램 닫기 실패: '+String(error?.message||error)));
    return '선택한 프로그램 '+(outcome.force?'강제 종료':'닫기')+' 요청';
  }
  if(outcome.kind==='audio-stop'){
    stopAllAudio();return '오디오 재생 정지';
  }
  if(outcome.kind==='audio-play'){
    playAudioAction(outcome,index).then(
      result=>window.d200xActionStatus?.(result),
      error=>window.d200xActionStatus?.('오디오 재생 실패: '+String(error?.message||error)));
    return '오디오 재생 요청';
  }
  if(outcome.kind==='type-text'){
    const useClipboard=outcome.mode==='clipboard';
    const command=useClipboard?window.deckBridge?.pasteText:window.deckBridge?.typeText;
    if(!command)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    command(outcome.text,outcome.enter).then(
      ()=>window.d200xActionStatus?.(useClipboard?'클립보드에 기록하고 붙여넣기 완료':'유니코드 직접 입력 완료'),
      error=>window.d200xActionStatus?.('텍스트 입력 실패: '+String(error?.message||error)));
    return useClipboard?'Windows 클립보드 붙여넣기 요청':'유니코드 직접 입력 요청';
  }
  if(outcome.kind==='timer'){
    const scope=index>=14&&state.controls.scopes[index-14]==='global'?'global':String(state.page);
    const key=state.profileId+':'+scope+':'+index;
    const active=activeActionTimers.get(key);
    if(active){
      clearTimeout(active.handle);clearInterval(active.interval);
      activeActionTimers.delete(key);timerDeadlines.delete(active.action);
      renderGrid();window.scheduleDeckSync?.();
      return '타이머 중지';
    }
    const seconds=outcome.seconds;
    const action=resolved.action;
    const deadline=Date.now()+seconds*1000;
    timerDeadlines.set(action,deadline);
    const interval=setInterval(()=>{
      if(!activeActionTimers.has(key)){clearInterval(interval);return;}
      if(DeckCore.visibleActions(state).includes(action)){
        renderGrid();
        if(Math.ceil((deadline-Date.now())/1000)%5===0)window.scheduleDeckSync?.();
      }
    },1000);
    const handle=setTimeout(()=>{
      clearInterval(interval);activeActionTimers.delete(key);timerDeadlines.delete(action);
      renderGrid();window.scheduleDeckSync?.();
      playTimerChime(action.settings?.sound||'connect');
      window.d200xActionStatus?.('타이머 '+seconds+'초 완료');
    },seconds*1000);
    activeActionTimers.set(key,{handle,interval,action});renderGrid();window.scheduleDeckSync?.();
    return '타이머 '+seconds+'초 시작 · 다시 누르면 취소';
  }
  if(outcome.kind==='media-control'){
    if(!window.deckBridge?.mediaControl)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.mediaControl(outcome.operation).then(
      ()=>window.d200xActionStatus?.('미디어 키 전송 완료'),
      error=>window.d200xActionStatus?.('미디어 실행 실패: '+String(error?.message||error)));
    return '미디어 제어 요청';
  }
  if(outcome.kind==='windows-hotkey-switch'){
    if(!window.deckBridge?.sendHotkey)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    const scope=index>=14&&state.controls.scopes[index-14]==='global'?'global':String(state.page);
    const key=scope+':'+index;
    const position=hotkeySwitchPositions.get(key)||0;
    const keys=position===0?outcome.first:outcome.second;
    if(!keys)return '전환할 단축키가 설정되지 않았습니다.';
    window.deckBridge.sendHotkey(keys).then(
      ()=>{hotkeySwitchPositions.set(key,1-position);window.d200xActionStatus?.('단축키 전환 '+(position+1)+' 실행');},
      error=>window.d200xActionStatus?.('단축키 전환 실패: '+String(error?.message||error)));
    return '단축키 전환 '+(position+1)+' 요청';
  }
  if(outcome.kind==='windows-hotkey'){
    if(!window.deckBridge?.sendHotkey)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.sendHotkey(outcome.keys).then(
      ()=>window.d200xActionStatus?.('단축키 전송 완료'),
      error=>window.d200xActionStatus?.('단축키 실행 실패: '+String(error?.message||error)));
    return '단축키 실행 요청';
  }
  if(outcome.kind==='open-local-path'){
    if(!window.deckBridge?.openLocalPath)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    (resolved.action?.type==='open-app'&&outcome.foreground&&/\.exe$/i.test(outcome.path)
      ?window.deckBridge.focusLocalApp(outcome.path).then(found=>found?true:window.deckBridge.openLocalPath(outcome.path,outcome.target))
      :window.deckBridge.openLocalPath(outcome.path,outcome.target)).then(
      ()=>window.d200xActionStatus?.('경로 열기 완료'),
      error=>window.d200xActionStatus?.('경로 열기 실패: '+String(error?.message||error)));
    return '지정 경로 열기 요청';
  }
  if(outcome.kind==='system-shortcut'){
    if(!window.deckBridge?.systemShortcut)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.systemShortcut(outcome.target,outcome.operation).then(
      ()=>window.d200xActionStatus?.('단축키 전송 완료'),
      error=>window.d200xActionStatus?.('단축키 실패: '+String(error?.message||error)));
    return 'Windows 단축키 요청: '+outcome.target;
  }
  if(outcome.kind==='device-brightness-set'){
    if(!window.deckBridge?.setBrightness)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.setBrightness(outcome.value).then(
      value=>window.d200xActionStatus?.('D200X 밝기: '+value+'%'),
      error=>window.d200xActionStatus?.('밝기 설정 실패: '+String(error?.message||error)));
    return 'D200X 밝기 '+outcome.value+'% 설정 요청';
  }
  if(outcome.kind==='device-brightness'){
    if(!window.deckBridge?.adjustBrightness)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.adjustBrightness(outcome.direction,outcome.count||1).then(
      value=>window.d200xActionStatus?.('D200X 밝기: '+value),
      error=>window.d200xActionStatus?.('밝기 조절 실패: '+String(error?.message||error)));
    return 'D200X 밝기 조절 요청';
  }
  if(outcome.kind==='zoom-reset'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.adjustWindows('zoom-reset',0,1).then(
      ()=>window.d200xActionStatus?.('확대·축소 초기화 키 전송'),
      error=>window.d200xActionStatus?.('초기화 실패: '+String(error?.message||error)));
    return '활성 앱 원래 크기 요청';
  }
  if(outcome.kind==='windows-switch'){
    if(!window.deckBridge?.switchWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.switchWindows(outcome.target,outcome.direction,outcome.count||1).then(
      ()=>window.d200xActionStatus?.('전환 키 입력 완료'),
      error=>window.d200xActionStatus?.('전환 실패: '+String(error?.message||error))
    );
    return outcome.target==='window'?'창 전환 요청':'가상 데스크톱 전환 요청';
  }
  if(outcome.kind==='edit-history'){
    if(!window.deckBridge?.editHistory)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.editHistory(outcome.operation,outcome.count||1).then(
      ()=>window.d200xActionStatus?.('편집 동작 전송 완료'),
      error=>window.d200xActionStatus?.('편집 동작 실패: '+String(error?.message||error))
    );
    return outcome.operation==='undo'?'실행 취소 요청':'다시 실행 요청';
  }
  if(outcome.kind==='scroll'){
    if(!window.deckBridge?.scrollWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.scrollWindows(outcome.axis,outcome.direction,outcome.count||1).then(
      ()=>window.d200xActionStatus?.('스크롤 완료'),
      error=>window.d200xActionStatus?.('스크롤 실패: '+String(error?.message||error))
    );
    return 'Windows '+(outcome.axis==='horizontal'?'가로':'세로')+' 스크롤 요청';
  }
  if(outcome.kind==='adjust'){
    if(!window.deckBridge?.adjustWindows)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.adjustWindows(outcome.target,outcome.direction,outcome.count||1).then(
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
    window.deckBridge.openWebsite(outcome.url,outcome.mode,outcome.browserPath).then(
      ()=>window.d200xActionStatus?.('웹사이트 열기 완료'),
      error=>window.d200xActionStatus?.('웹사이트 열기 실패: '+String(error?.message||error))
    );
    return '웹사이트 열기 요청';
  }
  return outcome.message;
}
window.executeD200XKey=executeHardwareAction;
let refreshProfilesMenu=()=>{};
function render(){renderGrid();renderInspector();refreshProfilesMenu();scheduleSdkSync();}

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
async function importIconPackIntoLibrary(){
  if(!window.deckBridge?.importIconPack){
    window.d200xActionStatus?.('아이콘팩 등록은 Windows EXE에서 사용할 수 있습니다.');
    return;
  }
  const button=$("icon-pack-import");
  button.disabled=true;
  try{
    const pack=await window.deckBridge.importIconPack();
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
  const name=String(icon.filename||icon.name||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
  const match=/^(.*)_(off|on)$/i.exec(name);
  return match?{base:match[1].toLowerCase(),state:match[2].toLowerCase()}:null;
}
function findIconCompanion(pack,icon){
  const pair=iconPairType(icon);
  if(!pair)return null;
  return pack.icons.find(other=>other!==icon&&(()=>{
    const test=iconPairType(other);
    return test?.base===pair.base&&test.state!==(pair.state);
  })())||null;
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
        const target=libraryTarget;
        if(!target||!currentPage().includes(target))return;
        try{
          const png=await rasterizeIcon(icon.image);
          if(!currentPage().includes(target))return;
          if(libraryStateKey&&target.type==='sd-plugin'){
            const companion=findIconCompanion(pack,icon);
            const pair=iconPairType(icon);
            const off=pair?.state==='on'?companion:icon;
            const on=pair?.state==='off'?companion:icon;
            const fallback=icon;
            const offIcon=off||fallback,onIcon=on||fallback;
            const offPng=offIcon===icon?png:await rasterizeIcon(offIcon.image);
            const onPng=onIcon===icon?png:await rasterizeIcon(onIcon.image);
            if(!currentPage().includes(target))return;
            target.settings.sdkStateIcons??={};
            target.settings.sdkStateIcons.off={kind:'file',value:offPng,packId:pack.id};
            target.settings.sdkStateIcons.on={kind:'file',value:onPng,packId:pack.id};
          }else target.icon={kind:'file',value:png,packId:pack.id};
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
function openIconLibrary(item,stateKey=null){
  libraryTarget=item;
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
  $("icon-library").hidden=true;libraryTarget=null;libraryStateKey=null;
}
let fileIconTarget=null;
let makerTarget=null;

function applyIconData(target,uri){
  if(!target||!uri||!state.pages.some(page=>page.includes(target)))return;
  target.icon={kind:"file",value:uri};
  persistInspectorChange();render();
}
function rasterizeIcon(uri){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=196;canvas.height=196;
      const ctx=canvas.getContext("2d");
      const scale=Math.min(196/image.width,196/image.height);
      const w=image.width*scale,h=image.height*scale;
      ctx.drawImage(image,(196-w)/2,(196-h)/2,w,h);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror=()=>reject(new Error("이미지를 열 수 없습니다."));
    image.src=uri;
  });
}
async function setIconFile(file,target=fileIconTarget){
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
    applyIconData(target,await rasterizeIcon(uri));
  }catch(error){alert("아이콘 적용 실패: "+String(error?.message||error));}
}
async function pasteIcon(target){
  try{
    if(window.deckBridge?.readClipboardImage){
      const image=await window.deckBridge.readClipboardImage();
      if(!image){alert("클립보드에 이미지가 없습니다.");return;}
      applyIconData(target,await rasterizeIcon(image));return;
    }
    if(!navigator.clipboard?.read)throw new Error("이미지 클립보드를 사용할 수 없습니다.");
    for(const entry of await navigator.clipboard.read()){
      const format=entry.types.find(type=>["image/png","image/jpeg","image/webp"].includes(type));
      if(format){await setIconFile(await entry.getType(format),target);return;}
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
function openIconMaker(target){
  makerTarget=target;
  $("icon-maker").hidden=false;
  renderIconMaker();
}
function closeIconMaker(){makerTarget=null;$("icon-maker").hidden=true;}
function bindIconControls(item){
  const host=$("icon-preview-content");host.replaceChildren(iconNode(item,ACTIONS.get(item.type)?.icon||"+"));
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
          chooseNativeImage('image').then(async chosen=>{
            if(!chosen)return;
            applyIconData(item,await rasterizeIcon(chosen.dataUrl));
          }).catch(error=>window.d200xActionStatus?.('아이콘 선택 실패: '+String(error?.message||error)));
        }else{fileIconTarget=item;$("custom-icon-file").click();}
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
function bindSidebarHeader(){
  const trigger=$("profile-trigger"),menu=$("profile-menu");
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
    const overall=entry(menu,'전체 프로필 관리 ▸',()=>{globalPanel.hidden=!globalPanel.hidden;},'profile-global-trigger');
    const globalPanel=document.createElement('div');globalPanel.className='profile-global-panel';globalPanel.hidden=true;
    const globalAction=(label,fn)=>entry(globalPanel,label,run(fn));
    globalAction('전체 프로필·설정 JSON 내보내기',()=>{
      try{
        const payload={...state,actionPanelAppearance:window.D200XPanelIcons.exportConfig()};
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='D200X-profiles-backup.json';
        document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){window.d200xActionStatus?.('설정 내보내기 실패: '+String(error?.message||error));}
    });
    globalAction('전체 프로필·설정 JSON 가져오기',()=>{
      const picker=document.createElement('input');
      picker.type='file';picker.accept='.json,application/json';
      const restoreBackup=async file=>{
        if(!file)return;
        try{
          if(file.size>20*1024*1024)throw new Error('백업 파일이 20MB를 초과합니다.');
          const parsed=JSON.parse(await file.text());
          if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.pages)||
            parsed.pages.length<1||parsed.pages.length>128||
            !Array.isArray(parsed.profileNames)||parsed.profileNames.length<1||
            parsed.profileNames.length>50||typeof parsed.profileId!=='string')
            throw new Error('올바른 D200X 전체 프로필 백업 파일이 아닙니다.');
          const restored=DeckCore.migrateState(parsed);
          if(!restored.profileNames?.length)throw new Error('프로필 정보가 올바르지 않습니다.');
          const snapshot=JSON.stringify(state);
          if(!confirm('현재 모든 프로필과 버튼 설정을 백업 파일로 교체합니다. 계속하시겠습니까?'))return;
          const safetyKey=STORAGE_KEY+'-before-import-backup';
          localStorage.setItem(safetyKey,snapshot);
          const prior=state;
          state=restored;
          if(!persist()){
            state=prior;
            localStorage.setItem(STORAGE_KEY,snapshot);
            throw new Error('설정을 저장할 수 없습니다. 기존 설정으로 복구했습니다.');
          }
          // Older exports contain profiles only; keep current catalogue theme.
          if(parsed.actionPanelAppearance){
            if(!window.D200XPanelIcons.restoreConfig(parsed.actionPanelAppearance))
              window.d200xActionStatus?.('프로필은 복원했지만 액션 목록 테마 복원은 실패했습니다.');
          }
          controlGesture='down';render();renderLibrary();window.scheduleDeckSync?.();
          window.d200xActionStatus?.('전체 프로필 가져오기 완료 (이전 설정 안전 백업 보관)');
        }catch(error){alert('프로필 가져오기 실패: '+String(error?.message||error));}
      };
      if(window.deckBridge?.chooseImportFile){
        window.deckBridge.chooseImportFile('profile').then(chosen=>{
          if(chosen)restoreBackup({
            name:chosen.name,size:new Blob([chosen.text]).size,
            text:async()=>chosen.text
          });
        }).catch(error=>window.d200xActionStatus?.('프로필 파일 선택 실패: '+String(error?.message||error)));
      }else{
        picker.addEventListener('change',()=>restoreBackup(picker.files?.[0]),{once:true});
        picker.click();
      }
    });

    globalAction('Fusion 360 명령 일괄 등록 JSON 가져오기',async()=>{
      if(!window.deckBridge?.chooseImportFile)throw Error('Windows EXE에서만 이용할 수 있습니다.');
      const chosen=await window.deckBridge.chooseImportFile('fusion-batch');
      if(!chosen)return;
      const input=window.D200XFusionBatch.validate(JSON.parse(chosen.text));
      if(!sdkPlugins.some(plugin=>plugin.uuid===input.pluginUUID))
        throw Error('Fusion 360 플러그인을 먼저 설치해야 합니다.');
      if(state.profileNames.length>=50)throw Error('프로필 최대 50개 제한에 도달했습니다.');
      const pages=Math.ceil(input.commands.length/14);
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
    });

    menu.append(globalPanel);
  };
  refreshProfilesMenu=renderProfiles;
  renderProfiles();
  trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
  document.addEventListener('pointerdown',event=>{
    if(!menu.contains(event.target)&&!trigger.contains(event.target))close();
  });
  // The main settings screen remains explicitly disabled.
}
$("icon-pack-import").addEventListener("click",importIconPackIntoLibrary);
$("close-icon-library").addEventListener("click",closeIconLibrary);
$("icon-library").addEventListener("click",event=>{if(event.target===$("icon-library"))closeIconLibrary();});
$("icon-library-search").addEventListener("input",renderIconLibrary);
$("icon-library-layout").addEventListener("click",()=>{
  const groups=$("icon-library-groups");groups.classList.toggle("compact");
  $("icon-library-layout").setAttribute("aria-pressed",String(groups.classList.contains("compact")));
});
$("custom-icon-file").addEventListener("change",event=>{
  const target=fileIconTarget;fileIconTarget=null;
  setIconFile(event.target.files?.[0],target);event.target.value="";
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
  if(makerTarget)applyIconData(makerTarget,$("icon-maker-canvas").toDataURL("image/png"));
  closeIconMaker();
});
// Device options reuse the same update destination as the existing tray menu.
function bindSettingsMenu(){
  const trigger=$("settings-trigger"),menu=$("settings-menu"),update=$("check-update");
  const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
  trigger.addEventListener('click',()=>{
    menu.hidden=!menu.hidden;
    trigger.setAttribute('aria-expanded',String(!menu.hidden));
  });
  update.addEventListener('click',async()=>{
    close();
    try{
      if(!window.deckBridge?.checkForUpdates)throw Error('Windows DeckForge에서만 사용할 수 있습니다.');
      await window.deckBridge.checkForUpdates();
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
      const index=sdkActionInstances().find(x=>x.context===ctx);
      if(index){
        const item=index.slot<14?DeckCore.visibleActions(state)[index.slot]:
          DeckCore.controlBinding(state,index.slot)?.[ctx.split(':').at(-1)];
        if(item?.type==='sd-plugin'){
          item.settings.pluginSettings=message.settings;
          persistInspectorChange();
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
      const old=sdkVisuals.get(ctx)||{};
      if(message.kind==='setTitle'&&typeof message.payload?.title==='string')
        old.title=message.payload.title.slice(0,256);
      if(message.kind==='setImage'&&typeof message.payload?.image==='string'&&
        /^data:image\/(png|jpeg|webp|svg\+xml);/.test(message.payload.image)&&
        message.payload.image.length<1024*1024)
        old.image=message.payload.image;
      if(message.kind==='setState')old.state=message.payload?.state;
      sdkVisuals.set(ctx,old);
      if(message.kind==='setImage'&&old.image){
        const cfg=sdkActionInstances().find(x=>x.context===ctx);
        if(cfg?.pluginUUID===FUSION_PLUGIN){
          const disabled=fusionDisabledImage(old.image);
          if(disabled){
            fusionOfflineContexts.add(ctx);
            fusionLiveContexts.delete(ctx);
          }else{
            fusionOfflineContexts.delete(ctx);
            fusionLiveContexts.add(ctx);
            if(typeof cfg.settings?.commandId==='string')
              void rememberFusionIcon(cfg.settings.commandId,old.image);
          }
        }
      }
      renderGrid();window.scheduleDeckSync?.();
    }else if(message.kind==='error')window.d200xActionStatus?.(message.message);
  });
}
bindActionAppearance();renderLibrary();render();refreshSdkPlugins();
