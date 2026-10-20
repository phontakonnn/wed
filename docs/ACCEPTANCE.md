# Acceptance Criteria

**Verdict as of 2026-10-20: NOT ACCEPTABLE FOR REAL DATA / NOT PRODUCTION-READY.**
Phase 2 is partially complete. Authentication, Notes CRUD, Trash operations, search, Bookmarks CRUD,
categories/tags, favorites and file upload/download have an owner-scoped API, automated coverage, and
a same-page UI that passed CH-01..CH-20 in the installed Chrome on 2026-10-20 (see §5 PR-09). The
Brave column is still unexecuted, the human walkthrough has not been done, and the backup gate
remains open.

A criterion is only `PASS` with evidence that can be re-run. "It works on my machine" is not
evidence. Every `FAIL`/`PARTIAL` line is a blocker, not a backlog item.

---

## 1. Phase 1 — design artefacts

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| P1-01 | Architecture documented | PASS | `docs/ARCHITECTURE.md` |
| P1-02 | Threat model documented | PASS | `docs/THREAT_MODEL.md` |
| P1-03 | Dependency inventory with licenses | PARTIAL | `docs/DEPENDENCIES.md`; transitive licenses not fully inventoried |
| P1-04 | Database schema documented | PASS | `docs/SCHEMA.md` |
| P1-05 | API contract documented | PASS | `docs/API.md` |
| P1-06 | Backup/restore plan documented | PASS | `docs/BACKUP.md` |
| P1-07 | Test plan documented | PASS | `docs/TEST_PLAN.md` |
| P1-08 | Master prompt / requirements source in repo | PASS | Tracked root file `MASTER_PROMPT.md` is present (verified 2026-10-19); older audit entries claiming absence are stale |

---

