import { useEffect, useRef, useState, useCallback, lazy, Suspense, type ChangeEvent, type FormEvent } from 'react';
import {
  ApiError,
  checkHealth,
  type HealthDiskInfo,
  addFavorite,
  checkHabit,
  convertInboxItem,
  createGoal,
  createHabit,
  createInboxItem,
  createPerson,
  createProject,
  createTask,
  createReminder,
  createTimeblock,
  deleteBookmark,
  deleteFile,
  deleteGoal,
  deleteHabit,
  deleteInboxItem,
  deleteNote,
  deleteProject,
  deleteTask,
  deletePerson,
  deleteReminder,
  deleteTaxonomyItem,
  deleteTimeblock,
  getCurrentUser,
  getDashboard,
  getFavoriteStatus,
  getHabitsHistory,
  getNote,
  getNoteTaxonomy,
  getPersonNotes,
  listCategories,
  listGoals,
  listHabits,
  listInbox,
  listBookmarks,
  listFavorites,
  listFiles,
  listNotes,
  listPeople,
  listProjects,
  listReminders,
  listTasks,
  listTags,
  listTimeblocks,
  listTrash,
  listUpcomingReminders,
  login,
  logout,
  permanentlyDeleteNote,
  removeFavorite,
  saveBookmark,
  saveNote,
  saveNoteTaxonomy,
  saveTaxonomyItem,
  searchAll,
  setHabitLog,
  snoozeReminder,
  searchNotes,
  updateGoal,
  updateInboxItem,
  updatePerson,
  updateProject,
  updateReminder,
  updateTask,
  updateTimeblock,
  uploadFile,
  listVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  listLibraryItems,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  type Note,
  type Bookmark,
  type DashboardData,
  type Favorite,
  type FavoriteItemType,
  type Goal,
  type Habit,
  type HabitsHistory,
  type InboxItem,
  type LibraryCategory,
  type LibraryItem,
  type LibraryStatus,
  type LifeArea,
  type Person,
  type Project,
  type RelationshipGroup,
  type Reminder,
  type ReminderCategory,
  type SearchBucketType,
  type SearchResults,
  type StoredFile,
  type Task,
  type TaxonomyItem,
  type Timeblock,
  type User,  type VaultCategory,
  type VaultItem,
  listCustomCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  verify2FALogin,
  requestForgotOtp,
  resetPasswordWithOtp,
  getCustomCategoryItems,
  linkItemToCustomCategory,
  unlinkItemFromCustomCategory,
  getItemCustomCategory,
  setItemCustomCategory,
  type PublicSettings,
  getPublicSettings,
  type CustomCategory,
  type CustomCategoryItemsResult,
  type NotificationItem,
  getNotifications,
  markNotificationsAsRead,
  snoozeNotification,
  completeNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
  registerAccount,
  fetchCustomTypes,
  type CustomDataType,
} from './api';
import {
  type NotesView,
  type SidebarNavItem,
  loadSidebarNav,
  saveSidebarNav,
  resetSidebarNav,
} from './sidebarNav';
import './App.css';

import type {
  AuthState,
  ThemeName,
  ThemeMode,
  ProfileState,
  TaxonomyKind,
  AllEntry,
  VaultDraft,
  LibraryDraft,
} from './types';
import {
  ALL_SEARCH_TYPES,
  VAULT_CATEGORIES,
  LIBRARY_CATEGORIES,
  LIBRARY_STATUSES,
  emptyVaultDraft,
  emptyLibraryDraft,
} from './lib/constants';
import {
  formatBytes,
  errorMessage,
  localToday,
  localDateAfter,
  daysUntilNext,
} from './lib/formatters';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { ToastStack, type ToastItem } from './components/ToastStack';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Skeleton } from './components/ui/Skeleton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyThemeConfig, loadStoredThemeConfig } from './lib/theme';

// Code-split feature views and heavy modals via React.lazy
const MediaLightbox = lazy(() => import('./components/MediaLightbox').then((m) => ({ default: m.MediaLightbox })));
const ThemeModal = lazy(() => import('./features/settings/ThemeModal').then((m) => ({ default: m.ThemeModal })));
const ProfileModal = lazy(() => import('./features/settings/ProfileModal').then((m) => ({ default: m.ProfileModal })));
const CommandSearchModal = lazy(() => import('./features/search/CommandSearchModal').then((m) => ({ default: m.CommandSearchModal })));
const PermanentDeleteModal = lazy(() => import('./components/modals/PermanentDeleteModal').then((m) => ({ default: m.PermanentDeleteModal })));
const SidebarNavModal = lazy(() => import('./components/modals/SidebarNavModal').then((m) => ({ default: m.SidebarNavModal })));
const CategoryModal = lazy(() => import('./features/custom-categories/CategoryModal').then((m) => ({ default: m.CategoryModal })));
const QuickAddCategoryModal = lazy(() => import('./features/custom-categories/QuickAddCategoryModal').then((m) => ({ default: m.QuickAddCategoryModal })));
const AboutModal = lazy(() => import('./components/AboutModal').then((m) => ({ default: m.AboutModal })));
const CustomCategoryView = lazy(() => import('./features/custom-categories/CustomCategoryView').then((m) => ({ default: m.CustomCategoryView })));
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })));
const InboxView = lazy(() => import('./features/inbox/InboxView').then((m) => ({ default: m.InboxView })));
const VaultView = lazy(() => import('./features/vault/VaultView').then((m) => ({ default: m.VaultView })));
const LibraryView = lazy(() => import('./features/library/LibraryView').then((m) => ({ default: m.LibraryView })));
const TasksView = lazy(() => import('./features/tasks/TasksView').then((m) => ({ default: m.TasksView })));
const ProjectsView = lazy(() => import('./features/tasks/ProjectsView').then((m) => ({ default: m.ProjectsView })));
const GoalsView = lazy(() => import('./features/tasks/GoalsView').then((m) => ({ default: m.GoalsView })));
const PeopleView = lazy(() => import('./features/people/PeopleView').then((m) => ({ default: m.PeopleView })));
const HabitsView = lazy(() => import('./features/habits/HabitsView').then((m) => ({ default: m.HabitsView })));
const NotesViewComponent = lazy(() => import('./features/notes/NotesView').then((m) => ({ default: m.NotesView })));
const BookmarksView = lazy(() => import('./features/bookmarks/BookmarksView').then((m) => ({ default: m.BookmarksView })));
const FavoritesView = lazy(() => import('./features/bookmarks/FavoritesView').then((m) => ({ default: m.FavoritesView })));
const FilesView = lazy(() => import('./features/files/FilesView').then((m) => ({ default: m.FilesView })));
const TrashView = lazy(() => import('./features/trash/TrashView').then((m) => ({ default: m.TrashView })));
const AdminView = lazy(() => import('./features/admin/AdminView').then((m) => ({ default: m.AdminView })));
const WatchlistView = lazy(() => import('./features/lifestyle/WatchlistView').then((m) => ({ default: m.WatchlistView })));
const ShoppingView = lazy(() => import('./features/lifestyle/ShoppingView').then((m) => ({ default: m.ShoppingView })));
const TravelView = lazy(() => import('./features/lifestyle/TravelView').then((m) => ({ default: m.TravelView })));
const CustomRecordsView = lazy(() => import('./features/custom-types/CustomRecordsView').then((m) => ({ default: m.CustomRecordsView })));
const CustomTypeBuilderModal = lazy(() => import('./features/custom-types/CustomTypeBuilderModal').then((m) => ({ default: m.CustomTypeBuilderModal })));
const HelpSupportView = lazy(() => import('./features/support/HelpSupportView').then((m) => ({ default: m.HelpSupportView })));

const ViewFallback = () => (
  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} aria-busy="true">
    <Skeleton variant="card" height={80} borderRadius={12} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
      <Skeleton variant="card" height={160} borderRadius={12} />
      <Skeleton variant="card" height={160} borderRadius={12} />
      <Skeleton variant="card" height={160} borderRadius={12} />
    </div>
  </div>
);

