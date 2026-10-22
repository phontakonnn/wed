import React, { type FormEvent } from 'react';
import type { Goal } from '../../api';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface GoalsViewProps {
  goals: Goal[];
  goalDraft: { title: string; metric: string; targetValue: string; unit: string };
  setGoalDraft: React.Dispatch<React.SetStateAction<{ title: string; metric: string; targetValue: string; unit: string }>>;
  goalsBusy: boolean;
  goalsError: string;
  goalsNotice: string;
  onAddGoal: (e: FormEvent) => void;
  onBumpGoal: (goal: Goal, delta: number) => Promise<void>;
  onRemoveGoal: (goal: Goal) => Promise<void>;
}

export const GoalsView: React.FC<GoalsViewProps> = ({
  goals,
  goalDraft,
  setGoalDraft,
  goalsBusy,
  goalsError,
  goalsNotice,
  onAddGoal,
  onBumpGoal,
  onRemoveGoal,
}) => {
  return (
    <section className="life-view-container" aria-label="เป้าหมายและผลลัพธ์สำคัญ OKRs">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🎯</div>
        <div className="banner-info">
          <span className="eyebrow">Goals &amp; OKRs</span>
          <h2 className="banner-title">เป้าหมายและผลลัพธ์สำคัญ</h2>
          <p className="banner-subtitle">
            {goals.length} เป้าหมายที่กำลังติดตาม · มุ่งมั่นและวัดผลความสำเร็จในมิติต่างๆ ของชีวิต
          </p>
        </div>
      </div>

      {goalsError && <p className="form-error editor-error" role="alert">{goalsError}</p>}
      {goalsNotice && <p className="form-notice" role="status">{goalsNotice}</p>}

      {/* Quick Add Goal Card */}
      <form className="life-quick-card" onSubmit={onAddGoal}>
        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>＋ ตั้งเป้าหมายใหม่</strong>
        <div className="life-form-grid">
          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="goal-title">ชื่อเป้าหมาย *</label>
            <input
              id="goal-title"
              required
              value={goalDraft.title}
              onChange={(e) => setGoalDraft({ ...goalDraft, title: e.target.value })}
              placeholder="เช่น อ่านหนังสือพัฒนาตนเองให้ครบ..."
              maxLength={200}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="goal-unit">หน่วยวัด</label>
            <input
              id="goal-unit"
              value={goalDraft.unit}
              onChange={(e) => setGoalDraft({ ...goalDraft, unit: e.target.value })}
              placeholder="เล่ม / ครั้ง / บาท"
              maxLength={20}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="goal-target">ค่าเป้าหมาย</label>
            <input
              id="goal-target"
              type="number"
              value={goalDraft.targetValue}
              onChange={(e) => setGoalDraft({ ...goalDraft, targetValue: e.target.value })}
              placeholder="เช่น 24"
            />
          </div>

          <div className="life-field-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="goal-metric">วัดความสำเร็จอย่างไร (Key Metric)</label>
            <input
              id="goal-metric"
              value={goalDraft.metric}
              onChange={(e) => setGoalDraft({ ...goalDraft, metric: e.target.value })}
              placeholder="เช่น จำนวนเล่มที่อ่านจบและสรุปประเด็นสำคัญในปีนี้"
              maxLength={500}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Button variant="primary" type="submit" disabled={goalsBusy}>
            {goalsBusy ? 'กำลังบันทึก…' : '＋ เพิ่มเป้าหมาย'}
          </Button>
        </div>
      </form>

      {/* Goals Bento Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            เป้าหมายทั้งหมด ({goals.length})
          </h3>
        </div>

        {goalsBusy ? (
          <div className="life-bento-grid">
            <Skeleton height={180} borderRadius="16px" />
            <Skeleton height={180} borderRadius="16px" />
          </div>
        ) : goals.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="ยังไม่มีเป้าหมาย"
            description="กำหนดเป้าหมายแรกเพื่อสร้างแรงขับเคลื่อนและติดตามความก้าวหน้าอย่างเป็นรูปธรรม"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  const input = document.getElementById('goal-title');
                  input?.focus();
                }}
              >
                ＋ กำหนดเป้าหมายแรก
              </Button>
            }
          />
        ) : (
          <div className="life-bento-grid">
            {goals.map((goal) => (
              <article key={goal.id} className="life-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '16px', color: 'var(--pkh-text-primary)' }}>
                      {goal.title}
                    </strong>
                    {goal.progressPercent !== null && (
                      <span className="task-priority-pill task-priority-normal" style={{ fontSize: '11px' }}>
                        {goal.progressPercent}%
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--pkh-text-muted)', marginBottom: '12px' }}>
                    {goal.progressPercent === null ? (
                      <span>ยังไม่มีตัวชี้วัดความคืบหน้า</span>
                    ) : (
                      <span>{goal.currentValue}/{goal.targetValue} {goal.unit}</span>
                    )}
                    {goal.activeProjects > 0 && <span>· 🚀 {goal.activeProjects} โปรเจกต์</span>}
                  </div>

                  {goal.progressPercent !== null && (
                    <div className="life-progress-bar-wrap">
                      <div
                        className="life-progress-bar-fill"
                        style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      style={{ padding: '2px 10px', height: '26px', fontSize: '12px' }}
                      disabled={goalsBusy}
                      onClick={() => void onBumpGoal(goal, 1)}
                    >
                      +1
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      style={{ padding: '2px 10px', height: '26px', fontSize: '12px' }}
                      disabled={goalsBusy}
                      onClick={() => void onBumpGoal(goal, -1)}
                    >
                      −1
                    </Button>
                  </div>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    disabled={goalsBusy}
                    onClick={() => void onRemoveGoal(goal)}
                  >
                    ลบ
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
