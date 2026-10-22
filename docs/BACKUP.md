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
| Backup file | `BACKUP_DIR/knowledge-<UTC>-<rand>.sqlite3` | `<UTC>` = `YYYYMMDDTHHMMSSmmmZ`; encrypted when a key is configured. |
| Manifest | same name + `.manifest.json` | Checksum, provenance, and encryption format metadata. |
| Restore safety copy | `DATA_DIR/db/knowledge.sqlite3.pre-restore-<UTC>` + `.manifest.json` | Automatic, never deleted by the tool. |
| In-progress files | `*.partial` | Removed or renamed; ignored by `list`. |

**Disk separation is not yet satisfied.** `BACKUP_DIR` must eventually point to a physically
separate disk. Until that is verified, the backup gate stays open (see §8). Pointing
`BACKUP_DIR` at another folder on `C:` protects against logical mistakes only, not disk failure.

`DATA_DIR/backups` and `*.pre-restore-*` are covered by `.gitignore`.

---

## 4. What a backup contains

A complete SQLite database file: `users` (with scrypt password hashes), `sessions` (with token
hashes), `schema_migrations`, notes, bookmarks, categories/tags, favorites, and file metadata.

When `createBackup` is given a `dataDirectory` (the CLI always passes `DATA_DIR`), the backup also
contains a **snapshot of `DATA_DIR/objects`** in a sibling directory named
`<backup file>.objects`, and the manifest records its file count, byte total and tree hash. This is
what makes a file restore consistent: metadata and bytes travel together, and a restore cannot
leave rows pointing at objects from a different point in time.

`DATA_DIR/tmp` is **not** backed up: it only holds in-flight `.part` uploads, which are by
definition incomplete.

Unencrypted backups are as sensitive as the live database. Encrypted backups use AES-256-GCM with
a random 96-bit IV and a 128-bit authentication tag; the key is never written to the backup or
manifest. All backup files must still stay out of Git, chat, and unapproved cloud storage, and
`BACKUP_DIR` should have restrictive NTFS permissions.

