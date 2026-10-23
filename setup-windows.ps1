[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $HOME 'lemo-code-mv'),
    [switch]$Voice,
    [switch]$Music,
    [switch]$NoGallery
)

$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/xiaox1230/lemo-opuscar.git'

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Require-Command([string]$Command, [string]$WingetId) {
    if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw "缺少 $Command，且系统没有 winget。请先安装 $Command 后重试。"
    }
    Write-Host "正在安装 $Command ..." -ForegroundColor Cyan
    & winget.exe install --id $WingetId -e --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "$Command 安装失败。" }
    Refresh-Path
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "$Command 已安装，但当前终端尚未识别。请关闭 PowerShell，重新运行同一条命令。"
    }
}

Write-Host 'Lemo Code MV · Windows 一键安装' -ForegroundColor Cyan
Require-Command git.exe 'Git.Git'
Require-Command node.exe 'OpenJS.NodeJS.LTS'
Require-Command python.exe 'Python.Python.3.12'
Require-Command ffmpeg.exe 'Gyan.FFmpeg'

$currentRepo = $PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'core\render\video.mjs'))
if ($currentRepo) {
    $lib = $PSScriptRoot
} elseif (Test-Path (Join-Path $InstallPath '.git')) {
    $lib = (Resolve-Path $InstallPath).Path
    Write-Host "正在更新 $lib ..." -ForegroundColor Cyan
    & git.exe -C $lib pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw '仓库更新失败；请处理本地改动后重试。' }
} elseif (Test-Path $InstallPath) {
    throw "$InstallPath 已存在但不是本项目仓库，请更换 -InstallPath。"
} else {
    Write-Host "正在下载到 $InstallPath ..." -ForegroundColor Cyan
    & git.exe clone $repo $InstallPath
    if ($LASTEXITCODE -ne 0) { throw '仓库下载失败。' }
    $lib = (Resolve-Path $InstallPath).Path
}

Push-Location $lib
try {
    Write-Host '正在安装 Node 渲染依赖 ...' -ForegroundColor Cyan
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm 依赖安装失败。' }
    & node.exe node_modules/playwright-core/cli.js install chromium-headless-shell
    if ($LASTEXITCODE -ne 0) { throw 'Chromium 渲染器安装失败。' }

    if (-not (Test-Path '.venv\Scripts\python.exe')) { & python.exe -m venv .venv }
    $python = Join-Path $lib '.venv\Scripts\python.exe'
    & $python -m pip install --disable-pip-version-check -r requirements.txt
    if ($Voice) { & $python -m pip install --disable-pip-version-check -r requirements-voice.txt }
    if ($Music) { & $python -m pip install --disable-pip-version-check -r requirements-music.txt }
    if ($LASTEXITCODE -ne 0) { throw 'Python 依赖安装失败。' }

    $workbuddyHome = Join-Path $HOME '.workbuddy'
    if (-not (Test-Path $workbuddyHome)) {
        throw '尚未检测到 WorkBuddy。请先安装并启动一次 WorkBuddy，再重新运行本安装器。'
    }
    $skillSource = Join-Path $lib 'workbuddy-skills\code-mv'
    $skillTarget = Join-Path $HOME '.workbuddy\skills\code-mv'
    New-Item -ItemType Directory -Path (Split-Path $skillTarget) -Force | Out-Null
    if (Test-Path $skillTarget) { Remove-Item -LiteralPath $skillTarget -Recurse -Force }
    Copy-Item -LiteralPath $skillSource -Destination $skillTarget -Recurse
    [Environment]::SetEnvironmentVariable('LEMO_LIB', $lib, 'User')

    Write-Host "`n安装完成：$lib" -ForegroundColor Green
    Write-Host "WorkBuddy skill：$skillTarget"
    Write-Host '重启 WorkBuddy 后，把音频和歌词放进项目文件夹，直接说：用 code-mv 制作这首歌的 MV。'
    if (-not $NoGallery) { & (Join-Path $lib 'start-gallery.ps1') }
} finally {
    Pop-Location
}
