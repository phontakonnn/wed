# Progress

## Current phase
- Phase 2 — MVP implementation (partial: SQLite, authentication/session slice, Notes CRUD, T15 trash,
  search, bookmarks, categories/tags, favorites, file storage, encrypted backup/restore including
  objects, key ids and rotation ring, physical-disk probe, preflight, storage reconciliation).
  **The latest state is "Production Remote Access & Background Service" at the end of this file;
  earlier sections are dated history.**
- Phase 1 documentation package completed in this session (see below)
- The user approved Phase 0 and Phase 1. That approval is not evidence that phase exit
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
- Notes CRUD and trash restore now exist and the React client calls the API. Bookmarks,
  categories/tags, file upload/storage, and user-facing search remain unimplemented.
- Interactive admin bootstrap was never executed; no persistent admin account exists
- Backup tooling has no offsite copy and does not cover `DATA_DIR/objects` (no object store yet)
- Restore refuses a live database using the `-shm` signal; this was verified, but `--force` can
  override it and is only as safe as the operator

## Next action
Wait for explicit user approval before implementing the proposed search behavior or migration. T08
is a local research/evaluation slice only. The separate-disk backup, scheduling, real-data
restore-drill, encryption, and remote-access gates remain unresolved; remote access remains disabled.

## Workspace scope audit (2026-10-19)

This is an evidence snapshot and a proposed correction plan only. No feature, dependency, schema,
network, firewall, power, remote-access, or user-data change was made for this audit. The only
workspace edit was appending this section.

### Scope and repository evidence

- The current user instruction confirms the approved product scope is **Personal Knowledge Hub
  (PKH)**, not a restaurant queue system. The checked-in architecture also describes a self-hosted
  Personal Knowledge Hub. No scope-change approval document was found in the enumerated workspace.
- Actual workspace root and `git rev-parse --show-toplevel` result:
  `C:\Users\_phontakonnn\Documents\Wed_Phontakon`.
- `git status --short` returned no entries at audit time. This describes only that observation; it
  does not prove that the repository has always been clean or that every change is committed.
- `MASTER_PROMPT.md` is absent at the workspace root; it was not read. `docs/ACCEPTANCE.md` also
  records it as absent (P1-08).
- `packages/shared` and `tests` exist but contain no files. The only package manifests found outside
  `node_modules` are the root manifest, `apps/server/package.json`, and `apps/web/package.json`.

### Actual package manifests

| Manifest | Name | Scripts | Declared direct dependencies |
| --- | --- | --- | --- |
| `package.json` | `wed-phontakon` | `dev:web`, `build:web`, `dev:server`, `build:server`, `bootstrap:admin`, `backup:create`, `backup:list`, `backup:verify`, `backup:restore`, `lint`, `test` | No direct `dependencies` or `devDependencies`; workspaces are `apps/*` and `packages/*`. |
| `apps/server/package.json` | `server` | `dev`, `build`, `test`, `bootstrap:admin`, `backup:create`, `backup:list`, `backup:verify`, `backup:restore`, `start` | Runtime: `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static`, `better-sqlite3`, `fastify`, `pino`, `pino-pretty`, `sqlite3`. Dev: `@types/node`, `eslint`, `supertest`, `tsx`, `typescript`, `vitest`. |
| `apps/web/package.json` | `web` | `dev`, `build`, `lint`, `preview` | Runtime: `react`, `react-dom`. Dev: `@eslint/js`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `typescript`, `typescript-eslint`, `vite`. |

These entries describe declared packages, not proof that every dependency is imported or used.
The web manifest identifies Vite, not Next.js. Tailwind CSS, Firebase, Google Sheets libraries,
PWA/service-worker tooling, and Playwright are not declared in these manifests.

### Scope discrepancy report

| Area | PKH requirement / checked-in design | Evidence in current code | Discrepancy |
| --- | --- | --- | --- |
| Product | Personal Knowledge Hub, notes/bookmarks/files/search | `apps/web/src/App.tsx` is the Vite starter counter/docs page; server routes in `apps/server/src/index.ts` cover health and authentication/session handling. | PKH product workflows are not implemented. No restaurant queue domain or restaurant routes/schema were found. |
| Web stack | React + TypeScript + Vite + Tailwind CSS | React/Vite are declared in `apps/web/package.json`; `App.tsx` imports `App.css` and `index.css`. | Tailwind is in the design but not declared or used; current UI remains starter code. |
| Server stack | Node.js LTS + Fastify | `apps/server/package.json` declares Fastify and `apps/server/src/index.ts` creates the Fastify app. | Server package declares no `engines` field; exact LTS enforcement is not configured in the manifest. |
| Metadata/search | SQLite + FTS5 | `apps/server/src/database.ts` opens `better-sqlite3`; `apps/server/migrations/001_initial.sql` creates `users` and `sessions`. | No FTS5 virtual table or PKH content schema exists in the migration/source inspected. FTS5 is a design target, not an implemented search feature. |
| Files | Local disk object storage | `docs/ARCHITECTURE.md` describes `DATA_DIR\\objects` and `DATA_DIR\\tmp`. | No object-store/upload/download implementation was found in the server source; this remains documented design. |
| Tests | Vitest + Playwright | `apps/server/package.json` declares Vitest; tests present are `auth.test.ts`, `backup.test.ts`, `database.test.ts`, and `index.test.ts`. | No Playwright dependency or browser test suite was found; `tests` is empty. |
| Remote access | Tailscale only; no Funnel/public port | `apps/server/src/index.ts` binds to `127.0.0.1`; `docs/ACCEPTANCE.md` names Tailscale Serve (not Funnel), no public ports, and keeps the gate blocked. | The design aligns with the restriction, but there is no evidence in this code audit that Tailscale access is configured. `ACCEPTANCE.md` records it as not installed; that document entry was not re-verified against the machine during this audit. |

### Evidence behind the out-of-scope references

- Searches of the enumerated `apps`, `packages`, and `docs` files found no restaurant/queue
  implementation and no Next.js, Firebase, Google Sheets, or PWA implementation/configuration.
- The prior user message in this conversation explicitly mentioned a restaurant queue and described
  Next.js/Firebase/PWA/Google Sheets as the current stack. That message explains why those terms
  appeared in the preceding response; it is not repository evidence and does not override the PKH
  design or the current user's scope confirmation.
- The local `.workbuddy-ai/memory/2026-10-19.md` note documents PKH, Git, backup, and implementation
  audit points; a search of that note found none of the restaurant/queue, Next.js, Firebase, Google
  Sheets, or PWA terms.

### Documentation inconsistencies found

- `docs/ARCHITECTURE.md` proposes the repository path
  `C:\Users\_phontakonnn\Documents\Wed_Phontakon\PKH\app`, but the actual workspace root reported
  by Git is `C:\Users\_phontakonnn\Documents\Wed_Phontakon`.
- `docs/DEPENDENCIES.md` says the workspace has no `.git` directory, while `git rev-parse
  --show-toplevel` succeeds and reports the workspace root. `docs/DECISIONS.md` separately says
  this is an initialized Git repository. The dependency note is stale relative to this audit.
- `docs/ARCHITECTURE.md` lists Tailwind and FTS5 as components/targets, while the manifests and
  initial migration do not implement them.
- `docs/TEST_PLAN.md` documents Vitest coverage only; it does not establish Playwright coverage.
- No restaurant scope-change approval or `MASTER_PROMPT.md` was found in the workspace listing.

### Proposed alignment plan (approval required before implementation)

1. Correct factual drift in `docs/ARCHITECTURE.md` (workspace path; distinguish current components
   from planned PKH features) and `docs/DEPENDENCIES.md` (Git state and stack-package evidence).
2. Update `docs/DECISIONS.md` and `docs/PROGRESS.md` to keep the approved PKH scope, actual
   implemented capabilities, deferred Tailscale-only access, and evidence dates consistent. Preserve
   historical decisions as dated records rather than silently rewriting them.
3. Once documentation is approved, plan PKH implementation work in small reviewed slices: frontend
   PKH shell and API integration; forward-only SQLite migrations for notes/bookmarks/tags; CRUD and
   tests; local filesystem object handling; then FTS5 evaluation/search. No schema or code change is
   authorized by this audit.
4. Reconcile the stated test strategy with actual tooling. Adding Tailwind or Playwright would
   require an explicit dependency/lockfile review; this audit did not install or remove packages.
5. Keep the API loopback-bound and remote access disabled until acceptance gates are met. Any later
   remote-access work must use Tailscale only, never Funnel, and must not expose a public port.

**Hold point:** no edits to architecture/decision documents, manifests, source, migrations, or tests
are included in this audit. Await explicit approval before carrying out the proposed alignment work.

## Notes CRUD implementation update (2026-10-19)

This update follows the user's explicit approval of the proposed PKH alignment plan. It supersedes
the earlier audit's hold point for the listed documentation corrections and Notes CRUD slice only.
No restaurant, Next.js, Firebase, Google Sheets, or PWA work was performed.

### Implemented

- `apps/server/src/database.ts` now discovers `NNN_description.sql` files, requires sequential
  versions, rejects inconsistent/future migration histories, and applies each migration plus its
  version row in one transaction.
- `apps/server/migrations/002_notes.sql` adds owner-scoped Notes, timestamps, retained soft-delete
  state, and an FTS5 title/content table maintained by insert/update/delete triggers.
- `apps/server/src/index.ts` adds authenticated, owner-scoped create/list/detail/update/soft-delete
  routes. List supports bounded page/pageSize pagination. Input validation rejects unknown body
  fields; existing session and CSRF checks remain in force. Existing Fastify static dependency now
  serves the production Vite build when present.
- `apps/web/src/api.ts` calls the real same-origin API with credentials and the CSRF header.
  `apps/web/src/App.tsx` provides login, paginated Notes list, create/detail/edit and soft delete.
  Vite proxies `/api` to `127.0.0.1:3001` for development.
- No dependencies were installed, upgraded, or removed. Tailwind remains absent from the web
  manifest; the UI currently uses CSS. No real `DATA_DIR`, user data, external network, firewall,
  registry, power settings, or remote-access configuration was touched.

### Documentation aligned

- `ARCHITECTURE.md`: corrected actual repository root and separated current functionality from
  planned file features; recorded Tailscale-only/no Funnel/no public port policy.
- `DEPENDENCIES.md`: corrected stale claim that the workspace has no Git repository; noted Tailwind
  is not installed/used.
- `SCHEMA.md`, `API.md`, `BACKUP.md`, `TEST_PLAN.md`, and `ACCEPTANCE.md`: documented migration
  runner, Notes schema/API/soft-delete/FTS behavior, required backup tables and updated tests/status.
- `apps/web/README.md`: replaced the Vite template help with actual development and production
  startup steps.
- `DECISIONS.md`: recorded the implemented Notes slice and remaining gates.

### Verification performed in this workspace

All tests used in-memory or temporary databases. No `DATA_DIR` containing user data was used.

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 4 test files, 30 tests |
| `npm.cmd run build:server` | PASS — TypeScript server build |
| `npm.cmd run lint` | PASS — ESLint |
| `npm.cmd run build:web` | PASS — TypeScript project build and Vite production build |
| `git --no-pager diff --check` | PASS — no whitespace errors; Git emitted only existing LF→CRLF conversion warnings |

Tests cover migration upgrade preservation and rollback, authenticated Notes CRUD, owner isolation,
CSRF rejection, malformed/unknown inputs, pagination, soft-delete retention and FTS trigger
updates, plus unauthenticated Notes denial and public static asset/protected API behavior.

### Remaining gaps / acceptance

- Bookmarks, categories/tags, favorites, file upload/download/object storage, trash listing/restore,
  and user-facing search are not implemented.
- Notes FTS5 indexing exists, but Thai tokenizer quality has not been evaluated and no search API/UI
  exists.
- Tailwind is still missing. No dependency was added without the required dependency approval.
- The Notes UI has no browser automation/visual test; the available Vitest suite tests the API and
  migrations. Vite proxy behavior in a real browser was not manually exercised.
- Backup physical-disk separation, scheduled backup, a real-data restore drill, and backup
  encryption remain unverified/open. Remote access remains disabled and must not use Funnel or a
  public port.
- `MASTER_PROMPT.md` remains absent; no replacement requirements were invented.
- The Node.js LTS target is not enforced by an `engines` field in the server manifest.

### Worktree and rollback notes

At the start of this approved implementation, `git status --short` already contained
`M docs/PROGRESS.md` from the previous audit report. That prior content was preserved; this update
was appended. No commit was created. The implementation changes are currently uncommitted.

To back out this implementation, first save/review `git diff`, then selectively reverse the changes
to the implementation and documentation files listed above. For `docs/PROGRESS.md`, remove only this
“Notes CRUD implementation update” section and retain the pre-existing workspace audit section.
Do not use `git reset --hard` or restore the entire progress file from HEAD, as that would discard
the pre-existing user-visible audit changes.

## T15 Notes trash implementation update (2026-10-19)

### Approval and scope verification

- The user explicitly approved Phase 0 and Phase 1 and authorized this T15 slice only. Approval does
  not establish that either phase passed its acceptance criteria.
- `MASTER_PROMPT.md` is still absent at the workspace root; it was not read or reconstructed. The
  current user message and existing PKH docs were used as the T15 requirements.
- The workspace/source/migration scan found historical mentions of the restaurant-queue/Next.js/
  Firebase/Google Sheets/PWA scope only in the earlier scope-audit narrative in `PROGRESS.md` and
  PKH scope-decision wording in `DECISIONS.md`. These were preserved as historical evidence per the
  user's instruction. No restaurant-system implementation was found in application source or SQL
  migrations. The `yocto-queue` package string in a lockfile is an unrelated transitive dependency.

### T15 implementation

- Added `GET /api/notes/trash` with owner-scoped pagination (default 50, maximum 200), `POST
  /api/notes/:noteId/restore`, and `DELETE /api/notes/:noteId/permanent` requiring `{ "confirm":
  true }`. Permanent deletion only matches notes already soft-deleted and owned by the session.
- All routes use the existing default-deny session preHandler; mutating routes also use its
  Origin/Host/CSRF checks. Schema validation rejects malformed query/ID/confirmation input. Restore
  and permanent delete rely on the existing SQLite FTS triggers; tests assert the FTS row is
  respectively restored and removed.
