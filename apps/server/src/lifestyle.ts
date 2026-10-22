import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';

export interface WatchlistItem {
  id: string;
  ownerId: string;
  title: string;
  type: 'movie' | 'series' | 'anime' | 'variety';
  platform: string;
  url: string;
  status: 'want_to_watch' | 'watching' | 'watched';
  rating: number;
  tags: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShoppingItem {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  quantity: number;
  estimatedPrice: number;
  priority: 'urgent' | 'normal' | 'low';
  url: string;
  status: 'to_buy' | 'bought';
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface TravelPlace {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  location: string;
  mapUrl: string;
  estimatedBudget: number;
  plannedDate: string;
  status: 'wishlist' | 'planned' | 'visited';
  tags: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export function registerLifestyleRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // ==========================================
  // 1. Watchlist (หนัง/ซีรีส์/อนิเมะ/รายการ)
  // ==========================================
  app.get('/api/watchlist', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const rows = database.prepare(`
      SELECT id, owner_id AS ownerId, title, type, platform, url, status,
             rating, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM watchlist_items
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
    `).all(ownerId) as WatchlistItem[];

    return { items: rows };
  });

  app.post<{
    Body: {
      title: string;
      type?: 'movie' | 'series' | 'anime' | 'variety';
      platform?: string;
      url?: string;
      status?: 'want_to_watch' | 'watching' | 'watched';
      rating?: number;
      tags?: string;
      notes?: string;
    };
  }>('/api/watchlist', {
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255 },
          type: { type: 'string', enum: ['movie', 'series', 'anime', 'variety'] },
          platform: { type: 'string', maxLength: 100 },
          url: { type: 'string', maxLength: 2048 },
          status: { type: 'string', enum: ['want_to_watch', 'watching', 'watched'] },
          rating: { type: 'integer', minimum: 0, maximum: 5 },
          tags: { type: 'string', maxLength: 500 },
          notes: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const title = request.body.title.trim();
    if (!title) return reply.code(400).send({ error: 'กรุณาระบุชื่อเรื่อง' });

    const id = randomUUID();
    const now = Date.now();
    const type = request.body.type || 'movie';
    const platform = (request.body.platform || '').trim();
    const url = (request.body.url || '').trim();
    const status = request.body.status || 'want_to_watch';
    const rating = Math.max(0, Math.min(5, Number(request.body.rating) || 0));
    const tags = (request.body.tags || '').trim();
    const notes = (request.body.notes || '').trim();

    database.prepare(`
      INSERT INTO watchlist_items (id, owner_id, title, type, platform, url, status, rating, tags, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, type, platform, url, status, rating, tags, notes, now, now);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, title, type, platform, url, status,
             rating, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM watchlist_items WHERE id = ?
    `).get(id) as WatchlistItem;

    return reply.code(201).send({ item });
  });

  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      type?: 'movie' | 'series' | 'anime' | 'variety';
      platform?: string;
      url?: string;
      status?: 'want_to_watch' | 'watching' | 'watched';
      rating?: number;
      tags?: string;
      notes?: string;
    };
  }>('/api/watchlist/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare('SELECT id FROM watchlist_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .get(request.params.id, ownerId);
    if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการที่ต้องการแก้ไข' });

    const updates: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    if (request.body.title !== undefined) {
      const t = request.body.title.trim();
      if (!t) return reply.code(400).send({ error: 'ชื่อเรื่องต้องไม่ว่างเปล่า' });
      updates.push('title = ?');
      values.push(t);
    }
    if (request.body.type !== undefined) {
      updates.push('type = ?');
      values.push(request.body.type);
    }
    if (request.body.platform !== undefined) {
      updates.push('platform = ?');
      values.push(request.body.platform.trim());
    }
    if (request.body.url !== undefined) {
      updates.push('url = ?');
      values.push(request.body.url.trim());
    }
    if (request.body.status !== undefined) {
      updates.push('status = ?');
      values.push(request.body.status);
    }
    if (request.body.rating !== undefined) {
      updates.push('rating = ?');
      values.push(Math.max(0, Math.min(5, Number(request.body.rating) || 0)));
    }
    if (request.body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(request.body.tags.trim());
    }
    if (request.body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(request.body.notes.trim());
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(request.params.id, ownerId);

    database.prepare(`UPDATE watchlist_items SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`)
      .run(...values);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, title, type, platform, url, status,
             rating, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM watchlist_items WHERE id = ?
    `).get(request.params.id) as WatchlistItem;

    return { item };
  });

  app.delete<{ Params: { id: string } }>('/api/watchlist/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare('UPDATE watchlist_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, now, request.params.id, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการที่ต้องการลบ' });

    return { ok: true, id: request.params.id };
  });

  // ==========================================
  // 2. Shopping (ของใช้ที่ต้องซื้อ)
  // ==========================================
  app.get('/api/shopping', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const rows = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, quantity,
             estimated_price AS estimatedPrice, priority, url, status,
             notes, created_at AS createdAt, updated_at AS updatedAt
      FROM shopping_items
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY status ASC, priority DESC, created_at DESC
    `).all(ownerId) as ShoppingItem[];

    return { items: rows };
  });

  app.post<{
    Body: {
      name: string;
      category?: string;
      quantity?: number;
      estimatedPrice?: number;
      priority?: 'urgent' | 'normal' | 'low';
      url?: string;
      status?: 'to_buy' | 'bought';
      notes?: string;
    };
  }>('/api/shopping', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          category: { type: 'string', maxLength: 100 },
          quantity: { type: 'integer', minimum: 1, maximum: 10000 },
          estimatedPrice: { type: 'number', minimum: 0 },
          priority: { type: 'string', enum: ['urgent', 'normal', 'low'] },
          url: { type: 'string', maxLength: 2048 },
          status: { type: 'string', enum: ['to_buy', 'bought'] },
          notes: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: 'กรุณาระบุชื่อสิ่งของ' });

    const id = randomUUID();
    const now = Date.now();
    const category = (request.body.category || 'household').trim();
    const quantity = Math.max(1, Number(request.body.quantity) || 1);
    const estimatedPrice = Math.max(0, Number(request.body.estimatedPrice) || 0);
    const priority = request.body.priority || 'normal';
    const url = (request.body.url || '').trim();
    const status = request.body.status || 'to_buy';
    const notes = (request.body.notes || '').trim();

    database.prepare(`
      INSERT INTO shopping_items (id, owner_id, name, category, quantity, estimated_price, priority, url, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, category, quantity, estimatedPrice, priority, url, status, notes, now, now);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, quantity,
             estimated_price AS estimatedPrice, priority, url, status,
             notes, created_at AS createdAt, updated_at AS updatedAt
      FROM shopping_items WHERE id = ?
    `).get(id) as ShoppingItem;

    return reply.code(201).send({ item });
  });

  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      category?: string;
      quantity?: number;
      estimatedPrice?: number;
      priority?: 'urgent' | 'normal' | 'low';
      url?: string;
      status?: 'to_buy' | 'bought';
      notes?: string;
    };
  }>('/api/shopping/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare('SELECT id FROM shopping_items WHERE id = ? AND owner_id = ?')
      .get(request.params.id, ownerId);
    if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการที่ต้องการแก้ไข' });

    const updates: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    if (request.body.name !== undefined) {
      const n = request.body.name.trim();
      if (!n) return reply.code(400).send({ error: 'ชื่อสิ่งของต้องไม่ว่างเปล่า' });
      updates.push('name = ?');
      values.push(n);
    }
    if (request.body.category !== undefined) {
      updates.push('category = ?');
      values.push(request.body.category.trim());
    }
    if (request.body.quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(Math.max(1, Number(request.body.quantity) || 1));
    }
    if (request.body.estimatedPrice !== undefined) {
      updates.push('estimated_price = ?');
      values.push(Math.max(0, Number(request.body.estimatedPrice) || 0));
    }
    if (request.body.priority !== undefined) {
      updates.push('priority = ?');
      values.push(request.body.priority);
    }
    if (request.body.url !== undefined) {
      updates.push('url = ?');
      values.push(request.body.url.trim());
    }
    if (request.body.status !== undefined) {
      updates.push('status = ?');
      values.push(request.body.status);
    }
    if (request.body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(request.body.notes.trim());
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(request.params.id, ownerId);

    database.prepare(`UPDATE shopping_items SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`)
      .run(...values);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, quantity,
             estimated_price AS estimatedPrice, priority, url, status,
             notes, created_at AS createdAt, updated_at AS updatedAt
      FROM shopping_items WHERE id = ?
    `).get(request.params.id) as ShoppingItem;

    return { item };
  });

  app.delete<{ Params: { id: string } }>('/api/shopping/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare('UPDATE shopping_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, now, request.params.id, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการที่ต้องการลบ' });

    return { ok: true, id: request.params.id };
  });

  app.post('/api/shopping/clear-bought', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare('UPDATE shopping_items SET deleted_at = ?, updated_at = ? WHERE owner_id = ? AND status = ? AND deleted_at IS NULL')
      .run(now, now, ownerId, 'bought');

    return { ok: true, deletedCount: result.changes };
  });

  // ==========================================
  // 3. Travel (สถานที่เที่ยวที่อยากไป)
  // ==========================================
  app.get('/api/travel', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const rows = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, location, map_url AS mapUrl,
             estimated_budget AS estimatedBudget, planned_date AS plannedDate,
             status, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM travel_places
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
    `).all(ownerId) as TravelPlace[];

    return { items: rows };
  });

  app.post<{
    Body: {
      name: string;
      category?: string;
      location?: string;
      mapUrl?: string;
      estimatedBudget?: number;
      plannedDate?: string;
      status?: 'wishlist' | 'planned' | 'visited';
      tags?: string;
      notes?: string;
    };
  }>('/api/travel', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          category: { type: 'string', maxLength: 100 },
          location: { type: 'string', maxLength: 255 },
          mapUrl: { type: 'string', maxLength: 2048 },
          estimatedBudget: { type: 'number', minimum: 0 },
          plannedDate: { type: 'string', maxLength: 100 },
          status: { type: 'string', enum: ['wishlist', 'planned', 'visited'] },
          tags: { type: 'string', maxLength: 500 },
          notes: { type: 'string', maxLength: 5000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: 'กรุณาระบุชื่อสถานที่' });

    const id = randomUUID();
    const now = Date.now();
    const category = (request.body.category || 'nature').trim();
    const location = (request.body.location || '').trim();
    const mapUrl = (request.body.mapUrl || '').trim();
    const estimatedBudget = Math.max(0, Number(request.body.estimatedBudget) || 0);
    const plannedDate = (request.body.plannedDate || '').trim();
    const status = request.body.status || 'wishlist';
    const tags = (request.body.tags || '').trim();
    const notes = (request.body.notes || '').trim();

    database.prepare(`
      INSERT INTO travel_places (id, owner_id, name, category, location, map_url, estimated_budget, planned_date, status, tags, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, category, location, mapUrl, estimatedBudget, plannedDate, status, tags, notes, now, now);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, location, map_url AS mapUrl,
             estimated_budget AS estimatedBudget, planned_date AS plannedDate,
             status, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM travel_places WHERE id = ?
    `).get(id) as TravelPlace;

    return reply.code(201).send({ item });
  });

  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      category?: string;
      location?: string;
      mapUrl?: string;
      estimatedBudget?: number;
      plannedDate?: string;
      status?: 'wishlist' | 'planned' | 'visited';
      tags?: string;
      notes?: string;
    };
  }>('/api/travel/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare('SELECT id FROM travel_places WHERE id = ? AND owner_id = ?')
      .get(request.params.id, ownerId);
    if (!existing) return reply.code(404).send({ error: 'ไม่พบสถานที่ที่ต้องการแก้ไข' });

    const updates: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    if (request.body.name !== undefined) {
      const n = request.body.name.trim();
      if (!n) return reply.code(400).send({ error: 'ชื่อสถานที่ต้องไม่ว่างเปล่า' });
      updates.push('name = ?');
      values.push(n);
    }
    if (request.body.category !== undefined) {
      updates.push('category = ?');
      values.push(request.body.category.trim());
    }
    if (request.body.location !== undefined) {
      updates.push('location = ?');
      values.push(request.body.location.trim());
    }
    if (request.body.mapUrl !== undefined) {
      updates.push('map_url = ?');
      values.push(request.body.mapUrl.trim());
    }
    if (request.body.estimatedBudget !== undefined) {
      updates.push('estimated_budget = ?');
      values.push(Math.max(0, Number(request.body.estimatedBudget) || 0));
    }
    if (request.body.plannedDate !== undefined) {
      updates.push('planned_date = ?');
      values.push(request.body.plannedDate.trim());
    }
    if (request.body.status !== undefined) {
      updates.push('status = ?');
      values.push(request.body.status);
    }
    if (request.body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(request.body.tags.trim());
    }
    if (request.body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(request.body.notes.trim());
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(request.params.id, ownerId);

    database.prepare(`UPDATE travel_places SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`)
      .run(...values);

    const item = database.prepare(`
      SELECT id, owner_id AS ownerId, name, category, location, map_url AS mapUrl,
             estimated_budget AS estimatedBudget, planned_date AS plannedDate,
             status, tags, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM travel_places WHERE id = ?
    `).get(request.params.id) as TravelPlace;

    return { item };
  });

  app.delete<{ Params: { id: string } }>('/api/travel/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare('UPDATE travel_places SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, now, request.params.id, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบสถานที่ที่ต้องการลบ' });

    return { ok: true, id: request.params.id };
  });
}
