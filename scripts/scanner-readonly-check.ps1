<#
Read-only Windows Server readiness inspection. Does not execute the scanner,
import/start the backend, invoke Sync, send HTTP/SQL requests, modify Git/files,
read config/credentials/personnel, or start/restart any service.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RepositoryPath,
    [string]$ReaderPath
)
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path -LiteralPath $RepositoryPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskRepo 'backend/server.cjs') -PathType Leaf)) {
    throw 'Expected Sam_Att development/staging checkout was not found.'
}
if (Get-Command git -ErrorAction SilentlyContinue) {
    $taskGitArgs = @('--no-optional-locks', '-c', "safe.directory=$taskRepo", '-C', $taskRepo)
    Write-Output '--- Git branch / commit / pending file names (no file contents) ---'
    & git @taskGitArgs branch --show-current
    & git @taskGitArgs log -1 --format='%H'
    & git @taskGitArgs status --short
}
Write-Output '--- Tool availability (no executable is started) ---'
foreach ($taskTool in @('node', 'npm', 'mysql', 'docker')) {
    Write-Output ('{0}: {1}' -f $taskTool, [bool](Get-Command $taskTool -ErrorAction SilentlyContinue))
}
Write-Output '--- Existing frontend/backend listeners (passive local inspection) ---'
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $taskListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in @(3001, 3002) } |
        Select-Object LocalAddress, LocalPort, State)
    if ($taskListeners.Count) { $taskListeners | ForEach-Object { Write-Output ('{0}:{1} {2}' -f $_.LocalAddress, $_.LocalPort, $_.State) } } else { Write-Output 'No existing listener found on 3001/3002.' }
}
if (-not $ReaderPath) { $ReaderPath = Join-Path $taskRepo 'backend/ScannerSyncCli.exe' }
Write-Output '--- Reader metadata/hash only; the reader is NOT executed ---'
if (Test-Path -LiteralPath $ReaderPath -PathType Leaf) {
    $taskReader = Get-Item -LiteralPath $ReaderPath
    Write-Output ('Reader: {0}; bytes={1}; lastWriteUtc={2:o}' -f $taskReader.Name, $taskReader.Length, $taskReader.LastWriteTimeUtc)
    Write-Output ('SHA256: ' + (Get-FileHash -LiteralPath $taskReader.FullName -Algorithm SHA256).Hash)
} else { Write-Output 'Reader path not found; no search or replacement performed.' }
Write-Output '--- Staging artifacts present (existence only) ---'
foreach ($taskRelative in @('dist/index.html', 'docs/scanner-final-readiness-report.md', 'backend/tests/scanner-mysql.integration.test.cjs')) {
    Write-Output ('{0}: {1}' -f $taskRelative, (Test-Path -LiteralPath (Join-Path $taskRepo $taskRelative) -PathType Leaf))
}
Write-Output 'Inspection complete. These checks do not prove DB connectivity, EXE arguments/retention, browser behavior or production readiness.'
