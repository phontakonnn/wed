import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const origin = 'http://localhost:80';

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

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('backup and export routes', () => {
  it('denies backup export when not logged in', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/backup/export' });
    expect(res.statusCode).toBe(401);
  });

  it('exports SQLite database snapshot as attachment', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'tester');

    const res = await app.inject({
      method: 'GET',
      url: '/api/backup/export',
      headers: { cookie: user.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/x-sqlite3');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="pkh-database-backup-.*\.sqlite3"/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('exports JSON data containing user records', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'tester');

    // Add a note
    database.prepare('INSERT INTO notes (id, owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), user.id, 'My Secret Note', 'Details', Date.now(), Date.now());

    const res = await app.inject({
      method: 'GET',
      url: '/api/backup/export-json',
      headers: { cookie: user.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const json = JSON.parse(res.payload);
    expect(json.ownerId).toBe(user.id);
    expect(json.data.notes.length).toBe(1);
    expect(json.data.notes[0].title).toBe('My Secret Note');
  });
});
