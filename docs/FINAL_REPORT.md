# FINAL REPORT — Firebase-first PWA refactor

วันที่: 2026-10-23
Branch: `refactor/firebase-pwa-second-brain`
Base: `main` (ไม่ถูกแก้ไข) — snapshot งานเดิมของผู้ใช้ก่อนเริ่ม: `c0fe073`

---

## 1. บทสรุปผู้บริหาร

งานรอบนี้ยกระดับแอป "สมองที่สอง" ไปทาง Firebase-first PWA ได้จริงในส่วน **ความถูกต้องของข้อมูล,
ความปลอดภัย, ประสิทธิภาพการอ่าน, PWA และคุณภาพโค้ด** แต่ **ยังไม่ถึงเป้าหมายตัวเลขทุกข้อ** โดยเฉพาะ
ขนาด first-load JS, การลบ `refreshKey` ให้หมด และการลด inline style

สรุปตรงไปตรงมา:

| ด้าน | สถานะ |
|---|---|
| Build/typecheck/lint/test ผ่านทุก phase | ✅ |
| Firestore rules แบบ owner-scoped + deny-by-default | ✅ เขียนแล้ว แต่ **ยังไม่รัน emulator test** |
| ลบ fake success / กลืน error ในชั้นข้อมูล | ✅ |
| ลด N+1 taxonomy และใส่ `limit()` | ✅ |
| PWA manifest + Workbox + update prompt | ✅ ตรวจใน browser แล้ว |
| ฟอนต์ < 80 KB | ✅ 430.3 → 54.0 KB |
| first-load JS < 150 KB gzip | ❌ ~340 KB (เป้าไม่ถึง) |
| `refreshKey` = 0 | ⚠️ บางส่วน (call site 57 → 0, แต่ยังเหลือ 10 effects) |
| inline style ลด ≥ 80% | ❌ ลดได้ < 1% |
| backdrop-filter 2–3 จุด | ❌ ยัง 21 จุด |
| Cloud Functions / migration / deploy | ⛔ ไม่ได้ทำ (ตามข้อห้าม) |

---

## 2. Commits ใน branch

| Commit | สาระ |
|---|---|
| `c0fe073` | snapshot งานที่ค้างใน working tree ก่อนเริ่ม refactor |
| `899175f` | Phase A: ซ่อม baseline, เพิ่ม Vitest, บันทึก `AUDIT.md` / `BASELINE.md` |
| `7185077` | Phase B: หยุดกลืน error, taxonomy denormalised, ลบ N+1, lazy analytics |
| `7635b3a` | Security/config: rules, storage rules, indexes, hosting headers/CSP, CI budget gate |
| `cfbc64b` | `reminderSchedule.ts` + `thaiSearch.ts` พร้อม unit tests (15 tests) |
| `a53dc1d` | Data hardening: ลบ localStorage mirror, throw แทน fallback, bounded reads, Thai search route |
| `5606f2b` | PWA/Workbox/update prompt, WOFF2 fonts, manifest, App Check (optional) |
| `368be21` | TanStack Query สำหรับ notes/bookmarks/trash/dashboard + `bumpRefresh()` |

ทุก commit ผ่าน gate `typecheck → lint → test → build` ก่อน commit

---

## 3. สิ่งที่ทำเสร็จจริง (พร้อมหลักฐาน)

### 3.1 ความถูกต้องของข้อมูล
- `getCurrentUid()` โยน `ApiError(401)` แทนการ fallback ไป uid คงที่ — ป้องกันการอ่านข้อมูลข้ามบัญชี
- ลบ fallback `{ ok: true }` ของ route ที่ไม่รู้จัก → โยน `ApiError(501)` แทนการแกล้งว่าสำเร็จ
- ลบ localStorage collection mirror ทั้งหมด เหลือ Firestore persistent cache เป็น offline layer เดียว
- `getNoteTaxonomy` แบบ N+1 ถูกแทนด้วย `tagIds` / `categoryIds` / `personIds` บนเอกสารโน้ต
- จำกัดการอ่านด้วย `limit()` + aggregation count: notes/bookmarks อ่านไม่เกิน
  `page * pageSize + 20` และ cap ที่ 500 เอกสาร

