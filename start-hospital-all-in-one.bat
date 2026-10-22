@echo off
:: 1. ขอสิทธิ์ Administrator อัตโนมัติ
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Samchuk Hospital - All Systems Master Gateway (:3001 Web and :3002 API)
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo       โรงพยาบาลสามชุก - รันระบบรวมศูนย์ทั้งหมด (ALL-IN-ONE)
echo =========================================================================
echo   [Web Frontend พอร์ต 3001]:
echo     - https://10.2.0.13:3001/Procurement/
echo     - https://10.2.0.13:3001/Cash_Cheque/
echo     - https://10.2.0.13:3001/Sam_Att/
echo.
echo   [Backend API Service พอร์ต 3002 รวมทุกระบบ]:
echo     - https://10.2.0.13:3002/api/procurement/ (จัดซื้อ)
echo     - https://10.2.0.13:3002/api/Cash_Cheque/ (เงินสดและเช็ค)
echo     - https://10.2.0.13:3002/api/Sam_Att/     (ลงเวลา)
echo.
echo   * ไม่ต้องเปิดพอร์ต 3003 หรือ 3004 เพิ่มเติมใน Firewall ภายนอก
echo =========================================================================
echo [ตำแหน่งโฟลเดอร์ทำงาน]: %CD%
echo.

:: ---------------------------------------------------------------------------
:: ค้นหาตำแหน่งโฟลเดอร์ Procurement\server และ Backend ลงเวลา
:: ---------------------------------------------------------------------------
set "PROCUREMENT_DIR="
set "ATTENDANCE_DIR="

if exist "%~dp0Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0Procurement\server"
) else if exist "%~dp0..\Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement\server"
) else if exist "C:\inetpub\wwwroot\Procurement\server" (
    set "PROCUREMENT_DIR=C:\inetpub\wwwroot\Procurement\server"
) else if exist "D:\Procurement\server" (
    set "PROCUREMENT_DIR=D:\Procurement\server"
)

if exist "%~dp0backend\server.cjs" (
    set "ATTENDANCE_DIR=%~dp0"
) else if exist "%~dp0Samchuk_Attendance\backend\server.cjs" (
    set "ATTENDANCE_DIR=%~dp0Samchuk_Attendance"
) else if exist "%~dp0Sam_Att\backend\server.cjs" (
    set "ATTENDANCE_DIR=%~dp0Sam_Att"
) else if exist "C:\inetpub\wwwroot\Sam_Att\backend\server.cjs" (
    set "ATTENDANCE_DIR=C:\inetpub\wwwroot\Sam_Att"
)

:: ---------------------------------------------------------------------------
:: เคลียร์โปรเซสค้างเดิมบนพอร์ต 3002
:: ---------------------------------------------------------------------------
echo [เตรียมพร้อม] เคลียร์โปรเซสที่อาจค้างบนพอร์ต 3002...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: ---------------------------------------------------------------------------
:: รันระบบ API Gateway พอร์ต 3002
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [1/1] เริ่มต้น Central API Gateway (พอร์ต 3002)...
echo =========================================================================

if defined PROCUREMENT_DIR (
    if exist "%PROCUREMENT_DIR%" (
        echo [INFO] พบโฟลเดอร์ Gateway: %PROCUREMENT_DIR%
        echo [INFO] เริ่มต้น Backend Gateway พอร์ต 3002 ในหน้าต่างนี้...
        cd /d "%PROCUREMENT_DIR%"
        if not exist "node_modules" (
            echo [INFO] กำลังติดตั้ง Dependencies...
            call npm install --no-audit
        )
        :: รัน Gateway พอร์ต 3002
        call npm start
    ) else (
        echo [ERROR] ไม่พบโฟลเดอร์ Procurement\server
        goto FALLBACK_ATTENDANCE
    )
) else (
    echo [คำเตือน] ไม่พบตำแหน่ง Procurement\server อัตโนมัติ
    goto FALLBACK_ATTENDANCE
)
goto END

:FALLBACK_ATTENDANCE
if defined ATTENDANCE_DIR (
    echo [INFO] กำลังรัน Samchuk Attendance Backend โดยตรง...
    cd /d "%ATTENDANCE_DIR%"
    set API_PORT=3002
    node backend\server.cjs
) else (
    echo [ERROR] ไม่พบทั้ง Procurement\server และระบบลงเวลา
)

:END
echo.
echo ระบบหยุดทำงาน กรุณากดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
pause
