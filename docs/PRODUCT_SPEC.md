# Product Spec — Personal Knowledge Hub & Life OS

Status: living document. Written against the code as it exists, not against the prototype HTML.
Companion documents: `FEATURE_GAP_ANALYSIS.md` (what is missing), `DATA_MODEL.md` (tables),
`ACCEPTANCE.md` (gates).

## 1. Product statement

A single-user, local-first second brain: capture anything in one keystroke, turn it into the right
kind of object, and find it again months later without remembering where it went. It must never show
a number, badge or progress bar that is not computed from stored data.

**Non-negotiables**
1. Every visible action writes to the backend or is visibly disabled with a reason.
2. Every list has loading, empty and error states that reflect the real request.
3. Nothing claims encryption, sync or notification that the code does not perform.
4. Thai text behaves the same as Latin text in search, sorting and validation.

## 2. Object model in user terms

| Object | Answers the question | Lifetime |
| --- | --- | --- |
| **Inbox item** | "I saw this and I do not want to lose it yet." | Until triaged or archived |
| **Note** | "What do I know?" | Long-lived, versioned |
| **Task** | "What must I do, by when?" | Open → done/cancelled |
| **Project** | "What outcome am I producing?" | planned → active → done/archived |
| **Goal** | "What am I trying to change, and how will I know?" | active → achieved/dropped |
| **Person** | "Who matters, and what should I remember about them?" | Long-lived |
| **Reminder** | "When should I be nudged?" | One date, optionally recurring |
| **Time block** | "What did I plan to do with this hour?" | One day |
| **Habit** | "Did I do it today, and how often lately?" | Daily log |
| **File** | "The bytes behind this record." | Until deleted |
| **Library entry** | "How do I do this thing?" | Long-lived, reviewed |
| **Vault record** | "Where is the document/asset and when does it expire?" | Long-lived |

## 3. Module specifications

### A. Home / Dashboard
- Single endpoint `GET /api/dashboard` returning: today's tasks, overdue tasks, next reminders,
  today's time blocks, active projects with task counts, goals with measurable progress, habits not
  yet complete today, inbox count, recently updated notes.
- Every number is a `COUNT` or `SUM` over the caller's rows. If a goal has no `target_value`, the UI
  shows the raw counter and **no percentage**.
- Widgets are fixed for now (no drag-and-drop); empty widgets collapse to a one-line hint.

### B. Quick Capture / Inbox
- One input, one shortcut (`Ctrl/Cmd+Shift+Space` or the sidebar button). Saves text immediately,
  no category required.
- `kind` is inferred (`url` when the body parses as http/https, otherwise `text`) and can be changed.
- Triage converts to exactly one target: note, task, project, bookmark, reminder.
  - Conversion is transactional: the target row and `inbox_items.status='triaged'` +
    `converted_type` + `converted_id` commit together.
  - A second conversion attempt returns **409**, never a duplicate row.
  - The original body is preserved verbatim on the inbox row.
- Statuses: `new` → `triaged` | `archived`. Archived items stay searchable.

### C. Notes
- Existing CRUD stays. Additions: autosave with a real state machine
  (`idle → saving → saved | error`), a dirty guard before switching notes, and revision snapshots on
  save when the body changes by more than whitespace.
- Markdown: **not enabled yet** (see D-3). Content is stored and rendered as text, which is safe by
  construction.
- Backlinks: a note can reference another note by id; the reverse list is derived, never stored twice.

### D. Organization
- Five default buckets: Inbox, Projects, Areas, Resources, Archives.
  - Inbox = untriaged capture.
  - Projects = rows in `projects` with `status='active'`.
  - Areas = `projects.area` and `notes.area` free-text tags (no new table).
  - Resources = notes with `kind='reference'`.
  - Archives = `status IN ('done','archived')` plus trashed notes.
- Categories and tags keep working unchanged; filters persist in the URL query so a refresh keeps them.

### E. Tasks
- Fields: title, detail, status (`todo|doing|waiting|done|cancelled`), priority
  (`low|normal|high|urgent`), `due_date`, `start_date`, project, goal, person, recurrence.
- Subtasks are `task_checklist_items` with `position`; completing all of them does **not** auto-close
  the parent — that is a silent data change the user did not ask for.
- Recurrence: completing a recurring task creates the next occurrence by shifting `due_date` by the
  interval, and leaves the completed row as history. The new row is returned in the response so the
  UI can show it without a second round-trip.
- Views: Today (due today or overdue, not done), Upcoming (next 7 days), All, Done.
- Kanban is deferred; the list view with status chips is the contract.

