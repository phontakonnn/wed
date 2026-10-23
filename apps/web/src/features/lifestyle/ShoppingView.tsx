import React, { useState, useEffect, useMemo } from 'react';
import {
  type ShoppingItem,
  getShoppingList,
  createShoppingItem,
  updateShoppingItem,
  deleteShoppingItem,
  clearBoughtShoppingItems,
} from '../../api';
import { Button } from '../../components/ui/Button';
import { WebsiteLogo } from '../../components/ui/WebsiteLogo';
import './lifestyle.css';

export const ShoppingView: React.FC = () => {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('household');
  const [quantity, setQuantity] = useState(1);
  const [estimatedPrice, setEstimatedPrice] = useState<number | ''>('');
  const [priority, setPriority] = useState<'urgent' | 'normal' | 'low'>('normal');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await getShoppingList();
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
    setName('');
    setCategory('household');
    setQuantity(1);
    setEstimatedPrice('');
    setPriority('normal');
    setUrl('');
    setNotes('');
    setError('');
  };

  const handleEditClick = (item: ShoppingItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setQuantity(item.quantity);
    setEstimatedPrice(item.estimatedPrice > 0 ? item.estimatedPrice : '');
    setPriority(item.priority);
    setUrl(item.url);
    setNotes(item.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณาระบุชื่อสิ่งของ');
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
        name: name.trim(),
        category,
        quantity: Math.max(1, Number(quantity) || 1),
        estimatedPrice: Math.max(0, Number(estimatedPrice) || 0),
        priority,
        url: finalUrl,
        notes: notes.trim(),
      };

      if (editingItem) {
        const res = await updateShoppingItem(editingItem.id, payload);
        setItems((prev) => prev.map((item) => (item.id === editingItem.id ? res.item : item)));
      } else {
        const res = await createShoppingItem({ ...payload, status: 'to_buy' });
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
      await deleteShoppingItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingItem?.id === id) {
        resetForm();
      }
    } catch {
      // ignore
    }
  };

  const handleToggleBought = async (item: ShoppingItem) => {
    const nextStatus = item.status === 'bought' ? 'to_buy' : 'bought';
    try {
      const res = await updateShoppingItem(item.id, { status: nextStatus });
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    } catch {
      // ignore
    }
  };

  const handleClearBought = async () => {
    const boughtCount = items.filter((i) => i.status === 'bought').length;
    if (boughtCount === 0) {
      alert('ไม่มีรายการที่ซื้อแล้วในขณะนี้');
      return;
    }
    if (!window.confirm(`คุณต้องการล้างรายการที่ซื้อแล้วทั้งหมด (${boughtCount} รายการ) ใช่หรือไม่?`)) return;

    try {
      await clearBoughtShoppingItems();
      setItems((prev) => prev.filter((i) => i.status !== 'bought'));
    } catch {
      // ignore
    }
  };

  // Math summaries
  const totalToBuyBudget = useMemo(() => {
    return items
      .filter((i) => i.status === 'to_buy')
      .reduce((sum, i) => sum + i.quantity * i.estimatedPrice, 0);
  }, [items]);

  const totalBoughtCost = useMemo(() => {
    return items
      .filter((i) => i.status === 'bought')
      .reduce((sum, i) => sum + i.quantity * i.estimatedPrice, 0);
  }, [items]);

  const filteredItems = items.filter((item) => {
    if (filterCategory === 'all') return true;
    return item.category === filterCategory;
  });

  const categoryLabels: Record<string, string> = {
    household: '🏠 ของใช้ในบ้าน',
    groceries: '🥦 อาหาร/ของสด',
    tech: '💻 ไอที/แกดเจ็ต',
    personal: '👕 ของส่วนตัว',
    other: '📦 อื่นๆ',
  };

  return (
    <div className="lifestyle-container">
      {/* Banner */}
      <div className="lifestyle-banner">
        <div className="lifestyle-banner-info">
          <div className="lifestyle-banner-icon">🛒</div>
          <div>
            <h2 className="lifestyle-banner-title">ของใช้ที่ต้องซื้อ (Shopping List)</h2>
            <p className="lifestyle-banner-sub">
              วางแผนรายการซื้อของ คำนวณงบประมาณอัตโนมัติ และติดตามรายการที่ซื้อแล้ว
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="danger-quiet" onClick={() => void handleClearBought()}>
            🗑️ ล้างรายการที่ซื้อแล้วทั้งหมด
          </Button>
          {editingItem && (
            <Button variant="quiet" onClick={resetForm}>
              ✕ ยกเลิกแก้ไข
            </Button>
          )}
        </div>
      </div>

      {/* Bento Summary Cards */}
      <div className="lifestyle-bento-grid">
        <div className="lifestyle-bento-card">
          <span className="lifestyle-bento-label">💰 ยอดงบประมาณที่ต้องซื้อ</span>
          <span className="lifestyle-bento-val" style={{ color: '#d97706' }}>
            ฿{totalToBuyBudget.toLocaleString('th-TH')}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>
            {items.filter((i) => i.status === 'to_buy').length} รายการที่ยังไม่ได้ซื้อ
          </span>
        </div>

        <div className="lifestyle-bento-card">
          <span className="lifestyle-bento-label">✅ ยอดที่ซื้อไปแล้ว</span>
          <span className="lifestyle-bento-val" style={{ color: 'var(--pkh-primary)' }}>
            ฿{totalBoughtCost.toLocaleString('th-TH')}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>
            {items.filter((i) => i.status === 'bought').length} รายการที่ซื้อสำเร็จแล้ว
          </span>
        </div>

        <div className="lifestyle-bento-card">
          <span className="lifestyle-bento-label">📦 รายการทั้งหมด</span>
          <span className="lifestyle-bento-val" style={{ color: 'var(--pkh-text-main)' }}>
            {items.length}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>
            งบรวมทั้งหมด: ฿{(totalToBuyBudget + totalBoughtCost).toLocaleString('th-TH')}
          </span>
        </div>
      </div>

      {/* Form Card */}
      <form className="lifestyle-form-card" onSubmit={handleSave} id="shopping-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            {editingItem ? '✏️ แก้ไขของที่ต้องซื้อ' : '＋ เพิ่มของที่ต้องซื้อใหม่'}
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
            <label htmlFor="shop-name">ชื่อสิ่งของ *</label>
            <input
              id="shop-name"
              type="text"
              placeholder="เช่น น้ำยาซักผ้า, กระดาษทิชชู่..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="shop-category">หมวดหมู่</label>
            <select
              id="shop-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="household">🏠 ของใช้ในบ้าน</option>
              <option value="groceries">🥦 อาหาร/ของสด</option>
              <option value="tech">💻 ไอที/แกดเจ็ต</option>
              <option value="personal">👕 ของส่วนตัว</option>
              <option value="other">📦 อื่นๆ</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="shop-qty">จำนวนชิ้น</label>
            <input
              id="shop-qty"
              type="number"
              min="1"
              max="10000"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="shop-price">ราคาต่อชิ้นโดยประมาณ (บาท)</label>
            <input
              id="shop-price"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="lifestyle-field">
            <label htmlFor="shop-priority">ความเร่งด่วน</label>
            <select
              id="shop-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'urgent' | 'normal' | 'low')}
            >
              <option value="urgent">🚨 ด่วนมาก</option>
              <option value="normal">⚡ ปกติ</option>
              <option value="low">☕ ไว้ก่อน</option>
            </select>
          </div>

          <div className="lifestyle-field">
            <label htmlFor="shop-url">ลิงก์ร้านค้า / สินค้า (ถ้ามี)</label>
            <input
              id="shop-url"
              type="text"
              placeholder="https://shopee... หรือ lazada..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="lifestyle-field">
          <label htmlFor="shop-notes">โน้ตรายละเอียด (ขนาด, ยี่ห้อ, รสชาติ...)</label>
          <input
            id="shop-notes"
            type="text"
            placeholder="เช่น ยี่ห้อบรีส ถุงสีชมพู ขนาด 1400 มล."
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
            {saveBusy ? 'กำลังบันทึก...' : editingItem ? 'บันทึกการแก้ไข' : '＋ บันทึกรายการ'}
          </Button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="lifestyle-filter-bar">
        <button
          className={`lifestyle-filter-pill ${filterCategory === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilterCategory('all')}
        >
          ทั้งหมด ({items.length})
        </button>
        {Object.entries(categoryLabels).map(([catKey, label]) => (
          <button
            key={catKey}
            className={`lifestyle-filter-pill ${filterCategory === catKey ? 'is-active' : ''}`}
            onClick={() => setFilterCategory(catKey)}
          >
            {label} ({items.filter((i) => i.category === catKey).length})
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {loading ? (
        <div>กำลังโหลดรายการ...</div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--pkh-text-secondary)' }}>
          ไม่มีรายการในหมวดนี้ เพิ่มรายการใหม่ที่แบบฟอร์มด้านบนได้เลย!
        </div>
      ) : (
        <div className="lifestyle-card-grid">
          {filteredItems.map((item) => {
            const isBought = item.status === 'bought';
            const itemTotal = item.quantity * item.estimatedPrice;

            return (
              <div
                key={item.id}
                className={`lifestyle-item-card ${isBought ? 'is-bought' : ''}`}
              >
                <div>
                  <div className="lifestyle-item-header">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isBought}
                        onChange={() => void handleToggleBought(item)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      {item.url ? (
                        <WebsiteLogo url={item.url} size={24} title={item.name} />
                      ) : null}
                      <h4 className="lifestyle-item-title">{item.name}</h4>
                    </label>

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', textDecoration: 'none', color: 'var(--pkh-primary)' }}
                      >
                        ↗ ร้านค้า
                      </a>
                    )}
                  </div>

                  <div className="lifestyle-badges" style={{ marginTop: '8px' }}>
                    <span className="lifestyle-badge">
                      {categoryLabels[item.category] || item.category}
                    </span>
                    <span
                      className={`lifestyle-badge ${
                        item.priority === 'urgent'
                          ? 'lifestyle-badge-danger'
                          : item.priority === 'low'
                          ? ''
                          : 'lifestyle-badge-warning'
                      }`}
                    >
                      {item.priority === 'urgent'
                        ? '🚨 ด่วนมาก'
                        : item.priority === 'low'
                        ? '☕ ไว้ก่อน'
                        : '⚡ ปกติ'}
                    </span>
                    <span className="lifestyle-badge">
                      จำนวน: {item.quantity} ชิ้น
                    </span>
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                      ราคาต่อชิ้น: {item.estimatedPrice > 0 ? `฿${item.estimatedPrice.toLocaleString('th-TH')}` : 'ไม่ระบุ'}
                    </span>
                    {itemTotal > 0 && (
                      <span style={{ fontSize: '15px', fontWeight: 700, color: isBought ? 'var(--pkh-primary)' : '#d97706' }}>
                        รวม ฿{itemTotal.toLocaleString('th-TH')}
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="lifestyle-item-notes" style={{ marginTop: '8px' }}>
                      {item.notes}
                    </p>
                  )}
                </div>

                <div className="lifestyle-item-footer">
                  <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>
                    {isBought ? '✅ ซื้อแล้ว' : '⏳ รอซื้อ'}
                  </span>

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
