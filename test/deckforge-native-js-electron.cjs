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
    console.log('DeckForge JavaScript SDK renderer smoke passed');
    await verifyWindowsEncryption();
    a.close();b.close();app.exit(0);
  }catch(error){console.error(error);a.close();b.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
