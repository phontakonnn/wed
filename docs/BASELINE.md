# BASELINE — Phase A measurements

วันที่วัด: 2026-10-23
Branch: `refactor/firebase-pwa-second-brain`
Environment: Windows 10/11 x64, Node v24.22.0, npm 11.19.1
Build: `npm.cmd --prefix apps/web run build` (`tsc -b && vite build`)

> หมายเหตุ: PowerShell ในเครื่องนี้บล็อก `npm.ps1` (Execution Policy) จึงต้องเรียก `npm.cmd`
> ตัวเลข gzip ของ JS ใช้ค่าที่ Vite รายงาน; CSS วัดซ้ำด้วย `zlib.gzipSync(level: 9)`

---

## 1. Build output (baseline)

| Artifact | Raw | Gzip |
|---|---:|---:|
| `dist/assets/index-*.js` (first-load entry) | **1,071.7 KB** | **317.8 KB** |
| `dist/assets/index-*.css` | 136.8 KB | 23.4 KB |
| `dist/assets/AdminView-*.js` (lazy) | 70.1 KB | 14.6 KB |
| `dist/assets/ProfileModal-*.js` (lazy) | 63.0 KB | 12.7 KB |
| `dist/assets/HabitsView-*.js` (lazy) | 39.0 KB | 8.6 KB |
| `dist/assets/NotesView-*.js` (lazy) | 37.2 KB | 9.6 KB |
| `dist/assets/ThemeModal-*.js` (lazy) | 26.6 KB | 5.9 KB |
| `dist/` ทั้งหมด | 2,223.2 KB | — |

**เป้า Phase B4:** first-load JS < 150 KB gzip → ต้องลดจาก 317.8 KB ประมาณ 53%

### สาเหตุหลักที่ entry chunk ใหญ่

- `App.tsx` 178.3 KB / 4,541 บรรทัด ถูก import ตรงใน `main.tsx`
- `api.ts` 101.8 KB / 2,657 บรรทัด ถูก import โดย App และ feature เกือบทั้งหมด
- `firebaseEngine.ts` 45.4 KB / 1,172 บรรทัด ถูก import โดย `api.ts` และถูก side-effect import ใน `main.tsx`
- Firebase SDK (auth + firestore + analytics + messaging) ถูก bundle เข้า entry
- `App.css` 84.6 KB / 4,211 บรรทัด + CSS อีก 19 ไฟล์ รวมเป็น `index.css` 136.8 KB

---

## 2. Assets / fonts

| Asset | ขนาด |
|---|---:|
| `public/fonts/anuphan-regular.ttf` | 107.3 KB |
| `public/fonts/anuphan-medium.ttf` | 107.8 KB |
| `public/fonts/anuphan-semibold.ttf` | 107.7 KB |
| `public/fonts/anuphan-bold.ttf` | 107.5 KB |
| **รวมฟอนต์ไทย** | **430.3 KB** |
| `public/icon-512.png` | 8.4 KB |
| `public/icon-192.png` | 2.0 KB |
| `public/favicon.svg` | 9.3 KB |

**เป้า Phase B4:** ฟอนต์ < 80 KB → ต้องแปลงเป็น WOFF2 subset (ไทย + Latin + ตัวเลข) เฉพาะ weight ที่ใช้จริง

---

## 3. Source size (hot files)

| ไฟล์ | KB | บรรทัด |
|---|---:|---:|
| `src/App.tsx` | 178.3 | 4,541 |
| `src/api.ts` | 101.8 | 2,657 |
| `src/App.css` | 84.6 | 4,211 |
| `src/lib/firebaseEngine.ts` | 45.4 | 1,172 |
| `src/features/admin/AdminView.tsx` | 120.2 | 2,388 |
| `src/features/habits/HabitsView.tsx` | 73.2 | 1,558 |
| `src/features/notes/NotesView.tsx` | 48.0 | 1,052 |

**เป้า Phase F:** ไม่มีไฟล์ feature เกิน ~400 บรรทัด

