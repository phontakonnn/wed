import io

p = 'docs/ACCEPTANCE.md'
s = io.open(p, encoding='utf-8').read()

rows = {
    'BK-08': (
        "| BK-08 | Backup directory on a **separate physical disk** | **PASS (2026-10-21)** | "
        "External USB disk attached and mounted as `D:` — Disk 1, `VendorC ProductCode USB Device`, "
        "serial `FC176ECD04B37`, removable media, 31.4 GB. `DATA_DIR` (staging) is on `C:` = Disk 0, "
        "`KINGSTON SNV2S1000G`, internal SCSI. `npm run backup:preflight` now reports "
        "`DATA_DIR disk: C: -> Disk 0 (windows-cim)`, `BACKUP_DIR disk: D: -> Disk 1 (windows-cim)` "
        "and `Disk evidence: DIFFERENT PHYSICAL DISKS`. Evidence: "
        "`.tmp-acceptance-20261020/bk-evidence/bk08-preflight.txt` and `bk08-disk-inventory.txt`. "
        "Caveat: `D:` is FAT32, so it carries no NTFS ACLs — fine for this drill, but a production "
        "backup disk should be NTFS/exFAT plus BitLocker or equivalent. Fix required to get here: the "
        "probe script embedded double quotes, which Node's `-Command` argument passing strips, so the "
        "CIM fallback always failed to parse and every real Windows probe returned UNKNOWN; "
        "`backup-disk.ts` now uses single quotes and the typed `DeviceID` property, guarded by a "
        "regression test |"
    ),
    'BK-09': (
        "| BK-09 | Scheduled daily backup running unattended | "
        "**PARTIAL — 1 of 3 consecutive days (2026-10-21)** | Task `PKH Backup` registered with "
        "`scripts/register-backup-task.ps1` (S4U was denied without elevation, so it fell back to "
        "Interactive logon), action `cmd.exe /c scripts\\backup-daily.cmd`, daily at 02:00, "
        "`BACKUP_DIR=D:\\PKH-Backups-Acceptance`. One real triggered run: `LastTaskResult=0` at "
        "01:23:23, log ends `backup end rc=0` with `Encryption: required, key configured` and "
        "`verified: yes`, new backup `knowledge-20261020T182343834Z-4a860cfa.sqlite3`, and "
        "`backup:list` shows three manifests ok. Evidence: `bk09-scheduled-task.txt`, "
        "`bk09-backup-list.log`, `pkh-task-export.xml`. Still required: two more consecutive "
        "unattended runs (2026-10-22 and 2026-10-23) with exit code 0 and a verified backup each. "
        "The task currently points at the staging `DATA_DIR`; re-register it against the real data "
        "directory before production use |"
    ),
    'BK-10': (
        "| BK-10 | Restore drill with a real backup into an isolated recovery target | "
        "**PASS (2026-10-21)** | Drill ran with `DATA_DIR` = "
        "`C:\\...\\.tmp-acceptance-20261020\\bk-recovery` (asserted absolute and different from the "
        "staging source) and a snapshot on the external disk. Restore #1 into the empty target: "
        "schema `[1..12]`, 1 note / 1 vault / 1 library / 1 file / 2 `entity_files` links, object "
        "SHA-256 `c9227e82...fed3bc` matched, `storage:check` = clean. The single object was then "
        "deleted to simulate loss: `storage:check` reported `Missing objects: 1`. Restore #2 brought "
        "the object back (SHA-256 identical, `storage:check` clean) and created a safety copy. The "
        "safety copy of the damaged pre-restore state fails verification (`references 1 file(s) but "
        "the backup has no object snapshot`) — the limitation already recorded in this row; a third "
        "restore from a clean state produced a safety copy that verifies (`e605432c...f8a006`). "
        "Evidence: `bk10-restore-drill.txt`, `bk10-restore-1.log`, `bk10-restore-2.log`, "
        "`bk10-storage-check-1.log`, `bk10-storage-check-2.log`, `bk10-restored-state*.json` |"
    ),
    'BK-11b': (
        "| BK-11b | Encryption **operations** (key storage, escrow, rotation, encrypted target) | "
        "**PARTIAL — escrow copy outstanding (2026-10-21)** | Two 32-byte keys generated with a "
        "CSPRNG and stored in **User** scope (`BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY_ID`, "
        "`BACKUP_ENCRYPTION_REQUIRED=true`); no key value was printed, logged or written to "
        "evidence — only `keyId`, length 44 and a SHA-256 prefix (`k1=35e20eb8`, `k2=bc454552`). "
        "Backup #1 (`keyId=k1`) and backup #2 (`keyId=k2`) both verify under the rotated ring "
        "(`BACKUP_ENCRYPTION_KEY_RING` holds `k1`), each `objects: AES-256-GCM`. Leak scan over 33 "
        "files (evidence, every file on the backup disk, `backup.log`, `backup-config.cmd`): 0 "
        "occurrences of either key. Evidence: `bk11b-rotation.txt`, `bk11b-backup-1.log`, "
        "`bk11b-backup-2.log`, `bk11b-verify-1.log`. Outstanding: an offline escrow copy of the key "
        "outside `BACKUP_DIR` — an owner decision, since writing a second copy of the secret was "
        "deliberately not done unasked |"
    ),
}

lines = s.split('\n')
out = []
for line in lines:
    replaced = False
    for gate, new in rows.items():
        if line.startswith('| ' + gate + ' |'):
            out.append(new)
            replaced = True
            break
    if not replaced:
        out.append(line)
s = '\n'.join(out)

s = s.replace(
    "| BK-08 | | | |\n| BK-09 | | | |\n| BK-10 | | | |\n| BK-11b | | | |",
    "| BK-08 | 2026-10-21 | **PASS** — `C:` Disk 0 vs `D:` Disk 1, `DIFFERENT PHYSICAL DISKS` | "
    "`.tmp-acceptance-20261020/bk-evidence/bk08-preflight.txt`, `bk08-disk-inventory.txt` |\n"
    "| BK-09 | 2026-10-21 | **PARTIAL** — registered + 1 triggered run, `LastTaskResult=0`, verified "
    "backup; 2 more days needed | `bk09-scheduled-task.txt`, `bk09-backup-list.log`, "
    "`pkh-task-export.xml` |\n"
    "| BK-10 | 2026-10-21 | **PASS** — isolated recovery target, object loss + restore, SHA-256 "
    "match, `storage:check` clean | `bk10-restore-drill.txt`, `bk10-restore-1.log`, "
    "`bk10-restore-2.log`, `bk10-restored-state*.json` |\n"
    "| BK-11b | 2026-10-21 | **PARTIAL** — key store, rotation and encrypted target proven; offline "
    "escrow copy outstanding | `bk11b-rotation.txt`, `bk11b-backup-1.log`, `bk11b-backup-2.log` |",
)

s = s.replace(
    "| Backup/restore | — | — | FAIL — BK-08..11 open |",
    "| Backup/restore | — | 2026-10-21 | PARTIAL — BK-08 PASS, BK-10 PASS, BK-09 1/3 days, BK-11b escrow outstanding |",
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ACCEPTANCE updated')
