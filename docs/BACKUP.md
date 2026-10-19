# Backup and Restore Plan

**Status:** MVP implemented (`apps/server/src/backup.ts`, `apps/server/src/backup-cli.ts`).
**Gate:** remote access and real user data stay blocked until §8 is satisfied.

---

## 1. Why file copy is not a backup

The database runs in WAL mode. Committed transactions may live only in
`knowledge.sqlite3-wal` until a checkpoint occurs. Copying `knowledge.sqlite3` alone with
Explorer, `copy`, or `robocopy` can therefore produce a backup that is **missing recent writes**,
or is internally inconsistent if a write happens mid-copy.

The MVP uses SQLite's **Online Backup API** through `better-sqlite3`:

```ts
await database.backup(destinationPath);
```

This takes a consistent snapshot of the main database **plus** the WAL content, while the server
keeps running. It is the only supported backup method in this project.

---

## 2. Objectives

| Item | Target | Rationale |
| --- | --- | --- |
| RPO — routine | ≤ 24 hours | One scheduled backup per day. |
| RPO — before migration | 0 | A fresh backup is mandatory before every schema change. |
| RTO | ≤ 30 minutes | Restore is a file swap plus verification. |
| Retention | 7 daily backups (configurable) | Bounded disk use; one week of recovery points. |
| Verification | 100% of created backups | A backup that was never verified is not a backup. |

Single-user, local-only system: no HA, no replication, no point-in-time recovery.

---

## 3. Locations

| What | Path | Rule |
| --- | --- | --- |
| Live database | `DATA_DIR/db/knowledge.sqlite3` | Never inside the Git repo. |
| Backup directory | `BACKUP_DIR` (default `DATA_DIR/backups`) | Must be an **absolute** path. |
| Backup file | `BACKUP_DIR/knowledge-<UTC>-<rand>.sqlite3` | `<UTC>` = `YYYYMMDDTHHMMSSmmmZ`. |
| Manifest | same name + `.manifest.json` | Checksum and provenance. |
| Restore safety copy | `DATA_DIR/db/knowledge.sqlite3.pre-restore-<UTC>` + `.manifest.json` | Automatic, never deleted by the tool. |
| In-progress files | `*.partial` | Removed or renamed; ignored by `list`. |

**Disk separation is not yet satisfied.** `BACKUP_DIR` must eventually point to a physically
separate disk. Until that is verified, the backup gate stays open (see §8). Pointing
`BACKUP_DIR` at another folder on `C:` protects against logical mistakes only, not disk failure.

`DATA_DIR/backups` and `*.pre-restore-*` are covered by `.gitignore`.

---

## 4. What a backup contains

A complete SQLite database file: `users` (with scrypt password hashes), `sessions` (with token
hashes), `schema_migrations`, and all future tables.

**Therefore a backup is as sensitive as the live database.** It must not be committed to Git,
copied to cloud storage, or attached to a chat. Restrict NTFS permissions on `BACKUP_DIR` to the
account that runs the service.

Not included: nothing is stored outside SQLite yet. When object files are introduced, the backup
procedure must cover `DATA_DIR/objects` as well, and the manifest must record that it is a
database-only snapshot. This is a known gap, not an oversight.

---

## 5. Manifest

Written next to each backup, JSON, one object:

```json
{
  "formatVersion": 1,
  "createdAt": "2026-10-19T13:45:12.123Z",
  "createdAtMs": 1760871912123,
  "file": "knowledge-20261019T134512123Z-a1b2c3d4.sqlite3",
  "sizeBytes": 40960,
  "sha256": "…64 hex chars…",
  "schemaVersions": [1, 2],
  "sqliteVersion": "3.x.y",
  "integrityCheck": "ok",
  "foreignKeyViolations": 0
}
```

The manifest is what makes silent corruption detectable. A backup without a manifest is reported
as unverified and **cannot** be restored by the CLI.

---

## 6. Create

```bash
# from the repository root
export DATA_DIR="C:/PKH-data"          # absolute, required
export BACKUP_DIR="D:/PKH-backups"     # optional, absolute, defaults to DATA_DIR/backups

npm run backup:create
npm run backup:create -- --keep 14     # override retention for this run
```

Steps performed:

1. Validate that `BACKUP_DIR` is absolute; create it if missing.
2. Refuse to run if the live database file does not exist (prevents "backing up" an empty file
   that `openDataDatabase` would silently create).
3. Stream a consistent snapshot to `<name>.partial` via the Online Backup API.
4. Open the partial file **read-only** and run `PRAGMA integrity_check` and
   `PRAGMA foreign_key_check`; read `schema_migrations` and `sqlite_version()`.
5. Compute SHA-256 and size; rename `.partial` → final; write the manifest atomically.
6. Prune older backups beyond `--keep`, touching only files that match the backup name pattern.

Any failure leaves no final backup file. A leftover `.partial` is safe to delete.

### Scheduling

Windows Task Scheduler, daily, running as the service account:

```
Program:   C:\Program Files\nodejs\npm.cmd
Arguments: run backup:create
Start in:  C:\Users\_phontakonnn\Documents\Wed_Phontakon
```

Set `DATA_DIR` and `BACKUP_DIR` as system environment variables for that account. The task must
not run while a restore is in progress.

---

## 7. Verify

```bash
npm run backup:verify -- "D:/PKH-backups/knowledge-20261019T134512123Z-a1b2c3d4.sqlite3"
```

Checks, in order:

