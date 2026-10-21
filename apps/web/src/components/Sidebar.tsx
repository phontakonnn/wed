import React from 'react';
import type { User, CustomCategory } from '../api';
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
  // Badge counts
  listTotal: number;
  tasksCount: number;
  inboxNewCount: number;
  projectsCount: number;
  goalsCount: number;
  vaultCount: number;
  libraryCount: number;
  filesCount: number;
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
  // Quick add & actions
  onStartNewNote: () => void;
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
}

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
  listTotal,
  tasksCount,
  inboxNewCount,
  projectsCount,
  goalsCount,
  vaultCount,
  libraryCount,
  filesCount,
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
  onStartNewNote,
  onStartNewPerson,
  onStartNewReminder,
  onStartNewBookmark,
  onUploadFileClick,
  onFileInputChange,
  uploadBusy,
  fileInputRef,
  activeFilterCount,
  onClearFilters,
  renderTaxonomyGroup,
  filterBusy,
}) => {
  return (
    <>
      <aside className={`app-sidebar${mobileMenuOpen ? ' is-open' : ''}`} aria-label="เมนูหลัก">
        <div className="sidebar-heading">
          <div>
            <span className="eyebrow">พื้นที่ส่วนตัว</span>
            <h1>คลังความรู้</h1>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="ปิดเมนู"
            onClick={onCloseMobileMenu}
          >
            ✕
          </button>
        </div>

        {/* Profile Card */}
        <button className="profile-card" type="button" onClick={onOpenProfile}>
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

        {/* Quick Add Bar (New Note & New Task) */}
        <div className="sidebar-quick-bar">
          <button
            className="sidebar-quick-btn button-primary"
            type="button"
            onClick={onStartNewNote}
            title="สร้างโน้ตใหม่ด่วน"
          >
            <span>＋ โน้ตใหม่</span>
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

        {/* Prominent Custom Categories Section (Moved up so it is immediately visible & accessible) */}
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

        {/* Primary Navigation Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <h2>เมนูนำทาง</h2>
          </div>
          <nav className="primary-nav" aria-label="เมนูหลัก">
            {sidebarNav.filter((item) => item.enabled).map((item) => {
              const navCount = item.view === 'notes'
                ? listTotal
                : item.view === 'tasks'
                  ? tasksCount
                  : item.view === 'inbox'
                    ? inboxNewCount
                    : item.view === 'projects'
                      ? projectsCount
                      : item.view === 'goals'
                        ? goalsCount
                        : item.view === 'vault'
                          ? vaultCount
                          : item.view === 'library'
                            ? libraryCount
                            : item.view === 'files'
                              ? filesCount
                              : item.view === 'bookmarks'
                                ? bookmarksCount
                                : item.view === 'favorites'
                                  ? favoritesCount
                                  : null;
              return (
                <button
                  key={item.id}
                  className={`nav-item${viewMode === item.view ? ' is-active' : ''}`}
                  type="button"
                  aria-current={viewMode === item.view ? 'page' : undefined}
                  onClick={() => onSwitchView(item.view)}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {navCount !== null && navCount > 0 && <span className="nav-count">{navCount}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Taxonomy Filters (for notes) */}
        {renderTaxonomyGroup && (
          <div className="sidebar-section taxonomy-section">
            <div className="sidebar-section-head">
              <h2>ตัวกรองโน้ต</h2>
              {activeFilterCount > 0 && (
                <button
                  className="text-button"
                  type="button"
                  onClick={onClearFilters}
                  disabled={filterBusy}
                >
                  ล้างตัวกรอง ({activeFilterCount})
                </button>
              )}
            </div>
            {renderTaxonomyGroup('categories', 'filter')}
            {renderTaxonomyGroup('tags', 'filter')}
          </div>
        )}

        {/* Quick Menu Links & Creation Actions */}
        <div className="sidebar-section other-actions-section">
          <div className="sidebar-section-head">
            <h2>สร้างข้อมูลอื่น</h2>
          </div>
          <div className="quick-actions-grid">
            <button className="button button-quiet" type="button" onClick={onStartNewPerson}>
              👤 บุคคล
            </button>
            <button className="button button-quiet" type="button" onClick={onStartNewReminder}>
              🔔 แจ้งเตือน
            </button>
            <button className="button button-quiet" type="button" onClick={onStartNewBookmark}>
              🔖 ลิงก์
            </button>
            <button className="button button-quiet" type="button" onClick={onUploadFileClick} disabled={uploadBusy}>
              📁 ไฟล์
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={onFileInputChange}
            multiple
          />
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
