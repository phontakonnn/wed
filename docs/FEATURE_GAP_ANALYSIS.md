# Feature Gap Analysis — PKH & Life OS

> **เอกสารประวัติศาสตร์ (historical):** Fastify/SQLite backend และสคริปต์ที่อ้างถึงในเอกสารนี้
> ถูกลบออกจากโปรเจกต์แล้ว (ดู `docs/CLEANUP_LOG.md` และ `docs/DECISIONS.md`) ปัจจุบันระบบเป็น
> PWA ที่ทำงานบน Firebase ทั้งหมด — คำสั่งอย่าง `npm run dev:server`, `backup:create` หรือ
> `bootstrap:admin` ไม่มีอยู่แล้ว ใช้ `npm run dev` และ `docs/SECURITY.md` แทน


Date: 2026-10-20
Baseline: `main` @ `02d08b5` with a dirty worktree (schema 008, Life OS UI, all uncommitted).
Method: read the migrations, the route table, the tests and the current `App.tsx`; no assumptions from
the design documents. Every "exists" claim below points at a file.

## 0. What is actually in the workspace today

**Schema (8 migrations, 15 tables):** `users`, `sessions`, `notes`, `notes_fts`, `notes_fts_trigram`,
`bookmarks`, `categories`, `tags`, `note_categories`, `note_tags`, `favorites`, `files`, `people`,
`note_people`, `reminders`, `life_timeblocks`, `habits`.

**Routes (32):** auth (7), notes (7), bookmarks (4), categories/tags (4), favorites (2), files (4),
people (4), reminders (4), timeblocks (4), habits (5), search (1), health (1). Plus the static `/`.

**UI (one SPA, ~3.6k lines `App.tsx` + ~2.5k lines `App.css`):** three-column shell, 7-item sidebar
(ทั้งหมด / โน้ต / บุคคล / ตารางชีวิต / บุ๊กมาร์ก / รายการโปรด / ไฟล์ / ถังขยะ), note editor with
taxonomy + person chips, people CRM panel, schedule panel, theme studio (5 themes × light/dark),
profile modal, Ctrl+K palette, focus mode, mobile drawer.

**Security already in place:** session cookie (HttpOnly/SameSite=Strict), CSRF via Origin + Host +
`X-PKH-Request`, login throttling with protection-preserving eviction, CSP + `X-Frame-Options: DENY`
+ `nosniff` + `Referrer-Policy: no-referrer` + `Permissions-Policy`, owner-scoped queries with 404 on
foreign ids, owner-mismatch triggers on every relation table.

**Backup:** AES-256-GCM envelope (`PKHBAK01`), key ring with ids and rotation, per-file object
inventory, mixed-policy rejection, safety copy on restore, `requiredTablesForSchema(1..8)`.

## 1. Module-by-module status

Legend: **EXISTS** = implemented and tested · **PARTIAL** = some of it works · **MISSING** = nothing
· **BLOCKED** = needs a decision the owner must make.

