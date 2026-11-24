'use strict';
// Bounded declarative 392x196 wide canvas. No URLs, DOM, CSS or executable code.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
function check(ok){if(!ok)throw Error('DeckForge SDK: invalid wide overlay');}
function bounds(e){return int(e.x,0,391)&&int(e.y,0,195)&&int(e.w,1,392-e.x)&&int(e.h,1,196-e.y);}
function validateWideOverlay(op){
  check(exact(op,['op','value','durationMs'])&&op.op==='wideOverlay');
  if(op.value===null){check(op.durationMs===0);return op;}
  check(int(op.durationMs,1000,30000));
  const v=op.value;
  if(v?.kind==='png'){
    check(exact(v,['kind','data'])&&typeof v.data==='string'&&v.data.length<=350000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.data));
    const b=Buffer.from(v.data.slice(22),'base64');
    check(b.length>=33&&b.length<=256*1024&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&
      b.readUInt32BE(8)===13&&b.toString('ascii',12,16)==='IHDR'&&b.readUInt32BE(16)===392&&b.readUInt32BE(20)===196);
  }else{
    check(exact(v,['kind','background','elements'])&&v.kind==='layout'&&color(v.background)&&Array.isArray(v.elements)&&v.elements.length<=8);
    for(const e of v.elements){
      check(object(e)&&bounds(e));
      if(e.type==='text'){
        check(exact(e,['type','x','y','w','h','text','size','color','align'])&&typeof e.text==='string'&&e.text.length<=120&&
          int(e.size,8,72)&&color(e.color)&&['left','center','right'].includes(e.align));
      }else if(e.type==='rect'){
        check(exact(e,['type','x','y','w','h','color'])&&color(e.color));
      }else if(e.type==='bar'){
        check(exact(e,['type','x','y','w','h','color','track','value'])&&color(e.color)&&color(e.track)&&
          typeof e.value==='number'&&Number.isFinite(e.value)&&e.value>=0&&e.value<=1);
      }else check(false);
    }
  }
  return op;
}
module.exports={validateWideOverlay};
