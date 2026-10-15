@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

:: กำหนดหมายเลขพอร์ต (หากพอร์ต 3001 ติด EACCES หรือถูกจอง ให้เปลี่ยนเป็น 3000 หรือ 8080 ได้)
if "%FRONTEND_PORT%"=="" set FRONTEND_PORT=3001
if "%API_PORT%"=="" set API_PORT=3002

echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Web :%FRONTEND_PORT% and API :%API_PORT%)
echo =========================================================================
echo [ไดเรกทอรีทำงาน]: %CD%
echo.

:: 1. ตรวจสอบ Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ข้อผิดพลาด] ไม่พบโปรแกรม Node.js ในเครื่อง
    echo กรุณาติดตั้ง Node.js จาก https://nodejs.org/ แล้วลองใหม่อีกครั้ง
    echo.
    pause
    exit /b 1
)

:: 2. ตรวจสอบ node_modules
if not exist node_modules (
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

:: 3. ตรวจสอบโฟลเดอร์ dist สำหรับ Production Web
if not exist dist (
    echo [ตรวจพบ] ยังไม่มีโฟลเดอร์ dist กำลังคอมไพล์ระบบ (npm run build)...
    call npm run build
    if %errorLevel% neq 0 (
        echo [ข้อผิดพลาด] การคอมไพล์ไม่สำเร็จ
        pause
        exit /b 1
    )
    echo [OK] คอมไพล์หน้าเว็บเรียบร้อยแล้ว
    echo.
)

:: 4. สตาร์ท API Service (พอร์ต 3002)
echo กำลังเริ่มต้นบริการ...
where dotnet >nul 2>&1
if %errorLevel% equ 0 (
    echo [1/2] กำลังเปิด Backend API Service (พอร์ต %API_PORT%)...
    start "Samchuk Attendance API (:%API_PORT%)" cmd /k "cd backend\SamchukAttendance.Api && dotnet run --urls http://0.0.0.0:%API_PORT%"
) else (
    echo [1/2] [คำเตือน] ไม่พบ .NET SDK ในเครื่อง (ข้าม Backend API)
    echo       หน้าเว็บ Frontend จะยังใช้งานได้ตามปกติ
    echo       หากต้องการให้ระบบซิงค์เครื่องสแกน ให้ติดตั้ง .NET 8 SDK
    echo       ดาวน์โหลด: https://dotnet.microsoft.com/download/dotnet/8.0
)

:: 5. สตาร์ท Web Frontend
echo.
echo [2/2] กำลังเปิด Web Frontend (พอร์ต %FRONTEND_PORT%)...
start "Samchuk Attendance Web (:%FRONTEND_PORT%)" cmd /k npx vite preview --port=%FRONTEND_PORT% --host=0.0.0.0

echo.
echo =========================================================================
echo    ระบบ Sam_Att เริ่มต้นทำงานแล้ว!
echo =========================================================================
echo [ลิงก์เปิดใช้งาน]:
echo  - เปิดใช้งานบนเครื่องนี้  : http://localhost:%FRONTEND_PORT%/Sam_Att/
echo  - เครื่องอื่นในวง LAN รพ. : http://10.2.0.13:%FRONTEND_PORT%/Sam_Att/
echo  - Backend API Gateway    : http://10.2.0.13:%API_PORT%
echo =========================================================================
echo.
echo กำลังเปิดหน้าเว็บในบราวเซอร์อัตโนมัติใน 3 วินาที...
timeout /t 3 >nul
start http://localhost:%FRONTEND_PORT%/Sam_Att/

echo กดปุ่มใดก็ได้เพื่อปิดหน้าต่างนี้ (บริการเว็บและ API ยังคงทำงานอยู่ในหน้าต่างแยก)
pause >nul
