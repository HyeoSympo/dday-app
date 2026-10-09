# 미리보기용 로컬 서버. PowerShell 에서 실행: powershell -ExecutionPolicy Bypass -File tools\serve.ps1
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".json" = "application/json"; ".webmanifest" = "application/manifest+json"; ".png" = "image/png"; ".svg" = "image/svg+xml"
  ".md" = "text/plain; charset=utf-8"; ".ico" = "image/x-icon"
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "http://localhost:$Port/ 에서 미리보기 중 (종료: Ctrl+C)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
  if ($rel -eq "" -or $rel.EndsWith("/")) { $rel += "index.html" }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $res = $ctx.Response
  if ($path.StartsWith($root) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ext = [IO.Path]::GetExtension($path).ToLower()
    $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
    $res.Headers.Add("Cache-Control", "no-store")
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $res.StatusCode = 404 }
  $res.Close()
}
