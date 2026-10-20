import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';
import { goalSelect, inboxSelect, projectSelect, taskSelect } from './work.js';
import { habitSelect, reminderSelect, timeblockSelect } from './life-os.js';
import { localToday, shiftIso } from './dates.js';

function progressPercent(target: unknown, current: unknown): number | null {
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null;
  const value = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

export function registerDashboardRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  app.get('/api/dashboard', async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const today = localToday();
    const weekAhead = shiftIso(today, 7);

    const dueToday = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.due_date = ? AND t.status NOT IN ('done', 'cancelled')
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.created_at
      LIMIT 20
    `).all(ownerId, today);

    const overdue = database.prepare(`
      ${taskSelect}
      WHERE t.owner_id = ? AND t.due_date IS NOT NULL AND t.due_date < ?
        AND t.status NOT IN ('done', 'cancelled')
      ORDER BY t.due_date, t.created_at
      LIMIT 20
    `).all(ownerId, today);

    const openTaskTotal = (database.prepare(`
      SELECT COUNT(*) AS total FROM tasks
      WHERE owner_id = ? AND status IN ('todo', 'doing', 'waiting')
    `).get(ownerId) as { total: number }).total;

    const reminders = database.prepare(`
      ${reminderSelect}
      WHERE r.owner_id = ? AND r.is_completed = 0
        AND r.target_date >= ? AND r.target_date <= ?
      ORDER BY r.target_date, r.priority DESC
      LIMIT 8
    `).all(ownerId, today, shiftIso(today, 60));

    const blocks = database.prepare(`
      ${timeblockSelect}
      WHERE owner_id = ? AND block_date = ?
      ORDER BY time_range
    `).all(ownerId, today);
    const blocksDone = (blocks as Array<{ isDone: number }>).filter((block) => block.isDone === 1).length;

    const projects = database.prepare(`
      ${projectSelect}
      WHERE p.owner_id = ? AND p.status IN ('planned', 'active', 'paused')
      ORDER BY (p.due_date IS NULL), p.due_date, p.updated_at DESC
      LIMIT 6
    `).all(ownerId);

    const goalRows = database.prepare(`
      ${goalSelect}
      WHERE g.owner_id = ? AND g.status = 'active'
      ORDER BY (g.due_date IS NULL), g.due_date, g.created_at DESC
      LIMIT 6
    `).all(ownerId) as Array<Record<string, unknown>>;
    const goals = goalRows.map((row) => ({
      ...row,
      progressPercent: progressPercent(row.targetValue, row.currentValue),
    }));

    // A habit counts as outstanding until it reaches its daily target or is checked today.
    const habitRows = database.prepare(`
      ${habitSelect}
      WHERE owner_id = ?
        AND (current_count < daily_target OR last_checked_date IS NULL OR last_checked_date <> ?)
      ORDER BY created_at
      LIMIT 8
    `).all(ownerId, today) as Array<Record<string, unknown>>;
    // One grouped query for the week, so the card never fires a query per habit.
    const weekFrom = shiftIso(today, -6);
    const weekCounts = database.prepare(`
      SELECT habit_id AS habitId,
        SUM(CASE WHEN count > 0 THEN 1 ELSE 0 END) AS logged,
        SUM(CASE WHEN count >= target_snapshot THEN 1 ELSE 0 END) AS met
      FROM habit_logs
      WHERE owner_id = ? AND log_date >= ? AND log_date <= ?
      GROUP BY habit_id
    `).all(ownerId, weekFrom, today) as Array<{ habitId: string; logged: number; met: number }>;
    const weekByHabit = new Map(weekCounts.map((row) => [row.habitId, row]));
    const habits = habitRows.map((habit) => {
      const week = weekByHabit.get(habit.id as string);
      return {
        ...habit,
        weekLogged: week?.logged ?? 0,
        weekMetTarget: week?.met ?? 0,
      };
    });

    const inboxNewCount = (database.prepare(
      "SELECT COUNT(*) AS total FROM inbox_items WHERE owner_id = ? AND status = 'new'",
    ).get(ownerId) as { total: number }).total;
    const inboxItems = database.prepare(`
      ${inboxSelect}
      WHERE owner_id = ? AND status = 'new'
      ORDER BY created_at DESC
      LIMIT 5
    `).all(ownerId);

    const notes = database.prepare(`
      SELECT id, title, updated_at AS updatedAt
      FROM notes
      WHERE owner_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(ownerId);

    // Vault items that need attention inside the next 60 days, including anything already overdue.
    const vaultExpiring = database.prepare(`
      SELECT id, title, category, renewal_or_expiry_date AS renewalOrExpiryDate,
        amount_text AS amountText, physical_location AS physicalLocation
      FROM vault_items
      WHERE owner_id = ? AND renewal_or_expiry_date IS NOT NULL
        AND renewal_or_expiry_date <= ?
      ORDER BY renewal_or_expiry_date, title
      LIMIT 6
    `).all(ownerId, shiftIso(today, 60));

    // "In use" SOPs only: a manual being studied or already finished is not a daily reference.
    const libraryActive = database.prepare(`
      SELECT id, title, category, status, key_takeaways AS keyTakeaways
      FROM library_items
      WHERE owner_id = ? AND status = 'ใช้งานประจำ'
      ORDER BY is_favorite DESC, updated_at DESC
      LIMIT 5
    `).all(ownerId);

    const countRows = (table: string, extra = '') =>
      (database.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE owner_id = ?${extra}`)
        .get(ownerId) as { total: number }).total;

    const totals = {
      notes: countRows('notes', ' AND deleted_at IS NULL'),
      tasks: openTaskTotal,
      vault: countRows('vault_items'),
      library: countRows('library_items'),
    };

    const counts = {
      dueToday: dueToday.length,
      overdue: overdue.length,
      openTasks: openTaskTotal,
      reminders: reminders.length,
      inbox: inboxNewCount,
      projects: projects.length,
      goals: goals.length,
      habitsOutstanding: habits.length,
      notes: notes.length,
      vaultExpiring: vaultExpiring.length,
      upcomingWindowEnd: weekAhead,
    };

    return {
      today,
      counts,
      totals,
      tasks: { dueToday, overdue },
      reminders,
      timeblocks: { blocks, done: blocksDone, total: blocks.length },
      projects,
      goals,
      habits,
      inbox: { newCount: inboxNewCount, items: inboxItems },
      notes,
      vault: { expiring: vaultExpiring },
      library: { active: libraryActive },
    };
  });
}
