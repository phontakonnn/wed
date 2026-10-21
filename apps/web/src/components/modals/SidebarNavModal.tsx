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
    <div className="dialog-backdrop">
      <section
        className="dialog"
        style={{ maxWidth: '540px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-nav-title"
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">ตั้งค่าส่วนตัว</span>
            <h2 id="customize-nav-title">⚙️ ตั้งค่าแถบเมนู (Customize Sidebar)</h2>
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
        <p className="sidebar-hint" style={{ margin: '4px 0 12px' }}>
          เปลี่ยนชื่อเมนู เปิด/ปิด (ซ่อน) เมนูที่ไม่ได้ใช้งาน หรือจัดลำดับขึ้น-ลงตามความต้องการของคุณ
        </p>
        <div className="nav-edit-list">
          {tempNavConfig.map((item, index) => (
            <div key={item.id} className={`nav-edit-row${item.enabled ? '' : ' is-disabled'}`}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title={item.enabled ? 'คลิกเพื่อซ่อนเมนู' : 'คลิกเพื่อแสดงเมนู'}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => onToggleNavItem(index)}
                />
              </label>
              <span className="nav-edit-icon" aria-hidden="true">{item.icon}</span>
              <input
                className="nav-edit-input"
                type="text"
                value={item.label}
                placeholder={item.defaultLabel}
                disabled={!item.enabled}
                onChange={(e) => onUpdateNavItemLabel(index, e.target.value)}
              />
              <div className="nav-edit-actions">
                <button
                  className="button button-quiet"
                  style={{ padding: '2px 8px', fontSize: '13px' }}
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMoveNavItem(index, 'up')}
                  title="เลื่อนขึ้น"
                >
                  ▲
                </button>
                <button
                  className="button button-quiet"
                  style={{ padding: '2px 8px', fontSize: '13px' }}
                  type="button"
                  disabled={index === tempNavConfig.length - 1}
                  onClick={() => onMoveNavItem(index, 'down')}
                  title="เลื่อนลง"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="editor-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
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
