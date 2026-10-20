import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, hashPassword, hashSessionToken, resolveSession, verifyPassword } from './auth.js';
import type { SqliteDatabase } from './database.js';
import {
  FileStorageError,
  MAX_CONCURRENT_UPLOADS,
  assertFreeSpace,
  contentDisposition,
  decodeFileNameHeader,
  deleteObject,
  isInlineMediaType,
  maxUploadBytes,
  objectExists,
  objectSize,
  parseRange,
  readObject,
  storeUpload,
} from './files.js';
import { registerLifeOsRoutes } from './life-os.js';
import { registerWorkRoutes } from './work.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerHabitLogRoutes } from './habit-logs.js';
import { registerEntityFileRoutes } from './file-links.js';
import { openDataDatabaseSafely } from './safe-open.js';

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

type LoginBucket = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  lastSeenAt: number;
};
const LOGIN_MAX_TRACKED_KEYS = 10_000;
type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};
type Bookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};
type TaxonomyItem = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};
type StoredFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  sha256: string;
  mediaType: string;
  createdAt: number;
};
type FavoriteItemType = 'note' | 'bookmark';

const fileSelect = `
  SELECT id, display_name AS displayName, size_bytes AS sizeBytes, sha256,
    media_type AS mediaType, created_at AS createdAt
  FROM files
`;
const favoriteTypes = new Set<FavoriteItemType>(['note', 'bookmark']);

const noteSelect = `
  SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt
  FROM notes
`;
const bookmarkSelect = `
  SELECT id, title, url, description, created_at AS createdAt, updated_at AS updatedAt
  FROM bookmarks
`;
const taxonomyResources = [
  { table: 'categories', response: 'categories', singular: 'category' },
  { table: 'tags', response: 'tags', singular: 'tag' },
] as const;

const taxonomyNameSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 80,
} as const;

function normalizeTaxonomyName(value: string): string | null {
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return name;
}

