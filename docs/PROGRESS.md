# Progress

## Current phase
- Phase 2 — MVP implementation (partial: SQLite, authentication/session slice, backup/restore MVP)
- Phase 1 documentation package completed in this session (see below)
- The user authorized proceeding through phases. That authorization is not evidence that phase exit
  criteria passed.

## Verified environment
- Windows 10 Enterprise LTSC, version 10.0.19044, x64; RAM 32,478 MB (Phase 0 command output)
- Node.js v24.22.0; npm 11.19.1
- Git 2.55.0.windows.3 (earlier Phase 0 notes recorded 2.56.0.windows.2 — minor discrepancy, not re-audited)
- Tailscale not installed; remote access untouched
- C: free space approximately 789 GB; D: approximately 6.97 GB; backup physical-disk separation unverified
- BitLocker status unverified (access denied in Phase 0)

## Completed in this session (2026-10-19)

### 1. Git baseline
- `.gitignore` rewritten: Node/Vite build output, all SQLite files and `-wal`/`-shm` sidecars,
  `DATA_DIR` (`**/data/`, `**/db/knowledge.sqlite3*`), `**/backups/`, `*.pre-restore-*`, secrets
  (`.env*`, `*.pem`, `*.key`, `credentials.json`), editor/OS noise, and `.workbuddy-ai/`.
- `git init -b main`; initial commit `9da93bd` with 38 tracked files.
- Staging dry-run confirmed no `node_modules`, no `dist`, no database, no secret.
- Repository-local identity was required because no global Git identity existed:
  `user.name = Phontakon`, `user.email = phontakon@localhost`. **Placeholder — change it if a real
  identity is wanted** (`git config user.email <address>`).

### 2. Documentation
Created, from the actual code rather than from the design intent:
- `docs/SCHEMA.md` — tables, indexes, pragmas, hash format, session lifecycle, what is *not* in the schema
- `docs/API.md` — every existing route, CSRF rules, cookie attributes, error shapes, known cookie/expiry mismatch
- `docs/BACKUP.md` — WAL rationale, objectives, manifest, create/verify/restore, drill, gate, limitations
- `docs/TEST_PLAN.md` — test IDs mapped to the 21 automated tests, manual cases, exit criteria
- `docs/ACCEPTANCE.md` — PASS/PARTIAL/FAIL per criterion, with the remote-access gate explicitly closed

### 3. Backup / restore MVP
- `apps/server/src/backup.ts`: `createBackup`, `verifyBackup`, `restoreBackup`, `listBackups`, `pruneBackups`
- `apps/server/src/backup-cli.ts`: `create` / `list` / `verify` / `restore` commands
- Root and server `package.json` gained `backup:create|list|verify|restore` scripts
- `better-sqlite3.d.ts` extended with `DatabaseOptions` and the `backup()` signature (types only)
- **`auth.ts`, the `preHandler` hook, CSRF checks, and all existing routes were not modified.**

### 4. Audit fixes found while reviewing the above
Two defects were found by testing, not by reading, and fixed in the same session:

- **Safety copies were not restorable.** `restoreBackup` wrote `*.pre-restore-*` without a manifest,
  so `verify` rejected it and the CLI could not roll back a completed-but-unwanted restore. Safety
  copies now get their own manifest, and BK-04 asserts the rollback path end to end.
- **The "database is in use" check had false positives.** A read-only inspection creates
  `knowledge.sqlite3-shm` and SQLite does not delete it on close, so the next restore refused to run.
  Presence of the file is no longer the test: the tool now tries to delete it, which fails with
  `EBUSY` only while a live connection has it mapped. Inspections also clean up sidecars they created.

Also added `scripts/backup-daily.cmd`, `scripts/backup-config.example.cmd`, and
`scripts/register-backup-task.ps1` for BK-09. They have **not been executed**; BK-08 must be resolved
before scheduling a destination.

## Verification evidence (2026-10-19)
- `npm test`: **4 files, 21 tests passed, 0 failed** (14 pre-existing + 7 new backup tests)
- `npm run build:server`: TypeScript strict compile, exit 0
- `npm run lint`: no ESLint findings
- `npm run build:web`: passed (Vite 8.3.4)
- CLI end-to-end on a throwaway `DATA_DIR`: seed user → `backup:create` (36 KiB, sha256 recorded)
  → `backup:verify` (ok) → delete all users → `backup:restore --yes` → user present again;
  safety copy produced and verified with `--no-manifest`
- `restore` without `--yes` refused; restore while the database was open refused (BK-05)
- No test or smoke run touched a real `DATA_DIR`; all used temp directories

## Phase/design status
- `MASTER_PROMPT.md` remains absent from the workspace (P1-08 still FAIL)
- Phase 1 documentation gaps are now closed except the master prompt and a full transitive license inventory
- The implementation still has not passed full Phase 1/Phase 2 exit criteria

## Blockers and residual risks
- **Backup gate is closed**: `BACKUP_DIR` is not on a separate physical disk (BK-08), no scheduled
  task exists (BK-09), no restore drill has been performed on a real `DATA_DIR` (BK-10), and backups
  are not encrypted at rest (BK-11)
- Login throttling is in-process only; resets on restart, not multi-process safe
- No notes/bookmarks/files/search CRUD; the web app is still the Vite starter and does not call the API
- Interactive admin bootstrap was never executed; no persistent admin account exists
- Backup tooling has no offsite copy and does not cover `DATA_DIR/objects` (no object store yet)
- Restore refuses a live database using the `-shm` signal; this was verified, but `--force` can
  override it and is only as safe as the operator

## Next action
1. Identify and verify a physically separate backup target; set `BACKUP_DIR`; record the volume evidence.
2. Create the daily Windows Task Scheduler job and observe 3 consecutive unattended runs.
3. Perform the restore drill in `BACKUP.md` §9 against a real `DATA_DIR`, then update `ACCEPTANCE.md`.
4. Only after BK-08..11 pass: revisit remote access. It stays disabled until then.
5. Continue Phase 2 product work (notes CRUD first) with a migration + backup before each schema change.
