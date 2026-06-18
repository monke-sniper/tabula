#!/usr/bin/env pwsh
# E2E test: boot backend on 8422, upload, eda, forecast, list models, tear down.
$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath (Join-Path $root 'backend')

$stdoutLog = Join-Path $root 'backend\e2e_stdout.log'
$stderrLog = Join-Path $root 'backend\e2e_stderr.log'
if (Test-Path $stdoutLog) { Remove-Item $stdoutLog -Force }
if (Test-Path $stderrLog) { Remove-Item $stderrLog -Force }

$env:PYTHONUNBUFFERED = '1'
$proc = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
  -ArgumentList @('-m', 'uvicorn', 'main:app', '--port', '8422', '--log-level', 'info') `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 4

function Test-Step($name, $script) {
  try {
    $r = & $script 2>&1
    Write-Host "PASS: $name"
    return $true
  } catch {
    Write-Host "FAIL: $name - $_"
    return $false
  }
}

$BASE = 'http://127.0.0.1:8422'
$csvPath = Join-Path $root 'test_data.csv'

Test-Step 'health' {
  $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/health" -TimeoutSec 5
  if ($h.StatusCode -ne 200) { throw "status $($h.StatusCode)" }
  $j = $h.Content | ConvertFrom-Json
  Write-Host "  health: $($j.status) v$($j.version)"
}

Test-Step 'upload' {
  Add-Type -AssemblyName System.Net.Http
  $http = [System.Net.Http.HttpClient]::new()
  $content = [System.Net.Http.MultipartFormDataContent]::new()
  $fs = [System.IO.File]::OpenRead($csvPath)
  $streamContent = [System.Net.Http.StreamContent]::new($fs)
  $streamContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/csv')
  $content.Add($streamContent, 'file', (Split-Path -Leaf $csvPath))
  $task = $http.PostAsync("$BASE/upload", $content)
  $resp = $task.GetAwaiter().GetResult()
  $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $fs.Close()
  if ($resp.StatusCode.value__ -ne 200) { throw "status $($resp.StatusCode.value__): $body" }
  $j = $body | ConvertFrom-Json
  $script:sessionId = $j.session_id
  Write-Host "  session: $($j.session_id) ($($j.rows) rows, $($j.columns) cols)"
  $script:targetCol = ($j.numeric_columns | Where-Object { $_ -ne 'id' -and $_ -ne 'index' })[0]
  if (-not $script:targetCol) { throw 'no numeric target' }
  Write-Host "  target: $($script:targetCol)"
}

if (-not $script:sessionId) {
  Write-Host "ABORT: upload failed"
  Get-Content $stderrLog -Tail 30
} else {
  $sid = $script:sessionId
  $tgt = $script:targetCol

  Test-Step 'eda' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/eda/$sid" -TimeoutSec 10
    if ($h.StatusCode -ne 200) { throw "status $($h.StatusCode)" }
    $j = $h.Content | ConvertFrom-Json
    Write-Host "  eda: $($j.column_info.Count) cols, $($j.distributions.Count) distributions"
  }

  Test-Step 'forecast-statistical' {
    $body = @{ target_column = $tgt; horizon = 24; num_samples = 20; model_name = 'statistical-fallback' } | ConvertTo-Json
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/forecast/$sid" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 30
    if ($h.StatusCode -ne 200) {
      Write-Host "  body: $($h.Content)"
      throw "status $($h.StatusCode)"
    }
    $j = $h.Content | ConvertFrom-Json
    $fc = ($j.results | Where-Object { $_.is_forecast }).Count
    $hc = ($j.results | Where-Object { -not $_.is_forecast }).Count
    Write-Host "  rows: $($j.results.Count) (h=$hc f=$fc), engine: $($j.engine), model: $($j.model_used), mae: $($j.metrics.mae), seasonality: $($j.seasonality.kind)/$($j.seasonality.period)"
    if ($hc + $fc -ne $j.results.Count) { throw "historical+forecast != total" }
    $f = $j.results | Where-Object { $_.is_forecast } | Select-Object -First 1
    if ($f.iteration_values.Count -ne 20) { throw "iterations mismatch" }
    if ($null -eq $f.lower_2_5) { throw "missing lower_2_5" }
    Write-Host "  first forecast ts: $($f.timestamp) median: $($f.median) [2.5%,97.5%]=[$($f.lower_2_5),$($f.upper_97_5)]"
  }

  Test-Step 'list-models' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/models" -TimeoutSec 5
    $j = $h.Content | ConvertFrom-Json
    Write-Host "  active: $($j.active) | $($j.models.Count) custom"
  }

  Test-Step 'sessions-list' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/sessions" -TimeoutSec 5
    $j = $h.Content | ConvertFrom-Json
    Write-Host "  sessions: $($j.sessions.Count)"
  }

  Test-Step 'forecast-bad-model' {
    $body = @{ target_column = $tgt; horizon = 12; num_samples = 10; model_name = 'no-such-model-xyz' } | ConvertTo-Json
    $caught = $null
    try {
      $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/forecast/$sid" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 30 -ErrorAction Stop
    } catch {
      $caught = $_
    }
    if (-not $caught) { throw "expected error, got 200" }
    $resp = $caught.Exception.Response
    $code = 0
    if ($resp) { $code = [int]$resp.StatusCode }
    if ($code -ne 400 -and $code -ne 500) {
      throw "unexpected status: $code"
    }
    $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
    $errBody = $reader.ReadToEnd()
    Write-Host "  rejected (expected): $($errBody.Substring(0, [Math]::Min(120, $errBody.Length)))"
  }

  Test-Step 'forecast-chronos' {
    Write-Host "  (this may take 30-60s on first run while weights download from HF)..." -NoNewline
    $body = @{ target_column = $tgt; horizon = 24; num_samples = 20; model_name = 'amazon/chronos-t5-small' } | ConvertTo-Json
    try {
      $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/forecast/$sid" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
    } catch {
      $code = 0; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      $reader = if ($_.Exception.Response) { [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()) } else { $null }
      $eb = if ($reader) { $reader.ReadToEnd() } else { $_.Exception.Message }
      throw "chronos forecast failed (status $code): $eb"
    }
    if ($h.StatusCode -ne 200) { throw "status $($h.StatusCode)" }
    $j = $h.Content | ConvertFrom-Json
    Write-Host ""
    Write-Host "  chronos: engine=$($j.engine) device=$($j.device) mae=$($j.metrics.mae) inference_ms=$($j.inference_ms) seasonality=$($j.seasonality.kind)/$($j.seasonality.period)"
    if ($j.engine -ne 'chronos') { throw "engine should be chronos, got $($j.engine)" }
  }

  Test-Step 'finetune-start' {
    $body = @{
      session_id = $sid
      model_name = 'amazon/chronos-t5-small'
      custom_name = 'tabula-test-model'
      learning_rate = 1e-3
      num_epochs = 2
      batch_size = 16
      warmup_steps = 5
      weight_decay = 0.01
      train_split = 0.8
      val_split = 0.1
    } | ConvertTo-Json
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/finetune/start" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10
    if ($h.StatusCode -ne 200) { throw "start status $($h.StatusCode): $($h.Content)" }
    Write-Host "  started; polling..."
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      $r = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/finetune/status" -TimeoutSec 5
      $j = $r.Content | ConvertFrom-Json
      if ($j.status -eq 'completed') {
        Write-Host "  done in ${i}s - loss=$($j.train_loss) eval=$($j.eval_loss) device=$($j.device)"
        break
      } elseif ($j.status -eq 'error') {
        throw "training error: $($j.message)"
      }
    }
    if ($j.status -ne 'completed') { throw "training did not complete (status=$($j.status))" }
  }

  Test-Step 'loss-history' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/finetune/loss-history" -TimeoutSec 5
    $j = $h.Content | ConvertFrom-Json
    if ($j.history.Count -lt 2) { throw "expected >= 2 history points, got $($j.history.Count)" }
    Write-Host "  history: $($j.history.Count) points"
  }

  Test-Step 'models-after-finetune' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/models" -TimeoutSec 5
    $j = $h.Content | ConvertFrom-Json
    $match = $j.models | Where-Object { $_.name -eq 'tabula-test-model' }
    if (-not $match) { throw "model not registered" }
    if ($match.engine -ne 'lstm-finetuned') { throw "engine should be lstm-finetuned, got $($match.engine)" }
    Write-Host "  registered: $($match.name) engine=$($match.engine)"
  }

  Test-Step 'model-delete' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/models/tabula-test-model" -Method Delete -TimeoutSec 5
    if ($h.StatusCode -ne 200) { throw "delete status $($h.StatusCode)" }
    $h2 = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/models" -TimeoutSec 5
    $j = $h2.Content | ConvertFrom-Json
    $still = $j.models | Where-Object { $_.name -eq 'tabula-test-model' }
    if ($still) { throw "model still in registry" }
    Write-Host "  deleted cleanly"
  }

  Test-Step 'clean-session' {
    $body = @{ strategy = 'ffill'; columns = @('sales') } | ConvertTo-Json
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/sessions/$sid/clean" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 5
    if ($h.StatusCode -ne 200) { throw "clean status $($h.StatusCode): $($h.Content)" }
    $j = $h.Content | ConvertFrom-Json
    Write-Host "  cleaned: $($j.rows_before) -> $($j.rows_after)"
  }

  Test-Step 'delete-session' {
    $h = Invoke-WebRequest -UseBasicParsing -Uri "$BASE/sessions/$sid" -Method Delete -TimeoutSec 5
    if ($h.StatusCode -ne 200) { throw "delete status $($h.StatusCode)" }
    Write-Host "  session deleted"
  }
}

Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq 8422 } |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
