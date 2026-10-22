@echo off
:: 1. ขอสิทธิ์ Administrator อัตโนมัติ (ตามรูปแบบมาตรฐานของระบบ รพ.สามชุก)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] กำลังขอสิทธิ์ Administrator เพื่อจัดการพอร์ตระบบ...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Samchuk Hospital - All Systems Master Launcher (:3001 Web and :3002 API)
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo       โรงพยาบาลสามชุก - ตัวรันระบบรวมศูนย์ทั้งหมดในหน้าต่างเดียว
echo =========================================================================
echo   [Web Frontend พอร์ต 3001]:
echo     - https://10.2.0.13:3001/Procurement/
echo     - https://10.2.0.13:3001/Cash_Cheque/
echo     - https://10.2.0.13:3001/Sam_Att/
echo.
echo   [Backend API Service พอร์ต 3002]:
echo     - https://10.2.0.13:3002/api/procurement/ (ระบบจัดซื้อ)
echo     - https://10.2.0.13:3002/api/Cash_Cheque/ (ระบบเงินสดและเช็ค)
echo     - https://10.2.0.13:3002/api/Sam_Att/     (ระบบลงเวลา)
echo.
echo   * ไม่ต้องเปิดพอร์ตอื่นใน Firewall เพิ่มเติม (ภายนอกเห็นแค่ 3001 และ 3002)
echo =========================================================================
echo.

:: ---------------------------------------------------------------------------
:: ค้นหาโฟลเดอร์ของระบบ Procurement Server (ซึ่งรวม Cash_Cheque อยู่ในตัวแล้ว)
:: ---------------------------------------------------------------------------
set "PROCUREMENT_DIR="

if exist "%~dp0Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0Procurement\server"
) else if exist "%~dp0..\Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement\server"
) else if exist "C:\inetpub\wwwroot\Procurement\server" (
    set "PROCUREMENT_DIR=C:\inetpub\wwwroot\Procurement\server"
) else if exist "D:\Procurement\server" (
    set "PROCUREMENT_DIR=D:\Procurement\server"
)

:: ---------------------------------------------------------------------------
:: เคลียร์โปรเซสค้างเดิมเพื่อเตรียมรันใหม่
:: ---------------------------------------------------------------------------
echo [เตรียมพร้อม] ตรวจสอบและเคลียร์โปรเซสพอร์ต 3002 เดิม...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: ---------------------------------------------------------------------------
:: 1. สตาร์ท Procurement and Cash_Cheque Server
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [1/2] เริ่มต้น Procurement and Cash_Cheque API Gateway...
echo =========================================================================
if defined PROCUREMENT_DIR (
    if exist "%PROCUREMENT_DIR%" (
        echo       - โฟลเดอร์: %PROCUREMENT_DIR%
        echo       - ระบบจัดซื้อ (/api/procurement) และ ระบบเช็ค (/api/Cash_Cheque)
        start "Procurement and Cash_Cheque (:3002)" /D "%PROCUREMENT_DIR%" cmd /k "chcp 65001 >nul && npm start"
        echo       [OK] สตาร์ท Procurement and Cash_Cheque สำเร็จแล้ว
    ) else (
        echo       [คำเตือน] ไม่พบโฟลเดอร์ Procurement\server
    )
) else (
    echo       [คำแนะนำ] หากโฟลเดอร์ Procurement อยู่ตำแหน่งอื่น ให้เปิดรันแยกตามปกติ
)

:: ---------------------------------------------------------------------------
:: 2. สตาร์ท Samchuk Attendance Backend Service
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [2/2] เริ่มต้น Samchuk Attendance API Service...
echo =========================================================================
echo       - ระบบลงเวลา (/api/Sam_Att)
echo       - เชื่อมต่อเครื่องสแกนและฐานข้อมูล MySQL
echo.

start "Samchuk Attendance API (:3005)" /D "%~dp0" cmd /k "chcp 65001 >nul && set API_PORT=3005 && node backend\server.cjs"
echo       [OK] สตาร์ท Samchuk Attendance API เรียบร้อยแล้ว

echo.
echo =========================================================================
echo  [สรุปสถานะการทำงาน]:
echo  - Procurement and Cash_Cheque API: http://10.2.0.13:3002/
echo  - Samchuk Attendance Web:         https://10.2.0.13:3001/Sam_Att/
echo  - Samchuk Attendance API:         http://10.2.0.13:3005/ (หรือผ่าน Gateway 3002)
echo =========================================================================
echo.
pause
