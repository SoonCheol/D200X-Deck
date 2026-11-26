param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$sourcePath=(Resolve-Path -LiteralPath $Source).Path
$image=[System.Drawing.Image]::FromFile($sourcePath)
try {
 if($image.Width -ne $image.Height -or $image.Width -lt 128){throw 'Invalid approved application icon'}
 $frames=@()
 foreach($size in @(16,20,24,32,48,64,128,256)){
  $bitmap=[System.Drawing.Bitmap]::new($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
   $g=[System.Drawing.Graphics]::FromImage($bitmap)
   try{$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality;$g.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy;$g.DrawImage($image,0,0,$size,$size)}finally{$g.Dispose()}
   $memory=[System.IO.MemoryStream]::new()
   try{$bitmap.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png);$bytes=$memory.ToArray()}finally{$memory.Dispose()}
   $frames+=@{size=$size;bytes=$bytes}
   if($size -eq 256){[System.IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'app-icon.png'),$bytes)}
  }finally{$bitmap.Dispose()}
 }
 $writer=[System.IO.BinaryWriter]::new([System.IO.File]::Create((Join-Path $OutputDirectory 'app-icon.ico')))
 try {
  $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$frames.Count)
  $offset=6+16*$frames.Count
  foreach($frame in $frames){
   $dim=[byte]($frame.size%256)
   $writer.Write($dim);$writer.Write($dim);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32)
   $writer.Write([uint32]$frame.bytes.Length);$writer.Write([uint32]$offset);$offset+=$frame.bytes.Length
  }
  foreach($frame in $frames){$writer.Write([byte[]]$frame.bytes)}
 }finally{$writer.Dispose()}
}finally{$image.Dispose()}
