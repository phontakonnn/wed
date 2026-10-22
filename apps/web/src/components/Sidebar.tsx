import React, { useMemo } from 'react';
import type { User, CustomCategory, CustomDataType } from '../api';
import type { ProfileState, NotesView, SidebarNavItem } from '../types';

export interface SidebarProps {
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onOpenProfile: () => void;
  profile: ProfileState;
  user: User | null;
  todayProgress: number;
  todayDone: number;
  todayBlocksCount: number;
  sidebarNav: SidebarNavItem[];
  viewMode: NotesView;
  onSwitchView: (view: NotesView) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Badge counts
  listTotal: number;
  tasksCount: number;
  inboxNewCount: number;
  projectsCount: number;
  goalsCount: number;
  vaultCount: number;
  libraryCount: number;
  filesCount?: number;
  bookmarksCount: number;
  favoritesCount: number;
  onOpenCustomizeNav: () => void;
  // Custom categories
  customCategories: CustomCategory[];
  customCategoriesBusy: boolean;
  selectedCustomCategoryId: string | null;
  onSelectCustomCategory: (id: string) => void;
  onOpenCreateCategoryModal: (parentId: string | null) => void;
  onOpenEditCategoryModal: (cat: CustomCategory, e: React.MouseEvent) => void;
  onDeleteCategory: (cat: CustomCategory, e: React.MouseEvent) => void;
  // Custom data types
  customDataTypes?: CustomDataType[];
  selectedCustomTypeId?: string | null;
  onSelectCustomType?: (id: string) => void;
  onOpenCreateCustomType?: () => void;
  // Quick add & actions
  onStartNewNote?: () => void;
  onStartNewPerson: () => void;
  onStartNewReminder: () => void;
  onStartNewBookmark: () => void;
  onUploadFileClick: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadBusy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  // Filters
  activeFilterCount: number;
  onClearFilters: () => void;
  renderTaxonomyGroup: (kind: 'categories' | 'tags', mode: 'filter') => React.ReactNode;
  filterBusy: boolean;
  onOpenAbout?: () => void;
}

const NAV_GROUPS: Array<{
  id: string;
  title: string;
  views: NotesView[];
}> = [
  { id: 'overview', title: 'ภาพรวม & ด่วน', views: ['home', 'inbox'] },
  { id: 'life-work', title: 'งาน & ตารางชีวิต', views: ['tasks', 'projects', 'goals', 'schedule', 'people'] },
  { id: 'knowledge', title: 'การ์ดข้อมูล & ลิงก์', views: ['notes', 'vault', 'library', 'bookmarks'] },
  { id: 'lifestyle', title: 'ไลฟ์สไตล์', views: ['watchlist', 'shopping', 'travel'] },
  { id: 'system', title: 'ระบบ & ช่วยเหลือ', views: ['favorites', 'help-support', 'trash'] },
];

