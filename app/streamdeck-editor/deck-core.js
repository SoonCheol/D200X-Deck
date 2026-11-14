'use strict';
// Pure, UI/HID-independent action model. No action execution in this module.
// Defaults reflect 24-action Stream Deck 7.6.1 Korean observation report;
// audio-play values were observed on an existing key, not proven install defaults.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DeckCore=factory();
})(globalThis,function(){
  const ACTION_IDS=[
    'audio-play','audio-stop','timer','brightness','sleep','virtual',
    'multi','multi-switch','random','logic','website','hotkey-switch',
    'hotkey','open','open-app','close','text','media','folder',
    'profile','previous','next','goto','indicator'
  ];
  const DEFAULTS={
    'audio-play':{file:'',mode:'play-stop',fade:'none',volume:50,output:'default'},
    'audio-stop':{},timer:{seconds:30,sound:'connect'},
    brightness:{mode:'up'},sleep:{},virtual:{},
    multi:{},'multi-switch':{},random:{},logic:{},
    website:{url:'',open:'default'},'hotkey-switch':{first:'',second:''},
    hotkey:{keys:'',source:'preset'},open:{path:''},
    'open-app':{app:'',hold:'close',foreground:true},close:{path:'',force:false},
    text:{body:'',enter:false,mode:'clipboard'},media:{op:'playpause'},
    folder:{},profile:{profile:'next'},previous:{},next:{},
    goto:{page:0},indicator:{}
  };
  const TITLE={visible:true,align:'bottom',family:'default',size:12,
    bold:false,italic:false,underline:false,color:'#ffffff',
    outlineColor:'#000000',outlineWidth:'thin'};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const validId=id=>ACTION_IDS.includes(id);
  function createAction(id){
    if(!validId(id))throw new Error('Unsupported built-in action: '+String(id));
    return {type:id,title:id==='folder'?'폴더':'',
      settings:copy(DEFAULTS[id]),titleStyle:copy(TITLE),children:[]};
  }
  function cleanAction(value){
    if(!value||!validId(value.type))return null;
    const base=createAction(value.type);
    base.title=typeof value.title==='string'?value.title.slice(0,256):base.title;
    if(value.settings&&typeof value.settings==='object'&&!Array.isArray(value.settings))
      base.settings={...base.settings,...value.settings};
    if(value.titleStyle&&typeof value.titleStyle==='object'&&!Array.isArray(value.titleStyle))
      base.titleStyle={...base.titleStyle,...value.titleStyle};
    const st=base.titleStyle;
    st.visible=st.visible!==false;
    st.align=({left:'bottom',center:'middle',right:'top'}[st.align]) ||
      (['bottom','middle','top'].includes(st.align)?st.align:'bottom');
    st.family=['default','Malgun Gothic','Segoe UI'].includes(st.family)?st.family:'default';
    st.size=Math.max(8,Math.min(48,Number(st.size)||12));
    for(const key of ['bold','italic','underline'])st[key]=Boolean(st[key]);
    st.color=/^#[0-9a-fA-F]{6}$/.test(st.color)?st.color:'#ffffff';
    st.outlineColor=/^#[0-9a-fA-F]{6}$/.test(st.outlineColor)?st.outlineColor:'#000000';
    st.outlineWidth=['none','thin','medium','thick'].includes(st.outlineWidth)?st.outlineWidth:'thin';
    if(value.icon&&value.icon.kind==='glyph'&&typeof value.icon.glyph==='string')
      base.icon={kind:'glyph',glyph:value.icon.glyph.slice(0,8)};
    if(value.icon&&value.icon.kind==='file'&&typeof value.icon.value==='string'&&
      /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.icon.value)&&value.icon.value.length<1024*1024)
      base.icon={kind:'file',value:value.icon.value};
    // Preserve known child structure but do not execute untrusted or unknown actions.
    if(Array.isArray(value.children))base.children=value.children.slice(0,100)
      .map(child=>child&&typeof child==='object'?cleanAction(child):null).filter(Boolean);
    return base;
  }
  function blankPage(){return Array.from({length:19},()=>null);}
  function migrateState(value){
    const state={pages:[blankPage()],page:0,selected:null};
    if(!value||typeof value!=='object'||!Array.isArray(value.pages)||!value.pages.length)return state;
    state.pages=value.pages.slice(0,128).map(raw=>{
      const page=blankPage();
      if(Array.isArray(raw))for(let i=0;i<Math.min(19,raw.length);i++)
        page[i]=cleanAction(raw[i]);
      return page;
    });
    const index=Number(value.page);
    state.page=Number.isInteger(index)?Math.max(0,Math.min(state.pages.length-1,index)):0;
    state.selected=Number.isInteger(value.selected)&&value.selected>=0&&value.selected<19?value.selected:null;
    return state;
  }
  // Hardware indices: 0..13 screen keys; 15/16 physical buttons;
  // 17..19 rotary encoders. Editor stores them in slots 0..18.
  function physicalSlot(event){
    if (!event) return null;
    const index=Number(event.index);
    if(!Number.isInteger(index))return null;
    if(index>=17&&index<=19)return index-1;
    if(Number(event.kind)!==1)return null;
    if(index>=0&&index<=13)return index;
    if(index===15)return 14;
    if(index===16)return 15;
    return null;
  }
  function hardwareGesture(event){
    if(!event)return null;
    const index=Number(event.index);
    if(index>=17&&index<=19){
      // 'pressed' is true only for the knob's down event; left/right
      // rotations carry state 2/3 and should execute on every tick.
      return ({0:'up',1:'down',2:'left',3:'right'})[Number(event.state)]||null;
    }
    if(Number(event.kind)!==1)return null;
    return event.pressed===true?'down':event.pressed===false?'up':null;
  }
  function resolveHardwareEvent(state,event){
    if(!state||!Array.isArray(state.pages)||!Number.isInteger(state.page))return null;
    const index=physicalSlot(event),gesture=hardwareGesture(event);
    if(index===null||!gesture)return null;
    const action=state.pages[state.page]?.[index];
    return {index,gesture,action:action&&validId(action.type)?action:null,knob:index>=16};
  }
  function resolveKeyPress(state,event){
    const resolved=resolveHardwareEvent(state,event);
    return resolved?.gesture==='down'&&resolved.action?{index:resolved.index,action:resolved.action}:null;
  }
  function planHardwareEvent(state,event){
    const resolved=resolveHardwareEvent(state,event);
    if(!resolved||!resolved.action)return null;
    if(resolved.gesture==='up')return null;
    if(resolved.knob && (resolved.gesture==='left'||resolved.gesture==='right')){
      // A previous/next action on any knob enables bidirectional page
      // rotation: counterclockwise = previous, clockwise = next.
      if(!['previous','next'].includes(resolved.action.type))return null;
      const direction=resolved.gesture==='left'?-1:1;
      return {index:resolved.index,gesture:resolved.gesture,
        outcome:{kind:'page',page:Math.max(0,Math.min(state.pages.length-1,state.page+direction))}};
    }
    if(resolved.gesture!=='down')return null;
    return {index:resolved.index,gesture:resolved.gesture,
      outcome:planAction(resolved.action,state.page,state.pages.length)};
  }
  function deletePage(state){
    if(!state||!Array.isArray(state.pages)||state.pages.length<=1)return false;
    const removed=state.page;
    state.pages.splice(removed,1);
    state.page=Math.max(0,Math.min(removed,state.pages.length-1));
    state.selected=null;
    // Preserve other pages. A target beyond the new range remains invalid
    // until explicitly edited, rather than silently redirecting it.
    return true;
  }
  function planAction(action,page,count){
    if(!action||!validId(action.type))return {kind:'unsupported',message:'알 수 없는 동작'};
    if(action.type==='previous')return {kind:'page',page:Math.max(0,page-1)};
    if(action.type==='next')return {kind:'page',page:Math.min(count-1,page+1)};
    if(action.type==='goto'){
      const target=Number(action.settings?.page);
      if(!Number.isInteger(target)||target<0||target>=count)
        return {kind:'invalid',message:'대상 페이지가 존재하지 않습니다.'};
      return {kind:'page',page:target};
    }
    if(action.type==='website')return {kind:'website',
      url:action.settings?.url||'',mode:action.settings?.open||'default'};
    return {kind:'unsupported',message:'이 동작의 실행 기능은 아직 구현되지 않았습니다.'};
  }
  return {ACTION_IDS,DEFAULTS,TITLE,createAction,cleanAction,blankPage,migrateState,physicalSlot,hardwareGesture,resolveHardwareEvent,resolveKeyPress,planHardwareEvent,deletePage,planAction};
});
