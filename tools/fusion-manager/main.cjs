'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
function createWindow(){
 const win=new BrowserWindow({width:1380,height:940,minWidth:900,minHeight:600,backgroundColor:'#111820',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 win.setMenuBarVisibility(false);
 win.loadFile(path.join(__dirname,'index.html'));
}
app.whenReady().then(()=>{
 ipcMain.handle('catalog',async()=>JSON.parse(await fs.readFile(path.join(__dirname,'fusion-command-catalog-final.json'),'utf8')));
 // DeckForge's existing Fusion artwork cache is shared read-only.
 // Never change DeckForge userData, cached icons, or Fusion add-in files.
 const iconDir=path.join(app.getPath('appData'),'D200X StreamDeck Device Sync','fusion-command-icons');
 ipcMain.handle('fusion-icon',async(_e,id)=>{
   if(typeof id!=='string'||!(/^[a-zA-Z0-9._-]{1,180}$/).test(id)||id==='.'||id==='..')return null;
   try{
     const bytes=await fs.readFile(path.join(iconDir,id+'.png'));
     if(bytes.length<8||bytes.length>768*1024||
        bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
     return 'data:image/png;base64,'+bytes.toString('base64');
   }catch(error){if(error.code==='ENOENT')return null;throw error}
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