function validateBookmarkUrl(value: string): string | null {
  const input = value.trim();
  if (!input || /[\u0000-\u001f\u007f]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export class LoginThrottle {
  private readonly buckets = new Map<string, LoginBucket>();
  private readonly maxKeys: number;

  constructor(maxKeys = LOGIN_MAX_TRACKED_KEYS) {
    this.maxKeys = Math.max(1, maxKeys);
  }

  /** Exposed for tests and diagnostics; no key material is stored here. */
  get size(): number {
    return this.buckets.size;
  }

  private isExpired(bucket: LoginBucket, now: number): boolean {
    return now - bucket.windowStartedAt >= LOGIN_WINDOW_MS && bucket.blockedUntil <= now;
  }

  /**
   * Free one slot without ever discarding an active protection.
   *
   * Order: expired buckets, then buckets that never recorded a failure, then the least-progressed
   * unprotected bucket (oldest wins ties). A bucket that has reached the failure limit or is
   * currently blocked is never evicted, so key churn cannot clear a target's active rate limit.
   * Returns false when every tracked bucket is protected; the caller then declines to track the
   * new key, which leaves the existing IP bucket as the enforcement point.
   */
  private makeRoom(now: number): boolean {
    for (const [key, bucket] of this.buckets) {
      if (this.isExpired(bucket, now)) this.buckets.delete(key);
    }
    if (this.buckets.size < this.maxKeys) return true;

    for (const [key, bucket] of this.buckets) {
      if (bucket.failures === 0 && bucket.blockedUntil <= now) this.buckets.delete(key);
    }
    if (this.buckets.size < this.maxKeys) return true;

    let victimKey: string | null = null;
    let victimFailures = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.failures >= LOGIN_FAILURE_LIMIT || bucket.blockedUntil > now) continue;
      if (bucket.failures < victimFailures) {
        victimKey = key;
        victimFailures = bucket.failures;
      }
    }
    if (victimKey === null) return false;
    this.buckets.delete(victimKey);
    return true;
  }

  /** Create or reuse a bucket for a recorded failure, or null when it cannot be tracked. */
  private track(key: string, now: number): LoginBucket | null {
    let bucket = this.buckets.get(key);
    if (bucket && this.isExpired(bucket, now)) {
      this.buckets.delete(key);
      bucket = undefined;
    }
    if (bucket) {
      bucket.lastSeenAt = now;
      return bucket;
    }
    if (this.buckets.size >= this.maxKeys && !this.makeRoom(now)) return null;
    const created: LoginBucket = { failures: 0, windowStartedAt: now, blockedUntil: 0, lastSeenAt: now };
    this.buckets.set(key, created);
    return created;
  }

  /**
   * Delay for existing buckets only. Reading an unknown key never creates an entry, so ordinary
   * successful logins and one-off usernames cannot fill the map.
   */
  delay(keys: string[], now: number): number {
    let delayMs = 0;
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      if (this.isExpired(bucket, now)) {
        this.buckets.delete(key);
        continue;
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
      const bucket = this.track(key, now);
      if (bucket) bucket.failures += 1;
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
    /** Root of the object store; file routes are unavailable when it is not configured. */
    dataDirectory?: string;
  } = {},
) {
  const expectedOrigin = options.expectedOrigin ?? process.env.EXPECTED_ORIGIN ?? 'http://127.0.0.1:3001';
  const dataDirectory = options.dataDirectory ? resolve(options.dataDirectory) : null;
  let activeUploads = 0;
  const throttle = new LoginThrottle();
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const app = Fastify({
    logger: options.logger ?? (process.env.NODE_ENV !== 'test'),
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
    hsts: false,
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
  });
  app.register(rateLimit, { global: false });
  app.decorateRequest('sessionUserId', null);
  // Raw uploads are streamed by the route; the body is never buffered.
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });
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

    if (request.method !== 'GET' && request.method !== 'HEAD' && !csrfIsValid(
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

  app.get('/api/health', async (_request, reply) => {
    try {
      database.prepare('SELECT 1').get();
      return {
        status: 'ok',
        db: 'ready',
        uptimeSeconds: process.uptime(),
      };
    } catch (error) {
      app.log.error({ err: error }, 'Health check database probe failed');
      return reply.code(503).send({ status: 'unavailable', db: 'unavailable' });
    }
  });

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

  app.get<{ Querystring: { page: number; pageSize: number } }>('/api/bookmarks', {
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
    const total = (database.prepare('SELECT COUNT(*) AS total FROM bookmarks WHERE owner_id = ?')
      .get(ownerId) as { total: number }).total;
    const bookmarks = database.prepare(`
      ${bookmarkSelect}
      WHERE owner_id = ?
      ORDER BY updated_at DESC, id
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as Bookmark[];
    return { bookmarks, page, pageSize, total };
  });

  app.post<{ Body: { title: string; url: string; description?: string } }>('/api/bookmarks', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          url: { type: 'string', minLength: 1, maxLength: 2048 },
          description: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = request.body.title.trim();
    const url = validateBookmarkUrl(request.body.url);
    if (!title) return reply.code(400).send({ error: 'ชื่อบุ๊กมาร์กต้องไม่ว่าง' });
    if (!url) return reply.code(400).send({ error: 'URL ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้องและไม่มีข้อมูลรับรอง' });

    const now = Date.now();
    const id = randomUUID();
    database.prepare(`
      INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, url, request.body.description ?? '', now, now);
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ?`)
      .get(id, ownerId) as Bookmark;
    return reply.code(201).send({ bookmark });
  });

  app.get<{ Params: { bookmarkId: string } }>('/api/bookmarks/:bookmarkId', {
    schema: {
      params: {
        type: 'object',
        required: ['bookmarkId'],
        properties: { bookmarkId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.bookmarkId, ownerId) as Bookmark | undefined;
    if (!bookmark) return reply.code(404).send({ error: 'ไม่พบบุ๊กมาร์ก' });
    return { bookmark };
  });

  app.patch<{
    Params: { bookmarkId: string };
    Body: { title?: string; url?: string; description?: string };
  }>('/api/bookmarks/:bookmarkId', {
    schema: {
      params: {
        type: 'object',
        required: ['bookmarkId'],
        properties: { bookmarkId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          url: { type: 'string', minLength: 1, maxLength: 2048 },
          description: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const current = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.bookmarkId, ownerId) as Bookmark | undefined;
    if (!current) return reply.code(404).send({ error: 'ไม่พบบุ๊กมาร์ก' });

    const title = request.body.title === undefined ? current.title : request.body.title.trim();
    const url = request.body.url === undefined ? current.url : validateBookmarkUrl(request.body.url);
    const description = request.body.description ?? current.description;
    if (!title) return reply.code(400).send({ error: 'ชื่อบุ๊กมาร์กต้องไม่ว่าง' });
    if (!url) return reply.code(400).send({ error: 'URL ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้องและไม่มีข้อมูลรับรอง' });
    database.prepare(`
      UPDATE bookmarks SET title = ?, url = ?, description = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(title, url, description, Date.now(), request.params.bookmarkId, ownerId);
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.bookmarkId, ownerId) as Bookmark;
    return { bookmark };
  });

  app.delete<{ Params: { bookmarkId: string } }>('/api/bookmarks/:bookmarkId', {
    schema: {
      params: {
        type: 'object',
        required: ['bookmarkId'],
        properties: { bookmarkId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM bookmarks WHERE id = ? AND owner_id = ?')
      .run(request.params.bookmarkId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบบุ๊กมาร์ก' });
    return reply.code(204).send();
  });

  const favoriteItemParams = {
    type: 'object',
    required: ['itemType', 'itemId'],
    properties: {
      itemType: { type: 'string', enum: ['note', 'bookmark'] },
      itemId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    },
  } as const;

  function favoriteTargetExists(ownerId: string, itemType: FavoriteItemType, itemId: string): boolean {
    const row = itemType === 'note'
      ? database.prepare(`
          SELECT 1 FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
        `).get(itemId, ownerId)
      : database.prepare('SELECT 1 FROM bookmarks WHERE id = ? AND owner_id = ?').get(itemId, ownerId);
    return row !== undefined;
  }

  app.get<{ Querystring: { page: number; pageSize: number } }>('/api/favorites', {
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
    const visibleWhere = `
      f.owner_id = ? AND (
        (f.item_type = 'note' AND n.id IS NOT NULL AND n.deleted_at IS NULL)
        OR (f.item_type = 'bookmark' AND b.id IS NOT NULL)
      )
    `;
    const from = `
      FROM favorites f
      LEFT JOIN notes n ON f.item_type = 'note' AND n.id = f.item_id AND n.owner_id = f.owner_id
      LEFT JOIN bookmarks b ON f.item_type = 'bookmark' AND b.id = f.item_id AND b.owner_id = f.owner_id
    `;
    const total = (database.prepare(`SELECT COUNT(*) AS total ${from} WHERE ${visibleWhere}`)
      .get(ownerId) as { total: number }).total;
    const rows = database.prepare(`
      SELECT f.item_type AS itemType, f.item_id AS itemId, f.created_at AS createdAt,
        n.title AS noteTitle, n.content AS noteContent, n.updated_at AS noteUpdatedAt,
        b.title AS bookmarkTitle, b.url AS bookmarkUrl, b.updated_at AS bookmarkUpdatedAt
      ${from}
      WHERE ${visibleWhere}
      ORDER BY f.created_at DESC, f.item_id
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as Array<{
      itemType: FavoriteItemType;
      itemId: string;
      createdAt: number;
      noteTitle: string | null;
      noteContent: string | null;
      noteUpdatedAt: number | null;
      bookmarkTitle: string | null;
      bookmarkUrl: string | null;
      bookmarkUpdatedAt: number | null;
    }>;
    const favorites = rows.map((row) => ({
      itemType: row.itemType,
      itemId: row.itemId,
      createdAt: row.createdAt,
      title: (row.itemType === 'note' ? row.noteTitle : row.bookmarkTitle) ?? '',
      subtitle: (row.itemType === 'note' ? row.noteContent : row.bookmarkUrl) ?? '',
      updatedAt: (row.itemType === 'note' ? row.noteUpdatedAt : row.bookmarkUpdatedAt) ?? row.createdAt,
    }));
    return { favorites, page, pageSize, total };
  });

  app.get<{ Params: { itemType: FavoriteItemType; itemId: string } }>(
    '/api/favorites/:itemType/:itemId',
    { schema: { params: favoriteItemParams } },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      if (!favoriteTypes.has(request.params.itemType)) {
        return reply.code(400).send({ error: 'ประเภทของรายการไม่ถูกต้อง' });
      }
      const row = database.prepare(`
        SELECT 1 FROM favorites WHERE owner_id = ? AND item_type = ? AND item_id = ?
      `).get(ownerId, request.params.itemType, request.params.itemId);
      return { favorited: row !== undefined };
    },
  );

  app.put<{ Params: { itemType: FavoriteItemType; itemId: string } }>(
    '/api/favorites/:itemType/:itemId',
    { schema: { params: favoriteItemParams } },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      if (!favoriteTypes.has(request.params.itemType)) {
        return reply.code(400).send({ error: 'ประเภทของรายการไม่ถูกต้อง' });
      }
      if (!favoriteTargetExists(ownerId, request.params.itemType, request.params.itemId)) {
        return reply.code(404).send({ error: 'ไม่พบรายการที่ต้องการบันทึกเป็นรายการโปรด' });
      }
      database.prepare(`
        INSERT INTO favorites (owner_id, item_type, item_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (owner_id, item_type, item_id) DO NOTHING
      `).run(ownerId, request.params.itemType, request.params.itemId, Date.now());
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { itemType: FavoriteItemType; itemId: string } }>(
    '/api/favorites/:itemType/:itemId',
    { schema: { params: favoriteItemParams } },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      if (!favoriteTypes.has(request.params.itemType)) {
        return reply.code(400).send({ error: 'ประเภทของรายการไม่ถูกต้อง' });
      }
      const result = database.prepare(`
        DELETE FROM favorites WHERE owner_id = ? AND item_type = ? AND item_id = ?
      `).run(ownerId, request.params.itemType, request.params.itemId);
      if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการโปรด' });
      return reply.code(204).send();
    },
  );

  for (const resource of taxonomyResources) {
    app.get<{ Querystring: { page: number; pageSize: number } }>(`/api/${resource.table}`, {
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
      const total = (database.prepare(`SELECT COUNT(*) AS total FROM ${resource.table} WHERE owner_id = ?`)
        .get(ownerId) as { total: number }).total;
      const items = database.prepare(`
        SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
        FROM ${resource.table}
        WHERE owner_id = ?
        ORDER BY name COLLATE NOCASE, id
        LIMIT ? OFFSET ?
      `).all(ownerId, pageSize, offset) as TaxonomyItem[];
      return { [resource.response]: items, page, pageSize, total };
    });

    app.post<{ Body: { name: string } }>(`/api/${resource.table}`, {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: taxonomyNameSchema },
        },
      },
    }, async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const name = normalizeTaxonomyName(request.body.name);
      if (!name) return reply.code(400).send({ error: 'ชื่อหมวดหมู่หรือแท็กไม่ถูกต้อง' });
      const duplicate = database.prepare(`
        SELECT 1 FROM ${resource.table} WHERE owner_id = ? AND name = ? COLLATE NOCASE
      `).get(ownerId, name);
      if (duplicate) return reply.code(409).send({ error: 'มีชื่อนี้อยู่แล้ว' });
      const id = randomUUID();
      const now = Date.now();
      database.prepare(`
        INSERT INTO ${resource.table} (id, owner_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, ownerId, name, now, now);
      const item = database.prepare(`
        SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
        FROM ${resource.table} WHERE id = ? AND owner_id = ?
      `).get(id, ownerId) as TaxonomyItem;
      return reply.code(201).send({ [resource.singular]: item });
    });

    app.patch<{ Params: { itemId: string }; Body: { name: string } }>(
      `/api/${resource.table}/:itemId`,
      {
        schema: {
          params: {
            type: 'object',
            required: ['itemId'],
            properties: { itemId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
          },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: { name: taxonomyNameSchema },
          },
        },
      },
      async (request, reply) => {
        const ownerId = request.sessionUserId;
        if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
        const name = normalizeTaxonomyName(request.body.name);
        if (!name) return reply.code(400).send({ error: 'ชื่อหมวดหมู่หรือแท็กไม่ถูกต้อง' });
        const existing = database.prepare(`
          SELECT id FROM ${resource.table} WHERE id = ? AND owner_id = ?
        `).get(request.params.itemId, ownerId);
        if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการ' });
        const duplicate = database.prepare(`
          SELECT 1 FROM ${resource.table}
          WHERE owner_id = ? AND name = ? COLLATE NOCASE AND id <> ?
        `).get(ownerId, name, request.params.itemId);
        if (duplicate) return reply.code(409).send({ error: 'มีชื่อนี้อยู่แล้ว' });
        database.prepare(`
          UPDATE ${resource.table} SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?
        `).run(name, Date.now(), request.params.itemId, ownerId);
        const item = database.prepare(`
          SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
          FROM ${resource.table} WHERE id = ? AND owner_id = ?
        `).get(request.params.itemId, ownerId) as TaxonomyItem;
        return { [resource.singular]: item };
      },
    );

    app.delete<{ Params: { itemId: string } }>(`/api/${resource.table}/:itemId`, {
      schema: {
        params: {
          type: 'object',
          required: ['itemId'],
          properties: { itemId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
        },
      },
    }, async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const result = database.prepare(`DELETE FROM ${resource.table} WHERE id = ? AND owner_id = ?`)
        .run(request.params.itemId, ownerId);
      if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการ' });
      return reply.code(204).send();
    });
  }

  app.get<{ Params: { noteId: string } }>('/api/notes/:noteId/taxonomy', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: { noteId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const note = database.prepare(`
      SELECT 1 FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.noteId, ownerId);
    if (!note) return reply.code(404).send({ error: 'ไม่พบโน้ต' });
    const categories = database.prepare(`
      SELECT c.id, c.name FROM categories c
      JOIN note_categories nc ON nc.category_id = c.id
      WHERE nc.note_id = ? AND nc.owner_id = ?
      ORDER BY c.name COLLATE NOCASE, c.id
    `).all(request.params.noteId, ownerId) as Array<{ id: string; name: string }>;
    const tags = database.prepare(`
      SELECT t.id, t.name FROM tags t
      JOIN note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = ? AND nt.owner_id = ?
      ORDER BY t.name COLLATE NOCASE, t.id
    `).all(request.params.noteId, ownerId) as Array<{ id: string; name: string }>;
    const people = database.prepare(`
      SELECT p.id, p.name, p.role_label AS roleLabel, p.avatar_file_id AS avatarFileId,
        p.avatar_preset AS avatarPreset
      FROM people p
      JOIN note_people np ON np.person_id = p.id
      WHERE np.note_id = ? AND np.owner_id = ?
      ORDER BY p.name COLLATE NOCASE, p.id
    `).all(request.params.noteId, ownerId);
    return { categories, tags, people };
  });

  app.put<{
    Params: { noteId: string };
    Body: { categoryIds: string[]; tagIds: string[]; personIds?: string[] };
  }>('/api/notes/:noteId/taxonomy', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId'],
        properties: { noteId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['categoryIds', 'tagIds'],
        properties: {
          categoryIds: {
            type: 'array',
            maxItems: 100,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
          tagIds: {
            type: 'array',
            maxItems: 100,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
          personIds: {
            type: 'array',
            maxItems: 100,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const note = database.prepare(`
      SELECT 1 FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.noteId, ownerId);
    if (!note) return reply.code(404).send({ error: 'ไม่พบโน้ต' });

    const updateTaxonomy = database.transaction(() => {
      const categoryCount = (database.prepare(`
        SELECT COUNT(*) AS count FROM categories WHERE owner_id = ? AND id IN (${request.body.categoryIds.map(() => '?').join(',') || 'NULL'})
      `).get(ownerId, ...request.body.categoryIds) as { count: number }).count;
      const tagCount = (database.prepare(`
        SELECT COUNT(*) AS count FROM tags WHERE owner_id = ? AND id IN (${request.body.tagIds.map(() => '?').join(',') || 'NULL'})
      `).get(ownerId, ...request.body.tagIds) as { count: number }).count;
      const personIds = request.body.personIds;
      let personCount = 0;
      if (personIds !== undefined) {
        personCount = (database.prepare(`
          SELECT COUNT(*) AS count FROM people WHERE owner_id = ? AND id IN (${personIds.map(() => '?').join(',') || 'NULL'})
        `).get(ownerId, ...personIds) as { count: number }).count;
      }
      if (categoryCount !== request.body.categoryIds.length || tagCount !== request.body.tagIds.length
        || (personIds !== undefined && personCount !== personIds.length)) {
        return false;
      }
      database.prepare('DELETE FROM note_categories WHERE note_id = ? AND owner_id = ?')
        .run(request.params.noteId, ownerId);
      database.prepare('DELETE FROM note_tags WHERE note_id = ? AND owner_id = ?')
        .run(request.params.noteId, ownerId);
      const insertCategory = database.prepare(`
        INSERT INTO note_categories (note_id, category_id, owner_id) VALUES (?, ?, ?)
      `);
      const insertTag = database.prepare(`
        INSERT INTO note_tags (note_id, tag_id, owner_id) VALUES (?, ?, ?)
      `);
      for (const categoryId of request.body.categoryIds) {
        insertCategory.run(request.params.noteId, categoryId, ownerId);
      }
      for (const tagId of request.body.tagIds) {
        insertTag.run(request.params.noteId, tagId, ownerId);
      }
      if (personIds !== undefined) {
        database.prepare('DELETE FROM note_people WHERE note_id = ? AND owner_id = ?')
          .run(request.params.noteId, ownerId);
        const insertPerson = database.prepare(`
          INSERT INTO note_people (note_id, person_id, owner_id) VALUES (?, ?, ?)
        `);
        for (const personId of personIds) {
          insertPerson.run(request.params.noteId, personId, ownerId);
        }
      }
      return true;
    });
    if (!updateTaxonomy()) return reply.code(400).send({ error: 'มีหมวดหมู่ แท็ก หรือบุคคลที่ไม่ถูกต้อง' });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { page: number; pageSize: number } }>('/api/files', {
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
    const total = (database.prepare('SELECT COUNT(*) AS total FROM files WHERE owner_id = ?')
      .get(ownerId) as { total: number }).total;
    const files = database.prepare(`
      ${fileSelect}
      WHERE owner_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as StoredFile[];
    return {
      files: files.map((file) => ({ ...file, downloadUrl: `/api/files/${file.id}` })),
      page,
      pageSize,
      total,
    };
  });

  app.post('/api/files', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!dataDirectory) return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่าพื้นที่จัดเก็บไฟล์' });

    const displayName = decodeFileNameHeader(request.headers['x-file-name']);
    if (!displayName) return reply.code(400).send({ error: 'ชื่อไฟล์ไม่ถูกต้อง' });

    const lengthHeader = request.headers['content-length'];
    const declaredSize = Number(lengthHeader);
    if (!lengthHeader || !Number.isInteger(declaredSize) || declaredSize <= 0) {
      return reply.code(411).send({ error: 'ต้องระบุขนาดไฟล์ที่ถูกต้อง' });
    }
    const limit = maxUploadBytes();
    if (declaredSize > limit) return reply.code(413).send({ error: 'ไฟล์มีขนาดใหญ่เกินกำหนด' });

    const stream = request.body as NodeJS.ReadableStream | undefined;
    if (!stream || typeof stream.pipe !== 'function') {
      return reply.code(400).send({ error: 'ต้องส่งเนื้อหาไฟล์เป็นไบต์สตรีม' });
    }
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      return reply.code(429).send({ error: 'มีการอัปโหลดไฟล์พร้อมกันมากเกินไป กรุณารอสักครู่' });
    }

    mkdirSync(dataDirectory, { recursive: true });
    try {
      assertFreeSpace(dataDirectory, declaredSize);
    } catch (error) {
      if (error instanceof FileStorageError) return reply.code(error.statusCode).send({ error: error.message });
      app.log.error({ err: error }, 'File free-space check failed');
      return reply.code(507).send({ error: 'พื้นที่ดิสก์ไม่เพียงพอสำหรับการอัปโหลด' });
    }

    const id = randomUUID();
    activeUploads += 1;
    try {
      const stored = await storeUpload({
        dataDirectory,
        objectKey: id,
        declaredSize,
        stream: stream as AsyncIterable<Buffer>,
        maxBytes: limit,
      });
      try {
        database.prepare(`
          INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, ownerId, displayName, stored.sizeBytes, stored.sha256, stored.mediaType, id, Date.now());
      } catch (error) {
        // The object is already published. Keep it and log an orphan rather than deleting bytes
        // whose metadata insert failed for an unknown reason.
        app.log.error({ err: error, objectKey: id }, 'File metadata insert failed; object retained as orphan');
        return reply.code(500).send({ error: 'ไม่สามารถบันทึกข้อมูลไฟล์ได้ในขณะนี้' });
      }
      const file = database.prepare(`${fileSelect} WHERE id = ? AND owner_id = ?`)
        .get(id, ownerId) as StoredFile;
      return reply.code(201).send({ file: { ...file, downloadUrl: `/api/files/${id}` } });
    } catch (error) {
      if (error instanceof FileStorageError) {
        if (error.statusCode >= 500) {
          app.log.error({ err: error, objectKey: id }, 'File upload storage failure');
        }
        return reply.code(error.statusCode).send({ error: error.message });
      }
      app.log.error({ err: error, objectKey: id }, 'File upload failed');
      return reply.code(500).send({ error: 'ไม่สามารถอัปโหลดไฟล์ได้ในขณะนี้' });
    } finally {
      activeUploads -= 1;
    }
  });

  const fileParams = {
    type: 'object',
    required: ['fileId'],
    properties: { fileId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } },
  } as const;

  async function sendStoredFile(
    request: FastifyRequest<{ Params: { fileId: string } }>,
    reply: FastifyReply,
    headOnly: boolean,
  ) {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!dataDirectory) return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่าพื้นที่จัดเก็บไฟล์' });

    const file = database.prepare(`${fileSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.fileId, ownerId) as StoredFile | undefined;
    if (!file) return reply.code(404).send({ error: 'ไม่พบไฟล์' });
    if (!objectExists(dataDirectory, file.id)) {
      app.log.error({ fileId: file.id }, 'File metadata exists but the stored object is missing');
      return reply.code(500).send({ error: 'ไม่สามารถเข้าถึงไฟล์ได้ในขณะนี้' });
    }

    const size = objectSize(dataDirectory, file.id);
    const inline = isInlineMediaType(file.mediaType);
    reply.header('content-type', file.mediaType);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-disposition', contentDisposition(file.displayName, inline));
    reply.header('accept-ranges', 'bytes');
    reply.header('cache-control', 'private, no-store');

    const range = parseRange(
      typeof request.headers.range === 'string' ? request.headers.range : undefined,
      size,
    );
    if (range === 'invalid' || range === 'unsatisfiable') {
      return reply.code(416)
        .header('content-range', `bytes */${size}`)
        .header('content-type', 'application/json; charset=utf-8')
        .send(headOnly ? undefined : { error: 'ช่วงไบต์ที่ขอไม่ถูกต้อง' });
    }
    if (range) {
      const length = range.end - range.start + 1;
      return reply.code(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
        .header('content-length', String(length))
        .send(headOnly ? undefined : readObject(dataDirectory, file.id, range));
    }

    return reply.header('content-length', String(size))
      .send(headOnly ? undefined : readObject(dataDirectory, file.id));
  }

  app.head<{ Params: { fileId: string } }>('/api/files/:fileId', {
    schema: { params: fileParams },
  }, async (request, reply) => sendStoredFile(request, reply, true));

  app.get<{ Params: { fileId: string } }>('/api/files/:fileId', {
    exposeHeadRoute: false,
    schema: { params: fileParams },
  }, async (request, reply) => sendStoredFile(request, reply, false));

  app.delete<{ Params: { fileId: string } }>('/api/files/:fileId', {
    schema: { params: fileParams },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!dataDirectory) return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่าพื้นที่จัดเก็บไฟล์' });
    const result = database.prepare('DELETE FROM files WHERE id = ? AND owner_id = ?')
      .run(request.params.fileId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบไฟล์' });
    if (!deleteObject(dataDirectory, request.params.fileId)) {
      app.log.warn({ fileId: request.params.fileId }, 'File row deleted but the stored object was already missing');
    }
    return reply.code(204).send();
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

  registerLifeOsRoutes(app, database);
  registerWorkRoutes(app, database);
  registerDashboardRoutes(app, database);
  registerHabitLogRoutes(app, database);
  registerEntityFileRoutes(app, database);

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
  const { database, preMigrationBackupPath } = await openDataDatabaseSafely(dataDirectory);
  if (preMigrationBackupPath) {
    console.info('A verified backup was created before applying pending database migrations.');
  }
  const server = createApp(database, hasWebBuild ? { webRoot, dataDirectory } : { dataDirectory });
  server.addHook('onClose', async () => {
    database.close();
  });
  try {
    await server.listen({ port: Number(process.env.PORT || 3001), host: '127.0.0.1' });
  } catch (error) {
    await server.close();
    throw error;
  }
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
}

export default createApp;
