@echo off
rem Copy this file to scripts\backup-config.cmd and edit the paths.
rem scripts\backup-config.cmd is git-ignored on purpose.
rem
rem DATA_DIR  : absolute path that holds db\, objects\, logs\
rem BACKUP_DIR: absolute path on a SEPARATE PHYSICAL DISK (see docs/BACKUP.md).
rem             A different drive letter is NOT proof of a different physical disk.
rem BACKUP_KEEP: optional number of backups to retain (default 7 in the tool).
rem
rem Do NOT put BACKUP_ENCRYPTION_KEY in this file. Set it as a protected
rem environment variable for the account that runs the task, and set
rem BACKUP_ENCRYPTION_REQUIRED=true there as well. The wrapper never reads,
rem prints, or logs the key.

set "DATA_DIR=C:\PKH-data"
set "BACKUP_DIR=E:\PKH-backups"
rem set "BACKUP_KEEP=7"
