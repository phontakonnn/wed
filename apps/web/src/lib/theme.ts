import type { ThemeConfig, ThemeMode } from '../types';
import { db, auth } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  theme: 'aurora',
  mode: 'dark',
  sidebarBgUrl: '',
  mainBgUrl: '',
  neonGlow: 65,
  glassBlur: 16,
  glassOpacity: 85,
  borderRadius: 18,
  accentColor: '#10b981',
  buttonColor: '#059669',
};

export interface ThemePreset {
  id: string;
  name: string;
  label: string;
  icon: string;
  accent: string;
  button: string;
  mode: ThemeMode;
  neonGlow: number;
  glassBlur: number;
  glassOpacity: number;
  borderRadius: number;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'aurora',
    name: 'aurora',
    label: '🌟 Aurora Scenic Ultra',
    icon: '🌟',
    accent: '#10b981',
    button: '#059669',
    mode: 'dark',
    neonGlow: 65,
    glassBlur: 16,
    glassOpacity: 85,
    borderRadius: 18,
  },
  {
    id: 'cyberpunk',
    name: 'cyberpunk',
    label: '🌌 Midnight Cyberpunk',
    icon: '🌌',
    accent: '#06b6d4',
    button: '#ec4899',
    mode: 'dark',
    neonGlow: 95,
    glassBlur: 14,
    glassOpacity: 88,
    borderRadius: 12,
  },
  {
    id: 'emerald',
    name: 'emerald',
    label: '🌲 Emerald Forest',
    icon: '🌲',
    accent: '#10b981',
    button: '#047857',
    mode: 'light',
    neonGlow: 35,
    glassBlur: 8,
    glassOpacity: 95,
    borderRadius: 14,
  },
  {
    id: 'indigo',
    name: 'indigo',
    label: '👑 Royal Indigo',
    icon: '👑',
    accent: '#6366f1',
    button: '#4f46e5',
    mode: 'dark',
    neonGlow: 55,
    glassBlur: 14,
    glassOpacity: 90,
    borderRadius: 16,
  },
  {
    id: 'rose',
    name: 'rose',
    label: '🌸 Rose Quartz',
    icon: '🌸',
    accent: '#f43f5e',
    button: '#e11d48',
    mode: 'light',
    neonGlow: 45,
    glassBlur: 12,
    glassOpacity: 92,
    borderRadius: 20,
  },
  {
    id: 'amber',
    name: 'amber',
    label: '🌅 Amber Sunset',
    icon: '🌅',
    accent: '#f59e0b',
    button: '#d97706',
    mode: 'dark',
    neonGlow: 50,
    glassBlur: 10,
    glassOpacity: 90,
    borderRadius: 14,
  },
  {
    id: 'dracula',
    name: 'dracula',
    label: '🧛 Dracula Dark',
    icon: '🧛',
    accent: '#bd93f9',
    button: '#ff79c6',
    mode: 'dark',
    neonGlow: 70,
    glassBlur: 16,
    glassOpacity: 85,
    borderRadius: 16,
  },
  {
    id: 'nord',
    name: 'nord',
    label: '❄️ Nord Arctic',
    icon: '❄️',
    accent: '#88c0d0',
    button: '#5e81ac',
    mode: 'dark',
    neonGlow: 35,
    glassBlur: 10,
    glassOpacity: 92,
    borderRadius: 12,
  },
];

function hexToRgb(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return '16, 185, 129';
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r}, ${g}, ${b}`;
}

export function loadStoredThemeConfig(): ThemeConfig {
  try {
    const raw = localStorage.getItem('pkh.themeConfig');
    if (raw) {
      return { ...DEFAULT_THEME_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_THEME_CONFIG };
}

export function applyThemeConfig(config: ThemeConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.dataset.theme = config.theme;
  root.dataset.mode = config.mode;

  const rgb = hexToRgb(config.accentColor);
  const glowAlpha = ((config.neonGlow ?? 65) / 100) * 0.45;
  const borderAlpha = Math.min(1, glowAlpha * 1.5 + 0.15);

  root.style.setProperty('--pkh-primary', config.accentColor);
  root.style.setProperty('--pkh-primary-hover', config.accentColor);
  root.style.setProperty('--pkh-primary-gradient', `linear-gradient(135deg, ${config.accentColor} 0%, ${config.buttonColor} 100%)`);
  root.style.setProperty('--pkh-btn-primary-bg', config.buttonColor);

  const radius = config.borderRadius ?? 18;
  root.style.setProperty('--pkh-radius-sm', `${Math.max(4, radius * 0.4)}px`);
  root.style.setProperty('--pkh-radius-md', `${Math.max(6, radius * 0.7)}px`);
  root.style.setProperty('--pkh-radius-lg', `${radius}px`);
  root.style.setProperty('--pkh-radius-xl', `${Math.round(radius * 1.3)}px`);
  root.style.setProperty('--pkh-radius-2xl', `${Math.round(radius * 1.6)}px`);

  const blur = config.glassBlur ?? 16;
  root.style.setProperty('--pkh-glass-blur', `${blur}px`);
  const opacity = (config.glassOpacity ?? 85) / 100;
  root.style.setProperty('--pkh-glass-opacity', `${opacity}`);

  root.style.setProperty('--pkh-neon-glow', `0 0 20px rgba(${rgb}, ${glowAlpha})`);
  root.style.setProperty('--pkh-neon-border', `1px solid rgba(${rgb}, ${borderAlpha})`);

  if (config.sidebarBgUrl && config.sidebarBgUrl.trim()) {
    root.style.setProperty('--pkh-sidebar-bg', `url("${config.sidebarBgUrl.trim()}") center/cover no-repeat`);
  } else {
    root.style.removeProperty('--pkh-sidebar-bg');
  }

  if (config.mainBgUrl && config.mainBgUrl.trim()) {
    root.style.setProperty('--pkh-main-bg', `url("${config.mainBgUrl.trim()}") center/cover fixed no-repeat`);
  } else {
    root.style.removeProperty('--pkh-main-bg');
  }
}

export async function saveThemeConfig(config: ThemeConfig, userUid?: string | null): Promise<void> {
  try {
    localStorage.setItem('pkh.themeConfig', JSON.stringify(config));
    localStorage.setItem('pkh.theme', config.theme);
    localStorage.setItem('pkh.themeMode', config.mode);
  } catch {
    // ignore
  }

  const uid = userUid || auth.currentUser?.uid;
  if (uid) {
    try {
      const themeDocRef = doc(db, 'users', uid, 'settings', 'theme');
      await setDoc(themeDocRef, { ...config, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.warn('Could not save theme to Firestore:', err);
    }
  }
}
