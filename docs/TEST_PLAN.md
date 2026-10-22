# Test Plan

**Status:** reflects the automated suite as of 2026-10-19, including Notes search, backup/restore,
and the pre-migration backup guard.
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

### 2.1 `database.test.ts` — schema and connection behaviour (10 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| DB-01 | Applies versioned schema, enables foreign keys | `foreign_keys = 1`; `schema_migrations` contains versions 1–8; sessions, Notes FTS, trigram FTS, bookmarks, categories, tags, relation tables, favorites, files, people, note_people, reminders, life_timeblocks and habits exist |
| DB-02 | WAL for file-backed databases | `journal_mode = wal`; `busy_timeout = 5000` |
| DB-03 | Rolls back a failed transaction | Insert inside a throwing transaction leaves zero rows |
| DB-04 | Applies additive Notes migration | Fresh database has versions 1 and 2, Notes table and FTS5 table |
| DB-05 | Preserves data on upgrade | Existing version-1 user row remains after applying version 2 |
| DB-06 | Rejects migration gaps and rolls back failure | Missing sequence rejected before changes; failed SQL rolls back schema and version record |
| DB-07 | Search migration trigger behavior | Existing active note content is backfilled into trigram FTS; trash stays excluded; insert/update/restore/delete keep the index aligned |
| DB-08 | Additive bookmarks migration | Applying v4 after v1–v3 preserves existing user and note rows and creates owner foreign key |
| DB-09 | Additive categories/tags migration | Applying v5 after v1–v4 preserves existing user/note rows; creates owner-scoped categories/tags and relations; owner-mismatch triggers reject invalid links; Note deletion cascades relation rows |
| DB-10 | Additive favorites/files migration | Applying v6–v7 after v1–v5 preserves existing user, note and bookmark rows; favorite target owner mismatch is rejected; bookmark deletion removes its favorite; `files` has an owner foreign key and rejects a missing owner |
| DB-12 | Additive work-core migration | Applying v9 adds goals/projects/tasks/checklist/inbox; project↔goal, task↔project, task↔goal, task↔person and checklist↔task owner mismatches abort at the trigger; deleting a project keeps its tasks with `project_id = NULL` |
| DB-11 | Additive Life OS migration | Applying v8 after v1–v7 preserves existing rows; person/avatar, note/person and reminder/person owner mismatches are rejected by triggers; deleting a person cascades `note_people` and nulls `reminders.linked_person_id` |

### 2.2 `auth.test.ts` — primitives (3 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| AU-01 | scrypt hashing and minimum length | <12 chars rejects; hash does not contain the password; correct password verifies; wrong password fails |
| AU-02 | One-time bootstrap | Username stored; hash matches `^scrypt$`; second bootstrap throws `already initialized` |
| AU-03 | Token hashing and expiry | Stored value equals `sha256(token)` and differs from the token; alive at day 3 and day 9 (sliding); dead at day 17 (idle); dead at day 31 (absolute) |

### 2.3 `index.test.ts` — HTTP behaviour (38 tests)

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
| API-20 | Health database probe failure | A closed database returns generic 503 without database details |
| API-21 | Global security headers | CSP, `nosniff`, frame denial, referrer policy, and deny-all `Permissions-Policy` are present; HSTS is not set on local HTTP |
| API-22 | Bookmark authentication and CSRF | Anonymous reads/writes are denied; mutating requests without CSRF headers return 403 |
| API-23 | Bookmark CRUD and validation | Create/list/detail/update/delete; invalid title, unsupported URL scheme, embedded URL credentials, and empty patch are rejected |
| API-24 | Bookmark owner isolation | Another owner cannot list/read/update/delete a bookmark |
| API-25 | Bookmark pagination | Default size 50, page boundaries, maximum 200, and rejection of 201 |
| API-26 | Categories/tags CRUD, authentication, and CSRF | Owner-scoped create/list/rename/delete, normalized names, duplicate-name conflict, invalid-name rejection, anonymous 401, and missing-CSRF 403 |
| API-27 | Note taxonomy ownership and Trash lifecycle | Active-note relation read/write, invalid/foreign IDs rejected without replacing existing links, owner isolation, and relations retained after soft delete/restore |
| API-28 | Taxonomy pagination, duplicate IDs, and cascade | Category list pages/count and 200 maximum; duplicate relation IDs rejected; deleting taxonomy items removes only their relations |
| API-29 | Spoofed X-Forwarded-For | Five failures with different forged forwarding headers still throttle the sixth request with 429, proving the socket address is used |
| API-30 | Malformed login bodies | Missing username/password and empty strings return 400 without creating a throttle entry |
| TH-01..08 | Throttle bounds (unit) | Map cap, expired-first eviction, `clear`, window expiry, no entry creation on read, blocked bucket survives churn, IP bucket still enforces when full, least-progressed eviction |