### F. Projects / Goals
- Project: name, description, `outcome` (definition of done in the user's words), status, start/due
  dates, area, optional goal.
- Goal: title, metric description, optional numeric `target_value` + `current_value` + `unit`,
  horizon, status, due date.
- Progress: shown **only** when `target_value > 0`; otherwise the UI shows "ยังไม่มีตัวชี้วัด".
- Project progress = `done tasks / total tasks` and is labelled as such. No invented weighting.

### G. Calendar / Reminders / Time blocking
- Three distinct objects, never merged: a reminder nudges, a task is work, a block is planned time.
- Reminder recurrence: `none|daily|weekly|monthly|yearly`. Completing a recurring reminder rolls
  `target_date` forward instead of creating a second row.
- Snooze: `+1 day`, `+3 days`, `+1 week`, stored as a new `target_date` plus `snoozed_until`.
- Timezone: dates are `YYYY-MM-DD` computed from the **server's local** clock; the response includes
  the server's `today` so the client never guesses.
- Honest limitation: while the tab is closed nothing fires. No OS notification, no push, no service
  worker. The UI states this in the schedule panel.

### H. Habits
- `habit_logs(habit_id, log_date, count, target_snapshot)` is the source of truth.
- `current_count` and `streak_days` become **derived caches** recomputed from the log on every write.
- Correction: editing a past day recomputes the streak from scratch; nothing is incremental-only.
- Weekly/monthly summary is a `GROUP BY log_date` query, not stored totals.

### I. People
- Existing fields stay. Add links: tasks and projects may reference a person; the person panel shows
  the linked notes, tasks and reminders.
- Sensitive columns (`allergies_and_medical`, `memo`) are never written to logs, never included in
  error messages, and never used as test fixtures beyond obviously fake Thai strings.

### J. Vault / Assets
- **Blocked on D-1.** Until the owner chooses, only non-sensitive structured records are allowed:
  asset name, category, serial/identifier, purchase date, warranty/expiry date, renewal cost, storage
  location, notes, attached files.
- No passwords, no PINs, no key material, no full policy numbers.
- The UI must say, in the panel itself, that live data is not encrypted at rest and that only backups
  are.

### K. Library
- Implemented as notes with `kind='reference'` plus structured fields: `summary`, `key_points`,
  `source_url`, `review_on`, `steps` (checklist). No separate table until a real need appears.
- Review queue = library entries whose `review_on` is today or past.

### L. Files
- `entity_files(owner_id, entity_type, entity_id, file_id)` links one file to many records.
  Allowed `entity_type`: `note`, `task`, `project`, `person`, `bookmark`, `asset`.
- Deleting an entity removes its links but never the file; deleting a file removes its links.
- Upload progress: reported by `XMLHttpRequest.upload.onprogress` in the browser; cancellation
  aborts the request and the server discards the temp part. Resumable upload stays out of scope.

### M. Universal search
- `GET /api/search?q=&types=&limit=` returns grouped results across notes, tasks, projects, goals,
  people, reminders, bookmarks, files, library.
- Thai: 3+ code points use the trigram index; shorter queries fall back to `nfc()` + `instr()`.
  Ranking: exact title prefix > title substring > body substring, then recency.
- Filters by type and by date range; the palette shows a type chip per row.

### N. Review
- Daily review: inbox backlog, overdue tasks, reminders due, habits incomplete.
- Weekly review: projects with no completed task in 14 days, goals without movement, upcoming
  birthdays, expiring assets, library entries due for review.
- Nothing is auto-archived or auto-deleted; every action is a button the user presses.

### O. Import / Export
- Export: one JSON file + a `manifest.json` + `objects/` tree, with SHA-256 per object.
- Import: dry-run first, returning counts, duplicate candidates and conflicts; the real import
  requires an explicit confirmation flag and runs in one transaction.
- Round-trip must preserve ids, relations and hashes; verified by a test.

### P. Settings
- Server-side (`user_preferences`): week start, default reminder lead time, search scope, density.
- Device-local (`localStorage`): theme, theme mode, profile display name/status/avatar, sidebar width.
- The settings screen labels each group "ซิงก์ข้ามอุปกรณ์" or "เฉพาะเครื่องนี้" and the local group
  carries a visible warning. No claim of sync for local values.

## 4. UI contract

- Minimum body text 14 px; metadata 12 px minimum and never below 11 px; contrast checked in both
  modes.
- Buttons ≥ 40 px tall on touch widths.
- Every async action shows a disabled + loading state, then a toast on success or an inline error.
- Modals trap focus and restore it on close; `Escape` closes; `prefers-reduced-motion` disables
  transitions.
- No horizontal overflow at 1920 / 1280 / 768 / 390.
- Empty states carry a one-line explanation plus the primary action.

## 5. Explicit non-goals

Password manager · cloud sync · multi-user sharing · OS push · OCR/PDF text extraction · speech to
text · offline-first conflict resolution · third-party analytics or fonts.
