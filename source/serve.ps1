$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$url = "http://127.0.0.1:$port/"
Write-Host "ScriptFix AI is running at $url"
Write-Host 'Keep this window open while using the app. Press Ctrl+C to stop it.'
Start-Process $url

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($null -ne ($header = $reader.ReadLine()) -and $header -ne '') { }
            if (-not $requestLine) { continue }

            $request = $requestLine.Split(' ')
            $method = $request[0]
            $requestPath = [Uri]::UnescapeDataString(($request[1] -split '\?', 2)[0]).TrimStart('/')
            if (-not $requestPath) { $requestPath = 'index.html' }
            $filePath = [IO.Path]::GetFullPath((Join-Path $root ($requestPath -replace '/', '\')))
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
            $length = $body.Length
            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne 'HEAD' -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
        } catch {
            # Ignore a browser request that disconnected before the response finished.
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
