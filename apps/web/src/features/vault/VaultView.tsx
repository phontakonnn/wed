import React, { useState, type FormEvent } from 'react';
import type { VaultItem, VaultCategory, CustomCategory, StoredFile } from '../../api';
import type { VaultDraft } from '../../types';
import { VAULT_CATEGORIES } from '../../lib/constants';
import { daysUntilIso, vaultTone } from '../../lib/formatters';
import { EntityAttachments } from '../../components/EntityAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface VaultViewProps {
  vaultItems: VaultItem[];
  activeVault: VaultItem | null;
  vaultDraft: VaultDraft;
  setVaultDraft: React.Dispatch<React.SetStateAction<VaultDraft>>;
  vaultError: string;
  vaultNotice: string;
  vaultBusy: boolean;
  vaultQuery: string;
  setVaultQuery: (query: string) => void;
  vaultCategory: VaultCategory | 'all';
  setVaultCategory: (cat: VaultCategory | 'all') => void;
  vaultCustomCatId: string;
  setVaultCustomCatId: (id: string) => void;
  customCategories: CustomCategory[];
  onStartNewVaultItem: () => void;
  onCopyVaultKey: (item: VaultItem, key: string) => void;
  onSendVaultItemToReminders: (item: VaultItem) => void;
  onSaveVaultItem: (e: FormEvent) => void;
  onRemoveVaultItem: (item: VaultItem) => void;
  onSelectVaultItem: (item: VaultItem) => void;
  files: StoredFile[];
  onFilesChanged: () => void;
}

