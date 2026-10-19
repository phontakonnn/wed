# Threat Model

## Assets
- User notes and metadata
- Bookmarks and categories
- File objects and uploaded originals
- Authentication secrets and session identifiers
- Database files and log files
- Local storage directories and backup targets

## Trust boundaries
- Internet boundary: not exposed in the current design
- Personal device boundary: user devices authenticated via Tailscale only later
- Local machine boundary: app, SQLite DB, and object files reside on the same machine
- Backup boundary: not yet approved because no verified stand-alone backup disk exists

## Threats and mitigations

### 1) Unauthorized API access
Mitigation:
- Default deny for protected endpoints
- Session validation on every protected request
- Cookie security attributes and strict same-site policy
- Origin/Host validation for state-changing requests

### 2) Brute force attacks
Mitigation:
- Login throttling with exponential delays
- Per-IP and per-account limits
- No password disclosure in logs

### 3) File traversal and malicious file names
Mitigation:
- Server-side validation only
- UUID-based path generation for files
- Windows reserved names blocked
- Unicode normalization and path traversal checks

### 4) Malicious file content and XSS
Mitigation:
- Attachment default for unsafe content types
- Inline preview allowlist only
- Strict MIME validation and no sniffing headers
- CSP limited to self and inline preview needs

### 5) Disk corruption and partial writes
Mitigation:
- Streaming writes to temp files
- Atomic rename after fsync and flush
- DB transaction rules to minimize half-written metadata
- Orphan detection without deleting user files automatically

### 6) Database inconsistency or crash during write
Mitigation:
- SQLite WAL mode with foreign keys and busy timeout
- Transaction discipline
- Recovery checks after restart and policy-based temp cleanup

### 7) Remote exposure risks
Mitigation:
- Remote access deferred until after QA, backup, and explicit approval
- No default trust proxy configuration
- No public reverse proxy, Funnel, or LAN port forwarding

## Residual risks
- There is no approved backup disk yet; therefore backup protection remains incomplete
- No remote access has been validated yet
- BitLocker status was not confirmable without elevated privileges
- A true DR plan is pending the availability of a separate physical backup disk
