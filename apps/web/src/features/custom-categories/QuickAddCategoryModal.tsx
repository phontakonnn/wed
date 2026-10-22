import React, { type FormEvent } from 'react';
import type {
  Note,
  Task,
  Bookmark,
  StoredFile,
  VaultItem,
  LibraryItem,
  VaultCategory,
  LibraryCategory,
  LibraryStatus,
  CustomCategoryItemsResult,
} from '../../api';
import { VAULT_CATEGORIES, LIBRARY_CATEGORIES, LIBRARY_STATUSES } from '../../lib/constants';
import { formatBytes, taskStatusLabel } from '../../lib/formatters';

export type QuickAddType = 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library' | 'attach';
export type AttachTypeFilter = 'all' | 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library';

export interface QuickAddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomCategoryId: string | null;
  customCategoryData: CustomCategoryItemsResult | null;
  quickAddType: QuickAddType;
  setQuickAddType: (type: QuickAddType) => void;
  attachSearchQuery: string;
  setAttachSearchQuery: (query: string) => void;
  attachTypeFilter: AttachTypeFilter;
  setAttachTypeFilter: (filter: AttachTypeFilter) => void;
  notes: Note[];
  tasks: Task[];
  bookmarks: Bookmark[];
  files: StoredFile[];
  vaultItems: VaultItem[];
  libraryItems: LibraryItem[];
  attachBusyId: string | null;
  onLinkExistingItem: (itemType: string, itemId: string) => Promise<void>;
  quickAddBusy: boolean;
  onQuickAddSubmit: (e: FormEvent) => void;
  catUploadFile: File | null;
  setCatUploadFile: (file: File | null) => void;
  quickAddTitle: string;
  setQuickAddTitle: (title: string) => void;
  quickAddContentOrUrl: string;
  setQuickAddContentOrUrl: (val: string) => void;
  quickAddVaultCategory: VaultCategory;
  setQuickAddVaultCategory: (cat: VaultCategory) => void;
  quickAddVaultKey: string;
  setQuickAddVaultKey: (key: string) => void;
  quickAddVaultLocation: string;
  setQuickAddVaultLocation: (loc: string) => void;
  quickAddVaultExpiry: string;
  setQuickAddVaultExpiry: (exp: string) => void;
  quickAddVaultAmount: string;
  setQuickAddVaultAmount: (amt: string) => void;
  quickAddLibraryCategory: LibraryCategory;
  setQuickAddLibraryCategory: (cat: LibraryCategory) => void;
  quickAddLibraryStatus: LibraryStatus;
  setQuickAddLibraryStatus: (st: LibraryStatus) => void;
  quickAddLibrarySource: string;
  setQuickAddLibrarySource: (src: string) => void;
}

