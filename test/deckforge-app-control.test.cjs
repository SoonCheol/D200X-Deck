'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const os=require('node:os');
const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const ps=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/app-control.ps1'),'utf8');
const holdStart=editor.indexOf('const openAppHoldTimers=new Map();');
const holdEnd=editor.indexOf('const hotkeySwitchPositions=',holdStart);
const dispatchStart=editor.indexOf('function executeHardwareAction(event,preview=false,skipKnobGesture=false){');
const dispatchEnd=editor.indexOf("  if(resolved.action?.type==='logic'",dispatchStart);
assert.ok(holdStart>=0&&holdEnd>holdStart&&dispatchStart>=0&&dispatchEnd>dispatchStart);
const holdSource=editor.slice(holdStart,holdEnd);
const dispatchSource=editor.slice(dispatchStart,dispatchEnd)+"  if(preview) opened.push(event);return null;\n}";
function setup(mode='close'){
  const action={type:'open-app',settings:{app:'C:\\Tools\\Example.exe',hold:mode,args:'',foreground:true}};
  const state={profileId:'a',page:0,folderPath:[],pages:[[action]],pinned:[]};
  const calls=[],records=[],opened=[],timers=new Map();
  let now=1000,next=0;
  const visible=()=>state.folderPath.length?[action]:[state.pages[state.page]?.[0]||state.pinned[0]||null];
  const window={deckBridge:{
    closeLocalApp:(...args)=>{calls.push(args);return Promise.resolve(true);},
    logAppControl:record=>{records.push(record);return Promise.resolve(true);}
  }};
  const ctx=vm.createContext({state,window,opened,inspectorSession:null,Date:{now:()=>now},
    DeckCore:{activeFolder:()=>null,visibleActions:visible,controlBinding:()=>null,
      isWideDisplayPress:()=>false,resolveHardwareEvent:(_,event)=>({index:0,gesture:event.pressed?'down':'up',action:visible()[0]})},
    heldKnobEvent:event=>({event,consume:false,replay:false}),
    setTimeout:(fn,delay)=>{assert.equal(delay,650);const id=++next;timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id)});
  vm.runInContext(holdSource+dispatchSource,ctx);
  const event=pressed=>({kind:1,index:0,state:pressed?1:0,pressed});
  return {action,state,calls,records,opened,timers,
    down:()=>ctx.executeHardwareAction(event(true)),up:()=>ctx.executeHardwareAction(event(false)),
    fire:()=>{now+=650;for(const [id,fn] of [...timers]){timers.delete(id);fn();}},
    cancel:reason=>ctx.clearD200XOpenAppHolds?.(reason)||window.clearD200XOpenAppHolds(reason),
    trace:(a)=>ctx.makeAppControlTrace('test',0,a)};
}
test('650 ms hold dispatches exactly once before release, with correct force option',()=>{
  for(const mode of ['close','force']){
    const s=setup(mode);s.down();s.down();assert.equal(s.timers.size,1);
    assert.equal(s.calls.length,0);s.fire();assert.equal(s.calls.length,1);
    assert.equal(s.calls[0][1],mode==='force');s.down();s.fire();s.up();
    assert.equal(s.calls.length,1);assert.equal(s.opened.length,0);
    s.down();s.fire();s.up();assert.equal(s.calls.length,2);
  }
});
test('short press opens on release, never closes',()=>{
  const s=setup();s.down();s.up();s.fire();
  assert.equal(s.calls.length,0);assert.equal(s.opened.length,1);
});
test('changed hold mode or target cancels and consumes release even after timer fires',()=>{
  for(const change of [a=>{a.settings.hold='none';},a=>{a.settings.hold='force';},a=>{a.settings.app='C:\\Other.exe';}]){
    const s=setup();s.down();change(s.action);s.fire();s.down();s.up();
    assert.equal(s.calls.length,0);assert.equal(s.opened.length,0);assert.equal(s.timers.size,0);
    assert.ok(s.records.some(r=>r.stage==='cancel'));
    s.action.settings.hold='close';s.down();s.fire();s.up();assert.equal(s.calls.length,1);
  }
});
test('release after action replacement or disabled hold clears old token before threshold',()=>{
  for(const change of [s=>{s.action.settings.hold='none';},s=>{s.state.pages[0][0]=null;},s=>{s.state.pages[0][0]={type:'media',settings:{}};}]){
    const s=setup();s.down();change(s);s.up();s.fire();
    assert.equal(s.calls.length,0);assert.equal(s.opened.length,0);assert.equal(s.timers.size,0);
    assert.ok(s.records.some(r=>r.stage==='cancel'));
  }
});
test('navigation and HID disconnect cancel pending timers',()=>{
  for(const reason of ['navigation','hid-disconnect']){
    const s=setup();s.down();s.cancel(reason);s.fire();s.up();
    assert.equal(s.calls.length,0);assert.equal(s.opened.length,0);
    assert.ok(s.records.some(r=>r.stage==='cancel'&&r.reason===reason));
  }
});
test('pinned trace is true only for the inherited root slot',()=>{
  const s=setup(),pin={...s.action};
  s.state.pinned[0]=pin;assert.equal(s.trace(s.action).pinned,false);
  s.state.pages[0][0]=null;assert.equal(s.trace(pin).pinned,true);
  s.state.folderPath=[0];assert.equal(s.trace(pin).pinned,false);
});
test('Force requests precede one shared wait budget and final PID verification',()=>{
  const stop=ps.indexOf('Stop-Process -InputObject $p -Force');
  const wait=ps.indexOf('$requested.WaitForExit($budget)');
  const verify=ps.indexOf("$success=($selected.Count -gt 0 -and $remaining.Count -eq 0)");
  assert.ok(stop>=0&&wait>stop&&verify>wait);
  assert.ok(ps.includes('$budget=[int][Math]::Max(0,2000-$waitClock.ElapsedMilliseconds)'));
  assert.ok(!ps.includes('WaitForExit(2000)'));
});
test('Windows PowerShell 5.1 Force with a unique nonexistent EXE returns no match', {skip:process.platform!=='win32'},()=>{
  const target=path.join(os.tmpdir(),'deckforge-no-match-'+randomUUID()+'.exe');
  const result=JSON.parse(execFileSync('powershell.exe',
    ['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,
      DECKFORGE_CONTROL_KIND:'EXE',DECKFORGE_CONTROL_MODE:'Force',
      DECKFORGE_CONTROL_TARGET:Buffer.from(target,'utf16le').toString('base64'),
      DECKFORGE_CONTROL_TRACE:'test-no-match'}}));
  assert.equal(result.mode,'Force');assert.match(result.psVersion,/^5\.1\./);
  assert.equal(result.found,false);assert.equal(result.matched,0);
  assert.deepEqual(result.selected,[]);assert.deepEqual(result.remaining,[]);
  assert.ok(!result.steps.some(s=>s.stage==='fatal'||s.stage==='api'));
});

test('zero-byte link and linkMove drops allow AppID inspection without changing real file drops',()=>{
  const line=editor.split(/\r?\n/).find(s=>s.includes('void registerDroppedApplication(i,filePath,'));
  assert.ok(line);
  const source='(function(i,filePath,file,ev){'+line+'})';
  const calls=[];
  const fn=vm.runInNewContext(source,{registerDroppedApplication:(...args)=>calls.push(args)});
  for(const [size,effectAllowed,expected] of [[0,'link',true],[0,'linkMove',true],[0,'move',false],[0,'copy',false],[0,'all',false],[256,'link',false],[256,'linkMove',false]]){
    fn(1,'example',{size},{dataTransfer:{effectAllowed}});
    assert.deepEqual(calls.pop(),[1,'example',expected]);
  }
});
