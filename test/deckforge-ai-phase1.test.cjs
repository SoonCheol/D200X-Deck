'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ChatAuth,pkce,authorizationUrl,verifyId,callbackListener}=require('../app/streamdeck-editor/ai/auth.cjs');
const {modelsOf,chat,cleanHistory}=require('../app/streamdeck-editor/ai/responses.cjs');
const {createHash}=crypto;
const events=(...items)=>new Response(items.map(data=>'data: '+JSON.stringify(data)+'\r\n\r\n').join(''),{status:200});
const complete=output=>({type:'response.completed',response:{status:'completed',output}});
const message={role:'user',content:'test'};
test('OAuth uses new PKCE, real host ID, plan scope and existing registration',()=>{
  const p=pkce();assert.equal(p.challenge,createHash('sha256').update(p.verifier).digest('base64url'));
  assert.notEqual(p.verifier,pkce().verifier);
  const params={hostId:'urn:uuid:'+crypto.randomUUID(),redirectUri:'http://127.0.0.1:1234/auth/callback',state:'s',nonce:'n',challenge:p.challenge};
  const first=new URL(authorizationUrl(params));
  assert.equal(first.origin,'https://auth.openai.com');assert.equal(first.searchParams.get('client_id'),'dynamic_agent_client');
  assert.equal(first.searchParams.get('agent_name_hint'),'DeckForge');
  assert.ok(first.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));
  const again=new URL(authorizationUrl({...params,clientId:'oaiapp_test'}));
  assert.equal(again.searchParams.get('client_id'),'oaiapp_test');assert.equal(again.searchParams.has('agent_name_hint'),false);
});
test('loopback callback rejects wrong state and accepts issued ID',async()=>{
  const result=await callbackListener({state:'expected',open:async uri=>{
    assert.equal(new URL(uri).hostname,'127.0.0.1');
    const bad=await fetch(uri+'?state=wrong&code=abc&client_id=oaiapp_test');assert.equal(bad.status,400);
    await bad.text();
    const good=await fetch(uri+'?state=expected&code=abc&client_id=oaiapp_test');assert.equal(good.status,200);await good.text();
  }});
  assert.equal(result.clientId,'oaiapp_test');assert.equal(result.code,'abc');
});
test('ID token requires matching signature, issuer, audience, nonce and expiry',async()=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256'};
  const fetcher=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
  const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const make=claims=>{const prefix=b({alg:'RS256',kid:'test'})+'.'+b(claims);return prefix+'.'+crypto.sign('RSA-SHA256',Buffer.from(prefix),privateKey).toString('base64url');};
  const claims={iss:'https://auth.openai.com',aud:'oaiapp_test',nonce:'nonce',sub:'test',exp:Date.now()/1000+3600};
  assert.equal((await verifyId(make(claims),'oaiapp_test','nonce',fetcher)).sub,'test');
  await assert.rejects(verifyId(make({...claims,aud:'other'}),'oaiapp_test','nonce',fetcher));
  await assert.rejects(verifyId(make({...claims,nonce:'bad'}),'oaiapp_test','nonce',fetcher));
  await assert.rejects(verifyId(make({...claims,exp:1}),'oaiapp_test','nonce',fetcher));
  await assert.rejects(verifyId(make(claims).replace(/\.[^.]+$/,'.bad'),'oaiapp_test','nonce',fetcher));
});
test('encrypted storage preserves host, and concurrent refresh rotates only once',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-ai-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  // Mock OS encryption; real Windows DPAPI requires installed Electron.
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(x=>x^165),decryptString:b=>Buffer.from(b).map(x=>x^165).toString()};
  let requests=0;
  const options={directory,safeStorage,openExternal:async()=>{},fetcher:async(url,opts)=>{
    requests++;assert.equal(new URLSearchParams(opts.body).get('refresh_token'),'refresh-old');
    return new Response(JSON.stringify({access_token:'access-new',refresh_token:'refresh-new',token_type:'Bearer',expires_in:3600}),{status:200});
  }};
  const a=new ChatAuth(options),r=await a.load(),scope='resource.invoke chatgpt.tokens.use.direct';
  await a.save({...r,clientId:'oaiapp_test',accessToken:'access-old',refreshToken:'refresh-old',expiresAt:0,scope});
  const restarted=new ChatAuth(options);assert.equal((await restarted.load()).hostId,r.hostId);
  assert.deepEqual(await Promise.all([restarted.access(),restarted.access()]),['access-new','access-new']);assert.equal(requests,1);
  assert.equal((await restarted.load()).refreshToken,'refresh-new');
  const bytes=await fs.readFile(path.join(directory,'connection.enc'));assert.equal(bytes.includes(Buffer.from('refresh-new')),false);
  await restarted.clearSession();assert.equal((await restarted.status()).connected,false);
});
test('models filter hidden entries and conversation is bounded',()=>{
  assert.deepEqual(modelsOf({models:[{visibility:'list',slug:'model-a',display_name:'A'},{visibility:'hidden',slug:'hidden'}]}),[{id:'model-a',label:'A'}]);
  assert.throws(()=>cleanHistory([{role:'system',content:'bad'}]));
});
test('plain chat streams completion without tools or paid fallback',async()=>{
  let request;const emitted=[];
  const result=await chat({token:'dummy',model:'model-a',messages:[message],emit:x=>emitted.push(x),fetcher:async(url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');request=JSON.parse(opts.body);
    return events({type:'response.output_text.delta',delta:'안녕'},complete([]));
  }});
  assert.equal(result.text,'안녕');assert.equal(request.store,false);assert.equal(request.stream,true);assert.equal(request.tools,undefined);assert.equal(request.previous_response_id,undefined);assert.equal(emitted[0].text,'안녕');
});
test('version tool only: one completed call and matching output',async()=>{
  let requests=0;const emitted=[];
  const result=await chat({token:'dummy',model:'model-a',messages:[message],toolTest:true,version:'1.1.42',emit:x=>emitted.push(x),fetcher:async(url,opts)=>{
    const req=JSON.parse(opts.body);assert.equal(req.tools[0].type,'namespace');
    if(++requests===1)return events(complete([{type:'function_call',name:'get_version',namespace:'deckforge',call_id:'test-call',arguments:'{}'}]));
    assert.deepEqual(JSON.parse(req.input.at(-1).output),{version:'1.1.42'});assert.equal(req.input.at(-1).call_id,'test-call');
    return events({type:'response.output_text.delta',delta:'1.1.42'},complete([]));
  }});
  assert.equal(result.called,true);assert.equal(requests,2);assert.equal(emitted[0].type,'tool');
});
test('reject incomplete stream, usage error and forged function',async()=>{
  const args={token:'dummy',model:'model-a',messages:[message],toolTest:true,version:'1.1.42'};
  await assert.rejects(chat({...args,fetcher:async()=>events({type:'response.output_text.delta',delta:'partial'})}),/완료 이벤트/);
  await assert.rejects(chat({...args,fetcher:async()=>events({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}})}),/한도/);
  await assert.rejects(chat({...args,fetcher:async()=>events(complete([{type:'function_call',name:'run_shell',call_id:'bad',arguments:'{}'}]))}),/허용되지 않은/);
});
