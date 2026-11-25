# Windows PowerShell 5.1 / STA. Input is data only, never an interpolated command.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$details=New-Object 'System.Collections.Generic.List[string]'
function Note([string]$message) {if($details.Count -lt 160){$details.Add($message)}}
function Result([string]$status,[string]$reason='') {
  [Console]::Write((@{status=$status;reason=$reason;mode=$env:DECKFORGE_FOLDER_MODE;details=$details.ToArray()}|ConvertTo-Json -Depth 5 -Compress))
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
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll",SetLastError=true)] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg,IntPtr hwnd,uint min,uint max,uint remove);
  [StructLayout(LayoutKind.Sequential)] struct MSG {public IntPtr hwnd;public uint msg;public UIntPtr w;public IntPtr l;public uint time;public int x,y;public uint priv;}
  public static string[] AttachedFocus(IntPtr target) {
    MSG msg;PeekMessage(out msg,IntPtr.Zero,0,0,0);
    uint pid;uint current=GetCurrentThreadId();uint other=GetWindowThreadProcessId(GetForegroundWindow(),out pid);
    bool attached=false,top=false,focus=false,detached=true;int error=0;
    try {
      if(other!=0&&other!=current){attached=AttachThreadInput(current,other,true);if(!attached)error=Marshal.GetLastWin32Error();}
      if(IsWindow(target)){top=BringWindowToTop(target);focus=SetForegroundWindow(target);}
    } finally {if(attached)detached=AttachThreadInput(current,other,false);}
    return new[]{"attached="+attached,"attachError="+error,"bringToTop="+top,"setForeground="+focus,"detached="+detached};
  }
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
  function Browser-Match($browser,[string]$target){
    $folder='';$urlPath=''
    try{$folder=[string]$browser.Document.Folder.Self.Path}catch{Note ('path-error='+$_.Exception.GetType().Name)}
    try{$uri=[Uri]([string]$browser.LocationURL);if($uri.IsFile){$urlPath=$uri.LocalPath}}catch{}
    # Do not accept a stale URL when an actual filesystem path disagrees.
    if($null -ne (Normalize-Folder $folder)){return (Same-Folder $folder $target)}
    return (Same-Folder $urlPath $target)
  }
  function Get-ExplorerRows([string]$target){
    $shell=New-Object -ComObject Shell.Application
    $windows=$shell.Windows()
    for($i=0;$i -lt $windows.Count;$i++){
      try{
        $browser=$windows.Item($i)
        if($null -eq $browser){continue}
        $frame=[IntPtr]([long]$browser.HWND)
        if([DFFolderNative]::ClassName($frame) -ne 'CabinetWClass'){continue}
        $match=Browser-Match $browser $target
        $tab=[IntPtr]::Zero
        try{$tab=[DFFolderNative]::TabHandle($browser)}catch{Note ('tab-error='+$_.Exception.GetType().Name)}
        $active=[DFFolderNative]::ActiveTab($frame)
        [PSCustomObject]@{Browser=$browser;Frame=$frame;Tab=$tab;Match=$match;Active=($active -eq [IntPtr]::Zero -or ($tab -ne [IntPtr]::Zero -and $active -eq $tab));Foreground=([DFFolderNative]::GetForegroundWindow() -eq $frame)}
      }catch{Note ('enumeration-error='+$_.Exception.GetType().Name)}
    }
  }
  function Wait-Foreground([IntPtr]$frame){
    for($wait=0;$wait -lt 10 -and [DFFolderNative]::GetForegroundWindow() -ne $frame;$wait++){Start-Sleep -Milliseconds 30}
    return ([DFFolderNative]::GetForegroundWindow() -eq $frame)
  }
  $mode=$env:DECKFORGE_FOLDER_MODE
  if($mode -eq 'Validate'){
    if(!(Same-Folder 'C:\' 'c:/') -or !(Same-Folder '\\server\share\folder\' '\\SERVER\SHARE\folder') -or (Same-Folder 'C:\a' 'C:\ab') -or (Same-Folder 'C:\a' 'a')) {throw 'Folder path comparison test failed'}
    Result 'validated';return
  }
  $target=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:DECKFORGE_FOLDER_TARGET))
  if($null -eq (Normalize-Folder $target)){throw 'Invalid absolute folder path'}
  if($mode -notin @('New','Focus')){throw 'Invalid folder mode'}
  $rows=@(Get-ExplorerRows $target)
  Note ("beforeForeground="+[DFFolderNative]::GetForegroundWindow().ToInt64())
  foreach($row in $rows){Note ("before frame="+$row.Frame.ToInt64()+" tab="+$row.Tab.ToInt64()+" match="+$row.Match+" active="+$row.Active+" foreground="+$row.Foreground)}
  if($mode -eq 'New'){
    # Compare against every frame, not only matches: switching an old window is not new.
    $before=@($rows|ForEach-Object {$_.Frame.ToInt64()}|Select-Object -Unique)
    $result=[DFFolderNative]::ShellExecute([IntPtr]::Zero,'opennewwindow',$target,$null,$null,1)
    Note ("ShellExecute="+$result.ToInt64())
    if($result.ToInt64() -le 32){
      # Fallback only on explicit rejection; avoid double-opening after an accepted request.
      $explorer=Join-Path $env:SystemRoot 'explorer.exe'
      $argument=$target
      if($argument -match '[\s,]'){
        # Preserve a trailing separator inside a quoted Windows argument.
        $argument='"'+($argument -replace '(\\+)$','$1$1')+'"'
      }
      Start-Process -FilePath $explorer -ArgumentList ('/n,'+$argument)
      Note 'explorer.exe /n requested'
    }
    for($attempt=0;$attempt -lt 16;$attempt++){
      Start-Sleep -Milliseconds 250
      $fresh=@(Get-ExplorerRows $target|Where-Object {$_.Match -and $_.Frame.ToInt64() -notin $before})
      if($fresh.Count -gt 0){foreach($row in $fresh){Note ("newMatchingFrame="+$row.Frame.ToInt64()+" foreground="+$row.Foreground)};Result 'opened';return}
    }
    Result 'new-not-confirmed' 'No new matching Explorer frame observed after request';return
  }
  $matching=@($rows|Where-Object {$_.Match})
  if($matching.Count -eq 0){Note 'no matching Explorer folder';Result 'missing';return}
  foreach($match in ($matching|Sort-Object -Property @{Expression={$_.Active -and $_.Foreground};Descending=$true},@{Expression={$_.Active};Descending=$true})){
    try{
      $frame=$match.Frame
      if(![DFFolderNative]::IsWindow($frame) -or !(Browser-Match $match.Browser $target)){Note 'candidate vanished or changed';continue}
      $active=[DFFolderNative]::ActiveTab($frame)
      Note ("selectedFrame="+$frame.ToInt64()+" selectedTab="+$match.Tab.ToInt64()+" activeTab="+$active.ToInt64())
      if($active -ne [IntPtr]::Zero -and ($match.Tab -eq [IntPtr]::Zero -or [DFFolderNative]::ClassName($match.Tab) -ne 'ShellTabWindowClass')){Note 'tab identity unavailable';continue}
      if([DFFolderNative]::IsIconic($frame)){
        Note ("restore="+[DFFolderNative]::ShowWindowAsync($frame,9))
        for($wait=0;$wait -lt 15 -and [DFFolderNative]::IsIconic($frame);$wait++){Start-Sleep -Milliseconds 40}
        if([DFFolderNative]::IsIconic($frame)){Note 'restore not confirmed';continue}
      }
      if($active -ne [IntPtr]::Zero -and [DFFolderNative]::ActiveTab($frame) -ne $match.Tab){
        $count=[Math]::Min(32,[DFFolderNative]::TabCount($frame))
        for($index=1;$index -le $count;$index++){
          if(!(Browser-Match $match.Browser $target)){break}
          $selected=[DFFolderNative]::SelectIndex($frame,$index)
          Note ("tabIndex"+$index+"="+$selected)
          if(!$selected){break}
          for($wait=0;$wait -lt 5 -and [DFFolderNative]::ActiveTab($frame) -ne $match.Tab;$wait++){Start-Sleep -Milliseconds 50}
          if([DFFolderNative]::ActiveTab($frame) -eq $match.Tab){break}
        }
        if([DFFolderNative]::ActiveTab($frame) -ne $match.Tab){Note 'tab selection not confirmed';continue}
      }
      if(!(Browser-Match $match.Browser $target)){continue}
      if([DFFolderNative]::GetForegroundWindow() -ne $frame){Note ("setForeground="+[DFFolderNative]::SetForegroundWindow($frame))}
      if(!(Wait-Foreground $frame)){
        if(!(Browser-Match $match.Browser $target) -or ($active -ne [IntPtr]::Zero -and [DFFolderNative]::ActiveTab($frame) -ne $match.Tab)){continue}
        foreach($detail in [DFFolderNative]::AttachedFocus($frame)){Note $detail}
        [void](Wait-Foreground $frame)
      }
      Note ("afterForeground="+[DFFolderNative]::GetForegroundWindow().ToInt64())
      if([DFFolderNative]::GetForegroundWindow() -eq $frame -and ![DFFolderNative]::IsIconic($frame) -and (Browser-Match $match.Browser $target) -and ($active -eq [IntPtr]::Zero -or [DFFolderNative]::ActiveTab($frame) -eq $match.Tab)){
        Result 'focused';return
      }
    }catch{Note ('candidate-error='+$_.Exception.Message)}
  }
  Result 'matched-not-focused'
}catch{Result 'error' $_.Exception.Message}
