# คู่มือการติดตั้งและดูแลระบบในสภาพแวดล้อมจริง (Production Deployment Guide)

> **เอกสารประวัติศาสตร์ (historical):** Fastify/SQLite backend และสคริปต์ที่อ้างถึงในเอกสารนี้
> ถูกลบออกจากโปรเจกต์แล้ว (ดู `docs/CLEANUP_LOG.md` และ `docs/DECISIONS.md`) ปัจจุบันระบบเป็น
> PWA ที่ทำงานบน Firebase ทั้งหมด — คำสั่งอย่าง `npm run dev:server`, `backup:create` หรือ
> `bootstrap:admin` ไม่มีอยู่แล้ว ใช้ `npm run dev` และ `docs/SECURITY.md` แทน


> **PKH / Life OS** ออกแบบมาเพื่อให้ทำงานแบบ Single-Tenant บนเครื่องส่วนตัว (Self-Hosted on Windows) โดยเน้นความปลอดภัยสูงสุด ความเสถียร และสามารถเข้าถึงจากมือถือได้จากทุกที่แบบปลอดภัย 100% ฟรี ไม่มีค่าใช้จ่าย และไม่ต้องเปิดพอร์ตเราเตอร์ (No Port Forwarding)

---

## 1. ภาพรวมสถาปัตยกรรมความปลอดภัย (Security Architecture)

```
[ อินเทอร์เน็ตภายนอก (Internet) ]
          │ (บล็อกทั้งหมด — ไม่เปิด Router Port Forwarding / ห้ามใช้ Funnel)
          ▼
[ Tailscale Encrypted WireGuard Mesh Network (ฟรี Personal Tier) ]
          │
  ┌───────┴────────────────────────┐
  ▼                                ▼
[ Mobile (iOS / Android) ]       [ Windows Host (PC / Laptop) ]
  Tailscale App                    Tailscale Serve (HTTPS :443)
  https://my-pc.tailnet.ts.net     ├─ Auto Let's Encrypt TLS Certificate
                                   └─ Reverse Proxy ไปยัง http://127.0.0.1:3001
                                            │ (Loopback Only)
                                            ▼
                                   [ Node.js Fastify Backend ]
                                   ├─ ตรวจสอบ Origin / CSRF
                                   ├─ ออกคุกกี้ Secure & HttpOnly
                                   └─ SQLite 3 + Object Storage (DATA_DIR)
```

- **Loopback Only (`127.0.0.1`)**: ตัวเซิร์ฟเวอร์เปิดรับการเชื่อมต่อเฉพาะภายในเครื่องเท่านั้น ไม่เปิด `0.0.0.0` สู่เครือข่ายภายนอก
- **Tailscale Serve**: ให้บริการ HTTPS โดยรับรองใบรับรอง TLS แบบอัตโนมัติ ใช้งานได้เฉพาะอุปกรณ์ที่ล็อกอินอยู่ใน Tailnet เดียวกันเท่านั้น ปลอดภัยจากการสแกนพอร์ตบนอินเทอร์เน็ต
- **Disk Monitoring**: ระบบตรวจจับพื้นที่ว่างของดิสก์อัตโนมัติ แจ้งเตือนบนหน้าจอทันทีเมื่อพื้นที่ใกล้เต็ม (> 90%)

---

## 2. ขั้นตอนการ Build โปรเจกต์

เปิด PowerShell หรือ Terminal ในโฟลเดอร์รากของโปรเจกต์:

```powershell
# 1. ติดตั้ง Dependencies (ถ้ายังไม่ได้ติดตั้ง)
npm install

# 2. Build โค้ดฝั่ง Backend Server
npm run build:server

# 3. Build โค้ดฝั่ง Frontend Web
npm run build:web
```

---

## 3. การตั้งค่า PM2 Service ให้เปิดอัตโนมัติตอนเปิดเครื่อง (Reboot Recovery)

เพื่อให้ PKH / Life OS รันเป็น Background Service และฟื้นฟูตัวเองอัตโนมัติเมื่อรีสตาร์ตคอมพิวเตอร์:

### 3.1 ติดตั้ง PM2 ทั่วทั้งระบบ
```powershell
npm install -g pm2
```

### 3.2 ตรวจสอบและปรับแต่ง `ecosystem.config.js`
ไฟล์คอนฟิกถูกตั้งค่าไว้ที่ `127.0.0.1:3001` โดยค่าเริ่มต้น หากใช้งาน Tailscale สามารถระบุ `EXPECTED_ORIGIN` ได้:
```javascript
module.exports = {
  apps: [{
    name: 'life-os',
    script: './apps/server/dist/index.js',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 3001,
      DATA_DIR: 'C:\\PKH_Data',
      EXPECTED_ORIGIN: 'https://<your-machine-name>.<your-tailnet>.ts.net'
    },
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 3.3 เริ่มต้น Service และบันทึกสถานะ
```powershell
# รันระบบด้วย PM2
pm2 start ecosystem.config.js

# ตรวจสอบสถานะการทำงาน
pm2 status

