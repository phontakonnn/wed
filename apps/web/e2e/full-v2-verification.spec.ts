import { test, expect } from '@playwright/test';

async function ensureLoggedIn(page: import('@playwright/test').Page, username = 'admin', password = 'TestPassword123!') {
  await page.goto('/');
  const sidebar = page.locator('aside.app-sidebar');
  const loginCard = page.locator('.login-card');
  await expect(sidebar.or(loginCard)).toBeVisible({ timeout: 15_000 });
  if (await loginCard.isVisible()) {
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
  }
}

test.describe('PKH / Life OS - Full V2 Verification Suite (Lifestyle, RBAC, Admin Gate & Lifecycles)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Bookmarks: Continuous Add -> Auto https:// -> Delete -> Continuous Add
  // ---------------------------------------------------------------------------
  test('Bookmarks: เพิ่มต่อเนื่องโดยไม่ต้องรีโหลด, เติม https:// อัตโนมัติ และลบแล้วเพิ่มต่อได้ทันที', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'บุ๊กมาร์ก' }).click();
    await expect(page.locator('.bookmarks-container')).toBeVisible();

    const backBtn = page.locator('button', { hasText: 'ดูลิงก์ทั้งหมด' });
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }

    // 1.1 เพิ่ม Bookmark ที่ 1 (กรอก domain เปล่าๆ ไม่ใส่ https://)
    await page.locator('#bm-url').fill('google.com');
    await page.locator('#bm-title').fill('Google Search Engine');
    await page.locator('button', { hasText: 'บันทึกบุ๊กมาร์ก' }).click();

    // รอการสร้างเสร็จและตรวจสอบว่าเติม https://google.com อัตโนมัติ
    await expect(page.locator('.bookmark-card-modern', { hasText: 'Google Search Engine' })).toBeVisible();
    await expect(page.locator('.bookmark-card-url', { hasText: 'https://google.com' })).toBeVisible();

    // ฟอร์มต้องเคลียร์ค่า input อัตโนมัติ พร้อมกรอกอันที่ 2 ทันที
    await expect(page.locator('#bm-url')).toHaveValue('');

    // 1.2 เพิ่ม Bookmark ที่ 2 ทันที
    await page.locator('#bm-url').fill('github.com');
    await page.locator('#bm-title').fill('GitHub Coding Repository');
    await page.locator('button', { hasText: 'บันทึกบุ๊กมาร์ก' }).click();
    await expect(page.locator('.bookmark-card-modern', { hasText: 'GitHub Coding Repository' })).toBeVisible();

    // 1.3 ลบ Bookmark ที่ 2 ผ่านปุ่ม 🗑️ บนการ์ด
    const bm2 = page.locator('.bookmark-card-modern', { hasText: 'GitHub Coding Repository' });
    await bm2.locator('button', { hasText: 'ลบ' }).click();
    await expect(bm2).not.toBeVisible();

    // 1.4 เพิ่ม Bookmark ที่ 3 ได้ต่อเนื่องทันที
    await page.locator('#bm-url').fill('wikipedia.org');
    await page.locator('#bm-title').fill('Wikipedia Free Encyclopedia');
    await page.locator('button', { hasText: 'บันทึกบุ๊กมาร์ก' }).click();
    await expect(page.locator('.bookmark-card-modern', { hasText: 'Wikipedia Free Encyclopedia' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 2. Notes & Tag Selector: เพิ่มโน้ต, สร้างแท็กใหม่, แนบแท็ก, ลบโน้ต แล้วเพิ่มใหม่
  // ---------------------------------------------------------------------------
  test('Notes & Tag Selector: สร้างโน้ต, สร้างและแนบแท็กใหม่ใน popover, ลบแล้วสร้างใหม่', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'โน้ตของฉัน' }).click();
    await expect(page.locator('.notes-container')).toBeVisible();

    // 2.1 สร้างโน้ตใหม่
    await page.locator('button', { hasText: 'สร้างโน้ตใหม่' }).first().click();
    const titleInput = page.locator('input.notes-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Release Plan v2.0 Note');

    const contentTextarea = page.locator('textarea.notes-content-textarea');
    await expect(contentTextarea).toBeVisible();
    await contentTextarea.fill('# รายละเอียดแผนงาน v2.0\nทดสอบการทำงานของระบบแท็ก');

    // 2.2 เปิด Tag popover แล้วพิมพ์สร้างแท็กใหม่
    await page.locator('button', { hasText: '+ แท็ก' }).click();
    const tagInput = page.locator('.chip-popover input[placeholder*="พิมพ์ชื่อแท็กใหม่"]');
    await expect(tagInput).toBeVisible();
    await tagInput.fill('production-ready');
    await page.locator('.chip-popover button', { hasText: '+ เพิ่ม' }).click();

    // ตรวจสอบว่ามี chip #production-ready ปรากฏบน Notes Chips Bar
    await expect(page.locator('.notes-chip-tag', { hasText: '#production-ready' })).toBeVisible();

    // ปิด popover แท็ก
    await page.locator('.chip-popover button:has-text("✕")').click();

    // 2.3 บันทึกโน้ต
    await page.locator('#note-save-btn').click();

    // ตรวจสอบการ์ดโน้ตในรายการ
    const noteCard = page.locator('.note-item-card', { hasText: 'Release Plan v2.0 Note' });
    await expect(noteCard).toBeVisible();

    // 2.4 ย้ายลงถังขยะผ่านเมนูเพิ่มเติม
    await page.locator('.notes-header-right button:has-text("⋯")').click();
    await page.locator('.popover-menu button:has-text("ย้ายไปถังขยะ")').click();
    await expect(noteCard).not.toBeVisible();

    // 2.5 สร้างโน้ตใหม่อีกรอบทันที
    await page.locator('button', { hasText: 'สร้างโน้ตใหม่' }).first().click();
    await expect(page.locator('input.notes-title-input')).toBeVisible();
    await page.locator('input.notes-title-input').fill('Second Fresh Note');
    await expect(page.locator('input.notes-title-input')).toHaveValue('Second Fresh Note');
  });

  // ---------------------------------------------------------------------------
  // 3. Watchlist Module: หนัง ซีรีส์ อนิเมะ, คะแนนดาว, สถานะ, ลบ แล้วเพิ่มต่อ
  // ---------------------------------------------------------------------------
  test('Watchlist: เพิ่มภาพยนตร์, ให้ดาว, สลับสถานะ, ลบรายการ แล้วเพิ่มรายการใหม่ต่อเนื่อง', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'หนัง/ซีรีส์' }).click();
    await expect(page.locator('.lifestyle-container')).toBeVisible();

    // 3.1 เพิ่มภาพยนตร์ที่ 1
    await page.locator('#wl-title').fill('Inception 2010');
    await page.locator('#wl-type').selectOption('movie');
    await page.locator('#wl-platform').fill('Netflix');
    await page.locator('#wl-url').fill('netflix.com/title/inception');
    // ให้คะแนน 5 ดาว
    await page.locator('.lifestyle-stars span[title*="5 ดาว"]').click();
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();

    // ตรวจสอบการ์ดที่เพิ่ม
    const wl1 = page.locator('.lifestyle-item-card', { hasText: 'Inception 2010' });
    await expect(wl1).toBeVisible();
    await expect(wl1.locator('.lifestyle-badge', { hasText: 'Netflix' })).toBeVisible();

    // 3.2 สลับสถานะผ่าน dropdown บนการ์ดเป็น "ดูจบแล้ว"
    await wl1.locator('select').selectOption('watched');
    await page.locator('.lifestyle-filter-pill', { hasText: 'ดูจบแล้ว' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'Inception 2010' })).toBeVisible();

    // 3.3 กลับมาดูทั้งหมด แล้วเพิ่มรายการที่ 2
    await page.locator('.lifestyle-filter-pill', { hasText: 'ทั้งหมด' }).click();
    await page.locator('#wl-title').fill('Breaking Bad Series');
    await page.locator('#wl-type').selectOption('series');
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();
    const wl2 = page.locator('.lifestyle-item-card', { hasText: 'Breaking Bad Series' });
    await expect(wl2).toBeVisible();

    // 3.4 ลบรายการที่ 2
    await wl2.locator('button', { hasText: 'ลบ' }).click();
    await expect(wl2).not.toBeVisible();

    // 3.5 เพิ่มรายการที่ 3 ได้ทันที
    await page.locator('#wl-title').fill('Spirited Away Anime');
    await page.locator('#wl-type').selectOption('anime');
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'Spirited Away Anime' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 4. Shopping Module: รายการซื้อของ, Bento Summary Math, ติ๊กซื้อแล้ว, ล้างรายการ
  // ---------------------------------------------------------------------------
  test('Shopping List: คำนวณงบประมาณถูกต้อง, ติ๊กซื้อแล้ว, สรุปยอดเงิน และล้างรายการที่ซื้อแล้ว', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'ของใช้ที่ต้องซื้อ' }).click();
    await expect(page.locator('.lifestyle-container')).toBeVisible();

    // 4.1 เพิ่มสินค้าที่ 1: เมล็ดกาแฟ 2 ชิ้น ชิ้นละ 250 บาท (รวม 500)
    await page.locator('#shop-name').fill('เมล็ดกาแฟ Special Blend');
    await page.locator('#shop-category').selectOption('groceries');
    await page.locator('#shop-qty').fill('2');
    await page.locator('#shop-price').fill('250');
    await page.locator('#shop-priority').selectOption('urgent');
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'เมล็ดกาแฟ Special Blend' })).toBeVisible();

    // 4.2 เพิ่มสินค้าที่ 2: แผ่นรองเมาส์ 1 ชิ้น ชิ้นละ 500 บาท
    await page.locator('#shop-name').fill('แผ่นรองเมาส์ Ergonomic Desk Mat');
    await page.locator('#shop-category').selectOption('tech');
    await page.locator('#shop-qty').fill('1');
    await page.locator('#shop-price').fill('500');
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'แผ่นรองเมาส์ Ergonomic Desk Mat' })).toBeVisible();

    // ตรวจสอบ Bento Summary Math: รวมงบที่ต้องซื้อ = 1,000 บาท
    await expect(page.locator('.lifestyle-bento-val', { hasText: '1,000' })).toBeVisible();

    // 4.3 ติ๊กซื้อแล้วที่ เมล็ดกาแฟ
    const coffeeItem = page.locator('.lifestyle-item-card', { hasText: 'เมล็ดกาแฟ Special Blend' });
    await coffeeItem.locator('input[type="checkbox"]').click();

    // รอสรุปยอดอัปเดต: ซื้อแล้ว 500 บาท, ยังต้องซื้อ 500 บาท
    await expect(page.locator('.lifestyle-bento-card:has-text("ยอดที่ซื้อไปแล้ว") .lifestyle-bento-val')).toContainText('500');
    await expect(page.locator('.lifestyle-bento-card:has-text("ยอดงบประมาณที่ต้องซื้อ") .lifestyle-bento-val')).toContainText('500');

    // 4.4 กดปุ่ม "ล้างรายการที่ซื้อแล้ว"
    await page.locator('button', { hasText: 'ล้างรายการที่ซื้อแล้ว' }).click();

    // ตรวจสอบว่า เมล็ดกาแฟ หายไป แต่ แผ่นรองเมาส์ ยังอยู่
    await expect(coffeeItem).not.toBeVisible();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'แผ่นรองเมาส์' })).toBeVisible();

    // 4.5 เพิ่มสินค้าชิ้นต่อไปได้ทันที
    await page.locator('#shop-name').fill('สมุดจดไอเดีย Pocket Notebook');
    await page.locator('#shop-qty').fill('3');
    await page.locator('#shop-price').fill('40');
    await page.locator('button', { hasText: '＋ บันทึกรายการ' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'สมุดจดไอเดีย' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 5. Travel Module: สถานที่เที่ยว, งบประมาณ, แผนการเดินทาง, ลบ และเพิ่มใหม่
  // ---------------------------------------------------------------------------
  test('Travel Wishlist: เพิ่มสถานที่ท่องเที่ยว, วันที่เดินทาง, เปลี่ยนสถานะ, ลบ และเพิ่มใหม่', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.locator('.nav-item', { hasText: 'สถานที่เที่ยว' }).click();
    await expect(page.locator('.lifestyle-container')).toBeVisible();

    // 5.1 เพิ่มสถานที่ท่องเที่ยวที่ 1
    await page.locator('#tr-name').fill('ดอยอินทนนท์ เชียงใหม่');
    await page.locator('#tr-cat').selectOption('nature');
    await page.locator('#tr-location').fill('จอมทอง, เชียงใหม่');
    await page.locator('#tr-budget').fill('4500');
    await page.locator('#tr-date').fill('2026-12-25');
    await page.locator('#tr-status').selectOption('planned');
    await page.locator('button', { hasText: '＋ บันทึกสถานที่' }).click();

    const tr1 = page.locator('.lifestyle-item-card', { hasText: 'ดอยอินทนนท์ เชียงใหม่' });
    await expect(tr1).toBeVisible();
    await expect(tr1).toContainText('เชียงใหม่');

    // 5.2 เพิ่มสถานที่ที่ 2
    await page.locator('#tr-name').fill('หาดไร่เลย์ กระบี่');
    await page.locator('#tr-cat').selectOption('beach');
    await page.locator('button', { hasText: '＋ บันทึกสถานที่' }).click();
    const tr2 = page.locator('.lifestyle-item-card', { hasText: 'หาดไร่เลย์ กระบี่' });
    await expect(tr2).toBeVisible();

    // 5.3 ลบสถานที่ที่ 2
    await tr2.locator('button', { hasText: 'ลบ' }).click();
    await expect(tr2).not.toBeVisible();

    // 5.4 เพิ่มสถานที่ที่ 3 ได้ทันที
    await page.locator('#tr-name').fill('Tokyo Skytree');
    await page.locator('#tr-cat').selectOption('international');
    await page.locator('#tr-location').fill('Tokyo, Japan');
    await page.locator('button', { hasText: '＋ บันทึกสถานที่' }).click();
    await expect(page.locator('.lifestyle-item-card', { hasText: 'Tokyo Skytree' })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Security Gate & RBAC: ปลดล็อก, สร้าง User ธรรมดา, ตรวจ 403 Forbidden
  // ---------------------------------------------------------------------------
  test('Admin Security Gate & RBAC: แอดมินปลดล็อกและสร้าง User ใหม่ -> User ธรรมดาถูกบล็อก 403 Forbidden', async ({ page }) => {
    await ensureLoggedIn(page);

    // 6.1 เข้าสู่ระบบหลังบ้านผ่านปุ่ม Topbar
    const adminTopBtn = page.locator('button', { hasText: 'ระบบหลังบ้าน' });
    await expect(adminTopBtn).toBeVisible();
    await adminTopBtn.click();

    // 6.2 Admin Security Gate ต้องบล็อกไว้จนกว่าจะกรอกรหัสผ่าน
    await expect(page.locator('.admin-gate-title')).toContainText('ประตูความปลอดภัยระบบหลังบ้าน');
    await page.fill('#gate-pass', 'TestPassword123!');
    await page.click('button[type="submit"]', { hasText: 'ปลดล็อกเข้าสู่ระบบหลังบ้าน' });

    // เข้าสู่คอนโซลสำเร็จ
    await expect(page.locator('.admin-title')).toContainText('ศูนย์ควบคุมระบบหลังบ้าน');

    // 6.3 สร้างผู้ใช้ธรรมดา (Role = User)
    await page.locator('button', { hasText: 'เพิ่มผู้ใช้งานใหม่' }).click();
    await expect(page.locator('.pkh-modal-title', { hasText: 'เพิ่มผู้ใช้งานใหม่' })).toBeVisible();
    await page.locator('input[placeholder*="john_doe"]').fill('test_regular_user');
    await page.locator('input[placeholder*="อย่างน้อย 12"]').fill('RegularPass123456!');
    // Role ค่าเริ่มต้นคือ user อยู่แล้ว
    await page.locator('button[type="submit"]', { hasText: 'สร้างบัญชีผู้ใช้' }).click();
    await expect(page.locator('.admin-alert')).toContainText('สร้างผู้ใช้ test_regular_user สำเร็จ');
    await expect(page.locator('.admin-table td', { hasText: 'test_regular_user' })).toBeVisible();

    // 6.4 ออกจากระบบแอดมิน
    await page.locator('button', { hasText: 'กลับสู่หน้าบ้าน' }).click();
    await page.locator('.topbar-logout-btn').click();

    // 6.5 เข้าสู่ระบบด้วย User ธรรมดา (test_regular_user)
    await page.fill('#username', 'test_regular_user');
    await page.fill('#password', 'RegularPass123456!');
    await page.click('button[type="submit"]');
    await expect(page.locator('aside.app-sidebar')).toBeVisible();

    // ยืนยันว่าปุ่ม "ระบบหลังบ้าน" จะต้องไม่ปรากฏบนหน้าจอของ User ธรรมดา
    await expect(page.locator('button', { hasText: 'ระบบหลังบ้าน' })).not.toBeVisible();

    // 6.6 ทดสอบยิง API หลังบ้านโดยตรงผ่าน context session ของ user ธรรมดา -> ต้องได้ 403 Forbidden
    const adminApiRes = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/users', {
          headers: { 'x-pkh-request': '1' }
        });
        return { status: res.status };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    expect(adminApiRes.status).toBe(403);
  });
});
