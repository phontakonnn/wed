import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './database.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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
  saveFilter,
  getSavedFilters,
  deleteSavedFilter,
  verifyMagicBytes,
  exportUserFullData,
  importUserFullData,
  applyBackupRetentionPolicy,
} from './security-ops.js';

function createTestDatabase() {
  const db = new Database(':memory:');
  db.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

function insertTestUser(db: Database.Database, id: string, username = 'tester') {
  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, is_active, created_at)
    VALUES (?, ?, 'hash', 'user', ?, 1, ?)
  `).run(id, username, username, Date.now());
}

describe('Security Ops & ASVS Tests', () => {
  it('records and queries login history correctly', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    insertTestUser(db, userId, 'tester');

    recordLoginHistory(db, {
      userId,
      username: 'tester',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      status: 'failed',
      failureReason: 'invalid_password',
    });

    recordLoginHistory(db, {
      userId,
      username: 'tester',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      status: 'success',
    });

    const history = getLoginHistory(db, userId, 10);
    expect(history.length).toBe(2);
    const statuses = history.map((h) => h.status);
    expect(statuses).toContain('success');
    expect(statuses).toContain('failed');
  });

  it('records and queries audit logs with pagination and filters', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    insertTestUser(db, userId, 'admin');

    recordAuditLog(db, {
      userId,
      action: 'delete_note',
      resourceType: 'note',
      resourceId: 'note-1',
      details: { title: 'Secret Note' },
      ipAddress: '127.0.0.1',
    });

    recordAuditLog(db, {
      userId,
      action: 'admin_gate_unlock',
      resourceType: 'admin_gate',
      ipAddress: '127.0.0.1',
    });

    const logs = getAuditLogs(db, { userId, action: 'delete_note' });
    expect(logs.total).toBe(1);
    expect(logs.logs[0].action).toBe('delete_note');
    expect(logs.logs[0].resourceType).toBe('note');
  });

  it('manages active sessions and revokes all other sessions', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    insertTestUser(db, userId, 'sess_user');

    // Insert 2 sessions
    db.prepare(`
      INSERT INTO sessions (id_hash, user_id, user_agent, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
      VALUES ('hash1', ?, 'Chrome', ?, ?, ?, ?),
             ('hash2', ?, 'Firefox', ?, ?, ?, ?)
    `).run(userId, Date.now(), Date.now(), Date.now() + 100000, Date.now() + 200000,
           userId, Date.now(), Date.now(), Date.now() + 100000, Date.now() + 200000);

    const sessions = getUserActiveSessions(db, userId, 'hash1');
    expect(sessions.length).toBe(2);

    const { revokedCount } = revokeAllUserSessions(db, userId, 'hash1');
    expect(revokedCount).toBe(1);

    const remaining = getUserActiveSessions(db, userId, 'hash1');
    expect(remaining.length).toBe(1);
  });

  it('handles workspace invites workflow', () => {
    const db = createTestDatabase();
    const adminId = randomUUID();
    insertTestUser(db, adminId, 'admin_invite');

    const invite = createWorkspaceInvite(db, {
      createdBy: adminId,
      role: 'user',
      maxUses: 2,
      expiresInHours: 24,
    });
    expect(invite.code.length).toBeGreaterThan(6);

    const invites = listWorkspaceInvites(db);
    expect(invites.length).toBe(1);

    // Use invite once
    const use1 = validateAndUseInvite(db, invite.code);
    expect(use1.valid).toBe(true);
    expect(use1.role).toBe('user');

    // Use invite second time
    const use2 = validateAndUseInvite(db, invite.code);
    expect(use2.valid).toBe(true);

    // Third time should fail
    const use3 = validateAndUseInvite(db, invite.code);
    expect(use3.valid).toBe(false);

    // Revoke
    const invite2 = createWorkspaceInvite(db, { createdBy: adminId });
    revokeWorkspaceInvite(db, invite2.code);
    const useRevoked = validateAndUseInvite(db, invite2.code);
    expect(useRevoked.valid).toBe(false);
  });

  it('enforces IDOR defense with checkItemAccess and handles item sharing', () => {
    const db = createTestDatabase();
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const strangerId = randomUUID();
    const noteId = randomUUID();

    insertTestUser(db, ownerId, 'owner_user');
    insertTestUser(db, otherUserId, 'other_user');
    insertTestUser(db, strangerId, 'stranger_user');

    db.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, 'Shared Doc', 'Doc Content', ?, ?)
    `).run(noteId, ownerId, Date.now(), Date.now());

    // Owner has admin access
    expect(checkItemAccess(db, 'note', noteId, ownerId, 'admin').allowed).toBe(true);

    // Stranger has no access
    expect(checkItemAccess(db, 'note', noteId, strangerId, 'viewer').allowed).toBe(false);

    // Share with other user as editor
    const share = shareItem(db, {
      itemType: 'note',
      itemId: noteId,
      ownerId,
      sharedWithUserId: otherUserId,
      permission: 'editor',
    });
    expect(share.id).toBeDefined();

    // Other user has viewer and editor, but not admin
    expect(checkItemAccess(db, 'note', noteId, otherUserId, 'viewer').allowed).toBe(true);
    expect(checkItemAccess(db, 'note', noteId, otherUserId, 'editor').allowed).toBe(true);
    expect(checkItemAccess(db, 'note', noteId, otherUserId, 'admin').allowed).toBe(false);

    // Check shares
    const shares = getItemShares(db, 'note', noteId);
    expect(shares.length).toBe(1);

    // Unshare
    unshareItem(db, share.id, ownerId);
    expect(checkItemAccess(db, 'note', noteId, otherUserId, 'viewer').allowed).toBe(false);
  });

  it('creates, snoozes, and marks notifications as read', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    insertTestUser(db, userId, 'notif_user');

    const notif = createNotification(db, {
      userId,
      type: 'reminder',
      title: 'Pay bills today',
      message: 'Monthly bill payment due',
      linkUrl: '/reminders',
    });
    expect(notif.id).toBeDefined();

    const res1 = getUserNotifications(db, userId);
    expect(res1.unreadCount).toBe(1);

    // Snooze
    snoozeNotification(db, userId, notif.id, 2);
    const res2 = getUserNotifications(db, userId);
    expect(res2.unreadCount).toBe(0); // snoozed notifications are hidden

    // Mark as read
    markNotificationsAsRead(db, userId, notif.id);
  });

  it('saves, queries, and deletes saved filters', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    insertTestUser(db, userId, 'filter_user');

    const f1 = saveFilter(db, userId, {
      name: 'High Priority Tasks',
      filterType: 'tasks',
      queryCriteria: { priority: 'high', status: 'todo' },
    });
    expect(f1.id).toBeDefined();

    const list = getSavedFilters(db, userId, 'tasks');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('High Priority Tasks');

    const deleted = deleteSavedFilter(db, userId, f1.id);
    expect(deleted).toBe(true);
    expect(getSavedFilters(db, userId, 'tasks').length).toBe(0);
  });

  it('validates magic bytes for media uploads', () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(verifyMagicBytes(pngBuffer, 'image/png')).toBe(true);

    // Fake PNG (actually text/garbage)
    const fakePng = Buffer.from('NOT A REAL PNG FILE AT ALL');
    expect(verifyMagicBytes(fakePng, 'image/png')).toBe(false);

    // Valid JPEG signature: FF D8 FF
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(verifyMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);

    // Valid PDF signature: %PDF
    const pdfBuffer = Buffer.from('%PDF-1.4 sample pdf content');
    expect(verifyMagicBytes(pdfBuffer, 'application/pdf')).toBe(true);
  });

  it('exports user full data and imports with deduplication', () => {
    const db = createTestDatabase();
    const userId = randomUUID();
    const newUserId = randomUUID();
    insertTestUser(db, userId, 'export_user');
    insertTestUser(db, newUserId, 'import_user');

    // Insert a note and task
    db.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES ('note-a', ?, 'My Note', 'Content', 1000, 1000)
    `).run(userId);
    db.prepare(`
      INSERT INTO tasks (id, owner_id, title, status, priority, recurrence, created_at, updated_at)
      VALUES ('task-a', ?, 'Buy Milk', 'todo', 'normal', 'none', 1000, 1000)
    `).run(userId);

    const exported = exportUserFullData(db, userId);
    expect(exported.formatVersion).toBe(2);
    expect((exported.counts as any).notes).toBe(1);
    expect((exported.counts as any).tasks).toBe(1);

    // Import into another user's workspace
    const result1 = importUserFullData(db, newUserId, exported as any);
    expect(result1.imported.notes).toBe(1);
    expect(result1.imported.tasks).toBe(1);

    // Re-importing same data should deduplicate (skip)
    const result2 = importUserFullData(db, newUserId, exported as any);
    expect(result2.imported.notes).toBe(0);
    expect(result2.skipped.notes).toBe(1);
    expect(result2.imported.tasks).toBe(0);
    expect(result2.skipped.tasks).toBe(1);
  });

  it('prunes backup files according to retention policy and keeps at least 2', () => {
    const db = createTestDatabase();
    const tmpBackupDir = join(tmpdir(), `pkh-test-retention-${randomUUID()}`);
    mkdirSync(tmpBackupDir, { recursive: true });

    try {
      // Create 5 dummy backup files
      for (let i = 1; i <= 5; i++) {
        writeFileSync(join(tmpBackupDir, `knowledge-2026100${i}T000000000Z-11111111.sqlite3`), 'dummy');
      }

      // Set max backups to 3
      db.prepare("UPDATE system_settings SET value = '3', updated_at = ? WHERE key = 'backup_max_files'").run(Date.now());

      const { prunedCount } = applyBackupRetentionPolicy(db, tmpBackupDir);
      expect(prunedCount).toBe(2); // 5 - 3 = 2 pruned
    } finally {
      rmSync(tmpBackupDir, { recursive: true, force: true });
    }
  });
});
