# Data Model

Companion to `SCHEMA.md`, which documents what is *already* migrated. This file covers the target
model: what exists, what this phase adds, and what is only proposed.

## 1. Principles

1. **One table per concept.** No `items(type, json)` catch-all and no EAV.
2. **Owner on every row.** `owner_id REFERENCES users(id) ON DELETE CASCADE`, and every query filters
   on it. A foreign id is reported as 404, never 403.
3. **Relations are validated twice**: in the handler (fast, friendly error) and by a `BEFORE
   INSERT/UPDATE` trigger (unbypassable, protects against a future code path).
4. **Additive only.** A migration may add tables, columns, indexes and triggers. It may not drop or
   rewrite user data.
5. **Derived values are caches.** Anything that can be recomputed (streaks, counts, progress) must be
   recomputable from stored rows, and recomputed on write.

## 2. Existing entities (migrations 001–008)

| Table | Purpose | Key relations |
| --- | --- | --- |
| `users` | account | — |
| `sessions` | session tokens (hashed) | → `users` cascade |
| `notes` | knowledge, soft-deleted via `deleted_at` | → `users` |
| `notes_fts`, `notes_fts_trigram` | FTS5 mirrors maintained by triggers | → `notes` |
| `bookmarks` | links | → `users` |
| `categories`, `tags` | taxonomy | → `users` |
| `note_categories`, `note_tags` | note ↔ taxonomy | cascade from both sides |
| `favorites` | polymorphic note/bookmark star | trigger-checked target |
| `files` | object metadata + `sha256` | → `users`; object on disk |
| `people` | personal CRM | → `users`; `avatar_file_id` → `files` |
| `note_people` | note ↔ person | trigger-checked, cascade both ways |
| `reminders` | dated nudges | → `people` SET NULL |
| `life_timeblocks` | planned day blocks | → `users` |
| `habits` | habit counters | → `users` |

## 3. Added in migration 009 (work core)

Order matters: `goals` before `projects`, both before `tasks`.

### 3.1 `goals`

```sql
CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description   TEXT NOT NULL DEFAULT '',
  metric        TEXT NOT NULL DEFAULT '',            -- how success is measured, in words
  target_value  REAL,                                -- NULL = no measurable target
  current_value REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT '' CHECK (length(unit) <= 20),
  horizon       TEXT NOT NULL DEFAULT 'year'
                CHECK (horizon IN ('week','month','quarter','year','life')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','achieved','dropped')),
  due_date      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX goals_owner_status_idx ON goals(owner_id, status, horizon);
```

Progress rule: a percentage exists **only** when `target_value IS NOT NULL AND target_value > 0`.
Otherwise the API returns `progressPercent: null` and the UI must say "ยังไม่มีตัวชี้วัด".

### 3.2 `projects`

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  outcome     TEXT NOT NULL DEFAULT '',              -- definition of done, user's words
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('planned','active','paused','done','archived')),
  area        TEXT NOT NULL DEFAULT '' CHECK (length(area) <= 80),
  goal_id     TEXT REFERENCES goals(id) ON DELETE SET NULL,
  start_date  TEXT,
  due_date    TEXT,
  completed_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX projects_owner_status_idx ON projects(owner_id, status, due_date);
```

`projects_goal_owner_insert` / `_update` reject a `goal_id` owned by another account.

### 3.3 `tasks`

```sql
CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  detail       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo','doing','waiting','done','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low','normal','high','urgent')),
  due_date     TEXT,
  start_date   TEXT,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  goal_id      TEXT REFERENCES goals(id) ON DELETE SET NULL,
  person_id    TEXT REFERENCES people(id) ON DELETE SET NULL,
  recurrence   TEXT NOT NULL DEFAULT 'none'
               CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
  completed_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX tasks_owner_status_due_idx ON tasks(owner_id, status, due_date);
