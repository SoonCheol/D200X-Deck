'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compareVersions,checkUpdateStatus}=require('../app/streamdeck-editor/update-check.cjs');
const runs={workflow_runs:[
 {id:109,name:'DeckForge integrated Windows build',event:'push',status:'in_progress',conclusion:null},
 {id:108,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'failure'},
 {id:107,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'success'},
 {id:106,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'success'}]};
const artifact=(version,expired=false)=>({name:'DeckForge-'+version+'-Setup-win-x64',size_in_bytes:120000000,expired});
test('compare semver triplets numerically and reject ambiguous versions',()=>{
 assert.equal(compareVersions('1.1.102','1.1.101'),1);
 assert.equal(compareVersions('1.2.0','1.1.102'),1);
 assert.equal(compareVersions('1.1.101','1.1.101'),0);
 assert.equal(compareVersions('1.1.99','1.1.101'),-1);
 assert.equal(compareVersions('v1.1.103','1.1.101'),null);
});
test('only successful Windows build with valid Setup artifact enables update',async()=>{
 const fetch=async url=>url.includes('/artifacts')?{artifacts:[artifact('1.1.102')]}:runs;
 assert.deepEqual(await checkUpdateStatus('1.1.101',fetch),{
  state:'available',currentVersion:'1.1.101',latestVersion:'1.1.102',runId:107});
 assert.deepEqual(await checkUpdateStatus('1.1.102',fetch),{
  state:'current',currentVersion:'1.1.102',latestVersion:'1.1.102',runId:null});
});
test('expired latest Setup is skipped in favor of older valid successful build',async()=>{
 const seen=[];
 const fetch=async url=>{
  seen.push(url);
  if(url.includes('/107/artifacts'))return {artifacts:[artifact('1.1.103',true)]};
  if(url.includes('/106/artifacts'))return {artifacts:[artifact('1.1.102')]};
  return runs;
 };
 const result=await checkUpdateStatus('1.1.101',fetch);
 assert.equal(result.latestVersion,'1.1.102');
 assert.equal(result.runId,106);
 assert.ok(seen.some(url=>url.includes('/106/artifacts')));
});
test('GitHub API errors and missing files never enable update',async()=>{
 const bad=async()=>{throw Error('rate limit');};
 assert.equal((await checkUpdateStatus('1.1.101',bad)).state,'unavailable');
 const noFiles=await checkUpdateStatus('1.1.101',async url=>url.includes('/artifacts')?{artifacts:[]}:runs);
 assert.equal(noFiles.state,'unavailable');assert.equal(noFiles.runId,null);
});
test('menu requires successful comparison before enabling update button',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/index.html'),'utf8');
 const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/main.cjs'),'utf8');
 assert.match(html,/id="latest-version"/);
 assert.match(html,/id="check-update"[^>]*disabled/);
 assert.match(html,/id="view-release-notes"/);
 assert.match(editor,/viewReleaseNotes\(\)/);
 assert.match(main,/d200x:release-notes/);
 assert.match(editor,/update\.disabled=result\?\.state!=='available'/);
 assert.match(main,/if\(info\?\.state!=='available'/);
});

test('published EXE release is preferred and permits direct download',async()=>{
 const release=version=>({tag_name:'deckforge-v'+version,draft:false,prerelease:true,assets:[{name:'DeckForge-'+version+'-Setup-win-x64.exe',state:'uploaded',size:120000000,browser_download_url:'https://github.com/SoonCheol/D200X-Deck/releases/download/deckforge-v'+version+'/DeckForge-'+version+'-Setup-win-x64.exe'}]});
 const broken=release('1.1.112');broken.assets[0].browser_download_url='https://example.com/installer.exe';
 const fetch=async url=>{assert.match(url,/\/releases\?/);return [release('1.1.109'),broken,release('1.1.110'),{...release('1.1.111'),draft:true}];};
 assert.deepEqual(await checkUpdateStatus('1.1.108',fetch),{state:'available',currentVersion:'1.1.108',latestVersion:'1.1.110',runId:null,downloadUrl:'https://github.com/SoonCheol/D200X-Deck/releases/download/deckforge-v1.1.110/DeckForge-1.1.110-Setup-win-x64.exe'});
 assert.equal((await checkUpdateStatus('1.1.110',fetch)).state,'current');
});
test('unarchived EXE artifact is recognized when no release exists',async()=>{
 const result=await checkUpdateStatus('1.1.108',async url=>url.includes('/releases')?[]:url.includes('/artifacts')?{artifacts:[{...artifact('1.1.109'),name:'DeckForge-1.1.109-Setup-win-x64.exe'}]}:runs);
 assert.equal(result.state,'available');assert.equal(result.runId,107);
});
test('installer uploads without archive while portable retains artifact archive and release publication',()=>{
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/streamdeck-clean-preview.yml'),'utf8');
 assert.match(yml,/path: app\/dist-installer\/[^\n]+\.exe\n\s+archive: false/);
 assert.match(yml,/path: app\/dist\/DeckForge-win32-x64\/\n\s+if-no-files-found: error/);
 assert.match(yml,/gh release create \$tag \$installer --target \$env:GITHUB_SHA/);
});
