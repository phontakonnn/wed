import React, { type FormEvent, useState } from 'react';
import { type Note, type Favorite, type TaxonomyItem, type Person, type CustomCategory, createTag, createCategory } from '../../api';
import { formatDate } from '../../lib/formatters';
import { MarkdownViewer } from '../../components/MarkdownViewer';
import { NoteVersionHistoryModal } from './NoteVersionHistoryModal';
import { ShareItemModal } from '../../components/ShareItemModal';
import { TagManagerModal } from '../../components/TagManagerModal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface NotesViewProps {
  noteViewMode: 'grid' | 'editor';
  setNoteViewMode: (mode: 'grid' | 'editor') => void;
  activeNote: Note | null;
  setActiveNote: (note: Note | null) => void;
  listTotal: number;
  onStartNewNote: () => void;
  searchInput: string;
  setSearchInput: (input: string) => void;
  shortSearch?: boolean;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setNotesError: (err: string) => void;
  onClearSearch: () => void;
  notesBusy: boolean;
  notesError: string;
  notice: string;
  filteredNotes: Note[];
  onSelectNote: (note: Note) => void;
  favorites: Favorite[];
  onToggleFavorite: (itemType: 'note' | 'bookmark', id: string, current: boolean) => Promise<void>;
  onMoveToTrash: (note: Note) => Promise<void>;
  page: number;
  pageCount: number;
  sidebarBusy: boolean;
  searchSettling: boolean;
  markListBusy: () => void;
  // Editor props
  noteFavorited: boolean;
  favoriteBusy: boolean;
  saveBusy: boolean;
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  noteMenuOpen: boolean;
  setNoteMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onDelete: () => Promise<void>;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  onFlushAutosave: () => Promise<void>;
  taxonomyRelationsBusy: boolean;
  taxonomyRelationsUnavailable?: boolean;
  taxonomyError?: string;
  taxonomyNotice?: string;
  onSave: (e: FormEvent) => void;
  title: string;
  setTitle: (title: string) => void;
  selectedCategoryNames: TaxonomyItem[];
  selectedTagNames: TaxonomyItem[];
  selectedPeople: Person[];
  onToggleRelation: (kind: 'categories' | 'tags', id: string) => void;
  setSelectedPersonIds: React.Dispatch<React.SetStateAction<string[]>>;
  chipPicker: 'categories' | 'tags' | null;
  setChipPicker: (picker: 'categories' | 'tags' | null) => void;
  personPickerOpen: boolean;
  setPersonPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeNoteCustomCatId: string | null;
  onNoteCustomCatChange: (newCatId: string | null) => Promise<void>;
  customCategories: CustomCategory[];
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  people: Person[];
  selectedPersonIds: string[];
  onRetryTaxonomyLoad?: () => void;
  onTagCreated?: (tag: TaxonomyItem) => void;
  onCategoryCreated?: (cat: TaxonomyItem) => void;
  content: string;
  setContent: (content: string) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  noteViewMode,
  setNoteViewMode,
  activeNote,
  setActiveNote,
  listTotal,
  onStartNewNote,
  searchInput,
  setSearchInput,
  shortSearch,
  setPage,
  setNotesError,
  onClearSearch,
  notesBusy,
  notesError,
  notice,
  filteredNotes,
  onSelectNote,
  favorites,
  onToggleFavorite,
  onMoveToTrash,
  page,
  pageCount,
  sidebarBusy,
  searchSettling,
  markListBusy,
  noteFavorited,
  favoriteBusy,
  saveBusy,
  saveState = 'idle',
  noteMenuOpen,
  setNoteMenuOpen,
  onDelete,
  focusMode,
  setFocusMode,
  onFlushAutosave,
  taxonomyRelationsBusy,
  taxonomyRelationsUnavailable,
  taxonomyError,
  taxonomyNotice,
  onSave,
  title,
  setTitle,
  selectedCategoryNames,
  selectedTagNames,
  selectedPeople,
  onToggleRelation,
  setSelectedPersonIds,
  chipPicker,
  setChipPicker,
  personPickerOpen,
  setPersonPickerOpen,
  activeNoteCustomCatId,
  onNoteCustomCatChange,
  customCategories,
  categories,
  tags,
  people,
  selectedPersonIds,
  onRetryTaxonomyLoad,
  onTagCreated,
  onCategoryCreated,
  content,
  setContent,
}) => {
  // Mode: edit or preview
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [prevSaveState, setPrevSaveState] = useState(saveState);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [newTagInput, setNewTagInput] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const handleCopyContent = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      void navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // fallback
    }
  };

  const handleToggleSecret = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateCategorySubmit = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const created = await createCategory(trimmed);
      if (created) {
        onCategoryCreated?.(created);
        onToggleRelation('categories', created.id);
        setNewCategoryInput('');
      }
    } catch (err) {
      console.error('Failed to create category', err);
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleCreateTagSubmit = async () => {
    const trimmed = newTagInput.trim().replace(/^#+/, '');
    if (!trimmed || creatingTag) return;
    setCreatingTag(true);
    try {
      const created = await createTag(trimmed);
      if (created) {
        onTagCreated?.(created);
        onToggleRelation('tags', created.id);
        setNewTagInput('');
      }
    } catch (err) {
      console.error('Failed to create tag', err);
    } finally {
      setCreatingTag(false);
    }
  };

  // Keep track of save time during state transition
  if (prevSaveState !== saveState) {
    setPrevSaveState(saveState);
    if (saveState === 'saved') {
      const now = new Date();
      setLastSavedTime(
        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      );
    }
  }

  // Find active custom category object
  const activeCustomCat = customCategories.find((c) => c.id === activeNoteCustomCatId);

  // Check if editing a draft vs existing note vs none
  const isEditing = Boolean(activeNote || noteViewMode === 'editor');

  return (
    <section className="notes-container" aria-label="คลังความรู้และโน้ต">
      {/* Banner / Header */}
      <div className="module-header-banner" style={{ margin: '8px 0 12px' }}>
        <div className="banner-icon">📝</div>
        <div className="banner-info">
          <span className="eyebrow">Personal Knowledge Hub</span>
          <h2 className="banner-title">ความรู้และโน้ตของฉัน</h2>
          <p className="banner-subtitle">
            {listTotal} รายการ · คลังความคิด บันทึกส่วนตัว และข้อมูลสำคัญแบบ Markdown
          </p>
        </div>
        <div className="banner-actions">
          <Button
            variant="primary"
            onClick={() => {
              onStartNewNote();
              setNoteViewMode('editor');
              setEditorTab('edit');
            }}
          >
            ＋ สร้างโน้ตใหม่
          </Button>
        </div>
      </div>

      {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {/* 2-Column Master-Detail Layout */}
      <div className="notes-master-detail">
        {/* Left: Master List Pane */}
        <aside
          className={`notes-master-pane ${isEditing ? 'hide-on-mobile' : ''}`}
          aria-label="รายการโน้ตทั้งหมด"
        >
          <div className="notes-master-header">
            <div className="notes-master-top">
              <span className="notes-master-title">
                โน้ตทั้งหมด <span className="notes-count-badge">{listTotal}</span>
              </span>
              {searchInput && (
                <button
                  type="button"
                  className="notes-search-clear"
                  onClick={onClearSearch}
                  title="ล้างคำค้น"
                >
                  ✕ ล้าง
                </button>
              )}
            </div>

            <div className="notes-search-wrap">
              <span className="notes-search-icon">🔍</span>
              <input
                id="note-search"
                type="search"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                  setNotesError('');
                }}
                maxLength={500}
                placeholder="ค้นหาโน้ต..."
              />
            </div>
            {shortSearch && (
              <p className="sidebar-hint" style={{ margin: 0, fontSize: '11px' }}>
                พิมพ์อย่างน้อย 3 ตัวอักษรเพื่อค้นหา
              </p>
            )}
          </div>

          <div className="notes-list-scroll">
            {notesBusy ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton height={56} borderRadius="8px" />
                <Skeleton height={56} borderRadius="8px" />
                <Skeleton height={56} borderRadius="8px" />
                <Skeleton height={56} borderRadius="8px" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div style={{ padding: '32px 16px' }}>
                <EmptyState
                  icon="📝"
                  title="ไม่พบโน้ต"
                  description={searchInput ? 'ไม่พบโน้ตที่ตรงกับคำค้นหา' : 'ยังไม่มีโน้ตในคลัง'}
                  action={
                    <Button
                      variant="primary"
                      onClick={() => {
                        onStartNewNote();
                        setNoteViewMode('editor');
                      }}
                    >
                      ＋ สร้างโน้ตแรก
                    </Button>
                  }
                />
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isFav = favorites.some((f) => f.itemType === 'note' && f.itemId === note.id);
                const isActive = activeNote?.id === note.id;
                const isSecret =
                  note.title.includes('🔐') ||
                  note.title.includes('รหัส') ||
                  note.title.includes('บัญชี') ||
                  note.title.includes('PIN') ||
                  note.content.includes('[SECRET]');
                const isRevealed = Boolean(revealedIds[note.id]);
                const displayContent = isSecret && !isRevealed
                  ? '•••••••••••• (ข้อมูลลับ: คลิก 👁️ เพื่อแสดง)'
                  : note.content ? note.content.slice(0, 110) : 'ไม่มีเนื้อหา';

                return (
                  <article
                    key={note.id}
                    className={`note-item-card ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectNote(note);
                      setNoteViewMode('editor');
                    }}
                  >
                    <div className="note-item-head">
                      <strong className="note-item-title">{note.title || 'ไม่มีหัวข้อ'}</strong>
                      <button
                        className={`note-item-star ${isFav ? 'is-starred' : ''}`}
                        type="button"
                        title={isFav ? 'อยู่ในรายการโปรด' : 'เพิ่มในรายการโปรด'}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onToggleFavorite('note', note.id, isFav);
                        }}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    </div>

                    <p className="note-item-preview" style={{ fontFamily: isSecret && !isRevealed ? 'monospace' : 'inherit' }}>
                      {displayContent}
                    </p>

                    <div className="note-item-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Button
                          variant="quiet"
                          size="sm"
                          type="button"
                          style={{ padding: '2px 8px', height: '22px', fontSize: '11px' }}
                          onClick={(e) => handleCopyContent(note.id, note.content, e)}
                          title="คัดลอกข้อความใน 1 คลิก"
                        >
                          {copiedId === note.id ? '✓ คัดลอกแล้ว!' : '📋 คัดลอก'}
                        </Button>
                        {isSecret && (
                          <Button
                            variant="quiet"
                            size="sm"
                            type="button"
                            style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                            onClick={(e) => handleToggleSecret(note.id, e)}
                            title={isRevealed ? 'ซ่อนข้อความ' : 'แสดงข้อความลับ'}
                          >
                            {isRevealed ? '🙈 ซ่อน' : '👁️ แสดง'}
                          </Button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <time dateTime={new Date(note.updatedAt).toISOString()} style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                          {formatDate(note.updatedAt)}
                        </time>
                        <button
                          className="button button-danger-quiet"
                          type="button"
                          style={{ padding: '1px 6px', minHeight: '20px', fontSize: '10px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onMoveToTrash(note);
                          }}
                          title="ย้ายลงถังขยะ"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}

            {/* Pagination */}
            {pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '12px 4px' }}>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={page <= 1 || sidebarBusy || searchSettling}
                  onClick={() => {
                    markListBusy();
                    setNotesError('');
                    setPage((c) => c - 1);
                  }}
                >
                  ←
                </Button>
                <span style={{ fontSize: '11px', alignSelf: 'center', color: 'var(--pkh-text-muted)' }}>
                  {page}/{pageCount}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={page >= pageCount || sidebarBusy || searchSettling}
                  onClick={() => {
                    markListBusy();
                    setNotesError('');
                    setPage((c) => c + 1);
                  }}
                >
                  →
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Right: Detail Reader/Editor Pane */}
        <main
          className={`notes-detail-pane ${!isEditing ? 'hide-on-mobile' : ''}`}
          aria-label="ตัวอ่านและแก้ไขโน้ต"
        >
          {isEditing ? (
            <>
              {/* Editor Header Bar */}
              <div className="notes-editor-header">
                <div className="notes-header-left">
                  {/* Mobile Back Button */}
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      void onFlushAutosave();
                      setActiveNote(null);
                      setNoteViewMode('grid');
                    }}
                    title="กลับหน้ารายการ"
                  >
                    ← รายการ
                  </Button>

                  {/* Auto-save Status Pill */}
                  <div
                    className={`autosave-pill ${saveState}`}
                    role="status"
                    aria-live="polite"
                  >
                    {saveState === 'saving' && <span>⏳ กำลังบันทึก...</span>}
                    {saveState === 'saved' && (
                      <span>✓ บันทึกแล้ว {lastSavedTime || 'เมื่อสักครู่'}</span>
                    )}
                    {saveState === 'error' && (
                      <>
                        <span>⚠️ บันทึกไม่สำเร็จ</span>
                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={(e) => onSave(e)}
                          style={{ padding: '0 6px', fontSize: '11px', height: '20px' }}
                        >
                          ลองใหม่
                        </Button>
                      </>
                    )}
                    {saveState === 'idle' && (
                      <span>
                        {activeNote
                          ? `แก้ไขล่าสุด ${formatDate(activeNote.updatedAt)}`
                          : 'กำลังเขียนโน้ตใหม่'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="notes-header-right">
                  {/* Mode Switch: Edit vs Preview */}
                  <div className="mode-toggle-group" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={editorTab === 'edit'}
                      className={`mode-toggle-btn ${editorTab === 'edit' ? 'is-active' : ''}`}
                      onClick={() => setEditorTab('edit')}
                    >
                      ✏️ แก้ไข
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={editorTab === 'preview'}
                      className={`mode-toggle-btn ${editorTab === 'preview' ? 'is-active' : ''}`}
                      onClick={() => setEditorTab('preview')}
                    >
                      👁️ อ่านพรีวิว
                    </button>
                  </div>

                  {activeNote && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => setVersionHistoryOpen(true)}
                      title="ดูประวัติการแก้ไขและเวอร์ชันย้อนหลัง"
                    >
                      🕒 ประวัติ
                    </Button>
                  )}

                  {activeNote && (
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={favoriteBusy}
                      onClick={() => void onToggleFavorite('note', activeNote.id, noteFavorited)}
                      title={noteFavorited ? 'อยู่ในรายการโปรด' : 'เพิ่มในรายการโปรด'}
                    >
                      {noteFavorited ? '★ โปรด' : '☆'}
                    </Button>
                  )}

                  {activeNote && (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => setNoteMenuOpen((o) => !o)}
                      >
                        ⋯
                      </Button>
                      {noteMenuOpen && (
                        <div className="popover-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 20 }}>
                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setNoteMenuOpen(false);
                              setVersionHistoryOpen(true);
                            }}
                          >
                            🕒 ประวัติการแก้ไข
                          </button>
                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setNoteMenuOpen(false);
                              setShareModalOpen(true);
                            }}
                          >
                            🔗 แชร์โน้ตนี้ (Share)
                          </button>

                          <button
                            className="menu-item danger-text"
                            type="button"
                            onClick={() => {
                              setNoteMenuOpen(false);
                              void onDelete();
                            }}
                          >
                            🗑️ ย้ายไปถังขยะ
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => setFocusMode((v) => !v)}
                    title={focusMode ? 'ออกจากโหมดโฟกัส' : 'โหมดโฟกัส'}
                  >
                    {focusMode ? '🔎 ปิดโฟกัส' : '🔎 โฟกัส'}
                  </Button>

                  <Button
                    type="submit"
                    form="note-editor-form"
                    id="note-save-btn"
                    variant="primary"
                    size="sm"
                    onClick={(e) => onSave(e as unknown as FormEvent<HTMLFormElement>)}
                    disabled={saveBusy || taxonomyRelationsBusy || taxonomyRelationsUnavailable}
                  >
                    {saveBusy ? 'กำลังบันทึก…' : 'บันทึก'}
                  </Button>
                </div>
              </div>

              {/* Editor Form Body */}
              <form id="note-editor-form" className="notes-editor-body" onSubmit={onSave}>
                <input
                  className="notes-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="หัวข้อโน้ต..."
                  aria-label="หัวข้อโน้ต"
                />

                {/* Chips Bar: Custom Category + System Taxonomy + Tags + People */}
                <div className="notes-chips-bar" aria-label="แท็กและหมวดหมู่ของโน้ต">
                  {/* Custom Category Chip */}
                  {activeNoteCustomCatId && activeCustomCat && (
                    <span className="notes-chip notes-chip-custom-cat">
                      <span>📁 {activeCustomCat.name}</span>
                      <button
                        type="button"
                        className="notes-chip-remove"
                        onClick={() => void onNoteCustomCatChange(null)}
                        title="ถอดออกจากหมวดหมู่นี้"
                      >
                        ✕
                      </button>
                    </span>
                  )}

                  {/* System Categories */}
                  {selectedCategoryNames.map((item) => (
                    <span key={`cat-${item.id}`} className="notes-chip notes-chip-cat">
                      <span>🏷️ {item.name}</span>
                      <button
                        type="button"
                        className="notes-chip-remove"
                        onClick={() => onToggleRelation('categories', item.id)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {/* Tags */}
                  {selectedTagNames.map((item) => (
                    <span key={`tag-${item.id}`} className="notes-chip notes-chip-tag">
                      <span>#{item.name}</span>
                      <button
                        type="button"
                        className="notes-chip-remove"
                        onClick={() => onToggleRelation('tags', item.id)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {/* People */}
                  {selectedPeople.map((person) => (
                    <span key={`person-${person.id}`} className="notes-chip notes-chip-person">
                      <span>👤 {person.name}</span>
                      <button
                        type="button"
                        className="notes-chip-remove"
                        onClick={() =>
                          setSelectedPersonIds((cur) => cur.filter((id) => id !== person.id))
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {/* Chip Add Controls */}
                  <div className="chip-picker-wrap" style={{ display: 'inline-flex', gap: '6px' }}>
                    {/* Custom Category Selector */}
                    {customCategories.length > 0 && (
                      <select
                        className="chip-select"
                        value={activeNoteCustomCatId || ''}
                        onChange={(e) => void onNoteCustomCatChange(e.target.value || null)}
                        aria-label="เลือกหมวดหมู่ของฉัน"
                        style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: 'var(--pkh-radius-full)',
                          border: '1px solid var(--pkh-border-subtle)',
                          background: 'var(--pkh-bg-subtle)',
                        }}
                      >
                        <option value="">📁 หมวดหมู่ของฉัน...</option>
                        {customCategories.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.parentId ? '↳ ' : ''}{c.icon} {c.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <Button
                      variant="quiet"
                      size="sm"
                      type="button"
                      onClick={() => setChipPicker(chipPicker === 'categories' ? null : 'categories')}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
                    >
                      + หมวดหมู่
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setPersonPickerOpen(false);
                        setChipPicker(chipPicker === 'tags' ? null : 'tags');
                      }}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
                    >
                      + แท็ก
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setChipPicker(null);
                        setPersonPickerOpen((o) => !o);
                      }}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
                    >
                      + บุคคล
                    </Button>

                    {/* Taxonomy Modal (Centered with Backdrop) */}
                    {chipPicker && (
                      <div className="dialog-backdrop" onClick={() => setChipPicker(null)} style={{ zIndex: 9999 }}>
                        <section
                          className="studio-dialog"
                          role="dialog"
                          aria-modal="true"
                          aria-label={chipPicker === 'categories' ? 'เลือกหมวดหมู่' : 'เลือกแท็ก'}
                          style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '20px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="popover-head" style={{ marginBottom: '12px', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '18px' }}>{chipPicker === 'categories' ? '📁' : '🏷️'}</span>
                              <h3 style={{ margin: 0, fontSize: '16px' }}>{chipPicker === 'categories' ? 'เลือกหมวดหมู่' : 'เลือกแท็ก'}</h3>
                            </div>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label="ปิด"
                              onClick={() => setChipPicker(null)}
                            >
                              ✕
                            </button>
                          </div>

                          {chipPicker === 'categories' && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                              <input
                                type="text"
                                placeholder="พิมพ์ชื่อหมวดหมู่ใหม่..."
                                value={newCategoryInput}
                                onChange={(e) => setNewCategoryInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleCreateCategorySubmit();
                                  }
                                }}
                                disabled={creatingCategory}
                                style={{
                                  flex: 1,
                                  fontSize: '13px',
                                  padding: '7px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--pkh-border-default)',
                                  background: 'var(--pkh-bg-input, #fff)',
                                  color: 'var(--pkh-text-main, #333)',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => void handleCreateCategorySubmit()}
                                disabled={!newCategoryInput.trim() || creatingCategory}
                                style={{ fontSize: '12px', padding: '6px 12px' }}
                              >
                                + เพิ่ม
                              </button>
                            </div>
                          )}

                          {chipPicker === 'tags' && (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                placeholder="พิมพ์ชื่อแท็กใหม่..."
                                value={newTagInput}
                                onChange={(e) => setNewTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleCreateTagSubmit();
                                  }
                                }}
                                disabled={creatingTag}
                                style={{
                                  flex: '1 1 180px',
                                  fontSize: '13px',
                                  padding: '7px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--pkh-border-default)',
                                  background: 'var(--pkh-bg-input, #fff)',
                                  color: 'var(--pkh-text-main, #333)',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => void handleCreateTagSubmit()}
                                disabled={!newTagInput.trim() || creatingTag}
                                style={{ fontSize: '12px', padding: '6px 12px' }}
                              >
                                + เพิ่ม
                              </button>
                              <button
                                type="button"
                                className="button button-quiet"
                                onClick={() => {
                                  setChipPicker(null);
                                  setTagManagerOpen(true);
                                }}
                                title="จัดการแท็กทั้งหมด เลือกสี แก้ไข ลบ"
                                style={{ fontSize: '12px', padding: '6px 10px' }}
                              >
                                🏷️ จัดการแท็ก
                              </button>
                            </div>
                          )}

                          <div
                            className="chip-popover-list"
                            style={{
                              maxHeight: '260px',
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              padding: '2px',
                            }}
                          >
                            {(chipPicker === 'categories' ? categories : tags).length === 0 ? (
                              <p style={{ textAlign: 'center', color: 'var(--pkh-text-muted)', fontSize: '13px', margin: '16px 0' }}>
                                ยังไม่มี{chipPicker === 'categories' ? 'หมวดหมู่' : 'แท็ก'}ในระบบ
                              </p>
                            ) : (
                              (chipPicker === 'categories' ? categories : tags).map((item) => {
                                const isSelected = chipPicker === 'categories'
                                  ? selectedCategoryNames.some((c) => c.id === item.id)
                                  : selectedTagNames.some((t) => t.id === item.id);
                                const tagColor = (item as TaxonomyItem).color || '#3b82f6';
                                return (
                                  <button
                                    key={item.id}
                                    className={`chip-popover-item${isSelected ? ' is-active' : ''}`}
                                    type="button"
                                    onClick={() => onToggleRelation(chipPicker, item.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      border: isSelected ? '1px solid var(--pkh-primary, #10b981)' : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                                      background: isSelected ? 'var(--pkh-primary-light, #ecfdf5)' : 'var(--pkh-bg-surface, #fff)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {chipPicker === 'tags' && (
                                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: tagColor, flexShrink: 0 }} />
                                      )}
                                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400 }}>{item.name}</span>
                                    </div>
                                    <span style={{ fontSize: '12px', color: isSelected ? 'var(--pkh-primary-dark, #047857)' : 'transparent' }}>
                                      ✓
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </section>
                      </div>
                    )}

                    {/* Person Picker Modal (Centered with Backdrop) */}
                    {personPickerOpen && (
                      <div className="dialog-backdrop" onClick={() => setPersonPickerOpen(false)} style={{ zIndex: 9999 }}>
                        <section
                          className="studio-dialog"
                          role="dialog"
                          aria-modal="true"
                          aria-label="เลือกบุคคลที่เกี่ยวข้อง"
                          style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', padding: '20px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="popover-head" style={{ marginBottom: '12px', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '18px' }}>👤</span>
                              <h3 style={{ margin: 0, fontSize: '16px' }}>เลือกบุคคลที่เกี่ยวข้อง</h3>
                            </div>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label="ปิด"
                              onClick={() => setPersonPickerOpen(false)}
                            >
                              ✕
                            </button>
                          </div>
                          <div
                            className="chip-popover-list"
                            style={{
                              maxHeight: '260px',
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              padding: '2px',
                            }}
                          >
                            {people.length === 0 ? (
                              <p style={{ textAlign: 'center', color: 'var(--pkh-text-muted)', fontSize: '13px', margin: '16px 0' }}>
                                ยังไม่มีข้อมูลบุคคลในระบบ
                              </p>
                            ) : (
                              people.map((person) => {
                                const isSelected = selectedPersonIds.includes(person.id);
                                return (
                                  <button
                                    key={person.id}
                                    className={`chip-popover-item${isSelected ? ' is-active' : ''}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPersonIds((cur) =>
                                        cur.includes(person.id)
                                          ? cur.filter((id) => id !== person.id)
                                          : [...cur, person.id]
                                      );
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      border: isSelected ? '1px solid var(--pkh-primary, #10b981)' : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                                      background: isSelected ? 'var(--pkh-primary-light, #ecfdf5)' : 'var(--pkh-bg-surface, #fff)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '16px' }}>👤</span>
                                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400 }}>{person.name}</span>
                                    </div>
                                    <span style={{ fontSize: '12px', color: isSelected ? 'var(--pkh-primary-dark, #047857)' : 'transparent' }}>
                                      ✓
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </section>
                      </div>
                    )}
                  </div>
                </div>

                {taxonomyRelationsUnavailable && (
                  <p className="taxonomy-retry">
                    โหลดความสัมพันธ์ไม่สำเร็จ{' '}
                    {onRetryTaxonomyLoad && (
                      <button className="text-button" type="button" onClick={onRetryTaxonomyLoad}>
                        ลองใหม่
                      </button>
                    )}
                  </p>
                )}
                {taxonomyError && <p className="form-error chip-error" role="alert">{taxonomyError}</p>}
                {taxonomyNotice && <p className="form-notice chip-error" role="status">{taxonomyNotice}</p>}

                {/* Content Editor vs Safe Markdown Viewer */}
                {editorTab === 'edit' ? (
                  <textarea
                    className="notes-content-textarea"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="เริ่มเขียนข้อความ... (รองรับ Markdown: # หัวข้อ, **ตัวหนา**, - รายการ, ```โค้ด```)"
                    aria-label="เนื้อหาโน้ต"
                  />
                ) : (
                  <MarkdownViewer
                    content={content || '*ยังไม่มีเนื้อหาในโน้ตนี้*'}
                    className="notes-preview-box"
                  />
                )}
              </form>
            </>
          ) : (
            <div className="notes-empty-selection">
              <EmptyState
                icon="📝"
                title="เลือกโน้ตเพื่อเริ่มต้น"
                description="เลือกโน้ตจากรายการด้านซ้ายเพื่อเปิดอ่าน/แก้ไข หรือคลิกปุ่มด้านล่างเพื่อสร้างโน้ตใหม่"
                action={
                  <Button
                    variant="primary"
                    onClick={() => {
                      onStartNewNote();
                      setNoteViewMode('editor');
                      setEditorTab('edit');
                    }}
                  >
                    ＋ สร้างโน้ตใหม่
                  </Button>
                }
              />
            </div>
          )}
        </main>
      </div>

      {versionHistoryOpen && activeNote && (
        <NoteVersionHistoryModal
          isOpen={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          note={activeNote}
        onRestored={(restored) => {
          setTitle(restored.title);
          setContent(restored.content);
          setActiveNote(restored);
        }}
      />
      )}

      {shareModalOpen && activeNote && (
        <ShareItemModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          itemType="note"
          itemId={activeNote.id}
          itemTitle={activeNote.title || 'ไม่มีชื่อ'}
        />
      )}

      <TagManagerModal
        isOpen={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        onSelectTag={(t) => onToggleRelation('tags', t.id)}
      />
    </section>
  );
};