## 2. Phase 2 — security core

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| P2-01 | SQLite with foreign keys, WAL, busy timeout | PASS | `database.ts`; DB-01..03 |
| P2-02 | Versioned, transactional migrations | PASS | `database.ts` discovers sequential migrations; each migration and tracking row share a transaction; DB migration tests include upgrade preservation and failure rollback |
| P2-03 | Password hashing with a modern KDF | PASS | scrypt N=32768, r=8, p=1, 64-byte key, 16-byte salt; AU-01 |
| P2-04 | No plaintext password stored anywhere | PASS | Only `scrypt$…` strings; AU-01 asserts the hash does not contain the password |
| P2-05 | Session tokens stored hashed | PASS | SHA-256 hex in `sessions.id_hash`; AU-03 |
| P2-06 | Idle + absolute session expiry | PASS | 7d sliding, 30d absolute, clamped; AU-03 |
| P2-07 | Cookie hardening | PASS | `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS; API-04/05 |
| P2-08 | CSRF protection on mutating requests | PASS | `Origin` + `Host` + `X-PKH-Request`; API-02 |
| P2-09 | Default-deny routing | PASS | Only health and login public; API-01/02 |
| P2-10 | No public registration | PASS | No route; CLI-only bootstrap; AU-02 |
| P2-11 | Login throttling | PARTIAL | In-process only; resets on restart, single-process; API-08 |
| P2-12 | No account enumeration | PASS | Identical 401 body and dummy-hash timing path; API-03 |
| P2-13 | Per-device session revocation | PASS | List/revoke-one/revoke-others/logout-all; API-06/07 |
| P2-14 | Server binds to loopback only | PASS | `listen({ host: '127.0.0.1' })` |
| P2-15 | Automated test suite green | PASS | 6 test files, 58 passed, 0 failed, 0 skipped; `npm.cmd run lint`, both builds, and `git --no-pager diff --check` also exited 0; see current `PROGRESS.md` checkpoint |
| P2-16 | Security headers applied globally | PASS | `@fastify/helmet` global registration; API-21 checks CSP, `nosniff`, frame denial, Referrer-Policy, and local HTTP HSTS omission |

---

## 3. Backup and restore gate (blocking)

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| BK-01 | WAL-safe backup via Online Backup API | PASS | `backup.ts`; BK-01 test proves uncheckpointed data is captured |
| BK-02 | Every backup checksummed and manifested | PASS | SHA-256 + size + schema versions; BK-02 |
| BK-03 | Corruption/tamper detection | PASS | BK-03 |
| BK-04 | Restore works end to end | PASS | BK-04 (temp directory) |
| BK-05 | Automatic pre-restore safety copy | PASS | BK-04 |
| BK-06 | Restore refuses a live database | PASS | BK-05 |
| BK-07 | Retention is bounded and safe | PASS | BK-07; only pattern-matching files are pruned |
| BK-08 | Backup directory on a **separate physical disk** | NOT VERIFIED | Read-only inventory on 2026-10-19: exactly one physical disk (`Win32_DiskDrive` Index 0, KINGSTON SNV2S1000G, 3 partitions) and one logical volume `C:`. The CIM association maps `C:` to `Disk #0, Partition #1`. The probe script returns `cim:0` when run directly; the CLI child process returns UNKNOWN under the sandbox. With a single disk there is no separate destination to test, so BK-08 cannot pass. Different volumes are never accepted as proof. Re-checked read-only on 2026-10-20: still exactly one disk (`Win32_DiskDrive` Index 0, KINGSTON SNV2S1000G, 3 partitions) and one local volume `C:` (`Win32_LogicalDisk` DriveType 3). No external disk is attached, so BK-08 stays open |
| BK-09 | Scheduled daily backup running unattended | NOT VERIFIED | Smoke test on 2026-10-19 with temporary paths: wrapper exit 0, backup created and `verified: yes`, 3 files in the backup directory; lock held → exit 3; no `DATA_DIR` → exit 2 (earlier run). No task was registered and no unattended scheduled run occurred. Re-checked 2026-10-20: `Get-ScheduledTask` lists no PKH/backup task (only the unrelated OS task `RegIdleBackup`), so no unattended run has ever happened. A script smoke test is not a schedule |
| BK-10 | Restore drill with a real backup into an isolated recovery target | NOT VERIFIED | CLI drill on temporary data: object deleted, `backup:restore --yes` exit 0, object restored with an identical SHA-256, safety copy created. Targeted E2E-01..03 pass (full data, tampered rejection, mid-restore rollback). No drill with real backup data into an isolated recovery target exists. Limitation found: if the pre-restore store is already inconsistent (a `files` row with no object), the safety copy captures that state and fails verification, so it cannot be used as a CLI rollback. Re-checked 2026-10-20: the synthetic restore/rollback tests (`backup-e2e.test.ts`, 3/3) still pass in the full suite, but a synthetic restore is not a real drill, so BK-10 stays open |
| BK-11a | Encryption **implementation** (database + objects) | PASS | AES-256-GCM for the database and every stored object, fresh IV per file, GCM tag checked, fail-closed when required, mixed-policy sets and key-id mismatches rejected; BK-15..BK-24, KEY-01..KEY-12 and E2E-01..03 on temporary data |
| BK-11b | Encryption **operations** (key storage, escrow, rotation, encrypted target) | NOT VERIFIED | On 2026-10-19 no `BACKUP_ENCRYPTION_KEY`, `KEY_ID` or `REQUIRED` is set in the environment. With `REQUIRED=true`, preflight exits 1 and `create` refuses before writing (0 files in the backup directory). Rotation mechanism is tested synthetically (KEY-07..KEY-10) and the runbook is written (§16 of `BACKUP.md` covers generate/store-on-Windows/escrow/rotate/remove/loss), but no real key store, escrow, loss recovery or encrypted target exists. Re-checked 2026-10-20: `BACKUP_ENCRYPTION_KEY`, `BACKUP_KEY_ID` and `BACKUP_ENCRYPTION_REQUIRED` are still unset in the machine environment, so no operation could be performed against a real key |

**The gate is closed.** BK-08 through BK-11 are mandatory before any real user data is stored.

---

## 4. Remote access gate

