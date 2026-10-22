# Architecture

## Overview
This is a self-hosted Personal Knowledge Hub intended to run on a single local Windows machine and be accessed from personal devices only through Tailscale after all required gates are satisfied.

## Design goals
- Keep the app self-hosted and local-first
- Store metadata in SQLite with FTS5 support
- Store file objects on disk under a dedicated data directory, not inside SQLite
- Support notes, bookmarks, categories, tags, favorites, trash, and files
- Keep the app isolated from public internet exposure
- Require authentication for all protected endpoints

## Proposed deployment layout
- Repo: C:\Users\_phontakonnn\Documents\Wed_Phontakon
- Data directory: C:\PKH-data
- Log directory: C:\PKH-data\logs
- Object storage: C:\PKH-data\objects
- Temporary uploads: C:\PKH-data\tmp
- Backup directory: not approved yet; must be physical disk separate from DATA_DIR and verified before backup acceptance

The paths above are deployment targets, not evidence that those directories exist. The actual
workspace root was verified with `git rev-parse --show-toplevel` on 2026-10-19.

## Components
### Frontend
- React + TypeScript + Vite + Tailwind CSS
- The current single-page UI implements authenticated Notes CRUD, Trash, search, Bookmarks,
  category/tag management and assignment, Favorites, file upload/download/delete, and the Life OS
  surface (people/CRM, reminders, daily timeblocks, habits) using the Fastify API; styling uses CSS
  because Tailwind is not declared in the web manifest.
- Layout is a three-column shell (sidebar, list, detail) that collapses to a single column with a
  drawer and a full-screen detail panel below 900 px. Five accent themes and a light/dark mode are
  applied through `data-theme` / `data-mode` attributes on `:root`; the choice is browser-local.
- Vite proxies `/api` to the loopback Fastify server during development.
- The production Vite build is served by Fastify from `apps/web/dist` on the same origin.

### Backend
- Node.js LTS + Fastify
- Exposes health, authentication/session, Notes, Bookmarks, Categories, Tags, Note taxonomy,
  Favorites, Files, and Life OS REST endpoints (`/api/people`, `/api/reminders`, `/api/timeblocks`,
  `/api/habits`, `/api/search`).
- Handles authentication and owner-scoped note, bookmark, category, tag, relation, favorite and file
  metadata. File bytes are streamed to disk, never buffered in memory.
- Binds to `127.0.0.1`; no public port is opened by the application.

### Database
- SQLite with WAL enabled
- FTS5 indexes for Notes title/content are maintained by SQLite triggers. User-facing substring
  search uses a separate NFC trigram index for queries of at least 3 Unicode code points and a
  paginated, owner-scoped NFC `instr()` fallback for shorter queries.
- Strict foreign keys and a migration-driven schema

### Filesystem layer
- Objects are stored in `DATA_DIR\objects\<first two UUID characters>\<uuid>` with
  server-generated UUID names; client filenames never appear in a path.
- Uploads stream to `DATA_DIR\tmp\<uuid>.part`, are hashed with SHA-256 while arriving, fsynced,
  then atomically renamed into the object shard. The metadata row is inserted afterwards.
- Orphan policy: a failed metadata insert leaves the object in place and logs it; nothing is
  auto-deleted. A row whose object is missing denies delivery with a generic error and is logged.
- `storage:check` reports missing/orphan/unexpected objects, size and hash mismatches, duplicate
  keys and stale temp files; `storage:quarantine` moves (never deletes) into
  `DATA_DIR/quarantine/<stamp>/`. There is no automatic startup run.
- Backup snapshots copy `DATA_DIR/objects` and encrypt every object with AES-256-GCM when a key is
  configured; verification checks per-file plaintext and stored hashes, and rejects a set whose
  database and objects disagree about encryption.

## Data flow
1. User authenticates via the local login flow.
2. API validates request origin, session, input, and ownership.
3. Notes, bookmarks, categories, tags, note relations and favorites are stored in SQLite; deleted
   notes are soft-deleted and omitted from active lists. Bookmark URLs are never fetched by the
   server.
4. File uploads stream to a temporary file, are hashed, fsynced and renamed into the object store;
   the database row is committed last. Downloads are owner-checked before any byte is opened and
   support a single byte range.

## Trust boundaries
- Browser -> local app service
- App -> SQLite
- App -> filesystem object store
- App -> Tailscale only after explicit approval and acceptance gates pass

## Security posture
- Default deny for all protected endpoints
- Login endpoint only for unauthenticated access
- Health endpoint probes SQLite with `SELECT 1`; it returns only a generic unavailable status when
  the probe fails and does not expose database errors or paths
- Fastify applies global Helmet headers with a self-only CSP, `nosniff`, frame denial, and no HSTS
  on the HTTP loopback listener
- No public signup; administrator bootstrap is CLI-based locally only
- Remote access, if approved later, is Tailscale-only: never Funnel and never a public port.
- No secrets, databases, or object files in Git tracking

## Current implementation status

The architecture above contains both current implementation and clearly marked future design.
As of 2026-10-20, authentication/session handling, Notes CRUD, Trash restore, user-facing Notes
search, Bookmarks CRUD, Categories/Tags CRUD and note relations, a local SQLite migration runner,
Favorites, file storage (single-request streaming upload, download with Range, delete),
encrypted backup/restore of `DATA_DIR/objects`, backup preflight, storage reconciliation, and the
Life OS tables and routes (people/CRM, note-person links, reminders, timeblocks, habits, grouped
search) exist. Tailwind, resumable (Tus) uploads, previews, background notifications, and remote
access configuration do not exist. Search is rate-limited per client IP and was
measured on a temporary synthetic corpus; see `DECISIONS.md` and `ACCEPTANCE.md` for evidence and
release gates.
