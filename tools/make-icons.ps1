# 앱 아이콘 생성. powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) "icons"
New-Item -ItemType Directory -Force $out | Out-Null

function Draw-Icon([int]$size, [double]$scale, [string]$file, [bool]$badge = $false) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"; $g.InterpolationMode = "HighQualityBicubic"
  $white = [System.Drawing.Color]::White
  if (-not $badge) { $g.Clear([System.Drawing.Color]::FromArgb(14, 107, 116)) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $s = $size * $scale; $o = ($size - $s) / 2
  # 달력 한 장: 위쪽 띠 + 고리 두 개 + 가운데 "D"
  $pen = New-Object System.Drawing.Pen $white, ([float]($s * 0.05))
  $rx = $o + $s * 0.18; $ry = $o + $s * 0.24; $rw = $s * 0.64; $rh = $s * 0.58
  $g.DrawRectangle($pen, [float]$rx, [float]$ry, [float]$rw, [float]$rh)
  $brush = New-Object System.Drawing.SolidBrush $white
  $g.FillRectangle($brush, [float]$rx, [float]$ry, [float]$rw, [float]($s * 0.13))
  foreach ($k in 0.34, 0.66) { $g.FillRectangle($brush, [float]($o + $s * $k - $s * 0.03), [float]($o + $s * 0.16), [float]($s * 0.06), [float]($s * 0.14)) }
  $font = New-Object System.Drawing.Font "Georgia", ([float]($s * 0.34)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
  $rect = New-Object System.Drawing.RectangleF ([float]$rx), ([float]($ry + $s * 0.12)), ([float]$rw), ([float]($rh - $s * 0.12))
  $g.DrawString("D", $font, $brush, $rect, $fmt)
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Draw-Icon 192 1.0 "icon-192.png"
Draw-Icon 512 1.0 "icon-512.png"
Draw-Icon 512 0.8 "icon-maskable-512.png"
Draw-Icon 180 1.0 "apple-touch-icon.png"
Draw-Icon 96 1.1 "badge-96.png" $true
Write-Host "아이콘 생성 완료: $out"
