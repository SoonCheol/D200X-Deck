# Produces a local icon from the user-approved compact Fusion Manager preview.
# Source is a base64-encoded JPEG in the repository because the GitHub connector
# can only write UTF-8 text. The original full-resolution preview stays unchanged.
param(
 [Parameter(Mandatory=$true)][string]$Source,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$raw=([System.IO.File]::ReadAllText($Source)).Trim()
if ($raw.Length -lt 1000 -or $raw.Length % 4 -ne 0) { throw 'Approved manager icon payload is incomplete.' }
$bytes=[Convert]::FromBase64String($raw)
$stream=[System.IO.MemoryStream]::new($bytes)
$image=$null
try {
 $image=[System.Drawing.Image]::FromStream($stream,$true,$true)
 if($image.Width -lt 64 -or $image.Height -lt 64) { throw 'Manager preview source too small' }
 $icon=[System.Drawing.Bitmap]::new(256,256)
 try {
  $gfx=[System.Drawing.Graphics]::FromImage($icon)
  try{
   $gfx.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
   $gfx.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality
   $gfx.DrawImage($image,0,0,256,256)
  }finally{$gfx.Dispose()}
  $png=Join-Path $OutputDirectory 'fusion-manager-icon.png'
  $icon.Save($png,[System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes=[System.IO.File]::ReadAllBytes($png)
  # Single 256x256 PNG-compressed Windows ICO entry.
  $ico=Join-Path $OutputDirectory 'fusion-manager-icon.ico'
  $out=[System.IO.File]::Create($ico)
  $writer=[System.IO.BinaryWriter]::new($out)
  try{
   $writer.Write([uint16]0)
   $writer.Write([uint16]1)
   $writer.Write([uint16]1)
   $writer.Write([byte]0)
   $writer.Write([byte]0)
   $writer.Write([byte]0)
   $writer.Write([byte]0)
   $writer.Write([uint16]1)
   $writer.Write([uint16]32)
   $writer.Write([uint32]$pngBytes.Length)
   $writer.Write([uint32]22)
   $writer.Write($pngBytes)
  }finally{$writer.Dispose()}
 }finally{$icon.Dispose()}
}finally{if($image){$image.Dispose()};$stream.Dispose()}
Write-Host "Verified approved Fusion Manager icon: $png"
