# Decisions

## Date
- 2026-10-19

## Current evidence
- Windows 10 Enterprise LTSC build 19044, x64; 32,478 MB RAM (Phase 0 `systeminfo` output)
- Node.js v24.22.0 and npm 11.19.1 are active in the current environment
- Git 2.56.0.windows.2 is available, but this workspace is not initialized as a Git repository
- The earlier Phase 0 audit found Tailscale absent, C: with approximately 789 GB free, and D: with approximately 6.97 GB free
- BitLocker status and physical-disk/volume separation remain unverified
- The user explicitly approved continuing through phases; approval does not replace evidence or acceptance criteria

## Decisions

### Paths
- Keep the repo in the existing workspace; do not create a second project tree over it.
- Proposed future data directory remains `C:\PKH-data`, but no production data directory has been created or used.
- Backup directory remains unselected until a separate physical disk is identified and verified. Do not treat D: as a backup disk based on the current evidence.

### SQLite driver
- Use the already-installed `better-sqlite3` 13.0.3 for this implementation slice.
- Evidence: package metadata reports MIT and Node `>=22`; on Node v24.22.0/Windows x64 it loaded successfully, created an in-memory FTS5 table, inserted a row, and returned a matching query result.
- It is a native addon; no dependency was added in this task. A local declaration file was added because the installed package does not provide TypeScript declarations.
- `sqlite3` 6.0.1 is also present in the existing server manifest, reports BSD-3-Clause, and passed the same in-memory FTS5 smoke test. It is not used by the application implementation. Do not add/upgrade dependencies without a separate dependency review and approval.

### Database behavior
- Use versioned forward-only SQL migrations under `apps/server/migrations`.
- Enable `foreign_keys=ON`, `busy_timeout=5000`, and WAL for file-backed databases. In-memory test databases use SQLite's in-memory journal mode.
- Production database path is `DATA_DIR/db/knowledge.sqlite3`; server startup rejects a missing DATA_DIR and requires an absolute path.
- Keep large files outside SQLite; no file storage implementation exists yet.

### Authentication and sessions
- Use Node's built-in `crypto.scrypt` rather than adding an Argon2 package. Password minimum is 12 Unicode code points.
- No public registration route. Initial administrator creation is a local CLI operation that reads a hidden password from an interactive terminal and refuses to initialize a second administrator.
- Store session token SHA-256 hashes, not raw tokens; enforce 7-day sliding idle and 30-day absolute expiry.
- Store a capped User-Agent label for authenticated per-device session listing; current session, selected session, other sessions, and all sessions can be revoked through authenticated routes.
- Session cookies are HttpOnly and SameSite=Strict; Secure follows the configured HTTPS origin. Origin, Host, and a custom request header are checked for mutating requests.
- Login throttling is currently in-process memory, per IP and normalized account, with a 15-minute window and exponential delays after five failures. Restart persistence and multi-process coordination are not implemented and remain a known limitation.

### Search, files, backup, and remote access
- Thai search strategy remains a design candidate only; no accuracy/latency comparison has been run.
- File upload/preview, backup/restore, and remote access are not implemented.
- Remote access remains deferred until the required QA and backup/restore gates pass. No Tailscale Serve, firewall, public port, or proxy configuration was changed.
- Backup/DR cannot pass until a separate physical backup target is identified and tested.

## Approval and implementation status
- The user authorized proceeding through phases on 2026-10-19.
- The workspace's Phase 1 design package remains incomplete: `SCHEMA.md`, `API.md`, `BACKUP.md`, `TEST_PLAN.md`, and `ACCEPTANCE.md` are absent. The current phase is partial Phase 2 work, not a claim that all phase gates passed.
- This task added no npm dependency and did not create or modify a persistent user database. Tests used memory/temp databases only.
- Git status/diff/track checks are unavailable because there is no `.git` directory. No claim is made that secrets are absent from Git history or tracked files.
