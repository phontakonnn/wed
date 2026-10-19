import Fastify from 'fastify';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, hashPassword, hashSessionToken, resolveSession, verifyPassword } from './auth.js';
import { openDataDatabase, type SqliteDatabase } from './database.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUserId: string | null;
  }
}

const SESSION_COOKIE = 'pkh_session';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_DELAY_BASE_MS = 1000;
const LOGIN_DELAY_MAX_MS = 60 * 1000;
const dummyPasswordHash = hashPassword('PKH-dummy-password-never-valid');

type LoginBucket = { failures: number; windowStartedAt: number; blockedUntil: number };

class LoginThrottle {
  private readonly buckets = new Map<string, LoginBucket>();

  delay(keys: string[], now: number): number {
    let delayMs = 0;
    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket || now - bucket.windowStartedAt >= LOGIN_WINDOW_MS) {
        bucket = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
        this.buckets.set(key, bucket);
      }
      if (bucket.failures < LOGIN_FAILURE_LIMIT) continue;
      if (bucket.blockedUntil > now) {
        delayMs = Math.max(delayMs, bucket.blockedUntil - now);
        continue;
      }
      const exponent = Math.min(bucket.failures - LOGIN_FAILURE_LIMIT, 6);
      const nextDelay = Math.min(LOGIN_DELAY_BASE_MS * 2 ** exponent, LOGIN_DELAY_MAX_MS);
      bucket.failures += 1;
      bucket.blockedUntil = now + nextDelay;
      delayMs = Math.max(delayMs, nextDelay);
    }
    return delayMs;
  }

  failure(keys: string[], now: number): void {
    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket || now - bucket.windowStartedAt >= LOGIN_WINDOW_MS) {
        bucket = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
        this.buckets.set(key, bucket);
      }
      bucket.failures += 1;
    }
  }

  clear(keys: string[]): void {
    for (const key of keys) this.buckets.delete(key);
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function csrfIsValid(
  origin: string | undefined,
  host: string | undefined,
  header: string | string[] | undefined,
  expectedOrigin: string,
): boolean {
  if (!origin || !host || header !== '1') return false;
  try {
    const expected = new URL(expectedOrigin);
    const receivedOrigin = new URL(origin);
    const receivedHost = new URL(`${expected.protocol}//${host}`);
    return receivedOrigin.origin === expected.origin && receivedHost.host === expected.host;
  } catch {
    return false;
  }
}

function loginKeys(ip: string, username: string): string[] {
  return [`ip:${ip}`, `account:${username.trim().normalize('NFC').toLocaleLowerCase('en-US')}`];
}

export function createApp(
  database: SqliteDatabase,
  options: { expectedOrigin?: string; sleep?: (milliseconds: number) => Promise<void>; logger?: boolean } = {},
) {
  const expectedOrigin = options.expectedOrigin ?? process.env.EXPECTED_ORIGIN ?? 'http://127.0.0.1:3001';
  const throttle = new LoginThrottle();
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const app = Fastify({ logger: options.logger ?? (process.env.NODE_ENV !== 'test') });
  app.decorateRequest('sessionUserId', null);

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    const isHealth = request.method === 'GET' && path === '/api/health';
    const isLogin = request.method === 'POST' && path === '/api/auth/login';
    const isPublic = isHealth || isLogin;

    if (request.method !== 'GET' && !csrfIsValid(
      request.headers.origin,
      request.headers.host,
      request.headers['x-pkh-request'],
      expectedOrigin,
    )) {
      return reply.code(403).send({ error: 'คำขอไม่ผ่านการตรวจสอบแหล่งที่มา' });
    }

    if (isPublic) return;

    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const userId = token ? resolveSession(database, token) : null;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    request.sessionUserId = userId;
    const revokingSession = request.method === 'POST' &&
      (path === '/api/auth/logout' || path === '/api/auth/logout-all');
    if (!revokingSession) {
      const secure = new URL(expectedOrigin).protocol === 'https:' ? '; Secure' : '';
      reply.header('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    }
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    db: 'ready',
    uptimeSeconds: process.uptime(),
  }));

  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 80 },
          password: { type: 'string', minLength: 1, maxLength: 1024 },
        },
      },
    },
  }, async (request, reply) => {
    const normalizedUsername = request.body.username.trim().normalize('NFC');
    const keys = loginKeys(request.ip, normalizedUsername);
    const delayMs = throttle.delay(keys, Date.now());
    if (delayMs > 0) {
      await sleep(delayMs);
      return reply.code(429).header('retry-after', String(Math.ceil(delayMs / 1000)))
        .send({ error: 'เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้งภายหลัง' });
    }

    const user = database.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(normalizedUsername) as
      { id: string; username: string; password_hash: string } | undefined;
    const passwordHash = user?.password_hash ?? await dummyPasswordHash;
    const passwordMatches = await verifyPassword(request.body.password, passwordHash);

    if (!user || !passwordMatches) {
      throttle.failure(keys, Date.now());
      return reply.code(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    throttle.clear(keys);
    const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';
    const session = createSession(database, user.id, Date.now(), userAgent);
    const secure = new URL(expectedOrigin).protocol === 'https:' ? '; Secure' : '';
    reply.header('set-cookie', `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    return reply.send({ user: { id: user.id, username: user.username } });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const userId = request.sessionUserId;
    const user = database.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as
      { id: string; username: string } | undefined;
    if (!user) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    return { user };
  });

  app.get('/api/auth/sessions', async (request) => {
    const currentToken = readCookie(request.headers.cookie, SESSION_COOKIE);
    const currentId = currentToken ? hashSessionToken(currentToken) : null;
    const sessions = database.prepare(`
      SELECT id_hash AS id, user_agent AS device, created_at AS createdAt,
        last_seen_at AS lastSeenAt, idle_expires_at AS idleExpiresAt,
        absolute_expires_at AS absoluteExpiresAt
      FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC
    `).all(request.sessionUserId) as Array<{
      id: string;
      device: string;
      createdAt: number;
      lastSeenAt: number;
      idleExpiresAt: number;
      absoluteExpiresAt: number;
    }>;
    return {
      sessions: sessions.map((session) => ({ ...session, current: session.id === currentId })),
    };
  });

  app.delete<{ Params: { sessionId: string } }>('/api/auth/sessions/:sessionId', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: { sessionId: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
      },
    },
  }, async (request, reply) => {
    const result = database.prepare('DELETE FROM sessions WHERE id_hash = ? AND user_id = ?')
      .run(request.params.sessionId, request.sessionUserId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบเซสชัน' });
    return reply.code(204).send();
  });

  app.post('/api/auth/sessions/revoke-others', async (request) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const currentId = token ? hashSessionToken(token) : '';
    const result = database.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?')
      .run(request.sessionUserId, currentId);
    return { revoked: result.changes };
  });

  app.post('/api/auth/logout-all', async (request, reply) => {
    const result = database.prepare('DELETE FROM sessions WHERE user_id = ?').run(request.sessionUserId);
    reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return { revoked: result.changes };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) {
      database.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashSessionToken(token));
    }
    reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return reply.send({ ok: true });
  });

  return app;
}

export async function startServer() {
  const dataDirectory = process.env.DATA_DIR;
  if (!dataDirectory) throw new Error('DATA_DIR must be configured before starting the server');
  const database = openDataDatabase(dataDirectory);
  const server = createApp(database);
  await server.listen({ port: Number(process.env.PORT || 3001), host: '127.0.0.1' });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
}

export default createApp;
