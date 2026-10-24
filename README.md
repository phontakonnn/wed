# PKH / Life OS (Personal Knowledge Hub & Life Operating System)

> **Life OS** คือระบบจัดการชีวิต ข้อมูล และความรู้ส่วนบุคคลแบบรวมศูนย์ (Second Brain) ที่ทำงานเป็น **PWA แบบ offline-first** ทั้งหมดอยู่บนเบราว์เซอร์: **React 19 + TypeScript + Vite 8 + Firebase (Auth / Firestore / Storage) + TanStack Query**
>
> ไม่มี backend server ของตัวเอง — ข้อมูลถูกเก็บใน Firestore ใต้บัญชีของคุณ อ่าน/เขียนผ่าน Security Rules และแอปยังใช้งานต่อได้แม้ไม่มีเน็ต

---

## 🌟 ฟีเจอร์หลัก (Key Features)

- 📂 **หมวดหมู่ของฉัน (Custom Categories)**: หมวดหมู่แบบลำดับชั้น เชื่อมโยงได้กับทุก Entity (โน้ต, ไฟล์, ลิงก์, Vault, Library) เปลี่ยนชื่อและสีได้อิสระ
- 📝 **บันทึกโน้ตและประวัติเวอร์ชัน (Notes with Version History)**: Markdown editor พร้อมค้นหาภาษาไทย/อังกฤษ บันทึกอัตโนมัติ (debounce) และกู้คืนเวอร์ชันเก่าได้
- 📁 **คลังไฟล์ (Files)**: อัปโหลดไป Firebase Storage พร้อม Media Lightbox ดูภาพ/วิดีโอเต็มจอ
- 🔍 **ค้นหารวมด่วน (Command Palette `Ctrl+K` / `Cmd+K`)**: ค้นหาข้ามทุกโมดูลและกระโดดไปยังเป้าหมายทันที
- 🔐 **ตู้เซฟส่วนบุคคล (Personal Vault)** และ 📚 **ห้องสมุดความรู้ (Knowledge Library)**
- 🎯 **งาน โครงการ เป้าหมาย และนิสัย (Tasks, Projects, Goals & Habits)**: Habit tracker พร้อม streak, ตารางเวลาแบบ timeblock
- 📥 **กล่องดักเก็บความคิด (Inbox)** และ 🗑️ **ถังขยะ (Trash)** ที่กู้คืนได้

---

## 🚀 เริ่มต้นใช้งาน (Quick Start)

### ข้อกำหนด
- **Node.js** 24.x LTS ขึ้นไป, **npm** 10.x ขึ้นไป
- โปรเจกต์ Firebase ที่เปิดใช้ **Authentication (Email/Password)**, **Firestore** และ **Storage**

### 1) ติดตั้ง dependencies
```powershell
npm install
```

### 2) ตั้งค่า Firebase
คัดลอก `.env.example` เป็น `.env.local` แล้วเติมค่าจาก Firebase Console (Project settings → Your apps):

```powershell
Copy-Item .env.example .env.local
```

### 3) รันโหมด development
```powershell
npm run dev          # http://127.0.0.1:5173
```

### 4) Build สำหรับ production
```powershell
npm run release      # typecheck + lint + test + build + ตรวจ bundle budget
```

ผลลัพธ์อยู่ที่ `apps/web/dist` — deploy ขึ้น Firebase Hosting ด้วย `npm run deploy:hosting`

---

## 🧪 คุณภาพโค้ด (Quality Gates)

| ชุดทดสอบ | คำสั่ง | รายละเอียด |
| :--- | :--- | :--- |
| **Typecheck** | `npm run typecheck` | `tsc -b` ทุก project reference |
| **Linter** | `npm run lint` | ESLint flat config + React Hooks / React Compiler rules |
| **Unit tests** | `npm test` | Vitest (validation, URL safety, search, scheduler, PWA) |
| **Build + budget** | `npm run build` แล้ว `npm run check:budget` | first-load JS ต้องไม่เกินงบใน `bundle-budget.json` |
| **Security Rules** | `npm run test:rules` | Firestore/Storage rules ผ่าน Firebase Emulator (ต้องมี JDK + Firebase CLI) |
| **Mobile audit** | `npm run audit:mobile` | วัด layout ที่ขนาดมือถือด้วย Playwright |

ทุกคำสั่งข้างต้นถูกรันซ้ำโดย `.githooks/pre-push` และ CI (`.github/workflows/ci.yml`)

---

## 📂 โครงสร้างโปรเจกต์

```
wed-phontakon/
├── apps/web/
│   ├── src/
│   │   ├── components/   # Shared UI (Sidebar, Topbar, Modals, ErrorBoundary)
│   │   ├── features/     # Feature views (notes, bookmarks, settings, admin, ...)
│   │   ├── lib/          # Firebase engine, query client, validation, PWA helpers
│   │   └── styles/       # Design tokens และ CSS ของแต่ละ view
│   ├── tests/rules/      # Firestore/Storage rules unit tests
│   └── e2e/              # mobile-audit.mjs
├── docs/                 # สถาปัตยกรรม ความปลอดภัย การตัดสินใจ และบันทึกขนาด bundle
├── scripts/              # check-bundle-budget.mjs, analyze-stats.mjs
├── firestore.rules       # Security Rules ฝั่ง Firestore
├── storage.rules         # Security Rules ฝั่ง Storage
├── firebase.json         # Hosting + headers/CSP + emulator ports
└── package.json          # npm workspace (apps/web)
```

---

## 🔐 ความเป็นส่วนตัว

- ข้อมูลทุกอย่างอยู่ใน Firestore ใต้ `users/{uid}/...` — ไม่มีใครอ่านได้นอกจากเจ้าของตาม Security Rules
- ไม่มี analytics ของบุคคลที่สาม (Firebase Analytics เป็นแบบ optional และโหลดหลัง first paint)
- ดูรายละเอียด threat model และ CSP ที่ [`docs/SECURITY.md`](docs/SECURITY.md)

---

## 📄 ใบอนุญาต (License)

เผยแพร่ภายใต้สัญญาอนุญาต [MIT License](LICENSE)
