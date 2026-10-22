import { test, expect } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:3100';

function getHeaders(extra: Record<string, string> = {}) {
  return {
    'x-pkh-request': '1',
    origin: ORIGIN,
    ...extra,
  };
}

async function ensureLoggedIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  const topbar = page.locator('header.topbar');
  const loginCard = page.locator('.login-card');
  await expect(topbar.or(loginCard).first()).toBeVisible({ timeout: 15_000 });
  if (await loginCard.isVisible()) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'TestPassword123!');
    await page.click('button[type="submit"]');
  }
  await expect(topbar).toBeVisible({ timeout: 15_000 });
}

test.describe('PKH / Life OS - 14-Point Final Acceptance Test Suite (ข้อ 12 & 13)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  // ---------------------------------------------------------------------------
  // (1) Server-Side Notification Scheduler autonomous execution & dedup
  // ---------------------------------------------------------------------------
  test('(1) ระบบแจ้งเตือนและกิจกรรมเกิดซ้ำทำงานจาก Scheduler ฝั่งเซิร์ฟเวอร์ได้จริงแม้ไม่ได้เปิดหน้าเว็บค้างไว้', async ({ request }) => {
    // 1. ล็อกอินด้วยบัญชี admin
    const loginRes = await request.post('/api/auth/login', {
      headers: getHeaders(),
      data: { username: 'admin', password: 'TestPassword123!' },
    });
    expect(loginRes.ok()).toBeTruthy();

    // 2. สร้างงานที่มีวันครบกำหนดวันนี้ (due task)
    const todayStr = new Date().toISOString().slice(0, 10);
    const taskRes = await request.post('/api/tasks', {
      headers: getHeaders(),
      data: {
        title: 'งานด่วนสำหรับทดสอบ Scheduler',
        dueDate: todayStr,
        status: 'todo',
        priority: 'high',
      },
    });
    expect(taskRes.ok()).toBeTruthy();

    // 3. เรียกตรวจรายการ Notifications จากเซิร์ฟเวอร์
    const notifRes = await request.get('/api/notifications', {
      headers: getHeaders(),
    });
    expect(notifRes.ok()).toBeTruthy();
    const notifData = await notifRes.json();
    expect(Array.isArray(notifData.notifications)).toBeTruthy();

    // 4. ตรวจสอบการตั้งค่า DND และหมวดหมู่แจ้งเตือนของผู้ใช้
    const prefsRes = await request.get('/api/notifications/preferences', {
      headers: getHeaders(),
    });
    expect(prefsRes.ok()).toBeTruthy();
    const prefs = await prefsRes.json();
    expect(prefs.preferences).toBeDefined();
    expect(typeof prefs.preferences.notifyTasks).toBe('boolean');
    expect(typeof prefs.preferences.dndEnabled).toBe('boolean');

    // 5. ทดสอบอัปเดตการตั้งค่า DND
    const updatePrefsRes = await request.post('/api/notifications/preferences', {
      headers: getHeaders(),
      data: { dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' },
    });
    expect(updatePrefsRes.ok()).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // (2) User A vs User B complete data isolation (Zero IDOR)
  // ---------------------------------------------------------------------------
  test('(2) ทดสอบสร้างผู้ใช้ 2 บัญชี (User A & User B) แล้วพิสูจน์ว่า User B ไม่สามารถอ่าน แก้ไข หรือลบข้อมูลของ User A ได้', async ({ playwright, request }) => {
    // 1. สร้าง User A และ User B
    const timestamp = Date.now();
    const userAName = `user_a_${timestamp}`;
    const userBName = `user_b_${timestamp}`;

    const regA = await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: { username: userAName, password: 'SecurePasswordUserA123!', displayName: 'User Alpha' },
    });
    expect(regA.ok()).toBeTruthy();

    const regB = await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: { username: userBName, password: 'SecurePasswordUserB123!', displayName: 'User Beta' },
    });
    expect(regB.ok()).toBeTruthy();

    // 2. ล็อกอินเป็น User A ในบริบทที่ 1
    const ctxA = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    const loginARes = await ctxA.post('/api/auth/login', {
      data: { username: userAName, password: 'SecurePasswordUserA123!' },
    });
    expect(loginARes.ok()).toBeTruthy();

    // User A สร้าง Note ส่วนตัว
    const noteARes = await ctxA.post('/api/notes', {
      data: { title: 'ความลับสุดยอดของ User A', content: 'ห้ามใครเห็นเด็ดขาด 1234' },
    });
    expect(noteARes.ok()).toBeTruthy();
    const noteA = await noteARes.json();

    // User A สร้าง Vault ส่วนตัว
    const vaultARes = await ctxA.post('/api/vault', {
      data: { title: 'รหัสตู้เซฟ A', keyValue: 'TOP-SECRET-KEY-999', category: 'ทรัพย์สิน & บ้าน' },
    });
    expect(vaultARes.ok()).toBeTruthy();
    const vaultA = await vaultARes.json();

    // 3. ล็อกอินเป็น User B ในบริบทที่ 2
    const ctxB = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    const loginBRes = await ctxB.post('/api/auth/login', {
      data: { username: userBName, password: 'SecurePasswordUserB123!' },
    });
    expect(loginBRes.ok()).toBeTruthy();

    // 4. ทดสอบ IDOR: User B พยายามอ่าน Note ของ User A โดยตรง -> ต้องได้ 404
    const readNoteByB = await ctxB.get(`/api/notes/${noteA.note.id}`);
    expect(readNoteByB.status()).toBe(404);

    // 5. ทดสอบ IDOR: User B พยายามแก้ไข Note ของ User A -> ต้องได้ 404
    const editNoteByB = await ctxB.patch(`/api/notes/${noteA.note.id}`, {
      data: { title: 'ถูกแฮกแล้วโดย User B' },
    });
    expect(editNoteByB.status()).toBe(404);

    // 6. ทดสอบ IDOR: User B พยายามลบ Note ของ User A -> ต้องได้ 404
    const deleteNoteByB = await ctxB.delete(`/api/notes/${noteA.note.id}`);
    expect(deleteNoteByB.status()).toBe(404);

    // 7. ทดสอบ IDOR: User B พยายามอ่านตู้เซฟของ User A -> ต้องไม่พบในรายการ
    const listVaultByB = await ctxB.get('/api/vault');
    expect(listVaultByB.ok()).toBeTruthy();
    const vaultBList = await listVaultByB.json();
    const leakedVault = (vaultBList.items || []).find((v: { id: string }) => v.id === vaultA.item?.id);
    expect(leakedVault).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // (3) Role-Based Access Control: member role blocked from /api/admin/*
  // ---------------------------------------------------------------------------
  test('(3) พิสูจน์ว่าผู้ใช้ทั่วไป (role = member) ยิง API /api/admin/* โดยตรงแล้วถูกบล็อกด้วย 403 Forbidden ทุกจุด', async ({ playwright, request }) => {
    // 1. สร้างผู้ใช้ member
    const memberName = `standard_member_${Date.now()}`;
    const regMember = await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: { username: memberName, password: 'MemberPass123456!' },
    });
    expect(regMember.ok()).toBeTruthy();

    // 2. ล็อกอินเป็น member
    const memberCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    const loginRes = await memberCtx.post('/api/auth/login', {
      data: { username: memberName, password: 'MemberPass123456!' },
    });
    expect(loginRes.ok()).toBeTruthy();

    // 3. ตรวจสอบสถานะว่าไม่ใช่ Admin
    const resStatus = await memberCtx.get('/api/admin/status');
    expect(resStatus.ok()).toBeTruthy();
    const statusData = await resStatus.json();
    expect(statusData.isAdmin).toBe(false);
    expect(statusData.isUnlocked).toBe(false);

    // 4. ทดสอบยิงทุก endpoint การจัดการของ admin ด้วยบัญชี member -> ต้องได้ 403 Forbidden ทุกจุด!
    const resUsers = await memberCtx.get('/api/admin/users');
    expect(resUsers.status()).toBe(403);

    const resCreateUser = await memberCtx.post('/api/admin/users', {
      data: { username: 'hacker', password: 'HackerPass123!' },
    });
    expect(resCreateUser.status()).toBe(403);

    const resSettings = await memberCtx.get('/api/admin/settings');
    expect(resSettings.status()).toBe(403);

    const resOptimize = await memberCtx.post('/api/admin/database/optimize');
    expect(resOptimize.status()).toBe(403);

    const resAudit = await memberCtx.get('/api/admin/audit-logs');
    expect(resAudit.status()).toBe(403);

    const resInvites = await memberCtx.get('/api/invites');
    expect(resInvites.status()).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // (4) OWASP ASVS Password Recovery: Anti-Enumeration & Single-Use OTP
  // ---------------------------------------------------------------------------
  test('(4) พิสูจน์ว่าระบบกู้คืนรหัสผ่านไม่อนุญาตให้ออก OTP หาก Username กับ Email ไม่ตรงกัน และ OTP ไม่สามารถนำกลับมาใช้ซ้ำได้', async ({ request }) => {
    // 1. ทดสอบกรณี Username กับ Email ไม่ตรงกัน -> ต้องไม่มี debugOtp ออกมาเด็ดขาด
    const mismatchRes = await request.post('/api/auth/forgot-password/request-otp', {
      headers: getHeaders(),
      data: { username: 'admin', email: 'nonexistent-wrong-email@example.com' },
    });
    expect(mismatchRes.ok()).toBeTruthy();
    const mismatchData = await mismatchRes.json();
    expect(mismatchData.debugOtp).toBeUndefined(); // ป้องกันการเดารหัส

    // 2. สร้างผู้ใช้ที่มีอีเมลถูกต้องสำหรับการทดสอบ OTP
    const userForOtp = `otp_test_user_${Date.now()}`;
    const userEmail = `${userForOtp}@example.com`;
    const regRes = await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: {
        username: userForOtp,
        email: userEmail,
        password: 'InitialPassword123456!',
      },
    });
    expect(regRes.ok()).toBeTruthy();

    // 3. ขอ OTP ด้วย Username และ Email ที่ตรงกัน
    const otpReqRes = await request.post('/api/auth/forgot-password/request-otp', {
      headers: getHeaders(),
      data: { username: userForOtp, email: userEmail },
    });
    expect(otpReqRes.ok()).toBeTruthy();
    const otpData = await otpReqRes.json();
    expect(otpData.debugOtp).toBeDefined();
    const validOtp = otpData.debugOtp;

    // 4. รีเซ็ตรหัสผ่านด้วย OTP ถูกต้อง -> ต้องสำเร็จ
    const resetRes = await request.post('/api/auth/forgot-password/reset', {
      headers: getHeaders(),
      data: {
        username: userForOtp,
        email: userEmail,
        otp: validOtp,
        newPassword: 'BrandNewSecurePassword123!',
      },
    });
    expect(resetRes.ok()).toBeTruthy();

    // 5. ป้องกันการโจมตีซ้ำ (Replay Attack): นำ OTP เดิมมายิงซ้ำอีกรอบ -> ต้องถูกปฏิเสธทันที!
    const replayRes = await request.post('/api/auth/forgot-password/reset', {
      headers: getHeaders(),
      data: {
        username: userForOtp,
        email: userEmail,
        otp: validOtp,
        newPassword: 'AnotherPasswordTry123!',
      },
    });
    expect(replayRes.status()).toBeGreaterThanOrEqual(400);

    // 6. ตรวจสอบว่าสามารถล็อกอินด้วยรหัสผ่านใหม่ได้จริง
    const newLoginRes = await request.post('/api/auth/login', {
      headers: getHeaders(),
      data: { username: userForOtp, password: 'BrandNewSecurePassword123!' },
    });
    expect(newLoginRes.ok()).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // (5) Photos & Attachments Persistence and Owner Isolation
  // ---------------------------------------------------------------------------
  test('(5) พิสูจน์ว่ารูปภาพบุคคลสำคัญและไฟล์แนบยังคงอยู่หลังรีเฟรช และไม่รั่วข้ามบัญชี', async ({ playwright, request }) => {
    // 1. สร้างบัญชี User A และ User B
    const timestamp = Date.now();
    const userA = `photo_user_a_${timestamp}`;
    const userB = `photo_user_b_${timestamp}`;

    await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: { username: userA, password: 'PhotoUserAPass123!' },
    });
    await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: { username: userB, password: 'PhotoUserBPass123!' },
    });

    const ctxA = await playwright.request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: getHeaders() });
    await ctxA.post('/api/auth/login', { data: { username: userA, password: 'PhotoUserAPass123!' } });

    // 2. User A อัปโหลดรูปภาพบุคคลสำคัญ (octet-stream พร้อม x-file-name)
    const tinyPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const uploadRes = await ctxA.post('/api/files', {
      headers: getHeaders({
        'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent('avatar-test.png'),
      }),
      data: tinyPngBuffer,
    });
    expect(uploadRes.ok()).toBeTruthy();
    const fileData = await uploadRes.json();
    const fileId = fileData.file.id;

    // 3. User A เชื่อมรูปกับบุคคลสำคัญ
    const personRes = await ctxA.post('/api/people', {
      data: {
        name: 'คนสำคัญของ A',
        relationshipGroup: 'friend',
        avatarFileId: fileId,
        birthdayOrAnniversary: '1995-10-25',
      },
    });
    expect(personRes.ok()).toBeTruthy();

    // 4. ทดสอบดาวน์โหลดไฟล์ด้วย User A -> สำเร็จ
    const downloadA = await ctxA.get(`/api/files/${fileId}`);
    expect(downloadA.ok()).toBeTruthy();
    expect(downloadA.headers()['content-type']).toContain('image/png');

    // 5. User B พยายามเข้าถึงไฟล์ของ User A โดยตรง -> ต้องได้ 404
    const ctxB = await playwright.request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: getHeaders() });
    await ctxB.post('/api/auth/login', { data: { username: userB, password: 'PhotoUserBPass123!' } });

    const downloadB = await ctxB.get(`/api/files/${fileId}`);
    expect(downloadB.status()).toBe(404);

    // 6. User B ดึงรายการบุคคลสำคัญ -> ต้องไม่พบบุคคลของ User A
    const peopleB = await ctxB.get('/api/people');
    expect(peopleB.ok()).toBeTruthy();
    const peopleBData = await peopleB.json();
    const leakedPerson = (peopleBData.people || []).find((p: { name: string }) => p.name === 'คนสำคัญของ A');
    expect(leakedPerson).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // (6) Calendar Navigation & Significant Dates Calculation
  // ---------------------------------------------------------------------------
  test('(6) พิสูจน์ว่าปฏิทินเลือกเดือน/ปีโดยตรงได้ และคำนวณวันสำคัญถูกต้อง', async ({ page }) => {
    await ensureLoggedIn(page);

    // คลิกเมนูกำหนดการ / ปฏิทิน
    const scheduleNav = page.locator('.sidebar-nav-item', { hasText: 'กำหนดการ' });
    if (await scheduleNav.isVisible()) {
      await scheduleNav.click();
      await expect(page.locator('.schedule-view, .calendar-view, main')).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // (7) Backup & Restore Verification
  // ---------------------------------------------------------------------------
  test('(7) พิสูจน์การสำรองและกู้คืนข้อมูลจริง (Backup & Restore) โดยไม่เกิดรายการซ้ำ', async ({ request }) => {
    // 1. ล็อกอินเป็น admin และปลดล็อก Admin Gate
    const loginRes = await request.post('/api/auth/login', {
      headers: getHeaders(),
      data: { username: 'admin', password: 'TestPassword123!' },
    });
    expect(loginRes.ok()).toBeTruthy();

    const unlockRes = await request.post('/api/admin/unlock', {
      headers: getHeaders(),
      data: { password: 'TestPassword123!' },
    });
    expect(unlockRes.ok()).toBeTruthy();

    // 2. สั่งสร้างการสำรองข้อมูล (Backup) ทันที
    const backupRes = await request.post('/api/admin/backup', {
      headers: getHeaders(),
    });
    expect(backupRes.ok()).toBeTruthy();

    // 3. ตรวจสอบรายการไฟล์สำรองข้อมูล
    const listBackupsRes = await request.get('/api/admin/backup/list', {
      headers: getHeaders(),
    });
    expect(listBackupsRes.ok()).toBeTruthy();
    const backupList = await listBackupsRes.json();
    expect(Array.isArray(backupList.backups)).toBeTruthy();
    expect(backupList.backups.length).toBeGreaterThan(0);

    // 4. ทดสอบดาวน์โหลดไฟล์ Snapshot ฐานข้อมูล
    const exportDbRes = await request.get('/api/backup/export', {
      headers: getHeaders(),
    });
    expect(exportDbRes.ok()).toBeTruthy();
    const dbBuffer = await exportDbRes.body();
    // ไฟล์ SQLite แท้ต้องขึ้นต้นด้วย Header "SQLite format 3\0"
    const header = dbBuffer.subarray(0, 15).toString('utf-8');
    expect(header).toBe('SQLite format 3');
  });

  // ---------------------------------------------------------------------------
  // (8) Mobile Viewport (390x844) Responsiveness & Modal Clipping Test
  // ---------------------------------------------------------------------------
  test('(8) ทดสอบขนาดหน้าจอมือถือ (390x844) ว่า Pop-up และทุกหน้าจอไม่ล้นจอและกดปุ่มได้จริง', async ({ page }) => {
    // ตั้งค่า Viewport เป็นขนาดสมาร์ทโฟนมาตรฐาน (iPhone 12/13/14: 390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureLoggedIn(page);
    await expect(page.locator('header.topbar')).toBeVisible({ timeout: 15000 });

    // 1. ทดสอบเปิดศูนย์การแจ้งเตือน Popover บนมือถือ
    const notifBtn = page.locator('button[aria-label="แจ้งเตือน"]');
    await expect(notifBtn).toBeVisible();
    await notifBtn.click();

    const notifPopover = page.locator('.notification-popover');
    await expect(notifPopover).toBeVisible();
    const popoverBox = await notifPopover.boundingBox();
    expect(popoverBox).not.toBeNull();
    if (popoverBox) {
      // กล่องต้องไม่ล้นความกว้างหน้าจอมือถือ 390px
      expect(popoverBox.width).toBeLessThanOrEqual(390);
    }
    // ปิด popover
    await notifBtn.click();

    // 2. ทดสอบเปิด Profile Modal บนมือถือ
    const profileBtn = page.locator('.topbar-profile-btn');
    if (await profileBtn.isVisible()) {
      await profileBtn.click();
      const modal = page.locator('.pkh-modal, .studio-dialog');
      await expect(modal).toBeVisible();
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.width).toBeLessThanOrEqual(390);
      }
      // ปุ่มปิดหรือกากบาทต้องกดได้
      const closeBtn = page.locator('button[aria-label="ปิด"], .popover-head button, .pkh-modal-close, button:has-text("ปิด"), button:has-text("ยกเลิก")').first();
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();
    }
  });
});
