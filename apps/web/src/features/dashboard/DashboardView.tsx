import React, { useState } from 'react';
import type { DashboardData, Habit, Task } from '../../api';
import type { NotesView } from '../../types';
import {
  localToday,
  formatDate,
  daysUntilIso,
  taskPriorityLabel,
  taskStatusLabel,
  reminderCategoryLabel,
  lifeAreaLabel,
} from '../../lib/formatters';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface DashboardViewProps {
  dashboard: DashboardData | null;
  dashboardBusy: boolean;
  dashboardError: string;
  onRefreshDashboard: () => void;
  onSwitchView: (view: NotesView) => void;
  onOpenNoteById: (id: string) => void;
  onNavigateCommand: (kind: 'note' | 'task' | 'project' | 'goal' | 'person' | 'reminder' | 'bookmark' | 'file' | 'vault' | 'library', id: string) => void;
  onCheckHabitToday?: (habit: Habit) => Promise<void>;
  onToggleTask?: (task: Task) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dashboard,
  dashboardBusy,
  dashboardError,
  onRefreshDashboard,
  onSwitchView,
  onOpenNoteById,
  onNavigateCommand,
  onCheckHabitToday,
  onToggleTask,
}) => {
  const [hideEmptyCards, setHideEmptyCards] = useState(false);
  const [checkingHabitId, setCheckingHabitId] = useState<string | null>(null);

  const handleHabitCheck = async (habit: Habit) => {
    if (!onCheckHabitToday) return;
    try {
      setCheckingHabitId(habit.id);
      await onCheckHabitToday(habit);
    } finally {
      setCheckingHabitId(null);
    }
  };

  // 1. Loading Skeleton State
  if (dashboardBusy && !dashboard) {
    return (
      <section className="editor-panel dashboard-bento-panel" aria-label="ภาพรวมวันนี้กำลังโหลด">
        <div className="bento-header-banner">
          <div>
            <Skeleton width="180px" height="16px" borderRadius="4px" />
            <Skeleton width="260px" height="32px" borderRadius="6px" style={{ marginTop: '8px' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width="90px" height="36px" borderRadius="8px" />
            <Skeleton width="120px" height="36px" borderRadius="8px" />
          </div>
        </div>

        {/* KPI Skeleton Grid */}
        <div className="bento-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} variant="flat" className="bento-kpi-card">
              <CardContent style={{ padding: '16px' }}>
                <Skeleton width="40px" height="40px" borderRadius="10px" />
                <Skeleton width="60px" height="28px" borderRadius="4px" style={{ marginTop: '12px' }} />
                <Skeleton width="80px" height="16px" borderRadius="4px" style={{ marginTop: '4px' }} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bento Content Skeleton */}
        <div className="bento-main-grid" style={{ marginTop: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} variant="flat" style={{ minHeight: '220px' }}>
              <CardHeader>
                <Skeleton width="140px" height="20px" borderRadius="4px" />
              </CardHeader>
              <CardContent>
                <Skeleton width="100%" height="40px" borderRadius="8px" style={{ marginBottom: '10px' }} />
                <Skeleton width="100%" height="40px" borderRadius="8px" style={{ marginBottom: '10px' }} />
                <Skeleton width="70%" height="40px" borderRadius="8px" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  // 2. Error State
  if (dashboardError) {
    return (
      <section className="editor-panel dashboard-bento-panel" aria-label="เกิดข้อผิดพลาดในการโหลด">
        <EmptyState
          icon="⚠️"
          title="ไม่สามารถโหลดภาพรวมวันนี้ได้"
          description={dashboardError}
          action={
            <Button
              variant="primary"
              onClick={onRefreshDashboard}
              isLoading={dashboardBusy}
            >
              🔄 ลองใหม่อีกครั้ง
            </Button>
          }
        />
      </section>
    );
  }

  // 3. Render Dashboard with Bento Grid Layout
  const tasksDueToday = dashboard?.tasks?.dueToday ?? [];
  const tasksOverdue = dashboard?.tasks?.overdue ?? [];
  const habitsList = dashboard?.habits ?? [];
  const timeblocksDone = dashboard?.timeblocks?.done ?? 0;
  const timeblocksTotal = dashboard?.timeblocks?.total ?? 0;
  const timeblocksBlocks = dashboard?.timeblocks?.blocks ?? [];
  const projectsList = dashboard?.projects ?? [];
  const goalsList = dashboard?.goals ?? [];
  const remindersList = dashboard?.reminders ?? [];
  const notesList = dashboard?.notes ?? [];
  const vaultExpiring = dashboard?.vault?.expiring ?? [];
  const libraryActive = dashboard?.library?.active ?? [];
  const totalsNotes = dashboard?.totals?.notes ?? 0;
  const totalsTasks = dashboard?.totals?.tasks ?? 0;
  const totalsVault = dashboard?.totals?.vault ?? 0;
  const totalsLibrary = dashboard?.totals?.library ?? 0;
  const inboxNewCount = dashboard?.inbox?.newCount ?? 0;

  return (
    <section className="editor-panel dashboard-bento-panel" aria-label="ภาพรวมวันนี้">
      {/* Modern Bento Header Banner */}
      <div className="bento-header-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="banner-icon">🏠</div>
          <div className="bento-header-info">
            <div className="bento-tag">
              <span className="live-dot" aria-hidden="true" />
              <span>DAILY LIFE OS</span>
            </div>
            <h1 className="bento-title">ภาพรวมวันนี้</h1>
            <p className="bento-subtitle">
              {dashboard ? dashboard.today : localToday()}
              {dashboardBusy ? ' · กำลังซิงค์ข้อมูล…' : ' · ซิงค์ข้อมูลล่าสุดแล้ว'}
            </p>
          </div>
        </div>

        <div className="bento-header-actions">
          <label className="bento-toggle-label" title="ซ่อนการ์ดที่ยังไม่มีรายการ">
            <input
              type="checkbox"
              checked={hideEmptyCards}
              onChange={(e) => setHideEmptyCards(e.target.checked)}
            />
            <span>ซ่อนการ์ดที่ว่าง</span>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefreshDashboard}
            isLoading={dashboardBusy}
          >
            🔄 รีเฟรช
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSwitchView('inbox')}
          >
            ＋ จดด่วน
          </Button>
        </div>
      </div>

      {dashboard && (
        <div className="bento-container">
          {/* 1. KPI Metric Bento Cards */}
          <div className="bento-kpi-grid">
            <Card
              variant="interactive"
              className="bento-kpi-card is-notes"
              onClick={() => onSwitchView('notes')}
            >
              <CardContent className="kpi-content">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                  📝
                </div>
                <div className="kpi-text">
                  <span className="kpi-value">{totalsNotes}</span>
                  <span className="kpi-label">โน้ตทั้งหมด</span>
                </div>
              </CardContent>
            </Card>

            <Card
              variant="interactive"
              className="bento-kpi-card is-tasks"
              onClick={() => onSwitchView('tasks')}
            >
              <CardContent className="kpi-content">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  ✅
                </div>
                <div className="kpi-text">
                  <span className="kpi-value">{totalsTasks}</span>
                  <span className="kpi-label">งานค้างอยู่</span>
                </div>
              </CardContent>
            </Card>

            <Card
              variant="interactive"
              className="bento-kpi-card is-vault"
              onClick={() => onSwitchView('vault')}
            >
              <CardContent className="kpi-content">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                  🔐
                </div>
                <div className="kpi-text">
                  <span className="kpi-value">{totalsVault}</span>
                  <span className="kpi-label">คลังสำคัญ</span>
                </div>
              </CardContent>
            </Card>

            <Card
              variant="interactive"
              className="bento-kpi-card is-library"
              onClick={() => onSwitchView('library')}
            >
              <CardContent className="kpi-content">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                  📚
                </div>
                <div className="kpi-text">
                  <span className="kpi-value">{totalsLibrary}</span>
                  <span className="kpi-label">ห้องสมุด & SOP</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 2. Bento Main Grid (Bento Box style) */}
          <div className="bento-main-grid">
            {/* Bento Card: Tasks & Due Today */}
            {(!hideEmptyCards || tasksDueToday.length > 0 || tasksOverdue.length > 0) && (
              <Card variant="bordered" className="bento-card bento-card-tasks">
                <CardHeader className="bento-card-header">
                  <div className="bento-card-title-group">
                    <span className="bento-card-icon">⚡</span>
                    <CardTitle>งานของวันนี้ & เกินกำหนด</CardTitle>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('tasks')}>
                    ดูทั้งหมด →
                  </Button>
                </CardHeader>
                <CardContent>
                  {tasksDueToday.length === 0 && tasksOverdue.length === 0 ? (
                    <EmptyState
                      icon="🎉"
                      title="ไม่มีงานค้างวันนี้"
                      description="คุณจัดการงานของวันนี้เรียบร้อยแล้ว หรือยังไม่ได้เพิ่มกำหนดส่ง"
                      action={
                        <Button variant="secondary" size="sm" onClick={() => onSwitchView('tasks')}>
                          ＋ เพิ่มงานใหม่
                        </Button>
                      }
                      borderless
                    />
                  ) : (
                    <ul className="bento-list">
                      {tasksOverdue.map((task) => (
                        <li key={`overdue-${task.id}`} className="bento-list-item is-danger">
                          <label className="bento-check">
                            <input
                              type="checkbox"
                              checked={task.status === 'done'}
                              onChange={() => onToggleTask && void onToggleTask(task)}
                            />
                            <div className="bento-item-body">
                              <strong>{task.title}</strong>
                              <span className="bento-item-meta danger-text">
                                ⚠️ เกินกำหนด · {task.dueDate}
                              </span>
                            </div>
                          </label>
                        </li>
                      ))}
                      {tasksDueToday.map((task) => (
                        <li key={`today-${task.id}`} className="bento-list-item">
                          <label className="bento-check">
                            <input
                              type="checkbox"
                              checked={task.status === 'done'}
                              onChange={() => onToggleTask && void onToggleTask(task)}
                            />
                            <div className="bento-item-body">
                              <strong>{task.title}</strong>
                              <span className="bento-item-meta">
                                <span>{taskStatusLabel(task.status)}</span>
                                <span>{taskPriorityLabel(task.priority)}</span>
                              </span>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bento Card: Habits & Streaks (1-tap check with feedback) */}
            {(!hideEmptyCards || habitsList.length > 0) && (
              <Card variant="bordered" className="bento-card bento-card-habits">
                <CardHeader className="bento-card-header">
                  <div className="bento-card-title-group">
                    <span className="bento-card-icon">🔥</span>
                    <CardTitle>กิจวัตรประจำวัน (Habits)</CardTitle>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('schedule')}>
                    ปฏิทิน →
                  </Button>
                </CardHeader>
                <CardContent>
                  {habitsList.length === 0 ? (
                    <EmptyState
                      icon="🌱"
                      title="วันนี้ทำครบทุกกิจวัตรแล้ว"
                      description="ยอดเยี่ยมมาก! รักษาความต่อเนื่องของวินัยต่อไป"
                      borderless
                    />
                  ) : (
                    <ul className="bento-list habit-bento-list">
                      {habitsList.map((habit) => {
                        const target = habit.dailyTarget || 1;
                        const count = habit.currentCount || 0;
                        const isDone = count >= target;
                        const percent = Math.min(100, Math.round((count / target) * 100));
                        const isChecking = checkingHabitId === habit.id;

                        return (
                          <li key={habit.id} className={`bento-habit-item${isDone ? ' is-done' : ''}`}>
                            <div className="habit-info">
                              <div className="habit-title-row">
                                <strong>{habit.title}</strong>
                                <span className="streak-tag">
                                  🔥 {habit.streakDays ?? 0} วัน
                                </span>
                              </div>
                              <div className="habit-progress-bar">
                                <span style={{ width: `${percent}%` }} />
                              </div>
                              <span className="habit-count-text">
                                {count} / {target} {habit.unit || 'ครั้ง'}
                                {typeof habit.weekMetTarget === 'number' && ` · สัปดาห์นี้ ${habit.weekMetTarget}/7 วัน`}
                              </span>
                            </div>

                            <button
                              className={`habit-quick-tap-btn${isDone ? ' is-met' : ''}`}
                              type="button"
                              disabled={isChecking}
                              onClick={() => void handleHabitCheck(habit)}
                              title="แตะ 1 ครั้งเพื่อบันทึก +1"
                              aria-label={`บันทึก ${habit.title} +1`}
                            >
                              {isChecking ? '…' : isDone ? '✓ ครบ' : '+1'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bento Card: Today Timeblocks */}
            {(!hideEmptyCards || timeblocksTotal > 0) && (
              <Card variant="bordered" className="bento-card bento-card-timeblocks">
                <CardHeader className="bento-card-header">
                  <div className="bento-card-title-group">
                    <span className="bento-card-icon">⏱️</span>
                    <CardTitle>
                      ตารางชีวิตวันนี้ ({timeblocksDone}/{timeblocksTotal})
                    </CardTitle>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('schedule')}>
                    จัดตาราง →
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="bento-progress-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${timeblocksTotal === 0 ? 0 : Math.round((timeblocksDone / timeblocksTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  {timeblocksTotal === 0 ? (
                    <EmptyState
                      icon="☕"
                      title="ยังไม่ได้จัดช่วงเวลาสำหรับวันนี้"
                      description="วางแผนช่วงเวลาโฟกัสงานและพักผ่อนเพื่อเพิ่มประสิทธิภาพ"
                      action={
                        <Button variant="secondary" size="sm" onClick={() => onSwitchView('schedule')}>
                          ＋ เพิ่ม Timeblock
                        </Button>
                      }
                      borderless
                    />
                  ) : (
                    <ul className="bento-list">
                      {timeblocksBlocks.slice(0, 4).map((block) => (
                        <li key={block.id} className={`bento-list-item${block.isDone ? ' is-done' : ''}`}>
                          <div className="timeblock-row">
                            <span className="time-badge">{block.timeRange}</span>
                            <div className="bento-item-body">
                              <strong>{block.title}</strong>
                              <small>{lifeAreaLabel(block.lifeArea)}{block.isDone ? ' · ทำแล้ว' : ''}</small>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bento Card: Projects & Goals */}
            {(!hideEmptyCards || projectsList.length > 0 || goalsList.length > 0) && (
              <Card variant="bordered" className="bento-card bento-card-projects">
                <CardHeader className="bento-card-header">
                  <div className="bento-card-title-group">
                    <span className="bento-card-icon">🎯</span>
                    <CardTitle>โปรเจกต์ & เป้าหมาย</CardTitle>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('projects')}>
                    ดูทั้งหมด →
                  </Button>
                </CardHeader>
                <CardContent>
                  {projectsList.length === 0 && goalsList.length === 0 ? (
                    <EmptyState
                      icon="🚀"
                      title="ยังไม่มีโปรเจกต์ที่กำลังทำ"
                      description="สร้างโปรเจกต์แรกเพื่อรวบรวมภารกิจสู่วิสัยทัศน์ของคุณ"
                      action={
                        <Button variant="secondary" size="sm" onClick={() => onSwitchView('projects')}>
                          ＋ สร้างโปรเจกต์
                        </Button>
                      }
                      borderless
                    />
                  ) : (
                    <ul className="bento-list">
                      {projectsList.slice(0, 3).map((project) => {
                        const total = project.taskTotal ?? 0;
                        const done = project.taskDone ?? 0;
                        const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                        return (
                          <li key={project.id} className="bento-list-item">
                            <div className="bento-item-body">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>{project.name}</strong>
                                <span className="bento-percent-badge">{percent}%</span>
                              </div>
                              <span className="bento-item-meta">
                                <span>{done}/{total} งานเสร็จ</span>
                                {project.dueDate && <span>กำหนด {project.dueDate}</span>}
                              </span>
                              <div className="bento-mini-track">
                                <span style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {goalsList.slice(0, 2).map((goal) => (
                        <li key={goal.id} className="bento-list-item">
                          <div className="bento-item-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong>🎯 {goal.title}</strong>
                              {goal.progressPercent !== null && (
                                <span className="bento-percent-badge">{goal.progressPercent}%</span>
                              )}
                            </div>
                            <span className="bento-item-meta">
                              {goal.progressPercent === null
                                ? 'ยังไม่มีตัวชี้วัด'
                                : `${goal.currentValue}/${goal.targetValue} ${goal.unit}`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bento Card: Reminders & Important Notices */}
            {(!hideEmptyCards || remindersList.length > 0) && (
              <Card variant="bordered" className="bento-card bento-card-reminders">
                <CardHeader className="bento-card-header">
                  <div className="bento-card-title-group">
                    <span className="bento-card-icon">🔔</span>
                    <CardTitle>แจ้งเตือนวันสำคัญ ({remindersList.length})</CardTitle>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('schedule')}>
                    ปฏิทิน →
                  </Button>
                </CardHeader>
                <CardContent>
                  {remindersList.length === 0 ? (
                    <EmptyState
                      icon="📅"
                      title="ไม่มีแจ้งเตือนใน 60 วันนี้"
                      description="วันเกิด วันครบรอบ และกำหนดต่อสัญญาจะแสดงที่นี่"
                      borderless
                    />
                  ) : (
                    <ul className="bento-list">
                      {remindersList.slice(0, 4).map((reminder) => (
                        <li key={reminder.id} className="bento-list-item">
                          <div className="bento-item-body">
                            <strong>{reminder.title}</strong>
                            <span className="bento-item-meta">
                              <span>
                                {reminder.snoozedUntil ? `เลื่อนไป ${reminder.snoozedUntil}` : reminder.targetDate}
                              </span>
                              <span>{reminderCategoryLabel(reminder.category)}</span>
                              {reminder.linkedPersonName && <span>👤 {reminder.linkedPersonName}</span>}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bento Card: Recent Notes & Knowledge (Wide 2-col span if room) */}
            <Card variant="bordered" className="bento-card bento-card-recent span-2">
              <CardHeader className="bento-card-header">
                <div className="bento-card-title-group">
                  <span className="bento-card-icon">📌</span>
                  <CardTitle>รายการอัปเดตล่าสุด</CardTitle>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('inbox')}>
                    กล่องเข้า ({inboxNewCount})
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => onSwitchView('notes')}>
                    โน้ตทั้งหมด →
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="recent-split-grid">
                  {/* Left: Recent Notes */}
                  <div className="recent-col">
                    <h3 className="recent-subhead">📝 โน้ตที่อัปเดตล่าสุด</h3>
                    {notesList.length === 0 ? (
                      <p className="sidebar-hint">ยังไม่มีโน้ต</p>
                    ) : (
                      <ul className="bento-list">
                        {notesList.slice(0, 4).map((note) => (
                          <li key={note.id} className="bento-list-item">
                            <button
                              className="text-button bento-link-btn"
                              type="button"
                              onClick={() => onOpenNoteById(note.id)}
                            >
                              <strong>{note.title || 'โน้ตไม่มีชื่อ'}</strong>
                              <small>{formatDate(note.updatedAt)}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Right: Expiring Vault & Active Library */}
                  <div className="recent-col">
                    <h3 className="recent-subhead">🔐 คลัง & ห้องสมุดสำคัญ</h3>
                    {vaultExpiring.length === 0 && libraryActive.length === 0 ? (
                      <p className="sidebar-hint">ยังไม่มีรายการที่ใกล้หมดอายุหรือคู่มือประจำ</p>
                    ) : (
                      <ul className="bento-list">
                        {vaultExpiring.slice(0, 2).map((item) => {
                          const days = daysUntilIso(item.renewalOrExpiryDate);
                          const urgent = days !== null && days <= 30;
                          return (
                            <li key={item.id} className={`bento-list-item${urgent ? ' is-danger' : ''}`}>
                              <button
                                className="text-button bento-link-btn"
                                type="button"
                                onClick={() => onNavigateCommand('vault', item.id)}
                              >
                                <strong>🔐 {item.title}</strong>
                                <small className={urgent ? 'danger-text' : undefined}>
                                  {days !== null && days < 0
                                    ? `เกินกำหนด ${Math.abs(days)} วัน`
                                    : `อีก ${days ?? 0} วัน (${item.renewalOrExpiryDate})`}
                                </small>
                              </button>
                            </li>
                          );
                        })}
                        {libraryActive.slice(0, 2).map((item) => (
                          <li key={item.id} className="bento-list-item">
                            <button
                              className="text-button bento-link-btn"
                              type="button"
                              onClick={() => onNavigateCommand('library', item.id)}
                            >
                              <strong>📚 {item.title}</strong>
                              <small>{item.category}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
};