### 3.2 ความปลอดภัย
- `firestore.rules`: เปลี่ยนจาก `allow read, write: if true` เป็น owner-scoped และ deny-by-default
- `storage.rules`: จำกัด path ตาม uid
- `firestore.indexes.json`: ประกาศ composite index ที่ query ใช้
- `firebase.json`: เพิ่ม cache headers และ security headers รวม CSP
- App Check เป็น optional gate ผ่าน `VITE_FIREBASE_APP_CHECK_SITE_KEY` (มี debug token สำหรับ local)

### 3.3 PWA และ asset
- `vite-plugin-pwa` + Workbox `generateSW`; precache 63 entries / ~1.91 MiB
- `manifest: false` เพื่อคง `public/manifest.json` เดิม (ชื่อไทย + สีแบรนด์)
- update prompt ชัดเจนผ่าน `virtual:pwa-register` ไม่ reload เงียบ ๆ กลางการพิมพ์
- ฟอนต์: 4 TTF (430.3 KB) → 2 WOFF2 variable subsets (54.0 KB)
  - `anuphan-thai.woff2` 18.5 KB
  - `anuphan-latin.woff2` 34.2 KB
- ตรวจใน browser ที่ `http://127.0.0.1:4174`: manifest name/theme ถูก, SW registered และควบคุมหน้า,
  Thai WOFF2 ถูกโหลด, น้ำหนัก 400 กับ 700 ต่างกัน (variable font ทำงาน)

### 3.4 Query layer
- `QueryClient` กลาง: stale 30 s, gc 5 min, ไม่ refetch on focus, retry เฉพาะ error ชั่วคราว
  (ไม่ retry 401/403/404)
- notes / bookmarks / trash / dashboard โหลดผ่าน `useQuery`
- `bumpRefresh()` เป็นจุดเดียวที่ invalidate cache และ bump counter เดิม ช่วยให้ effect ที่ยังไม่ย้าย
  ทำงานสอดคล้องกัน

### 3.5 คุณภาพโค้ดและ CI
- Vitest + Testing Library + jsdom
- Unit tests: `reminderSchedule` (9) + `thaiSearch` (6) + ชุดเดิม = **23 tests ผ่านทั้งหมด**
- `.github/workflows/ci.yml` รัน typecheck/lint/test/build + bundle budget
- `scripts/check-bundle-budget.mjs` + `bundle-budget.json`

---

## 4. ตัวเลขก่อน / หลัง

### 4.1 Bundle (gzip)

| รายการ | ก่อน | หลัง | เป้า |
|---|---:|---:|---:|
| first-load JS รวม | ~317.8 KB | **~339.9 KB** | < 150 KB |
| entry chunk | 1,071.7 KB raw / 317.8 KB | 201.7 KB raw / 48.1 KB | — |
| `react-vendor` | (รวมใน entry) | 241.5 KB raw / 75.7 KB | — |
| `firebase-vendor` | (รวมใน entry) | 684.2 KB raw / 205.1 KB | — |
| CSS | 136.8 KB / 23.4 KB | 142.1 KB / **24.2 KB** | — |
| ฟอนต์ | 430.3 KB | **54.0 KB** | < 80 KB |

**ข้อเท็จจริงสำคัญ:** การแยก vendor chunk ไม่ได้ทำให้ JS รวมเล็กลง — มันแค่ทำให้ cache ได้ดีขึ้น
และโหลดขนานกันได้ ตัวเลขรวมจริงจึง **เพิ่มขึ้น ~22 KB gzip** เพราะเพิ่ม TanStack Query
เป้า < 150 KB ยังไม่ถึง และตัว blocker หลักคือ `firebase-vendor` 205 KB ซึ่งต้องลดด้วยการ
code-split ตาม feature หรือย้ายงานหนักไป Cloud Functions/App Server

