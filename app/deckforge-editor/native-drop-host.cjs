'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
function nativeDropPath(directory){
 const parent=path.dirname(directory);
 return path.join(path.basename(parent)==='app.asar'?path.join(parent+'.unpacked',path.basename(directory)):directory,'native-drop-helper.exe');
}
function physicalSlots(rects,bounds,zoom,convert){
 if(!Array.isArray(rects)||rects.length<1||rects.length>13||!Number.isFinite(zoom)||zoom<=0)return [];
 const used=new Set(),out=[];
 for(const rect of rects){
  if(!rect||!Number.isInteger(rect.index)||rect.index<0||rect.index>=13||used.has(rect.index))return [];
  if(!['x','y','width','height'].every(k=>Number.isFinite(rect[k])))return [];
  const x=Math.round(rect.x*zoom),y=Math.round(rect.y*zoom);
  const right=Math.round((rect.x+rect.width)*zoom),bottom=Math.round((rect.y+rect.height)*zoom);
  if(x<0||y<0||right>bounds.width+1||bottom>bounds.height+1||right<=x||bottom<=y)return [];
  const a=convert({x:bounds.x+x,y:bounds.y+y}),z=convert({x:bounds.x+right,y:bounds.y+bottom});
  if(z.x<=a.x||z.y<=a.y||z.x-a.x>4096||z.y-a.y>4096)return [];
  used.add(rect.index);out.push({index:rect.index,x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y});
 }
 return out;
}
class NativeDropHost{
 constructor(directory,notify){this.directory=directory;this.notify=notify;this.child=null;this.ready=false;this.active=null;}
 warm(){
  if(process.platform!=='win32'||this.child)return;
  let child;
  try{child=spawn(nativeDropPath(this.directory),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
  catch(error){console.warn('Native drop helper:',error.message);return;}
  this.child=child;this.ready=false;
  const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
   if(this.child!==child||line.length>1024*1024)return;
   let msg;try{msg=JSON.parse(line);}catch{return;}
   if(msg.type==='ready'){this.ready=true;return;}
   if(msg.id!==this.active||!this.active)return;
   if(msg.type==='entered'){this.notify(msg);return;}
   if(['result','end','error'].includes(msg.type)){
    this.active=null;this.notify(msg);
   }
  });
  child.stdin.on('error',()=>{});
  child.stderr.on('data',data=>console.warn('Native drop helper:',String(data).slice(0,1000)));
  const gone=()=>{
   lines.close();if(this.child!==child)return;
   const id=this.active;this.child=null;this.ready=false;this.active=null;
   if(id)this.notify({type:'end',id});
  };
  child.once('error',gone);child.once('exit',gone);
 }
 write(message){
  try{if(!this.child?.stdin.writable)return false;this.child.stdin.write(JSON.stringify(message)+'\n');return true;}catch{return false;}
 }
 start(id,owner,rects){
  if(!this.ready||this.active||typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id)||!rects.length)return false;
  this.active=id;
  if(!this.write({type:'show',id,owner,rects})){this.active=null;return false;}
  return true;
 }
 cancel(id){
  if(!this.active||(id&&this.active!==id))return;
  const current=this.active;this.active=null;this.write({type:'hide',id:current});
  this.notify({type:'end',id:current});
 }
 stop(){
  this.cancel();const child=this.child;this.child=null;this.ready=false;
  if(child){try{child.stdin.end();child.kill();}catch{}}
 }
}
module.exports={NativeDropHost,nativeDropPath,physicalSlots};
