import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';
import { isIsoDate, localToday, nextOccurrence, shiftIso } from './dates.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

const TASK_STATUSES = ['todo', 'doing', 'waiting', 'done', 'cancelled'] as const;
const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
const PROJECT_STATUSES = ['planned', 'active', 'paused', 'done', 'archived'] as const;
const GOAL_STATUSES = ['active', 'achieved', 'dropped'] as const;
const GOAL_HORIZONS = ['week', 'month', 'quarter', 'year', 'life'] as const;
const INBOX_KINDS = ['text', 'url', 'file', 'task', 'reminder'] as const;
const INBOX_STATUSES = ['new', 'triaged', 'archived'] as const;
const CONVERT_TARGETS = ['note', 'task', 'project', 'bookmark', 'reminder'] as const;

export const taskSelect = `
  SELECT t.id, t.title, t.detail, t.status, t.priority,
    t.due_date AS dueDate, t.start_date AS startDate,
    t.project_id AS projectId, pr.name AS projectName,
    t.goal_id AS goalId, g.title AS goalTitle,
    t.person_id AS personId, pe.name AS personName,
    t.recurrence, t.completed_at AS completedAt,
    t.created_at AS createdAt, t.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id) AS checklistTotal,
    (SELECT COUNT(*) FROM task_checklist_items c WHERE c.task_id = t.id AND c.is_done = 1) AS checklistDone
  FROM tasks t
  LEFT JOIN projects pr ON pr.id = t.project_id AND pr.owner_id = t.owner_id
  LEFT JOIN goals g ON g.id = t.goal_id AND g.owner_id = t.owner_id
  LEFT JOIN people pe ON pe.id = t.person_id AND pe.owner_id = t.owner_id
`;

export const projectSelect = `
  SELECT p.id, p.name, p.description, p.outcome, p.status, p.area,
    p.goal_id AS goalId, g.title AS goalTitle,
    p.start_date AS startDate, p.due_date AS dueDate, p.completed_at AS completedAt,
    p.created_at AS createdAt, p.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS taskTotal,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS taskDone
  FROM projects p
  LEFT JOIN goals g ON g.id = p.goal_id AND g.owner_id = p.owner_id
`;

export const goalSelect = `
  SELECT g.id, g.title, g.description, g.metric,
    g.target_value AS targetValue, g.current_value AS currentValue, g.unit,
    g.horizon, g.status, g.due_date AS dueDate,
    g.created_at AS createdAt, g.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM projects p
      WHERE p.goal_id = g.id AND p.status IN ('planned', 'active', 'paused')) AS activeProjects
  FROM goals g
`;

export const inboxSelect = `
  SELECT id, body, kind, status, converted_type AS convertedType, converted_id AS convertedId,
    created_at AS createdAt, updated_at AS updatedAt
  FROM inbox_items
`;

const checklistSelect = `
  SELECT id, task_id AS taskId, title, is_done AS isDone, position, created_at AS createdAt
  FROM task_checklist_items
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

function progressPercent(target: unknown, current: unknown): number | null {
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null;
  const value = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function owns(database: SqliteDatabase, table: string, ownerId: string, id: string): boolean {
  return database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ?`).get(id, ownerId) !== undefined;
}

type DateField =
  | { state: 'absent' }
  | { state: 'clear' }
  | { state: 'set'; value: string }
  | { state: 'invalid' };

