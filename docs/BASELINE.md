# PKH (Personal Knowledge Hub / Life OS) — Baseline Report

เอกสารนี้บันทึกผลการตรวจสอบสถานะและ Baseline จริงของโปรเจกต์ก่อนเริ่มการแก้ไขโค้ดใดๆ เพื่อใช้เป็นเกณฑ์อ้างอิง (Ground Truth) ตามสภาพจริง โดยไม่ดัดแปลงหรือตกแต่งผลลัพธ์

- **วันที่บันทึก**: 2026-10-21
- **โหมดการทดสอบ**: แยกสภาพแวดล้อมเด็ดขาด (Isolated Test Environment)
- **ตำแหน่ง DATA_DIR สำหรับทดสอบ**: `C:\PKH_Data_test` (ไม่แตะต้อง `DATA_DIR` จริง)

---

## 1. ข้อมูลสภาพแวดล้อม (Environment)

| รายการ | ค่าที่ตรวจพบ |
|---|---|
| **Operating System** | Windows 10/11 x64 (`win32 10.0.19044`) |
| **Node.js** | `v24.22.0` (Node 24) |
| **npm** | `11.19.1` |

---

## 2. ผลการรัน Backend (`apps/server`)

### 2.1 คำสั่ง: `cd apps/server && npm install`
- **สถานะ**: สำเร็จ (Exit Code 0)
- **สรุป**: ติดตั้ง/ตรวจสอบ 366 packages (0 vulnerabilities)

### 2.2 คำสั่ง: `cd apps/server && npm test`
- **เครื่องมือทดสอบ**: Vitest v5.0.5
- **ผลลัพธ์ภาพรวม**:
  - **Test Files**: ผ่าน 22 ไฟล์, **ไม่ผ่าน 1 ไฟล์** (รวม 23 ไฟล์)
  - **Tests**: ผ่าน 243 รายการ, **ไม่ผ่าน 8 รายการ** (รวม 251 รายการ)
  - **ระยะเวลาการรัน**: ~18.14 วินาที

#### ไฟล์ทดสอบที่ไม่ผ่าน: `src/backup.test.ts`
รายการ Test Case ที่ไม่ผ่าน (Failed Tests) ทั้ง 8 รายการ:
1. `src/backup.test.ts > backup > captures writes that are still only in the WAL file`
   - *สาเหตุ*: การจับสถานะ WAL file ก่อน checkpoint
2. `src/backup.test.ts > backup > encrypts backups and restore safety copies with authenticated AES-GCM`
   - *สาเหตุ*: โครงสร้างการเข้ารหัสและคีย์ของ backup
3. `src/backup.test.ts > backup > refuses plaintext backup creation when encryption is required but no key is configured`
   - *สาเหตุ*: ข้อความ error message คาดหวัง `/BACKUP_ENCRYPTION_KEY is required/` แต่ได้ `'BACKUP_ENCRYPTION_KEY_ID requires BACKUP_ENCRYPTION_KEY'`
4. `src/backup.test.ts > restore > refuses to restore while the database still has an open connection`
   - *สาเหตุ*: SqliteError: `file is not a database` ขณะพยายามอ่าน user จากการเชื่อมต่อที่ค้าง
5. `src/backup.test.ts > object snapshots > detects an object snapshot that changed after the backup was written`
   - *สาเหตุ*: Error message mismatch จาก per-file inventory
6. `src/backup.test.ts > encrypted object snapshots > encrypts every object and verifies the whole set with the key`
   - *สาเหตุ*: ความไม่ตรงกันของอ็อบเจกต์ manifest encryption metadata (`keyId` attribute)
7. `src/backup.test.ts > encrypted object snapshots > still verifies a legacy plaintext manifest without an inventory`
   - *สาเหตุ*: `BACKUP_ENCRYPTION_KEY_ID requires BACKUP_ENCRYPTION_KEY`
8. `src/backup.test.ts > encrypted object snapshots > keeps the restore safety copy encrypted and fully rollback-capable`
   - *สาเหตุ*: ความไม่ตรงกันของ `keyId` ใน `safetyManifest.objects.encryption`

