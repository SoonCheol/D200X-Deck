'use strict';
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
// A fresh in-memory browser session: no real device, native bridge or saved profile.
app.whenReady().then(async()=>{
  let win;
  try{
    win=new BrowserWindow({show:false,webPreferences:{partition:'deckforge-editor-startup-smoke',nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const errors=[];
    win.webContents.on('console-message',(_event,details)=>{
      if(details?.level==='error'&&/Uncaught|ReferenceError|TypeError|액션 목록 누락/.test(details.message))errors.push(details.message);
    });
    await win.loadFile(path.join(__dirname,'../app/deckforge-editor/index.html'));
    const run=code=>win.webContents.executeJavaScript(code);
    const initial=await run(`({
      keys:document.querySelectorAll('#key-grid .deck-key').length,
      actions:document.querySelectorAll('#library-list .action-item').length,
      tabs:!document.querySelectorAll('.library-tabs button')[1].disabled,
      dispatch:typeof window.executeD200XKey,
      ai:typeof window.DeckForgeAiEdit?.capture,
      inspector:document.getElementById('inspector').childElementCount
    })`);
    assert.equal(initial.keys,14,JSON.stringify({initial,errors}));
    assert.equal(initial.actions,35);
    assert.equal(initial.tabs,true);
    assert.equal(initial.dispatch,'function');
    assert.equal(initial.ai,'function');
    const filtered=await run(`(()=>{
      const input=document.getElementById('action-search'),list=document.getElementById('action-search-list'),menu=document.getElementById('action-search-menu');
      input.value='열기';input.dispatchEvent(new Event('input',{bubbles:true}));
      const partial=document.querySelectorAll('#library-list .action-item').length;
      list.click();
      const buttons=[...menu.querySelectorAll('button')];
      const names=buttons.map(b=>b.textContent);
      const target=buttons.find(b=>b.textContent==='파일 열기');
      if(!target)throw Error('파일 열기 missing from picker');
      target.click();
      const exact=[...document.querySelectorAll('#library-list .action-item .action-caption>span')].map(b=>b.textContent);
      document.getElementById('action-search-clear').click();
      return {partial,names,exact,restored:document.querySelectorAll('#library-list .action-item').length};
    })()`);
    assert.ok(filtered.partial>1);
    assert.equal(filtered.names.length,35);
    assert.deepEqual(filtered.names,[...filtered.names].sort((a,b)=>a.localeCompare(b,'ko')));
    assert.deepEqual(filtered.exact,['파일 열기']);
    assert.equal(filtered.restored,35);
    assert.deepEqual(errors,[]);
    console.log('EDITOR_STARTUP_OK '+JSON.stringify({initial,partial:filtered.partial,exact:filtered.exact,restored:filtered.restored}));
  }finally{if(win&&!win.isDestroyed())win.destroy();}
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
