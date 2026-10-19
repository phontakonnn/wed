# Database Schema

**Status:** reflects migrations `001_initial`, `002_notes`, and `003_notes_search`, and
`apps/server/src/database.ts` as of 2026-10-19.
**Engine:** SQLite (via `better-sqlite3` 13.0.3), `journal_mode = WAL` for file-backed databases.
**Database file:** `DATA_DIR/db/knowledge.sqlite3`

> This document describes what the code does today. Notes, the original Notes FTS5 index, and
> user-facing substring search are implemented. Bookmarks, tags, and files are not implemented yet.

---

## 1. Connection pragmas

Applied by `openDatabase()` every time a connection is opened:

| Pragma | Value | Reason |
| --- | --- | --- |
| `foreign_keys` | `ON` | Enforce referential integrity (SQLite default is OFF). |
| `busy_timeout` | `5000` ms | Wait instead of failing immediately on a short lock. |
| `journal_mode` | `WAL` | Only for file-backed databases. In-memory (`:memory:`) keeps SQLite's default. |

`openDataDatabase()` requires `DATA_DIR` to be an **absolute** path and creates `DATA_DIR/db`
recursively before opening the file.

---

## 2. Migration framework

Migrations are forward-only SQL files in `apps/server/migrations/`, named `NNN_description.sql`.

The tracking table is created in application code, not in a migration file:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at INTEGER NOT NULL   -- Unix epoch milliseconds
);
```

On open, the runner discovers SQL files matching `NNN_description.sql`, sorts them by version, and
requires a gap-free sequence beginning at 001. Each unapplied migration and its tracking row are
applied in an individual transaction. A failed migration rolls back its schema changes. An applied
history with gaps, or a database schema newer than the available migration set, is rejected rather
than silently skipped or downgraded.

Migration files are forward-only. Never edit a migration after it has been deployed; add the next
numbered file instead.

---

## 3. Tables

### 3.1 `users`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID v4 (`randomUUID()`). |
| `username` | TEXT | NOT NULL, UNIQUE, `COLLATE NOCASE` | Trimmed and NFC-normalized before insert. 1–80 printable characters; control characters `U+0000`–`U+001F` and `U+007F` rejected. |
| `password_hash` | TEXT | NOT NULL | Encoded scrypt string, see §4. |
| `created_at` | INTEGER | NOT NULL | Unix epoch milliseconds. |

Only one row can exist in practice: `bootstrapUser()` refuses to run when `COUNT(*) != 0`.
There is no registration route.

### 3.2 `sessions`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id_hash` | TEXT | PRIMARY KEY | SHA-256 **hex** of the raw session token. The raw token is never stored. |
| `user_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Deleting a user removes their sessions. |
| `user_agent` | TEXT | NOT NULL, DEFAULT `''` | Truncated to 512 characters. Used as a human-readable device label. |
| `created_at` | INTEGER | NOT NULL | Epoch ms. |
| `last_seen_at` | INTEGER | NOT NULL | Epoch ms, updated on each successful `resolveSession()`. |
| `idle_expires_at` | INTEGER | NOT NULL | Epoch ms. Sliding, 7 days from last activity, clamped to `absolute_expires_at`. |
| `absolute_expires_at` | INTEGER | NOT NULL | Epoch ms. Fixed, 30 days from creation. Never extended. |

**Indexes**

| Name | Columns | Purpose |
| --- | --- | --- |
| `sessions_user_id_idx` | `user_id` | Session listing and bulk revocation per user. |
| `sessions_idle_expiry_idx` | `idle_expires_at` | Candidate index for future expired-session cleanup. |

> Note: `sessions_idle_expiry_idx` currently has no consumer. There is no background sweeper;
> expired rows are deleted lazily when `resolveSession()` encounters them.

### 3.3 `notes`

Created additively by `002_notes.sql`. Notes are scoped to their owner, and deleting an owner
cascades as required by the existing user/session ownership model.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID v4. |
| `owner_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Every read and write is scoped to the authenticated session owner. |
| `title` | TEXT | NOT NULL, length 1–200 | API trims whitespace and rejects an empty title. |
| `content` | TEXT | NOT NULL, maximum 100,000 characters | Plain text; HTML is not rendered. Empty content is allowed. |
| `created_at` | INTEGER | NOT NULL | Epoch ms. |
| `updated_at` | INTEGER | NOT NULL | Epoch ms; changes on edits and soft deletion. |
| `deleted_at` | INTEGER | NULL | NULL means active. Deletion sets a timestamp; the row is retained. |

