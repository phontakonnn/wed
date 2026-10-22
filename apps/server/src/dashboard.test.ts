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

function post(app: ReturnType<typeof createApp>, url: string, cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { ...csrf, cookie }, payload });
}

function dashboard(app: ReturnType<typeof createApp>, cookie: string) {
  return app.inject({ method: 'GET', url: '/api/dashboard', headers: { cookie } });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('dashboard', () => {
  it('requires a session', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'GET', url: '/api/dashboard' })).statusCode).toBe(401);
  });

  it('returns an empty but well-formed payload for a new account', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const result = await dashboard(app, user.cookie);
    expect(result.statusCode).toBe(200);
    const body = result.json();
    expect(body.today).toBe(localIso(0));
    expect(body.tasks).toEqual({ dueToday: [], overdue: [] });
    expect(body.timeblocks).toEqual({ blocks: [], done: 0, total: 0 });
    expect(body.inbox).toEqual({ newCount: 0, items: [] });
    expect(body.counts).toMatchObject({
      dueToday: 0, overdue: 0, openTasks: 0, reminders: 0, inbox: 0,
      projects: 0, goals: 0, habitsOutstanding: 0, notes: 0,
    });
  });

  it('counts only real rows for the signed-in owner', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    await post(app, '/api/tasks', alice.cookie, { title: 'งานวันนี้', dueDate: localIso(0) });
    await post(app, '/api/tasks', alice.cookie, { title: 'งานเกินกำหนด', dueDate: localIso(-3) });
    await post(app, '/api/tasks', alice.cookie, { title: 'งานไม่มีกำหนด' });
    const done = await post(app, '/api/tasks', alice.cookie, { title: 'งานเสร็จแล้ว', dueDate: localIso(-1) });
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${done.json().task.id}`,
      headers: { ...csrf, cookie: alice.cookie },
      payload: { status: 'done' },
    });
    await post(app, '/api/inbox', alice.cookie, { body: 'จดไว้ก่อน' });

    // Bob's data must never appear in Alice's dashboard.
    await post(app, '/api/tasks', bob.cookie, { title: 'งานของบ๊อบ', dueDate: localIso(0) });
    await post(app, '/api/inbox', bob.cookie, { body: 'ของบ๊อบ' });

    const body = (await dashboard(app, alice.cookie)).json();
    expect(body.tasks.dueToday.map((task: { title: string }) => task.title)).toEqual(['งานวันนี้']);
    expect(body.tasks.overdue.map((task: { title: string }) => task.title)).toEqual(['งานเกินกำหนด']);
    expect(body.counts.openTasks).toBe(3);
    expect(body.counts.inbox).toBe(1);
    expect(body.inbox.items).toHaveLength(1);
  });

  it('shows timeblock progress for today only', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    await post(app, '/api/timeblocks', user.cookie, { blockDate: localIso(0), timeRange: '06:30 - 07:30', title: 'วิ่ง', lifeArea: 'health' });
    const second = await post(app, '/api/timeblocks', user.cookie, { blockDate: localIso(0), timeRange: '08:00 - 09:00', title: 'อ่านหนังสือ', lifeArea: 'growth' });
    await post(app, '/api/timeblocks', user.cookie, { blockDate: localIso(1), timeRange: '08:00 - 09:00', title: 'พรุ่งนี้', lifeArea: 'growth' });
    await app.inject({
      method: 'PATCH',
      url: `/api/timeblocks/${second.json().block.id}`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { isDone: true },
    });

    const body = (await dashboard(app, user.cookie)).json();
    expect(body.timeblocks.total).toBe(2);
    expect(body.timeblocks.done).toBe(1);
    expect(body.timeblocks.blocks.map((block: { title: string }) => block.title)).toEqual(['วิ่ง', 'อ่านหนังสือ']);
  });

  it('never invents a goal percentage without a usable target', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    await post(app, '/api/goals', user.cookie, { title: 'อ่านหนังสือ', targetValue: 24, currentValue: 6, unit: 'เล่ม' });
    await post(app, '/api/goals', user.cookie, { title: 'มีความสุขขึ้น', metric: 'จดบันทึกทุกสัปดาห์' });
    await post(app, '/api/goals', user.cookie, { title: 'เป้าหมายผิด', targetValue: 0, currentValue: 4 });

    const body = (await dashboard(app, user.cookie)).json();
    const byTitle = Object.fromEntries(
      body.goals.map((goal: { title: string; progressPercent: number | null }) => [goal.title, goal.progressPercent]),
    );
    expect(byTitle['อ่านหนังสือ']).toBe(25);
    expect(byTitle['มีความสุขขึ้น']).toBeNull();
    expect(byTitle['เป้าหมายผิด']).toBeNull();
  });

  it('lists only habits that are still outstanding today', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const water = await post(app, '/api/habits', user.cookie, { title: 'ดื่มน้ำ', dailyTarget: 2, unit: 'แก้ว' });
    await post(app, '/api/habits', user.cookie, { title: 'อ่านหนังสือ', dailyTarget: 1, unit: 'ครั้ง' });
    await post(app, `/api/habits/${water.json().habit.id}/check`, user.cookie, {});
    await post(app, `/api/habits/${water.json().habit.id}/check`, user.cookie, {});

    const body = (await dashboard(app, user.cookie)).json();
    expect(body.habits.map((habit: { title: string }) => habit.title)).toEqual(['อ่านหนังสือ']);
    expect(body.counts.habitsOutstanding).toBe(1);
  });

  it('reports the weekly habit summary from real logs', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const habit = await post(app, '/api/habits', user.cookie, { title: 'เดิน', dailyTarget: 1, unit: 'ครั้ง' });

    // Backdate the tracking window so past days are inside it, then log two of them.
    database.prepare('UPDATE habits SET tracking_start_date = ? WHERE id = ?')
      .run(localIso(-5), habit.json().habit.id);
    for (const offset of [-2, -1]) {
      await app.inject({
        method: 'PUT',
        url: `/api/habits/${habit.json().habit.id}/logs/${localIso(offset)}`,
        headers: { ...csrf, cookie: user.cookie },
        payload: { count: 1 },
      });
    }

    const body = (await dashboard(app, user.cookie)).json();
    const entry = body.habits.find((item: { id: string }) => item.id === habit.json().habit.id);
    expect(entry).toMatchObject({ weekLogged: 2, weekMetTarget: 2 });
  });

  it('lists active projects with real task counts and recent notes', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const project = await post(app, '/api/projects', user.cookie, { name: 'ย้ายบ้าน' });
    await post(app, '/api/tasks', user.cookie, { title: 'แพ็คของ', projectId: project.json().project.id });
    await post(app, '/api/tasks', user.cookie, { title: 'หารถ', projectId: project.json().project.id });
    await post(app, '/api/notes', user.cookie, { title: 'โน้ตล่าสุด', content: 'เนื้อหา' });

    const body = (await dashboard(app, user.cookie)).json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({ name: 'ย้ายบ้าน', taskTotal: 2, taskDone: 0 });
    expect(body.notes[0].title).toBe('โน้ตล่าสุด');
    expect(body.counts.projects).toBe(1);
  });
});
