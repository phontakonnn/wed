import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './database.js';
import { hashPassword, verifyPassword, createSession } from './auth.js';
import {
  getSystemSettings,
  updateSystemSettings,
  listUsers,
  createUser,
  resetUserPassword,
  deleteUser,
  updateAccount,
  updateUserRoleAndStatus,
  getDatabaseStats,
  optimizeDatabase,
  exportDatabaseJson,
  DEFAULT_SYSTEM_SETTINGS,
} from './admin.js';

function setupTestDb() {
  const db = new Database(':memory:');
  db.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

describe('Admin & System Settings Unit Tests', () => {
  it('returns default system settings and updates them', () => {
    const db = setupTestDb();
    const settings = getSystemSettings(db);
    expect(settings.app_title).toBe(DEFAULT_SYSTEM_SETTINGS.app_title);
    expect(settings.max_upload_size_mb).toBe(50);
    expect(settings.default_theme).toBe('system');

    const updated = updateSystemSettings(db, {
      app_title: 'My Custom Life OS',
      max_upload_size_mb: 100,
      default_theme: 'dark',
    });

    expect(updated.app_title).toBe('My Custom Life OS');
    expect(updated.max_upload_size_mb).toBe(100);
    expect(updated.default_theme).toBe('dark');

    const retrieved = getSystemSettings(db);
    expect(retrieved.app_title).toBe('My Custom Life OS');
    db.close();
  });

  it('manages users, resets passwords, and deletes users with safety checks', async () => {
    const db = setupTestDb();
    const adminPassHash = await hashPassword('AdminPass123456');
    db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('admin-id', 'admin', adminPassHash, 1000);

    createSession(db, 'admin-id', 2000);

    let users = listUsers(db);
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('admin');
    expect(users[0].sessionCount).toBe(1);

    // Create user
    const userPassHash = await hashPassword('UserPass123456');
    const newUser = createUser(db, 'john_doe', userPassHash);
    expect(newUser.username).toBe('john_doe');

    // Duplicate username throws
    expect(() => createUser(db, 'john_doe', userPassHash)).toThrow(/มีชื่อผู้ใช้นี้อยู่ในระบบแล้ว/);

    users = listUsers(db);
    expect(users).toHaveLength(2);

    // Create session for john_doe
    createSession(db, newUser.id, 3000);
    expect(listUsers(db).find((u) => u.id === newUser.id)?.sessionCount).toBe(1);

    // Reset password clears sessions
    const newPassHash = await hashPassword('NewPass12345678');
    resetUserPassword(db, newUser.id, newPassHash);
    expect(listUsers(db).find((u) => u.id === newUser.id)?.sessionCount).toBe(0);

    // Safety checks on delete
    expect(() => deleteUser(db, 'admin-id', 'admin-id')).toThrow(/ไม่สามารถลบบัญชีของตนเองได้/);
    expect(() => deleteUser(db, newUser.id, 'admin-id')).toThrow(/ผู้ดูแลระบบหลัก/);

    // Delete user succeeds
    deleteUser(db, 'admin-id', newUser.id);
    expect(listUsers(db)).toHaveLength(1);

    // Cannot delete last user
    expect(() => deleteUser(db, 'another-id', 'admin-id')).toThrow(/ไม่สามารถลบผู้ใช้คนสุดท้าย/);
    db.close();
  });

  it('manages user roles, status, and deactivation with session revocation', async () => {
    const db = setupTestDb();
    const adminPassHash = await hashPassword('AdminPass123456');
    db.prepare("INSERT INTO users (id, username, password_hash, role, is_active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)")
      .run('admin-1', 'admin', adminPassHash, 1000);

    const userPassHash = await hashPassword('UserPass123456');
    const u2 = createUser(db, 'user2', userPassHash, 'User Two', 'user');
    expect(u2.role).toBe('user');
    expect(u2.displayName).toBe('User Two');

    // Create session for user2
    createSession(db, u2.id, 2000);
    expect(listUsers(db).find((u) => u.id === u2.id)?.sessionCount).toBe(1);

    // Promote user2 to admin
    updateUserRoleAndStatus(db, 'admin-1', u2.id, { role: 'admin' });
    expect(listUsers(db).find((u) => u.id === u2.id)?.role).toBe('admin');

    // Self deactivation fails
    expect(() => updateUserRoleAndStatus(db, 'admin-1', 'admin-1', { isActive: false })).toThrow(/ไม่สามารถระงับการใช้งานบัญชีของตนเองได้/);

    // Deactivating user2 clears their sessions
    updateUserRoleAndStatus(db, 'admin-1', u2.id, { isActive: false });
    expect(listUsers(db).find((u) => u.id === u2.id)?.isActive).toBe(false);
    expect(listUsers(db).find((u) => u.id === u2.id)?.sessionCount).toBe(0);

    db.close();
  });

  it('updates own account username and password', async () => {
    const db = setupTestDb();
    const initialHash = await hashPassword('InitialPass123456');
    db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('u1', 'user1', initialHash, 1000);
    db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('u2', 'user2', initialHash, 1000);

    // Duplicate username error
    expect(() => updateAccount(db, 'u1', { username: 'user2' })).toThrow(/ถูกใช้งานแล้ว/);

    // Successful update
    const updated = updateAccount(db, 'u1', { username: 'user1_renamed' });
    expect(updated.username).toBe('user1_renamed');

    const newPassHash = await hashPassword('ChangedPass123456');
    updateAccount(db, 'u1', { passwordHash: newPassHash });

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('u1') as { password_hash: string };
    expect(await verifyPassword('ChangedPass123456', row.password_hash)).toBe(true);
    db.close();
  });

  it('collects database stats, cleans orphans, and exports JSON', () => {
    const db = setupTestDb();
    db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('u1', 'admin', 'hash', 1000);

    db.prepare('INSERT INTO notes (id, owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('n1', 'u1', 'Test Note', 'Content', 1000, 1000);

    const stats = getDatabaseStats(db, null);
    expect(stats.tableCounts.notes).toBe(1);
    expect(stats.tableCounts.users).toBe(1);

    // Test optimization
    const opt = optimizeDatabase(db);
    expect(opt.vacuumed).toBe(true);

    // Test JSON export
    const exported = exportDatabaseJson(db, 'u1');
    expect(exported.version).toBe(1);
    expect((exported.notes as any[]).length).toBe(1);
    expect((exported.systemSettings as any).app_title).toBe(DEFAULT_SYSTEM_SETTINGS.app_title);
    db.close();
  });
});
