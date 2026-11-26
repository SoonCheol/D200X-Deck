'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
// Run the actual renderer function in a narrow VM with fake state; no Electron or hardware needed.
const source=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
const beginning=source.indexOf('function displayItem(item,index,preserveGesture=false){');
const ending=source.indexOf('const previewPressKeys=new Set();',beginning);
if(beginning<0||ending<0)throw Error('SDK renderer not found');
// Include the actual catalogue lookup used by displayItem, not a permissive stub.
const policyStart=source.indexOf('function nativeTitlePolicyFor(item){'),policyEnd=source.indexOf('function nativeInspectorTitle(item){',policyStart);
assert.ok(policyStart>=0&&policyEnd>policyStart);
const fn=source.slice(beginning,ending)+'\n'+source.slice(policyStart,policyEnd);
const core=require('../app/deckforge-editor/deck-core.js');
function render(item,visual,slot=0,clone=false,sdkPlugins=[]){
  const actual=clone?JSON.parse(JSON.stringify(item)):item;
  const original=item;
  const map=new Map([['profile:0::'+slot+':down',visual]]);
  return vm.runInNewContext(fn+';displayItem(item,index)',{
    item:actual,index:slot,sdkPlugins,
    state:{profileId:'profile',page:0,folderPath:[],selected:2},
    sdkVisuals:map,sdkActionDefaults:new Map(),sdkContext:(i,g)=>'profile:0::'+i+':'+g,
    DeckCore:{...core,visibleActions:()=>[original]},timerDeadlines:new Map()
  });
}
test('SDK runtime image renders for both reference and cloned D200X slot',()=>{
  const item={type:'sd-plugin',settings:{}};
  const image='data:image/png;base64,dGVzdA==';
  assert.equal(render(item,{title:'Lamp',image},0).icon.value,image);
  assert.equal(render(item,{title:'Lamp',image},0,true).icon.value,image);
});
test('user selected icon pack artwork is not replaced by SDK image updates',()=>{
  const chosen='data:image/png;base64,dXNlcg==';
  const item={type:'sd-plugin',icon:{kind:'file',value:chosen,packId:'pack-1'}};
  const result=render(item,{image:'data:image/png;base64,cGx1Z2lu',title:'Living'});
  assert.equal(result.icon.value,chosen);
  assert.equal(result.icon.packId,'pack-1');
  assert.equal(result.title,'Living');
});


test('OFF and ON state icons override plugin visual and common icon independently',()=>{
  const off='data:image/png;base64,b2Zm';
  const on='data:image/png;base64,b24=';
  const item={type:'sd-plugin',icon:{kind:'file',value:'common'},settings:{sdkStateIcons:{
    off:{kind:'file',value:off,packId:'icons'},on:{kind:'file',value:on,packId:'icons'}
  }}};
  assert.equal(render(item,{state:0,image:'runtime'},0,true).icon.value,off);
  assert.equal(render(item,{state:1,image:'runtime'},0,true).icon.value,on);
  assert.equal(render(item,{state:1,image:'runtime'},0,true).icon.packId,'icons');
  assert.equal(render(item,{state:0,image:'runtime'}).icon.value,off);
});
test('a missing state-specific image falls back to the normal user icon',()=>{
  const item={type:'sd-plugin',icon:{kind:'file',value:'common'},settings:{sdkStateIcons:{
    on:{kind:'file',value:'on'}
  }}};
  assert.equal(render(item,{state:0,image:'runtime'}).icon.value,'common');
  assert.equal(render(item,{state:1,image:'runtime'}).icon.value,'on');
});


test('Fusion live command artwork has no offline overlay even if plugin connection event was missed',()=>{
  const item={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',
    actionUUID:'com.autodesk.fusionstreamdeck.runcommand',pluginSettings:{commandId:'ExtrudeCommand'}}};
  const image='data:image/png;base64,bGl2ZQ==';
  const ctx='profile:0::0:down';
  const result=vm.runInNewContext(fn+';displayItem(item,0)',{
    item,state:{profileId:'profile',page:0,folderPath:[]},
    sdkVisuals:new Map([[ctx,{image}]]),
    sdkContext:()=>ctx,DeckCore:{...core,visibleActions:()=>[item]},
    timerDeadlines:new Map(),fusionCommandId:()=> 'ExtrudeCommand',
    fusionConnected:new Set(),FUSION_PLUGIN:'com.autodesk.fusionstreamdeck',
    fusionOfflineContexts:new Set(),fusionLiveContexts:new Set([ctx]),
    fusionHealthAvailable:true,
    fusionIconCache:new Map(),requestFusionIcon:()=>{}
  });
  assert.equal(result.fusionOffline,false);
  assert.equal(result.icon.value,image);
});
test('Fusion disabled command image retains cached artwork and adds offline overlay',()=>{
  const item={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',
    actionUUID:'com.autodesk.fusionstreamdeck.runcommand',pluginSettings:{commandId:'ExtrudeCommand'}}};
  const image='data:image/png;base64,Y2FjaGU=';
  const ctx='profile:0::0:down';
  const result=vm.runInNewContext(fn+';displayItem(item,0)',{
    item,state:{profileId:'profile',page:0,folderPath:[]},
    sdkVisuals:new Map([[ctx,{image:'data:image/svg+xml;base64,b2ZmbGluZQ=='}]]),
    sdkContext:()=>ctx,DeckCore:{...core,visibleActions:()=>[item]},
    timerDeadlines:new Map(),fusionCommandId:()=> 'ExtrudeCommand',
    fusionConnected:new Set(['com.autodesk.fusionstreamdeck']),FUSION_PLUGIN:'com.autodesk.fusionstreamdeck',
    fusionOfflineContexts:new Set([ctx]),fusionLiveContexts:new Set(),
    fusionHealthAvailable:false,
    fusionIconCache:new Map([['ExtrudeCommand',image]]),requestFusionIcon:()=>{}
  });
  assert.equal(result.fusionOffline,true);
  assert.equal(result.icon.value,image);
});


