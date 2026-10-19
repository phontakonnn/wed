import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapUser, createSession, hashSessionToken, resolveSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];
const origin = 'http://localhost:80';

function setup(expectedOrigin = origin) {
  const database = openDatabase(':memory:');
  const app = createApp(database, { expectedOrigin, logger: false, sleep: async () => undefined });
  databases.push(database);
  apps.push(app);
  return { app, database };
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('authentication and sessions', () => {
  it('keeps health public and denies protected routes without a session', async () => {
    const { app } = setup();
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const protectedResponse = await app.inject({ method: 'GET', url: '/api/auth/me' });

    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.payload)).toMatchObject({ status: 'ok', db: 'ready' });
    expect(protectedResponse.statusCode).toBe(401);
  });

  it('requires CSRF headers for login and does not expose registration', async () => {
    const { app } = setup();
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'not-a-password' } });
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin, 'x-pkh-request': '1' }, payload: { username: 'admin' } });

    expect(login.statusCode).toBe(403);
    expect(registration.statusCode).toBe(401);
  });

  it('returns the same credential error for unknown users and wrong passwords', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };
    const unknown = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'missing', password: 'incorrect password' } });
    const incorrect = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'admin', password: 'incorrect password' } });

    expect(unknown.statusCode).toBe(401);
    expect(incorrect.statusCode).toBe(401);
    expect(unknown.payload).toBe(incorrect.payload);
  });

  it('creates an HttpOnly strict cookie and revokes the session on logout', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'admin', password: 'correct horse battery staple' } });
    const setCookie = login.headers['set-cookie'];
    expect(login.statusCode).toBe(200);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const cookie = String(setCookie).split(';')[0];

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.payload)).toMatchObject({ user: { username: 'admin' } });

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...headers, cookie } });
    const revoked = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    expect(revoked.statusCode).toBe(401);
  });

  it('marks session cookies Secure for a configured HTTPS origin', async () => {
    const secureOrigin = 'https://localhost';
    const { app, database } = setup(secureOrigin);
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: secureOrigin, host: 'localhost', 'x-pkh-request': '1' },
      payload: { username: 'admin', password: 'correct horse battery staple' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('Secure');
  });

  it('lists device sessions and revokes only the selected session', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, 'user-agent': 'current-device' },
      payload: { username: 'admin', password: 'correct horse battery staple' },
    });
    const currentCookie = String(login.headers['set-cookie']).split(';')[0];
    const user = database.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: string };
    const other = createSession(database, user.id, Date.now(), 'other-device');
    const sessions = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: { cookie: currentCookie } });
    const sessionList = JSON.parse(sessions.payload).sessions as Array<{ id: string; device: string; current: boolean }>;

    expect(sessionList).toHaveLength(2);
    expect(sessionList.find((session) => session.current)?.device).toBe('current-device');
    const otherSession = sessionList.find((session) => session.device === 'other-device');
    expect(otherSession?.current).toBe(false);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${hashSessionToken(other.token)}`,
      headers: { ...headers, cookie: currentCookie },
    });
    expect(revoked.statusCode).toBe(204);
    expect(resolveSession(database, other.token)).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: currentCookie } })).statusCode).toBe(200);
  });

  it('revokes all sessions and clears the current cookie on logout-all', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'admin', password: 'correct horse battery staple' } });
    const currentCookie = String(login.headers['set-cookie']).split(';')[0];
    const user = database.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: string };
    const other = createSession(database, user.id);
    const logoutAll = await app.inject({ method: 'POST', url: '/api/auth/logout-all', headers: { ...headers, cookie: currentCookie } });

    expect(logoutAll.statusCode).toBe(200);
    expect(JSON.parse(logoutAll.payload).revoked).toBe(2);
    expect(logoutAll.headers['set-cookie']).toContain('Max-Age=0');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: currentCookie } })).statusCode).toBe(401);
    expect(resolveSession(database, other.token)).toBeNull();
  });

  it('applies a retry delay after five failed attempts', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'admin', password: 'incorrect password' } });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'admin', password: 'incorrect password' } });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('1');
  });

  it('requires a session for Notes endpoints', async () => {
    const { app } = setup();
    const list = await app.inject({ method: 'GET', url: '/api/notes' });
    const create = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { origin, 'x-pkh-request': '1' },
      payload: { title: 'Private note', content: 'Content' },
    });

    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
  });

  it('supports creating, listing, reading, updating and soft-deleting an owned note', async () => {
    const { app, database } = setup();
    const userId = 'notes-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'notes-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = {
      cookie: `pkh_session=${session.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const csrfBlocked = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: headers.cookie },
      payload: { title: 'Cross-origin', content: 'Should not be stored' },
    });
    expect(csrfBlocked.statusCode).toBe(403);

    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: '  Project idea  ', content: 'First draft' },
    });
    expect(created.statusCode).toBe(201);
    const { note } = JSON.parse(created.payload) as {
      note: { id: string; title: string; content: string; createdAt: number; updatedAt: number };
    };
    expect(note).toMatchObject({ title: 'Project idea', content: 'First draft' });
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?').all('First'))
      .toEqual([{ note_id: note.id }]);

    const listed = await app.inject({ method: 'GET', url: '/api/notes?page=1&pageSize=10', headers });
    expect(JSON.parse(listed.payload)).toMatchObject({ page: 1, pageSize: 10, total: 1, notes: [{ id: note.id }] });
    const detailed = await app.inject({ method: 'GET', url: `/api/notes/${note.id}`, headers });
    expect(JSON.parse(detailed.payload)).toMatchObject({ note: { title: 'Project idea', content: 'First draft' } });

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      headers,
      payload: { title: 'Updated idea', content: 'Revised draft' },
    });
    expect(updated.statusCode, updated.payload).toBe(200);
    expect(JSON.parse(updated.payload)).toMatchObject({ note: { title: 'Updated idea', content: 'Revised draft' } });
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?').all('First')).toEqual([]);
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?').all('Revised'))
      .toEqual([{ note_id: note.id }]);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/notes/${note.id}`, headers })).statusCode).toBe(404);
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/notes', headers })).payload).total).toBe(0);
    expect(database.prepare('SELECT content, deleted_at FROM notes WHERE id = ?').get(note.id))
      .toMatchObject({ content: 'Revised draft', deleted_at: expect.any(Number) });
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE note_id = ?').all(note.id)).toEqual([]);
  });

  it('restores a soft-deleted note with its original content and reindexes it in FTS', async () => {
    const { app, database } = setup();
    const userId = 'restore-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'restore-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = { cookie: `pkh_session=${session.token}`, origin, 'x-pkh-request': '1' };
    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: 'Keep this heading', content: 'Preserve this note relation' },
    });
    const { note } = JSON.parse(created.payload) as { note: { id: string } };
    await app.inject({ method: 'DELETE', url: `/api/notes/${note.id}`, headers });

    const restored = await app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/restore`,
      headers,
    });
    expect(restored.statusCode, restored.payload).toBe(200);
    expect(JSON.parse(restored.payload)).toMatchObject({
      note: { id: note.id, title: 'Keep this heading', content: 'Preserve this note relation' },
    });
    expect(database.prepare('SELECT deleted_at FROM notes WHERE id = ?').get(note.id))
      .toEqual({ deleted_at: null });
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?').all('relation'))
      .toEqual([{ note_id: note.id }]);
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/notes', headers })).payload).total).toBe(1);
  });

  it('requires explicit confirmation and only permanently deletes notes already in trash', async () => {
    const { app, database } = setup();
    const userId = 'permanent-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'permanent-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = { cookie: `pkh_session=${session.token}`, origin, 'x-pkh-request': '1' };
    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: 'Keep until trashed', content: 'permanent marker' },
    });
    const { note } = JSON.parse(created.payload) as { note: { id: string } };
    const permanentUrl = `/api/notes/${note.id}/permanent`;

    const activeDelete = await app.inject({
      method: 'DELETE', url: permanentUrl, headers, payload: { confirm: true },
    });
    expect(activeDelete.statusCode).toBe(404);
    expect(database.prepare('SELECT deleted_at FROM notes WHERE id = ?').get(note.id))
      .toEqual({ deleted_at: null });

    await app.inject({ method: 'DELETE', url: `/api/notes/${note.id}`, headers });
    const missingConfirmation = await app.inject({ method: 'DELETE', url: permanentUrl, headers });
    const falseConfirmation = await app.inject({
      method: 'DELETE', url: permanentUrl, headers, payload: { confirm: false },
    });
    expect(missingConfirmation.statusCode).toBe(400);
    expect(falseConfirmation.statusCode).toBe(400);
    expect(missingConfirmation.payload).not.toMatch(/stack|[A-Z]:\\\\|apps[\\\\/]server/iu);
    expect(falseConfirmation.payload).not.toMatch(/stack|[A-Z]:\\\\|apps[\\\\/]server/iu);
    expect(database.prepare('SELECT id FROM notes WHERE id = ?').get(note.id)).toBeDefined();

    const permanentDelete = await app.inject({
      method: 'DELETE', url: permanentUrl, headers, payload: { confirm: true },
    });
    expect(permanentDelete.statusCode).toBe(204);
    expect(database.prepare('SELECT id FROM notes WHERE id = ?').get(note.id)).toBeUndefined();
    expect(database.prepare('SELECT note_id FROM notes_fts WHERE note_id = ?').all(note.id)).toEqual([]);
  });

  it('denies unauthenticated and CSRF-invalid trash requests', async () => {
    const { app, database } = setup();
    const userId = 'trash-auth-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'trash-auth-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = { cookie: `pkh_session=${session.token}`, origin, 'x-pkh-request': '1' };

    expect((await app.inject({ method: 'GET', url: '/api/notes/trash' })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST', url: '/api/notes/00000000-0000-4000-8000-000000000001/restore',
      headers: { origin, 'x-pkh-request': '1' },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'DELETE', url: '/api/notes/00000000-0000-4000-8000-000000000001/permanent',
      headers: { origin, 'x-pkh-request': '1' }, payload: { confirm: true },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST', url: '/api/notes/00000000-0000-4000-8000-000000000001/restore',
      headers: { cookie: headers.cookie },
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'DELETE', url: '/api/notes/00000000-0000-4000-8000-000000000001/permanent',
      headers: { cookie: headers.cookie }, payload: { confirm: true },
    })).statusCode).toBe(403);
  });

  it('isolates trash listing, restore and permanent deletion by session owner', async () => {
    const { app, database } = setup();
    const insertUser = database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    );
    insertUser.run('trash-owner-a', 'trash-owner-a', 'test-hash', Date.now());
    insertUser.run('trash-owner-b', 'trash-owner-b', 'test-hash', Date.now());
    const noteId = '00000000-0000-4000-8000-000000000099';
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, 'trash-owner-a', 'Private trash', 'private', 1, 2, 3);
    const otherSession = createSession(database, 'trash-owner-b');
    const headers = {
      cookie: `pkh_session=${otherSession.token}`,
      origin,
      'x-pkh-request': '1',
    };

    const listing = await app.inject({ method: 'GET', url: '/api/notes/trash', headers });
    const restore = await app.inject({
      method: 'POST', url: `/api/notes/${noteId}/restore`, headers,
    });
    const permanentDelete = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/permanent`,
      headers,
      payload: { confirm: true },
    });

    expect(JSON.parse(listing.payload)).toMatchObject({ total: 0, notes: [] });
    expect(restore.statusCode).toBe(404);
    expect(permanentDelete.statusCode).toBe(404);
    expect(database.prepare('SELECT owner_id, deleted_at FROM notes WHERE id = ?').get(noteId))
      .toEqual({ owner_id: 'trash-owner-a', deleted_at: 3 });
  });

  it('paginates trash with a default page size of 50 and a maximum of 200', async () => {
    const { app, database } = setup();
    const userId = 'trash-pagination-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'trash-pagination-owner', 'test-hash', Date.now());
    const insert = database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, '', 1, 2, 3)
    `);
    for (let index = 0; index < 52; index += 1) {
      insert.run(`trash-pagination-${index}`, userId, `Deleted ${index}`);
    }
    const session = createSession(database, userId);
    const headers = { cookie: `pkh_session=${session.token}` };

    const firstPage = await app.inject({ method: 'GET', url: '/api/notes/trash', headers });
    const secondPage = await app.inject({ method: 'GET', url: '/api/notes/trash?page=2', headers });
    const maximumPage = await app.inject({
      method: 'GET', url: '/api/notes/trash?pageSize=200', headers,
    });
    const oversizedPage = await app.inject({
      method: 'GET', url: '/api/notes/trash?pageSize=201', headers,
    });

    expect(JSON.parse(firstPage.payload)).toMatchObject({ page: 1, pageSize: 50, total: 52 });
    expect(JSON.parse(firstPage.payload).notes).toHaveLength(50);
    expect(JSON.parse(secondPage.payload)).toMatchObject({ page: 2, pageSize: 50, total: 52 });
    expect(JSON.parse(secondPage.payload).notes).toHaveLength(2);
    expect(JSON.parse(maximumPage.payload)).toMatchObject({ page: 1, pageSize: 200, total: 52 });
    expect(JSON.parse(maximumPage.payload).notes).toHaveLength(52);
    expect(oversizedPage.statusCode).toBe(400);
  });

  it('validates note inputs and bounds pagination', async () => {
    const { app, database } = setup();
    const userId = 'validation-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'validation-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = {
      cookie: `pkh_session=${session.token}`,
      origin,
      'x-pkh-request': '1',
    };

    const blankTitle = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: '   ', content: '' },
    });
    const blankTitleUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${'00000000-0000-4000-8000-000000000001'}`,
      headers,
      payload: { title: '   ' },
    });
    const invalidBody = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: 'Valid', content: '', extra: true },
    });
    const emptyUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${'00000000-0000-4000-8000-000000000001'}`,
      headers,
      payload: {},
    });
    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/notes/not-a-uuid',
      headers,
    });
    const invalidPage = await app.inject({
      method: 'GET',
      url: '/api/notes?page=0&pageSize=101',
      headers,
    });

    expect(blankTitle.statusCode).toBe(400);
    expect(blankTitleUpdate.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(emptyUpdate.statusCode).toBe(400);
    expect(invalidId.statusCode).toBe(400);
    expect(invalidPage.statusCode).toBe(400);
  });

  it('does not allow another session to read, change or soft-delete a note', async () => {
    const { app, database } = setup();
    const firstUserId = 'first-owner';
    const secondUserId = 'second-owner';
    const insertUser = database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    );
    insertUser.run(firstUserId, 'first-owner', 'test-hash', Date.now());
    insertUser.run(secondUserId, 'second-owner', 'test-hash', Date.now());
    const firstSession = createSession(database, firstUserId);
    const secondSession = createSession(database, secondUserId);
    const firstHeaders = {
      cookie: `pkh_session=${firstSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const secondHeaders = {
      cookie: `pkh_session=${secondSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: firstHeaders,
      payload: { title: 'Owner-only', content: 'Private' },
    });
    const { note } = JSON.parse(created.payload) as { note: { id: string } };

    const read = await app.inject({ method: 'GET', url: `/api/notes/${note.id}`, headers: secondHeaders });
    const list = await app.inject({ method: 'GET', url: '/api/notes', headers: secondHeaders });
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      headers: secondHeaders,
      payload: { title: 'Stolen' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}`,
      headers: secondHeaders,
    });

    expect(read.statusCode).toBe(404);
    expect(JSON.parse(list.payload).total).toBe(0);
    expect(update.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
    expect(database.prepare('SELECT owner_id, title, deleted_at FROM notes WHERE id = ?').get(note.id))
      .toMatchObject({ owner_id: firstUserId, title: 'Owner-only', deleted_at: null });
  });

  it('paginates notes and does not count soft-deleted entries', async () => {
    const { app, database } = setup();
    const userId = 'pagination-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'pagination-owner', 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = {
      cookie: `pkh_session=${session.token}`,
      origin,
      'x-pkh-request': '1',
    };

    for (const title of ['First', 'Second', 'Third']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notes',
        headers,
        payload: { title, content: '' },
      });
      expect(response.statusCode).toBe(201);
    }
    const firstPage = await app.inject({ method: 'GET', url: '/api/notes?page=1&pageSize=2', headers });
    const secondPage = await app.inject({ method: 'GET', url: '/api/notes?page=2&pageSize=2', headers });

    expect(JSON.parse(firstPage.payload)).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(JSON.parse(firstPage.payload).notes).toHaveLength(2);
    expect(JSON.parse(secondPage.payload)).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(JSON.parse(secondPage.payload).notes).toHaveLength(1);
  });

  it('serves the production web build without making protected API routes public', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-web-build-test-'));
    temporaryDirectories.push(directory);
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>PKH test</title>');
    writeFileSync(join(directory, 'assets', 'app.js'), 'window.pkh = true;');
    const database = openDatabase(':memory:');
    const app = createApp(database, { expectedOrigin: origin, logger: false, webRoot: directory });
    databases.push(database);
    apps.push(app);

    const page = await app.inject({ method: 'GET', url: '/' });
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    const protectedApi = await app.inject({ method: 'GET', url: '/api/notes' });

    expect(page.statusCode).toBe(200);
    expect(page.payload).toContain('PKH test');
    expect(page.headers['cache-control']).toContain('max-age=0');
    expect(asset.statusCode).toBe(200);
    expect(asset.payload).toContain('window.pkh');
    expect(protectedApi.statusCode).toBe(401);
  });
});
