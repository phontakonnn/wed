import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { SqliteDatabase } from './database.js';

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if ([...password].length < 12) {
    throw new Error('Password must be at least 12 characters long');
  }
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== String(SCRYPT_N) || r !== String(SCRYPT_R) || p !== String(SCRYPT_P) || !saltText || !keyText || extra !== undefined) {
    return false;
  }

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await deriveKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function bootstrapUser(database: SqliteDatabase, username: string, password: string) {
  const normalizedUsername = username.trim().normalize('NFC');
  if (!normalizedUsername || [...normalizedUsername].length > 80 || /[\u0000-\u001f\u007f]/u.test(normalizedUsername)) {
    throw new Error('Username must contain 1 to 80 printable characters');
  }
  const existing = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existing.count !== 0) {
    throw new Error('Administrator is already initialized');
  }

  const passwordHash = await hashPassword(password);
  const create = database.transaction(() => {
    const existing = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (existing.count !== 0) {
      throw new Error('Administrator is already initialized');
    }
    const cols = database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasRole = cols.some((c) => c.name === 'role');
    if (hasRole) {
      database.prepare('INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), normalizedUsername, passwordHash, Date.now(), 'admin');
    } else {
      database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), normalizedUsername, passwordHash, Date.now());
    }
  });
  create();
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(database: SqliteDatabase, userId: string, now = Date.now(), userAgent = '') {
  const token = randomBytes(32).toString('base64url');
  const idleExpiresAt = now + IDLE_TIMEOUT_MS;
  const absoluteExpiresAt = now + ABSOLUTE_TIMEOUT_MS;
  database.prepare(`
    INSERT INTO sessions (id_hash, user_id, user_agent, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hashSessionToken(token), userId, userAgent.slice(0, 512), now, now, idleExpiresAt, absoluteExpiresAt);
  return { token, idleExpiresAt, absoluteExpiresAt };
}

export function resolveSession(database: SqliteDatabase, token: string, now = Date.now()): string | null {
  const idHash = hashSessionToken(token);
  const session = database.prepare(`
    SELECT user_id, idle_expires_at, absolute_expires_at
    FROM sessions WHERE id_hash = ?
  `).get(idHash) as { user_id: string; idle_expires_at: number; absolute_expires_at: number } | undefined;

  if (!session) return null;
  if (session.idle_expires_at <= now || session.absolute_expires_at <= now) {
    database.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
    return null;
  }

  database.prepare(`
    UPDATE sessions
    SET last_seen_at = ?, idle_expires_at = MIN(absolute_expires_at, ?)
    WHERE id_hash = ?
  `).run(now, now + IDLE_TIMEOUT_MS, idHash);
  return session.user_id;
}