- Added a Notes/Trash view toggle in the existing page, restore and permanent-delete actions, and a
  Thai confirmation dialog. The 30-day notice is informational; no automatic deletion job exists.
- No migration was needed: `notes.deleted_at` and FTS triggers already provide the required model.
  No tags, categories, or note-relation tables exist; restoring those nonexistent relations is
  **ยังไม่ได้ทดสอบ**.
- No dependency, manifest, lockfile, remote-access, firewall, registry, power, or user-data change
  was made. No commit was created.

### Documentation and verification

- Updated `API.md`, `SCHEMA.md`, `TEST_PLAN.md`, `ACCEPTANCE.md`, `DECISIONS.md`, and this progress
  record to describe T15 and its constraints.
- Final requested verification (2026-10-19):

  | Command | Result |
  | --- | --- |
  | `npm.cmd test` | PASS — 4 test files, 35 tests |
  | `npm.cmd run lint` | PASS — ESLint, no findings |
  | `npm.cmd run build:server` | PASS — TypeScript server build |
  | `npm.cmd run build:web` | PASS — TypeScript project build and Vite production build |
  | `git --no-pager diff --check` | PASS — exit 0; only LF-to-CRLF conversion warnings |

  All tests use in-memory or temporary databases. No browser session or browser automation was run.

### Rollback

Review and selectively reverse only T15 changes in `apps/server/src/index.ts`,
`apps/server/src/index.test.ts`, `apps/web/src/api.ts`, `apps/web/src/App.tsx`,
`apps/web/src/App.css`, and the T15 documentation additions. No migration exists, so no schema
rollback or data transformation is needed. Preserve the previously existing worktree changes and
all prior `PROGRESS.md` history; do not restore this file wholesale from Git.

## T08 Thai search strategy evaluation (2026-10-19)

### Checkpoint and approved commits

- Initial checkpoint `git status --short` and `git --no-pager diff --stat` showed an already-dirty
  worktree from prior uncommitted PKH work; the status/diff were preserved, not reset.
- `git ls-files` pattern scan returned no tracked `.env*`, SQLite/DB, WAL/SHM, uploads, backups, or
  log files/directories.
- The user explicitly approved commits. The existing Git history already contains the backup baseline
  (`b330857`, `2027ee2`), and Notes CRUD + Trash implementation touched shared files, so commits were
  consolidated as authorized by the user:
  1. `2db34b4 Implement PKH Notes and Trash workflows` — source, migration, required backup schema
     verification update, tests, and project docs.
  2. `a8d9d36 Add Thai FTS5 evaluation benchmark` — `tests/thai-search-evaluation.mjs`.
- T08-related documentation was kept with commit 1 because it was mixed with implementation
  documentation; no manual hunk rewriting was used. The benchmark script was kept separate as
  requested. Both commits were made only after the requested test/lint/build commands passed on the
  staged implementation. No secrets/runtime files were found in the tracked list or staged content.
- Immediately after the two commits, `git status --short` was empty. The B2 follow-up measurement
  and its documentation were then committed separately as `3971599 Record Thai short-query
  benchmark`, after `git ls-files`, tracked-path/credential scans, `git diff --cached --check`, and
  a successful rerun of `node tests\thai-search-evaluation.mjs`. No B2 files were left uncommitted.

### Evaluation performed

- Added `tests/thai-search-evaluation.mjs`, a deterministic standalone test/benchmark using only the
  existing server `better-sqlite3` dependency. It creates and removes temporary SQLite files and
  does not read `DATA_DIR`.
- Dataset: 200 synthetic Thai note-like records with 21 predefined substring queries, plus a
  10,000-note synthetic performance corpus. The independent oracle NFC-normalizes and checks
  literal substring presence in title/content. Queries cover partial/middle text, no-space Thai,
  1-/2-/3-code-point cases, nonexistent text, Thai tone/marks, NFC/NFD, mixed Thai/English, numbers,
  and English partial words.
- Runtime checks confirmed `Intl.Segmenter` locale `th` is supported by ICU 78.3 and yields Thai word
  segments. `better-sqlite3` 13.0.3 / SQLite 3.53.4 successfully created an FTS5 trigram tokenizer
  and matched Thai text; two-code-point trigram queries produce no hits.
- Full machine baseline and all measurements, plus the method, result misses and proposed
  implementation migration, are in `DECISIONS.md`.
- B2 full-scan fallback was measured on a separate temporary 10,000-row SQLite corpus. With 9,600
  active notes for the searched owner, 200 owner notes excluded as trashed, and 200 other-owner
  notes excluded, seven short queries (including distinct NFC/NFD text) matched the NFC substring
  oracle exactly. Page size 50; page 1/2/last/beyond-end assertions; 100 warm-up and 100 measured
  rounds per query (700 samples). The initial p50/p95 was 58.29/103.42 ms; the rerun before the B2
  commit was 58.13/171.28 ms. Method, counts, and limitations are in `DECISIONS.md`; T08-07 is
  recorded in `TEST_PLAN.md`.

### Results and proposed decision

- On 200 notes, trigram + hybrid achieved precision/recall 100%/100%; word-only FTS achieved
  100%/78.05% and missed partial terms and compounds including `งบประมา`, `กา`, `น้ำ`, and
  `ก่อนเดินทาง`.
- Under the measured bounded short fallback (latest 1,000 candidates, max 200 returned), 10k
  archive recall was only 9.76% for `ๆ` and 2.02% for `กา`. All tested approaches therefore fail
  the combined 95% requirement when the full-archive short-query cases are included.
- At the time of this checkpoint, the short-query policy and search implementation were awaiting
  user approval. The user subsequently approved trigram for query lengths ≥3 and full-scan NFC
  `instr()` for 1–2 Unicode code points; implementation is recorded below.
- Hybrid remains not recommended because it did not improve 200-note accuracy and had a 62.5%
  larger index, 3.3x build time in this run, and higher write cost.

### Verification

The standalone benchmark command was run successfully with temporary DBs:
`node tests\thai-search-evaluation.mjs` (exit 0; 200-note corpus, 21 query cases, and 10,000-note
benchmark corpus). Final verification on the final diff:

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 4 test files, 35 tests |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript server build |
| `npm.cmd run build:web` | PASS — TypeScript project build and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; LF-to-CRLF warnings only |
| Tracked secret/runtime-data scan | PASS — no tracked `.env*`, DB/SQLite, WAL/SHM, uploads, backups, or logs |

- At the end of the B2 research checkpoint, `git rev-parse --show-toplevel` returned the expected
  workspace root. `git status --short` was dirty with the B2 follow-up before it was committed;
  the then-current diff summary is historical and is not the present search-implementation diff.
- The T08 synthetic DB benchmark was run separately and exited 0. Its latest measured values and
  hardware/runtime baseline are recorded in `DECISIONS.md`; the earlier bounded-short-query variant
  missed full-archive recall and was replaced by the user-approved complete full-scan fallback. No
  production DB or real user data was accessed.

## T08 search implementation

- Added migration `003_notes_search.sql`, which additively creates `notes_fts_trigram`, backfills
  active existing notes as NFC, and maintains the index with insert/update/delete triggers. The
  existing `notes_fts` and its tokenizer remain unchanged. Migration/backfill tests use only
  in-memory databases and include pre-existing active and trashed notes.
- Added authenticated `GET /api/notes/search` with owner and non-trash filters, NFC normalization,
  FTS5 phrase quoting/escaping for queries of at least 3 Unicode code points, and a full-scan
  `instr()` fallback for 1–2 code points. Both branches count results and apply page limits (default
  50, maximum 200); the route is limited to 60 requests per client IP per minute.
- Added a Thai search field and clear button in the existing Notes page only, with a 300 ms debounce,
  loading/empty/error behavior, pagination, and a Thai advisory that 1–2 character queries may
  return broad results. No new page or route was added to the frontend.
- `apps/server/src/search.test.ts` checks 24 query cases against an independent NFC substring oracle,
  plus owner isolation, trash exclusion, authentication, validation, pagination, FTS punctuation,
  NFC/NFD normalization, emoji code-point handling, and the 429 rate limit.
- Full verification on 2026-10-19: `npm.cmd test` — **5 files, 42 passed, 0 failed,
  0 skipped**; `npm.cmd run lint`, `npm.cmd run build:server`, and `npm.cmd run build:web`
  completed successfully. Search rate-limit tests confirm HTTP 429, Thai response body and
  `Retry-After`; 61 anonymous requests do not consume the authenticated caller's limit.
- Repeated HTTP benchmark: three fresh Vitest runs against temporary in-memory SQLite with
  10,000 synthetic rows (9,600 active owner, 200 trashed owner, 200 other owner), temporary
  loopback HTTP ports, session resolution, JSON serialization/read, default page size 50, 10
  warm-up and 40 measured requests per path. Trigram p50/p95 by run: **55.156/56.592**,
  **54.779/57.250**, **55.080/57.033 ms**. Short full-scan p50/p95: **19.131/20.196**,
  **19.080/20.300**, **19.177/21.141 ms**. Means across the three run percentiles: trigram
  **55.005/56.958 ms**, full scan **19.129/20.545 ms**. Population SD: trigram **0.163/0.274 ms**,
  full scan **0.040/0.423 ms**. Full methodology and query-path analysis are in
  `docs/DECISIONS.md`.
- In this benchmark the trigram query (`งบประมาณ`) differs from the short fallback queries
  (`ก`, `กา`). Each path executes a count query and page query and returns 9,600 active owner notes;
  trigram additionally joins the FTS table and matches almost the full active corpus. The result
  does not isolate the benefit on selective queries. Baseline: Windows 10.0.19044, Node 24.22.0,
  ICU 78.3, SQLite 3.53.4, Intel i5-13400F / 16 logical CPUs / 34,055,766,016 bytes RAM. All
  measured p95s were below 300 ms. This is synthetic and not a concurrency or real-data test.
- The UI is **ยังไม่ได้ทดสอบใน browser**. No live `DATA_DIR` database was opened or migrated.
- The browser UI was not tested in a browser. No live `DATA_DIR` database was opened or migrated;
  migration 003 must be preceded by a verified backup when deployed to an existing database.

## T08 additional HTTP selectivity benchmark (2026-10-19)

- Final validation after adding this benchmark: `npm.cmd test` — **5 files, 42 passed, 0 failed,
  0 skipped**; `npm.cmd run lint`, `npm.cmd run build:server`, `npm.cmd run build:web`, and
  `git --no-pager diff --check` all completed successfully.
- Expanded `apps/server/src/search.test.ts` with marker-based cases on the same 10,000-row
  temporary in-memory corpus. Match denominator is 9,600 active owner notes: 100 matches = 1.04%,
  1,000 = 10.42%, and no-hit = 0. Both 3+ code-point trigram and 1–2 code-point production
  full-scan API paths were measured.
- For each long query, a test-only route added to the temporary Fastify app runs the production
  NFC `instr()` count/page SQL under session validation, enabling an exact same-query trigram vs.
  forced full-scan comparison without adding a production endpoint.
- Three measured runs; each query/path had 10 warm-up + 40 measured loopback HTTP requests. All
  expected match counts were asserted. Detailed per-run p50/p95, across-run means and population
  standard deviations are in `docs/DECISIONS.md`. Same-long-query comparison showed p95:
  1% trigram 2.368–3.098 ms vs forced scan 29.372–30.279 ms; 10% trigram 9.444–11.137 ms vs
  forced scan 20.946–23.115 ms; no-hit trigram 0.738–0.928 ms vs forced scan 38.570–39.184 ms.
  Short full-scan API p95 was 29.695–30.569 ms (1%), 21.584–23.302 ms (10%), and 38.977–39.978 ms
  (no-hit). All measured p95s were below 300 ms.
- Search rate limit is configured for 60 requests per `1 minute` per client IP. API test confirms
  requests 1–60 succeed and request 61 returns 429 with `Retry-After`; anonymous requests do not
  consume the authenticated caller's limit. The UI resets its search debounce timer at 300 ms, so
  an ordinary rapid typing burst results in one request after the pause (e.g. 8 keystrokes in 0.8 s
  with gaps below 300 ms = 1 search). Debounce is not a hard ceiling: 61 separate settled searches
  within a minute could still hit 429. Browser behavior and the visible 429 UI state remain
  **ยังไม่ได้ทดสอบใน browser**.
- One pilot run was used to verify the corpus and harness before the three measured repetitions.
  It is reported separately from their mean/SD in `docs/DECISIONS.md`.

## P0 reliability and response-header hardening (2026-10-19)

- Current workspace check before editing: repository root is
  `C:\Users\_phontakonnn\Documents\Wed_Phontakon`, branch `main`, and `git status --short` was
  empty. No user changes were present at that checkpoint.
- Confirmed `MASTER_PROMPT.md` exists and is tracked. Earlier progress/acceptance statements saying
  it was absent describe a prior workspace snapshot and are stale for the current checkout.
- Baseline before this change: `npm.cmd test` — 5 files / 42 passed / 0 failed / 0 skipped;
  lint, server build, and web build all exited 0.
- Found that `@fastify/helmet` was declared/locked but unused and that `/api/health` returned
  `db: ready` without querying SQLite.
- Registered the existing Helmet plugin globally with a self-only CSP, `nosniff`, frame denial,
  restrictive referrer policy, and HSTS disabled for the current HTTP loopback service. No
  dependency or manifest changed.
- Health now executes `SELECT 1`, returns generic 503 when the DB probe fails, and logs the failure
  internally without returning database details. `startServer()` now closes its database through
  Fastify's `onClose` hook and closes the app if listen fails.
- Added API-20/API-21 regression tests for health probe failure and response headers. Focused
  `index.test.ts` run: 21 passed / 0 failed; `npm.cmd run build:server` exited 0. An initial
  assertion expected `X-Frame-Options: DENY`, observed Helmet's default `SAMEORIGIN`, and was
  corrected by explicitly configuring frame denial; the focused retest passed.
- Backup review found `replaceFile()` deleted the destination after any rename error, risking
  destination loss if the retry also failed. It now performs only the rename and leaves the
  destination untouched on failure. Added BKR-01 regression coverage. Backup finalization now also
  removes only artifacts from its own failed attempt if the manifest is not finalized; retention
  pruning failures after a complete backup leave that verified backup in place.
