$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$trace = $env:DECKFORGE_CONTROL_TRACE
$mode = $env:DECKFORGE_CONTROL_MODE
$kind = $env:DECKFORGE_CONTROL_KIND
$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:DECKFORGE_CONTROL_TARGET))
$steps = New-Object 'System.Collections.Generic.List[object]'
$matched = @{}
$selected = @()
$paths = @()
$links = @()
$success = $false
$remaining = @()
function Record($stage, $pidValue, $reason, $detail) {
  $steps.Add([pscustomobject]@{stage=$stage;pid=$pidValue;reason=$reason;detail=$detail})
}
function Result {
  $result = [ordered]@{traceId=$trace;mode=$mode;kind=$kind;psVersion=$PSVersionTable.PSVersion.ToString();
    links=$links;shortcutTargets=$paths;matched=$matched.Count;selected=@($selected | ForEach-Object {[int]$_.C.ProcessId});
    steps=$steps;remaining=$remaining;found=$success}
  [Console]::Write(($result | ConvertTo-Json -Depth 8 -Compress))
}
try {
  if ($mode -notin @('Close','Force') -or $kind -notin @('AppID','EXE')) { throw 'Invalid control request' }
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct DFKey { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit,Size=24)] public struct DFVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr ptr; }
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface DFStore { [PreserveSig]int GetCount(out uint count); [PreserveSig]int GetAt(uint index,out DFKey key); [PreserveSig]int GetValue(ref DFKey key,out DFVariant value); }
public static class DFControl113 {
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder id);
 [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd,ref Guid iid,out DFStore store);
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref DFVariant value);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 public static string ProcessId(int pid) {
  IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)return "";
  try { uint n=0;if(GetApplicationUserModelId(h,ref n,null)!=122||n==0)return "";
   StringBuilder b=new StringBuilder((int)n);return GetApplicationUserModelId(h,ref n,b)==0?b.ToString():"";
  } finally {CloseHandle(h);}
 }
 public static string WindowId(IntPtr hwnd) {
  if(hwnd==IntPtr.Zero)return "";
  Guid iid=typeof(DFStore).GUID;DFStore store;
  if(SHGetPropertyStoreForWindow(hwnd,ref iid,out store)!=0)return "";
  try {DFKey key=new DFKey{fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),pid=5};DFVariant v;
   if(store.GetValue(ref key,out v)!=0)return "";
   try{return v.vt==31?Marshal.PtrToStringUni(v.ptr):"";}finally{PropVariantClear(ref v);}
  }finally{Marshal.ReleaseComObject(store);}
 }
}
'@
  $wsh = New-Object -ComObject WScript.Shell
  if ($kind -eq 'AppID') {
    $shell = New-Object -ComObject Shell.Application
    $roots = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
    foreach ($lnk in Get-ChildItem $roots -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue) {
      try {
        $item = $shell.NameSpace($lnk.DirectoryName).ParseName($lnk.Name)
        if ([string]::Equals($item.ExtendedProperty('System.AppUserModel.ID'),$target,[StringComparison]::OrdinalIgnoreCase)) {
          $links += $lnk.FullName
          $path = $wsh.CreateShortcut($lnk.FullName).TargetPath
          if ($path -match '\.exe$') { $paths += $path }
          Record 'shortcut' 0 'appid-match' $lnk.FullName
        }
      } catch { Record 'shortcut-error' 0 $_.Exception.GetType().Name $lnk.FullName }
    }
  }
  $session = (Get-Process -Id $PID).SessionId
  $all = @(Get-CimInstance Win32_Process -Filter "SessionId=$session")
  foreach ($c in $all) {
    try {
      $p = Get-Process -Id $c.ProcessId -ErrorAction Stop
      $reason = ''
      if ($kind -eq 'EXE') {
        if ($c.ExecutablePath -and [string]::Equals($c.ExecutablePath,$target,[StringComparison]::OrdinalIgnoreCase)) {$reason='exe-path'}
        if (!$reason) {try {if ([string]::Equals($p.Path,$target,[StringComparison]::OrdinalIgnoreCase)) {$reason='process-path'}} catch {}}
      } else {
        if ($c.ExecutablePath -and $c.ExecutablePath -in $paths) {$reason='shortcut-exe'}
        try {if ([DFControl113]::ProcessId($p.Id) -eq $target) {$reason='process-appid'}}
        catch {Record 'match-error' $p.Id $_.Exception.GetType().Name 'process-appid'}
        if (!$reason) {
          try {if ([DFControl113]::WindowId($p.MainWindowHandle) -eq $target) {$reason='window-appid'}}
          catch {Record 'match-error' $p.Id $_.Exception.GetType().Name 'window-appid'}
        }
      }
      if ($reason) {
        $matched[[int]$c.ProcessId] = [pscustomobject]@{C=$c;Direct=$true;Start=$p.StartTime.ToUniversalTime().Ticks;Reason=$reason}
        Record 'matched' $p.Id $reason $c.ExecutablePath
      }
    } catch { Record 'snapshot-error' $c.ProcessId $_.Exception.GetType().Name '' }
  }
  if ($kind -eq 'AppID') {
    do {
      $changed=$false
      foreach ($c in $all) {
        $key=[int]$c.ProcessId;$parent=[int]$c.ParentProcessId
        if (!$matched.ContainsKey($key) -and $matched.ContainsKey($parent) -and $c.CreationDate -ge $matched[$parent].C.CreationDate) {
          try {
            $child=Get-Process -Id $key -ErrorAction Stop
            $matched[$key]=[pscustomobject]@{C=$c;Direct=$false;Start=$child.StartTime.ToUniversalTime().Ticks;Reason='child-of-'+$parent}
            Record 'matched' $key ('child-of-'+$parent) $c.ExecutablePath
            $changed=$true
          } catch {Record 'child-error' $key $_.Exception.GetType().Name ''}
        }
      }
    } while ($changed)
  }
  # Keep the helper, editor, and their ancestors outside the target set.
  $excluded=@{};$cursor=[int]$PID
  while ($cursor -gt 0 -and !$excluded.ContainsKey($cursor)) {
    $excluded[$cursor]=$true
    $ancestor=$all | Where-Object {$_.ProcessId -eq $cursor} | Select-Object -First 1
    if (!$ancestor) {break};$cursor=[int]$ancestor.ParentProcessId
  }
  foreach ($entry in $matched.Values) {
    $c=$entry.C;$id=[int]$c.ProcessId
    if ($excluded.ContainsKey($id)) {Record 'excluded' $id 'control-ancestor' '';continue}
    try {
      $p=Get-Process -Id $id -ErrorAction Stop
      if ($p.StartTime.ToUniversalTime().Ticks -ne $entry.Start) {Record 'excluded' $id 'start-time-changed' '';continue}
      $fresh=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction Stop
      if (!$fresh -or $fresh.CreationDate -ne $c.CreationDate) {Record 'excluded' $id 'creation-time-changed' '';continue}
      if ($mode -eq 'Close' -and $p.MainWindowHandle -eq 0) {Record 'excluded' $id 'no-main-window' '';continue}
      if ($mode -eq 'Force' -and !$entry.Direct -and $p.MainWindowHandle -eq 0) {Record 'excluded' $id 'windowless-child' '';continue}
      $selected += $entry
      Record 'selected' $id $entry.Reason $c.ExecutablePath
    } catch {Record 'excluded' $id $_.Exception.GetType().Name 'revalidation'}
  }
  foreach ($entry in $selected) {
    $id=[int]$entry.C.ProcessId
    try {
      $p=Get-Process -Id $id -ErrorAction Stop
      if ($p.StartTime.ToUniversalTime().Ticks -ne $entry.Start) {Record 'skipped' $id 'start-time-changed' '';continue}
      $fresh=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction Stop
      if (!$fresh -or $fresh.CreationDate -ne $entry.C.CreationDate) {Record 'skipped' $id 'creation-time-changed' '';continue}
      if ($mode -eq 'Force') {
        try {Stop-Process -InputObject $p -Force -ErrorAction Stop;Record 'api' $id 'Stop-Process -Force' 'requested';[void]$p.WaitForExit(2000)}
        catch {if (!$p.HasExited) {throw};Record 'api' $id 'Stop-Process -Force' 'already-exited'}
      } else {
        $hwnd=$p.MainWindowHandle
        if ($hwnd -eq 0) {Record 'skipped' $id 'no-main-window' '';continue}
        if ([DFControl113]::IsIconic($hwnd)) {Record 'api' $id 'ShowWindowAsync-restore' ([DFControl113]::ShowWindowAsync($hwnd,9))}
        $foreground=[DFControl113]::SetForegroundWindow($hwnd)
        Record 'api' $id 'SetForegroundWindow' $foreground
        if (!$foreground) {
          try {Record 'api' $id 'AppActivate' ($wsh.AppActivate($id))}
          catch {Record 'api-error' $id 'AppActivate' $_.Exception.GetType().Name}
        }
        $closed=$p.CloseMainWindow()
        Record 'api' $id 'CloseMainWindow' $closed
        if ($closed) {$success=$true}
      }
    } catch {Record 'api-error' $id $_.Exception.GetType().Name $_.Exception.Message}
  }
  if ($mode -eq 'Force') {
    foreach ($entry in $selected) {
      $id=[int]$entry.C.ProcessId
      try {
        $live=Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($live -and $live.StartTime.ToUniversalTime().Ticks -eq $entry.Start) {$remaining += $id}
      } catch {Record 'verify-error' $id $_.Exception.GetType().Name '';$remaining += $id}
    }
    $success=($selected.Count -gt 0 -and $remaining.Count -eq 0)
  } else {
    # A normal close is asynchronous; this is a snapshot, not its success test.
    foreach ($entry in $selected) {
      $id=[int]$entry.C.ProcessId
      try {
        $live=Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($live -and $live.StartTime.ToUniversalTime().Ticks -eq $entry.Start) {$remaining += $id}
      } catch {Record 'verify-error' $id $_.Exception.GetType().Name ''}
    }
  }
} catch {Record 'fatal' 0 $_.Exception.GetType().Name $_.Exception.Message}
Result
