import React, { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react';
import {
  type User,
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  setup2FA,
  enable2FA,
  disable2FA,
  getUserSessions,
  revokeAllUserSessions,
  getLoginHistory,
  exportUserData,
  importUserData,
  requestEmailVerificationOtp,
  confirmEmailVerificationOtp,
  requestPhoneVerificationOtp,
  confirmPhoneVerificationOtp,
  requestForgotOtp,
  resetPasswordWithOtp,
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

  // Active section tab: 'profile' | 'preferences' | 'verify' | 'security' | '2fa' | 'sessions' | 'data-backup'
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'verify' | 'security' | '2fa' | 'sessions' | 'data-backup'>('profile');
  const [sessions, setSessions] = useState<UserSessionDevice[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: Record<string, number>; skipped: Record<string, number> } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Email & Phone Verification State
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [emailOtpCountdown, setEmailOtpCountdown] = useState(0);
  const [phoneOtpCountdown, setPhoneOtpCountdown] = useState(0);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [simulatedOtpNotice, setSimulatedOtpNotice] = useState<string | null>(null);
  const [simulatedEmailOtp, setSimulatedEmailOtp] = useState<string | null>(null);
  const [simulatedPhoneOtp, setSimulatedPhoneOtp] = useState<string | null>(null);
  const [directEmailOtpSent, setDirectEmailOtpSent] = useState(false);
  const [directPhoneOtpSent, setDirectPhoneOtpSent] = useState(false);
  const [directEmailOtp, setDirectEmailOtp] = useState('');
  const [directPhoneOtp, setDirectPhoneOtp] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);

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
    } catch {}
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

  // Forgot password via OTP within Security tab
  const [forgotOtpType, setForgotOtpType] = useState<'email' | 'phone'>('email');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);
  const [forgotOtpInput, setForgotOtpInput] = useState('');
  const [forgotSimulatedOtp, setForgotSimulatedOtp] = useState<string | null>(null);
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (emailOtpCountdown <= 0) return;
    const timer = setInterval(() => setEmailOtpCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [emailOtpCountdown]);

  useEffect(() => {
    if (phoneOtpCountdown <= 0) return;
    const timer = setInterval(() => setPhoneOtpCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [phoneOtpCountdown]);

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
        setEmailVerified(Boolean(p.emailVerified));
        setPhoneVerified(Boolean(p.phoneVerified));
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

  const handleRequestEmailOtp = async () => {
    if (!profile.email?.trim()) {
      showError('กรุณากรอกอีเมลก่อนขอรับรหัส OTP');
      return;
    }
    setVerifyBusy(true);
    setSimulatedOtpNotice(null);
    setSimulatedEmailOtp(null);
    try {
      // Auto-save email to server database first so OTP matches DB!
      await updateUserProfile({ email: profile.email.trim() });
      const res = await requestEmailVerificationOtp();
      setEmailOtpSent(true);
      setDirectEmailOtpSent(true);
      setEmailOtpCountdown(300);
      showNotice(res.message);
      if (res.simulatedOtp) {
        setSimulatedEmailOtp(res.simulatedOtp);
        setDirectEmailOtp(res.simulatedOtp);
        setSimulatedOtpNotice(`อีเมล: รหัส OTP จำลองสำหรับทดสอบคือ ${res.simulatedOtp}`);
      }
    } catch (err) {
      showError(errorMessage(err) || 'ขอรหัส OTP ล้มเหลว');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleConfirmEmailOtp = async (codeOverride?: string | React.MouseEvent) => {
    const code = (typeof codeOverride === 'string' ? codeOverride : '') || directEmailOtp.trim() || emailOtpInput.trim();
    if (!code) return;
    setVerifyBusy(true);
    try {
      const res = await confirmEmailVerificationOtp(code);
      setEmailVerified(true);
      setEmailOtpSent(false);
      setDirectEmailOtpSent(false);
      setEmailOtpInput('');
      setDirectEmailOtp('');
      setSimulatedOtpNotice(null);
      setSimulatedEmailOtp(null);
      showNotice(res.message || 'ยืนยันอีเมลสำเร็จเรียบร้อยแล้ว');
    } catch (err) {
      showError(errorMessage(err) || 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleAutoFillAndVerifyEmail = async () => {
    if (simulatedEmailOtp) {
      setDirectEmailOtp(simulatedEmailOtp);
      setEmailOtpInput(simulatedEmailOtp);
      await handleConfirmEmailOtp(simulatedEmailOtp);
    }
  };

  const handleRequestPhoneOtp = async () => {
    if (!profile.phone?.trim()) {
      showError('กรุณากรอกเบอร์โทรศัพท์ก่อนขอรับรหัส OTP');
      return;
    }
    setVerifyBusy(true);
    setSimulatedOtpNotice(null);
    setSimulatedPhoneOtp(null);
    try {
      // Auto-save phone to server database first so OTP matches DB!
      await updateUserProfile({ phone: profile.phone.trim() });
      const res = await requestPhoneVerificationOtp();
      setPhoneOtpSent(true);
      setDirectPhoneOtpSent(true);
      setPhoneOtpCountdown(300);
      showNotice(res.message);
      if (res.simulatedOtp) {
        setSimulatedPhoneOtp(res.simulatedOtp);
        setDirectPhoneOtp(res.simulatedOtp);
        setSimulatedOtpNotice(`เบอร์โทร: รหัส OTP จำลองสำหรับทดสอบคือ ${res.simulatedOtp}`);
      }
    } catch (err) {
      showError(errorMessage(err) || 'ขอรหัส OTP ล้มเหลว');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleConfirmPhoneOtp = async (codeOverride?: string | React.MouseEvent) => {
    const code = (typeof codeOverride === 'string' ? codeOverride : '') || directPhoneOtp.trim() || phoneOtpInput.trim();
    if (!code) return;
    setVerifyBusy(true);
    try {
      const res = await confirmPhoneVerificationOtp(code);
      setPhoneVerified(true);
      setPhoneOtpSent(false);
      setDirectPhoneOtpSent(false);
      setPhoneOtpInput('');
      setDirectPhoneOtp('');
      setSimulatedOtpNotice(null);
      setSimulatedPhoneOtp(null);
      showNotice(res.message || 'ยืนยันเบอร์โทรศัพท์สำเร็จเรียบร้อยแล้ว');
    } catch (err) {
      showError(errorMessage(err) || 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleAutoFillAndVerifyPhone = async () => {
    if (simulatedPhoneOtp) {
      setDirectPhoneOtp(simulatedPhoneOtp);
      setPhoneOtpInput(simulatedPhoneOtp);
      await handleConfirmPhoneOtp(simulatedPhoneOtp);
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

  const handleRequestSecurityForgotOtp = async () => {
    setForgotBusy(true);
    setForgotSimulatedOtp(null);
    try {
      const res = await requestForgotOtp(user?.username || undefined, {
        email: forgotOtpType === 'email' ? profile.email : undefined,
        phone: forgotOtpType === 'phone' ? profile.phone : undefined,
        recoveryType: forgotOtpType,
      });
      setForgotOtpSent(true);
      showNotice(res.message);
      if (res.simulatedOtp || res.debugOtp) {
        const code = res.simulatedOtp || res.debugOtp;
        setForgotSimulatedOtp(code || null);
        setForgotOtpInput(code || '');
        showNotice(`ขอ OTP สำเร็จ! (รหัสจำลอง: ${code})`);
      }
    } catch (err) {
      showError(errorMessage(err) || 'ขอรหัส OTP กู้คืนล้มเหลว');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleResetSecurityPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotOtpInput.trim()) {
      showError('กรุณากรอกรหัส OTP');
      return;
    }
    if (forgotNewPass.length < 8) {
      showError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      showError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setForgotBusy(true);
    try {
      const res = await resetPasswordWithOtp(user?.username, forgotOtpInput.trim(), forgotNewPass, {
        email: forgotOtpType === 'email' ? profile.email : undefined,
        phone: forgotOtpType === 'phone' ? profile.phone : undefined,
      });
      showNotice(res.message || 'ตั้งรหัสผ่านใหม่สำเร็จเรียบร้อยแล้ว!');
      setForgotOtpSent(false);
      setForgotOtpInput('');
      setForgotSimulatedOtp(null);
      setForgotNewPass('');
      setForgotConfirmPass('');
    } catch (err) {
      showError(errorMessage(err) || 'ตั้งรหัสผ่านใหม่ล้มเหลว');
    } finally {
      setForgotBusy(false);
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
            className={`button ${activeTab === 'verify' ? 'button-primary' : 'button-quiet'}`}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '8px' }}
            onClick={() => setActiveTab('verify')}
          >
            ✉️ ยืนยันอีเมล & เบอร์โทร {(emailVerified && phoneVerified) ? '✅' : '⚠️'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    อีเมล (สำหรับกู้คืน OTP)
                  </label>
                  {profile.email && (
                    <div>
                      {emailVerified ? (
                        <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '12px' }}>✅ ยืนยันอีเมลแล้ว</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600, fontSize: '12px' }}>⚠️ ยังไม่ได้ยืนยัน</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="email"
                    style={{ flex: 1, boxSizing: 'border-box' }}
                    value={profile.email || ''}
                    onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                    placeholder="name@example.com"
                    maxLength={120}
                  />
                  {!emailVerified && (
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={verifyBusy || !profile.email?.trim()}
                      onClick={handleRequestEmailOtp}
                      style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '0 10px' }}
                    >
                      📲 ส่ง OTP ยืนยันทันที
                    </Button>
                  )}
                </div>

                {/* Inline OTP box for Email */}
                {directEmailOtpSent && !emailVerified && (
                  <div style={{
                    marginTop: '6px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                        กรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมล
                      </span>
                      {simulatedEmailOtp && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7' }}>
                          รหัสจำลอง: {simulatedEmailOtp}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={directEmailOtp}
                        onChange={(e) => setDirectEmailOtp(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '90px', textAlign: 'center', letterSpacing: '2px', fontWeight: 700, fontSize: '13px' }}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={verifyBusy || directEmailOtp.length !== 6}
                        onClick={() => void handleConfirmEmailOtp(directEmailOtp)}
                        style={{ fontSize: '11px' }}
                      >
                        ยืนยัน OTP
                      </Button>
                      {simulatedEmailOtp && (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          disabled={verifyBusy}
                          onClick={() => void handleAutoFillAndVerifyEmail()}
                          style={{
                            fontSize: '11px',
                            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                            color: '#fff',
                            border: 'none',
                          }}
                        >
                          ⚡ กรอกรหัส OTP อัตโนมัติ & ยืนยันทันที
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Phone Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                    เบอร์โทรศัพท์ (ถ้ามี)
                  </label>
                  {profile.phone && (
                    <div>
                      {phoneVerified ? (
                        <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '12px' }}>✅ ยืนยันเบอร์โทรแล้ว</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600, fontSize: '12px' }}>⚠️ ยังไม่ได้ยืนยัน</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="tel"
                    style={{ flex: 1, boxSizing: 'border-box' }}
                    value={profile.phone || ''}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                    placeholder="081-234-5678"
                    maxLength={30}
                  />
                  {!phoneVerified && (
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={verifyBusy || !profile.phone?.trim()}
                      onClick={handleRequestPhoneOtp}
                      style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '0 10px' }}
                    >
                      📲 ส่ง OTP ยืนยันทันที
                    </Button>
                  )}
                </div>

                {/* Inline OTP box for Phone */}
                {directPhoneOtpSent && !phoneVerified && (
                  <div style={{
                    marginTop: '6px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(168, 85, 247, 0.12)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                        กรอกรหัส OTP 6 หลักที่ส่งไปยังเบอร์โทร
                      </span>
                      {simulatedPhoneOtp && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#9333ea' }}>
                          รหัสจำลอง: {simulatedPhoneOtp}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={directPhoneOtp}
                        onChange={(e) => setDirectPhoneOtp(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '90px', textAlign: 'center', letterSpacing: '2px', fontWeight: 700, fontSize: '13px' }}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={verifyBusy || directPhoneOtp.length !== 6}
                        onClick={() => void handleConfirmPhoneOtp(directPhoneOtp)}
                        style={{ fontSize: '11px' }}
                      >
                        ยืนยัน OTP
                      </Button>
                      {simulatedPhoneOtp && (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          disabled={verifyBusy}
                          onClick={() => void handleAutoFillAndVerifyPhone()}
                          style={{
                            fontSize: '11px',
                            background: 'linear-gradient(135deg, #10b981 0%, #a855f7 100%)',
                            color: '#fff',
                            border: 'none',
                          }}
                        >
                          ⚡ กรอกรหัส OTP อัตโนมัติ & ยืนยันทันที
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
                      onChange={(e) => saveNotificationConfig({ ...notificationConfig, soundType: e.target.value as any })}
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

        {/* TAB: EMAIL & PHONE VERIFICATION */}
        {activeTab === 'verify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {simulatedOtpNotice && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#2563eb',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <span>💡 <strong>{simulatedOtpNotice}</strong></span>
                <button
                  type="button"
                  className="button button-quiet"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => {
                    const match = simulatedOtpNotice.match(/\d{6}/);
                    if (match) {
                      if (simulatedOtpNotice.includes('อีเมล')) setEmailOtpInput(match[0]);
                      else setPhoneOtpInput(match[0]);
                    }
                  }}
                >
                  วางรหัสลงช่องทันที
                </button>
              </div>
            )}

            {/* Email Verification Box */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.03))',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>📧</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                      ยืนยันอีเมล (Email Verification)
                    </h4>
                    <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                      {profile.email ? profile.email : 'ยังไม่ได้ระบุอีเมล'}
                    </span>
                  </div>
                </div>
                <div>
                  {emailVerified ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: 'rgba(22, 163, 74, 0.1)',
                        color: '#16a34a',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid rgba(22, 163, 74, 0.3)',
                      }}
                    >
                      ✅ ยืนยันแล้ว
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        color: '#d97706',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid rgba(217, 119, 6, 0.3)',
                      }}
                    >
                      ⚠️ ยังไม่ได้ยืนยัน
                    </span>
                  )}
                </div>
              </div>

              {!emailVerified && (
                <>
                  {!profile.email ? (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                      กรุณาระบุและบันทึกอีเมลของคุณในแท็บ "👤 ข้อมูลส่วนตัว" ก่อนเพื่อขอรับรหัส OTP
                    </p>
                  ) : !emailOtpSent ? (
                    <div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={verifyBusy}
                        onClick={handleRequestEmailOtp}
                      >
                        {verifyBusy ? 'กำลังส่งรหัส...' : 'ขอรหัส OTP ยืนยันอีเมล'}
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                        ระบบส่งรหัส OTP ไปที่ <strong>{profile.email}</strong> แล้ว (รหัสมีอายุ 5 นาที)
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="รหัส OTP 6 หลัก"
                          value={emailOtpInput}
                          onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, ''))}
                          style={{
                            width: '160px',
                            textAlign: 'center',
                            fontSize: '16px',
                            fontWeight: 700,
                            letterSpacing: '4px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--pkh-border-default)',
                          }}
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={verifyBusy || emailOtpInput.length !== 6}
                          onClick={handleConfirmEmailOtp}
                        >
                          {verifyBusy ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          disabled={verifyBusy || emailOtpCountdown > 240}
                          onClick={handleRequestEmailOtp}
                        >
                          {emailOtpCountdown > 0 ? `ขอรหัสใหม่ (${emailOtpCountdown}s)` : 'ขอรหัสใหม่'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Phone Verification Box */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.03))',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>📱</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                      ยืนยันเบอร์โทรศัพท์ (Phone Verification)
                    </h4>
                    <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                      {profile.phone ? profile.phone : 'ยังไม่ได้ระบุเบอร์โทรศัพท์'}
                    </span>
                  </div>
                </div>
                <div>
                  {phoneVerified ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: 'rgba(22, 163, 74, 0.1)',
                        color: '#16a34a',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid rgba(22, 163, 74, 0.3)',
                      }}
                    >
                      ✅ ยืนยันแล้ว
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        color: '#d97706',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid rgba(217, 119, 6, 0.3)',
                      }}
                    >
                      ⚠️ ยังไม่ได้ยืนยัน
                    </span>
                  )}
                </div>
              </div>

              {!phoneVerified && (
                <>
                  {!profile.phone ? (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                      กรุณาระบุและบันทึกเบอร์โทรศัพท์ของคุณในแท็บ "👤 ข้อมูลส่วนตัว" ก่อนเพื่อขอรับรหัส OTP
                    </p>
                  ) : !phoneOtpSent ? (
                    <div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={verifyBusy}
                        onClick={handleRequestPhoneOtp}
                      >
                        {verifyBusy ? 'กำลังส่งรหัส...' : 'ขอรหัส OTP ยืนยันเบอร์โทร'}
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                        ระบบส่งรหัส OTP ไปที่เบอร์ <strong>{profile.phone}</strong> แล้ว (รหัสมีอายุ 5 นาที)
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="รหัส OTP 6 หลัก"
                          value={phoneOtpInput}
                          onChange={(e) => setPhoneOtpInput(e.target.value.replace(/\D/g, ''))}
                          style={{
                            width: '160px',
                            textAlign: 'center',
                            fontSize: '16px',
                            fontWeight: 700,
                            letterSpacing: '4px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--pkh-border-default)',
                          }}
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={verifyBusy || phoneOtpInput.length !== 6}
                          onClick={handleConfirmPhoneOtp}
                        >
                          {verifyBusy ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          disabled={verifyBusy || phoneOtpCountdown > 240}
                          onClick={handleRequestPhoneOtp}
                        >
                          {phoneOtpCountdown > 0 ? `ขอรหัสใหม่ (${phoneOtpCountdown}s)` : 'ขอรหัสใหม่'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
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
                  {passwordBusy ? 'กำลังเปลี่ยนรหัสผ่าน…' : '🔑 เปลี่ยนรหัสผ่าน'}
                </Button>
              </div>
            </form>

            {/* Section: Forgot password via OTP within Security tab */}
            <div style={{
              marginTop: '8px',
              padding: '16px',
              borderRadius: '10px',
              background: 'var(--pkh-bg-subtle, #f8fafc)',
              border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div>
                <strong style={{ fontSize: '13.5px', color: 'var(--pkh-text-primary)', display: 'block' }}>
                  🔄 ลืมรหัสผ่านเดิม? กู้คืน/ตั้งรหัสผ่านใหม่ด้วย OTP (ผ่านอีเมล หรือ เบอร์โทรศัพท์)
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
                  ไม่ต้องกรอกรหัสผ่านเดิม ระบบจะส่งรหัส OTP 6 หลักไปยังช่องทางที่คุณเลือกเพื่อยืนยันตัวตน
                </p>
              </div>

              {!forgotOtpSent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="forgotOtpType"
                        checked={forgotOtpType === 'email'}
                        onChange={() => setForgotOtpType('email')}
                      />
                      <span>อีเมล ({profile.email || 'ยังไม่ได้ระบุ'})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="forgotOtpType"
                        checked={forgotOtpType === 'phone'}
                        onChange={() => setForgotOtpType('phone')}
                      />
                      <span>เบอร์โทรศัพท์ ({profile.phone || 'ยังไม่ได้ระบุ'})</span>
                    </label>
                  </div>

                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={forgotBusy || (forgotOtpType === 'email' ? !profile.email?.trim() : !profile.phone?.trim())}
                      onClick={handleRequestSecurityForgotOtp}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      {forgotBusy ? 'กำลังส่งรหัส OTP…' : '📲 ขอรหัส OTP เพื่อตั้งรหัสผ่านใหม่'}
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetSecurityPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {forgotSimulatedOtp && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      fontSize: '12px',
                      color: '#0284c7',
                      fontWeight: 600,
                    }}>
                      ⚡ รหัส OTP จำลองสำหรับทดสอบ: <strong>{forgotSimulatedOtp}</strong>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                      รหัส OTP 6 หลัก
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        placeholder="000000"
                        value={forgotOtpInput}
                        onChange={(e) => setForgotOtpInput(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '120px', textAlign: 'center', letterSpacing: '2px', fontWeight: 700 }}
                      />
                      {forgotSimulatedOtp && (
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          onClick={() => setForgotOtpInput(forgotSimulatedOtp)}
                          style={{ fontSize: '11px' }}
                        >
                          ⚡ กรอก OTP อัตโนมัติ
                        </Button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="รหัสผ่านใหม่อย่างน้อย 8 ตัว..."
                        value={forgotNewPass}
                        onChange={(e) => setForgotNewPass(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        ยืนยันรหัสผ่านใหม่
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง..."
                        value={forgotConfirmPass}
                        onChange={(e) => setForgotConfirmPass(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        setForgotOtpSent(false);
                        setForgotOtpInput('');
                        setForgotSimulatedOtp(null);
                      }}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={forgotBusy || forgotOtpInput.length !== 6 || forgotNewPass.length < 8}
                    >
                      {forgotBusy ? 'กำลังบันทึก…' : '🔐 ยืนยันตั้งรหัสผ่านใหม่'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
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
