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

function createFile(database: SqliteDatabase, ownerId: string, name: string) {
  const id = randomUUID();
  database.prepare(`
    INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
    VALUES (?, ?, ?, 12, ?, 'text/plain', ?, ?)
  `).run(id, ownerId, name, 'a'.repeat(64), id, Date.now());
  return id;
}

function createNote(database: SqliteDatabase, ownerId: string, title: string, content = '') {
  const id = randomUUID();
  const now = Date.now();
  database.prepare('INSERT INTO notes (id, owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, title, content, now, now);
  return id;
}

function post(app: ReturnType<typeof createApp>, url: string, cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { ...csrf, cookie }, payload });
}

function link(app: ReturnType<typeof createApp>, cookie: string, type: string, id: string, fileId: string) {
  return post(app, `/api/entities/${type}/${id}/files`, cookie, { fileId });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('entity files', () => {
  it('links a file to every supported entity type and lists it', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'receipt.txt');
    const noteId = createNote(database, user.id, 'ใบเสร็จ');

    const task = await post(app, '/api/tasks', user.cookie, { title: 'จ่ายบิล' });
    const project = await post(app, '/api/projects', user.cookie, { name: 'ย้ายบ้าน' });
    const person = await post(app, '/api/people', user.cookie, { name: 'คุณแม่', relationshipGroup: 'family' });
    const bookmark = await post(app, '/api/bookmarks', user.cookie, { title: 'ลิงก์', url: 'https://example.com' });

    const targets: Array<[string, string]> = [
      ['note', noteId],
      ['task', task.json().task.id],
      ['project', project.json().project.id],
      ['person', person.json().person.id],
      ['bookmark', bookmark.json().bookmark.id],
    ];
    for (const [type, id] of targets) {
      const result = await link(app, user.cookie, type, id, fileId);
      expect(result.statusCode).toBe(201);
      expect(result.json().created).toBe(true);
    }

    const listed = await app.inject({
      method: 'GET',
      url: `/api/entities/note/${noteId}/files`,
      headers: { cookie: user.cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().files).toHaveLength(1);
    expect(listed.json().files[0]).toMatchObject({ displayName: 'receipt.txt', mediaType: 'text/plain' });
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 5 });
  });

  it('treats a duplicate link as idempotent instead of creating a second row', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'a.txt');
    const noteId = createNote(database, user.id, 'โน้ต');

    expect((await link(app, user.cookie, 'note', noteId, fileId)).statusCode).toBe(201);
    const again = await link(app, user.cookie, 'note', noteId, fileId);
    expect(again.statusCode).toBe(200);
    expect(again.json().created).toBe(false);
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 1 });
  });

  it('rejects an unknown entity, an unknown file and an unsupported type', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'a.txt');

    expect((await link(app, user.cookie, 'note', randomUUID(), fileId)).statusCode).toBe(404);
    expect((await link(app, user.cookie, 'note', createNote(database, user.id, 'x'), randomUUID())).statusCode).toBe(404);
    expect((await link(app, user.cookie, 'goal', randomUUID(), fileId)).statusCode).toBe(400);
    expect((await link(app, user.cookie, 'asset', randomUUID(), fileId)).statusCode).toBe(400);
  });

  it('rejects a file or an entity owned by another account', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const aliceFile = createFile(database, alice.id, 'alice.txt');
    const bobFile = createFile(database, bob.id, 'bob.txt');
    const aliceNote = createNote(database, alice.id, 'ของอลิซ');
    const bobNote = createNote(database, bob.id, 'ของบ๊อบ');

    expect((await link(app, bob.cookie, 'note', bobNote, aliceFile)).statusCode).toBe(404);
    expect((await link(app, bob.cookie, 'note', aliceNote, bobFile)).statusCode).toBe(404);
    expect((await link(app, bob.cookie, 'note', aliceNote, aliceFile)).statusCode).toBe(404);

    // The database refuses the same combination even if a handler is bypassed.
    expect(() => database.prepare(`
      INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
      VALUES (?, ?, 'note', ?, ?, 1)
    `).run(randomUUID(), bob.id, aliceNote, aliceFile)).toThrow(/owner mismatch/);
  });

  it('unlinks without deleting the file, and keeps the file in the library', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'keep.txt');
    const noteId = createNote(database, user.id, 'โน้ต');
    await link(app, user.cookie, 'note', noteId, fileId);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/entities/note/${noteId}/files/${fileId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(removed.statusCode).toBe(204);
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM files').get()).toEqual({ count: 1 });

    expect((await app.inject({
      method: 'DELETE',
      url: `/api/entities/note/${noteId}/files/${fileId}`,
      headers: { ...csrf, cookie: user.cookie },
    })).statusCode).toBe(404);
  });

  it('cleans up links when an entity is deleted but not when a note is trashed', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'a.txt');
    const task = await post(app, '/api/tasks', user.cookie, { title: 'งาน' });
    const noteId = createNote(database, user.id, 'โน้ต');
    await link(app, user.cookie, 'task', task.json().task.id, fileId);
    await link(app, user.cookie, 'note', noteId, fileId);

    await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.json().task.id}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 2 });

    // Soft-deleting a note keeps its link so a trash restore does not lose the attachment.
    await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 2 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM files').get()).toEqual({ count: 1 });
  });

  it('removes links when the file itself is deleted', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'gone.txt');
    const noteId = createNote(database, user.id, 'โน้ต');
    await link(app, user.cookie, 'note', noteId, fileId);

    database.prepare('DELETE FROM files WHERE id = ?').run(fileId);
    expect(database.prepare('SELECT COUNT(*) AS count FROM entity_files').get()).toEqual({ count: 0 });
  });
});

