[CmdletBinding()]
param([switch]$Voice, [switch]$Music, [switch]$NoLaunch)

$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/xiaox1230/lemo-opuscar.git'
$rawSetup = 'https://raw.githubusercontent.com/xiaox1230/lemo-opuscar/main/scripts/setup-wsl.sh'

function Stop-WithMessage([string]$Message) {
    Write-Host "`n$Message" -ForegroundColor Red
    exit 1
}

Write-Host 'Lemo-Opuscar Windows setup' -ForegroundColor Cyan
Write-Host 'Windows runs the rendering toolchain inside WSL.'

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "`nWSL is not installed. Windows will now open the WSL installer." -ForegroundColor Yellow
    Write-Host 'After Windows asks you to restart, run this command again.'
    Start-Process -FilePath 'wsl.exe' -ArgumentList '--install' -Verb RunAs -Wait
    exit 0
}

$wslStatus = & wsl.exe --status 2>&1
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "WSL is installed but not ready. Run 'wsl --install', restart Windows, then try again.`n$wslStatus"
}

$options = @()
if ($Voice) { $options += '--voice' }
if ($Music) { $options += '--music' }
if ($NoLaunch) { $options += '--no-launch' }
$optionText = $options -join ' '

$localSetup = Join-Path $PSScriptRoot 'scripts\setup-wsl.sh'
if ($PSScriptRoot -and (Test-Path -LiteralPath $localSetup)) {
    $wslScript = (& wsl.exe wslpath -a $localSetup).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $wslScript) {
        Stop-WithMessage 'Could not translate the repository path for WSL.'
    }
    $command = "bash '$wslScript' --repo '$repo' $optionText"
} else {
    $command = "tmp=`$(mktemp); curl -fsSL '$rawSetup' -o `"`$tmp`" && bash `"`$tmp`" --repo '$repo' --clone $optionText; code=`$?; rm -f `"`$tmp`"; exit `$code"
}

& wsl.exe bash -lc $command
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'Setup did not finish. Fix the error shown above, then run the same command again.'
}
