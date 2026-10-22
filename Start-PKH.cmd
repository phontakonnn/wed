@echo off
chcp 65001 >nul
title PKH / Life OS - System Launcher
cls

echo ======================================================================
echo           PKH / Life OS - ศูนย์รวมข้อมูลและการจัดการชีวิตส่วนบุคคล
echo ======================================================================
echo.
echo  กำลังเตรียมความพร้อมของระบบ...
echo.

cd /d "%~dp0"

:: 1. ตรวจสอบการ build ของโปรเจกต์
if not exist "apps\server\dist\index.js" (
    echo [INFO] กำลังคอมไพล์ Backend Server...
    call npm --prefix apps/server run build
)

if not exist "apps\web\dist\index.html" (
    echo [INFO] กำลังคอมไพล์ Frontend Web...
    call npm --prefix apps/web run build
)

:: 2. ตรวจสอบพอร์ต 3001
echo [INFO] ตรวจสอบสถานะการเชื่อมต่อพอร์ต 3001...
set PKH_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    set PKH_PID=%%a
)

if defined PKH_PID (
    echo [INFO] พบเซิร์ฟเวอร์กำลังทำงานอยู่ที่ PID %PKH_PID%
) else (
    echo [INFO] เริ่มต้นระบบ Fastify Server บนพอร์ต 3001...
    start "PKH Server Daemon" /min cmd /c "npm run start:server"
    timeout /t 3 /nobreak >nul
)

:: 3. เปิดเว็บเบราว์เซอร์อัตโนมัติ
echo [INFO] เปิดเว็บเบราว์เซอร์ไปที่ http://127.0.0.1:3001 ...
start "" "http://127.0.0.1:3001"

echo.
echo ======================================================================
echo   ระบบพร้อมใช้งานเรียบร้อยแล้ว! (System is Live)
echo ======================================================================
echo.
echo   URL:         http://127.0.0.1:3001
echo   Username:    admin
echo   Password:    Admin@123456
echo.
echo   หมายเหตุ: สามารถเปลี่ยนชื่อผู้ใช้และรหัสผ่านได้ที่เมนู "ตั้งค่าระบบ (Admin)"
echo ======================================================================
echo.
pause
