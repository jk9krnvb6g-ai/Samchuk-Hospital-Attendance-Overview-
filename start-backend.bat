@echo off
setlocal enabledelayedexpansion
title Samchuk Hospital Central API Gateway (:3002)
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo    โรงพยาบาลสามชุก - Central API Gateway (พอร์ต 3002 รวมทุกระบบ)
echo    * รวม 3 ระบบหลักผ่านพอร์ต 3002 พอร์ตเดียว ไม่ต้องเปิดพอร์ตเพิ่ม:
echo      1. ระบบลงเวลา:     http://localhost:3002/api/Sam_Att/
echo      2. ระบบจัดซื้อ:       http://localhost:3002/api/procurement/
echo      3. ระบบเงินสดและเช็ค: http://localhost:3002/api/Cash_Cheque/
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

:: 1. ตรวจสอบ Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบคำสั่ง node ในเครื่อง กรุณาติดตั้ง Node.js
    pause
    exit /b 1
)

:: 2. ตรวจสอบ Dependencies
if not exist "node_modules\mysql2" (
    echo กำลังเตรียมแพ็กเกจเชื่อมต่อฐานข้อมูล MySQL...
    call npm install --legacy-peer-deps
)

:: 2.5 ตรวจสอบไฟล์ .env
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [OK] สร้างไฟล์ .env เริ่มต้นเรียบร้อยแล้ว
    )
)

:: 3. กำหนดพอร์ต 3002 เป็น Gateway หลัก
set API_PORT=3002
set PORT=3002
set PROCUREMENT_PORT=3003
set CASH_CHEQUE_PORT=3004

:: เคลียร์เฉพาะโปรเซสที่ค้างบนพอร์ต 3002
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: 4. สตาร์ท Master API Gateway
echo.
echo [OK] สตาร์ท Central API Gateway บนพอร์ต 3002 เรียบร้อยแล้ว!
echo =========================================================================
echo  [จุดเชื่อมต่อภายนอก]:
echo    - ระบบลงเวลา (Sam_Att):     http://localhost:3002/api/Sam_Att/
echo    - ระบบจัดซื้อ (Procurement): http://localhost:3002/api/procurement/
echo    - ระบบเช็ค (Cash_Cheque):   http://localhost:3002/api/Cash_Cheque/
echo.
echo  [Web Frontend]:
echo    - IIS Web: http://localhost:3001/Sam_Att/  และ http://localhost/Procurement/
echo =========================================================================
echo.

node backend\server.cjs

pause
