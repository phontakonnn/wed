import React, { useState } from 'react';
import type { ThemeName, ThemeMode } from '../../types';

export interface ThemePresetOption {
  id: ThemeName;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  previewGradient: string;
  badge?: string;
}

export const THEME_PRESETS: ThemePresetOption[] = [
  {
    id: 'aurora-scenic',
    name: '🌟 Aurora Scenic Ultra (ค่าเริ่มต้น)',
    nameEn: 'Aurora Scenic Twilight & Neon',
    description: 'เมชแสงเหนือเหลือบตา แถบข้างภูเขาสนธยามืดลึก บัตรนีออนเรืองแสงสะดุดตา',
    icon: '🌟',
    previewGradient: 'linear-gradient(135deg, #090e1a 0%, #1e1b4b 35%, #06b6d4 70%, #10b981 100%)',
    badge: '🌟 แนะนำ (Flagship)',
  },
  {
    id: 'mountain-twilight',
    name: '🏔️ Mountain Twilight',
    nameEn: 'Alpine Mist & Twilight Indigo',
    description: 'ภูเขาหิมะสูงตระหง่านยามสนธยา สีคราม อินดิโก้ และหมอกสีน้ำเงินลึกลับ',
    icon: '🏔️',
    previewGradient: 'linear-gradient(135deg, #070913 0%, #1e1b4b 40%, #1e3a8a 75%, #38bdf8 100%)',
    badge: 'ยอดนิยม',
  },
  {
    id: 'neon-glass',
    name: '💎 Neon Glass Bento',
    nameEn: 'Vibrant Glass Bento Grid',
    description: 'บัตรกระจกเบนโตะโปร่งแสง หักเหแสงนีออนไซยานและมาเจนต้า สไตล์ล้ำสมัย',
    icon: '💎',
    previewGradient: 'linear-gradient(135deg, #060914 0%, #06b6d4 40%, #ec4899 75%, #10b981 100%)',
    badge: 'ทันสมัย',
  },
  {
    id: 'pastel',
    name: '🌸 Pastel Dream',
    nameEn: 'Pastel Dream & Sweet Sakura',
    description: 'โทนสีพาสเทลซากุระ ละมุนตา ชมพู ม่วงลาเวนเดอร์ นุ่มนวลสบายใจ',
    icon: '🌸',
    previewGradient: 'linear-gradient(135deg, #fdf2f8 0%, #ffe4e6 35%, #e0e7ff 70%, #d1fae5 100%)',
  },
  {
    id: 'ocean',
    name: '🌊 Emerald Ocean',
    nameEn: 'Deep Ocean & Emerald Waves',
    description: 'คลื่นทะเลลึกและมรกตใต้ท้องทะเล เขียวอมฟ้าเย็นสบายตา ผ่อนคลายสูงสุด',
    icon: '🌊',
    previewGradient: 'linear-gradient(135deg, #041315 0%, #0d9488 45%, #0284c7 80%, #10b981 100%)',
  },
  {
    id: 'sunset',
    name: '🌅 Sunset Glow',
    nameEn: 'Golden Amber & Crimson Sunset',
    description: 'แสงอาทิตย์อัสดงสีทองอำพัน ส้มประกายแดง กระปรี้กระเปร่า มีพลังสร้างสรรค์',
    icon: '🌅',
    previewGradient: 'linear-gradient(135deg, #15090f 0%, #f97316 45%, #ec4899 80%, #8b5cf6 100%)',
  },
  {
    id: 'neon',
    name: '🌌 Cyber Neon Dark',
    nameEn: 'Electric Neon & Pitch Cyber',
    description: 'นีออนไซเบอร์ มืดสนิท คมชัด แสงไซยานและม่วงนีออนเรืองรองดั่งเมืองอนาคต',
    icon: '🌌',
    previewGradient: 'linear-gradient(135deg, #05060b 0%, #083344 45%, #581c87 80%, #06b6d4 100%)',
  },
  {
    id: 'minimal',
    name: '📄 Minimal Clean',
    nameEn: 'Clean Monochromatic Slate',
    description: 'เรียบง่าย มินิมอล สะอาดตา ไร้สิ่งรบกวน โฟกัสกับเนื้อหาอย่างเต็มที่',
    icon: '📄',
    previewGradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
  },
];

export const ACCENT_PRESETS = [
  { color: '#10b981', label: 'มรกต' },
  { color: '#3b82f6', label: 'ฟ้าคราม' },
  { color: '#8b5cf6', label: 'ม่วง' },
  { color: '#ec4899', label: 'ชมพู' },
  { color: '#f59e0b', label: 'ส้มอำพัน' },
  { color: '#06b6d4', label: 'ไซยาน' },
  { color: '#ef4444', label: 'แดงชาด' },
  { color: '#14b8a6', label: 'ทีลทะเล' },
];

