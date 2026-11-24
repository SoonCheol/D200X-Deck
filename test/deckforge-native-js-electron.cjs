'use strict';
// Real Electron smoke test, run from the Windows build before packaging.
const {app}=require('electron');
const assert=require('node:assert/strict');
const {createScriptRunner}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
const input={event:{type:'press',slot:0,gesture:'down'},settings:{},state:0,memory:{}};
app.whenReady().then(async()=>{
  const a=createScriptRunner('com.deckforge.native.smokea');
  const b=createScriptRunner('com.deckforge.native.smokeb');
  try{
    const result=await a.run("api.setTitle(typeof require+':'+typeof process);memory.n=1;",input);
    assert.deepEqual(result,{ops:[{op:'title',value:'undefined:undefined'}],memory:{n:1}});
    await assert.rejects(a.run('while(true){}',input),/timeout/);
    const good=await b.run("api.toggleState();",input);
    assert.deepEqual(good.ops,[{op:'toggleState'}]);
    console.log('DeckForge JavaScript SDK renderer smoke passed');
    a.close();b.close();app.exit(0);
  }catch(error){console.error(error);a.close();b.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
