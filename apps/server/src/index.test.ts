import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapUser, createSession, hashSessionToken, resolveSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { LoginThrottle, createApp } from './index.js';

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

  it('returns generic unavailable health when the database probe fails', async () => {
    const { app, database } = setup();
    database.close();
    databases.splice(databases.indexOf(database), 1);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toEqual({ status: 'unavailable', db: 'unavailable' });
    expect(response.payload).not.toMatch(/path|stack|sqlite/i);
  });

  it('applies security headers without enabling HSTS on the local HTTP origin', async () => {
    const { app } = setup();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['permissions-policy']).toContain('microphone=()');
    expect(response.headers['permissions-policy']).toContain('geolocation=()');
    expect(response.headers['strict-transport-security']).toBeUndefined();
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

  it('ignores spoofed X-Forwarded-For when throttling login attempts', async () => {
    const { app, database } = setup();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const headers = { origin, 'x-pkh-request': '1' };

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { ...headers, 'x-forwarded-for': `203.0.113.${index}` },
        payload: { username: `probe-${index}`, password: 'incorrect password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, 'x-forwarded-for': '198.51.100.9' },
      payload: { username: 'probe-final', password: 'incorrect password' },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('rejects malformed login bodies without touching the throttle', async () => {
    const { app } = setup();
    const headers = { origin, 'x-pkh-request': '1' };
    for (const payload of [{ username: 'admin' }, { password: 'x' }, { username: '', password: '' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload });
      expect(response.statusCode).toBe(400);
    }
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

  it('requires a session and CSRF validation for bookmark APIs', async () => {
    const { app } = setup();
    const anonymousRead = await app.inject({ method: 'GET', url: '/api/bookmarks' });
    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      payload: { title: 'Example', url: 'https://example.com' },
    });
    const anonymousWrite = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers: { origin, 'x-pkh-request': '1' },
      payload: { title: 'Example', url: 'https://example.com' },
    });

    expect(anonymousRead.statusCode).toBe(401);
    expect(missingCsrf.statusCode).toBe(403);
    expect(anonymousWrite.statusCode).toBe(401);
  });

  it('creates, lists, reads, updates and deletes validated bookmarks', async () => {
    const { app, database } = setup();
    const userId = 'bookmark-crud-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, userId, 'test-hash', Date.now());
    const session = createSession(database, userId);
    const headers = {
      cookie: `pkh_session=${session.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const invalidScheme = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers,
      payload: { title: 'Invalid', url: 'javascript:alert(1)' },
    });
    const credentialsUrl = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers,
      payload: { title: 'Invalid', url: 'https://alice:secret@example.com/path' },
    });
    const emptyTitle = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers,
      payload: { title: '  ', url: 'https://example.com' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers,
      payload: {
        title: '  PKH guide  ',
        url: 'https://example.com/guide',
        description: 'Read later',
      },
    });
    const { bookmark } = JSON.parse(created.payload) as { bookmark: { id: string } };
    const listing = await app.inject({ method: 'GET', url: '/api/bookmarks', headers });
    const detail = await app.inject({ method: 'GET', url: `/api/bookmarks/${bookmark.id}`, headers });
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/bookmarks/${bookmark.id}`,
      headers,
      payload: { title: 'Updated guide', url: 'http://example.org/new', description: '' },
    });
    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/api/bookmarks/${bookmark.id}`,
      headers,
      payload: {},
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/bookmarks/${bookmark.id}`,
      headers,
    });
    const afterDelete = await app.inject({ method: 'GET', url: `/api/bookmarks/${bookmark.id}`, headers });

    expect(invalidScheme.statusCode).toBe(400);
    expect(credentialsUrl.statusCode).toBe(400);
    expect(emptyTitle.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.payload).bookmark).toMatchObject({
      title: 'PKH guide',
      url: 'https://example.com/guide',
      description: 'Read later',
    });
    expect(JSON.parse(listing.payload)).toMatchObject({ total: 1, bookmarks: [{ id: bookmark.id }] });
    expect(JSON.parse(detail.payload).bookmark.id).toBe(bookmark.id);
    expect(JSON.parse(updated.payload).bookmark).toMatchObject({
      title: 'Updated guide',
      url: 'http://example.org/new',
      description: '',
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(deleted.statusCode).toBe(204);
    expect(afterDelete.statusCode).toBe(404);
  });

  it('enforces bookmark owner isolation for detail, update and delete', async () => {
    const { app, database } = setup();
    const insertUser = database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    );
    insertUser.run('bookmark-owner-a', 'bookmark-owner-a', 'test-hash', 1);
    insertUser.run('bookmark-owner-b', 'bookmark-owner-b', 'test-hash', 1);
    const ownerSession = createSession(database, 'bookmark-owner-a');
    const otherSession = createSession(database, 'bookmark-owner-b');
    const ownerHeaders = {
      cookie: `pkh_session=${ownerSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const otherHeaders = {
      cookie: `pkh_session=${otherSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/bookmarks',
      headers: ownerHeaders,
      payload: { title: 'Private link', url: 'https://example.com/private' },
    });
    const { bookmark } = JSON.parse(created.payload) as { bookmark: { id: string } };
    const listing = await app.inject({ method: 'GET', url: '/api/bookmarks', headers: otherHeaders });
    const detail = await app.inject({ method: 'GET', url: `/api/bookmarks/${bookmark.id}`, headers: otherHeaders });
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/bookmarks/${bookmark.id}`,
      headers: otherHeaders,
      payload: { title: 'Taken' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/bookmarks/${bookmark.id}`,
      headers: otherHeaders,
    });

    expect(JSON.parse(listing.payload)).toMatchObject({ total: 0, bookmarks: [] });
    expect(detail.statusCode).toBe(404);
    expect(update.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
    expect(database.prepare('SELECT owner_id, title FROM bookmarks WHERE id = ?').get(bookmark.id))
      .toEqual({ owner_id: 'bookmark-owner-a', title: 'Private link' });
  });

  it('paginates bookmarks with a default size of 50 and maximum of 200', async () => {
    const { app, database } = setup();
    const userId = 'bookmark-pagination-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, userId, 'test-hash', Date.now());
    const insert = database.prepare(`
      INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', 1, 2)
    `);
    for (let index = 0; index < 52; index += 1) {
      insert.run(`bookmark-${index}`, userId, `Link ${index}`, `https://example.com/${index}`);
    }
    const session = createSession(database, userId);
    const headers = { cookie: `pkh_session=${session.token}` };
    const first = await app.inject({ method: 'GET', url: '/api/bookmarks', headers });
    const second = await app.inject({ method: 'GET', url: '/api/bookmarks?page=2', headers });
    const maximum = await app.inject({ method: 'GET', url: '/api/bookmarks?pageSize=200', headers });
    const invalid = await app.inject({ method: 'GET', url: '/api/bookmarks?pageSize=201', headers });

    expect(JSON.parse(first.payload)).toMatchObject({ page: 1, pageSize: 50, total: 52 });
    expect(JSON.parse(first.payload).bookmarks).toHaveLength(50);
    expect(JSON.parse(second.payload)).toMatchObject({ page: 2, pageSize: 50, total: 52 });
    expect(JSON.parse(second.payload).bookmarks).toHaveLength(2);
    expect(JSON.parse(maximum.payload).bookmarks).toHaveLength(52);
    expect(invalid.statusCode).toBe(400);
  });

  it('provides authenticated owner-scoped CRUD for categories and tags', async () => {
    const { app, database } = setup();
    const insertUser = database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    );
    insertUser.run('taxonomy-api-owner-a', 'taxonomy-api-owner-a', 'test-hash', 1);
    insertUser.run('taxonomy-api-owner-b', 'taxonomy-api-owner-b', 'test-hash', 1);
    const ownerSession = createSession(database, 'taxonomy-api-owner-a');
    const otherSession = createSession(database, 'taxonomy-api-owner-b');
    const headers = {
      cookie: `pkh_session=${ownerSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const otherHeaders = {
      cookie: `pkh_session=${otherSession.token}`,
      origin,
      'x-pkh-request': '1',
    };

    const anonymous = await app.inject({ method: 'GET', url: '/api/categories' });
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/tags',
      payload: { name: 'priority' },
    });
    const invalidName = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers,
      payload: { name: '   ' },
    });
    const categoryCreate = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers,
      payload: { name: '  งาน  ' },
    });
    const category = JSON.parse(categoryCreate.payload).category as { id: string; name: string };
    const duplicateCategory = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers,
      payload: { name: 'งาน' },
    });
    const tagCreate = await app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: 'สำคัญ' },
    });
    const tag = JSON.parse(tagCreate.payload).tag as { id: string; name: string };
    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/tags/${tag.id}`,
      headers,
      payload: { name: 'ต้องอ่าน' },
    });
    const otherList = await app.inject({ method: 'GET', url: '/api/categories', headers: otherHeaders });
    const otherRename = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${category.id}`,
      headers: otherHeaders,
      payload: { name: 'Private category' },
    });
    const otherDelete = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${category.id}`,
      headers: otherHeaders,
    });
    const deleteCategory = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${category.id}`,
      headers,
    });
    const deletedCategoryRead = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${category.id}`,
      headers,
      payload: { name: 'No longer exists' },
    });
    const deleteTag = await app.inject({ method: 'DELETE', url: `/api/tags/${tag.id}`, headers });
    const tagList = await app.inject({ method: 'GET', url: '/api/tags', headers });

    expect(anonymous.statusCode).toBe(401);
    expect(noCsrf.statusCode).toBe(403);
    expect(invalidName.statusCode).toBe(400);
    expect(categoryCreate.statusCode).toBe(201);
    expect(category.name).toBe('งาน');
    expect(duplicateCategory.statusCode).toBe(409);
    expect(tagCreate.statusCode).toBe(201);
    expect(JSON.parse(rename.payload).tag.name).toBe('ต้องอ่าน');
    expect(JSON.parse(otherList.payload)).toMatchObject({ total: 0, categories: [] });
    expect(otherRename.statusCode).toBe(404);
    expect(otherDelete.statusCode).toBe(404);
    expect(deleteCategory.statusCode).toBe(204);
    expect(deletedCategoryRead.statusCode).toBe(404);
    expect(deleteTag.statusCode).toBe(204);
    expect(JSON.parse(tagList.payload)).toMatchObject({ total: 0, tags: [] });
  });

  it('assigns taxonomy transactionally and preserves note relations through Trash restore', async () => {
    const { app, database } = setup();
    const insertUser = database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    );
    insertUser.run('taxonomy-rel-owner-a', 'taxonomy-rel-owner-a', 'test-hash', 1);
    insertUser.run('taxonomy-rel-owner-b', 'taxonomy-rel-owner-b', 'test-hash', 1);
    const ownerSession = createSession(database, 'taxonomy-rel-owner-a');
    const otherSession = createSession(database, 'taxonomy-rel-owner-b');
    const headers = {
      cookie: `pkh_session=${ownerSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const otherHeaders = {
      cookie: `pkh_session=${otherSession.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const categoryResponse = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers,
      payload: { name: 'ส่วนตัว' },
    });
    const tagResponse = await app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: 'กลับมาอ่าน' },
    });
    const categoryId = JSON.parse(categoryResponse.payload).category.id as string;
    const tagId = JSON.parse(tagResponse.payload).tag.id as string;
    const createdNote = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: 'Taxonomy relation', content: 'Keep assignments' },
    });
    const noteId = JSON.parse(createdNote.payload).note.id as string;
    const anonymousRead = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
    });
    const missingCsrf = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: { cookie: `pkh_session=${ownerSession.token}` },
      payload: { categoryIds: [], tagIds: [] },
    });
    const setRelations = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
      payload: { categoryIds: [categoryId], tagIds: [tagId] },
    });
    const initialRelations = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
    });
    const invalidRelations = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
      payload: { categoryIds: ['00000000-0000-4000-8000-000000000001'], tagIds: [] },
    });
    const foreignRelations = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: otherHeaders,
      payload: { categoryIds: [], tagIds: [] },
    });
    const otherRead = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: otherHeaders,
    });
    const softDelete = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
      headers,
    });
    const relationDuringTrash = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
    });
    const restore = await app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/restore`,
      headers,
    });
    const restoredRelations = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
    });
    const deleteCategory = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${categoryId}`,
      headers,
    });
    const relationsAfterCategoryDelete = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
    });
    const deleteTag = await app.inject({
      method: 'DELETE',
      url: `/api/tags/${tagId}`,
      headers,
    });

    expect(setRelations.statusCode).toBe(204);
    expect(anonymousRead.statusCode).toBe(401);
    expect(missingCsrf.statusCode).toBe(403);
    expect(JSON.parse(initialRelations.payload)).toMatchObject({
      categories: [{ id: categoryId, name: 'ส่วนตัว' }],
      tags: [{ id: tagId, name: 'กลับมาอ่าน' }],
    });
    expect(invalidRelations.statusCode).toBe(400);
    expect(foreignRelations.statusCode).toBe(404);
    expect(otherRead.statusCode).toBe(404);
    expect(softDelete.statusCode).toBe(204);
    expect(relationDuringTrash.statusCode).toBe(404);
    expect(restore.statusCode).toBe(200);
    expect(JSON.parse(restoredRelations.payload)).toEqual(JSON.parse(initialRelations.payload));
    expect(deleteCategory.statusCode).toBe(204);
    expect(JSON.parse(relationsAfterCategoryDelete.payload)).toEqual({
      categories: [],
      tags: [{ id: tagId, name: 'กลับมาอ่าน' }],
      people: [],
    });
    expect(deleteTag.statusCode).toBe(204);
    expect(database.prepare('SELECT COUNT(*) AS count FROM note_categories WHERE note_id = ?').get(noteId))
      .toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM note_tags WHERE note_id = ?').get(noteId))
      .toEqual({ count: 0 });
  });

  it('paginates category lists and rejects duplicate relation identifiers', async () => {
    const { app, database } = setup();
    const userId = 'taxonomy-pagination-owner';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, userId, 'test-hash', 1);
    const insert = database.prepare(`
      INSERT INTO categories (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)
    `);
    for (let index = 0; index < 52; index += 1) {
      insert.run(`category-page-${index}`, userId, `Category ${index}`);
    }
    const session = createSession(database, userId);
    const headers = {
      cookie: `pkh_session=${session.token}`,
      origin,
      'x-pkh-request': '1',
    };
    const first = await app.inject({ method: 'GET', url: '/api/categories', headers });
    const second = await app.inject({ method: 'GET', url: '/api/categories?page=2', headers });
    const maximum = await app.inject({ method: 'GET', url: '/api/categories?pageSize=200', headers });
    const invalid = await app.inject({ method: 'GET', url: '/api/categories?pageSize=201', headers });
    const noteResponse = await app.inject({
      method: 'POST',
      url: '/api/notes',
      headers,
      payload: { title: 'Duplicate taxonomy', content: '' },
    });
    const noteId = JSON.parse(noteResponse.payload).note.id as string;
    const duplicateIds = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers,
      payload: { categoryIds: ['category-page-0', 'category-page-0'], tagIds: [] },
    });

    expect(JSON.parse(first.payload)).toMatchObject({ page: 1, pageSize: 50, total: 52 });
    expect(JSON.parse(first.payload).categories).toHaveLength(50);
    expect(JSON.parse(second.payload).categories).toHaveLength(2);
    expect(JSON.parse(maximum.payload).categories).toHaveLength(52);
    expect(invalid.statusCode).toBe(400);
    expect(duplicateIds.statusCode).toBe(400);
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


