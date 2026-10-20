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

function createNote(database: SqliteDatabase, ownerId: string) {
  const id = randomUUID();
  database.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
    VALUES (?, ?, 'Note', 'Content', ?, ?)
  `).run(id, ownerId, Date.now(), Date.now());
  return id;
}

function iso(offsetDays = 0): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createPerson(app: ReturnType<typeof createApp>, cookie: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/people',
    headers: { ...csrf, cookie },
    payload: { name: 'คุณแม่', relationshipGroup: 'family', ...body },
  });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('people', () => {
  it('requires a session and validates input', async () => {
    const { app, database } = setup();
    expect((await app.inject({ method: 'GET', url: '/api/people' })).statusCode).toBe(401);
    const user = createUser(database, 'alice');
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/people',
      headers: { ...csrf, cookie: user.cookie },
      payload: { name: '', relationshipGroup: 'family' },
    });
    expect(invalid.statusCode).toBe(400);
    const badDate = await createPerson(app, user.cookie, { birthdayOrAnniversary: '2026-02-31' });
    expect(badDate.statusCode).toBe(400);
  });

  it('creates, lists, searches, updates and deletes a person', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await createPerson(app, user.cookie, {
      roleLabel: 'คุณแม่',
      birthdayOrAnniversary: '1960-05-20',
      favoritesAndLikes: 'ชอบกาแฟดำและดอกไม้สีขาว',
      allergiesAndMedical: 'แพ้กุ้ง',
    });
    expect(created.statusCode).toBe(201);
    const person = JSON.parse(created.payload).person as { id: string; name: string };
    expect(person.name).toBe('คุณแม่');

    const searched = await app.inject({
      method: 'GET',
      url: '/api/people?q=' + encodeURIComponent('กาแฟ'),
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(searched.payload).total).toBe(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/people/${person.id}`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { phone: '0800000000', giftIdeasAndSizes: 'ไซส์เสื้อ M' },
    });
    expect(updated.statusCode).toBe(200);
    expect(JSON.parse(updated.payload).person.phone).toBe('0800000000');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/people/${person.id}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({
      method: 'GET',
      url: `/api/people/${person.id}`,
      headers: { cookie: user.cookie },
    })).statusCode).toBe(404);
  });

  it('keeps people private to their owner', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const person = JSON.parse((await createPerson(app, alice.cookie, {})).payload).person as { id: string };

    const list = await app.inject({ method: 'GET', url: '/api/people', headers: { cookie: bob.cookie } });
    expect(JSON.parse(list.payload).total).toBe(0);
    expect((await app.inject({
      method: 'GET',
      url: `/api/people/${person.id}`,
      headers: { cookie: bob.cookie },
    })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'DELETE',
      url: `/api/people/${person.id}`,
      headers: { ...csrf, cookie: bob.cookie },
    })).statusCode).toBe(404);
  });
});

describe('note people links', () => {
  it('saves and returns note-person relations and rejects foreign people', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const noteId = createNote(database, alice.id);
    const person = JSON.parse((await createPerson(app, alice.cookie, {})).payload).person as { id: string };
    const bobPerson = JSON.parse((await createPerson(app, bob.cookie, { name: 'เพื่อน' })).payload).person as { id: string };

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: { ...csrf, cookie: alice.cookie },
      payload: { categoryIds: [], tagIds: [], personIds: [person.id] },
    });
    expect(saved.statusCode).toBe(204);

    const taxonomy = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: { cookie: alice.cookie },
    });
    const payload = JSON.parse(taxonomy.payload) as { people: Array<{ id: string; name: string }> };
    expect(payload.people).toEqual([{ id: person.id, name: 'คุณแม่', roleLabel: '', avatarFileId: null, avatarPreset: null }]);

    const foreign = await app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/taxonomy`,
      headers: { ...csrf, cookie: alice.cookie },
      payload: { categoryIds: [], tagIds: [], personIds: [bobPerson.id] },
    });
    expect(foreign.statusCode).toBe(400);

    database.prepare('DELETE FROM people WHERE id = ?').run(person.id);
    expect(database.prepare('SELECT COUNT(*) AS count FROM note_people').get()).toEqual({ count: 0 });
  });
});

describe('reminders', () => {
  it('creates, lists upcoming, completes and deletes reminders', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const person = JSON.parse((await createPerson(app, user.cookie, {})).payload).person as { id: string };
    const created = await app.inject({
      method: 'POST',
      url: '/api/reminders',
      headers: { ...csrf, cookie: user.cookie },
      payload: {
        title: 'วันเกิดคุณแม่',
        targetDate: iso(5),
        category: 'birthday',
        linkedPersonId: person.id,
        notifyDaysBefore: 7,
      },
    });
    expect(created.statusCode).toBe(201);
    const reminder = JSON.parse(created.payload).reminder as { id: string; linkedPersonName: string };

    const upcoming = await app.inject({
      method: 'GET',
      url: '/api/reminders/upcoming?days=10',
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(upcoming.payload).reminders).toHaveLength(1);

    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/reminders/${reminder.id}`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { isCompleted: true },
    });
    expect(JSON.parse(completed.payload).reminder.isCompleted).toBe(1);
    expect(JSON.parse((await app.inject({
      method: 'GET',
      url: '/api/reminders/upcoming?days=10',
      headers: { cookie: user.cookie },
    })).payload).reminders).toHaveLength(0);

    expect((await app.inject({
      method: 'DELETE',
      url: `/api/reminders/${reminder.id}`,
      headers: { ...csrf, cookie: user.cookie },
    })).statusCode).toBe(204);
  });

  it('rejects an invalid date and a foreign linked person', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const bobPerson = JSON.parse((await createPerson(app, bob.cookie, { name: 'เพื่อน' })).payload).person as { id: string };
    const invalidDate = await app.inject({
      method: 'POST',
      url: '/api/reminders',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { title: 'x', targetDate: '2026-13-01', category: 'other' },
    });
    expect(invalidDate.statusCode).toBe(400);
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/reminders',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { title: 'x', targetDate: iso(1), category: 'other', linkedPersonId: bobPerson.id },
    });
    expect(foreign.statusCode).toBe(400);
  });
});

