# SIZE ANALYSIS — where the bytes actually come from

Measured on branch `refactor/firebase-pwa-second-brain` after commit `1110c69`
(Calm-UI baseline). Nothing here is estimated: every number below is produced by
`apps/web` build output or `rollup-plugin-visualizer`.

Reproduce:

```powershell
npm.cmd --prefix apps/web run build:analyze
node scripts/analyze-stats.mjs apps/web/dist/stats.json firebase-vendor
node scripts/check-bundle-budget.mjs
```

`build:analyze` = `tsc -b && vite build --mode analyze`; the analyze mode adds
`rollup-plugin-visualizer` with `template: 'raw-data'` and writes
`apps/web/dist/stats.json` (not shipped, not precached).

## 1. Entry graph (what a first visit downloads)

`apps/web/dist/index.html` references one entry script (`index-*.js`) plus
`react-vendor`/`firebase-vendor`/`vendor` through static imports.

| Chunk | gzip | raw | Content |
|---|---:|---:|---|
| `firebase-vendor` | 254.9 KB | 1077.0 KB | the whole Firebase SDK (`app`, `auth`, `firestore`, `app-check`, `analytics`, `installations`, `webchannel-wrapper`, `re2js`, `idb`) |
| `react-vendor` | 121.1 KB | 596.3 KB | `react-dom` 99.1, `@tanstack/query-core` 12.2, `react` 4.9 |
| `index` | 67.9 KB | 339.0 KB | `App.tsx` + `api.ts` + shell components (`app-src` 65.4) |
| `vendor` | 15.2 KB | 58.3 KB | remaining node_modules reachable from the entry |
| **First-load total** | **459.1 KB** | — | as measured by the visualizer graph |

The CI budget script reports **327.9 KB gzip** because it only sums the four
entry chunks and uses a different gzip pass (`level: 9` on the emitted asset)
than the visualizer's per-module `gzipLength`. Both numbers describe the same
graph; the budget gate is the authoritative one and the target for SLICE 2 is
expressed against it.

Static JS in `dist` is 47 files / 1673.9 KB raw, CSS 9 files / 163.4 KB raw.

## 2. What inside `firebase-vendor` is on the boot path

Everything. `apps/web/src/lib/firebase.ts` is imported by `App.tsx`, and it
eagerly initialises App, Auth, Firestore, App Check, and re-exports
`getFirebaseMessaging`/`getFirebaseAnalytics`. Because `api.ts` →
`firebaseEngine.ts` → `firebase/firestore` is also a static import chain from
`App.tsx`, Rollup cannot defer any of it.

| Package | gzip | Why it is there |
|---|---:|---|
| `@firebase/firestore` | 116.9 KB | `initializeFirestore` + `persistentLocalCache` + query/subscription helpers imported at module scope |
| `re2js` | 52.9 KB | pulled in by `@firebase/firestore` (regex evaluation in rules/token parsing); only removable by keeping Firestore out of the entry graph |
| `@firebase/auth` | 34.2 KB | email/password, email-link, phone (`RecaptchaVerifier`) all imported eagerly |
| `@firebase/webchannel-wrapper` | 20.6 KB | Firestore WebChannel transport |
| `@firebase/app-check` | 6.7 KB | `initializeAppCheck` runs at module scope |
| `@firebase/util` | 5.4 KB | shared |
| `@firebase/analytics` | 5.1 KB | dynamic `import()` exists, but `getFirebaseAnalytics` is re-exported from the same eager module |
| `@firebase/app` | 4.1 KB | `initializeApp` |
| `@firebase/installations` | 3.9 KB | forced by analytics/app-check |
| `idb` | 2.0 KB | persistence layer for `persistentLocalCache` |

No compat build (`firebase/compat/*`) is in the graph, so the SDK is already
modular. The problem is *when* it loads, not *which* API style is used.

## 3. Route/feature code splitting — already mostly correct

30 views/modals are already `React.lazy` + `Suspense`, so only shell components
are static: `Topbar`, `Sidebar`, `MobileBottomNav`, `ToastStack`, `Skeleton`,
`ErrorBoundary`, `lib/theme`, `lib/firebase`, `lib/firestore-db`, `api.ts`.

Largest lazy chunks (gzip): `AdminView` 19.1, `ProfileModal` 16.4,
`NotesView` 14.6, `HabitsView` 11.5, `PeopleView` 6.4, `FavoritesView` 6.0.
Nothing lazy is loaded before the user opens it — verified by the entry graph:
none of these appear in `index.html`'s module graph.

Conclusion: route splitting is **not** the lever. Firebase is.

## 4. Dependency audit

