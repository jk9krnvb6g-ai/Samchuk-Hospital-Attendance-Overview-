# ============================================================================
# โรงพยาบาลสามชุก - เครื่องมือทดสอบพอร์ตเครื่องสแกนและระบบ (Auto Detect & Test)
# ============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "   โรงพยาบาลสามชุก - เครื่องมือทดสอบพอร์ตเครื่องสแกน (TCP 5005) & ระบบ" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
    $ScriptDir = Get-Location
}

# ----------------------------------------------------------------------------
# 1. ตรวจสอบไฟล์ FK623Attend.dll
# ----------------------------------------------------------------------------
Write-Host "[1/4] ตรวจสอบตำแหน่งไฟล์ FK623Attend.dll..." -ForegroundColor Yellow
$dllLocations = @(
    "C:\Windows\SysWOW64\FK623Attend.dll",
    "C:\Windows\System32\FK623Attend.dll",
    (Join-Path $ScriptDir "FK623Attend.dll"),
    (Join-Path $ScriptDir "backend\SamchukAttendance.Api\FK623Attend.dll")
)

$foundAnyDll = $false
foreach ($loc in $dllLocations) {
    if (Test-Path $loc) {
        Write-Host "    [OK] พบไฟล์: $loc" -ForegroundColor Green
        $foundAnyDll = $true
    }
}

if (-not $foundAnyDll) {
    Write-Host "    [!] ไม่พบไฟล์ FK623Attend.dll ในระบบ แนะนำให้รัน install-dll.bat" -ForegroundColor Red
}
Write-Host ""

# ----------------------------------------------------------------------------
# 2. อ่านรายการเครื่องสแกนทั้งหมดจาก appsettings.json อัตโนมัติ (Dynamic Loop)
# ----------------------------------------------------------------------------
Write-Host "[2/4] ตรวจสอบและทดสอบเครื่องสแกนทั้งหมดที่มีในระบบ..." -ForegroundColor Yellow
$configPath = Join-Path $ScriptDir "backend\SamchukAttendance.Api\appsettings.json"
$scanners = @()

