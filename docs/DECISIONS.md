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
- Thai search strategies were measured in T08 against synthetic data; no search endpoint or UI is
  implemented. See the T08 evidence and limits below.
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
  API, **with its own manifest**, removes stale `-wal`/`-shm` before replacing the file, then
  re-verifies integrity, schema versions, and required tables. On post-restore failure it copies the
  safety copy back. The manifest on the safety copy exists so a completed-but-unwanted restore can be
  undone with the same CLI; without it the rollback would need a manual file copy.
- **In-use detection:** two earlier approaches were measured and rejected on this machine.
  (a) `BEGIN EXCLUSIVE` alone succeeded while another idle connection was open, so it cannot detect a
  running server. (b) Treating the presence of `knowledge.sqlite3-shm` as "in use" produced false
  positives, because a read-only connection creates that file and does not remove it on close.
  The implemented check **tries to delete the `-shm` file**: Windows returns `EBUSY` while a live
  connection has it memory-mapped and allows the delete when nothing is attached. Success also
  cleans up the stale sidecar. `BEGIN EXCLUSIVE` remains as a second check for an active writer.
  `--force` bypasses the `-shm` check for a confirmed-dead server.
  Rejected alternative: renaming the database file as a probe — on Windows it fails while the file is
  open, but a crash mid-probe would leave the live database renamed.
- Read-only inspections (`verify`, post-restore checks) remove any `-shm`/empty `-wal` sidecar they
  created themselves, so verification does not leave artefacts next to backups.
- Backups are **not encrypted**. They contain scrypt password hashes and session-token hashes, so
  they are as sensitive as the live database and rely on NTFS ACLs. Encryption is deferred, not done.
- The backup directory must be a separate physical disk. That is not yet verified, so the backup gate
  in `ACCEPTANCE.md` stays closed.

### Scope discipline for this session
- `auth.ts`, the `preHandler` hook, the CSRF checks, and all pre-existing routes were left untouched.
  The only edits to existing files were `.gitignore`, `package.json` (scripts), and
  `better-sqlite3.d.ts` (type declarations for `backup()` and connection options).


## Approval and implementation status
- The user authorized proceeding through phases on 2026-10-19, approved Phase 0 and Phase 1, and
  separately authorized the documentation/backup work in this session. Approval is not evidence
  that a phase or its acceptance criteria passed.
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

## Notes CRUD implementation (2026-10-19)

- The approved product scope remains Personal Knowledge Hub. No restaurant, Firebase, Next.js,
  Google Sheets, PWA, network, or remote-access feature was introduced.
- `database.ts` now discovers sequential `NNN_description.sql` migrations and applies each
  transactionally with its `schema_migrations` row. It rejects gaps, invalid SQL migration names,
  nonsequential applied history, and databases newer than available migrations.
- `002_notes.sql` adds owner-scoped notes with `deleted_at` soft deletion and an FTS5 title/content
  index maintained by triggers. Existing authentication data is not rewritten. The migration and
  upgrade-preservation tests use temporary SQLite databases only.
- Authenticated Notes routes provide create, paginated list, detail, patch, and soft-delete. Reads
  and writes are owner-scoped; mutating routes remain covered by existing Origin/Host/CSRF checks.
  Deleted notes remain in SQLite but are omitted from active list/detail and FTS.
- The React client now uses real same-origin API requests, shows the login screen, and supports Notes
  CRUD. Vite proxies `/api` to the loopback server for development; Fastify serves `apps/web/dist`
  when that build exists. No production mock data was added.
- Existing `@fastify/static` is reused; no dependency was added, upgraded, or removed. Tailwind is
  still not present in the web manifest; the new UI uses CSS rather than adding a dependency without
  the required package review/approval.
- This work does not pass production acceptance. Backup/restore gates remain open, Notes trash
  restore is not implemented, browser automation is not present, and remote access remains
  unconfigured/disabled. If later approved, remote access must be Tailscale-only, never Funnel and
  never a public port.

## T15 Notes trash (2026-10-19)

- The user approved Phase 0 and Phase 1 and explicitly authorized the T15 Notes trash slice. The
  authorization is limited to this task; stop for acceptance before starting another product task.
