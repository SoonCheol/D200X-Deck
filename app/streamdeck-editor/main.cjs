'use strict';

const { app, BrowserWindow, Menu, ipcMain, clipboard, dialog, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { D200XTransport } = require('./transport.cjs');

let window = null;
let rendererReady = false;
const transport = new D200XTransport();
function send(channel, payload) {
  if (rendererReady && window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}
transport.on('status', status => send('d200x:status', status));
transport.on('key', event => send('d200x:key', event));
transport.on('synced', details => send('d200x:synced', details));
transport.on('error-message', message => send('d200x:error', message));
let diagnosticPath = null;
let keepaliveLogCounter = 0;
transport.on('diagnostic', info => {
  // A successful keep-alive every 5 seconds is routine. Summarize it once
  // per minute to keep logs small while preserving all failure transitions.
  if (info.type === 'keepalive' && ++keepaliveLogCounter % 12 !== 1) return;
  const line = JSON.stringify(info) + '\n';
  console.info('[D200X]', info.type, info.detail);
  if (!diagnosticPath) return;
  try {
    if (fs.existsSync(diagnosticPath) && fs.statSync(diagnosticPath).size > 1024 * 1024) {
      fs.renameSync(diagnosticPath, diagnosticPath + '.previous');
    }
    fs.appendFileSync(diagnosticPath, line, {encoding:'utf8'});
  } catch (error) {
    console.warn('[D200X] Cannot write diagnostic log:', error.message);
  }
});

// Accept only the 14 known display slots, not arbitrary file paths or code.
function validImages(value) {
  if (!Array.isArray(value) || value.length !== 14) return false;
  const found = new Set();
  for (const entry of value) {
    if (!entry || !Number.isInteger(entry.index) || entry.index < 0 || entry.index >= 14 ||
        found.has(entry.index) || typeof entry.png !== 'string' ||
        entry.png.length > 1024 * 1024 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(entry.png)) return false;
    found.add(entry.index);
  }
  return found.size === 14;
}
ipcMain.on('d200x:renderer-ready', event => {
  if (!window || event.sender !== window.webContents) return;
  rendererReady = true;
  send('d200x:status', transport.deck.status());
});
ipcMain.on('d200x:sync-page', (event, images) => {
  if (!window || event.sender !== window.webContents) return;
  if (!validImages(images)) {
    send('d200x:error', '페이지 이미지 형식이 올바르지 않습니다.');
    return;
  }
  transport.schedule(images.map(entry => ({
    index: entry.index,
    png: Buffer.from(entry.png, 'base64'),
  })));
});

// Only user-configured HTTP(S) URLs may be opened by a physical key press.
// The other original Stream Deck URL modes (GET/browser selection) are pending.
ipcMain.handle('d200x:open-website', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['default','get'].includes(args.mode) || typeof args.url !== 'string'
      || args.url.length > 2048 || /[\x00-\x1f\x7f]/.test(args.url))
    throw new Error('기본 브라우저로 열기만 지원합니다.');
  let url;
  try { url = new URL(args.url.trim()); }
  catch { throw new Error('올바른 URL을 입력하세요.'); }
  if (!['http:','https:'].includes(url.protocol) || !url.hostname
      || url.username || url.password)
    throw new Error('HTTP 또는 HTTPS 웹사이트 주소만 지원합니다.');
  if(args.mode==='get'){
    // Deliberate user-configured request; no response body or cookies are stored.
    await new Promise((resolve,reject)=>{
      const request=(url.protocol==='https:'?https:http).get(url,{timeout:6000},response=>{
        response.resume();
        if((response.statusCode||0)>=400)reject(new Error('HTTP 상태 '+response.statusCode));
        else resolve(true);
      });
      request.on('timeout',()=>request.destroy(new Error('요청 시간 초과')));
      request.on('error',reject);
    });
  }else await shell.openExternal(url.href);
  return true;
});