# บันทึกรายการ Process ปัจจุบัน
pm2 save
```

### 3.4 ตั้งค่าให้ PM2 ทำงานเป็น Windows Service
ติดตั้งแพ็กเกจ `pm2-windows-service` (รันในสิทธิ์ Administrator):
```powershell
npm install -g pm2-windows-service
pm2-service-install
```
> ระบบจะถามคอนฟิก ให้กด Enter ใช้ค่า Default ระบบจะติดตั้งเป็น Windows Service ทำงานอัตโนมัติตอนบูตเครื่องโดยไม่ต้องล็อกอินค้างไว้

---

## 4. การเปิดใช้งาน Tailscale Serve สำหรับเข้าถึงจากมือถือ (ฟรี)

> ⚠️ **คำเตือนความปลอดภัย**:  
> ให้ใช้คำสั่ง `tailscale serve` เท่านั้น **ห้ามใช้ `tailscale funnel` เด็ดขาด** เพราะ Tailscale Funnel จะเปิดเว็บออกสู่อินเทอร์เน็ตสาธารณะ ในขณะที่ Tailscale Serve จะเปิดให้เข้าถึงได้เฉพาะอุปกรณ์ของคุณในบัญชี Tailscale เดียวกันเท่านั้น

### 4.1 ติดตั้ง Tailscale บนเครื่อง Windows
1. ดาวน์โหลดและติดตั้ง [Tailscale for Windows](https://tailscale.com/download)
2. เข้าสู่ระบบด้วยบัญชีของคุณ (เช่น Google หรือ GitHub)
3. ตรวจสอบชื่อเครื่อง เช่น `my-pc.tail1234.ts.net`

### 4.2 เปิดการ Forward ผ่าน Tailscale Serve
รันคำสั่งใน PowerShell (สิทธิ์ Administrator):
```powershell
tailscale serve --bg https / http://127.0.0.1:3001
```
คำสั่งนี้จะ:
- ผูก HTTPS พอร์ต 443 ภายใต้โดเมน Tailscale ของคุณ
- ดึงและต่ออายุใบรับรอง TLS (Let's Encrypt) ให้อัตโนมัติ
- ส่งต่อทราฟฟิกไปยัง `127.0.0.1:3001`
- รองรับ Header `X-Forwarded-Host` และ `X-Forwarded-Proto` ทำให้ระบบออกคุกกี้ `Secure` และตรวจสอบ CSRF ได้อย่างสมบูรณ์แบบ

### 4.3 เชื่อมต่อจากมือถือ
1. ติดตั้งแอป **Tailscale** บน iPhone (App Store) หรือ Android (Google Play)
2. ล็อกอินด้วยบัญชีเดียวกันกับเครื่อง PC
3. เปิดเบราว์เซอร์บนมือถือแล้วเข้า URL:
   `https://my-pc.tail1234.ts.net`
4. คุณสามารถเข้าใช้งาน Life OS ได้ทันที เสมือนใช้งานบนเครื่องคอมพิวเตอร์

---

## 5. การตั้งค่าระบบสำรองข้อมูลอัตโนมัติทุกวัน (Task Scheduler)

ตามมาตรฐานความปลอดภัย (BK-08) โฟลเดอร์สำรองข้อมูลควรอยู่บน External Drive หรือไดรฟ์คนละตัวกับ `DATA_DIR`

### 5.1 รันสคริปต์ลงทะเบียนงานอัตโนมัติ
รัน PowerShell (สิทธิ์ Administrator):
```powershell
# ตัวอย่าง: สำรองข้อมูลเวลา 02:00 น. ไปยังไดรฟ์ D:\
.\scripts\register-backup-task.ps1 -DataDir 'C:\PKH_Data' -BackupDir 'D:\PKH_Backups' -Time '02:00'
```

### 5.2 ตรวจสอบสถานะการสำรองข้อมูล
- สามารถทดสอบสั่งรันทันทีได้ด้วยคำสั่ง:
  ```powershell
  Start-ScheduledTask -TaskName "PKH Backup"
  ```
- ตรวจสอบประวัติการทำงานได้จากไฟล์ล็อก:
  ```powershell
  Get-Content "C:\PKH_Data\logs\backup.log" -Tail 20
  ```

---

## 6. การดูแลรักษาระบบและการแจ้งเตือน (Monitoring & Maintenance)

1. **การตรวจสอบสถานะระบบ (Health Check)**:
   สามารถยิงทดสอบได้ที่:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:3001/api/health
   ```
   จะได้รับข้อมูลสถานะระบบ เวอร์ชัน และข้อมูลพื้นที่ว่างดิสก์ (`statfs`)
2. **การแจ้งเตือนพื้นที่ดิสก์ (Disk Space Warning Banner)**:
   เว็บแอปจะตรวจเช็กพื้นที่ดิสก์ทุกครั้งที่เปิดหน้าจอและทุก 60 วินาที หากดิสก์ที่เก็บข้อมูลมีพื้นที่ใช้งานเกิน **90%** ระบบจะแสดงแถบแบนเนอร์แจ้งเตือนสีส้มเด่นชัดที่ด้านบนของจอทันที เพื่อป้องกันปัญหาฐานข้อมูลเสียหายจากดิสก์เต็ม
3. **การทดสอบกู้คืนข้อมูล (Recovery Drill)**:
   ควรอ่านเอกสาร `docs/BACKUP_DRILL.md` เพื่อทำความเข้าใจขั้นตอนการกู้คืนข้อมูลด้วยคำสั่ง `npm run backup:restore` ในกรณีที่เกิดเหตุฉุกเฉิน
