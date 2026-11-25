'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {StreamDeckPluginHost}=require('../app/deckforge-editor/sd-plugin-host.cjs');

async function until(predicate,label,timeout=12000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const result=predicate();
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw Error('Timed out waiting for '+label);
}

test('Unmodified Autodesk FusionStreamDeck Node24 plugin speaks D200X SDK WebSocket',async t=>{
  const source=process.env.D200X_FUSION_SOURCE;
  if(!source){t.skip('Pinned upstream plugin test runs in Windows preview workflow');return;}
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-fusion-sdk-'));
  const events=[],messages=[];
  const host=new StreamDeckPluginHost(dir,event=>events.push(event));
  const uuid='com.autodesk.fusionstreamdeck';
  const actionUUID=uuid+'.runcommand';
  const ctx='default:0::0:down';
  try{
    const installed=await host.installDirectory(source);
    assert.equal(installed.uuid,uuid);
    assert.equal((await host.list())[0].actions[0].uuid,actionUUID);
    await host.sync([{context:ctx,slot:0,pluginUUID:uuid,actionUUID,settings:{}}]);
    await until(()=>host.instances.get(uuid)?.ws,'original Fusion plugin SDK registration');
    assert.equal(host.key(ctx,'down'),true);
    // No Fusion add-in or command is configured on CI: the upstream plugin
    // must still receive keyDown and emit its native showAlert notification.
    await until(()=>events.some(x=>x.kind==='showAlert'&&x.context===ctx),'Fusion offline key response');
    host.inspectors.set(ctx,{context:ctx,pluginUUID:uuid,
      window:{isDestroyed:()=>true},
      ws:{readyState:1,send:raw=>messages.push(JSON.parse(raw))}});
    await host.message({event:'sendToPlugin',context:ctx,action:actionUUID,
      payload:{type:'search',query:'extrude'}},null,{pluginUUID:uuid,context:ctx},null);
    await until(()=>messages.some(m=>m.event==='sendToPropertyInspector'&&
      m.payload?.type==='searchError'),'original Fusion search response to Property Inspector');
    assert.equal(messages.some(m=>m.context===ctx),true);
  }finally{
    await host.close();
    await fs.rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  }
});
