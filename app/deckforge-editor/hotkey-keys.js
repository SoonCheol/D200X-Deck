'use strict';
// One catalog for editor capture/selection and the native Windows sender.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DeckHotkeys=api;
})(typeof window!=='undefined'?window:this,()=>{
  const mods=Object.freeze({Ctrl:0x11,Alt:0x12,Shift:0x10,Win:0x5B});
  const order=Object.keys(mods);
  const modAlias={control:'Ctrl',ctrl:'Ctrl',alt:'Alt',shift:'Shift',win:'Win',meta:'Win',os:'Win'};
  const keys=new Map(),aliases=new Map(),codes=new Map();
  const groups=[{label:'특수 키',keys:[]},{label:'기능 키',keys:[]},{label:'문자·숫자·기호',keys:[]}];
  function add(group,id,label,vk,options={}){
    const key=Object.freeze({id,label,vk,extended:!!options.extended,scan:options.scan||0,category:options.category||''});
    keys.set(id,key);groups[group].keys.push(key);
    for(const alias of [id,...(options.aliases||[])])aliases.set(alias.toLowerCase(),id);
    for(const code of options.codes||[])codes.set(code,id);
  }
  add(0,'PrintScreen','PrtSc',0x2C,{extended:true,scan:0x45,aliases:['PrtSc','PrtScr'],codes:['PrintScreen']});
  for(const [id,label,vk,extended,extra] of [
    ['PageUp','PgUp',0x21,true,['PgUp']],['PageDown','PgDn',0x22,true,['PgDn']],
    ['Home','Home',0x24,true,[]],['End','End',0x23,true,[]],
    ['Insert','Insert',0x2D,true,[]],['Delete','Delete',0x2E,true,['Del']],
    ['Left','←',0x25,true,['ArrowLeft']],['Up','↑',0x26,true,['ArrowUp']],
    ['Right','→',0x27,true,['ArrowRight']],['Down','↓',0x28,true,['ArrowDown']],
    ['Enter','Enter',0x0D,false,[]],['Space','Space',0x20,false,['Spacebar']],
    ['Tab','Tab',0x09,false,[]],['Escape','Esc',0x1B,false,['Esc']],
    ['Backspace','Backspace',0x08,false,[]],['Pause','Pause',0x13,false,[]],
    ['ScrollLock','Scroll Lock',0x91,false,[]],['CapsLock','Caps Lock',0x14,false,[]],
    ['NumLock','Num Lock',0x90,true,[]],['ContextMenu','Menu',0x5D,true,['Apps','Menu']]
  ])add(0,id,label,vk,{extended,aliases:extra,codes:[id,...extra.filter(a=>a.startsWith('Arrow'))]});
  for(let i=0;i<10;i++)add(0,'Numpad'+i,'Num '+i,0x60+i,{category:'숫자 키패드',codes:['Numpad'+i],aliases:['Num '+i]});
  for(const [id,label,vk,extended,scan] of [
    ['NumpadAdd','Num +',0x6B,false,0],['NumpadSubtract','Num -',0x6D,false,0],
    ['NumpadMultiply','Num *',0x6A,false,0],['NumpadDivide','Num /',0x6F,true,0],
    ['NumpadDecimal','Num .',0x6E,false,0],['NumpadEnter','Num Enter',0x0D,true,0x1C]
  ])add(0,id,label,vk,{extended,scan,category:'숫자 키패드',codes:[id]});
  for(let i=1;i<=24;i++)add(1,'F'+i,'F'+i,0x6F+i,{codes:['F'+i]});
  for(const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')add(2,ch,ch,ch.charCodeAt(0),{category:'영문',codes:['Key'+ch]});
  for(const ch of '0123456789')add(2,ch,ch,ch.charCodeAt(0),{category:'숫자',codes:['Digit'+ch]});
  // Preserve historical Plus/Minus and BracketLeft/Right tokens and virtual keys.
  for(const [id,label,vk,code,extra] of [
    ['Minus','-',0xBD,'Minus',['-']],['Plus','=',0xBB,'Equal',['Equal','=']],
    ['BracketLeft','[',0xDB,'BracketLeft',['[']],['BracketRight',']',0xDD,'BracketRight',[']']],
    ['Backslash','\\',0xDC,'Backslash',['\\']],['Semicolon',';',0xBA,'Semicolon',[';']],
    ['Quote',"'",0xDE,'Quote',["'"]],['Comma',',',0xBC,'Comma',[',']],
    ['Period','.',0xBE,'Period',['.']],['Slash','/',0xBF,'Slash',['/']],
    ['Backquote','\x60',0xC0,'Backquote',['\x60']]
  ])add(2,id,label,vk,{category:'기호',codes:[code],aliases:extra});
  function parse(value){
    if(typeof value!=='string'||value.length>60)return null;
    const parts=value.split('+').map(x=>x.trim()).filter(Boolean);
    if(!parts.length||parts.length>5)return null;
    const held=[],seen=new Set();let key=null;
    for(const part of parts){
      const mod=Object.hasOwn(modAlias,part.toLowerCase())?modAlias[part.toLowerCase()]:null;
      if(mod){if(seen.has(mod))return null;seen.add(mod);held.push(mod);continue;}
      const id=aliases.get(part.toLowerCase());
      if(key||!id)return null;key=keys.get(id);
    }
    return key?{mods:held,key}:null;
  }
  function format(selected,key){
    return [...order.filter(m=>selected.includes(m)),key||''].filter(Boolean).join('+');
  }
  function canonical(value){const found=parse(value);return found?format(found.mods,found.key.id):'';}
  function display(value){
    const p=parse(value);
    return p?[...order.filter(m=>p.mods.includes(m)),p.key.label].join(' + '):String(value||'');
  }
  function capture(event){
    const id=codes.get(event.code)||aliases.get(String(event.key===' '?'Space':event.key||'').toLowerCase());
    if(!id)return '';
    return format([event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',event.metaKey?'Win':''],id);
  }
  function resolve(value){
    const p=parse(value);
    return p?{held:p.mods.map(m=>mods[m]),key:p.key.vk,extended:p.key.extended,scan:p.key.scan}:null;
  }
  function matchPreset(value,presets){
    const normalized=canonical(value);
    return normalized?Object.keys(presets).find(id=>canonical(presets[id])===normalized)||'':'';
  }
  // Advisory only: OS-level shortcuts, not foreground-app conventions.
  const notices=new Map();
  const note=(combo,msg)=>notices.set(canonical(combo),msg);
  for(const [key,label] of Object.entries({
    A:'빠른 설정',B:'시스템 트레이',D:'바탕화면 표시',E:'파일 탐색기',
    G:'게임 바',H:'음성 입력',I:'Windows 설정',K:'무선 디스플레이 연결',
    L:'화면 잠금 (Windows 보호 조합)',M:'모든 창 최소화',N:'알림 센터 및 달력',
    P:'디스플레이 출력 선택',R:'실행 창',S:'검색',T:'작업 표시줄 앱 순환',
    U:'접근성 설정',V:'클립보드 기록',W:'위젯',X:'빠른 링크 메뉴',
    Z:'스냅 레이아웃',Period:'이모지 및 특수문자',Tab:'작업 보기',
    Pause:'시스템 정보',PrintScreen:'전체 화면 캡처 후 저장',
    Up:'창 최대화',Down:'창 복원·최소화',Left:'창 왼쪽 배치',Right:'창 오른쪽 배치'
  }))note('Win+'+key,'Windows 전역 단축키 · '+label);
  for(const d of '1234567890')note('Win+'+d,'Windows 전역 단축키 · 작업 표시줄 앱');
  for(const [combo,label] of Object.entries({
    'Alt+Tab':'창 전환','Alt+Shift+Tab':'역순 창 전환',
    'Ctrl+Alt+Tab':'창 전환 목록','Ctrl+Shift+Escape':'작업 관리자',
    'Ctrl+Alt+Delete':'보안 화면 · 일반 키 전송으로는 실행되지 않음',
    'Win+Shift+S':'화면 영역 캡처','Win+Shift+Left':'왼쪽 모니터로 이동',
    'Win+Shift+Right':'오른쪽 모니터로 이동','Win+Ctrl+D':'가상 데스크톱 추가',
    'Win+Ctrl+F4':'가상 데스크톱 닫기','Win+Ctrl+Left':'이전 가상 데스크톱',
    'Win+Ctrl+Right':'다음 가상 데스크톱','Win+Shift+M':'최소화된 창 복원',
    'Win+Ctrl+Shift+B':'그래픽 드라이버 재설정','Win+Space':'입력 언어 전환',
    'Alt+PrintScreen':'활성 창 캡처','PrintScreen':'화면 캡처 (Windows 설정에 따름)'
  }))note(combo,'Windows 전역 단축키 · '+label);
  function advisory(value,presets){return matchPreset(value,presets||{})?'':notices.get(canonical(value))||'';}
  return Object.freeze({order,groups,parse,format,canonical,display,capture,resolve,matchPreset,advisory});
});