The current restore/Trash behavior preserves category and tag relations across soft delete and
restore (API-27, using an in-memory database). Favorites deliberately survive a soft delete and are
covered by FAV-05. There is no note↔file relation, so nothing of that kind is tested.

### 2.4 `backup.test.ts` — backup/restore, objects and encryption (25 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| BK-01 | WAL-safe snapshot | A row inserted but not checkpointed is present in the backup (proves the Online Backup API is used, not a file copy) |
| BK-02 | Manifest integrity | SHA-256 and size match the file; `verify` reports no problems; `schemaVersions` = `[1, 2, 3, 4, 5, 6, 7]`; `integrityCheck` = `ok` |
| BK-03 | Tamper detection | Appending one byte makes `verify` fail with a checksum problem |
| BK-04 | Restore round-trip + rollback | Data added after the backup disappears, data present at backup time returns, schema is usable, the `*.pre-restore-*` copy verifies **and can itself be restored** to undo the restore |
| BK-05 | Refuses a live database | Restore throws while a connection holds the `-shm` mapping (EBUSY on delete) |
| BK-06 | Missing manifest | A backup without a manifest is reported unverified and cannot be restored |
| BK-07 | Retention | With `keep = 2`, only the two newest backups and their manifests remain; unrelated files in the directory are untouched |
| BKR-01 | Failed rename preserves destination | If atomic rename fails, an existing destination remains unchanged; a failed operation never removes it as a fallback |
| BK-08 | AES-GCM backup round-trip | Encrypted artifact is not plaintext SQLite; correct key verifies/restores; missing and incorrect keys fail; encrypted restore safety copy verifies |
| BK-09 | Required encryption fails closed | `BACKUP_ENCRYPTION_REQUIRED=true` without a key rejects backup creation before creating an artifact |
| BK-10 | Objects captured and restored | A backup with `dataDirectory` records the object count/bytes in the manifest, the snapshot directory exists and verifies; after deleting the live object, restore returns identical bytes and `objectsRestored = 1` |
| BK-11 | Object tamper detection | Rewriting an object with the same byte length makes `verify` fail with an object snapshot mismatch |
| BK-12 | Safety copy is a complete rollback | After a restore that replaced objects, the safety copy verifies with its own object manifest, and one `restore` of it returns the pre-restore object and removes the restored one |
| BK-13 | Object snapshots are pruned | Pruning a backup removes its `.objects` directory; the retained backup's snapshot remains |
| BK-14 | No data directory, no snapshot | Without `dataDirectory` the manifest has no `objects` entry and verification still passes |
| BK-15 | Encrypted object snapshot | With a key, every object is stored as `.enc` with the `PKHBAK01` envelope and no plaintext bytes; the manifest records `objects.encryption` and `formatVersion: 2`; verify passes with the key and fails without it or with a wrong key |
| BK-16 | Encrypted restore | Wrong key is refused during verification before the object store is touched; the correct key restores identical bytes |
| BK-17 | Tampered ciphertext | A flipped ciphertext byte with a recomputed stored hash still fails GCM authentication |
| BK-18 | Truncated object | A truncated `.enc` file fails the stored-size check |
| BK-19 | Manifest/plaintext mismatch | A changed plaintext hash in the inventory fails decryption comparison |
| BK-20 | Missing and unexpected objects | Adding an unlisted file and deleting a listed file are each detected |
| BK-21 | Database↔object relation | A `files` row with no object, or file rows with no snapshot, fails verification |
| BK-22 | Legacy manifest | A plaintext manifest without `formatVersion`/`files` still verifies by count/size/tree hash |
| BK-23 | Encrypted safety copy | After an encrypted restore, the safety copy declares object encryption, stores only `.enc` files, verifies, and rolls back database + files in one command |
| BK-24 | No scratch on object verify | Verifying an encrypted backup creates no `DATA_DIR/tmp` scratch files |

