'use strict';
// Shared process foundation for trusted plugin runtimes. Callers own package
// validation, user approval, registration, process lifetime and data policy.
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
async function nodeRuntime(minimumVersion=20){
  // Use the already packaged Electron binary as Node, avoiding an installation
  // dependency on the user's Windows PC. This requires the default runAsNode fuse.
  const executable=process.env.D200X_NODE_PATH||process.execPath;
  // Safe for normal node.exe too; required when D200X_NODE_PATH points to the packaged Electron EXE.
  const env={...process.env,ELECTRON_RUN_AS_NODE:'1'};
  let stdout;
  try{
    ({stdout}=await execFileAsync(executable,['-p','process.versions.node'],
      {env,windowsHide:true,timeout:5000,maxBuffer:1024}));
  }catch(error){
    throw Error('Node.js 실행 환경을 확인할 수 없습니다: '+error.message);
  }
  const version=String(stdout).trim();
  const major=Number(version.split('.')[0]);
  if(!/^\d+\.\d+\.\d+$/.test(version)||!Number.isInteger(major)||major<minimumVersion)
    throw Error('이 플러그인은 Node.js '+minimumVersion+' 이상이 필요합니다. 현재: '+version);
  return {executable,env,version};
}
function spawnNodePlugin(runtime,entry,args,cwd){
  return spawn(runtime.executable,[entry,...args],{cwd,env:runtime.env,
    windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
}
module.exports={nodeRuntime,spawnNodePlugin};
