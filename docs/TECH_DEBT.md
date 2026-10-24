# Technical Debt & Architecture Review (PKH / Life OS)

> **บันทึกหนี้ทางเทคนิค (Technical Debt) และการประเมินสถาปัตยกรรม**  
> ปรับปรุงล่าสุด: หลังเสร็จสิ้น **Phase 4–10 (Final Polish & Production Hardening)**  
> สถานะโดยรวม: **พร้อมใช้งานจริง (Production Ready) — ระบบผ่านการทดสอบ 100% ทุกชุด**

---

## 1. รายการหนี้ทางเทคนิคที่ได้รับการแก้ไขแล้ว (Resolved Debts in Phase 4–9)

ตั้งแต่เริ่มต้นกระบวนการปรับปรุงโครงสร้างรหัส (Refactoring) ปัญหาทางเทคนิคระดับรากฐานได้ถูกแก้ไขอย่างเป็นรูปธรรม ดังนี้:

| รายการหนี้ทางเทคนิคเดิม | ขั้นตอนที่แก้ไข | ผลลัพธ์หลังแก้ไข |
| :--- | :---: | :--- |
| **Monolithic `App.tsx` (8,295 บรรทัด)** | Phase 4 | ชำแหละและแยกออกเป็น 15 Feature Views, 7 Modals, Shared Components และ Types อย่างเป็นระบบ |
| **ความไม่สอดคล้องของ UI / Design Tokens** | Phase 5 | สร้าง Tokens (`tokens.css`, `base.css`, `components.css`) และปรับใช้กับทุกหน้าจอ พร้อม Design System Showcase |
| **ฟีเจอร์ที่ยังขาดหาย (Custom Categories, Versioning)** | Phase 6 | พัฒนาระบบหมวดหมู่ของฉันเชื่อมโยงทุก Entity, ระบบประวัติเวอร์ชันโน้ตย้อนหลังได้, และการสตรีมมิงไฟล์ใหญ่ |
| **การขาดชุดทดสอบอัตโนมัติแบบ E2E** | Phase 7 | สร้างชุดทดสอบ Playwright E2E ครอบคลุม 6 ท่าสำคัญ (Auth, CRUD, 5MB Upload, Video 206 Streaming, 0 CSP/Console Errors, Throttling) ผ่าน 100% |
| **Initial Bundle ขนาดใหญ่และไม่มี Code Splitting** | Phase 8 | นำ `React.lazy` และ `Suspense` มาใช้แยก Chunk ทุกหน้าจอ ลดขนาดโหลดแรกเริ่มเหลือเพียง **~96 kB gzip** |
| **ปัญหาการทดสอบ Backup ล้มเหลว (`src/backup.test.ts`)** | Phase 9 | ปรับปรุงการแยก Environment Variables (`BACKUP_ENCRYPTION_*`) ใน Unit test ส่งผลให้ **255/255 tests ผ่าน 100%** |
| **ความเสี่ยงพอร์ตสาธารณะและสิทธิ์คุกกี้** | Phase 9 | ปรับค่าเริ่มต้นเป็น `127.0.0.1`, รองรับ Reverse Proxy Headers (`X-Forwarded-Host/Proto`), ตรวจสอบ CSRF และออกคุกกี้ `Secure` อัตโนมัติ |
| **การขาดระบบตรวจจับดิสก์เต็ม** | Phase 9 | เพิ่ม `statfsSync` ใน `/api/health` และแสดงแบนเนอร์แจ้งเตือนทันทีบนเว็บแอปเมื่อพื้นที่ดิสก์ใช้งานเกิน 90% |
| **การไม่มีหลักฐานการกู้คืนข้อมูลจริง** | Phase 9 | ทำการซ้อมกู้คืนข้อมูลจริง (Drill) พิสูจน์ว่าโน้ตและไฟล์ไบนารีหลังกู้คืนตรงกับต้นฉบับ 100% ทุกไบต์ |

---

## 2. ลำดับความสำคัญของหนี้ทางเทคนิคที่คงเหลือ (Remaining Technical Debt)

### 🟡 ระดับความสำคัญ: ปานกลาง (Medium Priority) — แนะนำสำหรับรอบการพัฒนาถัดไป