function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesTotal, setFavoritesTotal] = useState(0);
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const [diskWarning, setDiskWarning] = useState<HealthDiskInfo | null>(null);
  const [activeFavorite, setActiveFavorite] = useState<Favorite | null>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesBusy, setFilesBusy] = useState(false);
  const [activeFile, setActiveFile] = useState<StoredFile | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [noteFavoriteState, setNoteFavoriteState] = useState<{ id: string; favorited: boolean } | null>(null);
  const [bookmarkFavoriteState, setBookmarkFavoriteState] = useState<{ id: string; favorited: boolean } | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Global shortcuts are rebound after every render so they never act on stale state.
  const shortcutActions = useRef<{ newNote: () => void; newTask: () => void }>({
    newNote: () => undefined,
    newTask: () => undefined,
  });
  const [viewMode, setViewMode] = useState<NotesView>('home');
  const [sidebarNav, setSidebarNav] = useState<SidebarNavItem[]>(() => loadSidebarNav());
  const [customizeNavOpen, setCustomizeNavOpen] = useState(false);
  const [tempNavConfig, setTempNavConfig] = useState<SidebarNavItem[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customCategoriesBusy, setCustomCategoriesBusy] = useState(false);
  const [selectedCustomCategoryId, setSelectedCustomCategoryId] = useState<string | null>(null);
  const [customCategoryData, setCustomCategoryData] = useState<CustomCategoryItemsResult | null>(null);
  const [customCategoryDataBusy, setCustomCategoryDataBusy] = useState(false);
  const [customCategoryFilter, setCustomCategoryFilter] = useState<'all' | 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library'>('all');
  const [categoryModal, setCategoryModal] = useState<{ mode: 'create' | 'edit'; parentId?: string | null; category?: CustomCategory } | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{ name: string; icon: string; color: string; parentId: string | null }>({ name: '', icon: '📁', color: '#3f7658', parentId: null });
  const [categoryModalBusy, setCategoryModalBusy] = useState(false);
  const [categoryModalError, setCategoryModalError] = useState('');
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [quickAddCatOpen, setQuickAddCatOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library' | 'attach'>('note');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddContentOrUrl, setQuickAddContentOrUrl] = useState('');
  const [catUploadFile, setCatUploadFile] = useState<File | null>(null);
  const [quickAddVaultCategory, setQuickAddVaultCategory] = useState<VaultCategory>(VAULT_CATEGORIES[0]);
  const [quickAddVaultKey, setQuickAddVaultKey] = useState('');
  const [quickAddVaultLocation, setQuickAddVaultLocation] = useState('');
  const [quickAddVaultExpiry, setQuickAddVaultExpiry] = useState('');
  const [quickAddVaultAmount, setQuickAddVaultAmount] = useState('');
  const [quickAddLibraryCategory, setQuickAddLibraryCategory] = useState<LibraryCategory>(LIBRARY_CATEGORIES[0]);
  const [quickAddLibraryStatus, setQuickAddLibraryStatus] = useState<LibraryStatus>(LIBRARY_STATUSES[0]);
  const [quickAddLibrarySource, setQuickAddLibrarySource] = useState('');
  const [attachSearchQuery, setAttachSearchQuery] = useState('');
  const [attachTypeFilter, setAttachTypeFilter] = useState<'all' | 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library'>('all');
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [mediaLightboxFile, setMediaLightboxFile] = useState<StoredFile | null>(null);
  const [activeNoteCustomCatId, setActiveNoteCustomCatId] = useState<string | null>(null);
  const [activeBookmarkCustomCatId, setActiveBookmarkCustomCatId] = useState<string | null>(null);
  const [taskDraftCustomCatId, setTaskDraftCustomCatId] = useState<string>('');
  const [vaultCustomCatId, setVaultCustomCatId] = useState<string>('');
  const [libraryCustomCatId, setLibraryCustomCatId] = useState<string>('');
  const [fileCustomCatId, setFileCustomCatId] = useState<string | null>(null);
  const [customDataTypes, setCustomDataTypes] = useState<CustomDataType[]>([]);
  const [selectedCustomTypeId, setSelectedCustomTypeId] = useState<string | null>(null);
  const [isCreateCustomTypeOpen, setIsCreateCustomTypeOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [peopleGroup, setPeopleGroup] = useState<RelationshipGroup | ''>('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [personDraft, setPersonDraft] = useState<Partial<Person> & { name: string; relationshipGroup: RelationshipGroup }>({
    name: '',
    relationshipGroup: 'family',
  });
  const [personNotes, setPersonNotes] = useState<Note[]>([]);
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState('');
  const [personNotice, setPersonNotice] = useState('');
  const [personAvatarBusy, setPersonAvatarBusy] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [timeblocks, setTimeblocks] = useState<Timeblock[]>([]);
  const [todayBlocks, setTodayBlocks] = useState<Timeblock[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitWeek, setHabitWeek] = useState<HabitsHistory | null>(null);
  const [scheduleDate, setScheduleDate] = useState(localToday());
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleNotice, setScheduleNotice] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeqRef = useRef(0);
  const [postSaveBehavior, setPostSaveBehavior] = useState<'stay' | 'list' | 'detail'>(() => {
    const saved = localStorage.getItem('pkh.postSaveBehavior');
    return saved === 'list' || saved === 'detail' || saved === 'stay' ? saved : 'stay';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pkh.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const autosaveRef = useRef<{ noteId: string; title: string; content: string } | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxNewCount, setInboxNewCount] = useState(0);
  const [inboxDraft, setInboxDraft] = useState('');
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [inboxNotice, setInboxNotice] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<'open' | 'today' | 'overdue' | 'done'>('open');
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    dueDate: '',
    priority: 'normal' as Task['priority'],
    projectId: '',
    recurrence: 'none' as Task['recurrence'],
  });
  const [tasksBusy, setTasksBusy] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [tasksNotice, setTasksNotice] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDraft, setProjectDraft] = useState({ name: '', outcome: '', dueDate: '', goalId: '' });
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [projectsNotice, setProjectsNotice] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalDraft, setGoalDraft] = useState({ title: '', metric: '', targetValue: '', unit: '' });
  const [goalsBusy, setGoalsBusy] = useState(false);
  const [goalsError, setGoalsError] = useState('');
  const [goalsNotice, setGoalsNotice] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [vaultNotice, setVaultNotice] = useState('');
  const [vaultCategory, setVaultCategory] = useState<VaultCategory | 'all'>('all');
  const [vaultQuery, setVaultQuery] = useState('');
  const [activeVault, setActiveVault] = useState<VaultItem | null>(null);
  const [vaultDraft, setVaultDraft] = useState<VaultDraft>(emptyVaultDraft);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryNotice, setLibraryNotice] = useState('');
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory | 'all'>('all');
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus | 'all'>('all');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [activeLibrary, setActiveLibrary] = useState<LibraryItem | null>(null);
  const [libraryDraft, setLibraryDraft] = useState<LibraryDraft>(emptyLibraryDraft);
  const [reminderDraft, setReminderDraft] = useState({
    title: '',
    targetDate: localToday(),
    category: 'other' as ReminderCategory,
    recurrence: 'none' as NonNullable<Reminder['recurrence']>,
    linkedPersonId: '',
    notifyDaysBefore: '7',
  });
  const [blockDraft, setBlockDraft] = useState({
    timeRange: '06:30 - 07:30',
    title: '',
    lifeArea: 'health' as LifeArea,
  });
  const [habitDraft, setHabitDraft] = useState({ title: '', dailyTarget: '8', unit: 'ครั้ง' });
  const [theme, setTheme] = useState<ThemeName>(() => (localStorage.getItem('pkh.theme') as ThemeName) || 'aurora');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('pkh.themeMode') as ThemeMode) || 'dark');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    app_title: 'PKH / Life OS',
    app_subtitle: 'ศูนย์รวมข้อมูล บันทึก และการจัดการชีวิตส่วนบุคคล',
    app_logo: '🧠',
    default_theme: 'system',
  });

  useEffect(() => {
    getPublicSettings()
      .then((s) => {
        setPublicSettings(s);
        document.title = s.app_title;
      })
      .catch(() => {});
    const cfg = loadStoredThemeConfig();
    applyThemeConfig(cfg);
  }, []);
  const [profile, setProfile] = useState<ProfileState>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pkh.profile') || '') as Partial<ProfileState>;
      return {
        name: stored.name ?? '',
        status: stored.status ?? 'วันนี้ขอโฟกัสสิ่งสำคัญ',
        avatarPreset: stored.avatarPreset ?? '🌿',
        avatarFileId: stored.avatarFileId ?? null,
      };
    } catch {
      return { name: '', status: 'วันนี้ขอโฟกัสสิ่งสำคัญ', avatarPreset: '🌿', avatarFileId: null };
    }
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandResults, setCommandResults] = useState<SearchResults | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandTypes, setCommandTypes] = useState<SearchBucketType[]>(ALL_SEARCH_TYPES);
  const [commandFrom, setCommandFrom] = useState('');
  const [commandTo, setCommandTo] = useState('');
  const [commandError, setCommandError] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [allEntries, setAllEntries] = useState<AllEntry[]>([]);
  const [allBusy, setAllBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [chipPicker, setChipPicker] = useState<TaxonomyKind | null>(null);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [noteTaxonomyMap, setNoteTaxonomyMap] = useState<Record<string, { categoryIds: string[]; tagIds: string[] }>>({});
  const [filterBusy, setFilterBusy] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [noteViewMode, setNoteViewMode] = useState<'grid' | 'editor'>('grid');
  const [activeTrashNote, setActiveTrashNote] = useState<Note | null>(null);
  const [activeBookmark, setActiveBookmark] = useState<Bookmark | null>(null);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const activeNoteRef = useRef<Note | null>(null);
  const isNewNoteRef = useRef(false);
  const isNewBookmarkRef = useRef(false);
  const notesRequestId = useRef(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkCategory, setBookmarkCategory] = useState<string>('📦 อื่นๆ');
  const [twoFactorTempToken, setTwoFactorTempToken] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  const [isForgotOpen, setIsForgotOpen] = useState<boolean>(false);
  const [forgotRecoveryType, setForgotRecoveryType] = useState<'email' | 'phone'>('email');
  const [forgotUsername, setForgotUsername] = useState<string>('');
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotPhone, setForgotPhone] = useState<string>('');
  const [forgotOtp, setForgotOtp] = useState<string>('');
  const [forgotNewPassword, setForgotNewPassword] = useState<string>('');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [forgotMessage, setForgotMessage] = useState<string>('');
  const [forgotError, setForgotError] = useState<string>('');
  const [forgotBusy, setForgotBusy] = useState<boolean>(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [showAdminHelp, setShowAdminHelp] = useState<boolean>(false);
  // Registration State
  const [isInviteRegisterOpen, setIsInviteRegisterOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  // Notification Center State
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | undefined>(undefined);

  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [bookmarkDescription, setBookmarkDescription] = useState('');
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [tagTotal, setTagTotal] = useState(0);
  const [categoryPage, setCategoryPage] = useState(1);
  const [tagPage, setTagPage] = useState(1);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [taxonomyEditor, setTaxonomyEditor] = useState<{
    kind: TaxonomyKind;
    item: TaxonomyItem | null;
    name: string;
  } | null>(null);
  const [taxonomyBusy, setTaxonomyBusy] = useState(true);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState('');
  const [taxonomyNotice, setTaxonomyNotice] = useState('');
  const [taxonomyRefreshKey, setTaxonomyRefreshKey] = useState(0);
  const [taxonomyLoadedNoteId, setTaxonomyLoadedNoteId] = useState('');
  const [taxonomyLoadError, setTaxonomyLoadError] = useState<{ noteId: string; message: string } | null>(null);
  const [taxonomyRetryKey, setTaxonomyRetryKey] = useState(0);
  const taxonomyRequestId = useRef(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notesBusy, setNotesBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [notice, setNotice] = useState('');
  const normalizedSearchInput = searchInput.trim().normalize('NFC');
  const searchSettling = viewMode === 'notes' && normalizedSearchInput !== searchQuery;
  const shortSearch = normalizedSearchInput.length > 0 && [...normalizedSearchInput].length < 3;
  const activeNoteId = activeNote?.id;
  const activeBookmarkId = activeBookmark?.id;
  const noteFavorited = noteFavoriteState && noteFavoriteState.id === activeNoteId
    ? noteFavoriteState.favorited
    : false;
  const bookmarkFavorited = bookmarkFavoriteState && bookmarkFavoriteState.id === activeBookmarkId
    ? bookmarkFavoriteState.favorited
    : false;
  const taxonomyRelationsBusy = Boolean(
    activeNoteId
    && taxonomyLoadedNoteId !== activeNoteId
    && taxonomyLoadError?.noteId !== activeNoteId,
  );
  const taxonomyRelationsUnavailable = Boolean(
    activeNoteId
    && taxonomyLoadedNoteId !== activeNoteId
    && taxonomyLoadError?.noteId === activeNoteId,
  );

  useEffect(() => {
    let active = true;
    getCurrentUser().then((currentUser) => {
      if (!active) return;
      setUser(currentUser);
      setNotesBusy(true);
      setAuthState('signed-in');
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        setAuthState('signed-out');
      } else {
        setAuthError(errorMessage(error));
        setAuthState('unavailable');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    setCustomCategoriesBusy(true);
    listCustomCategories()
      .then((cats) => {
        if (active) setCustomCategories(cats);
      })
      .catch((err) => {
        if (active) console.error('Error loading custom categories:', err);
      })
      .finally(() => {
        if (active) setCustomCategoriesBusy(false);
      });

    fetchCustomTypes()
      .then((types) => {
        if (active) setCustomDataTypes(types);
      })
      .catch((err) => {
        if (active) console.error('Error loading custom types:', err);
      });
    return () => {
      active = false;
    };
  }, [authState, refreshKey]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'custom-category' || !selectedCustomCategoryId) return;
    let active = true;
    setCustomCategoryDataBusy(true);
    getCustomCategoryItems(selectedCustomCategoryId)
      .then((data) => {
        if (active) setCustomCategoryData(data);
      })
      .catch((err) => {
        if (active) {
          setToasts((current) => [
            ...current,
            { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) },
          ]);
        }
      })
      .finally(() => {
        if (active) setCustomCategoryDataBusy(false);
      });
    return () => {
      active = false;
    };
  }, [authState, viewMode, selectedCustomCategoryId, refreshKey]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    checkHealth()
      .then((health) => {
        if (!active) return;
        if (health.disk && (health.disk.usedPercent >= 90 || health.disk.freeBytes / health.disk.totalBytes <= 0.1)) {
          setDiskWarning(health.disk);
        } else {
          setDiskWarning(null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authState, refreshKey]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mediaLightboxFile) {
        setMediaLightboxFile(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaLightboxFile]);

  useEffect(() => {
    if (!quickAddCatOpen || authState !== 'signed-in') return;
    if (files.length === 0) listFiles(1, 100).then((r) => setFiles(r.files)).catch(() => {});
    if (vaultItems.length === 0) listVaultItems().then((r) => setVaultItems(r.items)).catch(() => {});
    if (libraryItems.length === 0) listLibraryItems().then((r) => setLibraryItems(r.items)).catch(() => {});
    if (bookmarks.length === 0) listBookmarks(1, 100).then((r) => setBookmarks(r.bookmarks)).catch(() => {});
  }, [quickAddCatOpen, authState]);

  useEffect(() => {
    if (!activeNote) {
      setActiveNoteCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('note', activeNote.id)
      .then((catId) => {
        if (active) setActiveNoteCustomCatId(catId);
      })
      .catch(() => {
        if (active) setActiveNoteCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeNote?.id]);

  useEffect(() => {
    if (!activeBookmark) {
      setActiveBookmarkCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('bookmark', activeBookmark.id)
      .then((catId) => {
        if (active) setActiveBookmarkCustomCatId(catId);
      })
      .catch(() => {
        if (active) setActiveBookmarkCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeBookmark?.id]);

  useEffect(() => {
    if (!activeVault) {
      setVaultCustomCatId('');
      return;
    }
    let active = true;
    getItemCustomCategory('vault', activeVault.id)
      .then((catId) => {
        if (active) setVaultCustomCatId(catId || '');
      })
      .catch(() => {
        if (active) setVaultCustomCatId('');
      });
    return () => {
      active = false;
    };
  }, [activeVault?.id]);

  useEffect(() => {
    if (!activeLibrary) {
      setLibraryCustomCatId('');
      return;
    }
    let active = true;
    getItemCustomCategory('library', activeLibrary.id)
      .then((catId) => {
        if (active) setLibraryCustomCatId(catId || '');
      })
      .catch(() => {
        if (active) setLibraryCustomCatId('');
      });
    return () => {
      active = false;
    };
  }, [activeLibrary?.id]);

  useEffect(() => {
    if (!activeFile) {
      setFileCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('file', activeFile.id)
      .then((catId) => {
        if (active) setFileCustomCatId(catId);
      })
      .catch(() => {
        if (active) setFileCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeFile?.id]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    Promise.all([
      listCategories(categoryPage),
      listTags(tagPage),
    ]).then(([categoryResult, tagResult]) => {
      if (!active) return;
      setCategories(categoryResult.categories ?? []);
      setCategoryTotal(categoryResult.total);
      setTags(tagResult.tags ?? []);
      setTagTotal(tagResult.total);
      setTaxonomyError('');
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setTaxonomyError(errorMessage(error));
      }
    }).finally(() => {
      if (active) setTaxonomyBusy(false);
    });
    return () => {
      active = false;
    };
  }, [authState, categoryPage, tagPage, taxonomyRefreshKey]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'notes' || !activeNoteId) return;
    let active = true;
    const requestId = ++taxonomyRequestId.current;
    getNoteTaxonomy(activeNoteId).then((relation) => {
      if (!active || requestId !== taxonomyRequestId.current) return;
      setSelectedCategoryIds(relation.categories.map((item) => item.id));
      setSelectedTagIds(relation.tags.map((item) => item.id));
      setSelectedPersonIds(relation.people.map((item) => item.id));
      setTaxonomyLoadedNoteId(activeNoteId);
      setTaxonomyLoadError(null);
    }).catch((error: unknown) => {
      if (!active || requestId !== taxonomyRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setTaxonomyLoadError({ noteId: activeNoteId, message: errorMessage(error) });
      }
    });
    return () => {
      active = false;
    };
  }, [activeNoteId, authState, taxonomyRetryKey, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'notes' || !activeNoteId) return;
    let active = true;
    getFavoriteStatus('note', activeNoteId).then((res) => {
      if (active) setNoteFavoriteState({ id: activeNoteId, favorited: res.favorited });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeNoteId, authState, refreshKey, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'bookmarks' || !activeBookmarkId) return;
    let active = true;
    getFavoriteStatus('bookmark', activeBookmarkId).then((res) => {
      if (active) setBookmarkFavoriteState({ id: activeBookmarkId, favorited: res.favorited });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeBookmarkId, authState, refreshKey, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    if (viewMode !== 'favorites' && viewMode !== 'files') return;
    let active = true;
    const requestId = ++notesRequestId.current;
    const request = viewMode === 'favorites' ? listFavorites(page) : listFiles(page);
    request.then((result) => {
      if (!active || requestId !== notesRequestId.current) return;
      if ('favorites' in result) {
        setFavorites(result.favorites);
        setFavoritesTotal(result.total);
        setActiveFavorite((current) => (
          result.favorites.find((item) => item.itemType === current?.itemType && item.itemId === current?.itemId)
          ?? result.favorites[0]
          ?? null
        ));
      } else {
        setFiles(result.files);
        setFilesTotal(result.total);
        setActiveFile((current) => result.files.find((item) => item.id === current?.id) ?? result.files[0] ?? null);
      }
      setNotesError('');
    }).catch((error: unknown) => {
      if (!active || requestId !== notesRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }).finally(() => {
      if (active && requestId === notesRequestId.current) {
        setFavoritesBusy(false);
        setFilesBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [authState, page, refreshKey, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'all') return;
    let active = true;
    Promise.all([listNotes(1, 50), listBookmarks(1, 50), listFiles(1, 50)])
      .then(([notesPage, bookmarkPage, filePage]) => {
        if (!active) return;
        const entries: AllEntry[] = [
          ...notesPage.notes.map((note) => ({
            kind: 'note' as const,
            id: note.id,
            title: note.title,
            subtitle: note.content || 'ไม่มีเนื้อหา',
            timestamp: note.updatedAt,
            note,
          })),
          ...bookmarkPage.bookmarks.map((bookmark) => ({
            kind: 'bookmark' as const,
            id: bookmark.id,
            title: bookmark.title,
            subtitle: bookmark.url,
            timestamp: bookmark.updatedAt,
            bookmark,
          })),
          ...filePage.files.map((file) => ({
            kind: 'file' as const,
            id: file.id,
            title: file.displayName,
            subtitle: `${formatBytes(file.sizeBytes)} · ${file.mediaType}`,
            timestamp: file.createdAt,
            file,
          })),
        ].sort((left, right) => right.timestamp - left.timestamp).slice(0, 50);
        setAllEntries(entries);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setAuthState('signed-out');
          setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
        } else {
          setNotesError(errorMessage(error));
        }
      })
      .finally(() => {
        if (active) setAllBusy(false);
      });
    return () => {
      active = false;
    };
  }, [authState, refreshKey, viewMode]);

  useEffect(() => {
    const hasFilters = filterCategoryIds.length > 0 || filterTagIds.length > 0;
    if (authState !== 'signed-in' || viewMode !== 'notes' || !hasFilters || notes.length === 0) return;
    let active = true;
    Promise.all(notes.map(async (note) => {
      try {
        const taxonomy = await getNoteTaxonomy(note.id);
        return [note.id, {
          categoryIds: taxonomy.categories.map((item) => item.id),
          tagIds: taxonomy.tags.map((item) => item.id),
        }] as const;
      } catch {
        return [note.id, { categoryIds: [], tagIds: [] }] as const;
      }
    })).then((entries) => {
      if (active) setNoteTaxonomyMap(Object.fromEntries(entries));
    }).finally(() => {
      if (active) setFilterBusy(false);
    });
    return () => {
      active = false;
    };
  }, [authState, filterCategoryIds, filterTagIds, notes, viewMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = themeMode;
    localStorage.setItem('pkh.theme', theme);
    localStorage.setItem('pkh.themeMode', themeMode);
  }, [theme, themeMode]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    Promise.all([
      listPeople(1, 100),
      listReminders(),
      listUpcomingReminders(60),
      listHabits(),
      listTimeblocks(localToday()),
      getHabitsHistory(7),
      listFiles(1, 100),
    ]).then(([peoplePage, reminderList, upcoming, habitList, blocks, week, filePage]) => {
      if (!active) return;
      setPeople(peoplePage.people);
      setReminders(reminderList);
      setUpcomingReminders(upcoming);
      void getNotifications().then((res) => {
        if (!active) return;
        setNotificationsList(res.notifications);
        setNotificationsUnreadCount(res.unreadCount);
      }).catch(() => undefined);
      setHabits(habitList);
      setTodayBlocks(blocks);
      setHabitWeek(week);
      setFiles(filePage.files);
      setFilesTotal(filePage.total);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }).finally(() => {
      if (active) {
        setPeopleBusy(false);
        setScheduleBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [authState, refreshKey]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    const status = taskFilter === 'done' ? 'done' : 'open';
    const due = taskFilter === 'today' ? 'today' : taskFilter === 'overdue' ? 'overdue' : undefined;
    Promise.all([
      listInbox('new', 1, 100),
      listTasks({ status, due }),
      listProjects('active'),
      listGoals('active'),
    ]).then(([inboxPage, taskPage, projectList, goalList]) => {
      if (!active) return;
      setInboxItems(inboxPage.items);
      setInboxNewCount(inboxPage.newCount);
      setTasks(taskPage.tasks);
      setProjects(projectList);
      setGoals(goalList);
    }).catch((error: unknown) => {
      if (!active) return;
      setTasksError(errorMessage(error));
    }).finally(() => {
      if (active) setTasksBusy(false);
    });
    return () => {
      active = false;
    };
  }, [authState, refreshKey, taskFilter]);

  // Vault and library are only fetched while their own view is open, so switching tabs does not
  // add two more requests to every other screen. The short timer keeps typing from firing per key.
  useEffect(() => {
    if (authState !== 'signed-in') return;
    if (viewMode !== 'vault' && viewMode !== 'library') return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (viewMode === 'vault') {
        listVaultItems({ category: vaultCategory, q: vaultQuery.trim(), pageSize: 100 })
          .then((page) => {
            if (!active) return;
            setVaultItems(page.items);
            setVaultError('');
          })
          .catch((error: unknown) => {
            if (active) setVaultError(errorMessage(error));
          })
          .finally(() => {
            if (active) setVaultBusy(false);
          });
        return;
      }
      listLibraryItems({
        category: libraryCategory,
        status: libraryStatus,
        q: libraryQuery.trim(),
        pageSize: 100,
      })
        .then((page) => {
          if (!active) return;
          setLibraryItems(page.items);
          setLibraryError('');
        })
        .catch((error: unknown) => {
          if (active) setLibraryError(errorMessage(error));
        })
        .finally(() => {
          if (active) setLibraryBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    authState, viewMode, refreshKey,
    vaultCategory, vaultQuery, libraryCategory, libraryStatus, libraryQuery,
  ]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'home') return;
    let active = true;
    const controller = new AbortController();
    getDashboard().then((data) => {
      if (!active) return;
      setDashboard(data);
      setDashboardError('');
    }).catch((error: unknown) => {
      if (active) setDashboardError(errorMessage(error));
    }).finally(() => {
      if (active) setDashboardBusy(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [authState, viewMode, refreshKey]);

  // Autosave only applies to notes that already exist on the server: a brand-new note is still
  // created by the explicit save button, so autosave can never spawn empty notes.
  useEffect(() => {
    if (authState !== 'signed-in' || !activeNote) return;
    if (title === activeNote.title && content === activeNote.content) {
      autosaveRef.current = null;
      return;
    }
    autosaveRef.current = { noteId: activeNote.id, title, content };
    const timer = window.setTimeout(() => {
      void flushAutosave();
    }, 1200);
    return () => window.clearTimeout(timer);
    // flushAutosave is intentionally excluded: including it would re-arm the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, activeNote, title, content]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    listTimeblocks(scheduleDate).then((blocks) => {
      if (active) setTimeblocks(blocks);
    }).catch(() => undefined).finally(() => {
      if (active) setScheduleBusy(false);
    });
    return () => {
      active = false;
    };
  }, [authState, refreshKey, scheduleDate]);

  useEffect(() => {
    if (!commandOpen) return;
    const query = commandQuery.trim();
    if (!query) return;
    if (commandFrom && commandTo && commandFrom > commandTo) {
      // Invalid range: never hit the API. The state update goes through a task so the
      // react-hooks/set-state-in-effect rule stays happy; the dialog also derives the same
      // message synchronously, so the alert is visible on the very next paint.
      const invalidTimer = window.setTimeout(() => {
        setCommandError('ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด');
        setCommandResults(null);
        setCommandBusy(false);
      }, 0);
      return () => window.clearTimeout(invalidTimer);
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchAll(query, {
        types: commandTypes,
        from: commandFrom || undefined,
        to: commandTo || undefined,
      }).then((results) => {
        if (active) {
          setCommandResults(results);
          setCommandError('');
        }
      }).catch((error: unknown) => {
        if (active) {
          setCommandResults(null);
          setCommandError(errorMessage(error));
        }
      }).finally(() => {
        if (active) setCommandBusy(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [commandOpen, commandQuery, commandTypes, commandFrom, commandTo]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      // Alt+N / Alt+T are quick capture, so they work from any view, including while typing.
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === 'n') {
          event.preventDefault();
          shortcutActions.current.newNote();
        } else if (key === 't') {
          event.preventDefault();
          shortcutActions.current.newTask();
        }
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setThemeOpen(false);
        setProfileOpen(false);
        setNotificationOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    shortcutActions.current = {
      newNote: startNewNote,
      newTask: () => {
        switchView('tasks');
        window.setTimeout(() => document.getElementById('quick-task-title')?.focus(), 120);
      },
    };
  });

  useEffect(() => {
    if (viewMode !== 'notes') return;
    const nextQuery = searchInput.trim().normalize('NFC');
    if (nextQuery === searchQuery) return;
    const timeout = window.setTimeout(() => {
      setNotesBusy(true);
      notesRequestId.current += 1;
      setSearchQuery(nextQuery);
      setPage(1);
      setNotes([]);
      setTotal(0);
      setNotesError('');
      setNotice('');
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput, searchQuery, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || searchSettling) return;
    if (viewMode === 'favorites' || viewMode === 'files') return;
    let active = true;
    const requestId = ++notesRequestId.current;
    const request = viewMode === 'trash'
      ? listTrash(page)
      : viewMode === 'bookmarks'
        ? listBookmarks(page)
        : searchQuery
          ? searchNotes(searchQuery, page)
          : listNotes(page);
    request.then((result) => {
      if (!active || requestId !== notesRequestId.current) return;
      const visibleNotes = 'bookmarks' in result
        ? result.bookmarks.map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title,
          content: bookmark.url,
          createdAt: bookmark.createdAt,
          updatedAt: bookmark.updatedAt,
        }))
        : result.notes;
      if ('bookmarks' in result) setBookmarks(result.bookmarks);
      setNotes(visibleNotes);
      setTotal(result.total);
      if (viewMode === 'trash') return;
      if (viewMode === 'bookmarks') {
        if (isNewBookmarkRef.current) return;
        const selected = result.bookmarks.find((bookmark) => bookmark.id === activeBookmark?.id)
          ?? result.bookmarks[0]
          ?? null;
        if (!activeBookmark || !result.bookmarks.some((bookmark) => bookmark.id === activeBookmark.id)) {
          setBookmarkTitle(selected?.title ?? '');
          setBookmarkUrl(selected?.url ?? '');
          setBookmarkDescription(selected?.description ?? '');
        }
        setActiveBookmark(selected);
        return;
      }
      if (isNewNoteRef.current) return;
      const current = activeNoteRef.current;
      const selected = result.notes.find((note) => note.id === current?.id) ?? result.notes[0] ?? null;
      if (!current || !result.notes.some((note) => note.id === current.id)) {
        setTitle(selected?.title ?? '');
        setContent(selected?.content ?? '');
      }
      activateNote(selected);
    }).catch((error: unknown) => {
      if (!active || requestId !== notesRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }).finally(() => {
      if (active && requestId === notesRequestId.current) setNotesBusy(false);
    });
    return () => {
      active = false;
    };
    // activateNote is a stable local function; depending on it would re-run this loader every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookmark, authState, page, refreshKey, searchQuery, searchSettling, viewMode]);

  function activateNote(note: Note | null, creating = false) {
    // Flush any pending autosave for the note being left behind, so switching never loses typing.
    if (autosaveRef.current && autosaveRef.current.noteId !== note?.id) {
      void flushAutosave();
    }
    if (note?.id !== activeNoteRef.current?.id) {
      setTaxonomyLoadError(null);
      setTaxonomyError('');
      setTaxonomyNotice('');
    }
    activeNoteRef.current = note;
    isNewNoteRef.current = creating;
    setActiveNote(note);
    if (!note) {
      setSelectedCategoryIds([]);
      setSelectedTagIds([]);
      setSelectedPersonIds([]);
      setTaxonomyLoadedNoteId('');
    } else if (!creating) {
      setTitle(note?.title ?? '');
      setContent(note?.content ?? '');
    }
  }

  function retryTaxonomyLoad() {
    setTaxonomyLoadError(null);
    setTaxonomyLoadedNoteId('');
    setTaxonomyRetryKey((key) => key + 1);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await login(username.trim(), password);
      if (res.twoFactorRequired && res.tempToken) {
        setTwoFactorTempToken(res.tempToken);
        setTwoFactorCode('');
        return;
      }
      if (res.user) {
        setUser(res.user);
        setPassword('');
        setNotesBusy(true);
        setTaxonomyBusy(true);
        setNotesError('');
        setAuthState('signed-in');
      }
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handle2FAVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!twoFactorTempToken || !twoFactorCode.trim()) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await verify2FALogin(twoFactorTempToken, twoFactorCode.trim());
      setUser(res.user);
      setPassword('');
      setTwoFactorTempToken('');
      setTwoFactorCode('');
      setNotesBusy(true);
      setTaxonomyBusy(true);
      setNotesError('');
      setAuthState('signed-in');
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  async function handleRequestForgotOtp(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!forgotUsername.trim()) return;
    if (forgotRecoveryType === 'email' && !forgotEmail.trim()) return;
    if (forgotRecoveryType === 'phone' && !forgotPhone.trim()) return;

    setForgotBusy(true);
    setForgotError('');
    try {
      const res = await requestForgotOtp(forgotUsername.trim(), {
        email: forgotEmail.trim() || undefined,
        phone: forgotPhone.trim() || undefined,
        recoveryType: forgotRecoveryType,
      });
      setForgotStep('reset');
      setOtpCountdown(60);
      setForgotMessage(res.message + (res.debugOtp ? ` (รหัส OTP สำหรับทดสอบ: ${res.debugOtp})` : ''));
    } catch (error) {
      setForgotError(errorMessage(error));
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleResetPasswordWithOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!forgotUsername.trim() || !forgotOtp.trim() || !forgotNewPassword) return;
    setForgotBusy(true);
    setForgotError('');
    try {
      const res = await resetPasswordWithOtp(forgotUsername.trim(), forgotOtp.trim(), forgotNewPassword, {
        email: forgotEmail.trim() || undefined,
        phone: forgotPhone.trim() || undefined,
      });
      setForgotMessage(res.message || 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว เข้าสู่ระบบได้ทันที');
      setTimeout(() => {
        setIsForgotOpen(false);
        setForgotStep('request');
        setForgotUsername('');
        setForgotEmail('');
        setForgotPhone('');
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotMessage('');
        setOtpCountdown(0);
        setShowAdminHelp(false);
      }, 2500);
    } catch (error) {
      setForgotError(errorMessage(error));
    } finally {
      setForgotBusy(false);
    }
  }

  const loadNotificationsData = useCallback(async () => {
    try {
      const res = await getNotifications();
      setNotificationsList(res.notifications);
      setNotificationsUnreadCount(res.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadNotificationsData();
      void getNotificationPreferences().then((res) => setNotificationPreferences(res.preferences)).catch(() => undefined);
      const interval = setInterval(() => {
        void loadNotificationsData();
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [user, loadNotificationsData]);

  const handleMarkNotificationRead = useCallback(async (id: string) => {
    try {
      await markNotificationsAsRead(id);
      setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: 1 } : n)));
      setNotificationsUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }, []);

  const handleCompleteNotification = useCallback(async (id: string) => {
    try {
      await completeNotification(id);
      setNotificationsList((prev) => prev.filter((n) => n.id !== id));
      setNotificationsUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }, []);

  const handleUpdateNotificationPreferences = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    const updated = await updateNotificationPreferences(prefs);
    setNotificationPreferences(updated.preferences);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try {
      await markNotificationsAsRead();
      setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
      setNotificationsUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  const handleSnoozeNotification = useCallback(async (id: string) => {
    try {
      await snoozeNotification(id, 24);
      setNotificationsList((prev) => prev.filter((n) => n.id !== id));
      setNotificationsUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }, []);

  const handleNavigateNotification = useCallback((url: string) => {
    if (url.includes('schedule') || url.includes('reminder')) {
      setViewMode('schedule');
    } else if (url.includes('task')) {
      setViewMode('tasks');
    } else if (url.includes('note')) {
      setViewMode('notes');
    } else if (url.includes('vault')) {
      setViewMode('vault');
    } else if (url.includes('library')) {
      setViewMode('library');
    }
    setMobileDetailOpen(true);
  }, []);

  const handleRegisterWithInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteBusy(true);
    try {
      const res = await registerAccount({
        inviteCode: inviteCode.trim() || undefined,
        username: inviteUsername.trim(),
        email: inviteEmail.trim() || undefined,
        password: invitePassword,
        displayName: inviteDisplayName.trim() || undefined,
      });
      setUser(res.user);
      setIsInviteRegisterOpen(false);
      setInviteCode('');
      setInviteUsername('');
      setInviteEmail('');
      setInvitePassword('');
      setInviteDisplayName('');
    } catch (err) {
      setInviteError(errorMessage(err) || 'ไม่สามารถลงทะเบียนได้');
    } finally {
      setInviteBusy(false);
    }
  };

  function startNewNote() {
    setNoteViewMode('editor');
    notesRequestId.current += 1;
    isNewBookmarkRef.current = false;
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setNoteMenuOpen(false);
    setViewMode('notes');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
    setNotesBusy(false);
    activateNote(null, true);
    setActiveBookmark(null);
    setSelectedPersonIds([]);
    setPersonPickerOpen(false);
    setTitle('');
    setContent('');
    setNotice('');
    setNotesError('');
  }

  function startNewBookmark() {
    notesRequestId.current += 1;
    isNewBookmarkRef.current = true;
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setNoteMenuOpen(false);
    setViewMode('bookmarks');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
    setNotes([]);
    setTotal(0);
    setNotesBusy(false);
    setActiveBookmark(null);
    setBookmarkTitle('');
    setBookmarkUrl('');
    setBookmarkDescription('');
    setNotice('');
    setNotesError('');
  }

  function selectNote(note: Note) {
    notesRequestId.current += 1;
    setNotesBusy(false);
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setNoteMenuOpen(false);
    if (viewMode === 'trash') setActiveTrashNote(note);
    else if (viewMode === 'bookmarks') {
      isNewBookmarkRef.current = false;
      const bookmark = bookmarks.find((item) => item.id === note.id) ?? null;
      setActiveBookmark(bookmark);
      setBookmarkTitle(bookmark?.title ?? '');
      setBookmarkUrl(bookmark?.url ?? '');
      setBookmarkDescription(bookmark?.description ?? '');
    } else activateNote(note);
    setNotice('');
    setNotesError('');
  }

  // --- Phase 2.2: Custom Categories & Sidebar Handlers ---
  function openCreateCategoryModal(parentId: string | null = null) {
    setCategoryDraft({ name: '', icon: '📁', color: '#3f7658', parentId });
    setCategoryModal({ mode: 'create', parentId });
    setCategoryModalError('');
  }

  function openEditCategoryModal(cat: CustomCategory, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setCategoryDraft({ name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId });
    setCategoryModal({ mode: 'edit', category: cat });
    setCategoryModalError('');
  }

  async function handleSaveCategory() {
    if (!categoryDraft.name.trim()) {
      setCategoryModalError('กรุณากรอกชื่อหมวดหมู่');
      return;
    }
    setCategoryModalBusy(true);
    setCategoryModalError('');
    try {
      if (categoryModal?.mode === 'create') {
        const created = await createCustomCategory({
          name: categoryDraft.name.trim(),
          icon: categoryDraft.icon,
          color: categoryDraft.color,
          parentId: categoryDraft.parentId,
        });
        setCustomCategories((curr) => [...curr, created]);
        setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'สร้างหมวดหมู่เรียบร้อย' }]);
        setCategoryModal(null);
        selectCustomCategory(created.id);
      } else if (categoryModal?.mode === 'edit' && categoryModal.category) {
        const updated = await updateCustomCategory(categoryModal.category.id, {
          name: categoryDraft.name.trim(),
          icon: categoryDraft.icon,
          color: categoryDraft.color,
          parentId: categoryDraft.parentId,
        });
        setCustomCategories((curr) => curr.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        if (selectedCustomCategoryId === updated.id) {
          setCustomCategoryData((curr) => curr ? { ...curr, category: updated } : null);
        }
        setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'อัปเดตหมวดหมู่เรียบร้อย' }]);
        setCategoryModal(null);
      }
    } catch (err) {
      setCategoryModalError(errorMessage(err));
    } finally {
      setCategoryModalBusy(false);
    }
  }

  async function handleDeleteCategory(cat: CustomCategory, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!window.confirm(`คุณต้องการลบหมวดหมู่ "${cat.name}" ใช่หรือไม่?\n(ข้อมูลที่อยู่ในหมวดนี้จะไม่ถูกลบ แต่จะถูกถอดหมวดหมู่ออก)`)) {
      return;
    }
    try {
      await deleteCustomCategory(cat.id);
      setCustomCategories((curr) => curr.filter((c) => c.id !== cat.id && c.parentId !== cat.id));
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'ลบหมวดหมู่เรียบร้อย' }]);
      setRefreshKey((key) => key + 1);
      if (selectedCustomCategoryId === cat.id) {
        switchView('home');
      }
    } catch (err) {
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) }]);
    }
  }

  function selectCustomCategory(id: string) {
    notesRequestId.current += 1;
    setViewMode('custom-category');
    setSelectedCustomCategoryId(id);
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setCustomCategoryFilter('all');
    setCustomCategoryDataBusy(true);
    getCustomCategoryItems(id)
      .then((data) => setCustomCategoryData(data))
      .catch((err) => {
        setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) }]);
      })
      .finally(() => setCustomCategoryDataBusy(false));
  }

  async function handleQuickAddIntoCategory(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomCategoryId) return;
    setQuickAddBusy(true);
    try {
      if (quickAddType === 'note') {
        if (!quickAddTitle.trim()) return;
        const newNote = await saveNote(null, quickAddTitle.trim(), quickAddContentOrUrl.trim());
        await linkItemToCustomCategory(selectedCustomCategoryId, 'note', newNote.id);
      } else if (quickAddType === 'task') {
        if (!quickAddTitle.trim()) return;
        const newTask = await createTask({ title: quickAddTitle.trim(), detail: quickAddContentOrUrl.trim() });
        await linkItemToCustomCategory(selectedCustomCategoryId, 'task', newTask.id);
      } else if (quickAddType === 'bookmark') {
        if (!quickAddTitle.trim()) return;
        const rawQuickBm = quickAddContentOrUrl.trim() || 'https://';
        const normQuickBm = rawQuickBm && !/^https?:\/\//i.test(rawQuickBm) ? `https://${rawQuickBm}` : rawQuickBm;
        const newBm = await saveBookmark(null, quickAddTitle.trim(), normQuickBm, '');
        await linkItemToCustomCategory(selectedCustomCategoryId, 'bookmark', newBm.id);
      } else if (quickAddType === 'file') {
        if (!catUploadFile) {
          setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' }]);
          return;
        }
        const uploaded = await uploadFile(catUploadFile);
        await linkItemToCustomCategory(selectedCustomCategoryId, 'file', uploaded.id);
        setCatUploadFile(null);
      } else if (quickAddType === 'vault') {
        if (!quickAddTitle.trim()) return;
        const created = await createVaultItem({
          title: quickAddTitle.trim(),
          category: quickAddVaultCategory,
          keyValue: quickAddVaultKey.trim(),
          physicalLocation: quickAddVaultLocation.trim(),
          renewalOrExpiryDate: quickAddVaultExpiry || null,
          amountText: quickAddVaultAmount.trim(),
          notes: quickAddContentOrUrl.trim(),
        });
        await linkItemToCustomCategory(selectedCustomCategoryId, 'vault', created.id);
      } else if (quickAddType === 'library') {
        if (!quickAddTitle.trim()) return;
        const created = await createLibraryItem({
          title: quickAddTitle.trim(),
          category: quickAddLibraryCategory,
          status: quickAddLibraryStatus,
          sourceUrlOrAuthor: quickAddLibrarySource.trim(),
          keyTakeaways: quickAddContentOrUrl.trim(),
        });
        await linkItemToCustomCategory(selectedCustomCategoryId, 'library', created.id);
      }
      setQuickAddTitle('');
      setQuickAddContentOrUrl('');
      setQuickAddVaultKey('');
      setQuickAddVaultLocation('');
      setQuickAddVaultExpiry('');
      setQuickAddVaultAmount('');
      setQuickAddLibrarySource('');
      setQuickAddCatOpen(false);
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'เพิ่มข้อมูลในหมวดหมู่แล้ว' }]);
      // refresh items & global counts
      setRefreshKey((key) => key + 1);
      setRefreshKey((key) => key + 1);
      const refreshed = await getCustomCategoryItems(selectedCustomCategoryId);
      setCustomCategoryData(refreshed);
    } catch (err) {
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) }]);
    } finally {
      setQuickAddBusy(false);
    }
  }

  async function handleLinkExistingItem(itemType: 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library', itemId: string) {
    if (!selectedCustomCategoryId) return;
    setAttachBusyId(`${itemType}:${itemId}`);
    try {
      await linkItemToCustomCategory(selectedCustomCategoryId, itemType, itemId);
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'ผูกข้อมูลเข้าหมวดนี้เรียบร้อย' }]);
      const refreshed = await getCustomCategoryItems(selectedCustomCategoryId);
      setCustomCategoryData(refreshed);
    } catch (err) {
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) }]);
    } finally {
      setAttachBusyId(null);
    }
  }

  async function handleUnlinkCategoryItem(itemType: 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library', itemId: string) {
    if (!selectedCustomCategoryId) return;
    try {
      await unlinkItemFromCustomCategory(selectedCustomCategoryId, itemType, itemId);
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'info', message: 'เอาข้อมูลออกจากหมวดนี้แล้ว' }]);
      const refreshed = await getCustomCategoryItems(selectedCustomCategoryId);
      setCustomCategoryData(refreshed);
    } catch (err) {
      setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'error', message: errorMessage(err) }]);
    }
  }

  // --- Sidebar Nav Customization Handlers ---
  function moveNavItem(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tempNavConfig.length) return;
    const copy = [...tempNavConfig];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setTempNavConfig(copy);
  }

  function toggleNavItem(index: number) {
    setTempNavConfig((curr) =>
      curr.map((item, idx) => (idx === index ? { ...item, enabled: !item.enabled } : item)),
    );
  }

  function updateNavItemLabel(index: number, label: string) {
    setTempNavConfig((curr) =>
      curr.map((item, idx) => (idx === index ? { ...item, label } : item)),
    );
  }

  function handleSaveNavConfig() {
    saveSidebarNav(tempNavConfig);
    setSidebarNav(tempNavConfig);
    setCustomizeNavOpen(false);
    setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'success', message: 'บันทึกการตั้งค่าเมนูแล้ว' }]);
  }

  function handleResetNavConfig() {
    const def = resetSidebarNav();
    setTempNavConfig(def);
    setSidebarNav(def);
    setCustomizeNavOpen(false);
    setToasts((t) => [...t, { id: ++toastSeqRef.current, kind: 'info', message: 'รีเซ็ตเมนูเป็นค่าเริ่มต้นแล้ว' }]);
  }

  function switchView(nextView: NotesView) {
    if (nextView === viewMode) return;
    notesRequestId.current += 1;
    isNewBookmarkRef.current = false;
    if (nextView !== 'custom-category') setSelectedCustomCategoryId(null);
    setViewMode(nextView);
    setNoteViewMode('grid');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
    setNotes([]);
    setTotal(0);
    setActiveTrashNote(null);
    setActiveBookmark(null);
    setActiveFavorite(null);
    setActiveFile(null);
    setFavorites([]);
    setFavoritesTotal(0);
    setFiles([]);
    setFilesTotal(0);
    setActiveVault(null);
    setVaultDraft(emptyVaultDraft);
    setVaultItems([]);
    setVaultError('');
    setVaultNotice('');
    setActiveLibrary(null);
    setLibraryDraft(emptyLibraryDraft);
    setLibraryItems([]);
    setLibraryError('');
    setLibraryNotice('');
    setSelectedCategoryIds([]);
    setSelectedTagIds([]);
    setSelectedPersonIds([]);
    setPersonPickerOpen(false);
    setChipPicker(null);
    setTaxonomyLoadedNoteId('');
    setBookmarkTitle('');
    setBookmarkUrl('');
    setBookmarkDescription('');
    setMobileMenuOpen(false);
    setMobileDetailOpen(false);
    setNoteMenuOpen(false);
    setChipPicker(null);
    setSaveState('idle');
    setInboxError('');
    setInboxNotice('');
    setTasksError('');
    setTasksNotice('');
    setProjectsError('');
    setProjectsNotice('');
    setGoalsError('');
    setGoalsNotice('');
    const workViews: NotesView[] = ['home', 'inbox', 'tasks', 'projects', 'goals', 'people', 'schedule'];
    if (nextView === 'favorites') setFavoritesBusy(true);
    else if (nextView === 'files') setFilesBusy(true);
    else if (nextView === 'all') setAllBusy(true);
    else if (!workViews.includes(nextView)) setNotesBusy(true);
    setNotesError('');
    setNotice('');
    setPermanentDeleteOpen(false);
  }

  function clearSearch() {
    notesRequestId.current += 1;
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
    setNotes([]);
    setTotal(0);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
  }

  function markListBusy() {
    if (viewMode === 'favorites') setFavoritesBusy(true);
    else if (viewMode === 'files') setFilesBusy(true);
    else setNotesBusy(true);
  }

  function toggleFilter(kind: TaxonomyKind, id: string) {
    setFilterBusy(true);
    setNotesError('');
    if (kind === 'categories') {
      setFilterCategoryIds((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      ));
    } else {
      setFilterTagIds((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      ));
    }
  }

  function clearFilters() {
    setFilterCategoryIds([]);
    setFilterTagIds([]);
    setNoteTaxonomyMap({});
    setFilterBusy(false);
  }

  function toggleRelation(kind: TaxonomyKind, id: string) {
    const selected = kind === 'categories' ? selectedCategoryIds : selectedTagIds;
    if (!selected.includes(id) && selected.length >= 100) {
      setTaxonomyError(`เลือกได้ไม่เกิน 100 ${kind === 'categories' ? 'หมวดหมู่' : 'แท็ก'}ต่อโน้ต`);
      return;
    }
    if (kind === 'categories') {
      setSelectedCategoryIds((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      ));
    } else {
      setSelectedTagIds((current) => (
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      ));
    }
    setTaxonomyError('');
    setTaxonomyNotice('');
  }

  function selectAllEntry(entry: AllEntry) {
    notesRequestId.current += 1;
    setNotesBusy(false);
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setNoteMenuOpen(false);
    setChipPicker(null);
    setNotice('');
    setNotesError('');
    if (entry.kind === 'note') {
      setViewMode('notes');
      activeNoteRef.current = entry.note;
      isNewNoteRef.current = true;
      setActiveNote(entry.note);
      setTitle(entry.note.title);
      setContent(entry.note.content);
    } else if (entry.kind === 'bookmark') {
      setViewMode('bookmarks');
      isNewBookmarkRef.current = true;
      setActiveBookmark(entry.bookmark);
      setBookmarkTitle(entry.bookmark.title);
      setBookmarkUrl(entry.bookmark.url);
      setBookmarkDescription(entry.bookmark.description);
    } else {
      setViewMode('files');
      setActiveFile(entry.file);
    }
  }

  function selectPerson(person: Person) {
    setActivePerson(person);
    setPersonDraft({ ...person });
    setPersonNotes([]);
    setPersonError('');
    setPersonNotice('');
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setViewMode('people');
    void getPersonNotes(person.id).then(setPersonNotes).catch(() => undefined);
  }

  function startNewPerson() {
    setActivePerson(null);
    setPersonDraft({ name: '', relationshipGroup: 'family' });
    setPersonNotes([]);
    setPersonError('');
    setPersonNotice('');
    setMobileMenuOpen(false);
    setMobileDetailOpen(true);
    setViewMode('people');
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPersonBusy(true);
    setPersonError('');
    setPersonNotice('');
    try {
      const payload = {
        name: personDraft.name.trim(),
        relationshipGroup: personDraft.relationshipGroup,
        roleLabel: personDraft.roleLabel ?? '',
        avatarFileId: personDraft.avatarFileId ?? null,
        avatarDataUrl: personDraft.avatarDataUrl ?? null,
        avatarPreset: personDraft.avatarPreset ?? '',
        birthdayOrAnniversary: personDraft.birthdayOrAnniversary ?? '',
        phone: personDraft.phone ?? '',
        favoritesAndLikes: personDraft.favoritesAndLikes ?? '',
        allergiesAndMedical: personDraft.allergiesAndMedical ?? '',
        giftIdeasAndSizes: personDraft.giftIdeasAndSizes ?? '',
        memo: personDraft.memo ?? '',
      };
      const saved = activePerson
        ? await updatePerson(activePerson.id, payload)
        : await createPerson(payload as Parameters<typeof createPerson>[0]);
      setActivePerson(saved);
      setPersonDraft({ ...saved });
      const msg = activePerson ? 'บันทึกข้อมูลบุคคลแล้ว' : 'เพิ่มบุคคลเรียบร้อยแล้ว';
      setPersonNotice(msg);
      pushToast('success', msg, {
        label: postSaveBehavior === 'list' ? 'เปิดดูรายละเอียด →' : 'ไปที่รายการ →',
        onClick: () => {
          if (postSaveBehavior === 'list') {
            setActivePerson(saved);
          } else {
            setActivePerson(null);
          }
        },
      });
      setRefreshKey((key) => key + 1);
      void getPersonNotes(saved.id).then(setPersonNotes).catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setPersonError(errorMessage(error));
      }
    } finally {
      setPersonBusy(false);
    }
  }

  async function deleteActivePerson() {
    if (!activePerson || !window.confirm(`ลบข้อมูล “${activePerson.name}” หรือไม่?`)) return;
    setPersonBusy(true);
    setPersonError('');
    try {
      await deletePerson(activePerson.id);
      setActivePerson(null);
      setPersonDraft({ name: '', relationshipGroup: 'family' });
      setPersonNotes([]);
      setPersonNotice('ลบข้อมูลบุคคลแล้ว');
      pushToast('success', 'ลบข้อมูลบุคคลเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPersonError(errorMessage(error));
    } finally {
      setPersonBusy(false);
    }
  }

  async function handlePersonAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPersonAvatarBusy(true);
    setPersonError('');
    try {
      const reader = new FileReader();
      const readPromise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const [stored, dataUrl] = await Promise.all([uploadFile(file), readPromise]);
      setPersonDraft((current) => ({ ...current, avatarFileId: stored.id, avatarDataUrl: dataUrl }));
      setPersonNotice('อัปโหลดรูปแล้ว กดบันทึกเพื่อยืนยัน');
    } catch (error) {
      setPersonError(errorMessage(error));
    } finally {
      setPersonAvatarBusy(false);
    }
  }

  async function createReminderForPerson() {
    if (!activePerson) return;
    const days = daysUntilNext(activePerson.birthdayOrAnniversary);
    if (days === null) {
      setPersonError('กรุณาระบุวันเกิดหรือวันครบรอบก่อน');
      return;
    }
    setPersonBusy(true);
    setPersonError('');
    try {
      await createReminder({
        title: `วันเกิด ${activePerson.name}`,
        targetDate: localDateAfter(days),
        category: 'birthday',
        priority: 'high',
        linkedPersonId: activePerson.id,
        notifyDaysBefore: 7,
      });
      setPersonNotice('เพิ่มแจ้งเตือนวันสำคัญแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPersonError(errorMessage(error));
    } finally {
      setPersonBusy(false);
    }
  }

  function startNoteForPerson() {
    if (!activePerson) return;
    startNewNote();
    setSelectedPersonIds([activePerson.id]);
    setPersonPickerOpen(false);
  }

  async function addReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleBusy(true);
    setScheduleError('');
    setScheduleNotice('');
    try {
      await createReminder({
        title: reminderDraft.title.trim(),
        targetDate: reminderDraft.targetDate,
        category: reminderDraft.category,
        linkedPersonId: reminderDraft.linkedPersonId || null,
        notifyDaysBefore: Number(reminderDraft.notifyDaysBefore) || 0,
        recurrence: reminderDraft.recurrence,
      });
      setReminderDraft({
        title: '', targetDate: localToday(), category: 'other', recurrence: 'none',
        linkedPersonId: '', notifyDaysBefore: '7',
      });
      setScheduleNotice('เพิ่มแจ้งเตือนแล้ว');
      pushToast('success', 'เพิ่มแจ้งเตือนเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleReminder(reminder: Reminder) {
    try {
      await updateReminder(reminder.id, { isCompleted: reminder.isCompleted ? 0 : 1 });
      pushToast('success', reminder.isCompleted ? 'เปิดแจ้งเตือนอีกครั้ง' : 'ปิดการแจ้งเตือนแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function removeReminder(reminder: Reminder) {
    if (!window.confirm(`ลบแจ้งเตือน “${reminder.title}” หรือไม่?`)) return;
    try {
      await deleteReminder(reminder.id);
      setScheduleNotice('ลบแจ้งเตือนแล้ว');
      pushToast('success', 'ลบแจ้งเตือนเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function addTimeblock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleBusy(true);
    setScheduleError('');
    setScheduleNotice('');
    try {
      await createTimeblock({
        blockDate: scheduleDate,
        timeRange: blockDraft.timeRange,
        title: blockDraft.title.trim(),
        lifeArea: blockDraft.lifeArea,
      });
      setBlockDraft({ timeRange: '06:30 - 07:30', title: '', lifeArea: 'health' });
      setScheduleNotice('เพิ่มช่วงเวลาแล้ว');
      pushToast('success', 'เพิ่มช่วงเวลาเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleTimeblock(block: Timeblock) {
    try {
      await updateTimeblock(block.id, { isDone: block.isDone ? 0 : 1 });
      pushToast('success', block.isDone ? 'ยกเลิกการทำ' : 'ทำเสร็จเรียบร้อย');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function removeTimeblock(block: Timeblock) {
    if (!window.confirm(`ลบช่วงเวลา “${block.title}” หรือไม่?`)) return;
    try {
      await deleteTimeblock(block.id);
      setScheduleNotice('ลบช่วงเวลาแล้ว');
      pushToast('success', 'ลบช่วงเวลาเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function addHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduleBusy(true);
    setScheduleError('');
    setScheduleNotice('');
    try {
      await createHabit({
        title: habitDraft.title.trim(),
        dailyTarget: Number(habitDraft.dailyTarget) || 1,
        unit: habitDraft.unit.trim() || 'ครั้ง',
      });
      setHabitDraft({ title: '', dailyTarget: '8', unit: 'ครั้ง' });
      setScheduleNotice('เพิ่มกิจวัตรแล้ว');
      pushToast('success', 'เพิ่มกิจวัตรเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function checkHabitToday(habit: Habit) {
    try {
      await checkHabit(habit.id, localToday());
      pushToast('success', `เช็กอิน “${habit.title}” สำเร็จ! 🔥`);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function removeHabit(habit: Habit) {
    if (!window.confirm(`ลบกิจวัตร “${habit.title}” หรือไม่?`)) return;
    try {
      await deleteHabit(habit.id);
      setScheduleNotice('ลบกิจวัตรแล้ว');
      pushToast('success', 'ลบกิจวัตรเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function refreshDashboard() {
    setDashboardBusy(true);
    setRefreshKey((key) => key + 1);
  }

  async function openNoteById(noteId: string) {
    try {
      const note = await getNote(noteId);
      isNewNoteRef.current = true;
      setViewMode('notes');
      activateNote(note);
      setMobileDetailOpen(true);
    } catch (error) {
      pushToast('error', errorMessage(error));
    }
  }

  function pushToast(kind: 'success' | 'error' | 'info', message: string, action?: { label: string; onClick: () => void }) {
    const id = toastSeqRef.current + 1;
    toastSeqRef.current = id;
    setToasts((current) => [...current.slice(-3), { id, kind, message, action }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function handleSetPostSaveBehavior(behavior: 'stay' | 'list' | 'detail') {
    setPostSaveBehavior(behavior);
    localStorage.setItem('pkh.postSaveBehavior', behavior);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  async function flushAutosave() {
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return;
    }
    const pending = autosaveRef.current;
    if (!pending) return;
    autosaveInFlightRef.current = true;
    autosaveQueuedRef.current = false;
    setSaveState('saving');
    try {
      const saved = await saveNote(pending.noteId, pending.title, pending.content);
      autosaveRef.current = null;
      setActiveNote(saved);
      setNotes((current) => current.map((note) => (note.id === saved.id ? saved : note)));
      setSaveState('saved');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setSaveState('error');
        pushToast('error', 'บันทึกอัตโนมัติไม่สำเร็จ กดบันทึกอีกครั้งเพื่อลองใหม่');
      }
    } finally {
      autosaveInFlightRef.current = false;
      if (autosaveQueuedRef.current) {
        autosaveQueuedRef.current = false;
        void flushAutosave();
      }
    }
  }

  async function snooze(reminder: Reminder, days: number) {
    setScheduleBusy(true);
    setScheduleError('');
    try {
      const result = await snoozeReminder(reminder.id, days, reminder.effectiveDate ?? reminder.targetDate);
      setScheduleNotice(`เลื่อนแจ้งเตือนไป ${result.snoozedUntil} แล้ว`);
      pushToast('success', `เลื่อนไป ${result.snoozedUntil} แล้ว`);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setScheduleError('รายการนี้ถูกเลื่อนไปแล้ว กรุณารีเฟรช');
      } else {
        setScheduleError(errorMessage(error));
      }
    } finally {
      setScheduleBusy(false);
    }
  }

  async function correctHabitDay(habit: Habit, date: string, current: number | null) {
    setScheduleBusy(true);
    setScheduleError('');
    try {
      // Tapping a day toggles it between "done" and "cleared" so a wrong entry can be fixed.
      const next = current && current > 0 ? 0 : habit.dailyTarget;
      await setHabitLog(habit.id, date, next);
      setScheduleNotice('บันทึกประวัติแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setScheduleError(errorMessage(error));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function addInboxItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = inboxDraft.trim();
    if (!body) return;
    setInboxBusy(true);
    setSaveState('idle');
    setInboxError('');
    setInboxNotice('');
    try {
      await createInboxItem(body);
      setInboxDraft('');
      setInboxNotice('เก็บเข้ากล่องขาเข้าแล้ว');
      pushToast('success', 'เก็บเข้ากล่องขาเข้าแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setInboxError(errorMessage(error));
    } finally {
      setInboxBusy(false);
    }
  }

  async function convertItem(item: InboxItem, target: 'note' | 'task' | 'project' | 'bookmark' | 'reminder') {
    setInboxBusy(true);
    setSaveState('idle');
    setInboxError('');
    setInboxNotice('');
    try {
      await convertInboxItem(item.id, target, { url: item.body });
      setInboxNotice('แปลงรายการแล้ว');
      pushToast('success', 'แปลงรายการและย้ายออกจากกล่องแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setInboxError(errorMessage(error));
    } finally {
      setInboxBusy(false);
    }
  }

  async function archiveInboxItem(item: InboxItem) {
    setInboxBusy(true);
    setInboxError('');
    try {
      await updateInboxItem(item.id, { status: 'archived' });
      setInboxNotice('เก็บเข้าคลังแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setInboxError(errorMessage(error));
    } finally {
      setInboxBusy(false);
    }
  }

  async function removeInboxItem(item: InboxItem) {
    if (!window.confirm('ลบรายการนี้ออกจากกล่องขาเข้าหรือไม่?')) return;
    setInboxBusy(true);
    setInboxError('');
    try {
      await deleteInboxItem(item.id);
      setInboxNotice('ลบรายการแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setInboxError(errorMessage(error));
    } finally {
      setInboxBusy(false);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskDraft.title.trim();
    if (!title) return;
    setTasksBusy(true);
    setTasksError('');
    setTasksNotice('');
    try {
      const createdTask = await createTask({
        title,
        dueDate: taskDraft.dueDate || undefined,
        priority: taskDraft.priority,
        projectId: taskDraft.projectId || null,
        recurrence: taskDraft.recurrence,
      });
      if (taskDraftCustomCatId) {
        try {
          await setItemCustomCategory('task', createdTask.id, taskDraftCustomCatId);
        } catch {
          // ignore error
        }
      }
      setTaskDraft({ title: '', dueDate: '', priority: 'normal', projectId: '', recurrence: 'none' });
      setTaskDraftCustomCatId('');
      setTasksNotice('เพิ่มงานแล้ว');
      pushToast('success', 'เพิ่มงานแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setTasksError(errorMessage(error));
    } finally {
      setTasksBusy(false);
    }
  }

  async function toggleTask(task: Task) {
    setTasksBusy(true);
    setTasksError('');
    setTasksNotice('');
    try {
      const result = await updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
      setTasksNotice(result.nextTask
        ? `ปิดงานแล้ว และสร้างรอบถัดไปวันที่ ${result.nextTask.dueDate ?? '-'}`
        : 'อัปเดตงานแล้ว');
      pushToast('success', result.nextTask ? 'ปิดงานแล้ว และสร้างรอบถัดไปให้อัตโนมัติ' : 'อัปเดตงานแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setTasksError(errorMessage(error));
    } finally {
      setTasksBusy(false);
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`ลบงาน “${task.title}” หรือไม่?`)) return;
    setTasksBusy(true);
    setTasksError('');
    try {
      await deleteTask(task.id);
      setTasksNotice('ลบงานแล้ว');
      pushToast('success', 'ลบงานเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setTasksError(errorMessage(error));
    } finally {
      setTasksBusy(false);
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectDraft.name.trim();
    if (!name) return;
    setProjectsBusy(true);
    setProjectsError('');
    setProjectsNotice('');
    try {
      await createProject({
        name,
        outcome: projectDraft.outcome,
        dueDate: projectDraft.dueDate || undefined,
        goalId: projectDraft.goalId || null,
      });
      setProjectDraft({ name: '', outcome: '', dueDate: '', goalId: '' });
      setProjectsNotice('สร้างโปรเจกต์แล้ว');
      pushToast('success', 'สร้างโปรเจกต์แล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setProjectsError(errorMessage(error));
    } finally {
      setProjectsBusy(false);
    }
  }

  async function finishProject(project: Project) {
    setProjectsBusy(true);
    setProjectsError('');
    try {
      await updateProject(project.id, { status: 'done' });
      setProjectsNotice('ปิดโปรเจกต์แล้ว');
      pushToast('success', 'ปิดโปรเจกต์เรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setProjectsError(errorMessage(error));
    } finally {
      setProjectsBusy(false);
    }
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`ลบโปรเจกต์ “${project.name}” หรือไม่? งานข้างในจะยังอยู่แต่หลุดจากโปรเจกต์`)) return;
    setProjectsBusy(true);
    setProjectsError('');
    try {
      await deleteProject(project.id);
      setProjectsNotice('ลบโปรเจกต์แล้ว');
      pushToast('success', 'ลบโปรเจกต์เรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setProjectsError(errorMessage(error));
    } finally {
      setProjectsBusy(false);
    }
  }

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = goalDraft.title.trim();
    if (!title) return;
    setGoalsBusy(true);
    setGoalsError('');
    setGoalsNotice('');
    try {
      const target = goalDraft.targetValue.trim() === '' ? null : Number(goalDraft.targetValue);
      await createGoal({
        title,
        metric: goalDraft.metric,
        targetValue: target !== null && Number.isFinite(target) ? target : null,
        unit: goalDraft.unit,
      });
      setGoalDraft({ title: '', metric: '', targetValue: '', unit: '' });
      setGoalsNotice('เพิ่มเป้าหมายแล้ว');
      pushToast('success', 'เพิ่มเป้าหมายแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setGoalsError(errorMessage(error));
    } finally {
      setGoalsBusy(false);
    }
  }

  async function bumpGoal(goal: Goal, delta: number) {
    setGoalsBusy(true);
    setGoalsError('');
    try {
      await updateGoal(goal.id, { currentValue: Math.max(0, goal.currentValue + delta) });
      pushToast('success', delta > 0 ? 'ปรับความคืบหน้า +1' : 'ปรับความคืบหน้า -1');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setGoalsError(errorMessage(error));
    } finally {
      setGoalsBusy(false);
    }
  }

  async function removeGoal(goal: Goal) {
    if (!window.confirm(`ลบเป้าหมาย “${goal.title}” หรือไม่?`)) return;
    setGoalsBusy(true);
    setGoalsError('');
    try {
      await deleteGoal(goal.id);
      setGoalsNotice('ลบเป้าหมายแล้ว');
      pushToast('success', 'ลบเป้าหมายเรียบร้อยแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setGoalsError(errorMessage(error));
    } finally {
      setGoalsBusy(false);
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem('pkh.profile', JSON.stringify(profile));
    setProfileOpen(false);
  }

  async function handleProfileAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const stored = await uploadFile(file);
      const next = { ...profile, avatarFileId: stored.id };
      setProfile(next);
      localStorage.setItem('pkh.profile', JSON.stringify(next));
    } catch (error) {
      setNotesError(errorMessage(error));
    }
  }

  // ------------------------------------------------------------------ vault

  function startNewVaultItem() {
    setActiveVault(null);
    setVaultDraft(emptyVaultDraft);
    setVaultError('');
    setVaultNotice('');
    setMobileDetailOpen(true);
  }

  function selectVaultItem(item: VaultItem) {
    setActiveVault(item);
    setVaultDraft({
      title: item.title,
      category: item.category,
      keyValue: item.keyValue,
      physicalLocation: item.physicalLocation,
      renewalOrExpiryDate: item.renewalOrExpiryDate ?? '',
      amountText: item.amountText,
      notes: item.notes,
    });
    setVaultError('');
    setVaultNotice('');
    setMobileDetailOpen(true);
  }

  async function saveVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = vaultDraft.title.trim();
    if (!title) {
      setVaultError('กรุณากรอกชื่อรายการก่อนบันทึก');
      return;
    }
    setVaultBusy(true);
    setVaultError('');
    setVaultNotice('');
    try {
      const payload = {
        title,
        category: vaultDraft.category,
        keyValue: vaultDraft.keyValue.trim(),
        physicalLocation: vaultDraft.physicalLocation.trim(),
        renewalOrExpiryDate: vaultDraft.renewalOrExpiryDate || null,
        amountText: vaultDraft.amountText.trim(),
        notes: vaultDraft.notes,
      };
      const saved = activeVault
        ? await updateVaultItem(activeVault.id, payload)
        : await createVaultItem(payload);
      if (vaultCustomCatId !== undefined) {
        try {
          await setItemCustomCategory('vault', saved.id, vaultCustomCatId || null);
        } catch {
          // ignore error
        }
      }
      setActiveVault(saved);
      setVaultDraft({
        title: saved.title,
        category: saved.category,
        keyValue: saved.keyValue,
        physicalLocation: saved.physicalLocation,
        renewalOrExpiryDate: saved.renewalOrExpiryDate ?? '',
        amountText: saved.amountText,
        notes: saved.notes,
      });
      const vaultMsg = activeVault ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการเข้าคลังแล้ว';
      setVaultNotice(vaultMsg);
      pushToast('success', vaultMsg, {
        label: postSaveBehavior === 'list' ? 'เปิดดูรายละเอียด →' : 'ไปที่รายการ →',
        onClick: () => {
          if (postSaveBehavior === 'list') {
            setActiveVault(saved);
          } else {
            setActiveVault(null);
          }
        },
      });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setVaultError(errorMessage(error));
    } finally {
      setVaultBusy(false);
    }
  }

  async function removeVaultItem(item: VaultItem) {
    setVaultBusy(true);
    setVaultError('');
    try {
      await deleteVaultItem(item.id);
      if (activeVault?.id === item.id) {
        setActiveVault(null);
        setVaultDraft(emptyVaultDraft);
      }
      pushToast('success', 'ลบรายการออกจากคลังแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setVaultError(errorMessage(error));
    } finally {
      setVaultBusy(false);
    }
  }

  async function copyVaultKey(item: VaultItem | null, value: string) {
    const text = (value || item?.keyValue || '').trim();
    if (!text) {
      pushToast('error', 'รายการนี้ยังไม่มีเลขสำคัญให้คัดลอก');
      return;
    }
    // execCommand still works where the async clipboard API refuses (unfocused document,
    // embedded webview, older Safari), so it is the fallback rather than a second failure.
    const legacyCopy = () => {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(helper);
      return copied;
    };
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          pushToast('success', 'คัดลอกลงคลิปบอร์ดแล้ว');
          return;
        } catch {
          // Fall through to the legacy path instead of reporting a failure the user cannot act on.
        }
      }
      if (legacyCopy()) {
        pushToast('success', 'คัดลอกลงคลิปบอร์ดแล้ว');
        return;
      }
      pushToast('error', 'เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ');
    } catch {
      pushToast('error', 'เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ');
    }
  }

  async function sendVaultItemToReminders(item: VaultItem) {
    if (!item.renewalOrExpiryDate) {
      pushToast('error', 'รายการนี้ยังไม่มีวันครบกำหนด');
      return;
    }
    try {
      await createReminder({
        title: `ต่ออายุ / ครบกำหนด: ${item.title}`,
        targetDate: item.renewalOrExpiryDate,
        category: 'other',
        notifyDaysBefore: 14,
      });
      pushToast('success', 'ส่งวันครบกำหนดเข้าปฏิทินแจ้งเตือนแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      pushToast('error', errorMessage(error));
    }
  }

  // ---------------------------------------------------------------- library

  function startNewLibraryItem() {
    setActiveLibrary(null);
    setLibraryDraft(emptyLibraryDraft);
    setLibraryError('');
    setLibraryNotice('');
    setMobileDetailOpen(true);
  }

  function selectLibraryItem(item: LibraryItem) {
    setActiveLibrary(item);
    setLibraryDraft({
      title: item.title,
      category: item.category,
      status: item.status,
      sourceUrlOrAuthor: item.sourceUrlOrAuthor,
      keyTakeaways: item.keyTakeaways,
      content: item.content,
    });
    setLibraryError('');
    setLibraryNotice('');
    setMobileDetailOpen(true);
  }

  async function saveLibraryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = libraryDraft.title.trim();
    if (!title) {
      setLibraryError('กรุณากรอกชื่อเรื่องก่อนบันทึก');
      return;
    }
    setLibraryBusy(true);
    setLibraryError('');
    setLibraryNotice('');
    try {
      const payload = {
        title,
        category: libraryDraft.category,
        status: libraryDraft.status,
        sourceUrlOrAuthor: libraryDraft.sourceUrlOrAuthor.trim(),
        keyTakeaways: libraryDraft.keyTakeaways,
        content: libraryDraft.content,
      };
      const saved = activeLibrary
        ? await updateLibraryItem(activeLibrary.id, payload)
        : await createLibraryItem(payload);
      if (libraryCustomCatId !== undefined) {
        try {
          await setItemCustomCategory('library', saved.id, libraryCustomCatId || null);
        } catch {
          // ignore error
        }
      }
      setActiveLibrary(saved);
      setLibraryDraft({
        title: saved.title,
        category: saved.category,
        status: saved.status,
        sourceUrlOrAuthor: saved.sourceUrlOrAuthor,
        keyTakeaways: saved.keyTakeaways,
        content: saved.content,
      });
      const libMsg = activeLibrary ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มความรู้เข้าห้องสมุดแล้ว';
      setLibraryNotice(libMsg);
      pushToast('success', libMsg, {
        label: postSaveBehavior === 'list' ? 'เปิดดูรายละเอียด →' : 'ไปที่รายการ →',
        onClick: () => {
          if (postSaveBehavior === 'list') {
            setActiveLibrary(saved);
          } else {
            setActiveLibrary(null);
          }
        },
      });
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setLibraryError(errorMessage(error));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function removeLibraryItem(item: LibraryItem) {
    setLibraryBusy(true);
    setLibraryError('');
    try {
      await deleteLibraryItem(item.id);
      if (activeLibrary?.id === item.id) {
        setActiveLibrary(null);
        setLibraryDraft(emptyLibraryDraft);
      }
      pushToast('success', 'ลบรายการออกจากห้องสมุดแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setLibraryError(errorMessage(error));
    } finally {
      setLibraryBusy(false);
    }
  }

  function toggleCommandType(type: SearchBucketType) {
    setCommandTypes((current) => {
      const next = current.includes(type)
        ? (current.length > 1 ? current.filter((item) => item !== type) : current)
        : [...current, type];
      if (commandQuery.trim() && !(commandFrom && commandTo && commandFrom > commandTo)) {
        setCommandBusy(true);
      }
      return next;
    });
  }

  function resetCommandFilters() {
    setCommandTypes(ALL_SEARCH_TYPES);
    setCommandFrom('');
    setCommandTo('');
    setCommandError('');
    if (commandQuery.trim()) {
      setCommandBusy(true);
    }
  }

  function navigateCommand(
    kind: 'note' | 'task' | 'project' | 'goal' | 'person' | 'reminder' | 'bookmark' | 'file'
      | 'vault' | 'library' | 'category',
    id: string,
  ) {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandResults(null);
    setCommandError('');
    if (kind === 'category') {
      setSelectedCustomCategoryId(id);
      setViewMode('custom-category');
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'note') {
      void getNote(id).then((note) => {
        setViewMode('notes');
        activateNote(note);
        isNewNoteRef.current = true;
        setMobileDetailOpen(true);
      }).catch(() => undefined);
      return;
    }
    if (kind === 'task') {
      setViewMode('tasks');
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'project') {
      setViewMode('projects');
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'goal') {
      setViewMode('goals');
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'person') {
      const person = people.find((item) => item.id === id);
      if (person) selectPerson(person);
      else setViewMode('people');
      return;
    }
    if (kind === 'bookmark') {
      const existing = bookmarks.find((item) => item.id === id);
      setViewMode('bookmarks');
      if (existing) {
        setActiveBookmark(existing);
        setBookmarkTitle(existing.title);
        setBookmarkUrl(existing.url);
        setBookmarkDescription(existing.description);
      }
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'file') {
      const existing = files.find((item) => item.id === id);
      setViewMode('files');
      if (existing) setActiveFile(existing);
      setMobileDetailOpen(true);
      return;
    }
    if (kind === 'vault') {
      const existing = vaultItems.find((item) => item.id === id);
      setViewMode('vault');
      setMobileDetailOpen(true);
      if (existing) {
        selectVaultItem(existing);
        return;
      }
      // The hit may be outside the list currently loaded for this view, so fetch it directly.
      void listVaultItems({ pageSize: 100 }).then((page) => {
        const found = page.items.find((item) => item.id === id);
        if (found) selectVaultItem(found);
      }).catch(() => undefined);
      return;
    }
    if (kind === 'library') {
      const existing = libraryItems.find((item) => item.id === id);
      setViewMode('library');
      setMobileDetailOpen(true);
      if (existing) {
        selectLibraryItem(existing);
        return;
      }
      void listLibraryItems({ pageSize: 100 }).then((page) => {
        const found = page.items.find((item) => item.id === id);
        if (found) selectLibraryItem(found);
      }).catch(() => undefined);
      return;
    }
    const reminder = reminders.find((item) => item.id === id);
    setViewMode('schedule');
    setMobileDetailOpen(true);
    if (reminder) setScheduleDate(reminder.targetDate);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    setNotesBusy(true);
    try {
      const wasEditing = Boolean(activeNote);
      const savedNote = await saveNote(activeNote?.id ?? null, title, content);
      if (activeNoteCustomCatId !== undefined) {
        try {
          await setItemCustomCategory('note', savedNote.id, activeNoteCustomCatId);
        } catch {
          // ignore error
        }
      }
      let relationSaveFailed = false;
      let relationSaveError: unknown;
      try {
        await saveNoteTaxonomy(savedNote.id, selectedCategoryIds, selectedTagIds, selectedPersonIds);
      } catch (error) {
        relationSaveFailed = true;
        relationSaveError = error;
      }
      activateNote(savedNote);
      setPage(1);
      setNotesBusy(true);
      setRefreshKey((key) => key + 1);
      setSaveState('saved');
      if (!relationSaveFailed) {
        const msg = wasEditing ? 'บันทึกการแก้ไขแล้ว' : 'สร้างโน้ตแล้ว';
        setNotice(msg);
        if (postSaveBehavior === 'list') {
          setMobileDetailOpen(false);
          pushToast('success', msg, {
            label: 'เปิดดูรายละเอียด →',
            onClick: () => {
              activateNote(savedNote);
              setMobileDetailOpen(true);
            },
          });
        } else {
          activateNote(savedNote);
          pushToast('success', msg, {
            label: 'ไปที่รายการ →',
            onClick: () => {
              setMobileDetailOpen(false);
            },
          });
        }
      } else if (relationSaveError instanceof ApiError && relationSaveError.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(`บันทึกโน้ตแล้ว แต่บันทึกหมวดหมู่และแท็กไม่สำเร็จ: ${errorMessage(relationSaveError)}`);
      }
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setSaveState('error');
        setNotesError(errorMessage(error));
        pushToast('error', 'บันทึกโน้ตไม่สำเร็จ');
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleSaveTaxonomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taxonomyEditor) return;
    setTaxonomySaving(true);
    setTaxonomyError('');
    setTaxonomyNotice('');
    try {
      await saveTaxonomyItem(taxonomyEditor.kind, taxonomyEditor.item?.id ?? null, taxonomyEditor.name);
      setTaxonomyEditor(null);
      setTaxonomyBusy(true);
      setTaxonomyRefreshKey((key) => key + 1);
      setTaxonomyNotice(taxonomyEditor.item ? 'แก้ไขชื่อเรียบร้อยแล้ว' : 'เพิ่มรายการเรียบร้อยแล้ว');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setTaxonomyError(errorMessage(error));
      }
    } finally {
      setTaxonomySaving(false);
    }
  }

  async function handleDeleteTaxonomyItem(kind: TaxonomyKind, item: TaxonomyItem) {
    const label = kind === 'categories' ? 'หมวดหมู่' : 'แท็ก';
    if (!window.confirm(`ลบ${label} “${item.name}” หรือไม่? ความสัมพันธ์กับโน้ตจะถูกนำออกด้วย`)) return;
    setTaxonomySaving(true);
    setTaxonomyError('');
    setTaxonomyNotice('');
    try {
      await deleteTaxonomyItem(kind, item.id);
      if (kind === 'categories') {
        setSelectedCategoryIds((current) => current.filter((id) => id !== item.id));
        if (categories.length === 1 && categoryPage > 1) setCategoryPage((current) => current - 1);
      } else {
        setSelectedTagIds((current) => current.filter((id) => id !== item.id));
        if (tags.length === 1 && tagPage > 1) setTagPage((current) => current - 1);
      }
      setTaxonomyBusy(true);
      setTaxonomyRefreshKey((key) => key + 1);
      setTaxonomyNotice(`ลบ${label}เรียบร้อยแล้ว`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setTaxonomyError(errorMessage(error));
      }
    } finally {
      setTaxonomySaving(false);
    }
  }

  function renderTaxonomyGroup(kind: TaxonomyKind, mode: 'filter' | 'select' = 'select') {
    const isCategory = kind === 'categories';
    const isFilter = mode === 'filter';
    const label = isCategory ? 'หมวดหมู่' : 'แท็ก';
    const items = isCategory ? categories : tags;
    const selectedIds = isFilter
      ? (isCategory ? filterCategoryIds : filterTagIds)
      : (isCategory ? selectedCategoryIds : selectedTagIds);
    const currentPage = isCategory ? categoryPage : tagPage;
    const pageCount = Math.max(1, Math.ceil((isCategory ? categoryTotal : tagTotal) / 50));
    const editor = taxonomyEditor?.kind === kind ? taxonomyEditor : null;
    const checkboxDisabled = isFilter
      ? false
      : (taxonomyRelationsBusy || taxonomyRelationsUnavailable || taxonomySaving);

    return (
      <section className={`taxonomy-group${isFilter ? ' is-compact' : ''}`} aria-label={label}>
        <div className="taxonomy-heading">
          <h3>{label} <span>({isCategory ? categoryTotal : tagTotal})</span></h3>
          {isFilter && (
            <button
              className="button button-quiet taxonomy-add"
              type="button"
              disabled={taxonomyBusy || taxonomySaving}
              onClick={() => {
                setTaxonomyError('');
                setTaxonomyEditor({ kind, item: null, name: '' });
              }}
            >
              เพิ่ม{label}
            </button>
          )}
        </div>
        {isFilter && editor && (
          <form className="taxonomy-edit-form" onSubmit={handleSaveTaxonomy}>
            <label htmlFor={`${kind}-name`}>{editor.item ? `แก้ไขชื่อ${label}` : `ชื่อ${label}ใหม่`}</label>
            <div className="taxonomy-edit-row">
              <input
                id={`${kind}-name`}
                value={editor.name}
                onChange={(event) => setTaxonomyEditor({ ...editor, name: event.target.value })}
                maxLength={80}
                required
                autoFocus
              />
              <button className="button button-primary" type="submit" disabled={taxonomySaving}>
                {taxonomySaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <button className="button button-quiet" type="button" onClick={() => setTaxonomyEditor(null)}>
                ยกเลิก
              </button>
            </div>
          </form>
        )}
        {taxonomyBusy ? (
          <p className="taxonomy-state" aria-live="polite">กำลังโหลด{label}…</p>
        ) : items.length === 0 ? (
          <p className="taxonomy-state">ยังไม่มี{label}</p>
        ) : (
          <ul className="taxonomy-list">
            {items.map((item) => (
              <li key={item.id}>
                <label className="taxonomy-choice">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    disabled={checkboxDisabled}
                    onChange={() => {
                      if (isFilter) toggleFilter(kind, item.id);
                      else toggleRelation(kind, item.id);
                    }}
                  />
                  <span>{item.name}</span>
                </label>
                {isFilter && (
                  <div className="taxonomy-item-actions">
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={taxonomySaving}
                      onClick={() => {
                        setTaxonomyError('');
                        setTaxonomyEditor({ kind, item, name: item.name });
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="button button-danger-quiet"
                      type="button"
                      disabled={taxonomySaving}
                      onClick={() => void handleDeleteTaxonomyItem(kind, item)}
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {isFilter && pageCount > 1 && (
          <div className="taxonomy-pagination">
            <button
              className="button button-quiet"
              type="button"
              disabled={currentPage <= 1 || taxonomyBusy}
              onClick={() => {
                setTaxonomyBusy(true);
                if (isCategory) setCategoryPage((page) => page - 1);
                else setTagPage((page) => page - 1);
              }}
            >
              ก่อนหน้า
            </button>
            <span>{currentPage} / {pageCount}</span>
            <button
              className="button button-quiet"
              type="button"
              disabled={currentPage >= pageCount || taxonomyBusy}
              onClick={() => {
                setTaxonomyBusy(true);
                if (isCategory) setCategoryPage((page) => page + 1);
                else setTagPage((page) => page + 1);
              }}
            >
              ถัดไป
            </button>
          </div>
        )}
      </section>
    );
  }

  async function handleSaveBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const isEditing = Boolean(activeBookmark);
      const rawBmUrl = bookmarkUrl.trim();
      const normalizedBmUrl = rawBmUrl && !/^https?:\/\//i.test(rawBmUrl) ? `https://${rawBmUrl}` : rawBmUrl;
      const saved = await saveBookmark(
        activeBookmark?.id ?? null,
        bookmarkTitle,
        normalizedBmUrl,
        bookmarkDescription,
        bookmarkCategory,
      );
      if (activeBookmarkCustomCatId !== undefined) {
        try {
          await setItemCustomCategory('bookmark', saved.id, activeBookmarkCustomCatId);
        } catch {
          // ignore error
        }
      }
      // Reset form & active bookmark so user can add continuous bookmarks immediately!
      isNewBookmarkRef.current = true;
      setActiveBookmark(null);
      setBookmarkTitle('');
      setBookmarkUrl('');
      setBookmarkDescription('');
      setActiveBookmarkCustomCatId(null);

      setBookmarks((current) => [
        saved,
        ...current.filter((bookmark) => bookmark.id !== saved.id),
      ]);
      setPage(1);
      setNotesBusy(false);
      setRefreshKey((key) => key + 1);
      setNotice(isEditing ? 'บันทึกการแก้ไขบุ๊กมาร์กแล้ว' : 'บันทึกบุ๊กมาร์กแล้ว');
      pushToast('success', isEditing ? 'บันทึกการแก้ไขบุ๊กมาร์กแล้ว' : 'บันทึกบุ๊กมาร์กแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDeleteBookmark() {
    if (!activeBookmark || !window.confirm('ลบบุ๊กมาร์กนี้หรือไม่?')) return;
    await handleDeleteBookmarkById(activeBookmark.id);
  }

  async function handleDeleteBookmarkById(id: string) {
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    try {
      await deleteBookmark(id);
      if (activeBookmark?.id === id) {
        isNewBookmarkRef.current = true;
        setActiveBookmark(null);
        setBookmarkTitle('');
        setBookmarkUrl('');
        setBookmarkDescription('');
        setActiveBookmarkCustomCatId(null);
      }
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
      setRefreshKey((key) => key + 1);
      setNotice('ลบบุ๊กมาร์กแล้ว');
      pushToast('success', 'ลบบุ๊กมาร์กเรียบร้อยแล้ว');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function toggleFavorite(itemType: FavoriteItemType, itemId: string, currentlyFavorited: boolean) {
    setFavoriteBusy(true);
    setNotesError('');
    setNotice('');
    try {
      if (currentlyFavorited) await removeFavorite(itemType, itemId);
      else await addFavorite(itemType, itemId);
      if (itemType === 'note') setNoteFavoriteState({ id: itemId, favorited: !currentlyFavorited });
      else setBookmarkFavoriteState({ id: itemId, favorited: !currentlyFavorited });
      setNotice(currentlyFavorited ? 'นำออกจากรายการโปรดแล้ว' : 'เพิ่มในรายการโปรดแล้ว');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function openFavorite(favorite: Favorite) {
    setNotesError('');
    if (favorite.itemType === 'bookmark') {
      notesRequestId.current += 1;
      setViewMode('bookmarks');
      setSearchInput('');
      setSearchQuery('');
      setPage(1);
      setNotes([]);
      setTotal(0);
      setNotesBusy(true);
      return;
    }
    if (favorite.itemType === 'task') {
      setViewMode('tasks');
      return;
    }
    if (favorite.itemType === 'project') {
      setViewMode('projects');
      return;
    }
    if (favorite.itemType === 'goal') {
      setViewMode('goals');
      return;
    }
    if (favorite.itemType === 'person') {
      setViewMode('people');
      return;
    }
    if (favorite.itemType === 'vault') {
      setViewMode('vault');
      return;
    }
    if (favorite.itemType === 'library') {
      setViewMode('library');
      return;
    }
    if (favorite.itemType === 'watchlist') {
      setViewMode('watchlist');
      return;
    }
    if (favorite.itemType === 'shopping') {
      setViewMode('shopping');
      return;
    }
    if (favorite.itemType === 'travel') {
      setViewMode('travel');
      return;
    }
    if (favorite.itemType === 'file') {
      setViewMode('files');
      return;
    }
    if (favorite.itemType === 'custom_record') {
      setViewMode('custom-type');
      return;
    }
    try {
      const note = await getNote(favorite.itemId);
      notesRequestId.current += 1;
      setViewMode('notes');
      setSearchInput('');
      setSearchQuery('');
      setPage(1);
      setNotesBusy(false);
      activateNote(note);
      // Keep the requested note selected when the list reloads, even if it is not on page 1.
      isNewNoteRef.current = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const stored = await uploadFile(file);
      setNotice(`อัปโหลด “${stored.displayName}” แล้ว`);
      setPage(1);
      setFilesBusy(true);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleDeleteFile(file: StoredFile) {
    if (!window.confirm(`ลบไฟล์ “${file.displayName}” หรือไม่? ไฟล์จะถูกลบถาวร`)) return;
    setNotesError('');
    setNotice('');
    try {
      await deleteFile(file.id);
      setActiveFile(null);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setFilesTotal((current) => Math.max(0, current - 1));
      if (files.length === 1 && page > 1) setPage((current) => current - 1);
      else {
        setFilesBusy(true);
        setRefreshKey((key) => key + 1);
      }
      setNotice('ลบไฟล์แล้ว');
      pushToast('success', 'ลบไฟล์เรียบร้อยแล้ว');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }
  }

  async function moveToTrash(note: Note) {
    if (!window.confirm('ย้ายโน้ตนี้ไปถังขยะหรือไม่? เนื้อหาจะยังถูกเก็บไว้')) return;
    setNotesBusy(true);
    try {
      await deleteNote(note.id);
      if (activeNote?.id === note.id) activateNote(null);
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else setRefreshKey((key) => key + 1);
      pushToast('info', 'ย้ายโน้ตไปถังขยะแล้ว');
    } catch (err) {
      pushToast('error', errorMessage(err));
    } finally {
      setNotesBusy(false);
    }
  }

  async function handleDelete() {
    setNoteMenuOpen(false);
    if (!activeNote || !window.confirm('ย้ายโน้ตนี้ไปถังขยะหรือไม่? เนื้อหาจะยังถูกเก็บไว้')) return;
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    setNotesBusy(true);
    try {
      await deleteNote(activeNote.id);
      activateNote(null);
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else setRefreshKey((key) => key + 1);
      setNotice('ย้ายโน้ตไปถังขยะแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  /*
  async function handleRestore() {
    if (!activeTrashNote) return;
    setSaveBusy(true);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const restored = await restoreNote(activeTrashNote.id);
      activateNote(restored);
      setActiveTrashNote(null);
      setViewMode('notes');
      setPage(1);
      setNotes([]);
      setTotal(0);
      setRefreshKey((key) => key + 1);
      setNotice('กู้คืนโน้ตแล้ว');
      pushToast('success', 'กู้คืนโน้ตเรียบร้อยแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }
  */

  async function handlePermanentDelete() {
    if (!activeTrashNote) return;
    setSaveBusy(true);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const deletedId = activeTrashNote.id;
      await permanentlyDeleteNote(deletedId);
      setActiveTrashNote(null);
      setPermanentDeleteOpen(false);
      setNotes((currentNotes) => currentNotes.filter((note) => note.id !== deletedId));
      setTotal((currentTotal) => Math.max(0, currentTotal - 1));
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else setRefreshKey((key) => key + 1);
      setNotice('ลบโน้ตถาวรแล้ว');
      pushToast('success', 'ลบโน้ตถาวรเรียบร้อยแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    setAuthError('');
    try {
      await logout();
      setUser(null);
      setNotes([]);
      setBookmarks([]);
      activateNote(null);
      setCategories([]);
      setTags([]);
      setCategoryTotal(0);
      setTagTotal(0);
      setViewMode('notes');
      setActiveBookmark(null);
      setActiveFavorite(null);
      setActiveFile(null);
      setFavorites([]);
      setFavoritesTotal(0);
      setFiles([]);
      setFilesTotal(0);
      setSearchInput('');
      setSearchQuery('');
      setPermanentDeleteOpen(false);
      setAuthState('signed-out');
    } catch (error) {
      setAuthError(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  if (authState === 'checking') {
    return <main className="center-state" aria-live="polite">กำลังตรวจสอบเซสชัน…</main>;
  }

  if (authState === 'unavailable') {
    return (
      <main className="center-state">
        <section className="message-card">
          <span className="eyebrow">PERSONAL KNOWLEDGE HUB</span>
          <h1>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</h1>
          <p role="alert">{authError}</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            ลองอีกครั้ง
          </button>
        </section>
      </main>
    );
  }

  if (authState === 'signed-out') {
    return (
      <main className="center-state login-background">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">P</div>
          <span className="eyebrow">PERSONAL KNOWLEDGE HUB</span>
          <h1>ยินดีต้อนรับกลับ</h1>
          <p className="muted">เข้าสู่ระบบเพื่อเปิดพื้นที่จัดเก็บความรู้ส่วนตัว</p>

          {/* 2FA Challenge Form */}
          {twoFactorTempToken ? (
            <form className="login-form" onSubmit={handle2FAVerify}>
              <div style={{ background: '#eff6ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af', marginBottom: '8px', lineHeight: 1.4 }}>
                🔐 บัญชีนี้เปิดใช้งาน 2FA กรุณากรอกรหัส 6 หลักจากแอป Authenticator หรือรหัส Recovery Code 8 หลัก
              </div>
              <label htmlFor="2fa-code">รหัสยืนยัน 2FA หรือ Recovery Code</label>
              <input
                id="2fa-code"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="เช่น 123456 หรือ 1234-5678"
                autoFocus
                required
                maxLength={20}
                style={{ fontSize: '16px', letterSpacing: '1px', textAlign: 'center' }}
              />
              {authError && <p className="form-error" role="alert">{authError}</p>}
              <button className="button button-primary button-wide" type="submit" disabled={authBusy}>
                {authBusy ? 'กำลังตรวจสอบ…' : '✓ ยืนยันรหัสเข้าสู่ระบบ'}
              </button>
              <button
                type="button"
                className="button button-quiet button-wide"
                style={{ marginTop: '8px' }}
                onClick={() => {
                  setTwoFactorTempToken('');
                  setTwoFactorCode('');
                  setAuthError('');
                }}
              >
                ← กลับสู่หน้าเข้าสู่ระบบปกติ
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <label htmlFor="username">ชื่อผู้ใช้</label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={80}
              />
              <label htmlFor="password">รหัสผ่าน</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={1024}
              />
              {authError && <p className="form-error" role="alert">{authError}</p>}
              <button className="button button-primary button-wide" type="submit" disabled={authBusy}>
                {authBusy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="text-button"
                  style={{ fontSize: '13px', color: 'var(--pkh-primary, #2563eb)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}
                  onClick={() => {
                    setIsInviteRegisterOpen(true);
                    setInviteError('');
                  }}
                >
                  {publicSettings.registration_mode === 'open' ? '✨ สมัครสมาชิกใหม่' : '🎟️ สมัครด้วยรหัสคำเชิญ'}
                </button>
                <button
                  type="button"
                  className="text-button"
                  style={{ fontSize: '13px', color: 'var(--pkh-text-secondary, #64748b)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}
                  onClick={() => {
                    setIsForgotOpen(true);
                    setForgotStep('request');
                    setForgotError('');
                    setForgotMessage('');
                  }}
                >
                  ลืมรหัสผ่าน? (กู้คืนด้วย OTP)
                </button>
              </div>
            </form>
          )}

          {/* Registration Modal */}
          {isInviteRegisterOpen && (
            <div className="dialog-backdrop" onClick={() => setIsInviteRegisterOpen(false)}>
              <section
                className="studio-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="สมัครสมาชิก"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '420px', width: '90%' }}
              >
                <div className="popover-head">
                  <h3 style={{ margin: 0, fontSize: '16px' }}>
                    {publicSettings.registration_mode === 'open' ? '✨ สมัครสมาชิกใหม่ (Registration)' : '🎟️ สมัครสมาชิกด้วยรหัสคำเชิญ (Invite Code)'}
                  </h3>
                  <button className="icon-button" type="button" onClick={() => setIsInviteRegisterOpen(false)}>×</button>
                </div>

                {inviteError && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', margin: '8px 0' }}>
                    ⚠️ {inviteError}
                  </div>
                )}

                <form onSubmit={handleRegisterWithInvite} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {publicSettings.registration_mode !== 'open' ? (
                    <label style={{ fontSize: '13px' }}>
                      รหัสคำเชิญ (Invite Code) *
                      <input
                        type="text"
                        required
                        placeholder="เช่น PKH-INV-ABC123"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        style={{ letterSpacing: '1px', fontWeight: 600 }}
                        autoFocus
                      />
                    </label>
                  ) : (
                    <label style={{ fontSize: '13px' }}>
                      รหัสคำเชิญ (ถ้ามี)
                      <input
                        type="text"
                        placeholder="เช่น PKH-INV-ABC123 (ไม่บังคับ)"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        style={{ letterSpacing: '1px' }}
                      />
                    </label>
                  )}

                  <label style={{ fontSize: '13px' }}>
                    ชื่อผู้ใช้ (Username) *
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={80}
                      placeholder="ความยาว 3-80 ตัวอักษร"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      autoFocus={publicSettings.registration_mode === 'open'}
                    />
                  </label>

                  <label style={{ fontSize: '13px' }}>
                    อีเมล (Email) (สำหรับกู้คืนรหัสผ่าน)
                    <input
                      type="email"
                      placeholder="email@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </label>

                  <label style={{ fontSize: '13px' }}>
                    ชื่อที่แสดง (Display Name) (ไม่บังคับ)
                    <input
                      type="text"
                      maxLength={80}
                      placeholder="เช่น พี่ต้นกล้า, แอดมินมาร์ค"
                      value={inviteDisplayName}
                      onChange={(e) => setInviteDisplayName(e.target.value)}
                    />
                  </label>

                  <label style={{ fontSize: '13px' }}>
                    รหัสผ่าน (ขั้นต่ำ 12 ตัวอักษรตามมาตรฐาน OWASP) *
                    <input
                      type="password"
                      required
                      minLength={12}
                      placeholder="อย่างน้อย 12 ตัวอักษร"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                    />
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    <button type="button" className="button button-quiet" onClick={() => setIsInviteRegisterOpen(false)}>
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={inviteBusy || (publicSettings.registration_mode !== 'open' && !inviteCode.trim()) || !inviteUsername.trim() || invitePassword.length < 12}
                    >
                      {inviteBusy ? 'กำลังสร้างบัญชี…' : '✓ สร้างบัญชีและเข้าสู่ระบบ'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* Forgot Password Modal */}
          {isForgotOpen && (
            <div className="dialog-backdrop" onClick={() => setIsForgotOpen(false)}>
              <section
                className="studio-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="กู้คืนรหัสผ่านด้วย OTP"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '460px', width: '92%', borderRadius: '16px', padding: '22px' }}
              >
                <div className="popover-head" style={{ marginBottom: '14px', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🔑</span>
                    <h3 style={{ margin: 0, fontSize: '17px' }}>กู้คืนรหัสผ่านด้วย OTP</h3>
                  </div>
                  <button className="icon-button" type="button" aria-label="ปิด" onClick={() => setIsForgotOpen(false)}>×</button>
                </div>

                {forgotMessage && (
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', margin: '8px 0', lineHeight: 1.5 }}>
                    ✓ {forgotMessage}
                  </div>
                )}
                {forgotError && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', margin: '8px 0', lineHeight: 1.5 }}>
                    ⚠️ {forgotError}
                  </div>
                )}

                {forgotStep === 'request' ? (
                  <form onSubmit={handleRequestForgotOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--pkh-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      เพื่อความปลอดภัยตามมาตรฐาน OWASP ASVS กรุณาระบุ <strong>ชื่อผู้ใช้</strong> และ <strong>ช่องทางที่ผูกไว้</strong> กับบัญชี
                    </p>

                    {/* Channel Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                        เลือกช่องทางรับรหัส OTP:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button
                          type="button"
                          className={`button ${forgotRecoveryType === 'email' ? 'button-primary' : 'button-quiet'}`}
                          style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }}
                          onClick={() => setForgotRecoveryType('email')}
                        >
                          ✉️ ทางอีเมล (Email)
                        </button>
                        <button
                          type="button"
                          className={`button ${forgotRecoveryType === 'phone' ? 'button-primary' : 'button-quiet'}`}
                          style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }}
                          onClick={() => setForgotRecoveryType('phone')}
                        >
                          📱 ทางเบอร์โทร (SMS)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-main)' }}>
                        ชื่อผู้ใช้ระบบ (Username) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="เช่น admin หรือ username ของคุณ"
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
                        autoFocus
                      />
                    </div>

                    {forgotRecoveryType === 'email' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-main)' }}>
                          อีเมลที่ผูกไว้กับบัญชี (Email) *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="เช่น user@example.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-main)' }}>
                          เบอร์โทรศัพท์ที่ผูกไว้กับบัญชี (Phone) *
                        </label>
                        <input
                          type="tel"
                          required
                          placeholder="เช่น 081-234-5678"
                          value={forgotPhone}
                          onChange={(e) => setForgotPhone(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: '12px' }}
                        onClick={() => setShowAdminHelp(!showAdminHelp)}
                      >
                        🆘 เข้าถึงไม่ได้ทั้ง 2 ทาง?
                      </button>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="button button-quiet" onClick={() => setIsForgotOpen(false)}>
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="button button-primary"
                          disabled={forgotBusy || !forgotUsername.trim() || (forgotRecoveryType === 'email' ? !forgotEmail.trim() : !forgotPhone.trim())}
                        >
                          {forgotBusy ? 'กำลังส่ง OTP…' : 'ขอรับรหัส OTP →'}
                        </button>
                      </div>
                    </div>

                    {showAdminHelp && (
                      <div style={{ background: 'var(--pkh-bg-subtle, #f8fafc)', border: '1px solid var(--pkh-border-subtle, #e2e8f0)', borderRadius: '10px', padding: '12px', fontSize: '12px', color: 'var(--pkh-text-secondary)', lineHeight: 1.6 }}>
                        <strong>🛡️ ช่องทางช่วยเหลือจากผู้ดูแลระบบ (Admin Assistance):</strong><br />
                        หากคุณไม่สามารถเข้าถึงอีเมลหรือเบอร์โทรศัพท์ที่เคยผูกไว้ได้ โปรดติดต่อผู้ดูแลระบบของ Workspace นี้เพื่อขอทำการตั้งรหัสผ่านชั่วคราวให้ใหม่ผ่านแท็บผู้ใช้งานในหน้าหลังบ้าน โดยผู้ดูแลระบบจะไม่สามารถมองเห็นรหัสผ่านเดิมของคุณได้
                      </div>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordWithOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--pkh-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      ระบบส่งรหัส OTP 6 หลักไปยัง {forgotRecoveryType === 'email' ? `อีเมล ${forgotEmail}` : `เบอร์ ${forgotPhone}`} เรียบร้อยแล้ว (รหัสมีอายุ 5 นาที)
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-main)' }}>
                          รหัส OTP (6 หลัก) *
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: '12px', color: otpCountdown > 0 ? 'var(--pkh-text-muted)' : 'var(--pkh-primary)' }}
                          disabled={otpCountdown > 0 || forgotBusy}
                          onClick={() => void handleRequestForgotOtp()}
                        >
                          {otpCountdown > 0 ? `ขอรหัสใหม่ได้ใน ${otpCountdown} วิ` : '🔄 ส่งรหัสอีกครั้ง'}
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        placeholder="123456"
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                        style={{
                          letterSpacing: '6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '20px',
                          padding: '10px',
                          borderRadius: '8px',
                          border: '2px solid var(--pkh-border-default)',
                          background: 'var(--pkh-bg-surface)',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                        autoFocus
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-main)' }}>
                        รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษรตามมาตรฐาน OWASP) *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={12}
                        placeholder="รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร..."
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-default)' }}
                      />
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                      💡 <strong>กรณีไม่ได้รับรหัส:</strong> ตรวจสอบในโฟลเดอร์ Junk/Spam หรือยืนยันว่าชื่อผู้ใช้และข้อมูลติดต่อตรงกับในระบบ (หากข้อมูลไม่ตรงกัน ระบบจะไม่ออกรหัสเพื่อความปลอดภัย)
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: '12px' }}
                        onClick={() => {
                          setForgotStep('request');
                          setForgotOtp('');
                          setForgotError('');
                        }}
                      >
                        ← เปลี่ยนข้อมูล
                      </button>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="button button-quiet" onClick={() => setIsForgotOpen(false)}>
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="button button-primary"
                          disabled={forgotBusy || forgotOtp.length !== 6 || forgotNewPassword.length < 12}
                        >
                          {forgotBusy ? 'กำลังบันทึก…' : '✓ ตั้งรหัสผ่านใหม่'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}

          <p className="login-footnote">บัญชีผู้ใช้จัดการโดยผู้ดูแลระบบ</p>
        </section>
      </main>
    );
  }

  const pageSize = viewMode !== 'notes' || searchQuery ? 50 : 20;
  const filteredPeople = people.filter((person) => {
    if (peopleGroup && person.relationshipGroup !== peopleGroup) return false;
    const query = peopleQuery.trim();
    if (!query) return true;
    return [person.name, person.roleLabel, person.favoritesAndLikes, person.allergiesAndMedical, person.memo]
      .some((value) => value.includes(query));
  });
  const visibleTotal = viewMode === 'all'
    ? allEntries.length
    : viewMode === 'people'
      ? filteredPeople.length
      : viewMode === 'schedule'
        ? upcomingReminders.length
        : viewMode === 'favorites'
          ? favoritesTotal
          : viewMode === 'files'
            ? filesTotal
            : viewMode === 'vault'
              ? vaultItems.length
              : viewMode === 'library'
                ? libraryItems.length
                : total;
  const pageCount = viewMode === 'all' || viewMode === 'people' || viewMode === 'schedule'
    || viewMode === 'vault' || viewMode === 'library' || viewMode === 'custom-category'
    ? 1
    : Math.max(1, Math.ceil(visibleTotal / pageSize));
  const viewTitle = viewMode === 'home'
    ? 'ภาพรวมวันนี้'
    : viewMode === 'all'
    ? 'ทั้งหมด'
    : viewMode === 'inbox'
      ? 'กล่องขาเข้า'
      : viewMode === 'tasks'
        ? 'งานที่ต้องทำ'
        : viewMode === 'projects'
          ? 'โปรเจกต์'
          : viewMode === 'goals'
            ? 'เป้าหมาย'
            : viewMode === 'people'
      ? 'บุคคลสำคัญ'
      : viewMode === 'schedule'
        ? 'ปฏิทิน & ตารางชีวิต'
        : viewMode === 'trash'
          ? 'ถังขยะ'
          : viewMode === 'bookmarks'
            ? 'ลิงก์'
            : viewMode === 'favorites'
              ? 'รายการโปรด'
              : viewMode === 'files'
                ? 'ไฟล์'
                : viewMode === 'vault'
                  ? 'คลังสำคัญ & ทรัพย์สิน'
                  : viewMode === 'library'
                    ? 'ห้องสมุด & คู่มือชีวิต'
                    : viewMode === 'custom-category'
                      ? (customCategoryData?.category.name ?? 'หมวดหมู่')
                      : viewMode === 'admin'
                        ? 'ตั้งค่าระบบ (Admin)'
                        : 'โน้ตของฉัน';
  const viewAriaLabel = viewMode === 'home'
    ? 'ภาพรวมวันนี้'
    : viewMode === 'all'
    ? 'รายการทั้งหมด'
    : viewMode === 'inbox'
      ? 'รายการในกล่องขาเข้า'
      : viewMode === 'tasks'
        ? 'รายการงาน'
        : viewMode === 'projects'
          ? 'รายการโปรเจกต์'
          : viewMode === 'goals'
            ? 'รายการเป้าหมาย'
            : viewMode === 'people'
      ? 'รายการบุคคลสำคัญ'
      : viewMode === 'schedule'
        ? 'ปฏิทินและตารางชีวิต'
        : viewMode === 'trash'
          ? 'รายการในถังขยะ'
          : viewMode === 'bookmarks'
            ? 'รายการบุ๊กมาร์ก'
            : viewMode === 'favorites'
              ? 'รายการโปรด'
              : viewMode === 'files'
                ? 'รายการไฟล์'
                : viewMode === 'vault'
                  ? 'รายการในคลังสำคัญและทรัพย์สิน'
                  : viewMode === 'library'
                    ? 'รายการในห้องสมุดและคู่มือชีวิต'
                    : viewMode === 'custom-category'
                      ? ('หมวดหมู่ ' + (customCategoryData?.category.name ?? ''))
                      : viewMode === 'admin'
                        ? 'ศูนย์ควบคุมและตั้งค่าระบบ'
                        : 'รายการโน้ต';
  const sidebarBusy = viewMode === 'home'
    ? dashboardBusy
    : viewMode === 'all'
    ? allBusy
    : viewMode === 'inbox'
      ? inboxBusy
      : viewMode === 'tasks'
        ? tasksBusy
        : viewMode === 'projects'
          ? projectsBusy
          : viewMode === 'goals'
            ? goalsBusy
            : viewMode === 'people'
      ? peopleBusy
      : viewMode === 'schedule'
        ? scheduleBusy
        : viewMode === 'favorites'
          ? favoritesBusy
          : viewMode === 'files'
            ? filesBusy
            : viewMode === 'vault'
              ? vaultBusy
              : viewMode === 'library'
                ? libraryBusy
                : viewMode === 'custom-category'
                  ? customCategoryDataBusy
                  : viewMode === 'admin'
                    ? false
                    : notesBusy;
  const listLength = viewMode === 'home'
    ? (dashboard ? 1 : 0)
    : viewMode === 'all'
    ? allEntries.length
    : viewMode === 'inbox'
      ? inboxItems.length
      : viewMode === 'tasks'
        ? tasks.length
        : viewMode === 'projects'
          ? projects.length
          : viewMode === 'goals'
            ? goals.length
            : viewMode === 'people'
      ? filteredPeople.length
      : viewMode === 'schedule'
        ? upcomingReminders.length
        : viewMode === 'favorites'
          ? favorites.length
          : viewMode === 'files'
            ? files.length
            : viewMode === 'vault'
              ? vaultItems.length
              : viewMode === 'library'
                ? libraryItems.length
                : viewMode === 'custom-category'
                  ? ((customCategoryData?.counts.total ?? 0) + (customCategoryData?.subcategories.length ?? 0))
                  : viewMode === 'admin'
                    ? 0
                    : notes.length;
  const activeFilterCount = filterCategoryIds.length + filterTagIds.length;
  const filteredNotes = activeFilterCount === 0
    ? notes
    : notes.filter((note) => {
      const taxonomy = noteTaxonomyMap[note.id];
      if (!taxonomy) return true;
      return filterCategoryIds.every((id) => taxonomy.categoryIds.includes(id))
        && filterTagIds.every((id) => taxonomy.tagIds.includes(id));
    });
  const listTotal = viewMode === 'notes' && activeFilterCount > 0 ? filteredNotes.length : visibleTotal;
  const selectedCategoryNames = categories.filter((item) => selectedCategoryIds.includes(item.id));
  const selectedTagNames = tags.filter((item) => selectedTagIds.includes(item.id));
  const selectedPeople = people.filter((item) => selectedPersonIds.includes(item.id));
  const todayDone = todayBlocks.filter((block) => block.isDone === 1).length;
  const todayProgress = todayBlocks.length === 0 ? 0 : Math.round((todayDone / todayBlocks.length) * 100);
  const themes: Array<{ name: ThemeName; label: string; color: string }> = [
    { name: 'aurora', label: '🌟 Aurora Scenic Ultra', color: '#10b981' },
    { name: 'cyberpunk', label: '🌌 Midnight Cyberpunk', color: '#06b6d4' },
    { name: 'emerald', label: '🌲 Emerald Forest', color: '#10b981' },
    { name: 'indigo', label: '👑 Royal Indigo', color: '#6366f1' },
    { name: 'rose', label: '🌸 Rose Quartz', color: '#f43f5e' },
    { name: 'amber', label: '🌅 Amber Sunset', color: '#f59e0b' },
    { name: 'dracula', label: '🧛 Dracula Dark', color: '#bd93f9' },
    { name: 'nord', label: '❄️ Nord Arctic', color: '#88c0d0' },
  ];
// menuItems is replaced by customizable sidebarNav

  return (
    <main className={`app-shell${focusMode ? ' focus-mode' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Topbar
        user={user}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onOpenCommand={() => setCommandOpen(true)}
        notificationOpen={notificationOpen}
        setNotificationOpen={setNotificationOpen}
        upcomingReminders={upcomingReminders}
        notifications={notificationsList}
        unreadCount={notificationsUnreadCount}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onMarkRead={handleMarkNotificationRead}
        onCompleteNotification={handleCompleteNotification}
        onSnoozeNotification={handleSnoozeNotification}
        onNavigateNotification={handleNavigateNotification}
        notificationPreferences={notificationPreferences}
        onUpdateNotificationPreferences={handleUpdateNotificationPreferences}
        onSelectReminder={(targetDate) => {
          setNotificationOpen(false);
          setViewMode('schedule');
          setScheduleDate(targetDate);
          setMobileDetailOpen(true);
        }}
        onOpenTheme={() => setThemeOpen(true)}
        onLogout={handleLogout}
        authBusy={authBusy}
        themeMode={themeMode}
        onToggleThemeMode={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAdmin={() => {
          setViewMode('admin');
          setMobileDetailOpen(true);
        }}
        brandLogo={publicSettings.app_logo}
        brandTitle={publicSettings.app_title}
        brandSubtitle={publicSettings.app_subtitle}
        profile={profile}
      />

      <div className="workspace">
        <Sidebar
          mobileMenuOpen={mobileMenuOpen}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
          onOpenProfile={() => setProfileOpen(true)}
          profile={profile}
          user={user}
          todayProgress={todayProgress}
          todayDone={todayDone}
          todayBlocksCount={todayBlocks.length}
          sidebarNav={sidebarNav}
          viewMode={viewMode}
          onSwitchView={switchView}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed((prev) => {
              const next = !prev;
              try { localStorage.setItem('pkh.sidebarCollapsed', String(next)); } catch {}
              return next;
            });
          }}
          listTotal={listTotal}
          tasksCount={tasks.length}
          inboxNewCount={inboxNewCount}
          projectsCount={projects.length}
          goalsCount={goals.length}
          vaultCount={vaultItems.length}
          libraryCount={libraryItems.length}
          filesCount={files.length}
          bookmarksCount={bookmarks.length}
          favoritesCount={favorites.length}
          onOpenCustomizeNav={() => {
            setTempNavConfig(sidebarNav.map((item) => ({ ...item })));
            setCustomizeNavOpen(true);
          }}
          customCategories={customCategories}
          customCategoriesBusy={customCategoriesBusy}
          selectedCustomCategoryId={selectedCustomCategoryId}
          onSelectCustomCategory={selectCustomCategory}
          onOpenCreateCategoryModal={openCreateCategoryModal}
          onOpenEditCategoryModal={openEditCategoryModal}
          onDeleteCategory={handleDeleteCategory}
          customDataTypes={customDataTypes}
          selectedCustomTypeId={selectedCustomTypeId}
          onSelectCustomType={(id) => {
            setSelectedCustomTypeId(id);
            setViewMode('custom-type');
          }}
          onOpenCreateCustomType={() => setIsCreateCustomTypeOpen(true)}
          onStartNewNote={startNewNote}
          onStartNewPerson={startNewPerson}
          onStartNewReminder={() => {
            setViewMode('schedule');
            setMobileDetailOpen(true);
          }}
          onStartNewBookmark={startNewBookmark}
          onUploadFileClick={() => fileInputRef.current?.click()}
          onFileInputChange={(event) => void handleUpload(event)}
          uploadBusy={uploadBusy}
          fileInputRef={fileInputRef}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          renderTaxonomyGroup={renderTaxonomyGroup}
          filterBusy={filterBusy}
          onOpenAbout={() => setAboutModalOpen(true)}
        />

        <div className={`detail-panel${mobileDetailOpen ? ' is-open' : ''}`} aria-label={viewAriaLabel}>
          <div className="detail-mobile-bar">
            <button
              className="button button-quiet detail-back"
              type="button"
              onClick={() => setMobileDetailOpen(false)}
            >
              ← กลับ
            </button>
          </div>
        {diskWarning && (
          <div
            role="alert"
            className="disk-warning-banner"
            style={{
              background: 'var(--pkh-warning-surface, #fffbeb)',
              border: '1px solid var(--pkh-warning, #f59e0b)',
              color: '#92400e',
              padding: '10px 16px',
              margin: '8px 12px 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <span>
                <strong>คำเตือนพื้นที่จัดเก็บข้อมูล:</strong> พื้นที่ดิสก์ของ DATA_DIR ถูกใช้ไปแล้ว {diskWarning.usedPercent}% (เหลือพื้นที่ว่าง {formatBytes(diskWarning.freeBytes)} จาก {formatBytes(diskWarning.totalBytes)}) กรุณาสำรองข้อมูลและเคลียร์พื้นที่
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDiskWarning(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#92400e',
              }}
              title="ปิดการแจ้งเตือน"
            >
              ✕
            </button>
          </div>
        )}
        <ErrorBoundary onReset={() => switchView('home')}>
          <Suspense fallback={<ViewFallback />}>
        {viewMode === 'custom-category' ? (
          <CustomCategoryView
            customCategoryDataBusy={customCategoryDataBusy}
            customCategoryData={customCategoryData}
            customCategoryFilter={customCategoryFilter}
            setCustomCategoryFilter={setCustomCategoryFilter}
            onOpenQuickAdd={() => setQuickAddCatOpen(true)}
            onOpenCreateCategoryModal={openCreateCategoryModal}
            onOpenEditCategoryModal={openEditCategoryModal}
            onDeleteCategory={handleDeleteCategory}
            onSelectCustomCategory={selectCustomCategory}
            onUnlinkCategoryItem={handleUnlinkCategoryItem}
            onOpenNoteById={openNoteById}
            onSwitchView={switchView}
            onSetMediaLightboxFile={setMediaLightboxFile}
            onNavigateCommand={navigateCommand}
          />
        ) : viewMode === 'home' ? (
          <DashboardView
            dashboard={dashboard}
            dashboardBusy={dashboardBusy}
            dashboardError={dashboardError}
            onRefreshDashboard={() => void refreshDashboard()}
            onSwitchView={switchView}
            onOpenNoteById={(id) => void openNoteById(id)}
            onNavigateCommand={navigateCommand}
            onCheckHabitToday={checkHabitToday}
            onToggleTask={toggleTask}
          />
        ) : viewMode === 'inbox' ? (
          <InboxView
            inboxNewCount={inboxNewCount}
            inboxError={inboxError}
            inboxNotice={inboxNotice}
            inboxDraft={inboxDraft}
            setInboxDraft={setInboxDraft}
            onAddInboxItem={addInboxItem}
            inboxBusy={inboxBusy}
            inboxItems={inboxItems}
            onConvertItem={(item, kind) => void convertItem(item, kind)}
            onArchiveInboxItem={(item) => void archiveInboxItem(item)}
            onRemoveInboxItem={(item) => void removeInboxItem(item)}
          />
        ) : viewMode === 'vault' ? (
          <VaultView
            vaultItems={vaultItems}
            activeVault={activeVault}
            vaultDraft={vaultDraft}
            setVaultDraft={setVaultDraft}
            vaultError={vaultError}
            vaultNotice={vaultNotice}
            vaultBusy={vaultBusy}
            vaultQuery={vaultQuery}
            setVaultQuery={setVaultQuery}
            vaultCategory={vaultCategory}
            setVaultCategory={setVaultCategory}
            vaultCustomCatId={vaultCustomCatId}
            setVaultCustomCatId={setVaultCustomCatId}
            customCategories={customCategories}
            onStartNewVaultItem={startNewVaultItem}
            onCopyVaultKey={(item, key) => void copyVaultKey(item, key)}
            onSendVaultItemToReminders={(item) => void sendVaultItemToReminders(item)}
            onSaveVaultItem={saveVaultItem}
            onRemoveVaultItem={(item) => void removeVaultItem(item)}
            onSelectVaultItem={selectVaultItem}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : viewMode === 'library' ? (
          <LibraryView
            libraryItems={libraryItems}
            activeLibrary={activeLibrary}
            libraryDraft={libraryDraft}
            setLibraryDraft={setLibraryDraft}
            libraryError={libraryError}
            libraryNotice={libraryNotice}
            libraryBusy={libraryBusy}
            libraryQuery={libraryQuery}
            setLibraryQuery={setLibraryQuery}
            libraryCategory={libraryCategory}
            setLibraryCategory={setLibraryCategory}
            libraryStatus={libraryStatus}
            setLibraryStatus={setLibraryStatus}
            libraryCustomCatId={libraryCustomCatId}
            setLibraryCustomCatId={setLibraryCustomCatId}
            customCategories={customCategories}
            onStartNewLibraryItem={startNewLibraryItem}
            onSaveLibraryItem={saveLibraryItem}
            onRemoveLibraryItem={(item) => void removeLibraryItem(item)}
            onSelectLibraryItem={selectLibraryItem}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : viewMode === 'tasks' ? (
          <TasksView
            tasks={tasks}
            taskFilter={taskFilter}
            setTaskFilter={setTaskFilter}
            tasksError={tasksError}
            tasksNotice={tasksNotice}
            taskDraft={taskDraft}
            setTaskDraft={setTaskDraft}
            taskDraftCustomCatId={taskDraftCustomCatId}
            setTaskDraftCustomCatId={setTaskDraftCustomCatId}
            customCategories={customCategories}
            projects={projects}
            tasksBusy={tasksBusy}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onRemoveTask={removeTask}
            onUpdateTaskCustomCategory={async (task, catId) => {
              try {
                await setItemCustomCategory('task', task.id, catId);
                pushToast('success', 'อัปเดตหมวดหมู่ของงานแล้ว');
                setRefreshKey((k) => k + 1);
              } catch (err) {
                pushToast('error', errorMessage(err));
              }
            }}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : viewMode === 'projects' ? (
          <ProjectsView
            projects={projects}
            projectDraft={projectDraft}
            setProjectDraft={setProjectDraft}
            goals={goals}
            projectsBusy={projectsBusy}
            projectsError={projectsError}
            projectsNotice={projectsNotice}
            onAddProject={addProject}
            onFinishProject={finishProject}
            onRemoveProject={removeProject}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : viewMode === 'goals' ? (
          <GoalsView
            goals={goals}
            goalDraft={goalDraft}
            setGoalDraft={setGoalDraft}
            goalsBusy={goalsBusy}
            goalsError={goalsError}
            goalsNotice={goalsNotice}
            onAddGoal={addGoal}
            onBumpGoal={bumpGoal}
            onRemoveGoal={removeGoal}
          />
        ) : viewMode === 'people' ? (
          <PeopleView
            people={people}
            activePerson={activePerson}
            peopleQuery={peopleQuery}
            setPeopleQuery={setPeopleQuery}
            peopleGroup={peopleGroup}
            setPeopleGroup={setPeopleGroup}
            personDraft={personDraft}
            setPersonDraft={setPersonDraft}
            personBusy={personBusy}
            personError={personError}
            personNotice={personNotice}
            personAvatarBusy={personAvatarBusy}
            personNotes={personNotes}
            onStartNewPerson={startNewPerson}
            onSelectPerson={selectPerson}
            onSavePerson={savePerson}
            onDeletePerson={deleteActivePerson}
            onAvatarUpload={handlePersonAvatarUpload}
            onCreateReminderForPerson={createReminderForPerson}
            onStartNoteForPerson={startNoteForPerson}
            onOpenPersonNote={(note) => {
              setViewMode('notes');
              activateNote(note);
              isNewNoteRef.current = true;
            }}
            onSwitchView={switchView}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
            tags={tags}
            filterTagId={filterTagIds[0] || null}
            onSelectTagFilter={(id) => setFilterTagIds(id ? [id] : [])}
          />
        ) : viewMode === 'schedule' ? (
          <HabitsView
            scheduleDate={scheduleDate}
            scheduleBusy={scheduleBusy}
            scheduleError={scheduleError}
            scheduleNotice={scheduleNotice}
            reminders={reminders}
            reminderDraft={reminderDraft}
            setReminderDraft={setReminderDraft}
            people={people}
            tasks={tasks}
            onAddReminder={addReminder}
            onToggleReminder={toggleReminder}
            onSnoozeReminder={snooze}
            onRemoveReminder={removeReminder}
            timeblocks={timeblocks}
            blockDraft={blockDraft}
            setBlockDraft={setBlockDraft}
            onAddTimeblock={addTimeblock}
            onToggleTimeblock={toggleTimeblock}
            onRemoveTimeblock={removeTimeblock}
            habits={habits}
            habitWeek={habitWeek}
            habitDraft={habitDraft}
            setHabitDraft={setHabitDraft}
            onAddHabit={addHabit}
            onCheckHabitToday={checkHabitToday}
            onCorrectHabitDay={correctHabitDay}
            onRemoveHabit={removeHabit}
            onSwitchView={switchView}
          />
        ) : viewMode === 'notes' ? (
          <NotesViewComponent
            noteViewMode={noteViewMode}
            setNoteViewMode={setNoteViewMode}
            activeNote={activeNote}
            setActiveNote={setActiveNote}
            listTotal={listTotal}
            onStartNewNote={() => {
              startNewNote();
              setNoteViewMode('editor');
            }}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            shortSearch={shortSearch}
            setPage={setPage}
            setNotesError={setNotesError}
            onClearSearch={clearSearch}
            notesBusy={notesBusy}
            notesError={notesError}
            notice={notice}
            filteredNotes={filteredNotes}
            onSelectNote={(note) => {
              selectNote(note);
              setNoteViewMode('editor');
            }}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onMoveToTrash={moveToTrash}
            page={page}
            pageCount={pageCount}
            sidebarBusy={sidebarBusy}
            searchSettling={searchSettling}
            markListBusy={markListBusy}
            noteFavorited={noteFavorited}
            favoriteBusy={favoriteBusy}
            saveBusy={saveBusy}
            saveState={saveState}
            noteMenuOpen={noteMenuOpen}
            setNoteMenuOpen={setNoteMenuOpen}
            onDelete={handleDelete}
            focusMode={focusMode}
            setFocusMode={setFocusMode}
            onFlushAutosave={flushAutosave}
            taxonomyRelationsBusy={taxonomyRelationsBusy}
            taxonomyRelationsUnavailable={taxonomyRelationsUnavailable}
            taxonomyError={taxonomyError}
            taxonomyNotice={taxonomyNotice}
            onSave={handleSave}
            title={title}
            setTitle={setTitle}
            selectedCategoryNames={selectedCategoryNames}
            selectedTagNames={selectedTagNames}
            selectedPeople={selectedPeople}
            onToggleRelation={toggleRelation}
            onTagCreated={(newTag) => setTags((prev) => prev.some((t) => t.id === newTag.id) ? prev : [...prev, newTag])}
            onCategoryCreated={(newCat) => setCategories((prev) => prev.some((c) => c.id === newCat.id) ? prev : [...prev, newCat])}
            setSelectedPersonIds={setSelectedPersonIds}
            chipPicker={chipPicker}
            setChipPicker={setChipPicker}
            personPickerOpen={personPickerOpen}
            setPersonPickerOpen={setPersonPickerOpen}
            activeNoteCustomCatId={activeNoteCustomCatId}
            onNoteCustomCatChange={async (newCatId) => {
              if (!activeNote) return;
              try {
                await setItemCustomCategory('note', activeNote.id, newCatId);
                setActiveNoteCustomCatId(newCatId);
                pushToast('success', 'อัปเดตหมวดหมู่ของโน้ตแล้ว');
                setRefreshKey((k) => k + 1);
              } catch (err) {
                pushToast('error', errorMessage(err));
              }
            }}
            customCategories={customCategories}
            categories={categories}
            tags={tags}
            people={people}
            selectedPersonIds={selectedPersonIds}
            onRetryTaxonomyLoad={retryTaxonomyLoad}
            content={content}
            setContent={setContent}
            files={files}
            onFilesChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : viewMode === 'bookmarks' ? (
          <BookmarksView
            bookmarks={bookmarks}
            activeBookmark={activeBookmark}
            setActiveBookmark={setActiveBookmark}
            onStartNewBookmark={startNewBookmark}
            bookmarkTitle={bookmarkTitle}
            setBookmarkTitle={setBookmarkTitle}
            bookmarkUrl={bookmarkUrl}
            setBookmarkUrl={setBookmarkUrl}
            bookmarkDescription={bookmarkDescription}
            setBookmarkDescription={setBookmarkDescription}
            bookmarkCategory={bookmarkCategory}
            setBookmarkCategory={setBookmarkCategory}
            bookmarkFavorited={bookmarkFavorited}
            saveBusy={saveBusy}
            favoriteBusy={favoriteBusy}
            notesError={notesError}
            notice={notice}
            onToggleFavorite={toggleFavorite}
            onDeleteBookmark={handleDeleteBookmark}
            onDeleteBookmarkById={handleDeleteBookmarkById}
            onSaveBookmark={handleSaveBookmark}
            activeBookmarkCustomCatId={activeBookmarkCustomCatId}
            onBookmarkCustomCatChange={async (newCatId) => {
              if (!activeBookmark) return;
              try {
                await setItemCustomCategory('bookmark', activeBookmark.id, newCatId);
                setActiveBookmarkCustomCatId(newCatId);
                pushToast('success', 'อัปเดตหมวดหมู่ของบุ๊กมาร์กแล้ว');
                setRefreshKey((k) => k + 1);
              } catch (err) {
                pushToast('error', errorMessage(err));
              }
            }}
            customCategories={customCategories}
            onSelectBookmark={(bm) => {
              isNewBookmarkRef.current = false;
              setActiveBookmark(bm);
              setBookmarkTitle(bm.title);
              setBookmarkUrl(bm.url);
              setBookmarkDescription(bm.description || '');
              setBookmarkCategory(bm.category || '📦 อื่นๆ');
              setActiveBookmarkCustomCatId((bm as any).customCategoryId || null);
            }}
          />
        ) : viewMode === 'favorites' ? (
          <FavoritesView
            favorites={favorites}
            activeFavorite={activeFavorite}
            setActiveFavorite={setActiveFavorite}
            onOpenFavorite={openFavorite}
            onToggleFavorite={toggleFavorite}
            favoriteBusy={favoriteBusy}
            notesError={notesError}
            notice={notice}
            viewTitle={viewTitle}
            listLength={listLength}
            allEntries={allEntries}
            onSelectAllEntry={selectAllEntry}
          />
        ) : viewMode === 'files' ? (
          <FilesView
            files={files}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            onSetMediaLightboxFile={setMediaLightboxFile}
            onDeleteFile={handleDeleteFile}
            notesError={notesError}
            notice={notice}
            onUploadFiles={handleUpload}
            fileCustomCatId={fileCustomCatId}
            onFileCustomCatChange={async (newCatId) => {
              if (!activeFile) return;
              try {
                await setItemCustomCategory('file', activeFile.id, newCatId);
                setFileCustomCatId(newCatId);
                pushToast('success', 'อัปเดตหมวดหมู่ของไฟล์แล้ว');
                setRefreshKey((k) => k + 1);
              } catch (err) {
                pushToast('error', errorMessage(err));
              }
            }}
            customCategories={customCategories}
            onUploadSuccess={(uploaded) => {
              setFiles((prev) => [uploaded, ...prev]);
              setNotice(`อัปโหลด "${uploaded.displayName}" สำเร็จ`);
              pushToast('success', `อัปโหลด "${uploaded.displayName}" สำเร็จ`);
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : viewMode === 'watchlist' ? (
          <WatchlistView />
        ) : viewMode === 'shopping' ? (
          <ShoppingView />
        ) : viewMode === 'travel' ? (
          <TravelView />
        ) : viewMode === 'help-support' ? (
          <HelpSupportView onBackToHome={() => setViewMode('home')} />
        ) : viewMode === 'custom-type' ? (
          (customDataTypes.find((t) => t.id === selectedCustomTypeId) || customDataTypes[0]) ? (
            <CustomRecordsView
              customType={customDataTypes.find((t) => t.id === selectedCustomTypeId) || customDataTypes[0]}
              onTypeUpdated={(updated) => {
                setCustomDataTypes((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
              }}
              onTypeDeleted={(delId) => {
                setCustomDataTypes((prev) => prev.filter((t) => t.id !== delId));
                setSelectedCustomTypeId(null);
                setViewMode('home');
              }}
              onBackToHome={() => setViewMode('home')}
            />
          ) : (
            <section className="life-view-container">
              <div style={{ padding: '36px', textAlign: 'center' }}>
                <p>ยังไม่มีประเภทข้อมูลที่สร้างไว้</p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setIsCreateCustomTypeOpen(true)}
                >
                  ＋ ออกแบบประเภทข้อมูลใหม่
                </button>
              </div>
            </section>
          )
        ) : viewMode === 'admin' ? (
          <AdminView
            currentUser={user}
            onUserUpdated={(updatedUser) => {
              setUser(updatedUser);
              pushToast('success', 'อัปเดตข้อมูลผู้ใช้เรียบร้อย');
            }}
            onSettingsUpdated={(newSettings) => {
              setPublicSettings({
                app_title: newSettings.app_title,
                app_subtitle: newSettings.app_subtitle,
                app_logo: newSettings.app_logo,
                default_theme: newSettings.default_theme,
                modules_config: newSettings.modules_config,
              });
              document.title = newSettings.app_title;
              setSidebarNav(loadSidebarNav(newSettings.modules_config));
              pushToast('success', 'อัปเดตการตั้งค่าระบบและโมดูลเรียบร้อย');
            }}
            onBackToWorkspace={() => setViewMode('home')}
          />
        ) : (
          <TrashView
            viewMode={viewMode === 'all' ? 'all' : 'trash'}
            onRefreshWorkspace={() => setRefreshKey((k) => k + 1)}
          />
        )}
        </Suspense>
        </ErrorBoundary>
        </div>
      </div>

      <Suspense fallback={null}>
      {/* Theme Modal */}
      <ThemeModal
        isOpen={themeOpen}
        onClose={() => setThemeOpen(false)}
        userUid={user?.id}
        theme={theme}
        onSelectTheme={setTheme}
        themeMode={themeMode}
        onSelectThemeMode={setThemeMode}
        themes={themes}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        setProfile={setProfile}
        user={user}
        onSaveProfile={saveProfile}
        onUploadAvatar={handleProfileAvatarUpload}
        onOpenAdmin={() => {
          setViewMode('admin');
          setMobileDetailOpen(true);
        }}
        postSaveBehavior={postSaveBehavior}
        onSetPostSaveBehavior={handleSetPostSaveBehavior}
      />

      {isCreateCustomTypeOpen && (
        <CustomTypeBuilderModal
          isOpen={isCreateCustomTypeOpen}
          onClose={() => setIsCreateCustomTypeOpen(false)}
          onSaved={(newType) => {
            setCustomDataTypes((prev) => [...prev, newType]);
            setSelectedCustomTypeId(newType.id);
            setViewMode('custom-type');
            pushToast('success', `สร้างประเภทข้อมูล "${newType.name}" เรียบร้อยแล้ว`);
          }}
        />
      )}

      {/* Global Search Modal */}
      <CommandSearchModal
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
        query={commandQuery}
        onQueryChange={(next) => {
          setCommandQuery(next);
          setCommandError('');
          setCommandResults(null);
          setCommandBusy(Boolean(next.trim()) && !(commandFrom && commandTo && commandFrom > commandTo));
        }}
        types={commandTypes}
        onToggleType={toggleCommandType}
        onResetFilters={resetCommandFilters}
        from={commandFrom}
        onFromChange={(nextFrom) => {
          setCommandFrom(nextFrom);
          setCommandError('');
          if (commandQuery.trim() && !(nextFrom && commandTo && nextFrom > commandTo)) {
            setCommandBusy(true);
          } else {
            setCommandBusy(false);
          }
        }}
        to={commandTo}
        onToChange={(nextTo) => {
          setCommandTo(nextTo);
          setCommandError('');
          if (commandQuery.trim() && !(commandFrom && nextTo && commandFrom > nextTo)) {
            setCommandBusy(true);
          } else {
            setCommandBusy(false);
          }
        }}
        isBusy={commandBusy}
        error={commandError}
        results={commandResults}
        onNavigate={navigateCommand}
        customCategories={customCategories}
      />

      {/* Toast Notification Stack */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Permanent Delete Modal */}
      <PermanentDeleteModal
        isOpen={permanentDeleteOpen && Boolean(activeTrashNote)}
        onClose={() => setPermanentDeleteOpen(false)}
        note={activeTrashNote}
        onConfirm={handlePermanentDelete}
        isBusy={saveBusy}
        error={notesError}
      />

      {/* Customize Sidebar Modal */}
      <SidebarNavModal
        isOpen={customizeNavOpen}
        onClose={() => setCustomizeNavOpen(false)}
        tempNavConfig={tempNavConfig}
        onToggleNavItem={toggleNavItem}
        onUpdateNavItemLabel={updateNavItemLabel}
        onMoveNavItem={moveNavItem}
        onResetNavConfig={handleResetNavConfig}
        onSaveNavConfig={handleSaveNavConfig}
      />

      {/* Custom Category Create/Edit Modal */}
      <CategoryModal
        modalState={categoryModal}
        onClose={() => setCategoryModal(null)}
        draft={categoryDraft}
        setDraft={setCategoryDraft}
        customCategories={customCategories}
        isBusy={categoryModalBusy}
        error={categoryModalError}
        onSave={handleSaveCategory}
      />

      {/* Quick Add into Category Modal */}
      <QuickAddCategoryModal
        isOpen={quickAddCatOpen && Boolean(selectedCustomCategoryId)}
        onClose={() => setQuickAddCatOpen(false)}
        selectedCustomCategoryId={selectedCustomCategoryId}
        customCategoryData={customCategoryData}
        quickAddType={quickAddType}
        setQuickAddType={setQuickAddType}
        attachSearchQuery={attachSearchQuery}
        setAttachSearchQuery={setAttachSearchQuery}
        attachTypeFilter={attachTypeFilter}
        setAttachTypeFilter={setAttachTypeFilter}
        notes={notes}
        tasks={tasks}
        bookmarks={bookmarks}
        files={files}
        vaultItems={vaultItems}
        libraryItems={libraryItems}
        attachBusyId={attachBusyId}
        onLinkExistingItem={handleLinkExistingItem}
        quickAddBusy={quickAddBusy}
        onQuickAddSubmit={handleQuickAddIntoCategory}
        catUploadFile={catUploadFile}
        setCatUploadFile={setCatUploadFile}
        quickAddTitle={quickAddTitle}
        setQuickAddTitle={setQuickAddTitle}
        quickAddContentOrUrl={quickAddContentOrUrl}
        setQuickAddContentOrUrl={setQuickAddContentOrUrl}
        quickAddVaultCategory={quickAddVaultCategory}
        setQuickAddVaultCategory={setQuickAddVaultCategory}
        quickAddVaultKey={quickAddVaultKey}
        setQuickAddVaultKey={setQuickAddVaultKey}
        quickAddVaultLocation={quickAddVaultLocation}
        setQuickAddVaultLocation={setQuickAddVaultLocation}
        quickAddVaultExpiry={quickAddVaultExpiry}
        setQuickAddVaultExpiry={setQuickAddVaultExpiry}
        quickAddVaultAmount={quickAddVaultAmount}
        setQuickAddVaultAmount={setQuickAddVaultAmount}
        quickAddLibraryCategory={quickAddLibraryCategory}
        setQuickAddLibraryCategory={setQuickAddLibraryCategory}
        quickAddLibraryStatus={quickAddLibraryStatus}
        setQuickAddLibraryStatus={setQuickAddLibraryStatus}
        quickAddLibrarySource={quickAddLibrarySource}
        setQuickAddLibrarySource={setQuickAddLibrarySource}
      />

      {/* Media Lightbox Player Modal */}
      {mediaLightboxFile && (
        <MediaLightbox
          file={mediaLightboxFile}
          onClose={() => setMediaLightboxFile(null)}
        />
      )}

      {/* About System Modal */}
      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
      />
      </Suspense>

      {/* Mobile Bottom Navigation & Quick Capture FAB (<= 768px) */}
      <MobileBottomNav
        viewMode={viewMode}
        onSwitchView={switchView}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onQuickNewNote={() => {
          startNewNote();
          setViewMode('notes');
        }}
        inboxCount={inboxNewCount}
        tasksCount={tasks.length}
      />
    </main>
  );
}

export default App;
