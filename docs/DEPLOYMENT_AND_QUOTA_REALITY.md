# คู่มือการนำระบบขึ้นออนไลน์จริง สถาปัตยกรรมซิงก์ข้ามอุปกรณ์ และการประเมินโควตา/ค่าใช้จ่ายจริง
## (Deployment Guide, Multi-Device Sync Architecture & Honest Quota Reality)

เอกสารฉบับนี้จัดทำขึ้นสำหรับเว็บแอปพลิเคชัน **PKH / Life OS ("สมองของคุณ")** เพื่อเป็นแนวทางปฏิบัติจริงในการนำระบบขึ้นสู่คลาวด์หรือเซิร์ฟเวอร์ออนไลน์ พร้อมรองรับการเข้าใช้งานพร้อมกันข้ามอุปกรณ์ (คอมพิวเตอร์, แท็บเล็ต, สมาร์ทโฟน iOS/Android) อย่างปลอดภัยและมีเสถียรภาพสูงสุด

---

## 1. สถาปัตยกรรมข้อมูลและการซิงก์ข้ามอุปกรณ์ (Cross-Device Sync Architecture)

### 1.1 หลักการจัดเก็บข้อมูล: Server-Side Single Source of Truth
- **ไม่มีการเก็บข้อมูลหลักใน Browser `localStorage`:** ข้อมูลสำคัญทั้งหมด ได้แก่ บันทึก (Notes), ลิงก์บุ๊กมาร์ก (Bookmarks), หมวดหมู่ที่สร้างเอง (Custom Categories), รายการงาน (Tasks), นิสัยประจำวัน (Habits), ตู้เซฟนิรภัย (Vault), การแจ้งเตือน (Reminders), บุคคลสำคัญ (People), รูปภาพและไฟล์แนบ (Files), รวมถึงรายการไลฟ์สไตล์ (Watchlist, Shopping, Travel) **ถูกบันทึกและประมวลผลบนเซิร์ฟเวอร์ฐานข้อมูล SQLite (`knowledge.sqlite3`) ทั้งหมด 100%**
- **บทบาทของ Browser Storage:** `localStorage` และ `sessionStorage` บนเครื่องผู้ใช้ถูกจำกัดบทบาทให้จัดเก็บเฉพาะการตั้งค่าความสวยงามประจำเครื่องเท่านั้น เช่น ธีมสว่าง/มืด (`themeMode`), การพับแถบข้าง (`sidebarCollapsed`) ซึ่งไม่ส่งผลต่อความสมบูรณ์ของข้อมูลหลัก
- **การเข้าถึงจากอุปกรณ์ใดก็ได้:** เมื่อผู้ใช้ล็อกอินด้วยบัญชีเดียวกันจากเบราว์เซอร์บนมือถือ แท็บเล็ต หรือคอมพิวเตอร์ ทุกคำขอจะดึงข้อมูลสดผ่าน RESTful API ของ Fastify ทำให้ข้อมูลอัปเดตตรงกันแบบเรียลไทม์ 100%

---

## 2. วิธีการนำระบบขึ้นออนไลน์พร้อม HTTPS เข้าถึงได้จากทุกอุปกรณ์

การเปิดใช้งาน HTTPS (SSL/TLS) มีความสำคัญสูงสุด เนื่องจากเว็บแอปมีการใช้งาน Service Worker (PWA), Web Notifications, และคุกกี้เซสชันที่มีแอตทริบิวต์ `Secure; SameSite=Strict`

### ตัวเลือกที่ 1: การใช้ Cloudflare Tunnel ร่วมกับเครื่องโฮสต์ / Mini PC / Home Server (แนะนำสูงสุด - ฟรี 100%)
วิธีนี้เหมาะอย่างยิ่งสำหรับการใช้งานส่วนตัวและครอบครัว โดยไม่ต้องเปิดพอร์ตเราเตอร์ (No Port Forwarding), ไม่ต้องมี Public IP และได้ความปลอดภัยระดับสากลจาก Cloudflare WAF:

1. **เตรียมความพร้อม:** รันโปรเจกต์ด้วย Docker Compose บนเครื่องเซิร์ฟเวอร์/คอมพิวเตอร์ที่เปิดทิ้งไว้:
   ```bash
   docker compose up -d
   ```
2. **ติดตั้ง Cloudflare Tunnel (`cloudflared`):**
   ```bash
   # ดาวน์โหลดและติดตั้ง cloudflared
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```
3. **ล็อกอินและสร้าง Tunnel:**
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create pkh-brain-tunnel
   ```
4. **ตั้งค่าคอนฟิก (`~/.cloudflared/config.yml`):**
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /home/user/.cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: brain.yourdomain.com
       service: http://localhost:3001
     - service: http_status:404
   ```
