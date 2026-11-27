'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {StoreClient,DEFAULT_STORE_ORIGIN}=require('../app/deckforge-editor/store-client.cjs');
test('single connect validates fields, checks HTTPS before login, remembers only encrypted password',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-store-login-')),calls=[];
 const vault={available:()=>true,encrypt:s=>Buffer.from(s.split('').reverse().join('')),decrypt:b=>b.toString().split('').reverse().join('')};
 const request=async(origin,route,options)=>{
  calls.push({origin,route,options});
  if(route==='/api/v1/health')return {ok:true,service:'deckforge-store',apiVersion:1};
  if(route==='/api/v1/auth/login')return {account:{id:'user1',username:'tester',role:'owner'},accessToken:'a'.repeat(32),expiresIn:300};
  return null;
 };
 try{
  let client=new StoreClient(dir,{request,vault});
  await assert.rejects(client.connect(DEFAULT_STORE_ORIGIN,'tester','',false),/비밀번호/);assert.equal(calls.length,0);
  const connected=await client.connect(DEFAULT_STORE_ORIGIN,'tester','Secret-pass-123',true);
  assert.equal(connected.account.username,'tester');assert.equal(connected.hasSavedPassword,true);
  assert.deepEqual(calls.map(x=>x.route),['/api/v1/health','/api/v1/auth/login']);
  assert.equal(calls[1].options.body.password,'Secret-pass-123');
  assert.ok(!fs.readFileSync(path.join(dir,'store-login.json'),'utf8').includes('Secret-pass-123'));
  client=new StoreClient(dir,{request,vault});assert.equal(client.status().rememberedUsername,'tester');
  await assert.rejects(client.connect('https://other.example','tester','',true),/비밀번호/);
  await client.connect(DEFAULT_STORE_ORIGIN,'tester','',true);
  assert.equal(calls.at(-1).options.body.password,'Secret-pass-123');
  await client.forgetPassword();assert.equal(client.status().hasSavedPassword,false);
  await client.logout();await client.connect(DEFAULT_STORE_ORIGIN,'tester','Secret-pass-123',false);assert.equal(client.status().hasSavedPassword,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('explicit auto login survives restart and expiry, logout disables it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-store-auto-'));let time=1000,logins=0;
 const vault={available:()=>true,encrypt:s=>Buffer.from(s.split('').reverse().join('')),decrypt:b=>b.toString().split('').reverse().join('')};
 const request=async(origin,route)=>{if(route.endsWith('/health'))return {ok:true,service:'deckforge-store',apiVersion:1};if(route.endsWith('/login')){logins++;return {account:{id:'user1',username:'tester',role:'owner'},accessToken:'a'.repeat(32),expiresIn:300};}return null;};
 try{
  let client=new StoreClient(dir,{request,vault,now:()=>time});
  await client.connect(DEFAULT_STORE_ORIGIN,'tester','secret123',true,true);
  client=new StoreClient(dir,{request,vault,now:()=>time});
  assert.equal(client.status().autoLogin,true);
  await Promise.all([client.autoConnect(),client.autoConnect()]);assert.equal(logins,2);
  time+=301000;assert.equal((await client.autoConnect()).account.username,'tester');assert.equal(logins,3);
  await client.logout();assert.equal(client.status().autoLogin,false);
  client=new StoreClient(dir,{request,vault,now:()=>time});
  assert.equal((await client.autoConnect()).account,null);assert.equal(logins,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('store detail starts with the final gallery geometry rather than a large cover',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const a=src.indexOf('async function openStoreCatalog()'),b=src.indexOf('    const matching=items;',a);
 const detail=src.slice(a,b);
 assert.ok(a>=0&&b>a);
 assert.match(detail,/const panel=node\('div','store-remote-gallery'\)/);
 assert.match(detail,/store-gallery-cell store-gallery-placeholder/);
 assert.doesNotMatch(detail,/grid\.append\(previewGrid\(/);
 assert.match(src.slice(b),/galleryTotal=0;galleryLegacy=false;\+\+previewRequest;render\(\);if\(kind==='iconpack'\)void loadGallery\(item\)/);
});