### 4.2 Runtime / query

| ตัวชี้วัด | ก่อน | หลัง | เป้า |
|---|---:|---:|---:|
| `refreshKey` occurrences | 76 | **11** | 0 |
| `setRefreshKey` call sites | 57 | **0** | 0 |
| effects ที่ depend on `refreshKey` | 13 | **10** | 0 |
| Firestore requests ต่อการเซฟ (notes) | ~17 | **ลดลงตามจำนวน effect ที่ย้ายแล้ว** แต่ยังไม่ถึง 1–2 | 1–2 |
| taxonomy N+1 ตอนกรอง | 1 ต่อโน้ต | **0** | 0 |
| `listDocs()` ไม่มี limit | มี | **ไม่มีใน notes/bookmarks/dashboard** | มี limit ทุกจุด |

> หมายเหตุ: ตัวเลข "requests ต่อการเซฟ" ยังวัดแบบ end-to-end ไม่ได้เพราะไม่มี Firebase project
> จริงใน environment นี้ ตัวเลขที่ยืนยันได้คือจำนวน effect ที่ยังผูกกับ counter

### 4.3 CSS / paint

| ตัวชี้วัด | ก่อน | หลัง | เป้า |
|---|---:|---:|---:|
| inline `style={{` | 1,702 | **1,695** | ≤ 340 |
| `backdrop-filter` | 21 | **21** | 2–3 |
| `box-shadow` | 123 | **124** | รวมเป็น token |
| `@keyframes` | 11 | **12** | เท่าที่จำเป็น |
| `.catch(() => …)` ที่กลืน error | 88 (ภาพรวม) | **29** (ใน UI) | 0 ในชั้นข้อมูล |
| `as any` | 8 | **7** | 0 ในชั้นข้อมูล |

ชั้นข้อมูล (`firebaseEngine.ts`, `api.ts`) ไม่กลืน error แล้ว แต่ UI ยังมี `.catch(() => …)`
อีก 29 จุด ซึ่งควรเปลี่ยนเป็น toast/error state ในรอบถัดไป

---

## 5. สิ่งที่ **ไม่ได้** ทำ และเหตุผล

| รายการ | สถานะ | เหตุผล |
|---|---|---|
| B1 ลบ `refreshKey` ทั้งหมด | ⚠️ บางส่วน | ยังเหลือ 10 effects; การย้ายทั้งหมดต้องทดสอบทีละ view กับข้อมูลจริง |
| B2 migration script | ⛔ | ข้อห้าม: ห้ามรัน production migration; ยังไม่มี project จริงให้ทดสอบ |
| B3/B4 bundle < 150 KB | ❌ | ต้อง code-split Firebase ตาม feature และอาจต้องย้ายงานไป Functions |
| C1 repositories / app-server archival | ⛔ | ต้องมี Firebase project + การตัดสินใจเรื่อง server ที่ยังใช้งาน |
| C3 cursor pagination + virtualization | ❌ | ติดตั้ง `@tanstack/react-virtual` แล้วแต่ยังไม่ได้ต่อ UI |
| C4 realtime listeners | ❌ | ยังไม่มี project จริงให้ทดสอบ listener lifecycle |
| C5 storage uploads | ❌ | ต้องมี bucket จริงและ rules test |
| C6 rules emulator tests / App Check enforcement | ❌ | ไม่มี `firebase-tools`/emulator ในเครื่อง; ห้าม deploy |
| D1/D3/D4 | ❌ | ต้องมีการตัดสินใจ product เพิ่ม |
| E command palette / share target / export-import UI | ❌ | อยู่นอก slice ที่ปลอดภัยต่อการทดสอบ |
| F full UX refactor + Lighthouse | ❌ | ต้องเปิด browser ที่มีหน้าต่างจริง; Lighthouse รันใน environment นี้ไม่ได้ |
| G deploy workflow | ⛔ | ข้อห้าม: ห้าม deploy production |

