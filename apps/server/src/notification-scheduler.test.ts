import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './database.js';
import {
  runNotificationCycle,
  isBirthdayInMonthOrUpcoming,
  startNotificationScheduler,
  stopNotificationScheduler,
} from './notification-scheduler.js';

describe('Notification Scheduler Service', () => {
  let db: any;

  beforeEach(() => {
    db = new Database(':memory:');
    db.function('nfc', { deterministic: true }, (val: string | null) => val?.normalize('NFC') ?? null);
    applyMigrations(db);
  });

  afterEach(() => {
    stopNotificationScheduler();
    db.close();
  });

  it('correctly matches birthdays in current month or upcoming within 7 days', () => {
    expect(isBirthdayInMonthOrUpcoming('1995-10-15', 2026, 10, 22)).toBe(true);
    expect(isBirthdayInMonthOrUpcoming('--10-25', 2026, 10, 22)).toBe(true);
    expect(isBirthdayInMonthOrUpcoming('15/10/1990', 2026, 10, 22)).toBe(true);
    expect(isBirthdayInMonthOrUpcoming('1995-05-15', 2026, 10, 22)).toBe(false);
  });

  it('scans people birthdays, yearly reminders, due tasks, shopping and deduplicates them', () => {
    // 1. Create test user
    db.prepare(`
      INSERT INTO users (id, username, password_hash, is_active, notify_birthdays, notify_tasks, notify_reminders, notify_shopping, created_at)
      VALUES ('u1', 'testuser', 'scrypt$dummy', 1, 1, 1, 1, 1, 1000)
    `).run();

    // 2. Add person with birthday in month 10
    db.prepare(`
      INSERT INTO people (id, owner_id, name, relationship_group, birthday_or_anniversary, created_at, updated_at)
      VALUES ('p1', 'u1', 'สมชาย ใจดี', 'family', '1992-10-25', 1000, 1000)
    `).run();

    // 3. Add overdue task
    db.prepare(`
      INSERT INTO tasks (id, owner_id, title, status, priority, due_date, created_at, updated_at)
      VALUES ('t1', 'u1', 'ส่งรายงานงบการเงิน', 'todo', 'high', '2026-10-20', 1000, 1000)
    `).run();

    // 4. Add yearly reminder
    db.prepare(`
      INSERT INTO reminders (id, owner_id, title, category, target_date, recurrence, is_completed, created_at, updated_at)
      VALUES ('r1', 'u1', 'ต่อประกันรถยนต์', 'other', '2026-10-30', 'yearly', 0, 1000, 1000)
    `).run();

    // 5. Add shopping items
    db.prepare(`
      INSERT INTO shopping_items (id, owner_id, name, status, created_at, updated_at)
      VALUES ('s1', 'u1', 'กาแฟคั่วเข้ม', 'to_buy', 1000, 1000)
    `).run();

    // Run cycle (simulate 2026-10-22)
    const fixedNow = new Date('2026-10-22T08:00:00+07:00').getTime();
    const cycle1 = runNotificationCycle(db, fixedNow);

    expect(cycle1.generatedCount).toBeGreaterThanOrEqual(4);

    const rows = db.prepare('SELECT id, type, title, dedup_key FROM notifications WHERE user_id = ?').all('u1');
    expect(rows.length).toBe(cycle1.generatedCount);

    const titles = rows.map((r: any) => r.title);
    expect(titles.some((t: string) => t.includes('สมชาย'))).toBe(true);
    expect(titles.some((t: string) => t.includes('ส่งรายงาน'))).toBe(true);
    expect(titles.some((t: string) => t.includes('ต่อประกัน'))).toBe(true);
    expect(titles.some((t: string) => t.includes('ซื้อของ'))).toBe(true);

    // Second run should NOT duplicate any notification!
    const cycle2 = runNotificationCycle(db, fixedNow);
    expect(cycle2.generatedCount).toBe(0);

    const rowsAfter = db.prepare('SELECT id FROM notifications WHERE user_id = ?').all('u1');
    expect(rowsAfter.length).toBe(cycle1.generatedCount);
  });

  it('respects user category notification toggles', () => {
    // User with shopping disabled
    db.prepare(`
      INSERT INTO users (id, username, password_hash, is_active, notify_birthdays, notify_tasks, notify_reminders, notify_shopping, created_at)
      VALUES ('u2', 'user_no_shopping', 'scrypt$dummy', 1, 1, 1, 1, 0, 1000)
    `).run();

    db.prepare(`
      INSERT INTO shopping_items (id, owner_id, name, status, created_at, updated_at)
      VALUES ('s2', 'u2', 'นมสด', 'to_buy', 1000, 1000)
    `).run();

    const fixedNow = new Date('2026-10-22T08:00:00+07:00').getTime();
    runNotificationCycle(db, fixedNow);

    const rows = db.prepare('SELECT id FROM notifications WHERE user_id = ?').all('u2');
    expect(rows.length).toBe(0);
  });
});
