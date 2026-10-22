import React, { useState, useEffect, useMemo } from 'react';
import type { User, Reminder, NotificationItem, NotificationPreferences } from '../api';

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
  onOpenAdmin?: () => void;
  brandLogo?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  profile?: {
    name: string;
    avatarPreset?: string;
    avatarFileId?: string | null;
  };
  notifications?: NotificationItem[];
  unreadCount?: number;
  onMarkAllRead?: () => void;
  onMarkRead?: (id: string) => void;
  onCompleteNotification?: (id: string) => void;
  onSnoozeNotification?: (id: string) => void;
  onNavigateNotification?: (url: string) => void;
  notificationPreferences?: NotificationPreferences;
  onUpdateNotificationPreferences?: (prefs: Partial<NotificationPreferences>) => Promise<void>;
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
  onOpenAdmin,
  brandLogo,
  brandTitle,
  brandSubtitle,
  profile,
  notifications = [],
  unreadCount = 0,
  onMarkAllRead,
  onMarkRead,
  onCompleteNotification,
  onSnoozeNotification,
  onNavigateNotification,
  notificationPreferences,
  onUpdateNotificationPreferences,
}) => {
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [currentClock, setCurrentClock] = useState<Date>(() => new Date());
  const [notifTab, setNotifTab] = useState<'list' | 'settings'>('list');

  const [localDndEnabled, setLocalDndEnabled] = useState(notificationPreferences?.dndEnabled ?? false);
  const [localDndStart, setLocalDndStart] = useState(notificationPreferences?.dndStart ?? '22:00');
  const [localDndEnd, setLocalDndEnd] = useState(notificationPreferences?.dndEnd ?? '08:00');
  const [localNotifyBirthdays, setLocalNotifyBirthdays] = useState(notificationPreferences?.notifyBirthdays ?? true);
  const [localNotifyTasks, setLocalNotifyTasks] = useState(notificationPreferences?.notifyTasks ?? true);
  const [localNotifyReminders, setLocalNotifyReminders] = useState(notificationPreferences?.notifyReminders ?? true);
  const [localNotifyShopping, setLocalNotifyShopping] = useState(notificationPreferences?.notifyShopping ?? true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (notificationPreferences) {
      setLocalDndEnabled(notificationPreferences.dndEnabled);
      setLocalDndStart(notificationPreferences.dndStart);
      setLocalDndEnd(notificationPreferences.dndEnd);
      setLocalNotifyBirthdays(notificationPreferences.notifyBirthdays);
      setLocalNotifyTasks(notificationPreferences.notifyTasks);
      setLocalNotifyReminders(notificationPreferences.notifyReminders);
      setLocalNotifyShopping(notificationPreferences.notifyShopping);
    }
  }, [notificationPreferences]);

  const handleSavePreferences = async () => {
    if (!onUpdateNotificationPreferences) return;
    setSavingPrefs(true);
    try {
      await onUpdateNotificationPreferences({
        dndEnabled: localDndEnabled,
        dndStart: localDndStart,
        dndEnd: localDndEnd,
        notifyBirthdays: localNotifyBirthdays,
        notifyTasks: localNotifyTasks,
        notifyReminders: localNotifyReminders,
        notifyShopping: localNotifyShopping,
      });
      setNotifTab('list');
    } finally {
      setSavingPrefs(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const clockFormatter = useMemo(() => {
    const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(currentClock);
    const date = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric' }).format(currentClock);
    const month = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short' }).format(currentClock);
    const year = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(currentClock);
    const time = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(currentClock);

    return {
      dateText: `วัน${day} ${date} ${month} ${year}`,
      timeText: `${time} น.`,
      fullTitle: `วัน${day}ที่ ${date} ${month} พ.ศ. ${year} เวลา ${time} น. (Asia/Bangkok)`,
    };
  }, [currentClock]);

  const requestBrowserPerm = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const p = await Notification.requestPermission();
      setBrowserPerm(p);
    }
  };

  const badgeCount = unreadCount > 0 ? unreadCount : upcomingReminders.length;

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
          <span className="brand-mark" aria-hidden="true">{brandLogo || '🧠'}</span>
          <span className="brand-text">
            <strong>{brandTitle || 'PKH'}</strong>
            <small>{brandSubtitle || 'Life OS'}</small>
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
        {/* Real-time Bangkok Clock Badge */}
        <div
          className="topbar-clock-badge"
          title={clockFormatter.fullTitle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'var(--pkh-bg-subtle, rgba(0, 0, 0, 0.04))',
            border: '1px solid var(--pkh-border-subtle, rgba(0, 0, 0, 0.08))',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--pkh-text-primary, #0f172a)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '13px' }} aria-hidden="true">🕒</span>
          <span className="topbar-clock-date" style={{ color: 'var(--pkh-text-secondary)' }}>
            {clockFormatter.dateText}
          </span>
          <span style={{ opacity: 0.3 }} aria-hidden="true">|</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--pkh-primary, #3b82f6)' }}>
            {clockFormatter.timeText}
          </span>
        </div>

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
            aria-label="แจ้งเตือน"
            aria-expanded={notificationOpen}
            onClick={() => setNotificationOpen((open) => !open)}
          >
            🔔
            {badgeCount > 0 && (
              <span className="notification-badge">{badgeCount}</span>
            )}
          </button>
          {notificationOpen && (
            <div className="notification-popover" style={{ width: '380px', maxWidth: '92vw' }}>
              <div className="popover-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: notifTab === 'list' ? 600 : 400,
                      background: notifTab === 'list' ? 'var(--pkh-primary)' : 'transparent',
                      color: notifTab === 'list' ? '#fff' : 'inherit',
                      border: 'none',
                      borderRadius: '6px',
                    }}
                    onClick={() => setNotifTab('list')}
                  >
                    🔔 แจ้งเตือน {badgeCount > 0 ? `(${badgeCount})` : ''}
                  </button>
                  <button
                    type="button"
                    className="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: notifTab === 'settings' ? 600 : 400,
                      background: notifTab === 'settings' ? 'var(--pkh-primary)' : 'transparent',
                      color: notifTab === 'settings' ? '#fff' : 'inherit',
                      border: 'none',
                      borderRadius: '6px',
                    }}
                    onClick={() => setNotifTab('settings')}
                  >
                    ⚙️ ตั้งค่า & DND
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {notifTab === 'list' && onMarkAllRead && (
                    <button
                      className="text-button"
                      type="button"
                      style={{ fontSize: '11px', color: 'var(--pkh-primary)' }}
                      onClick={onMarkAllRead}
                      title="ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว"
                    >
                      ✓ อ่านทั้งหมด
                    </button>
                  )}
                  <button className="text-button" type="button" onClick={() => setNotificationOpen(false)}>
                    ปิด
                  </button>
                </div>
              </div>

              {notifTab === 'list' ? (
                <>
                  <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' }}>
                    {notifications.length > 0 ? (
                      notifications.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: item.isRead === 0 ? 'var(--pkh-primary-subtle, rgba(59, 130, 246, 0.08))' : 'var(--pkh-bg-subtle, rgba(0,0,0,0.02))',
                            border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <strong
                              style={{
                                fontSize: '13px',
                                cursor: item.linkUrl ? 'pointer' : 'default',
                                color: item.isRead === 0 ? 'var(--pkh-primary, #2563eb)' : 'inherit',
                                flex: 1,
                              }}
                              onClick={() => {
                                if (item.linkUrl && onNavigateNotification) {
                                  onNavigateNotification(item.linkUrl);
                                  setNotificationOpen(false);
                                }
                              }}
                            >
                              {item.type === 'birthday' ? '🎂 ' : item.type === 'reminder' ? '⏰ ' : item.type === 'due_task' ? '📋 ' : item.type === 'shopping' ? '🛒 ' : item.type === 'shared_item' ? '🤝 ' : 'ℹ️ '}
                              {item.title}
                            </strong>
                            {item.isRead === 0 && (
                              <span style={{ fontSize: '9px', background: 'var(--pkh-primary)', color: '#fff', padding: '1px 5px', borderRadius: '4px' }}>
                                ใหม่
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary, #475569)', whiteSpace: 'pre-wrap' }}>{item.message}</span>

                          {/* Quick Actions for Notification */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {item.isRead === 0 && onMarkRead && (
                              <button
                                type="button"
                                className="button button-quiet"
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}
                                onClick={() => onMarkRead(item.id)}
                                title="ทำเครื่องหมายว่าอ่านแล้ว"
                              >
                                ✓ อ่านแล้ว
                              </button>
                            )}
                            {onCompleteNotification && (
                              <button
                                type="button"
                                className="button button-quiet"
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', color: '#16a34a' }}
                                onClick={() => onCompleteNotification(item.id)}
                                title="ทำรายการนี้เสร็จสิ้นแล้ว"
                              >
                                ✅ เสร็จสิ้น
                              </button>
                            )}
                            {onSnoozeNotification && (
                              <button
                                type="button"
                                className="button button-quiet"
                                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}
                                title="เลื่อนการแจ้งเตือนนี้ 24 ชม."
                                onClick={() => onSnoozeNotification(item.id)}
                              >
                                💤 เลื่อน 24 ชม.
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : upcomingReminders.length > 0 ? (
                      upcomingReminders.slice(0, 6).map((reminder) => (
                        <button
                          className="notification-item"
                          type="button"
                          key={reminder.id}
                          onClick={() => onSelectReminder(reminder.targetDate)}
                        >
                          <strong>⏰ {reminder.title}</strong>
                          <span>{reminder.targetDate}{reminder.linkedPersonName ? ` · ${reminder.linkedPersonName}` : ''}</span>
                        </button>
                      ))
                    ) : (
                      <p className="sidebar-hint" style={{ textAlign: 'center', padding: '20px 0' }}>ยังไม่มีการแจ้งเตือนใหม่</p>
                    )}
                  </div>

                  {/* Browser Permission Button */}
                  {browserPerm !== 'granted' && (
                    <div style={{ padding: '8px 4px 4px', borderTop: '1px solid var(--pkh-border-subtle)', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: '11px', color: 'var(--pkh-primary)' }}
                        onClick={requestBrowserPerm}
                      >
                        🌐 เปิดรับการแจ้งเตือนบนเบราว์เซอร์ / PWA
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Notification & DND Settings Tab */
                <div style={{ padding: '10px 4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '8px' }}>
                    <strong style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>🌙 โหมดห้ามรบกวน (Do Not Disturb)</strong>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={localDndEnabled}
                        onChange={(e) => setLocalDndEnabled(e.target.checked)}
                      />
                      <span>เปิดใช้งานโหมดห้ามรบกวนตามช่วงเวลา</span>
                    </label>

                    {localDndEnabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', paddingLeft: '22px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>ตั้งแต่:</span>
                        <input
                          type="time"
                          value={localDndStart}
                          onChange={(e) => setLocalDndStart(e.target.value)}
                          style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--pkh-border-subtle)' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--pkh-text-secondary)' }}>ถึง:</span>
                        <input
                          type="time"
                          value={localDndEnd}
                          onChange={(e) => setLocalDndEnd(e.target.value)}
                          style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--pkh-border-subtle)' }}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <strong style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>🔔 ประเภทการแจ้งเตือนที่ต้องการรับ</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localNotifyBirthdays}
                          onChange={(e) => setLocalNotifyBirthdays(e.target.checked)}
                        />
                        <span>🎂 วันเกิดของบุคคลสำคัญประจำเดือน</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localNotifyTasks}
                          onChange={(e) => setLocalNotifyTasks(e.target.checked)}
                        />
                        <span>📋 งานที่ใกล้ครบกำหนด / เกินกำหนด</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localNotifyReminders}
                          onChange={(e) => setLocalNotifyReminders(e.target.checked)}
                        />
                        <span>⏰ การแจ้งเตือน / วันครบรอบ / กำหนดการประจำปี</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={localNotifyShopping}
                          onChange={(e) => setLocalNotifyShopping(e.target.checked)}
                        />
                        <span>🛒 รายการซื้อของใช้ประจำเดือนที่ยังไม่ได้ซื้อ</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '8px' }}>
                    <button
                      type="button"
                      className="button button-quiet"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      onClick={() => setNotifTab('list')}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      style={{ fontSize: '12px', padding: '4px 14px' }}
                      disabled={savingPrefs}
                      onClick={handleSavePreferences}
                    >
                      {savingPrefs ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}
                    </button>
                  </div>
                </div>
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

        {/* Admin Center Button (Visible only to Admin role) */}
        {onOpenAdmin && user?.role === 'admin' && (
          <button
            className="button button-quiet topbar-admin-btn"
            type="button"
            onClick={onOpenAdmin}
            title="🛡️ ระบบหลังบ้าน (Admin Console)"
            aria-label="ระบบหลังบ้าน"
            style={{ fontWeight: 600, color: 'var(--pkh-primary)', borderColor: 'var(--pkh-primary)', gap: '4px' }}
          >
            🛡️ ระบบหลังบ้าน
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