| ID | Criterion | Status |
| --- | --- | --- |
| RA-01 | All backup gate items pass | FAIL |
| RA-02 | Restore drill passed on real data | FAIL |
| RA-03 | Security review of the exposed surface | FAIL — not started |
| RA-04 | Tailscale Serve (not Funnel) configured, no public ports | FAIL — not installed |
| RA-05 | Firewall rules reviewed and recorded | FAIL |

**Remote access stays disabled.** No Tailscale, firewall, port-forward, or reverse-proxy change
may be made until RA-01..05 pass and the operator records the evidence here.

---

## 5. Product scope (Phase 2+ — partial implementation)

| ID | Criterion | Status |
| --- | --- | --- |
| PR-01 | Notes CRUD | PASS — create/list/detail/update/soft-delete, owner-scoped and paginated (`apps/server/src/index.test.ts`) |
| PR-02 | Bookmarks CRUD | PARTIAL — additive schema, owner-scoped API and same-page UI implemented; backend tests pass, and the Chrome browser flow passed CH-17 (create/edit/delete/reload persistence, `javascript:` rejection, zero outbound metadata fetch) on 2026-10-20. Brave was not executed, so the browser criterion is not fully closed |
| PR-03 | Categories, tags, favorites | PARTIAL — additive migrations, owner-scoped CRUD/relations, Trash preservation, idempotent owner-scoped favorites, and same-page UI implemented; API/migration tests pass, and Chrome passed CH-18 (taxonomy CRUD + assignment + reload) and CH-19 (favorites, both item types) on 2026-10-20. Brave was not executed |
| PR-04 | Trash with restore | PARTIAL — owner-scoped API operations and FTS behavior pass API-15..19; the Chrome browser flow (trash, restore, cancel/confirm permanent delete) passed CH-08..CH-12 on 2026-10-20. Brave was not executed |
| PR-05 | File upload, preview, download | PARTIAL — streaming single-request upload (1 GiB default limit, 2 concurrent), owner-scoped list/download/delete, server-side media detection, Range support, attachment policy for active content, encrypted backup/restore of `DATA_DIR/objects`, and storage reconciliation are implemented and tested. Chrome passed CH-20 on 2026-10-20: synthesised PNG/TXT/HTML upload, fact display, byte-identical downloads (SHA-256 match), HTML forced to `attachment`, 206/416 Range responses, oversize rejection, delete, and 401 for a signed-out second context. Still no preview rendering, no resumable/Tus upload, and no Brave run. Range was verified at the HTTP layer, not via a seek in a playing video element |
| PR-06 | Thai-aware search | PARTIAL — search API/UI and additive trigram index implemented; 24 API query cases matched the independent oracle exactly; authenticated 61st request returns 429. Controlled three-run synthetic 10k HTTP comparisons (same long query, owner, corpus, page/count semantics) measured trigram p95 means of 2.720 ms (1%), 10.222 ms (10%), and 0.814 ms (no hit), versus forced full-scan means of 29.724, 21.925, and 38.900 ms; short-query full-scan p95 means were 30.090, 22.353, and 39.482 ms. All measured p95 values were below 300 ms. Chrome passed CH-05..CH-07 (Thai short query, hit, no-hit empty state) and CH-13/CH-14 (300 ms debounce sends one settled query; probe returns 200 for requests 1–60 and 429 for 61 with the Thai notice shown and recovery afterward) on 2026-10-20. Brave not executed; no concurrent or real-data test was run |
| PR-07 | Frontend wired to the API | PASS — React client calls authenticated Fastify endpoints; Vite proxy and production static serving are configured |
| PR-08 | Orphan object detection and cleanup policy | PARTIAL — policy is implemented and documented: objects are kept and logged on a failed metadata insert, missing objects deny delivery and are logged, nothing is auto-deleted. `storage:check` reports missing/orphan/unexpected files, size and hash mismatches, duplicate keys and stale temp files; `storage:quarantine` moves (never deletes) orphans and stale temp files into `DATA_DIR/quarantine`. No automatic startup run; quarantine is operator-triggered |
| PR-09 | Browser UI acceptance | PARTIAL — a headless Chrome render on 2026-10-19 exposed a crash on first load (`noteFavoriteState?.id === activeNoteId` was true when both were `undefined`, then dereferenced `null`); fixed in `App.tsx`. On 2026-10-20 the full checklist was executed in the installed Chrome `155.0.8059.85` over the DevTools Protocol at 1366×768 and 390×844: CH-01..CH-20 all PASS with no uncaught console error, no CSP violation, no unintended horizontal overflow, and no stale-after-refresh data. Brave (§4 of the checklist) is still NOT EXECUTED, and no human usability walkthrough or video-element Range playback was performed, so the browser gate is not closed |

