import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { SqliteDatabase } from './database.js';

// -------------------------------------------------------------------
// 1. Audit Logs & Login History
// -------------------------------------------------------------------

export interface LoginHistoryEntry {
  id: string;
  userId: string | null;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: 'success' | 'failed';
  failureReason?: string | null;
  createdAt: number;
}

export function recordLoginHistory(
  database: SqliteDatabase,
  data: {
    userId?: string | null;
    username?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    status: 'success' | 'failed';
    failureReason?: string | null;
  }
): void {
  try {
    const id = randomUUID();
    const now = Date.now();
    database.prepare(`
      INSERT INTO login_history (id, user_id, username, ip_address, user_agent, status, failure_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId ?? null,
      data.username ?? null,
      data.ipAddress ?? null,
      data.userAgent ?? null,
      data.status,
      data.failureReason ?? null,
      now
    );
  } catch (err) {
    // Audit logging should never crash the main operation
    console.error('Failed to record login history', err);
  }
}

export function getLoginHistory(
  database: SqliteDatabase,
  userId?: string,
  limit = 50
): LoginHistoryEntry[] {
  const query = userId
    ? database.prepare(`
        SELECT id, user_id AS userId, username, ip_address AS ipAddress, user_agent AS userAgent,
               status, failure_reason AS failureReason, created_at AS createdAt
        FROM login_history
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
    : database.prepare(`
        SELECT id, user_id AS userId, username, ip_address AS ipAddress, user_agent AS userAgent,
               status, failure_reason AS failureReason, created_at AS createdAt
        FROM login_history
        ORDER BY created_at DESC
        LIMIT ?
      `);

  return (userId ? query.all(userId, limit) : query.all(limit)) as LoginHistoryEntry[];
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: number;
}

export function recordAuditLog(
  database: SqliteDatabase,
  data: {
    userId?: string | null;
    username?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    details?: string | Record<string, unknown> | null;
    ipAddress?: string | null;
  }
): void {
  try {
    const id = randomUUID();
    const now = Date.now();
    const formattedDetails = typeof data.details === 'object' && data.details !== null
      ? JSON.stringify(data.details)
      : (data.details ?? null);
    database.prepare(`
      INSERT INTO audit_logs (id, user_id, username, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId ?? null,
      data.username ?? null,
      data.action,
      data.resourceType,
      data.resourceId ?? null,
      formattedDetails,
      data.ipAddress ?? null,
      now
    );
  } catch (err) {
    console.error('Failed to record audit log', err);
  }
}

export function getAuditLogs(
  database: SqliteDatabase,
  options: {
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
    action?: string;
    resourceType?: string;
    userId?: string;
  } = {}
): { logs: AuditLogEntry[]; total: number; page: number; pageSize: number } {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? options.limit ?? 50));
  const offset = options.offset !== undefined
    ? Math.max(0, options.offset)
    : (Math.max(1, options.page ?? 1) - 1) * pageSize;
  const page = Math.floor(offset / pageSize) + 1;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.userId) {
    conditions.push('user_id = ?');
    params.push(options.userId);
  }
  if (options.action) {
    conditions.push('action = ?');
    params.push(options.action);
  }
  if (options.resourceType) {
    conditions.push('resource_type = ?');
    params.push(options.resourceType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = database.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`).get(...params) as { total: number };
  const logs = database.prepare(`
    SELECT id, user_id AS userId, username, action, resource_type AS resourceType,
           resource_id AS resourceId, details, ip_address AS ipAddress, created_at AS createdAt
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as AuditLogEntry[];

  return {
    logs,
    total: totalRow.total,
    page,
    pageSize,
  };
}

// -------------------------------------------------------------------
// 2. User Device Sessions
// -------------------------------------------------------------------

export interface UserSessionDevice {
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  isCurrent?: boolean;
}

export function getUserActiveSessions(
  database: SqliteDatabase,
  userId: string,
  currentTokenHash?: string
): UserSessionDevice[] {
  const rows = database.prepare(`
    SELECT id_hash AS tokenHash, user_agent AS userAgent, created_at AS createdAt, last_seen_at AS lastSeenAt
    FROM sessions
    WHERE user_id = ?
    ORDER BY last_seen_at DESC
  `).all(userId) as Array<{ tokenHash: string; userAgent: string; createdAt: number; lastSeenAt: number }>;

  const recentHistory = database.prepare(`
    SELECT ip_address AS ipAddress, created_at AS createdAt
    FROM login_history
    WHERE user_id = ? AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId) as { ipAddress: string; createdAt: number } | undefined;

  return rows.map((r, idx) => {
    return {
      tokenHash: r.tokenHash.slice(0, 12) + '...',
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      ipAddress: recentHistory?.ipAddress || '127.0.0.1',
      userAgent: r.userAgent || 'Unknown Device',
      isCurrent: currentTokenHash ? (r.tokenHash === currentTokenHash || r.tokenHash.startsWith(currentTokenHash.slice(0, 12))) : idx === 0,
    };
  });
}

export function revokeAllUserSessions(
  database: SqliteDatabase,
  userId: string,
  exceptTokenHash?: string
): { revokedCount: number } {
  if (exceptTokenHash) {
    const res = database.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(userId, exceptTokenHash);
    return { revokedCount: res.changes };
  }
  const res = database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return { revokedCount: res.changes };
}

// -------------------------------------------------------------------
// 3. Workspace Invites
// -------------------------------------------------------------------

export type UserRole = 'admin' | 'member' | 'editor' | 'viewer' | 'user';

export interface WorkspaceInvite {
  id: string;
  code: string;
  createdBy: string;
  role: UserRole;
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  isRevoked: number;
  createdAt: number;
}

export function createWorkspaceInvite(
  database: SqliteDatabase,
  data: {
    createdBy: string;
    role?: UserRole;
    maxUses?: number;
    expiresInHours?: number;
  }
): WorkspaceInvite {
  const id = randomUUID();
  const code = 'INV-' + randomUUID().slice(0, 8).toUpperCase();
  const now = Date.now();
  const role = data.role || 'member';
  const maxUses = Math.max(1, data.maxUses ?? 1);
  const expiresAt = data.expiresInHours ? now + data.expiresInHours * 3600 * 1000 : null;

  database.prepare(`
    INSERT INTO workspace_invites (id, code, created_by, role, max_uses, used_count, expires_at, is_revoked, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)
  `).run(id, code, data.createdBy, role, maxUses, expiresAt, now);

  return {
    id,
    code,
    createdBy: data.createdBy,
    role,
    maxUses,
    usedCount: 0,
    expiresAt,
    isRevoked: 0,
    createdAt: now,
  };
}

export function listWorkspaceInvites(database: SqliteDatabase): WorkspaceInvite[] {
  return database.prepare(`
    SELECT id, code, created_by AS createdBy, role, max_uses AS maxUses, used_count AS usedCount,
           expires_at AS expiresAt, is_revoked AS isRevoked, created_at AS createdAt
    FROM workspace_invites
    ORDER BY created_at DESC
  `).all() as WorkspaceInvite[];
}

export function revokeWorkspaceInvite(database: SqliteDatabase, code: string): boolean {
  const res = database.prepare('UPDATE workspace_invites SET is_revoked = 1 WHERE code = ?').run(code);
  return res.changes > 0;
}

export function validateAndUseInvite(
  database: SqliteDatabase,
  code: string
): { valid: boolean; role?: UserRole; error?: string } {
  const invite = database.prepare(`
    SELECT id, code, role, max_uses AS maxUses, used_count AS usedCount, expires_at AS expiresAt, is_revoked AS isRevoked
    FROM workspace_invites
    WHERE code = ?
  `).get(code) as WorkspaceInvite | undefined;

  if (!invite) return { valid: false, error: 'รหัสคำเชิญไม่ถูกต้อง' };
  if (invite.isRevoked === 1) return { valid: false, error: 'รหัสคำเชิญนี้ถูกเพิกถอนแล้ว' };
  if (invite.expiresAt && Date.now() > invite.expiresAt) return { valid: false, error: 'รหัสคำเชิญนี้หมดอายุแล้ว' };
  if (invite.usedCount >= invite.maxUses) return { valid: false, error: 'รหัสคำเชิญนี้ถูกใช้งานครบจำนวนแล้ว' };

  // Increment usage
  database.prepare('UPDATE workspace_invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);
  return { valid: true, role: invite.role };
}

// -------------------------------------------------------------------
// 4. Shared Items (IDOR Defense & Selective Sharing)
// -------------------------------------------------------------------

export type SharePermission = 'viewer' | 'editor' | 'admin';

export interface SharedItemRecord {
  id: string;
  itemType: string;
  itemId: string;
  ownerId: string;
  sharedWithUserId: string | null;
  permission: SharePermission;
  createdAt: number;
}

const ITEM_TABLE_MAP: Record<string, string> = {
  note: 'notes',
  bookmark: 'bookmarks',
  task: 'tasks',
  project: 'projects',
  goal: 'goals',
  vault: 'vault_items',
  library: 'library_items',
  person: 'people',
};

export function checkItemAccess(
  database: SqliteDatabase,
  itemTypeOrOptions: string | {
    itemType: string;
    itemId: string;
    userId: string;
    tableName?: string;
    requiredPermission?: 'viewer' | 'editor' | 'admin';
  },
  itemIdArg?: string,
  userIdArg?: string,
  requiredPermissionArg?: 'viewer' | 'editor' | 'admin'
): { allowed: boolean; role: 'owner' | 'shared' | 'none'; permission?: SharePermission } {
  let itemType: string;
  let itemId: string;
  let userId: string;
  let tableName: string;
  let requiredPermission: 'viewer' | 'editor' | 'admin';

  if (typeof itemTypeOrOptions === 'object') {
    itemType = itemTypeOrOptions.itemType;
    itemId = itemTypeOrOptions.itemId;
    userId = itemTypeOrOptions.userId;
    tableName = itemTypeOrOptions.tableName || ITEM_TABLE_MAP[itemType] || `${itemType}s`;
    requiredPermission = itemTypeOrOptions.requiredPermission || 'viewer';
  } else {
    itemType = itemTypeOrOptions;
    itemId = itemIdArg!;
    userId = userIdArg!;
    tableName = ITEM_TABLE_MAP[itemType] || `${itemType}s`;
    requiredPermission = requiredPermissionArg || 'viewer';
  }

  // 1. Direct ownership check
  const ownerCheck = database.prepare(`SELECT owner_id FROM ${tableName} WHERE id = ?`).get(itemId) as { owner_id: string } | undefined;
  if (!ownerCheck) return { allowed: false, role: 'none' };
  if (ownerCheck.owner_id === userId) {
    return { allowed: true, role: 'owner', permission: 'admin' };
  }

  // 2. Shared item check
  const share = database.prepare(`
    SELECT permission FROM shared_items
    WHERE item_type = ? AND item_id = ? AND (shared_with_user_id = ? OR shared_with_user_id IS NULL)
  `).get(itemType, itemId, userId) as { permission: SharePermission } | undefined;

  if (!share) return { allowed: false, role: 'none' };

  const permissionLevels: Record<SharePermission, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };

  const hasAccess = permissionLevels[share.permission] >= permissionLevels[requiredPermission];
  return { allowed: hasAccess, role: 'shared', permission: share.permission };
}

export function shareItem(
  database: SqliteDatabase,
  data: {
    itemType: string;
    itemId: string;
    ownerId: string;
    sharedWithUserId?: string | null;
    permission?: SharePermission;
  }
): SharedItemRecord {
  const id = randomUUID();
  const now = Date.now();
  const permission = data.permission ?? 'viewer';

  // Check if already shared with this user
  const existing = database.prepare(`
    SELECT id FROM shared_items
    WHERE item_type = ? AND item_id = ? AND (shared_with_user_id IS ? OR shared_with_user_id = ?)
  `).get(data.itemType, data.itemId, data.sharedWithUserId ?? null, data.sharedWithUserId ?? null) as { id: string } | undefined;

  if (existing) {
    database.prepare(`
      UPDATE shared_items SET permission = ? WHERE id = ?
    `).run(permission, existing.id);
    return {
      id: existing.id,
      itemType: data.itemType,
      itemId: data.itemId,
      ownerId: data.ownerId,
      sharedWithUserId: data.sharedWithUserId ?? null,
      permission,
      createdAt: now,
    };
  }

  database.prepare(`
    INSERT INTO shared_items (id, item_type, item_id, owner_id, shared_with_user_id, permission, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.itemType, data.itemId, data.ownerId, data.sharedWithUserId ?? null, permission, now);

  return {
    id,
    itemType: data.itemType,
    itemId: data.itemId,
    ownerId: data.ownerId,
    sharedWithUserId: data.sharedWithUserId ?? null,
    permission,
    createdAt: now,
  };
}

export function unshareItem(
  database: SqliteDatabase,
  shareId: string,
  ownerId: string
): boolean {
  const res = database.prepare('DELETE FROM shared_items WHERE id = ? AND owner_id = ?').run(shareId, ownerId);
  return res.changes > 0;
}

export function getItemShares(
  database: SqliteDatabase,
  itemType: string,
  itemId: string
): Array<SharedItemRecord & { sharedWithUsername?: string | null; sharedWithDisplayName?: string | null }> {
  return database.prepare(`
    SELECT s.id, s.item_type AS itemType, s.item_id AS itemId, s.owner_id AS ownerId,
           s.shared_with_user_id AS sharedWithUserId, s.permission, s.created_at AS createdAt,
           u.username AS sharedWithUsername, u.display_name AS sharedWithDisplayName
    FROM shared_items s
    LEFT JOIN users u ON u.id = s.shared_with_user_id
    WHERE s.item_type = ? AND s.item_id = ?
    ORDER BY s.created_at ASC
  `).all(itemType, itemId) as Array<SharedItemRecord & { sharedWithUsername?: string | null; sharedWithDisplayName?: string | null }>;
}

// -------------------------------------------------------------------
// 5. Notifications
// -------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'reminder' | 'due_task' | 'shared_item' | 'system';
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: number;
  snoozedUntil: string | null;
  createdAt: number;
}

export function createNotification(
  database: SqliteDatabase,
  data: {
    userId: string;
    type: 'reminder' | 'due_task' | 'shared_item' | 'system';
    title: string;
    message: string;
    linkUrl?: string | null;
  }
): NotificationItem {
  const id = randomUUID();
  const now = Date.now();
  database.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, snoozed_until, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).run(id, data.userId, data.type, data.title, data.message, data.linkUrl ?? null, now);

  return {
    id,
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    linkUrl: data.linkUrl ?? null,
    isRead: 0,
    snoozedUntil: null,
    createdAt: now,
  };
}

export function getUserNotifications(
  database: SqliteDatabase,
  userId: string,
  limit = 30
): { notifications: NotificationItem[]; unreadCount: number } {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueReminders = database.prepare(`
      SELECT id, title, target_date FROM reminders
      WHERE owner_id = ? AND is_completed = 0 AND (target_date <= ? OR snoozed_until <= ?)
    `).all(userId, todayStr, todayStr) as Array<{ id: string; title: string; target_date: string }>;

    for (const rem of dueReminders) {
      const exists = database.prepare(`
        SELECT id FROM notifications WHERE user_id = ? AND type = 'reminder' AND link_url = ? AND created_at > ?
      `).get(userId, `/schedule#${rem.id}`, Date.now() - 24 * 3600 * 1000);
      if (!exists) {
        createNotification(database, {
          userId,
          type: 'reminder',
          title: `🔔 แจ้งเตือน: ${rem.title}`,
          message: `กำหนดวันที่ ${rem.target_date}`,
          linkUrl: `/schedule#${rem.id}`,
        });
      }
    }
  } catch {}

  const now = new Date().toISOString();
  const notifications = database.prepare(`
    SELECT id, user_id AS userId, type, title, message, link_url AS linkUrl,
           is_read AS isRead, snoozed_until AS snoozedUntil, created_at AS createdAt
    FROM notifications
    WHERE user_id = ? AND (snoozed_until IS NULL OR snoozed_until <= ?)
    ORDER BY is_read ASC, created_at DESC
    LIMIT ?
  `).all(userId, now, limit) as NotificationItem[];

  const unreadCountRow = database.prepare(`
    SELECT COUNT(*) AS count FROM notifications
    WHERE user_id = ? AND is_read = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?)
  `).get(userId, now) as { count: number };

  return { notifications, unreadCount: unreadCountRow?.count ?? 0 };
}

export function markNotificationsAsRead(database: SqliteDatabase, userId: string, notificationId?: string): void {
  if (notificationId) {
    database.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
  } else {
    database.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }
}

export function snoozeNotification(database: SqliteDatabase, userId: string, notificationId: string, hours = 24): void {
  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString().slice(0, 10);
  database.prepare('UPDATE notifications SET snoozed_until = ?, is_read = 1 WHERE id = ? AND user_id = ?').run(until, notificationId, userId);
}

export function completeNotification(
  database: SqliteDatabase,
  userId: string,
  notificationId: string
): { success: boolean; itemType?: string; itemId?: string } {
  const notif = database.prepare(`
    SELECT id, type, link_url AS linkUrl FROM notifications WHERE id = ? AND user_id = ?
  `).get(notificationId, userId) as { id: string; type: string; linkUrl: string | null } | undefined;

  if (!notif) return { success: false };

  // Mark notification read
  database.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notificationId);

  let itemType: string | undefined;
  let itemId: string | undefined;

  if (notif.linkUrl) {
    if (notif.linkUrl.startsWith('/tasks#')) {
      itemType = 'task';
      itemId = notif.linkUrl.replace('/tasks#', '').trim();
      if (itemId) {
        database.prepare("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ? AND owner_id = ?")
          .run(Date.now(), itemId, userId);
      }
    } else if (notif.linkUrl.startsWith('/schedule#')) {
      itemType = 'reminder';
      itemId = notif.linkUrl.replace('/schedule#', '').trim();
      if (itemId) {
        database.prepare('UPDATE reminders SET is_completed = 1, updated_at = ? WHERE id = ? AND owner_id = ?')
          .run(Date.now(), itemId, userId);
      }
    }
  }

  return { success: true, itemType, itemId };
}

export interface UserNotificationPreferences {
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  notifyBirthdays: boolean;
  notifyTasks: boolean;
  notifyReminders: boolean;
  notifyShopping: boolean;
  isDndActive: boolean;
}

export function isTimeInDndWindow(currentTimeStr: string, startStr: string, endStr: string): boolean {
  if (!startStr || !endStr) return false;
  if (startStr <= endStr) {
    return currentTimeStr >= startStr && currentTimeStr <= endStr;
  }
  // Crosses midnight (e.g. 22:00 -> 08:00)
  return currentTimeStr >= startStr || currentTimeStr < endStr;
}

export function getUserNotificationPreferences(
  database: SqliteDatabase,
  userId: string
): UserNotificationPreferences {
  const row = database.prepare(`
    SELECT COALESCE(dnd_enabled, 0) AS dndEnabled,
           COALESCE(dnd_start, '22:00') AS dndStart,
           COALESCE(dnd_end, '08:00') AS dndEnd,
           COALESCE(notify_birthdays, 1) AS notifyBirthdays,
           COALESCE(notify_tasks, 1) AS notifyTasks,
           COALESCE(notify_reminders, 1) AS notifyReminders,
           COALESCE(notify_shopping, 1) AS notifyShopping
    FROM users WHERE id = ?
  `).get(userId) as {
    dndEnabled: number;
    dndStart: string;
    dndEnd: string;
    notifyBirthdays: number;
    notifyTasks: number;
    notifyReminders: number;
    notifyShopping: number;
  } | undefined;

  const bkkTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const dndEnabled = Boolean(row?.dndEnabled);
  const dndStart = row?.dndStart || '22:00';
  const dndEnd = row?.dndEnd || '08:00';
  const isDndActive = dndEnabled && isTimeInDndWindow(bkkTime, dndStart, dndEnd);

  return {
    dndEnabled,
    dndStart,
    dndEnd,
    notifyBirthdays: Boolean(row?.notifyBirthdays ?? 1),
    notifyTasks: Boolean(row?.notifyTasks ?? 1),
    notifyReminders: Boolean(row?.notifyReminders ?? 1),
    notifyShopping: Boolean(row?.notifyShopping ?? 1),
    isDndActive,
  };
}

export function updateUserNotificationPreferences(
  database: SqliteDatabase,
  userId: string,
  prefs: Partial<UserNotificationPreferences>
): UserNotificationPreferences {
  const current = getUserNotificationPreferences(database, userId);
  const dndEnabled = prefs.dndEnabled !== undefined ? (prefs.dndEnabled ? 1 : 0) : (current.dndEnabled ? 1 : 0);
  const dndStart = prefs.dndStart ?? current.dndStart;
  const dndEnd = prefs.dndEnd ?? current.dndEnd;
  const notifyBirthdays = prefs.notifyBirthdays !== undefined ? (prefs.notifyBirthdays ? 1 : 0) : (current.notifyBirthdays ? 1 : 0);
  const notifyTasks = prefs.notifyTasks !== undefined ? (prefs.notifyTasks ? 1 : 0) : (current.notifyTasks ? 1 : 0);
  const notifyReminders = prefs.notifyReminders !== undefined ? (prefs.notifyReminders ? 1 : 0) : (current.notifyReminders ? 1 : 0);
  const notifyShopping = prefs.notifyShopping !== undefined ? (prefs.notifyShopping ? 1 : 0) : (current.notifyShopping ? 1 : 0);

  database.prepare(`
    UPDATE users
    SET dnd_enabled = ?, dnd_start = ?, dnd_end = ?,
        notify_birthdays = ?, notify_tasks = ?, notify_reminders = ?, notify_shopping = ?
    WHERE id = ?
  `).run(dndEnabled, dndStart, dndEnd, notifyBirthdays, notifyTasks, notifyReminders, notifyShopping, userId);

  return getUserNotificationPreferences(database, userId);
}

// -------------------------------------------------------------------
// 6. Saved Filters
// -------------------------------------------------------------------

export interface SavedFilterItem {
  id: string;
  userId: string;
  name: string;
  filterType: string;
  queryCriteria: string;
  createdAt: number;
}

export function saveFilter(
  database: SqliteDatabase,
  userId: string,
  data: { name: string; filterType: string; queryCriteria: Record<string, unknown> }
): SavedFilterItem {
  const id = randomUUID();
  const now = Date.now();
  const criteriaJson = JSON.stringify(data.queryCriteria);

  database.prepare(`
    INSERT INTO saved_filters (id, user_id, name, filter_type, query_criteria, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, data.name.trim(), data.filterType, criteriaJson, now);

  return {
    id,
    userId,
    name: data.name.trim(),
    filterType: data.filterType,
    queryCriteria: criteriaJson,
    createdAt: now,
  };
}

export function getSavedFilters(database: SqliteDatabase, userId: string, filterType?: string): SavedFilterItem[] {
  if (filterType) {
    return database.prepare(`
      SELECT id, user_id AS userId, name, filter_type AS filterType, query_criteria AS queryCriteria, created_at AS createdAt
      FROM saved_filters
      WHERE user_id = ? AND filter_type = ?
      ORDER BY created_at DESC
    `).all(userId, filterType) as SavedFilterItem[];
  }
  return database.prepare(`
    SELECT id, user_id AS userId, name, filter_type AS filterType, query_criteria AS queryCriteria, created_at AS createdAt
    FROM saved_filters
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as SavedFilterItem[];
}

export function deleteSavedFilter(database: SqliteDatabase, userId: string, id: string): boolean {
  const res = database.prepare('DELETE FROM saved_filters WHERE id = ? AND user_id = ?').run(id, userId);
  return res.changes > 0;
}

// -------------------------------------------------------------------
// 7. Magic Bytes MIME Validation
// -------------------------------------------------------------------

export function verifyMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (!buffer || buffer.length === 0) return false;
  const mime = declaredMime.toLowerCase().trim();

  // If text or markdown or json or svg, check if valid UTF-8
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'image/svg+xml'
  ) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mime === 'image/png') {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
  }

  // JPEG: FF D8 FF
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // GIF: 47 49 46 38
  if (mime === 'image/gif') {
    return buffer.length >= 4 &&
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }

  // PDF: 25 50 44 46 (%PDF)
  if (mime === 'application/pdf') {
    return buffer.length >= 4 &&
      buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // WebP: RIFF ... WEBP
  if (mime === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  // MP4: ....ftyp
  if (mime === 'video/mp4') {
    return buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp';
  }

  // Default allow other files if length > 0
  return true;
}

// -------------------------------------------------------------------
// 8. Deduplicated Export & Import JSON
// -------------------------------------------------------------------

export function exportUserFullData(database: SqliteDatabase, userId: string): Record<string, unknown> {
  const notes = database.prepare('SELECT * FROM notes WHERE owner_id = ?').all(userId);
  const bookmarks = database.prepare('SELECT * FROM bookmarks WHERE owner_id = ?').all(userId);
  const tasks = database.prepare('SELECT * FROM tasks WHERE owner_id = ?').all(userId);
  const projects = database.prepare('SELECT * FROM projects WHERE owner_id = ?').all(userId);
  const goals = database.prepare('SELECT * FROM goals WHERE owner_id = ?').all(userId);
  const people = database.prepare('SELECT * FROM people WHERE owner_id = ?').all(userId);
  const reminders = database.prepare('SELECT * FROM reminders WHERE owner_id = ?').all(userId);
  const habits = database.prepare('SELECT * FROM habits WHERE owner_id = ?').all(userId);
  const timeblocks = database.prepare('SELECT * FROM life_timeblocks WHERE owner_id = ?').all(userId);
  const vault = database.prepare('SELECT * FROM vault_items WHERE owner_id = ?').all(userId);
  const library = database.prepare('SELECT * FROM library_items WHERE owner_id = ?').all(userId);
  const customCategories = database.prepare('SELECT * FROM custom_categories WHERE owner_id = ?').all(userId);
  const watchlist = database.prepare('SELECT * FROM watchlist_items WHERE owner_id = ?').all(userId);
  const shopping = database.prepare('SELECT * FROM shopping_items WHERE owner_id = ?').all(userId);
  const travel = database.prepare('SELECT * FROM travel_places WHERE owner_id = ?').all(userId);

  return {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    ownerId: userId,
    counts: {
      notes: notes.length,
      bookmarks: bookmarks.length,
      tasks: tasks.length,
      projects: projects.length,
      goals: goals.length,
      people: people.length,
      reminders: reminders.length,
      habits: habits.length,
      timeblocks: timeblocks.length,
      vault_items: vault.length,
      library_items: library.length,
      custom_categories: customCategories.length,
      watchlist_items: watchlist.length,
      shopping_items: shopping.length,
      travel_places: travel.length,
    },
    data: {
      notes,
      bookmarks,
      tasks,
      projects,
      goals,
      people,
      reminders,
      habits,
      life_timeblocks: timeblocks,
      vault_items: vault,
      library_items: library,
      custom_categories: customCategories,
      watchlist_items: watchlist,
      shopping_items: shopping,
      travel_places: travel,
    },
  };
}

export function importUserFullData(
  database: SqliteDatabase,
  userId: string,
  payload: { data?: Record<string, unknown[]>; [key: string]: unknown }
): { imported: Record<string, number>; skipped: Record<string, number> } {
  const data = payload.data || payload;
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  const now = Date.now();

  database.transaction(() => {
    // 1. Notes (deduplicate by title + content or id)
    if (Array.isArray(data['notes'])) {
      imported['notes'] = 0;
      skipped['notes'] = 0;
      for (const item of data['notes'] as Array<Record<string, unknown>>) {
        const title = String(item['title'] || '').trim();
        const content = String(item['content'] || '').trim();
        if (!title && !content) continue;

        const duplicate = database.prepare(
          'SELECT id FROM notes WHERE owner_id = ? AND title = ? AND content = ?'
        ).get(userId, title, content);

        if (duplicate) {
          skipped['notes']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, userId, title, content, now, now);
        imported['notes']++;
      }
    }

    // 2. Bookmarks (deduplicate by URL)
    if (Array.isArray(data['bookmarks'])) {
      imported['bookmarks'] = 0;
      skipped['bookmarks'] = 0;
      for (const item of data['bookmarks'] as Array<Record<string, unknown>>) {
        const url = String(item['url'] || '').trim();
        const title = String(item['title'] || url).trim();
        const desc = String(item['description'] || '').trim();
        const cat = String(item['category'] || '📦 อื่นๆ').trim();
        if (!url) continue;

        const duplicate = database.prepare(
          'SELECT id FROM bookmarks WHERE owner_id = ? AND url = ?'
        ).get(userId, url);

        if (duplicate) {
          skipped['bookmarks']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO bookmarks (id, owner_id, title, url, description, category, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, title, url, desc, cat, now, now);
        imported['bookmarks']++;
      }
    }

    // 3. Tasks (deduplicate by title)
    if (Array.isArray(data['tasks'])) {
      imported['tasks'] = 0;
      skipped['tasks'] = 0;
      for (const item of data['tasks'] as Array<Record<string, unknown>>) {
        const title = String(item['title'] || '').trim();
        if (!title) continue;

        const duplicate = database.prepare(
          'SELECT id FROM tasks WHERE owner_id = ? AND title = ?'
        ).get(userId, title);

        if (duplicate) {
          skipped['tasks']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO tasks (id, owner_id, title, status, priority, due_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          userId,
          title,
          item['status'] || 'todo',
          item['priority'] || 'normal',
          item['due_date'] ?? null,
          now,
          now
        );
        imported['tasks']++;
      }
    }

    // 4. Projects (deduplicate by title)
    if (Array.isArray(data['projects'])) {
      imported['projects'] = 0;
      skipped['projects'] = 0;
      for (const item of data['projects'] as Array<Record<string, unknown>>) {
        const title = String(item['title'] || '').trim();
        if (!title) continue;

        const duplicate = database.prepare(
          'SELECT id FROM projects WHERE owner_id = ? AND title = ?'
        ).get(userId, title);

        if (duplicate) {
          skipped['projects']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO projects (id, owner_id, title, description, status, target_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          userId,
          title,
          item['description'] || '',
          item['status'] || 'planning',
          item['target_date'] ?? null,
          now,
          now
        );
        imported['projects']++;
      }
    }

    // 5. Goals (deduplicate by title)
    if (Array.isArray(data['goals'])) {
      imported['goals'] = 0;
      skipped['goals'] = 0;
      for (const item of data['goals'] as Array<Record<string, unknown>>) {
        const title = String(item['title'] || '').trim();
        if (!title) continue;

        const duplicate = database.prepare(
          'SELECT id FROM goals WHERE owner_id = ? AND title = ?'
        ).get(userId, title);

        if (duplicate) {
          skipped['goals']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO goals (id, owner_id, title, target_date, progress, target_metric, current_metric, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          userId,
          title,
          item['target_date'] ?? null,
          item['progress'] ?? 0,
          item['target_metric'] ?? '',
          item['current_metric'] ?? '',
          item['status'] || 'in_progress',
          now,
          now
        );
        imported['goals']++;
      }
    }

    // 6. People (deduplicate by name)
    if (Array.isArray(data['people'])) {
      imported['people'] = 0;
      skipped['people'] = 0;
      for (const item of data['people'] as Array<Record<string, unknown>>) {
        const name = String(item['name'] || '').trim();
        if (!name) continue;

        const duplicate = database.prepare(
          'SELECT id FROM people WHERE owner_id = ? AND name = ?'
        ).get(userId, name);

        if (duplicate) {
          skipped['people']++;
          continue;
        }

        const id = randomUUID();
        database.prepare(`
          INSERT INTO people (id, owner_id, name, relationship_group, role_label, birthday_or_anniversary, phone, favorites_and_likes, allergies_and_medical, gift_ideas_and_sizes, memo, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          userId,
          name,
          item['relationship_group'] || 'family',
          item['role_label'] || '',
          item['birthday_or_anniversary'] || '',
          item['phone'] || '',
          item['favorites_and_likes'] || '',
          item['allergies_and_medical'] || '',
          item['gift_ideas_and_sizes'] || '',
          item['memo'] || '',
          now,
          now
        );
        imported['people']++;
      }
    }
  })();

  return { imported, skipped };
}

// -------------------------------------------------------------------
// 9. Backup Retention Policy
// -------------------------------------------------------------------

export function applyBackupRetentionPolicy(database: SqliteDatabase, backupDirectory: string): { prunedCount: number } {
  if (!existsSync(backupDirectory)) return { prunedCount: 0 };

  const retentionDaysRow = database.prepare("SELECT value FROM system_settings WHERE key = 'backup_retention_days'").get() as { value: string } | undefined;
  const maxFilesRow = database.prepare("SELECT value FROM system_settings WHERE key = 'backup_max_files'").get() as { value: string } | undefined;

  const retentionDays = parseInt(retentionDaysRow?.value || '30', 10);
  const maxFiles = parseInt(maxFilesRow?.value || '10', 10);

  const files = readdirSync(backupDirectory)
    .filter((f) => f.endsWith('.tar') || f.endsWith('.sqlite3') || f.endsWith('.bak'))
    .map((f) => {
      const full = join(backupDirectory, f);
      return { file: f, path: full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime); // newest first

  let prunedCount = 0;
  const cutoffTime = Date.now() - retentionDays * 24 * 3600 * 1000;

  files.forEach((f, idx) => {
    // Keep at least the newest 2 backups regardless of age
    if (idx < 2) return;

    const isTooOld = f.mtime < cutoffTime;
    const isOverMax = idx >= maxFiles;

    if (isTooOld || isOverMax) {
      try {
        unlinkSync(f.path);
        prunedCount++;
      } catch {
        // ignore
      }
    }
  });

  return { prunedCount };
}
