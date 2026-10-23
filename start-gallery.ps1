[CmdletBinding()]
param([int]$Port = 4321)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    throw '依赖尚未安装，请先运行 .\setup-windows.ps1。'
}

$url = "http://127.0.0.1:$Port/styleboard/index.html"
$args = @((Join-Path $root 'serve-gallery.mjs'), $Port)
$process = Start-Process -FilePath 'node.exe' -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 800
if ($process.HasExited) { throw '画廊服务启动失败。' }
Start-Process $url
Write-Host "风格画廊：$url" -ForegroundColor Green
Write-Host "服务进程 PID：$($process.Id)"
