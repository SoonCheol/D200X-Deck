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
    multi:{},'multi-switch':{activeState:0},random:{},logic:{},
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
    if(Array.isArray(value.children))base.children=value.children.slice(0,value.type==='folder'?14:100)
      .map(child=>value.type==='folder'?cleanAction(child):cleanCompositeEntry(child));
    if(value.type!=='folder')base.children=base.children.filter(Boolean);
    // Folder positions (including empty holes) must survive reloading.
    // Multi Action Switch stores two independent sequences. Older profiles only
    // had children[]: leave them untouched rather than guessing the state.
    if(value.type==='multi-switch'){
      base.settings.activeState=value.settings?.activeState===1?1:0;
      if(Array.isArray(value.stateVisuals)){
        base.stateVisuals=[0,1].map(index=>{
          const source=value.stateVisuals[index];
          if(!source||typeof source!=='object'||Array.isArray(source))return {};
          const visual={};
          if(typeof source.title==='string')visual.title=source.title.slice(0,256);
          if(source.icon?.kind==='glyph'&&typeof source.icon.glyph==='string')
            visual.icon={kind:'glyph',glyph:source.icon.glyph.slice(0,8)};
          if(source.icon?.kind==='file'&&typeof source.icon.value==='string'&&
            /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(source.icon.value)&&source.icon.value.length<1024*1024)
            visual.icon={kind:'file',value:source.icon.value};
          return visual;
        });
      }
    }
    if(value.type==='multi-switch' && Array.isArray(value.sequences)){
      base.sequences=[0,1].map(i=>Array.isArray(value.sequences[i])
        ?value.sequences[i].slice(0,100).map(cleanCompositeEntry).filter(Boolean):[]);
    }
    // Key Logic keeps its physical gestures separate from a sequential list.
    if(value.type==='logic' && value.slots && typeof value.slots==='object' && !Array.isArray(value.slots)){
      base.slots={single:cleanAction(value.slots.single),double:cleanAction(value.slots.double),hold:cleanAction(value.slots.hold)};
    }
    return base;
  }
  function displaySwitchAction(action){
    if(!action||action.type!=='multi-switch')return action;
    const state=action.settings?.activeState===1?1:0;
    const visual=action.stateVisuals?.[state];
    const sharedTitle=action.settings?.linkStateTitles===true
      ?action.stateVisuals?.[0]?.title:null;
    if(!visual&&!sharedTitle)return action;
    return {...action,title:sharedTitle||visual?.title||action.title,
      icon:visual?.icon||action.icon};
  }
  // Delay is an internal Multi step, never a new right-panel action ID.
  // The limits below guard malformed saved data; they do not claim to be the
  // Stream Deck 7.6.1 UI's observed minimum/maximum delay settings.
  function cleanCompositeEntry(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    if(value.kind==='delay')return {kind:'delay',ms:Number.isFinite(value.ms)
      ?Math.max(0,Math.min(600000,Math.round(value.ms))):0};
    return cleanAction(value);
  }
  const COMPOSITE_TYPES=['multi','multi-switch','random','logic'];
  function compositeModel(action){
    if(!action||!COMPOSITE_TYPES.includes(action.type))return null;
    const prepared=cleanAction(action);
    if(action.type==='multi')return {type:'multi',steps:prepared.children};
    if(action.type==='random')return {type:'random',choices:prepared.children};
    if(action.type==='multi-switch')return {type:'multi-switch',
      states:prepared.sequences||[prepared.children,[]]};
    return {type:'logic',slots:prepared.slots||{single:null,double:null,hold:null}};
  }
  function planComposite(action,options={}){
    const model=compositeModel(action);
    if(!model)return {kind:'invalid',message:'복합 액션이 아닙니다.'};
    let steps=[];
    if(model.type==='multi')steps=model.steps;
    if(model.type==='multi-switch'){
      const index=options.state===1?1:0;
      steps=model.states[index];
    }
    if(model.type==='random'){
      if(model.choices.length===0)return {kind:'invalid',message:'후보 동작이 없습니다.'};
      if(model.choices.some(choice=>choice.kind==='delay'))
        return {kind:'invalid',message:'무작위 동작은 지연 단계가 아닌 실제 동작만 선택할 수 있습니다.'};
      const random=Number(options.random);
      if(!Number.isFinite(random)||random<0||random>=1)
        return {kind:'invalid',message:'검증된 무작위 선택 값이 필요합니다.'};
      steps=[model.choices[Math.floor(random*model.choices.length)]];
    }
    if(model.type==='logic'){
      if(!['single','double','hold'].includes(options.gesture))
        return {kind:'invalid',message:'물리 키 누름 유형을 확인해야 합니다.'};
      steps=model.slots[options.gesture]?[model.slots[options.gesture]]:[];
    }
    // No nested Multi/other composites until original 7.6.1 permits them.
    if(steps.some(step=>step.kind!=='delay'&&COMPOSITE_TYPES.includes(step.type)))
      return {kind:'invalid',message:'복합 액션 중첩 지원 여부가 확인되지 않았습니다.'};
    return {kind:'composite',type:model.type,steps:copy(steps)};
  }
  async function runComposite(action,{execute,wait,signal,state=0,random,gesture,nextActionMs=0}={}){
    if(typeof execute!=='function'||typeof wait!=='function')throw new TypeError('execute and wait callbacks are required');
    const plan=planComposite(action,{state,random,gesture});
    if(plan.kind!=='composite')throw new Error(plan.message||'복합 동작 실행 불가');
    const gap=Number.isInteger(nextActionMs)&&nextActionMs>=0&&nextActionMs<=1000?nextActionMs:0;
    for(let i=0;i<plan.steps.length;i++){
      const step=plan.steps[i],previous=plan.steps[i-1];
      if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
      // An explicit Delay step already represents a pause: don't silently
      // add the default next-action gap beside it.
      if(i>0&&gap>0&&step.kind!=='delay'&&previous.kind!=='delay')
        await wait(gap,signal);
      if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
      if(step.kind==='delay')await wait(step.ms,signal);
      else await execute(step,signal);
    }
    if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
    return plan.steps.length;
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
  function folderContents(action){
    if(!action||action.type!=='folder')return null;
    if(!Array.isArray(action.children))action.children=[];
    while(action.children.length<14)action.children.push(null);
    return action.children;
  }
  function currentActions(state){
    let actions=state.pages?.[state.page];
    if(!actions)return null;
    for(const index of state.folderPath||[]){
      actions=folderContents(actions[index]);
      if(!actions)return null;
    }
    return actions;
  }
  function enterFolder(state,index){
    if(!Number.isInteger(index)||index<0||index>=14||(state.folderPath||[]).length>=8)return false;
    const action=currentActions(state)?.[index];
    if(action?.type!=='folder')return false;
    state.folderPath=[...(state.folderPath||[]),index];state.selected=null;
    return true;
  }
  function exitFolder(state){
    if(!(state.folderPath||[]).length)return false;
    state.folderPath.pop();state.selected=null;return true;
  }

  function migrateState(value){
    const state={pages:[blankPage()],page:0,selected:null,controls:emptyControls(1),folderPath:[]};
    // Legacy single-profile storage gains metadata but never loses its pages.
    if(!value||typeof value!=='object'||!Array.isArray(value.pages)||!value.pages.length){
      initProfiles(state,value);return state;
    }

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
    state.folderPath=[];
    if(Array.isArray(value.folderPath)){
      for(const entry of value.folderPath.slice(0,8)){
        if(!Number.isInteger(entry)||entry<0||entry>=14||currentActions(state)?.[entry]?.type!=='folder')break;
        state.folderPath.push(entry);
      }
    }
    initProfiles(state,value);
    return state;
  }
  // Only inactive profiles are stored as snapshots. The active one uses the
  // existing top-level pages/page/controls fields, avoiding doubled icon data.
  function profileSnapshot(state){
    return {pages:copy(state.pages),page:state.page,controls:copy(state.controls),
      folderPath:copy(state.folderPath||[])};
  }
  function initProfiles(state,value){
    const source=Array.isArray(value?.profileNames)?value.profileNames:null;
    state.profileNames=source?source.slice(0,50).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string')
      .map(p=>({id:p.id.slice(0,40),name:p.name.slice(0,80)})):[];
    const seen=new Set();
    state.profileNames=state.profileNames.filter(p=>p.id&& !seen.has(p.id)&&seen.add(p.id));
    if(!state.profileNames.length)state.profileNames=[{id:'default',name:'기본 프로필'}];
    state.profileId=state.profileNames.some(p=>p.id===value?.profileId)?value.profileId:state.profileNames[0].id;
    const inactive=Array.isArray(value?.inactiveProfiles)?value.inactiveProfiles:[];
    state.inactiveProfiles=state.profileNames.filter(p=>p.id!==state.profileId).map(p=>{
      const source=inactive.find(s=>s?.id===p.id);
      const clean=migrateState(source&&Array.isArray(source.pages)?source:{pages:[blankPage()]});
      return {id:p.id,...profileSnapshot(clean)};
    });
    state.profileSeq=Math.max(state.profileNames.length,Number.isInteger(value?.profileSeq)?value.profileSeq:1);
  }
  function switchProfile(state,id){
    if(!state.profileNames?.some(p=>p.id===id))return false;
    if(state.profileId===id)return true;
    const next=state.inactiveProfiles.find(p=>p.id===id);
    if(!next)return false;
    const old={id:state.profileId,...profileSnapshot(state)};
    state.inactiveProfiles=state.inactiveProfiles.filter(p=>p.id!==id);
    state.inactiveProfiles.push(old);
    const clean=migrateState(next);
    state.pages=clean.pages;state.page=clean.page;state.controls=clean.controls;
    state.folderPath=clean.folderPath;state.selected=null;state.profileId=id;
    return true;
  }
  function createProfile(state,name,duplicate=false){
    if((state.profileNames||[]).length>=50)return null;
    const label=String(name||'새 프로필').trim().slice(0,80)||'새 프로필';
    let id;
    do{id='profile-'+(++state.profileSeq);}while(state.profileNames.some(p=>p.id===id));
    state.profileNames.push({id,name:label});
    const source=duplicate?profileSnapshot(state):profileSnapshot(migrateState(null));
    state.inactiveProfiles.push({id,...source});
    return id;
  }
  function renameProfile(state,id,name){
    const record=state.profileNames?.find(p=>p.id===id);
    if(!record||!String(name||'').trim())return false;
    record.name=String(name).trim().slice(0,80);return true;
  }
  function deleteProfile(state,id){
    if(!state.profileNames?.some(p=>p.id===id)||state.profileNames.length<=1)return false;
    if(state.profileId===id){
      const fallback=state.profileNames.find(p=>p.id!==id);
      if(!switchProfile(state,fallback.id))return false;
    }
    state.profileNames=state.profileNames.filter(p=>p.id!==id);
    state.inactiveProfiles=state.inactiveProfiles.filter(p=>p.id!==id);
    return true;
  }
  // Hardware indices: 0..13 screen keys; 15/16 physical buttons;
  // 17..19 rotary encoders. Editor stores them in slots 0..18.
  function previewHardwareEvent(slot,gesture='down'){
    if(!Number.isInteger(slot)||slot<0||slot>18)return null;
    const knob=slot>=16;
    const state=knob?({down:1,left:2,right:3})[gesture]:(gesture==='down'?1:null);
    if(!state)return null;
    return {kind:knob?2:1,index:slot<14?slot:slot+1,state,pressed:gesture==='down'};
  }
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
    const action=index<14?currentActions(state)?.[index]:(binding?.down||null);
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
    if(action?.type==='folder')return {kind:'folder-enter'};
    if(!action||!validId(action.type))return {kind:'unsupported',message:'알 수 없는 동작'};
    if(action.type==='system-mute')return {kind:'mute'};
    if(action.type==='profile')return {kind:'profile',profile:action.settings?.profile||'next'};
    if(action.type==='multi')return {kind:'composite',type:'multi'};
    if(action.type==='multi-switch')return {kind:'composite',type:'multi-switch'};
    if(action.type==='random')return {kind:'composite',type:'random'};
    if(action.type==='brightness'){
      const mode=action.settings?.mode||'up';
      const fixed={max:100,high:75,medium:50,low:30,min:20};
      if(Object.hasOwn(fixed,mode))return {kind:'device-brightness-set',value:fixed[mode]};
      return {kind:'device-brightness',direction:mode==='down'?-1:1,count:5};
    }
    if(action.type==='media')return {kind:'media-control',operation:action.settings?.op||'playpause'};
    if(action.type==='timer')return {kind:'timer',seconds:Math.max(1,Math.min(86400,Number(action.settings?.seconds)||30))};
    if(action.type==='audio-play')return {kind:'audio-play',
      file:String(action.settings?.file||''),mode:action.settings?.mode||'play-stop',
      volume:Math.max(0,Math.min(100,Number(action.settings?.volume)||0))};
    if(action.type==='audio-stop')return {kind:'audio-stop'};
    if(action.type==='text')return {kind:'type-text',text:String(action.settings?.body||''),
      enter:action.settings?.enter===true,mode:action.settings?.mode==='typing'?'typing':'clipboard'};
    if(action.type==='hotkey')return {kind:'windows-hotkey',keys:String(action.settings?.keys||'')};
    if(action.type==='hotkey-switch')return {kind:'windows-hotkey-switch',
      first:String(action.settings?.first||''),second:String(action.settings?.second||'')};
    if(action.type==='open')return {kind:'open-local-path',path:String(action.settings?.path||''),target:'auto'};
    if(action.type==='open-app')return {kind:'open-local-path',path:String(action.settings?.app||''),target:'file'};
    if(action.type==='close')return {kind:'close-local-app',path:String(action.settings?.path||''),force:action.settings?.force===true};
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
  return {ACTION_IDS,D200X_ACTION_IDS,DEFAULTS,TITLE,createAction,cleanAction,cleanCompositeEntry,displaySwitchAction,compositeModel,planComposite,runComposite,blankPage,folderContents,currentActions,enterFolder,exitFolder,migrateState,profileSnapshot,switchProfile,createProfile,renameProfile,deleteProfile,previewHardwareEvent,physicalSlot,hardwareGesture,resolveHardwareEvent,resolveKeyPress,planHardwareEvent,deletePage,planAction,emptyBinding,cleanBinding,ensureControls,controlBinding,changeControlScope};
});