The current UI supports login, Notes CRUD, a trash view, search, a bookmark view, category/tag
management and assignment, a favorites view, and a files view with upload/download/delete within
the existing page. The category/tag, favorites and files visual flows passed in installed Chrome on
2026-10-20 (`MANUAL_UI_CHECKLIST.md` §3, §8); Brave has not been run. The
30-day trash notice is informational; no background permanent-delete job exists. Tailwind is not
installed or used; styling remains plain CSS pending dependency approval. No Playwright/browser
automation suite exists.

---

## 6. Verification commands

Run from the repository root; paste the output into the phase report.

```bash
npm test
npm run build:server
npm run lint
npm run build:web
git status --short          # must be clean after a build
git ls-files | grep -Ei '\.(sqlite3?|db|env|pem|key)$'   # must print nothing
```

Latest verification after the 2026-10-20 browser acceptance pass: no source file was changed in that
pass (the browser defect fixed on 2026-10-19 was already in place). `npm.cmd test` → 14 files, 152
passed, 0 failed, 0 skipped; `npm.cmd run lint`, `npm.cmd run build:server`, `npm.cmd run build:web`
and `git --no-pager diff --check` all exited 0 (LF→CRLF warnings only). The installed Chrome
`155.0.8059.85` was driven over the DevTools Protocol against a temporary `DATA_DIR` on
`127.0.0.1:3459`; CH-01..CH-20 all PASS in Chrome with a clean console/CSP record. `git ls-files`
still reports no `*.db`/`*.sqlite`/`*.env`/`*.pem`/`*.key` file. Machine evidence unchanged: one
physical disk, no scheduled task registered, no encryption key configured. BK-08, BK-09, BK-10 and
BK-11b remain NOT VERIFIED; the Brave column of the browser checklist remains NOT EXECUTED. See
`PROGRESS.md`.

---

## 7. Owner acceptance checklist

These steps require the real machine and the real backup destination. They were **not** executed in
the workspace. Run them only when you are ready to store real data, and record the evidence in the
table at the end of this section.

### 7.0 Scope split — what is already proven vs. what only the owner can do

Use this to avoid redoing work that already has re-runnable evidence, and to see exactly which parts
cannot be closed from inside the workspace.

| Category | Items | Status |
| --- | --- | --- |
| Already proven by the automated suite (re-run any time with `npm.cmd test`) | DB/schema, auth and session hygiene, CSRF, throttling (in-process), Notes/Bookmarks/taxonomy/favorites/files APIs, backup create/verify/restore, object encryption, synthetic key rotation, storage reconciliation, DB disk-identity probe | PASS on synthetic data — see §1–§3 |
| Browser UI that could be automated here (installed Chrome over the DevTools Protocol) | CH-01..CH-20 in `MANUAL_UI_CHECKLIST.md` | PASS in Chrome on 2026-10-20; see §7.5 |
| Must be checked on the real Windows machine, by hand | Brave copy of CH-01..CH-20, human walkthrough at both viewports, video-element Range playback, physical disk inspection in Disk Management | outstanding |
| Requires an external disk physically separate from `DATA_DIR` | BK-08 (this machine has one physical disk, so it cannot be satisfied here) | NOT VERIFIED — see §7.1 |
| Requires a real key store / offline recovery copy outside `BACKUP_DIR` | BK-11b | NOT VERIFIED — see §7.4 |
| Requires waiting for real scheduled execution (≥ 3 consecutive unattended days) | BK-09 (script smoke test already passes; a smoke test is not a schedule) | NOT VERIFIED — see §7.2 |
| Requires a real restore drill with real backup data into an isolated recovery target (synthetic restore is not equivalent; the live `DATA_DIR` must not be the target) | BK-10 | NOT VERIFIED — see §7.3 |
| Evidence to record after each gate | preflight output, disk model/serial, task definition export, log excerpts, `backup:list` output, manifest key **ids** (never keys), command output, spot-check screenshots, escrow location description | fill §7.6 |

