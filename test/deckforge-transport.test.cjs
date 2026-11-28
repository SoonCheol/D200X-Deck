'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { D200XTransport, KEEPALIVE_MS, MIN_BRIGHTNESS } = require('../app/deckforge-editor/transport.cjs');
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
  pushKey(bytes) { this.calls.push(['key',bytes.toString()]); }
  setBrightness(value) { this.calls.push(['brightness',value]); }
  setSleepTime(value) { this.calls.push(['sleep',value]); }
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
  const framesBeforeIdle=deck.calls.filter(x=>x[0]==='frame').length;
  time+=KEEPALIVE_MS-1;t.tick();
  assert.equal(deck.calls.filter(x=>x[0]==='frame').length,framesBeforeIdle);
  time+=1;t.tick();
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0']);
  assert.equal(deck.calls.filter(x=>x[0]==='brightness').length,0);
  t.stop();
});

test('observed device brightness may be reused without changing the value',async()=>{
  let time=10000;const deck=new FakeDeck();
  const t=new D200XTransport({deck,now:()=>time});
  await t.start();deck.emit('brightness',37);time+=5000;t.tick();
  assert.ok(deck.calls.some(x=>x[0]==='brightness'&&x[1]===37));
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0']);t.stop();
});

test('brightness clamp and keepalive preserve the requested value',async()=>{
  let time=10000;const deck=new FakeDeck(),t=new D200XTransport({deck,now:()=>time});
  await t.start();assert.throws(()=>t.adjustBrightness(1,5),/아직 확인/);
  deck.emit('brightness',97);
  assert.equal(t.adjustBrightness(1,10),100);
  assert.equal(t.adjustBrightness(-1,2),98);
  time+=5000;t.tick();assert.ok(deck.calls.some(x=>x[0]==='brightness'&&x[1]===98));
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0']);t.stop();
});

test('absolute brightness presets enforce the safety floor and update keepalive',async()=>{
  let time=12000;const deck=new FakeDeck();const t=new D200XTransport({deck,now:()=>time});
  await t.start();assert.throws(()=>t.setSafeBrightness(0),/20~100/);
  assert.equal(t.setSafeBrightness(30),30);time+=KEEPALIVE_MS;t.tick();
  assert.ok(deck.calls.some(x=>x[0]==='brightness'&&x[1]===30));
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0']);t.stop();
});

