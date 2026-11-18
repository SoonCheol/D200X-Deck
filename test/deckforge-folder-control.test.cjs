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

test('new-window success requires a new matching frame; fallback only on rejected verb',()=>{
  const ps=source('folder-control.ps1'),main=source('main.cjs');
  assert.match(ps,/\$result\.ToInt64\(\) -le 32/);
  assert.match(ps,/\$before=@\(\$rows\|ForEach-Object/);
  assert.match(ps,/\$_\.Match -and \$_\.Frame\.ToInt64\(\) -notin \$before/);
  assert.match(ps,/\$fresh\.Count -gt 0/);
  assert.match(ps,/Result 'new-not-confirmed'/);
  assert.match(main,/result\.status==='new-not-confirmed'/);
});
test('focus uses exact match and verified foreground, attached input released in finally',()=>{
  const ps=source('folder-control.ps1'),main=source('main.cjs');
  assert.match(ps,/if\(!\(Wait-Foreground \$frame\)\)/);
  assert.match(ps,/finally \{if\(attached\)detached=AttachThreadInput\(current,other,false\);\}/);
  assert.match(ps,/\[DFFolderNative\]::GetForegroundWindow\(\) -eq \$frame -and !\[DFFolderNative\]::IsIconic/);
  assert.match(main,/stage:'helper-result'/);
  assert.match(main,/folder-control-'\+new Date/);
  assert.match(main,/alwaysNewWindow,\s*\n\s*mode:/);
});
