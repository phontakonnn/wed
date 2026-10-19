# Progress

## Current phase
- Phase 2 — MVP implementation (partial; SQLite and initial authentication slice)
- The user explicitly authorized proceeding through phases in this conversation. This does not mean the project has passed phase exit criteria.

## Verified environment
- Windows 10 Enterprise LTSC, version 10.0.19044, x64; RAM 32,478 MB (Phase 0 command output)
- Node.js v24.22.0; npm 11.19.1
- Git for Windows command reports version 2.56.0.windows.2, but this workspace has no `.git` directory
- Tailscale was not installed during the earlier Phase 0 audit; remote access remains untouched
- C: free space approximately 789 GB; D: approximately 6.97 GB from Phase 0; backup physical-disk separation remains unverified
- BitLocker status remains unverified due to an access-denied result in Phase 0

## Implemented in this slice
- Existing `better-sqlite3` driver used; no package was added during this task
- Versioned initial migration for users and sessions
- SQLite foreign keys, WAL for file-backed databases, and 5-second busy timeout
- Explicit absolute `DATA_DIR` requirement for server startup; database location is `DATA_DIR/db/knowledge.sqlite3`
- Built-in Node `scrypt` password hashing with a 12-character minimum
- CLI-only one-time administrator bootstrap with hidden terminal password entry
- Session tokens stored as SHA-256 hashes; 7-day idle and 30-day absolute expiry
- HttpOnly/SameSite=Strict cookie; Secure attribute follows configured HTTPS origin
- Authenticated session listing includes a bounded User-Agent device label; selected-session, other-session, current-session, and all-session revocation routes exist
- Login-only account access, no registration route, per-IP and per-account in-process exponential throttling, CSRF Origin/Host/custom-header checks, and default-deny protected routing
- Vitest limited to `src` to avoid counting generated `dist` test copies

## Verification evidence (2026-10-19)
- `npm run lint`: completed with no ESLint findings (web package)
- `npm run build:web`: passed; Vite 8.3.4 emitted production assets
- `npm run build:server`: passed; TypeScript compiler emitted no errors
- `npm test`: 3 test files passed; 14 tests passed; 0 failed; 0 skipped
- SQLite smoke check in `apps/server` loaded both already-installed drivers and created/query-tested an in-memory FTS5 table; implementation uses `better-sqlite3`
- Tests used in-memory and temporary-directory databases; server was not launched against a real DATA_DIR

## Phase/design status
- Existing architecture, threat model, dependency inventory, progress, and decision docs were found
- `MASTER_PROMPT.md` is absent from the workspace
- `SCHEMA.md`, `API.md`, `BACKUP.md`, `TEST_PLAN.md`, and `ACCEPTANCE.md` are absent; Phase 1 design artifacts are therefore incomplete in this workspace
- The current implementation has not passed the full Phase 1/Phase 2 exit criteria

## Blockers and residual risks
- This folder is not a Git repository: `git status`, `git diff`, and `git ls-files` cannot provide status or tracked-file evidence
- Interactive bootstrap was compiled but not executed; no admin account or persistent database was created
- Login throttling is process-memory state and resets on restart; persistence and multi-process behavior are not implemented
- Session/device listing and revocation for other devices are not implemented
- No full CRUD, file streaming, backups, Thai-search evaluation, QA/security suite, or remote access is implemented
- No real data has been used; do not call this production-ready

## Next action
- Continue only with the approved project sequence and existing dependencies; do not enable remote access or touch user data
- Complete missing design/API documentation and extend migration/auth tests before broad MVP work
- Initialize or connect Git only after confirming the intended repository location and preserving existing files
