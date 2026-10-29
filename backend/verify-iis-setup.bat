@echo off
chcp 65001 >nul
echo ======================================================================
echo    เครื่องมือตรวจสอบและเปิดใช้งาน IIS Reverse Proxy (Sam_Att พอร์ต 3001 -^> 3002)
echo ======================================================================
echo.

echo [1/4] ตรวจสอบสถานะ Backend Service บนพอร์ต 3002...
netstat -ano | findstr :3002 >nul
if %errorlevel% equ 0 (
    echo   [PASS] มี Service กำลังทำงานบนพอร์ต 3002 เรียบร้อยแล้ว
) else (
    echo   [WARN] ไม่พบ Service บนพอร์ต 3002!
    echo          กรุณารันคำสั่ง: node backend/server.cjs
    echo          หรือเริ่มการทำงานของ Windows Service / PM2
)
echo.

echo [2/4] เปิดใช้งาน ARR Server Proxy บน IIS (แก้ปัญหา HTTP 404 ของ Reverse Proxy)...
if exist "%windir%\system32\inetsrv\appcmd.exe" (
    "%windir%\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /commit:apphost >nul 2>&1
    if %errorlevel% equ 0 (
        echo   [PASS] เปิดใช้งาน ARR Proxy สำเร็จแล้ว (proxy enabled="True")
    ) else (
        echo   [INFO] ไม่สามารถตั้งค่าอัตโนมัติได้ อาจต้อง Run as Administrator หรือ ARR ยังไม่ได้ติดตั้ง
    )
) else (
    echo   [WARN] ไม่พบ appcmd.exe กรุณาตรวจสอบว่าติดตั้ง IIS และ ARR แล้วหรือไม่
)
echo.

echo [3/4] ทดสอบเรียกตรงไปยัง Backend พอร์ต 3002 (Health Check)...
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:3002/api/health' -TimeoutSec 3; Write-Host '  [PASS] Backend 3002 ตอบกลับปกติ: ' $res.status } catch { Write-Host '  [FAIL] ไม่สามารถเรียก http://127.0.0.1:3002/api/health ได้: ' $_.Exception.Message }"
echo.

echo [4/4] ทดสอบเรียกผ่าน IIS Reverse Proxy (https://127.0.0.1:3001/Sam_Att/api/shifts)...
powershell -NoProfile -Command "[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; try { $res = Invoke-RestMethod -Uri 'https://127.0.0.1:3001/Sam_Att/api/shifts' -TimeoutSec 3; Write-Host '  [PASS] IIS Proxy ส่งต่อสำเร็จ ได้รับข้อมูล: ' $res.data.Count ' กะ' } catch { Write-Host '  [INFO] ผลลัพธ์: ' $_.Exception.Message }"
echo.

echo ======================================================================
echo การตรวจสอบเสร็จสิ้น กดปุ่มใดก็ได้เพื่อปิดหน้าต่าง
pause >nul