test('Fusion healthy add-in removes X even if a stale disabled image was received',()=>{
  const item={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',
    actionUUID:'com.autodesk.fusionstreamdeck.runcommand',pluginSettings:{commandId:'ExtrudeCommand'}}};
  const ctx='profile:0::0:down',image='data:image/png;base64,bGl2ZQ==';
  const result=vm.runInNewContext(fn+';displayItem(item,0)',{
    item,state:{profileId:'profile',page:0,folderPath:[]},
    sdkVisuals:new Map([[ctx,{image}]]),sdkContext:()=>ctx,DeckCore:{...core,visibleActions:()=>[item]},
    timerDeadlines:new Map(),fusionCommandId:()=> 'ExtrudeCommand',
    fusionConnected:new Set(['com.autodesk.fusionstreamdeck']),FUSION_PLUGIN:'com.autodesk.fusionstreamdeck',
    fusionOfflineContexts:new Set([ctx]),fusionLiveContexts:new Set(),
    fusionHealthAvailable:true,
    fusionIconCache:new Map(),requestFusionIcon:()=>{}
  });
  assert.equal(result.fusionOffline,false);
});
test('Fusion unavailable add-in adds X even if Stream Deck plugin stays connected',()=>{
  const item={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',
    actionUUID:'com.autodesk.fusionstreamdeck.runcommand',pluginSettings:{commandId:'ExtrudeCommand'}}};
  const ctx='profile:0::0:down',image='data:image/png;base64,Y2FjaGU=';
  const result=vm.runInNewContext(fn+';displayItem(item,0)',{
    item,state:{profileId:'profile',page:0,folderPath:[]},
    sdkVisuals:new Map([[ctx,{image}]]),sdkContext:()=>ctx,DeckCore:{...core,visibleActions:()=>[item]},
    timerDeadlines:new Map(),fusionCommandId:()=> 'ExtrudeCommand',
    fusionConnected:new Set(['com.autodesk.fusionstreamdeck']),FUSION_PLUGIN:'com.autodesk.fusionstreamdeck',
    fusionOfflineContexts:new Set(),fusionLiveContexts:new Set([ctx]),
    fusionHealthAvailable:false,
    fusionIconCache:new Map([['ExtrudeCommand',image]]),requestFusionIcon:()=>{}
  });
  assert.equal(result.fusionOffline,true);
  assert.equal(result.icon.value,image);
});

test('Fusion drag payload retains SVG command artwork',()=>{
 const drag=require('../app/deckforge-editor/fusion-drag.cjs');
 const svg='data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64');
 assert.equal(drag.decode(drag.encode({id:'ExtrudeCommand',name:'돌출',svg})).svg,svg);
});

test('Fusion icon IPC reads both trusted PNG and fallback cached PNG',async()=>{
 const os=require('node:os'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'d200x-fusion-png-'));
 try{
  const handlers=new Map();
  const main=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/main.cjs'),'utf8');
  const start=main.indexOf('const fusionCacheDir=');
  const end=main.indexOf("ipcMain.handle('d200x:sdk-list'",start);
  assert.ok(start>=0&&end>start,'Fusion IPC source block');
  vm.runInNewContext(main.slice(start,end),{
   fs,path,app:{getPath:()=>tmp},assertEditor:()=>{},
   ipcMain:{handle:(channel,fn)=>handlers.set(channel,fn)}
  });
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from([1,2,3,4])]);
  const original=path.join(tmp,'Cache','Fusion','original');
  const cached=path.join(tmp,'Cache','Fusion','generated');
  fs.mkdirSync(original,{recursive:true});fs.mkdirSync(cached,{recursive:true});
  fs.writeFileSync(path.join(original,'FirstCommand.png'),png);
  fs.writeFileSync(path.join(cached,'SecondCommand.png'),png);
  const read=handlers.get('d200x:fusion-icon-read');
  assert.equal(await read({},'FirstCommand'),'data:image/png;base64,'+png.toString('base64'));
  assert.equal(await read({},'SecondCommand'),'data:image/png;base64,'+png.toString('base64'));
  assert.equal(await read({},'NotPresent'),null);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('Pinned key inspector preview refreshes when page slot is empty',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const start=source.indexOf('let previewRequest=0;');
 const end=source.indexOf('window.refreshSelectedVisual=refreshSelectedVisual;',start);
 assert.ok(start>=0&&end>start,'Inspector preview source block');
 const pinned={type:'sd-plugin',title:'고정 키'};
 const area={replaceChildren(...children){this.children=children;}};
 const state={selected:0,pinned:[pinned]};
 const window={renderDeckKeyImage:async()=>Buffer.from('preview').toString('base64')};
 const $=key=>key==='icon-preview-content'?area:key==='icon-preview'?{querySelector:()=>null}:null;
 await vm.runInNewContext(source.slice(start,end)+';refreshSelectedVisual()',{
  state,window,DeckCore:{visibleActions:()=>[pinned]},currentPage:()=>[null],
  pressIsOrdinary:()=>false,pressSlotAction:()=>null,isCurrentInspectorAction:item=>item===pinned,
  displayItem:x=>x,inspectorDisplayItem:x=>x,displayKeyPressItem:x=>x,previewPressKeys:new Set(),
  isMomentaryIconAction:()=>false,haPreviewStates:new WeakMap(),sdkVisuals:new Map(),
  sdkContext:()=>'',sdkActionDefaults:new Map(),$,document:{createElement:()=>({className:'',src:''})},
  console
 });
 assert.equal(area.children?.[0]?.src,'data:image/png;base64,'+Buffer.from('preview').toString('base64'));
});

