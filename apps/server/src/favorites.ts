import { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export const ALL_FAVORITE_TYPES = [
  'note',
  'bookmark',
  'task',
  'project',
  'goal',
  'person',
  'file',
  'vault',
  'library',
  'watchlist',
  'shopping',
  'travel',
  'custom_record',
] as const;

export type FavoriteItemType = typeof ALL_FAVORITE_TYPES[number];

export const favoriteTypes = new Set<string>(ALL_FAVORITE_TYPES);

export function favoriteTargetExists(database: Database.Database, ownerId: string, itemType: string, itemId: string): boolean {
  switch (itemType) {
    case 'note':
      return database.prepare('SELECT 1 FROM notes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'bookmark':
      return database.prepare('SELECT 1 FROM bookmarks WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'task':
      return database.prepare('SELECT 1 FROM tasks WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'project':
      return database.prepare('SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'goal':
      return database.prepare('SELECT 1 FROM goals WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'person':
      return database.prepare('SELECT 1 FROM people WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'file':
      return database.prepare('SELECT 1 FROM files WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'vault':
      return database.prepare('SELECT 1 FROM vault_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'library':
      return database.prepare('SELECT 1 FROM library_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'watchlist':
      return database.prepare('SELECT 1 FROM watchlist_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'shopping':
      return database.prepare('SELECT 1 FROM shopping_items WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'travel':
      return database.prepare('SELECT 1 FROM travel_places WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    case 'custom_record':
      return database.prepare('SELECT 1 FROM custom_data_records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(itemId, ownerId) !== undefined;
    default:
      return false;
  }
}

export function registerUniversalFavoritesRoutes(app: FastifyInstance, database: Database.Database): void {
  // Collections routes - supporting both /api/favorites/collections and /api/favorite-collections
  const getCollectionsHandler = async (request: any, reply: any) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const collections = database.prepare(`
      SELECT c.id, c.owner_id AS ownerId, c.owner_id AS userId, c.name, c.icon, c.color,
             c.created_at AS createdAt, c.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM favorites f WHERE f.collection_id = c.id AND f.owner_id = c.owner_id) AS itemCount
      FROM favorite_collections c
      WHERE c.owner_id = ?
      ORDER BY c.created_at ASC
    `).all(ownerId);

    return { collections };
  };

  app.get('/api/favorites/collections', getCollectionsHandler);
  app.get('/api/favorite-collections', getCollectionsHandler);

  const postCollectionsHandler = async (request: any, reply: any) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { name, icon = '📁', color = '#3B82F6' } = request.body || {};
    if (!name || !name.trim()) return reply.code(400).send({ error: 'กรุณาระบุชื่อแฟ้มรายการโปรด' });

    const id = randomUUID();
    const now = Date.now();

    database.prepare(`
      INSERT INTO favorite_collections (id, owner_id, name, icon, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name.trim(), icon, color, now, now);

    const createdCol = {
      id,
      ownerId,
      userId: ownerId,
      name: name.trim(),
      icon,
      color,
      createdAt: now,
      updatedAt: now,
    };

    return reply.code(201).send({
      ok: true,
      collection: createdCol,
      ...createdCol,
    });
  };

  app.post('/api/favorites/collections', postCollectionsHandler);
  app.post('/api/favorite-collections', postCollectionsHandler);

  const putCollectionsHandler = async (request: any, reply: any) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare('SELECT * FROM favorite_collections WHERE id = ? AND owner_id = ?').get(request.params.id, ownerId) as any;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบแฟ้มรายการโปรด' });

    const { name = existing.name, icon = existing.icon, color = existing.color } = request.body || {};
    const now = Date.now();

    database.prepare(`
      UPDATE favorite_collections SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ? AND owner_id = ?
    `).run(name.trim(), icon, color, now, request.params.id, ownerId);

    const updatedCol = {
      id: request.params.id,
      ownerId,
      userId: ownerId,
      name: name.trim(),
      icon,
      color,
      updatedAt: now,
    };

    return { ok: true, id: request.params.id, collection: updatedCol };
  };

  app.put('/api/favorites/collections/:id', putCollectionsHandler);
  app.put('/api/favorite-collections/:id', putCollectionsHandler);

  const deleteCollectionsHandler = async (request: any, reply: any) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const result = database.prepare('DELETE FROM favorite_collections WHERE id = ? AND owner_id = ?').run(request.params.id, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบแฟ้มรายการโปรด' });

    return { ok: true };
  };

  app.delete('/api/favorites/collections/:id', deleteCollectionsHandler);
  app.delete('/api/favorite-collections/:id', deleteCollectionsHandler);

  // Assign collection to favorite: PUT & PATCH /api/favorites/:itemType/:itemId/collection
  const assignCollectionHandler = async (request: any, reply: any) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { collectionId } = request.body || {};

    if (collectionId) {
      const col = database.prepare('SELECT id FROM favorite_collections WHERE id = ? AND owner_id = ?').get(collectionId, ownerId);
      if (!col) return reply.code(404).send({ error: 'ไม่พบแฟ้มรายการโปรด' });
    }

    const result = database.prepare(`
      UPDATE favorites SET collection_id = ? WHERE owner_id = ? AND item_type = ? AND item_id = ?
    `).run(collectionId || null, ownerId, request.params.itemType, request.params.itemId);

    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการโปรด' });

    return { ok: true, collectionId: collectionId || null };
  };

  app.patch('/api/favorites/:itemType/:itemId/collection', assignCollectionHandler);
  app.put('/api/favorites/:itemType/:itemId/collection', assignCollectionHandler);
}
