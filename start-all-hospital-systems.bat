@echo off
setlocal enabledelayedexpansion
title Master Hospital Services Launcher (:3002 Gateway)
cd /d "%~dp0"
chcp 65001 >nul
cls

echo =========================================================================
echo    โรงพยาบาลสามชุก - ตัวเปิดระบบรวมศูนย์ (Master System Launcher)
echo    * เปิดจุดเชื่อมต่อพอร์ต 3002 พอร์ตเดียว รองรับทั้ง 3 ระบบ:
echo      1. ระบบลงเวลา:     http://localhost:3002/api/Sam_Att/
echo      2. ระบบจัดซื้อ:       http://localhost:3002/api/procurement/
echo      3. ระบบเงินสดและเช็ค: http://localhost:3002/api/Cash_Cheque/
echo =========================================================================
echo.

:: 1. สตาร์ท Central Gateway บนพอร์ต 3002 (ระบบลงเวลา + Router)
echo [1/3] กำลังสตาร์ท Central API Gateway บนพอร์ต 3002...
start "Samchuk Central API Gateway (:3002)" cmd /k "cd /d "%~dp0" && set API_PORT=3002 && node backend\server.cjs"

:: 2. สตาร์ท Procurement Backend บน Internal Port 3003 (หากมีโฟลเดอร์)
echo [2/3] กำลังตรวจสอบระบบจัดซื้อ Procurement...
if exist "..\Procurement\server" (
    start "Procurement Backend (:3003)" cmd /k "cd /d "%~dp0\..\Procurement\server" && set PORT=3003 && npm start"
    echo       [OK] สตาร์ท Procurement สำเร็จ
) else if exist "..\Procurement" (
    start "Procurement Backend (:3003)" cmd /k "cd /d "%~dp0\..\Procurement" && set PORT=3003 && npm start"
    echo       [OK] สตาร์ท Procurement สำเร็จ
) else (
    echo       [แจ้งเตือน] ไม่พบโฟลเดอร์ Procurement ในตำแหน่งเริ่มต้น 
    echo                 (หากต้องการเปิด ให้ใช้ start-procurement-for-gateway.bat ได้เลย)
)

:: 3. สตาร์ท Cash & Cheque Backend บน Internal Port 3004 (หากมีโฟลเดอร์)
echo [3/3] กำลังตรวจสอบระบบเงินสดและเช็ค Cash_Cheque...
if exist "..\Cash_Cheque\server" (
    start "Cash & Cheque Backend (:3004)" cmd /k "cd /d "%~dp0\..\Cash_Cheque\server" && set PORT=3004 && npm start"
    echo       [OK] สตาร์ท Cash & Cheque สำเร็จ
) else if exist "..\Cash_Cheque" (
    start "Cash & Cheque Backend (:3004)" cmd /k "cd /d "%~dp0\..\Cash_Cheque" && set PORT=3004 && npm start"
    echo       [OK] สตาร์ท Cash & Cheque สำเร็จ
) else (
    echo       [แจ้งเตือน] ไม่พบโฟลเดอร์ Cash_Cheque ในตำแหน่งเริ่มต้น
)

echo.
echo =========================================================================
echo  [พร้อมใช้งานแล้ว]:
echo  ผู้ใช้งานและเครื่องลูกข่ายภายนอก เข้าถึงผ่านพอร์ต 3002 พอร์ตเดียว:
echo    - http://10.2.0.13:3002/api/Sam_Att/
echo    - http://10.2.0.13:3002/api/procurement/
echo    - http://10.2.0.13:3002/api/Cash_Cheque/
echo.
echo  IIS Web Frontend:
echo    - http://10.2.0.13:3001/Sam_Att/
echo    - http://10.2.0.13/Procurement/
echo =========================================================================
pause
