'use strict';
// Local Fusion batch format. No profile is modified until the user imports it.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.D200XFusionBatch=factory();
})(globalThis,function(){
  const PLUGIN='com.autodesk.fusionstreamdeck';
  const ACTION=PLUGIN+'.runcommand';
  const FORMAT='d200x-fusion-batch-v1';
  const MAX=1792; // 128 D200X pages x 14 assignable physical keys
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
    return {format:FORMAT,pluginUUID:PLUGIN,actionUUID:ACTION,
      profileName:raw.profileName.trim().slice(0,80),commands};
  }
  function apply(state,raw,core){
    const input=validate(raw);
    if(!state||!core||!Array.isArray(state.profileNames)||
      state.profileNames.length>=50)throw Error('프로필을 추가할 공간이 없습니다.');
    const id=core.createProfile(state,input.profileName);
    if(!id)throw Error('프로필 생성에 실패했습니다.');
    const target=state.inactiveProfiles.find(p=>p.id===id);
    if(!target)throw Error('새 프로필 데이터를 찾지 못했습니다.');
    target.pages=Array.from({length:Math.ceil(input.commands.length/14)},()=>core.blankPage());
    input.commands.forEach((cmd,index)=>{
      const action=core.createAction('sd-plugin');
      action.title=cmd.name.slice(0,30);
      action.settings.pluginUUID=PLUGIN;
      action.settings.actionUUID=ACTION;
      action.settings.pluginSettings={commandId:cmd.id,name:cmd.name};
      target.pages[Math.floor(index/14)][index%14]=action;
    });
    core.switchProfile(state,id);
    return {id,count:input.commands.length,pageCount:target.pages.length,
      profileName:input.profileName};
  }
  return {FORMAT,PLUGIN,ACTION,MAX,validate,apply};
});
