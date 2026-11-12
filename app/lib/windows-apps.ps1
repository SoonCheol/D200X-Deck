# Read-only Windows application integration for D200X-Deck.
# Neither mode modifies Start Menu entries or running processes.
param([Parameter(Mandatory=$true)][ValidateSet('list','frontmost')][string]$Mode)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'frontmost') {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeckForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@
  $hwnd = [DeckForeground]::GetForegroundWindow()
  $processIdValue = [uint32]0
  [void][DeckForeground]::GetWindowThreadProcessId($hwnd, [ref]$processIdValue)
  if ($processIdValue -eq 0) { Write-Output 'null'; exit 0 }
  try {
    $proc = [System.Diagnostics.Process]::GetProcessById([int]$processIdValue)
    $exe = ''
    try { $exe = $proc.MainModule.FileName } catch {}
    [pscustomobject]@{
      bundleId = ''
      name = $proc.ProcessName
      path = $exe
    } | ConvertTo-Json -Compress
  } catch {
    Write-Output 'null'
  }
  exit 0
}
$roots = @(
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$seen = @{}
$items = New-Object 'System.Collections.Generic.List[object]'
$shell = New-Object -ComObject WScript.Shell
foreach ($root in $roots) {
  $shortcuts = @(Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1500)
  foreach ($file in $shortcuts) {
    try {
      $shortcut = $shell.CreateShortcut($file.FullName)
      $target = [string]$shortcut.TargetPath
      if (-not $target -or -not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
      if (-not $target.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { continue }
      if ($seen.ContainsKey($target.ToLowerInvariant())) { continue }
      $seen[$target.ToLowerInvariant()] = $true
      $items.Add([pscustomobject]@{ name = $file.BaseName; path = $target })
    } catch {}
  }
}
@($items | Sort-Object name) | ConvertTo-Json -Compress -Depth 3
