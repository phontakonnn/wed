import React from 'react';
import type { Note } from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export interface TrashViewProps {
  viewMode: 'all' | 'trash';
  listTotal: number;
  activeTrashNote: Note | null;
  setActiveTrashNote: (note: Note | null) => void;
  onRestore: () => void;
  saveBusy: boolean;
  onOpenPermanentDelete: (note?: Note) => void;
  notesError: string;
  notice: string;
  filteredNotes: Note[];
  onRestoreNoteItem: (note: Note) => Promise<void>;
}

export const TrashView: React.FC<TrashViewProps> = ({
  viewMode,
  listTotal,
  activeTrashNote,
  setActiveTrashNote,
  onRestore,
  saveBusy,
  onOpenPermanentDelete,
  notesError,
  notice,
  filteredNotes,
  onRestoreNoteItem,
}) => {
  if (viewMode === 'all') {
    return (
      <section className="life-view-container" aria-label="ภาพรวมทั้งหมด">
        <EmptyState
          icon="▦"
          title="เลือกรายการจากมุมมองทั้งหมด"
          description="โน้ต งาน ลิงก์ และไฟล์จะเปิดในมุมมองเฉพาะของแต่ละประเภท"
        />
      </section>
    );
  }

  return (
    <section className="life-view-container" aria-label="จัดการโน้ตในถังขยะ">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🗑️</div>
        <div className="banner-info">
          <span className="eyebrow">Trash &amp; Safe Retention</span>
          <h2 className="banner-title">ถังขยะ (Trash)</h2>
          <p className="banner-subtitle">
            {listTotal} รายการในถังขยะ · ระบบไม่ลบข้อมูลอัตโนมัติ คุณสามารถตรวจสอบ กู้คืน หรือลบถาวรได้
          </p>
        </div>
        {activeTrashNote && (
          <div className="banner-actions">
            <Button variant="primary" onClick={onRestore} disabled={saveBusy}>
              {saveBusy ? 'กำลังดำเนินการ…' : '✓ กู้คืนโน้ต'}
            </Button>
            <Button
              variant="danger-quiet"
              onClick={() => onOpenPermanentDelete(activeTrashNote)}
              disabled={saveBusy}
            >
              ลบถาวร
            </Button>
            <Button
              variant="quiet"
              onClick={() => setActiveTrashNote(null)}
            >
              ← ดูทั้งหมด
            </Button>
          </div>
        )}
      </div>

      {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {activeTrashNote ? (
        <article className="life-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: 'var(--pkh-text-primary)' }}>
            {activeTrashNote.title || 'ไม่มีหัวข้อ'}
          </h2>
          <p style={{ color: 'var(--pkh-text-muted)', fontSize: '12px', margin: '0 0 16px' }}>
            ย้ายลงถังขยะเมื่อ {formatDate(activeTrashNote.updatedAt)}
          </p>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--pkh-text-primary)' }}>
            {activeTrashNote.content || 'ไม่มีเนื้อหา'}
          </div>
        </article>
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon="🗑️"
          title="ถังขยะว่างเปล่า"
          description="ไม่มีโน้ตหรือข้อมูลที่ถูกลบอยู่ในถังขยะ"
        />
      ) : (
        <div className="life-bento-grid">
          {filteredNotes.map((note) => (
            <article key={note.id} className="life-card">
              <div>
                <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary)', display: 'block', marginBottom: '8px' }}>
                  {note.title || 'ไม่มีหัวข้อ'}
                </strong>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--pkh-text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {note.content || 'ไม่มีเนื้อหา'}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)', fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                <time>{formatDate(note.updatedAt)}</time>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                    onClick={() => void onRestoreNoteItem(note)}
                  >
                    กู้คืน
                  </Button>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                    onClick={() => {
                      setActiveTrashNote(note);
                      onOpenPermanentDelete(note);
                    }}
                  >
                    ลบถาวร
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
