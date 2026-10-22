import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// Server-defined rate limit threshold: LOGIN_FAILURE_LIMIT = 5
// 5 consecutive failed attempts return 401; the 6th attempt triggers 429 Too Many Requests.
const LOGIN_FAILURE_THRESHOLD = 5;

async function ensureLoggedIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  const sidebar = page.locator('aside.app-sidebar');
  const loginCard = page.locator('.login-card');
  await expect(sidebar.or(loginCard)).toBeVisible();
  if (await loginCard.isVisible()) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await expect(sidebar).toBeVisible();
  }
}

test.describe('PKH / Life OS - Full System E2E Test Suite', () => {
  test.describe.configure({ mode: 'serial' });

  // --------------------------------------------------------------------------
  // ท่าที่ 1: เรียก endpoint ที่ต้อง login โดยไม่มี session -> 401 และ UI แสดงหน้า login
  // --------------------------------------------------------------------------
  test('ท่าที่ 1: เรียก endpoint โดยไม่มี session ได้รหัส 401 และหน้าเว็บแสดงฟอร์มเข้าสู่ระบบ', async ({
    page,
    request,
  }) => {
    // 1.1 ตรวจสอบ API: เรียก endpoint ที่ต้องล็อกอินโดยไม่มี session cookie
    const apiRes = await request.get('/api/notes');
    expect(apiRes.status()).toBe(401);
    const body = await apiRes.json();
    expect(body).toHaveProperty('error');

    // 1.2 ตรวจสอบ UI: เปิดหน้าเว็บหลักโดยยังไม่ล็อกอิน
    await page.goto('/');
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('ยินดีต้อนรับกลับ');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('เข้าสู่ระบบ');
  });

  // --------------------------------------------------------------------------
  // ท่าที่ 2: Login -> สร้างโน้ต -> แก้ไข -> ค้นหา -> ลบลงถังขยะ -> กู้คืนสำเร็จ
  // --------------------------------------------------------------------------
  test('ท่าที่ 2: Login ถูกต้อง -> สร้างโน้ต -> แก้ไข -> ค้นหา -> ย้ายลงถังขยะ -> กู้คืนสำเร็จ', async ({
    page,
  }) => {
    // 2.1 Login เข้าสู่ระบบ
    await page.goto('/');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'TestPassword123!');
    await page.click('button[type="submit"]');

    // ตรวจสอบว่าเข้าสู่ระบบสำเร็จและเข้าสู่หน้าจอหลัก
    await expect(page.locator('aside.app-sidebar')).toBeVisible();

    // 2.2 นำทางไปยังหน้า "โน้ตของฉัน"
    const notesNavBtn = page.locator('.nav-item', { hasText: 'โน้ตของฉัน' });
    await notesNavBtn.click();
    await expect(page.locator('.notes-container')).toBeVisible();

    // 2.3 สร้างโน้ตใหม่
    const newNoteBtn = page.locator('button:has-text("＋ โน้ตใหม่"), button:has-text("＋ สร้างโน้ตใหม่")').first();
    await newNoteBtn.click();

    const noteTitle = `โน้ตทดสอบ Playwright E2E ${Date.now()}`;
    const initialContent = '# หัวข้อทดสอบ\nเนื้อหาทดสอบระบบบันทึกโน้ตอัตโนมัติ';

    const titleInput = page.locator('input.notes-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(noteTitle);

    const contentTextarea = page.locator('textarea.notes-content-textarea');
    await expect(contentTextarea).toBeVisible();
    await contentTextarea.fill(initialContent);

    // กดปุ่มบันทึก
    await page.locator('button:has-text("บันทึก")').click();

    // ตรวจสอบว่าโน้ตปรากฏในรายการ
    const noteCard = page.locator('.note-item-card', { hasText: noteTitle });
    await expect(noteCard).toBeVisible();

    // 2.4 แก้ไขโน้ต
    const updatedTitle = `${noteTitle} (แก้ไขแล้ว)`;
    const updatedContent = `${initialContent}\n\n**แก้ไขเพิ่มเติมในขั้นตอนที่ 2.4**`;

    await titleInput.fill(updatedTitle);
    await contentTextarea.fill(updatedContent);
    await page.locator('button:has-text("บันทึก")').click();

    // ตรวจสอบว่าชื่อใหม่แสดงในรายการโน้ต
    const updatedCard = page.locator('.note-item-card', { hasText: updatedTitle });
    await expect(updatedCard).toBeVisible();

    // 2.5 ค้นหาโน้ต
    const searchInput = page.locator('#note-search');
    await searchInput.fill('Playwright');
    await expect(page.locator('.note-item-card', { hasText: updatedTitle })).toBeVisible();

    // ล้างคำค้นหา
    await searchInput.fill('');

    // 2.6 ลบโน้ต (ย้ายลงถังขยะ)
    page.on('dialog', (dialog) => void dialog.accept());
    // เปิดเมนูตัวเลือก ⋯
    await page.locator('.notes-header-right button:has-text("⋯")').click();
    await page.locator('.popover-menu button:has-text("ย้ายไปถังขยะ")').click();

    // ยืนยันว่าโน้ตหายไปจากหน้ารายการโน้ตปกติ
    await expect(page.locator('.note-item-card', { hasText: updatedTitle })).not.toBeVisible();

    // 2.7 ไปที่หน้าถังขยะเพื่อตรวจสอบ
    const trashNavBtn = page.locator('.nav-item', { hasText: 'ถังขยะ' });
    await trashNavBtn.click();
    await expect(page.locator('section[aria-label="จัดการโน้ตในถังขยะ"], h2:has-text("ถังขยะ")').first()).toBeVisible();

    // โน้ตต้องอยู่ในถังขยะ
    const trashItem = page.locator('.life-card', { hasText: updatedTitle });
    await expect(trashItem).toBeVisible();

    // 2.8 กดกู้คืนโน้ตกลับมา
    const restoreBtn = trashItem.locator('button:has-text("กู้คืน")');
    await restoreBtn.click();

    // ตรวจว่าโน้ตหายออกจากถังขยะแล้ว
    await expect(trashItem).not.toBeVisible();

    // 2.9 กลับไปดูที่หน้าโน้ตของฉัน ต้องพบโน้ตกลับคืนมาสมบูรณ์
    await notesNavBtn.click();
    await expect(page.locator('.note-item-card', { hasText: updatedTitle })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // ท่าที่ 3: อัปโหลดไฟล์ 5MB -> ดาวน์โหลดกลับมา -> คำนวณ SHA-256 ต้องตรงกัน 100%
  // --------------------------------------------------------------------------
  test('ท่าที่ 3: อัปโหลดไฟล์ 5MB และดาวน์โหลดกลับมาเทียบค่า SHA-256 ตรงกัน 100%', async ({
    request,
  }) => {
    // 3.1 ล็อกอินผ่าน API เพื่อรับเซสชัน
    const loginRes = await request.post('/api/auth/login', {
      headers: {
        origin: 'http://127.0.0.1:3100',
        'x-pkh-request': '1',
      },
      data: {
        username: 'admin',
        password: 'TestPassword123!',
      },
    });
    expect(loginRes.status()).toBe(200);

    // 3.2 สร้างไฟล์สุ่มขนาด 5MB (5 * 1024 * 1024 bytes)
    const fiveMbSize = 5 * 1024 * 1024;
    const testBuffer = Buffer.alloc(fiveMbSize);
    for (let i = 0; i < fiveMbSize; i += 4096) {
      testBuffer.write(`PKH_CHUNK_${i}_${Date.now()}`, i);
    }

    // คำนวณค่า SHA-256 ต้นฉบับ
    const originalSha256 = createHash('sha256').update(testBuffer).digest('hex');

    // 3.3 อัปโหลดไฟล์ผ่าน /api/files
    const uploadRes = await request.post('/api/files', {
      headers: {
        origin: 'http://127.0.0.1:3100',
        'x-pkh-request': '1',
        'x-file-name': encodeURIComponent('e2e-payload-5mb.bin'),
        'content-type': 'application/octet-stream',
      },
      data: testBuffer,
    });
    expect(uploadRes.status()).toBe(201);
    const uploadJson = await uploadRes.json();
    expect(uploadJson).toHaveProperty('file');
    const uploadedFile = uploadJson.file;

    // ตรวจสอบขนาดและ SHA-256 ที่เซิร์ฟเวอร์คำนวณขณะรับสตรีม
    expect(uploadedFile.sizeBytes).toBe(fiveMbSize);
    expect(uploadedFile.sha256).toBe(originalSha256);

    // 3.4 ดาวน์โหลดไฟล์กลับมา
    const downloadRes = await request.get(`/api/files/${uploadedFile.id}`);
    expect(downloadRes.status()).toBe(200);
    const downloadedBuffer = await downloadRes.body();

    // คำนวณค่า SHA-256 ของไฟล์ที่ดาวน์โหลดกลับมา
    const downloadedSha256 = createHash('sha256').update(downloadedBuffer).digest('hex');

    // ตรวจสอบความถูกต้อง 100%
    expect(downloadedBuffer.length).toBe(fiveMbSize);
    expect(downloadedSha256).toBe(originalSha256);
  });

  // --------------------------------------------------------------------------
  // ท่าที่ 4: สตรีมมิงวิดีโอ: Range 206 Partial Content + เล่นวิดีโอในเบราว์เซอร์
  // --------------------------------------------------------------------------
  test('ท่าที่ 4: สตรีมมิงวิดีโอตอบกลับ 206 Partial Content และเล่นวิดีโอในเบราว์เซอร์ได้จริง', async ({
    page,
    request,
  }) => {
    // 4.1 ล็อกอินผ่าน API
    await request.post('/api/auth/login', {
      headers: {
        origin: 'http://127.0.0.1:3100',
        'x-pkh-request': '1',
      },
      data: {
        username: 'admin',
        password: 'TestPassword123!',
      },
    });

    // 4.2 สร้าง payload วิดีโอ WebM (ขึ้นต้นด้วย magic bytes [0x1a, 0x45, 0xdf, 0xa3])
    const videoSize = 8192;
    const videoBuffer = Buffer.alloc(videoSize);
    videoBuffer[0] = 0x1a;
    videoBuffer[1] = 0x45;
    videoBuffer[2] = 0xdf;
    videoBuffer[3] = 0xa3;
    for (let i = 4; i < videoSize; i++) {
      videoBuffer[i] = (i * 31) % 256;
    }

    const uploadRes = await request.post('/api/files', {
      headers: {
        origin: 'http://127.0.0.1:3100',
        'x-pkh-request': '1',
        'x-file-name': encodeURIComponent('sample-clip.webm'),
        'content-type': 'application/octet-stream',
      },
      data: videoBuffer,
    });
    expect(uploadRes.status()).toBe(201);
    const videoFile = (await uploadRes.json()).file;
    expect(videoFile.mediaType).toBe('video/webm');

    // 4.3 ส่ง HTTP Range request: bytes=0-499 -> ต้องได้รหัส 206 Partial Content
    const rangeRes = await request.get(`/api/files/${videoFile.id}`, {
      headers: {
        range: 'bytes=0-499',
      },
    });
    expect(rangeRes.status()).toBe(206);
    expect(rangeRes.headers()['accept-ranges']).toBe('bytes');
    expect(rangeRes.headers()['content-range']).toBe(`bytes 0-499/${videoSize}`);
    expect(rangeRes.headers()['content-length']).toBe('500');
    expect((await rangeRes.body()).length).toBe(500);

    // 4.4 ตรวจสอบการเปิดหน้าคลังไฟล์และแสดงวิดีโอในเบราว์เซอร์
    await ensureLoggedIn(page);

    // ไปที่คลังไฟล์
    await page.locator('.nav-item', { hasText: 'คลังไฟล์' }).click();
    await expect(page.locator('.files-container')).toBeVisible();

    // ตรวจสอบว่าไฟล์ sample-clip.webm แสดงขึ้นมา
    await expect(page.locator('text=sample-clip.webm').first()).toBeVisible();

    // คลิกเพื่อเปิด Media Lightbox
    const playBtn = page.locator('button:has-text("เล่น/เปิดดูสด"), button:has-text("ดูตัวอย่างสด"), .file-play-btn').first();
    await playBtn.click();

    // ตรวจสอบว่า Media Lightbox ปรากฏขึ้นและมีแท็ก <video>
    const lightbox = page.locator('.media-lightbox-content');
    await expect(lightbox).toBeVisible();
    const videoEl = lightbox.locator('video.lightbox-video');
    await expect(videoEl).toBeVisible();
    await expect(videoEl).toHaveAttribute('src', `/api/files/${videoFile.id}`);

    // ปิด Lightbox
    await page.locator('button.media-lightbox-close').click();
    await expect(lightbox).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // ท่าที่ 5: ตรวจทุกหน้าหลักของแอป: console.error = 0 และ CSP violation = 0
  // --------------------------------------------------------------------------
  test('ท่าที่ 5: เปิดเข้าทุกหน้าหลักของแอป ไม่มี console.error และไม่มี CSP violation แม้แต่จุดเดียว', async ({
    page,
  }) => {
    // ดักจับ console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[Console Error]: ${msg.text()}`);
      }
    });

    // ดักจับ uncaught page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(`[Page Error]: ${err.message}`);
    });

    // เข้าสู่ระบบ
    await ensureLoggedIn(page);

    // ล้าง error ที่อาจเกิดขึ้นระหว่าง bootstrap ก่อนเริ่มตรวจสอบหน้าหลัก
    consoleErrors.length = 0;
    pageErrors.length = 0;

    // ดักฟัง securitypolicyviolation ใน window
    await page.evaluate(() => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
      window.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `CSP Violation: ${e.violatedDirective} blocked ${e.blockedURI}`
        );
      });
    });

    // รายการเมนูหลักทั้งหมดตามระบบ Navigation
    const viewsToTest = [
      'ภาพรวมวันนี้',
      'กล่องขาเข้า',
      'งานที่ต้องทำ',
      'โปรเจกต์',
      'เป้าหมาย',
      'โน้ตของฉัน',
      'บุคคลสำคัญ',
      'ปฏิทิน & ตารางชีวิต',
      'บุ๊กมาร์ก',
      'คลังสำคัญ & ทรัพย์สิน (Vault)',
      'ห้องสมุด & คู่มือชีวิต (Library)',
      'คลังไฟล์',
      'รายการโปรด',
      'ถังขยะ',
    ];

    for (const viewLabel of viewsToTest) {
      const navButton = page.locator('.nav-item', { hasText: viewLabel });
      if (await navButton.isVisible()) {
        await navButton.click();
        // รอให้เนื้อหาแต่ละหน้าเรนเดอร์และประมวลผลให้เรียบร้อย
        await page.waitForTimeout(250);
      }
    }

    // ตรวจสอบ CSP violations ที่ถูกบันทึกไว้ในเบราว์เซอร์
    const cspViolations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations || []
    );

    // ยืนยันว่าไม่มี error และไม่มี CSP violation แม้แต่อันเดียว
    expect(cspViolations, `พบ CSP violations: ${cspViolations.join(', ')}`).toEqual([]);
    expect(consoleErrors, `พบ Console errors: ${consoleErrors.join(', ')}`).toEqual([]);
    expect(pageErrors, `พบ Page errors: ${pageErrors.join(', ')}`).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // ท่าที่ 6: Rate limit login ผิดตาม threshold จริง (5 ครั้ง) -> โดน 429 ในครั้งที่ 6
  // (รันเป็นท่าสุดท้ายเพื่อไม่กระทบการทดสอบอื่น)
  // --------------------------------------------------------------------------
  test('ท่าที่ 6: Login ผิดตาม threshold (5 ครั้ง) -> ครั้งที่ 6 โดน rate limit (429) และแจ้งเตือนถูกต้อง', async ({
    page,
  }) => {
    // เปิดหน้า Login
    await page.goto('/');

    // ถ้ากำลังล็อกอินอยู่ ให้กดออกจากระบบก่อน
    const logoutBtn = page.locator('button.topbar-logout-btn, button[title="ออกจากระบบ"]');
    const loginCard = page.locator('.login-card');
    await expect(logoutBtn.or(loginCard)).toBeVisible();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(loginCard).toBeVisible();
    }

    const usernameInput = page.locator('#username');
    const passwordInput = page.locator('#password');
    const submitBtn = page.locator('button[type="submit"]');

    // 5 ครั้งแรก: เข้าสู่ระบบด้วยรหัสผ่านผิด -> ตอบกลับ 401 "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
    for (let attempt = 1; attempt <= LOGIN_FAILURE_THRESHOLD; attempt++) {
      await usernameInput.fill('admin');
      await passwordInput.fill(`WrongPasswordAttempt_${attempt}`);

      const [response] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/auth/login')),
        submitBtn.click(),
      ]);

      expect(response.status(), `Attempt ${attempt} should return 401`).toBe(401);

      const errorAlert = page.locator('p.form-error[role="alert"]');
      await expect(errorAlert).toBeVisible();
      await expect(errorAlert).toContainText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }

    // ครั้งที่ 6: เกิน threshold -> เซิร์ฟเวอร์ต้องบล็อกด้วย 429 Too Many Requests
    await usernameInput.fill('admin');
    await passwordInput.fill('WrongPasswordAttempt_FinalBlocked');

    const [blockedResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/auth/login')),
      submitBtn.click(),
    ]);

    expect(blockedResponse.status(), 'Attempt 6 should be rate-limited with 429').toBe(429);
    expect(blockedResponse.headers()['retry-after']).toBeDefined();

    // UI ต้องแสดงข้อความแจ้งเตือนถูกต้อง
    const errorAlert = page.locator('p.form-error[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้งภายหลัง');
  });
});
