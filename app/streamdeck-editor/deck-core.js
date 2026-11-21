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
    'brush-size','timeline-step','timeline-zoom','file-open','folder-shortcut','terminal','terminal-admin'];
  const PLUGIN_ACTION_IDS=['ha-toggle','sd-plugin'];
  const DEFAULTS={
    'audio-play':{file:'',mode:'play-stop',fade:'none',fadeDuration:2,volume:50,output:'default'},
    'audio-stop':{},timer:{seconds:30,sound:'connect',soundFile:'',soundVolume:100},
    brightness:{mode:'up'},sleep:{},virtual:{},
    multi:{},'multi-switch':{activeState:0},random:{},logic:{},
    website:{url:'',open:'default',browserPath:''},'hotkey-switch':{first:'',second:''},
    hotkey:{keys:'',source:'preset'},open:{path:'',args:''},
    'open-app':{app:'',args:'',hold:'close',foreground:true,preventDuplicate:true},close:{path:'',force:false},
    text:{body:'',enter:false,mode:'typing'},media:{op:'playpause'},
    folder:{autoExitEnabled:false,autoExitSeconds:0},profile:{profile:'next'},previous:{},next:{},
    goto:{page:0},indicator:{indicatorDown:{navigation:'none'},indicatorHold:{navigation:'none'}},'side-nav':{navigation:'none'},
    'system-volume':{direction:'up',step:1},'system-mute':{},
    'system-scroll':{axis:'vertical',direction:'down',step:1},
    'edit-history':{operation:'undo',step:1},
    'window-switch':{direction:'next'},'desktop-switch':{direction:'next'},
    'device-brightness':{direction:'up',step:5},'system-zoom':{operation:'in',step:1},
    'ha-toggle':{entityId:''},'sd-plugin':{pluginUUID:'',actionUUID:'',pluginSettings:{}},
    screenshot:{},'clipboard-edit':{operation:'copy'},
    'window-state':{operation:'maximize'},'window-monitor':{direction:'right'},
    'explorer-open':{},'brush-size':{direction:'increase'},
    'timeline-step':{direction:'next'},'timeline-zoom':{operation:'in'},'file-open':{path:''},'folder-shortcut':{path:'',alwaysNewWindow:false,foreground:true},
    terminal:{foreground:true,preventDuplicate:true},'terminal-admin':{foreground:true,preventDuplicate:true}
  };
  const TITLE={visible:true,align:'bottom',family:'default',size:12,
    bold:false,italic:false,underline:false,color:'#ffffff',
    outlineColor:'#000000',outlineWidth:'thin',
    backgroundEnabled:false,backgroundColor:'#000000',backgroundOpacity:65};
  const INDICATOR_NUMBER_STYLE={...TITLE,align:'middle',size:48,outlineWidth:'none'};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const validId=id=>ACTION_IDS.includes(id)||D200X_ACTION_IDS.includes(id)||PLUGIN_ACTION_IDS.includes(id)||id==='side-nav';
  function createAction(id){
    if(!validId(id))throw new Error('Unsupported built-in action: '+String(id));
    return {type:id,title:id==='folder'?'폴더':'',
      settings:copy(DEFAULTS[id]),titleStyle:copy(TITLE),children:[]};
  }
  function cleanTitleStyle(value,defaults){
    const st={...defaults,...(value&&typeof value==='object'&&!Array.isArray(value)?value:{})};
    st.visible=st.visible!==false;
    st.align=({left:'bottom',center:'middle',right:'top'}[st.align]) ||
      (['bottom','middle','top'].includes(st.align)?st.align:'bottom');
    st.family=['default','DeckForge Pretendard','Malgun Gothic','Segoe UI'].includes(st.family)?st.family:'default';
    st.size=Math.max(8,Math.min(48,Number(st.size)||12));
    for(const key of ['bold','italic','underline'])st[key]=Boolean(st[key]);
    st.color=/^#[0-9a-fA-F]{6}$/.test(st.color)?st.color:'#ffffff';
    st.outlineColor=/^#[0-9a-fA-F]{6}$/.test(st.outlineColor)?st.outlineColor:'#000000';
    st.outlineWidth=['none','thin','medium','thick'].includes(st.outlineWidth)?st.outlineWidth:'thin';
    st.backgroundEnabled=st.backgroundEnabled===true;
    st.backgroundColor=/^#[0-9a-fA-F]{6}$/.test(st.backgroundColor)?st.backgroundColor:'#000000';
    st.backgroundOpacity=Number.isFinite(st.backgroundOpacity)?Math.max(0,Math.min(100,st.backgroundOpacity)):65;
    return st;
  }
  function cleanAction(value){
    if(!value||!validId(value.type))return null;
    const base=createAction(value.type);
    base.title=typeof value.title==='string'?value.title.slice(0,256):base.title;
    if(value.settings&&typeof value.settings==='object'&&!Array.isArray(value.settings))
      base.settings={...base.settings,...value.settings};
    // Preserve old text actions whose mode field was absent when clipboard was the default.
    if(value.type==='text'&&value.settings?.mode===undefined)base.settings.mode='clipboard';
    // Keep existing repeat-launch buttons repeatable; new actions default to both options.
    if(value.type==='open-app'&&typeof value.settings?.preventDuplicate!=='boolean')
      base.settings.preventDuplicate=base.settings.foreground===true&&!String(base.settings.args||'').trim()&&(!base.settings.app||String(base.settings.app).startsWith('shell:AppsFolder\\')||/\.(exe|lnk)$/i.test(String(base.settings.app)));
    base.titleStyle=cleanTitleStyle(value.titleStyle,TITLE);
    if(value.type==='indicator'){
      base.settings.indicatorDown=indicatorConfig(base,'down');
      base.settings.indicatorHold=indicatorConfig(base,'hold');
      base.settings.indicatorNumberStyle=cleanTitleStyle(value.settings?.indicatorNumberStyle,INDICATOR_NUMBER_STYLE);
      if(typeof value.settings?.indicatorDownTitle==='string')base.settings.indicatorDownTitle=value.settings.indicatorDownTitle.slice(0,256);
      else delete base.settings.indicatorDownTitle;
      if(value.settings?.indicatorDownTitleStyle&&typeof value.settings.indicatorDownTitleStyle==='object'&&!Array.isArray(value.settings.indicatorDownTitleStyle))
        base.settings.indicatorDownTitleStyle=cleanTitleStyle(value.settings.indicatorDownTitleStyle,base.titleStyle);
      else delete base.settings.indicatorDownTitleStyle;
    }
    if(base.settings.keyBackgrounds!==undefined){
      const raw=base.settings.keyBackgrounds, cleaned={};
      for(const key of ['default','first','second']){
        const entry=raw?.[key];
        if(entry&&typeof entry==='object'&&!Array.isArray(entry))cleaned[key]={enabled:entry.enabled===true,color:/^#[0-9a-fA-F]{6}$/.test(entry.color)?entry.color:'#08090c'};
      }
      base.settings.keyBackgrounds=cleaned;
    }
    if(value.icon&&value.icon.kind==='glyph'&&typeof value.icon.glyph==='string')
      base.icon={kind:'glyph',glyph:value.icon.glyph.slice(0,8)};
    if(value.icon&&value.icon.kind==='file'&&typeof value.icon.value==='string'&&
      /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.icon.value)&&value.icon.value.length<1024*1024)
      base.icon={kind:'file',value:value.icon.value,
        ...(typeof value.icon.packId==='string'&&value.icon.packId.length<=128?{packId:value.icon.packId}:{})};
    // Preserve known child structure but do not execute untrusted or unknown actions.
    if(Array.isArray(value.children))base.children=value.children.slice(0,value.type==='folder'?14:100)
      .map(child=>value.type==='folder'?cleanAction(child):cleanCompositeEntry(child));
    if(value.type!=='folder')base.children=base.children.filter(Boolean);
    if(value.type==='folder'){
      // Page one remains children[] for backward compatibility with existing profiles.
      base.pages=Array.isArray(value.pages)?value.pages.slice(0,9).map(page=>
        Array.from({length:14},(_,index)=>cleanAction(Array.isArray(page)?page[index]:null))):[];
      base.pageIndex=Number.isInteger(value.pageIndex)?
        Math.max(0,Math.min(value.pageIndex,base.pages.length)):0;
      base.settings.autoExitSeconds=Number.isInteger(value.settings?.autoExitSeconds)
        ?Math.max(0,Math.min(60,value.settings.autoExitSeconds)):0;
      base.settings.autoExitEnabled=value.settings?.autoExitEnabled===true ||
        (value.settings?.autoExitEnabled===undefined&&base.settings.autoExitSeconds>0);
    }
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
            visual.icon={kind:'file',value:source.icon.value,
              ...(typeof source.icon.packId==='string'&&source.icon.packId.length<=128?{packId:source.icon.packId}:{})};
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
  function timerSeconds(value){return Math.max(1,Math.min(86400,Math.round(Number(value)||30)));}
  function formatTimerTime(remaining,configured){
    const seconds=Math.max(0,Math.min(86400,Math.ceil(Number(remaining)||0)));
    if(timerSeconds(configured)<60)return seconds+'초';
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
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
  // Read legacy pauses without rewriting a profile merely by opening its editor.
  // Each row carries its own pre-delay; a legacy terminal pause stays intact.
  const multiMs=value=>Number.isFinite(value)?Math.max(0,Math.min(60000000,Math.round(value))):0;
  function multiRows(action){
    const rows=[],steps=Array.isArray(action?.children)?action.children:[];
    if(action?.settings?.rowDelays===true){
      for(const step of steps)if(step?.type)rows.push({step,ms:multiMs(step.settings?.multiBeforeMs)});
      return {rows,tail:multiMs(action.settings.multiTrailingMs)};
    }
    const configuredGap=Math.max(2,Math.min(200,Number(action?.settings?.nextActionMs)||100));
    const gap=Number.isInteger(configuredGap)?configuredGap:0;
    let before=0,previous=null;
    for(const step of steps){
      if(step?.kind==='delay')before+=multiMs(step.ms);
      else if(step?.type){
        if(previous&&previous.kind!=='delay')before+=gap;
        rows.push({step,ms:multiMs(before)});before=0;
      }
      previous=step;
    }
    return {rows,tail:multiMs(before)};
  }
  function setMultiRows(action,rows,tail=0){
    if(action?.type!=='multi'||!Array.isArray(rows)||rows.length>100)throw Error('Invalid multi rows');
    action.children=rows.map(({step,ms})=>{
      const entry=cleanAction(step);
      if(!entry)throw Error('Invalid multi step');
      entry.settings.multiBeforeMs=multiMs(ms);
      return entry;
    });
    action.settings={...action.settings,rowDelays:true,multiTrailingMs:multiMs(tail)};
    delete action.settings.nextActionMs;
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
  function createMultiPauseGate(signal,{now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
    let paused=false;
    const listeners=new Set();
    const notify=()=>{for(const fn of [...listeners])fn();};
    const check=()=>{if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');};
    const changed=ms=>new Promise(resolve=>{
      let timer,done=false;
      const finish=()=>{if(done)return;done=true;listeners.delete(finish);signal?.removeEventListener('abort',finish);if(timer!==undefined)clearTimer(timer);resolve();};
      listeners.add(finish);signal?.addEventListener('abort',finish,{once:true});
      if(ms!==undefined)timer=setTimer(finish,ms);
      if(signal?.aborted)finish();
    });
    const ready=async()=>{check();while(paused){await changed();check();}};
    const wait=async ms=>{
      let remaining=ms;
      while(remaining>0){
        await ready();check();if(paused)continue;
        const started=now();await changed(remaining);
        remaining=Math.max(0,remaining-Math.max(0,now()-started));check();
      }
      await ready();
    };
    return {get paused(){return paused;},pause(){if(!paused&&!signal?.aborted){paused=true;notify();}},resume(){if(paused&&!signal?.aborted){paused=false;notify();}},ready,wait};
  }
  async function runComposite(action,{execute,wait,signal,state=0,random,gesture,nextActionMs=0,onStep}={}){
    if(typeof execute!=='function'||typeof wait!=='function')throw new TypeError('execute and wait callbacks are required');
    const plan=planComposite(action,{state,random,gesture});
    if(plan.kind!=='composite')throw new Error(plan.message||'복합 동작 실행 불가');
    if(plan.type==='multi'&&action.settings?.rowDelays===true){
      for(let i=0;i<plan.steps.length;i++){
        const step=plan.steps[i];
        if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');
        if(step.kind==='delay')throw Error('잘못된 순차 동작 단계입니다.');
        onStep?.(i+1,plan.steps.length);
        const ms=multiMs(step.settings?.multiBeforeMs);
        if(ms)await wait(ms,signal);
        if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');
        await execute(step,signal);
      }
      const tail=multiMs(action.settings.multiTrailingMs);
      if(tail){if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');await wait(tail,signal);}
      if(signal?.aborted)throw Error('복합 동작이 취소되었습니다.');
      return plan.steps.length;
    }
    let progress=0;
    const total=plan.steps.filter(step=>step.kind!=='delay').length;
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
      else {onStep?.(++progress,total);await execute(step,signal);}
    }
    if(signal?.aborted)throw new Error('복합 동작이 취소되었습니다.');
    return plan.steps.length;
  }
  const CONTROL_MODES=['trigger','stack'];
  const ROTATION_KEYS=['left','right','holdLeft','holdRight'];
  function controlAction(binding,key){return binding&&!(binding.inactiveRotations||[]).includes(key)?binding[key]:null;}
  // Execution/SDK registration share the same explicit-action eligibility.
  // Legacy held assignments remain usable when heldEnabled was never enabled.
  function activeControlAction(binding,gesture){
    if(!binding)return null;
    const key=({'hold-left':'holdLeft','hold-right':'holdRight',up:'down'})[gesture]||gesture;
    if(key==='down')return binding.heldEnabled===true||binding.mode==='stack'?null:controlAction(binding,key);
    if(key==='left'||key==='right')return binding.mode==='stack'||binding.mode==='adjust'?null:controlAction(binding,key);
    if(key==='holdLeft'||key==='holdRight')return binding.heldEnabled===true&&binding.heldMode!=='trigger'?null:controlAction(binding,key);
    return null;
  }
  function assignControlAction(binding,key,action){
    binding[key]=action;
    binding.inactiveRotations=(binding.inactiveRotations||[]).filter(x=>x!==key);
  }
  function automaticControl(binding,held=false){
    const keys=held?['holdLeft','holdRight']:['left','right'];
    binding.inactiveRotations=[...new Set([...(binding.inactiveRotations||[]),...keys.filter(key=>binding[key])])];
    if(held){binding.heldMode='trigger';binding.heldAutoAssign=true;}
    else{binding.mode='trigger';binding.autoAssign=true;}
  }
  const ADJUST_TARGETS=['page','profile','volume','zoom','scroll','scroll-x','history','window','desktop','brightness'];
  function emptyBinding(){
    return {mode:'trigger',down:null,sideHold:null,left:null,right:null,holdLeft:null,holdRight:null,target:'page',heldEnabled:false,heldMode:'trigger',heldTarget:'profile',heldStep:1,heldReverseDirection:false,heldStack:['page','volume'],autoAssign:false,heldAutoAssign:true,inactiveRotations:[],
      stack:['page','volume'],stackIndex:0,step:1,reverseDirection:false};
  }
  function cleanBinding(value){
    const out=emptyBinding();
    if(!value||typeof value!=='object'||Array.isArray(value))return out;
    out.mode=CONTROL_MODES.includes(value.mode)?value.mode:'trigger';
    for(const key of ['down','sideHold','left','right','holdLeft','holdRight'])out[key]=cleanAction(value[key]);
    out.target=ADJUST_TARGETS.includes(value.target)?value.target:'page';
    out.autoAssign=value.autoAssign===true;
    out.heldAutoAssign=value.heldAutoAssign===true;
    out.heldEnabled=value.heldEnabled===true;
    out.heldMode=CONTROL_MODES.includes(value.heldMode)?value.heldMode:'trigger';
    out.inactiveRotations=Array.isArray(value.inactiveRotations)?[...new Set(value.inactiveRotations.filter(key=>ROTATION_KEYS.includes(key)))]:[];
    if(value.mode==='adjust')automaticControl(out);
    // Previous held-adjust mode ignored saved overrides only while enabled.
    if(value.heldMode==='adjust'||!CONTROL_MODES.includes(value.heldMode)){
      if(out.heldEnabled)automaticControl(out,true);
      else out.heldAutoAssign=true;
    }
    out.heldTarget=ADJUST_TARGETS.includes(value.heldTarget)?value.heldTarget:'profile';
    out.heldStep=[1,2,5,10].includes(value.heldStep)?value.heldStep:1;
    out.heldReverseDirection=value.heldReverseDirection===true;
    out.heldStack=Array.isArray(value.heldStack)?[...new Set(value.heldStack.filter(x=>ADJUST_TARGETS.includes(x)))].slice(0,3):['page','volume'];
    if(!out.heldStack.length)out.heldStack=['page','volume'];
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
      if(!local?.down&&!local?.sideHold&&!local?.left&&!local?.right&&!local?.holdLeft&&!local?.holdRight&&local?.mode==='trigger')
        controls.pages[state.page][index]=cleanBinding(controls.global[index]);
    }else{
      controls.global[index]=cleanBinding(controls.pages[state.page][index]);
    }
    controls.scopes[index]=scope;
    return true;
  }
  // Side buttons have a closed navigation-only contract. Legacy assignments
  // remain stored but unsupported actions cannot be executed from these slots.
  const SIDE_NAV_LABELS=Object.freeze({
    first:'첫 페이지',previous:'이전 페이지',next:'다음 페이지',last:'마지막 페이지',goto:'선택 페이지',
    'profile-previous':'이전 프로필','profile-next':'다음 프로필','profile-select':'선택 프로필',
    'folder-target':'지정 폴더로 이동','folder-back':'상위 폴더로 이동','folder-root':'모든 폴더 나가기',
    home:'홈',none:'동작 없음'
  });
  const INDICATOR_NAV_LABELS=Object.freeze(Object.fromEntries(
    ['none','first','previous','history-back','next','last','goto','profile-previous','profile-history','profile-next','profile-select','folder-back','folder-history','home','editor-open']
      .map(key=>[key,({'editor-open':'DeckForge 열기','history-back':'직전 페이지','profile-history':'직전 프로필','folder-history':'직전 덱폴더'})[key]||SIDE_NAV_LABELS[key]])));
  function indicatorConfig(action,gesture='down'){
    const raw=action?.settings?.[gesture==='hold'?'indicatorHold':'indicatorDown'];
    if(action?.type!=='indicator'||!raw||!Object.hasOwn(INDICATOR_NAV_LABELS,raw.navigation))return {navigation:'none'};
    return ['editor-open','history-back','profile-history','folder-history'].includes(raw.navigation)?{navigation:raw.navigation}:sideConfig({type:'side-nav',settings:raw});
  }
  const SIDE_HOLD_MS=650;
  function sideConfig(action){
    if(!action)return {navigation:'none'};
    const s=action.settings||{};
    if(['previous','next'].includes(action.type))return {navigation:action.type};
    if(action.type==='goto')return {navigation:'goto',page:Number(s.page)};
    if(action.type==='profile')return s.profile==='previous'||s.profile==='next'
      ?{navigation:'profile-'+s.profile}:{navigation:'profile-select',profile:typeof s.profile==='string'?s.profile:''};
    if(action.type!=='side-nav'||!Object.hasOwn(SIDE_NAV_LABELS,s.navigation))return {navigation:'none'};
    const navigation=s.navigation;
    if(navigation==='goto')return {navigation,page:Number.isInteger(s.page)?s.page:-1};
    if(navigation==='profile-select')return {navigation,profile:typeof s.profile==='string'?s.profile:''};
    if(navigation==='folder-target'){
      const route=Array.isArray(s.route)&&s.route.length>=1&&s.route.length<=8&&s.route.every(x=>Array.isArray(x)&&x.length===2&&Number.isInteger(x[0])&&x[0]>=0&&x[0]<14&&Number.isInteger(x[1])&&x[1]>=0&&x[1]<10)?s.route.map(x=>x.slice()):[];
      return {navigation,rootPage:Number.isInteger(s.rootPage)?s.rootPage:-1,route};
    }
    return {navigation};
  }
  function makeSideAction(config){
    const action=createAction('side-nav');
    action.settings=sideConfig({type:'side-nav',settings:config});
    return action;
  }
  function sideActionConfig(binding,index,gesture='down'){
    if(gesture==='hold')return sideConfig(binding?.sideHold);
    if(!binding?.down)return {navigation:index===14?'first':'folder-back'};
    return sideConfig(binding.down);
  }
  function sideFolderTargets(state){
    const targets=[];
    function walk(row,rootPage,route,names){
      if(route.length>=8||targets.length>=1000)return;
      for(let slot=0;slot<14&&targets.length<1000;slot++){
        const folder=row?.[slot]||(!route.length?state.pinned?.[slot]:null);
        if(folder?.type!=='folder')continue;
        const name=(folder.title||'폴더')+' ('+(slot+1)+'번)';
        targets.push({rootPage,route:[...route,[slot,0]],label:['페이지 '+(rootPage+1),...names,name].join(' / ')});
        const pages=[folder.children,...(folder.pages||[])];
        pages.forEach((child,page)=>walk(child,rootPage,[...route,[slot,page]],[...names,name+' · '+(page+1)+'페이지']));
      }
    }
    state.pages.forEach((row,page)=>walk(row,page,[],[]));
    return targets;
  }
  function sideFolderNodes(state,config){
    const {rootPage,route}=config;
    if(!state.pages[rootPage]||!route?.length||route.length>8)return null;
    let row=state.pages[rootPage];const nodes=[];
    for(const [depth,[slot,page]] of route.entries()){
      const folder=row?.[slot]||(depth===0?state.pinned?.[slot]:null);
      if(folder?.type!=='folder'||page<0||page>(folder.pages?.length||0))return null;
      row=page===0?folder.children:folder.pages[page-1];
      if(!Array.isArray(row))return null;
      nodes.push({folder,slot,page});
    }
    return nodes;
  }
  function planSideNavigation(state,index,gesture='down'){
    if(index!==14&&index!==15)return null;
    return planNavigation(state,sideActionConfig(controlBinding(state,index),index,gesture));
  }
  function planIndicatorNavigation(state,index,gesture='down'){
    if(!Number.isInteger(index)||index<0||index>=13)return null;
    return planNavigation(state,sharedIndicatorConfig(state,visibleActions(state)[index],gesture));
  }
  function planNavigation(state,config){
    const nav=config.navigation;
    const folder=activeFolder(state),page=folder?(folder.pageIndex||0):state.page,count=folder?folderPageCount(state):state.pages.length;
    if(nav==='none')return null;
    if(nav==='first'||nav==='previous'||nav==='next'||nav==='last'||nav==='goto'){
      const dest=nav==='first'?0:nav==='last'?count-1:nav==='previous'?Math.max(0,page-1):nav==='next'?Math.min(count-1,page+1):config.page;
      return Number.isInteger(dest)&&dest>=0&&dest<count?{kind:'page',page:dest}:{kind:'invalid',message:'대상 페이지가 존재하지 않습니다.'};
    }
    if(nav==='profile-previous'||nav==='profile-next')return {kind:'profile',profile:nav.slice(8)};
    if(nav==='profile-select')return state.profileNames?.some(x=>x.id===config.profile)?{kind:'profile',profile:config.profile}:{kind:'invalid',message:'대상 프로필이 존재하지 않습니다.'};
    if(nav==='folder-target')return sideFolderNodes(state,config)?{kind:nav,config}:{kind:'invalid',message:'대상 폴더가 존재하지 않습니다.'};
    return {kind:nav};
  }
  function applySideNavigation(state,outcome){
    if(!outcome||outcome.kind==='invalid')return false;
    if(outcome.kind==='page'){
      if(activeFolder(state))return changeFolderPage(state,outcome.page);
      if(!state.pages[outcome.page])return false;
      state.page=outcome.page;state.selected=null;return true;
    }
    if(outcome.kind==='profile'){
      const names=state.profileNames||[],pos=names.findIndex(x=>x.id===state.profileId);
      if(!names.length||pos<0)return false;
      const id=outcome.profile==='next'?names[(pos+1)%names.length].id:
        outcome.profile==='previous'?names[(pos-1+names.length)%names.length].id:outcome.profile;
      return switchProfile(state,id);
    }
    if(outcome.kind==='folder-back')return exitFolder(state);
    if(outcome.kind==='folder-root'||outcome.kind==='home'){
      state.folderPath=[];if(outcome.kind==='home')state.page=0;state.selected=null;return true;
    }
    if(outcome.kind==='folder-target'){
      // Validate every hop before mutating the active page or any folder.
      const nodes=sideFolderNodes(state,outcome.config);if(!nodes)return false;
      state.page=outcome.config.rootPage;
      for(const n of nodes)n.folder.pageIndex=n.page;
      state.folderPath=nodes.map(n=>n.slot);state.selected=null;return true;
    }
    return false;
  }
  // Runtime-only navigation history. Identity checks prevent returning to
  // unrelated pages or folders after deletion or replacement.
  function createPageVisitTracker(){
    let owner=null,profile=null,previousProfile=null,current=null,previous=null,lastFolder=null,previousFolder=null;
    function capture(state){
      const root=state.pages?.[state.page];
      if(!Array.isArray(root))return null;
      let row=root;const route=[],nodes=[];
      for(const [depth,slot] of (state.folderPath||[]).entries()){
        const folder=row[slot]||(depth===0?state.pinned?.[slot]:null);
        if(folder?.type!=='folder')return null;
        const page=folder.pageIndex||0;
        row=folderContents(folder);if(!Array.isArray(row))return null;
        route.push([slot,page]);nodes.push(folder);
      }
      return {rootPage:state.page,root,route,nodes,row};
    }
    const same=(a,b)=>!!a&&!!b&&a.rootPage===b.rootPage&&a.root===b.root&&a.row===b.row&&
      JSON.stringify(a.route)===JSON.stringify(b.route)&&a.nodes.length===b.nodes.length&&a.nodes.every((node,i)=>node===b.nodes[i]);
    const sameFolder=(a,b)=>!!a&&!!b&&a.root===b.root&&a.nodes.length===b.nodes.length&&a.nodes.every((node,i)=>node===b.nodes[i]);
    function observe(state){
      const next=capture(state);
      if(owner!==state||profile!==state.profileId){
        previousProfile=owner===state?profile:null;
        owner=state;profile=state.profileId;current=next;previous=null;
        lastFolder=next?.route.length?next:null;previousFolder=null;return;
      }
      if(!next){current=null;previous=null;lastFolder=null;previousFolder=null;return;}
      if(!same(current,next)){previous=current;current=next;}
      if(next.route.length){
        if(lastFolder&&!sameFolder(lastFolder,next))previousFolder=lastFolder;
        lastFolder=next;
      }
    }
    function restore(state,dest){
      if(!dest||state.pages?.[dest.rootPage]!==dest.root)return false;
      const nodes=dest.route.length?sideFolderNodes(state,{rootPage:dest.rootPage,route:dest.route}):[];
      if(!nodes||nodes.some((node,i)=>node.folder!==dest.nodes[i]))return false;
      const leaf=nodes[nodes.length-1];
      const row=leaf?(leaf.page===0?leaf.folder.children:leaf.folder.pages?.[leaf.page-1]):dest.root;
      if(row!==dest.row)return false;
      state.page=dest.rootPage;
      for(const node of nodes)node.folder.pageIndex=node.page;
      state.folderPath=dest.route.map(pair=>pair[0]);state.selected=null;
      observe(state);return true;
    }
    function returnPrevious(state,kind='history-back'){
      observe(state);
      if(kind==='profile-history'){
        if(!previousProfile||previousProfile===state.profileId||!switchProfile(state,previousProfile))return false;
        observe(state);return true;
      }
      if(kind==='folder-history'){
        const inside=!!current?.route.length,dest=inside?previousFolder:lastFolder;
        if(!dest||sameFolder(current,dest))return false;
        if(restore(state,dest))return true;
        if(inside)previousFolder=null;else lastFolder=null;
        return false;
      }
      if(!previous||!current||same(previous,current))return false;
      if(restore(state,previous))return true;
      previous=null;return false;
    }
    return {observe,returnPrevious};
  }
  function createSidePressTracker(){
    const pressed=new Map();
    return {
      input(index,gesture,hasHold,context,now){
        if(gesture==='down'){
          if(pressed.has(index))return null;
          pressed.set(index,{hasHold,context,at:now,fired:false});
          return hasHold?'wait':'down';
        }
        const entry=pressed.get(index);if(!entry)return null;
        if(gesture==='up')pressed.delete(index);
        if(!entry.hasHold||entry.fired||entry.context!==context)return null;
        if(gesture==='timeout'){
          if(now-entry.at<SIDE_HOLD_MS)return null;
          entry.fired=true;return 'hold';
        }
        if(gesture==='up')return now-entry.at>=SIDE_HOLD_MS?'hold':'down';
        return null;
      },
      has(index){return pressed.has(index);},
      invalidate(){for(const entry of pressed.values())entry.fired=true;},
      clear(){pressed.clear();}
    };
  }
  const WIDE_CHOICES=['clock','datetime','stats','knobs'];
  const DEFAULT_WIDE=['clock','datetime','stats'];
  function cleanWideDisplay(value){
    const selected=Array.isArray(value?.order)?value.order.filter(id=>WIDE_CHOICES.includes(id)):[];
    const order=[...new Set([...selected,...WIDE_CHOICES])];
    const enabled=Array.isArray(value?.enabled)?
      [...new Set(value.enabled.filter(id=>WIDE_CHOICES.includes(id)))]:[...DEFAULT_WIDE];
    if(!enabled.length)enabled.push('clock');
    const current=enabled.includes(value?.current)?value.current:order.find(id=>enabled.includes(id));
    return {order,enabled,current};
  }
  // Some layouts expose the right half of the double-width screen as slot 14.
  // Handle that slot only for the virtual wide-screen mode; leave all normal
  // physical key/action slot mapping unchanged.
  function isWideDisplayPress(event){
    // D200X input payload byte 0 is firmware state, not necessarily a
    // constant key kind. Only the reserved wide key index 13 (or its
    // unassigned right half 14) may advance this virtual display.
    const index=Number(event?.index);
    return (index===13||index===14) &&
      event?.knob!==true &&
      (event?.pressed===true||Number(event?.state)===1);
  }
  function cycleWideDisplay(state){
    const config=state.wideDisplay=cleanWideDisplay(state.wideDisplay);
    const modes=config.order.filter(id=>config.enabled.includes(id));
    config.current=modes[(modes.indexOf(config.current)+1)%modes.length];
    return config.current;
  }
  function blankPage(){return Array.from({length:19},()=>null);}
  function folderContents(action){
    if(!action||action.type!=='folder')return null;
    if(!Array.isArray(action.children))action.children=[];
    while(action.children.length<14)action.children.push(null);
    if(!Array.isArray(action.pages))action.pages=[];
    const current=Math.max(0,Math.min(action.pageIndex||0,action.pages.length));
    action.pageIndex=current;
    if(!current)return action.children;
    const page=action.pages[current-1];
    while(page.length<14)page.push(null);
    return page;
  }
  function folderPageCount(state){const folder=activeFolder(state);return folder?1+(folder.pages?.length||0):0;}
  function changeFolderPage(state,index){
    const folder=activeFolder(state);if(!folder)return false;
    const count=folderPageCount(state);
    folder.pageIndex=Math.max(0,Math.min(count-1,index));
    state.selected=null;return true;
  }
  // One index mapping for root/folder append, insert, move, duplicate and delete.
  // References denote the original destination, never the replacement at its old index.
  function editPageStructure(state,{op,index,to,folder=activeFolder(state),select=true}={}){
    if(!state||!Array.isArray(state.pages)||folder&&folder.type!=='folder')return false;
    const original=folder?[folder.children||[],...(folder.pages||[])]:state.pages;
    const count=original.length,current=folder?(folder.pageIndex||0):state.page;
    const indicatorTemplate=findIndicator(state),common=(state.indicatorCommon||indicatorTemplate)?indicatorCommon(state):null;
    if(!count)return false;
    const valid=i=>Number.isInteger(i)&&i>=0&&i<count;
    const order=Array.from({length:count},(_,i)=>({from:i}));
    let destination;
    if(op==='append'||op==='insert'||op==='duplicate'){
      if(count>=10)return false;
      if(op==='append'){destination=count;order.push({from:null});}
      else if(op==='insert'){
        if(!Number.isInteger(index)||index<0||index>count)return false;
        destination=index;order.splice(index,0,{from:null});
      }else{
        if(!valid(index))return false;
        destination=index+1;order.splice(destination,0,{from:index,duplicate:true});
      }
    }else if(op==='move'){
      if(!valid(index)||!valid(to)||index===to)return false;
      order.splice(to,0,order.splice(index,1)[0]);destination=to;
    }else if(op==='delete'){
      if(count<=1||!valid(index))return false;
      order.splice(index,1);destination=Math.min(index,count-2);
    }else return false;
    const destinations=new Map();
    order.forEach((entry,i)=>{if(entry.from!==null&&!entry.duplicate)destinations.set(entry.from,i);});
    const remap=value=>{
      const old=typeof value==='string'&&/^-?\d+$/.test(value)?Number(value):value;
      return valid(old)&&destinations.has(old)?destinations.get(old):-1;
    };
    const sameIndex=(value,mapped)=>Number.isInteger(value)?value===mapped:typeof value==='string'&&/^-?\d+$/.test(value)&&Number(value)===mapped;
    const update=(settings,key,mapped)=>sameIndex(settings[key],mapped)?settings:{...settings,[key]:mapped};
    // Absolute side-button routes must be repaired even when the edited folder
    // belongs to a different page (or is inherited from a pinned root slot).
    const absoluteRoute=settings=>{
      if(!folder)return update(settings,'rootPage',remap(settings.rootPage));
      if(!Number.isInteger(settings.rootPage)||!Array.isArray(settings.route))return settings;
      let row=state.pages[settings.rootPage];
      if(!row)return settings;
      for(const [depth,hop] of settings.route.entries()){
        if(!Array.isArray(hop)||hop.length!==2)break;
        const [slot,page]=hop,entry=row?.[slot]||(depth===0?state.pinned?.[slot]:null);
        if(entry?.type!=='folder')break;
        if(entry===folder){
          const mapped=remap(page);
          if(mapped<0)return update(settings,'rootPage',-1);
          if(mapped===page)return settings;
          const route=settings.route.map(x=>x.slice());route[depth][1]=mapped;
          return {...settings,route};
        }
        row=page===0?entry.children:entry.pages?.[page-1];
        if(!row)break;
      }
      return settings;
    };
    const mapArray=(list,fn)=>{
      if(!Array.isArray(list))return list;
      const result=list.map(fn);return result.some((x,i)=>x!==list[i])?result:list;
    };
    // Composite sub-actions share their containing deck's page namespace.
    // Do not traverse a nested folder for relative targets: it owns another list.
    const rewrite=(action,relative)=>{
      if(!action||typeof action!=='object'||action.kind==='delay')return action;
      let settings=action.settings||{};
      if(relative&&(action.type==='goto'||action.type==='side-nav'&&settings.navigation==='goto'))
        settings=update(settings,'page',remap(settings.page));
      if(action.type==='side-nav'&&settings.navigation==='folder-target')settings=absoluteRoute(settings);
      if(action.type==='indicator'&&relative){
        for(const [gesture,key] of [['down','indicatorDown'],['hold','indicatorHold']]){
          const config=indicatorConfig(action,gesture);
          if(config.navigation==='goto'){
            const mapped=remap(config.page);
            if(mapped!==config.page)settings={...settings,[key]:{...config,page:mapped}};
          }
        }
      }
      let next=settings!==action.settings&&action.settings?{...action,settings}:action;
      if(action.type==='folder')return next;
      const child=x=>rewrite(x,relative);
      const children=mapArray(action.children,child),sequences=mapArray(action.sequences,list=>mapArray(list,child));
      if(children!==action.children)next={...next,children};
      if(sequences!==action.sequences)next={...next,sequences};
      if(action.slots&&typeof action.slots==='object'){
        const slots={...action.slots};let changed=false;
        for(const key of ['single','double','hold'])if(Object.hasOwn(slots,key)){
          const value=child(slots[key]);if(value!==slots[key]){slots[key]=value;changed=true;}
        }
        if(changed)next={...next,slots};
      }
      return next;
    };
    const rows=order.map(entry=>{
      if(entry.from===null){const row=folder?Array(14).fill(null):blankPage();if(common?.autoAdd)placeIndicator(row,folder?null:state.pinned,indicatorTemplate);return row;}
      const row=mapArray(original[entry.from],action=>rewrite(action,true));
      // Duplicate action data, including nested folders; inherited pins stay shared.
      if(!entry.duplicate)return row;
      const duplicate=copy(row);if(common?.autoAdd)placeIndicator(duplicate,folder?null:state.pinned,indicatorTemplate);return duplicate;
    });
    const controls=state.controls;
    const rewriteBinding=binding=>{
      if(!binding)return binding;
      let next=binding;
      for(const key of ['down','sideHold','left','right','holdLeft','holdRight']){
        // Physical relative goto is context-dependent. Root edits preserve root
        // destinations; folder edits leave this shared numeric policy unchanged.
        const value=rewrite(binding[key],!folder);
        if(value!==binding[key])next={...next,[key]:value};
      }
      return next;
    };
    const emptyControlRow=()=>Array.from({length:5},emptyBinding);
    let nextControls=controls;
    if(controls||!folder){
      const source=controls||emptyControls(count);
      const global=mapArray(source.global,rewriteBinding);
      const pages=folder?mapArray(source.pages,row=>mapArray(row,rewriteBinding)):order.map(entry=>{
        if(entry.from===null)return emptyControlRow();
        const row=mapArray(source.pages?.[entry.from]||emptyControlRow(),rewriteBinding);
        return entry.duplicate?copy(row):row;
      });
      if(global!==source.global||pages!==source.pages||!controls)nextControls={...source,global,pages};
    }
    const pinned=folder?state.pinned:mapArray(state.pinned,action=>rewrite(action,true));
    if(folder){
      folder.children=rows[0];folder.pages=rows.slice(1);
      folder.pageIndex=select?destination:Math.max(0,remap(current));
    }else{
      state.pages=rows;
      state.page=select?destination:Math.max(0,remap(current));
      if(select)state.folderPath=[];
      state.pinned=pinned;
    }
    if(nextControls)state.controls=nextControls;
    if(common){
      if(!folder)for(const key of ['indicatorDown','indicatorHold'])if(common[key].navigation==='goto')common[key]={...common[key],page:remap(common[key].page)};
      state.indicatorCommon=common;
    }
    if(select)state.selected=null;
    return true;
  }
  function addFolderPage(state){
    const folder=activeFolder(state);return !!folder&&editPageStructure(state,{op:'append',folder});
  }
  function deleteFolderPage(state){
    const folder=activeFolder(state);return !!folder&&editPageStructure(state,{op:'delete',index:folder.pageIndex||0,folder});
  }
  function visibleActions(state){
    const actions=currentActions(state);
    if(!actions)return [];
    if((state.folderPath||[]).length)return actions;
    return actions.map((item,i)=>item||state.pinned?.[i]||null);
  }
  function indicatorRows(state,folder=activeFolder(state)){
    return folder?[folder.children||[],...(folder.pages||[])]:state.pages||[];
  }
  function findIndicator(state){
    const visit=rows=>{
      for(const row of rows)for(const item of (row||[]).slice(0,13)){
        if(item?.type==='indicator')return item;
        if(item?.type==='folder'){const found=visit([item.children,...(item.pages||[])]);if(found)return found;}
      }
      return null;
    };
    return state.pinned?.find(x=>x?.type==='indicator')||visit(state.pages||[]);
  }
  function indicatorCommon(state,item=null){
    const previous=state.indicatorCommon,source=item||findIndicator(state);
    const settings=previous||source?.settings||{};
    const pseudo={type:'indicator',settings};
    return {
      indicatorDown:indicatorConfig(pseudo,'down'),
      indicatorHold:indicatorConfig(pseudo,'hold'),
      indicatorNumberStyle:cleanTitleStyle(settings.indicatorNumberStyle,INDICATOR_NUMBER_STYLE),
      ...(settings.indicatorDownNumberStyle&&typeof settings.indicatorDownNumberStyle==='object'&&!Array.isArray(settings.indicatorDownNumberStyle)?{indicatorDownNumberStyle:cleanTitleStyle(settings.indicatorDownNumberStyle,cleanTitleStyle(settings.indicatorNumberStyle,INDICATOR_NUMBER_STYLE))}:{}),
      autoAdd:previous?previous.autoAdd===true:!!source
    };
  }
  function sharedIndicatorConfig(state,item,gesture='down'){
    if(item?.type!=='indicator')return {navigation:'none'};
    return indicatorConfig({type:'indicator',settings:indicatorCommon(state)},gesture);
  }
  function updateIndicatorCommon(state,item,patch){
    state.indicatorCommon=indicatorCommon({...state,indicatorCommon:{...indicatorCommon(state,item),...patch}});
    return state.indicatorCommon;
  }
  function placeIndicator(row,pins,template){
    if(row.slice(0,13).some(x=>x?.type==='indicator'))return 'existing';
    for(let i=0;i<13;i++)if(!row[i]&&!pins?.[i]){
      row[i]=copy(template||createAction('indicator'));return 'added';
    }
    return 'full';
  }
  function copyIndicatorDesign(target,source){
    // Retain the destination action/location and all non-appearance settings.
    target.title=source.title;
    target.titleStyle=copy(source.titleStyle||TITLE);
    if(source.icon)target.icon=copy(source.icon);else delete target.icon;
    target.settings??={};
    for(const key of ['keyPressIcons','keyBackgrounds','indicatorDownTitle','indicatorDownTitleStyle']){
      if(source.settings?.[key]!==undefined)target.settings[key]=copy(source.settings[key]);else delete target.settings[key];
    }
  }
  // A bare page-number key must remain readable even with a dark chosen
  // foreground. Preserve saved colors, explicit visibility and artwork.
  function indicatorNumberDisplayStyle(style,background,hasArtwork=false){
    if(style?.visible===false||hasArtwork)return style;
    const rgb=value=>/^#[0-9a-fA-F]{6}$/.test(value||'')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):null;
    const luminance=values=>values.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
      .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    const contrast=(a,b)=>(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    let base=rgb(background)||[8,9,12];
    if(style?.backgroundEnabled===true){
      const overlay=rgb(style.backgroundColor)||[0,0,0],alpha=Math.max(0,Math.min(100,style.backgroundOpacity??65))/100;
      base=base.map((v,i)=>v*(1-alpha)+overlay[i]*alpha);
    }
    const bg=luminance(base),foreground=luminance(rgb(style?.color)||[255,255,255]);
    if(contrast(bg,foreground)>=3)return style;
    const outline=style?.outlineWidth&&style.outlineWidth!=='none'&&rgb(style.outlineColor);
    if(outline&&contrast(bg,luminance(outline))>=3)return style;
    const outlineColor=contrast(bg,1)>=contrast(bg,0)?'#ffffff':'#000000';
    return {...(style||INDICATOR_NUMBER_STYLE),outlineColor,outlineWidth:'medium'};
  }
  function manageIndicators(state,op,item=null,folder=activeFolder(state)){
    const rows=indicatorRows(state,folder),pins=folder?null:state.pinned;
    const result={added:0,existing:0,full:0,removed:0};
    if(op==='add'){
      updateIndicatorCommon(state,item,{autoAdd:true});
      for(const row of rows)result[placeIndicator(row,pins,item)]++;
    }else if(op==='design'){
      result.updated=0;
      if(item?.type!=='indicator')return result;
      const design=copy(item);
      for(const row of rows)for(let i=0;i<13;i++)if(row[i]?.type==='indicator'){
        if(row[i]!==item)copyIndicatorDesign(row[i],design);
        result.updated++;
      }
    }else if(op==='remove'){
      updateIndicatorCommon(state,item,{autoAdd:false});
      for(const row of rows)for(let i=0;i<13;i++)if(row[i]?.type==='indicator'){row[i]=null;result.removed++;}
    }
    return result;
  }
  function migrateIndicators(state,value){
    const first=findIndicator(state);
    if(value?.indicatorCommon||first)state.indicatorCommon=indicatorCommon({...state,indicatorCommon:value?.indicatorCommon||null},first);
    // Legacy pins are materialized in the exact slots where they used to show.
    // Never overwrite a page-local item; don't manufacture additional indicators.
    for(let i=0;i<13;i++){
      const pin=state.pinned?.[i];
      if(pin?.type!=='indicator')continue;
      for(const row of state.pages)if(!row[i])row[i]=copy(pin);
      state.pinned[i]=null;
    }
  }
  function indicatorPinState(state,index){
    if(state.folderPath?.length||!Number.isInteger(index)||index<0||index>=13)return {checked:false,blocked:true};
    const local=state.pages?.[state.page]?.[index],pinned=state.pinned?.[index];
    const shared=pinned?.type==='indicator'&&(!local||local.type==='indicator'&&JSON.stringify(local)===JSON.stringify(pinned));
    return {checked:!!shared,blocked:!!pinned&&!shared};
  }
  function setIndicatorPinned(state,index,enabled){
    const info=indicatorPinState(state,index),row=state.pages?.[state.page];
    if(info.blocked||!row)return false;
    const item=row[index]||state.pinned?.[index];
    if(item?.type!=='indicator')return false;
    if(!Array.isArray(state.pinned))state.pinned=Array(14).fill(null);
    if(enabled){
      // Canonical shared indicator, never overwrite another occupied page slot.
      state.pinned[index]=copy(item);row[index]=null;
    }else if(info.checked){
      if(!row[index])row[index]=copy(item);
      state.pinned[index]=null;
    }
    return true;
  }
  function togglePinned(state,index){
    if((state.folderPath||[]).length||!Number.isInteger(index)||index<0||index>=14)return false;
    if(!Array.isArray(state.pinned))state.pinned=Array.from({length:14},()=>null);
    if(visibleActions(state)[index]?.type==='indicator')return false;
    if(state.pinned[index]){state.pinned[index]=null;return true;}
    const item=state.pages?.[state.page]?.[index];
    if(!item)return false;
    state.pinned[index]=cleanAction(item);
    return true;
  }
  function currentActions(state){
    let actions=state.pages?.[state.page];
    if(!actions)return null;
    for(const [depth,index] of (state.folderPath||[]).entries()){
      actions=folderContents(actions[index]||(depth===0?state.pinned?.[index]:null));
      if(!actions)return null;
    }
    return actions;
  }
  function activeFolder(state){
    let actions=state.pages?.[state.page],folder=null;
    for(const [depth,index] of (state.folderPath||[]).entries()){
      folder=actions?.[index]||(depth===0?state.pinned?.[index]:null);
      if(folder?.type!=='folder')return null;
      actions=folderContents(folder);
    }
    return folder;
  }
  function enterFolder(state,index){
    if(!Number.isInteger(index)||index<0||index>=14||(state.folderPath||[]).length>=8)return false;
    const action=visibleActions(state)?.[index];
    if(action?.type!=='folder')return false;
    state.folderPath=[...(state.folderPath||[]),index];state.selected=null;
    return true;
  }
  function exitFolder(state){
    if(!(state.folderPath||[]).length)return false;
    state.folderPath.pop();state.selected=null;return true;
  }

  function migrateState(value){
    const state={pages:[blankPage()],page:0,selected:null,controls:emptyControls(1),folderPath:[],pinned:Array.from({length:14},()=>null),wideDisplay:cleanWideDisplay(value?.wideDisplay)};
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
    state.pinned=Array.from({length:14},(_,i)=>cleanAction(value.pinned?.[i]));
    migrateIndicators(state,value);
    state.folderPath=[];
    if(Array.isArray(value.folderPath)){
      for(const entry of value.folderPath.slice(0,8)){
        if(!Number.isInteger(entry)||entry<0||entry>=14||visibleActions(state)?.[entry]?.type!=='folder')break;
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
      folderPath:copy(state.folderPath||[]),pinned:copy(state.pinned||Array(14).fill(null)),wideDisplay:cleanWideDisplay(state.wideDisplay),...(state.indicatorCommon?{indicatorCommon:copy(state.indicatorCommon)}:{})};
  }
  function initProfiles(state,value){
    const source=Array.isArray(value?.profileNames)?value.profileNames:null;
    state.profileNames=source?source.slice(0,50).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string')
      .map(p=>({id:p.id.slice(0,40),name:p.name.slice(0,80),
        appPath:typeof p.appPath==='string'&&p.appPath.length<=1024?p.appPath:'',
        smartEnabled:p.smartEnabled===true||(p.smartEnabled===undefined&&value?.smartProfilesEnabled===true&&!!p.appPath)})):[];
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
    state.smartProfilesEnabled=value?.smartProfilesEnabled===true;
    initProfileTemplates(state,value);
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
    if(clean.indicatorCommon)state.indicatorCommon=clean.indicatorCommon;else delete state.indicatorCommon;
    state.folderPath=clean.folderPath;state.pinned=clean.pinned;state.wideDisplay=cleanWideDisplay(next.wideDisplay);state.selected=null;state.profileId=id;
    return true;
  }
  function createProfile(state,name,duplicate=false,sourceId=state.profileId){
    if((state.profileNames||[]).length>=50)return null;
    const label=String(name||'새 프로필').trim().slice(0,80)||'새 프로필';
    let id;
    do{id='profile-'+(++state.profileSeq);}while(state.profileNames.some(p=>p.id===id));
    state.profileNames.push({id,name:label,appPath:'',smartEnabled:false});
    const original=sourceId===state.profileId?profileSnapshot(state):state.inactiveProfiles.find(p=>p.id===sourceId);
    const source=duplicate&&original?profileSnapshot(original):profileSnapshot(migrateState(null));
    state.inactiveProfiles.push({id,...source});
    return id;
  }
  function renameProfile(state,id,name){
    const record=state.profileNames?.find(p=>p.id===id);
    if(!record||!String(name||'').trim())return false;
    record.name=String(name).trim().slice(0,80);return true;
  }
  function exportSingleProfile(state,id){
    const profile=state?.profileNames?.find(p=>p.id===id);
    if(!profile)throw Error('내보낼 프로필을 찾지 못했습니다.');
    const snapshot=id===state.profileId?profileSnapshot(state):
      state.inactiveProfiles?.find(p=>p.id===id);
    if(!snapshot||!Array.isArray(snapshot.pages)||!snapshot.pages.length)
      throw Error('프로필의 페이지 데이터를 찾지 못했습니다.');
    const data={
      format:'d200x-single-profile-v1',
      profile:{id:profile.id,name:profile.name,appPath:profile.appPath||'',
        smartEnabled:profile.smartEnabled===true},
      snapshot:profileSnapshot(snapshot)
    };
    return data;
  }
  // Independent, local whole-profile snapshots. Reuse never activates a profile.
  const TEMPLATE_LIMIT=50;
  function templateName(value){
    if(typeof value!=='string'||!value.trim()||value.trim().length>80||/[\x00-\x1f\x7f]/.test(value))throw Error('이름은 1~80자로 입력하세요.');
    return value.trim();
  }
  function sameName(a,b){return a.trim().toLowerCase()===b.trim().toLowerCase();}
  function templateSnapshot(value){
    if(!value||!Array.isArray(value.pages)||value.pages.length<1||value.pages.length>128||
      value.pages.some(row=>!Array.isArray(row)||row.length>19)||!value.controls||!Array.isArray(value.pinned))
      throw Error('템플릿 프로필 데이터가 올바르지 않습니다.');
    const snapshot=profileSnapshot(value);
    snapshot.page=0;snapshot.folderPath=[];
    return snapshot;
  }
  function initProfileTemplates(state,value){
    const list=value?.profileTemplates;
    if(list===undefined){state.profileTemplates=[];state.profileTemplateSeq=0;return;}
    if(!Array.isArray(list)||list.length>TEMPLATE_LIMIT)throw Error('템플릿 목록을 읽을 수 없습니다.');
    const ids=new Set(),names=new Set();
    state.profileTemplates=list.map(t=>{
      if(!t||typeof t.id!=='string'||!/^template-[1-9]\d{0,14}$/.test(t.id)||ids.has(t.id))throw Error('템플릿 식별자가 올바르지 않습니다.');
      const name=templateName(t.name),key=name.toLowerCase();
      if(names.has(key))throw Error('중복된 템플릿 이름입니다.');
      ids.add(t.id);names.add(key);
      return {id:t.id,name,snapshot:templateSnapshot(t.snapshot)};
    });
    const maximum=Math.max(0,...state.profileTemplates.map(t=>Number(t.id.slice(9))));
    state.profileTemplateSeq=Math.max(maximum,Number.isSafeInteger(value.profileTemplateSeq)&&value.profileTemplateSeq>=0?value.profileTemplateSeq:0);
  }
  function templateFork(state){
    return {...state,profileNames:state.profileNames.slice(),inactiveProfiles:state.inactiveProfiles.slice(),profileTemplates:(state.profileTemplates||[]).slice()};
  }
  function getTemplate(state,id){
    const t=state.profileTemplates?.find(x=>x.id===id);
    if(!t)throw Error('템플릿을 찾지 못했습니다.');
    return t;
  }
  function findProfileTemplate(state,name){
    const label=templateName(name),t=state.profileTemplates?.find(x=>sameName(x.name,label));
    if(!t)throw Error('해당 템플릿이 없습니다.');
    return t;
  }
  function saveProfileTemplate(state,sourceId,name){
    const label=templateName(name),list=state.profileTemplates||[];
    if(list.length>=TEMPLATE_LIMIT)throw Error('템플릿은 최대 50개입니다.');
    if(list.some(t=>sameName(t.name,label)))throw Error('같은 이름의 템플릿이 이미 있습니다.');
    const snapshot=templateSnapshot(exportSingleProfile(state,sourceId).snapshot),next=templateFork(state);
    const seq=(Number.isSafeInteger(state.profileTemplateSeq)?state.profileTemplateSeq:0)+1;
    if(!Number.isSafeInteger(seq)||seq>999999999999999)throw Error('템플릿 식별자 한도에 도달했습니다.');
    const id='template-'+seq;
    if(list.some(t=>t.id===id))throw Error('템플릿 식별자가 중복되었습니다.');
    const template={id,name:label,snapshot};
    next.profileTemplateSeq=seq;next.profileTemplates.push(template);
    return {next,template};
  }
  function renameProfileTemplate(state,id,name){
    const old=getTemplate(state,id),label=templateName(name);
    if(state.profileTemplates.some(t=>t.id!==id&&sameName(t.name,label)))throw Error('같은 이름의 템플릿이 이미 있습니다.');
    const next=templateFork(state);
    next.profileTemplates=next.profileTemplates.map(t=>t.id===id?{...old,name:label}:t);
    return next;
  }
  function deleteProfileTemplate(state,id){
    getTemplate(state,id);
    const next=templateFork(state);
    next.profileTemplates=next.profileTemplates.filter(t=>t.id!==id);
    return next;
  }
  function applyProfileTemplate(state,id,name){
    const template=getTemplate(state,id),label=templateName(name);
    if(state.profileNames.some(p=>sameName(p.name,label)))throw Error('같은 이름의 프로필이 이미 있습니다.');
    const clean=profileSnapshot(migrateState(templateSnapshot(template.snapshot)));
    // Preserve explicit linked profile IDs as ordinary duplication does.
    const next=templateFork(state),createdProfileId=createProfile(next,label);
    if(!createdProfileId)throw Error('프로필은 최대 50개입니다.');
    next.inactiveProfiles[next.inactiveProfiles.findIndex(p=>p.id===createdProfileId)]={id:createdProfileId,...clean,page:0,folderPath:[]};
    return {next,createdProfileId,template};
  }
  function setProfileApp(state,id,appPath){
    const profile=state.profileNames?.find(p=>p.id===id);
    if(!profile||typeof appPath!=='string'||appPath.length>1024)return false;
    if(appPath&&(!/^[A-Za-z]:/.test(appPath)||appPath.charCodeAt(2)!==92||!appPath.toLowerCase().endsWith('.exe')))return false;
    profile.appPath=appPath;return true;
  }
  function matchForegroundProfile(state,appPath){
    if(!state?.smartProfilesEnabled||typeof appPath!=='string'||!appPath)return null;
    const normalized=appPath.replaceAll('/',String.fromCharCode(92)).toLowerCase();
    return state.profileNames.find(p=>p.smartEnabled&&p.appPath&&p.appPath.replaceAll('/',String.fromCharCode(92)).toLowerCase()===normalized)?.id||null;
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
    const state=knob?({down:1,left:2,right:3,'hold-left':4,'hold-right':5})[gesture]:(gesture==='down'?1:null);
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
      return ({0:'up',1:'down',2:'left',3:'right',4:'hold-left',5:'hold-right'})[Number(event.state)]||null;
    }
    if(Number(event.kind)!==1)return null;
    return event.pressed===true?'down':event.pressed===false?'up':null;
  }
  // Alias both wide halves ONLY for the unoccupied reserved folder-back key.
  function folderWideBackEvent(state,event){
    if(!(state?.folderPath||[]).length||currentActions(state)?.[13]||!isWideDisplayPress(event))return event;
    return {...event,index:13,kind:1,state:1,pressed:true};
  }
  function resolveHardwareEvent(state,event){
    if(!state||!Array.isArray(state.pages)||!Number.isInteger(state.page))return null;
    event=folderWideBackEvent(state,event);
    const index=physicalSlot(event),gesture=hardwareGesture(event);
    if(index===null||!gesture)return null;
    const knob=index>=16;
    const binding=index>=14?controlBinding(state,index):null;
    const action=index<14?visibleActions(state)?.[index]:knob?activeControlAction(binding,gesture):(binding?.down||null);
    return {index,gesture,knob,binding,
      action:action&&validId(action.type)?action:null};
  }
  // Runtime state belongs to a configured action location, not merely a slot.
  // Profile-global controls and pinned root keys deliberately share across pages.
  function runtimeActionKey(state,index,gesture='down'){
    const profile=state.profileId;
    if(index>=14){
      const scope=state.controls?.scopes?.[index-14]==='global'?'global':state.page;
      return JSON.stringify([profile,'control',scope,index,gesture]);
    }
    const path=state.folderPath||[];
    if(!path.length&&!state.pages?.[state.page]?.[index]&&state.pinned?.[index])
      return JSON.stringify([profile,'pinned',index,gesture]);
    let row=state.pages?.[state.page],route=[],root=state.page;
    for(const [depth,slot] of path.entries()){
      const local=row?.[slot],folder=local||(depth===0?state.pinned?.[slot]:null);
      if(folder?.type!=='folder')break;
      if(depth===0&&!local)root='pinned';
      const fp=folder.pageIndex||0;route.push([slot,fp]);
      row=fp===0?folder.children:folder.pages?.[fp-1];
    }
    return JSON.stringify([profile,'key',root,route,index,gesture]);
  }
  function resolveKeyPress(state,event){
    const resolved=resolveHardwareEvent(state,event);
    return resolved?.gesture==='down'&&resolved.action?{index:resolved.index,action:resolved.action}:null;
  }
  function planAdjustment(target,direction,step,page,pageCount,includeCount=false){
    const count=[1,2,5,10].includes(step)?step:1;
    if(target==='profile')return {kind:'profile',profile:direction<0?'previous':'next'};
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
    const folder=activeFolder(state);
    const page=folder?(folder.pageIndex||0):state.page;
    const pageCount=folder?folderPageCount(state):state.pages.length;
    if(index===14||index===15){
      const outcome=gesture==='down'?planSideNavigation(state,index):null;
      return outcome?{index,gesture,outcome}:null;
    }
    if(binding && knob){
      if(gesture==='hold-left'||gesture==='hold-right'){
        if(binding.heldEnabled===true){
          if(binding.heldMode==='trigger'){
            const action=resolved.action;
            if(action)return {index,gesture,outcome:planAction(action,page,pageCount)};
            if(!binding.heldAutoAssign)return null;
            const direction=(gesture==='hold-left'?-1:1)*(binding.heldReverseDirection?-1:1);
            return {index,gesture,outcome:planAdjustment(binding.heldTarget,direction,binding.heldStep,page,pageCount)};
          }
          const target=binding.heldMode==='stack'
            ?binding.heldStack[Math.abs(activeStack)%binding.heldStack.length]:binding.heldTarget;
          const direction=(gesture==='hold-left'?-1:1)*(binding.heldReverseDirection?-1:1);
          return {index,gesture,outcome:planAdjustment(target,direction,binding.heldStep,page,pageCount)};
        }
        const action=resolved.action;
        return action?{index,gesture,outcome:planAction(action,page,pageCount)}:null;
      }
      if(binding.heldEnabled===true&&gesture==='down')return null;
      if(binding.mode==='adjust'||binding.mode==='stack'){
        if(gesture==='down'){
          if(binding.mode==='stack')return {index,gesture,outcome:{kind:'stack-next',size:binding.stack.length}};
          if(resolved.action)return {index,gesture,outcome:planAction(resolved.action,page,pageCount)};
          return null;
        }
        if(gesture!=='left'&&gesture!=='right')return null;
        const target=binding.mode==='stack'
          ? binding.stack[Math.abs(activeStack)%binding.stack.length]:binding.target;
        if(!ADJUST_TARGETS.includes(target))return null;
        const direction=(gesture==='left'?-1:1)*(binding.reverseDirection?-1:1);
        const step=[1,2,5,10].includes(binding.step)?binding.step:1;
        return {index,gesture,outcome:planAdjustment(target,direction,step,page,pageCount)};
      }
      if(gesture==='left'||gesture==='right'){
        const action=resolved.action;
        if(action)return {index,gesture,outcome:planAction(action,page,pageCount)};
        if(binding.mode==='trigger'&&binding.autoAssign){
          const direction=(gesture==='left'?-1:1)*(binding.reverseDirection?-1:1);
          return {index,gesture,outcome:planAdjustment(binding.target,direction,binding.step,page,pageCount)};
        }
        return null;
      }
    }
    if(gesture!=='down')return null;
    // Reserve a back key in the last free folder slot. Legacy populated
    // slots never get overwritten. A physical side-key fallback follows.
    if((state.folderPath||[]).length && index===13 && !currentActions(state)?.[13])
      return {index,gesture,outcome:{kind:'folder-back'}};
    if(binding && !binding.down)return null;
    if(!resolved.action)return null;
    return {index,gesture,outcome:planAction(resolved.action,page,pageCount)};
  }
  function deletePage(state){return editPageStructure(state,{op:'delete',index:state?.page,folder:null});}
  function planAction(action,page,count){
    if(action?.type==='folder')return {kind:'folder-enter'};
    if(!action||!validId(action.type))return {kind:'unsupported',message:'알 수 없는 동작'};
    if(action.type==='sd-plugin')return {kind:'sd-plugin',pluginUUID:String(action.settings?.pluginUUID||''),actionUUID:String(action.settings?.actionUUID||'')};
    if(action.type==='ha-toggle')return {kind:'ha-toggle',entityId:String(action.settings?.entityId||'')};
    if(action.type==='system-mute')return {kind:'mute'};
    if(action.type==='sleep')return {kind:'device-sleep'};
    if(action.type==='indicator')return {kind:'display-only'};
    if(action.type==='profile')return {kind:'profile',profile:action.settings?.profile||'next'};
    if(action.type==='multi')return {kind:'composite',type:'multi'};
    if(action.type==='multi-switch')return {kind:'composite',type:'multi-switch'};
    if(action.type==='random')return {kind:'composite',type:'random'};
    if(action.type==='logic')return {kind:'composite',type:'logic'};
    if(action.type==='brightness'){
      const mode=action.settings?.mode||'up';
      const fixed={max:100,high:75,medium:50,low:30,min:20};
      if(Object.hasOwn(fixed,mode))return {kind:'device-brightness-set',value:fixed[mode]};
      return {kind:'device-brightness',direction:mode==='down'?-1:1,count:5};
    }
    if(action.type==='media')return {kind:'media-control',operation:action.settings?.op||'playpause'};
    if(action.type==='timer')return {kind:'timer',seconds:timerSeconds(action.settings?.seconds)};
    if(action.type==='audio-play')return {kind:'audio-play',
      file:String(action.settings?.file||''),mode:action.settings?.mode||'play-stop',
      volume:Math.max(0,Math.min(100,Number(action.settings?.volume)||0)),
      fade:['none','in','out','in-out'].includes(action.settings?.fade)?action.settings.fade:'none',
      fadeDuration:[1,2,3,4,5].includes(Number(action.settings?.fadeDuration))?Number(action.settings.fadeDuration):2,
      output:typeof action.settings?.output==='string'?action.settings.output:'default'};
    if(action.type==='audio-stop')return {kind:'audio-stop'};
    if(action.type==='text')return {kind:'type-text',text:String(action.settings?.body||''),
      enter:action.settings?.enter===true,mode:action.settings?.mode==='typing'?'typing':'clipboard'};
    if(action.type==='hotkey')return {kind:'windows-hotkey',keys:String(action.settings?.keys||'')};
    if(action.type==='hotkey-switch')return {kind:'windows-hotkey-switch',
      first:String(action.settings?.first||''),second:String(action.settings?.second||'')};
    if(action.type==='terminal'||action.type==='terminal-admin')return {kind:'open-terminal',admin:action.type==='terminal-admin',foreground:action.settings?.foreground!==false,preventDuplicate:action.settings?.preventDuplicate!==false};
    if(action.type==='open')return {kind:'open-local-path',path:String(action.settings?.path||''),target:'auto',...(action.settings?.args?{args:String(action.settings.args)}:{})};
    if(action.type==='open-app'&&String(action.settings?.app||'').startsWith('shell:AppsFolder\\'))
      return {kind:'open-local-path',path:String(action.settings.app),target:'appid',foreground:action.settings?.foreground===true,preventDuplicate:action.settings?.preventDuplicate===true,hold:action.settings?.hold||'none'};
    if(action.type==='open-app')return {kind:'open-local-path',path:String(action.settings?.app||''),...(action.settings?.args?{args:String(action.settings.args)}:{}),target:'file',
      foreground:action.settings?.foreground===true,preventDuplicate:action.settings?.preventDuplicate===true,hold:action.settings?.hold||'none'};
    if(action.type==='close')return {kind:'close-local-app',path:String(action.settings?.path||''),force:action.settings?.force===true};
    if(action.type==='file-open'||action.type==='folder-shortcut')
      return {kind:'open-local-path',path:typeof action.settings?.path==='string'?action.settings.path:'',
        target:action.type==='file-open'?'file':'folder',
        ...(action.type==='folder-shortcut'?{...(action.settings?.alwaysNewWindow===true?{alwaysNewWindow:true}:{}),...(action.settings?.foreground===false?{foreground:false}:{})}:{})};
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
      url:action.settings?.url||'',mode:action.settings?.open||'default',browserPath:action.settings?.browserPath||''};
    return {kind:'unsupported',message:'이 동작의 실행 기능은 아직 구현되지 않았습니다.'};
  }
  return {ACTION_IDS,D200X_ACTION_IDS,PLUGIN_ACTION_IDS,DEFAULTS,TITLE,INDICATOR_NUMBER_STYLE,INDICATOR_NAV_LABELS,indicatorConfig,indicatorCommon,sharedIndicatorConfig,updateIndicatorCommon,manageIndicators,indicatorNumberDisplayStyle,planIndicatorNavigation,indicatorPinState,setIndicatorPinned,SIDE_NAV_LABELS,SIDE_HOLD_MS,sideConfig,makeSideAction,sideActionConfig,sideFolderTargets,planSideNavigation,applySideNavigation,createPageVisitTracker,createSidePressTracker,createAction,cleanAction,cleanCompositeEntry,timerSeconds,formatTimerTime,displaySwitchAction,compositeModel,planComposite,runComposite,createMultiPauseGate,multiRows,setMultiRows,blankPage,cleanWideDisplay,cycleWideDisplay,isWideDisplayPress,folderContents,folderPageCount,changeFolderPage,addFolderPage,deleteFolderPage,editPageStructure,currentActions,visibleActions,togglePinned,activeFolder,enterFolder,exitFolder,migrateState,profileSnapshot,switchProfile,createProfile,renameProfile,exportSingleProfile,findProfileTemplate,saveProfileTemplate,renameProfileTemplate,deleteProfileTemplate,applyProfileTemplate,setProfileApp,matchForegroundProfile,deleteProfile,previewHardwareEvent,physicalSlot,hardwareGesture,resolveHardwareEvent,runtimeActionKey,folderWideBackEvent,resolveKeyPress,planHardwareEvent,deletePage,planAction,emptyBinding,cleanBinding,controlAction,activeControlAction,assignControlAction,automaticControl,ensureControls,controlBinding,changeControlScope};
});
