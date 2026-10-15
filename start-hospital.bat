@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Web :3001 and API :3002)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

:: 1. ตรวจสอบ Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบ Node.js ในเครื่อง กรุณาติดตั้ง Node.js v20+ ก่อนเริ่มระบบ
    echo ดาวน์โหลดได้ที่: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. ตรวจสอบและติดตั้ง node_modules หากยังไม่มี
if not exist "node_modules\" (
    echo [ตรวจพบ] ยังไม่ได้ติดตั้ง node_modules กำลังรัน npm install...
    call npm install --legacy-peer-deps
    if %errorLevel% neq 0 (
        echo [ข้อผิดพลาด] การติดตั้งแพ็กเกจ npm ล้มเหลว
        pause
        exit /b 1
    )
    echo [OK] ติดตั้งแพ็กเกจเรียบร้อยแล้ว
    echo.
)

:: 3. ตรวจสอบไฟล์ dist สำหรับรัน Production Web (พอร์ต 3001)
if not exist "dist\index.html" (
    echo [ตรวจพบ] ยังไม่พบไฟล์คอมไพล์ในโฟลเดอร์ dist กำลังคอมไพล์ระบบ (npm run build)...
    call npm run build
    if %errorLevel% neq 0 (
        echo [ข้อผิดพลาด] การคอมไพล์ npm run build ล้มเหลว
        pause
        exit /b 1
    )
    echo [OK] คอมไพล์หน้าเว็บ Production เรียบร้อยแล้ว
    echo.
)

:: 4. เริ่มต้น Backend API (พอร์ต 3002)
echo กำลังเริ่มต้นระบบ...
where dotnet >nul 2>&1
if %errorLevel% equ 0 (
    echo [1/2] เริ่มต้น API Service (พอร์ต 3002): http://10.2.0.13:3002
    start "Samchuk Attendance API (:3002)" cmd /k "cd /d "%~dp0backend\SamchukAttendance.Api" && echo [Samchuk API 3002 กำลังทำงาน...] && dotnet run --urls "http://0.0.0.0:3002""
) else (
    echo [1/2] [คำเตือน] ไม่พบ .NET SDK ในเครื่อง (ข้ามการรัน Backend API ชั่วคราว)
    echo       หมายเหตุ: หน้าเว็บจะยังสามารถเปิดใช้งานได้ปกติ
    echo       หากต้องการระบบซิงค์เครื่องสแกน ให้ติดตั้ง .NET 8 SDK จาก:
    echo       https://dotnet.microsoft.com/download/dotnet/8.0
)

:: 5. เริ่มต้น Web Frontend (พอร์ต 3001)
echo.
echo [2/2] เริ่มต้น Web Frontend (พอร์ต 3001): http://10.2.0.13:3001/Sam_Att/
start "Samchuk Attendance Web (:3001)" cmd /k "cd /d "%~dp0" && echo [Samchuk Web 3001 กำลังทำงาน...] && npm run serve:hospital"

echo.
echo =========================================================================
echo    ระบบ Sam_Att กำลังทำงานเรียบร้อยแล้ว!
echo =========================================================================
echo [ลิงก์เข้าใช้งาน]:
echo  - หน้าเว็บ Web Frontend (เครื่องนี้)   : http://localhost:3001/Sam_Att/
echo  - หน้าเว็บ Web Frontend (เครือข่าย LAN): http://10.2.0.13:3001/Sam_Att/
echo  - Backend API Gateway (พอร์ต 3002)   : http://10.2.0.13:3002
echo.
echo * หมายเหตุ: หากใช้ HTTPS ผ่าน Reverse Proxy (Nginx / IIS)
echo   สามารถเข้าใช้งานได้ที่: https://10.2.0.13:3001/Sam_Att/
echo =========================================================================
echo.
echo กำลังเปิดหน้าเว็บในบราวเซอร์อัตโนมัติใน 3 วินาที...
timeout /t 3 >nul
start http://localhost:3001/Sam_Att/

pause
