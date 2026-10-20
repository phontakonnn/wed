# Database Schema

**Status:** reflects migrations `001_initial` through `005_categories_tags`, and
`apps/server/src/database.ts` as of 2026-10-19.
**Engine:** SQLite (via `better-sqlite3` 13.0.3), `journal_mode = WAL` for file-backed databases.
**Database file:** `DATA_DIR/db/knowledge.sqlite3`

> This document describes what the code does today. Notes, bookmarks, categories, tags, note
> relationships, Notes FTS5 indexes, and user-facing substring search are implemented. Favorites
> and files are not implemented yet.

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
Category/tag relation rows are retained while a Note is soft-deleted and restored.

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

### 3.6 `bookmarks`

Added by `004_bookmarks.sql` without modifying existing Notes or authentication rows.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | Server-generated UUID v4. |
| `owner_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Every API operation is scoped to the authenticated owner. |
| `title` | TEXT | NOT NULL, length 1–200 | Trimmed and validated by the API. |
| `url` | TEXT | NOT NULL, length 1–2048 | API accepts only valid HTTP/HTTPS URLs without embedded credentials. |
| `description` | TEXT | NOT NULL, DEFAULT `''`, max 5,000 | User-entered metadata; no automatic fetching is performed. |
| `created_at` | INTEGER | NOT NULL | Unix epoch milliseconds. |
| `updated_at` | INTEGER | NOT NULL | Unix epoch milliseconds. |

`bookmarks_owner_updated_idx` supports paginated owner-scoped listing. The URL is stored as
normalized by the Node WHATWG URL parser. No server-side request is made to the saved address, so
bookmark creation does not fetch metadata or expose an SSRF surface.

### 3.7 `categories` and `tags`

Added by the additive `005_categories_tags.sql` migration. Both tables have the same structure:

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | Server-generated UUID v4. |
| `owner_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE | All operations are scoped to this owner. |
| `name` | TEXT | NOT NULL, length 1–80 | API trims and NFC-normalizes the name; uniqueness is per owner using SQLite `NOCASE`. |
| `created_at` | INTEGER | NOT NULL | Unix epoch milliseconds. |
| `updated_at` | INTEGER | NOT NULL | Unix epoch milliseconds. |

Each table has a unique `(owner_id, name COLLATE NOCASE)` constraint and an owner/name index.
Deleting an owner cascades to the owner's taxonomy entries.

### 3.8 `note_categories` and `note_tags`

These relation tables connect notes to categories/tags. Each relation stores `note_id`, the
corresponding category/tag ID, and `owner_id`; its composite primary key prevents duplicate
assignments. Foreign keys cascade when a Note, category/tag, or owner is permanently deleted.
Insert/update triggers reject relations unless the Note and taxonomy item share the stored owner.
The API replaces a note's category and tag sets in a transaction and only accepts IDs owned by the
current session. Soft deletion does not remove relation rows, so restoring a note preserves them.

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

- `files`, `favorites`
- audit/event log
- backup metadata tables (backup state lives in sidecar JSON files, not in SQLite)

Do not assume these exist when writing queries.
Trash listing, restore, and confirmed permanent deletion operate on the existing `notes.deleted_at`
field; no migration was required for T15. Category/tag assignments remain in their relation tables
through soft delete and restore, as verified by the API integration test.

### Search, bookmarks, and taxonomy migrations and backup requirement

Migration 003 is additive: it leaves `notes`, migration 002, and the existing `notes_fts` table and
triggers intact while adding the trigram table and its synchronization triggers. It was tested on
temporary databases, including an upgrade where existing active and deleted Notes were present.
Before applying it to any database with existing data, create and verify a backup as required by
`BACKUP.md`. Migration 004 adds only the bookmarks table and owner/update index; its test applies
the migration after versions 001–003 and verifies existing Notes remain unchanged. No production
database was migrated.
Migration 005 adds categories, tags, and their relation tables without modifying earlier tables or
rows. Its upgrade test starts from versions 001–004 and verifies preservation of existing Notes and
owner enforcement. No real database was migrated for this feature.

---

## 8. Changing the schema

1. Add `apps/server/migrations/00N_description.sql` at the next sequential version. Never edit an applied migration.
2. The runner discovers and applies the new migration transactionally.
3. Add tests in `database.test.ts` for fresh install and upgrade preservation.
4. Run `npm test` and `npm run build:server`.
5. Take a backup before deploying to any database that holds real data (see `BACKUP.md`).

## 9. Proposed file storage schema (not implemented; migration proposal only)

