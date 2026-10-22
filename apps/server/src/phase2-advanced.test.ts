import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const origin = 'http://localhost:80';
const csrf = { origin, 'x-pkh-request': '1' };

function setup() {
  const database = openDatabase(':memory:');
  const app = createApp(database, { expectedOrigin: origin, logger: false, sleep: async () => undefined });
  databases.push(database);
  apps.push(app);
  return { app, database };
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) await app.close();
  }
  while (databases.length > 0) {
    const db = databases.pop();
    if (db) db.close();
  }
});

function createUser(database: SqliteDatabase, username: string, role = 'user') {
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, 'test-hash', role, username, Date.now());
  const session = createSession(database, id);
  return { id, username, cookie: `pkh_session=${session.token}` };
}

describe('Universal Soft-Delete Trash', () => {
  it('soft-deletes tasks, bookmarks, people, and records and lists them in /api/trash', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    // Create a task for Alice
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { title: 'งานสำคัญ' },
    });
    expect(taskRes.statusCode).toBe(201);
    const taskId = JSON.parse(taskRes.payload).task.id;

    // Delete task -> soft delete
    const delTask = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}`,
      headers: { ...csrf, cookie: alice.cookie },
    });
    expect(delTask.statusCode).toBe(204);

    // Create a bookmark for Alice
    const bmRes = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { title: 'เว็บอ่านข่าว', url: 'https://news.example.com' },
    });
    expect(bmRes.statusCode).toBe(201);
    const bmId = JSON.parse(bmRes.payload).bookmark.id;

    // Delete bookmark -> soft delete
    const delBm = await app.inject({
      method: 'DELETE',
      url: `/api/bookmarks/${bmId}`,
      headers: { ...csrf, cookie: alice.cookie },
    });
    expect(delBm.statusCode).toBe(204);

    // List trash for Alice
    const trashRes = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { cookie: alice.cookie },
    });
    expect(trashRes.statusCode).toBe(200);
    const trashData = JSON.parse(trashRes.payload);
    expect(trashData.total).toBe(2);
    expect(trashData.items.map((i: any) => i.itemType).sort()).toEqual(['bookmark', 'task']);

    // Strict owner isolation: Bob should see 0 items in trash
    const bobTrash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { cookie: bob.cookie },
    });
    expect(bobTrash.statusCode).toBe(200);
    expect(JSON.parse(bobTrash.payload).total).toBe(0);

    // Filter by type=task
    const taskOnly = await app.inject({
      method: 'GET',
      url: '/api/trash?type=task',
      headers: { cookie: alice.cookie },
    });
    const taskData = JSON.parse(taskOnly.payload);
    expect(taskData.total).toBe(1);
    expect(taskData.items[0].id).toBe(taskId);

    // Single restore task
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/trash/task/${taskId}/restore`,
      headers: { ...csrf, cookie: alice.cookie },
    });
    expect(restoreRes.statusCode).toBe(204);

    // Verify task is restored
    const activeTasks = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { cookie: alice.cookie },
    });
    expect(JSON.parse(activeTasks.payload).total).toBe(1);

    // Bulk permanent delete for remaining bookmark
    const bulkDel = await app.inject({
      method: 'POST',
      url: '/api/trash/bulk-permanent',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { items: [{ itemType: 'bookmark', id: bmId }] },
    });
    expect(bulkDel.statusCode).toBe(200);
    expect(JSON.parse(bulkDel.payload).deletedCount).toBe(1);

    // Verify bookmark is permanently gone
    const checkBm = database.prepare('SELECT id FROM bookmarks WHERE id = ?').get(bmId);
    expect(checkBm).toBeUndefined();
  });
});

