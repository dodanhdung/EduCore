#requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateSet('Audit','Plan','Apply','Verify','Replay')][string]$Mode='Audit',
  [ValidatePattern('^R11_[0-9]{8}[a-z0-9_-]*$')][string]$Batch='R11_20261028',
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$ReferenceDate='2026-10-28',
  [ValidateSet('Representative','Bulk')][string]$Scale='Representative',
  [switch]$ConfirmEnrichment, [switch]$KeepLegacyPolicies, [switch]$RestartServices
)
$ErrorActionPreference='Stop'
$r11Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $r11Root
$r11Local=Join-Path $r11Root '.local'
$r11Config=Get-Content -LiteralPath (Join-Path $r11Local 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($r11Config.schemaVersion -ne 1 -or $r11Config.initialized -ne $true -or
   $r11Config.id -notmatch '^[0-9a-f]{32}$' -or $r11Config.containerId -notmatch '^[0-9a-f]{64}$' -or
   $r11Config.database -cne "educore_demo_local_$($r11Config.id)" -or
   $r11Config.container -cne "educore-local-mvp-$($r11Config.id.Substring(0,12))") {throw 'R11_LOCAL_IDENTITY_REQUIRED'}
$r11Docker=(Get-Command docker -ErrorAction Stop).Source
$r11Node=(Get-Command node -ErrorAction Stop).Source
$r11Context=(& $r11Docker context show | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $r11Context -cne $r11Config.context){throw 'R11_DOCKER_CONTEXT_MISMATCH'}
$r11Endpoint=(& $r11Docker context inspect $r11Context --format '{{.Endpoints.docker.Host}}' | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $r11Endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$'){throw 'R11_REMOTE_DOCKER_REFUSED'}
$r11Inspect=(& $r11Docker --context $r11Context inspect --format '{{json .}}' $r11Config.container | Out-String) | ConvertFrom-Json
$r11Binding=@($r11Inspect.HostConfig.PortBindings.'5432/tcp')
if($LASTEXITCODE -ne 0 -or $r11Inspect.Id -cne $r11Config.containerId -or
   $r11Inspect.Config.Labels.'educore.local.instance' -cne $r11Config.id -or -not $r11Inspect.State.Running -or
   $r11Inspect.Config.Image -cne 'postgres:16' -or $r11Binding.Count -ne 1 -or
   $r11Binding[0].HostIp -cne '127.0.0.1' -or $r11Binding[0].HostPort -ne [string]$r11Config.pgPort -or
   @($r11Inspect.Mounts | Where-Object {$_.Type -ne 'volume'}).Count -ne 0){throw 'R11_DOCKER_IDENTITY_OR_BINDING_MISMATCH'}
$r11Commit=(& git rev-parse HEAD | Out-String).Trim()
$r11Branch=(& git branch --show-current | Out-String).Trim()
if($r11Commit -notmatch '^[0-9a-f]{40}$' -or $r11Branch -cne 'test/r10-local-demo-data'){throw 'R11_EXPECTED_SOURCE_BRANCH_REQUIRED'}
if((& git status --porcelain -- apps/api/src apps/api/prisma | Out-String).Trim()){throw 'R11_BACKEND_OR_SCHEMA_DIRTY'}
$r11Directory=Join-Path $r11Local "r11/$Batch"
$null=New-Item -ItemType Directory -Force -Path $r11Directory
$r11Lock=[IO.File]::Open((Join-Path $r11Directory 'runner.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
function Write-R11Json([string]$Path,$Value){[IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))}
function Read-R11Audit([string]$Database){
  $r11Sql=[IO.File]::ReadAllText((Join-Path $r11Root 'scripts/r11/audit-readonly.sql'))
  $r11Text=($r11Sql | & $r11Docker --context $r11Context exec -i $r11Config.container psql -X -q -A -t -v ON_ERROR_STOP=1 -U local_admin -d $Database | Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw 'R11_READONLY_AUDIT_FAILED'}
  return ($r11Text | ConvertFrom-Json)
}
function Check-R11Run {
  $r11Run=Get-Content -LiteralPath (Join-Path $r11Local 'run.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($r11Run.configId -cne $r11Config.id -or $r11Run.containerId -cne $r11Config.containerId -or
     $r11Run.apiUrl -cne 'http://127.0.0.1:3000' -or $r11Run.webUrl -cne 'http://127.0.0.1:5173/login'){throw 'R11_RUNTIME_IDENTITY_MISMATCH'}
  foreach($r11Service in @(@{pid=$r11Run.apiPid;start=$r11Run.apiStartedUtc;marker='dist/main.js'},@{pid=$r11Run.webPid;start=$r11Run.webStartedUtc;marker='node_modules/vite/bin/vite.js'})){
    $r11Process=Get-Process -Id $r11Service.pid -ErrorAction Stop
    $r11Command=Get-CimInstance Win32_Process -Filter "ProcessId=$($r11Service.pid)"
    if($r11Process.ProcessName -ne 'node' -or -not $r11Command.CommandLine.Contains($r11Service.marker) -or
       [Math]::Abs(($r11Process.StartTime.ToUniversalTime()-[DateTime]::Parse($r11Service.start).ToUniversalTime()).TotalSeconds) -gt 2){throw 'R11_SERVICE_PROCESS_MISMATCH'}
  }
  return $r11Run
}
try {
  $r11PriorInputPath=Join-Path $r11Directory 'input.json'
  $r11PriorInput=if(Test-Path -LiteralPath $r11PriorInputPath){Get-Content -LiteralPath $r11PriorInputPath -Raw -Encoding UTF8 | ConvertFrom-Json}else{$null}
  $r11Audit=Read-R11Audit $r11Config.database
  $r11Input=[ordered]@{schemaVersion=1;batch=$Batch;referenceDate=$ReferenceDate;scale=$Scale;directory=$r11Directory;root=$r11Root;
    config=@{id=$r11Config.id;database=$r11Config.database;container=$r11Config.container;containerId=$r11Config.containerId;context=$r11Context;endpoint=$r11Endpoint;pgPort=$r11Config.pgPort};
    source=@{commit=$r11Commit;branch=$r11Branch};keepLegacyPolicies=[bool]$KeepLegacyPolicies;
    apiOrigin='http://127.0.0.1:3000';webOrigin='http://127.0.0.1:5173';audit=$r11Audit;sourceAttested=$false;backup=$null}
  $r11InputPath=Join-Path $r11Directory 'input.json'
  if($Mode -in @('Audit','Plan') -and $r11PriorInput.sourceAttested -and (Test-Path -LiteralPath (Join-Path $r11Local 'run.json'))){
    try{
      $r11RecordedRun=Check-R11Run
      if($r11PriorInput.runtime.commit -ceq $r11Commit -and $r11PriorInput.runtime.apiPid -eq $r11RecordedRun.apiPid){
        $r11Input.sourceAttested=$true;$r11Input.runtime=$r11PriorInput.runtime;$r11Input.backup=$r11PriorInput.backup
      }
    }catch{Write-Verbose 'Audit remains available while runtime attestation is unavailable.'}
  }
  if($Mode -in @('Verify','Replay')){
    $r11ExistingRun=Check-R11Run
    if(-not $r11PriorInput.sourceAttested -or $r11PriorInput.runtime.commit -cne $r11Commit -or
       $r11PriorInput.runtime.apiPid -ne $r11ExistingRun.apiPid -or -not $r11PriorInput.backup.verified){throw 'R11_PREVIOUS_BACKUP_AND_CURRENT_SOURCE_ATTESTATION_REQUIRED'}
    $r11Input.sourceAttested=$true;$r11Input.runtime=$r11PriorInput.runtime;$r11Input.backup=$r11PriorInput.backup
    if($Mode -eq 'Replay' -and (-not $ConfirmEnrichment -or -not(Test-Path -LiteralPath (Join-Path $r11Directory 'completed.json')))){throw 'R11_REPLAY_REQUIRES_CONFIRMED_COMPLETED_COHORT'}
  }
  Write-R11Json $r11InputPath $r11Input
  & $r11Node (Join-Path $r11Root 'scripts/r11/runner.mjs') preflight $r11InputPath
  if($LASTEXITCODE -ne 0){throw 'R11_NODE_PREFLIGHT_FAILED'}
  if($Mode -eq 'Audit'){exit 0}
  if($Mode -eq 'Plan'){
    & $r11Node (Join-Path $r11Root 'scripts/r11/runner.mjs') plan $r11InputPath
    if($LASTEXITCODE -ne 0){throw 'R11_PLAN_FAILED'}
    exit 0
  }
  $null=Check-R11Run
  if($Mode -eq 'Apply'){
    if(-not $ConfirmEnrichment -or -not $KeepLegacyPolicies -or -not $RestartServices){throw 'R11_APPLY_REQUIRES_CONFIRM_ENRICHMENT_KEEP_LEGACY_POLICIES_RESTART_SERVICES'}
    if(-not(Test-Path -LiteralPath (Join-Path $r11Directory 'plan.json'))){throw 'R11_REVIEW_PLAN_FIRST'}
    $r11Stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
    $r11BackupDirectory=Join-Path $r11Local 'backups'
    $null=New-Item -ItemType Directory -Force -Path $r11BackupDirectory
    $r11Backup=Join-Path $r11BackupDirectory "r11-$Batch-$r11Stamp.dump"
    $r11ContainerBackup="/tmp/r11-$r11Stamp.dump"
    & $r11Docker --context $r11Context exec $r11Config.container pg_dump -Fc --no-owner -U local_admin -d $r11Config.database -f $r11ContainerBackup
    if($LASTEXITCODE -ne 0){throw 'R11_BACKUP_FAILED'}
    & $r11Docker --context $r11Context cp "$($r11Config.container):$r11ContainerBackup" $r11Backup
    if($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $r11Backup).Length -le 0){throw 'R11_BACKUP_COPY_FAILED'}
    & $r11Docker --context $r11Context exec $r11Config.container pg_restore --list $r11ContainerBackup | Out-Null
    if($LASTEXITCODE -ne 0){throw 'R11_BACKUP_ARCHIVE_INVALID'}
    # Restore into a new disposable validation DB, never over the source DB.
    # Kept for owner inspection; this runner does not DROP databases or delete records.
    $r11RestoreDatabase='educore_demo_local_'+[Guid]::NewGuid().ToString('N')
    if($r11RestoreDatabase -cne $r11Config.database -and $r11RestoreDatabase -match '^educore_demo_local_[0-9a-f]{32}$'){
      & $r11Docker --context $r11Context exec $r11Config.container createdb -U local_admin --template=template0 $r11RestoreDatabase
      if($LASTEXITCODE -ne 0){throw 'R11_RESTORE_VALIDATION_DB_FAILED'}
    }else{throw 'R11_RESTORE_TARGET_INVALID'}
    & $r11Docker --context $r11Context exec $r11Config.container pg_restore --exit-on-error --single-transaction -U local_admin -d $r11RestoreDatabase $r11ContainerBackup
    if($LASTEXITCODE -ne 0){throw 'R11_BACKUP_NOT_RESTORABLE'}
    $r11Restored=Read-R11Audit $r11RestoreDatabase
    if(-not $r11Audit.functionOwnersDigest -or $r11Restored.functionOwnersDigest -cne $r11Audit.functionOwnersDigest){throw 'R11_RESTORE_FUNCTION_OWNER_MISMATCH'}
    foreach($r11Tenant in $r11Audit.tenants){
      $r11Copy=$r11Restored.tenants | Where-Object {$_.id -eq $r11Tenant.id}
      if(-not $r11Copy -or ($r11Copy.history | ConvertTo-Json -Depth 10 -Compress) -cne ($r11Tenant.history | ConvertTo-Json -Depth 10 -Compress)){throw 'R11_RESTORE_HISTORY_MISMATCH'}
      foreach($r11Metric in $r11Tenant.counts.PSObject.Properties){if($r11Copy.counts.($r11Metric.Name) -ne $r11Metric.Value){throw 'R11_RESTORE_COUNTS_MISMATCH'}}
    }
    $r11Input.backup=@{path=$r11Backup;sha256=(Get-FileHash -LiteralPath $r11Backup -Algorithm SHA256).Hash;restoredDatabase=$r11RestoreDatabase;verified=$true;verifiedAt=[DateTime]::UtcNow.ToString('o')}
    Write-R11Json (Join-Path $r11Directory "backup-$r11Stamp.json") $r11Input.backup
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $r11Root 'scripts/stop-local.ps1')
    if($LASTEXITCODE -ne 0){throw 'R11_LOCAL_STOP_FAILED'}
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $r11Root 'scripts/start-local.ps1')
    if($LASTEXITCODE -ne 0){throw 'R11_LOCAL_RESTART_FAILED'}
    $r11FreshRun=Check-R11Run
    if((& git rev-parse HEAD | Out-String).Trim() -cne $r11Commit){throw 'R11_SOURCE_CHANGED_DURING_PREFLIGHT'}
    $r11Input.sourceAttested=$true
    $r11Input.runtime=@{apiPid=$r11FreshRun.apiPid;apiStartedUtc=$r11FreshRun.apiStartedUtc;commit=$r11Commit}
  }
  Write-R11Json $r11InputPath $r11Input
  $r11SeedSource=[IO.File]::ReadAllText((Join-Path $r11Root 'apps/api/scripts/seed-demo.ts'))
  $r11PasswordMatch=[regex]::Match($r11SeedSource,"const password = '([^']+)';")
  if(-not $r11PasswordMatch.Success){throw 'R11_LOCAL_QA_PASSWORD_SOURCE_MISSING'}
  $env:EDUCORE_R11_QA_PASSWORD=$r11PasswordMatch.Groups[1].Value
  try{
    $r11NodeMode=if($Mode -eq 'Replay'){'apply'}else{$Mode.ToLowerInvariant()}
    & $r11Node (Join-Path $r11Root 'scripts/r11/runner.mjs') $r11NodeMode $r11InputPath
    if($LASTEXITCODE -ne 0){throw 'R11_RUNNER_ABORTED_REVIEW_JOURNAL_BEFORE_RETRY'}
  }finally{Remove-Item Env:EDUCORE_R11_QA_PASSWORD -ErrorAction SilentlyContinue}
  $r11After=Read-R11Audit $r11Config.database
  Write-R11Json (Join-Path $r11Directory 'after.json') $r11After
  & $r11Node (Join-Path $r11Root 'scripts/r11/runner.mjs') reconcile $r11InputPath
  if($LASTEXITCODE -ne 0){throw 'R11_RECONCILIATION_FAILED'}
} finally {$r11Lock.Dispose()}