> **Superseded.** The `files` table is implemented in `007_files.sql`; see §10. The proposed
> `upload_sessions` table and Tus resumable-upload state do **not** exist.

The following is a design proposal for the next sequential migration, `006_files.sql`. No migration
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

## 10. Implemented favorites and file tables (migrations 006 and 007)

Both migrations are additive and forward-only. Tests cover a fresh database and an upgrade from
schema 5 that preserves existing users, notes and bookmarks.

### 10.1 `006_favorites.sql`

```sql
CREATE TABLE favorites (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('note', 'bookmark')),
  item_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, item_type, item_id)
);
CREATE INDEX favorites_owner_created_idx ON favorites(owner_id, created_at DESC, item_id);
```

- The primary key makes adding a favorite idempotent.
- `item_type` is restricted to `note` and `bookmark`; there is no foreign key to either table
  because the relation is polymorphic.
- A `BEFORE INSERT` trigger rejects a row whose target does not exist for the same `owner_id`.
- `AFTER DELETE` triggers on `notes` and `bookmarks` remove matching favorites. Deleting a user
  cascades. Soft-deleting a note does **not** remove the favorite, so a trash restore keeps it.
- No table references files; favoriting a file is not implemented.

### 10.2 `007_files.sql`

```sql
CREATE TABLE files (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256       TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  media_type   TEXT NOT NULL,
  object_key   TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);
CREATE INDEX files_owner_created_idx ON files(owner_id, created_at DESC, id DESC);
```

- `id` and `object_key` are both the server-generated UUID. The object path is derived as
  `DATA_DIR/objects/<first two id characters>/<id>`; no client value participates.
- `display_name` is the validated, NFC-normalized client name. It is metadata only and never used
  to build a path. It is not unique, so case- or normalization-equivalent names coexist.
- `sha256` is the lowercase hex digest of the stored bytes, computed while streaming.
- `media_type` is detected server-side from magic bytes; the upload's declared `Content-Type` is
  discarded.
- There is no `deleted_at`: deleting a file removes the row and the object. There is no
  `upload_sessions` table and no resumable-upload state.

### 10.3 Backup consequences

`verifyBackup` requires `favorites` at schema 6 and `files` at schema 7. A backup also records the
`DATA_DIR/objects` tree in its manifest so a restore can return metadata and bytes together; see
`BACKUP.md` §4–§8.

## 11. Implemented Life OS tables (migration 008)

`008_life_os_people_and_schedule.sql` is additive and forward-only like the earlier migrations.
It introduces five tables that back the "Personal Knowledge & Life OS" surface: `people`,
`note_people`, `reminders`, `life_timeblocks`, and `habits`.

### 11.1 `people`

```sql
CREATE TABLE people (
  id                      TEXT PRIMARY KEY,
  owner_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  relationship_group      TEXT NOT NULL CHECK (relationship_group IN ('family','partner','friend')),
  role_label              TEXT NOT NULL DEFAULT '' CHECK (length(role_label) <= 80),
  avatar_file_id          TEXT REFERENCES files(id) ON DELETE SET NULL,
  avatar_preset           TEXT CHECK (avatar_preset IS NULL OR length(avatar_preset) <= 40),
  birthday_or_anniversary TEXT NOT NULL DEFAULT '',
  phone                   TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  favorites_and_likes     TEXT NOT NULL DEFAULT '',
  allergies_and_medical   TEXT NOT NULL DEFAULT '',
  gift_ideas_and_sizes    TEXT NOT NULL DEFAULT '',
  memo                    TEXT NOT NULL DEFAULT '',
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX people_owner_group_idx ON people(owner_id, relationship_group, name COLLATE NOCASE);
CREATE INDEX people_owner_name_idx ON people(owner_id, name COLLATE NOCASE);
```

- `birthday_or_anniversary` stores an ISO `YYYY-MM-DD` string; only the month and day drive the
  countdown in the UI, so the year is free-form. The API rejects a non-ISO value with **400**.
- `avatar_file_id` points at an uploaded `files` row; `avatar_preset` is one of the fixed emoji
  presets. Both may be set, and the UI prefers the uploaded image.
- Free-text CRM columns (`favorites_and_likes`, `allergies_and_medical`, `gift_ideas_and_sizes`,
  `memo`) are unbounded on purpose but NFC-normalized and control-character-rejected by the API.
- `people_avatar_owner_insert` / `people_avatar_owner_update` reject an avatar that belongs to a
  different owner, so a file id cannot be borrowed across accounts.

### 11.2 `note_people`

```sql
CREATE TABLE note_people (
  note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, person_id)
);
CREATE INDEX note_people_owner_person_idx ON note_people(owner_id, person_id, note_id);
```

