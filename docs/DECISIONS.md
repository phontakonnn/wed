# Decisions

## Date
- 2026-10-19

## Current evidence
- Windows 10 Enterprise LTSC build 19044, x64; 32,478 MB RAM (Phase 0 `systeminfo` output)
- Node.js v24.22.0 and npm 11.19.1 are active in the current environment
- Git 2.55.0.windows.3 is available and the workspace **is now** an initialized Git repository on
  branch `main` (earlier notes in this file recorded no `.git` and version 2.56.0.windows.2)
- The earlier Phase 0 audit found Tailscale absent, C: with approximately 789 GB free, and D: with approximately 6.97 GB free
- BitLocker status and physical-disk/volume separation remain unverified
- The user explicitly approved continuing through phases; approval does not replace evidence or acceptance criteria

## Decisions

### Paths
- Keep the repo in the existing workspace; do not create a second project tree over it.
- Proposed future data directory remains `C:\PKH-data`, but no production data directory has been created or used.
- Backup directory remains unselected until a separate physical disk is identified and verified. Do not treat D: as a backup disk based on the current evidence.

### SQLite driver
- Use the already-installed `better-sqlite3` 13.0.3 for this implementation slice.
- Evidence: package metadata reports MIT and Node `>=22`; on Node v24.22.0/Windows x64 it loaded successfully, created an in-memory FTS5 table, inserted a row, and returned a matching query result.
- It is a native addon; no dependency was added in this task. A local declaration file was added because the installed package does not provide TypeScript declarations.
- `sqlite3` 6.0.1 is also present in the existing server manifest, reports BSD-3-Clause, and passed the same in-memory FTS5 smoke test. It is not used by the application implementation. Do not add/upgrade dependencies without a separate dependency review and approval.

### Database behavior
- Use versioned forward-only SQL migrations under `apps/server/migrations`.
- Enable `foreign_keys=ON`, `busy_timeout=5000`, and WAL for file-backed databases. In-memory test databases use SQLite's in-memory journal mode.
- Production database path is `DATA_DIR/db/knowledge.sqlite3`; server startup rejects a missing DATA_DIR and requires an absolute path.
- Keep large files outside SQLite; no file storage implementation exists yet.

### Authentication and sessions
- Use Node's built-in `crypto.scrypt` rather than adding an Argon2 package. Password minimum is 12 Unicode code points.
- No public registration route. Initial administrator creation is a local CLI operation that reads a hidden password from an interactive terminal and refuses to initialize a second administrator.
- Store session token SHA-256 hashes, not raw tokens; enforce 7-day sliding idle and 30-day absolute expiry.
- Store a capped User-Agent label for authenticated per-device session listing; current session, selected session, other sessions, and all sessions can be revoked through authenticated routes.
- Session cookies are HttpOnly and SameSite=Strict; Secure follows the configured HTTPS origin. Origin, Host, and a custom request header are checked for mutating requests.
- Login throttling is currently in-process memory, per IP and normalized account, with a 15-minute window and exponential delays after five failures. Restart persistence and multi-process coordination are not implemented and remain a known limitation.

### Search, files, backup, and remote access
- Thai search strategy remains a design candidate only; no accuracy/latency comparison has been run.
- File upload/preview is not implemented.
- **Backup/restore is now implemented and tested** (`apps/server/src/backup.ts`, `backup-cli.ts`). The
  backup/restore *gate* is not yet passed: separate physical disk, scheduled runs, and a real restore
  drill remain outstanding (see `ACCEPTANCE.md` BK-08..BK-11).
- Remote access remains deferred until the required QA and backup/restore gates pass. No Tailscale Serve, firewall, public port, or proxy configuration was changed.
- Backup/DR cannot pass until a separate physical backup target is identified and tested.

### Version control
- The workspace was initialized in place (`git init -b main`); no second project tree was created.
- The verified Phase 2 slice was committed as the first commit (`9da93bd`, 38 files) **before** any
  documentation or backup code was written, so a rollback target exists for every later change.
- `.gitignore` is deny-by-default for runtime artefacts: `node_modules/`, `**/dist/`, every SQLite
  file with its `-wal`/`-shm` sidecars, `DATA_DIR` patterns (`**/data/`, `**/db/knowledge.sqlite3*`),
  `**/backups/`, `*.pre-restore-*`, and secret material (`.env*`, `*.pem`, `*.key`, `credentials.json`).
  `.workbuddy-ai/` is ignored because it holds local agent state, not application code.
