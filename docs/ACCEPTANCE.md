# Acceptance Criteria

**Verdict as of 2026-10-19: NOT ACCEPTABLE FOR REAL DATA / NOT PRODUCTION-READY.**
Phase 2 is partially complete. The authentication slice is implemented and tested; the product
surface (notes, bookmarks, files, search) does not exist, and the backup gate is open.

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
| P1-08 | Master prompt / requirements source in repo | FAIL | `MASTER_PROMPT.md` absent from the workspace |

---

## 2. Phase 2 — security core

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| P2-01 | SQLite with foreign keys, WAL, busy timeout | PASS | `database.ts`; DB-01..03 |
| P2-02 | Versioned, transactional migrations | PASS | `001_initial.sql`; `schema_migrations` row written in the same transaction |
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
| P2-15 | Automated test suite green | PASS | 4 files / 21 tests (see §6) |

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
| BK-08 | Backup directory on a **separate physical disk** | FAIL | No second disk identified; BitLocker and volume layout unverified |
| BK-09 | Scheduled daily backup running unattended | FAIL | Scheduler task not created |
| BK-10 | Restore drill on the real `DATA_DIR` | FAIL | Not performed; no real `DATA_DIR` exists |
| BK-11 | Backup encryption at rest | FAIL | Not implemented; relies on NTFS ACLs |

**The gate is closed.** BK-08 through BK-10 are mandatory before any real user data is stored.

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

## 5. Product scope (Phase 2+ — not started)

| ID | Criterion | Status |
| --- | --- | --- |
| PR-01 | Notes CRUD | FAIL |
| PR-02 | Bookmarks CRUD | FAIL |
| PR-03 | Categories, tags, favorites | FAIL |
| PR-04 | Trash with restore | FAIL |
| PR-05 | File upload, preview, download | FAIL |
| PR-06 | Thai-aware search (FTS5 evaluation) | FAIL |
| PR-07 | Frontend wired to the API | FAIL — Vite template only |
| PR-08 | Orphan object detection and cleanup policy | FAIL |

The current UI is the unmodified Vite starter; it does not call the API.

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

Expected: 4 test files, 21 tests, 0 failures; all builds exit 0; no database or secret tracked.

---

## 7. Sign-off

| Gate | Owner | Date | Result |
| --- | --- | --- | --- |
| Phase 2 security core | — | — | PARTIAL — core auth done, throttling persistence open |
| Backup/restore | — | — | FAIL — BK-08..11 open |
| Remote access | — | — | BLOCKED |
| Production use with real data | — | — | **BLOCKED** |

Changing the verdict requires updating this table with a date and re-runnable evidence. A verbal
"it's fine" does not move a gate.
