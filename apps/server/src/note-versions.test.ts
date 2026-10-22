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

const post = (app: App, url: string, cookie: string, payload?: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, headers: { ...csrf, cookie }, payload });
const patch = (app: App, url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url, headers: { ...csrf, cookie }, payload });
const get = (app: App, url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('note version history', () => {
  it('snapshots previous revisions on edit and allows listing versions', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    // 1. Create a note (Version 0 / Initial state)
    const createRes = await post(app, '/api/notes', user.cookie, {
      title: 'โน้ตเริ่มต้น',
      content: 'เนื้อหาดั้งเดิม',
    });
    expect(createRes.statusCode).toBe(201);
    const note = createRes.json().note;
    expect(note.title).toBe('โน้ตเริ่มต้น');

    // Initially no versions in history
    const v0Res = await get(app, `/api/notes/${note.id}/versions`, user.cookie);
    expect(v0Res.statusCode).toBe(200);
    expect(v0Res.json().versions).toEqual([]);

    // 2. Edit note -> snapshots initial state to version 1
    const edit1Res = await patch(app, `/api/notes/${note.id}`, user.cookie, {
      title: 'โน้ตแก้ไขครั้งที่ 1',
      content: 'เนื้อหาอัปเดตครั้งแรก',
    });
    expect(edit1Res.statusCode).toBe(200);
    expect(edit1Res.json().note.title).toBe('โน้ตแก้ไขครั้งที่ 1');

    const v1Res = await get(app, `/api/notes/${note.id}/versions`, user.cookie);
    expect(v1Res.statusCode).toBe(200);
    const versions1 = v1Res.json().versions;
    expect(versions1).toHaveLength(1);
    expect(versions1[0].versionNumber).toBe(1);
    expect(versions1[0].title).toBe('โน้ตเริ่มต้น');
    expect(versions1[0].content).toBe('เนื้อหาดั้งเดิม');

    // 3. Edit note again -> snapshots version 2
    const edit2Res = await patch(app, `/api/notes/${note.id}`, user.cookie, {
      title: 'โน้ตแก้ไขครั้งที่ 2',
      content: 'เนื้อหาล่าสุด',
    });
    expect(edit2Res.statusCode).toBe(200);

    const v2Res = await get(app, `/api/notes/${note.id}/versions`, user.cookie);
    expect(v2Res.statusCode).toBe(200);
    const versions2 = v2Res.json().versions;
    expect(versions2).toHaveLength(2);
    // Ordered descending by versionNumber
    expect(versions2[0].versionNumber).toBe(2);
    expect(versions2[0].title).toBe('โน้ตแก้ไขครั้งที่ 1');
    expect(versions2[1].versionNumber).toBe(1);
    expect(versions2[1].title).toBe('โน้ตเริ่มต้น');
  });

  it('restores a previous version and snapshots the pre-restore state', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    // Create note
    const createRes = await post(app, '/api/notes', user.cookie, {
      title: 'เวอร์ชันแรก',
      content: 'เนื้อหาแรก',
    });
    const noteId = createRes.json().note.id;

    // Update to v2
    await patch(app, `/api/notes/${noteId}`, user.cookie, {
      title: 'เวอร์ชันสอง',
      content: 'เนื้อหาสอง',
    });

    // Update to v3
    await patch(app, `/api/notes/${noteId}`, user.cookie, {
      title: 'เวอร์ชันสาม',
      content: 'เนื้อหาสาม',
    });

    // Get versions
    const vRes = await get(app, `/api/notes/${noteId}/versions`, user.cookie);
    const versions = vRes.json().versions;
    expect(versions).toHaveLength(2);
    const version1 = versions.find((v: { versionNumber: number }) => v.versionNumber === 1);
    expect(version1).toBeDefined();

    // Restore to version 1
    const restoreRes = await post(app, `/api/notes/${noteId}/versions/${version1.id}/restore`, user.cookie);
    expect(restoreRes.statusCode).toBe(200);
    const restoredNote = restoreRes.json().note;
    expect(restoredNote.title).toBe('เวอร์ชันแรก');
    expect(restoredNote.content).toBe('เนื้อหาแรก');

    // Verify a snapshot was created of version 3 before restoring
    const vAfterRestore = await get(app, `/api/notes/${noteId}/versions`, user.cookie);
    const versionsAfter = vAfterRestore.json().versions;
    expect(versionsAfter).toHaveLength(3);
    expect(versionsAfter[0].versionNumber).toBe(3);
    expect(versionsAfter[0].title).toBe('เวอร์ชันสาม');
    expect(versionsAfter[0].content).toBe('เนื้อหาสาม');
  });

  it('enforces owner isolation and authentication', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    const createRes = await post(app, '/api/notes', alice.cookie, {
      title: 'ของ Alice',
      content: 'ความลับของ Alice',
    });
    const noteId = createRes.json().note.id;

    await patch(app, `/api/notes/${noteId}`, alice.cookie, {
      title: 'ของ Alice v2',
      content: 'ความลับของ Alice v2',
    });

    const aliceVersions = (await get(app, `/api/notes/${noteId}/versions`, alice.cookie)).json().versions;
    const vId = aliceVersions[0].id;

    // Bob cannot list Alice's note versions
    const bobListRes = await get(app, `/api/notes/${noteId}/versions`, bob.cookie);
    expect(bobListRes.statusCode).toBe(404);

    // Bob cannot restore Alice's note version
    const bobRestoreRes = await post(app, `/api/notes/${noteId}/versions/${vId}/restore`, bob.cookie);
    expect(bobRestoreRes.statusCode).toBe(404);

    // Unauthenticated requests return 401
    const anonListRes = await app.inject({ method: 'GET', url: `/api/notes/${noteId}/versions` });
    expect(anonListRes.statusCode).toBe(401);
  });
});
