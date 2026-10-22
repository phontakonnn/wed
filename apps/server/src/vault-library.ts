import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { cleanOrphanItemLinks, type SqliteDatabase } from './database.js';
import { isIsoDate } from './dates.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const VAULT_CATEGORIES = ['เอกสาร & ประกัน', 'ทรัพย์สิน & บ้าน', 'รอบบิลรายเดือน'] as const;
export const LIBRARY_CATEGORIES = ['คู่มือชีวิต & SOP', 'หนังสือ & คอร์สเรียน', 'โพยคำสั่ง & สูตร'] as const;
export const LIBRARY_STATUSES = ['ใช้งานประจำ', 'กำลังศึกษา', 'สรุปจบแล้ว'] as const;

export const vaultSelect = `
  SELECT id, title, category, key_value AS keyValue, physical_location AS physicalLocation,
    renewal_or_expiry_date AS renewalOrExpiryDate, amount_text AS amountText, notes,
    is_favorite AS isFavorite, created_at AS createdAt, updated_at AS updatedAt
  FROM vault_items
`;

export const librarySelect = `
  SELECT id, title, category, status, source_url_or_author AS sourceUrlOrAuthor,
    key_takeaways AS keyTakeaways, content, is_favorite AS isFavorite,
    created_at AS createdAt, updated_at AS updatedAt
  FROM library_items
`;

function text(value: unknown, max: number, allowNewlines = false): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim();
  if (normalized.length > max) return null;
  const control = allowNewlines
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  if (control.test(normalized)) return null;
  return normalized;
}

type DateField =
  | { state: 'absent' }
  | { state: 'clear' }
  | { state: 'set'; value: string }
  | { state: 'invalid' };

/**
 * Absent means "keep what is stored", empty or null means "clear it", anything else must be a real
 * ISO date. Collapsing absent and clear is how an update silently wipes a renewal date.
 */
function parseDateField(value: unknown): DateField {
  if (value === undefined) return { state: 'absent' };
  if (value === null) return { state: 'clear' };
  if (typeof value !== 'string') return { state: 'invalid' };
  const trimmed = value.trim();
  if (trimmed === '') return { state: 'clear' };
  if (!isIsoDate(trimmed)) return { state: 'invalid' };
  return { state: 'set', value: trimmed };
}

function favoriteFlag(value: unknown): 0 | 1 | null {
  if (value === undefined) return null;
  if (typeof value !== 'boolean') return null;
  return value ? 1 : 0;
}

/** SQLite stores booleans as 0/1; the API must not leak the integer representation. */
function withBoolean<T extends Record<string, unknown>>(row: T): T {
  return { ...row, isFavorite: row.isFavorite === 1 };
}

