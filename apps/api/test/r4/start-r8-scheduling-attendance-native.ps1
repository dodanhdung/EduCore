#requires -Version 5.1
<#
Runs only the standalone R8 scheduling/attendance HTTP test on a newly owned
local PostgreSQL 16 container. Keeps the container and sanitized evidence for
review. Never reuses or removes an existing database or Docker resource.
#>
[CmdletBinding()]
param([switch]$RunTests)

$ErrorActionPreference = 'Stop'
if (-not $RunTests) { throw 'Pass -RunTests to create and test a new disposable cluster.' }
$dockerCommand = Get-Command docker -ErrorAction Stop
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
$contextName = (& $dockerCommand.Source context show 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($contextName)) { throw 'Docker context unavailable.' }
$endpoint = (& $dockerCommand.Source context inspect $contextName --format '{{.Endpoints.docker.Host}}' 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$') {
  throw 'Refusing a remote or ambiguous Docker endpoint.'
}
function Invoke-R8Docker {
  param([string[]]$Arguments)
  $priorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $dockerCommand.Source --context $contextName @Arguments 2>$null)
    $exit = $LASTEXITCODE
  } finally { $ErrorActionPreference = $priorPreference }
  if ($exit -ne 0) { throw "Docker operation failed: $($Arguments[0]). Inspect only this task's container." }
  return ($output -join "`n")
}
$null = Invoke-R8Docker -Arguments @('info', '--format', '{{.ServerVersion}}')