**When a key is configured, every stored object is encrypted too**, one file at a time, with the
same `PKHBAK01` envelope (magic, fresh 12-byte IV, ciphertext, 16-byte GCM tag). The snapshot
directory contains `<logical path>.enc` files and no plaintext. `verify` refuses a set whose
database and object snapshot disagree about encryption, so a half-encrypted backup cannot pass.
See §13 for the format and the remaining plaintext staging caveat.

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
  "foreignKeyViolations": 0,
  "encryption": {
    "algorithm": "aes-256-gcm",
    "formatVersion": 1
  },
  "objects": {
    "directory": "knowledge-20261019T134512123Z-a1b2c3d4.sqlite3.objects",
    "formatVersion": 2,
    "fileCount": 12,
    "totalBytes": 1048576,
    "treeSha256": "…64 hex chars…",
    "encryption": { "algorithm": "aes-256-gcm", "formatVersion": 1 },
    "files": [
      {
        "path": "ab/ab12…",
        "sizeBytes": 87381,
        "sha256": "…plaintext digest…",
        "storedPath": "ab/ab12….enc",
        "storedSizeBytes": 87409,
        "storedSha256": "…ciphertext digest…"
      }
    ]
  }
}
```

`encryption` is present only for encrypted backup files; older/plaintext manifests remain readable.
`objects` is present only when the snapshot contained at least one file. `directory` is a plain
basename next to the backup; a value containing a path separator is rejected by verification.

`objects.formatVersion` is `2` for a snapshot with a per-file inventory. Manifests written before
this change have no `formatVersion`/`files` and are treated as the legacy plaintext tree; they still
verify by count, size and `treeSha256`, but they cannot prove per-file plaintext hashes.
`objects.encryption` is present only when every stored file is encrypted. `treeSha256` is a SHA-256
over the sorted stored path, stored size and stored SHA-256 of every object, so a same-size byte
swap is still detected even before decryption.

The encrypted payload uses an 8-byte `PKHBAK01` header, the IV, ciphertext, and the GCM tag.
SHA-256 and size cover the stored artifact. The manifest is what makes silent corruption detectable.
A backup without a manifest is reported as unverified and **cannot** be restored by the CLI.

### Encryption configuration

- Set `BACKUP_ENCRYPTION_KEY` to a canonical Base64 encoding of exactly 32 random bytes in the
  service/CLI process environment, and keep the key in a protected secret store separate from
  `BACKUP_DIR`. Never put it in source, `.env` files tracked by Git, logs, or a backup manifest.
- When a key is present, newly created backups and restore safety copies are encrypted. Verification
  and restore of encrypted backups require the same key; a wrong key fails GCM authentication.
- Set `BACKUP_ENCRYPTION_REQUIRED=true` to make backup creation and restore fail closed if the key
  is absent or malformed. There is no plaintext fallback in this mode. With the setting omitted or
  `false` and no key, legacy plaintext backup behavior remains available; this is **not** adequate
  for real-data acceptance.
- Losing the key makes encrypted backups unrecoverable. Key rotation must retain old keys until all
  backups using them expire or are re-encrypted; key identifiers/automated rotation are not
  implemented.
- For encrypted creation and verification, a transient plaintext SQLite staging file is created
  under the OS temporary directory and removed on normal success/failure. Abrupt process or machine
  failure may leave that temporary file behind; its location and NTFS permissions must be protected.
  This staging caveat is a remaining operational risk, not an encrypted backup artifact.

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
3. Open the existing database without applying pending migrations, then stream a consistent
   snapshot to a temporary SQLite file via the Online Backup API.
4. Open the temporary file **read-only** and run `PRAGMA integrity_check` and
   `PRAGMA foreign_key_check`; read `schema_migrations` and `sqlite_version()`.
5. If encryption is configured, encrypt the snapshot with AES-256-GCM into a partial artifact in
   `BACKUP_DIR`, then remove the plaintext staging file. Compute SHA-256 and size over the final
   stored bytes; atomically finalize the artifact and manifest.
6. Prune older backups beyond `--keep`, touching only files that match the backup name pattern.

If snapshot creation, integrity verification, manifest creation, or atomic finalization fails, the
tool removes the partial/new artifacts created by that attempt and reports failure. If retention
pruning fails after the new backup and manifest have been finalized, that verified backup may remain
even though the command reports the pruning error; inspect the backup list before retrying.

If `BACKUP_ENCRYPTION_REQUIRED=true` but the key is missing/invalid, backup creation fails before
creating the backup directory or any backup artifact.

### Automatic pre-migration backup

On server startup and before the interactive administrator bootstrap opens the database normally,
the application checks the recorded migration history without applying migrations or changing the
database journal mode. If an existing database has pending migrations and contains user rows, it
creates a backup with the Online Backup API and verifies the backup manifest, checksum, integrity,
and schema before proceeding. This safety backup is not subject to retention pruning. If creation or
verification fails, startup or bootstrap aborts before applying migrations. New databases and
databases without user rows do not create this pre-migration backup. The regular `backup:create`
command also opens without applying migrations, so it can capture the pre-upgrade schema.

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
4. If encrypted, GCM authentication succeeds and the backup is decrypted to a temporary file; the
   key must be configured.
5. `PRAGMA integrity_check` returns `ok`.
6. `PRAGMA foreign_key_check` returns no rows.
7. `schema_migrations` versions match the manifest.
8. Schema-version-specific required tables exist.

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

Restore is **offline and destructive**. It replaces the database at `DATA_DIR`.

**The restore target is `DATA_DIR`.** There is no `--target` or `--into` option: the tool writes
`<DATA_DIR>/db/knowledge.sqlite3` and `<DATA_DIR>/objects`. Running it with the live `DATA_DIR`
replaces live data after taking a safety copy. There is no dry-run, and `--force` only skips the
in-use check; never use `--force` for a drill. For a drill, set `DATA_DIR` to a recovery directory
outside the live path (see §9).

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

# 3. Restore into DATA_DIR. For a drill, DATA_DIR MUST be a recovery directory (see §9),
#    never the live data directory.
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

A backup is unproven until it has been restored at least once. A drill **must not** restore over the
live `DATA_DIR`: restore into a recovery directory and run the restored copy as a separate instance.
The exact PowerShell sequence is in `docs/ACCEPTANCE.md` §7.3.

| # | Step | Pass condition |
| --- | --- | --- |
| 1 | Choose a verified backup and a recovery root outside the live `DATA_DIR` | `verify` exits 0; both paths are absolute; the recovery path is not the live path and not inside it |
| 2 | Set `DATA_DIR` to the recovery root and restore with `--yes` | exit 0; the printed target is the recovery path; a fresh target prints `safety copy: none` |
| 3 | `storage:check` against the recovery `DATA_DIR` | exit 0; no missing/orphan objects, size or SHA-256 mismatch |
| 4 | `backup:create --verify` from the recovery `DATA_DIR` into a separate verify directory | exit 0; `integrity_check`, `foreign_key_check`, schema and object inventory pass |
| 5 | Start the restored copy on a spare port; log in and check a note + category/tag, bookmark, favorite, file download | relationships match; downloaded SHA-256 matches the file view |
| 6 | Verify the safety copy if one was printed | `verify` exits 0 (it has its own manifest) |
| 7 | Leave the live `DATA_DIR` untouched | live server still healthy; no restore was run against it |

Path assertions before the restore (read-only):

```powershell
$liveData  = (Resolve-Path -LiteralPath 'C:\PKH-data').Path.TrimEnd('\')
$recoveryRoot = 'C:\PKH-recovery-20261020'
New-Item -ItemType Directory -Path $recoveryRoot -Force | Out-Null
$recovery = (Resolve-Path -LiteralPath $recoveryRoot).Path.TrimEnd('\')
if ($recovery -eq $liveData) { throw 'Refusing: recovery target equals the live DATA_DIR' }
if ($recovery.StartsWith($liveData + '\')) { throw 'Refusing: recovery target is inside the live DATA_DIR' }
```

Then run the restore with `DATA_DIR` set to `$recovery`, not to `$liveData`. If no isolated recovery
space or spare port exists, record the drill as **NOT VERIFIED**; do not restore over the live
system to complete it.

Drill cadence: before enabling remote access, and after any schema migration.

## 10. Acceptance gate for remote access

Remote access (Tailscale or anything else) must remain disabled until **all** of the following are
true and recorded in `docs/ACCEPTANCE.md`:

- [ ] `BACKUP_DIR` points to a physically separate disk, verified by volume/drive inspection.
- [ ] Daily scheduled backup has run unattended at least 3 consecutive days.
- [ ] Every produced backup passed `verify`.
- [ ] Encrypted backup mode is required and the key is stored/escrowed separately from the backup disk.
- [ ] A full restore drill (§9) passed using real backup data in an isolated recovery target, with the live `DATA_DIR` untouched.
- [ ] The restored system allowed a successful login with pre-backup credentials.
- [ ] Retention pruning was observed to keep the configured count and delete nothing else.

Until then the system is **not production-ready** and must not hold real user data.

---

## 11. Known limitations

- Encryption is implemented with AES-256-GCM and temporary-DB tests; real key provisioning,
  encrypted backups on the selected backup volume, and recovery/rotation procedures are **not
  verified**. Keep BK-11 open until those operational checks pass.
- Encrypted operations use transient plaintext SQLite staging under the OS temp directory; a crash
  can leave a residue requiring protected temp storage and operational cleanup.
- No offsite/secondary copy. A fire or theft loses both live data and backups.
- No point-in-time recovery; granularity is one backup interval.
- Startup and admin bootstrap create and verify a non-pruned pre-migration backup when pending
  migrations affect an existing DB with user rows. This behavior is covered only with temp DB tests.
- Backup files grow with the database; there is no incremental or compressed mode.
- Object snapshots are full copies of `DATA_DIR/objects` on every backup, not incremental. A large
  file store multiplies backup time, space and I/O.
- Object encryption is implemented, but key management (escrow, rotation, loss recovery) is still
  **NOT VERIFIED** on a real machine; see §10 and §13.
- Encrypted database verification still needs a transient plaintext SQLite file under the OS temp
  directory. Object verification does **not**: objects are decrypted to a hash sink, never to disk.
- The tool does not reconcile orphans: an object whose metadata insert failed, or a row whose
  object is missing, is reported/logged but never repaired automatically.
- A crash between the database rename and the manifest write leaves a valid but unverified
  backup. `verify` will report the missing manifest; re-run `create`.
- If the live store is already inconsistent when a restore starts (a `files` row whose object is
  missing), the safety copy captures that broken state. It is created and the restore proceeds, but
  `verify` on that safety copy reports `references N file(s) but the backup has no object snapshot`,
  so the CLI cannot use it for a rollback. This was observed during the 2026-10-19 acceptance drill.
  Recover manually from the safety database plus the `*.pre-restore-*` object directory, and fix the
  missing object before the next restore. No code change was made: the check is correctly reporting
  a pre-existing inconsistency.

---

## 12. Object snapshots in create, verify, restore and retention

Implemented 2026-10-19; covered by automated tests on temporary directories.

### Create

1. The database is snapshotted with the Online Backup API, as before.
2. If `dataDirectory` is supplied and `DATA_DIR/objects` contains at least one file, each object is
   streamed into `<backup file>.objects.partial` — encrypted when a key is configured, copied
   otherwise — and its plaintext and stored hashes are recorded.
3. The manifest is written only after the snapshot is complete. If encryption, copying or hashing
   fails, the whole backup is aborted and its partial database, object directory and manifest are
   removed. A required-but-missing key fails before anything is written.

### Verify

`verify` checks the object directory exists, its file count and byte total match the manifest, and
its tree hash matches. With `formatVersion: 2` it additionally checks the inventory entry by entry:

- every stored file exists, matches `storedSizeBytes` and `storedSha256`;
- every encrypted file decrypts with a valid GCM tag and yields the recorded plaintext size/hash;
- no file exists that the inventory does not list, and no listed file is missing;
- stored paths are plain relative paths derived from the logical path (`.enc` when encrypted);
- the database and the object snapshot agree about encryption;
- every `files` row in the backup database has a corresponding object (orphan objects produce a
  warning, not a failure).

A count or total-size match alone never counts as verification.

### Restore

1. The backup is verified first, including the object snapshot and the database↔object relation.
2. A database safety copy is created as before.
3. The live `DATA_DIR/objects` is moved aside (`objects.rollback-<stamp>`) so a failure can restore
   it without a copy.
4. A safety snapshot is built from that directory using the **same encryption policy** as the backup
   being restored, and recorded in the safety copy's manifest. The plaintext rollback directory is
   removed only after that manifest is written.
5. The backup's objects are decrypted/copied into `objects.restore-partial-<stamp>`, verified file
   by file, then renamed into place; only then is the database replaced.
6. Any failure rolls the object store back and the database back to its safety copy. The CLI prints
   both paths.
7. Rolling back a completed restore is a single command:
   `backup:restore -- <safety copy path> --yes` (with the key, if the set is encrypted).

If the backup has no object snapshot, `DATA_DIR/objects` is left untouched. Restoring a
database-only backup therefore cannot silently delete files; it can, however, leave file metadata
and objects out of step if the backup predates the files. Treat a database-only backup as a
database-only rollback.

### Retention

Pruning a backup removes its file, manifest **and** `<name>.objects` directory. Unrelated files in
`BACKUP_DIR` are still ignored, and the backup being created is always protected from pruning.

---

## 13. Object encryption, scratch space and operator tooling

### Envelope and key handling

- Each stored object is a `PKHBAK01` container: 8-byte magic, 12-byte random IV, ciphertext,
  16-byte GCM tag. This is the same envelope as the encrypted database backup, so there is one
  crypto format and one key.
- A fresh IV is generated for every file and every backup run. The key is 32 bytes, supplied only
  through `BACKUP_ENCRYPTION_KEY`; it is never written to a manifest, log, or command line.
- `BACKUP_ENCRYPTION_REQUIRED=true` fails closed: no key means no backup, never a plaintext
  fallback.
- Wrong keys and tampered ciphertext fail GCM authentication during verification, before any restore.

### Plaintext scratch space

- Encrypted object creation and verification never write plaintext objects to disk: encryption
  streams live file → cipher → snapshot, and verification decrypts to a hash sink.
- The SQLite backup/verify path still needs a plaintext staging database under the OS temp
  directory. Directories are created with mode `0700` and the file with `0600` where POSIX modes
  apply; on Windows these calls are best-effort and protection comes from the per-user temp ACL.
- Cleanup runs on success, failure and thrown errors. A power loss or process kill can still leave a
  staging file behind; that residual risk is **not** claimed as solved.

### Preflight

`npm run backup:preflight` reports, without writing anything:

- whether `BACKUP_DIR` equals, is nested inside, or contains `DATA_DIR`;
- whether both paths are on the same volume (device id comparison);
- data size, estimated requirement, and free space on the backup volume;
- whether encryption is required and whether a key is configured (never the key itself);
- the volume and physical disk for each path when Windows can prove it, and
  `UNKNOWN / NOT VERIFIED` otherwise.

Physical disk evidence on Windows is read-only. The probe first asks the Storage cmdlets
(`Get-Partition -DriveLetter`) for the disk number, then falls back to the CIM association
`Win32_LogicalDiskToPartition` and parses `Disk #N`. It never reads file content, never writes to
the destination, and never changes a volume.

What it can and cannot prove:

| Situation | Result |
| --- | --- |
| Both paths on drive-letter volumes and the probe returns different `Disk N` | `DIFFERENT PHYSICAL DISKS` |
| Both return the same `Disk N` | `SAME PHYSICAL DISK` warning; BK-08 not satisfied |
| UNC/network path, mount point without a drive letter, non-Windows host, or probe failure | `UNKNOWN / NOT VERIFIED` |

A different drive letter or a different volume is **not** accepted as evidence by itself. A host
where the storage cmdlets are unavailable (observed on this machine: `Get-Partition`/`Get-Volume`
found no volume, and the CIM fallback also returned nothing under the sandbox) correctly reports
UNKNOWN. BK-08 therefore still requires operator evidence from the real backup destination.

`backup:create` runs the same preflight and refuses to start on errors (same directory, insufficient
space, required key missing). A same-disk or unknown result is a warning, not a refusal, because a
same-disk backup is still better than no backup.

### Storage reconciliation

`npm run storage:check [--json] [--skip-hash]` is read-only and reports:

- metadata rows whose object is missing;
- objects with no metadata row;
- size mismatches and hash mismatches, reported separately;
- files in the object tree whose path is not a canonical `<shard>/<uuid>`;
- duplicate object keys;
- stale `tmp/*.part` files (older than 24 hours) versus active ones.

It exits `1` when any problem is found, so a scheduler can alert on it.

`npm run storage:quarantine` is a dry run unless `--yes` is passed. With `--yes` it **moves**
orphan objects and stale temporary files into `DATA_DIR/quarantine/<stamp>/`, writes a
`quarantine.json` record, and never deletes anything. A file that gained a metadata row between the
scan and the move is skipped. Missing objects, hash mismatches and unexpected paths are reported but
not modified — they need an operator decision.

---

## 14. Key management and rotation

### Configuration

| Variable | Purpose |
| --- | --- |
| `BACKUP_ENCRYPTION_KEY` | Active 32-byte key, canonical base64. Required when `BACKUP_ENCRYPTION_REQUIRED=true`. |
| `BACKUP_ENCRYPTION_KEY_ID` | Optional short identifier for the active key (`[A-Za-z0-9._-]{1,64}`), written into manifests. Never the key. |
| `BACKUP_ENCRYPTION_KEY_RING` | Optional JSON object `{ "<id>": "<base64 key>" }` of older keys, used only to decrypt backups whose manifest names that id. |
| `BACKUP_ENCRYPTION_REQUIRED` | `true` fails closed when no active key exists. |

Rules enforced by `resolveKeyRing`:

- Invalid base64, a non-32-byte key, an invalid key id, a malformed ring, a non-string ring entry,
  or a ring entry that contradicts the active key aborts with a message that never contains key
  material.
- `BACKUP_ENCRYPTION_KEY_ID` without `BACKUP_ENCRYPTION_KEY` is an error.
- A required-but-missing active key aborts **before** any file or directory is created.
- The active key is also registered in the ring under its id, so a single id can be selected
  uniformly.

### What manifests record

Encrypted manifests store `encryption.keyId` (database) and `objects.encryption.keyId` (snapshot).
Verification rejects a set whose two key ids differ. No key bytes, key hash, or passphrase are ever
written to a manifest, log, or command line.

### Rotation procedure (operator, not automated)

1. Keep the old key in `BACKUP_ENCRYPTION_KEY_RING` under its existing id.
2. Set `BACKUP_ENCRYPTION_KEY` / `BACKUP_ENCRYPTION_KEY_ID` to the new key.
3. New backups are encrypted with the new key and labelled with the new id.
4. Older backups remain verifiable/restorable because the manifest names the old id and the ring
   still holds it.
5. Remove an old ring entry only after every backup that uses it has expired under retention.

Nothing re-encrypts existing backups automatically. Deleting a ring entry that a retained backup
needs makes that backup unreadable; this is intentional and is reported as
`No backup key is configured for key id <id>`.

### What is still NOT VERIFIED

Key storage, escrow, recovery after key loss, and rotation on a real machine. The mechanism is
tested with synthetic keys; that is not evidence that an operator's key store is safe.

---

## 15. Staging residue and measured cost

### Staging report

`npm run backup:staging [--stale-hours N]` lists `pkh-backup-create-*`, `pkh-backup-verify-*`, and
`pkh-restore-safety-*` directories in the OS temp folder with their age and size. It is read-only,
defaults to a 12-hour stale threshold, and **never deletes anything**: a directory may belong to a
running backup. It is the operational counterpart to the cleanup code, not a replacement for it.

### Measured cost (synthetic, temporary data)

300 objects × 4 KiB (1.2 MB), Windows 10, Node 22, local SSD:

| Operation | Time |
| --- | --- |
| Create plaintext snapshot | 1,499 ms |
| Create encrypted snapshot | 4,634 ms |
| Verify encrypted backup | 560 ms |
| Restore encrypted backup (safety snapshot + 300 objects) | 5,811 ms |

Backup directory size was 1,654,192 bytes plaintext and 1,666,392 bytes encrypted: about 0.7%
overhead for headers, tags and the inventory at this object size. These numbers are one run on one
machine; they show the order of magnitude, not a guarantee. Full snapshots remain O(objects) in
time and space, which is why incremental backup was not attempted.

---

## 16. Key operations runbook (owner-facing)

This section describes what the code actually supports. Nothing here has been executed on a real
backup destination; treat it as the procedure to follow and record evidence for.

### 16.1 Generate a key

Run on a trusted machine, not on a shared shell:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The output is a 44-character canonical base64 string. Store it immediately in the chosen secret
store; do not paste it into chat, a ticket, or a tracked file. The command prints the key to the
terminal, so clear the terminal history if that matters to you.

### 16.2 Accepted formats

| Setting | Accepted value | Rejected |
| --- | --- | --- |
| `BACKUP_ENCRYPTION_KEY` | Canonical base64 of exactly 32 bytes (44 chars, trailing `=`) | Any other length, URL-safe base64, whitespace, a passphrase |
| `BACKUP_ENCRYPTION_KEY_ID` | 1–64 characters from `A-Z a-z 0-9 . _ -` (for example `2026-10`) | Spaces, slashes, longer values |
| `BACKUP_ENCRYPTION_KEY_RING` | One-line JSON object, id → canonical base64 key, for example `{"2026-09":"<base64>"}` | Arrays, non-string values, invalid ids/keys |

The application validates all three at startup/CLI use and refuses to continue on a malformed
value. Error messages name the variable and never include the value.

### 16.3 Storing the key on Windows

The application does not implement a key store. Practical options, in order of preference:

1. A dedicated service account runs the backup task; the key is a user-level environment variable
   for that account only. Other users cannot read another user's environment, but administrators
   can. Do not use a shared administrator account for the task.
2. A password manager with emergency access, with the key entered only when a restore is needed.
   This is safer at rest but not automatable.
3. Windows Credential Manager, read by a wrapper that sets the variable for the child process only.
   This requires a custom wrapper and has not been implemented or tested here.

Do **not** put the key in `scripts/backup-config.cmd`, in a `.cmd`/`.ps1` file, in the repository,
or on the backup disk. `backup-config.example.cmd` deliberately contains no key. Setting the key by
typing it into a shell records it in PSReadLine history
(`%APPDATA%\Microsoft\Windows\PSReadLine\ConsoleHost_history.txt`); prefer the account's
environment-variable UI, or clear that history afterwards.

Check configuration without revealing the key:

```bash
DATA_DIR=<absolute> BACKUP_DIR=<absolute> npm run backup:preflight
```

It prints `Encryption : required, key configured` or `key missing`, and never the value. This is a
**presence check only**; it does not prove the key is valid. `backup:create --verify` is the check
that actually uses the key.

The variable is read from the environment of the process that runs the backup. A user-scope
variable is visible only to that account, so set and verify it in the account that will run the
task. S4U task logons may not load user-scope variables; after the first task run, check the log for
`key configured` and `verified: yes`. If the key is missing, the run fails closed. Do not switch to a
machine-scope variable without the owner's explicit approval.

### 16.4 Escrow and recovery copy

- Keep at least two copies of every active key, offline, in separate physical locations, and not on
  the backup disk. A fire or theft that takes the backup disk must not take both key copies.
- Record the **key id** (never the key) in an operations log next to each backup set, so an operator
  can tell which key a restore needs.
- Test escrow recovery by restoring a synthetic backup on a machine where only the escrowed key is
  available. This has not been done on real hardware.

### 16.5 Rotation

1. Generate the new key and give it a new id (for example `2026-11`).
2. Add the current key to `BACKUP_ENCRYPTION_KEY_RING` under its existing id.
3. Set `BACKUP_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY_ID` to the new values.
4. In the task account, run `backup:preflight` (presence only), then `backup:create --verify`
   (proves the key works).
5. Verify an older backup that used the previous id; it must still verify through the ring.
6. Keep the old key in the ring until every backup and safety copy that uses it has expired.

Nothing re-encrypts existing backups. Rotation changes only future backups.

### 16.6 Effect on safety copies

A restore safety copy is encrypted with the key that encrypted the backup being restored, and its
manifest records that id. If that key is removed from the ring, the safety copy becomes unreadable
even though the restore itself succeeded. Remove an old key only after both the backups **and** the
safety copies that reference it are gone.

### 16.7 Key loss

There is no key recovery mechanism in the code. If the key for a backup is lost and no escrow copy
exists, that backup cannot be decrypted or restored. The live database is not encrypted at rest, so
live data remains readable with OS-level access; the loss applies to the backups protected by the
missing key.

### 16.8 Removing an old key

1. List backups and confirm none still reference the old id:
   `npm run backup:list`, then inspect the manifests (the `encryption.keyId` field).
2. Confirm no safety copy in `DATA_DIR/db` references it.
3. Verify the remaining backups.
4. Remove the entry from the ring and restart the service.

Removing a key that is still needed is reported at verification time as
`No backup key is configured for key id <id>`; it never falls back to another key.
