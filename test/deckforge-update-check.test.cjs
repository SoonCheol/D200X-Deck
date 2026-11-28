'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compareVersions,checkUpdateStatus}=require('../app/deckforge-editor/update-check.cjs');
const runs={workflow_runs:[
 {id:109,name:'DeckForge integrated Windows build',event:'push',status:'in_progress',conclusion:null},
 {id:108,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'failure'},
 {id:107,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'success'},
 {id:106,name:'DeckForge integrated Windows build',event:'push',status:'completed',conclusion:'success'}]};
const artifact=(version,expired=false)=>({name:'DeckForge-'+version+'-Setup-win-x64',size_in_bytes:120000000,expired});
test('compare semver triplets numerically and reject ambiguous versions',()=>{
 assert.equal(compareVersions('1.1.102','1.1.101'),1);
 assert.equal(compareVersions('1.2.0','1.1.102'),1);
 assert.equal(compareVersions('2.0.0','1.1.243'),1);
 assert.equal(compareVersions('1.1.243','2.0.0'),-1);
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
 const html=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/index.html'),'utf8');
 const editor=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/main.cjs'),'utf8');
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
 const yml=fs.readFileSync(path.join(__dirname,'../.github/workflows/deckforge-windows-build.yml'),'utf8').replace(/\r\n/g,'\n');
 assert.match(yml,/path: app\/dist-installer\/[^\n]+\.exe\n\s+archive: false/);
 assert.match(yml,/path: app\/dist\/DeckForge-win32-x64\/\n\s+if-no-files-found: error/);
 assert.match(yml,/gh release create \$tag \$installer --target \$env:GITHUB_SHA/);
});

test('major version transition discovers the published DeckForge 2.0.0 installer without changing update channels',async()=>{
 const release=version=>({tag_name:'deckforge-v'+version,draft:false,prerelease:true,assets:[{name:'DeckForge-'+version+'-Setup-win-x64.exe',state:'uploaded',size:135000000,browser_download_url:'https://github.com/SoonCheol/D200X-Deck/releases/download/deckforge-v'+version+'/DeckForge-'+version+'-Setup-win-x64.exe'}]});
 const fetch=async url=>{assert.match(url,/\/releases\?/);return [release('1.1.243'),release('2.0.0')];};
 assert.deepEqual(await checkUpdateStatus('1.1.243',fetch),{state:'available',currentVersion:'1.1.243',latestVersion:'2.0.0',runId:null,downloadUrl:'https://github.com/SoonCheol/D200X-Deck/releases/download/deckforge-v2.0.0/DeckForge-2.0.0-Setup-win-x64.exe'});
 assert.equal((await checkUpdateStatus('2.0.0',fetch)).state,'current');
});

