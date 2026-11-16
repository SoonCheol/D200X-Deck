# Installer-only helper. Existing add-in folders and all user preferences remain untouched.
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:APPDATA 'Autodesk\Autodesk Fusion 360\API\AddIns'
$source = Join-Path $PSScriptRoot 'FusionStreamDeck'
$destination = Join-Path $base 'FusionStreamDeck'
if (-not (Test-Path -LiteralPath $base -PathType Container)) { exit 0 }
if (Test-Path -LiteralPath $destination) { exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $source 'FusionStreamDeck.py'))) { exit 1 }
Copy-Item -LiteralPath $source -Destination $destination -Recurse -ErrorAction Stop
exit 0
