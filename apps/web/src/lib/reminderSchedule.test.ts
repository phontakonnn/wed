import { describe, expect, it } from 'vitest';
import { isDue, nextReminderAt, snoozeUntil, type RepeatRule } from './reminderSchedule';

const BANGKOK = 'Asia/Bangkok';
const fridayNineBangkok = Date.parse('2026-10-23T02:00:00Z'); // 09:00 in Bangkok

describe('nextReminderAt', () => {
  it('returns null for one-off reminders', () => {
    expect(nextReminderAt(fridayNineBangkok, { type: 'none' }, BANGKOK)).toBeNull();
  });

  it('advances daily reminders at the same local wall time', () => {
    const rule: RepeatRule = { type: 'daily' };
    expect(nextReminderAt(fridayNineBangkok, rule, BANGKOK)).toBe(Date.parse('2026-10-24T02:00:00Z'));
  });

  it('honours custom intervals', () => {
    const rule: RepeatRule = { type: 'custom', interval: 3 };
    expect(nextReminderAt(fridayNineBangkok, rule, BANGKOK)).toBe(Date.parse('2026-10-26T02:00:00Z'));
  });

  it('finds the next matching weekday', () => {
    const rule: RepeatRule = { type: 'weekly', byWeekday: [1] }; // Monday
    expect(nextReminderAt(fridayNineBangkok, rule, BANGKOK)).toBe(Date.parse('2026-10-26T02:00:00Z'));
  });

  it('clamps monthly reminders to the last day of short months', () => {
    const januaryThirtyFirst = Date.parse('2026-01-31T02:00:00Z'); // 09:00 Bangkok
    const rule: RepeatRule = { type: 'monthly' };
    expect(nextReminderAt(januaryThirtyFirst, rule, BANGKOK)).toBe(Date.parse('2026-02-28T02:00:00Z'));
  });

  it('stops at the until cutoff', () => {
    const rule: RepeatRule = { type: 'daily', until: Date.parse('2026-10-24T00:00:00Z') };
    expect(nextReminderAt(fridayNineBangkok, rule, BANGKOK)).toBeNull();
  });

  it('keeps UTC wall time when the timezone is UTC', () => {
    const current = Date.parse('2026-10-23T09:00:00Z');
    expect(nextReminderAt(current, { type: 'daily' }, 'UTC')).toBe(Date.parse('2026-10-24T09:00:00Z'));
  });
});

describe('snooze helpers', () => {
  it('adds minutes and clamps invalid input', () => {
    expect(snoozeUntil(1_000_000, 10)).toBe(1_000_000 + 10 * 60000);
    expect(snoozeUntil(0, 0)).toBe(60000);
    expect(snoozeUntil(0, 999999)).toBe(30 * 24 * 60 * 60000);
  });

  it('detects due reminders with an optional grace window', () => {
    expect(isDue(1000, 2000)).toBe(true);
    expect(isDue(5000, 2000)).toBe(false);
    expect(isDue(5000, 2000, 3000)).toBe(true);
  });
});
