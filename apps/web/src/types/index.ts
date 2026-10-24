import type {
  Note,
  Bookmark,
  StoredFile,
  VaultCategory,
  LibraryCategory,
  LibraryStatus,
  User,
} from '../api';

export type { NotesView, SidebarNavItem } from '../sidebarNav';
export type { User };

export type AuthState = 'checking' | 'signed-out' | 'signed-in';

export type ThemeName =
  | 'aurora-scenic'
  | 'mountain-twilight'
  | 'neon-glass'
  | 'aurora'
  | 'orbs'
  | 'glass'
  | 'pastel'
  | 'ocean'
  | 'sunset'
  | 'neon'
  | 'minimal'
  | 'emerald'
  | 'indigo'
  | 'rose'
  | 'amber'
  | 'violet';
export type ThemeMode = 'light' | 'dark';

/** fast = solid surfaces, no blur; rich = opt-in blur/shadow at a few points. */
export type UiMode = 'fast' | 'rich';

export interface ThemeConfig {
  mode: ThemeMode;
  uiMode: UiMode;
  accentColor: string;
  /** Legacy fields are read-only during migration; new code ignores them. */
  theme?: ThemeName;
  sidebarBgUrl?: string;
  mainBgUrl?: string;
  neonGlow?: number;
  glassBlur?: number;
  glassOpacity?: number;
  borderRadius?: number;
  buttonColor?: string;
}


export interface ProfileState {
  name: string;
  status: string;
  avatarPreset: string;
  avatarFileId: string | null;
  avatarDataUrl?: string | null;
  bio?: string;
}

export type TaxonomyKind = 'categories' | 'tags';

export type AllEntry =
  | { kind: 'note'; id: string; title: string; subtitle: string; timestamp: number; note: Note }
  | { kind: 'bookmark'; id: string; title: string; subtitle: string; timestamp: number; bookmark: Bookmark }
  | { kind: 'file'; id: string; title: string; subtitle: string; timestamp: number; file: StoredFile };

export interface VaultDraft {
  title: string;
  category: VaultCategory;
  keyValue: string;
  physicalLocation: string;
  renewalOrExpiryDate: string;
  amountText: string;
  notes: string;
}

export interface LibraryDraft {
  title: string;
  category: LibraryCategory;
  status: LibraryStatus;
  sourceUrlOrAuthor: string;
  keyTakeaways: string;
  content: string;
}
