import React, { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import type {
  Task,
  Reminder,
  ReminderCategory,
  Person,
  Timeblock,
  LifeArea,
} from '../../api';
import type { NotesView } from '../../types';
import { reminderCategoryLabel, lifeAreaLabel } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

interface ReminderDraft {
  title: string;
  targetDate: string;
  category: ReminderCategory;
  recurrence: NonNullable<Reminder['recurrence']>;
  linkedPersonId: string;
  notifyDaysBefore: string;
}

interface TimeblockDraft {
  timeRange: string;
  title: string;
  lifeArea: LifeArea;
}

interface HabitsViewProps {
  scheduleDate: string;
  scheduleBusy: boolean;
  scheduleError: string;
  scheduleNotice: string;
  reminders: Reminder[];
  reminderDraft: ReminderDraft;
  setReminderDraft: React.Dispatch<React.SetStateAction<ReminderDraft>>;
  people: Person[];
  tasks?: Task[];
  onAddReminder: (e: FormEvent) => void;
  onToggleReminder: (reminder: Reminder) => Promise<void>;
  onSnoozeReminder: (reminder: Reminder, days: number) => Promise<void>;
  onRemoveReminder: (reminder: Reminder) => Promise<void>;
  timeblocks: Timeblock[];
  blockDraft: TimeblockDraft;
  setBlockDraft: React.Dispatch<React.SetStateAction<TimeblockDraft>>;
  onAddTimeblock: (e: FormEvent) => void;
  onToggleTimeblock: (block: Timeblock) => Promise<void>;
  onRemoveTimeblock: (block: Timeblock) => Promise<void>;
  onSwitchView: (view: NotesView) => void;
}

/** Top-level split of this screen: the calendar+reminders workspace, or the daily timeline. */
type MainTab = 'calendar' | 'timeblocks';
/** How the important-dates column is narrowed down. */
type ReminderTier = 'upcoming' | 'month' | 'all';
type CountdownTone = 'overdue' | 'today' | 'soon' | 'later' | 'done';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const REMINDER_TIERS: Array<{ key: ReminderTier; label: string; emptyTitle: string }> = [
  { key: 'upcoming', label: 'ใกล้ถึง', emptyTitle: 'ยังไม่มีวันสำคัญที่กำลังจะถึง' },
  { key: 'month', label: 'เดือนนี้', emptyTitle: 'ไม่มีวันสำคัญในเดือนนี้' },
  { key: 'all', label: 'ทั้งหมด', emptyTitle: 'ยังไม่มีการแจ้งเตือน' },
];

/**
 * Format a Date as YYYY-MM-DD using **local** calendar fields.
 * `toISOString()` must not be used here: it converts to UTC first, so a local
 * midnight in UTC+7 becomes 17:00 of the previous day and every date shifts
 * back by one.
 */
function toLocalISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseTimeMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function checkTimeRangeStatus(timeRange: string, currentMinutes: number): 'current' | 'past' | 'upcoming' | 'unknown' {
  const parts = timeRange.split(/[-–—]/);
  if (parts.length !== 2) return 'unknown';
  const startM = parseTimeMinutes(parts[0]);
  const endM = parseTimeMinutes(parts[1]);
  if (startM === null || endM === null) return 'unknown';

  if (currentMinutes >= startM && currentMinutes <= endM) {
    return 'current';
  }
  if (currentMinutes > endM) {
    return 'past';
  }
  return 'upcoming';
}

/** Whole days from `fromDate` to `targetDate` (both YYYY-MM-DD, local midnights). */
function daysBetween(targetDate: string, fromDate: string): number {
  const target = new Date(targetDate + 'T00:00:00').getTime();
  const from = new Date(fromDate + 'T00:00:00').getTime();
  if (Number.isNaN(target) || Number.isNaN(from)) return 0;
  return Math.round((target - from) / 86_400_000);
}

function countdownLabel(days: number, done: boolean): string {
  if (done) return '✓ เสร็จแล้ว';
  if (days === 0) return 'วันนี้!';
  if (days === 1) return 'พรุ่งนี้';
  if (days > 1) return `อีก ${days} วัน`;
  if (days === -1) return 'เลยมา 1 วัน';
  return `เลยมา ${Math.abs(days)} วัน`;
}

function countdownTone(days: number, done: boolean): CountdownTone {
  if (done) return 'done';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  return 'later';
}

/**
 * Resolve the date a reminder should be counted down to.
 * Recurring reminders roll forward, otherwise a yearly birthday would read
 * "เลยมา 300 วัน" instead of "อีก 65 วัน".
 */
function resolveReminderDate(reminder: Reminder, today: string): string {
  const base = reminder.snoozedUntil || reminder.targetDate;
  const recurrence = reminder.recurrence ?? 'none';
  if (recurrence === 'none' || !base) return base;
  if (base >= today) return base;

  if (recurrence === 'daily') return today;

  if (recurrence === 'weekly') {
    const baseDow = new Date(base + 'T00:00:00').getDay();
    const cursor = new Date(today + 'T00:00:00');
    const delta = (baseDow - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + delta);
    return toLocalISO(cursor);
  }

  if (recurrence === 'monthly') {
    const dayOfMonth = Number(base.slice(8, 10));
    const cursor = new Date(today + 'T00:00:00');
    for (let i = 0; i < 14; i += 1) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth() + i, dayOfMonth);
      // Skip months where that day number does not exist (e.g. 31st in February).
      if (candidate.getDate() !== dayOfMonth) continue;
      const iso = toLocalISO(candidate);
      if (iso >= today) return iso;
    }
    return base;
  }

  // yearly
  const month = Number(base.slice(5, 7)) - 1;
  const dayOfMonth = Number(base.slice(8, 10));
  const cursor = new Date(today + 'T00:00:00');
  for (let i = 0; i < 2; i += 1) {
    const candidate = new Date(cursor.getFullYear() + i, month, dayOfMonth);
    if (candidate.getDate() !== dayOfMonth) continue;
    const iso = toLocalISO(candidate);
    if (iso >= today) return iso;
  }
  return base;
}

