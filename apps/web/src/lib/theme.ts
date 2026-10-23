import type { ThemeConfig, ThemeMode, UiMode } from '../types';
import { logger } from './logger';

/**
 * Single theme engine for the Calm Minimal UI.
 *
 * Storage contract:
 * - `pkh.ui.v2` is the source of truth ({ mode, uiMode, accentColor }).
 * - Legacy keys (`pkh.theme`, `pkh.themeMode`, `pkh.accentColor`, effect sliders)
 *   are kept but never deleted, so an older build can still read them.
 */
export const THEME_STORAGE_KEY = 'pkh.ui.v2';

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: 'light',
  uiMode: 'fast',
  accentColor: '#0b7d59',
};

/** Old emerald defaults that cannot reach 4.5:1 on white. */
const LEGACY_DEFAULT_ACCENTS = new Set(['#10b981', '#0f9f6e']);

interface AccentPreset {
  color: string;
  label: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { color: '#0b7d59', label: 'มรกต' },
  { color: '#1d4ed8', label: 'ฟ้าคราม' },
  { color: '#6d28d9', label: 'ม่วง' },
  { color: '#be185d', label: 'ชมพู' },
  { color: '#9a3412', label: 'อำพัน' },
  { color: '#0e7490', label: 'ทีล' },
];

function normalizeHex(input: string | undefined, fallback = DEFAULT_THEME_CONFIG.accentColor): string {
  if (!input) return fallback;
  let value = input.trim().replace('#', '');
  if (value.length === 3) {
    value = value.split('').map((char) => char + char).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  const hex = `#${value.toLowerCase()}`;
  // The old emerald failed AA on white; migrate it to the accessible default.
  return LEGACY_DEFAULT_ACCENTS.has(hex) ? fallback : hex;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex).slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(channel: number): string {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
}

/** Mix `hex` toward `target` (#ffffff or #000000); amount 0-1. */
function mix(hex: string, target: '#ffffff' | '#000000', amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = target === '#ffffff' ? [255, 255, 255] : [0, 0, 0];
  const ratio = Math.max(0, Math.min(1, amount));
  return `#${toHex(r + (tr - r) * ratio)}${toHex(g + (tg - g) * ratio)}${toHex(b + (tb - b) * ratio)}`;
}

export function normalizeThemeConfig(input: Partial<ThemeConfig> | null | undefined): ThemeConfig {
  const mode: ThemeMode = input?.mode === 'dark' ? 'dark' : 'light';
  const uiMode: UiMode = input?.uiMode === 'rich' ? 'rich' : 'fast';
  return {
    mode,
    uiMode,
    accentColor: normalizeHex(input?.accentColor),
  };
}

export function loadThemeConfig(): ThemeConfig {
  const fallback = { ...DEFAULT_THEME_CONFIG };
  if (typeof localStorage === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) return normalizeThemeConfig(JSON.parse(raw) as Partial<ThemeConfig>);
  } catch {
    // corrupt value: fall through to legacy migration
  }

  // One-way migration: read old keys, do not delete them.
  try {
    const legacyMode = localStorage.getItem('pkh.themeMode');
    const legacyAccent = localStorage.getItem('pkh.accentColor');
    return normalizeThemeConfig({
      mode: legacyMode === 'dark' ? 'dark' : 'light',
      uiMode: 'fast',
      accentColor: legacyAccent ?? fallback.accentColor,
    });
  } catch {
    return fallback;
  }
}