/**
 * Three states matter here: an absent field means "keep the stored value" on PATCH, an empty
 * string or null means "clear it", and anything unparseable is an error. Collapsing them is how
 * a PATCH silently wipes a date.
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

export function registerWorkRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // ------------------------------------------------------------------ inbox

  app.get<{ Querystring: { status?: string; page: number; pageSize: number } }>('/api/inbox', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['new', 'triaged', 'archived', 'all'] },
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { page, pageSize } = request.query;
    const status = request.query.status ?? 'new';
    const where = status === 'all' ? 'owner_id = ?' : 'owner_id = ? AND status = ?';
    const params: Array<string | number> = status === 'all' ? [ownerId] : [ownerId, status];
    const total = (database.prepare(`SELECT COUNT(*) AS total FROM inbox_items WHERE ${where}`)
      .get(...params) as { total: number }).total;
    const items = database.prepare(`
      ${inboxSelect}
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const newCount = (database.prepare(
      "SELECT COUNT(*) AS total FROM inbox_items WHERE owner_id = ? AND status = 'new'",
    ).get(ownerId) as { total: number }).total;
    return { items, page, pageSize, total, newCount };
  });

  app.post<{ Body: { body: string; kind?: string } }>('/api/inbox', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 4000 },
          kind: { type: 'string', enum: [...INBOX_KINDS] },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const body = text(request.body.body, 4000, true);
    if (!body) return reply.code(400).send({ error: 'ข้อความไม่ถูกต้อง' });
    const inferred = request.body.kind
      ?? (/^https?:\/\/\S+$/i.test(body) ? 'url' : 'text');
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO inbox_items (id, owner_id, body, kind, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'new', ?, ?)
    `).run(id, ownerId, body, inferred, now, now);
    const item = database.prepare(`${inboxSelect} WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ item });
  });

  app.patch<{ Params: { itemId: string }; Body: { body?: string; kind?: string; status?: string } }>(
    '/api/inbox/:itemId',
    {
      schema: {
        params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            body: { type: 'string', minLength: 1, maxLength: 4000 },
            kind: { type: 'string', enum: [...INBOX_KINDS] },
            status: { type: 'string', enum: [...INBOX_STATUSES] },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const existing = database.prepare('SELECT * FROM inbox_items WHERE id = ? AND owner_id = ?')
        .get(request.params.itemId, ownerId) as Record<string, unknown> | undefined;
      if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการนี้' });
      const nextBody = request.body.body === undefined
        ? existing.body
        : text(request.body.body, 4000, true);
      if (!nextBody) return reply.code(400).send({ error: 'ข้อความไม่ถูกต้อง' });
      database.prepare(`
        UPDATE inbox_items SET body = ?, kind = ?, status = ?, updated_at = ? WHERE id = ? AND owner_id = ?
      `).run(
        nextBody,
        request.body.kind ?? existing.kind,
        request.body.status ?? existing.status,
        Date.now(),
        request.params.itemId,
        ownerId,
      );
      const item = database.prepare(`${inboxSelect} WHERE id = ? AND owner_id = ?`)
        .get(request.params.itemId, ownerId);
      return { item };
    },
  );

  app.delete<{ Params: { itemId: string } }>('/api/inbox/:itemId', {
    schema: { params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM inbox_items WHERE id = ? AND owner_id = ?')
      .run(request.params.itemId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการนี้' });
    return reply.code(204).send();
  });

  app.post<{
    Params: { itemId: string };
    Body: { target: string; title?: string; url?: string; targetDate?: string };
  }>('/api/inbox/:itemId/convert', {
    schema: {
      params: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['target'],
        properties: {
          target: { type: 'string', enum: [...CONVERT_TARGETS] },
          title: { type: 'string', maxLength: 200 },
          url: { type: 'string', maxLength: 2048 },
          targetDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const item = database.prepare('SELECT * FROM inbox_items WHERE id = ? AND owner_id = ?')
      .get(request.params.itemId, ownerId) as Record<string, unknown> | undefined;
    if (!item) return reply.code(404).send({ error: 'ไม่พบรายการนี้' });
    if (item.converted_id) return reply.code(409).send({ error: 'รายการนี้ถูกแปลงไปแล้ว' });
    if (item.status === 'archived') return reply.code(409).send({ error: 'รายการนี้ถูกเก็บเข้าคลังแล้ว' });

    const body = String(item.body);
    const title = text(request.body.title ?? body.split('\n')[0], 200) ?? body.slice(0, 200);
    const now = Date.now();
    const createdId = randomUUID();

    database.exec('BEGIN IMMEDIATE');
    try {
      if (request.body.target === 'note') {
        database.prepare(`
          INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(createdId, ownerId, title, body, now, now);
      } else if (request.body.target === 'task') {
        database.prepare(`
          INSERT INTO tasks (id, owner_id, title, detail, status, priority, created_at, updated_at)
          VALUES (?, ?, ?, '', 'todo', 'normal', ?, ?)
        `).run(createdId, ownerId, title, now, now);
      } else if (request.body.target === 'project') {
        database.prepare(`
          INSERT INTO projects (id, owner_id, name, description, status, created_at, updated_at)
          VALUES (?, ?, ?, '', 'active', ?, ?)
        `).run(createdId, ownerId, title, now, now);
      } else if (request.body.target === 'bookmark') {
        const url = text(request.body.url ?? body, 2048);
        if (!url || !/^https?:\/\/\S+$/i.test(url)) {
          database.exec('ROLLBACK');
          return reply.code(400).send({ error: 'ต้องระบุ URL ที่ขึ้นต้นด้วย http หรือ https' });
        }
        database.prepare(`
          INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, '', ?, ?)
        `).run(createdId, ownerId, title, url, now, now);
      } else {
        const targetDate = request.body.targetDate && isIsoDate(request.body.targetDate)
          ? request.body.targetDate
          : localToday();
        database.prepare(`
          INSERT INTO reminders (id, owner_id, title, target_date, category, priority,
            linked_person_id, is_completed, notify_days_before, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'other', 'normal', NULL, 0, 7, ?, ?)
        `).run(createdId, ownerId, title, targetDate, now, now);
      }
      database.prepare(`
        UPDATE inbox_items SET status = 'triaged', converted_type = ?, converted_id = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?
      `).run(request.body.target, createdId, now, request.params.itemId, ownerId);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    const updated = database.prepare(`${inboxSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.itemId, ownerId);
    return reply.code(201).send({ item: updated, target: request.body.target, targetId: createdId });
  });

  // --------------------------------------------------------------- projects

  app.get<{ Querystring: { status?: string; page: number; pageSize: number } }>('/api/projects', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: [...PROJECT_STATUSES, 'all'] },
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { page, pageSize } = request.query;
    const status = request.query.status ?? 'active';
    const where = status === 'all' ? 'p.owner_id = ?' : 'p.owner_id = ? AND p.status = ?';
    const params: Array<string | number> = status === 'all' ? [ownerId] : [ownerId, status];
    const total = (database.prepare(`SELECT COUNT(*) AS total FROM projects p WHERE ${where}`)
      .get(...params) as { total: number }).total;
    const projects = database.prepare(`
      ${projectSelect}
      WHERE ${where}
      ORDER BY (p.due_date IS NULL), p.due_date, p.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    return { projects, page, pageSize, total };
  });

  app.post<{
    Body: {
      name: string;
      description?: string;
      outcome?: string;
      status?: string;
      area?: string;
      goalId?: string | null;
      startDate?: string;
      dueDate?: string;
    };
  }>('/api/projects', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string', maxLength: 5000 },
          outcome: { type: 'string', maxLength: 2000 },
          status: { type: 'string', enum: [...PROJECT_STATUSES] },
          area: { type: 'string', maxLength: 80 },
          goalId: { type: ['string', 'null'], maxLength: 36 },
          startDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const name = text(request.body.name, 160);
    const description = text(request.body.description ?? '', 5000, true);
    const outcome = text(request.body.outcome ?? '', 2000, true);
    const area = text(request.body.area ?? '', 80);
    const startDate = parseDateField(request.body.startDate);
    const dueDate = parseDateField(request.body.dueDate);
    if (!name || description === null || outcome === null || area === null
      || startDate.state === 'invalid' || dueDate.state === 'invalid') {
      return reply.code(400).send({ error: 'ข้อมูลโปรเจกต์ไม่ถูกต้อง' });
    }
    const goalId = request.body.goalId?.trim() || null;
    if (goalId && !owns(database, 'goals', ownerId, goalId)) {
      return reply.code(400).send({ error: 'ไม่พบเป้าหมายที่เชื่อมโยง' });
    }
    const id = randomUUID();
    const now = Date.now();
    const status = request.body.status ?? 'active';
    database.prepare(`
      INSERT INTO projects (id, owner_id, name, description, outcome, status, area, goal_id,
        start_date, due_date, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, description, outcome, status, area, goalId,
      startDate.state === 'set' ? startDate.value : null,
      dueDate.state === 'set' ? dueDate.value : null,
      status === 'done' ? now : null, now, now);
    const project = database.prepare(`${projectSelect} WHERE p.id = ? AND p.owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ project });
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', {
    schema: { params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const project = database.prepare(`${projectSelect} WHERE p.id = ? AND p.owner_id = ?`)
      .get(request.params.projectId, ownerId);
    if (!project) return reply.code(404).send({ error: 'ไม่พบโปรเจกต์นี้' });
    return { project };
  });

  app.patch<{ Params: { projectId: string }; Body: Record<string, unknown> }>('/api/projects/:projectId', {
    schema: {
      params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string', maxLength: 5000 },
          outcome: { type: 'string', maxLength: 2000 },
          status: { type: 'string', enum: [...PROJECT_STATUSES] },
          area: { type: 'string', maxLength: 80 },
          goalId: { type: ['string', 'null'], maxLength: 36 },
          startDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?')
      .get(request.params.projectId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบโปรเจกต์นี้' });

    const name = request.body.name === undefined ? existing.name : text(request.body.name, 160);
    if (!name) return reply.code(400).send({ error: 'ชื่อโปรเจกต์ไม่ถูกต้อง' });
    const description = request.body.description === undefined
      ? existing.description : text(request.body.description, 5000, true);
    const outcome = request.body.outcome === undefined
      ? existing.outcome : text(request.body.outcome, 2000, true);
    const area = request.body.area === undefined ? existing.area : text(request.body.area, 80);
    if (description === null || outcome === null || area === null) {
      return reply.code(400).send({ error: 'ข้อมูลโปรเจกต์ไม่ถูกต้อง' });
    }
    const startDate = parseDateField(request.body.startDate);
    const dueDate = parseDateField(request.body.dueDate);
    if (startDate.state === 'invalid' || dueDate.state === 'invalid') {
      return reply.code(400).send({ error: 'วันที่ไม่ถูกต้อง' });
    }
    let goalId: string | null = existing.goal_id as string | null;
    if (request.body.goalId !== undefined) {
      goalId = typeof request.body.goalId === 'string' && request.body.goalId.trim()
        ? request.body.goalId.trim()
        : null;
      if (goalId && !owns(database, 'goals', ownerId, goalId)) {
        return reply.code(400).send({ error: 'ไม่พบเป้าหมายที่เชื่อมโยง' });
      }
    }
    const status = (request.body.status as string | undefined) ?? (existing.status as string);
    const completedAt = status === 'done'
      ? (existing.completed_at ?? Date.now())
      : null;
    database.prepare(`
      UPDATE projects SET name = ?, description = ?, outcome = ?, status = ?, area = ?, goal_id = ?,
        start_date = ?, due_date = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(name, description, outcome, status, area, goalId,
      startDate.state === 'absent' ? existing.start_date : startDate.state === 'set' ? startDate.value : null,
      dueDate.state === 'absent' ? existing.due_date : dueDate.state === 'set' ? dueDate.value : null,
      completedAt, Date.now(), request.params.projectId, ownerId);
    const project = database.prepare(`${projectSelect} WHERE p.id = ? AND p.owner_id = ?`)
      .get(request.params.projectId, ownerId);
    return { project };
  });

  app.delete<{ Params: { projectId: string } }>('/api/projects/:projectId', {
    schema: { params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?')
      .run(request.params.projectId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบโปรเจกต์นี้' });
    return reply.code(204).send();
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/tasks', {
    schema: { params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!owns(database, 'projects', ownerId, request.params.projectId)) {
      return reply.code(404).send({ error: 'ไม่พบโปรเจกต์นี้' });
    }
    const tasks = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.project_id = ?
      ORDER BY (t.due_date IS NULL), t.due_date, t.created_at
    `).all(ownerId, request.params.projectId);
    return { tasks };
  });

  // ------------------------------------------------------------------ goals

  app.get<{ Querystring: { status?: string } }>('/api/goals', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { status: { type: 'string', enum: [...GOAL_STATUSES, 'all'] } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const status = request.query.status ?? 'active';
    const where = status === 'all' ? 'g.owner_id = ?' : 'g.owner_id = ? AND g.status = ?';
    const params: string[] = status === 'all' ? [ownerId] : [ownerId, status];
    const rows = database.prepare(`
      ${goalSelect}
      WHERE ${where}
      ORDER BY (g.due_date IS NULL), g.due_date, g.created_at DESC
    `).all(...params) as Array<Record<string, unknown>>;
    const goals = rows.map((row) => ({
      ...row,
      progressPercent: progressPercent(row.targetValue, row.currentValue),
    }));
    return { goals };
  });

  app.post<{
    Body: {
      title: string;
      description?: string;
      metric?: string;
      targetValue?: number | null;
      currentValue?: number;
      unit?: string;
      horizon?: string;
      status?: string;
      dueDate?: string;
    };
  }>('/api/goals', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 5000 },
          metric: { type: 'string', maxLength: 500 },
          targetValue: { type: ['number', 'null'] },
          currentValue: { type: 'number' },
          unit: { type: 'string', maxLength: 20 },
          horizon: { type: 'string', enum: [...GOAL_HORIZONS] },
          status: { type: 'string', enum: [...GOAL_STATUSES] },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = text(request.body.title, 200);
    const description = text(request.body.description ?? '', 5000, true);
    const metric = text(request.body.metric ?? '', 500);
    const unit = text(request.body.unit ?? '', 20);
    const dueDate = parseDateField(request.body.dueDate);
    if (!title || description === null || metric === null || unit === null || dueDate.state === 'invalid') {
      return reply.code(400).send({ error: 'ข้อมูลเป้าหมายไม่ถูกต้อง' });
    }
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO goals (id, owner_id, title, description, metric, target_value, current_value,
        unit, horizon, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, description, metric,
      request.body.targetValue ?? null,
      request.body.currentValue ?? 0,
      unit,
      request.body.horizon ?? 'year',
      request.body.status ?? 'active',
      dueDate.state === 'set' ? dueDate.value : null, now, now);
    const row = database.prepare(`${goalSelect} WHERE g.id = ? AND g.owner_id = ?`)
      .get(id, ownerId) as Record<string, unknown>;
    return reply.code(201).send({
      goal: { ...row, progressPercent: progressPercent(row.targetValue, row.currentValue) },
    });
  });

  app.patch<{ Params: { goalId: string }; Body: Record<string, unknown> }>('/api/goals/:goalId', {
    schema: {
      params: { type: 'object', required: ['goalId'], properties: { goalId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 5000 },
          metric: { type: 'string', maxLength: 500 },
          targetValue: { type: ['number', 'null'] },
          currentValue: { type: 'number' },
          unit: { type: 'string', maxLength: 20 },
          horizon: { type: 'string', enum: [...GOAL_HORIZONS] },
          status: { type: 'string', enum: [...GOAL_STATUSES] },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM goals WHERE id = ? AND owner_id = ?')
      .get(request.params.goalId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบเป้าหมายนี้' });

    const title = request.body.title === undefined ? existing.title : text(request.body.title, 200);
    if (!title) return reply.code(400).send({ error: 'ชื่อเป้าหมายไม่ถูกต้อง' });
    const description = request.body.description === undefined
      ? existing.description : text(request.body.description, 5000, true);
    const metric = request.body.metric === undefined
      ? existing.metric : text(request.body.metric, 500);
    const unit = request.body.unit === undefined ? existing.unit : text(request.body.unit, 20);
    const dueDate = parseDateField(request.body.dueDate);
    if (description === null || metric === null || unit === null || dueDate.state === 'invalid') {
      return reply.code(400).send({ error: 'ข้อมูลเป้าหมายไม่ถูกต้อง' });
    }
    database.prepare(`
      UPDATE goals SET title = ?, description = ?, metric = ?, target_value = ?, current_value = ?,
        unit = ?, horizon = ?, status = ?, due_date = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      title, description, metric,
      request.body.targetValue === undefined ? existing.target_value : request.body.targetValue,
      request.body.currentValue === undefined ? existing.current_value : request.body.currentValue,
      unit,
      request.body.horizon ?? existing.horizon,
      request.body.status ?? existing.status,
      dueDate.state === 'absent' ? existing.due_date : dueDate.state === 'set' ? dueDate.value : null,
      Date.now(), request.params.goalId, ownerId,
    );
    const row = database.prepare(`${goalSelect} WHERE g.id = ? AND g.owner_id = ?`)
      .get(request.params.goalId, ownerId) as Record<string, unknown>;
    return { goal: { ...row, progressPercent: progressPercent(row.targetValue, row.currentValue) } };
  });

  app.delete<{ Params: { goalId: string } }>('/api/goals/:goalId', {
    schema: { params: { type: 'object', required: ['goalId'], properties: { goalId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM goals WHERE id = ? AND owner_id = ?')
      .run(request.params.goalId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบเป้าหมายนี้' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ tasks

  app.get<{
    Querystring: {
      status?: string;
      projectId?: string;
      goalId?: string;
      due?: string;
      page: number;
      pageSize: number;
    };
  }>('/api/tasks', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: [...TASK_STATUSES, 'open', 'all'] },
          projectId: { type: 'string', maxLength: 36 },
          goalId: { type: 'string', maxLength: 36 },
          due: { type: 'string', enum: ['today', 'overdue', 'week', 'none'] },
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const today = localToday();
    const conditions = ['t.owner_id = ?'];
    const params: Array<string | number> = [ownerId];
    const status = request.query.status ?? 'open';
    if (status === 'open') {
      conditions.push("t.status IN ('todo', 'doing', 'waiting')");
    } else if (status !== 'all') {
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (request.query.projectId) {
      conditions.push('t.project_id = ?');
      params.push(request.query.projectId);
    }
    if (request.query.goalId) {
      conditions.push('t.goal_id = ?');
      params.push(request.query.goalId);
    }
    if (request.query.due === 'today') {
      conditions.push('t.due_date = ?');
      params.push(today);
    } else if (request.query.due === 'overdue') {
      conditions.push("t.due_date IS NOT NULL AND t.due_date < ? AND t.status NOT IN ('done', 'cancelled')");
      params.push(today);
    } else if (request.query.due === 'week') {
      conditions.push('t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?');
      params.push(today, shiftIso(today, 7));
    } else if (request.query.due === 'none') {
      conditions.push('t.due_date IS NULL');
    }
    const where = conditions.join(' AND ');
    const { page, pageSize } = request.query;
    const total = (database.prepare(`SELECT COUNT(*) AS total FROM tasks t WHERE ${where}`)
      .get(...params) as { total: number }).total;
    const tasks = database.prepare(`
      ${taskSelect}
      WHERE ${where}
      ORDER BY (t.due_date IS NULL), t.due_date,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.created_at
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    return { tasks, page, pageSize, total, today };
  });

  app.get('/api/tasks/today', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const today = localToday();
    const overdue = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.due_date IS NOT NULL AND t.due_date < ?
        AND t.status NOT IN ('done', 'cancelled')
      ORDER BY t.due_date, t.created_at
    `).all(ownerId, today);
    const dueToday = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.due_date = ? AND t.status NOT IN ('done', 'cancelled')
      ORDER BY t.created_at
    `).all(ownerId, today);
    const upcoming = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.due_date > ? AND t.due_date <= ?
        AND t.status NOT IN ('done', 'cancelled')
      ORDER BY t.due_date, t.created_at
      LIMIT 20
    `).all(ownerId, today, shiftIso(today, 7));
    return { today, overdue, dueToday, upcoming };
  });

  app.post<{
    Body: {
      title: string;
      detail?: string;
      status?: string;
      priority?: string;
      dueDate?: string;
      startDate?: string;
      projectId?: string | null;
      goalId?: string | null;
      personId?: string | null;
      recurrence?: string;
    };
  }>('/api/tasks', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          detail: { type: 'string', maxLength: 20000 },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          priority: { type: 'string', enum: [...TASK_PRIORITIES] },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          startDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          projectId: { type: ['string', 'null'], maxLength: 36 },
          goalId: { type: ['string', 'null'], maxLength: 36 },
          personId: { type: ['string', 'null'], maxLength: 36 },
          recurrence: { type: 'string', enum: [...RECURRENCES] },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = text(request.body.title, 200);
    const detail = text(request.body.detail ?? '', 20000, true);
    const dueDate = parseDateField(request.body.dueDate);
    const startDate = parseDateField(request.body.startDate);
    if (!title || detail === null || dueDate.state === 'invalid' || startDate.state === 'invalid') {
      return reply.code(400).send({ error: 'ข้อมูลงานไม่ถูกต้อง' });
    }
    const projectId = request.body.projectId?.trim() || null;
    const goalId = request.body.goalId?.trim() || null;
    const personId = request.body.personId?.trim() || null;
    if (projectId && !owns(database, 'projects', ownerId, projectId)) {
      return reply.code(400).send({ error: 'ไม่พบโปรเจกต์ที่เชื่อมโยง' });
    }
    if (goalId && !owns(database, 'goals', ownerId, goalId)) {
      return reply.code(400).send({ error: 'ไม่พบเป้าหมายที่เชื่อมโยง' });
    }
    if (personId && !owns(database, 'people', ownerId, personId)) {
      return reply.code(400).send({ error: 'ไม่พบบุคคลที่เชื่อมโยง' });
    }
    const status = request.body.status ?? 'todo';
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO tasks (id, owner_id, title, detail, status, priority, due_date, start_date,
        project_id, goal_id, person_id, recurrence, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, detail, status, request.body.priority ?? 'normal',
      dueDate.state === 'set' ? dueDate.value : null,
      startDate.state === 'set' ? startDate.value : null,
      projectId, goalId, personId,
      request.body.recurrence ?? 'none', status === 'done' ? now : null, now, now);
    const task = database.prepare(`${taskSelect} WHERE t.id = ? AND t.owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ task });
  });

  app.get<{ Params: { taskId: string } }>('/api/tasks/:taskId', {
    schema: { params: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const task = database.prepare(`${taskSelect} WHERE t.id = ? AND t.owner_id = ?`)
      .get(request.params.taskId, ownerId);
    if (!task) return reply.code(404).send({ error: 'ไม่พบงานนี้' });
    const checklist = database.prepare(`
      ${checklistSelect}
      WHERE task_id = ? AND owner_id = ?
      ORDER BY position, created_at
    `).all(request.params.taskId, ownerId);
    return { task, checklist };
  });

  app.patch<{ Params: { taskId: string }; Body: Record<string, unknown> }>('/api/tasks/:taskId', {
    schema: {
      params: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          detail: { type: 'string', maxLength: 20000 },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          priority: { type: 'string', enum: [...TASK_PRIORITIES] },
          dueDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          startDate: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          projectId: { type: ['string', 'null'], maxLength: 36 },
          goalId: { type: ['string', 'null'], maxLength: 36 },
          personId: { type: ['string', 'null'], maxLength: 36 },
          recurrence: { type: 'string', enum: [...RECURRENCES] },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM tasks WHERE id = ? AND owner_id = ?')
      .get(request.params.taskId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบงานนี้' });

    const title = request.body.title === undefined ? existing.title : text(request.body.title, 200);
    if (!title) return reply.code(400).send({ error: 'ชื่องานไม่ถูกต้อง' });
    const detail = request.body.detail === undefined
      ? existing.detail : text(request.body.detail, 20000, true);
    if (detail === null) return reply.code(400).send({ error: 'รายละเอียดไม่ถูกต้อง' });
    const dueDate = parseDateField(request.body.dueDate);
    const startDate = parseDateField(request.body.startDate);
    if (dueDate.state === 'invalid' || startDate.state === 'invalid') {
      return reply.code(400).send({ error: 'วันที่ไม่ถูกต้อง' });
    }
    let projectId = existing.project_id as string | null;
    if (request.body.projectId !== undefined) {
      projectId = typeof request.body.projectId === 'string' && request.body.projectId.trim()
        ? request.body.projectId.trim() : null;
      if (projectId && !owns(database, 'projects', ownerId, projectId)) {
        return reply.code(400).send({ error: 'ไม่พบโปรเจกต์ที่เชื่อมโยง' });
      }
    }
    let goalId = existing.goal_id as string | null;
    if (request.body.goalId !== undefined) {
      goalId = typeof request.body.goalId === 'string' && request.body.goalId.trim()
        ? request.body.goalId.trim() : null;
      if (goalId && !owns(database, 'goals', ownerId, goalId)) {
        return reply.code(400).send({ error: 'ไม่พบเป้าหมายที่เชื่อมโยง' });
      }
    }
    let personId = existing.person_id as string | null;
    if (request.body.personId !== undefined) {
      personId = typeof request.body.personId === 'string' && request.body.personId.trim()
        ? request.body.personId.trim() : null;
      if (personId && !owns(database, 'people', ownerId, personId)) {
        return reply.code(400).send({ error: 'ไม่พบบุคคลที่เชื่อมโยง' });
      }
    }

    const status = (request.body.status as string | undefined) ?? (existing.status as string);
    const recurrence = (request.body.recurrence as string | undefined) ?? (existing.recurrence as string);
    const nextDue = dueDate.state === 'absent'
      ? (existing.due_date as string | null)
      : dueDate.state === 'set' ? dueDate.value : null;
    const completedAt = status === 'done' ? (existing.completed_at ?? Date.now()) : null;
    const now = Date.now();

    database.prepare(`
      UPDATE tasks SET title = ?, detail = ?, status = ?, priority = ?, due_date = ?, start_date = ?,
        project_id = ?, goal_id = ?, person_id = ?, recurrence = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      title, detail, status,
      request.body.priority ?? existing.priority,
      nextDue,
      startDate.state === 'absent' ? existing.start_date : startDate.state === 'set' ? startDate.value : null,
      projectId, goalId, personId, recurrence, completedAt, now,
      request.params.taskId, ownerId,
    );

    // A recurring task rolls forward by creating the next occurrence; the completed row stays
    // as history. Only the transition into `done` creates it, so re-saving cannot duplicate.
    let nextTask = null;
    const becameDone = status === 'done' && existing.status !== 'done';
    if (becameDone && recurrence !== 'none' && nextDue) {
      const nextId = randomUUID();
      database.prepare(`
        INSERT INTO tasks (id, owner_id, title, detail, status, priority, due_date, start_date,
          project_id, goal_id, person_id, recurrence, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(nextId, ownerId, title, detail, request.body.priority ?? existing.priority,
        nextOccurrence(nextDue, recurrence as 'daily' | 'weekly' | 'monthly' | 'yearly'),
        startDate.state === 'absent' ? existing.start_date : startDate.state === 'set' ? startDate.value : null,
        projectId, goalId, personId, recurrence, now, now);
      nextTask = database.prepare(`${taskSelect} WHERE t.id = ? AND t.owner_id = ?`).get(nextId, ownerId);
    }

    const task = database.prepare(`${taskSelect} WHERE t.id = ? AND t.owner_id = ?`)
      .get(request.params.taskId, ownerId);
    return { task, nextTask };
  });

  app.delete<{ Params: { taskId: string } }>('/api/tasks/:taskId', {
    schema: { params: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM tasks WHERE id = ? AND owner_id = ?')
      .run(request.params.taskId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบงานนี้' });
    return reply.code(204).send();
  });

  // --------------------------------------------------------------- checklist

  app.post<{ Params: { taskId: string }; Body: { title: string; position?: number } }>(
    '/api/tasks/:taskId/checklist',
    {
      schema: {
        params: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string', pattern: UUID_PATTERN } } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            position: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      if (!owns(database, 'tasks', ownerId, request.params.taskId)) {
        return reply.code(404).send({ error: 'ไม่พบงานนี้' });
      }
      const title = text(request.body.title, 200);
      if (!title) return reply.code(400).send({ error: 'ชื่อรายการย่อยไม่ถูกต้อง' });
      const id = randomUUID();
      const nextPosition = request.body.position
        ?? ((database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM task_checklist_items WHERE task_id = ?')
          .get(request.params.taskId) as { next: number }).next);
      database.prepare(`
        INSERT INTO task_checklist_items (id, task_id, owner_id, title, is_done, position, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(id, request.params.taskId, ownerId, title, nextPosition, Date.now());
      const item = database.prepare(`${checklistSelect} WHERE id = ? AND owner_id = ?`).get(id, ownerId);
      return reply.code(201).send({ item });
    },
  );

  app.patch<{ Params: { taskId: string; itemId: string }; Body: { title?: string; isDone?: boolean } }>(
    '/api/tasks/:taskId/checklist/:itemId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId', 'itemId'],
          properties: {
            taskId: { type: 'string', pattern: UUID_PATTERN },
            itemId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            isDone: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const existing = database.prepare(
        'SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ? AND owner_id = ?',
      ).get(request.params.itemId, request.params.taskId, ownerId) as Record<string, unknown> | undefined;
      if (!existing) return reply.code(404).send({ error: 'ไม่พบรายการย่อยนี้' });
      const title = request.body.title === undefined ? existing.title : text(request.body.title, 200);
      if (!title) return reply.code(400).send({ error: 'ชื่อรายการย่อยไม่ถูกต้อง' });
      database.prepare(`
        UPDATE task_checklist_items SET title = ?, is_done = ? WHERE id = ? AND task_id = ? AND owner_id = ?
      `).run(title, request.body.isDone === undefined
        ? existing.is_done
        : (request.body.isDone ? 1 : 0),
      request.params.itemId, request.params.taskId, ownerId);
      const item = database.prepare(`${checklistSelect} WHERE id = ? AND owner_id = ?`)
        .get(request.params.itemId, ownerId);
      return { item };
    },
  );

  app.delete<{ Params: { taskId: string; itemId: string } }>('/api/tasks/:taskId/checklist/:itemId', {
    schema: {
      params: {
        type: 'object',
        required: ['taskId', 'itemId'],
        properties: {
          taskId: { type: 'string', pattern: UUID_PATTERN },
          itemId: { type: 'string', pattern: UUID_PATTERN },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare(
      'DELETE FROM task_checklist_items WHERE id = ? AND task_id = ? AND owner_id = ?',
    ).run(request.params.itemId, request.params.taskId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบรายการย่อยนี้' });
    return reply.code(204).send();
  });
}
