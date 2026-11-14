'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const HA=require('../app/streamdeck-editor/ha-client.cjs');
test('HA URL and entity validation',()=>{
  assert.equal(HA.normalizeUrl('http://192.168.0.100:8123/'),'http://192.168.0.100:8123');
  assert.throws(()=>HA.normalizeUrl('file:///etc/passwd'));
  assert.throws(()=>HA.normalizeUrl('https://user:pw@example.com/'));
  assert.throws(()=>HA.validateEntity('script.turn_off'));
  assert.equal(HA.validateEntity('switch.kitchen'),'switch.kitchen');
});
test('HA GET states and POST toggle send Bearer token',async()=>{
  const calls=[];
  const fake=async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,text:async()=>url.endsWith('/api/states')?JSON.stringify([
      {entity_id:'switch.kitchen',state:'off',attributes:{friendly_name:'주방등'}},
      {entity_id:'sensor.temperature',state:'21',attributes:{}}
    ]):'[]'};
  };
  const cfg={url:'http://192.168.0.100:8123',token:'test-token'};
  const list=await HA.listEntities(cfg,fake);
  assert.deepEqual(list,[{entity_id:'switch.kitchen',name:'주방등',state:'off'}]);
  await HA.toggle(cfg,'switch.kitchen',fake);
  assert.equal(calls[1].url,'http://192.168.0.100:8123/api/services/switch/toggle');
  assert.equal(calls[1].opts.method,'POST');
  assert.deepEqual(JSON.parse(calls[1].opts.body),{entity_id:'switch.kitchen'});
  assert.equal(calls[1].opts.headers.Authorization,'Bearer test-token');
});
test('HA errors reject unsuccessful HTTP responses',async()=>{
  await assert.rejects(()=>HA.test({url:'http://localhost:8123',token:'x'},async()=>({ok:false,status:401})),/401/);
});
