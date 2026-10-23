# AUDIT — Firebase-first PWA refactor (Phase A)

วันที่ตรวจ: 2026-10-23
Branch: `refactor/firebase-pwa-second-brain`
Commit ตั้งต้น: `c0fe073` (snapshot งานค้างของผู้ใช้) + commit ซ่อม baseline ก่อนเฟส A

> เอกสารนี้ยืนยันปัญหาจาก **โค้ดจริง** ไม่ใช่จากรายงานเก่า ตัวเลขบรรทัดอ้างอิง ณ commit ที่ระบุด้านบน

---

## 0. โครงสร้างที่พบ

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| `apps/web` | แอปหลัก (React 19 + Vite 8 + TS) | ยังใช้ `api.ts` + `firebaseEngine.ts` เป็น adapter กลาง |
| `apps/server` | Fastify + SQLite + LiteFS, 62 ไฟล์ | ไม่ถูกเรียกใน production path แต่ยังอยู่ใน workspace/scripts |
| `packages/shared` | shared types | ใช้งานเล็กน้อย |
| `firestore.rules` | `allow read, write: if true;` ทั้งฐาน | เปิดสาธารณะทั้งหมด |
| `storage.rules` | **ไม่มีไฟล์** | ยังไม่ได้ตั้ง Storage rules |
| `firebase.json` | มีแค่ hosting + firestore | ไม่มี rewrite `/api/**`, ไม่มี cache/security headers, ไม่มี emulator config |
| PWA | `public/sw.js` เป็น network-first + ล้าง cache ทุก activate | ไม่ precache app shell, ไม่มี offline fallback |
| Fonts | TTF 4 ไฟล์ รวม 430.3 KB | ยังไม่มี WOFF2 subset |
| Tests (web) | ไม่มี unit test เดิม | เพิ่ม Vitest + smoke test ในเฟส A แล้ว |

---

## 1. ปัญหาที่รายงาน vs หลักฐานในโค้ด

### (a) N+1 taxonomy — **ยืนยัน**

- `apps/web/src/App.tsx:920-942` — เมื่อมีตัวกรอง tag/category และมีโน้ตในหน้า จะยิง `Promise.all(notes.map(...))` เรียก `getNoteTaxonomy(note.id)` **ทีละโน้ต**
- `apps/web/src/api.ts:571-577` — `getNoteTaxonomy()` เรียก `/api/notes/{id}/taxonomy`
- `apps/web/src/lib/firebaseEngine.ts:1219-1220` — route ที่ไม่รู้จัก (รวม taxonomy) ตอบ `{ ok: true }`
- ผลคือ `taxonomy.categories` เป็น `undefined` → `.map` โยน error → ถูกกลืนที่ `catch` ใน `App.tsx:931` และคืน `{categoryIds: [], tagIds: []}` ให้ทุกโน้ต
- **สรุป: ตัวกรองแท็ก/หมวดหมู่ไม่ทำงานจริง และยังเกิด N+1 เมื่อมีตัวกรอง**

### (b) `refreshKey` — **ยืนยัน**

- ประกาศ: `apps/web/src/App.tsx:532`
- `refreshKey` ปรากฏ **76 ครั้ง**, `setRefreshKey` **57 จุด**
- `useEffect` ที่ depend on `refreshKey`: **13 effect** (บรรทัด 603, 627, 645, 820, 831, 866, 918, 1089, 1117, 1164, 1185, 1215, 1378)
- การกดบันทึก 1 ครั้ง (`handleSave`, `App.tsx:3065-3093`) เรียก `setRefreshKey` แล้วทำให้ effect ที่ active วิ่งซ้ำ เช่น ขณะอยู่หน้า notes:
  - effect 1089: 7 คำขอ + `getNotifications()` = 8
  - effect 1117: 4 คำขอ
  - effect 603: 2 คำขอ
  - effect 820 / 1204 / 1378: 3 คำขอ
  - รวมประมาณ **17 คำขอต่อการเซฟ 1 ครั้ง** (ยังไม่นับ subcollection ของ taxonomy)

### (c) `listDocs()` อ่านทั้ง collection — **ยืนยัน**

