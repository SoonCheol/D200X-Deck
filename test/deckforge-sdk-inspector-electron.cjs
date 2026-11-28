'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {registerInspectorScheme,createInspectorScope,bindInspectorWindows}=require('../app/deckforge-editor/sdk-inspector-scope.cjs');
registerInspectorScheme();
app.whenReady().then(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-inspector-'));
  let win;
  try{
    const dir=path.join(root,'plugin.sdPlugin');await fs.mkdir(dir);
    await fs.writeFile(path.join(dir,'pi.html'),'<html><script src="pi.js"></script></html>');
    await fs.writeFile(path.join(dir,'pi.js'),'window._saveToken=v=>{window.saved=v;return true;};');
    await fs.writeFile(path.join(dir,'setup.html'),'<html><script>window.onload=()=>{window.result=window.opener._saveToken(location.hash.slice(1));};</script></html>');
    await fs.writeFile(path.join(root,'secret.html'),'outside');
    const scope=createInspectorScope(dir);
    assert.equal(scope.html(scope.url('setup.html')),require('node:fs').realpathSync.native(path.join(dir,'setup.html')));
    assert.equal(scope.html(scope.url('../secret.html')),null);
    assert.equal(scope.html('file:///C:/Windows/win.ini'),null);
    assert.equal(scope.html('deckforge-pi://other/setup.html'),null);
    win=new BrowserWindow({show:false,webPreferences:{session:scope.session,nodeIntegration:false,contextIsolation:false,sandbox:true,webSecurity:true}});
    bindInspectorWindows(win,scope,()=>null,0,[620,540]);
    await win.loadURL(scope.url('pi.html'));
    assert.equal(await win.webContents.executeJavaScript('typeof window._saveToken'),'function');
    const created=new Promise(resolve=>win.webContents.once('did-create-window',resolve));
    await win.webContents.executeJavaScript('Boolean(window.open("setup.html#fake-token","settings"))',true);
    let timer;
    const child=await Promise.race([created,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('popup not created')),5000);})]).finally(()=>clearTimeout(timer));
    assert.deepEqual(child.getSize(),[620,540]);
    const deadline=Date.now()+5000;
    while(Date.now()<deadline&&await win.webContents.executeJavaScript('window.saved||""')!=='fake-token')await new Promise(r=>setTimeout(r,50));
    assert.equal(await win.webContents.executeJavaScript('window.saved'),'fake-token');
    assert.equal(await child.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal(await child.webContents.executeJavaScript('Boolean(window.open("file:///C:/Windows/win.ini","bad"))',true),false);
    child.destroy();
    const overrideCreated=new Promise(resolve=>win.webContents.once('did-create-window',resolve));
    await win.webContents.executeJavaScript('Boolean(window.open("setup.html#override","override","width=400,height=320"))',true);
    const override=await Promise.race([overrideCreated,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('override popup not created')),5000);})]).finally(()=>clearTimeout(timer));
    assert.deepEqual(override.getSize(),[400,320]);override.destroy();
    console.log('DeckForge local inspector popup and opener callback verified');
    // Exercise original browser service and its real property inspector over V3.1.
    const {UlanziNodeHost}=require('../app/deckforge-editor/ulanzi-node-host.cjs');
    const original=path.join(root,'original.ulanziPlugin'),id='com.ulanzi.ulanzistudio.browserfixture',action=id+'.key';
    await fs.mkdir(original);
    await fs.writeFile(path.join(original,'manifest.json'),JSON.stringify({UUID:id,Name:'Browser fixture',Version:'1.0.0',Type:'JavaScript',CodePath:'main.html',Actions:[{UUID:action,Name:'Key',PropertyInspectorPath:'pi.html'}]}));
    const connect="const p=Object.fromEntries(new URLSearchParams(location.search));const ws=new WebSocket('ws://'+p.address+':'+p.port);const send=m=>ws.send(JSON.stringify(m));ws.onopen=()=>send({cmd:'connected',code:0,uuid:p.uuid,key:p.key,actionid:p.actionid});";
    await fs.writeFile(path.join(original,'main.html'),'<script src="main.js"></script>');
    await fs.writeFile(path.join(original,'main.js'),connect+"ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.code!==undefined)return;const a={uuid:m.uuid,key:m.key,actionid:m.actionid};if(m.cmd==='add')send({cmd:'setTitle',param:{...a,text:'HTML_READY'}});if(m.cmd==='sendToPlugin')send({cmd:'sendToPropertyInspector',...a,payload:{reply:m.payload.query}});};");
    await fs.writeFile(path.join(original,'pi.html'),'<script src="pi.js"></script>');
    await fs.writeFile(path.join(original,'pi.js'),connect+"ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.cmd==='paramfromapp'&&m.code===undefined&&!window.received){window.received=m.param;send({cmd:'setSettings',uuid:p.uuid,key:p.key,actionid:p.actionid,settings:{label:'saved'}});send({cmd:'sendToPlugin',uuid:p.uuid,key:p.key,actionid:p.actionid,payload:{query:'ping'}});}if(m.cmd==='sendToPropertyInspector')window.reply=m.payload.reply;};");
    const updates=[],host=new UlanziNodeHost(original,e=>updates.push(e));
    const until=async predicate=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('original browser/inspector response missing');};
    try{
      await host.start({approved:true});
      host.sync([{context:'original',slot:0,pluginUUID:id,actionUUID:action,settings:{label:'initial'}}]);
      await until(()=>updates.some(e=>e.kind==='setTitle'&&e.payload?.title==='HTML_READY'));
      assert.equal(await host.mainWindow.webContents.executeJavaScript('typeof require'),'undefined');
      const pi=await host.openInspector('original',win);
      await until(async()=>!pi.isDestroyed()&&await pi.webContents.executeJavaScript('window.reply==="ping"'));
      assert.equal(await pi.webContents.executeJavaScript('window.received.label'),'initial');
      assert.equal(await pi.webContents.executeJavaScript('typeof require'),'undefined');
      assert.ok(updates.some(e=>e.kind==='settings'&&e.settings?.label==='saved'));
      host.sync([]);assert.equal(pi.isDestroyed(),true);
      console.log('DeckForge original Ulanzi HTML service and property inspector round trip verified');
    }finally{await host.close();}

  }finally{if(win&&!win.isDestroyed())win.destroy();await fs.rm(root,{recursive:true,force:true});}
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
