import React, { useState, useEffect } from 'react';
import {
  type WatchlistItem,
  getWatchlist,
  createWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
} from '../../api';
import { Button } from '../../components/ui/Button';
import { TagSelector } from '../../components/TagSelector';
import { WebsiteLogo } from '../../components/ui/WebsiteLogo';
import './lifestyle.css';

export const WatchlistView: React.FC = () => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'want_to_watch' | 'watching' | 'watched'>('all');
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'movie' | 'series' | 'anime' | 'variety'>('movie');
  const [platform, setPlatform] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'want_to_watch' | 'watching' | 'watched'>('want_to_watch');
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await getWatchlist();
      setItems(res.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchItems();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const resetForm = () => {
    setEditingItem(null);
    setTitle('');
    setType('movie');
    setPlatform('');
    setUrl('');
    setStatus('want_to_watch');
    setRating(0);
    setTags([]);
    setNotes('');
    setError('');
  };

  const handleEditClick = (item: WatchlistItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setType(item.type);
    setPlatform(item.platform);
    setUrl(item.url);
    setStatus(item.status);
    setRating(item.rating);
    setTags(item.tags ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : []);
    setNotes(item.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('กรุณาระบุชื่อเรื่อง');
      return;
    }

    setSaveBusy(true);
    setError('');
    try {
      let finalUrl = url.trim();
      if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }

      const payload = {
        title: title.trim(),
        type,
        platform: platform.trim(),
        url: finalUrl,
        status,
        rating,
        tags: tags.join(', '),
        notes: notes.trim(),
      };

      if (editingItem) {
        const res = await updateWatchlistItem(editingItem.id, payload);
        setItems((prev) => prev.map((item) => (item.id === editingItem.id ? res.item : item)));
      } else {
        const res = await createWatchlistItem(payload);
        setItems((prev) => [res.item, ...prev]);
      }
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกรายการได้');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) return;
    try {
      await deleteWatchlistItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingItem?.id === id) {
        resetForm();
      }
    } catch {
      // ignore
    }
  };

  const handleQuickStatusChange = async (item: WatchlistItem, newStatus: 'want_to_watch' | 'watching' | 'watched') => {
    try {
      const res = await updateWatchlistItem(item.id, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    } catch {
      // ignore
    }
  };

  const handleQuickRatingChange = async (item: WatchlistItem, newRating: number) => {
    try {
      const res = await updateWatchlistItem(item.id, { rating: newRating });
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    } catch {
      // ignore
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'all') return true;
    return item.status === activeTab;
  });

  const allAvailableTags = Array.from(
    new Set(
      items
        .flatMap((i) => (i.tags ? i.tags.split(',') : []))
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );

  return (
    <div className="lifestyle-container">
      {/* Banner */}
      <div className="lifestyle-banner">
        <div className="lifestyle-banner-info">
          <div className="lifestyle-banner-icon">🎬</div>
          <div>
            <h2 className="lifestyle-banner-title">หนัง/ซีรีส์ที่อยากดู (Watchlist)</h2>
            <p className="lifestyle-banner-sub">
              บันทึกภาพยนตร์ ซีรีส์ อนิเมะ รายการวาไรตี้ พร้อมให้ดาวและบันทึกช่องทางรับชม
            </p>
          </div>
        </div>
        <div>
          {editingItem && (
            <Button variant="quiet" onClick={resetForm}>
              ✕ ยกเลิกการแก้ไข / สร้างใหม่
            </Button>
          )}
        </div>
      </div>

      {/* Form Card */}
      <form className="lifestyle-form-card" onSubmit={handleSave} id="watchlist-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            {editingItem ? '✏️ แก้ไขรายการ' : '＋ เพิ่มรายการใหม่'}
          </h3>
          {editingItem && (
            <span style={{ fontSize: '12px', color: 'var(--pkh-primary)' }}>
              กำลังแก้ไข: {editingItem.title}
            </span>
          )}
        </div>

        {error && <span style={{ color: 'var(--pkh-danger)', fontSize: '13px' }}>{error}</span>}

        <div className="lifestyle-form-grid">
          <div className="lifestyle-field">
            <label htmlFor="wl-title">ชื่อเรื่อง *</label>
            <input
              id="wl-title"
              type="text"
              placeholder="เช่น Interstellar, Breaking Bad..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="wl-type">ประเภท</label>
            <select
              id="wl-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'movie' | 'series' | 'anime' | 'variety')}
            >
              <option value="movie">🎬 หนัง (Movie)</option>
              <option value="series">📺 ซีรีส์ (Series)</option>
              <option value="anime">⛩️ อนิเมะ (Anime)</option>
              <option value="variety">🎭 รายการ (Variety)</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="wl-platform">ช่องทางรับชม</label>
            <input
              id="wl-platform"
              type="text"
              placeholder="เช่น Netflix, Disney+, YouTube, โรงภาพยนตร์..."
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="wl-status">สถานะ</label>
            <select
              id="wl-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'want_to_watch' | 'watching' | 'watched')}
            >
              <option value="want_to_watch">⏳ อยากดู (Want to watch)</option>
              <option value="watching">▶️ กำลังดู (Watching)</option>
              <option value="watched">✅ ดูจบแล้ว (Watched)</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="wl-url">ลิงก์เว็บ / ลิงก์ดู</label>
            <input
              id="wl-url"
              type="text"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="lifestyle-field">
            <label>คะแนนความชอบ (ดาว)</label>
            <div className="lifestyle-stars" style={{ padding: '6px 0' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`lifestyle-star ${star <= rating ? 'is-filled' : ''}`}
                  onClick={() => setRating(star === rating ? 0 : star)}
                  title={`${star} ดาว`}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lifestyle-field">
          <label>แท็กหมวดหมู่</label>
          <TagSelector
            selectedTags={tags}
            onChange={setTags}
            availableTags={allAvailableTags}
            placeholder="พิมพ์แท็ก เช่น Sci-Fi, สืบสวน, เกาหลี..."
          />
        </div>

        <div className="lifestyle-field">
          <label htmlFor="wl-notes">โน้ตช่วยจำ / รีวิวความรู้สึก</label>
          <textarea
            id="wl-notes"
            rows={2}
            placeholder="เขียนโน้ต หรือความประทับใจ..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {editingItem && (
            <Button variant="quiet" type="button" onClick={resetForm}>
              ยกเลิก
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={saveBusy || !title.trim()}>
            {saveBusy ? 'กำลังบันทึก...' : editingItem ? 'บันทึกการแก้ไข' : '＋ บันทึกรายการ'}
          </Button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="lifestyle-filter-bar">
        <button
          className={`lifestyle-filter-pill ${activeTab === 'all' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          ทั้งหมด ({items.length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'want_to_watch' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('want_to_watch')}
        >
          ⏳ อยากดู ({items.filter((i) => i.status === 'want_to_watch').length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'watching' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('watching')}
        >
          ▶️ กำลังดู ({items.filter((i) => i.status === 'watching').length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'watched' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('watched')}
        >
          ✅ ดูจบแล้ว ({items.filter((i) => i.status === 'watched').length})
        </button>
      </div>

      {/* Items Grid */}
      {loading ? (
        <div>กำลังโหลดข้อมูล...</div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--pkh-text-secondary)' }}>
          ไม่มีรายการในหมวดนี้ เริ่มต้นเพิ่มรายการที่ฟอร์มด้านบนได้เลย!
        </div>
      ) : (
        <div className="lifestyle-card-grid">
          {filteredItems.map((item) => {
            const itemTags = item.tags ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
            const typeLabel =
              item.type === 'movie'
                ? '🎬 หนัง'
                : item.type === 'series'
                ? '📺 ซีรีส์'
                : item.type === 'anime'
                ? '⛩️ อนิเมะ'
                : '🎭 รายการ';

            return (
              <div key={item.id} className="lifestyle-item-card">
                <div>
                  <div className="lifestyle-item-header">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <WebsiteLogo url={item.url} size={28} title={item.title} />
                        <h4 className="lifestyle-item-title" style={{ margin: 0 }}>{item.title}</h4>
                      </a>
                    ) : (
                      <h4 className="lifestyle-item-title">{item.title}</h4>
                    )}
                  </div>

                  <div className="lifestyle-badges" style={{ marginTop: '8px' }}>
                    <span className="lifestyle-badge lifestyle-badge-primary">{typeLabel}</span>
                    {item.platform && (
                      <span className="lifestyle-badge">{item.platform}</span>
                    )}
                    <span
                      className={`lifestyle-badge ${
                        item.status === 'watched'
                          ? 'lifestyle-badge-primary'
                          : item.status === 'watching'
                          ? 'lifestyle-badge-warning'
                          : ''
                      }`}
                    >
                      {item.status === 'watched'
                        ? '✅ จบแล้ว'
                        : item.status === 'watching'
                        ? '▶️ กำลังดู'
                        : '⏳ อยากดู'}
                    </span>
                  </div>

                  <div className="lifestyle-stars" style={{ marginTop: '8px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`lifestyle-star ${star <= item.rating ? 'is-filled' : ''}`}
                        onClick={() => void handleQuickRatingChange(item, star === item.rating ? 0 : star)}
                        title={`ให้ ${star} ดาว`}
                      >
                        ★
                      </span>
                    ))}
                  </div>

                  {itemTags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {itemTags.map((t) => (
                        <span key={t} style={{ fontSize: '11px', color: 'var(--pkh-primary)', fontWeight: 500 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.notes && (
                    <p className="lifestyle-item-notes" style={{ marginTop: '10px' }}>
                      {item.notes}
                    </p>
                  )}
                </div>

                <div className="lifestyle-item-footer">
                  <select
                    value={item.status}
                    onChange={(e) => void handleQuickStatusChange(item, e.target.value as 'want_to_watch' | 'watching' | 'watched')}
                    style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value="want_to_watch">อยากดู</option>
                    <option value="watching">กำลังดู</option>
                    <option value="watched">ดูจบแล้ว</option>
                  </select>

                  <div className="lifestyle-actions-group">
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => handleEditClick(item)}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    >
                      ✎ แก้ไข
                    </Button>
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      onClick={() => void handleDelete(item.id)}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    >
                      🗑️ ลบ
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
