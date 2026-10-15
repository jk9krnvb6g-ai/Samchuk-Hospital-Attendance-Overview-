@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - อัปเดตระบบผ่าน GitHub (Git Pull and Build)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

echo [1/3] กำลังดึงโค้ดเวอร์ชันล่าสุดจาก GitHub...
git pull origin main
if %errorLevel% neq 0 (
    echo [ผิดพลาด] ไม่สามารถ git pull ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
    pause
    exit /b 1
)

echo.
echo [2/3] อัปเดตแพ็กเกจ Frontend...
call npm install

echo.
echo [3/3] คอมไพล์ Frontend...
call npm run build

echo.
echo =========================================================================
echo    อัปเดตระบบเสร็จสิ้นเรียบร้อยแล้ว!
echo =========================================================================
pause