- Composite primary key keeps linking idempotent.
- `note_people_owner_insert` / `note_people_owner_update` verify that both the note and the person
  belong to the supplied `owner_id`, mirroring the `note_categories` / `note_tags` pattern.
- Deleting a note or a person cascades the link away. Soft-deleting a note does **not** remove the
  link, so a trash restore keeps the person association.

### 11.3 `reminders`

```sql
CREATE TABLE reminders (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  target_date        TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('birthday','anniversary','health','backup','other')),
  priority           TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  linked_person_id   TEXT REFERENCES people(id) ON DELETE SET NULL,
  is_completed       INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  notify_days_before INTEGER NOT NULL DEFAULT 7 CHECK (notify_days_before BETWEEN 0 AND 365),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX reminders_owner_date_idx ON reminders(owner_id, is_completed, target_date);
```

- `target_date` is a validated ISO date. `notify_days_before` is clamped to 0–365 by both the
  CHECK constraint and the API.
- `linked_person_id` is `ON DELETE SET NULL`: removing a person keeps the reminder and drops the
  link. `reminders_person_owner_insert` / `_update` reject a person owned by another account.
- "Upcoming" is computed as `target_date` within `notify_days_before` days of today and
  `is_completed = 0`; there is no scheduler and no push notification.

### 11.4 `life_timeblocks`

```sql
CREATE TABLE life_timeblocks (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_date TEXT NOT NULL,
  time_range TEXT NOT NULL CHECK (length(time_range) BETWEEN 1 AND 40),
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  life_area  TEXT NOT NULL CHECK (life_area IN ('health','focus_work','family','growth','other')),
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX life_timeblocks_owner_date_idx ON life_timeblocks(owner_id, block_date, time_range);
```

- `time_range` is display text such as `06:30 - 07:30`; it is not parsed into start/end columns and
  no overlap rule is enforced.
- The daily progress bar is derived from `COUNT(is_done = 1) / COUNT(*)` for one `block_date`.

### 11.5 `habits`

```sql
CREATE TABLE habits (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  current_count     INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  daily_target      INTEGER NOT NULL DEFAULT 1 CHECK (daily_target BETWEEN 1 AND 1000),
  unit              TEXT NOT NULL DEFAULT 'ครั้ง' CHECK (length(unit) <= 20),
  streak_days       INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_checked_date TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX habits_owner_created_idx ON habits(owner_id, created_at);
```

- `POST /api/habits/:id/check` increments `current_count` by one, capped at `daily_target`.
- `streak_days` advances by one when `last_checked_date` is the previous calendar day, stays put
  when the habit was already checked today, and resets to 1 on a gap. The server compares ISO date
  strings, so the value is timezone-naive by design.

### 11.6 Backup consequences

`requiredTablesForSchema(8)` adds `people`, `note_people`, `reminders`, `life_timeblocks`, and
`habits` to the tables a backup must contain. `backup:verify` fails when any of them is missing, and
`backup-e2e.test.ts` seeds every Life OS table, destroys the data directory, restores, and asserts
the rows and relations come back. See `BACKUP.md` §4–§8.

## 12. Implemented work-core tables (migration 009)

`009_work_core.sql` is additive and forward-only. It adds `goals`, `projects`, `tasks`,
`task_checklist_items` and `inbox_items`, with indexes and nine owner-mismatch triggers. The full
rationale and the rejected alternatives are in `DATA_MODEL.md` §3.

```sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '', metric TEXT NOT NULL DEFAULT '',
  target_value REAL, current_value REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '' CHECK (length(unit) <= 20),
  horizon TEXT NOT NULL DEFAULT 'year' CHECK (horizon IN ('week','month','quarter','year','life')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','dropped')),
  due_date TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned','active','paused','done','archived')),
  area TEXT NOT NULL DEFAULT '' CHECK (length(area) <= 80),
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  start_date TEXT, due_date TEXT, completed_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','doing','waiting','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_date TEXT, start_date TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  goal_id    TEXT REFERENCES goals(id)    ON DELETE SET NULL,
  person_id  TEXT REFERENCES people(id)   ON DELETE SET NULL,
  recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
  completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);

CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','url','file','task','reminder')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','archived')),
  converted_type TEXT CHECK (converted_type IN ('note','task','project','bookmark','reminder')),
  converted_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CHECK ((converted_type IS NULL) = (converted_id IS NULL))
);
```

Notes on behaviour that the schema alone does not show:

- `tasks.completed_at` is set on the transition into `done` and cleared on the way out, so "done this
  week" is a range query rather than a guess.
- Deleting a project, goal or person sets the matching `tasks.*_id` to `NULL`: finished work is never
  destroyed as a side effect.
- `inbox_items.converted_id` is deliberately not a foreign key because the target table varies. The
  conversion handler writes the target row and the inbox update in one transaction, and a second
  attempt returns **409**.
- Triggers: `projects_goal_owner_*`, `tasks_project_owner_*`, `tasks_goal_owner_*`,
  `tasks_person_owner_*`, `task_checklist_owner_*` (insert and update each) abort any row whose
  reference belongs to a different `owner_id`.

### 12.1 Backup consequences

`requiredTablesForSchema(9)` adds `goals`, `projects`, `tasks`, `task_checklist_items` and
`inbox_items`. `backup:verify` fails on a schema-9 backup that is missing any of them, and
`backup-e2e.test.ts` seeds all five, destroys `DATA_DIR`, restores, and asserts the rows plus the
`tasks` → project/goal/person relations.

## 13. Habit history and reminder recurrence (migration 010)

`010_habit_logs_and_reminder_recurrence.sql` is additive. It adds one table, three columns on
`habits`, four columns on `reminders`, and migrates the old counters without deleting anything.

### 13.1 `habit_logs`

```sql
CREATE TABLE habit_logs (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id        TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date        TEXT NOT NULL,
  count           INTEGER NOT NULL CHECK (count >= 0),
  target_snapshot INTEGER NOT NULL CHECK (target_snapshot BETWEEN 1 AND 1000),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (habit_id, log_date)
);
CREATE INDEX habit_logs_owner_date_idx ON habit_logs(owner_id, log_date);
CREATE INDEX habit_logs_habit_date_idx ON habit_logs(habit_id, log_date);
```

- `UNIQUE (habit_id, log_date)` is what makes "one log per habit per day" true at the storage layer,
  not just in the handler.
- `target_snapshot` records the daily target **as it was that day**, so raising the target later does
  not retroactively turn past successes into failures.
- `habit_logs_owner_insert` / `_update` reject a log whose habit belongs to another account.

### 13.2 `habits` — added columns

```sql
ALTER TABLE habits ADD COLUMN tracking_start_date TEXT;
ALTER TABLE habits ADD COLUMN legacy_current_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN legacy_streak_days INTEGER NOT NULL DEFAULT 0;
```

`current_count` and `streak_days` are now **derived** from `habit_logs` and are rewritten on every
write. The pre-migration values are preserved in the `legacy_*` columns and are displayed separately,
labelled as unverifiable. See `DATA_MODEL.md` §7 for the migration decision.

### 13.3 `reminders` — added columns

```sql
ALTER TABLE reminders ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none','daily','weekly','monthly','yearly'));
ALTER TABLE reminders ADD COLUMN recurrence_anchor_date TEXT;
ALTER TABLE reminders ADD COLUMN snoozed_until TEXT;
ALTER TABLE reminders ADD COLUMN last_completed_at INTEGER;
CREATE INDEX reminders_owner_recurrence_idx ON reminders(owner_id, recurrence, target_date);
```

- `recurrence_anchor_date` keeps the original day-of-month / day-of-year so monthly and yearly
  reminders do not drift earlier every time a short month clamps them.
- `snoozed_until` is the effective date when set; `target_date` is never overwritten by a snooze.
- `last_completed_at` records the last completion of a recurring reminder, which is what "done" means
  for something that never closes.

### 13.4 Backup consequences

`requiredTablesForSchema(10)` adds `habit_logs`. The E2E test seeds two logs and a recurring, snoozed
reminder, destroys `DATA_DIR`, restores, and asserts the logs, their habit relation, and the
recurrence/snooze columns.

## 14. Entity file links (migration 011)

```sql
CREATE TABLE entity_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task','project','person','bookmark')),
  entity_id TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (entity_type, entity_id, file_id)
);
```

- `entity_id` is polymorphic, so there is no foreign key on it. Five `BEFORE INSERT` triggers (one per
  type) reject a missing entity, a cross-owner entity, a cross-owner file, and any type outside the
  list.
- `entity_files_update_guard` makes a link immutable: changing `owner_id`, `entity_type` or
  `entity_id` aborts.
- `AFTER DELETE` triggers on `tasks`, `projects`, `people` and `bookmarks` remove their links. Notes
  are soft-deleted, so their links survive a trash restore on purpose.
- Deleting a file cascades its links; deleting a link never deletes the file.
- `requiredTablesForSchema(11)` adds `entity_files`.
