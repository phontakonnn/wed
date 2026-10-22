import { test, expect } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:3100';

function getHeaders(extra: Record<string, string> = {}) {
  return {
    'x-pkh-request': '1',
    origin: ORIGIN,
    ...extra,
  };
}

test.describe('PKH / Life OS - Phase 2 Advanced Systems (2 Accounts: Member & Admin)', () => {
  test.describe.configure({ mode: 'serial' });

  const memberUsername = `user_${Date.now()}`;
  const memberPassword = 'MemberPassword123!';
  const adminUsername = 'admin';
  const adminPassword = 'TestPassword123!';

  test('0. Setup: Register Member Account', async ({ request }) => {
    const regRes = await request.post('/api/auth/register-account', {
      headers: getHeaders(),
      data: {
        username: memberUsername,
        password: memberPassword,
        displayName: 'Member TestUser',
        email: `${memberUsername}@example.com`,
      },
    });
    expect(regRes.ok()).toBeTruthy();
  });

  test('1. Universal Soft-Delete Trash: Cross-Module Soft Delete, Trash UI, Restore & Zero IDOR', async ({ playwright, page }) => {
    // 1. Member creates a note and a task
    const memberCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    const loginRes = await memberCtx.post('/api/auth/login', {
      data: { username: memberUsername, password: memberPassword },
    });
    expect(loginRes.ok()).toBeTruthy();

    const noteRes = await memberCtx.post('/api/notes', {
      data: { title: 'บันทึกสำคัญสำหรับทดสอบถังขยะ', content: 'รายละเอียดเนื้อหาโน้ต' },
    });
    expect(noteRes.ok()).toBeTruthy();
    const noteData = await noteRes.json();
    const noteId = noteData.note.id;

    const taskRes = await memberCtx.post('/api/tasks', {
      data: { title: 'งานที่จะถูกลบลงถังขยะ', detail: 'รายละเอียดงานทดสอบ' },
    });
    expect(taskRes.ok()).toBeTruthy();
    const taskData = await taskRes.json();
    const taskId = taskData.task.id;

    // 2. Member soft-deletes both items
    const delNote = await memberCtx.delete(`/api/notes/${noteId}`);
    expect(delNote.ok()).toBeTruthy();

    const delTask = await memberCtx.delete(`/api/tasks/${taskId}`);
    expect(delTask.ok()).toBeTruthy();

    // 3. Check Universal Trash API: both items are listed
    const trashRes = await memberCtx.get('/api/trash');
    expect(trashRes.ok()).toBeTruthy();
    const trashData = await trashRes.json();
    expect(trashData.items.some((i: { id: string; itemType: string }) => i.id === noteId && i.itemType === 'note')).toBeTruthy();
    expect(trashData.items.some((i: { id: string; itemType: string }) => i.id === taskId && i.itemType === 'task')).toBeTruthy();

    // 4. Zero IDOR: Admin checks trash, must NOT see member's items in their trash
    const adminCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    await adminCtx.post('/api/auth/login', {
      data: { username: adminUsername, password: adminPassword },
    });
    const adminTrashRes = await adminCtx.get('/api/trash');
    const adminTrashData = await adminTrashRes.json();
    expect(adminTrashData.items.some((i: { id: string }) => i.id === noteId)).toBeFalsy();

    // 5. Test Restore via API & UI
    const restoreRes = await memberCtx.post(`/api/trash/task/${taskId}/restore`);
    expect(restoreRes.ok()).toBeTruthy();

    // Task is back in active list
    const activeTasks = await memberCtx.get('/api/tasks');
    const activeTasksData = await activeTasks.json();
    expect(activeTasksData.tasks.some((t: { id: string }) => t.id === taskId)).toBeTruthy();

    // 6. Test Permanent Delete on the note
    const permDeleteRes = await memberCtx.delete(`/api/trash/note/${noteId}/permanent`);
    expect(permDeleteRes.ok()).toBeTruthy();

    // Note is completely gone
    const checkTrashAgain = await memberCtx.get('/api/trash');
    const checkTrashData = await checkTrashAgain.json();
    expect(checkTrashData.items.some((i: { id: string }) => i.id === noteId)).toBeFalsy();

    // 7. Verify Universal Trash UI in browser
    await page.goto('/');
    await page.fill('#username', memberUsername);
    await page.fill('#password', memberPassword);
    await page.click('button[type="submit"]');

    const trashNav = page.locator('.nav-item', { hasText: 'ถังขยะ' });
    await expect(trashNav).toBeVisible({ timeout: 15_000 });
    await trashNav.click();

    // Check header
    const trashHeader = page.locator('h2.banner-title', { hasText: 'ถังขยะกลาง (Universal Trash)' });
    await expect(trashHeader).toBeVisible({ timeout: 10_000 });
  });

  test('2. Custom Data Types & Dynamic Menu Builder: Schema, Sidebar Integration & Records CRUD', async ({ playwright, page }) => {
    const memberCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    await memberCtx.post('/api/auth/login', {
      data: { username: memberUsername, password: memberPassword },
    });

    // 1. Create a Custom Data Type with dynamic field schema
    const customTypeRes = await memberCtx.post('/api/custom-types', {
      data: {
        name: 'คลังอุปกรณ์ไอที',
        description: 'จัดเก็บคอมพิวเตอร์และอุปกรณ์เสริม',
        icon: '💻',
        color: '#3b82f6',
        category: 'ข้อมูลที่กำหนดเอง',
        fields: [
          { id: 'brand', name: 'ยี่ห้อ/แบรนด์', type: 'text', required: true },
          { id: 'serial', name: 'ซีเรียลนัมเบอร์', type: 'text', required: false },
          { id: 'price', name: 'ราคา (บาท)', type: 'number', required: false },
          { id: 'is_active', name: 'กำลังใช้งาน', type: 'checkbox', required: false },
        ],
      },
    });
    expect(customTypeRes.ok()).toBeTruthy();
    const customTypeData = await customTypeRes.json();
    const customTypeId = customTypeData.type.id;

    // 2. Add a record into this custom type
    const recordRes = await memberCtx.post(`/api/custom-types/${customTypeId}/records`, {
      data: {
        title: 'MacBook Pro M3 Max 16"',
        data: {
          brand: 'Apple',
          serial: 'C02XYZ12345',
          price: 119900,
          is_active: true,
        },
      },
    });
    expect(recordRes.ok()).toBeTruthy();
    const recordData = await recordRes.json();
    const recordId = recordData.record.id;

    // 3. Verify record appears in record listing
    const recordsList = await memberCtx.get(`/api/custom-types/${customTypeId}/records`);
    expect(recordsList.ok()).toBeTruthy();
    const listJson = await recordsList.json();
    expect(listJson.records.some((r: { id: string }) => r.id === recordId)).toBeTruthy();

    // 4. Verify in Browser UI: Custom type appears in Sidebar and records view loads
    await page.goto('/');
    await page.fill('#username', memberUsername);
    await page.fill('#password', memberPassword);
    await page.click('button[type="submit"]');

    const sidebar = page.locator('aside.app-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    const customTypeItem = page.locator('.custom-cat-row', { hasText: 'คลังอุปกรณ์ไอที' });
    await expect(customTypeItem).toBeVisible({ timeout: 10_000 });
    await customTypeItem.click();

    // Check banner title
    const customTitle = page.locator('h2.banner-title', { hasText: 'คลังอุปกรณ์ไอที' });
    await expect(customTitle).toBeVisible({ timeout: 10_000 });

    // Verify record is visible in Card view
    const recordCard = page.locator('article.life-card', { hasText: 'MacBook Pro M3 Max 16"' });
    await expect(recordCard).toBeVisible({ timeout: 10_000 });

    // Test soft-deleting custom record
    const delRecordRes = await memberCtx.delete(`/api/custom-records/${recordId}`);
    expect(delRecordRes.ok()).toBeTruthy();

    // Verify record moved to Universal Trash
    const trashCheck = await memberCtx.get('/api/trash?itemType=custom_record');
    const trashJson = await trashCheck.json();
    expect(trashJson.items.some((i: { id: string }) => i.id === recordId)).toBeTruthy();
  });

  test('3. Favorites & Favorite Collections: Star Items, Categorized View, Collection Folders', async ({ playwright, page }) => {
    const memberCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    await memberCtx.post('/api/auth/login', {
      data: { username: memberUsername, password: memberPassword },
    });

    // 1. Create a Note and a Bookmark
    const noteRes = await memberCtx.post('/api/notes', {
      data: { title: 'โน้ตเตรียมทริปเที่ยวญี่ปุ่น', content: 'แผนการเดินทางและตั๋วเครื่องบิน' },
    });
    const noteId = (await noteRes.json()).note.id;

    const bmRes = await memberCtx.post('/api/bookmarks', {
      data: { title: 'ที่พักโตเกียวชินจูกุ', url: 'https://hotel.example.com/tokyo' },
    });
    const bmId = (await bmRes.json()).bookmark.id;

    // 2. Star both items as Favorites
    await memberCtx.put(`/api/favorites/note/${noteId}`);
    await memberCtx.put(`/api/favorites/bookmark/${bmId}`);

    // 3. Create a Favorite Collection folder
    const colRes = await memberCtx.post('/api/favorite-collections', {
      data: { name: 'ทริปญี่ปุ่น 2026', icon: '🇯🇵', color: '#ef4444' },
    });
    expect(colRes.ok()).toBeTruthy();
    const colId = (await colRes.json()).collection.id;

    // 4. Assign note and bookmark into this collection
    const assignNote = await memberCtx.put(`/api/favorites/note/${noteId}/collection`, {
      data: { collectionId: colId },
    });
    expect(assignNote.ok()).toBeTruthy();

    // 5. Query favorites filtered by collection
    const favsInCol = await memberCtx.get(`/api/favorites?collectionId=${colId}`);
    expect(favsInCol.ok()).toBeTruthy();
    const favsJson = await favsInCol.json();
    expect(favsJson.favorites.some((f: { itemId: string }) => f.itemId === noteId)).toBeTruthy();

    // 6. Verify in Browser UI
    await page.goto('/');
    await page.fill('#username', memberUsername);
    await page.fill('#password', memberPassword);
    await page.click('button[type="submit"]');

    const favNav = page.locator('.nav-item', { hasText: 'รายการโปรด' });
    await expect(favNav).toBeVisible({ timeout: 15_000 });
    await favNav.click();

    // Verify Collection chip is visible
    const colChip = page.locator('div', { hasText: 'ทริปญี่ปุ่น 2026' }).first();
    await expect(colChip).toBeVisible({ timeout: 10_000 });
  });

  test('4. Support Center & Admin Tickets: Member Submits Ticket -> Admin Views & Replies -> Member Receives Notification', async ({ playwright, page }) => {
    // 1. Member creates a support ticket
    const memberCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    await memberCtx.post('/api/auth/login', {
      data: { username: memberUsername, password: memberPassword },
    });

    const ticketSubject = `แจ้งปัญหาการอัปโหลดไฟล์ขนาดใหญ่ #${Date.now()}`;
    const createTicketRes = await memberCtx.post('/api/support-tickets', {
      data: {
        subject: ticketSubject,
        category: 'ปัญหาเทคนิค & บั๊ก',
        priority: 'high',
        message: 'พบปัญหาเมื่ออัปโหลดไฟล์ขนาดเกิน 50MB กรุณาช่วยตรวจสอบและขยายโควตาให้ด้วยครับ',
      },
    });
    expect(createTicketRes.ok()).toBeTruthy();
    const ticketData = await createTicketRes.json();
    const ticketId = ticketData.ticket.id;
    const refCode = ticketData.ticket.referenceNo;
    expect(refCode).toMatch(/^#TK-/);

    // 2. Admin logs in and checks ticket list
    const adminCtx = await playwright.request.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: getHeaders(),
    });
    await adminCtx.post('/api/auth/login', {
      data: { username: adminUsername, password: adminPassword },
    });

    const adminTicketsRes = await adminCtx.get('/api/support-tickets');
    expect(adminTicketsRes.ok()).toBeTruthy();
    const adminTicketsData = await adminTicketsRes.json();
    expect(adminTicketsData.tickets.some((t: { id: string }) => t.id === ticketId)).toBeTruthy();

    // 3. Admin updates status to 'in_progress' and replies
    const updateStatusRes = await adminCtx.put(`/api/support-tickets/${ticketId}/status`, {
      data: { status: 'in_progress' },
    });
    expect(updateStatusRes.ok()).toBeTruthy();

    const replyMsg = 'สวัสดีครับ ทีมผู้ดูแลระบบได้รับเรื่องแล้วและกำลังตรวจสอบการตั้งค่าพื้นที่จัดเก็บให้ครับ';
    const replyRes = await adminCtx.post(`/api/support-tickets/${ticketId}/replies`, {
      data: { message: replyMsg },
    });
    expect(replyRes.ok()).toBeTruthy();

    // 4. Verify Member receives an in-app notification
    const notifsRes = await memberCtx.get('/api/notifications');
    expect(notifsRes.ok()).toBeTruthy();
    const notifsData = await notifsRes.json();
    expect(notifsData.notifications.some((n: { title: string }) => n.title.includes(refCode))).toBeTruthy();

    // 5. Member reads the ticket conversation
    const memberTicketDetail = await memberCtx.get(`/api/support-tickets/${ticketId}`);
    expect(memberTicketDetail.ok()).toBeTruthy();
    const detailData = await memberTicketDetail.json();
    expect(detailData.ticket.status).toBe('in_progress');
    expect(detailData.replies.some((r: { message: string }) => r.message === replyMsg)).toBeTruthy();

    // 6. Zero IDOR Verification: Another user cannot view Member's ticket
    const otherUser = `other_${Date.now()}`;
    await playwright.request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: getHeaders() }).then(async (ctx) => {
      await ctx.post('/api/auth/register-account', {
        data: { username: otherUser, password: 'OtherPassword123!', displayName: 'Other User' },
      });
      await ctx.post('/api/auth/login', {
        data: { username: otherUser, password: 'OtherPassword123!' },
      });
      const checkOther = await ctx.get(`/api/support-tickets/${ticketId}`);
      expect([403, 404]).toContain(checkOther.status());
    });

    // 7. Verify UI in Browser: Member checks Help Center
    await page.goto('/');
    await page.fill('#username', memberUsername);
    await page.fill('#password', memberPassword);
    await page.click('button[type="submit"]');

    const helpNav = page.locator('.nav-item', { hasText: 'ศูนย์ช่วยเหลือ & ติดต่อผู้ดูแล' });
    await expect(helpNav).toBeVisible({ timeout: 15_000 });
    await helpNav.click();

    const ticketItem = page.locator('.life-card', { hasText: ticketSubject });
    await expect(ticketItem).toBeVisible({ timeout: 10_000 });
    await expect(ticketItem).toContainText('กำลังดำเนินการ');
  });
});
