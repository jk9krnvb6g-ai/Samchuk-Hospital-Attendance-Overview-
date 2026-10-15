@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - คอมไพล์ Sam_Att สำหรับ IIS (พอร์ต 3001)
echo =========================================================================
echo [ไดเรกทอรี]: %CD%
echo.

:: 1. ตรวจสอบ node_modules
if not exist node_modules (
    echo [1/3] กำลังติดตั้ง Dependencies...
    call npm install --legacy-peer-deps
)

:: 2. คอมไพล์โปรเจกต์
echo [2/3] กำลังคอมไพล์โปรเจกต์ (Vite Build)...
call npm run build
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] คอมไพล์ไม่สำเร็จ
    pause
    exit /b 1
)

:: 3. เตรียมไฟล์สำหรับ IIS ในโฟลเดอร์ C:\inetpub\wwwroot\Sam_Att
echo [3/3] กำลังเตรียมไฟล์สำหรับ IIS (https://10.2.0.13:3001/Sam_Att/)...
if exist dist\assets (
    if not exist assets mkdir assets
    xcopy /Y /E /I dist\assets assets >nul
)
if exist dist\index.html (
    copy /Y dist\index.html index.html >nul
)
if exist public\web.config (
    copy /Y public\web.config web.config >nul
)

echo.
echo =========================================================================
echo  [สำเร็จ] คอมไพล์และติดตั้งไฟล์สำหรับ IIS เรียบร้อยแล้ว!
echo =========================================================================
echo  ท่านสามารถเปิดใช้งานได้ทันทีที่:
echo    https://10.2.0.13:3001/Sam_Att/
echo.
echo  (ทำงานร่วมกับ Procurement และ Cash_Cheque บนพอร์ต 3001 ได้ทันที)
echo =========================================================================
echo.
pause
