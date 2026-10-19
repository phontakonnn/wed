# Test Plan

**Status:** reflects the automated suite as of 2026-10-19 plus the tests added for backup/restore.
**Runner:** Vitest (`npm test` → `vitest run src` from `apps/server`).
**Rule:** tests must never touch `DATA_DIR`, real user data, or the network. Every test uses
`:memory:` or a temporary directory.

---

## 1. Test levels

| Level | Scope | Where | Runs in CI/agent |
| --- | --- | --- | --- |
| L1 Unit | Password hashing, session primitives, DB bootstrap, backup helpers | `apps/server/src/*.test.ts` | yes |
| L2 API integration | Fastify routes via `app.inject()` against an in-memory DB | `index.test.ts` | yes |
| L3 Restore drill | Backup → destroy → restore → verify on temp directories | `backup.test.ts` | yes |
| L4 Manual acceptance | Real `DATA_DIR`, real browser, scheduler, separate disk | `docs/ACCEPTANCE.md` | no — operator |

L1–L3 are automated and must stay green. L4 cannot be automated and is a gate, not a formality.

---

## 2. Automated coverage (current)

### 2.1 `database.test.ts` — schema and connection behaviour (6 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| DB-01 | Applies versioned schema, enables foreign keys | `foreign_keys = 1`; `schema_migrations` contains versions 1 and 2; `sessions` table exists |
| DB-02 | WAL for file-backed databases | `journal_mode = wal`; `busy_timeout = 5000` |
| DB-03 | Rolls back a failed transaction | Insert inside a throwing transaction leaves zero rows |
| DB-04 | Applies additive Notes migration | Fresh database has versions 1 and 2, Notes table and FTS5 table |
| DB-05 | Preserves data on upgrade | Existing version-1 user row remains after applying version 2 |
| DB-06 | Rejects migration gaps and rolls back failure | Missing sequence rejected before changes; failed SQL rolls back schema and version record |

### 2.2 `auth.test.ts` — primitives (3 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| AU-01 | scrypt hashing and minimum length | <12 chars rejects; hash does not contain the password; correct password verifies; wrong password fails |
| AU-02 | One-time bootstrap | Username stored; hash matches `^scrypt$`; second bootstrap throws `already initialized` |
| AU-03 | Token hashing and expiry | Stored value equals `sha256(token)` and differs from the token; alive at day 3 and day 9 (sliding); dead at day 17 (idle); dead at day 31 (absolute) |

### 2.3 `index.test.ts` — HTTP behaviour (19 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| API-01 | Health public, protected route denied | `/api/health` 200 with `status: ok`; `/api/auth/me` 401 |
| API-02 | CSRF required, no registration | Login without origin headers → 403; `POST /api/auth/register` → 401 (default deny) |
| API-03 | No account enumeration | Unknown user and wrong password return identical status and body |
| API-04 | Cookie + logout | `HttpOnly`, `SameSite=Strict`; `/me` 200 before logout, 401 after |
| API-05 | `Secure` follows HTTPS origin | `set-cookie` contains `Secure` when origin is `https://` |
| API-06 | Per-device session revocation | Two sessions listed, `current` flag correct, deleting one leaves the other usable |
| API-07 | `logout-all` | Revokes 2, clears cookie with `Max-Age=0`, both sessions dead |
| API-08 | Login throttle | Five failures → 401; sixth → 429 with `Retry-After: 1` |
| API-09 | Notes require a session | Anonymous list/create requests → 401 |
| API-10 | Notes CRUD and soft delete | Create/list/detail/update/delete, retained DB row, FTS index updates and active list excludes deleted note |
| API-11 | Notes validation | Blank titles, unknown fields, empty updates, malformed UUIDs, and invalid pagination → 400 |
| API-12 | Owner isolation | Another session gets no list result and cannot read/update/delete the owner's note |
| API-13 | Pagination | Page boundaries and total count are correct |
| API-14 | Same-origin production web serving | Built assets and root are public; Notes API remains protected |
| API-15 | Trash restore and FTS | Restore retains title/content, clears `deleted_at`, returns the note to active list and FTS |
| API-16 | Confirmed permanent delete | Missing/false confirmation and active-note deletion are rejected; confirmed trash deletion removes the row and FTS entry |
| API-17 | Trash authentication and CSRF | Anonymous requests return 401; mutating requests without CSRF headers return 403 |
| API-18 | Trash owner isolation | Another session cannot list, restore, or permanently delete the owner's deleted note |
| API-19 | Trash pagination | Default page size is 50, page boundaries work, maximum 200 is accepted and 201 is rejected |

Tags, categories, and note relations are not present in the schema. Their preservation during restore
is **ยังไม่ได้ทดสอบ** because those features do not exist yet.

### 2.4 `backup.test.ts` — backup/restore MVP (new)

| ID | Test | Asserts |
| --- | --- | --- |
| BK-01 | WAL-safe snapshot | A row inserted but not checkpointed is present in the backup (proves the Online Backup API is used, not a file copy) |
| BK-02 | Manifest integrity | SHA-256 and size match the file; `verify` reports no problems; `schemaVersions` = `[1, 2]`; `integrityCheck` = `ok` |
| BK-03 | Tamper detection | Appending one byte makes `verify` fail with a checksum problem |
| BK-04 | Restore round-trip + rollback | Data added after the backup disappears, data present at backup time returns, schema is usable, the `*.pre-restore-*` copy verifies **and can itself be restored** to undo the restore |
| BK-05 | Refuses a live database | Restore throws while a connection holds the `-shm` mapping (EBUSY on delete) |
| BK-06 | Missing manifest | A backup without a manifest is reported unverified and cannot be restored |
| BK-07 | Retention | With `keep = 2`, only the two newest backups and their manifests remain; unrelated files in the directory are untouched |

