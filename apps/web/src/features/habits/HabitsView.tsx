import React, { type FormEvent } from 'react';
import type {
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

export interface ReminderDraft {
  title: string;
  targetDate: string;
  category: ReminderCategory;
  recurrence: NonNullable<Reminder['recurrence']>;
  linkedPersonId: string;
  notifyDaysBefore: string;
}

export interface TimeblockDraft {
  timeRange: string;
  title: string;
  lifeArea: LifeArea;
}

export interface HabitDraft {
  title: string;
  dailyTarget: string;
  unit: string;
}

export interface HabitsViewProps {
  scheduleDate: string;
  scheduleBusy: boolean;
  scheduleError: string;
  scheduleNotice: string;
  reminders: Reminder[];
  reminderDraft: ReminderDraft;
  setReminderDraft: React.Dispatch<React.SetStateAction<ReminderDraft>>;
  people: Person[];
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

export const HabitsView: React.FC<HabitsViewProps> = ({
  scheduleDate,
  scheduleBusy,
  scheduleError,
  scheduleNotice,
  reminders,
  reminderDraft,
  setReminderDraft,
  people,
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
  onCorrectHabitDay,
  onRemoveHabit,
  onSwitchView,
}) => {
  return (
    <section className="life-view-container" aria-label="ปฏิทินและตารางชีวิต">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">📅</div>
        <div className="banner-info">
          <span className="eyebrow">Life OS &amp; Calendar</span>
          <h2 className="banner-title">ปฏิทิน ตารางชีวิต และกิจวัตร</h2>
          <p className="banner-subtitle">
            {scheduleDate} · ติดตามกิจวัตรประจำวัน ตารางเวลาทำงาน และการแจ้งเตือนวันสำคัญ
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="quiet" onClick={() => onSwitchView('notes')}>
            📝 ไปที่โน้ต
          </Button>
        </div>
      </div>

      {scheduleError && <p className="form-error editor-error" role="alert">{scheduleError}</p>}
      {scheduleNotice && <p className="form-notice" role="status">{scheduleNotice}</p>}

      {/* Bento Grid Sections: 1. Habits (7-Day Matrix) 2. Timeblocks 3. Reminders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Section 1: Habits & Daily Routines */}
        <div className="life-quick-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                ⚡ กิจวัตรประจำวัน (Habits)
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                {habits.length} กิจวัตร · แตะปุ่ม +1 เพื่อเช็คอินความสม่ำเสมอในแต่ละวัน
              </span>
            </div>
          </div>

          {/* Quick Add Habit Form */}
          <form onSubmit={onAddHabit} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <input
              required
              placeholder="ชื่อกิจวัตรใหม่..."
              value={habitDraft.title}
              onChange={(e) => setHabitDraft({ ...habitDraft, title: e.target.value })}
              maxLength={120}
              style={{
                flex: 2,
                minWidth: '180px',
                padding: '6px 12px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
                fontSize: '13px',
              }}
            />
            <input
              type="number"
              min={1}
              max={1000}
              value={habitDraft.dailyTarget}
              onChange={(e) => setHabitDraft({ ...habitDraft, dailyTarget: e.target.value })}
              placeholder="เป้าหมาย"
              style={{
                width: '80px',
                padding: '6px 8px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
                fontSize: '13px',
              }}
            />
            <input
              value={habitDraft.unit}
              onChange={(e) => setHabitDraft({ ...habitDraft, unit: e.target.value })}
              placeholder="หน่วย (ครั้ง/แก้ว)"
              maxLength={20}
              style={{
                width: '110px',
                padding: '6px 8px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
                fontSize: '13px',
              }}
            />
            <Button variant="primary" size="sm" type="submit" disabled={scheduleBusy}>
              ＋ เพิ่มกิจวัตร
            </Button>
          </form>

          {/* Habit Cards */}
          {habits.length === 0 ? (
            <EmptyState
              icon="⚡"
              title="ยังไม่มีกิจวัตรประจำวัน"
              description="สร้างนิสัยแรกที่คุณต้องการฝึกฝนให้เกิดความต่อเนื่องในชีวิต"
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px', marginTop: '10px' }}>
              {habits.map((habit) => {
                const week = habitWeek?.habits.find((entry) => entry.habitId === habit.id);
                const progressPct = Math.min(100, Math.round((habit.currentCount / habit.dailyTarget) * 100));

                return (
                  <div key={habit.id} className="habit-matrix-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary)' }}>{habit.title}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
                          {habit.currentCount}/{habit.dailyTarget} {habit.unit} · ต่อเนื่อง 🔥 {habit.streakDays} วัน
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          style={{ padding: '2px 10px', height: '28px', fontSize: '12px' }}
                          onClick={() => void onCheckHabitToday(habit)}
                        >
                          +1
                        </Button>
                        <Button
                          variant="danger-quiet"
                          size="sm"
                          style={{ padding: '2px 6px', height: '28px', fontSize: '11px' }}
                          onClick={() => void onRemoveHabit(habit)}
                        >
                          ลบ
                        </Button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="life-progress-bar-wrap">
                      <div className="life-progress-bar-fill" style={{ width: `${progressPct}%` }} />
                    </div>

                    {/* 7-Day History Matrix */}
                    {week && (
                      <div className="habit-days-row" aria-label={`ประวัติ 7 วันของ ${habit.title}`}>
                        {week.days.map((day) => (
                          <div key={day.date} className="habit-day-col">
                            <span className="habit-day-label">{day.date.slice(8)}</span>
                            <button
                              type="button"
                              className={`habit-day-btn ${day.metTarget ? 'is-completed' : ''}`}
                              disabled={scheduleBusy || day.count === null}
                              title={`${day.date}: ${day.count ?? 0} ${habit.unit}`}
                              onClick={() => void onCorrectHabitDay(habit, day.date, day.count)}
                            >
                              {day.metTarget ? '✓' : day.count !== null && day.count > 0 ? String(day.count) : '·'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2 & 3: Timeblocks and Reminders in 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          {/* Timeblocks */}
          <div className="life-quick-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                  ⏱️ ตารางชีวิตวันนี้
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  {timeblocks.filter((b) => b.isDone === 1).length}/{timeblocks.length} กิจกรรมเสร็จแล้ว
                </span>
              </div>
            </div>

            {/* Quick Add Timeblock Form */}
            <form onSubmit={onAddTimeblock} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {timeblocks.map((block) => (
                  <div
                    key={block.id}
                    className={`task-row-card ${block.isDone ? 'is-done' : ''}`}
                    style={{ padding: '8px 12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={block.isDone === 1}
                        onChange={() => void onToggleTimeblock(block)}
                      />
                      <div>
                        <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                          {block.timeRange} · {block.title}
                        </strong>
                        <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
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
                ))}
              </div>
            )}
          </div>

          {/* Reminders */}
          <div className="life-quick-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                  🔔 แจ้งเตือนวันสำคัญ
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  {reminders.filter((r) => r.isCompleted === 0).length} รายการที่กำลังติดตาม
                </span>
              </div>
            </div>

            {/* Quick Add Reminder Form */}
            <form onSubmit={onAddReminder} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  required
                  placeholder="ชื่อแจ้งเตือน..."
                  value={reminderDraft.title}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, title: e.target.value })}
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
                <input
                  type="date"
                  required
                  value={reminderDraft.targetDate}
                  onChange={(e) => setReminderDraft({ ...reminderDraft, targetDate: e.target.value })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                    fontSize: '12px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'space-between' }}>
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
            </form>

            {/* Reminders List */}
            {reminders.length === 0 ? (
              <EmptyState
                icon="🔔"
                title="ยังไม่มีการแจ้งเตือน"
                description="บันทึกวันเกิด วันครบรอบ หรือวันหมดอายุสำคัญไว้ที่นี่"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {reminders.map((reminder) => (
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
                        <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                          {reminder.title}
                        </strong>
                        <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                          {reminder.snoozedUntil
                            ? `เลื่อนไป ${reminder.snoozedUntil} (เดิม ${reminder.targetDate})`
                            : reminder.targetDate}
                          {' · '}{reminderCategoryLabel(reminder.category)}
                          {reminder.linkedPersonName ? ` · 👤 ${reminder.linkedPersonName}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {reminder.isCompleted !== 1 && (
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
    </section>
  );
};
