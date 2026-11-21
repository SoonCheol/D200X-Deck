const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(app.getPath('appData'),'DeckForge-Drop-Probe'));
app.whenReady().then(()=>{const w=new BrowserWindow({width:900,height:680,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadFile('index.html');});
ipcMain.handle('save-log',async(e,text)=>{const r=await dialog.showSaveDialog({defaultPath:'electron-drop-log.json'});if(!r.canceled)fs.writeFileSync(r.filePath,text,'utf8');});
app.on('window-all-closed',()=>app.quit());
