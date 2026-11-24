'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
// Run the actual renderer function in a narrow VM with fake state; no Electron or hardware needed.
const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const beginning=source.indexOf('function displayItem(item,index,preserveGesture=false){');
const ending=source.indexOf('const previewPressKeys=new Set();',beginning);
if(beginning<0||ending<0)throw Error('SDK renderer not found');
const fn=source.slice(beginning,ending);
function render(item,visual,slot=0,clone=false){
  const actual=clone?JSON.parse(JSON.stringify(item)):item;
  const original=item;
  const map=new Map([['profile:0::'+slot+':down',visual]]);
  return vm.runInNewContext(fn+';displayItem(item,index)',{
    item:actual,index:slot,
    state:{profileId:'profile',page:0,folderPath:[],selected:2},
    sdkVisuals:map,sdkActionDefaults:new Map(),sdkContext:(i,g)=>'profile:0::'+i+':'+g,
    DeckCore:{visibleActions:()=>[original]},timerDeadlines:new Map()
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
    sdkContext:()=>ctx,DeckCore:{visibleActions:()=>[item]},
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
    sdkContext:()=>ctx,DeckCore:{visibleActions:()=>[item]},
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
    sdkVisuals:new Map([[ctx,{image}]]),sdkContext:()=>ctx,DeckCore:{visibleActions:()=>[item]},
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
    sdkVisuals:new Map([[ctx,{image}]]),sdkContext:()=>ctx,DeckCore:{visibleActions:()=>[item]},
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
 const drag=require('../app/streamdeck-editor/fusion-drag.cjs');
 const svg='data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64');
 assert.equal(drag.decode(drag.encode({id:'ExtrudeCommand',name:'돌출',svg})).svg,svg);
});

test('Fusion icon IPC reads both trusted PNG and fallback cached PNG',async()=>{
 const os=require('node:os'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'d200x-fusion-png-'));
 try{
  const handlers=new Map();
  const main=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/main.cjs'),'utf8');
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
 const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
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
   sdkContext:()=>key,DeckCore:{visibleActions:()=>[item]},timerDeadlines:new Map()
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
 const code=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/device-sync.js'),'utf8');
 const begin=code.indexOf('  async function synchronize('),end=code.indexOf('  function runScheduledRender()',begin);
 assert.ok(begin>=0&&end>begin);
 const old=Array.from({length:14},(_,index)=>({index,png:'old-'+index}));
 const rendered=[],sent=[],dirtyNativeSlots=new Set([3,7]);
 const ctx={dirtyNativeSlots,renderSerial:0,lastSentImages:old,lastSentPageStamp:'p',lastSentWideMode:'blank',
  nativeRenderGate:{begin(){},end(){}},warningPageStamp:()=> 'p',window:{getD200XWideMode:()=> 'blank',getD200XDisplayItem:x=>x},
  state:{folderPath:[]},DeckCore:{visibleActions:()=>Array(14).fill(null)},document:{fonts:{ready:Promise.resolve()}},
  drawSlot:async(_,index)=>{rendered.push(index);return {index,png:'new-'+index};},
  cacheAndSendImages:images=>sent.push(images),schedule:()=>assert.fail('unexpected fallback'),text:()=>assert.fail('render error')};
 await vm.runInNewContext(code.slice(begin,end)+';synchronize(true)',ctx);
 assert.deepEqual(rendered,[3,7]);assert.equal(sent[0].length,14);
 assert.equal(sent[0][0],old[0]);assert.equal(sent[0][3].png,'new-3');
 assert.equal(old[3].png,'old-3');
 rendered.length=0;dirtyNativeSlots.add(3);ctx.lastSentPageStamp='other';
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
 render('new page','b');await flush();assert.notEqual(button.children[0],third,'never display old page action on new page');
 frames[4].resolve('four');await flush();decodes[3].resolve();await flush();
 assert.equal(button.children[0].src,'data:image/png;base64,four');
});
