'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.join(__dirname,'../app/streamdeck-editor');
const {appFocusPath,runAppFocus,focusOrLaunch,createAppLaunchQueue}=require(path.join(root,'app-focus.cjs'));
function policy(states,options={}){
  const calls=[];
  const run=()=>focusOrLaunch({
    ...options,
    focus:async(mode,exclude)=>{calls.push(mode);const state=states.shift();if(mode==='WaitNew')assert.deepEqual(exclude,['10']);return typeof state==='string'?{status:state}:state;},
    launch:async()=>{calls.push('launch');return true;},
    record:async(mode)=>{if(mode==='launch-unconfirmed')calls.push(mode);}
  });
  return {run,calls};
}
test('existing application does not launch another instance',async()=>{
  const active=policy(['focused']);assert.equal(await active.run(),true);assert.deepEqual(active.calls,['Focus']);
  const blocked=policy(['matched-not-focused']);await assert.rejects(blocked.run(),/새 창은 열지 않았습니다/);assert.deepEqual(blocked.calls,['Focus']);
});
test('missing windows launch once then attempt foreground, including slow/background apps',async()=>{
  for(const [after,expected] of [['focused',['Focus','launch','Wait']],['missing',['Focus','launch','Wait','launch-unconfirmed']]]){
    const h=policy(['missing',after]);assert.equal(await h.run(),true);assert.deepEqual(h.calls,expected);
  }
  const blocked=policy(['missing','matched-not-focused']);await assert.rejects(blocked.run(),/실행했지만/);assert.deepEqual(blocked.calls,['Focus','launch','Wait']);
  const error=policy(['error']);await assert.rejects(error.run());assert.deepEqual(error.calls,['Focus']);
});
test('foreground and duplicate prevention are independent',async()=>{
  const passive=policy(['present'],{foreground:false});assert.equal(await passive.run(),true);assert.deepEqual(passive.calls,['Probe']);
  const missing=policy(['missing','present'],{foreground:false});await missing.run();assert.deepEqual(missing.calls,['Probe','launch','WaitPresent']);
  const newWindow=policy([{status:'snapshot',handles:['10']},'focused'],{preventDuplicate:false});await newWindow.run();assert.deepEqual(newWindow.calls,['Snapshot','launch','WaitNew']);
  const unrestricted=policy([],{foreground:false,preventDuplicate:false});await unrestricted.run();assert.deepEqual(unrestricted.calls,['launch']);
  const hosted=policy(['present']);await assert.rejects(hosted.run(),/새 창은 열지 않았습니다/);assert.deepEqual(hosted.calls,['Focus']);
});
test('rapid presses coalesce per target but not across different apps',async()=>{
  const queue=createAppLaunchQueue();let n=0,release;
  const first=queue('AppID:calculator',()=>{n++;return new Promise(r=>{release=r;});});
  const again=queue('AppID:calculator',()=>{n++;return true;});
  assert.equal(again,first);
  assert.equal(await queue('EXE:notepad',()=>{n++;return true;}),true);
  release(true);await first;assert.equal(n,2);
  await queue('AppID:calculator',()=>{n++;return true;});assert.equal(n,3);
});
test('native helper receives exact encoded target and is resolved outside ASAR',async()=>{
  const dir=path.join('resources','app.asar','streamdeck-editor');
  assert.equal(appFocusPath(dir),path.join('resources','app.asar.unpacked','streamdeck-editor','app-focus-helper.exe'));
  const id='Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
  const result=await runAppFocus(dir,{kind:'AppID',target:id},'Focus',async(exe,args,options)=>{
    assert.equal(exe,appFocusPath(dir));assert.deepEqual(args,[]);
    assert.equal(options.env.DECKFORGE_APP_FOCUS_KIND,'AppID');
    assert.equal(options.env.DECKFORGE_APP_FOCUS_MODE,'Focus');
    assert.equal(Buffer.from(options.env.DECKFORGE_APP_FOCUS_TARGET,'base64').toString('utf16le'),id);
    return {stdout:'{"status":"focused"}'};
  });
  assert.equal(result.status,'focused');
});
test('only program foreground actions use new path; regular file/folder and close paths remain',()=>{
  const editor=fs.readFileSync(path.join(root,'editor.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
  const cs=fs.readFileSync(path.join(root,'app-focus-helper.cs'),'utf8');
  assert.match(editor,/action.type==='open-app'&&bridge.openApplication/);
  assert.match(editor,/resolved.action\?\.type==='open-app'&&window.deckBridge.openApplication/);
  assert.match(editor,/openApplication\(outcome.path,outcome.target,outcome.args\|\|'',outcome.foreground,outcome.preventDuplicate\)/);
  assert.match(main,/launch:\(\)=>openLocalPath\(args\)/);
  assert.match(main,/queueFolderControl\(filePath,args.alwaysNewWindow===true,args.foreground!==false\)/);
  assert.match(main,/async function runCloseControl/);
  assert.match(cs,/EnumChildWindows\(hwnd,/);
  assert.match(cs,/GetApplicationUserModelId/);
  assert.match(cs,/DFFolderNative\.AttachedFocus\(hwnd\)/);
  assert.match(cs,/if\(DFFolderNative.IsIconic\(hwnd\)\)/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root,'deckforge-installer.json'),'utf8')).asarUnpack.includes('streamdeck-editor/app-focus-helper.exe'));
});
test('packaged helper executes native validation',{skip:process.platform!=='win32'||!process.env.DECKFORGE_TEST_HELPER_DIR},()=>{
  const exe=appFocusPath(process.env.DECKFORGE_TEST_HELPER_DIR);
  assert.ok(fs.existsSync(exe));
  const result=JSON.parse(require('node:child_process').execFileSync(exe,[],{
    windowsHide:true,timeout:20000,encoding:'utf8',env:{...process.env,DECKFORGE_APP_FOCUS_MODE:'Validate'}
  }));
  assert.equal(result.status,'validated');
});