`knip` (compact reporter) and `depcheck apps/web` agree on the following.

### Unused runtime dependencies (`apps/web`)

| Package | Evidence | Action |
|---|---|---|
| `@tanstack/react-virtual` | no import anywhere in `apps/web/src` | keep for SLICE 4 virtualization, or remove if unused at the end |
| `zod` | no import anywhere in `apps/web/src` | keep for SLICE 5 boundary validation |

The two are currently unused but are required by later slices in this same
prompt, so they stay until SLICE 8 decides.

### Unused devDependencies (`apps/web`)

| Package | Evidence | Action |
|---|---|---|
| `@testing-library/react` | tests use `vitest` + `jsdom` + `@testing-library/jest-dom` only | remove in SLICE 3 |
| `@firebase/rules-unit-testing` | no test imports it yet | **keep** — SLICE 5 adds `test:rules` |

### Unused files (knip)

| File | Evidence | Action |
|---|---|---|
| `apps/web/src/features/files/FilesView.tsx` | never imported (no lazy entry, no route) | delete in SLICE 3 |
| `apps/web/src/features/support/HelpSupportView.tsx` | never imported | delete in SLICE 3 |
| `apps/web/public/firebase-messaging-sw.js` | not referenced by `index.html` or the SW; Phase D not started | keep until Phase D, document |
| `ecosystem.config.js`, `tests/thai-search-evaluation.mjs`, `scripts/analyze-stats.mjs` | tooling, not app code | keep (analysis script is the SLICE 1 deliverable) |

### Duplicate/overlapping packages

- `apps/server` has two SQLite drivers (`better-sqlite3` **and** `sqlite3`) and
  unused `@fastify/cors`, `pino`, `pino-pretty`; the server is not on the
  Firebase Hosting path (Firebase publishes `apps/web/dist` only). See SLICE 3.
- No duplicated `react`/`firebase` copies: `npm ls` shows a single resolved
  version of each. No `moment`, no full `lodash`, no chart/editor library.

### Unused exports inside `apps/web` (knip, 20 + 19 types)

Most are shim leftovers from the removed REST server (`sendMagicLink`,
`completeMagicLinkSignIn`, `sendSmsOtp`, `registerWithInvite`,
`verify2FALogin`, `restoreNote`, `uploadFileWithProgress`, …) and unused
re-exports in `lib/firebase.ts` (`app`, `appCheck`, `createUserWithEmailAndPassword`,
`signInWithEmailAndPassword`, `sendPasswordResetEmail`, …). Those disappear with
the SLICE 3 cleanup; they are not size drivers because Rollup already
tree-shakes unused exports.

## 5. Service worker precache

Current `vite-plugin-pwa` output: **64 entries / 1890.42 KiB**, i.e. every
emitted JS chunk (including 30 lazy-fallback default `*.js`), every CSS file,
both WOFF2 fonts, icons, and `manifest.webmanifest`. Budget is `< 400 KiB` for
the app shell, so the precache must become: entry HTML + entry JS + `index`/
`vendor`/`react-vendor` CSS + icons + manifest, with everything else moved to
runtime caching.

## 6. Suspects, ranked by expected gain

| # | Suspect | Current cost | Fix | Expected saving |
|---|---|---|---|---|
| 1 | Firebase on the boot path | 254.9 KB gz + `re2js` | dynamic `import()` of `firebase` modules; boot Auth only after a session hint, Firestore after first data call; App Check/analytics/installations off the critical path | **~200 KB gz** |
| 2 | `App.tsx` + `api.ts` in the entry | 67.9 KB gz (65.4 app-src) | SLICE 4 split → shell becomes small; `firebaseEngine` becomes a lazy chunk | ~35–45 KB gz |
| 3 | `react-vendor` | 121.1 KB gz | cannot remove React; keep `manualChunks` so it stays cacheable. `react-dom` production build already in use | 0 (floor) |
| 4 | Precache 1890 KiB | 64 entries | app-shell-only `globPatterns` + runtime caching for lazy chunks/assets | ~1500 KiB less install traffic |
| 5 | CSS 163.4 KB raw | 9 files | SLICE 7 token/shadow/inline-style cleanup; CSS is already split per route | ~20–30 KB raw |
| 6 | Unused deps/files | small | SLICE 3 | ~0 KB runtime, less install time |

### Realistic floor

React + shell + API client cannot go below roughly 90–110 KB gzip. Reaching
`< 150 KB` first-load therefore requires Firebase to leave the entry graph
entirely (it can load on demand after the login screen or on first data access).
If that cannot be done without breaking offline-first (`persistentLocalCache`
must stay), the measured value will be reported as-is with the reason, per the
brief.
