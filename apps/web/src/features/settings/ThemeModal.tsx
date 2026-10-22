import React, { useState, useEffect } from 'react';
import type { ThemeConfig, ThemeMode } from '../../types';
import {
  THEME_PRESETS,
  DEFAULT_THEME_CONFIG,
  applyThemeConfig,
  saveThemeConfig,
  loadStoredThemeConfig,
} from '../../lib/theme';

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userUid?: string | null;
  // Backward compatibility props if needed by App.tsx
  theme?: string;
  onSelectTheme?: (name: any) => void;
  themeMode?: ThemeMode;
  onSelectThemeMode?: (mode: ThemeMode) => void;
  themes?: Array<{ name: any; label: string; color: string }>;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  userUid,
  onSelectTheme,
  onSelectThemeMode,
}) => {
  const [config, setConfig] = useState<ThemeConfig>(() => loadStoredThemeConfig());

  useEffect(() => {
    if (isOpen) {
      const current = loadStoredThemeConfig();
      setConfig(current);
    }
  }, [isOpen]);

  const updateConfig = (patch: Partial<ThemeConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      applyThemeConfig(next);
      void saveThemeConfig(next, userUid);
      if (patch.theme && onSelectTheme) onSelectTheme(patch.theme);
      if (patch.mode && onSelectThemeMode) onSelectThemeMode(patch.mode);
      return next;
    });
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    updateConfig({
      theme: preset.id,
      accentColor: preset.accent,
      buttonColor: preset.button,
      mode: preset.mode,
      neonGlow: preset.neonGlow,
      glassBlur: preset.glassBlur,
      glassOpacity: preset.glassOpacity,
      borderRadius: preset.borderRadius,
    });
  };

  const handleReset = () => {
    setConfig(DEFAULT_THEME_CONFIG);
    applyThemeConfig(DEFAULT_THEME_CONFIG);
    void saveThemeConfig(DEFAULT_THEME_CONFIG, userUid);
    if (onSelectTheme) onSelectTheme(DEFAULT_THEME_CONFIG.theme);
    if (onSelectThemeMode) onSelectThemeMode(DEFAULT_THEME_CONFIG.mode);
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="studio-dialog theme-studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label="🎨 สตูดิโอปรับแต่งธีมขั้นสูงสุด"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '580px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: `${config.borderRadius}px`,
          backdropFilter: `blur(${config.glassBlur}px)`,
          WebkitBackdropFilter: `blur(${config.glassBlur}px)`,
          boxShadow: `var(--pkh-shadow-xl), var(--pkh-neon-glow)`,
          border: 'var(--pkh-neon-border)',
        }}
      >
        {/* Header */}
        <div className="popover-head" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--pkh-text-primary)' }}>
              🎨 สตูดิโอปรับแต่งธีมขั้นสูงสุด
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
              ปรับแต่งธีม กระจกแก้ว แสงนีออน และรูปพื้นหลังให้มีผลทุกหน้าจอและป๊อปอัป
            </p>
          </div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose} style={{ fontSize: '20px' }}>
            ×
          </button>
        </div>

        {/* Section 1: Presets */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--pkh-text-primary)' }}>
            🌟 ธีมสำเร็จรูปยอดนิยม (Presets)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {THEME_PRESETS.map((item) => {
              const isActive = config.theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPreset(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: isActive ? `2px solid ${item.accent}` : '1px solid var(--pkh-border-subtle)',
                    background: isActive ? 'var(--pkh-bg-subtle)' : 'var(--pkh-bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: isActive ? `0 0 10px ${item.accent}55` : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: item.accent,
                      boxShadow: `0 0 6px ${item.accent}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: 'var(--pkh-text-primary)' }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Mode (Light / Dark) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--pkh-text-primary)' }}>
            🌓 โหมดแสงสว่าง (Light / Dark Mode)
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className={`button ${config.mode === 'light' ? 'button-primary' : 'button-quiet'}`}
              onClick={() => updateConfig({ mode: 'light' })}
              style={{ flex: 1, padding: '8px', borderRadius: '10px' }}
            >
              ☀️ Light (สว่าง คมชัด)
            </button>
            <button
              type="button"
              className={`button ${config.mode === 'dark' ? 'button-primary' : 'button-quiet'}`}
              onClick={() => updateConfig({ mode: 'dark' })}
              style={{ flex: 1, padding: '8px', borderRadius: '10px' }}
            >
              🌙 Dark (มืด ลุ่มลึก นีออน)
            </button>
          </div>
        </div>

        {/* Section 3: Colors */}
        <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              🎯 สีเน้นหลัก (Accent Color)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={config.accentColor}
                onChange={(e) => updateConfig({ accentColor: e.target.value })}
                style={{ width: '40px', height: '36px', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={config.accentColor}
                onChange={(e) => updateConfig({ accentColor: e.target.value })}
                style={{ width: '90px', fontSize: '12px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              🔘 สีปุ่มกด (Button Color)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={config.buttonColor}
                onChange={(e) => updateConfig({ buttonColor: e.target.value })}
                style={{ width: '40px', height: '36px', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={config.buttonColor}
                onChange={(e) => updateConfig({ buttonColor: e.target.value })}
                style={{ width: '90px', fontSize: '12px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Sliders (Real-time) */}
        <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '12px', background: 'var(--pkh-bg-subtle)' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--pkh-text-primary)' }}>
            🎛️ ปรับแต่งมิติกระจกและแสงนีออน (Real-time Sliders)
          </label>

          {/* Neon Border Glow */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>✨ ความเข้มแสงนีออน (Neon Glow Intensity)</span>
              <strong>{config.neonGlow}%</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={config.neonGlow}
              onChange={(e) => updateConfig({ neonGlow: Number(e.target.value) })}
              style={{ width: '100%', accentColor: config.accentColor }}
            />
          </div>

          {/* Glass Blur */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>🌫️ ความเบลอกระจก (Glass Blur)</span>
              <strong>{config.glassBlur}px</strong>
            </div>
            <input
              type="range"
              min="0"
              max="32"
              value={config.glassBlur}
              onChange={(e) => updateConfig({ glassBlur: Number(e.target.value) })}
              style={{ width: '100%', accentColor: config.accentColor }}
            />
          </div>

          {/* Glass Opacity */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>💧 ความทึบ/โปร่งใสกระจก (Glass Opacity)</span>
              <strong>{config.glassOpacity}%</strong>
            </div>
            <input
              type="range"
              min="30"
              max="100"
              value={config.glassOpacity}
              onChange={(e) => updateConfig({ glassOpacity: Number(e.target.value) })}
              style={{ width: '100%', accentColor: config.accentColor }}
            />
          </div>

          {/* Border Radius */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>📐 ความโค้งมนการ์ดและป๊อปอัป (Border Radius)</span>
              <strong>{config.borderRadius}px</strong>
            </div>
            <input
              type="range"
              min="8"
              max="32"
              value={config.borderRadius}
              onChange={(e) => updateConfig({ borderRadius: Number(e.target.value) })}
              style={{ width: '100%', accentColor: config.accentColor }}
            />
          </div>
        </div>

        {/* Section 5: Custom Wallpaper URLs */}
        <div style={{ marginBottom: '22px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--pkh-text-primary)' }}>
            🖼️ วอลเปเปอร์พื้นหลังแยกอิสระ (Custom Wallpaper URL)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', display: 'block', marginBottom: '4px' }}>
                พื้นหลังเมนูด้านข้าง (Sidebar Wallpaper URL):
              </span>
              <input
                type="url"
                placeholder="https://images.unsplash.com/... (เว้นว่างไว้หากใช้สีตามธีม)"
                value={config.sidebarBgUrl}
                onChange={(e) => updateConfig({ sidebarBgUrl: e.target.value })}
                style={{
                  width: '100%',
                  fontSize: '12px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  color: 'var(--pkh-text-primary)',
                }}
              />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', display: 'block', marginBottom: '4px' }}>
                พื้นหลังหน้าเว็บหลัก (Main Canvas Wallpaper URL):
              </span>
              <input
                type="url"
                placeholder="https://images.unsplash.com/... (เว้นว่างไว้หากใช้สีตามธีม)"
                value={config.mainBgUrl}
                onChange={(e) => updateConfig({ mainBgUrl: e.target.value })}
                style={{
                  width: '100%',
                  fontSize: '12px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  color: 'var(--pkh-text-primary)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
          <button
            type="button"
            className="button button-quiet"
            onClick={handleReset}
            style={{ fontSize: '12px', borderRadius: '8px' }}
          >
            🔄 รีเซ็ตเป็นค่าเริ่มต้น
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: `${config.borderRadius * 0.7}px`,
              background: config.buttonColor,
              fontWeight: 600,
            }}
          >
            ✓ นำไปใช้งานและปิดหน้าต่าง
          </button>
        </div>
      </section>
    </div>
  );
};
