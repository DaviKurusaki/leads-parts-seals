$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logsDirectory = Join-Path $projectRoot 'data\logs'
$appUrl = 'http://localhost:3210'
$healthUrl = 'http://127.0.0.1:3210/api/health'

Set-Location -LiteralPath $projectRoot

function Test-PartsSealsServer {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  $nodeCommand = Get-Command 'node.exe' -ErrorAction Stop
  $npmCommand = Get-Command 'npm.cmd' -ErrorAction Stop

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $projectRoot '.env')
    Write-Host 'Arquivo .env criado com a configuração segura padrão.' -ForegroundColor Yellow
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\express\package.json'))) {
    Write-Host 'Instalando dependências do projeto...' -ForegroundColor Cyan
    & $npmCommand.Source install
    if ($LASTEXITCODE -ne 0) {
      throw 'A instalação das dependências falhou.'
    }
  }

  if (Test-PartsSealsServer) {
    Write-Host 'O servidor já está funcionando. Abrindo o projeto...' -ForegroundColor Green
    Start-Process $appUrl
    exit 0
  }

  New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdoutLog = Join-Path $logsDirectory "server-$timestamp.log"
  $stderrLog = Join-Path $logsDirectory "server-$timestamp-error.log"
  $pidFile = Join-Path $logsDirectory 'server.pid'

  Write-Host 'Iniciando o servidor Parts Seals...' -ForegroundColor Cyan
  $serverProcess = Start-Process `
    -FilePath $npmCommand.Source `
    -ArgumentList 'start' `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru
  Set-Content -LiteralPath $pidFile -Value $serverProcess.Id -Encoding ascii

  for ($attempt = 1; $attempt -le 45; $attempt += 1) {
    if (Test-PartsSealsServer) {
      Write-Host 'Projeto iniciado com sucesso. Abrindo o navegador...' -ForegroundColor Green
      Start-Process $appUrl
      exit 0
    }
    if ($serverProcess.HasExited) {
      $details = @()
      if (Test-Path -LiteralPath $stdoutLog) {
        $details += Get-Content -LiteralPath $stdoutLog -Raw
      }
      if (Test-Path -LiteralPath $stderrLog) {
        $details += Get-Content -LiteralPath $stderrLog -Raw
      }
      throw "O servidor encerrou durante a inicialização.`n$($details -join "`n")"
    }
    Start-Sleep -Seconds 1
  }

  throw "O servidor não respondeu em 45 segundos. Consulte $stdoutLog e $stderrLog."
} catch {
  Write-Host ''
  Write-Host 'ERRO AO INICIAR O PROJETO' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
