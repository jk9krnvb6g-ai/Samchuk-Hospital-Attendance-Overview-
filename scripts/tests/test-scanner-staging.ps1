[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$taskRepo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskSource=Join-Path $taskRepo 'scripts/invoke-scanner-staging-acceptance.ps1'
$taskErrors=$null;$taskTokens=$null
$taskAst=[Management.Automation.Language.Parser]::ParseFile($taskSource,[ref]$taskTokens,[ref]$taskErrors)
if($taskErrors.Count){throw ($taskErrors|Out-String)}
# Load only function definitions; the real orchestrator main body is never executed.
foreach($taskFunction in $taskAst.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $taskFunction.Extent.Text}
$taskResults=[ordered]@{GatewayIdentity=$null;Scanner1=$null};$taskCurrent='Migration'
$taskPass=0
function Assert-Fixture($Condition,$Message){if(!$Condition){throw $Message}}
function Pass-Fixture($Name){$script:taskPass++;Write-Output "PASS: $Name"}
$taskEnvNames=@('SAM_ATT_DB_HOST','SAM_ATT_DB_PORT','SAM_ATT_DB_USER','SAM_ATT_DB_PASSWORD')
$taskEnvBefore=@{};foreach($taskName in $taskEnvNames){$taskEnvBefore[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
try{
 function node { $script:taskNodeArgs=@($args);$global:LASTEXITCODE=0;'{"fixture":true}' }
 $taskDb=Invoke-Db -Arguments @('--apply','--approved-plan',('a'*64))
 Assert-Fixture ($taskDb.fixture -and $taskNodeArgs.Count -eq 4 -and $taskNodeArgs[1] -eq '--apply' -and $taskNodeArgs[2] -eq '--approved-plan') 'DB CLI arguments were not preserved'
 Pass-Fixture 'plan approval hash reaches CLI as an argument (mock only)'
 $taskDb=Invoke-Db -Arguments @()
 Assert-Fixture ($taskNodeArgs.Count -eq 1) 'Read-only default unexpectedly passed mutation flags'
 Pass-Fixture 'inspect default passes no apply flags'
 $script:taskApproval='wrong';$script:taskPromptCount=0
 function Read-Host {param($Prompt)$script:taskPromptCount++;$script:taskApproval}
 $taskStopped=$false;try{Confirm-Change 'APPLY samchuk_attendance fixture-hash'}catch{$taskStopped=$true}
 Assert-Fixture ($taskStopped -and $taskResults.Migration.status -eq 'BLOCKED') 'Missing approval did not stop execution'
 Pass-Fixture 'mismatching approval blocks mutation'
 $script:taskApproval='APPLY samchuk_attendance fixture-hash'
 Confirm-Change 'APPLY samchuk_attendance fixture-hash'
 Pass-Fixture 'exact approval accepted without changing a database'
 $ApiBaseUrl=[uri]'http://staging.invalid:3001/Sam_Att/api/';$taskStopped=$false
 try{Need-Api}catch{$taskStopped=$true}
 Assert-Fixture ($taskStopped -and $taskResults.GatewayIdentity.status -eq 'BLOCKED') 'Insecure API URL was allowed'
 Pass-Fixture 'HTTP API is refused before token/network access'
 $ApiBaseUrl=[uri]'https://staging.invalid:3001/Sam_Att/api/';$BearerToken=ConvertTo-SecureString 'fixture-token' -AsPlainText -Force
 function Invoke-WebRequest {
  param($Uri,$Headers,$Method,$TimeoutSec,$UseBasicParsing,$ContentType,$Body)
  $taskError=New-Object Management.Automation.ErrorRecord ([Exception]::new('fixture HTTP 502')),'FIXTURE_HTTP',([Management.Automation.ErrorCategory]::InvalidOperation),$null
  $taskError.ErrorDetails=New-Object Management.Automation.ErrorDetails '{"success":false,"rawSaveSuccess":true,"totalInserted":3,"calculationStatus":"FAILED"}'
  throw $taskError
 }
 $taskResponse=Invoke-StageApi 'scanners/sync-custom' @{preview=$false}
 Assert-Fixture ($taskResponse.rawSaveSuccess -and $taskResponse.totalInserted -eq 3 -and !$taskResponse.success) 'HTTP error erased committed-raw evidence'
 Pass-Fixture 'JSON HTTP failure preserves separate raw/calc outcomes'
 # Preview digest mismatch must stop before approval or any actual sync request.
 $script:taskDbCalls=0;$script:taskApiCalls=0;$script:taskPromptCount=0
 function Invoke-Db {param([string[]]$Arguments)$script:taskDbCalls++;if($taskDbCalls -eq 1){return @{tables=@{attendance_raw_scan=@{rows=1;sha256='before'}}}};return @{tables=@{attendance_raw_scan=@{rows=1;sha256='after'}}}}
 function Invoke-StageApi {param($Path,$Body,$Timeout)$script:taskApiCalls++;return @{success=$true;totalFound=1}}
 $DatabaseCredential=New-Object PSCredential 'sam_fixture',(ConvertTo-SecureString 'fixture-only' -AsPlainText -Force)
 $Mode='DATE';$ScanDate='2026-11-03';$taskStopped=$false
 try{Test-ScannerGroup @(1) 'Scanner1'}catch{$taskStopped=$true}
 Assert-Fixture ($taskStopped -and $taskApiCalls -eq 1 -and $taskPromptCount -eq 0) 'Preview mutation did not prevent the write phase'
 Pass-Fixture 'changed preview snapshot prevents approval and real sync'
 # Explicit shared service restart requirement blocks before HTTP.
 $GatewayRestartRequired=$true;$taskStopped=$false
 try{Need-Api}catch{$taskStopped=$true}
 Assert-Fixture ($taskStopped -and $taskResults.GatewayIdentity.status -eq 'BLOCKED') 'Gateway restart requirement was not blocked'
 Pass-Fixture 'Production restart requirement is BLOCKED'
 $taskPrepareAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $taskRepo 'scripts/prepare-scanner-staging.ps1'),[ref]$taskTokens,[ref]$taskErrors)
 if($taskErrors.Count){throw 'Prepare script parser failure'}
 $taskGuard=@($taskPrepareAst.EndBlock.Statements|Where-Object {$_.Extent.Text -match '^\$taskApprovedRoot=|^\$taskApproved=' -or $_.Extent.Text.Contains('Only the explicit scanner-test subtree')})
 Assert-Fixture ($taskGuard.Count -eq 3) 'Staging root guard not located'
 foreach($taskRoot in @('C:\inetpub\wwwroot\Sam_Att-Scanner-Test','C:\inetpub\wwwroot\Sam_Att-Scanner-Test\scanner-releases')){foreach($taskStatement in $taskGuard){Invoke-Expression $taskStatement.Extent.Text}}
 foreach($taskRoot in @('C:\inetpub\wwwroot\Sam_Att','C:\inetpub\wwwroot\Sam_Att-Scanner-Test-other')){$taskStopped=$false;try{foreach($taskStatement in $taskGuard){Invoke-Expression $taskStatement.Extent.Text}}catch{$taskStopped=$true};Assert-Fixture $taskStopped 'Production/lookalike root accepted'}
 Pass-Fixture 'explicit FILESERVER test subtree accepted, Production/lookalike roots refused without file writes'
}finally{
 foreach($taskName in $taskEnvNames){[Environment]::SetEnvironmentVariable($taskName,$taskEnvBefore[$taskName],'Process')}
 $BearerToken=$null;$DatabaseCredential=$null
 Remove-Item Function:node -ErrorAction SilentlyContinue
}
Write-Output "PowerShell mocked acceptance checks passed: $taskPass/9. No database, scanner, IIS or network was accessed."
