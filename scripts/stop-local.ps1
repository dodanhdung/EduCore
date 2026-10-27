#requires -Version 5.1
<# Stops only the processes/container recorded by scripts/start-local.ps1. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localRoot = Join-Path $root '.local'
$configPath = Join-Path $localRoot 'config.json'
$runPath = Join-Path $localRoot 'run.json'
if (-not (Test-Path -LiteralPath $runPath)) { Write-Host 'EduCore local launcher is not recorded as running.'; exit 0 }
if (-not (Test-Path -LiteralPath $configPath)) { throw 'LOCAL_CONFIG_MISSING: refusing to stop any process' }
$run = Get-Content -LiteralPath $runPath -Raw | ConvertFrom-Json
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($run.configId -ne $config.id -or $run.containerId -ne $config.containerId) { throw 'LOCAL_RUN_IDENTITY_MISMATCH' }
foreach ($service in @(@{ pid = $run.webPid; started = $run.webStartedUtc; marker = 'node_modules/vite/bin/vite.js' },
                     @{ pid = $run.apiPid; started = $run.apiStartedUtc; marker = 'dist/main.js' })) {
  $process = Get-Process -Id $service.pid -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $expected = [DateTime]::Parse($service.started).ToUniversalTime()
  $actual = $process.StartTime.ToUniversalTime()
  $command = Get-CimInstance Win32_Process -Filter "ProcessId=$($service.pid)" -ErrorAction Stop
  if ($process.ProcessName -ne 'node' -or [Math]::Abs(($actual - $expected).TotalSeconds) -gt 2 -or
      -not $command.CommandLine.Contains($service.marker)) { throw "PROCESS_IDENTITY_MISMATCH:$($service.pid): refusing to stop" }
  Stop-Process -Id $service.pid -Force -ErrorAction Stop
}
if ($run.databaseStartedByLauncher) {
  $docker = (Get-Command docker -ErrorAction Stop).Source
  $context = (& $docker context show 2>$null | Out-String).Trim()
  if ($context -ne $config.context) { throw 'DOCKER_CONTEXT_CHANGED: refusing container stop' }
  $inspect = (& $docker --context $context inspect --format '{{json .}}' $config.container 2>$null | Out-String | ConvertFrom-Json)
  if ($inspect.Id -ne $config.containerId -or $inspect.Config.Labels.'educore.local.instance' -ne $config.id) { throw 'LOCAL_CONTAINER_IDENTITY_MISMATCH' }
  if ($inspect.State.Running) {
    & $docker --context $context stop $config.container 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRES_STOP_FAILED' }
  }
}
Remove-Item -LiteralPath $runPath
Write-Host 'EduCore local services stopped. PostgreSQL container and private files were preserved.'