### 2.5 `safe-open.test.ts` — pre-migration backup guard (3 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| MIG-01 | Backup before pending migration | A temporary version-2 database with user/note rows gets a verified, unpruned version-2 backup before opening at version 5; rows remain intact |
| MIG-02 | Backup failure aborts migration | If the configured backup location is unusable, startup rejects and the temporary database stays at version 2 with its note and original journal mode intact |

### 2.6 `favorites.test.ts` — favorites API (8 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| FAV-01 | Authentication and CSRF | Anonymous list → 401; `PUT` without the CSRF header → 403 |
| FAV-02 | Idempotent add and status | Two `PUT`s return 204 with one row; status true; list carries title; delete returns 204 and status false |
| FAV-03 | Invalid targets | Missing note and another owner's note both return 404 and write nothing |
| FAV-04 | Owner isolation | Another user sees an empty list and `favorited: false`, cannot delete, and the original row survives |
| FAV-05 | Trash lifecycle | A favorited note disappears from the list when trashed, the row is retained, and restore makes it visible again without re-favoriting |
| FAV-06 | Bookmark favorites | Bookmark favorite is listed with `itemType: bookmark` and the URL as subtitle |
| FAV-07 | Cascade cleanup | Deleting a bookmark and permanently deleting a note remove their favorite rows |
| FAV-08 | Pagination and validation | Page boundaries with `pageSize = 2`; an unsupported `itemType` returns 400 |

### 2.7 `files.test.ts` — file storage API (14 tests)

All tests use a temporary `DATA_DIR` created with `mkdtemp`; no real data directory is touched.

| ID | Test | Asserts |
| --- | --- | --- |
| FILE-01 | Store and metadata | 201 with size, SHA-256 and detected `image/png`; object exists at the sharded UUID path with identical bytes; no `.part` remains |
| FILE-02 | Inline serving and HEAD | 200 with exact bytes, `image/png`, `nosniff`, inline disposition, `Accept-Ranges`; HEAD returns headers and an empty body |
| FILE-03 | Active content is an attachment | HTML upload is stored as `application/octet-stream` and served with `attachment` + `nosniff` |
| FILE-04 | Byte ranges | `bytes=0-3` → 206 with 4 bytes and exact `Content-Range`; suffix range works; beyond-end and malformed/multiple ranges → 416 with `bytes */<size>` |
| FILE-05 | Filename rejection | Traversal, backslash, ADS colon, `CON`/`CON.txt`/`nul.log`/`COM1.tar.gz`/`LPT9`, trailing dot/space, overlong, control character, and malformed percent encoding all return 400 and create no object |
| FILE-06 | NFC and duplicate names | NFD and NFC spellings are stored as the same NFC display name; duplicate display names remain distinct records |
| FILE-07 | Auth, CSRF, declared size | Anonymous → 401; missing CSRF → 403; zero/missing `Content-Length` → 411 |
| FILE-08 | Size limit | `MAX_UPLOAD_BYTES=100` rejects a 200-byte upload with 413 and writes no row |
| FILE-09 | Owner isolation | Another user gets 404 for GET/HEAD/DELETE, an empty list, and the object is untouched |
| FILE-10 | Delete | 204 removes the row and the object; a later GET returns 404 |
| FILE-11 | Missing object | Deleting the object from disk makes GET return a generic Thai 500 with no path in the body |
| FILE-12 | HEAD without CSRF | HEAD is not origin-checked but still returns 401 without a session and 404 for an unknown ID |
| FILE-13 | Listing and pagination | Newest-first list, `total = 3`, page boundaries with `pageSize = 2` |
| FILE-14 | Large streaming payload | A 2 MiB upload succeeds, matches its SHA-256, and downloads byte-identically, proving the body is streamed past Fastify's default body limit |

### 2.8 `storage.test.ts` — reconciliation (11 tests)

All tests use in-memory metadata plus a temporary `DATA_DIR`.