`notes_owner_updated_idx` supports the active-note list ordered by update time and ID.
Restore clears `deleted_at` without replacing the note row, preserving its existing title/content.
The migration does not define tags, categories, or note relation tables.

### 3.4 `notes_fts`

FTS5 virtual table maintained by insert/update/delete triggers on `notes`. It indexes title and
content; note ID and owner ID are unindexed metadata columns. Soft-deleting a note removes it from
the index. Restoring a note adds it back, and permanently deleting a note removes it; both behaviors
use the existing SQLite triggers on `notes`. This original table and its tokenizer remain unchanged
by the search feature.

### 3.5 `notes_fts_trigram`

Added additively by `003_notes_search.sql`. FTS5 trigram indexes the NFC-normalized title and
content for active notes. `note_id` and `owner_id` are unindexed metadata. The migration backfills
all current non-trash notes and installs insert/update/delete triggers; updates remove the old row
and add it again only when the note remains active. Soft delete, restore, and permanent deletion
therefore keep this index aligned with `notes` in the same SQLite transaction.

`openDatabase()` registers a deterministic SQLite `nfc()` scalar function before applying
migrations. The migration and write triggers use it to normalize indexed text without rewriting
saved note content. Trigram search uses this index for queries of at least 3 Unicode code points.
One- and two-code-point queries use a normalized `instr()` scan instead and do not require a
persisted short-query index.

---

## 4. Password hash format

```
scrypt$32768$8$1$<salt_base64url>$<derived_key_base64url>
```

| Field | Value |
| --- | --- |
| Algorithm | `scrypt` (Node built-in `crypto.scrypt`) |
| `N` (cost) | 32768 |
| `r` (block size) | 8 |
| `p` (parallelization) | 1 |
| Salt | 16 random bytes |
| Derived key | 64 bytes |
| `maxmem` | 64 MiB |
| Minimum password length | 12 Unicode code points (counted with `[...password]`, not UTF-16 units) |

`verifyPassword()` rejects the hash when the algorithm, `N`, `r`, `p`, salt length, or key length
do not match the current parameters, and compares with `timingSafeEqual`. Re-hashing on parameter
change is **not** implemented.

---

## 5. Session token lifecycle

1. `createSession()` generates 32 random bytes, encodes them as base64url (the raw token).
2. Only `sha256(token)` hex is written to `sessions.id_hash`.
3. The raw token is returned once and placed in the `pkh_session` cookie.
4. `resolveSession()` hashes the presented token, loads the row, and rejects it if either
   `idle_expires_at` or `absolute_expires_at` is `<= now` (deleting the row in that case).
5. On success it sets `last_seen_at = now` and
   `idle_expires_at = MIN(absolute_expires_at, now + 7 days)`.

Because only the hash is stored, a database leak does not directly yield usable cookies.

---

## 6. Data type conventions

- **All timestamps are INTEGER Unix epoch milliseconds** (`Date.now()`). No SQLite `DATETIME`
  strings, no timezone ambiguity.
- **IDs are TEXT**: UUID v4 for users and notes; SHA-256 hex for sessions.
- **Booleans** are not stored yet; when needed, use `INTEGER` 0/1.

---

## 7. Not yet in the schema

The following are design targets from `ARCHITECTURE.md` and are not yet implemented:

- `bookmarks`, `categories`, `tags`, `note_tags`, `files`, `favorites`
- audit/event log
- backup metadata tables (backup state lives in sidecar JSON files, not in SQLite)

Do not assume these exist when writing queries.
Trash listing, restore, and confirmed permanent deletion operate on the existing `notes.deleted_at`
field; no migration was required for T15. Tags, categories, and note relations do not exist, so
restoration of those features is not testable yet.

### Search migration and backup requirement

Migration 003 is additive: it leaves `notes`, migration 002, and the existing `notes_fts` table and
triggers intact while adding the trigram table and its synchronization triggers. It was tested on
temporary databases, including an upgrade where existing active and deleted Notes were present.
Before applying it to any database with existing data, create and verify a backup as required by
`BACKUP.md`. No production database was migrated during the search implementation.

---

## 8. Changing the schema

1. Add `apps/server/migrations/00N_description.sql` at the next sequential version. Never edit an applied migration.
2. The runner discovers and applies the new migration transactionally.
3. Add tests in `database.test.ts` for fresh install and upgrade preservation.
4. Run `npm test` and `npm run build:server`.
5. Take a backup before deploying to any database that holds real data (see `BACKUP.md`).

