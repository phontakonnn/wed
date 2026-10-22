import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { SqliteDatabase } from './database.js';

export interface SystemSettings {
  app_title: string;
  app_subtitle: string;
  app_logo: string;
  max_upload_size_mb: number;
  session_idle_timeout_minutes: number;
  default_theme: 'system' | 'dark' | 'light';
  modules_config?: string;
  backup_retention_days: number;
  backup_max_files: number;
  registration_mode?: 'open' | 'invite_only';
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  app_title: 'PKH / Life OS',
  app_subtitle: 'ศูนย์รวมข้อมูล บันทึก และการจัดการชีวิตส่วนบุคคล',
  app_logo: '🧠',
  max_upload_size_mb: 50,
  session_idle_timeout_minutes: 10080,
  default_theme: 'system',
  modules_config: '',
  backup_retention_days: 30,
  backup_max_files: 10,
  registration_mode: 'open',
};

export interface DatabaseStats {
  dbPath: string;
  dbSizeBytes: number;
  walSizeBytes: number;
  shmSizeBytes: number;
  objectsCount: number;
  objectsSizeBytes: number;
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  } | null;
  tableCounts: Record<string, number>;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  role: 'admin' | 'member' | 'editor' | 'viewer' | 'user';
  email?: string | null;
  phone?: string | null;
  twoFactorEnabled?: boolean;
  isActive: boolean;
  createdAt: number;
  sessionCount: number;
}

export function getSystemSettings(database: SqliteDatabase): SystemSettings {
  const rows = database.prepare('SELECT key, value FROM system_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    app_title: map.get('app_title') || DEFAULT_SYSTEM_SETTINGS.app_title,
    app_subtitle: map.get('app_subtitle') || DEFAULT_SYSTEM_SETTINGS.app_subtitle,
    app_logo: map.get('app_logo') || DEFAULT_SYSTEM_SETTINGS.app_logo,
    max_upload_size_mb: Number(map.get('max_upload_size_mb')) || DEFAULT_SYSTEM_SETTINGS.max_upload_size_mb,
    session_idle_timeout_minutes: Number(map.get('session_idle_timeout_minutes')) || DEFAULT_SYSTEM_SETTINGS.session_idle_timeout_minutes,
    default_theme: (map.get('default_theme') as 'system' | 'dark' | 'light') || DEFAULT_SYSTEM_SETTINGS.default_theme,
    modules_config: map.get('modules_config') || DEFAULT_SYSTEM_SETTINGS.modules_config,
    backup_retention_days: Number(map.get('backup_retention_days')) || DEFAULT_SYSTEM_SETTINGS.backup_retention_days,
    backup_max_files: Number(map.get('backup_max_files')) || DEFAULT_SYSTEM_SETTINGS.backup_max_files,
    registration_mode: (map.get('registration_mode') as 'open' | 'invite_only') || 'open',
  };
}

export function updateSystemSettings(database: SqliteDatabase, updates: Partial<SystemSettings>): SystemSettings {
  const now = Date.now();
  const upsert = database.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const runUpdates = database.transaction(() => {
    if (updates.app_title !== undefined) {
      upsert.run('app_title', String(updates.app_title).trim().slice(0, 120), now);
    }
    if (updates.app_subtitle !== undefined) {
      upsert.run('app_subtitle', String(updates.app_subtitle).trim().slice(0, 255), now);
    }
    if (updates.app_logo !== undefined) {
      upsert.run('app_logo', String(updates.app_logo).trim().slice(0, 20), now);
    }
    if (updates.max_upload_size_mb !== undefined) {
      const val = Math.max(1, Math.min(1000, Number(updates.max_upload_size_mb) || 50));
      upsert.run('max_upload_size_mb', String(val), now);
    }
    if (updates.session_idle_timeout_minutes !== undefined) {
      const val = Math.max(5, Math.min(525600, Number(updates.session_idle_timeout_minutes) || 10080));
      upsert.run('session_idle_timeout_minutes', String(val), now);
    }
    if (updates.default_theme !== undefined) {
      const theme = ['system', 'dark', 'light'].includes(updates.default_theme) ? updates.default_theme : 'system';
      upsert.run('default_theme', theme, now);
    }
    if (updates.modules_config !== undefined) {
      upsert.run('modules_config', String(updates.modules_config).trim().slice(0, 20000), now);
    }
    if (updates.backup_retention_days !== undefined) {
      const days = Math.max(1, Math.min(365, Number(updates.backup_retention_days) || 30));
      upsert.run('backup_retention_days', String(days), now);
    }
    if (updates.backup_max_files !== undefined) {
      const maxF = Math.max(2, Math.min(100, Number(updates.backup_max_files) || 10));
      upsert.run('backup_max_files', String(maxF), now);
    }
    if (updates.registration_mode !== undefined) {
      const mode = updates.registration_mode === 'invite_only' ? 'invite_only' : 'open';
      upsert.run('registration_mode', mode, now);
    }
  });

  runUpdates();
  return getSystemSettings(database);
}