test('local download only accepts the exact uploaded release asset and SHA-256',()=>{
 const {verifiedInstallerAsset,installerUrlAllowed,releaseDownloadUrl}=require('../app/deckforge-editor/update-check.cjs');
 const version='2.0.77',url=releaseDownloadUrl(version),name='DeckForge-'+version+'-Setup-win-x64.exe';
 const release={tag_name:'deckforge-v'+version,draft:false,prerelease:true,assets:[{name,state:'uploaded',size:8,digest:'sha256:'+'a'.repeat(64),browser_download_url:url}]};
 assert.deepEqual(verifiedInstallerAsset([release],version),{name,url,size:8,sha256:'a'.repeat(64)});
 assert.equal(verifiedInstallerAsset([{...release,draft:true}],version),null);
 assert.equal(verifiedInstallerAsset([{...release,assets:[{...release.assets[0],digest:null}]}],version),null);
 assert.equal(verifiedInstallerAsset([{...release,assets:[{...release.assets[0],browser_download_url:'https://example.com/'+name}]}],version),null);
 assert.equal(installerUrlAllowed(url,url),true);
 assert.equal(installerUrlAllowed('https://release-assets.githubusercontent.com/asset?signature=test',url),true);
 for(const bad of ['http://release-assets.githubusercontent.com/a','https://release-assets.githubusercontent.com.evil.test/a','https://evil.test/a','https://user@objects.githubusercontent.com/a','https://github.com/other.exe','https://objects.githubusercontent.com:444/a'])assert.equal(installerUrlAllowed(bad,url),false,bad);
});
test('verified EXE download preserves existing files and cleans incomplete downloads',async()=>{
 const {downloadPublishedInstaller,releaseDownloadUrl}=require('../app/deckforge-editor/update-check.cjs');
 const {Readable}=require('node:stream'),{createHash}=require('node:crypto');
 const version='2.0.77',name='DeckForge-'+version+'-Setup-win-x64.exe',url=releaseDownloadUrl(version);
 const data=Buffer.from('synthetic installer bytes'),digest='sha256:'+createHash('sha256').update(data).digest('hex');
 const root=await fs.promises.mkdtemp(path.join(require('node:os').tmpdir(),'deckforge-download-test-'));
 const folder=path.join(root,'DeckForge');
 const metadata=[{tag_name:'deckforge-v'+version,draft:false,prerelease:true,assets:[{name,state:'uploaded',size:data.length,digest,browser_download_url:url}]}];
 const opts=bytes=>({requestJson:async()=>metadata,openResponse:async requested=>{assert.equal(requested,url);return Readable.from([bytes]);}});
 try{
   const first=await downloadPublishedInstaller(version,folder,opts(data));
   assert.equal(first,path.join(folder,name));assert.deepEqual(await fs.promises.readFile(first),data);
   const second=await downloadPublishedInstaller(version,folder,opts(data));
   assert.equal(second,first);assert.deepEqual(await fs.promises.readFile(second),data);
   // Force network validation for the failure cases without removing the valid installer.
   const next='2.0.78',nextUrl=releaseDownloadUrl(next),nextName='DeckForge-'+next+'-Setup-win-x64.exe';
   const nextMeta=[{...metadata[0],tag_name:'deckforge-v'+next,assets:[{...metadata[0].assets[0],name:nextName,browser_download_url:nextUrl}]}];
   const nextOpts=bytes=>({requestJson:async()=>nextMeta,openResponse:async requested=>{assert.equal(requested,nextUrl);return Readable.from([bytes]);}});
   const existing=(await fs.promises.readdir(folder)).sort();
   await assert.rejects(downloadPublishedInstaller(next,folder,nextOpts(Buffer.from('x'))),/SHA-256/);
   await assert.rejects(downloadPublishedInstaller(next,folder,nextOpts(Buffer.alloc(data.length))),/SHA-256/);
   await assert.rejects(downloadPublishedInstaller(next,folder,nextOpts(Buffer.alloc(data.length+1))),/용량 초과/);
   assert.deepEqual((await fs.promises.readdir(folder)).sort(),existing);
 }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});
