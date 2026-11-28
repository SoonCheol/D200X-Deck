'use strict';
// Deterministic animation timebase, independent of renderer and HID writes.
// Never replay missed frames. A late writer cannot commit across page epochs.
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
const MIN_DELAY=100,MAX_FRAME_BYTES=8*1024*1024,MAX_TOTAL_BYTES=16*1024*1024,MAX_ACTIVE=4;
function animationTimeline(animation,minDelay=MIN_DELAY){
  if(!Number.isInteger(minDelay)||minDelay<10||minDelay>655350)throw Error('invalid animation minimum delay');
  if(!animation||!Array.isArray(animation.frames)||!animation.frames.length||animation.frames.length>240||
     !(animation.loopCount===null||Number.isInteger(animation.loopCount)&&animation.loopCount>=0&&animation.loopCount<=65535))throw Error('invalid animation');
  let duration=0,bytes=0;
  const frames=animation.frames.map(frame=>{
    if(!Buffer.isBuffer(frame?.png)||!Number.isInteger(frame.delayMs)||frame.delayMs<0||frame.delayMs>655350||
      !verifyPng(frame.png).ok||(bytes+=frame.png.length)>MAX_FRAME_BYTES)throw Error('invalid animation frame');
    duration+=Math.max(minDelay,frame.delayMs);
    return {end:duration,png:Buffer.from(frame.png)};
  });
  const plays=animation.loopCount===0?Infinity:animation.loopCount===null?1:animation.loopCount+1;
  return {bytes,at(elapsed){
    if(!Number.isFinite(elapsed)||elapsed<0)throw Error('invalid elapsed time');
    if(elapsed>=duration*plays)return {index:frames.length-1,png:frames.at(-1).png,done:true};
    const offset=elapsed%duration,index=frames.findIndex(frame=>offset<frame.end);
    return {index,png:frames[index].png,done:false};
  }};
}
class AnimationClock{
  constructor(now=()=>require('node:perf_hooks').performance.now()){
    this.now=now;this.epoch=0;this.active=new Map();this.cursor=0;this.outstanding=null;this.paused=false;
  }
  // A new page or changed action invalidates every outstanding frame.
  replace(entries){
    if(!Array.isArray(entries)||entries.length>MAX_ACTIVE)throw Error('animation slot limit');
    const next=new Map();let bytes=0;
    for(const {slot,animation} of entries){
      if(!Number.isInteger(slot)||slot<0||slot>=13||next.has(slot))throw Error('invalid animation slot');
      const timeline=animationTimeline(animation);
      if((bytes+=timeline.bytes)>MAX_TOTAL_BYTES)throw Error('animation memory budget');
      next.set(slot,{timeline,start:this.now(),last:null});
    }
    this.epoch++;this.active=next;this.cursor=0;this.paused=false;
  }
  pause(){this.epoch++;this.paused=true;}
  resume(){this.epoch++;this.paused=false;for(const entry of this.active.values()){entry.start=this.now();entry.last=null;}}
  clear(){this.epoch++;this.active.clear();this.paused=true;}
  // Called by a single transport owner. Only one frame may be outstanding.
  // All returned data are copied; obsolete work is dropped, not replayed.
  next(){
    if(this.paused||this.outstanding||!this.active.size)return null;
    const slots=[...this.active.keys()],time=this.now();
    for(let i=0;i<slots.length;i++){
      const index=(this.cursor+i)%slots.length,slot=slots[index],entry=this.active.get(slot);
      const frame=entry.timeline.at(Math.max(0,time-entry.start));
      if(entry.last===frame.index)continue;
      this.cursor=(index+1)%slots.length;
      const ticket=Object.freeze({epoch:this.epoch,slot,index:frame.index,png:Buffer.from(frame.png)});
      this.outstanding=ticket;return ticket;
    }
    return null;
  }
  isCurrent(ticket){return ticket===this.outstanding&&!this.paused&&ticket.epoch===this.epoch&&this.active.has(ticket.slot);}
  settle(ticket,sent){
    if(ticket!==this.outstanding)return false;
    const current=this.isCurrent(ticket);this.outstanding=null;
    if(current&&sent)this.active.get(ticket.slot).last=ticket.index;
    return current;
  }
}
module.exports={animationTimeline,AnimationClock,MIN_DELAY,MAX_ACTIVE};
