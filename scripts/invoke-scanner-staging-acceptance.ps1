<# Single FILESERVER handoff; never starts a server, edits IIS/Gateway config or restarts a service.
All mutations require typed approval after a concrete plan. Use -PlanOnly off FILESERVER. #>
[CmdletBinding()]
param(
 [string]$RepositoryPath='C:\inetpub\wwwroot\Sam_Att-Scanner-Test',
 [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
 [ValidateSet('ReadOnly','Migration','PrepareRelease','Scanner','IIS','Activation','All')][string]$Phase='ReadOnly',
 [switch]$PlanOnly,[switch]$ApplyMigration,[switch]$GatewayRestartRequired,
 [string]$ReleasePath,[uri]$FrontendUrl,[uri]$ApiBaseUrl,
 [Security.SecureString]$BearerToken,[PSCredential]$DatabaseCredential,[PSCredential]$MigrationCredential,
 [ValidateSet('DATE','MONTH','YEAR','RANGE')][string]$Mode='DATE',
 [string]$ScanDate,[string]$DateFrom,[string]$DateTo,[string]$Month,[string]$Year,
 [string]$ReaderExpectedSha256
)
$ErrorActionPreference='Stop'
$taskRepo=(Resolve-Path -LiteralPath $RepositoryPath).Path
$taskEvidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if($taskEvidence -match '(?i)\\inetpub\\|\\wwwroot\\'){throw 'Evidence must be outside public IIS roots'}
New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
$taskRun=Join-Path $taskEvidence ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun | Out-Null
$taskResults=[ordered]@{}
foreach($taskName in @('LocalPreflight','MariaDBConnection','Schema','Migration','Release','GatewayIdentity','Scanner1','Scanner2','Scanner3','MultiMachine','IISStaticRefresh','BrowserInteractive')){
 $taskResults[$taskName]=[ordered]@{status='NOT EXECUTED';reason='Not performed';evidence=$null}
}
$taskCurrent='LocalPreflight';$taskExit=0
$taskEnvNames=@('SAM_ATT_DB_HOST','SAM_ATT_DB_PORT','SAM_ATT_DB_USER','SAM_ATT_DB_PASSWORD','SAM_ATT_MIGRATION_CONFIRM')
$taskEnvBefore=@{};foreach($taskName in $taskEnvNames){$taskEnvBefore[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
function Set-Result($Name,$Status,$Reason,$Evidence=$null){$taskResults[$Name]=[ordered]@{status=$Status;reason=$Reason;evidence=$Evidence};Write-Host "$Name : $Status ($Reason)"}
function Stop-Acceptance($Name,$Status,$Reason){Set-Result $Name $Status $Reason;throw 'ACCEPTANCE_STOP'}
function Confirm-Change($Text){Write-Host "Approval required: $Text";if((Read-Host 'Type the complete approval text') -cne $Text){Stop-Acceptance $taskCurrent 'BLOCKED' 'Administrator approval not supplied'}}
function Use-DbCredential([PSCredential]$Credential){
 if(!$Credential){throw 'An explicit samchuk_attendance-only database credential is required'}
 if($Credential.UserName -ieq 'root'){throw 'Use a schema-scoped account on the shared hospital server'}
 $env:SAM_ATT_DB_HOST='10.1.0.201';$env:SAM_ATT_DB_PORT='3306';$env:SAM_ATT_DB_USER=$Credential.UserName
 $env:SAM_ATT_DB_PASSWORD=$Credential.GetNetworkCredential().Password
}
function Invoke-Db([string[]]$Arguments){
 $taskText=@(& node (Join-Path $taskRepo 'backend/scanner-db-admin.cjs') @Arguments 2>&1)
 if($LASTEXITCODE -ne 0){throw 'Database CLI failed; no acceptance PASS can be claimed'}
 return (($taskText -join "`n") | ConvertFrom-Json)
}
function Need-Db{
 if(!$DatabaseCredential){$script:DatabaseCredential=Get-Credential -Message 'SELECT account scoped to samchuk_attendance on 10.1.0.201'}
 Use-DbCredential $DatabaseCredential
}
function Need-Api{
 if(!$ApiBaseUrl -or $ApiBaseUrl.Scheme -ne 'https' -or $ApiBaseUrl.Port -notin @(3001,3002)){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'An explicit existing HTTPS staging URL on 3001/3002 is required'}
 if($ApiBaseUrl.AbsolutePath.TrimEnd('/') -notin @('/Sam_Att/api','/api/Sam_Att')){throw 'API base path must be /Sam_Att/api/ or /api/Sam_Att/'}
 if($GatewayRestartRequired){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Production Gateway/IIS restart is forbidden'}
 if(!$BearerToken){$script:BearerToken=Read-Host 'Staging ADMIN/HR bearer token (never saved)' -AsSecureString}
}
function Invoke-StageApi([string]$Path,[object]$Body=$null,[int]$Timeout=60){
 $taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($BearerToken)
 try{$taskToken=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)}
 try{
  $taskParams=@{Uri=($ApiBaseUrl.AbsoluteUri.TrimEnd('/')+'/'+$Path.TrimStart('/'));Headers=@{Authorization='Bearer '+$taskToken};Method='GET';TimeoutSec=$Timeout;UseBasicParsing=$true}
  if($null -ne $Body){$taskParams.Method='POST';$taskParams.ContentType='application/json';$taskParams.Body=($Body|ConvertTo-Json -Depth 8 -Compress)}
  $taskResponse=Invoke-WebRequest @taskParams
  if($taskResponse.Headers['Content-Type'] -notmatch 'application/json'){throw 'Non-JSON response'}
  return ($taskResponse.Content|ConvertFrom-Json)
 }catch{
  $taskErrorText=$_.ErrorDetails.Message
  $taskErrorResponse=$_.Exception.Response
  if($taskErrorResponse -and $taskErrorResponse.PSObject.Methods.Name -contains 'GetResponseStream'){
   $taskReader=New-Object IO.StreamReader($taskErrorResponse.GetResponseStream())
   try{$taskErrorText=$taskReader.ReadToEnd()}finally{$taskReader.Dispose()}
  }elseif($taskErrorResponse -and $taskErrorResponse.Content){$taskErrorText=$taskErrorResponse.Content.ReadAsStringAsync().Result}
  if($taskErrorText){try{$taskFailure=$taskErrorText|ConvertFrom-Json;if($null -ne $taskFailure.success){return $taskFailure}}catch{}}
  throw 'Staging API request failed (HTTP/JSON/TLS/timeout); inspect on the staging host without exporting secrets'
 }
 finally{$taskToken=$null;$taskParams=$null}
}
function Test-GatewayIdentity{
 $script:taskCurrent='GatewayIdentity';Need-Api
 if(!$ReleasePath){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Supply the selected versioned staging release path'}
 $taskRelease=(Resolve-Path -LiteralPath $ReleasePath).Path
 if(!$taskRelease.StartsWith('C:\inetpub\wwwroot\Sam_Att-Scanner-Test\',[StringComparison]::OrdinalIgnoreCase)){throw 'Only the approved scanner-test release subtree may be tested'}
 $taskManifest=Get-Content -LiteralPath (Join-Path $taskRelease 'manifest.json') -Raw|ConvertFrom-Json
 if($taskManifest.commit -ne $taskCommit){throw 'Release commit differs from the selected development checkout'}
 foreach($taskFile in $taskManifest.files){
  $taskFilePath=[IO.Path]::GetFullPath((Join-Path $taskRelease $taskFile.file))
  if(!$taskFilePath.StartsWith($taskRelease.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe manifest path'}
  if((Get-FileHash -LiteralPath $taskFilePath -Algorithm SHA256).Hash -ine $taskFile.sha256){throw 'Release file differs from manifest'}
 }
 try{$taskIdentity=Invoke-StageApi 'scanners/staging-status'}catch{Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Approved staging router evidence is unavailable; do not restart or patch the Production Gateway'}
 if($taskResults.Schema.status -ne 'PASS' -or !$taskIdentity.storage.serverIdentity -or $taskIdentity.storage.serverIdentity -ne $taskResults.Schema.evidence.serverIdentity){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Gateway pool does not match the separately verified MariaDB server/schema'}
 if(!$taskIdentity.success -or !$taskIdentity.safeToSync){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Staging path/pool/Push/migration/schema preconditions not proven'}
 foreach($taskName in @('server.cjs','scanner-storage.cjs','scanner-staging.cjs','migrations/scanner-mariadb-10.11.sql')){
  $taskExpected=($taskManifest.files|Where-Object {$_.file.Replace('\','/') -eq ('backend/'+$taskName)}).sha256
  if(!$taskExpected -or $taskIdentity.loadedSourceHashes.$taskName -ine $taskExpected){throw 'Loaded module hash differs from the selected release (copying files is not activation)'}
 }
 Set-Result 'GatewayIdentity' 'PASS' 'Authenticated loaded staging code, scoped Sam_Att pool, Push disabled and schema verified' @{loadedSourceHashes=$taskIdentity.loadedSourceHashes;storage=$taskIdentity.storage;readerSha256=$taskIdentity.readerSha256}
 return $taskIdentity
}
function Test-ScannerGroup([int[]]$Machines,[string]$ResultName){
 $script:taskCurrent=$ResultName
 $taskPayload=@{machineNos=@($Machines);mode=$Mode;strategy='SKIP_DUPLICATES';recalculate=$true;preview=$true;syncSource='SCANNERS'}
 switch($Mode){'DATE'{$taskPayload.date=$ScanDate};'MONTH'{$taskPayload.month=$Month};'YEAR'{$taskPayload.year=$Year};'RANGE'{$taskPayload.dateFrom=$DateFrom;$taskPayload.dateTo=$DateTo}}
 if(($Mode -eq 'DATE' -and !$ScanDate) -or ($Mode -eq 'MONTH' -and !$Month) -or ($Mode -eq 'YEAR' -and !$Year) -or ($Mode -eq 'RANGE' -and (!$DateFrom -or !$DateTo))){throw 'Supply an explicit retained scan window; a closed historical date avoids live-scan races'}
 Use-DbCredential $DatabaseCredential
 $taskBefore=Invoke-Db -Arguments @('--snapshot')
 $taskPreview=Invoke-StageApi 'scanners/sync-custom' $taskPayload (180*$Machines.Count+60)
 $taskAfterPreview=Invoke-Db -Arguments @('--snapshot')
 if(($taskBefore|ConvertTo-Json -Depth 12 -Compress) -cne ($taskAfterPreview|ConvertTo-Json -Depth 12 -Compress)){throw 'Preview changed scanner/personnel/mapping/log/daily snapshot'}
 if(!$taskPreview.success){throw 'Preview rejected the selected input or reader contract'}
 if($taskPreview.totalFound -le 0){Stop-Acceptance $ResultName 'BLOCKED' 'No matching device records proved for the chosen window; select a retained test date'}
 Write-Host 'Plan: raw insert + sync log + attendance calculation, followed by duplicate-only repeat; samchuk_attendance only.'
 $taskPayload|ConvertTo-Json -Depth 8|Write-Host
 Confirm-Change ('SYNC '+($Machines -join ',')+' '+$Mode+' SAMCHUK_ATTENDANCE_ONLY')
 $taskPayload.preview=$false
 $taskFirst=Invoke-StageApi 'scanners/sync-custom' $taskPayload (180*$Machines.Count+60)
 $taskAfter=Invoke-Db -Arguments @('--snapshot');$taskSchemaAfter=Invoke-Db -Arguments @()
 if(!$taskFirst.success -or !$taskFirst.rawSaveSuccess){Set-Result $ResultName 'FAIL' 'Raw save and calculation are separate; inspect committed counts before retry' @{rawSaveSuccess=$taskFirst.rawSaveSuccess;rawSaveStatus=$taskFirst.rawSaveStatus;calculationStatus=$taskFirst.calculationStatus;inserted=$taskFirst.totalInserted;dbRowDelta=($taskAfter.tables.attendance_raw_scan.rows-$taskBefore.tables.attendance_raw_scan.rows);failedDateCount=@($taskFirst.failedDates|Where-Object {$_}).Count};throw 'ACCEPTANCE_STOP'}
 if(($taskAfter.tables.attendance_raw_scan.rows-$taskBefore.tables.attendance_raw_scan.rows) -ne $taskFirst.totalInserted){throw 'API inserted count differs from DB row delta; quiet the Sam_Att test writers and investigate'}
 if($taskSchemaAfter.pendingMappingCount -ne $taskFirst.pendingMappingCount){throw 'API pending mapping count differs from DB'}
 $taskAgain=Invoke-StageApi 'scanners/sync-custom' $taskPayload (180*$Machines.Count+60)
 $taskRepeatState=Invoke-Db -Arguments @('--snapshot');$taskRepeatSchema=Invoke-Db -Arguments @()
 if(!$taskAgain.rawSaveSuccess -or !$taskAgain.success -or $taskAgain.totalInserted -ne 0 -or $taskAgain.duplicateCount -ne $taskAgain.totalFound){throw 'Repeat sync is not stable/duplicate-only; do not claim PASS for a live-changing scan window'}
 if($taskAgain.totalFound -ne $taskFirst.totalFound){throw 'Reader returned a different record set; select a closed retained test window'}
 if(($taskAfter.tables.attendance_raw_scan|ConvertTo-Json -Compress) -cne ($taskRepeatState.tables.attendance_raw_scan|ConvertTo-Json -Compress)){throw 'Repeat SKIP_DUPLICATES changed raw rows'}
 if($taskRepeatSchema.pendingMappingCount -ne $taskAgain.pendingMappingCount){throw 'Repeat pending mapping count differs from DB'}
 $taskRaw=Invoke-StageApi 'raw-scans?limit=1'
 if(!$taskRaw.success -or $taskRaw.total -lt 1){throw 'Raw Scan refresh did not return saved records'}
 Set-Result $ResultName 'PASS' 'Real reader preview/write/repeat and read-only DB evidence matched' @{machines=@($Machines);mode=$Mode;new=$taskFirst.totalInserted;duplicates=$taskFirst.duplicateCount;pendingMappingCount=$taskFirst.pendingMappingCount;repeatInserted=$taskAgain.totalInserted;repeatDuplicates=$taskAgain.duplicateCount;calculationStatus=$taskFirst.calculationStatus;rawSaveStatus=$taskFirst.rawSaveStatus}
}
try{
 $taskGit=@('--no-optional-locks','-c',"safe.directory=$taskRepo",'-C',$taskRepo)
 $taskCommit=(& git @taskGit rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Not a Git checkout'}
 if((& git @taskGit branch --show-current).Trim() -ne 'develop/scanner-three-stage-contract'){throw 'Wrong development branch'}
 if((& git @taskGit status --porcelain)){throw 'Pending worktree edits; use a clean staging checkout'}
 if(!(Test-Path -LiteralPath (Join-Path $taskRepo 'node_modules/mysql2'))){throw 'Install locked dependencies before acceptance'}
 Set-Result 'LocalPreflight' 'PASS' 'Development branch, clean worktree and DB dependency located' @{commit=$taskCommit;phase=$Phase}
 if($GatewayRestartRequired){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Production Gateway/IIS restart is forbidden'}
 if($PlanOnly){Write-Host 'PLAN ONLY: no DB/API/scanner/migration/release/activation actions executed';return}
 if($env:COMPUTERNAME -ine 'FILESERVER' -or $taskRepo.TrimEnd('\') -ine 'C:\inetpub\wwwroot\Sam_Att-Scanner-Test'){Stop-Acceptance 'LocalPreflight' 'NOT EXECUTED' 'Run actual phases only on FILESERVER in the approved test checkout'}
 if($Phase -in @('ReadOnly','Migration','Scanner','IIS','Activation','All')){
  $taskCurrent='MariaDBConnection';Need-Db;$taskInspect=Invoke-Db -Arguments @();$taskInspect|ConvertTo-Json -Depth 12|Set-Content (Join-Path $taskRun 'schema-before.json') -Encoding utf8
  Set-Result 'MariaDBConnection' 'PASS' 'Connected only to the configured samchuk_attendance schema' @{database=$taskInspect.database;version=$taskInspect.version}
  if(!$taskInspect.mariaDb1011){throw 'Unexpected MariaDB version'}
  $taskCurrent='Migration';$taskPlan=Invoke-Db -Arguments @('--plan');$taskPlan|ConvertTo-Json -Depth 15|Set-Content (Join-Path $taskRun 'migration-plan.json') -Encoding utf8
  if($Phase -eq 'Migration' -or ($Phase -eq 'All' -and $ApplyMigration)){
   $taskPlan|ConvertTo-Json -Depth 15|Write-Host
   if(!$taskPlan.executable){Stop-Acceptance 'Migration' 'BLOCKED' 'Migration plan has blockers; no DDL is permitted'}
   if($taskPlan.actions.Count -gt 0){
    Confirm-Change ('APPLY samchuk_attendance '+$taskPlan.planHash)
    if(!$MigrationCredential){$MigrationCredential=Get-Credential -Message 'DDL account scoped only to samchuk_attendance'}
    Use-DbCredential $MigrationCredential;$env:SAM_ATT_MIGRATION_CONFIRM='APPLY_SAMCHUK_ATTENDANCE_ONLY'
    $taskApplied=Invoke-Db -Arguments @('--apply','--approved-plan',$taskPlan.planHash)
    $taskApplied|ConvertTo-Json -Depth 15|Set-Content (Join-Path $taskRun 'migration-applied.json') -Encoding utf8
    Remove-Item Env:SAM_ATT_MIGRATION_CONFIRM -ErrorAction SilentlyContinue;Use-DbCredential $DatabaseCredential
   }
   $taskInspect=Invoke-Db -Arguments @();if(!$taskInspect.storageReady -or !$taskInspect.calculationSchemaReady){Stop-Acceptance 'Migration' 'FAIL' 'Post-apply real schema is still not ready'};Set-Result 'Migration' 'PASS' 'Approved plan applied or no DDL needed; real schema re-inspected' @{planHash=$taskPlan.planHash;actions=$taskPlan.actions.Count}
  }
  $taskCurrent='Schema'
  if(!$taskInspect.storageReady -or !$taskInspect.calculationSchemaReady){Stop-Acceptance 'Schema' 'BLOCKED' 'Real schema is not ready; review the saved plan and obtain DDL approval'}
  Set-Result 'Schema' 'PASS' 'storageReady and calculationSchemaReady verified from real DB' $taskInspect
 }
 if($Phase -in @('PrepareRelease','All')){
  $taskCurrent='Release';Confirm-Change ('PREPARE STAGING '+$taskCommit)
  & (Join-Path $taskRepo 'scripts/prepare-scanner-staging.ps1') -RepositoryPath $taskRepo -StagingRoot (Join-Path $taskRepo 'scanner-releases')
  $ReleasePath=(Get-ChildItem -LiteralPath (Join-Path $taskRepo 'scanner-releases') -Directory|Where-Object {$_.Name -like ($taskCommit.Substring(0,12)+'-*')}|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1).FullName
  Set-Result 'Release' 'PASS' 'New separate artifact prepared; no live activation' @{path=$ReleasePath;commit=$taskCommit}
 }
 if($Phase -in @('Scanner','IIS','Activation','All')){
  if($Phase -eq 'All'){
   $taskCurrent='GatewayIdentity'
   Write-Host ('Selected staging release: '+$ReleasePath)
   Write-Host 'Only use an already approved staging slot. If loading it requires a Production restart, stop here.'
   Confirm-Change ('VERIFY STAGING WITHOUT PRODUCTION RESTART '+$taskCommit)
  }
  $taskIdentity=Test-GatewayIdentity
  if($Phase -eq 'Activation'){Write-Host 'Approved staging route is already active. No IIS/Gateway configuration change was performed.'}
  if($Phase -in @('Scanner','All')){
   if($ReaderExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$' -or $taskIdentity.readerSha256 -ine $ReaderExpectedSha256){Stop-Acceptance 'GatewayIdentity' 'BLOCKED' 'Existing approved reader hash is required and must match; do not replace the EXE'}
   foreach($taskMachine in @(1,2,3)){Test-ScannerGroup @($taskMachine) ('Scanner'+$taskMachine)}
   Test-ScannerGroup @(1,3) 'MultiMachine'
  }
  if($Phase -in @('IIS','All')){
   $taskCurrent='IISStaticRefresh'
   if(!$FrontendUrl -or $FrontendUrl.Scheme -ne 'https' -or $FrontendUrl.Port -ne 3001 -or $FrontendUrl.AbsolutePath.TrimEnd('/') -ne '/Sam_Att'){throw 'Use the approved staging HTTPS3001 /Sam_Att/ frontend URL'}
   $taskBuild=Get-Content -LiteralPath (Join-Path $ReleasePath 'frontend/scanner-build.json') -Raw|ConvertFrom-Json
   $taskExpectedFrontendBase=$FrontendUrl.GetLeftPart([UriPartial]::Authority)+'/Sam_Att'
   if($taskBuild.basePath -ne '/Sam_Att/' -or ($taskBuild.apiBase -ne 'SAME_ORIGIN' -and $taskBuild.apiBase.TrimEnd('/') -ne $taskExpectedFrontendBase)){throw 'Frontend build API/base path does not match the approved staging origin'}
   $taskPriorApiBase=$ApiBaseUrl
   try{
    $script:ApiBaseUrl=[uri]($FrontendUrl.AbsoluteUri.TrimEnd('/')+'/api/')
    $taskProxy=Invoke-StageApi 'scanners/staging-status'
    if(!$taskProxy.safeToSync -or ($taskProxy.loadedSourceHashes|ConvertTo-Json -Compress) -cne ($taskIdentity.loadedSourceHashes|ConvertTo-Json -Compress)){throw 'IIS proxy reaches a different or unsafe backend instance'}
   }finally{$script:ApiBaseUrl=$taskPriorApiBase}
   $taskPage=Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 60
   $taskLocalIndex=Join-Path $ReleasePath 'frontend/index.html'
   $taskExpectedIndex=[IO.File]::ReadAllText($taskLocalIndex)
   if($taskPage.Content -cne $taskExpectedIndex){throw 'IIS returned an index different from the selected staging release'}
   $taskDeep=Invoke-WebRequest -Uri ($FrontendUrl.AbsoluteUri.TrimEnd('/')+'/scanner-acceptance-refresh') -UseBasicParsing -TimeoutSec 60
   if($taskDeep.Content -cne $taskExpectedIndex){throw 'SPA refresh rewrite does not serve the selected staging release'}
   $taskRemoteBuild=Invoke-WebRequest -Uri ($FrontendUrl.AbsoluteUri.TrimEnd('/')+'/scanner-build.json') -UseBasicParsing -TimeoutSec 60
   if(($taskRemoteBuild.Content|ConvertFrom-Json|ConvertTo-Json -Compress) -cne ($taskBuild|ConvertTo-Json -Compress)){throw 'IIS build metadata differs from the selected release'}
   $taskAssets=[regex]::Matches($taskExpectedIndex,'(?:src|href)="(/Sam_Att/assets/[^"?]+)"')
   if(!$taskAssets.Count){throw 'Expected /Sam_Att/ static asset paths were not found'}
   foreach($taskAsset in $taskAssets){
    $taskPath=$taskAsset.Groups[1].Value
    $taskAssetResponse=Invoke-WebRequest -Uri ($FrontendUrl.GetLeftPart([UriPartial]::Authority)+$taskPath) -UseBasicParsing -TimeoutSec 60
    $taskAssetRelative=$taskPath.Substring('/Sam_Att/'.Length)
    $taskLocalAsset=[IO.Path]::GetFullPath((Join-Path (Join-Path $ReleasePath frontend) $taskAssetRelative))
    if(!$taskLocalAsset.StartsWith((Join-Path $ReleasePath frontend)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe frontend asset path'}
    $taskRemoteHash=[Security.Cryptography.SHA256]::Create();if($taskAssetResponse.RawContentStream.CanSeek){$taskAssetResponse.RawContentStream.Position=0};try{$taskActual=([BitConverter]::ToString($taskRemoteHash.ComputeHash($taskAssetResponse.RawContentStream))).Replace('-','')}finally{$taskRemoteHash.Dispose()}
    if($taskActual -ine (Get-FileHash -LiteralPath $taskLocalAsset -Algorithm SHA256).Hash){throw 'IIS static asset differs from release'}
   }
   Set-Result 'IISStaticRefresh' 'PASS' 'HTTPS index, SPA refresh and static asset hashes match the staging release' @{assetCount=$taskAssets.Count}
  }
 }
}catch{
 if($_.Exception.Message -ne 'ACCEPTANCE_STOP'){Set-Result $taskCurrent 'FAIL' 'Phase failed; investigate locally without exporting tokens/passwords/raw personnel';Write-Warning 'Stopped at first failure; no later phase was attempted'}
 $taskExit=1
}finally{
 foreach($taskName in $taskEnvNames){[Environment]::SetEnvironmentVariable($taskName,$taskEnvBefore[$taskName],'Process')}
 $BearerToken=$null;$DatabaseCredential=$null;$MigrationCredential=$null
 $taskOverall='NOT EXECUTED'
 if(@($taskResults.Values|Where-Object {$_.status -eq 'FAIL'}).Count){$taskOverall='FAIL'}elseif(@($taskResults.Values|Where-Object {$_.status -eq 'BLOCKED'}).Count){$taskOverall='BLOCKED'}
 $taskSummary=[ordered]@{generatedAtUtc=[DateTime]::UtcNow.ToString('o');schema='samchuk_attendance';phase=$Phase;planOnly=[bool]$PlanOnly;overallStatus=$taskOverall;productionActivated=$false;results=$taskResults}
 $taskSummary|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $taskRun 'acceptance-results.json') -Encoding utf8
 Write-Host "Evidence: $taskRun"
 Write-Host 'Interactive browser acceptance remains NOT EXECUTED until performed and documented by the operator.'
}
if($taskExit){exit $taskExit}
