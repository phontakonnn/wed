import React from 'react';
import type { CustomCategory, CustomCategoryItemsResult, StoredFile } from '../../api';
import type { NotesView } from '../../types';
import { fileIcon, formatBytes, formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export type CustomCategoryFilter = 'all' | 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library';

export interface CustomCategoryViewProps {
  customCategoryDataBusy: boolean;
  customCategoryData: CustomCategoryItemsResult | null;
  customCategoryFilter: CustomCategoryFilter;
  setCustomCategoryFilter: (filter: CustomCategoryFilter) => void;
  onOpenQuickAdd: () => void;
  onOpenCreateCategoryModal: (parentId: string | null) => void;
  onOpenEditCategoryModal: (cat: CustomCategory) => void;
  onDeleteCategory: (cat: CustomCategory) => void;
  onSelectCustomCategory: (id: string) => void;
  onUnlinkCategoryItem: (itemType: string, itemId: string) => void;
  onOpenNoteById: (id: string) => void;
  onSwitchView: (view: NotesView) => void;
  onSetMediaLightboxFile: (file: StoredFile) => void;
  onNavigateCommand: (kind: 'note' | 'task' | 'project' | 'goal' | 'person' | 'reminder' | 'bookmark' | 'file' | 'vault' | 'library', id: string) => void;
}

export const CustomCategoryView: React.FC<CustomCategoryViewProps> = ({
  customCategoryDataBusy,
  customCategoryData,
  customCategoryFilter,
  setCustomCategoryFilter,
  onOpenQuickAdd,
  onOpenCreateCategoryModal,
  onOpenEditCategoryModal,
  onDeleteCategory,
  onSelectCustomCategory,
  onUnlinkCategoryItem,
  onOpenNoteById,
  onSetMediaLightboxFile,
  onNavigateCommand,
}) => {
  return (
    <section className="life-view-container" aria-label="หมวดหมู่ของฉัน">
      {customCategoryDataBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px 0' }}>
          <Skeleton height={100} borderRadius="16px" />
          <Skeleton height={200} borderRadius="16px" />
        </div>
      ) : !customCategoryData ? (
        <EmptyState
          icon="📁"
          title="ไม่พบหมวดหมู่ที่เลือก"
          description="หมวดหมู่นี้อาจถูกลบไปแล้ว หรือยังไม่ได้เลือกหมวดหมู่จากแถบด้านซ้าย"
        />
      ) : (
        <div>
          {/* Header Banner */}
          <div className="module-header-banner">
            <div className="banner-icon">{customCategoryData.category.icon}</div>
            <div className="banner-info">
              <span className="eyebrow">Custom Folder &amp; Tag</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="banner-title">{customCategoryData.category.name}</h2>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: customCategoryData.category.color,
                  }}
                />
              </div>
              <p className="banner-subtitle">
                สร้างเมื่อ {formatDate(customCategoryData.category.createdAt)} · รวม {
                  customCategoryData.notes.length +
                  customCategoryData.tasks.length +
                  customCategoryData.bookmarks.length +
                  customCategoryData.files.length +
                  customCategoryData.vault.length +
                  customCategoryData.library.length
                } รายการ
              </p>
            </div>
            <div className="banner-actions">
              <Button variant="primary" onClick={onOpenQuickAdd}>
                ＋ เพิ่มข้อมูลในหมวดนี้
              </Button>
              <Button
                variant="quiet"
                onClick={() => onOpenCreateCategoryModal(customCategoryData.category.id)}
              >
                ＋ หมวดย่อย
              </Button>
              <Button
                variant="quiet"
                onClick={() => onOpenEditCategoryModal(customCategoryData.category)}
              >
                ✎ แก้ไข
              </Button>
              <Button
                variant="danger-quiet"
                onClick={() => onDeleteCategory(customCategoryData.category)}
              >
                🗑 ลบ
              </Button>
            </div>
          </div>

          {/* Sub-categories bar */}
          {customCategoryData.subcategories && customCategoryData.subcategories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', margin: '14px 0' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                หมวดย่อย:
              </span>
              {customCategoryData.subcategories.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className="category-sub-chip"
                  onClick={() => onSelectCustomCategory(sub.id)}
                >
                  <span>{sub.icon}</span>
                  <span>{sub.name}</span>
                  <span className="notes-count-badge">{sub.itemCount ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Filter Tabs Strip */}
          <div className="life-filter-strip" style={{ margin: '14px 0 18px' }} role="tablist">
            {(['all', 'note', 'task', 'bookmark', 'file', 'vault', 'library'] as const).map((filter) => {
              const count =
                filter === 'all'
                  ? customCategoryData.notes.length +
                    customCategoryData.tasks.length +
                    customCategoryData.bookmarks.length +
                    customCategoryData.files.length +
                    customCategoryData.vault.length +
                    customCategoryData.library.length
                  : filter === 'note'
                    ? customCategoryData.notes.length
                    : filter === 'task'
                      ? customCategoryData.tasks.length
                      : filter === 'bookmark'
                        ? customCategoryData.bookmarks.length
                        : filter === 'file'
                          ? customCategoryData.files.length
                          : filter === 'vault'
                            ? customCategoryData.vault.length
                            : customCategoryData.library.length;
              const label =
                filter === 'all'
                  ? 'ทั้งหมด'
                  : filter === 'note'
                    ? '📝 โน้ต'
                    : filter === 'task'
                      ? '✅ งาน'
                      : filter === 'bookmark'
                        ? '🔖 ลิงก์'
                        : filter === 'file'
                          ? '📁 ไฟล์'
                          : filter === 'vault'
                            ? '🔐 คลังสำคัญ'
                            : '📚 ห้องสมุด';
              return (
                <Button
                  key={filter}
                  variant={customCategoryFilter === filter ? 'primary' : 'quiet'}
                  size="sm"
                  onClick={() => setCustomCategoryFilter(filter)}
                >
                  {label} ({count})
                </Button>
              );
            })}
          </div>

          {/* Empty state when category is empty */}
          {customCategoryData.notes.length === 0 &&
            customCategoryData.tasks.length === 0 &&
            customCategoryData.bookmarks.length === 0 &&
            customCategoryData.files.length === 0 &&
            customCategoryData.vault.length === 0 &&
            customCategoryData.library.length === 0 ? (
              <EmptyState
                icon={customCategoryData.category.icon}
                title="ยังไม่มีข้อมูลในหมวดหมู่นี้"
                description="กดปุ่ม “＋ เพิ่มข้อมูลในหมวดนี้” เพื่อสร้างโน้ต งาน ลิงก์ หรือไฟล์ใหม่ผูกเข้าหมวดนี้ได้ทันที"
                action={
                  <Button variant="primary" onClick={onOpenQuickAdd}>
                    ＋ เพิ่มข้อมูลในหมวดนี้
                  </Button>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Notes */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'note') && customCategoryData.notes.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      📝 โน้ต ({customCategoryData.notes.length})
                    </h3>
                    <div className="life-bento-grid">
                      {customCategoryData.notes.map((note) => (
                        <article
                          key={note.id}
                          className="life-card"
                          onClick={() => onOpenNoteById(note.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div>
                            <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary)', display: 'block', marginBottom: '6px' }}>
                              {note.title || 'ไม่มีหัวข้อ'}
                            </strong>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {note.content ? note.content.slice(0, 100) : 'ไม่มีเนื้อหา'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)', fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                            <time>{formatDate(note.updatedAt)}</time>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkCategoryItem('note', note.id);
                              }}
                            >
                              ถอดออก
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'task') && customCategoryData.tasks.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      ✅ งาน ({customCategoryData.tasks.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {customCategoryData.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="task-row-card"
                          onClick={() => onNavigateCommand('task', task.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '14px' }}>{task.status === 'done' ? '✓' : '○'}</span>
                            <div>
                              <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
                                {task.title}
                              </strong>
                              {task.dueDate && (
                                <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                                  กำหนด: {task.dueDate}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="danger-quiet"
                            size="sm"
                            style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnlinkCategoryItem('task', task.id);
                            }}
                          >
                            ถอดออก
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bookmarks */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'bookmark') && customCategoryData.bookmarks.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      🔖 ลิงก์ ({customCategoryData.bookmarks.length})
                    </h3>
                    <div className="life-bento-grid">
                      {customCategoryData.bookmarks.map((bm) => (
                        <article
                          key={bm.id}
                          className="bookmark-card-modern"
                          onClick={() => onNavigateCommand('bookmark', bm.id)}
                        >
                          <div>
                            <div className="bookmark-card-top">
                              <span className="bookmark-domain-pill">🌐 Link</span>
                              <a
                                href={bm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bookmark-external-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                ↗ เปิด
                              </a>
                            </div>
                            <h4 className="bookmark-card-title">{bm.title}</h4>
                            <span className="bookmark-card-url">{bm.url}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkCategoryItem('bookmark', bm.id);
                              }}
                            >
                              ถอดออก
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'file') && customCategoryData.files.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      📁 ไฟล์ ({customCategoryData.files.length})
                    </h3>
                    <div className="files-bento-grid">
                      {customCategoryData.files.map((file) => (
                        <article
                          key={file.id}
                          className="file-bento-card"
                          onClick={() => onNavigateCommand('file', file.id)}
                        >
                          <div className="file-bento-thumb">
                            {file.mediaType.startsWith('image/') ? (
                              <img
                                src={file.downloadUrl}
                                alt={file.displayName}
                                className="file-bento-img"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="file-bento-placeholder-icon">
                                {fileIcon(file.mediaType, file.displayName)}
                              </span>
                            )}
                          </div>
                          <div className="file-bento-body">
                            <strong className="file-bento-title">{file.displayName}</strong>
                            <div className="file-bento-meta">
                              <span>{formatBytes(file.sizeBytes)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--pkh-bg-subtle)', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                            <Button
                              variant="quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetMediaLightboxFile(file);
                              }}
                            >
                              👁️
                            </Button>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkCategoryItem('file', file.id);
                              }}
                            >
                              ถอดออก
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vault */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'vault') && customCategoryData.vault.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      🔐 คลังสำคัญ ({customCategoryData.vault.length})
                    </h3>
                    <div className="life-bento-grid">
                      {customCategoryData.vault.map((v) => (
                        <article
                          key={v.id}
                          className="life-card"
                          onClick={() => onNavigateCommand('vault', v.id)}
                        >
                          <div>
                            <span className="task-priority-pill task-priority-normal">{v.category}</span>
                            <strong style={{ display: 'block', margin: '6px 0', fontSize: '15px' }}>{v.title}</strong>
                            {v.amountText && <p style={{ margin: 0, fontSize: '12px' }}>💰 {v.amountText}</p>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkCategoryItem('vault', v.id);
                              }}
                            >
                              ถอดออก
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Library */}
                {(customCategoryFilter === 'all' || customCategoryFilter === 'library') && customCategoryData.library.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                      📚 ห้องสมุด ({customCategoryData.library.length})
                    </h3>
                    <div className="life-bento-grid">
                      {customCategoryData.library.map((l) => (
                        <article
                          key={l.id}
                          className="life-card"
                          onClick={() => onNavigateCommand('library', l.id)}
                        >
                          <div>
                            <span className="task-priority-pill task-priority-normal">{l.category}</span>
                            <strong style={{ display: 'block', margin: '6px 0', fontSize: '15px' }}>{l.title}</strong>
                            {l.keyTakeaways && <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-muted)' }}>{l.keyTakeaways}</p>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              style={{ padding: '2px 6px', height: '22px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkCategoryItem('library', l.id);
                              }}
                            >
                              ถอดออก
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </section>
  );
};
