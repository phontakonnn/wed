import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
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
type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

const noteSelect = `
  SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt
  FROM notes
`;

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
  options: {
    expectedOrigin?: string;
    sleep?: (milliseconds: number) => Promise<void>;
    logger?: boolean;
    webRoot?: string;
  } = {},
) {
  const expectedOrigin = options.expectedOrigin ?? process.env.EXPECTED_ORIGIN ?? 'http://127.0.0.1:3001';
  const throttle = new LoginThrottle();
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const app = Fastify({
    logger: options.logger ?? (process.env.NODE_ENV !== 'test'),
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.register(rateLimit, { global: false });
  app.decorateRequest('sessionUserId', null);
  if (options.webRoot) {
    app.register(fastifyStatic, {
      root: options.webRoot,
      prefix: '/',
      maxAge: '30d',
      immutable: true,
    });
    app.get('/', async (_request, reply) => reply.sendFile('index.html', { maxAge: 0, immutable: false }));
  }

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    const isHealth = request.method === 'GET' && path === '/api/health';
    const isLogin = request.method === 'POST' && path === '/api/auth/login';
    const isWebAsset = request.method === 'GET' &&
      (path === '/' || path === '/favicon.svg' || path === '/icons.svg' || path.startsWith('/assets/'));
    const isPublic = isHealth || isLogin || isWebAsset;

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

  app.get<{ Querystring: { page: number; pageSize: number } }>('/api/notes', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { page, pageSize } = request.query;
    const offset = (page - 1) * pageSize;
    const total = (database.prepare(`
      SELECT COUNT(*) AS total
      FROM notes
      WHERE owner_id = ? AND deleted_at IS NULL
    `).get(ownerId) as { total: number }).total;
    const notes = database.prepare(`
      ${noteSelect}
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as Note[];

    return { notes, page, pageSize, total };
  });

  app.register(async function notesSearchRoutes(searchRoutes) {
    searchRoutes.get<{ Querystring: { q: string; page: number; pageSize: number } }>('/api/notes/search', {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 500 },
            page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 60,
          timeWindow: '1 minute',
          errorResponseBuilder: (_request, context) => ({
            statusCode: context.statusCode,
            error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
          }),
        },
      },
    }, async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const query = request.query.q.trim().normalize('NFC');
      if (!query || /[\u0000-\u001f\u007f]/u.test(query)) {
        return reply.code(400).send({ error: 'กรุณาระบุคำค้นที่มีอักขระที่ถูกต้อง' });
      }

      const { page, pageSize } = request.query;
      const offset = (page - 1) * pageSize;
      const codePointCount = [...query].length;
      const bindings: Array<string | number> = codePointCount < 3
        ? [ownerId, query]
        : [`"${query.replaceAll('"', '""')}"`, ownerId, query, ownerId];
      const from = codePointCount < 3
        ? 'notes n'
        : 'notes n JOIN notes_fts_trigram ON notes_fts_trigram.rowid = n.rowid';
      const where = codePointCount < 3
        ? 'n.owner_id = ? AND n.deleted_at IS NULL AND instr(nfc(n.title || \' \' || n.content), ?) > 0'
        : `notes_fts_trigram MATCH ? AND n.owner_id = ? AND n.deleted_at IS NULL
        AND instr(nfc(n.title || ' ' || n.content), ?) > 0
        AND notes_fts_trigram.owner_id = ?`;

      try {
        const total = (database.prepare(`
        SELECT COUNT(*) AS total
        FROM ${from}
        WHERE ${where}
      `).get(...bindings) as { total: number }).total;
        const notes = database.prepare(`
        SELECT n.id, n.title, n.content, n.created_at AS createdAt, n.updated_at AS updatedAt
        FROM ${from}
        WHERE ${where}
        ORDER BY n.updated_at DESC, n.id
        LIMIT ? OFFSET ?
      `).all(...bindings, pageSize, offset) as Note[];
        return { notes, page, pageSize, total };
      } catch (error) {
        app.log.error({ err: error }, 'Notes search failed');
        return reply.code(500).send({ error: 'ไม่สามารถค้นหาโน้ตได้ในขณะนี้' });
      }
    });
  });

  app.get<{ Querystring: { page: number; pageSize: number } }>('/api/notes/trash', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { page, pageSize } = request.query;
    const offset = (page - 1) * pageSize;
    const total = (database.prepare(`
      SELECT COUNT(*) AS total
      FROM notes
      WHERE owner_id = ? AND deleted_at IS NOT NULL
    `).get(ownerId) as { total: number }).total;
    const notes = database.prepare(`
      ${noteSelect}
      WHERE owner_id = ? AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC, id
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as Note[];

    return { notes, page, pageSize, total };
  });

  app.post<{ Body: { title: string; content: string } }>('/api/notes', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          content: { type: 'string', maxLength: 100000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = request.body.title.trim();
    if (!title) return reply.code(400).send({ error: 'หัวข้อโน้ตต้องไม่ว่าง' });

    const now = Date.now();
    const id = randomUUID();
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, request.body.content, now, now);
    const note = database.prepare(`${noteSelect} WHERE id = ? AND owner_id = ?`)
      .get(id, ownerId) as Note;

    return reply.code(201).send({ note });
  });

  app.post<{ Params: { noteId: string } }>('/api/notes/:noteId/restore', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare(`
      UPDATE notes
      SET deleted_at = NULL, updated_at = ?
      WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL
    `).run(Date.now(), request.params.noteId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบโน้ตในถังขยะ' });
    const note = database.prepare(`${noteSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.noteId, ownerId) as Note;
    return { note };
  });

  app.delete<{ Params: { noteId: string }; Body: { confirm: boolean } }>('/api/notes/:noteId/permanent', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['confirm'],
        properties: { confirm: { type: 'boolean', enum: [true] } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare(`
      DELETE FROM notes
      WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL
    `).run(request.params.noteId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบโน้ตในถังขยะ' });
    return reply.code(204).send();
  });

  app.get<{ Params: { noteId: string } }>('/api/notes/:noteId', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const note = database.prepare(`
      ${noteSelect}
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.noteId, ownerId) as Note | undefined;
    if (!note) return reply.code(404).send({ error: 'ไม่พบโน้ต' });
    return { note };
  });

  app.patch<{ Params: { noteId: string }; Body: { title?: string; content?: string } }>('/api/notes/:noteId', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          content: { type: 'string', maxLength: 100000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { title, content } = request.body;
    const normalizedTitle = title?.trim();
    if (title !== undefined && !normalizedTitle) {
      return reply.code(400).send({ error: 'หัวข้อโน้ตต้องไม่ว่าง' });
    }

    const result = database.prepare(`
      UPDATE notes
      SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        updated_at = ?
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(normalizedTitle ?? null, content ?? null, Date.now(), request.params.noteId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบโน้ต' });

    const note = database.prepare(`${noteSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.noteId, ownerId) as Note;
    return { note };
  });

  app.delete<{ Params: { noteId: string } }>('/api/notes/:noteId', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const now = Date.now();
    const result = database.prepare(`
      UPDATE notes
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.noteId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบโน้ต' });
    return reply.code(204).send();
  });

  return app;
}

export async function startServer() {
  const dataDirectory = process.env.DATA_DIR;
  if (!dataDirectory) throw new Error('DATA_DIR must be configured before starting the server');
  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const hasWebBuild = existsSync(resolve(webRoot, 'index.html'));
  if (!hasWebBuild) {
    console.warn('Web build is missing; serving API only. Run npm run build:web or use the Vite dev server.');
  }
  const database = openDataDatabase(dataDirectory);
  const server = createApp(database, hasWebBuild ? { webRoot } : {});
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