| ID | Test | Asserts |
| --- | --- | --- |
| ST-01 | Consistent store | Row + object with matching size/hash reports clean |
| ST-02 | Missing object | Row without a file is reported with its expected path |
| ST-03 | Orphan object | File without a row is reported as an orphan |
| ST-04 | Size vs hash mismatch | The two failure kinds are reported separately, not conflated |
| ST-05 | Unexpected path | A non-canonical file name is `unexpected`, not an orphan |
| ST-06 | Temp ageing | Files older than the threshold are stale; newer ones are active |
| ST-07 | Duplicate keys | Duplicate `object_key` values are detected even without the schema constraint |
| ST-08 | Fast pass | `skipHashes` disables content hashing and reports `hashVerified: false` |
| ST-09 | Quarantine move | Orphan objects and stale temp files move to `quarantine/<stamp>/` with a JSON record; valid objects stay; nothing is deleted |
| ST-10 | Quarantine race | A file that gained a metadata row after the scan is skipped |
| ST-11 | Clean quarantine | A clean store produces no moves |

### 2.9 `backup-preflight.test.ts` — configuration preflight (5 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| PF-01 | Distinct directories | Accepted; data bytes counted from db + objects; same-volume warning; physical disk always `NOT VERIFIED` |
| PF-02 | Same directory | Rejected as an error |
| PF-03 | Nested destination | Warned, not rejected |
| PF-04 | Required key missing | Rejected as an error |
| PF-05 | Optional encryption | Warns that plaintext backups are possible |

### 2.10 `backup-keys.test.ts` — key ring and rotation (12 tests)

All keys are synthetic and generated in-process; none is printed.

| ID | Test | Asserts |
| --- | --- | --- |
| KEY-01 | Empty configuration | No active key, no id, empty ring |
| KEY-02 | Required but missing | Fails closed, including when only a ring is present |
| KEY-03 | Malformed material | Invalid base64/id rejected; the error does not echo the secret |
| KEY-04 | Malformed ring | Bad JSON, array, non-string entry, and active/id conflict rejected |
| KEY-05 | Ring selection | Active key registered under its id; lookup by id only; unknown id returns null |
| KEY-06 | Explicit override | Override key without an id is accepted |
| KEY-07 | Manifest key ids | Database and object manifests record the same key id |
| KEY-08 | Rotation | A backup made with the old key verifies and restores after the active key rotates, using the ring |
| KEY-09 | Missing ring entry | Fails with `No backup key is configured for key id …` and no key material in the message |
| KEY-10 | Mixed key ids | A database/object key-id mismatch is rejected |
| KEY-11 | No secret in manifest | The raw manifest does not contain the key or its hex form |
| KEY-12 | Fresh IV per object | Two encrypted objects in one backup have different IVs |

### 2.11 `backup-disk.test.ts` — physical disk probe (11 tests)

All tests inject a fake runner; no real machine query runs.

| ID | Test | Asserts |
| --- | --- | --- |
| DSK-01 | Drive letter mapping | Partition output maps to `Disk N`; the script asks only for the validated letter |
| DSK-02 | WMI fallback | `cim:N` output is accepted and the method is recorded |
| DSK-03 | Case and spaces | Lower-case drive letters and paths with spaces map correctly |
| DSK-04 | Mount point | A mount point on a drive-letter volume still maps through that volume |
| DSK-05 | UNC path | No runner call; `physicalDisk: null`, method `unc` |
| DSK-06 | Unsupported platform | `physicalDisk: null`, method `unsupported-platform` |
| DSK-07 | Query failure / empty output | `unavailable` with a reason, never a guessed disk |
| DSK-08 | Same disk | `sameDisk: true` with evidence |
| DSK-09 | Different disks | `sameDisk: false` with both disk numbers |
| DSK-10 | One side unknown | `sameDisk: null` |
| DSK-11 | Non-Windows comparison | Both sides unknown; no PASS is implied |

### 2.12 `backup-e2e.test.ts` — full restore integration (3 tests)

Synthetic data only; every table and object is created in a temporary directory.

| ID | Test | Asserts |
| --- | --- | --- |
| E2E-01 | Every data type and relation | Notes, bookmarks, categories, tags, note-category/tag links, favorites, file metadata and objects, people, note-person links, reminders, timeblocks and habits survive an encrypted backup, destruction and restore with exact counts, content, owner boundaries, checksums and a verifiable safety copy |
| E2E-02 | Tampered backup rejected | A flipped ciphertext byte makes verification fail and restore throws before any live row or object changes |
| E2E-03 | Mid-restore rollback | With a second handle holding the live database open and `force`, the object store is swapped and then the database rename fails; the object store is restored to its pre-restore state and the live database is unchanged |

