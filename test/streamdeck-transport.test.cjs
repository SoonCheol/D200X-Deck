'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { D200XTransport, KEEPALIVE_MS } = require('../app/streamdeck-editor/transport.cjs');
const { PROTO } = require('../app/lib/protocol');

class FakeDeck extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.calls = [];
    this.opens = 0;
    this.brightness = null;
  }
  async connectAsync() {
    this.opens++;
    if (!this.connected) {
      this.connected = true;
      this.emit('status', this.status());
    }
    return true;
  }
  status() { return { connected: this.connected, message: this.connected ? 'Connected' : 'Lost' }; }
  setWideMode(mode) { this.calls.push(['wide',mode]); }
  pushPage(bytes) { this.calls.push(['page',bytes.toString()]); }
  setBrightness(value) { this.calls.push(['brightness',value]); }
  sendFrame(cmd,proto,body) { this.calls.push(['frame',cmd,proto,body.toString()]); }
  disconnect() { this.connected=false;this.emit('status',this.status()); }
}

const idle=()=>new Promise(resolve=>setImmediate(resolve));

test('no full redraw while idle; 5s blank-mode keep-alive; no brightness changes',async()=>{
  let time=10000;
  const deck=new FakeDeck();
  const t=new D200XTransport({deck, now:()=>time,buildPage:async()=>Buffer.from('zip')});
  await t.start();
  t.schedule([{index:0,png:Buffer.from('one')}]);
  await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,1);
  time+=KEEPALIVE_MS-1;t.tick();
  assert.equal(deck.calls.filter(x=>x[0]==='frame').length,0);
  time+=1;t.tick();
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|||||24H|']);
  assert.equal(deck.calls.filter(x=>x[0]==='brightness').length,0);
  t.stop();
});

test('observed device brightness may be reused without changing the value',async()=>{
  let time=10000;const deck=new FakeDeck();
  const t=new D200XTransport({deck,now:()=>time});
  await t.start();deck.emit('brightness',37);time+=5000;t.tick();
  assert.deepEqual(deck.calls.at(-1),['brightness',37]);t.stop();
});

test('brightness clamp and keepalive preserve the requested value',async()=>{
  let time=10000;const deck=new FakeDeck(),t=new D200XTransport({deck,now:()=>time});
  await t.start();assert.throws(()=>t.adjustBrightness(1,5),/아직 확인/);
  deck.emit('brightness',97);
  assert.equal(t.adjustBrightness(1,10),100);
  assert.equal(t.adjustBrightness(-1,2),98);
  time+=5000;t.tick();assert.deepEqual(deck.calls.at(-1),['brightness',98]);t.stop();
});

test('device-info repeated connected events do not resend; reconnect restores last page',async()=>{
  const deck=new FakeDeck();
  const t=new D200XTransport({deck,buildPage:async()=>Buffer.from('zip')});
  await t.start();
  t.schedule([{index:0,png:Buffer.from('one')}]);await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,1);
  deck.emit('status',deck.status());await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,1);
  deck.disconnect();await t.connect();await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,2);
  t.stop();
});

test('new edits during ZIP compression are sent after the outdated build completes',async()=>{
  const deck=new FakeDeck();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let builds=0;
  const t=new D200XTransport({deck,buildPage:async()=>{
    builds++;
    if(builds===1)await gate;
    return Buffer.from('zip'+builds);
  }});
  await t.start();
  t.schedule([{index:0,png:Buffer.from('old')}]);
  t.schedule([{index:0,png:Buffer.from('new')}]);
  release();await idle();await idle();
  assert.deepEqual(deck.calls.filter(x=>x[0]==='page').map(x=>x[1]),['zip2']);
  t.stop();
});

test('disconnection after failed transfer does not lose the current page',async()=>{
  const deck=new FakeDeck();let first=true;
  deck.pushPage=(zip)=>{
    if(first){first=false;deck.disconnect();throw new Error('fake USB reset');}
    deck.calls.push(['page',zip.toString()]);
  };
  const t=new D200XTransport({deck,buildPage:async()=>Buffer.from('zip')});
  t.on('error-message',()=>{});
  await t.start();
  t.schedule([{index:0,png:Buffer.from('saved')}]);await idle();
  assert.equal(deck.connected,false);
  await t.connect();await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,1);
  t.stop();
});
