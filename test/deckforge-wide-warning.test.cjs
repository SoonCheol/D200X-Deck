'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../app/streamdeck-editor');
const editor=fs.readFileSync(path.join(base,'editor.js'),'utf8');
const sync=fs.readFileSync(path.join(base,'device-sync.js'),'utf8');
const main=fs.readFileSync(path.join(base,'main.cjs'),'utf8');
const preload=fs.readFileSync(path.join(base,'preload.cjs'),'utf8');
const core=require(path.join(base,'deck-core.js'));
function inputHarness(){
  let active=true,now=1000,reveals=0;
  const first=editor.indexOf('const wideWarningPresses=');
  const last=editor.indexOf('function advanceWideDisplay()',first);
  assert.ok(first>=0&&last>first);
  const context={window:{},DeckCore:core,Date:{now:()=>now},
    wideUnsavedWarningActive:()=>active,revealWideUnsavedWarning:()=>reveals++};
  vm.runInNewContext(editor.slice(first,last)+';window.handle=handleWideWarningInput;',context);
  return {handle:(index,pressed,preview=false)=>context.window.handle({kind:1,index,state:pressed?1:0,pressed},preview),
    active:value=>{active=value;},tick:ms=>{now+=ms;},reveals:()=>reveals,clear:()=>context.window.clearD200XWarningPresses()};
}
test('warning owns both wide key halves, dedupes focus and consumes their releases after closing',()=>{
  const h=inputHarness();
  assert.ok(h.handle(13,true));assert.ok(h.handle(14,true));assert.equal(h.reveals(),1);
  h.active(false);
  assert.ok(h.handle(13,false));assert.ok(h.handle(14,false));
  h.tick(250);assert.equal(h.handle(13,true),null);assert.equal(h.handle(14,true),null);
});
test('ordinary actions, previews and pre-existing releases are not intercepted',()=>{
  const h=inputHarness();
  assert.equal(h.handle(3,true),null);assert.equal(h.handle(15,true),null);
  assert.equal(h.handle(13,true,true),null);assert.equal(h.handle(13,false),null);
  h.active(false);assert.equal(h.handle(13,true),null);
  h.active(true);assert.equal(h.handle(13,false),null);
  assert.equal(h.reveals(),0);
  h.handle(13,true);h.clear();h.active(false);assert.equal(h.handle(13,false),null);
});
test('warning temporarily replaces only outgoing slot 13; restores legacy slot and native modes',()=>{
  const first=sync.indexOf('  const warningPageStamp=');
  const last=sync.indexOf('  async function synchronize()',first);
  assert.ok(first>=0&&last>first);
  let active=false;const sent=[],scheduled=[];
  const state={profileId:'a',page:0,folderPath:[]};
  const context={state,DeckCore:{activeFolder:()=>({pageIndex:0})},window:{D200XUnsavedWarning:()=>active},
    bridge:{syncPage:(images,mode)=>sent.push({images,mode})},
    document:{createElement:()=>({getContext:()=>({}),toDataURL:()=>'data:image/png;base64,warning'})},
    drawWidePanel:(_ctx,w,h,mode)=>{assert.equal(w,392);assert.equal(h,196);assert.equal(mode,'unsaved');},
    lastSentImages:null,lastSentWideMode:'blank',lastSentPageStamp:null,schedule:ms=>scheduled.push(ms)};
  vm.runInNewContext(sync.slice(first,last)+';window.publish=(images,mode)=>cacheAndSendImages(images,mode,warningPageStamp());',context);
  const images=Array.from({length:14},(_,index)=>({index,png:'original'+index}));
  const publish=context.window.publish,refresh=context.window.scheduleD200XWarningSync;
  for(const mode of ['clock','stats','blank']){
    publish(images,mode);active=true;refresh();
    const warning=sent.at(-1);
    assert.equal(warning.mode,'blank');assert.equal(warning.images[13].png,'warning');
    for(let i=0;i<13;i++)assert.equal(warning.images[i],images[i]);
    assert.equal(images[13].png,'original13');
    publish(images,mode);assert.equal(sent.at(-1).images[13].png,'warning');
    active=false;refresh();assert.equal(sent.at(-1).mode,mode);assert.equal(sent.at(-1).images,images);
  }
  state.page=1;refresh();assert.equal(scheduled.at(-1),0);
});
test('alert lifecycle and authenticated focus bridge are wired before normal action routing',()=>{
  assert.match(editor,/dialog\.showModal\(\);\s*refreshWideUnsavedWarning\(\);/);
  assert.match(editor,/dialog\.remove\(\);refreshWideUnsavedWarning\(\);/);
  assert.match(editor,/const warning=handleWideWarningInput\(event,preview\);\s*if\(warning\)return warning\.message;/);
  assert.match(editor,/wideUnsavedWarningActive\(\)\?wideUnsavedVisual\(\)/);
  assert.match(preload,/revealUnsavedEditor: \(\) => ipcRenderer\.invoke\('d200x:reveal-unsaved-editor'\)/);
  assert.match(main,/ipcMain\.handle\('d200x:reveal-unsaved-editor',event=>\{\s*assertEditor\(event\);/);
  assert.match(main,/if\(editor\.isMinimized\(\)\)editor\.restore\(\);\s*editor\.show\(\);\s*editor\.focus\(\);/);
  assert.ok(main.includes("const spec={kind:'EditorHwnd',target:process.pid+':'+hwnd};"));
  assert.match(main,/inspectAppFocus\(spec,'Focus',traceId\)/);
  assert.match(main,/if\(result\.status==='focused'\)return true;/);
  assert.match(main,/if\(!editor\.isDestroyed\(\)\)editor\.flashFrame\(true\);/);
  assert.match(main,/if\(!unsavedRevealPending\)/);
  assert.match(sync,/window\.clearD200XWarningPresses\?\.\(\)/);
});

test('editor reveal uses only its exact native handle and owner PID, verifies helper status and flashes on failure',async()=>{
  const first=main.indexOf('let unsavedRevealPending=null;');
  const end=main.indexOf('function quitDeckForge()',first);
  assert.ok(first>=0&&end>first);
  for(const status of ['focused','matched-not-focused','error']){
    const calls=[],logs=[];
    const ctx={process:{platform:'win32',pid:1234},Buffer,randomUUID:()=> 'warning-test',
      writeAppControlLog:async value=>logs.push(value),
      inspectAppFocus:async (spec,mode,traceId)=>{
        calls.push(['native',spec.kind,spec.target,mode,traceId]);
        if(status==='error')throw Error('native error');
        return {status};
      },
      ipcMain:{handle:()=>{}},assertEditor:()=>{}};
    vm.runInNewContext(main.slice(first,end)+';globalThis.reveal=revealUnsavedEditor;',ctx);
    const native=Buffer.alloc(8);native.writeBigUInt64LE(4294967552n);
    const editor={isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),
      focus:()=>calls.push('focus'),getNativeWindowHandle:()=>native,isDestroyed:()=>false,
      flashFrame:value=>calls.push(['flash',value])};
    assert.equal(await ctx.reveal(editor),status==='focused');
    assert.deepEqual(calls.slice(0,4),['restore','show','focus',['native','EditorHwnd','1234:4294967552','Focus','warning-test']]);
    assert.equal(calls.length,status==='focused'?4:5);
    assert.equal(logs[0].stage,'wide-warning-focus-request');
    if(status==='error')assert.equal(logs[1].stage,'wide-warning-focus-error');
  }
});
