@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - สคริปต์นำเข้าฐานข้อมูล (MySQL UTF8MB4 ภาษาไทย 100%%)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

set /p MYSQL_HOST="ระบุ Host ของ MySQL [ค่าเริ่มต้น: localhost]: " || set MYSQL_HOST=localhost
if "%MYSQL_HOST%"=="" set MYSQL_HOST=localhost

set /p MYSQL_PORT="ระบุ Port ของ MySQL [ค่าเริ่มต้น: 3306]: " || set MYSQL_PORT=3306
if "%MYSQL_PORT%"=="" set MYSQL_PORT=3306

set /p MYSQL_USER="ระบุ Username ของ MySQL [ค่าเริ่มต้น: root]: " || set MYSQL_USER=root
if "%MYSQL_USER%"=="" set MYSQL_USER=root

echo.
echo กำลังนำเข้าฐานข้อมูล samchuk_attendance พร้อมระบบภาษาไทย UTF8MB4 100%%...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p --default-character-set=utf8mb4 < backend\SamchukAttendance.Database\Migrations\001_create_attendance_db.sql

if %errorLevel% equ 0 (
    echo.
    echo [สำเร็จ] นำเข้าฐานข้อมูล samchuk_attendance เรียบร้อยแล้ว!
    echo ตารางทั้งหมดถูกสร้างด้วย ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
) else (
    echo.
    echo [ผิดพลาด] การนำเข้าฐานข้อมูลล้มเหลว กรุณาตรวจสอบรหัสผ่านและสิทธิ์ของ MySQL
)

echo.
pause
