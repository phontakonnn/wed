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
- Thai substring search is implemented with an additive trigram FTS5 index for queries of at least
  three Unicode code points and a full-scan NFC `instr()` fallback for one- and two-code-point
  queries. The evidence, limits, and HTTP measurements are below.
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
- The benchmark was rerun immediately before its separate commit using the same method and data
  shape: p50 **58.13 ms**, p95 **171.28 ms**. This variation is retained as evidence rather than
  replacing the earlier run; neither direct-SQLite result predicts HTTP latency or a safe archive
  size.

| Query | Expected = actual matches | Pagination check |
| --- | ---: | --- |
| `ก` | 9,600 | page 1, page 2, last page, beyond end |
| `ๆ` | 1,850 | page 1, page 2, last page, beyond end |
| `กา` | 9,518 | page 1, page 2, last page, beyond end |
| `งบ` | 2,200 | page 1, page 2, last page, beyond end |
| `é` (NFC) | 65 | page 1, page 2, last page, beyond end |
| `é` (NFD) | 65 | page 1, page 2, last page, beyond end |
| `zz` | 0 | empty result and beyond end |

### Approved policy and implementation

- The user approved FTS5 trigram for queries of at least 3 Unicode code points and a full-scan
  `instr()` fallback over NFC text for one- and two-code-point queries. Queries are trimmed and
  NFC-normalized; longer FTS queries are quoted as a phrase with embedded quotes escaped, then
  checked against the NFC text to preserve literal-substring behavior.
- The full-scan path is linear in the number and size of the caller's active notes: it normalizes
  and scans candidate text, runs a count, then returns one bounded page. It always filters by
  session owner and `deleted_at IS NULL`, defaults to 50 results, caps `pageSize` at 200, and is
  limited to 60 requests per client IP per minute. The in-process limit resets on restart and is
  not shared between server processes.
- The HTTP-level synthetic benchmark used 10,000 SQLite rows (9,600 active owner notes, 200
  trashed owner notes, and 200 active notes for another owner). Each run used local `fetch` requests
  to temporary `127.0.0.1` ports, included session resolution, the count and page SQL queries,
  response serialization and JSON reading, and used page size 50. Each path had 10 warm-up and 40
  measured requests timed with `performance.now()`. The trigram path always queried `งบประมาณ`;
  the short-query path alternated `ก` and `กา`. Each query returned a total of 9,600 rows.

| Run | Trigram p50 / p95 (ms) | Short full-scan p50 / p95 (ms) |
| --- | ---: | ---: |
| 1 | 55.156 / 56.592 | 19.131 / 20.196 |
| 2 | 54.779 / 57.250 | 19.080 / 20.300 |
| 3 | 55.080 / 57.033 | 19.177 / 21.141 |
| Mean across run percentiles | 55.005 / 56.958 | 19.129 / 20.545 |
| Population SD across run percentiles | 0.163 / 0.274 | 0.040 / 0.423 |
| Range across run percentiles | 54.779–55.156 / 56.592–57.250 | 19.080–19.177 / 20.196–21.141 |

Baseline for all three runs: Windows_NT 10.0.19044 x64, Node.js v24.22.0, ICU 78.3,
Unicode 17.0, better-sqlite3 13.0.3 / SQLite 3.53.4, Intel Core i5-13400F, 16 logical CPUs,
34,055,766,016 bytes RAM. These are three repeated synthetic runs, not a concurrency or
production-data test. All measured p95 values were below the unchanged 300 ms target.
- The observed latency difference is real for this benchmark, but it is not a controlled
  same-query comparison: the API selects its strategy from query length, so the trigram request
  (`งบประมาณ`) and fallback requests (`ก`, `กา`) necessarily use different query sets here. The
  test code confirms both paths use the same warm-up count (10), measured request count (40),
  default page size (50), HTTP/JSON work, and exactly two SQL statements per request (a
  `COUNT(*)` and a page query), with the same returned total (9,600). The short path reads `notes`
  with owner/trash filters and NFC `instr()`; it has no FTS join. The trigram path additionally
  joins `notes_fts_trigram`, applies `MATCH` and the FTS owner filter, then checks the NFC literal
  match; it pays this extra work while the selected trigram query matches essentially the entire
  active corpus. Thus the result does not show that trigram is generally slower for selective
  searches; this benchmark does not isolate query selectivity or the tokenizer's benefit.
