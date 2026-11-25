'use strict';
// Read-only media inventory and bounded offline GIF decoding. No hardware
// writes or release permission. SVG markup is not loaded here.
const MAX=256*1024,MAX_FRAMES=240,MAX_PIXELS=144*144*MAX_FRAMES;
// Validate the exact number of decoded palette indices without allocating
// frame pixels. Every dictionary entry inherits already-validated symbols.
function verifyLzw(data,min,paletteSize,pixelCount,decode=false){
  const clear=1<<min,end=clear+1,lengths=new Uint16Array(4096);
  const first=new Uint16Array(4096);
  const prefixes=decode?new Uint16Array(4096):null,suffixes=decode?new Uint8Array(4096):null;
  const indices=decode?Buffer.alloc(pixelCount):null,stack=decode?new Uint8Array(4096):null;
  const emit=(code,at)=>{
    let count=0;
    while(code>=clear){
      if(code<=end||count>=stack.length)throw Error('invalid LZW expansion');
      stack[count++]=suffixes[code];code=prefixes[code];
    }
    if(count>=stack.length)throw Error('LZW expansion limit');
    stack[count++]=code;
    while(count)indices[at++]=stack[--count];
    return at;
  };
  let bit=0,size=min+1,next=end+1,previous=-1,total=0,started=false;
  const read=()=>{
    if(bit+size>data.length*8)throw Error('truncated LZW code');
    let code=0;for(let i=0;i<size;i++,bit++)code|=((data[bit>>3]>>(bit&7))&1)<<i;
    return code;
  };
  while(bit+size<=data.length*8){
    const code=read();
    if(code===clear){size=min+1;next=end+1;previous=-1;started=true;continue;}
    if(!started)throw Error('missing initial LZW clear');
    if(code===end){
      if(total!==pixelCount||data.length*8-bit>=8)throw Error('LZW pixel count or trailing data');
      return indices;
    }
    let length,head;
    if(code<clear){
      if(code>=paletteSize)throw Error('palette index out of range');
      length=1;head=code;
    }else if(code<next&&code>end){length=lengths[code];head=first[code];}
    else if(code===next&&previous!==-1&&next<4096){
      length=(previous<clear?1:lengths[previous])+1;
      head=previous<clear?previous:first[previous];
    }else throw Error('invalid LZW dictionary reference');
    const offset=total;
    if(!length||(total+=length)>pixelCount)throw Error('LZW pixel budget');
    if(decode){
      let written;
      if(code===next){written=emit(previous,offset);indices[written++]=head;}
      else written=emit(code,offset);
      if(written!==total)throw Error('LZW expansion length');
    }
    if(previous!==-1&&next<4096){
      lengths[next]=(previous<clear?1:lengths[previous])+1;
      first[next]=previous<clear?previous:first[previous];
      if(decode){prefixes[next]=previous;suffixes[next]=head;}
      if(++next===(1<<size)&&size<12)size++;
    }
    previous=code;
  }
  throw Error('missing LZW end code');
}
function inspectGif(bytes,decode=false,composite=false){
  try{
    if(!Buffer.isBuffer(bytes)||bytes.length<14||bytes.length>MAX||!/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))throw Error('invalid header');
    const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8),flags=bytes[10];
    if(!width||!height||width>144||height>144)throw Error('canvas dimensions');
    let pos=13,frames=0,pixels=0,delayMs=0,pending=null,loopCount=null;
    const need=n=>{if(pos+n>bytes.length)throw Error('truncated block');};
    const take=()=>{need(1);return bytes[pos++];};
    const skip=n=>{need(n);pos+=n;};
    const decodedFrames=[];
    const palette=f=>{const colors=f&128?2**((f&7)+1):0;if(!colors)return null;need(3*colors);const data=bytes.subarray(pos,pos+3*colors);skip(3*colors);return {colors,data};};
    const subblocks=(collect=false)=>{const chunks=[];let size=0,n;while((n=take())!==0){need(n);if(collect)chunks.push(bytes.subarray(pos,pos+n));skip(n);size+=n;}return collect?Buffer.concat(chunks,size):size;};
    const globalPalette=palette(flags),backgroundIndex=bytes[11];
    if(globalPalette&&backgroundIndex>=globalPalette.colors)throw Error('invalid background index');
    let canvas=null;
    const background=transparent=>{
      if(transparent||!globalPalette)return Buffer.alloc(4);
      const offset=backgroundIndex*3;
      return Buffer.from([...globalPalette.data.subarray(offset,offset+3),255]);
    };
    const clearRect=(buffer,x,y,w,h,color)=>{
      for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)color.copy(buffer,(row*width+col)*4);
    };
    for(let blocks=0;blocks<bytes.length;blocks++){
      const tag=take();
      if(tag===0x3b){
        if(pos!==bytes.length||!frames||pending!==null)throw Error('invalid trailer');
        return {format:'gif',status:'bounded-animation-review',width,height,frames,delayMs,loopCount,verification:'bounded-lzw-indices',requiresReview:true,...(decode?{decodedFrames}:{})};
      }
      if(tag===0x21){
        const label=take();
        if(label===0xf9){
          if(pending!==null||take()!==4)throw Error('invalid graphic control');
          const packed=take();need(3);const delay=bytes.readUInt16LE(pos)*10,index=bytes[pos+2];skip(3);
          if((packed&0xe0)||((packed>>2)&7)>3||take()!==0)throw Error('unsupported graphic control');
          if(composite&&(packed&2))throw Error('interactive GIF requires manual review');
          pending={delay,transparent:Boolean(packed&1),index,disposal:(packed>>2)&7};
        }else if(label===0xff){
          if(take()!==11)throw Error('invalid application extension');
          need(11);const name=bytes.toString('ascii',pos,pos+11);skip(11);
          if(name!=='NETSCAPE2.0'&&name!=='ANIMEXTS1.0')throw Error('unsupported application extension');
          if(loopCount!==null||take()!==3||take()!==1)throw Error('invalid loop extension');
          need(2);loopCount=bytes.readUInt16LE(pos);skip(2);if(take()!==0)throw Error('invalid loop terminator');
        }else if(label===0xfe)subblocks();
        else throw Error('unsupported extension');
        continue;
      }
      if(tag!==0x2c)throw Error('unknown block');
      need(9);
      const x=bytes.readUInt16LE(pos),y=bytes.readUInt16LE(pos+2),w=bytes.readUInt16LE(pos+4),h=bytes.readUInt16LE(pos+6),f=bytes[pos+8];skip(9);
      if(!w||!h||x+w>width||y+h>height||(!((flags|f)&128))||(f&0x18))throw Error('invalid image descriptor');
      if(++frames>MAX_FRAMES||(pixels+=w*h)>MAX_PIXELS)throw Error('frame budget');
      const colors=palette(f)||globalPalette;
      const code=take();if(code<2||code>8)throw Error('invalid LZW minimum code size');
      if(pending?.transparent&&pending.index>=colors.colors)throw Error('invalid transparent palette index');
      if(decode&&!composite&&(x||y||w!==width||h!==height||pending?.transparent))throw Error('partial or transparent frame requires compositing');
      const indices=verifyLzw(subblocks(true),code,colors.colors,w*h,decode);
      if(decode){
        // GIF89a §23: leave transparent pixels untouched, retain, restore
        // background, or restore previous. For transparent artwork use an
        // alpha-zero background so the button background remains visible.
        if(!canvas){canvas=Buffer.alloc(width*height*4);clearRect(canvas,0,0,width,height,background(pending?.transparent));}
        const previous=pending?.disposal===3?Buffer.from(canvas):null;
        const rows=[];
        if(f&0x40){for(const [start,step] of [[0,8],[4,8],[2,4],[1,2]])for(let row=start;row<h;row+=step)rows.push(row);}
        else for(let row=0;row<h;row++)rows.push(row);
        for(let i=0;i<indices.length;i++){
          const index=indices[i];
          if(pending?.transparent&&index===pending.index)continue;
          const src=index*3,dst=((y+rows[Math.floor(i/w)])*width+x+i%w)*4;
          canvas[dst]=colors.data[src];canvas[dst+1]=colors.data[src+1];canvas[dst+2]=colors.data[src+2];canvas[dst+3]=255;
        }
        decodedFrames.push({delayMs:pending?.delay??0,rgba:Buffer.from(canvas)});
        if(pending?.disposal===2)clearRect(canvas,x,y,w,h,background(pending.transparent));
        else if(previous)canvas=previous;
      }
      delayMs+=pending?.delay??0;pending=null;
    }
    throw Error('missing trailer');
  }catch(error){return {format:'gif',status:'manual-resource-review',reason:error.message,requiresReview:true};}
}
function gifReport(bytes){return inspectGif(bytes);}
function decodeOpaqueGif(bytes){
  const result=inspectGif(bytes,true);
  if(!result.decodedFrames)throw Error(result.reason||'GIF decoding failed');
  return result;
}
function decodeCompositeGif(bytes){
  const result=inspectGif(bytes,true,true);
  if(!result.decodedFrames)throw Error(result.reason||'GIF decoding failed');
  return result;
}
// Encode composited frames through the bounded PNG format used by the
// existing hardware compositor. No frame is discarded or installed.
function gifPngFrames(bytes,composite=true){
  const {crc32,deflateSync}=require('node:zlib');
  const {verifyPng}=require('./ulanzi-png-verifier.cjs');
  const result=composite?decodeCompositeGif(bytes):decodeOpaqueGif(bytes),{width,height}=result;
  const chunk=(type,data)=>{
    const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);
    const tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data])));
    return Buffer.concat([head,data,tail]);
  };
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width,0);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=6;
  let budget=0;
  const frames=result.decodedFrames.map(frame=>{
    const stride=width*4,raw=Buffer.alloc((stride+1)*height);
    for(let row=0;row<height;row++)frame.rgba.copy(raw,row*(stride+1)+1,row*stride,(row+1)*stride);
    const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
    if(!verifyPng(png).ok||(budget+=png.length)>8*1024*1024)throw Error('decoded GIF PNG frame budget');
    return {delayMs:frame.delayMs,png};
  });
  return {width,height,loopCount:result.loopCount,frames};
}
function opaqueGifPngFrames(bytes){return gifPngFrames(bytes,false);}
// Very small XML-like subset. No entity expansion, CSS, URL, namespace
// aliases, scripts, animation, filters, external references or text markup.
// This is a classification only; actual rasterization must validate pixels.
function svgReport(bytes){
  try{
    if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX)throw Error('size limit');
    const src=new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();
    if(/[&\x00-\x08\x0b\x0c\x0e-\x1f]/.test(src)||/<!|<\?/.test(src))throw Error('unsupported XML syntax');
    const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon']);
    const attrs=new Set(['xmlns','width','height','viewBox','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','opacity','fill-opacity','stroke-opacity','transform']);
    const color=/^(?:none|transparent|#[0-9a-fA-F]{3,8}|[A-Za-z]{1,24})$/;
    const numeric=/^[0-9eE.,+\-\s]+$/;
    const transform=/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9eE.,+\-\s]+\)\s*)+$/;
    const stack=[];let pos=0,nodes=0,width=null,height=null,viewBox=null;
    while(pos<src.length){
      while(/\s/.test(src[pos]||'')&&pos<src.length)pos++;
      if(pos===src.length)break;
      const match=/^<(\/?)([A-Za-z]+)([^<>]*?)\s*(\/?)>/.exec(src.slice(pos));
      if(!match)throw Error('unsupported tag syntax');
      const [,closing,tag,body,self]=match;pos+=match[0].length;
      if(!tags.has(tag))throw Error('unsupported element');
      if(closing){
        if(body.trim()||self||stack.pop()!==tag)throw Error('mismatched close');
        continue;
      }
      if(++nodes>2048||stack.length>32||(!stack.length&&(nodes!==1||tag!=='svg'))||(stack.length&&tag==='svg'))throw Error('element budget or root');
      const values=Object.create(null);let rest=body;
      while(rest.trim()){
        const a=/^\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
        if(!a||!attrs.has(a[1])||Object.hasOwn(values,a[1]))throw Error('unsupported attribute');
        const name=a[1],value=a[2]??a[3];rest=rest.slice(a[0].length);
        if(!value||value.length>16384)throw Error('attribute limit');
        if(name==='xmlns'){if(tag!=='svg'||value!=='http://www.w3.org/2000/svg')throw Error('namespace');}
        else if(name==='fill'||name==='stroke'){if(!color.test(value))throw Error('paint');}
        else if(name==='d'){if(!/^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]+$/.test(value))throw Error('path syntax');}
        else if(name==='transform'){if(!transform.test(value))throw Error('transform syntax');}
        else if(['stroke-linecap','stroke-linejoin','fill-rule'].includes(name)){if(!/^(?:butt|round|square|miter|bevel|nonzero|evenodd)$/.test(value))throw Error('style');}
        else if(!numeric.test(value))throw Error('numeric attribute');
        if(!['xmlns','fill','stroke','stroke-linecap','stroke-linejoin','fill-rule'].includes(name)){
          const numbers=value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)||[];
          if(numbers.length>4096||numbers.some(x=>!Number.isFinite(Number(x))||Math.abs(Number(x))>1e6))throw Error('numeric budget');
        }
        values[name]=value;
      }
      if(nodes===1){
        if(values.xmlns!=='http://www.w3.org/2000/svg')throw Error('missing namespace');
        width=Number(values.width);height=Number(values.height);
        if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>144||height>144)throw Error('canvas dimensions');
        if(values.viewBox){viewBox=values.viewBox.trim().split(/[\s,]+/).map(Number);if(viewBox.length!==4||viewBox.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)||viewBox[2]<=0||viewBox[3]<=0)throw Error('viewBox');}
      }
      if(!self)stack.push(tag);
    }
    if(stack.length||!nodes)throw Error('unclosed document');
    return {format:'svg',status:'restricted-vector-review',width,height,nodes,viewBox,verification:'syntax-subset-only',requiresReview:true};
  }catch(error){return {format:'svg',status:'manual-resource-review',reason:error.message,requiresReview:true};}
}
module.exports={gifReport,svgReport,decodeOpaqueGif,opaqueGifPngFrames,decodeCompositeGif,gifPngFrames};