test('terminal launch reuses native policy with separate privilege and fixed UAC launch',()=>{
  const editor=fs.readFileSync(path.join(root,'editor.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
  const cs=fs.readFileSync(path.join(root,'app-focus-helper.cs'),'utf8');
  assert.match(main,/kind:'Terminal',target:args.admin\?'admin':'normal'/);
  assert.match(main,/queueAppLaunch\('Terminal:'\+spec.target,launch\)/);
  assert.match(main,/inspectAppFocus\(spec,'Launch',traceId\)/);
  assert.match(cs,/GetTokenInformation\(token,20,out elevation,4,out size\)/);
  assert.match(cs,/identity.IsElevated.Value==\(target=="admin"\)/);
  assert.match(cs,/new ProcessStartInfo\(alias,"-w new"\)\{UseShellExecute=true,Verb=target=="admin"\?"runas":"open"\}/);
  assert.match(editor,/bridge.openTerminal\(outcome.admin,outcome.foreground,outcome.preventDuplicate\)/);
  assert.match(editor,/window.deckBridge.openTerminal\(outcome.admin,outcome.foreground,outcome.preventDuplicate\)/);
});

test('terminal-only fallback preserves existing launch policy and never opens tabs',()=>{
  const cs=fs.readFileSync(path.join(root,'app-focus-helper.cs'),'utf8');
  const start=cs.indexOf('static bool TerminalAttachedFocus(');
  const end=cs.indexOf('static bool Activate(',start);
  assert.ok(start>=0&&end>start);
  const block=cs.slice(start,end);
  assert.match(block,/if\(!Fresh\(hwnd\)\|\|Cloaked\(hwnd\)\)return false/);
  assert.match(block,/AttachThreadInput\(current,targetThread,true\)/);
  assert.match(block,/SetActiveWindow\(hwnd\)/);
  assert.match(block,/SetWindowPos\(hwnd,IntPtr.Zero,0,0,0,0,0x0203\)/);
  assert.match(block,/finally\{/);
  assert.match(block,/AttachThreadInput\(current,targetThread,false\)/);
  assert.match(block,/AttachThreadInput\(current,foregroundThread,false\)/);
  assert.match(block,/bool ok=WaitForeground\(hwnd\)/);
  assert.doesNotMatch(block,/LaunchTerminal|Process.Start|SendInput/);
  assert.match(cs,/if\(!ok&&kind=="Terminal"\)return TerminalAttachedFocus\(hwnd\)/);
});