### 2.13 `staging.test.ts` — plaintext staging report (4 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| STG-01 | All kinds | Create/verify/restore staging directories are reported with size and age |
| STG-02 | Filtering | Unrelated directories and same-prefix files are ignored; newest/oldest sort is stable |
| STG-03 | Missing root | Returns an empty list |
| STG-04 | Injected clock | The stale decision follows the supplied `now` and threshold |

### 2.14 `life-os.test.ts` — people, reminders, schedule, habits, search (9 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| LOS-01 | Person CRUD | Create/read/patch/delete round-trip; NFC name, role, likes, allergies and gift text are stored verbatim |
| LOS-02 | Person validation | Empty name, unknown relationship group and a non-ISO birthday are rejected with 400 |
| LOS-03 | Person privacy | Another owner's person id returns 404 for read, patch and delete; the list never leaks it |
| LOS-04 | Note ↔ person links | Linking, listing through `/api/people/:id/notes`, and replacing the set through the taxonomy PUT |
| LOS-05 | Reminders | Create, list, `upcoming` window, mark complete and delete |
| LOS-06 | Reminder validation | Invalid `targetDate` and a foreign `linkedPersonId` are rejected with 400 |
| LOS-07 | Timeblocks | Create for a date, toggle `isDone`, delete |
| LOS-08 | Habits | Increment caps at `daily_target`; a second check on the same day does not advance the streak |
| LOS-09 | Command palette | `/api/search` matches Thai text in a person's likes and allergies and returns grouped results |

### 2.15 `work.test.ts` — inbox, tasks, projects, goals, search (15 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| WRK-01 | Inbox capture | Session required; text is trimmed and NFC-normalized; a bare URL becomes `kind = url`; blank body is 400; `newCount` matches |
| WRK-02 | Inbox edit/archive/delete | PATCH body and status; another owner gets 404 on delete; the owner gets 204 |
| WRK-03 | Inbox → note | Conversion creates a note (title = first line, content = full body), marks the item `triaged`, and a second attempt returns 409 without creating a task |
| WRK-04 | Inbox → task/project/bookmark/reminder | Each target creates the right row with the right status; reminder honours `targetDate` |
| WRK-05 | Inbox → bookmark without a URL | 400 and the item stays `new` with `converted_id` still null |
| WRK-06 | Task CRUD | Create/read/patch/delete; `completedAt` set on `done` and cleared on reopen |
| WRK-07 | Task validation and ownership | Bad date 400; another owner's project id 400; foreign task read/patch 404 |
| WRK-08 | Task filters | `open` excludes done; `due=overdue`/`today` select the right rows; `/api/tasks/today` buckets overdue/dueToday/upcoming and returns `today` |
| WRK-09 | Recurrence | Completing a weekly task returns `nextTask` at +7 days; re-saving returns `nextTask: null` and leaves exactly two rows |
| WRK-10 | Month-end clamp | Completing a monthly task due 2026-01-31 produces 2026-02-28 |
| WRK-11 | Checklist | Position increments; toggle; `checklistTotal/Done` on the task; parent stays `todo` when all items are done; foreign owner 404 |
| WRK-12 | Projects and goals | Task counts, delete-keeps-tasks, `progressPercent` null without a target and 25/50 with one, cross-owner goal 400, unified search finds Thai text in tasks/projects/goals |
| WRK-13 | Project task counts | `taskTotal`/`taskDone` reflect the real rows and survive a project delete |
| WRK-14 | Cross-owner goal link | A project pointing at another account's goal is 400 |
| WRK-15 | Unified search isolation | Thai text matches tasks/projects/goals for the owner only |

### 2.16 `dashboard.test.ts` — dashboard aggregate (8 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| DSH-01 | Session required | 401 without a cookie |
| DSH-02 | Empty account | Well-formed payload with `today`, empty arrays and zeroed counts — the UI never sees `undefined` |
| DSH-03 | Owner isolation and real counts | Alice's `dueToday`/`overdue`/`openTasks`/`inbox` reflect her rows only; Bob's task and inbox item never appear |
| DSH-04 | Today's timeblocks | `done`/`total` count only `block_date = today`; tomorrow's block is excluded |
| DSH-05 | Goal percentage honesty | 25 % with a real target; `null` for a goal without one and for `target_value = 0` |
| DSH-06 | Outstanding habits | A habit that reached its daily target disappears from the list |
| DSH-07 | Projects and notes | Active project carries `taskTotal`/`taskDone`; the newest note is first |
| DSH-08 | Habit week summary | `weekLogged` / `weekMetTarget` come from the logs of the last seven days |

