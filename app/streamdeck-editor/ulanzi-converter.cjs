'use strict';
// Static Ulanzi SDK analysis and a deliberately narrow AST-to-DeckForge
// translator. Original code is NEVER executed. Candidate != compatible.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const acorn=require('acorn');
const {analyzeHtml,imageReport,MAX:MAX_HTML}=require('./ulanzi-inspector-analysis.cjs');
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
const {svgReport}=require('./ulanzi-media-analysis.cjs');
const {validateNativeManifest}=require('./deckforge-native-sdk.cjs');
const MAX_FILES=2500,MAX_BYTES=100*1024*1024,MAX_SOURCE=1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ID=/^com\.[a-zA-Z0-9-]+\.ulanzistudio\.[a-zA-Z0-9-]+$/;
const EVENT_MAP=Object.freeze({
  onAdd:'appear',onParamFromApp:'settings',onKeyDown:'press',onKeyUp:'release',
  onDialDown:'press',onDialUp:'release',onDialRotateLeft:'rotateLeft',
  onDialRotateRight:'rotateRight',onDialRotateHoldLeft:'heldRotateLeft',
  onDialRotateHoldRight:'heldRotateRight'
});
const REVIEW_EVENTS=new Set(['onRun','onClear','onSetActive','onConnected','onClose','onError',
  'onParamFromPlugin','onDidReceiveSettings','onDidReceiveGlobalSettings','onSendToPlugin','onSendToPropertyInspector',
  'onDialRotate','onSelectdialog']);
const REVIEW_COMMANDS=new Set(['setStateIcon','setBaseDataIcon','setPathIcon','setGifDataIcon','setGifPathIcon',
  'setFeedback','setFeedbackLayout','setSettings','getSettings','getGlobalSettings','setGlobalSettings','sendParamFromPlugin',
  'sendToPropertyInspector','sendToPlugin','toast','showAlert','logMessage','hotkey','openUrl','openView','selectFileDialog','selectFolderDialog','emit']);
const safeRelative=s=>typeof s==='string'&&s.length>0&&s.length<1024&&!/[:\\\x00-\x1f\x7f]/.test(s)&&
  !s.startsWith('/')&&s.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=o=>o&&typeof o==='object'&&!Array.isArray(o);