function owns(database: SqliteDatabase, table: string, ownerId: string, id: string): boolean {
  return database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`).get(id, ownerId) !== undefined;
}

/** Links are removed with the entity. The trigger also covers this; deleting explicitly keeps the
 * intent readable and makes the cascade testable without relying on trigger ordering. */
function deleteLinks(database: SqliteDatabase, ownerId: string, entityType: string, entityId: string): void {
  database.prepare('DELETE FROM entity_files WHERE owner_id = ? AND entity_type = ? AND entity_id = ?')
    .run(ownerId, entityType, entityId);
}

export function registerVaultRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // ------------------------------------------------------------------- vault

  app.get<{ Querystring: { category?: string; q?: string; page: number; pageSize: number } }>(
    '/api/vault',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { type: 'string', enum: [...VAULT_CATEGORIES, 'all'] },
            q: { type: 'string', maxLength: 120 },
            page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const { page, pageSize } = request.query;
      const category = request.query.category ?? 'all';
      const query = text(request.query.q ?? '', 120);
      if (query === null) return reply.code(400).send({ error: 'คำค้นไม่ถูกต้อง' });

      const conditions = ['owner_id = ?', 'deleted_at IS NULL'];
      const params: Array<string | number> = [ownerId];
      if (category !== 'all') {
        conditions.push('category = ?');
        params.push(category);
      }
      if (query) {
        conditions.push(`(instr(nfc(lower(title)), nfc(lower(?))) > 0
          OR instr(nfc(lower(key_value)), nfc(lower(?))) > 0
          OR instr(nfc(lower(physical_location)), nfc(lower(?))) > 0
          OR instr(nfc(lower(amount_text)), nfc(lower(?))) > 0
          OR instr(nfc(lower(notes)), nfc(lower(?))) > 0)`);
        params.push(query, query, query, query, query);
      }
      const where = conditions.join(' AND ');
      const total = (database.prepare(`SELECT COUNT(*) AS total FROM vault_items WHERE ${where}`)
        .get(...params) as { total: number }).total;
      const rows = database.prepare(`
        ${vaultSelect}
        WHERE ${where}
        ORDER BY (renewal_or_expiry_date IS NULL), renewal_or_expiry_date, updated_at DESC, id
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
      return { items: rows.map(withBoolean), page, pageSize, total };
    },
  );

  app.get<{ Params: { itemId: string } }>('/api/vault/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const row = database.prepare(`${vaultSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(request.params.itemId, ownerId) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: 'ไม่พบรายการในคลังข้อมูลนี้' });
    return { item: withBoolean(row) };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/vault', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          category: { type: 'string', enum: [...VAULT_CATEGORIES] },
          keyValue: { type: 'string', maxLength: 200 },
          physicalLocation: { type: 'string', maxLength: 200 },
          renewalOrExpiryDate: { type: ['string', 'null'], pattern: `^$|${ISO_DATE_PATTERN}` },
          amountText: { type: 'string', maxLength: 120 },
          notes: { type: 'string', maxLength: 5000 },
          isFavorite: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const body = request.body;
    const title = text(body.title, 200);
    const keyValue = text(body.keyValue ?? '', 200);
    const physicalLocation = text(body.physicalLocation ?? '', 200);
    const amountText = text(body.amountText ?? '', 120);
    const notes = text(body.notes ?? '', 5000, true);
    const renewal = parseDateField(body.renewalOrExpiryDate);
    const isFavorite = favoriteFlag(body.isFavorite) ?? 0;
    if (!title || keyValue === null || physicalLocation === null || amountText === null
      || notes === null || renewal.state === 'invalid') {
      return reply.code(400).send({ error: 'ข้อมูลในคลังไม่ถูกต้อง' });
    }
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO vault_items (id, owner_id, title, category, key_value, physical_location,
        renewal_or_expiry_date, amount_text, notes, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, body.category ?? VAULT_CATEGORIES[0], keyValue, physicalLocation,
      renewal.state === 'set' ? renewal.value : null, amountText, notes, isFavorite, now, now);
    const row = database.prepare(`${vaultSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(id, ownerId) as Record<string, unknown>;
    return reply.code(201).send({ item: withBoolean(row) });
  });

  // PUT updates only the fields that were sent. A true replace would wipe every omitted field,
  // which is a data-loss trap for a form that submits just what the user edited.
  app.put<{ Params: { itemId: string }; Body: Record<string, unknown> }>('/api/vault/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          category: { type: 'string', enum: [...VAULT_CATEGORIES] },
          keyValue: { type: 'string', maxLength: 200 },
          physicalLocation: { type: 'string', maxLength: 200 },
          renewalOrExpiryDate: { type: ['string', 'null'], pattern: `^$|${ISO_DATE_PATTERN}` },
          amountText: { type: 'string', maxLength: 120 },
          notes: { type: 'string', maxLength: 5000 },
          isFavorite: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { itemId } = request.params;
    const current = database.prepare(`${vaultSelect} WHERE id = ? AND owner_id = ?`)
      .get(itemId, ownerId) as Record<string, unknown> | undefined;
    if (!current) return reply.code(404).send({ error: 'ไม่พบรายการในคลังข้อมูลนี้' });

    const body = request.body;
    const assignments: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return reply.code(400).send({ error: 'ข้อมูลในคลังไม่ถูกต้อง' });
      assignments.push('title = ?');
      params.push(title);
    }
    if (body.category !== undefined) {
      assignments.push('category = ?');
      params.push(body.category as string);
    }
    for (const [field, column, max, allowNewlines] of [
      ['keyValue', 'key_value', 200, false],
      ['physicalLocation', 'physical_location', 200, false],
      ['amountText', 'amount_text', 120, false],
      ['notes', 'notes', 5000, true],
    ] as const) {
      if (body[field] === undefined) continue;
      const value = text(body[field], max, allowNewlines);
      if (value === null) return reply.code(400).send({ error: 'ข้อมูลในคลังไม่ถูกต้อง' });
      assignments.push(`${column} = ?`);
      params.push(value);
    }
    if (body.renewalOrExpiryDate !== undefined) {
      const renewal = parseDateField(body.renewalOrExpiryDate);
      if (renewal.state === 'invalid') return reply.code(400).send({ error: 'รูปแบบวันที่ไม่ถูกต้อง' });
      assignments.push('renewal_or_expiry_date = ?');
      params.push(renewal.state === 'set' ? renewal.value : null);
    }
    if (body.isFavorite !== undefined) {
      const isFavorite = favoriteFlag(body.isFavorite);
      if (isFavorite === null) return reply.code(400).send({ error: 'ข้อมูลในคลังไม่ถูกต้อง' });
      assignments.push('is_favorite = ?');
      params.push(isFavorite);
    }

    if (assignments.length === 0) return reply.code(400).send({ error: 'ไม่มีข้อมูลที่จะอัปเดต' });
    assignments.push('updated_at = ?');
    params.push(Date.now());
    database.prepare(`UPDATE vault_items SET ${assignments.join(', ')} WHERE id = ? AND owner_id = ?`)
      .run(...params, itemId, ownerId);
    const row = database.prepare(`${vaultSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(itemId, ownerId) as Record<string, unknown>;
    return { item: withBoolean(row) };
  });

  app.delete<{ Params: { itemId: string } }>('/api/vault/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { itemId } = request.params;
    if (!owns(database, 'vault_items', ownerId, itemId)) {
      return reply.code(404).send({ error: 'ไม่พบรายการในคลังข้อมูลนี้' });
    }
    database.transaction(() => {

      const now = Date.now();
      database.prepare('UPDATE vault_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').run(now, now, itemId, ownerId);
    })();
    return reply.code(204).send();
  });

  // ----------------------------------------------------------------- library

  app.get<{ Querystring: { category?: string; status?: string; q?: string; page: number; pageSize: number } }>(
    '/api/library',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { type: 'string', enum: [...LIBRARY_CATEGORIES, 'all'] },
            status: { type: 'string', enum: [...LIBRARY_STATUSES, 'all'] },
            q: { type: 'string', maxLength: 120 },
            page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const { page, pageSize } = request.query;
      const category = request.query.category ?? 'all';
      const status = request.query.status ?? 'all';
      const query = text(request.query.q ?? '', 120);
      if (query === null) return reply.code(400).send({ error: 'คำค้นไม่ถูกต้อง' });

      const conditions = ['owner_id = ?', 'deleted_at IS NULL'];
      const params: Array<string | number> = [ownerId];
      if (category !== 'all') {
        conditions.push('category = ?');
        params.push(category);
      }
      if (status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
      }
      if (query) {
        conditions.push(`(instr(nfc(lower(title)), nfc(lower(?))) > 0
          OR instr(nfc(lower(key_takeaways)), nfc(lower(?))) > 0
          OR instr(nfc(lower(content)), nfc(lower(?))) > 0
          OR instr(nfc(lower(source_url_or_author)), nfc(lower(?))) > 0)`);
        params.push(query, query, query, query);
      }
      const where = conditions.join(' AND ');
      const total = (database.prepare(`SELECT COUNT(*) AS total FROM library_items WHERE ${where}`)
        .get(...params) as { total: number }).total;
      const rows = database.prepare(`
        ${librarySelect}
        WHERE ${where}
        ORDER BY is_favorite DESC, updated_at DESC, id
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
      return { items: rows.map(withBoolean), page, pageSize, total };
    },
  );

  app.get<{ Params: { itemId: string } }>('/api/library/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const row = database.prepare(`${librarySelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(request.params.itemId, ownerId) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: 'ไม่พบรายการในห้องสมุดนี้' });
    return { item: withBoolean(row) };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/library', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          category: { type: 'string', enum: [...LIBRARY_CATEGORIES] },
          status: { type: 'string', enum: [...LIBRARY_STATUSES] },
          sourceUrlOrAuthor: { type: 'string', maxLength: 500 },
          keyTakeaways: { type: 'string', maxLength: 2000 },
          content: { type: 'string', maxLength: 20000 },
          isFavorite: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const body = request.body;
    const title = text(body.title, 200);
    const sourceUrlOrAuthor = text(body.sourceUrlOrAuthor ?? '', 500);
    const keyTakeaways = text(body.keyTakeaways ?? '', 2000, true);
    const content = text(body.content ?? '', 20000, true);
    const isFavorite = favoriteFlag(body.isFavorite) ?? 0;
    if (!title || sourceUrlOrAuthor === null || keyTakeaways === null || content === null) {
      return reply.code(400).send({ error: 'ข้อมูลในห้องสมุดไม่ถูกต้อง' });
    }
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO library_items (id, owner_id, title, category, status, source_url_or_author,
        key_takeaways, content, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, body.category ?? LIBRARY_CATEGORIES[0],
      body.status ?? LIBRARY_STATUSES[0], sourceUrlOrAuthor, keyTakeaways, content, isFavorite, now, now);
    const row = database.prepare(`${librarySelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(id, ownerId) as Record<string, unknown>;
    return reply.code(201).send({ item: withBoolean(row) });
  });

  app.put<{ Params: { itemId: string }; Body: Record<string, unknown> }>('/api/library/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          category: { type: 'string', enum: [...LIBRARY_CATEGORIES] },
          status: { type: 'string', enum: [...LIBRARY_STATUSES] },
          sourceUrlOrAuthor: { type: 'string', maxLength: 500 },
          keyTakeaways: { type: 'string', maxLength: 2000 },
          content: { type: 'string', maxLength: 20000 },
          isFavorite: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { itemId } = request.params;
    const current = database.prepare(`${librarySelect} WHERE id = ? AND owner_id = ?`)
      .get(itemId, ownerId) as Record<string, unknown> | undefined;
    if (!current) return reply.code(404).send({ error: 'ไม่พบรายการในห้องสมุดนี้' });

    const body = request.body;
    const assignments: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return reply.code(400).send({ error: 'ข้อมูลในห้องสมุดไม่ถูกต้อง' });
      assignments.push('title = ?');
      params.push(title);
    }
    if (body.category !== undefined) {
      assignments.push('category = ?');
      params.push(body.category as string);
    }
    if (body.status !== undefined) {
      assignments.push('status = ?');
      params.push(body.status as string);
    }
    for (const [field, column, max, allowNewlines] of [
      ['sourceUrlOrAuthor', 'source_url_or_author', 500, false],
      ['keyTakeaways', 'key_takeaways', 2000, true],
      ['content', 'content', 20000, true],
    ] as const) {
      if (body[field] === undefined) continue;
      const value = text(body[field], max, allowNewlines);
      if (value === null) return reply.code(400).send({ error: 'ข้อมูลในห้องสมุดไม่ถูกต้อง' });
      assignments.push(`${column} = ?`);
      params.push(value);
    }
    if (body.isFavorite !== undefined) {
      const isFavorite = favoriteFlag(body.isFavorite);
      if (isFavorite === null) return reply.code(400).send({ error: 'ข้อมูลในห้องสมุดไม่ถูกต้อง' });
      assignments.push('is_favorite = ?');
      params.push(isFavorite);
    }

    if (assignments.length === 0) return reply.code(400).send({ error: 'ไม่มีข้อมูลที่จะอัปเดต' });
    assignments.push('updated_at = ?');
    params.push(Date.now());
    database.prepare(`UPDATE library_items SET ${assignments.join(', ')} WHERE id = ? AND owner_id = ?`)
      .run(...params, itemId, ownerId);
    const row = database.prepare(`${librarySelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(itemId, ownerId) as Record<string, unknown>;
    return { item: withBoolean(row) };
  });

  app.delete<{ Params: { itemId: string } }>('/api/library/:itemId', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { itemId } = request.params;
    if (!owns(database, 'library_items', ownerId, itemId)) {
      return reply.code(404).send({ error: 'ไม่พบรายการในห้องสมุดนี้' });
    }
    database.transaction(() => {

      const now = Date.now();
      database.prepare('UPDATE library_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').run(now, now, itemId, ownerId);
    })();
    return reply.code(204).send();
  });
}