| # | Module | Status | Evidence | What is missing |
| --- | --- | --- | --- | --- |
| A | Home / Dashboard | **MISSING** | `App.tsx:3375` "ภาพรวมทั้งหมด" is a combined *list*; its detail pane only says "เลือกรายการจากทั้งหมด" | No aggregate endpoint, no today/overdue/upcoming roll-up, no widget surface |
| B | Quick Capture / Inbox | **MISSING** | no `inbox` table, no route | Capture box, triage states, conversion to Note/Task/Project/Bookmark/Reminder, duplicate protection |
| C | Notes / Knowledge | **PARTIAL** | `index.ts` notes routes; `notes.content` is plain text; `App.tsx` textarea | Markdown rendering (safe), autosave status, version history, backlinks, templates, references |
| D | Organization / Taxonomy | **PARTIAL** | `005_categories_tags.sql`; sidebar filter group | No Inbox/Projects/Areas/Resources/Archives model; filters are single-select per group and not persisted |
| E | Tasks | **MISSING** | no `tasks` table | Everything: status, priority, due/start, subtasks, recurrence, links, today/overdue views |
| F | Projects / Goals | **MISSING** | no `projects` / `goals` table | Everything, including an honest progress metric |
| G | Calendar / Reminders / Time blocking | **PARTIAL** | `reminders`, `life_timeblocks`, `life-os.ts` routes | No recurrence, no snooze, no timezone handling, no link from a task to a block, no month/agenda view |
| H | Habits | **PARTIAL** | `habits` table with `current_count`, `streak_days`, `last_checked_date` | No per-day history table, so the streak is a counter, not evidence; no weekly/monthly summary; no correction path |
| I | People / CRM | **EXISTS (core)** | `008_...sql`, `life-os.ts`, people panel | Links to tasks/projects/files; per-person event timeline |
| J | Vault / Assets / Records | **MISSING** | no `assets` table | Everything. **Blocked on a data-classification decision** (§4) |
| K | Knowledge Library / SOP | **MISSING** | — | Everything; could be modelled as a note *kind* plus structured fields |
| L | Files / Attachments | **PARTIAL** | `007_files.sql`, `files.ts`, file grid UI | Files cannot be attached to a note/task/project/person (no link table); no preview beyond `<img>`; no progress/cancel |
| M | Universal Search | **PARTIAL** | `/api/search` covers notes, people, reminders only | Tasks, projects, goals, files, bookmarks, library, vault are not searched; no type/date filters; no ranking |
| N | Daily / Weekly Review | **MISSING** | — | Everything |
| O | Import / Export | **MISSING** | — | Everything |
| P | Settings / Preferences | **PARTIAL** | theme + profile in `localStorage` (`pkh.theme`, `pkh.themeMode`, `pkh.profile`) | No settings screen; no statement in the UI that these are device-local; no server-side preferences |

## 2. Cross-cutting gaps

| Area | Status | Note |
| --- | --- | --- |
| Autosave / saving indicator | **MISSING** | Save is an explicit button; no `saving / saved / error` state machine |
| Toast system | **MISSING** | Inline `form-notice` / `form-error` paragraphs only |
| Markdown rendering | **MISSING** | Content is stored and shown as plain text; no renderer, therefore no XSS surface yet |
| Keyboard shortcuts | **PARTIAL** | Only `Ctrl/Cmd+K` and `Escape` |
| `prefers-reduced-motion` | **MISSING** | No media query in `App.css` |
| Accessibility | **PARTIAL** | `aria-label`/`role="alert"` used widely; no focus trap in modals, no skip link |
| Local fonts | **PARTIAL** | No web font is loaded; the UI relies on the OS stack — good for privacy, no bundle needed |
| Offline / background notifications | **MISSING** | Nothing. Must not be claimed |

## 3. Data-integrity gaps

- No link table between `files` and any entity, so "which files belong to this note/project" cannot be
  answered. `people.avatar_file_id` is the only file reference in the schema.
- `habits.streak_days` is derived from `last_checked_date` only. A single missed write is
  unrecoverable, and there is no way to correct a wrong day.
- `reminders` has no recurrence and no snooze; a yearly birthday must be re-entered by hand.
- `notes` has no revision table, so a bad overwrite is only recoverable from a full backup.
- `tasks`/`projects`/`goals` do not exist, so nothing can express "why does this note exist".

## 4. Decisions that must not be guessed

