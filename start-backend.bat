@echo off
setlocal enabledelayedexpansion
title Samchuk Hospital Central API Gateway (:3002) - รันครบ 3 ระบบ
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo    โรงพยาบาลสามชุก - Master API Gateway (พอร์ต 3002 รวมทั้ง 3 ระบบ)
echo    * บริการภายนอกผ่านพอร์ต 3002 พอร์ตเดียว ไม่ต้องเปิด Firewall เพิ่ม:
echo      1. ระบบลงเวลา:         http://localhost:3002/api/Sam_Att/
echo      2. ระบบจัดซื้อ:           http://localhost:3002/api/procurement/
echo      3. ระบบเงินสดและเช็ค:     http://localhost:3002/api/Cash_Cheque/
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

:: ---------------------------------------------------------------------------
:: [ตั้งค่าโฟลเดอร์ของแต่ละระบบ] (แก้ไขพาธตรงนี้หากโฟลเดอร์อยู่ตำแหน่งอื่น)
:: ---------------------------------------------------------------------------
set "PROCUREMENT_DIR="
set "CASH_CHEQUE_DIR="

:: 1. ตรวจจับโฟลเดอร์ระบบจัดซื้อ (Procurement) อัตโนมัติ
if exist "%~dp0..\Procurement\server" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement\server"
) else if exist "%~dp0..\Procurement\backend" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement\backend"
) else if exist "%~dp0..\Procurement" (
    set "PROCUREMENT_DIR=%~dp0..\Procurement"
) else if exist "%~dp0server\package.json" (
    set "PROCUREMENT_DIR=%~dp0server"
) else if exist "C:\inetpub\wwwroot\Procurement\server" (
    set "PROCUREMENT_DIR=C:\inetpub\wwwroot\Procurement\server"
) else if exist "C:\inetpub\wwwroot\Procurement" (
    set "PROCUREMENT_DIR=C:\inetpub\wwwroot\Procurement"
) else if exist "D:\Procurement\server" (
    set "PROCUREMENT_DIR=D:\Procurement\server"
) else if exist "D:\Procurement" (
    set "PROCUREMENT_DIR=D:\Procurement"
)

:: 2. ตรวจจับโฟลเดอร์ระบบเช็ค (Cash_Cheque) อัตโนมัติ
if exist "%~dp0..\Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=%~dp0..\Cash_Cheque\server"
) else if exist "%~dp0..\Cash_Cheque\backend" (
    set "CASH_CHEQUE_DIR=%~dp0..\Cash_Cheque\backend"
) else if exist "%~dp0..\Cash_Cheque" (
    set "CASH_CHEQUE_DIR=%~dp0..\Cash_Cheque"
) else if exist "C:\inetpub\wwwroot\Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=C:\inetpub\wwwroot\Cash_Cheque\server"
) else if exist "C:\inetpub\wwwroot\Cash_Cheque" (
    set "CASH_CHEQUE_DIR=C:\inetpub\wwwroot\Cash_Cheque"
) else if exist "D:\Cash_Cheque\server" (
    set "CASH_CHEQUE_DIR=D:\Cash_Cheque\server"
) else if exist "D:\Cash_Cheque" (
    set "CASH_CHEQUE_DIR=D:\Cash_Cheque"
)

:: ---------------------------------------------------------------------------
:: ตรวจสอบ Node.js และ Dependencies
:: ---------------------------------------------------------------------------
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบคำสั่ง node ในเครื่อง กรุณาติดตั้ง Node.js
    pause
    exit /b 1
)

if not exist "node_modules\mysql2" (
    echo กำลังเตรียมแพ็กเกจเชื่อมต่อฐานข้อมูล MySQL...
    call npm install --legacy-peer-deps
)

if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [OK] สร้างไฟล์ .env เริ่มต้นเรียบร้อยแล้ว
    )
)

:: ---------------------------------------------------------------------------
:: กำหนดค่าพอร์ตและเคลียร์โปรเซสเดิม
:: ---------------------------------------------------------------------------
set API_PORT=3002
set PORT=3002
set PROCUREMENT_PORT=3003
set CASH_CHEQUE_PORT=3004

