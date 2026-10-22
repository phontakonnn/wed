import React from 'react';
import type { SidebarNavItem } from '../../sidebarNav';

export interface SidebarNavModalProps {
  isOpen: boolean;
  onClose: () => void;
  tempNavConfig: SidebarNavItem[];
  onToggleNavItem: (index: number) => void;
  onUpdateNavItemLabel: (index: number, label: string) => void;
  onMoveNavItem: (index: number, direction: 'up' | 'down') => void;
  onResetNavConfig: () => void;
  onSaveNavConfig: () => void;
}

export const SidebarNavModal: React.FC<SidebarNavModalProps> = ({
  isOpen,
  onClose,
  tempNavConfig,
  onToggleNavItem,
  onUpdateNavItemLabel,
  onMoveNavItem,
  onResetNavConfig,
  onSaveNavConfig,
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog studio-dialog"
        style={{ maxWidth: '640px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-nav-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">ตั้งค่าระบบ</span>
            <h2 id="customize-nav-title" style={{ margin: 0, fontSize: '18px' }}>⚙️ จัดการและตั้งค่าแถบเมนู (Sidebar Navigation)</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิด"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="sidebar-hint" style={{ margin: '8px 0 14px', fontSize: '13px', lineHeight: 1.5, color: 'var(--pkh-text-secondary)' }}>
          คุณสามารถเปลี่ยนชื่อเมนู เปิดหรือซ่อนเมนูที่ไม่ได้ใช้งาน และกดปุ่มเลื่อนลำดับขึ้น-ลงเพื่อจัดระเบียบตามการใช้งานจริงของคุณ
        </p>
        <div className="nav-edit-list" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tempNavConfig.map((item, index) => (
            <div key={item.id} className={`nav-edit-row${item.enabled ? '' : ' is-disabled'}`}>
              <label className="nav-edit-toggle" title={item.enabled ? 'คลิกเพื่อซ่อนเมนูนี้' : 'คลิกเพื่อเปิดแสดงเมนูนี้'}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => onToggleNavItem(index)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </label>

              <div className="nav-edit-identity" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                <span className="nav-edit-icon" aria-hidden="true" style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
                <span className="nav-edit-origin" style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }} title={`ชื่อเดิม: ${item.defaultLabel}`}>
                  {item.defaultLabel}
                </span>
              </div>

              <input
                className="nav-edit-input"
                type="text"
                value={item.label}
                placeholder={item.defaultLabel}
                disabled={!item.enabled}
                onChange={(e) => onUpdateNavItemLabel(index, e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--pkh-border-default, #cbd5e1)',
                  background: item.enabled ? 'var(--pkh-bg-input, #fff)' : 'var(--pkh-bg-subtle, #f1f5f9)',
                  color: 'var(--pkh-text-main, #0f172a)',
                  fontSize: '13px',
                }}
              />

              <span
                className={`nav-status-badge ${item.enabled ? 'status-visible' : 'status-hidden'}`}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  whiteSpace: 'nowrap',
                  background: item.enabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.15)',
                  color: item.enabled ? '#059669' : '#64748b',
                }}
              >
                {item.enabled ? 'กำลังแสดง' : 'ซ่อนอยู่'}
              </span>

              <div className="nav-edit-actions" style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="button button-quiet"
                  style={{ padding: '4px 8px', fontSize: '12px', minWidth: '28px' }}
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMoveNavItem(index, 'up')}
                  title="เลื่อนเมนูนี้ขึ้น"
                >
                  ▲
                </button>
                <button
                  className="button button-quiet"
                  style={{ padding: '4px 8px', fontSize: '12px', minWidth: '28px' }}
                  type="button"
                  disabled={index === tempNavConfig.length - 1}
                  onClick={() => onMoveNavItem(index, 'down')}
                  title="เลื่อนเมนูนี้ลง"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="editor-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '14px', marginTop: '12px' }}>
          <button
            className="button button-quiet"
            type="button"
            onClick={onResetNavConfig}
          >
            รีเซ็ตเป็นค่าเริ่มต้น
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="button button-quiet"
              type="button"
              onClick={onClose}
            >
              ยกเลิก
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={onSaveNavConfig}
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