1. File and manifest both exist and the manifest parses.
2. `formatVersion` is supported.
3. `sizeBytes` and `sha256` match the file on disk.
4. `PRAGMA integrity_check` returns `ok`.
5. `PRAGMA foreign_key_check` returns no rows.
6. `schema_migrations` versions match the manifest.
7. Required tables `users`, `sessions`, `notes`, and `notes_fts` exist.

Exit code `0` on success, `1` with a printed list of problems otherwise. Verification is
read-only: it never modifies the backup.

Add `--no-manifest` only for a raw SQLite file supplied from outside the tool (for example a copy
made by hand). Backups and automatic safety copies both have manifests, so they do not need it:

```bash
npm run backup:verify -- "D:/manual-copy.sqlite3" --no-manifest
```

**Run a verification after every create, and re-verify the newest backup weekly.** Bit rot and
partial disk failures are otherwise invisible until the day you need the file.

---

## 8. Restore

Restore is **offline and destructive**. It replaces the live database.

### Preconditions (all mandatory)

1. The server process is stopped. If `knowledge.sqlite3-shm` exists, the tool tries to delete it:
   Windows refuses to delete a file that a live connection has memory-mapped (EBUSY), so success
   proves nothing is attached and a failure aborts the restore. `BEGIN EXCLUSIVE` is a second check
   for an active writer. `--force` bypasses the `-shm` check for an operator who has positively
   confirmed the server is down after a crash.
2. The chosen backup passes `verify`.
3. The operator has typed `--yes`.

### Procedure

```bash
# 1. Stop the server (close the terminal / stop the scheduled task).

# 2. Confirm the backup is good.
npm run backup:verify -- "D:/PKH-backups/knowledge-20261019T134512123Z-a1b2c3d4.sqlite3"

# 3. Restore.
npm run backup:restore -- "D:/PKH-backups/knowledge-20261019T134512123Z-a1b2c3d4.sqlite3" --yes
```

Tool behaviour:

1. Verify the backup (abort on any problem).
2. Take an automatic safety copy of the current database at
   `DATA_DIR/db/knowledge.sqlite3.pre-restore-<UTC>` using the Online Backup API, so the current
   state — including uncheckpointed WAL content — is recoverable. The copy gets its own manifest, so
   it can be verified and restored by the same CLI if the restore has to be undone.
3. Delete stale `-wal` and `-shm` files belonging to the target.
4. Copy the backup to `knowledge.sqlite3.restore-partial` in the same directory, flush it, then
   rename it over `knowledge.sqlite3` (atomic on the same volume).
5. Re-open the restored database and assert `integrity_check = ok`, expected schema versions, and
   that the required user, session, and Notes tables are queryable.
6. Print the safety-copy path.

If step 5 fails, the tool copies the safety copy back over the database automatically and reports
the failure. To undo a restore that passed its checks but is still unwanted:

```bash
npm run backup:restore -- "C:/PKH-data/db/knowledge.sqlite3.pre-restore-20261019T134512123Z" --yes
```

Do not start the server on a database that failed post-restore verification.

### After restoring

- Start the server and confirm `GET /api/health` returns 200.
- Log in. If the restored snapshot predates the current password, the old password applies.
- All sessions created after the snapshot are invalid — every device must log in again.
- Record the restore in `PROGRESS.md`: date, source backup, reason, outcome.

### Manual fallback (only if the CLI is unusable)

1. Stop the server.
2. Copy the backup file over `DATA_DIR/db/knowledge.sqlite3`.
3. **Delete** `knowledge.sqlite3-wal` and `knowledge.sqlite3-shm`.
4. Start the server and check `/api/health`.

Never leave a stale `-wal` next to a replaced main file: SQLite would replay it onto the wrong
database and corrupt the result.

---

## 9. Restore drill

A backup is unproven until it has been restored at least once.

| # | Step | Pass condition |
| --- | --- | --- |
| 1 | Create a backup of a database with known content | Backup + manifest exist; `verify` exits 0 |
| 2 | Restore into a scratch `DATA_DIR` (never the live one) | Post-check passes |
| 3 | Compare row counts / login with the pre-backup state | Identical |
| 4 | Repeat on the real `DATA_DIR` after stopping the server | Login works, health 200 |
| 5 | Confirm the safety copy exists and is restorable | `verify` on the safety copy exits 0 (it has its own manifest) |

Drill cadence: before enabling remote access, and after any schema migration.

---

## 10. Acceptance gate for remote access

Remote access (Tailscale or anything else) must remain disabled until **all** of the following are
true and recorded in `docs/ACCEPTANCE.md`:

- [ ] `BACKUP_DIR` points to a physically separate disk, verified by volume/drive inspection.
- [ ] Daily scheduled backup has run unattended at least 3 consecutive days.
- [ ] Every produced backup passed `verify`.
- [ ] A full restore drill (§9) passed on the real `DATA_DIR`.
- [ ] The restored system allowed a successful login with pre-backup credentials.
- [ ] Retention pruning was observed to keep the configured count and delete nothing else.

Until then the system is **not production-ready** and must not hold real user data.

---

## 11. Known limitations

- No encryption at rest for backups. Protection relies on NTFS ACLs and physical control.
- No offsite/secondary copy. A fire or theft loses both live data and backups.
- No point-in-time recovery; granularity is one backup interval.
- No automatic backup before migration — it is a documented manual step.
- Backup files grow with the database; there is no incremental or compressed mode.
- The tool does not back up `DATA_DIR/objects` because no object store exists yet.
- A crash between the database rename and the manifest write leaves a valid but unverified
  backup. `verify` will report the missing manifest; re-run `create`.
