@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo =========================================================================
echo    โรงพยาบาลสามชุก - คอมไพล์ Sam_Att สำหรับ IIS (พอร์ต 3001)
echo =========================================================================
echo [ไดเรกทอรี]: %CD%
echo.

:: 0. ตรวจสอบและกู้คืนไฟล์ Source Template (index.html) ป้องกันปัญหาไฟล์คอมไพล์แล้วมาทับโค้ดต้นฉบับ
echo [1/4] กำลังตรวจสอบความถูกต้องของไฟล์ Source Template (index.html)...

set NEED_RECOVER=0

:: ตรวจสอบว่า index.html ปัจจุบันมี src/main.tsx หรือไม่
findstr /C:"src/main.tsx" "index.html" >nul 2>&1
if %errorLevel% neq 0 set NEED_RECOVER=1

:: ตรวจสอบว่า index.src.html (ถ้ามี) เสียหายหรือถูกทับด้วยไฟล์คอมไพล์หรือไม่
if exist "index.src.html" (
    findstr /C:"src/main.tsx" "index.src.html" >nul 2>&1
    if !errorLevel! neq 0 (
        echo       [ตรวจพบ] index.src.html เดิมเสียหาย ^(ถูกเขียนทับด้วยไฟล์คอมไพล์^)
        del /f /q "index.src.html" >nul 2>&1
        set NEED_RECOVER=1
    )
) else (
    set NEED_RECOVER=1
)

if "!NEED_RECOVER!"=="1" (
    echo       [กำลังกู้คืน] ทำการรีเซ็ต index.html เป็น Source Template ต้นฉบับ...
    
    :: ลองกู้คืนผ่าน git ก่อนถ้าทำได้
    where git >nul 2>&1
    if !errorLevel! equ 0 (
        git checkout HEAD -- index.html index.src.html >nul 2>&1
    )
    
    :: ตรวจสอบอีกครั้ง หากยังไม่มี src/main.tsx ให้เขียนไฟล์ HTML ต้นฉบับที่สมบูรณ์ทันที
    findstr /C:"src/main.tsx" "index.html" >nul 2>&1
    if !errorLevel! neq 0 (
        (
            echo ^<!doctype html^>
            echo ^<html lang="th"^>
            echo   ^<head^>
            echo     ^<meta charset="UTF-8" /^>
            echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^>
            echo     ^<title^>ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก^</title^>
            echo     ^<meta name="description" content="ระบบจัดการเวลาปฏิบัติงานและเครื่องสแกนนิ้ว โรงพยาบาลสามชุก (Samchuk Hospital Fingerprint & Attendance Web Application v2)" /^>
            echo     ^<link rel="preconnect" href="https://fonts.googleapis.com"^>
            echo     ^<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin^>
            echo     ^<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"^>
            echo   ^</head^>
            echo   ^<body class="bg-slate-50 text-slate-800 antialiased font-sans"^>
            echo     ^<div id="root"^>^</div^>
            echo     ^<script type="module" src="/src/main.tsx"^>^</script^>
            echo   ^</body^>
            echo ^</html^>
        ) > "index.html"
    )
    copy /Y "index.html" "index.src.html" >nul 2>&1
    echo       [OK] กู้คืนไฟล์ Source Template สำเร็จเรียบร้อย
) else (
    copy /Y "index.src.html" "index.html" >nul 2>&1
    echo       [OK] Source Template ถูกต้องสมบูรณ์
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

:: ตั้งค่า IIS อัตโนมัติ: เปิด ARR Proxy, ปลดล็อก WebDAV เพื่อป้องกัน HTTP 405 Method Not Allowed
if exist "%windir%\system32\inetsrv\appcmd.exe" (
    "%windir%\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /commit:apphost >nul 2>&1
    "%windir%\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/modules >nul 2>&1
    "%windir%\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/handlers >nul 2>&1
    "%windir%\system32\inetsrv\appcmd.exe" set config "Default Web Site/Sam_Att" -section:system.webServer/webdav/authoring /enabled:"False" /commit:apphost >nul 2>&1
    echo       [OK] ตั้งค่า IIS Reverse Proxy และปลดล็อก WebDAV สำเร็จ
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
