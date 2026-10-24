import { useEffect, useRef, useState, useCallback, lazy, Suspense, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  checkHealth,
  type HealthDiskInfo,
  addFavorite,
  checkHabit,
  convertInboxItem,
  createGoal,
  createInboxItem,
  createPerson,
  createProject,
  createTask,
  createReminder,
  createTimeblock,
  deleteBookmark,
  deleteGoal,
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
  getNote,
  getNoteTaxonomy,
  getPersonNotes,
  listCategories,
  listGoals,
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
  fetchCustomTypes,
  type CustomDataType,
  updateUserProfile,
} from './api';
import {
  type NotesView,
  type SidebarNavItem,
  loadSidebarNav,
  saveSidebarNav,
  resetSidebarNav,
} from './sidebarNav';
import { logger } from './lib/logger';
import { emitDataRefresh, subscribeDataRefresh } from './lib/dataRefresh';
import { registerDraftFlush, setDraftPending } from './lib/updateGuard';
import './App.css';

import type {
  AuthState,
  ThemeConfig,
  ThemeMode,
  UiMode,
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
import type { User as FirebaseUser } from 'firebase/auth';
import {
  applyThemeConfig,
  loadThemeConfig,
  normalizeThemeConfig,
  saveThemeConfig,
} from './lib/theme';

// Code-split feature views and heavy modals via React.lazy
const MediaLightbox = lazy(() => import('./components/MediaLightbox').then((m) => ({ default: m.MediaLightbox })));
const ThemeModal = lazy(() => import('./features/settings/ThemeModal').then((m) => ({ default: m.ThemeModal })));
const ProfileModal = lazy(() => import('./features/settings/ProfileModal').then((m) => ({ default: m.ProfileModal })));
const FirebaseSetupModal = lazy(() => import('./features/settings/FirebaseSetupModal').then((m) => ({ default: m.FirebaseSetupModal })));
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
const TrashView = lazy(() => import('./features/trash/TrashView').then((m) => ({ default: m.TrashView })));
const AdminView = lazy(() => import('./features/admin/AdminView').then((m) => ({ default: m.AdminView })));
const WatchlistView = lazy(() => import('./features/lifestyle/WatchlistView').then((m) => ({ default: m.WatchlistView })));
const ShoppingView = lazy(() => import('./features/lifestyle/ShoppingView').then((m) => ({ default: m.ShoppingView })));
const TravelView = lazy(() => import('./features/lifestyle/TravelView').then((m) => ({ default: m.TravelView })));
const CustomRecordsView = lazy(() => import('./features/custom-types/CustomRecordsView').then((m) => ({ default: m.CustomRecordsView })));
const CustomTypeBuilderModal = lazy(() => import('./features/custom-types/CustomTypeBuilderModal').then((m) => ({ default: m.CustomTypeBuilderModal })));

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
  const [_filesTotal, setFilesTotal] = useState(0);
  const [_filesBusy, setFilesBusy] = useState(false);
  const [activeFile, setActiveFile] = useState<StoredFile | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Firebase Authentication & Serverless States
  const [firebaseSetupOpen, setFirebaseSetupOpen] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
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
  const [_fileCustomCatId, setFileCustomCatId] = useState<string | null>(null);
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
  /** Latest `flushAutosave` closure, so the update prompt can always save the current draft. */
  const flushDraftImpl = useRef<() => Promise<void>>(async () => {});
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
  // One config object replaces the old theme/effect state soup.
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => loadThemeConfig());
  const themeRef = useRef<ThemeConfig>(themeConfig);
  themeRef.current = themeConfig;
  const themeMode: ThemeMode = themeConfig.mode;
  const uiMode: UiMode = themeConfig.uiMode;
  const accentColor = themeConfig.accentColor;
  const updateTheme = useCallback((patch: Partial<ThemeConfig>) => {
    const next = normalizeThemeConfig({ ...themeRef.current, ...patch });
    themeRef.current = next;
    setThemeConfig(next);
    void saveThemeConfig(next, firebaseUser?.uid);
  }, [firebaseUser?.uid]);
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
  const queryClient = useQueryClient();
  /**
   * Single refresh entry point. TanStack Query refetches its own cache and the
   * remaining effect-driven loaders are notified through the refresh bus, so a
   * save can never miss a screen.
   */
  const refreshAllData = useCallback(() => {
    void queryClient.invalidateQueries();
    emitDataRefresh();
  }, [queryClient]);
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
      if (!(error instanceof ApiError && error.status === 401)) {
        logger.warn('Initial session check failed', 'app.session', { error });
      }
      setAuthState('signed-out');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      setCustomCategoriesBusy(true);
      listCustomCategories()
        .then((cats) => {
          if (active) setCustomCategories(cats);
        })
        .catch((err) => {
          if (active) logger.error('Error loading custom categories', err, 'app.categories');
        })
        .finally(() => {
          if (active) setCustomCategoriesBusy(false);
        });

      fetchCustomTypes()
        .then((types) => {
          if (active) setCustomDataTypes(types);
        })
        .catch((err) => {
          if (active) logger.error('Error loading custom types', err, 'app.customTypes');
        });
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'custom-category' || !selectedCustomCategoryId) return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState, viewMode, selectedCustomCategoryId]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState]);

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
  }, [quickAddCatOpen, authState, files.length, vaultItems.length, libraryItems.length, bookmarks.length]);

  useEffect(() => {
    if (!activeNoteId) {
      setActiveNoteCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('note', activeNoteId)
      .then((catId) => {
        if (active) setActiveNoteCustomCatId(catId);
      })
      .catch(() => {
        if (active) setActiveNoteCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeNoteId]);

  useEffect(() => {
    if (!activeBookmarkId) {
      setActiveBookmarkCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('bookmark', activeBookmarkId)
      .then((catId) => {
        if (active) setActiveBookmarkCustomCatId(catId);
      })
      .catch(() => {
        if (active) setActiveBookmarkCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeBookmarkId]);

  const activeVaultId = activeVault?.id ?? null;
  useEffect(() => {
    if (!activeVaultId) {
      setVaultCustomCatId('');
      return;
    }
    let active = true;
    getItemCustomCategory('vault', activeVaultId)
      .then((catId) => {
        if (active) setVaultCustomCatId(catId || '');
      })
      .catch(() => {
        if (active) setVaultCustomCatId('');
      });
    return () => {
      active = false;
    };
  }, [activeVaultId]);

  const activeLibraryId = activeLibrary?.id ?? null;
  useEffect(() => {
    if (!activeLibraryId) {
      setLibraryCustomCatId('');
      return;
    }
    let active = true;
    getItemCustomCategory('library', activeLibraryId)
      .then((catId) => {
        if (active) setLibraryCustomCatId(catId || '');
      })
      .catch(() => {
        if (active) setLibraryCustomCatId('');
      });
    return () => {
      active = false;
    };
  }, [activeLibraryId]);

  const activeFileId = activeFile?.id ?? null;
  useEffect(() => {
    if (!activeFileId) {
      setFileCustomCatId(null);
      return;
    }
    let active = true;
    getItemCustomCategory('file', activeFileId)
      .then((catId) => {
        if (active) setFileCustomCatId(catId);
      })
      .catch(() => {
        if (active) setFileCustomCatId(null);
      });
    return () => {
      active = false;
    };
  }, [activeFileId]);

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
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      getFavoriteStatus('note', activeNoteId).then((res) => {
        if (active) setNoteFavoriteState({ id: activeNoteId, favorited: res.favorited });
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [activeNoteId, authState, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'bookmarks' || !activeBookmarkId) return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      getFavoriteStatus('bookmark', activeBookmarkId).then((res) => {
        if (active) setBookmarkFavoriteState({ id: activeBookmarkId, favorited: res.favorited });
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [activeBookmarkId, authState, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    if (viewMode !== 'favorites') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      const requestId = ++notesRequestId.current;
      listFavorites(page).then((result) => {
        if (!active || requestId !== notesRequestId.current) return;
        setFavorites(result.favorites);
        setFavoritesTotal(result.total);
        setActiveFavorite((current) => (
          result.favorites.find((item) => item.itemType === current?.itemType && item.itemId === current?.itemId)
          ?? result.favorites[0]
          ?? null
        ));
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState, page, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'all') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState, viewMode]);

  useEffect(() => {
    const hasFilters = filterCategoryIds.length > 0 || filterTagIds.length > 0;
    if (authState !== 'signed-in' || viewMode !== 'notes' || !hasFilters || notes.length === 0) return;
    // Taxonomy ids are denormalised on each note document, so filtering no longer
    // issues one request per note (the old N+1 path).
    const entries = notes.map((note) => [
      note.id,
      {
        categoryIds: note.categoryIds ?? [],
        tagIds: note.tagIds ?? [],
      },
    ] as const);
    setNoteTaxonomyMap(Object.fromEntries(entries));
    setFilterBusy(false);
  }, [authState, filterCategoryIds, filterTagIds, notes, viewMode]);

  useEffect(() => {
    applyThemeConfig(themeConfig);
  }, [themeConfig]);

  // Sync theme from Firestore on initial login / cross-device change.
  // Only accept values that differ, so a snapshot cannot echo back into a save loop.
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const { subscribeUserTheme } = await import('./lib/firestore-db');
      if (!active) return;
      unsubscribe = subscribeUserTheme(firebaseUser.uid, (remoteTheme) => {
        if (!remoteTheme) return;
        const current = themeRef.current;
        const next = normalizeThemeConfig({
          mode: (remoteTheme.themeMode as ThemeMode | undefined) ?? current.mode,
          uiMode: (remoteTheme.uiMode as UiMode | undefined) ?? current.uiMode,
          accentColor: remoteTheme.accentColor ?? current.accentColor,
        });
        if (
          next.mode === current.mode
          && next.uiMode === current.uiMode
          && next.accentColor === current.accentColor
        ) {
          return;
        }
        themeRef.current = next;
        setThemeConfig(next);
      });
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      Promise.all([
        listPeople(1, 100),
        listReminders(),
        listUpcomingReminders(60),
        listTimeblocks(localToday()),
        listFiles(1, 100),
      ]).then(([peoplePage, reminderList, upcoming, blocks, filePage]) => {
        if (!active) return;
        setPeople(peoplePage.people);
        setReminders(reminderList);
        setUpcomingReminders(upcoming);
        void getNotifications().then((res) => {
          if (!active) return;
          setNotificationsList(res.notifications);
          setNotificationsUnreadCount(res.unreadCount);
        }).catch(() => undefined);
        setTodayBlocks(blocks);
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState]);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState, taskFilter]);

  // Vault and library are only fetched while their own view is open, so switching tabs does not
  // add two more requests to every other screen. The short timer keeps typing from firing per key.
  useEffect(() => {
    if (authState !== 'signed-in') return;
    if (viewMode !== 'vault' && viewMode !== 'library') return;
    let cancelCurrent = () => {};
    // A debounce timer that survives refreshes: each load() replaces the pending one.
    let timer = 0;
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
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
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [
    authState, viewMode,
    vaultCategory, vaultQuery, libraryCategory, libraryStatus, libraryQuery,
  ]);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', authState],
    enabled: authState === 'signed-in' && viewMode === 'home',
    queryFn: getDashboard,
  });

  useEffect(() => {
    if (!dashboardQuery.data) return;
    setDashboard(dashboardQuery.data);
    setDashboardError('');
    setDashboardBusy(false);
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (!dashboardQuery.error) return;
    setDashboardError(errorMessage(dashboardQuery.error));
    setDashboardBusy(false);
  }, [dashboardQuery.error]);


  // Autosave only applies to notes that already exist on the server: a brand-new note is still
  // created by the explicit save button, so autosave can never spawn empty notes.
  const noteDirty = Boolean(activeNote && (title !== activeNote.title || content !== activeNote.content));

  useEffect(() => {
    if (authState !== 'signed-in' || !activeNote) return;
    if (!noteDirty) {
      autosaveRef.current = null;
      return;
    }
    autosaveRef.current = { noteId: activeNote.id, title, content };
    const timer = window.setTimeout(() => {
      void flushDraftImpl.current();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [authState, activeNote, noteDirty, title, content]);

  // Keep the "save now" hook pointing at the newest closure without re-registering.
  useEffect(() => {
    flushDraftImpl.current = flushAutosave;
  });

  // The update prompt asks before reloading and writes any pending draft first.
  useEffect(() => {
    setDraftPending(noteDirty);
    return () => setDraftPending(false);
  }, [noteDirty]);

  useEffect(() => registerDraftFlush(() => flushDraftImpl.current()), []);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    // Each run supersedes the previous one, so a slow response can never
    // overwrite the result of a newer refresh.
    let cancelCurrent = () => {};
    const load = () => {
      cancelCurrent();
      let active = true;
      cancelCurrent = () => {
        active = false;
      };
      listTimeblocks(scheduleDate).then((blocks) => {
        if (active) setTimeblocks(blocks);
      }).catch(() => undefined).finally(() => {
        if (active) setScheduleBusy(false);
      });
    };
    load();
    const unsubscribe = subscribeDataRefresh(load);
    return () => {
      cancelCurrent();
      unsubscribe();
    };
  }, [authState, scheduleDate]);

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

  // Notes, bookmarks and trash share one query because only one of them is visible at a time.
  // TanStack Query owns the request lifecycle, so switching views or saving only refetches the
  // active key instead of replaying every loader in the tree.
  const notesListQuery = useQuery({
    queryKey: ['notes-list', authState, viewMode, page, searchQuery],
    enabled: authState === 'signed-in' && !searchSettling && viewMode !== 'favorites',
    queryFn: async () => {
      if (viewMode === 'trash') {
        const result = await listTrash(page);
        return { mode: 'trash' as const, total: result.total, notes: result.notes, bookmarks: null };
      }
      if (viewMode === 'bookmarks') {
        const result = await listBookmarks(page);
        return { mode: 'bookmarks' as const, total: result.total, notes: null, bookmarks: result.bookmarks };
      }
      if (searchQuery) {
        const result = await searchNotes(searchQuery, page);
        return { mode: 'notes' as const, total: result.total, notes: result.notes, bookmarks: null };
      }
      const result = await listNotes(page);
      return { mode: 'notes' as const, total: result.total, notes: result.notes, bookmarks: null };
    },
  });

  useEffect(() => {
    const result = notesListQuery.data;
    if (!result) return;
    const visibleNotes = result.bookmarks
      ? result.bookmarks.map((bookmark) => ({
        id: bookmark.id,
        title: bookmark.title,
        content: bookmark.url,
        createdAt: bookmark.createdAt,
        updatedAt: bookmark.updatedAt,
      }))
      : result.notes ?? [];
    if (result.bookmarks) setBookmarks(result.bookmarks);
    setNotes(visibleNotes);
    setTotal(result.total);
    setNotesBusy(false);
    if (result.mode === 'trash') return;
    if (result.mode === 'bookmarks') {
      const bookmarkList = result.bookmarks ?? [];
      if (isNewBookmarkRef.current) return;
      const selected = bookmarkList.find((bookmark) => bookmark.id === activeBookmark?.id)
        ?? bookmarkList[0]
        ?? null;
      if (!activeBookmark || !bookmarkList.some((bookmark) => bookmark.id === activeBookmark.id)) {
        setBookmarkTitle(selected?.title ?? '');
        setBookmarkUrl(selected?.url ?? '');
        setBookmarkDescription(selected?.description ?? '');
      }
      setActiveBookmark(selected);
      return;
    }
    const noteList = result.notes ?? [];
    if (isNewNoteRef.current) return;
    const current = activeNoteRef.current;
    const selected = noteList.find((note) => note.id === current?.id) ?? noteList[0] ?? null;
    if (!current || !noteList.some((note) => note.id === current.id)) {
      setTitle(selected?.title ?? '');
      setContent(selected?.content ?? '');
    }
    activateNote(selected);
    // activateNote is a stable local function; depending on it would re-run this sync every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookmark, notesListQuery.data, viewMode]);

  useEffect(() => {
    const error = notesListQuery.error;
    if (!error) return;
    setNotesBusy(false);
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      setAuthState('signed-out');
      setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    } else {
      setNotesError(errorMessage(error));
    }
  }, [notesListQuery.error]);


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

  // Firebase Auth State Listener & Email Link Sign-in Check.
  // Auth is a separate lazy chunk: the shell paints before the SDK is parsed.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const {
        firebaseAuth,
        onAuthStateChanged,
        isSignInWithEmailLink,
        signInWithEmailLink,
      } = await import('./lib/firebaseAuth');
      if (!active || !firebaseAuth) return;

      unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setFirebaseUser(user);
          setUser({
            id: user.uid,
            username: user.email || user.phoneNumber || 'User',
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            role: 'user',
          });
          setAuthState('signed-in');
          setNotesBusy(false);
        } else {
          setFirebaseUser(null);
        }
      });

      try {
        if (isSignInWithEmailLink(firebaseAuth, window.location.href)) {
          let email = window.localStorage.getItem('pkh.emailForSignIn');
          if (!email) {
            email = window.prompt('กรุณายืนยันอีเมลของคุณสำหรับการเข้าสู่ระบบ:');
          }
          if (email) {
            signInWithEmailLink(firebaseAuth, email, window.location.href)
              .then(() => {
                window.localStorage.removeItem('pkh.emailForSignIn');
                pushToast('success', 'เข้าสู่ระบบด้วยลิงก์อีเมลสำเร็จ');
              })
              .catch((err) => {
                logger.error('Email link sign in failed', err, 'app.auth');
              });
          }
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  // Sync with Firestore Real-time Collections when Firebase user is active.
  // Firestore is loaded only after there is a uid, never at boot.
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let active = true;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const { subscribeUserLinks, subscribeUserDataCards } = await import('./lib/firestore-db');
      if (!active) return;

      const unsubLinks = subscribeUserLinks(firebaseUser.uid, (fbLinks) => {
        if (fbLinks && fbLinks.length > 0) {
          setBookmarks(fbLinks.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            description: l.description || '',
            category: l.category,
            tags: l.tags || [],
            isFavorite: l.isFavorite,
            createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now(),
            updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : Date.now(),
          })));
        }
      });

      const unsubCards = subscribeUserDataCards(firebaseUser.uid, (fbCards) => {
        if (fbCards && fbCards.length > 0) {
          setNotes(fbCards.map((c) => ({
            id: c.id,
            title: c.title,
            content: c.content,
            createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
            updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
          })));
        }
      });

      cleanup = () => {
        unsubLinks();
        unsubCards();
      };
    })();

    return () => {
      active = false;
      cleanup?.();
    };
  }, [firebaseUser?.uid]);

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
      refreshAllData();
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
      refreshAllData();
      refreshAllData();
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
    } else if (entry.kind === 'file') {
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function checkHabitToday(habit: Habit) {
    try {
      await checkHabit(habit.id, localToday());
      pushToast('success', `เช็กอิน “${habit.title}” สำเร็จ! 🔥`);
      refreshAllData();
    } catch (error) {
      setScheduleError(errorMessage(error));
    }
  }

  async function refreshDashboard() {
    setDashboardBusy(true);
    refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
    } catch (error) {
      setGoalsError(errorMessage(error));
    } finally {
      setGoalsBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // localStorage stays as the offline cache the UI reads on boot, but the
    // profile must also reach Firestore: saving only locally meant every edit
    // was lost on the next device (or the next cache clear).
    const payload = {
      displayName: profile.name,
      bio: profile.bio,
      dailyStatus: profile.status,
      email: profile.email,
      phone: profile.phone,
      avatarDataUrl: profile.avatarDataUrl,
    };
    try {
      await updateUserProfile(payload);
      localStorage.setItem('pkh.profile', JSON.stringify(profile));
      setProfileOpen(false);
      pushToast('success', 'บันทึกข้อมูลส่วนตัวแล้ว');
    } catch (error) {
      setNotesError(errorMessage(error));
      pushToast('error', 'บันทึกข้อมูลส่วนตัวไม่สำเร็จ');
    }
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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
      refreshAllData();
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

  async function moveToTrash(note: Note) {
    if (!window.confirm('ย้ายโน้ตนี้ไปถังขยะหรือไม่? เนื้อหาจะยังถูกเก็บไว้')) return;
    setNotesBusy(true);
    try {
      await deleteNote(note.id);
      if (activeNote?.id === note.id) activateNote(null);
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else refreshAllData();
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
      else refreshAllData();
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
      refreshAllData();
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
      else refreshAllData();
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

  if (authState !== 'signed-in') {
    return (
      <main className="center-state login-background">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">🧠</div>
          <span className="eyebrow">PERSONAL LIFE OS</span>
          <h1>เข้าสู่ระบบ</h1>
          <p className="muted">เข้าสู่ระบบเพื่อเปิดพื้นที่จัดเก็บความรู้ส่วนตัวของคุณ</p>

          <form className="login-form" onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="username" style={{ fontSize: '13px', fontWeight: 600 }}>ชื่อผู้ใช้งาน (Username)</label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="เช่น phontakon"
                required
                maxLength={80}
                autoFocus
                style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 600 }}>รหัสผ่าน (Password)</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="กรอกรหัสผ่าน"
                required
                maxLength={1024}
                style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)' }}
              />
            </div>

            {authError && <p className="form-error" role="alert" style={{ margin: '4px 0', color: '#dc2626', fontSize: '13px' }}>{authError}</p>}

            <button
              className="button button-primary button-wide"
              type="submit"
              disabled={authBusy}
              style={{ marginTop: '6px', padding: '11px', fontSize: '14px', fontWeight: 600 }}
            >
              {authBusy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
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
        onToggleThemeMode={() => updateTheme({ mode: themeMode === 'light' ? 'dark' : 'light' })}
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
            onFilesChanged={() => refreshAllData()}
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
            onFilesChanged={() => refreshAllData()}
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
                refreshAllData();
              } catch (err) {
                pushToast('error', errorMessage(err));
              }
            }}
            files={files}
            onFilesChanged={() => refreshAllData()}
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
            onFilesChanged={() => refreshAllData()}
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
            onFilesChanged={() => refreshAllData()}
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
                refreshAllData();
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
                refreshAllData();
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
        ) : viewMode === 'watchlist' ? (
          <WatchlistView />
        ) : viewMode === 'shopping' ? (
          <ShoppingView />
        ) : viewMode === 'travel' ? (
          <TravelView />
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
            onRefreshWorkspace={() => refreshAllData()}
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
        mode={themeMode}
        onSelectMode={(mode) => updateTheme({ mode })}
        uiMode={uiMode}
        onSelectUiMode={(uiMode) => updateTheme({ uiMode })}
        accentColor={accentColor}
        onSelectAccentColor={(accentColor) => updateTheme({ accentColor })}
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
        onOpenFirebaseSetup={() => setFirebaseSetupOpen(true)}
        postSaveBehavior={postSaveBehavior}
        onSetPostSaveBehavior={handleSetPostSaveBehavior}
      />

      {/* Firebase Setup Modal */}
      {firebaseSetupOpen && (
        <FirebaseSetupModal
          isOpen={firebaseSetupOpen}
          onClose={() => setFirebaseSetupOpen(false)}
          onSaved={() => {
            pushToast('success', 'บันทึกการตั้งค่า Firebase สำเร็จ');
            refreshAllData();
          }}
        />
      )}

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
