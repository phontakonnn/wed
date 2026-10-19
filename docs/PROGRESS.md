# Progress

## Current phase
- Phase 2 — MVP implementation (partial: SQLite, authentication/session slice, Notes CRUD, T15 trash, backup/restore MVP)
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

### Checkpoint and commit hold

- Initial checkpoint `git status --short` and `git --no-pager diff --stat` showed an already-dirty
  worktree from prior uncommitted PKH work; the status/diff were preserved, not reset.
- `git ls-files` pattern scan returned no tracked `.env*`, SQLite/DB, WAL/SHM, uploads, backups, or
  log files/directories.
- Proposed future commit split (not staged or committed):
  1. `Implement PKH notes and backup baseline`
  2. `Add Notes trash management`
  3. `Evaluate Thai FTS5 search strategies`
- Notes CRUD/T15 edits touch some of the same files, so any future split will need careful hunk
  staging. No commit will be run without the separate explicit “อนุมัติ commit” approval.

### Evaluation performed

- Added `tests/thai-search-evaluation.mjs`, a deterministic standalone test/benchmark using only the
  existing server `better-sqlite3` dependency. It creates and removes temporary SQLite files and
  does not read `DATA_DIR`.
- Dataset: 200 synthetic Thai note-like records with 22 predefined substring queries, plus a
  10,000-note synthetic performance corpus. The independent oracle NFC-normalizes and checks
  literal substring presence in title/content. Queries cover partial/middle text, no-space Thai,
  1-/2-/3-code-point cases, nonexistent text, Thai tone/marks, NFC/NFD, mixed Thai/English, numbers,
  and English partial words.
- Runtime checks confirmed `Intl.Segmenter` locale `th` is supported by ICU 78.3 and yields Thai word
  segments. `better-sqlite3` 13.0.3 / SQLite 3.53.4 successfully created an FTS5 trigram tokenizer
  and matched Thai text; two-code-point trigram queries produce no hits.
- Full machine baseline and all measurements, plus the method, result misses and proposed
  implementation migration, are in `DECISIONS.md`.

### Results and proposed decision

- On 200 notes, trigram + hybrid achieved precision/recall 100%/100%; word-only FTS achieved
  100%/74.76% and missed partial terms and compounds including `งบประมา`, `กา`, `น้ำ`, and
  `ก่อนเดินทาง`.
- Under the measured bounded short fallback (latest 1,000 candidates, max 200 returned), 10k
  archive recall was only 9.76% for `ๆ` and 2.02% for `กา`. All tested approaches therefore fail
  the combined 95% requirement when the full-archive short-query cases are included.
- Proposed future policy: trigram search for queries of at least 3 Unicode code points and return a
  clear Thai limitation message for shorter queries. Do not present a bounded partial result as
  complete. Hybrid is not recommended because it did not improve accuracy on the 200-note set and
  had a 62.5% larger index, 10.3x build time, and higher write cost.
- No endpoint, UI, schema migration, dependency, manifest, lockfile, network, remote access, or real
  user data was changed. Any trigram schema change remains a proposal only.

### Verification

The standalone benchmark command was run successfully with temporary DBs:
`node tests\thai-search-evaluation.mjs` (exit 0; 200-note corpus, 22 query cases, and 10,000-note
benchmark corpus). Final verification on the final diff:

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 4 test files, 35 tests |
| `npm.cmd run lint` | PASS — ESLint, no findings |
| `npm.cmd run build:server` | PASS — TypeScript server build |
| `npm.cmd run build:web` | PASS — TypeScript project build and Vite production build |
| `git --no-pager diff --check` | PASS — exit 0; LF-to-CRLF warnings only |
| Tracked secret/runtime-data scan | PASS — no tracked `.env*`, DB/SQLite, WAL/SHM, uploads, backups, or logs |

- Final `git rev-parse --show-toplevel` returned the expected workspace root. `git status --short`
  remains dirty with the pre-existing PKH changes plus this evaluation; no changes were staged or
  committed. `git --no-pager diff --stat` reports 21 tracked changed files, 2,818 insertions and
  507 deletions; this excludes untracked `tests/` and `apps/server/migrations/002_notes.sql`.
- The T08 synthetic DB benchmark was run separately and exited 0. Its latest measured values and
  hardware/runtime baseline are recorded in `DECISIONS.md`; the 95% full-archive criterion for short
  queries remains unmet. No production DB or real user data was accessed.
