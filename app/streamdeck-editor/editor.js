"use strict";
/* Independent Stream Deck 7.6.1-oriented UI. No legacy Ulanzi inspector imports.
 * D200X physical key dispatch: page navigation and default-browser URL only. */
const CATALOG = [
  ["Soundboard", [["audio-play","오디오 재생","♫"],["audio-stop","오디오 정지","◼"]]],
  ["Stream Deck", [["timer","타이머","◴"],["brightness","밝기","☼"],["sleep","잠자기","☾"],["virtual","Virtual Stream Deck 토글","▣"]]],
  ["다중 동작", [["multi","다중 동작","▤"],["multi-switch","다중 동작 스위치","⇄"],["random","무작위 동작","⚄"],["logic","Key Logic","⇧"]]],
  ["시스템", [["website","웹사이트","◎"],["hotkey-switch","단축키 전환","⇄"],["hotkey","단축키","⌨"],["open","열기","▢"],["open-app","응용 프로그램 열기","▣"],["close","닫기","×"],["text","텍스트","¶"],["media","멀티미디어","♫"]]],
  ["탐색", [["folder","폴더 생성","▣"],["profile","프로필 전환","⇆"],["previous","이전 페이지","←"],["next","다음 페이지","→"],["goto","페이지로 이동","↗"],["indicator","페이지 표시기","①"]]],
  ["D200X 추가 액션", [["system-volume","Windows 음량 조절","🔊"],["system-mute","Windows 음소거","🔇"],["system-scroll","Windows 스크롤","↕"],["edit-history","실행 취소·다시 실행","↶"],["window-switch","창 전환","▣"],["desktop-switch","가상 데스크톱 전환","⇄"],["device-brightness","D200X 화면 밝기","☀"],["system-zoom","화면 확대·축소","⊕"],["screenshot","화면 캡처","▣"],["clipboard-edit","클립보드 편집","▤"],["window-state","창 상태","□"],["window-monitor","다른 모니터로 이동","⇆"],["explorer-open","파일 탐색기 열기","▢"],["brush-size","브러시 크기","◉"],["timeline-step","타임라인 한 단계","▶"],["timeline-zoom","타임라인 확대 단축키 (앱별)","⊕"],["file-open","지정 파일 열기","▣"],["folder-shortcut","지정 폴더 열기","▢"]]]
];
const ACTIONS = new Map(CATALOG.flatMap(([category, entries]) => entries.map(([id,label,icon]) => [id,{category,id,label,icon}])));
const STORAGE_KEY="d200x-streamdeck-editor-prototype-v1";
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const KEY_COUNT = 14;
const CONTROLS = [{name:"첫 페이지",kind:"side"},{name:"뒤로 가기",kind:"side"},{name:"노브 1",kind:"knob"},{name:"노브 2",kind:"knob"},{name:"노브 3",kind:"knob"}];
const blankPage = () => DeckCore.blankPage();
let controlGesture="down";
const stackPositions=[0,0,0];
let state=DeckCore.migrateState(null);
try {state=DeckCore.migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));} catch {state=DeckCore.migrateState(null);}
const persist=()=>{
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  catch(error) {
    console.error('D200X 설정 저장 실패',error);
    window.d200xActionStatus?.('설정 저장 실패: 저장 공간/권한을 확인하세요.');
    return false;
  }
  window.scheduleDeckSync?.();
  return true;
};
// Migration: preserve the existing 14 key assignments and extend with 5 physical controls.
state.pages.forEach(page=>{while(page.length<KEY_COUNT+CONTROLS.length)page.push(null);});
const valueOf=(item,field,fallback="")=>item?.settings?.[field]??fallback;
function keyName(item){return item?.title||ACTIONS.get(item?.type)?.label||"";}
function displayItem(item){
  if(!item||item.type!=="indicator")return item;
  return {...item,icon:{kind:"glyph",glyph:String(state.page+1)}};
}
function iconNode(item,defaultGlyph){
  if(item?.icon?.kind==="file"&&typeof item.icon.value==="string"){
    const image=document.createElement("img");image.className="icon-image";image.src=item.icon.value;image.alt="";return image;
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
function newAction(id){return DeckCore.createAction(id);}
function currentPage(){return state.pages[state.page];}
function setItem(index,item){
  if(index>=14){
    const binding=DeckCore.controlBinding(state,index);
    if(binding.mode!=='trigger'&&!(index>=16&&controlGesture==='down'&&binding.mode==='adjust'))binding.mode='trigger';
    binding[controlGesture]=item;
  }else currentPage()[index]=item;
  state.selected=index;persist();render();
}
function choose(index){
  if(state.selected!==index)controlGesture='down';
  state.selected=index;persist();render();
}
function controlDrop(index,id,gesture='down'){
  if(!ACTIONS.has(id))return;
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
    if(binding.mode!=='trigger' && !(index>=16&&gesture==='down'&&binding.mode==='adjust'))
      binding.mode='trigger';
    binding[gesture]=newAction(id);
  }
  state.selected=index;controlGesture=gesture;
  persist();render();
}
function renderGrid(){
  const grid=$("key-grid");grid.replaceChildren();
  currentPage().slice(0,KEY_COUNT).forEach((item,i)=>{
    const b=document.createElement("button");b.type="button";b.className="deck-key"+(i===13?" wide":"")+(state.selected===i?" selected":"");
    b.dataset.index=i;b.setAttribute("aria-label",`키 ${i+1}: ${keyName(item)||"비어 있음"}`);
    const visual=displayItem(item);
    const glyph=iconNode(visual,ACTIONS.get(item?.type)?.icon||"+");glyph.classList.add("glyph");
    const label=document.createElement("span");label.className="caption";label.textContent=item?.title||"";updateTitleAppearance(label,item);
    b.append(glyph,label);
    // Render the actual D200X PNG as the editor key surface. Icon and title
    // must stay in fixed coordinates, independent of the title font size.
    if(item&&window.renderDeckKeyImage){
      window.renderDeckKeyImage(visual,i).then(png=>{
        if(!b.isConnected||currentPage()[i]!==item)return;
        const preview=document.createElement("img");
        preview.className="rendered-key-image";
        preview.alt="";
        preview.src="data:image/png;base64,"+png;
        b.replaceChildren(preview);
      }).catch(error=>console.warn("버튼 이미지 미리보기 실패",error));
    }
    b.addEventListener("click",()=>choose(i));
    b.addEventListener("contextmenu",ev=>{ev.preventDefault();choose(i);showMenu(i,ev.clientX,ev.clientY);});
    b.addEventListener("dragover",ev=>{ev.preventDefault();b.classList.add("drag-over");});
    b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
    b.addEventListener("drop",ev=>{ev.preventDefault();b.classList.remove("drag-over");const id=ev.dataTransfer.getData("application/x-d200x-action");if(ACTIONS.has(id))setItem(i,newAction(id));});
    grid.append(b);
  });
  renderPhysicalControls();
  $("page-label").textContent=`페이지 ${state.page+1} / ${state.pages.length}`;
  $("delete-page").disabled=state.pages.length<=1;
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
    label.textContent=binding?.mode==='adjust'?'조절: '+({page:'페이지',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.target])
      :binding?.mode==='stack'?'스택: '+({page:'페이지',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[binding.stack[stackPositions[offset-2]%binding.stack.length]])
      :(item?keyName(item):name);
    button.append(symbol,label);
    button.addEventListener("click",()=>choose(index));
    button.addEventListener("contextmenu",event=>{event.preventDefault();choose(index);});
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
      if(ACTIONS.has(id))controlDrop(index,id);
    });
    root.append(button);
  });
}
function renderLibrary(){
  const root=$("library-list");root.replaceChildren();
  const query=$("action-search").value.trim().toLocaleLowerCase();
  for(const [category,entries] of CATALOG){
    const visible=entries.filter(([,label])=>(category+" "+label).toLocaleLowerCase().includes(query));
    if(!visible.length)continue;
    const section=document.createElement("section");section.className="group";
    const title=document.createElement("div");title.className="group-title";title.textContent=category;
    const body=document.createElement("div");title.addEventListener("click",()=>{body.hidden=!body.hidden;});
    for(const [id,label,icon] of visible){
      const entry=document.createElement("div");entry.className="action-item";entry.draggable=true;entry.title="드래그하여 빈 버튼에 놓기";
      const symbol=document.createElement("span");symbol.className="action-icon";symbol.textContent=icon;
      const name=document.createElement("span");name.textContent=label;entry.append(symbol,name);
      entry.addEventListener("dragstart",ev=>ev.dataTransfer.setData("application/x-d200x-action",id));
      entry.addEventListener("click",()=>{
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
function escapeHtml(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
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
    case "audio-play":return pathPicker("file","파일")+select("mode","동작",[["play-stop","재생 / 정지"],["overlap","재생 / 오버랩"],["restart","재생 / 재시작"],["loop-stop","반복 / 정지"]])+select("fade","페이드",[["none","페이드 없음"],["in","페이드 인"],["out","페이드 아웃"],["in-out","페이드 인 앤 아웃"]])+`<div class="field"><label for="s-volume">음량</label><div class="compound"><input id="s-volume" type="range" min="0" max="100" data-field="volume" value="${valueOf(item,"volume",50)}"><output id="volume-display">${valueOf(item,"volume",50)}</output></div></div>`+select("output","출력",[["default","기본"]])+`<div class="field"><span></span><span class="hint">출력 장치 전체 목록·실제 재생 엔진은 아직 미연결</span></div>`;
    case "audio-stop": case "previous": case "next": case "indicator":return "";
    case "timer":return `<div class="field"><label for="s-seconds">지속</label><div class="compound"><input type="number" min="1" id="s-seconds" data-field="seconds" value="${valueOf(item,"seconds",30)}"><span>초</span></div></div>`+select("sound","사운드",[["none","없음"],["connect","접속"],["disconnect","접속 끊김"],["release","접속 해제"],["find","찾기"],["other","기타"]]);
    case "brightness":return select("mode","동작",[["up","밝게"],["down","어둡게"],["max","최대"],["high","높음"],["medium","중간"],["low","낮음"],["min","최소"]]);
    case "sleep":return `<div class="field"><label>잠자기 설정</label><span class="hint">환경설정 열기… (기기 설정 연동 예정)</span></div>`;
    case "virtual":return `<div class="field"><label>기기</label><span class="hint">구성된 Virtual Stream Decks 없음</span></div>`;
    case "website":return input("url","URL","https://")+select("open","다음으로 열기",[["default","기본 브라우저"],["get","백그라운드에서 GET 요청"],["choose","브라우저 직접 선택"]]);
    case "open":return pathPicker("path","앱 / 파일");
    case "open-app":return pathPicker("app","앱","app")+select("hold","길게 누르기",[["none","아무것도 하지 않음"],["close","응용 프로그램 종료"],["force","응용 프로그램 강제 종료"]])+check("foreground","이미 실행 중이면 맨 앞으로");
    case "close":return pathPicker("path","앱 / 파일")+check("force","강제 종료");
    case "hotkey":return `<div class="field"><label>동작 선택기</label><span class="hint">프리셋 동작 (상세 프리셋 선택은 후속 구현)</span></div>`+input("keys","단축키","클릭하여 할당");
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
    case "multi":return `<div class="field"><label>내용</label><div>${item.children.length}개의 단계 · 아래에서 추가·수정</div></div>`;
    case "folder":case "random":return `<div class="field"><label>내용</label><div>${item.children.length}개의 ${item.type==="folder"?"항목":"동작"} <span class="hint">· 내부 편집 기능 미구현</span></div></div>`;
    case "multi-switch":return `<div class="field"><label>상태</label><span>1 / 2 · 내부 편집 기능 미구현</span></div>`;
    case "logic":return `<div class="field"><label>슬롯</label><span>한 번 누르기 / 두 번 누르기 / 유지 · 내부 편집 기능 미구현</span></div>`;
    case "profile":return select("profile","프로필",[["next","다음 프로필"]]);
    case "goto":return select("page","대상",state.pages.map((_,i)=>[String(i),String(i+1)]));
    default:return "";
  }
}
// Multi Action editor: uses the original right-hand action catalogue and does
// not change the approved editor layout. Unsupported nested composites are blocked.
const MULTI_ALLOWED=['hotkey','media','website','open','open-app','text',
  'system-volume','system-mute','system-zoom','device-brightness',
  'screenshot','clipboard-edit','explorer-open','file-open','folder-shortcut'];
function renderMultiEditor(item,root){
  const area=document.createElement('section');
  area.className='multi-action-editor';
  const heading=document.createElement('strong');heading.textContent='다중 동작 · 순서대로 실행';
  const note=document.createElement('p');note.className='hint';
  note.textContent='오른쪽 액션 목록에서 아래로 끌어놓기 · 지연은 별도 단계 · 중첩은 지원하지 않음';
  const list=document.createElement('div');list.className='multi-action-steps';
  const add=(id)=>{
    if(!MULTI_ALLOWED.includes(id)||item.children.length>=100)return;
    item.children.push(newAction(id));persist();renderInspector();
  };
  list.addEventListener('dragover',e=>e.preventDefault());
  list.addEventListener('drop',e=>{
    e.preventDefault();
    const id=e.dataTransfer.getData('application/x-d200x-action');
    if(MULTI_ALLOWED.includes(id))add(id);
    else window.d200xActionStatus?.('지원하지 않는 하위 액션입니다.');
  });
  item.children.forEach((step,i)=>{
    const row=document.createElement('div');row.className='multi-action-row';
    const title=document.createElement('span');
    title.textContent=(i+1)+'. '+(step.kind==='delay'?'지연 '+step.ms+'ms':keyName(step));
    row.append(title);
    const command=(text,fn)=>{
      const button=document.createElement('button');button.type='button';button.textContent=text;
      button.addEventListener('click',()=>{fn();persist();renderInspector();});row.append(button);
    };
    if(i>0)command('↑',()=>{[item.children[i-1],item.children[i]]=[item.children[i],item.children[i-1]];});
    if(i<item.children.length-1)command('↓',()=>{[item.children[i],item.children[i+1]]=[item.children[i+1],item.children[i]];});
    command('삭제',()=>item.children.splice(i,1));
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
      fields.innerHTML=actionFields(step);
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
  delay.addEventListener('click',()=>{
    if(item.children.length>=100)return;
    item.children.push({kind:'delay',ms:1000});persist();renderInspector();
  });
  toolbar.append(select,addButton,delay);
  area.append(heading,note,list,toolbar);
  root.querySelector('.fields')?.append(area);
}
const DEFAULT_TITLE_STYLE = DeckCore.TITLE;
let previewRequest=0;
async function refreshSelectedVisual(){
  const item=state.selected===null?null:currentPage()[state.selected];
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
let inspectorListener=new AbortController();
// Physical controls use a dedicated compact inspector instead of pretending
// each knob has a single key. Drag to an individual gesture or click it to edit.
function renderControlInspector(){
  const root=$("inspector"),index=state.selected,offset=index-14;
  const info=CONTROLS[offset],binding=DeckCore.controlBinding(state,index);
  root.className="inspector control-inspector";
  root.replaceChildren();
  const head=document.createElement('div');head.className='action-head';
  const name=document.createElement('strong');name.textContent=info.name+' · 액션 할당';
  head.append(name);root.append(head);
  const scopeRow=document.createElement('div');scopeRow.className='control-config';
  const scopeLabel=document.createElement('label');scopeLabel.textContent='적용 범위';
  const scope=document.createElement('select');
  for(const [value,label] of [['global','모든 페이지 공통'],['page','현재 페이지에만']]){
    const option=new Option(label,value);scope.add(option);
  }
  scope.value=state.controls.scopes[offset];
  scope.addEventListener('change',()=>{
    DeckCore.changeControlScope(state,index,scope.value);
    persist();render();
  });
  scopeRow.append(scopeLabel,scope);
  if(info.kind==='knob'){
    const modeLabel=document.createElement('label');modeLabel.textContent='설정 방식';
    const mode=document.createElement('select');
    for(const [value,label] of [['trigger','동작별 할당'],['adjust','조절형 액션'],['stack','다이얼 스택']])
      mode.add(new Option(label,value));
    mode.value=binding.mode;
    mode.addEventListener('change',()=>{
      binding.mode=mode.value;persist();render();
    });
    scopeRow.append(modeLabel,mode);
  }
  root.append(scopeRow);
  if(info.kind==='knob'&&['adjust','stack'].includes(binding.mode)){
    const config=document.createElement('div');config.className='control-config';
    const label=document.createElement('label');
    label.textContent=binding.mode==='adjust'?'회전 조절 대상':'스택 조절 대상';
    config.append(label);
    if(binding.mode==='adjust'){
      const select=document.createElement('select');
      for(const [value,title] of [['page','페이지 이동'],['volume','Windows 음량'],['zoom','활성 앱 확대/축소'],['scroll','세로 스크롤'],['scroll-x','가로 스크롤'],['history','실행 취소·다시 실행'],['window','창 전환'],['desktop','가상 데스크톱'],['brightness','기기 밝기']])
        select.add(new Option(title,value));
      select.value=binding.target;
      select.addEventListener('change',()=>{binding.target=select.value;persist();renderPhysicalControls();});
      config.append(select);
    }else{
      const area=document.createElement('div');area.className='control-stack-targets';
      const targets=[['page','페이지 이동'],['volume','Windows 음량'],['zoom','활성 앱 확대/축소'],['scroll','세로 스크롤'],['scroll-x','가로 스크롤'],['history','실행 취소·다시 실행'],['window','창 전환'],['desktop','가상 데스크톱'],['brightness','기기 밝기']];
      for(const [value,title] of targets){
        const label=document.createElement('label');
        const check=document.createElement('input');check.type='checkbox';
        check.checked=binding.stack.includes(value);
        check.addEventListener('change',()=>{
          const next=targets.map(x=>x[0]).filter(x=>x===value?check.checked:binding.stack.includes(x));
          if(!next.length){check.checked=true;return;}
          binding.stack=next;
          stackPositions[offset-2]=0;
          persist();render();
        });
        label.append(check,document.createTextNode(title));area.append(label);
      }
      config.append(area);
      const hint=document.createElement('small');hint.className='hint';
      hint.textContent='노브 누름: 페이지 → 음량 → 확대/축소 등 선택한 순서로 전환';
      config.append(hint);
    }
    const stepLabel=document.createElement('label');stepLabel.textContent='한 칸 회전 변화량';
    const stepSelect=document.createElement('select');
    for(const step of [1,2,5,10])stepSelect.add(new Option(String(step),String(step)));
    stepSelect.value=String(binding.step||1);
    stepSelect.addEventListener('change',()=>{
      binding.step=Number(stepSelect.value);persist();
    });
    const reverseLabel=document.createElement('label');reverseLabel.textContent='회전 방향 반대로';
    const reverse=document.createElement('input');reverse.type='checkbox';
    reverse.checked=binding.reverseDirection===true;
    reverse.addEventListener('change',()=>{binding.reverseDirection=reverse.checked;persist();});
    reverseLabel.append(reverse);
    const preview=document.createElement('small');preview.className='hint';
    const updatePreview=()=>{
      const size=binding.step||1;
      preview.textContent='왼쪽 '+(binding.reverseDirection?'+':'−')+size+
        ' / 오른쪽 '+(binding.reverseDirection?'−':'+')+size;
    };
    stepSelect.addEventListener('change',updatePreview);
    reverse.addEventListener('change',updatePreview);
    updatePreview();
    config.append(stepLabel,stepSelect,reverseLabel,preview);
    root.append(config);
  }
  const gestures=info.kind==='knob'
    ? [['left','↶','왼쪽 회전'],['right','↷','오른쪽 회전'],['down','●','누르기']]
    : [['down','●','누르기']];
  const strip=document.createElement('div');strip.className='control-gesture-strip';
  for(const [gesture,glyph,title] of gestures){
    const tile=document.createElement('button');tile.type='button';
    tile.className='control-gesture-tile'+(controlGesture===gesture?' active':'');
    const action=binding[gesture];
    const allowed=binding.mode==='trigger'||(binding.mode==='adjust'&&gesture==='down');
    tile.innerHTML='<span class="control-gesture-symbol">'+glyph+'</span><strong>'+title+
      '</strong><span class="control-gesture-value">'+(allowed?(action?escapeHtml(keyName(action)):'＋ 액션 놓기'):
      (binding.mode==='stack'&&gesture==='down'?'누르면 조절 대상 전환':'조절 동작 자동 지정'))+'</span>';
    tile.addEventListener('click',()=>{controlGesture=gesture;renderControlInspector();});
    tile.addEventListener('dragover',e=>{if(allowed){e.preventDefault();tile.classList.add('drag-over');}});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag-over'));
    tile.addEventListener('drop',e=>{
      if(!allowed)return;
      e.preventDefault();const id=e.dataTransfer.getData('application/x-d200x-action');
      if(ACTIONS.has(id))controlDrop(index,id,gesture);
    });
    strip.append(tile);
  }
  root.append(strip);
  const current=binding[controlGesture];
  if(current&&(binding.mode==='trigger'||(binding.mode==='adjust'&&controlGesture==='down'))){
    const editor=document.createElement('div');editor.className='control-action-editor';
    const row=document.createElement('div');row.className='control-action-header';
    const label=document.createElement('strong');label.textContent=keyName(current);
    const remove=document.createElement('button');remove.type='button';remove.textContent='이 동작 삭제';
    remove.addEventListener('click',()=>{binding[controlGesture]=null;persist();render();});
    row.append(label,remove);editor.append(row);
    const fields=document.createElement('div');fields.className='fields';
    fields.innerHTML=actionFields(current);
    fields.querySelectorAll('[data-field]').forEach(node=>{
      node.addEventListener(node.type==='range'||node.tagName==='TEXTAREA'?'input':'change',()=>{
        const value=node.type==='checkbox'?node.checked:
          node.type==='number'||node.type==='range'?Number(node.value):node.value;
        current.settings[node.dataset.field]=value;
        if(current.type==='system-scroll'&&node.dataset.field==='axis')
          current.settings.direction=value==='horizontal'?'right':'down';
        persist();
        if(current.type==='system-scroll'&&node.dataset.field==='axis')renderControlInspector();
      });
    });
    editor.append(fields);root.append(editor);
    // A physical-control file picker needs the same bridge as the screen-key inspector.
    fields.querySelectorAll('[data-path-picker]').forEach(button=>button.addEventListener('click',async()=>{
      if(!window.deckBridge?.choosePath){window.d200xActionStatus?.('Windows EXE에서만 파일을 선택할 수 있습니다.');return;}
      try{
        const selected=await window.deckBridge.choosePath(button.dataset.pathKind);
        if(!selected)return;
        current.settings[button.dataset.pathPicker]=selected;
        const field=fields.querySelector('[data-field="'+button.dataset.pathPicker+'"]');
        if(field)field.value=selected;
        persist();
      }catch(error){window.d200xActionStatus?.('경로 선택 실패: '+String(error?.message||error));}
    }));
  }else{
    const help=document.createElement('p');help.className='hint';
    help.textContent=binding.mode==='trigger'?'오른쪽 목록의 액션을 위 동작 칸에 끌어 넣으세요.':
      '회전은 조절 대상으로 실행되며, 누르기 칸에는 별도 액션도 등록할 수 있습니다.';
    root.append(help);
  }
  const testBar=document.createElement('div');testBar.className='control-config';
  for(const [gesture,title] of (info.kind==='knob'?[['left','◀ 왼쪽 회전 테스트'],['right','오른쪽 회전 테스트 ▶'],['down','● 누름 테스트']]:[['down','▶ 실행 테스트']])){
    const button=document.createElement('button');button.type='button';button.textContent=title;
    button.addEventListener('click',()=>runActionPreview(gesture));testBar.append(button);
  }
  root.append(testBar);
}
function renderInspector(){
  inspectorListener.abort();inspectorListener=new AbortController();
  if(state.selected!==null&&state.selected>=14){
    renderControlInspector();
    return;
  }
  const root=$("inspector");root.replaceChildren();const item=state.selected===null?null:currentPage()[state.selected];
  if(!item){root.className="inspector empty";root.textContent=state.selected===null?"버튼을 선택하세요":"액션을 끌어 이 키에 놓으세요";return;}
  root.className="inspector";const action=ACTIONS.get(item.type);const fields=actionFields(item);
  root.innerHTML=`<div class="action-head"><strong>${escapeHtml(action?.category)}: ${escapeHtml(action?.label)}</strong><button id="delete-action" title="액션 삭제" type="button">×</button></div>
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
  root.querySelector('#delete-action').before(previewButton);
  bindTitleStyle(item);
  bindIconControls(item);
  refreshTitlePreview(item);
  $("delete-action").addEventListener("click",()=>setItem(state.selected,null));
  $("key-title").addEventListener("input",ev=>{item.title=ev.target.value;persist();renderGrid();refreshTitlePreview(item);});
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
          node.value="";item.settings[field]="";persist();node.blur();return;
        }
        if(["Control","Shift","Alt","Meta"].includes(event.key))return;
        const key=event.code?.startsWith("Key")?event.code.slice(3)
          :event.code?.startsWith("Digit")?event.code.slice(5)
          :event.key===" "?"Space":event.key;
        if(!key||key==="Unidentified")return;
        const combo=[event.ctrlKey?"Ctrl":null,event.altKey?"Alt":null,
          event.shiftKey?"Shift":null,event.metaKey?"Win":null,key].filter(Boolean).join("+");
        node.value=combo;item.settings[field]=combo;persist();node.blur();
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
  if(item.type==='multi')renderMultiEditor(item,root);
}
function showMenu(index,x,y){
  const menu=$("key-menu");menu.replaceChildren();const item=currentPage()[index];
  const add=(label,handler)=>{const b=document.createElement("button");b.type="button";b.role="menuitem";b.textContent=label;b.addEventListener("click",()=>{menu.hidden=true;handler?.();});menu.append(b);};
  const divider=()=>menu.append(document.createElement("hr"));
  if(!item){add("폴더 생성",()=>setItem(index,newAction("folder")));add("다중 동작 생성",()=>setItem(index,newAction("multi")));add("Key Logic 동작 생성",()=>setItem(index,newAction("logic")));divider();add("동작 불러오기…",()=>alert("동작 불러오기는 아직 미구현"));divider();add("현재 배경",()=>{});add("파일에서 설정…",()=>alert("배경 파일 선택 미구현"));}
  else {add("고정",()=>alert("고정 기능 미구현"));add("복사하기　Ctrl+C",()=>{clipboard=clone(item);});add("폴더로 이동",()=>alert("폴더로 이동 미구현"));add("Key Logic으로 이동",()=>alert("변환 기능 미구현"));divider();add("동작 불러오기…",()=>alert("불러오기 미구현"));add("동작 내보내기…",()=>alert("내보내기 미구현"));divider();add("현재 배경",()=>{});add("파일에서 설정…",()=>alert("배경 파일 선택 미구현"));divider();add("삭제",()=>{if(confirm("이 동작을 삭제하시겠습니까?"))setItem(index,null);});}
  menu.style.left=Math.min(x,window.innerWidth-220)+"px";menu.style.top=Math.min(y,window.innerHeight-360)+"px";menu.hidden=false;
}
let clipboard=null;
window.addEventListener("click",ev=>{if(!ev.target.closest("#key-menu"))$("key-menu").hidden=true;});
window.addEventListener("keydown",ev=>{if(ev.key==="Escape")$("key-menu").hidden=true;if(ev.ctrlKey&&ev.key.toLowerCase()==="v"&&clipboard&&state.selected!==null&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){ev.preventDefault();setItem(state.selected,clone(clipboard));}});
$("action-search").addEventListener("input",renderLibrary);
$("add-page").addEventListener("click",()=>{state.pages.push(blankPage());DeckCore.ensureControls(state).pages.push(Array.from({length:5},DeckCore.emptyBinding));state.page=state.pages.length-1;state.selected=null;persist();render();});
$("delete-page").addEventListener("click",()=>{
  if(state.pages.length<=1)return;
  if(!confirm("현재 페이지 "+(state.page+1)+"을(를) 삭제하시겠습니까? 이 페이지의 모든 액션이 삭제됩니다."))return;
  if(DeckCore.deletePage(state)){persist();render();}
});
$("back-page").addEventListener("click",()=>{state.page=Math.max(0,state.page-1);state.selected=null;persist();render();});
$("next-page").addEventListener("click",()=>{state.page=Math.min(state.pages.length-1,state.page+1);state.selected=null;persist();render();});
// Physical D200X button presses run the selected page's action; clicking a
// PC editor key still only selects it for editing.
const activeAudioPlayers=new Map();
const allPlayingAudio=new Set();
const activeActionTimers=new Map();
const runningMultiActions=new Set();
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
function executeHardwareAction(event,preview=false){
  const resolved=DeckCore.resolveHardwareEvent(state,event);
  if(!resolved)return null;
  const index=resolved.index,offset=index-14;
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
  if(outcome.kind==='stack-next'){
    const idx=offset-2;
    stackPositions[idx]=(stackPositions[idx]+1)%outcome.size;
    renderPhysicalControls();
    const target=DeckCore.controlBinding(state,index).stack[stackPositions[idx]];
    return '노브 '+(idx+1)+' 조절 대상: '+({page:'페이지',volume:'음량',zoom:'확대/축소',scroll:'세로 스크롤','scroll-x':'가로 스크롤',history:'실행 취소·다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'기기 밝기'}[target]);
  }
  if(outcome.kind==='composite' && outcome.type==='multi'){
    const action=index<14?state.pages[state.page][index]:
      DeckCore.controlBinding(state,index)?.[resolved.gesture];
    if(!action||action.type!=='multi')return '다중 동작 설정이 없습니다.';
    const scope=index>=14&&state.controls.scopes[index-14]==='global'?'global':String(state.page);
    const key=scope+':'+index+':'+resolved.gesture;
    if(runningMultiActions.has(key))return '다중 동작이 이미 실행 중입니다.';
    runningMultiActions.add(key);
    DeckCore.runComposite(action,{execute:executeMultiStep,wait:waitMultiDelay}).then(
      count=>window.d200xActionStatus?.('다중 동작 '+count+'단계 완료'),
      error=>window.d200xActionStatus?.('다중 동작 중단: '+String(error?.message||error))
    ).finally(()=>runningMultiActions.delete(key));
    return '다중 동작 실행 요청';
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
    for(const audio of allPlayingAudio){audio.pause();audio.currentTime=0;}
    allPlayingAudio.clear();activeAudioPlayers.clear();
    return '오디오 재생 정지';
  }
  if(outcome.kind==='audio-play'){
    if(!window.deckBridge?.audioFileUrl)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    if(!outcome.file)return '재생할 오디오 파일을 먼저 선택하세요.';
    const key=String(state.page)+':'+index;
    const old=activeAudioPlayers.get(key);
    if(old&&['play-stop','loop-stop'].includes(outcome.mode)&&!old.paused){old.pause();old.currentTime=0;allPlayingAudio.delete(old);activeAudioPlayers.delete(key);return '오디오 정지';}
    if(old&&outcome.mode!=='overlap'){old.pause();old.currentTime=0;allPlayingAudio.delete(old);activeAudioPlayers.delete(key);}
    window.deckBridge.audioFileUrl(outcome.file).then(url=>{
      const audio=new Audio(url);
      audio.volume=outcome.volume/100;
      audio.loop=outcome.mode==='loop-stop';
      activeAudioPlayers.set(key,audio);allPlayingAudio.add(audio);
      audio.addEventListener('ended',()=>{
        allPlayingAudio.delete(audio);
        if(activeAudioPlayers.get(key)===audio)activeAudioPlayers.delete(key);
      },{once:true});
      return audio.play().catch(error=>{
        allPlayingAudio.delete(audio);
        if(activeAudioPlayers.get(key)===audio)activeAudioPlayers.delete(key);
        throw error;
      });
    }).then(()=>window.d200xActionStatus?.('오디오 재생 시작'),
      error=>window.d200xActionStatus?.('오디오 재생 실패: '+String(error?.message||error)));
    return '오디오 재생 요청 · 페이드/출력 장치 지정은 미구현';
  }
  if(outcome.kind==='type-text'){
    if(!window.deckBridge?.typeText)return 'Windows 실행 환경에서만 사용할 수 있습니다.';
    window.deckBridge.typeText(outcome.text,outcome.enter).then(
      ()=>window.d200xActionStatus?.('텍스트 입력 완료 (클립보드 변경 없음)'),
      error=>window.d200xActionStatus?.('텍스트 입력 실패: '+String(error?.message||error)));
    return '유니코드 직접 입력 요청 · 클립보드 모드도 현재는 직접 입력으로 처리';
  }
  if(outcome.kind==='timer'){
    const scope=index>=14&&state.controls.scopes[index-14]==='global'?'global':String(state.page);
    const key=scope+':'+index;
    if(activeActionTimers.has(key)){
      clearTimeout(activeActionTimers.get(key));activeActionTimers.delete(key);
      return '타이머 중지';
    }
    const seconds=outcome.seconds;
    const handle=setTimeout(()=>{
      activeActionTimers.delete(key);
      window.d200xActionStatus?.('타이머 '+seconds+'초 완료 · 소리 알림은 아직 미구현');
    },seconds*1000);
    activeActionTimers.set(key,handle);
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
    window.deckBridge.openLocalPath(outcome.path,outcome.target).then(
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
    if(outcome.page===state.page)return '페이지 '+(state.page+1)+' · 이동 없음';
    state.page=outcome.page;state.selected=null;
    lastHardwareDown.clear();persist();render();return '페이지 '+(outcome.page+1)+' 표시';
  }
  if(outcome.kind==='website'){
    if(!window.deckBridge?.openWebsite)return '웹사이트 열기는 Windows EXE에서만 실행됩니다.';
    window.deckBridge.openWebsite(outcome.url,outcome.mode).then(
      ()=>window.d200xActionStatus?.('웹사이트 열기 완료'),
      error=>window.d200xActionStatus?.('웹사이트 열기 실패: '+String(error?.message||error))
    );
    return '웹사이트 열기 요청';
  }
  return outcome.message;
}
window.executeD200XKey=executeHardwareAction;
function render(){renderGrid();renderInspector();}

/* Reference UI controls: library appearance is modeled after the supplied 7.6.1
 * screenshots. Icons below are clearly a small placeholder catalogue, not the
 * complete Elgato library. No legacy renderer code is imported. */
const ICON_SETS=[
  ["Elgato Legacy Icons",["▶","◉","▣","♫","♩","▤","♢","⌨","◴","☼","☾","□","▢","◇","⊞","⏻","◀","▷","⚑","☷","↗","♜","✦","◎","⇄","◈","⚙","⌘"]],
  ["Elgato Logo Icons (Color)",["✦","◈","●","▶","◉","▣","◇","■"]],
  ["Elgato Icons (Black)",["☼","☾","□","◉","▣","☷","◎","▤"]],
  ["Elgato Icons (White)",["☼","☾","□","◉","▣","☷","◎","▤"]],
  ["Elgato Logo Icons (Black)",["✦","◈","◇","◎","▶","●"]],
  ["Elgato Logo Icons (White)",["✦","◈","◇","◎","▶","●"]]
];
let libraryTarget=null;
function renderIconLibrary(){
  const root=$("icon-library-groups");root.replaceChildren();
  const search=$("icon-library-search").value.trim().toLocaleLowerCase();
  let count=0;
  ICON_SETS.forEach(([name,icons],setIndex)=>{
    const matches=icons.filter(glyph=>!search||name.toLocaleLowerCase().includes(search)||glyph.includes(search));
    if(!matches.length)return;
    const title=document.createElement("button");title.type="button";title.className="icon-group-title";
    const arrow=document.createElement("span");arrow.className="icon-group-arrow";arrow.textContent="▸";
    const nameEl=document.createElement("span");nameEl.textContent=name;
    const number=document.createElement("span");number.className="icon-group-count";number.textContent="("+matches.length+"개 미리보기)";
    title.append(arrow,nameEl,number);
    const grid=document.createElement("div");grid.className="icon-grid";grid.hidden=true;
    title.addEventListener("click",()=>{grid.hidden=!grid.hidden;arrow.textContent=grid.hidden?"▸":"⌄";});
    if(setIndex===0){grid.hidden=false;arrow.textContent="⌄";}
    matches.forEach(glyph=>{
      count++;
      const tile=document.createElement("button");tile.type="button";
      tile.className="icon-swatch"+(setIndex===1||setIndex===0&&["◴","▶","☼","◉"].includes(glyph)?" blue":"");
      tile.textContent=glyph;tile.title="아이콘 선택: "+glyph;
      tile.addEventListener("click",()=>{
        if(libraryTarget&&currentPage().includes(libraryTarget)){
          libraryTarget.icon={kind:"glyph",glyph};persist();render();
        }
        closeIconLibrary();
      });
      grid.append(tile);
    });
    root.append(title,grid);
  });
  $("icon-library-count").textContent="임시 아이콘 샘플 "+count+"개 (정식 라이브러리 미연결)";
}
function openIconLibrary(item){
  libraryTarget=item;
  $("icon-library-search").value="";
  renderIconLibrary();
  $("icon-library").hidden=false;
  $("icon-library-search").focus();
}
function closeIconLibrary(){
  $("icon-library").hidden=true;libraryTarget=null;
}
let fileIconTarget=null;
let makerTarget=null;

function applyIconData(target,uri){
  if(!target||!uri||!state.pages.some(page=>page.includes(target)))return;
  target.icon={kind:"file",value:uri};
  persist();render();
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
      else if(cmd==="file"){fileIconTarget=item;$("custom-icon-file").click();}
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
function bindSidebarHeader(){
  const trigger=$("profile-trigger"),menu=$("profile-menu");
  const renderProfiles=()=>{
    menu.replaceChildren();
    const option=document.createElement("button");option.type="button";
    option.textContent="✓ 기본 프로필";
    option.setAttribute("aria-current","true");
    option.addEventListener("click",()=>{menu.hidden=true;trigger.setAttribute("aria-expanded","false");});
    menu.append(option);
    const hint=document.createElement("div");hint.className="hint";hint.style.padding="8px 11px";
    hint.textContent="다중 프로필 관리는 아직 연결되지 않았습니다.";
    menu.append(hint);
  };
  renderProfiles();
  trigger.addEventListener("click",()=>{
    menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden));
  });
  document.addEventListener("pointerdown",event=>{
    if(!menu.contains(event.target)&&!trigger.contains(event.target)){
      menu.hidden=true;trigger.setAttribute("aria-expanded","false");
    }
  });
  $("settings-trigger").addEventListener("click",()=>alert("설정 화면은 아직 연결되지 않았습니다."));
}
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
bindSidebarHeader();

renderLibrary();render();