- `apps/web/src/lib/firebaseEngine.ts:66-77` — `query(userCol(colName))` ไม่มี `limit` แล้ว `getDocs` ทั้ง collection
- `firebaseEngine.ts:440, 469, 502` — แบ่งหน้าแบบ `active.slice(...)` ฝั่ง client หลังอ่านทั้งหมด
- `firebaseEngine.ts:1108-1118` — dashboard อ่าน **11 collection เต็ม** (`notes, bookmarks, tasks, reminders, habits, vault, library, people, projects, goals, timeblocks`)
- ตัวกรอง/search ใน `handleFirebaseRequest` ก็กรองบน array ที่โหลดมาแล้ว

### (d) localStorage เขียน JSON ทั้ง collection — **ยืนยัน**

- `firebaseEngine.ts:54-63` — `setLocalFallback` เขียน `localStorage` ทุกครั้งที่ `listDocs` สำเร็จ
- `firebaseEngine.ts:73-75` — เมื่อ Firestore error จะคืนข้อมูลจาก localStorage แทนการแจ้ง error
- `apps/web/src/lib/firestore-db.ts:58-70` — pattern เดียวกันสำหรับ `links`, `cards`, `reminders` ฯลฯ
- ความเสี่ยง: เพดาน ~5 MB, เขียน synchronous บน main thread, ข้อมูลไม่สดและไม่มีขอบเขต uid ที่ชัดเจน

### (e) `request()` กลืน error และคืน `{ ok: true }` — **ยืนยัน**

- `apps/web/src/api.ts:375-385`

```ts
async function request<T>(...) {
  try {
    const res = await handleFirebaseRequest<T>(path, options);
    if (res !== null && res !== undefined) return res;
  } catch (err: any) {
    console.warn(...);
  }
  return ({ ok: true } as any) as T;
}
```

- `firebaseEngine.ts:1219-1220` — fallback ของทุก route ที่ไม่รู้จักก็คืน `{ ok: true }`
- `firebaseEngine.ts:1215-1217` — `/api/files` คืนรายการว่างเสมอ
- `api.ts` ยังมี `result || { ok: true }` ในฟังก์ชัน admin/security อีกหลายจุด (เช่น 2415, 2480, 2488, 2495, 2553)
- **ผลกระทบ: UI แสดงว่าสำเร็จทั้งที่ข้อมูลไม่ได้ถูกบันทึก**

### (f) งาน GPU/Paint — **ยืนยัน (ตัวเลขจาก grep ทั้ง `apps/web/src`)**

| สิ่งที่วัด | จำนวน |
|---|---|
| `backdrop-filter` | 21 |
| `box-shadow` | 123 |
| `@keyframes` | 11 |
| `style={{ ... }}` (inline style object) | **1,702** |
| `useEffect` | 96 |
| `as any` | 8 |

> เป้าของเฟส F: backdrop-filter 2–3 จุด, inline style ลด ≥ 80%

### (g) Analytics / Messaging โหลดตอน boot — **ยืนยัน**

- `apps/web/src/lib/firebase.ts:139-141` — `void getFirebaseAnalytics()` ที่ module scope
- `firebase.ts` ถูก import จาก `main.tsx` (ผ่าน `firebaseEngine`) และจาก `api.ts` → analytics ถูกดึงเข้า first-load bundle
- Messaging เป็น lazy function อยู่แล้ว (`getFirebaseMessaging`) แต่ยัง import `firebase/messaging` แบบ static ที่หัวไฟล์

### (h) อัปโหลดไฟล์ยิง `/api/files` แต่ไม่มี backend ใน Firebase Hosting — **ยืนยัน**

- `apps/web/src/api.ts:882` — `xhr.open('POST', '/api/files')`
- `firebase.json` rewrite `** -> /index.html` ทำให้ POST ไปถึง index.html (405/HTML) ไม่ใช่ API
- `firebaseEngine.ts:1215-1217` คืนไฟล์ว่าง → หน้า Files ว่างเสมอ และอัปโหลดไม่ทำงานบน Firebase Hosting

### (i) `apps/server` ไม่ได้ใช้ — **ยืนยันเชิงโครงสร้าง**

- 62 ไฟล์ใน `apps/server/src`, ไฟล์ใหญ่สุด `index.ts` 143.8 KB
- root `package.json` ยังชี้ `dev`, `test`, `build:server`, backup scripts ไปที่ server
- production hosting ใช้ `apps/web/dist` อย่างเดียว