echo กำลังจัดเตรียมพอร์ตระบบ...
:: เคลียร์โปรเซสพอร์ต 3002 (Gateway เดิมถ้ามี)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: ---------------------------------------------------------------------------
:: 1. สตาร์ท Procurement Backend (Internal Port 3003)
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [1/3] เริ่มต้นระบบจัดซื้อ (Procurement Backend บน Internal Port 3003)...
echo =========================================================================
if defined PROCUREMENT_DIR (
    if exist "!PROCUREMENT_DIR!" (
        echo   - โฟลเดอร์: !PROCUREMENT_DIR!
        :: เคลียร์พอร์ต 3003 ค้าง
        for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
        start "Procurement Backend (Internal :3003)" cmd /k "chcp 65001 >nul && cd /d "!PROCUREMENT_DIR!" && set PORT=3003 && set API_PORT=3003 && npm start"
        echo   [OK] สตาร์ท Procurement บน Internal Port 3003 สำเร็จแล้ว
    ) else (
        goto NO_PROCUREMENT_FOUND
    )
) else (
:NO_PROCUREMENT_FOUND
    echo   [คำแนะนำ] หาก Procurement อยู่โฟลเดอร์อื่น ให้ทำอย่างใดอย่างหนึ่ง:
    echo     วิธีที่ 1: ใส่ path ในบรรทัด "set PROCUREMENT_DIR=..." บนหัวไฟล์ bat นี้
    echo     วิธีที่ 2: ในไฟล์ bat เดิมของ Procurement ให้เพิ่มบรรทัด "set PORT=3003" ก่อน npm start
)

:: ---------------------------------------------------------------------------
:: 2. สตาร์ท Cash & Cheque Backend (Internal Port 3004)
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [2/3] เริ่มต้นระบบเงินสดและเช็ค (Cash & Cheque บน Internal Port 3004)...
echo =========================================================================
if defined CASH_CHEQUE_DIR (
    if exist "!CASH_CHEQUE_DIR!" (
        echo   - โฟลเดอร์: !CASH_CHEQUE_DIR!
        :: เคลียร์พอร์ต 3004 ค้าง
        for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3004 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
        start "Cash & Cheque Backend (Internal :3004)" cmd /k "chcp 65001 >nul && cd /d "!CASH_CHEQUE_DIR!" && set PORT=3004 && set API_PORT=3004 && npm start"
        echo   [OK] สตาร์ท Cash & Cheque บน Internal Port 3004 สำเร็จแล้ว
    ) else (
        goto NO_CASH_FOUND
    )
) else (
:NO_CASH_FOUND
    echo   [คำแนะนำ] หาก Cash_Cheque อยู่โฟลเดอร์อื่น ให้ทำอย่างใดอย่างหนึ่ง:
    echo     วิธีที่ 1: ใส่ path ในบรรทัด "set CASH_CHEQUE_DIR=..." บนหัวไฟล์ bat นี้
    echo     วิธีที่ 2: ในไฟล์ bat เดิมของ Cash_Cheque ให้เพิ่มบรรทัด "set PORT=3004" ก่อน npm start
)

:: รอให้ microservices ภายในเริ่มทำงาน 2 วินาที
timeout /t 2 >nul

:: ---------------------------------------------------------------------------
:: 3. สตาร์ท Central API Gateway & Sam_Att (พอร์ต 3002) ในหน้าต่างหลักนี้
:: ---------------------------------------------------------------------------
echo.
echo =========================================================================
echo [3/3] สตาร์ท Central API Gateway บนพอร์ต 3002...
echo =========================================================================
echo  [จุดเชื่อมต่อภายนอก (พอร์ต 3002 พอร์ตเดียว ไม่ต้องเปิด Firewall เพิ่ม)]:
echo    - ระบบลงเวลา (Sam_Att):         http://localhost:3002/api/Sam_Att/
echo    - ระบบจัดซื้อ (Procurement):     http://localhost:3002/api/procurement/ (ส่งต่อ -> :3003)
echo    - ระบบเช็ค (Cash_Cheque):       http://localhost:3002/api/Cash_Cheque/ (ส่งต่อ -> :3004)
echo.
echo  [Web Frontend]:
echo    - IIS Web: http://localhost:3001/Sam_Att/
echo    - IIS Web: http://localhost:3001/Procurement/
echo    - IIS Web: http://localhost:3001/Cash_Cheque/
echo =========================================================================
echo.

node backend\server.cjs

pause
