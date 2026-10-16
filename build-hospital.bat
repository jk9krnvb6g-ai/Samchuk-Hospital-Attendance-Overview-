@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - คอมไพล์ Sam_Att สำหรับ IIS (พอร์ต 3001)
echo =========================================================================
echo [ไดเรกทอรี]: %CD%
echo.

:: 0. กู้คืนไฟล์ index.html จาก index.src.html ก่อนเสมอ เพื่อป้องกัน Vite สับสนกับไฟล์ที่คอมไพล์แล้ว
echo [1/4] กำลังตรวจสอบความถูกต้องของไฟล์ Source Template...
if exist "index.src.html" (
    copy /Y "index.src.html" "index.html" >nul
    echo       [OK] คืนค่า index.html สู่สถานะ Source โค้ดเรียบร้อย
) else (
    echo       [INFO] สร้าง index.src.html จาก index.html ต้นฉบับ
    copy /Y "index.html" "index.src.html" >nul
)

:: 1. ตรวจสอบและติดตั้ง node_modules
echo [2/4] กำลังตรวจสอบ Dependencies...
if not exist "node_modules" (
    echo       กำลังติดตั้ง Dependencies ผ่าน npm...
    call npm install --legacy-peer-deps
) else (
    echo       [OK] node_modules พร้อมใช้งาน
)

:: 2. คอมไพล์โปรเจกต์ด้วย Vite Build
echo [3/4] กำลังคอมไพล์โปรเจกต์ (Vite Build สู่ dist/)...
call npm run build
if %errorLevel% neq 0 (
    echo.
    echo [ข้อผิดพลาด] คอมไพล์ไม่สำเร็จ! กรุณาตรวจสอบข้อความ Error ด้านบน
    echo หากมีปัญหาไฟล์ Git ค้าง ให้พิมพ์:
    echo   git checkout -- index.html
    echo   git pull
    echo.
    pause
    exit /b 1
)
echo       [OK] Vite Build สำเร็จเรียบร้อย!

:: 3. เตรียมไฟล์สำหรับ IIS ในโฟลเดอร์ C:\inetpub\wwwroot\Sam_Att
echo [4/4] กำลังติดตั้งไฟล์ลง IIS (https://10.2.0.13:3001/Sam_Att/)...
if exist "dist\assets" (
    if not exist "assets" mkdir "assets"
    xcopy /Y /E /I "dist\assets" "assets" >nul
    echo       [OK] คัดลอก assets ไปยังโฟลเดอร์รันไทม์เรียบร้อย
)
if exist "dist\index.html" (
    copy /Y "dist\index.html" "index.html" >nul
    echo       [OK] คัดลอก production index.html สำหรับ IIS เรียบร้อย
)
if exist "public\web.config" (
    copy /Y "public\web.config" "web.config" >nul
    echo       [OK] อัปเดต web.config เรียบร้อย
)

echo.
echo =========================================================================
echo  [สำเร็จ 100%%] คอมไพล์และติดตั้งไฟล์สำหรับ IIS เรียบร้อยแล้ว!
echo =========================================================================
echo  ท่านสามารถเปิดใช้งานได้ทันทีที่:
echo    https://10.2.0.13:3001/Sam_Att/
echo.
echo  (ทำงานร่วมกับ Procurement และ Cash_Cheque บนพอร์ต 3001 ได้ทันที)
echo =========================================================================
echo.
pause
