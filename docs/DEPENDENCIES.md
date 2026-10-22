# Dependencies and approval status

## Runtime state observed 2026-10-19
- Node.js v24.22.0; npm 11.19.1, verified by `node -v` and `npm -v`.
- Git repository root was verified as `C:\Users\_phontakonnn\Documents\Wed_Phontakon` on
  2026-10-19 using `git rev-parse --show-toplevel`. Earlier wording that the workspace had no
  `.git` directory was stale and is corrected here.
- Tailscale is not installed according to the earlier Phase 0 command output. No Tailscale configuration was changed.
- No package was installed or upgraded during the current implementation task.

## SQLite driver packages already present

### better-sqlite3 13.0.3
- Decision: used by `apps/server/src/database.ts`.
- License: MIT, from installed package metadata.
- Reason: synchronous SQLite API supports explicit transactions and FTS5; its installed native binding loaded successfully on Windows x64 with Node v24.22.0.
- Native/prebuilt: native addon; current installed module loaded and an in-memory FTS5 create/insert/query smoke test returned one match.
- Engine declaration: Node `>=22`, satisfied by the observed Node v24.22.0.
- Type declarations: not bundled in the installed package; a narrow local `.d.ts` declaration was added. No `@types` package was added.
- Status: selected for current implementation; exact upstream maintenance/release-source review is not documented here.

### sqlite3 6.0.1
- Decision: present in the existing `apps/server/package.json`, but not used by implementation.
- License: BSD-3-Clause, from installed package metadata (within the project's allowed BSD category).
- Native/prebuilt: native addon with an install script; module loaded on this environment and passed the same in-memory FTS5 smoke test.
- Engine declaration: Node `>=20.17.0`.
- Status: existing duplicate driver; no removal or package-lock change was made in this task.

## Other existing stack packages
- Frontend package manifest lists React, React DOM, TypeScript, Vite, and ESLint packages. Tailwind
  is part of the approved target stack but is not declared or used; the current Notes UI uses CSS.
  Tailwind has not been installed because dependency changes require a separate review and approval.
  The frontend lint/build completed successfully, but a complete license inventory for all
  transitive packages has not been performed.
- Server package manifest lists Fastify and other plugins, TypeScript, Vitest, and `tsx`. Full direct/transitive license and maintenance review remains incomplete.
- Password hashing and session-token hashing use Node's built-in `crypto` APIs; no external cryptography package was added.
- Backup encryption uses Node's built-in `crypto` AES-256-GCM APIs and streaming primitives; no
  external encryption dependency was added.
- Tailwind CSS is required by the target stack but is not currently listed in the web package manifest.

### Security headers plugin
- `@fastify/helmet` is already declared and locked at 13.2.0 (MIT, wrapping Helmet 8.3.0 in the
  current lockfile) and is now registered globally by `apps/server/src/index.ts`.
- Fastify 5 compatibility is within the plugin's documented `>=12.x` support range. No package
  was installed or changed for this implementation.
- The application config uses a self-only CSP, `nosniff`, frame denial, and a restrictive referrer
  policy. HSTS remains disabled on the HTTP loopback listener; HTTPS termination requires a
  separate deployment/security decision.

## Dependency approval gate
Before adding/upgrading any dependency, provide package name/version, license, reason, Windows compatibility, native/prebuilt binary status, maintenance/source evidence, and size/runtime burden, then wait for the required explicit approval. The current work did not add or upgrade any dependency.