describe('Custom Data Types & Records', () => {
  it('allows creating custom types with schemas, CRUD for records, and favorite tagging', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'custom_user');

    // Create custom type: "ข้อมูลสุขภาพสัตว์เลี้ยง"
    const typeRes = await app.inject({
      method: 'POST',
      url: '/api/custom-types',
      headers: { ...csrf, cookie: user.cookie },
      payload: {
        name: 'ข้อมูลสุขภาพสัตว์เลี้ยง',
        description: 'บันทึกวัคซีนและน้ำหนักของน้องหมาน้องแมว',
        icon: 'PawPrint',
        color: '#10B981',
        fieldsSchema: [
          { id: 'pet_name', name: 'ชื่อสัตว์เลี้ยง', type: 'text', required: true },
          { id: 'species', name: 'ชนิด', type: 'select', required: true, options: ['สุนัข', 'แมว', 'นก'] },
          { id: 'weight', name: 'น้ำหนัก (กก.)', type: 'number', required: false },
          { id: 'vaccinated', name: 'ฉีดวัคซีนแล้ว', type: 'checkbox', required: false, defaultValue: false },
        ],
      },
    });
    expect(typeRes.statusCode).toBe(201);
    const customType = JSON.parse(typeRes.payload);
    expect(customType.name).toBe('ข้อมูลสุขภาพสัตว์เลี้ยง');
    expect(customType.fieldsSchema).toHaveLength(4);

    // Create a record
    const recordRes = await app.inject({
      method: 'POST',
      url: `/api/custom-types/${customType.id}/records`,
      headers: { ...csrf, cookie: user.cookie },
      payload: {
        title: 'น้องโคล่า - นัดตรวจประจำปี',
        data: {
          pet_name: 'โคล่า',
          species: 'สุนัข',
          weight: 12.5,
          vaccinated: true,
        },
      },
    });
    expect(recordRes.statusCode).toBe(201);
    const record = JSON.parse(recordRes.payload);
    expect(record.title).toBe('น้องโคล่า - นัดตรวจประจำปี');
    expect(record.data.pet_name).toBe('โคล่า');

    // Star as favorite
    const favRes = await app.inject({
      method: 'PUT',
      url: `/api/favorites/custom_record/${record.id}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(favRes.statusCode).toBe(204);

    // Check favorite status
    const favStatus = await app.inject({
      method: 'GET',
      url: `/api/favorites/custom_record/${record.id}`,
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(favStatus.payload).favorited).toBe(true);

    // List records for this custom type
    const listRecords = await app.inject({
      method: 'GET',
      url: `/api/custom-types/${customType.id}/records`,
      headers: { cookie: user.cookie },
    });
    const recordsData = JSON.parse(listRecords.payload);
    expect(recordsData.records).toHaveLength(1);
    expect(recordsData.records[0].isFavorited).toBe(true);

    // Soft delete record
    const delRecord = await app.inject({
      method: 'DELETE',
      url: `/api/custom-types/${customType.id}/records/${record.id}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(delRecord.statusCode).toBe(204);

    // Appears in Universal Trash
    const trashList = await app.inject({
      method: 'GET',
      url: '/api/trash?type=custom_record',
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(trashList.payload).total).toBe(1);
  });
});

describe('Favorites Collections', () => {
  it('manages collections, groups favorites, and unhides after restore', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'fav_user');

    // Create favorite collection
    const colRes = await app.inject({
      method: 'POST',
      url: '/api/favorites/collections',
      headers: { ...csrf, cookie: user.cookie },
      payload: { name: 'งานด่วนสัปดาห์นี้', icon: 'Flame', color: '#EF4444' },
    });
    expect(colRes.statusCode).toBe(201);
    const collection = JSON.parse(colRes.payload);

    // Create a task
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { ...csrf, cookie: user.cookie },
      payload: { title: 'ปิดงบด่วน' },
    });
    const taskId = JSON.parse(taskRes.payload).task.id;

    // Add to favorites with collection
    const addFav = await app.inject({
      method: 'PUT',
      url: `/api/favorites/task/${taskId}`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { collectionId: collection.id },
    });
    expect(addFav.statusCode).toBe(204);

    // Query favorites filtered by collection
    const favList = await app.inject({
      method: 'GET',
      url: `/api/favorites?collectionId=${collection.id}`,
      headers: { cookie: user.cookie },
    });
    const favData = JSON.parse(favList.payload);
    expect(favData.total).toBe(1);
    expect(favData.favorites[0].itemId).toBe(taskId);
    expect(favData.favorites[0].collectionName).toBe('งานด่วนสัปดาห์นี้');
  });
});

describe('Support Tickets & Help Center', () => {
  it('creates ticket with #TK ref, enforces user-isolation, allows admin reply and notifications', async () => {
    const { app, database } = setup();
    const member = createUser(database, 'member_joe');
    const admin = createUser(database, 'admin_super', 'admin');

    // Member submits ticket
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/support/tickets',
      headers: { ...csrf, cookie: member.cookie },
      payload: {
        title: 'ล็อกอินจากมือถือไม่ได้',
        description: 'แจ้งเตือนว่า session หมดอายุบ่อยมาก',
        category: 'bug',
        priority: 'high',
      },
    });
    expect(ticketRes.statusCode).toBe(201);
    const ticket = JSON.parse(ticketRes.payload);
    expect(ticket.ticketRef).toMatch(/^#TK-\d+$/);
    expect(ticket.status).toBe('open');

    // Admin views all tickets
    const adminTickets = await app.inject({
      method: 'GET',
      url: '/api/support/tickets',
      headers: { cookie: admin.cookie },
    });
    expect(JSON.parse(adminTickets.payload).tickets).toHaveLength(1);

    // Admin replies
    const replyRes = await app.inject({
      method: 'POST',
      url: `/api/support/tickets/${ticket.id}/replies`,
      headers: { ...csrf, cookie: admin.cookie },
      payload: { message: 'ทีมงานได้รับเรื่องแล้ว กำลังตรวจสอบระบบ Token ให้ครับ' },
    });
    expect(replyRes.statusCode).toBe(201);

    // Check that an in-app notification was created for the member
    const notifs = database.prepare('SELECT * FROM notifications WHERE user_id = ?').all(member.id) as any[];
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('support_ticket');
    expect(notifs[0].title).toContain(ticket.ticketRef);

    // Admin updates status to 'in_progress'
    const statusUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/support/tickets/${ticket.id}/status`,
      headers: { ...csrf, cookie: admin.cookie },
      payload: { status: 'in_progress' },
    });
    expect(statusUpdate.statusCode).toBe(200);

    // Verify member has 2 notifications now
    const notifsAfter = database.prepare('SELECT * FROM notifications WHERE user_id = ?').all(member.id);
    expect(notifsAfter).toHaveLength(2);
  });
});
