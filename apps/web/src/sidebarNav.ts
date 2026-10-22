export type NotesView =
  | 'home'
  | 'all'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'notes'
  | 'watchlist'
  | 'shopping'
  | 'travel'
  | 'people'
  | 'schedule'
  | 'trash'
  | 'bookmarks'
  | 'favorites'
  | 'files'
  | 'vault'
  | 'library'
  | 'custom-category'
  | 'help-support'
  | 'custom-type'
  | 'admin';

export interface SidebarNavItem {
  id: string;
  view: NotesView;
  label: string;
  defaultLabel: string;
  icon: string;
  enabled: boolean;
}

export const DEFAULT_SIDEBAR_NAV: SidebarNavItem[] = [
  { id: 'home', view: 'home', label: 'ภาพรวมวันนี้', defaultLabel: 'ภาพรวมวันนี้', icon: '🏠', enabled: true },
  { id: 'inbox', view: 'inbox', label: 'กล่องขาเข้า', defaultLabel: 'กล่องขาเข้า', icon: '📥', enabled: true },
  { id: 'tasks', view: 'tasks', label: 'งานที่ต้องทำ', defaultLabel: 'งานที่ต้องทำ', icon: '✅', enabled: true },
  { id: 'projects', view: 'projects', label: 'โปรเจกต์', defaultLabel: 'โปรเจกต์', icon: '🚀', enabled: true },
  { id: 'goals', view: 'goals', label: 'เป้าหมาย', defaultLabel: 'เป้าหมาย', icon: '🎯', enabled: true },
  { id: 'people', view: 'people', label: 'บุคคลสำคัญ', defaultLabel: 'บุคคลสำคัญ', icon: '👥', enabled: true },
  { id: 'schedule', view: 'schedule', label: 'ปฏิทิน & ตารางชีวิต', defaultLabel: 'ปฏิทิน & ตารางชีวิต', icon: '📅', enabled: true },
  { id: 'notes', view: 'notes', label: 'โน้ตของฉัน', defaultLabel: 'โน้ตของฉัน', icon: '📝', enabled: true },
  { id: 'bookmarks', view: 'bookmarks', label: 'บุ๊กมาร์ก', defaultLabel: 'บุ๊กมาร์ก', icon: '🔖', enabled: true },
  { id: 'vault', view: 'vault', label: 'คลังสำคัญ & ทรัพย์สิน (Vault)', defaultLabel: 'คลังสำคัญ & ทรัพย์สิน (Vault)', icon: '🔐', enabled: true },
  { id: 'library', view: 'library', label: 'ห้องสมุด & คู่มือชีวิต (Library)', defaultLabel: 'ห้องสมุด & คู่มือชีวิต (Library)', icon: '📚', enabled: true },
  { id: 'files', view: 'files', label: 'คลังไฟล์', defaultLabel: 'คลังไฟล์', icon: '🗂️', enabled: true },
  { id: 'watchlist', view: 'watchlist', label: 'หนัง/ซีรีส์ที่อยากดู', defaultLabel: 'หนัง/ซีรีส์ที่อยากดู', icon: '🎬', enabled: true },
  { id: 'shopping', view: 'shopping', label: 'ของใช้ที่ต้องซื้อ', defaultLabel: 'ของใช้ที่ต้องซื้อ', icon: '🛒', enabled: true },
  { id: 'travel', view: 'travel', label: 'สถานที่เที่ยวที่อยากไป', defaultLabel: 'สถานที่เที่ยวที่อยากไป', icon: '✈️', enabled: true },
  { id: 'favorites', view: 'favorites', label: 'รายการโปรด', defaultLabel: 'รายการโปรด', icon: '⭐', enabled: true },
  { id: 'help-support', view: 'help-support', label: 'ศูนย์ช่วยเหลือ & ติดต่อผู้ดูแล', defaultLabel: 'ศูนย์ช่วยเหลือ & ติดต่อผู้ดูแล', icon: '💬', enabled: true },
  { id: 'trash', view: 'trash', label: 'ถังขยะ', defaultLabel: 'ถังขยะ', icon: '🗑️', enabled: true },
];

const STORAGE_KEY = 'pkh.sidebarNav.v2';
const LEGACY_STORAGE_KEY = 'pkh.sidebarNav';

export function loadSidebarNav(serverModulesConfigJson?: string): SidebarNavItem[] {
  let serverOverrides: Record<string, { enabled?: boolean; label?: string }> = {};
  if (serverModulesConfigJson) {
    try {
      serverOverrides = JSON.parse(serverModulesConfigJson);
    } catch {
      // ignore invalid server JSON
    }
  }

  try {
    // If legacy key exists, clean it up so old black & white icons are purged
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SidebarNavItem>[]) : [];
    const savedMap = new Map<string, Partial<SidebarNavItem>>();
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.id) savedMap.set(item.id, item);
      }
    }

    return DEFAULT_SIDEBAR_NAV.map((def) => {
      const saved = savedMap.get(def.id);
      const server = serverOverrides[def.id];

      let label = def.defaultLabel;
      if (server?.label && server.label.trim()) {
        label = server.label.trim();
      } else if (saved?.label && typeof saved.label === 'string' && saved.label.trim()) {
        label = saved.label.trim();
      }

      let enabled = def.enabled;
      if (server?.enabled !== undefined) {
        enabled = Boolean(server.enabled);
      } else if (saved?.enabled !== undefined) {
        enabled = Boolean(saved.enabled);
      }

      // Always strictly enforce the new standard icon from DEFAULT_SIDEBAR_NAV
      return {
        id: def.id,
        view: def.view,
        label,
        defaultLabel: def.defaultLabel,
        icon: def.icon,
        enabled,
      };
    });
  } catch {
    return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
  }
}

export function saveSidebarNav(items: SidebarNavItem[]): void {
  try {
    // Ensure icons are always kept standard and fresh
    const sanitized = items.map((item) => {
      const def = DEFAULT_SIDEBAR_NAV.find((d) => d.id === item.id);
      return {
        ...item,
        icon: def ? def.icon : item.icon,
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function resetSidebarNav(): SidebarNavItem[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
  return DEFAULT_SIDEBAR_NAV.map((item) => ({ ...item }));
}
