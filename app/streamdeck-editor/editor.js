"use strict";
/* Independent Stream Deck 7.6.1-oriented UI. No legacy Ulanzi inspector imports.
 * This is a layout/interaction prototype; hardware dispatch is NOT connected. */
const CATALOG = [
  ["Soundboard", [["audio-play","오디오 재생","♫"],["audio-stop","오디오 정지","◼"]]],
  ["Stream Deck", [["timer","타이머","◴"],["brightness","밝기","☼"],["sleep","잠자기","☾"],["virtual","Virtual Stream Deck 토글","▣"]]],
  ["다중 동작", [["multi","다중 동작","▤"],["multi-switch","다중 동작 스위치","⇄"],["random","무작위 동작","⚄"],["logic","Key Logic","⇧"]]],
  ["시스템", [["website","웹사이트","◎"],["hotkey-switch","단축키 전환","⇄"],["hotkey","단축키","⌨"],["open","열기","▢"],["open-app","응용 프로그램 열기","▣"],["close","닫기","×"],["text","텍스트","¶"],["media","멀티미디어","♫"]]],
  ["탐색", [["folder","폴더 생성","▣"],["profile","프로필 전환","⇆"],["previous","이전 페이지","←"],["next","다음 페이지","→"],["goto","페이지로 이동","↗"],["indicator","페이지 표시기","①"]]]
];
const ACTIONS = new Map(CATALOG.flatMap(([category, entries]) => entries.map(([id,label,icon]) => [id,{category,id,label,icon}])));
const STORAGE_KEY="d200x-streamdeck-editor-prototype-v1";
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const blankPage = () => Array.from({length:14},()=>null);
let state={pages:[blankPage()],page:0,selected:null};
try {const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&Array.isArray(saved.pages)&&saved.pages.length) state=saved;} catch {}
const persist=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}};
const valueOf=(item,field,fallback="")=>item?.settings?.[field]??fallback;
function keyName(item){return item?.title||ACTIONS.get(item?.type)?.label||"";}
function newAction(id){
  const defaults={
    "audio-play":{file:"",mode:"play-stop",fade:"none",volume:50,output:"default"},
    timer:{seconds:30,sound:"connect"},brightness:{mode:"up"},website:{url:"",open:"default"},
    text:{body:"",enter:false,mode:"clipboard"},media:{op:"playpause"},
    "open-app":{app:"",hold:"close",foreground:true},close:{path:"",force:false},
    open:{path:""},hotkey:{keys:""}, "hotkey-switch":{first:"",second:""},
    goto:{page:0},profile:{profile:"next"}
  };
  return {type:id,title:id==="folder"?"폴더":"",settings:clone(defaults[id]||{}),children:[]};
}
function currentPage(){return state.pages[state.page];}
function setItem(index,item){currentPage()[index]=item;state.selected=index;persist();render();}
function choose(index){state.selected=index;persist();render();}
function renderGrid(){
  const grid=$("key-grid");grid.replaceChildren();
  currentPage().forEach((item,i)=>{
    const b=document.createElement("button");b.type="button";b.className="deck-key"+(i===13?" wide":"")+(state.selected===i?" selected":"");
    b.dataset.index=i;b.setAttribute("aria-label",`키 ${i+1}: ${keyName(item)||"비어 있음"}`);
    const glyph=document.createElement("span");glyph.className="glyph";glyph.textContent=ACTIONS.get(item?.type)?.icon||"+";
    const label=document.createElement("span");label.className="caption";label.textContent=keyName(item);
    b.append(glyph,label);b.addEventListener("click",()=>choose(i));
    b.addEventListener("contextmenu",ev=>{ev.preventDefault();choose(i);showMenu(i,ev.clientX,ev.clientY);});
    b.addEventListener("dragover",ev=>{ev.preventDefault();b.classList.add("drag-over");});
    b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
    b.addEventListener("drop",ev=>{ev.preventDefault();b.classList.remove("drag-over");const id=ev.dataTransfer.getData("application/x-d200x-action");if(ACTIONS.has(id))setItem(i,newAction(id));});
    grid.append(b);
  });
  $("page-label").textContent=`페이지 ${state.page+1} / ${state.pages.length}`;
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
      entry.addEventListener("click",()=>{if(state.selected!==null)setItem(state.selected,newAction(id));});
      body.append(entry);
    }
    section.append(title,body);root.append(section);
  }
}
function escapeHtml(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const input=(field,label,placeholder="")=>`<div class="field"><label for="s-${field}">${label}</label><input id="s-${field}" data-field="${field}" value="${escapeHtml(valueOf(active,field))}" placeholder="${placeholder}"></div>`;
const select=(field,label,opts)=>`<div class="field"><label for="s-${field}">${label}</label><select id="s-${field}" data-field="${field}">${opts.map(([v,n])=>`<option value="${escapeHtml(v)}" ${valueOf(active,field)===v?"selected":""}>${escapeHtml(n)}</option>`).join("")}</select></div>`;
const check=(field,label)=>`<div class="field"><label for="s-${field}">${label}</label><input id="s-${field}" type="checkbox" data-field="${field}" ${valueOf(active,field)?"checked":""}></div>`;
let active=null;
function actionFields(item){
  active=item;
  switch(item.type){
    case "audio-play":return input("file","파일")+select("mode","동작",[["play-stop","재생 / 정지"],["overlap","재생 / 오버랩"],["restart","재생 / 재시작"],["loop-stop","반복 / 정지"]])+select("fade","페이드",[["none","페이드 없음"],["in","페이드 인"],["out","페이드 아웃"],["in-out","페이드 인 앤 아웃"]])+`<div class="field"><label for="s-volume">음량</label><div class="compound"><input id="s-volume" type="range" min="0" max="100" data-field="volume" value="${valueOf(item,"volume",50)}"><output id="volume-display">${valueOf(item,"volume",50)}</output></div></div>`+select("output","출력",[["default","기본"]])+`<div class="field"><span></span><span class="hint">출력 장치 전체 목록·실제 재생 엔진은 아직 미연결</span></div>`;
    case "audio-stop": case "previous": case "next": case "indicator":return "";
    case "timer":return `<div class="field"><label for="s-seconds">지속</label><div class="compound"><input type="number" min="1" id="s-seconds" data-field="seconds" value="${valueOf(item,"seconds",30)}"><span>초</span></div></div>`+select("sound","사운드",[["none","없음"],["connect","접속"],["disconnect","접속 끊김"],["release","접속 해제"],["find","찾기"],["other","기타"]]);
    case "brightness":return select("mode","동작",[["up","밝게"],["down","어둡게"],["max","최대"],["high","높음"],["medium","중간"],["low","낮음"],["min","최소"]]);
    case "sleep":return `<div class="field"><label>잠자기 설정</label><span class="hint">환경설정 열기… (기기 설정 연동 예정)</span></div>`;
    case "virtual":return `<div class="field"><label>기기</label><span class="hint">구성된 Virtual Stream Decks 없음</span></div>`;
    case "website":return input("url","URL","https://")+select("open","다음으로 열기",[["default","기본 브라우저"],["get","백그라운드에서 GET 요청"],["choose","브라우저 직접 선택"]]);
    case "open":return input("path","앱 / 파일");
    case "open-app":return input("app","앱")+select("hold","길게 누르기",[["none","아무것도 하지 않음"],["close","응용 프로그램 종료"],["force","응용 프로그램 강제 종료"]])+check("foreground","이미 실행 중이면 맨 앞으로");
    case "close":return input("path","앱 / 파일")+check("force","강제 종료");
    case "hotkey":return input("keys","단축키","클릭하여 할당");
    case "hotkey-switch":return input("first","단축키 1")+input("second","단축키 2");
    case "text":return `<div class="field"><label for="s-body">텍스트</label><textarea id="s-body" data-field="body">${escapeHtml(valueOf(item,"body"))}</textarea></div>`+check("enter","메시지 뒤 Enter")+select("mode","텍스트 모드",[["clipboard","클립보드에서 붙여넣기"],["typing","타이핑 시뮬레이션"]]);
    case "media":return select("op","동작",[["previous","이전 트랙"],["playpause","재생 / 일시정지"],["next","다음 트랙"],["stop","정지"],["mute","음소거"],["up","음량 키우기"],["down","음량 줄이기"]]);
    case "folder":case "multi":case "random":return `<div class="field"><label>내용</label><div>${item.children.length}개의 ${item.type==="folder"?"항목":"동작"} <span class="hint">· 내부 편집 기능 미구현</span></div></div>`;
    case "multi-switch":return `<div class="field"><label>상태</label><span>1 / 2 · 내부 편집 기능 미구현</span></div>`;
    case "logic":return `<div class="field"><label>슬롯</label><span>한 번 누르기 / 두 번 누르기 / 유지 · 내부 편집 기능 미구현</span></div>`;
    case "profile":return select("profile","프로필",[["next","다음 프로필"]]);
    case "goto":return select("page","대상",state.pages.map((_,i)=>[String(i),String(i+1)]));
    default:return "";
  }
}
function renderInspector(){
  const root=$("inspector");root.replaceChildren();const item=state.selected===null?null:currentPage()[state.selected];
  if(!item){root.className="inspector empty";root.textContent=state.selected===null?"버튼을 선택하세요":"액션을 끌어 이 키에 놓으세요";return;}
  root.className="inspector";const action=ACTIONS.get(item.type);const fields=actionFields(item);
  root.innerHTML=`<div class="action-head"><strong>${escapeHtml(action?.category)}: ${escapeHtml(action?.label)}</strong><button id="delete-action" title="액션 삭제" type="button">×</button></div>
    <div class="properties"><div class="preview"><div class="preview-key">${escapeHtml(action?.icon)}</div><button type="button" id="icon-button" disabled title="아이콘 변경 미구현">아이콘 변경 ▾</button></div>
    <div class="fields"><div class="field"><label for="key-title">제목</label><input id="key-title" value="${escapeHtml(item.title)}"></div>
    <div class="field"><label>제목 스타일</label><span class="hint">원본 상세 메뉴와 연결 예정</span></div>${fields}</div></div>`;
  $("delete-action").addEventListener("click",()=>setItem(state.selected,null));
  $("key-title").addEventListener("input",ev=>{item.title=ev.target.value;persist();renderGrid();});
  root.querySelectorAll("[data-field]").forEach(node=>{
    node.addEventListener(node.type==="range"?"input":"change",()=>{
      let value=node.type==="checkbox"?node.checked:node.type==="number"||node.type==="range"?Number(node.value):node.value;
      item.settings[node.dataset.field]=value;persist();
      if(node.dataset.field==="volume") $("volume-display").textContent=String(value);
    });
  });
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
$("add-page").addEventListener("click",()=>{state.pages.push(blankPage());state.page=state.pages.length-1;state.selected=null;persist();render();});
$("back-page").addEventListener("click",()=>{state.page=Math.max(0,state.page-1);state.selected=null;persist();render();});
$("next-page").addEventListener("click",()=>{state.page=Math.min(state.pages.length-1,state.page+1);state.selected=null;persist();render();});
function render(){renderGrid();renderInspector();}
renderLibrary();render();
