'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {verifyPng}=require('./ulanzi-png-verifier.cjs');
const {svgReport}=require('./ulanzi-media-analysis.cjs');
const MAX=256*1024;
function raster(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX)return null;
  if(verifyPng(bytes).ok)return 'data:image/png;base64,'+bytes.toString('base64');
  if(bytes.toString('utf8',0,128).trimStart().startsWith('<')&&svgReport(bytes).status==='restricted-vector-review')return 'data:image/svg+xml;base64,'+bytes.toString('base64');
  return null;
}
function base64Image(raw){
  if(typeof raw!=='string'||raw.length>Math.ceil(MAX/3)*4+64)return null;
  const match=/^(?:data:image\/(?:png|svg\+xml);base64,)?([A-Za-z0-9+/]+={0,2})$/i.exec(raw);
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
    for(const candidate of /\.(png|svg)$/i.test(name)?[name]:[name+'.png',name+'.svg']){
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
module.exports={base64Image,pathImage,manifestImage,applyImage,currentImage};
