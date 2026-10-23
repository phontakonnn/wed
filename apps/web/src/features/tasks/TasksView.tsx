import React, { type FormEvent } from 'react';
import type { Task, Project, CustomCategory, StoredFile } from '../../api';
import { taskPriorityLabel, taskStatusLabel } from '../../lib/formatters';
import { EntityAttachments } from '../../components/EntityAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

interface TasksViewProps {
  tasks: Task[];
  taskFilter: 'open' | 'today' | 'overdue' | 'done';
  setTaskFilter: (filter: 'open' | 'today' | 'overdue' | 'done') => void;
  tasksError: string;
  tasksNotice: string;
  taskDraft: {
    title: string;
    dueDate: string;
    priority: Task['priority'];
    projectId: string;
    recurrence: Task['recurrence'];
  };
  setTaskDraft: React.Dispatch<React.SetStateAction<{
    title: string;
    dueDate: string;
    priority: Task['priority'];
    projectId: string;
    recurrence: Task['recurrence'];
  }>>;
  taskDraftCustomCatId: string;
  setTaskDraftCustomCatId: (id: string) => void;
  customCategories: CustomCategory[];
  projects: Project[];
  tasksBusy: boolean;
  onAddTask: (e: FormEvent) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onRemoveTask: (task: Task) => Promise<void>;
  onUpdateTaskCustomCategory: (task: Task, catId: string | null) => Promise<void>;
  files: StoredFile[];
  onFilesChanged: () => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  taskFilter,
  setTaskFilter,
  tasksError,
  tasksNotice,
  taskDraft,
  setTaskDraft,
  taskDraftCustomCatId,
  setTaskDraftCustomCatId,
  customCategories,
  projects,
  tasksBusy,
  onAddTask,
  onToggleTask,
  onRemoveTask,
  onUpdateTaskCustomCategory,
  files,
  onFilesChanged,
}) => {
  return (
    <section className="life-view-container" aria-label="งานที่ต้องทำ">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">✅</div>
        <div className="banner-info">
          <span className="eyebrow">Task Management</span>
          <h2 className="banner-title">งานที่ต้องทำ</h2>
          <p className="banner-subtitle">
            {tasks.length} รายการในหมวดนี้ · จัดการภารกิจและเป้าหมายประจำวันให้สำเร็จตามแผน
          </p>
        </div>
      </div>

      {tasksError && <p className="form-error editor-error" role="alert">{tasksError}</p>}
      {tasksNotice && <p className="form-notice" role="status">{tasksNotice}</p>}

      {/* Modern Quick Task Create Bar */}
      <form className="life-quick-card" onSubmit={onAddTask}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>＋ เพิ่มงานใหม่ด่วน</strong>
          <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>กด Enter หรือคลิกปุ่มเพิ่ม</span>
        </div>
        <div className="life-form-grid">
          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="quick-task-title">ชื่องาน *</label>
            <input
              id="quick-task-title"
              required
              value={taskDraft.title}
              onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
              placeholder="ระบุสิ่งที่ต้องทำ..."
              maxLength={200}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="task-due-date">กำหนดส่ง</label>
            <input
              id="task-due-date"
              type="date"
              value={taskDraft.dueDate}
              onChange={(e) => setTaskDraft({ ...taskDraft, dueDate: e.target.value })}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="task-priority">ระดับความสำคัญ</label>
            <select
              id="task-priority"
              value={taskDraft.priority}
              onChange={(e) => setTaskDraft({ ...taskDraft, priority: e.target.value as Task['priority'] })}
            >
              <option value="low">ไม่เร่ง (Low)</option>
              <option value="normal">ปกติ (Normal)</option>
              <option value="high">สำคัญ (High)</option>
              <option value="urgent">ด่วนมาก (Urgent)</option>
            </select>
          </div>

          <div className="life-field-group">
            <label htmlFor="task-project">ผูกกับโปรเจกต์</label>
            <select
              id="task-project"
              value={taskDraft.projectId}
              onChange={(e) => setTaskDraft({ ...taskDraft, projectId: e.target.value })}
            >
              <option value="">-- ไม่ผูกโปรเจกต์ --</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="life-field-group">
            <label htmlFor="task-recurrence">การทำซ้ำ</label>
            <select
              id="task-recurrence"
              value={taskDraft.recurrence}
              onChange={(e) => setTaskDraft({ ...taskDraft, recurrence: e.target.value as Task['recurrence'] })}
            >
              <option value="none">ไม่ซ้ำ</option>
              <option value="daily">ทุกวัน</option>
              <option value="weekly">ทุกสัปดาห์</option>
              <option value="monthly">ทุกเดือน</option>
              <option value="yearly">ทุกปี</option>
            </select>
          </div>

          {customCategories.length > 0 && (
            <div className="life-field-group">
              <label htmlFor="task-custom-cat">📁 หมวดหมู่ของฉัน</label>
              <select
                id="task-custom-cat"
                value={taskDraftCustomCatId}
                onChange={(e) => setTaskDraftCustomCatId(e.target.value)}
              >
                <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                {customCategories.map((c) => (
                  <option value={c.id} key={c.id}>{c.parentId ? '↳ ' : ''}{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Button variant="primary" type="submit" disabled={tasksBusy}>
            {tasksBusy ? 'กำลังบันทึก…' : '＋ เพิ่มงาน'}
          </Button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="life-filter-strip" role="group" aria-label="ตัวกรองงาน">
        {([
          ['open', 'ยังไม่เสร็จ'],
          ['today', 'วันนี้'],
          ['overdue', 'เกินกำหนด'],
          ['done', 'เสร็จแล้ว'],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            variant={taskFilter === value ? 'primary' : 'quiet'}
            size="sm"
            onClick={() => setTaskFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Task List Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            รายการงาน ({tasks.length})
          </h3>
        </div>

        {tasksBusy ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton height={50} borderRadius="8px" />
            <Skeleton height={50} borderRadius="8px" />
            <Skeleton height={50} borderRadius="8px" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="✅"
            title="ยังไม่มีงานในตัวกรองนี้"
            description="เพิ่มงานใหม่จากฟอร์มด้านบนเพื่อเริ่มวางแผนงานของคุณ หรือสลับตัวกรองอื่น"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  const input = document.getElementById('quick-task-title');
                  input?.focus();
                }}
              >
                ＋ สร้างงานใหม่
              </Button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.map((task) => {
              const isDone = task.status === 'done';
              return (
                <div key={task.id} className={`task-row-card ${isDone ? 'is-done' : ''}`}>
                  <div className="task-row-left">
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={isDone}
                      disabled={tasksBusy}
                      onChange={() => void onToggleTask(task)}
                      aria-label={`ทำเครื่องหมายเสร็จสำหรับ ${task.title}`}
                    />
                    <div className="task-row-content">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="task-row-title">{task.title}</span>
                        <span className={`task-priority-pill task-priority-${task.priority}`}>
                          {taskPriorityLabel(task.priority)}
                        </span>
                      </div>
                      <div className="task-row-meta">
                        <span>{taskStatusLabel(task.status)}</span>
                        {task.dueDate && <span>· กำหนด: {task.dueDate}</span>}
                        {task.projectName && <span>· 🚀 {task.projectName}</span>}
                        {task.recurrence !== 'none' && <span>· ↻ {task.recurrence}</span>}
                        {task.checklistTotal > 0 && <span>· ✅ {task.checklistDone}/{task.checklistTotal}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {customCategories.length > 0 && (
                      <select
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--pkh-border-subtle)',
                          background: 'var(--pkh-bg-subtle)',
                          color: 'var(--pkh-text-secondary)',
                        }}
                        aria-label="เปลี่ยนหมวดหมู่"
                        onChange={(e) => {
                          const val = e.target.value || null;
                          void onUpdateTaskCustomCategory(task, val);
                        }}
                        defaultValue=""
                      >
                        <option value="">📁 ย้ายหมวด</option>
                        {customCategories.map((c) => (
                          <option value={c.id} key={c.id}>{c.parentId ? '↳ ' : ''}{c.icon} {c.name}</option>
                        ))}
                      </select>
                    )}

                    <Button
                      variant="danger-quiet"
                      size="sm"
                      style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                      disabled={tasksBusy}
                      onClick={() => void onRemoveTask(task)}
                      title="ลบงานนี้"
                    >
                      ลบ
                    </Button>
                  </div>

                  <EntityAttachments
                    entityType="task"
                    entityId={task.id}
                    availableFiles={files}
                    onFilesChanged={onFilesChanged}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
