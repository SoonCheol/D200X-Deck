'use strict';
// Offline differential trace checks for the restricted Ulanzi AST subset.
// This does NOT execute the original source, import its dependencies, access
// user data, install a plugin or certify real hardware behavior.
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {validateNativeManifest,NativePluginHost}=require('./deckforge-native-sdk.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>hash(JSON.stringify(x));
const SOURCE_EVENT=Object.freeze({
  appear:'onAdd',settings:'onParamFromApp',press:'onKeyDown',release:'onKeyUp',
  dialPress:'onDialDown',dialRelease:'onDialUp',
  left:'onDialRotateLeft',right:'onDialRotateRight',
  heldLeft:'onDialRotateHoldLeft',heldRight:'onDialRotateHoldRight'
});
function simulateCandidate(manifest,sourceEvents){
  validateNativeManifest(manifest);
  if(manifest.apiVersion===1&&manifest.actions.length>1)return simulateMultiple(manifest,sourceEvents);
  if(manifest.apiVersion!==1||manifest.actions.length!==1||!Array.isArray(sourceEvents)||sourceEvents.length>10)
    throw Error('unsupported simulation input');
  const action=manifest.actions[0],dial=action.controllers[0]==='Encoder';
  if(action.controllers.length!==1)throw Error('ambiguous controller');
  const events=new Map();
  for(const entry of sourceEvents){
    if(!Object.values(SOURCE_EVENT).includes(entry.method)||events.has(entry.method)||!Array.isArray(entry.calls)||entry.calls.length>16)
      throw Error('invalid source trace');
    const calls=entry.calls.map(call=>{
      if(call.method==='setTitle'&&typeof call.value==='string')return {kind:'setTitle',payload:{title:call.value}};
      if(call.method==='setTitleFromParam'&&typeof call.key==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(call.key)&&typeof call.fallback==='string')
        return {setting:call.key,fallback:call.fallback};
      if(call.method==='setState'&&Number.isInteger(call.value))return {kind:'setState',payload:{state:call.value}};
      if(call.method==='setImage'&&typeof call.value==='string')return {kind:'setImage',payload:{image:call.value}};
      throw Error('unsupported source trace command');
    });
    events.set(entry.method,calls);
  }
  const observed=[],checks=[];
  const host=new NativePluginHost('/unused-offline-verification',event=>{
    observed.push(event);
  },()=>{throw Error('JavaScript runner is forbidden in candidate verification');});
  const cfg=(context,slot)=>({context,slot,gesture:'down',pluginUUID:manifest.id,actionUUID:action.id,settings:{}});
  const a=cfg('verify-a',dial?16:0),b=cfg('verify-b',dial?17:1);
  const keys=[...new Set([...events.values()].flat().filter(e=>e.setting).map(e=>e.setting))];
  b.settings=Object.fromEntries(keys.map(k=>[k,'Context B '+k]));
  const current=new Map([[a.context,a.settings],[b.context,b.settings]]);
  const expected=(context,event,ticks=1)=>{
    const output=[];
    for(let i=0;i<ticks;i++)for(const item of events.get(event)||[]){
      if(item.setting){
        const data=current.get(context)||{},value=Object.hasOwn(data,item.setting)?data[item.setting]:undefined;
        output.push({kind:'setTitle',context,payload:{title:typeof value==='string'?value.slice(0,256):item.fallback}});
      }else output.push({...item,context});
    }
    return output;
  };
  const check=(name,execute,want=[],receipt)=>{
    observed.length=0;
    let actual,error=false;
    try{actual=execute();}catch{error=true;}
    const pass=!error&&(receipt===undefined||actual===receipt)&&isDeepStrictEqual(observed,want);
    checks.push({name,pass,expectedMessages:want.length,actualMessages:observed.length,
      ...(receipt===undefined?{}:{expectedAccepted:receipt,actualAccepted:actual===true})});
  };
  const down=dial?SOURCE_EVENT.dialPress:SOURCE_EVENT.press,up=dial?SOURCE_EVENT.dialRelease:SOURCE_EVENT.release;
  try{
    check('appearance-two-contexts',()=>host.sync([a,b],[manifest]),[
      ...expected(a.context,SOURCE_EVENT.appear),...expected(b.context,SOURCE_EVENT.appear)]);
    check('orphan-release',()=>host.key(a.context,'up'),[],false);
    check('press-a',()=>host.key(a.context,'down'),expected(a.context,down),true);
    check('duplicate-press',()=>host.key(a.context,'down'),[],false);
    check('press-b',()=>host.key(b.context,'down'),expected(b.context,down),true);
    if(dial){
      check('held-left',()=>host.key(a.context,'hold-left',2),expected(a.context,SOURCE_EVENT.heldLeft,2),true);
      check('held-right',()=>host.key(b.context,'right'),expected(b.context,SOURCE_EVENT.heldRight),true);
    }
    check('release-a',()=>host.key(a.context,'up'),expected(a.context,up),true);
    check('release-b',()=>host.key(b.context,'up'),expected(b.context,up),true);
    if(dial){
      check('rotate-left',()=>host.key(a.context,'left',2),expected(a.context,SOURCE_EVENT.left,2),true);
      check('rotate-right',()=>host.key(b.context,'right'),expected(b.context,SOURCE_EVENT.right),true);
      check('held-binding-left',()=>host.key(a.context,'hold-left'),expected(a.context,SOURCE_EVENT.heldLeft),true);
    }else check('keypad-rejects-rotate',()=>host.key(a.context,'left'),[],false);
    check('unchanged-sync',()=>host.sync([a,b],[manifest]),[]);
    const changed=Object.fromEntries([['probe',1],...keys.map(k=>[k,'Updated '+k])]);
    // Use a distinct probe key even when the original field is named probe.
    current.set(a.context,changed);
    check('settings-sync',()=>host.sync([{...a,settings:changed},b],[manifest]),expected(a.context,SOURCE_EVENT.settings));
    if(keys.length){
      const wrong=Object.fromEntries(keys.map(k=>[k,42]));
      current.set(a.context,wrong);
      check('settings-non-string-fallback',()=>host.sync([{...a,settings:wrong},b],[manifest]),expected(a.context,SOURCE_EVENT.settings));
    }
    check('remove-a',()=>host.sync([b],[manifest]),[]);
    check('removed-context-ignored',()=>host.key(a.context,'down'),[],false);
    check('remaining-context-press',()=>host.key(b.context,'down'),expected(b.context,down),true);
    check('suspend-clears-press',()=>host.suspend(),[]);
    check('suspend-input-blocked',()=>host.key(b.context,'down'),[],false);
    check('resume-initializes-only',()=>host.resume(),expected(b.context,SOURCE_EVENT.appear));
    check('resume-orphan-release',()=>host.key(b.context,'up'),[],false);
    current.set(a.context,a.settings);
    check('reappearance',()=>host.sync([a,b],[manifest]),expected(a.context,SOURCE_EVENT.appear));
    check('shutdown',()=>host.close(),[]);
    check('shutdown-input-blocked',()=>host.key(a.context,'down'),[],false);
  }finally{host.close();}
  const passed=checks.filter(x=>x.pass).length;
  return {verifierVersion:1,scope:'offline-restricted-display-trace',candidateSha256:digest(manifest),
    sourceTraceSha256:digest(sourceEvents),status:passed===checks.length?'pass':'fail',
    passed,total:checks.length,checks,originalExecuted:false,hardwareVerified:false,installationAllowed:false,
    limitations:['source trace derived from supported AST literals, not execution of original plugin',
      'Ulanzi onAdd and DeckForge appear lifecycle timing is not proven equivalent',
      'resources, license, actual source dependencies and device behavior need separate review']};
}
function simulateMultiple(manifest,traces){
  if(!Array.isArray(traces)||traces.length!==manifest.actions.length||
    new Set(traces.map(t=>t?.actionId)).size!==traces.length||
    manifest.actions.some(a=>!traces.some(t=>t?.actionId===a.id)))throw Error('invalid multi-action source traces');
  const checks=[],observed=[];
  for(const action of manifest.actions){
    const trace=traces.find(t=>t.actionId===action.id);
    const result=simulateCandidate({...manifest,actions:[action]},trace.events);
    checks.push(...result.checks.map(c=>({...c,name:action.id+':'+c.name})));
  }
  const host=new NativePluginHost('/unused-offline-verification',event=>observed.push(event),()=>{throw Error('JavaScript runner forbidden');});
  const configs=manifest.actions.map((a,i)=>{
    const fields=traces.find(t=>t.actionId===a.id).events.flatMap(e=>e.calls).filter(c=>c.method==='setTitleFromParam');
    return {context:'verify-multi-'+i,slot:a.controllers[0]==='Encoder'?16:0,gesture:'down',pluginUUID:manifest.id,actionUUID:a.id,settings:Object.fromEntries(fields.map(f=>[f.key,'Action '+i+' '+f.key]))};
  });
  const expected=(cfg,method)=>(traces.find(t=>t.actionId===cfg.actionUUID).events.find(e=>e.method===method)?.calls||[]).map(c=>({
    kind:c.method==='setTitleFromParam'?'setTitle':c.method,context:cfg.context,payload:c.method==='setTitleFromParam'?{title:typeof cfg.settings[c.key]==='string'?cfg.settings[c.key].slice(0,256):c.fallback}:c.method==='setTitle'?{title:c.value}:c.method==='setState'?{state:c.value}:{image:c.value}
  }));
  const check=(name,run,want,accepted)=>{
    observed.length=0;let receipt,error=false;
    try{receipt=run();}catch{error=true;}
    checks.push({name,pass:!error&&(accepted===undefined||receipt===accepted)&&isDeepStrictEqual(observed,want),expectedMessages:want.length,actualMessages:observed.length});
  };
  try{
    check('multi-appear',()=>host.sync(configs,[manifest]),configs.flatMap(c=>expected(c,'onAdd')));
    for(const cfg of configs){
      const dial=cfg.slot>=16;
      check(cfg.context+':press',()=>host.key(cfg.context,'down'),expected(cfg,dial?'onDialDown':'onKeyDown'),true);
      check(cfg.context+':release',()=>host.key(cfg.context,'up'),expected(cfg,dial?'onDialUp':'onKeyUp'),true);
    }
    check('multi-remove-first',()=>host.sync(configs.slice(1),[manifest]),[]);
    check('multi-removed-context',()=>host.key(configs[0].context,'down'),[],false);
    const last=configs[configs.length-1];
    check('multi-remaining-context',()=>host.key(last.context,'down'),expected(last,last.slot>=16?'onDialDown':'onKeyDown'),true);
  }finally{host.close();}
  const passed=checks.filter(c=>c.pass).length;
  return {verifierVersion:2,scope:'offline-restricted-multi-action-display-trace',candidateSha256:digest(manifest),
    sourceTraceSha256:digest(traces),status:passed===checks.length?'pass':'fail',passed,total:checks.length,checks,
    originalExecuted:false,hardwareVerified:false,installationAllowed:false,
    limitations:['restricted source trace, not original execution','simulated contexts, not physical hardware','multi-action resource and release review required']};
}
module.exports={simulateCandidate};
