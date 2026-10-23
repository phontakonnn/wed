# SIZE LOG — before/after per slice

All numbers are measured, never estimated. Gate command for every row:

```powershell
npm.cmd --prefix apps/web run build
node scripts/check-bundle-budget.mjs   # gzip level 9 of the entry chunks
node scripts/analyze-stats.mjs apps/web/dist/stats.json
```

`check-bundle-budget.mjs` sums the four entry chunks (`index-`, `react-vendor-`,
`firebase-vendor-`, `vendor-`) with `zlib.gzipSync(level: 9)`. From SLICE 2 on
it reads the actual entry graph from `dist/index.html`, which is stricter (it
also catches a new entry chunk).

Precache size is printed by `vite-plugin-pwa` during the build
(`precache N entries (M KiB)`).

## Summary

| Slice | First-load JS (gzip) | Precache | CSS raw | Entry JS raw | Notes |
|---|---:|---:|---:|---:|---|
| Baseline (`1110c69`) | **327.9 KB** | 64 entries / 1890.42 KiB | 163.4 KB | 200.95 KB | budget 330 KB, target 150 KB |
| 1 — analysis | 327.9 KB | 64 / 1890.42 KiB | 163.4 KB | 200.95 KB | measurement only, no code change |
| 2 — bundle | 123.7 KB | 12 / 652.47 KiB | 141.49 KB | 168.9 KB | Firebase left the entry graph |
| 3 — cleanup | 123.7 KB | 12 / 652.50 KiB | 141.49 KB | 172.99 KB | dead code + assets removed, lint 41→0; first-load unchanged |
| 4 — refreshKey/App split | — | — | — | — | pending |
| 5 — security | — | — | — | — | pending |
| 6 — updates | — | — | — | — | pending |
| 7 — UX/perf | — | — | — | — | pending |
| 8 — final | — | — | — | — | pending |

## Baseline (`1110c69`) — detail

| Chunk | Gzip | Raw |
|---|---:|---:|
| `firebase-vendor` | 198.0 KB | 1077.0 KB (visualizer) |
| `react-vendor` | 73.0 KB | 596.3 KB (visualizer) |
| `index` | 46.8 KB | 339.0 KB (visualizer) |
| `vendor` | 10.2 KB | 58.3 KB (visualizer) |
| **Total** | **327.9 KB** | — |

Visualizer per-module gzip (different gzip pass, same graph): 254.9 / 121.1 /
67.9 / 15.2 KB. See `docs/SIZE_ANALYSIS.md`.

## SLICE 2 — Firebase off the critical path

| Chunk | Baseline gzip | After gzip | Diff |
|---|---:|---:|---:|
| `index` (entry) | 46.8 | 40.1 | −6.7 |
| `react-vendor` | 73.0 | 73.0 | 0 |
| `vendor` | 10.2 | 10.2 | 0 |
| `rolldown-runtime` | (counted in index) | 0.4 | +0.4 |
| `firebase-vendor` (now lazy) | 198.0 | 207.3, not preloaded | −198.0 from first load |
| **First-load** | **327.9** | **123.7** | **−204.2 (−62%)** |

`firebase-vendor` grew from 198.0 to 207.3 KB gzip because the in-browser API
engine and the auth/db entry modules now live in the SDK chunk instead of the
entry chunk. It is downloaded on the first sign-in/data request, never to paint
the shell.

### What changed

| Change | Effect |
|---|---|
| `api.ts` imports `handleFirebaseRequest` with `await import()` | the 26.6 KB engine + Firebase SDK are a lazy chunk |
| `lib/firebase.ts` split into `firebaseConfig` / `firebaseAuth` / `firebaseDb` / `firebaseTelemetry` (+ `firebaseApp`) | auth can load without Firestore |
| `App.tsx` auth listener, Firestore subscriptions and theme sync use dynamic `import()` | no SDK in the entry |
| `theme.ts` no longer imports Firestore at module scope | `main.tsx` can apply the theme before first paint |
| `main.tsx` loads analytics on idle via `firebaseTelemetry` | analytics/installations off the boot path |
| `build.target: 'es2022'` | drops the `@oxc-project` class-field helpers that otherwise bridged the entry into the SDK chunk |
| `manualChunks` keeps `firebase-vendor`/`react-vendor` separate | long-term caching, and lazy chunks stay lazy |
| `esbuild.drop: ['console', 'debugger']` | no debug output in production |
| Workbox `globPatterns` = app shell only, lazy chunks via `StaleWhileRevalidate` | precache 64 → 12 entries |

### Deferred chunks (not first-load)

| Chunk | Gzip | Loaded when |
|---|---:|---|
| `firebase-vendor` | 207.3 KB | first sign-in/session check or first data call |
| `firebaseEngine` | 7.4 KB | first `/api/*` request |
| feature views | 0.5–14.7 KB each | navigating to that view |

### Precache: 652.47 KiB, not < 400 KiB — measured and explained

The app shell is now the only precached set (12 entries): `index.html`, the
entry JS (`index`, `react-vendor`, `vendor`, `rolldown-runtime`), the entry CSS,
two WOFF2 fonts, the manifest and the two icons. That is 652.47 KiB **raw**
(~124 KiB over the wire with gzip). The 400 KiB target cannot be met while
keeping the SPA offline-capable: `react-dom` alone is 235.8 KiB raw and the
entry chunk is 168.9 KiB raw, and both must be in the precache or an offline
reload serves a blank page. Dropping them to runtime caching would break
offline-first, which the brief forbids. The previous 1890 KiB / 64 entries
included every lazy view and is gone; lazy chunks now fill the
`lazy-chunks` runtime cache on use.
