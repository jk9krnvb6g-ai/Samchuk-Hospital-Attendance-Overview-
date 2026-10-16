@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - เครื่องมือทดสอบพอร์ตเครื่องสแกน (TCP 5005) & FK623
echo =========================================================================
echo.

:: --------------------------------------------------------------------------
:: 1. ตรวจสอบไฟล์ FK623Attend.dll ในระบบ
:: --------------------------------------------------------------------------
echo [1/4] ตรวจสอบตำแหน่งไฟล์ FK623Attend.dll...
set DLL_SYSWOW=C:\Windows\SysWOW64\FK623Attend.dll
set DLL_LOCAL=%~dp0FK623Attend.dll
set DLL_BACKEND=%~dp0backend\SamchukAttendance.Api\FK623Attend.dll

if exist "%DLL_SYSWOW%" (
    echo    [OK] พบไฟล์ใน C:\Windows\SysWOW64\FK623Attend.dll
) else (
    echo    [!] ไม่พบใน C:\Windows\SysWOW64\ (แนะนำให้รัน install-dll.bat)
)

if exist "%DLL_LOCAL%" (
    echo    [OK] พบไฟล์ในโฟลเดอร์หลัก: %DLL_LOCAL%
)

if exist "%DLL_BACKEND%" (
    echo    [OK] พบไฟล์ในโฟลเดอร์ Backend: %DLL_BACKEND%
)
echo.

:: --------------------------------------------------------------------------
:: 2. ทดสอบ TCP Port 5005 ด้วย PowerShell Test-NetConnection (ไม่ใช่ Ping)
:: --------------------------------------------------------------------------
echo [2/4] ทดสอบการเชื่อมต่อไปยังเครื่องสแกนผ่าน TCP Port 5005 (Test-NetConnection)...
echo       (เนื่องจากเครื่องสแกนปิด ICMP Ping จึงทดสอบผ่าน Socket TCP 5005 โดยตรง)
echo.

set SCANNER1_IP=192.168.111.163
set SCANNER1_PORT=5005
set SCANNER1_NAME=เครื่อง 1 (อาคารอำนวยการ)

set SCANNER2_IP=192.168.111.164
set SCANNER2_PORT=5005
set SCANNER2_NAME=เครื่อง 2 (อาคารอุบัติเหตุ)

echo --- กำลังทดสอบ %SCANNER1_NAME% (%SCANNER1_IP%:%SCANNER1_PORT%) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$t = Test-NetConnection -ComputerName '%SCANNER1_IP%' -Port %SCANNER1_PORT% -WarningAction SilentlyContinue; " ^
    "if ($t.TcpTestSucceeded) { " ^
    "    Write-Host '    [SUCCESS] เชื่อมต่อพอร์ต ' $t.RemotePort ' ของ ' $t.ComputerName ' สำเร็จ (TcpTestSucceeded: True)' -ForegroundColor Green " ^
    "} else { " ^
    "    Write-Host '    [FAILED] ไม่สามารถเชื่อมต่อพอร์ต ' %SCANNER1_PORT% ' ของ ' %SCANNER1_IP% ' ได้ (TcpTestSucceeded: False)' -ForegroundColor Red " ^
    "}"

echo.
echo --- กำลังทดสอบ %SCANNER2_NAME% (%SCANNER2_IP%:%SCANNER2_PORT%) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$t = Test-NetConnection -ComputerName '%SCANNER2_IP%' -Port %SCANNER2_PORT% -WarningAction SilentlyContinue; " ^
    "if ($t.TcpTestSucceeded) { " ^
    "    Write-Host '    [SUCCESS] เชื่อมต่อพอร์ต ' $t.RemotePort ' ของ ' $t.ComputerName ' สำเร็จ (TcpTestSucceeded: True)' -ForegroundColor Green " ^
    "} else { " ^
    "    Write-Host '    [FAILED] ไม่สามารถเชื่อมต่อพอร์ต ' %SCANNER2_PORT% ' ของ ' %SCANNER2_IP% ' ได้ (TcpTestSucceeded: False)' -ForegroundColor Red " ^
    "}"

echo.

:: --------------------------------------------------------------------------
:: 3. ทดสอบเรียก Backend API Port 3002
:: --------------------------------------------------------------------------
echo [3/4] ตรวจสอบสถานะ Backend API Service (พอร์ต 3002)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$api = Test-NetConnection -ComputerName '127.0.0.1' -Port 3002 -WarningAction SilentlyContinue; " ^
    "if ($api.TcpTestSucceeded) { " ^
    "    Write-Host '    [OK] Backend API บนพอร์ต 3002 กำลังทำงานอยู่' -ForegroundColor Green; " ^
    "    try { " ^
    "        $res = Invoke-RestMethod -Uri 'http://localhost:3002/api/health' -TimeoutSec 3 -ErrorAction Stop; " ^
    "        Write-Host '    [OK] Health Check API ตอบกลับปกติ' -ForegroundColor Green; " ^
    "    } catch { " ^
    "        Write-Host '    [!] เชื่อมต่อพอร์ต 3002 ได้ แต่ API Health ยังไม่ตอบ' -ForegroundColor Yellow; " ^
    "    } " ^
    "} else { " ^
    "    Write-Host '    [!] ไม่พบ Backend API บนพอร์ต 3002 (กรุณารัน start-hospital.bat หรือ start-backend.bat)' -ForegroundColor Yellow " ^
    "}"

echo.

:: --------------------------------------------------------------------------
:: 4. สรุปผลและคำแนะนำ
:: --------------------------------------------------------------------------
echo [4/4] สรุปและขั้นตอนถัดไป:
echo   - หากผลข้อ [2/4] ขึ้น [SUCCESS] ทั้งสองเครื่อง แสดงว่าระบบ Network และ Port 5005 พร้อม 100%%
echo   - หากต้องการทดสอบสั่งดึงข้อมูลจริง ให้เปิดเบราว์เซอร์ไปที่:
echo     👉 Frontend: https://10.2.0.13:3001/Sam_Att/ (เมนู Scanners & SDK -> กดปุ่ม 'Test Connect')
echo     👉 Swagger API: http://localhost:3002/swagger (ทดสอบ Scanners -> test-connection)
echo.
echo =========================================================================
pause
