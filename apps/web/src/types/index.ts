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

export type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'unavailable';

export type ThemeName = 'emerald' | 'indigo' | 'rose' | 'amber' | 'violet';
export type ThemeMode = 'light' | 'dark';

export interface ProfileState {
  name: string;
  status: string;
  avatarPreset: string;
  avatarFileId: string | null;
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
