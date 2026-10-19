@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - ซิงค์อัปเดตระบบ Sam_Att (Auto Update and Build)
echo =========================================================================
echo.

echo [1/2] กำลังอนุญาตสิทธิ์โฟลเดอร์และดึงโค้ดเวอร์ชันล่าสุดจาก Git...
git config --global --add safe.directory "%CD%" >nul 2>&1
git config --global --add safe.directory "C:/inetpub/wwwroot/Sam_Att" >nul 2>&1

:: ลบไฟล์ index.src.html และไฟล์ชั่วคราว untracked ที่อาจขวางการ git pull
if exist "index.src.html" del /f /q "index.src.html" >nul 2>&1
git checkout HEAD -- index.html >nul 2>&1
git reset --hard HEAD >nul 2>&1
git clean -f -d >nul 2>&1

git pull origin main
if %errorLevel% neq 0 (
    echo.
    echo [แจ้งเตือน] กำลังเคลียร์ไฟล์ untracked และลองดึงใหม่อีกครั้ง...
    if exist "index.src.html" del /f /q "index.src.html" >nul 2>&1
    git reset --hard HEAD >nul 2>&1
    git clean -f -d >nul 2>&1
    git pull origin main
)

echo.
echo [2/2] เริ่มกระบวนการคอมไพล์และติดตั้งลง IIS...
call "%~dp0build-hospital.bat"