- Reuse `notes.deleted_at` and the existing `notes_fts_update` / `notes_fts_delete` triggers; do not
  add a migration or alter schema for trash listing, restore, or permanent deletion.
- Trash listing uses session-owner filtering, page 1 by default, page size 50 by default and 200
  maximum. Restore clears `deleted_at`; permanent deletion requires `{ "confirm": true }` and only
  deletes an owned row whose `deleted_at` is non-null.
- Do not add automatic deletion. The 30-day policy is a UI information/warning only.
- Keep both views in the existing Notes page and route. The permanent-delete UI must explicitly
  confirm in Thai; the API independently enforces a boolean confirmation.
- No tag/category/relation tables exist today. Preservation of such associations cannot be tested
  until those features exist; report it as **ยังไม่ได้ทดสอบ** rather than claiming support.
- Historical mentions of other project scopes in the prior audit text were observed and preserved
  per user instruction. No out-of-scope project implementation was found in source or migrations.
- No dependency, manifest, lockfile, backup, network, firewall, registry, power, or remote-access
  changes are authorized or included.

## T08 Thai search evaluation (2026-10-19)

### Scope and evidence

- This is a local synthetic-data evaluation only. It adds no endpoint, UI, migration, dependency, or
  production data access. Re-run with `node tests\thai-search-evaluation.mjs`.
- The standalone test generates 200 diverse Thai note-like records for a fixed 21-query literal
  substring oracle, plus 10,000 synthetic records for latency, index size, and short-query coverage.
  The three temporary SQLite database files are removed after the run.
- Baseline observed during the run: Windows_NT 10.0.19044 x64; Node.js v24.22.0, ICU 78.3,
  Unicode 17.0; `Intl.Segmenter.supportedLocalesOf(['th'])` returned `['th']` and split
  `ภาษาไทยไม่มีช่องว่าง` into `ภาษา`, `ไทย`, `ไม่มี`, `ช่อง`, `ว่าง`. `better-sqlite3` 13.0.3
  uses SQLite 3.53.4; creating an FTS5 `tokenize='trigram'` table and matching Thai succeeded.
  CPU: 13th Gen Intel(R) Core(TM) i5-13400F (10 cores / 16 logical processors); RAM:
  34,055,766,016 bytes.
- The expected-result oracle NFC-normalizes query and title/content, then performs exact substring
  matching independently of FTS. This measures substring retrieval, not semantic relevance,
  synonyms, ranking, or real-user query distribution.

### Measured results

Single run on the baseline above; latency uses `performance.now()`, 100 warm-up and 100 measured
rounds for each of 8 queries (800 samples per approach), with results capped at 200. Index size is
the sum of FTS and shadow-table pages from SQLite `dbstat`, excluding the base notes table. Insert
and update are measured over 250 indexed operations in a transaction and reported as mean per note.

| Approach | 200-note precision / recall | 10k p50 / p95 (ms) | FTS index (KiB) | Index build (ms) | Insert mean (ms/note) | Update mean (ms/note) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) FTS5 trigram + bounded short fallback | 100% / 100% | 0.588 / 2.138 | 17,640 | 233.1 | 0.522 | 0.205 |
| (b) `Intl.Segmenter('th')` words in FTS5 `unicode61` | 100% / 78.05% | 6.898 / 8.862 | 11,024 | 508.7 | 0.180 | 0.184 |
| (c) Hybrid trigram + word FTS + bounded short fallback | 100% / 100% | 7.486 / 10.979 | 28,664 | 776.6 | 0.706 | 0.381 |

Approach (b) misses partial terms such as `งบประมา`, `กา`, and `meet`, returns only 40 of 67
expected matches for `น้ำ` (recall 59.70%), and finds only 20 of 40 results for `ก่อนเดินทาง`.
Its overall recall is 78.05%, below the 95% target. NFC/NFD coverage now uses distinct strings
`Café` and `Café`; the test sends the raw NFD query to each search strategy and normalizes against
the same literal-substring oracle. The earlier Thai `น้ำ` NFD spelling was not distinct after Unicode
normalization and was replaced. No missed cases were silently removed from the expected set.

All three approaches return 100% precision/recall on the 200-note accuracy set for the four tested
short queries. This does **not** mean short-query fallback scales without omissions:

