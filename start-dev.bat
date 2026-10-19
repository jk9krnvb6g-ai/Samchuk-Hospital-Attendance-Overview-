@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Development Mode)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

:: 1. ตรวจสอบ Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบโปรแกรม Node.js ในเครื่องเซิร์ฟเวอร์
    echo กรุณาติดตั้ง Node.js หรือตรวจสอบ System PATH แล้วลองใหม่อีกครั้ง
    echo.
    pause
    exit /b 1
)

:: 2. ตรวจสอบ node_modules
if not exist "node_modules" (
    echo [ตรวจพบ] ยังไม่ได้ติดตั้งแพ็กเกจ (node_modules) กำลังติดตั้ง...
    call npm install --legacy-peer-deps
    if %errorLevel% neq 0 (
        echo [ข้อผิดพลาด] ติดตั้งแพ็กเกจไม่สำเร็จ
        pause
        exit /b 1
    )
    echo [OK] ติดตั้งแพ็กเกจเรียบร้อยแล้ว
    echo.
)

:: 3. ตรวจสอบว่าพอร์ต 3001 ถูกใช้งานอยู่แล้วหรือไม่ (เช่น IIS รัน Sam_Att / Procurement / Cash_Cheque)
set PORT_3001_IN_USE=0
for /f "tokens=*" %%i in ('netstat -ano ^| findstr /r ":3001.*LISTENING"') do (
    set PORT_3001_IN_USE=1
)

if "!PORT_3001_IN_USE!"=="1" (
    echo [แจ้งเตือนสำคัญ] ตรวจพบว่า พอร์ต 3001 กำลังถูกใช้งานอยู่แล้ว!
    echo ^(เครื่องนี้มี IIS เปิดใช้งาน https://10.2.0.13:3001/Sam_Att/ อยู่แล้ว^)
    echo.
    echo * หมายเหตุ:
    echo   - หากท่านต้องการอัปเดตหน้าเว็บจริงของ รพ. ให้รันไฟล์ "build-hospital.bat"
    echo   - สำหรับโหมดทดสอบ Dev ระบบจะสลับไปรันบนพอร์ต 3000 ให้โดยอัตโนมัติ
    echo.
    echo กำลังเริ่มต้น Web Frontend โหมดทดสอบ (พอร์ต 3000)...
    echo ลิงก์เข้าใช้งานทดสอบ: http://localhost:3000/Sam_Att/ หรือ http://10.2.0.13:3000/Sam_Att/
    echo ^(ข้อสังเกต: โหมด Dev ให้ใช้ http:// เท่านั้น ไม่ต้องใส่ https://^)
    echo.
    call npm run dev
) else (
    echo [OK] พอร์ต 3001 ว่างอยู่ กำลังเริ่มต้น Web Frontend โหมด Dev (พอร์ต 3001)...
    echo ลิงก์เข้าใช้งาน: http://localhost:3001/Sam_Att/ หรือ http://10.2.0.13:3001/Sam_Att/
    echo ^(ข้อสังเกต: โหมด Dev ให้ใช้ http:// เท่านั้น ไม่ต้องใส่ https://^)
    echo.
    call npm run dev:hospital
)

pause
