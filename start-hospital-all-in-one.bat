@echo off
:: 1. ขอสิทธิ์ Administrator อัตโนมัติ (ตามรูปแบบมาตรฐานของระบบ รพ.สามชุก)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] กำลังขอสิทธิ์ Administrator เพื่อจัดการพอร์ตระบบ...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Samchuk Hospital - All Systems Master Launcher (:3001 Web & :3002 API)
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
echo     - https://10.2.0.13:3002/api/procurement/
echo     - https://10.2.0.13:3002/api/Cash_Cheque/
echo     - https://10.2.0.13:3002/api/Sam_Att/
echo.
echo   * ไม่ต้องเปิดพอร์ตอื่นใน Firewall เพิ่มเติม (ภายนอกเห็นแค่ 3001 และ 3002)
echo =========================================================================
echo.

:: ---------------------------------------------------------------------------
:: ค้นหาโฟลเดอร์ของแต่ละระบบอัตโนมัติ
:: ---------------------------------------------------------------------------
set "PROCUREMENT_DIR="
set "CASH_CHEQUE_DIR="

:: ค้นหาโฟลเดอร์ Procurement
if exist "%~dp0Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0Procurement\server"
) else if exist "%~dp0..\Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement\server"
) else if exist "C:\inetpub\wwwroot\Procurement\server" (
    set "PROCUREMENT_DIR=C:\inetpub\wwwroot\Procurement\server"
) else if exist "D:\Procurement\server" (
    set "PROCUREMENT_DIR=D:\Procurement\server"
)

:: ค้นหาโฟลเดอร์ Cash_Cheque
if exist "%~dp0Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=%~dp0Cash_Cheque\server"
) else if exist "%~dp0..\Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=%~dp0..\Cash_Cheque\server"
) else if exist "%~dp0Traindashboard" (
    set "CASH_CHEQUE_DIR=%~dp0Traindashboard"
) else if exist "C:\inetpub\wwwroot\Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=C:\inetpub\wwwroot\Cash_Cheque\server"
)

:: ---------------------------------------------------------------------------
:: เคลียร์โปรเซสค้างเดิมเพื่อเตรียมรันใหม่
:: ---------------------------------------------------------------------------
echo [เตรียมพร้อม] ตรวจสอบและเคลียร์พอร์ต...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3004 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: ---------------------------------------------------------------------------
:: 1. รัน Procurement Backend (แบบ start /B ในหน้าต่างเดียวกัน)
:: ---------------------------------------------------------------------------
echo [1/3] เริ่มต้น Procurement Backend (Internal Service)...
if defined PROCUREMENT_DIR (
    if exist "%PROCUREMENT_DIR%" (
        echo       - ไดเรกทอรี: %PROCUREMENT_DIR%
        start /B "Procurement" /D "%PROCUREMENT_DIR%" cmd /c "set PORT=3003 && set API_PORT=3003 && npm start"
        echo       [OK] Procurement Backend เริ่มทำงานแล้ว
    ) else (
        echo       [คำเตือน] ไม่พบโฟลเดอร์ Procurement\server
    )
) else (
    echo       [คำแนะนำ] หากโฟลเดอร์ Procurement อยู่ตำแหน่งอื่น ให้เปิดรันแยกโดยตั้ง "set PORT=3003"
)

:: ---------------------------------------------------------------------------
:: 2. รัน Cash_Cheque Backend (แบบ start /B ในหน้าต่างเดียวกัน)
:: ---------------------------------------------------------------------------
echo.
echo [2/3] เริ่มต้น Cash ^& Cheque Backend (Internal Service)...
if defined CASH_CHEQUE_DIR (
    if exist "%CASH_CHEQUE_DIR%" (
        echo       - ไดเรกทอรี: %CASH_CHEQUE_DIR%
        start /B "Cash_Cheque" /D "%CASH_CHEQUE_DIR%" cmd /c "set PORT=3004 && set API_PORT=3004 && npm start"
        echo       [OK] Cash ^& Cheque Backend เริ่มทำงานแล้ว
    ) else (
        echo       [คำเตือน] ไม่พบโฟลเดอร์ Cash_Cheque\server
    )
) else (
    echo       [คำแนะนำ] หากโฟลเดอร์ Cash_Cheque อยู่ตำแหน่งอื่น ให้เปิดรันแยกโดยตั้ง "set PORT=3004"
)

:: รอให้ microservices ภายในเริ่มทำงาน 2 วินาที
timeout /t 2 >nul

:: ---------------------------------------------------------------------------
:: 3. รัน Central API Gateway (:3002) - ประตูหลักรวมทุกระบบ
:: ---------------------------------------------------------------------------
echo.
echo [3/3] สตาร์ท Master API Gateway บนพอร์ต 3002...
echo =========================================================================
echo [SUCCESS] ทุกระบบพร้อมให้บริการแล้วในหน้าต่างนี้!
echo  - จุดเชื่อมต่อภายนอกพอร์ตเดียว: http://10.2.0.13:3002/api/...
echo  - Web Frontend:             http://10.2.0.13:3001/
echo  - หากต้องการปิดระบบทั้งหมด เพียงปิดหน้าต่างนี้ (กดกากบาท X)
echo =========================================================================
echo.

node backend\server.cjs

cmd /k
