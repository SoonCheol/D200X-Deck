'use strict';
const path=require('node:path');
const {execFileSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Native drop helper requires Windows');
const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
const output=path.join(__dirname,'native-drop-helper.exe');
const shared=path.resolve(__dirname,'../../tools/native-drop-probe/NativeDropProbe.cs');
execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/main:DeckForgeNativeDrop.IntegrationProgram','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+output,shared,path.join(__dirname,'native-drop-helper.cs')],{stdio:'inherit',windowsHide:true});
execFileSync(output,['--self-test'],{stdio:'inherit',windowsHide:true,timeout:30000});