test('read-only SDK manifest artwork appears when no runtime image exists',()=>{
 const item={type:'sd-plugin',settings:{actionUUID:'example.action'}};
 const key='profile:0::0:down';
 const common={state:1},defaults=new Map([['example.action',{off:'data:image/png;base64,T0ZG',on:'data:image/png;base64,T04='}]]);
 const result=vm.runInNewContext(fn+';displayItem(item,0)',{
   item,state:{profileId:'profile',page:0,folderPath:[]},
   sdkVisuals:new Map([[key,common]]),sdkActionDefaults:defaults,
   sdkContext:()=>key,DeckCore:{...core,visibleActions:()=>[item]},timerDeadlines:new Map()
 });
 assert.equal(result.icon.value,'data:image/png;base64,T04=');
 assert.equal(common.image,undefined,'must not fabricate live setImage event');
});

test('native visual events coalesce per current slot, without redrawing unrelated inspector',()=>{
 const begin=source.indexOf('const nativeVisualDirty=new Map();'),end=source.indexOf('// One compact, text-only tooltip',begin);
 assert.ok(begin>=0&&end>begin);
 let pending,entries=[{slot:2,context:'a'},{slot:4,context:'b'}],calls=[];
 const state={selected:2};
 const context={state,sdkActionInstances:()=>entries,setTimeout:fn=>{pending=fn;return 1;},
   renderGrid:slots=>calls.push(['grid',...slots]),window:{scheduleNativeDeckSync:slots=>calls.push(['device',...slots])},
   DeckCore:{visibleActions:()=>[null,null,{}]},haPreviewStates:new WeakMap(),
   refreshSelectedVisual:()=>calls.push(['preview']),refreshStateTitleCards:()=>calls.push(['cards'])};
 vm.runInNewContext(source.slice(begin,end)+';queueNativeVisualRefresh({slot:2,context:"a"});queueNativeVisualRefresh({slot:2,context:"a"});queueNativeVisualRefresh({slot:4,context:"b"});',context);
 entries=[{slot:2,context:'a'}];pending();
 assert.deepEqual(calls,[['grid',2],['device',2],['preview'],['cards']]);
});
test('native device refresh reuses cached PNGs and falls back on a changed page',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const begin=code.indexOf('  async function synchronize('),end=code.indexOf('  function runScheduledRender()',begin);
 assert.ok(begin>=0&&end>begin);
 const old=Array.from({length:14},(_,index)=>({index,png:'old-'+index}));
 const rendered=[],sent=[],dirtyNativeSlots=new Map([[3,1],[7,2]]);
 const ctx={dirtyNativeSlots,renderSerial:0,rendering:false,fullPending:false,renderRetryCount:0,lastSentImages:old,lastSentPageStamp:'p',lastSentWideMode:'blank',
  ensureRenderTimer:()=>assert.fail('unexpected timer'),warningPageStamp:()=> 'p',window:{getD200XWideMode:()=> 'blank',getD200XDisplayItem:x=>x},
  state:{folderPath:[]},DeckCore:{visibleActions:()=>Array(14).fill(null)},document:{fonts:{ready:Promise.resolve()}},
  drawSlot:async(_,index)=>{rendered.push(index);return {index,png:'new-'+index};},
  cacheAndSendImages:images=>sent.push(images),schedule:()=>assert.fail('unexpected fallback'),text:()=>assert.fail('render error')};
 await vm.runInNewContext(code.slice(begin,end)+';synchronize(true)',ctx);
 assert.deepEqual(rendered,[3,7]);assert.equal(sent[0].length,14);
 assert.equal(sent[0][0],old[0]);assert.equal(sent[0][3].png,'new-3');
 assert.equal(old[3].png,'old-3');
 rendered.length=0;dirtyNativeSlots.set(3,3);ctx.lastSentPageStamp='other';
 await vm.runInNewContext(code.slice(begin,end)+';synchronize(true)',ctx);
 assert.deepEqual(rendered,Array.from({length:14},(_,i)=>i));
});

test('HA device auto title preserves custom independent state labels',()=>{
 const start=source.indexOf('function isNativeHaControl('),end=source.indexOf('function defaultStateTitlePair(',start);
 const item={type:'sd-plugin',title:'',settings:{actionUUID:'com.deckforge.native.home-assistant.control',stateTitles:{first:{title:''},second:{title:'사용자 제목'}}}};
 const ctx={item};
 vm.runInNewContext(source.slice(start,end)+';autoHaControlTitle(item,"주방등");',ctx);
 assert.equal(item.title,'주방등');assert.equal(item.settings.stateTitles.first.title,'주방등');assert.equal(item.settings.stateTitles.second.title,'사용자 제목');
 vm.runInNewContext(source.slice(start,end)+';autoHaControlTitle(item,"거실등");',ctx);
 assert.equal(item.title,'거실등');assert.equal(item.settings.stateTitles.first.title,'거실등');assert.equal(item.settings.stateTitles.second.title,'사용자 제목');
});
test('title properties prefer the right side of the complete icon region and stay in bounds',()=>{
 const start=source.indexOf('function titlePopoverPosition('),end=source.indexOf('function positionTitleStylePopover(',start);
 const position=vm.runInNewContext(source.slice(start,end)+';titlePopoverPosition');
 const region={left:60,right:620,top:250,bottom:580},trigger={right:250,top:300};
 const right=position(region,trigger,{width:277,height:300},1000,700);
 assert.ok(right.x>=region.right+8);assert.ok(right.x+277<=992);
 const left=position({...region,left:380,right:950},trigger,{width:277,height:300},1000,700);
 assert.ok(left.x+277<=372);assert.ok(left.x>=8);
 const above=position({left:20,right:780,top:390,bottom:700},trigger,{width:277,height:300},800,750);
 assert.ok(above.y+300<=382);assert.ok(above.x>=8);
});


