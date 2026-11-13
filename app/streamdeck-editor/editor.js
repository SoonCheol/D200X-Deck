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
const KEY_COUNT = 14;
const CONTROLS = [{name:"첫 페이지",kind:"side"},{name:"뒤로 가기",kind:"side"},{name:"노브 1",kind:"knob"},{name:"노브 2",kind:"knob"},{name:"노브 3",kind:"knob"}];
const blankPage = () => Array.from({length:KEY_COUNT+CONTROLS.length},()=>null);
let state={pages:[blankPage()],page:0,selected:null};
try {const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&Array.isArray(saved.pages)&&saved.pages.length) state=saved;} catch {}
const persist=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}};
// Migration: preserve the existing 14 key assignments and extend with 5 physical controls.
state.pages.forEach(page=>{while(page.length<KEY_COUNT+CONTROLS.length)page.push(null);});
const valueOf=(item,field,fallback="")=>item?.settings?.[field]??fallback;
function keyName(item){return item?.title||ACTIONS.get(item?.type)?.label||"";}
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
  label.style.textAlign=style.align||"left";
  label.style.fontFamily=style.family==="default"?"":style.family;
  label.style.fontSize=(Number(style.size)||12)+"px";
  label.style.fontWeight=style.bold?"700":"400";
  label.style.fontStyle=style.italic?"italic":"normal";
  label.style.textDecoration=style.underline?"underline":"none";
  label.style.color=style.color||"#ffffff";
}
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
  currentPage().slice(0,KEY_COUNT).forEach((item,i)=>{
    const b=document.createElement("button");b.type="button";b.className="deck-key"+(i===13?" wide":"")+(state.selected===i?" selected":"");
    b.dataset.index=i;b.setAttribute("aria-label",`키 ${i+1}: ${keyName(item)||"비어 있음"}`);
    const glyph=iconNode(item,ACTIONS.get(item?.type)?.icon||"+");glyph.classList.add("glyph");
    const label=document.createElement("span");label.className="caption";label.textContent=keyName(item);updateTitleAppearance(label,item);
    b.append(glyph,label);b.addEventListener("click",()=>choose(i));
    b.addEventListener("contextmenu",ev=>{ev.preventDefault();choose(i);showMenu(i,ev.clientX,ev.clientY);});
    b.addEventListener("dragover",ev=>{ev.preventDefault();b.classList.add("drag-over");});
    b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
    b.addEventListener("drop",ev=>{ev.preventDefault();b.classList.remove("drag-over");const id=ev.dataTransfer.getData("application/x-d200x-action");if(ACTIONS.has(id))setItem(i,newAction(id));});
    grid.append(b);
  });
  renderPhysicalControls();
  $("page-label").textContent=`페이지 ${state.page+1} / ${state.pages.length}`;
}
function renderPhysicalControls(){
  const root=$("physical-controls");
  root.replaceChildren();
  CONTROLS.forEach(({name,kind},offset)=>{
    const index=KEY_COUNT+offset, item=currentPage()[index];
    const button=document.createElement("button");button.type="button";
    button.className="physical-control "+kind+(state.selected===index?" selected":"");
    button.setAttribute("aria-label",name+" — "+(keyName(item)||"비어 있음"));
    button.title=name+" — 액션을 드래그해 등록";
    const symbol=document.createElement("span");symbol.className="physical-symbol";
    const label=document.createElement("span");label.className="physical-name";label.textContent=item?keyName(item):name;
    button.append(symbol,label);
    button.addEventListener("click",()=>choose(index));
    button.addEventListener("contextmenu",event=>{event.preventDefault();choose(index);showMenu(index,event.clientX,event.clientY);});
    button.addEventListener("dragover",event=>{event.preventDefault();button.classList.add("drag-over");});
    button.addEventListener("dragleave",()=>button.classList.remove("drag-over"));
    button.addEventListener("drop",event=>{
      event.preventDefault();button.classList.remove("drag-over");
      const id=event.dataTransfer.getData("application/x-d200x-action");
      if(ACTIONS.has(id))setItem(index,newAction(id));
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
const DEFAULT_TITLE_STYLE = {visible:true,align:"left",family:"default",size:12,bold:false,italic:false,underline:false,color:"#ffffff"};
function bindTitleStyle(item){
  const style=item.titleStyle={...DEFAULT_TITLE_STYLE,...item.titleStyle};
  const menu=$("title-style-popover"),toggle=$("title-style-trigger");
  toggle.addEventListener("click",()=>{
    menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));
  });
  const save=(field,value)=>{style[field]=value;persist();renderGrid();};
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
  const color=$("title-color");color.value=style.color;
  color.addEventListener("input",()=>save("color",color.value));
  $("title-reset").addEventListener("click",()=>{item.titleStyle={...DEFAULT_TITLE_STYLE};persist();renderInspector();});
  document.addEventListener("pointerdown",event=>{
    if(!menu.isConnected)return;
    if(!menu.contains(event.target)&&!toggle.contains(event.target)){
      menu.hidden=true;toggle.setAttribute("aria-expanded","false");
    }
  },{signal:inspectorListener.signal});
}
let inspectorListener=new AbortController();
function renderInspector(){
  inspectorListener.abort();inspectorListener=new AbortController();
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
          <button type="button" data-align="left" title="왼쪽 정렬">▤</button>
          <button type="button" data-align="center" title="가운데 정렬">≡</button>
          <button type="button" data-align="right" title="오른쪽 정렬">▥</button>
        </div>
        <select id="title-family" aria-label="글꼴"><option value="default">기본</option><option value="Malgun Gothic">맑은 고딕</option><option value="Segoe UI">Segoe UI</option></select>
        <div class="title-format"><input id="title-size" type="number" min="8" max="48" aria-label="글꼴 크기">
        <button type="button" data-style="bold" aria-label="굵게">B</button><button type="button" data-style="italic" aria-label="기울임">I</button><button type="button" data-style="underline" aria-label="밑줄">U</button>
        <input id="title-color" type="color" aria-label="글꼴 색상"></div>
        <button type="button" class="style-reset" id="title-reset" title="기본 스타일 복원">↺</button>
      </div></div></div>${fields}</div></div>`;
  bindTitleStyle(item);
  bindIconControls(item);
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
function setIconFile(file){
  if(!file)return;
  if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)||file.size>3*1024*1024){
    alert("3MB 이하의 PNG/JPG/WebP/GIF/SVG 파일을 선택해 주세요.");return;
  }
  const target=currentPage()[state.selected];if(!target)return;
  const reader=new FileReader();
  reader.onload=()=>{
    if(currentPage().includes(target)){target.icon={kind:"file",value:reader.result};persist();render();}
  };
  reader.readAsDataURL(file);
}
async function pasteIcon(){
  try{
    if(!navigator.clipboard?.read)throw new Error("클립보드 이미지 API를 사용할 수 없습니다.");
    for(const entry of await navigator.clipboard.read()){
      const format=entry.types.find(type=>type.startsWith("image/"));
      if(format){
        const blob=await entry.getType(format);
        setIconFile(blob);return;
      }
    }
    alert("클립보드에서 이미지가 발견되지 않았습니다.");
  }catch{
    alert("클립보드 이미지 접근이 허용되지 않았습니다. 파일에서 설정을 사용하세요.");
  }
}
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
      else if(cmd==="file")$("custom-icon-file").click();
      else if(cmd==="paste")pasteIcon();
      else if(cmd==="new")alert("새로운 아이콘 편집기는 아직 구현되지 않았습니다.");
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
  setIconFile(event.target.files?.[0]);event.target.value="";
});
window.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!$("icon-library").hidden)closeIconLibrary();
});
bindSidebarHeader();

renderLibrary();render();