export const BUTTON_GRADIENT_PRESETS = [
  { id: 'emerald', label: '💚 มรกตมงคล', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  { id: 'cyan', label: '💙 ไซยานบลู', gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' },
  { id: 'purple', label: '💜 เนบิวลาม่วง', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' },
  { id: 'rose', label: '💖 ซันเซ็ตโรส', gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)' },
  { id: 'amber', label: '💛 อำพันทอง', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  { id: 'obsidian', label: '🖤 ดาร์กออบซิเดียน', gradient: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)' },
];

export interface WallpaperPreset {
  id: string;
  name: string;
  category: string;
  url: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'mountain-twilight',
    name: '🏔️ ยอดเขาหิมะสนธยา',
    category: 'ธรรมชาติ',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'space-nebula',
    name: '🌌 ห้วงอวกาศและเนบิวลา',
    category: 'อวกาศ',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'pine-lake',
    name: '🌲 ป่าสนและสายหมอก',
    category: 'ธรรมชาติ',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'ocean-waves',
    name: '🌊 คลื่นทะเลมรกต',
    category: 'ธรรมชาติ',
    url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'cyber-city',
    name: '🌆 แสงสีเมืองนีออน',
    category: 'ไซเบอร์',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'pastel-sunset',
    name: '🌸 ท้องฟ้าอัสดงพาสเทล',
    category: 'พาสเทล',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'abstract-minimal',
    name: '📄 คลื่นเรขาคณิตคลีน',
    category: 'มินิมอล',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80',
  },
];

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeName;
  onSelectTheme: (name: ThemeName) => void;
  themeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
  themes?: Array<{ name: ThemeName; label: string; color: string }>;
  animatedGlow?: boolean;
  onToggleAnimatedGlow?: (val: boolean) => void;
  glassCard?: boolean;
  onToggleGlassCard?: (val: boolean) => void;
  hoverLift?: boolean;
  onToggleHoverLift?: (val: boolean) => void;
  accentColor?: string;
  onSelectAccentColor?: (color: string) => void;
  neonGlowOpacity?: number;
  onChangeNeonGlowOpacity?: (val: number) => void;
  glassBlur?: number;
  onChangeGlassBlur?: (val: number) => void;
  glassOpacity?: number;
  onChangeGlassOpacity?: (val: number) => void;
  cardRadius?: number;
  onChangeCardRadius?: (val: number) => void;
  btnGradient?: string;
  onChangeBtnGradient?: (val: string) => void;
  customCanvasBg?: string;
  onChangeCustomCanvasBg?: (val: string) => void;
  customSidebarBg?: string;
  onChangeCustomSidebarBg?: (val: string) => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  theme,
  onSelectTheme,
  themeMode,
  onSelectThemeMode,
  animatedGlow = true,
  onToggleAnimatedGlow,
  glassCard = true,
  onToggleGlassCard,
  hoverLift = true,
  onToggleHoverLift,
  accentColor = '#10b981',
  onSelectAccentColor,
  neonGlowOpacity = 70,
  onChangeNeonGlowOpacity,
  glassBlur = 16,
  onChangeGlassBlur,
  glassOpacity = 75,
  onChangeGlassOpacity,
  cardRadius = 20,
  onChangeCardRadius,
  btnGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  onChangeBtnGradient,
  customCanvasBg = '',
  onChangeCustomCanvasBg,
  customSidebarBg = '',
  onChangeCustomSidebarBg,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'wallpaper' | 'sliders' | 'colors'>('presets');

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="🎨 สตูดิโอปรับแต่งธีม พื้นหลัง และเอฟเฟกต์พิเศษ"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--pkh-border-subtle, #e2e8f0)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>🎨</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--pkh-text-primary)' }}>
                สตูดิโอปรับแต่งธีมขั้นสูงสุด (Theme Studio)
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                ปรับแต่งรูปลักษณ์ แสงนีออน บัตรกระจก พื้นหลังแยกส่วน และสีสันทั่วทั้งระบบ
              </span>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            style={{ fontSize: '20px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            type="button"
            className={`button ${activeTab === 'presets' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('presets')}
          >
            🌟 ธีมสำเร็จรูป (Presets)
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'wallpaper' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('wallpaper')}
          >
            🖼️ พื้นหลัง & คลังภาพวิว
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'sliders' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('sliders')}
          >
            🎛️ มิติแสง & บัตรกระจก (Sliders)
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'colors' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('colors')}
          >
            🎯 สีเน้น & สีปุ่มกด
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>

          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                  เลือกธีมสำเร็จรูป (8 ธีมยอดนิยม)
                </span>
                {/* Theme Mode Quick Toggle */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className={`button ${themeMode === 'light' ? 'button-primary' : 'button-quiet'}`}
                    style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px' }}
                    onClick={() => onSelectThemeMode('light')}
                  >
                    ☀️ โหมดสว่าง
                  </button>
                  <button
                    type="button"
                    className={`button ${themeMode === 'dark' ? 'button-primary' : 'button-quiet'}`}
                    style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px' }}
                    onClick={() => onSelectThemeMode('dark')}
                  >
                    🌙 โหมดมืด
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                {THEME_PRESETS.map((item) => {
                  const isActive = theme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTheme(item.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: '12px',
                        border: isActive
                          ? '2px solid var(--pkh-primary, #10b981)'
                          : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                        backgroundColor: isActive
                          ? 'var(--pkh-primary-light, rgba(16, 185, 129, 0.08))'
                          : 'var(--pkh-bg-surface, #ffffff)',
                        boxShadow: isActive ? '0 4px 14px rgba(16, 185, 129, 0.25)' : 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      {/* Visual gradient bar preview */}
                      <div
                        style={{
                          height: '42px',
                          borderRadius: '8px',
                          background: item.previewGradient,
                          marginBottom: '8px',
                          border: '1px solid rgba(0,0,0,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 10px',
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>{item.icon}</span>
                        {item.badge && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.92)',
                              color: '#0f172a',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                          {item.name}
                        </strong>
                        {isActive && <span style={{ color: 'var(--pkh-primary, #10b981)', fontSize: '15px', fontWeight: 700 }}>✓</span>}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--pkh-text-muted)', lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: WALLPAPERS & BACKGROUNDS */}
          {activeTab === 'wallpaper' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Custom URL Inputs */}
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                    🔗 วางลิงก์รูปภาพพื้นหลังของตนเอง (Custom Wallpaper URL)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                    ใส่ URL รูปภาพภายนอกได้อิสระ
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {/* Main Canvas Wallpaper Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                      🌌 พื้นที่หน้าหลัก (Main Canvas URL)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="url"
                        placeholder="https://... หรือ URL รูปภาพ"
                        value={customCanvasBg}
                        onChange={(e) => onChangeCustomCanvasBg?.(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--pkh-border-default)',
                          fontSize: '12px',
                        }}
                      />
                      {customCanvasBg && (
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => onChangeCustomCanvasBg?.('')}
                          title="ล้างภาพพื้นหลัง"
                        >
                          ล้าง
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sidebar Wallpaper Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                      🌲 แถบข้าง (Sidebar URL)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="url"
                        placeholder="https://... หรือ URL รูปภาพ"
                        value={customSidebarBg}
                        onChange={(e) => onChangeCustomSidebarBg?.(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--pkh-border-default)',
                          fontSize: '12px',
                        }}
                      />
                      {customSidebarBg && (
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => onChangeCustomSidebarBg?.('')}
                          title="ล้างภาพแถบข้าง"
                        >
                          ล้าง
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallpaper Preset Gallery */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                    🌄 คลังภาพวิวธรรมชาติ อวกาศ และมินิมอลสำเร็จรูป
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                    คลิกเลือกตั้งค่าลงหน้าหลักหรือแถบข้างได้ในคลิกเดียว
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {WALLPAPER_PRESETS.map((wp) => (
                    <div
                      key={wp.id}
                      style={{
                        borderRadius: '10px',
                        border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--pkh-bg-surface, #ffffff)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div
                        style={{
                          height: '90px',
                          backgroundImage: `url("${wp.url}")`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          position: 'relative',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            color: '#ffffff',
                          }}
                        >
                          {wp.category}
                        </span>
                      </div>
                      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {wp.name}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="button button-quiet"
                            style={{ flex: 1, fontSize: '10px', padding: '3px 4px', height: '26px' }}
                            onClick={() => onChangeCustomCanvasBg?.(wp.url)}
                            title="ตั้งเป็นภาพพื้นหลังหน้าหลัก"
                          >
                            🖼️ หน้าหลัก
                          </button>
                          <button
                            type="button"
                            className="button button-quiet"
                            style={{ flex: 1, fontSize: '10px', padding: '3px 4px', height: '26px' }}
                            onClick={() => onChangeCustomSidebarBg?.(wp.url)}
                            title="ตั้งเป็นภาพพื้นหลังแถบข้าง"
                          >
                            🌲 แถบข้าง
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SLIDERS & EFFECTS */}
          {activeTab === 'sliders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                  🎛️ แถบเลื่อนปรับแต่งมิติเอฟเฟกต์แบบเรียลไทม์ (Real-time Sliders)
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  {/* Slider 1: Neon Border Glow */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        ⚡ Neon Border Glow Intensity
                      </label>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pkh-primary, #10b981)' }}>
                        {neonGlowOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={neonGlowOpacity}
                      onChange={(e) => onChangeNeonGlowOpacity?.(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--pkh-primary, #10b981)' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)' }}>ความเข้มของแสงนีออนเรืองรองขอบการ์ดและป๊อปอัป</span>
                  </div>

                  {/* Slider 2: Glass Blur */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        🪟 Glass Blur (ความเบลอ)
                      </label>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                        {glassBlur}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      step="1"
                      value={glassBlur}
                      onChange={(e) => onChangeGlassBlur?.(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)' }}>ระดับความเบลอของกระจกใส (0px - 32px)</span>
                  </div>

                  {/* Slider 3: Glass Opacity */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        🧊 Glass Opacity (ความโปร่งใส)
                      </label>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#06b6d4' }}>
                        {glassOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="100"
                      step="5"
                      value={glassOpacity}
                      onChange={(e) => onChangeGlassOpacity?.(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#06b6d4' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)' }}>ระดับความโปร่งใสของการ์ดกระจก (30% - 100%)</span>
                  </div>

                  {/* Slider 4: Card & Modal Border Radius */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        📐 Card & Modal Radius (ความโค้งมน)
                      </label>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#a855f7' }}>
                        {cardRadius}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="32"
                      step="1"
                      value={cardRadius}
                      onChange={(e) => onChangeCardRadius?.(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#a855f7' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--pkh-text-muted)' }}>ความโค้งมนของกรอบการ์ดและทุก Pop-up Modal</span>
                  </div>
                </div>
              </div>

              {/* Special Effect Toggles */}
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                  ✨ สวิตช์ฟังก์ชันพิเศษ
                </span>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>✨</span>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--pkh-text-primary)', display: 'block' }}>Animated Background Glow</strong>
                      <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>แสงเรืองฟุ้งเคลื่อนไหวนุ่มนวล</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={animatedGlow}
                    onChange={(e) => onToggleAnimatedGlow?.(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--pkh-primary, #10b981)' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0', borderTop: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🪟</span>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--pkh-text-primary)', display: 'block' }}>Glass Card Blur Effect</strong>
                      <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>เอฟเฟกต์กระจกเบลอโปร่งแสงบนการ์ดและป๊อปอัป</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={glassCard}
                    onChange={(e) => onToggleGlassCard?.(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--pkh-primary, #10b981)' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0', borderTop: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>💫</span>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--pkh-text-primary)', display: 'block' }}>3D Hover Lift & Glow</strong>
                      <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>การ์ดยกตัวลอยขึ้น 3D เมื่อเลื่อนเมาส์ชี้</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={hoverLift}
                    onChange={(e) => onToggleHoverLift?.(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--pkh-primary, #10b981)' }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: ACCENT & BUTTON COLORS */}
          {activeTab === 'colors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Accent Color */}
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)', display: 'block' }}>
                      🎯 สีเน้นหลัก (Custom Accent Color)
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                      ใช้กับไฮไลต์ ไอคอนที่เลือก และขอบเน้น
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>สีอิสระ:</span>
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => onSelectAccentColor?.(e.target.value)}
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        border: '1px solid var(--pkh-border-default)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                      }}
                      title="คลิกเพื่อเลือกสีตามต้องการ"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ACCENT_PRESETS.map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => onSelectAccentColor?.(item.color)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: accentColor === item.color ? `2px solid ${item.color}` : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                        backgroundColor: 'var(--pkh-bg-surface, #ffffff)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: accentColor === item.color ? 700 : 400,
                      }}
                    >
                      <span
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          backgroundColor: item.color,
                          display: 'inline-block',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Button Gradient */}
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)', display: 'block' }}>
                    🔘 สไตล์สีและเกรเดียนต์ของปุ่มกด (Button Color / Gradient)
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                    กำหนดเฉดสีสำหรับปุ่มหลักทั่วทั้งระบบ
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {BUTTON_GRADIENT_PRESETS.map((item) => {
                    const isSelected = btnGradient === item.gradient;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onChangeBtnGradient?.(item.gradient)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--pkh-primary, #10b981)' : '1px solid var(--pkh-border-subtle, #e2e8f0)',
                          background: item.gradient,
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '12px',
                          boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.25)' : 'none',
                        }}
                      >
                        <span>{item.label}</span>
                        {isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--pkh-border-subtle, #e2e8f0)', paddingTop: '12px', marginTop: 'auto' }}>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px' }}
          >
            ✓ เสร็จสิ้น & บันทึกการตั้งค่า
          </button>
        </div>
      </section>
    </div>
  );
};