- Updated API, architecture, threat-model, test-plan, acceptance, and dependency documents to
  distinguish implemented headers/health behavior from planned file-storage protections. Browser
  compatibility under the CSP remains **ยังไม่ได้ทดสอบใน browser**.
- Final verification on 2026-10-19:

  | Command | Result |
  | --- | --- |
  | `npm.cmd test` | 5 files, 45 passed, 0 failed, 0 skipped |
  | `npm.cmd run lint` | exit 0 |
  | `npm.cmd run build:server` | exit 0 |
  | `npm.cmd run build:web` | exit 0; Vite production build completed |
  | `git --no-pager diff --check` | exit 0; only LF-to-CRLF warnings |

- No migration, real database, network, firewall, Tailscale, commit, or deployment was touched.

## Pre-migration backup guard (2026-10-19)

- Added an opt-in open path that inspects migration history without applying it. On server startup
  and before administrator bootstrap, a pending migration on an existing database with user rows
  now requires a verified Online Backup API backup. The backup is not pruned; backup failure or
  failed verification aborts before migration.
- `backup:create` now opens an existing DB with migration application disabled, so an operator can
  capture the pre-upgrade schema rather than silently backing up an already-migrated DB.
- Added `MIG-01` and `MIG-02`, both using temporary directories/databases: the earlier-schema
  backup is verified before upgrade and preserves user/note content; an unusable backup directory
  prevents the migration and the existing schema/data/journal mode remain unchanged.
- No migration was run on a real `DATA_DIR`; no user data, packages, network, firewall, Tailscale,
  or remote-access settings were touched. Browser UI is still **ยังไม่ได้ทดสอบใน browser**.
- Full verification after these changes:

  | Command | Result |
  | --- | --- |
  | `npm.cmd test` | 6 files, 47 passed, 0 failed, 0 skipped |
  | `npm.cmd run lint` | exit 0 |
  | `npm.cmd run build:server` | exit 0 |
  | `npm.cmd run build:web` | exit 0; Vite production build completed |
  | `git --no-pager diff --check` | exit 0; LF-to-CRLF warnings only |

- No commit was created. The real-data backup gate remains blocked pending physical-disk separation,
  encryption, scheduling, and a real restore drill.

## PKH CONTINUOUS EXECUTION CHECKPOINT

- **Current Phase:** P0 hardening complete for local code paths; Phase 2/P1 remains partial.
- **Last Completed Task:** Implemented AES-256-GCM backup support and additive, end-to-end
  owner-scoped Bookmarks CRUD.
- **Current In-Progress Task:** None; next work has not started.
- **Next Highest-Priority Task:** Categories and tags CRUD/relations on the existing Notes page,
  including additive migration, owner isolation, tests, and docs.
- **Files Changed:** `apps/server/migrations/004_bookmarks.sql`;
  `apps/server/src/{backup.ts,backup-cli.ts,backup.test.ts,database.ts,database.test.ts,index.ts,index.test.ts,bootstrap-admin.ts,safe-open.ts,safe-open.test.ts}`;
  `apps/web/src/{api.ts,App.tsx,App.css}`; related
  `docs/{ACCEPTANCE,API,ARCHITECTURE,BACKUP,DECISIONS,DEPENDENCIES,MANUAL_UI_CHECKLIST,PROGRESS,SCHEMA,TEST_PLAN,THREAT_MODEL}.md`.
- **Tests Run and Results:** Full suite 6 files / 54 passed / 0 failed / 0 skipped; lint, server build,
  web build, and `git --no-pager diff --check` all exit 0 (2026-10-19).
- **Known Failures:** None in the latest automated run.
- **Blocked Items:** Backup key provisioning/escrow, physical-disk separation, unattended scheduling,
  and real restore drill require operator/machine evidence. Browser UI remains **ยังไม่ได้ทดสอบใน browser**.
- **Remaining Acceptance Criteria:** BK-08..BK-11 remain open/partial; bookmark browser UI remains
  untested; categories/tags, favorites, file-storage and other product acceptance remain incomplete;
  production and remote-access gates remain closed.
- **Real-data caution:** No real `DATA_DIR`/`BACKUP_DIR` was opened, created, backed up, restored, or
  migrated. All database tests use temporary storage. No commit, push, deploy, package install, or
  machine/network configuration change occurred.

## Bookmarks CRUD implementation (2026-10-19)

- Added additive `004_bookmarks.sql`; tests verify upgrade from schema 1–3 preserves Notes data and
  creates the owner foreign key.
- Added owner-scoped, session-protected paginated list and create/read/update/delete API. Server
  validates title, description, URL length and HTTP/HTTPS scheme, rejecting embedded credentials;
  it never fetches bookmark URLs or automatically retrieves metadata.
- Added the Bookmarks editor/view inside the existing authenticated Notes page, with list, pagination,
  loading/error/empty states, edit, open-link-in-new-tab, and confirmed delete. No frontend route or
  dependency was added.
- API integration covers authentication, CSRF, validation, owner isolation and pagination.
  `npm.cmd test` — 6 files, 54 passed, 0 failed, 0 skipped; lint, server build, web build, and
  `git --no-pager diff --check` all exited 0.
- UI visual flow is **ยังไม่ได้ทดสอบใน browser**. Bookmark checklist CH-17 was added to
  `MANUAL_UI_CHECKLIST.md`.
- No production database was opened/migrated and no commit was created.

## PKH CONTINUOUS EXECUTION CHECKPOINT — Categories and Tags

- **Current Phase:** Phase 2 remains partial; no production or remote-access gate is claimed as
  passed.
- **Last Completed Task:** Implemented owner-scoped Categories and Tags CRUD plus Note relations
  (migration 005), same-page React controls, automated migration/API coverage, and related docs.
- **Implementation details:** Added `categories`, `tags`, `note_categories`, and `note_tags` with
  owner foreign keys, case-insensitive per-owner uniqueness, relation ownership triggers, and
  cascading deletion. API routes are authenticated/default-deny, CSRF-protected for mutations,
  validated, paginated (50 default/200 maximum), and transactional when replacing Note relations.
  Trash restore retains existing assignments; deleting a category/tag removes only its relations.
- **Files changed for this task:** `apps/server/migrations/005_categories_tags.sql`;
  `apps/server/src/{backup.ts,database.test.ts,index.ts,index.test.ts}`;
  `apps/web/src/{api.ts,App.tsx,App.css}`;
  `docs/{ACCEPTANCE,API,ARCHITECTURE,DECISIONS,MANUAL_UI_CHECKLIST,PROGRESS,SCHEMA,TEST_PLAN}.md`.
- **Verification actually run:**

  | Command | Result |
  | --- | --- |
  | `npm.cmd test` | 6 test files; 58 passed, 0 failed, 0 skipped |
  | `npm.cmd run lint` | exit 0 |
  | `npm.cmd run build:server` | exit 0 |
  | `npm.cmd run build:web` | exit 0; Vite production build completed |
  | `git --no-pager diff --check` | exit 0; Git emitted only LF-to-CRLF working-copy warnings |
  | Targeted `vitest run src/index.test.ts src/database.test.ts` | 2 files; 37 passed, 0 failed |

- **Browser UI:** Categories/tags visual flow is **ยังไม่ได้ทดสอบใน browser**. CH-18 was added to
  `MANUAL_UI_CHECKLIST.md`.
- **Known remaining scope:** Favorites and file storage are not implemented. Backup/operator
  acceptance gates remain open. No new phase was started.
- **Git/worktree:** No commit, push, or deployment was performed. The worktree already contained
  uncommitted backup/migration-guard and Bookmarks work before this task; those changes were
  preserved. The current worktree remains dirty.
- **Safety:** No dependencies/package manifests were changed; no real database or user data was
  opened; migration tests used temporary/in-memory databases. No network, firewall, Tailscale, or
  remote-access settings were changed.
- **Next task:** No subsequent implementation task was started; Favorites and file-storage work
  remain pending and should follow the approved roadmap and its gates.

## Favorites and file storage checkpoint (2026-10-19)

Continues from the “PKH CONTINUOUS EXECUTION CHECKPOINT — Categories and Tags” entry. No full
audit was restarted and no completed work was redone. The pre-existing dirty worktree (backup
encryption, migration guard, bookmarks, categories/tags and their docs) was preserved; nothing was
committed, pushed, deployed, or reverted.

### Start state

- Branch `main`; `git status --short` showed the same modified files plus untracked
  `004_bookmarks.sql`, `005_categories_tags.sql`, `safe-open.ts`, `safe-open.test.ts` that the
  previous checkpoint recorded. That state was not reset.
- Baseline before editing: 8 test files, 58 passed (previous checkpoint count) with the same
  commands; no new audit was performed.

### Implemented

**Database (additive, forward-only)**

- `apps/server/migrations/006_favorites.sql`: polymorphic `favorites` keyed by
  `(owner_id, item_type, item_id)`, an ownership-checking `BEFORE INSERT` trigger, and
  `AFTER DELETE` cleanup triggers on `notes` and `bookmarks`.
- `apps/server/migrations/007_files.sql`: `files` metadata with owner FK, size/sha256 checks,
  unique `object_key`, and an owner/created index.
- `backup.ts` now requires `favorites` at schema 6 and `files` at schema 7 during verification.

**Backend**

- `apps/server/src/files.ts` (new): display-name decoding/validation (NFC, separators, ADS colon,
  control characters, reserved device basenames, trailing dot/space, 255 UTF-16 limit), magic-byte
  media detection, streaming store with SHA-256 and fsync, free-space reserve, object paths,
  single-range parsing, and RFC 6266 disposition.
- `apps/server/src/index.ts`:
  - `GET/PUT/DELETE /api/favorites...` and `GET /api/favorites/:itemType/:itemId`.
  - `POST /api/files`, `GET/HEAD /api/files/:fileId`, `DELETE /api/files/:fileId`,
    `GET /api/files`.
  - `createApp` accepts `dataDirectory`; `startServer` passes `DATA_DIR`.
  - Raw `application/octet-stream` parser so the body is streamed, never buffered.
- Favorites are owner-scoped, idempotent, and hidden (but retained) while the note is trashed.
  Permanent note deletion, bookmark deletion and user deletion remove favorite rows.

**Security change (documented in `DECISIONS.md`)**

- The global CSRF/origin check now exempts `HEAD` as well as `GET`. HEAD remains default-deny,
  requires a session, and returns headers only. Without this, `HEAD /api/files/:id` returned 403
  before reaching authentication. FILE-12 pins the new behavior.

**Backup / restore for files**

- `createBackup({ ..., dataDirectory })` snapshots `DATA_DIR/objects` to
  `<backup file>.objects` and records `{ directory, fileCount, totalBytes, treeSha256 }`.
- `verifyBackup` checks the snapshot exists, its counts/bytes match, its tree hash matches, and the
  manifest directory is a plain basename.
- `restoreBackup` moves the live object store into `<safety copy>.objects`, records it in the
  safety copy's manifest, then copies the backup's objects into place before replacing the
  database; failures roll back both. A completed restore is undone with one
  `backup:restore -- <safety copy> --yes`.
- Retention removes `<name>.objects` together with its backup. The CLI prints object counts on
  create, list, verify and restore.
- Pre-migration backups (`safe-open.ts`) pass `dataDirectory`, so the pre-upgrade snapshot also
  covers files.

**Frontend**

- `apps/web/src/api.ts`: favorites and files clients, including a raw `fetch` upload that sets
  `X-File-Name`, `X-PKH-Request`, and `application/octet-stream`.
- `apps/web/src/App.tsx` / `App.css`: two new views in the existing page — “รายการโปรด” and
  “ไฟล์” — plus star toggles in the note and bookmark editors, a file upload control, download
  link, metadata panel, and confirmed delete. No new dependency, router, or page.
- Favorites state is keyed by item id so a stale star cannot appear after switching items.

**Tests**

- `apps/server/src/favorites.test.ts` (8 tests): auth/CSRF, idempotency, invalid and other-owner
  targets, owner isolation, trash retention/restore, bookmark subtitles, cascade cleanup,
  pagination and item-type validation.
- `apps/server/src/files.test.ts` (14 tests): storage path and hash, inline vs attachment, HEAD,
  ranges, filename rejection table, NFC/duplicate names, auth/CSRF/size, limit, owner isolation,
  delete, missing object, listing.
- `database.test.ts` gained DB-10 (upgrade v5→v7 preserves rows, trigger behavior, FK).
- `backup.test.ts` gained BK-10..BK-14 (objects captured/restored, tamper detection, complete
  safety-copy rollback, pruning, no-data-directory case) and schema expectations moved to 1–7.
- `safe-open.test.ts` schema expectation moved to 1–7.

### Verification actually run (2026-10-19)

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 8 test files, 86 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript strict compile |
| `npm.cmd run build:web` | PASS — `tsc -b` and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; only LF→CRLF working-copy warnings |

Real HTTP smoke run, all on a `mkdtemp` `DATA_DIR` with a temporary port and a temporary admin:

- `GET /api/health` → 200.
- Upload a 40-byte PNG → 201 with matching SHA-256; object created under
  `objects/30/<uuid>`; no `.part` left.
- Download → 200, `image/png`, `inline`, `nosniff`, byte-identical; `Range: bytes=0-7` → 206 with
  `Content-Range: bytes 0-7/40`; `bytes=999-` → 416 with `bytes */40`.
- Favorite a note → 204; list and status return the note.
- `backup:create` → schema `[1..7]`, 1 object, 40 B; `backup:verify` ok; `backup:list` shows
  `1 file(s)`.
- Delete the live object tree, then `backup:restore --yes` → 1 object restored with the original
  hash, rows `files 1 / favorites 1 / notes 1`.
- Restore the generated safety copy → previous object state returned, proving the safety copy is a
  complete database + files rollback.
- All temporary directories and the temporary seed script were removed afterwards.

No real `DATA_DIR`, `BACKUP_DIR`, user data, database, package manifest, dependency, network,
firewall, Tailscale, registry or power setting was touched.

### Known gaps / blockers (unchanged or new)

- Browser UI for favorites, files, categories/tags and search remains **ยังไม่ได้ทดสอบใน browser**
  (CH-19, CH-20 added to `MANUAL_UI_CHECKLIST.md`).
