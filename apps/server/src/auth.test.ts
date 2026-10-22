import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapUser, createSession, hashPassword, hashSessionToken, resolveSession, verifyPassword } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';

const databases: SqliteDatabase[] = [];

function createDatabase() {
  const database = openDatabase(':memory:');
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('password and session primitives', () => {
  it('hashes passwords with scrypt and enforces the minimum length', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 12');
    const encoded = await hashPassword('correct horse battery staple');

    expect(encoded).not.toContain('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', encoded)).toBe(true);
    expect(await verifyPassword('wrong password', encoded)).toBe(false);
  });

  it('allows bootstrap only once and stores a password hash', async () => {
    const database = createDatabase();
    await bootstrapUser(database, 'admin', 'correct horse battery staple');
    const user = database.prepare('SELECT username, password_hash FROM users').get() as { username: string; password_hash: string };

    expect(user.username).toBe('admin');
    expect(user.password_hash).toMatch(/^scrypt\$/);
    await expect(bootstrapUser(database, 'second', 'another secure password')).rejects.toThrow('already initialized');
  });

  it('stores only a session token hash and applies idle and absolute expiry', () => {
    const database = createDatabase();
    const userId = 'user-1';
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'admin', 'not-used-in-session-test', 1);
    const createdAt = 1_000_000;
    const session = createSession(database, userId, createdAt);
    const stored = database.prepare('SELECT id_hash FROM sessions').get() as { id_hash: string };

    expect(stored.id_hash).toBe(hashSessionToken(session.token));
    expect(stored.id_hash).not.toBe(session.token);
    expect(resolveSession(database, session.token, createdAt + 3 * 24 * 60 * 60 * 1000)).toBe(userId);
    expect(resolveSession(database, session.token, createdAt + 9 * 24 * 60 * 60 * 1000)).toBe(userId);
    expect(resolveSession(database, session.token, createdAt + 17 * 24 * 60 * 60 * 1000)).toBeNull();

    const absoluteSession = createSession(database, userId, createdAt);
    expect(resolveSession(database, absoluteSession.token, createdAt + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
