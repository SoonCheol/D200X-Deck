'use strict';
// Narrow conversion-only PNG verifier. Reject unsupported encodings rather
// than altering artwork. No renderer, filesystem or external decoder access.
const {crc32,inflateSync}=require('node:zlib');
const SIGNATURE=Buffer.from('89504e470d0a1a0a','hex');
const DEPTHS={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
const CHANNELS={0:1,2:3,3:1,4:2,6:4};
const ANCILLARY={gAMA:4,cHRM:32,sRGB:1,pHYs:9,tIME:7};
function verifyPng(bytes,{wide=false}={}){
  const reject=reason=>({ok:false,reason});
  if(!Buffer.isBuffer(bytes)||bytes.length<45||bytes.length>256*1024||!bytes.subarray(0,8).equals(SIGNATURE))return reject('invalid PNG size or signature');
  let pos=8,header=null,palette=0,hasData=false,dataClosed=false,ended=false;
  const chunks=[],seen=new Set();
  while(pos<bytes.length){
    if(bytes.length-pos<12)return reject('truncated PNG chunk');
    const length=bytes.readUInt32BE(pos),start=pos+8,end=start+length;
    if(end+4>bytes.length)return reject('truncated PNG chunk');
    const type=bytes.toString('ascii',pos+4,start),data=bytes.subarray(start,end);
    if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(pos+4,end))!==bytes.readUInt32BE(end))return reject('invalid PNG chunk or CRC');
    pos=end+4;
    if(!header&&type!=='IHDR')return reject('IHDR must be first');
    if(hasData&&type!=='IDAT')dataClosed=true;
    if(type==='IDAT'){
      if(dataClosed||!header||(header.color===3&&!palette))return reject('invalid IDAT order');
      hasData=true;chunks.push(data);continue;
    }
    if(seen.has(type))return reject('duplicate PNG chunk');
    seen.add(type);
    if(type==='IHDR'){
      if(length!==13)return reject('invalid IHDR length');
      const width=data.readUInt32BE(0),height=data.readUInt32BE(4),depth=data[8],color=data[9];
      if((wide?(width!==392||height!==196):(width<1||width>144||height<1||height>144))||!DEPTHS[color]?.includes(depth)||data[10]!==0||data[11]!==0||data[12]!==0)return reject('unsupported PNG dimensions or encoding');
      header={width,height,depth,color};continue;
    }
    if(type==='PLTE'){
      if(hasData||[0,4].includes(header.color)||length===0||length>768||length%3!==0)return reject('invalid palette');
      palette=length/3;
      if(header.color===3&&palette>2**header.depth)return reject('invalid palette size');
      continue;
    }
    if(type==='tRNS'){
      if(hasData||!((header.color===0&&length===2)||(header.color===2&&length===6)||(header.color===3&&palette&&length>=1&&length<=palette)))return reject('invalid transparency');
      continue;
    }
    if(type==='IEND'){
      if(length!==0||!hasData||pos!==bytes.length)return reject('invalid IEND or trailing bytes');
      ended=true;break;
    }
    if(!Object.hasOwn(ANCILLARY,type)||length!==ANCILLARY[type])return reject('unsupported PNG ancillary or critical chunk');
    if(['gAMA','cHRM','sRGB'].includes(type)&&(hasData||palette))return reject('invalid color metadata order');
    if(type==='pHYs'&&hasData)return reject('invalid physical metadata order');
  }
  if(!ended)return reject('missing IEND');
  const row=Math.ceil(header.width*CHANNELS[header.color]*header.depth/8)+1,expected=row*header.height;
  try{
    const compressed=Buffer.concat(chunks);
    const result=inflateSync(compressed,{maxOutputLength:expected,info:true});
    if(result.buffer.length!==expected||result.engine.bytesWritten!==compressed.length)return reject('invalid PNG scanline data length');
    for(let offset=0;offset<expected;offset+=row)if(result.buffer[offset]>4)return reject('invalid PNG row filter');
  }catch{return reject('invalid or oversized PNG compressed data');}
  return {ok:true,width:header.width,height:header.height,verification:'crc-and-bounded-scanlines'};
}
module.exports={verifyPng};