export function listUsers(database: SqliteDatabase): AdminUser[] {
  const rows = database.prepare(`
    SELECT u.id, u.username, u.display_name AS displayName,
           COALESCE(u.role, 'user') AS role,
           u.email, u.phone,
           COALESCE(u.two_factor_enabled, 0) AS twoFactorEnabled,
           COALESCE(u.is_active, 1) AS isActive,
           u.created_at AS createdAt, COUNT(s.id_hash) AS sessionCount
    FROM users u
    LEFT JOIN sessions s ON u.id = s.user_id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all() as Array<{
    id: string;
    username: string;
    displayName: string | null;
    role: string;
    email: string | null;
    phone: string | null;
    twoFactorEnabled: number;
    isActive: number;
    createdAt: number;
    sessionCount: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    role: (r.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
    email: r.email,
    phone: r.phone,
    twoFactorEnabled: Boolean(r.twoFactorEnabled),
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt,
    sessionCount: r.sessionCount,
  }));
}

export function createUser(
  database: SqliteDatabase,
  username: string,
  passwordHash: string,
  displayName?: string,
  role: 'admin' | 'user' = 'user',
  email?: string,
  phone?: string,
): AdminUser {
  const normalized = username.trim().normalize('NFC');
  if (!normalized || [...normalized].length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error('ชื่อผู้ใช้ต้องมีความยาว 1-80 ตัวอักษร และไม่มีอักขระพิเศษควบคุม');
  }

  const existing = database.prepare('SELECT id FROM users WHERE username = ?').get(normalized);
  if (existing) {
    throw new Error('มีชื่อผู้ใช้นี้อยู่ในระบบแล้ว');
  }

  const id = randomUUID();
  const now = Date.now();
  const cleanDisplayName = displayName ? displayName.trim().slice(0, 80) : null;
  const userRole = role === 'admin' ? 'admin' : 'user';
  const cleanEmail = email ? email.trim().slice(0, 120) : null;
  const cleanPhone = phone ? phone.trim().slice(0, 40) : null;

  database.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, email, phone, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, normalized, passwordHash, cleanDisplayName, userRole, cleanEmail, cleanPhone, now);

  return {
    id,
    username: normalized,
    displayName: cleanDisplayName,
    role: userRole,
    email: cleanEmail,
    phone: cleanPhone,
    isActive: true,
    createdAt: now,
    sessionCount: 0,
  };
}

export function updateUserRoleAndStatus(
  database: SqliteDatabase,
  currentUserId: string,
  targetUserId: string,
  updates: { role?: 'admin' | 'member' | 'editor' | 'viewer' | 'user'; isActive?: boolean; displayName?: string },
): void {
  const target = database.prepare('SELECT id, username, role, is_active FROM users WHERE id = ?').get(targetUserId) as
    | { id: string; username: string; role: string; is_active: number }
    | undefined;

  if (!target) {
    throw new Error('ไม่พบบัญชีผู้ใช้นี้');
  }

  if (updates.isActive === false && targetUserId === currentUserId) {
    throw new Error('ไม่สามารถระงับการใช้งานบัญชีของตนเองได้');
  }

  if (updates.role === 'user' && target.role === 'admin') {
    const adminCount = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get() as { count: number };
    if (adminCount.count <= 1) {
      throw new Error('ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายของระบบได้');
    }
  }

  const updateFields: string[] = [];
  const values: any[] = [];

  if (updates.role !== undefined) {
    updateFields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.isActive !== undefined) {
    updateFields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (updates.displayName !== undefined) {
    updateFields.push('display_name = ?');
    values.push(updates.displayName.trim().slice(0, 80) || null);
  }

  if (updateFields.length > 0) {
    values.push(targetUserId);
    database.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...values);
  }

  // If user is deactivated, revoke all their active sessions immediately
  if (updates.isActive === false) {
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
  }
}

export function resetUserPassword(database: SqliteDatabase, userId: string, passwordHash: string): void {
  const user = database.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('ไม่พบบัญชีผู้ใช้นี้');
  }

  const reset = database.transaction(() => {
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  });
  reset();
}

export function deleteUser(database: SqliteDatabase, currentUserId: string, targetUserId: string): void {
  if (currentUserId === targetUserId) {
    throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
  }

  const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (userCount.count <= 1) {
    throw new Error('ไม่สามารถลบผู้ใช้คนสุดท้ายของระบบได้');
  }

  const target = database.prepare('SELECT username FROM users WHERE id = ?').get(targetUserId) as { username: string } | undefined;
  if (!target) {
    throw new Error('ไม่พบบัญชีผู้ใช้นี้');
  }

  if (target.username.toLowerCase() === 'admin') {
    throw new Error('ไม่สามารถลบบัญชีผู้ดูแลระบบหลัก (admin) ได้');
  }

  database.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
}

export function updateAccount(
  database: SqliteDatabase,
  userId: string,
  updates: { username?: string; passwordHash?: string },
): { id: string; username: string } {
  const user = database.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as
    { id: string; username: string } | undefined;
  if (!user) {
    throw new Error('ไม่พบบัญชีผู้ใช้');
  }

  let finalUsername = user.username;
  if (updates.username !== undefined) {
    const normalized = updates.username.trim().normalize('NFC');
    if (!normalized || [...normalized].length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
      throw new Error('ชื่อผู้ใช้ต้องมีความยาว 1-80 ตัวอักษร และไม่มีอักขระพิเศษควบคุม');
    }
    const taken = database.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(normalized, userId);
    if (taken) {
      throw new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    }
    finalUsername = normalized;
  }

  const runUpdate = database.transaction(() => {
    if (updates.username && updates.passwordHash) {
      database.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
        .run(finalUsername, updates.passwordHash, userId);
    } else if (updates.username) {
      database.prepare('UPDATE users SET username = ? WHERE id = ?').run(finalUsername, userId);
    } else if (updates.passwordHash) {
      database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(updates.passwordHash, userId);
    }
  });
  runUpdate();

  return { id: user.id, username: finalUsername };
}

function getDirStats(dirPath: string): { count: number; totalBytes: number } {
  let count = 0;
  let totalBytes = 0;
  if (!existsSync(dirPath)) return { count, totalBytes };

  function traverse(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        count += 1;
        try {
          totalBytes += statSync(fullPath).size;
        } catch {}
      }
    }
  }

  traverse(dirPath);
  return { count, totalBytes };
}

export function getDatabaseStats(database: SqliteDatabase, dataDirectory: string | null): DatabaseStats {
  const dbPath = (database as any).name || (dataDirectory ? join(dataDirectory, 'db', 'knowledge.sqlite3') : 'knowledge.sqlite3');
  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  let shmSizeBytes = 0;

  try {
    if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size;
  } catch {}
  try {
    const walPath = `${dbPath}-wal`;
    if (existsSync(walPath)) walSizeBytes = statSync(walPath).size;
  } catch {}
  try {
    const shmPath = `${dbPath}-shm`;
    if (existsSync(shmPath)) shmSizeBytes = statSync(shmPath).size;
  } catch {}

  const objectsDir = dataDirectory ? join(dataDirectory, 'objects') : '';
  const { count: objectsCount, totalBytes: objectsSizeBytes } = getDirStats(objectsDir);

  let disk: DatabaseStats['disk'] = null;
  try {
    const targetDir = dataDirectory || '.';
    const stats = statfsSync(targetDir);
    const bsize = Number(stats.bsize);
    const totalBytes = bsize * Number(stats.blocks);
    const freeBytes = bsize * Number(stats.bavail);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    disk = { totalBytes, freeBytes, usedBytes, usedPercent };
  } catch {}

  const tables = [
    'notes', 'bookmarks', 'files', 'people', 'habits', 'habit_logs',
    'reminders', 'tasks', 'projects', 'goals',
    'vault_items', 'library_items', 'custom_categories', 'users', 'sessions', 'note_versions',
    'watchlist_items', 'shopping_items', 'travel_places',
  ];

  const tableCounts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      tableCounts[table] = row.count;
    } catch {
      tableCounts[table] = 0;
    }
  }

  return {
    dbPath,
    dbSizeBytes,
    walSizeBytes,
    shmSizeBytes,
    objectsCount,
    objectsSizeBytes,
    disk,
    tableCounts,
  };
}

export function optimizeDatabase(database: SqliteDatabase): { cleanedOrphans: number; vacuumed: boolean } {
  let cleanedOrphans = 0;

  const cleanup = database.transaction(() => {
    // Clean orphan custom category items
    cleanedOrphans += database.prepare(`
      DELETE FROM custom_category_items
      WHERE (item_type = 'note' AND item_id NOT IN (SELECT id FROM notes))
         OR (item_type = 'bookmark' AND item_id NOT IN (SELECT id FROM bookmarks))
         OR (item_type = 'person' AND item_id NOT IN (SELECT id FROM people))
         OR (item_type = 'task' AND item_id NOT IN (SELECT id FROM tasks))
         OR (item_type = 'project' AND item_id NOT IN (SELECT id FROM projects))
         OR (item_type = 'goal' AND item_id NOT IN (SELECT id FROM goals))
         OR (item_type = 'vault' AND item_id NOT IN (SELECT id FROM vault_items))
         OR (item_type = 'library' AND item_id NOT IN (SELECT id FROM library_items))
    `).run().changes;

    // Clean orphan favorites
    cleanedOrphans += database.prepare(`
      DELETE FROM favorites
      WHERE (item_type = 'note' AND item_id NOT IN (SELECT id FROM notes))
         OR (item_type = 'bookmark' AND item_id NOT IN (SELECT id FROM bookmarks))
    `).run().changes;

    // Clean orphan entity files
    cleanedOrphans += database.prepare(`
      DELETE FROM entity_files WHERE file_id NOT IN (SELECT id FROM files)
    `).run().changes;
  });

  cleanup();

  try {
    database.pragma('wal_checkpoint(TRUNCATE)');
  } catch {}
  try {
    database.exec('VACUUM');
  } catch {}
  try {
    database.pragma('optimize');
  } catch {}

  return { cleanedOrphans, vacuumed: true };
}

export function exportDatabaseJson(database: SqliteDatabase, ownerId?: string): Record<string, unknown> {
  function queryAll(table: string, ownerColumn = 'owner_id') {
    try {
      if (ownerId) {
        return database.prepare(`SELECT * FROM ${table} WHERE ${ownerColumn} = ?`).all(ownerId);
      }
      return database.prepare(`SELECT * FROM ${table}`).all();
    } catch {
      return [];
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    systemSettings: getSystemSettings(database),
    notes: queryAll('notes'),
    bookmarks: queryAll('bookmarks'),
    files: database.prepare(
      ownerId
        ? 'SELECT id, display_name, media_type, size_bytes, sha256, created_at FROM files WHERE owner_id = ?'
        : 'SELECT id, display_name, media_type, size_bytes, sha256, created_at FROM files'
    ).all(...(ownerId ? [ownerId] : [])),
    people: queryAll('people'),
    habits: queryAll('habits'),
    habitLogs: queryAll('habit_logs'),
    reminders: queryAll('reminders'),
    workTasks: queryAll('tasks'),
    workProjects: queryAll('projects'),
    workGoals: queryAll('goals'),
    vaultItems: queryAll('vault_items'),
    libraryItems: queryAll('library_items'),
    customCategories: queryAll('custom_categories'),
    customCategoryItems: queryAll('custom_category_items'),
    watchlistItems: queryAll('watchlist_items'),
    shoppingItems: queryAll('shopping_items'),
    travelPlaces: queryAll('travel_places'),
  };
}

export const ALLOWED_DB_STUDIO_TABLES = [
  'users',
  'notes',
  'bookmarks',
  'tasks',
  'projects',
  'goals',
  'people',
  'habits',
  'life_timeblocks',
  'reminders',
  'vault_items',
  'library_items',
  'files',
  'custom_categories',
  'watchlist_items',
  'shopping_items',
  'travel_places',
  'sessions',
  'system_settings',
  'tags',
  'categories',
  'note_tags',
  'note_categories',
  'note_people',
  'habit_logs',
  'login_history',
  'audit_logs',
  'workspace_invites',
  'shared_items',
  'notifications',
  'saved_filters',
] as const;

export type DbStudioTableName = (typeof ALLOWED_DB_STUDIO_TABLES)[number];

export function isAllowedDbStudioTable(table: string): table is DbStudioTableName {
  return (ALLOWED_DB_STUDIO_TABLES as readonly string[]).includes(table);
}

export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export interface DbStudioTableSummary {
  name: string;
  rowCount: number;
  columns: TableColumnInfo[];
}

export function listDatabaseStudioTables(database: SqliteDatabase): DbStudioTableSummary[] {
  const result: DbStudioTableSummary[] = [];
  for (const table of ALLOWED_DB_STUDIO_TABLES) {
    try {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableColumnInfo[];
      if (columns.length === 0) continue;
      const countRow = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number } | undefined;
      result.push({
        name: table,
        rowCount: countRow?.count ?? 0,
        columns,
      });
    } catch {
      // ignore
    }
  }
  return result;
}

export function getDatabaseStudioRows(
  database: SqliteDatabase,
  table: string,
  options: { page?: number; limit?: number; search?: string } = {}
) {
  if (!isAllowedDbStudioTable(table)) {
    throw new Error(`Table ${table} is not allowed in Database Studio`);
  }

  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableColumnInfo[];
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const offset = (page - 1) * limit;

  const search = (options.search || '').trim();
  let whereClause = '';
  const params: unknown[] = [];

  if (search) {
    const textColumns = columns.filter((c) => /text|char|clob|varchar/i.test(c.type) || c.type === '');
    if (textColumns.length > 0) {
      whereClause = ' WHERE ' + textColumns.map((c) => `CAST(${c.name} AS TEXT) LIKE ?`).join(' OR ');
      for (let i = 0; i < textColumns.length; i++) {
        params.push(`%${search}%`);
      }
    }
  }

  const countRow = database.prepare(`SELECT COUNT(*) AS total FROM ${table}${whereClause}`).get(...params) as { total: number };
  const total = countRow?.total ?? 0;

  const pkCol = columns.find((c) => c.pk > 0)?.name || 'rowid';
  const hasUpdatedAt = columns.some((c) => c.name === 'updated_at');
  const orderBy = hasUpdatedAt ? 'updated_at DESC' : `${pkCol} DESC`;

  const rows = database
    .prepare(`SELECT * FROM ${table}${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return {
    table,
    columns,
    page,
    limit,
    total,
    rows,
  };
}

export function insertDatabaseStudioRow(
  database: SqliteDatabase,
  table: string,
  data: Record<string, unknown>
) {
  if (!isAllowedDbStudioTable(table)) {
    throw new Error(`Table ${table} is not allowed in Database Studio`);
  }

  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableColumnInfo[];
  const validColNames = new Set(columns.map((c) => c.name));
  const row = { ...data };

  if (validColNames.has('id') && !row.id) {
    row.id = randomUUID();
  }
  const now = Date.now();
  if (validColNames.has('created_at') && row.created_at === undefined) {
    row.created_at = now;
  }
  if (validColNames.has('updated_at') && row.updated_at === undefined) {
    row.updated_at = now;
  }

  const insertCols: string[] = [];
  const insertVals: unknown[] = [];
  for (const [key, val] of Object.entries(row)) {
    if (validColNames.has(key)) {
      insertCols.push(key);
      insertVals.push(val);
    }
  }

  if (insertCols.length === 0) {
    throw new Error('No valid columns provided for insert');
  }

  const placeholders = insertCols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`;
  database.prepare(sql).run(...insertVals);

  const pkCol = columns.find((c) => c.pk === 1)?.name || (table === 'system_settings' ? 'key' : 'id');
  const pkVal = row[pkCol];
  if (pkVal !== undefined) {
    return database.prepare(`SELECT * FROM ${table} WHERE ${pkCol} = ?`).get(pkVal);
  }
  return { ok: true };
}

export function updateDatabaseStudioRow(
  database: SqliteDatabase,
  table: string,
  id: string,
  data: Record<string, unknown>
) {
  if (!isAllowedDbStudioTable(table)) {
    throw new Error(`Table ${table} is not allowed in Database Studio`);
  }

  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableColumnInfo[];
  const validColNames = new Set(columns.map((c) => c.name));
  const pkCol = columns.find((c) => c.pk === 1)?.name || (table === 'system_settings' ? 'key' : 'id');

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (key !== pkCol && validColNames.has(key)) {
      setClauses.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (validColNames.has('updated_at') && data.updated_at === undefined) {
    setClauses.push('updated_at = ?');
    values.push(Date.now());
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);
  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${pkCol} = ?`;
  const res = database.prepare(sql).run(...values);
  if (res.changes === 0) {
    throw new Error(`Row with ${pkCol} = ${id} not found in ${table}`);
  }

  return database.prepare(`SELECT * FROM ${table} WHERE ${pkCol} = ?`).get(id);
}

export function deleteDatabaseStudioRow(
  database: SqliteDatabase,
  table: string,
  id: string
) {
  if (!isAllowedDbStudioTable(table)) {
    throw new Error(`Table ${table} is not allowed in Database Studio`);
  }

  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableColumnInfo[];
  const pkCol = columns.find((c) => c.pk === 1)?.name || (table === 'system_settings' ? 'key' : 'id');

  const res = database.prepare(`DELETE FROM ${table} WHERE ${pkCol} = ?`).run(id);
  return { deleted: res.changes > 0, id, table };
}
