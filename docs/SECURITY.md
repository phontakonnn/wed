# SECURITY — SLICE 5

Scope: the Firebase-first PWA (`apps/web`). `apps/server` is out of scope because
it is not deployed (see `DECISIONS.md`).

Gate for everything below:

```powershell
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run test
npm.cmd --prefix apps/web run build
npm.cmd run test:rules      # needs Java 11+ and the Firebase CLI, see §6
```

---

## 1. Critical: authentication bypass in the login path (fixed)

`apps/web/src/lib/firebaseEngine.ts` handled `/api/auth/login` with three
separate holes that chained into "anyone can be admin":

| # | What the code did | Impact |
|---|---|---|
| 1 | Compared the typed password against a **hardcoded master password** for a known username | Anyone reading the bundle had working admin credentials |
| 2 | On a failed sign-in, **created the account automatically** (`auth/user-not-found` → `register`) | A typo, or a deliberately new username, silently created an account |
| 3 | On a failed admin sign-in, **fabricated a session** with a hardcoded uid and `role: 'admin'` | Admin UI access with no Firebase session at all |
| 4 | `register` granted `role: 'admin'` to any account whose username was `admin` | Trivial privilege escalation |
| 5 | `register` defaulted the password to a constant when the field was empty | Accounts created with a known password |

**Fixed.** The login branch is now: username → email alias (one entry, no
password) → `signInWithEmailAndPassword` → on failure a single 401 with a
generic message. No credential, no auto-creation, no synthetic session, no
username-based role. `register` requires a non-empty password and only grants
`admin` to the owner address or the very first account.

> The real values are deliberately not reproduced here. See §2 for rotation.

**Behaviour you will notice:** logging in with the old master username still
works, because the alias maps it to the owner email and Firebase still verifies
the password you type. What no longer works is a wrong password (previously it
created an account) and any username that does not exist.

## 2. Secrets scan — action required

Scan run over tracked files and history (`git grep` for `AIza…`, PEM blocks,
`sk-…`, `ghp_…`, `xox[baprs]-`, `.env` files). `gitleaks` is not installed on
this machine, so the scan was done with an equivalent regex sweep.

| Finding | Where | Severity | Status |
|---|---|---|---|
| Hardcoded admin username + password pair | `apps/web/src/lib/firebaseEngine.ts` | **Critical** | **Removed** — but still present in git history |
| Firebase web config (apiKey / projectId / appId / measurementId) | `apps/web/src/lib/firebaseConfig.ts` (fallback literals), `apps/web/public/firebase-messaging-sw.js` (removed) | Low | SW deleted; fallback kept, see below |
| `.env` files committed | none | — | clean |
| Private keys / service accounts | none | — | clean |

**Why the Firebase web key is Low, not Critical:** `apiKey` for the Web SDK is a
public project identifier, not a credential. It is shipped in the JS bundle by
design; Firestore/Storage access is controlled by the rules, not by this key.
It must still not be *the only* thing standing between an attacker and a
project with permissive rules — which is why §5 matters.

**You must do this:**

1. Rotate the master password in Firebase Console → Authentication → the owner
   account. Assume the old password is public: it is in git history.
2. Treat the old master password as compromised everywhere it was reused.
3. If you want the literal gone from the repo as well, rewriting history
   (`git filter-repo`) is the only way; the code no longer reads it, so the
   practical risk is the password itself, not the string.
4. Finish moving the config to env vars (next item).

**Open: `firebaseConfig.ts` still has literal fallbacks.** There is no
`.env.local` in this checkout and no CI env yet, so removing them would brick
the current deployment. To finish:

```powershell
# 1. create .env.local from .env.example and fill VITE_FIREBASE_*
# 2. verify: npm.cmd --prefix apps/web run build && npm.cmd --prefix apps/web run preview
# 3. then delete the `|| '…'` fallbacks in src/lib/firebaseConfig.ts
```

## 3. XSS and link injection

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML` | **0 occurrences** |
| `innerHTML` / `outerHTML` / `document.write` | **0** |
| `eval` / `new Function` | **0** (the Firebase setup modal's `Function()` fallback was removed in SLICE 3) |
| Markdown renderer | Builds React elements, never HTML. Links go through a sanitizer. |
| `target="_blank"` | 10 occurrences, all with `rel="noopener noreferrer"` |

**Added `src/lib/safeUrl.ts`** (with tests) and applied it to every `href` that
carries user data: bookmarks (`BookmarksView`, `CustomCategoryView`), custom
record URL fields (`CustomRecordsView`, 2 sites), file download links
(`MediaLightbox`), and markdown links. Allowed: `http:`, `https:`, `mailto:`,
`tel:`, `#anchor`, and `/app-path`. Everything else (including `javascript:`,
`data:`, `vbscript:`, `file:`, `//host`) renders as `#unsafe-link`.

## 4. Input validation at the boundary

`zod` is now used where untyped data enters the app (and is code-split into
`validation-vendor`, so it never reaches the first load):

| Boundary | Schema | Rules |
|---|---|---|
| Import a profile backup (`ProfileModal`) | `importPayloadSchema` | ≤ 5 MB, plain object, ≤ 200 top-level keys, each known collection ≤ 20 000 rows |
| Apply a saved filter (`CommandSearchModal`) | `savedFilterCriteriaSchema` | `query` ≤ 500, dates ≤ 32, `sortOrder` ∈ enum, ≤ 20 types |

Client-side limits are a UX guard, not the security boundary — the rules are.

## 5. Firestore / Storage rules

`firestore.rules` (deny by default, owner-only, field type + length caps,
document-id length cap, `keys().size()` cap) and `storage.rules` (owner-only,
≤ 10 MiB, content-type allow-list) are unchanged in shape, plus:

