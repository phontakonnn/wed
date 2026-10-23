# CLEANUP LOG — SLICE 3

ทุกแถวคือสิ่งที่ **พิสูจน์แล้วว่าไม่ถูกอ้างอิง** ก่อนลบ (grep ทุก import/require/dynamic
import/config/CI/HTML + `knip@5`) แล้วลบด้วย `git rm` เพื่อให้กู้คืนได้จาก history

เครื่องมือที่ใช้: `npx knip@5 --reporter compact` (ไฟล์/export/type/dependency ที่ไม่ถูกใช้),
`grep -rn` (การอ้างอิงทุกจุด), `npm.cmd run typecheck && lint && test && build` (gate)

## ไฟล์ที่ลบ

| ไฟล์ | ขนาด | หลักฐานว่าไม่ถูกใช้ | ผล |
|---|---:|---|---|
| `apps/web/src/lib/firebase.ts` | 1.3 KB | barrel ที่ re-export Firebase ทั้งชุด; มีผู้ import เพียง `firestore-db.ts` เพื่อขอ `firestoreDb` เท่านั้น (grep `from './firebase'` = 1 จุด) → เปลี่ยนไป import จาก `firebaseDb` ตรง ๆ | Firebase ไม่ถูกดึงเข้า entry graph ผ่าน barrel อีก; knip ไม่รายงาน export ค้าง |
| `apps/web/public/firebase-messaging-sw.js` | 1.9 KB | ไม่มี `register()`/`getToken()`/`navigator.serviceWorker` อ้างถึงชื่อไฟล์นี้เลย (grep ทั้ง `src/`, `index.html`, `public/`); เป็นงานของเฟส D (FCM) ที่ยังไม่เริ่ม — และฝัง Firebase config ไว้ในไฟล์สาธารณะ | ลบ; เฟส D ต้องสร้าง SW นี้จาก env ตอน build (ดู `SECURITY.md`) |
| `apps/web/src/assets/hero.png` | 13.1 KB | ไม่มี import/อ้างอิงใน `src/`, `index.html`, CSS (ไฟล์แม่แบบ Vite ที่ค้างมา) | ลบ |
| `apps/web/src/assets/react.svg` | 4.1 KB | เหมือนข้างบน | ลบ |
| `apps/web/src/assets/vite.svg` | 8.7 KB | เหมือนข้างบน | ลบ |
| `apps/web/package-lock.json` | 142 KB | npm workspace ต้องมี lockfile เดียวที่ root (`package-lock.json`); ไฟล์นี้เป็นสำเนาค้างและทำให้ติดตั้งคนละกราฟกับ root | ลบ (เหลือ lockfile เดียว) |
| `apps/server/package-lock.json` | — | เหตุผลเดียวกับข้างบน | ลบ |
| `apps/web/lint.log` | 79 KB | log ชั่วคราว (untracked อยู่แล้ว) | ลบ |

**ไฟล์ที่ "เกือบ" ถูกลบแต่เก็บไว้ (กันข้อมูลหาย):**

- `apps/web/src/styles/files-view.css` — `FilesView.tsx` ถูกลบไปแล้ว แต่ยังมี
  `CustomCategoryView.tsx` ใช้คลาส `.file-bento-*` อยู่ (grep เจอ 7 จุด) → **เก็บไว้**
- `apps/web/public/icons.svg` — ไม่มีโค้ดอ้างถึง แต่ `docs/API.md` ระบุเป็น static asset
  สาธารณะ และไม่มีต้นทุนใน precache (ไม่เข้า glob) → **เก็บไว้** (ต้นทุน 0, ความเสี่ยงลบสูงกว่า)
- `apps/web/e2e/start-test-server.ts` — knip รายงานว่าเป็น "unused file" แต่
  `playwright.config.ts:28` เรียกผ่าน `npx tsx` → **false positive, เก็บไว้**

## โค้ดตายที่ลบ (export ที่ไม่มีผู้เรียก)

