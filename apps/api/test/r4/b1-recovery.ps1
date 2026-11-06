#requires -Version 5.1
<# Local-only recovery drill. Creates a NEW admitted PG16 cluster. Does not
   contact Render, export role passwords, enable delivery, clean or drop data.
   The custom dump stays in the two owned Docker containers, never in a ZIP. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SourceContainer,
  [Parameter(Mandatory=$true)][string]$TenantId,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if (-not $evidence.StartsWith((Join-Path $root '.local')+[IO.Path]::DirectorySeparatorChar) -or
    $SourceContainer -notmatch '^educore-r4-native-([a-f0-9]{32})$' -or
    $TenantId -notmatch '^[a-f0-9-]{36}$') { throw 'UNSAFE_RECOVERY_INPUT' }
$sourceRun=$SourceContainer.Substring($SourceContainer.Length-32)
$context=(& docker context show | Out-String).Trim()
$endpoint=(& docker context inspect $context --format '{{.Endpoints.docker.Host}}' | Out-String).Trim()
if ($endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$' -or $context -notmatch '^[a-zA-Z0-9_-]+$') { throw 'LOCAL_DOCKER_REQUIRED' }
function D([string[]]$a) {
  $previous=$ErrorActionPreference
  try { $ErrorActionPreference='Continue'; $out=@(& docker --context $context @a 2>$null); $code=$LASTEXITCODE }
  finally { $ErrorActionPreference=$previous }
  if ($code -ne 0) { throw "LOCAL_RECOVERY_DOCKER_FAILED_$($a[0])" }
  return ($out -join "`n")
}
$src=(D @('inspect','--format','{{json .}}',$SourceContainer)) | ConvertFrom-Json
if ($src.Config.Labels.'educore.r4.disposable' -ne $sourceRun -or -not $src.State.Running -or
    @($src.NetworkSettings.Ports.'5432/tcp' | Where-Object HostIp -ne '127.0.0.1').Count -ne 0) { throw 'SOURCE_OWNERSHIP_FAILED' }
$sourceDb=($src.Config.Env | Where-Object { $_ -match '^POSTGRES_DB=' }) -replace '^POSTGRES_DB=',''
if ($sourceDb -ne "educore_r4_native_$sourceRun") { throw 'SOURCE_DATABASE_MISMATCH' }
function Q([string]$container,[string]$database,[string]$sql) {
  $value=D @('exec',$container,'psql','-X','-t','-A','-v','ON_ERROR_STOP=1','-U','r4_test_admin','-d',$database,'-c',$sql)
  return $value.Trim()
}
$countSql="SELECT jsonb_build_object('migrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'members',(SELECT count(*) FROM tenant_memberships WHERE tenant_id='$TenantId'),'activated',(SELECT count(*) FROM tenant_memberships m JOIN users u ON u.id=m.user_id JOIN credentials c ON c.user_id=u.id WHERE m.tenant_id='$TenantId' AND u.activated_at IS NOT NULL),'classes',(SELECT count(*) FROM classes WHERE tenant_id='$TenantId'),'sessions',(SELECT count(*) FROM class_sessions WHERE tenant_id='$TenantId'),'audits',(SELECT count(*) FROM audit_logs WHERE tenant_id='$TenantId'),'receipts',(SELECT count(*) FROM idempotency_records WHERE tenant_id='$TenantId'),'verifiedLinks',(SELECT count(*) FROM parent_student_links WHERE tenant_id='$TenantId' AND verified_at IS NOT NULL AND revoked_at IS NULL),'finalizations',(SELECT count(*) FROM attendance_finalizations WHERE tenant_id='$TenantId'),'invoices',(SELECT count(*) FROM invoices WHERE tenant_id='$TenantId'))::text;"
$before=Q $SourceContainer $sourceDb $countSql
$baseline=$before | ConvertFrom-Json
if ($baseline.members -ne 9 -or $baseline.activated -ne 9 -or $baseline.verifiedLinks -ne 2) { throw 'COMPLETED_B1_SOURCE_REQUIRED' }
$roles=(Q $SourceContainer $sourceDb "SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'bypass',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname<>'r4_test_admin';") | ConvertFrom-Json
$memberships=(Q $SourceContainer $sourceDb "SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname) ORDER BY r.rolname,m.rolname) FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE r.rolname NOT LIKE 'pg_%' AND m.rolname NOT LIKE 'pg_%';") | ConvertFrom-Json
$metadataSql="SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'owner',r.rolname,'acl',p.proacl::text,'config',p.proconfig,'volatile',p.provolatile,'body',md5(p.prosrc)) ORDER BY n.nspname,p.proname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname IN ('educore_r3','educore_r4') AND p.proname IN ('attendance','attendance_review_version','attendance_reasons','attendance_sheet_contract','attendance_mvp_read','profile_membership_link','class_activate');"
$metadataBefore=Q $SourceContainer $sourceDb $metadataSql
# Quiescent local source only: compare every application table, including audit,
# receipts, credentials and migration history, without exporting rows to logs.
# These hashes are not a live Render backup or an encryption mechanism.
$tables=(Q $SourceContainer $sourceDb "SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname='public' OR schemaname LIKE 'educore_%';") | ConvertFrom-Json
$digestParts=@(foreach ($table in $tables) {
  if ($table.schema -notmatch '^[a-z][a-z0-9_]+$' -or $table.table -notmatch '^[a-z_][a-z0-9_]+$') { throw 'UNSAFE_TABLE_METADATA' }
  "SELECT '$($table.schema).$($table.table)' name,count(*)::bigint rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex') digest FROM $($table.schema).$($table.table) x"
})
$digestSql="SELECT jsonb_agg(to_jsonb(d) ORDER BY d.name) FROM ($($digestParts -join ' UNION ALL ')) d;"
$dataBefore=Q $SourceContainer $sourceDb $digestSql
$drillWatch=[Diagnostics.Stopwatch]::StartNew()
# No host dump: byte-preserving cmd pipe between two Docker CLI processes;
# never decode binary in PowerShell. All command identifiers are allowlisted.
$dump='/tmp/educore-b1-recovery.dump'
$null=D @('exec',$SourceContainer,'pg_dump','--format=custom','--no-password','-U','r4_test_admin','-d',$sourceDb,'--file',$dump)
$previousUrl=$env:R4_TEST_URL; $previousAdmission=$env:R4_TEST_DISPOSABLE
try {
  # Existing runner creates/validates a fresh anonymous volume and leaves its
  # process-local URL admitted. No previous environment URL is ever consumed.
  $setup=@(& (Join-Path $PSScriptRoot 'start-r4-native.ps1') 6>&1)
  $line=($setup | Where-Object { $_ -match '^Sanitized environment evidence: ' } | Select-Object -Last 1)
  if (-not $line) { throw 'RESTORE_ADMISSION_EVIDENCE_MISSING' }
  $environment=Get-Content -LiteralPath (Join-Path ($line -replace '^Sanitized environment evidence: ','') 'environment.json') -Raw | ConvertFrom-Json
  $dest=$environment.container; $destDb=$environment.database
  if ($environment.status -ne 'ADMITTED_FRESH_DISPOSABLE' -or $dest -eq $SourceContainer) { throw 'FRESH_RESTORE_REQUIRED' }
  foreach ($role in $roles) {
    if ($role.name -notmatch '^[a-z][a-z0-9_]+$') { throw 'UNSAFE_ROLE_METADATA' }
    $flags=@('NOLOGIN',$(if($role.super){'SUPERUSER'}else{'NOSUPERUSER'}),$(if($role.inherit){'INHERIT'}else{'NOINHERIT'}),$(if($role.createRole){'CREATEROLE'}else{'NOCREATEROLE'}),$(if($role.createDb){'CREATEDB'}else{'NOCREATEDB'}),$(if($role.bypass){'BYPASSRLS'}else{'NOBYPASSRLS'})) -join ' '
    $null=Q $dest $destDb "CREATE ROLE $($role.name) $flags;"
  }
  foreach ($grant in $memberships) {
    if ($grant.role -notmatch '^[a-z][a-z0-9_]+$' -or $grant.member -notmatch '^[a-z][a-z0-9_]+$') { throw 'UNSAFE_ROLE_GRANT' }
    $null=Q $dest $destDb "GRANT $($grant.role) TO $($grant.member);"
  }
  # A byte-preserving Docker cp stream avoids any dump on the host filesystem.
  if ($dest -notmatch '^educore-r4-native-[a-f0-9]{32}$') { throw 'UNSAFE_DESTINATION_NAME' }
  $copyCommand="docker --context $context cp ${SourceContainer}:$dump - | docker --context $context cp - ${dest}:/tmp/"
  & cmd.exe /d /c $copyCommand
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_DUMP_TRANSFER_FAILED' }
  $sourceHash=(D @('exec',$SourceContainer,'sha256sum',$dump)).Split(' ')[0]
  $destinationHash=(D @('exec',$dest,'sha256sum',$dump)).Split(' ')[0]
  if ($sourceHash -ne $destinationHash) { throw 'PRIVATE_DUMP_HASH_MISMATCH' }
  $null=D @('exec',$dest,'pg_restore','--exit-on-error','--no-password','-U','r4_test_admin','-d',$destDb,$dump)
  $after=Q $dest $destDb $countSql
  $metadataAfter=Q $dest $destDb $metadataSql
  $dataAfter=Q $dest $destDb $digestSql
  if ($before -ne $after -or $metadataBefore -ne $metadataAfter -or $dataBefore -ne $dataAfter) { throw 'RESTORE_READBACK_MISMATCH' }
  # Exercise a transaction abort as the only rollback; no destructive rollback
  # of forward migrations or existing cohort history is attempted.
  $rollback=Q $dest $destDb "BEGIN; CREATE TABLE public.b1_rollback_probe(id int); ROLLBACK; SELECT to_regclass('public.b1_rollback_probe') IS NULL;"
  if (-not $rollback.EndsWith('t')) { throw 'ROLLBACK_PROBE_FAILED' }
  $null=New-Item -ItemType Directory -Force -Path $evidence
  $drillWatch.Stop()
  [ordered]@{status='PASS';sourceContainer=$SourceContainer;destinationContainer=$dest;sourceDatabase=$sourceDb;destinationDatabase=$destDb;capturedAt=[DateTime]::UtcNow.ToString('o');admission=$environment.admission;counts=($after|ConvertFrom-Json);functionMetadataMatch=$true;allApplicationTableFingerprintsMatch=$true;tableFingerprints=($dataAfter|ConvertFrom-Json);drillDurationSeconds=$drillWatch.Elapsed.TotalSeconds;rolesRestoredNoLogin=$roles.Count;externalDelivery='NOT_STARTED';dumpLocation='ONLY_INSIDE_TWO_TASK_OWNED_CONTAINERS';transactionRollback='PASS';limitations='Local synthetic checkpoint only; does not prove Render backup provider privileges, private-file recovery, runtime login after restore, or live recovery timing.'} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'recovery.json') -Encoding UTF8
  Write-Host 'B1_ISOLATED_RESTORE: PASS; private dump was not written to host or packaged.'
} finally {
  $env:R4_TEST_URL=$previousUrl; $env:R4_TEST_DISPOSABLE=$previousAdmission
}
