import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchUniversalTrash,
  restoreTrashItem,
  permanentDeleteTrashItem,
  bulkRestoreTrash,
  bulkPermanentDeleteTrash,
  type TrashItem,
  type Note,
} from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';

export interface TrashViewProps {
  viewMode?: 'all' | 'trash';
  listTotal?: number;
  activeTrashNote?: Note | null;
  setActiveTrashNote?: (note: Note | null) => void;
  onRestore?: () => void;
  saveBusy?: boolean;
  onOpenPermanentDelete?: (note?: Note) => void;
  notesError?: string;
  notice?: string;
  filteredNotes?: Note[];
  onRestoreNoteItem?: (note: Note) => Promise<void>;
  onRefreshWorkspace?: () => void;
}

const CATEGORY_TABS = [
  { key: 'all', label: 'ทั้งหมด', icon: '🗑️' },
  { key: 'note', label: 'โน้ต', icon: '📝' },
  { key: 'task', label: 'งาน', icon: '✅' },
  { key: 'project', label: 'โปรเจกต์', icon: '📁' },
  { key: 'goal', label: 'เป้าหมาย', icon: '🎯' },
  { key: 'person', label: 'บุคคล', icon: '👤' },
  { key: 'file', label: 'ไฟล์', icon: '📎' },
  { key: 'bookmark', label: 'บุ๊กมาร์ก', icon: '🔖' },
  { key: 'vault', label: 'คลังสำคัญ', icon: '🔐' },
  { key: 'library', label: 'ห้องสมุด', icon: '📚' },
  { key: 'watchlist', label: 'หนัง', icon: '🎬' },
  { key: 'shopping', label: 'ของซื้อ', icon: '🛒' },
  { key: 'travel', label: 'ที่เที่ยว', icon: '✈️' },
  { key: 'custom_record', label: 'ข้อมูลกำหนดเอง', icon: '🧩' },
];

const ITEM_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  note: { label: 'โน้ต', icon: '📝' },
  task: { label: 'งาน', icon: '✅' },
  project: { label: 'โปรเจกต์', icon: '📁' },
  goal: { label: 'เป้าหมาย', icon: '🎯' },
  person: { label: 'บุคคลสำคัญ', icon: '👤' },
  file: { label: 'ไฟล์', icon: '📎' },
  bookmark: { label: 'บุ๊กมาร์ก', icon: '🔖' },
  vault: { label: 'คลังสำคัญ', icon: '🔐' },
  library: { label: 'ห้องสมุด', icon: '📚' },
  watchlist: { label: 'หนังที่อยากดู', icon: '🎬' },
  shopping: { label: 'ของต้องซื้อ', icon: '🛒' },
  travel: { label: 'ที่เที่ยว', icon: '✈️' },
  custom_record: { label: 'ข้อมูลกำหนดเอง', icon: '🧩' },
};