export const VaultView: React.FC<VaultViewProps> = ({
  vaultItems,
  activeVault,
  vaultDraft,
  setVaultDraft,
  vaultError,
  vaultNotice,
  vaultBusy,
  vaultQuery,
  setVaultQuery,
  vaultCategory,
  setVaultCategory,
  vaultCustomCatId,
  setVaultCustomCatId,
  customCategories,
  onStartNewVaultItem,
  onCopyVaultKey,
  onSendVaultItemToReminders,
  onSaveVaultItem,
  onRemoveVaultItem,
  onSelectVaultItem,
  files,
  onFilesChanged,
}) => {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  const toggleRevealKey = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredVault = vaultItems.filter((item) => {
    if (vaultCategory !== 'all' && item.category !== vaultCategory) return false;
    if (!vaultQuery.trim()) return true;
    const q = vaultQuery.trim().toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.keyValue.toLowerCase().includes(q) ||
      item.physicalLocation.toLowerCase().includes(q) ||
      item.notes.toLowerCase().includes(q)
    );
  });

  return (
    <section className="life-view-container" aria-label="คลังสำคัญและทรัพย์สิน Vault">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">🔐</div>
        <div className="banner-info">
          <span className="eyebrow">Personal Vault &amp; Assets</span>
          <h2 className="banner-title">คลังสำคัญและทรัพย์สิน (Vault)</h2>
          <p className="banner-subtitle">
            {vaultItems.length} รายการ · บันทึกเลขสำคัญ กรมธรรม์ เอกสารสิทธิ์ ทรัพย์สิน และข้อมูลลับอย่างปลอดภัย
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={onStartNewVaultItem}>
            ＋ เพิ่มรายการเข้าคลัง
          </Button>
          {activeVault && (
            <>
              <Button
                variant="quiet"
                onClick={() => void onCopyVaultKey(activeVault, vaultDraft.keyValue)}
              >
                📋 คัดลอกเลขสำคัญ
              </Button>
              <Button
                variant="quiet"
                onClick={() => void onSendVaultItemToReminders(activeVault)}
              >
                📅 ส่งเข้าปฏิทิน
              </Button>
            </>
          )}
        </div>
      </div>

      {vaultError && <p className="form-error editor-error" role="alert">{vaultError}</p>}
      {vaultNotice && <p className="form-notice" role="status">{vaultNotice}</p>}

      {/* Quick Add / Edit Vault Item Form */}
      <form className="life-quick-card" onSubmit={onSaveVaultItem}>
        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
          {activeVault ? `✏️ แก้ไขรายการ: ${activeVault.title}` : '＋ เพิ่มรายการใหม่ในคลัง'}
        </strong>
        <div className="life-form-grid">
          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="vault-title">ชื่อรายการ *</label>
            <input
              id="vault-title"
              required
              value={vaultDraft.title}
              onChange={(e) => setVaultDraft({ ...vaultDraft, title: e.target.value })}
              maxLength={200}
              placeholder="เช่น กรมธรรม์รถยนต์, โฉนดที่ดิน, สัญญารายปี..."
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="vault-cat">หมวดหมู่</label>
            <select
              id="vault-cat"
              value={vaultDraft.category}
              onChange={(e) => setVaultDraft({
                ...vaultDraft,
                category: e.target.value as VaultCategory,
              })}
            >
              {VAULT_CATEGORIES.map((category) => (
                <option value={category} key={category}>{category}</option>
              ))}
            </select>
          </div>

          {customCategories.length > 0 && (
            <div className="life-field-group">
              <label htmlFor="vault-custom-cat">📁 หมวดหมู่ของฉัน</label>
              <select
                id="vault-custom-cat"
                value={vaultCustomCatId}
                onChange={(e) => setVaultCustomCatId(e.target.value)}
              >
                <option value="">-- ไม่ระบุ --</option>
                {customCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.parentId ? '↳ ' : ''}{category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="vault-key">เลขสำคัญ / รหัสอ้างอิง</label>
            <input
              id="vault-key"
              value={vaultDraft.keyValue}
              onChange={(e) => setVaultDraft({ ...vaultDraft, keyValue: e.target.value })}
              maxLength={200}
              placeholder="เลขที่กรมธรรม์, ทะเบียน, หมายเลขบัญชี, เลขซีเรียล..."
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="vault-loc">สถานที่เก็บเอกสารตัวจริง</label>
            <input
              id="vault-loc"
              value={vaultDraft.physicalLocation}
              onChange={(e) => setVaultDraft({ ...vaultDraft, physicalLocation: e.target.value })}
              maxLength={200}
              placeholder="เช่น ตู้เซฟชั้น 2 แฟ้มสีฟ้า..."
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="vault-expiry">วันหมดอายุ / วันต่ออายุ</label>
            <input
              id="vault-expiry"
              type="date"
              value={vaultDraft.renewalOrExpiryDate}
              onChange={(e) => setVaultDraft({ ...vaultDraft, renewalOrExpiryDate: e.target.value })}
            />
          </div>

          <div className="life-field-group">
            <label htmlFor="vault-amount">ยอดเงิน / มูลค่า / ทุนประกัน</label>
            <input
              id="vault-amount"
              value={vaultDraft.amountText}
              onChange={(e) => setVaultDraft({ ...vaultDraft, amountText: e.target.value })}
              maxLength={100}
              placeholder="เช่น ทุนประกัน 1,000,000 บาท..."
            />
          </div>

          <div className="life-field-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="vault-notes">บันทึกเพิ่มเติม / เงื่อนไขสำคัญ</label>
            <textarea
              id="vault-notes"
              rows={2}
              value={vaultDraft.notes}
              onChange={(e) => setVaultDraft({ ...vaultDraft, notes: e.target.value })}
              placeholder="เงื่อนไขการเคลม, เบอร์โทรฉุกเฉิน, ขั้นตอนการต่ออายุ..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          {activeVault && (
            <Button
              variant="danger-quiet"
              type="button"
              disabled={vaultBusy}
              onClick={() => void onRemoveVaultItem(activeVault)}
            >
              ลบรายการนี้
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={vaultBusy}>
            {vaultBusy ? 'กำลังบันทึก…' : activeVault ? 'บันทึกการแก้ไข' : '＋ สร้างรายการใหม่'}
          </Button>
        </div>
      </form>

      {activeVault && (
        <EntityAttachments
          entityType="vault"
          entityId={activeVault.id}
          availableFiles={files}
          onFilesChanged={onFilesChanged}
        />
      )}

      {/* Vault Items List */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', margin: '8px 0 12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
            รายการในคลังสำคัญทั้งหมด ({filteredVault.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '440px' }}>
            <input
              type="search"
              placeholder="ค้นหาในคลังสำคัญ..."
              value={vaultQuery}
              onChange={(e) => setVaultQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                fontSize: '13px',
              }}
            />
            <select
              value={vaultCategory}
              onChange={(e) => setVaultCategory(e.target.value as VaultCategory | 'all')}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                fontSize: '12px',
              }}
            >
              <option value="all">ทุกหมวดหมู่</option>
              {VAULT_CATEGORIES.map((c) => (
                <option value={c} key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {vaultBusy ? (
          <div className="life-bento-grid">
            <Skeleton height={180} borderRadius="16px" />
            <Skeleton height={180} borderRadius="16px" />
          </div>
        ) : filteredVault.length === 0 ? (
          <EmptyState
            icon="🔐"
            title="ไม่พบรายการในคลังสำคัญ"
            description="บันทึกข้อมูลสำคัญแรกด้วยแบบฟอร์มด้านบนเพื่อจัดเก็บข้อมูลลับให้เป็นระเบียบและปลอดภัย"
            action={
              <Button variant="primary" onClick={onStartNewVaultItem}>
                ＋ เพิ่มรายการแรก
              </Button>
            }
          />
        ) : (
          <div className="life-bento-grid">
            {filteredVault.map((item) => {
              const daysLeft = daysUntilIso(item.renewalOrExpiryDate);
              const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
              const isExpired = daysLeft !== null && daysLeft < 0;
              const isRevealed = Boolean(revealedKeys[item.id]);

              return (
                <article
                  key={item.id}
                  className={`life-card ${activeVault?.id === item.id ? 'is-active' : ''}`}
                  onClick={() => onSelectVaultItem(item)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className={`vault-badge ${vaultTone(item.category)}`}>
                        {item.category}
                      </span>
                      {isExpired ? (
                        <span className="task-priority-pill task-priority-urgent">หมดอายุแล้ว</span>
                      ) : isUrgent ? (
                        <span className="task-priority-pill task-priority-high">อีก {daysLeft} วัน</span>
                      ) : item.renewalOrExpiryDate ? (
                        <span className="task-priority-pill task-priority-normal">{item.renewalOrExpiryDate}</span>
                      ) : null}
                    </div>

                    <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary)', display: 'block', marginBottom: '8px' }}>
                      {item.title}
                    </strong>

                    {/* Masked Secret Key with Reveal Toggle and Copy */}
                    {item.keyValue && (
                      <div className="vault-key-box" style={{ marginBottom: '8px' }}>
                        <span>
                          {isRevealed ? item.keyValue : '••••••••••••'}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="text-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRevealKey(item.id);
                            }}
                            title={isRevealed ? 'ซ่อน' : 'แสดง'}
                            style={{ fontSize: '12px' }}
                          >
                            {isRevealed ? '🙈' : '👁️'}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onCopyVaultKey(item, item.keyValue);
                            }}
                            title="คัดลอกเลขสำคัญ"
                            style={{ fontSize: '12px' }}
                          >
                            📋
                          </button>
                        </div>
                      </div>
                    )}

                    {item.physicalLocation && (
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                        📍 {item.physicalLocation}
                      </p>
                    )}
                    {item.amountText && (
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--pkh-text-primary)', fontWeight: 600 }}>
                        💰 {item.amountText}
                      </p>
                    )}
                    {item.notes && (
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--pkh-text-muted)', lineHeight: 1.4 }}>
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '10px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVaultItem(item);
                      }}
                    >
                      ✏️ แก้ไข
                    </Button>
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onRemoveVaultItem(item);
                      }}
                    >
                      ลบ
                    </Button>
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
