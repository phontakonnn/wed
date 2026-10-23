# รายงานประสิทธิภาพและความเบาของระบบ (Performance & Optimization)

เอกสารนี้บันทึกผลการวัดประสิทธิภาพจริงทั้งก่อนและหลังการปรับปรุงระบบ (Step 8: ประสิทธิภาพและความเบา)
ข้อมูลทั้งหมดได้จากการทดสอบและการวัดจริงบนสถาปัตยกรรม Fastify + SQLite + React (Vite 8)

---

## 1. ตารางเปรียบเทียบขนาด Bundle (Build Artifacts)

| รายการ (Artifact) | ก่อนปรับปรุง (Baseline) | หลังปรับปรุง (Code Splitting) | ผลต่าง (Diff) | การเปลี่ยนแปลง (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Initial JS Entry (`index-*.js`)** | **545.92 kB** (gzip: 134.99 kB) | **334.84 kB** (gzip: 95.75 kB) | **-211.08 kB** (gzip: -39.24 kB) | **-38.67% (gzip: -29.07%)** |
| **Main CSS (`index-*.css`)** | **130.97 kB** (gzip: 22.45 kB) | **117.94 kB** (gzip: 20.53 kB) | **-13.03 kB** (gzip: -1.92 kB) | **-9.95% (gzip: -8.55%)** |
| **HTML Shell (`index.html`)** | 1.29 kB (gzip: 0.64 kB) | 1.29 kB (gzip: 0.64 kB) | 0 kB | 0% |
| **Vite Chunk Warning (> 500 kB)** | ⚠️ มีคำเตือนขนาดไฟล์เกิน 500 kB | ✅ **ไม่มีคำเตือน (0 Warning)** | หายไปสมบูรณ์ | ปัญหาหมดไป 100% |

---

## 2. โครงสร้าง Chunks ที่แยกย่อย (On-Demand Code Splitting)

หลังจากทำ Code Splitting ด้วย `React.lazy` + `<Suspense fallback={<ViewFallback />}>` ทำให้โค้ดของแต่ละ Feature และ Modal ถูกโหลดเมื่อถูกเรียกใช้งานจริงเท่านั้น:

### Feature Views (โหลดเมื่อเปิดหน้านั้นๆ):
- `NotesView`: 26.06 kB (gzip: 7.27 kB)
- `DashboardView`: 18.02 kB (gzip: 4.09 kB)
- `HabitsView`: 13.29 kB (gzip: 3.18 kB)
- `PeopleView`: 12.63 kB (gzip: 3.73 kB)
- `FilesView`: 12.57 kB (gzip: 3.98 kB)
- `CustomCategoryView`: 11.63 kB (gzip: 2.87 kB)
- `VaultView`: 10.80 kB (gzip: 3.23 kB)
- `LibraryView`: 9.61 kB (gzip: 2.91 kB)
- `TasksView`: 8.27 kB (gzip: 2.61 kB)
- `BookmarksView`: 7.39 kB (gzip: 2.69 kB)
- `GoalsView`: 6.04 kB (gzip: 1.99 kB)
- `ProjectsView`: 5.93 kB (gzip: 2.01 kB)
- `InboxView`: 5.42 kB (gzip: 1.77 kB)
- `FavoritesView`: 4.19 kB (gzip: 1.56 kB)
- `TrashView`: 4.05 kB (gzip: 1.56 kB)
- `DesignSystemPage`: 24.11 kB (gzip: 5.93 kB) + CSS 7.65 kB (gzip: 1.75 kB)

### Modals & Media Players (โหลดเฉพาะเมื่อผู้ใช้เปิด):
- `QuickAddCategoryModal`: 12.67 kB (gzip: 3.51 kB)
- `CommandSearchModal` (Ctrl+K): 8.49 kB (gzip: 2.71 kB)
- `CategoryModal`: 3.52 kB (gzip: 1.48 kB)
- `SidebarNavModal`: 2.95 kB (gzip: 1.19 kB)
- `MediaLightbox`: 2.52 kB (gzip: 0.88 kB)
- `ProfileModal`: 2.05 kB (gzip: 0.97 kB)
- `PermanentDeleteModal`: 1.30 kB (gzip: 0.62 kB)
- `ThemeModal`: 1.23 kB (gzip: 0.55 kB)

---

## 3. ตารางเปรียบเทียบ Performance & Web Vitals (Mobile Viewport)

วัดผลบนโหมดจำลอง Mobile Viewport (iPhone 12/13/14, 390x844px) ผ่าน Chromium Playwright:

| ดัชนีชี้วัด (Metric) | ก่อนปรับปรุง (Baseline) | หลังปรับปรุง (Optimized) | ผลลัพธ์ที่ได้ |
| :--- | :--- | :--- | :--- |
| **Initial Data Transfer (Over the Wire)** | **662.29 KB** (678,189 bytes) | **443.43 KB** (454,072 bytes) | **ประหยัดเน็ตลง 218.86 KB (-33.05%)** |
| **DOMContentLoaded Time** | 44.7 ms | 27.8 ms | **เร็วขึ้น 37.8%** |
| **Page Load Complete Time** | 44.9 ms | 27.9 ms | **เร็วขึ้น 37.9%** |
| **Time to First Byte (TTFB)** | ~10.6 ms | ~3.7 ms | ตอบสนองทันที |
| **Lighthouse / Web Vitals Readiness** | หน่วงจาก JS ก้อนใหญ่ 546 kB | แตกเป็นก้อนย่อย โหลดเฉพาะ Shell หลัก 334 kB | ผ่านเกณฑ์ Mobile Performance |

---

## 4. การจัดการสื่อและรูปภาพ (Image & Media Optimization)
- ตรวจสอบแท็ก `<img>` ทุกจุดในระบบ (รวมถึง Avatar ใน Sidebar, Topbar, ProfileModal, PeopleView, CustomCategoryView, และ Thumbnail ใน FilesView)
- ทุกจุดใช้คุณลักษณะ **`loading="lazy"`** และ **`decoding="async"`** 100% ครบถ้วน เพื่อป้องกันการบล็อก Render Tree ของเบราว์เซอร์

---

## 5. การตรวจสอบฝั่งเซิร์ฟเวอร์ (Server Pagination & Query Protection)
- ตรวจสอบ `GET /api/files` ใน `apps/server/src/index.ts`:
  - บังคับใช้ Query Validation: `page` (default: 1) และ `pageSize` (default: 50, maximum: 200)
  - คำนวณ `offset = (page - 1) * pageSize`
  - ใช้คำสั่ง SQL: `LIMIT ? OFFSET ?` ร่วมกับ `ORDER BY created_at DESC, id DESC`
  - ป้องกันการ Query แบบไม่จำกัดจำนวน (Unbounded Result Set) อย่างสมบูรณ์

---

## 6. Calm Product Minimal foundation pass (2026-10-24)

Scope: design tokens, `fast`/`rich` UI mode, surface/effect cleanup. No routing, layout,
data model, or Firebase changes.

### Build artifacts (same command, same machine)

| Artifact | Before | After | Diff |
| :--- | :--- | :--- | :--- |
| Main CSS (`index-*.css`) | 138.8 kB (gzip 24.2 kB) | 136.96 kB (gzip 23.36 kB) | -1.84 kB raw / -0.84 kB gzip |
| JS entry (`index-*.js`) | 201.7 kB (gzip 48.1 kB) | 200.86 kB (gzip 48.10 kB) | -0.84 kB raw / +0.00 kB gzip |
| `react-vendor` | 75.7 kB gzip | 75.72 kB gzip | unchanged |
| `firebase-vendor` | 205.1 kB gzip | 205.04 kB gzip | unchanged |
| PWA precache | 63 entries / 1,912.8 KiB | 64 entries / 1,888.1 KiB | -24.7 KiB |
| New dependencies | - | none | 0 |

Method: `npm run build`, then gzip the emitted asset with Node `zlib.gzipSync`. The build
command still exits non-zero under PowerShell because warnings go to stderr; `vite` reports
`built in ...` and writes `dist/`.

### Source-count deltas (all `apps/web/src/**/*.css`)

| Pattern | Before | After |
| :--- | ---: | ---: |
| Hard-coded hex colours | 617 | 499 |
| `!important` declarations | 271 | 210 |
| `backdrop-filter` declarations | 21 | 12 (all behind `[data-ui-mode="rich"]`) |
| `transition: all` | 43 | 0 |
| Perpetual pulse animation | always on | rich only |

### Browser checks (Chromium, `vite preview`, 2026-10-24)

- Lighthouse on the unauthenticated entry route: **Accessibility 1.00**, **Best Practices 1.00**,
  SEO 0.80 (the only failure is the pre-existing `robots.txt`).
- Contrast was the one real a11y failure at the start of the pass: emerald `#0f9f6e` on white is
  3.38:1. The default accent is now `#0b7d59` (5.13:1) and the old default is migrated on read.
- `prefers-reduced-motion` is honoured globally in `tokens.css`.
- Theme engine verified in the browser: `mode=dark`, `uiMode=rich`, custom accent writes
  `data-theme`, `data-mode`, `data-ui-mode` and updates `--pkh-color-accent` / `--pkh-ring`
  on the root element.

Performance trace (reload + typing into the login field, 6 s window, desktop Chromium):

- 1 long task, 107 ms blocking total (Firebase/React bootstrap).
- `Layout` 3 calls / 9.0 ms total; `UpdateLayoutTree` 7 calls / 3.05 ms total.
- No layout thrash from the new cards: card hover now changes border/background only.

### Not measured

Notes open/scroll, modal open, and search typing inside the signed-in app were **not** traced:
this environment has no test account or seeded Firestore data. Those flows still need a manual
trace on a signed-in build before claiming a runtime improvement. Bundle and source-count
numbers above are measured; view-level FPS is not.

## 7. Mobile hardening (2026-10-24)

Scope: the app is used on phones. Goal was "works properly with a thumb", not a redesign. No
routing, layout structure, data model, or desktop behaviour changed.

### What changed

| Area | Before | After |
| :--- | :--- | :--- |
| Viewport height | `100vh` only (clipped by iOS browser chrome) | `100vh` + `100dvh` fallbacks on shell, sidebar drawer, detail panel, dialogs |
| Safe areas | only the PWA toast | bottom nav, FAB, workspace, sidebar drawer, mobile detail bar, dialogs, toast |
| Inputs | 12–15px → iOS auto-zooms the page on focus | `16px` on `<=768px` via `#root input/select/textarea` (title fields keep their display size) |
| Touch targets | 32–42px (login button 42px, nav items 4px padding) | `>=44px` for buttons, inputs, icon buttons, nav items, FAB, toast actions; `.pkh-button--sm` 36px |
| Bottom nav | fixed 60px, labels tight against the screen edge | `min-height: 64px`, label ellipsis, 6/8px vertical padding, safe-area padding |
| FAB | 50px, neon emerald glow, `bottom: 74px` | 52px, token shadow, `bottom: calc(76px + safe-area)`, right safe-area |
| `theme-color` | static `#10b981`, manifest `#0b0f19` | JS-updated per mode (`#f8fafc` / `#0f1522`); manifest `#0b7d59` / `#f8fafc` |
| Hard-coded light surfaces | `.notes-sidebar`, `.taxonomy-manager`, `.detail-mobile-bar`, `.icon-button`, `.center-state` gradient | semantic tokens (dark mode no longer shows white panels) |
| Fixed-min grids | `minmax(300px, 1fr)` etc. forced horizontal scroll at 320px | `minmax(min(300px, 100%), 1fr)` (bookmarks, files, life OS, admin, lifestyle, dashboard, design system) |
| Tap behaviour | default 300ms/`-webkit-tap-highlight` | `touch-action: manipulation` + transparent tap highlight on coarse pointers only |

### Measurement method

`apps/web/e2e/mobile-audit.mjs` (`npm run audit:mobile` in `apps/web`). Runs Playwright against
system Chrome at **390x844 @3x**, **360x740 @2x**, **320x568 @2x** with `isMobile` + `hasTouch`,
and reports horizontal overflow, elements past the viewport edge, tap targets under 44px, form
fields under 16px, `theme-color`, and the measured bottom-nav/FAB geometry. It also opens the
design-system modal to confirm it fits the visual viewport.

Because the API server (`better-sqlite3`) is not installed here, the signed-in shell cannot be
loaded. The audit mounts the real `MobileBottomNav` markup inside the running app so the
production cascade still measures the nav/FAB. This is a CSS/layout check of the shell, not a
substitute for a signed-in walkthrough.

### Results against `vite preview` (production CSS)

| Check | 390 | 360 | 320 |
| :--- | :--- | :--- | :--- |
| Horizontal overflow (login, design system, shell) | none | none | none |
| Elements past the right edge | 0 | 0 | 0 |
| Tap targets < 44px (login) | 0 | 0 | 0 |
| Form fields < 16px | 0 | 0 | 0 |
| Bottom nav height | 64px | 64px | 64px |
| FAB gap above nav | 12px | 12px | 12px |
| Modal inside viewport | yes (358x370 of 390x844) | yes (328x370 of 360x740) | yes |

`320x568` also had a real overflow before this pass: the design-system `minmax(320px, 1fr)` grid
plus 24px container padding produced a 344px layout viewport. After the `min()` fix the layout
viewport is exactly 320px.

### Cost

| Artifact | Section 6 | After mobile pass | Diff |
| :--- | :--- | :--- | :--- |
| Main CSS | 136.96 kB (gzip 23.36 kB) | 138.93 kB (gzip 23.82 kB) | +1.97 kB raw / +0.46 kB gzip |
| JS entry | 200.86 kB (gzip 48.10 kB) | 200.95 kB (gzip 48.16 kB) | +0.09 kB raw / +0.06 kB gzip |
| New dependencies | none | none | 0 |

The CSS cost is the media queries, safe-area `calc()` expressions, and the `min()` grid
wrappers. gzip absorbs most of it (+0.46 kB).

### Still needs a device pass

- Signed-in shell: sidebar drawer open/close, note editor keyboard behaviour, virtualized list
  scrolling, and the search palette on a real phone. The API/desktop server is not installed in
  this environment, so these were not exercised.
- `env(safe-area-inset-*)` values are `0` in emulation; verify on an iPhone with a notch/home
  indicator and on Android gesture navigation.
- Input zoom was verified by computed `font-size`, not by focusing a field on real iOS Safari.


