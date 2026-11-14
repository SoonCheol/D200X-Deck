"use strict";
// Right-hand action catalogue only. Never changes D200X key artwork or profiles.
window.D200XPanelIcons=(()=>{
  const KEY="d200x-action-panel-appearance-v1";
  const groups=[
    ["Windows 시스템",["system-volume","system-mute","window-switch","window-state","window-monitor","desktop-switch","screenshot","explorer-open"]],
    ["키보드·마우스",["hotkey","hotkey-switch","system-scroll","clipboard-edit","edit-history","system-zoom","text"]],
    ["프로그램별 작업",["brush-size","timeline-step","timeline-zoom"]],
    ["파일·프로그램 실행",["website","open","open-app","close","file-open","folder-shortcut"]],
    ["D200X 장치·화면",["brightness","sleep","virtual","device-brightness","folder","profile","previous","next","goto","indicator"]],
    ["자동화·다중 동작",["multi","multi-switch","random","logic","timer"]],
    ["미디어·사운드",["audio-play","audio-stop","media"]]
  ];
  // Compact, self-contained 24px stroke SVGs (no remote assets or emoji fonts).
  const paths={
    "system-volume":'<polygon points="3 9 7 9 12 5 12 19 7 15 3 15"/><path d="M16 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/>',
    "system-mute":'<polygon points="3 9 7 9 12 5 12 19 7 15 3 15"/><path d="m16 9 6 6m0-6-6 6"/>',
    "window-switch":'<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11M7 11h6m-3-3 3 3-3 3"/>',
    "window-state":'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-8 5h5m-2-2 2 2-2 2"/>',
    "window-monitor":'<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M12 18v3m-5 0h10m-11-10h12m-3-3 3 3-3 3"/>',
    "desktop-switch":'<rect x="2" y="5" width="9" height="12" rx="1"/><rect x="13" y="5" width="9" height="12" rx="1"/><path d="M6 20h12m-4-9 3-3 3 3"/>',
    "screenshot":'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    "explorer-open":'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 11h18"/>',
    "hotkey":'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/>',
    "hotkey-switch":'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h7m-3-3 3 3-3 3m8 1h-7m3-3-3 3 3 3"/>',
    "system-scroll":'<rect x="8" y="2" width="8" height="20" rx="4"/><path d="M12 6v4m-5 2-3-3m3 3-3 3m13-3 3-3m-3 3 3 3"/>',
    "clipboard-edit":'<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 12h6m-6 4h6"/>',
    "edit-history":'<path d="M8 7 3 12l5 5M3 12h11a6 6 0 0 1 0 12" transform="translate(0 -3)"/><path d="M15 7a6 6 0 0 1 4 5"/>',
    "system-zoom":'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
    "text":'<path d="M4 5h16M12 5v15M8 20h8M4 5v3m16-3v3"/>',
    "brush-size":'<path d="m14 4 6 6-9 9a4 4 0 0 1-6-6Z"/><path d="m12 6 6 6M4 19c0 2 2 3 4 3"/>',
    "timeline-step":'<path d="M3 5v14m5-11 8 4-8 4V8Zm11-3v14"/><path d="M3 21h16"/>',
    "timeline-zoom":'<path d="M3 5v14m5-14v14m5-14v14m5-14v14"/><path d="M2 12h20m-3-3v6"/>',
    "website":'<circle cx="12" cy="12" r="9"/><path d="M3 12h18m-9-9a17 17 0 0 1 0 18m0-18a17 17 0 0 0 0 18"/>',
    "open":'<path d="M4 5h9l3 3v12H4Z"/><path d="M13 5v4h4m-8 6h9m-3-3 3 3-3 3"/>',
    "open-app":'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12m4-7 3 2-3 2z"/>',
    "close":'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-6 4 4 4m0-4-4 4"/>',
    "file-open":'<path d="M6 2h8l5 5v15H6Z"/><path d="M14 2v6h5m-9 7h8m-3-3 3 3-3 3"/>',
    "folder-shortcut":'<path d="M3 7h7l2 2h9v10H3Z"/><path d="m12 13 4 0m-2-2 2 2-2 2"/>',
    "brightness":'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
    "sleep":'<path d="M20 14a8 8 0 1 1-10-10 9 9 0 0 0 10 10Z"/><path d="m16 4 2 0-2 3h2"/>',
    "virtual":'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4M7 10h10m-3-3 3 3-3 3"/>',
    "device-brightness":'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M12 6v2m0 8v2M6 12h2m8 0h2"/>',
    "folder":'<path d="M3 6h7l2 3h9v11H3Z"/><path d="M12 12v6m-3-3h6"/>',
    "profile":'<circle cx="10" cy="8" r="4"/><path d="M3 20v-2a7 7 0 0 1 14 0v2m1-11 3 3-3 3"/>',
    "previous":'<path d="m14 5-7 7 7 7M7 12h14"/>',
    "next":'<path d="m10 5 7 7-7 7M17 12H3"/>',
    "goto":'<path d="M4 17V6h11m-3-3 3 3-3 3m2 4 4 4-4 4"/>',
    "indicator":'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h4"/>',
    "multi":'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10m-10 4h10m-10 4h6M5 9h1"/>',
    "multi-switch":'<path d="M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4"/>',
    "random":'<path d="M3 5h4l10 14h4m-4-4 4 4-4 3M3 19h4L17 5h4m-4-3 4 3-4 3"/>',
    "logic":'<path d="M4 4h16v6H4Zm4 10h8v6H8Z"/><path d="M12 10v4M6 7h3m6 0h3"/>',
    "timer":'<circle cx="12" cy="13" r="8"/><path d="M12 13V8m0 5 4 2M9 2h6M12 2v3"/>',
    "audio-play":'<circle cx="12" cy="12" r="9"/><path d="m9 7 8 5-8 5Z"/>',
    "audio-stop":'<circle cx="12" cy="12" r="9"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    "media":'<path d="M9 18V5l11-2v13M9 9l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
  };
  const themeNames={line:"라인형",color:"컬러형",button:"버튼형"};
  const accents=["#60a5fa","#c4b5fd","#fbbf24","#34d399","#22d3ee","#fb7185","#f472b6"];
  function read(){
    try{
      const data=JSON.parse(localStorage.getItem(KEY)||"{}");
      return {theme:themeNames[data.theme]?data.theme:"line",overrides:data.overrides&&typeof data.overrides==="object"&&!Array.isArray(data.overrides)?data.overrides:{}};
    }catch{return {theme:"line",overrides:{}};}
  }
  let config=read();
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(config));return true;}
    catch(error){console.error("액션 목록 아이콘 설정 저장 실패",error);window.d200xActionStatus?.("아이콘 설정 저장 실패");return false;}
  }
  function create(id){
    const override=config.overrides[id];
    const img=document.createElement("span");img.className="panel-action-svg theme-"+config.theme;
    img.style.setProperty("--icon-accent",accents[Math.max(0,groups.findIndex(([,ids])=>ids.includes(id)))]);
    if(typeof override==="string"&&override.startsWith("data:image/")&&override.length<200000){
      const image=document.createElement("img");image.src=override;image.alt="";img.append(image);
    }else{
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 24 24");
      svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
      svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
      // Static bundled SVG path markup; no user-provided HTML is inserted.
      svg.innerHTML=paths[id]||'<circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/>';
      img.append(svg);
    }
    return img;
  }
  function setTheme(value){if(!themeNames[value])return;config.theme=value;save();}
  function setOverride(id,data){if(!paths[id]||typeof data!=="string"||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(data)||data.length>200000)return false;config.overrides[id]=data;return save();}
  function clearOverride(id){delete config.overrides[id];return save();}
  function clearAll(){config.overrides={};return save();}
  return {groups,themeNames,create,setTheme,setOverride,clearOverride,clearAll,get theme(){return config.theme;},hasOverride:id=>!!config.overrides[id],ids:Object.keys(paths)};
})();
