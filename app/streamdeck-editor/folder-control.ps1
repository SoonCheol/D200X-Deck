# Windows PowerShell 5.1 / STA. Input is data only, never an interpolated command.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
function Result([string]$status,[string]$reason='') {
  [Console]::Write((@{status=$status;reason=$reason}|ConvertTo-Json -Compress))
}
function Normalize-Folder([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value) -or $value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') {return $null}
  try {return [IO.Path]::GetFullPath($value).TrimEnd([char]'\',[char]'/')} catch {return $null}
}
function Same-Folder([string]$a,[string]$b) {
  $left=Normalize-Folder $a
  $right=Normalize-Folder $b
  return ($null -ne $left -and $null -ne $right -and [string]::Equals($left,$right,[StringComparison]::OrdinalIgnoreCase))
}
try {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface DFFolderService {
  [PreserveSig] int QueryService(ref Guid service,ref Guid iid,out IntPtr result);
}
[ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface DFFolderBrowser {
  [PreserveSig] int GetWindow(out IntPtr hwnd);
  [PreserveSig] int ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool enter);
}
public static class DFFolderNative {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after,string cls,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int length);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr ShellExecute(IntPtr hwnd,string verb,string file,string args,string directory,int show);
  public static string ClassName(IntPtr hwnd) {
    var name=new StringBuilder(256);GetClassName(hwnd,name,name.Capacity);return name.ToString();
  }
  public static IntPtr TabHandle(object browser) {
    var service=typeof(DFFolderBrowser).GUID;var iid=service;IntPtr ptr;
    var provider=browser as DFFolderService;
    if(provider==null||provider.QueryService(ref service,ref iid,out ptr)!=0||ptr==IntPtr.Zero)return IntPtr.Zero;
    try {
      var view=(DFFolderBrowser)Marshal.GetObjectForIUnknown(ptr);
      try {IntPtr hwnd;return view.GetWindow(out hwnd)==0?hwnd:IntPtr.Zero;}
      finally {Marshal.ReleaseComObject(view);}
    } finally {Marshal.Release(ptr);}
  }
  public static IntPtr ActiveTab(IntPtr frame) {
    return FindWindowEx(frame,IntPtr.Zero,"ShellTabWindowClass",null);
  }
  public static int TabCount(IntPtr frame) {
    int count=0;IntPtr tab=IntPtr.Zero;
    while(count<64&&(tab=FindWindowEx(frame,tab,"ShellTabWindowClass",null))!=IntPtr.Zero)count++;
    return count;
  }
  // Explorer's undocumented tab-index command; never assume child z-order equals tab order.
  public static bool SelectIndex(IntPtr frame,int index) {
    IntPtr ignored;
    return SendMessageTimeout(frame,0x111,(IntPtr)0xA221,(IntPtr)index,2,250,out ignored)!=IntPtr.Zero;
  }
}
'@
  $mode=$env:DECKFORGE_FOLDER_MODE
  if($mode -eq 'Validate'){
    if(!(Same-Folder 'C:\' 'c:/') -or !(Same-Folder '\\server\share\folder\' '\\SERVER\SHARE\folder') -or (Same-Folder 'C:\a' 'C:\ab') -or (Same-Folder 'C:\a' 'a')) {throw 'Folder path comparison test failed'}
    Result 'validated';return
  }
  $target=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:DECKFORGE_FOLDER_TARGET))
  if($null -eq (Normalize-Folder $target)){throw 'Invalid absolute folder path'}
  if($mode -eq 'New'){
    $result=[DFFolderNative]::ShellExecute([IntPtr]::Zero,'opennewwindow',$target,$null,$null,1)
    if($result.ToInt64() -le 32){throw ('opennewwindow failed: '+$result.ToInt64())}
    Result 'opened';return
  }
  if($mode -ne 'Focus'){throw 'Invalid folder mode'}
  $shell=New-Object -ComObject Shell.Application
  $windows=$shell.Windows()
  $matches=@()
  $unknown=$false
  for($i=0;$i -lt $windows.Count;$i++){
    try{
      $browser=$windows.Item($i)
      if($null -eq $browser){continue}
      $frame=[IntPtr]([long]$browser.HWND)
      if([DFFolderNative]::ClassName($frame) -ne 'CabinetWClass'){continue}
      if([IO.Path]::GetFileName([string]$browser.FullName) -ine 'explorer.exe'){continue}
      $folder=[string]$browser.Document.Folder.Self.Path
      if(!(Same-Folder $folder $target)){continue}
      $tab=[IntPtr]::Zero
      try{$tab=[DFFolderNative]::TabHandle($browser)}catch{}
      $active=[DFFolderNative]::ActiveTab($frame)
      $matches+= [PSCustomObject]@{Browser=$browser;Frame=$frame;Tab=$tab;Active=($active -eq [IntPtr]::Zero -or ($tab -ne [IntPtr]::Zero -and $active -eq $tab));Foreground=([DFFolderNative]::GetForegroundWindow() -eq $frame)}
    }catch{$unknown=$true}
  }
  if($matches.Count -eq 0){
    # No proven match: preserve previous normal path opening behavior.
    Result 'missing';return
  }
  foreach($match in ($matches|Sort-Object -Property @{Expression={$_.Active -and $_.Foreground};Descending=$true},@{Expression={$_.Active};Descending=$true})){
    try{
      $frame=$match.Frame
      if(![DFFolderNative]::IsWindow($frame) -or !(Same-Folder ([string]$match.Browser.Document.Folder.Self.Path) $target)){continue}
      $active=[DFFolderNative]::ActiveTab($frame)
      if($active -ne [IntPtr]::Zero){
        if($match.Tab -eq [IntPtr]::Zero -or [DFFolderNative]::GetParent($match.Tab) -ne $frame -or [DFFolderNative]::ClassName($match.Tab) -ne 'ShellTabWindowClass'){continue}
      }
      if([DFFolderNative]::IsIconic($frame)){
        [void][DFFolderNative]::ShowWindowAsync($frame,9)
        for($wait=0;$wait -lt 15 -and [DFFolderNative]::IsIconic($frame);$wait++){Start-Sleep -Milliseconds 40}
        if([DFFolderNative]::IsIconic($frame)){continue}
      }
      if($active -ne [IntPtr]::Zero -and [DFFolderNative]::ActiveTab($frame) -ne $match.Tab){
        $count=[Math]::Min(32,[DFFolderNative]::TabCount($frame))
        for($index=1;$index -le $count;$index++){
          if(![DFFolderNative]::SelectIndex($frame,$index)){break}
          for($wait=0;$wait -lt 5 -and [DFFolderNative]::ActiveTab($frame) -ne $match.Tab;$wait++){Start-Sleep -Milliseconds 40}
          if([DFFolderNative]::ActiveTab($frame) -eq $match.Tab){break}
        }
        if([DFFolderNative]::ActiveTab($frame) -ne $match.Tab){continue}
      }
      if(!(Same-Folder ([string]$match.Browser.Document.Folder.Self.Path) $target)){continue}
      if([DFFolderNative]::GetForegroundWindow() -ne $frame){[void][DFFolderNative]::SetForegroundWindow($frame)}
      for($wait=0;$wait -lt 10 -and [DFFolderNative]::GetForegroundWindow() -ne $frame;$wait++){Start-Sleep -Milliseconds 30}
      if([DFFolderNative]::GetForegroundWindow() -eq $frame -and (Same-Folder ([string]$match.Browser.Document.Folder.Self.Path) $target) -and ($active -eq [IntPtr]::Zero -or [DFFolderNative]::ActiveTab($frame) -eq $match.Tab)){
        Result 'focused';return
      }
    }catch{}
  }
  Result 'matched-not-focused'
}catch{Result 'error' $_.Exception.Message}