describe('universal search filters', () => {
  function seed(app: ReturnType<typeof createApp>, database: SqliteDatabase, cookie: string, ownerId: string) {
    const fileId = createFile(database, ownerId, 'ใบเสร็จบ้าน.pdf');
    createNote(database, ownerId, 'สรุปการประชุม', 'เนื้อหาเรื่องบ้าน');
    return { fileId };
  }

  async function search(
    app: ReturnType<typeof createApp>,
    cookie: string,
    query: string,
  ) {
    return app.inject({ method: 'GET', url: `/api/search?${query}`, headers: { cookie } });
  }

  it('searches every implemented module and reports the type buckets', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const { fileId } = seed(app, database, user.cookie, user.id);
    await post(app, '/api/tasks', user.cookie, { title: 'งานเรื่องบ้าน' });
    await post(app, '/api/projects', user.cookie, { name: 'โปรเจกต์บ้าน' });
    await post(app, '/api/goals', user.cookie, { title: 'เป้าหมายบ้าน' });
    await post(app, '/api/reminders', user.cookie, { title: 'เตือนเรื่องบ้าน', targetDate: '2026-11-01', category: 'other' });
    await post(app, '/api/bookmarks', user.cookie, { title: 'ลิงก์บ้าน', url: 'https://example.com/home' });

    const body = (await search(app, user.cookie, `q=${encodeURIComponent('บ้าน')}`)).json();
    expect(body.notes).toHaveLength(1);
    expect(body.tasks).toHaveLength(1);
    expect(body.projects).toHaveLength(1);
    expect(body.goals).toHaveLength(1);
    expect(body.reminders).toHaveLength(1);
    expect(body.bookmarks).toHaveLength(1);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].displayName).toBe('ใบเสร็จบ้าน.pdf');
    // The file id is a public identifier; the storage key, hash and object path must never appear.
    expect(JSON.stringify(body)).not.toMatch(/object_?[Kk]ey|sha256/i);
    void fileId;
  });

  it('filters by a single type and by several types', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    seed(app, database, user.cookie, user.id);
    await post(app, '/api/tasks', user.cookie, { title: 'งานเรื่องบ้าน' });

    const notesOnly = (await search(app, user.cookie, `q=${encodeURIComponent('บ้าน')}&types=notes`)).json();
    expect(notesOnly.notes).toHaveLength(1);
    expect(notesOnly.tasks).toHaveLength(0);

    const both = (await search(app, user.cookie, `q=${encodeURIComponent('บ้าน')}&types=notes,tasks`)).json();
    expect(both.notes).toHaveLength(1);
    expect(both.tasks).toHaveLength(1);
    expect(both.files).toHaveLength(0);
  });

  it('rejects an unknown type, a malformed date and an inverted range', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    expect((await search(app, user.cookie, `q=test&types=assets`)).statusCode).toBe(400);
    expect((await search(app, user.cookie, `q=test&from=2026-13-01`)).statusCode).toBe(400);
    const inverted = await search(app, user.cookie, 'q=test&from=2026-12-01&to=2026-01-01');
    expect(inverted.statusCode).toBe(400);
  });

  it('applies a date range to entities that have a date', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    await post(app, '/api/tasks', user.cookie, { title: 'งานเดือนหน้า', dueDate: '2026-12-15' });
    await post(app, '/api/tasks', user.cookie, { title: 'งานเดือนนี้', dueDate: '2026-10-25' });

    const inRange = (await search(app, user.cookie, `q=${encodeURIComponent('งาน')}&from=2026-12-01&to=2026-12-31`)).json();
    expect(inRange.tasks.map((task: { title: string }) => task.title)).toEqual(['งานเดือนหน้า']);

    const outOfRange = (await search(app, user.cookie, `q=${encodeURIComponent('งาน')}&from=2027-01-01`)).json();
    expect(outOfRange.tasks).toHaveLength(0);
  });

  it('keeps Thai short and long queries working with a type filter', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    createNote(database, user.id, 'ประชุม', 'สรุปสั้น');
    createNote(database, user.id, 'รายงานการประชุมประจำเดือน', 'สรุปยาว');

    const short = (await search(app, user.cookie, `q=${encodeURIComponent('ประชุ')}&types=notes`)).json();
    expect(short.notes.length).toBeGreaterThanOrEqual(1);

    const long = (await search(app, user.cookie, `q=${encodeURIComponent('การประชุมประจำเดือน')}&types=notes`)).json();
    expect(long.notes).toHaveLength(1);
  });

  it('never returns another account rows', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    createNote(database, bob.id, 'ความลับของบ๊อบ', 'บ้าน');
    createFile(database, bob.id, 'ของบ๊อบ.txt');

    const body = (await search(app, alice.cookie, `q=${encodeURIComponent('บ้าน')}`)).json();
    expect(body.notes).toHaveLength(0);
    expect(body.files).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain('ของบ๊อบ');
  });

  it('filters dates inside SQL so a page of out-of-range rows cannot hide matches', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const recent = Date.parse('2026-10-20T12:00:00');
    const old = Date.parse('2026-01-15T12:00:00');

    // Ten newer notes outside the range, two older ones inside it. Ordering is newest first, so a
    // post-LIMIT filter would only ever see the out-of-range rows.
    for (let index = 0; index < 10; index += 1) {
      const id = createNote(database, user.id, `รายงานใหม่ ${index}`);
      database.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(recent - index * 1000, id);
    }
    for (let index = 0; index < 2; index += 1) {
      const id = createNote(database, user.id, `รายงานเก่า ${index}`);
      database.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(old - index * 1000, id);
    }

    const body = (await search(
      app,
      user.cookie,
      `q=${encodeURIComponent('รายงาน')}&types=notes&from=2026-01-01&to=2026-01-31&limit=3`,
    )).json();
    expect(body.notes).toHaveLength(2);
    expect(body.notes.every((note: { title: string }) => note.title.includes('เก่า'))).toBe(true);
  });

  it('returns empty buckets for a query with no matches', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    createNote(database, user.id, 'โน้ต');
    const body = (await search(app, user.cookie, `q=${encodeURIComponent('ไม่มีทางเจอ')}`)).json();
    expect(Object.values(body).filter(Array.isArray).every((bucket) => bucket.length === 0)).toBe(true);
  });
});