test('repeated brightness decreases stop at the visible safety floor',async()=>{
  assert.equal(MIN_BRIGHTNESS,20);
  const deck=new FakeDeck();const t=new D200XTransport({deck});await t.start();
  deck.emit('brightness',23);
  assert.equal(t.adjustBrightness(-1,10),20);
  assert.equal(t.adjustBrightness(-1,10),20);
  assert.deepEqual(deck.calls.filter(call=>call[0]==='brightness'),[['brightness',20]]);
  assert.equal(t.adjustBrightness(1,5),25);
  t.stop();
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

test('known brightness and last page persist through reconnect without idle redraw',async()=>{
  let now=20000;const deck=new FakeDeck();
  const t=new D200XTransport({deck,now:()=>now,buildPage:async()=>Buffer.from('zip')});
  await t.start();deck.emit('brightness',60);
  assert.equal(t.adjustBrightness(-1,5),55);
  t.schedule([{index:0,png:Buffer.from('key')}]);await idle();
  deck.disconnect();await t.connect();await idle();
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,2);
  now+=KEEPALIVE_MS;t.tick();
  assert.ok(deck.calls.some(x=>x[0]==='brightness'&&x[1]===55));
  assert.deepEqual(deck.calls.at(-1),['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0']);
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

test('native device sleep suspends keepalive; the first hardware press wakes without executing actions',async()=>{
  let now=20000;const deck=new FakeDeck();
  const t=new D200XTransport({deck,now:()=>now,buildPage:async()=>Buffer.from('zip')});
  const events=[];t.on('key',event=>events.push(event));
  await t.start();
  t.schedule([{index:0,png:Buffer.from('saved')}]);await idle();
  assert.equal(t.sleepDisplay(),true);
  assert.deepEqual(deck.calls.at(-1),['sleep',1]);
  const framesBeforeSleep=deck.calls.filter(x=>x[0]==='frame').length;
  now+=KEEPALIVE_MS;t.tick();
  assert.equal(deck.calls.filter(x=>x[0]==='frame').length,framesBeforeSleep);
  deck.emit('key',{index:0,pressed:true,kind:1,state:1});
  await idle();
  assert.deepEqual(deck.calls.filter(x=>x[0]==='sleep').map(x=>x[1]),[1,0]);
  assert.equal(events.length,0);
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,2);
  deck.emit('key',{index:0,pressed:false,kind:1,state:0});
  assert.equal(events.length,1);
  t.stop();
});


test('native clock and stats display modes reach the firmware without blank keepalive',async()=>{
  let time=10000;
  const deck=new FakeDeck();
  const sent=[];
  const t=new D200XTransport({deck,now:()=>time,buildPage:async(_images,mode)=>{
    sent.push(mode);return Buffer.from('zip');
  }});
  await t.start();
  t.schedule([{index:13,png:Buffer.from('clock')}],'clock');
  await idle();
  assert.deepEqual(sent,['clock']);
  assert.ok(deck.calls.some(c=>c[0]==='wide'&&c[1]==='clock'));
  time+=KEEPALIVE_MS;t.tick();
  assert.equal(deck.calls.filter(c=>c[0]==='frame').length,0);
  t.schedule([{index:13,png:Buffer.from('stats')}],'stats');
  await idle();
  assert.deepEqual(sent,['clock','stats']);
  assert.ok(deck.calls.some(c=>c[0]==='wide'&&c[1]==='stats'));
  t.schedule([{index:13,png:Buffer.from('date')}],'blank');
  await idle();
  assert.deepEqual(sent,['clock','stats','blank']);
  t.stop();
});

test('switching from native stats to uploaded PNG never reactivates native stats overlay',async()=>{
  const deck=new FakeDeck();
  const t=new D200XTransport({deck,buildPage:async()=>Buffer.from('zip')});
  await t.start();
  t.schedule([{index:13,png:Buffer.from('stats')}],'stats');await idle();
  const from=deck.calls.length;
  t.schedule([{index:13,png:Buffer.from('knobs')}],'blank');await idle();
  assert.deepEqual(deck.calls.slice(from).filter(x=>['frame','wide','page'].includes(x[0])),[
    ['wide','blank'],
    ['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0'],
    ['page','zip'],
    ['frame',0,PROTO.CLOCK,'2|0|0|00:00:00|0'],
  ]);
  assert.equal(deck.calls.slice(from).some(x=>x[0]==='frame'&&
    (String(x[3]).startsWith('0|')||String(x[3]).startsWith('1|'))),false);
  const next=deck.calls.length;
  t.schedule([{index:13,png:Buffer.from('date')}],'blank');await idle();
  assert.deepEqual(deck.calls.slice(next).filter(x=>x[0]==='frame').map(x=>x[3]),[
    '2|0|0|00:00:00|0','2|0|0|00:00:00|0'
  ]);
  t.stop();
});

test('complete-page ZIP cache reuses compression but never skips full PAGE writes',async()=>{
 const deck=new FakeDeck(),logs=[];let builds=0;
 const t=new D200XTransport({deck,buildPage:async(_images,mode)=>Buffer.from(mode+'-'+(++builds))});
 t.on('diagnostic',x=>logs.push(x));
 const images=()=>Array.from({length:14},(_,index)=>({index,png:Buffer.from('slot-'+index)}));
 try{
  await t.start();
  t.schedule(images(),'blank');await idle();
  t.schedule(images(),'blank');await idle();
  assert.equal(builds,1);
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,2);
  assert.ok(logs.some(x=>x.type==='page-sent'&&x.detail.includes('cached ZIP')));
  deck.disconnect();await t.connect();await idle();
  assert.equal(builds,1);
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,3);
  t.schedule(images(),'clock');await idle();assert.equal(builds,2);
  const changed=images();changed[4].png=Buffer.from('changed');
  t.schedule(changed,'clock');await idle();assert.equal(builds,3);
  assert.equal(deck.calls.filter(x=>x[0]==='page').length,5);
 }finally{t.stop();}
});

