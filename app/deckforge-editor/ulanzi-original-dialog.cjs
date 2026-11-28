'use strict';
const {validateValue}=require('./deckforge-native-settings.cjs');
function pickerOptions(msg,title){
  if(!['file','folder'].includes(msg.type))throw Error('invalid picker type');
  const options={title,properties:[msg.type==='file'?'openFile':'openDirectory']};
  if(msg.type==='file'&&msg.filter!==undefined&&msg.filter!==''){
    if(typeof msg.filter!=='string'||msg.filter.length>512)throw Error('invalid file filter');
    const filters=msg.filter.split(';;').map(raw=>{
      const m=/^\s*([^()\r\n]{1,60})\(\s*(\*\.[a-zA-Z0-9]+(?:\s+\*\.[a-zA-Z0-9]+)*|\*|\*\.\*)\s*\)\s*$/.exec(raw);
      if(!m)throw Error('invalid file filter');
      const extensions=m[2]==='*'||m[2]==='*.*'?['*']:[...new Set(m[2].split(/\s+/).map(x=>x.slice(2).toLowerCase()))];
      return {name:m[1].trim(),extensions};
    });
    if(filters.length>8)throw Error('too many file filters');
    options.filters=filters;
  }
  return options;
}
function viewOptions(msg){
  if(typeof msg.url!=='string'||msg.url.length>1000)throw Error('invalid view URL');
  const entry=msg.url.replace(/^(?:\.\/|\/)/,'');
  if(!/\.html?$/i.test(entry)||entry.split('/').some(p=>!p||p==='.'||p==='..'||/[:\\?#\x00-\x1f\x7f]/.test(p)))throw Error('invalid view path');
  const integer=(value,fallback)=>{if(value===undefined)return fallback;const n=typeof value==='string'&&/^-?\d+$/.test(value)?Number(value):value;if(!Number.isSafeInteger(n))throw Error('invalid window geometry');return n;};
  const params=msg.param===undefined?{}:validateValue(msg.param);
  return {entry,params:Object.fromEntries(Object.entries(params).filter(([,v])=>v!==null)),width:integer(msg.width,200),height:integer(msg.height,200),x:integer(msg.x,undefined),y:integer(msg.y,undefined)};
}
function externalUrl(msg){
  if(msg.local===true||typeof msg.url!=='string'||msg.url.length>2048||/[\x00-\x1f\x7f]/.test(msg.url))throw Error('invalid external URL');
  const url=new URL(msg.url);
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw Error('invalid external URL');
  const params=msg.param==null?{}:validateValue(msg.param);
  for(const [key,value] of Object.entries(params))if(value!==null)url.searchParams.set(key,String(value));
  if(url.href.length>4096)throw Error('external URL too long');
  return url.href;
}
module.exports={pickerOptions,viewOptions,externalUrl};
