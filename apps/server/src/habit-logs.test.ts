import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const origin = 'http://localhost:80';
const csrf = { origin, 'x-pkh-request': '1' };

function setup() {
  const database = openDatabase(':memory:');
  const app = createApp(database, { expectedOrigin: origin, logger: false, sleep: async () => undefined });
  databases.push(database);
  apps.push(app);
  return { app, database };
}

function createUser(database: SqliteDatabase, username: string) {
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, 'test-hash', Date.now());
  const session = createSession(database, id);
  return { id, cookie: `pkh_session=${session.token}` };
}

function localIso(offsetDays = 0): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function createHabit(
  app: ReturnType<typeof createApp>,
  cookie: string,
  body: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/habits',
    headers: { ...csrf, cookie },
    payload: { title: 'ดื่มน้ำ', dailyTarget: 8, unit: 'แก้ว', ...body },
  });
  expect(response.statusCode).toBe(201);
  return response.json().habit as { id: string; trackingStartDate: string | null };
}

function check(app: ReturnType<typeof createApp>, cookie: string, habitId: string, date?: string) {
  return app.inject({
    method: 'POST',
    url: `/api/habits/${habitId}/check`,
    headers: { ...csrf, cookie },
    payload: date ? { date } : {},
  });
}

function setLog(
  app: ReturnType<typeof createApp>,
  cookie: string,
  habitId: string,
  date: string,
  count: number,
) {
  return app.inject({
    method: 'PUT',
    url: `/api/habits/${habitId}/logs/${date}`,
    headers: { ...csrf, cookie },
    payload: { count },
  });
}

/** Models a habit that has existed for a while, so past days are inside its tracking window. */
function backdate(database: SqliteDatabase, habitId: string, days: number) {
  database.prepare('UPDATE habits SET tracking_start_date = ? WHERE id = ?')
    .run(localIso(-days), habitId);
}

