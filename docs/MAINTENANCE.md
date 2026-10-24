# คู่มือการดูแลรักษาระบบอย่างยั่งยืน (System Maintenance Guide)

> **เอกสารประวัติศาสตร์ (historical):** Fastify/SQLite backend และสคริปต์ที่อ้างถึงในเอกสารนี้
> ถูกลบออกจากโปรเจกต์แล้ว (ดู `docs/CLEANUP_LOG.md` และ `docs/DECISIONS.md`) ปัจจุบันระบบเป็น
> PWA ที่ทำงานบน Firebase ทั้งหมด — คำสั่งอย่าง `npm run dev:server`, `backup:create` หรือ
> `bootstrap:admin` ไม่มีอยู่แล้ว ใช้ `npm run dev` และ `docs/SECURITY.md` แทน


> **PKH / Life OS** ออกแบบมาเพื่อให้ผู้ใช้คนเดียวสามารถดูแลรักษาระบบ (Single-Operator Maintenance) ได้อย่างมั่นใจ ปลอดภัย และไม่เสียเวลา โดยมีคำสั่งที่พร้อมคัดลอกไปรันใน PowerShell หรือ Terminal ได้ทันที

---

## สรุปปฏิทินกิจวัตรการดูแลรักษา (Maintenance Schedule)

| ความถี่ | ภารกิจหลัก | เวลาที่ใช้ | เครื่องมือ/คำสั่ง |
| :--- | :--- | :---: | :--- |
| **รายวัน (Daily)** | ตรวจสอบผลการสำรองข้อมูลอัตโนมัติ (Automated Backup) | 30 วินาที | Windows Task Scheduler / `backup.log` |
| **รายสัปดาห์ (Weekly)** | ตรวจสอบพื้นที่ดิสก์คงเหลือ + ทดสอบการเข้าสู่ระบบ 1 ครั้ง | 1 นาที | `/api/health` + Web Browser |
| **รายเดือน (Monthly)** | ตรวจสอบไฟล์สำรอง (`verify`) + ซ้อมกู้คืนลงโฟลเดอร์ทดสอบ | 5 นาที | `backup:verify` + `backup:restore` (ชั่วคราว) |
| **ราย 3 เดือน (Quarterly)**| ตรวจสอบความปลอดภัย Library + รัน Full Regression Tests | 10 นาที | `npm audit` + `npm test` + `npm run test:e2e` |

---

## 1. กิจวัตรรายวัน (Daily Routine) — ตรวจสอบการสำรองข้อมูล

ระบบสำรองข้อมูลอัตโนมัติจะทำงานทุกคืนผ่าน Windows Task Scheduler (เช่น เวลา 02:00 น.)

### คำสั่งตรวจสอบสถานะงาน (PowerShell):
```powershell
# ตรวจสอบว่างานสำรองข้อมูลล่าสุดรันสำเร็จหรือไม่ (LastTaskResult = 0 คือผ่าน)
Get-ScheduledTask -TaskName "PKH Backup" | Get-ScheduledTaskInfo
```

### คำสั่งตรวจเช็กล็อกการสำรองข้อมูลล่าสุด:
```powershell
# ดูบันทึกล่าสุด 20 บรรทัด
Get-Content "C:\PKH_Data\logs\backup.log" -Tail 20
```

> **สิ่งที่ต้องสังเกต**: ต้องพบบรรทัด `backup end rc=0` หากพบ `rc` เป็นเลขอื่น หรือมีข้อความแจ้งเตือน `preflight failed` ให้ตรวจสอบว่าไดรฟ์ปลายทาง (External Drive) เสียบอยู่และมีพื้นที่ว่างเพียงพอ

---

## 2. กิจวัตรรายสัปดาห์ (Weekly Routine) — ตรวจพื้นที่ดิสก์และความพร้อมใช้งาน

### 2.1 ตรวจสอบพื้นที่ดิสก์และสถานะเซิร์ฟเวอร์
สามารถยิงคำสั่งตรวจสอบผ่าน PowerShell:
```powershell
# ตรวจสอบสถานะระบบและพื้นที่ว่างของดิสก์
Invoke-RestMethod http://127.0.0.1:3001/api/health
```
**ตัวอย่างการตอบกลับ**:
```json
{
  "status": "ok",
  "disk": {
    "totalBytes": 1000204886016,
    "freeBytes": 806294884352,
    "usedBytes": 193909999616,
    "usedPercent": 19.39
  }
}
```

> **เกณฑ์เตือนภัย**: หาก `usedPercent` สูงเกิน **90%** เว็บแอปจะมีแถบแบนเนอร์สีส้มแจ้งเตือนบนหน้าจอ ให้พิจารณาลบไฟล์เก่าในถังขยะ หรือย้ายไฟล์สำรองชุดเก่าไปเก็บในที่เก็บข้อมูลถาวร

### 2.2 ทดสอบเข้าสู่ระบบ (Sanity Login)
- เปิดเบราว์เซอร์ไปที่ `http://127.0.0.1:3001` (หรือผ่าน Tailscale HTTPS บนมือถือ)
- ทดสอบพิมพ์โน้ตสั้นๆ หรือตรวจสอบหน้า Dashboard เพื่อยืนยันว่า Session และฐานข้อมูลตอบสนองได้รวดเร็วตามปกติ

---

## 3. กิจวัตรรายเดือน (Monthly Routine) — ตรวจสอบและซ้อมกู้คืนข้อมูล

การสำรองข้อมูลที่ดีต้องพิสูจน์ได้ว่า "กู้คืนได้จริง" ทุกเดือนควรสุ่มตรวจสอบไฟล์สำรองล่าสุดและซ้อมกู้คืนลงโฟลเดอร์ทดสอบชั่วคราว:

