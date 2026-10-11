$ErrorActionPreference = 'Stop'
$OutputName = if ($args.Count -gt 0) { $args[0] } else { 'ScriptFixAI.exe' }
if ([IO.Path]::GetFileName($OutputName) -ne $OutputName -or [IO.Path]::GetExtension($OutputName) -ne '.exe') {
    throw 'Output name must be a plain .exe filename.'
}
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

# Windows PowerShell's C# compiler builds the tiny browser-app launcher.
Add-Type -Path (Join-Path $project 'ScriptFixAI.Launcher.cs') `
    -OutputAssembly (Join-Path $project $OutputName) `
    -OutputType WindowsApplication `
    -ReferencedAssemblies 'System.dll', 'System.Windows.Forms.dll', 'System.Web.dll'

Write-Host "Built $OutputName. Keep index.html and styles.css beside it."
