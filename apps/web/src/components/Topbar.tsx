import React from 'react';
import type { User, Reminder } from '../api';

export interface TopbarProps {
  user: User | null;
  onOpenMobileMenu: () => void;
  onOpenCommand: () => void;
  notificationOpen: boolean;
  setNotificationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  upcomingReminders: Reminder[];
  onSelectReminder: (targetDate: string) => void;
  onOpenTheme: () => void;
  onLogout: () => void;
  authBusy: boolean;
  themeMode?: 'light' | 'dark';
  onToggleThemeMode?: () => void;
  onOpenProfile?: () => void;
  profile?: {
    name: string;
    avatarPreset?: string;
    avatarFileId?: string | null;
  };
}

export const Topbar: React.FC<TopbarProps> = ({
  user,
  onOpenMobileMenu,
  onOpenCommand,
  notificationOpen,
  setNotificationOpen,
  upcomingReminders,
  onSelectReminder,
  onOpenTheme,
  onLogout,
  authBusy,
  themeMode = 'light',
  onToggleThemeMode,
  onOpenProfile,
  profile,
}) => {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button mobile-menu-button topbar-mobile-menu"
          type="button"
          aria-label="เปิดเมนู"
          onClick={onOpenMobileMenu}
        >
          ☰
        </button>
        <a className="brand" href="/" aria-label="PKH หน้าหลัก">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span className="brand-text">
            <strong>PKH</strong>
            <small>Life OS</small>
          </span>
        </a>
      </div>

      {/* Center Search Pill with Ctrl+K shortcut badge */}
      <div className="topbar-center">
        <button
          className="topbar-search-bar"
          type="button"
          onClick={onOpenCommand}
          aria-label="ค้นหาทุกสิ่งใน PKH (กด Ctrl+K)"
          title="ค้นหาทุกสิ่งใน PKH (Ctrl+K)"
        >
          <span className="search-icon" aria-hidden="true">🔍</span>
          <span className="search-placeholder">ค้นหาทุกสิ่งใน PKH...</span>
          <span className="search-shortcut" aria-hidden="true">
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </span>
        </button>
      </div>

      <div className="topbar-actions">
        {/* Quick Dark/Light mode toggle */}
        {onToggleThemeMode && (
          <button
            className="icon-button topbar-icon"
            type="button"
            aria-label={themeMode === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            title={themeMode === 'dark' ? 'โหมดสว่าง (Light Mode)' : 'โหมดมืด (Dark Mode)'}
            onClick={onToggleThemeMode}
          >
            {themeMode === 'dark' ? '☀️' : '🌙'}
          </button>
        )}

        {/* Theme Palette Modal Button */}
        <button
          className="icon-button topbar-icon"
          type="button"
          aria-label="เลือกพาเลทสีและธีม"
          title="ปรับแต่งพาเลทสี (Themes)"
          onClick={onOpenTheme}
        >
          🎨
        </button>

        {/* Notifications Popover */}
        <div className="menu-wrap">
          <button
            className="icon-button topbar-icon"
            type="button"
            aria-label="แจ้งเตือนวันสำคัญ"
            aria-expanded={notificationOpen}
            onClick={() => setNotificationOpen((open) => !open)}
          >
            🔔
            {upcomingReminders.length > 0 && (
              <span className="notification-badge">{upcomingReminders.length}</span>
            )}
          </button>
          {notificationOpen && (
            <div className="notification-popover">
              <div className="popover-head">
                <strong>แจ้งเตือนใกล้ถึงกำหนด</strong>
                <button className="text-button" type="button" onClick={() => setNotificationOpen(false)}>
                  ปิด
                </button>
              </div>
              {upcomingReminders.length === 0 ? (
                <p className="sidebar-hint">ยังไม่มีรายการใกล้ถึงกำหนด</p>
              ) : (
                upcomingReminders.slice(0, 6).map((reminder) => (
                  <button
                    className="notification-item"
                    type="button"
                    key={reminder.id}
                    onClick={() => onSelectReminder(reminder.targetDate)}
                  >
                    <strong>{reminder.title}</strong>
                    <span>{reminder.targetDate}{reminder.linkedPersonName ? ` · ${reminder.linkedPersonName}` : ''}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Profile Pill Button */}
        {onOpenProfile && (
          <button
            className="topbar-profile-btn"
            type="button"
            onClick={onOpenProfile}
            title="แก้ไขโปรไฟล์และสถานะ"
            aria-label="เปิดโปรไฟล์"
          >
            <span className="topbar-avatar" aria-hidden="true">
              {profile?.avatarFileId ? (
                <img src={`/api/files/${profile.avatarFileId}`} alt="" loading="lazy" decoding="async" />
              ) : (
                profile?.avatarPreset || (profile?.name || user?.username || 'P').slice(0, 1)
              )}
            </span>
            <span className="topbar-username">{profile?.name || user?.username || 'ผู้ใช้'}</span>
          </button>
        )}

        {/* Logout Button */}
        <button
          className="button button-quiet topbar-logout-btn"
          type="button"
          onClick={onLogout}
          disabled={authBusy}
          title="ออกจากระบบ"
        >
          ออก
        </button>
      </div>
    </header>
  );
};
