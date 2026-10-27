#requires -Version 5.1
<#
Local, disposable production-entry smoke. Requires built API/Web, installed pnpm,
Docker Desktop, and an existing synthetic seed-demo password supplied only in
the EDUCORE_DEMO_PASSWORD process environment. No live service is contacted.
The task-owned container and anonymous volume are retained for review.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$apiRoot = Join-Path $root 'apps/api'
$webRoot = Join-Path $root 'apps/web'
$node = (Get-Command node -ErrorAction Stop).Source
$docker = (Get-Command docker -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
if (-not $env:EDUCORE_DEMO_PASSWORD) { throw 'EDUCORE_DEMO_PASSWORD_REQUIRED' }
$demoPassword = $env:EDUCORE_DEMO_PASSWORD
Remove-Item Env:EDUCORE_DEMO_PASSWORD -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $apiRoot 'dist/main.js'))) { throw 'BUILD_API_FIRST' }
if (-not (Test-Path (Join-Path $webRoot 'node_modules/vite/bin/vite.js'))) { throw 'INSTALL_WEB_FIRST' }

$context = (& $docker context show 2>$null | Out-String).Trim()
$endpoint = (& $docker context inspect $context --format '{{.Endpoints.docker.Host}}' 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$') { throw 'LOCAL_DOCKER_CONTEXT_REQUIRED' }
& $docker --context $context info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_DOCKER_UNAVAILABLE' }

function New-Secret([int]$count = 32) {
  $bytes = New-Object byte[] $count
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes) }
  finally { $rng.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}
function New-Port {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  try { $listener.Start(); return $listener.LocalEndpoint.Port }
  finally { $listener.Stop() }
}
function Await-Http([string]$url) {
  for ($i = 0; $i -lt 80; $i++) {
    try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { return $response } }
    catch { Start-Sleep -Milliseconds 250 }
  }
  throw "HTTP_STARTUP_TIMEOUT: $url"
}
function Status-Of([scriptblock]$operation) {
  try { $response = & $operation; return [int]$response.StatusCode }
  catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    throw
  }
}
function Require-Status([int]$actual, [int]$expected, [string]$operation) {
  if ($actual -ne $expected) { throw "UNEXPECTED_HTTP_STATUS:${operation}:expected=${expected}:actual=${actual}" }
  return $actual
}
function Read-JsonResponse([scriptblock]$operation, [int]$expected, [string]$name) {
  $response = & $operation
  $status = Require-Status ([int]$response.StatusCode) $expected $name
  return @{ status = $status; body = ($response.Content | ConvertFrom-Json) }
}