const completeImages=(changes={})=>Array.from({length:14},(_,index)=>({index,png:Buffer.from(changes[index]??'slot-'+index)}));
const pageWrites=deck=>deck.calls.filter(x=>x[0]==='page'||x[0]==='key');
test('KEY is disabled by default even for caller-confirmed live update',async()=>{
 const deck=new FakeDeck(),t=new D200XTransport({deck,buildPage:async()=>Buffer.from('page'),buildKeyUpdate:async()=>{throw Error('must not build KEY');}});
 try{await t.start();t.schedule(completeImages());await idle();t.schedule(completeImages({0:'new'}),'blank',true);await idle();assert.deepEqual(pageWrites(deck),[['page','page'],['page','page']]);}finally{t.stop();}
});
test('experimental KEY only sends a single changed ordinary slot on established blank PAGE',async()=>{
 const deck=new FakeDeck(),t=new D200XTransport({deck,incrementalKeys:true,buildPage:async()=>Buffer.from('page'),buildKeyUpdate:async(slot,png)=>Buffer.from(slot+':'+png)});
 try{
  await t.start();t.schedule(completeImages());await idle();
  t.schedule(completeImages({6:'new'}),'blank',true);await idle();
  assert.deepEqual(pageWrites(deck),[['page','page'],['key','1_1:new']]);
  t.schedule(completeImages({6:'new',13:'wide'}),'blank',true);await idle();
  t.schedule(completeImages({6:'new',13:'wide',0:'a',1:'b'}),'blank',true);await idle();
  t.schedule(completeImages({0:'a'}),'clock',true);await idle();
  t.schedule(completeImages({0:'b'}),'clock',true);await idle();
  t.schedule(completeImages({0:'b'}),'blank');await idle();
  t.schedule(completeImages({0:'c'}),'blank');await idle();
  assert.deepEqual(pageWrites(deck).slice(2).map(x=>x[0]),Array(6).fill('page'));
  deck.disconnect();await t.connect();await idle();
  assert.equal(pageWrites(deck).at(-1)[0],'page');
  t.schedule(completeImages({0:'d'}),'blank',true);await idle();
  assert.equal(pageWrites(deck).at(-1)[0],'key');
  t.sleepDisplay();t.wakeDisplay();await idle();assert.equal(pageWrites(deck).at(-1)[0],'page');
 }finally{t.stop();}
});
test('KEY failure forces full PAGE and disables KEY until next process',async()=>{
 const deck=new FakeDeck(),logs=[];let attempts=0;
 deck.pushKey=()=>{attempts++;throw Error('fake partial write');};
 const t=new D200XTransport({deck,incrementalKeys:true,buildPage:async()=>Buffer.from('page'),buildKeyUpdate:async()=>Buffer.from('key')});
 t.on('diagnostic',x=>logs.push(x));
 try{
  await t.start();t.schedule(completeImages());await idle();
  t.schedule(completeImages({0:'a'}),'blank',true);await idle();
  t.schedule(completeImages({0:'b'}),'blank',true);await idle();
  assert.equal(attempts,1);assert.equal(pageWrites(deck).length,3);
  assert.ok(logs.some(x=>x.type==='key-fallback'));
 }finally{t.stop();}
});
test('new full request invalidates pending experimental KEY even if superseded by live update',async()=>{
 const deck=new FakeDeck();let release;const gate=new Promise(r=>release=r);
 const t=new D200XTransport({deck,incrementalKeys:true,buildPage:async()=>Buffer.from('page'),buildKeyUpdate:async()=>{await gate;return Buffer.from('key');}});
 try{
  await t.start();t.schedule(completeImages());await idle();
  t.schedule(completeImages({0:'a'}),'blank',true);
  t.schedule(completeImages({1:'b'}),'blank');
  t.schedule(completeImages({1:'c'}),'blank',true);
  release();await idle();await idle();
  assert.deepEqual(pageWrites(deck),[['page','page'],['page','page']]);
 }finally{t.stop();}
});
test('experimental KEY burst periodically restores full PAGE',async()=>{
 const deck=new FakeDeck(),t=new D200XTransport({deck,incrementalKeys:true,buildPage:async()=>Buffer.from('page'),buildKeyUpdate:async()=>Buffer.from('key')});
 try{await t.start();t.schedule(completeImages());await idle();
  for(let i=0;i<17;i++){t.schedule(completeImages({0:'value-'+i}),'blank',true);await idle();}
  assert.deepEqual(pageWrites(deck).map(x=>x[0]),['page',...Array(16).fill('key'),'page']);
 }finally{t.stop();}
});

