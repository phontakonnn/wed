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
- Repo: C:\Users\_phontakonnn\Documents\Wed_Phontakon\PKH\app
- Data directory: C:\PKH-data
- Log directory: C:\PKH-data\logs
- Object storage: C:\PKH-data\objects
- Temporary uploads: C:\PKH-data\tmp
- Backup directory: not approved yet; must be physical disk separate from DATA_DIR and verified before backup acceptance

## Components
### Frontend
- React + TypeScript + Vite + Tailwind CSS
- Runs under the same-origin local app service in production
- Not served via the Vite dev server in production mode

### Backend
- Node.js LTS + Fastify
- Exposes REST API
- Handles authentication, file uploads, metadata operations, and health checks
- Binds to 127.0.0.1 only in production

### Database
- SQLite with WAL enabled
- FTS5 for search indexing
- Strict foreign keys and a migration-driven schema

### Filesystem layer
- Objects stored in DATA_DIR\objects with immutable UUID-based names
- Temporary upload segments stored in DATA_DIR\tmp
- Orphan detection and cleanup rules documented in the file policy because the system cannot delete object records or object files automatically without evidence

## Data flow
1. User authenticates via local login flow.
2. API validates request, session, auth, and input.
3. For note/bookmark actions, metadata is stored in SQLite.
4. For file uploads, a temp file is written and hashed while streaming.
5. The temp file is finalized atomically into objects storage.
6. Final metadata is committed in DB transaction only after object finalization succeeds.
7. Download/preview requests validate session, permissions, and path before sending bytes.

## Trust boundaries
- Browser -> local app service
- App -> SQLite
- App -> filesystem object store
- App -> Tailscale only after explicit approval for remote access

## Security posture
- Default deny for all protected endpoints
- Login endpoint only for unauthenticated access
- Health endpoint is intentionally minimal and non-sensitive
- No public signup; administrator bootstrap is CLI-based locally only
- No secrets, databases, or object files in Git tracking
