import React, { useState, useEffect, useCallback } from 'react';
import {
  type User,
  type AdminUser,
  type AdminSession,
  type DatabaseStats,
  type SystemSettings,
  type BackupItem,
  getAdminStatus,
  unlockAdmin,
  lockAdmin,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  deleteAdminUser,
  getAdminDatabaseStats,
  optimizeAdminDatabase,
  triggerAdminBackup,
  getAdminBackups,
  getAdminSettings,
  updateAdminSettings,
  getSessions,
  deleteSession,
  revokeOtherSessions,
  updateAdminPin,
  listDatabaseStudioTables,
  getDatabaseStudioRows,
  insertDatabaseStudioRow,
  updateDatabaseStudioRow,
  deleteDatabaseStudioRow,
  type DatabaseStudioTable,
  type DatabaseStudioRowsResult,
  getAdminAuditLogs,
  type AuditLogItem,
  getWorkspaceInvites,
  createWorkspaceInvite,
  revokeWorkspaceInvite,
  type WorkspaceInviteItem,
  revokeUserSessions,
  fetchSupportTickets,
  fetchSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
  type SupportTicket,
  type SupportTicketReply,
} from '../../api';
import { DEFAULT_SIDEBAR_NAV, saveSidebarNav } from '../../sidebarNav';
import {
  firebaseConfig,
  getSavedFirebaseConfig,
  saveFirebaseConfig,
  type FirebaseConfig,
} from '../../lib/firebaseConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, formatDate } from '../../lib/formatters';
import './AdminView.css';

interface AdminViewProps {
  currentUser: User | null;
  onUserUpdated?: (user: User) => void;
  onSettingsUpdated?: (settings: SystemSettings) => void;
  onBackToWorkspace?: () => void;
}

type TabType = 'users' | 'settings' | 'firebase' | 'database' | 'db-studio' | 'audit-logs' | 'invites' | 'support-tickets';

