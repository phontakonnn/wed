import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { cleanOrphanItemLinks, type SqliteDatabase } from './database.js';
import { isIsoDate, localToday, nextOccurrence, shiftIso } from './dates.js';
import { recomputeHabit } from './habit-logs.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const TIME_RANGE_PATTERN = '^([01]\\d|2[0-3]):[0-5]\\d\\s*-\\s*([01]\\d|2[0-3]):[0-5]\\d$';

const personSelect = `
  SELECT id, name, relationship_group AS relationshipGroup, role_label AS roleLabel,
    avatar_file_id AS avatarFileId, avatar_preset AS avatarPreset, avatar_data_url AS avatarDataUrl,
    birthday_or_anniversary AS birthdayOrAnniversary, phone,
    favorites_and_likes AS favoritesAndLikes, allergies_and_medical AS allergiesAndMedical,
    gift_ideas_and_sizes AS giftIdeasAndSizes, memo,
    created_at AS createdAt, updated_at AS updatedAt
  FROM people
`;

const personListSelect = `
  SELECT p.id, p.name, p.relationship_group AS relationshipGroup, p.role_label AS roleLabel,
    p.avatar_file_id AS avatarFileId, p.avatar_preset AS avatarPreset, p.avatar_data_url AS avatarDataUrl,
    p.birthday_or_anniversary AS birthdayOrAnniversary, p.phone,
    p.favorites_and_likes AS favoritesAndLikes, p.allergies_and_medical AS allergiesAndMedical,
    p.gift_ideas_and_sizes AS giftIdeasAndSizes, p.memo,
    p.created_at AS createdAt, p.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM note_people np WHERE np.person_id = p.id) AS noteCount,
    (SELECT GROUP_CONCAT(pt.tag_id) FROM person_tags pt WHERE pt.person_id = p.id) AS tagIds
  FROM people p
`;

export const reminderSelect = `
  SELECT r.id, r.title, r.target_date AS targetDate, r.category, r.priority,
    r.linked_person_id AS linkedPersonId, p.name AS linkedPersonName,
    r.is_completed AS isCompleted, r.notify_days_before AS notifyDaysBefore,
    r.recurrence, r.recurrence_anchor_date AS recurrenceAnchorDate,
    r.snoozed_until AS snoozedUntil, r.last_completed_at AS lastCompletedAt,
    COALESCE(r.snoozed_until, r.target_date) AS effectiveDate,
    r.created_at AS createdAt, r.updated_at AS updatedAt
  FROM reminders r
  LEFT JOIN people p ON p.id = r.linked_person_id AND p.owner_id = r.owner_id
`;

export const timeblockSelect = `
  SELECT id, block_date AS blockDate, time_range AS timeRange, title,
    life_area AS lifeArea, is_done AS isDone, created_at AS createdAt, updated_at AS updatedAt
  FROM life_timeblocks
`;

