'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const [clientPath,root,origin,mode]=process.argv.slice(2);
const {StoreClient}=require(clientPath);
(async()=>{
  const client=new StoreClient(root);
  await client.save(origin);
  await assert.rejects(client.catalog('iconpack'));
  if(mode==='reject'){
    await assert.rejects(client.check());
    assert.equal(client.status().checked,false);
    return;
  }
  assert.equal((await client.check()).checked,true);
  const login=await client.login('owner','test-password-12345');
  assert.equal(login.account.role,'owner');
  assert.equal('token' in login,false);
  assert.equal(fs.readFileSync(path.join(root,'store-connection.json'),'utf8').includes('test-password'),false);
  const page=await client.catalog('iconpack');
  assert.equal(page.items.length,1);
  const item=page.items[0];
  assert.equal(item.visibility,'private');
  assert.match(item.cover,/^data:image\/png;base64,/);
  const preview=await client.preview('iconpack',item.id,item.releaseId,item.sha256);
  assert.equal(preview.previews.length,2);
  await assert.rejects(client.download('iconpack',item.id,item.releaseId,'0'.repeat(64),()=>{throw Error('unexpected consume');}));
  const bytes=await client.download('iconpack',item.id,item.releaseId,item.sha256,(_,data)=>data);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);
  assert.equal(bytes.length,item.size);
  assert.equal((await client.logout()).revoked,true);
  await assert.rejects(client.catalog('iconpack'));
  assert.equal(new StoreClient(root).status().account,null);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