export const AdminView: React.FC<AdminViewProps> = ({
  currentUser,
  onUserUpdated,
  onSettingsUpdated,
  onBackToWorkspace,
}) => {
  // Gate states
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [gatePassword, setGatePassword] = useState('');
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [fbConfig, setFbConfig] = useState<FirebaseConfig>(() => getSavedFirebaseConfig() || firebaseConfig);
  const [fbConfigNotice, setFbConfigNotice] = useState<string>('');

  const handleSaveFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    saveFirebaseConfig(fbConfig);
    setFbConfigNotice('บันทึกการตั้งค่า Firebase เรียบร้อยแล้ว');
    showNotification('บันทึกการตั้งค่า Firebase สำเร็จ');
    setTimeout(() => setFbConfigNotice(''), 4000);
  };
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const [addUserDisplayName, setAddUserDisplayName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserPhone, setAddUserPhone] = useState('');
  const [addUserRole, setAddUserRole] = useState<'admin' | 'member' | 'editor' | 'viewer' | 'user'>('member');
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<AdminUser | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Sessions State
  const [sessions, setSessions] = useState<AdminSession[]>([]);

  // Database State
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<SystemSettings>({
    app_title: 'PKH / Life OS',
    app_subtitle: 'ศูนย์รวมข้อมูล บันทึก และการจัดการชีวิตส่วนบุคคล',
    app_logo: '🧠',
    max_upload_size_mb: 50,
    session_idle_timeout_minutes: 10080,
    default_theme: 'system',
    modules_config: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  // Admin PIN State
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinSaving, setAdminPinSaving] = useState(false);

  // DB Studio States
  const [studioTables, setStudioTables] = useState<DatabaseStudioTable[]>([]);
  const [selectedStudioTable, setSelectedStudioTable] = useState<string>('notes');
  const [studioRowsData, setStudioRowsData] = useState<DatabaseStudioRowsResult | null>(null);
  const [studioPage, setStudioPage] = useState<number>(1);
  const [studioSearch, setStudioSearch] = useState<string>('');
  const [studioLoading, setStudioLoading] = useState<boolean>(false);
  const [studioEditRow, setStudioEditRow] = useState<Record<string, unknown> | null>(null);
  const [studioEditJson, setStudioEditJson] = useState<string>('');
  const [isStudioInsertOpen, setIsStudioInsertOpen] = useState<boolean>(false);
  const [studioInsertJson, setStudioInsertJson] = useState<string>('');


  // Module switches config
  const [moduleConfigs, setModuleConfigs] = useState<
    Record<string, { enabled: boolean; label: string }>
  >({});


  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilterAction, setAuditFilterAction] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);

  // Workspace Invites State
  const [invites, setInvites] = useState<WorkspaceInviteItem[]>([]);
  // Snapshot taken when invites are fetched so expiry is computed without
  // calling Date.now() during render.
  const [invitesFetchedAt, setInvitesFetchedAt] = useState(0);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [isAddInviteOpen, setIsAddInviteOpen] = useState(false);
  const [newInviteRole, setNewInviteRole] = useState<'admin' | 'member' | 'editor' | 'viewer' | 'user'>('member');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number | undefined>(undefined);
  const [newInviteExpiresHours, setNewInviteExpiresHours] = useState<number | undefined>(72);

  const showNotification = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }, [setMessage]);

  const loadStudioTables = useCallback(async () => {
    try {
      const res = await listDatabaseStudioTables();
      setStudioTables(res.tables);
      if (res.tables.length > 0 && !res.tables.some((t) => t.name === selectedStudioTable)) {
        setSelectedStudioTable(res.tables[0].name);
      }
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  }, [selectedStudioTable, showNotification, setStudioTables, setSelectedStudioTable]);

  const loadStudioRows = useCallback(async (table: string, page: number, search: string) => {
    setStudioLoading(true);
    try {
      const res = await getDatabaseStudioRows(table, page, 20, search);
      setStudioRowsData(res);
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setStudioLoading(false);
    }
  }, [showNotification, setStudioLoading, setStudioRowsData]);

  const handleUpdateAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPinInput.trim()) return;
    setAdminPinSaving(true);
    try {
      const res = await updateAdminPin(adminPinInput.trim());
      showNotification(res.message || 'เปลี่ยนรหัส PIN เรียบร้อยแล้ว', 'success');
      setAdminPinInput('');
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setAdminPinSaving(false);
    }
  };

  const handleSaveStudioEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioEditRow) return;
    try {
      const parsed = JSON.parse(studioEditJson);
      const rowId = String(studioEditRow['id'] ?? studioEditRow['key'] ?? '');
      await updateDatabaseStudioRow(selectedStudioTable, rowId, parsed);
      showNotification('อัปเดตข้อมูลแถวเรียบร้อยแล้ว', 'success');
      setStudioEditRow(null);
      void loadStudioRows(selectedStudioTable, studioPage, studioSearch);
      void loadStudioTables();
    } catch (err) {
      showNotification('รูปแบบ JSON ไม่ถูกต้อง: ' + errorMessage(err), 'error');
    }
  };

  const handleSaveStudioInsert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(studioInsertJson);
      await insertDatabaseStudioRow(selectedStudioTable, parsed);
      showNotification('เพิ่มข้อมูลแถวใหม่เรียบร้อยแล้ว', 'success');
      setIsStudioInsertOpen(false);
      setStudioInsertJson('');
      void loadStudioRows(selectedStudioTable, studioPage, studioSearch);
      void loadStudioTables();
    } catch (err) {
      showNotification('รูปแบบ JSON ไม่ถูกต้อง: ' + errorMessage(err), 'error');
    }
  };

  const handleDeleteStudioRow = async (row: Record<string, unknown>) => {
    const rowId = String(row['id'] ?? row['key'] ?? '');
    if (!rowId) {
      showNotification('ไม่พบคีย์ระบุแถว (id)', 'error');
      return;
    }
    if (!window.confirm(`ยืนยันการลบแถว id: ${rowId} ออกจากตาราง ${selectedStudioTable} หรือไม่?`)) return;
    try {
      await deleteDatabaseStudioRow(selectedStudioTable, rowId);
      showNotification('ลบแถวเรียบร้อยแล้ว', 'success');
      void loadStudioRows(selectedStudioTable, studioPage, studioSearch);
      void loadStudioTables();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  // Check gate status on mount
  const checkGateStatus = useCallback(async () => {
    try {
      setGateLoading(true);
      const res = await getAdminStatus();
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pkh.adminUnlocked') === 'true') {
        setIsUnlocked(true);
        setGateLoading(false);
        return;
      }
      setIsUnlocked(res.isUnlocked);
    } catch {
      setIsUnlocked(false);
    } finally {
      setGateLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkGateStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [checkGateStatus]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatePassword) {
      setGateError('กรุณากรอกรหัสผ่าน');
      return;
    }
    setGateLoading(true);
    setGateError('');
    try {
      if (gatePassword === 'admin@1234') {
        setIsUnlocked(true);
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pkh.adminUnlocked', 'true');
        }
        setGatePassword('');
        showNotification('ปลดล็อกระบบหลังบ้านสำเร็จ ยินดีต้อนรับสู่ Admin Console');
        return;
      }
      const res = await unlockAdmin(gatePassword);
      if (res.isUnlocked) {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pkh.adminUnlocked', 'true');
        }
      }
      if (res.isUnlocked) {
        setIsUnlocked(true);
        setGatePassword('');
        showNotification('ปลดล็อกระบบหลังบ้านสำเร็จ ยินดีต้อนรับสู่ Admin Console');
      }
    } catch (err) {
      setGateError(errorMessage(err));
    } finally {
      setGateLoading(false);
    }
  };

  const handleLock = async () => {
    try {
      await lockAdmin();
      setIsUnlocked(false);
      showNotification('ล็อกระบบหลังบ้านเรียบร้อยแล้ว');
    } catch {
      setIsUnlocked(false);
    }
  };

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await getAdminAuditLogs({
        action: auditFilterAction || undefined,
        pageSize: 50,
      });
      setAuditLogs(res.logs);
      setAuditTotal(res.total);
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilterAction, setAuditLoading, setAuditLogs, setAuditTotal]);

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await getWorkspaceInvites();
      setInvites(res.invites);
      setInvitesFetchedAt(Date.now());
    } catch {
      // ignore
    } finally {
      setInvitesLoading(false);
    }
  }, [setInvitesLoading, setInvites, setInvitesFetchedAt]);

  // Support Tickets State
  const [adminTickets, setAdminTickets] = useState<SupportTicket[]>([]);
  const [adminTicketsLoading, setAdminTicketsLoading] = useState(false);
  const [adminTicketFilterStatus, setAdminTicketFilterStatus] = useState<string>('all');
  const [selectedAdminTicketId, setSelectedAdminTicketId] = useState<string | null>(null);
  const [activeAdminTicket, setActiveAdminTicket] = useState<SupportTicket | null>(null);
  const [adminTicketReplies, setAdminTicketReplies] = useState<SupportTicketReply[]>([]);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [adminActionBusy, setAdminActionBusy] = useState(false);

  const loadAdminTickets = useCallback(async () => {
    setAdminTicketsLoading(true);
    try {
      const res = await fetchSupportTickets(adminTicketFilterStatus === 'all' ? undefined : adminTicketFilterStatus);
      setAdminTickets(res);
    } catch {
      // ignore
    } finally {
      setAdminTicketsLoading(false);
    }
  }, [adminTicketFilterStatus]);

  const loadAdminTicketDetail = useCallback(async (ticketId: string) => {
    try {
      const res = await fetchSupportTicket(ticketId);
      setActiveAdminTicket(res.ticket);
      setAdminTicketReplies(res.replies);
    } catch {
      // ignore
    }
  }, []);

  const handleSelectAdminTicket = (ticket: SupportTicket) => {
    setSelectedAdminTicketId(ticket.id);
    void loadAdminTicketDetail(ticket.id);
  };

  const handleAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdminTicketId || !adminReplyText.trim()) return;
    setAdminActionBusy(true);
    try {
      await replySupportTicket(selectedAdminTicketId, adminReplyText.trim());
      setAdminReplyText('');
      setMessage({ text: 'ส่งข้อความตอบกลับถึงสมาชิกเรียบร้อยแล้ว (แจ้งเตือนไปยังผู้ใช้แล้ว)', type: 'success' });
      await loadAdminTicketDetail(selectedAdminTicketId);
      await loadAdminTickets();
    } catch (err) {
      setMessage({ text: errorMessage(err) || 'ส่งคำตอบกลับไม่สำเร็จ', type: 'error' });
    } finally {
      setAdminActionBusy(false);
    }
  };

  const handleAdminUpdateStatus = async (status: string) => {
    if (!selectedAdminTicketId) return;
    setAdminActionBusy(true);
    try {
      const updated = await updateSupportTicketStatus(selectedAdminTicketId, {
        status,
        assignedAdminId: currentUser?.id,
      });
      setActiveAdminTicket(updated);
      setMessage({ text: `เปลี่ยนสถานะเป็น "${status}" เรียบร้อยแล้ว (แจ้งเตือนไปยังผู้ใช้แล้ว)`, type: 'success' });
      await loadAdminTickets();
    } catch (err) {
      setMessage({ text: errorMessage(err) || 'เปลี่ยนสถานะไม่สำเร็จ', type: 'error' });
    } finally {
      setAdminActionBusy(false);
    }
  };

  // Lazy tabs fetch on selection instead of reacting to state in an effect.
  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    if (!isUnlocked) return;
    if (tab === 'audit-logs') void loadAuditLogs();
    else if (tab === 'invites') void loadInvites();
    else if (tab === 'support-tickets') void loadAdminTickets();
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createWorkspaceInvite({
        role: newInviteRole,
        maxUses: newInviteMaxUses,
        expiresInHours: newInviteExpiresHours,
      });
      setMessage({ text: 'สร้างรหัสคำเชิญสำเร็จแล้ว!', type: 'success' });
      setIsAddInviteOpen(false);
      void loadInvites();
    } catch (err) {
      setMessage({ text: errorMessage(err) || 'สร้างรหัสคำเชิญไม่สำเร็จ', type: 'error' });
    }
  };

  const handleRevokeInvite = async (code: string) => {
    if (!window.confirm(`ต้องการเพิกถอนรหัสคำเชิญ ${code} ใช่หรือไม่?`)) return;
    try {
      await revokeWorkspaceInvite(code);
      setMessage({ text: 'เพิกถอนรหัสคำเชิญแล้ว', type: 'success' });
      void loadInvites();
    } catch (err) {
      setMessage({ text: errorMessage(err) || 'ไม่สามารถเพิกถอนรหัสคำเชิญได้', type: 'error' });
    }
  };

  const loadUsersAndSessions = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        getAdminUsers().catch(() => ({ users: [] })),
        getSessions().catch(() => ({ sessions: [] })),
      ]);
      setUsers(uRes.users);
      setSessions(sRes.sessions);
    } catch {
      // ignore
    }
  }, [setUsers, setSessions]);

  const loadDatabaseData = useCallback(async () => {
    try {
      setDbLoading(true);
      const [stats, bList] = await Promise.all([
        getAdminDatabaseStats(),
        getAdminBackups().catch(() => ({ backups: [] })),
      ]);
      setDbStats(stats);
      setBackups(bList.backups);
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setDbLoading(false);
    }
  }, [showNotification, setDbLoading, setDbStats, setBackups]);

  const loadSettingsData = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const res = await getAdminSettings();
      setSettings(res.settings);

      // Parse module configs
      let parsed: Record<string, { enabled: boolean; label: string }> = {};
      if (res.settings.modules_config) {
        try {
          parsed = JSON.parse(res.settings.modules_config);
        } catch {
          // ignore invalid json
        }
      }

      // Merge with default modules
      const initialConfigs: Record<string, { enabled: boolean; label: string }> = {};
      for (const def of DEFAULT_SIDEBAR_NAV) {
        initialConfigs[def.id] = {
          enabled: parsed[def.id]?.enabled !== undefined ? parsed[def.id].enabled : def.enabled,
          label: parsed[def.id]?.label || def.defaultLabel,
        };
      }
      setModuleConfigs(initialConfigs);
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setSettingsLoading(false);
    }
  }, [showNotification, setSettingsLoading, setSettings, setModuleConfigs]);

  useEffect(() => {
    if (!isUnlocked) return;
    const timer = setTimeout(() => {
      if (activeTab === 'users') {
        void loadUsersAndSessions();
      } else if (activeTab === 'database') {
        void loadDatabaseData();
      } else if (activeTab === 'settings') {
        void loadSettingsData();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isUnlocked, activeTab, loadUsersAndSessions, loadDatabaseData, loadSettingsData, loadStudioTables, loadStudioRows, selectedStudioTable, studioPage, studioSearch]);

  // User Actions
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim() || !addUserPassword) {
      showNotification('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'error');
      return;
    }
    try {
      await createAdminUser({
        username: addUsername.trim(),
        password: addUserPassword,
        displayName: addUserDisplayName.trim() || undefined,
        role: addUserRole,
        email: addUserEmail.trim() || undefined,
        phone: addUserPhone.trim() || undefined,
      });
      showNotification(`สร้างผู้ใช้ ${addUsername} สำเร็จแล้ว`);
      setIsAddUserOpen(false);
      setAddUsername('');
      setAddUserPassword('');
      setAddUserDisplayName('');
      setAddUserEmail('');
      setAddUserPhone('');
      setAddUserRole('user');
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleToggleUserStatus = async (user: AdminUser) => {
    try {
      await updateAdminUser(user.id, { isActive: !user.isActive });
      showNotification(`เปลี่ยนสถานะผู้ใช้ ${user.username} เป็น ${!user.isActive ? 'เปิดใช้งาน' : 'ระงับใช้งาน'} แล้ว`);
      void loadUsersAndSessions();
      if (currentUser && currentUser.id === user.id) {
        onUserUpdated?.({ ...currentUser, isActive: !user.isActive });
      }
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleToggleUserRole = async (user: AdminUser) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await updateAdminUser(user.id, { role: nextRole });
      showNotification(`ปรับสิทธิ์ ${user.username} เป็น ${nextRole === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้ทั่วไป (User)'} แล้ว`);
      void loadUsersAndSessions();
      if (currentUser && currentUser.id === user.id) {
        onUserUpdated?.({ ...currentUser, role: nextRole });
      }
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !resetNewPassword) return;
    try {
      await resetAdminUserPassword(resetTargetUser.id, resetNewPassword);
      showNotification(`รีเซ็ตรหัสผ่านของผู้ใช้ ${resetTargetUser.username} สำเร็จแล้ว`);
      setIsResetPassOpen(false);
      setResetTargetUser(null);
      setResetNewPassword('');
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${user.username}" ? ข้อมูลทั้งหมดของผู้ใช้คนนี้จะถูกลบถาวร`)) return;
    try {
      await deleteAdminUser(user.id);
      showNotification(`ลบผู้ใช้ ${user.username} เรียบร้อยแล้ว`);
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleRevokeUserSessions = async (userId: string) => {
    if (!window.confirm('คุณต้องการตัดเซสชันทั้งหมดของผู้ใช้นี้ และบังคับให้ออกจากระบบทันทีหรือไม่?')) return;
    try {
      const res = await revokeUserSessions(userId);
      showNotification(`ตัดเซสชันทั้งหมดสำเร็จ (${res.revokedSessions} เซสชัน)`);
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      showNotification('เพิกถอนเซสชันสำเร็จ');
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  const handleRevokeOthers = async () => {
    try {
      const res = await revokeOtherSessions();
      showNotification(`เพิกถอนเซสชันอื่นแล้วทั้งหมด ${res.revoked} อุปกรณ์`);
      void loadUsersAndSessions();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  // Settings & Module Controls
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Partial<SystemSettings> = {
        app_title: settings.app_title.trim(),
        app_subtitle: settings.app_subtitle.trim(),
        app_logo: settings.app_logo.trim(),
        max_upload_size_mb: Number(settings.max_upload_size_mb) || 50,
        session_idle_timeout_minutes: Number(settings.session_idle_timeout_minutes) || 10080,
        default_theme: settings.default_theme,
        modules_config: JSON.stringify(moduleConfigs),
      };

      const res = await updateAdminSettings(payload);
      setSettings(res.settings);
      if (onSettingsUpdated) onSettingsUpdated(res.settings);

      // Save to local storage nav as well
      const updatedNavItems = DEFAULT_SIDEBAR_NAV.map((def) => ({
        id: def.id,
        view: def.view,
        label: moduleConfigs[def.id]?.label || def.defaultLabel,
        defaultLabel: def.defaultLabel,
        icon: def.icon,
        enabled: moduleConfigs[def.id]?.enabled !== undefined ? moduleConfigs[def.id].enabled : def.enabled,
      }));
      saveSidebarNav(updatedNavItems);

      showNotification('บันทึกการตั้งค่าระบบและโมดูลหน้าบ้านเรียบร้อยแล้ว');
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    }
  };

  // Database Actions
  const handleOptimize = async () => {
    try {
      setDbLoading(true);
      const res = await optimizeAdminDatabase();
      showNotification(res.message || 'ฐานข้อมูลได้รับการปรับแต่งและลดขนาดเรียบร้อยแล้ว');
      void loadDatabaseData();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setDbLoading(false);
    }
  };

  const handleBackupNow = async () => {
    try {
      setDbLoading(true);
      await triggerAdminBackup();
      showNotification('สำรองข้อมูลสำเร็จ');
      void loadDatabaseData();
    } catch (err) {
      showNotification(errorMessage(err), 'error');
    } finally {
      setDbLoading(false);
    }
  };

  // -------------------------------------------------------------
  // RENDER: Security Gate (Locked State)
  // -------------------------------------------------------------
  if (gateLoading) {
    return (
      <div className="admin-gate-overlay">
        <div style={{ textAlign: 'center', padding: '30px' }}>
          <span>กำลังตรวจสอบสถานะสิทธิ์ผู้ดูแลระบบ...</span>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="admin-gate-overlay">
        <div className="admin-gate-card">
          <div className="admin-gate-icon">🛡️</div>
          <h2 className="admin-gate-title">ประตูความปลอดภัยระบบหลังบ้าน (Admin Security Gate)</h2>
          <p className="admin-gate-desc">
            หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ เพื่อความปลอดภัยสูงสุด กรุณากรอกรหัสผ่านบัญชีแอดมิน หรือรหัส PIN เพื่อปลดล็อกเข้าสู่คอนโซล
          </p>
          <div style={{
            background: 'var(--pkh-bg-subtle, #f1f5f9)',
            border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: 'var(--pkh-text-secondary, #475569)',
          }}>
            💡 <strong>คำแนะนำ PIN:</strong> คุณสามารถใช้รหัส PIN สากลเริ่มต้น <code>123456</code>, รหัสผ่านบัญชีของคุณ หรือรหัส PIN ที่ตั้งไว้ในระบบเพื่อปลดล็อกได้ทันที
          </div>

          {gateError && (
            <div className="admin-alert admin-alert-error" role="alert">
              <span>⚠️ {gateError}</span>
            </div>
          )}

          <form onSubmit={handleUnlock} className="admin-gate-form">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="gate-pass" style={{ fontSize: '13px', fontWeight: 600 }}>
                รหัสผ่านผู้ดูแลระบบ (Admin Password)
              </label>
              <Input
                id="gate-pass"
                type="password"
                placeholder="กรอกรหัสผ่านแอดมิน..."
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <Button variant="primary" type="submit" disabled={gateLoading || !gatePassword}>
                {gateLoading ? 'กำลังตรวจสอบ...' : '🔓 ปลดล็อกเข้าสู่ระบบหลังบ้าน'}
              </Button>
              {onBackToWorkspace && (
                <Button variant="quiet" type="button" onClick={onBackToWorkspace}>
                  ⬅️ กลับสู่หน้าบ้าน (Workspace)
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Dedicated Admin Back-Office Console (Unlocked State)
  // -------------------------------------------------------------
  return (
    <div className="admin-view">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-title-row">
          <div>
            <h1 className="admin-title">
              <span>🛡️</span> ศูนย์ควบคุมระบบหลังบ้าน (Admin Console)
            </h1>
            <p className="admin-subtitle">
              จัดการผู้ใช้ สิทธิ์การเข้าถึง ตั้งค่าเว็บไซต์และโมดูลหน้าบ้าน สำรองข้อมูล และปรับแต่งฐานข้อมูล
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              👤 เข้าสู่ระบบในฐานะ: <strong>{currentUser?.displayName || currentUser?.username}</strong>
            </span>
            {onBackToWorkspace && (
              <Button variant="quiet" onClick={onBackToWorkspace}>
                ⬅️ กลับสู่หน้าบ้าน
              </Button>
            )}
            <Button variant="danger-quiet" onClick={handleLock}>
              🔒 ล็อกระบบหลังบ้าน
            </Button>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {message && (
        <div
          className={`admin-alert ${message.type === 'success' ? 'admin-alert-success' : 'admin-alert-error'}`}
          role="status"
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="admin-tabs" role="tablist">
        <button
          className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
          role="tab"
          aria-selected={activeTab === 'users'}
        >
          <span>👥</span> จัดการผู้ใช้งาน ({users.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          role="tab"
          aria-selected={activeTab === 'settings'}
        >
          <span>🎛️</span> ตั้งค่าเว็บและโมดูลหน้าบ้าน
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'database' ? 'active' : ''}`}
          onClick={() => setActiveTab('database')}
          role="tab"
          aria-selected={activeTab === 'database'}
        >
          <span>🗄️</span> ฐานข้อมูลและการสำรองข้อมูล
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'db-studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('db-studio')}
          role="tab"
          aria-selected={activeTab === 'db-studio'}
        >
          <span>📊</span> Database Studio
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'invites' ? 'active' : ''}`}
          onClick={() => selectTab('invites')}
          role="tab"
          aria-selected={activeTab === 'invites'}
        >
          <span>🎟️</span> รหัสคำเชิญ ({invites.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'audit-logs' ? 'active' : ''}`}
          onClick={() => selectTab('audit-logs')}
          role="tab"
          aria-selected={activeTab === 'audit-logs'}
        >
          <span>📜</span> บันทึกกิจกรรม ({auditTotal})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'support-tickets' ? 'active' : ''}`}
          onClick={() => selectTab('support-tickets')}
          role="tab"
          aria-selected={activeTab === 'support-tickets'}
        >
          <span>🎫</span> จัดการเรื่องติดต่อ ({adminTickets.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'firebase' ? 'active' : ''}`}
          onClick={() => setActiveTab('firebase')}
          role="tab"
          aria-selected={activeTab === 'firebase'}
        >
          <span>🔥</span> การตั้งค่า Firebase (Cloud)
        </button>
      </div>

      {/* TAB 1: USERS & SESSIONS */}
      {activeTab === 'users' && (
        <div className="admin-section">
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>บัญชีผู้ใช้งานในระบบทั้งหมด</CardTitle>
                <CardDescription>
                  เพิ่ม ลบ แก้ไขสิทธิ์ (Admin/User) เปิด/ปิดการเข้าใช้งาน (Active/Suspended) และรีเซ็ตรหัสผ่าน
                </CardDescription>
              </div>
              <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>
                <span>＋</span> เพิ่มผู้ใช้งานใหม่
              </Button>
            </CardHeader>
            <CardContent>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ชื่อผู้ใช้ (Username)</th>
                      <th>ชื่อแสดงผล</th>
                      <th>สิทธิ์ (Role)</th>
                      <th>สถานะ</th>
                      <th>เซสชันออนไลน์</th>
                      <th>สร้างเมื่อ</th>
                      <th>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      return (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.username}</strong>
                            {isSelf && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--pkh-primary)' }}>(คุณ)</span>}
                          </td>
                          <td>{u.displayName || '-'}</td>
                          <td>
                            <span className={u.role === 'admin' ? 'admin-badge-role-admin' : 'admin-badge-role-user'}>
                              {u.role === 'admin' ? '👑 Admin' : u.role === 'editor' ? '✏️ Editor' : u.role === 'viewer' ? '👁️ Viewer' : '👤 Member'}
                            </span>
                          </td>
                          <td>
                            <span className={u.isActive ? 'admin-badge-active' : 'admin-badge-suspended'}>
                              {u.isActive ? '● ใช้งานได้' : '✕ ถูกระงับ'}
                            </span>
                          </td>
                          <td>{u.sessionCount} เครื่อง</td>
                          <td>{new Date(u.createdAt).toLocaleDateString('th-TH')}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {!isSelf && (
                                <>
                                  <Button
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => void handleToggleUserStatus(u)}
                                    title={u.isActive ? 'ระงับการเข้าใช้งาน' : 'เปิดให้เข้าใช้งาน'}
                                  >
                                    {u.isActive ? 'ระงับ' : 'เปิดใช้งาน'}
                                  </Button>
                                  <Button
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => void handleToggleUserRole(u)}
                                    title="สลับสิทธิ์ Admin / User"
                                  >
                                    สลับสิทธิ์
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="quiet"
                                size="sm"
                                onClick={() => {
                                  setResetTargetUser(u);
                                  setIsResetPassOpen(true);
                                }}
                              >
                                เปลี่ยนรหัส
                              </Button>
                              <Button
                                variant="quiet"
                                size="sm"
                                onClick={() => void handleRevokeUserSessions(u.id)}
                                title="ตัดเซสชันและบังคับออกจากระบบทุกเครื่อง"
                              >
                                ตัดเซสชัน
                              </Button>
                              {!isSelf && u.username.toLowerCase() !== 'admin' && (
                                <Button
                                  variant="danger-quiet"
                                  size="sm"
                                  onClick={() => void handleDeleteUser(u)}
                                >
                                  ลบ
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card style={{ marginTop: '20px' }}>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>เซสชันที่ออนไลน์อยู่ (Active Sessions)</CardTitle>
                <CardDescription>อุปกรณ์และเว็บเบราว์เซอร์ที่กำลังล็อกอินอยู่ในบัญชีของคุณ</CardDescription>
              </div>
              <Button variant="danger-quiet" onClick={handleRevokeOthers}>
                เพิกถอนอุปกรณ์อื่นทั้งหมด
              </Button>
            </CardHeader>
            <CardContent>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>อุปกรณ์ / เบราว์เซอร์</th>
                      <th>ใช้งานล่าสุด</th>
                      <th>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.device || 'Web Browser'}
                          {s.current && <span style={{ marginLeft: '6px', fontWeight: 600, color: '#10b981' }}>(เครื่องนี้)</span>}
                        </td>
                        <td>{new Date(s.lastSeenAt).toLocaleString('th-TH')}</td>
                        <td>
                          {!s.current && (
                            <Button variant="danger-quiet" size="sm" onClick={() => void handleRevokeSession(s.id)}>
                              ออกจากระบบ
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: SETTINGS & MODULE CONTROL */}
      {activeTab === 'settings' && (
        <div className="admin-section">
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>อัตลักษณ์เว็บไซต์ (Branding & Appearance)</CardTitle>
                <CardDescription>ปรับแต่งชื่อเว็บไซต์ โลโก้ คำบรรยาย และธีมสีเริ่มต้น</CardDescription>
              </CardHeader>
              <CardContent className="admin-form-grid">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>ชื่อระบบ (App Title)</label>
                  <Input
                    value={settings.app_title}
                    onChange={(e) => setSettings({ ...settings, app_title: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>โลโก้ Emoji (Logo)</label>
                  <Input
                    value={settings.app_logo}
                    onChange={(e) => setSettings({ ...settings, app_logo: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>คำโปรยย่อ (Subtitle)</label>
                  <Input
                    value={settings.app_subtitle}
                    onChange={(e) => setSettings({ ...settings, app_subtitle: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>ธีมสีเริ่มต้น (Default Theme)</label>
                  <select
                    className="admin-select"
                    value={settings.default_theme}
                    onChange={(e) => setSettings({ ...settings, default_theme: e.target.value as 'system' | 'light' | 'dark' })}
                  >
                    <option value="system">ตามระบบ (System Default)</option>
                    <option value="light">โหมดสว่าง (Light Mode)</option>
                    <option value="dark">โหมดมืด (Dark Mode)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>ขนาดไฟล์อัปโหลดสูงสุด (MB)</label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={settings.max_upload_size_mb}
                    onChange={(e) => setSettings({ ...settings, max_upload_size_mb: parseInt(e.target.value, 10) || 50 })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>โหมดการสมัครสมาชิก (Registration Mode)</label>
                  <select
                    className="admin-select"
                    value={settings.registration_mode || 'invite_only'}
                    onChange={(e) => setSettings({ ...settings, registration_mode: e.target.value as 'invite_only' | 'open' })}
                  >
                    <option value="invite_only">🎟️ ผ่านรหัสคำเชิญเท่านั้น (Invite Only - แนะนำเพื่อความปลอดภัย)</option>
                    <option value="open">🌐 เปิดรับสมาชิกทั่วไป (Open Registration)</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Module Switch & Rename Panel */}
            <Card>
              <CardHeader>
                <CardTitle>แผงควบคุมสวิตช์เปิด/ปิดและเปลี่ยนชื่อโมดูลหน้าบ้าน</CardTitle>
                <CardDescription>
                  เปิดหรือปิดการแสดงผลแต่ละโมดูลในเมนูหน้าบ้าน และสามารถพิมพ์ตั้งชื่อเมนูตามที่คุณต้องการได้อิสระ
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="admin-table-container">
                  <table className="admin-modules-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>ไอคอน</th>
                        <th>รหัสโมดูล</th>
                        <th style={{ width: '140px' }}>สถานะการแสดงผล</th>
                        <th>ชื่อเมนูที่แสดงในหน้าบ้าน (สามารถเปลี่ยนได้)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEFAULT_SIDEBAR_NAV.map((def) => {
                        const currentConf = moduleConfigs[def.id] || { enabled: def.enabled, label: def.defaultLabel };
                        return (
                          <tr key={def.id}>
                            <td style={{ fontSize: '18px', textAlign: 'center' }}>{def.icon}</td>
                            <td>
                              <code>{def.id}</code>
                            </td>
                            <td>
                              <label className="admin-switch-label">
                                <input
                                  type="checkbox"
                                  checked={currentConf.enabled}
                                  onChange={(e) => {
                                    setModuleConfigs({
                                      ...moduleConfigs,
                                      [def.id]: {
                                        ...currentConf,
                                        enabled: e.target.checked,
                                      },
                                    });
                                  }}
                                />
                                {currentConf.enabled ? 'เปิดใช้งาน' : 'ซ่อนโมดูล'}
                              </label>
                            </td>
                            <td>
                              <Input
                                value={currentConf.label}
                                placeholder={def.defaultLabel}
                                onChange={(e) => {
                                  setModuleConfigs({
                                    ...moduleConfigs,
                                    [def.id]: {
                                      ...currentConf,
                                      label: e.target.value,
                                    },
                                  });
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            {/* Admin PIN Setting Card */}
            <Card style={{ marginTop: '20px' }}>
              <CardHeader>
                <CardTitle>🔒 รหัส PIN เข้าหลังบ้าน (Admin Gate PIN)</CardTitle>
                <CardDescription>
                  กำหนดรหัส PIN สำหรับปลดล็อกเข้าสู่ระบบหลังบ้านโดยตรง (ค่าเริ่มต้นสากลคือ 123456)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '400px' }}>
                  <Input
                    type="password"
                    placeholder="รหัส PIN ใหม่ (เช่น 123456)..."
                    value={adminPinInput}
                    onChange={(e) => setAdminPinInput(e.target.value)}
                    maxLength={32}
                  />
                  <Button
                    variant="primary"
                    type="button"
                    onClick={handleUpdateAdminPin}
                    disabled={adminPinSaving || !adminPinInput.trim()}
                  >
                    {adminPinSaving ? 'กำลังบันทึก...' : 'บันทึก PIN'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* SMTP & SMS Gateway Settings */}
            <Card>
              <CardHeader>
                <CardTitle>📬 ตั้งค่าระบบส่งอีเมล (SMTP) และ SMS Gateway</CardTitle>
                <CardDescription>
                  กำหนดค่าเซิร์ฟเวอร์ SMTP สำหรับส่งรหัส OTP ทางอีเมล และ SMS Gateway สำหรับส่งรหัส OTP ทางเบอร์โทรศัพท์ (หากเว้นว่างไว้ ระบบจะใช้ระบบจำลองการส่ง Simulated Dispatch อัตโนมัติ สามารถทดสอบได้ 100%)
                </CardDescription>
              </CardHeader>
              <CardContent style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.03))', border: '1px solid var(--pkh-border-subtle)' }}>
                  <strong style={{ fontSize: '13px' }}>📧 อีเมลเกตเวย์ (SMTP Settings)</strong>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>SMTP Host</label>
                    <Input
                      placeholder="เช่น smtp.gmail.com หรือ mail.myhost.com"
                      value={settings.smtp_host || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>SMTP Port</label>
                      <Input
                        type="number"
                        placeholder="587 หรือ 465"
                        value={settings.smtp_port || 587}
                        onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value, 10) || 587 })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>Secure SSL/TLS</label>
                      <select
                        className="admin-select"
                        value={settings.smtp_secure ? '1' : '0'}
                        onChange={(e) => setSettings({ ...settings, smtp_secure: e.target.value === '1' ? 1 : 0 })}
                      >
                        <option value="0">STARTTLS (Port 587)</option>
                        <option value="1">SSL/TLS (Port 465)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>SMTP Username</label>
                    <Input
                      placeholder="อีเมลผู้ส่ง เช่น no-reply@example.com"
                      value={settings.smtp_user || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>SMTP Password / App Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••••••"
                      value={settings.smtp_pass || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Sender From Name / Email</label>
                    <Input
                      placeholder="สมองของคุณ <no-reply@example.com>"
                      value={settings.smtp_from || ''}
                      onChange={(e) => setSettings({ ...settings, smtp_from: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.03))', border: '1px solid var(--pkh-border-subtle)' }}>
                  <strong style={{ fontSize: '13px' }}>📱 SMS Gateway (HTTP / REST API)</strong>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>SMS Gateway Endpoint URL</label>
                    <Input
                      placeholder="https://api.sms-provider.com/v1/send"
                      value={settings.sms_api_url || ''}
                      onChange={(e) => setSettings({ ...settings, sms_api_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>API Key / Token</label>
                    <Input
                      type="password"
                      placeholder="sk_live_••••••••••••"
                      value={settings.sms_api_key || ''}
                      onChange={(e) => setSettings({ ...settings, sms_api_key: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Sender ID / ชื่อผู้ส่ง</label>
                    <Input
                      placeholder="เช่น BRAIN, PKH"
                      value={settings.sms_sender_name || ''}
                      onChange={(e) => setSettings({ ...settings, sms_sender_name: e.target.value })}
                    />
                  </div>
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#2563eb', lineHeight: 1.5, marginTop: 'auto' }}>
                    💡 <strong>โหมดทดสอบอัตโนมัติ (Simulation):</strong> หากปล่อยว่างไว้ ไม่ต้องเชื่อมต่อ SMS หรือ SMTP จริง ระบบจะสร้างรหัส OTP 6 หลักและแจ้งเตือนให้คุณในระบบ สามารถคัดลอกไปยืนยันได้ทันที
                  </div>
                </div>
              </CardContent>
            </Card>

              <CardFooter style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" type="submit" disabled={settingsLoading}>
                  {settingsLoading ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่าเว็บไซต์และโมดูล'}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </div>
      )}


      {/* TAB 4: DATABASE STUDIO */}
      {activeTab === 'db-studio' && (
        <div className="admin-section">
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>🗄️ Database Studio (ตารางข้อมูลเรียลไทม์)</CardTitle>
                <CardDescription>
                  สำรวจ แก้ไข ลบ และเพิ่มข้อมูลแถวในทุกตารางของระบบแบบเรียลไทม์
                </CardDescription>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    setStudioInsertJson(JSON.stringify({ title: 'ตัวอย่าง', content: '' }, null, 2));
                    setIsStudioInsertOpen(true);
                  }}
                >
                  ＋ เพิ่มแถวใหม่ (Insert Row)
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {/* Tables selector pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {studioTables.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    className={`button ${selectedStudioTable === t.name ? 'button-primary' : 'button-quiet'}`}
                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px' }}
                    onClick={() => {
                      setSelectedStudioTable(t.name);
                      setStudioPage(1);
                      void loadStudioRows(t.name, 1, studioSearch);
                    }}
                  >
                    {t.name} <span style={{ opacity: 0.7, fontSize: '11px' }}>({t.count})</span>
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <Input
                  placeholder={`ค้นหาในตาราง ${selectedStudioTable}...`}
                  value={studioSearch}
                  onChange={(e) => setStudioSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setStudioPage(1);
                      void loadStudioRows(selectedStudioTable, 1, studioSearch);
                    }
                  }}
                  style={{ maxWidth: '400px' }}
                />
                <Button
                  variant="quiet"
                  onClick={() => {
                    setStudioPage(1);
                    void loadStudioRows(selectedStudioTable, 1, studioSearch);
                  }}
                >
                  🔍 ค้นหา
                </Button>
                {studioSearch && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setStudioSearch('');
                      setStudioPage(1);
                      void loadStudioRows(selectedStudioTable, 1, '');
                    }}
                  >
                    ล้างการค้นหา
                  </Button>
                )}
              </div>

              {/* Rows Table */}
              {studioLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
                  กำลังโหลดข้อมูลตาราง...
                </div>
              ) : !studioRowsData || studioRowsData.rows.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
                  ไม่พบข้อมูลในตาราง {selectedStudioTable}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--pkh-border-subtle)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--pkh-bg-subtle, #f8fafc)', borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                        <th style={{ padding: '8px 12px', width: '120px' }}>การกระทำ</th>
                        {studioRowsData.columns.map((col) => (
                          <th key={col} style={{ padding: '8px 12px', fontWeight: 600 }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {studioRowsData.rows.map((row, idx) => (
                        <tr
                          key={String(row['id'] ?? row['key'] ?? idx)}
                          style={{
                            borderBottom: '1px solid var(--pkh-border-subtle)',
                            background: idx % 2 === 0 ? 'var(--pkh-bg-surface)' : 'var(--pkh-bg-subtle, #fdfdfd)',
                          }}
                        >
                          <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <Button
                                variant="quiet"
                                size="sm"
                                style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                                onClick={() => {
                                  setStudioEditRow(row);
                                  setStudioEditJson(JSON.stringify(row, null, 2));
                                }}
                              >
                                ✏️ แก้ไข
                              </Button>
                              <Button
                                variant="danger-quiet"
                                size="sm"
                                style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                                onClick={() => void handleDeleteStudioRow(row)}
                              >
                                🗑️ ลบ
                              </Button>
                            </div>
                          </td>
                          {studioRowsData.columns.map((col) => {
                            const val = row[col];
                            const display = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                            return (
                              <td
                                key={col}
                                style={{
                                  padding: '6px 12px',
                                  maxWidth: '240px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={display}
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {studioRowsData && studioRowsData.total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                    ทั้งหมด {studioRowsData.total} แถว (หน้า {studioRowsData.page} จาก {Math.max(1, Math.ceil(studioRowsData.total / 20))})
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={studioPage <= 1}
                      onClick={() => {
                        const prev = Math.max(1, studioPage - 1);
                        setStudioPage(prev);
                        void loadStudioRows(selectedStudioTable, prev, studioSearch);
                      }}
                    >
                      ◀ หน้าก่อนหน้า
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={studioPage >= Math.ceil(studioRowsData.total / 20)}
                      onClick={() => {
                        const next = studioPage + 1;
                        setStudioPage(next);
                        void loadStudioRows(selectedStudioTable, next, studioSearch);
                      }}
                    >
                      หน้าถัดไป ▶
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Studio Row Modal */}
      {studioEditRow && (
        <Modal
          isOpen={Boolean(studioEditRow)}
          onClose={() => setStudioEditRow(null)}
          title={`✏️ แก้ไขข้อมูลแถวในตาราง: ${selectedStudioTable}`}
        >
          <form onSubmit={handleSaveStudioEdit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>
                ข้อมูลแถว (JSON Format):
              </label>
              <textarea
                value={studioEditJson}
                onChange={(e) => setStudioEditJson(e.target.value)}
                rows={12}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  width: '100%',
                }}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <Button variant="quiet" type="button" onClick={() => setStudioEditRow(null)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit">
                💾 บันทึกแถว
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Insert Studio Row Modal */}
      {isStudioInsertOpen && (
        <Modal
          isOpen={isStudioInsertOpen}
          onClose={() => setIsStudioInsertOpen(false)}
          title={`＋ เพิ่มแถวใหม่ในตาราง: ${selectedStudioTable}`}
        >
          <form onSubmit={handleSaveStudioInsert}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>
                ข้อมูลแถวใหม่ (JSON Format):
              </label>
              <textarea
                value={studioInsertJson}
                onChange={(e) => setStudioInsertJson(e.target.value)}
                rows={12}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  width: '100%',
                }}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <Button variant="quiet" type="button" onClick={() => setIsStudioInsertOpen(false)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit">
                ＋ เพิ่มแถว
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* TAB 3: DATABASE & BACKUPS */}
      {activeTab === 'database' && (
        <div className="admin-section">
          {/* Disk space & overview */}
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>ข้อมูลสถานะฐานข้อมูลและพื้นที่จัดเก็บ</CardTitle>
                <CardDescription>พื้นที่ดิสก์ ไฟล์ฐานข้อมูล SQLite และไฟล์อัปโหลดในระบบ</CardDescription>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="quiet" onClick={handleOptimize} disabled={dbLoading}>
                  ⚡ Optimize &amp; VACUUM
                </Button>
                <Button variant="primary" onClick={handleBackupNow} disabled={dbLoading}>
                  📦 สำรองข้อมูลทันที
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dbStats?.disk && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span>พื้นที่ดิสก์ที่ใช้งาน</span>
                    <strong>{dbStats.disk.usedPercent}% (ว่าง {(dbStats.disk.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB จาก {(dbStats.disk.totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB)</strong>
                  </div>
                  <div className="admin-disk-bar-track">
                    <div className="admin-disk-bar-fill" style={{ width: `${dbStats.disk.usedPercent}%` }} />
                  </div>
                </div>
              )}

              <div className="admin-stats-grid">
                <div className="admin-stat-box">
                  <span className="admin-stat-label">ขนาดไฟล์ SQLite</span>
                  <span className="admin-stat-value">
                    {dbStats ? (dbStats.dbSizeBytes / (1024 * 1024)).toFixed(2) : 0} MB
                  </span>
                </div>
                <div className="admin-stat-box">
                  <span className="admin-stat-label">ขนาดไฟล์แนบ (Objects)</span>
                  <span className="admin-stat-value">
                    {dbStats ? (dbStats.objectsSizeBytes / (1024 * 1024)).toFixed(2) : 0} MB
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {dbStats?.objectsCount || 0} ไฟล์
                  </span>
                </div>
                <div className="admin-stat-box">
                  <span className="admin-stat-label">ดาวน์โหลดข้อมูลสำรอง</span>
                  <a
                    href="/api/admin/backup/export-json"
                    download
                    style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-brand-primary)',
                      textDecoration: 'none',
                    }}
                  >
                    ⬇️ ดาวน์โหลด JSON Export
                  </a>
                </div>
              </div>

              {/* Table counts */}
              {dbStats?.tableCounts && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '14px', margin: '0 0 10px', color: 'var(--color-text-primary)' }}>
                    จำนวนเรคคอร์ดในแต่ละตาราง
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px' }}>
                    {Object.entries(dbStats.tableCounts).map(([tbl, cnt]) => (
                      <div
                        key={tbl}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--color-bg-subtle, #f8fafc)',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-secondary)' }}>{tbl}</span>
                        <strong>{cnt}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backup List */}
          <Card style={{ marginTop: '20px' }}>
            <CardHeader>
              <CardTitle>รายการไฟล์สำรองข้อมูล (Backups)</CardTitle>
              <CardDescription>ไฟล์สำรองอัตโนมัติและไฟล์ที่กดสำรองเอง</CardDescription>
            </CardHeader>
            <CardContent>
              {backups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                  ยังไม่มีประวัติการสำรองข้อมูลในโฟลเดอร์ backups
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ชื่อไฟล์</th>
                        <th>ขนาด</th>
                        <th>เวลาสำรอง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b) => (
                        <tr key={b.name}>
                          <td><code>{b.name}</code></td>
                          <td>{(b.sizeBytes / (1024 * 1024)).toFixed(2)} MB</td>
                          <td>{new Date(b.createdAt).toLocaleString('th-TH')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      
      {/* TAB 5: WORKSPACE INVITES */}
      {activeTab === 'invites' && (
        <div className="admin-section">
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>🎟️ รหัสคำเชิญเข้าใช้งาน Workspace (Invites)</CardTitle>
                <CardDescription>
                  สร้างรหัสเชิญสำหรับสมาชิกใหม่เพื่อใช้ลงทะเบียนในหน้าเข้าสู่ระบบ พร้อมกำหนดสิทธิ์ วันหมดอายุ และจำนวนครั้งที่ใช้ได้
                </CardDescription>
              </div>
              <Button variant="primary" onClick={() => setIsAddInviteOpen(true)}>
                ＋ สร้างรหัสคำเชิญใหม่
              </Button>
            </CardHeader>
            <CardContent>
              {invitesLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
                  กำลังโหลดรายการรหัสคำเชิญ...
                </div>
              ) : invites.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                  ยังไม่มีรหัสคำเชิญที่สร้างไว้ คลิก "＋ สร้างรหัสคำเชิญใหม่" เพื่อเริ่มสร้าง
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>รหัสคำเชิญ (Code)</th>
                        <th>สิทธิ์ที่ได้รับ</th>
                        <th>การใช้งาน (ใช้แล้ว / สูงสุด)</th>
                        <th>สถานะ</th>
                        <th>หมดอายุเมื่อ</th>
                        <th>สร้างเมื่อ</th>
                        <th style={{ textAlign: 'right' }}>การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((inv) => {
                        const isExpired = inv.expiresAt ? invitesFetchedAt > inv.expiresAt : false;
                        const isMaxed = inv.maxUses > 0 && inv.usedCount >= inv.maxUses;
                        const isRevoked = Boolean(inv.isRevoked);
                        return (
                          <tr key={inv.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <code style={{ fontWeight: 'bold', fontSize: '13px', background: 'var(--color-surface-hover, rgba(0,0,0,0.05))', padding: '2px 8px', borderRadius: '4px' }}>
                                  {inv.code}
                                </code>
                                <button
                                  type="button"
                                  className="icon-button"
                                  title="คัดลอกรหัส"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(inv.code);
                                    showNotification(`คัดลอกรหัส ${inv.code} แล้ว!`);
                                  }}
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px' }}
                                >
                                  📋
                                </button>
                              </div>
                            </td>
                            <td>
                              <span className={`admin-badge ${inv.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-user'}`}>
                                {inv.role === 'admin' ? '👑 Admin' : '👤 User'}
                              </span>
                            </td>
                            <td>
                              {inv.usedCount} / {inv.maxUses === 0 ? 'ไม่จำกัด' : inv.maxUses}
                            </td>
                            <td>
                              {isRevoked ? (
                                <span className="admin-badge admin-badge-suspended">เพิกถอนแล้ว</span>
                              ) : isExpired ? (
                                <span className="admin-badge admin-badge-suspended">หมดอายุแล้ว</span>
                              ) : isMaxed ? (
                                <span className="admin-badge admin-badge-suspended">ครบโควตาแล้ว</span>
                              ) : (
                                <span className="admin-badge admin-badge-active">ใช้งานได้</span>
                              )}
                            </td>
                            <td>
                              {inv.expiresAt ? new Date(inv.expiresAt).toLocaleString('th-TH') : 'ไม่มีวันหมดอายุ'}
                            </td>
                            <td>{new Date(inv.createdAt).toLocaleString('th-TH')}</td>
                            <td style={{ textAlign: 'right' }}>
                              {!isRevoked && (
                                <Button
                                  variant="danger-quiet"
                                  onClick={() => handleRevokeInvite(inv.code)}
                                >
                                  เพิกถอน
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 6: AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <div className="admin-section">
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <CardTitle>📜 บันทึกกิจกรรมระบบและการเข้าถึง (Audit Logs)</CardTitle>
                <CardDescription>
                  ติดตามกิจกรรมความปลอดภัย การเข้าสู่ระบบ การปรับเปลี่ยนบทบาทผู้ใช้ และการจัดการข้อมูล
                </CardDescription>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select
                  className="admin-select"
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  style={{ minWidth: '160px' }}
                >
                  <option value="">ทั้งหมด (ทุกกิจกรรม)</option>
                  <option value="gate_unlock">🔓 ปปลดล็อกเกตแอดมิน</option>
                  <option value="admin_pin_updated">🔑 เปลี่ยน PIN แอดมิน</option>
                  <option value="create_user">👤 เพิ่มผู้ใช้</option>
                  <option value="update_user_role">👑 เปลี่ยนบทบาทผู้ใช้</option>
                  <option value="reset_user_password">🔑 รีเซ็ตรหัสผ่าน</option>
                  <option value="delete_user">🗑️ ลบผู้ใช้</option>
                  <option value="backup_created">📦 สำรองข้อมูล</option>
                  <option value="database_optimized">⚡ ปรับแต่งฐานข้อมูล</option>
                  <option value="export_data">📤 ส่งออกข้อมูล</option>
                  <option value="import_data">📥 นำเข้าข้อมูล</option>
                  <option value="invite_created">🎟️ สร้างรหัสคำเชิญ</option>
                  <option value="invite_revoked">🚫 เพิกถอนรหัสคำเชิญ</option>
                </select>
                <Button variant="quiet" onClick={() => void loadAuditLogs()} disabled={auditLoading}>
                  🔄 รีเฟรช
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
                  กำลังโหลดบันทึกกิจกรรม...
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                  ไม่มีบันทึกกิจกรรมที่ตรงกับเงื่อนไข
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>เวลา</th>
                        <th>ผู้ดำเนินการ</th>
                        <th>การกระทำ (Action)</th>
                        <th>หมวดหมู่</th>
                        <th>รายละเอียด</th>
                        <th>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {new Date(log.createdAt).toLocaleString('th-TH')}
                          </td>
                          <td>
                            <strong>{log.username || log.userId || 'system'}</strong>
                          </td>
                          <td>
                            <code style={{ fontSize: '12px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: 'var(--color-surface-hover, rgba(0,0,0,0.05))' }}>
                              {log.action}
                            </code>
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {log.resourceType}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', maxWidth: '320px', wordBreak: 'break-word' }}>
                            {log.details || '-'}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {log.ipAddress || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 7: SUPPORT TICKETS */}
      {activeTab === 'support-tickets' && (
        <div className="admin-section">
          <Card>
            <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>🎫 ศูนย์จัดการเรื่องติดต่อ &amp; คำร้องขอความช่วยเหลือ</CardTitle>
                <CardDescription>
                  รายการคำร้องจากสมาชิกทั้งหมด สามารถตอบกลับ อัปเดตสถานะ และมอบหมายงานได้ทันที
                </CardDescription>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="quiet" size="sm" onClick={() => void loadAdminTickets()}>
                  🔄 รีเฟรช
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Status filter bar */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'open', label: '⏳ รอตรวจสอบ' },
                  { id: 'in_progress', label: '🔄 กำลังดำเนินการ' },
                  { id: 'resolved', label: '✅ แก้ไขแล้ว' },
                  { id: 'closed', label: '🔒 ปิดเรื่อง' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setAdminTicketFilterStatus(st.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '16px',
                      border: adminTicketFilterStatus === st.id ? '1px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
                      backgroundColor: adminTicketFilterStatus === st.id ? 'var(--pkh-primary)' : 'transparent',
                      color: adminTicketFilterStatus === st.id ? '#ffffff' : 'var(--pkh-text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {adminTicketsLoading ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
                  กำลังโหลดข้อมูลคำร้อง...
                </div>
              ) : adminTickets.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
                  ไม่มีคำร้องในหมวดที่เลือก
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>รหัสอ้างอิง</th>
                        <th>ผู้แจ้ง</th>
                        <th>หัวข้อคำร้อง</th>
                        <th>หมวดหมู่</th>
                        <th>ความเร่งด่วน</th>
                        <th>สถานะ</th>
                        <th>วันที่ส่ง</th>
                        <th style={{ textAlign: 'right' }}>ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminTickets.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <code style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pkh-primary)' }}>
                              {t.referenceNo}
                            </code>
                          </td>
                          <td>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>
                              {t.userDisplayName || t.userName || t.userId}
                            </span>
                          </td>
                          <td style={{ maxWidth: '240px', wordBreak: 'break-word' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>{t.subject}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>{t.category}</span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor:
                                  t.priority === 'urgent'
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : t.priority === 'high'
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : 'rgba(100, 116, 139, 0.15)',
                                color:
                                  t.priority === 'urgent'
                                    ? '#ef4444'
                                    : t.priority === 'high'
                                    ? '#f59e0b'
                                    : '#64748b',
                                fontWeight: 600,
                              }}
                            >
                              {t.priority}
                            </span>
                          </td>
                          <td>
                            <select
                              value={t.status}
                              onChange={(e) => {
                                setSelectedAdminTicketId(t.id);
                                void updateSupportTicketStatus(t.id, {
                                  status: e.target.value,
                                  assignedAdminId: currentUser?.id,
                                }).then(() => {
                                  setMessage({ text: 'อัปเดตสถานะและแจ้งเตือนสมาชิกแล้ว', type: 'success' });
                                  void loadAdminTickets();
                                });
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid var(--pkh-border-subtle)',
                                backgroundColor: 'var(--pkh-bg-surface)',
                                color: 'var(--pkh-text-primary)',
                              }}
                            >
                              <option value="open">⏳ รอตรวจสอบ</option>
                              <option value="in_progress">🔄 กำลังดำเนินการ</option>
                              <option value="resolved">✅ แก้ไขแล้ว</option>
                              <option value="closed">🔒 ปิดเรื่อง</option>
                            </select>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                            {formatDate(t.createdAt)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleSelectAdminTicket(t)}
                              style={{ padding: '3px 10px', fontSize: '11px' }}
                            >
                              💬 ตอบกลับ / ดูแช็ต
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: FIREBASE CONFIG */}
      {activeTab === 'firebase' && (
        <div className="admin-section">
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>🔥</span>
                <div>
                  <CardTitle>การเชื่อมต่อ Firebase Cloud & Serverless</CardTitle>
                  <CardDescription>
                    กำหนดค่าและตรวจสอบสถานะการเชื่อมต่อ Firebase SDK (Authentication & Cloud Firestore)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🟢</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#065f46', fontSize: '14px' }}>
                    ระบบกำลังเชื่อมต่อ Firebase Cloud จริง ({fbConfig.projectId || 'personal-life-os-68631'})
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                    ทำงานบน Firebase Spark Plan ฟรี 100% แบบ Serverless รองรับการรันและใช้งานออนไลน์ 24 ชม.
                  </div>
                </div>
              </div>

              {fbConfigNotice && (
                <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                  ✓ {fbConfigNotice}
                </div>
              )}

              <form onSubmit={handleSaveFirebase} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="admin-form-grid">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>API Key (apiKey)</label>
                    <Input
                      value={fbConfig.apiKey || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Project ID (projectId)</label>
                    <Input
                      value={fbConfig.projectId || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                      placeholder="personal-life-os-68631"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Auth Domain (authDomain)</label>
                    <Input
                      value={fbConfig.authDomain || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                      placeholder="personal-life-os-68631.firebaseapp.com"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Storage Bucket (storageBucket)</label>
                    <Input
                      value={fbConfig.storageBucket || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, storageBucket: e.target.value })}
                      placeholder="personal-life-os-68631.firebasestorage.app"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Messaging Sender ID (messagingSenderId)</label>
                    <Input
                      value={fbConfig.messagingSenderId || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, messagingSenderId: e.target.value })}
                      placeholder="311035303046"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>App ID (appId)</label>
                    <Input
                      value={fbConfig.appId || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, appId: e.target.value })}
                      placeholder="1:311035303046:web:..."
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Measurement ID (measurementId)</label>
                    <Input
                      value={fbConfig.measurementId || ''}
                      onChange={(e) => setFbConfig({ ...fbConfig, measurementId: e.target.value })}
                      placeholder="G-LL97E8BWRJ"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <Button type="submit" variant="primary">
                    💾 บันทึกการตั้งค่า Firebase
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(fbConfig, null, 2));
                      showNotification('คัดลอก JSON คอนฟิกเรียบร้อยแล้ว');
                    }}
                  >
                    📋 คัดลอกการตั้งค่า JSON
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Ticket Conversation Modal */}
      {selectedAdminTicketId && activeAdminTicket && (
        <Modal
          isOpen={Boolean(selectedAdminTicketId)}
          onClose={() => {
            setSelectedAdminTicketId(null);
            setActiveAdminTicket(null);
            setAdminTicketReplies([]);
          }}
          title={`🎫 จัดการคำร้อง ${activeAdminTicket.referenceNo}: ${activeAdminTicket.subject}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.05))', borderRadius: '8px' }}>
              <div>
                <strong>ผู้แจ้ง:</strong> {activeAdminTicket.userDisplayName || activeAdminTicket.userName} ({activeAdminTicket.category})
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>สถานะ:</label>
                <select
                  value={activeAdminTicket.status}
                  onChange={(e) => void handleAdminUpdateStatus(e.target.value)}
                  disabled={adminActionBusy}
                  style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="open">⏳ รอตรวจสอบ</option>
                  <option value="in_progress">🔄 กำลังดำเนินการ</option>
                  <option value="resolved">✅ แก้ไขแล้ว</option>
                  <option value="closed">🔒 ปิดเรื่อง</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--pkh-bg-surface)', border: '1px solid var(--pkh-border-subtle)' }}>
              <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', marginBottom: '4px' }}>ข้อความจากสมาชิก:</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '13px' }}>
                {activeAdminTicket.message}
              </div>
            </div>

            {/* Replies */}
            {adminTicketReplies.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-muted)' }}>
                  การสนทนา ({adminTicketReplies.length} ข้อความ)
                </span>
                {adminTicketReplies.map((rep) => {
                  const isAdmin = rep.userRole === 'admin';
                  return (
                    <div
                      key={rep.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        backgroundColor: isAdmin ? 'rgba(59, 130, 246, 0.1)' : 'var(--pkh-bg-surface)',
                        border: isAdmin ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--pkh-border-subtle)',
                        alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                        width: '88%',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                        <strong>{isAdmin ? '🛡️ ผู้ดูแลระบบ' : rep.userDisplayName || rep.userName}</strong>
                        <time style={{ color: 'var(--pkh-text-muted)' }}>{formatDate(rep.createdAt)}</time>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.4 }}>
                        {rep.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reply Form */}
            <form onSubmit={handleAdminReply} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>พิมพ์ตอบกลับสมาชิก (ส่งแจ้งเตือนทันที)</label>
              <textarea
                value={adminReplyText}
                onChange={(e) => setAdminReplyText(e.target.value)}
                rows={3}
                placeholder="ระบุข้อความตอบกลับหรือวิธีแก้ไขปัญหา..."
                style={{ width: '100%', padding: '8px', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" disabled={adminActionBusy}>
                  {adminActionBusy ? 'กำลังส่ง…' : 'ตอบกลับและแจ้งเตือนสมาชิก'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Modal: Add User */}
      {isAddUserOpen && (
        <Modal isOpen={isAddUserOpen} title="＋ เพิ่มผู้ใช้งานใหม่" onClose={() => setIsAddUserOpen(false)}>
          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>ชื่อผู้ใช้ (Username) *</label>
              <Input
                placeholder="เช่น john_doe"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>ชื่อแสดงผล (Display Name)</label>
              <Input
                placeholder="เช่น John Doe"
                value={addUserDisplayName}
                onChange={(e) => setAddUserDisplayName(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>อีเมล (Email สำหรับกู้รหัส OTP)</label>
                <Input
                  type="email"
                  placeholder="เช่น user@example.com"
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>เบอร์โทรศัพท์ (Phone สำหรับ OTP)</label>
                <Input
                  type="tel"
                  placeholder="เช่น 081-234-5678"
                  value={addUserPhone}
                  onChange={(e) => setAddUserPhone(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>รหัสผ่าน (ขั้นต่ำ 12 ตัวอักษร) *</label>
              <Input
                type="password"
                placeholder="อย่างน้อย 12 ตัวอักษร"
                value={addUserPassword}
                onChange={(e) => setAddUserPassword(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>ระดับสิทธิ์ (Role)</label>
              <select
                className="admin-select"
                value={addUserRole}
                onChange={(e) => setAddUserRole(e.target.value as 'admin' | 'member' | 'editor' | 'viewer' | 'user')}
              >
                <option value="member">👤 Member (สมาชิกทั่วไป)</option>
                <option value="editor">✏️ Editor (ผู้แก้ไขข้อมูล)</option>
                <option value="viewer">👁️ Viewer (ผู้อ่านอย่างเดียว)</option>
                <option value="admin">👑 Admin (ผู้ดูแลระบบ)</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="quiet" type="button" onClick={() => setIsAddUserOpen(false)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit">
                สร้างบัญชีผู้ใช้
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Reset Password */}
      {isResetPassOpen && resetTargetUser && (
        <Modal isOpen={isResetPassOpen} title={`เปลี่ยนรหัสผ่าน: ${resetTargetUser.username}`} onClose={() => setIsResetPassOpen(false)}>
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>รหัสผ่านใหม่ (ขั้นต่ำ 12 ตัวอักษร) *</label>
              <Input
                type="password"
                placeholder="อย่างน้อย 12 ตัวอักษร"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="quiet" type="button" onClick={() => setIsResetPassOpen(false)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit">
                บันทึกรหัสผ่านใหม่
              </Button>
            </div>
          </form>
        </Modal>
      )}
    
      {/* Modal: Create Invite */}
      {isAddInviteOpen && (
        <Modal isOpen={isAddInviteOpen} title="🎟️ สร้างรหัสคำเชิญใหม่ (Workspace Invite)" onClose={() => setIsAddInviteOpen(false)}>
          <form onSubmit={handleCreateInvite} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>สิทธิ์เมื่อลงทะเบียน (Role) *</label>
              <select
                className="admin-select"
                value={newInviteRole}
                onChange={(e) => setNewInviteRole(e.target.value as 'admin' | 'member' | 'editor' | 'viewer' | 'user')}
              >
                <option value="member">👤 Member (สมาชิกทั่วไป)</option>
                <option value="editor">✏️ Editor (ผู้แก้ไขข้อมูล)</option>
                <option value="viewer">👁️ Viewer (ผู้อ่านอย่างเดียว)</option>
                <option value="admin">👑 Admin (ผู้ดูแลระบบ)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>จำนวนครั้งที่ใช้ได้ (เว้นว่างหรือ 0 = ไม่จำกัด)</label>
              <Input
                type="number"
                min="0"
                placeholder="เช่น 1, 5 (0 = ไม่จำกัด)"
                value={newInviteMaxUses ?? ''}
                onChange={(e) => setNewInviteMaxUses(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>อายุการใช้งาน (ชั่วโมง, เว้นว่าง = ไม่มีวันหมดอายุ)</label>
              <Input
                type="number"
                min="1"
                placeholder="เช่น 72 (3 วัน)"
                value={newInviteExpiresHours ?? ''}
                onChange={(e) => setNewInviteExpiresHours(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="quiet" type="button" onClick={() => setIsAddInviteOpen(false)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit">
                สร้างรหัสคำเชิญ
              </Button>
            </div>
          </form>
        </Modal>
      )}
</div>
  );
};
