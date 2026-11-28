'use strict';
// Dedicated development process. Never start the DeckForge editor or reuse its data.
const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {runScenario,readJson}=require('./deckforge-sdk-simulate.cjs');
const root=path.resolve(process.argv[2]||'');
const relative=path.relative(os.tmpdir(),root);
if(!relative.startsWith('deckforge-sdk-offline-')||relative.includes(path.sep)||path.isAbsolute(relative)){app.exit(1);}
else{
  app.setPath('userData',root);app.setPath('sessionData',root);
  app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const manifest=await readJson(path.join(root,'manifest.json'),1024*1024);
    const scenario=await readJson(path.join(root,'scenario.json'),65536);
    const result=await runScenario(manifest,scenario,root);
    await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result),{flag:'wx'});
    app.exit(0);
  }).catch(()=>app.exit(1));
}
