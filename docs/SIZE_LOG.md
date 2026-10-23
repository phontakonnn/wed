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
| 2 — bundle | — | — | — | — | pending |
| 3 — cleanup | — | — | — | — | pending |
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
| `index` (entry) | 46.8 | TBD | |
| `react-vendor` | 73.0 | TBD | |
| `vendor` | 10.2 | TBD | |
| `firebase-vendor` (now lazy) | 198.0 | 198.0 (not first-load) | −198.0 |
| **First-load** | **327.9** | TBD | |

_(filled in after the slice lands)_
