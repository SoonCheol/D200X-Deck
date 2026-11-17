'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(base,'app/streamdeck-editor/main.cjs'),'utf8');
const host=fs.readFileSync(path.join(base,'app/streamdeck-editor/sd-plugin-host.cjs'),'utf8');
const manager=fs.readFileSync(path.join(base,'tools/fusion-manager/main.cjs'),'utf8');
const appearance=fs.readFileSync(path.join(base,'app/streamdeck-editor/action-panel-icons.js'),'utf8');
test('SDK plugins install, enumerate and run under Plugins with legacy migration',()=>{
  assert.match(host,/this\.root=path\.join\(userData,'StreamDeck','Plugins'\)/);
  assert.match(host,/const destination=path\.join\(this\.root,manifest\.UUID\+'\.sdPlugin'\)/);
  assert.match(host,/const dir=path\.join\(this\.root,uuid\+'\.sdPlugin'\)/);
  assert.match(host,/settingsFile\(uuid\)\{return path\.join\(this\.root,uuid\+'\.globals'\)/);
  assert.doesNotMatch(host,/streamdeck-sdk-plugins/);
});
test('imported icon packs move to Resources/IconPacks without deleting prior JSON',()=>{
  assert.match(main,/function iconPacksFile\(\)\{return path\.join\(app\.getPath\('userData'\),'StreamDeck','IconPacks','streamdeck-icon-packs-v1\.json'\)/);
  assert.match(main,/readPacks\(iconPacksFile\(\)\)/);
  assert.match(main,/registerPack\(iconPacksFile\(\),pack\)/);
  assert.match(main,/removePack\(iconPacksFile\(\),id\)/);
});
test('Fusion images share Cache/Fusion paths between DeckForge and manager',()=>{
  assert.match(main,/const fusionCacheDir=\(\)=>path\.join\(app\.getPath\('userData'\),'Cache','Fusion','generated'\)/);
  assert.match(main,/const trusted=path\.join\(app\.getPath\('userData'\),'Cache','Fusion','original'\)/);
  assert.match(manager,/const iconDir=path\.join\(app\.getPath\('appData'\),'DeckForge','Cache','Fusion','generated'\)/);
  assert.match(manager,/const ownIconDir=\(\)=>path\.join\(app\.getPath\('appData'\),'DeckForge','Cache','Fusion','original'\)/);
});
test('theme and profile persistence remain in localStorage until an actual theme-pack format exists',()=>{
  assert.match(appearance,/localStorage\.getItem\(KEY\)/);
  assert.match(appearance,/localStorage\.setItem\(KEY,JSON\.stringify\(config\)\)/);
  assert.match(fs.readFileSync(path.join(base,'app/streamdeck-editor/editor.js'),'utf8'),/localStorage\.setItem\(STORAGE_KEY,JSON\.stringify\(state\)\)/);
});
