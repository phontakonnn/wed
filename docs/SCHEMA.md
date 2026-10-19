# Database Schema

**Status:** reflects migrations `001_initial` and `002_notes`, and
`apps/server/src/database.ts` as of 2026-10-19.
**Engine:** SQLite (via `better-sqlite3` 13.0.3), `journal_mode = WAL` for file-backed databases.
**Database file:** `DATA_DIR/db/knowledge.sqlite3`

> This document describes what the code does today. Notes and a Notes FTS5 index are implemented.
> Bookmarks, tags, files, and user-facing search are not implemented yet.

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
use the existing SQLite triggers on `notes`. User-facing search endpoints are not implemented yet,
and the tokenizer has not been evaluated for Thai search quality.

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
- User-facing FTS5 search and a trigram schema extension (Thai tokenizer strategies are evaluated
  in T08; no user-facing search implementation exists yet)
- audit/event log
- backup metadata tables (backup state lives in sidecar JSON files, not in SQLite)

Do not assume these exist when writing queries.
Trash listing, restore, and confirmed permanent deletion operate on the existing `notes.deleted_at`
field; no migration was required for T15. Tags, categories, and note relations do not exist, so
restoration of those features is not testable yet.

### Proposed only: T08 trigram index

The T08 evaluation recommends a separate FTS5 trigram virtual table for substring search; this is
not part of the current schema and no migration has been run. A future, separately approved
forward-only migration could add `notes_fts_trigram` with unindexed note/owner metadata and new
insert/update/delete triggers, then backfill active notes in the same migration transaction. Keep
the existing `notes_fts` and its triggers unchanged until compatibility and migration tests justify
otherwise. Do not apply such a migration to a database with existing data before a backup has been
created and verified. The proposed API would reject queries shorter than 3 Unicode code points;
that behavior is not implemented.

---

## 8. Changing the schema

1. Add `apps/server/migrations/00N_description.sql` at the next sequential version. Never edit an applied migration.
2. The runner discovers and applies the new migration transactionally.
3. Add tests in `database.test.ts` for fresh install and upgrade preservation.
4. Run `npm test` and `npm run build:server`.
5. Take a backup before deploying to any database that holds real data (see `BACKUP.md`).
