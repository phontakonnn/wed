import React, { type FormEvent } from 'react';
import type { Project, Goal, StoredFile } from '../../api';
import { EntityAttachments } from '../../components/EntityAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface ProjectsViewProps {
  projects: Project[];
  projectDraft: { name: string; outcome: string; dueDate: string; goalId: string };
  setProjectDraft: React.Dispatch<React.SetStateAction<{ name: string; outcome: string; dueDate: string; goalId: string }>>;
  goals: Goal[];
  projectsBusy: boolean;
  projectsError: string;
  projectsNotice: string;
  onAddProject: (e: FormEvent) => void;
  onFinishProject: (project: Project) => Promise<void>;
  onRemoveProject: (project: Project) => Promise<void>;
  files: StoredFile[];
  onFilesChanged: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  projectDraft,
  setProjectDraft,
  goals,
  projectsBusy,
  projectsError,
  projectsNotice,
  onAddProject,
  onFinishProject,
  onRemoveProject,
  files,
  onFilesChanged,
}) => {
  return (
    <section className="life-view-container" aria-label="โปรเจกต์และแผนงาน">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🚀</div>
        <div className="banner-info">
          <span className="eyebrow">Projects &amp; Milestones</span>
          <h2 className="banner-title">โปรเจกต์และแผนงาน</h2>
          <p className="banner-subtitle">
            {projects.length} โปรเจกต์ที่กำลังดำเนินการ · ติดตามแผนงานและความคืบหน้าให้สำเร็จตรงตามเป้าหมาย
          </p>
        </div>
      </div>

      {projectsError && <p className="form-error editor-error" role="alert">{projectsError}</p>}
      {projectsNotice && <p className="form-notice" role="status">{projectsNotice}</p>}

      {/* Quick Add Project Card */}
      <form className="life-quick-card" onSubmit={onAddProject}>
        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>＋ สร้างโปรเจกต์ใหม่</strong>
        <div className="life-form-grid">
          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="proj-name">ชื่อโปรเจกต์ *</label>
            <input
              id="proj-name"
              required
              value={projectDraft.name}
              onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })}
              placeholder="ตั้งชื่อโปรเจกต์..."
              maxLength={160}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="proj-due">กำหนดส่ง</label>
            <input
              id="proj-due"
              type="date"
              value={projectDraft.dueDate}
              onChange={(e) => setProjectDraft({ ...projectDraft, dueDate: e.target.value })}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="proj-goal">เป้าหมายที่เกี่ยวข้อง</label>
            <select
              id="proj-goal"
              value={projectDraft.goalId}
              onChange={(e) => setProjectDraft({ ...projectDraft, goalId: e.target.value })}
            >
              <option value="">-- ไม่ผูกเป้าหมาย --</option>
              {goals.map((g) => (
                <option value={g.id} key={g.id}>{g.title}</option>
              ))}
            </select>
          </div>

          <div className="life-field-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="proj-outcome">ผลลัพธ์ที่ต้องการ (Definition of Done)</label>
            <textarea
              id="proj-outcome"
              value={projectDraft.outcome}
              onChange={(e) => setProjectDraft({ ...projectDraft, outcome: e.target.value })}
              placeholder="ระบุสิ่งที่ต้องการเห็นเมื่อโปรเจกต์นี้สำเร็จ..."
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Button variant="primary" type="submit" disabled={projectsBusy}>
            {projectsBusy ? 'กำลังบันทึก…' : '＋ สร้างโปรเจกต์'}
          </Button>
        </div>
      </form>

      {/* Projects Bento Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            โปรเจกต์ที่กำลังดำเนินการ ({projects.length})
          </h3>
        </div>

        {projectsBusy ? (
          <div className="life-bento-grid">
            <Skeleton height={180} borderRadius="16px" />
            <Skeleton height={180} borderRadius="16px" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon="▣"
            title="ยังไม่มีโปรเจกต์"
            description="สร้างโปรเจกต์แรกเพื่อรวบรวมภารกิจที่มีจุดหมายเดียวกันให้ขับเคลื่อนไปข้างหน้า"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  const input = document.getElementById('proj-name');
                  input?.focus();
                }}
              >
                ＋ สร้างโปรเจกต์แรก
              </Button>
            }
          />
        ) : (
          <div className="life-bento-grid">
            {projects.map((project) => {
              const percent = project.taskTotal === 0
                ? 0
                : Math.round((project.taskDone / project.taskTotal) * 100);

              return (
                <article key={project.id} className="life-card">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                        {project.name}
                      </strong>
                      <span className="task-priority-pill task-priority-normal" style={{ fontSize: '11px' }}>
                        {percent}% เสร็จ
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--pkh-text-muted)', marginBottom: '12px' }}>
                      <span>✓ {project.taskDone}/{project.taskTotal} งาน</span>
                      {project.dueDate && <span>· กำหนด: {project.dueDate}</span>}
                      {project.goalTitle && <span>· ◎ {project.goalTitle}</span>}
                    </div>

                    {/* Progress Bar */}
                    <div className="life-progress-bar-wrap">
                      <div
                        className="life-progress-bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={projectsBusy}
                      onClick={() => void onFinishProject(project)}
                    >
                      ✓ ปิดโปรเจกต์
                    </Button>
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      disabled={projectsBusy}
                      onClick={() => void onRemoveProject(project)}
                    >
                      ลบ
                    </Button>
                  </div>

                  <EntityAttachments
                    entityType="project"
                    entityId={project.id}
                    availableFiles={files}
                    onFilesChanged={onFilesChanged}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
