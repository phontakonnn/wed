import React, { useState, useMemo, type FormEvent } from 'react';
import type { Bookmark, CustomCategory } from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { TagSelector } from '../../components/TagSelector';

const BOOKMARK_CATEGORY_PRESETS = [
  '🎮 เกม',
  '🤖 แชท AI',
  '📱 โซเชียล',
  '📚 ข้อมูล/ความรู้',
  '🛠️ เครื่องมือทำงาน',
  '🎬 ความบันเทิง',
  '💼 ธุรกิจ/การเงิน',
  '📦 อื่นๆ',
] as const;

export interface BookmarksViewProps {
  bookmarks: Bookmark[];
  activeBookmark: Bookmark | null;
  setActiveBookmark: (bm: Bookmark | null) => void;
  onStartNewBookmark?: () => void;
  bookmarkTitle: string;
  setBookmarkTitle: (title: string) => void;
  bookmarkUrl: string;
  setBookmarkUrl: (url: string) => void;
  bookmarkDescription: string;
  setBookmarkDescription: (desc: string) => void;
  bookmarkCategory?: string;
  setBookmarkCategory?: (cat: string) => void;
  bookmarkFavorited: boolean;
  saveBusy: boolean;
  favoriteBusy: boolean;
  notesError: string;
  notice: string;
  onToggleFavorite: (itemType: 'note' | 'bookmark', id: string, current: boolean) => Promise<void>;
  onDeleteBookmark: () => void;
  onDeleteBookmarkById?: (id: string) => void;
  onSaveBookmark: (e: FormEvent) => void;
  activeBookmarkCustomCatId: string | null;
  onBookmarkCustomCatChange: (newCatId: string | null) => Promise<void>;
  customCategories: CustomCategory[];
  onSelectBookmark: (bm: Bookmark) => void;
  bookmarksBusy?: boolean;
  bookmarkTags?: string[];
  setBookmarkTags?: (tags: string[]) => void;
  availableTags?: string[];
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
  onStartNewBookmark,
  bookmarkTitle,
  setBookmarkTitle,
  bookmarkUrl,
  setBookmarkUrl,
  bookmarkDescription,
  setBookmarkDescription,
  bookmarkCategory = '📦 อื่นๆ',
  setBookmarkCategory,
  bookmarkFavorited,
  saveBusy,
  favoriteBusy,
  notesError,
  notice,
  onToggleFavorite,
  onDeleteBookmark,
  onDeleteBookmarkById,
  onSaveBookmark,
  activeBookmarkCustomCatId,
  onBookmarkCustomCatChange,
  customCategories,
  onSelectBookmark,
  bookmarksBusy = false,
  bookmarkTags = [],
  setBookmarkTags,
  availableTags = [],
}) => {
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ทั้งหมด');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCustomCatInput, setIsCustomCatInput] = useState<boolean>(false);
  const [customCatText, setCustomCatText] = useState<string>('');

  // Duplicate URL check
  const duplicateBookmark = useMemo(() => {
    if (!bookmarkUrl || bookmarkUrl.trim().length < 5) return null;
    const norm = normalizeUrl(bookmarkUrl);
    return bookmarks.find(
      (b) => b.id !== activeBookmark?.id && normalizeUrl(b.url) === norm
    );
  }, [bookmarkUrl, bookmarks, activeBookmark]);

  // Aggregate all unique categories present in bookmarks + presets
  const allCategories = useMemo(() => {
    const set = new Set<string>(BOOKMARK_CATEGORY_PRESETS);
    for (const b of bookmarks) {
      if (b.category && b.category.trim()) {
        set.add(b.category.trim());
      }
    }
    return Array.from(set);
  }, [bookmarks]);

  // Filtered bookmarks
  const filteredBookmarks = useMemo(() => {
    if (selectedFilterCategory === 'ทั้งหมด') return bookmarks;
    return bookmarks.filter((b) => (b.category || '📦 อื่นๆ') === selectedFilterCategory);
  }, [bookmarks, selectedFilterCategory]);

  const handleCopy = (id: string, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      void navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleResetToNew = () => {
    if (onStartNewBookmark) {
      onStartNewBookmark();
    } else {
      setActiveBookmark(null);
      setBookmarkTitle('');
      setBookmarkUrl('');
      setBookmarkDescription('');
      setBookmarkCategory?.('📦 อื่นๆ');
    }
    setIsCustomCatInput(false);
  };

  return (
    <section className="bookmarks-container" aria-label="คลังลิงก์และบุ๊กมาร์ก">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🔖</div>
        <div className="banner-info">
          <span className="eyebrow">Web Bookmarks &amp; Resources</span>
          <h2 className="banner-title">
            {activeBookmark ? `✏️ แก้ไขลิงก์: ${activeBookmark.title}` : 'ลิงก์และบุ๊กมาร์ก'}
          </h2>
          <p className="banner-subtitle">
            {activeBookmark
              ? `แก้ไขล่าสุด ${formatDate(activeBookmark.updatedAt)}`
              : `${bookmarks.length} ลิงก์ · บันทึกเว็บ ข้อมูลอ้างอิง และเว็บไซต์ใช้งานบ่อย`}
          </p>
        </div>
        <div className="banner-actions">
          {activeBookmark ? (
            <>
              <Button variant="quiet" onClick={handleResetToNew}>
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
          ) : (
            <Button variant="quiet" onClick={handleResetToNew}>
              ＋ เพิ่มลิงก์ใหม่
            </Button>
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

      {/* Mode Indicator & Form */}
      <div style={{
        background: activeBookmark ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
        border: activeBookmark ? '1px solid rgba(59, 130, 246, 0.25)' : 'none',
        borderRadius: '16px',
        padding: activeBookmark ? '16px' : '0',
        marginBottom: '16px',
        transition: 'all 0.2s ease',
      }}>
        {activeBookmark && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb' }}>
              ✏️ กำลังอยู่ในโหมดแก้ไขลิงก์
            </span>
            <Button variant="quiet" size="sm" onClick={handleResetToNew} style={{ fontSize: '12px' }}>
              ยกเลิก / สลับไปโหมดเพิ่มใหม่
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
                type="text"
                inputMode="url"
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

            {/* Category Selector */}
            <div className="bookmark-field-group">
              <label htmlFor="bm-category">🏷️ หมวดหมู่ของลิงก์</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!isCustomCatInput ? (
                  <select
                    id="bm-category"
                    value={bookmarkCategory}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCatInput(true);
                      } else {
                        setBookmarkCategory?.(e.target.value);
                      }
                    }}
                    style={{ flex: 1 }}
                  >
                    {BOOKMARK_CATEGORY_PRESETS.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {!(BOOKMARK_CATEGORY_PRESETS as readonly string[]).includes(bookmarkCategory) && bookmarkCategory && (
                      <option value={bookmarkCategory}>{bookmarkCategory}</option>
                    )}
                    <option value="__custom__">➕ กำหนดเอง...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="พิมพ์ชื่อหมวดหมู่ เช่น 🎵 เพลง..."
                      value={customCatText}
                      onChange={(e) => setCustomCatText(e.target.value)}
                      maxLength={40}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="quiet"
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (customCatText.trim()) {
                          setBookmarkCategory?.(customCatText.trim());
                        }
                        setIsCustomCatInput(false);
                      }}
                    >
                      ตกลง
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      type="button"
                      onClick={() => setIsCustomCatInput(false)}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {customCategories.length > 0 && (
              <div className="bookmark-field-group">
                <label htmlFor="bm-cat">📁 หมวดหมู่ส่วนตัว (Custom Cat)</label>
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

          {setBookmarkTags && (
            <div className="bookmark-field-group">
              <label>🏷️ แท็กบุ๊กมาร์ก</label>
              <TagSelector
                selectedTags={bookmarkTags}
                onChange={setBookmarkTags}
                availableTags={availableTags}
                placeholder="พิมพ์แท็ก เช่น เครื่องมือ, อ่านทีหลัง, อ้างอิง..."
              />
            </div>
          )}
        </form>
      </div>

      {/* Category Filter Pills */}
      <div style={{ margin: '16px 0 12px' }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '8px',
          scrollbarWidth: 'thin',
        }}>
          <button
            type="button"
            className={`button ${selectedFilterCategory === 'ทั้งหมด' ? 'button-primary' : 'button-quiet'}`}
            style={{ borderRadius: '20px', padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
            onClick={() => setSelectedFilterCategory('ทั้งหมด')}
          >
            ทั้งหมด ({bookmarks.length})
          </button>
          {allCategories.map((cat) => {
            const count = bookmarks.filter((b) => (b.category || '📦 อื่นๆ') === cat).length;
            const isSelected = selectedFilterCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={`button ${isSelected ? 'button-primary' : 'button-quiet'}`}
                style={{ borderRadius: '20px', padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
                onClick={() => setSelectedFilterCategory(cat)}
              >
                {cat} {count > 0 && <span style={{ opacity: 0.7, fontSize: '11px' }}>({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookmarks Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            {selectedFilterCategory === 'ทั้งหมด' ? 'ลิงก์ทั้งหมด' : `หมวดหมู่: ${selectedFilterCategory}`} ({filteredBookmarks.length})
          </h3>
        </div>

        {bookmarksBusy ? (
          <div className="bookmarks-grid">
            <Skeleton height={140} borderRadius="16px" />
            <Skeleton height={140} borderRadius="16px" />
            <Skeleton height={140} borderRadius="16px" />
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <EmptyState
            icon="🔖"
            title={selectedFilterCategory === 'ทั้งหมด' ? 'ยังไม่มีบุ๊กมาร์ก' : `ไม่มีบุ๊กมาร์กในหมวด "${selectedFilterCategory}"`}
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
            {filteredBookmarks.map((bm) => {
              const domain = extractDomain(bm.url);
              const isActive = activeBookmark?.id === bm.id;
              const isCopied = copiedId === bm.id;
              const categoryBadge = bm.category || '📦 อื่นๆ';

              return (
                <article
                  key={bm.id}
                  className={`bookmark-card-modern ${isActive ? 'is-active' : ''}`}
                  onClick={() => onSelectBookmark(bm)}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    {/* Top row: Category Badge & Domain */}
                    <div className="bookmark-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'var(--pkh-bg-subtle, #f1f5f9)',
                          border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                          color: 'var(--pkh-text-primary)',
                        }}>
                          {categoryBadge}
                        </span>
                        <span className="bookmark-domain-pill" style={{ fontSize: '11px' }}>
                          🌐 {domain}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                          onClick={(e) => handleCopy(bm.id, bm.url, e)}
                          title="คัดลอกลิงก์ไปยังคลิปบอร์ด"
                        >
                          {isCopied ? '✓ คัดลอกแล้ว!' : '📋 คัดลอก'}
                        </button>
                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bookmark-external-link"
                          onClick={(e) => e.stopPropagation()}
                          title="เปิดในแท็บใหม่"
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            height: '24px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: '6px',
                            background: 'var(--pkh-bg-subtle)',
                            color: 'var(--pkh-primary, #2563eb)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          ↗ เปิดเว็บ
                        </a>
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="bookmark-card-title" style={{ fontSize: '14px', fontWeight: 600, margin: '4px 0 2px', color: 'var(--pkh-text-primary)' }}>
                      {bm.title}
                    </h4>

                    {/* Description if present */}
                    {bm.description && (
                      <p className="bookmark-card-desc" style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', margin: '4px 0 8px', lineHeight: 1.4 }}>
                        {bm.description}
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="bookmark-card-footer" style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                    <time dateTime={new Date(bm.updatedAt).toISOString()} style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
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
                      <Button
                        variant="danger-quiet"
                        size="sm"
                        style={{ padding: '2px 8px', height: '22px', fontSize: '11px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteBookmarkById) {
                            onDeleteBookmarkById(bm.id);
                          } else {
                            onSelectBookmark(bm);
                            onDeleteBookmark();
                          }
                        }}
                      >
                        🗑️ ลบ
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