| Short query (<3 Unicode code points) | Literal matches in 10k archive | Matches in latest 1k candidate window | Approach (a)/(c) returned | Full-archive recall |
| --- | ---: | ---: | ---: | ---: |
| `ๆ` | 2,050 | 205 | 200 | 9.76% |
| `กา` | 9,914 | 1,000 | 200 | 2.02% |

Approach (b) returned 200/0 respectively under its 200-result cap and tokenizer semantics. Thus no
tested short-query path meets 95% full-archive recall; the benchmark marks the combined 200-note plus
short-archive 95% criterion as **not met** for all three approaches.

### Additional B2 measurement: full-scan fallback for short queries

- A separate temporary SQLite database held 10,000 synthetic note-like rows: 9,600 active notes
  owned by the benchmark user, 200 soft-deleted notes for that owner, and 200 active notes owned by
  another user. The owner and `deleted_at` predicates were applied in SQLite before matching.
- The measured query uses `instr()` over title/content with an NFC scalar function applied to the
  query and both text fields. It executes a count query and a paginated result query (page size 50),
  so measured latency includes both SQL operations and result materialization. The text is normalized
  at search time; this measurement does not assume a schema change or persisted normalized copy.
- Seven predefined 1–2 Unicode-code-point queries (including NFC `é` matched against NFD text and
  raw NFD `é` query input) were checked against an independent NFC substring
  oracle. Counts and page results matched exactly; page 1, page 2, the last page, and a page beyond
  the end were asserted. Precision and recall were both 100% for this synthetic benchmark.
- Warm-up: 100 rounds/query; measured: 100 rounds/query; total 700 samples. `performance.now()`
  produced p50 **58.29 ms** and p95 **103.42 ms**. Baseline: Windows_NT 10.0.19044 x64, Node.js
  v24.22.0, SQLite 3.53.4 via better-sqlite3 13.0.3, Intel Core i5-13400F, 16 logical CPUs,
  34,055,766,016 bytes RAM. One machine and one run; no HTTP/API overhead or concurrency was measured.

| Query | Expected = actual matches | Pagination check |
| --- | ---: | --- |
| `ก` | 9,600 | page 1, page 2, last page, beyond end |
| `ๆ` | 1,850 | page 1, page 2, last page, beyond end |
| `กา` | 9,518 | page 1, page 2, last page, beyond end |
| `งบ` | 2,200 | page 1, page 2, last page, beyond end |
| `é` (NFC) | 65 | page 1, page 2, last page, beyond end |
| `é` (NFD) | 65 | page 1, page 2, last page, beyond end |
| `zz` | 0 | empty result and beyond end |

### Proposed decision (not implemented)

- Use FTS5 trigram as the primary substring index for queries of at least 3 Unicode code points.
- Prefer a full-scan `instr()` fallback for queries shorter than 3 Unicode code points rather than
  rejecting them: the measured synthetic fallback preserved complete results and had p95 below the
  300 ms target. This is a recommendation only; the user has not selected or approved it, and no
  search route/UI exists yet. Keep the earlier rejection policy as an alternative if real workload
  testing shows unacceptable latency.
- Do not choose the hybrid: it did not improve accuracy over trigram on the 200-note oracle, while
  its measured index is 62.5% larger; in this run its build time was 3.3x trigram's. 10k latency
  and write costs are also higher.
- Do not choose word-only pre-tokenization for literal Notes search: its 78.05% overall recall and
  observed partial-word/Thai mark misses do not meet the target.
- Limitations: only a synthetic corpus and one machine/run were measured; p95 is machine-specific;
  no concurrent workload, long note stress, real-user relevance, backup/restore impact, HTTP/API
  overhead, or browser behavior was tested. The full-scan fallback remains a benchmark, not an
  implementation or API acceptance result.
- No dependency was added. The recommendation would require a forward-only migration that adds a
  separate trigram FTS table and its insert/update/delete synchronization for existing Notes. The
  existing `002_notes.sql` is not edited. Implementation must remain blocked until the search
  feature is separately approved, the migration is tested on temporary databases, and a verified
  backup is confirmed before applying it to any database with existing data.
