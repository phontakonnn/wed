import { useEffect } from 'react';
import type { ThemeMode, UiMode } from '../../types';
import { ACCENT_PRESETS } from '../../lib/theme';
import './ThemeModal.css';

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ThemeMode;
  onSelectMode: (mode: ThemeMode) => void;
  uiMode: UiMode;
  onSelectUiMode: (uiMode: UiMode) => void;
  accentColor: string;
  onSelectAccentColor: (color: string) => void;
}

const MODES: Array<{ id: ThemeMode; icon: string; label: string; hint: string }> = [
  { id: 'light', icon: '☀️', label: 'สว่าง', hint: 'พื้นผิวขาวสะอาด อ่านสบายกลางวัน' },
  { id: 'dark', icon: '🌙', label: 'มืด', hint: 'ลดแสงจ้า เหมาะกับตอนกลางคืน' },
];

const UI_MODES: Array<{ id: UiMode; label: string; hint: string }> = [
  { id: 'fast', label: 'เร็ว (แนะนำ)', hint: 'พื้นผิวทึบ ไม่มี blur — ลื่นที่สุดบนมือถือ' },
  { id: 'rich', label: 'ละเอียด', hint: 'เพิ่ม blur เฉพาะ top bar และ modal' },
];

export function ThemeModal({
  isOpen,
  onClose,
  mode,
  onSelectMode,
  uiMode,
  onSelectUiMode,
  accentColor,
  onSelectAccentColor,
}: ThemeModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="studio-dialog theme-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="theme-panel__head">
          <div>
            <h2 id="theme-panel-title" className="theme-panel__title">รูปลักษณ์</h2>
            <p className="theme-panel__subtitle">โทนสีและระดับเอฟเฟกต์ของทั้งแอป</p>
          </div>
          <button className="icon-button theme-panel__close" type="button" aria-label="ปิด" onClick={onClose} autoFocus>
            ×
          </button>
        </header>

        <div className="theme-panel__body">
          <section className="theme-section" aria-labelledby="theme-mode-label">
            <h3 id="theme-mode-label" className="theme-section__title">โหมดแสง</h3>
            <div className="theme-choice-grid">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="theme-choice"
                  aria-pressed={mode === item.id}
                  onClick={() => onSelectMode(item.id)}
                >
                  <span className="theme-choice__icon" aria-hidden="true">{item.icon}</span>
                  <span className="theme-choice__copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="theme-section" aria-labelledby="theme-ui-label">
            <h3 id="theme-ui-label" className="theme-section__title">โหมดการแสดงผล</h3>
            <div className="theme-choice-grid">
              {UI_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="theme-choice"
                  aria-pressed={uiMode === item.id}
                  onClick={() => onSelectUiMode(item.id)}
                >
                  <span className="theme-choice__copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="theme-section" aria-labelledby="theme-accent-label">
            <h3 id="theme-accent-label" className="theme-section__title">สีเน้น</h3>
            <div className="theme-accent-row">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  type="button"
                  className="theme-accent"
                  aria-label={preset.label}
                  aria-pressed={accentColor.toLowerCase() === preset.color}
                  onClick={() => onSelectAccentColor(preset.color)}
                >
                  <span className="theme-accent__dot" style={{ backgroundColor: preset.color }} aria-hidden="true" />
                  <span className="theme-accent__label">{preset.label}</span>
                </button>
              ))}
              <label className="theme-accent theme-accent--custom">
                <span className="theme-accent__label">กำหนดเอง</span>
                <input
                  type="color"
                  value={accentColor}
                  aria-label="เลือกสีเน้นกำหนดเอง"
                  onChange={(event) => onSelectAccentColor(event.target.value)}
                />
              </label>
            </div>
          </section>
        </div>

        <footer className="theme-panel__foot">
          <button type="button" className="button button-primary" onClick={onClose}>เสร็จสิ้น</button>
        </footer>
      </section>
    </div>
  );
}
