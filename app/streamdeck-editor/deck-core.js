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
  // New D200X actions stay separate from the original 24.
  const D200X_ACTION_IDS=['system-volume','system-mute','system-scroll','edit-history','window-switch','desktop-switch','device-brightness','system-zoom',
    'screenshot','clipboard-edit','window-state','window-monitor','explorer-open',
    'brush-size','timeline-step','timeline-zoom','file-open','folder-shortcut'];
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
    goto:{page:0},indicator:{},
    'system-volume':{direction:'up',step:1},'system-mute':{},
    'system-scroll':{axis:'vertical',direction:'down',step:1},
    'edit-history':{operation:'undo',step:1},
    'window-switch':{direction:'next'},'desktop-switch':{direction:'next'},
    'device-brightness':{direction:'up',step:5},'system-zoom':{operation:'in',step:1},
    screenshot:{},'clipboard-edit':{operation:'copy'},
    'window-state':{operation:'maximize'},'window-monitor':{direction:'right'},
    'explorer-open':{},'brush-size':{direction:'increase'},
    'timeline-step':{direction:'next'},'timeline-zoom':{operation:'in'},'file-open':{path:''},'folder-shortcut':{path:''}
  };
  const TITLE={visible:true,align:'bottom',family:'default',size:12,
    bold:false,italic:false,underline:false,color:'#ffffff',
    outlineColor:'#000000',outlineWidth:'thin'};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const validId=id=>ACTION_IDS.includes(id)||D200X_ACTION_IDS.includes(id);
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
  const CONTROL_MODES=['trigger','adjust','stack'];
  const ADJUST_TARGETS=['page','volume','zoom','scroll','scroll-x','history','window','desktop','brightness'];
  function emptyBinding(){
    return {mode:'trigger',down:null,left:null,right:null,target:'page',
      stack:['page','volume'],stackIndex:0,step:1,reverseDirection:false};
  }
  function cleanBinding(value){
    const out=emptyBinding();
    if(!value||typeof value!=='object'||Array.isArray(value))return out;
    out.mode=CONTROL_MODES.includes(value.mode)?value.mode:'trigger';
    for(const key of ['down','left','right'])out[key]=cleanAction(value[key]);
    out.target=ADJUST_TARGETS.includes(value.target)?value.target:'page';
    if(Array.isArray(value.stack)){
      out.stack=[...new Set(value.stack.filter(x=>ADJUST_TARGETS.includes(x)))].slice(0,3);
      if(!out.stack.length)out.stack=['page'];
    }
    out.stackIndex=Math.max(0,Math.min(out.stack.length-1,Number.isInteger(value.stackIndex)?value.stackIndex:0));
    out.step=[1,2,5,10].includes(value.step)?value.step:1;
    out.reverseDirection=value.reverseDirection===true;
    return out;
  }
  function emptyControls(pageCount){
    return {scopes:Array(5).fill('global'),global:Array.from({length:5},emptyBinding),
      pages:Array.from({length:pageCount},()=>Array.from({length:5},emptyBinding))};
  }
  function ensureControls(state){
    if(!state.controls)state.controls=emptyControls(state.pages.length);
    return state.controls;
  }
  function controlBinding(state,slot){
    if(slot<14||slot>18)return null;
    const controls=ensureControls(state),index=slot-14;
    return controls.scopes[index]==='page'
      ? controls.pages[state.page][index] : controls.global[index];
  }
  function changeControlScope(state,slot,scope){
    if(slot<14||slot>18||!['page','global'].includes(scope))return false;
    const controls=ensureControls(state),index=slot-14;
    if(controls.scopes[index]===scope)return true;
    if(scope==='page'){
      // Current page starts with the global binding; other pages retain
      // their own imported/previously edited entries.
      const local=controls.pages[state.page][index];
      if(!local?.down&&!local?.left&&!local?.right&&local?.mode==='trigger')
        controls.pages[state.page][index]=cleanBinding(controls.global[index]);
    }else{
      controls.global[index]=cleanBinding(controls.pages[state.page][index]);
    }
    controls.scopes[index]=scope;
    return true;
  }
  function blankPage(){return Array.from({length:19},()=>null);}
  function migrateState(value){
    const state={pages:[blankPage()],page:0,selected:null,controls:emptyControls(1)};
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
    state.controls=emptyControls(state.pages.length);
    if(value.controls && typeof value.controls==='object'){
      const c=value.controls;
      state.controls.scopes=state.controls.scopes.map((_,i)=>c.scopes?.[i]==='page'?'page':'global');
      state.controls.global=state.controls.global.map((_,i)=>cleanBinding(c.global?.[i]));
      state.controls.pages=state.controls.pages.map((row,p)=>row.map((_,i)=>cleanBinding(c.pages?.[p]?.[i])));
    } else {
      // Old projects assigned a single action to each physical control on
      // each page. Keep these assignments instead of silently dropping them.
      for(let i=0;i<5;i++){
        const legacy=state.pages.map(row=>row[14+i]).filter(Boolean).map(a=>JSON.stringify(a));
        // A single assigned legacy knob remains global across otherwise empty pages.
        // Conflicting nonempty per-page assignments must remain page-specific.
        if(new Set(legacy).size>1)state.controls.scopes[i]='page';
        const source=state.pages.find(row=>row[14+i])?.[14+i]||null;
        state.controls.global[i].down=source;
        // Legacy knobs interpreted previous/next as bidirectional page rotation.
        // Migrate that behavior rather than silently removing it.
        if(i>=2&&['previous','next'].includes(source?.type)){
          state.controls.global[i].mode='adjust';
          state.controls.global[i].target='page';
        }
        for(let p=0;p<state.pages.length;p++){
          const local=state.controls.pages[p][i];
          local.down=state.pages[p][14+i];
          if(i>=2&&['previous','next'].includes(local.down?.type)){
            local.mode='adjust';local.target='page';
          }
        }
      }
    }
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
    const knob=index>=16;
    const binding=index>=14?controlBinding(state,index):null;
    const action=index<14?state.pages[state.page]?.[index]:(binding?.down||null);
    return {index,gesture,knob,binding,
      action:action&&validId(action.type)?action:null};
  }
  function resolveKeyPress(state,event){
    const resolved=resolveHardwareEvent(state,event);
    return resolved?.gesture==='down'&&resolved.action?{index:resolved.index,action:resolved.action}:null;
  }
  function planAdjustment(target,direction,step,page,pageCount,includeCount=false){
    const count=[1,2,5,10].includes(step)?step:1;
    if(target==='page')return {kind:'page',page:Math.max(0,Math.min(pageCount-1,page+direction*count))};
    if(target==='scroll'||target==='scroll-x')return {kind:'scroll',axis:target==='scroll'?'vertical':'horizontal',direction,
      ...(includeCount||count!==1?{count}:{})};
    if(target==='history')return {kind:'edit-history',operation:direction<0?'undo':'redo',count};
    if(target==='window'||target==='desktop')return {kind:'windows-switch',target,direction,count};
    if(target==='brightness')return {kind:'device-brightness',direction,count};
    return {kind:'adjust',target,direction,...(includeCount||count!==1?{count}:{})};
  }
  function planHardwareEvent(state,event,activeStack=0){
    const resolved=resolveHardwareEvent(state,event);
    if(!resolved||resolved.gesture==='up')return null;
    const {index,gesture,knob,binding}=resolved;
    if(binding && knob){
      if(binding.mode==='adjust'||binding.mode==='stack'){
        if(gesture==='down'){
          if(binding.mode==='stack')return {index,gesture,outcome:{kind:'stack-next',size:binding.stack.length}};
          if(binding.down)return {index,gesture,outcome:planAction(binding.down,state.page,state.pages.length)};
          return null;
        }
        if(gesture!=='left'&&gesture!=='right')return null;
        const target=binding.mode==='stack'
          ? binding.stack[Math.abs(activeStack)%binding.stack.length]:binding.target;
        if(!ADJUST_TARGETS.includes(target))return null;
        const direction=(gesture==='left'?-1:1)*(binding.reverseDirection?-1:1);
        const step=[1,2,5,10].includes(binding.step)?binding.step:1;
        return {index,gesture,outcome:planAdjustment(target,direction,step,state.page,state.pages.length)};
      }
      if(gesture==='left'||gesture==='right'){
        const action=binding[gesture];
        return action?{index,gesture,outcome:planAction(action,state.page,state.pages.length)}:null;
      }
    }
    if(gesture!=='down')return null;
    if(binding && !binding.down)return null;
    if(!resolved.action)return null;
    return {index,gesture,outcome:planAction(resolved.action,state.page,state.pages.length)};
  }
  function deletePage(state){
    if(!state||!Array.isArray(state.pages)||state.pages.length<=1)return false;
    const removed=state.page;
    state.pages.splice(removed,1);
    if(state.controls?.pages)state.controls.pages.splice(removed,1);
    state.page=Math.max(0,Math.min(removed,state.pages.length-1));
    state.selected=null;
    // Preserve other pages. A target beyond the new range remains invalid
    // until explicitly edited, rather than silently redirecting it.
    return true;
  }
  function planAction(action,page,count){
    if(!action||!validId(action.type))return {kind:'unsupported',message:'알 수 없는 동작'};
    if(action.type==='system-mute')return {kind:'mute'};
    if(action.type==='brightness'){
      const mode=action.settings?.mode||'up';
      const fixed={max:100,high:75,medium:50,low:30,min:20};
      if(Object.hasOwn(fixed,mode))return {kind:'device-brightness-set',value:fixed[mode]};
      return {kind:'device-brightness',direction:mode==='down'?-1:1,count:5};
    }
    if(action.type==='media')return {kind:'media-control',operation:action.settings?.op||'playpause'};
    if(action.type==='hotkey')return {kind:'windows-hotkey',keys:String(action.settings?.keys||'')};
    if(action.type==='hotkey-switch')return {kind:'windows-hotkey-switch',
      first:String(action.settings?.first||''),second:String(action.settings?.second||'')};
    if(action.type==='open')return {kind:'open-local-path',path:String(action.settings?.path||''),target:'auto'};
    if(action.type==='open-app')return {kind:'open-local-path',path:String(action.settings?.app||''),target:'file'};
    if(action.type==='file-open'||action.type==='folder-shortcut')
      return {kind:'open-local-path',path:typeof action.settings?.path==='string'?action.settings.path:'',
        target:action.type==='file-open'?'file':'folder'};
    const shortcutOptions={
      screenshot:['capture'],
      'clipboard-edit':['copy','paste','cut'],
      'window-state':['maximize','minimize'],
      'window-monitor':['left','right'],
      'explorer-open':['open'],
      'brush-size':['increase','decrease'],
      'timeline-step':['next','previous'],
      'timeline-zoom':['in','out']
    };
    if(Object.prototype.hasOwnProperty.call(shortcutOptions,action.type)){
      const options=shortcutOptions[action.type],requested=action.settings?.operation||action.settings?.direction;
      return {kind:'system-shortcut',target:action.type,operation:options.includes(requested)?requested:options[0]};
    }
    if(action.type==='system-volume'){
      const direction=action.settings?.direction==='down'?-1:1;
      return planAdjustment('volume',direction,Number(action.settings?.step),page,count,true);
    }
    if(action.type==='device-brightness')return {kind:'device-brightness',direction:action.settings?.direction==='down'?-1:1,
      count:[1,2,5,10].includes(Number(action.settings?.step))?Number(action.settings.step):5};
    if(action.type==='system-zoom'){
      if(action.settings?.operation==='reset')return {kind:'zoom-reset'};
      return planAdjustment('zoom',action.settings?.operation==='out'?-1:1,
        Number(action.settings?.step),page,count,true);
    }
    if(action.type==='window-switch'||action.type==='desktop-switch')
      return {kind:'windows-switch',target:action.type==='window-switch'?'window':'desktop',
        direction:action.settings?.direction==='previous'?-1:1,count:1};
    if(action.type==='edit-history'){
      const operation=action.settings?.operation==='redo'?'redo':'undo';
      return {kind:'edit-history',operation,count:[1,2,5,10].includes(Number(action.settings?.step))?Number(action.settings.step):1};
    }
    if(action.type==='system-scroll'){
      const axis=action.settings?.axis==='horizontal'?'horizontal':'vertical';
      const raw=action.settings?.direction;
      const direction=axis==='vertical'?(raw==='up'?-1:1):(raw==='left'?-1:1);
      return planAdjustment(axis==='vertical'?'scroll':'scroll-x',direction,Number(action.settings?.step),page,count,true);
    }
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
  return {ACTION_IDS,D200X_ACTION_IDS,DEFAULTS,TITLE,createAction,cleanAction,blankPage,migrateState,physicalSlot,hardwareGesture,resolveHardwareEvent,resolveKeyPress,planHardwareEvent,deletePage,planAction,emptyBinding,cleanBinding,ensureControls,controlBinding,changeControlScope};
});
