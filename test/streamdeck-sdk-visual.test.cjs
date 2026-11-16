'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
// Run the actual renderer function in a narrow VM with fake state; no Electron or hardware needed.
const source=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const beginning=source.indexOf('function displayItem(item,index){');
const ending=source.indexOf('// Share actual key visuals',beginning);
if(beginning<0||ending<0)throw Error('SDK renderer not found');
const fn=source.slice(beginning,ending);
function render(item,visual,slot=0,clone=false){
  const actual=clone?JSON.parse(JSON.stringify(item)):item;
  const original=item;
  const map=new Map([['profile:0::'+slot+':down',visual]]);
  return vm.runInNewContext(fn+';displayItem(item,index)',{
    item:actual,index:slot,
    state:{profileId:'profile',page:0,folderPath:[],selected:2},
    sdkVisuals:map,sdkContext:(i,g)=>'profile:0::'+i+':'+g,
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