// Only fixed, built-in Win32 media/zoom key codes; no user-provided script.
// The foreground app interprets Ctrl+plus/minus; actual zoom support varies.
ipcMain.handle('d200x:adjust-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['volume','zoom','mute','zoom-reset'].includes(args.target) ||
      (['mute','zoom-reset'].includes(args.target) ? args.direction!==0 : ![-1,1].includes(args.direction)) ||
      ![1,2,5,10].includes(args.count ?? 1) ||
      (['mute','zoom-reset'].includes(args.target) && (args.count ?? 1)!==1))
    throw new Error('지원하지 않는 노브 조절 동작입니다.');
  if (process.platform !== 'win32')
    throw new Error('Windows에서만 지원하는 조절 동작입니다.');
  const key = args.target === 'zoom-reset' ? 0x30 : args.target === 'mute' ? 0xAD
    : args.target === 'volume' ? (args.direction > 0 ? 0xAF : 0xAE)
    : (args.direction > 0 ? 0xBB : 0xBD);
  // Always use constant C# source; only the allowlisted numeric virtual key
  // changes. No shell, file paths, profile input, or arbitrary commands.
  const count=args.count ?? 1;
  const code = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${['zoom','zoom-reset'].includes(args.target) ? '[D200XKey]::keybd_event(0x11,0,0,[UIntPtr]::Zero);' : ''}
${Array.from({length:count},()=>`[D200XKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);\n[D200XKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);`).join('\n')}
${['zoom','zoom-reset'].includes(args.target) ? '[D200XKey]::keybd_event(0x11,0,2,[UIntPtr]::Zero);' : ''}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only fixed wheel events, never arbitrary shell input or scripts.
ipcMain.handle('d200x:scroll-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['vertical','horizontal'].includes(args.axis) ||
      ![-1,1].includes(args.direction) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 스크롤 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const flag=args.axis==='horizontal'?0x1000:0x0800;
  // Positive planner direction means down/right. Win32 vertical wheel is inverted.
  const delta=120*args.direction*(args.axis==='vertical'?-1:1)*(args.count??1);
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XWheel {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
}
'@;
[D200XWheel]::mouse_event(${flag},0,0,${delta},[UIntPtr]::Zero)`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only fixed Ctrl+Z / Ctrl+Y commands for the foreground Windows app.
ipcMain.handle('d200x:edit-history', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['undo','redo'].includes(args.operation) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 편집 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const key=args.operation==='undo'?0x5A:0x59;
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XEditKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${Array.from({length:args.count??1},()=>`[D200XEditKey]::keybd_event(0x11,0,0,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);
[D200XEditKey]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

// Only allowlisted Windows shortcuts: Alt+Tab (reverse Alt+Shift+Tab)
// and Ctrl+Win+Left/Right. No arbitrary commands or shortcut strings.
ipcMain.handle('d200x:switch-windows', async (event, args) => {
  if (!window || event.sender !== window.webContents)
    throw new Error('허용되지 않은 호출입니다.');
  if (!args || !['window','desktop'].includes(args.target) ||
      ![-1,1].includes(args.direction) || ![1,2,5,10].includes(args.count ?? 1))
    throw new Error('지원하지 않는 전환 동작입니다.');
  if (process.platform !== 'win32')throw new Error('Windows에서만 지원합니다.');
  const target=args.target, direction=args.direction, count=args.count??1;
  const held=target==='window'?(direction<0?[0x12,0x10]:[0x12]):[0x11,0x5B];
  const key=target==='window'?0x09:(direction<0?0x25:0x27);
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XSwitchKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XSwitchKey]::keybd_event(${v},0,0,[UIntPtr]::Zero);`).join('\n')}
${Array.from({length:count},()=>`[D200XSwitchKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XSwitchKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);`).join('\n')}
${held.slice().reverse().map(v=>`[D200XSwitchKey]::keybd_event(${v},0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

ipcMain.handle('d200x:set-safe-brightness',(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(!Number.isInteger(args?.value)||args.value<20||args.value>100)
    throw new Error('화면 보호 범위는 20~100%입니다.');
  return transport.setSafeBrightness(args.value);
});

ipcMain.handle('d200x:device-brightness',(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(!args||![-1,1].includes(args.direction)||![1,2,5,10].includes(args.count))throw new Error('잘못된 밝기 조절 요청입니다.');
  return transport.adjustBrightness(args.direction,args.count);
});

// Only close processes whose resolved executable path equals the user-selected path.
ipcMain.handle('d200x:close-local-app',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  if(typeof filePath!=='string'||filePath.length>4096||!path.win32.isAbsolute(filePath)||
      !/\.exe$/i.test(filePath)||/[\x00-\x1f\x7f]/.test(filePath)||typeof args.force!=='boolean')
    throw new Error('닫을 Windows 실행 파일(.exe)을 지정하세요.');
  const stats=await fs.promises.stat(filePath);
  if(!stats.isFile())throw new Error('대상 실행 파일이 존재하지 않습니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const encoded=Buffer.from(filePath,'utf16le').toString('base64');
  const ps=`$target=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));
$matches=@(Get-Process | Where-Object { try {[string]::Equals($_.Path,$target,[StringComparison]::OrdinalIgnoreCase)}catch{$false} });
if($matches.Count -eq 0){throw '해당 실행 파일의 실행 중인 창을 찾지 못했습니다.'};
foreach($p in $matches){
  if(${args.force?'$true':'$false'}){Stop-Process -Id $p.Id -Force -ErrorAction Stop}
  elseif(-not $p.CloseMainWindow()){throw '일반 종료 가능한 창이 없습니다.'}
}`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],
    {windowsHide:true,timeout:12000,maxBuffer:32768});
  return true;
});

// Validate a user-selected audio file before handing its file:// URL to the
// isolated renderer. Playback/stop is in the renderer, not an external player.
ipcMain.handle('d200x:audio-file-url',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  if(typeof filePath!=='string'||filePath.length>4096||!path.win32.isAbsolute(filePath)||
      /[\x00-\x1f\x7f]/.test(filePath))throw new Error('올바른 Windows 오디오 파일을 선택하세요.');
  if(!/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(filePath))throw new Error('지원하지 않는 오디오 파일 확장자입니다.');
  const stat=await fs.promises.stat(filePath);
  if(!stat.isFile())throw new Error('파일을 찾을 수 없습니다.');
  return pathToFileURL(filePath).href;
});

