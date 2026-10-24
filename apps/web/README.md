# PKH web client

React 19 + TypeScript + Vite 8 PWA. The client is self-contained: `src/api.ts` exposes a typed
function per operation, and every call is served by the in-browser Firebase engine
(`src/lib/firebaseEngine.ts`) against Firestore/Storage. There is no HTTP backend and no dev proxy.

Offline-first comes from `persistentLocalCache` in `src/lib/firebaseDb.ts`, so reads keep working
without a network and writes are queued until the connection returns.

## Commands

Run from the repository root (or prefix with `npm --prefix apps/web`):

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Vite dev server on `http://127.0.0.1:5173` |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm run typecheck` | Types only, no emit |
| `npm run lint` | ESLint flat config |
| `npm test` | Vitest unit tests |
| `npm run test:rules` | Firestore/Storage rules tests via the Firebase Emulator |
| `npm run audit:mobile` | Playwright mobile layout audit |

## Configuration

Firebase web config is read from Vite env vars (`VITE_FIREBASE_*`); see `.env.example` at the
repository root. The values baked into `src/lib/firebaseConfig.ts` are public client identifiers,
not secrets — security comes from `firestore.rules` and `storage.rules`.

## Bundle budget

`bundle-budget.json` caps the first-load JS graph. `npm run check:budget` fails the build when the
entry graph grows past the cap, and CI runs it on every push.