$runId = [Guid]::NewGuid().ToString('N')
$container = "educore-pilot-smoke-$runId"
$dbName = "educore_demo_$runId"
$pgPort = New-Port
$apiPort = New-Port
$smtpPort = New-Port
$webPort = 5173
$evidenceRoot = Join-Path ([IO.Path]::GetTempPath()) "educore-pilot-smoke-$runId"
if (Test-Path -LiteralPath $evidenceRoot) { throw 'EVIDENCE_PATH_ALREADY_EXISTS' }
$null = New-Item -ItemType Directory -Path $evidenceRoot
$storageRoot = Join-Path $evidenceRoot 'private-files'
$null = New-Item -ItemType Directory -Path $storageRoot
$started = New-Object Collections.Generic.List[Diagnostics.Process]
$result = [ordered]@{ runId = $runId; sourceRevision = (git rev-parse HEAD).Trim(); container = $container; postgresMajor = 16; status = 'STARTING'; startup = @{}; http = @{} }
try {
  $adminPassword = New-Secret
  $env:POSTGRES_PASSWORD = $adminPassword
  $containerId = (& $docker --context $context run --detach --name $container --label "educore.pilot.disposable=$runId" --publish "127.0.0.1:${pgPort}:5432" --env POSTGRES_PASSWORD --env 'POSTGRES_USER=pilot_test_admin' --env "POSTGRES_DB=$dbName" 'postgres:16' 2>$null | Out-String).Trim()
  Remove-Item Env:POSTGRES_PASSWORD -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0 -or $containerId -notmatch '^[0-9a-f]{64}$') { throw 'FRESH_CONTAINER_CREATE_FAILED' }
  $inspect = (& $docker --context $context inspect --format '{{json .}}' $container 2>$null | Out-String | ConvertFrom-Json)
  $binding = @($inspect.NetworkSettings.Ports.'5432/tcp')
  if ($inspect.Id -ne $containerId -or $inspect.Config.Labels.'educore.pilot.disposable' -ne $runId -or
      $binding.Count -ne 1 -or $binding[0].HostIp -ne '127.0.0.1' -or $binding[0].HostPort -ne [string]$pgPort -or
      @($inspect.Mounts | Where-Object { $_.Type -ne 'volume' }).Count -ne 0) { throw 'CONTAINER_OWNERSHIP_OR_STORAGE_MISMATCH' }
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    & $docker --context $context exec $container pg_isready --host 127.0.0.1 --quiet --username pilot_test_admin --dbname $dbName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'FRESH_POSTGRES_NOT_READY' }
  $admissionSql = "SELECT json_build_object('version',current_setting('server_version_num')::int,'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'migrations',(SELECT count(*) FROM pg_class WHERE relname='_prisma_migrations'),'tenants',(SELECT count(*) FROM pg_class WHERE relname='tenants'),'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));"
  $admission = (& $docker --context $context exec $container psql -X -t -A --no-password -U pilot_test_admin -d $dbName -c $admissionSql 2>$null | Out-String | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $admission.version -lt 160000 -or $admission.version -ge 170000 -or
      $admission.tables -ne 0 -or $admission.migrations -ne 0 -or $admission.tenants -ne 0 -or -not $admission.superuser) { throw 'FRESH_DATABASE_ADMISSION_FAILED' }
  $result.startup.freshPg16Admission = 'PASS'
  $adminUrl = "postgresql://pilot_test_admin:$([Uri]::EscapeDataString($adminPassword))@127.0.0.1:$pgPort/$dbName"
  $env:DATABASE_URL = $adminUrl
  $ErrorActionPreference = 'Continue'
  try { $migrateOutput = & $pnpm --dir $apiRoot exec prisma migrate deploy 2>&1; $migrateExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = 'Stop' }
  if ($migrateExit -ne 0) { throw 'PRISMA_MIGRATION_FAILED' }
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $result.startup.migrateDeploy = 'PASS'

  $shortId = $runId.Substring(0, 12)
  $roles = [ordered]@{ auth = "pilot_auth_$shortId"; api = "pilot_api_$shortId"; worker = "pilot_worker_$shortId"; otp = "pilot_otp_$shortId" }
  $passwords = [ordered]@{ auth = New-Secret; api = New-Secret; worker = New-Secret; otp = New-Secret }
  $env:PILOT_ADMIN_URL = $adminUrl
  foreach ($kind in $roles.Keys) {
    [Environment]::SetEnvironmentVariable("PILOT_ROLE_$($kind.ToUpper())", $roles[$kind], 'Process')
    [Environment]::SetEnvironmentVariable("PILOT_PASS_$($kind.ToUpper())", $passwords[$kind], 'Process')
  }
  $provision = @'
