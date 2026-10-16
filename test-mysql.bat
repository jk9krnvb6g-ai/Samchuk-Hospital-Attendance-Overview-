@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - สคริปต์ทดสอบการเชื่อมต่อ MySQL (10.2.0.201)
echo =========================================================================
echo.

set TARGET_HOST=10.2.0.201
set /p USER_HOST="ระบุ Host ของ MySQL [กด Enter เพื่อใช้ 10.2.0.201]: "
if not "!USER_HOST!"=="" set TARGET_HOST=!USER_HOST!

set TARGET_PORT=3306
set /p USER_PORT="ระบุ Port ของ MySQL [กด Enter เพื่อใช้ 3306]: "
if not "!USER_PORT!"=="" set TARGET_PORT=!USER_PORT!

set TARGET_USER=
set /p USER_USER="ระบุ Username (sa/root/เว้นว่างเพื่อทดสอบอัตโนมัติ): "
if not "!USER_USER!"=="" set TARGET_USER=!USER_USER!

set TARGET_PASS=
if not "!TARGET_USER!"=="" (
    set /p USER_PASS="ระบุ Password ของ !TARGET_USER!: "
    set TARGET_PASS=!USER_PASS!
)

echo.
echo เริ่มทดสอบกับ %TARGET_HOST%:%TARGET_PORT%...
echo.

node backend\cli-db-check.cjs %TARGET_HOST% %TARGET_PORT% "%TARGET_USER%" "%TARGET_PASS%"

echo.
pause
