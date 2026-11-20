'use strict';
// Advanced planning is pure. Only touched branches are copied, preserving existing SDK identities.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../deck-core.js'),require('../hotkey-keys.js'),require('./edit-plan.js'));
  else root.DeckForgeAiAdvanced=factory(root.DeckCore,root.DeckHotkeys,root.DeckForgeAiPlan);
})(globalThis,(Core,Hotkeys,Basic)=>{
  const KINDS=['folder_keys','folder_page','folder_settings','control','wide','composite','state_design','plugin','fusion_batch'];
  const TOOL={type:'function',name:'propose_advanced',strict:true,description:'Stage ONE advanced preview, never save. Active profile, page 1-based (null=current), folder route "2:1/3:2" means slot:folder-page (null=root; folder kinds require route); slot 1–13 except control 1–5 (side first/back, knobs 1–3). configJson is JSON object string: folder_keys {keys:[{slot,op:"put"|"update"|"delete",type?,value?,title?}]} max8; folder_page {}; folder_settings {title?,autoExitEnabled?,autoExitSeconds?}; control {scope?:"global"|"page",mode?:"trigger"|"stack",target?,step?:1|2|5|10,reverse?,stack?:[targets],heldEnabled?,heldMode?,heldTarget?,heldStep?,heldReverse?,heldStack?,gesture?:"down"|"left"|"right"|"holdLeft"|"holdRight"|"sideHold",action?:{type,value,title}|null}; targets page/profile/volume/zoom/scroll/scroll-x/history/window/desktop/brightness. Side slots 1–2 accept only scope and down/sideHold with previous,next,goto or null; use editor for other navigation. wide {enabled:[clock|datetime|stats|knobs],order?:[all four],current?}. composite {type:"multi"|"multi-switch"|"random"|"logic",title?,steps?:[{type,value,title}],second?:[steps],single?:step,double?:step,hold?:step}; delay type value milliseconds string. state_design {first?:{title?,enabled?,size?,color?,bold?,background?,iconName?,iconPack?},second?:same}. plugin {kind:"ha"|"sdk-ha"|"fusion"|"fusion-live",id,title?}; ha verify REST entity; sdk-ha/fusion reuse verified registered template from inspect plugin_templates; fusion-live creates new button using exact ID from inspect fusion_commands, revalidated locally against current Fusion and installed SDK. fusion_batch {keys:[{page,slot,id,title?}]} 1–13 new Fusion buttons in existing active-profile root pages, page/slot required per key; outer page,folder,slot must all be null. All slots must be distinct, empty and not pinned; all IDs verified in one fresh local list; no page creation. For simple steps use hotkey,previous,next,indicator,goto,clipboard-edit,media,system-mute,explorer-open; folder_keys also folder/open-app/file-open/folder-shortcut (verified Start Apps AppID or user-supplied local path). No paths or arbitrary settings. Existing protected actions cannot be deleted/replaced. One operation kind per proposal; user applies locally.',parameters:{type:'object',properties:{kind:{type:'string',enum:KINDS},page:{type:['integer','null']},folder:{type:['string','null']},slot:{type:['integer','null']},configJson:{type:'string'}},required:['kind','page','folder','slot','configJson'],additionalProperties:false}};
  const fail=m=>{throw Error(m);}, clone=x=>JSON.parse(JSON.stringify(x)), has=(x,k)=>Object.hasOwn(x,k);
  const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x), int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  const str=(v,n=120)=>typeof v==='string'&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
  const fusionId=id=>typeof id==='string'&&/^[A-Za-z0-9._-]{1,180}$/.test(id)&&id!=='.'&&id!=='..';
  const color=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v);
  const bool=v=>typeof v==='boolean';
  const TARGETS=['page','profile','volume','zoom','scroll','scroll-x','history','window','desktop','brightness'];
  const WIDE=['clock','datetime','stats','knobs'];
  const PATH_TYPES=['open-app','file-open','folder-shortcut'];
  const SIMPLE=['hotkey','previous','next','indicator','goto','clipboard-edit','media','system-mute','explorer-open'];
  const exact=(o,allowed)=>{if(!obj(o)||Object.keys(o).some(k=>!allowed.includes(k)))fail('고급 변경안에 지원하지 않는 항목이 있습니다.');};
  const optional=(o,k,check)=>{if(has(o,k)&&!check(o[k]))fail('고급 변경 값이 올바르지 않습니다: '+k);};
  const uniqueList=(v,choices,min,max)=>Array.isArray(v)&&int(v.length,min,max)&&v.every(x=>choices.includes(x))&&new Set(v).size===v.length;
  function stepSpec(x,delay=false,folder=false){
    exact(x,['type','value','title']);
    if(![...SIMPLE,...(delay?['delay']:[]),...(folder?['folder',...PATH_TYPES]:[])].includes(x.type))fail('지원하는 기본 동작만 지정하세요.');
    optional(x,'value',v=>v===null||str(v,folder?1024:80));optional(x,'title',v=>str(v,80));
    if(x.type==='delay'){if(!/^\d{1,6}$/.test(x.value||'')||!int(Number(x.value),0,600000))fail('지연은 0~600000ms입니다.');}
    return x;
  }
  function validate(raw){
    exact(raw,['kind','page','folder','slot','configJson']);
    if(Object.keys(raw).length!==5||!KINDS.includes(raw.kind)||raw.page!==null&&!int(raw.page,1,128)||raw.slot!==null&&!int(raw.slot,1,13)||raw.folder!==null&&(typeof raw.folder!=='string'||!/^(?:[1-9]|1[0-3]):(?:[1-9]|10)(?:\/(?:[1-9]|1[0-3]):(?:[1-9]|10)){0,7}$/.test(raw.folder))||typeof raw.configJson!=='string'||raw.configJson.length>12000)fail('고급 변경안 형식 오류');
    let c;try{c=JSON.parse(raw.configJson);}catch{fail('고급 변경안 JSON 오류');}
    if(!obj(c))fail('고급 변경안 설정 오류');
    if(raw.kind.startsWith('folder_')&&!raw.folder)fail('덱폴더 경로를 지정하세요.');
    if(['control','wide'].includes(raw.kind)&&raw.folder!==null)fail('물리 컨트롤은 일반 페이지에서 설정하세요.');
    if(['folder_keys','folder_page','folder_settings','wide'].includes(raw.kind)&&raw.slot!==null)fail('이 작업에는 슬롯 번호가 필요하지 않습니다.');
    if(['composite','state_design','plugin'].includes(raw.kind)&&raw.slot===null)fail('버튼 번호를 지정하세요.');
    switch(raw.kind){
      case 'folder_keys':
        exact(c,['keys']);if(!Array.isArray(c.keys)||!int(c.keys.length,1,8))fail('폴더 버튼 작업은 최대 8개입니다.');
        {const seen=new Set();for(const x of c.keys){exact(x,['slot','op','type','value','title']);if(!int(x.slot,1,13)||seen.has(x.slot)||!['put','update','delete'].includes(x.op))fail('폴더 버튼 번호 또는 작업 오류');seen.add(x.slot);if(x.op==='put')stepSpec(Object.fromEntries(Object.entries(x).filter(([k])=>!['op','slot'].includes(k))),false,true);else {if(has(x,'type')||x.op==='delete'&&Object.keys(x).length!==2)fail('폴더 수정 형식 오류');optional(x,'value',v=>v===null||str(v,1024));optional(x,'title',v=>str(v,80));}}}
        break;
      case 'folder_page':exact(c,[]);break;
      case 'folder_settings':exact(c,['title','autoExitEnabled','autoExitSeconds']);optional(c,'title',v=>str(v,80));optional(c,'autoExitEnabled',bool);optional(c,'autoExitSeconds',v=>int(v,0,60));break;
      case 'control':
        if(!int(raw.slot,1,5))fail('물리 컨트롤은 1~5번입니다.');
        exact(c,['scope','mode','target','step','reverse','stack','heldEnabled','heldMode','heldTarget','heldStep','heldReverse','heldStack','gesture','action']);
        optional(c,'scope',v=>['global','page'].includes(v));for(const k of ['mode','heldMode'])optional(c,k,v=>['trigger','stack'].includes(v));
        for(const k of ['target','heldTarget'])optional(c,k,v=>TARGETS.includes(v));
        for(const k of ['step','heldStep'])optional(c,k,v=>[1,2,5,10].includes(v));
        for(const k of ['reverse','heldReverse','heldEnabled'])optional(c,k,bool);
        for(const k of ['stack','heldStack'])optional(c,k,v=>uniqueList(v,TARGETS,1,3));
        optional(c,'gesture',v=>['down','left','right','holdLeft','holdRight','sideHold'].includes(v));
        if(has(c,'action')!==has(c,'gesture'))fail('동작과 입력 종류를 함께 지정하세요.');
        if(c.action!=null)stepSpec(c.action);
        if(raw.slot<3&&(Object.keys(c).some(k=>!['scope','gesture','action'].includes(k))||has(c,'gesture')&&!['down','sideHold'].includes(c.gesture)||c.action&&!['previous','next','goto'].includes(c.action.type)))fail('측면 단추 AI 변경안은 짧게/길게 누르기의 페이지 이동만 지원합니다.');
        if(raw.slot>=3&&c.gesture==='sideHold')fail('노브는 기존 회전 입력을 사용합니다.');
        break;
      case 'wide':
        exact(c,['enabled','order','current']);if(!uniqueList(c.enabled,WIDE,1,4))fail('와이드 표시 모드 1~4개를 지정하세요.');
        optional(c,'order',v=>uniqueList(v,WIDE,4,4));optional(c,'current',v=>c.enabled.includes(v));break;
      case 'composite':
        exact(c,['type','title','steps','second','single','double','hold']);if(!['multi','multi-switch','random','logic'].includes(c.type))fail('복합 동작 종류 오류');
        optional(c,'title',v=>str(v,80));
        if(c.type==='logic'){if(has(c,'steps')||has(c,'second'))fail('Key Logic 입력 형식 오류');for(const k of ['single','double','hold'])if(has(c,k)&&c[k]!==null)stepSpec(c[k]);if(!['single','double','hold'].some(k=>c[k]))fail('Key Logic 동작이 필요합니다.');}
        else {if(['single','double','hold'].some(k=>has(c,k))||c.type!=='multi-switch'&&has(c,'second'))fail('복합 동작 단계 형식 오류');for(const k of c.type==='multi-switch'?['steps','second']:['steps']){if(!Array.isArray(c[k])||!int(c[k].length,1,8))fail('복합 단계는 상태별 1~8개입니다.');for(const x of c[k])stepSpec(x,c.type!=='random');}}
        break;
      case 'state_design':
        exact(c,['first','second']);for(const k of ['first','second'])if(has(c,k)){
          const v=c[k];exact(v,['title','enabled','size','color','bold','background','iconName','iconPack']);optional(v,'title',x=>str(x,80));optional(v,'enabled',bool);optional(v,'size',x=>int(x,8,48));optional(v,'color',color);optional(v,'bold',bool);optional(v,'background',x=>x===null||color(x));optional(v,'iconName',x=>str(x)&&x.trim().length>0);optional(v,'iconPack',x=>str(x)&&x.trim().length>0);if(has(v,'iconPack')&&!v.iconName)fail('아이콘 이름이 필요합니다.');
        }break;
      case 'fusion_batch':
        if(raw.page!==null||raw.folder!==null||raw.slot!==null)fail('일괄 등록은 각 버튼의 페이지와 슬롯을 지정하세요.');
        exact(c,['keys']);if(!Array.isArray(c.keys)||!int(c.keys.length,1,13))fail('Fusion 일괄 등록은 1~13개입니다.');
        {const seen=new Set();for(const x of c.keys){exact(x,['page','slot','id','title']);if(!int(x.page,1,128)||!int(x.slot,1,13)||seen.has(x.page+':'+x.slot))fail('일괄 등록 페이지 또는 버튼 번호 오류');seen.add(x.page+':'+x.slot);if(!fusionId(x.id))fail('정확한 Fusion 명령 ID를 지정하세요.');optional(x,'title',v=>str(v,80));}}
        break;
      case 'plugin':
        exact(c,['kind','id','title']);if(!['ha','sdk-ha','fusion','fusion-live'].includes(c.kind)||!str(c.id,256)||!c.id.trim())fail('플러그인 식별자를 지정하세요.');
        if(c.kind==='fusion-live'&&!fusionId(c.id))fail('정확한 Fusion 명령 ID를 지정하세요.');
        if(['ha','sdk-ha'].includes(c.kind)&&!/^(light|switch|fan|input_boolean)\.[a-z0-9_]+$/.test(c.id))fail('지원하지 않는 HA 엔티티입니다.');
        optional(c,'title',v=>str(v,80));break;
    }
    if(raw.kind!=='folder_page'&&!Object.keys(c).length)fail('변경 값이 필요합니다.');
    return {kind:raw.kind,page:raw.page,folder:raw.folder,slot:raw.slot,configJson:JSON.stringify(c)};
  }
  function walkTemplates(state){
    const result=[],seen=new Set(),profiles=[state,...(state.inactiveProfiles||[]).slice(0,50)];let count=0;
    function visit(a,d){
      if(!a||d>8||++count>50000)return;
      if(a.type==='sd-plugin'){
        const s=a.settings||{},p=s.pluginSettings||{};
        const kind=s.pluginUUID==='com.autodesk.fusionstreamdeck'&&s.actionUUID===s.pluginUUID+'.runcommand'?'fusion':s.pluginUUID==='de.perdoctus.streamdeck.homeassistant'&&s.actionUUID===s.pluginUUID+'.dual-state-entity'?'sdk-ha':null;
        const id=kind==='fusion'?p.commandId:kind==='sdk-ha'?p.display?.entityId:null;
        if(kind&&str(id,256)&&id&& !seen.has(kind+'\0'+id)){seen.add(kind+'\0'+id);result.push({kind,id,name:str(a.title,120)&&a.title?a.title:(str(p.name,120)?p.name:id),action:a});}
      }
      if(a.type==='folder'){for(const x of a.children||[])visit(x,d+1);for(const row of a.pages||[])for(const x of row||[])visit(x,d+1);}
    }
    for(const p of profiles){for(const row of p.pages||[])for(const a of row.slice(0,14))visit(a,0);for(const a of p.pinned||[])visit(a,0);
      for(const row of [p.controls?.global,...(p.controls?.pages||[])])for(const b of row||[])for(const k of ['down','left','right','holdLeft','holdRight'])visit(b?.[k],0);}
    return result;
  }
  const summary=a=>!a?'비어 있음':a.type==='side-nav'?Core.SIDE_NAV_LABELS[Core.sideConfig(a).navigation]:a.kind==='delay'?'지연 '+a.ms+'ms':[a.title||a.type,a.type,a.type==='hotkey'?a.settings?.keys:a.type==='goto'?'페이지 '+(a.settings?.page+1):a.type==='open-app'?a.settings?.app:PATH_TYPES.includes(a.type)?a.settings?.path:undefined,a.settings?.operation,a.settings?.op].filter(Boolean).join(' · ');
  function simple(spec,pageCount,target=null){
    if(spec.type==='delay')return {kind:'delay',ms:Number(spec.value)};
    const a=Core.createAction(spec.type),v=spec.value??null,s=a.settings;
    if(spec.type==='hotkey'){const k=Hotkeys.canonical(v);if(!k)fail('지원하지 않는 단축키입니다.');s.keys=k;s.source='custom';}
    else if(PATH_TYPES.includes(spec.type)){
      if(!target||target.type!==spec.type||target.requested!==v||!target.path)fail('로컬 대상 확인이 필요합니다.');
      if(spec.type==='open-app'){s.app=target.path;s.args='';s.hold='none';s.foreground=true;s.preventDuplicate=true;}else s.path=target.path;
      if(target.icon){a.icon=target.icon;s.autoAppIcon=true;}
    }
    else if(spec.type==='goto'){if(!/^[1-9]\d{0,2}$/.test(v||'')||Number(v)>pageCount)fail('이동할 페이지가 없습니다.');s.page=Number(v)-1;}
    else if(spec.type==='media'){if(!['playpause','next','previous','stop','mute','up','down'].includes(v))fail('미디어 동작 오류');s.op=v;}
    else if(spec.type==='clipboard-edit'){if(!['copy','paste','cut'].includes(v))fail('클립보드 동작 오류');s.operation=v;}
    else if(v!==null)fail('이 동작에는 값이 필요하지 않습니다.');
    a.title=spec.title??target?.name??(spec.type==='hotkey'?s.keys:spec.type==='folder'?'폴더':spec.type);
    if(a.type==='folder'){a.children=Array(14).fill(null);a.pages=[];a.pageIndex=0;}
    return a;
  }
  function protectedBasic(a){return a&&(![...SIMPLE,...PATH_TYPES].includes(a.type)||a.settings?.stateTitles||a.settings?.keyPressIcons||a.settings?.sdkStateIcons||a.settings?.keyBackgrounds);}
  function fusionButton(c,live){
    if(live?.id!==c.id||!str(live.name,120)||!live.name.trim())fail('현재 Fusion 명령을 확인하지 못했습니다.');
    const item=Core.createAction('sd-plugin');
    item.title=has(c,'title')?c.title:live.name.slice(0,30);
    item.settings.pluginUUID='com.autodesk.fusionstreamdeck';
    item.settings.actionUUID='com.autodesk.fusionstreamdeck.runcommand';
    item.settings.actionName='Fusion 명령 실행';
    item.settings.pluginSettings={commandId:c.id,name:live.name};
    return item;
  }
  function makeFusionBatch(state,c,resources){
    const next={...state,pages:state.pages.slice()},rows=[],copied=new Set();
    const live=new Map((Array.isArray(resources.fusionBatch)?resources.fusionBatch:[]).map(x=>[x?.id,x]));
    for(const x of c.keys){
      const pi=x.page-1,i=x.slot-1,old=state.pages[pi];
      if(!Array.isArray(old))fail('대상 페이지가 없습니다.');
      if(state.pinned?.[i])fail('고정 또는 예약 버튼은 변경할 수 없습니다.');
      if(old[i])fail('대상 버튼이 비어 있지 않습니다.');
      const item=fusionButton(x,live.get(x.id));
      if(!copied.has(pi)){next.pages[pi]=old.slice();copied.add(pi);}
      next.pages[pi][i]=item;
      rows.push({op:'plugin',page:x.page,slot:x.slot,folder:null,before:{title:'비어 있음'},after:{title:summary(item)+' · fusion-live · '+x.id+' · 실시간 확인한 명령 신규 등록'}});
    }
    return {next,rows,profile:state.profileNames?.find(p=>p.id===state.profileId)?.name||'기본 프로필'};
  }
  function makePlan(state,raw,resources={}){
    const a=validate(raw),c=JSON.parse(a.configJson);
    if(!Array.isArray(state?.pages)||!state.pages.length)fail('프로필이 없습니다.');
    if(a.kind==='fusion_batch')return makeFusionBatch(state,c,resources);
    const pi=(a.page??state.page+1)-1;
    if(!state.pages[pi])fail('대상 페이지가 없습니다.');
    const next={...state,pages:state.pages.slice()},rows=[];
    let row=next.pages[pi]=state.pages[pi].slice(),folder=null;
    const route=a.folder?a.folder.split('/').map(x=>x.split(':').map(Number)):[];
    for(const [depth,[slot,fp]] of route.entries()){
      if(depth===0&&state.pinned?.[slot-1])fail('고정 폴더는 편집하지 않습니다.');
      const old=row[slot-1];if(old?.type!=='folder')fail('덱폴더 경로를 찾지 못했습니다.');
      folder={...old,settings:{...old.settings},children:(old.children||[]).slice(),pages:(old.pages||[]).slice()};row[slot-1]=folder;
      if(fp===1){row=folder.children;while(row.length<14)row.push(null);}
      else {if(!Array.isArray(folder.pages[fp-2]))fail('덱폴더 페이지가 없습니다.');row=folder.pages[fp-2]=folder.pages[fp-2].slice();}
    }
    const add=(op,before,after,slot=a.slot,extra={})=>rows.push({op,page:pi+1,slot,folder:a.folder,before:{title:before},after:{title:after},...extra});
    const checkSlot=slot=>{if(!int(slot,1,13)||!a.folder&&state.pinned?.[slot-1])fail('고정 또는 예약 버튼은 변경할 수 없습니다.');return slot-1;};
    if(a.kind==='folder_keys'){
      const count=1+folder.pages.length;
      for(const [n,x] of c.keys.entries()){
        const target=resources.targets?.[n];
        const i=checkSlot(x.slot),old=row[i]||null;let item;
        if(x.op==='put'){if(old)fail('대상 버튼이 비어 있지 않습니다.');item=simple(x,count,target);}
        else {if(!old||protectedBasic(old))fail('기존 복합 동작 폴더 플러그인 또는 상태 디자인은 보호됩니다.');if(x.op==='delete')item=null;else{
          item=clone(old);if(has(x,'value')){const updated=simple({type:old.type,value:x.value},count,target);item.settings={...item.settings,...updated.settings};if(updated.icon)item.icon=updated.icon;else if(PATH_TYPES.includes(old.type)&&item.settings.autoAppIcon){delete item.icon;delete item.settings.autoAppIcon;}}
          if(has(x,'title')){item.title=x.title;delete item.settings.autoAppTitle;}
        }}
        row[i]=item;add(x.op,summary(old),summary(item),x.slot);
      }
    }else if(a.kind==='folder_page'){
      if(folder.pages.length>=9)fail('덱폴더는 최대 10페이지입니다.');
      if(!Core.editPageStructure(next,{op:'append',folder,select:false}))fail('덱폴더 페이지를 추가할 수 없습니다.');
      add('folder_page','폴더 '+folder.pages.length+'페이지','폴더 '+(folder.pages.length+1)+'페이지');
    }else if(a.kind==='folder_settings'){
      const before={title:folder.title,autoExitEnabled:!!folder.settings.autoExitEnabled,autoExitSeconds:folder.settings.autoExitSeconds||0};
      if(has(c,'title'))folder.title=c.title;
      for(const k of ['autoExitEnabled','autoExitSeconds'])if(has(c,k))folder.settings[k]=c[k];
      const fmt=x=>x.title+' · 자동 닫기 '+(x.autoExitEnabled?'켜짐 '+x.autoExitSeconds+'초':'꺼짐');
      add('folder_settings',fmt(before),fmt({...folder.settings,title:folder.title}));
    }else if(a.kind==='wide'){
      next.wideDisplay=Core.cleanWideDisplay({order:c.order||state.wideDisplay?.order,enabled:c.enabled,current:c.current||state.wideDisplay?.current});
      const fmt=x=>'표시 '+(x?.enabled||[]).join(', ')+' · 순서 '+(x?.order||[]).join(', ')+' · 현재 '+x?.current;
      add('wide',fmt(state.wideDisplay),fmt(next.wideDisplay));
    }else if(a.kind==='control'){
      const index=a.slot-1,orig=state.controls;
      if(!orig?.global?.[index]||!orig.pages?.[pi]?.[index])fail('물리 컨트롤 설정이 없습니다.');
      const controls=next.controls={...orig,scopes:orig.scopes.slice(),global:orig.global.slice(),pages:orig.pages.slice()};
      controls.pages[pi]=orig.pages[pi].slice();
      const beforeScope=orig.scopes[index],scope=c.scope||beforeScope;
      const old=(beforeScope==='global'?orig.global:orig.pages[pi])[index];
      let b=(scope==='global'?orig.global:orig.pages[pi])[index];
      if(scope!==beforeScope&&(scope==='global'||(!b.down&&!b.sideHold&&!b.left&&!b.right&&!b.holdLeft&&!b.holdRight&&b.mode==='trigger')))b=old;
      b={...b,inactiveRotations:(b.inactiveRotations||[]).slice(),stack:(b.stack||[]).slice(),heldStack:(b.heldStack||[]).slice()};
      controls.scopes[index]=scope;(scope==='global'?controls.global:controls.pages[pi])[index]=b;
      for(const [k,v] of Object.entries(c)){
        if(['scope','gesture','action'].includes(k))continue;
        const target=({reverse:'reverseDirection',heldReverse:'heldReverseDirection'})[k]||k;b[target]=v;
        if(['mode','target'].includes(k)&&b.mode==='trigger')b.autoAssign=true;
        if(['heldMode','heldTarget'].includes(k)&&b.heldMode==='trigger')b.heldAutoAssign=true;
      }
      // Explicit auto target disables old rotation overrides without deleting them.
      if(has(c,'target')&&b.mode==='trigger')Core.automaticControl(b);
      if(has(c,'heldTarget')&&b.heldMode==='trigger')Core.automaticControl(b,true);
      if(has(c,'gesture')){
        const g=c.gesture,held=g.startsWith('hold'),mode=held?b.heldMode:b.mode;
        if(index>=2&&(mode==='stack'||held&&!b.heldEnabled||g==='down'&&b.heldEnabled))fail('현재 컨트롤 설정에서 이 입력은 비활성입니다.');
        if(b[g]?.type!=='side-nav'&&protectedBasic(b[g]))fail('기존 플러그인 복합 또는 상태별 동작을 보호합니다.');
        if(index<2)b[g]=c.action===null?(g==='down'?Core.makeSideAction({navigation:'none'}):null):simple(c.action,next.pages.length);
        else Core.assignControlAction(b,g,c.action===null?null:simple(c.action,next.pages.length));
      }
      const fmt=(x,sc)=>JSON.stringify({scope:sc,mode:x.mode,target:x.target,step:x.step,reverse:x.reverseDirection,autoAssign:x.autoAssign,stack:x.stack,heldEnabled:x.heldEnabled,heldMode:x.heldMode,heldTarget:x.heldTarget,heldStep:x.heldStep,heldReverse:x.heldReverseDirection,heldStack:x.heldStack,inactiveRotations:x.inactiveRotations,actions:Object.fromEntries(['down','sideHold','left','right','holdLeft','holdRight'].map(k=>[k,summary(x[k])]))});
      add('control',fmt(old,beforeScope),fmt(b,scope),null,{control:['측면 첫 페이지','측면 뒤로','노브 1','노브 2','노브 3'][index]});
    }else{
      const i=checkSlot(a.slot),old=row[i]||null;
      if(a.kind==='composite'){
        if(old)fail('복합 동작은 빈 버튼에 등록하세요. 기존 복합 동작은 보존합니다.');
        const item=Core.createAction(c.type);item.title=c.title||c.type;const count=folder?folder.pages.length+1:next.pages.length;
        if(c.type==='logic')item.slots=Object.fromEntries(['single','double','hold'].map(k=>[k,c[k]?simple(c[k],count):null]));
        else if(c.type==='multi-switch')item.sequences=[c.steps.map(x=>simple(x,count)),c.second.map(x=>simple(x,count))];
        else item.children=c.steps.map(x=>simple(x,count));
        row[i]=item;
        const detail=item.slots?Object.entries(item.slots).map(([k,v])=>k+': '+summary(v)).join('\n'):item.sequences?item.sequences.map((v,j)=>'상태 '+(j+1)+': '+v.map(summary).join(' → ')).join('\n'):item.children.map(summary).join(' → ');
        add('composite',summary(old),summary(item)+'\n'+detail);
      }else if(a.kind==='plugin'){
        if(old)fail('플러그인은 빈 버튼에 등록하세요.');
        let item;
        if(c.kind==='ha'){
          if(resources.ha?.id!==c.id)fail('HA 엔티티를 확인하지 못했습니다.');
          item=Core.createAction('ha-toggle');item.settings.entityId=c.id;item.title=c.title||resources.ha.name||c.id;
        }else if(c.kind==='fusion-live'){
          item=fusionButton(c,resources.fusionLive);
        }else{
          const found=walkTemplates(state).find(x=>x.kind===c.kind&&x.id===c.id);
          if(!found||resources.template?.kind!==c.kind||resources.template?.id!==c.id)fail('설치된 플러그인과 등록된 명령 또는 장치 설정을 확인하세요.');
          item=clone(found.action);if(has(c,'title'))item.title=c.title;
          // Explicit state titles may otherwise hide the new label.
          if(has(c,'title')&&item.settings.stateTitles?.first)item.settings.stateTitles.first.title=c.title;
        }
        row[i]=item;add('plugin',summary(old),summary(item)+' · '+c.kind+' · '+c.id+(c.kind==='fusion-live'?' · 실시간 확인한 명령 신규 등록':c.kind!=='ha'?' · 기존 검증된 등록 설정 복제':''));
      }else{
        if(!old||old.type!=='sd-plugin'&&['ha-toggle','indicator','multi-switch','hotkey-switch','timer','logic','sleep','virtual','wide-display','folder-back'].includes(old.type))fail('이 동작은 상태별 제목 아이콘을 지원하지 않습니다.');
        const item={...old,settings:{...old.settings}},s=item.settings;
        const momentary=old.type!=='sd-plugin'||old.settings?.pluginUUID==='com.autodesk.fusionstreamdeck'&&String(old.settings.actionUUID||'').startsWith('com.autodesk.fusionstreamdeck.');
        const iconField=momentary?'keyPressIcons':'sdkStateIcons',names=momentary?['up','down']:['off','on'];
        s.stateTitles={first:{enabled:item.titleStyle?.visible!==false,title:item.title||'',style:{...Core.TITLE,...item.titleStyle}},second:{enabled:false,title:item.title||'',style:{...Core.TITLE,...item.titleStyle}},...clone(s.stateTitles||{})};
        s[iconField]={...s[iconField]};s.keyBackgrounds={...s.keyBackgrounds};
        for(const [j,k] of ['first','second'].entries()){
          if(!has(c,k))continue;
          const v=c[k],entry=s.stateTitles[k],before=clone(entry),oldIcon=s[iconField][names[j]],oldBg=s.keyBackgrounds[k];
          for(const field of ['title','enabled'])if(has(v,field))entry[field]=v[field];
          entry.style={...Core.TITLE,...entry.style};
          for(const field of ['size','color','bold'])if(has(v,field))entry.style[field]=v[field];
          if(has(v,'background'))s.keyBackgrounds[k]={enabled:v.background!==null,color:v.background||'#08090c'};
          if(v.iconName){const icon=resources.icons?.[k];if(!icon||icon.name!==v.iconName||!icon.data)fail('상태 아이콘 이름을 정확하게 지정하세요.');s[iconField][names[j]]=icon.data;}
          const fmt=(t,ic,bg)=>JSON.stringify({title:t.title,enabled:t.enabled,size:t.style?.size,color:t.style?.color,bold:t.style?.bold,background:bg?.enabled?bg.color:'없음',icon:ic?'등록 이미지':'기본'});
          add('state_design',fmt(before,oldIcon,oldBg),fmt(entry,s[iconField][names[j]],s.keyBackgrounds[k]),a.slot,{state:names[j],...(v.iconName?{icon:resources.icons[k].pack+' / '+v.iconName,previewImage:resources.icons[k].data.value}: {})});
        }
        row[i]=item;
      }
    }
    if(!rows.length||JSON.stringify(state)===JSON.stringify(next))fail('변경 사항이 없습니다.');
    return {next,rows,profile:state.profileNames?.find(p=>p.id===state.profileId)?.name||'기본 프로필'};
  }
  function folderTargetTypes(state,raw){
    const a=validate(raw);if(a.kind!=='folder_keys')return [];
    let row=state.pages[(a.page??state.page+1)-1];
    for(const pair of a.folder.split('/')){
      const [s,p]=pair.split(':').map(Number),folder=row?.[s-1];
      if(folder?.type!=='folder')fail('덱폴더 경로를 찾지 못했습니다.');
      row=p===1?folder.children:folder.pages?.[p-2];
    }
    if(!Array.isArray(row))fail('덱폴더 페이지가 없습니다.');
    return JSON.parse(a.configJson).keys.map(x=>x.op==='put'?x.type:x.op==='update'?row[x.slot-1]?.type||null:null);
  }
  return {TOOL,validate,makePlan,walkTemplates,folderTargetTypes};
});
