param(
  [Parameter(Position = 0)]
  [string]$Version,

  [switch]$Publish,

  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[release] $Message" -ForegroundColor Cyan
}

function Fail {
  param([string]$Message)
  throw $Message
}

function Get-AppProcesses {
  return @(Get-Process -Name "Alerta-IBT" -ErrorAction SilentlyContinue)
}

function Ensure-AppClosed {
  $running = Get-AppProcesses
  if ($running.Count -eq 0) {
    return
  }

  Write-Step "Fechando Alerta-IBT automaticamente para liberar a release"

  foreach ($process in $running) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
    } catch {
      # Continua tentando fechar os demais processos antes de validar o resultado.
    }
  }

  Start-Sleep -Milliseconds 1200
  $remaining = Get-AppProcesses
  if ($remaining.Count -gt 0) {
    $remainingIds = ($remaining | Select-Object -ExpandProperty Id) -join ", "
    Fail "Nao foi possivel fechar o Alerta-IBT automaticamente. Encerre o app e rode novamente. Processos restantes: $remainingIds."
  }

  Write-Step "Alerta-IBT fechado com sucesso"
}

$projectRoot = Split-Path -Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot

if (-not $Version) {
  $Version = Read-Host "Digite a versao sem o v (ex: 6.5.0)"
}

$Version = "$Version".Trim()
$Version = $Version.TrimStart("v")

if (-not ($Version -match '^\d+\.\d+\.\d+$')) {
  Fail "Versao invalida: '$Version'. Use o formato 6.5.0."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Fail "npm.cmd nao encontrado. Instale o Node.js LTS antes de continuar."
}

if (-not $SkipBuild) {
  if ($Publish -and -not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    Fail "Para publicar no GitHub Releases, defina GH_TOKEN ou GITHUB_TOKEN antes de rodar este script."
  }

  Ensure-AppClosed
}

$insideGit = $false
if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $gitCheck = git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -eq 0 -and "$gitCheck".Trim() -eq "true") {
      $insideGit = $true
    }
  } catch {
    $insideGit = $false
  }
}

Write-Step "Sincronizando package.json e package-lock.json para v$Version"
& npm.cmd version $Version --no-git-tag-version --allow-same-version | Out-Host
if ($LASTEXITCODE -ne 0) {
  Fail "Falha ao atualizar a versao do projeto."
}

if (-not $SkipBuild) {
  if ($Publish) {
    Write-Step "Gerando instalador e publicando no GitHub Releases"
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    & npm.cmd exec electron-builder -- --win nsis --publish always | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Fail "Falha ao gerar ou publicar a release."
    }
  } else {
    Write-Step "Gerando instalador local em dist/"
    & npm.cmd run dist | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Fail "Falha ao gerar o instalador local."
    }
  }
}

Write-Host ""
Write-Host "Versao pronta: v$Version" -ForegroundColor Green

if (-not $SkipBuild) {
  Write-Host "Saida esperada: dist/" -ForegroundColor Green
}

if ($insideGit) {
  Write-Host ""
  Write-Host "Repositorio git detectado. Proximos comandos sugeridos:" -ForegroundColor Yellow
  Write-Host "git add package.json package-lock.json"
  Write-Host "git commit -m ""release: v$Version"""
  Write-Host "git tag v$Version"
  Write-Host "git push origin HEAD --tags"
} else {
  Write-Host ""
  Write-Warning "Esta pasta ainda nao esta em um repositorio git. O build local funciona, mas release automatica por tag no GitHub depende disso."
}