describe('timeblocks and habits', () => {
  it('manages timeblocks for a date', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await app.inject({
      method: 'POST',
      url: '/api/timeblocks',
      headers: { ...csrf, cookie: user.cookie },
      payload: {
        blockDate: iso(),
        timeRange: '06:30 - 07:30',
        title: 'ออกกำลังกาย',
        lifeArea: 'health',
      },
    });
    expect(created.statusCode).toBe(201);
    const block = JSON.parse(created.payload).block as { id: string };

    const list = await app.inject({
      method: 'GET',
      url: `/api/timeblocks?date=${iso()}`,
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(list.payload).blocks).toHaveLength(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/timeblocks/${block.id}`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { isDone: true },
    });
    expect(JSON.parse(updated.payload).block.isDone).toBe(1);

    expect((await app.inject({
      method: 'DELETE',
      url: `/api/timeblocks/${block.id}`,
      headers: { ...csrf, cookie: user.cookie },
    })).statusCode).toBe(204);
  });

  it('increments habits, caps at target and keeps a streak', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const created = await app.inject({
      method: 'POST',
      url: '/api/habits',
      headers: { ...csrf, cookie: user.cookie },
      payload: { title: 'ดื่มน้ำ', dailyTarget: 3, unit: 'แก้ว' },
    });
    expect(created.statusCode).toBe(201);
    const habit = JSON.parse(created.payload).habit as { id: string };

    for (let index = 0; index < 4; index += 1) {
      const checked = await app.inject({
        method: 'POST',
        url: `/api/habits/${habit.id}/check`,
        headers: { ...csrf, cookie: user.cookie },
        payload: { date: iso() },
      });
      expect(checked.statusCode).toBe(200);
    }
    const after = await app.inject({ method: 'GET', url: '/api/habits', headers: { cookie: user.cookie } });
    const current = JSON.parse(after.payload).habits[0] as { currentCount: number; dailyTarget: number; streakDays: number };
    expect(current.currentCount).toBe(3);
    expect(current.streakDays).toBe(1);

    // Once the target is reached the log is not rewritten, so the count stays capped.
    const extra = await app.inject({
      method: 'POST',
      url: `/api/habits/${habit.id}/check`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { date: iso() },
    });
    expect(extra.statusCode).toBe(200);
    expect(JSON.parse(extra.payload).habit.currentCount).toBe(3);
    expect(database.prepare('SELECT COUNT(*) AS count FROM habit_logs').get()).toEqual({ count: 1 });

    // Recording a future day is refused: the system cannot know what happened tomorrow.
    const future = await app.inject({
      method: 'POST',
      url: `/api/habits/${habit.id}/check`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { date: iso(1) },
    });
    expect(future.statusCode).toBe(400);
  });
});

describe('command palette search', () => {
  it('finds notes, people likes/allergies and reminders', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const noteId = createNote(database, user.id);
    database.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ?')
      .run('ร้านกาแฟโปรด', 'กาแฟดำ', noteId);
    await createPerson(app, user.cookie, {
      name: 'คุณแม่',
      favoritesAndLikes: 'ชอบกาแฟดำ',
      allergiesAndMedical: 'แพ้กุ้ง',
    });
    await app.inject({
      method: 'POST',
      url: '/api/reminders',
      headers: { ...csrf, cookie: user.cookie },
      payload: { title: 'วันเกิดคุณแม่', targetDate: iso(10), category: 'birthday' },
    });

    for (const query of ['กาแฟ', 'กุ้ง', 'วันเกิด']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/search?q=${encodeURIComponent(query)}`,
        headers: { cookie: user.cookie },
      });
      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload) as {
        notes: unknown[]; people: unknown[]; reminders: unknown[];
      };
      expect(payload.notes.length + payload.people.length + payload.reminders.length).toBeGreaterThan(0);
    }

    const allergy = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('กุ้ง')}`,
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(allergy.payload).people).toHaveLength(1);
  });
});
