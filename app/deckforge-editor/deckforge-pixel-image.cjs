'use strict';
// Main-process boundary: accept only exact, bounded RGBA data, then generate
// canonical PNG locally. Never trust renderer-supplied compressed drawing data.
const {crc32,deflateSync}=require('node:zlib');
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
function pixelImage(op){
  if(!op||Object.keys(op).length!==4||!['op','width','height','rgba'].every(k=>Object.hasOwn(op,k))||op.op!=='pixels'||
    ![op.width,op.height].every(v=>Number.isInteger(v)&&v>=1&&v<=144)||typeof op.rgba!=='string'||
    op.rgba.length!==4*Math.ceil(op.width*op.height*4/3)||! /^[A-Za-z0-9+/]+={0,2}$/.test(op.rgba))throw Error('invalid key pixels');
  const {width,height}=op,rgba=Buffer.from(op.rgba,'base64');
  if(rgba.length!==width*height*4||rgba.toString('base64')!==op.rgba)throw Error('invalid key pixel encoding');
  const chunk=(type,data)=>{
    const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);
    const tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data])));
    return Buffer.concat([head,data,tail]);
  };
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width,0);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=6;
  const stride=width*4,raw=Buffer.alloc((stride+1)*height);
  for(let row=0;row<height;row++)rgba.copy(raw,row*(stride+1)+1,row*stride,(row+1)*stride);
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  if(!verifyPng(png).ok)throw Error('key pixel PNG integrity failure');
  return {op:'image',value:'data:image/png;base64,'+png.toString('base64')};
}
module.exports={pixelImage};
