@echo off
setlocal EnableDelayedExpansion

:: PKH / Life OS — Production start script for Windows
:: Usage: scripts\start-production.cmd
::
:: Override any variable before calling, e.g.:
::   set DATA_DIR=D:\PKH_Data
::   set PORT=3001
::   set EXPECTED_ORIGIN=http://100.x.x.x:3001
::   scripts\start-production.cmd

if not defined NODE_ENV set NODE_ENV=production
if not defined HOST set HOST=0.0.0.0
if not defined PORT set PORT=3001
if not defined DATA_DIR set DATA_DIR=C:\PKH_Data

:: Ensure the data directory exists
if not exist "%DATA_DIR%" (
  echo [INFO] Creating DATA_DIR: %DATA_DIR%
  mkdir "%DATA_DIR%"
)

:: Ensure the log directory exists
if not exist "logs" mkdir logs

:: Optional: verify the server build is present
if not exist "apps\server\dist\index.js" (
  echo [ERROR] Server build not found. Run: npm run build:server
  exit /b 1
)

echo [INFO] Starting Life OS server...
echo [INFO]   NODE_ENV = %NODE_ENV%
echo [INFO]   HOST     = %HOST%
echo [INFO]   PORT     = %PORT%
echo [INFO]   DATA_DIR = %DATA_DIR%
if defined EXPECTED_ORIGIN echo [INFO]   EXPECTED_ORIGIN = %EXPECTED_ORIGIN%
if defined BACKUP_DIR echo [INFO]   BACKUP_DIR = %BACKUP_DIR%

node apps\server\dist\index.js