// Unicode typing uses SendInput/KEYEVENTF_UNICODE: no PowerShell source interpolation
// from user text (only a fixed, Base64-encoded UTF-16LE literal).
ipcMain.handle('d200x:type-text',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(typeof args?.text!=='string'||args.text.length>2048||typeof args.enter!=='boolean')
    throw new Error('텍스트 입력은 최대 2048자로 제한됩니다.');
  if(!args.text&&!args.enter)return false;
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const encoded=Buffer.from(args.text,'utf16le').toString('base64');
  const ps=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D200XUnicode {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk, wScan;
    public uint dwFlags, time;
    public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
  public static void Write(string text,bool enter) {
    foreach(char c in text) {
      INPUT[] input=new INPUT[2];
      input[0].type=1;input[0].ki.wScan=c;input[0].ki.dwFlags=4;
      input[1].type=1;input[1].ki.wScan=c;input[1].ki.dwFlags=6;
      if(SendInput(2,input,Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("SendInput failed");
    }
    if(enter){keybd_event(0x0D,0,0,UIntPtr.Zero);keybd_event(0x0D,0,2,UIntPtr.Zero);}
  }
}
'@;
$text=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));
[D200XUnicode]::Write($text,${args.enter?'$true':'$false'});`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',ps],
    {windowsHide:true,timeout:15000,maxBuffer:32768});
  return true;
});

// Original Stream Deck media keys. Never execute user-supplied code.
const MEDIA_CODES=Object.freeze({previous:0xB1,playpause:0xB3,next:0xB0,stop:0xB2,mute:0xAD,up:0xAF,down:0xAE});
function emitWindowsKeys(held,key){
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XPreviewKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XPreviewKeys]::keybd_event(${v},0,0,[UIntPtr]::Zero);`).join('\n')}
[D200XPreviewKeys]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XPreviewKeys]::keybd_event(${key},0,2,[UIntPtr]::Zero);
${held.slice().reverse().map(v=>`[D200XPreviewKeys]::keybd_event(${v},0,2,[UIntPtr]::Zero);`).join('\n')}`;
  return execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
}
ipcMain.handle('d200x:media-control',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  if(typeof args?.operation!=='string'||!Object.hasOwn(MEDIA_CODES,args.operation))throw new Error('미지원 미디어 동작');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  await emitWindowsKeys([],MEDIA_CODES[args.operation]);return true;
});
const HOTKEY_SPECIAL=Object.freeze({Enter:0x0D,Space:0x20,Tab:0x09,Escape:0x1B,Backspace:0x08,Delete:0x2E,
  Left:0x25,Up:0x26,Right:0x27,Down:0x28,Home:0x24,End:0x23,PageUp:0x21,PageDown:0x22,
  Insert:0x2D});
function parseWindowsHotkey(value){
  if(typeof value!=='string'||value.length>60)return null;
  const parts=value.split('+').map(x=>x.trim()).filter(Boolean);
  if(parts.length<1||parts.length>5)return null;
  const held=[],seen=new Set();let key=null;
  for(const part of parts){
    const mods={Ctrl:0x11,Control:0x11,Alt:0x12,Shift:0x10,Win:0x5B,Meta:0x5B};
    const mod=Object.hasOwn(mods,part)?mods[part]:null;
    if(mod){if(seen.has(mod))return null;seen.add(mod);held.push(mod);continue;}
    if(key!==null)return null;
    if(/^[A-Z]$/i.test(part))key=part.toUpperCase().charCodeAt(0);
    else if(/^[0-9]$/.test(part))key=part.charCodeAt(0);
    else if(/^F(?:[1-9]|1[0-2])$/i.test(part))key=0x6F+Number(part.slice(1));
    else key=Object.hasOwn(HOTKEY_SPECIAL,part)?HOTKEY_SPECIAL[part]:null;
    if(key===null)return null;
  }
  return key===null?null:{held,key};
}
ipcMain.handle('d200x:send-hotkey',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const parsed=parseWindowsHotkey(args?.keys);
  if(!parsed)throw new Error('지원하지 않는 단축키 형식입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  await emitWindowsKeys(parsed.held,parsed.key);return true;
});

// Fixed Win32 shortcuts; choices are validated against this closed allowlist.
const D200X_SHORTCUTS=Object.freeze({
  'screenshot':{capture:{held:[0x5B,0x10],key:0x53}},
  'clipboard-edit':{copy:{held:[0x11],key:0x43},paste:{held:[0x11],key:0x56},cut:{held:[0x11],key:0x58}},
  'window-state':{maximize:{held:[0x5B],key:0x26},minimize:{held:[0x5B],key:0x28}},
  'window-monitor':{left:{held:[0x5B,0x10],key:0x25},right:{held:[0x5B,0x10],key:0x27}},
  'explorer-open':{open:{held:[0x5B],key:0x45}},
  'brush-size':{increase:{held:[],key:0xDD},decrease:{held:[],key:0xDB}},
  'timeline-step':{next:{held:[],key:0x27},previous:{held:[],key:0x25}},
  'timeline-zoom':{in:{held:[0x11],key:0xBB},out:{held:[0x11],key:0xBD}}
});
ipcMain.handle('d200x:system-shortcut',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const group=typeof args?.target==='string'&&Object.prototype.hasOwnProperty.call(D200X_SHORTCUTS,args.target)
    ?D200X_SHORTCUTS[args.target]:null;
  const shortcut=group&&Object.prototype.hasOwnProperty.call(group,args.operation)?group[args.operation]:null;
  if(!shortcut)throw new Error('지원하지 않는 단축키입니다.');
  if(process.platform!=='win32')throw new Error('Windows에서만 지원합니다.');
  const held=shortcut.held,key=shortcut.key;
  const code=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class D200XSafeKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@;
${held.map(v=>`[D200XSafeKey]::keybd_event(${v},0,0,[UIntPtr]::Zero);`).join('\n')}
[D200XSafeKey]::keybd_event(${key},0,0,[UIntPtr]::Zero);
[D200XSafeKey]::keybd_event(${key},0,2,[UIntPtr]::Zero);
${held.slice().reverse().map(v=>`[D200XSafeKey]::keybd_event(${v},0,2,[UIntPtr]::Zero);`).join('\n')}`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',code],
    {windowsHide:true,timeout:6000,maxBuffer:32768});
  return true;
});

