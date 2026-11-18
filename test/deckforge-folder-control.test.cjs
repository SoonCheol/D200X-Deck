const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'../app/streamdeck-editor');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
test('folder option reaches direct and composite routes, not application control',()=>{
  assert.ok(source('editor.js').includes("check('alwaysNewWindow','항상 새 창으로 열기')"));
  assert.equal((source('editor.js').match(/openLocalPath\(outcome\.path,outcome\.target,outcome\.args\|\|'',outcome\.alwaysNewWindow===true\)/g)||[]).length,3);
  assert.ok(source('preload.cjs').includes('{filePath,target,args,alwaysNewWindow}'));
  const main=source('main.cjs');
  assert.ok(main.includes("args.target==='folder'&&!extra.trim()"));
  assert.ok(main.includes("result.status==='missing'&&!alwaysNewWindow"));
  assert.ok(main.includes("result.status==='matched-not-focused'"));
});
test('Windows PowerShell 5.1 compiles folder helper and checks path equality without opening windows',{skip:process.platform!=='win32'},()=>{
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(source('folder-control.ps1'),'utf16le').toString('base64')],{
    encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,DECKFORGE_FOLDER_MODE:'Validate'}
  });
  assert.equal(JSON.parse(output).status,'validated',output);
});