---

## 3. Regression rules

- **Never modify** `auth.ts`, the `preHandler` hook, or CSRF logic to make a new test pass. If a
  new feature needs a change there, it is a security change and requires a separate decision
  entry in `DECISIONS.md`.
- Any change to `database.ts` must keep DB-01..03 green and add a migration test.
- Any change to backup behaviour must keep BK-01..07 green and update `BACKUP.md` in the same
  commit.

---

## 4. Manual test cases (L4 — not automated)

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| M-01 | Admin bootstrap | `DATA_DIR=<abs> npm run bootstrap:admin` in an interactive terminal | Hidden password prompt; user created; second run refused |
| M-02 | Bootstrap without TTY | Pipe stdin instead of a terminal | Clear error, exit code 1, no user created |
| M-03 | Missing `DATA_DIR` | `npm run dev:server` with no `DATA_DIR` | Startup fails with an explicit message, no partial DB |
| M-04 | Relative `DATA_DIR` | `DATA_DIR=./data` | Startup fails: `DATA_DIR must be an absolute path` |
| M-05 | Login persistence | Restart the server, reuse the cookie | Still authenticated (session is in SQLite, not memory) |
| M-06 | Throttle reset | Restart after 5 failures | Throttle state is gone (known limitation, must be documented not "fixed" silently) |
| M-07 | Cross-origin POST | `curl` POST without `Origin`/`X-PKH-Request` | 403 |
| M-08 | Scheduled backup | Let Task Scheduler run once | New backup + manifest, `verify` passes |
| M-09 | Restore drill | `docs/BACKUP.md` §9 | All five steps pass |
| M-10 | Disk separation | Inspect volumes of `DATA_DIR` and `BACKUP_DIR` | Different physical disks |

---

## 5. Commands

```bash
npm test                    # all automated tests
npm run build:server        # TypeScript must compile with strict mode
npm run lint                # web package ESLint
npm run build:web           # Vite production build
```

Expected baseline after T15: 4 test files, 35 tests, 0 failures.

---

## 6. Exit criteria for Phase 2

- [ ] All automated tests pass, including backup/restore.
- [ ] `build:server`, `build:web`, and `lint` pass with no errors.
- [ ] M-01..M-04 verified by an operator on the real machine.
- [ ] A backup exists, verifies, and has been restored once into a scratch directory.
- [ ] No secrets, databases, or `dist/` output tracked by Git (`git status` clean after a build).

Remote access is **not** part of Phase 2 exit and stays blocked by `docs/ACCEPTANCE.md`.

## 7. T08 — Thai search strategy evaluation (evaluated, not implemented)

| ID | Test | Asserts / measures | Current result |
| --- | --- | --- | --- |
| T08-01 | Driver capability | Existing `better-sqlite3` can create `fts5(... tokenize='trigram')` and match Thai; a 2-code-point trigram query returns no match | PASS on recorded baseline |
| T08-02 | Thai segmenter | ICU supports locale `th`; sample Thai sentence segments into words | PASS on recorded baseline |
| T08-03 | Accuracy corpus | 200 synthetic note-like records; 21 predeclared query cases against an independent NFC substring oracle, including distinct NFC/NFD `Café` queries | Trigram/hybrid 100% P/R; token FTS recall 78.05% |
| T08-04 | 10k benchmark | Warm-up + measured query latency, FTS page size, index-build time, insert/update cost for all three approaches | Measured; see `DECISIONS.md` |
| T08-05 | Bounded short queries | One-/two-code-point queries including Thai letter, repetition mark, tone-marked text; additionally compare exact matches over the 10k archive to bounded results | 200-note fallback cases pass; bounded/indexed full-archive recall is below 95% |
| T08-06 | NFC/NFD, mixed language, digits, partial/mid-sentence, no-hit | Expected matches fixed by exact substring oracle before evaluating each FTS strategy | Includes genuinely distinct NFC/NFD `Café`, English+Thai, numeric, partial, middle, and no-hit cases |
| T08-07 | Full-scan short-query fallback (B2) | 10k temporary rows; NFC `instr()` matching; owner and non-trashed filtering; 7 one-/two-code-point queries; count plus page 1/2/last/beyond-end exact results | Synthetic direct-SQLite result 100% precision/recall; p50 58.29 ms, p95 103.42 ms. Not an HTTP/API acceptance test; decision awaits user |

Run:

```powershell
node tests\thai-search-evaluation.mjs
```

The script uses only `better-sqlite3` already in the server workspace and SQLite files under the OS
temporary directory; `finally` removes that directory. It is a standalone Node assertion/benchmark
because the repository's Vitest command targets `apps/server/src`; it does not access `DATA_DIR`.
The result is a **research outcome**, not an API/UI acceptance test. The proposed policy is to reject
queries shorter than 3 Unicode code points with a Thai explanation; do not describe short search as
passing the 95% criterion. No endpoint or UI has been implemented.
