# PKH / Life OS (Personal Knowledge Hub & Life Operating System)

> **Life OS** เป็นระบบจัดการชีวิต ข้อมูล และความรู้ส่วนบุคคลแบบรวมศูนย์ (Local-First Single-Tenant Platform) พัฒนาด้วยเทคโนโลยีโมเดิร์น Monorepo: **Fastify + SQLite 3 + React 18 + Vite + TypeScript** ออกแบบมาเพื่อความเป็นส่วนตัวสูงสุด (Privacy First) ความปลอดภัยระดับองค์กร และความเร็วระดับ Ultra-fast

---

## 🌟 ฟีเจอร์หลัก (Key Features)

- 📂 **หมวดหมู่ของฉัน (Custom Categories)**: สร้างและจัดการหมวดหมู่แบบลำดับชั้น (Hierarchical Categories) สามารถเชื่อมโยง (Link) เข้ากับ Entity ใดๆ ก็ได้ในระบบ (โน้ต, ไฟล์, ลิงก์, รายการ Vault, รายการ Library) พร้อมเปลี่ยนชื่อและสีได้อิสระ
- 📝 **บันทึกโน้ตและประวัติเวอร์ชัน (Notes with Version History)**:
  - รองรับ Rich Markdown Editor พร้อม Full-text Search ทั้งภาษาไทยและอังกฤษ (FTS5 + Trigram Index)
  - มีระบบบันทึก Version History อัตโนมัติทุกครั้งที่มีการแก้ไข สามารถเปรียบเทียบและคลิกกู้คืนเวอร์ชันเก่าได้ทันที
- 📁 **คลังไฟล์และสตรีมวิดีโอ (Files & Video Streaming)**:
  - จัดเก็บไฟล์ขนาดใหญ่ในรูปแบบ Sharded Object Storage
  - รองรับ HTTP 206 Partial Content สตรีมวิดีโอและเสียงได้อย่างราบรื่น
  - มี Media Lightbox ในตัวสำหรับดูภาพและวิดีโอแบบเต็มจอ
- 🔍 **ค้นหารวมด่วน (Global Command Palette `Ctrl+K` / `Cmd+K`)**:
  - กดคีย์ลัดเพื่อค้นหาข้ามทุกโมดูล (โน้ต, ไฟล์, ลิงก์, งาน, คลังข้อมูล, ประวัติ) และกระโดดไปยังเป้าหมายได้ในเสี้ยววินาที
- 🔐 **ตู้เซฟส่วนบุคคล (Personal Vault)**:
  - เก็บข้อมูลสำคัญ ลิขสิทธิ์ซอฟต์แวร์ ข้อมูลบัญชี และเอกสารสำคัญ พร้อมปุ่ม Copy ข้อมูลสะดวกรวดเร็ว
- 📚 **ห้องสมุดความรู้ (Knowledge Library)**:
  - จัดระเบียบหนังสือ บทความ เอกสารวิจัย พร้อมแท็กและสถานะการอ่าน
- 🎯 **งาน โครงการ เป้าหมาย และนิสัย (Tasks, Projects, Goals & Habits)**:
  - ติดตามความคืบหน้ารายโครงการและเป้าหมายระยะยาว
  - เช็กอินนิสัยประจำวัน (Habit Tracker) พร้อมปฏิทินบันทึกความต่อเนื่อง (Streak)
  - วางแผนตารางเวลาประจำวัน (Daily Timeblocking)
- 📥 **กล่องดักเก็บความคิด (Inbox) และ 🗑️ ถังขยะ (Trash Bin)**:
  - บันทึกไอเดียด่วนก่อน Triage ไปเป็น Task, Project, Bookmark หรือ Reminder
  - ถังขยะรองรับการกู้คืน (Restore) หรือล้างถาวรด้วย Permanent Delete Modal เพื่อความปลอดภัย

---

## 🚀 ติดตั้งและเริ่มต้นใช้งานภายใน 30 นาที (Quick Start)

### ข้อกำหนดของระบบ (Prerequisites)
- **Node.js**: เวอร์ชัน 24.x LTS ขึ้นไป
- **npm**: เวอร์ชัน 10.x ขึ้นไป
- **ระบบปฏิบัติการ**: Windows 10/11, macOS หรือ Linux

### ขั้นตอนที่ 1: ติดตั้ง Dependencies
```powershell
# ติดตั้งแพ็กเกจทั้งหมดใน Monorepo
npm install
```

### ขั้นตอนที่ 2: สร้างผู้ดูแลระบบคนแรก (Bootstrap Admin)
```powershell
# รันคำสั่งสร้างผู้ใช้และรหัสผ่านเริ่มต้น (จะจัดเก็บใน DATA_DIR)
npm run bootstrap:admin
```
> ระบบจะสร้างบัญชีผู้ใช้สำหรับเข้าสู่ระบบ และสร้างไดเรกทอรีข้อมูลเริ่มต้นที่ `C:\PKH_Data` (หรือตามค่าที่ระบุใน `$env:DATA_DIR`)

### ขั้นตอนที่ 3: เปิดใช้งานในโหมด Development
เปิดสองหน้าต่าง Terminal:
```powershell
# Terminal 1: รัน Backend Server (พอร์ต 3001)
npm run dev:server

# Terminal 2: รัน Frontend Web (พอร์ต 5173)
npm run dev:web
```
เปิดเบราว์เซอร์ไปที่ `http://localhost:5173` เพื่อเริ่มใช้งาน

### ขั้นตอนที่ 4: การรันในโหมด Production
```powershell
# 1. Build โค้ดทั้งระบบ
npm run build:server
npm run build:web

# 2. เริ่มต้นรันเซิร์ฟเวอร์
npm run start:server
```
เข้าใช้งานผ่าน `http://127.0.0.1:3001`

