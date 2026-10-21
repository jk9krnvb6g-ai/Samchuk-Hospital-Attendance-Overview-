@echo off
title Procurement Backend (Internal Port 3003 for Gateway)
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo    PROCUREMENT BACKEND (Service ภายในสำหรับ Gateway :3002)
echo    - เข้าถึงจากภายนอกผ่าน Gateway: http://localhost:3002/api/procurement/
echo    - Internal Port: 3003 (Loopback ในเครื่อง ไม่ต้องเปิด Firewall)
echo =========================================================================
echo.

if not exist "server\node_modules" (
    echo [INFO] Installing Backend dependencies...
    cd server
    call npm install
    cd ..
)

echo [INFO] Starting Procurement on Internal Port 3003...
cd server

:: กำหนด PORT เป็น 3003 เพื่อให้ Gateway พอร์ต 3002 เป็นตัวกระจายทราฟฟิก
set PORT=3003
set API_PORT=3003

cmd /k "npm start"
