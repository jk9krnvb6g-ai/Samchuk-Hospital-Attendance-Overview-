@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - เริ่มต้น Backend API Service (พอร์ต 3002)
echo =========================================================================
echo [ไดเรกทอรี]: %CD%
echo.

:: 1. ตรวจสอบ Node.js (เครื่องเซิร์ฟเวอร์ติดตั้งไว้แล้ว v24.13.0)
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบคำสั่ง node ในเครื่อง กรุณาติดตั้ง Node.js
    pause
    exit /b 1
)

:: 2. ตรวจสอบ Dependencies
if not exist "node_modules\mysql2" (
    echo กำลังเตรียมแพ็กเกจเชื่อมต่อฐานข้อมูลและ Socket...
    call npm install --legacy-peer-deps
)

:: 3. ตรวจสอบและเคลียร์พอร์ต 3002 หากมีโปรเซสเดิมเปิดค้างอยู่ (ป้องกัน Error EADDRINUSE)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: 4. เริ่มต้นรัน Backend บนพอร์ต 3002
echo [OK] สตาร์ท Backend API Service บนพอร์ต 3002...
echo.
node backend\server.cjs

pause
