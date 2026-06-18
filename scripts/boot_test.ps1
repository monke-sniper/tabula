#!/usr/bin/env pwsh
# Boot test: start uvicorn briefly, hit /openapi.json, list routes, stop.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath (Join-Path $root 'backend')

$stdoutLog = Join-Path $root 'backend\boot_stdout.log'
$stderrLog = Join-Path $root 'backend\boot_stderr.log'
if (Test-Path $stdoutLog) { Remove-Item $stdoutLog -Force }
if (Test-Path $stderrLog) { Remove-Item $stderrLog -Force }

$proc = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
  -ArgumentList @('-m', 'uvicorn', 'main:app', '--port', '8421', '--log-level', 'warning') `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 4
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8421/openapi.json' -TimeoutSec 5
  $o = $h.Content | ConvertFrom-Json
  $o.paths.PSObject.Properties.Name | Sort-Object | ForEach-Object { Write-Host $_ }
} catch {
  Write-Host "ERR: $_"
  if (Test-Path $stderrLog) { Get-Content $stderrLog -Tail 20 }
}

Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq 8421 } |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