test('stable key surface keeps a decoded image until the current replacement decodes',async()=>{
 const begin=source.indexOf('const deckKeyPaints=new WeakMap();'),end=source.indexOf('function createDeckGridButton',begin);
 assert.ok(begin>=0&&end>begin);
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 const frames=[],decodes=[],warnings=[];
 const button={isConnected:true,children:[],replaceChildren(...children){this.children=children;}};
 const window={prepareDeckKeyImage:visual=>({signature:visual.title,render:()=>{
   const job=deferred();frames.push(job);return job.promise;
 }})};
 const ctx={window,button,ACTIONS:new Map(),appendKeyPressNumber(){},updateTitleAppearance(){},
  iconNode:()=>({classList:{add(){}}}),document:{createElement:tag=>{
    if(tag!=='img')return {className:'',textContent:''};
    const job=deferred();decodes.push(job);return {src:'',decode:()=>job.promise};
  }},console:{warn:(...args)=>warnings.push(args)}};
 const paint=vm.runInNewContext(source.slice(begin,end)+';paintDeckKey',ctx);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const owner={type:'hotkey'};
 const render=(title,scope='a',item=owner)=>paint(button,item,{title},0,scope,item);
 render('first');await flush();frames[0].resolve('one');await flush();decodes[0].resolve();await flush();
 const first=button.children[0];assert.equal(first.src,'data:image/png;base64,one');
 render('first');await flush();assert.equal(frames.length,1);assert.equal(button.children[0],first);
 render('second');await flush();assert.equal(button.children[0],first);
 frames[1].resolve('two');await flush();assert.equal(button.children[0],first);
 render('third');await flush();decodes[1].resolve();await flush();assert.equal(button.children[0],first,'stale decode must not replace current image');
 frames[2].resolve('three');await flush();decodes[2].resolve();await flush();
 assert.equal(button.children[0].src,'data:image/png;base64,three');
 const third=button.children[0];render('failure');await flush();frames[3].reject(Error('bad frame'));await flush();assert.equal(button.children[0],third);
 assert.equal(warnings.length,1);
 render('failure');await flush();assert.equal(frames.length,5,'failed requested frame is retried');
 frames[4].reject(Error('still invalid'));await flush();assert.equal(button.children[0],third);
 render('new page','b');await flush();assert.notEqual(button.children[0],third,'never display old page action on new page');
 frames[5].resolve('four');await flush();decodes[3].resolve();await flush();
 assert.equal(button.children[0].src,'data:image/png;base64,four');
});


test('dirty revisions survive in-flight rendering, page invalidation and failed submissions',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const begin=code.indexOf('  async function synchronize('),end=code.indexOf('  bridge.ready();',begin);
 assert.ok(begin>=0&&end>begin);
 const images=Array.from({length:14},(_,index)=>({index,png:'old-'+index}));
 let stamp='page-a',mode='blank',pending=new Map(),sent=[],timers=[],error=false;
 const ctx={dirtyNativeSlots:new Map(),renderSerial:0,slotRevision:0,rendering:false,fullPending:false,renderRetryCount:0,timeout:null,
  lastSentImages:images,lastSentPageStamp:stamp,lastSentWideMode:mode,warningPageStamp:()=>stamp,
  pageStamp:()=>stamp,pageEntry:{scope:stamp,token:'test-1',collecting:false},pageGeneration:1,pageSession:'test',displayedPageToken:'test-1',PAGE_ENTRY_MAX_MS:500,
  pressedKeys:new Map(),releaseTimers:new Map(),
  window:{getD200XWideMode:()=>mode,getD200XDisplayItem:x=>x},state:{folderPath:[]},
  DeckCore:{visibleActions:()=>Array(14).fill(null)},drawSlot:(_,index)=>new Promise((resolve,reject)=>pending.set(index,{resolve,reject})),
  cacheAndSendImages:(frames,m,s)=>{sent.push({frames,m,s});ctx.lastSentImages=frames;ctx.lastSentPageStamp=s;ctx.lastSentWideMode=m;},
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},text:()=>{error=true;}};
 vm.runInNewContext(code.slice(begin,end)+';window.flushRender=synchronize;',ctx);
 const flush=()=>new Promise(resolve=>setImmediate(resolve)),request=ctx.window.scheduleNativeDeckSync;
 const complete=()=>{for(const [index,job] of pending)job.resolve({index,png:'new-'+index});pending.clear();};
 request([2]);const first=ctx.window.flushRender(true);
 request([2,4]);assert.equal(ctx.dirtyNativeSlots.size,2);
 await ctx.window.flushRender(true);assert.equal(pending.size,1,'no overlapping render');
 complete();await first;assert.equal(sent.length,1);assert.deepEqual([...ctx.dirtyNativeSlots.keys()],[2,4]);
 const second=ctx.window.flushRender(true);complete();await second;assert.equal(sent.length,2);assert.equal(ctx.dirtyNativeSlots.size,0);
 request([3]);const stale=ctx.window.flushRender(true);stamp='page-b';ctx.window.scheduleDeckSync(0);request([5]);complete();await stale;
 assert.equal(sent.length,2,'old page must never be submitted');assert.equal(ctx.fullPending,true);
 ctx.fullPending=false;const failed=ctx.window.flushRender(false);
 pending.get(5).reject(Error('decode failure'));pending.delete(5);complete();await failed;await flush();
 assert.equal(error,true);assert.equal(sent.length,2);assert.equal(ctx.dirtyNativeSlots.has(3),false,'old scope dirty slot retired');assert.equal(ctx.dirtyNativeSlots.has(5),true,'current scope dirty slot retained');assert.equal(ctx.fullPending,true);
 ctx.fullPending=false;const recovered=ctx.window.flushRender(false);complete();await recovered;
 assert.equal(sent.length,3);assert.equal(sent.at(-1).s,'page-b');assert.equal(ctx.dirtyNativeSlots.size,0);assert.equal(ctx.renderRetryCount,0);
});


