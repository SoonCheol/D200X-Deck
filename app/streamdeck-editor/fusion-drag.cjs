'use strict';
// Shared exact drag payload for Fusion Command Manager -> DeckForge.
// Text/plain is required for native Chromium/Electron cross-window drops.
(function(root,factory){
 const value=factory();
 if(typeof module==='object'&&module.exports)module.exports=value;
 root.DeckForgeFusionDrag=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const PREFIX='deckforge-fusion-command-v1:';
 const PLUGIN='com.autodesk.fusionstreamdeck';
 const ACTION=PLUGIN+'.runcommand';
 const ID=/^[A-Za-z0-9._-]{1,180}$/;
 const isPng=value=>typeof value==='string'&&value.length<=130000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);
 function encode(item){
  if(!item||!ID.test(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>160)throw Error('Fusion 명령 형식 오류');
  return PREFIX+JSON.stringify({id:item.id,name:item.name,...(isPng(item.png)?{png:item.png}:{})});
 }
 function decode(text){
  if(typeof text!=='string'||text.length>140000||!text.startsWith(PREFIX))return null;
  try{
   const val=JSON.parse(text.slice(PREFIX.length));
   if(!val||typeof val!=='object'||Array.isArray(val)||!ID.test(val.id)
    ||typeof val.name!=='string'||!val.name.trim()||val.name.length>160
    ||/[\x00-\x1f\x7f]/.test(val.name))return null;
   return {id:val.id,name:val.name,...(isPng(val.png)?{png:val.png}:{})};
  }catch{return null}
 }
 return Object.freeze({PREFIX,PLUGIN,ACTION,encode,decode});
});