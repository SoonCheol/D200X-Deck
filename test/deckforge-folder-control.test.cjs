'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(__dirname,'../app/streamdeck-editor');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const {runFolderHelper,helperPath}=require(path.join(root,'folder-helper.cjs'));
const {buildFolderHelper}=require(path.join(root,'build-folder-helper.cjs'));
test('folder option reaches direct and composite routes, not application control',()=>{
  assert.ok(source('editor.js').includes("check('alwaysNewWindow','중복 열기 방지',true)"));
  assert.equal((source('editor.js').match(/openLocalPath\(outcome\.path,outcome\.target,outcome\.args\|\|'',outcome\.alwaysNewWindow===true,outcome\.foreground!==false\)/g)||[]).length,2);
  assert.ok(source('preload.cjs').includes('{filePath,target,args,alwaysNewWindow,foreground}'));
  const main=source('main.cjs');
  assert.ok(main.includes("args.target==='folder'&&!extra.trim()"));
  assert.ok(main.includes("result.status==='missing'&&!alwaysNewWindow"));
  assert.ok(main.includes("result.status==='matched-not-focused'"));
  assert.ok(main.includes('runFolderHelper(__dirname,filePath,record.mode)'));
  assert.doesNotMatch(main,/folder-control\.ps1/);
});
test('source, portable and installed helper paths',()=>{
  const plain=path.join('resources','app','streamdeck-editor');
  const packed=path.join('resources','app.asar','streamdeck-editor');
  assert.equal(helperPath(plain),path.join(plain,'folder-control-helper.exe'));
  assert.equal(helperPath(packed),path.join('resources','app.asar.unpacked','streamdeck-editor','folder-control-helper.exe'));
  assert.ok(JSON.parse(source('deckforge-installer.json')).asarUnpack.includes('streamdeck-editor/folder-control-helper.exe'));
});
test('Windows compiled folder helper validates paths using the production launcher',{skip:process.platform!=='win32'},async()=>{
  let dir=process.env.DECKFORGE_TEST_HELPER_DIR||root,temporary;
  try{
    if(!process.env.DECKFORGE_TEST_HELPER_DIR&&!fs.existsSync(helperPath(dir))){
      temporary=fs.mkdtempSync(path.join(os.tmpdir(),'deckforge-folder-test-'));dir=temporary;buildFolderHelper(dir);
    }
    assert.ok(fs.existsSync(helperPath(dir)),'Compiled helper must exist: '+helperPath(dir));
    const {stdout}=await runFolderHelper(dir,'','Validate');
    assert.equal(JSON.parse(stdout).status,'validated',stdout);
    const bad=await runFolderHelper(dir,'relative','Focus');
    assert.equal(JSON.parse(bad.stdout).status,'error');
  }finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}
});
test('new-window success requires a new matching frame and no repeated launch',()=>{
  const cs=source('folder-control-helper.cs'),main=source('main.cjs');
  assert.match(cs,/var before=Frames\(\)/);
  assert.match(cs,/row.Match&&!before.Contains\(row.Frame\)/);
  assert.equal((cs.match(/Process\.Start\(info\)/g)||[]).length,1);
  assert.match(cs,/Result\("new-not-confirmed"/);
  assert.match(main,/result\.status==='new-not-confirmed'/);
});
test('focus verifies path and active tab; attached input released in finally',()=>{
  const cs=source('folder-control-helper.cs'),main=source('main.cjs');
  assert.match(cs,/if\(!WaitForeground\(frame\)\)/);
  assert.match(cs,/finally \{if\(attached\)detached=AttachThreadInput\(current,other,false\);\}/);
  assert.match(cs,/GetForegroundWindow\(\)==frame&&!DFFolderNative\.IsIconic\(frame\)&&Match/);
  assert.match(main,/stage:'helper-result'/);
  assert.match(main,/folder-control-'\+new Date/);
});
test('only folder picker uses current visible action and inspector draft',()=>{
  const editor=source('editor.js');
  assert.match(editor,/const folderPicker=item.type==='folder-shortcut'&&field==='path'/);
  assert.match(editor,/inspectorSession!==session\|\|DeckCore\.visibleActions\(state\)\[state\.selected\]!==item/);
  assert.match(editor,/if\(folderPicker\)persistInspectorChange\(\);else persist\(\)/);
});