test('Fusion repeated titles/images/states do not request new visual frames',()=>{
 const start=source.indexOf('function fusionVisualDelta('),end=source.indexOf('async function refreshFusionHealth(',start);
 assert.ok(start>=0&&end>start);
 const delta=vm.runInNewContext(source.slice(start,end)+';fusionVisualDelta');
 let visual=null;
 const image={kind:'setImage',payload:{image:'data:image/png;base64,QQ=='}};
 for(const msg of [{kind:'setTitle',payload:{title:'Extrude'}},image,{kind:'setState',payload:{state:1}}]){
   visual=delta(visual,msg);assert.ok(visual);
   assert.equal(delta(visual,msg),null);
 }
 assert.equal(delta(visual,{kind:'setImage',payload:{image:'https://example.com'}}),null);
 assert.equal(delta(visual,{kind:'setState',payload:{state:0}}).state,0);
 assert.equal(delta(visual,{kind:'setImage',payload:{image:'data:image/png;base64,Qg=='}}).image,'data:image/png;base64,Qg==');
});
test('Fusion health checks repaint only mounted Fusion slots on actual transitions',async()=>{
 const start=source.indexOf('function queueFusionVisualRefresh('),end=source.indexOf('function fusionCommandId(',start);
 assert.ok(start>=0&&end>start);
 const FUSION_PLUGIN='com.autodesk.fusionstreamdeck';
 const entries=[{pluginUUID:FUSION_PLUGIN,slot:2,settings:{commandId:'one'}},{pluginUUID:'other',slot:3},{pluginUUID:FUSION_PLUGIN,slot:5,settings:{commandId:'two'}}];
 let health=false;const calls=[];
 const ctx={FUSION_PLUGIN,sdkActionInstances:()=>entries,queueNativeVisualRefresh:x=>calls.push(x.slot),fusionHealthAvailable:null,fusionHealthBusy:false,window:{deckBridge:{fusionHealth:async()=>health}},console};
 vm.runInNewContext(source.slice(start,end)+';this.refresh=refreshFusionHealth;this.iconRefresh=queueFusionVisualRefresh;',ctx);
 await ctx.refresh();assert.deepEqual(calls,[2,5]);
 await ctx.refresh();assert.deepEqual(calls,[2,5]);
 health=true;await ctx.refresh();assert.deepEqual(calls,[2,5,2,5]);
 ctx.iconRefresh('two');assert.deepEqual(calls,[2,5,2,5,5]);
});

test('state popup uses complete clicked card outer border instead of artwork border for palette and font',()=>{
 const start=source.indexOf('function appearancePalettePosition('),end=source.indexOf('function positionAppearancePalette(',start);
 const up={getBoundingClientRect:()=>({left:32,right:164,top:172,bottom:304,width:132,height:132})};
 const down={getBoundingClientRect:()=>({left:276,right:408,top:172,bottom:304,width:132,height:132})};
 const root={querySelector:()=>null};
 const ctx={window:{innerWidth:894,innerHeight:600},$:()=>root};
 const position=vm.runInNewContext(source.slice(start,end)+';positionIconAppearancePopover',ctx);
 function trigger(image,isPalette){const left=image===up?24:268,right=image===up?256:499;const card={querySelector:()=>image,getBoundingClientRect:()=>({left,right,top:106,width:right-left,height:220})};return {closest:s=>s==='.sdk-state-preview,#icon-preview'&&isPalette?image:s==='.sdk-state-icon'?card:null};}
 for(const [image,x] of [[up,264],[down,507]])for(const isPalette of [true,false]){
  const popup={style:{},getBoundingClientRect(){return {width:isPalette?251:277,height:Math.min(500,Number.parseInt(this.style.maxHeight)||500)};}};
  assert.equal(position(popup,trigger(image,isPalette)),true);
  assert.equal(popup.style.left,x+'px');assert.equal(popup.style.top,'106px');assert.equal(popup.style.maxHeight,'486px');
 }
});

