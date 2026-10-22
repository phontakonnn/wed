import { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'checkbox' | 'select' | 'url' | 'file';
  required: boolean;
  defaultValue?: any;
  options?: string[]; // for 'select'
}

export function registerCustomTypesRoutes(app: FastifyInstance, database: Database.Database): void {
  // GET /api/custom-types
  app.get('/api/custom-types', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const rows = database.prepare(`
      SELECT id, owner_id AS ownerId, name, description, icon, color, category,
             is_shared AS isShared, fields_schema AS fieldsSchema,
             created_at AS createdAt, updated_at AS updatedAt
      FROM custom_data_types
      WHERE (owner_id = ? OR is_shared = 1) AND deleted_at IS NULL
      ORDER BY created_at ASC
    `).all(ownerId) as Array<{
      id: string;
      ownerId: string;
      name: string;
      description: string;
      icon: string;
      color: string;
      category: string;
      isShared: number;
      fieldsSchema: string;
      createdAt: number;
      updatedAt: number;
    }>;

    const types = rows.map((r) => {
      let fields: CustomFieldDefinition[] = [];
      try {
        fields = JSON.parse(r.fieldsSchema);
      } catch {
        fields = [];
      }
      return {
        ...r,
        userId: r.ownerId,
        isShared: Boolean(r.isShared),
        fieldsSchema: fields,
        fields,
      };
    });

    return { types };
  });

  // POST /api/custom-types
  app.post<{
    Body: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      category?: string;
      isShared?: boolean;
      fieldsSchema?: CustomFieldDefinition[];
      fields?: CustomFieldDefinition[];
    };
  }>('/api/custom-types', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const body = request.body || ({} as any);
    const { name, description = '', icon = 'Folder', color = '#3B82F6', category = 'general', isShared = false } = body;
    const rawFields = body.fields || body.fieldsSchema || [];

    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ error: 'กรุณาระบุชื่อประเภทข้อมูล' });
    }

    const id = randomUUID();
    const now = Date.now();
    const schemaJson = JSON.stringify(rawFields);

    database.prepare(`
      INSERT INTO custom_data_types (id, owner_id, name, description, icon, color, category, is_shared, fields_schema, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name.trim(), description.trim(), icon, color, category, isShared ? 1 : 0, schemaJson, now, now);

    const createdType = {
      id,
      ownerId,
      userId: ownerId,
      name: name.trim(),
      description: description.trim(),
      icon,
      color,
      category,
      isShared: Boolean(isShared),
      fieldsSchema: rawFields,
      fields: rawFields,
      createdAt: now,
      updatedAt: now,
    };

    return reply.code(201).send({
      ok: true,
      type: createdType,
      ...createdType,
    });
  });

  // GET /api/custom-types/:id
  app.get<{ Params: { id: string } }>('/api/custom-types/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const row = database.prepare(`
      SELECT id, owner_id AS ownerId, name, description, icon, color, category,
             is_shared AS isShared, fields_schema AS fieldsSchema,
             created_at AS createdAt, updated_at AS updatedAt
      FROM custom_data_types
      WHERE id = ? AND (owner_id = ? OR is_shared = 1) AND deleted_at IS NULL
    `).get(request.params.id, ownerId) as any;

    if (!row) return reply.code(404).send({ error: 'ไม่พบประเภทข้อมูล' });

    try {
      row.fieldsSchema = JSON.parse(row.fieldsSchema);
    } catch {
      row.fieldsSchema = [];
    }
    row.isShared = Boolean(row.isShared);

    return { type: row };
  });

  // PUT /api/custom-types/:id
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      category?: string;
      isShared?: boolean;
      fieldsSchema?: CustomFieldDefinition[];
    };
  }>('/api/custom-types/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare('SELECT * FROM custom_data_types WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(request.params.id, ownerId) as any;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบประเภทข้อมูล' });

    const { name = existing.name, description = existing.description, icon = existing.icon, color = existing.color, category = existing.category, isShared = Boolean(existing.is_shared), fieldsSchema } = request.body || {};

    const schemaJson = fieldsSchema !== undefined ? JSON.stringify(fieldsSchema) : existing.fields_schema;
    const now = Date.now();

    database.prepare(`
      UPDATE custom_data_types
      SET name = ?, description = ?, icon = ?, color = ?, category = ?, is_shared = ?, fields_schema = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(name, description, icon, color, category, isShared ? 1 : 0, schemaJson, now, request.params.id, ownerId);

    const parsedFields = fieldsSchema !== undefined ? fieldsSchema : JSON.parse(existing.fields_schema || '[]');
    const updatedType = {
      id: request.params.id,
      ownerId,
      userId: ownerId,
      name,
      description,
      icon,
      color,
      category,
      isShared,
      fieldsSchema: parsedFields,
      fields: parsedFields,
      updatedAt: now,
    };

    return { ok: true, id: request.params.id, type: updatedType };
  });

  // DELETE /api/custom-types/:id
  app.delete<{ Params: { id: string } }>('/api/custom-types/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare(`
      UPDATE custom_data_types SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id, ownerId);

    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบประเภทข้อมูล' });
    return reply.code(204).send();
  });

  // ----------------------------------------------------------------- records
  // GET /api/custom-types/:typeId/records
  app.get<{ Params: { typeId: string }; Querystring: { search?: string } }>('/api/custom-types/:typeId/records', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const search = (request.query.search || '').trim().toLowerCase();

    const rows = database.prepare(`
      SELECT r.id, r.owner_id AS ownerId, r.type_id AS typeId, r.title, r.data,
             r.created_at AS createdAt, r.updated_at AS updatedAt,
             f.created_at AS favoritedAt
      FROM custom_data_records r
      LEFT JOIN favorites f ON f.item_type = 'custom_record' AND f.item_id = r.id AND f.owner_id = ?
      WHERE r.type_id = ? AND r.owner_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
    `).all(ownerId, request.params.typeId, ownerId) as Array<{
      id: string;
      ownerId: string;
      typeId: string;
      title: string;
      data: string;
      createdAt: number;
      updatedAt: number;
      favoritedAt: number | null;
    }>;

    const records = rows.map((r) => {
      let parsedData: Record<string, any> = {};
      try {
        parsedData = JSON.parse(r.data);
      } catch {
        parsedData = {};
      }
      return {
        ...r,
        data: parsedData,
        isFavorited: r.favoritedAt !== null,
      };
    }).filter((r) => {
      if (!search) return true;
      if (r.title.toLowerCase().includes(search)) return true;
      return Object.values(r.data).some((val) => String(val).toLowerCase().includes(search));
    });

    return { records };
  });

  // POST /api/custom-types/:typeId/records
  app.post<{
    Params: { typeId: string };
    Body: { title: string; data?: Record<string, any> };
  }>('/api/custom-types/:typeId/records', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    // Validate type exists
    const type = database.prepare('SELECT id FROM custom_data_types WHERE id = ? AND (owner_id = ? OR is_shared = 1) AND deleted_at IS NULL').get(request.params.typeId, ownerId);
    if (!type) return reply.code(404).send({ error: 'ไม่พบประเภทข้อมูล' });

    const { title, data = {} } = request.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'กรุณาระบุชื่อรายการ' });
    }

    const id = randomUUID();
    const now = Date.now();
    const dataJson = JSON.stringify(data);

    database.prepare(`
      INSERT INTO custom_data_records (id, owner_id, type_id, title, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, request.params.typeId, title.trim(), dataJson, now, now);

    const createdRecord = {
      id,
      ownerId,
      userId: ownerId,
      typeId: request.params.typeId,
      title: title.trim(),
      data,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    return reply.code(201).send({
      ok: true,
      record: createdRecord,
      ...createdRecord,
    });
  });

  // GET /api/custom-types/:typeId/records/:id
  app.get<{ Params: { typeId: string; id: string } }>('/api/custom-types/:typeId/records/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const row = database.prepare(`
      SELECT id, owner_id AS ownerId, type_id AS typeId, title, data,
             created_at AS createdAt, updated_at AS updatedAt
      FROM custom_data_records
      WHERE id = ? AND type_id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.id, request.params.typeId, ownerId) as any;

    if (!row) return reply.code(404).send({ error: 'ไม่พบรายการข้อมูล' });

    try {
      row.data = JSON.parse(row.data);
    } catch {
      row.data = {};
    }

    return { record: row };
  });

  // PUT /api/custom-types/:typeId/records/:id
  app.put<{
    Params: { typeId: string; id: string };
    Body: { title?: string; data?: Record<string, any> };
  }>('/api/custom-types/:typeId/records/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare(`
      SELECT * FROM custom_data_records WHERE id = ? AND type_id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.id, request.params.typeId, ownerId) as any;

    if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการข้อมูล' });

    const { title = existing.title, data } = request.body || {};
    const dataJson = data !== undefined ? JSON.stringify(data) : existing.data;
    const now = Date.now();

    database.prepare(`
      UPDATE custom_data_records
      SET title = ?, data = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(title, dataJson, now, request.params.id, ownerId);

    const updatedRecord = {
      id: request.params.id,
      typeId: request.params.typeId,
      ownerId,
      userId: ownerId,
      title,
      data: data !== undefined ? data : JSON.parse(existing.data || '{}'),
      updatedAt: now,
    };

    return { ok: true, id: request.params.id, record: updatedRecord };
  });

  // DELETE /api/custom-types/:typeId/records/:id
  app.delete<{ Params: { typeId: string; id: string } }>('/api/custom-types/:typeId/records/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare(`
      UPDATE custom_data_records SET deleted_at = ?, updated_at = ? WHERE id = ? AND type_id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id, request.params.typeId, ownerId);

    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการข้อมูล' });
    return reply.code(204).send();
  });

  // PUT /api/custom-records/:id
  app.put<{
    Params: { id: string };
    Body: { title?: string; data?: Record<string, any> };
  }>('/api/custom-records/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const existing = database.prepare(`
      SELECT * FROM custom_data_records WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).get(request.params.id, ownerId) as any;

    if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการข้อมูล' });

    const { title = existing.title, data } = request.body || {};
    const dataJson = data !== undefined ? JSON.stringify(data) : existing.data;
    const now = Date.now();

    database.prepare(`
      UPDATE custom_data_records
      SET title = ?, data = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(title, dataJson, now, request.params.id, ownerId);

    const updatedRecord = {
      id: request.params.id,
      typeId: existing.type_id,
      ownerId,
      userId: ownerId,
      title,
      data: data !== undefined ? data : JSON.parse(existing.data || '{}'),
      updatedAt: now,
    };

    return { ok: true, id: request.params.id, record: updatedRecord };
  });

  // DELETE /api/custom-records/:id
  app.delete<{ Params: { id: string } }>('/api/custom-records/:id', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const now = Date.now();
    const result = database.prepare(`
      UPDATE custom_data_records SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id, ownerId);

    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการข้อมูล' });
    return reply.code(204).send();
  });
}
