@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - ติดตั้งและลงทะเบียน FK623Attend.dll สำหรับเครื่องสแกน
echo =========================================================================
echo.

:: 1. ตรวจสอบสิทธิ์ Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [คำเตือน] กรุณาคลิกขวาที่ไฟล์นี้แล้วเลือก "Run as administrator"
    echo เพื่อให้สามารถคัดลอกไฟล์ลงโฟลเดอร์ C:\Windows\SysWOW64 ได้
    echo.
    pause
    exit /b 1
)

:: 2. ตรวจสอบไฟล์ DLL
if not exist "FK623Attend.dll" (
    echo [ไม่พบไฟล์] ไม่พบไฟล์ FK623Attend.dll ในโฟลเดอร์นี้ (%CD%)
    echo.
    echo กรุณานำไฟล์ FK623Attend.dll จาก SDK มาวางในโฟลเดอร์นี้ก่อน แล้วรันใหม่อีกครั้ง
    echo.
    pause
    exit /b 1
)

echo [1/4] กำลังคัดลอกไปยัง C:\Windows\SysWOW64 (สำหรับ 32-bit บน Windows 64-bit)...
copy /Y "FK623*.dll" "C:\Windows\SysWOW64\" >nul
copy /Y "FK*.dll" "C:\Windows\SysWOW64\" >nul
if %errorLevel% equ 0 (
    echo       [OK] คัดลอกลง SysWOW64 เรียบร้อย
) else (
    echo       [แจ้งเตือน] ไม่สามารถคัดลอกได้ กรุณาตรวจสอบสิทธิ์ Admin
)

echo [2/4] กำลังคัดลอกไปยัง C:\Windows\System32...
copy /Y "FK623*.dll" "C:\Windows\System32\" >nul
copy /Y "FK*.dll" "C:\Windows\System32\" >nul
if %errorLevel% equ 0 (
    echo       [OK] คัดลอกลง System32 เรียบร้อย
)

echo [3/4] กำลังคัดลอกไปยังโฟลเดอร์ Backend API...
if not exist "backend\SamchukAttendance.Api" mkdir "backend\SamchukAttendance.Api"
copy /Y "FK*.dll" "backend\SamchukAttendance.Api\" >nul
if exist "backend\SamchukAttendance.Api\bin\Debug\net8.0" (
    copy /Y "FK*.dll" "backend\SamchukAttendance.Api\bin\Debug\net8.0\" >nul
)
if exist "backend\SamchukAttendance.Api\bin\Release\net8.0" (
    copy /Y "FK*.dll" "backend\SamchukAttendance.Api\bin\Release\net8.0\" >nul
)
echo       [OK] คัดลอกลง Backend API เรียบร้อย

echo [4/4] ลงทะเบียน DLL (ถ้าเป็น COM/ActiveX)...
regsvr32 /s "C:\Windows\SysWOW64\FK623Attend.dll" 2>nul

echo.
echo =========================================================================
echo  [สำเร็จ] ติดตั้ง FK623Attend.dll เรียบร้อยแล้ว!
echo =========================================================================
echo.
pause
