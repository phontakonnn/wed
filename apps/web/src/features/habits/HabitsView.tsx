import React, { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import type {
  Task,
  Reminder,
  ReminderCategory,
  Person,
  Timeblock,
  LifeArea,
  Habit,
  HabitsHistory,
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

interface HabitDraft {
  title: string;
  dailyTarget: string;
  unit: string;
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
  habits: Habit[];
  habitWeek: HabitsHistory | null;
  habitDraft: HabitDraft;
  setHabitDraft: React.Dispatch<React.SetStateAction<HabitDraft>>;
  onAddHabit: (e: FormEvent) => void;
  onCheckHabitToday: (habit: Habit) => Promise<void>;
  onCorrectHabitDay: (habit: Habit, date: string, currentCount: number | null) => Promise<void>;
  onRemoveHabit: (habit: Habit) => Promise<void>;
  onSwitchView: (view: NotesView) => void;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

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
  habits,
  habitWeek,
  habitDraft,
  setHabitDraft,
  onAddHabit,
  onCheckHabitToday,
  onRemoveHabit,
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

  // 3-tier Reminders navigation: 'today' | 'month' | 'yearly'
  const [reminderTier, setReminderTier] = useState<'today' | 'month' | 'yearly'>('today');

  // Filter reminders based on selected tier
  const filteredReminders = useMemo(() => {
    const todayStr = scheduleDate;
    const currentMonthPrefix = todayStr.slice(0, 7);

    if (reminderTier === 'today') {
      return reminders.filter((r) => {
        const effective = r.snoozedUntil || r.targetDate;
        return effective === todayStr || effective <= todayStr;
      });
    }
    if (reminderTier === 'month') {
      return reminders.filter((r) => {
        const effective = r.snoozedUntil || r.targetDate;
        return effective.startsWith(currentMonthPrefix) || (effective < todayStr && r.isCompleted === 0);
      });
    }
    return reminders;
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
      const dateStr = d.toISOString().slice(0, 10);
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

  return (
    <section className="life-view-container" aria-label="ปฏิทินและตารางชีวิต">
      {/* Header Banner */}
      <div className="module-header-banner" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)', border: '1px solid var(--pkh-border-subtle)' }}>
        <div className="banner-icon">📅</div>
        <div className="banner-info" style={{ flex: 1 }}>
          <span className="eyebrow">Smart Calendar &amp; Live Time Engine</span>
          <h2 className="banner-title">ปฏิทินอัจฉริยะและตารางชีวิต</h2>
          <p className="banner-subtitle">
            ติดตามกิจกรรม วันสำคัญ นัดหมาย วงจรการทำซ้ำ และกิจวัตรประจำวัน
          </p>
        </div>

        {/* Real-time Bangkok Clock Widget */}
        <div style={{
          background: 'var(--pkh-bg-surface, #ffffff)',
          border: '1px solid var(--pkh-border-default, #e2e8f0)',
          borderRadius: '12px',
          padding: '10px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          textAlign: 'right',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pkh-text-muted)' }}>
              🇹🇭 BANGKOK TIME (UTC+7)
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--pkh-primary, #2563eb)', letterSpacing: '0.5px' }}>
            {bangkokTimeString}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)', marginTop: '2px' }}>
            {bangkokDateString}
          </div>
        </div>

        <div className="banner-actions">
          <Button variant="quiet" onClick={() => onSwitchView('notes')}>
            📝 ไปที่โน้ต
          </Button>
        </div>
      </div>

      {scheduleError && <p className="form-error editor-error" role="alert">{scheduleError}</p>}
      {scheduleNotice && <p className="form-notice" role="status">{scheduleNotice}</p>}

      {/* Main Grid: Calendar & Habits (Top) + Timeblocks & Reminders (Bottom) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Top Section: Smart Interactive Calendar & Habit Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          
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

            {/* View Modes Tabs Bar */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '8px' }}>
              <button
                type="button"
                className={`button ${calendarView === 'month' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                onClick={() => setCalendarView('month')}
              >
                📅 รายเดือน
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'week' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                onClick={() => setCalendarView('week')}
              >
                📆 รายสัปดาห์
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'day' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
                onClick={() => setCalendarView('day')}
              >
                🕒 รายวัน
              </button>
              <button
                type="button"
                className={`button ${calendarView === 'year' ? 'button-primary' : 'button-quiet'}`}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
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
                    <div
                      key={wd.dateStr}
                      onClick={() => setSelectedCalendarDate(wd.dateStr)}
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
                      }}
                    >
                      <div style={{ textAlign: 'center', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '4px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>{wd.dayLabel}</div>
                        <strong style={{ fontSize: '14px', color: wd.isToday ? 'var(--pkh-primary)' : 'var(--pkh-text-primary)' }}>
                          {wd.dayNum}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
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
                    </div>
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
                      style={{
                        padding: '12px 6px',
                        borderRadius: '8px',
                        border: isCurrent ? '2px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
                        background: isCurrent ? 'rgba(37, 99, 235, 0.08)' : 'var(--pkh-bg-surface)',
                        cursor: 'pointer',
                        textAlign: 'center',
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

          {/* Section 1: Habits & Daily Routines */}
          <div className="life-quick-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                  🎯 กิจวัตรประจำวัน (Habits)
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  บันทึกกิจวัตรต่อเนื่อง เพื่อสร้างวินัยและนิสัยที่ดี
                </span>
              </div>
            </div>

            {/* Quick Add Habit Form */}
            <form onSubmit={onAddHabit} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                required
                placeholder="ชื่อกิจวัตรใหม่ เช่น ดื่มน้ำ 2 ลิตร..."
                value={habitDraft.title}
                onChange={(e) => setHabitDraft({ ...habitDraft, title: e.target.value })}
                maxLength={120}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              />
              <input
                type="number"
                min="1"
                max="999"
                placeholder="เป้าหมาย"
                value={habitDraft.dailyTarget}
                onChange={(e) => setHabitDraft({ ...habitDraft, dailyTarget: e.target.value })}
                style={{
                  width: '70px',
                  padding: '6px 8px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              />
              <input
                placeholder="หน่วย (ครั้ง)"
                value={habitDraft.unit}
                onChange={(e) => setHabitDraft({ ...habitDraft, unit: e.target.value })}
                maxLength={20}
                style={{
                  width: '80px',
                  padding: '6px 8px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  fontSize: '12px',
                }}
              />
              <Button variant="primary" size="sm" type="submit" disabled={scheduleBusy}>
                ＋ เพิ่มกิจวัตร
              </Button>
            </form>

            {/* Habits Matrix List */}
            {habits.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="ยังไม่มีกิจวัตร"
                description="สร้างกิจวัตรเพื่อติดตามความสม่ำเสมอในแต่ละวัน"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {habits.map((habit) => {
                  const habitRow = habitWeek?.habits.find((h) => h.habitId === habit.id);
                  const isCheckedToday = (habit.currentCount ?? 0) >= (habit.dailyTarget ?? 1);

                  return (
                    <div
                      key={habit.id}
                      className="task-row-card habit-matrix-card"
                      style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="button is-small"
                          onClick={() => void onCheckHabitToday(habit)}
                          style={{
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isCheckedToday ? '#10b981' : 'var(--pkh-bg-subtle)',
                            color: isCheckedToday ? '#fff' : 'inherit',
                            border: isCheckedToday ? 'none' : '1px solid var(--pkh-border-default)',
                          }}
                          title={isCheckedToday ? 'เสร็จแล้วสำหรับวันนี้' : 'กดเพื่อเช็กชื่อวันนี้'}
                        >
                          {isCheckedToday ? '✓' : '+1'}
                        </button>
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                            {habit.title}
                          </strong>
                          <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                            {habit.currentCount ?? 0}/{habit.dailyTarget ?? 1} {habit.unit} · 🔥 ต่อเนื่อง {habit.streakDays ?? 0} วัน
                          </div>
                        </div>
                      </div>

                      {/* 7-day mini matrix dots */}
                      {habitRow && (
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {habitRow.days.slice(-7).map((d) => (
                            <span
                              key={d.date}
                              title={`${d.date}: ${d.count ?? 0} ครั้ง`}
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '2px',
                                background: d.metTarget ? '#10b981' : d.count ? '#f59e0b' : 'var(--pkh-border-subtle, #e2e8f0)',
                              }}
                            />
                          ))}
                        </div>
                      )}

                      <Button
                        variant="danger-quiet"
                        size="sm"
                        style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                        onClick={() => void onRemoveHabit(habit)}
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Timeblocks & Reminders in 2 Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          
          {/* Column 1: Timeblocks with Real-Time Active Highlighting */}
          <div className="life-quick-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                  ⏱️ ตารางชีวิตวันนี้ (Timeblocks)
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  {timeblocks.filter((b) => b.isDone === 1).length}/{timeblocks.length} กิจกรรมเสร็จแล้ว
                </span>
              </div>
            </div>

            {/* Quick Add Timeblock Form */}
            <form onSubmit={onAddTimeblock} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  required
                  placeholder="06:30 - 07:30"
                  value={blockDraft.timeRange}
                  onChange={(e) => setBlockDraft({ ...blockDraft, timeRange: e.target.value })}
                  maxLength={40}
                  style={{
                    width: '120px',
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
                  value={blockDraft.title}
                  onChange={(e) => setBlockDraft({ ...blockDraft, title: e.target.value })}
                  maxLength={200}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <select
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
                            onChange={() => void onToggleTimeblock(block)}
                          />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

          {/* Column 2: Reminders with 3-tier Tabs */}
          <div className="life-quick-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                  🔔 แจ้งเตือนวันสำคัญ (Reminders)
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  {reminders.filter((r) => r.isCompleted === 0).length} รายการที่กำลังติดตาม
                </span>
              </div>
            </div>

            {/* 3-Tier Navigation Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--pkh-bg-subtle, #f1f5f9)', padding: '3px', borderRadius: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className={`button ${reminderTier === 'today' ? 'button-primary' : 'button-quiet'}`}
                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px', borderRadius: '6px' }}
                onClick={() => setReminderTier('today')}
              >
                วันนี้
              </button>
              <button
                type="button"
                className={`button ${reminderTier === 'month' ? 'button-primary' : 'button-quiet'}`}
                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px', borderRadius: '6px' }}
                onClick={() => setReminderTier('month')}
              >
                เดือนนี้
              </button>
              <button
                type="button"
                className={`button ${reminderTier === 'yearly' ? 'button-primary' : 'button-quiet'}`}
                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', height: '28px', borderRadius: '6px' }}
                onClick={() => setReminderTier('yearly')}
              >
                ประจำปี / ทั้งหมด
              </button>
            </div>

            {/* Quick Add Reminder Form */}
            <form onSubmit={onAddReminder} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  required
                  placeholder="ชื่อแจ้งเตือน..."
                  value={reminderDraft.title}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, title: e.target.value })}
                  maxLength={160}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                />
                <input
                  type="date"
                  required
                  value={reminderDraft.targetDate}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, targetDate: e.target.value })}
                  style={{
                    width: '130px',
                    padding: '6px 8px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                <select
                  value={reminderDraft.recurrence}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, recurrence: e.target.value as NonNullable<Reminder['recurrence']> })}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                >
                  <option value="none">ไม่ทำซ้ำ</option>
                  <option value="daily">ทุกวัน</option>
                  <option value="weekly">ทุกสัปดาห์</option>
                  <option value="monthly">ทุกเดือน</option>
                  <option value="yearly">ทุกปี</option>
                </select>

                <select
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
                  }}
                >
                  <option value="birthday">วันเกิด</option>
                  <option value="anniversary">วันครบรอบ</option>
                  <option value="health">สุขภาพ</option>
                  <option value="backup">แผนสำรอง</option>
                  <option value="other">อื่น ๆ</option>
                </select>

                <select
                  value={reminderDraft.linkedPersonId}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, linkedPersonId: e.target.value })}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                >
                  <option value="">-- ไม่ผูกกับบุคคล --</option>
                  {people.map((p) => (
                    <option value={p.id} key={p.id}>{p.name}</option>
                  ))}
                </select>

                <Button variant="primary" size="sm" type="submit" disabled={scheduleBusy}>
                  ＋ เพิ่ม
                </Button>
              </div>

              {(reminderDraft.recurrence === 'monthly' || reminderDraft.recurrence === 'yearly') && (
                <div style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--pkh-radius-md)',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: 'var(--pkh-text-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '6px',
                }}>
                  {reminderDraft.recurrence === 'monthly'
                    ? '📌 แจ้งเตือนประจำทุกเดือน: ระบบจะแจ้งเตือนตรงวันที่กำหนดของทุกเดือนอย่างแม่นยำ (วันคงที่ • ไม่มีการเลื่อนวัน)'
                    : '📌 แจ้งเตือนประจำทุกปี: ระบบจะแจ้งเตือนตรงวันที่และเดือนที่กำหนดของทุกปีอย่างแม่นยำ (วันคงที่ • ไม่มีการเลื่อนวัน)'}
                </div>
              )}
            </form>

            {/* Reminders List */}
            {filteredReminders.length === 0 ? (
              <EmptyState
                icon="🔔"
                title={reminderTier === 'today' ? 'ไม่มีแจ้งเตือนสำหรับวันนี้' : reminderTier === 'month' ? 'ไม่มีแจ้งเตือนในเดือนนี้' : 'ยังไม่มีการแจ้งเตือน'}
                description="บันทึกวันเกิด วันครบรอบ หรือวันหมดอายุสำคัญไว้ที่นี่"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`task-row-card ${reminder.isCompleted ? 'is-done' : ''}`}
                    style={{ padding: '8px 12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={reminder.isCompleted === 1}
                        onChange={() => void onToggleReminder(reminder)}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                            {reminder.title}
                          </strong>
                          {reminder.recurrence === 'monthly' && (
                            <span style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: 'var(--pkh-accent-primary, #0284c7)',
                              fontWeight: 600,
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                            }}>
                              🔒 ประจำทุกเดือน (วันคงที่ • ไม่มีการเลื่อนวัน)
                            </span>
                          )}
                          {reminder.recurrence === 'yearly' && (
                            <span style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(168, 85, 247, 0.15)',
                              color: '#a855f7',
                              fontWeight: 600,
                              border: '1px solid rgba(168, 85, 247, 0.3)',
                            }}>
                              🔒 ประจำทุกปี (วันคงที่ • ไม่มีการเลื่อนวัน)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
                          {reminder.snoozedUntil
                            ? `เลื่อนไป ${reminder.snoozedUntil} (เดิม ${reminder.targetDate})`
                            : reminder.targetDate}
                          {' · '}{reminderCategoryLabel(reminder.category)}
                          {reminder.recurrence && reminder.recurrence !== 'none' && reminder.recurrence !== 'monthly' && reminder.recurrence !== 'yearly' ? ` · 🔁 ${reminder.recurrence}` : ''}
                          {reminder.linkedPersonName ? ` · 👤 ${reminder.linkedPersonName}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
          </div>
        </div>
      </div>

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
