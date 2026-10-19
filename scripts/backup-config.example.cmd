@echo off
rem Copy this file to scripts\backup-config.cmd and edit the two paths.
rem scripts\backup-config.cmd is git-ignored on purpose.
rem
rem DATA_DIR  : absolute path that holds db\, objects\, logs\
rem BACKUP_DIR: absolute path on a SEPARATE PHYSICAL DISK (see docs/BACKUP.md)

set "DATA_DIR=C:\PKH-data"
set "BACKUP_DIR=E:\PKH-backups"
