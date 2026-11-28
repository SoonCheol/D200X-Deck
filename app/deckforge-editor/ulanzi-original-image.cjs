'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
const {svgReport,gifReport}=require('./ulanzi-media-analysis.cjs');
const MAX=256*1024;
// Validate dimensions before passing bounded JPEG/WebP to the existing
// Chromium bitmap decoder. Animated WebP is not treated as a static frame.
function rasterDimensions(bytes){
  if(bytes.length<12)return null;
  const fit=(mime,width,height)=>width>0&&height>0&&width<=1024&&height<=1024?{mime,width,height}:null;
  if(bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let pos=2;
    while(pos+4<=bytes.length){
      if(bytes[pos++]!==255)return null;
      while(bytes[pos]===255)pos++;
      const marker=bytes[pos++];
      if(marker===0xda||marker===0xd9||pos+2>bytes.length)return null;
      const size=bytes.readUInt16BE(pos);
      if(size<2||pos+size>bytes.length)return null;
      if([0xc0,0xc1,0xc2].includes(marker)){
        if(size<8||bytes[pos+2]!==8)return null;
        return fit('jpeg',bytes.readUInt16BE(pos+5),bytes.readUInt16BE(pos+3));
      }
      pos+=size;
    }
  }
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)===bytes.length-8){
    let pos=12,canvas=null,frame=null;
    while(pos+8<=bytes.length){
      const tag=bytes.toString('ascii',pos,pos+4),len=bytes.readUInt32LE(pos+4),p=pos+8,end=p+len;
      if(end+(len&1)>bytes.length)return null;
      if(tag==='ANIM'||tag==='ANMF')return null;
      if(tag==='VP8X'){
        if(canvas||len!==10||(bytes[p]&2))return null;
        canvas=fit('webp',1+bytes.readUIntLE(p+4,3),1+bytes.readUIntLE(p+7,3));if(!canvas)return null;
      }else if(tag==='VP8 '){
        if(frame||len<10||(bytes[p]&1)||bytes[p+3]!==0x9d||bytes[p+4]!==1||bytes[p+5]!==0x2a)return null;
        frame=fit('webp',bytes.readUInt16LE(p+6)&0x3fff,bytes.readUInt16LE(p+8)&0x3fff);if(!frame)return null;
      }else if(tag==='VP8L'){
        if(frame||len<5||bytes[p]!==0x2f)return null;
        const bits=bytes.readUInt32LE(p+1);
        if(bits>>>29)return null;
        frame=fit('webp',1+(bits&0x3fff),1+((bits>>>14)&0x3fff));if(!frame)return null;
      }
      pos=end+(len&1);
    }
    if(pos===bytes.length&&frame&&(!canvas||canvas.width===frame.width&&canvas.height===frame.height))return frame;
  }
  return null;
}
function raster(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX)return null;
  if(verifyPng(bytes).ok)return 'data:image/png;base64,'+bytes.toString('base64');
  if(bytes.toString('utf8',0,128).trimStart().startsWith('<')&&svgReport(bytes).status==='restricted-vector-review')return 'data:image/svg+xml;base64,'+bytes.toString('base64');
  const dimensions=rasterDimensions(bytes);
  if(dimensions)return 'data:image/'+dimensions.mime+';base64,'+bytes.toString('base64');
  if(/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))){const report=gifReport(bytes);if(report.status==='bounded-animation-review'&&report.frames<=32&&report.width*report.height*report.frames<=1024*1024)return 'data:image/gif;base64,'+bytes.toString('base64');}
  return null;
}
function base64Image(raw){
  if(typeof raw!=='string'||raw.length>Math.ceil(MAX/3)*4+64)return null;
  const match=/^(?:data:image\/(?:png|svg\+xml|jpeg|jpg|webp|gif);base64,)?([A-Za-z0-9+/]+={0,2})$/i.exec(raw);
  if(!match)return null;
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.toString('base64').replace(/=+$/,'')!==match[1].replace(/=+$/,''))return null;
  return raster(bytes);
}
function pathImage(directory,raw){
  if(typeof raw!=='string'||raw.length>1000)return null;
  const name=raw.replace(/^(?:\.\/|\/)/,'');
  if(!name||name.split('/').some(p=>!p||p==='.'||p==='..'||/[:\\\x00-\x1f\x7f]/.test(p)))return null;
  try{
    const root=fs.realpathSync(directory);
    for(const candidate of /\.(png|svg|jpe?g|webp|gif)$/i.test(name)?[name]:['.png','.svg','.jpg','.jpeg','.webp','.gif'].map(ext=>name+ext)){
      try{
        const actual=fs.realpathSync(path.resolve(root,candidate)),rel=path.relative(root,actual);
        if(!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))continue;
        const st=fs.statSync(actual);
        if(!st.isFile()||st.size>MAX)continue;
        const image=raster(fs.readFileSync(actual));if(image)return image;
      }catch{}
    }
  }catch{}
  return null;
}
function manifestImage(directory,action,index){return pathImage(directory,action.States?.[index]?.Image||action.Icon);}
function imageSpec(directory,action,item){
  if(!item||typeof item!=='object')throw Error('invalid image spec');
  switch(item.source||'path'){
    case 'clear':return null;
    case 'path':{const image=pathImage(directory,item.path);if(image)return image;break;}
    case 'base64':{const image=base64Image(item.base64);if(image)return image;break;}
    case 'state':{const image=manifestImage(directory,action,item.state);if(image)return image;break;}
  }
  throw Error('unsupported original image');
}
function currentImage(directory,action,visual){return visual.temporary??visual.defaults.get(visual.state)??manifestImage(directory,action,visual.state);}
function applyImage(directory,action,visual,param){
  const next={state:visual.state,temporary:visual.temporary,defaults:new Map(visual.defaults)};
  if(param.clear===true){next.defaults.clear();next.temporary=null;return next;}
  if(param.isDefault===true){
    const list=Array.isArray(param.icons)?param.icons:[param.icons];
    if(!list.length||list.length>Math.max(1,action.States?.length||1))throw Error('invalid default images');
    for(const item of list){
      const index=item?.state;
      if(!Number.isInteger(index)||index<0||index>=Math.max(1,action.States?.length||1))throw Error('invalid image state');
      const image=imageSpec(directory,action,item);
      if(image)next.defaults.set(index,image);else next.defaults.delete(index);
    }
    next.temporary=null;
  }else{
    if(Array.isArray(param.icons))throw Error('invalid temporary image');
    next.temporary=imageSpec(directory,action,param.icons);
  }
  return next;
}
module.exports={base64Image,pathImage,manifestImage,applyImage,currentImage,rasterDimensions};
