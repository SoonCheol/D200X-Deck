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

test('catalog requests web-equivalent package format and up to six validated PNG previews',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-store-card-'));
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
 const raw={id:'item1',releaseId:'rel1',kind:'iconpack',source:'third-party',visibility:'private',format:'streamDeckIconPack',packageProfile:'indexed-icons',packageFormat:'streamdeck',name:'Pack',version:'1.0.0',size:128,sha256:'a'.repeat(64),iconCount:7,cover:png,cardPreviews:Array(7).fill(png)};
 let route,opts;
 const request=async(origin,r,o)=>{if(r.endsWith('/health'))return {ok:true,service:'deckforge-store',apiVersion:1};if(r.endsWith('/login'))return {account:{id:'user1',username:'tester',role:'owner'},accessToken:'a'.repeat(32),expiresIn:300};route=r;opts=o;return {items:[raw],nextCursor:''};};
 try{
 const client=new StoreClient(dir,{request});await client.connect(DEFAULT_STORE_ORIGIN,'tester','test-password');
 const page=await client.catalog('iconpack','',{packageFormat:'streamdeck'},true);
 const params=new URL(route,DEFAULT_STORE_ORIGIN).searchParams;
 assert.equal(params.get('previews'),'1');assert.equal(params.get('packageFormat'),'streamdeck');assert.equal(params.has('platform'),false);assert.ok(opts.jsonLimit>=8*1024*1024);
 assert.equal(page.items[0].packageFormat,'streamdeck');assert.equal(page.items[0].cardPreviews.length,6);assert.match(page.items[0].cardPreviews[0],/^data:image\/png;base64,/);
 const editor=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 assert.match(editor,/packageFormat:'전체 형식'/);assert.match(editor,/previewGrid\(previews.slice\(0,6\),'store-remote-cover'\)/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
