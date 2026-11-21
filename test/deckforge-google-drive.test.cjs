'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {GoogleDrive,clientConfig,authorizationUrl,uploadSession,backupMeta,SCOPE}=require('../app/streamdeck-editor/google-drive.cjs');
const config={installed:{client_id:'123-test.apps.googleusercontent.com',client_secret:'local-test-secret',auth_uri:'https://untrusted.invalid'}};
const bytes=Buffer.from('encrypted backup fixture'),filename='DeckForge-2026-11-21-test.dfbackup';
const plainBytes=Buffer.from('{"format":"deckforge-backup-v1"}'),plainName='DeckForge-2026-11-21-plain.dfjson';
const plainMeta={id:'file_json',name:plainName,createdTime:'2026-11-21T01:00:00Z',size:String(plainBytes.length),mimeType:'application/json',trashed:false,appProperties:{deckforge:'backup-v1'},md5Checksum:crypto.createHash('md5').update(plainBytes).digest('hex')};
const meta={id:'file_1',name:filename,createdTime:'2026-11-21T01:00:00Z',size:String(bytes.length),mimeType:'application/octet-stream',trashed:false,appProperties:{deckforge:'backup-v1'},md5Checksum:crypto.createHash('md5').update(bytes).digest('hex')};
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('Desktop OAuth, fixed endpoints and scoped backup metadata',()=>{
  assert.equal(clientConfig(config).clientId,config.installed.client_id);
  assert.throws(()=>clientConfig({web:config.installed}));
  assert.throws(()=>uploadSession('https://evil.example/upload/drive/v3/files?upload_id=x'));
  assert.throws(()=>uploadSession('http://www.googleapis.com/upload/drive/v3/files?upload_id=x'));
  assert.equal(uploadSession('https://www.googleapis.com/upload/drive/v3/files?upload_id=x'),'https://www.googleapis.com/upload/drive/v3/files?upload_id=x');
  assert.equal(backupMeta({...meta,name:'DeckForge-general.dfjson',mimeType:'application/json'}).name,'DeckForge-general.dfjson');
  assert.equal(backupMeta({...meta,name:'DeckForge-general.dfjson'}).name,'DeckForge-general.dfjson');
  assert.equal(backupMeta({...meta,mimeType:'application/json'}),null);
  assert.equal(backupMeta({...meta,name:'DeckForge-general.dfjson',mimeType:'text/plain'}),null);
  assert.equal(backupMeta({...meta,name:'other.dfjson'}),null);
  assert.equal(backupMeta({...meta,name:'DeckForge-general.json',mimeType:'application/json'}),null);
  assert.equal(backupMeta({...meta,appProperties:{}}),null);assert.equal(backupMeta({...meta,trashed:true}),null);
});
test('connect, local protected credentials, token refresh, scoped upload/list/download',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-drive-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const requests=[];let uploadName='';
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(v=>v^123),decryptString:b=>Buffer.from(b).map(v=>v^123).toString()};
  const fetcher=async(raw,options)=>{
    const u=new URL(raw);requests.push({u,options});assert.equal(options.redirect,'error');
    if(u.href==='https://oauth2.googleapis.com/token'){
      const params=options.body;assert.equal(params.get('client_id'),config.installed.client_id);
      if(params.get('grant_type')==='authorization_code'){assert.ok(params.get('code_verifier'));return json({access_token:'access-test',refresh_token:'refresh-test',expires_in:3600,scope:SCOPE,token_type:'Bearer'});}
      assert.equal(params.get('refresh_token'),'refresh-test');return json({access_token:'access-refreshed',expires_in:3600,scope:SCOPE});
    }
    assert.match(options.headers.Authorization,/^Bearer access-/);assert.equal(u.origin,'https://www.googleapis.com');
    if(u.pathname==='/drive/v3/about')return json({user:{emailAddress:'test@example.test',displayName:'Test'}});
    if(u.pathname==='/drive/v3/files'&&options.method==='POST'){assert.equal(JSON.parse(options.body).name,'DeckForge Backups');return json({id:'folder_1'});}
    if(u.pathname==='/drive/v3/files'){const q=u.searchParams.get('q');assert.ok(q.includes('appProperties'));return json(q.includes('folder-v1')?{files:[]}:{files:[meta,plainMeta,{...meta,id:'other',appProperties:{}}]});}
    if(u.pathname==='/upload/drive/v3/files'&&options.method==='POST'){
      const body=JSON.parse(options.body);assert.deepEqual(body.parents,['folder_1']);assert.equal(body.appProperties.deckforge,'backup-v1');
      uploadName=body.name;
      const mime=uploadName.endsWith('.dfjson')?'application/json':'application/octet-stream';
      assert.equal(body.mimeType,mime);assert.equal(options.headers['X-Upload-Content-Type'],mime);
      return new Response(null,{status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc'}});
    }
    if(u.pathname==='/upload/drive/v3/files'&&options.method==='PUT'){
      const isPlain=uploadName.endsWith('.dfjson');assert.deepEqual(options.body,isPlain?plainBytes:bytes);
      assert.equal(options.headers['Content-Type'],isPlain?'application/json':'application/octet-stream');
      // A Drive resumable response may omit fields while a subsequent
      // files.get returns the complete, authoritative metadata.
      return json({id:isPlain?'file_json':'file_1'});
    }
    if(u.pathname==='/drive/v3/files/file_1')return u.searchParams.get('alt')==='media'?new Response(bytes):json(meta);
    if(u.pathname==='/drive/v3/files/file_json')return u.searchParams.get('alt')==='media'?new Response(plainBytes):json(plainMeta);
    if(u.pathname==='/drive/v3/files/other')return json({...meta,id:'other',appProperties:{}});
    throw Error('unexpected request');
  };
  const args={directory:dir,safeStorage,fetcher,openExternal:async()=>{throw Error('mock must not launch browser');},
    codeReceiver:async({client,state,challenge})=>{
      const url=new URL(authorizationUrl(client,'http://127.0.0.1:43123/google/callback',state,challenge));
      assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),SCOPE);
      assert.equal(url.searchParams.get('state'),state);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
      return {code:'code',redirectUri:'http://127.0.0.1:43123/google/callback'};
    }};
  const drive=new GoogleDrive(args);assert.deepEqual(await drive.status(),{connected:false});
  assert.equal((await drive.connect(config)).email,'test@example.test');
  const stored=fs.readFileSync(path.join(dir,'connection.enc'));
  assert.equal(stored.includes(Buffer.from('refresh-test')),false);assert.equal(stored.includes(Buffer.from('access-test')),false);
  const restarted=new GoogleDrive(args);assert.equal((await restarted.status()).connected,true);
  assert.equal((await restarted.upload(filename,bytes)).id,'file_1');
  assert.equal((await restarted.upload(plainName,plainBytes)).id,'file_json');
  assert.equal((await restarted.list()).items.length,2);
  assert.deepEqual((await restarted.download('file_1')).bytes,bytes);
  assert.deepEqual((await restarted.download('file_json')).bytes,plainBytes);
  await assert.rejects(()=>restarted.download('other'),/유효한 백업/);
  assert.equal(requests.some(r=>r.u.searchParams.get('alt')==='media'&&r.u.pathname.endsWith('/other')),false);
  assert.deepEqual(restarted.disconnect(),{connected:false});assert.equal(fs.existsSync(path.join(dir,'connection.enc')),false);
  assert.deepEqual(await restarted.status(),{connected:false});
});