## 9. Proposed file storage schema (not implemented; migration proposal only)

The following is a design proposal for the next sequential migration, `004_files.sql`. No migration
file was created or run, and these tables do not exist in the current database. The migration must
be additive and forward-only; it must not modify or rebuild existing tables, notes, or FTS indexes.
Test it only against fresh and disposable temporary databases. Before applying any migration to a
database containing data, create and verify a backup under the existing backup procedure.

### 9.1 Proposed `files` table

```sql
CREATE TABLE files (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256         TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  media_type     TEXT NOT NULL,
  object_key     TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL
);

CREATE INDEX files_owner_created_idx
  ON files(owner_id, created_at DESC, id DESC);
```

Design notes:

- `id` is a random UUID v4 generated by the server. `object_key` is the same server-generated UUID
  in canonical lowercase form and is not a client path. The on-disk location is derived as
  `DATA_DIR/objects/<first-two-id-characters>/<id>`.
- `owner_id` is assigned from the authenticated session only. Every lookup and mutation is scoped
  by both `id` and `owner_id`; other-owner and missing IDs have the same external response.
- `display_name` is validated and Unicode NFC-normalized before insert. It contains no path and is
  never used to construct an OS path. Display names are not unique; case-colliding and normalized
  duplicate names remain separate records because their IDs differ.
- `media_type` is assigned by server-side content inspection and is used with an allowlist for
  preview; the client-supplied Content-Type is not authoritative.
- SHA-256 is the lowercase 64-character hex digest of the complete stored object. `size_bytes` is
  verified against the received byte count.
- The proposed table intentionally contains no unapproved note relation, categories, tags, or
  automatic file deletion behavior. Trash/retention semantics for files must be decided separately
  before implementation.

### 9.2 Proposed `upload_sessions` table

```sql
CREATE TABLE upload_sessions (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  expected_size      INTEGER NOT NULL CHECK (expected_size > 0),
  received_offset    INTEGER NOT NULL DEFAULT 0
                       CHECK (received_offset >= 0 AND received_offset <= expected_size),
  temp_key           TEXT NOT NULL UNIQUE,
  state              TEXT NOT NULL
                       CHECK (state IN ('receiving', 'finalizing', 'completed', 'cancelled', 'expired')),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  completed_file_id  TEXT REFERENCES files(id) ON DELETE SET NULL
);

CREATE INDEX upload_sessions_owner_expiry_idx
  ON upload_sessions(owner_id, state, expires_at);

CREATE INDEX upload_sessions_expiry_idx
  ON upload_sessions(state, expires_at);
```

Design notes:

- `id` is the random Tus upload ID and is not a bearer credential. Every route must also verify
  `owner_id` against the authenticated session.
- `temp_key` is an internal opaque ID used to derive `DATA_DIR/tmp/<id>.part`; it is not a path
  supplied by the client. The upload body remains on disk, not in SQLite.
- `received_offset` is the last durable offset only. For Tus PATCH, the server serializes writes per
  upload ID, streams a chunk, verifies it, fsyncs the part file, then commits the new offset. On
  recovery, bytes past the committed offset may be reconciled only while holding exclusive
  ownership of that upload; do not advance an offset from file length alone.
- `finalizing` allows startup/operator reconciliation when a process stops between final rename and
  metadata commit. It is not permission to delete an object automatically.
- Proposed expiry defaults are 24 hours idle and 7 days absolute, as described in `API.md`.
  Expiry cleanup must prove there is no live writer/session, and must log every removal. Preserve
  orphan objects and metadata for operator review.
- The SQL above is a starting proposal only. Validate SQLite CHECK/FK behavior and the migration
  runner's transaction semantics in temporary databases before seeking migration approval.

### 9.3 Cross-resource consistency and recovery

SQLite cannot atomically commit with a filesystem rename. The proposed order is: write/hash
`.part`; fsync; atomic rename into the UUID object shard; then insert the `files` row and update the
upload state in one DB transaction. If the DB transaction fails, retain and log the unreferenced
object; do not remove it automatically. If the row exists but the object is missing, deny download,
log the missing object, and flag it for explicit recovery. Startup reconciliation reports `.part`
files without a live session, objects without rows, and rows without objects; it never deletes
objects or rows automatically.
