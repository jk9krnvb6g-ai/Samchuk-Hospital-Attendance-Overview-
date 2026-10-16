# ============================================================================
# Samchuk Hospital - Scanner TCP Port 5005 & System Diagnostic Tool
# ============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "   Samchuk Hospital - Scanner TCP Port 5005 and System Diagnostic" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
    $ScriptDir = (Get-Location).Path
}

# ----------------------------------------------------------------------------
# 1. Check FK623Attend.dll
# ----------------------------------------------------------------------------
Write-Host "[1/4] Checking FK623Attend.dll location..." -ForegroundColor Yellow
$dllLocations = @(
    "C:\Windows\SysWOW64\FK623Attend.dll",
    "C:\Windows\System32\FK623Attend.dll",
    (Join-Path $ScriptDir "FK623Attend.dll"),
    (Join-Path $ScriptDir "backend\SamchukAttendance.Api\FK623Attend.dll")
)

$foundAnyDll = $false
foreach ($loc in $dllLocations) {
    if (Test-Path -Path $loc) {
        Write-Host "    [OK] Found DLL: $loc" -ForegroundColor Green
        $foundAnyDll = $true
    }
}

if (-not $foundAnyDll) {
    Write-Host "    [!] FK623Attend.dll not found. Please run install-dll.bat" -ForegroundColor Red
}
Write-Host ""

# ----------------------------------------------------------------------------
# 2. Read scanners from appsettings.json dynamically
# ----------------------------------------------------------------------------
Write-Host "[2/4] Testing all registered biometric scanners (TCP Port 5005)..." -ForegroundColor Yellow
$configPath = Join-Path $ScriptDir "backend\SamchukAttendance.Api\appsettings.json"
$scanners = @()

if (Test-Path -Path $configPath) {
    try {
        $rawContent = Get-Content -Path $configPath -Raw -Encoding UTF8
        $json = $rawContent | ConvertFrom-Json
        if ($json.Scanners) {
            $scanners = $json.Scanners
            Write-Host "    [OK] Loaded $($scanners.Count) scanner(s) from appsettings.json" -ForegroundColor Green
        }
    } catch {
        Write-Host "    [!] Could not parse appsettings.json: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Fallback default scanners if config not read
if ($scanners.Count -eq 0) {
    $scanners = @(
        [PSCustomObject]@{ MachineNo = 1; Name = "Scanner 1 - Admin Building"; IP = "192.168.111.163"; Port = 5005 },
        [PSCustomObject]@{ MachineNo = 2; Name = "Scanner 2 - ER Building"; IP = "192.168.111.164"; Port = 5005 },
        [PSCustomObject]@{ MachineNo = 3; Name = "Scanner 3 - IPD Building"; IP = "192.168.111.165"; Port = 5005 }
    )
    Write-Host "    [INFO] Using default list of $($scanners.Count) scanners" -ForegroundColor Gray
}

Write-Host "    (Direct TCP Socket test on Port 5005, ICMP ping not required)" -ForegroundColor Gray
Write-Host ""

$idx = 1
foreach ($s in $scanners) {
    $targetIp = [string]$s.IP
    $targetPort = if ($s.Port) { [int]$s.Port } else { 5005 }
    $scannerName = if ($s.Name) { [string]$s.Name } else { "Scanner " + [string]$s.MachineNo }

    Write-Host "--- [$idx/$($scanners.Count)] Testing $scannerName ($($targetIp):$($targetPort)) ---" -ForegroundColor Cyan
    try {
        $testResult = Test-NetConnection -ComputerName $targetIp -Port $targetPort -WarningAction SilentlyContinue
        if ($testResult.TcpTestSucceeded) {
            Write-Host "    [SUCCESS] Port $targetPort on $targetIp is OPEN (TcpTestSucceeded: True)" -ForegroundColor Green
        } else {
            Write-Host "    [FAILED] Port $targetPort on $targetIp could NOT be reached (TcpTestSucceeded: False)" -ForegroundColor Red
        }
    } catch {
        Write-Host "    [ERROR] Exception testing $targetIp : $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
    $idx++
}

# ----------------------------------------------------------------------------
# 3. Check Backend API on Port 3002
# ----------------------------------------------------------------------------
Write-Host "[3/4] Checking Backend API Service (Port 3002)..." -ForegroundColor Yellow
try {
    $apiTest = Test-NetConnection -ComputerName "127.0.0.1" -Port 3002 -WarningAction SilentlyContinue
    if ($apiTest.TcpTestSucceeded) {
        Write-Host "    [OK] Backend port 3002 is active" -ForegroundColor Green
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:3002/api/health" -TimeoutSec 3 -ErrorAction Stop
            Write-Host "    [OK] Backend Health Check responded (Status: $($health.status))" -ForegroundColor Green
        } catch {
            Write-Host "    [INFO] Port 3002 open, health endpoint slow or waiting" -ForegroundColor Gray
        }
    } else {
        Write-Host "    [!] Backend not running on port 3002. Please run start-hospital.bat" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [!] Could not connect to port 3002" -ForegroundColor Yellow
}
Write-Host ""

# ----------------------------------------------------------------------------
# 4. Optional: Test any new scanner IP
# ----------------------------------------------------------------------------
Write-Host "[4/4] Test a new or custom scanner IP..." -ForegroundColor Yellow
Write-Host "    If you have a new scanner to test right now without modifying any files:" -ForegroundColor Gray
$customIp = Read-Host "    Enter IP address to test (or press Enter to skip)"

if (-not [string]::IsNullOrWhiteSpace($customIp)) {
    $customPortInput = Read-Host "    Enter Port (press Enter for default 5005)"
    $customPort = 5005
    if (-not [string]::IsNullOrWhiteSpace($customPortInput)) {
        $customPort = [int]$customPortInput
    }

    Write-Host ""
    Write-Host "--- Testing New Scanner ($($customIp):$($customPort)) ---" -ForegroundColor Cyan
    try {
        $customTest = Test-NetConnection -ComputerName $customIp -Port $customPort -WarningAction SilentlyContinue
        if ($customTest.TcpTestSucceeded) {
            Write-Host "    [SUCCESS] Port $customPort on $customIp is OPEN! (TcpTestSucceeded: True)" -ForegroundColor Green
        } else {
            Write-Host "    [FAILED] Port $customPort on $customIp could NOT be reached (TcpTestSucceeded: False)" -ForegroundColor Red
        }
    } catch {
        Write-Host "    [ERROR] Exception testing $customIp : $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "Diagnostic Complete!" -ForegroundColor White
Write-Host "Frontend URL: https://10.2.0.13:3001/Sam_Att/" -ForegroundColor Green
Write-Host "API Swagger:  http://localhost:3002/swagger" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