รายการเหล่านี้ถูกบันทึกใน `docs/DECISIONS.md` หัวข้อ "Firebase-first PWA refactor" แล้ว

---

## 6. ขั้นตอนที่ต้องทำด้วยมือก่อนขึ้น production

1. **ตั้งค่า Firebase project**
   - คัดลอก `.env.example` → `.env.local` แล้วใส่ค่า `VITE_FIREBASE_*`
   - ถ้าใช้ App Check: ใส่ `VITE_FIREBASE_APP_CHECK_SITE_KEY` (และ debug token เฉพาะ local)
2. **ทดสอบ rules ก่อน deploy**
   ```powershell
   npm.cmd exec -- firebase emulators:start --only firestore,storage
   npm.cmd exec -- firebase emulators:exec --only firestore,storage "npm.cmd --prefix apps/web run test"
   ```
   > ยังไม่มี rules unit test ที่ผูกกับ emulator ในรอบนี้ ต้องเขียนเพิ่มก่อนถือว่าผ่าน
3. **Deploy rules/indexes** (เมื่อพร้อมเท่านั้น)
   ```powershell
   npm.cmd exec -- firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
4. **Deploy hosting**
   ```powershell
   npm.cmd --prefix apps/web run build
   npm.cmd exec -- firebase deploy --only hosting
   ```
5. **ตรวจ bundle budget** หลัง deploy ว่าไม่เกินค่าที่ตั้งไว้
6. **ตัดสินใจเรื่อง app server เดิม** — รอบนี้ไม่ได้ archive หรือลบ เพื่อไม่ให้ข้อมูลของผู้ใช้หาย

---

## 7. ความเสี่ยงและหนี้ที่ยังเหลือ

1. **Rules ยังไม่ถูกพิสูจน์** — เขียนถูกตามโมเดลข้อมูล แต่ยังไม่ผ่าน emulator test
   ความเสี่ยงสูงสุดถ้า deploy ทันที
2. **first-load ใหญ่กว่าเดิม** — ผู้ใช้บนมือถือช้าอาจรู้สึกแย่ลงเล็กน้อย แม้จะ cache ดีขึ้น
3. **`refreshKey` บางส่วน** — notes/dashboard ใช้ query cache แล้ว แต่ 10 effects ยังใช้ counter
   ทำให้การเซฟบางหน้าอาจยังยิง request เกินจำเป็น
4. **UI ยังกลืน error 29 จุด** — ผู้ใช้อาจไม่เห็นความล้มเหลวของการกระทำบางอย่าง
5. **Inline style/~1,695 จุด** — CSS bundle โตและแก้ theme ยาก
6. **ไม่มี Lighthouse/PWA audit จริง** — คะแนน PWA ยังไม่ถูกวัดอย่างเป็นทางการ
7. **Migration script ไม่มี** — ข้อมูลจาก app server เดิมยังไม่ถูกย้าย

---

## 8. คำสั่งรันซ้ำ (quality gate)

```powershell
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run test
npm.cmd --prefix apps/web run build
```

ผลล่าสุด (2026-10-23):

- `typecheck` ผ่าน
- `lint` 0 errors / 50 warnings
- `test` 23 passed / 4 files
- `build` ผ่าน; PWA precache 63 entries / 1,912.79 KiB

---

## 9. เอกสารที่เกี่ยวข้อง

- `docs/AUDIT.md` — ปัญหาที่พบและหลักฐาน Phase A
- `docs/BASELINE.md` — ตัวเลขก่อน refactor และคำสั่งวัด
- `docs/DECISIONS.md` — เหตุผลของทุกการตัดสินใจ (หัวข้อ Firebase-first PWA refactor)
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — security config
- `.github/workflows/ci.yml`, `scripts/check-bundle-budget.mjs` — CI gate
