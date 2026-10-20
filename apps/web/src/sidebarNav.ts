export type NotesView =
  | 'home'
  | 'all'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'notes'
  | 'people'
  | 'schedule'
  | 'trash'
  | 'bookmarks'
  | 'favorites'
  | 'files'
  | 'vault'
  | 'library'
  | 'custom-category';

export interface SidebarNavItem {
  id: string;
  view: NotesView;
  label: string;
  defaultLabel: string;
  icon: string;
  enabled: boolean;
}

export const DEFAULT_SIDEBAR_NAV: SidebarNavItem[] = [
  { id: 'home', view: 'home', label: 'ภาพรวมวันนี้', defaultLabel: 'ภาพรวมวันนี้', icon: '⌂', enabled: true },
  { id: 'inbox', view: 'inbox', label: 'กล่องขาเข้า', defaultLabel: 'กล่องขาเข้า', icon: '⇥', enabled: true },
  { id: 'tasks', view: 'tasks', label: 'งานที่ต้องทำ', defaultLabel: 'งานที่ต้องทำ', icon: '☑', enabled: true },
  { id: 'projects', view: 'projects', label: 'โปรเจกต์', defaultLabel: 'โปรเจกต์', icon: '▣', enabled: true },
  { id: 'goals', view: 'goals', label: 'เป้าหมาย', defaultLabel: 'เป้าหมาย', icon: '◎', enabled: true },
  { id: 'notes', view: 'notes', label: 'โน้ตของฉัน', defaultLabel: 'โน้ตของฉัน', icon: '✎', enabled: true },
  { id: 'people', view: 'people', label: 'บุคคลสำคัญ', defaultLabel: 'บุคคลสำคัญ', icon: '♥', enabled: true },
  { id: 'schedule', view: 'schedule', label: 'ปฏิทิน & ตารางชีวิต', defaultLabel: 'ปฏิทิน & ตารางชีวิต', icon: '▦', enabled: true },
  { id: 'bookmarks', view: 'bookmarks', label: 'บุ๊กมาร์ก', defaultLabel: 'บุ๊กมาร์ก', icon: '↗', enabled: true },
  { id: 'vault', view: 'vault', label: 'คลังสำคัญ & ทรัพย์สิน (Vault)', defaultLabel: 'คลังสำคัญ & ทรัพย์สิน (Vault)', icon: '🔐', enabled: true },
  { id: 'library', view: 'library', label: 'ห้องสมุด & คู่มือชีวิต (Library)', defaultLabel: 'ห้องสมุด & คู่มือชีวิต (Library)', icon: '📚', enabled: true },
  { id: 'files', view: 'files', label: 'คลังไฟล์', defaultLabel: 'คลังไฟล์', icon: '▤', enabled: true },
  { id: 'favorites', view: 'favorites', label: 'รายการโปรด', defaultLabel: 'รายการโปรด', icon: '★', enabled: true },
  { id: 'trash', view: 'trash', label: 'ถังขยะ', defaultLabel: 'ถังขยะ', icon: '⌫', enabled: true },
];

const STORAGE_KEY = 'pkh.sidebarNav';

export function loadSidebarNav(): SidebarNavItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
    const parsed = JSON.parse(raw) as Partial<SidebarNavItem>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
    }

    const result: SidebarNavItem[] = [];
    const seenIds = new Set<string>();

    for (const item of parsed) {
      if (!item.id) continue;
      const def = DEFAULT_SIDEBAR_NAV.find((d) => d.id === item.id);
      if (def) {
        result.push({
          id: def.id,
          view: def.view,
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : def.defaultLabel,
          defaultLabel: def.defaultLabel,
          icon: def.icon,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : def.enabled,
        });
        seenIds.add(def.id);
      }
    }

    // Append any default items that weren't in saved storage
    for (const def of DEFAULT_SIDEBAR_NAV) {
      if (!seenIds.has(def.id)) {
        result.push({ ...def });
      }
    }

    return result;
  } catch {
    return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
  }
}

export function saveSidebarNav(items: SidebarNavItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function resetSidebarNav(): SidebarNavItem[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
}