test('obsolete PAGE compression failure preserves newer complete request',async()=>{
 const deck=new FakeDeck();let reject;const gate=new Promise((_r,j)=>{reject=j;});
 let builds=0;
 const t=new D200XTransport({deck,buildPage:async(images)=>{if(++builds===1)await gate;return Buffer.from(images[0].png);}});
 try{
  await t.start();t.schedule(completeImages({0:'old'}));t.schedule(completeImages({0:'latest'}));
  reject(Error('old compression failed'));await idle();await idle();
  assert.deepEqual(pageWrites(deck),[['page','latest']]);assert.equal(t.pending,null);
 }finally{t.stop();}
});
test('sleep during compression defers all visual writes until wake and restores latest PAGE',async()=>{
 const deck=new FakeDeck();let release;const gate=new Promise(r=>{release=r;});
 let builds=0;const t=new D200XTransport({deck,incrementalKeys:true,buildPage:async(images)=>{if(++builds===1)await gate;return Buffer.from(images[0].png);}});
 try{
  await t.start();t.schedule(completeImages({0:'before'}));t.sleepDisplay();
  t.schedule(completeImages({0:'asleep'}),'blank',true);
  release();await idle();await idle();
  assert.deepEqual(pageWrites(deck),[]);assert.equal(t.pending,t.currentImages);
  t.wakeDisplay();await idle();await idle();
  assert.deepEqual(pageWrites(deck),[['page','asleep']]);assert.equal(t.pending,null);
 }finally{t.stop();}
});
test('KEY write disconnect restores latest PAGE on reconnect without repeating KEY',async()=>{
 const deck=new FakeDeck();let attempts=0;
 deck.pushKey=()=>{attempts++;deck.disconnect();throw Error('USB lost');};
 const t=new D200XTransport({deck,incrementalKeys:true,buildPage:async(images)=>Buffer.from(images[0].png),buildKeyUpdate:async()=>Buffer.from('key')});
 try{
  await t.start();t.schedule(completeImages());await idle();
  t.schedule(completeImages({0:'failed-key'}),'blank',true);await idle();
  assert.equal(deck.connected,false);
  t.schedule(completeImages({0:'latest'}),'blank',true);
  await t.connect();await idle();await idle();
  assert.deepEqual(pageWrites(deck),[['page','slot-0'],['page','latest']]);assert.equal(attempts,1);
  t.schedule(completeImages({0:'after'}),'blank',true);await idle();
  assert.equal(pageWrites(deck).at(-1)[0],'page');assert.equal(attempts,1);
 }finally{t.stop();}
});
test('stop closes a handle opened by a delayed HID scan',async()=>{
 const deck=new FakeDeck();let release;const gate=new Promise(r=>{release=r;});
 deck.connectAsync=async()=>{await gate;deck.connected=true;deck.emit('status',deck.status());return true;};
 const t=new D200XTransport({deck});
 const starting=t.start();await idle();t.stop();release();await starting;
 assert.equal(deck.connected,false);assert.equal(t.pending,null);assert.equal(t.timer,null);
});