const lit=(n,t)=>n?.type==='Literal'&&typeof n.value===t;
function validateSourceManifest(m){
  if(!obj(m)||m.Type!=='JavaScript'||typeof m.UUID!=='string'||!ID.test(m.UUID)||
    typeof m.Name!=='string'||!m.Name.trim()||m.Name.length>180||typeof m.Version!=='string'||
    !m.Version.trim()||m.Version.length>64||!safeRelative(m.CodePath)||
    !/\.(js|html)$/i.test(m.CodePath)||!Array.isArray(m.Actions)||!m.Actions.length||m.Actions.length>64)
    throw Error('unsupported or malformed Ulanzi manifest');
  const ids=new Set();
  for(const a of m.Actions){
    if(!obj(a)||typeof a.UUID!=='string'||!a.UUID.startsWith(m.UUID+'.')||
      !/^[a-zA-Z0-9.-]{1,180}$/.test(a.UUID)||a.UUID.endsWith('.')||a.UUID.includes('..')||
      ids.has(a.UUID.toLowerCase())||typeof a.Name!=='string'||!a.Name.trim()||a.Name.length>180)
      throw Error('invalid Ulanzi action identity');
    ids.add(a.UUID.toLowerCase());
    if(a.PropertyInspectorPath&&!safeRelative(a.PropertyInspectorPath))throw Error('invalid inspector path');
  }
  return m;
}
function member(n,owner,prop){
  return n?.type==='MemberExpression'&&!n.computed&&!n.optional&&
    n.object?.type==='Identifier'&&n.object.name===owner&&n.property?.type==='Identifier'&&
    (prop===undefined||n.property.name===prop);
}
function udCall(n){return n?.type==='CallExpression'&&!n.optional&&member(n.callee,'$UD')?n.callee.property.name:null;}
// Only the documented V3.1 temporary base64 image variant. Reject getters,
// spreads, computed keys, duplicates, path sources and default/clear updates.
function literalObject(node){
  if(node?.type!=='ObjectExpression')return null;
  const result=Object.create(null);
  for(const p of node.properties){
    const key=p.key?.type==='Identifier'?p.key.name:lit(p.key,'string')?p.key.value:null;
    if(p.type!=='Property'||p.kind!=='init'||p.computed||p.method||p.shorthand||!key||own(result,key))return null;
    result[key]=p.value;
  }
  return result;
}
function temporaryImage(node){
  const value=literalObject(node);
  if(!value||Object.keys(value).length!==2||!lit(value.isDefault,'boolean')||value.isDefault.value!==false)return null;
  const icon=literalObject(value.icons);
  if(!icon||Object.keys(icon).length!==2||!lit(icon.source,'string')||icon.source.value!=='base64'||!lit(icon.base64,'string'))return null;
  const png=icon.base64.value;
  if(png.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(png))return null;
  const bytes=Buffer.from(png.slice(22),'base64');
  if(bytes.toString('base64')!==png.slice(22)||!verifyPng(bytes).ok)return null;
  return png;
}
// Recognize only a type-guarded read of a plain, non-secret field.
function settingTitle(node,param){
  if(node?.type!=='ConditionalExpression'||node.test?.type!=='BinaryExpression'||node.test.operator!=='==='||
    node.test.left?.type!=='UnaryExpression'||node.test.left.operator!=='typeof'||
    !lit(node.test.right,'string')||node.test.right.value!=='string'||!lit(node.alternate,'string')||node.alternate.value.length>256)return null;
  const guard=node.test.left.argument;
  const access=guard?.type==='ChainExpression'?guard.expression:null,read=node.consequent;
  if(access?.type!=='MemberExpression'||!access.optional||access.computed||!member(access.object,param,'param')||
    read?.type!=='MemberExpression'||read.optional||read.computed||!member(read.object,param,'param')||
    access.property?.type!=='Identifier'||read.property?.name!==access.property.name)return null;
  const key=access.property.name;
  if(!/^[a-zA-Z0-9_-]{1,48}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||
    /token|password|secret|credential|authorization|headers?|api[_-]?key|cookie|request[_-]?body|url|endpoint/i.test(key))return null;
  return {key,fallback:node.alternate.value};
}
function settingState(node,param,states){
  const test=node?.test,access=test?.left?.type==='ChainExpression'?test.left.expression:null;
  if(node?.type!=='ConditionalExpression'||test?.type!=='BinaryExpression'||test.operator!=='==='||
    access?.type!=='MemberExpression'||!access.optional||access.computed||!member(access.object,param,'param')||
    access.property?.type!=='Identifier'||!lit(test.right,'string')||test.right.value.length>256||
    ![node.consequent,node.alternate].every(x=>lit(x,'number')&&Number.isInteger(x.value)&&x.value>=0&&x.value<states))return null;
  const key=access.property.name;
  if(!/^[a-zA-Z0-9_-]{1,48}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||
    /token|password|secret|credential|authorization|headers?|api[_-]?key|cookie|request[_-]?body|url|endpoint/i.test(key))return null;
  return {key,match:test.right.value,yes:node.consequent.value,no:node.alternate.value};
}
function analyzeSource(manifest,source,{stateImages,stateImagesByAction,inspectorSchemas}={}){
  validateSourceManifest(manifest);
  if(typeof source!=='string'||Buffer.byteLength(source)>MAX_SOURCE)throw Error('source size limit');
  const findings=[],seen=new Set(),calls=new Map(),imports=new Set();
  const note=(code,detail,line=0)=>{
    const key=code+':'+detail+':'+line;
    if(!seen.has(key)&&findings.length<200){seen.add(key);findings.push({code,detail,line});}
  };
  let ast;
  try{ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true,allowHashBang:true});}
  catch{note('syntax','JavaScript parser rejected entry');return {calls:[],imports:[],findings,candidate:null};}
  // Inventory SDK calls and dependencies without evaluating imports or source.
  const stack=[ast];let count=0;
  while(stack.length){
    const n=stack.pop();
    if(++count>100000)throw Error('AST node limit');
    if(n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'||n.type==='ExportAllDeclaration'){
      if(typeof n.source?.value==='string')imports.add(n.source.value.slice(0,256));
    }
    if(n.type==='ImportExpression')note('dynamic-import','dynamic import requires manual analysis',n.loc.start.line);
    if(n.type==='CallExpression'&&n.callee?.type==='Identifier'&&['require','eval','Function'].includes(n.callee.name))
      note('dynamic-or-node','Node or dynamic execution requires manual analysis',n.loc.start.line);
    const method=udCall(n);
    if(method){
      const prior=calls.get(method)||{name:method,count:0,support:own(EVENT_MAP,method)||['setTitle','setState','setImage','connect'].includes(method)?'candidate':REVIEW_EVENTS.has(method)||REVIEW_COMMANDS.has(method)?'review':'unknown'};
      prior.count++;calls.set(method,prior);
      if(prior.support==='unknown')note('unknown-sdk-method',method,n.loc.start.line);
      if(prior.support==='review')note('unsupported-sdk-method',method,n.loc.start.line);
    }else if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.object?.name==='$UD')
      note('dynamic-sdk-method','computed or optional SDK invocation',n.loc.start.line);
    for(const [key,value] of Object.entries(n)){
      if(key==='loc')continue;
      if(Array.isArray(value)){for(const child of value)if(child?.type)stack.push(child);}
      else if(value?.type)stack.push(value);
    }
  }
  if(manifest.PrivateAPI)note('private-api','private Ulanzi APIs');
  if(manifest.Actions.length!==1)note('multi-action','multi-action candidate requires separate resource and release review');
  if(manifest.Actions.some(a=>a.PropertyInspectorPath))note('property-inspector','property inspector requires separate conversion');
  if(manifest.Actions.some(a=>a.Icon||(Array.isArray(a.States)&&a.States.some(s=>s?.Image))))note('artwork','original state/icon resources require preservation and verification');
  const multi=manifest.Actions.length>1;
  const knownIds=new Set(manifest.Actions.map(a=>a.UUID));
  const actionResults=[];
  const validController=a=>{const cs=a.Controllers||['Keypad'];return Array.isArray(cs)&&cs.length===1&&['Keypad','Encoder'].includes(cs[0]);};
  const eligible=(a,method)=>validController(a)&&(!method.startsWith('onDial')||(a.Controllers||['Keypad'])[0]==='Encoder')&&(!method.startsWith('onKey')||(a.Controllers||['Keypad'])[0]==='Keypad');
  for(const a of manifest.Actions){
  const controllers=a.Controllers||['Keypad'];
  const states=Array.isArray(a.States)&&a.States.length?a.States.length:1;
  if(!Array.isArray(controllers)||controllers.length!==1||!['Keypad','Encoder'].includes(controllers[0])||![1,2].includes(states))
    note('controller-state','unsupported controller or state combination');
  const programs=Object.create(null),sourceEvents=[],registered=new Set();
  let structurallySafe=true,connected=false,declared=false;
  const reject=(n,why)=>{structurallySafe=false;note('manual-code',why,n?.loc?.start.line||0);};
  for(const node of ast.body){
    if(node.type==='EmptyStatement')continue;
    if(node.type==='ImportDeclaration'){
      // Even the SDK import is reviewed; never load it. Only recognize the
      // conventional SDK constructor shape when generating a candidate.
      const spec=node.specifiers;
      const sdkPath=typeof node.source.value==='string'&&/^(?:\.\/)?(?:[\w-]+\/)*ulanzi-api\/index\.js$/.test(node.source.value);
      const sdkBinding=spec.length===1&&spec[0].local?.name==='UlanziApi'&&
        (spec[0].type==='ImportDefaultSpecifier'||spec[0].imported?.name==='UlanziApi');
      if(!sdkPath||!sdkBinding)reject(node,'external module or unsupported import');
      continue;
    }
    if(node.type==='VariableDeclaration'&&node.kind==='const'&&node.declarations.length===1){
      const d=node.declarations[0];
      if(!declared&&d.id.type==='Identifier'&&d.id.name==='$UD'&&d.init?.type==='NewExpression'&&
        d.init.callee?.name==='UlanziApi'&&d.init.arguments.length===0){declared=true;continue;}
    }
    const call=node.type==='ExpressionStatement'?node.expression:null,method=udCall(call);
    if(method==='connect'){
      if(connected||call.arguments.length!==1||!lit(call.arguments[0],'string')||call.arguments[0].value!==manifest.UUID)
        reject(node,'connection identity or duplicate connection');
      connected=true;continue;
    }
    if(!method||!own(EVENT_MAP,method)){reject(node,'top-level code or unsupported lifecycle');continue;}
    if(registered.has(method)){reject(node,'duplicate event registration');continue;}
    registered.add(method);
    if(multi&&!eligible(a,method)){
      if(!manifest.Actions.some(other=>eligible(other,method)))reject(node,'no matching controller for event');
      continue;
    }
    const event=EVENT_MAP[method],cb=call.arguments[0];
    if(call.arguments.length!==1||!['ArrowFunctionExpression','FunctionExpression'].includes(cb?.type)||
      cb.async||cb.generator||cb.params.length!==1||cb.params[0]?.type!=='Identifier'||
      (method.startsWith('onDial')&&controllers[0]!=='Encoder')||
      (method.startsWith('onKey')&&controllers[0]!=='Keypad')||own(programs,event)){
      reject(node,'unsupported callback or ambiguous event mapping');continue;
    }
    const param=cb.params[0].name;
    if(param==='$UD'){reject(node,'ambiguous SDK shadowing');continue;}
    const body=cb.body.type==='BlockStatement'?cb.body.body:[{type:'ExpressionStatement',expression:cb.body,loc:cb.loc}];
    const ops=[],sourceCalls=[];
    // Only exact equality against a declared action UUID is interpreted.
    // Never evaluate source expressions, and never route by instance actionid.
    function project(statements,depth=0){
      if(depth>16){reject(node,'action branch depth limit');return [];}
      const out=[];
      for(const statement of statements){
        if(multi&&statement.type==='IfStatement'){
          const test=statement.test;
          const id=test?.type==='BinaryExpression'&&test.operator==='==='&&member(test.left,param,'uuid')&&lit(test.right,'string')?test.right.value:null;
          if(!knownIds.has(id)){reject(statement,'unsupported action UUID condition');continue;}
          const selected=id===a.UUID?statement.consequent:statement.alternate;
          if(selected)out.push(...project(selected.type==='BlockStatement'?selected.body:[selected],depth+1));
        }else out.push(statement);
      }
      return out;
    }
    for(const statement of project(body)){
      if(statement.type==='EmptyStatement')continue;
      const cmd=statement.type==='ExpressionStatement'?statement.expression:null,name=udCall(cmd);
      if(!['setTitle','setState','setImage'].includes(name)||cmd.arguments.length!==2||!member(cmd.arguments[0],param,'context')){
        reject(statement,'only current-context literal display calls are translatable');continue;
      }
      const value=cmd.arguments[1];
      if(name==='setTitle'&&lit(value,'string')&&value.value.length<=256){
        ops.push({op:'title',value:value.value});sourceCalls.push({method:name,value:value.value});
      }else if(name==='setTitle'&&['onAdd','onParamFromApp'].includes(method)&&settingTitle(value,param)){
        const field=settingTitle(value,param);
        ops.push({op:'titleFromSetting',...field});sourceCalls.push({method:'setTitleFromParam',...field});
        note('dynamic-settings','type-guarded title setting requires source setting contract review',statement.loc.start.line);
      }else if(name==='setState'&&['onAdd','onParamFromApp'].includes(method)&&settingState(value,param,states)){
        const field=settingState(value,param,states);
        ops.push({op:'stateFromSetting',...field});sourceCalls.push({method:'setStateFromParam',...field});
        note('dynamic-settings','strict string state comparison requires source setting contract review',statement.loc.start.line);
      }else if(name==='setState'&&lit(value,'number')&&Number.isInteger(value.value)&&value.value>=0&&value.value<states){
        ops.push({op:'state',value:value.value});sourceCalls.push({method:name,value:value.value});
      }
      else if(name==='setImage'&&temporaryImage(value)){
        const image=temporaryImage(value);ops.push({op:'image',value:image});sourceCalls.push({method:name,value:image});
      }else reject(statement,'unsupported display argument');
    }
    if(ops.length>16)reject(node,'event operation limit');
    programs[event]=ops;sourceEvents.push({method,calls:sourceCalls});
  }
  const schema=inspectorSchemas?.get(a.UUID);
  const isRead=op=>['titleFromSetting','stateFromSetting'].includes(op.op);
  const reads=Object.values(programs).flat().filter(isRead);
  const compatible=(op,f)=>op.key===f.key&&['text','select'].includes(f.type)&&
    (op.op==='titleFromSetting'?f.default===op.fallback:
      // Missing source values take the no branch. Do not introduce a
      // different appearance through a matching schema default.
      (f.default!==op.match||op.yes===op.no)&&(f.type==='select'?f.options.some(o=>o.value===op.match):op.match.length<=f.maxLength));
  const schemaBound=Array.isArray(schema)&&schema.length>0&&
    reads.every(op=>schema.some(f=>compatible(op,f)))&&
    schema.every(f=>['appear','settings'].every(event=>programs[event]?.some(op=>isRead(op)&&compatible(op,f))));
  if(a.PropertyInspectorPath&&schemaBound)note('inspector-schema-bound','inert form and source fallback bound; manual inspector review required');
  actionResults.push({a,controllers,states,programs,sourceEvents,schema:schemaBound?schema:undefined,valid:structurallySafe&&connected&&Object.keys(programs).length>0&&
    (!a.PropertyInspectorPath||schemaBound)&&validController(a)&&[1,2].includes(states)&&(!own(a,'States')||Array.isArray(a.States))});
  }
  let candidate=null,verification=null;
  if(!manifest.PrivateAPI&&actionResults.every(x=>x.valid)){
    const id='com.deckforge.native.ulanzi-'+sha(manifest.UUID).slice(0,24);
    const actions=actionResults.map(({a,controllers,states,programs,schema})=>({
      id:multi?id+'.a-'+sha(a.UUID).slice(0,24):id+'.action',name:a.Name,controllers,states,events:programs,...(schema?{settingsSchema:schema}:{}),
      ...(multi&&stateImagesByAction?.has(a.UUID)?{stateImages:stateImagesByAction.get(a.UUID)}:!multi&&stateImages?{stateImages}:{})
    }));
    const native={apiVersion:1,id,name:manifest.Name,version:manifest.Version,permissions:['display'],actions};
    try{
      if(Buffer.byteLength(JSON.stringify(native))>MAX_SOURCE)throw Error('candidate size limit');
      candidate=validateNativeManifest(native);
    }catch{note('candidate-invalid','target SDK validation rejected candidate');}
    if(candidate){
      const traces=multi?actionResults.map((x,i)=>({actionId:actions[i].id,events:x.sourceEvents})):actionResults[0].sourceEvents;
      verification=require('./ulanzi-verifier.cjs').simulateCandidate(candidate,traces);
    }
  }
  if(verification?.status==='fail')note('simulation-failed','converted candidate trace mismatch');
  return {calls:[...calls.values()].sort((a,b)=>a.name.localeCompare(b.name)),imports:[...imports].sort(),findings,candidate,verification};
}
async function analyzeDirectory(folder,{fullFingerprint=false}={}){
  const root=path.resolve(folder),rootStat=await fs.lstat(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!/\.ulanziPlugin$/i.test(path.basename(root)))
    throw Error('select the original .ulanziPlugin directory');
  let total=0;const inventory=[],names=new Set();
  async function walk(dir,prefix=''){
    for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const relative=prefix+e.name;
      if(!safeRelative(relative)||e.isSymbolicLink()||(!e.isFile()&&!e.isDirectory()))
        throw Error('unsafe source file or path');
      if(e.isDirectory()){if(relative.split('/').length>20)throw Error('directory depth limit');await walk(path.join(dir,e.name),relative+'/');continue;}
      if(inventory.length>=MAX_FILES||names.has(relative.toLowerCase()))throw Error('source inventory limit or ambiguous path');
      names.add(relative.toLowerCase());
      const file=path.join(dir,e.name),st=await fs.lstat(file);
      if(!st.isFile()||(total+=st.size)>MAX_BYTES)throw Error('source size limit');
      inventory.push({path:relative,bytes:st.size});
    }
  }
  await walk(root);
  async function readEntry(name,max,verify=true){
    if(!safeRelative(name)||!inventory.some(x=>x.path===name))throw Error('missing source file: '+name);
    const file=path.join(root,...name.split('/')),actual=await fs.realpath(file);
    const realRoot=await fs.realpath(root);
    if(!actual.startsWith(realRoot+path.sep)||!(await fs.lstat(file)).isFile())throw Error('unsafe source entry');
    const st=await fs.stat(file);
    if(st.size>max)throw Error('source entry size limit');
    const bytes=await fs.readFile(file);
    if(bytes.length>max)throw Error('source entry size limit');
    const expected=inventory.find(x=>x.path===name);
    if(verify&&expected.sha256&&sha(bytes)!==expected.sha256)throw Error('source changed during analysis');
    return bytes;
  }
  let sourceTreeSha256=null;
  if(fullFingerprint){
    let hashedBytes=0;
    for(const item of inventory){
      const bytes=await readEntry(item.path,item.bytes,false);
      if(bytes.length!==item.bytes||(hashedBytes+=bytes.length)>MAX_BYTES)throw Error('source changed during analysis');
      item.sha256=sha(bytes);
    }
    sourceTreeSha256=sha(JSON.stringify(inventory.map(({path,bytes,sha256})=>({path,bytes,sha256})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)));
  }
  const manifestBytes=await readEntry('manifest.json',65536);
  const manifest=validateSourceManifest(JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/,'')));
  const entryInfo=inventory.find(x=>x.path===manifest.CodePath);
  if(!entryInfo)throw Error('manifest entrypoint missing');
  const inspectors=[],resources=[],resourcePaths=new Set();
  const addResource=(name,role)=>{
    if(typeof name!=='string'||!name||resourcePaths.has(name)||resourcePaths.size>=256)return;
    resourcePaths.add(name);resources.push({path:name,role});
  };
  addResource(manifest.Icon,'plugin-icon');addResource(manifest.CategoryIcon,'category-icon');
  for(const action of manifest.Actions){
    addResource(action.Icon,'action-icon');
    for(const state of Array.isArray(action.States)?action.States:[])addResource(state?.Image,'state-image');
    if(action.PropertyInspectorPath){
      const file=action.PropertyInspectorPath,record={action:action.UUID,path:file};
      try{
        const bytes=await readEntry(file,MAX_HTML);
        Object.assign(record,{sha256:sha(bytes),...analyzeHtml(file,bytes.toString('utf8'),{inspector:true})});
      }catch{record.status='unreadable-or-unsupported-inspector';}
      inspectors.push(record);
    }
  }
  for(const item of resources){
    if(!safeRelative(item.path)){item.status='unsafe-path';continue;}
    const file=inventory.find(f=>f.path===item.path);
    if(!file){item.status='missing';continue;}
    item.bytes=file.bytes;
    if(file.bytes>256*1024){item.status='oversize';continue;}
    try{const bytes=await readEntry(item.path,256*1024);Object.assign(item,{sha256:sha(bytes),...imageReport(bytes,item.path)});if(item.status==='header-candidate')item.integrity=verifyPng(bytes);}
    catch{item.status='unreadable';}
  }
  // Preserve exact bounded PNG and restricted SVG state resources. Category/plugin/action
  // art with distinct paths still needs a separate conversion decision.
  const stateImagesByAction=new Map(),artRecords=[],usedPaths=new Set(),remaining=new Set();
  let imageBytes=0;
  for(const action of manifest.Actions){
    const declaredStates=Array.isArray(action.States)?action.States:[];
    if(![1,2].includes(declaredStates.length)||!declaredStates.every(s=>typeof s?.Image==='string'&&resources.some(r=>r.path===s.Image&&((r.status==='header-candidate'&&r.integrity?.ok)||r.status==='restricted-vector-review')))){
      if(action.Icon)remaining.add(action.Icon);
      for(const state of declaredStates)if(state?.Image)remaining.add(state.Image);
      continue;
    }
    try{
      const images=[],records=[];
      let size=0;
      for(const [index,s] of declaredStates.entries()){
        const bytes=await readEntry(s.Image,256*1024);
        const digest=sha(bytes);
        const resource=resources.find(r=>r.path===s.Image);
        const svg=resource?.format==='svg';
        if(resource?.sha256!==digest||(svg?svgReport(bytes).status!=='restricted-vector-review':!verifyPng(bytes).ok))throw Error('invalid or changed state image');
        const image='data:image/'+(svg?'svg+xml':'png')+';base64,'+bytes.toString('base64');
        size+=Buffer.byteLength(image);
        images.push(image);records.push({state:index,path:s.Image,sha256:digest,...(svg?{format:'svg'}:{})});
      }
      if(imageBytes+size>MAX_SOURCE)throw Error('aggregate state image limit');
      imageBytes+=size;
      stateImagesByAction.set(action.UUID,images);
      const nativeId='com.deckforge.native.ulanzi-'+sha(manifest.UUID).slice(0,24);
      artRecords.push({sourceAction:action.UUID,actionId:manifest.Actions.length===1?nativeId+'.action':nativeId+'.a-'+sha(action.UUID).slice(0,24),stateImages:records});
      for(const s of declaredStates)usedPaths.add(s.Image);
      if(action.Icon&&!declaredStates.some(s=>s.Image===action.Icon))remaining.add(action.Icon);
    }catch{
      if(action.Icon)remaining.add(action.Icon);
      for(const s of declaredStates)if(s?.Image)remaining.add(s.Image);
    }
  }
  for(const item of resources)if(!usedPaths.has(item.path))remaining.add(item.path);
  // Multi-action artwork roles must remain associated with their original
  // action. A category/plugin icon is not a state image merely because its
  // bytes or path happen to be shared with a different action.
  if(manifest.Actions.length>1){
    if(manifest.Icon)remaining.add(manifest.Icon);
    if(manifest.CategoryIcon)remaining.add(manifest.CategoryIcon);
  }
  const stateImages=stateImagesByAction.get(manifest.Actions[0].UUID);
  const verification=artRecords.some(a=>a.stateImages.some(s=>s.format==='svg'))?'bounded-png-and-restricted-svg':'crc-and-bounded-scanlines';
  const artworkPreservation=artRecords.length?(manifest.Actions.length===1?
    {stateImages:artRecords[0].stateImages,remainingPaths:[...remaining],verification}:
    {actions:artRecords,remainingPaths:[...remaining],verification}):null;
  let report={calls:[],imports:[],findings:[],candidate:null},entryHash=null,htmlEntry=null;
  if(!/\.js$/i.test(manifest.CodePath)){
    report.findings.push({code:'html-entry',detail:'HTML entry requires dependency and behavior review',line:0});
    try{
      const bytes=await readEntry(manifest.CodePath,MAX_HTML);entryHash=sha(bytes);
      htmlEntry=analyzeHtml(manifest.CodePath,bytes.toString('utf8'));
      for(const script of htmlEntry.scripts){
        if(!script.path)continue;
        const info=inventory.find(x=>x.path===script.path);
        script.status=!info?'missing':info.bytes>MAX_SOURCE?'oversize':'review';
        if(script.status==='review'){
          const source=await readEntry(script.path,MAX_SOURCE);script.sha256=sha(source);
        }
      }
    }catch{report.findings.push({code:'html-unreadable',detail:'HTML entry or script inventory unavailable',line:0});}
  }
  else if(entryInfo.bytes>MAX_SOURCE)report.findings.push({code:'large-entry',detail:'bundled entry exceeds static parser limit; source required',line:0});
  else{
    const bytes=await readEntry(manifest.CodePath,MAX_SOURCE);entryHash=sha(bytes);
    const inspectorSchemas=new Map(inspectors.filter(r=>r.staticSchema).map(r=>[r.action,r.settingsSchemaCandidate]));
    report=analyzeSource(manifest,bytes.toString('utf8'),{stateImages,stateImagesByAction,inspectorSchemas});
  }
  // Report licensing evidence, not a legal conclusion; never infer a license.
  const licenseFiles=inventory.filter(x=>/(^|\/)(license|copying|notice)([._-]|$)/i.test(x.path)).map(x=>x.path);
  const licenseHashes=[];
  for(const file of licenseFiles.slice(0,20)){
    const info=inventory.find(x=>x.path===file);
    if(info.bytes<=256*1024)licenseHashes.push({path:file,sha256:sha(await readEntry(file,256*1024))});
  }
  return {converterVersion:3,targetApi:1,inspectors,resources,htmlEntry,artworkPreservation,source:{id:manifest.UUID,name:manifest.Name,version:manifest.Version,
    entry:manifest.CodePath,manifestSha256:sha(manifestBytes),entrySha256:entryHash,...(sourceTreeSha256?{treeSha256:sourceTreeSha256}:{})},
    inventory:{files:inventory.length,bytes:total,licenseFiles,licenseHashes},
    status:report.candidate&&report.verification?.status==='pass'?'candidate-review-required':'manual-conversion-required',
    ...report,installationAllowed:false,requiredChecks:['license','original artwork and resources','semantic comparison','runtime simulation','physical validation']};
}
module.exports={analyzeDirectory,analyzeSource,validateSourceManifest};
if(require.main===module){
  if(process.argv.length!==3){console.error('Usage: node ulanzi-converter.cjs <original.ulanziPlugin>');process.exitCode=2;}
  else analyzeDirectory(process.argv[2]).then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{
    console.error('Ulanzi analysis failed: '+error.message);process.exitCode=1;
  });
}
