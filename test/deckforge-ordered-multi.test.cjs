'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../app/streamdeck-editor/deck-core.js');
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