5. **ชี้ DNS และเปิดบริการเบื้องหลัง:**
   ```bash
   cloudflared tunnel route dns pkh-brain-tunnel brain.yourdomain.com
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```
   *ผลลัพธ์: เว็บแอปจะออนไลน์ทันทีที่ `https://brain.yourdomain.com` พร้อมใบรับรอง SSL อัตโนมัติจาก Cloudflare โดยไม่ต้องเปิดพอร์ตเราเตอร์ใดๆ ทั้งสิ้น*

---

### ตัวเลือกที่ 2: การ Deploy ขึ้น VPS (เช่น Hetzner, DigitalOcean, Linode) ด้วย Docker + Caddy
Caddy จะทำหน้าที่เป็น Reverse Proxy และขอใบรับรอง Let's Encrypt HTTPS ให้อัตโนมัติ:

1. **เช่า VPS:** สเปกแนะนำ 1-2 vCPU, RAM 1-2 GB, Disk SSD 20-40 GB (Ubuntu 22.04 / 24.04 LTS)
2. **ชี้ DNS A Record:** ชี้โดเมน เช่น `brain.yourdomain.com` ไปยัง Public IPv4 ของ VPS
3. **รันสคริปต์อัตโนมัติของโปรเจกต์:**
   ```bash
   git clone <REPO_URL> /opt/pkh-life-os
   cd /opt/pkh-life-os
   chmod +x scripts/deploy-vps.sh
   ./scripts/deploy-vps.sh brain.yourdomain.com 987654
   ```
   สคริปต์จะทำการ:
   - อัปเดตแพ็กเกจและติดตั้ง Docker Engine + Docker Compose
   - ตั้งค่า Firewall (UFW) ปิดพอร์ตไม่จำเป็น เปิดเฉพาะ 22, 80, 443
   - สร้างอิมเมจ Docker และเปิดบริการที่พอร์ต 3001
   - ติดตั้ง Caddy Reverse Proxy และออกใบรับรอง SSL HTTPS อัตโนมัติ

---

### ตัวเลือกที่ 3: การ Deploy บน Cloud PaaS (Fly.io) ด้วย Persistent Volume
Fly.io รองรับการรันแอปที่มีพื้นที่จัดเก็บข้อมูลถาวร (Persistent Volume):

