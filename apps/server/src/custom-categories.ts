import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';

export interface CustomCategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
  itemCount?: number;
  createdAt: number;
  updatedAt: number;
}

export type SupportedItemType = 'note' | 'task' | 'bookmark' | 'library' | 'vault' | 'file';

const ITEM_TABLE_MAP: Record<SupportedItemType, string> = {
  note: 'notes',
  task: 'tasks',
  bookmark: 'bookmarks',
  library: 'library_items',
  vault: 'vault_items',
  file: 'files',
};

function isValidItemType(type: string): type is SupportedItemType {
  return Object.prototype.hasOwnProperty.call(ITEM_TABLE_MAP, type);
}

export function registerCustomCategoryRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // 1. List all custom categories for user
  app.get('/api/custom-categories', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const categories = database.prepare(`
      SELECT 
        c.id, c.name, c.icon, c.color, 
        c.parent_id AS parentId, 
        c.sort_order AS sortOrder,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        (
          SELECT COUNT(DISTINCT item_key) FROM (
            SELECT 'note:' || id AS item_key FROM notes WHERE owner_id = c.owner_id AND custom_category_id = c.id AND deleted_at IS NULL
            UNION
            SELECT 'task:' || id FROM tasks WHERE owner_id = c.owner_id AND custom_category_id = c.id
            UNION
            SELECT 'bookmark:' || id FROM bookmarks WHERE owner_id = c.owner_id AND custom_category_id = c.id
            UNION
            SELECT 'library:' || id FROM library_items WHERE owner_id = c.owner_id AND custom_category_id = c.id
            UNION
            SELECT 'vault:' || id FROM vault_items WHERE owner_id = c.owner_id AND custom_category_id = c.id
            UNION
            SELECT 'file:' || id FROM files WHERE owner_id = c.owner_id AND custom_category_id = c.id
            UNION
            SELECT item_type || ':' || item_id FROM custom_category_items WHERE owner_id = c.owner_id AND category_id = c.id
          )
        ) AS itemCount
      FROM custom_categories c
      WHERE c.owner_id = ?
      ORDER BY c.sort_order ASC, c.created_at ASC
    `).all(ownerId) as CustomCategoryRow[];

    return { categories };
  });

  // 2. Create custom category
  app.post<{
    Body: {
      name?: unknown;
      icon?: unknown;
      color?: unknown;
      parentId?: unknown;
      sortOrder?: unknown;
    };
  }>('/api/custom-categories', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const rawName = request.body?.name;
    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
      return reply.code(400).send({ error: 'ชื่อหมวดหมู่ต้องไม่ว่างเปล่า' });
    }
    const name = rawName.normalize('NFC').trim();
    if (name.length > 120) {
      return reply.code(400).send({ error: 'ชื่อหมวดหมู่ต้องไม่เกิน 120 ตัวอักษร' });
    }

    const icon = typeof request.body?.icon === 'string' && request.body.icon.trim().length > 0
      ? request.body.icon.trim().slice(0, 16)
      : '📁';

    const color = typeof request.body?.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(request.body.color.trim())
      ? request.body.color.trim()
      : '#3f7658';

    let parentId: string | null = null;
    if (typeof request.body?.parentId === 'string' && request.body.parentId.trim().length > 0) {
      const pId = request.body.parentId.trim();
      const parent = database.prepare('SELECT id FROM custom_categories WHERE id = ? AND owner_id = ?')
        .get(pId, ownerId);
      if (!parent) {
        return reply.code(400).send({ error: 'ไม่พบหมวดหมู่หลักที่ระบุ' });
      }
      parentId = pId;
    }

    const sortOrder = typeof request.body?.sortOrder === 'number' && Number.isSafeInteger(request.body.sortOrder)
      ? request.body.sortOrder
      : 0;

    const id = randomUUID();
    const now = Date.now();

    database.prepare(`
      INSERT INTO custom_categories (id, owner_id, name, icon, color, parent_id, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, icon, color, parentId, sortOrder, now, now);

    const created = database.prepare(`
      SELECT id, name, icon, color, parent_id AS parentId, sort_order AS sortOrder,
        created_at AS createdAt, updated_at AS updatedAt, 0 AS itemCount
      FROM custom_categories
      WHERE id = ?
    `).get(id) as CustomCategoryRow;

    return reply.code(201).send({ category: created });
  });

  // 3. Update custom category
  app.patch<{
    Params: { id: string };
    Body: {
      name?: unknown;
      icon?: unknown;
      color?: unknown;
      parentId?: unknown;
      sortOrder?: unknown;
    };
  }>('/api/custom-categories/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { id } = request.params;
    const existing = database.prepare('SELECT * FROM custom_categories WHERE id = ? AND owner_id = ?')
      .get(id, ownerId) as { id: string; parent_id: string | null } | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบหมวดหมู่' });

    const updates: string[] = [];
    const params: unknown[] = [];

    if (request.body?.name !== undefined) {
      if (typeof request.body.name !== 'string' || request.body.name.trim().length === 0) {
        return reply.code(400).send({ error: 'ชื่อหมวดหมู่ต้องไม่ว่างเปล่า' });
      }
      const name = request.body.name.normalize('NFC').trim();
      if (name.length > 120) return reply.code(400).send({ error: 'ชื่อหมวดหมู่ต้องไม่เกิน 120 ตัวอักษร' });
      updates.push('name = ?');
      params.push(name);
    }

    if (request.body?.icon !== undefined) {
      const icon = typeof request.body.icon === 'string' && request.body.icon.trim().length > 0
        ? request.body.icon.trim().slice(0, 16)
        : '📁';
      updates.push('icon = ?');
      params.push(icon);
    }

    if (request.body?.color !== undefined) {
      const color = typeof request.body.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(request.body.color.trim())
        ? request.body.color.trim()
        : '#3f7658';
      updates.push('color = ?');
      params.push(color);
    }

    if (request.body?.parentId !== undefined) {
      if (request.body.parentId === null || request.body.parentId === '') {
        updates.push('parent_id = NULL');
      } else if (typeof request.body.parentId === 'string') {
        const pId = request.body.parentId.trim();
        if (pId === id) {
          return reply.code(400).send({ error: 'หมวดหมู่ไม่สามารถเป็นหมวดหมู่ย่อยของตัวเองได้' });
        }
        const parent = database.prepare('SELECT id FROM custom_categories WHERE id = ? AND owner_id = ?')
          .get(pId, ownerId);
        if (!parent) return reply.code(400).send({ error: 'ไม่พบหมวดหมู่หลักที่ระบุ' });
        updates.push('parent_id = ?');
        params.push(pId);
      }
    }

    if (request.body?.sortOrder !== undefined && typeof request.body.sortOrder === 'number') {
      updates.push('sort_order = ?');
      params.push(request.body.sortOrder);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(id, ownerId);
      database.prepare(`UPDATE custom_categories SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`)
        .run(...params);
    }

    const updated = database.prepare(`
      SELECT id, name, icon, color, parent_id AS parentId, sort_order AS sortOrder,
        created_at AS createdAt, updated_at AS updatedAt
      FROM custom_categories
      WHERE id = ?
    `).get(id) as CustomCategoryRow;

    return { category: updated };
  });

  // 4. Delete custom category
  app.delete<{ Params: { id: string } }>('/api/custom-categories/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { id } = request.params;
    const existing = database.prepare('SELECT id FROM custom_categories WHERE id = ? AND owner_id = ?')
      .get(id, ownerId);
    if (!existing) return reply.code(404).send({ error: 'ไม่พบหมวดหมู่' });

    database.transaction(() => {
      // Unlink direct foreign keys on items
      database.prepare('UPDATE notes SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      database.prepare('UPDATE tasks SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      database.prepare('UPDATE bookmarks SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      database.prepare('UPDATE library_items SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      database.prepare('UPDATE vault_items SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      database.prepare('UPDATE files SET custom_category_id = NULL WHERE custom_category_id = ? AND owner_id = ?').run(id, ownerId);
      // Delete links
      database.prepare('DELETE FROM custom_category_items WHERE category_id = ? AND owner_id = ?').run(id, ownerId);
      // Delete category (children cascade or are deleted)
      database.prepare('DELETE FROM custom_categories WHERE id = ? AND owner_id = ?').run(id, ownerId);
    })();

    return reply.code(204).send();
  });

  // 5. Get all items inside a custom category
  app.get<{ Params: { id: string } }>('/api/custom-categories/:id/items', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { id } = request.params;
    const category = database.prepare(`
      SELECT id, name, icon, color, parent_id AS parentId, sort_order AS sortOrder,
        created_at AS createdAt, updated_at AS updatedAt
      FROM custom_categories
      WHERE id = ? AND owner_id = ?
    `).get(id, ownerId) as CustomCategoryRow | undefined;
    if (!category) return reply.code(404).send({ error: 'ไม่พบหมวดหมู่' });

    // Subcategories
    const subcategories = database.prepare(`
      SELECT id, name, icon, color, parent_id AS parentId, sort_order AS sortOrder,
        created_at AS createdAt, updated_at AS updatedAt,
        (
          SELECT COUNT(DISTINCT item_key) FROM (
            SELECT 'note:' || n.id AS item_key FROM notes n WHERE n.owner_id = c.owner_id AND n.custom_category_id = c.id AND n.deleted_at IS NULL
            UNION
            SELECT 'task:' || t.id FROM tasks t WHERE t.owner_id = c.owner_id AND t.custom_category_id = c.id
            UNION
            SELECT 'bookmark:' || b.id FROM bookmarks b WHERE b.owner_id = c.owner_id AND b.custom_category_id = c.id
            UNION
            SELECT 'library:' || l.id FROM library_items l WHERE l.owner_id = c.owner_id AND l.custom_category_id = c.id
            UNION
            SELECT 'vault:' || v.id FROM vault_items v WHERE v.owner_id = c.owner_id AND v.custom_category_id = c.id
            UNION
            SELECT 'file:' || f.id FROM files f WHERE f.owner_id = c.owner_id AND f.custom_category_id = c.id
            UNION
            SELECT item_type || ':' || item_id FROM custom_category_items WHERE owner_id = c.owner_id AND category_id = c.id
          )
        ) AS itemCount
      FROM custom_categories c
      WHERE c.owner_id = ? AND c.parent_id = ?
      ORDER BY c.sort_order ASC, c.created_at ASC
    `).all(ownerId, id) as CustomCategoryRow[];

    // Notes
    const notes = database.prepare(`
      SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt
      FROM notes
      WHERE owner_id = ? AND deleted_at IS NULL
        AND (custom_category_id = ? OR id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'note'))
      ORDER BY updated_at DESC
    `).all(ownerId, id, id);

    // Tasks
    const tasks = database.prepare(`
      SELECT t.id, t.title, t.detail, t.status, t.priority, t.due_date AS dueDate,
        t.start_date AS startDate, t.project_id AS projectId, p.name AS projectName,
        t.goal_id AS goalId, g.title AS goalTitle, t.recurrence, t.completed_at AS completedAt,
        t.created_at AS createdAt, t.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id) AS checklistTotal,
        (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id AND c.is_done = 1) AS checklistDone
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN goals g ON g.id = t.goal_id
      WHERE t.owner_id = ?
        AND (t.custom_category_id = ? OR t.id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'task'))
      ORDER BY (t.status = 'done'), CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at DESC
    `).all(ownerId, id, id);

    // Bookmarks
    const bookmarks = database.prepare(`
      SELECT id, title, url, description, created_at AS createdAt, updated_at AS updatedAt
      FROM bookmarks
      WHERE owner_id = ?
        AND (custom_category_id = ? OR id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'bookmark'))
      ORDER BY updated_at DESC
    `).all(ownerId, id, id);

    // Files
    const files = database.prepare(`
      SELECT id, display_name AS displayName, size_bytes AS sizeBytes, sha256,
        media_type AS mediaType, created_at AS createdAt,
        '/api/files/' || id AS downloadUrl
      FROM files
      WHERE owner_id = ?
        AND (custom_category_id = ? OR id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'file'))
      ORDER BY created_at DESC
    `).all(ownerId, id, id);

    // Vault
    const vault = database.prepare(`
      SELECT id, title, category, key_value AS keyValue, physical_location AS physicalLocation,
        renewal_or_expiry_date AS renewalOrExpiryDate, amount_text AS amountText, notes,
        is_favorite AS isFavorite, created_at AS createdAt, updated_at AS updatedAt
      FROM vault_items
      WHERE owner_id = ?
        AND (custom_category_id = ? OR id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'vault'))
      ORDER BY updated_at DESC
    `).all(ownerId, id, id);

    // Library
    const library = database.prepare(`
      SELECT id, title, category, status, source_url_or_author AS sourceUrlOrAuthor,
        key_takeaways AS keyTakeaways, content, is_favorite AS isFavorite,
        created_at AS createdAt, updated_at AS updatedAt
      FROM library_items
      WHERE owner_id = ?
        AND (custom_category_id = ? OR id IN (SELECT item_id FROM custom_category_items WHERE category_id = ? AND item_type = 'library'))
      ORDER BY updated_at DESC
    `).all(ownerId, id, id);

    const counts = {
      notes: notes.length,
      tasks: tasks.length,
      bookmarks: bookmarks.length,
      files: files.length,
      vault: vault.length,
      library: library.length,
      total: notes.length + tasks.length + bookmarks.length + files.length + vault.length + library.length,
    };

    return {
      category,
      subcategories,
      counts,
      notes,
      tasks,
      bookmarks,
      files,
      vault,
      library,
    };
  });

  // 6. Link item to custom category
  app.post<{
    Params: { id: string };
    Body: { itemType?: unknown; itemId?: unknown };
  }>('/api/custom-categories/:id/items', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: UUID_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { id } = request.params;
    const cat = database.prepare('SELECT id FROM custom_categories WHERE id = ? AND owner_id = ?').get(id, ownerId);
    if (!cat) return reply.code(404).send({ error: 'ไม่พบหมวดหมู่' });

    const itemType = request.body?.itemType;
    const itemId = request.body?.itemId;

    if (typeof itemType !== 'string' || !isValidItemType(itemType)) {
      return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
    }
    if (typeof itemId !== 'string' || itemId.trim().length === 0) {
      return reply.code(400).send({ error: 'ต้องระบุ itemId' });
    }

    const table = ITEM_TABLE_MAP[itemType];
    const exists = database.prepare(`SELECT id FROM ${table} WHERE id = ? AND owner_id = ?`).get(itemId, ownerId);
    if (!exists) {
      return reply.code(404).send({ error: 'ไม่พบข้อมูลที่ต้องการจัดหมวดหมู่' });
    }

    const linkId = randomUUID();
    database.transaction(() => {
      // Update direct column on item
      database.prepare(`UPDATE ${table} SET custom_category_id = ? WHERE id = ? AND owner_id = ?`).run(id, itemId, ownerId);
      // Also register in junction table
      database.prepare(`
        INSERT OR IGNORE INTO custom_category_items (id, owner_id, category_id, item_type, item_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(linkId, ownerId, id, itemType, itemId, Date.now());
    })();

    return reply.code(201).send({ success: true, linkId });
  });

  // 7. Unlink item from custom category
  app.delete<{
    Params: { id: string; itemType: string; itemId: string };
  }>('/api/custom-categories/:id/items/:itemType/:itemId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'itemType', 'itemId'],
        properties: {
          id: { type: 'string', pattern: UUID_PATTERN },
          itemType: { type: 'string' },
          itemId: { type: 'string', pattern: UUID_PATTERN },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { id, itemType, itemId } = request.params;
    if (!isValidItemType(itemType)) {
      return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
    }

    const table = ITEM_TABLE_MAP[itemType];
    database.transaction(() => {
      database.prepare('DELETE FROM custom_category_items WHERE category_id = ? AND item_type = ? AND item_id = ? AND owner_id = ?')
        .run(id, itemType, itemId, ownerId);
      database.prepare(`UPDATE ${table} SET custom_category_id = NULL WHERE id = ? AND custom_category_id = ? AND owner_id = ?`)
        .run(itemId, id, ownerId);
    })();

    return reply.code(204).send();
  });

  // 8. Get item custom category assignment
  app.get<{
    Params: { itemType: string; itemId: string };
  }>('/api/custom-categories/items/:itemType/:itemId', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { itemType, itemId } = request.params;
    if (!isValidItemType(itemType)) {
      return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
    }

    const table = ITEM_TABLE_MAP[itemType];
    const row = database.prepare(`
      SELECT custom_category_id AS categoryId
      FROM ${table}
      WHERE id = ? AND owner_id = ?
    `).get(itemId, ownerId) as { categoryId: string | null } | undefined;

    return { categoryId: row?.categoryId ?? null };
  });

  // 9. Set or clear item custom category assignment
  app.put<{
    Params: { itemType: string; itemId: string };
    Body: { categoryId?: unknown };
  }>('/api/custom-categories/items/:itemType/:itemId', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const { itemType, itemId } = request.params;
    if (!isValidItemType(itemType)) {
      return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
    }

    const rawCatId = request.body?.categoryId;
    let targetCatId: string | null = null;
    if (typeof rawCatId === 'string' && rawCatId.trim().length > 0) {
      targetCatId = rawCatId.trim();
      const cat = database.prepare('SELECT id FROM custom_categories WHERE id = ? AND owner_id = ?').get(targetCatId, ownerId);
      if (!cat) {
        return reply.code(404).send({ error: 'ไม่พบหมวดหมู่ที่ระบุ' });
      }
    }

    const table = ITEM_TABLE_MAP[itemType];
    const item = database.prepare(`SELECT id FROM ${table} WHERE id = ? AND owner_id = ?`).get(itemId, ownerId);
    if (!item) {
      return reply.code(404).send({ error: 'ไม่พบข้อมูล' });
    }

    database.transaction(() => {
      database.prepare('DELETE FROM custom_category_items WHERE item_type = ? AND item_id = ? AND owner_id = ?')
        .run(itemType, itemId, ownerId);
      database.prepare(`UPDATE ${table} SET custom_category_id = ? WHERE id = ? AND owner_id = ?`)
        .run(targetCatId, itemId, ownerId);
      if (targetCatId) {
        database.prepare(`
          INSERT INTO custom_category_items (id, owner_id, category_id, item_type, item_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), ownerId, targetCatId, itemType, itemId, Date.now());
      }
    })();

    return { success: true, categoryId: targetCatId };
  });
}