| ID | Decision | Why it blocks work | Options |
| --- | --- | --- | --- |
| D-1 | **Live-data encryption for Vault** | The current AES-256-GCM covers *backups only*. `DATA_DIR/db/knowledge.sqlite3` is plaintext. Building a Vault that stores policy numbers, serials or medical details would silently imply at-rest protection that does not exist | (a) Ship Vault with an explicit "not encrypted at rest, rely on BitLocker" banner and no secrets; (b) add SQLCipher or a field-level envelope — a schema- and key-management-level change; (c) restrict Vault to non-sensitive metadata and keep documents in `files` |
| D-2 | **Password-manager scope** | Storing real passwords needs per-item key derivation, unlock state, and a loss-recovery story | Out of scope for this phase; documented as a non-goal |
| D-3 | **Markdown renderer dependency** | A renderer is a new dependency and an XSS surface | Defer until the owner approves a specific library, or render a restricted subset by hand |
| D-4 | **Import format** | Round-trip fidelity depends on the chosen container | Propose JSON + object manifest; needs owner sign-off before implementation |

This document does **not** resolve D-1..D-4. They are recorded so no later step pretends they were
decided.

## 5. Ordered plan (what this phase will actually implement)

Priority follows the master prompt: security → data model → capture/tasks/projects/goals → vault and
library → calendar/habit history → search and file links → import/export → polish.

**Batch 1 (this pass)** — the work core, because every later module hangs off it:

1. Migration `009_work_core.sql`: `projects`, `goals`, `tasks`, `task_checklist_items`,
   `inbox_items`, with owner-check triggers and indexes.
2. `apps/server/src/work.ts`: inbox, tasks (incl. subtasks and recurrence), projects, goals.
3. Extend `/api/search` to tasks, projects and goals.
4. Backup: `requiredTablesForSchema(9)` + E2E coverage.
5. Tests: `work.test.ts`, plus `database.test.ts` and `backup-e2e.test.ts` updates.

**Batch 2** — Dashboard endpoint + Tasks/Inbox/Projects UI, autosave state, toast.
**Batch 3** — Habit day history + streak recomputation; reminder recurrence and snooze.
**Batch 4** — File↔entity links; Universal search filters.
**Batch 5** — Library (note kind), Review page, Import/Export (after D-4).
**Batch 6** — Vault, only after D-1 is answered.

## 6. Non-goals for this phase

- Password manager, secret storage, or any claim that live data is encrypted.
- OS notifications, push, or a background scheduler.
- OCR, full-text extraction from PDFs, speech-to-text.
- Cloud sync, multi-device sync, or shared/collaborative accounts.
- Any new runtime dependency.

## 7. Revision log — status after Batch 1 and Batch 2

The table in §1 is the **baseline as written before Batch 1** and is kept unchanged on purpose.
This section records what moved since, with the evidence that moved it.

### 7.1 Batch 1 — work core (schema 009)

| # | Module | Before Batch 1 | After Batch 1 | Evidence |
| --- | --- | --- | --- | --- |
| B | Quick Capture / Inbox | MISSING | **EXISTS** | `inbox_items`, 5 routes, conversion to note/task/project/bookmark/reminder with 409 on re-convert; `work.test.ts` WRK-01…05; browser B2/W-01…02 |
| E | Tasks | MISSING | **EXISTS** (list view; no Kanban) | `tasks` + checklist + recurrence; `work.test.ts` WRK-06…11; browser W-03…06 |
| F | Projects / Goals | MISSING | **EXISTS** | `projects`, `goals`, honest `progressPercent`; `work.test.ts` WRK-12…14; browser W-07…08 |
| M | Universal Search | PARTIAL | **PARTIAL** (improved) | `/api/search` now also returns tasks, projects and goals — same endpoint, no duplicate |
| D | Organization | PARTIAL | **PARTIAL** | Inbox exists; Areas/Resources/Archives are still not modelled |
| H | Habits | PARTIAL | PARTIAL (unchanged) | still counter-based |
| L | Files ↔ entities | MISSING | MISSING (unchanged) | — |
| J | Vault | MISSING | **BLOCKED (D-1)** | — |

Batch 1 verification actually run: 16 files / 176 tests, lint, both builds, 13/13 browser checks,
4 views × 4 widths with zero overflow and zero buttons under 40 px.

