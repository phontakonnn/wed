import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from './database.js';

export interface SchedulerOptions {
  intervalMs?: number;
}

let activeInterval: NodeJS.Timeout | null = null;

/**
 * Parses birthday string and returns true if it falls in the current month or within upcomingDays
 */
export function isBirthdayInMonthOrUpcoming(
  birthdayStr: string | null | undefined,
  currentYear: number,
  currentMonth: number, // 1-12
  currentDay: number,
  upcomingDays = 7
): boolean {
  if (!birthdayStr || !birthdayStr.trim()) return false;
  const clean = birthdayStr.trim();

  // Possible formats: YYYY-MM-DD, MM-DD, --MM-DD, DD/MM/YYYY, DD-MM-YYYY
  let bMonth: number | null = null;
  let bDay: number | null = null;

  const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(clean);
  const mdMatch = /^[-/]*(\d{1,2})[-/](\d{1,2})$/.exec(clean);
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(clean);

  if (ymdMatch) {
    bMonth = parseInt(ymdMatch[2], 10);
    bDay = parseInt(ymdMatch[3], 10);
  } else if (dmyMatch) {
    bDay = parseInt(dmyMatch[1], 10);
    bMonth = parseInt(dmyMatch[2], 10);
  } else if (mdMatch) {
    bMonth = parseInt(mdMatch[1], 10);
    bDay = parseInt(mdMatch[2], 10);
  }

  if (!bMonth || isNaN(bMonth) || bMonth < 1 || bMonth > 12) return false;

  // If in current month, alert!
  if (bMonth === currentMonth) return true;

  // Also check if near end of previous month looking into next upcoming days
  if (bDay && !isNaN(bDay)) {
    try {
      const thisYearTarget = new Date(currentYear, bMonth - 1, bDay);
      const today = new Date(currentYear, currentMonth - 1, currentDay);
      const diffMs = thisYearTarget.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (24 * 3600 * 1000));
      if (diffDays >= 0 && diffDays <= upcomingDays) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * Runs a full notification scan cycle for all active users
 */
export function runNotificationCycle(database: SqliteDatabase, now = Date.now()): { generatedCount: number } {
  let generatedCount = 0;

  const nowObj = new Date(now);
  // Thai Bangkok date calculation
  const bkkFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = bkkFormatter.format(nowObj); // YYYY-MM-DD
  const [yearStr, monthStr, dayStr] = todayStr.split('-');
  const currentYear = parseInt(yearStr, 10);
  const currentMonth = parseInt(monthStr, 10);
  const currentDay = parseInt(dayStr, 10);

  const upcomingDate = new Date(now + 3 * 24 * 3600 * 1000);
  const upcomingStr = bkkFormatter.format(upcomingDate);

  // 1. Fetch active users with preferences
  const users = database.prepare(`
    SELECT id, username,
           COALESCE(notify_birthdays, 1) AS notifyBirthdays,
           COALESCE(notify_tasks, 1) AS notifyTasks,
           COALESCE(notify_reminders, 1) AS notifyReminders,
           COALESCE(notify_shopping, 1) AS notifyShopping
    FROM users
    WHERE is_active = 1
  `).all() as Array<{
    id: string;
    username: string;
    notifyBirthdays: number;
    notifyTasks: number;
    notifyReminders: number;
    notifyShopping: number;
  }>;

  const insertStmt = database.prepare(`
    INSERT OR IGNORE INTO notifications (
      id, user_id, type, title, message, link_url, dedup_key, is_read, snoozed_until, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `);

  database.transaction(() => {
    for (const user of users) {
      // A. Birthdays of people in that month
      if (user.notifyBirthdays === 1) {
        const people = database.prepare(`
          SELECT id, name, birthday_or_anniversary AS birthday
          FROM people
          WHERE owner_id = ? AND birthday_or_anniversary IS NOT NULL AND birthday_or_anniversary != ''
        `).all(user.id) as Array<{ id: string; name: string; birthday: string }>;

        for (const p of people) {
          if (isBirthdayInMonthOrUpcoming(p.birthday, currentYear, currentMonth, currentDay)) {
            const dedupKey = `bday:${user.id}:${p.id}:${currentYear}-${monthStr}`;
            const res = insertStmt.run(
              randomUUID(),
              user.id,
              'reminder',
              `🎂 เดือนเกิด/วันเกิด: ${p.name}`,
              `วันเกิดหรือวันสำคัญ: ${p.birthday} (เดือน ${currentMonth})`,
              `/people#${p.id}`,
              dedupKey,
              now
            );
            if (res.changes > 0) generatedCount++;
          }
        }
      }

      // B. Yearly & Monthly Reminders / Schedules
      if (user.notifyReminders === 1) {
        // Yearly recurring
        const yearlyReminders = database.prepare(`
          SELECT id, title, target_date, recurrence
          FROM reminders
          WHERE owner_id = ? AND is_completed = 0 AND recurrence = 'yearly'
        `).all(user.id) as Array<{ id: string; title: string; target_date: string; recurrence: string }>;

        for (const rem of yearlyReminders) {
          const remParts = rem.target_date.split('-');
          const remMonth = parseInt(remParts[1] || '0', 10);
          if (remMonth === currentMonth) {
            const dedupKey = `yearly-schedule:${user.id}:${rem.id}:${currentYear}-${monthStr}`;
            const res = insertStmt.run(
              randomUUID(),
              user.id,
              'reminder',
              `📅 กำหนดการประจำปี: ${rem.title}`,
              `กำหนดวันที่ ${rem.target_date}`,
              `/schedule#${rem.id}`,
              dedupKey,
              now
            );
            if (res.changes > 0) generatedCount++;
          }
        }

        // Monthly recurring
        const monthlyReminders = database.prepare(`
          SELECT id, title, target_date
          FROM reminders
          WHERE owner_id = ? AND is_completed = 0 AND recurrence = 'monthly'
        `).all(user.id) as Array<{ id: string; title: string; target_date: string }>;

        for (const rem of monthlyReminders) {
          const dedupKey = `monthly-task:${user.id}:${rem.id}:${currentYear}-${monthStr}`;
          const res = insertStmt.run(
            randomUUID(),
            user.id,
            'reminder',
            `🗓️ งานประจำเดือน: ${rem.title}`,
            `กำหนดการประจำเดือน (${monthStr}/${currentYear})`,
            `/schedule#${rem.id}`,
            dedupKey,
            now
          );
          if (res.changes > 0) generatedCount++;
        }

        // Upcoming one-off reminders (within next 3 days)
        const upcomingReminders = database.prepare(`
          SELECT id, title, target_date
          FROM reminders
          WHERE owner_id = ? AND is_completed = 0 AND recurrence = 'none'
            AND target_date >= ? AND target_date <= ?
        `).all(user.id, todayStr, upcomingStr) as Array<{ id: string; title: string; target_date: string }>;

        for (const rem of upcomingReminders) {
          const dedupKey = `reminder-upcoming:${user.id}:${rem.id}:${rem.target_date}`;
          const res = insertStmt.run(
            randomUUID(),
            user.id,
            'reminder',
            `⏰ กำหนดการใกล้ถึง: ${rem.title}`,
            `กำหนดวันที่ ${rem.target_date}`,
            `/schedule#${rem.id}`,
            dedupKey,
            now
          );
          if (res.changes > 0) generatedCount++;
        }
      }

      // C. Unfinished Tasks (past due or due today)
      if (user.notifyTasks === 1) {
        const dueTasks = database.prepare(`
          SELECT id, title, due_date, status, priority
          FROM tasks
          WHERE owner_id = ? AND status NOT IN ('done', 'cancelled') AND due_date IS NOT NULL AND due_date != '' AND due_date <= ?
        `).all(user.id, todayStr) as Array<{ id: string; title: string; due_date: string; status: string; priority: string }>;

        for (const task of dueTasks) {
          const dedupKey = `task-due:${user.id}:${task.id}:${todayStr}`;
          const res = insertStmt.run(
            randomUUID(),
            user.id,
            'due_task',
            `⚠️ งานค้าง / ถึงกำหนดส่ง: ${task.title}`,
            `กำหนดส่ง ${task.due_date} (สถานะ: ${task.status})`,
            `/tasks#${task.id}`,
            dedupKey,
            now
          );
          if (res.changes > 0) generatedCount++;
        }
      }

      // D. Monthly Shopping List (unpurchased items)
      if (user.notifyShopping === 1) {
        const unpurchasedRow = database.prepare(`
          SELECT COUNT(*) AS count
          FROM shopping_items
          WHERE owner_id = ? AND status != 'bought'
        `).get(user.id) as { count: number } | undefined;

        const count = unpurchasedRow?.count ?? 0;
        if (count > 0) {
          const dedupKey = `shopping-monthly:${user.id}:${currentYear}-${monthStr}`;
          const res = insertStmt.run(
            randomUUID(),
            user.id,
            'system',
            `🛒 รายการซื้อของประจำเดือน`,
            `คุณมีรายการของที่ยังไม่ได้ซื้อ ${count} รายการในรายการช้อปปิ้ง`,
            `/lifestyle`,
            dedupKey,
            now
          );
          if (res.changes > 0) generatedCount++;
        }
      }
    }
  })();

  return { generatedCount };
}

/**
 * Starts the notification scheduler running periodically
 */
export function startNotificationScheduler(database: SqliteDatabase, intervalMs = 15 * 60 * 1000): void {
  // Stop existing if any
  stopNotificationScheduler();

  // Run initial cycle immediately
  try {
    runNotificationCycle(database);
  } catch (err) {
    console.error('Initial notification scheduler cycle error:', err);
  }

  activeInterval = setInterval(() => {
    try {
      runNotificationCycle(database);
    } catch (err) {
      console.error('Notification scheduler cycle error:', err);
    }
  }, intervalMs);

  // Do not hold process alive if this is the only thing running
  if (activeInterval && typeof activeInterval.unref === 'function') {
    activeInterval.unref();
  }
}

/**
 * Stops the active notification scheduler
 */
export function stopNotificationScheduler(): void {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
}
