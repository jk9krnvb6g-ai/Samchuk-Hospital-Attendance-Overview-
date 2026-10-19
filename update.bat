@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - อัปเดตระบบผ่าน GitHub (Git Pull and Build)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

echo [1/3] กำลังเตรียมการและดึงโค้ดเวอร์ชันล่าสุดจาก GitHub...

:: สำรองไฟล์ appsettings.json หากผู้ใช้เคยแก้ไขรหัสผ่านหรือคอนฟิกไว้
if exist "backend\SamchukAttendance.Api\appsettings.json" (
    copy /y "backend\SamchukAttendance.Api\appsettings.json" "backend\SamchukAttendance.Api\appsettings.json.bak" >nul
)

:: เคลียร์การเปลี่ยนแปลงชั่วคราวและไฟล์ untracked เพื่อป้องกัน merge conflict
if exist "index.src.html" del /f /q "index.src.html" >nul 2>&1
git checkout -- backend/SamchukAttendance.Api/appsettings.json >nul 2>&1
git checkout -- index.html >nul 2>&1
git clean -f -d >nul 2>&1

:: ดึงโค้ดล่าสุด
git pull origin main
if %errorLevel% neq 0 (
    echo.
    echo [แจ้งเตือน] git pull ไม่ผ่าน กำลังลองใช้ git stash เพื่อดึงโค้ด...
    git stash
    git pull origin main
)

if %errorLevel% neq 0 (
    echo.
    echo [ผิดพลาด] ไม่สามารถ git pull ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
    pause
    exit /b 1
)

echo [OK] ดึงโค้ดล่าสุดจาก GitHub สำเร็จแล้ว

echo.
echo [2/3] อัปเดตแพ็กเกจ Frontend...
call npm install --legacy-peer-deps

echo.
echo [3/3] คอมไพล์ Frontend (Production Build)...
call npm run build

echo.
echo =========================================================================
echo    อัปเดตระบบเสร็จสิ้นเรียบร้อยแล้ว! (Sam_Att v2.2.3)
echo =========================================================================
echo * หากเคยตั้งค่าฐานข้อมูลใน appsettings.json ไว้ สามารถดูข้อมูลเดิมได้ที่:
echo   backend\SamchukAttendance.Api\appsettings.json.bak
echo.
echo ขั้นตอนต่อไป: สามารถรัน start-hospital.bat เพื่อเปิดระบบได้ทันที
echo =========================================================================
pause