- No resumable/Tus upload; files above `MAX_UPLOAD_BYTES` (1 GiB default) are rejected.
- No previews/thumbnails, file search, file favoriting, or note↔file attachments.
- No startup orphan reconciliation; orphan objects and missing objects are logged only.
- Object snapshots are not encrypted, and every backup copies the whole object store.
- Backup gate BK-08..BK-11 (separate disk, schedule, real restore drill, key escrow) still open.
- Login throttling remains in-process only.
- `MASTER_PROMPT.md` exists and is tracked; the earlier “absent” statements are historical.

### Rollback

Review `git diff`, then selectively reverse only this task's changes:

- New files: `apps/server/migrations/006_favorites.sql`,
  `apps/server/migrations/007_files.sql`, `apps/server/src/files.ts`,
  `apps/server/src/favorites.test.ts`, `apps/server/src/files.test.ts`.
- Modified: `apps/server/src/index.ts`, `backup.ts`, `backup-cli.ts`, `safe-open.ts`,
  `backup.test.ts`, `database.test.ts`, `safe-open.test.ts`, `apps/web/src/api.ts`,
  `App.tsx`, `App.css`, and the documentation sections appended for this task.
- Schema rollback is not automatic: migrations are forward-only. Restoring a pre-006 backup is the
  supported way to remove the new tables; do not hand-edit `schema_migrations`.
- Preserve all earlier uncommitted work and every earlier section of this file; do not restore
  `PROGRESS.md` wholesale from Git.

## Backup hardening, recovery safety and core verification checkpoint (2026-10-19)

Continues from the “Favorites and file storage checkpoint”. No full audit was restarted, no completed
work was redone, and the pre-existing dirty worktree was preserved. No commit, push, deploy, branch
change, real `DATA_DIR`/`BACKUP_DIR` access, task registration, firewall, service, Tailscale or
machine environment change was made.

### Start state

- Branch `main`; `git status --short` showed the same modified/untracked files recorded by the
  previous checkpoint. Nothing was reset or cleaned.
- Baseline from the previous checkpoint: 10 test files, 86 passed; lint and both builds clean.

### P0 — object snapshot encryption (completed)

- `apps/server/src/backup.ts`: encrypted object snapshots using the existing `PKHBAK01`
  AES-256-GCM envelope, one file at a time, fresh 12-byte IV per file, GCM tag verified.
- Encryption streams live object → cipher → snapshot. No plaintext object copy is written during
  creation or verification (verification decrypts to a hash sink).
- Manifest `objects` now has `formatVersion: 2` and a per-file inventory:
  `{ path, sizeBytes, sha256, storedPath, storedSizeBytes, storedSha256 }`, plus
  `encryption: { algorithm, formatVersion }` when encrypted.
- Verification checks stored size/hash, decrypted plaintext size/hash, duplicate paths, unexpected
  and missing files, counts, totals, tree hash, and the database↔object relation.
- Mixed policies are rejected: an encrypted database with a plaintext object snapshot (or the
  reverse) fails verification. This is the gap the round was opened for.
- Legacy manifests without `formatVersion`/`files` still verify by count/size/tree hash (BK-22).
- `BACKUP_ENCRYPTION_REQUIRED=true` without a key still fails closed before writing anything.

### P0 — restore safety (completed, one real defect found and fixed)

- The restore safety copy now uses the **same encryption policy** as the backup being restored.
  Previously the moved-aside object store was recorded as a plaintext legacy snapshot next to an
  encrypted database, which the new mixed-policy check correctly rejected.
- Restore sequence: verify → DB safety copy → move live objects to `objects.rollback-<stamp>` →
  build an encrypted (or plaintext, matching policy) safety snapshot → materialize backup objects
  into `objects.restore-partial-<stamp>` with per-file verification → rename into place → replace
  database → verify → record the safety manifest → remove the plaintext rollback directory.
- Any failure rolls back objects and database. A completed restore is undone with one
  `backup:restore -- <safety copy> --yes` (plus the key when encrypted).
- Plaintext rollback exists only transiently; it is removed after the safety manifest is durable.
  If that manifest write fails, the plaintext directory is kept and reported.

### P0 — plaintext scratch space

- `mkdtemp` scratch directories are created with mode 0700 and staging files with 0600 where POSIX
  modes apply; on Windows these are best-effort and the per-user temp ACL is the real control.
- Cleanup runs on success, failure and thrown errors.
- This narrows exposure but does **not** survive a power loss or process kill; documented as a
  residual risk rather than claimed as solved.
- Object verification writes no plaintext at all (BK-24).

### P1 — orphan reconciliation (completed as detection + quarantine)

- New `apps/server/src/storage.ts` and `storage-cli.ts`; scripts `storage:check` and
  `storage:quarantine` (root and server).
- `check` is read-only: missing objects, orphan objects, unexpected paths, size mismatches, hash
  mismatches, duplicate object keys, stale vs active `tmp/*.part`; exits 1 on problems.
- `quarantine` is a dry run by default; `--yes` moves orphans and stale temp files into
  `DATA_DIR/quarantine/<stamp>/` with `quarantine.json`. Nothing is deleted. A file that gained a
  metadata row after the scan is skipped. Missing objects and hash mismatches are never modified.
- No startup reconciliation job was added; the operator runs the check.

### P1 — scheduled backup and Windows integration

- `scripts/backup-daily.cmd`: single-instance lock (`backup.lock`, exit 3), log rotation at 5 MiB,
  preflight (exit 4), `backup:create --verify`, optional `BACKUP_KEEP`, documented exit codes
  0/1/2/3/4, no secrets on the command line.
- `scripts/backup-config.example.cmd`: documents `BACKUP_KEEP` and states that the key must be a
  protected environment variable for the task account, never in the file.
- `scripts/register-backup-task.ps1`: warns for a nested destination, missing destination, missing
  key when encryption is required, runs the read-only preflight, and states that physical disk
  separation is NOT VERIFIED. It was **not executed** and no task was registered.
- New `backup:preflight` command and module: same-directory error, nested warning, volume
  comparison, data size, free space, key presence (never the value). Physical disk separation is
  always `NOT VERIFIED`.

### P2 — resumable upload

Evaluated and deferred; `MAX_UPLOAD_BYTES` stays 1 GiB. Rationale in `DECISIONS.md`. No Tus
dependency was added.

### Browser UI

NOT VERIFIED. No Playwright/Puppeteer/driver and no cached Chromium exist. The available
agent-browser skill needs a global npm install plus a ~500 MB Chromium download, which was not
performed. UI verification is limited to the TypeScript build, API tests, and the manual checklist
(CH-01..CH-20). No browser result is claimed.

### Verification actually run (2026-10-19)

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 10 test files, 112 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript strict compile |
| `npm.cmd run build:web` | PASS — `tsc -b` and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; only LF→CRLF working-copy warnings |

New coverage: BK-15..BK-24 (encrypted objects, wrong/missing key, tampered ciphertext, truncation,
manifest mismatch, missing/unexpected files, DB↔object relation, legacy manifest, encrypted safety
copy, no scratch), ST-01..ST-11 (reconciliation and quarantine), PF-01..PF-05 (preflight).

CLI smoke run on a `mkdtemp` `DATA_DIR`, a temporary backup directory, a temporary generated key
(never printed), and synthetic objects only:

- `backup:preflight` → same-volume warning, physical disk `NOT VERIFIED`, exit 0.
- `backup:create --verify` with `BACKUP_ENCRYPTION_REQUIRED=true` → schema `[1..7]`, 1 object,
  `obj crypto: AES-256-GCM`, verified yes; snapshot contains only `<uuid>.enc`.
- `verify` without a key → exit 1; with a wrong key → exit 1 (authentication failed).
- `storage:check` → clean; after adding an orphan object and an aged `.part` → exit 1; quarantine
  dry run left both in place; `--yes` moved both into `quarantine/<stamp>/` and left the valid
  object untouched; check clean again.
- Encrypted restore → object bytes returned; safety copy verified with the key and reported
  `1 file(s), AES-256-GCM`; its snapshot contained only `.enc` files.
- Temporary directories were removed afterwards.

### Acceptance gates

- BK-08 physical disk separation: **NOT VERIFIED** — no machine evidence; preflight only compares
  volumes.
- BK-09 scheduled backup: **NOT VERIFIED** — wrapper and registration script exist and pass static
  review only; no task was registered and no unattended run occurred.
- BK-10 restore drill: **NOT VERIFIED** — synthetic restore tests pass; no real `DATA_DIR` drill.
- BK-11a encryption implementation: **PASS** for database + objects on temporary data.
- BK-11b encryption operations: **NOT VERIFIED** — no real key store, escrow, rotation, or encrypted
  target.

### Remaining risks

- Plaintext SQLite staging can survive a crash/power loss in the OS temp directory.
- Object snapshots are full copies; backup time and space grow linearly.
- No automatic reconciliation at startup; quarantine is operator-triggered.
- Browser UI and CSP behavior are untested.
- Login throttling remains in-process only.

### Git status

No commit, push, deploy, or branch change. The worktree remains dirty with this round's changes plus
all previously uncommitted work.

### Rollback

New files: `apps/server/src/storage.ts`, `storage.ts` tests, `storage-cli.ts`,
`backup-preflight.ts`, `backup-preflight.test.ts`.
Modified: `backup.ts`, `backup-cli.ts`, `backup.test.ts`, `package.json` (root and server),
`scripts/backup-daily.cmd`, `scripts/backup-config.example.cmd`,
`scripts/register-backup-task.ps1`, and the documentation sections appended for this round.
Migrations were not changed in this round. Preserve every earlier uncommitted change and all
earlier sections of this file.

## Final hardening and production-readiness checkpoint (2026-10-19)

Continues from the “Backup hardening, recovery safety and core verification checkpoint”. No full
audit was restarted, no completed work was redone, and the existing dirty worktree was preserved.
No commit, push, deploy, branch change, real `DATA_DIR`/`BACKUP_DIR` access, task registration,
firewall/service/Tailscale change, or machine-level environment change was made.

### Start state

- Branch `main`; `git status --short` showed the same modified/untracked files as the previous
  checkpoint. Nothing was reset or cleaned.
- Baseline: 10 test files, 112 passed; lint and both builds clean.

### P0 — encryption key management

- `backup.ts` now resolves a key ring instead of a single key:
  - `BACKUP_ENCRYPTION_KEY` + optional `BACKUP_ENCRYPTION_KEY_ID` = active key for new backups.
  - `BACKUP_ENCRYPTION_KEY_RING` = optional JSON map of older id → key, used only to decrypt a
    manifest that names that id.
  - `BACKUP_ENCRYPTION_REQUIRED=true` still fails closed, including when only a ring is present.
- Manifests record `encryption.keyId` and `objects.encryption.keyId` (ids only, never key bytes).
  Verification rejects a database/object key-id mismatch and fails with
  `No backup key is configured for key id <id>` when the ring lacks the key.
- Rotation is manual and non-destructive: new key active, old key in the ring, no re-encryption of
  existing backups. Tests cover create-with-id, rotation verify+restore, missing ring entry,
  malformed material/ring, active/id conflict, and no-secret-in-manifest.
- Restore safety copies record the key id that actually encrypted them, which may be an older ring
  key, so a rollback after rotation still works.

### P0 — physical disk verification

- New `backup-disk.ts`: read-only mapping of a path to a physical disk on Windows using
  `Get-Partition -DriveLetter` first and the `Win32_LogicalDiskToPartition` CIM association as a
  fallback (parses `Disk #N`). UNC paths, mount points without a drive letter, non-Windows hosts,
  and query failures return `physicalDisk: null` with a reason.
- `backup:preflight` prints DATA_DIR/BACKUP_DIR volume and disk, SAME/DIFFERENT/UNKNOWN evidence,
  path overlap, free space and encryption configuration. `backup:create` warns on same-disk or
  unknown but does not refuse, because a same-disk backup is still better than none.
- On this host the probe returned UNKNOWN: the Storage cmdlets found no volume for C:, and the CIM
  fallback produced no disk number inside the sandbox. That is reported honestly; **BK-08 remains
  NOT VERIFIED**. No test queries the real partition table; all 11 tests inject a fake runner.

### P1 — scheduled backup verification

- `scripts/backup-daily.cmd` was executed against temporary paths containing spaces:
  - normal run → exit 0, preflight + `create --verify`, backup and log written, lock removed;
  - lock directory present → exit 3, nothing created;
  - `DATA_DIR` unset → exit 2.
- No task was registered and no scheduled/unattended run occurred. **BK-09 remains NOT VERIFIED**;
  only script implementation and one manual smoke run are proven.
- `scripts/register-backup-task.ps1` still runs the read-only preflight and warns about nested
  destinations, missing destinations, and a missing key; it was not executed.

### P1 — plaintext staging risk

- Object creation/verification still writes no plaintext objects.
- Database staging keeps mode 0700/0600 where supported and cleanup on every success/failure path.
- New `backup:staging [--stale-hours N]` lists `pkh-backup-create-*`, `pkh-backup-verify-*`, and
  `pkh-restore-safety-*` directories with age and size. It is read-only and never deletes; 4 tests
  cover detection, filtering, a missing root, and an injected clock.
- Crash/power-loss residue is still possible and is documented as a residual risk.

### P1 — security hardening

- Added a deny-all `Permissions-Policy` (`camera`, `microphone`, `geolocation`, `payment`, `usb`)
  via `onSend`; CSP, `nosniff`, frame denial and referrer policy were already present and are now
  asserted together. HSTS stays off on HTTP loopback.
- Login throttle is bounded at 10,000 keys: expired buckets are dropped first, then the oldest are
  evicted. `clear` and window expiry are covered by unit tests; spoofed `X-Forwarded-For` is proven
  not to split the bucket; malformed login bodies return 400 without touching the throttle.
- Throttling is still per process and resets on restart; multi-process support is not claimed.

### P1 — browser UI

NOT VERIFIED. No Playwright/Puppeteer/driver and no cached Chromium exist, and this round forbids
installing a browser or a large download. Verification remains the TypeScript build, API tests, and
MANUAL_UI_CHECKLIST CH-01..CH-20. No browser result is claimed.

### P2 — performance evidence

One synthetic run on temporary data (300 objects × 4 KiB, local SSD):