test('explicit hardware trial records PAGE and KEY ZIP bytes without asserting firmware acknowledgement',async()=>{
 const deck=new FakeDeck(),logs=[];
 const t=new D200XTransport({deck,incrementalKeys:true,buildPage:async()=>Buffer.alloc(100),buildKeyUpdate:async()=>Buffer.alloc(20)});
 t.on('diagnostic',x=>logs.push(x));
 try{
  await t.start();t.schedule(completeImages());await idle();
  t.schedule(completeImages({5:'live'}),'blank',true);await idle();
  const page=logs.find(x=>x.type==='page-sent'),key=logs.find(x=>x.type==='key-sent');
  assert.equal(page.zipBytes,100);assert.equal(page.slots,14);assert.equal(page.incremental,false);
  assert.equal(key.zipBytes,20);assert.equal(key.slot,5);assert.equal(key.slots,1);
  assert.equal(key.session,page.session);assert.equal(key.incremental,true);
 }finally{t.stop();}
});
test('production trial requires explicit process flag and renderer single-slot partial request',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'../app/deckforge-editor',file),'utf8');
 assert.match(read('main.cjs'),/const keyTransportTrial=process\.argv\.includes\('--test-key-transport'\)/);
 assert.match(read('main.cjs'),/new D200XTransport\(\{incrementalKeys:keyTransportTrial\}\)/);
 assert.match(read('main.cjs'),/wideMode,keyTransportTrial&&liveOnly===true,pageToken\)/);
 assert.match(read('preload.cjs'),/syncPage:.*liveOnly===true/);
 const renderer=read('device-sync.js');
 assert.match(renderer,/cacheAndSendImages\(images,mode,stamp,partial&&indices\.length===1&&indices\[0\]<13&&mode==='blank'\)/);
 assert.match(renderer,/bridge\.syncPage\(overlay,'blank',false,window\.D200XPageEntryToken\?\.\(\)\)/);
});

test('bounded repeated transport simulation preserves full display across live updates, navigation, sleep and reconnect',async()=>{
 for(const incrementalKeys of [false,true]){
  const deck=new FakeDeck(),stats={page:0,key:0};let screen=null,mode='blank',clock=10000;
  deck.setWideMode=value=>{mode=value;};
  deck.pushPage=bytes=>{stats.page++;screen=JSON.parse(bytes.toString());};
  deck.pushKey=bytes=>{
   stats.key++;
   const {slot,value}=JSON.parse(bytes.toString()),[col,row]=slot.split('_').map(Number);
   assert.ok(screen&&mode==='blank'&&row*5+col<13);
   screen[row*5+col]=value;
  };
  const t=new D200XTransport({deck,incrementalKeys,now:()=>clock,
   buildPage:async images=>Buffer.from(JSON.stringify(images.map(x=>x.png.toString()))),
   buildKeyUpdate:async(slot,png)=>Buffer.from(JSON.stringify({slot,value:png.toString()}))});
  let expected=completeImages();
  const verify=()=>assert.deepEqual(screen,expected.map(x=>x.png.toString()));
  try{
   await t.start();t.schedule(expected);await idle();verify();
   for(let n=1;n<=120;n++){
    const slot=n%13;
    expected=expected.map(x=>x.index===slot?{index:slot,png:Buffer.from('live-'+n)}:x);
    if(n%20===0){
     t.sleepDisplay();const writes=stats.page+stats.key;
     t.schedule(expected,'blank',true);await idle();assert.equal(stats.page+stats.key,writes);
     t.wakeDisplay();await idle();verify();
    }else if(n%15===0){
     deck.disconnect();screen=null;t.schedule(expected,'blank',true);
     await t.connect();await idle();verify();
    }else if(n%10===0){
     const previous=expected;
     expected=completeImages({0:'page-'+n,13:'wide-'+n});
     t.schedule(previous,'blank');t.schedule(expected,'blank');await idle();verify();
    }else{
     t.schedule(expected,'blank',true);await idle();verify();
    }
    clock+=KEEPALIVE_MS;t.tick();verify();
   }
   assert.ok(stats.page>0);assert.equal(stats.key>0,incrementalKeys);
   assert.equal(t.pending,null);assert.equal(t.inFlight,false);
   console.log('USB_REPEAT_SIM '+JSON.stringify({incrementalKeys,rounds:120,...stats}));
  }finally{t.stop();}
 }
});