test('icon library and maker use the selected card outer edge, reset on close and keep their system pickers unchanged',()=>{
 const start=source.indexOf('function appearancePalettePosition('),end=source.indexOf('function positionAppearancePalette(',start);
 const modalStart=source.indexOf('function positionIconDialog('),modalEnd=source.indexOf('function openIconLibrary(',modalStart);
 const root={querySelector:()=>null};
 const context={window:{innerWidth:894,innerHeight:600},$:()=>root};
 const funcs=vm.runInNewContext(source.slice(start,end)+'\n'+source.slice(modalStart,modalEnd)+'\n;({openAnchoredIconDialog,closeAnchoredIconDialog,positionIconDialog})',context);
 function modal(width){
  const dialog={style:{},getBoundingClientRect(){return {width:Math.min(width,parseInt(this.style.maxWidth)||width),height:Math.min(530,parseInt(this.style.maxHeight)||530)};}};
  const overlay={hidden:true,querySelector:()=>dialog,classList:{toggle(_c,v){overlay.anchored=v;}}};
  return {overlay,dialog};
 }
 function trigger(left,right){
  const preview={getBoundingClientRect:()=>({left:left+8,right:left+140,top:172,width:132,height:132})};
  const card={querySelector:()=>preview,getBoundingClientRect:()=>({left,right,top:106,width:right-left,height:220})};
  return {isConnected:true,closest:s=>s==='.sdk-state-icon'?card:null};
 }
 for(const [width,min] of [[455,360],[320,300]])for(const [left,right] of [[24,256],[268,499]]){
  const {overlay,dialog}=modal(width),button=trigger(left,right);
  funcs.openAnchoredIconDialog(overlay,button,min);
  assert.equal(overlay.hidden,false);assert.equal(overlay.anchored,true);
  assert.equal(dialog.style.left,(right+8)+'px');assert.equal(dialog.style.top,'106px');
  assert.equal(dialog.style.maxHeight,'486px');
  funcs.closeAnchoredIconDialog(overlay);
  assert.equal(overlay.hidden,true);assert.equal(overlay.anchored,false);
  assert.equal(dialog.style.left,'');assert.equal(dialog.style.maxWidth,'');
 }
 assert.match(source,/openAnchoredIconDialog\(\$\("icon-library"\),trigger,360\)/);
 assert.match(source,/openAnchoredIconDialog\(\$\("icon-maker"\),trigger,300\)/);
 assert.match(source,/openIconLibrary\(item,'press:'\+key,event.currentTarget\)/);
 assert.match(source,/openIconMaker\(item,'press:'\+key,event.currentTarget\)/);
});

test('HA sensor live layer never replaces the user image or title, including cloned device actions',()=>{
 const item={type:'sd-plugin',title:'내 제목',settings:{actionUUID:'com.deckforge.native.home-assistant.sensor'},
  icon:{kind:'file',value:'custom',packId:'pack'}};
 const before=JSON.stringify(item);
 for(const clone of [false,true]){
  const result=render(item,{image:'live-1',title:''},0,clone);
  assert.equal(result.sensorDisplay,true);assert.equal(result.sensorOverlay,'live-1');
  assert.equal(result.icon.value,'custom');assert.equal(result.title,'내 제목');
  assert.equal(render(item,{image:'live-2'},0,clone).sensorOverlay,'live-2');
 }
 assert.equal(JSON.stringify(item),before);
 const empty=render({...item,icon:undefined},{image:'live-3'});
 assert.equal(empty.icon,undefined);assert.equal(empty.sensorOverlay,'live-3');
});
test('common key compositor draws HA readings over artwork and under title; cache tracks live readings',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const start=code.indexOf('  const bitmapCache='),end=code.indexOf('  // Same compositor feeds',start);
 assert.ok(start>=0&&end>start);
 const ops=[];
 const canvas={getContext:()=>({fillStyle:'',fillRect(){ops.push(['background',this.fillStyle]);},drawImage(image){ops.push(['image',image.id]);},fillText(value){ops.push(['glyph',value]);}}),toDataURL:()=> 'data:image/png;base64,ok'};
 const context={DeckCore:core,window:{D200XPanelIcons:{keyArtwork:()=> 'generic'}},ACTIONS:new Map(),keyPressed:()=>false,
  document:{createElement:()=>canvas,fonts:{}},imageLoaded:async id=>({id,width:144,height:144}),
  drawText:(_ctx,title)=>ops.push(['title',title])};
 const f=vm.runInNewContext(code.slice(start,end)+';({prepareDeckKeyImage,keyDescriptor,composeSlot})',context);
 const item={type:'sd-plugin',sensorDisplay:true,sensorOverlay:'live-1',icon:{kind:'file',value:'custom'},title:'title',keyBackground:{enabled:true,color:'#ff0000'}};
 const first=f.prepareDeckKeyImage(item,0),next=f.prepareDeckKeyImage({...item,sensorOverlay:'live-2'},0);
 assert.notEqual(first.signature,next.signature);
 await first.render();
 assert.deepEqual(ops,[['background','#ff0000'],['image','custom'],['image','live-1'],['title','title']]);
 ops.length=0;await next.render();
 assert.deepEqual(ops,[['background','#ff0000'],['image','custom'],['image','live-2'],['title','title']]);
 ops.length=0;await f.prepareDeckKeyImage({...item,icon:undefined},0).render();
 assert.deepEqual(ops,[['background','#ff0000'],['image','live-1'],['title','title']]);
 ops.length=0;await f.prepareDeckKeyImage({...item,sensorOverlay:null},0).render();
 assert.deepEqual(ops,[['background','#ff0000'],['image','custom'],['title','title']]);
});