| Operation | Time |
| --- | --- |
| Create plaintext snapshot | 1,499 ms |
| Create encrypted snapshot | 4,634 ms |
| Verify encrypted backup | 560 ms |
| Restore encrypted backup | 5,811 ms |

Encrypted backup directory was ~0.7% larger than plaintext (1,666,392 vs 1,654,192 bytes). This is
one run, not a benchmark suite; it supports keeping full snapshots and the 1 GiB upload limit rather
than adding incremental backup or resumable upload now.

### Verification actually run (2026-10-19)

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 13 test files, 145 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript strict compile |
| `npm.cmd run build:web` | PASS — `tsc -b` and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; only LF→CRLF working-copy warnings |

New coverage: KEY-01..KEY-12 (key ring/rotation), DSK-01..DSK-11 (disk probe), STG-01..STG-04
(staging report), API-29/API-30 and TH-01..TH-04 (throttle), plus the `Permissions-Policy` header
assertion. Temporary directories and generated scripts were removed afterwards.

### Acceptance gates

- BK-08 physical disk separation: **NOT VERIFIED** — probe implemented, host returned UNKNOWN.
- BK-09 scheduled backup: **NOT VERIFIED** — wrapper smoke-tested only; no task or unattended run.
- BK-10 restore drill: **NOT VERIFIED** — synthetic encrypted restore/rollback passes; no real drill.
- BK-11a encryption implementation: **PASS** on temporary data (database + objects + rotation).
- BK-11b encryption operations: **NOT VERIFIED** — no real key store, escrow, loss recovery or
  encrypted target.
- Browser UI: **NOT VERIFIED**.

### Remaining risks / blockers

- Physical disk evidence and scheduled execution require the owner and the real backup destination.
- Plaintext SQLite staging can survive a crash/power loss.
- Full object snapshots are O(objects) in time and space.
- No resumable upload; 1 GiB limit remains.
- Login throttle is in-process only and can evict an active bucket under extreme key churn.
- Browser UI/CSP compatibility untested.

### Git status

No commit, push, deploy, or branch change. The worktree remains dirty with this round's changes and
all earlier uncommitted work.

### Rollback

New files: `apps/server/src/backup-keys.test.ts`, `backup-disk.ts`, `backup-disk.test.ts`,
`staging.ts`, `staging.test.ts`.
Modified: `backup.ts`, `backup-cli.ts`, `backup-preflight.ts` (unchanged behaviour, new caller),
`index.ts`, `index.test.ts`, `package.json` (root and server), `docs/{ACCEPTANCE,BACKUP,DECISIONS,PROGRESS,TEST_PLAN,THREAT_MODEL}.md`.
No migrations were changed in this round. Preserve all earlier uncommitted work and every earlier
section of this file.

## Stabilization and acceptance-preparation checkpoint (2026-10-19)

Continues from the “Final hardening and production-readiness checkpoint”. No full audit was
restarted, no completed work was redone, and the existing dirty worktree was preserved. No commit,
push, deploy, branch change, real `DATA_DIR`/`BACKUP_DIR` access, task registration, or machine
configuration change was made.

### Start state

- Branch `main`; the worktree matched the previous checkpoint.
- Baseline: 13 test files, 145 passed; lint and both builds clean.

### P0 — login throttle: a real defect found and fixed

- **Defect:** the 10,000-key bound evicted entries in insertion order, including buckets that were
  already blocked. An attacker could churn distinct account keys and clear a victim's active limit.
- **Fix:** eviction now removes, in order, expired buckets, then zero-failure buckets, then the
  least-progressed unprotected bucket. Blocked or at-limit buckets are never evicted. If every
  tracked bucket is protected, a new key is not tracked; the per-IP bucket remains the enforcement
  point. `delay()` no longer creates entries, so successful logins cannot fill the map.
- **Trade-off recorded:** partial progress (1–4 failures) on an unprotected bucket can still be
  evicted under extreme churn; the blocked state cannot.
- Tests TH-01..TH-08 cover the cap, expiry-first eviction, reset, window expiry, read-without-create,
  blocked survival under 500 churning keys, IP enforcement when full, and least-progressed eviction.
  Spoofed `X-Forwarded-For` and malformed login bodies remain covered.

### P0 — end-to-end backup/restore integration

New `apps/server/src/backup-e2e.test.ts` (3 tests) with synthetic data only:

- E2E-01 creates two owners with notes, bookmarks, categories, tags, note-category and note-tag
  relations, favorites, file metadata and binary objects; takes an encrypted backup; verifies it;
  destroys all rows and objects; restores; and asserts exact counts, content, relation ownership,
  favorite targets, file size/SHA-256 against bytes, and a verifiable safety copy.
- E2E-02 flips a ciphertext byte in a copy of the backup: verification fails, restore throws before
  any live row or object changes.
- E2E-03 holds a second SQLite handle on the live database and restores with `force: true`. Objects
  are swapped, the database rename fails, and the test proves the pre-restore object store and live
  database are intact. The failure is induced through real filesystem behavior, not a test hook.

### P1 — key management runbook

`docs/BACKUP.md` §16 now documents, against the actual implementation:

- key generation, accepted formats, and rejection cases;
- Windows storage options and why the key must not live in `backup-config.cmd`;
- configuration verification through `backup:preflight` without revealing the value;
- offline escrow copies, key-id logging, rotation steps, and safety-copy implications;
- the fact that losing a key without escrow makes those backups unrecoverable.

No key store, secret manager, or real secret was added. Key operations remain **NOT VERIFIED** on a
real machine.

### P1 — staging and scripts

- `backup:staging` remains read-only with a 12-hour stale threshold and never deletes. No automatic
  startup cleanup was added; active operations cannot be proven from directory age alone.
- The scheduled wrapper was not changed this round. Its previous smoke evidence still stands
  (exit 0 with `create --verify`, exit 3 with the lock, exit 2 without `DATA_DIR`, paths containing
  spaces). No task was registered; scheduled execution remains NOT VERIFIED.

### P1 — browser UI

Still NOT VERIFIED: no driver or cached browser exists and installing one is out of scope.
`MANUAL_UI_CHECKLIST.md` gained explicit evidence requirements, automatic failure conditions
(CSP/console errors, refresh mismatch, overflow, byte mismatch, wrong range behavior) and the
desktop/mobile requirement. No UI result is claimed.

### Verification actually run (2026-10-19)

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 14 test files, 152 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript strict compile |
| `npm.cmd run build:web` | PASS — `tsc -b` and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; only LF→CRLF working-copy warnings |

New coverage: E2E-01..03 and TH-05..08. No existing test was deleted or weakened; the one changed
assertion (cleared keys stay absent after a read) documents the new read-without-create behavior.

### Acceptance gates

- BK-08 physical disk separation: **NOT VERIFIED** (probe exists; host returned UNKNOWN).
- BK-09 scheduled backup: **NOT VERIFIED** (script smoke only; no task or unattended run).
- BK-10 restore drill: **NOT VERIFIED** (E2E synthetic restore and rollback pass; no real drill).
- BK-11a encryption implementation: **PASS** on temporary data.
- BK-11b encryption operations: **NOT VERIFIED** (runbook written; no real key store/escrow).
- Browser UI: **NOT VERIFIED**.

### Remaining work that needs the real machine

See `docs/ACCEPTANCE.md` §7 (Owner acceptance checklist): BK-08 disk evidence, BK-09 three
unattended runs, BK-10 restore drill, BK-11b key storage/escrow/rotation, and the browser checklist.

### Git status

No commit, push, deploy, or branch change. The worktree remains dirty with this round's changes and
all earlier uncommitted work.

### Rollback

New file: `apps/server/src/backup-e2e.test.ts`.
Modified: `apps/server/src/index.ts`, `index.test.ts`, `docs/{ACCEPTANCE,BACKUP,DECISIONS,PROGRESS,TEST_PLAN,MANUAL_UI_CHECKLIST}.md`.
No migrations, scripts, or package manifests changed in this round. Preserve all earlier
uncommitted work and every earlier section of this file.

## Owner acceptance pass checkpoint (2026-10-19)

Acceptance phase only: no new audit, no feature work, and no re-run of completed implementation.
One frontend defect was proven and fixed. No commit, push, deploy, branch change, real
`DATA_DIR`/`BACKUP_DIR` access, task registration, or machine configuration change was made.

### Start state

- Branch `main`; worktree unchanged from the stabilization checkpoint.
- No real `DATA_DIR`, `BACKUP_DIR`, or encryption key is configured in the environment
  (`DATA_DIR`, `BACKUP_DIR`, `BACKUP_ENCRYPTION_KEY`, `KEY_ID`, `REQUIRED` all unset).

### BK-08 — physical disk separation: NOT VERIFIED

Read-only inventory (no file content, no writes):

- `Win32_DiskDrive`: exactly one device, Index 0, KINGSTON SNV2S1000G, 3 partitions.
- `Win32_LogicalDisk`: one local volume, `C:`.
- `Win32_LogicalDiskToPartition`: `C:` → `Disk #0, Partition #1`.

The probe script was run directly in a normal PowerShell session and returned `cim:0`, so the
implementation is correct. The CLI child process still returns UNKNOWN under this sandbox. Because
the machine has a single physical disk, there is no separate destination to test, and a second
partition or drive letter would not count. BK-08 stays NOT VERIFIED and requires an external disk.

### BK-11b — key operations: NOT VERIFIED

- No key, key id, or required flag is set. `backup:preflight` with `BACKUP_ENCRYPTION_REQUIRED=true`
  reports `key missing`, exits 1, and prints no secret.
- `backup:create --verify` under the same setting refuses before writing: exit 1, zero files in the
  backup directory. Fail-closed behavior is confirmed on temporary data.
- Rotation is covered synthetically (KEY-07..KEY-10) and the runbook is written, but there is no
  real key store, escrow, loss-recovery evidence, or encrypted target.

### BK-09 — scheduled backup: NOT VERIFIED

Temporary `DATA_DIR`/`BACKUP_DIR` only, paths without spaces this time:

- `scripts/backup-daily.cmd` → exit 0, backup created, `verified: yes`, 3 files (database,
  manifest, object snapshot), log written, lock removed.
- With `logs/backup.lock` present → exit 3, no new backup.
- No task was registered; no unattended run occurred. Script smoke ≠ scheduled execution.

### BK-10 — restore drill: NOT VERIFIED (synthetic only)

- CLI drill on temporary data: deleted one object, ran `backup:restore --yes` → exit 0, 1 object
  restored, SHA-256 identical to the pre-delete value, safety copy created.
- Targeted `backup-e2e.test.ts`: 3/3 pass (full-data restore, tampered-backup rejection,
  mid-restore rollback).
- **Limitation found:** the safety copy of a store that was already inconsistent (a `files` row
  with the object deleted) fails verification with
  `references 1 file(s) but the backup has no object snapshot`, so the CLI cannot roll back to it.
  The check is correct — it reports a pre-existing inconsistency — but the recovery path is manual.
  Documented in `BACKUP.md` §11. No code change.

### Browser UI — one real defect found and fixed

- No automation driver is installed; the installed Chrome was used headlessly with a temporary
  profile and a temporary server on `127.0.0.1:3458`. No browser was installed or downloaded.
- First render: `#root` was empty and the console showed
  `Uncaught TypeError: Cannot read properties of null (reading 'favorited')`.
- Cause: `noteFavoriteState?.id === activeNoteId` is true when both sides are `undefined`; the
  ternary then read `.favorited` on `null`. The same pattern existed for bookmarks.
- Fix: `apps/web/src/App.tsx` now requires a non-null state object before comparing ids. This was
  the only code change in this phase.
- After rebuild: login screen renders (username, password, login button), no console or CSP errors.
- Interactive flows (login, CRUD, favorites, upload/download, Range playback, responsive layout)
  remain NOT VERIFIED; the manual checklist is still required.

### Verification actually run

| Command | Result |
| --- | --- |
| targeted `vitest src/backup-e2e.test.ts` | PASS — 3/3 |
| `npm.cmd test` (after the fix) | PASS — 14 files, 152 passed, 0 failed, 0 skipped |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build:server` | PASS |
| `npm.cmd run build:web` | PASS |
| `git --no-pager diff --check` | PASS — exit 0; LF→CRLF warnings only |

The temporary acceptance directory (database, backups, Chrome profiles) was removed afterwards.

### Gates

BK-08, BK-09, BK-10, BK-11b and interactive Browser UI remain **NOT VERIFIED**. BK-11a remains PASS
on synthetic data. No gate was moved to PASS without machine evidence.

### Remaining owner actions

`docs/ACCEPTANCE.md` §7: external disk for BK-08, three unattended runs for BK-09, a real restore
drill for BK-10, real key storage/escrow/rotation for BK-11b, and CH-01..CH-20 in a real browser.

### Git status

No commit, push, deploy, or branch change. The worktree remains dirty with this phase's frontend fix
and all earlier uncommitted work.

## Browser acceptance checkpoint (2026-10-20)

Acceptance testing only; no source file changed in this pass. The installed Chrome was driven over
the DevTools Protocol with a temporary profile and a temporary `DATA_DIR`; no browser or driver was
installed and no real data was opened.

### CH-01..CH-20 — PASS in Chrome

Environment: Chrome `155.0.8059.85`, URL `http://127.0.0.1:3459/`, viewports 1366×768 and 390×844,
synthetic administrator and synthetic notes/bookmarks/files only.

| Group | Items | Result | Key evidence |
| --- | --- | --- | --- |
| Authentication | CH-01, CH-02, CH-16 | PASS | Login view only when signed out; empty submit never reached the API; wrong password showed the generic alert; correct login opened Notes; logout + reload returned 401 and the login view |
| Notes | CH-03..CH-12 | PASS | Create/read/update persisted across a full reload; short and 3+ code-point search; no-hit empty state; trash/restore/permanent-delete dialog and 204; deleted note absent from API search |
| Search behaviour | CH-13, CH-14 | PASS | Debounce produced one settled request; probe `accepted:60, lastStatus:429`; UI showed the Thai rate-limit message and recovered after the window |
| Responsive | CH-15 | PASS | `scrollWidth === innerWidth` at both viewports, `offenders: []`; dialog inside the viewport; screenshots `ch15-*.png` |
| Bookmarks | CH-17 | PASS | Create/edit/delete persisted; `javascript:` rejected; zero outbound requests away from loopback during save/list |
| Categories/tags | CH-18 | PASS | Assignment survived reload; deleting one item removed only its relation; 404/400 surfaced in the UI |
| Favorites | CH-19 | PASS | Note and bookmark star state survived reload; “เปิดรายการ” switched to the correct view; removal updated list and star |
| Files | CH-20 | PASS | PNG/TXT/HTML upload; download SHA-256 matched source; PNG `inline`, HTML `attachment`; Range `206` (`bytes 0-9/70`, `65-69/70`) and `416 bytes */70`; oversize rejected; unauthenticated context got 401 on me/notes/upload |

