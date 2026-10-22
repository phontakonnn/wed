import { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { deleteObject } from './files.js';

export interface TrashItem {
  id: string;
  itemType: string;
  title: string;
  subtitle: string;
  deletedAt: number;
  createdAt: number;
  metadata?: Record<string, any>;
}

export const SUPPORTED_TRASH_TYPES = [
  'note',
  'task',
  'project',
  'goal',
  'person',
  'file',
  'bookmark',
  'vault',
  'library',
  'watchlist',
  'shopping',
  'travel',
  'custom_record',
  'custom_type',
] as const;

export type SupportedTrashType = typeof SUPPORTED_TRASH_TYPES[number];

const TABLE_MAP: Record<SupportedTrashType, { table: string; titleCol: string; subCol: string; hasUpdatedAt: boolean }> = {
  note: { table: 'notes', titleCol: 'title', subCol: 'content', hasUpdatedAt: true },
  task: { table: 'tasks', titleCol: 'title', subCol: 'detail', hasUpdatedAt: true },
  project: { table: 'projects', titleCol: 'name', subCol: 'description', hasUpdatedAt: true },
  goal: { table: 'goals', titleCol: 'title', subCol: 'description', hasUpdatedAt: true },
  person: { table: 'people', titleCol: 'name', subCol: 'relationship_group', hasUpdatedAt: true },
  file: { table: 'files', titleCol: 'display_name', subCol: 'media_type', hasUpdatedAt: false },
  bookmark: { table: 'bookmarks', titleCol: 'title', subCol: 'url', hasUpdatedAt: true },
  vault: { table: 'vault_items', titleCol: 'title', subCol: 'category', hasUpdatedAt: true },
  library: { table: 'library_items', titleCol: 'title', subCol: 'author', hasUpdatedAt: true },
  watchlist: { table: 'watchlist_items', titleCol: 'title', subCol: 'platform', hasUpdatedAt: true },
  shopping: { table: 'shopping_items', titleCol: 'name', subCol: 'category', hasUpdatedAt: true },
  travel: { table: 'travel_places', titleCol: 'name', subCol: 'location', hasUpdatedAt: true },
  custom_record: { table: 'custom_data_records', titleCol: 'title', subCol: 'type_id', hasUpdatedAt: true },
  custom_type: { table: 'custom_data_types', titleCol: 'name', subCol: 'description', hasUpdatedAt: true },
};

export function registerUniversalTrashRoutes(app: FastifyInstance, database: Database.Database, dataDirectory: string | null): void {
  // GET /api/trash - list trashed items with filtering, search, and pagination
  app.get<{
    Querystring: {
      type?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    };
  }>('/api/trash', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 50));
    const search = (request.query.search || '').trim().toLowerCase();
    const typeFilter = (request.query.type || 'all').trim().toLowerCase();

    // Determine target types based on type filter
    let targetTypes: SupportedTrashType[] = [];
    if (typeFilter === 'all' || !typeFilter) {
      targetTypes = [...SUPPORTED_TRASH_TYPES];
    } else if (typeFilter === 'lifestyle') {
      targetTypes = ['watchlist', 'shopping', 'travel'];
    } else if (typeFilter === 'custom' || typeFilter === 'custom_record') {
      targetTypes = ['custom_record', 'custom_type'];
    } else if (SUPPORTED_TRASH_TYPES.includes(typeFilter as SupportedTrashType)) {
      targetTypes = [typeFilter as SupportedTrashType];
    } else {
      targetTypes = [...SUPPORTED_TRASH_TYPES];
    }

    const allItems: TrashItem[] = [];

    for (const t of targetTypes) {
      const config = TABLE_MAP[t];
      try {
        const rows = database.prepare(`
          SELECT id, ${config.titleCol} AS item_title, ${config.subCol} AS item_sub,
                 deleted_at, created_at
          FROM ${config.table}
          WHERE owner_id = ? AND deleted_at IS NOT NULL
          ORDER BY deleted_at DESC
        `).all(ownerId) as Array<{
          id: string;
          item_title: string;
          item_sub: string | null;
          deleted_at: number;
          created_at: number;
        }>;

        for (const row of rows) {
          const title = row.item_title || '(ไม่มีชื่อ)';
          const subtitle = row.item_sub || '';
          if (search) {
            if (!title.toLowerCase().includes(search) && !subtitle.toLowerCase().includes(search)) {
              continue;
            }
          }
          allItems.push({
            id: row.id,
            itemType: t,
            title,
            subtitle,
            deletedAt: row.deleted_at,
            createdAt: row.created_at,
          });
        }
      } catch {
        // Table might not exist or empty
      }
    }

    // Sort combined items by deletion date descending
    allItems.sort((a, b) => b.deletedAt - a.deletedAt);

    const total = allItems.length;
    const startIndex = (page - 1) * pageSize;
    const items = allItems.slice(startIndex, startIndex + pageSize);

    return { items, total, page, pageSize };
  });

  // POST /api/trash/:itemType/:id/restore - single restore
  app.post<{ Params: { itemType: string; id: string } }>('/api/trash/:itemType/:id/restore', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const itemType = request.params.itemType as SupportedTrashType;
    const config = TABLE_MAP[itemType];
    if (!config) return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });

    const now = Date.now();
    const updateSql = config.hasUpdatedAt
      ? `UPDATE ${config.table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`
      : `UPDATE ${config.table} SET deleted_at = NULL WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`;

    const result = config.hasUpdatedAt
      ? database.prepare(updateSql).run(now, request.params.id, ownerId)
      : database.prepare(updateSql).run(request.params.id, ownerId);

    if (result.changes === 0) {
      return reply.code(404).send({ error: 'ไม่พบรายการในถังขยะ' });
    }

    return reply.code(204).send();
  });

  // DELETE /api/trash/:itemType/:id/permanent - single permanent delete
  app.delete<{ Params: { itemType: string; id: string } }>('/api/trash/:itemType/:id/permanent', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const itemType = request.params.itemType as SupportedTrashType;
    const config = TABLE_MAP[itemType];
    if (!config) return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });

    const existing = database.prepare(`SELECT id FROM ${config.table} WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`).get(request.params.id, ownerId);
    if (!existing) {
      return reply.code(404).send({ error: 'ไม่พบรายการในถังขยะ' });
    }

    if (itemType === 'file' && dataDirectory) {
      deleteObject(dataDirectory, request.params.id);
    }

    database.prepare(`DELETE FROM ${config.table} WHERE id = ? AND owner_id = ?`).run(request.params.id, ownerId);

    return reply.code(204).send();
  });

  // POST /api/trash/bulk-restore - bulk restore
  app.post<{ Body: { items: Array<{ itemType: string; id: string }> } }>('/api/trash/bulk-restore', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { items } = request.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'กรุณาระบุรายการที่ต้องการกู้คืน' });
    }

    const now = Date.now();
    let restoredCount = 0;

    const restoreTx = database.transaction(() => {
      for (const item of items) {
        const config = TABLE_MAP[item.itemType as SupportedTrashType];
        if (!config) continue;

        const updateSql = config.hasUpdatedAt
          ? `UPDATE ${config.table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`
          : `UPDATE ${config.table} SET deleted_at = NULL WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`;

        const res = config.hasUpdatedAt
          ? database.prepare(updateSql).run(now, item.id, ownerId)
          : database.prepare(updateSql).run(item.id, ownerId);

        if (res.changes > 0) restoredCount++;
      }
    });

    restoreTx();
    return { ok: true, restoredCount };
  });

  // POST /api/trash/bulk-permanent - bulk permanent delete
  app.post<{ Body: { items: Array<{ itemType: string; id: string }> } }>('/api/trash/bulk-permanent', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { items } = request.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'กรุณาระบุรายการที่ต้องการลบถาวร' });
    }

    let deletedCount = 0;

    const deleteTx = database.transaction(() => {
      for (const item of items) {
        const config = TABLE_MAP[item.itemType as SupportedTrashType];
        if (!config) continue;

        const existing = database.prepare(`SELECT id FROM ${config.table} WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`).get(item.id, ownerId);
        if (!existing) continue;

        if (item.itemType === 'file' && dataDirectory) {
          deleteObject(dataDirectory, item.id);
        }

        const res = database.prepare(`DELETE FROM ${config.table} WHERE id = ? AND owner_id = ?`).run(item.id, ownerId);
        if (res.changes > 0) deletedCount++;
      }
    });

    deleteTx();
    return { ok: true, deletedCount };
  });
}
