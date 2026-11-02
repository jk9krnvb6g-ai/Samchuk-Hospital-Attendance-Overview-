@echo off
chcp 65001 >nul
echo ======================================================================
echo    เครื่องมือตรวจสอบและเปิดใช้งาน IIS Reverse Proxy (Sam_Att พอร์ต 3001 -^> 3002)
echo ======================================================================
echo.

echo [1/5] ตรวจสอบโมดูล Application Request Routing (ARR) บนเครื่องเซิร์ฟเวอร์...
if exist "%windir%\system32\inetsrv\requestRouter.dll" (
    echo   [PASS] ติดตั้งโมดูล ARR (requestRouter.dll) เรียบร้อยแล้ว
) else (
    echo   [CRITICAL] ไม่พบโมดูล ARR (requestRouter.dll) ในระบบ!
    echo              สาเหตุของ HTTP 404: IIS ไม่สามารถทำ Reverse Proxy ไปยังพอร์ต 3002 ได้หากไม่มี ARR
    echo              วิธีแก้: กรุณาดาวน์โหลดและติดตั้ง Microsoft Application Request Routing 3.0 (ARR x64)
)
echo.

echo [2/5] ตรวจสอบสถานะ Backend Service บนพอร์ต 3002...
netstat -ano | findstr :3002 >nul
if %errorlevel% equ 0 (
    echo   [PASS] มี Service กำลังทำงานบนพอร์ต 3002 เรียบร้อยแล้ว
) else (
    echo   [WARN] ไม่พบ Service บนพอร์ต 3002!
    echo          กรุณารันคำสั่ง: node backend/server.cjs
    echo          หรือเริ่มการทำงานของ Windows Service / PM2
)
echo.

echo [3/5] เปิดใช้งาน ARR Server Proxy บน IIS...
if exist "%windir%\system32\inetsrv\appcmd.exe" (
    "%windir%\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /commit:apphost >nul 2>&1
    if %errorlevel% equ 0 (
        echo   [PASS] เปิดใช้งาน ARR Proxy สำเร็จแล้ว (proxy enabled="True")
    ) else (
        echo   [INFO] ไม่สามารถตั้งค่าผ่าน appcmd ได้ กรุณาเปิด IIS Manager -^> ARR Cache -^> Server Proxy Settings -^> ติ๊ก Enable proxy
    )
) else (
    echo   [WARN] ไม่พบ appcmd.exe
)
echo.

echo [4/5] รีสตาร์ต IIS เพื่อให้ค่า Proxy มีผลทันที...
iisreset /timeout:5 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [PASS] รีสตาร์ต IIS เรียบร้อยแล้ว
) else (
    echo   [INFO] ข้ามขั้นตอน iisreset (อาจต้องรันสคริปต์นี้ในฐานะ Administrator)
)
echo.

echo [5/5] ทดสอบเรียกตรงไปยัง Backend พอร์ต 3002 และผ่าน IIS 3001...
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:3002/api/health' -TimeoutSec 3; Write-Host '  [PASS] Backend 3002 ตอบกลับปกติ: ' $res.status } catch { Write-Host '  [FAIL] ไม่สามารถเรียก http://127.0.0.1:3002/api/health ได้: ' $_.Exception.Message }"
powershell -NoProfile -Command "[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; try { $res = Invoke-RestMethod -Uri 'https://127.0.0.1:3001/Sam_Att/api/shifts' -TimeoutSec 3; Write-Host '  [PASS] IIS Proxy 3001 ส่งต่อสำเร็จ ได้รับข้อมูลกะ: ' $res.data.Count ' กะ' } catch { Write-Host '  [INFO] ผลการเรียกผ่าน IIS: ' $_.Exception.Message }"
echo.

echo ======================================================================
echo การตรวจสอบเสร็จสิ้น กดปุ่มใดก็ได้เพื่อปิดหน้าต่าง
pause >nul