A gate is only complete when the row above says so **and** §7.6 holds dated evidence.

### 7.1 BK-08 — separate physical disk

- **Prepare:** a backup destination on a disk that is physically separate from `DATA_DIR`. A second
  partition or a second drive letter on the same disk does not count. The external disk must exist
  and be mounted; if the drive letter is absent, preflight cannot read free space and the disk probe
  returns UNKNOWN.
- **Steps:** with the real paths set, run `npm run backup:preflight`. Confirm the output shows
  `DATA_DIR disk` and `BACKUP_DIR disk` with different `Disk N` values and
  `Disk evidence: DIFFERENT PHYSICAL DISKS`.

**Commands (owner, PowerShell, read-only):**

```powershell
$env:DATA_DIR   = 'C:\PKH-data'
$env:BACKUP_DIR = 'E:\PKH-backups'   # must be the external disk
npm.cmd run backup:preflight
```

Expected: `DATA_DIR disk` and `BACKUP_DIR disk` show different `Disk N` values and
`Disk evidence: DIFFERENT PHYSICAL DISKS`. If the probe returns UNKNOWN, use the read-only fallback:

```powershell
(Get-CimInstance Win32_LogicalDiskToPartition |
  Where-Object { $_.Dependent -match 'DeviceID\s*=\s*"C:"' }).Antecedent.DeviceID
(Get-CimInstance Win32_LogicalDiskToPartition |
  Where-Object { $_.Dependent -match 'DeviceID\s*=\s*"E:"' }).Antecedent.DeviceID
```

Expected: `Disk #0, Partition #...` versus `Disk #1, Partition #...`. A different drive letter alone
is not evidence; confirm the two disk numbers in Disk Management or the device inventory.

The summary line `Physical disk separation:` is always `NOT VERIFIED` by design (the tool cannot
certify physical hardware). Use the `Disk evidence:` line together with the physical inspection.

- **Pass:** different disk numbers, plus a physical inspection (disk model/serial or drive bay) that
  confirms they are separate devices.
- **Evidence:** the preflight output, the disk model/serial from Disk Management or the device
  inventory, and the date.

### 7.2 BK-09 — scheduled backup

- **Prepare:** `scripts\backup-config.cmd` with absolute paths, the encryption key available to the
  task account, and `BACKUP_ENCRYPTION_REQUIRED=true`.
- **Steps:** register the task once with `scripts\register-backup-task.ps1` (this is the owner's
  action), let it run unattended for at least three consecutive days, then check
  `DATA_DIR\logs\backup.log` and Task Scheduler history.

**Commands (owner, PowerShell): run this block in the account that will run the task.**