---

## 2. ปัญหาเพิ่มเติมที่พบระหว่าง audit

1. **Build แตกก่อนเริ่มงาน** — commit `f6c7f43` ลบ `lib/constants.ts` ที่ยังถูก import อยู่ 15 ตำแหน่ง, และ `ProfileModal.tsx` ถูกตัดเหลือโครงที่อ้างตัวแปรที่หายไป 20+ ตัว
   - แก้ในเฟส A โดย restore `constants.ts` จาก `0020a92` และ restore `ProfileModal.tsx` จาก commit ก่อนหน้า (งานที่ผู้ใช้ตั้งใจตัดสามารถทำใหม่ได้แบบมี test)
2. **`firestore.rules` เปิด public** — ใครมี project id ก็อ่าน/เขียนทุก user ได้
3. **ไม่มี `storage.rules`** — Storage bucket ไม่มีกฎ
4. **ไม่มี App Check** — client ไม่ได้ initialize App Check
5. **`main.tsx` ลบ cache ทุกครั้งที่ boot** — ทำให้ offline/PWA cache ไม่มีประโยชน์
6. **`sw.js` ไม่มี precache** — offline แล้วเปิดแอปใหม่จะโหลด shell ไม่ได้
7. **ไม่มี pagination cursor** — ทั้ง notes/bookmarks/files ใช้ page number + slice
8. **ไม่มี realtime เฉพาะจุด** — `firestore-db.ts` มี `onSnapshot` ทั้ง collection สำหรับ links/cards/reminders; dashboard ใช้ polling ผ่าน refreshKey
9. **ไม่มี reminder model ตามสเปก** — `UserReminderItem` ใน `firestore-db.ts` ใช้ `targetDate`, `recurrence` แบบ string และ `isCompleted` ไม่มี `remindAt`, timezone, snooze, repeat interval
10. **ไม่มี Cloud Functions** — ไม่มีโฟลเดอร์ `functions/`
11. **ไม่มี CI** — ไม่มี `.github/workflows`
12. **ไม่มี `storage.rules`, `firestore.indexes.json`, `.firebaserc` ชี้ project `personal-life-os-68631`**
13. **Hard-coded Firebase config ใน `lib/firebase.ts:16-24`** — ไม่ใช่ secret แต่ควรย้ายเป็น env เพื่อแยก environment
14. **Thai text หลายไฟล์เสีย encoding** ในเอกสารเก่า (`docs/BASELINE.md`, `docs/PERF.md`) — เขียนใหม่เฉพาะเอกสารที่เฟสนี้เป็นเจ้าของ

---

## 3. สรุปความพร้อมของแต่ละเฟส

| เฟส | สถานะตั้งต้น | สิ่งที่ต้องทำหลัก |
|---|---|---|
| A Baseline | ซ่อม build/lint ให้ผ่านแล้ว | audit + baseline + tooling |
| B Performance | ยังไม่เริ่ม | TanStack Query, ลบ refreshKey, N+1, error handling, bundle |
| C Firestore-first | ยังไม่เริ่ม | repository layer, ลบ localStorage fallback, pagination, rules |
| D Reminders | ยังไม่เริ่ม | model ใหม่, Cloud Functions, FCM, iOS fallback |
| E Search/Capture | มี `Intl.Segmenter` บางส่วน แต่ยังไม่มี index | MiniSearch worker, command palette, share target, export/import |
| F UX/UI | tokens มีบ้าง แต่ inline style สูงมาก | แยก feature, ลด paint, a11y, PWA เต็มรูปแบบ |
| G CI/CD | ยังไม่เริ่ม | firebase.json, workflows, cost/runbook |

---

## 4. ข้อจำกัดของ audit นี้

- ไม่ได้รัน Lighthouse เพราะยังไม่มี preview server ที่ตั้งค่า production build + service worker ครบ (จะทำในเฟส F/G)
- ไม่ได้วัด Firestore reads จาก production จริง (ห้ามแตะ production) ตัวเลข 17 reads ต่อการเซฟมาจากการนับ call site ใน effect ที่ active
- ไม่ได้ทดสอบบนอุปกรณ์ iOS จริง