1. **ติดตั้ง Flyctl และล็อกอิน:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```
2. **สร้าง Volume สำหรับจัดเก็บ SQLite:**
   ```bash
   fly volumes create pkh_data --size 1 --region sin
   ```
3. **คอนฟิก `fly.toml`:**
   ```toml
   app = "pkh-life-os"
   primary_region = "sin"

   [build]
     dockerfile = "Dockerfile"

   [env]
     PORT = "3001"
     DATA_DIR = "/data"
     NODE_ENV = "production"

   [mounts]
     source = "pkh_data"
     destination = "/data"

   [[services]]
     protocol = "tcp"
     internal_port = 3001
     processes = ["app"]

     [[services.ports]]
       port = 80
       handlers = ["http"]
       force_https = true

     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

     [[services.http_checks]]
       interval = 30000
       grace_period = "5s"
       method = "get"
       path = "/api/health"
       protocol = "http"
       timeout = 2000
   ```
4. **Deploy:**
   ```bash
   fly deploy
   ```

---

## 3. ขั้นตอนการบริหารจัดการสมาชิก (User Onboarding & Offboarding Lifecycle)

ระบบรองรับการทำงานร่วมกันหลายบัญชี พร้อมการแบ่งแยกข้อมูลส่วนบุคคลอย่างเด็ดขาด:

### 3.1 การสร้างและแจกจ่ายรหัสคำเชิญ (Invite Onboarding)
1. ผู้ดูแลระบบเข้าสู่ระบบ แล้วคลิกปุ่ม **"🛡️ ระบบหลังบ้าน"** ที่ Topbar
2. ปลดล็อก Admin Gate ด้วยรหัสผ่านของบัญชีผู้ดูแลระบบ หรือรหัส PIN ปลอดภัย
3. ไปที่แท็บ **"🎟️ รหัสคำเชิญ"**
4. คลิกปุ่ม **"+ สร้างรหัสคำเชิญใหม่"**
5. กำหนดค่า:
   - **สิทธิ์เมื่อลงทะเบียน (Role):**
     - `👑 Admin`: สิทธิ์ผู้ดูแลระบบสูงสุด จัดการผู้ใช้และฐานข้อมูลได้
     - `👤 Member`: สมาชิกทั่วไป ข้อมูลส่วนตัวถูกแยกขาด มีพื้นที่ของตนเอง
     - `✏️ Editor`: ผู้แก้ไข สามารถจัดการข้อมูลส่วนกลางที่แชร์กันได้
     - `👁️ Viewer`: ผู้อ่านอย่างเดียว
   - **จำนวนครั้งที่ใช้ได้:** กำหนดตัวเลข (เช่น 1 ครั้งสำหรับเฉพาะบุคคล) หรือเว้นว่างสำหรับไม่จำกัด
   - **อายุการใช้งาน:** กำหนดชั่วโมงหมดอายุ (ค่าเริ่มต้น 72 ชั่วโมง)
6. คลิก **"สร้างรหัสคำเชิญ"** และคัดลอกรหัส (เช่น `PKH-INV-AB12CD`) ส่งให้ผู้ใช้
7. ผู้ใช้เปิดหน้าเว็บ คลิก **"🎟️ สมัครด้วยรหัสคำเชิญ"** กรอกรหัสคำเชิญ ชื่อผู้ใช้ อีเมล และรหัสผ่าน (ขั้นต่ำ 12 ตัวอักษร) เพื่อสร้างบัญชีและเข้าสู่ระบบทันที

### 3.2 การถอนสิทธิ์และการตัดเซสชันฉุกเฉิน (User Offboarding & Revocation)
กรณีอุปกรณ์สูญหาย หรือต้องการระงับการเข้าถึงของผู้ใช้รายใดทันที:
1. ผู้ดูแลระบบเปิดแท็บ **"บัญชีผู้ใช้งาน"** ในระบบหลังบ้าน
2. ค้นหาแถวของผู้ใช้ที่ต้องการ
3. **ตัดการเชื่อมต่อทันที (Revoke Sessions):** คลิกปุ่ม **"ตัดเซสชัน"** -> เซสชันที่ล็อกอินค้างอยู่ทุกเครื่องจะถูกทำลายทันที ผู้ใช้จะถูกเตะออกจากระบบในคำขอถัดไป
4. **ระงับการใช้งานบัญชี (Suspend):** คลิกปุ่ม **"ระงับ"** -> สถานะเปลี่ยนเป็น `✕ ถูกระงับ` บัญชีดังกล่าวจะไม่สามารถล็อกอินเข้าสู่ระบบได้อีก
5. **ลบบัญชีถาวร (Delete):** คลิกปุ่ม **"ลบ"** -> ข้อมูล บันทึก งาน และไฟล์ทั้งหมดของผู้ใช้นั้นจะถูกลบออกจากฐานข้อมูลอย่างสมบูรณ์

---

## 4. ตารางเปรียบเทียบข้อจำกัดจริงและโควตาของแต่ละแพลตฟอร์มอย่างตรงไปตรงมา
### (Honest Quota, Free-Tier Limitations & Real Cost Traps)

> [!WARNING]
> **ข้อควรระวังสำคัญสำหรับแอปพลิเคชันที่ใช้ SQLite:**
> SQLite ต้องการระบบไฟล์ดิสก์ที่เขียนลงข้อมูลได้จริงและคงทน (Persistent Read/Write Disk) **ห้ามรัน SQLite บน Serverless Functions (เช่น Vercel, AWS Lambda) หรือ Free Tier แบบไม่มี Persistent Volume เด็ดขาด เพราะข้อมูลจะสูญหายทันทีเมื่อเซิร์ฟเวอร์รีสตาร์ท!**

| ผู้ให้บริการ / โฮสติ้ง | แพ็กเกจ / ค่าบริการ | ความคงทนของดิสก์ (Disk Persistence) | ข้อจำกัด RAM / CPU | พฤติกรรมเมื่อไม่มีการใช้งาน (Idle / Sleep) | ข้อจำกัดไฟล์ขนาดใหญ่ & ข้อจำกัดอื่นๆ | ความเสี่ยงและค่าใช้จ่ายแฝงจริง |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloudflare Tunnel + เครื่อง Mini PC / บ้าน** *(แนะนำสูงสุด)* | **ฟรี 100%** (ใช้ฮาร์ดแวร์เดิม) | **ยอดเยี่ยม (100% Native SSD)** ไม่มีความเสี่ยงเรื่องดิสก์หาย | ขึ้นอยู่กับเครื่อง (เช่น 4-8 Cores, RAM 8-16 GB) | **ไม่มีการหลับ (No Sleep)** รันตลอด 24/7 ได้ตามต้องการ | Cloudflare จำกัดขนาดอัปโหลด 100 MB ต่อ Request (ปรับแก้ได้) | มีเฉพาะค่าไฟของคอมพิวเตอร์ที่เปิดทิ้งไว้ (~30-80 บาท/เดือน) |
| **Self-Hosted VPS** *(เช่น Hetzner Cloud CX22)* | **~3.5 - 4.5 €/เดือน** (~140 - 180 บาท/เดือน) | **ยอดเยี่ยม (NVMe SSD ถาวร 40 GB)** | 2 vCPU, RAM 4 GB, Bandwidth 20 TB | **รัน 24/7 ตลอดเวลา** ไม่มี Cold Start | ไม่มีข้อจำกัดไฟล์ อัปโหลดได้ตามขนาดดิสก์ | เป็นตัวเลือกที่เสถียรที่สุดสำหรับระบบ Production ที่ต้องการความเร็วสูง |
| **Fly.io** | มี Free Allowance (จำกัด) / เริ่มต้น ~$3/เดือน | **มี Persistent Volume** (ขนาดฟรี 1 GB ต่อ Organization) | 1 Shared CPU, RAM 256 MB - 512 MB | **มี Auto-Stop / Cold Start** เมื่อไม่มีคำขอเข้า (ตื่นใน 1-3 วินาที) | หากเขียนข้อมูลเกิน 1 GB ต้องจ่ายค่า Volume เพิ่ม ($0.15/GB/เดือน) | หาก RAM 256 MB อาจเกิด Out-Of-Memory (OOM) ตอน Reindex FTS5 หรือ Backup ควรใช้ RAM 512 MB ขึ้นไป |
| **Render.com** | Free Web Service (ฟรี) | **อันตราย! (Ephemeral Disk)** ดิสก์จะถูกล้างทุกครั้งที่ Deploy หรือ Sleep | 1 Shared CPU, RAM 512 MB | **หลับหลังไม่มีการใช้งาน 15 นาที** การปลุกใช้เวลา 50-60 วินาที | **ไม่สามารถใช้เก็บ SQLite บน Free Tier ได้** (ต้องซื้อ Persistent Disk เพิ่ม $7/เดือน) | ห้ามใช้ฟรีเทียร์ของ Render กับ SQLite เด็ดขาด ข้อมูลจะหาย |
| **Railway.app** | Hobby ($5 เครดิต/เดือน หรือ Pay-as-you-go) | **มี Persistent Volume** ($0.25/GB/เดือน) | ปรับตามการใช้งาน (RAM สูงสุด 8 GB) | ไม่หลับตราบใดที่เครดิตยังไม่หมด | อัปโหลดไฟล์ได้ลื่นไหล | เครดิตฟรี $5 มักหมดภายใน 20-25 วันหากเปิด 24/7 จะถูกตัดเงินตามจริง |
| **Turso (LibSQL Database)** | Free Tier (ฐานข้อมูลแยก) | **เก็บบน Cloud LibSQL** (พื้นที่ 9 GB, 500 databases) | รันเฉพาะฐานข้อมูล ต้องมีเซิร์ฟเวอร์รัน Node.js แยก | ไม่มี Cold Start สำหรับตัวฐานข้อมูล | ไม่รองรับการเก็บไฟล์ไบนารีขนาดใหญ่ (รูปภาพ/วิดีโอต้องเก็บที่ S3/R2 แยก) | เหมาะสำหรับโครงสร้างกระจายศูนย์ แต่ต้องแก้โค้ดเปลี่ยน Driver จาก better-sqlite3 เป็น @libsql/client |

---

## 5. สรุปคำแนะนำสำหรับการใช้งานจริง (Production Recommendation)

1. **สำหรับการใช้งานส่วนบุคคล / ครอบครัว (งบประมาณ 0 บาท):**
   - แนะนำแนวทาง **Cloudflare Tunnel ร่วมกับ Docker Compose บนคอมพิวเตอร์ที่บ้านหรือ Mini PC**: ปลอดภัยที่สุด ข้อมูลอยู่ในมือคุณ 100% พื้นที่เท่าขนาดฮาร์ดดิสก์จริง เร็ว ไม่ติดข้อจำกัด RAM และฟรีตลอดชีพ
2. **สำหรับการใช้งานแบบต้องการเปิด 24/7 โดยไม่ต้องเปิดคอมพิวเตอร์ที่บ้าน:**
   - แนะนำ **Hetzner Cloud VPS (CX22 หรือ CAX11)** ค่าบริการประมาณ 140 บาทต่อเดือน: ได้ RAM 4 GB, ดิสก์ NVMe 40 GB, รันสคริปต์ `./scripts/deploy-vps.sh` จบใน 5 นาที พร้อม Caddy HTTPS อัตโนมัติ 100%
3. **การสำรองข้อมูล (Backup Strategy):**
   - ควรตั้งระบบสำรองไฟล์ `knowledge.sqlite3` และโฟลเดอร์ไฟล์แนบออกไปยังคลาวด์ภายนอก (เช่น Cloudflare R2 หรือ Google Drive) ทุกสัปดาห์ เพื่อป้องกันกรณีฮาร์ดแวร์เสียหาย
