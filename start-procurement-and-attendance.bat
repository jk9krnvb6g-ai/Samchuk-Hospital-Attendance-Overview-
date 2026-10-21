@echo off
setlocal enabledelayedexpansion
title Dual Backend Launcher (Procurement :3002 & Sam_Att :3005)
chcp 65001 >nul
cls

echo =========================================================================
echo    โรงพยาบาลสามชุก - รัน Backend ทั้ง 2 ระบบควบคู่กัน
echo    1. ระบบจัดซื้อ (Procurement Backend)  -> API Port 3002 (Web: IIS)
echo    2. ระบบสแกนเวลา (Sam_Att Backend)     -> API Port 3005 (Web: :3001)
echo =========================================================================
echo.

:: 1. สตาร์ท Procurement Backend (พอร์ต 3002) ในหน้าต่างใหม่
echo [1/2] เริ่มต้น Procurement Backend บนพอร์ต 3002...
if exist "..\Procurement\server" (
    start "Procurement Backend (:3002)" cmd /k "cd /d "%~dp0\..\Procurement\server" && npm start"
    echo       [OK] สตาร์ท Procurement Backend สำเร็จ
) else if exist "server\package.json" (
    start "Procurement Backend (:3002)" cmd /k "cd /d "%~dp0\server" && npm start"
    echo       [OK] สตาร์ท Procurement Backend สำเร็จ
) else (
    echo       [คำแนะนำ] หาก Procurement อยู่คนละโฟลเดอร์ ให้รัน bat เดิมของ Procurement ได้ตามปกติ
    echo                 ทั้งสองระบบรันพร้อมกันได้ทันทีเพราะแยกพอร์ต 3002 และ 3005
)

:: 2. สตาร์ท Samchuk Attendance Backend (พอร์ต 3005) ในหน้าต่างใหม่
echo.
echo [2/2] เริ่มต้น Samchuk Attendance Backend บนพอร์ต 3005...
cd /d "%~dp0"
set API_PORT=3005
set PORT=3005

:: เคลียร์เฉพาะโปรเซสพอร์ต 3005 (ไม่แตะต้องพอร์ต 3002 ของ Procurement)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

start "Samchuk Attendance Backend (:3005)" cmd /k "cd /d "%~dp0" && set API_PORT=3005 && node backend\server.cjs"
echo       [OK] สตาร์ท Attendance Backend สำเร็จ (พอร์ต 3005)

echo.
echo =========================================================================
echo    ทั้ง 2 ระบบทำงานพร้อมกันแล้ว:
echo    - Procurement IIS Web:   http://localhost/Procurement/ (API Port: 3002)
echo    - Sam_Att Web:           http://localhost:3001/Sam_Att/ (API Port: 3005)
echo =========================================================================
pause