ipcMain.handle('d200x:open-local-path',async(event,args)=>{
  if(!window||event.sender!==window.webContents)throw new Error('허용되지 않은 호출입니다.');
  const filePath=args?.filePath;
  if(!['file','folder','auto'].includes(args?.target)||typeof filePath!=='string'||
      !path.win32.isAbsolute(filePath)||filePath.length>4096||/[\x00-\x1f\x7f]/.test(filePath))
    throw new Error('올바른 Windows 파일/폴더 경로를 선택하세요.');
  const stat=await fs.promises.stat(filePath);
  if(args.target==='file'&&!stat.isFile()||args.target==='folder'&&!stat.isDirectory())
    throw new Error('선택한 파일/폴더 유형이 일치하지 않습니다.');
  const error=await shell.openPath(filePath);
  if(error)throw new Error(error);
  return true;
});

// Local clipboard image only; never reads arbitrary files or executes clipboard content.
ipcMain.handle('d200x:clipboard-image', async event => {
  if (!window || event.sender !== window.webContents) return null;
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const png = image.resize({width:196,height:196,quality:'best'}).toPNG();
  if (png.length > 1024*1024) throw new Error('클립보드 이미지가 너무 큽니다.');
  return 'data:image/png;base64,' + png.toString('base64');
});