- Request order is fixed within each fresh test: 10 trigram warm-ups, 40 trigram measurements,
  then 10 fallback warm-ups and 40 fallback measurements. Repeating the test in three fresh
  processes produced the low between-run variability shown above, but the sequential order and
  differing queries remain limitations.
- Because the fallback scans linearly, remeasure HTTP p95 as the active note corpus grows. Revisit
  the policy when measured p95 approaches or exceeds 300 ms; the available single 10k point does not
  justify extrapolating a specific maximum note count.
- Do not choose the hybrid: it did not improve accuracy over trigram on the 200-note oracle, while
  its measured index is 62.5% larger; in this run its build time was 3.3x trigram's. 10k latency
  and write costs are also higher.
- Do not choose word-only pre-tokenization for literal Notes search: its 78.05% overall recall and
  observed partial-word/Thai mark misses do not meet the target.
- Limitations: the corpus is synthetic and single-machine; concurrent workload and browser
  behavior were not tested. The UI implementation was build-checked but not exercised in a
  browser. No production database was opened or migrated. Before applying migration 003 to a
  database with existing data, follow the verified-backup requirement in `BACKUP.md`.
- No dependency, manifest, or lockfile changed. Migration 003 adds a separate trigram FTS5 table,
  backfills active notes, and adds insert/update/delete triggers; existing `notes_fts` and its
  triggers remain unchanged. Migration and backfill preservation were tested only with temporary
  databases.

### Additional HTTP selectivity benchmark (2026-10-19)

- This follow-up addresses the broad-match limitation above. It uses a fresh temporary in-memory
  database for each of three measured runs and the same 10,000-note synthetic layout: 9,600 active
  notes for the authenticated owner, 200 trashed notes for that owner, and 200 active notes for a
  second owner. Marker strings were added only to this synthetic benchmark corpus: 100 matching
  active-owner notes (100/9,600 = 1.04%), 1,000 matching active-owner notes (1,000/9,600 =
  10.42%), and no matching notes. All returned `total` values matched those counts.
- Each case used a separate temporary Fastify app and loopback HTTP port, with session resolution,
  response serialization and JSON parsing, default page size 50, 10 warm-up plus 40 measured
  sequential `fetch` requests timed using `performance.now()`. Each case stayed below the configured
  60 requests per 1-minute rate-limit window. Cases were run sequentially, not concurrently.
- A second route was attached only to the benchmark test's Fastify app (not registered in the
  production application). It reproduced the production full-scan NFC `instr()` count and page
  SQL, and retained the app's session hook. This permits testing the *same 3+ code-point query*
  through trigram and forced full-scan SQL. Actual production API behavior still routes all
  3+ code-point queries to trigram, so forced scan is comparative instrumentation, not a public
  feature. The 1–2 code-point cases use the real production search API fallback and cannot be sent
  through trigram with the same literal query because the production policy intentionally selects
  the fallback for them.