export function applyThemeConfig(config: ThemeConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const normalized = normalizeThemeConfig(config);
  const isDark = normalized.mode === 'dark';
  // In dark mode a deep accent would disappear, so lift it toward white.
  // The stored value stays exactly what the user picked.
  const accent = isDark ? mix(normalized.accentColor, '#ffffff', 0.42) : normalized.accentColor;
  const [r, g, b] = hexToRgb(accent);

  root.dataset.theme = normalized.mode;
  root.dataset.mode = normalized.mode;
  root.dataset.uiMode = normalized.uiMode;

  // Keep the mobile browser chrome in sync with the canvas colour so the
  // status bar does not flash a light strip above a dark app.
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.content = isDark ? '#0f1522' : '#f8fafc';
  }

  // Remove the legacy effect switches so no old selector can re-enable glass/glow.
  delete root.dataset.bgEffect;
  delete root.dataset.animatedGlow;
  delete root.dataset.glassCard;
  delete root.dataset.hoverLift;

  root.style.setProperty('--pkh-primary', accent);
  root.style.setProperty('--pkh-accent', accent);
  root.style.setProperty('--pkh-accent-color', accent);
  root.style.setProperty('--pkh-accent-rgb', `${r}, ${g}, ${b}`);
  // Keep the semantic layer in sync so ring/focus and newer components follow
  // the user's accent instead of the stylesheet default.
  root.style.setProperty('--pkh-color-accent', accent);
  root.style.setProperty('--pkh-color-accent-hover', mix(accent, normalized.mode === 'dark' ? '#ffffff' : '#000000', 0.12));
  root.style.setProperty('--pkh-color-accent-strong', isDark ? mix(accent, '#ffffff', 0.12) : mix(accent, '#000000', 0.22));
  root.style.setProperty('--pkh-color-accent-soft', normalized.mode === 'dark' ? mix(accent, '#000000', 0.72) : mix(accent, '#ffffff', 0.9));
  root.style.setProperty('--pkh-color-accent-border', normalized.mode === 'dark' ? mix(accent, '#000000', 0.45) : mix(accent, '#ffffff', 0.62));
  root.style.setProperty('--pkh-primary-hover', mix(accent, normalized.mode === 'dark' ? '#ffffff' : '#000000', 0.12));
  root.style.setProperty('--pkh-primary-dark', isDark ? mix(accent, '#ffffff', 0.12) : mix(accent, '#000000', 0.22));
  root.style.setProperty('--pkh-primary-light', normalized.mode === 'dark' ? mix(accent, '#000000', 0.72) : mix(accent, '#ffffff', 0.9));
  root.style.setProperty('--pkh-primary-border', normalized.mode === 'dark' ? mix(accent, '#000000', 0.45) : mix(accent, '#ffffff', 0.62));
  root.style.setProperty('--pkh-accent-light', normalized.mode === 'dark' ? mix(accent, '#000000', 0.72) : mix(accent, '#ffffff', 0.9));
  root.style.setProperty('--pkh-accent-text', normalized.mode === 'dark' ? mix(accent, '#ffffff', 0.35) : mix(accent, '#000000', 0.28));
  root.style.setProperty('--pkh-primary-gradient', `linear-gradient(135deg, ${accent} 0%, ${accent} 100%)`);
  root.style.setProperty('--pkh-btn-gradient', `linear-gradient(135deg, ${accent} 0%, ${accent} 100%)`);

  // Wallpapers and custom canvases are retired in this UI mode.
  root.style.removeProperty('--pkh-custom-canvas-bg');
  root.style.removeProperty('--pkh-canvas-bg');
  root.style.removeProperty('--pkh-custom-sidebar-bg');
  root.style.removeProperty('--pkh-sidebar-bg');
  root.style.removeProperty('--pkh-main-bg');
}

export async function saveThemeConfig(config: ThemeConfig, userUid?: string | null): Promise<void> {
  const normalized = normalizeThemeConfig(config);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalized));
    // Keep legacy keys in sync for older builds; never remove them.
    localStorage.setItem('pkh.themeMode', normalized.mode);
    localStorage.setItem('pkh.accentColor', normalized.accentColor);
  } catch {
    // storage may be unavailable (private mode)
  }

  const uid = userUid
    || (await import('./firebaseAuth')).auth.currentUser?.uid;
  if (!uid) return;

  try {
    // Firestore is only touched for a signed-in user, so this import stays off
    // the boot path (theme must apply before first paint).
    const [{ db }, { doc, setDoc }] = await Promise.all([
      import('./firebaseDb'),
      import('firebase/firestore'),
    ]);
    const themeDocRef = doc(db, 'users', uid, 'settings', 'theme');
    await setDoc(
      themeDocRef,
      {
        themeMode: normalized.mode,
        uiMode: normalized.uiMode,
        accentColor: normalized.accentColor,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (err) {
    logger.warn('Could not save theme to Firestore', 'theme.save', { error: err });
  }
}
