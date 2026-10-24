# Threat Model

> **เอกสารประวัติศาสตร์ (historical):** Fastify/SQLite backend และสคริปต์ที่อ้างถึงในเอกสารนี้
> ถูกลบออกจากโปรเจกต์แล้ว (ดู `docs/CLEANUP_LOG.md` และ `docs/DECISIONS.md`) ปัจจุบันระบบเป็น
> PWA ที่ทำงานบน Firebase ทั้งหมด — คำสั่งอย่าง `npm run dev:server`, `backup:create` หรือ
> `bootstrap:admin` ไม่มีอยู่แล้ว ใช้ `npm run dev` และ `docs/SECURITY.md` แทน


## Assets
- User notes and metadata
- Bookmarks and categories
- File objects and uploaded originals
- Life OS records: people profiles (including allergies/medical notes), reminders, daily schedule
  and habit history
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
- The throttle map is bounded (10,000 keys): expired buckets are dropped first, then the oldest
  entries are evicted. This trades a possible early reset under extreme key churn for bounded
  memory; it is documented rather than hidden.
- `request.ip` is the socket address; forwarded headers are not trusted because `trustProxy` is
  off. A test proves spoofed `X-Forwarded-For` values do not split the bucket.
- State is per process and resets on restart; multi-process deployments are not supported.

### 3) File traversal and malicious file names
Mitigation:
- Server-side validation only
- UUID-based path generation for files
- Windows reserved names blocked
- Unicode normalization and path traversal checks

### 4) Malicious file content and XSS
Mitigation / status:
- Uploaded bytes are stored under a server-generated UUID and are never used to build a path.
- Downloads are owner-checked before the first byte. The media type comes from magic bytes, not the
  client. Only JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MP3, OGG and WAV are served `inline`; HTML,
  SVG, PDF and unknown types are always `attachment`, with `X-Content-Type-Options: nosniff`.
- `@fastify/helmet` applies a self-only CSP, denies framing, sets `nosniff`, sets
  `Referrer-Policy: no-referrer`, and a deny-all `Permissions-Policy`.
- API tests cover the configured response headers. The UI has not been manually exercised in a
  browser under this CSP, so browser compatibility remains NOT VERIFIED.

### 5) Disk corruption and partial writes
Mitigation:
- Streaming writes to temp files
- Atomic rename after fsync and flush
- DB transaction rules to minimize half-written metadata
- Per-file plaintext and stored SHA-256 recorded in the backup manifest; a count/size match alone is
  not accepted as verification
- Encrypted object snapshots are authenticated with GCM per file, so tampering or truncation is
  detected before a restore
- Storage reconciliation reports missing, orphan and unexpected files; quarantine moves rather than
  deletes

### 6) Database inconsistency or crash during write
Mitigation:
- SQLite WAL mode with foreign keys and busy timeout
- Transaction discipline
- Recovery checks after restart and policy-based temp cleanup
- Restore verifies the backup, materializes objects into a staging directory, verifies each file,
  and only then replaces the database; both halves roll back on failure

### 6a) Backup confidentiality and mixed-policy sets
Mitigation:
- AES-256-GCM for the database and for every stored object, with a fresh IV per file
- Verification rejects a set whose database and object snapshot disagree about encryption
- `BACKUP_ENCRYPTION_REQUIRED=true` fails closed; no plaintext fallback
- Keys are never written to manifests, logs, scripts, or command lines
- Manifests may record a key **id** (not the key). Verification selects the key by id from the
  active key or an operator-supplied ring, and fails with `No backup key is configured for key id`
  rather than trying unrelated keys.
- A rotated active key does not re-encrypt old backups; old keys stay in the ring until the backups
  they protect expire.

Residual risk: encrypted database verification still needs a transient plaintext SQLite file under
the OS temp directory; a crash can leave it behind. Object verification does not write plaintext.
Key storage, escrow, loss recovery, and rotation on a real machine remain NOT VERIFIED.

### 7) Remote exposure risks
Mitigation:
- Remote access deferred until after QA, backup, and explicit approval
- No default trust proxy configuration
- No public reverse proxy, Funnel, or LAN port forwarding

### 8) Sensitive personal data in Life OS records

`people.allergies_and_medical`, `favorites_and_likes`, `gift_ideas_and_sizes` and `memo` hold
third-party personal data, and `reminders`/`life_timeblocks` reveal daily routines.

Mitigation:
- Every route is owner-scoped; a foreign id returns 404 and never 403, so existence is not leaked
- `people_avatar_owner_*`, `note_people_owner_*` and `reminders_person_owner_*` triggers reject a
  link that crosses accounts at the storage layer, not only in the handler
- Text is NFC-normalized and control-character-rejected; the value is bound as a SQL parameter
- The data lives in the same encrypted-at-rest boundary as notes: it is covered by the AES-256-GCM
  backup and by whatever protects `DATA_DIR` on disk (BitLocker status unverified)
- No route exposes another account's person through the search endpoint; `/api/search` filters on
  `owner_id` before matching

Residual: these columns are stored in plaintext inside the SQLite file. Anyone who can read
`DATA_DIR` without the backup key sees them, and a compromised session sees the full profile.

## Residual risks
- There is no approved backup disk yet; therefore backup protection remains incomplete
- Backup encryption is implemented, but key storage, escrow, rotation and loss recovery are NOT
  VERIFIED on a real machine
- Physical disk separation (BK-08) is NOT VERIFIED; different volumes are not proof of different disks
- Scheduled backup has never run as a registered task; only static checks and a manual wrapper exist
- No restore drill has been performed on real data
- A plaintext SQLite staging file can survive a crash or power loss in the OS temp directory
- Object snapshots are full copies, so backup time and space grow linearly with the store
- Browser UI behavior (including CSP compatibility) is verified in Chrome only; Brave is NOT VERIFIED
- Life OS text columns are plaintext inside the SQLite file and depend on OS disk encryption
- No remote access has been validated yet
- BitLocker status was not confirmable without elevated privileges
- A true DR plan is pending the availability of a separate physical backup disk
