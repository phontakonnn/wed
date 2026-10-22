import React, { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react';
import {
  type User,
  getUserProfile,
  changeUserPassword,
  setup2FA,
  enable2FA,
  disable2FA,
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

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileState;
  setProfile: React.Dispatch<React.SetStateAction<ProfileState>>;
  user: User | null;
  onSaveProfile: (e: FormEvent) => void;
  onUploadAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenAdmin?: () => void;
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
  onUploadAvatar,
  onOpenAdmin,
  postSaveBehavior = 'stay',
  onSetPostSaveBehavior,
}) => {
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  // Active section tab: 'profile' | 'preferences' | 'security' | '2fa' | 'sessions' | 'data-backup'
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security' | '2fa' | 'sessions' | 'data-backup'>('profile');
  const [sessions, setSessions] = useState<UserSessionDevice[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: Record<string, number>; skipped: Record<string, number> } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  // 2FA state
  const [twoFactorActive, setTwoFactorActive] = useState<boolean>(false);
  const [setupSecret, setSetupSecret] = useState<string>('');
  const [totpVerifyCode, setTotpVerifyCode] = useState<string>('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [twoFactorBusy, setTwoFactorBusy] = useState<boolean>(false);
  const [disablePassword, setDisablePassword] = useState<string>('');
  const [isDisableOpen, setIsDisableOpen] = useState<boolean>(false);

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

  useEffect(() => {
    if (activeTab === 'sessions') {
      void loadSessionsAndHistory();
    }
  }, [activeTab, loadSessionsAndHistory]);

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
      const parsed = JSON.parse(text);
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
        setTwoFactorActive(Boolean(p.twoFactorEnabled));
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

  const handleStart2FASetup = async () => {
    setTwoFactorBusy(true);
    try {
      const res = await setup2FA();
      setSetupSecret(res.secret);
      setRecoveryCodes([]);
      setTotpVerifyCode('');
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleEnable2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!totpVerifyCode.trim()) return;
    setTwoFactorBusy(true);
    try {
      const res = await enable2FA(totpVerifyCode.trim());
      setRecoveryCodes(res.recoveryCodes || []);
      setTwoFactorActive(true);
      setSetupSecret('');
      showNotice('เปิดใช้งาน 2FA สำเร็จ! กรุณาบันทึกรหัสกู้คืน');
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleDisable2FA = async (e: FormEvent) => {
    e.preventDefault();
    setTwoFactorBusy(true);
    try {
      await disable2FA(disablePassword);
      setTwoFactorActive(false);
      setIsDisableOpen(false);
      setDisablePassword('');
      setRecoveryCodes([]);
      showNotice('ปิดใช้งาน 2FA เรียบร้อยแล้ว');
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleCopyRecoveryCodes = () => {
    try {
      void navigator.clipboard.writeText(recoveryCodes.join('\n'));
      showNotice('คัดลอกรหัสกู้คืน 6 ชุดไปยังคลิปบอร์ดแล้ว!');
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (currentPassword || newPassword || confirmPassword || totpVerifyCode) {
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
        style={{ maxWidth: 'min(580px, 100%)', width: '100%', boxSizing: 'border-box' }}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderBottom: '1px solid var(--pkh-border-subtle, #e2e8f0)', paddingBottom: '8px', margin: '12px 0 16px' }}>
          <button
            type="button"
            className={`button ${activeTab === 'profile' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('profile')}
          >
            👤 ข้อมูลส่วนตัว
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'preferences' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('preferences')}
          >
            ⚙️ การใช้งาน & บันทึก
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'security' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('security')}
          >
            🔑 เปลี่ยนรหัสผ่าน
          </button>
          <button
            type="button"
            className={`button ${activeTab === '2fa' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('2fa')}
          >
            🛡️ 2FA {twoFactorActive && '🟢'}
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'sessions' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('sessions')}
          >
            💻 อุปกรณ์ & เซสชัน
          </button>
          <button
            type="button"
            className={`button ${activeTab === 'data-backup' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('data-backup')}
          >
            📦 สำรอง & ถ่ายโอน
          </button>
        </div>

        {/* TAB 1: PROFILE INFO */}
        {activeTab === 'profile' && (
          <form className="profile-form" onSubmit={onSaveProfile}>
            {/* Avatar Row with Delete Photo button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <span className="avatar profile-avatar large" style={{ width: '64px', height: '64px', fontSize: '26px' }}>
                {profile.avatarDataUrl ? (
                  <img src={profile.avatarDataUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : profile.avatarFileId ? (
                  <img src={`/api/files/${profile.avatarFileId}`} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  profile.avatarPreset || (profile.name || user?.username || 'P').slice(0, 1)
                )}
              </span>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <select
                  value={profile.avatarPreset}
                  onChange={(event) => setProfile({ ...profile, avatarPreset: event.target.value })}
                  aria-label="อวตารสำเร็จรูป"
                  style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px' }}
                >
                  {['🌿', '🌙', '☀️', '🦊', '🐼', '🌸', '💙', '⭐', '☕', '🚀'].map((preset) => (
                    <option value={preset} key={preset}>{preset}</option>
                  ))}
                </select>

                <Button
                  className="button button-quiet"
                  type="button"
                  size="sm"
                  onClick={() => profileAvatarInputRef.current?.click()}
                >
                  📷 อัปโหลดรูป
                </Button>

                {(profile.avatarFileId || profile.avatarDataUrl) && (
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
                    🗑️ ลบรูป
                  </Button>
                )}

                <input
                  ref={profileAvatarInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void onUploadAvatar(event)}
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  อีเมล (สำหรับกู้คืน OTP)
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

            {/* Notification & Display Guidance */}
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--pkh-bg-subtle, #f8fafc)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: 'var(--pkh-text-primary)' }}>
                การแจ้งเตือนและการทำงานพื้นหลัง (Notifications)
              </div>
              <p style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', margin: '0 0 10px' }}>
                ระบบจะตรวจสอบกำหนดการประจำปี วันสำคัญ วันเกิดบุคคล และงานที่ค้างอยู่เบื้องหลังทุกชั่วโมง
              </p>
              <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                💡 หากต้องการรับการแจ้งเตือนแม้ไม่ได้เปิดเบราว์เซอร์ สามารถติดตั้งแอปนี้เป็น PWA (Progressive Web App) และอนุญาตการแจ้งเตือนบนอุปกรณ์ของคุณ
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CHANGE PASSWORD */}
        {activeTab === 'security' && (
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
                {passwordBusy ? 'กำลังเปลี่ยนรหัสผ่าน…' : '🔑 เปลี่ยนรหัสผ่าน'}
              </Button>
            </div>
          </form>
        )}

        {/* TAB 3: 2FA (TWO-FACTOR AUTHENTICATION) */}
        {activeTab === '2fa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              borderRadius: '10px',
              background: twoFactorActive ? '#f0fdf4' : 'var(--pkh-bg-subtle)',
              border: twoFactorActive ? '1px solid #86efac' : '1px solid var(--pkh-border-subtle)',
            }}>
              <div>
                <strong style={{ fontSize: '14px', color: twoFactorActive ? '#166534' : 'var(--pkh-text-primary)' }}>
                  {twoFactorActive ? '🟢 2FA กำลังเปิดใช้งาน (Active)' : '⚪ ยังไม่ได้เปิดใช้งาน 2FA'}
                </strong>
                <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
                  {twoFactorActive
                    ? 'บัญชีของคุณได้รับการปกป้องด้วยรหัส 6 หลักจากแอป Authenticator'
                    : 'เพิ่มความปลอดภัยอีกระดับด้วยรหัสยืนยันจาก Google Authenticator / Authy'}
                </div>
              </div>

              {!twoFactorActive ? (
                <Button variant="primary" size="sm" onClick={handleStart2FASetup} disabled={twoFactorBusy}>
                  {twoFactorBusy ? 'กำลังสร้าง...' : '🔐 เริ่มตั้งค่า 2FA'}
                </Button>
              ) : (
                <Button variant="danger-quiet" size="sm" onClick={() => setIsDisableOpen(true)}>
                  🔴 ปิดใช้งาน 2FA
                </Button>
              )}
            </div>

            {/* Disable 2FA Prompt */}
            {isDisableOpen && (
              <form onSubmit={handleDisable2FA} style={{ padding: '12px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fff5f5' }}>
                <strong style={{ fontSize: '13px', color: '#991b1b', display: 'block', marginBottom: '6px' }}>
                  ยืนยันการปิดใช้งาน 2FA
                </strong>
                <p style={{ fontSize: '12px', color: '#7f1d1d', margin: '0 0 8px' }}>
                  กรุณากรอกรหัสผ่านปัจจุบันของคุณเพื่อยืนยันความปลอดภัย:
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder="รหัสผ่านปัจจุบัน..."
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    required
                    style={{ flex: 1, fontSize: '13px' }}
                  />
                  <Button variant="danger" size="sm" type="submit" disabled={twoFactorBusy}>
                    ยืนยันปิด
                  </Button>
                  <Button variant="quiet" size="sm" type="button" onClick={() => setIsDisableOpen(false)}>
                    ยกเลิก
                  </Button>
                </div>
              </form>
            )}

            {/* Setup 2FA Form */}
            {setupSecret && !twoFactorActive && (
              <div style={{ border: '1px solid #93c5fd', borderRadius: '10px', padding: '16px', background: '#eff6ff' }}>
                <strong style={{ fontSize: '14px', color: '#1e40af' }}>
                  ขั้นตอนที่ 1: สแกนหรือกรอกรหัสลับในแอป Authenticator
                </strong>
                <p style={{ fontSize: '12px', color: '#1e3a8a', margin: '6px 0 12px' }}>
                  เปิดแอป Google Authenticator, Microsoft Authenticator หรือ 1Password แล้วเลือก "Enter a setup key":
                </p>

                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>SECRET KEY (BASE32):</span>
                    <strong style={{ fontFamily: 'monospace', fontSize: '16px', color: '#1e293b', letterSpacing: '1px' }}>
                      {setupSecret}
                    </strong>
                  </div>
                  <Button
                    variant="quiet"
                    size="sm"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(setupSecret);
                      showNotice('คัดลอก Secret Key แล้ว!');
                    }}
                  >
                    📋 คัดลอก
                  </Button>
                </div>

                <form onSubmit={handleEnable2FA} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                    ขั้นตอนที่ 2: กรอกรหัส 6 หลักจากแอปเพื่อยืนยัน
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="เช่น 123456"
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                      required
                      style={{ fontSize: '16px', letterSpacing: '2px', textAlign: 'center', width: '140px', fontWeight: 700 }}
                    />
                    <Button variant="primary" type="submit" disabled={twoFactorBusy || totpVerifyCode.length !== 6}>
                      {twoFactorBusy ? 'กำลังตรวจสอบ...' : '✓ ยืนยันและเปิดใช้งาน'}
                    </Button>
                    <Button variant="quiet" type="button" onClick={() => setSetupSecret('')}>
                      ยกเลิก
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Recovery Codes Display */}
            {recoveryCodes.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '14px', color: '#92400e' }}>
                    🛡️ รหัสกู้คืนฉุกเฉิน (Recovery Codes)
                  </strong>
                  <Button variant="quiet" size="sm" onClick={handleCopyRecoveryCodes}>
                    📋 คัดลอกทั้งหมด
                  </Button>
                </div>
                <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 10px' }}>
                  โปรดบันทึกรหัสเหล่านี้ไว้ในที่ปลอดภัย แต่ละรหัสสามารถใช้แทนรหัส OTP ได้ 1 ครั้ง หากทำโทรศัพท์หาย
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {recoveryCodes.map((code) => (
                    <div
                      key={code}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fcd34d',
                        borderRadius: '6px',
                        padding: '6px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '13px',
                        textAlign: 'center',
                        color: '#78350f',
                      }}
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
