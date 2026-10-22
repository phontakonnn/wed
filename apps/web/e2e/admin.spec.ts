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

test.describe('PKH / Life OS - Admin & System Control Center Suite', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('Module Admin: เข้าสู่หน้าแอดมินผ่าน Topbar, ปลดล็อก Admin Gate, จัดการผู้ใช้, ตรวจสอบฐานข้อมูล และตั้งค่าโมดูล', async ({ page }) => {
    await ensureLoggedIn(page);

    // 1. นำทางไปยังหน้า Admin Console ผ่านปุ่ม Topbar "ระบบหลังบ้าน"
    const adminTopBtn = page.locator('button', { hasText: 'ระบบหลังบ้าน' });
    await expect(adminTopBtn).toBeVisible();
    await adminTopBtn.click();

    // 2. Admin Security Gate: ต้องแสดงหน้าถามรหัสผ่านแอดมินก่อน
    await expect(page.locator('.admin-gate-title')).toContainText('ประตูความปลอดภัยระบบหลังบ้าน');
    await page.fill('#gate-pass', 'TestPassword123!');
    await page.click('button[type="submit"]', { hasText: 'ปลดล็อกเข้าสู่ระบบหลังบ้าน' });

    // 3. ตรวจสอบหัวข้อหน้า Admin Console
    await expect(page.locator('.admin-title')).toContainText('ศูนย์ควบคุมระบบหลังบ้าน');

    // 4. Tab 1: ผู้ใช้งานและสิทธิ์ (Users & Access)
    await expect(page.locator('.pkh-card-title', { hasText: 'บัญชีผู้ใช้งาน' })).toBeVisible();

    // 4.1 เพิ่มผู้ใช้ใหม่
    await page.locator('button', { hasText: 'เพิ่มผู้ใช้งานใหม่' }).click();
    await expect(page.locator('.pkh-modal-title', { hasText: 'เพิ่มผู้ใช้งานใหม่' })).toBeVisible();
    await page.locator('input[placeholder*="john_doe"]').fill('test_operator');
    await page.locator('input[placeholder*="อย่างน้อย 12"]').fill('OperatorPass123456!');
    await page.locator('button[type="submit"]', { hasText: 'สร้างบัญชีผู้ใช้' }).click();
    await expect(page.locator('.admin-alert')).toContainText('สร้างผู้ใช้ test_operator สำเร็จ');
    await expect(page.locator('.admin-table td', { hasText: 'test_operator' })).toBeVisible();

    // 5. Tab 2: ฐานข้อมูลและการสำรอง (Database & Backups)
    await page.locator('.admin-tab-btn', { hasText: 'ฐานข้อมูลและการสำรอง' }).click();
    await expect(page.locator('.pkh-card-title', { hasText: 'ข้อมูลสถานะฐานข้อมูล' })).toBeVisible();

    // 5.1 ทดสอบกดปุ่ม Optimize & VACUUM
    const optimizeBtn = page.locator('button', { hasText: 'Optimize & VACUUM' });
    await expect(optimizeBtn).toBeVisible();
    await optimizeBtn.click();
    await expect(page.locator('.admin-alert')).toContainText('ฐานข้อมูลได้รับการปรับแต่ง');

    // 5.2 ทดสอบกดปุ่ม สำรองข้อมูลทันที
    const backupBtn = page.locator('button', { hasText: 'สำรองข้อมูลทันที' });
    await expect(backupBtn).toBeVisible();
    await backupBtn.click();
    await expect(page.locator('.admin-alert')).toContainText('สำรองข้อมูลสำเร็จ');

    // 6. Tab 3: จัดการเว็บไซต์และโมดูลหน้าบ้าน (Site & Modules)
    await page.locator('.admin-tab-btn', { hasText: 'ตั้งค่าเว็บและโมดูล' }).click();
    await expect(page.locator('.pkh-card-title', { hasText: 'อัตลักษณ์เว็บไซต์' })).toBeVisible();

    const titleInput = page.locator('input[value*="PKH"]');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('PKH / Life OS Enterprise');
    await page.locator('button[type="submit"]', { hasText: 'บันทึกการตั้งค่า' }).click();
    await expect(page.locator('.admin-alert')).toContainText('บันทึกการตั้งค่าระบบและโมดูล');
  });
});
