'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const cli=path.resolve(__dirname,'../app/deckforge-editor/deckforge-sdk-cli.cjs');
const examples=path.resolve(__dirname,'../examples/deckforge-sdk');
async function invoke(manifest,scenario){
  try{
    const result=await promisify(execFile)(process.execPath,[cli,'simulate',manifest,scenario],{timeout:210000,maxBuffer:2*1024*1024,windowsHide:true});
    return {code:0,stdout:result.stdout,stderr:result.stderr};
  }catch(error){
    if(typeof error.code!=='number'||error.killed)throw error;
    return {code:error.code,stdout:error.stdout,stderr:error.stderr};
  }
}
test('Windows SDK CLI launches isolated Electron and checks published example scenarios',{skip:process.platform!=='win32',timeout:900000},async()=>{
  for(const example of ['counter','http-mock','socket']){
    const result=await invoke(path.join(examples,example+'.native.json'),path.join(examples,example+'.scenario.json'));
    assert.equal(result.code,0,example+': '+result.stderr+' '+result.stdout);
    const report=JSON.parse(result.stdout);
    assert.equal(report.apiVersion,2);assert.equal(report.ok,true);
    assert.ok(report.assertions.checked>0);assert.equal(report.assertions.failed,0);
  }
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-cli-assertion-'));
  try{
    const scenario=JSON.parse(await fs.readFile(path.join(examples,'counter.scenario.json'),'utf8'));
    scenario.expectInitial.title='intentional mismatch';
    const file=path.join(temp,'mismatch.json');await fs.writeFile(file,JSON.stringify(scenario),{flag:'wx'});
    const result=await invoke(path.join(examples,'counter.native.json'),file);
    assert.equal(result.code,1,result.stderr);
    const report=JSON.parse(result.stdout);assert.equal(report.ok,false);
    assert.deepEqual(report.assertions.mismatches,[{target:'initial',field:'title',expected:'intentional mismatch',actual:'Count 0'}]);
  }finally{await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
