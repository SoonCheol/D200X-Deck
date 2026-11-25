'use strict';
const path=require('node:path');
const {execFileSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('App focus helper requires Windows');
const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
const out=path.join(__dirname,'app-focus-helper.exe');
// Compile the unchanged, previously tested folder activation primitives into this separate executable.
execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/main:DFAppFocus','/reference:Microsoft.CSharp.dll','/reference:System.Web.Extensions.dll','/out:'+out,path.join(__dirname,'folder-control-helper.cs'),path.join(__dirname,'app-focus-helper.cs')],{stdio:'inherit',windowsHide:true});
const result=JSON.parse(execFileSync(out,[],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,DECKFORGE_APP_FOCUS_MODE:'Validate'}}));
if(result.status!=='validated')throw Error(JSON.stringify(result));
