[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RepositoryPath,[Parameter(Mandatory=$true)][string]$StagingRoot)
$ErrorActionPreference='Stop'
$taskRepo=(Resolve-Path -LiteralPath $RepositoryPath).Path
$taskRoot=[System.IO.Path]::GetFullPath($StagingRoot)
if($taskRoot -match '(?i)\\inetpub\\|\\wwwroot\\' -or $taskRoot.TrimEnd('\') -eq [System.IO.Path]::GetPathRoot($taskRoot).TrimEnd('\')) {throw 'Choose a separate staging root outside live web roots and drive root'}
# Refuse reparse-point ancestors, preventing an apparently separate directory redirecting to live files.
$taskAncestor=$taskRoot
while($taskAncestor){
 if(Test-Path -LiteralPath $taskAncestor){if((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse-point staging ancestor refused'}}
 $taskParent=Split-Path -Path $taskAncestor -Parent
 if($taskParent -eq $taskAncestor){break};$taskAncestor=$taskParent
}
$taskGit=@('--no-optional-locks','-c',"safe.directory=$taskRepo",'-C',$taskRepo)
$taskCommit=(& git @taskGit rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $taskCommit -notmatch '^[a-f0-9]{40}$'){throw 'A committed checkout is required'}
if((& git @taskGit status --porcelain)){throw 'Commit or isolate pending edits before packaging'}
if(-not(Test-Path -LiteralPath (Join-Path $taskRepo 'dist/index.html'))){throw 'Run npm ci and npm run build before staging'}
$taskRelease=Join-Path $taskRoot ($taskCommit.Substring(0,12)+'-'+(Get-Date -Format 'yyyyMMddHHmmss'))
if(Test-Path -LiteralPath $taskRelease){throw 'Release already exists; refusing to overwrite'}
New-Item -ItemType Directory -Path $taskRelease -Force | Out-Null
foreach($taskDir in @('frontend','backend','backend/modules','backend/migrations','backend/tests','docs')){New-Item -ItemType Directory -Path (Join-Path $taskRelease $taskDir) -Force | Out-Null}
foreach($taskAsset in Get-ChildItem -LiteralPath (Join-Path $taskRepo 'dist') -Recurse -File){
 if($taskAsset.Extension -in @('.exe','.dll') -or $taskAsset.Name -match '(?i)ScannerSyncCli.*\.zip$'){continue}
 $taskRelative=$taskAsset.FullName.Substring((Join-Path $taskRepo 'dist').Length+1)
 $taskDestination=Join-Path (Join-Path $taskRelease frontend) $taskRelative
 New-Item -ItemType Directory -Path (Split-Path -Path $taskDestination -Parent) -Force | Out-Null
 Copy-Item -LiteralPath $taskAsset.FullName -Destination $taskDestination
}
foreach($taskFile in @('package.json','package-lock.json','backend/server.cjs','backend/scanner-storage.cjs','backend/scanner-db-admin.cjs','backend/migrations/scanner-mariadb-10.11.sql','backend/tests/scanner-mariadb.readonly.test.cjs','docs/scanner-mariadb-fileserver.md')){
 Copy-Item -LiteralPath (Join-Path $taskRepo $taskFile) -Destination (Join-Path $taskRelease $taskFile)
}
Copy-Item -LiteralPath (Join-Path $taskRepo 'backend/modules/sam_att') -Destination (Join-Path $taskRelease 'backend/modules') -Recurse
Copy-Item -LiteralPath (Join-Path $taskRepo 'backend/modules/sam-att') -Destination (Join-Path $taskRelease 'backend/modules') -Recurse
$taskManifest=Get-ChildItem -LiteralPath $taskRelease -File -Recurse | ForEach-Object { @{file=$_.FullName.Substring($taskRelease.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} }
@{commit=$taskCommit;files=@($taskManifest);activated=$false;readerIncluded=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRelease 'manifest.json') -Encoding utf8
Write-Output "Prepared separate staging artifact: $taskRelease"
Write-Output 'No live files, IIS/Gateway/service configuration or scanner executable were copied/replaced/activated.'
