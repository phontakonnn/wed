import { test, expect } from '@playwright/test';

async function ensureLoggedIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  const sidebar = page.locator('aside.app-sidebar');
  const loginCard = page.locator('.login-card');
  await expect(sidebar.or(loginCard)).toBeVisible({ timeout: 15_000 });
  if (await loginCard.isVisible()) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
  }
}

async function expectNoticeOrToast(page: import('@playwright/test').Page, text: string) {
  const el = page.locator('.toast, .form-notice, [role="status"]').filter({ hasText: text }).first();
  await expect(el).toBeVisible({ timeout: 10_000 });
}

test.describe('PKH / Life OS - Full System Immunity & 100% CRUD Parity Suite', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Auto-accept all window.confirm dialogs
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  // =========================================================================
  // 1. Inbox (กล่องขาเข้า): เพิ่มต่อเนื่อง -> แปลง -> ลบ
  // =========================================================================
  test('Module 1: Inbox - เพิ่มรายการต่อเนื่อง, แปลงรายการ และลบรายการ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'กล่องขาเข้า' }).click();
    await expect(page.locator('h2.banner-title:has-text("กล่องขาเข้า")')).toBeVisible();

    // 1.1 เพิ่มรายการที่ 1
    const draftInput = page.locator('.life-quick-card textarea');
    await draftInput.fill('ไอเดียวิจัยระบบ AI 1');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เก็บเข้ากล่องขาเข้าแล้ว');
    await expect(page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 1")')).toBeVisible();

    // 1.2 ฟอร์มต้องล้างค่าทันที และเพิ่มรายการที่ 2 ต่อเนื่องได้
    await expect(draftInput).toHaveValue('');
    await draftInput.fill('ไอเดียวิจัยระบบ AI 2');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เก็บเข้ากล่องขาเข้าแล้ว');

    // ตรวจสอบว่ามีทั้ง 2 รายการ
    await expect(page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 1")')).toBeVisible();
    await expect(page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 2")')).toBeVisible();

    // 1.3 แปลงรายการที่ 1 เป็น Task
    const item1 = page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 1")');
    await item1.locator('button:has-text("งาน")').click();
    await expectNoticeOrToast(page, 'แปลงรายการและย้ายออกจากกล่องแล้ว');

    // 1.4 ลบรายการที่ 2
    const item2 = page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 2")');
    await item2.locator('button:has-text("ลบ")').click();
    await expect(page.locator('.inbox-item-card:has-text("ไอเดียวิจัยระบบ AI 2")')).not.toBeVisible();
  });

  // =========================================================================
  // 2. Notes (โน้ต): เพิ่มต่อเนื่อง -> แก้ไข -> ถังขยะ
  // =========================================================================
  test('Module 2: Notes - เพิ่มโน้ตต่อเนื่อง, แก้ไขบันทึก และย้ายลงถังขยะ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'โน้ตของฉัน' }).click();
    await expect(page.locator('h2.banner-title:has-text("ความรู้และโน้ตของฉัน")')).toBeVisible();

    // 2.1 เพิ่มโน้ตที่ 1
    await page.locator('button:has-text("＋ สร้างโน้ตใหม่")').first().click();
    await page.locator('.notes-title-input').fill('โน้ตแผนกลยุทธ์ 2026');
    await page.locator('.notes-content-textarea').fill('# แผนงานปี 2026\nพัฒนาระบบความเสถียร 100%');
    await page.locator('#note-save-btn').click();
    await expectNoticeOrToast(page, 'สร้างโน้ตแล้ว');
    await expect(page.locator('.note-item-card:has-text("โน้ตแผนกลยุทธ์ 2026")')).toBeVisible();

    // 2.2 เพิ่มโน้ตที่ 2 ต่อเนื่องทันที
    await page.locator('button:has-text("＋ สร้างโน้ตใหม่")').first().click();
    await expect(page.locator('.notes-title-input')).toHaveValue('');
    await page.locator('.notes-title-input').fill('โน้ตสถาปัตยกรรม Fastify');
    await page.locator('.notes-content-textarea').fill('รายละเอียด Fastify และ SQLite');
    await page.locator('#note-save-btn').click();
    await expectNoticeOrToast(page, 'สร้างโน้ตแล้ว');
    await expect(page.locator('.note-item-card:has-text("โน้ตสถาปัตยกรรม Fastify")')).toBeVisible();

    // 2.3 แก้ไขโน้ตที่ 1
    await page.locator('.note-item-card:has-text("โน้ตแผนกลยุทธ์ 2026")').click();
    await page.locator('.notes-title-input').fill('โน้ตแผนกลยุทธ์ 2026 (ฉบับสมบูรณ์)');
    await page.locator('#note-save-btn').click();
    await expectNoticeOrToast(page, 'บันทึกการแก้ไขแล้ว');

    // 2.4 ย้ายโน้ตที่ 2 ลงถังขยะ
    const note2Card = page.locator('.note-item-card:has-text("โน้ตสถาปัตยกรรม Fastify")');
    await expect(note2Card).toBeVisible();
    await note2Card.locator('button[title="ย้ายลงถังขยะ"]').click();
    await expectNoticeOrToast(page, 'ย้ายโน้ตไปถังขยะแล้ว');
    await expect(page.locator('.note-item-card:has-text("โน้ตสถาปัตยกรรม Fastify")')).not.toBeVisible();
  });

  // =========================================================================
  // 3. Tasks (งานที่ต้องทำ): เพิ่มต่อเนื่อง -> ติ๊กเสร็จ -> ลบงาน
  // =========================================================================
  test('Module 3: Tasks - เพิ่มงานต่อเนื่อง, ติ๊กเสร็จ และลบงาน', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'งานที่ต้องทำ' }).click();
    await expect(page.locator('h2.banner-title:has-text("งานที่ต้องทำ")')).toBeVisible();

    // 3.1 เพิ่มงานที่ 1
    const taskInput = page.locator('#quick-task-title');
    await taskInput.fill('งานด่วน: ออกแบบ Schema ฐานข้อมูล');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มงานแล้ว');
    await expect(page.locator('.task-row-card:has-text("งานด่วน: ออกแบบ Schema ฐานข้อมูล")')).toBeVisible();

    // 3.2 เพิ่มงานที่ 2 ต่อเนื่องทันที
    await expect(taskInput).toHaveValue('');
    await taskInput.fill('งานทดสอบ: ตรวจทาน Endpoints');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มงานแล้ว');
    await expect(page.locator('.task-row-card:has-text("งานทดสอบ: ตรวจทาน Endpoints")')).toBeVisible();

    // 3.3 ติ๊กเสร็จงานที่ 1
    const task1 = page.locator('.task-row-card:has-text("งานด่วน: ออกแบบ Schema ฐานข้อมูล")');
    await expect(task1).toBeVisible();
    await task1.locator('input.task-checkbox').click();
    await expectNoticeOrToast(page, 'อัปเดตงานแล้ว');

    // 3.4 ลบงานที่ 2
    const task2 = page.locator('.task-row-card:has-text("งานทดสอบ: ตรวจทาน Endpoints")');
    await expect(task2).toBeVisible();
    await task2.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบงานเรียบร้อยแล้ว');
    await expect(page.locator('.task-row-card:has-text("งานทดสอบ: ตรวจทาน Endpoints")')).not.toBeVisible();
  });

  // =========================================================================
  // 4. Projects (โปรเจกต์): เพิ่มต่อเนื่อง -> ปิดโปรเจกต์ -> ลบโปรเจกต์
  // =========================================================================
  test('Module 4: Projects - สร้างโปรเจกต์ต่อเนื่อง, เปลี่ยนสถานะ และลบโปรเจกต์', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'โปรเจกต์' }).click();
    await expect(page.locator('h2.banner-title:has-text("โปรเจกต์และแผนงาน")')).toBeVisible();

    // 4.1 สร้างโปรเจกต์ที่ 1
    const projInput = page.locator('#proj-name');
    await projInput.fill('โปรเจกต์พัฒนาระบบ Life OS 2026');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'สร้างโปรเจกต์แล้ว');
    await expect(page.locator('.life-card:has-text("โปรเจกต์พัฒนาระบบ Life OS 2026")')).toBeVisible();

    // 4.2 สร้างโปรเจกต์ที่ 2 ต่อเนื่องทันที
    await expect(projInput).toHaveValue('');
    await projInput.fill('โปรเจกต์โครงสร้างพื้นฐานคลาวด์');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'สร้างโปรเจกต์แล้ว');
    await expect(page.locator('.life-card:has-text("โปรเจกต์โครงสร้างพื้นฐานคลาวด์")')).toBeVisible();

    // 4.3 ปิดโปรเจกต์ที่ 1
    const proj1 = page.locator('.life-card:has-text("โปรเจกต์พัฒนาระบบ Life OS 2026")');
    await expect(proj1).toBeVisible();
    await proj1.locator('button:has-text("ปิดโปรเจกต์")').click();
    await expectNoticeOrToast(page, 'ปิดโปรเจกต์เรียบร้อยแล้ว');

    // 4.4 ลบโปรเจกต์ที่ 2
    const proj2 = page.locator('.life-card:has-text("โปรเจกต์โครงสร้างพื้นฐานคลาวด์")');
    await expect(proj2).toBeVisible();
    await proj2.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบโปรเจกต์เรียบร้อยแล้ว');
    await expect(page.locator('.life-card:has-text("โปรเจกต์โครงสร้างพื้นฐานคลาวด์")')).not.toBeVisible();
  });

  // =========================================================================
  // 5. Goals (เป้าหมาย): เพิ่มต่อเนื่อง -> ปรับความคืบหน้า -> ลบเป้าหมาย
  // =========================================================================
  test('Module 5: Goals - เพิ่มเป้าหมายต่อเนื่อง, ปรับความคืบหน้า และลบเป้าหมาย', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'เป้าหมาย' }).click();
    await expect(page.locator('h2.banner-title:has-text("เป้าหมายและผลลัพธ์สำคัญ")')).toBeVisible();

    // 5.1 เพิ่มเป้าหมายที่ 1
    const goalTitle = page.locator('#goal-title');
    await goalTitle.fill('อ่านหนังสือพัฒนาตนเอง');
    await page.locator('#goal-target').fill('12');
    await page.locator('#goal-unit').fill('เล่ม');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มเป้าหมายแล้ว');
    await expect(page.locator('.life-card:has-text("อ่านหนังสือพัฒนาตนเอง")')).toBeVisible();

    // 5.2 เพิ่มเป้าหมายที่ 2 ต่อเนื่องทันที
    await expect(goalTitle).toHaveValue('');
    await goalTitle.fill('ออกกำลังกายคาร์ดิโอ');
    await page.locator('#goal-target').fill('100');
    await page.locator('#goal-unit').fill('วัน');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มเป้าหมายแล้ว');
    await expect(page.locator('.life-card:has-text("ออกกำลังกายคาร์ดิโอ")')).toBeVisible();

    // 5.3 ปรับความคืบหน้าเป้าหมายที่ 1 (+1)
    const goal1 = page.locator('.life-card:has-text("อ่านหนังสือพัฒนาตนเอง")');
    await expect(goal1).toBeVisible();
    await goal1.locator('button:has-text("+1")').click();
    await expectNoticeOrToast(page, 'ปรับความคืบหน้า');

    // 5.4 ลบเป้าหมายที่ 2
    const goal2 = page.locator('.life-card:has-text("ออกกำลังกายคาร์ดิโอ")');
    await expect(goal2).toBeVisible();
    await goal2.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบเป้าหมายเรียบร้อยแล้ว');
    await expect(page.locator('.life-card:has-text("ออกกำลังกายคาร์ดิโอ")')).not.toBeVisible();
  });

  // =========================================================================
  // 6. Habits & Schedule (ตารางชีวิต: นิสัย, ช่วงเวลา, แจ้งเตือน)
  // =========================================================================
  test('Module 6: Habits & Schedule - เพิ่มกิจวัตร/ช่วงเวลา/แจ้งเตือน เช็กอิน และลบ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'ปฏิทิน & ตารางชีวิต' }).click();
    await expect(page.locator('h2.banner-title:has-text("ปฏิทิน ตารางชีวิต และกิจวัตร")')).toBeVisible();

    // 6.1 เพิ่มกิจวัตร (Habits)
    const habitInput = page.locator('input[placeholder*="ชื่อกิจวัตรใหม่"]');
    await habitInput.fill('ดื่มน้ำบริสุทธิ์');
    await page.locator('button:has-text("＋ เพิ่มกิจวัตร")').click();
    await expectNoticeOrToast(page, 'เพิ่มกิจวัตรเรียบร้อยแล้ว');

    // เช็กอินกิจวัตร (+1)
    const habitRow = page.locator('.habit-matrix-card:has-text("ดื่มน้ำบริสุทธิ์")');
    await expect(habitRow).toBeVisible();
    await habitRow.locator('button:has-text("+1")').click();
    await expectNoticeOrToast(page, 'เช็กอิน');

    // 6.2 เพิ่มช่วงเวลา (Timeblocks)
    const blockTimeInput = page.locator('input[placeholder="06:30 - 07:30"]');
    const blockTitleInput = page.locator('input[placeholder*="ชื่อกิจกรรม"]');
    await blockTimeInput.fill('07:00 - 08:00');
    await blockTitleInput.fill('วิ่งจ็อกกิ้ง');
    await page.locator('button:has-text("＋ เพิ่มช่วงเวลา")').click();
    await expectNoticeOrToast(page, 'เพิ่มช่วงเวลาเรียบร้อยแล้ว');

    // 6.3 เพิ่มแจ้งเตือน (Reminders)
    const reminderForm = page.locator('form', { has: page.locator('input[placeholder*="ชื่อแจ้งเตือน"]') });
    await reminderForm.locator('input[placeholder*="ชื่อแจ้งเตือน"]').fill('จ่ายค่าบริการคลาวด์ประจำเดือน');
    await reminderForm.locator('input[type="date"]').fill('2026-11-01');
    await reminderForm.locator('button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มแจ้งเตือนเรียบร้อยแล้ว');

    // ลบช่วงเวลา
    const blockItem = page.locator('.task-row-card:has-text("วิ่งจ็อกกิ้ง")');
    await expect(blockItem).toBeVisible();
    await blockItem.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบช่วงเวลาเรียบร้อยแล้ว');
    await expect(page.locator('.task-row-card:has-text("วิ่งจ็อกกิ้ง")')).not.toBeVisible();
  });

  // =========================================================================
  // 7. People (บุคคลสำคัญ): เพิ่มต่อเนื่อง -> แก้ไข -> ลบ
  // =========================================================================
  test('Module 7: People - เพิ่มบุคคลสำคัญต่อเนื่อง, แก้ไขข้อมูล และลบ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'บุคคลสำคัญ' }).click();
    await expect(page.locator('h2.banner-title:has-text("บุคคลสำคัญ")')).toBeVisible();

    // 7.1 เพิ่มบุคคลที่ 1
    await page.locator('button:has-text("＋ เพิ่มบุคคล")').first().click();
    const nameInput = page.locator('#person-name');
    await nameInput.fill('คุณสมชาย สุขเกษม');
    await page.locator('button[type="submit"]:has-text("เพิ่มบุคคล"), button[type="submit"]:has-text("บันทึกข้อมูลบุคคล")').click();
    await expectNoticeOrToast(page, 'เพิ่มบุคคลเรียบร้อยแล้ว');
    await expect(page.locator('.person-bento-card:has-text("คุณสมชาย สุขเกษม")')).toBeVisible();

    // 7.2 เพิ่มบุคคลที่ 2 ต่อเนื่องทันที
    await page.locator('button:has-text("＋ เพิ่มบุคคล")').first().click();
    await expect(nameInput).toHaveValue('');
    await nameInput.fill('คุณวิภาดา มงคล');
    await page.locator('button[type="submit"]:has-text("เพิ่มบุคคล"), button[type="submit"]:has-text("บันทึกข้อมูลบุคคล")').click();
    await expectNoticeOrToast(page, 'เพิ่มบุคคลเรียบร้อยแล้ว');
    await expect(page.locator('.person-bento-card:has-text("คุณวิภาดา มงคล")')).toBeVisible();

    // 7.3 แก้ไขบุคคลที่ 1
    await page.locator('.person-bento-card:has-text("คุณสมชาย สุขเกษม")').click();
    const roleInput = page.locator('#person-role');
    await roleInput.fill('ที่ปรึกษาอาวุโส');
    await page.locator('button[type="submit"]:has-text("บันทึกข้อมูลบุคคล")').click();
    await expectNoticeOrToast(page, 'บันทึกข้อมูลบุคคลแล้ว');

    // 7.4 ลบบุคคลที่ 2
    await page.locator('.person-bento-card:has-text("คุณวิภาดา มงคล")').click();
    await page.locator('button:has-text("ลบบุคคลนี้")').click();
    await expectNoticeOrToast(page, 'ลบข้อมูลบุคคลเรียบร้อยแล้ว');
    await expect(page.locator('.person-bento-card:has-text("คุณวิภาดา มงคล")')).not.toBeVisible();
  });

  // =========================================================================
  // 8. Bookmarks & Favorites: Auto URL https:// -> ติดดาว -> ลบ
  // =========================================================================
  test('Module 8: Bookmarks & Favorites - เติม https:// อัตโนมัติ, ติดดาว และลบ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'บุ๊กมาร์ก' }).click();
    await expect(page.locator('h2.banner-title:has-text("ลิงก์และบุ๊กมาร์ก")')).toBeVisible();

    // 8.1 เพิ่มบุ๊กมาร์กที่ 1 (พิมพ์ domain โดยไม่ใส่ https://)
    await page.locator('#bm-url').fill('github.com');
    await page.locator('#bm-title').fill('GitHub Web');
    await page.locator('button:has-text("＋ บันทึกบุ๊กมาร์ก")').click();
    await expectNoticeOrToast(page, 'บันทึกบุ๊กมาร์กแล้ว');

    // ตรวจสอบว่าระบบเติม https://github.com อัตโนมัติ
    await expect(page.locator('.bookmark-card-url:has-text("https://github.com")')).toBeVisible();

    // 8.2 เพิ่มบุ๊กมาร์กที่ 2 ต่อเนื่องทันที
    const backBtn = page.locator('button:has-text("← ดูลิงก์ทั้งหมด")');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
    await page.locator('#bm-url').fill('developer.mozilla.org');
    await page.locator('#bm-title').fill('MDN Web Docs');
    await page.locator('button:has-text("＋ บันทึกบุ๊กมาร์ก")').click();
    await expectNoticeOrToast(page, 'บันทึกบุ๊กมาร์กแล้ว');

    // 8.3 ติดดาวบุ๊กมาร์กที่ 1
    const bm1 = page.locator('.bookmark-card-modern:has-text("GitHub Web")');
    await bm1.click();
    await page.locator('.module-header-banner button:has-text("☆ เพิ่มโปรด"), .module-header-banner button:has-text("★ โปรด")').click();

    // 8.4 ไปที่หน้า รายการโปรด -> ตรวจสอบว่าปรากฏ
    await page.locator('.nav-item', { hasText: 'รายการโปรด' }).click();
    await expect(page.locator('h2.banner-title:has-text("รายการโปรด")')).toBeVisible();
    await expect(page.locator('article:has-text("GitHub Web")')).toBeVisible();

    // 8.5 กลับไปลบบุ๊กมาร์กที่ 2
    await page.locator('.nav-item', { hasText: 'บุ๊กมาร์ก' }).click();
    await page.locator('.bookmark-card-modern:has-text("MDN Web Docs")').click();
    await page.locator('.module-header-banner button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบบุ๊กมาร์กเรียบร้อยแล้ว');
    await expect(page.locator('.bookmark-card-modern:has-text("MDN Web Docs")')).not.toBeVisible();
  });

  // =========================================================================
  // 9. Personal Vault (ตู้เซฟ): เพิ่มต่อเนื่อง -> คัดลอกรหัส -> ลบรายการ
  // =========================================================================
  test('Module 9: Vault - เพิ่มรายการต่อเนื่อง, คัดลอกรหัส และลบรายการ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'คลังสำคัญ' }).click();
    await expect(page.locator('h2.banner-title:has-text("คลังสำคัญและทรัพย์สิน")')).toBeVisible();

    // 9.1 เพิ่มรายการที่ 1
    await page.locator('#vault-title').fill('บัตรเดบิตธนาคารหลัก');
    await page.locator('#vault-key').fill('4123-4567-8901-2345');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มรายการเข้าคลังแล้ว');
    await expect(page.locator('.life-card:has-text("บัตรเดบิตธนาคารหลัก")')).toBeVisible();

    // 9.2 เพิ่มรายการที่ 2 ต่อเนื่องทันที
    await page.locator('button:has-text("＋ เพิ่มรายการเข้าคลัง")').click();
    const vaultTitle = page.locator('#vault-title');
    await expect(vaultTitle).toHaveValue('');
    await vaultTitle.fill('รหัส Wi-Fi ส่วนบุคคล');
    await page.locator('#vault-key').fill('SuperSecurePass123!');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มรายการเข้าคลังแล้ว');
    await expect(page.locator('.life-card:has-text("รหัส Wi-Fi ส่วนบุคคล")')).toBeVisible();

    // 9.3 คัดลอกรหัสรายการที่ 1
    const vCard1 = page.locator('.life-card:has-text("บัตรเดบิตธนาคารหลัก")');
    await expect(vCard1).toBeVisible();
    await vCard1.locator('button[title="คัดลอกเลขสำคัญ"]').click();
    await expectNoticeOrToast(page, 'คัดลอกลงคลิปบอร์ดแล้ว');

    // 9.4 ลบรายการที่ 2
    const vCard2 = page.locator('.life-card:has-text("รหัส Wi-Fi ส่วนบุคคล")');
    await expect(vCard2).toBeVisible();
    await vCard2.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบรายการออกจากคลังแล้ว');
    await expect(page.locator('.life-card:has-text("รหัส Wi-Fi ส่วนบุคคล")')).not.toBeVisible();
  });

  // =========================================================================
  // 10. Knowledge Library (ห้องสมุด): เพิ่มต่อเนื่อง -> แก้ไขสถานะ -> ลบ
  // =========================================================================
  test('Module 10: Library - เพิ่มคู่มือต่อเนื่อง, แก้ไขสถานะ และลบ', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'ห้องสมุด' }).click();
    await expect(page.locator('h2.banner-title:has-text("ห้องสมุด")')).toBeVisible();

    // 10.1 เพิ่มคู่มือที่ 1
    await page.locator('#lib-title').fill('คู่มือสถาปัตยกรรมระดับองค์กร');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มความรู้เข้าห้องสมุดแล้ว');
    await expect(page.locator('.life-card:has-text("คู่มือสถาปัตยกรรมระดับองค์กร")')).toBeVisible();

    // 10.2 เพิ่มคู่มือที่ 2 ต่อเนื่องทันที
    await page.locator('button:has-text("＋ เพิ่มคู่มือใหม่")').click();
    const libTitle = page.locator('#lib-title');
    await expect(libTitle).toHaveValue('');
    await libTitle.fill('หนังสือ Clean Code Guide');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'เพิ่มความรู้เข้าห้องสมุดแล้ว');
    await expect(page.locator('.life-card:has-text("หนังสือ Clean Code Guide")')).toBeVisible();

    // 10.3 แก้ไขสถานะคู่มือที่ 1
    await page.locator('.life-card:has-text("คู่มือสถาปัตยกรรมระดับองค์กร")').click();
    await page.locator('#lib-status').selectOption('กำลังศึกษา');
    await page.locator('.life-quick-card button[type="submit"]').click();
    await expectNoticeOrToast(page, 'บันทึกการแก้ไขแล้ว');

    // 10.4 ลบคู่มือที่ 2
    const libCard2 = page.locator('.life-card:has-text("หนังสือ Clean Code Guide")');
    await expect(libCard2).toBeVisible();
    await libCard2.locator('button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบรายการออกจากห้องสมุดแล้ว');
    await expect(page.locator('.life-card:has-text("หนังสือ Clean Code Guide")')).not.toBeVisible();
  });

  // =========================================================================
  // 11. Files (คลังไฟล์): อัปโหลดต่อเนื่อง -> พรีวิว -> ลบไฟล์
  // =========================================================================
  test('Module 11: Files - อัปโหลดไฟล์ต่อเนื่อง, เปิดพรีวิว และลบไฟล์', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'คลังไฟล์' }).click();
    await expect(page.locator('h2.banner-title:has-text("คลังไฟล์")')).toBeVisible();

    // 11.1 อัปโหลดไฟล์ที่ 1
    const file1Buffer = Buffer.from('Test Document Content 1 ' + Date.now());
    await page.setInputFiles('input[type="file"]', {
      name: 'document-immunity-1.txt',
      mimeType: 'text/plain',
      buffer: file1Buffer,
    });
    await expect(page.locator('h2:has-text("document-immunity-1.txt"), h3:has-text("document-immunity-1.txt"), .file-bento-title:has-text("document-immunity-1.txt")').first()).toBeVisible({ timeout: 15_000 });

    // กดกลับมาหน้ารายการรวม
    const backBtn = page.locator('button:has-text("← ดูไฟล์ทั้งหมด")');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }

    // 11.2 อัปโหลดไฟล์ที่ 2 ต่อเนื่องทันที
    const file2Buffer = Buffer.from('Test Document Content 2 ' + Date.now());
    await page.setInputFiles('input[type="file"]', {
      name: 'document-immunity-2.txt',
      mimeType: 'text/plain',
      buffer: file2Buffer,
    });
    await expect(page.locator('h2:has-text("document-immunity-2.txt"), h3:has-text("document-immunity-2.txt"), .file-bento-title:has-text("document-immunity-2.txt")').first()).toBeVisible({ timeout: 15_000 });

    // 11.3 ตรวจสอบและลบไฟล์ที่ 2
    await page.locator('button:has-text("ลบไฟล์"), button[title="ลบไฟล์"]').first().click();
    await expectNoticeOrToast(page, 'ลบไฟล์เรียบร้อยแล้ว');
    await expect(page.locator(':has-text("document-immunity-2.txt")')).not.toBeVisible();
  });

  // =========================================================================
  // 12. Custom Categories (หมวดหมู่ของฉัน): สร้างหมวดหมู่ -> เพิ่มข้อมูล -> Cross-Link -> ถอดออก
  // =========================================================================
  test('Module 12: Custom Categories - สร้างหมวดหมู่, เพิ่มข้อมูลในหมวด, คลิกเชื่อมข้ามหน้า และถอดออก', async ({ page }) => {
    await ensureLoggedIn(page);

    // 12.1 สร้างหมวดหมู่ใหม่
    await page.locator('button[title="สร้างหมวดหมู่ใหม่"]').click();
    await expect(page.locator('#category-modal-title')).toBeVisible();
    await page.locator('label:has-text("ชื่อหมวดหมู่") input').fill('โปรเจกต์พิเศษ 2026');
    await page.locator('button:has-text("บันทึกหมวดหมู่")').click();
    await expectNoticeOrToast(page, 'สร้างหมวดหมู่เรียบร้อย');

    // 12.2 เข้าสู่หน้าหมวดหมู่
    await page.locator('.custom-cat-row:has-text("โปรเจกต์พิเศษ 2026")').click();
    await expect(page.locator('h2.banner-title:has-text("โปรเจกต์พิเศษ 2026")')).toBeVisible();

    // 12.3 กด "＋ เพิ่มข้อมูลในหมวดนี้" (QuickAdd)
    await page.locator('button:has-text("＋ เพิ่มข้อมูลในหมวดนี้")').first().click();
    await expect(page.locator('#quick-add-cat-title')).toBeVisible();

    // เพิ่มโน้ตในหมวดนี้
    await page.locator('label:has-text("หัวข้อโน้ต") input').fill('บันทึกแผนงานพิเศษในหมวด');
    await page.locator('button:has-text("เพิ่มลงในหมวดหมู่")').click();
    await expectNoticeOrToast(page, 'เพิ่มข้อมูลในหมวดหมู่แล้ว');

    // ตรวจสอบว่าโน้ตปรากฏในหมวดหมู่
    const noteInCat = page.locator('article.life-card:has-text("บันทึกแผนงานพิเศษในหมวด")');
    await expect(noteInCat).toBeVisible();

    // 12.4 ทดสอบคลิกเชื่อมข้ามหน้า (Cross-Linking) -> ต้องพาไปเปิดโน้ตนั้นในหน้า NotesView
    await noteInCat.click();
    await expect(page.locator('.notes-title-input')).toHaveValue('บันทึกแผนงานพิเศษในหมวด');

    // 12.5 กลับมาที่หมวดหมู่และทดสอบถอดรายการออก
    await page.locator('.custom-cat-row:has-text("โปรเจกต์พิเศษ 2026")').click();
    const unlinkBtn = page.locator('article.life-card:has-text("บันทึกแผนงานพิเศษในหมวด") button:has-text("ถอดออก")');
    await expect(unlinkBtn).toBeVisible();
    await unlinkBtn.click();
    await expectNoticeOrToast(page, 'เอาข้อมูลออกจากหมวดนี้แล้ว');
    await expect(page.locator('article.life-card:has-text("บันทึกแผนงานพิเศษในหมวด")')).not.toBeVisible();

    // 12.6 ลบหมวดหมู่
    await page.locator('.module-header-banner button:has-text("ลบ")').click();
    await expectNoticeOrToast(page, 'ลบหมวดหมู่เรียบร้อย');
  });

  // =========================================================================
  // 13. Trash & Recovery: กู้คืนโน้ต และลบถาวร
  // =========================================================================
  test('Module 13: Trash - กู้คืนโน้ต และทดสอบลบถาวรผ่าน PermanentDeleteModal', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'ถังขยะ' }).click();
    await expect(page.locator('h2.banner-title:has-text("ถังขยะ")')).toBeVisible();

    // โน้ตที่ถูกย้ายลงถังขยะใน Module 2 ("โน้ตสถาปัตยกรรม Fastify") ต้องปรากฏในถังขยะ
    const trashedNote = page.locator('article.life-card:has-text("โน้ตสถาปัตยกรรม Fastify")');
    await expect(trashedNote).toBeVisible();

    // 13.1 กู้คืนโน้ต
    await trashedNote.locator('button:has-text("กู้คืน")').click();
    await expectNoticeOrToast(page, 'กู้คืนโน้ตเรียบร้อย');

    // 13.2 กลับไปที่โน้ตเพื่อย้ายกลับลงถังขยะอีกครั้ง
    await page.locator('.nav-item', { hasText: 'โน้ตของฉัน' }).click();
    const noteBack = page.locator('.note-item-card:has-text("โน้ตสถาปัตยกรรม Fastify")');
    await expect(noteBack).toBeVisible();
    await noteBack.locator('button[title="ย้ายลงถังขยะ"]').click();
    await expectNoticeOrToast(page, 'ย้ายโน้ตไปถังขยะแล้ว');

    // 13.3 ไปที่หน้าถังขยะเพื่อลบถาวร
    await page.locator('.nav-item', { hasText: 'ถังขยะ' }).click();
    const trashedAgain = page.locator('article.life-card:has-text("โน้ตสถาปัตยกรรม Fastify")');
    await expect(trashedAgain).toBeVisible();
    await trashedAgain.locator('button:has-text("ลบถาวร")').click();

    // ตรวจสอบ PermanentDeleteModal แสดงคำเตือนชัดเจนและกดยืนยัน
    await expect(page.locator('#permanent-delete-title')).toBeVisible();
    await page.locator('button:has-text("ยืนยันลบถาวร")').click();
    await expectNoticeOrToast(page, 'ลบโน้ตถาวรเรียบร้อยแล้ว');
    await expect(page.locator('article.life-card:has-text("โน้ตสถาปัตยกรรม Fastify")')).not.toBeVisible();
  });
});
