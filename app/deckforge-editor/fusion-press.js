'use strict';
// Independent Fusion Run Command gestures. A hold never emits a command tap.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DeckForgeFusionPress=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const enabled=item=>item?.type==='sd-plugin'&&
    item.settings?.pluginUUID==='com.autodesk.fusionstreamdeck'&&
    item.settings.actionUUID==='com.autodesk.fusionstreamdeck.runcommand'&&
    item.settings.fusionHoldEscape!==false;
  function create({holdMs=600,setTimer=setTimeout,clearTimer=clearTimeout,current,onTap,onHold}){
    const records=new Map();
    function handle(index,gesture,token,event){
      const prior=records.get(index);
      if(gesture==='down'){
        if(prior)return true;
        if(!token)return false;
        const record={token,event,held:false,timer:null};records.set(index,record);
        record.timer=setTimer(()=>{
          if(records.get(index)!==record)return;
          record.held=true;
          if(current(index,token))onHold(index,token,event);
        },holdMs);
        return true;
      }
      if(gesture!=='up'||!prior)return false;
      records.delete(index);clearTimer(prior.timer);
      if(!prior.held&&current(index,prior.token))onTap(index,prior.token,event);
      return true;
    }
    function clear(){for(const record of records.values())clearTimer(record.timer);records.clear();}
    return {handle,clear};
  }
  return {enabled,create};
});
