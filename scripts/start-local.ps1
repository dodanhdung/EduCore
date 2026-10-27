#requires -Version 5.1
<# EduCore synthetic Windows demo. -Initialize is the only database-creation path. #>
[CmdletBinding()]
param([switch]$Initialize)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$apiRoot = Join-Path $root 'apps/api'
$webRoot = Join-Path $root 'apps/web'
$localRoot = Join-Path $root '.local'
$configPath = Join-Path $localRoot 'config.json'
$runPath = Join-Path $localRoot 'run.json'
$storageRoot = Join-Path $localRoot 'private-files'
$logRoot = Join-Path $localRoot 'logs'
$apiPort = 3000
$webPort = 5173
$node = (Get-Command node -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$docker = (Get-Command docker -ErrorAction Stop).Source
$nodeVersion = [Version](([string](& $node --version)).TrimStart('v'))
if ($nodeVersion -lt [Version]'24.12.0') { throw 'NODE_24_12_OR_NEWER_REQUIRED' }
$pnpmVersion = (& $pnpm --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $pnpmVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'PNPM_UNAVAILABLE' }
if (-not (Test-Path (Join-Path $apiRoot 'node_modules/prisma/build/index.js')) -or
    -not (Test-Path (Join-Path $webRoot 'node_modules/vite/bin/vite.js'))) { throw 'DEPENDENCIES_MISSING: run pnpm.cmd install --frozen-lockfile' }

function New-Secret([int]$size = 32) {
  $bytes = New-Object byte[] $size
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes) }
  finally { $rng.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}