Evidence: `.tmp-acceptance-20261020/evidence/` contains `s1..s5` result JSON and logs plus
`ch01-login-desktop.png` and `ch15-*.png`. Console scans found no uncaught errors, CSP violations or
failed requests. No credential, cookie value or private note content is present; the only cookie
mention is the jar label `pkh_session@127.0.0.1`.

### Browser gate status

CH-01..CH-20 PASS in Chrome, but **Brave was NOT EXECUTED** and no human usability walkthrough or
video-element Range playback was performed. The browser gate therefore stays **PARTIAL**, not
closed; `ACCEPTANCE.md` PR-09 records the same limitation.

### Cleanup

- The test servers on 3001/3459 were stopped; neither port listens any more.
- Synthetic `data/`, `backup/`, `harness/` and the temporary bootstrap helper were removed.
- `evidence/` was kept as acceptance evidence (15 files, tree SHA-256
  `b75471b56c1a4ede6e3adc5df2733bea912e7c6187dd7c146f84c50c4397977d`). The Chrome `profile/`
  (17 MB, 242 files) remains because both the original bulk delete and a later targeted delete were
  declined.
- **Cleanup is now halted permanently by the owner rule that nothing under the workspace may be
  deleted.** The remaining test root, profile and evidence are all inside
  `C://Users//_phontakonnn//Documents//Wed_Phontakon`, so no further deletion was attempted. The
  owner can remove or relocate the profile outside the workspace if desired; evidence stays as the
  acceptance record.

### Gates

- BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED** (unchanged; need the real machine/disk/task/key
  store).
- BK-11a: **PASS** on synthetic data.
- Browser UI: **PARTIAL** (Chrome PASS, Brave not executed).

### Verification

No source change in this pass, so no build or full suite was re-run. Last recorded suite result:
14 files / 152 passed; lint and both builds pass. Browser results above are from the actual Chrome
run, not from build success.

### Git status

No commit, push, deploy, or branch change. The worktree remains dirty with all earlier uncommitted
work.

## Restore-drill safety documentation checkpoint (2026-10-20)

Documentation-only change; no source code, tests, or real data were touched.

- **Risk found in the previous guide:** `backup:restore` has no `--target`/`--into` argument; it
  always restores into `<DATA_DIR>/db/knowledge.sqlite3` and `<DATA_DIR>/objects`. The old §7.3 set
  `DATA_DIR='C:/PKH-data'` (the live path) before running the restore, so following it would have
  overwritten the live system after taking a safety copy.
- `docs/ACCEPTANCE.md` §7.3 now requires a recovery root outside the live `DATA_DIR`, asserts the
  resolved absolute paths, refuses a target equal to or inside the live path, restores with
  `DATA_DIR` pointed at the recovery copy, and verifies with `storage:check`,
  `backup:create --verify`, a separate server instance for relationships/files, and the printed
  safety copy. `--force` is explicitly forbidden for a drill.
- `docs/BACKUP.md` §8 now states the target rule at the top; §9 replaces "repeat on the real
  `DATA_DIR`" with the isolated recovery-target drill and its post-checks; §10's gate wording was
  aligned to "real backup data in an isolated recovery target, live `DATA_DIR` untouched".
- BK-10 remains **NOT VERIFIED**: no safe recovery environment or real drill was executed. The gate
  wording changed only to remove the unsafe instruction; it was not moved to PASS.

## Life OS checkpoint (2026-10-20)

Scope: the "Personal Knowledge & Life OS" upgrade — people/CRM, reminders, daily timeblocks,
habits, a five-theme studio, a profile card, focus mode and a Ctrl+K command palette — while keeping
auth, CSRF, Thai trigram search and the AES-256-GCM backup path unchanged.

### What was added

- `apps/server/migrations/008_life_os_people_and_schedule.sql` — `people`, `note_people`,
  `reminders`, `life_timeblocks`, `habits`, their indexes, and six owner-mismatch triggers. See
  `SCHEMA.md` §11.
- `apps/server/src/life-os.ts` — 21 routes under `/api/people`, `/api/reminders`, `/api/timeblocks`,
  `/api/habits` and `/api/search`. See `API.md` §12.
- `apps/server/src/index.ts` — registers the routes and extends the note taxonomy response/update
  with `people` / `personIds`.
- `apps/server/src/backup.ts` — `requiredTablesForSchema(8)` now also demands the five Life OS
  tables, so `backup:verify` fails on a backup that is missing them.
- `apps/web/src/App.tsx`, `App.css`, `api.ts` — three-column shell kept, plus people panel, schedule
  panel, bell popover, theme studio, profile modal, command palette, focus mode and mobile drawer
  behaviour.
- `apps/server/src/life-os.test.ts` (9 tests), extended `backup-e2e.test.ts` and
  `database.test.ts` (schema 1–8, Life OS triggers, Life OS rows through a full restore).

### Defect found and fixed during browser verification

`switchView()` set `scheduleBusy = true` (and `peopleBusy = true`) when entering those views, but
nothing fetched on view change, so no code path ever cleared the flag. Every "เพิ่ม" button in the
schedule panel rendered `disabled`, which made reminders, timeblocks and habits impossible to create
from a fresh session. The two lines were removed; the flags are now only set by operations that
actually have an in-flight request. This was caught by the automated browser run, not by the unit
tests or the build.

### Verification actually run

- `npm test` — **15 files / 161 tests passed** (was 14 / 152).
- `npm run lint` — clean.
- `npm run build:server` — clean; `npm run build:web` — clean
  (`index-*.css` 31.69 kB, `index-*.js` 312.96 kB).
- `git diff --check` — clean (only CRLF conversion warnings).
- Browser acceptance against the production build served by Fastify on a throwaway `DATA_DIR`,
  driven over CDP in Chrome: **26 / 26 checks PASS** on a clean instance
  (`.tmp-acceptance-20261020/lifeos-evidence/lifeos-ui-result.json`). Coverage: login, 3-column
  metrics, person create with all CRM fields, avatar preset, reminder-for-person, bell badge,
  timeblock + toggle, habit +1 (0→2 of 8), Ctrl+K search on a person's allergy text, command
  navigation, all five themes with distinct `--green` values, dark mode contrast, profile modal,
  note-person chip, focus mode, 1280/768/390 layout, mobile drawer → list → full-screen detail →
  back, CSP/security headers, and reload persistence.

Measured layout: no horizontal overflow at 1920/1280/768/390; `button` heights never below 40 px at
any width; detail panel 1340 px at 1920 and full-width 390 px on mobile.

### Known deviations (not fixed, deliberately reported)

- **UI-D1 — auxiliary text below 14 px.** Primary content (inputs, textareas, note body) is 15 px and
  body copy 14 px, but decorative and meta labels remain smaller: `.eyebrow` 10 px,
  `.notification-badge` 10 px, profile status/meta 11 px, `.nav-count` 11 px, `.account-label` 13 px,
  the logout button label 13 px. The 14 px rule is therefore met for content and not for chrome.
  Raising these would need a sidebar/typography pass and was not attempted inside this checkpoint.
- **UI-D2 — profile and theme live in `localStorage`.** `pkh.profile`, `pkh.theme` and
  `pkh.themeMode` are browser-local. They are not stored server-side, not part of a backup, and do
  not follow the account to another device. Only `people.avatar_file_id` uploads are server-side.
- **API-D1 — habit streaks are timezone-naive.** `last_checked_date` is compared as an ISO string
  built from the server clock, so a check near midnight can land on the neighbouring day.
- **API-D2 — no scheduler.** Reminders surface through `/api/reminders/upcoming` when a page loads;
  there is no background job, no e-mail and no push notification.

### Gates (unchanged)

- BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED** — still require the real machine, a second physical
  disk, a registered scheduled task and a real key store.
- BK-11a: **PASS** on synthetic data.
- Browser UI: **PARTIAL** — Chrome passes the full run above; Brave was not executed.

### Git status

No commit, push, deploy or branch change. The worktree is still dirty with all earlier uncommitted
work, and `.tmp-acceptance-20261020/` (evidence, Chrome profile, throwaway data directories) is
untracked and must be excluded from any future commit.

## Work core checkpoint (2026-10-20)

Scope: the first implementation batch of the "Second Brain" brief — gap analysis, product spec, data
model, then the work core (inbox, tasks, projects, goals) with schema, API, UI and tests.

### Documents created

- `docs/FEATURE_GAP_ANALYSIS.md` — modules A–P with EXISTS / PARTIAL / MISSING per module, the
  evidence for each claim, four decisions that must not be guessed (D-1 live-data encryption for
  Vault, D-2 password-manager scope, D-3 Markdown renderer, D-4 import format), and the batch order.
- `docs/PRODUCT_SPEC.md` — target behaviour per module, including what is explicitly not built.
- `docs/DATA_MODEL.md` — principles, existing entities, the new tables, proposed-but-not-migrated
  tables, backup impact, and the owner-boundary test matrix.

### Added

- `apps/server/migrations/009_work_core.sql` — `goals`, `projects`, `tasks`, `task_checklist_items`,
  `inbox_items`, five indexes, nine owner-mismatch triggers. See `SCHEMA.md` §12.
- `apps/server/src/work.ts` — 24 routes for inbox (5), tasks (6), checklist (3), projects (6),
  goals (4). See `API.md` §13.
- `apps/server/src/index.ts` — registers the work routes.
- `apps/server/src/life-os.ts` — `/api/search` now also returns `tasks`, `projects` and `goals`
  instead of adding a second search endpoint.
- `apps/server/src/backup.ts` — `requiredTablesForSchema(9)`.
- `apps/web/src/api.ts` — 21 client functions and the matching types.
- `apps/web/src/App.tsx` — four new views (กล่องขาเข้า / งานที่ต้องทำ / โปรเจกต์ / เป้าหมาย) with
  capture, triage, filters, recurrence, progress and delete; `App.css` gained the work-core block.

### Tests

- New `apps/server/src/work.test.ts` — 12 tests covering inbox capture/convert/duplicate-rejection,
  task CRUD and filters, recurrence (weekly and month-end clamp), checklist, project counts,
  goal progress null-vs-percentage, cross-owner 404/400, and unified Thai search.
- `database.test.ts` — schema now 1–9, plus trigger and cascade assertions for the new tables.
- `backup-e2e.test.ts` — seeds goals/projects/tasks/checklist/inbox, destroys `DATA_DIR`, restores,
  and asserts the rows and the `tasks` → project/goal/person relations.
- `safe-open.test.ts`, `backup.test.ts` — schema-version expectations updated to 9.

### Defects found and fixed while building

- **Date fields collapsed three states into two.** The first version of the work routes used one
  helper that returned `undefined` both for "field absent" and "invalid", so any POST without a due
  date was rejected with 400 and any PATCH could silently wipe a date. Replaced with an explicit
  `parseDateField()` returning `absent | clear | set | invalid`; 14 failing tests went green.
- **Duplicate search endpoint.** A `/api/work/search` route was written before noticing the existing
  `/api/search`; it was removed and the original endpoint extended instead.
- **Action buttons below the 40 px rule.** `.work-actions .text-button` was 32 px, which the browser
  probe caught at 1280 (3 buttons under 40 px). Raised to 40 px, 44 px on touch widths; the re-probe
  reports 0 at 1920/1280/768/390 for all four new views.

### Verification actually run

- `npm test` — **16 files / 176 tests passed** (was 15 / 161).
- `npm run lint` — clean. `npm run build:server` — clean.
  `npm run build:web` — clean (CSS 33.27 kB, JS 337.33 kB).
- `git diff --check` — clean (CRLF notices only).
- Browser smoke test (Chrome over CDP, production build on a throwaway `DATA_DIR`):
  **13 / 13 PASS** — inbox capture, convert to task, task created from the inbox item, second task
  with due date + weekly recurrence, recurrence roll-forward on completion, done filter, project
  creation, goal creation and `0/24 → 2/24 · 8 %`, reload persistence, and no horizontal overflow at
  1280/768/390. Evidence in `.tmp-acceptance-20261020/work-evidence/`.
- Follow-up probe across all four new views × four widths: no overflow, `smallButtons: 0` everywhere.

### Still missing from the brief (unchanged by this batch)

Dashboard (A), habit day history (H), reminder recurrence and snooze (G), file↔entity links (L),
Library (K), Review (N), Import/Export (O), Settings screen (P), Vault (J — blocked on D-1).

### Gates (unchanged)

BK-08, BK-09, BK-10, BK-11b remain **NOT VERIFIED**. Browser UI remains **PARTIAL** (Chrome only).

### Git status

No commit, push, deploy or branch change. The worktree is dirty with every earlier batch plus this
one; `.tmp-acceptance-20261020/` is untracked and must stay out of any commit.

## Batch 1 closure review + Batch 2 checkpoint (2026-10-20)

### Batch 1 closure review — result: PASS with one gap closed

Reviewed only the files this batch touched, plus the specific behaviours the owner listed.

| Item | Result | Evidence |
| --- | --- | --- |
| Migration 009: 5 tables, FKs, CHECKs, 9 owner triggers | PASS | `009_work_core.sql`; `database.test.ts` DB-12 |
| Migration from **schema 8** on a real data directory | PASS (**new test**) | `safe-open.test.ts` "upgrades a schema-8 data directory to 9": builds a schema-8 `DATA_DIR` with notes/people/reminders/habits, verifies the pre-migration backup manifest is `[1..8]`, then asserts every old row plus the new tables. The log line alone was **not** treated as evidence |
| Inbox conversion + 409 on re-convert + no partial state | PASS | `work.test.ts` WRK-03, WRK-05 |
| Tasks / Projects / Goals ownership, recurrence, month-end, goal percentage | PASS | `work.test.ts` WRK-06…14 |
| Search reuses the existing endpoint | PASS | no `/api/work/search` route exists; `/api/search` extended in `life-os.ts` |
| Backup: `requiredTablesForSchema(9)` + E2E rows and relations | PASS | `backup.test.ts`, `backup-e2e.test.ts` |
| UI: capture → convert → task, recurrence, project, goal, reload, responsive | PASS | earlier 13/13 Chrome run + button probe (4 views × 4 widths, 0 small buttons) |