### 7.2 Batch 2 — dashboard, autosave, toasts

| # | Module | Before Batch 2 | After Batch 2 | Evidence |
| --- | --- | --- | --- | --- |
| A | Home / Dashboard | MISSING | **EXISTS** (fixed widgets, no drag-and-drop) | `GET /api/dashboard`, `dashboard.test.ts` DSH-01…07, browser B2-01…03, B2-07 |
| C | Notes — autosave | MISSING | **PARTIAL** (autosave + status; no version history yet) | `flushAutosave`, `saveState` UI, browser B2-05…06 |
| — | Toast notifications | MISSING | **EXISTS** | `.toast-stack` with `role=status`/`alert`, browser B2-04 |
| — | `prefers-reduced-motion` | MISSING | **EXISTS** | global media query, browser B2-09 |

Batch 2 verification actually run: 17 files / 184 tests, lint, both builds, 12/12 browser checks.

### 7.3 Still missing after Batch 2

| # | Module | Status | Note |
| --- | --- | --- | --- |
| C | Note version history / backlinks / templates / Markdown | NOT IMPLEMENTED | Markdown is blocked on D-3 |
| D | Areas / Resources / Archives model | NOT IMPLEMENTED | Only Inbox exists |
| G | Reminder recurrence, snooze, month view | PARTIAL | Reminders are still single-date |
| H | Habit day history + recomputed streaks | PARTIAL | needs `habit_logs` |
| K | Knowledge Library / SOP | NOT IMPLEMENTED | planned as note `kind` |
| L | File ↔ entity links | NOT IMPLEMENTED | needs `entity_files` |
| N | Daily / Weekly review | NOT IMPLEMENTED | dashboard covers the read-only half |
| O | Import / Export | NOT IMPLEMENTED | blocked on D-4 |
| P | Settings screen | PARTIAL | theme/profile are device-local and labelled as such in code, not yet in UI |
| J | Vault | BLOCKED | D-1 unanswered |

### 7.3a Batch 3 — habit history and reminder recurrence (2026-10-20)

| # | Module | Before Batch 3 | After Batch 3 | Evidence |
| --- | --- | --- | --- | --- |
| H | Habits | PARTIAL (counter only) | **EXISTS** — `habit_logs` is the source of truth, streaks recomputed, past days correctable, weekly/monthly summaries, `tracking_start_date`, legacy counters preserved | `010_...sql`, `habit-logs.ts`, `habit-logs.test.ts` HBL-01…11, browser B3-01…03 |
| G | Calendar / Reminders | PARTIAL | **PARTIAL → nearly complete** — daily/weekly/monthly/yearly recurrence with an anchor, snooze +1/+3/+7, retry-safe, effective date honoured by `upcoming` and the dashboard. Still no month/agenda view | `reminders.test.ts` REM-01…13, browser B3-04…07 |
| A | Dashboard | EXISTS | EXISTS (improved) | habit week summary and snoozed reminder dates now come from real rows |
| — | Time source | PARTIAL (API-D1: UTC vs local) | **FIXED** | `dates.ts` is now the single source; `life-os.ts`, `work.ts` and `dashboard.ts` all use it |

**API-D1 is closed.** The Life OS module previously built "today" from the UTC date while the work
module used the local date, so between 17:00 and midnight local time the two disagreed. All modules
now import `localToday()` from `apps/server/src/dates.ts`.

Batch 3 verification actually run: 19 files / 209 tests, lint, both builds, 11/11 browser checks.

### 7.4 Batch 4 scope (proposed, not started)

1. File ↔ entity links (`entity_files`) with owner triggers — closes L.
2. Library as a note `kind` with review date — closes K.
3. Settings screen that states which values are device-local — closes P.
4. Calendar month/agenda view over the existing reminders and timeblocks — finishes G.
5. Daily/Weekly review page built on the dashboard queries — starts N.

Vault stays out until the owner answers D-1.
