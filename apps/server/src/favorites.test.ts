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

function insertNote(database: SqliteDatabase, ownerId: string, id = randomUUID()) {
  database.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, 'Favorite note', 'Body', Date.now(), Date.now());
  return id;
}

function insertBookmark(database: SqliteDatabase, ownerId: string, id = randomUUID()) {
  database.prepare(`
    INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, 'Favorite bookmark', 'https://example.com', '', Date.now(), Date.now());
  return id;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('favorites', () => {
  it('denies anonymous access and requires the CSRF header for mutations', async () => {
    const { app, database } = setup();
    const anonymous = await app.inject({ method: 'GET', url: '/api/favorites' });
    expect(anonymous.statusCode).toBe(401);

    const user = createUser(database, 'alice');
    const noteId = insertNote(database, user.id);
    const withoutCsrf = await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${noteId}`,
      headers: { cookie: user.cookie },
    });
    expect(withoutCsrf.statusCode).toBe(403);
  });

  it('adds a note favorite idempotently and reports its status', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const noteId = insertNote(database, user.id);

    const first = await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    const second = await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);

    const status = await app.inject({
      method: 'GET',
      url: `/api/favorites/note/${noteId}`,
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(status.payload)).toEqual({ favorited: true });

    const list = await app.inject({ method: 'GET', url: '/api/favorites', headers: { cookie: user.cookie } });
    const payload = JSON.parse(list.payload) as { favorites: Array<{ itemId: string; title: string }>; total: number };
    expect(payload.total).toBe(1);
    expect(payload.favorites[0]).toMatchObject({ itemId: noteId, title: 'Favorite note' });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(removed.statusCode).toBe(204);
    const afterRemoval = await app.inject({
      method: 'GET',
      url: `/api/favorites/note/${noteId}`,
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(afterRemoval.payload)).toEqual({ favorited: false });
  });

  it('rejects favorites for missing or other-owner targets', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const bobNote = insertNote(database, bob.id);

    const missing = await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${randomUUID()}`,
      headers: { ...csrf, cookie: alice.cookie },
    });
    const otherOwner = await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${bobNote}`,
      headers: { ...csrf, cookie: alice.cookie },
    });

    expect(missing.statusCode).toBe(404);
    expect(otherOwner.statusCode).toBe(404);
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 0 });
  });

  it('keeps favorites private to their owner', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const noteId = insertNote(database, alice.id);

    await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: alice.cookie },
    });

    const bobList = await app.inject({ method: 'GET', url: '/api/favorites', headers: { cookie: bob.cookie } });
    expect(JSON.parse(bobList.payload).total).toBe(0);

    const bobStatus = await app.inject({
      method: 'GET',
      url: `/api/favorites/note/${noteId}`,
      headers: { cookie: bob.cookie },
    });
    expect(JSON.parse(bobStatus.payload)).toEqual({ favorited: false });

    const bobDelete = await app.inject({
      method: 'DELETE',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: bob.cookie },
    });
    expect(bobDelete.statusCode).toBe(404);
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 1 });
  });

  it('lists bookmark favorites with their URL as the subtitle', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const bookmarkId = insertBookmark(database, user.id);

    await app.inject({
      method: 'PUT',
      url: `/api/favorites/bookmark/${bookmarkId}`,
      headers: { ...csrf, cookie: user.cookie },
    });

    const list = await app.inject({ method: 'GET', url: '/api/favorites', headers: { cookie: user.cookie } });
    const payload = JSON.parse(list.payload) as {
      favorites: Array<{ itemType: string; itemId: string; subtitle: string }>;
    };
    expect(payload.favorites).toHaveLength(1);
    expect(payload.favorites[0]).toMatchObject({
      itemType: 'bookmark',
      itemId: bookmarkId,
      subtitle: 'https://example.com',
    });
  });

  it('hides a favorited note while it is in the trash and shows it again after restore', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const noteId = insertNote(database, user.id);
    await app.inject({
      method: 'PUT',
      url: `/api/favorites/note/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });

    const trashed = await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(trashed.statusCode).toBe(204);

    const hidden = await app.inject({ method: 'GET', url: '/api/favorites', headers: { cookie: user.cookie } });
    expect(JSON.parse(hidden.payload).total).toBe(0);
    // The relation is retained, not deleted, so restore brings it back without re-favoriting.
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 1 });

    const restored = await app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/restore`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(restored.statusCode).toBe(200);

    const visible = await app.inject({ method: 'GET', url: '/api/favorites', headers: { cookie: user.cookie } });
    expect(JSON.parse(visible.payload).total).toBe(1);
  });

  it('removes favorites when the target is permanently deleted', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const noteId = insertNote(database, user.id);
    const bookmarkId = insertBookmark(database, user.id);

    for (const [type, id] of [['note', noteId], ['bookmark', bookmarkId]] as const) {
      await app.inject({
        method: 'PUT',
        url: `/api/favorites/${type}/${id}`,
        headers: { ...csrf, cookie: user.cookie },
      });
    }
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 2 });

    database.prepare('DELETE FROM bookmarks WHERE id = ?').run(bookmarkId);
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 1 });

    await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/permanent`,
      headers: { ...csrf, cookie: user.cookie },
      payload: { confirm: true },
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 0 });
  });

  it('paginates the favorite list and validates the item type', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    for (let index = 0; index < 3; index += 1) {
      const noteId = insertNote(database, user.id);
      await app.inject({
        method: 'PUT',
        url: `/api/favorites/note/${noteId}`,
        headers: { ...csrf, cookie: user.cookie },
      });
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/favorites?page=1&pageSize=2',
      headers: { cookie: user.cookie },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/favorites?page=2&pageSize=2',
      headers: { cookie: user.cookie },
    });
    expect(JSON.parse(first.payload).favorites).toHaveLength(2);
    expect(JSON.parse(second.payload).favorites).toHaveLength(1);

    const invalidType = await app.inject({
      method: 'GET',
      url: `/api/favorites/other/${randomUUID()}`,
      headers: { cookie: user.cookie },
    });
    expect(invalidType.statusCode).toBe(400);
  });
});
