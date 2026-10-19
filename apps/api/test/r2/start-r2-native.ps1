#requires -Version 5.1
<#
Test-only setup. Requires an already installed/running LOCAL Docker Engine.
Never installs software, reuses a cluster/volume, deploys manually, or removes resources.
Use -RunTests to prepare a fresh cluster and invoke the existing harness once.
#>
[CmdletBinding()]
param([switch]$RunTests)

$ErrorActionPreference = 'Stop'
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $dockerCommand) {
  throw 'NATIVE ENVIRONMENT BLOCKED: Docker CLI is unavailable. No resources or admission flags created. Install/start Docker separately, then rerun.'
}
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($RunTests -and $null -eq $pnpmCommand) { throw 'pnpm.cmd is required before creating a test cluster.' }

# Pin the selected context explicitly; never follow a remote DOCKER_HOST override.
$contextName = (& $dockerCommand.Source context show 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($contextName)) { throw 'Docker context unavailable; no cluster created.' }
$endpoint = (& $dockerCommand.Source context inspect $contextName --format '{{.Endpoints.docker.Host}}' 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$') {
  throw 'Refusing a remote or ambiguous Docker endpoint. Select a local Docker context.'
}
function Invoke-R2Docker {
  param([string[]]$Arguments)
  # Windows PowerShell treats successful native stderr progress (image pulls)
  # as NativeCommandError under Stop. Judge Docker by exit code, not stderr.
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $dockerCommand.Source --context $contextName @Arguments 2>$null)
    $dockerExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($dockerExitCode -ne 0) { throw "Docker operation failed ($($Arguments[0])). No existing container or volume will be removed; inspect only the task-owned resource." }
  return ($output -join "`n")
}
$null = Invoke-R2Docker -Arguments @('info', '--format', '{{.ServerVersion}}')

$runId = [Guid]::NewGuid().ToString('N')
$containerName = "educore-r2-native-$runId"
$databaseName = "educore_r2_native_$runId"
$apiRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidenceRoot = Join-Path ([System.IO.Path]::GetTempPath()) "educore-r2-native-$runId"
if (Test-Path -LiteralPath $evidenceRoot) { throw 'Evidence path already exists; refusing overwrite.' }
$null = New-Item -ItemType Directory -Path $evidenceRoot