$runId = [Guid]::NewGuid().ToString('N')
$containerName = "educore-r8-scheduling-native-$runId"
$databaseName = 'educore_r4_r8' # Required by the standalone test's admission contract.
$apiRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidenceRoot = Join-Path ([System.IO.Path]::GetTempPath()) "educore-r8-scheduling-native-$runId"
if (Test-Path -LiteralPath $evidenceRoot) { throw 'Evidence path already exists.' }
$null = New-Item -ItemType Directory -Path $evidenceRoot
$portProbe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
try { $portProbe.Start(); $hostPort = $portProbe.LocalEndpoint.Port } finally { $portProbe.Stop() }
$passwordBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($passwordBytes) } finally { $random.Dispose() }
$privatePassword = [System.BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
$priorPassword = [Environment]::GetEnvironmentVariable('POSTGRES_PASSWORD', 'Process')
$priorDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
$priorTestUrl = [Environment]::GetEnvironmentVariable('R8_TEST_URL', 'Process')
$priorAdmission = [Environment]::GetEnvironmentVariable('R8_TEST_DISPOSABLE', 'Process')
$environment = [ordered]@{
  runId = $runId; container = $containerName; database = $databaseName
  host = '127.0.0.1'; port = $hostPort; status = 'STARTING'
  storage = 'Fresh container, anonymous image PGDATA volume; no supplied mount or volumes-from'
}
function Save-R8Environment {
  $environment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'environment.json') -Encoding UTF8
}
Save-R8Environment
try {
  $env:POSTGRES_PASSWORD = $privatePassword
  $containerId = (Invoke-R8Docker -Arguments @(
    'run', '--detach', '--name', $containerName,
    '--label', "educore.r8.scheduling.disposable=$runId",
    '--publish', "127.0.0.1:${hostPort}:5432",
    '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=r8_test_admin',
    '--env', "POSTGRES_DB=$databaseName", 'postgres:16'
  )).Trim()
  if ($containerId -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected Docker container identity.' }
  $container = (Invoke-R8Docker -Arguments @('inspect', '--format', '{{json .}}', $containerName)) | ConvertFrom-Json
  $bindings = @($container.NetworkSettings.Ports.'5432/tcp')
  if ($container.Id -ne $containerId -or $container.Config.Labels.'educore.r8.scheduling.disposable' -ne $runId -or
      $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne [string]$hostPort -or
      @($container.Mounts | Where-Object { $_.Type -ne 'volume' }).Count -ne 0) {
    throw 'Container ownership, storage or loopback binding does not match this task.'
  }
  $environment.containerId = $containerId
  $environment.imageId = $container.Image
  $environment.mounts = @($container.Mounts | Select-Object Type, Name, Destination)
  Save-R8Environment
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & $dockerCommand.Source --context $contextName exec $containerName pg_isready --host 127.0.0.1 --quiet --username r8_test_admin --dbname $databaseName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'New task cluster did not become ready.' }
  $admissionSql = @'
SELECT json_build_object(
 'database',current_database(), 'serverVersionNum',current_setting('server_version_num')::int,
 'publicTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
 'migrationTables',(SELECT count(*) FROM pg_class WHERE relname='_prisma_migrations'),
 'roleConflicts',(SELECT count(*) FROM pg_roles WHERE rolname IN ('educore_r1b_guard_owner','educore_r1b_api','educore_r2_owner','educore_r3_owner','educore_r4_owner')),
 'otherDatabases',(SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',current_database())),
 'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));
'@
  $admission = (Invoke-R8Docker -Arguments @('exec', $containerName, 'psql', '-X', '-t', '-A', '--no-password', '-U', 'r8_test_admin', '-d', $databaseName, '-c', $admissionSql)) | ConvertFrom-Json
  if ($admission.database -ne $databaseName -or $admission.serverVersionNum -lt 160000 -or $admission.serverVersionNum -ge 170000 -or
      $admission.publicTables -ne 0 -or $admission.migrationTables -ne 0 -or $admission.roleConflicts -ne 0 -or
      $admission.otherDatabases -ne 0 -or -not $admission.superuser) {
    throw 'Fresh PostgreSQL 16 admission failed; no migrations or tests were run.'
  }
  $environment.admission = $admission
  $environment.status = 'ADMITTED_FRESH_DISPOSABLE'
  Save-R8Environment
  $privateUrl = "postgresql://r8_test_admin:$([Uri]::EscapeDataString($privatePassword))@127.0.0.1:$hostPort/$databaseName"
  $env:DATABASE_URL = $privateUrl
  Push-Location -LiteralPath $apiRoot
  try {
    $priorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $null = & $pnpmCommand.Source exec prisma migrate deploy 2>&1
      $migrationExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $priorPreference }
  } finally { Pop-Location }
  $environment.migrationExitCode = $migrationExit
  if ($migrationExit -ne 0) { $environment.status = 'MIGRATION_FAILED_REVIEW_REQUIRED'; Save-R8Environment; throw 'Migrations failed on the fresh task cluster.' }
  $postSql = @'
SELECT json_build_object(
 'migrations',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL),
 'failedMigrations',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
 'tenants',(SELECT count(*) FROM public.tenants));
'@
  $post = (Invoke-R8Docker -Arguments @('exec', $containerName, 'psql', '-X', '-t', '-A', '--no-password', '-U', 'r8_test_admin', '-d', $databaseName, '-c', $postSql)) | ConvertFrom-Json
  $expectedMigrations = @(Get-ChildItem -LiteralPath (Join-Path $apiRoot 'prisma/migrations') -Recurse -Filter migration.sql -File).Count
  if ($post.migrations -ne $expectedMigrations -or $post.migrations -lt 36 -or $post.failedMigrations -ne 0 -or $post.tenants -ne 0) {
    throw 'Post-migration empty-tenant admission failed.'
  }
  $environment.postMigration = $post
  $environment.status = 'R8_ADMITTED'
  Save-R8Environment
  $env:R8_TEST_URL = $privateUrl
  $env:R8_TEST_DISPOSABLE = 'I_OWN_THIS_DISPOSABLE_CLUSTER'
  Write-Host "Task-owned PostgreSQL 16 container: $containerName; loopback port: $hostPort"
  Write-Host "Sanitized environment evidence: $evidenceRoot"
  Push-Location -LiteralPath $apiRoot
  try {
    $priorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & $pnpmCommand.Source exec vitest run --config ./vitest.config.r8-scheduling.ts
      $testExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $priorPreference }
  } finally { Pop-Location }
  $environment.nativeTestExitCode = $testExit
  $environment.status = if ($testExit -eq 0) { 'SUITE_FINISHED_REVIEW_REQUIRED' } else { 'SUITE_FAILED_REVIEW_REQUIRED' }
  Save-R8Environment
  if ($testExit -ne 0) { throw 'Standalone R8 suite failed. Keep this task-owned cluster for review.' }
} finally {
  [Environment]::SetEnvironmentVariable('POSTGRES_PASSWORD', $priorPassword, 'Process')
  [Environment]::SetEnvironmentVariable('DATABASE_URL', $priorDatabaseUrl, 'Process')
  [Environment]::SetEnvironmentVariable('R8_TEST_URL', $priorTestUrl, 'Process')
  [Environment]::SetEnvironmentVariable('R8_TEST_DISPOSABLE', $priorAdmission, 'Process')
  [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
  $privatePassword = $null
  $privateUrl = $null
}
