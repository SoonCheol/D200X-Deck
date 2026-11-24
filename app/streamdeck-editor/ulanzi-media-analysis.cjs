'use strict';
// Read-only media inventory. No decoding, rendering or release permission.
// GIF LZW is checked by bounded dictionary lengths and palette references;
// no raster is rendered and SVG markup is not loaded.
const MAX=256*1024,MAX_FRAMES=240,MAX_PIXELS=144*144*MAX_FRAMES;
// Validate the exact number of decoded palette indices without allocating
// frame pixels. Every dictionary entry inherits already-validated symbols.
function verifyLzw(data,min,paletteSize,pixelCount){
  const clear=1<<min,end=clear+1,lengths=new Uint16Array(4096);
  const first=new Uint16Array(4096);
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
      return;
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
    if(!length||(total+=length)>pixelCount)throw Error('LZW pixel budget');
    if(previous!==-1&&next<4096){
      lengths[next]=(previous<clear?1:lengths[previous])+1;
      first[next]=previous<clear?previous:first[previous];
      if(++next===(1<<size)&&size<12)size++;
    }
    previous=code;
  }
  throw Error('missing LZW end code');
}
function gifReport(bytes){
  try{
    if(!Buffer.isBuffer(bytes)||bytes.length<14||bytes.length>MAX||!/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))throw Error('invalid header');
    const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8),flags=bytes[10];
    if(!width||!height||width>144||height>144)throw Error('canvas dimensions');
    let pos=13,frames=0,pixels=0,delayMs=0,pending=null,loopCount=null;
    const need=n=>{if(pos+n>bytes.length)throw Error('truncated block');};
    const take=()=>{need(1);return bytes[pos++];};
    const skip=n=>{need(n);pos+=n;};
    const palette=f=>{const colors=f&128?2**((f&7)+1):0;if(colors)skip(3*colors);return colors;};
    const subblocks=(collect=false)=>{const chunks=[];let size=0,n;while((n=take())!==0){need(n);if(collect)chunks.push(bytes.subarray(pos,pos+n));skip(n);size+=n;}return collect?Buffer.concat(chunks,size):size;};
    const globalColors=palette(flags);
    for(let blocks=0;blocks<bytes.length;blocks++){
      const tag=take();
      if(tag===0x3b){
        if(pos!==bytes.length||!frames||pending!==null)throw Error('invalid trailer');
        return {format:'gif',status:'bounded-animation-review',width,height,frames,delayMs,loopCount,verification:'bounded-lzw-indices',requiresReview:true};
      }
      if(tag===0x21){
        const label=take();
        if(label===0xf9){
          if(pending!==null||take()!==4)throw Error('invalid graphic control');
          const packed=take();need(3);const delay=bytes.readUInt16LE(pos)*10;skip(3);
          if((packed&0xe0)||((packed>>2)&7)>3||take()!==0)throw Error('unsupported graphic control');
          pending=delay;
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
      const colors=palette(f)||globalColors;
      const code=take();if(code<2||code>8)throw Error('invalid LZW minimum code size');
      verifyLzw(subblocks(true),code,colors,w*h);
      delayMs+=pending??0;pending=null;
    }
    throw Error('missing trailer');
  }catch(error){return {format:'gif',status:'manual-resource-review',reason:error.message,requiresReview:true};}
}
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
module.exports={gifReport,svgReport};