export const QuickAddCategoryModal: React.FC<QuickAddCategoryModalProps> = ({
  isOpen,
  onClose,
  selectedCustomCategoryId,
  customCategoryData,
  quickAddType,
  setQuickAddType,
  attachSearchQuery,
  setAttachSearchQuery,
  attachTypeFilter,
  setAttachTypeFilter,
  notes,
  tasks,
  bookmarks,
  files,
  vaultItems,
  libraryItems,
  attachBusyId,
  onLinkExistingItem,
  quickAddBusy,
  onQuickAddSubmit,
  catUploadFile,
  setCatUploadFile,
  quickAddTitle,
  setQuickAddTitle,
  quickAddContentOrUrl,
  setQuickAddContentOrUrl,
  quickAddVaultCategory,
  setQuickAddVaultCategory,
  quickAddVaultKey,
  setQuickAddVaultKey,
  quickAddVaultLocation,
  setQuickAddVaultLocation,
  quickAddVaultExpiry,
  setQuickAddVaultExpiry,
  quickAddVaultAmount,
  setQuickAddVaultAmount,
  quickAddLibraryCategory,
  setQuickAddLibraryCategory,
  quickAddLibraryStatus,
  setQuickAddLibraryStatus,
  quickAddLibrarySource,
  setQuickAddLibrarySource,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !quickAddBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, quickAddBusy, onClose]);

  if (!isOpen || !selectedCustomCategoryId) return null;

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !quickAddBusy) {
          if (quickAddTitle.trim()) {
            if (window.confirm('คุณต้องการปิดหน้าต่างนี้โดยไม่บันทึกข้อมูลหรือไม่?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }
      }}
    >
      <section
        className="dialog"
        style={{ maxWidth: '680px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-cat-title"
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">{customCategoryData?.category.name}</span>
            <h2 id="quick-add-cat-title">＋ เพิ่มข้อมูลในหมวดนี้</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิด"
            disabled={quickAddBusy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Type selector tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '12px 0 16px' }}>
          <button
            className={`button ${quickAddType === 'note' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('note')}
          >
            📝 โน้ต
          </button>
          <button
            className={`button ${quickAddType === 'task' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('task')}
          >
            ✅ งาน
          </button>
          <button
            className={`button ${quickAddType === 'bookmark' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('bookmark')}
          >
            🔖 ลิงก์
          </button>
          <button
            className={`button ${quickAddType === 'file' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('file')}
          >
            🗂️ อัปโหลดไฟล์
          </button>
          <button
            className={`button ${quickAddType === 'vault' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('vault')}
          >
            🔐 คลังสำคัญ
          </button>
          <button
            className={`button ${quickAddType === 'library' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('library')}
          >
            📚 คู่มือ
          </button>
          <button
            className={`button ${quickAddType === 'attach' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => setQuickAddType('attach')}
          >
            🔗 ข้อมูลเดิม
          </button>
        </div>

        {/* Tab: Attach Existing Items */}
        {quickAddType === 'attach' ? (
          <div className="attach-existing-container">
            <input
              type="search"
              placeholder="ค้นหาข้อมูลที่มีอยู่แล้ว..."
              value={attachSearchQuery}
              onChange={(e) => setAttachSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
            <div className="attach-existing-filters">
              {(['all', 'note', 'task', 'bookmark', 'file', 'vault', 'library'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`button ${attachTypeFilter === filter ? 'button-primary' : 'button-quiet'}`}
                  onClick={() => setAttachTypeFilter(filter)}
                >
                  {filter === 'all' ? 'ทั้งหมด' : filter === 'note' ? '📝 โน้ต' : filter === 'task' ? '✅ งาน' : filter === 'bookmark' ? '🔖 ลิงก์' : filter === 'file' ? '🗂️ ไฟล์' : filter === 'vault' ? '🔐 คลังสำคัญ' : '📚 คู่มือ'}
                </button>
              ))}
            </div>
            <div className="attach-existing-list">
              {(() => {
                const query = attachSearchQuery.trim().toLowerCase();
                const candidates: Array<{ itemType: 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library'; id: string; title: string; subtitle: string }> = [];

                if (attachTypeFilter === 'all' || attachTypeFilter === 'note') {
                  notes.forEach((n) => {
                    if (!query || n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)) {
                      candidates.push({ itemType: 'note', id: n.id, title: n.title, subtitle: 'โน้ต' });
                    }
                  });
                }
                if (attachTypeFilter === 'all' || attachTypeFilter === 'task') {
                  tasks.forEach((t) => {
                    if (!query || t.title.toLowerCase().includes(query) || (t.detail && t.detail.toLowerCase().includes(query))) {
                      candidates.push({ itemType: 'task', id: t.id, title: t.title, subtitle: `งาน (${taskStatusLabel(t.status)})` });
                    }
                  });
                }
                if (attachTypeFilter === 'all' || attachTypeFilter === 'bookmark') {
                  bookmarks.forEach((b) => {
                    if (!query || b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) {
                      candidates.push({ itemType: 'bookmark', id: b.id, title: b.title, subtitle: b.url });
                    }
                  });
                }
                if (attachTypeFilter === 'all' || attachTypeFilter === 'file') {
                  files.forEach((f) => {
                    if (!query || f.displayName.toLowerCase().includes(query) || f.mediaType.toLowerCase().includes(query)) {
                      candidates.push({ itemType: 'file', id: f.id, title: f.displayName, subtitle: `${formatBytes(f.sizeBytes)} · ${f.mediaType}` });
                    }
                  });
                }
                if (attachTypeFilter === 'all' || attachTypeFilter === 'vault') {
                  vaultItems.forEach((v) => {
                    if (!query || v.title.toLowerCase().includes(query) || v.keyValue.toLowerCase().includes(query)) {
                      candidates.push({ itemType: 'vault', id: v.id, title: v.title, subtitle: `คลังสำคัญ: ${v.category}` });
                    }
                  });
                }
                if (attachTypeFilter === 'all' || attachTypeFilter === 'library') {
                  libraryItems.forEach((l) => {
                    if (!query || l.title.toLowerCase().includes(query) || (l.sourceUrlOrAuthor && l.sourceUrlOrAuthor.toLowerCase().includes(query))) {
                      candidates.push({ itemType: 'library', id: l.id, title: l.title, subtitle: `ห้องสมุด: ${l.category}` });
                    }
                  });
                }

                if (candidates.length === 0) {
                  return <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>ไม่พบข้อมูลที่ตรงกับคำค้นหา</p>;
                }

                const isLinked = (type: string, id: string) => {
                  if (!customCategoryData) return false;
                  if (type === 'note') return customCategoryData.notes.some((x) => x.id === id);
                  if (type === 'task') return customCategoryData.tasks.some((x) => x.id === id);
                  if (type === 'bookmark') return customCategoryData.bookmarks.some((x) => x.id === id);
                  if (type === 'file') return customCategoryData.files.some((x) => x.id === id);
                  if (type === 'vault') return customCategoryData.vault.some((x) => x.id === id);
                  if (type === 'library') return customCategoryData.library.some((x) => x.id === id);
                  return false;
                };

                return candidates.slice(0, 50).map((cand) => {
                  const linked = isLinked(cand.itemType, cand.id);
                  const key = `${cand.itemType}:${cand.id}`;
                  const busy = attachBusyId === key;
                  return (
                    <div key={key} className="attach-item-row">
                      <div className="attach-item-info">
                        <strong>{cand.title}</strong>
                        <span>{cand.subtitle}</span>
                      </div>
                      {linked ? (
                        <span style={{ fontSize: '12px', color: 'var(--accent, #38a169)', fontWeight: 600 }}>ผูกอยู่แล้ว ✓</span>
                      ) : (
                        <button
                          className="button button-quiet"
                          type="button"
                          disabled={busy}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          onClick={() => void onLinkExistingItem(cand.itemType, cand.id)}
                        >
                          {busy ? 'กำลังผูก…' : '＋ ผูกเข้าหมวดนี้'}
                        </button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="editor-actions" style={{ marginTop: '12px' }}>
              <button className="button button-quiet" type="button" onClick={onClose}>
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onQuickAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Form fields based on quickAddType */}
            {quickAddType === 'file' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label>
                  เลือกไฟล์ (รูปภาพ, วิดีโอขนาดใหญ่ MP4/MOV/WebM, เสียง MP3/WAV, PDF, เอกสาร)
                  <input
                    required
                    type="file"
                    onChange={(e) => setCatUploadFile(e.target.files?.[0] || null)}
                    style={{ marginTop: '6px' }}
                  />
                </label>
                {catUploadFile && (
                  <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '13px' }}>
                    <div><strong>ชื่อไฟล์:</strong> {catUploadFile.name}</div>
                    <div><strong>ขนาด:</strong> {formatBytes(catUploadFile.size)}</div>
                    <div><strong>ชนิดไฟล์:</strong> {catUploadFile.type || 'ไม่ระบุ'}</div>
                  </div>
                )}
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  ⚡ ไฟล์ขนาดใหญ่จะถูกบันทึกตรงลงดิสก์และสตรีมมิ่งผ่าน HTTP Range Requests รองรับการเปิดดูและกรอวิดีโอ (Seek) ได้ทันทีโดยไม่เปลืองหน่วยความจำ
                </p>
              </div>
            ) : quickAddType === 'vault' ? (
              <>
                <label>
                  ชื่อรายการทรัพย์สิน / เอกสารสำคัญ
                  <input
                    required
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder="เช่น กรมธรรม์ประกันสุขภาพ, โฉนดที่ดิน, สัญญาเช่า"
                    autoFocus
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label>
                    หมวดหมู่คลัง
                    <select
                      value={quickAddVaultCategory}
                      onChange={(e) => setQuickAddVaultCategory(e.target.value as VaultCategory)}
                    >
                      {VAULT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    รหัส / เลขสำคัญ
                    <input
                      type="text"
                      value={quickAddVaultKey}
                      onChange={(e) => setQuickAddVaultKey(e.target.value)}
                      placeholder="เลขกรมธรรม์, Serial..."
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label>
                    สถานที่เก็บตัวจริง
                    <input
                      type="text"
                      value={quickAddVaultLocation}
                      onChange={(e) => setQuickAddVaultLocation(e.target.value)}
                      placeholder="เช่น ตู้เซฟห้องนอน..."
                    />
                  </label>
                  <label>
                    วันหมดอายุ / ต่ออายุ
                    <input
                      type="date"
                      value={quickAddVaultExpiry}
                      onChange={(e) => setQuickAddVaultExpiry(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  ยอดเงิน / ค่าใช้จ่าย (ถ้ามี)
                  <input
                    type="text"
                    value={quickAddVaultAmount}
                    onChange={(e) => setQuickAddVaultAmount(e.target.value)}
                    placeholder="เช่น 15,000 บาท/ปี"
                  />
                </label>
                <label>
                  บันทึกเพิ่มเติม
                  <textarea
                    rows={2}
                    value={quickAddContentOrUrl}
                    onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                    placeholder="เงื่อนไขหรือรายละเอียดเพิ่มเติม..."
                  />
                </label>
              </>
            ) : quickAddType === 'library' ? (
              <>
                <label>
                  ชื่อเรื่อง / ชื่อคู่มือ
                  <input
                    required
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder="เช่น คู่มือการใช้งานระบบ, สรุปหนังสือ Deep Work"
                    autoFocus
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label>
                    หมวดหมู่ห้องสมุด
                    <select
                      value={quickAddLibraryCategory}
                      onChange={(e) => setQuickAddLibraryCategory(e.target.value as LibraryCategory)}
                    >
                      {LIBRARY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    สถานะ
                    <select
                      value={quickAddLibraryStatus}
                      onChange={(e) => setQuickAddLibraryStatus(e.target.value as LibraryStatus)}
                    >
                      {LIBRARY_STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  แหล่งที่มา / ผู้แต่ง
                  <input
                    type="text"
                    value={quickAddLibrarySource}
                    onChange={(e) => setQuickAddLibrarySource(e.target.value)}
                    placeholder="ลิงก์ URL หรือชื่อผู้เขียน..."
                  />
                </label>
                <label>
                  แก่นสำคัญ / สาระที่ต้องจำ (Key Takeaways)
                  <textarea
                    rows={3}
                    value={quickAddContentOrUrl}
                    onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                    placeholder="สิ่งที่ได้เรียนรู้หรือขั้นตอนสำคัญ..."
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  {quickAddType === 'note' ? 'หัวข้อโน้ต' : quickAddType === 'task' ? 'ชื่องาน' : 'ชื่อลิงก์ / เว็บไซต์'}
                  <input
                    required
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder={quickAddType === 'note' ? 'หัวข้อโน้ต...' : quickAddType === 'task' ? 'สิ่งที่ต้องทำ...' : 'ชื่อเว็บไซต์...'}
                    autoFocus
                  />
                </label>

                {quickAddType === 'note' && (
                  <label>
                    เนื้อหาโน้ต
                    <textarea
                      rows={4}
                      value={quickAddContentOrUrl}
                      onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                      placeholder="เขียนเนื้อหาหรือรายละเอียด..."
                    />
                  </label>
                )}

                {quickAddType === 'task' && (
                  <label>
                    รายละเอียดงาน (เพิ่มเติม)
                    <textarea
                      rows={3}
                      value={quickAddContentOrUrl}
                      onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                      placeholder="รายละเอียดเพิ่มเติมของงานนี้..."
                    />
                  </label>
                )}

                {quickAddType === 'bookmark' && (
                  <label>
                    URL ลิงก์
                    <input
                      required
                      type="url"
                      value={quickAddContentOrUrl}
                      onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </label>
                )}
              </>
            )}

            <div className="editor-actions" style={{ marginTop: '8px' }}>
              <button
                className="button button-quiet"
                type="button"
                disabled={quickAddBusy}
                onClick={onClose}
              >
                ยกเลิก
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={quickAddBusy}
              >
                {quickAddBusy ? 'กำลังบันทึก…' : 'เพิ่มลงในหมวดหมู่'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