export const habitSelect = `
  SELECT id, title, current_count AS currentCount, daily_target AS dailyTarget, unit,
    streak_days AS streakDays, last_checked_date AS lastCheckedDate,
    tracking_start_date AS trackingStartDate,
    legacy_current_count AS legacyCurrentCount, legacy_streak_days AS legacyStreakDays,
    created_at AS createdAt, updated_at AS updatedAt
  FROM habits
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

function ownerHasFile(database: SqliteDatabase, ownerId: string, fileId: string): boolean {
  return database.prepare('SELECT 1 FROM files WHERE id = ? AND owner_id = ?').get(fileId, ownerId) !== undefined;
}

function ownerHasPerson(database: SqliteDatabase, ownerId: string, personId: string): boolean {
  return database.prepare('SELECT 1 FROM people WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(personId, ownerId) !== undefined;
}

export function registerLifeOsRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // ---------------------------------------------------------------- people
  app.get<{
    Querystring: { page: number; pageSize: number; group?: string; q?: string; tagId?: string };
  }>('/api/people', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          group: { type: 'string', enum: ['family', 'partner', 'friend'] },
          q: { type: 'string', maxLength: 120 },
          tagId: { type: 'string', maxLength: 36 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const { page, pageSize, group, tagId } = request.query;
    const query = text(request.query.q ?? '', 120) ?? '';
    const conditions = ['p.owner_id = ?', 'p.deleted_at IS NULL'];
    const params: Array<string | number> = [ownerId];
    if (group) {
      conditions.push('p.relationship_group = ?');
      params.push(group);
    }
    if (tagId) {
      conditions.push('EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = ?)');
      params.push(tagId);
    }
    if (query) {
      conditions.push(`(
        instr(nfc(p.name), nfc(?)) > 0 OR instr(nfc(p.role_label), nfc(?)) > 0
        OR instr(nfc(p.favorites_and_likes), nfc(?)) > 0
        OR instr(nfc(p.allergies_and_medical), nfc(?)) > 0
        OR instr(nfc(p.gift_ideas_and_sizes), nfc(?)) > 0
        OR instr(nfc(p.memo), nfc(?)) > 0
      )`);
      params.push(query, query, query, query, query, query);
    }
    const where = conditions.join(' AND ');
    const total = (database.prepare(`SELECT COUNT(*) AS total FROM people p WHERE ${where}`)
      .get(...params) as { total: number }).total;
    const people = database.prepare(`
      ${personListSelect}
      WHERE ${where}
      ORDER BY p.relationship_group, p.name COLLATE NOCASE, p.id
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    return { people, page, pageSize, total };
  });

  app.post<{
    Body: {
      name: string;
      relationshipGroup: 'family' | 'partner' | 'friend';
      roleLabel?: string;
      avatarFileId?: string;
      avatarDataUrl?: string;
      avatarPreset?: string;
      birthdayOrAnniversary?: string;
      phone?: string;
      favoritesAndLikes?: string;
      allergiesAndMedical?: string;
      giftIdeasAndSizes?: string;
      memo?: string;
    };
  }>('/api/people', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'relationshipGroup'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          relationshipGroup: { type: 'string', enum: ['family', 'partner', 'friend'] },
          roleLabel: { type: 'string', maxLength: 80 },
          avatarFileId: { type: 'string', maxLength: 36 },
          avatarDataUrl: { type: 'string', maxLength: 5000000 },
          avatarPreset: { type: 'string', maxLength: 40 },
          birthdayOrAnniversary: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          phone: { type: 'string', maxLength: 40 },
          favoritesAndLikes: { type: 'string', maxLength: 4000 },
          allergiesAndMedical: { type: 'string', maxLength: 4000 },
          giftIdeasAndSizes: { type: 'string', maxLength: 4000 },
          memo: { type: 'string', maxLength: 8000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const name = text(request.body.name, 120);
    const roleLabel = text(request.body.roleLabel ?? '', 80);
    const avatarPreset = text(request.body.avatarPreset ?? '', 40);
    const birthday = text(request.body.birthdayOrAnniversary ?? '', 10);
    const phone = text(request.body.phone ?? '', 40);
    const favorites = text(request.body.favoritesAndLikes ?? '', 4000, true);
    const allergies = text(request.body.allergiesAndMedical ?? '', 4000, true);
    const gifts = text(request.body.giftIdeasAndSizes ?? '', 4000, true);
    const memo = text(request.body.memo ?? '', 8000, true);
    if (!name || roleLabel === null || avatarPreset === null || birthday === null
      || phone === null || favorites === null || allergies === null || gifts === null || memo === null) {
      return reply.code(400).send({ error: 'ข้อมูลบุคคลไม่ถูกต้อง' });
    }
    if (birthday && !isIsoDate(birthday)) return reply.code(400).send({ error: 'วันที่สำคัญไม่ถูกต้อง' });
    const avatarFileId = request.body.avatarFileId?.trim() || null;
    if (avatarFileId && !ownerHasFile(database, ownerId, avatarFileId)) {
      return reply.code(400).send({ error: 'ไม่พบไฟล์รูปโปรไฟล์' });
    }
    const avatarDataUrl = request.body.avatarDataUrl?.trim() || null;
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO people (id, owner_id, name, relationship_group, role_label, avatar_file_id, avatar_data_url,
        avatar_preset, birthday_or_anniversary, phone, favorites_and_likes, allergies_and_medical,
        gift_ideas_and_sizes, memo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, request.body.relationshipGroup, roleLabel, avatarFileId, avatarDataUrl,
      avatarPreset || null, birthday, phone, favorites, allergies, gifts, memo, now, now);
    const person = database.prepare(`${personSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`).get(id, ownerId);
    return reply.code(201).send({ person });
  });

  app.get<{ Params: { personId: string } }>('/api/people/:personId', {
    schema: { params: { type: 'object', required: ['personId'], properties: { personId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const person = database.prepare(`${personSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(request.params.personId, ownerId);
    if (!person) return reply.code(404).send({ error: 'ไม่พบบุคคลนี้' });
    return { person };
  });

  app.patch<{
    Params: { personId: string };
    Body: Record<string, unknown>;
  }>('/api/people/:personId', {
    schema: {
      params: { type: 'object', required: ['personId'], properties: { personId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          relationshipGroup: { type: 'string', enum: ['family', 'partner', 'friend'] },
          roleLabel: { type: 'string', maxLength: 80 },
          avatarFileId: { type: ['string', 'null'], maxLength: 36 },
          avatarDataUrl: { type: ['string', 'null'], maxLength: 5000000 },
          avatarPreset: { type: ['string', 'null'], maxLength: 40 },
          birthdayOrAnniversary: { type: 'string', pattern: `^$|${ISO_DATE_PATTERN}` },
          phone: { type: 'string', maxLength: 40 },
          favoritesAndLikes: { type: 'string', maxLength: 4000 },
          allergiesAndMedical: { type: 'string', maxLength: 4000 },
          giftIdeasAndSizes: { type: 'string', maxLength: 4000 },
          memo: { type: 'string', maxLength: 8000 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM people WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .get(request.params.personId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบบุคคลนี้' });
    const body = request.body;
    const name = body.name === undefined ? existing.name as string : text(body.name, 120);
    const group = body.relationshipGroup === undefined ? existing.relationship_group as string : body.relationshipGroup;
    const roleLabel = body.roleLabel === undefined ? existing.role_label as string : text(body.roleLabel, 80);
    const phone = body.phone === undefined ? existing.phone as string : text(body.phone, 40);
    const birthday = body.birthdayOrAnniversary === undefined
      ? existing.birthday_or_anniversary as string
      : text(body.birthdayOrAnniversary, 10);
    const favorites = body.favoritesAndLikes === undefined
      ? existing.favorites_and_likes as string
      : text(body.favoritesAndLikes, 4000, true);
    const allergies = body.allergiesAndMedical === undefined
      ? existing.allergies_and_medical as string
      : text(body.allergiesAndMedical, 4000, true);
    const gifts = body.giftIdeasAndSizes === undefined
      ? existing.gift_ideas_and_sizes as string
      : text(body.giftIdeasAndSizes, 4000, true);
    const memo = body.memo === undefined ? existing.memo as string : text(body.memo, 8000, true);
    if (!name || roleLabel === null || phone === null || birthday === null
      || favorites === null || allergies === null || gifts === null || memo === null) {
      return reply.code(400).send({ error: 'ข้อมูลบุคคลไม่ถูกต้อง' });
    }
    if (birthday && !isIsoDate(birthday)) return reply.code(400).send({ error: 'วันที่สำคัญไม่ถูกต้อง' });
    let avatarFileId = existing.avatar_file_id as string | null;
    let avatarDataUrl = existing.avatar_data_url as string | null;
    if (body.avatarDataUrl !== undefined) {
      avatarDataUrl = typeof body.avatarDataUrl === 'string' && body.avatarDataUrl.trim() ? body.avatarDataUrl.trim() : null;
    }
    if (body.avatarFileId !== undefined) {
      avatarFileId = typeof body.avatarFileId === 'string' && body.avatarFileId.trim()
        ? body.avatarFileId.trim()
        : null;
      if (avatarFileId && !ownerHasFile(database, ownerId, avatarFileId)) {
        return reply.code(400).send({ error: 'ไม่พบไฟล์รูปโปรไฟล์' });
      }
    }
    const avatarPreset = body.avatarPreset === undefined
      ? existing.avatar_preset as string | null
      : (typeof body.avatarPreset === 'string' && body.avatarPreset.trim()
        ? text(body.avatarPreset, 40)
        : null);
    if (avatarPreset === null && body.avatarPreset !== undefined && body.avatarPreset !== null
      && body.avatarPreset !== '') {
      return reply.code(400).send({ error: 'อวตารไม่ถูกต้อง' });
    }
    database.prepare(`
      UPDATE people SET name = ?, relationship_group = ?, role_label = ?, avatar_file_id = ?, avatar_data_url = ?,
        avatar_preset = ?, birthday_or_anniversary = ?, phone = ?, favorites_and_likes = ?,
        allergies_and_medical = ?, gift_ideas_and_sizes = ?, memo = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(name, group, roleLabel, avatarFileId, avatarDataUrl, avatarPreset, birthday, phone, favorites,
      allergies, gifts, memo, Date.now(), request.params.personId, ownerId);
    const person = database.prepare(`${personSelect} WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`)
      .get(request.params.personId, ownerId);
    return { person };
  });

  app.get<{ Params: { personId: string } }>('/api/people/:personId/tags', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const tags = database.prepare(`
      SELECT t.id, t.name, COALESCE(t.color, '#3b82f6') AS color
      FROM tags t
      JOIN person_tags pt ON pt.tag_id = t.id
      WHERE pt.person_id = ? AND pt.owner_id = ?
      ORDER BY t.name COLLATE NOCASE
    `).all(request.params.personId, ownerId);
    return { tags };
  });

  app.put<{
    Params: { personId: string };
    Body: { tagIds: string[] };
  }>('/api/people/:personId/tags', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const person = database.prepare('SELECT 1 FROM people WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(request.params.personId, ownerId);
    if (!person) return reply.code(404).send({ error: 'ไม่พบบุคคลนี้' });
    const tagIds = Array.isArray(request.body.tagIds) ? request.body.tagIds : [];
    database.transaction(() => {
      database.prepare('DELETE FROM person_tags WHERE person_id = ? AND owner_id = ?').run(request.params.personId, ownerId);
      const insert = database.prepare('INSERT INTO person_tags (person_id, tag_id, owner_id) VALUES (?, ?, ?)');
      for (const tagId of tagIds) {
        insert.run(request.params.personId, tagId, ownerId);
      }
    })();
    const tags = database.prepare(`
      SELECT t.id, t.name, COALESCE(t.color, '#3b82f6') AS color
      FROM tags t
      JOIN person_tags pt ON pt.tag_id = t.id
      WHERE pt.person_id = ? AND pt.owner_id = ?
      ORDER BY t.name COLLATE NOCASE
    `).all(request.params.personId, ownerId);
    return { tags };
  });
  app.delete<{ Params: { personId: string } }>('/api/people/:personId', {
    schema: { params: { type: 'object', required: ['personId'], properties: { personId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const now = Date.now();
    const result = database.prepare('UPDATE people SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL')
      .run(now, now, request.params.personId, ownerId);


    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบบุคคลนี้' });
    return reply.code(204).send();
  });

  app.get<{ Params: { personId: string } }>('/api/people/:personId/notes', {
    schema: { params: { type: 'object', required: ['personId'], properties: { personId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!ownerHasPerson(database, ownerId, request.params.personId)) {
      return reply.code(404).send({ error: 'ไม่พบบุคคลนี้' });
    }
    const notes = database.prepare(`
      SELECT n.id, n.title, n.content, n.created_at AS createdAt, n.updated_at AS updatedAt
      FROM notes n
      JOIN note_people np ON np.note_id = n.id
      WHERE np.person_id = ? AND np.owner_id = ? AND n.deleted_at IS NULL
      ORDER BY n.updated_at DESC, n.id
      LIMIT 100
    `).all(request.params.personId, ownerId);
    return { notes };
  });

  // -------------------------------------------------------------- reminders
  app.get<{
    Querystring: { from?: string; to?: string; completed?: boolean; days?: number };
  }>('/api/reminders', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', pattern: ISO_DATE_PATTERN },
          to: { type: 'string', pattern: ISO_DATE_PATTERN },
          completed: { type: 'boolean' },
          days: { type: 'integer', minimum: 1, maximum: 3650 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const conditions = ['r.owner_id = ?'];
    const params: Array<string | number> = [ownerId];
    if (request.query.completed !== undefined) {
      conditions.push('r.is_completed = ?');
      params.push(request.query.completed ? 1 : 0);
    }
    if (request.query.from) {
      conditions.push('r.target_date >= ?');
      params.push(request.query.from);
    }
    if (request.query.to) {
      conditions.push('r.target_date <= ?');
      params.push(request.query.to);
    }
    if (request.query.days !== undefined) {
      conditions.push('r.target_date BETWEEN ? AND ?');
      params.push(localToday(), shiftIso(localToday(), request.query.days));
    }
    const reminders = database.prepare(`
      ${reminderSelect} WHERE ${conditions.join(' AND ')}
      ORDER BY r.is_completed, r.target_date, r.created_at
      LIMIT 500
    `).all(...params);
    return { reminders };
  });

  app.get<{ Querystring: { days?: number } }>('/api/reminders/upcoming', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 45 } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const days = request.query.days ?? 45;
    const reminders = database.prepare(`
      ${reminderSelect}
      WHERE r.owner_id = ? AND r.is_completed = 0
        AND COALESCE(r.snoozed_until, r.target_date) BETWEEN ? AND ?
      ORDER BY COALESCE(r.snoozed_until, r.target_date), r.created_at
    `).all(ownerId, localToday(), shiftIso(localToday(), days));
    return { reminders, today: localToday() };
  });

  const reminderBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'targetDate', 'category'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      targetDate: { type: 'string', pattern: ISO_DATE_PATTERN },
      category: { type: 'string', enum: ['birthday', 'anniversary', 'health', 'backup', 'other'] },
      priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      linkedPersonId: { type: ['string', 'null'], maxLength: 36 },
      isCompleted: { type: 'boolean' },
      notifyDaysBefore: { type: 'integer', minimum: 0, maximum: 365 },
      recurrence: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] },
    },
  } as const;

  app.post<{ Body: Record<string, unknown> }>('/api/reminders', {
    schema: { body: reminderBodySchema },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = text(request.body.title, 200);
    const targetDate = request.body.targetDate as string;
    if (!title || !isIsoDate(targetDate)) return reply.code(400).send({ error: 'ข้อมูลแจ้งเตือนไม่ถูกต้อง' });
    const linkedPersonId = typeof request.body.linkedPersonId === 'string' && request.body.linkedPersonId.trim()
      ? request.body.linkedPersonId.trim()
      : null;
    if (linkedPersonId && !ownerHasPerson(database, ownerId, linkedPersonId)) {
      return reply.code(400).send({ error: 'ไม่พบบุคคลที่เชื่อมโยง' });
    }
    const id = randomUUID();
    const now = Date.now();
    const recurrence = (request.body.recurrence as string | undefined) ?? 'none';
    database.prepare(`
      INSERT INTO reminders (id, owner_id, title, target_date, category, priority,
        linked_person_id, is_completed, notify_days_before, recurrence, recurrence_anchor_date,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, targetDate, request.body.category,
      request.body.priority ?? 'normal', linkedPersonId,
      request.body.isCompleted ? 1 : 0, request.body.notifyDaysBefore ?? 7,
      recurrence, recurrence === 'none' ? null : targetDate, now, now);
    const reminder = database.prepare(`${reminderSelect} WHERE r.id = ? AND r.owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ reminder });
  });

  app.patch<{ Params: { reminderId: string }; Body: Record<string, unknown> }>('/api/reminders/:reminderId', {
    schema: {
      params: { type: 'object', required: ['reminderId'], properties: { reminderId: { type: 'string', pattern: UUID_PATTERN } } },
      body: { ...reminderBodySchema, required: [] },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM reminders WHERE id = ? AND owner_id = ?')
      .get(request.params.reminderId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบแจ้งเตือนนี้' });
    const body = request.body;
    const title = body.title === undefined ? existing.title as string : text(body.title, 200);
    const targetDate = body.targetDate === undefined ? existing.target_date as string : body.targetDate as string;
    if (!title || !isIsoDate(targetDate)) return reply.code(400).send({ error: 'ข้อมูลแจ้งเตือนไม่ถูกต้อง' });
    let linkedPersonId = existing.linked_person_id as string | null;
    if (body.linkedPersonId !== undefined) {
      linkedPersonId = typeof body.linkedPersonId === 'string' && body.linkedPersonId.trim()
        ? body.linkedPersonId.trim()
        : null;
      if (linkedPersonId && !ownerHasPerson(database, ownerId, linkedPersonId)) {
        return reply.code(400).send({ error: 'ไม่พบบุคคลที่เชื่อมโยง' });
      }
    }
    const recurrence = (body.recurrence as string | undefined) ?? (existing.recurrence as string);
    let anchor = existing.recurrence_anchor_date as string | null;
    if (recurrence === 'none') anchor = null;
    else if (!anchor) anchor = targetDate;

    const wasComplete = Boolean(existing.is_completed);
    const wantsComplete = body.isCompleted === undefined ? wasComplete : body.isCompleted;
    const now = Date.now();
    let finalDate = targetDate;
    let finalCompleted = wantsComplete ? 1 : 0;
    let snoozedUntil = existing.snoozed_until as string | null;
    let lastCompletedAt = existing.last_completed_at as number | null;
    let rolledTo: string | null = null;

    if (wantsComplete && !wasComplete && recurrence !== 'none') {
      // A recurring reminder rolls forward instead of closing: the row keeps its identity and its
      // history, and only `target_date` moves. No duplicate row is created.
      rolledTo = nextOccurrence(targetDate, recurrence as 'daily' | 'weekly' | 'monthly' | 'yearly', anchor);
      finalDate = rolledTo;
      finalCompleted = 0;
      snoozedUntil = null;
      lastCompletedAt = now;
    } else if (wantsComplete) {
      snoozedUntil = null;
      lastCompletedAt = now;
    } else if (wasComplete) {
      lastCompletedAt = null;
    }

    database.prepare(`
      UPDATE reminders SET title = ?, target_date = ?, category = ?, priority = ?,
        linked_person_id = ?, is_completed = ?, notify_days_before = ?, recurrence = ?,
        recurrence_anchor_date = ?, snoozed_until = ?, last_completed_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(title, finalDate, body.category ?? existing.category,
      body.priority ?? existing.priority, linkedPersonId,
      finalCompleted,
      body.notifyDaysBefore ?? existing.notify_days_before,
      recurrence, anchor, snoozedUntil, lastCompletedAt, now,
      request.params.reminderId, ownerId);
    const reminder = database.prepare(`${reminderSelect} WHERE r.id = ? AND r.owner_id = ?`)
      .get(request.params.reminderId, ownerId);
    return { reminder, rolledTo };
  });

  // Snooze moves the effective date only; the recurrence anchor never changes, so a monthly or
  // yearly reminder keeps its original day-of-month/day-of-year.
  app.post<{ Params: { reminderId: string }; Body: { days: number; from?: string } }>(
    '/api/reminders/:reminderId/snooze',
    {
      schema: {
        params: { type: 'object', required: ['reminderId'], properties: { reminderId: { type: 'string', pattern: UUID_PATTERN } } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['days'],
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 30 },
            from: { type: 'string', pattern: ISO_DATE_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const existing = database.prepare('SELECT * FROM reminders WHERE id = ? AND owner_id = ?')
        .get(request.params.reminderId, ownerId) as Record<string, unknown> | undefined;
      if (!existing) return reply.code(404).send({ error: 'ไม่พบแจ้งเตือนนี้' });
      if (existing.is_completed) return reply.code(409).send({ error: 'รายการนี้ปิดแล้ว' });

      const effective = (existing.snoozed_until as string | null) ?? (existing.target_date as string);
      // `from` makes the call idempotent: a retried request with a stale base is rejected instead of
      // moving the date a second time.
      if (request.body.from && request.body.from !== effective) {
        const reminder = database.prepare(`${reminderSelect} WHERE r.id = ? AND r.owner_id = ?`)
          .get(request.params.reminderId, ownerId);
        return reply.code(409).send({ error: 'รายการถูกเลื่อนไปแล้ว', reminder });
      }
      const nextUntil = shiftIso(effective, request.body.days);
      database.prepare('UPDATE reminders SET snoozed_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run(nextUntil, Date.now(), request.params.reminderId, ownerId);
      const reminder = database.prepare(`${reminderSelect} WHERE r.id = ? AND r.owner_id = ?`)
        .get(request.params.reminderId, ownerId);
      return { reminder, snoozedFrom: effective, snoozedUntil: nextUntil };
    },
  );

  app.delete<{ Params: { reminderId: string } }>('/api/reminders/:reminderId', {
    schema: { params: { type: 'object', required: ['reminderId'], properties: { reminderId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM reminders WHERE id = ? AND owner_id = ?')
      .run(request.params.reminderId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบแจ้งเตือนนี้' });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------- timeblocks
  app.get<{ Querystring: { date?: string } }>('/api/timeblocks', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { date: { type: 'string', pattern: ISO_DATE_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const date = request.query.date ?? localToday();
    const blocks = database.prepare(`
      ${timeblockSelect} WHERE owner_id = ? AND block_date = ? ORDER BY time_range, created_at
    `).all(ownerId, date);
    return { blocks, date };
  });

  const timeblockBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['blockDate', 'timeRange', 'title', 'lifeArea'],
    properties: {
      blockDate: { type: 'string', pattern: ISO_DATE_PATTERN },
      timeRange: { type: 'string', pattern: TIME_RANGE_PATTERN },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      lifeArea: { type: 'string', enum: ['health', 'focus_work', 'family', 'growth', 'other'] },
      isDone: { type: 'boolean' },
    },
  } as const;

  app.post<{ Body: Record<string, unknown> }>('/api/timeblocks', {
    schema: { body: timeblockBodySchema },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = text(request.body.title, 200);
    const timeRange = text(request.body.timeRange, 40);
    if (!title || !timeRange) return reply.code(400).send({ error: 'ข้อมูลตารางชีวิตไม่ถูกต้อง' });
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO life_timeblocks (id, owner_id, block_date, time_range, title, life_area, is_done, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, request.body.blockDate, timeRange, title, request.body.lifeArea,
      request.body.isDone ? 1 : 0, now, now);
    const block = database.prepare(`${timeblockSelect} WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ block });
  });

  app.patch<{ Params: { blockId: string }; Body: Record<string, unknown> }>('/api/timeblocks/:blockId', {
    schema: {
      params: { type: 'object', required: ['blockId'], properties: { blockId: { type: 'string', pattern: UUID_PATTERN } } },
      body: { ...timeblockBodySchema, required: [] },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM life_timeblocks WHERE id = ? AND owner_id = ?')
      .get(request.params.blockId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบช่วงเวลานี้' });
    const body = request.body;
    const title = body.title === undefined ? existing.title as string : text(body.title, 200);
    if (!title) return reply.code(400).send({ error: 'ข้อมูลตารางชีวิตไม่ถูกต้อง' });
    database.prepare(`
      UPDATE life_timeblocks SET block_date = ?, time_range = ?, title = ?, life_area = ?,
        is_done = ?, updated_at = ? WHERE id = ? AND owner_id = ?
    `).run(body.blockDate ?? existing.block_date, body.timeRange ?? existing.time_range,
      title, body.lifeArea ?? existing.life_area,
      body.isDone === undefined ? existing.is_done : (body.isDone ? 1 : 0),
      Date.now(), request.params.blockId, ownerId);
    const block = database.prepare(`${timeblockSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.blockId, ownerId);
    return { block };
  });

  app.delete<{ Params: { blockId: string } }>('/api/timeblocks/:blockId', {
    schema: { params: { type: 'object', required: ['blockId'], properties: { blockId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM life_timeblocks WHERE id = ? AND owner_id = ?')
      .run(request.params.blockId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบช่วงเวลานี้' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ habits
  app.get('/api/habits', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const habits = database.prepare(`${habitSelect} WHERE owner_id = ? ORDER BY created_at, id`).all(ownerId);
    return { habits, today: localToday() };
  });

  const habitBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 120 },
      dailyTarget: { type: 'integer', minimum: 1, maximum: 1000 },
      unit: { type: 'string', maxLength: 20 },
      currentCount: { type: 'integer', minimum: 0, maximum: 9999 },
      streakDays: { type: 'integer', minimum: 0, maximum: 100000 },
      lastCheckedDate: { type: ['string', 'null'], pattern: `^$|${ISO_DATE_PATTERN}` },
    },
  } as const;

  app.post<{ Body: Record<string, unknown> }>('/api/habits', {
    schema: { body: habitBodySchema },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const title = text(request.body.title, 120);
    const unit = text(request.body.unit ?? 'ครั้ง', 20);
    if (!title || !unit) return reply.code(400).send({ error: 'ข้อมูลกิจวัตรไม่ถูกต้อง' });
    const id = randomUUID();
    const now = Date.now();
    // History starts the day the habit is created; earlier days are reported as untracked rather
    // than as missed.
    database.prepare(`
      INSERT INTO habits (id, owner_id, title, current_count, daily_target, unit, streak_days,
        last_checked_date, tracking_start_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, title, request.body.currentCount ?? 0, request.body.dailyTarget ?? 1,
      unit, request.body.streakDays ?? 0, request.body.lastCheckedDate || null,
      localToday(), now, now);
    const habit = database.prepare(`${habitSelect} WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    return reply.code(201).send({ habit });
  });

  app.patch<{ Params: { habitId: string }; Body: Record<string, unknown> }>('/api/habits/:habitId', {
    schema: {
      params: { type: 'object', required: ['habitId'], properties: { habitId: { type: 'string', pattern: UUID_PATTERN } } },
      body: { ...habitBodySchema, required: [] },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const existing = database.prepare('SELECT * FROM habits WHERE id = ? AND owner_id = ?')
      .get(request.params.habitId, ownerId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'ไม่พบกิจวัตรนี้' });
    const body = request.body;
    const title = body.title === undefined ? existing.title as string : text(body.title, 120);
    if (!title) return reply.code(400).send({ error: 'ข้อมูลกิจวัตรไม่ถูกต้อง' });
    database.prepare(`
      UPDATE habits SET title = ?, current_count = ?, daily_target = ?, unit = ?, streak_days = ?,
        last_checked_date = ?, updated_at = ? WHERE id = ? AND owner_id = ?
    `).run(title, body.currentCount ?? existing.current_count, body.dailyTarget ?? existing.daily_target,
      body.unit ?? existing.unit, body.streakDays ?? existing.streak_days,
      body.lastCheckedDate === undefined ? existing.last_checked_date : (body.lastCheckedDate || null),
      Date.now(), request.params.habitId, ownerId);
    const habit = database.prepare(`${habitSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.habitId, ownerId);
    return { habit };
  });

  app.post<{ Params: { habitId: string }; Body: { date?: string } }>('/api/habits/:habitId/check', {
    schema: {
      params: { type: 'object', required: ['habitId'], properties: { habitId: { type: 'string', pattern: UUID_PATTERN } } },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { date: { type: 'string', pattern: ISO_DATE_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const habit = database.prepare('SELECT * FROM habits WHERE id = ? AND owner_id = ?')
      .get(request.params.habitId, ownerId) as Record<string, unknown> | undefined;
    if (!habit) return reply.code(404).send({ error: 'ไม่พบกิจวัตรนี้' });
    const date = request.body?.date ?? localToday();
    if (!isIsoDate(date)) return reply.code(400).send({ error: 'วันที่ไม่ถูกต้อง' });
    const today = localToday();
    if (date > today) return reply.code(400).send({ error: 'บันทึกวันในอนาคตไม่ได้' });
    const trackingStart = habit.tracking_start_date as string | null;
    if (trackingStart && date < trackingStart) {
      return reply.code(400).send({ error: `เริ่มเก็บประวัติเมื่อ ${trackingStart}` });
    }

    // The log is the source of truth; the counters on `habits` are recomputed from it.
    const existingLog = database.prepare(
      'SELECT count FROM habit_logs WHERE habit_id = ? AND owner_id = ? AND log_date = ?',
    ).get(request.params.habitId, ownerId, date) as { count: number } | undefined;
    const target = habit.daily_target as number;
    const nextCount = Math.min((existingLog?.count ?? 0) + 1, target);
    const now = Date.now();
    if (!existingLog || nextCount !== existingLog.count) {
      database.prepare(`
        INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (habit_id, log_date) DO UPDATE SET
          count = excluded.count,
          target_snapshot = excluded.target_snapshot,
          updated_at = excluded.updated_at
      `).run(randomUUID(), ownerId, request.params.habitId, date, nextCount, target, now, now);
      recomputeHabit(database, ownerId, request.params.habitId);
    }
    const updated = database.prepare(`${habitSelect} WHERE id = ? AND owner_id = ?`)
      .get(request.params.habitId, ownerId);
    const log = database.prepare(`
      SELECT id, habit_id AS habitId, log_date AS logDate, count, target_snapshot AS targetSnapshot
      FROM habit_logs WHERE habit_id = ? AND owner_id = ? AND log_date = ?
    `).get(request.params.habitId, ownerId, date) ?? null;
    return { habit: updated, log };
  });

  app.delete<{ Params: { habitId: string } }>('/api/habits/:habitId', {
    schema: { params: { type: 'object', required: ['habitId'], properties: { habitId: { type: 'string', pattern: UUID_PATTERN } } } },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const result = database.prepare('DELETE FROM habits WHERE id = ? AND owner_id = ?')
      .run(request.params.habitId, ownerId);
    if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบกิจวัตรนี้' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ search
  // One search endpoint for every module. `types` and `from`/`to` narrow it; every branch stays
  // owner-scoped and every value is bound as a parameter.
  app.get<{ Querystring: { q: string; limit?: number; types?: string; from?: string; to?: string } }>(
    '/api/search',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 120 },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
            types: { type: 'string', maxLength: 200 },
            from: { type: 'string', pattern: ISO_DATE_PATTERN },
            to: { type: 'string', pattern: ISO_DATE_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const query = text(request.query.q, 120);
      if (!query) return reply.code(400).send({ error: 'คำค้นไม่ถูกต้อง' });
      const limit = request.query.limit ?? 8;

      const allowed = [
        'notes', 'tasks', 'projects', 'goals', 'people', 'reminders', 'bookmarks', 'files',
        'vault', 'library',
      ];
      const requested = request.query.types
        ? request.query.types.split(',').map((entry) => entry.trim()).filter(Boolean)
        : allowed;
      const unknown = requested.filter((entry) => !allowed.includes(entry));
      if (unknown.length > 0) {
        return reply.code(400).send({ error: `ประเภทข้อมูลไม่ถูกต้อง: ${unknown.join(', ')}` });
      }
      const wanted = new Set(requested);

      const from = request.query.from ?? null;
      const to = request.query.to ?? null;
      // The JSON-schema pattern only checks the shape; 2026-13-01 must still be rejected.
      if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
        return reply.code(400).send({ error: 'รูปแบบวันที่ไม่ถูกต้อง' });
      }
      if (from && to && from > to) {
        return reply.code(400).send({ error: 'ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด' });
      }
      // Date filters use ISO day boundaries; millisecond columns are compared at midnight.
      const fromMs = from ? Date.parse(`${from}T00:00:00`) : null;
      const toMs = to ? Date.parse(`${to}T23:59:59.999`) : null;

      // Date filtering happens inside SQL, before LIMIT. Filtering afterwards would return fewer
      // rows than requested whenever a page of recent rows falls outside the range.
      const isoFilter = (column: string) => {
        const parts: string[] = [];
        const params: Array<string | number> = [];
        if (from) { parts.push(`AND ${column} >= ?`); params.push(from); }
        if (to) { parts.push(`AND ${column} <= ?`); params.push(to); }
        return { sql: parts.join(' '), params };
      };
      const msFilter = (column: string) => {
        const parts: string[] = [];
        const params: Array<string | number> = [];
        if (fromMs !== null) { parts.push(`AND ${column} >= ?`); params.push(fromMs); }
        if (toMs !== null) { parts.push(`AND ${column} <= ?`); params.push(toMs); }
        return { sql: parts.join(' '), params };
      };

      const noteDates = msFilter('updated_at');
      const taskDates = isoFilter('due_date');
      const projectDates = isoFilter('due_date');
      const goalDates = isoFilter('due_date');
      const reminderDates = isoFilter('COALESCE(r.snoozed_until, r.target_date)');
      const bookmarkDates = msFilter('created_at');
      const fileDates = msFilter('created_at');
      // Vault rows without a renewal date are excluded once a range is given, exactly like tasks
      // and projects without a due date: an undated record cannot be inside a date range.
      const vaultDates = isoFilter('renewal_or_expiry_date');
      const libraryDates = msFilter('updated_at');

      const notes = wanted.has('notes')
        ? database.prepare(`
            SELECT id, title, content, updated_at AS updatedAt
            FROM notes
            WHERE owner_id = ? AND deleted_at IS NULL
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(content)), nfc(lower(?))) > 0)
              ${noteDates.sql}
            ORDER BY updated_at DESC, id
            LIMIT ?
          `).all(ownerId, query, query, ...noteDates.params, limit)
        : [];

      const people = wanted.has('people')
        ? database.prepare(`
            SELECT id, name, relationship_group AS relationshipGroup, role_label AS roleLabel,
              avatar_file_id AS avatarFileId, avatar_preset AS avatarPreset, avatar_data_url AS avatarDataUrl,
              birthday_or_anniversary AS birthdayOrAnniversary
            FROM people
            WHERE owner_id = ?
              AND (instr(nfc(lower(name)), nfc(lower(?))) > 0
                OR instr(nfc(lower(role_label)), nfc(lower(?))) > 0
                OR instr(nfc(lower(favorites_and_likes)), nfc(lower(?))) > 0
                OR instr(nfc(lower(allergies_and_medical)), nfc(lower(?))) > 0
                OR instr(nfc(lower(gift_ideas_and_sizes)), nfc(lower(?))) > 0
                OR instr(nfc(lower(memo)), nfc(lower(?))) > 0)
            ORDER BY name COLLATE NOCASE
            LIMIT ?
          `).all(ownerId, query, query, query, query, query, query, limit)
        : [];

      const reminders = wanted.has('reminders')
        ? database.prepare(`
            ${reminderSelect}
            WHERE r.owner_id = ?
              AND (instr(nfc(lower(r.title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(r.category)), nfc(lower(?))) > 0)
              ${reminderDates.sql}
            ORDER BY COALESCE(r.snoozed_until, r.target_date)
            LIMIT ?
          `).all(ownerId, query, query, ...reminderDates.params, limit)
        : [];

      const tasks = wanted.has('tasks')
        ? database.prepare(`
            SELECT id, title, status, priority, due_date AS dueDate
            FROM tasks
            WHERE owner_id = ?
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(detail)), nfc(lower(?))) > 0)
              ${taskDates.sql}
            ORDER BY (due_date IS NULL), due_date, updated_at DESC
            LIMIT ?
          `).all(ownerId, query, query, ...taskDates.params, limit)
        : [];

      const projects = wanted.has('projects')
        ? database.prepare(`
            SELECT id, name, status, due_date AS dueDate
            FROM projects
            WHERE owner_id = ?
              AND (instr(nfc(lower(name)), nfc(lower(?))) > 0
                OR instr(nfc(lower(description)), nfc(lower(?))) > 0
                OR instr(nfc(lower(outcome)), nfc(lower(?))) > 0)
              ${projectDates.sql}
            ORDER BY (due_date IS NULL), due_date, updated_at DESC
            LIMIT ?
          `).all(ownerId, query, query, query, ...projectDates.params, limit)
        : [];

      const goals = wanted.has('goals')
        ? (database.prepare(`
            SELECT id, title, status, metric, target_value AS targetValue, current_value AS currentValue,
              due_date AS dueDate
            FROM goals
            WHERE owner_id = ?
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(metric)), nfc(lower(?))) > 0)
              ${goalDates.sql}
            ORDER BY (due_date IS NULL), due_date, updated_at DESC
            LIMIT ?
          `).all(ownerId, query, query, ...goalDates.params, limit) as Array<Record<string, unknown>>)
        : [];

      const bookmarks = wanted.has('bookmarks')
        ? database.prepare(`
            SELECT id, title, url, description, created_at AS createdAt
            FROM bookmarks
            WHERE owner_id = ?
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(description)), nfc(lower(?))) > 0
                OR instr(nfc(lower(url)), nfc(lower(?))) > 0)
              ${bookmarkDates.sql}
            ORDER BY created_at DESC
            LIMIT ?
          `).all(ownerId, query, query, query, ...bookmarkDates.params, limit)
        : [];

      // Files are matched on their stored display name and media type only. There is no text
      // extraction from the bytes, so this must not be described as content search.
      const files = wanted.has('files')
        ? database.prepare(`
            SELECT id, display_name AS displayName, media_type AS mediaType,
              size_bytes AS sizeBytes, created_at AS createdAt
            FROM files
            WHERE owner_id = ?
              AND (instr(nfc(lower(display_name)), nfc(lower(?))) > 0
                OR instr(nfc(lower(media_type)), nfc(lower(?))) > 0)
              ${fileDates.sql}
            ORDER BY created_at DESC
            LIMIT ?
          `).all(ownerId, query, query, ...fileDates.params, limit)
        : [];

      // Vault search covers the label, the stored code, where the original is kept, the amount text
      // and the notes. It does not decrypt anything: `key_value` is stored as entered.
      const vault = wanted.has('vault')
        ? database.prepare(`
            SELECT id, title, category, key_value AS keyValue,
              renewal_or_expiry_date AS renewalOrExpiryDate, amount_text AS amountText,
              physical_location AS physicalLocation
            FROM vault_items
            WHERE owner_id = ?
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(key_value)), nfc(lower(?))) > 0
                OR instr(nfc(lower(physical_location)), nfc(lower(?))) > 0
                OR instr(nfc(lower(amount_text)), nfc(lower(?))) > 0
                OR instr(nfc(lower(notes)), nfc(lower(?))) > 0)
              ${vaultDates.sql}
            ORDER BY (renewal_or_expiry_date IS NULL), renewal_or_expiry_date, updated_at DESC
            LIMIT ?
          `).all(ownerId, query, query, query, query, query, ...vaultDates.params, limit)
        : [];

      const library = wanted.has('library')
        ? database.prepare(`
            SELECT id, title, category, status, source_url_or_author AS sourceUrlOrAuthor,
              key_takeaways AS keyTakeaways
            FROM library_items
            WHERE owner_id = ?
              AND (instr(nfc(lower(title)), nfc(lower(?))) > 0
                OR instr(nfc(lower(key_takeaways)), nfc(lower(?))) > 0
                OR instr(nfc(lower(content)), nfc(lower(?))) > 0
                OR instr(nfc(lower(source_url_or_author)), nfc(lower(?))) > 0)
              ${libraryDates.sql}
            ORDER BY is_favorite DESC, updated_at DESC
            LIMIT ?
          `).all(ownerId, query, query, query, query, ...libraryDates.params, limit)
        : [];

      return {
        notes, people, reminders, tasks, projects, goals, bookmarks, files, vault, library, query,
      };
    },
  );
}
