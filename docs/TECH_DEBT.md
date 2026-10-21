# Technical Debt & Architecture Review (PKH / Life OS)

บันทึกหนี้ทางเทคนิค (Technical Debt) และข้อสังเกตทางสถาปัตยกรรมของโปรเจกต์ PKH หลังเสร็จสิ้น **Phase 4: Modularizing Monolithic App.tsx**

---

## 1. ภาพรวมการแยกรหัสใน Phase 4 (Current Achievements)

ในขั้นตอนนี้ ไฟล์ยักษ์ `apps/web/src/App.tsx` (เดิมขนาด 8,295 บรรทัด) ได้ถูกชำแหละและแยกองค์ประกอบออกเป็นโมดูลย่อยที่มีความรับผิดชอบชัดเจน (Single Responsibility):

- **Types & Enums**: แยกไปที่ `apps/web/src/types/index.ts`
- **Constants**: แยกไปที่ `apps/web/src/lib/constants.ts`
- **Formatters & Pure Helpers**: แยกไปที่ `apps/web/src/lib/formatters.ts`
- **Shared Components & Lightbox**:
  - `components/Topbar.tsx`
  - `components/Sidebar.tsx`
  - `components/EntityAttachments.tsx`
  - `components/MediaLightbox.tsx`
  - `components/ToastStack.tsx`
- **Modals**:
  - `components/modals/PermanentDeleteModal.tsx`
  - `components/modals/SidebarNavModal.tsx`
  - `features/settings/ThemeModal.tsx`
  - `features/settings/ProfileModal.tsx`
  - `features/search/CommandSearchModal.tsx`
  - `features/custom-categories/CategoryModal.tsx`
  - `features/custom-categories/QuickAddCategoryModal.tsx`
- **Feature Views (15 โมดูล)**:
  - `features/custom-categories/CustomCategoryView.tsx`
  - `features/dashboard/DashboardView.tsx`
  - `features/inbox/InboxView.tsx`
  - `features/vault/VaultView.tsx`
  - `features/library/LibraryView.tsx`
  - `features/tasks/TasksView.tsx`
  - `features/tasks/ProjectsView.tsx`
  - `features/tasks/GoalsView.tsx`
  - `features/people/PeopleView.tsx`
  - `features/habits/HabitsView.tsx`
  - `features/notes/NotesView.tsx`
  - `features/bookmarks/BookmarksView.tsx`
  - `features/bookmarks/FavoritesView.tsx`
  - `features/files/FilesView.tsx`
  - `features/trash/TrashView.tsx`

ผลลัพธ์: ขนาดของ `App.tsx` ลดลงเหลือ **3,893 บรรทัด** (ลดลงมากกว่า 53%) โดยคงพฤติกรรมเดิม 100% และผ่านการทดสอบ Build/Lint ทั้งหมด

---

## 2. หนี้ทางเทคนิคที่ยังคงเหลือ (Remaining Technical Debt)

### 2.1 State & Event Handlers ยังรวมอยู่ที่ Root Component (`App.tsx`)
* **ระดับความรุนแรง:** ปานกลาง-สูง (Maintainability & Re-render efficiency)
* **รายละเอียด:**
  - `App.tsx` ยังคงมี `useState` มากกว่า 60 ตัว และฟังก์ชันจัดการ API (`handleSave`, `addInboxItem`, `toggleTask`, `copyVaultKey` ฯลฯ) จำนวนมากรวมอยู่ที่ระดับบนสุด
  - เมื่อ state ใดตัวหนึ่งเปลี่ยน React จะประเมิน App Component ทั้งหมด แม้ว่าจะส่ง props ต่อไปยัง child component แล้วก็ตาม
* **แนวทางแก้ไขในเฟสถัดไป (Phase 5/6):**
  - สกัด Custom Hooks แยกตาม Domain:
    - `useNotesState()`
    - `useTasksAndProjects()`
    - `usePersonalVault()`
    - `useKnowledgeLibrary()`
    - `useHabitsAndSchedule()`
    - `useCustomCategories()`
    - `useAuthSession()`
  - ใช้ Context หรือ Zustand/Jotai สำหรับ global UI states (เช่น `theme`, `toasts`, `activeNav`, `commandOpen`)

---

