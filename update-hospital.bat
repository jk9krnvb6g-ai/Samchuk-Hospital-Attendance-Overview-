@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - ซิงค์อัปเดตระบบ Sam_Att (Auto Update & Build)
echo =========================================================================
echo.

echo [1/2] กำลังอนุญาตสิทธิ์โฟลเดอร์และดึงโค้ดเวอร์ชันล่าสุดจาก Git...
git config --global --add safe.directory "%CD%" >nul 2>&1
git config --global --add safe.directory "C:/inetpub/wwwroot/Sam_Att" >nul 2>&1
git reset --hard HEAD
git pull origin main

echo.
echo [2/2] เริ่มกระบวนการคอมไพล์และติดตั้งลง IIS...
call "%~dp0build-hospital.bat"
