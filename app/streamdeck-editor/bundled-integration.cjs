'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const FUSION='com.autodesk.fusionstreamdeck';
const HA='de.perdoctus.streamdeck.homeassistant';
function bundledRoot(){return path.join(process.resourcesPath,'bundled');}
async function exists(file){try{await fs.access(file);return true}catch{return false}}
async function installMissingPlugins(host,root=bundledRoot()){
 const installed=new Set((await host.list()).map(item=>item.uuid)),results={};
 const fusion=path.join(root,'com.autodesk.fusionstreamdeck.sdPlugin');
 if(installed.has(FUSION))results.fusion='existing';
 else if(await exists(path.join(fusion,'manifest.json'))){
  await host.installDirectory(fusion);results.fusion='installed';
 }else results.fusion='not-bundled';
 const home=path.join(root,'de.perdoctus.streamdeck.homeassistant.streamDeckPlugin');
 if(installed.has(HA))results.ha='existing';
 else if(await exists(home)){await host.install(await fs.readFile(home));results.ha='installed'}
 else results.ha='not-bundled';
 return results;
}
async function installFusionAddin(root=bundledRoot(),options={}){
 const base=path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),
  'Autodesk','Autodesk Fusion 360','API','AddIns');
 const source=path.join(root,'FusionStreamDeck');
 const target=path.join(base,'FusionStreamDeck');
 if(await exists(path.join(target,'FusionStreamDeck.py')))return {status:'existing'};
 if(await exists(target))return {status:'existing-incomplete',message:'기존 FusionStreamDeck 폴더가 있어 덮어쓰지 않았습니다.'};
 if(!await exists(path.join(source,'FusionStreamDeck.py')))return {status:'not-bundled',message:'설치 파일에 Fusion 애드인이 없습니다.'};
 if(!await exists(base))return {status:'fusion-not-ready',message:'Fusion 360을 설치하고 한 번 실행한 뒤 애드인 설치를 다시 누르세요.'};
 await fs.cp(source,target,{recursive:true,errorOnExist:true,force:false});
 return {status:'installed',message:'FusionStreamDeck 애드인을 복사했습니다. Fusion 360에서 Run 및 Run on Startup을 활성화하세요.'};
}
function createMagnet(deck,manager,display,saveEnabled=()=>{}){
 let enabled=true,attached=false,side='right',changing=false,normal=manager.getBounds();
 const isLive=()=>!deck.isDestroyed()&&!manager.isDestroyed();
 const chooseSide=()=>{
  const b=deck.getBounds(),w=manager.getBounds().width;
  const area=display.getDisplayMatching(b).workArea;
  if(b.x+b.width+w<=area.x+area.width)return 'right';
  if(b.x-w>=area.x)return 'left';
  // A centered DeckForge often leaves neither side large enough.
  // Reposition the two windows as a pair only when both fit on one monitor.
  if(b.width+w<=area.width){
   const x=area.x+Math.floor((area.width-b.width-w)/2);
   const y=Math.max(area.y,Math.min(b.y,area.y+area.height-b.height));
   deck.setBounds({x,y,width:b.width,height:b.height});
   return 'right';
  }
  return null;
 };
 const place=()=>{
  if(!attached||!isLive()||changing)return;
  changing=true;
  try{
   const d=deck.getBounds(),m=manager.getBounds(),area=display.getDisplayMatching(d).workArea;
   const h=Math.min(d.height,area.height);
   const x=side==='right'?d.x+d.width:d.x-m.width;
   if(x<area.x||x+m.width>area.x+area.width){attached=false;return;}
   const next={x,y:d.y,width:m.width,height:h};
   if(m.x!==next.x||m.y!==next.y||m.height!==next.height)manager.setBounds(next);
  }finally{changing=false}
 };
 const attach=(preferred)=>{
  if(!enabled||!isLive())return false;
  const chosen=preferred||chooseSide();if(!chosen)return false;
  if(!attached)normal=manager.getBounds();
  side=chosen;attached=true;place();return attached;
 };
 const detach=()=>{if(!attached)return;attached=false;changing=true;try{const m=manager.getBounds();const area=display.getDisplayMatching(m).workArea;manager.setBounds({x:m.x,y:m.y,width:normal.width,height:Math.min(normal.height,area.height)})}finally{changing=false}};
 const onManagerMoved=()=>{
  if(changing||!isLive())return;
  const d=deck.getBounds(),m=manager.getBounds();
  if(attached){
   const expected=side==='right'?d.x+d.width:d.x-m.width;
   if(Math.abs(m.x-expected)>50||Math.abs(m.y-d.y)>50)detach();
   else place();
   return;
  }
  if(!enabled)return;
  if(Math.abs(m.x-(d.x+d.width))<=24&&Math.abs(m.y-d.y)<=80)attach('right');
  else if(Math.abs(m.x+m.width-d.x)<=24&&Math.abs(m.y-d.y)<=80)attach('left');
 };
 deck.on('move',place);deck.on('resize',place);
 manager.on('move',onManagerMoved);manager.on('resize',onManagerMoved);
 return {
  attach,detach,
  toggle(){enabled=!enabled;if(!enabled)detach();else attach();saveEnabled(enabled);return this.status()},
  status(){return {available:true,enabled,attached,side}},
  enable(value){enabled=Boolean(value);if(!enabled)detach();else attach();return this.status()}
 };
}
module.exports={installMissingPlugins,installFusionAddin,createMagnet};