### 2.2 ESLint `react-hooks/exhaustive-deps` ใน `App.tsx`
* **ระดับความรุนแรง:** ต่ำ-ปานกลาง (Code Quality)
* **รายละเอียด:**
  - ปัจจุบันมี 6 คำเตือน (Warnings) ใน `App.tsx` จาก `eslint-plugin-react-hooks`:
    1. Line 521: Effect โหลดรายการทั้งหมด มี missing dependencies: `bookmarks.length`, `files.length`, `libraryItems.length`, `vaultItems.length`
    2. Lines 539, 557, 575, 593, 611: Effect ซิงค์ custom category มี missing dependencies เช่น `activeNote`, `activeBookmark`, `activeVault`, `activeLibrary`, `activeFile`
  - สาเหตุเดิม: โค้ดต้นฉบับจงใจไม่ใส่ dependencies เหล่านี้ เพื่อป้องกันไม่ให้เกิด network fetch loop หรือการล้าง form input ขณะพิมพ์
* **แนวทางแก้ไข:**
  - เปลี่ยนจากการใช้ `useEffect` สำหรับ sync state ไปเป็นการเรียก fetch หรือ sync ใน event handler ที่ผู้ใช้คลิกเลือกรายการโดยตรง (Event-driven แทน Effect-driven)

---

### 2.3 การรีเฟรชข้อมูลด้วย `refreshKey` และ Single-fetch Pattern
* **ระดับความรุนแรง:** ปานกลาง (Performance & UX)
* **รายละเอียด:**
  - การรีเฟรชข้อมูลเกือบทุกโมดูลพึ่งพา state `refreshKey` (`setRefreshKey((k) => k + 1)`) ซึ่งไปกระตุ้น `useEffect` ให้ยิง API ทุกตัวพร้อมกัน
  - ไม่มีการ caching, deduplication, หรือ background revalidation ข้อมูลที่ไม่ได้เปลี่ยนแปลงจึงถูกโหลดซ้ำโดยไม่จำเป็น
* **แนวทางแก้ไข:**
  - นำ TanStack Query (`@tanstack/react-query`) หรือ SWR มาใช้งาน เพื่อจัดการ query cache, automatic revalidation, optimistic updates และ error retry

---

### 2.4 Monolithic CSS & Mixed Design Tokens
* **ระดับความรุนแรง:** ปานกลาง (Styling Consistency)
* **รายละเอียด:**
  - `App.css` มีความยาวมากกว่า 3,800 บรรทัด รวมทุกคลาสไว้ในไฟล์เดียว มีการ override ด้วย `!important` ในหลายจุด
  - ใน Phase 3 เราได้สร้างระบบ Design Tokens (`tokens.css`, `base.css`, `components.css`) ไว้แล้ว แต่ตัว UI เดิมยังใช้คลาสเก่าของ `App.css` ปะปนอยู่
* **แนวทางแก้ไข:**
  - ทยอย migrate คลาสในแต่ละ feature component ให้ใช้ CSS Modules หรือ Tokens จาก `tokens.css` โดยตรง แล้วทยอยตัดส่วนที่ซ้ำซ้อนออกจาก `App.css`

---

### 2.5 Server-side Backup Test Failures (`src/backup.test.ts`)
* **ระดับความรุนแรง:** ข้อสังเกตระบบ (System Baseline Observation)
* **รายละเอียด:**
  - จาก Baseline ใน `docs/BASELINE.md` พบว่าการทดสอบ `npm test` ฝั่ง `apps/server` มี 8 การทดสอบล้มเหลว (ทั้งหมดอยู่ใน `src/backup.test.ts`) เกี่ยวข้องกับ `BACKUP_ENCRYPTION_KEY_ID` และการล็อคไฟล์ SQLite connection บน Windows
  - ส่วนอื่นของ server (Auth, Notes, Vault, Library, Categories, Favorites, People, Reminders, Storage) ผ่าน 243 การทดสอบทั้งหมด (243 passed)
* **แนวทางแก้ไข:**
  - ให้ความสำคัญกับการแก้ปัญหา Windows SQLite file-lock และ environment variable key mismatch ใน task ฝั่ง server โดยเฉพาะ

---

## 3. สรุปความพร้อมของสถาปัตยกรรม

| ส่วนประกอบ | สถานะหลัง Phase 4 | ความเสี่ยง |
|---|---|---|
| **View Architecture** | แยกเป็น 15 โมดูลชัดเจนใน `features/` | ไม่มี (Build & Lint ผ่าน 0 error) |
| **Component Reusability** | Modals, Attachments, Lightbox, Toasts แยกเป็นชิ้นส่วนเดี่ยว | ไม่มี |
| **Type Safety** | Types ทั้งหมดรวมศูนย์ที่ `types/index.ts`, ตัด `any` ออก | ปลอดภัย |
| **App.tsx Size** | ลดลงจาก 8,295 บรรทัด -> 3,893 บรรทัด | จัดการง่ายขึ้นมาก พร้อมสำหรับ Phase 5 |
