#requires -Version 5.1
<# Reuse ONLY the verified task-owned B1 local cohort; no import, migration,
   shared volume reset or account recreation. Never reads DATABASE_URL. #>
[CmdletBinding()]
param([ValidateSet('BEFORE','AFTER')][string]$Phase='BEFORE')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$prior=Join-Path $root '.local\r13-b1-rehearsal'
$inventoryPath=Join-Path $prior 'qa-reviewed\inventory.json'
$executionPath=Join-Path $prior 'qa-reviewed\execution.json'
$journal=Get-Content -LiteralPath (Join-Path $prior 'resource-journal.json') -Raw | ConvertFrom-Json
$container='educore-r4-native-a4781438983e4bc3aa521a5d9612ba01'
$run='a4781438983e4bc3aa521a5d9612ba01'
if(@($journal | Where-Object { $_.container -eq $container -and $_.runId -eq $run }).Count -ne 1){throw 'PRIOR_OWNED_RESOURCE_REQUIRED'}
$inventory=Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
$execution=Get-Content -LiteralPath $executionPath -Raw | ConvertFrom-Json
if($execution.phase -ne 'PASS' -or $execution.accounts.Count -ne 8 -or $inventory.memberships -ne 9 -or
 $inventory.tenant -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or
 $inventory.classIds.Count -ne 2){throw 'VERIFIED_B1_COHORT_REQUIRED'}
$context=(& docker context show | Out-String).Trim()
$endpoint=(& docker context inspect $context --format '{{.Endpoints.docker.Host}}' | Out-String).Trim()
if($endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$'){throw 'LOCAL_DOCKER_REQUIRED'}
function D([string[]]$a){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$o=@(& docker --context $context @a 2>$null);$c=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($c -ne 0){throw 'LOCAL_DOCKER_FAILED'};return($o -join "`n")}
$c=(D @('inspect','--format','{{json .}}',$container)) | ConvertFrom-Json
$bindings=@($c.HostConfig.PortBindings.'5432/tcp')
if($c.Config.Labels.'educore.r4.disposable' -ne $run -or $c.Config.Image -ne 'postgres:16' -or
 $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or @($c.Mounts | Where-Object Type -ne 'volume').Count){throw 'B1_SOURCE_ADMISSION_FAILED'}
if(-not $c.State.Running){$null=D @('start',$container)}
$database="educore_r4_native_$run"
$sql="SELECT jsonb_build_object('pg',current_setting('server_version_num')::int,'database',current_database(),'migrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'members',(SELECT count(*) FROM tenant_memberships WHERE tenant_id='$($inventory.tenant)'),'activeClasses',(SELECT count(*) FROM classes WHERE tenant_id='$($inventory.tenant)' AND status='ACTIVE'),'plannedClasses',(SELECT count(*) FROM classes WHERE tenant_id='$($inventory.tenant)' AND status='PLANNED'))::text;"
$admission=(D @('exec',$container,'psql','-X','-t','-A','-U','r4_test_admin','-d',$database,'-v','ON_ERROR_STOP=1','-c',$sql)).Trim() | ConvertFrom-Json
if($admission.pg -lt 160000 -or $admission.pg -ge 170000 -or $admission.database -ne $database -or $admission.migrations -ne 52 -or $admission.members -notin @(9,10) -or $admission.plannedClasses -ne 2){throw 'COHORT_READBACK_MISMATCH'}
$password=($c.Config.Env | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' }) -replace '^POSTGRES_PASSWORD=',''
$keys=@('R13_B11_TEST_URL','R13_B11_ADMITTED','R13_B11_PHASE','R13_B11_INVENTORY','R13_B11_EXECUTION','R13_B11_EVIDENCE_DIR','R4_BROWSER_EVIDENCE_DIR','R4_TEST_DISPOSABLE')
$previous=@{};foreach($key in $keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
$evidence=Join-Path $root ('.local\r13-b11\'+$Phase.ToLowerInvariant())
$null=New-Item -ItemType Directory -Force -Path $evidence
$admission | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'admission.json') -Encoding UTF8
try{
 # Delimit the generated password explicitly; no URL enters logs or arguments.
 $env:R13_B11_TEST_URL='postgresql://r4_test_admin:'+ $password +'@127.0.0.1:'+ $bindings[0].HostPort +'/'+$database
 $env:R13_B11_ADMITTED='VERIFIED_OWNED_B1_COHORT_ONLY';$env:R4_TEST_DISPOSABLE='I_OWN_THIS_DISPOSABLE_CLUSTER'
 $env:R13_B11_PHASE=$Phase;$env:R13_B11_INVENTORY=$inventoryPath;$env:R13_B11_EXECUTION=$executionPath
 $env:R13_B11_EVIDENCE_DIR=$evidence;$env:R4_BROWSER_EVIDENCE_DIR=Join-Path $evidence 'screenshots'
 Push-Location -LiteralPath (Join-Path $root 'apps\api')
 try{& node node_modules/vitest/vitest.mjs run --config vitest.config.b11.ts;$exitCode=$LASTEXITCODE}finally{Pop-Location}
 if($exitCode -ne 0){throw 'B11_REUSE_TEST_FAILED_REVIEW_LOCAL_LOG'}
}finally{foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')};$password=$null}
