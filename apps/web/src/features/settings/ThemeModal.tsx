import React from 'react';
import type { ThemeName, ThemeMode } from '../../types';

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeName;
  onSelectTheme: (name: ThemeName) => void;
  themeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
  themes: Array<{ name: ThemeName; label: string; color: string }>;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  theme,
  onSelectTheme,
  themeMode,
  onSelectThemeMode,
  themes,
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Theme and Color Studio"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="popover-head">
          <h2>Theme & Color Studio</h2>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="theme-grid">
          {themes.map((item) => (
            <button
              className={`theme-swatch${theme === item.name ? ' is-active' : ''}`}
              key={item.name}
              type="button"
              onClick={() => onSelectTheme(item.name)}
            >
              <span className="swatch-dot" style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="mode-toggle">
          <button
            className={`button ${themeMode === 'light' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => onSelectThemeMode('light')}
          >
            Light
          </button>
          <button
            className={`button ${themeMode === 'dark' ? 'button-primary' : 'button-quiet'}`}
            type="button"
            onClick={() => onSelectThemeMode('dark')}
          >
            Dark
          </button>
        </div>
      </section>
    </div>
  );
};
