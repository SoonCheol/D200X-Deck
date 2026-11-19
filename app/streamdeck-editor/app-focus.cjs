'use strict';
const path=require('node:path');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const run=promisify(execFile);
function appFocusPath(directory){
  const parent=path.dirname(directory);
  return path.join(path.basename(parent)==='app.asar'?path.join(parent+'.unpacked',path.basename(directory)):directory,'app-focus-helper.exe');
}
async function runAppFocus(directory,spec,mode,executor=run){
  const {stdout}=await executor(appFocusPath(directory),[],{
    windowsHide:true,timeout:20000,maxBuffer:1024*1024,encoding:'utf8',
    env:{...process.env,DECKFORGE_APP_FOCUS_MODE:mode,DECKFORGE_APP_FOCUS_KIND:spec.kind,
      DECKFORGE_APP_FOCUS_TARGET:Buffer.from(spec.target,'utf16le').toString('base64')}
  });
  const result=JSON.parse(String(stdout));
  if(!['focused','matched-not-focused','missing','error'].includes(result.status))throw Error('잘못된 창 활성화 응답');
  return result;
}
async function focusOrLaunch({focus,launch,record=async()=>{}}){
  const inspect=async mode=>{
    const result=await focus(mode);await record(mode,result);
    if(result.status==='error')throw Error(result.error||'프로그램 창 검사 실패');
    return result.status;
  };
  const existing=await inspect('Focus');
  if(existing==='focused')return true;
  if(existing==='matched-not-focused')throw Error('실행 중인 창을 찾았지만 앞으로 가져오지 못했습니다. 새 창은 열지 않았습니다.');
  if(existing!=='missing')throw Error('프로그램 창 상태 확인 실패');
  await launch();
  const after=await inspect('Wait');
  if(after==='focused')return true;
  if(after==='matched-not-focused')throw Error('프로그램은 실행했지만 창을 앞으로 가져오지 못했습니다.');
  // Background/tray-only programs and slow startups may not expose a window.
  // Launch already occurred; never launch a second time in the same request.
  await record('launch-unconfirmed',{status:after});
  return true;
}
function createAppLaunchQueue(){
  const active=new Map();
  return (key,task)=>{
    const existing=active.get(key);if(existing)return existing;
    const pending=Promise.resolve().then(task).finally(()=>{if(active.get(key)===pending)active.delete(key);});
    active.set(key,pending);return pending;
  };
}
module.exports={appFocusPath,runAppFocus,focusOrLaunch,createAppLaunchQueue};
