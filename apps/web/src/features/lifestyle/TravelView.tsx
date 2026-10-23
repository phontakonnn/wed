import React, { useState, useEffect } from 'react';
import {
  type TravelPlace,
  getTravelPlaces,
  createTravelPlace,
  updateTravelPlace,
  deleteTravelPlace,
} from '../../api';
import { Button } from '../../components/ui/Button';
import { TagSelector } from '../../components/TagSelector';
import { WebsiteLogo } from '../../components/ui/WebsiteLogo';
import './lifestyle.css';

export const TravelView: React.FC = () => {
  const [places, setPlaces] = useState<TravelPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'wishlist' | 'planned' | 'visited'>('all');
  const [editingItem, setEditingItem] = useState<TravelPlace | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('nature');
  const [location, setLocation] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState<number | ''>('');
  const [plannedDate, setPlannedDate] = useState('');
  const [status, setStatus] = useState<'wishlist' | 'planned' | 'visited'>('wishlist');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchPlaces = async () => {
    try {
      setLoading(true);
      const res = await getTravelPlaces();
      setPlaces(res.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPlaces();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setCategory('nature');
    setLocation('');
    setMapUrl('');
    setEstimatedBudget('');
    setPlannedDate('');
    setStatus('wishlist');
    setTags([]);
    setNotes('');
    setError('');
  };

  const handleEditClick = (place: TravelPlace) => {
    setEditingItem(place);
    setName(place.name);
    setCategory(place.category);
    setLocation(place.location);
    setMapUrl(place.mapUrl);
    setEstimatedBudget(place.estimatedBudget > 0 ? place.estimatedBudget : '');
    setPlannedDate(place.plannedDate);
    setStatus(place.status);
    setTags(place.tags ? place.tags.split(',').map((t) => t.trim()).filter(Boolean) : []);
    setNotes(place.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณาระบุชื่อสถานที่');
      return;
    }

    setSaveBusy(true);
    setError('');
    try {
      let finalMapUrl = mapUrl.trim();
      if (finalMapUrl && !/^https?:\/\//i.test(finalMapUrl)) {
        finalMapUrl = `https://${finalMapUrl}`;
      }

      const payload = {
        name: name.trim(),
        category,
        location: location.trim(),
        mapUrl: finalMapUrl,
        estimatedBudget: Math.max(0, Number(estimatedBudget) || 0),
        plannedDate: plannedDate.trim(),
        status,
        tags: tags.join(', '),
        notes: notes.trim(),
      };

      if (editingItem) {
        const res = await updateTravelPlace(editingItem.id, payload);
        setPlaces((prev) => prev.map((item) => (item.id === editingItem.id ? res.item : item)));
      } else {
        const res = await createTravelPlace(payload);
        setPlaces((prev) => [res.item, ...prev]);
      }
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกสถานที่ได้');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('คุณต้องการลบสถานที่นี้ใช่หรือไม่?')) return;
    try {
      await deleteTravelPlace(id);
      setPlaces((prev) => prev.filter((item) => item.id !== id));
      if (editingItem?.id === id) {
        resetForm();
      }
    } catch {
      // ignore
    }
  };

  const handleQuickStatusChange = async (place: TravelPlace, newStatus: 'wishlist' | 'planned' | 'visited') => {
    try {
      const res = await updateTravelPlace(place.id, { status: newStatus });
      setPlaces((prev) => prev.map((i) => (i.id === place.id ? res.item : i)));
    } catch {
      // ignore
    }
  };

  const filteredPlaces = places.filter((p) => {
    if (activeTab === 'all') return true;
    return p.status === activeTab;
  });

  const categoryLabels: Record<string, string> = {
    nature: '🏔️ ธรรมชาติ/ภูเขา',
    beach: '🏖️ ทะเล/เกาะ',
    cafe: '☕ คาเฟ่/ร้านอาหาร',
    international: '🌏 ต่างประเทศ',
    stay: '🏨 ที่พัก/โรงแรม',
    other: '📍 อื่นๆ',
  };

  const allAvailableTags = Array.from(
    new Set(
      places
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
          <div className="lifestyle-banner-icon">✈️</div>
          <div>
            <h2 className="lifestyle-banner-title">สถานที่เที่ยวที่อยากไป (Travel Wishlist)</h2>
            <p className="lifestyle-banner-sub">
              ปักหมุดที่เที่ยว คาเฟ่ โรงแรม วางแผนงบประมาณ และบันทึกรีวิวความทรงจำ
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
      <form className="lifestyle-form-card" onSubmit={handleSave} id="travel-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            {editingItem ? '✏️ แก้ไขสถานที่' : '＋ เพิ่มสถานที่เที่ยวใหม่'}
          </h3>
          {editingItem && (
            <span style={{ fontSize: '12px', color: 'var(--pkh-primary)' }}>
              กำลังแก้ไข: {editingItem.name}
            </span>
          )}
        </div>

        {error && <span style={{ color: 'var(--pkh-danger)', fontSize: '13px' }}>{error}</span>}

        <div className="lifestyle-form-grid">
          <div className="lifestyle-field">
            <label htmlFor="tr-name">ชื่อสถานที่ *</label>
            <input
              id="tr-name"
              type="text"
              placeholder="เช่น ม่อนแจ่ม, หาดไร่เลย์, ฟูจิ..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="tr-cat">ประเภทสถานที่</label>
            <select
              id="tr-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="nature">🏔️ ธรรมชาติ/ภูเขา</option>
              <option value="beach">🏖️ ทะเล/เกาะ</option>
              <option value="cafe">☕ คาเฟ่/ร้านอาหาร</option>
              <option value="international">🌏 ต่างประเทศ</option>
              <option value="stay">🏨 ที่พัก/โรงแรม</option>
              <option value="other">📍 อื่นๆ</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="tr-location">จังหวัด / ประเทศ</label>
            <input
              id="tr-location"
              type="text"
              placeholder="เช่น เชียงใหม่, ญี่ปุ่น, กระบี่..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="tr-status">สถานะ</label>
            <select
              id="tr-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'wishlist' | 'planned' | 'visited')}
            >
              <option value="wishlist">❤️ อยากไป (Wishlist)</option>
              <option value="planned">📅 วางแผนแล้ว (Planned)</option>
              <option value="visited">🏆 ไปมาแล้ว (Visited)</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="tr-budget">งบประมาณคร่าวๆ (บาท)</label>
            <input
              id="tr-budget"
              type="number"
              min="0"
              step="any"
              placeholder="เช่น 5000"
              value={estimatedBudget}
              onChange={(e) => setEstimatedBudget(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="tr-date">ช่วงเวลาที่อยากไป</label>
            <input
              id="tr-date"
              type="text"
              placeholder="เช่น หน้าหนาว, ปลายปี 2026, วันหยุดยาว..."
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
            />
          </div>

          <div className="lifestyle-field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="tr-map">ลิงก์ Google Maps หรือลิงก์รีวิว</label>
            <input
              id="tr-map"
              type="text"
              placeholder="https://maps.app.goo.gl/... หรือลิงก์รีวิว"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="lifestyle-field">
          <label>แท็ก</label>
          <TagSelector
            selectedTags={tags}
            onChange={setTags}
            availableTags={allAvailableTags}
            placeholder="พิมพ์แท็ก เช่น กางเต็นท์, พักผ่อน, ถ่ายรูปสวย..."
          />
        </div>

        <div className="lifestyle-field">
          <label htmlFor="tr-notes">โน้ตช่วยจำ / สิ่งที่ต้องเตรียม / รีวิว</label>
          <textarea
            id="tr-notes"
            rows={2}
            placeholder="เช่น ต้องจองล่วงหน้า 1 เดือน, แนะนำเมนูช็อกโกแลตร้อน..."
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
          <Button variant="primary" type="submit" disabled={saveBusy || !name.trim()}>
            {saveBusy ? 'กำลังบันทึก...' : editingItem ? 'บันทึกการแก้ไข' : '＋ บันทึกสถานที่'}
          </Button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="lifestyle-filter-bar">
        <button
          className={`lifestyle-filter-pill ${activeTab === 'all' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          ทั้งหมด ({places.length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'wishlist' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('wishlist')}
        >
          ❤️ อยากไป ({places.filter((p) => p.status === 'wishlist').length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'planned' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('planned')}
        >
          📅 วางแผนแล้ว ({places.filter((p) => p.status === 'planned').length})
        </button>
        <button
          className={`lifestyle-filter-pill ${activeTab === 'visited' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('visited')}
        >
          🏆 ไปมาแล้ว ({places.filter((p) => p.status === 'visited').length})
        </button>
      </div>

      {/* Places Grid */}
      {loading ? (
        <div>กำลังโหลดข้อมูล...</div>
      ) : filteredPlaces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--pkh-text-secondary)' }}>
          ไม่มีรายการในหมวดนี้ เพิ่มสถานที่ใหม่ที่แบบฟอร์มด้านบนได้เลย!
        </div>
      ) : (
        <div className="lifestyle-card-grid">
          {filteredPlaces.map((place) => {
            const placeTags = place.tags ? place.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

            return (
              <div key={place.id} className="lifestyle-item-card">
                <div>
                  <div className="lifestyle-item-header">
                    <div>
                      {place.mapUrl ? (
                        <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <WebsiteLogo url={place.mapUrl} size={24} title={place.name} />
                          <h4 className="lifestyle-item-title" style={{ margin: 0 }}>{place.name}</h4>
                        </a>
                      ) : (
                        <h4 className="lifestyle-item-title">{place.name}</h4>
                      )}
                      {place.location && (
                        <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                          📍 {place.location}
                        </span>
                      )}
                    </div>

                    {place.mapUrl && (
                      <a
                        href={place.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', textDecoration: 'none', color: 'var(--pkh-primary)' }}
                      >
                        🗺️ แผนที่/รีวิว
                      </a>
                    )}
                  </div>

                  <div className="lifestyle-badges" style={{ marginTop: '8px' }}>
                    <span className="lifestyle-badge">
                      {categoryLabels[place.category] || place.category}
                    </span>
                    <span
                      className={`lifestyle-badge ${
                        place.status === 'visited'
                          ? 'lifestyle-badge-primary'
                          : place.status === 'planned'
                          ? 'lifestyle-badge-warning'
                          : ''
                      }`}
                    >
                      {place.status === 'visited'
                        ? '🏆 ไปมาแล้ว'
                        : place.status === 'planned'
                        ? '📅 วางแผนแล้ว'
                        : '❤️ อยากไป'}
                    </span>
                    {place.plannedDate && (
                      <span className="lifestyle-badge">
                        ช่วง: {place.plannedDate}
                      </span>
                    )}
                  </div>

                  {place.estimatedBudget > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                      งบประมาณ ฿{place.estimatedBudget.toLocaleString('th-TH')}
                    </div>
                  )}

                  {placeTags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {placeTags.map((t) => (
                        <span key={t} style={{ fontSize: '11px', color: 'var(--pkh-primary)', fontWeight: 500 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {place.notes && (
                    <p className="lifestyle-item-notes" style={{ marginTop: '8px' }}>
                      {place.notes}
                    </p>
                  )}
                </div>

                <div className="lifestyle-item-footer">
                  <select
                    value={place.status}
                    onChange={(e) => void handleQuickStatusChange(place, e.target.value as 'wishlist' | 'planned' | 'visited')}
                    style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value="wishlist">อยากไป</option>
                    <option value="planned">วางแผนแล้ว</option>
                    <option value="visited">ไปมาแล้ว</option>
                  </select>

                  <div className="lifestyle-actions-group">
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => handleEditClick(place)}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                    >
                      ✎ แก้ไข
                    </Button>
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      onClick={() => void handleDelete(place.id)}
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
