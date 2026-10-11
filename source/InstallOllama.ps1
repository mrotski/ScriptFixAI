$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$installDir = Join-Path $env:LOCALAPPDATA 'ScriptFixAI\Ollama'
$installerPath = Join-Path $env:TEMP 'ScriptFixAI-OllamaSetup.exe'
$installerUrl = 'https://ollama.com/download/OllamaSetup.exe'

try {
    Write-Host ''
    Write-Host 'ScriptFix AI — Install local Ollama' -ForegroundColor Cyan
    Write-Host 'This downloads Ollama and installs it for your Windows account.'
    Write-Host "Install folder: $installDir"
    Write-Host 'Model downloads happen later from AI settings.'
    Write-Host ''
    Write-Host 'Downloading the official Ollama installer…'
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath

    Write-Host 'Checking the installer signature…'
    $signature = Get-AuthenticodeSignature -FilePath $installerPath
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Ollama Inc\.(,|$)') {
        throw 'The downloaded installer signature could not be verified as Ollama Inc. The installer was not run.'
    }

    $githubPagesOrigin = 'https://mrotski.github.io'
    $savedOrigins = [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User')
    $allowedOrigins = @($savedOrigins -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($githubPagesOrigin -notin $allowedOrigins) { $allowedOrigins += $githubPagesOrigin }
    $env:OLLAMA_ORIGINS = $allowedOrigins -join ','
    [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $env:OLLAMA_ORIGINS, 'User')

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Write-Host 'Installing Ollama…'
    $arguments = "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES /DIR=`"$installDir`""
    $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Ollama setup exited with code $($process.ExitCode)." }

    $ollamaExe = Join-Path $installDir 'ollama.exe'
    if (-not (Test-Path -LiteralPath $ollamaExe -PathType Leaf)) {
        throw "Setup finished, but ollama.exe was not found in $installDir."
    }
    Write-Host ''
    Write-Host 'Ollama is installed. Close and reopen ScriptFix AI, then download a model in AI settings.' -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host "Setup did not finish: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'You can retry this helper or install Ollama from https://ollama.com/download/windows.'
    $host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') | Out-Null
    exit 1
} finally {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
}

Read-Host 'Press Enter to close'
