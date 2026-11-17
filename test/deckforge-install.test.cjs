'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'app/streamdeck-editor/main.cjs'),'utf8');
const cmd=fs.readFileSync(path.join(root,'tools/fusion-mcp/deckforge-mcp.cmd'),'utf8');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'app/streamdeck-editor/deckforge-installer.json'),'utf8'));
const manager=fs.readFileSync(path.join(root,'tools/fusion-manager/main.cjs'),'utf8');
test('DeckForge uses its own data directory, without legacy migration',()=>{
  assert.match(main,/app\.setPath\('userData',path\.join\(app\.getPath\('appData'\),'DeckForge'\)\)/);
  assert.doesNotMatch(main,/D200X StreamDeck Device Sync/);
  assert.match(main,/const folder=path\.join\(process\.env\.LOCALAPPDATA\|\|'', 'Programs','DeckForge'\)/);
});
test('closing the editor hides to tray and explicit Quit remains available',()=>{
  assert.match(main,/window\.on\('close',event=>/);
  assert.match(main,/event\.preventDefault\(\)/);
  assert.match(main,/window\.hide\(\)/);
  assert.match(main,/DeckForge 종료/);
  assert.match(main,/quitting=true;\s*app\.quit\(\)/);
  assert.match(main,/initializeTray\(\)/);
});
test('bundled MCP wrapper uses Electron Node, not the development checkout',()=>{
  assert.match(cmd,/ELECTRON_RUN_AS_NODE=1/);
  assert.match(cmd,/DeckForge\.exe/);
  assert.match(cmd,/fusion-mcp\\server\.cjs/);
  assert.doesNotMatch(cmd,/E:\\Codex/i);
});
test('installer config uses per-user fixed location and retains app data',()=>{
  assert.equal(cfg.appId,'net.homedisk.deckforge');
  assert.equal(cfg.win.target[0],'nsis');
  assert.equal(cfg.nsis.oneClick,true);
  assert.equal(cfg.nsis.perMachine,false);
  assert.equal(cfg.nsis.deleteAppDataOnUninstall,false);
  assert.equal(cfg.npmRebuild,false);
});

test('Fusion Manager shares only the new DeckForge icon cache',()=>{
  assert.match(manager,/path\.join\(app\.getPath\('appData'\),'DeckForge','fusion-command-icons'\)/);
  assert.doesNotMatch(manager,/D200X StreamDeck Device Sync/);
});