export const TrashView: React.FC<TrashViewProps> = ({
  viewMode = 'trash',
  onRefreshWorkspace,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Bulk selection: set of "itemType:id" keys
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Permanent delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState<boolean>(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchUniversalTrash({
        itemType: selectedCategory,
        search: searchQuery.trim() || undefined,
        pageSize: 200,
      });
      setItems(res.items || []);
    } catch (err: unknown) {
      setFeedbackNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลในถังขยะได้',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTrash();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadTrash]);

  // Sorted items
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortOrder === 'newest') return b.deletedAt - a.deletedAt;
      return a.deletedAt - b.deletedAt;
    });
  }, [items, sortOrder]);

  const toggleSelectAll = () => {
    if (selectedKeys.size === sortedItems.length && sortedItems.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(sortedItems.map((item) => `${item.itemType}:${item.id}`)));
    }
  };

  const toggleItemSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSingleRestore = async (item: TrashItem) => {
    setActionBusy(true);
    setFeedbackNotice(null);
    try {
      await restoreTrashItem(item.itemType, item.id);
      setFeedbackNotice({ type: 'success', message: `กู้คืน "${item.title || 'รายการ'}" เรียบร้อยแล้ว` });
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(`${item.itemType}:${item.id}`);
        return next;
      });
      await loadTrash();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setFeedbackNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถกู้คืนรายการได้',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedKeys.size === 0) return;
    setActionBusy(true);
    setFeedbackNotice(null);
    const toRestore = Array.from(selectedKeys).map((key) => {
      const [itemType, id] = key.split(':');
      return { itemType, id };
    });
    try {
      const res = await bulkRestoreTrash(toRestore);
      setFeedbackNotice({ type: 'success', message: `กู้คืนข้อมูลทั้งหมด ${res.restored} รายการเรียบร้อยแล้ว` });
      setSelectedKeys(new Set());
      await loadTrash();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setFeedbackNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถกู้คืนข้อมูลได้',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const confirmPermanentDelete = async () => {
    setActionBusy(true);
    try {
      if (isBulkDelete) {
        const toDelete = Array.from(selectedKeys).map((key) => {
          const [itemType, id] = key.split(':');
          return { itemType, id };
        });
        const res = await bulkPermanentDeleteTrash(toDelete);
        setFeedbackNotice({ type: 'success', message: `ลบข้อมูลถาวรทั้งหมด ${res.deleted} รายการแล้ว` });
        setSelectedKeys(new Set());
      } else if (itemToDelete) {
        await permanentDeleteTrashItem(itemToDelete.itemType, itemToDelete.id);
        setFeedbackNotice({ type: 'success', message: `ลบ "${itemToDelete.title || 'รายการ'}" ถาวรเรียบร้อยแล้ว` });
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          next.delete(`${itemToDelete.itemType}:${itemToDelete.id}`);
          return next;
        });
      }
      setDeleteModalOpen(false);
      setItemToDelete(null);
      await loadTrash();
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setFeedbackNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลถาวรได้',
      });
    } finally {
      setActionBusy(false);
    }
  };

  if (viewMode === 'all') {
    return (
      <section className="life-view-container" aria-label="ภาพรวมทั้งหมด">
        <EmptyState
          icon="📋"
          title="เลือกรายการจากมุมมองทั้งหมด"
          description="โน้ต งาน ลิงก์ และไฟล์จะเปิดในมุมมองเฉพาะของแต่ละประเภท"
        />
      </section>
    );
  }

  return (
    <section className="life-view-container" aria-label="จัดการข้อมูลในถังขยะ">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🗑️</div>
        <div className="banner-info">
          <span className="eyebrow">Universal Trash &amp; Safe Retention</span>
          <h2 className="banner-title">ถังขยะกลาง (Universal Trash)</h2>
          <p className="banner-subtitle">
            รวมรายการที่ถูกลบจากทุกโมดูลในระบบ ({items.length} รายการ) · ปลอดภัย ไม่ลบข้อมูลเองอัตโนมัติ คุณสามารถกู้คืนหรือลบถาวรได้ทุกเมื่อ
          </p>
        </div>
      </div>

      {feedbackNotice && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: feedbackNotice.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: feedbackNotice.type === 'success' ? '#16a34a' : '#dc2626',
            border: `1px solid ${feedbackNotice.type === 'success' ? '#22c55e' : '#ef4444'}`,
          }}
        >
          <span>{feedbackNotice.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{feedbackNotice.message}</span>
          <button
            onClick={() => setFeedbackNotice(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            aria-label="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {/* Category Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            borderBottom: '1px solid var(--pkh-border-subtle)',
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const active = selectedCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedCategory(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: active ? '1px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
                  background: active ? 'var(--pkh-primary)' : 'var(--pkh-bg-surface)',
                  color: active ? '#ffffff' : 'var(--pkh-text-secondary)',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search, Sort, and Bulk Operations Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
            <Input
              type="text"
              placeholder="🔍 ค้นหารายการในถังขยะตามชื่อหรือรายละเอียด..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>เรียงตาม:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--pkh-border-subtle)',
                backgroundColor: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
                fontSize: '12px',
              }}
            >
              <option value="newest">วันที่ลบล่าสุด (ใหม่ → เก่า)</option>
              <option value="oldest">วันที่ลบแรกเริ่ม (เก่า → ใหม่)</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Header */}
        {sortedItems.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: 'var(--pkh-bg-surface-secondary, rgba(255,255,255,0.05))',
              borderRadius: '8px',
              border: '1px solid var(--pkh-border-subtle)',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={selectedKeys.size === sortedItems.length && sortedItems.length > 0}
                onChange={toggleSelectAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>
                เลือกทั้งหมด ({selectedKeys.size}/{sortedItems.length} รายการ)
              </span>
            </label>

            {selectedKeys.size > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkRestore}
                  disabled={actionBusy}
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  ✓ กู้คืนที่เลือก ({selectedKeys.size})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setIsBulkDelete(true);
                    setItemToDelete(null);
                    setDeleteModalOpen(true);
                  }}
                  disabled={actionBusy}
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  🗑️ ลบถาวรที่เลือก ({selectedKeys.size})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
          กำลังโหลดข้อมูลในถังขยะ...
        </div>
      ) : sortedItems.length === 0 ? (
        <EmptyState
          icon="🗑️"
          title="ไม่มีข้อมูลในถังขยะ"
          description={
            searchQuery || selectedCategory !== 'all'
              ? 'ไม่พบข้อมูลที่ตรงกับตัวกรองที่เลือก'
              : 'ถังขยะว่างเปล่า ข้อมูลทั้งหมดของคุณปลอดภัย'
          }
        />
      ) : (
        <div className="life-bento-grid">
          {sortedItems.map((item) => {
            const key = `${item.itemType}:${item.id}`;
            const isSelected = selectedKeys.has(key);
            const typeMeta = ITEM_TYPE_LABELS[item.itemType] || { label: item.itemType, icon: '📄' };

            return (
              <article
                key={key}
                className="life-card"
                style={{
                  position: 'relative',
                  border: isSelected ? '1px solid var(--pkh-primary)' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(key)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        aria-label={`เลือก ${item.title}`}
                      />
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.08))',
                          color: 'var(--pkh-text-secondary)',
                          border: '1px solid var(--pkh-border-subtle)',
                        }}
                      >
                        <span>{item.icon || typeMeta.icon}</span>
                        <span>{typeMeta.label}</span>
                      </span>
                    </div>

                    <time style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', whiteSpace: 'nowrap' }}>
                      ลบเมื่อ {formatDate(item.deletedAt)}
                    </time>
                  </div>

                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--pkh-text-primary)',
                      margin: '4px 0 6px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.title || '(ไม่มีหัวข้อ)'}
                  </h3>

                  {item.subtitle && (
                    <p
                      style={{
                        margin: '0 0 12px',
                        fontSize: '12px',
                        color: 'var(--pkh-text-secondary)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                      }}
                    >
                      {item.subtitle}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '8px',
                    paddingTop: '10px',
                    marginTop: '10px',
                    borderTop: '1px solid var(--pkh-border-subtle)',
                  }}
                >
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ padding: '2px 10px', height: '26px', fontSize: '11px' }}
                    onClick={() => void handleSingleRestore(item)}
                    disabled={actionBusy}
                  >
                    ✓ กู้คืน
                  </Button>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    style={{ padding: '2px 10px', height: '26px', fontSize: '11px' }}
                    onClick={() => {
                      setItemToDelete(item);
                      setIsBulkDelete(false);
                      setDeleteModalOpen(true);
                    }}
                    disabled={actionBusy}
                  >
                    ลบถาวร
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!actionBusy) {
            setDeleteModalOpen(false);
            setItemToDelete(null);
          }
        }}
        title="⚠️ ยืนยันการลบข้อมูลถาวร"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <strong>คำเตือน:</strong> ข้อมูลที่ถูกลบถาวรจะไม่สามารถกู้คืนกลับมาได้อีก รวมทั้งไฟล์แนบและความสัมพันธ์ทั้งหมดจะถูกลบออกจากฐานข้อมูลอย่างสมบูรณ์
          </div>

          <p style={{ fontSize: '14px', color: 'var(--pkh-text-primary)', margin: 0 }}>
            {isBulkDelete
              ? `คุณต้องการลบข้อมูลที่เลือกทั้งหมด ${selectedKeys.size} รายการถาวรใช่หรือไม่?`
              : `คุณต้องการลบ "${itemToDelete?.title || 'รายการนี้'}" ถาวรใช่หรือไม่?`}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button
              variant="quiet"
              onClick={() => {
                setDeleteModalOpen(false);
                setItemToDelete(null);
              }}
              disabled={actionBusy}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={confirmPermanentDelete}
              disabled={actionBusy}
            >
              {actionBusy ? 'กำลังลบ…' : 'ยืนยันลบถาวร'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
};