describe('login throttle bounds', () => {
  it('never tracks more than the configured number of keys', () => {
    const throttle = new LoginThrottle(5);
    const now = Date.now();
    for (let index = 0; index < 40; index += 1) {
      throttle.failure([`account:user-${index}`, `ip:198.51.100.${index}`], now);
      expect(throttle.size).toBeLessThanOrEqual(5);
    }
  });

  it('drops expired buckets before evicting active ones', () => {
    const throttle = new LoginThrottle(3);
    const now = Date.now();
    throttle.failure(['account:old'], now - 20 * 60 * 1000);
    throttle.failure(['account:a'], now);
    throttle.failure(['account:b'], now);

    throttle.failure(['account:c'], now);

    expect(throttle.size).toBeLessThanOrEqual(3);
    // The old bucket was expired and should be the one removed, so a and b still throttle.
    expect(throttle.delay(['account:a'], now)).toBe(0);
    throttle.failure(['account:a'], now);
    throttle.failure(['account:a'], now);
    throttle.failure(['account:a'], now);
    throttle.failure(['account:a'], now);
    expect(throttle.delay(['account:a'], now)).toBeGreaterThan(0);
  });

  it('resets after a successful login clears the keys', () => {
    const throttle = new LoginThrottle(10);
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) throttle.failure(['ip:x', 'account:y'], now);
    throttle.clear(['ip:x', 'account:y']);

    expect(throttle.delay(['ip:x', 'account:y'], now)).toBe(0);
    // Reading a cleared key must not recreate it.
    expect(throttle.size).toBe(0);
  });

  it('does not create entries for unknown keys', () => {
    const throttle = new LoginThrottle(10);
    const now = Date.now();
    expect(throttle.delay(['account:never-seen'], now)).toBe(0);
    expect(throttle.size).toBe(0);
  });

  it('never evicts a blocked bucket under key churn', () => {
    const throttle = new LoginThrottle(8);
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) throttle.failure(['account:victim'], now);
    expect(throttle.delay(['account:victim'], now)).toBeGreaterThan(0);

    // Churn hundreds of distinct keys; the blocked bucket must survive and keep throttling.
    for (let index = 0; index < 500; index += 1) {
      throttle.failure([`account:noise-${index}`, `ip:198.51.100.${index}`], now);
    }

    expect(throttle.delay(['account:victim'], now)).toBeGreaterThan(0);
    expect(throttle.size).toBeLessThanOrEqual(8);
  });

  it('keeps an IP bucket blocked even when every tracked key is protected', () => {
    const throttle = new LoginThrottle(2);
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) throttle.failure(['ip:203.0.113.7'], now);
    expect(throttle.delay(['ip:203.0.113.7'], now)).toBeGreaterThan(0);
    throttle.failure(['account:a'], now);
    throttle.failure(['account:b'], now);

    // The map is full of protected buckets, so a brand-new key is not tracked...
    throttle.failure(['account:brand-new'], now);
    expect(throttle.size).toBeLessThanOrEqual(2);
    // ...but the shared IP bucket still enforces the limit.
    expect(throttle.delay(['ip:203.0.113.7'], now)).toBeGreaterThan(0);
  });

  it('prefers evicting the least-progressed bucket', () => {
    const throttle = new LoginThrottle(3);
    const now = Date.now();
    for (let index = 0; index < 4; index += 1) throttle.failure(['account:almost'], now);
    throttle.failure(['account:low'], now);
    throttle.failure(['account:mid'], now);
    throttle.failure(['account:mid'], now);

    // One more distinct key needs a slot; "low" has the fewest failures and should go.
    throttle.failure(['account:new'], now);

    // "almost" is still one failure away from the limit and must remain tracked.
    throttle.failure(['account:almost'], now);
    expect(throttle.delay(['account:almost'], now)).toBeGreaterThan(0);
  });

  it('forgets failures after the window elapses', () => {
    const throttle = new LoginThrottle(10);
    const now = Date.now();
    for (let index = 0; index < 5; index += 1) throttle.failure(['account:z'], now);
    const later = now + 16 * 60 * 1000;
    expect(throttle.delay(['account:z'], later)).toBe(0);
  });
});
