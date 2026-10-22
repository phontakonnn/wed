@echo off
chcp 65001 >nul
title PKH - Personal Knowledge Hub

echo ====================================================================
echo         PKH - Personal Knowledge Hub (Production Startup)
echo ====================================================================
echo.

:: 1. ตั้งค่าสภาพแวดล้อมระบบ
set "NODE_ENV=production"
set "PORT=3001"
set "HOST=127.0.0.1"
set "EXPECTED_ORIGIN=http://127.0.0.1:3001"

:: ใช้โฟลเดอร์ data ในโปรเจกต์เป็นพื้นที่เก็บฐานข้อมูลและไฟล์หลัก
if "%DATA_DIR%"=="" set "DATA_DIR=%~dp0data"

echo [*] โฟลเดอร์เก็บข้อมูล (DATA_DIR): %DATA_DIR%
if not exist "%DATA_DIR%" (
    mkdir "%DATA_DIR%"
    echo [*] สร้างโฟลเดอร์จัดเก็บข้อมูลใหม่เรียบร้อยแล้ว
)

:: 2. ตรวจสอบการ Build หากยังไม่มีไฟล์คอมไพล์
if not exist "%~dp0apps\web\dist\index.html" (
    echo [*] กำลัง Build หน้าเว็บ Frontend (Web)...
    cmd /c "npm --prefix apps\web run build"
)

if not exist "%~dp0apps\server\dist\index.js" (
    echo [*] กำลัง Build ระบบหลังบ้าน Backend (Server)...
    cmd /c "npm --prefix apps\server run build"
)

:: 3. เปิดหน้าเว็บบนเบราว์เซอร์อัตโนมัติ
echo [*] กำลังเปิดหน้าเว็บ PKH ที่ http://127.0.0.1:%PORT% ...
start "" "http://127.0.0.1:%PORT%"

:: 4. สตาร์ทเซิร์ฟเวอร์ Fastify Production (เร็วและเสถียร ไม่กิน RAM)
echo.
echo ====================================================================
echo   เซิร์ฟเวอร์ PKH กำลังทำงานที่: http://127.0.0.1:%PORT%
echo   (สามารถปิดหน้าต่างนี้หรือกด Ctrl + C เมื่อต้องการหยุดทำงาน)
echo ====================================================================
echo.

node "%~dp0apps\server\dist\index.js"

pause
