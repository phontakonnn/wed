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

async function createReminder(
  app: ReturnType<typeof createApp>,
  cookie: string,
  body: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/reminders',
    headers: { ...csrf, cookie },
    payload: { title: 'ต่อประกันรถ', targetDate: '2026-01-31', category: 'other', ...body },
  });
  expect(response.statusCode).toBe(201);
  return response.json().reminder as {
    id: string;
    targetDate: string;
    recurrence: string;
    recurrenceAnchorDate: string | null;
    snoozedUntil: string | null;
    effectiveDate: string;
    isCompleted: number;
  };
}

function patch(
  app: ReturnType<typeof createApp>,
  cookie: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'PATCH',
    url: `/api/reminders/${id}`,
    headers: { ...csrf, cookie },
    payload,
  });
}

function snooze(
  app: ReturnType<typeof createApp>,
  cookie: string,
  id: string,
  days: number,
  from?: string,
) {
  return app.inject({
    method: 'POST',
    url: `/api/reminders/${id}/snooze`,
    headers: { ...csrf, cookie },
    payload: from ? { days, from } : { days },
  });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('reminder recurrence', () => {
  it('stores an anchor for recurring reminders and none for one-off reminders', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const once = await createReminder(app, user.cookie, { targetDate: '2026-03-10' });
    expect(once.recurrence).toBe('none');
    expect(once.recurrenceAnchorDate).toBeNull();

    const monthly = await createReminder(app, user.cookie, { targetDate: '2026-01-31', recurrence: 'monthly' });
    expect(monthly.recurrence).toBe('monthly');
    expect(monthly.recurrenceAnchorDate).toBe('2026-01-31');
  });

  it('rolls a weekly reminder forward instead of creating a second row', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-05-04', recurrence: 'weekly' });

    const first = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(first.statusCode).toBe(200);
    expect(first.json().rolledTo).toBe('2026-05-11');
    expect(first.json().reminder).toMatchObject({ targetDate: '2026-05-11', isCompleted: 0 });

    const second = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(second.json().rolledTo).toBe('2026-05-18');
    expect(database.prepare('SELECT COUNT(*) AS count FROM reminders').get()).toEqual({ count: 1 });
  });

  it('advances daily reminders by one day', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-02-27', recurrence: 'daily' });
    const result = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(result.json().reminder.targetDate).toBe('2026-02-28');
  });

  it('clamps a monthly reminder at month end but returns to the anchor day', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-01-31', recurrence: 'monthly' });

    const february = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(february.json().reminder.targetDate).toBe('2026-02-28');

    // March must go back to the 31st, not drift to the 28th.
    const march = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(march.json().reminder.targetDate).toBe('2026-03-31');
  });

  it('handles 29 February across leap and non-leap years', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2028-02-29', recurrence: 'yearly' });

    const nonLeap = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(nonLeap.json().reminder.targetDate).toBe('2029-02-28');

    const back = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(back.json().reminder.targetDate).toBe('2030-02-28');
  });

  it('closes a one-off reminder and clears its completion when reopened', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-03-10' });

    const done = await patch(app, user.cookie, reminder.id, { isCompleted: true });
    expect(done.json().reminder.isCompleted).toBe(1);
    expect(done.json().rolledTo).toBeNull();

    const reopened = await patch(app, user.cookie, reminder.id, { isCompleted: false });
    expect(reopened.json().reminder.isCompleted).toBe(0);
    expect(reopened.json().reminder.lastCompletedAt).toBeNull();
  });
});

describe('reminder snooze', () => {
  it('moves the effective date without touching the target or the anchor', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-04-30', recurrence: 'monthly' });

    const first = await snooze(app, user.cookie, reminder.id, 1, '2026-04-30');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ snoozedFrom: '2026-04-30', snoozedUntil: '2026-05-01' });
    expect(first.json().reminder).toMatchObject({
      targetDate: '2026-04-30',
      recurrenceAnchorDate: '2026-04-30',
      snoozedUntil: '2026-05-01',
      effectiveDate: '2026-05-01',
    });

    const second = await snooze(app, user.cookie, reminder.id, 3, '2026-05-01');
    expect(second.json().snoozedUntil).toBe('2026-05-04');
    expect(second.json().reminder.targetDate).toBe('2026-04-30');
  });

  it('supports +1 day, +3 days and +1 week', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    for (const [days, expected] of [[1, '2026-06-11'], [3, '2026-06-13'], [7, '2026-06-17']] as const) {
      const reminder = await createReminder(app, user.cookie, { targetDate: '2026-06-10' });
      const result = await snooze(app, user.cookie, reminder.id, days, '2026-06-10');
      expect(result.json().snoozedUntil).toBe(expected);
    }
  });

  it('rejects a retried snooze instead of moving the date twice', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-07-01' });

    await snooze(app, user.cookie, reminder.id, 1, '2026-07-01');
    const retry = await snooze(app, user.cookie, reminder.id, 1, '2026-07-01');
    expect(retry.statusCode).toBe(409);
    expect(retry.json().reminder.snoozedUntil).toBe('2026-07-02');
  });

  it('refuses to snooze a completed reminder', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-07-01' });
    await patch(app, user.cookie, reminder.id, { isCompleted: true });

    expect((await snooze(app, user.cookie, reminder.id, 1)).statusCode).toBe(409);
  });

  it('clears a snooze when a recurring reminder is completed, and advances from the target', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: '2026-08-01', recurrence: 'weekly' });

    await snooze(app, user.cookie, reminder.id, 3, '2026-08-01');
    const completed = await patch(app, user.cookie, reminder.id, { isCompleted: true });

    // The recurrence anchor decides the next date, not the snoozed one.
    expect(completed.json().reminder).toMatchObject({
      targetDate: '2026-08-08',
      snoozedUntil: null,
      effectiveDate: '2026-08-08',
      isCompleted: 0,
    });
  });

  it('uses the snoozed date in the upcoming window', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const reminder = await createReminder(app, user.cookie, { targetDate: localIso(0) });

    const before = await app.inject({ method: 'GET', url: '/api/reminders/upcoming?days=3', headers: { cookie: user.cookie } });
    expect(before.json().reminders).toHaveLength(1);

    await snooze(app, user.cookie, reminder.id, 7, localIso(0));

    const after = await app.inject({ method: 'GET', url: '/api/reminders/upcoming?days=3', headers: { cookie: user.cookie } });
    expect(after.json().reminders).toHaveLength(0);

    const wider = await app.inject({ method: 'GET', url: '/api/reminders/upcoming?days=10', headers: { cookie: user.cookie } });
    expect(wider.json().reminders).toHaveLength(1);
    expect(wider.json().reminders[0].effectiveDate).toBe(localIso(7));
  });

  it('keeps snooze owner-scoped', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const reminder = await createReminder(app, alice.cookie, { targetDate: '2026-09-01' });

    expect((await snooze(app, bob.cookie, reminder.id, 1)).statusCode).toBe(404);
  });
});
