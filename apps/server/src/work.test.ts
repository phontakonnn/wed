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

/** Local calendar date, matching the server's `localToday()` rather than the UTC date. */
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

function patch(app: ReturnType<typeof createApp>, url: string, cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url, headers: { ...csrf, cookie }, payload });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('inbox', () => {
  it('requires a session and captures text or a URL without triage fields', async () => {
    const { app, database } = setup();
    expect((await app.inject({ method: 'GET', url: '/api/inbox' })).statusCode).toBe(401);
    const user = createUser(database, 'alice');

    const text = await post(app, '/api/inbox', user.cookie, { body: '  ไอเดียเรื่องที่ต้องอ่านต่อ  ' });
    expect(text.statusCode).toBe(201);
    expect(text.json().item).toMatchObject({ body: 'ไอเดียเรื่องที่ต้องอ่านต่อ', kind: 'text', status: 'new' });

    const url = await post(app, '/api/inbox', user.cookie, { body: 'https://example.com/article' });
    expect(url.json().item.kind).toBe('url');

    const empty = await post(app, '/api/inbox', user.cookie, { body: '   ' });
    expect(empty.statusCode).toBe(400);

    const list = await app.inject({ method: 'GET', url: '/api/inbox', headers: { cookie: user.cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 2, newCount: 2 });
  });

  it('updates, archives and deletes an item', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await post(app, '/api/inbox', user.cookie, { body: 'จำไว้ว่าต้องต่อประกัน' });
    const id = created.json().item.id;

    const updated = await patch(app, `/api/inbox/${id}`, user.cookie, { body: 'ต่อประกันรถ 15 พ.ย.' });
    expect(updated.json().item.body).toBe('ต่อประกันรถ 15 พ.ย.');

    const archived = await patch(app, `/api/inbox/${id}`, user.cookie, { status: 'archived' });
    expect(archived.json().item.status).toBe('archived');

    const other = createUser(database, 'bob');
    expect((await app.inject({ method: 'DELETE', url: `/api/inbox/${id}`, headers: { ...csrf, cookie: other.cookie } })).statusCode)
      .toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/inbox/${id}`, headers: { ...csrf, cookie: user.cookie } })).statusCode)
      .toBe(204);
  });

  it('converts to a note exactly once and keeps the original text', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await post(app, '/api/inbox', user.cookie, { body: 'สรุปหนังสือ Atomic Habits\nบทที่ 1' });
    const id = created.json().item.id;

    const converted = await post(app, `/api/inbox/${id}/convert`, user.cookie, { target: 'note' });
    expect(converted.statusCode).toBe(201);
    expect(converted.json().item).toMatchObject({ status: 'triaged', convertedType: 'note' });

    const note = database.prepare('SELECT title, content FROM notes WHERE id = ?')
      .get(converted.json().targetId) as { title: string; content: string };
    expect(note.title).toBe('สรุปหนังสือ Atomic Habits');
    expect(note.content).toBe('สรุปหนังสือ Atomic Habits\nบทที่ 1');

    const again = await post(app, `/api/inbox/${id}/convert`, user.cookie, { target: 'task' });
    expect(again.statusCode).toBe(409);
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE deleted_at IS NULL').get()).toEqual({ count: 0 });
  });

  it('converts to a task, a project, a bookmark and a reminder', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const taskItem = await post(app, '/api/inbox', user.cookie, { body: 'โทรหาช่างแอร์' });
    const taskResult = await post(app, `/api/inbox/${taskItem.json().item.id}/convert`, user.cookie, { target: 'task' });
    expect(taskResult.statusCode).toBe(201);
    expect(database.prepare('SELECT title, status FROM tasks').get()).toEqual({ title: 'โทรหาช่างแอร์', status: 'todo' });

    const projectItem = await post(app, '/api/inbox', user.cookie, { body: 'ปรับปรุงห้องทำงาน' });
    await post(app, `/api/inbox/${projectItem.json().item.id}/convert`, user.cookie, { target: 'project' });
    expect(database.prepare('SELECT name, status FROM projects').get()).toEqual({ name: 'ปรับปรุงห้องทำงาน', status: 'active' });

    const bookmarkItem = await post(app, '/api/inbox', user.cookie, { body: 'https://example.com/guide' });
    await post(app, `/api/inbox/${bookmarkItem.json().item.id}/convert`, user.cookie, { target: 'bookmark' });
    expect(database.prepare('SELECT url FROM bookmarks').get()).toEqual({ url: 'https://example.com/guide' });

    const reminderItem = await post(app, '/api/inbox', user.cookie, { body: 'ต่อภาษีรถ' });
    await post(app, `/api/inbox/${reminderItem.json().item.id}/convert`, user.cookie, {
      target: 'reminder',
      targetDate: '2026-11-15',
    });
    expect(database.prepare('SELECT title, target_date FROM reminders').get())
      .toEqual({ title: 'ต่อภาษีรถ', target_date: '2026-11-15' });
  });

  it('rejects a bookmark conversion without a usable URL and leaves the item untriaged', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await post(app, '/api/inbox', user.cookie, { body: 'อ่านบทความนี้' });
    const id = created.json().item.id;

    const result = await post(app, `/api/inbox/${id}/convert`, user.cookie, { target: 'bookmark' });
    expect(result.statusCode).toBe(400);
    expect(database.prepare('SELECT status, converted_id FROM inbox_items WHERE id = ?').get(id))
      .toEqual({ status: 'new', converted_id: null });
  });
});

describe('tasks', () => {
  it('creates, reads, updates and deletes a task', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const created = await post(app, '/api/tasks', user.cookie, {
      title: 'เขียนสรุปไตรมาส',
      detail: 'เริ่มจากตัวเลขยอดขาย',
      priority: 'high',
      dueDate: localIso(3),
    });
    expect(created.statusCode).toBe(201);
    const task = created.json().task;
    expect(task).toMatchObject({ title: 'เขียนสรุปไตรมาส', status: 'todo', priority: 'high', dueDate: localIso(3) });

    const read = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}`, headers: { cookie: user.cookie } });
    expect(read.statusCode).toBe(200);
    expect(read.json().checklist).toEqual([]);

    const updated = await patch(app, `/api/tasks/${task.id}`, user.cookie, { status: 'doing' });
    expect(updated.json().task.status).toBe('doing');
    expect(updated.json().task.completedAt).toBeNull();

    const done = await patch(app, `/api/tasks/${task.id}`, user.cookie, { status: 'done' });
    expect(done.json().task.completedAt).toBeTypeOf('number');

    const reopened = await patch(app, `/api/tasks/${task.id}`, user.cookie, { status: 'todo' });
    expect(reopened.json().task.completedAt).toBeNull();

    expect((await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}`, headers: { ...csrf, cookie: user.cookie } })).statusCode)
      .toBe(204);
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE deleted_at IS NULL').get()).toEqual({ count: 0 });
  });

  it('validates dates and rejects links owned by another account', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    expect((await post(app, '/api/tasks', alice.cookie, { title: 'x', dueDate: '2026-02-31' })).statusCode).toBe(400);
    expect((await post(app, '/api/tasks', alice.cookie, { title: '' })).statusCode).toBe(400);

    const bobProject = await post(app, '/api/projects', bob.cookie, { name: 'โปรเจกต์ของบ๊อบ' });
    const crossLink = await post(app, '/api/tasks', alice.cookie, {
      title: 'งานที่อ้างโปรเจกต์คนอื่น',
      projectId: bobProject.json().project.id,
    });
    expect(crossLink.statusCode).toBe(400);

    const aliceProject = await post(app, '/api/projects', alice.cookie, { name: 'โปรเจกต์ของอลิซ' });
    const own = await post(app, '/api/tasks', alice.cookie, {
      title: 'งานที่ถูกต้อง',
      projectId: aliceProject.json().project.id,
    });
    expect(own.statusCode).toBe(201);

    expect((await app.inject({ method: 'GET', url: `/api/tasks/${own.json().task.id}`, headers: { cookie: bob.cookie } })).statusCode)
      .toBe(404);
    expect((await patch(app, `/api/tasks/${own.json().task.id}`, bob.cookie, { status: 'done' })).statusCode)
      .toBe(404);
  });

  it('filters by status and due window, and groups today correctly', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    await post(app, '/api/tasks', user.cookie, { title: 'งานเกินกำหนด', dueDate: localIso(-2) });
    await post(app, '/api/tasks', user.cookie, { title: 'งานวันนี้', dueDate: localIso(0) });
    await post(app, '/api/tasks', user.cookie, { title: 'งานสัปดาห์หน้า', dueDate: localIso(5) });
    await post(app, '/api/tasks', user.cookie, { title: 'งานไม่มีกำหนด' });
    const finished = await post(app, '/api/tasks', user.cookie, { title: 'งานที่เสร็จแล้ว', dueDate: localIso(-2) });
    await patch(app, `/api/tasks/${finished.json().task.id}`, user.cookie, { status: 'done' });

    const open = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie: user.cookie } });
    expect(open.json().total).toBe(4);

    const overdue = await app.inject({ method: 'GET', url: '/api/tasks?due=overdue', headers: { cookie: user.cookie } });
    expect(overdue.json().tasks.map((task: { title: string }) => task.title)).toEqual(['งานเกินกำหนด']);

    const today = await app.inject({ method: 'GET', url: '/api/tasks?due=today', headers: { cookie: user.cookie } });
    expect(today.json().tasks.map((task: { title: string }) => task.title)).toEqual(['งานวันนี้']);

    const done = await app.inject({ method: 'GET', url: '/api/tasks?status=done', headers: { cookie: user.cookie } });
    expect(done.json().tasks.map((task: { title: string }) => task.title)).toEqual(['งานที่เสร็จแล้ว']);

    const grouped = await app.inject({ method: 'GET', url: '/api/tasks/today', headers: { cookie: user.cookie } });
    expect(grouped.json()).toMatchObject({
      today: localIso(0),
      overdue: [{ title: 'งานเกินกำหนด' }],
      dueToday: [{ title: 'งานวันนี้' }],
      upcoming: [{ title: 'งานสัปดาห์หน้า' }],
    });
  });

  it('creates the next occurrence when a recurring task is completed, exactly once', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await post(app, '/api/tasks', user.cookie, {
      title: 'ทบทวนรายสัปดาห์',
      dueDate: '2026-10-20',
      recurrence: 'weekly',
    });
    const id = created.json().task.id;

    const completed = await patch(app, `/api/tasks/${id}`, user.cookie, { status: 'done' });
    expect(completed.json().nextTask).toMatchObject({
      title: 'ทบทวนรายสัปดาห์',
      status: 'todo',
      dueDate: '2026-10-27',
      recurrence: 'weekly',
    });

    const savedAgain = await patch(app, `/api/tasks/${id}`, user.cookie, { status: 'done', title: 'ทบทวนรายสัปดาห์' });
    expect(savedAgain.json().nextTask).toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 2 });
  });

  it('clamps month-end recurrence instead of overflowing into the next month', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await post(app, '/api/tasks', user.cookie, {
      title: 'จ่ายบิล',
      dueDate: '2026-01-31',
      recurrence: 'monthly',
    });
    const completed = await patch(app, `/api/tasks/${created.json().task.id}`, user.cookie, { status: 'done' });
    expect(completed.json().nextTask.dueDate).toBe('2026-02-28');
  });

  it('manages checklist items and keeps them owner-scoped', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const other = createUser(database, 'bob');
    const task = await post(app, '/api/tasks', user.cookie, { title: 'เตรียมสัมมนา' });
    const taskId = task.json().task.id;

    const first = await post(app, `/api/tasks/${taskId}/checklist`, user.cookie, { title: 'จองห้อง' });
    expect(first.statusCode).toBe(201);
    expect(first.json().item).toMatchObject({ isDone: 0, position: 0 });

    const second = await post(app, `/api/tasks/${taskId}/checklist`, user.cookie, { title: 'ทำสไลด์' });
    expect(second.json().item.position).toBe(1);

    const toggled = await patch(app, `/api/tasks/${taskId}/checklist/${first.json().item.id}`, user.cookie, { isDone: true });
    expect(toggled.json().item.isDone).toBe(1);

    const detail = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}`, headers: { cookie: user.cookie } });
    expect(detail.json().checklist).toHaveLength(2);
    expect(detail.json().task.checklistDone).toBe(1);
    expect(detail.json().task.checklistTotal).toBe(2);
    // completing the checklist must not close the parent task
    expect(detail.json().task.status).toBe('todo');

    expect((await post(app, `/api/tasks/${taskId}/checklist`, other.cookie, { title: 'แอบเพิ่ม' })).statusCode).toBe(404);
    expect((await patch(app, `/api/tasks/${taskId}/checklist/${first.json().item.id}`, other.cookie, { isDone: false })).statusCode)
      .toBe(404);

    expect((await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}/checklist/${first.json().item.id}`,
      headers: { ...csrf, cookie: user.cookie },
    })).statusCode).toBe(204);
  });
});

describe('projects and goals', () => {
  it('tracks task counts and keeps tasks when a project is deleted', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const project = await post(app, '/api/projects', user.cookie, {
      name: 'ย้ายบ้าน',
      outcome: 'ของทุกอย่างเข้าที่ครบ',
      area: 'บ้าน',
      dueDate: '2026-12-01',
    });
    const projectId = project.json().project.id;

    await post(app, '/api/tasks', user.cookie, { title: 'หารถขนของ', projectId });
    const second = await post(app, '/api/tasks', user.cookie, { title: 'แพ็คของ', projectId });
    await patch(app, `/api/tasks/${second.json().task.id}`, user.cookie, { status: 'done' });

    const read = await app.inject({ method: 'GET', url: `/api/projects/${projectId}`, headers: { cookie: user.cookie } });
    expect(read.json().project).toMatchObject({ taskTotal: 2, taskDone: 1, outcome: 'ของทุกอย่างเข้าที่ครบ' });

    const tasks = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/tasks`, headers: { cookie: user.cookie } });
    expect(tasks.json().tasks).toHaveLength(2);

    expect((await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}`, headers: { ...csrf, cookie: user.cookie } })).statusCode)
      .toBe(204);
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 2 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(projectId)).toEqual({ count: 2 });
    await app.inject({ method: 'DELETE', url: '/api/trash/project/' + projectId + '/permanent', headers: { ...csrf, cookie: user.cookie } });
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id IS NULL').get()).toEqual({ count: 2 });
  });

  it('reports goal progress only when a target exists', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const measurable = await post(app, '/api/goals', user.cookie, {
      title: 'อ่านหนังสือ',
      metric: 'จำนวนเล่มที่อ่านจบ',
      targetValue: 24,
      currentValue: 6,
      unit: 'เล่ม',
    });
    expect(measurable.statusCode).toBe(201);
    expect(measurable.json().goal.progressPercent).toBe(25);

    const unmeasurable = await post(app, '/api/goals', user.cookie, {
      title: 'มีความสุขขึ้น',
      metric: 'บันทึกความรู้สึกสัปดาห์ละครั้ง',
    });
    expect(unmeasurable.json().goal.progressPercent).toBeNull();

    const zeroTarget = await post(app, '/api/goals', user.cookie, {
      title: 'เป้าหมายที่ตั้งไว้ผิด',
      targetValue: 0,
      currentValue: 5,
    });
    expect(zeroTarget.json().goal.progressPercent).toBeNull();

    const updated = await patch(app, `/api/goals/${measurable.json().goal.id}`, user.cookie, { currentValue: 12 });
    expect(updated.json().goal.progressPercent).toBe(50);

    const list = await app.inject({ method: 'GET', url: '/api/goals', headers: { cookie: user.cookie } });
    expect(list.json().goals).toHaveLength(3);
  });

  it('rejects a project that points at another account goal', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const goal = await post(app, '/api/goals', bob.cookie, { title: 'เป้าหมายของบ๊อบ' });

    const result = await post(app, '/api/projects', alice.cookie, {
      name: 'โปรเจกต์ที่อ้างเป้าหมายคนอื่น',
      goalId: goal.json().goal.id,
    });
    expect(result.statusCode).toBe(400);
  });
});

describe('unified search', () => {
  it('finds tasks, projects and goals by Thai text without leaking across owners', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    await post(app, '/api/tasks', alice.cookie, { title: 'จองตั๋วเครื่องบินไปเชียงใหม่' });
    await post(app, '/api/projects', alice.cookie, { name: 'ทริปเชียงใหม่', outcome: 'พักผ่อนให้เต็มที่' });
    await post(app, '/api/goals', alice.cookie, { title: 'เที่ยวให้ครบ 5 จังหวัด', metric: 'จำนวนจังหวัด' });
    await post(app, '/api/tasks', bob.cookie, { title: 'จองตั๋วเครื่องบินของบ๊อบ' });

    const result = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('เชียงใหม่')}`,
      headers: { cookie: alice.cookie },
    });
    expect(result.statusCode).toBe(200);
    const payload = result.json();
    expect(payload.tasks).toHaveLength(1);
    expect(payload.projects).toHaveLength(1);
    expect(payload.tasks[0].title).toContain('เชียงใหม่');

    const goalHit = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('จังหวัด')}`,
      headers: { cookie: alice.cookie },
    });
    expect(goalHit.json().goals).toHaveLength(1);
  });
});