function history(app: ReturnType<typeof createApp>, cookie: string, habitId: string, query = '') {
  return app.inject({
    method: 'GET',
    url: `/api/habits/${habitId}/history${query}`,
    headers: { cookie },
  });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('habit logs', () => {
  it('records one log per day and increments it instead of duplicating', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie);

    await check(app, user.cookie, habit.id);
    await check(app, user.cookie, habit.id);
    const third = await check(app, user.cookie, habit.id);

    expect(third.statusCode).toBe(200);
    expect(third.json().habit.currentCount).toBe(3);
    expect(third.json().log).toMatchObject({ count: 3, logDate: localIso(0) });
    expect(database.prepare('SELECT COUNT(*) AS count FROM habit_logs').get()).toEqual({ count: 1 });
  });

  it('caps the counter at the daily target and stops writing once it is reached', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie, { dailyTarget: 2 });

    await check(app, user.cookie, habit.id);
    await check(app, user.cookie, habit.id);
    const extra = await check(app, user.cookie, habit.id);

    expect(extra.json().habit.currentCount).toBe(2);
    expect(database.prepare('SELECT count FROM habit_logs').get()).toEqual({ count: 2 });
  });

  it('sets an exact count, deletes on zero, and keeps a single row per day', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie);

    const set = await setLog(app, user.cookie, habit.id, localIso(0), 5);
    expect(set.statusCode).toBe(200);
    expect(set.json().habit.currentCount).toBe(5);

    await setLog(app, user.cookie, habit.id, localIso(0), 3);
    expect(database.prepare('SELECT COUNT(*) AS count FROM habit_logs').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT count FROM habit_logs').get()).toEqual({ count: 3 });

    const cleared = await setLog(app, user.cookie, habit.id, localIso(0), 0);
    expect(cleared.json().log).toBeNull();
    expect(cleared.json().habit.currentCount).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM habit_logs').get()).toEqual({ count: 0 });
  });

  it('recomputes the streak from logs when a past day is corrected', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie, { dailyTarget: 1 });
    backdate(database, habit.id, 5);

    await setLog(app, user.cookie, habit.id, localIso(-2), 1);
    await setLog(app, user.cookie, habit.id, localIso(-1), 1);
    const today = await setLog(app, user.cookie, habit.id, localIso(0), 1);
    expect(today.json().habit.streakDays).toBe(3);

    // Correcting yesterday to zero must break the run immediately, not on the next check.
    const corrected = await setLog(app, user.cookie, habit.id, localIso(-1), 0);
    expect(corrected.json().habit.streakDays).toBe(1);
    expect(corrected.json().habit.currentCount).toBe(1);

    // Restoring it brings the streak back, proving it is derived and not incremental.
    const restored = await setLog(app, user.cookie, habit.id, localIso(-1), 1);
    expect(restored.json().habit.streakDays).toBe(3);
  });

  it('does not break a streak just because today is not finished', async () => {
    const { app, database } = setup();
    const owner = createUser(database, 'bob');
    const habit = await createHabit(app, owner.cookie, { dailyTarget: 2 });
    backdate(database, habit.id, 5);

    await setLog(app, owner.cookie, habit.id, localIso(-2), 2);
    await setLog(app, owner.cookie, habit.id, localIso(-1), 2);
    const partial = await setLog(app, owner.cookie, habit.id, localIso(0), 1);

    expect(partial.json().habit.currentCount).toBe(1);
    expect(partial.json().habit.streakDays).toBe(2);
  });

  it('reports days before the tracking start as unknown rather than as failures', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie);

    const result = await history(app, user.cookie, habit.id, '?days=5');
    expect(result.statusCode).toBe(200);
    const body = result.json();
    expect(body.trackingStartDate).toBe(localIso(0));

    const before = body.days.filter((day: { date: string }) => day.date < localIso(0));
    expect(before.length).toBeGreaterThan(0);
    for (const day of before) {
      expect(day.count).toBeNull();
      expect(day.metTarget).toBeNull();
    }
    const todayRow = body.days.find((day: { date: string }) => day.date === localIso(0));
    expect(todayRow).toMatchObject({ count: 0, metTarget: false });
  });

  it('summarises weekly and monthly progress from the logs', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie, { dailyTarget: 1 });
    backdate(database, habit.id, 5);

    await setLog(app, user.cookie, habit.id, localIso(-1), 1);
    await setLog(app, user.cookie, habit.id, localIso(0), 1);

    const body = (await history(app, user.cookie, habit.id, '?days=7')).json();
    expect(body.summary.weekly.daysMetTarget).toBe(2);
    expect(body.summary.daysLogged).toBe(2);
    expect(body.summary.currentStreak).toBe(2);
    expect(body.summary.bestStreak).toBe(2);
  });

  it('rejects future dates and dates before the tracking start', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie);

    expect((await check(app, user.cookie, habit.id, localIso(1))).statusCode).toBe(400);
    expect((await setLog(app, user.cookie, habit.id, localIso(1), 1)).statusCode).toBe(400);
    expect((await setLog(app, user.cookie, habit.id, localIso(-3), 1)).statusCode).toBe(400);
  });

  it('keeps logs owner-scoped in the handler and in the database', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const habit = await createHabit(app, alice.cookie);

    expect((await check(app, bob.cookie, habit.id)).statusCode).toBe(404);
    expect((await setLog(app, bob.cookie, habit.id, localIso(0), 1)).statusCode).toBe(404);
    expect((await history(app, bob.cookie, habit.id)).statusCode).toBe(404);

    expect(() => database.prepare(`
      INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), bob.id, habit.id, localIso(0), 1, 8, 1, 1)).toThrow(/owner mismatch/);
  });

  it('rejects a duplicate log for the same day at the database level', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie);
    await setLog(app, user.cookie, habit.id, localIso(0), 2);

    expect(() => database.prepare(`
      INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), user.id, habit.id, localIso(0), 1, 8, 1, 1)).toThrow(/UNIQUE/);
  });

  it('preserves the pre-history counters separately from verified history', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await createHabit(app, user.cookie, { dailyTarget: 1 });

    // Simulate a habit that was migrated from the counter-only era.
    database.prepare(`
      UPDATE habits SET legacy_current_count = 5, legacy_streak_days = 12,
        current_count = 0, streak_days = 0 WHERE id = ?
    `).run(habit.id);

    await setLog(app, user.cookie, habit.id, localIso(0), 1);
    const body = (await history(app, user.cookie, habit.id, '?days=3')).json();
    expect(body.habit.legacyStreakDays).toBe(12);
    expect(body.habit.legacyCurrentCount).toBe(5);
    // The verified streak counts only days with a real log.
    expect(body.habit.streakDays).toBe(1);
    expect(body.summary.bestStreak).toBe(1);
  });
});
