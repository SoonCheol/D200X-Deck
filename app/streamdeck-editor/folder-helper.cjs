'use strict';
const path=require('node:path');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const run=promisify(execFile);
function helperPath(directory){
  const parent=path.dirname(directory);
  const physical=path.basename(parent)==='app.asar'
    ?path.join(parent+'.unpacked',path.basename(directory)):directory;
  return path.join(physical,'folder-control-helper.exe');
}
function runFolderHelper(directory,filePath,mode){
  return run(helperPath(directory),[],{
    windowsHide:true,timeout:30000,maxBuffer:1024*1024,encoding:'utf8',
    env:{...process.env,DECKFORGE_FOLDER_TARGET:Buffer.from(filePath,'utf16le').toString('base64'),DECKFORGE_FOLDER_MODE:mode}
  });
}
module.exports={helperPath,runFolderHelper};