- No global Git identity existed on this machine, so a repository-local identity was set to
  `Phontakon <phontakon@localhost>`. It is a placeholder; rewriting author metadata later requires
  a history rewrite, so set the real identity before pushing anywhere.
- Line endings: Git reports LF→CRLF conversion warnings on Windows. No `.gitattributes` was added
  because no build or CI currently depends on line endings.

### Documentation
- `SCHEMA.md`, `API.md`, `BACKUP.md`, `TEST_PLAN.md`, and `ACCEPTANCE.md` were written from the
  implementation, not from the design intent. Where code and intent disagree, the document records
  the code and flags the gap (for example: cookie lifetime 7 days vs. session lifetime 30 days;
  `sessions_idle_expiry_idx` has no consumer).
- `ACCEPTANCE.md` uses PASS/PARTIAL/FAIL with a re-runnable evidence reference per row. It records
  the system as **not acceptable for real data** rather than declaring the phase complete.

### Backup and restore
- Use SQLite's **Online Backup API** (`better-sqlite3` `database.backup()`) for every snapshot.
  Rationale: in WAL mode, committed rows may live only in the `-wal` file, so a file copy can
  silently miss data. Verified by test BK-01, which inserts a row without checkpointing and finds it
  in the backup.
- Every backup gets a sidecar JSON manifest with SHA-256, size, schema versions, SQLite version, and
  integrity result. A backup without a manifest is treated as unverified and cannot be restored by
  the CLI. Rationale: silent corruption is otherwise discovered only during a real recovery.
- Retention defaults to 7, newest-first by filename (timestamps are fixed-width and sort correctly).
  Pruning only touches files matching `knowledge-<stamp>-<hex>.sqlite3`, so unrelated files in the
  backup directory are never deleted. Verified by BK-07.
- Restore keeps an automatic `*.pre-restore-<stamp>` safety copy taken with the same Online Backup
  API, removes stale `-wal`/`-shm` before replacing the file, then re-verifies integrity, schema
  versions, and required tables. On post-restore failure it copies the safety copy back.
- **In-use detection:** a probe using only `BEGIN EXCLUSIVE` cannot detect an idle open connection —
  measured on this machine: the probe succeeded while another `better-sqlite3` handle was open, and
  failed only when that handle held a write transaction. The implemented check therefore treats the
  presence of `knowledge.sqlite3-shm` as "still in use", because SQLite creates that file while any
  connection is attached and deletes it on the last close (also measured). `BEGIN EXCLUSIVE` remains
  as a second check. `--force` bypasses the `-shm` check for a confirmed-dead server.
  Rejected alternative: renaming the database file as a probe — on Windows it fails while the file is
  open, but a crash mid-probe would leave the live database renamed.
- Backups are **not encrypted**. They contain scrypt password hashes and session-token hashes, so
  they are as sensitive as the live database and rely on NTFS ACLs. Encryption is deferred, not done.
- The backup directory must be a separate physical disk. That is not yet verified, so the backup gate
  in `ACCEPTANCE.md` stays closed.

### Scope discipline for this session
- `auth.ts`, the `preHandler` hook, the CSRF checks, and all pre-existing routes were left untouched.
  The only edits to existing files were `.gitignore`, `package.json` (scripts), and
  `better-sqlite3.d.ts` (type declarations for `backup()` and connection options).


## Approval and implementation status
- The user authorized proceeding through phases on 2026-10-19, and again authorized this
  documentation and backup/restore work in the same session.
- The Phase 1 documentation package is now present: `SCHEMA.md`, `API.md`, `BACKUP.md`,
  `TEST_PLAN.md`, and `ACCEPTANCE.md`. `MASTER_PROMPT.md` is still missing, and the transitive
  license inventory in `DEPENDENCIES.md` is still incomplete.
- The current phase is partial Phase 2 work, not a claim that all phase gates passed. Notes,
  bookmarks, files, and search do not exist.
- This session added no npm dependency. Tests and the CLI smoke run used in-memory, temporary, and
  throwaway directories only; no real `DATA_DIR` was created or modified.
- Git now exists, so status/diff/log checks are available. The initial commit `9da93bd` was taken
  before any new code. No claim is made that the future history will stay secret-free; run
  `git ls-files` checks before publishing.
- Backup/restore is implemented and tested, but the **backup gate remains closed**: separate
  physical disk, scheduled runs, and a real restore drill are still outstanding.

