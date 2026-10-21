@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Web :3001 and API :3005)
echo    * แยกพอร์ตอิสระ รันควบคู่กับระบบ Procurement (พอร์ต 3002) ได้พร้อมกัน
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

:: 3. สตาร์ท Backend API Service (พอร์ต 3005 - ไม่ชนกับ Procurement 3002)
echo [1/2] กำลังตรวจสอบและเริ่มต้น Backend API Gateway (พอร์ต 3005)...
set API_PORT=3005
set PORT=3005

:: เคลียร์เฉพาะโปรเซสค้างที่พอร์ต 3005 (ไม่แตะต้องพอร์ต 3002 ของ Procurement)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: สตาร์ท Node.js Backend API
start "Samchuk Attendance API (:3005)" cmd /k "chcp 65001 >nul && set API_PORT=3005 && node backend\server.cjs"
echo       [OK] Backend API Service สตาร์ทเรียบร้อยแล้ว (พอร์ต 3005)

:: 4. ตรวจสอบ Web Frontend (พอร์ต 3001)
echo.
echo [2/2] กำลังตรวจสอบสถานะ Web Frontend (พอร์ต 3001)...

set IIS_ACTIVE=0
for /f "tokens=*" %%i in ('netstat -ano ^| findstr /r ":3001.*LISTENING"') do (
    set IIS_ACTIVE=1
)

if "!IIS_ACTIVE!"=="1" (
    echo       [ตรวจพบ] เซิร์ฟเวอร์ IIS กำลังเปิดใช้งานบนพอร์ต 3001 อยู่แล้ว!
    echo       กำลังคอมไพล์โค้ดล่าสุดเข้าสู่ IIS (build-hospital.bat)...
    echo.
    call "%~dp0build-hospital.bat"
    echo.
    echo =========================================================================
    echo    ระบบ Sam_Att พร้อมใช้งานอย่างสมบูรณ์!
    echo =========================================================================
    echo  - Web Frontend (IIS HTTPS) : https://10.2.0.13:3001/Sam_Att/
    echo  - Backend API Gateway     : http://10.2.0.13:3005
    echo  - Procurement Backend     : http://localhost/Procurement/ (พอร์ต 3002 ทำงานปกติ)
    echo =========================================================================
    echo.
    echo กำลังเปิดหน้าเว็บในเบราว์เซอร์ใน 3 วินาที...
    timeout /t 3 >nul
    start https://10.2.0.13:3001/Sam_Att/
) else (
    echo       [ตรวจพบ] พอร์ต 3001 ว่างอยู่ (ไม่ได้รันผ่าน IIS)
    echo       กำลังคอมไพล์และเปิด Web Frontend ผ่าน Vite Preview...
    if not exist "dist" (
        call npm run build
    )
    start "Samchuk Attendance Web (:3001)" cmd /k "chcp 65001 >nul && npx vite preview --port=3001 --host=0.0.0.0"
    echo.
    echo =========================================================================
    echo    ระบบ Sam_Att พร้อมใช้งาน!
    echo =========================================================================
    echo  - Web Frontend (HTTP)     : http://10.2.0.13:3001/Sam_Att/
    echo  - Backend API Gateway     : http://10.2.0.13:3005
    echo  - Procurement Backend     : http://localhost/Procurement/ (พอร์ต 3002 ทำงานปกติ)
    echo =========================================================================
    echo.
    echo กำลังเปิดหน้าเว็บในเบราว์เซอร์ใน 3 วินาที...
    timeout /t 3 >nul
    start http://localhost:3001/Sam_Att/
)

echo กดปุ่มใดก็ได้เพื่อปิดหน้าต่างนี้ (บริการเว็บและ API ยังคงทำงานอยู่ในหน้าต่างแยก)
pause >nul