```powershell
Copy-Item .\scripts\backup-config.example.cmd .\scripts\backup-config.cmd
notepad .\scripts\backup-config.cmd   # set DATA_DIR, BACKUP_DIR, optional BACKUP_KEEP; never the key

# Key for the dedicated task account (owner decision; user scope, not machine scope):
[Environment]::SetEnvironmentVariable('BACKUP_ENCRYPTION_KEY', '<paste key>', 'User')
[Environment]::SetEnvironmentVariable('BACKUP_ENCRYPTION_KEY_ID', '2026-10', 'User')
[Environment]::SetEnvironmentVariable('BACKUP_ENCRYPTION_REQUIRED', 'true', 'User')
# Typing the key here records it in PSReadLine history. Prefer the account's environment-variable
# UI, or clear %APPDATA%\Microsoft\Windows\PSReadLine\ConsoleHost_history.txt afterwards.

# SetEnvironmentVariable writes the registry but does NOT update this process. Mirror the values so
# the registration preflight sees them; the scheduled task reads them fresh when it starts.
$env:BACKUP_ENCRYPTION_KEY = [Environment]::GetEnvironmentVariable('BACKUP_ENCRYPTION_KEY', 'User')
$env:BACKUP_ENCRYPTION_KEY_ID = [Environment]::GetEnvironmentVariable('BACKUP_ENCRYPTION_KEY_ID', 'User')
$env:BACKUP_ENCRYPTION_REQUIRED = [Environment]::GetEnvironmentVariable('BACKUP_ENCRYPTION_REQUIRED', 'User')

.\scripts\register-backup-task.ps1 -DataDir 'C:\PKH-data' -BackupDir 'E:\PKH-backups' -Time '02:00'
Start-ScheduledTask -TaskName 'PKH Backup'
Get-ScheduledTaskInfo -TaskName 'PKH Backup'
Get-Content 'C:\PKH-data\logs\backup.log' -Tail 40

$env:DATA_DIR = 'C:\PKH-data'; $env:BACKUP_DIR = 'E:\PKH-backups'
npm.cmd run backup:list
Export-ScheduledTask -TaskName 'PKH Backup' | Out-File "$env:USERPROFILE\pkh-task-export.xml"
```

Repeat the scheduled check for at least three consecutive days; `LastTaskResult` must be 0 and each
run must add a verified backup. Do not treat one manual run as scheduled execution.

Two operational checks matter here:

- A preflight in your interactive session does not prove the **task account** can see the key. After
  the first task run, confirm the log contains `Encryption: required, key configured` and
  `verified: yes`. If the key is missing, the run exits non-zero (4 or 1). S4U logons may not load
  user-scope variables; if that happens, use the Interactive logon fallback or an approved key
  mechanism for that account.
- `register-backup-task.ps1` writes `backup-config.cmd` as ASCII. Use ASCII paths, or edit the file
  manually after registration if the paths contain non-ASCII characters.

- **Pass:** three consecutive runs with exit code 0, a new verified backup each time, retention
  keeping the configured count, and no secret in the log.
- **Evidence:** task definition export, log excerpts, `backup:list` output, and the verification
  results.

### 7.3 BK-10 — restore drill into an isolated recovery target

**Risk being controlled:** `backup:restore` has no `--target` or `--into` option. It always writes
`<DATA_DIR>/db/knowledge.sqlite3` and `<DATA_DIR>/objects`. If `DATA_DIR` points at the live
directory, the command replaces live data (after taking a safety copy). There is no dry-run, and
`--force` only skips the in-use check — never use it for a drill.

- **Prepare:** a verified backup, free space for a full copy, a spare loopback port, and a recovery
  root outside the live `DATA_DIR` (for example `C:\PKH-recovery-20261020`). The live server may
  keep running; the drill must not write to the live paths.

- **Step 1 — assert absolute paths and a non-live target (read-only):**

```powershell
$liveData  = (Resolve-Path -LiteralPath 'C:\PKH-data').Path.TrimEnd('\')
$backupDir = (Resolve-Path -LiteralPath 'E:\PKH-backups').Path.TrimEnd('\')
$recoveryRoot = 'C:\PKH-recovery-20261020'
New-Item -ItemType Directory -Path $recoveryRoot -Force | Out-Null
$recovery = (Resolve-Path -LiteralPath $recoveryRoot).Path.TrimEnd('\')

if (-not [IO.Path]::IsPathRooted($recovery) -or -not [IO.Path]::IsPathRooted($backupDir)) {
  throw 'DATA_DIR and BACKUP_DIR must be absolute paths'
}
if ($recovery -eq $liveData) { throw 'Refusing: recovery target equals the live DATA_DIR' }
if ($recovery.StartsWith($liveData + '\')) { throw 'Refusing: recovery target is inside the live DATA_DIR' }
Write-Output "live=$liveData"; Write-Output "backup=$backupDir"; Write-Output "recovery=$recovery"
```