### 2.17 `safe-open.test.ts` — schema-8 upgrade (added in Batch 1 review)

| ID | Test | Asserts |
| --- | --- | --- |
| SOP-03 | Schema 8 → latest on a real data directory | Builds a schema-8 `DATA_DIR` with notes, people, reminders and habits, then `openDataDatabaseSafely` creates a pre-migration backup whose manifest says `[1..8]`, applies 009 and 010, and verifies every pre-existing row, the new tables, and the habit legacy-counter migration (no invented logs) |

### 2.18 `habit-logs.test.ts` — habit history (11 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| HBL-01 | One log per day | Three checks on the same day leave a single row with `count = 3` |
| HBL-02 | Target cap | A fourth check on a target of 2 does not rewrite the log |
| HBL-03 | Exact count / delete | `PUT` sets the count, a second `PUT` keeps one row, `0` removes it |
| HBL-04 | Past correction recomputes the streak | Clearing yesterday drops the streak immediately; restoring it brings it back |
| HBL-05 | Incomplete today | A partial today does not break a 2-day streak |
| HBL-06 | Untracked days | Days before `trackingStartDate` come back as `null`, not `0` |
| HBL-07 | Weekly summary | `daysMetTarget`, `currentStreak` and `bestStreak` derive from the logs |
| HBL-08 | Date guards | Future dates and dates before the tracking start are 400 |
| HBL-09 | Owner isolation | Foreign habit is 404 in every route; a direct insert trips the trigger |
| HBL-10 | DB uniqueness | A duplicate `(habit_id, log_date)` insert throws `UNIQUE` |
| HBL-11 | Legacy preservation | Pre-history counters stay readable while the verified streak only counts logs |

### 2.19 `reminders.test.ts` — recurrence and snooze (13 tests)

| ID | Test | Asserts |
| --- | --- | --- |
| REM-01 | Anchor | Recurring reminders store `recurrenceAnchorDate`; one-off ones do not |
| REM-02 | Weekly roll | Completing moves +7, keeps the row open, and re-completing moves +14 with one row |
| REM-03 | Daily roll | +1 day |
| REM-04 | Month-end clamp | 31 Jan → 28 Feb → 31 Mar (the anchor restores the day) |
| REM-05 | Leap year | 29 Feb 2028 → 28 Feb 2029 → 28 Feb 2030 |
| REM-06 | One-off completion | Sets `isCompleted`; reopening clears `lastCompletedAt` |
| REM-07 | Snooze semantics | `snoozedUntil` moves, `targetDate` and the anchor do not |
| REM-08 | Snooze lengths | +1 / +3 / +7 produce the exact expected dates |
| REM-09 | Retry safety | A second snooze with the same `from` returns 409 and does not move again |
| REM-10 | Completed snooze | Snoozing a closed reminder is 409 |
| REM-11 | Snooze + recurrence | Completing clears the snooze and advances from `targetDate`, not the snoozed date |
| REM-12 | Upcoming window | A snoozed reminder leaves the short window and appears in the wider one |
| REM-13 | Owner isolation | Another account gets 404 |


---

## 3. Regression rules

- **Never modify** `auth.ts`, the `preHandler` hook, or CSRF logic to make a new test pass. If a
  new feature needs a change there, it is a security change and requires a separate decision
  entry in `DECISIONS.md`.
- Any change to `database.ts` must keep DB-01..03 green and add a migration test.
- Any change to backup behaviour must keep BK-01..07 and BKR-01 green and update `BACKUP.md` in the same
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

Latest suite counts and command results are recorded in `PROGRESS.md`; update this line after each
verification run rather than treating a prior count as current.

---

## 6. Exit criteria for Phase 2

- [ ] All automated tests pass, including backup/restore.
- [ ] `build:server`, `build:web`, and `lint` pass with no errors.
- [ ] M-01..M-04 verified by an operator on the real machine.
- [ ] A backup exists, verifies, and has been restored once into a scratch directory.
- [ ] No secrets, databases, or `dist/` output tracked by Git (`git status` clean after a build).

Remote access is **not** part of Phase 2 exit and stays blocked by `docs/ACCEPTANCE.md`.

