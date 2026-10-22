import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations } from './database.js';
import { createApp } from './index.js';
import { hashPassword, createSession } from './auth.js';

const origin = 'http://localhost:80';
const csrf = { origin, 'x-pkh-request': '1' };

function setup() {
  const database = new Database(':memory:');
  database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
  database.pragma('foreign_keys = ON');
  applyMigrations(database);
  const app = createApp(database, { expectedOrigin: origin, logger: false });
  return { app, database };
}

async function createUserAndLogin(database: any, username: string) {
  const hash = await hashPassword('TestPass@123456');
  const userId = `user-${username}`;
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, username, hash, Date.now());
  const session = createSession(database, userId, Date.now());
  const cookie = `pkh_session=${session.token}`;
  return { userId, cookie };
}

describe('Lifestyle Modules Unit Tests', () => {
  it('handles Watchlist CRUD correctly', async () => {
    const { app, database } = setup();
    const user = await createUserAndLogin(database, 'movie_fan');
    const headers = { ...csrf, cookie: user.cookie };

    // Create
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers,
      payload: {
        title: 'Inception',
        type: 'movie',
        platform: 'Netflix',
        url: 'https://netflix.com/watch/123',
        status: 'want_to_watch',
        rating: 5,
        tags: 'Sci-Fi, Nolan',
        notes: 'Must watch in 4K',
      },
    });
    expect(resCreate.statusCode).toBe(201);
    const item = resCreate.json().item;
    expect(item.title).toBe('Inception');
    expect(item.rating).toBe(5);

    // List
    const resList = await app.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers,
    });
    expect(resList.statusCode).toBe(200);
    expect(resList.json().items).toHaveLength(1);

    // Update
    const resUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/watchlist/${item.id}`,
      headers,
      payload: {
        status: 'watched',
        rating: 5,
      },
    });
    expect(resUpdate.statusCode).toBe(200);
    expect(resUpdate.json().item.status).toBe('watched');

    // Delete
    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/watchlist/${item.id}`,
      headers,
    });
    expect(resDelete.statusCode).toBe(200);

    // Verify empty
    const resEmpty = await app.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers,
    });
    expect(resEmpty.json().items).toHaveLength(0);
    database.close();
  });

  it('handles Shopping CRUD and clear-bought correctly', async () => {
    const { app, database } = setup();
    const user = await createUserAndLogin(database, 'shopper');
    const headers = { ...csrf, cookie: user.cookie };

    // Add item 1 (to_buy)
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/shopping',
      headers,
      payload: {
        name: 'นมสด',
        category: 'groceries',
        quantity: 2,
        estimatedPrice: 45,
        priority: 'urgent',
      },
    });
    expect(res1.statusCode).toBe(201);
    const item1 = res1.json().item;

    // Add item 2 (to_buy)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/shopping',
      headers,
      payload: {
        name: 'สายชาร์จ Type-C',
        category: 'tech',
        quantity: 1,
        estimatedPrice: 290,
      },
    });
    expect(res2.statusCode).toBe(201);
    const item2 = res2.json().item;

    // Mark item 1 as bought
    const resPatch = await app.inject({
      method: 'PATCH',
      url: `/api/shopping/${item1.id}`,
      headers,
      payload: { status: 'bought' },
    });
    expect(resPatch.statusCode).toBe(200);

    // Clear bought items
    const resClear = await app.inject({
      method: 'POST',
      url: '/api/shopping/clear-bought',
      headers,
    });
    expect(resClear.statusCode).toBe(200);
    expect(resClear.json().deletedCount).toBe(1);

    // Remaining items should only be item 2
    const resList = await app.inject({
      method: 'GET',
      url: '/api/shopping',
      headers,
    });
    expect(resList.json().items).toHaveLength(1);
    expect(resList.json().items[0].id).toBe(item2.id);
    database.close();
  });

  it('handles Travel CRUD correctly', async () => {
    const { app, database } = setup();
    const user = await createUserAndLogin(database, 'traveler');
    const headers = { ...csrf, cookie: user.cookie };

    // Add place
    const resAdd = await app.inject({
      method: 'POST',
      url: '/api/travel',
      headers,
      payload: {
        name: 'ดอยอินทนนท์',
        category: 'nature',
        location: 'เชียงใหม่',
        estimatedBudget: 3500,
        status: 'wishlist',
      },
    });
    expect(resAdd.statusCode).toBe(201);
    const place = resAdd.json().item;

    // Patch to planned
    const resPatch = await app.inject({
      method: 'PATCH',
      url: `/api/travel/${place.id}`,
      headers,
      payload: { status: 'planned', plannedDate: 'ธันวาคม 2026' },
    });
    expect(resPatch.statusCode).toBe(200);
    expect(resPatch.json().item.status).toBe('planned');

    // Delete
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/travel/${place.id}`,
      headers,
    });
    expect(resDel.statusCode).toBe(200);
    database.close();
  });
});
