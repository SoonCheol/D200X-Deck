'use strict';
// Shared strict schema + pure planner. No filesystem, IPC or execution.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../deck-core.js'),require('../hotkey-keys.js'));
  else root.DeckForgeAiPlan=factory(root.DeckCore,root.DeckHotkeys);
})(globalThis,(Core,Hotkeys)=>{
  const TYPES=['hotkey','open-app','file-open','folder-shortcut','previous','next','goto','indicator','folder','clipboard-edit','media','system-mute','explorer-open'];
  const protectedType=a=>!!a&&(!TYPES.includes(a.type)||a.type==='folder'||a.settings?.sdkStateIcons||a.settings?.keyPressIcons||a.settings?.stateTitles||a.stateVisuals||a.settings?.keyBackgrounds);
  const keys=['op','page','slot','toPage','toSlot','type','value','title','iconPack','iconName','size','color','bold','font'];
  const FONTS=['default','DeckForge Pretendard','Malgun Gothic','Segoe UI'];
  const nullable=(type,extra={})=>({type:[type,'null'],...extra});
  const TOOL={type:'function',name:'propose_edit',description:'Prepare one local preview, NEVER apply. Active profile root ordinary keys 1–13 only. put on empty key; update existing basic key (null preserves); delete; copy/move to empty key; add_page (append). For put/update: type hotkey (value Ctrl+C), open-app (verified Start Apps AppID or explicitly user supplied local .exe), file-open or folder-shortcut (explicit user supplied local path), goto (one-based page string), clipboard-edit (copy/paste/cut), media (playpause/next/previous/stop), previous/next/indicator/folder/system-mute/explorer-open (null value). For icon use exact iconName, optionally exact iconPack. title, size, color, bold, font optional. page null=current captured page. ALL unused properties must be null. One proposal, max 8 operations. Existing pinned/composite/plugin/folder and state-specific icons protected. User must apply in UI.',strict:true,parameters:{type:'object',properties:{operations:{type:'array',items:{type:'object',properties:{op:{type:'string',enum:['put','update','delete','copy','move','add_page']},page:nullable('integer'),slot:nullable('integer'),toPage:nullable('integer'),toSlot:nullable('integer'),type:{type:['string','null'],enum:[...TYPES,null]},value:nullable('string'),title:nullable('string'),iconPack:nullable('string'),iconName:nullable('string'),size:nullable('integer'),color:nullable('string'),bold:nullable('boolean'),font:{type:['string','null'],enum:[...FONTS,null]}},required:keys,additionalProperties:false}}},required:['operations'],additionalProperties:false}};
  const fail=message=>{throw Error(message);};
  const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  const str=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
  const fieldsNull=(o,names)=>names.every(k=>o[k]===null);
  function validate(input){
    if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==1||!Array.isArray(input.operations)||!integer(input.operations.length,1,8))fail('변경안은 최대 8개 작업입니다.');
    return {operations:input.operations.map(o=>{
      if(!o||Array.isArray(o)||Object.keys(o).length!==keys.length||!keys.every(k=>Object.hasOwn(o,k))||!['put','update','delete','copy','move','add_page'].includes(o.op))fail('변경안 형식 오류');
      for(const [k,min,max] of [['page',1,128],['toPage',1,128],['slot',1,13],['toSlot',1,13],['size',8,48]])if(o[k]!==null&&!integer(o[k],min,max))fail('페이지 또는 버튼 번호나 글자 크기 오류');
      for(const [k,max] of [['value',1024],['title',80],['iconPack',120],['iconName',120]])if(o[k]!==null&&!str(o[k],max))fail('변경안 텍스트 형식 오류');
      if(o.type!==null&&!TYPES.includes(o.type)||o.color!==null&&!/^#[0-9a-f]{6}$/i.test(o.color)||o.bold!==null&&typeof o.bold!=='boolean'||o.font!==null&&!FONTS.includes(o.font))fail('지원하지 않는 변경 값입니다.');
      const edit=['type','value','title','iconPack','iconName','size','color','bold','font'];
      if(o.op==='add_page'&&!fieldsNull(o,keys.filter(k=>k!=='op')))fail('페이지 추가에는 다른 인자가 필요하지 않습니다.');
      if(o.op!=='add_page'&&o.slot===null)fail('버튼 번호가 필요합니다.');
      if(['copy','move'].includes(o.op)){if(o.toSlot===null||!fieldsNull(o,edit))fail('복사 이동 형식 오류');}
      else if(o.toSlot!==null||o.toPage!==null)fail('대상 번호 형식 오류');
      if(o.op==='delete'&&!fieldsNull(o,edit))fail('삭제 형식 오류');
      if(o.op==='put'&&!o.type)fail('등록할 동작이 필요합니다.');
      if(o.op==='update'&&(o.type!==null||fieldsNull(o,edit)))fail('수정은 기존 동작을 유지하고 변경 값만 지정하세요.');
      if(o.iconPack!==null&&!o.iconName||o.iconName!==null&&!o.iconName.trim())fail('아이콘 이름이 필요합니다.');
      return Object.fromEntries(keys.map(k=>[k,o[k]]));
    })};
  }
  const clone=x=>JSON.parse(JSON.stringify(x));
  const label=a=>a?(a.title||a.type):'비어 있음';
  function describe(a){
    if(!a)return {title:'비어 있음'};
    const s=a.settings||{};
    return {type:a.type,title:label(a),value:a.type==='hotkey'?s.keys:a.type==='open-app'?s.app:['file-open','folder-shortcut'].includes(a.type)?s.path:a.type==='goto'?String(s.page+1):a.type==='clipboard-edit'?s.operation:a.type==='media'?s.op:undefined,
      size:a.titleStyle?.size,color:a.titleStyle?.color,bold:a.titleStyle?.bold,font:a.titleStyle?.family,hasArgs:!!s.args,hold:s.hold,foreground:s.foreground,preventDuplicate:s.preventDuplicate,alwaysNewWindow:s.alwaysNewWindow,icon:a.icon?.kind==='file'?'등록 이미지':undefined};
  }
  function applyValue(a,value,target,pageCount){
    const s=a.settings;
    switch(a.type){
      case 'hotkey':{const key=Hotkeys.canonical(value);if(!key)fail('지원하지 않는 단축키입니다.');s.keys=key;s.source='custom';break;}
      case 'open-app':case 'file-open':case 'folder-shortcut':
        if(!target||target.type!==a.type||target.requested!==value||typeof target.path!=='string'||!target.path)fail('로컬 대상 확인이 필요합니다.');
        if(a.type==='open-app'){s.app=target.path;s.args='';s.hold='none';s.foreground=true;s.preventDuplicate=true;}
        else s.path=target.path;
        if(target.icon){a.icon=target.icon;s.autoAppIcon=true;}
        else if(s.autoAppIcon){delete a.icon;delete s.autoAppIcon;}
        break;
      case 'goto':if(!/^[1-9]\d{0,2}$/.test(value||'')||Number(value)>pageCount)fail('이동할 페이지가 없습니다.');s.page=Number(value)-1;break;
      case 'clipboard-edit':if(!['copy','paste','cut'].includes(value))fail('지원하지 않는 클립보드 동작입니다.');s.operation=value;break;
      case 'media':if(!['playpause','next','previous','stop'].includes(value))fail('지원하지 않는 재생 동작입니다.');s.op=value;break;
      default:if(value!==null)fail('이 동작은 별도 값이 필요하지 않습니다.');
    }
  }
  function makePlan(state,input,resources=[]){
    const {operations}=validate(input);
    if(!state||!Array.isArray(state.pages)||!state.pages.length||state.folderPath?.length)fail('프로필의 일반 페이지에서 사용하세요.');
    // Shallow copy only touched containers. Untouched Fusion/SDK actions retain identity.
    const next={...state,pages:state.pages.slice()},copied=new Set(),rows=[];
    const current=state.page,touched=new Set();
    function pageAt(p){const i=p===null?current:p-1;if(!integer(i,0,next.pages.length-1))fail('대상 페이지가 없습니다.');if(!copied.has(i)){next.pages[i]=next.pages[i].slice();copied.add(i);}return [i,next.pages[i]];}
    function at(p,slot){const [i,row]=pageAt(p),index=slot-1;if(state.pinned?.[index])fail('고정 버튼 위치는 변경할 수 없습니다.');if(protectedType(row[index]))fail('복합 동작, 폴더, 플러그인 또는 상태별 디자인은 보호됩니다.');return {i,row,index,before:row[index]||null};}
    const keyLocation=t=>({page:t.i+1,slot:t.index+1});
    function record(t,before,after,op,icon){const k=t.i+':'+t.index;if(touched.has(k))fail('같은 버튼에 두 번 변경하는 작업은 나눠 요청하세요.');touched.add(k);rows.push({...keyLocation(t),op,before:describe(before),after:describe(after),...(icon?{icon}: {})});}
    for(const [n,o] of operations.entries()){
      const res=resources[n]||{};
      if(o.op==='add_page'){
        if(next.pages.length>=10||!next.controls||!Array.isArray(next.controls.pages))fail('새 페이지 추가 한도 또는 컨트롤 설정을 확인하세요.');
        if(next.controls===state.controls)next.controls={...state.controls,pages:state.controls.pages.slice()};
        next.pages.push(Core.blankPage());next.controls.pages.push(Array.from({length:5},Core.emptyBinding));
        rows.push({op:'add_page',page:next.pages.length,before:{title:'없음'},after:{title:'새 페이지 추가 (기존 고정 키 유지)'}});continue;
      }
      const t=at(o.page,o.slot);
      if(o.op==='delete'){
        if(!t.before)fail('삭제할 버튼이 없습니다.');t.row[t.index]=null;record(t,t.before,null,o.op);continue;
      }
      if(['copy','move'].includes(o.op)){
        if(!t.before)fail('복사하거나 이동할 버튼이 없습니다.');
        const dest=at(o.toPage??(t.i+1),o.toSlot);
        if(dest.before)fail('대상 버튼이 비어 있지 않습니다.');
        // Copy only known basic action, no plugin context or runtime state.
        const copiedAction=clone(t.before);dest.row[dest.index]=copiedAction;record(dest,null,copiedAction,o.op);
        if(o.op==='move'){t.row[t.index]=null;record(t,t.before,null,'move_source');}
        continue;
      }
      if(o.op==='put'&&t.before)fail('등록할 버튼이 비어 있지 않습니다.');
      if(o.op==='update'&&!t.before)fail('수정할 버튼이 없습니다.');
      const a=o.op==='put'?Core.createAction(o.type):clone(t.before);
      a.settings??={};a.titleStyle??={...Core.TITLE};
      if(o.op==='put'||o.value!==null)applyValue(a,o.value,res.target,next.pages.length);
      if(o.title!==null){a.title=o.title;delete a.settings.autoAppTitle;}
      else if(o.op==='put'){
        a.title=res.target?.name||({'hotkey':a.settings.keys,'previous':'이전 페이지','next':'다음 페이지','goto':'페이지 '+(a.settings.page+1),'indicator':'페이지 표시','folder':'폴더','clipboard-edit':a.settings.operation,'media':a.settings.op,'system-mute':'음소거','explorer-open':'파일 탐색기'}[a.type])||a.type;
      }
      if(o.size!==null)a.titleStyle.size=o.size;
      if(o.color!==null)a.titleStyle.color=o.color;
      if(o.bold!==null)a.titleStyle.bold=o.bold;
      if(o.font!==null)a.titleStyle.family=o.font;
      if(o.iconName!==null){if(!res.icon?.data||res.icon.name!==o.iconName)fail('아이콘을 정확하게 찾지 못했습니다.');a.icon=res.icon.data;delete a.settings.autoAppIcon;}
      t.row[t.index]=a;record(t,t.before,a,o.op,o.iconName?res.icon.pack+' / '+res.icon.name:undefined);
    }
    if(!rows.length||JSON.stringify(state)===JSON.stringify(next))fail('변경 사항이 없습니다.');
    return {next,rows,profile:state.profileNames?.find(p=>p.id===state.profileId)?.name||'기본 프로필'};
  }
  // Resolve the type of each operation in order (without creating a live preview).
  function targetTypes(state,input){
    const {operations}=validate(input),types=state.pages.map(row=>row.slice(0,13).map(a=>a?.type||null)),out=[];
    for(const o of operations){
      if(o.op==='add_page'){types.push(Array(13).fill(null));out.push(null);continue;}
      const p=(o.page??state.page+1)-1,i=o.slot-1,t=types[p]?.[i]||null;
      if(!types[p])fail('대상 페이지가 없습니다.');
      const type=o.op==='put'?o.type:t;
      out.push(['put','update'].includes(o.op)?type:null);
      if(o.op==='put')types[p][i]=type;
      else if(o.op==='delete')types[p][i]=null;
      else if(['copy','move'].includes(o.op)){const d=(o.toPage??p+1)-1;if(!types[d])fail('대상 페이지가 없습니다.');types[d][o.toSlot-1]=t;if(o.op==='move')types[p][i]=null;}
    }
    return out;
  }
  return {TOOL,TYPES,validate,makePlan,targetTypes};
});
