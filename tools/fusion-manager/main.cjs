'use strict';
const {app,BrowserWindow,ipcMain,dialog,screen}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
function createWindow(){
 const area=screen.getPrimaryDisplay().workArea;
 const width=Math.min(620,area.width),height=Math.min(880,area.height);
 const win=new BrowserWindow({width,height,minWidth:Math.min(480,width),minHeight:Math.min(560,height),backgroundColor:'#111820',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 win.setMenuBarVisibility(false);
 win.loadFile(path.join(__dirname,'index.html'));
}
app.whenReady().then(()=>{
 ipcMain.handle('window-mode',async(event,mode)=>{
   const win=BrowserWindow.fromWebContents(event.sender);
   if(!win||!['explore','pages'].includes(mode))return false;
   const area=screen.getDisplayMatching(win.getBounds()).workArea;
   const w=Math.min(mode==='pages'?1240:620,area.width);
   const b=win.getBounds();
   const x=Math.min(Math.max(area.x,b.x),area.x+area.width-w);
   const h=Math.min(Math.max(b.height,600),area.height);
   win.setBounds({x,y:Math.min(Math.max(area.y,b.y),area.y+area.height-h),width:w,height:h});
   return true;
 });
 ipcMain.handle('catalog',async()=>JSON.parse(await fs.readFile(path.join(__dirname,'fusion-command-catalog-final.json'),'utf8')));
 // DeckForge's existing Fusion artwork cache is shared read-only.
 // Never change DeckForge userData, cached icons, or Fusion add-in files.
 const iconDir=path.join(app.getPath('appData'),'D200X StreamDeck Device Sync','fusion-command-icons');
 ipcMain.handle('fusion-icon',async(_e,id)=>{
   if(typeof id!=='string'||!(/^[a-zA-Z0-9._-]{1,180}$/).test(id)||id==='.'||id==='..')return null;
   return (await readSaved(id))?.data||null;
 });

 // Autodesk's original FusionStreamDeck add-in serves the genuine command icon
 // at GET /icon?commandId=...&size=32. Never POST /command.
 const ownIconDir=()=>path.join(app.getPath('userData'),'original-fusion-icons');
 const discoveryFile=()=>path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'FusionStreamDeck','endpoint.json');
 const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9._-]{1,180}$/.test(id)&&id!=='.'&&id!=='..';
 const extensions=[['png','image/png'],['svg','image/svg+xml']];
 async function readSaved(id){
   for(const dir of [ownIconDir(),iconDir]){
     for(const [ext,mime] of extensions){
       if(dir===iconDir&&ext!=='png')continue;
       try{
         const data=await fs.readFile(path.join(dir,id+'.'+ext));
         if(data.length<8||data.length>768*1024)continue;
         if(ext==='png'&&data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')continue;
         if(ext==='svg'&&!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(data.toString('utf8').replace(/<!--[\s\S]*?-->/g,'')))continue;
         return {data:'data:'+mime+';base64,'+data.toString('base64'),source:dir===iconDir?'deckforge':'manager'};
       }catch(e){if(e.code!=='ENOENT')throw e}
     }
   }
   return null;
 }
 async function fusionEndpoint(){
   let info;
   try{info=JSON.parse(await fs.readFile(discoveryFile(),'utf8'))}catch{throw Error('Fusion 360 애드인이 실행 중이지 않습니다.')}
   if(info?.status!=='running'||!Number.isInteger(info.port)||info.port<1||info.port>65535)
     throw Error('Fusion 360 아이콘 서버가 실행 중이지 않습니다.');
   const base='http://127.0.0.1:'+info.port;
   const health=await fetch(base+'/health',{signal:AbortSignal.timeout(2500)});
   if(!health.ok||(await health.json())?.ok!==true)throw Error('Fusion 360 아이콘 서버 연결 실패');
   return base;
 }
 ipcMain.handle('fusion-icon-health',async()=>{
   try{return {available:true,endpoint:await fusionEndpoint()}}catch(e){return {available:false,message:e.message}}
 });
 ipcMain.handle('fusion-icon-collect',async(_e,id)=>{
   if(!safeId(id))return {status:'invalid',id};
   // This request is only a GET for an original image, never Fusion command execution.
   try{
     const existing=await readSaved(id);
     if(existing)return {status:'cached',id,...existing};
     const base=await fusionEndpoint();
     const uri=base+'/icon?commandId='+encodeURIComponent(id)+'&size=32';
     const reply=await fetch(uri,{signal:AbortSignal.timeout(6500)});
     if(reply.status===404)return {status:'missing',id};
     if(!reply.ok)return {status:'failed',id,error:'Fusion HTTP '+reply.status};
     const mime=reply.headers.get('content-type')?.split(';')[0]?.trim()?.toLowerCase();
     const ext=mime==='image/png'?'png':mime==='image/svg+xml'?'svg':null;
     if(!ext)return {status:'failed',id,error:'지원되지 않는 원본 형식'};
     const declared=Number(reply.headers.get('content-length')||0);
     if(declared>768*1024)return {status:'failed',id,error:'아이콘 크기 초과'};
     const data=Buffer.from(await reply.arrayBuffer());
     if(data.length<8||data.length>768*1024)return {status:'failed',id,error:'아이콘 크기 오류'};
     if(ext==='png'&&data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return {status:'failed',id,error:'PNG 형식 오류'};
     if(ext==='svg'&&!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(data.toString('utf8').replace(/<!--[\s\S]*?-->/g,'')))
       return {status:'failed',id,error:'SVG 형식 오류'};
     await fs.mkdir(ownIconDir(),{recursive:true});
     const final=path.join(ownIconDir(),id+'.'+ext);
     const temp=final+'.tmp';
     await fs.writeFile(temp,data);await fs.rename(temp,final);
     return {status:'saved',id,data:'data:'+mime+';base64,'+data.toString('base64'),source:'manager'};
   }catch(e){return {status:'failed',id,error:e.message}}
 });
 const preferencesFile=()=>path.join(app.getPath('userData'),'fusion-command-visibility-v1.json');
 ipcMain.handle('curation-load',async()=>{
   try{
     const saved=JSON.parse(await fs.readFile(preferencesFile(),'utf8'));
     if(!saved||typeof saved!=='object'||Array.isArray(saved))return {};
     return Object.fromEntries(Object.entries(saved).filter(([id,value])=>
       /^[a-zA-Z0-9._-]{1,180}$/.test(id)&&['primary','review','hidden'].includes(value)).slice(0,10000));
   }catch(e){if(e.code==='ENOENT')return {};throw e}
 });
 ipcMain.handle('curation-save',async(_e,overrides)=>{
   if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw Error('분류 저장 형식 오류');
   const allowed=Object.entries(overrides).filter(([id,value])=>
     /^[a-zA-Z0-9._-]{1,180}$/.test(id)&&['primary','review','hidden'].includes(value));
   if(allowed.length>10000)throw Error('분류 개수 초과');
   await fs.writeFile(preferencesFile(),JSON.stringify(Object.fromEntries(allowed),null,2)+'\n','utf8');
   return true;
 });
 const captureFile=()=>path.join(app.getPath('userData'),'last-fusion-ui-capture-v2.json');
 ipcMain.handle('capture-load',async()=>{
   try{
     const stat=await fs.stat(captureFile());
     if(stat.size>30*1024*1024)return null;
     return JSON.parse(await fs.readFile(captureFile(),'utf8'));
   }catch(e){if(e.code==='ENOENT')return null;throw e}
 });
 ipcMain.handle('open-ui-capture',async()=>{
   const {canceled,filePaths}=await dialog.showOpenDialog({
     title:'Fusion UI 수집 JSON 선택 (명령 실행 없음)',properties:['openFile'],
     filters:[{name:'Fusion UI JSON',extensions:['json']}]
   });
   if(canceled||!filePaths?.length)return null;
   const stat=await fs.stat(filePaths[0]);
   if(!stat.isFile()||stat.size>30*1024*1024)throw Error('수집 JSON은 30MB 이하만 지원합니다.');
   const raw=await fs.readFile(filePaths[0],'utf8');
   const data=JSON.parse(raw);
   if(!['deckforge-fusion-ui-placements-v1','deckforge-fusion-ui-placements-v2'].includes(data?.format)||
     !Array.isArray(data.placements)||!Array.isArray(data.errors)||data.placements.length>250000||
     data.errors.length>50000)throw Error('올바른 Fusion UI 수집 JSON이 아닙니다.');
   await fs.writeFile(captureFile(),raw,'utf8');
   return data;
 });
 ipcMain.handle('save-json',async(_e,{data,defaultName})=>{
   const {canceled,filePath}=await dialog.showSaveDialog({title:'JSON 저장',defaultPath:defaultName||'Fusion-Layout.json',filters:[{name:'JSON',extensions:['json']}]});
   if(canceled||!filePath)return null;
   await fs.writeFile(filePath,JSON.stringify(data,null,2)+'\n','utf8');return filePath;
 });
 ipcMain.handle('open-json',async()=>{
   const {canceled,filePaths}=await dialog.showOpenDialog({title:'작업 프로젝트 JSON 불러오기',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
   if(canceled||!filePaths?.length)return null;
   const txt=await fs.readFile(filePaths[0],'utf8');
   if(Buffer.byteLength(txt)>5*1024*1024)throw Error('JSON 최대 크기는 5MB입니다.');
   return {name:filePaths[0],data:JSON.parse(txt)};
 });
 createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
