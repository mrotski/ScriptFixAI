param([switch]$Desktop, [string]$ReadyFile)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$url = "http://127.0.0.1:$port/"
Write-Host "ScriptFix AI is running at $url"
Write-Host 'Keep this window open while using the app. Press Ctrl+C to stop it.'

$knownOllamaPaths = @(
    (Join-Path $env:LOCALAPPDATA 'ScriptFixAI\Ollama\ollama.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe')
)
$ollamaCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
$ollamaInstalled = $ollamaCommand -or ($knownOllamaPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
$setupStatusPath = Join-Path $env:LOCALAPPDATA 'ScriptFixAI\ollama-setup-status.json'
if ($Desktop -and -not $ollamaInstalled) {
    $installerHelper = Join-Path $PSScriptRoot 'InstallOllama.ps1'
    if (Test-Path -LiteralPath $installerHelper -PathType Leaf) {
        try {
            Write-Host 'Ollama is not installed. Starting the verified setup helper…'
            New-Item -ItemType Directory -Path (Split-Path -Parent $setupStatusPath) -Force | Out-Null
            Set-Content -LiteralPath $setupStatusPath -Value (@{ state = 'downloading'; message = '' } | ConvertTo-Json -Compress) -Encoding UTF8
            Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$installerHelper`"") -WindowStyle Hidden -ErrorAction Stop | Out-Null
        } catch {
            Set-Content -LiteralPath $setupStatusPath -Value (@{ state = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress) -Encoding UTF8 -ErrorAction SilentlyContinue
            Write-Warning "Could not start the Ollama installer automatically: $($_.Exception.Message)"
        }
    } else {
        Write-Warning 'Ollama is not installed, and the setup helper is missing from the source folder.'
    }
}
if ($ReadyFile) { Set-Content -LiteralPath $ReadyFile -Value $url -Encoding ASCII }
if (-not $Desktop) { Start-Process $url }

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
}

function Get-OllamaPath {
    $scriptFixPath = Join-Path $env:LOCALAPPDATA 'ScriptFixAI\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $scriptFixPath) { return $scriptFixPath }
    $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    return $null
}

function Ensure-Ollama {
    try {
        $check = [Net.HttpWebRequest]::Create('http://127.0.0.1:11434/api/tags')
        $check.Timeout = 1200
        $check.GetResponse().Close()
        return
    } catch { }

    $ollamaPath = Get-OllamaPath
    if (-not $ollamaPath) { throw 'Ollama was not found. Install Ollama, then try again.' }
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 500
        try {
            $check = [Net.HttpWebRequest]::Create('http://127.0.0.1:11434/api/tags')
            $check.Timeout = 1200
            $check.GetResponse().Close()
            return
        } catch { }
    }
    throw 'Ollama did not start. Open Ollama and make sure it is ready, then try again.'
}

function Read-Request($stream) {
    $headerBytes = [Collections.Generic.List[byte]]::new()
    while ($headerBytes.Count -lt 32768) {
        $value = $stream.ReadByte()
        if ($value -lt 0) { break }
        $headerBytes.Add([byte]$value)
        $count = $headerBytes.Count
        if ($count -ge 4 -and $headerBytes[$count - 4] -eq 13 -and $headerBytes[$count - 3] -eq 10 -and $headerBytes[$count - 2] -eq 13 -and $headerBytes[$count - 1] -eq 10) { break }
    }
    $headerText = [Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
    $lines = $headerText -split "`r`n"
    $length = 0
    foreach ($line in $lines) { if ($line -match '^Content-Length:\s*(\d+)') { $length = [int]$Matches[1] } }
    if ($length -gt 2MB) { throw 'Request is too large.' }
    $body = [byte[]]::new($length)
    $offset = 0
    while ($offset -lt $length) {
        $read = $stream.Read($body, $offset, $length - $offset)
        if ($read -le 0) { throw 'Incomplete request body.' }
        $offset += $read
    }
    return @{ Lines = $lines; Body = $body }
}

function Write-Response($stream, [string]$status, [string]$contentType, [byte[]]$body, [string]$method) {
    $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($method -ne 'HEAD' -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $request = Read-Request $stream
            if (-not $request.Lines[0]) { continue }
            $parts = $request.Lines[0].Split(' ')
            $method = $parts[0]
            $requestPath = [Uri]::UnescapeDataString(($parts[1] -split '\?', 2)[0]).TrimEnd('/')

            if ($requestPath -eq '/install-ollama' -and $method -eq 'POST') {
                try {
                    $installerHelper = Join-Path $PSScriptRoot 'InstallOllama.ps1'
                    if (-not (Test-Path -LiteralPath $installerHelper -PathType Leaf)) { throw 'The Ollama setup helper is missing.' }
                    New-Item -ItemType Directory -Path (Split-Path -Parent $setupStatusPath) -Force | Out-Null
                    Set-Content -LiteralPath $setupStatusPath -Value (@{ state = 'downloading'; message = '' } | ConvertTo-Json -Compress) -Encoding UTF8
                    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$installerHelper`"") -WindowStyle Hidden -ErrorAction Stop | Out-Null
                    $json = @{ started = $true } | ConvertTo-Json -Compress
                    Write-Response $stream '202 Accepted' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                } catch {
                    Set-Content -LiteralPath $setupStatusPath -Value (@{ state = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress) -Encoding UTF8 -ErrorAction SilentlyContinue
                    $json = @{ error = @{ message = $_.Exception.Message } } | ConvertTo-Json -Compress
                    Write-Response $stream '500 Internal Server Error' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                }
                continue
            }

            if ($requestPath -eq '/ollama-setup-status' -and $method -eq 'GET') {
                if (Test-Path -LiteralPath $setupStatusPath -PathType Leaf) {
                    $json = Get-Content -LiteralPath $setupStatusPath -Raw
                } else {
                    $json = @{ state = 'idle'; message = '' } | ConvertTo-Json -Compress
                }
                Write-Response $stream '200 OK' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                continue
            }

            if ($requestPath -eq '/local-models' -and $method -eq 'GET') {
                try {
                    Ensure-Ollama
                    $modelsRequest = [Net.HttpWebRequest]::Create('http://127.0.0.1:11434/api/tags')
                    $modelsRequest.Timeout = 10000
                    $modelsResponse = $modelsRequest.GetResponse()
                    $modelsStream = $modelsResponse.GetResponseStream()
                    $buffer = [IO.MemoryStream]::new(); $modelsStream.CopyTo($buffer)
                    Write-Response $stream '200 OK' 'application/json; charset=utf-8' $buffer.ToArray() $method
                    $modelsResponse.Close()
                } catch {
                    $json = @{ error = @{ message = $_.Exception.Message } } | ConvertTo-Json -Compress
                    Write-Response $stream '503 Service Unavailable' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                }
                continue
            }

            if ($requestPath -eq '/install-model' -and $method -eq 'POST') {
                try {
                    Ensure-Ollama
                    $payload = [Text.Encoding]::UTF8.GetString($request.Body) | ConvertFrom-Json
                    $modelName = [string]$payload.name
                    if ($modelName -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$') { throw 'Choose a model from the suggested list.' }
                    $pullBody = [Text.Encoding]::UTF8.GetBytes((@{ name = $modelName; stream = $false } | ConvertTo-Json -Compress))
                    $pullRequest = [Net.HttpWebRequest]::Create('http://127.0.0.1:11434/api/pull')
                    $pullRequest.Method = 'POST'; $pullRequest.ContentType = 'application/json'; $pullRequest.Timeout = 3600000; $pullRequest.ReadWriteTimeout = 3600000
                    $pullRequest.ContentLength = $pullBody.Length
                    $pullStream = $pullRequest.GetRequestStream(); $pullStream.Write($pullBody, 0, $pullBody.Length); $pullStream.Close()
                    $pullResponse = $pullRequest.GetResponse(); $pullResponseStream = $pullResponse.GetResponseStream()
                    $buffer = [IO.MemoryStream]::new(); $pullResponseStream.CopyTo($buffer)
                    Write-Response $stream '200 OK' 'application/json; charset=utf-8' $buffer.ToArray() $method
                    $pullResponse.Close()
                } catch [Net.WebException] {
                    $upstream = $_.Exception.Response
                    if ($upstream) {
                        $responseStream = $upstream.GetResponseStream(); $buffer = [IO.MemoryStream]::new(); $responseStream.CopyTo($buffer)
                        Write-Response $stream "$([int]$upstream.StatusCode) $($upstream.StatusDescription)" 'application/json; charset=utf-8' $buffer.ToArray() $method
                        $upstream.Close()
                    } else {
                        $json = @{ error = @{ message = $_.Exception.Message } } | ConvertTo-Json -Compress
                        Write-Response $stream '503 Service Unavailable' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                    }
                } catch {
                    $json = @{ error = @{ message = $_.Exception.Message } } | ConvertTo-Json -Compress
                    Write-Response $stream '400 Bad Request' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                }
                continue
            }

            if ($requestPath -eq '/local-chat' -and $method -eq 'POST') {
                try {
                    Ensure-Ollama
                    $proxy = [Net.HttpWebRequest]::Create('http://127.0.0.1:11434/v1/chat/completions')
                    $proxy.Method = 'POST'
                    $proxy.ContentType = 'application/json'
                    $proxy.Timeout = 600000
                    $proxy.ReadWriteTimeout = 600000
                    $proxy.ContentLength = $request.Body.Length
                    $proxyStream = $proxy.GetRequestStream()
                    $proxyStream.Write($request.Body, 0, $request.Body.Length)
                    $proxyStream.Close()
                    $upstream = $proxy.GetResponse()
                    $responseStream = $upstream.GetResponseStream()
                    $buffer = [IO.MemoryStream]::new(); $responseStream.CopyTo($buffer)
                    Write-Response $stream "$([int]$upstream.StatusCode) $($upstream.StatusDescription)" 'application/json; charset=utf-8' $buffer.ToArray() $method
                    $upstream.Close()
                } catch [Net.WebException] {
                    $upstream = $_.Exception.Response
                    if ($upstream) {
                        $responseStream = $upstream.GetResponseStream()
                        $buffer = [IO.MemoryStream]::new(); $responseStream.CopyTo($buffer)
                        Write-Response $stream "$([int]$upstream.StatusCode) $($upstream.StatusDescription)" 'application/json; charset=utf-8' $buffer.ToArray() $method
                        $upstream.Close()
                    } else {
                        $message = $_.Exception.Message
                        $json = @{ error = @{ message = $message } } | ConvertTo-Json -Compress
                        Write-Response $stream '503 Service Unavailable' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                    }
                } catch {
                    $json = @{ error = @{ message = $_.Exception.Message } } | ConvertTo-Json -Compress
                    Write-Response $stream '503 Service Unavailable' 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json)) $method
                }
                continue
            }

            $relativePath = $requestPath.TrimStart('/')
            if (-not $relativePath) { $relativePath = 'index.html' }
            $filePath = [IO.Path]::GetFullPath((Join-Path $root ($relativePath -replace '/', '\')))
            if (-not $filePath.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and $filePath -ne (Join-Path $root 'index.html')) {
                $status = '403 Forbidden'; $body = [Text.Encoding]::UTF8.GetBytes('Forbidden'); $contentType = 'text/plain; charset=utf-8'
            } elseif ($method -notin @('GET', 'HEAD')) {
                $status = '405 Method Not Allowed'; $body = [Text.Encoding]::UTF8.GetBytes('Method not allowed'); $contentType = 'text/plain; charset=utf-8'
            } elseif (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $status = '404 Not Found'; $body = [Text.Encoding]::UTF8.GetBytes('Not found'); $contentType = 'text/plain; charset=utf-8'
            } else {
                $status = '200 OK'; $body = [IO.File]::ReadAllBytes($filePath)
                $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
                $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
            }
            Write-Response $stream $status $contentType $body $method
        } catch {
            # Ignore a browser request that disconnected before the response finished.
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
