import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapUser, createSession, hashSessionToken, resolveSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
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
});
