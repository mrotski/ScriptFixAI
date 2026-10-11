$ErrorActionPreference = 'Stop'
$OutputName = if ($args.Count -gt 0) { $args[0] } else { 'ScriptFixAI.exe' }
if ([IO.Path]::GetFileName($OutputName) -ne $OutputName -or [IO.Path]::GetExtension($OutputName) -ne '.exe') {
    throw 'Output name must be a plain .exe filename.'
}
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $project
Set-Location $project

# Draw the app mark at high resolution, then wrap its PNG as a Windows ICO.
Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$tile = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#75857d'))
$tilePath = [Drawing.Drawing2D.GraphicsPath]::new()
$tilePath.AddArc(8, 8, 64, 64, 180, 90)
$tilePath.AddArc(184, 8, 64, 64, 270, 90)
$tilePath.AddArc(184, 184, 64, 64, 0, 90)
$tilePath.AddArc(8, 184, 64, 64, 90, 90)
$tilePath.CloseFigure()
$graphics.FillPath($tile, $tilePath)
$white = [Drawing.Pen]::new([Drawing.Color]::White, 15)
$white.StartCap = [Drawing.Drawing2D.LineCap]::Round
$white.EndCap = [Drawing.Drawing2D.LineCap]::Round
$white.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawLines($white, [Drawing.Point[]]@([Drawing.Point]::new(88,75),[Drawing.Point]::new(58,128),[Drawing.Point]::new(88,181)))
$graphics.DrawLines($white, [Drawing.Point[]]@([Drawing.Point]::new(168,75),[Drawing.Point]::new(198,128),[Drawing.Point]::new(168,181)))
$starPoints = [Drawing.Point[]]@([Drawing.Point]::new(128,74),[Drawing.Point]::new(139,116),[Drawing.Point]::new(181,128),[Drawing.Point]::new(139,140),[Drawing.Point]::new(128,182),[Drawing.Point]::new(117,140),[Drawing.Point]::new(75,128),[Drawing.Point]::new(117,116))
$starBrush = [Drawing.SolidBrush]::new([Drawing.Color]::White)
$graphics.FillPolygon($starBrush, $starPoints)
$png = [IO.MemoryStream]::new()
$bitmap.Save($png, [Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $png.ToArray()
$ico = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($ico)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$pngBytes.Length); $writer.Write([UInt32]22)
$writer.Write($pngBytes)
[IO.File]::WriteAllBytes((Join-Path $project 'app-icon.ico'), $ico.ToArray())
$writer.Dispose(); $ico.Dispose(); $png.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
$tile.Dispose(); $tilePath.Dispose(); $white.Dispose(); $starBrush.Dispose()

# Compile the Windows launcher and embed the same mark as its executable icon.
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $compiler)) { throw 'Could not find the .NET Framework C# compiler.' }
& $compiler /nologo /target:winexe "/out:$((Join-Path $root $OutputName))" "/win32icon:$(Join-Path $project 'app-icon.ico')" /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Web.dll (Join-Path $project 'ScriptFixAI.Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw "C# compilation failed with exit code $LASTEXITCODE." }
Write-Host "Built $OutputName with app-icon.ico embedded. Keep the source folder beside it."
