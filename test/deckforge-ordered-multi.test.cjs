'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../app/deckforge-editor/deck-core.js');
test('ordered multi keeps legacy timing, moves delays together and preserves terminal pause',async()=>{
 const m=Core.createAction('multi');m.settings.nextActionMs=10;m.children=[{kind:'delay',ms:500},Core.createAction('terminal'),Core.createAction('explorer-open'),{kind:'delay',ms:900},Core.createAction('hotkey'),{kind:'delay',ms:200}];
 const original=JSON.stringify(m),legacy=Core.multiRows(m);assert.deepEqual(legacy.rows.map(r=>r.ms),[500,10,900]);assert.equal(legacy.tail,200);assert.equal(JSON.stringify(m),original);
 const run=async a=>{const log=[];await Core.runComposite(a,{nextActionMs:10,wait:async ms=>log.push(ms),execute:async step=>log.push(step.type)});return log;};
 const before=await run(m);Core.setMultiRows(m,legacy.rows,legacy.tail);assert.deepEqual(await run(Core.cleanAction(m)),before);
 legacy.rows.reverse();Core.setMultiRows(m,legacy.rows,legacy.tail);assert.equal(Core.multiRows(m).rows[0].ms,900);
 const progress=[];await Core.runComposite(m,{wait:async()=>{},execute:async()=>{},onStep:(a,b)=>progress.push([a,b])});assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
});
test('abort during row pre-delay prevents action execution',async()=>{
 const m=Core.createAction('multi'),controller=new AbortController();Core.setMultiRows(m,[{step:Core.createAction('hotkey'),ms:100}],0);
 let executed=false;await assert.rejects(Core.runComposite(m,{signal:controller.signal,wait:async()=>controller.abort(),execute:async()=>{executed=true;}}));assert.equal(executed,false);
});

test('timer time formatting keeps configured display family through final second',()=>{
 assert.equal(Core.formatTimerTime(30,30),'30초');assert.equal(Core.formatTimerTime(1,30),'1초');
 assert.equal(Core.formatTimerTime(60,60),'00:01:00');assert.equal(Core.formatTimerTime(1,60),'00:00:01');assert.equal(Core.formatTimerTime(86400,86400),'24:00:00');
});
test('both wide halves alias only the reserved empty folder back slot',()=>{
 const s=Core.migrateState({pages:[Array(14).fill(null)]});s.pages[0][0]=Core.createAction('folder');Core.enterFolder(s,0);
 for(const index of [13,14])assert.equal(Core.planHardwareEvent(s,{kind:1,index,state:1,pressed:true}).outcome.kind,'folder-back');
 Core.currentActions(s)[13]=Core.createAction('hotkey');assert.equal(Core.resolveHardwareEvent(s,{kind:1,index:14,state:1,pressed:true}),null);
});

test('pause gate preserves remaining delay and abort releases a paused waiter',async()=>{
 const controller=new AbortController(),timers=new Map();let now=0,id=0;
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 const gate=Core.createMultiPauseGate(controller.signal,{now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimer:i=>timers.delete(i)});
 const advance=ms=>{now+=ms;for(const [i,value] of [...timers])if(value.at<=now){timers.delete(i);value.fn();}};
 let done=false;const waiting=gate.wait(10000).then(()=>{done=true;});
 await flush();advance(4000);gate.pause();await flush();advance(60000);await flush();assert.equal(done,false);
 gate.resume();await flush();advance(5999);await flush();assert.equal(done,false);advance(1);await waiting;assert.equal(done,true);
 gate.pause();const pending=gate.ready();controller.abort();await assert.rejects(pending);assert.equal(timers.size,0);
});
