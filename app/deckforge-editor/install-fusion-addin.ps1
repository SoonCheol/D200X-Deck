# Installer-only helper. Preserve existing add-ins and do not guess an ambiguous target.
$ErrorActionPreference = 'Stop'
$bases = @('Autodesk\Autodesk Fusion 360\API\AddIns','Autodesk\Autodesk Fusion\API\AddIns') | ForEach-Object { Join-Path $env:APPDATA $_ }
$source = Join-Path $PSScriptRoot 'FusionStreamDeck'
$existing = @($bases | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'FusionStreamDeck') })
if ($existing.Count -gt 0) { exit 0 }
$ready = @($bases | Where-Object { Test-Path -LiteralPath $_ -PathType Container })
if ($ready.Count -ne 1) { exit 0 }
$destination = Join-Path $ready[0] 'FusionStreamDeck'
if (-not (Test-Path -LiteralPath (Join-Path $source 'FusionStreamDeck.py'))) { exit 1 }
if (-not (Test-Path -LiteralPath (Join-Path $source 'FusionStreamDeck.manifest'))) { exit 1 }
Copy-Item -LiteralPath $source -Destination $destination -Recurse -ErrorAction Stop
exit 0