if (Test-Path $configPath) {
    try {
        $json = Get-Content -Path $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.Scanners) {
            $scanners = $json.Scanners
            Write-Host "    [OK] โหลดรายชื่อเครื่องสแกนจาก appsettings.json พบทั้งหมด $($scanners.Count) เครื่อง" -ForegroundColor Green
        }
    } catch {
        Write-Host "    [!] อ่าน appsettings.json ไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# รายการสำรองหากหา config ไม่พบ
if ($scanners.Count -eq 0) {
    $scanners = @(
        [PSCustomObject]@{ MachineNo = 1; Name = "Scanner 1 - หน้าตึกอำนวยการ"; IP = "192.168.111.163"; Port = 5005 },
        [PSCustomObject]@{ MachineNo = 2; Name = "Scanner 2 - ตึกอุบัติเหตุและฉุกเฉิน (ER)"; IP = "192.168.111.164"; Port = 5005 },
        [PSCustomObject]@{ MachineNo = 3; Name = "Scanner 3 - ตึกผู้ป่วยใน (IPD)"; IP = "192.168.111.165"; Port = 5005 }
    )
    Write-Host "    [INFO] ใช้รายการเครื่องสแกนเริ่มต้น $($scanners.Count) เครื่อง" -ForegroundColor Gray
}

Write-Host "    (ทดสอบเชื่อมต่อตรงผ่าน Socket TCP Port 5005 ไม่ผ่าน ICMP Ping)" -ForegroundColor Gray
Write-Host ""

$testIndex = 1
foreach ($s in $scanners) {
    $ip = $s.IP
    $port = if ($s.Port) { [int]$s.Port } else { 5005 }
    $name = if ($s.Name) { $s.Name } else { "เครื่องที่ $($s.MachineNo)" }

    Write-Host "--- [$testIndex/$($scanners.Count)] ทดสอบ $name ($ip:$port) ---" -ForegroundColor Cyan
    try {
        $testResult = Test-NetConnection -ComputerName $ip -Port $port -WarningAction SilentlyContinue
        if ($testResult.TcpTestSucceeded) {
            Write-Host "    [SUCCESS] เชื่อมต่อพอร์ต $port ของ $ip สำเร็จ (TcpTestSucceeded: True)" -ForegroundColor Green
        } else {
            Write-Host "    [FAILED] ไม่สามารถเชื่อมต่อพอร์ต $port ของ $ip ได้ (TcpTestSucceeded: False)" -ForegroundColor Red
        }
    } catch {
        Write-Host "    [ERROR] เกิดข้อผิดพลาดในการทดสอบ: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
    $testIndex++
}

# ----------------------------------------------------------------------------
# 3. ตรวจสอบสถานะ Backend API Service บนพอร์ต 3002
# ----------------------------------------------------------------------------
Write-Host "[3/4] ตรวจสอบสถานะ Backend API Service (พอร์ต 3002)..." -ForegroundColor Yellow
try {
    $apiTest = Test-NetConnection -ComputerName "127.0.0.1" -Port 3002 -WarningAction SilentlyContinue
    if ($apiTest.TcpTestSucceeded) {
        Write-Host "    [OK] พอร์ต 3002 เปิดทำงานอยู่ (Backend กำลังรัน)" -ForegroundColor Green
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:3002/api/health" -TimeoutSec 3 -ErrorAction Stop
            Write-Host "    [OK] Health Check API ตอบกลับปกติ (Status: $($health.status))" -ForegroundColor Green
        } catch {
            Write-Host "    [INFO] พอร์ต 3002 เปิด แต่ Endpoint /api/health ตอบกลับล่าช้า" -ForegroundColor Gray
        }
    } else {
        Write-Host "    [!] ไม่พบ Service บนพอร์ต 3002 (กรุณารัน start-hospital.bat หรือ start-backend.bat)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [!] เกิดข้อผิดพลาดในการตรวจสอบพอร์ต 3002" -ForegroundColor Yellow
}
Write-Host ""

# ----------------------------------------------------------------------------
# 4. ทดสอบเครื่องใหม่เพิ่มเติมตามต้องการ (Interactive)
# ----------------------------------------------------------------------------
Write-Host "[4/4] ทดสอบเครื่องสแกนใหม่เพิ่มเติม..." -ForegroundColor Yellow
Write-Host "    หากมีเครื่องใหม่ที่ต้องการทดสอบทันทีโดยไม่ต้องแก้ไขไฟล์ใดๆ" -ForegroundColor Gray
$customIp = Read-Host "    ป้อน IP เครื่องสแกนที่ต้องการทดสอบเพิ่มเติม (หรือกด Enter เพื่อข้าม)"

if (-not [string]::IsNullOrWhiteSpace($customIp)) {
    $customPort = Read-Host "    ป้อน Port (กด Enter เพื่อใช้ค่าเริ่มต้น 5005)"
    if ([string]::IsNullOrWhiteSpace($customPort)) { $customPort = 5005 } else { $customPort = [int]$customPort }

    Write-Host ""
    Write-Host "--- กำลังทดสอบเครื่องใหม่ ($customIp:$customPort) ---" -ForegroundColor Cyan
    $newTest = Test-NetConnection -ComputerName $customIp -Port $customPort -WarningAction SilentlyContinue
    if ($newTest.TcpTestSucceeded) {
        Write-Host "    [SUCCESS] เชื่อมต่อพอร์ต $customPort ของ $customIp สำเร็จ! (TcpTestSucceeded: True)" -ForegroundColor Green
    } else {
        Write-Host "    [FAILED] ไม่สามารถเชื่อมต่อพอร์ต $customPort ของ $customIp ได้ (TcpTestSucceeded: False)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "เสร็จสิ้นการทดสอบ! เข้าใช้งานระบบได้ที่:" -ForegroundColor White
Write-Host "👉 Frontend Web: https://10.2.0.13:3001/Sam_Att/" -ForegroundColor Green
Write-Host "👉 Swagger API:  http://localhost:3002/swagger" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
