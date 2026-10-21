import React, { useMemo, type FormEvent } from 'react';
import type { Bookmark, CustomCategory } from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface BookmarksViewProps {
  bookmarks: Bookmark[];
  activeBookmark: Bookmark | null;
  setActiveBookmark: (bm: Bookmark | null) => void;
  bookmarkTitle: string;
  setBookmarkTitle: (title: string) => void;
  bookmarkUrl: string;
  setBookmarkUrl: (url: string) => void;
  bookmarkDescription: string;
  setBookmarkDescription: (desc: string) => void;
  bookmarkFavorited: boolean;
  saveBusy: boolean;
  favoriteBusy: boolean;
  notesError: string;
  notice: string;
  onToggleFavorite: (itemType: 'note' | 'bookmark', id: string, current: boolean) => Promise<void>;
  onDeleteBookmark: () => void;
  onSaveBookmark: (e: FormEvent) => void;
  activeBookmarkCustomCatId: string | null;
  onBookmarkCustomCatChange: (newCatId: string | null) => Promise<void>;
  customCategories: CustomCategory[];
  onSelectBookmark: (bm: Bookmark) => void;
  bookmarksBusy?: boolean;
}

function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith('http://') || urlStr.startsWith('https://') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  bookmarks,
  activeBookmark,
  setActiveBookmark,
  bookmarkTitle,
  setBookmarkTitle,
  bookmarkUrl,
  setBookmarkUrl,
  bookmarkDescription,
  setBookmarkDescription,
  bookmarkFavorited,
  saveBusy,
  favoriteBusy,
  notesError,
  notice,
  onToggleFavorite,
  onDeleteBookmark,
  onSaveBookmark,
  activeBookmarkCustomCatId,
  onBookmarkCustomCatChange,
  customCategories,
  onSelectBookmark,
  bookmarksBusy = false,
}) => {
  // Duplicate URL check
  const duplicateBookmark = useMemo(() => {
    if (!bookmarkUrl || bookmarkUrl.trim().length < 5) return null;
    const norm = normalizeUrl(bookmarkUrl);
    return bookmarks.find(
      (b) => b.id !== activeBookmark?.id && normalizeUrl(b.url) === norm
    );
  }, [bookmarkUrl, bookmarks, activeBookmark]);

  return (
    <section className="bookmarks-container" aria-label="คลังลิงก์และบุ๊กมาร์ก">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🔖</div>
        <div className="banner-info">
          <span className="eyebrow">Web Bookmarks &amp; Resources</span>
          <h2 className="banner-title">{activeBookmark ? activeBookmark.title : 'ลิงก์และบุ๊กมาร์ก'}</h2>
          <p className="banner-subtitle">
            {activeBookmark
              ? `แก้ไขล่าสุด ${formatDate(activeBookmark.updatedAt)}`
              : `${bookmarks.length} ลิงก์ · คลังเว็บ แหล่งอ้างอิง และบุ๊กมาร์กสำคัญ`}
          </p>
        </div>
        <div className="banner-actions">
          {activeBookmark && (
            <>
              <Button
                variant="quiet"
                onClick={() => {
                  setActiveBookmark(null);
                  setBookmarkTitle('');
                  setBookmarkUrl('');
                  setBookmarkDescription('');
                }}
              >
                ← ดูลิงก์ทั้งหมด
              </Button>
              <Button
                variant="quiet"
                onClick={() => void onToggleFavorite('bookmark', activeBookmark.id, bookmarkFavorited)}
                disabled={favoriteBusy || saveBusy}
              >
                {bookmarkFavorited ? '★ โปรด' : '☆ เพิ่มโปรด'}
              </Button>
              <Button
                variant="danger-quiet"
                onClick={onDeleteBookmark}
                disabled={saveBusy}
              >
                ลบ
              </Button>
            </>
          )}
          <Button
            variant="primary"
            type="submit"
            form="bookmark-editor-form"
            disabled={saveBusy}
          >
            {saveBusy ? 'กำลังบันทึก…' : activeBookmark ? 'บันทึกการแก้ไข' : '＋ บันทึกบุ๊กมาร์ก'}
          </Button>
        </div>
      </div>

      {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {/* Duplicate URL Alert Banner */}
      {duplicateBookmark && (
        <div className="bookmark-duplicate-alert" role="alert">
          <div>
            <span>⚠️ <strong>พบลิงก์ซ้ำในระบบ:</strong> ลิงก์นี้เคยบันทึกไว้แล้วในชื่อ "{duplicateBookmark.title}"</span>
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onSelectBookmark(duplicateBookmark)}
            style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
          >
            เปิดดูรายการเดิม →
          </Button>
        </div>
      )}

      {/* Quick Save Bar / Form */}
      <form
        className="bookmark-quick-bar"
        id="bookmark-editor-form"
        onSubmit={onSaveBookmark}
      >
        <div className="bookmark-form-grid">
          <div className="bookmark-field-group">
            <label htmlFor="bm-url">
              URL เว็บไซต์ <span style={{ color: 'var(--pkh-danger)' }}>*</span>
            </label>
            <input
              id="bm-url"
              type="url"
              value={bookmarkUrl}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setBookmarkUrl(nextUrl);
                // If title is empty, prefill with domain
                if (!bookmarkTitle.trim() && nextUrl.length > 8) {
                  const domain = extractDomain(nextUrl);
                  if (domain !== 'link') {
                    setBookmarkTitle(domain);
                  }
                }
              }}
              placeholder="https://example.com/article..."
              maxLength={2048}
              required
            />
          </div>

          <div className="bookmark-field-group">
            <label htmlFor="bm-title">
              ชื่อลิงก์ <span style={{ color: 'var(--pkh-danger)' }}>*</span>
            </label>
            <input
              id="bm-title"
              type="text"
              value={bookmarkTitle}
              onChange={(e) => setBookmarkTitle(e.target.value)}
              placeholder="ระบุชื่อเพื่อให้ค้นหาง่าย..."
              maxLength={160}
              required
            />
          </div>

          {customCategories.length > 0 && (
            <div className="bookmark-field-group">
              <label htmlFor="bm-cat">📁 หมวดหมู่ของฉัน</label>
              <select
                id="bm-cat"
                value={activeBookmarkCustomCatId || ''}
                onChange={(e) => void onBookmarkCustomCatChange(e.target.value || null)}
              >
                <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                {customCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '↳ ' : ''}{c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bookmark-field-group">
          <label htmlFor="bm-desc">คำอธิบายย่อ หรือบันทึกช่วยจำ (ไม่บังคับ)</label>
          <textarea
            id="bm-desc"
            value={bookmarkDescription}
            onChange={(e) => setBookmarkDescription(e.target.value)}
            placeholder="สรุปเนื้อหา จุดเด่น หรือเหตุผลที่เก็บบุ๊กมาร์กนี้ไว้..."
            rows={2}
            maxLength={2000}
          />
        </div>
      </form>

      {/* Bookmarks Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            ลิงก์ทั้งหมด ({bookmarks.length})
          </h3>
        </div>

        {bookmarksBusy ? (
          <div className="bookmarks-grid">
            <Skeleton height={140} borderRadius="16px" />
            <Skeleton height={140} borderRadius="16px" />
            <Skeleton height={140} borderRadius="16px" />
          </div>
        ) : bookmarks.length === 0 ? (
          <EmptyState
            icon="🔖"
            title="ยังไม่มีบุ๊กมาร์ก"
            description="วาง URL ในแบบฟอร์มด้านบนเพื่อเริ่มต้นบันทึกลิงก์และแหล่งข้อมูลโปรดของคุณ"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  const urlInput = document.getElementById('bm-url');
                  urlInput?.focus();
                }}
              >
                ＋ บันทึกลิงก์แรก
              </Button>
            }
          />
        ) : (
          <div className="bookmarks-grid">
            {bookmarks.map((bm) => {
              const domain = extractDomain(bm.url);
              const isActive = activeBookmark?.id === bm.id;

              return (
                <article
                  key={bm.id}
                  className={`bookmark-card-modern ${isActive ? 'is-active' : ''}`}
                  onClick={() => onSelectBookmark(bm)}
                >
                  <div>
                    <div className="bookmark-card-top">
                      <span className="bookmark-domain-pill">
                        🌐 {domain}
                      </span>
                      <a
                        href={bm.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bookmark-external-link"
                        onClick={(e) => e.stopPropagation()}
                        title="เปิดในแท็บใหม่"
                      >
                        ↗ เปิดเว็บ
                      </a>
                    </div>

                    <h4 className="bookmark-card-title">{bm.title}</h4>
                    <span className="bookmark-card-url">{bm.url}</span>

                    {bm.description && (
                      <p className="bookmark-card-desc">{bm.description}</p>
                    )}
                  </div>

                  <div className="bookmark-card-footer">
                    <time dateTime={new Date(bm.updatedAt).toISOString()}>
                      {formatDate(bm.updatedAt)}
                    </time>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="quiet"
                        size="sm"
                        style={{ padding: '2px 8px', height: '22px', fontSize: '11px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBookmark(bm);
                        }}
                      >
                        ✏️ แก้ไข
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
