@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Development Mode พอร์ต 3001)
echo =========================================================================
echo.
echo กำลังเริ่มต้น Web Frontend (พอร์ต 3001)...
echo เปิดใช้งานได้ที่: http://localhost:3001/Sam_Att/ หรือ http://10.2.0.13:3001/Sam_Att/
echo.
call npm run dev:hospital
pause
