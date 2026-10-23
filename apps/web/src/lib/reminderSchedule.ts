export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface RepeatRule {
  type: RepeatType;
  /** Every N days/weeks/months. Defaults to 1. */
  interval?: number;
  /** 0 = Sunday … 6 = Saturday. Only used by weekly rules. */
  byWeekday?: number[];
  /** Epoch ms. No occurrence may be scheduled at or after this time. */
  until?: number | null;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

function wallClock(timeMs: number, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(new Date(timeMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number(value ?? 0);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function asUtcMs(clock: WallClock): number {
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second, 0);
}

/** Offset of a timezone at a given instant, including DST. */
function offsetMs(timeMs: number, timeZone: string): number {
  const clock = wallClock(timeMs, timeZone);
  return asUtcMs(clock) - timeMs;
}

/** Turn a wall-clock time in `timeZone` into an epoch timestamp. */
function wallTimeToEpoch(clock: WallClock, timeZone: string): number {
  const guess = asUtcMs(clock);
  // Two passes converge for all real-world offsets, including DST boundaries.
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(clock: WallClock, months: number): WallClock {
  const zeroBased = clock.month - 1 + months;
  const year = clock.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { ...clock, year, month, day: Math.min(clock.day, daysInMonth(year, month)) };
}

function addDays(clock: WallClock, days: number): WallClock {
  const next = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days, clock.hour, clock.minute, clock.second));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: next.getUTCHours(),
    minute: next.getUTCMinutes(),
    second: next.getUTCSeconds(),
  };
}

function weekdayOf(clock: WallClock): number {
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay();
}

function normalizeInterval(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1) return 1;
  return Math.min(365, Math.floor(value));
}

/**
 * Next occurrence strictly after `currentMs`. Returns null for one-off rules or
 * when the rule's `until` cutoff has been reached.
 */
export function nextReminderAt(
  currentMs: number,
  rule: RepeatRule,
  timeZone = 'Asia/Bangkok',
): number | null {
  if (rule.type === 'none') return null;

  const interval = normalizeInterval(rule.interval);
  const current = wallClock(currentMs, timeZone);
  let candidate: WallClock;

  if (rule.type === 'daily' || rule.type === 'custom') {
    candidate = addDays(current, interval);
  } else if (rule.type === 'monthly') {
    candidate = addMonths(current, interval);
  } else {
    const byWeekday = (rule.byWeekday ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (byWeekday.length === 0) {
      candidate = addDays(current, 7 * interval);
    } else if (interval === 1) {
      // Next matching weekday in the coming week (tomorrow through +7 days).
      candidate = addDays(current, 1);
      for (let step = 0; step < 7 && !byWeekday.includes(weekdayOf(candidate)); step += 1) {
        candidate = addDays(candidate, 1);
      }
    } else {
      // Skip whole weeks, then choose the first matching weekday in that week.
      const sundayOfCurrentWeek = addDays(current, -weekdayOf(current));
      candidate = addDays(sundayOfCurrentWeek, 7 * interval);
      for (let step = 0; step < 7 && !byWeekday.includes(weekdayOf(candidate)); step += 1) {
        candidate = addDays(candidate, 1);
      }
    }
  }

  const nextMs = wallTimeToEpoch(candidate, timeZone);
  if (rule.until != null && nextMs >= rule.until) return null;
  if (nextMs <= currentMs) {
    // Defensive: never return a timestamp that cannot fire in the future.
    return nextReminderAt(nextMs, { ...rule, until: rule.until }, timeZone);
  }
  return nextMs;
}

export function snoozeUntil(nowMs: number, minutes: number): number {
  const safeMinutes = Math.min(60 * 24 * 30, Math.max(1, Math.floor(minutes)));
  return nowMs + safeMinutes * 60000;
}

export function isDue(remindAt: number, nowMs: number, graceMs = 0): boolean {
  return remindAt <= nowMs + graceMs;
}