- `documentId.size() <= 200` on create/update/delete
- profile document can never be deleted

**Deliberately not added: `keys().hasOnly([...])` and `createdAt` immutability.**
Both would break real writes and could not be verified against the emulator
here: the engine writes ~40 different document shapes through one generic path,
and it rewrites `createdAt` on the profile document on every sign-in
(`firebaseEngine.ts`, the `/api/auth/me` branch). Adding either without a green
rules suite is a data-loss risk, so they are the first follow-up once §6 runs.

### Rules tests (written, **not yet executed**)

`apps/web/tests/rules/firestore.rules.test.ts` and `storage.rules.test.ts` cover:
signed-out access, cross-uid access, owner CRUD, profile delete, title length
300/301 boundary, wrong field types, content > 500 000 chars, taxonomy arrays
> 50, > 60 fields, name > 120, storage > 10 MiB, disallowed content type, and
cross-uid uploads.

They run under `firebase emulators:exec`, never against a project:

```powershell
npm.cmd run test:rules
```

**Status: not run here.** This machine has no `java` on PATH (the Firestore and
Storage emulators are JVM processes) and no Firebase CLI installed, so the suite
could not be executed. It type-checks cleanly and the scripts are complete.

To run it:

```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK   # or any JDK 11+
npm.cmd install --save-dev firebase-tools            # or: npx firebase-tools
npm.cmd run test:rules
```

Until it is green, treat the rules as "reviewed, unverified".

## 6. Transport and headers (`firebase.json`)

Added to the global `**` header block:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-DNS-Prefetch-Control` | `off` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb, magnetometer, gyroscope, accelerometer all `()` |

CSP rewritten (no `unsafe-eval`, no wildcard script source):

```
default-src 'self';
script-src 'self' https://apis.google.com https://www.gstatic.com
           https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob: https:;
connect-src 'self' https://*.googleapis.com https://content-firebaseappcheck.googleapis.com
           https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net
           https://securetoken.googleapis.com https://identitytoolkit.googleapis.com
           https://firestore.googleapis.com https://fcmregistrations.googleapis.com
           https://*.firebaseapp.com https://*.firebasestorage.app https://storage.googleapis.com;
frame-src 'self' https://*.firebaseapp.com https://www.google.com/recaptcha/ https://recaptcha.google.com;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests
```

`style-src` still needs `'unsafe-inline'` because the app ships ~1.4 k inline
styles; SLICE 7 removes most of them, after which this can be dropped.
Google Fonts were removed from `style-src`/`font-src` because the app self-hosts
Anuphan as WOFF2.

**Not verified in a browser.** CSP is only served by Firebase Hosting, and
deploying is out of scope for this round. Verify after the next deploy: DevTools
→ Console must show zero `Content Security Policy` violations, and the reCAPTCHA
badge must still render on the login screen.

## 7. Auth guard

- `getCurrentUid()` throws `ApiError(401, code: 'unauthenticated')` when there is
  no Firebase user; every collection/document helper goes through it
  (`userCol` / `userDoc`), so no repository can read another user's path.
- The hardcoded `uid_phontakon_master` fallback is gone.
- UI: `authState !== 'signed-in'` renders the login screen; admin views also
  check `isUnlocked`.

## 8. App Check — ready to enforce, not enforced

The client already initialises App Check with a reCAPTCHA Enterprise provider
when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is set (`src/lib/firebaseDb.ts`).
Nothing is enforced server-side from this repository, by design.

Steps (also in `docs/RUNBOOK.md`):

1. Firebase Console → App Check → register the web app with reCAPTCHA Enterprise.
2. Put the site key in `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
3. Local dev only: register a debug token and set
   `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN`.
4. Watch App Check → Metrics for a week with enforcement **off**.
5. Only then enable enforcement for Firestore and Storage.
6. Rollback if needed: turn enforcement off in the console; no client change.

## 9. Dependencies (`npm audit`)

```
4 high severity vulnerabilities
  @grpc/grpc-js < 1.13.6  (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4)
  └─ @firebase/firestore 4.19.0  →  firebase 13.1.0
```

**Not fixed, deliberately.** The only "fix" npm offers is `firebase@9.14.0`,
i.e. a major downgrade that would break the modular imports and the entire
SLICE 2 bundle work. An `overrides: { "@grpc/grpc-js": "^1.13.6" }` was tried:
npm kept resolving 1.9.16 from the lock (`@firebase/firestore` pins it) and the
tree reported `invalid`, so the override was reverted rather than shipped in a
broken state.

Exposure: both advisories are in gRPC **server/transport** code paths
(`getAuthContext` certificate handling and server→client error propagation).
The browser build uses the WebChannel transport, and `@grpc/grpc-js` is not
reachable from the app's runtime graph — it is present because Firestore's
Node entry points share the same package.

**Follow-up:** bump `firebase` when a release moves to `@grpc/grpc-js >= 1.13.6`,
then re-run `npm audit --omit=dev`. Re-check after every dependency update.

## 10. What is still open

| Item | Risk | Owner |
|---|---|---|
| Master password still valid and public in git history | **High** | You — rotate in Firebase Console |
| Rules suite never executed | High | You — install JDK + CLI, run `npm.cmd run test:rules` |
| CSP not verified in a deployed browser | Medium | You — check console after next deploy |
| `firebaseConfig.ts` literal fallbacks | Low | You — add `.env.local`, then delete |
| Admin is decided by an email constant in the client | Medium | Next round — move to a Custom Claim + rules check |
| `style-src 'unsafe-inline'` | Low | SLICE 7 / next round |
| `@grpc/grpc-js` advisories | Low (not on the browser path) | Next round, with a firebase bump |