| ไฟล์ | สิ่งที่ลบ | หมายเหตุ |
|---|---|---|
| `src/lib/firestore-db.ts` | `saveUserLink`, `deleteUserLink`, `saveUserDataCard`, `deleteUserDataCard`, `subscribeUserReminders`, `saveUserReminder`, `deleteUserReminder`, `saveUserTheme` | เหลือเฉพาะ 3 ตัวที่ `App.tsx` เรียกผ่าน dynamic import (`subscribeUserLinks`, `subscribeUserDataCards`, `subscribeUserTheme`) |
| `src/api.ts` | `restoreNote`, `deleteFile`, `getTodayTasks`, `getHabitHistory`, `updateAccount`, `verify2FALogin`, `registerWithInvite`, `getSharedWithMe`, `registerAccount`, `createSupportTicket` + type `HabitHistory` | ฟังก์ชัน HTTP shim ที่ไม่มีผู้เรียกหลังย้ายไป Firebase engine |
| `src/api.ts` | `requestJson` (alias) — ลบทิ้ง, `uploadFileWithProgress` — ถอด `export` | ยังใช้ภายในไฟล์ (`uploadFile` เรียก) |
| 51 ไฟล์ | ถอด `export` ออกจาก 93 type ที่ไม่มีผู้ใช้ภายนอก (`*Props`, `*Page`, `*Input` ฯลฯ) | type ถูกลบตอน compile อยู่แล้ว; ลดพื้นที่ผิวของ public API |
| `src/types/index.ts` | type `ThemeEffectsConfig` | ไม่มีผู้ใช้หลังถอด export |
| `src/lib/firebaseAuth.ts` | re-export `FirebaseUser`, `ConfirmationResult` | ไม่มีผู้ใช้ |

## Log / debug

- `console.warn|error` 11 จุดใน `App.tsx`, `NotesView.tsx`, `firebaseDb.ts`,
  `firebaseEngine.ts`, `firebaseTelemetry.ts`, `theme.ts`, `firestore-db.ts` → `logger.*`
  (`logger` เงียบใน production เพราะ `esbuild.drop: ['console']` และ buffer 200 รายการไว้ให้ต่อ sink)
- `TODO`/`FIXME`/`XXX` ใน `src/`: **0 จุด** (ตรวจด้วย grep)
- `debugger`: 0 จุด

## ESLint: 41 warnings → 0

ไม่ได้ปิด rule และไม่ได้ใช้ `any`/`@ts-ignore` เพื่อผ่าน — แก้ที่ต้นเหตุ:

| กลุ่ม | จำนวน | วิธีแก้ |
|---|---:|---|
| `react-hooks/set-state-in-effect` | 9 | แปลงเป็น `useQuery` (ShareItemModal, CommandSearchModal, FavoritesView), ย้าย fetch ไปที่ handler ของแท็บ (ProfileModal, AdminView), derive จาก props แทนการ mirror (Topbar draft state, WebsiteLogo `failedUrl`, CustomTypeBuilderModal initializer + mount on demand) |
| `react-hooks/exhaustive-deps` | 10 | แยก `activeXId` เป็นตัวแปร, `useCallback` ให้ helper ที่ถูกใช้ใน memo (HabitsView), เพิ่ม dep ที่ขาดจริง (TagManagerModal, App.tsx) |
| `react-hooks/preserve-manual-memoization` | 12 | เพิ่ม dependency ที่ React Compiler อนุมานได้ (state setters ที่ stable) ให้ตรงกับที่ระบุไว้ |
| `react-hooks/purity` | 1 | `Date.now()` ระหว่าง render → เก็บ snapshot ตอน fetch (`invitesFetchedAt`) |
| `@typescript-eslint/no-explicit-any` | 4 | แทนด้วย union type จริง / `Record<string, string>` / `unknown` + narrow |
| `react-refresh/only-export-components` | 1 | ย้าย `extractHostname` ไป `src/lib/hostname.ts` |
| `no-empty` | 1 | ใส่คอมเมนต์อธิบายเหตุที่กลืน error |
| unused eslint-disable | 1 | ลบ directive ที่ไม่ได้ใช้ |

## สิ่งที่ **ไม่** ลบ และเหตุผล

- **`apps/server`** (62 ไฟล์ TS, ~2.5 MB) — ยังถูกอ้างจริงจาก root `package.json`
  (`dev`, `test`, `backup:*`, `bootstrap:admin`, `storage:*`) และเป็นที่เก็บ backup CLI
  ที่ผู้ใช้ยังใช้อยู่; `docs/FINAL_REPORT.md` ข้อ 6 บันทึกไว้ว่ารอบก่อน **จงใจไม่ลบ**
  เพื่อไม่ให้ข้อมูล SQLite ของผู้ใช้หาย. การลบจึงเป็นการเปลี่ยนพฤติกรรมที่ผู้ใช้เห็น
  → **คงไว้** และยกเป็นการตัดสินใจของผู้ใช้ (ดู `DECISIONS.md`)

## ตัวเลขที่วัดได้หลัง SLICE 3

| ตัวชี้วัด | ก่อน | หลัง |
|---|---:|---:|
| First-load JS (gzip) | 123.7 KB | 123.7 KB |
| Precache | 12 entries / 652.5 KiB | 12 entries / 652.5 KiB |
| ESLint warnings | 41 | **0** |
| `console.*` ใน `src/` | 13 | 0 (เหลือเฉพาะใน `logger.ts` ซึ่งเป็นตัว sink) |
| lockfile | 3 | 1 |
| ไฟล์ที่ track ทั้งหมด | — | −7 ไฟล์ |