---

## 🛡️ สถาปัตยกรรมความปลอดภัยและการเข้าถึงจากทุกที่ (ฟรี)

PKH / Life OS ออกแบบมาโดยยึดหลัก **Zero Public Exposure**:
1. **Loopback Only (`127.0.0.1`)**: เซิร์ฟเวอร์รับการเชื่อมต่อเฉพาะภายในเครื่อง ไม่เปิดพอร์ตออกสู่เราเตอร์ ไม่ต้องทำ Port Forwarding
2. **Tailscale Serve (HTTPS ฟรี)**:
   - ใช้ความสามารถของ Tailscale เพื่อสร้างเส้นทางเชื่อมต่อเสมือนแบบเข้ารหัส (Encrypted WireGuard Mesh)
   - รันคำสั่งเดียวบนเครื่องโฮสต์:
     ```powershell
     tailscale serve --bg https / http://127.0.0.1:3001
     ```
   - เข้าใช้งานจากมือถือ (iOS / Android) ผ่านโดเมนส่วนตัว เช่น `https://my-pc.tailnet.ts.net` ด้วย HTTPS ใบรับรอง Let's Encrypt อัตโนมัติ โดยมีเพียงอุปกรณ์ของคุณเท่านั้นที่เข้าถึงได้
   - ⚠️ **คำเตือน**: ห้ามใช้ `tailscale funnel` เพราะจะเปิดระบบออกสู่อินเทอร์เน็ตสาธารณะ

---

## 💾 ระบบสำรองและกู้คืนข้อมูล (Encrypted Backup & Restore)

ระบบมาพร้อม CLI สำหรับสำรองและกู้คืนข้อมูลแบบครบวงจร (ฐานข้อมูล SQLite + ไฟล์แนบทั้งหมดที่เข้ารหัสด้วย AES-256-GCM):

```powershell
# 1. สร้าง Backup ชุดใหม่พร้อมตรวจสอบความสมบูรณ์
npm run backup:create

# 2. ตรวจสอบความถูกต้องของไฟล์สำรอง (Integrity & Checksum)
npm run backup:verify -- "C:\PKH_Data\backups\<ชื่อไฟล์>.sqlite3"

# 3. กู้คืนข้อมูล (Disaster Recovery)
npm run backup:restore -- "C:\PKH_Data\backups\<ชื่อไฟล์>.sqlite3" --yes
```

### การตั้งค่างานสำรองข้อมูลอัตโนมัติประจำวัน (Windows Task Scheduler)
รัน PowerShell (สิทธิ์ Administrator) เพื่อลงทะเบียนงานสำรองข้อมูลอัตโนมัติไปยังไดรฟ์ภายนอก:
```powershell
.\scripts\register-backup-task.ps1 -DataDir 'C:\PKH_Data' -BackupDir 'D:\PKH_Backups' -Time '02:00'
```

---

## 🧪 การทดสอบคุณภาพ (Quality & Test Suites)

โปรเจกต์มีชุดทดสอบครอบคลุมทุกระดับเพื่อความเสถียรสูงสุด:

| ชุดทดสอบ | คำสั่ง | รายละเอียด |
| :--- | :--- | :--- |
| **Server Unit Tests** | `npm test` | ทดสอบ 255 รายการ (Auth, Database, Storage, Encryption, Search, Versioning) |
| **Frontend Linter** | `npm run lint` | ตรวจสอบคุณภาพโค้ด TypeScript และ React Hooks ด้วย ESLint |
| **Frontend Build** | `npm run build:web` | ตรวจสอบ Typecheck และ Build Vite พร้อม Code Splitting |
| **E2E Automation** | `npm run test:e2e` | ทดสอบ 6 สถานการณ์จริงผ่าน Playwright (Auth, CRUD, 5MB Upload, Video Streaming, CSP, Throttling) |

---

## 📂 โครงสร้างไดเรกทอรีของโปรเจกต์

```
wed-phontakon/
├── apps/
│   ├── server/           # Fastify backend, SQLite schema, migrations, backup engine
│   │   ├── src/          # TypeScript source code
│   │   └── package.json
│   └── web/              # React frontend, Tailwind/CSS tokens, Vite
│       ├── src/
│       │   ├── components/# Shared components (Sidebar, Topbar, Modals, Attachments)
│       │   ├── features/  # 15 Domain Feature Views (Notes, Vault, Tasks, etc.)
│       │   └── lib/       # Constants, formatters, tokens
│       └── e2e/          # Playwright E2E test specs
├── docs/                 # เอกสารสถาปัตยกรรม การติดตั้ง การซ้อมกู้คืน และการดูแลรักษา
│   ├── ARCHITECTURE.md   # ภาพรวมสถาปัตยกรรมระบบ
│   ├── DEPLOY.md         # คู่มือการติดตั้ง Production และ Tailscale Serve
│   ├── MAINTENANCE.md    # คู่มือการดูแลรักษาระบบอย่างยั่งยืน
│   ├── BACKUP_DRILL.md   # ผลการทดสอบซ้อมกู้คืนข้อมูลจริง 100%
│   └── TECH_DEBT.md      # รายการหนี้ทางเทคนิคและลำดับความสำคัญ
├── scripts/              # สคริปต์อัตโนมัติสำหรับ Windows Task Scheduler และ Production
├── ecosystem.config.js   # การตั้งค่า PM2 Production
└── package.json          # Root Monorepo configuration
```

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้เผยแพร่ภายใต้สัญญาอนุญาต [MIT License](LICENSE)
