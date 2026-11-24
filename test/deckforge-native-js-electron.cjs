'use strict';
// Real Electron smoke test, run from the Windows build before packaging.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {NativeSettingsVault}=require('../app/streamdeck-editor/deckforge-native-settings.cjs');
const assert=require('node:assert/strict');
const {createScriptRunner}=require('../app/streamdeck-editor/deckforge-js-runtime.cjs');
const input={event:{type:'press',slot:0,gesture:'down'},settings:{},state:0,memory:{}};
async function verifyWindowsEncryption(){
  if(process.platform!=='win32')return;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-native-real-vault-'));
  const id='com.deckforge.native.smoke-vault',token=randomUUID();
  const storage={
    isAsyncEncryptionAvailable:()=>safeStorage.isAsyncEncryptionAvailable(),
    encryptStringAsync:value=>safeStorage.encryptStringAsync(value),
    decryptStringAsync:bytes=>safeStorage.decryptStringAsync(bytes)
  };
  try{
    const vault=new NativeSettingsVault(root,storage,'credentials');
    assert.equal(await storage.isAsyncEncryptionAvailable(),true);
    assert.equal(await vault.write(id,{token},null),true);
    const bytes=await fs.readFile(vault.file(id));
    assert.ok(bytes.length>0&&!bytes.includes(Buffer.from(token)));
    const reopened=new NativeSettingsVault(root,storage,'credentials');
    const record=await reopened.read(id);
    assert.equal(record.value.token===token,true);
    assert.equal(await reopened.write(id,{},null),false);
    assert.equal(await reopened.write(id,{},record.revision),true);
    assert.deepEqual((await reopened.read(id)).value,{});
    console.log('DeckForge Windows encrypted credential vault smoke passed');
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
async function verifyVectorRendering(){
 const {BrowserWindow}=require('electron');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f00"/></svg>';
 const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
 const {svgReport}=require('../app/streamdeck-editor/ulanzi-media-analysis.cjs');
 assert.equal(svgReport(Buffer.from(svg)).status,'restricted-vector-review');
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"><canvas width="16" height="16"></canvas>'));
  const pixel=await win.webContents.executeJavaScript('(async()=>{const img=new Image();img.src='+JSON.stringify(uri)+';await img.decode();const ctx=document.querySelector("canvas").getContext("2d");ctx.drawImage(img,0,0);return Array.from(ctx.getImageData(8,8,1,1).data);})()');
  assert.deepEqual(pixel,[255,0,0,255]);
  console.log('DeckForge restricted SVG canvas pixel smoke passed');
 }finally{win.destroy();}
}

async function verifyPublicApi(runner){
  const {NativePluginHost,validateNativeManifest}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
  const id='com.deckforge.native.api-contract';
  const permissions=['display','settings.write','global.settings','navigation','wide.mode','wide.overlay','network.request'];
  const endpoints=[{id:'status',url:'https://example.com/status',method:'GET'}];
  const action={id:id+'.key',name:'Contract',controllers:['Keypad'],states:2,script:'api.setTitle("contract");'};
  validateNativeManifest({apiVersion:2,id,name:'Contract',version:'1.0.0',permissions,networkEndpoints:endpoints,actions:[action]});
  const host=new NativePluginHost('/unused');
  const ctx={slot:0,pluginUUID:id,action,permissions,networkEndpoints:endpoints,settings:{count:1,keep:true}};
  const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const png='data:image/png;base64,'+require('../app/streamdeck-editor/ulanzi-media-analysis.cjs').gifPngFrames(Buffer.from(gif.slice(22),'base64')).frames[0].png.toString('base64');
  const frame={kind:'layout',background:'#000000',elements:[]};
  const cases=[
    ['setTitle','api.setTitle("ready")','title'],
    ['setState','api.setState(1)','state'],
    ['toggleState','api.toggleState()','toggleState'],
    ['setImage','api.setImage('+JSON.stringify(png)+')','image'],
    ['setAnimation','api.setAnimation('+JSON.stringify(gif)+')','animation'],
    ['stopAnimation','api.stopAnimation()','stopAnimation'],
    ['drawKey','api.drawKey({width:8,height:8,background:"#123456",commands:[]})','image'],
    ['setSettings','api.setSettings({count:2})','settings','settings.write'],
    ['patchSettings','api.patchSettings({count:2})','settings','settings.write'],
    ['getGlobalSettings','api.setTitle(api.getGlobalSettings().label)','title'],
    ['setGlobalSettings','api.setGlobalSettings({label:"ready"})','globalSettings','global.settings'],
    ['goToPage','api.goToPage(1)','navigate','navigation'],
    ['switchProfile','api.switchProfile("next")','navigate','navigation'],
    ['enterFolder','api.enterFolder(2)','navigate','navigation'],
    ['exitFolder','api.exitFolder()','navigate','navigation'],
    ['setWideMode','api.setWideMode("clock")','wideMode','wide.mode'],
    ['setWideOverlay','api.setWideOverlay('+JSON.stringify(frame)+')','wideOverlay','wide.overlay'],
    ['clearWideOverlay','api.clearWideOverlay()','wideOverlay','wide.overlay'],
    ['request','api.request("status")','networkRequest','network.request']
  ];
  try{
    const names=await runner.run('api.setTitle(Object.keys(api).sort().join(","));',input);
    // Title length is not a concern here: this is a renderer-only inventory.
    assert.deepEqual(names.ops[0].value.split(','),cases.map(c=>c[0]).sort());
    for(const [name,source,op,permission] of cases){
      const result=await runner.run(source,{...input,settings:ctx.settings,globalSettings:{label:'ready'}});
      const validated=host.validateScriptOps(ctx,'press',result.ops);
      const commands=permission?validated.effects:validated.normal;
      assert.equal(commands.length,1,name);assert.equal(commands[0].op,op,name);
      if(name==='getGlobalSettings')assert.equal(commands[0].value,'ready');
      if(name==='patchSettings')assert.deepEqual(commands[0].value,{count:2,keep:true});
      if(permission){
        assert.throws(()=>host.validateScriptOps({...ctx,permissions:permissions.filter(p=>p!==permission)},'press',result.ops),/unauthorized/,name);
        assert.throws(()=>host.validateScriptOps(ctx,'appear',result.ops),/input event/,name);
      }
    }
    console.log('DeckForge native SDK 19-function renderer/host contract passed');
  }finally{host.close();}
}

app.whenReady().then(async()=>{
  const a=createScriptRunner('com.deckforge.native.smokea');
  const b=createScriptRunner('com.deckforge.native.smokeb');
  try{
    const result=await a.run("api.setTitle(typeof require+':'+typeof process);memory.n=1;",input);
    assert.deepEqual(result,{ops:[{op:'title',value:'undefined:undefined'}],memory:{n:1}});
    await assert.rejects(a.run('while(true){}',input),/timeout/);
    const good=await b.run("api.toggleState();",input);
    assert.deepEqual(good.ops,[{op:'toggleState'}]);
    const network=await b.run("api.request('status');",input);
    assert.deepEqual(network.ops,[{op:'networkRequest',endpoint:'status',body:null}]);
    const continuation=await b.run("if(event.type==='networkResult')api.setTitle(event.response.body);",{...input,event:{type:'networkResult',response:{body:'Ready'}}});
    assert.deepEqual(continuation.ops,[{op:'title',value:'Ready'}]);
    const asyncResult=await b.run("globalThis.carry='must vanish'; const value=await Promise.resolve('async ready'); api.setTitle(value); memory.saved=1;",input);
    assert.deepEqual(asyncResult,{ops:[{op:'title',value:'async ready'}],memory:{saved:1}});
    const clean=await b.run("api.setTitle(typeof globalThis.carry);api.setTitle(String(memory.saved));",{...input,memory:asyncResult.memory});
    assert.deepEqual(clean.ops,[{op:'title',value:'undefined'},{op:'title',value:'1'}]);
    const drawing=await b.run("api.drawKey({width:16,height:16,background:'#ff0000',commands:[{type:'rect',x:0,y:0,width:4,height:4,color:'#0000ff'}]});",input);
    const {pixelImage}=require('../app/streamdeck-editor/deckforge-pixel-image.cjs');
    const pixels=Buffer.from(drawing.ops[0].rgba,'base64');
    assert.deepEqual([...pixels.subarray(0,4)],[0,0,255,255]);
    assert.deepEqual([...pixels.subarray(8*16*4+8*4,8*16*4+8*4+4)],[255,0,0,255]);
    assert.ok(pixelImage(drawing.ops[0]).value.startsWith('data:image/png;base64,'));
    const text=await b.run("api.drawKey({width:64,height:64,commands:[{type:'text',x:32,y:32,text:'42',size:28,color:'#ffffff',bold:true}]});",input);
    assert.ok(Buffer.from(text.ops[0].rgba,'base64').some((v,i)=>i%4===3&&v>0));
    const {validateNativeManifest,NativePluginHost}=require('../app/streamdeck-editor/deckforge-native-sdk.cjs');
    const manifest=validateNativeManifest(JSON.parse(await fs.readFile(path.join(__dirname,'../examples/deckforge-sdk/visual-counter.native.json'),'utf8')));
    const action=manifest.actions[0],host=new NativePluginHost('/unused');
    try{
      const settings={count:3,step:2,direction:'up',unrelated:'keep'};
      const press=await b.run(action.script,{...input,settings});
      const validated=host.validateScriptOps({pluginUUID:manifest.id,action,permissions:manifest.permissions,settings},'press',press.ops);
      assert.deepEqual(validated,{normal:[],effects:[{op:'settings',value:{...settings,count:5}}]});
      const refreshed=await b.run(action.script,{...input,event:{...input.event,type:'settings'},settings:validated.effects[0].value});
      const other=await b.run(action.script,{...input,event:{...input.event,type:'settings'},settings:{count:17,step:1,direction:'down'}});
      assert.notEqual(refreshed.ops[0].rgba,other.ops[0].rgba);
      assert.equal(host.validateScriptOps({pluginUUID:manifest.id,action,permissions:manifest.permissions,settings},'settings',refreshed.ops).normal[0].op,'image');
    }finally{host.close();}
    const badDraw=createScriptRunner('com.deckforge.native.baddraw');
    try{await assert.rejects(badDraw.run("api.drawKey({width:9999,height:64,commands:[]});",input),/invalid key drawing/);}finally{badDraw.close();}
    const c=createScriptRunner('com.deckforge.native.smokec');
    try{
      await assert.rejects(c.run("await new Promise(()=>{});",input),/timeout/);
    }finally{c.close();}
    const cancelled=createScriptRunner('com.deckforge.native.cancelled');
    try{
      const pending=cancelled.run("await new Promise(()=>{});",input);
      cancelled.close();
      await assert.rejects(pending,/closed|initialization failed/);
    }finally{cancelled.close();}
    console.log('DeckForge JavaScript SDK renderer smoke passed');
    await verifyPublicApi(b);
    await verifyWindowsEncryption();
    await verifyVectorRendering();
    a.close();b.close();app.exit(0);
  }catch(error){console.error(error);a.close();b.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
