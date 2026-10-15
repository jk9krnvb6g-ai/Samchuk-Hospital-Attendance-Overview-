@echo off
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - ตัวติดตั้งระบบจัดการเวลาปฏิบัติงาน (v2) ผ่าน GitHub
echo    Samchuk Attendance & Biometric System Auto-Installer
echo =========================================================================
echo.

:: ตรวจสอบสิทธิ์ Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [คำเตือน] กรุณาคลิกขวาที่ไฟล์นี้แล้วเลือก "Run as administrator"
    echo เพื่อให้ระบบสามารถสร้าง Windows Service และลงทะเบียน DLL ได้อย่างสมบูรณ์
    echo.
    pause
    exit /b 1
)

echo [1/5] ตรวจสอบโปรแกรมที่จำเป็น (Prerequisites)...
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo [ผิดพลาด] ไม่พบโปรแกรม Git ในเครื่อง กรุณาติดตั้ง Git for Windows ก่อน
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ผิดพลาด] ไม่พบ Node.js ในเครื่อง กรุณาติดตั้ง Node.js v20+ ก่อน
    pause
    exit /b 1
)

where dotnet >nul 2>&1
if %errorLevel% neq 0 (
    echo [คำเตือน] ไม่พบ .NET SDK ในเครื่อง (จำเป็นสำหรับการคอมไพล์ Backend Service)
    echo ดาวน์โหลดได้ที่: https://dotnet.microsoft.com/download/dotnet/8.0
)

echo.
echo [2/5] ตั้งค่าตัวแปรสภาพแวดล้อม (Environment Configuration)...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [OK] คัดลอก .env.example เป็น .env เรียบร้อยแล้ว
    )
)

echo.
echo [3/5] ติดตั้งไลบรารี Frontend (npm install)...
call npm install
if %errorLevel% neq 0 (
    echo [ผิดพลาด] npm install ล้มเหลว
    pause
    exit /b 1
)

echo.
echo [4/5] คอมไพล์ Web Frontend สำหรับ Production (npm run build)...
call npm run build
if %errorLevel% neq 0 (
    echo [ผิดพลาด] npm run build ล้มเหลว
    pause
    exit /b 1
)

echo.
echo [5/5] ตรวจสอบไฟล์ DLL เครื่องสแกน (FK623Attend.dll)...
if exist "FK623Attend.dll" (
    echo [OK] พบไฟล์ FK623Attend.dll ในโฟลเดอร์หลัก
    if not exist "backend\SamchukAttendance.Api\FK623Attend.dll" (
        copy "FK623Attend.dll" "backend\SamchukAttendance.Api\" >nul
    )
) else (
    echo [แจ้งเตือน] ยังไม่พบไฟล์ FK623Attend.dll
    echo กรุณาแตก zip SDK แล้วนำ FK623Attend.dll มาวางที่โฟลเดอร์นี้
)

echo.
echo =========================================================================
echo    ติดตั้งส่วนประกอบหลักเรียบร้อยแล้ว! (Sam_Att v2.2.3)
echo =========================================================================
echo ข้อมูลระบบและการเข้าใช้งาน:
echo - โฟลเดอร์ที่เก็บระบบ: Sam_Att
echo - Web Frontend:      https://10.2.0.13:3001/Sam_Att/
echo - Backend API:       https://10.2.0.13:3002 (API รับ-ส่งข้อมูล)
echo.
echo ขั้นตอนต่อไป:
echo 1. นำเข้าฐานข้อมูล:   setup-database.bat
echo 2. ตรวจสอบการตั้งค่า: backend\SamchukAttendance.Api\appsettings.json
echo 3. เริ่มต้นรันระบบ:   start-hospital.bat
echo    (หรือรันแยก: Web=npm run serve:hospital / API=dotnet run ใน backend)
echo.
pause
