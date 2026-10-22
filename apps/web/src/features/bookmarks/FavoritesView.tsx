import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type Favorite,
  type FavoriteItemType,
  type FavoriteCollection,
  fetchFavoriteCollections,
  createFavoriteCollection,
  updateFavoriteCollection,
  deleteFavoriteCollection,
  setFavoriteCollection,
  listFavorites,
  removeFavorite,
} from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';

export interface FavoritesViewProps {
  favorites?: Favorite[];
  activeFavorite?: Favorite | null;
  setActiveFavorite?: (fav: Favorite | null) => void;
  onOpenFavorite: (fav: Favorite) => Promise<void> | void;
  onToggleFavorite?: (itemType: FavoriteItemType, itemId: string, current: boolean) => Promise<void>;
  favoriteBusy?: boolean;
  notesError?: string;
  notice?: string;
  viewTitle?: string;
  listLength?: number;
  allEntries?: unknown[];
  onSelectAllEntry?: (entry: unknown) => void;
  onRefreshWorkspace?: () => void;
}

const CATEGORY_TABS: Array<{ id: string; label: string; icon: string; types?: string[] }> = [
  { id: 'all', label: 'ทั้งหมด', icon: '⭐' },
  { id: 'notes', label: 'โน้ต', icon: '📝', types: ['note'] },
  { id: 'tasks_projects', label: 'งาน & โปรเจกต์ & เป้าหมาย', icon: '✅', types: ['task', 'project', 'goal'] },
  { id: 'knowledge', label: 'คลังสำคัญ & ห้องสมุด', icon: '🔐', types: ['vault', 'library'] },
  { id: 'lifestyle', label: 'ไลฟ์สไตล์ & บุคคล', icon: '🎬', types: ['watchlist', 'shopping', 'travel', 'person'] },
  { id: 'media', label: 'ลิงก์ & ไฟล์', icon: '🔖', types: ['bookmark', 'file'] },
  { id: 'custom', label: 'ข้อมูลกำหนดเอง', icon: '🧩', types: ['custom_record'] },
];

const ITEM_TYPE_BADGES: Record<string, { label: string; icon: string }> = {
  note: { label: 'โน้ต', icon: '📝' },
  bookmark: { label: 'บุ๊กมาร์ก', icon: '🔖' },
  task: { label: 'งาน', icon: '✅' },
  project: { label: 'โปรเจกต์', icon: '🚀' },
  goal: { label: 'เป้าหมาย', icon: '🎯' },
  person: { label: 'บุคคล', icon: '👥' },
  file: { label: 'ไฟล์', icon: '🗂️' },
  vault: { label: 'คลังสำคัญ', icon: '🔐' },
  library: { label: 'ห้องสมุด', icon: '📚' },
  watchlist: { label: 'หนัง', icon: '🎬' },
  shopping: { label: 'ของซื้อ', icon: '🛒' },
  travel: { label: 'ที่เที่ยว', icon: '✈️' },
  custom_record: { label: 'ข้อมูลกำหนดเอง', icon: '🧩' },
};

