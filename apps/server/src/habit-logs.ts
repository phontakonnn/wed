import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from './database.js';
import { isIsoDate, localToday, shiftIso } from './dates.js';
import { habitSelect } from './life-os.js';

const UUID_PATTERN = '^[0-9a-fA-F-]{36}$';
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const habitLogSelect = `
  SELECT id, habit_id AS habitId, log_date AS logDate, count,
    target_snapshot AS targetSnapshot, created_at AS createdAt, updated_at AS updatedAt
  FROM habit_logs
`;

interface LogRow {
  log_date: string;
  count: number;
  target_snapshot: number;
}

/**
 * Recomputes `current_count`, `streak_days` and `last_checked_date` from `habit_logs`.
 *
 * Streak definition: a day counts when its log reaches that day's `target_snapshot`. A day with no
 * log is not a failure — it is simply not counted, because the system never recorded anything for it.
 * Today is not over, so an incomplete today does not break the streak; the count starts at yesterday.
 */
export function recomputeHabit(database: SqliteDatabase, ownerId: string, habitId: string): void {
  const habit = database.prepare('SELECT id FROM habits WHERE id = ? AND owner_id = ?')
    .get(habitId, ownerId);
  if (!habit) return;

  const logs = database.prepare(`
    SELECT log_date, count, target_snapshot FROM habit_logs
    WHERE habit_id = ? AND owner_id = ?
    ORDER BY log_date DESC
  `).all(habitId, ownerId) as LogRow[];

  const today = localToday();
  const byDate = new Map(logs.map((log) => [log.log_date, log]));
  const todayLog = byDate.get(today);
  const metTarget = (date: string): boolean => {
    const log = byDate.get(date);
    return Boolean(log && log.count >= log.target_snapshot);
  };

  let streak = 0;
  let cursor = metTarget(today) ? today : shiftIso(today, -1);
  while (metTarget(cursor) && streak < 3650) {
    streak += 1;
    cursor = shiftIso(cursor, -1);
  }

  database.prepare(`
    UPDATE habits SET current_count = ?, streak_days = ?, last_checked_date = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).run(
    todayLog ? todayLog.count : 0,
    streak,
    logs.length > 0 ? logs[0].log_date : null,
    Date.now(),
    habitId,
    ownerId,
  );
}

function bestStreak(logs: LogRow[]): number {
  const byDate = new Map(logs.map((log) => [log.log_date, log]));
  const dates = [...byDate.keys()].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    const log = byDate.get(date) as LogRow;
    const met = log.count >= log.target_snapshot;
    if (!met) {
      run = 0;
      previous = date;
      continue;
    }
    run = previous !== null && shiftIso(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

export function registerHabitLogRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  // Set the exact count for one day. 0 removes the log. Used for both today and past corrections.
  app.put<{ Params: { habitId: string; logDate: string }; Body: { count: number } }>(
    '/api/habits/:habitId/logs/:logDate',
    {
      schema: {
        params: {
          type: 'object',
          required: ['habitId', 'logDate'],
          properties: {
            habitId: { type: 'string', pattern: UUID_PATTERN },
            logDate: { type: 'string', pattern: ISO_DATE_PATTERN },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['count'],
          properties: { count: { type: 'integer', minimum: 0, maximum: 100000 } },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const habit = database.prepare('SELECT * FROM habits WHERE id = ? AND owner_id = ?')
        .get(request.params.habitId, ownerId) as Record<string, unknown> | undefined;
      if (!habit) return reply.code(404).send({ error: 'ไม่พบกิจวัตรนี้' });
      const logDate = request.params.logDate;
      if (!isIsoDate(logDate)) return reply.code(400).send({ error: 'วันที่ไม่ถูกต้อง' });
      const today = localToday();
      if (logDate > today) {
        return reply.code(400).send({ error: 'บันทึกย้อนหลังได้ แต่บันทึกวันในอนาคตไม่ได้' });
      }
      const trackingStart = habit.tracking_start_date as string | null;
      if (trackingStart && logDate < trackingStart) {
        return reply.code(400).send({ error: `เริ่มเก็บประวัติเมื่อ ${trackingStart}` });
      }

      const count = request.body.count;
      const now = Date.now();
      if (count === 0) {
        database.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND owner_id = ? AND log_date = ?')
          .run(request.params.habitId, ownerId, logDate);
      } else {
        database.prepare(`
          INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (habit_id, log_date) DO UPDATE SET
            count = excluded.count,
            target_snapshot = excluded.target_snapshot,
            updated_at = excluded.updated_at
        `).run(randomUUID(), ownerId, request.params.habitId, logDate, count,
          habit.daily_target as number, now, now);
      }

      recomputeHabit(database, ownerId, request.params.habitId);
      const updated = database.prepare(`${habitSelect} WHERE id = ? AND owner_id = ?`)
        .get(request.params.habitId, ownerId);
      const log = database.prepare(`${habitLogSelect} WHERE habit_id = ? AND owner_id = ? AND log_date = ?`)
        .get(request.params.habitId, ownerId, logDate) ?? null;
      return { habit: updated, log };
    },
  );

  // One request for every habit's recent history, so the UI never fires N queries.
  app.get<{ Querystring: { days?: number } }>('/api/habits/history', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 7 } },
      },
    },
  }, async (request, reply) => {
    const ownerId = request.sessionUserId;
    if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
    const today = localToday();
    const days = request.query.days ?? 7;
    const from = shiftIso(today, -(days - 1));

    const habits = database.prepare(`${habitSelect} WHERE owner_id = ? ORDER BY created_at`).all(ownerId) as Array<{
      id: string;
      dailyTarget: number;
      trackingStartDate: string | null;
    }>;
    const logs = database.prepare(`
      SELECT habit_id AS habitId, log_date AS logDate, count, target_snapshot AS targetSnapshot
      FROM habit_logs
      WHERE owner_id = ? AND log_date >= ? AND log_date <= ?
    `).all(ownerId, from, today) as Array<{ habitId: string; logDate: string; count: number; targetSnapshot: number }>;

    const byHabit = new Map<string, Map<string, { count: number; targetSnapshot: number }>>();
    for (const log of logs) {
      const bucket = byHabit.get(log.habitId) ?? new Map();
      bucket.set(log.logDate, { count: log.count, targetSnapshot: log.targetSnapshot });
      byHabit.set(log.habitId, bucket);
    }

    return {
      today,
      from,
      to: today,
      habits: habits.map((habit) => {
        const bucket = byHabit.get(habit.id) ?? new Map();
        const series: Array<{ date: string; count: number | null; metTarget: boolean | null }> = [];
        let cursor = from;
        while (cursor <= today && series.length < 90) {
          const tracked = !habit.trackingStartDate || cursor >= habit.trackingStartDate;
          const log = bucket.get(cursor);
          series.push({
            date: cursor,
            count: log ? log.count : (tracked ? 0 : null),
            metTarget: log ? log.count >= log.targetSnapshot : (tracked ? false : null),
          });
          cursor = shiftIso(cursor, 1);
        }
        return {
          habitId: habit.id,
          days: series,
          weekLogged: series.filter((day) => day.count !== null && day.count > 0).length,
          weekMetTarget: series.filter((day) => day.metTarget === true).length,
        };
      }),
    };
  });

  app.get<{ Params: { habitId: string }; Querystring: { from?: string; to?: string; days?: number } }>(
    '/api/habits/:habitId/history',
    {
      schema: {
        params: { type: 'object', required: ['habitId'], properties: { habitId: { type: 'string', pattern: UUID_PATTERN } } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: { type: 'string', pattern: ISO_DATE_PATTERN },
            to: { type: 'string', pattern: ISO_DATE_PATTERN },
            days: { type: 'integer', minimum: 1, maximum: 400, default: 30 },
          },
        },
      },
    },
    async (request, reply) => {
      const ownerId = request.sessionUserId;
      if (!ownerId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
      const habit = database.prepare(`${habitSelect} WHERE id = ? AND owner_id = ?`)
        .get(request.params.habitId, ownerId) as Record<string, unknown> | undefined;
      if (!habit) return reply.code(404).send({ error: 'ไม่พบกิจวัตรนี้' });

      const today = localToday();
      const to = request.query.to ?? today;
      const from = request.query.from ?? shiftIso(to, -(request.query.days ?? 30) + 1);
      if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
        return reply.code(400).send({ error: 'ช่วงวันที่ไม่ถูกต้อง' });
      }
      if (to > today) return reply.code(400).send({ error: 'ยังไม่มีข้อมูลของวันในอนาคต' });

      const trackingStart = (habit.trackingStartDate as string | null) ?? null;
      const logs = database.prepare(`
        ${habitLogSelect}
        WHERE habit_id = ? AND owner_id = ? AND log_date >= ? AND log_date <= ?
        ORDER BY log_date
      `).all(request.params.habitId, ownerId, from, to) as Array<{
        logDate: string;
        count: number;
        targetSnapshot: number;
      }>;
      const byDate = new Map(logs.map((log) => [log.logDate, log]));

      // Days before `trackingStartDate` are reported as untracked, never as zero. Reporting 0 there
      // would claim the user failed on a day the system was not even watching.
      const days: Array<{ date: string; count: number | null; targetSnapshot: number | null; metTarget: boolean | null }> = [];
      let cursor = from;
      while (cursor <= to && days.length < 400) {
        const log = byDate.get(cursor);
        const tracked = !trackingStart || cursor >= trackingStart;
        days.push({
          date: cursor,
          count: log ? log.count : (tracked ? 0 : null),
          targetSnapshot: log ? log.targetSnapshot : (tracked ? (habit.dailyTarget as number) : null),
          metTarget: log ? log.count >= log.targetSnapshot : (tracked ? false : null),
        });
        cursor = shiftIso(cursor, 1);
      }

      const inRange = (start: string, end: string) => days.filter((day) => day.date >= start && day.date <= end);
      const summarise = (subset: typeof days) => ({
        daysTracked: subset.filter((day) => day.metTarget !== null).length,
        daysLogged: subset.filter((day) => day.count !== null && day.count > 0).length,
        daysMetTarget: subset.filter((day) => day.metTarget === true).length,
      });

      const allLogs = database.prepare(`
        SELECT log_date, count, target_snapshot FROM habit_logs WHERE habit_id = ? AND owner_id = ?
      `).all(request.params.habitId, ownerId) as LogRow[];

      const monthStart = `${today.slice(0, 7)}-01`;
      const weekStart = shiftIso(today, -6);

      return {
        habit,
        from,
        to,
        trackingStartDate: trackingStart,
        days,
        logs,
        summary: {
          ...summarise(days),
          currentStreak: habit.streakDays as number,
          bestStreak: bestStreak(allLogs),
          weekly: { from: weekStart, to: today, ...summarise(inRange(weekStart, today)) },
          monthly: { from: monthStart, to: today, ...summarise(inRange(monthStart, today)) },
        },
      };
    },
  );
}