test('initial native PAGE collection keeps original deadline, merges dirty slots, and ignores old scopes',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const first=src.indexOf('  function observePageEntry(){'),last=src.indexOf('  window.scheduleDeckSync=schedule;',first);
 assert.ok(first>=0&&last>first);
 let now=1000,scope='A',ready=false,count=3,next=0;const timers=new Map(),sent=[];
 const ctx={window:{D200XInitialNativeImagesReady:()=>({count,ready})},pageStamp:()=>scope,
  pageEntry:null,pageGeneration:0,pageSession:'session',displayedPageToken:null,PAGE_ENTRY_MAX_MS:500,
  Date:{now:()=>now},dirtyNativeSlots:new Map(),renderSerial:0,slotRevision:0,fullPending:false,renderRetryCount:0,
  pressedKeys:new Map(),releaseTimers:new Map(),rendering:false,timeout:null,
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id),
  synchronize:nativeOnly=>{sent.push({nativeOnly,slots:[...ctx.dirtyNativeSlots.keys()],token:ctx.pageEntry.token,at:now});ctx.dirtyNativeSlots.clear();}};
 vm.runInNewContext(src.slice(first,last)+';window.schedule=schedule;window.slots=requestSlots;',ctx);
 const tick=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now&&timers.delete(id))t.fn();};
 const w=ctx.window;
 w.schedule();const a=w.D200XPageEntryToken();tick(40);w.slots([1]);tick(80);w.slots([2]);tick(100);
 assert.equal(sent.length,0);assert.equal([...timers.values()][0].at,1500);
 ready=true;w.slots([3]);tick(0);assert.deepEqual(sent,[{nativeOnly:false,slots:[1,2,3],token:a,at:1220}]);
 w.slots([2]);tick(0);assert.equal(sent.at(-1).nativeOnly,true);
 scope='B';ready=false;w.schedule();const b=w.D200XPageEntryToken();w.slots([5]);tick(200);
 scope='A';w.schedule();const a2=w.D200XPageEntryToken();assert.notEqual(a2,a);assert.notEqual(a2,b);
 w.slots([7]);tick(499);assert.equal(sent.length,2);
 tick(1);assert.deepEqual(sent.at(-1),{nativeOnly:false,slots:[7],token:a2,at:1920});
 count=0;ready=true;scope='C';w.schedule();tick(249);assert.equal(sent.length,3);tick(1);assert.equal(sent.length,4);
});

test('page transport receipt belongs to the actual latest completed transfer, including reconnect',async()=>{
 const deck=new FakeDeck(),receipts=[];let release;const gate=new Promise(r=>release=r);let builds=0;
 const t=new D200XTransport({deck,buildPage:async images=>{if(++builds===1)await gate;return Buffer.from(images[0].png);}});
 t.on('synced',x=>receipts.push(x.pageToken));
 try{
  await t.start();t.schedule(completeImages({0:'old'}),'blank',false,'session-1');
  t.schedule(completeImages({0:'new'}),'blank',false,'session-2');
  release();await idle();await idle();
  assert.deepEqual(receipts,['session-2']);assert.deepEqual(pageWrites(deck),[['page','new']]);
  deck.disconnect();await t.connect();await idle();assert.deepEqual(receipts,['session-2','session-2']);
 }finally{t.stop();}
});

test('ordinary physical input is discarded until matching page transfer and blocked releases are not replayed',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/device-sync.js'),'utf8');
 const first=src.indexOf('    const keyIndex=Number(event?.index);'),last=src.indexOf('    // Wide key (13/14)',first);
 assert.ok(first>=0&&last>first);
 const context={pageEntry:{token:'A'},displayedPageToken:'old',physicalDownTokens:new Map(),text:()=>{}};
 const accept=vm.runInNewContext('(event)=>{'+src.slice(first,last)+';return true;}',context);
 const press=(index,pressed)=>accept({kind:1,index,pressed});
 assert.equal(press(1,true),undefined);
 context.displayedPageToken='A';assert.equal(press(1,false),undefined);
 assert.equal(press(1,true),true);assert.equal(press(1,false),true);
 assert.equal(press(2,true),true);context.pageEntry={token:'B'};context.displayedPageToken='B';
 assert.equal(press(2,false),undefined);assert.equal(press(13,true),true);
});