## 7. T08 — Thai search strategy evaluation and implementation

| ID | Test | Asserts / measures | Current result |
| --- | --- | --- | --- |
| T08-01 | Driver capability | Existing `better-sqlite3` can create `fts5(... tokenize='trigram')` and match Thai; a 2-code-point trigram query returns no match | PASS on recorded baseline |
| T08-02 | Thai segmenter | ICU supports locale `th`; sample Thai sentence segments into words | PASS on recorded baseline |
| T08-03 | Accuracy corpus | 200 synthetic note-like records; 21 predeclared query cases against an independent NFC substring oracle, including distinct NFC/NFD `Café` queries | Trigram/hybrid 100% P/R; token FTS recall 78.05% |
| T08-04 | 10k benchmark | Warm-up + measured query latency, FTS page size, index-build time, insert/update cost for all three approaches | Measured; see `DECISIONS.md` |
| T08-05 | Bounded short queries | One-/two-code-point queries including Thai letter, repetition mark, tone-marked text; additionally compare exact matches over the 10k archive to bounded results | 200-note fallback cases pass; bounded/indexed full-archive recall is below 95% |
| T08-06 | NFC/NFD, mixed language, digits, partial/mid-sentence, no-hit | Expected matches fixed by exact substring oracle before evaluating each FTS strategy | Includes genuinely distinct NFC/NFD `Café`, English+Thai, numeric, partial, middle, and no-hit cases |
| T08-07 | Full-scan short-query fallback (B2) | 10k temporary rows; NFC `instr()` matching; owner and non-trashed filtering; 7 one-/two-code-point queries; count plus page 1/2/last/beyond-end exact results | Direct-SQLite oracle 100% precision/recall. Initial p50/p95 58.29/103.42 ms; commit-time rerun 58.13/171.28 ms. |
| T08-08 | Search API accuracy and safety | 24 fixed queries against an independent NFC literal-substring oracle, including 1–2 code points, emoji code-point counting, NFC/NFD, Thai/English, numeric and FTS metacharacters; session, owner/trash isolation, validation, pagination and rate limit | PASS in `apps/server/src/search.test.ts`; all 24 returned exact expected IDs; the 61st authenticated request returns HTTP 429 with `Retry-After`; 61 anonymous requests do not consume the authenticated limit. |
| T08-09 | Search HTTP latency, broad-match case | 10k temporary rows; loopback HTTP with session; 10 warm-up and 40 measured requests per path; default page size 50 | Three runs and variability are recorded in `DECISIONS.md`; all p95 values below 300 ms. |
| T08-10 | Selective/no-hit HTTP benchmark | 1%, 10%, no-hit corpora; real trigram and short full-scan API; same long query forced through test-only full-scan route; three runs per case | PASS: exact count expectations 100/1,000/0 against 9,600 active owner notes; p50/p95, population SD, and all three rounds are in `DECISIONS.md`. Same-query comparison is possible only for the 3+ code-point queries using the test-only forced scan; short queries intentionally route only through production full-scan. All p95 <300 ms. |
| T08-11 | Rate limit and debounce analysis | Route configuration, authenticated 61st request behavior, anonymous requests, 300 ms UI debounce | API: 60 requests per 1-minute window per client IP; request 61 returns 429. Calculation: an 8-keystroke burst typed over 0.8 s with inter-key gaps below 300 ms produces one search after the last key. Debounce is not a hard cap; 61 settled searches/minute could still hit 429. Browser UI behavior remains untested. |

Latest full verification after the expanded T08-10 benchmark: `npm.cmd test` — 5 test files,
42 passed, 0 failed, 0 skipped; `npm.cmd run lint`, `npm.cmd run build:server`,
`npm.cmd run build:web`, and `git --no-pager diff --check` completed successfully. The benchmark
was also run once as a harness validation and then three measured repetitions; all four invocations
passed. The browser UI remains **ยังไม่ได้ทดสอบใน browser**.

Run:

```powershell
node tests\thai-search-evaluation.mjs
```

The script uses only the existing `better-sqlite3` dependency and SQLite files under the OS
temporary directory; `finally` removes that directory. The HTTP/API benchmark runs in Vitest using
temporary in-memory SQLite and short-lived `127.0.0.1` listeners. No test accesses `DATA_DIR`.
The 24 API query expectations come from an independent literal-substring oracle, not from FTS.