test('single-state foreground actions use Key Up and disabled Key Down cards with standard commands and default background',()=>{
 const begin=source.indexOf('function hasSingleBasicIconCard('),end=source.indexOf('function bindSdkStateIcons(',begin);
 function node(tag){return {tag,children:[],style:{},classList:{add(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(type,fn){this[type]=fn;}};}
 const panel=node('section'),title=node('div'),line=node('div'),check=node('input'),background=[];
 const settings=node('button'),moved=[];
 title.querySelector=selector=>selector==='[data-sdk-inspector]'?settings:line;title.before=el=>moved.push(el);
 const root={querySelector:selector=>selector==='[data-inspector-icons]'?panel:title};
 const sensor={type:'sd-plugin',settings:{actionUUID:'com.deckforge.native.home-assistant.sensor'}};
 const ctx={DeckCore:core,$:()=>check,document:{createElement:node},PALETTE_ICON:'',bindKeyBackgroundControl:(image,item,key)=>background.push([image,item,key])};
 const bind=vm.runInNewContext(source.slice(begin,end)+';bindNativeForegroundIconCard',ctx);
 bind(root,sensor);
 const cards=panel.children[0],card=cards.children[0];
 assert.equal(cards.children.length,2);assert.equal(card.className,'sdk-state-icon ha-sensor-edit-card');
 assert.equal(card.children[0].textContent,'Key Up');
 const down=cards.children[1];assert.equal(down.children[0].textContent,'Key Down');assert.equal(down.inert,true);
 assert.ok(down.children[1].children.every(x=>x.disabled));assert.ok(down.children[3].children.every(x=>x.disabled));
 assert.deepEqual(moved,[settings]);
 assert.deepEqual(title.children,[check,line]);
 assert.equal(card.children[2].className,'sdk-state-preview');
 assert.deepEqual(card.children[3].children.map(button=>button.textContent),['라이브러리','파일','클립보드','특수문자','초기화']);
 assert.equal(background[0][2],'default');
 bind(root,{type:'sd-plugin',settings:{actionUUID:'com.deckforge.native.home-assistant.control'}});
 assert.equal(panel.children.length,1);
 const pluginUUID='com.deckforge.native.example.settings',actionUUID=pluginUUID+'.key';
 ctx.sdkPlugins=[{uuid:pluginUUID,runtime:'deckforge-sdk',actions:[{uuid:actionUUID,states:1,visualPolicy:'foreground'}]}];
 // New VM: the function's lexical environment must see the catalogue.
 const genericBind=vm.runInNewContext(source.slice(begin,end)+';bindNativeForegroundIconCard',ctx);
 genericBind(root,{type:'sd-plugin',settings:{pluginUUID,actionUUID}});
 assert.equal(panel.children.length,2);
 const generic=panel.children[1];
 assert.equal(generic.children.length,2);
 assert.equal(generic.style.gridTemplateColumns,undefined);
 assert.equal(generic.children[0].children[0].textContent,'Key Up');
 const disabled=generic.children[1];
 assert.equal(disabled.children[0].textContent,'Key Down');assert.equal(disabled.inert,true);
 assert.ok(disabled.children[1].children.every(x=>x.disabled));
 assert.ok(disabled.children[2].children.every(x=>x.disabled));
 assert.ok(disabled.children[3].children.every(x=>x.disabled));
 assert.equal(background.at(-1)[2],'default');
});

test('renderer title policy preserves manual empty title and keeps user artwork on cloned slots',()=>{
 const pluginUUID='com.deckforge.native.example.settings',actionUUID=pluginUUID+'.key';
 const plugins=[{uuid:pluginUUID,runtime:'deckforge-sdk',actions:[{uuid:actionUUID,titlePolicy:{defaultTitle:'Default',selectionLabel:'device'}}]}];
 const item={type:'sd-plugin',title:'',icon:{kind:'file',value:'custom'},settings:{pluginUUID,actionUUID,pluginSettings:{device:'a'}}};
 const show=(visual)=>render(item,visual,0,true,plugins);
 assert.equal(show(undefined).title,'Default');
 assert.equal(show({title:'Live',image:'runtime'}).title,'Live');
 item.settings.nativeTitleSelection={key:'device',value:'a',label:'Device A'};
 assert.equal(show({title:'Live'}).title,'Device A');
 item.settings.pluginSettings.device='b';
 assert.equal(show({title:'Live'}).title,'Live');
 item.settings.nativeTitleExplicit=true;
 const result=show({title:'Live',image:'runtime'});
 assert.equal(result.title,'');
 assert.equal(result.icon.value,'custom');
 assert.equal(item.title,'');
 assert.equal(render(item,{title:'Legacy'},0,true,[]).title,'Legacy');
});

test('new HA policy renders old saved auto title without rewriting original profile',()=>{
 const pluginUUID='com.deckforge.native.home-assistant',actionUUID=pluginUUID+'.control';
 const plugins=[{uuid:pluginUUID,runtime:'deckforge-sdk',actions:[{uuid:actionUUID,titlePolicy:{selectionLabel:'entity',defaultTitle:'기기 선택'}}]}];
 const item={type:'sd-plugin',title:'거실등',settings:{pluginUUID,actionUUID,haAutoTitle:'거실등',pluginSettings:{entity:'switch.a'},stateTitles:{first:{title:'거실등'},second:{title:'직접 입력'}}}};
 const before=JSON.stringify(item);
 const result=render(item,{title:'Live'},0,true,plugins);
 assert.equal(result.title,'거실등');
 assert.equal(result.settings.nativeTitleAutoStates.first,true);
 assert.equal(result.settings.nativeTitleAutoStates.second,false);
 assert.equal(JSON.stringify(item),before);
});

test('non-HA native foreground action uses shared live layer and title policy with cloned slots',()=>{
 const pluginUUID='com.deckforge.native.example.settings',actionUUID=pluginUUID+'.key';
 const plugins=[{uuid:pluginUUID,runtime:'deckforge-sdk',actions:[{uuid:actionUUID,states:1,visualPolicy:'foreground',titlePolicy:{defaultTitle:'Default'}}]}];
 const item={type:'sd-plugin',title:'Custom',icon:{kind:'file',value:'custom'},settings:{pluginUUID,actionUUID}};
 const before=JSON.stringify(item);
 const result=render(item,{title:'Live',image:'foreground'},0,true,plugins);
 assert.equal(result.sensorDisplay,true);
 assert.equal(result.sensorOverlay,'foreground');
 assert.equal(result.title,'Custom');
 assert.equal(result.icon.value,'custom');
 assert.equal(JSON.stringify(item),before);
 assert.equal(render(item,{image:'foreground'},0,true,[]).sensorDisplay,undefined);
});


test('legacy HA auto title tracks selected entity and preserves explicit state titles',()=>{
 const pluginUUID='de.perdoctus.streamdeck.homeassistant',actionUUID=pluginUUID+'.dual-state-entity';
 const item={type:'sd-plugin',title:'',settings:{pluginUUID,actionUUID,pluginSettings:{display:{entityId:'switch.a'}},stateTitles:{first:{title:''},second:{title:''}}}};
 assert.equal(core.applyLegacyHaTitle(item,'switch.other','Wrong'),false);
 assert.equal(core.applyLegacyHaTitle(item,'switch.a','거실등'),true);
 assert.equal(item.title,'거실등');assert.equal(item.settings.stateTitles.first.title,'거실등');
 assert.equal(core.applyLegacyHaTitle(item,'switch.a','거실등'),false);
 item.settings.stateTitles.second.title='';item.settings.haManualTitles={second:true};
 item.settings.pluginSettings.display.entityId='switch.b';
 assert.equal(core.applyLegacyHaTitle(item,'switch.b','주방등'),true);
 assert.equal(item.title,'주방등');assert.equal(item.settings.stateTitles.first.title,'주방등');assert.equal(item.settings.stateTitles.second.title,'');
 assert.equal(render(item,{title:'Upstream',state:1}).title,'주방등');
});


test('automatic Fusion command artwork uses the standard inset without resizing user images',()=>{
 const sync=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const from=sync.indexOf('function fusionArtworkScale('),to=sync.indexOf('function keyDescriptor(',from);
 assert.ok(from>=0&&to>from);
 const scale=vm.runInNewContext(sync.slice(from,to)+';fusionArtworkScale',{});
 const icon={kind:'file',value:'automatic'};
 assert.equal(scale({fusionCommandArtwork:true,icon}),0.79);
 assert.equal(scale({icon}),1);
 assert.equal(scale({fusionCommandArtwork:true,icon,settings:{keyPressIcons:{up:icon}}}),1);
 assert.equal(scale({fusionCommandArtwork:true,icon,settings:{sdkStateIcons:{on:icon}}}),1);
 assert.match(sync,/fusionArtworkScale:fusionArtworkScale\(item\)/);
 assert.match(sync,/limitWidth = width\*artworkScale, limitHeight = height\*artworkScale/);
});

test('single-state basic actions reuse the original title controls and default artwork with an inert right card',()=>{
 const begin=source.indexOf('function hasSingleBasicIconCard('),end=source.indexOf('function bindSdkStateIcons(',begin);
 const node=tag=>({tag,children:[],style:{},classList:{add(){}},setAttribute(k,v){this[k]=v;},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},addEventListener(type,fn){this[type]=fn;}});
 const backgrounds=[],opened=[];
 for(const type of ['sleep','logic','virtual']){
  const panel=node('section'),title=node('div'),line=node('div'),check=node('input'),artwork=node('img');
  title.querySelector=selector=>selector==='[data-sdk-inspector]'?null:line;
  const root={querySelector:selector=>selector==='[data-inspector-icons]'?panel:title};
  const item={type,title:'기존 제목',icon:{kind:'glyph',glyph:'X'},settings:{keyBackgrounds:{default:{enabled:true,color:'#445566'}}}};
  const before=JSON.stringify(item);
  const ctx={DeckCore:{isNativeForeground:()=>false,isNativeHaSensor:()=>false},$:()=>check,document:{createElement:node},
    state:{selected:0},ACTIONS:new Map(),inspectorDisplayItem:value=>value,iconNode:value=>{assert.equal(value,item);return artwork;},PALETTE_ICON:'',
    bindKeyBackgroundControl:(image,target,key)=>backgrounds.push([image,target,key]),openIconLibrary:(...args)=>opened.push(args)};
  const bind=vm.runInNewContext(source.slice(begin,end)+';bindNativeForegroundIconCard',ctx);
  bind(root,item);
  const [left,right]=panel.children[0].children;
  assert.equal(left.children[0].textContent,'Key Up');assert.equal(right.children[0].textContent,'Key Down');
  assert.equal(left.children[1],title);assert.deepEqual(title.children,[check,line]);
  assert.equal(left.children[2].children[0],artwork);
  assert.deepEqual(left.children[3].children.map(x=>x.textContent),['라이브러리','파일','클립보드','특수문자','초기화']);
  assert.equal(backgrounds.at(-1)[1],item);assert.equal(backgrounds.at(-1)[2],'default');
  left.children[3].children[0].click({currentTarget:left.children[3].children[0]});
  assert.equal(opened.at(-1)[0],item);assert.equal(opened.at(-1)[1],null);
  assert.equal(right.inert,true);assert.equal(right['aria-disabled'],'true');
  assert.ok(right.children.slice(1).flatMap(x=>x.children).every(x=>x.disabled));
  assert.equal(JSON.stringify(item),before,'render must not add state or overwrite the existing artwork');
  for(const other of ['multi-switch','hotkey-switch','timer','indicator','ha-toggle','brightness'])bind(root,{type:other});
  assert.equal(panel.children.length,1,'real paired states and other special actions are untouched');
 }
});
