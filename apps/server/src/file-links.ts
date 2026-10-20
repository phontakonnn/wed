import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';

/** Entity types that may carry file attachments. `asset`/`vault` stay out until D-1 is decided. */
const ENTITY_TABLES = {
  note: 'notes',
  task: 'tasks',
  project: 'projects',
  person: 'people',
  bookmark: 'bookmarks',
} as const;

type EntityType = keyof typeof ENTITY_TABLES;

const entityFileSelect = `
  SELECT ef.id AS linkId, ef.entity_type AS entityType, ef.entity_id AS entityId,
    ef.created_at AS linkedAt,
    f.id, f.display_name AS displayName, f.size_bytes AS sizeBytes,
    f.media_type AS mediaType, f.sha256, f.created_at AS createdAt
  FROM entity_files ef
  JOIN files f ON f.id = ef.file_id
`;

function isEntityType(value: string): value is EntityType {
  return Object.prototype.hasOwnProperty.call(ENTITY_TABLES, value);
}

function entityExists(
  database: SqliteDatabase,
  ownerId: string,
  entityType: EntityType,
  entityId: string,
): boolean {
  // Notes are soft-deleted, so a trashed note still exists for linking purposes.
  const table = ENTITY_TABLES[entityType];
  return database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ?`)
    .get(entityId, ownerId) !== undefined;
}

export function registerEntityFileRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  app.get<{ Params: { entityType: string; entityId: string } }>(
    '/api/entities/:entityType/:entityId/files',
    {
      schema: {
        params: {
          type: 'object',
          required: ['entityType', 'entityId'],
          properties: {
            entityType: { type: 'string', maxLength: 20 },
            entityId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const { entityType, entityId } = request.params;
      if (!isEntityType(entityType)) return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
      if (!entityExists(database, ownerId, entityType, entityId)) {
        return reply.code(404).send({ error: 'ไม่พบข้อมูลนี้' });
      }
      const files = database.prepare(`
        ${entityFileSelect}
        WHERE ef.owner_id = ? AND ef.entity_type = ? AND ef.entity_id = ?
        ORDER BY ef.created_at DESC, ef.id
      `).all(ownerId, entityType, entityId);
      return { files };
    },
  );

  app.post<{ Params: { entityType: string; entityId: string }; Body: { fileId: string } }>(
    '/api/entities/:entityType/:entityId/files',
    {
      schema: {
        params: {
          type: 'object',
          required: ['entityType', 'entityId'],
          properties: {
            entityType: { type: 'string', maxLength: 20 },
            entityId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['fileId'],
          properties: { fileId: { type: 'string', pattern: UUID_PATTERN } },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const { entityType, entityId } = request.params;
      if (!isEntityType(entityType)) return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
      if (!entityExists(database, ownerId, entityType, entityId)) {
        return reply.code(404).send({ error: 'ไม่พบข้อมูลนี้' });
      }
      const file = database.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ?')
        .get(request.body.fileId, ownerId);
      if (!file) return reply.code(404).send({ error: 'ไม่พบไฟล์นี้' });

      // Linking is idempotent: an existing link is returned with 200 instead of creating a duplicate
      // or failing, so a retried request cannot produce two rows.
      const existing = database.prepare(`
        SELECT id FROM entity_files WHERE entity_type = ? AND entity_id = ? AND file_id = ?
      `).get(entityType, entityId, request.body.fileId) as { id: string } | undefined;
      if (existing) {
        const files = database.prepare(`
          ${entityFileSelect}
          WHERE ef.owner_id = ? AND ef.entity_type = ? AND ef.entity_id = ?
          ORDER BY ef.created_at DESC, ef.id
        `).all(ownerId, entityType, entityId);
        return reply.code(200).send({ files, created: false });
      }

      database.prepare(`
        INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), ownerId, entityType, entityId, request.body.fileId, Date.now());

      const files = database.prepare(`
        ${entityFileSelect}
        WHERE ef.owner_id = ? AND ef.entity_type = ? AND ef.entity_id = ?
        ORDER BY ef.created_at DESC, ef.id
      `).all(ownerId, entityType, entityId);
      return reply.code(201).send({ files, created: true });
    },
  );

  // Removing a link never removes the file or its bytes.
  app.delete<{ Params: { entityType: string; entityId: string; fileId: string } }>(
    '/api/entities/:entityType/:entityId/files/:fileId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['entityType', 'entityId', 'fileId'],
          properties: {
            entityType: { type: 'string', maxLength: 20 },
            entityId: { type: 'string', pattern: UUID_PATTERN },
            fileId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const { entityType, entityId, fileId } = request.params;
      if (!isEntityType(entityType)) return reply.code(400).send({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
      const result = database.prepare(`
        DELETE FROM entity_files
        WHERE owner_id = ? AND entity_type = ? AND entity_id = ? AND file_id = ?
      `).run(ownerId, entityType, entityId, fileId);
      if (result.changes === 0) return reply.code(404).send({ error: 'ไม่พบความสัมพันธ์นี้' });
      return reply.code(204).send();
    },
  );
}
