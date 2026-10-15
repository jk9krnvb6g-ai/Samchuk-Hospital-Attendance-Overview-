@echo off
chcp 65001 >nul
echo =========================================================================
echo    โรงพยาบาลสามชุก - รันระบบ Sam_Att (Web :3001 & API :3002)
echo =========================================================================
echo.
echo กำลังเริ่มต้นระบบ...
echo [1/2] เริ่มต้น API Service (พอร์ต 3002): https://10.2.0.13:3002
start "Samchuk Attendance API (:3002)" cmd /k "cd backend\SamchukAttendance.Api && dotnet run --urls=https://0.0.0.0:3002;http://0.0.0.0:3002"

echo [2/2] เริ่มต้น Web Frontend (พอร์ต 3001): https://10.2.0.13:3001/Sam_Att/
start "Samchuk Attendance Web (:3001)" cmd /k "npm run serve:hospital"

echo.
echo =========================================================================
echo ระบบเริ่มต้นทำงานเรียบร้อยแล้ว:
echo - หน้าเว็บ Web Frontend : https://10.2.0.13:3001/Sam_Att/
echo - API Backend Gateway   : https://10.2.0.13:3002
echo =========================================================================
echo.
pause