# Obtain an unused loopback port. A bind race fails Docker run safely; no reuse/removal.
$portProbe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
try { $portProbe.Start(); $hostPort = $portProbe.LocalEndpoint.Port } finally { $portProbe.Stop() }
$passwordBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($passwordBytes) } finally { $random.Dispose() }
$privatePassword = [System.BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
$priorPostgresPassword = [Environment]::GetEnvironmentVariable('POSTGRES_PASSWORD', 'Process')
$priorTestUrl = [Environment]::GetEnvironmentVariable('R2_TEST_URL', 'Process')
$priorAdmission = [Environment]::GetEnvironmentVariable('R2_TEST_DISPOSABLE', 'Process')
$environment = [ordered]@{
  runId = $runId; container = $containerName; database = $databaseName
  host = '127.0.0.1'; port = $hostPort; status = 'STARTING'
  storage = 'Fresh container, anonymous image PGDATA volume; no supplied mount or volumes-from'
}
function Save-R2Environment {
  $environment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'environment.json') -Encoding UTF8
}
Save-R2Environment
try {
  # Password is passed by process environment name, never by command argument/file/log.
  $env:POSTGRES_PASSWORD = $privatePassword
  $containerId = (Invoke-R2Docker -Arguments @(
    'run', '--detach', '--name', $containerName,
    '--label', "educore.r2.disposable=$runId",
    '--publish', "127.0.0.1:${hostPort}:5432",
    '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=r2_test_admin',
    '--env', "POSTGRES_DB=$databaseName", 'postgres:16'
  )).Trim()
  if ($containerId -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected Docker container identity.' }
  $environment.containerId = $containerId
  Save-R2Environment
  $container = (Invoke-R2Docker -Arguments @('inspect', '--format', '{{json .}}', $containerName)) | ConvertFrom-Json
  # The full inspect result stays in memory; never log/write Config.Env.
  $bindings = @($container.NetworkSettings.Ports.'5432/tcp')
  if ($container.Id -ne $containerId -or $container.Config.Labels.'educore.r2.disposable' -ne $runId -or
      $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne [string]$hostPort -or
      @($container.Mounts | Where-Object { $_.Type -ne 'volume' }).Count -ne 0) {
    throw 'Container ownership, storage or loopback binding does not match this task.'
  }
  $environment.imageId = $container.Image
  $environment.mounts = @($container.Mounts | Select-Object Type, Name, Destination)
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & $dockerCommand.Source --context $contextName exec $containerName pg_isready --host 127.0.0.1 --quiet --username r2_test_admin --dbname $databaseName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'New task cluster did not become ready; no admission flag granted.' }
  $admissionSql = @'
SELECT json_build_object(
 'database',current_database(), 'serverVersion',current_setting('server_version'),
 'serverVersionNum',current_setting('server_version_num')::int,
 'publicTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
 'migrationTables',(SELECT count(*) FROM pg_class WHERE relname='_prisma_migrations'),
 'roleConflicts',(SELECT count(*) FROM pg_roles WHERE rolname IN ('educore_r1b_guard_owner','educore_r1b_api','educore_r1b_worker','educore_r2_owner','educore_r2_command')),
 'otherDatabases',(SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',current_database())),
 'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));
'@
  $admission = (Invoke-R2Docker -Arguments @('exec', $containerName, 'psql', '-X', '-t', '-A', '--no-password', '-U', 'r2_test_admin', '-d', $databaseName, '-c', $admissionSql)) | ConvertFrom-Json
  if ($admission.database -ne $databaseName -or $admission.serverVersionNum -lt 160000 -or $admission.serverVersionNum -ge 170000 -or
      $admission.publicTables -ne 0 -or $admission.migrationTables -ne 0 -or $admission.roleConflicts -ne 0 -or
      $admission.otherDatabases -ne 0 -or -not $admission.superuser) {
    throw 'Fresh PostgreSQL16 admission failed; no mutation tests will run.'
  }
  $environment.admission = $admission
  $environment.status = 'ADMITTED_FRESH_DISPOSABLE'
  Save-R2Environment
  $env:R2_TEST_URL = "postgresql://r2_test_admin:$([Uri]::EscapeDataString($privatePassword))@127.0.0.1:$hostPort/$databaseName"
  $env:R2_TEST_DISPOSABLE = 'I_OWN_THIS_DISPOSABLE_CLUSTER'
  Write-Host "Task-owned PostgreSQL16 container: $containerName; loopback port: $hostPort"
  Write-Host "Sanitized environment evidence: $evidenceRoot"
  if ($RunTests) {
    # Harness owns baseline/fault tests and migrate deploy. Do not deploy first.
    & $pnpmCommand.Source --dir $apiRoot test:r2:native
    $environment.nativeTestExitCode = $LASTEXITCODE
    $environment.status = if ($LASTEXITCODE -eq 0) { 'SUITE_FINISHED_REVIEW_REQUIRED' } else { 'SUITE_FAILED_REVIEW_REQUIRED' }
    Save-R2Environment
    if ($environment.nativeTestExitCode -ne 0) { throw 'Native suite failed. Keep this cluster/evidence; fix in scope and use a new cluster for the next full run.' }
  } else {
    Write-Host 'Test environment variables are set for this PowerShell process. Run the native suite here, or use -RunTests in a new invocation.'
  }
} finally {
  [Environment]::SetEnvironmentVariable('POSTGRES_PASSWORD', $priorPostgresPassword, 'Process')
  if ($RunTests) {
    [Environment]::SetEnvironmentVariable('R2_TEST_URL', $priorTestUrl, 'Process')
    [Environment]::SetEnvironmentVariable('R2_TEST_DISPOSABLE', $priorAdmission, 'Process')
  }
  [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
  $privatePassword = $null
  # Intentionally retain the task container and its new anonymous volume.
}
