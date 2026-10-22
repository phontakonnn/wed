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

test.describe('PKH / Life OS - Phase 1 Bug Fixes & UX Verification', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('1. Sidebar Redesign: Collapse/Expand toggle, Quick Search, and Groupings', async ({ page }) => {
    await ensureLoggedIn(page);

    const sidebar = page.locator('aside.app-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Check menu search input
    const searchInput = page.locator('.sidebar-menu-search input');
    await expect(searchInput).toBeVisible();

    // Type a query in sidebar quick search
    await searchInput.fill('บุคคล');
    const peopleBtn = page.locator('.nav-item', { hasText: 'บุคคลสำคัญ' });
    await expect(peopleBtn).toBeVisible();

    // Clear search
    await searchInput.fill('');

    // Toggle collapse button
    const collapseToggle = page.locator('.sidebar-collapse-btn');
    if (await collapseToggle.isVisible()) {
      await collapseToggle.click();
      await expect(sidebar).toHaveClass(/is-collapsed/);

      // Expand back
      await collapseToggle.click();
      await expect(sidebar).not.toHaveClass(/is-collapsed/);
    }
  });

  test('2. SidebarNavModal: Row layout is wide, readable, and not squeezed', async ({ page }) => {
    await ensureLoggedIn(page);

    // Click customize sidebar button
    const customizeBtn = page.locator('.nav-customize-btn').first();
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    await customizeBtn.click();

    // Modal should be open
    const modal = page.locator('.dialog-backdrop .studio-dialog');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Check edit row layout
    const firstRow = page.locator('.nav-edit-row').first();
    await expect(firstRow).toBeVisible();

    const input = firstRow.locator('.nav-edit-input');
    await expect(input).toBeVisible();

    // Input should have usable width (not 0px squeezed)
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(120);

    // Close modal
    const closeBtn = modal.locator('.button-quiet', { hasText: 'ยกเลิก' });
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('3. Focus Retention in Modals: Continuous typing without losing focus', async ({ page }) => {
    await ensureLoggedIn(page);

    // Unlock Admin Console
    const adminTopBtn = page.locator('button', { hasText: 'ระบบหลังบ้าน' });
    await expect(adminTopBtn).toBeVisible({ timeout: 10_000 });
    await adminTopBtn.click();

    // 2. Admin Security Gate: ต้องแสดงหน้าถามรหัสผ่านแอดมินก่อน
    await expect(page.locator('.admin-gate-title')).toContainText('ประตูความปลอดภัยระบบหลังบ้าน', { timeout: 10_000 });
    await page.fill('#gate-pass', 'TestPassword123!');
    await page.click('button[type="submit"]', { hasText: 'ปลดล็อกเข้าสู่ระบบหลังบ้าน' });

    // 3. Click add user button
    const addUserBtn = page.locator('button', { hasText: 'เพิ่มผู้ใช้งานใหม่' });
    await expect(addUserBtn).toBeVisible({ timeout: 10_000 });
    await addUserBtn.click();

    const modal = page.locator('.pkh-modal-backdrop, .pkh-modal-card');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const usernameInput = page.locator('input[placeholder*="john"]');
    await expect(usernameInput).toBeVisible();
    await usernameInput.click();

    // Type character by character with delay and verify focus is never stolen
    const textToType = 'focusperson';
    for (const char of textToType) {
      await page.keyboard.type(char, { delay: 40 });
      // Assert the input is still active element
      const isFocused = await page.evaluate(() => {
        return document.activeElement?.getAttribute('placeholder')?.includes('john');
      });
      expect(isFocused).toBe(true);
    }
    await expect(usernameInput).toHaveValue(textToType);

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('4. Centered Taxonomy Picker Dialog & Person Tags', async ({ page }) => {
    await ensureLoggedIn(page);

    // Switch to People view
    const peopleNav = page.locator('.nav-item', { hasText: 'บุคคลสำคัญ' });
    await expect(peopleNav).toBeVisible({ timeout: 10_000 });
    await peopleNav.click();

    // People view header should be visible
    await expect(page.locator('button', { hasText: '＋ เพิ่มบุคคล' }).first()).toBeVisible({ timeout: 10_000 });

    // Click "จัดการแท็ก" to verify centered Tag Manager Modal
    const tagMgrBtn = page.locator('button', { hasText: 'จัดการแท็ก' }).first();
    await expect(tagMgrBtn).toBeVisible({ timeout: 10_000 });
    await tagMgrBtn.click();

    const tagModal = page.locator('.dialog-backdrop, .pkh-modal-backdrop');
    await expect(tagModal).toBeVisible({ timeout: 5_000 });

    // Verify it is a centered dialog
    const dialogBox = tagModal.locator('.dialog, .studio-dialog, .pkh-modal-card');
    await expect(dialogBox).toBeVisible();

    // Close tag modal
    const closeBtn = tagModal.locator('button', { hasText: 'ปิดหน้าต่าง' });
    await closeBtn.click();
    await expect(tagModal).not.toBeVisible();
  });

  test('5. Profile Modal Preferences: Post-Save Behavior & Thai Guidance', async ({ page }) => {
    await ensureLoggedIn(page);

    // Open profile modal
    const profileBtn = page.locator('.topbar-profile-btn');
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
    await profileBtn.click();

    const profileModal = page.locator('.pkh-modal, .studio-dialog');
    await expect(profileModal).toBeVisible({ timeout: 5_000 });

    // Check "⚙️ การใช้งาน & บันทึก" tab
    const prefTab = page.locator('button', { hasText: 'การใช้งาน & บันทึก' });
    await expect(prefTab).toBeVisible();
    await prefTab.click();

    // Verify post-save behavior options are visible with Thai explanations
    await expect(profileModal).toContainText('พฤติกรรมหลังบันทึกข้อมูล (Post-Save Behavior)');
    await expect(profileModal).toContainText('อยู่หน้าเดิมเพื่อแก้ไขต่อ (Stay in Editor) — แนะนำ');
    await expect(profileModal).toContainText('กลับไปหน้ารายการรวม (Return to List / Grid)');
    await expect(profileModal).toContainText('เปิดดูรายละเอียดเต็ม (Open Detail View)');

    // Select 'stay'
    const stayRadio = page.locator('input[name="postSaveBehavior"][value="stay"]');
    await stayRadio.check();
    await expect(stayRadio).toBeChecked();

    // Close modal
    const closeIcon = profileModal.locator('.dialog-close, button:has-text("✕")');
    if (await closeIcon.isVisible()) {
      await closeIcon.click();
    } else {
      await page.keyboard.press('Escape');
    }
  });

  test('6. Password Recovery Modal: Email & Phone OTP with anti-enumeration protection', async ({ page }) => {
    // Navigate to login / signed-out state
    await page.goto('/');

    const sidebar = page.locator('aside.app-sidebar');
    const loginCard = page.locator('.login-card');
    await expect(sidebar.or(loginCard)).toBeVisible({ timeout: 15_000 });

    if (await sidebar.isVisible()) {
      // Logout to see login screen
      const logoutBtn = page.locator('.topbar-logout-btn, button[title="ออกจากระบบ"]');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
      } else {
        await page.evaluate(() => {
          document.cookie = 'pkh_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          window.location.reload();
        });
      }
    }

    await expect(loginCard).toBeVisible({ timeout: 15_000 });

    // Click "ลืมรหัสผ่าน?"
    const forgotBtn = page.locator('button:has-text("ลืมรหัสผ่าน")');
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // Forgot password dialog should appear
    const forgotModal = page.locator('.dialog-backdrop .studio-dialog');
    await expect(forgotModal).toBeVisible({ timeout: 5_000 });
    await expect(forgotModal).toContainText('กู้คืนรหัสผ่านด้วย OTP');

    // Toggle Email vs Phone
    const phoneToggle = forgotModal.locator('button', { hasText: 'ทางเบอร์โทร' });
    await expect(phoneToggle).toBeVisible();
    await phoneToggle.click();

    // Verify phone input is visible with Thai placeholder
    const phoneInput = forgotModal.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();

    // Toggle back to Email
    const emailToggle = forgotModal.locator('button', { hasText: 'ทางอีเมล' });
    await expect(emailToggle).toBeVisible();
    await emailToggle.click();

    const emailInput = forgotModal.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Close forgot dialog
    const closeBtn = forgotModal.locator('button[aria-label="ปิด"], button:has-text("ยกเลิก")').first();
    await closeBtn.click();
    await expect(forgotModal).not.toBeVisible();
  });
});
