param()

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$assetDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\app'))
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null

function ColorFromHex([string] $hex, [int] $alpha = 255) {
  $clean = $hex.TrimStart('#')
  $r = [Convert]::ToInt32($clean.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($clean.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($clean.Substring(4, 2), 16)
  return [System.Drawing.Color]::FromArgb($alpha, $r, $g, $b)
}

function Brush([string] $hex, [int] $alpha = 255) {
  return [System.Drawing.SolidBrush]::new((ColorFromHex $hex $alpha))
}

function Pen([string] $hex, [single] $width, [int] $alpha = 255) {
  $pen = [System.Drawing.Pen]::new((ColorFromHex $hex $alpha), $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

function RoundedPath([single] $x, [single] $y, [single] $w, [single] $h, [single] $r) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function FillRoundedRect($graphics, [single] $x, [single] $y, [single] $w, [single] $h, [single] $r, [string] $color, [int] $alpha = 255) {
  $path = RoundedPath $x $y $w $h $r
  $brush = Brush $color $alpha
  $graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

function DrawIconMark($graphics, [single] $scale, [single] $offsetX, [single] $offsetY, [bool] $includeBackground) {
  if ($includeBackground) {
    $bg = Brush '#F8FFFD'
    $graphics.FillRectangle($bg, 0, 0, [int](1024 * $scale), [int](1024 * $scale))
    $bg.Dispose()

    $mint = Brush '#E8FAF6'
    $coralBg = Brush '#FFF0EB'
    $graphics.FillEllipse($mint, $offsetX + (80 * $scale), $offsetY + (56 * $scale), 236 * $scale, 236 * $scale)
    $graphics.FillEllipse($coralBg, $offsetX + (696 * $scale), $offsetY + (666 * $scale), 308 * $scale, 308 * $scale)
    $mint.Dispose()
    $coralBg.Dispose()
  }

  FillRoundedRect $graphics ($offsetX + 152 * $scale) ($offsetY + 150 * $scale) (720 * $scale) (720 * $scale) (188 * $scale) '#FFFFFF'

  FillRoundedRect $graphics ($offsetX + 552 * $scale) ($offsetY + 232 * $scale) (232 * $scale) (272 * $scale) (54 * $scale) '#FF7A59'
  FillRoundedRect $graphics ($offsetX + 590 * $scale) ($offsetY + 280 * $scale) (156 * $scale) (28 * $scale) (14 * $scale) '#FFFFFF' 198

  $white88 = Brush '#FFFFFF' 224
  $graphics.FillEllipse($white88, $offsetX + 598 * $scale, $offsetY + 334 * $scale, 56 * $scale, 56 * $scale)
  $graphics.FillEllipse($white88, $offsetX + 680 * $scale, $offsetY + 334 * $scale, 56 * $scale, 56 * $scale)
  $white88.Dispose()
  FillRoundedRect $graphics ($offsetX + 590 * $scale) ($offsetY + 426 * $scale) (126 * $scale) (26 * $scale) (13 * $scale) '#FFFFFF' 164

  FillRoundedRect $graphics ($offsetX + 236 * $scale) ($offsetY + 532 * $scale) (288 * $scale) (288 * $scale) (64 * $scale) '#22C7A9'
  $wideLine = Pen '#FFFFFF' (34 * $scale) 214
  $graphics.DrawLine($wideLine, $offsetX + 284 * $scale, $offsetY + 618 * $scale, $offsetX + 476 * $scale, $offsetY + 618 * $scale)
  $wideLine.Dispose()
  $shortLine = Pen '#FFFFFF' (34 * $scale) 174
  $graphics.DrawLine($shortLine, $offsetX + 284 * $scale, $offsetY + 700 * $scale, $offsetX + 426 * $scale, $offsetY + 700 * $scale)
  $shortLine.Dispose()

  $arrowPen = Pen '#1F2A37' (58 * $scale)
  $path1 = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path1.AddLine($offsetX + 306 * $scale, $offsetY + 444 * $scale, $offsetX + 656 * $scale, $offsetY + 444 * $scale)
  $path1.AddLine($offsetX + 656 * $scale, $offsetY + 444 * $scale, $offsetX + 566 * $scale, $offsetY + 354 * $scale)
  $graphics.DrawPath($arrowPen, $path1)
  $path1.Dispose()

  $path2 = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path2.AddLine($offsetX + 716 * $scale, $offsetY + 610 * $scale, $offsetX + 366 * $scale, $offsetY + 610 * $scale)
  $path2.AddLine($offsetX + 366 * $scale, $offsetY + 610 * $scale, $offsetX + 456 * $scale, $offsetY + 700 * $scale)
  $graphics.DrawPath($arrowPen, $path2)
  $path2.Dispose()
  $arrowPen.Dispose()
}

function New-Image([int] $width, [int] $height, [bool] $transparent) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  if ($transparent) {
    $graphics.Clear([System.Drawing.Color]::Transparent)
  }
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Png($image, [string] $name) {
  $path = Join-Path $assetDir $name
  $stream = [System.IO.MemoryStream]::new()
  try {
    $image.Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    [System.IO.File]::WriteAllBytes($path, $stream.ToArray())
  } finally {
    $stream.Dispose()
  }
  $image.Graphics.Dispose()
  $image.Bitmap.Dispose()
  Write-Host "generated $path"
}

$icon = New-Image 1024 1024 $false
DrawIconMark $icon.Graphics 1 0 0 $true
Save-Png $icon 'icon.png'

$adaptive = New-Image 1024 1024 $true
DrawIconMark $adaptive.Graphics 0.9 51 51 $false
Save-Png $adaptive 'adaptive-icon.png'

$splash = New-Image 1200 1200 $true
DrawIconMark $splash.Graphics 0.44 336 120 $false

$fontFamily = 'Yu Gothic UI'
$nameFont = [System.Drawing.Font]::new($fontFamily, 104, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = [System.Drawing.Font]::new($fontFamily, 36, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$appName = -join ([char[]](0x30B0, 0x30C3, 0x3068, 0x308C))
$appSubtitle = -join ([char[]](0x30B0, 0x30C3, 0x30BA, 0x4EA4, 0x63DB, 0x7BA1, 0x7406, 0x30A2, 0x30D7, 0x30EA))
$center = [System.Drawing.StringFormat]::new()
$center.Alignment = [System.Drawing.StringAlignment]::Center
$center.LineAlignment = [System.Drawing.StringAlignment]::Center
$inkBrush = Brush '#1F2A37'
$mutedBrush = Brush '#41515C'
$splash.Graphics.DrawString($appName, $nameFont, $inkBrush, [System.Drawing.RectangleF]::new(0, 650, 1200, 130), $center)
$splash.Graphics.DrawString($appSubtitle, $subtitleFont, $mutedBrush, [System.Drawing.RectangleF]::new(0, 770, 1200, 72), $center)
$accentPen = Pen '#22C7A9' 12
$splash.Graphics.DrawLine($accentPen, 410, 875, 790, 875)
$accentPen.Dispose()
$inkBrush.Dispose()
$mutedBrush.Dispose()
$nameFont.Dispose()
$subtitleFont.Dispose()
$center.Dispose()
Save-Png $splash 'splash.png'
