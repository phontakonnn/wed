import { parseImportPayload } from '../../lib/validation';
import React, { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react';
import {
  type User,
  getUserProfile,
  changeUserPassword,
  getUserSessions,
  revokeAllUserSessions,
  getLoginHistory,
  exportUserData,
  importUserData,
  type UserSessionDevice,
  type LoginHistoryItem,
} from '../../api';
import type { ProfileState } from '../../types';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../lib/formatters';

const playNotificationSound = (type: string = 'chime') => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'pop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'bell') {
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.3, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.4);
      });
    } else if (type === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      // chime
      [587.33, 880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.25, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.005, now + i * 0.08 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.5);
      });
    }
  } catch {
    // audio context ignored
  }
};

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileState;
  setProfile: React.Dispatch<React.SetStateAction<ProfileState>>;
  user: User | null;
  onSaveProfile: (e: FormEvent) => void;
  onUploadAvatar?: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenAdmin?: () => void;
  onOpenFirebaseSetup?: () => void;
  postSaveBehavior?: 'stay' | 'list' | 'detail';
  onSetPostSaveBehavior?: (behavior: 'stay' | 'list' | 'detail') => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
  user,
  onSaveProfile,
  onUploadAvatar: _onUploadAvatar,
  onOpenAdmin,
  onOpenFirebaseSetup,
  postSaveBehavior = 'stay',
  onSetPostSaveBehavior,
}) => {

  // Active section tab: 'profile' | 'preferences' | 'security' | 'sessions' | 'data-backup'
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security' | 'sessions' | 'data-backup'>('profile');
  const [sessions, setSessions] = useState<UserSessionDevice[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: Record<string, number>; skipped: Record<string, number> } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Detailed Notification Settings
  const [browserNotificationStatus, setBrowserNotificationStatus] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [notificationConfig, setNotificationConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('pkh.notification_settings');
      if (saved) return JSON.parse(saved);
    } catch {
      // Corrupt or unavailable storage: fall back to defaults below.
    }
    return {
      soundEnabled: true,
      soundType: 'chime' as 'chime' | 'bell' | 'pop' | 'beep',
      advanceNoticeDays: 3,
      categories: {
        birthdays: true,
        tasks: true,
        schedule: true,
        shopping: true,
        vault: true,
      },
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
    };
  });

  const saveNotificationConfig = (newConfig: typeof notificationConfig) => {
    setNotificationConfig(newConfig);
    localStorage.setItem('pkh.notification_settings', JSON.stringify(newConfig));
  };

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const loadSessionsAndHistory = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const [sessRes, histRes] = await Promise.all([
        getUserSessions().catch(() => ({ sessions: [] })),
        getLoginHistory().catch(() => ({ history: [] })),
      ]);
      setSessions(sessRes.sessions);
      setLoginHistory(histRes.history);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Tab switches trigger the fetch directly; no effect mirrors derived state.
  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'sessions') void loadSessionsAndHistory();
  };

  const handleRevokeAllSessions = async () => {
    if (!window.confirm('คุณต้องการออกจากระบบทุกอุปกรณ์อื่นทั้งหมดใช่หรือไม่?')) return;
    try {
      await revokeAllUserSessions();
      showNotice('ออกจากระบบทุกอุปกรณ์อื่นเรียบร้อยแล้ว');
      void loadSessionsAndHistory();
    } catch (err) {
      showError(errorMessage(err) || 'ไม่สามารถออกจากระบบทุกอุปกรณ์ได้');
    }
  };

  const handleImportJsonFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const parsed = parseImportPayload(text);
      const res = await importUserData(parsed);
      setImportResult(res.result);
      showNotice('นำเข้าและกู้คืนข้อมูลสำเร็จแล้ว!');
    } catch (err) {
      showError(errorMessage(err) || 'ไฟล์ JSON ไม่ถูกต้องหรือไม่สามารถนำเข้าได้');
    } finally {
      setImportBusy(false);
      if (e.target) e.target.value = '';
    }
  };

  // Load user profile details on open
  useEffect(() => {
    if (!isOpen) return;
    void getUserProfile()
      .then((res) => {
        const p = res.profile;
        setProfile((prev) => ({
          ...prev,
          name: p.displayName || prev.name || p.username,
          status: p.dailyStatus || prev.status,
          avatarDataUrl: p.avatarDataUrl || prev.avatarDataUrl || null,
          email: p.email || prev.email || '',
          phone: p.phone || prev.phone || '',
          bio: p.bio || prev.bio || '',
        }));
      })
      .catch(() => undefined);
  }, [isOpen, setProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setNotice(msg);
    setError('');
    setTimeout(() => setNotice(''), 4000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setNotice('');
    setTimeout(() => setError(''), 5000);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    if (newPassword.length < 8) {
      showError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    setPasswordBusy(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      showNotice('เปลี่ยนรหัสผ่านสำเร็จแล้ว');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRequestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showError('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน Push Notification');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setBrowserNotificationStatus(perm);
      if (perm === 'granted') {
        showNotice('เปิดรับการแจ้งเตือนผ่านเบราว์เซอร์สำเร็จแล้ว!');
      } else {
        showError('การอนุญาตการแจ้งเตือนยังไม่ได้รับการยินยอม (สถานะ: ' + perm + ')');
      }
    } catch (err) {
      showError(errorMessage(err));
    }
  };

  const handleTestNotification = () => {
    if (notificationConfig.soundEnabled) {
      playNotificationSound(notificationConfig.soundType);
    }
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🔔 สมองของคุณ (PKH / Life OS)', {
          body: 'ทดสอบส่งการแจ้งเตือนสำเร็จ! ระบบพร้อมเตือนวันสำคัญและงานของคุณแล้ว',
          icon: '🧠',
        });
      } catch {
        // fallback
      }
    }
    showNotice('🔊 ทดสอบส่งแจ้งเตือนเรียบร้อยแล้ว (เล่นเสียง ' + notificationConfig.soundType + ' + ส่ง Push)');
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (currentPassword || newPassword || confirmPassword) {
            if (window.confirm('คุณมีข้อมูลที่ยังไม่ได้บันทึก ยืนยันที่จะปิดหน้าต่างหรือไม่?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }
      }}
    >
      <section
        className="studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="โปรไฟล์และความปลอดภัย"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 'min(680px, 100%)', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}
      >
        <div className="popover-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>👤</span>
            <h2 style={{ margin: 0, fontSize: '18px' }}>โปรไฟล์และความปลอดภัย</h2>
          </div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Global Notices / Errors */}
        {notice && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', margin: '8px 0' }}>
            ✓ {notice}
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', margin: '8px 0' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="profile-tabs-header">
          <button
            type="button"
            className={`button ${activeTab === 'profile' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 ข้อมูลส่วนตัว
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'preferences' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setActiveTab('preferences')}
          >
            ⚙️ การใช้งาน & พฤติกรรม
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'security' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setActiveTab('security')}
          >
            🔑 เปลี่ยนรหัสผ่าน
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'sessions' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => selectTab('sessions')}
          >
            💻 อุปกรณ์ที่เข้าสู่ระบบ
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'data-backup' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setActiveTab('data-backup')}
          >
            📦 สำรอง & นำเข้าข้อมูล
          </button>
        </div>

        {/* TAB 1: PROFILE INFO */}
        {activeTab === 'profile' && (
          <form className="profile-form" onSubmit={onSaveProfile}>
            {/* Avatar Row (Zero File Storage - Emoji / Preset / External URL) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', padding: '12px', borderRadius: '10px', background: 'var(--pkh-bg-subtle, #f8fafc)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span className="avatar profile-avatar large" style={{ width: '64px', height: '64px', fontSize: '26px' }}>
                  {profile.avatarDataUrl ? (
                    <img src={profile.avatarDataUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    profile.avatarPreset || (profile.name || user?.username || 'P').slice(0, 1)
                  )}
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    เลือก Emoji อวตาร หรือวางลิงก์รูปภาพภายนอก
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={profile.avatarPreset}
                      onChange={(event) => setProfile({ ...profile, avatarPreset: event.target.value, avatarDataUrl: null })}
                      aria-label="อวตารสำเร็จรูป"
                      style={{ fontSize: '13px', padding: '5px 10px', borderRadius: '6px' }}
                    >
                      {['🌿', '🌙', '☀️', '🦊', '🐼', '🌸', '💙', '⭐', '☕', '🚀', '🧠', '⚡', '🦉', '🐱'].map((preset) => (
                        <option value={preset} key={preset}>{preset}</option>
                      ))}
                    </select>

                    {profile.avatarDataUrl && (
                      <Button
                        variant="danger-quiet"
                        type="button"
                        size="sm"
                        onClick={() => {
                          setProfile({
                            ...profile,
                            avatarFileId: null,
                            avatarDataUrl: null,
                            avatarPreset: profile.avatarPreset || '🌿',
                          });
                        }}
                      >
                        ล้าง URL รูปภาพ
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* URL input for external avatar image */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  หรือวาง URL รูปภาพภายนอก (เช่น https://images.unsplash.com/...):
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={profile.avatarDataUrl || ''}
                  onChange={(e) => setProfile({ ...profile, avatarDataUrl: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 10px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  ชื่อที่แสดง (Display Name)
                </label>
                <input
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  placeholder={user?.username ?? ''}
                  maxLength={80}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  ชื่อผู้ใช้ระบบ (Username)
                </label>
                <input
                  value={`@${user?.username || ''}`}
                  disabled
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--pkh-bg-subtle)', color: 'var(--pkh-text-muted)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              {/* Email Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  อีเมล (สำหรับติดต่อและกู้คืนบัญชี)
                </label>
                <input
                  type="email"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={profile.email || ''}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                  placeholder="name@example.com"
                  maxLength={120}
                />
              </div>

              {/* Phone Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  เบอร์โทรศัพท์ (ถ้ามี)
                </label>
                <input
                  type="tel"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={profile.phone || ''}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  placeholder="081-234-5678"
                  maxLength={30}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                สเตตัสประจำวัน (Daily Status)
              </label>
              <input
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={profile.status}
                onChange={(event) => setProfile({ ...profile, status: event.target.value })}
                placeholder="เช่น กำลังโฟกัสงานสำคัญ..."
                maxLength={120}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                แนะนำตัว / ข้อมูลบันทึกส่วนตัว (Bio)
              </label>
              <textarea
                value={profile.bio || ''}
                onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                placeholder="บันทึกย่อเกี่ยวกับตัวคุณ..."
                rows={2}
                maxLength={500}
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid var(--pkh-border-default)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <Button className="button button-primary" type="submit">
                💾 บันทึกโปรไฟล์
              </Button>
            </div>
          </form>
        )}

        {/* TAB: PREFERENCES & BEHAVIOR */}
        {activeTab === 'preferences' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--pkh-bg-subtle, #f8fafc)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: 'var(--pkh-text-primary)' }}>
                พฤติกรรมหลังบันทึกข้อมูล (Post-Save Behavior)
              </div>
              <p style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', margin: '0 0 12px' }}>
                กำหนดสิ่งที่จะเกิดขึ้นทันทีหลังจากที่คุณกดบันทึกโน้ต, ข้อมูลบุคคล, คลังรหัสผ่าน หรือรายการอื่นๆ ในระบบ
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  {
                    id: 'stay',
                    title: 'อยู่หน้าเดิมเพื่อแก้ไขต่อ (Stay in Editor) — แนะนำ',
                    desc: 'บันทึกข้อมูลแล้วจะยังคงเปิดฟอร์ม/หน้าเดิมไว้ เพื่อให้พิมพ์ต่อหรือทบทวนได้ต่อเนื่อง พร้อมแจ้งผลสำเร็จผ่าน Toast ที่มีปุ่มลัด',
                  },
                  {
                    id: 'list',
                    title: 'กลับไปหน้ารายการรวม (Return to List / Grid)',
                    desc: 'บันทึกแล้วจะปิดฟอร์มและกลับไปที่หน้ารายการรวมทันที เหมาะสำหรับการเพิ่มข้อมูลจำนวนมากอย่างรวดเร็ว',
                  },
                  {
                    id: 'detail',
                    title: 'เปิดดูรายละเอียดเต็ม (Open Detail View)',
                    desc: 'บันทึกแล้วจะเปิดหน้ารายละเอียดของรายการนั้นทันที เพื่อตรวจดูหน้าตาและเนื้อหาทั้งหมด',
                  },
                ].map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1.5px solid ${postSaveBehavior === item.id ? 'var(--pkh-primary, #3b82f6)' : 'var(--pkh-border-subtle, #e2e8f0)'}`,
                      background: postSaveBehavior === item.id ? 'rgba(59, 130, 246, 0.04)' : 'var(--pkh-bg-surface, #ffffff)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="postSaveBehavior"
                      value={item.id}
                      checked={postSaveBehavior === item.id}
                      onChange={() => onSetPostSaveBehavior?.(item.id as 'stay' | 'list' | 'detail')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--pkh-text-primary)' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notification & Background Controls */}
            <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--pkh-bg-subtle, #f8fafc)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--pkh-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔔</span> การแจ้งเตือนและการทำงานพื้นหลัง (Notifications)
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                    กำหนดการแจ้งเตือนเบราว์เซอร์ เสียงเตือน และช่วงเวลาห้ามรบกวน
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button
                    variant="quiet"
                    size="sm"
                    type="button"
                    onClick={handleTestNotification}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    title="ทดสอบเล่นเสียงและแสดง Push Notification"
                  >
                    🔊 ทดสอบส่งแจ้งเตือนเดี๋ยวนี้
                  </Button>
                </div>
              </div>

              {/* Push Permission Button & Status Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: 'var(--pkh-bg-surface, #ffffff)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🌐</span>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)', display: 'block' }}>
                      การแจ้งเตือนผ่านเบราว์เซอร์ (Browser Push Notification)
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                      เตือนทันทีบนหน้าจอแม้อยู่แท็บอื่นหรือย่อหน้าต่าง
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: browserNotificationStatus === 'granted' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: browserNotificationStatus === 'granted' ? '#047857' : '#b45309',
                    border: browserNotificationStatus === 'granted' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  }}>
                    {browserNotificationStatus === 'granted' ? '✅ เปิดใช้งานแล้ว' : '⚠️ ยังไม่ได้อนุญาต'}
                  </span>
                  {browserNotificationStatus !== 'granted' && (
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      onClick={handleRequestPushPermission}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      🔔 ขออนุญาตเปิดใช้งาน
                    </Button>
                  )}
                </div>
              </div>

              {/* Sound & Sound Type */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--pkh-bg-surface, #ffffff)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                      🔊 เสียงแจ้งเตือน (Notification Sound)
                    </span>
                    <input
                      type="checkbox"
                      checked={notificationConfig.soundEnabled}
                      onChange={(e) => saveNotificationConfig({ ...notificationConfig, soundEnabled: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--pkh-primary, #10b981)' }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select
                      value={notificationConfig.soundType}
                      disabled={!notificationConfig.soundEnabled}
                      onChange={(e) => saveNotificationConfig({ ...notificationConfig, soundType: e.target.value as 'chime' | 'bell' | 'pop' | 'beep' })}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}
                    >
                      <option value="chime">🔔 เสียงกระดิ่งใส (Chime)</option>
                      <option value="bell">🎶 ระฆังนุ่มนวล (Soft Bell)</option>
                      <option value="pop">✨ ป๊อปสดใส (Modern Pop)</option>
                      <option value="beep">⚡ ดิจิทัลปี๊บ (Clean Beep)</option>
                    </select>
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={!notificationConfig.soundEnabled}
                      onClick={() => playNotificationSound(notificationConfig.soundType)}
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      title="ฟังตัวอย่างเสียง"
                    >
                      ▶ ฟังเสียง
                    </button>
                  </div>
                </div>

                {/* Advance Notice Selector */}
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--pkh-bg-surface, #ffffff)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                    ⏳ การแจ้งเตือนล่วงหน้า (Advance Notice)
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                    สำหรับวันเกิด วันครบรอบ และกำหนดการสำคัญ
                  </span>
                  <select
                    value={notificationConfig.advanceNoticeDays}
                    onChange={(e) => saveNotificationConfig({ ...notificationConfig, advanceNoticeDays: Number(e.target.value) })}
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', marginTop: '2px' }}
                  >
                    <option value={0}>ตรงวันจริง (ไม่เตือนล่วงหน้า)</option>
                    <option value={1}>ล่วงหน้า 1 วัน</option>
                    <option value={3}>ล่วงหน้า 3 วัน (แนะนำ)</option>
                    <option value={7}>ล่วงหน้า 7 วัน (1 สัปดาห์)</option>
                    <option value={15}>ล่วงหน้า 15 วัน (ครึ่งเดือน)</option>
                    <option value={30}>ล่วงหน้า 30 วัน (1 เดือน)</option>
                  </select>
                </div>
              </div>

              {/* Category Switches */}
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--pkh-bg-surface, #ffffff)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                  🗂️ เปิด/ปิดการแจ้งเตือนตามหมวดหมู่
                </strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '4px' }}>
                  {[
                    { key: 'birthdays', label: '🎂 วันเกิดและวันครบรอบ' },
                    { key: 'tasks', label: '📋 งานที่ต้องทำและงานค้าง' },
                    { key: 'schedule', label: '📅 ตารางชีวิตและกิจวัตร' },
                    { key: 'shopping', label: '🛒 ของใช้ที่ต้องซื้อ' },
                    { key: 'vault', label: '🔐 เอกสาร/ทรัพย์สินใกล้หมดอายุ' },
                  ].map((item) => (
                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(notificationConfig.categories?.[item.key as keyof typeof notificationConfig.categories])}
                        onChange={(e) => {
                          const updated = {
                            ...notificationConfig.categories,
                            [item.key]: e.target.checked,
                          };
                          saveNotificationConfig({ ...notificationConfig, categories: updated });
                        }}
                        style={{ accentColor: 'var(--pkh-primary, #10b981)' }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* DND Time Window */}
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--pkh-bg-surface, #ffffff)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                      🌙 ช่วงเวลาห้ามรบกวน (Do Not Disturb - DND)
                    </strong>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                      ปิดเสียงและการแจ้งเตือนอัตโนมัติในช่วงเวลาที่คุณพักผ่อน
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationConfig.dndEnabled}
                    onChange={(e) => saveNotificationConfig({ ...notificationConfig, dndEnabled: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--pkh-primary, #10b981)' }}
                  />
                </div>
                {notificationConfig.dndEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>เริ่มห้ามรบกวน:</span>
                      <input
                        type="time"
                        value={notificationConfig.dndStart}
                        onChange={(e) => saveNotificationConfig({ ...notificationConfig, dndStart: e.target.value })}
                        style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}
                      />
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>ถึง</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>สิ้นสุด:</span>
                      <input
                        type="time"
                        value={notificationConfig.dndEnd}
                        onChange={(e) => saveNotificationConfig({ ...notificationConfig, dndEnd: e.target.value })}
                        style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* TAB 2: CHANGE PASSWORD */}
        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--pkh-text-secondary)', margin: '0 0 8px' }}>
                คุณสามารถเปลี่ยนรหัสผ่านบัญชีของคุณได้ตลอดเวลา โดยต้องกรอกรหัสผ่านเดิมเพื่อยืนยัน
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  รหัสผ่านปัจจุบัน
                </label>
                <input
                  type="password"
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านปัจจุบัน..."
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                </label>
                <input
                  type="password"
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่..."
                  minLength={8}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  ยืนยันรหัสผ่านใหม่
                </label>
                <input
                  type="password"
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง..."
                  minLength={8}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button variant="primary" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? 'กำลังบันทึก…' : '🔑 บันทึกรหัสผ่านใหม่'}
                </Button>
              </div>
            </form>

            <p
              style={{
                fontSize: '12.5px',
                color: 'var(--pkh-text-secondary)',
                margin: 0,
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--pkh-bg-subtle, #f8fafc)',
                border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
              }}
            >
              ลืมรหัสผ่านเดิม? ให้ผู้ดูแลระบบรีเซ็ตให้ผ่าน Admin Console หรือ Firebase Console
              → Authentication → เลือกผู้ใช้ → Reset password
            </p>
          </div>
        )}



        {/* TAB 4: ACTIVE SESSIONS & LOGIN HISTORY */}
        {activeTab === 'sessions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '14px' }}>📱 อุปกรณ์ที่กำลังเข้าสู่ระบบ (Active Sessions)</strong>
                <p style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', margin: '2px 0 0' }}>
                  ตรวจสอบอุปกรณ์และยกเลิกเซสชันอุปกรณ์อื่นได้ทันที
                </p>
              </div>
              <Button variant="danger-quiet" size="sm" onClick={handleRevokeAllSessions}>
                🚪 ออกจากระบบทุกอุปกรณ์อื่น
              </Button>
            </div>

            {sessionsLoading ? (
              <p style={{ fontSize: '13px', color: 'var(--pkh-text-muted)', textAlign: 'center' }}>กำลังโหลดข้อมูลเซสชัน…</p>
            ) : sessions.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--pkh-text-muted)', textAlign: 'center' }}>ไม่พบข้อมูลเซสชัน</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                      background: s.isCurrent ? 'var(--pkh-primary-subtle, #eff6ff)' : 'var(--pkh-bg-surface)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{s.userAgent.includes('Mobile') ? '📱' : '💻'}</span>
                        <strong style={{ fontSize: '13px' }}>{s.userAgent.slice(0, 40) || 'อุปกรณ์ไม่ระบุ'}</strong>
                        {s.isCurrent && (
                          <span style={{ fontSize: '11px', background: '#2563eb', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>
                            อุปกรณ์นี้
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
                        IP: {s.ipAddress} · ใช้งานล่าสุด: {new Date(s.lastSeenAt).toLocaleString('th-TH')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '14px', marginTop: '4px' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                🕒 ประวัติการเข้าสู่ระบบล่าสุด (Login History)
              </strong>
              {loginHistory.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>ยังไม่มีประวัติการเข้าสู่ระบบ</p>
              ) : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--pkh-border-subtle)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--pkh-bg-subtle)', borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                        <th style={{ padding: '6px 8px' }}>เวลา</th>
                        <th style={{ padding: '6px 8px' }}>IP</th>
                        <th style={{ padding: '6px 8px' }}>อุปกรณ์</th>
                        <th style={{ padding: '6px 8px' }}>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginHistory.slice(0, 10).map((h) => (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                          <td style={{ padding: '6px 8px' }}>{new Date(h.createdAt).toLocaleDateString('th-TH')} {new Date(h.createdAt).toLocaleTimeString('th-TH')}</td>
                          <td style={{ padding: '6px 8px' }}>{h.ipAddress || '-'}</td>
                          <td style={{ padding: '6px 8px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.userAgent || '-'}</td>
                          <td style={{ padding: '6px 8px', color: h.status === 'success' ? '#166534' : '#991b1b', fontWeight: 600 }}>
                            {h.status === 'success' ? '✓ สำเร็จ' : '✕ ไม่สำเร็จ'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: DATA EXPORT & IMPORT (DEDUPLICATED) */}
        {activeTab === 'data-backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--pkh-border-subtle)',
              background: 'var(--pkh-bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div>
                <strong style={{ fontSize: '14px' }}>💾 ส่งออกข้อมูลทั้งหมด (Export Full JSON)</strong>
                <p style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', margin: '2px 0 0' }}>
                  ดาวน์โหลดข้อมูลทั้งหมดของคุณ (โน้ต, งาน, บุ๊กมาร์ก, เป้าหมาย, ผู้คน ฯลฯ) ในรูปแบบ JSON เพื่อสำรองเก็บไว้
                </p>
              </div>
              <div style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                <Button variant="primary" size="sm" type="button" onClick={exportUserData}>
                  💾 ดาวน์โหลดไฟล์ JSON
                </Button>
              </div>
            </div>

            <div style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--pkh-border-subtle)',
              background: 'var(--pkh-bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div>
                <strong style={{ fontSize: '14px' }}>📥 นำเข้าและกู้คืนข้อมูล (Import JSON with Deduplication)</strong>
                <p style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', margin: '2px 0 0' }}>
                  นำเข้าไฟล์ JSON เข้าสู่บัญชีของคุณ ระบบจะตรวจสอบและข้ามข้อมูลที่ซ้ำกันให้อัตโนมัติ ป้องกันข้อมูลซ้ำซ้อน 100%
                </p>
              </div>

              <input
                ref={importFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportJsonFile}
              />

              <div style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  disabled={importBusy}
                  onClick={() => importFileInputRef.current?.click()}
                >
                  {importBusy ? 'กำลังนำเข้าข้อมูล…' : '📥 เลือกไฟล์ JSON เพื่อนำเข้า'}
                </Button>
              </div>

              {importResult && (
                <div style={{ marginTop: '8px', padding: '10px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #86efac', fontSize: '12px' }}>
                  <strong style={{ color: '#166534', display: 'block', marginBottom: '4px' }}>
                    ✓ นำเข้าข้อมูลเรียบร้อยแล้ว:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#14532d' }}>
                    {Object.entries(importResult.imported).map(([k, v]) => (
                      <li key={k}>
                        {k}: เพิ่มใหม่ <strong>{v}</strong> รายการ (ข้ามที่ซ้ำ <strong>{importResult.skipped[k] || 0}</strong> รายการ)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Firebase Cloud Connection (Spark Plan Free 100%) */}
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid #fde68a',
              background: '#fffbeb',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#92400e' }}>🔥 เชื่อมต่อ Firebase Cloud (Serverless Spark Plan)</strong>
                <p style={{ fontSize: '12px', color: '#b45309', margin: '2px 0 0' }}>
                  เชื่อมต่อ Google Firebase เพื่อจัดเก็บลิงก์และการ์ดข้อมูลฟรี 100% ซิงค์ข้อมูล Realtime ข้ามทุกอุปกรณ์และรองรับ PWA
                </p>
              </div>
              <div style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFirebaseSetup?.();
                  }}
                  style={{ background: '#f59e0b', borderColor: '#d97706', color: '#fff' }}
                >
                  ⚙️ ตั้งค่าคีย์การเชื่อมต่อ Firebase
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Link at the bottom if user is admin */}
        {onOpenAdmin && user?.role === 'admin' && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-subtle, #e2e8f0)' }}>
            <button
              type="button"
              className="button button-quiet"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
            >
              🛡️ ไปที่ระบบหลังบ้าน (Admin Console)
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