Targeted re-run for this review: `work.test.ts` + `database.test.ts` + `backup-e2e.test.ts` = 28 tests,
plus the new schema-8 test. The full suite was **not** re-run at that point because nothing else had
changed.

**Documentation defect found and fixed:** `TEST_PLAN.md` claimed `work.test.ts` had 12 tests; it has
15. Corrected, and the three missing rows were added.

### Batch 2 — what was built

- `GET /api/dashboard` in `apps/server/src/dashboard.ts` — one owner-scoped aggregate; reuses the
  select fragments exported from `work.ts` / `life-os.ts` instead of copying SQL.
- `apps/server/src/dashboard.test.ts` — 7 tests (session, empty account, owner isolation, today's
  timeblocks, goal percentage honesty, outstanding habits, projects + recent notes).
- `apps/web`:
  - **Dashboard view** as the landing page: 8 widgets (today's tasks, overdue, reminders, today's
    blocks with a real progress bar, active projects with `taskDone/taskTotal`, goals with a
    percentage only when a target exists, outstanding habits, inbox, recent notes). Every widget has
    its own empty line so a quiet day never looks like a broken system.
  - **Autosave** for existing notes: `idle → saving → saved | error`, 1.2 s debounce, dirty check so
    an unchanged note is never written, an in-flight queue so a slow request can never overwrite
    newer text, flush-on-switch so changing notes does not lose typing, and a retry button on error.
    New notes still require the explicit save button, so autosave cannot spawn empty notes.
  - **Toasts** for save / convert / task / project / goal actions, with `role=status` for success and
    `role=alert` for failure, a 40 px close button, and no personal content in the message.
  - `prefers-reduced-motion` global rule.

### Verification actually run

- `npm test` — **17 files / 184 tests passed** (was 16 / 176).
- `npm run lint` — clean (0 problems).
- `npm run build:server` — clean. `npm run build:web` — clean (CSS 36.00 kB, JS 350.47 kB).
- Browser acceptance (Chrome over CDP, production build, throwaway `DATA_DIR`):
  **12 / 12 PASS** — dashboard is the landing view with 8 widgets, DOM counts equal the API counts,
  a goal with a target shows `6/24 · 25 %` while a goal without one shows "ยังไม่มีตัวชี้วัด",
  a task toast appears with `role=status`, autosave reaches "บันทึกแล้ว" and the text survives a
  reload, the dashboard reflects the new task, no overflow and 0 small buttons at 1280/768/390, the
  reduced-motion rule is present, and the console has no errors beyond the expected startup 401.
  Evidence: `.tmp-acceptance-20261020/b2-evidence/`.

### Bugs found and fixed while building

- **Lint error `react-hooks/set-state-in-effect`** — the dashboard effect set its busy flag
  synchronously. Moved the busy flag to the explicit refresh handler; the effect now only writes
  state from the promise callbacks.
- **Seeding artifact, not an app bug** — Thai text sent through the Windows shell/curl arrived as
  `?` because of console code-page mangling. The app stores Thai correctly (browser-created Thai was
  verified in the earlier run). Seeding now goes through Node's UTF-8 fetch.
- **Two test-expectation errors** caught by the run itself: a goal *with* a target correctly showed
  25 %, and a task without a due date correctly did not change "due today". Both expectations were
  corrected, not the app.

### Risks and remaining work

- Dashboard is read-only and refreshes on demand; there is no live polling, so two open tabs can
  drift until one of them reloads.
- Autosave covers the note body and title only — categories, tags and person links still save with
  the explicit button.
- Still missing: habit history, reminder recurrence/snooze, file links, Library, Review,
  Import/Export, Settings screen. Vault remains blocked on D-1.

### Gates

BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED**. Browser UI: **PARTIAL** (Chrome only).

### Git status

No commit, push, deploy or branch change. `.tmp-acceptance-20261020/` untouched and untracked.

## Batch 3 checkpoint — habit history + reminder recurrence/snooze (2026-10-20)

### Migration 010

`010_habit_logs_and_reminder_recurrence.sql` — additive only.

- New table `habit_logs` with `UNIQUE (habit_id, log_date)`, two indexes, and owner triggers.
- `habits` gains `tracking_start_date`, `legacy_current_count`, `legacy_streak_days`.
- `reminders` gains `recurrence`, `recurrence_anchor_date`, `snoozed_until`, `last_completed_at`.

### How the old habit data was handled

`current_count` and `streak_days` are now derived from logs. The pre-migration numbers are copied to
`legacy_*` and shown separately as unverifiable. The migration writes **no** log for a past day and
never derives a log from `streak_days`; the single conversion it performs is today's counter, and only
when `last_checked_date` is today. Consequences and the full rationale are in `DATA_MODEL.md` §7.

### Streak and tracking start

A day counts when its log reaches that day's `target_snapshot`. An unfinished today does not break the
streak. A day with no log is not counted and is not treated as a failure. `tracking_start_date` marks
where verifiable history begins; earlier days return `null`, not `0`, and logging them is refused.

### Recurrence and snooze rules

Completion rolls the same row forward (no duplicate rows), monthly/yearly keep the anchor day
(31 Jan → 28 Feb → 31 Mar; 29 Feb → 28 Feb → 29 Feb). Snooze moves `snoozed_until` only, is rejected
with 409 when the client's `from` is stale, and is cleared when the reminder is completed. The
effective date drives `upcoming` and the dashboard.

### Shared time source

`apps/server/src/dates.ts` is now the only place that knows what "today" is. `life-os.ts`, `work.ts`
and `dashboard.ts` all import it, which closes API-D1 (UTC vs local disagreement).

### Verification actually run

- `npm test` — **19 files / 209 tests passed** (was 17 / 184).
- `npm run lint` — clean. `npm run build:server` — clean.
  `npm run build:web` — clean (CSS 36.90 kB, JS 354.61 kB).
- `git diff --check` — clean.
- Browser acceptance (Chrome over CDP, production build, throwaway `DATA_DIR`):
  **11 / 11 PASS** — dashboard habit week summary from logs, 7 history dots where six past days are
  correctly "untracked" and today is partial, correcting today recalculates to 0/8, reminder shows
  `↻ weekly`, `+3 วัน` moves to `2026-10-23 (เดิม 2026-10-20)`, completing it rolls to `2026-10-27`
  with the snooze cleared, the API agrees, no overflow and 0 small buttons at 1280/768/390, and no
  console errors.
  Evidence: `.tmp-acceptance-20261020/b3-evidence/`.

### Console 401 from Batch 2 — closed as expected behaviour

The only 401 is `GET /api/auth/me` on first load, before any session exists. Verified directly:
`401` with `content-type: application/json`, body `{"error":"กรุณาเข้าสู่ระบบ"}`, and **no**
`Set-Cookie` and no account data. The client maps it to `signed-out` (`App.tsx` boot effect), shows no
error to the user, and renders the login screen. The browser's own network log cannot be suppressed
from JavaScript, so the entry stays in the console. No error handling was removed to hide it.

### Bugs found and fixed

- **`upcoming` ignored snooze.** The route still filtered on `target_date`, so a snoozed reminder kept
  appearing in the short window. Caught by REM-12; fixed to use `COALESCE(snoozed_until, target_date)`.
- **Past days were unreachable.** Logging a date before `tracking_start_date` is refused, which is
  correct, but it meant the first version of the habit tests could not exercise corrections. The tests
  now backdate the habit, which models an older habit instead of weakening the rule.
- **A pre-existing test checked a habit into tomorrow.** Future logging is now 400 by design; the test
  was updated to assert the new contract (cap reached → no rewrite; future → 400) rather than being
  deleted.

### Risks and remaining work

- Habit history is per-day counts; there is no partial-credit rule beyond `count >= target_snapshot`.
- Reminder recurrence has no "skip this occurrence" action, only complete and snooze.
- Still missing: file↔entity links, Library, Review, Import/Export, Settings screen, month view.
- Vault remains blocked on D-1.

### Gates

BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED**. Browser UI: **PARTIAL** (Chrome only).

### Git status

No commit, push, deploy or branch change. `.tmp-acceptance-20261020/` untouched.

## Batch 4 completion — entity files + search filters (2026-10-20)

**Status: COMPLETE (backend + UI + Chrome acceptance).** Backend and frontend UI for entity
attachments and search filter controls are both implemented without adding duplicate endpoints or
prematurely exposing Vault/Library in Batch 4. A clean-instance Chrome acceptance run on 2026-10-20
passed **33/33** checks against a throwaway `DATA_DIR`.

### Delivered

- Migration `011_entity_files.sql` — `entity_files` with a per-type trigger set, immutability guard,
  entity-delete cleanup and file cascade.
- `apps/server/src/file-links.ts` — 3 routes (`GET`/`POST`/`DELETE` under
  `/api/entities/:entityType/:entityId/files`). Linking is idempotent; unlinking never deletes bytes.
- `/api/search` extended in place with `types`, `from`, `to` (with SQL-level date predicates applied
  before `LIMIT`); bookmarks and files added as result buckets. No second search endpoint was created.
- `requiredTablesForSchema(11)`; E2E seeds a link, restores, and asserts the relation plus the file
  bytes.
- `file-links.test.ts` — 15 tests (7 link, 8 search including date filtering before `LIMIT`).
- `apps/web/src/api.ts` — `SearchBucketType`, `AttachmentEntityType`, `EntityLinkedFile`, extended
  `SearchResults` (`bookmarks`, `files`), extended `searchAll(q, options)` (`types`, `from`, `to`), and
  added `listEntityFiles`, `linkEntityFile`, and `unlinkEntityFile`.
- `apps/web/src/App.tsx` & `apps/web/src/App.css` —
  - Shared `EntityAttachments` component wired into `Notes`, `Tasks`, `Projects`, `People`, and
    `Bookmarks` (supports attaching existing files from storage, uploading & linking in one step,
    downloading via `/api/files/:id`, and unlinking without deleting file bytes).
  - Command Palette (`Ctrl+K`) search filter controls wired to `/api/search` with 8-type multi-select
    chips (`notes`, `tasks`, `projects`, `goals`, `people`, `reminders`, `bookmarks`, `files`),
    `from`/`to` date inputs, `ล้างตัวกรอง` reset button, invalid date range (`from > to`) error banner,
    empty state across all 8 buckets, and navigation across all 8 result types.

### Deferred to Batch 5 (by design)

- **Library entries** — requires the Batch 5 `notes.kind` migration before `reference` filtering can
  be enabled.
- **Vault/assets** — remains blocked on D-1 and intentionally hidden from Batch 4 UI.

### Verification

- Backend test suite: **20 files / 224 tests** (`file-links.test.ts` includes pre-`LIMIT` SQL date
  filter regression test — the date predicate is applied inside SQL before `LIMIT`, so a narrow range
  is not starved by newer rows outside it).
