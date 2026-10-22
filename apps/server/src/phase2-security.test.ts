import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations } from './database.js';
import { createApp } from './index.js';
import { hashPassword, createSession } from './auth.js';

describe('Phase 2 Security & Notifications Integration', () => {
  let db: any;
  let tmpDir: string;
  let app: any;
  const headers = { origin: 'http://127.0.0.1:3001', host: '127.0.0.1:3001', 'x-pkh-request': '1' };

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pkh-phase2-test-'));
    db = new Database(':memory:');
    db.function('nfc', { deterministic: true }, (val: string | null) => val?.normalize('NFC') ?? null);
    applyMigrations(db);
    app = createApp(db, { dataDirectory: tmpDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('OWASP ASVS Password Reset: prevents user enumeration and requires both username and email match', async () => {
    const pwhash = await hashPassword('CurrentValidPassword123!');
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, is_active, created_at)
      VALUES ('u1', 'alice', 'alice@example.com', ?, 'member', 1, 1000)
    `).run(pwhash);

    // 1. Mismatch email -> returns generic success, but does NOT create OTP!
    const resMismatch = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password/request-otp',
      headers,
      payload: { username: 'alice', email: 'wrong@example.com' },
    });
    expect(resMismatch.statusCode).toBe(200);
    const bodyMismatch = JSON.parse(resMismatch.payload);
    expect(bodyMismatch.ok).toBe(true);
    expect(bodyMismatch.message).toContain('หากชื่อผู้ใช้และอีเมลถูกต้อง');

    // Verify NO OTP row was inserted in database
    const otpRows0 = db.prepare('SELECT * FROM password_reset_otps').all();
    expect(otpRows0.length).toBe(0);

    // 2. Matching username and email -> creates hashed OTP
    const resValid = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password/request-otp',
      headers,
      payload: { username: 'alice', email: 'alice@example.com' },
    });
    expect(resValid.statusCode).toBe(200);
    const bodyValid = JSON.parse(resValid.payload);
    expect(bodyValid.ok).toBe(true);
    expect(bodyValid.debugOtp).toBeDefined();

    const otpRows1 = db.prepare('SELECT * FROM password_reset_otps WHERE user_id = ?').all('u1');
    expect(otpRows1.length).toBe(1);
    expect(otpRows1[0].otp_hash).toBeDefined();
    expect(otpRows1[0].otp_hash).not.toBe(bodyValid.debugOtp); // HASHED, not plain text!
    expect(otpRows1[0].used).toBe(0);

    // 3. Create active session for alice
    const session = createSession(db, 'u1');

    // Verify session exists
    expect(db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?').get('u1').count).toBe(1);

    // 4. Attempt reset with wrong OTP -> fails and increments attempts
    const resWrongOtp = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password/reset',
      headers,
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        otp: '999999',
        newPassword: 'BrandNewPassword123!',
      },
    });
    expect(resWrongOtp.statusCode).toBe(400);

    // 5. Successful reset with correct OTP -> updates password and revokes all active sessions!
    const resReset = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password/reset',
      headers,
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        otp: bodyValid.debugOtp,
        newPassword: 'BrandNewPassword123!',
      },
    });
    expect(resReset.statusCode).toBe(200);
    const bodyReset = JSON.parse(resReset.payload);
    expect(bodyReset.ok).toBe(true);

    // Check sessions were REVOKED
    expect(db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?').get('u1').count).toBe(0);

    // Check OTP marked as used (single-use)
    const otpRowAfter = db.prepare('SELECT used FROM password_reset_otps WHERE id = ?').get(otpRows1[0].id);
    expect(otpRowAfter.used).toBe(1);

    // 6. Attempting to reuse the same OTP fails
    const resReuse = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password/reset',
      headers,
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        otp: bodyValid.debugOtp,
        newPassword: 'AnotherPassword123!',
      },
    });
    expect(resReuse.statusCode).toBe(400);
  });

  it('handles open registration, collision checks, and invite-only mode', async () => {
    // 1. Open registration
    const resOpen = await app.inject({
      method: 'POST',
      url: '/api/auth/register-account',
      headers,
      payload: {
        username: 'bob123',
        email: 'bob@example.com',
        password: 'SecurePassword123!',
        displayName: 'Bob The Builder',
      },
    });
    expect(resOpen.statusCode).toBe(201);
    const bodyOpen = JSON.parse(resOpen.payload);
    expect(bodyOpen.user.username).toBe('bob123');
    expect(bodyOpen.user.role).toBe('member');

    // 2. Collision check for duplicate username
    const resDup = await app.inject({
      method: 'POST',
      url: '/api/auth/register-account',
      headers,
      payload: {
        username: 'bob123',
        password: 'AnotherPassword123!',
      },
    });
    expect(resDup.statusCode).toBe(400);

    // 3. Switch registration_mode to invite_only
    db.prepare("UPDATE system_settings SET value = 'invite_only' WHERE key = 'registration_mode'").run();

    // 4. Attempt registering without invite code in invite_only mode -> rejected
    const resInviteRequired = await app.inject({
      method: 'POST',
      url: '/api/auth/register-account',
      headers,
      payload: {
        username: 'charlie',
        password: 'SecurePassword123!',
      },
    });
    expect(resInviteRequired.statusCode).toBe(403);
  });

  it('enforces server-side security hardening: no hardcoded admin passwords allowed', async () => {
    const adminHash = await hashPassword('RealAdminSuperSecret123!');
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, is_active, created_at)
      VALUES ('adm1', 'superadmin', ?, 'admin', 1, 1000)
    `).run(adminHash);

    const session = createSession(db, 'adm1');
    const cookie = `pkh_session=${session.token}`;

    // Try hardcoded password "123456" -> MUST FAIL
    const res123 = await app.inject({
      method: 'POST',
      url: '/api/admin/unlock',
      headers: { ...headers, cookie },
      payload: { password: '123456' },
    });
    expect(res123.statusCode).toBe(401);

    // Try hardcoded password "Admin@123456" -> MUST FAIL
    const resAdmin123 = await app.inject({
      method: 'POST',
      url: '/api/admin/unlock',
      headers: { ...headers, cookie },
      payload: { password: 'Admin@123456' },
    });
    expect(resAdmin123.statusCode).toBe(401);

    // Real account password -> MUST SUCCEED
    const resReal = await app.inject({
      method: 'POST',
      url: '/api/admin/unlock',
      headers: { ...headers, cookie },
      payload: { password: 'RealAdminSuperSecret123!' },
    });
    expect(resReal.statusCode).toBe(200);
    expect(JSON.parse(resReal.payload).isUnlocked).toBe(true);
  });

  it('manages notifications complete action and user DND preferences', async () => {
    const pwhash = await hashPassword('PasswordForTest123!');
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, is_active, created_at)
      VALUES ('u_notif', 'notif_user', ?, 'member', 1, 1000)
    `).run(pwhash);

    const session = createSession(db, 'u_notif');
    const cookie = `pkh_session=${session.token}`;

    // Create a task
    db.prepare(`
      INSERT INTO tasks (id, owner_id, title, status, priority, created_at, updated_at)
      VALUES ('task_99', 'u_notif', 'ทำการบ้าน', 'todo', 'high', 1000, 1000)
    `).run();

    // Create notification linked to task_99
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
      VALUES ('notif_1', 'u_notif', 'due_task', 'เตือนทำการบ้าน', 'กำหนดวันนี้', '/tasks#task_99', 0, 1000)
    `).run();

    // Mark as complete via API
    const resComplete = await app.inject({
      method: 'POST',
      url: '/api/notifications/notif_1/complete',
      headers: { ...headers, cookie },
    });
    expect(resComplete.statusCode).toBe(200);

    // Check task status updated to completed!
    const updatedTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task_99');
    expect(updatedTask.status).toBe('done');

    // Check notification marked read
    const updatedNotif = db.prepare('SELECT is_read FROM notifications WHERE id = ?').get('notif_1');
    expect(updatedNotif.is_read).toBe(1);

    // Get and update DND preferences
    const resGetPref = await app.inject({
      method: 'GET',
      url: '/api/notifications/preferences',
      headers: { cookie },
    });
    expect(resGetPref.statusCode).toBe(200);
    const bodyGetPref = JSON.parse(resGetPref.payload);
    expect(bodyGetPref.preferences.dndEnabled).toBe(false);

    const resSetPref = await app.inject({
      method: 'POST',
      url: '/api/notifications/preferences',
      headers: { ...headers, cookie },
      payload: {
        dndEnabled: true,
        dndStart: '23:00',
        dndEnd: '07:00',
        notifyBirthdays: false,
      },
    });
    expect(resSetPref.statusCode).toBe(200);
    const bodySetPref = JSON.parse(resSetPref.payload);
    expect(bodySetPref.preferences.dndEnabled).toBe(true);
    expect(bodySetPref.preferences.notifyBirthdays).toBe(false);
  });
});
