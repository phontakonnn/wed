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

function createUser(database: SqliteDatabase, username: string) {
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, 'test-hash', Date.now());
  const session = createSession(database, id);
  return { id, cookie: `pkh_session=${session.token}` };
}

type App = ReturnType<typeof createApp>;

const post = (app: App, url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, headers: { ...csrf, cookie }, payload });
const patch = (app: App, url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url, headers: { ...csrf, cookie }, payload });
const get = (app: App, url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const del = (app: App, url: string, cookie: string) =>
  app.inject({ method: 'DELETE', url, headers: { ...csrf, cookie } });

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('custom categories', () => {
  it('creates, lists, updates, and creates subcategories', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    // 1. Create main category
    const res1 = await post(app, '/api/custom-categories', user.cookie, {
      name: 'การเงิน & การลงทุน',
      icon: '💰',
      color: '#10b981',
    });
    expect(res1.statusCode).toBe(201);
    const cat1 = res1.json().category;
    expect(cat1.name).toBe('การเงิน & การลงทุน');
    expect(cat1.icon).toBe('💰');
    expect(cat1.color).toBe('#10b981');
    expect(cat1.parentId).toBeNull();

    // 2. Create subcategory
    const res2 = await post(app, '/api/custom-categories', user.cookie, {
      name: 'พอร์ตหุ้นปันผล',
      icon: '📈',
      color: '#059669',
      parentId: cat1.id,
    });
    expect(res2.statusCode).toBe(201);
    const subCat = res2.json().category;
    expect(subCat.parentId).toBe(cat1.id);

    // 3. List categories
    const listRes = await get(app, '/api/custom-categories', user.cookie);
    expect(listRes.statusCode).toBe(200);
    const categories = listRes.json().categories;
    expect(categories.length).toBe(2);

    // 4. Update category
    const patchRes = await patch(app, `/api/custom-categories/${cat1.id}`, user.cookie, {
      name: 'การเงินส่วนบุคคล & การลงทุน',
      icon: '💎',
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().category.name).toBe('การเงินส่วนบุคคล & การลงทุน');
    expect(patchRes.json().category.icon).toBe('💎');
  });

  it('links items and retrieves category items across all types', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'bob');

    // Create custom category
    const catRes = await post(app, '/api/custom-categories', user.cookie, {
      name: 'โปรเจกต์ลับ',
      icon: '🚀',
    });
    const catId = catRes.json().category.id;

    // Create note
    const noteId = randomUUID();
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, 'ไอเดียลับ', 'รายละเอียด', ?, ?)
    `).run(noteId, user.id, Date.now(), Date.now());

    // Create task
    const taskId = randomUUID();
    database.prepare(`
      INSERT INTO tasks (id, owner_id, title, status, priority, recurrence, created_at, updated_at)
      VALUES (?, ?, 'งานด่วน', 'todo', 'high', 'none', ?, ?)
    `).run(taskId, user.id, Date.now(), Date.now());

    // Create bookmark
    const bookmarkId = randomUUID();
    database.prepare(`
      INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
      VALUES (?, ?, 'ลิงก์สำคัญ', 'https://example.com', '', ?, ?)
    `).run(bookmarkId, user.id, Date.now(), Date.now());

    // Link note to category
    const linkNote = await post(app, `/api/custom-categories/${catId}/items`, user.cookie, {
      itemType: 'note',
      itemId: noteId,
    });
    expect(linkNote.statusCode).toBe(201);

    // Link task to category
    const linkTask = await post(app, `/api/custom-categories/${catId}/items`, user.cookie, {
      itemType: 'task',
      itemId: taskId,
    });
    expect(linkTask.statusCode).toBe(201);

    // Link bookmark to category
    const linkBookmark = await post(app, `/api/custom-categories/${catId}/items`, user.cookie, {
      itemType: 'bookmark',
      itemId: bookmarkId,
    });
    expect(linkBookmark.statusCode).toBe(201);

    // Fetch items
    const itemsRes = await get(app, `/api/custom-categories/${catId}/items`, user.cookie);
    expect(itemsRes.statusCode).toBe(200);
    const body = itemsRes.json();
    expect(body.counts.notes).toBe(1);
    expect(body.counts.tasks).toBe(1);
    expect(body.counts.bookmarks).toBe(1);
    expect(body.counts.total).toBe(3);
    expect(body.notes[0].title).toBe('ไอเดียลับ');
    expect(body.tasks[0].title).toBe('งานด่วน');
    expect(body.bookmarks[0].title).toBe('ลิงก์สำคัญ');

    // Unlink note
    const unlinkRes = await del(app, `/api/custom-categories/${catId}/items/note/${noteId}`, user.cookie);
    expect(unlinkRes.statusCode).toBe(204);

    // Verify unlinked
    const itemsRes2 = await get(app, `/api/custom-categories/${catId}/items`, user.cookie);
    expect(itemsRes2.json().counts.notes).toBe(0);
    expect(itemsRes2.json().counts.total).toBe(2);
  });

  it('deletes category and unlinks items cleanly', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'carol');

    const catRes = await post(app, '/api/custom-categories', user.cookie, {
      name: 'จะถูกลบ',
    });
    const catId = catRes.json().category.id;

    const delRes = await del(app, `/api/custom-categories/${catId}`, user.cookie);
    expect(delRes.statusCode).toBe(204);

    const getRes = await get(app, `/api/custom-categories/${catId}/items`, user.cookie);
    expect(getRes.statusCode).toBe(404);
  });
});
