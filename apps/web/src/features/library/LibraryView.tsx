import React, { type FormEvent } from 'react';
import type { LibraryItem, LibraryCategory, LibraryStatus, CustomCategory, StoredFile } from '../../api';
import type { LibraryDraft } from '../../types';
import { LIBRARY_CATEGORIES, LIBRARY_STATUSES } from '../../lib/constants';
import { libraryTone, libraryStatusTone } from '../../lib/formatters';
import { EntityAttachments } from '../../components/EntityAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface LibraryViewProps {
  libraryItems: LibraryItem[];
  activeLibrary: LibraryItem | null;
  libraryDraft: LibraryDraft;
  setLibraryDraft: React.Dispatch<React.SetStateAction<LibraryDraft>>;
  libraryError: string;
  libraryNotice: string;
  libraryBusy: boolean;
  libraryQuery: string;
  setLibraryQuery: (query: string) => void;
  libraryCategory: LibraryCategory | 'all';
  setLibraryCategory: (cat: LibraryCategory | 'all') => void;
  libraryStatus: LibraryStatus | 'all';
  setLibraryStatus: (st: LibraryStatus | 'all') => void;
  libraryCustomCatId: string;
  setLibraryCustomCatId: (id: string) => void;
  customCategories: CustomCategory[];
  onStartNewLibraryItem: () => void;
  onSaveLibraryItem: (e: FormEvent) => void;
  onRemoveLibraryItem: (item: LibraryItem) => void;
  onSelectLibraryItem: (item: LibraryItem) => void;
  files: StoredFile[];
  onFilesChanged: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  libraryItems,
  activeLibrary,
  libraryDraft,
  setLibraryDraft,
  libraryError,
  libraryNotice,
  libraryBusy,
  libraryQuery,
  setLibraryQuery,
  libraryCategory,
  setLibraryCategory,
  libraryStatus,
  setLibraryStatus,
  libraryCustomCatId,
  setLibraryCustomCatId,
  customCategories,
  onStartNewLibraryItem,
  onSaveLibraryItem,
  onRemoveLibraryItem,
  onSelectLibraryItem,
  files,
  onFilesChanged,
}) => {
  const filteredLibrary = libraryItems.filter((item) => {
    if (libraryCategory !== 'all' && item.category !== libraryCategory) return false;
    if (libraryStatus !== 'all' && item.status !== libraryStatus) return false;
    if (!libraryQuery.trim()) return true;
    const q = libraryQuery.trim().toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.sourceUrlOrAuthor.toLowerCase().includes(q) ||
      item.keyTakeaways.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q)
    );
  });

  return (
    <section className="life-view-container" aria-label="ห้องสมุดและคู่มือชีวิต Library">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">📚</div>
        <div className="banner-info">
          <span className="eyebrow">Playbooks &amp; Knowledge Base</span>
          <h2 className="banner-title">ห้องสมุด &amp; คู่มือชีวิต (Library)</h2>
          <p className="banner-subtitle">
            {libraryItems.length} รายการ · คลังคู่มือ SOP, เช็คลิสต์ปฏิบัติการ, สรุปหนังสือ และคอร์สเรียนสำคัญ
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={onStartNewLibraryItem}>
            ＋ เพิ่มคู่มือใหม่
          </Button>
        </div>
      </div>

      {libraryError && <p className="form-error editor-error" role="alert">{libraryError}</p>}
      {libraryNotice && <p className="form-notice" role="status">{libraryNotice}</p>}

      {/* Quick Add / Edit Form */}
      <form className="life-quick-card" onSubmit={onSaveLibraryItem}>
        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
          {activeLibrary ? `✏️ แก้ไขคู่มือ: ${activeLibrary.title}` : '＋ สร้างคู่มือหรือ SOP ใหม่'}
        </strong>
        <div className="life-form-grid">
          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="lib-title">ชื่อคู่มือ / วิชา / หัวข้อ *</label>
            <input
              id="lib-title"
              required
              value={libraryDraft.title}
              onChange={(e) => setLibraryDraft({ ...libraryDraft, title: e.target.value })}
              maxLength={200}
              placeholder="เช่น คู่มือต่อภาษีประจำปี, เช็คลิสต์ก่อนเดินทางไกล, สรุปคอร์สเรียน..."
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="lib-cat">หมวดหมู่</label>
            <select
              id="lib-cat"
              value={libraryDraft.category}
              onChange={(e) => setLibraryDraft({
                ...libraryDraft,
                category: e.target.value as LibraryCategory,
              })}
            >
              {LIBRARY_CATEGORIES.map((category) => (
                <option value={category} key={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="life-field-group">
            <label htmlFor="lib-status">สถานะ</label>
            <select
              id="lib-status"
              value={libraryDraft.status}
              onChange={(e) => setLibraryDraft({
                ...libraryDraft,
                status: e.target.value as LibraryStatus,
              })}
            >
              {LIBRARY_STATUSES.map((status) => (
                <option value={status} key={status}>{status}</option>
              ))}
            </select>
          </div>

          {customCategories.length > 0 && (
            <div className="life-field-group">
              <label htmlFor="lib-custom-cat">📁 หมวดหมู่ของฉัน</label>
              <select
                id="lib-custom-cat"
                value={libraryCustomCatId}
                onChange={(e) => setLibraryCustomCatId(e.target.value)}
              >
                <option value="">-- ไม่ระบุ --</option>
                {customCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.parentId ? '↳ ' : ''}{category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="lib-source">แหล่งที่มา / ลิงก์ / ผู้เขียน</label>
            <input
              id="lib-source"
              value={libraryDraft.sourceUrlOrAuthor}
              onChange={(e) => setLibraryDraft({ ...libraryDraft, sourceUrlOrAuthor: e.target.value })}
              maxLength={400}
              placeholder="เช่น ลิงก์ต้นฉบับ, ชื่อหนังสือ, วิทยากร..."
            />
          </div>

          <div className="life-field-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="lib-takeaways">สาระสำคัญที่ต้องจำ 3 ข้อ (Key Takeaways)</label>
            <textarea
              id="lib-takeaways"
              rows={2}
              value={libraryDraft.keyTakeaways}
              onChange={(e) => setLibraryDraft({ ...libraryDraft, keyTakeaways: e.target.value })}
              placeholder="สรุป 3 ประเด็นสำคัญที่อ่านแล้วนำไปใช้ได้ทันที..."
            />
          </div>

          <div className="life-field-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="lib-content">เนื้อหาฉบับเต็ม / ขั้นตอนปฏิบัติ (SOP Content)</label>
            <textarea
              id="lib-content"
              rows={6}
              value={libraryDraft.content}
              onChange={(e) => setLibraryDraft({ ...libraryDraft, content: e.target.value })}
              placeholder="ขั้นตอนปฏิบัติการที่ 1, 2, 3 หรือข้อมูลสรุปฉบับละเอียด..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          {activeLibrary && (
            <Button
              variant="danger-quiet"
              type="button"
              disabled={libraryBusy}
              onClick={() => void onRemoveLibraryItem(activeLibrary)}
            >
              ลบคู่มือนี้
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={libraryBusy}>
            {libraryBusy ? 'กำลังบันทึก…' : activeLibrary ? 'บันทึกการแก้ไข' : '＋ สร้างคู่มือใหม่'}
          </Button>
        </div>
      </form>

      {activeLibrary && (
        <EntityAttachments
          entityType="library"
          entityId={activeLibrary.id}
          availableFiles={files}
          onFilesChanged={onFilesChanged}
        />
      )}

      {/* Library Items Grid */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            คู่มือและวิชาทั้งหมด ({filteredLibrary.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '480px' }}>
            <input
              type="search"
              placeholder="ค้นหาในห้องสมุด..."
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                fontSize: '13px',
              }}
            />
            <select
              value={libraryCategory}
              onChange={(e) => setLibraryCategory(e.target.value as LibraryCategory | 'all')}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                fontSize: '12px',
              }}
            >
              <option value="all">ทุกหมวดหมู่</option>
              {LIBRARY_CATEGORIES.map((c) => (
                <option value={c} key={c}>{c}</option>
              ))}
            </select>
            <select
              value={libraryStatus}
              onChange={(e) => setLibraryStatus(e.target.value as LibraryStatus | 'all')}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                fontSize: '12px',
              }}
            >
              <option value="all">ทุกสถานะ</option>
              {LIBRARY_STATUSES.map((s) => (
                <option value={s} key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {libraryBusy ? (
          <div className="life-bento-grid">
            <Skeleton height={200} borderRadius="16px" />
            <Skeleton height={200} borderRadius="16px" />
          </div>
        ) : filteredLibrary.length === 0 ? (
          <EmptyState
            icon="📚"
            title="ไม่พบคู่มือในห้องสมุด"
            description="สร้างคู่มือ SOP หรือสรุปสาระสำคัญเล่มแรกด้วยแบบฟอร์มด้านบน"
            action={
              <Button variant="primary" onClick={onStartNewLibraryItem}>
                ＋ สร้างคู่มือแรก
              </Button>
            }
          />
        ) : (
          <div className="life-bento-grid">
            {filteredLibrary.map((item) => (
              <article
                key={item.id}
                className={`life-card ${activeLibrary?.id === item.id ? 'is-active' : ''}`}
                onClick={() => onSelectLibraryItem(item)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className={`library-badge ${libraryTone(item.category)}`}>
                      {item.category}
                    </span>
                    <span className={`library-status ${libraryStatusTone(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary)', display: 'block', marginBottom: '6px' }}>
                    {item.title}
                  </strong>

                  {item.sourceUrlOrAuthor && (
                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--pkh-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔗 {item.sourceUrlOrAuthor}
                    </p>
                  )}

                  {item.keyTakeaways && (
                    <div className="library-takeaways" style={{ margin: '8px 0' }}>
                      <strong style={{ display: 'block', fontSize: '11px', marginBottom: '2px', color: 'var(--pkh-brand-primary)' }}>
                        💡 Key Takeaways:
                      </strong>
                      <span>{item.keyTakeaways}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLibraryItem(item);
                    }}
                  >
                    ✏️ แก้ไข
                  </Button>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemoveLibraryItem(item);
                    }}
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
