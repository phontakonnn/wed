@echo off
rem ---------------------------------------------------------------------------
rem Daily backup wrapper for Windows Task Scheduler.
rem
rem Paths are NOT hard-coded here. They come from scripts\backup-config.cmd,
rem which is untracked (see backup-config.example.cmd). That keeps machine
rem specific paths out of Git.
rem
rem Exit codes:
rem   0  backup created and verified
rem   1  backup failed (see %DATA_DIR%\logs\backup.log)
rem   2  configuration missing
rem ---------------------------------------------------------------------------
setlocal EnableExtensions

if exist "%~dp0backup-config.cmd" call "%~dp0backup-config.cmd"

if not defined DATA_DIR (
  echo [%DATE% %TIME%] ERROR: DATA_DIR is not set. Create scripts\backup-config.cmd 1>&2
  exit /b 2
)
if not defined BACKUP_DIR set "BACKUP_DIR=%DATA_DIR%\backups"

set "LOG_DIR=%DATA_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "LOG_FILE=%LOG_DIR%\backup.log"

echo [%DATE% %TIME%] backup start >> "%LOG_FILE%"
pushd "%~dp0.."
call npm run backup:create >> "%LOG_FILE%" 2>&1
set "RC=%ERRORLEVEL%"
popd
echo [%DATE% %TIME%] backup end rc=%RC% >> "%LOG_FILE%"

exit /b %RC%
