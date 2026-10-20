/**
 * Canonical date helpers for the server. Every module must use these so the client and the server
 * never disagree about what "today" is, and so month-end and leap-year clamping behave the same
 * everywhere.
 *
 * Dates are `YYYY-MM-DD` strings interpreted in the server's local calendar. There is no timezone
 * conversion and no `Date` serialisation involved beyond constructing a local date.
 */

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Next occurrence after `iso`.
 *
 * `anchorIso` keeps monthly and yearly recurrence on the original day-of-month / day-of-year, so a
 * reminder created on the 31st stays on the 31st and is only clamped in short months (31 Jan →
 * 28/29 Feb → 31 Mar), instead of drifting earlier every month. A 29 February yearly reminder lands
 * on 28 February in a non-leap year and returns to 29 February in the next leap year.
 */
export function nextOccurrence(
  iso: string,
  recurrence: Exclude<Recurrence, 'none'>,
  anchorIso?: string | null,
): string {
  if (recurrence === 'daily') return shiftIso(iso, 1);
  if (recurrence === 'weekly') return shiftIso(iso, 7);

  const [year, month, day] = iso.split('-').map(Number);
  const anchorParts = anchorIso && isIsoDate(anchorIso) ? anchorIso.split('-').map(Number) : null;

  if (recurrence === 'monthly') {
    const anchorDay = anchorParts ? anchorParts[2] : day;
    const nextMonthIndex = month; // month is 1-based, so this is "next month" as a 0-based index
    const nextYear = nextMonthIndex === 12 ? year + 1 : year;
    const normalisedMonth = nextMonthIndex === 12 ? 1 : nextMonthIndex + 1;
    const clampedDay = Math.min(anchorDay, daysInMonth(nextYear, normalisedMonth));
    return `${nextYear}-${pad(normalisedMonth)}-${pad(clampedDay)}`;
  }

  const anchorMonth = anchorParts ? anchorParts[1] : month;
  const anchorDay = anchorParts ? anchorParts[2] : day;
  const nextYear = year + 1;
  const clampedDay = Math.min(anchorDay, daysInMonth(nextYear, anchorMonth));
  return `${nextYear}-${pad(anchorMonth)}-${pad(clampedDay)}`;
}

/** Inclusive list of ISO dates from `from` to `to`, or an empty array when the range is invalid. */
export function dateRange(from: string, to: string, maxDays = 400): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < maxDays) {
    dates.push(cursor);
    cursor = shiftIso(cursor, 1);
  }
  return dates;
}