export const Sidebar: React.FC<SidebarProps> = ({
  mobileMenuOpen,
  onCloseMobileMenu,
  onOpenProfile,
  profile,
  user,
  todayProgress,
  todayDone,
  todayBlocksCount,
  sidebarNav,
  viewMode,
  onSwitchView,
  isCollapsed = false,
  onToggleCollapse,
  listTotal,
  tasksCount,
  inboxNewCount,
  projectsCount,
  goalsCount,
  vaultCount,
  libraryCount,
  filesCount: _filesCount,
  bookmarksCount,
  favoritesCount,
  onOpenCustomizeNav,
  customCategories,
  customCategoriesBusy,
  selectedCustomCategoryId,
  onSelectCustomCategory,
  onOpenCreateCategoryModal,
  onOpenEditCategoryModal,
  onDeleteCategory,
  customDataTypes = [],
  selectedCustomTypeId,
  onSelectCustomType,
  onOpenCreateCustomType,
  onStartNewNote: _onStartNewNote,
  onOpenAbout,
}) => {
  const countForView = (view: NotesView): number | null => {
    switch (view) {
      case 'notes': return listTotal;
      case 'tasks': return tasksCount;
      case 'inbox': return inboxNewCount;
      case 'projects': return projectsCount;
      case 'goals': return goalsCount;
      case 'vault': return vaultCount;
      case 'library': return libraryCount;
      case 'bookmarks': return bookmarksCount;
      case 'favorites': return favoritesCount;
      default: return null;
    }
  };

  const enabledItems = useMemo(() => {
    return sidebarNav.filter((item) => item.enabled);
  }, [sidebarNav]);

  const renderNavItem = (item: SidebarNavItem) => {
    const navCount = countForView(item.view);
    const isActive = viewMode === item.view;
    return (
      <button
        key={item.id}
        className={`nav-item${isActive ? ' is-active' : ''}`}
        type="button"
        title={item.label}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onSwitchView(item.view)}
      >
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        <span className="nav-label">{item.label}</span>
        {navCount !== null && navCount > 0 && <span className="nav-count">{navCount}</span>}
      </button>
    );
  };

  return (
    <>
      <aside className={`app-sidebar${mobileMenuOpen ? ' is-open' : ''}${isCollapsed ? ' is-collapsed' : ''}`} aria-label="เมนูหลัก">
        <div className="sidebar-heading">
          <div className="sidebar-title-wrap">
            <span className="eyebrow">พื้นที่ส่วนตัว</span>
            <h1>คลังความรู้</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {onToggleCollapse && (
              <button
                className="icon-button sidebar-collapse-btn"
                type="button"
                aria-label={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
                title={isCollapsed ? 'ขยายแถบเมนู (Expand)' : 'ย่อแถบเมนู (Collapse)'}
                onClick={onToggleCollapse}
              >
                {isCollapsed ? '»' : '«'}
              </button>
            )}
            <button
              className="icon-button sidebar-close"
              type="button"
              aria-label="ปิดเมนู"
              onClick={onCloseMobileMenu}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <button className="profile-card" type="button" onClick={onOpenProfile} title="โปรไฟล์และการตั้งค่า">
          <span className="avatar profile-avatar">
            {profile.avatarFileId ? (
              <img src={`/api/files/${profile.avatarFileId}`} alt="" loading="lazy" decoding="async" />
            ) : (
              profile.avatarPreset || (profile.name || user?.username || 'P').slice(0, 1)
            )}
          </span>
          <span className="profile-copy">
            <strong>{profile.name || user?.username}</strong>
            <small>{profile.status}</small>
          </span>
          <span className="profile-progress" aria-hidden="true">
            <span style={{ width: `${todayProgress}%` }} />
          </span>
          <small className="profile-meta">{todayDone}/{todayBlocksCount} ช่วงวันนี้</small>
        </button>

        {/* Quick Access Bar (Bookmarks & Inbox) */}
        <div className="sidebar-quick-bar">
          <button
            className="sidebar-quick-btn button-primary"
            type="button"
            onClick={() => onSwitchView('bookmarks')}
            title="เปิดหน้าบุ๊กมาร์ก / ลิงก์ด่วน"
          >
            <span>🔖 บุ๊กมาร์ก</span>
          </button>
          <button
            className="sidebar-quick-btn button-quiet"
            type="button"
            onClick={() => onSwitchView('inbox')}
            title="จดด่วนลง Inbox"
          >
            <span>📥 กล่องเข้า</span>
          </button>
        </div>

        {/* Primary Navigation Sections (Grouped cleanly) */}
        {NAV_GROUPS.map((group) => {
          const itemsInGroup = enabledItems.filter((item) => group.views.includes(item.view));
          if (itemsInGroup.length === 0) return null;
          return (
            <div key={group.id} className="sidebar-section">
              {!isCollapsed && (
                <div className="sidebar-section-head">
                  <h2>{group.title}</h2>
                </div>
              )}
              <nav className="primary-nav" aria-label={group.title}>
                {itemsInGroup.map(renderNavItem)}
              </nav>
            </div>
          );
        })}

        {/* Prominent Custom Categories Section */}
        <div className="sidebar-section custom-categories-section">
          <div className="sidebar-section-head">
            <h2>📁 หมวดหมู่ของฉัน</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => onOpenCreateCategoryModal(null)}
              title="สร้างหมวดหมู่ใหม่"
            >
              ＋ เพิ่ม
            </button>
          </div>
          {customCategoriesBusy ? (
            <p className="sidebar-hint">กำลังโหลดหมวดหมู่…</p>
          ) : customCategories.length === 0 ? (
            <p className="sidebar-hint">ยังไม่มีหมวดหมู่ — กด + เพิ่ม เพื่อจัดระเบียบข้อมูล</p>
          ) : (
            <div className="custom-category-tree" aria-label="รายการหมวดหมู่ของฉัน">
              {customCategories.filter((c) => !c.parentId).map((cat) => {
                const isSelected = viewMode === 'custom-category' && selectedCustomCategoryId === cat.id;
                const children = customCategories.filter((sub) => sub.parentId === cat.id);
                return (
                  <div key={cat.id} className="category-tree-item">
                    <div
                      className={`custom-cat-row${isSelected ? ' is-active' : ''}`}
                      onClick={() => onSelectCustomCategory(cat.id)}
                    >
                      <span className="cat-color-dot" style={{ backgroundColor: cat.color }} />
                      <span className="cat-icon">{cat.icon}</span>
                      <span className="cat-name">{cat.name}</span>
                      {cat.itemCount !== undefined && cat.itemCount > 0 && (
                        <span className="cat-badge">{cat.itemCount}</span>
                      )}
                      <div className="cat-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="cat-action-btn"
                          title="เพิ่มหมวดย่อย"
                          onClick={() => onOpenCreateCategoryModal(cat.id)}
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          className="cat-action-btn"
                          title="แก้ไขหมวดหมู่นี้"
                          onClick={(e) => onOpenEditCategoryModal(cat, e)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="cat-action-btn danger-text"
                          title="ลบหมวดหมู่นี้"
                          onClick={(e) => onDeleteCategory(cat, e)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Sub-categories */}
                    {children.length > 0 && (
                      <div className="custom-cat-sublist">
                        {children.map((sub) => {
                          const isSubSelected = viewMode === 'custom-category' && selectedCustomCategoryId === sub.id;
                          return (
                            <div
                              key={sub.id}
                              className={`custom-cat-row is-sub${isSubSelected ? ' is-active' : ''}`}
                              onClick={() => onSelectCustomCategory(sub.id)}
                            >
                              <span className="cat-color-dot sub-dot" style={{ backgroundColor: sub.color }} />
                              <span className="cat-icon">{sub.icon}</span>
                              <span className="cat-name">{sub.name}</span>
                              {sub.itemCount !== undefined && sub.itemCount > 0 && (
                                <span className="cat-badge">{sub.itemCount}</span>
                              )}
                              <div className="cat-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="cat-action-btn"
                                  title="แก้ไขหมวดย่อยนี้"
                                  onClick={(e) => onOpenEditCategoryModal(sub, e)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="cat-action-btn danger-text"
                                  title="ลบหมวดย่อยนี้"
                                  onClick={(e) => onDeleteCategory(sub, e)}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Prominent Custom Data Types Section */}
        <div className="sidebar-section custom-types-section">
          <div className="sidebar-section-head">
            <h2>🧩 ประเภทข้อมูลของฉัน</h2>
            {onOpenCreateCustomType && (
              <button
                className="text-button"
                type="button"
                onClick={onOpenCreateCustomType}
                title="สร้างประเภทข้อมูลใหม่"
              >
                ＋ ออกแบบ
              </button>
            )}
          </div>
          {customDataTypes.length === 0 ? (
            <p className="sidebar-hint">กด + ออกแบบ เพื่อสร้างประเภทข้อมูลและเมนูเอง</p>
          ) : (
            <div className="custom-category-tree" aria-label="รายการประเภทข้อมูล">
              {customDataTypes.map((ct) => {
                const isSelected = viewMode === 'custom-type' && selectedCustomTypeId === ct.id;
                return (
                  <div
                    key={ct.id}
                    className={`custom-cat-row${isSelected ? ' is-active' : ''}`}
                    onClick={() => onSelectCustomType?.(ct.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="cat-color-dot" style={{ backgroundColor: ct.color }} />
                    <span className="cat-icon">{ct.icon || '🧩'}</span>
                    <span className="cat-name">{ct.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Customize Nav Button */}
        <div className="nav-customize-wrap">
          <button
            className="nav-customize-btn"
            type="button"
            onClick={onOpenCustomizeNav}
            title="ปรับแต่งลำดับ เปลี่ยนชื่อ หรือซ่อนเมนู"
          >
            <span>⚙️</span>
            <span>ตั้งค่าเมนู (Customize Sidebar)</span>
          </button>
        </div>

        {/* Developer Attribution & About System Footer */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--pkh-border-subtle, rgba(0, 0, 0, 0.08))',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
            <span>ระบบ: <strong style={{ color: 'var(--pkh-text-secondary)' }}>สมองของคุณ</strong></span>
            <span>ผู้พัฒนา: <strong style={{ color: 'var(--pkh-primary, #3b82f6)' }}>_phontakonnn</strong></span>
          </div>
          <button
            type="button"
            className="button button-quiet"
            onClick={onOpenAbout}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              borderRadius: '8px',
              border: '1px solid var(--pkh-border-subtle)',
              color: 'var(--pkh-text-secondary)',
              background: 'var(--pkh-bg-subtle)',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            <span>ℹ️</span>
            <span>เกี่ยวกับระบบ (About สมองของคุณ)</span>
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobileMenu}
          aria-hidden="true"
        />
      )}
    </>
  );
};
