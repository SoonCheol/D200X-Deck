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
  appear:'onAdd',press:'onKeyDown',release:'onKeyUp',
  dialPress:'onDialDown',dialRelease:'onDialUp',
  left:'onDialRotateLeft',right:'onDialRotateRight',
  heldLeft:'onDialRotateHoldLeft',heldRight:'onDialRotateHoldRight'
});
function simulateCandidate(manifest,sourceEvents){
  validateNativeManifest(manifest);
  if(manifest.apiVersion!==1||manifest.actions.length!==1||!Array.isArray(sourceEvents)||sourceEvents.length>9)
    throw Error('unsupported simulation input');
  const action=manifest.actions[0],dial=action.controllers[0]==='Encoder';
  if(action.controllers.length!==1)throw Error('ambiguous controller');
  const events=new Map();
  for(const entry of sourceEvents){
    if(!Object.values(SOURCE_EVENT).includes(entry.method)||events.has(entry.method)||!Array.isArray(entry.calls)||entry.calls.length>16)
      throw Error('invalid source trace');
    const calls=entry.calls.map(call=>{
      if(call.method==='setTitle'&&typeof call.value==='string')return {kind:'setTitle',payload:{title:call.value}};
      if(call.method==='setState'&&Number.isInteger(call.value))return {kind:'setState',payload:{state:call.value}};
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
  const expected=(context,event,ticks=1)=>{
    const output=[];
    for(let i=0;i<ticks;i++)for(const item of events.get(event)||[])output.push({...item,context});
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
    check('settings-sync',()=>host.sync([{...a,settings:{probe:1}},b],[manifest]),[]);
    check('remove-a',()=>host.sync([b],[manifest]),[]);
    check('removed-context-ignored',()=>host.key(a.context,'down'),[],false);
    check('remaining-context-press',()=>host.key(b.context,'down'),expected(b.context,down),true);
    check('suspend-clears-press',()=>host.suspend(),[]);
    check('suspend-input-blocked',()=>host.key(b.context,'down'),[],false);
    check('resume-initializes-only',()=>host.resume(),expected(b.context,SOURCE_EVENT.appear));
    check('resume-orphan-release',()=>host.key(b.context,'up'),[],false);
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
module.exports={simulateCandidate};