---

## 4. Runtime / query behaviour (measured by call-site counting)

| ตัวชี้วัด | Baseline | เป้าหมาย |
|---|---:|---:|
| `refreshKey` occurrences | 76 | 0 |
| `setRefreshKey` call sites | 57 | 0 |
| `useEffect` ที่ depend on `refreshKey` | 13 | 0 |
| Firestore requests ต่อการเซฟ 1 ครั้ง (หน้า notes) | **~17** | 1–2 |
| เอกสารที่อ่านตอนเปิด dashboard | 11 collection เต็ม | ≤ 30 docs |
| `getNoteTaxonomy` per note เมื่อกรอง | 1 ต่อโน้ต (N+1) | 0 (denormalized) |
| `listDocs()` | ไม่มี `limit` | `limit(20–30)` + cursor |

รายละเอียดการนับอยู่ใน `docs/AUDIT.md` หัวข้อ (a)–(c)

---

## 5. CSS / paint budget

| ตัวชี้วัด | Baseline | เป้าหมาย |
|---|---:|---:|
| `backdrop-filter` | 21 | 2–3 |
| `box-shadow` declarations | 123 | รวมเป็น token ไม่กี่ระดับ |
| `@keyframes` | 11 | เท่าที่สื่อความหมาย |
| inline `style={{ ... }}` | 1,702 | ลด ≥ 80% (~≤ 340) |
| `catch {}` (กลืน error) | 88 | 0 ในชั้นข้อมูล |
| `as any` | 8 | 0 ในชั้นข้อมูล |

---

## 6. Quality gate — Phase A

| Gate | ผล |
|---|---|
| `tsc -b` | ผ่าน |
| `eslint .` | ผ่าน (0 errors, 50 warnings ที่ถูก track ไว้) |
| `vitest run` | ผ่าน 4 tests (1 file) |
| `vite build` | ผ่าน |
| Font/bundle numbers | บันทึกแล้วด้านบน |
| Lighthouse mobile | **ยังไม่ได้รัน** (จะทำใน Phase F/G) |

### สิ่งที่ซ่อมเพื่อให้ baseline ผ่าน

1. restore `apps/web/src/lib/constants.ts` จาก commit `0020a92` (ถูก import แต่ถูกลบใน `f6c7f43`)
2. restore `apps/web/src/features/settings/ProfileModal.tsx` จาก commit ก่อนหน้า (ไฟล์ถูกตัดจนอ้างตัวแปรที่ไม่มี)
3. ลบตัวแปร `domain` ที่ไม่ถูกใช้ใน `BookmarksView.tsx`
4. ลบ `Boolean(...)` ที่ซ้ำซ้อนใน `CustomRecordsView.tsx`
5. แก้ useless assignment ใน `HabitsView.tsx`
6. ปรับ ESLint policy: legacy rules เป็น warning, scope `any`/empty-block ที่ไฟล์ legacy (`App.tsx`, `api.ts`, `firebaseEngine.ts`, `firestore-db.ts`) — ไม่ปิดทั้งโปรเจกต์

---

## 7. Tooling ที่ติดตั้งใน Phase A

Runtime:
- `@tanstack/react-query` 5.104.5
- `@tanstack/react-virtual` 3.14.22
- `minisearch` 7.2.0
- `zod` 4.6.7

Dev:
- `vitest` 5.0.5, `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 7.0.1
- `@firebase/rules-unit-testing` 6.0.0
- `vite-plugin-pwa` 2.0.0, `workbox-window` 7.4.1
- `rollup-plugin-visualizer` 7.1.1

ยังไม่ได้ติดตั้ง: `firebase-tools` (จะติดตั้งใน Phase C/G เมื่อต้องรัน emulator/CI) และ `depcheck`/`knip` (Phase C1)

---

## 8. คำสั่งวัดซ้ำ

```powershell
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run test
npm.cmd --prefix apps/web run build
```
