'use strict';
// Slow, opt-in GIF playback through existing static image events.
// No HID ownership, raw GIF transport, timers inside plugin scripts, or replay
// of missed frames. A single sweep batches active context changes.
const {gifReport,gifPngFrames}=require('./ulanzi-media-analysis.cjs');
const {animationTimeline}=require('./deckforge-animation-clock.cjs');
const PREFIX='data:image/gif;base64,',INTERVAL=500,MAX_ACTIVE=4,MAX_BYTES=8*1024*1024;
function prepareGif(uri){
  if(typeof uri!=='string'||!uri.startsWith(PREFIX)||uri.length>350000)throw Error('invalid GIF animation');
  const encoded=uri.slice(PREFIX.length);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('invalid GIF encoding');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)throw Error('invalid GIF encoding');
  const report=gifReport(bytes);
  if(report.status!=='bounded-animation-review'||report.frames>32||report.width*report.height*report.frames>1024*1024)
    throw Error('unsupported GIF or playback budget');
  const decoded=gifPngFrames(bytes);
  // Intentional slow-playback contract for full-page image transport.
  const timeline=animationTimeline({...decoded,frames:decoded.frames.map(f=>({...f,delayMs:Math.max(INTERVAL,f.delayMs)}))});
  return {timeline,uri};
}
class NativeAnimationPlayer{
  constructor(send,now=()=>require('node:perf_hooks').performance.now()){
    this.send=send;this.now=now;this.entries=new Map();this.timer=null;
  }
  reconcile(){
    if(this.entries.size&&!this.timer){this.timer=setInterval(()=>this.tick(),INTERVAL);this.timer.unref?.();}
    else if(!this.entries.size&&this.timer){clearInterval(this.timer);this.timer=null;}
  }
  prepare(ctx,uri){
    const previous=this.entries.get(ctx);
    if(previous?.uri===uri&&previous.active())return {uri,timeline:previous.timeline};
    return prepareGif(uri);
  }
  start(ctx,prepared,active){
    if(!active())return false;
    const previous=this.entries.get(ctx);
    if(previous?.uri===prepared.uri&&previous.active())return true;
    const total=[...this.entries].reduce((sum,[owner,e])=>sum+(owner===ctx?0:e.timeline.bytes),prepared.timeline.bytes);
    if((!previous&&this.entries.size>=MAX_ACTIVE)||total>MAX_BYTES||!active())return false;
    const entry={...prepared,active,start:this.now(),last:null};
    this.entries.set(ctx,entry);
    try{this.emitFrame(ctx,entry,this.now());}
    catch(error){this.entries.delete(ctx);throw error;}
    finally{this.reconcile();}
    return true;
  }
  emitFrame(ctx,entry,time){
    if(!entry.active()){this.entries.delete(ctx);return;}
    const frame=entry.timeline.at(Math.max(0,time-entry.start));
    if(frame.index!==entry.last){
      entry.last=frame.index;
      this.send(ctx,'data:image/png;base64,'+frame.png.toString('base64'));
    }
    if(frame.done)this.entries.delete(ctx);
  }
  tick(){
    const time=this.now();
    for(const [ctx,entry] of this.entries){
      try{this.emitFrame(ctx,entry,time);}catch{this.entries.delete(ctx);}
    }
    this.reconcile();
  }
  stop(ctx){this.entries.delete(ctx);this.reconcile();}
  close(){this.entries.clear();this.reconcile();}
}
module.exports={prepareGif,NativeAnimationPlayer,INTERVAL};