- **Step 2 — verify the source backup, then restore into the recovery target (never the live path):**

```powershell
npm.cmd run backup:verify -- "E:\PKH-backups\knowledge-<stamp>-<id>.sqlite3"

$env:DATA_DIR   = $recovery
$env:BACKUP_DIR = $backupDir
$env:BACKUP_ENCRYPTION_KEY = '<key if the backup is encrypted>'
npm.cmd run backup:restore -- "E:\PKH-backups\knowledge-<stamp>-<id>.sqlite3" --yes
```

The output must print the recovery path as `target`. A fresh recovery target prints
`safety copy: none (no previous database existed)`; that is expected.

- **Step 3 — post-restore integrity, schema, relationships and file manifest (DB closed; stop any
  server using the recovery database first):**

```powershell
$env:DATA_DIR = $recovery
npm.cmd run storage:check

$env:BACKUP_DIR = 'C:\PKH-recovery-verify'
npm.cmd run backup:create -- --verify
```

`storage:check` recomputes file sizes and SHA-256 against metadata and reports missing, orphan or
unexpected objects. `backup:create --verify` re-runs SQLite `integrity_check`, `foreign_key_check`,
schema checks and the object inventory against the restored copy. Both must exit 0.

If the source backup's `verify` reported orphan-object warnings, the restored copy will contain the
same orphans and `storage:check` will report them. Compare the count with the source warning and
record it; do not treat a matching orphan as new corruption. Any other mismatch is a failure.

- **Step 4 — run the restored copy as a separate instance and check relationships.** If
  `apps/web/dist` is missing, run `npm.cmd run build:web` first.

```powershell
$env:DATA_DIR = $recovery
$env:PORT = '3460'
$env:EXPECTED_ORIGIN = 'http://127.0.0.1:3460'
npm.cmd run dev:server
```

Open `http://127.0.0.1:3460/`, log in with the real account (never record the password), and check a
note with its category/tag, a bookmark, a favorite, and a file download. Compare the downloaded
SHA-256 with the value shown in the file view. If the snapshot predates the current password, the
password from that point in time applies. Stop this server afterwards.

- **Step 5 — safety copy and evidence:**
  - If Step 2 printed a safety-copy path (reused recovery target), run
    `npm.cmd run backup:verify -- "<safety copy path>"` and record the result.
  - If it printed none, record `none (fresh recovery target)` and confirm the source backup was
    verified before the drill.
- **Pass:** the assertions printed a recovery path different from the live path; restore exited 0;
  `storage:check` and `backup:create --verify` exited 0; the restored copy served a login and the
  checked relationships/files matched; the safety copy (if any) verified.
- **Evidence:** assertion output, restore output, both verification outputs, screenshots, the
  downloaded file hash, and the safety-copy path/result. Never record passwords or keys.
- **If no isolated recovery space or spare port exists:** leave BK-10 **NOT VERIFIED**. Do not
  restore over the live system to finish the gate.

### 7.4 BK-11b — encryption operations

- **Prepare:** the key stored outside `BACKUP_DIR`, an offline escrow copy, and a disposable copy of
  `DATA_DIR` for rotation testing.
- **Steps:** confirm `backup:preflight` reports `key configured`; rotate the key using §16.5 of
  `BACKUP.md`; verify an old backup through the ring; remove the old key only after the test.

**Commands (owner, PowerShell; run in the account that runs the backup task; never paste a key
into chat or a tracked file):**

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Run this in a private terminal; store the value immediately in the offline secret store / escrow
# copy and clear the terminal history if that matters to you.

