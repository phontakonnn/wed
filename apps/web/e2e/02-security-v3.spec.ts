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

test.describe('PKH / Life OS - Mission 2 (Security, Sharing, Notifications, Invites, History, Export/Import)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('1. Notification Center & Bell Popover in Topbar', async ({ page }) => {
    await ensureLoggedIn(page);

    // Bell button should exist
    const notifBtn = page.getByRole('button', { name: 'แจ้งเตือน', exact: true });
    await expect(notifBtn).toBeVisible({ timeout: 10_000 });
    await notifBtn.click();

    // Notification popover should be visible
    const popover = page.locator('.notification-popover');
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Should contain header "ศูนย์การแจ้งเตือน"
    await expect(popover).toContainText('ศูนย์การแจ้งเตือน');

    // Close by clicking outside or clicking bell again
    await notifBtn.click();
    await expect(popover).not.toBeVisible();
  });

  test('2. Profile Modal: Login History, Sessions & Data Export/Import', async ({ page }) => {
    await ensureLoggedIn(page);

    // Open profile modal via topbar-profile-btn
    const profileBtn = page.locator('.topbar-profile-btn');
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
    await profileBtn.click();

    const profileModal = page.locator('.pkh-modal, .studio-dialog');
    await expect(profileModal).toBeVisible({ timeout: 5_000 });

    // Check tabs: Sessions Tab
    const sessionsTab = page.locator('button', { hasText: 'อุปกรณ์ & เซสชัน' });
    if (await sessionsTab.isVisible()) {
      await sessionsTab.click();
      await expect(page.locator('button', { hasText: 'ออกจากระบบทุกอุปกรณ์' })).toBeVisible();
    }

    // Check tabs: Login History Tab
    const historyTab = page.locator('button', { hasText: 'ประวัติการเข้าสู่ระบบ' });
    if (await historyTab.isVisible()) {
      await historyTab.click();
      await expect(page.locator('text=ประวัติการเข้าสู่ระบบล่าสุด')).toBeVisible();
    }

    // Check tabs: Backup Tab (Export/Import)
    const backupTab = page.locator('button', { hasText: 'สำรอง & กู้คืน' });
    if (await backupTab.isVisible()) {
      await backupTab.click();
      await expect(page.locator('button', { hasText: 'ส่งออกข้อมูลทั้งหมด (JSON)' })).toBeVisible();
    }

    // Close modal
    const closeBtn = page.locator('.pkh-modal-close, button:has-text("ปิด"), button:has-text("ยกเลิก")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('3. Admin Console: Invites & Audit Logs', async ({ page }) => {
    await ensureLoggedIn(page);

    // Go to admin view
    const adminBtn = page.locator('button', { hasText: 'ระบบหลังบ้าน' });
    await expect(adminBtn).toBeVisible();
    await adminBtn.click();

    // Security Gate unlock
    const gateTitle = page.locator('.admin-gate-title');
    await expect(gateTitle).toBeVisible();
    await page.fill('#gate-pass', 'TestPassword123!');
    await page.click('button[type="submit"]', { hasText: 'ปลดล็อก' });

    // Check Admin View title
    await expect(page.locator('.admin-title')).toContainText('ศูนย์ควบคุมระบบหลังบ้าน');

    // Tab: Workspace Invites
    const invitesTab = page.locator('.admin-tab-btn', { hasText: 'รหัสคำเชิญ' });
    await expect(invitesTab).toBeVisible();
    await invitesTab.click();

    await expect(page.locator('.pkh-card-title', { hasText: 'รหัสคำเชิญ' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'สร้างรหัสคำเชิญใหม่' })).toBeVisible();

    // Create a new invite
    await page.locator('button', { hasText: 'สร้างรหัสคำเชิญใหม่' }).click();
    const createModal = page.locator('.pkh-modal-container', { hasText: 'สร้างรหัสคำเชิญใหม่' });
    await expect(createModal).toBeVisible();
    await createModal.locator('button[type="submit"]', { hasText: 'สร้างรหัสคำเชิญ' }).click();

    // Notification of success
    await expect(page.locator('.admin-alert')).toContainText('สร้างรหัสคำเชิญสำเร็จ');

    // Tab: Audit Logs
    const auditTab = page.locator('.admin-tab-btn', { hasText: 'บันทึกกิจกรรม' });
    await expect(auditTab).toBeVisible();
    await auditTab.click();

    await expect(page.locator('.pkh-card-title', { hasText: 'บันทึกกิจกรรม' })).toBeVisible();
    // Refresh button should exist
    await expect(page.locator('button', { hasText: 'รีเฟรช' })).toBeVisible();
  });
});