const PRESET_COLLECTION_ICONS = ['📁', '🇯🇵', '💼', '🏡', '🎒', '💡', '💰', '🎯', '🚀', '⭐'];
const PRESET_COLLECTION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  onOpenFavorite,
  onRefreshWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [favoritesList, setFavoritesList] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [noticeMsg, setNoticeMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Collection modal state
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<FavoriteCollection | null>(null);
  const [colName, setColName] = useState('');
  const [colIcon, setColIcon] = useState('📁');
  const [colColor, setColColor] = useState('#3b82f6');
  const [colBusy, setColBusy] = useState(false);
  const [colError, setColError] = useState<string | null>(null);

  // Assign collection modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [itemToAssign, setItemToAssign] = useState<Favorite | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [assignBusy, setAssignBusy] = useState(false);

  // Load collections
  const loadCollections = useCallback(async () => {
    try {
      const cols = await fetchFavoriteCollections();
      setCollections(cols);
    } catch {
      // ignore
    }
  }, []);

  // Load favorites
  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFavorites(1, 300, selectedCollectionId || undefined);
      setFavoritesList(res.favorites || []);
    } catch (err: unknown) {
      setNoticeMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดรายการโปรดได้',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCollectionId]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFavorites();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadFavorites]);

  // Filtered favorites by category tab and search query
  const filteredFavorites = useMemo(() => {
    let result = favoritesList;

    // Filter by tab
    if (activeTab !== 'all') {
      const tabDef = CATEGORY_TABS.find((t) => t.id === activeTab);
      if (tabDef?.types) {
        result = result.filter((item) => tabDef.types?.includes(item.itemType));
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.subtitle || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [favoritesList, activeTab, searchQuery]);

  // Remove from favorites
  const handleRemoveFavorite = async (fav: Favorite) => {
    try {
      await removeFavorite(fav.itemType, fav.itemId);
      setFavoritesList((prev) => prev.filter((item) => !(item.itemType === fav.itemType && item.itemId === fav.itemId)));
      setNoticeMsg({ type: 'success', message: `นำ "${fav.title}" ออกจากรายการโปรดแล้ว` });
      onRefreshWorkspace?.();
    } catch (err: unknown) {
      setNoticeMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถนำออกจากรายการโปรดได้',
      });
    }
  };

  // Open collection creation modal
  const handleOpenCreateCollection = () => {
    setEditingCollection(null);
    setColName('');
    setColIcon('📁');
    setColColor('#3b82f6');
    setColError(null);
    setCollectionModalOpen(true);
  };

  // Open collection edit modal
  const handleOpenEditCollection = (col: FavoriteCollection, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCollection(col);
    setColName(col.name);
    setColIcon(col.icon || '📁');
    setColColor(col.color || '#3b82f6');
    setColError(null);
    setCollectionModalOpen(true);
  };

  // Save collection (create or update)
  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colName.trim()) {
      setColError('กรุณากรอกชื่อคอลเลกชัน');
      return;
    }
    setColBusy(true);
    setColError(null);
    try {
      if (editingCollection) {
        await updateFavoriteCollection(editingCollection.id, {
          name: colName.trim(),
          icon: colIcon,
          color: colColor,
        });
        setNoticeMsg({ type: 'success', message: 'แก้ไขคอลเลกชันเรียบร้อยแล้ว' });
      } else {
        await createFavoriteCollection({
          name: colName.trim(),
          icon: colIcon,
          color: colColor,
        });
        setNoticeMsg({ type: 'success', message: 'สร้างคอลเลกชันใหม่เรียบร้อยแล้ว' });
      }
      setCollectionModalOpen(false);
      await loadCollections();
      await loadFavorites();
    } catch (err: unknown) {
      setColError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกคอลเลกชันได้');
    } finally {
      setColBusy(false);
    }
  };

  // Delete collection
  const handleDeleteCollection = async (col: FavoriteCollection, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`ต้องการลบคอลเลกชัน "${col.name}" ใช่หรือไม่? (รายการโปรดภายในจะไม่ถูกลบ)`)) return;
    try {
      await deleteFavoriteCollection(col.id);
      if (selectedCollectionId === col.id) {
        setSelectedCollectionId(null);
      }
      setNoticeMsg({ type: 'success', message: `ลบคอลเลกชัน "${col.name}" เรียบร้อยแล้ว` });
      await loadCollections();
      await loadFavorites();
    } catch (err: unknown) {
      setNoticeMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถลบคอลเลกชันได้',
      });
    }
  };

  // Assign to collection
  const handleOpenAssignModal = (fav: Favorite, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToAssign(fav);
    setTargetCollectionId(fav.collectionId || '');
    setAssignModalOpen(true);
  };

  const handleSaveAssignCollection = async () => {
    if (!itemToAssign) return;
    setAssignBusy(true);
    try {
      await setFavoriteCollection(
        itemToAssign.itemType,
        itemToAssign.itemId,
        targetCollectionId || null
      );
      setNoticeMsg({ type: 'success', message: 'จัดเก็บเข้าคอลเลกชันเรียบร้อยแล้ว' });
      setAssignModalOpen(false);
      setItemToAssign(null);
      await loadFavorites();
    } catch (err: unknown) {
      setNoticeMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถจัดเก็บเข้าคอลเลกชันได้',
      });
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <section className="life-view-container" aria-label="ศูนย์รวมรายการโปรด & คอลเลกชัน">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">⭐</div>
        <div className="banner-info">
          <span className="eyebrow">Favorites &amp; Collections Center</span>
          <h2 className="banner-title">รายการโปรด &amp; คอลเลกชัน</h2>
          <p className="banner-subtitle">
            รวมรายการสำคัญที่ติดดาวไว้จากทุกโมดูล ({favoritesList.length} รายการ) พร้อมระบบโฟลเดอร์คอลเลกชันจัดกลุ่มตามเป้าหมาย
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={handleOpenCreateCollection}>
            ＋ สร้างคอลเลกชันใหม่
          </Button>
        </div>
      </div>

      {noticeMsg && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: noticeMsg.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: noticeMsg.type === 'success' ? '#16a34a' : '#dc2626',
            border: `1px solid ${noticeMsg.type === 'success' ? '#22c55e' : '#ef4444'}`,
          }}
        >
          <span>{noticeMsg.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{noticeMsg.message}</span>
          <button
            onClick={() => setNoticeMsg(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Favorite Collections Folders Bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-muted)' }}>
            📁 คอลเลกชันของฉัน ({collections.length})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            type="button"
            onClick={() => setSelectedCollectionId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              border: selectedCollectionId === null ? '1px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
              backgroundColor: selectedCollectionId === null ? 'var(--pkh-primary)' : 'var(--pkh-bg-surface)',
              color: selectedCollectionId === null ? '#ffffff' : 'var(--pkh-text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span>⭐ ทั้งหมด</span>
          </button>

          {collections.map((col) => {
            const active = selectedCollectionId === col.id;
            return (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '20px',
                  border: active ? `2px solid ${col.color || 'var(--pkh-primary)'}` : '1px solid var(--pkh-border-subtle)',
                  backgroundColor: active ? 'var(--pkh-bg-subtle, rgba(255,255,255,0.08))' : 'var(--pkh-bg-surface)',
                  padding: '2px 8px 2px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setSelectedCollectionId(col.id)}
              >
                <span>{col.icon || '📁'}</span>
                <span style={{ fontSize: '13px', fontWeight: active ? 600 : 400, color: 'var(--pkh-text-primary)' }}>
                  {col.name}
                </span>
                <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditCollection(col, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--pkh-text-muted)', padding: '2px' }}
                    title="แก้ไขคอลเลกชัน"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteCollection(col, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#ef4444', padding: '2px' }}
                    title="ลบคอลเลกชัน"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '4px' }}>
          {CATEGORY_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: 'none',
                  background: active ? 'var(--pkh-bg-subtle, rgba(255,255,255,0.1))' : 'none',
                  color: active ? 'var(--pkh-primary)' : 'var(--pkh-text-secondary)',
                  fontWeight: active ? 600 : 400,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          <Input
            type="text"
            placeholder="🔍 ค้นหารายการโปรดตามชื่อหรือรายละเอียด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content: Favorites Grid */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
          กำลังโหลดรายการโปรด...
        </div>
      ) : filteredFavorites.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="ไม่มีรายการโปรดในหมวดนี้"
          description="กดไอคอนรูปดาว (★) บนรายการใดก็ได้ในระบบเพื่อปักหมุดไว้ที่นี่"
        />
      ) : (
        <div className="life-bento-grid">
          {filteredFavorites.map((fav) => {
            const badgeMeta = ITEM_TYPE_BADGES[fav.itemType] || { label: fav.itemType, icon: '📄' };

            return (
              <article
                key={`${fav.itemType}-${fav.itemId}`}
                className="life-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => void onOpenFavorite(fav)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                        <span>{badgeMeta.icon}</span>
                        <span>{badgeMeta.label}</span>
                      </span>

                      {fav.collectionName && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: fav.collectionColor ? `${fav.collectionColor}22` : 'rgba(59,130,246,0.15)',
                            color: fav.collectionColor || '#3b82f6',
                            border: `1px solid ${fav.collectionColor || '#3b82f6'}44`,
                          }}
                        >
                          📁 {fav.collectionName}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveFavorite(fav);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: '#f59e0b',
                        padding: '2px',
                      }}
                      title="นำออกจากรายการโปรด"
                      aria-label={`นำ ${fav.title} ออกจากรายการโปรด`}
                    >
                      ★
                    </button>
                  </div>

                  <h3
                    style={{
                      margin: '4px 0 6px',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--pkh-text-primary)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {fav.title || '(ไม่มีหัวข้อ)'}
                  </h3>

                  {fav.subtitle && (
                    <p
                      style={{
                        margin: 0,
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
                      {fav.subtitle}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '10px',
                    marginTop: '12px',
                    borderTop: '1px solid var(--pkh-border-subtle)',
                    fontSize: '11px',
                    color: 'var(--pkh-text-muted)',
                  }}
                >
                  <time>{formatDate(fav.updatedAt)}</time>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                      onClick={(e) => handleOpenAssignModal(fav, e)}
                    >
                      📁 {fav.collectionName ? 'เปลี่ยนโฟลเดอร์' : 'ใส่โฟลเดอร์'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onOpenFavorite(fav);
                      }}
                    >
                      เปิดดู ↗
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Collection Modal */}
      <Modal
        isOpen={collectionModalOpen}
        onClose={() => {
          if (!colBusy) setCollectionModalOpen(false);
        }}
        title={editingCollection ? '✎ แก้ไขคอลเลกชัน' : '＋ สร้างคอลเลกชันใหม่ (Favorite Collection)'}
      >
        <form onSubmit={handleSaveCollection} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {colError && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
              ⚠️ {colError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
              ชื่อคอลเลกชัน <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="text"
              value={colName}
              onChange={(e) => setColName(e.target.value)}
              placeholder="เช่น เตรียมทริปญี่ปุ่น, ภาษีและบัญชีปี 2026, ซ่อมบ้าน"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
                ไอคอน
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={colIcon}
                  onChange={(e) => setColIcon(e.target.value)}
                  maxLength={4}
                  style={{
                    width: '42px',
                    height: '42px',
                    fontSize: '20px',
                    textAlign: 'center',
                    borderRadius: '8px',
                    border: '1px solid var(--pkh-border-subtle)',
                    backgroundColor: 'var(--pkh-bg-surface)',
                    color: 'var(--pkh-text-primary)',
                  }}
                  aria-label="ไอคอนคอลเลกชัน"
                />
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PRESET_COLLECTION_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setColIcon(emoji)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px' }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
                สีธีม
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={colColor}
                  onChange={(e) => setColColor(e.target.value)}
                  style={{ width: '42px', height: '42px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  aria-label="เลือกสีธีม"
                />
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PRESET_COLLECTION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColColor(c)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: colColor === c ? '2px solid white' : 'none',
                        outline: colColor === c ? '2px solid var(--pkh-primary)' : 'none',
                        cursor: 'pointer',
                      }}
                      aria-label={`เลือกสี ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px' }}>
            <Button
              type="button"
              variant="quiet"
              onClick={() => setCollectionModalOpen(false)}
              disabled={colBusy}
            >
              ยกเลิก
            </Button>
            <Button type="submit" variant="primary" disabled={colBusy}>
              {colBusy ? 'กำลังบันทึก…' : editingCollection ? 'บันทึกการแก้ไข' : 'สร้างคอลเลกชัน'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Favorite Item to Collection Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => {
          if (!assignBusy) {
            setAssignModalOpen(false);
            setItemToAssign(null);
          }
        }}
        title="📁 จัดเก็บรายการโปรดเข้าคอลเลกชัน"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
            เลือกคอลเลกชันสำหรับ "{itemToAssign?.title}":
          </p>

          <select
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--pkh-border-subtle)',
              backgroundColor: 'var(--pkh-bg-surface)',
              color: 'var(--pkh-text-primary)',
              fontSize: '13px',
            }}
          >
            <option value="">-- ไม่จัดเก็บในคอลเลกชันใด (ทั่วไป) --</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.icon} {col.name}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button
              variant="quiet"
              onClick={() => {
                setAssignModalOpen(false);
                setItemToAssign(null);
              }}
              disabled={assignBusy}
            >
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={handleSaveAssignCollection} disabled={assignBusy}>
              {assignBusy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
};
