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
- The current UI implements authenticated Notes CRUD and uses the Fastify API; styling currently
  uses CSS because Tailwind is not declared in the web manifest.
- Vite proxies `/api` to the loopback Fastify server during development.
- The production Vite build is served by Fastify from `apps/web/dist` on the same origin.

### Backend
- Node.js LTS + Fastify
- Exposes health, authentication/session, and Notes REST endpoints.
- Handles authentication and note metadata. File upload/object operations remain planned.
- Binds to `127.0.0.1`; no public port is opened by the application.

### Database
- SQLite with WAL enabled
- FTS5 index for Notes title/content, maintained by SQLite triggers. User-facing search is not yet
  implemented.
- Strict foreign keys and a migration-driven schema

### Filesystem layer
- Planned: objects stored in DATA_DIR\objects with immutable UUID-based names.
- Planned: temporary upload segments stored in DATA_DIR\tmp.
- Orphan detection and cleanup rules must be documented before implementing file storage.

## Data flow
1. User authenticates via the local login flow.
2. API validates request origin, session, input, and ownership.
3. Notes metadata is stored in SQLite; deleted notes are soft-deleted and omitted from active lists.
4. File upload/download and object-storage steps are planned and not implemented.

## Trust boundaries
- Browser -> local app service
- App -> SQLite
- App -> filesystem object store
- App -> Tailscale only after explicit approval and acceptance gates pass

## Security posture
- Default deny for all protected endpoints
- Login endpoint only for unauthenticated access
- Health endpoint is intentionally minimal and non-sensitive
- No public signup; administrator bootstrap is CLI-based locally only
- Remote access, if approved later, is Tailscale-only: never Funnel and never a public port.
- No secrets, databases, or object files in Git tracking

## Current implementation status

The architecture above contains both current implementation and clearly marked future design.
As of 2026-10-19, authentication/session handling, Notes CRUD, a local SQLite migration runner,
and backup/restore tooling exist. Bookmarks, categories/tags, trash restore, file storage, user-facing
FTS search, Tailwind, and remote access configuration do not yet exist. See `ACCEPTANCE.md` for
release gates.
