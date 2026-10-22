import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, createReadStream, unlinkSync, statfsSync } from 'node:fs';
import os from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, hashPassword, hashSessionToken, resolveSession, verifyPassword } from './auth.js';
import { cleanOrphanItemLinks, cleanOrphanFileLinks, type SqliteDatabase } from './database.js';
import {
  getSystemSettings,
  updateSystemSettings,
  listUsers,
  createUser,
  resetUserPassword,
  deleteUser,
  updateUserRoleAndStatus,
  updateAccount,
  getDatabaseStats,
  optimizeDatabase,
  exportDatabaseJson,
  listDatabaseStudioTables,
  getDatabaseStudioRows,
  insertDatabaseStudioRow,
  updateDatabaseStudioRow,
  deleteDatabaseStudioRow,
} from './admin.js';
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
} from './totp.js';
import { registerLifestyleRoutes } from './lifestyle.js';
import { registerUniversalTrashRoutes } from './universal-trash.js';
import { registerCustomTypesRoutes } from './custom-types.js';
import { registerSupportTicketRoutes } from './support-tickets.js';
import { registerUniversalFavoritesRoutes, ALL_FAVORITE_TYPES, favoriteTargetExists as universalFavoriteTargetExists } from './favorites.js';
import { createBackup, listBackups } from './backup.js';
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
import { registerVaultRoutes } from './vault-library.js';
import { registerCustomCategoryRoutes } from './custom-categories.js';
import { openDataDatabaseSafely } from './safe-open.js';
import {
  recordLoginHistory,
  getLoginHistory,
  recordAuditLog,
  getAuditLogs,
  getUserActiveSessions,
  revokeAllUserSessions,
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
  validateAndUseInvite,
  checkItemAccess,
  shareItem,
  unshareItem,
  getItemShares,
  createNotification,
  getUserNotifications,
  markNotificationsAsRead,
  snoozeNotification,
  completeNotification,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  saveFilter,
  getSavedFilters,
  deleteSavedFilter,
  exportUserFullData,
  importUserFullData,
  applyBackupRetentionPolicy,
  verifyMagicBytes,
} from './security-ops.js';
import { startNotificationScheduler, stopNotificationScheduler } from './notification-scheduler.js';

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
type NoteVersion = {
  id: string;
  noteId: string;
  versionNumber: number;
  title: string;
  content: string;
  createdAt: number;
};

type Bookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
};
type TaxonomyItem = {
  id: string;
  name: string;
  color?: string;
  noteCount?: number;
  personCount?: number;
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
type FavoriteItemType = typeof ALL_FAVORITE_TYPES[number];

const fileSelect = `
  SELECT id, display_name AS displayName, size_bytes AS sizeBytes, sha256,
    media_type AS mediaType, created_at AS createdAt
  FROM files
`;
const favoriteTypes = new Set<string>(ALL_FAVORITE_TYPES);

const noteSelect = `
  SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt
  FROM notes
`;
const bookmarkSelect = `
  SELECT id, title, url, description, COALESCE(category, 'other') AS category, created_at AS createdAt, updated_at AS updatedAt
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

function getDiskSpace(directory: string | null): {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
} | null {
  try {
    const targetDir = directory || '.';
    const stats = statfsSync(targetDir);
    const bsize = Number(stats.bsize);
    const totalBytes = bsize * Number(stats.blocks);
    const freeBytes = bsize * Number(stats.bavail);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
    };
  } catch {
    return null;
  }
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
    return receivedOrigin.origin === expected.origin && (receivedHost.host === expected.host || host === expected.host);
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
    logger: options.logger ?? (process.env.NODE_ENV !== 'test' ? {
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        '*.password',
        '*.newPassword',
        '*.currentPassword',
        '*.otp',
        '*.secret',
        '*.keyValue',
        '*.pin',
        '*.gatePassword',
      ],
    } : false),
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

  const pendingTwoFactorLogins = new Map<string, { userId: string; expiresAt: number; userAgent: string }>();
  const pendingTwoFactorSetups = new Map<string, { secret: string; recoveryCodes: string[] }>();

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    const isHealth = request.method === 'GET' && path === '/api/health';
    const isAuthPublic = request.method === 'POST' && (
      path === '/api/auth/login' ||
      path === '/api/auth/2fa/verify' ||
      path === '/api/auth/forgot-password/request-otp' ||
      path === '/api/auth/forgot-password/reset' ||
      path === '/api/auth/register-invite' ||
      path === '/api/auth/register-account'
    );
    const isWebAsset = request.method === 'GET' &&
      (options.webRoot ? !path.startsWith('/api/') : (path === '/' || path === '/favicon.svg' || path === '/icons.svg' || path === '/sw.js' || path === '/manifest.json' || path.startsWith('/assets/')));
    const isPublicSettings = request.method === 'GET' && path === '/api/settings/public';
    const isPublic = isHealth || isAuthPublic || isPublicSettings || isWebAsset;

    const effectiveHost = (request.headers['x-forwarded-host'] as string | undefined) || request.headers.host;
    if (request.method !== 'GET' && request.method !== 'HEAD' && !csrfIsValid(
      request.headers.origin,
      effectiveHost,
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
      const isHttps = new URL(expectedOrigin).protocol === 'https:' || request.headers['x-forwarded-proto'] === 'https';
      const secure = isHttps ? '; Secure' : '';
      reply.header('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    }
  });

  app.get('/api/health', async (_request, reply) => {
    try {
      database.prepare('SELECT 1').get();
      const disk = getDiskSpace(dataDirectory);
      return {
        status: 'ok',
        db: 'ready',
        uptimeSeconds: process.uptime(),
        disk: disk ?? undefined,
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

    const user = database.prepare(`
      SELECT id, username, password_hash,
             COALESCE(role, 'user') AS role,
             COALESCE(display_name, username) AS displayName,
             COALESCE(is_active, 1) AS isActive,
             COALESCE(two_factor_enabled, 0) AS twoFactorEnabled
      FROM users WHERE username = ?
    `).get(normalizedUsername) as
      { id: string; username: string; password_hash: string; role: string; displayName: string; isActive: number; twoFactorEnabled: number } | undefined;
    const passwordHash = user?.password_hash ?? await dummyPasswordHash;
    const passwordMatches = await verifyPassword(request.body.password, passwordHash);

    const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';

    if (!user || !passwordMatches) {
      throttle.failure(keys, Date.now());
      recordLoginHistory(database, {
        userId: user?.id,
        username: normalizedUsername,
        ipAddress: request.ip,
        userAgent,
        status: 'failed',
        failureReason: user ? 'invalid_password' : 'user_not_found',
      });
      return reply.code(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (user.isActive === 0) {
      recordLoginHistory(database, {
        userId: user.id,
        username: normalizedUsername,
        ipAddress: request.ip,
        userAgent,
        status: 'failed',
        failureReason: 'account_inactive',
      });
      return reply.code(403).send({ error: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' });
    }

    throttle.clear(keys);

    if (user.twoFactorEnabled === 1) {
      const twoFactorToken = randomUUID();
      pendingTwoFactorLogins.set(twoFactorToken, {
        userId: user.id,
        expiresAt: Date.now() + 5 * 60 * 1000,
        userAgent,
      });
      return reply.send({
        require2FA: true,
        twoFactorToken,
        message: 'กรุณากรอกรหัส 2FA (6 หลัก) หรือ Recovery Code',
      });
    }

    recordLoginHistory(database, {
      userId: user.id,
      username: user.username,
      ipAddress: request.ip,
      userAgent,
      status: 'success',
    });

    const session = createSession(database, user.id, Date.now(), userAgent);
    const isHttps = new URL(expectedOrigin).protocol === 'https:' || request.headers['x-forwarded-proto'] === 'https';
    const secure = isHttps ? '; Secure' : '';
    reply.header('set-cookie', `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  });

  app.post<{ Body: { twoFactorToken: string; code: string } }>('/api/auth/2fa/verify', async (request, reply) => {
    const { twoFactorToken, code } = request.body || {};
    if (!twoFactorToken || !code) {
      return reply.code(400).send({ error: 'ข้อมูลไม่ครบถ้วน' });
    }
    const pending = pendingTwoFactorLogins.get(twoFactorToken);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingTwoFactorLogins.delete(twoFactorToken);
      return reply.code(401).send({ error: 'รหัสยืนยัน 2FA หมดอายุหรือคำขอไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }

    const user = database.prepare(`
      SELECT id, username, COALESCE(role, 'user') AS role, COALESCE(display_name, username) AS displayName,
             two_factor_secret, two_factor_recovery_codes
      FROM users WHERE id = ?
    `).get(pending.userId) as {
      id: string;
      username: string;
      role: string;
      displayName: string;
      two_factor_secret: string | null;
      two_factor_recovery_codes: string | null;
    } | undefined;

    if (!user) {
      return reply.code(401).send({ error: 'ไม่พบผู้ใช้' });
    }

    const cleanCode = code.trim().toUpperCase();
    let isValid = false;

    if (user.two_factor_secret && /^\d{6}$/.test(cleanCode)) {
      isValid = verifyTotpCode(cleanCode, user.two_factor_secret);
    }

    if (!isValid && user.two_factor_recovery_codes) {
      try {
        const recoveryCodes: string[] = JSON.parse(user.two_factor_recovery_codes);
        const matchIdx = recoveryCodes.findIndex((rc) => rc.toUpperCase() === cleanCode);
        if (matchIdx !== -1) {
          isValid = true;
          recoveryCodes.splice(matchIdx, 1);
          database.prepare('UPDATE users SET two_factor_recovery_codes = ? WHERE id = ?')
            .run(JSON.stringify(recoveryCodes), user.id);
        }
      } catch {}
    }

    if (!isValid) {
      recordLoginHistory(database, {
        userId: user.id,
        username: user.username,
        ipAddress: request.ip,
        userAgent: pending.userAgent,
        status: 'failed',
        failureReason: 'invalid_2fa_code',
      });
      return reply.code(401).send({ error: 'รหัส 2FA หรือ Recovery Code ไม่ถูกต้อง' });
    }

    recordLoginHistory(database, {
      userId: user.id,
      username: user.username,
      ipAddress: request.ip,
      userAgent: pending.userAgent,
      status: 'success',
    });

    pendingTwoFactorLogins.delete(twoFactorToken);
    const session = createSession(database, user.id, Date.now(), pending.userAgent);
    const isHttps = new URL(expectedOrigin).protocol === 'https:' || request.headers['x-forwarded-proto'] === 'https';
    const secure = isHttps ? '; Secure' : '';
    reply.header('set-cookie', `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  });

  app.post<{ Body: { username?: string; email?: string; phone?: string; identifier?: string; recoveryType?: 'email' | 'phone' } }>('/api/auth/forgot-password/request-otp', async (request, reply) => {
    const username = String(request.body?.username || (request.body?.identifier && !request.body.identifier.includes('@') ? request.body.identifier : '')).trim();
    const recoveryType = request.body?.recoveryType || (request.body?.phone && !request.body?.email ? 'phone' : 'email');
    const rawEmail = String(request.body?.email || (request.body?.identifier && request.body.identifier.includes('@') ? request.body.identifier : '')).trim();
    const rawPhone = String(request.body?.phone || '').trim().replace(/[-\s]/g, '');

    if (!username) {
      return reply.code(400).send({ error: 'กรุณากรอกชื่อผู้ใช้ (Username)' });
    }

    if (recoveryType === 'phone') {
      if (!rawPhone) {
        return reply.code(400).send({ error: 'กรุณากรอกทั้งชื่อผู้ใช้ (Username) และเบอร์โทรศัพท์ (Phone) ให้ตรงกันกับข้อมูลในบัญชี' });
      }
    } else {
      if (!rawEmail) {
        return reply.code(400).send({ error: 'กรุณากรอกทั้งชื่อผู้ใช้ (Username) และอีเมล (Email) ให้ตรงกันกับข้อมูลในบัญชี' });
      }
    }

    const genericSuccess = {
      ok: true,
      message: recoveryType === 'phone'
        ? 'หากชื่อผู้ใช้และเบอร์โทรศัพท์ถูกต้องและตรงกับข้อมูลในระบบ ระบบได้ดำเนินการส่งรหัส OTP เรียบร้อยแล้ว (หมดอายุใน 5 นาที)'
        : 'หากชื่อผู้ใช้และอีเมลถูกต้องและตรงกับข้อมูลในระบบ ระบบได้ดำเนินการส่งรหัส OTP เรียบร้อยแล้ว (หมดอายุใน 5 นาที)',
      expiresInSeconds: 300,
    };

    // Require matching username AND (email OR phone) tied to the exact same account
    let user: { id: string; username: string; email?: string | null; phone?: string | null } | undefined;
    if (recoveryType === 'phone') {
      user = database.prepare(`
        SELECT id, username, email, phone FROM users
        WHERE username = ? COLLATE NOCASE AND phone IS NOT NULL AND REPLACE(REPLACE(phone, '-', ''), ' ', '') = ?
      `).get(username, rawPhone) as { id: string; username: string; email?: string; phone?: string } | undefined;
    } else {
      user = database.prepare(`
        SELECT id, username, email, phone FROM users
        WHERE username = ? COLLATE NOCASE AND email IS NOT NULL AND LOWER(email) = LOWER(?)
      `).get(username, rawEmail) as { id: string; username: string; email?: string; phone?: string } | undefined;
    }

    // OWASP ASVS: If mismatch or user not found, NEVER generate or send OTP!
    // Return generic response without revealing account existence
    if (!user) {
      return genericSuccess;
    }

    // Rate Limit: Max 3 requests in the last 15 minutes
    const recentRequests = database.prepare(`
      SELECT COUNT(*) AS count FROM password_reset_otps
      WHERE user_id = ? AND created_at > ?
    `).get(user.id, Date.now() - 15 * 60 * 1000) as { count: number };

    if (recentRequests.count >= 3) {
      return reply.code(429).send({ error: 'คุณขอรหัส OTP บ่อยเกินไป โปรดลองใหม่ในอีก 15 นาที' });
    }

    // Invalidate previous unexpired OTPs
    database.prepare('UPDATE password_reset_otps SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

    // Cryptographically secure 6-digit OTP
    const otp = randomInt(100000, 1000000).toString();
    const otpHashed = createHash('sha256').update(otp).digest('hex');
    const otpId = randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    database.prepare(`
      INSERT INTO password_reset_otps (id, user_id, otp_hash, expires_at, attempts, used, created_at)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `).run(otpId, user.id, otpHashed, expiresAt, Date.now());

    // Audit Log (never log the OTP itself)
    recordAuditLog(database, {
      userId: user.id,
      username: user.username,
      action: 'password_reset_otp_requested',
      resourceType: 'auth',
      resourceId: user.id,
      ipAddress: request.ip,
    });

    const isDev = process.env.NODE_ENV !== 'production';
    return {
      ...genericSuccess,
      username: user.username,
      ...(isDev ? { debugOtp: otp } : {}),
    };
  });

  app.post<{ Body: { username: string; email?: string; phone?: string; otp: string; newPassword: string } }>('/api/auth/forgot-password/reset', async (request, reply) => {
    const { username, email, phone, otp, newPassword } = request.body || {};
    if (!username || !otp || !newPassword) {
      return reply.code(400).send({ error: 'ข้อมูลไม่ครบถ้วน กรุณากรอกชื่อผู้ใช้, รหัส OTP และรหัสผ่านใหม่' });
    }
    if (newPassword.length < 12) {
      return reply.code(400).send({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email ? email.trim() : null;
    const cleanPhone = phone ? phone.trim().replace(/[-\s]/g, '') : null;

    let user: { id: string; username: string; email: string | null; phone: string | null } | undefined;
    if (cleanPhone) {
      user = database.prepare(`
        SELECT id, username, email, phone FROM users
        WHERE username = ? COLLATE NOCASE AND phone IS NOT NULL AND REPLACE(REPLACE(phone, '-', ''), ' ', '') = ?
      `).get(cleanUsername, cleanPhone) as { id: string; username: string; email: string | null; phone: string | null } | undefined;
    } else if (cleanEmail) {
      user = database.prepare(`
        SELECT id, username, email, phone FROM users
        WHERE username = ? COLLATE NOCASE AND email IS NOT NULL AND LOWER(email) = LOWER(?)
      `).get(cleanUsername, cleanEmail) as { id: string; username: string; email: string | null; phone: string | null } | undefined;
    } else {
      user = database.prepare(`
        SELECT id, username, email, phone FROM users
        WHERE username = ? COLLATE NOCASE
      `).get(cleanUsername) as { id: string; username: string; email: string | null; phone: string | null } | undefined;
    }

    if (!user) {
      return reply.code(400).send({ error: 'ข้อมูลชื่อผู้ใช้หรือช่องทางกู้คืนไม่ถูกต้อง' });
    }

    // Active OTP lookup
    const activeOtp = database.prepare(`
      SELECT id, otp_hash, expires_at, attempts, used
      FROM password_reset_otps
      WHERE user_id = ? AND used = 0
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id) as { id: string; otp_hash: string; expires_at: number; attempts: number; used: number } | undefined;

    if (!activeOtp || activeOtp.expires_at < Date.now()) {
      return reply.code(400).send({ error: 'รหัส OTP หมดอายุหรือไม่มีคำขอกู้คืนรหัสผ่าน กรุณาขอรหัส OTP ใหม่' });
    }

    if (activeOtp.attempts >= 5) {
      database.prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?').run(activeOtp.id);
      return reply.code(400).send({ error: 'คุณกรอกรหัสผิดเกินจำนวนครั้งที่กำหนด (Lockout) กรุณาขอรหัส OTP ใหม่' });
    }

    const cleanOtp = otp.trim();
    const inputHash = createHash('sha256').update(cleanOtp).digest('hex');
    const isMatch = timingSafeEqual(Buffer.from(inputHash), Buffer.from(activeOtp.otp_hash));

    if (!isMatch) {
      database.prepare('UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ?').run(activeOtp.id);
      recordAuditLog(database, {
        userId: user.id,
        username: user.username,
        action: 'password_reset_failed',
        resourceType: 'auth',
        resourceId: user.id,
        ipAddress: request.ip,
      });
      const remaining = 5 - (activeOtp.attempts + 1);
      return reply.code(400).send({ error: `รหัส OTP ไม่ถูกต้อง (เหลือโอกาสกรอกอีก ${remaining} ครั้ง)` });
    }

    // Single-use: Mark OTP as used
    database.prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?').run(activeOtp.id);

    const newHash = await hashPassword(newPassword);
    database.prepare(`
      UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL WHERE id = ?
    `).run(newHash, user.id);

    // OWASP ASVS: Revoke ALL active sessions immediately and force re-login!
    const { revokedCount } = revokeAllUserSessions(database, user.id);

    recordAuditLog(database, {
      userId: user.id,
      username: user.username,
      action: 'password_reset_success',
      resourceType: 'auth',
      resourceId: user.id,
      details: { revokedSessions: revokedCount },
      ipAddress: request.ip,
    });

    return {
      ok: true,
      message: 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว ระบบได้ยกเลิกเซสชันเดิมทั้งหมดเพื่อความปลอดภัย กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
    };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const userId = request.sessionUserId;
    const user = database.prepare(`
      SELECT id, username,
             COALESCE(role, 'user') AS role,
             COALESCE(display_name, username) AS displayName
      FROM users WHERE id = ?
    `).get(userId) as
      { id: string; username: string; role: string; displayName: string } | undefined;
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

  // Profile & 2FA Management Routes
  app.get('/api/user/profile', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const user = database.prepare(`
      SELECT id, username,
             COALESCE(role, 'user') AS role,
             COALESCE(display_name, username) AS displayName,
             email, phone, bio, daily_status AS dailyStatus,
             avatar_data_url AS avatarDataUrl,
             COALESCE(two_factor_enabled, 0) AS twoFactorEnabled,
             created_at AS createdAt
      FROM users WHERE id = ?
    `).get(userId) as Record<string, unknown> | undefined;
    if (!user) return reply.code(404).send({ error: 'ไม่พบผู้ใช้' });
    return { profile: user };
  });

  app.put<{
    Body: {
      displayName?: string;
      email?: string;
      phone?: string;
      bio?: string;
      dailyStatus?: string;
      avatarDataUrl?: string | null;
    };
  }>('/api/user/profile', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const body = request.body || {};

    const displayName = body.displayName !== undefined ? String(body.displayName).trim().slice(0, 80) : undefined;
    const email = body.email !== undefined ? (String(body.email).trim().slice(0, 120) || null) : undefined;
    const phone = body.phone !== undefined ? (String(body.phone).trim().slice(0, 40) || null) : undefined;
    const bio = body.bio !== undefined ? String(body.bio).trim().slice(0, 1000) : undefined;
    const dailyStatus = body.dailyStatus !== undefined ? String(body.dailyStatus).trim().slice(0, 120) : undefined;
    const avatarDataUrl = body.avatarDataUrl !== undefined ? (body.avatarDataUrl ? String(body.avatarDataUrl).trim() : null) : undefined;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (displayName !== undefined) { setClauses.push('display_name = ?'); values.push(displayName); }
    if (email !== undefined) { setClauses.push('email = ?'); values.push(email); }
    if (phone !== undefined) { setClauses.push('phone = ?'); values.push(phone); }
    if (bio !== undefined) { setClauses.push('bio = ?'); values.push(bio); }
    if (dailyStatus !== undefined) { setClauses.push('daily_status = ?'); values.push(dailyStatus); }
    if (avatarDataUrl !== undefined) { setClauses.push('avatar_data_url = ?'); values.push(avatarDataUrl); }

    if (setClauses.length > 0) {
      values.push(userId);
      database.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = database.prepare(`
      SELECT id, username,
             COALESCE(role, 'user') AS role,
             COALESCE(display_name, username) AS displayName,
             email, phone, bio, daily_status AS dailyStatus,
             avatar_data_url AS avatarDataUrl,
             COALESCE(two_factor_enabled, 0) AS twoFactorEnabled,
             created_at AS createdAt
      FROM users WHERE id = ?
    `).get(userId);
    return { profile: updated };
  });

  app.post<{ Body: { currentPassword: string; newPassword: string } }>('/api/user/change-password', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { currentPassword, newPassword } = request.body || {};
    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' });
    }
    if (newPassword.length < 12) {
      return reply.code(400).send({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร' });
    }
    const user = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    if (!user) return reply.code(404).send({ error: 'ไม่พบผู้ใช้' });

    const matches = await verifyPassword(currentPassword, user.password_hash);
    if (!matches) {
      return reply.code(400).send({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }
    const newHash = await hashPassword(newPassword);
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    return { ok: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' };
  });

  app.post('/api/user/2fa/setup', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(6);
    pendingTwoFactorSetups.set(userId, { secret, recoveryCodes });
    return { secret, recoveryCodes };
  });

  app.post<{ Body: { code: string } }>('/api/user/2fa/enable', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const setup = pendingTwoFactorSetups.get(userId);
    if (!setup) {
      return reply.code(400).send({ error: 'กรุณากดเริ่มต้นตั้งค่า 2FA ก่อน' });
    }
    const code = String(request.body?.code || '').trim();
    if (!verifyTotpCode(code, setup.secret)) {
      return reply.code(400).send({ error: 'รหัส 6 หลักไม่ถูกต้อง ไม่สามารถเปิดใช้งาน 2FA ได้' });
    }
    database.prepare(`
      UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_recovery_codes = ? WHERE id = ?
    `).run(setup.secret, JSON.stringify(setup.recoveryCodes), userId);
    pendingTwoFactorSetups.delete(userId);
    return { ok: true, message: 'เปิดใช้งาน 2FA เรียบร้อยแล้ว', recoveryCodes: setup.recoveryCodes };
  });

  app.post<{ Body: { password: string } }>('/api/user/2fa/disable', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const password = String(request.body?.password || '');
    const user = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'รหัสผ่านไม่ถูกต้อง ไม่สามารถปิด 2FA ได้' });
    }
    database.prepare(`
      UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_recovery_codes = NULL WHERE id = ?
    `).run(userId);
    return { ok: true, message: 'ปิดการใช้งาน 2FA เรียบร้อยแล้ว' };
  });

  const elevatedAdminSessions = new Map<string, number>();

  function getSessionToken(request: FastifyRequest): string | null {
    return readCookie(request.headers.cookie, SESSION_COOKIE);
  }

  function getUserAdminInfo(userId: string | null): { isAdmin: boolean; isActive: boolean; role: string } {
    if (!userId) return { isAdmin: false, isActive: false, role: 'user' };
    const row = database.prepare('SELECT role, is_active FROM users WHERE id = ?').get(userId) as
      | { role: string; is_active: number }
      | undefined;
    if (!row) return { isAdmin: false, isActive: false, role: 'user' };
    const isAdmin = row.role === 'admin' && row.is_active === 1;
    return { isAdmin, isActive: row.is_active === 1, role: row.role };
  }

  function isSessionElevated(token: string | null): boolean {
    if (!token) return false;
    const expiresAt = elevatedAdminSessions.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      elevatedAdminSessions.delete(token);
      return false;
    }
    return true;
  }

  function requireAdminAuth(request: FastifyRequest, reply: FastifyReply): boolean {
    const userId = request.sessionUserId;
    if (!userId) {
      reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      return false;
    }
    const { isAdmin } = getUserAdminInfo(userId);
    if (!isAdmin) {
      reply.code(403).send({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin)' });
      return false;
    }
    const token = getSessionToken(request);
    if (!isSessionElevated(token)) {
      reply.code(403).send({ error: 'กรุณาปลดล็อกระบบหลังบ้านด้วยรหัสผ่านแอดมินก่อน', locked: true });
      return false;
    }
    return true;
  }

  app.put<{
    Body: {
      username?: string;
      currentPassword?: string;
      newPassword?: string;
    };
  }>('/api/auth/account', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 80 },
          currentPassword: { type: 'string', minLength: 1, maxLength: 1024 },
          newPassword: { type: 'string', minLength: 12, maxLength: 1024 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { username, currentPassword, newPassword } = request.body;
    if (!username && !newPassword) {
      return reply.code(400).send({ error: 'ต้องระบุชื่อผู้ใช้ใหม่หรือรหัสผ่านใหม่' });
    }

    let newPasswordHash: string | undefined;
    if (newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: 'กรุณาระบุรหัสผ่านปัจจุบันเพื่อเปลี่ยนรหัสผ่าน' });
      }
      const user = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
        { password_hash: string } | undefined;
      if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
        return reply.code(400).send({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
      newPasswordHash = await hashPassword(newPassword);
    }

    try {
      const updated = updateAccount(database, userId, {
        username,
        passwordHash: newPasswordHash,
      });
      return reply.send({ user: updated });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'ไม่สามารถอัปเดตข้อมูลบัญชีได้' });
    }
  });

  app.get('/api/settings/public', async () => {
    const settings = getSystemSettings(database);
    return {
      app_title: settings.app_title,
      app_subtitle: settings.app_subtitle,
      app_logo: settings.app_logo,
      default_theme: settings.default_theme,
      modules_config: settings.modules_config,
      registration_mode: settings.registration_mode || 'open',
    };
  });

  // Admin Security Gate Routes
  app.get('/api/admin/status', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { isAdmin } = getUserAdminInfo(userId);
    const token = getSessionToken(request);
    const isUnlocked = isAdmin && isSessionElevated(token);
    const unlockedUntil = isUnlocked && token ? elevatedAdminSessions.get(token) ?? null : null;
    const pinRow = database.prepare("SELECT value FROM system_settings WHERE key = 'admin_gate_pin'").get() as { value: string } | undefined;
    const isDefaultPin = !pinRow || pinRow.value === '123456';
    return { isAdmin, isUnlocked, unlockedUntil, isDefaultPin };
  });

  app.post<{ Body: { password?: string } }>('/api/admin/unlock', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { isAdmin } = getUserAdminInfo(userId);
    if (!isAdmin) return reply.code(403).send({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin)' });

    const password = request.body?.password || '';
    if (!password) return reply.code(400).send({ error: 'กรุณาระบุรหัสผ่านแอดมินหรือ PIN' });

    const user = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
      | { password_hash: string }
      | undefined;
    if (!user) return reply.code(401).send({ error: 'ไม่พบข้อมูลผู้ใช้' });

    const pinRow = database.prepare("SELECT value FROM system_settings WHERE key = 'admin_gate_pin'").get() as { value: string } | undefined;
    const customPin = pinRow?.value;
    const envPin = process.env.ADMIN_GATE_PIN;

    let valid = false;
    // Hardening: Verify against user's scrypt password hash or environment variable or non-default custom PIN
    if (user && await verifyPassword(password, user.password_hash)) {
      valid = true;
    } else if (envPin && password === envPin) {
      valid = true;
    } else if (customPin && customPin !== '123456' && password === customPin) {
      valid = true;
    }
    if (!valid) return reply.code(401).send({ error: 'รหัสผ่านหรือ PIN ไม่ถูกต้อง ไม่สามารถปลดล็อกได้' });

    const token = getSessionToken(request);
    if (!token) return reply.code(401).send({ error: 'ไม่พบเซสชัน' });

    recordAuditLog(database, {
      userId,
      action: 'admin_gate_unlock',
      resourceType: 'admin_gate',
      ipAddress: request.ip,
    });
    const unlockedUntil = Date.now() + 30 * 60 * 1000;
    elevatedAdminSessions.set(token, unlockedUntil);
    return { ok: true, isUnlocked: true, unlockedUntil };
  });

  app.post<{ Body: { pin?: string } }>('/api/admin/pin', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const pin = String(request.body?.pin || '').trim();
    if (pin.length < 4) return reply.code(400).send({ error: 'PIN ต้องมีอย่างน้อย 4 ตัวอักษร' });
    database.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_gate_pin', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(pin, Date.now());
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'admin_pin_change',
      resourceType: 'admin_gate',
      ipAddress: request.ip,
    });
    return { ok: true, message: 'บันทึก PIN ปลดล็อกระบบหลังบ้านเรียบร้อยแล้ว' };
  });

  app.post('/api/admin/lock', async (request) => {
    const token = getSessionToken(request);
    if (token) elevatedAdminSessions.delete(token);
    return { ok: true, isUnlocked: false };
  });

  app.get('/api/admin/users', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const users = listUsers(database);
    return { users };
  });

  app.post<{
    Body: {
      username: string;
      password: string;
      displayName?: string;
      role?: 'admin' | 'user';
      email?: string;
      phone?: string;
    };
  }>('/api/admin/users', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 80 },
          password: { type: 'string', minLength: 12, maxLength: 1024 },
          displayName: { type: 'string', maxLength: 80 },
          role: { type: 'string', enum: ['admin', 'user', 'member', 'editor', 'viewer'] },
          email: { type: 'string', maxLength: 120 },
          phone: { type: 'string', maxLength: 40 },
        },
      },
    },
  }, async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const passwordHash = await hashPassword(request.body.password);
      const user = createUser(
        database,
        request.body.username,
        passwordHash,
        request.body.displayName,
        request.body.role || 'user',
        request.body.email,
        request.body.phone,
      );
      return reply.code(201).send({ user });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'ไม่สามารถสร้างผู้ใช้ได้' });
    }
  });

  app.patch<{
    Params: { userId: string };
    Body: {
      displayName?: string;
      role?: 'admin' | 'user';
      isActive?: boolean;
    };
  }>('/api/admin/users/:userId', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', maxLength: 80 },
          role: { type: 'string', enum: ['admin', 'user', 'member', 'editor', 'viewer'] },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      updateUserRoleAndStatus(database, request.sessionUserId!, request.params.userId, request.body);
      recordAuditLog(database, {
        userId: request.sessionUserId!,
        action: 'user_update_role_status',
        resourceType: 'user',
        resourceId: request.params.userId,
        ipAddress: request.ip,
        details: request.body,
      });
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้' });
    }
  });

  app.post<{ Params: { userId: string }; Body: { password: string } }>('/api/admin/users/:userId/reset-password', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 12, maxLength: 1024 },
        },
      },
    },
  }, async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const passwordHash = await hashPassword(request.body.password);
      resetUserPassword(database, request.params.userId, passwordHash);
      recordAuditLog(database, {
        userId: request.sessionUserId!,
        action: 'user_reset_password',
        resourceType: 'user',
        resourceId: request.params.userId,
        ipAddress: request.ip,
      });
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'ไม่สามารถรีเซ็ตรหัสผ่านได้' });
    }
  });

  app.post<{ Params: { userId: string } }>('/api/admin/users/:userId/revoke-sessions', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const { revokedCount } = revokeAllUserSessions(database, request.params.userId);
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'admin_revoke_user_sessions',
      resourceType: 'user',
      resourceId: request.params.userId,
      ipAddress: request.ip,
      details: { revokedSessions: revokedCount },
    });
    return { ok: true, revokedSessions: revokedCount };
  });

  app.delete<{ Params: { userId: string } }>('/api/admin/users/:userId', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      deleteUser(database, request.sessionUserId!, request.params.userId);
      recordAuditLog(database, {
        userId: request.sessionUserId!,
        action: 'user_delete',
        resourceType: 'user',
        resourceId: request.params.userId,
        ipAddress: request.ip,
      });
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'ไม่สามารถลบผู้ใช้ได้' });
    }
  });

  app.get('/api/admin/database', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const stats = getDatabaseStats(database, dataDirectory);
    return stats;
  });

  app.post('/api/admin/database/optimize', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const result = optimizeDatabase(database);
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'database_optimize',
      resourceType: 'database',
      ipAddress: request.ip,
      details: result,
    });
    return { ok: true, message: 'ฐานข้อมูลได้รับการปรับแต่งและลดขนาดเรียบร้อยแล้ว', result };
  });

  app.post('/api/admin/backup', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const backupDir = join(dataDirectory || 'data', 'backups');
    mkdirSync(backupDir, { recursive: true });
    const settings = getSystemSettings(database);
    const result = await createBackup({
      database,
      backupDirectory: backupDir,
      dataDirectory: dataDirectory || undefined,
      keep: settings.backup_max_files || 10,
      prune: true,
    });
    applyBackupRetentionPolicy(database, backupDir);
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'backup_create',
      resourceType: 'backup',
      ipAddress: request.ip,
      details: { path: result.path },
    });
    return { ok: true, backup: result };
  });

  app.get('/api/admin/backup/list', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const backupDir = join(dataDirectory || 'data', 'backups');
    const backups = listBackups(backupDir);
    return { backups };
  });

  app.get('/api/admin/backup/export-json', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const data = exportDatabaseJson(database);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'backup_export_json',
      resourceType: 'backup',
      ipAddress: request.ip,
    });
    reply.header('Content-Disposition', `attachment; filename="pkh-export-${timestamp}.json"`);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(data, null, 2));
  });

  app.get('/api/admin/settings', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const settings = getSystemSettings(database);
    return { settings };
  });

  app.put<{
    Body: {
      app_title?: string;
      app_subtitle?: string;
      app_logo?: string;
      max_upload_size_mb?: number;
      session_idle_timeout_minutes?: number;
      default_theme?: 'system' | 'dark' | 'light';
      modules_config?: string;
      backup_retention_days?: number;
      backup_max_files?: number;
    };
  }>('/api/admin/settings', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          app_title: { type: 'string', maxLength: 120 },
          app_subtitle: { type: 'string', maxLength: 255 },
          app_logo: { type: 'string', maxLength: 20 },
          max_upload_size_mb: { type: 'integer', minimum: 1, maximum: 1000 },
          session_idle_timeout_minutes: { type: 'integer', minimum: 5, maximum: 525600 },
          default_theme: { type: 'string', enum: ['system', 'dark', 'light'] },
          modules_config: { type: 'string', maxLength: 20000 },
          backup_retention_days: { type: 'integer', minimum: 1, maximum: 365 },
          backup_max_files: { type: 'integer', minimum: 2, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const updated = updateSystemSettings(database, request.body);
    recordAuditLog(database, {
      userId: request.sessionUserId!,
      action: 'settings_update',
      resourceType: 'system_settings',
      ipAddress: request.ip,
    });
    return { settings: updated };
  });

  // Real-Time Database Studio Routes
  app.get('/api/admin/db/tables', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const tables = listDatabaseStudioTables(database);
    return { tables };
  });

  app.get<{
    Params: { table: string };
    Querystring: { page?: number; limit?: number; search?: string };
  }>('/api/admin/db/tables/:table/rows', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const data = getDatabaseStudioRows(database, request.params.table, request.query);
      return data;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{
    Params: { table: string };
    Body: { row: Record<string, unknown> };
  }>('/api/admin/db/tables/:table/rows', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const inserted = insertDatabaseStudioRow(database, request.params.table, request.body?.row || {});
      return reply.code(201).send({ row: inserted });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.put<{
    Params: { table: string; id: string };
    Body: { row: Record<string, unknown> };
  }>('/api/admin/db/tables/:table/rows/:id', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const updated = updateDatabaseStudioRow(database, request.params.table, request.params.id, request.body?.row || {});
      return { row: updated };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete<{
    Params: { table: string; id: string };
  }>('/api/admin/db/tables/:table/rows/:id', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    try {
      const res = deleteDatabaseStudioRow(database, request.params.table, request.params.id);
      return res;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // User Login History
  app.get('/api/user/login-history', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const history = getLoginHistory(database, userId, 20);
    return { history };
  });

  // User Device Sessions Management
  app.get('/api/user/sessions', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const currentToken = readCookie(request.headers.cookie, SESSION_COOKIE) || '';
    const sessions = getUserActiveSessions(database, userId, currentToken);
    return { sessions };
  });

  app.post('/api/user/sessions/revoke-all', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const currentToken = readCookie(request.headers.cookie, SESSION_COOKIE) || '';
    const revoked = revokeAllUserSessions(database, userId, currentToken);
    return { ok: true, revoked };
  });

  // Admin Audit Logs
  app.get<{
    Querystring: {
      userId?: string;
      action?: string;
      resourceType?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/admin/audit-logs', async (request, reply) => {
    if (!requireAdminAuth(request, reply)) return;
    const { userId, action, resourceType, limit, offset } = request.query;
    const logs = getAuditLogs(database, { userId, action, resourceType, limit, offset });
    return logs;
  });

  // Workspace Invites
  app.get('/api/invites', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { isAdmin } = getUserAdminInfo(userId);
    if (!isAdmin) return reply.code(403).send({ error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดูรหัสคำเชิญได้' });
    const invites = listWorkspaceInvites(database);
    return { invites };
  });

  app.post<{
    Body: {
      role?: 'admin' | 'user';
      maxUses?: number;
      expiresInHours?: number;
    };
  }>('/api/invites', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { isAdmin } = getUserAdminInfo(userId);
    if (!isAdmin) return reply.code(403).send({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบในการสร้างรหัสคำเชิญ' });
    const { role = 'user', maxUses = 1, expiresInHours = 168 } = request.body || {};
    const invite = createWorkspaceInvite(database, {
      createdBy: userId,
      role,
      maxUses,
      expiresInHours,
    });
    recordAuditLog(database, {
      userId,
      action: 'invite_create',
      resourceType: 'workspace_invite',
      resourceId: invite.code,
      ipAddress: request.ip,
      details: { role, maxUses },
    });
    return { ok: true, invite };
  });

  app.delete<{ Params: { code: string } }>('/api/invites/:code', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { isAdmin } = getUserAdminInfo(userId);
    if (!isAdmin) return reply.code(403).send({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ' });
    const revoked = revokeWorkspaceInvite(database, request.params.code);
    recordAuditLog(database, {
      userId,
      action: 'invite_revoke',
      resourceType: 'workspace_invite',
      resourceId: request.params.code,
      ipAddress: request.ip,
    });
    return { ok: revoked };
  });

  app.post<{
    Body: {
      inviteCode: string;
      username: string;
      password: string;
      displayName?: string;
    };
  }>('/api/auth/register-invite', async (request, reply) => {
    const { inviteCode, username, password, displayName } = request.body || {};
    if (!inviteCode || !username || !password) {
      return reply.code(400).send({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (รหัสคำเชิญ, ชื่อผู้ใช้, รหัสผ่าน)' });
    }
    const cleanUsername = username.trim().normalize('NFC');
    if (cleanUsername.length < 3 || cleanUsername.length > 80) {
      return reply.code(400).send({ error: 'ชื่อผู้ใช้ต้องมีความยาว 3-80 ตัวอักษร' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }
    const existing = database.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return reply.code(400).send({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    }
    const inviteRes = validateAndUseInvite(database, inviteCode);
    if (!inviteRes.valid || !inviteRes.role) {
      return reply.code(400).send({ error: inviteRes.error || 'รหัสคำเชิญไม่ถูกต้องหรือหมดอายุ' });
    }
    const passwordHash = await hashPassword(password);
    const newUserId = randomUUID();
    database.prepare(`
      INSERT INTO users (id, username, password_hash, role, display_name, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(newUserId, cleanUsername, passwordHash, inviteRes.role, displayName?.trim() || cleanUsername, Date.now());

    recordAuditLog(database, {
      userId: newUserId,
      action: 'user_register_invite',
      resourceType: 'user',
      resourceId: newUserId,
      ipAddress: request.ip,
      details: { inviteCode },
    });

    const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';
    const session = createSession(database, newUserId, Date.now(), userAgent);
    const isHttps = new URL(expectedOrigin).protocol === 'https:' || request.headers['x-forwarded-proto'] === 'https';
    const secure = isHttps ? '; Secure' : '';
    reply.header('set-cookie', `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    return reply.code(201).send({
      ok: true,
      user: {
        id: newUserId,
        username: cleanUsername,
        role: inviteRes.role,
        displayName: displayName?.trim() || cleanUsername,
      },
    });
  });

  app.post<{
    Body: {
      username: string;
      password: string;
      email?: string;
      displayName?: string;
      inviteCode?: string;
    };
  }>('/api/auth/register-account', async (request, reply) => {
    const { username, password, email, displayName, inviteCode } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    const cleanUsername = username.trim().normalize('NFC');
    if (cleanUsername.length < 3 || cleanUsername.length > 80) {
      return reply.code(400).send({ error: 'ชื่อผู้ใช้ต้องมีความยาว 3-80 ตัวอักษร' });
    }
    if (password.length < 12) {
      return reply.code(400).send({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษรตามมาตรฐานความปลอดภัย' });
    }

    const cleanEmail = email && email.trim() ? email.trim() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return reply.code(400).send({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }

    // Check system registration_mode setting
    const regModeRow = database.prepare("SELECT value FROM system_settings WHERE key = 'registration_mode'").get() as { value: string } | undefined;
    const registrationMode = regModeRow?.value || 'open';

    let assignedRole = 'member';

    if (registrationMode === 'invite_only' && !inviteCode) {
      return reply.code(403).send({ error: 'ระบบเปิดให้ลงทะเบียนเฉพาะผู้มีรหัสคำเชิญเท่านั้น กรุณาระบุรหัสคำเชิญ (Invite Code)' });
    }

    if (inviteCode) {
      const inviteRes = validateAndUseInvite(database, inviteCode);
      if (!inviteRes.valid || !inviteRes.role) {
        return reply.code(400).send({ error: inviteRes.error || 'รหัสคำเชิญไม่ถูกต้องหรือหมดอายุ' });
      }
      assignedRole = inviteRes.role;
    }

    // Check username collision
    const existingUser = database.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
    if (existingUser) {
      return reply.code(400).send({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น' });
    }

    // Check email collision
    if (cleanEmail) {
      const existingEmail = database.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail);
      if (existingEmail) {
        return reply.code(400).send({ error: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น' });
      }
    }

    const passwordHash = await hashPassword(password);
    const newUserId = randomUUID();
    database.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, display_name, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(newUserId, cleanUsername, cleanEmail, passwordHash, assignedRole, displayName?.trim() || cleanUsername, Date.now());

    recordAuditLog(database, {
      userId: newUserId,
      username: cleanUsername,
      action: 'user_register',
      resourceType: 'user',
      resourceId: newUserId,
      ipAddress: request.ip,
      details: { role: assignedRole, inviteCode: inviteCode || null },
    });

    const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';
    const session = createSession(database, newUserId, Date.now(), userAgent);
    const isHttps = new URL(expectedOrigin).protocol === 'https:' || request.headers['x-forwarded-proto'] === 'https';
    const secure = isHttps ? '; Secure' : '';
    reply.header('set-cookie', `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
    return reply.code(201).send({
      ok: true,
      user: {
        id: newUserId,
        username: cleanUsername,
        email: cleanEmail,
        role: assignedRole,
        displayName: displayName?.trim() || cleanUsername,
      },
    });
  });

  // Granular Item Sharing
  app.get<{ Params: { itemType: string; itemId: string } }>('/api/shares/:itemType/:itemId', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const shares = getItemShares(database, request.params.itemType, request.params.itemId);
    return { shares };
  });

  app.post<{
    Body: {
      itemType: string;
      itemId: string;
      targetUsername: string;
      permission?: 'viewer' | 'editor' | 'admin';
    };
  }>('/api/shares', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { itemType, itemId, targetUsername, permission = 'viewer' } = request.body || {};
    if (!itemType || !itemId || !targetUsername) {
      return reply.code(400).send({ error: 'ข้อมูลไม่ครบถ้วน' });
    }
    const targetUser = database.prepare('SELECT id, username FROM users WHERE username = ?').get(targetUsername.trim()) as
      | { id: string; username: string }
      | undefined;
    if (!targetUser) {
      return reply.code(404).send({ error: 'ไม่พบบัญชีผู้ใช้ปลายทาง' });
    }
    const share = shareItem(database, {
      itemType,
      itemId,
      ownerId: userId,
      sharedWithUserId: targetUser.id,
      permission,
    });
    createNotification(database, {
      userId: targetUser.id,
      title: 'มีการแชร์รายการใหม่กับคุณ',
      message: `ผู้ใช้ได้แชร์ ${itemType} กับคุณด้วยสิทธิ์ ${permission}`,
      type: 'shared_item',
      linkUrl: `/${itemType}s`,
    });
    return { ok: true, share };
  });

  app.delete<{ Params: { id: string } }>('/api/shares/:id', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const ok = unshareItem(database, request.params.id, userId);
    return { ok };
  });

  app.get('/api/shared-with-me', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const shares = database.prepare(`
      SELECT s.*, u.username AS ownerUsername, u.display_name AS ownerDisplayName
      FROM shared_items s
      JOIN users u ON s.owner_id = u.id
      WHERE s.shared_with_user_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);
    return { shares };
  });

  // Notifications
  app.get('/api/notifications', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const data = getUserNotifications(database, userId);
    return data;
  });

  app.post<{ Body: { id?: string } }>('/api/notifications/mark-read', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    markNotificationsAsRead(database, userId, request.body?.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { hours?: number } }>('/api/notifications/:id/snooze', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const hours = Number(request.body?.hours) || 24;
    snoozeNotification(database, userId, request.params.id, hours);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/notifications/:id/complete', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const res = completeNotification(database, userId, request.params.id);
    return { ok: true, ...res };
  });

  app.get('/api/notifications/preferences', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const preferences = getUserNotificationPreferences(database, userId);
    return { preferences };
  });

  app.post<{
    Body: Partial<{
      dndEnabled: boolean;
      dndStart: string;
      dndEnd: string;
      notifyBirthdays: boolean;
      notifyTasks: boolean;
      notifyReminders: boolean;
      notifyShopping: boolean;
    }>;
  }>('/api/notifications/preferences', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const preferences = updateUserNotificationPreferences(database, userId, request.body || {});
    recordAuditLog(database, {
      userId,
      action: 'notification_preferences_update',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: request.ip,
      details: request.body || {},
    });
    return { ok: true, preferences };
  });

  // Saved Filters
  app.get<{ Querystring: { filterType?: string } }>('/api/filters', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const filters = getSavedFilters(database, userId, request.query?.filterType);
    return { filters };
  });

  app.post<{
    Body: {
      name: string;
      filterType: string;
      criteriaJson: string;
      sortOrder?: string;
    };
  }>('/api/filters', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { name, filterType, criteriaJson, sortOrder } = request.body || {};
    if (!name || !filterType || !criteriaJson) {
      return reply.code(400).send({ error: 'ข้อมูลไม่ครบถ้วน' });
    }
    let parsedCriteria: Record<string, unknown> = {};
    try {
      parsedCriteria = JSON.parse(criteriaJson);
    } catch {
      parsedCriteria = { raw: criteriaJson };
    }
    const filter = saveFilter(database, userId, {
      name,
      filterType,
      queryCriteria: parsedCriteria,
    });
    return { ok: true, filter };
  });

  app.delete<{ Params: { id: string } }>('/api/filters/:id', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const ok = deleteSavedFilter(database, userId, request.params.id);
    return { ok };
  });

  // Full User Data Export & Deduplicated Import
  app.get('/api/user/export', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const exportData = exportUserFullData(database, userId);
    recordAuditLog(database, {
      userId,
      action: 'user_export',
      resourceType: 'user_data',
      ipAddress: request.ip,
    });
    const filename = `pkh-user-export-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('content-type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(exportData, null, 2));
  });

  app.post<{ Body: { data?: Record<string, unknown[]>; [key: string]: unknown } }>('/api/user/import', async (request, reply) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const payload = request.body;
    if (!payload || typeof payload !== 'object') {
      return reply.code(400).send({ error: 'ข้อมูล JSON ไม่ถูกต้อง' });
    }
    const result = importUserFullData(database, userId, payload);
    recordAuditLog(database, {
      userId,
      action: 'user_import',
      resourceType: 'user_data',
      ipAddress: request.ip,
      details: result,
    });
    return { ok: true, result };
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
    const total = (database.prepare('SELECT COUNT(*) AS total FROM bookmarks WHERE owner_id = ? AND deleted_at IS NULL')
      .get(ownerId) as { total: number }).total;
    const bookmarks = database.prepare(`
      ${bookmarkSelect}
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id
      LIMIT ? OFFSET ?
    `).all(ownerId, pageSize, offset) as Bookmark[];
    return { bookmarks, page, pageSize, total };
  });

  app.post<{ Body: { title: string; url: string; description?: string; category?: string } }>('/api/bookmarks', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          url: { type: 'string', minLength: 1, maxLength: 2048 },
          description: { type: 'string', maxLength: 5000 },
          category: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = request.body.title.trim();
    let rawUrl = (request.body.url || '').trim();
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
    const url = validateBookmarkUrl(rawUrl);
    if (!title) return reply.code(400).send({ error: 'ชื่อบุ๊กมาร์กต้องไม่ว่าง' });
    if (!url) return reply.code(400).send({ error: 'URL ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้องและไม่มีข้อมูลรับรอง' });

    const now = Date.now();
    const id = randomUUID();
    const category = (request.body.category || 'other').trim();
    database.prepare(`
      INSERT INTO bookmarks (id, owner_id, title, url, description, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, url, request.body.description ?? '', category, now, now);
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
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
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(request.params.bookmarkId, ownerId) as Bookmark | undefined;
    if (!bookmark) return reply.code(404).send({ error: 'ไม่พบบุ๊กมาร์ก' });
    return { bookmark };
  });

  app.patch<{
    Params: { bookmarkId: string };
    Body: { title?: string; url?: string; description?: string; category?: string };
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
          category: { type: 'string', maxLength: 100 },
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
    const category = request.body.category === undefined ? (current.category || 'other') : request.body.category.trim();
    if (!title) return reply.code(400).send({ error: 'ชื่อบุ๊กมาร์กต้องไม่ว่าง' });
    if (!url) return reply.code(400).send({ error: 'URL ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้องและไม่มีข้อมูลรับรอง' });
    database.prepare(`
      UPDATE bookmarks SET title = ?, url = ?, description = ?, category = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(title, url, description, category, Date.now(), request.params.bookmarkId, ownerId);
    const bookmark = database.prepare(`${bookmarkSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
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
    const now = Date.now();
    const result = database.prepare('UPDATE bookmarks SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, now, request.params.bookmarkId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบบุ๊กมาร์ก' });
    return reply.code(204).send();
  });

  const favoriteItemParams = {
    type: 'object',
    required: ['itemType', 'itemId'],
    properties: {
      itemType: { type: 'string', enum: [...ALL_FAVORITE_TYPES] },
      itemId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    },
  } as const;

  function favoriteTargetExists(ownerId: string, itemType: string, itemId: string): boolean {
    return universalFavoriteTargetExists(database, ownerId, itemType, itemId);
  }

  app.get<{ Querystring: { page?: number; pageSize?: number; collectionId?: string; itemType?: string } }>('/api/favorites', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          collectionId: { type: 'string' },
          itemType: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const page = request.query.page ?? 1;
    const pageSize = request.query.pageSize ?? 50;
    const collectionId = request.query.collectionId;
    const itemTypeFilter = request.query.itemType;

    const conditions = ['f.owner_id = ?'];
    const params: any[] = [ownerId];
    if (collectionId) {
      conditions.push('f.collection_id = ?');
      params.push(collectionId);
    }
    if (itemTypeFilter && itemTypeFilter !== 'all') {
      conditions.push('f.item_type = ?');
      params.push(itemTypeFilter);
    }

    const where = conditions.join(' AND ');
    const allFavRows = database.prepare(`
      SELECT f.item_type AS itemType, f.item_id AS itemId, f.collection_id AS collectionId, f.created_at AS createdAt,
             c.name AS collectionName, c.color AS collectionColor
      FROM favorites f
      LEFT JOIN favorite_collections c ON c.id = f.collection_id AND c.owner_id = f.owner_id
      WHERE ${where}
      ORDER BY f.created_at DESC, f.item_id
    `).all(...params) as Array<{
      itemType: FavoriteItemType;
      itemId: string;
      collectionId: string | null;
      createdAt: number;
      collectionName: string | null;
      collectionColor: string | null;
    }>;

    // Resolve titles and check if soft-deleted
    const validFavorites: Array<any> = [];
    for (const fav of allFavRows) {
      let title = '';
      let subtitle = '';
      let updatedAt = fav.createdAt;
      let exists = false;

      switch (fav.itemType) {
        case 'note': {
          const row = database.prepare('SELECT title, content, updated_at FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.content || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'bookmark': {
          const row = database.prepare('SELECT title, url, updated_at FROM bookmarks WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.url || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'task': {
          const row = database.prepare('SELECT title, detail, due_date, updated_at FROM tasks WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.detail || row.due_date || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'project': {
          const row = database.prepare('SELECT name, description, updated_at FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.name; subtitle = row.description || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'goal': {
          const row = database.prepare('SELECT title, description, updated_at FROM goals WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.description || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'person': {
          const row = database.prepare('SELECT name, relationship_group, role_label, updated_at FROM people WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.name; subtitle = row.role_label || row.relationship_group || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'file': {
          const row = database.prepare('SELECT display_name, media_type, created_at FROM files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.display_name; subtitle = row.media_type || ''; updatedAt = row.created_at || fav.createdAt; }
          break;
        }
        case 'vault': {
          const row = database.prepare('SELECT title, category, updated_at FROM vault_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.category || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'library': {
          const row = database.prepare('SELECT title, author, updated_at FROM library_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.author || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'watchlist': {
          const row = database.prepare('SELECT title, platform, status, updated_at FROM watchlist_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = row.platform || row.status || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'shopping': {
          const row = database.prepare('SELECT name, category, updated_at FROM shopping_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.name; subtitle = row.category || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'travel': {
          const row = database.prepare('SELECT name, location, updated_at FROM travel_places WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.name; subtitle = row.location || ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
        case 'custom_record': {
          const row = database.prepare('SELECT title, data, updated_at FROM custom_data_records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(fav.itemId, ownerId) as any;
          if (row) { exists = true; title = row.title; subtitle = ''; updatedAt = row.updated_at || fav.createdAt; }
          break;
        }
      }

      if (exists) {
        validFavorites.push({
          itemType: fav.itemType,
          itemId: fav.itemId,
          collectionId: fav.collectionId,
          collectionName: fav.collectionName,
          collectionColor: fav.collectionColor,
          createdAt: fav.createdAt,
          title,
          subtitle,
          updatedAt,
        });
      }
    }

    const total = validFavorites.length;
    const offset = (page - 1) * pageSize;
    const favorites = validFavorites.slice(offset, offset + pageSize);

    return { favorites, page, pageSize, total };
  });

  app.get<{ Params: { itemType: string; itemId: string } }>(
    '/api/favorites/:itemType/:itemId',
    { schema: { params: favoriteItemParams } },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      if (!favoriteTypes.has(request.params.itemType)) {
        return reply.code(400).send({ error: 'ประเภทของรายการไม่ถูกต้อง' });
      }
      const row = database.prepare(`
        SELECT collection_id AS collectionId FROM favorites WHERE owner_id = ? AND item_type = ? AND item_id = ?
      `).get(ownerId, request.params.itemType, request.params.itemId) as { collectionId: string | null } | undefined;
      return {
        favorited: row !== undefined,
        ...(row?.collectionId ? { collectionId: row.collectionId } : {}),
      };
    },
  );

  app.put<{ Params: { itemType: string; itemId: string }; Body?: { collectionId?: string | null } }>(
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
      const { collectionId = null } = (request.body as { collectionId?: string | null } | undefined) || {};
      database.prepare(`
        INSERT INTO favorites (owner_id, item_type, item_id, collection_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (owner_id, item_type, item_id) DO UPDATE SET collection_id = excluded.collection_id
      `).run(ownerId, request.params.itemType, request.params.itemId, collectionId, Date.now());
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { itemType: string; itemId: string } }>(
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
      let items: TaxonomyItem[];
      if (resource.table === 'tags') {
        items = database.prepare(`
          SELECT id, name, COALESCE(color, '#3b82f6') AS color, created_at AS createdAt, updated_at AS updatedAt,
            (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = tags.id AND nt.owner_id = tags.owner_id) AS noteCount,
            (SELECT COUNT(*) FROM person_tags pt WHERE pt.tag_id = tags.id AND pt.owner_id = tags.owner_id) AS personCount
          FROM tags
          WHERE owner_id = ?
          ORDER BY name COLLATE NOCASE, id
          LIMIT ? OFFSET ?
        `).all(ownerId, pageSize, offset) as TaxonomyItem[];
      } else {
        items = database.prepare(`
          SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
          FROM ${resource.table}
          WHERE owner_id = ?
          ORDER BY name COLLATE NOCASE, id
          LIMIT ? OFFSET ?
        `).all(ownerId, pageSize, offset) as TaxonomyItem[];
      }
      return { [resource.response]: items, page, pageSize, total };
    });

    app.post<{ Body: { name: string; color?: string } }>(`/api/${resource.table}`, {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: taxonomyNameSchema,
            color: { type: 'string', maxLength: 30 },
          },
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
      if (duplicate) {
        if (resource.table === 'tags') {
          const existing = database.prepare(`
            SELECT id, name, COALESCE(color, '#3b82f6') AS color, created_at AS createdAt, updated_at AS updatedAt
            FROM tags WHERE owner_id = ? AND name = ? COLLATE NOCASE
          `).get(ownerId, name) as TaxonomyItem;
          return reply.code(200).send({ tag: existing });
        }
        return reply.code(409).send({ error: 'มีชื่อนี้อยู่แล้ว' });
      }
      const id = randomUUID();
      const now = Date.now();
      if (resource.table === 'tags') {
        const color = (request.body.color || '#3b82f6').trim();
        database.prepare(`
          INSERT INTO tags (id, owner_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, ownerId, name, color, now, now);
        const item = database.prepare(`
          SELECT id, name, COALESCE(color, '#3b82f6') AS color, created_at AS createdAt, updated_at AS updatedAt
          FROM tags WHERE id = ? AND owner_id = ?
        `).get(id, ownerId) as TaxonomyItem;
        return reply.code(201).send({ tag: item });
      } else {
        database.prepare(`
          INSERT INTO categories (id, owner_id, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, ownerId, name, now, now);
        const item = database.prepare(`
          SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
          FROM categories WHERE id = ? AND owner_id = ?
        `).get(id, ownerId) as TaxonomyItem;
        return reply.code(201).send({ category: item });
      }
    });

    app.patch<{ Params: { itemId: string }; Body: { name?: string; color?: string } }>(
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
            properties: {
              name: taxonomyNameSchema,
              color: { type: 'string', maxLength: 30 },
            },
          },
        },
      },
      async (request, reply) => {
        const ownerId = request.sessionUserId;
        if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
        const existing = database.prepare(`
          SELECT * FROM ${resource.table} WHERE id = ? AND owner_id = ?
        `).get(request.params.itemId, ownerId) as Record<string, unknown> | undefined;
        if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการ' });

        let name = existing.name as string;
        if (request.body.name !== undefined) {
          const norm = normalizeTaxonomyName(request.body.name);
          if (!norm) return reply.code(400).send({ error: 'ชื่อหมวดหมู่หรือแท็กไม่ถูกต้อง' });
          const duplicate = database.prepare(`
            SELECT 1 FROM ${resource.table}
            WHERE owner_id = ? AND name = ? COLLATE NOCASE AND id <> ?
          `).get(ownerId, norm, request.params.itemId);
          if (duplicate) return reply.code(409).send({ error: 'มีชื่อนี้อยู่แล้ว' });
          name = norm;
        }

        const now = Date.now();
        if (resource.table === 'tags') {
          const color = request.body.color !== undefined ? request.body.color.trim() : (existing.color as string || '#3b82f6');
          database.prepare(`
            UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ? AND owner_id = ?
          `).run(name, color, now, request.params.itemId, ownerId);
          const item = database.prepare(`
            SELECT id, name, COALESCE(color, '#3b82f6') AS color, created_at AS createdAt, updated_at AS updatedAt
            FROM tags WHERE id = ? AND owner_id = ?
          `).get(request.params.itemId, ownerId) as TaxonomyItem;
          return { tag: item };
        } else {
          database.prepare(`
            UPDATE categories SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?
          `).run(name, now, request.params.itemId, ownerId);
          const item = database.prepare(`
            SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
            FROM categories WHERE id = ? AND owner_id = ?
          `).get(request.params.itemId, ownerId) as TaxonomyItem;
          return { category: item };
        }
      },
    );

    app.delete<{
      Params: { itemId: string };
    }>(`/api/${resource.table}/:itemId`, {
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
    const total = (database.prepare('SELECT COUNT(*) AS total FROM files WHERE owner_id = ? AND deleted_at IS NULL')
      .get(ownerId) as { total: number }).total;
    const files = database.prepare(`
      ${fileSelect}
      WHERE owner_id = ? AND deleted_at IS NULL
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
    const now = Date.now();
    const result = database.prepare('UPDATE files SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, request.params.fileId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบไฟล์' });
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

    const current = database.prepare(
      'SELECT id, title, content, updated_at FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL'
    ).get(request.params.noteId, ownerId) as { id: string; title: string; content: string; updated_at: number } | undefined;
    if (!current) return reply.code(404).send({ error: 'ไม่พบโน้ต' });

    const willChangeTitle = normalizedTitle !== undefined && normalizedTitle !== current.title;
    const willChangeContent = content !== undefined && content !== current.content;

    if (willChangeTitle || willChangeContent) {
      const maxVer = database.prepare(
        'SELECT COALESCE(MAX(version_number), 0) AS maxVersion FROM note_versions WHERE note_id = ?'
      ).get(current.id) as { maxVersion: number };

      database.prepare(`
        INSERT INTO note_versions (id, note_id, owner_id, version_number, title, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        current.id,
        ownerId,
        maxVer.maxVersion + 1,
        current.title,
        current.content,
        current.updated_at || Date.now()
      );
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

  app.get<{ Params: { noteId: string } }>('/api/notes/:noteId/versions', {
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
    const note = database.prepare('SELECT id FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .get(request.params.noteId, ownerId);
    if (!note) return reply.code(404).send({ error: 'ไม่พบโน้ต' });

    const versions = database.prepare(`
      SELECT id, note_id AS noteId, version_number AS versionNumber, title, content, created_at AS createdAt
      FROM note_versions
      WHERE note_id = ? AND owner_id = ?
      ORDER BY version_number DESC
    `).all(request.params.noteId, ownerId) as NoteVersion[];
    return { versions };
  });

  app.post<{ Params: { noteId: string; versionId: string } }>('/api/notes/:noteId/versions/:versionId/restore', {
    schema: {
      params: {
        type: 'object',
        required: ['noteId', 'versionId'],
        properties: {
          noteId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
          versionId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const targetVersion = database.prepare(
      'SELECT id, note_id, version_number, title, content FROM note_versions WHERE id = ? AND note_id = ? AND owner_id = ?'
    ).get(request.params.versionId, request.params.noteId, ownerId) as {
      id: string;
      note_id: string;
      version_number: number;
      title: string;
      content: string;
    } | undefined;
    if (!targetVersion) return reply.code(404).send({ error: 'ไม่พบประวัติเวอร์ชันที่ต้องการกู้คืน' });

    const current = database.prepare(
      'SELECT id, title, content, updated_at FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL'
    ).get(request.params.noteId, ownerId) as { id: string; title: string; content: string; updated_at: number } | undefined;
    if (!current) return reply.code(404).send({ error: 'ไม่พบโน้ต' });

    const maxVer = database.prepare(
      'SELECT COALESCE(MAX(version_number), 0) AS maxVersion FROM note_versions WHERE note_id = ?'
    ).get(current.id) as { maxVersion: number };

    database.prepare(`
      INSERT INTO note_versions (id, note_id, owner_id, version_number, title, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      current.id,
      ownerId,
      maxVer.maxVersion + 1,
      current.title,
      current.content,
      current.updated_at || Date.now()
    );

    database.prepare(`
      UPDATE notes
      SET title = ?, content = ?, updated_at = ?
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(targetVersion.title, targetVersion.content, Date.now(), current.id, ownerId);

    const note = database.prepare(`${noteSelect} WHERE id = ? AND owner_id = ?`)
      .get(current.id, ownerId) as Note;
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

  // One-click full SQLite database backup download
  app.get('/api/backup/export', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const tmpBackupPath = resolve(os.tmpdir(), `pkh-backup-${randomUUID()}.sqlite3`);
    try {
      await database.backup(tmpBackupPath);
      const filename = `pkh-database-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      reply.header('content-type', 'application/x-sqlite3');
      const stream = createReadStream(tmpBackupPath);
      stream.on('close', () => {
        try { unlinkSync(tmpBackupPath); } catch {}
      });
      return reply.send(stream);
    } catch (err) {
      try { unlinkSync(tmpBackupPath); } catch {}
      return reply.code(500).send({ error: 'ไม่สามารถสร้างไฟล์สำรองข้อมูลได้' });
    }
  });

  // One-click human-readable JSON full export
  app.get('/api/backup/export-json', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const notes = database.prepare('SELECT * FROM notes WHERE owner_id = ?').all(ownerId);
    const tasks = database.prepare('SELECT * FROM tasks WHERE owner_id = ?').all(ownerId);
    const bookmarks = database.prepare('SELECT * FROM bookmarks WHERE owner_id = ?').all(ownerId);
    const vault = database.prepare('SELECT * FROM vault_items WHERE owner_id = ?').all(ownerId);
    const library = database.prepare('SELECT * FROM library_items WHERE owner_id = ?').all(ownerId);
    const categories = database.prepare('SELECT * FROM custom_categories WHERE owner_id = ?').all(ownerId);
    const categoryItems = database.prepare('SELECT * FROM custom_category_items WHERE owner_id = ?').all(ownerId);
    const files = database.prepare('SELECT id, display_name, size_bytes, media_type, created_at, custom_category_id FROM files WHERE owner_id = ?').all(ownerId);
    const projects = database.prepare('SELECT * FROM projects WHERE owner_id = ?').all(ownerId);
    const goals = database.prepare('SELECT * FROM goals WHERE owner_id = ?').all(ownerId);
    const reminders = database.prepare('SELECT * FROM reminders WHERE owner_id = ?').all(ownerId);
    const habits = database.prepare('SELECT * FROM habits WHERE owner_id = ?').all(ownerId);
    const timeblocks = database.prepare('SELECT * FROM life_timeblocks WHERE owner_id = ?').all(ownerId);

    const exportData = {
      exportedAt: new Date().toISOString(),
      ownerId,
      data: {
        custom_categories: categories,
        custom_category_items: categoryItems,
        notes,
        tasks,
        bookmarks,
        vault_items: vault,
        library_items: library,
        files,
        projects,
        goals,
        reminders,
        habits,
        timeblocks,
      },
    };

    const filename = `pkh-export-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('content-type', 'application/json; charset=utf-8');
    return reply.send(JSON.stringify(exportData, null, 2));
  });

  registerLifeOsRoutes(app, database);
  registerWorkRoutes(app, database);
  registerDashboardRoutes(app, database);
  registerHabitLogRoutes(app, database);
  registerEntityFileRoutes(app, database);
  registerVaultRoutes(app, database);
  registerCustomCategoryRoutes(app, database);
  registerLifestyleRoutes(app, database);
  registerUniversalTrashRoutes(app, database, dataDirectory);
  registerCustomTypesRoutes(app, database);
  registerSupportTicketRoutes(app, database);
  registerUniversalFavoritesRoutes(app, database);

  return app;
}

export async function startServer() {
  const defaultDataDir = fileURLToPath(new URL('../../../data', import.meta.url));
  const dataDirectory = process.env.DATA_DIR || defaultDataDir;
  const candidateWebRoots = [
    process.env.WEB_ROOT,
    fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    fileURLToPath(new URL('../web-dist/', import.meta.url)),
    resolve(process.cwd(), 'web-dist'),
    resolve(process.cwd(), 'apps/web/dist'),
  ].filter((p): p is string => Boolean(p && existsSync(resolve(p, 'index.html'))));
  const webRoot = candidateWebRoots[0];
  const hasWebBuild = Boolean(webRoot);
  if (!hasWebBuild) {
    console.warn('Web build is missing; serving API only. Run npm run build:web or use the Vite dev server.');
  }
  const { database, preMigrationBackupPath } = await openDataDatabaseSafely(dataDirectory);
  if (preMigrationBackupPath) {
    console.info('A verified backup was created before applying pending database migrations.');
  }
  startNotificationScheduler(database);
  const server = createApp(database, hasWebBuild ? { webRoot, dataDirectory } : { dataDirectory });
  server.addHook('onClose', async () => {
    stopNotificationScheduler();
    database.close();
  });
  try {
    await server.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '127.0.0.1' });
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