### 2.3 คำสั่ง: `cd apps/server && npm run build`
- **เครื่องมือ**: `tsc -p tsconfig.json`
- **สถานะ**: สำเร็จ (Exit Code 0, **0 build errors**)

---

## 3. ผลการรัน Frontend (`apps/web`)

### 3.1 คำสั่ง: `cd apps/web && npm install`
- **สถานะ**: สำเร็จ (Exit Code 0)
- **สรุป**: ติดตั้ง/ตรวจสอบ 366 packages (0 vulnerabilities)

### 3.2 คำสั่ง: `cd apps/web && npm run lint`
- **เครื่องมือ**: `eslint .`
- **สถานะ**: **ไม่ผ่าน (Exit Code 1)**
- **สรุปปัญหา**: รวม 10 รายการ (**2 Errors**, **8 Warnings**)

#### รายการ Errors (2 รายการ):
1. `src/App.tsx:6731:61`: Unexpected any. Specify a different type (`@typescript-eslint/no-explicit-any`)
2. `src/App.tsx:6769:65`: Unexpected any. Specify a different type (`@typescript-eslint/no-explicit-any`)

#### รายการ Warnings (8 รายการ):
1. `src/App.tsx:864:6`: React Hook useEffect missing dependencies: `bookmarks.length`, `files.length`, `libraryItems.length`, `vaultItems.length` (`react-hooks/exhaustive-deps`)
2. `src/App.tsx:882:6`: React Hook useEffect missing dependency: `activeNote` (`react-hooks/exhaustive-deps`)
3. `src/App.tsx:900:6`: React Hook useEffect missing dependency: `activeBookmark` (`react-hooks/exhaustive-deps`)
4. `src/App.tsx:918:6`: React Hook useEffect missing dependency: `activeVault` (`react-hooks/exhaustive-deps`)
5. `src/App.tsx:936:6`: React Hook useEffect missing dependency: `activeLibrary` (`react-hooks/exhaustive-deps`)
6. `src/App.tsx:954:6`: React Hook useEffect missing dependency: `activeFile` (`react-hooks/exhaustive-deps`)
7. `src/main.tsx:19:9`: Unused eslint-disable directive (no problems reported from `no-console`)
8. `src/main.tsx:23:9`: Unused eslint-disable directive (no problems reported from `no-console`)

### 3.3 คำสั่ง: `cd apps/web && npm run build`
- **เครื่องมือ**: `tsc -b && vite build`
- **สถานะ**: สำเร็จ (Exit Code 0, **0 build errors**)
- **ขนาด Bundle ที่สร้างได้**:
  - `dist/index.html`: 1.29 kB
  - `dist/assets/index-DIZ87-uw.css`: 64.47 kB (gzip: 12.42 kB)
  - `dist/assets/index-jPiS1lC1.js`: 455.52 kB (gzip: 111.95 kB)

---

## 4. ผลการอ่านโค้ดจริง และทดสอบ Endpoints กับ DATA_DIR ชั่วคราว