### 3.1 สุ่มตรวจสอบไฟล์สำรองล่าสุด (Verify)
```powershell
# ตรวจสอบความถูกต้องของ Schema, SQLite Integrity และ AES-256-GCM Objects
npm run backup:verify -- "D:\PKH_Backups\<ชื่อไฟล์ล่าสุด>.sqlite3"
```
หากผลลัพธ์แสดง `Backup verified: ... integrity: ok` แสดงว่าไฟล์สำรองสมบูรณ์ 100%

### 3.2 ซ้อมกู้คืนลงโฟลเดอร์ทดสอบชั่วคราว (Test Restore Drill)
> ⚠️ **กฎเหล็ก**: ห้ามระบุปลายทางเป็น `C:\PKH_Data` เด็ดขาด ให้ใช้โฟลเดอร์ชั่วคราวใหม่เสมอ

```powershell
# 1. กำหนดโฟลเดอร์ทดสอบชั่วคราว
$testDir = "C:\PKH_Restore_Test_$(Get-Date -Format 'yyyyMMdd')"

# 2. สั่งกู้คืนลงโฟลเดอร์ทดสอบ
$env:DATA_DIR = $testDir
npm run backup:restore -- "D:\PKH_Backups\<ชื่อไฟล์ล่าสุด>.sqlite3" --yes

# 3. ตรวจสอบว่ามีไฟล์ฐานข้อมูลและวัตถุถูกกู้คืนออกมาครบถ้วน
Get-ChildItem -Recurse $testDir

# 4. ลบโฟลเดอร์ทดสอบชั่วคราวทิ้งเมื่อตรวจสอบเสร็จ
Remove-Item -Recurse -Force $testDir
```

---

## 4. กิจวัตรราย 3 เดือน (Quarterly Routine) — อัปเดตและตรวจความปลอดภัย

เพื่อป้องกันช่องโหว่ความปลอดภัยของโมดูลภายนอก (Dependencies) และรักษาประสิทธิภาพในระยะยาว:

### 4.1 ตรวจสอบและแก้ไขช่องโหว่ Dependencies
```powershell
# ตรวจสอบช่องโหว่ความปลอดภัย
npm audit

# แก้ไขช่องโหว่แบบปลอดภัย (Semantic Versioning)
npm audit fix
```

### 4.2 ตรวจสอบการอัปเดตแพ็กเกจ
```powershell
npm outdated
```

### 4.3 รัน Full Regression Test Suite
รันทุกการทดสอบทั้งระบบเพื่อการันตีว่าไม่มีฟังก์ชันใดถดถอย (No Regression):
```powershell
# 1. รัน Server Unit Tests ทั้ง 255 รายการ
npm --prefix apps/server test

# 2. ตรวจสอบ Lint และ Build ฝั่ง Frontend
npm --prefix apps/web run lint
npm --prefix apps/web run build

# 3. รันชุดทดสอบ Playwright E2E ทั้งหมด
npm run test:e2e
```

---

## 5. คู่มือแก้ปัญหาฉุกเฉิน (Troubleshooting Guide)

### ปัญหาที่ 1: เซิร์ฟเวอร์ไม่เริ่มทำงาน (Port Collision หรือ Process ค้าง)
- **อาการ**: เปิดเว็บไม่ได้ หรือรัน `start:server` แล้วขึ้น `EADDRINUSE: address already in use 127.0.0.1:3001`
- **วิธีแก้**:
  ```powershell
  # ตรวจสอบ PID ที่ถือครองพอร์ต 3001
  netstat -ano | findstr :3001
  # สั่งหยุด process ค้างผ่าน PM2 หรือ Taskkill
  pm2 restart life-os
  # หรือถ้าไม่ได้ใช้ PM2
  taskkill /PID <PID_NUMBER> /F
  ```

### ปัญหาที่ 2: งานสำรองข้อมูลอัตโนมัติแจ้งเตือนติด Lock (`backup.lock`)
- **อาการ**: ใน `backup.log` ขึ้นว่า `another backup appears to be running (lock: backup.lock)`
- **สาเหตุ**: เกิดจากเครื่องดับหรือถูกปิดกระทันหันขณะกำลังสำรองข้อมูล
- **วิธีแก้**:
  1. ยืนยันว่าไม่มีโปรเซส `node` กำลังรัน backup ค้างอยู่
  2. ลบโฟลเดอร์ lock ด้วยตนเอง:
     ```powershell
     Remove-Item "C:\PKH_Data\logs\backup.lock" -Recurse -Force
     ```
  3. สั่งทดสอบรัน backup อีกครั้งผ่าน Task Scheduler:
     ```powershell
     Start-ScheduledTask -TaskName "PKH Backup"
     ```

### ปัญหาที่ 3: พื้นที่ดิสก์ใกล้เต็ม (`usedPercent > 90%`)
- **วิธีแก้**:
  1. เปิดหน้าเว็บ Life OS ไปที่หัวข้อ **ถังขยะ (Trash)** แล้วกด "ล้างถังขยะถาวร"
  2. รันสคริปต์กักกันไฟล์ขยะที่ไม่มีความเชื่อมโยงในระบบ:
     ```powershell
     npm run storage:check
     npm run storage:quarantine
     ```
  3. ลบไฟล์สำรองชุดเก่าเกิน 30 วันในไดรฟ์สำรอง (ระบบตั้งค่ารักษาไว้ล่าสุด 14 ชุดโดยอัตโนมัติ)