interface CalendarEventItem {
  id: string;
  title: string;
  dateStr: string;
  type: 'event' | 'birthday' | 'anniversary' | 'reminder' | 'task';
  badgeColor: string;
  badgeBg: string;
  icon: string;
  subtitle?: string;
  originalItem?: Reminder | Task | Person;
}

export const HabitsView: React.FC<HabitsViewProps> = ({
  scheduleDate,
  scheduleBusy,
  scheduleError,
  scheduleNotice,
  reminders,
  reminderDraft,
  setReminderDraft,
  people,
  tasks = [],
  onAddReminder,
  onToggleReminder,
  onSnoozeReminder,
  onRemoveReminder,
  timeblocks,
  blockDraft,
  setBlockDraft,
  onAddTimeblock,
  onToggleTimeblock,
  onRemoveTimeblock,
  onSwitchView,
}) => {
  // Real-time Bangkok Clock
  const [bangkokTime, setBangkokTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setBangkokTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute current Bangkok time string & minutes
  const { bangkokTimeString, bangkokDateString, currentMinutes } = useMemo(() => {
    // Get time in Asia/Bangkok
    const timeFormatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = timeFormatter.formatToParts(bangkokTime);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const second = parts.find((p) => p.type === 'second')?.value || '00';

    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second} น.`;

    // Date in Thai
    const dateFormatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dateStr = dateFormatter.format(bangkokTime);

    return {
      bangkokTimeString: timeStr,
      bangkokDateString: dateStr,
      currentMinutes: hour * 60 + minute,
    };
  }, [bangkokTime]);

  // Top-level tab: calendar workspace vs daily timeline
  const [mainTab, setMainTab] = useState<MainTab>('calendar');

  // Calendar State (Month & Year navigation)
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(scheduleDate);
  const [era, setEra] = useState<'be' | 'ce'>('be');
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'year'>('month');

  // Quick Event Creation Modal State
  const [quickEventModalOpen, setQuickEventModalOpen] = useState(false);
  const [quickEventDate, setQuickEventDate] = useState(scheduleDate);
  const [quickEventTitle, setQuickEventTitle] = useState('');
  const [quickEventCategory, setQuickEventCategory] = useState<ReminderCategory>('other');
  const [quickEventRecurrence, setQuickEventRecurrence] = useState<NonNullable<Reminder['recurrence']>>('none');
  const [quickEventPersonId, setQuickEventPersonId] = useState('');
  const [quickEventDaysBefore, setQuickEventDaysBefore] = useState('0');

  // The inline "add important date" form stays collapsed so the countdown
  // list keeps the panel's attention; the modal covers the same ground.
  const [reminderFormOpen, setReminderFormOpen] = useState(false);

  // Which slice of the important-dates column is showing.
  const [reminderTier, setReminderTier] = useState<ReminderTier>('upcoming');

  // Multi-Source Events Engine with Dynamic Recurrence Calculation
  const getEventsForDate = useCallback((dateStr: string): CalendarEventItem[] => {
    const items: CalendarEventItem[] = [];

    // 1. Reminders with Recurrence (Dynamic Expansion)
    for (const r of reminders) {
      const baseDate = r.snoozedUntil || r.targetDate;
      let match = false;
      if (baseDate === dateStr) {
        match = true;
      } else if (r.recurrence === 'daily' && dateStr >= baseDate) {
        match = true;
      } else if (r.recurrence === 'weekly' && dateStr >= baseDate) {
        const d1 = new Date(dateStr + 'T00:00:00');
        const d2 = new Date(baseDate + 'T00:00:00');
        if (d1.getDay() === d2.getDay()) match = true;
      } else if (r.recurrence === 'monthly' && dateStr >= baseDate) {
        if (dateStr.slice(8, 10) === baseDate.slice(8, 10)) match = true;
      } else if (r.recurrence === 'yearly' && dateStr >= baseDate) {
        if (dateStr.slice(5, 10) === baseDate.slice(5, 10)) match = true;
      }

      if (match) {
        let icon: string;
        let type: CalendarEventItem['type'];
        let badgeColor: string;
        let badgeBg: string;

        if (r.category === 'birthday') {
          icon = '🎂';
          type = 'birthday';
          badgeColor = '#db2777';
          badgeBg = '#fce7f3';
        } else if (r.category === 'anniversary') {
          icon = '💍';
          type = 'anniversary';
          badgeColor = '#9333ea';
          badgeBg = '#f3e8ff';
        } else if (r.category === 'health') {
          icon = '🏥';
          type = 'reminder';
          badgeColor = '#059669';
          badgeBg = '#d1fae5';
        } else if (r.category === 'backup') {
          icon = '💾';
          type = 'reminder';
          badgeColor = '#475569';
          badgeBg = '#f1f5f9';
        } else {
          icon = '🌟';
          type = 'reminder';
          badgeColor = '#3b82f6';
          badgeBg = '#eff6ff';
        }

        items.push({
          id: `rem-${r.id}-${dateStr}`,
          title: r.title,
          dateStr,
          type,
          badgeColor,
          badgeBg,
          icon,
          subtitle: r.isCompleted ? '✓ เสร็จแล้ว' : reminderCategoryLabel(r.category),
          originalItem: r,
        });
      }
    }

    // 2. People Birthdays & Anniversaries
    const targetMMDD = dateStr.slice(5, 10);
    for (const p of people) {
      if (p.birthdayOrAnniversary && p.birthdayOrAnniversary.includes(targetMMDD)) {
        items.push({
          id: `bday-${p.id}-${dateStr}`,
          title: `วันเกิด: ${p.name}`,
          dateStr,
          type: 'birthday',
          badgeColor: '#e11d48',
          badgeBg: '#ffe4e6',
          icon: '🎂',
          subtitle: p.roleLabel || 'คนสำคัญ',
          originalItem: p,
        });
      }
    }

    // 3. Tasks Due Dates
    if (tasks) {
      for (const t of tasks) {
        if (t.dueDate === dateStr && t.status !== 'done') {
          items.push({
            id: `task-${t.id}-${dateStr}`,
            title: `กำหนดส่ง: ${t.title}`,
            dateStr,
            type: 'task',
            badgeColor: '#d97706',
            badgeBg: '#fef3c7',
            icon: '📋',
            subtitle: `สถานะ: ${t.status}`,
            originalItem: t,
          });
        }
      }
    }

    return items;
  }, [reminders, people, tasks]);

  // Reminder rows with countdown metadata, filtered by tier and sorted by proximity.
  const reminderRows = useMemo(() => {
    const today = scheduleDate;
    const rows = reminders.map((reminder) => {
      const dateStr = resolveReminderDate(reminder, today);
      const done = reminder.isCompleted === 1;
      const days = daysBetween(dateStr, today);
      return {
        reminder,
        dateStr,
        days,
        done,
        tone: countdownTone(days, done),
        label: countdownLabel(days, done),
      };
    });

    const filtered = rows.filter(({ dateStr, done }) => {
      if (reminderTier === 'upcoming') return !done || dateStr === today;
      if (reminderTier === 'month') {
        return dateStr.slice(0, 7) === today.slice(0, 7) || (dateStr < today && !done);
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.dateStr.localeCompare(b.dateStr);
    });
  }, [reminders, reminderTier, scheduleDate]);

  // Calendar dates matrix for Month View
  const { calendarDays, monthLabel } = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      events: CalendarEventItem[];
      isToday: boolean;
    }> = [];

    for (let i = 0; i < startWeekday; i++) {
      days.push({ day: 0, dateStr: '', isCurrentMonth: false, events: [], isToday: false });
    }

    const monthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const events = getEventsForDate(dateStr);
      const isToday = dateStr === scheduleDate;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        events,
        isToday,
      });
    }

    const displayYear = era === 'be' ? calendarYear + 543 : calendarYear;
    const eraText = era === 'be' ? 'พ.ศ.' : 'ค.ศ.';
    const monthLabel = `${THAI_MONTHS[calendarMonth]} ${eraText} ${displayYear}`;

    return { calendarDays: days, monthLabel };
  }, [calendarYear, calendarMonth, getEventsForDate, scheduleDate, era]);

  // Selected date events
  const selectedDateEvents = useMemo(() => {
    return getEventsForDate(selectedCalendarDate);
  }, [selectedCalendarDate, getEventsForDate]);

  // Week days for Week View
  const weekDays = useMemo(() => {
    const base = new Date(selectedCalendarDate + 'T00:00:00');
    const dayOfWeek = base.getDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);

    const days: Array<{ dateStr: string; dayNum: number; dayLabel: string; events: CalendarEventItem[]; isToday: boolean }> = [];
    const labels = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toLocalISO(d);
      days.push({
        dateStr,
        dayNum: d.getDate(),
        dayLabel: labels[i],
        events: getEventsForDate(dateStr),
        isToday: dateStr === scheduleDate,
      });
    }
    return days;
  }, [selectedCalendarDate, getEventsForDate, scheduleDate]);

  // Jump to today helper
  const handleJumpToday = () => {
    const now = new Date();
    setCalendarMonth(now.getMonth());
    setCalendarYear(now.getFullYear());
    setSelectedCalendarDate(scheduleDate);
  };

  // Quick Event submission
  const handleOpenQuickEvent = (dateStr?: string) => {
    setQuickEventDate(dateStr || selectedCalendarDate);
    setQuickEventTitle('');
    setQuickEventCategory('other');
    setQuickEventRecurrence('none');
    setQuickEventPersonId('');
    setQuickEventDaysBefore('0');
    setQuickEventModalOpen(true);
  };

  const handleQuickEventSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickEventTitle.trim()) return;
    setReminderDraft({
      title: quickEventTitle.trim(),
      targetDate: quickEventDate,
      category: quickEventCategory,
      recurrence: quickEventRecurrence,
      linkedPersonId: quickEventPersonId,
      notifyDaysBefore: quickEventDaysBefore,
    });
    setQuickEventModalOpen(false);
    setTimeout(() => {
      onAddReminder(e);
    }, 50);
  };

  // Generate Year options (2020 - 2035)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = 2020; y <= 2035; y++) {
      years.push(y);
    }
    return years;
  }, []);

  const doneBlocks = timeblocks.filter((b) => b.isDone === 1).length;
  const activeBlock = timeblocks.find((b) => checkTimeRangeStatus(b.timeRange, currentMinutes) === 'current');
  const openReminderCount = reminders.filter((r) => r.isCompleted === 0).length;
  const nextReminder = reminderRows.find((row) => !row.done);

  return (
    <section className="life-view-container" aria-label="ปฏิทินและตารางชีวิต">
      {/* Header Banner */}
      <div className="module-header-banner" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)', border: '1px solid var(--pkh-border-subtle)' }}>
        <div className="banner-icon">📅</div>
        <div className="banner-info" style={{ flex: 1 }}>
          <span className="eyebrow">Smart Calendar &amp; Live Time Engine</span>
          <h2 className="banner-title">ปฏิทินอัจฉริยะและตารางชีวิต</h2>
          <p className="banner-subtitle">
            ติดตามกิจกรรม วันสำคัญ นัดหมาย และวงจรการทำซ้ำในที่เดียว
          </p>
        </div>

        {/* Real-time Bangkok Clock Widget */}
        <div className="life-clock-widget">
          <div className="life-clock-label">
            <span className="life-clock-dot" aria-hidden="true" />
            🇹🇭 BANGKOK TIME (UTC+7)
          </div>
          <div className="life-clock-time">{bangkokTimeString}</div>
          <div className="life-clock-date">{bangkokDateString}</div>
        </div>

        <div className="banner-actions">
          <Button variant="quiet" onClick={() => onSwitchView('notes')}>
            📝 ไปที่โน้ต
          </Button>
        </div>
      </div>

      {scheduleError && <p className="form-error editor-error" role="alert">{scheduleError}</p>}
      {scheduleNotice && <p className="form-notice" role="status">{scheduleNotice}</p>}

      {/* Primary tabs: the two pages this screen is made of */}
      <div className="life-main-tabs" role="tablist" aria-label="มุมมองหลัก">
        <button
          type="button"
          role="tab"
          id="life-tab-calendar"
          aria-selected={mainTab === 'calendar'}
          aria-controls="life-panel-calendar"
          className={`life-main-tab ${mainTab === 'calendar' ? 'is-active' : ''}`}
          onClick={() => setMainTab('calendar')}
        >
          <span className="life-main-tab-icon" aria-hidden="true">📅</span>
          ปฏิทินอัจฉริยะ &amp; วันสำคัญ
        </button>
        <button
          type="button"
          role="tab"
          id="life-tab-timeblocks"
          aria-selected={mainTab === 'timeblocks'}
          aria-controls="life-panel-timeblocks"
          className={`life-main-tab ${mainTab === 'timeblocks' ? 'is-active' : ''}`}
          onClick={() => setMainTab('timeblocks')}
        >
          <span className="life-main-tab-icon" aria-hidden="true">⏱️</span>
          ตารางชีวิต (Timeblocks)
        </button>
      </div>

      {/* ── TAB 1: Calendar + important dates ─────────────────────── */}
      {mainTab === 'calendar' && (
        <div
          className="life-calendar-layout"
          role="tabpanel"
          id="life-panel-calendar"
          aria-labelledby="life-tab-calendar"
        >
          {/* Smart Calendar Card */}
          <div className="life-quick-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Calendar Controls Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>

              {/* Direct Month & Year Dropdowns */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>📆</span>
                <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>{monthLabel}</strong>

                {/* Month Dropdown */}
                <select
                  value={calendarMonth}
                  onChange={(e) => setCalendarMonth(Number(e.target.value))}
                  aria-label="เลือกเดือน"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    color: 'var(--pkh-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {THAI_MONTHS.map((name, idx) => (
                    <option key={name} value={idx}>{name}</option>
                  ))}
                </select>

                {/* Year Dropdown */}
                <select
                  value={calendarYear}
                  onChange={(e) => setCalendarYear(Number(e.target.value))}
                  aria-label="เลือกปี"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    color: 'var(--pkh-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {era === 'be' ? `พ.ศ. ${y + 543}` : `ค.ศ. ${y}`}
                    </option>
                  ))}
                </select>

                {/* Era Toggle Button */}
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setEra((cur) => cur === 'be' ? 'ce' : 'be')}
                  title="สลับการแสดงผลระหว่าง พ.ศ. และ ค.ศ."
                  style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}
                >
                  {era === 'be' ? '🔄 พ.ศ.' : '🔄 ค.ศ.'}
                </button>

                {/* Jump to Today Button */}
                <Button
                  variant="quiet"
                  size="sm"
                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '6px' }}
                  onClick={handleJumpToday}
                  title="กลับไปวันนี้ทันที"
                >
                  วันนี้
                </Button>
              </div>

              {/* Prev / Next Month Navigation */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Button
                  variant="quiet"
                  size="sm"
                  style={{ padding: '2px 8px', height: '28px' }}
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear((y) => y - 1);
                    } else {
                      setCalendarMonth((m) => m - 1);
                    }
                  }}
                  title="เดือนก่อนหน้า"
                >
                  ◀
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  style={{ padding: '2px 8px', height: '28px' }}
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear((y) => y + 1);
                    } else {
                      setCalendarMonth((m) => m + 1);
                    }
                  }}
                  title="เดือนถัดไป"
                >
                  ▶
                </Button>
              </div>
            </div>

            {/* View Mode Tabs: day -> week -> month -> year */}
            <div className="life-cal-view-tabs">
              <button
                type="button"
                className={`button ${calendarView === 'day' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                aria-pressed={calendarView === 'day'}
                onClick={() => setCalendarView('day')}
              >
                🕒 รายวัน
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'week' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                aria-pressed={calendarView === 'week'}
                onClick={() => setCalendarView('week')}
              >
                📆 รายสัปดาห์
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'month' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                aria-pressed={calendarView === 'month'}
                onClick={() => setCalendarView('month')}
              >
                📅 รายเดือน
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'year' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                aria-pressed={calendarView === 'year'}
                onClick={() => setCalendarView('year')}
              >
                🗓️ รายปี
              </button>

              <div style={{ marginLeft: 'auto' }}>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px' }}
                  onClick={() => handleOpenQuickEvent(selectedCalendarDate)}
                >
                  ＋ นัดหมาย
                </Button>
              </div>
            </div>

            {/* VIEW 1: MONTH VIEW */}
            {calendarView === 'month' && (
              <div>
                {/* Weekday headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--pkh-text-muted)' }}>
                  {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((wd) => (
                    <div key={wd} style={{ padding: '4px 0' }}>{wd}</div>
                  ))}
                </div>

                {/* Calendar Days Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                  {calendarDays.map((cell, idx) => {
                    if (!cell.isCurrentMonth) {
                      return <div key={`empty-${idx}`} style={{ minHeight: '44px' }} />;
                    }
                    const isSelected = selectedCalendarDate === cell.dateStr;
                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        onClick={() => setSelectedCalendarDate(cell.dateStr)}
                        aria-label={`เลือกวันที่ ${cell.dateStr}`}
                        aria-pressed={isSelected}
                        style={{
                          minHeight: '48px',
                          padding: '4px 2px',
                          borderRadius: '8px',
                          border: cell.isToday
                            ? '2px solid var(--pkh-primary, #2563eb)'
                            : isSelected
                              ? '2px solid #10b981'
                              : '1px solid var(--pkh-border-subtle, #f1f5f9)',
                          background: isSelected
                            ? 'rgba(16, 185, 129, 0.1)'
                            : cell.isToday
                              ? 'rgba(37, 99, 235, 0.08)'
                              : 'var(--pkh-bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <span style={{
                          fontSize: '11px',
                          fontWeight: cell.isToday || isSelected ? 700 : 500,
                          color: cell.isToday ? 'var(--pkh-primary, #2563eb)' : 'var(--pkh-text-primary)',
                        }}>
                          {cell.day}
                        </span>

                        {/* Events preview chips on day cell */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0 2px', marginTop: '2px' }}>
                          {cell.events.slice(0, 2).map((ev) => (
                            <span
                              key={ev.id}
                              style={{
                                display: 'block',
                                fontSize: '9px',
                                lineHeight: '11px',
                                padding: '1px 3px',
                                borderRadius: '4px',
                                background: ev.badgeBg,
                                color: ev.badgeColor,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textAlign: 'left',
                                fontWeight: 600,
                              }}
                              title={ev.title}
                            >
                              {ev.icon} {ev.title}
                            </span>
                          ))}
                          {cell.events.length > 2 && (
                            <span style={{ fontSize: '9px', color: 'var(--pkh-text-muted)', lineHeight: '10px' }}>
                              +{cell.events.length - 2}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW 2: WEEK VIEW */}
            {calendarView === 'week' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '6px' }}>
                {weekDays.map((wd) => {
                  const isSelected = selectedCalendarDate === wd.dateStr;
                  return (
                    <button
                      key={wd.dateStr}
                      type="button"
                      onClick={() => setSelectedCalendarDate(wd.dateStr)}
                      aria-label={`เลือกวันที่ ${wd.dateStr}`}
                      aria-pressed={isSelected}
                      style={{
                        padding: '8px 6px',
                        borderRadius: '8px',
                        border: wd.isToday ? '2px solid var(--pkh-primary, #2563eb)' : isSelected ? '2px solid #10b981' : '1px solid var(--pkh-border-subtle)',
                        background: isSelected ? 'rgba(16, 185, 129, 0.05)' : wd.isToday ? 'rgba(37, 99, 235, 0.04)' : 'var(--pkh-bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        minHeight: '140px',
                        textAlign: 'left',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ textAlign: 'center', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '4px', width: '100%' }}>
                        <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>{wd.dayLabel}</div>
                        <strong style={{ fontSize: '14px', color: wd.isToday ? 'var(--pkh-primary)' : 'var(--pkh-text-primary)' }}>
                          {wd.dayNum}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, width: '100%' }}>
                        {wd.events.length === 0 ? (
                          <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)', textAlign: 'center', marginTop: '8px' }}>-</span>
                        ) : (
                          wd.events.map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                fontSize: '10px',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                background: ev.badgeBg,
                                color: ev.badgeColor,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={ev.title}
                            >
                              {ev.icon} {ev.title}
                            </div>
                          ))
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* VIEW 3: DAY VIEW */}
            {calendarView === 'day' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--pkh-bg-subtle)', borderRadius: '8px' }}>
                  <strong>📅 {selectedCalendarDate}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                    {selectedDateEvents.length} รายการสำหรับวันนี้
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                  {selectedDateEvents.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--pkh-text-muted)', fontSize: '13px', padding: '16px 0' }}>
                      ไม่มีกิจกรรมหรือการแจ้งเตือนในวันนี้
                    </p>
                  ) : (
                    selectedDateEvents.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: ev.badgeBg,
                          color: ev.badgeColor,
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{ev.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: '13px', display: 'block' }}>{ev.title}</strong>
                          {ev.subtitle && <span style={{ fontSize: '11px', opacity: 0.8 }}>{ev.subtitle}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* VIEW 4: YEAR VIEW */}
            {calendarView === 'year' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}>
                {THAI_MONTHS.map((mName, mIdx) => {
                  const isCurrent = calendarMonth === mIdx;
                  return (
                    <button
                      key={mName}
                      type="button"
                      onClick={() => {
                        setCalendarMonth(mIdx);
                        setCalendarView('month');
                      }}
                      aria-label={`ไปที่เดือน${mName}`}
                      style={{
                        padding: '12px 6px',
                        borderRadius: '8px',
                        border: isCurrent ? '2px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
                        background: isCurrent ? 'rgba(37, 99, 235, 0.08)' : 'var(--pkh-bg-surface)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        font: 'inherit',
                      }}
                    >
                      <strong style={{ fontSize: '13px', color: isCurrent ? 'var(--pkh-primary)' : 'var(--pkh-text-primary)' }}>
                        {mName}
                      </strong>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Date Summary & Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)', fontSize: '11px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', color: 'var(--pkh-text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>🔵 ทั่วไป</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>🎂 วันเกิด</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>💍 ครบรอบ</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>🌟 สำคัญ</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>📋 งาน</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong>เลือก: {selectedCalendarDate}</strong>
                <button
                  type="button"
                  onClick={() => handleOpenQuickEvent(selectedCalendarDate)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--pkh-primary, #3b82f6)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '11px',
                    textDecoration: 'underline',
                  }}
                >
                  + เพิ่มกิจกรรมวันนี้
                </button>
              </div>
            </div>
          </div>

          {/* ── Right column: important dates with countdowns ──────── */}
          <aside className="life-quick-card life-reminders-panel" aria-label="แจ้งเตือนวันสำคัญ">
            <div className="life-reminders-head">
              <div style={{ minWidth: 0 }}>
                <h3 className="life-reminders-title">
                  <span aria-hidden="true">🔔</span> แจ้งเตือนวันสำคัญ
                </h3>
                <span className="life-reminders-sub">
                  {openReminderCount} รายการที่กำลังติดตาม
                  {nextReminder && !nextReminder.done && (
                    <> · ใกล้สุด {nextReminder.label}</>
                  )}
                </span>
              </div>
              <button
                type="button"
                className={`button ${reminderFormOpen ? 'button-quiet' : 'button-primary'}`}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', flexShrink: 0 }}
                aria-expanded={reminderFormOpen}
                onClick={() => setReminderFormOpen((open) => !open)}
              >
                {reminderFormOpen ? '✕ ปิดฟอร์ม' : '＋ เพิ่มวันสำคัญ'}
              </button>
            </div>

            {/* Tier filter */}
            <div className="life-reminder-tiers" role="group" aria-label="กรองตามช่วงเวลา">
              {REMINDER_TIERS.map((tier) => (
                <button
                  key={tier.key}
                  type="button"
                  className={`button ${reminderTier === tier.key ? 'button-primary' : 'button-quiet'}`}
                  style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px', borderRadius: '6px' }}
                  aria-pressed={reminderTier === tier.key}
                  onClick={() => setReminderTier(tier.key)}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            {/* Quick Add Reminder Form (collapsed by default) */}
            {reminderFormOpen && (
              <form onSubmit={onAddReminder} className="life-reminder-form">
                <input
                  required
                  placeholder="ชื่อแจ้งเตือน..."
                  value={reminderDraft.title}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, title: e.target.value })}
                  maxLength={160}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  type="date"
                  required
                  aria-label="วันที่"
                  value={reminderDraft.targetDate}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, targetDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <select
                    aria-label="การทำซ้ำ"
                    value={reminderDraft.recurrence}
                    onChange={(e) => setReminderDraft({ ...reminderDraft, recurrence: e.target.value as NonNullable<Reminder['recurrence']> })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--pkh-radius-md)',
                      border: '1px solid var(--pkh-border-default)',
                      background: 'var(--pkh-bg-surface)',
                      fontSize: '12px',
                      minWidth: 0,
                    }}
                  >
                    <option value="none">ไม่ทำซ้ำ</option>
                    <option value="daily">ทุกวัน</option>
                    <option value="weekly">ทุกสัปดาห์</option>
                    <option value="monthly">ทุกเดือน</option>
                    <option value="yearly">ทุกปี</option>
                  </select>

                  <select
                    aria-label="หมวดหมู่"
                    value={reminderDraft.category}
                    onChange={(e) => setReminderDraft({
                      ...reminderDraft,
                      category: e.target.value as ReminderCategory,
                    })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--pkh-radius-md)',
                      border: '1px solid var(--pkh-border-default)',
                      background: 'var(--pkh-bg-surface)',
                      fontSize: '12px',
                      minWidth: 0,
                    }}
                  >
                    <option value="birthday">วันเกิด</option>
                    <option value="anniversary">วันครบรอบ</option>
                    <option value="health">สุขภาพ</option>
                    <option value="backup">แผนสำรอง</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </div>

                {people.length > 0 && (
                  <select
                    aria-label="เชื่อมโยงบุคคล"
                    value={reminderDraft.linkedPersonId}
                    onChange={(e) => setReminderDraft({ ...reminderDraft, linkedPersonId: e.target.value })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--pkh-radius-md)',
                      border: '1px solid var(--pkh-border-default)',
                      background: 'var(--pkh-bg-surface)',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  >
                    <option value="">-- ไม่ผูกกับบุคคล --</option>
                    {people.map((p) => (
                      <option value={p.id} key={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}

                <Button variant="primary" size="sm" type="submit" disabled={scheduleBusy}>
                  ＋ เพิ่ม
                </Button>

                {(reminderDraft.recurrence === 'monthly' || reminderDraft.recurrence === 'yearly') && (
                  <div className="life-reminder-hint">
                    {reminderDraft.recurrence === 'monthly'
                      ? '📌 ทุกเดือน: แจ้งตรงวันที่กำหนดของทุกเดือน (วันคงที่)'
                      : '📌 ทุกปี: แจ้งตรงวันที่และเดือนที่กำหนดของทุกปี (วันคงที่)'}
                  </div>
                )}
              </form>
            )}

            {/* Reminders List with countdown badges */}
            {reminderRows.length === 0 ? (
              <EmptyState
                icon="🔔"
                title={(REMINDER_TIERS.find((t) => t.key === reminderTier) ?? REMINDER_TIERS[0]).emptyTitle}
                description="บันทึกวันเกิด วันครบรอบ หรือวันหมดอายุสำคัญไว้ที่นี่"
              />
            ) : (
              <div className="life-reminder-list">
                {reminderRows.map(({ reminder, dateStr, tone, label }) => (
                  <div key={reminder.id} className={`rem-card is-${tone}`}>
                    <div className="rem-card-main">
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={reminder.isCompleted === 1}
                        aria-label={`ทำเครื่องหมาย ${reminder.title} ว่าเสร็จแล้ว`}
                        onChange={() => void onToggleReminder(reminder)}
                      />
                      <div className="rem-card-body">
                        <div className="rem-card-title-row">
                          <span className="rem-card-title">{reminder.title}</span>
                          <span className={`rem-countdown is-${tone}`}>{label}</span>
                        </div>
                        <div className="rem-card-meta">
                          {dateStr}
                          {' · '}{reminderCategoryLabel(reminder.category)}
                          {reminder.snoozedUntil ? ` · เลื่อนจาก ${reminder.targetDate}` : ''}
                          {reminder.notifyDaysBefore > 0 ? ` · 🔔 ล่วงหน้า ${reminder.notifyDaysBefore} วัน` : ''}
                          {reminder.linkedPersonName ? ` · 👤 ${reminder.linkedPersonName}` : ''}
                          {reminder.recurrence === 'monthly' ? ' · 🔁 ทุกเดือน' : ''}
                          {reminder.recurrence === 'yearly' ? ' · 🔁 ทุกปี' : ''}
                          {reminder.recurrence === 'weekly' ? ' · 🔁 ทุกสัปดาห์' : ''}
                          {reminder.recurrence === 'daily' ? ' · 🔁 ทุกวัน' : ''}
                        </div>
                      </div>
                    </div>

                    <div className="rem-card-actions">
                      {reminder.isCompleted !== 1 && reminder.recurrence !== 'monthly' && reminder.recurrence !== 'yearly' && (
                        <Button
                          variant="quiet"
                          size="sm"
                          style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                          onClick={() => void onSnoozeReminder(reminder, 3)}
                          title="เลื่อนไปอีก 3 วัน"
                        >
                          +3 วัน
                        </Button>
                      )}
                      <Button
                        variant="danger-quiet"
                        size="sm"
                        style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                        onClick={() => void onRemoveReminder(reminder)}
                      >
                        ลบ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ── TAB 2: Daily timeline ─────────────────────────────────── */}
      {mainTab === 'timeblocks' && (
        <div
          className="life-quick-card life-timeblocks-panel"
          role="tabpanel"
          id="life-panel-timeblocks"
          aria-labelledby="life-tab-timeblocks"
        >
          <div className="life-timeblocks-head">
            <div>
              <h3 className="life-timeblocks-title">
                <span aria-hidden="true">⏱️</span> ตารางชีวิตวันนี้
              </h3>
              <span className="life-timeblocks-sub">
                {doneBlocks}/{timeblocks.length} กิจกรรมเสร็จแล้ว
                {activeBlock ? ` · กำลังทำ: ${activeBlock.title}` : ''}
              </span>
            </div>
            <span className="life-timeblocks-progress" aria-hidden="true">
              {timeblocks.length > 0 ? `${Math.round((doneBlocks / timeblocks.length) * 100)}%` : '0%'}
            </span>
          </div>

          {/* Quick Add Timeblock Form */}
          <form onSubmit={onAddTimeblock} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                required
                placeholder="06:30 - 07:30"
                aria-label="ช่วงเวลา"
                value={blockDraft.timeRange}
                onChange={(e) => setBlockDraft({ ...blockDraft, timeRange: e.target.value })}
                maxLength={40}
                style={{
                  width: '130px',
                  padding: '6px 10px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              />
              <input
                required
                placeholder="ชื่อกิจกรรม / ช่วงเวลาโฟกัส..."
                aria-label="ชื่อกิจกรรม"
                value={blockDraft.title}
                onChange={(e) => setBlockDraft({ ...blockDraft, title: e.target.value })}
                maxLength={200}
                style={{
                  flex: 1,
                  minWidth: '180px',
                  padding: '6px 10px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              />
              <select
                aria-label="หมวดชีวิต"
                value={blockDraft.lifeArea}
                onChange={(e) => setBlockDraft({ ...blockDraft, lifeArea: e.target.value as LifeArea })}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              >
                <option value="health">สุขภาพ</option>
                <option value="focus_work">งานโฟกัส</option>
                <option value="family">ครอบครัว/แฟน</option>
                <option value="growth">พัฒนาตัวเอง</option>
                <option value="other">อื่น ๆ</option>
              </select>
              <Button variant="primary" size="sm" type="submit" disabled={scheduleBusy}>
                ＋ เพิ่มช่วงเวลา
              </Button>
            </div>
          </form>

          {/* Timeblocks List */}
          {timeblocks.length === 0 ? (
            <EmptyState
              icon="⏱️"
              title="ยังไม่มีตารางเวลาวันนี้"
              description="แบ่งช่วงเวลาของวันเพื่อจัดสรรพลังงานให้งานสำคัญ"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {timeblocks.map((block) => {
                const status = checkTimeRangeStatus(block.timeRange, currentMinutes);
                const isCurrent = status === 'current';
                const isPast = status === 'past';

                return (
                  <div
                    key={block.id}
                    className={`task-row-card ${block.isDone ? 'is-done' : ''}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: isCurrent
                        ? '2px solid #10b981'
                        : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                      background: isCurrent
                        ? 'rgba(16, 185, 129, 0.08)'
                        : block.isDone
                        ? 'var(--pkh-bg-subtle, #f8fafc)'
                        : 'var(--pkh-bg-surface)',
                      boxShadow: isCurrent ? '0 0 10px rgba(16, 185, 129, 0.2)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          className="task-checkbox"
                          checked={block.isDone === 1}
                          aria-label={`ทำเครื่องหมาย ${block.title} ว่าเสร็จแล้ว`}
                          onChange={() => void onToggleTimeblock(block)}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                              {block.timeRange} · {block.title}
                            </strong>
                            {isCurrent && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: '#065f46',
                                background: '#a7f3d0',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}>
                                🟢 กำลังดำเนินการตอนนี้
                              </span>
                            )}
                            {isPast && !block.isDone && (
                              <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)' }}>
                                ⏳ ผ่านช่วงเวลานี้แล้ว
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
                            {lifeAreaLabel(block.lifeArea)}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="danger-quiet"
                        size="sm"
                        style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                        onClick={() => void onRemoveTimeblock(block)}
                      >
                        ลบ
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Event / Reminder Creation Modal */}
      {quickEventModalOpen && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickEventModalOpen(false);
          }}
        >
          <section
            className="dialog"
            style={{ maxWidth: '480px', width: '100%' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-event-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📅</span>
                <h2 id="quick-event-modal-title" style={{ margin: 0, fontSize: '18px' }}>
                  เพิ่มกิจกรรม / การแจ้งเตือน
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิด"
                onClick={() => setQuickEventModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleQuickEventSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  หัวข้อกิจกรรม / การแจ้งเตือน *
                </label>
                <input
                  required
                  type="text"
                  placeholder="เช่น ประชุมทีม, วันเกิดคุณแม่, ชำระค่าบริการ..."
                  value={quickEventTitle}
                  onChange={(e) => setQuickEventTitle(e.target.value)}
                  maxLength={140}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    หมวดหมู่ (Category)
                  </label>
                  <select
                    value={quickEventCategory}
                    onChange={(e) => setQuickEventCategory(e.target.value as ReminderCategory)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="other">🔵 กิจกรรมทั่วไป</option>
                    <option value="birthday">🎂 วันเกิด</option>
                    <option value="anniversary">💍 วันครบรอบ</option>
                    <option value="health">🏥 สุขภาพ/แพทย์</option>
                    <option value="backup">💾 สำรองข้อมูล</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    การทำซ้ำ (Recurrence)
                  </label>
                  <select
                    value={quickEventRecurrence}
                    onChange={(e) => setQuickEventRecurrence(e.target.value as NonNullable<Reminder['recurrence']>)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="none">ไม่ทำซ้ำ (ครั้งเดียว)</option>
                    <option value="daily">ทุกวัน (Daily)</option>
                    <option value="weekly">ทุกสัปดาห์ (Weekly)</option>
                    <option value="monthly">ทุกเดือน (Monthly)</option>
                    <option value="yearly">ทุกปี (Yearly)</option>
                  </select>
                </div>
              </div>

              {(quickEventRecurrence === 'monthly' || quickEventRecurrence === 'yearly') && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--pkh-radius-md)',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: 'var(--pkh-text-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  {quickEventRecurrence === 'monthly'
                    ? '📌 แจ้งเตือนประจำทุกเดือน: ระบบจะแจ้งเตือนตรงวันที่กำหนดของทุกเดือนอย่างแม่นยำ (วันคงที่ • ไม่มีการเลื่อนวัน)'
                    : '📌 แจ้งเตือนประจำทุกปี: ระบบจะแจ้งเตือนตรงวันที่และเดือนที่กำหนดของทุกปีอย่างแม่นยำ (วันคงที่ • ไม่มีการเลื่อนวัน)'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    วันที่ (Target Date)
                  </label>
                  <input
                    required
                    type="date"
                    value={quickEventDate}
                    onChange={(e) => setQuickEventDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    แจ้งเตือนล่วงหน้า (วัน)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={quickEventDaysBefore}
                    onChange={(e) => setQuickEventDaysBefore(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {people.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    เชื่อมโยงบุคคลสำคัญ (ถ้ามี)
                  </label>
                  <select
                    value={quickEventPersonId}
                    onChange={(e) => setQuickEventPersonId(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="">-- ไม่เชื่อมโยงบุคคล --</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>👤 {p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={() => setQuickEventModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                >
                  💾 บันทึกกิจกรรม
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
};