function Protect-Secret([string]$value) {
  $secure = ConvertTo-SecureString $value -AsPlainText -Force
  try { return ConvertFrom-SecureString $secure }
  finally { $secure.Dispose() }
}
function Unprotect-Secret([string]$value) {
  $secure = ConvertTo-SecureString $value
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
function New-Port {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  try { $listener.Start(); return [int]$listener.LocalEndpoint.Port }
  finally { $listener.Stop() }
}
function Port-Free([int]$port) {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
  try { $listener.Start(); return $true } catch { return $false }
  finally { try { $listener.Stop() } catch { } }
}
function Save-Config($value) {
  [IO.File]::WriteAllText($configPath,($value | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}
function Run-Pnpm([string[]]$arguments, [string]$failure) {
  $ErrorActionPreference = 'Continue'
  try { & $pnpm @arguments *> $null; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = 'Stop' }
  if ($code -ne 0) { throw $failure }
}
function Run-AdminNode([string]$code, [string]$failure) {
  Push-Location $apiRoot
  $ErrorActionPreference = 'Continue'
  try { $output = $code | & $node --input-type=module - 2>$null; $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = 'Stop'; Pop-Location }
  if ($exitCode -ne 0) { throw $failure }
  return ($output | Out-String).Trim()
}
function Await-Http([string]$url, [Diagnostics.Process]$process) {
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    if ($process.HasExited) { throw "SERVICE_EXITED: $url" }
    try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { return $response } }
    catch { Start-Sleep -Milliseconds 200 }
  }
  throw "SERVICE_START_TIMEOUT: $url"
}

$context = (& $docker context show 2>$null | Out-String).Trim()
$endpoint = (& $docker context inspect $context --format '{{.Endpoints.docker.Host}}' 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$') { throw 'LOCAL_DOCKER_CONTEXT_REQUIRED' }
& $docker --context $context info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'DOCKER_DESKTOP_UNAVAILABLE: start Docker Desktop first' }
if (-not (Test-Path -LiteralPath $localRoot)) { $null = New-Item -ItemType Directory -Path $localRoot }
$lock = [IO.File]::Open((Join-Path $localRoot 'start.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$started = New-Object Collections.Generic.List[Diagnostics.Process]
$databaseStarted = $false
try {
  if (Test-Path -LiteralPath $runPath) {
    $oldRun = Get-Content -LiteralPath $runPath -Raw | ConvertFrom-Json
    if ((Get-Process -Id $oldRun.apiPid -ErrorAction SilentlyContinue) -or
        (Get-Process -Id $oldRun.webPid -ErrorAction SilentlyContinue)) { throw 'LOCAL_ALREADY_RUNNING: use scripts/stop-local.ps1 first' }
    Remove-Item -LiteralPath $runPath
  }
  if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($Initialize -and $config.initialized) { throw 'LOCAL_ALREADY_INITIALIZED: start without -Initialize' }
    if (-not $Initialize -and -not $config.initialized) { throw 'LOCAL_INITIALIZATION_INCOMPLETE: review before rerunning -Initialize' }
  } elseif (-not $Initialize) { throw 'LOCAL_SETUP_REQUIRED: run scripts/start-local.ps1 -Initialize once' }
  else {
    $id = [Guid]::NewGuid().ToString('N')
    $pgPort = New-Port
    $config = [ordered]@{
      schemaVersion = 1; initialized = $false; id = $id; context = $context
      container = "educore-local-mvp-$($id.Substring(0,12))"; containerId = ''
      database = "educore_demo_local_$id"; pgPort = $pgPort
      authRole = "local_auth_$($id.Substring(0,12))"; apiRole = "local_api_$($id.Substring(0,12))"
      workerRole = "local_worker_$($id.Substring(0,12))"
      adminSecret = Protect-Secret (New-Secret); authSecret = Protect-Secret (New-Secret)
      apiSecret = Protect-Secret (New-Secret); workerSecret = Protect-Secret (New-Secret)
      jwtSecret = Protect-Secret (New-Secret); pepperSecret = Protect-Secret (New-Secret)
    }
    $adminPassword = Unprotect-Secret $config.adminSecret
    $env:POSTGRES_PASSWORD = $adminPassword
    try { $created = (& $docker --context $context run --detach --name $config.container --label "educore.local.instance=$id" --publish "127.0.0.1:${pgPort}:5432" --env POSTGRES_PASSWORD --env 'POSTGRES_USER=local_admin' --env "POSTGRES_DB=$($config.database)" 'postgres:16' 2>$null | Out-String).Trim() }
    finally { Remove-Item Env:POSTGRES_PASSWORD -ErrorAction SilentlyContinue }
    if ($LASTEXITCODE -ne 0 -or $created -notmatch '^[0-9a-f]{64}$') { throw 'LOCAL_POSTGRES_CREATE_FAILED' }
    $config.containerId = $created
    Save-Config $config
    $databaseStarted = $true
  }
  if ($config.schemaVersion -ne 1 -or $config.context -ne $context -or
      $config.container -notmatch '^educore-local-mvp-[0-9a-f]{12}$' -or
      $config.database -notmatch '^educore_demo_local_[0-9a-f]{32}$') { throw 'LOCAL_CONFIG_IDENTITY_INVALID' }
  $inspect = (& $docker --context $context inspect --format '{{json .}}' $config.container 2>$null | Out-String | ConvertFrom-Json)
  $binding = @($inspect.HostConfig.PortBindings.'5432/tcp')
  if ($inspect.Id -ne $config.containerId -or $inspect.Config.Labels.'educore.local.instance' -ne $config.id -or
      $binding.Count -ne 1 -or $binding[0].HostIp -ne '127.0.0.1' -or $binding[0].HostPort -ne [string]$config.pgPort -or
      @($inspect.Mounts | Where-Object { $_.Type -ne 'volume' }).Count -ne 0) { throw 'LOCAL_CONTAINER_IDENTITY_OR_STORAGE_MISMATCH' }
  if (-not $inspect.State.Running) {
    & $docker --context $context start $config.container 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRES_START_FAILED' }
    $databaseStarted = $true
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & $docker --context $context exec $config.container pg_isready --host 127.0.0.1 --quiet --username local_admin --dbname $config.database 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'LOCAL_POSTGRES_NOT_READY' }
  $version = (& $docker --context $context exec $config.container psql -X -t -A --no-password -U local_admin -d $config.database -c 'SHOW server_version_num' 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [int]$version -lt 160000 -or [int]$version -ge 170000) { throw 'POSTGRES_16_REQUIRED' }
  $adminPassword = Unprotect-Secret $config.adminSecret
  $adminUrl = "postgresql://local_admin:$([Uri]::EscapeDataString($adminPassword))@127.0.0.1:$($config.pgPort)/$($config.database)"
  if ($Initialize -and -not $config.initialized) {
    $env:LOCAL_ADMIN_URL = $adminUrl
    $admission = Run-AdminNode @'
import postgres from 'postgres';
const sql=postgres(process.env.LOCAL_ADMIN_URL,{max:1});
try {const [r]=await sql`SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables,(SELECT count(*)::int FROM pg_class WHERE relname='_prisma_migrations') migrations,(SELECT count(*)::int FROM pg_class WHERE relname='tenants') tenants`; console.log(JSON.stringify(r));} finally {await sql.end();}
'@ 'LOCAL_DATABASE_ADMISSION_FAILED' | ConvertFrom-Json
    if ($admission.tables -ne 0 -or $admission.migrations -ne 0 -or $admission.tenants -ne 0) { throw 'LOCAL_DATABASE_NOT_EMPTY: manual review required' }
    $env:DATABASE_URL = $adminUrl
    try { Run-Pnpm @('--dir',$apiRoot,'exec','prisma','migrate','deploy') 'LOCAL_MIGRATION_FAILED' }
    finally { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
    foreach ($kind in @('AUTH','API','WORKER')) {
      $roleProperty = ($kind.ToLower() + 'Role'); $secretProperty = ($kind.ToLower() + 'Secret')
      [Environment]::SetEnvironmentVariable("LOCAL_ROLE_$kind",$config.$roleProperty,'Process')
      [Environment]::SetEnvironmentVariable("LOCAL_PASS_$kind",(Unprotect-Secret $config.$secretProperty),'Process')
    }
    try { $null = Run-AdminNode @'
import postgres from 'postgres';
const sql=postgres(process.env.LOCAL_ADMIN_URL,{max:1});
const groups={AUTH:'educore_r4_auth',API:'educore_r4_api',WORKER:'educore_r4_worker'};
try {for(const [kind,parent] of Object.entries(groups)){const name=process.env[`LOCAL_ROLE_${kind}`],pass=process.env[`LOCAL_PASS_${kind}`]; if(!/^local_(auth|api|worker)_[0-9a-f]{12}$/.test(name)|| !/^[A-Za-z0-9+/=]+$/.test(pass))throw Error('LOCAL_ROLE_INVALID');await sql.unsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${parent}`);}console.log('LOCAL_ROLES_CREATED');}finally{await sql.end();}
'@ 'LOCAL_ROLE_PROVISION_FAILED' }
    finally { foreach ($kind in @('AUTH','API','WORKER')) { [Environment]::SetEnvironmentVariable("LOCAL_ROLE_$kind",$null,'Process'); [Environment]::SetEnvironmentVariable("LOCAL_PASS_$kind",$null,'Process') } }
    $env:DEMO_DATABASE_URL = $adminUrl
    $env:DEMO_SEED_CONFIRM = 'I_UNDERSTAND_DEMO_DATA'
    try { Run-Pnpm @('--dir',$apiRoot,'seed:demo') 'LOCAL_DEMO_SEED_FAILED' }
    finally { Remove-Item Env:DEMO_DATABASE_URL,Env:DEMO_SEED_CONFIRM -ErrorAction SilentlyContinue }
    $renamed = Run-AdminNode @'
import postgres from 'postgres';
const sql=postgres(process.env.LOCAL_ADMIN_URL,{max:1});
try {const r=await sql`UPDATE public.users SET email_normalized='admin@local.invalid' WHERE email_normalized='admin@educore.local' RETURNING id`;if(r.length!==1)throw Error('LOCAL_DEMO_USER_MISSING');console.log('LOCAL_DEMO_USER_READY');}finally{await sql.end();}
'@ 'LOCAL_DEMO_ACCOUNT_FAILED'
    if ($renamed -ne 'LOCAL_DEMO_USER_READY') { throw 'LOCAL_DEMO_ACCOUNT_FAILED' }
    $config.initialized = $true
    Save-Config $config
  }
  $env:DATABASE_URL = $adminUrl
  try { Run-Pnpm @('--dir',$apiRoot,'exec','prisma','migrate','status') 'LOCAL_MIGRATION_MISMATCH: review before applying migrations' }
  finally { Remove-Item Env:DATABASE_URL,Env:LOCAL_ADMIN_URL -ErrorAction SilentlyContinue }
  if (-not (Test-Path (Join-Path $apiRoot 'src/generated/prisma/client.ts'))) { Run-Pnpm @('--dir',$apiRoot,'prisma:generate') 'PRISMA_CLIENT_GENERATION_FAILED' }
  Run-Pnpm @('--dir',$apiRoot,'build') 'LOCAL_API_BUILD_FAILED'
  if (-not (Port-Free $apiPort) -or -not (Port-Free $webPort)) { throw 'LOCAL_PORT_IN_USE: 3000 or 5173; stop the owning process manually' }
  $null = New-Item -ItemType Directory -Path $storageRoot -Force
  $null = New-Item -ItemType Directory -Path $logRoot -Force
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $urlFor = {
    param([string]$kind)
    $role = $config.($kind + 'Role'); $password = Unprotect-Secret $config.($kind + 'Secret')
    "postgresql://${role}:$([Uri]::EscapeDataString($password))@127.0.0.1:$($config.pgPort)/$($config.database)"
  }
  $env:NODE_ENV = 'development'
  $env:PORT = [string]$apiPort
  $env:R4_BIND_HOST = '127.0.0.1'
  $env:R4_AUTH_URL = & $urlFor 'auth'
  $env:R4_API_URL = & $urlFor 'api'
  $env:R4_WORKER_URL = & $urlFor 'worker'
  $env:R4_WORKER_ENABLED = '1'
  $env:R4_JWT_SECRET = Unprotect-Secret $config.jwtSecret
  $env:R4_OTP_PEPPER = Unprotect-Secret $config.pepperSecret
  $env:R4_JWT_ISSUER = 'educore-local-mvp'
  $env:R4_JWT_AUDIENCE = 'educore-local-web'
  $env:R4_WEB_ORIGINS = "http://127.0.0.1:$webPort"
  $env:R4_OTP_MODE = 'unavailable'
  $env:R5_PRIVATE_STORAGE_ROOT = $storageRoot
  try { $apiProcess = Start-Process -FilePath $node -ArgumentList @('dist/main.js') -WorkingDirectory $apiRoot -RedirectStandardOutput (Join-Path $logRoot "api-$stamp.stdout.log") -RedirectStandardError (Join-Path $logRoot "api-$stamp.stderr.log") -WindowStyle Hidden -PassThru; $started.Add($apiProcess) }
  finally { foreach ($key in @('NODE_ENV','PORT','R4_BIND_HOST','R4_AUTH_URL','R4_API_URL','R4_WORKER_URL','R4_WORKER_ENABLED','R4_JWT_SECRET','R4_OTP_PEPPER','R4_JWT_ISSUER','R4_JWT_AUDIENCE','R4_WEB_ORIGINS','R4_OTP_MODE','R5_PRIVATE_STORAGE_ROOT')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') } }
  $apiOrigin = "http://127.0.0.1:$apiPort"
  $null = Await-Http "$apiOrigin/" $apiProcess
  $env:VITE_API_BASE_URL = $apiOrigin
  try { $webProcess = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',[string]$webPort,'--strictPort') -WorkingDirectory $webRoot -RedirectStandardOutput (Join-Path $logRoot "web-$stamp.stdout.log") -RedirectStandardError (Join-Path $logRoot "web-$stamp.stderr.log") -WindowStyle Hidden -PassThru; $started.Add($webProcess) }
  finally { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue }
  $webOrigin = "http://127.0.0.1:$webPort"
  $page = Await-Http "$webOrigin/login" $webProcess
  if ($page.Content -notmatch 'src/main.tsx') { throw 'LOCAL_WEB_UNEXPECTED_PAGE' }
  $run = [ordered]@{ configId = $config.id; containerId = $config.containerId; databaseStartedByLauncher = $databaseStarted
    apiPid = $apiProcess.Id; apiStartedUtc = $apiProcess.StartTime.ToUniversalTime().ToString('o')
    webPid = $webProcess.Id; webStartedUtc = $webProcess.StartTime.ToUniversalTime().ToString('o')
    webUrl = "$webOrigin/login"; apiUrl = $apiOrigin; logStamp = $stamp }
  [IO.File]::WriteAllText($runPath,($run | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  Write-Host "EduCore local MVP running: $($run.webUrl)"
  Write-Host "API healthy: $apiOrigin/ | Demo email: admin@local.invalid | Tenant: EduCore Demo"
  Write-Host 'Password: inspect apps/api/scripts/seed-demo.ts locally. Stop: .\scripts\stop-local.ps1'
  Write-Host "Logs: .local/logs/*-$stamp.*.log"
} catch {
  foreach ($process in $started) { try { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force } } catch { } }
  if ($databaseStarted -and $config -and $config.containerId) {
    try { & $docker --context $context stop $config.container 2>$null | Out-Null } catch { }
  }
  throw
} finally { $lock.Dispose(); $adminPassword = $null; $adminUrl = $null }