| Case | Match count / active-owner corpus | Query path | Run 1 p50/p95 ms | Run 2 p50/p95 ms | Run 3 p50/p95 ms | Mean p50 ± population SD | Mean p95 ± population SD |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1% long query | 100 / 1.04% | Trigram | 2.204 / 2.693 | 2.450 / 3.098 | 2.206 / 2.368 | 2.287 ± 0.116 | 2.720 ± 0.298 |
| 1% same long query | 100 / 1.04% | Forced full scan | 28.399 / 29.372 | 28.460 / 29.521 | 28.544 / 30.279 | 28.468 ± 0.060 | 29.724 ± 0.397 |
| 10% long query | 1,000 / 10.42% | Trigram | 8.497 / 10.086 | 10.236 / 11.137 | 8.453 / 9.444 | 9.062 ± 0.830 | 10.222 ± 0.698 |
| 10% same long query | 1,000 / 10.42% | Forced full scan | 19.859 / 20.946 | 20.885 / 23.115 | 20.277 / 21.715 | 20.340 ± 0.421 | 21.925 ± 0.898 |
| No-hit long query | 0 / 0% | Trigram | 0.664 / 0.776 | 0.669 / 0.738 | 0.691 / 0.928 | 0.675 ± 0.011 | 0.814 ± 0.082 |
| No-hit same long query | 0 / 0% | Forced full scan | 37.230 / 38.947 | 37.332 / 38.570 | 37.679 / 39.184 | 37.414 ± 0.192 | 38.900 ± 0.253 |
| 1% short query | 100 / 1.04% | Full-scan API (`¤`) | 28.463 / 29.695 | 28.930 / 30.569 | 28.625 / 30.005 | 28.673 ± 0.194 | 30.090 ± 0.362 |
| 10% short query | 1,000 / 10.42% | Full-scan API (`§§`) | 20.500 / 22.172 | 20.433 / 23.302 | 20.360 / 21.584 | 20.431 ± 0.057 | 22.353 ± 0.713 |
| No-hit short query | 0 / 0% | Full-scan API (`※`) | 37.655 / 39.978 | 37.354 / 38.977 | 37.853 / 39.492 | 37.620 ± 0.205 | 39.482 ± 0.409 |

The preliminary run used to validate marker counts and the forced-scan harness is not included in
the three-run statistics: trigram/forced-scan for 1% p50/p95 was 2.149/2.350 and 28.371/30.388 ms;
for 10%, 8.694/9.785 and 20.090/20.856 ms; for no-hit, 0.653/0.933 and 37.179/40.264 ms. Short
fallback p50/p95 for 1%, 10%, and no-hit was 28.870/30.457, 20.248/21.229, and 37.620/39.051 ms.

**Interpretation:** the same-query comparison is valid for the three long queries because both
paths use the same literal query, owner, corpus, session, HTTP response shape, pagination, and
count/page SQL semantics. It is not a comparison of public endpoint routes: forced full scan is a
test-only route, while the real endpoint uses its configured rate limiter. The short-query
fallback cases are separate literals and cannot be compared as same-query trigram requests. For
the matched long queries, trigram is materially faster at 1%, 10%, and no-hit selectivity on this
synthetic data. The short full scan is slower on rare and no-hit terms because it normalizes/scans
all 9,600 active owner notes; the 10% case happens to be faster than the 1% case in this corpus and
run, so do not infer a monotonic latency curve from match percentage. All p95 values were below
300 ms. This is not a concurrent-load, production-data, or browser measurement.

### Search rate limit and UI debounce

- Production search route: `max: 60`, `timeWindow: '1 minute'` (60 requests per 60 seconds per
  rate-limit key/client IP); API tests verify that authenticated requests 1–60 are accepted and
  request 61 returns 429 with `Retry-After`. The test also verifies that 61 anonymous requests
  return 401 and do not consume the authenticated requester's rate limit.
- The existing UI resets a 300 ms timer on each input change. A continuous burst of any number of
  keystrokes with gaps below 300 ms produces one search request after the last keystroke, so a
  typical 8-character query typed over 0.8 seconds and followed by a pause yields 1 request, not 8.
  One settled search per second would use all 60 requests in a minute; ordinary query entry is well
  below that. However, debounce is not a hard rate cap: 61 distinct settled searches in one minute
  can still receive 429, and the implementation does not prevent that edge case. The browser UI
  and visible 429 state were not exercised in a browser.
