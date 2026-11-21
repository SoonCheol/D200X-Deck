'use strict';
// Local Fusion batch format. No profile is modified until the user imports it.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.D200XFusionBatch=factory();
})(globalThis,function(){
  const PLUGIN='com.autodesk.fusionstreamdeck';
  const ACTION=PLUGIN+'.runcommand';
  const FORMAT='d200x-fusion-batch-v1';
  const KEYS_PER_PAGE=13; // D200X index 13 is the wide information display, not a button.
  const MAX=128*KEYS_PER_PAGE;
  const SAFE_ID=/^[^\x00-\x1f\x7f]{1,256}$/;
  function validate(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
      raw.format!==FORMAT||raw.pluginUUID!==PLUGIN||raw.actionUUID!==ACTION||
      typeof raw.profileName!=='string'||!raw.profileName.trim()||
      !Array.isArray(raw.commands)||!raw.commands.length||raw.commands.length>MAX)
      throw Error('올바른 Fusion 일괄 등록 JSON 파일이 아닙니다.');
    const seen=new Set();
    const commands=raw.commands.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||
        typeof item.id!=='string'||!SAFE_ID.test(item.id)||
        typeof item.name!=='string'||!item.name.trim()||item.name.length>160)
        throw Error('Fusion 명령 형식 오류: '+(index+1));
      if(seen.has(item.id))throw Error('중복된 Fusion 명령: '+item.id);
      seen.add(item.id);
      return {id:item.id,name:item.name.slice(0,160)};
    });
    // Optional explicit page geometry from Fusion Command Manager. Old v1 command
    // arrays remain unchanged and still import sequentially for compatibility.
    let layoutPages;
    if(raw.layoutPages!==undefined){
      if(!Array.isArray(raw.layoutPages)||!raw.layoutPages.length||raw.layoutPages.length>128)
        throw Error('Fusion 페이지 수는 1~128개여야 합니다.');
      const placed=[];
      layoutPages=raw.layoutPages.map((page,pi)=>{
        if(!page||typeof page!=='object'||!Array.isArray(page.slots)||page.slots.length!==KEYS_PER_PAGE)
          throw Error('Fusion 페이지 슬롯 오류: '+(pi+1));
        const slots=page.slots.map((cmd,slot)=>{
          if(cmd===null)return null;
          if(!cmd||typeof cmd!=='object'||typeof cmd.id!=='string'||typeof cmd.name!=='string'||
            !SAFE_ID.test(cmd.id)||!cmd.name.trim()||cmd.name.length>160)
            throw Error('Fusion 슬롯 명령 오류: '+(pi+1)+'/'+(slot+1));
          placed.push(cmd.id);
          return {id:cmd.id,name:cmd.name};
        });
        return {name:typeof page.name==='string'?page.name.slice(0,60):'',slots};
      });
      if(placed.length!==commands.length||placed.some((id,i)=>id!==commands[i].id))
        throw Error('페이지 슬롯과 명령 목록 순서가 다릅니다.');
    }
    return {format:FORMAT,pluginUUID:PLUGIN,actionUUID:ACTION,
      profileName:raw.profileName.trim().slice(0,80),commands,...(layoutPages?{layoutPages}:{})};
  }
  function apply(state,raw,core){
    const input=validate(raw);
    if(!state||!core||!Array.isArray(state.profileNames)||
      state.profileNames.length>=50)throw Error('프로필을 추가할 공간이 없습니다.');
    const id=core.createProfile(state,input.profileName);
    if(!id)throw Error('프로필 생성에 실패했습니다.');
    const target=state.inactiveProfiles.find(p=>p.id===id);
    if(!target)throw Error('새 프로필 데이터를 찾지 못했습니다.');
    target.pages=Array.from({length:input.layoutPages?.length||Math.ceil(input.commands.length/KEYS_PER_PAGE)},()=>core.blankPage());
    function assign(cmd,pi,slot){
      const action=core.createAction('sd-plugin');
      action.title=cmd.name.slice(0,30);
      action.settings.pluginUUID=PLUGIN;
      action.settings.actionUUID=ACTION;
      action.settings.pluginSettings={commandId:cmd.id,name:cmd.name};
      target.pages[pi][slot]=action;
    }
    if(input.layoutPages){
      input.layoutPages.forEach((page,pi)=>page.slots.forEach((cmd,slot)=>{if(cmd)assign(cmd,pi,slot);}));
    }else input.commands.forEach((cmd,index)=>assign(cmd,Math.floor(index/KEYS_PER_PAGE),index%KEYS_PER_PAGE));
    core.switchProfile(state,id);
    return {id,count:input.commands.length,pageCount:target.pages.length,
      profileName:input.profileName};
  }
  return {FORMAT,PLUGIN,ACTION,KEYS_PER_PAGE,MAX,validate,apply};
});