import postgres from 'postgres';
const sql = postgres(process.env.PILOT_ADMIN_URL, { max: 1 });
const group = { AUTH: 'educore_r4_auth', API: 'educore_r4_api', WORKER: 'educore_r4_worker', OTP: 'educore_r4_otp_delivery' };
try {
  for (const [key, parent] of Object.entries(group)) {
    const name = process.env[`PILOT_ROLE_${key}`], pass = process.env[`PILOT_PASS_${key}`];
    if (!/^pilot_[a-z]+_[0-9a-f]{12}$/.test(name) || !/^[A-Za-z0-9+/=]+$/.test(pass)) throw Error('UNSAFE_ROLE_INPUT');
    await sql.unsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${parent}`);
  }
  const [m] = await sql`SELECT count(*)::int finished FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  const [f] = await sql`SELECT count(*)::int failed FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  const [t] = await sql`SELECT count(*)::int tenants FROM public.tenants`;
  if (m.finished !== 50 || f.failed !== 0 || t.tenants !== 0) throw Error('MIGRATION_POSTCHECK_FAILED');
  console.log(JSON.stringify({ finishedMigrations: m.finished, failedMigrations: f.failed, preSeedTenants: t.tenants }));
} finally { await sql.end(); }
'@
  Push-Location $apiRoot
  try { $provisionResult = ($provision | & $node --input-type=module - | Out-String | ConvertFrom-Json); if ($LASTEXITCODE -ne 0) { throw 'ROLE_PROVISION_FAILED' } }
  finally { Pop-Location }
  $result.startup.restrictedRoles = 'PASS'
  $result.startup.finishedMigrations = $provisionResult.finishedMigrations
  $env:DEMO_DATABASE_URL = $adminUrl
  $env:DEMO_SEED_CONFIRM = 'I_UNDERSTAND_DEMO_DATA'
  $ErrorActionPreference = 'Continue'
  try { & $pnpm --dir $apiRoot seed:demo *> $null; $seedExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = 'Stop' }
  if ($seedExit -ne 0) { throw 'DEMO_SEED_FAILED' }
  Remove-Item Env:DEMO_DATABASE_URL,Env:DEMO_SEED_CONFIRM -ErrorAction SilentlyContinue
  $rename = @'
import postgres from 'postgres';
const sql = postgres(process.env.PILOT_ADMIN_URL, { max: 1 });
try {
  const changed = await sql`UPDATE public.users SET email_normalized='admin@pilot.invalid' WHERE email_normalized='admin@educore.local' RETURNING id`;
  if (changed.length !== 1) throw Error('SYNTHETIC_ACCOUNT_RENAME_FAILED');
  const [row] = await sql`SELECT count(*)::int count FROM public.tenants WHERE code='DEMO_EDUCORE_01'`;
  if (row.count !== 1) throw Error('DEMO_TENANT_MISSING');
  console.log('SYNTHETIC_DEMO_READY');
} finally { await sql.end(); }
'@
  Push-Location $apiRoot
  try { $renameResult = $rename | & $node --input-type=module -; if ($LASTEXITCODE -ne 0 -or $renameResult -ne 'SYNTHETIC_DEMO_READY') { throw 'DEMO_FIXTURE_CHECK_FAILED' } }
  finally { Pop-Location }
  $result.startup.syntheticSeed = 'PASS'

  foreach ($kind in $roles.Keys) {
    [Environment]::SetEnvironmentVariable("PILOT_ROLE_$($kind.ToUpper())", $null, 'Process')
    [Environment]::SetEnvironmentVariable("PILOT_PASS_$($kind.ToUpper())", $null, 'Process')
  }
  Remove-Item Env:PILOT_ADMIN_URL -ErrorAction SilentlyContinue
  $urlFor = {
    param([string]$kind)
    "postgresql://$($roles[$kind]):$([Uri]::EscapeDataString($passwords[$kind]))@127.0.0.1:$pgPort/$dbName"
  }
  $recoveryKey = New-Secret
  $env:NODE_ENV = 'development'
  $env:PORT = [string]$apiPort
  $env:R4_AUTH_URL = & $urlFor 'auth'
  $env:R4_API_URL = & $urlFor 'api'
  $env:R4_WORKER_URL = & $urlFor 'worker'
  $env:R4_WORKER_ENABLED = '1'
  $env:R4_JWT_SECRET = New-Secret
  $env:R4_OTP_PEPPER = New-Secret
  $env:R4_JWT_ISSUER = 'educore-pilot-local'
  $env:R4_JWT_AUDIENCE = 'educore-web-local'
  $env:R4_WEB_ORIGINS = "http://localhost:$webPort"
  $env:R4_OTP_MODE = 'unavailable'
  $env:R4_RECOVERY_ACTIVE_KEY_ID = 'pilot-local'
  $env:R4_RECOVERY_ACTIVE_KEY = $recoveryKey
  $env:R5_PRIVATE_STORAGE_ROOT = $storageRoot
  $apiProcess = Start-Process -FilePath $node -ArgumentList @('dist/main.js') -WorkingDirectory $apiRoot -RedirectStandardOutput (Join-Path $evidenceRoot 'api.stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'api.stderr.log') -WindowStyle Hidden -PassThru
  $started.Add($apiProcess)
  $apiOrigin = "http://localhost:$apiPort"
  $null = Await-Http "$apiOrigin/"
  if ($apiProcess.HasExited) { throw 'API_PROCESS_EXITED' }
  $result.startup.builtApiRestrictedRoles = 'PASS'

  foreach ($key in @('R4_AUTH_URL','R4_API_URL','R4_WORKER_URL','R4_WORKER_ENABLED','R4_JWT_SECRET','R4_OTP_PEPPER','R4_JWT_ISSUER','R4_JWT_AUDIENCE','R4_WEB_ORIGINS','R4_OTP_MODE','R4_RECOVERY_ACTIVE_KEY_ID','R4_RECOVERY_ACTIVE_KEY','R5_PRIVATE_STORAGE_ROOT','PORT')) {
    [Environment]::SetEnvironmentVariable($key, $null, 'Process')
  }
  $smtpCode = @'
import { createServer } from 'node:net';
const server = createServer(socket => {
  socket.write('220 pilot.local ESMTP\r\n');
  let pending = '', data = false;
  socket.on('data', chunk => {
    pending += chunk.toString('utf8');
    while (pending.includes('\r\n')) {
      const end = pending.indexOf('\r\n'), line = pending.slice(0, end); pending = pending.slice(end + 2);
      if (data) { if (line === '.') { data = false; socket.write('250 queued locally\r\n'); } }
      else if (/^(EHLO|HELO) /i.test(line)) socket.write('250 pilot.local\r\n');
      else if (/^(MAIL FROM:|RCPT TO:)/i.test(line)) socket.write('250 ok\r\n');
      else if (line === 'DATA') { data = true; socket.write('354 continue\r\n'); }
      else if (line === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
    }
  });
  socket.on('error', () => {});
});
server.listen(Number(process.env.PILOT_SMTP_PORT), '127.0.0.1');
'@
  $smtpPath = Join-Path $evidenceRoot 'fake-smtp.mjs'
  [IO.File]::WriteAllText($smtpPath, $smtpCode, [Text.UTF8Encoding]::new($false))
  $env:PILOT_SMTP_PORT = [string]$smtpPort
  $smtpProcess = Start-Process -FilePath $node -ArgumentList @($smtpPath) -WorkingDirectory $evidenceRoot -RedirectStandardOutput (Join-Path $evidenceRoot 'smtp.stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'smtp.stderr.log') -WindowStyle Hidden -PassThru
  $started.Add($smtpProcess)
  Start-Sleep -Milliseconds 400
  if ($smtpProcess.HasExited) { throw 'LOCAL_SMTP_PROCESS_EXITED' }
  $env:R4_OTP_WORKER_URL = & $urlFor 'otp'
  $env:R4_RECOVERY_KEYS = @{ 'pilot-local' = $recoveryKey } | ConvertTo-Json -Compress
  $env:R4_SMTP_HOST = '127.0.0.1'
  $env:R4_SMTP_PORT = [string]$smtpPort
  $env:R4_SMTP_FROM = 'otp@pilot.invalid'
  $otpProcess = Start-Process -FilePath $node -ArgumentList @('dist/identity-access/recovery-worker-main.js') -WorkingDirectory $apiRoot -RedirectStandardOutput (Join-Path $evidenceRoot 'otp.stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'otp.stderr.log') -WindowStyle Hidden -PassThru
  $started.Add($otpProcess)
  Start-Sleep -Seconds 2
  if ($otpProcess.HasExited) { throw 'RESTRICTED_OTP_WORKER_EXITED' }
  $result.startup.restrictedOtpWorker = 'PASS'
  foreach ($key in @('R4_OTP_WORKER_URL','R4_RECOVERY_KEYS','R4_SMTP_HOST','R4_SMTP_PORT','R4_SMTP_FROM','PILOT_SMTP_PORT')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }

  $env:VITE_API_BASE_URL = $apiOrigin
  $ErrorActionPreference = 'Continue'
  try { & $pnpm --dir $webRoot build *> $null; $webBuildExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = 'Stop' }
  if ($webBuildExit -ne 0) { throw 'WEB_BUILD_FOR_SMOKE_FAILED' }
  Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
  $webProcess = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','preview','--host','localhost','--port',[string]$webPort,'--strictPort') -WorkingDirectory $webRoot -RedirectStandardOutput (Join-Path $evidenceRoot 'web.stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'web.stderr.log') -WindowStyle Hidden -PassThru
  $started.Add($webProcess)
  $web = Await-Http "http://localhost:$webPort/login"
  if ($webProcess.HasExited -or $web.Content -notmatch '/assets/') { throw 'BUILT_WEB_PREVIEW_FAILED' }
  $result.startup.builtWebPreview = 'PASS'
  $edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  if (Test-Path -LiteralPath $edgePath) {
    $edgeDom = Join-Path $evidenceRoot 'edge-login-dom.txt'
    $edgeProcess = Start-Process -FilePath $edgePath -ArgumentList @('--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',"--user-data-dir=$(Join-Path $evidenceRoot 'edge-profile')",'--dump-dom',"http://localhost:$webPort/login") -WorkingDirectory $evidenceRoot -RedirectStandardOutput $edgeDom -RedirectStandardError (Join-Path $evidenceRoot 'edge.stderr.log') -WindowStyle Hidden -PassThru
    $started.Add($edgeProcess)
    if ($edgeProcess.WaitForExit(15000) -and (Get-Content -LiteralPath $edgeDom -Raw) -match 'id="login-email"') {
      $result.startup.edgeProductionLoginRoute = 'PASS'
    } else { $result.startup.edgeProductionLoginRoute = 'NOT_VERIFIED' }
  } else { $result.startup.edgeProductionLoginRoute = 'NOT_RUN' }

  $origin = "http://localhost:$webPort"
  $body = @{ email = 'admin@pilot.invalid'; password = $demoPassword } | ConvertTo-Json -Compress
  $loginResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/auth/login" -Method Post -Headers @{ Origin = $origin } -ContentType 'application/json' -Body $body -UseBasicParsing } 200 'login'
  $login = $loginResponse.body
  if (-not $login.accessToken -or @($login.allowedTenants).Count -ne 1) { throw 'LOGIN_OR_TENANT_LIST_FAILED' }
  $tenant = $login.allowedTenants[0].id
  $selectResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/auth/select-tenant" -Method Post -Headers @{ Authorization = "Bearer $($login.accessToken)" } -ContentType 'application/json' -Body (@{ tenantId = $tenant } | ConvertTo-Json -Compress) -UseBasicParsing } 200 'selectTenant'
  $select = $selectResponse.body
  if (-not $select.accessToken -or $select.principal.tenantId -ne $tenant) { throw 'TENANT_SELECTION_FAILED' }
  $authorized = @{ Authorization = "Bearer $($select.accessToken)" }
  $navigationResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/tenants/$tenant/access/navigation" -Headers $authorized -UseBasicParsing } 200 'navigation'
  $overviewResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/tenants/$tenant/portal/overview" -Headers $authorized -UseBasicParsing } 200 'dashboard'
  $navigation = $navigationResponse.body
  $overview = $overviewResponse.body
  if (@($navigation.screenIds).Count -lt 1 -or $navigation.tenantId -ne $tenant -or
      $null -eq $overview.students -or $null -eq $overview.classes -or $null -eq $overview.outstandingVnd) { throw 'TENANT_BOUND_PROJECTIONS_FAILED' }
  $result.http.login = $loginResponse.status
  $result.http.selectTenant = $selectResponse.status
  $result.http.navigation = $navigationResponse.status
  $result.http.dashboard = $overviewResponse.status
  $result.http.dashboardShape = 'three_scoped_kpis'
  $env:PILOT_WEB_ORIGIN = $origin
  $env:PILOT_API_ORIGIN = $apiOrigin
  $env:PILOT_BROWSER_EMAIL = 'admin@pilot.invalid'
  $env:PILOT_BROWSER_PASSWORD = $demoPassword
  $env:PILOT_BROWSER_TENANT = $tenant
  $env:PILOT_BROWSER_SCENARIO = 'FINANCE_UI_SMOKE'
  $env:PILOT_AUDIT_DB_URL = $adminUrl
  $ErrorActionPreference = 'Continue'
  try { $browserOutput = & $node (Join-Path $PSScriptRoot 'built-web-browser.mjs') 2>&1; $browserExit = $LASTEXITCODE }
  finally {
    $ErrorActionPreference = 'Stop'
    foreach ($key in @('PILOT_WEB_ORIGIN','PILOT_API_ORIGIN','PILOT_BROWSER_EMAIL','PILOT_BROWSER_PASSWORD','PILOT_BROWSER_TENANT','PILOT_BROWSER_SCENARIO','PILOT_AUDIT_DB_URL')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
  }
  if ($browserExit -eq 0) { $result.browser = $browserOutput | Out-String | ConvertFrom-Json }
  else { $result.browser = @{ result = 'NOT_VERIFIED'; errorCode = 'BUILT_WEB_BROWSER_FAILED' } }
  if ($result.browser.topUp -eq 'PASS_UI_HTTP_200_WALLET_HISTORY') {
    $env:PILOT_ADMIN_URL = $adminUrl
    $financeCheck = @'
import postgres from 'postgres';
const sql = postgres(process.env.PILOT_ADMIN_URL, { max: 1 });
try {
  const [row] = await sql`SELECT
    (SELECT count(*)::int FROM public.wallet_transactions WHERE kind='TOP_UP' AND amount_vnd=1000) topups,
    (SELECT count(*)::int FROM public.payments) invoice_payments,
    (SELECT coalesce(sum(balance_vnd),0)::text FROM public.wallet_accounts) wallet_balance`;
  console.log(JSON.stringify(row));
} finally { await sql.end(); }
'@
    Push-Location $apiRoot
    try { $finance = $financeCheck | & $node --input-type=module - | Out-String | ConvertFrom-Json; if ($LASTEXITCODE -ne 0) { throw 'FINANCE_POSTCHECK_QUERY_FAILED' } }
    finally { Pop-Location; Remove-Item Env:PILOT_ADMIN_URL -ErrorAction SilentlyContinue }
    if ($finance.topups -ne 1 -or $finance.invoice_payments -ne 0 -or $finance.wallet_balance -ne '1000') { throw 'TOP_UP_INVOICE_OR_WALLET_INVARIANT_FAILED' }
    $result.browser | Add-Member -NotePropertyName financePersistence -NotePropertyValue @{ topUps = $finance.topups; invoicePayments = $finance.invoice_payments; walletBalanceVnd = $finance.wallet_balance }
  }
  $wrong = [Guid]::NewGuid().ToString()
  $crossTenantStatus = Status-Of { Invoke-WebRequest -Uri "$apiOrigin/api/v1/tenants/$wrong/portal/overview" -Headers $authorized -UseBasicParsing }
  $result.http.crossTenantStatus = Require-Status $crossTenantStatus 403 'crossTenant'
  $otpBody = @{ email = 'unknown@pilot.invalid' } | ConvertTo-Json -Compress
  $otpResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/auth/password/otp/request" -Method Post -ContentType 'application/json' -Body $otpBody -UseBasicParsing } 202 'unknownOtp'
  $otp = $otpResponse.body
  if ($otp.accepted -ne $true) { throw 'GENERIC_OTP_RESPONSE_FAILED' }
  $result.http.unknownOtp = $otpResponse.status
  $knownOtpResponse = Read-JsonResponse { Invoke-WebRequest -Uri "$apiOrigin/api/v1/auth/password/otp/request" -Method Post -ContentType 'application/json' -Body (@{ email='admin@pilot.invalid' } | ConvertTo-Json -Compress) -UseBasicParsing } 202 'knownOtp'
  $knownOtp = $knownOtpResponse.body
  if ($knownOtp.accepted -ne $true) { throw 'KNOWN_OTP_RESPONSE_FAILED' }
  $result.http.knownOtp = $knownOtpResponse.status
  $env:PILOT_ADMIN_URL = $adminUrl
  $deliveryCheck = @'
import postgres from 'postgres';
const sql = postgres(process.env.PILOT_ADMIN_URL, { max: 1 });
try { const [row] = await sql`SELECT status,attempt_count FROM educore_r4.recovery_otp_deliveries ORDER BY created_at DESC LIMIT 1`; console.log(JSON.stringify(row ?? {})); }
finally { await sql.end(); }
'@
  $accepted = $false
  for ($i = 0; $i -lt 30; $i++) {
    Push-Location $apiRoot
    try { $delivery = ($deliveryCheck | & $node --input-type=module - | Out-String | ConvertFrom-Json); if ($LASTEXITCODE -ne 0) { throw 'DELIVERY_QUERY_FAILED' } }
    finally { Pop-Location }
    if ($delivery.status -eq 'ACCEPTED_BY_SMTP') { $accepted = $true; break }
    Start-Sleep -Milliseconds 500
  }
  Remove-Item Env:PILOT_ADMIN_URL -ErrorAction SilentlyContinue
  if (-not $accepted) { throw 'LOCAL_OTP_DELIVERY_NOT_ACCEPTED' }
  $result.http.localOtpWorkerDelivery = 'ACCEPTED_BY_SMTP'
  $logoutResponse = Invoke-WebRequest -Uri "$apiOrigin/api/v1/auth/logout" -Method Post -Headers $authorized -UseBasicParsing
  $result.http.logout = Require-Status ([int]$logoutResponse.StatusCode) 204 'logout'
  $afterLogout = Status-Of { Invoke-WebRequest -Uri "$apiOrigin/api/v1/tenants/$tenant/portal/overview" -Headers $authorized -UseBasicParsing }
  $result.http.revokedSessionStatus = Require-Status $afterLogout 401 'revokedSession'
  if ($result.browser.result -ne 'PASS' -or $result.browser.scenario -ne 'FINANCE_UI_SMOKE' -or
      $result.browser.topUp -ne 'PASS_UI_HTTP_200_WALLET_HISTORY' -or
      $result.browser.financePersistence.invoicePaymentsAdded -ne 0) { throw 'FINANCE_UI_SMOKE_NOT_VERIFIED' }
  $result.status = 'PASS'
} catch {
  $result.status = 'FAIL'
  $result.errorCode = $_.Exception.Message -replace 'postgresql://[^\s]+','[REDACTED_URL]'
  throw
} finally {
  foreach ($process in $started) {
    try { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction Stop } }
    catch { }
  }
  $result.evidenceDirectory = $evidenceRoot
  $result.retainedContainer = $container
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'result.json') -Encoding UTF8
  $result | ConvertTo-Json -Depth 6
  foreach ($key in @('EDUCORE_DEMO_PASSWORD','PILOT_ADMIN_URL','DATABASE_URL','DEMO_DATABASE_URL','POSTGRES_PASSWORD','R4_AUTH_URL','R4_API_URL','R4_WORKER_URL','R4_OTP_WORKER_URL','R4_JWT_SECRET','R4_OTP_PEPPER','R4_RECOVERY_ACTIVE_KEY','R4_RECOVERY_KEYS')) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
  $demoPassword = $null
}
