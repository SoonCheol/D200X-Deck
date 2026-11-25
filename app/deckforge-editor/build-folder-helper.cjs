'use strict';
// Compile once at build time with Windows' inbox .NET Framework compiler.
const path=require('node:path');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
function buildFolderHelper(directory=__dirname){
  if(process.platform!=='win32')throw Error('Windows folder helper requires Windows');
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  fs.mkdirSync(directory,{recursive:true});
  const output=path.resolve(directory,'folder-control-helper.exe');
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:Microsoft.CSharp.dll','/reference:System.Web.Extensions.dll','/out:'+output,path.join(__dirname,'folder-control-helper.cs')],{stdio:'inherit',windowsHide:true});
  return output;
}
if(require.main===module)buildFolderHelper(process.argv[2]||__dirname);
module.exports={buildFolderHelper};