test('installer is downloaded to the Windows Downloads subfolder and launched without Explorer',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../app/deckforge-editor/main.cjs'),'utf8');
 const handler=main.slice(main.indexOf("ipcMain.handle('d200x:check-updates'"),main.indexOf('function trayPreferencePath'));
 assert.match(handler,/path\.join\(app\.getPath\('downloads'\),'DeckForge'\)/);
 assert.match(handler,/downloadPublishedInstaller\(info\.latestVersion,directory,/);
 assert.match(handler,/startVerifiedInstaller\(file,/);
 assert.match(handler,/dialog\.showMessageBox\(window,/);
 assert.match(handler,/buttons:\['나중에','설치'\],defaultId:1,cancelId:0/);
 assert.match(handler,/return result\.response===1/);
 assert.match(handler,/openInstaller:installer=>shell\.openPath\(installer\)/);
 assert.match(handler,/quit:quitDeckForge/);
 assert.match(handler,/DeckForgePrepareUpdate/);
 assert.match(handler,/pendingInstallerDownload/);
 assert.doesNotMatch(handler,/shell\.showItemInFolder|shell\.openPath\(directory\)|spawn\(/);
});

test('installer retention recognizes exact managed names and compares versions numerically',()=>{
 const {installerFileVersion,previousInstallerVersions}=require('../app/deckforge-editor/update-check.cjs');
 assert.equal(installerFileVersion('DeckForge-2.0.77-Setup-win-x64-01234567-89ab-4cde-8f01-23456789abcd.exe'),'2.0.77');
 for(const name of ['other.exe','DeckForge-2.0.77-Setup-win-x64.exe.bak','DeckForge-02.0.77-Setup-win-x64.exe','DeckForge-2.0.77-Setup-win-x64-manual.exe'])assert.equal(installerFileVersion(name),null,name);
 const names=['2.0.9','2.0.10','2.0.11','2.0.11','2.0.12'].map(v=>'DeckForge-'+v+'-Setup-win-x64.exe');
 assert.deepEqual(previousInstallerVersions(names,'2.0.12'),['2.0.11','2.0.10','2.0.9']);
});
test('successful update keeps newest and one rollback version, reuses verified download, preserves unrelated files',async()=>{
 const {downloadPublishedInstaller,releaseDownloadUrl}=require('../app/deckforge-editor/update-check.cjs');
 const {Readable}=require('node:stream'),{createHash}=require('node:crypto');
 const root=await fs.promises.mkdtemp(path.join(require('node:os').tmpdir(),'deckforge-retention-test-'));
 const name=v=>'DeckForge-'+v+'-Setup-win-x64.exe';
 const versions=['2.0.75','2.0.76','2.0.77','2.0.78'];
 const bytes=v=>Buffer.from('installer '+v);
 const metadata=versions.map(v=>({tag_name:'deckforge-v'+v,draft:false,prerelease:true,assets:[{name:name(v),state:'uploaded',size:bytes(v).length,digest:'sha256:'+createHash('sha256').update(bytes(v)).digest('hex'),browser_download_url:releaseDownloadUrl(v)}]}));
 let downloads=0;
 const opts={requestJson:async()=>metadata,openResponse:async url=>{downloads++;assert.equal(url,releaseDownloadUrl('2.0.78'));return Readable.from([bytes('2.0.78')]);}};
 try{
   for(const v of versions.slice(0,-1))await fs.promises.writeFile(path.join(root,name(v)),bytes(v));
   const duplicate=name('2.0.77').slice(0,-4)+'-01234567-89ab-4cde-8f01-23456789abcd.exe';
   await fs.promises.writeFile(path.join(root,duplicate),bytes('2.0.77'));
   await fs.promises.writeFile(path.join(root,'notes.txt'),'keep');
   const subdir=path.join(root,name('2.0.74'));await fs.promises.mkdir(subdir);
   await fs.promises.writeFile(path.join(subdir,'keep.txt'),'keep');
   const before=(await fs.promises.readdir(root)).sort();
   await assert.rejects(downloadPublishedInstaller('2.0.78',root,{...opts,openResponse:async()=>Readable.from([Buffer.from('bad')])}),/SHA-256/);
   assert.deepEqual((await fs.promises.readdir(root)).sort(),before);
   const progress=[];
   const file=await downloadPublishedInstaller('2.0.78',root,{...opts,onProgress:n=>progress.push(n)});
   assert.equal(file,path.join(root,name('2.0.78')));
   assert.equal(progress.at(-1),100);
   assert.ok(progress.slice(0,-1).every(n=>n>=0&&n<100));
   await fs.promises.writeFile(path.join(root,name('2.0.78').slice(0,-4)+'-01234567-89ab-4cde-8f01-23456789abcd.exe'),bytes('2.0.78'));
   assert.equal(await downloadPublishedInstaller('2.0.78',root,opts),file);
   assert.deepEqual((await fs.promises.readdir(root)).sort(),[name('2.0.74'),name('2.0.77'),name('2.0.78'),'notes.txt'].sort());
   assert.equal(await downloadPublishedInstaller('2.0.78',root,opts),file);
   assert.equal(downloads,1);
   assert.equal(await fs.promises.readFile(path.join(subdir,'keep.txt'),'utf8'),'keep');
   assert.deepEqual(await fs.promises.readFile(path.join(root,name('2.0.77'))),bytes('2.0.77'));
 }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('verified installer requires confirmation and readiness, then quits only on successful launch',async()=>{
 const {startVerifiedInstaller}=require('../app/deckforge-editor/update-check.cjs');
 const calls=[],file='verified.exe';
 const opts={confirm:async()=>{calls.push('confirm');return true;},prepare:async()=>{calls.push('prepare');return true;},openInstaller:async p=>{assert.equal(p,file);calls.push('launch');return '';},quit:()=>calls.push('quit')};
 assert.equal(await startVerifiedInstaller(file,opts),'installing');
 assert.deepEqual(calls,['confirm','prepare','launch','quit']);
 calls.length=0;
 assert.equal(await startVerifiedInstaller(file,{...opts,confirm:async()=>false}),'deferred');
 assert.deepEqual(calls,[]);
 assert.equal(await startVerifiedInstaller(file,{...opts,prepare:async()=>false}),'blocked');
 assert.deepEqual(calls,['confirm']);
 calls.length=0;
 await assert.rejects(startVerifiedInstaller(file,{...opts,openInstaller:async()=>{calls.push('error');return 'denied';}}),/실행 실패/);
 assert.deepEqual(calls,['confirm','prepare','error']);
});
