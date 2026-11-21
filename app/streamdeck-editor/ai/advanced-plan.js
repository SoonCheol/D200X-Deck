'use strict';
// Advanced planning is pure. Only touched branches are copied, preserving existing SDK identities.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../deck-core.js'),require('../hotkey-keys.js'),require('./edit-plan.js'));
  else root.DeckForgeAiAdvanced=factory(root.DeckCore,root.DeckHotkeys,root.DeckForgeAiPlan);
})(globalThis,(Core,Hotkeys,Basic)=>{
  const KINDS=['page_structure','folder_keys','folder_page','folder_settings','control','wide','composite','state_design','plugin','fusion_batch','profile_build','template_save','template_apply'];
  const TOOL={type:'function',name:'propose_advanced',strict:true,description:'Stage ONE advanced preview, never save. Except profile_build and template_save/template_apply, active profile, page 1-based (null=current), folder route "2:1/3:2" means slot:folder-page (null=root; folder kinds require route); slot 1–13 except control 1–5 (side first/back, knobs 1–3). configJson is JSON object string: folder_keys {keys:[{slot,op:"put"|"update"|"delete",type?,value?,title?}]} max8; folder_page {}; page_structure {op:"append"|"insert"|"move"|"duplicate"|"delete",index?:one-based page number,to?:one-based destination}; page=null and folder=null for root, for folder supply root page and exact existing folder route; insert index means BEFORE that page (count+1 allowed), move to is final position, delete removes that page and its contents after explicit user apply. slot=null. folder_settings {title?,autoExitEnabled?,autoExitSeconds?}; control {scope?:"global"|"page",mode?:"trigger"|"stack",target?,step?:1|2|5|10,reverse?,stack?:[targets],heldEnabled?,heldMode?,heldTarget?,heldStep?,heldReverse?,heldStack?,gesture?:"down"|"left"|"right"|"holdLeft"|"holdRight"|"sideHold",action?:{type,value,title}|null}; targets page/profile/volume/zoom/scroll/scroll-x/history/window/desktop/brightness. Side slots 1–2 accept only scope and down/sideHold with previous,next,goto or null; use editor for other navigation. wide {enabled:[clock|datetime|stats|knobs],order?:[all four],current?}. composite {type:"multi"|"multi-switch"|"random"|"logic",title?,steps?:[{type,value,title}],second?:[steps],single?:step,double?:step,hold?:step}; delay type value milliseconds string. state_design {first?:{title?,enabled?,size?,color?,bold?,background?,iconName?,iconPack?},second?:same}. plugin {kind:"ha"|"sdk-ha"|"fusion"|"fusion-live",id,title?}; ha verify REST entity; sdk-ha/fusion reuse verified registered template from inspect plugin_templates; fusion-live creates new button using exact ID from inspect fusion_commands, revalidated locally against current Fusion and installed SDK. fusion_batch {keys:[{page,slot,id,title?}]} 1–13 new Fusion buttons in existing active-profile root pages, page/slot required per key; outer page,folder,slot must all be null. All slots must be distinct, empty and not pinned; all IDs verified in one fresh local list; no page creation. profile_build creates ONE NEW inactive profile, never overwrites current profiles. Outer page,folder,slot all null; configJson {name,pageCount,keys:[{page,slot,type,value?,title?,folder?,pageCount?}],controls?:[{slot,page?,config?,actions?:[{gesture,action}]}],wide?:{enabled,order?,current?}}. Root pageCount 1–10; up to 40 ordinary keys total; at least one key, control or wide setting. Each key page is root page; folder null/root or route "2:1/3:2" (parent slot:folder page); type folder creates folder with pageCount 1–10 (default 1), maximum depth 8. Parent folder must be declared in keys; child goto is relative to its folder. Fusion-live and verified paths work at every level. Controls slot 1–2=side first/back (down/sideHold previous,next,goto only), 3–5=knobs. Omit page or null for global; integer for page scope (one scope per slot, one entry per slot/page). config uses control fields except scope/gesture/action; actions lists explicit gestures with basic action or null. target/heldTarget for auto rotation, mode/heldMode stack for stack; heldEnabled true disables down, do not combine automatic and explicit rotation of same mode. Wide is per profile, uses existing wide settings. fusion-live requires exact verified command ID; other types same basic actions as folder_keys. Local paths/AppIDs verified as usual. Preview all pages and keys in one transaction. Do not query existing empty slots for a new profile. template_save saves a local snapshot of an existing profile after approval; outer page/folder/slot null, configJson {name,sourceProfile?} (sourceProfile exact existing name, omit for active profile). template_apply creates a NEW inactive profile from an exact stored template name; outer page/folder/slot null, configJson {template,name} (name is new profile name). Use inspect user_templates if template name unknown; never overwrite. Template contents stay local, explicit linked profile IDs and action settings are retained; no execution. Template rename/delete are UI-only. For simple steps use hotkey,previous,next,indicator,goto,clipboard-edit,media,system-mute,explorer-open; folder_keys also folder/open-app/file-open/folder-shortcut (verified Start Apps AppID or user-supplied local path). No paths or arbitrary settings. Existing protected actions cannot be deleted/replaced. One operation kind per proposal; user applies locally.',parameters:{type:'object',properties:{kind:{type:'string',enum:KINDS},page:{type:['integer','null']},folder:{type:['string','null']},slot:{type:['integer','null']},configJson:{type:'string'}},required:['kind','page','folder','slot','configJson'],additionalProperties:false}};
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
  function profileControl(c,pageCount){
    exact(c,['slot','page','config','actions']);
    if(!int(c.slot,1,5)||c.page!=null&&!int(c.page,1,pageCount))fail('새 프로필 물리 컨트롤 위치 오류');
    const cfg=has(c,'config')?c.config:{}, actions=has(c,'actions')?c.actions:[];
    exact(cfg,['mode','target','step','reverse','stack','heldEnabled','heldMode','heldTarget','heldStep','heldReverse','heldStack']);
    if(!Array.isArray(actions)||actions.length>5||!Object.keys(cfg).length&&!actions.length)fail('물리 컨트롤 설정 또는 동작이 필요합니다.');
    const scope=c.page==null?'global':'page';
    const check=values=>validate({kind:'control',page:c.page??1,folder:null,slot:c.slot,configJson:JSON.stringify({scope,...values})});
    check(cfg);
    const seen=new Set();
    for(const entry of actions){
      exact(entry,['gesture','action']);
      if(!has(entry,'action')||!has(entry,'gesture')||seen.has(entry.gesture))fail('물리 컨트롤 입력 중복 또는 형식 오류');
      seen.add(entry.gesture);check(entry);
    }
    if(c.slot>=3){
      const held=cfg.heldEnabled===true;
      if(!held&&(Object.keys(cfg).some(k=>k.startsWith('held')&&k!=='heldEnabled')||seen.has('holdLeft')||seen.has('holdRight')))fail('누른 채 회전은 먼저 활성화하세요.');
      if(held&&seen.has('down'))fail('누른 채 회전과 단독 누르기는 동시에 사용할 수 없습니다.');
      if(cfg.mode==='stack'&&(has(cfg,'target')||['down','left','right'].some(k=>seen.has(k)))||cfg.heldMode==='stack'&&(has(cfg,'heldTarget')||['holdLeft','holdRight'].some(k=>seen.has(k))))fail('스택 모드와 개별 입력을 동시에 지정할 수 없습니다.');
      if(has(cfg,'stack')&&cfg.mode!=='stack'||has(cfg,'heldStack')&&cfg.heldMode!=='stack')fail('스택 모드를 함께 지정하세요.');
      if(has(cfg,'target')&&(seen.has('left')||seen.has('right'))||has(cfg,'heldTarget')&&(seen.has('holdLeft')||seen.has('holdRight')))fail('자동 회전과 개별 회전 동작을 동시에 지정할 수 없습니다.');
    }
    return {scope,cfg,actions};
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
      case 'page_structure':
        if(raw.slot!==null||!raw.folder&&raw.page!==null)fail('루트 페이지 구조 작업은 page·folder·slot을 null로 지정하세요.');
        exact(c,['op','index','to']);
        if(!['append','insert','move','duplicate','delete'].includes(c.op))fail('페이지 작업 종류 오류');
        if(c.op==='append'?(has(c,'index')||has(c,'to')):(!int(c.index,1,129)||c.op==='move'&&!int(c.to,1,128)||c.op!=='move'&&has(c,'to')))fail('페이지 번호 형식 오류');
        break;
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
      case 'template_save':
      case 'template_apply':
        if(raw.page!==null||raw.folder!==null||raw.slot!==null)fail('템플릿 작업은 page·folder·slot을 null로 지정하세요.');
        exact(c,raw.kind==='template_save'?['name','sourceProfile']:['name','template']);
        if(!str(c.name,80)||!c.name.trim())fail('이름을 입력하세요.');
        if(raw.kind==='template_save')optional(c,'sourceProfile',v=>str(v,80)&&!!v.trim());
        else if(!str(c.template,80)||!c.template.trim())fail('정확한 템플릿 이름을 지정하세요.');
        break;
      case 'profile_build':
        if(raw.page!==null||raw.folder!==null||raw.slot!==null)fail('새 프로필 구성은 page·folder·slot을 null로 지정하세요.');
        exact(c,['name','pageCount','keys','controls','wide']);
        if(!str(c.name,80)||!c.name.trim()||!int(c.pageCount,1,10)||!Array.isArray(c.keys)||!int(c.keys.length,0,40))fail('새 프로필 이름, 1~10페이지, 최대 40개 버튼을 지정하세요.');
        {const seen=new Set();for(const x of c.keys){
          exact(x,['page','slot','type','value','title','folder','pageCount']);
          const route=x.folder??null;
          if(route!==null&&(typeof route!=='string'||!/^(?:[1-9]|1[0-3]):(?:[1-9]|10)(?:\/(?:[1-9]|1[0-3]):(?:[1-9]|10)){0,7}$/.test(route)))fail('새 프로필 덱폴더 경로 오류');
          const key=x.page+':'+(route||'')+':'+x.slot;
          if(!int(x.page,1,c.pageCount)||!int(x.slot,1,13)||seen.has(key))fail('새 프로필의 페이지 또는 버튼 번호 오류');
          seen.add(key);
          if(x.type==='folder'){
            if(route&&route.split('/').length>=8)fail('덱폴더는 최대 8단계입니다.');
            optional(x,'pageCount',v=>int(v,1,10));
          }else if(has(x,'pageCount'))fail('덱폴더에만 내부 페이지 수를 지정할 수 있습니다.');
          if(x.type==='fusion-live'){if(!fusionId(x.value))fail('정확한 Fusion 명령 ID를 지정하세요.');optional(x,'title',v=>str(v,80));}
          else stepSpec(Object.fromEntries(Object.entries(x).filter(([k])=>!['page','slot','folder','pageCount'].includes(k))),false,true);
        }}
        if(has(c,'controls')){
          if(!Array.isArray(c.controls)||!int(c.controls.length,0,50))fail('물리 컨트롤 설정은 최대 50개입니다.');
          const scopes=new Map(),seen=new Set();
          for(const entry of c.controls){
            const {scope}=profileControl(entry,c.pageCount),key=entry.slot+':'+(entry.page??'global');
            if(seen.has(key)||scopes.has(entry.slot)&&scopes.get(entry.slot)!==scope)fail('물리 컨트롤 위치 중복 또는 전체/페이지 범위 충돌');
            seen.add(key);scopes.set(entry.slot,scope);
          }
        }
        if(has(c,'wide'))validate({kind:'wide',page:null,folder:null,slot:null,configJson:JSON.stringify(c.wide)});
        if(!c.keys.length&&!c.controls?.length&&!c.wide)fail('버튼 또는 물리 컨트롤 설정이 필요합니다.');
        break;
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
  function profileControlText(binding,scope,index){
    const labels={page:'페이지',profile:'프로필',volume:'음량',zoom:'확대/축소',scroll:'스크롤','scroll-x':'가로 스크롤',history:'실행 취소/다시 실행',window:'창 전환',desktop:'가상 데스크톱',brightness:'밝기'};
    const target=t=>labels[t]||t;
    const rotation=(held=false)=>{
      const mode=held?binding.heldMode:binding.mode,auto=held?binding.heldAutoAssign:binding.autoAssign;
      if(mode==='stack')return '스택 '+(held?binding.heldStack:binding.stack).map(target).join('/');
      if(auto)return target(held?binding.heldTarget:binding.target)+' · 단계 '+(held?binding.heldStep:binding.step)+((held?binding.heldReverseDirection:binding.reverseDirection)?' · 방향 반전':'');
      return '왼쪽 '+summary(binding[held?'holdLeft':'left'])+' / 오른쪽 '+summary(binding[held?'holdRight':'right']);
    };
    const prefix=scope==='global'?'전체 페이지':'페이지별';
    if(index<2)return prefix+' · 짧게 '+Core.SIDE_NAV_LABELS[Core.sideActionConfig(binding,index+14).navigation]+' · 길게 '+Core.SIDE_NAV_LABELS[Core.sideActionConfig(binding,index+14,'hold').navigation]+['down','sideHold'].filter(k=>binding[k]?.type==='goto').map(k=>' · '+(k==='down'?'짧게':'길게')+' '+summary(binding[k])).join('');
    return prefix+' · 회전 '+rotation()+(binding.heldEnabled?' · 누른 채 회전 '+rotation(true):binding.mode==='stack'?' · 누르기 스택 전환':' · 누르기 '+summary(binding.down));
  }
  function makeProfileBuild(state,c,resources){
    const name=c.name.trim();
    if(state.profileNames?.some(p=>p.name.trim().toLowerCase()===name.toLowerCase()))fail('같은 이름의 프로필이 이미 있습니다. 새로운 이름을 지정하세요.');
    const next={...state,profileNames:state.profileNames.slice(),inactiveProfiles:state.inactiveProfiles.slice()};
    const id=Core.createProfile(next,name);
    if(!id)fail('프로필은 최대 50개입니다.');
    const created=Core.migrateState({pages:Array.from({length:c.pageCount},()=>Core.blankPage())});
    const live=new Map((resources.fusionBatch||[]).map(x=>[x.id,x]));
    const rows=[{op:'profile_build',page:null,slot:null,folder:null,before:{title:'기존 프로필 유지'},after:{title:name+' · '+c.pageCount+'페이지 · 버튼 '+c.keys.length+'개 · 물리 컨트롤 '+(c.controls?.length||0)+'개 · 신규 프로필 생성 (현재 프로필 유지)'}}];
    // Parent folders are created before their descendants; resource indices
    // stay aligned with the original request, including verified local paths.
    const ordered=c.keys.map((x,i)=>({x,i,depth:x.folder?x.folder.split('/').length:0})).sort((a,b)=>a.depth-b.depth||a.i-b.i);
    for(const {x,i} of ordered){
      let row=created.pages[x.page-1],count=c.pageCount;
      for(const pair of (x.folder||'').split('/').filter(Boolean)){
        const [slot,fp]=pair.split(':').map(Number),folder=row?.[slot-1];
        if(folder?.type!=='folder')fail('새 프로필에 지정한 상위 덱폴더가 없습니다.');
        count=1+folder.pages.length;
        row=fp===1?folder.children:folder.pages[fp-2];
        if(!Array.isArray(row))fail('새 프로필의 덱폴더 페이지가 없습니다.');
      }
      const item=x.type==='fusion-live'?fusionButton({id:x.value,...(has(x,'title')?{title:x.title}:{})},live.get(x.value)):simple(x,count,resources.targets?.[i]);
      if(x.type==='folder')item.pages=Array.from({length:(x.pageCount??1)-1},()=>Array(14).fill(null));
      if(row[x.slot-1])fail('새 프로필의 버튼 위치가 중복되었습니다.');
      row[x.slot-1]=item;
      rows.push({op:x.type==='fusion-live'?'plugin':'put',page:x.page,slot:x.slot,folder:x.folder??null,before:{title:'비어 있음'},after:{title:summary(item)+(x.type==='fusion-live'?' · '+x.value:x.type==='folder'?' · '+(1+item.pages.length)+'페이지':'')}});
    }
    for(const entry of c.controls||[]){
      const {scope,cfg,actions}=profileControl(entry,c.pageCount),index=entry.slot-1;
      const binding=(scope==='global'?created.controls.global:created.controls.pages[entry.page-1])[index];
      created.controls.scopes[index]=scope;
      for(const [k,v] of Object.entries(cfg)){
        const key=({reverse:'reverseDirection',heldReverse:'heldReverseDirection'})[k]||k;
        binding[key]=v;
        if(['mode','target'].includes(k)&&binding.mode==='trigger')binding.autoAssign=true;
        if(['heldMode','heldTarget'].includes(k)&&binding.heldMode==='trigger')binding.heldAutoAssign=true;
      }
      if(has(cfg,'target')&&binding.mode==='trigger')Core.automaticControl(binding);
      if(has(cfg,'heldTarget')&&binding.heldMode==='trigger')Core.automaticControl(binding,true);
      if(actions.some(x=>['left','right'].includes(x.gesture)))binding.autoAssign=false;
      if(actions.some(x=>['holdLeft','holdRight'].includes(x.gesture)))binding.heldAutoAssign=false;
      for(const {gesture,action} of actions){
        const item=action===null?null:simple(action,c.pageCount);
        if(index<2)binding[gesture]=item??(gesture==='down'?Core.makeSideAction({navigation:'none'}):null);
        else Core.assignControlAction(binding,gesture,item);
      }
      rows.push({op:'control',page:entry.page??null,slot:null,folder:null,control:['측면 첫 페이지','측면 뒤로','노브 1','노브 2','노브 3'][index],before:{title:'기본 설정'},after:{title:profileControlText(binding,scope,index)}});
    }
    if(c.wide){
      created.wideDisplay=Core.cleanWideDisplay({order:c.wide.order||created.wideDisplay.order,enabled:c.wide.enabled,current:c.wide.current||created.wideDisplay.current});
      const labels={clock:'시계',datetime:'날짜/시간',stats:'시스템 정보',knobs:'노브 정보'},w=created.wideDisplay;
      rows.push({op:'wide',page:null,slot:null,folder:null,before:{title:'기본 설정'},after:{title:'표시 '+w.enabled.map(k=>labels[k]).join(', ')+' · 순서 '+w.order.filter(k=>w.enabled.includes(k)).map(k=>labels[k]).join(' → ')+' · 현재 '+labels[w.current]}});
    }
    // No changes to active pages, pinned keys, control bindings or other profile data.
    next.inactiveProfiles[next.inactiveProfiles.findIndex(x=>x.id===id)]={id,...Core.profileSnapshot(created)};
    return {next,rows,profile:name,createdProfileId:id};
  }
  function makePageStructure(state,a,c){
    const next=clone(state),pi=(a.page??state.page+1)-1;
    let folder=null,row=next.pages[pi];
    if(a.folder){
      for(const [depth,[slot,page]] of a.folder.split('/').map(x=>x.split(':').map(Number)).entries()){
        if(depth===0&&next.pinned?.[slot-1])fail('고정 폴더는 편집하지 않습니다.');
        folder=row?.[slot-1];if(folder?.type!=='folder')fail('덱폴더 경로를 찾지 못했습니다.');
        row=page===1?folder.children:folder.pages?.[page-2];if(!Array.isArray(row))fail('덱폴더 페이지가 없습니다.');
      }
    }
    const original=folder?[folder.children,...(folder.pages||[])]:next.pages;
    const count=original.length,index=c.index===undefined?undefined:c.index-1,to=c.to===undefined?undefined:c.to-1;
    const slots=c.op==='delete'?(original[index]||[]).filter(Boolean).length:0;
    const names={append:'맨 뒤에 빈 페이지 추가',insert:c.index+'페이지 앞에 빈 페이지 삽입',move:c.index+'페이지 → '+c.to+'페이지 위치로 이동',duplicate:c.index+'페이지 복제',delete:c.index+'페이지 및 등록된 버튼 '+slots+'개 삭제'};
    if(!Core.editPageStructure(next,{op:c.op,index,to,folder,select:false}))fail('페이지 번호, 이동 위치 또는 최대 10페이지 제한을 확인하세요.');
    next.selected=null;next.folderPath=[];
    return {next,rows:[{op:'page_structure',page:a.folder?pi+1:(c.index??count+1),slot:null,folder:a.folder,before:{title:'기존 '+count+'페이지'},after:{title:names[c.op]+' · 총 '+(folder?1+folder.pages.length:next.pages.length)+'페이지'}}],profile:state.profileNames?.find(p=>p.id===state.profileId)?.name||'기본 프로필'};
  }
  function makePlan(state,raw,resources={}){

    const a=validate(raw),c=JSON.parse(a.configJson);
    if(!Array.isArray(state?.pages)||!state.pages.length)fail('프로필이 없습니다.');
    if(a.kind==='fusion_batch')return makeFusionBatch(state,c,resources);
    if(a.kind==='template_save'){
      const matches=has(c,'sourceProfile')?state.profileNames.filter(p=>p.name.trim().toLowerCase()===c.sourceProfile.trim().toLowerCase()):state.profileNames.filter(p=>p.id===state.profileId);
      if(matches.length!==1)fail('원본 프로필을 한 개로 특정할 수 없습니다.');
      const {next,template}=Core.saveProfileTemplate(state,matches[0].id,c.name);
      return {next,profile:matches[0].name,rows:[{op:'template_save',page:null,slot:null,folder:null,before:{title:'원본 프로필 유지'},after:{title:template.name+' · '+template.snapshot.pages.length+'페이지 · 로컬 템플릿 저장'}}]};
    }
    if(a.kind==='template_apply'){
      const template=Core.findProfileTemplate(state,c.template);
      const {next,createdProfileId}=Core.applyProfileTemplate(state,template.id,c.name);
      return {next,createdProfileId,profile:c.name.trim(),rows:[{op:'template_apply',page:null,slot:null,folder:null,before:{title:template.name+' · '+template.snapshot.pages.length+'페이지'},after:{title:c.name.trim()+' · '+template.snapshot.pages.length+'페이지 · 새 비활성 프로필 생성 · 기존 프로필 유지'}}]};
    }
    if(a.kind==='profile_build')return makeProfileBuild(state,c,resources);
    if(a.kind==='page_structure')return makePageStructure(state,a,c);
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
