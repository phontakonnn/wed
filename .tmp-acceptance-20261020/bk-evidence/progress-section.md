## Backup gates BK-08 / BK-09 / BK-10 / BK-11b — drill on an external disk (2026-10-21)

External USB disk (`D:`, Disk 1, `VendorC ProductCode USB Device`, serial `FC176ECD04B37`,
removable, 31.4 GB) was attached. Everything below ran against **staging** paths only:
`DATA_DIR=C:\...\.tmp-acceptance-20261020\bk-data` and
`BACKUP_DIR=D:\PKH-Backups-Acceptance`. No live data directory exists or was touched.

### Bug found and fixed first: the disk probe could never work on Windows

`backup-disk.ts` built its PowerShell one-liner with double quotes (`$src = "cim"`,
`Write-Output ($src + ":" + $n)`). Node passes that as a single `-Command` argument and PowerShell
re-parses it, stripping the inner quotes, so the script arrived as `($src + : + $n)` and failed to
parse. Every branch fell through to `unavailable`, which is why all earlier sessions recorded
`UNKNOWN` even on a normal machine. The script now uses single quotes only and compares
`$_.Dependent.DeviceID -eq ($letter + ':')` instead of a quoted regex. A regression test asserts the
generated script contains no double quote. After the fix the probe returns
`C: -> Disk 0 (windows-cim)` and `D: -> Disk 1 (windows-cim)`.

### BK-08 — separate physical disk: PASS

`npm run backup:preflight` reports `Disk evidence: DIFFERENT PHYSICAL DISKS`, Disk 0
(KINGSTON SNV2S1000G, internal SCSI) versus Disk 1 (USB removable). Physical inventory captured
alongside. Caveat recorded: `D:` is FAT32, so it has no NTFS ACLs; a production backup disk should be
NTFS/exFAT with BitLocker or equivalent.

### BK-11b — key store, rotation, encrypted target: PARTIAL (escrow outstanding)

- Two 32-byte CSPRNG keys in **User** scope; only `keyId`, length and a SHA-256 prefix were ever
  printed (`k1=35e20eb8`, `k2=bc454552`). No key value appears in any log or evidence file.
- Backup #1 (`keyId=k1`) → verify OK. Rotation: `k2` becomes active, `k1` moves into
  `BACKUP_ENCRYPTION_KEY_RING`. Backup #2 (`keyId=k2`) → verify OK.
- Both snapshots verify **after** rotation, proving the ring decrypts the old key id.
- Leak scan across 33 files (evidence folder, every file on the backup disk, `backup.log`,
  `backup-config.cmd`): 0 occurrences of either key.
- Outstanding: an offline escrow copy of the key outside `BACKUP_DIR`. That is an owner decision
  (where the second copy lives); creating it unasked would duplicate the secret.

### BK-10 — restore drill into an isolated recovery target: PASS

Recovery target `C:\...\.tmp-acceptance-20261020\bk-recovery`, asserted absolute and different from
the staging source. Restore #1 into the empty target produced schema `[1..12]` with 1 note, 1 vault,
1 library, 1 file, 2 links, and an object whose SHA-256 matched; `storage:check` clean. The single
object was then deleted (simulating loss) → `storage:check` reported `Missing objects: 1`. Restore #2
brought it back with an identical SHA-256, `storage:check` clean, and wrote a safety copy. The safety
copy of the damaged state fails verification (documented limitation); a third restore from a clean
state produced a safety copy that verifies (`e605432c…`).

### BK-09 — scheduled task: PARTIAL, 1 of 3 consecutive days

`scripts/register-backup-task.ps1` registered `PKH Backup` (S4U denied without elevation → Interactive
fallback), action `cmd.exe /c scripts\backup-daily.cmd`, daily 02:00, destination
`D:\PKH-Backups-Acceptance`. One triggered run: `LastTaskResult=0`, log `backup end rc=0`,
`Encryption: required, key configured`, `verified: yes`, new backup, and `backup:list` shows three
manifests ok. Task XML exported.

**Remaining for BK-09:** two more consecutive unattended runs (2026-10-22, 2026-10-23) with exit
code 0 and a verified backup each. Check with:

```powershell
Get-ScheduledTaskInfo -TaskName 'PKH Backup'      # LastTaskResult must be 0
Get-Content '<staging DATA_DIR>\logs\backup.log' -Tail 20
```

### System changes made (owner asked for these)

- User-scope environment variables: `BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY_ID=k2`,
  `BACKUP_ENCRYPTION_KEY_RING={"k1":…}`, `BACKUP_ENCRYPTION_REQUIRED=true`.
- Scheduled task `PKH Backup` (Interactive logon, daily 02:00) pointing at the **staging** data
  directory. Re-register it against the real data directory before production use.
- `scripts/backup-config.cmd` written by the script (git-ignored, paths only, no key).
- Scripts were run with `-ExecutionPolicy Bypass` for that process only; no policy was changed.

### Evidence

`.tmp-acceptance-20261020/bk-evidence/`: `bk08-preflight.txt`, `bk08-disk-inventory.txt`,
`bk11b-rotation.txt`, `bk11b-backup-1.log`, `bk11b-backup-2.log`, `bk11b-verify-1.log`,
`bk10-restore-drill.txt`, `bk10-restore-1.log`, `bk10-restore-2.log`, `bk10-storage-check-1.log`,
`bk10-storage-check-2.log`, `bk10-restored-state.json`, `bk10-restored-state-after.json`,
`bk09-scheduled-task.txt`, `bk09-backup-list.log`, `bk09-register.log`, `pkh-task-export.xml`,
`drill-seed.json`, `seed-drill.mjs`, `inspect-restored.mjs`, `probe-disks.mts`.

### Gates

- `npm test` **21 files / 244 tests** (one new regression test), `npm run lint`, `npm run build:server`,
  `npm run build:web`, `git diff --check` — all clean.
- BK-08 PASS, BK-10 PASS, BK-09 PARTIAL (1/3 days), BK-11b PARTIAL (escrow outstanding).
- No commit, push or deploy. `.tmp-acceptance-20261020/` evidence is untracked and was not deleted.
