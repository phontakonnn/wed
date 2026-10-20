@echo off
rem ---------------------------------------------------------------------------
rem Daily backup wrapper for Windows Task Scheduler.
rem
rem Paths are NOT hard-coded here. They come from scripts\backup-config.cmd,
rem which is untracked (see backup-config.example.cmd). That keeps machine
rem specific paths out of Git.
rem
rem The wrapper never holds an encryption key. If BACKUP_ENCRYPTION_REQUIRED=true,
rem the key must already be visible to the account that runs the task.
rem
rem Exit codes:
rem   0  backup created and verified
rem   1  backup or verification failed (see %DATA_DIR%\logs\backup.log)
rem   2  configuration missing
rem   3  another run holds the lock
rem   4  preflight failed (same directory, no space, missing key)
rem ---------------------------------------------------------------------------
setlocal EnableExtensions EnableDelayedExpansion

if exist "%~dp0backup-config.cmd" call "%~dp0backup-config.cmd"

if not defined DATA_DIR (
  echo [%DATE% %TIME%] ERROR: DATA_DIR is not set. Create scripts\backup-config.cmd 1>&2
  exit /b 2
)
if not defined BACKUP_DIR set "BACKUP_DIR=%DATA_DIR%\backups"

set "LOG_DIR=%DATA_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "LOG_FILE=%LOG_DIR%\backup.log"

rem Rotate the log once it passes 5 MiB so it cannot grow without bound.
if exist "%LOG_FILE%" (
  for %%A in ("%LOG_FILE%") do set "LOG_SIZE=%%~zA"
  if !LOG_SIZE! GTR 5242880 (
    if exist "%LOG_FILE%.1" del /q "%LOG_FILE%.1" >nul 2>&1
    move /y "%LOG_FILE%" "%LOG_FILE%.1" >nul 2>&1
  )
)

rem Single-instance lock. Task Scheduler already uses IgnoreNew, but a manual
rem run can overlap the scheduled one. A stale lock after a crash must be
rem removed by an operator only after confirming no backup is running.
set "LOCK_DIR=%LOG_DIR%\backup.lock"
2>nul mkdir "%LOCK_DIR%"
if errorlevel 1 (
  echo [%DATE% %TIME%] ERROR: another backup appears to be running ^(lock: %LOCK_DIR%^). >> "%LOG_FILE%"
  echo Another backup appears to be running. Lock: %LOCK_DIR% 1>&2
  exit /b 3
)

set "KEEP_ARG="
if defined BACKUP_KEEP set "KEEP_ARG=--keep %BACKUP_KEEP%"

echo [%DATE% %TIME%] backup start >> "%LOG_FILE%"
pushd "%~dp0.."

call npm run backup:preflight >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo [%DATE% %TIME%] ERROR: preflight failed; no backup was written >> "%LOG_FILE%"
  set "RC=4"
) else (
  call npm run backup:create -- %KEEP_ARG% --verify >> "%LOG_FILE%" 2>&1
  set "RC=!ERRORLEVEL!"
)

popd
rmdir "%LOCK_DIR%" >nul 2>&1
echo [%DATE% %TIME%] backup end rc=!RC! >> "%LOG_FILE%"

exit /b !RC!
