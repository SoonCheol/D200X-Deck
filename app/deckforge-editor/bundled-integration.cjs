'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const FUSION='com.autodesk.fusionstreamdeck';
const HA='de.perdoctus.streamdeck.homeassistant';
function bundledRoot(){return path.join(process.resourcesPath,'bundled');}
async function exists(file){try{await fs.access(file);return true}catch{return false}}
async function installFusionPlugin(host,root=bundledRoot()){
 const installed=new Set((await host.list()).map(item=>item.uuid));
 if(installed.has(FUSION))return 'existing';
 const fusion=path.join(root,'com.autodesk.fusionstreamdeck.sdPlugin');
 if(!await exists(path.join(fusion,'manifest.json')))return 'not-bundled';
 await host.installDirectory(fusion);return 'installed';
}
async function installMissingPlugins(host,root=bundledRoot()){
 const installed=new Set((await host.list()).map(item=>item.uuid)),results={};
 const retained=new Set(typeof host.listRetainedLegacy==='function'?(await host.listRetainedLegacy()).map(item=>item.id):[]);
 results.fusion=installed.has(FUSION)?'existing':retained.has(FUSION)?'retained':await installFusionPlugin(host,root);
 const home=path.join(root,'de.perdoctus.streamdeck.homeassistant.streamDeckPlugin');
 if(installed.has(HA))results.ha='existing';
 else if(retained.has(HA))results.ha='retained';
 else if(await exists(home)){await host.install(await fs.readFile(home));results.ha='installed'}
 else results.ha='not-bundled';
 return results;
}
async function installFusionAddin(root=bundledRoot(),options={}){
 const appData=options.appData||process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming');
 const bases=['Autodesk Fusion 360','Autodesk Fusion'].map(name=>path.join(appData,'Autodesk',name,'API','AddIns'));
 const targets=bases.map(base=>path.join(base,'FusionDeckForge'));
 const present=[];
 for(const base of bases)for(const name of ['FusionDeckForge','FusionStreamDeck']){const target=path.join(base,name);if(await exists(target))present.push(target);}
 if(present.length>1)return {status:'ambiguous',message:'Fusion 애드인 폴더가 두 곳에 있습니다. 중복 설치는 변경하지 않았습니다.'};
 let target=present[0],status='existing';
 const source=path.join(root,'FusionDeckForge');
 if(target&&(!await exists(path.join(target,path.basename(target)+'.py'))||!await exists(path.join(target,path.basename(target)+'.manifest'))))
   return {status:'existing-incomplete',message:'기존 Fusion 애드인 폴더에 필요한 파일이 없습니다. 덮어쓰지 않았습니다.'};
 if(!target){
   const ready=[];
   for(let i=0;i<bases.length;i++)if(await exists(bases[i]))ready.push(targets[i]);
   if(ready.length>1)return {status:'ambiguous',message:'Fusion 애드인 설치 후보가 두 곳입니다. 임의로 선택하지 않았습니다.'};
   if(!ready.length)return {status:'fusion-not-ready',message:'Fusion 360을 설치하고 한 번 실행한 뒤 애드인 설치를 다시 누르세요.'};
   if(!await exists(path.join(source,'FusionDeckForge.py'))||!await exists(path.join(source,'FusionDeckForge.manifest')))
     return {status:'not-bundled',message:'설치 파일에 Fusion 애드인이 없습니다.'};
   target=ready[0];await fs.cp(source,target,{recursive:true,errorOnExist:true,force:false});status='installed';
 }
 let startup='unchanged';
 if(options.configureStartup===true){
   const file=path.join(target,path.basename(target)+'.manifest');
   try{
     const stat=await fs.lstat(file);
     if(!stat.isFile()||stat.size>65536)throw Error('invalid');
     const raw=await fs.readFile(file,'utf8'),manifest=JSON.parse(raw.replace(/^\uFEFF/,''));
     if(manifest?.type!=='addin'||manifest.autodeskProduct!=='Fusion360'||typeof manifest.runOnStartup!=='boolean')throw Error('invalid');
     if(manifest.runOnStartup===true)startup='already-enabled';
     else{
       const tmp=file+'.'+require('node:crypto').randomUUID()+'.tmp';
       try{
         await fs.writeFile(tmp,JSON.stringify({...manifest,runOnStartup:true},null,4)+'\n',{flag:'wx'});
         // Do not overwrite a manifest modified by Fusion or the user during the operation.
         if(await fs.readFile(file,'utf8')!==raw)throw Error('changed');
         await fs.rename(tmp,file);startup='enabled';
       }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
     }
   }catch{startup='unverified';}
 }
 return {status,startup,target,message:status==='installed'?'FusionDeckForge 애드인을 복사했습니다. Fusion에서 실행 상태를 확인하세요.':'기존 '+path.basename(target)+' 애드인을 확인했습니다.'};
}
// Existing add-ins are never upgraded during automatic setup or startup.
async function planFusionStateUpgrade(root=bundledRoot(),options={}){
 const appData=options.appData||process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming');
 const candidates=['Autodesk Fusion 360','Autodesk Fusion'].flatMap(name=>['FusionDeckForge','FusionStreamDeck'].map(addin=>path.join(appData,'Autodesk',name,'API','AddIns',addin)));
 const present=[];
 for(const candidate of candidates)if(await exists(candidate))present.push(candidate);
 if(present.length!==1)return {status:'unavailable'};
 const target=path.join(present[0],'lib','fusion_actions.py');
 try{
   const files=[target,path.join(root,'fusion-actions-original.py'),path.join(root,'FusionDeckForge','lib','fusion_actions.py')];
   const data=await Promise.all(files.map(async file=>{
     const st=await fs.lstat(file);if(!st.isFile()||st.size>65536)throw Error('invalid Fusion source');
     return fs.readFile(file);
   }));
   const [current,original,extended]=data;
   if(current.equals(extended))return {status:'already-extended'};
   if(!current.equals(original)||!extended.toString('utf8').includes("'deckforgeState': _deckforge_status(app)"))
     return {status:'unrecognized'};
   return {status:'ready',target,original,extended};
 }catch{return {status:'unavailable'};}
}
async function applyFusionStateUpgrade(plan){
 if(plan?.status!=='ready')throw Error('확장 대상 확인 실패');
 const {target,original,extended}=plan;
 const backup=target+'.deckforge-original.bak';
 const tmp=target+'.'+require('node:crypto').randomUUID()+'.tmp';
 try{
   if(!(await fs.readFile(target)).equals(original))throw Error('Fusion 원본이 변경되었습니다.');
   try{await fs.writeFile(backup,original,{flag:'wx'});}
   catch(error){if(error.code!=='EEXIST'||!(await fs.readFile(backup)).equals(original))throw error;}
   await fs.writeFile(tmp,extended,{flag:'wx'});
   if(!(await fs.readFile(target)).equals(original))throw Error('Fusion 원본이 변경되었습니다.');
   await fs.rename(tmp,target);
   return {status:'state-upgraded',message:'Fusion 상태 연동 확장 완료. Fusion을 다시 시작하세요.'};
 }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
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
   // Slight native-window-frame overlap removes the visible compositor gap.
   const x=side==='right'?d.x+d.width-7:d.x-m.width+7;
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
   const expected=side==='right'?d.x+d.width-7:d.x-m.width+7;
   if(Math.abs(m.x-expected)>50||Math.abs(m.y-d.y)>50)detach();
   else place();
   return;
  }
  if(!enabled)return;
  if(Math.abs(m.x-(d.x+d.width-7))<=14&&Math.abs(m.y-d.y)<=40)attach('right');
  else if(Math.abs(m.x+m.width-(d.x+7))<=14&&Math.abs(m.y-d.y)<=40)attach('left');
 };
 deck.on('move',place);deck.on('resize',place);
 manager.on('move',onManagerMoved);manager.on('resize',onManagerMoved);
 return {
  attach,detach,
  toggle(){enabled=!enabled;if(!enabled)detach();else attach();saveEnabled(enabled);return this.status()},
  status(){return {available:true,enabled,attached,side}},
  enable(value){enabled=Boolean(value);if(!enabled)detach();return this.status()}
 };
}
module.exports={installMissingPlugins,installFusionPlugin,installFusionAddin,planFusionStateUpgrade,applyFusionStateUpgrade,createMagnet};
