#requires -Version 5.1
<# Owner-authorized staging demo migration. Live writes require an exact rehearsed plan digest. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('audit','dry-run','backup','rehearsal','import','verify','demo-plan','demo-rehearsal','demo-verify')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$PrivateRoot,
  [string]$TargetSecretPath = (Join-Path $HOME '.educore-secrets/render-db-url.txt'),
  [string]$SyntheticPolicyFile,
  [switch]$ResumeBackup,
  [switch]$RunFocusedTests,
  [switch]$ExecuteApprovedLiveDemo,
  [string]$ExpectedPlanDigest
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$allowed=[IO.Path]::GetFullPath((Join-Path $root '.local/staging-transfer'))
$private=[IO.Path]::GetFullPath((Join-Path $root $PrivateRoot))
if([IO.Path]::IsPathRooted($PrivateRoot)){$private=[IO.Path]::GetFullPath($PrivateRoot)}
if(-not $private.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'PRIVATE_ROOT_MUST_BE_UNDER_LOCAL_STAGING_TRANSFER'}
if($Mode -eq 'import' -and (-not $ExecuteApprovedLiveDemo -or $ExpectedPlanDigest -notmatch '^[a-f0-9]{64}$')){throw 'LIVE_EXECUTION_GATE_REQUIRED'}
Push-Location $root
$started=$false
$secure=$null
$pointer=[IntPtr]::Zero
$keyBytes=$null
try {
 $branch=(& git branch --show-current | Out-String).Trim()
 if($branch -ne 'deploy/r13-staging'){throw 'DEPLOY_R13_STAGING_BRANCH_REQUIRED'}
 $node=(Get-Command node -ErrorAction Stop).Source
 if([Version]((& $node --version).TrimStart('v')) -lt [Version]'24.12.0'){throw 'NODE_24_12_REQUIRED'}
 $cursor=$private
 while($cursor -and $cursor -ne $root){
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PRIVATE_PATH_REPARSE_POINT_DENIED'}
  $cursor=Split-Path -Parent $cursor
 }
 $null=New-Item -ItemType Directory -Path $private -Force
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 & icacls $private /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null
 if($LASTEXITCODE -ne 0){throw 'PRIVATE_ACL_PROTECTION_FAILED'}
 $acl=Get-Acl -LiteralPath $private
 if(-not $acl.AreAccessRulesProtected -or @($acl.Access | Where-Object {$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')}).Count){throw 'PRIVATE_ACL_VERIFICATION_FAILED'}
 Add-Type -AssemblyName System.Security
 $keyPath=Join-Path $private 'key.dpapi'
 if(Test-Path -LiteralPath $keyPath){
  $keyBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 } else {
  if($Mode -ne 'backup'){throw 'BACKUP_AND_DPAPI_KEY_REQUIRED_FIRST'}
  $keyBytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try {$rng.GetBytes($keyBytes)} finally {$rng.Dispose()}
  [IO.File]::WriteAllBytes($keyPath,[Security.Cryptography.ProtectedData]::Protect($keyBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
 }
 $env:EDUCORE_TRANSFER_KEY=[Convert]::ToBase64String($keyBytes)
 $env:EDUCORE_TRANSFER_ROOT=$private
 $env:EDUCORE_TRANSFER_TARGET_SECRET_PATH=[IO.Path]::GetFullPath($TargetSecretPath)
 if($ExecuteApprovedLiveDemo){$env:EDUCORE_TRANSFER_LIVE_SCOPE='OWNER_APPROVED_DEMO_20261030';$env:EDUCORE_TRANSFER_EXPECTED_PLAN=$ExpectedPlanDigest}
 if($ResumeBackup){$env:EDUCORE_TRANSFER_RESUME='1'}
 if($RunFocusedTests){if($Mode -ne 'verify'){throw 'FOCUSED_TESTS_REQUIRE_VERIFY_MODE'};$env:EDUCORE_TRANSFER_FOCUSED_TESTS='1'}
 if($SyntheticPolicyFile){
  if([IO.Path]::GetFileName($SyntheticPolicyFile) -ne $SyntheticPolicyFile){throw 'POLICY_MUST_BE_A_FILENAME_IN_PRIVATE_ROOT'}
  $env:EDUCORE_TRANSFER_POLICY=$SyntheticPolicyFile
 }
 $cfg=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root '.local/config.json') | ConvertFrom-Json
 if($cfg.id -ne '4b96cd37ab774712b3452892c458090f' -or $cfg.containerId -ne '21c4142735db63e660bf2d6a23dda610daba550e2b1c670c1710d442c5925184' -or $cfg.database -ne ('educore_demo_local_'+$cfg.id)){throw 'V2_SOURCE_IDENTITY_MISMATCH'}
 $endpoint=(& docker context inspect $cfg.context --format '{{.Endpoints.docker.Host}}' 2>$null | Out-String).Trim()
 if($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe:////\./pipe/[^\s]+|unix:/[^\s]+)$'){throw 'LOCAL_DOCKER_CONTEXT_REQUIRED'}
 if($Mode -in @('backup','demo-plan')){
  $obj=(& docker --context $cfg.context inspect --format '{{json .}}' $cfg.container 2>$null | Out-String | ConvertFrom-Json)
  $bindings=@($obj.HostConfig.PortBindings.'5432/tcp')
  if($LASTEXITCODE -ne 0 -or $obj.Id -ne $cfg.containerId -or $obj.Config.Labels.'educore.local.instance' -ne $cfg.id -or
     $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne [string]$cfg.pgPort){throw 'SOURCE_CONTAINER_MISMATCH'}
  if(-not $obj.State.Running){& docker --context $cfg.context start $cfg.container 1>$null 2>$null;if($LASTEXITCODE -ne 0){throw 'SOURCE_START_FAILED'};$started=$true}
  $ready=$false
  for($n=0;$n -lt 40;$n++){& docker --context $cfg.context exec $cfg.container pg_isready -q -U local_admin -d $cfg.database 2>$null;if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 250}
  if(-not $ready){throw 'SOURCE_NOT_READY'}
  $secure=ConvertTo-SecureString $cfg.adminSecret
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $env:EDUCORE_TRANSFER_SOURCE_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 }
 & $node --experimental-transform-types (Join-Path $root 'apps/api/scripts/staging-data-transfer.ts') $Mode
 if($LASTEXITCODE -ne 0){throw 'TRANSFER_DID_NOT_COMPLETE: inspect the safe status; do not rerun blindly'}
} finally {
 foreach($name in @('EDUCORE_TRANSFER_KEY','EDUCORE_TRANSFER_ROOT','EDUCORE_TRANSFER_TARGET_SECRET_PATH','EDUCORE_TRANSFER_SOURCE_PASSWORD','EDUCORE_TRANSFER_POLICY','EDUCORE_TRANSFER_RESUME','EDUCORE_TRANSFER_FOCUSED_TESTS','EDUCORE_TRANSFER_LIVE_SCOPE','EDUCORE_TRANSFER_EXPECTED_PLAN')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($secure){$secure.Dispose()}
 if($keyBytes){[Array]::Clear($keyBytes,0,$keyBytes.Length)}
 if($started){& docker --context $cfg.context stop --time 30 $cfg.container 1>$null 2>$null}
 Pop-Location
}