$env:DATA_DIR   = 'C:\PKH-data'
$env:BACKUP_DIR = 'E:\PKH-backups'
$env:BACKUP_ENCRYPTION_KEY = '<new key>'
$env:BACKUP_ENCRYPTION_KEY_ID = '2026-11'
$env:BACKUP_ENCRYPTION_REQUIRED = 'true'
npm.cmd run backup:preflight        # presence check only: reports "key configured"
npm.cmd run backup:create -- --verify   # proves the key is valid and the backup verifies

# Rotation: keep the old key only for decrypting older backups.
# This assignment also lands in PSReadLine history; clear it after the verification.
$env:BACKUP_ENCRYPTION_KEY_RING = '{"2026-10":"<old key>"}'
npm.cmd run backup:verify -- "E:\PKH-backups\knowledge-<old stamp>-<id>.sqlite3"
```

Keep the old key in the ring until every backup and safety copy that uses it has expired. Remove the
ring entry afterwards and re-run verification on the remaining backups. Clear the ring and active
key from the session when the check is done (`Remove-Item Env:BACKUP_ENCRYPTION_KEY_RING` and the
same for the key). Losing a key with no escrow copy makes those backups unrecoverable; there is no
recovery mechanism in the code.

- **Pass:** new backups carry the new key id, old backups still verify, and the key never appears in
  logs, scripts, or manifests.
- **Evidence:** preflight output, manifest key ids (not keys), verification results, and the escrow
  location description.

### 7.5 Browser UI

- **Automated in the workspace (done 2026-10-20):** the installed Chrome is driven over the DevTools
  Protocol from a temporary harness; CH-01..CH-20 PASS at 1366×768 and 390×844 with a clean
  console/CSP record. Reproduce with the same harness pattern and a temporary `DATA_DIR`; do not
  point it at real data.
- **Owner-only, real machine:** re-run the same checklist in Brave, do the walkthrough with a human
  hand at both viewports, and play/seek a real video to confirm Range playback in the player (the
  HTTP 206/416 contract is already verified).
- **Prepare:** the production web build served by the local server and a synthetic test account.
- **Steps:** run CH-01..CH-20 in `MANUAL_UI_CHECKLIST.md` in Chrome and Brave, at a desktop
  viewport and a 390×844 mobile viewport.
- **Pass:** every item marked PASS in **both** browsers, including CSP compatibility (no console
  errors from blocked resources), refresh persistence, upload/download, and Range playback.
- **Evidence:** the completed checklist with PASS/FAIL/BLOCKED per item and screenshots for any
  failure.

### 7.6 Recording

| Gate | Date | Result | Evidence location |
| --- | --- | --- | --- |
| BK-08 | | | |
| BK-09 | | | |
| BK-10 | | | |
| BK-11b | | | |
| Browser UI — Chrome | 2026-10-20 | PARTIAL — CH-01..CH-20 PASS in installed Chrome `155.0.8059.85` at 1366×768 and 390×844; console/CSP clean. Brave not executed, so the two-browser gate is still open | `docs/MANUAL_UI_CHECKLIST.md` §3 and §8; raw results and screenshots in `.tmp-acceptance-20261020/evidence` (15 files, tree SHA-256 `b75471b56c1a4ede6e3adc5df2733bea912e7c6187dd7c146f84c50c4397977d`). The harness was removed; the Chrome profile is not evidence and is retained only because cleanup under the workspace is prohibited |
| Browser UI — Brave | | | |

A verbal confirmation does not change a gate. Update §3 and §8 only with dated evidence.

---

## 8. Sign-off

| Gate | Owner | Date | Result |
| --- | --- | --- | --- |
| Phase 2 security core | — | — | PARTIAL — core auth done, throttling persistence open |
| Backup/restore | — | — | FAIL — BK-08..11 open |
| Remote access | — | — | BLOCKED |
| Browser UI | — | 2026-10-20 | PARTIAL — CH-01..CH-20 PASS in installed Chrome (`MANUAL_UI_CHECKLIST.md` §3, §8); Brave not executed and no human walkthrough, so not a PASS |
| Production use with real data | — | — | **BLOCKED** |

Changing the verdict requires updating this table with a date and re-runnable evidence. A verbal
"it's fine" does not move a gate.
