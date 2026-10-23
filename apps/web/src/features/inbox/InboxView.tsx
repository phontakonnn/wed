import React, { type FormEvent } from 'react';
import type { InboxItem } from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

interface InboxViewProps {
  inboxNewCount: number;
  inboxError: string;
  inboxNotice: string;
  inboxDraft: string;
  setInboxDraft: (draft: string) => void;
  onAddInboxItem: (e: FormEvent) => void;
  inboxBusy: boolean;
  inboxItems: InboxItem[];
  onConvertItem: (item: InboxItem, target: 'note' | 'task' | 'project' | 'bookmark' | 'reminder') => void;
  onArchiveInboxItem: (item: InboxItem) => void;
  onRemoveInboxItem: (item: InboxItem) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  inboxNewCount,
  inboxError,
  inboxNotice,
  inboxDraft,
  setInboxDraft,
  onAddInboxItem,
  inboxBusy,
  inboxItems,
  onConvertItem,
  onArchiveInboxItem,
  onRemoveInboxItem,
}) => {
  return (
    <section className="life-view-container" aria-label="กล่องขาเข้า">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">📥</div>
        <div className="banner-info">
          <span className="eyebrow">Quick Capture &amp; Inbox</span>
          <h2 className="banner-title">กล่องขาเข้า (Inbox)</h2>
          <p className="banner-subtitle">
            ยังไม่ได้จัดหมวด {inboxNewCount} รายการ · จดบันทึกสิ่งที่คิดไว้ก่อน แล้วค่อยแปลงเป็นโน้ต งาน หรือลิงก์ภายหลัง
          </p>
        </div>
      </div>

      {inboxError && <p className="form-error editor-error" role="alert">{inboxError}</p>}
      {inboxNotice && <p className="form-notice" role="status">{inboxNotice}</p>}

      {/* Quick Capture Form */}
      <form className="life-quick-card" onSubmit={onAddInboxItem}>
        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>⚡ จดอะไรก็ได้ก่อน (Quick Capture)</strong>
        <div className="life-field-group">
          <textarea
            value={inboxDraft}
            onChange={(e) => setInboxDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="ไอเดียใหม่, ลิงก์ที่น่าสนใจ, สิ่งที่ต้องทำด่วน, หรือเรื่องที่ต้องเตือนตัวเอง..."
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
            แปลงเป็นโน้ต งาน โปรเจกต์ หรือลิงก์ได้ในคลิกเดียวด้านล่าง
          </span>
          <Button variant="primary" type="submit" disabled={inboxBusy || !inboxDraft.trim()}>
            {inboxBusy ? 'กำลังบันทึก…' : '📥 เก็บเข้ากล่อง'}
          </Button>
        </div>
      </form>

      {/* Inbox Items Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            รายการในกล่องขาเข้า ({inboxItems.length})
          </h3>
        </div>

        {inboxItems.length === 0 ? (
          <EmptyState
            icon="📥"
            title="กล่องขาเข้าว่างเรียบร้อย"
            description="จดไอเดียหรือสิ่งที่ต้องทำในกล่องด้านบนเพื่อพักความคิดไว้ก่อน แล้วค่อยแปลงเป็นหมวดหมู่อื่น"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {inboxItems.map((item) => (
              <article key={item.id} className="inbox-item-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--pkh-text-primary)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {item.body}
                  </p>
                  <span className="task-priority-pill task-priority-normal" style={{ fontSize: '10px', flexShrink: 0 }}>
                    {item.kind === 'url' ? '🔗 ลิงก์' : '📝 ข้อความ'}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                  บันทึกเมื่อ: {formatDate(item.createdAt)}
                </div>

                {/* 1-Click Convert Strip */}
                <div className="inbox-convert-strip">
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pkh-text-secondary)', alignSelf: 'center', marginRight: '4px' }}>
                    แปลงเป็น:
                  </span>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    disabled={inboxBusy}
                    onClick={() => void onConvertItem(item, 'note')}
                  >
                    📝 โน้ต
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    disabled={inboxBusy}
                    onClick={() => void onConvertItem(item, 'task')}
                  >
                    ✅ งาน
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    disabled={inboxBusy}
                    onClick={() => void onConvertItem(item, 'project')}
                  >
                    🚀 โปรเจกต์
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    disabled={inboxBusy}
                    onClick={() => void onConvertItem(item, 'bookmark')}
                  >
                    🔖 ลิงก์
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    disabled={inboxBusy}
                    onClick={() => void onConvertItem(item, 'reminder')}
                  >
                    🔔 แจ้งเตือน
                  </Button>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                      disabled={inboxBusy}
                      onClick={() => void onArchiveInboxItem(item)}
                    >
                      📦 เก็บ
                    </Button>
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                      disabled={inboxBusy}
                      onClick={() => void onRemoveInboxItem(item)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