- Frontend incremental patch verified for strict TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`,
  `noUnusedParameters`), `react-hooks` flat recommended rules (no synchronous `setState` in `useEffect`),
  40px minimum button hit targets, and responsive layout (`1280px` / `768px` / `390px`).
- Gates re-run on 2026-10-20: `npm test` 224/224, `npm run lint` clean, `npm run build:server` clean,
  `npm run build:web` clean, `git diff --check` clean.

### Browser acceptance (2026-10-20, clean instance)

Evidence: `.tmp-acceptance-20261020/b4-evidence/` (new folder; nothing existing was modified).
Server ran on port 3494 with throwaway `b4-data` / `b4-backups`; 19 screenshots, `b4-ui-result.json`,
`seed-manifest.json`, `db-links.json`, `server.log`. **33/33 PASS.**

- Attachments (5 modules): note attach-from-library → download link points at `/api/files/:id` →
  unlink leaves the file in storage → upload-and-attach creates a new file and links it; task,
  project, person, bookmark each attach successfully; the task link survives a full page reload and
  is confirmed through the API.
- Search filters: 8 chips present and all selected by default (`8/8`), no Vault/library chip; a `B4`
  query returns all 8 buckets; deselecting 7 chips narrows to tasks only (`1/8`); `from`/`to` narrows
  to the in-range task; an out-of-range window shows the empty state; `from > to` shows the
  `role="alert"` message **and issues zero extra `/api/search` requests** (10 before, 10 after);
  `ล้างตัวกรอง` restores 8 chips + empty dates; unmatched query shows the empty state; all 8 result
  types navigate to their own view.
- Responsive: no horizontal overflow and no button below 40×40 at 1280/768/390 for both the
  attachments panel and the open command dialog (dialog right edge 920/664/370 within viewport).
- Console: no unexpected console errors, no exceptions, no HTTP errors.

### Bugs found and fixed

- Search accepted `from=2026-13-01` because the JSON-schema pattern only checks the shape. Added
  `isIsoDate()` validation → 400.
- The E2E seed inserted the `entity_files` row before the `files` row, violating the FK. Reordered.
- Date filtering in `/api/search` moved into SQL `WHERE` clauses before `LIMIT` so narrow date ranges
  are never starved by newer rows outside the range.
- Command Palette previously swallowed search errors with `.catch(() => undefined)` and only rendered
  3 of the 8 search result buckets; now surfaces errors and renders all 8 buckets.
- The attachment file picker was empty in every module except the file library: `switchView()` clears
  the parent `files` list on each view change, so `availableFiles` arrived empty. `EntityAttachments`
  now loads the library itself (`listFiles(1, 100)`) and merges it with the prop, which keeps the
  documented prop contract and makes the picker work in all five modules.
- Worktree hazard: `apps/web/src/App.tsx` had been renamed on disk to `app.tsx`, which made
  `tsc -b` fail with `TS1149` (casing-only difference) while Vite still resolved it. Restored the
  original casing; no content change from the rename.

### Risks

- `entity_files` has no uniqueness across `(owner_id, file_id)` — the same file can legitimately
  attach to many entities, which is the intent.
- Vault/assets remain blocked on D-1.

### Gates

BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED**. Browser UI: **PASS on Chrome (33/33)**; other
browsers remain unverified.

### Next

Batch 5 is **not started**. Per the batch rules, work stops at Batch 4 closure.

## Batch 5A — Personal Vault + Knowledge Library (backend only, 2026-10-20)

**Status: COMPLETE (backend, search, file links, backup). UI untouched on purpose — no change to
`App.tsx` / `App.css` / `api.ts` in this batch.**

### Delivered

- `apps/server/migrations/012_vault_and_library.sql` (schema 12) — `vault_items`, `library_items`,
  six owner-scoped indexes, and a rebuild of `entity_files` that widens `entity_type` to seven values.
- `apps/server/src/vault-library.ts` — 10 routes: `GET/POST` + `GET/PUT/DELETE :id` for `/api/vault`
  and `/api/library`, with category/status/q filters, pagination, owner scoping and link cleanup on
  delete.
- `apps/server/src/file-links.ts` — `vault` → `vault_items`, `library` → `library_items`; the
  polymorphic-id triggers validate both.
- `apps/server/src/life-os.ts` — `/api/search` now serves **ten** buckets. `vault` filters on
  `renewal_or_expiry_date`, `library` on `updated_at`, both inside SQL before `LIMIT`.
- `apps/server/src/backup.ts` — `requiredTablesForSchema(12)` requires `vault_items` and
  `library_items`, so `backup:verify` rejects a schema-12 backup missing either table.

### Verification

- **21 files / 243 tests** pass (`vault-library.test.ts` adds 18). New coverage: CRUD and defaults,
  category/status/q filters, invalid category/status/title/date, partial PUT + date clearing,
  cross-owner 404 on every verb, session requirement, attach/list/unlink for both new types,
  `types=vault,library`, from/to narrowing, inverted range 400, unknown bucket 400.
- `safe-open.test.ts` adds a **populated 11→12 upgrade**: a real file-backed schema-11 `DATA_DIR` with
  an existing `entity_files` row upgrades, the link survives, a pre-migration backup verifies at
  `[1..11]`, and the widened CHECK accepts `vault` while the trigger still rejects a missing entity.
- Backup E2E now seeds two vault rows, two library rows and vault/library links, destroys everything,
  restores, and asserts content + all three links per owner, not just counts.
- Gates: `npm test`, `npm run lint`, `npm run build:server`, `npm run build:web`, `git diff --check` all
  clean.
- Live round-trip on a throwaway `DATA_DIR` (port 3496): create → `backup:create` (manifest
  `schema [1..12]`, 1 object) → `backup:verify` ok → delete both records through the API (totals 0) →
  `backup:restore` → `GET /api/health` ok → both records and both file links back, search returns the
  vault row. Evidence: `.tmp-acceptance-20261020/b5a-evidence/`.

### Bugs found and fixed

- The `entity_files` rebuild failed with `error in trigger entity_files_task_delete: no such table`.
  SQLite will not drop a table that triggers on *other* tables reference, so the four
  `AFTER DELETE` triggers are dropped first and recreated after the rename.
- A first draft test asserted "undated rows sort last" on a set where all rows were undated; the
  ordering was correct and the test was wrong. Fixed by seeding one dated row.

### Deviations from the brief (deliberate)

- Table is `entity_files`, not `entity_file_links` — that is the existing name from migration 011.
- Column is `renewal_or_expiry_date` (lowercase), not `Renewal_or_expiry_date`. SQLite is
  case-insensitive, but every other column in this schema is lower snake_case.
- `owner_id` was added to both tables. Every module is owner-scoped and the link triggers require it;
  without it any account could read any vault row.
- `GET /api/vault/:id` and `GET /api/library/:id` were added (not requested) because Batch 5B needs to
  reopen a record by id.
- `PUT` is a partial update, not a replace. A true replace would wipe every omitted field.

### Risks

- `vault_items.key_value` is plaintext in the main SQLite file. It is a convenience field, **not** a
  password manager; real secrets remain blocked on D-1. Documented in SCHEMA §15 and API §20.

### Gates

BK-08, BK-09, BK-10, BK-11b: **NOT VERIFIED**. Browser UI for these modules: **NOT BUILT** (Batch 5B).

### Next

Batch 5B (UI) is **not started** — waiting for instruction.

## Batch 5B — Vault + Library UI, 10-bucket palette, vibrant theme (2026-10-20)

**Status: COMPLETE (UI + Chrome acceptance 24/24).**

### Delivered

- `apps/web/src/api.ts` — `VaultCategory`, `VaultItem`, `VaultPage`, `LibraryCategory`,
  `LibraryStatus`, `LibraryItem`, `LibraryPage`, `VaultItemInput`, `LibraryItemInput`; widened
  `SearchBucketType` (10) and `AttachmentEntityType` (7); `SearchResults.vault` / `.library`; and the
  eight client functions (`listVaultItems`, `createVaultItem`, `updateVaultItem`, `deleteVaultItem`,
  `listLibraryItems`, `createLibraryItem`, `updateLibraryItem`, `deleteLibraryItem`).
- `apps/web/src/App.tsx` —
  - Two sidebar entries with live counts: `🔐 คลังสำคัญ & ทรัพย์สิน (Vault)` and
    `📚 ห้องสมุด & คู่มือชีวิต (Library)`.
  - **Vault**: category chips + search in the list; cards show title, category badge, key code,
    renewal date with a red pill when ≤30 days (or overdue), amount and physical location. The editor
    has every field, `📋 คัดลอกเลขสำคัญ` (clipboard + toast), `📅 ส่งวันครบกำหนดเข้าปฏิทินแจ้งเตือน`
    (creates a reminder), and `EntityAttachments entityType="vault"`.
  - **Library**: category chips + status chips + search; cards show status/category badges and a
    2-line takeaways preview. The editor leads with a highlighted `💡 แก่นสำคัญ 3 ข้อ (Key Takeaways)`
    box (bullet preview above the textarea), then SOP content, source/author, and
    `EntityAttachments entityType="library"`.
  - Command palette: 10 chips, counter `n/10`, vault/library result rows, and `navigateCommand`
    opens the matching record in its own view (fetching it when the list filter excludes it).
- `apps/web/src/App.css` — accent tokens (`--accent-2/3`, `--accent-glow`) for all five themes,
  brighter base greens, gradient profile card / panel-title underline / Key Takeaways box,
  six category-badge hues plus three status hues, soft hover/active elevation, dark-mode overrides,
  and 40px minimum targets for every new control.

### Verification

- Chrome acceptance on a throwaway `DATA_DIR` (port 3497): **24/24 PASS**, 18 screenshots in
  `.tmp-acceptance-20261020/b5-evidence/`.
  - Vault: view opens, create (badge/code/urgent pill/toast/attachments panel), edit, copy key
    (clipboard read back as `POL-B5-998877`), send-to-reminders (row exists at the right date),
    attach file, delete.
  - Library: create with 3 takeaways, edit status + takeaways, attach file, delete.
  - Palette: 10 chips all pressed (`10/10`), search returns vault + library rows, both navigate.
  - Themes: all five set `data-theme` with non-empty `--accent-2`/`--accent-glow` and a gradient
    takeaways box.
  - Responsive: zero overflow and zero sub-40px controls at 1280/768/390 for the library view and the
    open palette.
  - Console: no errors, no exceptions, no HTTP errors.
- Gates: `npm test` (21 files / 243), `npm run lint`, `npm run build:server`, `npm run build:web`,
  `git diff --check` all clean.

### Bugs found and fixed

- Copy-to-clipboard reported failure whenever the document was not focused (automation, embedded
  webview). `copyVaultKey` now falls back to the `execCommand` path before showing an error; the
  acceptance run uses a real mouse press, and the clipboard content is verified, not just the toast.
- The palette counter was hard-coded as `/8`; it now derives from `SEARCH_TYPE_LABELS.length`.

### Known limitations

- `navigateCommand` for a vault/library hit that is not in the loaded list issues one extra list call
  and selects from it. A dedicated `GET /:id` client call would be cheaper once the list grows past
  one page.
- Vault `keyValue` remains plaintext (D-1 open); the UI presents it as a quick-copy field, not a
  password manager.

### Next

Batch 5B is closed. No commit/push/deploy was made and no further batch was started.

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

## Final UX/UI Polish & PWA Upgrade (2026-10-21)

**Status: COMPLETE.**

### Delivered

- **PWA shell** (`apps/web/public/manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`):
  - Manifest: `short_name: "Life OS"`, `display: "standalone"`, `background_color: #f6f7f4`,
    `theme_color: #2f7d5a`, Thai language, shortcuts to Dashboard and Vault.
  - Service worker: network-first for navigations (so new deploys are picked up immediately),
    cache-first for hashed build assets, **never caches `/api/` responses** to avoid replaying
    personal data.
  - `index.html`: `theme-color`, `viewport-fit=cover`, `apple-mobile-web-app-capable`,
    `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `application-name`.
  - `main.tsx`: registers `/sw.js` on load with scope logging.

- **Dashboard upgrade** (`apps/server/src/dashboard.ts` + `apps/web/src/App.tsx`):
  - Backend now returns `vaultItems` (upcoming renewals, sorted by `renewalOrExpiryDate`) and
    `libraryItems` (active SOPs with status = `active`, sorted by `updatedAt`).
  - Added `DashboardCounts`: `vaultItems`, `libraryItems`.
  - Frontend widgets:
    - **สถิติภาพรวม** (dash-stats): 8 tiles — Notes, Tasks, Projects, Goals, Vault, Library,
      Reminders, Inbox — with hover lift and focus ring.
    - **เอกสาร/ทรัพย์สินที่ใกล้หมดอายุ** (dash-card): lists upcoming vault items with red pill
      when ≤30 days or overdue.
    - **คู่มือที่ใช้งานประจำ** (dash-card): lists active library SOPs with category/status badges.

- **Keyboard shortcuts** (`App.tsx`):
  - `Ctrl+K` — Command Palette (unchanged).
  - `Alt+N` — create new note (opens editor, sets focus, pre-selects taxonomy).
  - `Alt+T` — create new task (opens task panel, focuses title input).
  - Guards prevent firing when typing in inputs/textareas or when a dialog is open.

- **Motion & micro-interactions** (`App.css`):
  - `pkh-fade-in` and `pkh-slide-up` keyframes (150–200ms ease-out).
  - Applied to `.dialog-backdrop`, `.command-dialog`, `.studio-dialog`, `.notification-popover`.
  - Respects `prefers-reduced-motion` (already present in the file).

- **Responsive safeguards**:
  - `.dash-stat-grid` collapses to 2 columns at ≤420px.
  - All new controls maintain `min-height: 40px` and `min-width: 40px`.
  - Dashboard cards use `overflow-wrap: anywhere` to prevent horizontal overflow at 390px.

### Verification

- Gates: `npm test` 21 files / **244 tests**, `npm run lint` (2 warnings, 0 errors),
  `npm run build:server`, `npm run build:web`, `git diff --check` — all clean.
- No live `DATA_DIR` or `BACKUP_DIR` touched during this batch.

### Known limitations

- The PWA install prompt and offline behaviour were not exercised in an automated browser test
  in this batch; they were verified by code review and static analysis of the SW scope rules.
- iOS Safari PWA icons require `apple-touch-icon` only; maskable icon purpose is declared in the
  manifest but iOS ignores it.

### Next

No further batch was started. No commit/push/deploy was made.

## Production Remote Access & Background Service (2026-10-21)

**Status: COMPLETE.**

### Delivered

- **Host binding** (`apps/server/src/index.ts`):
  - Changed `host: '127.0.0.1'` → `host: process.env.HOST || '0.0.0.0'`.
  - Server now listens on all interfaces, verified on 127.0.0.1, 169.254.x.x, 192.168.1.38 and
    192.168.56.1 from a single startup.

- **CORS & Auth safety**:
  - Cookie `Secure` flag is already protocol-aware: set only when `EXPECTED_ORIGIN` starts with
    `https:`; omitted for `http:` LAN/Tailscale IPs.
  - `SameSite=Strict` remains in place; because the app is served from the same origin as the API
    (even over Tailscale), this does not break sessions.
  - No explicit CORS middleware is needed because the web build is served statically by the same
    Fastify instance.
  - **Important for Tailscale users**: set `EXPECTED_ORIGIN` to the exact URL clients will use
    (e.g. `http://100.x.x.x:3001` or `http://machine-name.tailnet.ts.net:3001`) so that cookie
    domain/path logic and any origin checks remain consistent.

- **Startup scripts**:
  - `ecosystem.config.js` — PM2 ecosystem at project root. Config: `name: "life-os"`,
    `script: "./apps/server/dist/index.js"`, `HOST: "0.0.0.0"`, `PORT: 3001`,
    `DATA_DIR: "C:\\PKH_Data"`, auto-restart, log rotation to `./logs/`.
  - `scripts/start-production.cmd` — Windows batch for direct `node` launch without PM2.
    Validates that `apps/server/dist/index.js` exists, creates `DATA_DIR` and `logs/` if missing,
    prints the active env, then starts the server.
  - Root `package.json`: added `"start:server": "npm --prefix apps/server start"` for convenience.

### Verification

- `npm run build:server` → clean.
- `HOST=0.0.0.0 PORT=3501 node apps/server/dist/index.js` → bound to all local IPs, health check
  responded on 127.0.0.1:3501.
- `npm test` → 21 files / **244 tests** PASS.
- `git diff --check` → clean.

### How to run in production

**Option A — PM2 (recommended for always-on)**
```powershell
npm install -g pm2
npm run build:server
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # creates the Windows service / systemd unit
```
Override env at start time:
```powershell
$env:DATA_DIR="D:\PKH_Data"; $env:EXPECTED_ORIGIN="http://100.x.x.x:3001"
pm2 start ecosystem.config.js
```

**Option B — Windows batch (simple, manual)**
```powershell
set DATA_DIR=D:\PKH_Data
set EXPECTED_ORIGIN=http://100.x.x.x:3001
scripts\start-production.cmd
```

**Option C — npm directly**
```powershell
$env:HOST="0.0.0.0"; $env:PORT="3001"; $env:DATA_DIR="D:\PKH_Data"
npm run start:server
```

### Next

No further batch was started. No commit/push/deploy was made.