### 4.1 รายชื่อ Endpoints จากการอ่านซอร์สโค้ดจริง
จากการอ่านโค้ด [`apps/server/src/index.ts`](file:///C:/Users/_phontakonnn/.gemini/antigravity/worktrees/Wed_Phontakon/analyze_codebase_and_bugs/apps/server/src/index.ts) และ [`apps/server/src/auth.ts`](file:///C:/Users/_phontakonnn/.gemini/antigravity/worktrees/Wed_Phontakon/analyze_codebase_and_bugs/apps/server/src/auth.ts):

| Method | Endpoint | สิทธิ์การเข้าถึง | การทำงาน / เงื่อนไข |
|---|---|---|---|
| `GET` | `/api/health` | สาธารณะ (Public) | ตรวจการเชื่อมต่อฐานข้อมูล (`SELECT 1`) คืนค่า `{ status: 'ok', db: 'ready', uptimeSeconds }` |
| `POST` | `/api/auth/login` | สาธารณะ (Public) | ตรวจ CSRF (`Origin` หรือ `X-PKH-Request: 1`) + ยืนยันรหัสผ่านด้วย `scrypt` + สร้างเซสชันในตาราง `sessions` + ส่ง `set-cookie: pkh_session=...; HttpOnly; SameSite=Strict` |
| `GET` | `/api/auth/me` | ต้องล็อกอิน (Protected) | อ่านเซสชันจาก cookie `pkh_session` คืนข้อมูล `{ user: { id, username } }` |
| `GET` | `/api/auth/sessions` | ต้องล็อกอิน (Protected) | แสดงรายการ session ของ user ทั้งหมด |
| `DELETE` | `/api/auth/sessions/:sessionId` | ต้องล็อกอิน (Protected) | ลบ/เพิกถอน session ที่ระบุ |
| `POST` | `/api/auth/sessions/revoke-others` | ต้องล็อกอิน (Protected) | เพิกถอน session อื่นทั้งหมดยกเว้นเซสชันปัจจุบัน |
| `POST` | `/api/auth/logout` | ต้องล็อกอิน (Protected) | เพิกถอนเซสชันปัจจุบันและเคลียร์ cookie |
| `POST` | `/api/auth/logout-all` | ต้องล็อกอิน (Protected) | เพิกถอนทุกเซสชันของ user |

### 4.2 ผลการทดสอบจริงกับ `DATA_DIR=C:\PKH_Data_test`
- **การเตรียมฐานข้อมูล**:
  - สร้างไดเรกทอรี `C:\PKH_Data_test\db`
  - รันไมเกรชันอัตโนมัติครบ 13 เวอร์ชั่นบน `knowledge.sqlite3`
  - สร้างผู้ใช้ทดสอบ: `admin_baseline` (Password: `BaselinePassword#2026!`) ผ่านฟังก์ชัน `bootstrapUser`
- **ผลการยิง Request ทดสอบจริง**:
  1. `GET http://127.0.0.1:3456/api/health`
     - **Status**: `200 OK`
     - **Body**:
       ```json
       {
         "status": "ok",
         "db": "ready",
         "uptimeSeconds": 0.72
       }
       ```
  2. `POST http://127.0.0.1:3456/api/auth/login`
     - **Headers ส่งไป**: `Origin: http://127.0.0.1:3456`, `X-PKH-Request: 1`, `Content-Type: application/json`
     - **Body ส่งไป**: `{ "username": "admin_baseline", "password": "BaselinePassword#2026!" }`
     - **Status**: `200 OK`
     - **Set-Cookie Header**: `pkh_session=...; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
     - **Body ที่ตอบกลับ**:
       ```json
       {
         "user": {
           "id": "325521dd-7ea5-4541-bcf7-e293edd2caaf",
           "username": "admin_baseline"
         }
       }
       ```
  3. `GET http://127.0.0.1:3456/api/auth/me`
     - **Headers ส่งไป**: `Cookie: pkh_session=...`
     - **Status**: `200 OK`
     - **Body ที่ตอบกลับ**:
       ```json
       {
         "user": {
           "id": "325521dd-7ea5-4541-bcf7-e293edd2caaf",
           "username": "admin_baseline"
         }
       }
       ```
  4. ปิดการเชื่อมต่อเซิร์ฟเวอร์และฐานข้อมูลทดสอบอย่างสมบูรณ์

---

## 5. สรุปรายการคำสั่งทั้งหมดที่ใช้สร้าง Baseline

```bash
# 1. ตรวจสอบเวอร์ชัน
node -v
npm -v

# 2. ฝั่ง Backend
cd apps/server
npm install
npm test
npm run build

# 3. ฝั่ง Frontend
cd apps/web
npm install
npm run lint
npm run build

# 4. ทดสอบ Dev Server และ Endpoints กับ DATA_DIR ชั่วคราว (C:\PKH_Data_test)
# ดำเนินการผ่าน npx tsx โดยเรียกใช้ openDataDatabase, bootstrapUser, createApp จริง
```