CREATE INDEX tasks_owner_project_idx  ON tasks(owner_id, project_id);
CREATE INDEX tasks_owner_goal_idx     ON tasks(owner_id, goal_id);
CREATE INDEX tasks_owner_person_idx   ON tasks(owner_id, person_id);
```

- `completed_at` is set when `status` becomes `done` and cleared when it leaves `done`, so "done this
  week" is a range query, not a guess.
- `ON DELETE SET NULL` for all three links: deleting a project must not delete the work already done.
- Triggers `tasks_project_owner_*`, `tasks_goal_owner_*`, `tasks_person_owner_*` reject a link that
  crosses accounts.
- Recurrence is a property of the *completed* row. Completing it inserts a new row with a shifted
  `due_date`; the old row stays as history. There is no `parent_task_id` chain because the history is
  already the chain.

### 3.4 `task_checklist_items`

```sql
CREATE TABLE task_checklist_items (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX task_checklist_task_idx ON task_checklist_items(task_id, position, id);
```

`task_checklist_owner_insert` / `_update` require the parent task to belong to the same `owner_id`.
Completing every item does **not** close the task.

### 3.5 `inbox_items`

```sql
CREATE TABLE inbox_items (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  kind           TEXT NOT NULL DEFAULT 'text'
                 CHECK (kind IN ('text','url','file','task','reminder')),
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','triaged','archived')),
  converted_type TEXT CHECK (converted_type IN ('note','task','project','bookmark','reminder')),
  converted_id   TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX inbox_owner_status_idx ON inbox_items(owner_id, status, created_at DESC);
```

- `converted_id` has no foreign key because it is polymorphic; the conversion handler writes the
  target row and the inbox row in one transaction, and a second conversion is rejected with 409.
- `CHECK (converted_type IS NULL) = (converted_id IS NULL)` keeps the pair consistent.

## 4. Proposed, not yet migrated

| Table | Purpose | Blocked by |
| --- | --- | --- |
| ~~`habit_logs`~~ | **implemented in migration 010** — see §7 | done |
| `entity_files(owner_id, entity_type, entity_id, file_id)` | one file ↔ many records | — (batch 4) |
| `note_revisions(note_id, revision, title, content, created_at)` | note history | — (batch 2) |
| `assets` | Vault records | **D-1** (live-data encryption decision) |
| `user_preferences(owner_id, key, value)` | server-side settings | — (batch 5) |

`assets` deliberately has no column for secrets. If D-1 is answered with "field-level encryption",
that becomes a separate table with a key id per row, not a nullable `secret` column.

## 4a. Implemented in migration 010

```sql
CREATE TABLE habit_logs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  target_snapshot INTEGER NOT NULL CHECK (target_snapshot BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (habit_id, log_date)
);
```

Plus `habits.tracking_start_date`, `habits.legacy_current_count`, `habits.legacy_streak_days`, and
`reminders.recurrence`, `reminders.recurrence_anchor_date`, `reminders.snoozed_until`,
`reminders.last_completed_at`.

## 5. Backup and restore impact

- `requiredTablesForSchema(9)` adds `goals`, `projects`, `tasks`, `task_checklist_items`,
  `inbox_items`. `backup:verify` fails if any is missing.
- Restore order is not an issue: the backup copies the whole SQLite file, so foreign keys are already
  consistent inside it.
- The E2E test seeds every new table, destroys `DATA_DIR`, restores, and asserts row counts,
  relations (`task.project_id`, `task.goal_id`, `task.person_id`), and that a checklist item still
  points at its task.
- Object snapshots are unaffected: none of the new tables stores bytes.

## 6. Owner-boundary tests required for every new relation

| Relation | Test |
| --- | --- |
| `tasks.project_id` | creating a task with another owner's project → 400; direct SQL insert → trigger abort |
| `tasks.goal_id` | same |
| `tasks.person_id` | same |
| `projects.goal_id` | same |
| `task_checklist_items.task_id` | inserting an item under another owner's task → trigger abort |
| inbox conversion | converting to a project owned by someone else is impossible because the project is created, not referenced |


## 7. Habit history decision (Batch 3)

### 7.1 What the old model could and could not prove

Before migration 010 a habit stored `current_count`, `streak_days` and `last_checked_date`. Those
values were incremented in place: the only thing the database could prove was *the current streak
number*, not which days produced it. There was no way to answer "did I do this last Tuesday?", and a
single bad increment was unrecoverable.

### 7.2 The decision

1. **`habit_logs` is the source of truth.** One row per habit per day, enforced by
   `UNIQUE (habit_id, log_date)`.
2. **`current_count` and `streak_days` are caches**, recomputed from the logs after every write. No
   incremental counter survives that cannot be re-derived.
3. **No history is invented.** The migration never writes a log for a past day and never derives a
   log from `streak_days`, because neither proves the user did the habit on that day.
4. **One narrow exception:** if `last_checked_date` equals the migration date and `current_count > 0`,
   that day's counter becomes that day's log. It is the only value that is direct evidence of the day
   it belongs to, and it is not a past day.
5. **Old values are preserved, not deleted.** `legacy_current_count` and `legacy_streak_days` hold the
   pre-migration numbers; the UI shows them as "ก่อนเริ่มเก็บประวัติ … (ตรวจสอบย้อนหลังไม่ได้)".
6. **`tracking_start_date`** marks where verifiable history begins. It is set to the migration date
   for existing habits and to the creation date for new ones.

### 7.3 Consequences, stated plainly

- Every existing habit's verified streak restarts at 0 or 1. The old number is still visible, but it
  is labelled as unverifiable. This is a deliberate downgrade in *apparent* data to remove a claim
  that was never true.
- Days before `tracking_start_date` are returned as `count: null` / `metTarget: null`, never `0`. A
  `0` would assert a failure the system never observed.
- Logging a day before `tracking_start_date` is refused with **400**. A habit cannot be done before it
  existed.
- Future days are refused with **400**.

### 7.4 Streak definition

A day counts toward the streak when its log's `count >= target_snapshot` for that day.

- Today is not over, so an incomplete today does not break the streak; the walk starts at yesterday
  when today is not yet met.
- A day with no log simply does not count — it is not treated as a failure, because nothing was
  recorded for it.
- The streak is recomputed from scratch on every write, so correcting a past day changes it
  immediately in both directions.

## 8. Reminder recurrence and snooze semantics (Batch 3)

- **Completion of a recurring reminder rolls the same row forward.** `target_date` advances to the
  next occurrence, `is_completed` stays 0, `last_completed_at` is stamped, `snoozed_until` is
  cleared. No duplicate row is created, so the reminder keeps its identity and its history.
- **Completion of a one-off reminder** sets `is_completed = 1`. Reopening clears `last_completed_at`.
- **Monthly/yearly use the anchor.** A reminder created on 31 January goes to 28/29 February, then
  back to 31 March. A 29 February yearly reminder lands on 28 February in non-leap years and returns
  to 29 February in the next leap year.
- **Snooze moves the effective date only.** `snoozed_until` changes; `target_date` and
  `recurrence_anchor_date` do not. The next recurrence is computed from `target_date`, so a snooze
  can never permanently shift the schedule.
- **Snooze is idempotent per base date.** The client sends the date it believes is current (`from`);
  if the server has already moved past it, the request returns **409** with the current row instead of
  adding the offset a second time. This is what stops a retried request from skipping a day.
- **Snoozing a completed reminder is refused** with **409**.
- **No background delivery.** The effective date is used when the page loads
  (`/api/reminders/upcoming`). There is no OS notification, push or service worker, and the UI says
  so.