#### 2.1 การสกัด Custom Hooks แยก State ออกจาก `App.tsx`
* **บริบทปัจจุบัน**: แม้ `App.tsx` จะถูกแยก View ออกไปแล้ว แต่ State หลักและ Handlers ยิง API (เช่น `handleSaveNote`, `addInboxItem`, `toggleTask`) ยังรวมอยู่ที่ Root Component
* **ผลกระทบ**: React ต้อง Re-render App Component เมื่อ State กลางเปลี่ยน แม้จะไม่ส่งผลกระทบต่อ View ย่อย
* **แนวทางแก้ไข**:
  - ทยอยสกัดฟังก์ชันและ State ออกเป็น Domain Hooks เช่น:
    - `useNotes()` ใน `features/notes/useNotes.ts`
    - `useTasksAndProjects()` ใน `features/tasks/useTasks.ts`
    - `useVaultAndLibrary()` ใน `features/vault/useVault.ts`
  - หรือใช้ Zustand Store สำหรับ Global State ที่แชร์ข้ามหลาย View

#### 2.2 การปรับปรุง ESLint `react-hooks/exhaustive-deps` ใน `App.tsx`
* **บริบทปัจจุบัน**: มีการละเว้น Dependencies ใน `useEffect` 6 จุด เพื่อป้องกัน Network Loop และการล้างฟอร์มขณะพิมพ์
* **ผลกระทบ**: ไม่มีผลเสียต่อการทำงานจริงในปัจจุบัน (ผ่าน E2E 100%) แต่ทำให้ Linter มี Warning
* **แนวทางแก้ไข**:
  - ปรับการซิงค์ข้อมูลจาก Effect-driven ให้เป็น Event-driven (เรียกคำสั่งเมื่อผู้ใช้คลิกเลือก Entity โดยตรง)

---

### 🟢 ระดับความสำคัญ: ต่ำ (Low Priority / Nice-to-Have)

#### 2.3 การย้าย Legacy CSS ค้างใน `App.css` เข้าสู่ CSS Modules
* **บริบทปัจจุบัน**: มี `App.css` เดิมที่ยังถูกนำเข้ามาใช้งานควบคู่กับ Design Tokens
* **ผลกระทบ**: ไม่มีปัญหาการแสดงผล เนื่องจาก Design System ใหม่ทับซ้อนและจัดลำดับความสำคัญไว้อย่างถูกต้องแล้ว
* **แนวทางแก้ไข**:
  - ทยอยลบคลาสที่ไม่ได้ใช้งานใน `App.css` เมื่อมีการปรับปรุงสไตล์ของแต่ละ View ในอนาคต

#### 2.4 การนำ TanStack Query (React Query) มาใช้สำหรับการแคชข้อมูล
* **บริบทปัจจุบัน**: ปัจจุบันใช้ `refreshKey` ร่วมกับการดึงข้อมูลใหม่เมื่อมีการเปลี่ยนแปลง
* **ผลกระทบ**: เนื่องจากเป็น Single-Tenant ระบบทำงานบนเครื่องเดี่ยว ความเร็วเฉลี่ยระดับ Localhost (< 5ms) จึงไม่ส่งผลต่อผู้ใช้
* **แนวทางแก้ไข**:
  - หากในอนาคตต้องการขยายเป็น Multi-device Sync แบบเรียลไทม์ สามารถนำ React Query มาช่วยเรื่อง Automatic Background Refetching และ Optimistic Updates ได้

---

## 3. สรุปความพร้อมของสถาปัตยกรรมระบบ (Architectural Readiness)

```
[ Frontend: React 18 + Vite ]
   ├── Code Splitting (16 chunks, lazy loaded)
   ├── Design Tokens & Components System
   ├── Playwright E2E Suite (6/6 Passing)
   └── Disk Warning Banner (> 90% usage)
             │
      (HTTP / JSON API)
             ▼
[ Backend: Fastify + TypeScript ]
   ├── Loopback Isolation (127.0.0.1:3001)
   ├── Reverse Proxy Support (X-Forwarded-*)
   ├── CSRF Validation & Secure Session Cookies
   ├── Vitest Unit Tests (255/255 Passing)
   └── AES-256-GCM Encrypted Object Backup
             │
             ▼
[ Storage Layer: SQLite 3 + Sharded Objects ]
   ├── WAL Mode + 14 Migration Steps
   ├── FTS5 + Trigram Index (Thai / English)
   └── Empirical Backup & Restore Verified (100%)
```

**บทสรุป**: ระบบอยู่ในสถานะที่มีเสถียรภาพสูงสุด ปลอดภัย และมีเอกสารประกอบครบถ้วนตามมาตรฐานวิศวกรรมซอฟต์แวร์สมัยใหม่