// Explicit user gesture only. Return a selected path; never open or execute it.
ipcMain.handle('d200x:choose-path', async (event, kind) => {
  if (!window || event.sender !== window.webContents) return null;
  if (!['file','folder','app'].includes(kind)) throw new Error('지원하지 않는 선택 유형');
  const properties = kind === 'folder' ? ['openDirectory'] : ['openFile'];
  const result = await dialog.showOpenDialog(window, {
    title: kind === 'folder' ? '폴더 선택' : kind === 'app' ? '프로그램 선택' : '파일 선택',
    properties,
    ...(kind === 'app' ? {filters:[{name:'응용 프로그램',extensions:['exe','lnk','bat','cmd']},{name:'모든 파일',extensions:['*']}]} : {}),
  });
  return result.canceled ? null : (result.filePaths[0] || null);
});

// Read only the foreground process executable; never execute profile-provided
// values or return other window text. Smart Profiles require a minimized editor.
ipcMain.handle('d200x:foreground-app',async event=>{
  if(!window||event.sender!==window.webContents||!window.isMinimized()||process.platform!=='win32')
    return null;
  const script=String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class D200XFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@ -ErrorAction Stop
$handle=[D200XFocus]::GetForegroundWindow()
[uint32]$targetPid=0
[void][D200XFocus]::GetWindowThreadProcessId($handle,[ref]$targetPid)
if($targetPid -gt 0){try{(Get-Process -Id $targetPid -ErrorAction Stop).Path}catch{''}}
`;
  try{
    const result=await execFileAsync('powershell.exe',
      ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],
      {windowsHide:true,timeout:3500,maxBuffer:4096});
    const value=String(result.stdout||'').trim();
    return /^[A-Za-z]:/.test(value)&&value.charCodeAt(2)===92&&value.toLowerCase().endsWith('.exe')
      ?value:null;
  }catch{return null;}
});

app.whenReady().then(async () => {
  diagnosticPath = path.join(app.getPath('userData'), 'd200x-connection.log');
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 630,
    backgroundColor: '#292929',
    title: 'D200X StreamDeck — Device Sync Preview',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  await window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  window.on('closed', () => { rendererReady = false; window = null; app.quit(); });
  transport.start().catch(err => send('d200x:error', String(err)));
});
app.on('before-quit', () => transport.stop());
app.on('window-all-closed', () => app.quit());
