import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ApiError,
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
  restoreNote,
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
  type Note,
  type Bookmark,
  type DashboardData,
  type Favorite,
  type FavoriteItemType,
  type Goal,
  type Habit,
  type HabitsHistory,
  type InboxItem,
  type LifeArea,
  type Person,
  type Project,
  type RelationshipGroup,
  type Reminder,
  type ReminderCategory,
  type SearchResults,
  type StoredFile,
  type Task,
  type TaxonomyItem,
  type Timeblock,
  type User,
} from './api';
import './App.css';

type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'unavailable';
type NotesView =
  | 'home'
  | 'all'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'notes'
  | 'people'
  | 'schedule'
  | 'trash'
  | 'bookmarks'
  | 'favorites'
  | 'files';
type ThemeName = 'emerald' | 'indigo' | 'rose' | 'amber' | 'violet';
type ThemeMode = 'light' | 'dark';
interface ProfileState {
  name: string;
  status: string;
  avatarPreset: string;
  avatarFileId: string | null;
}
type TaxonomyKind = 'categories' | 'tags';

type AllEntry =
  | { kind: 'note'; id: string; title: string; subtitle: string; timestamp: number; note: Note }
  | { kind: 'bookmark'; id: string; title: string; subtitle: string; timestamp: number; bookmark: Bookmark }
  | { kind: 'file'; id: string; title: string; subtitle: string; timestamp: number; file: StoredFile };

function fileIcon(mediaType: string, name: string): string {
  if (mediaType.startsWith('image/')) return 'IMG';
  if (mediaType === 'application/pdf') return 'PDF';
  if (mediaType.startsWith('video/')) return 'VID';
  if (mediaType.startsWith('audio/')) return 'AUD';
  if (mediaType.startsWith('text/')) return 'TXT';
  const extension = name.split('.').pop()?.toUpperCase() ?? '';
  return extension.length > 0 && extension.length <= 4 ? extension : 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysUntilNext(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [, month, day] = iso.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function taskPriorityLabel(priority: Task['priority']): string {
  return priority === 'urgent' ? 'ด่วนมาก'
    : priority === 'high' ? 'สำคัญ'
      : priority === 'low' ? 'ไม่เร่ง' : 'ปกติ';
}

function taskStatusLabel(status: Task['status']): string {
  return status === 'doing' ? 'กำลังทำ'
    : status === 'waiting' ? 'รออยู่'
      : status === 'done' ? 'เสร็จแล้ว'
        : status === 'cancelled' ? 'ยกเลิก' : 'ต้องทำ';
}

function reminderCategoryLabel(category: ReminderCategory): string {
  return category === 'birthday' ? 'วันเกิด'
    : category === 'anniversary' ? 'วันครบรอบ'
      : category === 'health' ? 'สุขภาพ'
        : category === 'backup' ? 'แผนสำรอง'
          : 'อื่น ๆ';
}

function lifeAreaLabel(area: LifeArea): string {
  return area === 'health' ? 'สุขภาพ'
    : area === 'focus_work' ? 'งานโฟกัส'
      : area === 'family' ? 'ครอบครัว/แฟน'
        : area === 'growth' ? 'พัฒนาตัวเอง'
          : 'อื่น ๆ';
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(timestamp));
}

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
  const [viewMode, setViewMode] = useState<NotesView>('home');
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
  const personAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
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
  const [toasts, setToasts] = useState<Array<{ id: number; kind: 'success' | 'error' | 'info'; message: string }>>([]);
  const toastSeqRef = useRef(0);
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
  const [theme, setTheme] = useState<ThemeName>(() => (localStorage.getItem('pkh.theme') as ThemeName) || 'emerald');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('pkh.themeMode') as ThemeMode) || 'light');
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
    getFavoriteStatus('note', activeNoteId).then((favorited) => {
      if (active) setNoteFavoriteState({ id: activeNoteId, favorited });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeNoteId, authState, refreshKey, viewMode]);

  useEffect(() => {
    if (authState !== 'signed-in' || viewMode !== 'bookmarks' || !activeBookmarkId) return;
    let active = true;
    getFavoriteStatus('bookmark', activeBookmarkId).then((favorited) => {
      if (active) setBookmarkFavoriteState({ id: activeBookmarkId, favorited });
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
    ]).then(([peoplePage, reminderList, upcoming, habitList, blocks, week]) => {
      if (!active) return;
      setPeople(peoplePage.people);
      setReminders(reminderList);
      setUpcomingReminders(upcoming);
      setHabits(habitList);
      setTodayBlocks(blocks);
      setHabitWeek(week);
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
    let active = true;
    const timer = window.setTimeout(() => {
      searchAll(query).then((results) => {
        if (active) setCommandResults(results);
      }).catch(() => undefined).finally(() => {
        if (active) setCommandBusy(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [commandOpen, commandQuery]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
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
      const loggedInUser = await login(username.trim(), password);
      setUser(loggedInUser);
      setPassword('');
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

  function startNewNote() {
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

  function switchView(nextView: NotesView) {
    if (nextView === viewMode) return;
    notesRequestId.current += 1;
    isNewBookmarkRef.current = false;
    setViewMode(nextView);
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
      setPersonNotice(activePerson ? 'บันทึกข้อมูลบุคคลแล้ว' : 'เพิ่มบุคคลแล้ว');
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
      const stored = await uploadFile(file);
      setPersonDraft((current) => ({ ...current, avatarFileId: stored.id }));
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

  function pushToast(kind: 'success' | 'error' | 'info', message: string) {
    const id = toastSeqRef.current + 1;
    toastSeqRef.current = id;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
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
      await createTask({
        title,
        dueDate: taskDraft.dueDate || undefined,
        priority: taskDraft.priority,
        projectId: taskDraft.projectId || null,
        recurrence: taskDraft.recurrence,
      });
      setTaskDraft({ title: '', dueDate: '', priority: 'normal', projectId: '', recurrence: 'none' });
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

  function navigateCommand(kind: 'note' | 'person' | 'reminder', id: string) {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandResults(null);
    if (kind === 'note') {
      void getNote(id).then((note) => {
        setViewMode('notes');
        activateNote(note);
        isNewNoteRef.current = true;
        setMobileDetailOpen(true);
      }).catch(() => undefined);
      return;
    }
    if (kind === 'person') {
      const person = people.find((item) => item.id === id);
      if (person) selectPerson(person);
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
        setNotice(wasEditing ? 'บันทึกการแก้ไขแล้ว' : 'สร้างโน้ตแล้ว');
        pushToast('success', wasEditing ? 'บันทึกการแก้ไขแล้ว' : 'สร้างโน้ตแล้ว');
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
      const saved = await saveBookmark(
        activeBookmark?.id ?? null,
        bookmarkTitle,
        bookmarkUrl,
        bookmarkDescription,
      );
      isNewBookmarkRef.current = false;
      setActiveBookmark(saved);
      setBookmarks((current) => [
        saved,
        ...current.filter((bookmark) => bookmark.id !== saved.id),
      ]);
      setPage(1);
      setNotesBusy(true);
      setRefreshKey((key) => key + 1);
      setNotice(activeBookmark ? 'บันทึกการแก้ไขบุ๊กมาร์กแล้ว' : 'บันทึกบุ๊กมาร์กแล้ว');
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
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const deletedId = activeBookmark.id;
      await deleteBookmark(deletedId);
      isNewBookmarkRef.current = false;
      setActiveBookmark(null);
      setBookmarkTitle('');
      setBookmarkUrl('');
      setBookmarkDescription('');
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== deletedId));
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else {
        setNotesBusy(true);
        setRefreshKey((key) => key + 1);
      }
      setNotice('ลบบุ๊กมาร์กแล้ว');
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
          </form>
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
            : total;
  const pageCount = viewMode === 'all' || viewMode === 'people' || viewMode === 'schedule'
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
            : notesBusy;
  const listLength = viewMode === 'home'
    ? (dashboard?.counts.openTasks ?? 0)
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
    { name: 'emerald', label: 'Emerald Forest', color: '#3f7658' },
    { name: 'indigo', label: 'Royal Indigo', color: '#4f5fa8' },
    { name: 'rose', label: 'Rose Quartz', color: '#a85a72' },
    { name: 'amber', label: 'Amber Sunset', color: '#a8742c' },
    { name: 'violet', label: 'Midnight Violet', color: '#6b4f9e' },
  ];
  const menuItems: Array<{ view: NotesView; label: string; icon: string }> = [
    { view: 'home', label: 'ภาพรวมวันนี้', icon: '⌂' },
    { view: 'inbox', label: 'กล่องขาเข้า', icon: '⇥' },
    { view: 'tasks', label: 'งานที่ต้องทำ', icon: '☑' },
    { view: 'projects', label: 'โปรเจกต์', icon: '▣' },
    { view: 'goals', label: 'เป้าหมาย', icon: '◎' },
    { view: 'notes', label: 'โน้ตของฉัน', icon: '✎' },
    { view: 'people', label: 'บุคคลสำคัญ', icon: '♥' },
    { view: 'schedule', label: 'ปฏิทิน & ตารางชีวิต', icon: '▦' },
    { view: 'bookmarks', label: 'บุ๊กมาร์ก', icon: '↗' },
    { view: 'files', label: 'คลังไฟล์', icon: '▤' },
    { view: 'favorites', label: 'รายการโปรด', icon: '★' },
    { view: 'trash', label: 'ถังขยะ', icon: '⌫' },
  ];

  return (
    <main className={`app-shell${focusMode ? ' focus-mode' : ''}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="PKH หน้าหลัก">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong>PKH</strong>
            <small>Personal Knowledge Hub</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="account-label">{user?.username}</span>
          <button
            className="icon-button topbar-icon"
            type="button"
            aria-label="ค้นหาด่วน (Ctrl+K)"
            title="ค้นหาด่วน (Ctrl+K)"
            onClick={() => setCommandOpen(true)}
          >
            ⌕
          </button>
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
                  <button className="text-button" type="button" onClick={() => setNotificationOpen(false)}>ปิด</button>
                </div>
                {upcomingReminders.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีรายการใกล้ถึงกำหนด</p>
                ) : (
                  upcomingReminders.slice(0, 6).map((reminder) => (
                    <button
                      className="notification-item"
                      type="button"
                      key={reminder.id}
                      onClick={() => {
                        setNotificationOpen(false);
                        setViewMode('schedule');
                        setScheduleDate(reminder.targetDate);
                        setMobileDetailOpen(true);
                      }}
                    >
                      <strong>{reminder.title}</strong>
                      <span>{reminder.targetDate}{reminder.linkedPersonName ? ` · ${reminder.linkedPersonName}` : ''}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            className="icon-button topbar-icon"
            type="button"
            aria-label="ธีมและสี"
            title="ธีมและสี"
            onClick={() => setThemeOpen(true)}
          >
            🎨
          </button>
          <button className="button button-quiet" type="button" onClick={handleLogout} disabled={authBusy}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="workspace">
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
              onClick={() => setMobileMenuOpen(false)}
            >
              ×
            </button>
          </div>

          <button className="profile-card" type="button" onClick={() => setProfileOpen(true)}>
            <span className="avatar profile-avatar">
              {profile.avatarFileId ? (
                <img src={`/api/files/${profile.avatarFileId}`} alt="" />
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
            <small className="profile-meta">{todayDone}/{todayBlocks.length} ช่วงวันนี้</small>
          </button>

          <nav className="primary-nav" aria-label="เมนูหลัก">
            {menuItems.map((item) => (
              <button
                key={item.view}
                className={`nav-item${viewMode === item.view ? ' is-active' : ''}`}
                type="button"
                aria-current={viewMode === item.view ? 'page' : undefined}
                onClick={() => switchView(item.view)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {viewMode === item.view && <span className="nav-count">{listTotal}</span>}
              </button>
            ))}
          </nav>

          <div className="quick-add">
            <span className="sidebar-hint">สร้างข้อมูลด่วน</span>
            <div className="quick-add-grid">
              <button className="button button-quiet" type="button" onClick={startNewNote}>＋ โน้ต</button>
              <button className="button button-quiet" type="button" onClick={startNewPerson}>＋ บุคคล</button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  setViewMode('schedule');
                  setMobileDetailOpen(true);
                }}
              >
                ＋ แจ้งเตือน
              </button>
            </div>
          </div>

          <div className="sidebar-actions">
            {(viewMode === 'notes' || viewMode === 'all') && (
              <button className="button button-primary" type="button" onClick={startNewNote}>
                <span aria-hidden="true">＋</span> เขียนโน้ต
              </button>
            )}
            {viewMode === 'bookmarks' && (
              <button className="button button-primary" type="button" onClick={startNewBookmark}>
                <span aria-hidden="true">＋</span> เพิ่มลิงก์
              </button>
            )}
            {viewMode === 'files' && (
              <>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadBusy}
                >
                  <span aria-hidden="true">＋</span> {uploadBusy ? 'กำลังอัปโหลด…' : 'อัปโหลดไฟล์'}
                </button>
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  onChange={(event) => void handleUpload(event)}
                  disabled={uploadBusy}
                />
              </>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-head">
              <h2>ตัวกรอง</h2>
              {activeFilterCount > 0 && (
                <button className="text-button" type="button" onClick={clearFilters}>
                  ล้าง
                </button>
              )}
            </div>
            <p className="sidebar-hint">เลือกหมวดหมู่หรือแท็กเพื่อกรองโน้ตที่โหลดอยู่</p>
            {renderTaxonomyGroup('categories', 'filter')}
            {renderTaxonomyGroup('tags', 'filter')}
            {filterBusy && <p className="taxonomy-state" aria-live="polite">กำลังกรอง…</p>}
          </div>
        </aside>

        {mobileMenuOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <section className="list-panel" aria-label={viewAriaLabel}>
          <div className="list-header">
            <button
              className="icon-button mobile-menu-button"
              type="button"
              aria-label="เปิดเมนู"
              onClick={() => setMobileMenuOpen(true)}
            >
              ☰
            </button>
            <div className="list-heading">
              <h1>{viewTitle}</h1>
              <span className="note-count">{listTotal}</span>
            </div>
          </div>

          {viewMode === 'notes' && (
            <div className="search-control list-search">
              <label htmlFor="note-search">ค้นหาโน้ต</label>
              <div className="search-input-row">
                <input
                  id="note-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                    setPage(1);
                    setNotesError('');
                  }}
                  maxLength={500}
                  placeholder="ค้นหาจากหัวข้อหรือเนื้อหา…"
                />
                {searchInput && (
                  <button
                    className="button button-quiet search-clear"
                    type="button"
                    onClick={clearSearch}
                  >
                    ล้าง
                  </button>
                )}
              </div>
              {shortSearch && (
                <p className="search-hint" role="note">
                  คำค้นสั้น 1–2 อักขระอาจได้ผลลัพธ์กว้าง ระบบจะค้นทุกโน้ตที่ยังไม่อยู่ในถังขยะ
                </p>
              )}
            </div>
          )}

          {viewMode === 'people' && (
            <div className="search-control list-search">
              <label htmlFor="people-search">ค้นหาบุคคล</label>
              <div className="search-input-row">
                <input
                  id="people-search"
                  type="search"
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                  maxLength={120}
                  placeholder="ชื่อ บทบาท ของที่ชอบ หรือสิ่งที่แพ้…"
                />
                {peopleQuery && (
                  <button
                    className="button button-quiet search-clear"
                    type="button"
                    onClick={() => setPeopleQuery('')}
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <div className="filter-chips">
                {([
                  ['', 'ทั้งหมด'],
                  ['family', 'ครอบครัว'],
                  ['partner', 'แฟน'],
                  ['friend', 'เพื่อน'],
                ] as const).map(([value, label]) => (
                  <button
                    className={`chip-add${peopleGroup === value ? ' is-open' : ''}`}
                    key={value || 'all'}
                    type="button"
                    onClick={() => setPeopleGroup(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'schedule' && (
            <div className="search-control list-search">
              <label htmlFor="schedule-date">วันที่ของตารางชีวิต</label>
              <input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(event) => {
                  setScheduleBusy(true);
                  setScheduleDate(event.target.value);
                }}
              />
            </div>
          )}

          {notesError && <p className="form-error sidebar-error" role="alert">{notesError}</p>}

          <div className="list-scroll">
            {(sidebarBusy || searchSettling) && listLength === 0 && (
              <p className="empty-state" aria-live="polite">
                {searchSettling
                  ? 'กำลังค้นหา…'
                  : viewMode === 'all'
                    ? 'กำลังโหลดรายการทั้งหมด…'
                    : viewMode === 'people'
                      ? 'กำลังโหลดบุคคลสำคัญ…'
                      : viewMode === 'schedule'
                        ? 'กำลังโหลดตารางชีวิต…'
                        : viewMode === 'trash'
                      ? 'กำลังโหลดถังขยะ…'
                      : viewMode === 'bookmarks'
                        ? 'กำลังโหลดลิงก์…'
                        : viewMode === 'favorites'
                          ? 'กำลังโหลดรายการโปรด…'
                          : viewMode === 'files'
                            ? 'กำลังโหลดไฟล์…'
                            : 'กำลังโหลดโน้ต…'}
              </p>
            )}
            {!sidebarBusy && !searchSettling && listLength === 0 && !notesError && (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">✎</span>
                <strong>
                  {viewMode === 'all'
                    ? 'ยังไม่มีรายการ'
                    : viewMode === 'people'
                      ? 'ยังไม่มีบุคคลสำคัญ'
                      : viewMode === 'schedule'
                        ? 'ยังไม่มีแจ้งเตือน'
                        : viewMode === 'trash'
                      ? 'ถังขยะว่าง'
                      : viewMode === 'bookmarks'
                        ? 'ยังไม่มีลิงก์'
                        : viewMode === 'favorites'
                          ? 'ยังไม่มีรายการโปรด'
                          : viewMode === 'files'
                            ? 'ยังไม่มีไฟล์'
                            : searchQuery
                              ? 'ไม่พบโน้ตที่ตรงกับคำค้น'
                              : 'ยังไม่มีโน้ต'}
                </strong>
                <span>
                  {viewMode === 'all'
                    ? 'โน้ต ลิงก์ และไฟล์ล่าสุดจะแสดงที่นี่'
                    : viewMode === 'people'
                      ? 'เพิ่มคุณพ่อ คุณแม่ คนพิเศษ หรือเพื่อนสนิทเพื่อเก็บรายละเอียดที่ควรจำ'
                      : viewMode === 'schedule'
                        ? 'เพิ่มวันเกิด วันครบรอบ หรือนัดสำคัญเพื่อให้ระบบเตือนล่วงหน้า'
                        : viewMode === 'trash'
                      ? 'โน้ตที่ย้ายไปถังขยะจะแสดงที่นี่'
                      : viewMode === 'bookmarks'
                        ? 'เพิ่มลิงก์ที่ต้องการเก็บไว้กลับมาอ่านภายหลัง'
                        : viewMode === 'favorites'
                          ? 'กดดาวที่โน้ตหรือลิงก์เพื่อเก็บไว้ที่นี่'
                          : viewMode === 'files'
                            ? 'อัปโหลดไฟล์แรกเพื่อเก็บไว้ในพื้นที่ส่วนตัว'
                            : searchQuery
                              ? 'ลองใช้คำค้นอื่น หรือกดล้างเพื่อกลับไปดูโน้ตทั้งหมด'
                              : 'เริ่มบันทึกไอเดียแรกของคุณ'}
                </span>
              </div>
            )}

            {viewMode === 'all' ? (
              <nav className="note-list" aria-label="รายการทั้งหมด">
                {allEntries.map((entry) => (
                  <button
                    className="note-list-item"
                    key={`${entry.kind}:${entry.id}`}
                    type="button"
                    onClick={() => selectAllEntry(entry)}
                  >
                    <strong>
                      <span className={`entry-kind ${entry.kind}`}>
                        {entry.kind === 'note' ? 'โน้ต' : entry.kind === 'bookmark' ? 'ลิงก์' : 'ไฟล์'}
                      </span>
                      {entry.title}
                    </strong>
                    <span>{entry.subtitle}</span>
                    <time dateTime={new Date(entry.timestamp).toISOString()}>
                      {formatDate(entry.timestamp)}
                    </time>
                  </button>
                ))}
              </nav>
            ) : viewMode === 'home' ? (
              <div className="work-list dashboard-list" aria-label="สรุปวันนี้">
                {dashboardError && <p className="form-error sidebar-error" role="alert">{dashboardError}</p>}
                <div className="dash-stat">
                  <strong>{dashboard?.counts.dueToday ?? 0}</strong>
                  <span>งานครบกำหนดวันนี้</span>
                </div>
                <div className={`dash-stat${(dashboard?.counts.overdue ?? 0) > 0 ? ' is-warn' : ''}`}>
                  <strong>{dashboard?.counts.overdue ?? 0}</strong>
                  <span>งานเกินกำหนด</span>
                </div>
                <div className="dash-stat">
                  <strong>{dashboard?.counts.inbox ?? 0}</strong>
                  <span>รอจัดการในกล่องขาเข้า</span>
                </div>
                <div className="dash-stat">
                  <strong>{dashboard?.counts.habitsOutstanding ?? 0}</strong>
                  <span>กิจวัตรที่ยังไม่ครบวันนี้</span>
                </div>
                <div className="quick-add-grid">
                  <button className="button button-quiet" type="button" onClick={startNewNote}>＋ โน้ต</button>
                  <button className="button button-quiet" type="button" onClick={() => switchView('inbox')}>＋ เก็บเข้า inbox</button>
                  <button className="button button-quiet" type="button" onClick={() => switchView('tasks')}>＋ งาน</button>
                </div>
              </div>
            ) : viewMode === 'inbox' ? (
              <div className="work-list" aria-label="รายการในกล่องขาเข้า">
                {inboxItems.length === 0 ? (
                  <p className="sidebar-hint">กล่องขาเข้าว่าง — จดอะไรก็ได้ก่อน แล้วค่อยจัดหมวดทีหลัง</p>
                ) : inboxItems.map((item) => (
                  <div className="work-row inbox-row" key={item.id}>
                    <div className="work-row-head">
                      <strong>{item.body.length > 90 ? `${item.body.slice(0, 90)}…` : item.body}</strong>
                    </div>
                    <div className="work-row-meta">
                      <span>{item.kind === 'url' ? 'ลิงก์' : 'ข้อความ'}</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                    <div className="work-actions">
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void convertItem(item, 'note')}>เป็นโน้ต</button>
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void convertItem(item, 'task')}>เป็นงาน</button>
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void convertItem(item, 'project')}>เป็นโปรเจกต์</button>
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void convertItem(item, 'bookmark')}>เป็นลิงก์</button>
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void convertItem(item, 'reminder')}>เป็นแจ้งเตือน</button>
                      <button className="text-button" type="button" disabled={inboxBusy} onClick={() => void archiveInboxItem(item)}>เก็บเข้าคลัง</button>
                      <button className="text-button danger-text" type="button" disabled={inboxBusy} onClick={() => void removeInboxItem(item)}>ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === 'tasks' ? (
              <div className="work-list" aria-label="รายการงาน">
                {tasks.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีงานในตัวกรองนี้ — เพิ่มงานแรกได้จากช่องด้านขวา</p>
                ) : tasks.map((task) => (
                  <div className={`work-row${task.status === 'done' ? ' is-done' : ''}`} key={task.id}>
                    <label className="work-check">
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        disabled={tasksBusy}
                        onChange={() => void toggleTask(task)}
                      />
                      <span>
                        <strong>{task.title}</strong>
                        <span className="work-row-meta">
                          <span>{taskStatusLabel(task.status)}</span>
                          <span>{taskPriorityLabel(task.priority)}</span>
                          {task.dueDate && <span>กำหนด {task.dueDate}</span>}
                          {task.projectName && <span>▣ {task.projectName}</span>}
                          {task.recurrence !== 'none' && <span>↻ {task.recurrence}</span>}
                          {task.checklistTotal > 0 && <span>☑ {task.checklistDone}/{task.checklistTotal}</span>}
                        </span>
                      </span>
                    </label>
                    <div className="work-actions">
                      <button className="text-button danger-text" type="button" disabled={tasksBusy} onClick={() => void removeTask(task)}>ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === 'projects' ? (
              <div className="work-list" aria-label="รายการโปรเจกต์">
                {projects.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีโปรเจกต์ที่กำลังทำ</p>
                ) : projects.map((project) => {
                  const percent = project.taskTotal === 0
                    ? 0
                    : Math.round((project.taskDone / project.taskTotal) * 100);
                  return (
                    <div className="work-row" key={project.id}>
                      <strong>{project.name}</strong>
                      <span className="work-row-meta">
                        <span>{project.taskDone}/{project.taskTotal} งานเสร็จ</span>
                        {project.dueDate && <span>กำหนด {project.dueDate}</span>}
                        {project.goalTitle && <span>◎ {project.goalTitle}</span>}
                      </span>
                      <div className="progress-track" aria-hidden="true">
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <div className="work-actions">
                        <button className="text-button" type="button" disabled={projectsBusy} onClick={() => void finishProject(project)}>ปิดโปรเจกต์</button>
                        <button className="text-button danger-text" type="button" disabled={projectsBusy} onClick={() => void removeProject(project)}>ลบ</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : viewMode === 'goals' ? (
              <div className="work-list" aria-label="รายการเป้าหมาย">
                {goals.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีเป้าหมายที่กำลังติดตาม</p>
                ) : goals.map((goal) => (
                  <div className="work-row" key={goal.id}>
                    <strong>{goal.title}</strong>
                    <span className="work-row-meta">
                      {goal.progressPercent === null
                        ? <span>ยังไม่มีตัวชี้วัด</span>
                        : <span>{goal.currentValue}/{goal.targetValue} {goal.unit} · {goal.progressPercent}%</span>}
                      {goal.activeProjects > 0 && <span>▣ {goal.activeProjects} โปรเจกต์</span>}
                    </span>
                    {goal.progressPercent !== null && (
                      <div className="progress-track" aria-hidden="true">
                        <span style={{ width: `${goal.progressPercent}%` }} />
                      </div>
                    )}
                    <div className="work-actions">
                      <button className="text-button" type="button" disabled={goalsBusy} onClick={() => void bumpGoal(goal, 1)}>+1</button>
                      <button className="text-button" type="button" disabled={goalsBusy} onClick={() => void bumpGoal(goal, -1)}>−1</button>
                      <button className="text-button danger-text" type="button" disabled={goalsBusy} onClick={() => void removeGoal(goal)}>ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === 'people' ? (
              <div className="people-list" aria-label="รายการบุคคลสำคัญ">
                {filteredPeople.map((person) => {
                  const days = daysUntilNext(person.birthdayOrAnniversary);
                  const groupLabel = person.relationshipGroup === 'family'
                    ? 'ครอบครัว'
                    : person.relationshipGroup === 'partner' ? 'แฟน' : 'เพื่อน';
                  return (
                    <button
                      className={`person-card${activePerson?.id === person.id ? ' is-active' : ''}`}
                      key={person.id}
                      type="button"
                      onClick={() => selectPerson(person)}
                    >
                      <span className="avatar person-avatar">
                        {person.avatarFileId ? (
                          <img src={`/api/files/${person.avatarFileId}`} alt="" />
                        ) : (
                          person.avatarPreset || person.name.slice(0, 1)
                        )}
                      </span>
                      <span className="person-copy">
                        <strong>{person.name}</strong>
                        <small>{person.roleLabel || groupLabel}</small>
                      </span>
                      <span className="person-meta">
                        {days !== null && (
                          <span className={`countdown${days <= 7 ? ' is-soon' : ''}`}>
                            {days === 0 ? 'วันนี้' : `อีก ${days} วัน`}
                          </span>
                        )}
                        <span>{person.noteCount ?? 0} โน้ต</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : viewMode === 'schedule' ? (
              <div className="schedule-list" aria-label="รายการแจ้งเตือน">
                <div className="schedule-summary-card">
                  <div>
                    <span className="eyebrow">วันนี้</span>
                    <strong>{todayDone}/{todayBlocks.length} ช่วงเวลา</strong>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${todayProgress}%` }} />
                  </div>
                  <small>{todayProgress}% ของตารางชีวิตวันนี้</small>
                </div>
                {upcomingReminders.map((reminder) => (
                  <button
                    className="reminder-list-item"
                    key={reminder.id}
                    type="button"
                    onClick={() => {
                      setScheduleDate(reminder.targetDate);
                      setMobileDetailOpen(true);
                    }}
                  >
                    <strong>{reminder.title}</strong>
                    <span>{reminder.targetDate}{reminder.linkedPersonName ? ` · ${reminder.linkedPersonName}` : ''}</span>
                    <span className={`priority-dot ${reminder.priority}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : viewMode === 'favorites' ? (
              <nav className="note-list" aria-label="รายการโปรด">
                {favorites.map((favorite) => {
                  const isActive = activeFavorite?.itemType === favorite.itemType
                    && activeFavorite?.itemId === favorite.itemId;
                  return (
                    <button
                      className={`note-list-item${isActive ? ' is-active' : ''}`}
                      key={`${favorite.itemType}:${favorite.itemId}`}
                      type="button"
                      onClick={() => {
                        setActiveFavorite(favorite);
                        setMobileMenuOpen(false);
                        setMobileDetailOpen(true);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <strong>
                        <span className="favorite-mark" aria-hidden="true">★</span>
                        {favorite.title}
                      </strong>
                      <span>{favorite.subtitle || (favorite.itemType === 'note' ? 'ไม่มีเนื้อหา' : '')}</span>
                      <time dateTime={new Date(favorite.createdAt).toISOString()}>
                        {favorite.itemType === 'note' ? 'โน้ต · ' : 'ลิงก์ · '}
                        {formatDate(favorite.createdAt)}
                      </time>
                    </button>
                  );
                })}
              </nav>
            ) : viewMode === 'files' ? (
              <div className="file-grid" aria-label="รายการไฟล์">
                {files.map((file) => (
                  <article className={`file-card${activeFile?.id === file.id ? ' is-active' : ''}`} key={file.id}>
                    <button
                      className="file-card-main"
                      type="button"
                      onClick={() => {
                        setActiveFile(file);
                        setMobileMenuOpen(false);
                        setMobileDetailOpen(true);
                      }}
                    >
                      <span className="file-thumb">
                        <span className="file-icon">{fileIcon(file.mediaType, file.displayName)}</span>
                        {file.mediaType.startsWith('image/') && (
                          <img
                            src={file.downloadUrl}
                            alt=""
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </span>
                      <strong>{file.displayName}</strong>
                      <span>{formatBytes(file.sizeBytes)} · {file.mediaType}</span>
                    </button>
                    <div className="file-card-actions">
                      <a className="button button-quiet" href={file.downloadUrl} download={file.displayName}>
                        ดาวน์โหลด
                      </a>
                      <button
                        className="button button-danger-quiet"
                        type="button"
                        onClick={() => void handleDeleteFile(file)}
                      >
                        ลบ
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <nav className="note-list" aria-label="รายการโน้ต">
                {!searchSettling && filteredNotes.map((note) => (
                  <button
                    className={`note-list-item${(
                      viewMode === 'trash'
                        ? activeTrashNote?.id
                        : viewMode === 'bookmarks'
                          ? activeBookmark?.id
                          : activeNote?.id
                    ) === note.id ? ' is-active' : ''}`}
                    key={note.id}
                    type="button"
                    onClick={() => selectNote(note)}
                    aria-current={(
                      viewMode === 'trash'
                        ? activeTrashNote?.id
                        : viewMode === 'bookmarks'
                          ? activeBookmark?.id
                          : activeNote?.id
                    ) === note.id ? 'page' : undefined}
                  >
                    <strong>{note.title}</strong>
                    <span>{note.content || 'ไม่มีเนื้อหา'}</span>
                    <time dateTime={new Date(note.updatedAt).toISOString()}>
                      {viewMode === 'trash' ? 'ย้ายเมื่อ ' : 'แก้ไข '}
                      {formatDate(note.updatedAt)}
                    </time>
                  </button>
                ))}
              </nav>
            )}

            {viewMode === 'notes' && activeFilterCount > 0 && !filterBusy && (
              <p className="filter-summary">
                แสดง {filteredNotes.length} จาก {notes.length} รายการในหน้านี้
              </p>
            )}

            {pageCount > 1 && !searchSettling && viewMode !== 'all' && (
              <div className="pagination">
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={page <= 1 || sidebarBusy || searchSettling}
                  onClick={() => {
                    markListBusy();
                    setNotesError('');
                    setPage((currentPage) => currentPage - 1);
                  }}
                >
                  ก่อนหน้า
                </button>
                <span>{page} / {pageCount}</span>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={page >= pageCount || sidebarBusy || searchSettling}
                  onClick={() => {
                    markListBusy();
                    setNotesError('');
                    setPage((currentPage) => currentPage + 1);
                  }}
                >
                  ถัดไป
                </button>
              </div>
            )}
          </div>
        </section>

        <div className={`detail-panel${mobileDetailOpen ? ' is-open' : ''}`}>
          <div className="detail-mobile-bar">
            <button
              className="button button-quiet detail-back"
              type="button"
              onClick={() => setMobileDetailOpen(false)}
            >
              ← กลับ
            </button>
          </div>
        {viewMode === 'home' ? (
          <section className="editor-panel dashboard-panel" aria-label="ภาพรวมวันนี้">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Today</span>
                <h2 className="panel-title">ภาพรวมวันนี้</h2>
                <p className="updated-label">
                  {dashboard ? dashboard.today : localToday()}
                  {dashboardBusy ? ' · กำลังโหลด…' : ''}
                </p>
              </div>
              <div className="editor-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void refreshDashboard()}
                  disabled={dashboardBusy}
                >
                  {dashboardBusy ? 'กำลังโหลด…' : 'รีเฟรช'}
                </button>
              </div>
            </div>
            {dashboardError && <p className="form-error editor-error" role="alert">{dashboardError}</p>}
            {!dashboard && !dashboardError && <p className="sidebar-hint">กำลังโหลดภาพรวม…</p>}
            {dashboard && (
              <div className="dash-grid">
                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>งานของวันนี้</h3>
                    <button className="text-button" type="button" onClick={() => switchView('tasks')}>ดูทั้งหมด →</button>
                  </div>
                  {dashboard.tasks.dueToday.length === 0 && dashboard.tasks.overdue.length === 0 ? (
                    <p className="dash-empty">ไม่มีงานครบกำหนดหรือเกินกำหนดวันนี้</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.tasks.overdue.map((task) => (
                        <li key={`overdue-${task.id}`} className="is-warn">
                          <strong>{task.title}</strong>
                          <small>เกินกำหนด · {task.dueDate}</small>
                        </li>
                      ))}
                      {dashboard.tasks.dueToday.map((task) => (
                        <li key={`today-${task.id}`}>
                          <strong>{task.title}</strong>
                          <small>{taskStatusLabel(task.status)} · {taskPriorityLabel(task.priority)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>แจ้งเตือนใกล้ถึง</h3>
                    <button className="text-button" type="button" onClick={() => switchView('schedule')}>ไปที่ตารางชีวิต →</button>
                  </div>
                  {dashboard.reminders.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีรายการแจ้งเตือนในช่วง 60 วัน</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.reminders.slice(0, 4).map((reminder) => (
                        <li key={reminder.id}>
                          <strong>{reminder.title}</strong>
                          <small>
                            {reminder.snoozedUntil ? `เลื่อนไป ${reminder.snoozedUntil}` : reminder.targetDate}
                            {' · '}{reminderCategoryLabel(reminder.category)}
                            {reminder.recurrence && reminder.recurrence !== 'none' ? ' · ↻' : ''}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>ตารางชีวิตวันนี้</h3>
                    <span className="note-count">{dashboard.timeblocks.done}/{dashboard.timeblocks.total}</span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{
                      width: `${dashboard.timeblocks.total === 0 ? 0 : Math.round((dashboard.timeblocks.done / dashboard.timeblocks.total) * 100)}%`,
                    }} />
                  </div>
                  {dashboard.timeblocks.total === 0 ? (
                    <p className="dash-empty">ยังไม่ได้วางช่วงเวลาไว้สำหรับวันนี้</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.timeblocks.blocks.slice(0, 4).map((block) => (
                        <li key={block.id} className={block.isDone ? 'is-done' : ''}>
                          <strong>{block.timeRange} · {block.title}</strong>
                          <small>{lifeAreaLabel(block.lifeArea)}{block.isDone ? ' · ทำแล้ว' : ''}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>โปรเจกต์ที่กำลังทำ</h3>
                    <button className="text-button" type="button" onClick={() => switchView('projects')}>ดูทั้งหมด →</button>
                  </div>
                  {dashboard.projects.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีโปรเจกต์ที่กำลังดำเนินการ</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.projects.slice(0, 4).map((project) => (
                        <li key={project.id}>
                          <strong>{project.name}</strong>
                          <small>
                            งานที่ปิดแล้ว {project.taskDone} จาก {project.taskTotal}
                            {project.dueDate ? ` · กำหนด ${project.dueDate}` : ''}
                          </small>
                          <div className="progress-track" aria-hidden="true">
                            <span style={{
                              width: `${project.taskTotal === 0 ? 0 : Math.round((project.taskDone / project.taskTotal) * 100)}%`,
                            }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>เป้าหมาย</h3>
                    <button className="text-button" type="button" onClick={() => switchView('goals')}>ดูทั้งหมด →</button>
                  </div>
                  {dashboard.goals.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีเป้าหมายที่กำลังติดตาม</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.goals.slice(0, 4).map((goal) => (
                        <li key={goal.id}>
                          <strong>{goal.title}</strong>
                          <small>
                            {goal.progressPercent === null
                              ? 'ยังไม่มีตัวชี้วัด'
                              : `${goal.currentValue}/${goal.targetValue} ${goal.unit} · ${goal.progressPercent}%`}
                          </small>
                          {goal.progressPercent !== null && (
                            <div className="progress-track" aria-hidden="true">
                              <span style={{ width: `${goal.progressPercent}%` }} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>กิจวัตรที่ยังไม่ครบ</h3>
                    <button className="text-button" type="button" onClick={() => switchView('schedule')}>ไปที่ตารางชีวิต →</button>
                  </div>
                  {dashboard.habits.length === 0 ? (
                    <p className="dash-empty">วันนี้ทำครบทุกกิจวัตรแล้ว</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.habits.slice(0, 4).map((habit) => (
                        <li key={habit.id}>
                          <strong>{habit.title}</strong>
                          <small>
                            {habit.currentCount}/{habit.dailyTarget} {habit.unit} · ต่อเนื่อง {habit.streakDays} วัน
                            {typeof habit.weekMetTarget === 'number' ? ` · สัปดาห์นี้ ${habit.weekMetTarget}/7 วัน` : ''}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>กล่องขาเข้า</h3>
                    <span className="note-count">{dashboard.inbox.newCount}</span>
                  </div>
                  {dashboard.inbox.items.length === 0 ? (
                    <p className="dash-empty">ไม่มีอะไรค้างในกล่องขาเข้า</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.inbox.items.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          <strong>{item.body.length > 60 ? `${item.body.slice(0, 60)}…` : item.body}</strong>
                          <small>{item.kind === 'url' ? 'ลิงก์' : 'ข้อความ'}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button className="button button-quiet" type="button" onClick={() => switchView('inbox')}>ไปจัดการ inbox</button>
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>โน้ตที่อัปเดตล่าสุด</h3>
                    <button className="text-button" type="button" onClick={() => switchView('notes')}>ไปที่โน้ต →</button>
                  </div>
                  {dashboard.notes.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีโน้ต</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.notes.map((note) => (
                        <li key={note.id}>
                          <button className="text-button" type="button" onClick={() => void openNoteById(note.id)}>
                            {note.title}
                          </button>
                          <small>{formatDate(note.updatedAt)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </section>
        ) : viewMode === 'inbox' ? (
          <section className="editor-panel work-panel" aria-label="กล่องขาเข้า">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Quick Capture</span>
                <h2 className="panel-title">กล่องขาเข้า</h2>
                <p className="updated-label">ยังไม่ได้จัดหมวด {inboxNewCount} รายการ</p>
              </div>
            </div>
            {inboxError && <p className="form-error editor-error" role="alert">{inboxError}</p>}
            {inboxNotice && <p className="form-notice" role="status">{inboxNotice}</p>}
            <form className="capture-form" onSubmit={addInboxItem}>
              <label>
                จดอะไรก็ได้ก่อน
                <textarea
                  value={inboxDraft}
                  onChange={(event) => setInboxDraft(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder="ไอเดีย ลิงก์ สิ่งที่ต้องทำ หรือเรื่องที่ต้องเตือนภายหลัง…"
                />
              </label>
              <button className="button button-primary" type="submit" disabled={inboxBusy}>
                {inboxBusy ? 'กำลังบันทึก…' : 'เก็บเข้ากล่อง'}
              </button>
            </form>
            <p className="sidebar-hint">
              รายการในกล่องจะยังไม่ถูกตีความเป็นโน้ตหรืองานจนกว่าจะเลือกทางขวา —
              และแปลงได้ครั้งเดียวเท่านั้น ต้นฉบับยังอยู่ครบ
            </p>
          </section>
        ) : viewMode === 'tasks' ? (
          <section className="editor-panel work-panel" aria-label="งานที่ต้องทำ">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Tasks</span>
                <h2 className="panel-title">งานที่ต้องทำ</h2>
                <p className="updated-label">{tasks.length} รายการในตัวกรองนี้</p>
              </div>
            </div>
            <div className="mode-toggle" role="group" aria-label="ตัวกรองงาน">
              {([
                ['open', 'ยังไม่เสร็จ'],
                ['today', 'วันนี้'],
                ['overdue', 'เกินกำหนด'],
                ['done', 'เสร็จแล้ว'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={`button ${taskFilter === value ? 'button-primary' : 'button-quiet'}`}
                  type="button"
                  onClick={() => setTaskFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tasksError && <p className="form-error editor-error" role="alert">{tasksError}</p>}
            {tasksNotice && <p className="form-notice" role="status">{tasksNotice}</p>}
            <form className="inline-form" onSubmit={addTask}>
              <input
                required
                value={taskDraft.title}
                onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })}
                placeholder="ชื่องาน"
                maxLength={200}
              />
              <input
                type="date"
                value={taskDraft.dueDate}
                onChange={(event) => setTaskDraft({ ...taskDraft, dueDate: event.target.value })}
                aria-label="กำหนดเสร็จ"
              />
              <select
                value={taskDraft.priority}
                onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value as Task['priority'] })}
                aria-label="ความสำคัญ"
              >
                <option value="low">ไม่เร่ง</option>
                <option value="normal">ปกติ</option>
                <option value="high">สำคัญ</option>
                <option value="urgent">ด่วนมาก</option>
              </select>
              <select
                value={taskDraft.projectId}
                onChange={(event) => setTaskDraft({ ...taskDraft, projectId: event.target.value })}
                aria-label="โปรเจกต์"
              >
                <option value="">ไม่ผูกโปรเจกต์</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>{project.name}</option>
                ))}
              </select>
              <select
                value={taskDraft.recurrence}
                onChange={(event) => setTaskDraft({ ...taskDraft, recurrence: event.target.value as Task['recurrence'] })}
                aria-label="การทำซ้ำ"
              >
                <option value="none">ไม่ซ้ำ</option>
                <option value="daily">ทุกวัน</option>
                <option value="weekly">ทุกสัปดาห์</option>
                <option value="monthly">ทุกเดือน</option>
                <option value="yearly">ทุกปี</option>
              </select>
              <button className="button button-primary" type="submit" disabled={tasksBusy}>เพิ่ม</button>
            </form>
            <p className="sidebar-hint">
              งานที่ตั้งให้ทำซ้ำจะสร้างรอบถัดไปเมื่อปิดรอบปัจจุบัน และเก็บรอบที่ปิดแล้วไว้เป็นประวัติ
            </p>
          </section>
        ) : viewMode === 'projects' ? (
          <section className="editor-panel work-panel" aria-label="โปรเจกต์">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Projects</span>
                <h2 className="panel-title">โปรเจกต์</h2>
                <p className="updated-label">{projects.length} โปรเจกต์ที่กำลังทำ</p>
              </div>
            </div>
            {projectsError && <p className="form-error editor-error" role="alert">{projectsError}</p>}
            {projectsNotice && <p className="form-notice" role="status">{projectsNotice}</p>}
            <form className="person-form" onSubmit={addProject}>
              <div className="form-grid">
                <label>
                  ชื่อโปรเจกต์
                  <input
                    required
                    value={projectDraft.name}
                    onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })}
                    maxLength={160}
                  />
                </label>
                <label>
                  กำหนดเสร็จ
                  <input
                    type="date"
                    value={projectDraft.dueDate}
                    onChange={(event) => setProjectDraft({ ...projectDraft, dueDate: event.target.value })}
                  />
                </label>
                <label className="span-2">
                  ผลลัพธ์ที่ต้องการ (นิยามคำว่าเสร็จ)
                  <textarea
                    value={projectDraft.outcome}
                    onChange={(event) => setProjectDraft({ ...projectDraft, outcome: event.target.value })}
                    rows={2}
                    maxLength={2000}
                  />
                </label>
                <label className="span-2">
                  เป้าหมายที่เกี่ยวข้อง
                  <select
                    value={projectDraft.goalId}
                    onChange={(event) => setProjectDraft({ ...projectDraft, goalId: event.target.value })}
                  >
                    <option value="">ไม่ผูกเป้าหมาย</option>
                    {goals.map((goal) => (
                      <option value={goal.id} key={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="editor-actions">
                <button className="button button-primary" type="submit" disabled={projectsBusy}>
                  {projectsBusy ? 'กำลังบันทึก…' : 'สร้างโปรเจกต์'}
                </button>
              </div>
            </form>
            <p className="sidebar-hint">
              เปอร์เซ็นต์ที่แสดงคือจำนวนงานที่ปิดแล้วหารด้วยงานทั้งหมดในโปรเจกต์ ไม่มีการถ่วงน้ำหนัก
            </p>
          </section>
        ) : viewMode === 'goals' ? (
          <section className="editor-panel work-panel" aria-label="เป้าหมาย">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Goals</span>
                <h2 className="panel-title">เป้าหมาย</h2>
                <p className="updated-label">{goals.length} เป้าหมายที่กำลังติดตาม</p>
              </div>
            </div>
            {goalsError && <p className="form-error editor-error" role="alert">{goalsError}</p>}
            {goalsNotice && <p className="form-notice" role="status">{goalsNotice}</p>}
            <form className="person-form" onSubmit={addGoal}>
              <div className="form-grid">
                <label>
                  ชื่อเป้าหมาย
                  <input
                    required
                    value={goalDraft.title}
                    onChange={(event) => setGoalDraft({ ...goalDraft, title: event.target.value })}
                    maxLength={200}
                  />
                </label>
                <label>
                  หน่วยวัด
                  <input
                    value={goalDraft.unit}
                    onChange={(event) => setGoalDraft({ ...goalDraft, unit: event.target.value })}
                    placeholder="เล่ม / ครั้ง / บาท"
                    maxLength={20}
                  />
                </label>
                <label className="span-2">
                  วัดความสำเร็จอย่างไร
                  <input
                    value={goalDraft.metric}
                    onChange={(event) => setGoalDraft({ ...goalDraft, metric: event.target.value })}
                    placeholder="เช่น จำนวนเล่มที่อ่านจบในปีนี้"
                    maxLength={500}
                  />
                </label>
                <label>
                  ค่าเป้าหมาย (เว้นว่างได้)
                  <input
                    type="number"
                    value={goalDraft.targetValue}
                    onChange={(event) => setGoalDraft({ ...goalDraft, targetValue: event.target.value })}
                  />
                </label>
              </div>
              <div className="editor-actions">
                <button className="button button-primary" type="submit" disabled={goalsBusy}>
                  {goalsBusy ? 'กำลังบันทึก…' : 'เพิ่มเป้าหมาย'}
                </button>
              </div>
            </form>
            <p className="sidebar-hint">
              ถ้าไม่ใส่ค่าเป้าหมาย ระบบจะไม่แสดงเปอร์เซ็นต์เลย เพราะไม่มีข้อมูลรองรับการคำนวณ
            </p>
          </section>
        ) : viewMode === 'people' ? (
          <section className="editor-panel people-panel" aria-label="ข้อมูลบุคคลสำคัญ">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Personal CRM</span>
                <h2 className="panel-title">{activePerson ? activePerson.name : 'เพิ่มบุคคลสำคัญ'}</h2>
                {activePerson?.birthdayOrAnniversary && (
                  <p className="updated-label">
                    {activePerson.birthdayOrAnniversary}
                    {daysUntilNext(activePerson.birthdayOrAnniversary) !== null
                      ? ` · อีก ${daysUntilNext(activePerson.birthdayOrAnniversary)} วัน`
                      : ''}
                  </p>
                )}
              </div>
              <div className="editor-actions">
                <button className="button button-quiet" type="button" onClick={startNewPerson}>
                  ＋ เพิ่มบุคคล
                </button>
                {activePerson && (
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    onClick={() => void deleteActivePerson()}
                    disabled={personBusy}
                  >
                    ลบ
                  </button>
                )}
              </div>
            </div>
            {personError && <p className="form-error editor-error" role="alert">{personError}</p>}
            {personNotice && <p className="form-notice" role="status">{personNotice}</p>}
            <form className="person-form" onSubmit={savePerson}>
              <div className="person-hero">
                <span className="avatar person-avatar large">
                  {personDraft.avatarFileId ? (
                    <img src={`/api/files/${personDraft.avatarFileId}`} alt="" />
                  ) : (
                    personDraft.avatarPreset || (personDraft.name || '?').slice(0, 1)
                  )}
                </span>
                <div className="person-hero-controls">
                  <label>
                    อวตาร
                    <select
                      value={personDraft.avatarPreset ?? ''}
                      onChange={(event) => setPersonDraft({ ...personDraft, avatarPreset: event.target.value })}
                    >
                      <option value="">ใช้ตัวอักษรแรก</option>
                      {['🌿', '🌙', '☀️', '🦊', '🐼', '🌸', '💙', '⭐'].map((preset) => (
                        <option value={preset} key={preset}>{preset}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => personAvatarInputRef.current?.click()}
                    disabled={personAvatarBusy}
                  >
                    {personAvatarBusy ? 'กำลังอัปโหลด…' : 'อัปโหลดรูป'}
                  </button>
                  <input
                    ref={personAvatarInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handlePersonAvatarUpload(event)}
                  />
                </div>
              </div>
              <div className="form-grid">
                <label>
                  ชื่อ
                  <input
                    required
                    value={personDraft.name}
                    onChange={(event) => setPersonDraft({ ...personDraft, name: event.target.value })}
                    maxLength={120}
                  />
                </label>
                <label>
                  กลุ่มความสัมพันธ์
                  <select
                    value={personDraft.relationshipGroup}
                    onChange={(event) => setPersonDraft({
                      ...personDraft,
                      relationshipGroup: event.target.value as RelationshipGroup,
                    })}
                  >
                    <option value="family">ครอบครัว</option>
                    <option value="partner">แฟน / คนพิเศษ</option>
                    <option value="friend">เพื่อน</option>
                  </select>
                </label>
                <label>
                  บทบาท
                  <input
                    value={personDraft.roleLabel ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, roleLabel: event.target.value })}
                    placeholder="เช่น คุณพ่อ, คุณแม่, พี่ชาย"
                    maxLength={80}
                  />
                </label>
                <label>
                  วันเกิด / วันครบรอบ
                  <input
                    type="date"
                    value={personDraft.birthdayOrAnniversary ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, birthdayOrAnniversary: event.target.value })}
                  />
                </label>
                <label>
                  เบอร์โทร
                  <input
                    value={personDraft.phone ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, phone: event.target.value })}
                    maxLength={40}
                  />
                </label>
                <label className="span-2">
                  ของที่ชอบ / อาหารโปรด / สีที่ชอบ
                  <textarea
                    value={personDraft.favoritesAndLikes ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, favoritesAndLikes: event.target.value })}
                    rows={3}
                  />
                </label>
                <label className="span-2">
                  แพ้อะไร / โรคประจำตัว / ยาที่ต้องทาน
                  <textarea
                    value={personDraft.allergiesAndMedical ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, allergiesAndMedical: event.target.value })}
                    rows={3}
                  />
                </label>
                <label className="span-2">
                  ไซส์เสื้อผ้า/รองเท้า/แหวน และของขวัญที่เล็งไว้
                  <textarea
                    value={personDraft.giftIdeasAndSizes ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, giftIdeasAndSizes: event.target.value })}
                    rows={3}
                  />
                </label>
                <label className="span-2">
                  บันทึกเพิ่มเติม
                  <textarea
                    value={personDraft.memo ?? ''}
                    onChange={(event) => setPersonDraft({ ...personDraft, memo: event.target.value })}
                    rows={3}
                  />
                </label>
              </div>
              <div className="editor-actions">
                <button className="button button-primary" type="submit" disabled={personBusy}>
                  {personBusy ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
                {activePerson && (
                  <button className="button button-quiet" type="button" onClick={() => void createReminderForPerson()}>
                    ตั้งแจ้งเตือนวันสำคัญ
                  </button>
                )}
                {activePerson && (
                  <button className="button button-quiet" type="button" onClick={startNoteForPerson}>
                    สร้างโน้ตถึงบุคคลนี้
                  </button>
                )}
              </div>
            </form>
            {activePerson && (
              <section className="linked-notes">
                <h3>โน้ตที่เชื่อมโยง</h3>
                {personNotes.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีโน้ตที่เชื่อมโยงกับบุคคลนี้</p>
                ) : (
                  personNotes.map((note) => (
                    <button
                      className="note-list-item"
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setViewMode('notes');
                        activateNote(note);
                        isNewNoteRef.current = true;
                      }}
                    >
                      <strong>{note.title}</strong>
                      <span>{note.content || 'ไม่มีเนื้อหา'}</span>
                    </button>
                  ))
                )}
              </section>
            )}
          </section>
        ) : viewMode === 'schedule' ? (
          <section className="editor-panel schedule-panel" aria-label="ปฏิทินและตารางชีวิต">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Life OS</span>
                <h2 className="panel-title">ตารางชีวิต</h2>
                <p className="updated-label">{scheduleDate}</p>
              </div>
              <div className="editor-actions">
                <button className="button button-quiet" type="button" onClick={() => setViewMode('notes')}>
                  ไปที่โน้ต
                </button>
              </div>
            </div>
            {scheduleError && <p className="form-error editor-error" role="alert">{scheduleError}</p>}
            {scheduleNotice && <p className="form-notice" role="status">{scheduleNotice}</p>}
            <div className="schedule-grid">
              <section className="life-card">
                <div className="life-card-head">
                  <h3>แจ้งเตือนวันสำคัญ</h3>
                  <span className="note-count">{reminders.filter((reminder) => reminder.isCompleted === 0).length}</span>
                </div>
                <form className="inline-form" onSubmit={addReminder}>
                  <input
                    required
                    placeholder="ชื่อแจ้งเตือน"
                    value={reminderDraft.title}
                    onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })}
                    maxLength={200}
                  />
                  <input
                    type="date"
                    required
                    value={reminderDraft.targetDate}
                    onChange={(event) => setReminderDraft({ ...reminderDraft, targetDate: event.target.value })}
                  />
                  <select
                    value={reminderDraft.category}
                    onChange={(event) => setReminderDraft({
                      ...reminderDraft,
                      category: event.target.value as ReminderCategory,
                    })}
                  >
                    <option value="birthday">วันเกิด</option>
                    <option value="anniversary">วันครบรอบ</option>
                    <option value="health">สุขภาพ</option>
                    <option value="backup">แผนสำรอง</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                  <select
                    value={reminderDraft.linkedPersonId}
                    onChange={(event) => setReminderDraft({ ...reminderDraft, linkedPersonId: event.target.value })}
                  >
                    <option value="">ไม่ผูกกับบุคคล</option>
                    {people.map((person) => (
                      <option value={person.id} key={person.id}>{person.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={reminderDraft.notifyDaysBefore}
                    onChange={(event) => setReminderDraft({ ...reminderDraft, notifyDaysBefore: event.target.value })}
                    aria-label="แจ้งล่วงหน้ากี่วัน"
                  />
                  <select
                    value={reminderDraft.recurrence}
                    onChange={(event) => setReminderDraft({
                      ...reminderDraft,
                      recurrence: event.target.value as NonNullable<Reminder['recurrence']>,
                    })}
                    aria-label="การเกิดซ้ำของแจ้งเตือน"
                  >
                    <option value="none">ไม่ซ้ำ</option>
                    <option value="daily">ทุกวัน</option>
                    <option value="weekly">ทุกสัปดาห์</option>
                    <option value="monthly">ทุกเดือน</option>
                    <option value="yearly">ทุกปี</option>
                  </select>
                  <button className="button button-primary" type="submit" disabled={scheduleBusy}>เพิ่ม</button>
                </form>
                <ul className="life-list">
                  {reminders.map((reminder) => (
                    <li className={reminder.isCompleted ? 'is-done' : ''} key={reminder.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={reminder.isCompleted === 1}
                          onChange={() => void toggleReminder(reminder)}
                        />
                        <span>
                          <strong>{reminder.title}</strong>
                          <small>
                            {reminder.snoozedUntil
                              ? `เลื่อนไป ${reminder.snoozedUntil} (เดิม ${reminder.targetDate})`
                              : reminder.targetDate}
                            {' · '}{reminderCategoryLabel(reminder.category)}
                            {reminder.recurrence && reminder.recurrence !== 'none' ? ` · ↻ ${reminder.recurrence}` : ''}
                            {reminder.linkedPersonName ? ` · ${reminder.linkedPersonName}` : ''}
                          </small>
                        </span>
                      </label>
                      {reminder.isCompleted !== 1 && (
                        <span className="snooze-group">
                          <button className="text-button" type="button" disabled={scheduleBusy} onClick={() => void snooze(reminder, 1)}>+1 วัน</button>
                          <button className="text-button" type="button" disabled={scheduleBusy} onClick={() => void snooze(reminder, 3)}>+3 วัน</button>
                          <button className="text-button" type="button" disabled={scheduleBusy} onClick={() => void snooze(reminder, 7)}>+1 สัปดาห์</button>
                        </span>
                      )}
                      <button className="text-button danger-text" type="button" onClick={() => void removeReminder(reminder)}>
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="life-card">
                <div className="life-card-head">
                  <h3>ตารางชีวิต {scheduleDate}</h3>
                  <span className="note-count">
                    {timeblocks.filter((block) => block.isDone === 1).length}/{timeblocks.length}
                  </span>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${timeblocks.length === 0 ? 0 : Math.round((timeblocks.filter((block) => block.isDone === 1).length / timeblocks.length) * 100)}%` }} />
                </div>
                <form className="inline-form" onSubmit={addTimeblock}>
                  <input
                    required
                    placeholder="06:30 - 07:30"
                    value={blockDraft.timeRange}
                    onChange={(event) => setBlockDraft({ ...blockDraft, timeRange: event.target.value })}
                    maxLength={40}
                  />
                  <input
                    required
                    placeholder="ชื่อกิจกรรม"
                    value={blockDraft.title}
                    onChange={(event) => setBlockDraft({ ...blockDraft, title: event.target.value })}
                    maxLength={200}
                  />
                  <select
                    value={blockDraft.lifeArea}
                    onChange={(event) => setBlockDraft({ ...blockDraft, lifeArea: event.target.value as LifeArea })}
                  >
                    <option value="health">สุขภาพ</option>
                    <option value="focus_work">งานโฟกัส</option>
                    <option value="family">ครอบครัว/แฟน</option>
                    <option value="growth">พัฒนาตัวเอง</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                  <button className="button button-primary" type="submit" disabled={scheduleBusy}>เพิ่ม</button>
                </form>
                <ul className="life-list">
                  {timeblocks.map((block) => (
                    <li className={block.isDone ? 'is-done' : ''} key={block.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={block.isDone === 1}
                          onChange={() => void toggleTimeblock(block)}
                        />
                        <span>
                          <strong>{block.timeRange} · {block.title}</strong>
                          <small>{lifeAreaLabel(block.lifeArea)}</small>
                        </span>
                      </label>
                      <button className="text-button danger-text" type="button" onClick={() => void removeTimeblock(block)}>
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="life-card">
                <div className="life-card-head">
                  <h3>กิจวัตรประจำวัน</h3>
                  <span className="note-count">{habits.length}</span>
                </div>
                <form className="inline-form" onSubmit={addHabit}>
                  <input
                    required
                    placeholder="ชื่อกิจวัตร"
                    value={habitDraft.title}
                    onChange={(event) => setHabitDraft({ ...habitDraft, title: event.target.value })}
                    maxLength={120}
                  />
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={habitDraft.dailyTarget}
                    onChange={(event) => setHabitDraft({ ...habitDraft, dailyTarget: event.target.value })}
                    aria-label="เป้าหมายต่อวัน"
                  />
                  <input
                    value={habitDraft.unit}
                    onChange={(event) => setHabitDraft({ ...habitDraft, unit: event.target.value })}
                    placeholder="หน่วย"
                    maxLength={20}
                  />
                  <button className="button button-primary" type="submit" disabled={scheduleBusy}>เพิ่ม</button>
                </form>
                <ul className="habit-list">
                  {habits.map((habit) => (
                    <li key={habit.id}>
                      <div className="habit-copy">
                        <strong>{habit.title}</strong>
                        <small>
                          {habit.currentCount}/{habit.dailyTarget} {habit.unit} · ต่อเนื่อง {habit.streakDays} วัน
                          {(() => {
                            const week = habitWeek?.habits.find((entry) => entry.habitId === habit.id);
                            return week ? ` · สัปดาห์นี้ ${week.weekMetTarget}/${week.days.length} วัน` : '';
                          })()}
                        </small>
                        <div className="progress-track" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, Math.round((habit.currentCount / habit.dailyTarget) * 100))}%` }} />
                        </div>
                        {(() => {
                          const week = habitWeek?.habits.find((entry) => entry.habitId === habit.id);
                          if (!week) return null;
                          return (
                            <div className="habit-dots" aria-label={`ประวัติ 7 วันของ ${habit.title}`}>
                              {week.days.map((day) => (
                                <button
                                  key={day.date}
                                  className={`habit-dot${day.metTarget === true ? ' is-met' : ''}${day.count !== null && day.count > 0 && day.metTarget !== true ? ' is-partial' : ''}${day.count === null ? ' is-untracked' : ''}`}
                                  type="button"
                                  disabled={scheduleBusy || day.count === null}
                                  title={day.count === null
                                    ? `${day.date} · ไม่มีข้อมูล (ก่อนเริ่มเก็บประวัติ)`
                                    : `${day.date} · ${day.count} ${habit.unit}`}
                                  aria-label={day.count === null
                                    ? `${day.date} ไม่มีข้อมูล`
                                    : `${day.date} ${day.count} ${habit.unit}`}
                                  onClick={() => void correctHabitDay(habit, day.date, day.count)}
                                >
                                  {day.date.slice(8)}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {habit.legacyStreakDays ? (
                          <small className="habit-legacy">
                            ก่อนเริ่มเก็บประวัติ: {habit.legacyStreakDays} วัน (ตรวจสอบย้อนหลังไม่ได้)
                          </small>
                        ) : null}
                      </div>
                      <button className="button button-primary" type="button" onClick={() => void checkHabitToday(habit)}>
                        +1
                      </button>
                      <button className="text-button danger-text" type="button" onClick={() => void removeHabit(habit)}>
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
        ) : viewMode === 'notes' ? (
          <section className="editor-panel" aria-label={activeNote ? 'แก้ไขโน้ต' : 'สร้างโน้ต'}>
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">{activeNote ? 'บันทึกส่วนตัว' : 'โน้ตใหม่'}</span>
                {activeNote && <p className="updated-label">แก้ไขล่าสุด {formatDate(activeNote.updatedAt)}</p>}
              </div>
              <div className="editor-actions note-actions">
                {activeNote && (
                  <button
                    className={`icon-button star-button${noteFavorited ? ' is-on' : ''}`}
                    type="button"
                    aria-label={noteFavorited ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
                    aria-pressed={noteFavorited}
                    title={noteFavorited ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
                    onClick={() => void toggleFavorite('note', activeNote.id, noteFavorited)}
                    disabled={favoriteBusy || saveBusy}
                  >
                    {noteFavorited ? '★' : '☆'}
                  </button>
                )}
                {activeNote && (
                  <div className="menu-wrap">
                    <button
                      className="icon-button"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={noteMenuOpen}
                      aria-label="ตัวเลือกโน้ต"
                      onClick={() => setNoteMenuOpen((open) => !open)}
                      disabled={saveBusy}
                    >
                      ⋯
                    </button>
                    {noteMenuOpen && (
                      <div className="menu-popover" role="menu">
                        <button
                          className="menu-item is-danger"
                          type="button"
                          role="menuitem"
                          onClick={() => void handleDelete()}
                        >
                          ย้ายไปถังขยะ
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  className="icon-button"
                  type="button"
                  aria-label={focusMode ? 'ออกจากโหมดโฟกัส' : 'โหมดโฟกัส'}
                  title={focusMode ? 'ออกจากโหมดโฟกัส' : 'โหมดโฟกัส'}
                  onClick={() => setFocusMode((value) => !value)}
                >
                  ⛶
                </button>
                <span
                  className={`save-state save-state-${saveState}`}
                  role="status"
                  aria-live="polite"
                >
                  {saveState === 'saving' ? 'กำลังบันทึก…'
                    : saveState === 'saved' ? 'บันทึกแล้ว'
                      : saveState === 'error' ? 'บันทึกไม่สำเร็จ' : ''}
                </span>
                {saveState === 'error' && (
                  <button className="button button-quiet" type="button" onClick={() => void flushAutosave()}>
                    ลองอีกครั้ง
                  </button>
                )}
                <button
                  className="button button-primary"
                  type="submit"
                  form="note-editor"
                  disabled={saveBusy || taxonomyRelationsBusy || taxonomyRelationsUnavailable}
                >
                  {saveBusy ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </div>
            </div>

            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <form id="note-editor" className="note-editor" onSubmit={handleSave}>
              <input
                className="title-input"
                aria-label="หัวข้อโน้ต"
                placeholder="ตั้งชื่อโน้ต…"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
              />
              <div className="note-chips" aria-label="หมวดหมู่และแท็กของโน้ต">
                {selectedCategoryNames.map((item) => (
                  <span className="chip" key={`cat-${item.id}`}>
                    <span className="chip-kind">หมวด</span>
                    {item.name}
                    <button
                      className="chip-remove"
                      type="button"
                      aria-label={`นำ ${item.name} ออก`}
                      onClick={() => toggleRelation('categories', item.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedTagNames.map((item) => (
                  <span className="chip" key={`tag-${item.id}`}>
                    <span className="chip-kind">แท็ก</span>
                    {item.name}
                    <button
                      className="chip-remove"
                      type="button"
                      aria-label={`นำ ${item.name} ออก`}
                      onClick={() => toggleRelation('tags', item.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedPeople.map((person) => (
                  <span className="chip person-chip" key={`person-${person.id}`}>
                    <span className="chip-kind">บุคคล</span>
                    {person.name}
                    <button
                      className="chip-remove"
                      type="button"
                      aria-label={`นำ ${person.name} ออก`}
                      onClick={() => setSelectedPersonIds((current) => current.filter((id) => id !== person.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="chip-add-wrap">
                  <button
                    className={`chip-add${chipPicker === 'categories' ? ' is-open' : ''}`}
                    type="button"
                    onClick={() => setChipPicker(chipPicker === 'categories' ? null : 'categories')}
                  >
                    ＋ หมวดหมู่
                  </button>
                  <button
                    className={`chip-add${chipPicker === 'tags' ? ' is-open' : ''}`}
                    type="button"
                    onClick={() => {
                      setPersonPickerOpen(false);
                      setChipPicker(chipPicker === 'tags' ? null : 'tags');
                    }}
                  >
                    ＋ แท็ก
                  </button>
                  <button
                    className={`chip-add${personPickerOpen ? ' is-open' : ''}`}
                    type="button"
                    onClick={() => {
                      setChipPicker(null);
                      setPersonPickerOpen((open) => !open);
                    }}
                  >
                    ＋ บุคคล
                  </button>
                </div>
                {chipPicker && (
                  <div className="chip-popover">
                    <div className="chip-popover-head">
                      <strong>{chipPicker === 'categories' ? 'เลือกหมวดหมู่' : 'เลือกแท็ก'}</strong>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="ปิด"
                        onClick={() => setChipPicker(null)}
                      >
                        ×
                      </button>
                    </div>
                    {renderTaxonomyGroup(chipPicker, 'select')}
                  </div>
                )}
                {personPickerOpen && (
                  <div className="chip-popover">
                    <div className="chip-popover-head">
                      <strong>เลือกบุคคลที่เกี่ยวข้อง</strong>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="ปิด"
                        onClick={() => setPersonPickerOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                    {people.length === 0 ? (
                      <p className="sidebar-hint">ยังไม่มีบุคคลสำคัญ</p>
                    ) : (
                      <ul className="taxonomy-list">
                        {people.map((person) => (
                          <li key={person.id}>
                            <label className="taxonomy-choice">
                              <input
                                type="checkbox"
                                checked={selectedPersonIds.includes(person.id)}
                                onChange={() => {
                                  setSelectedPersonIds((current) => (
                                    current.includes(person.id)
                                      ? current.filter((id) => id !== person.id)
                                      : [...current, person.id]
                                  ));
                                }}
                              />
                              <span>{person.name}{person.roleLabel ? ` · ${person.roleLabel}` : ''}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              {taxonomyRelationsUnavailable && (
                <p className="form-error chip-error" role="alert">
                  โหลดหมวดหมู่และแท็กของโน้ตไม่สำเร็จ{' '}
                  <button className="button button-quiet" type="button" onClick={retryTaxonomyLoad}>
                    ลองอีกครั้ง
                  </button>
                </p>
              )}
              {taxonomyError && <p className="form-error chip-error" role="alert">{taxonomyError}</p>}
              {taxonomyNotice && <p className="form-notice chip-error" role="status">{taxonomyNotice}</p>}
              <textarea
                aria-label="เนื้อหาโน้ต"
                placeholder="เริ่มเขียนความคิดของคุณที่นี่…"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={100000}
              />
              <div className="editor-footer">
                <span>บันทึกเฉพาะในพื้นที่ส่วนตัวของคุณ</span>
                <span>{content.length.toLocaleString('th-TH')} / 100,000</span>
              </div>
            </form>
          </section>
        ) : viewMode === 'bookmarks' ? (
          <section className="editor-panel" aria-label={activeBookmark ? 'แก้ไขบุ๊กมาร์ก' : 'เพิ่มบุ๊กมาร์ก'}>
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">{activeBookmark ? 'ลิงก์ที่บันทึกไว้' : 'บุ๊กมาร์กใหม่'}</span>
                {activeBookmark && <p className="updated-label">แก้ไขล่าสุด {formatDate(activeBookmark.updatedAt)}</p>}
              </div>
              <div className="editor-actions">
                {activeBookmark && (
                  <button
                    className="button button-quiet favorite-toggle"
                    type="button"
                    aria-pressed={bookmarkFavorited}
                    onClick={() => void toggleFavorite('bookmark', activeBookmark.id, bookmarkFavorited)}
                    disabled={favoriteBusy || saveBusy}
                  >
                    {bookmarkFavorited ? '★ รายการโปรด' : '☆ เพิ่มในรายการโปรด'}
                  </button>
                )}
                {activeBookmark && (
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    onClick={handleDeleteBookmark}
                    disabled={saveBusy}
                  >
                    ลบบุ๊กมาร์ก
                  </button>
                )}
                <button className="button button-primary" type="submit" form="bookmark-editor" disabled={saveBusy}>
                  {saveBusy ? 'กำลังบันทึก…' : 'บันทึกบุ๊กมาร์ก'}
                </button>
              </div>
            </div>

            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <form id="bookmark-editor" className="note-editor" onSubmit={handleSaveBookmark}>
              <input
                className="title-input"
                aria-label="ชื่อบุ๊กมาร์ก"
                placeholder="ตั้งชื่อบุ๊กมาร์ก…"
                value={bookmarkTitle}
                onChange={(event) => setBookmarkTitle(event.target.value)}
                required
                maxLength={200}
              />
              <input
                className="title-input"
                type="url"
                aria-label="URL"
                placeholder="https://example.com"
                value={bookmarkUrl}
                onChange={(event) => setBookmarkUrl(event.target.value)}
                required
                maxLength={2048}
              />
              <textarea
                aria-label="คำอธิบายบุ๊กมาร์ก"
                placeholder="บันทึกคำอธิบายสั้น ๆ…"
                value={bookmarkDescription}
                onChange={(event) => setBookmarkDescription(event.target.value)}
                maxLength={5000}
              />
              {activeBookmark && (
                <a href={activeBookmark.url} target="_blank" rel="noreferrer">
                  เปิดลิงก์ในแท็บใหม่
                </a>
              )}
              <div className="editor-footer">
                <span>ข้อมูลลิงก์กรอกและจัดเก็บในเครื่องนี้เท่านั้น</span>
                <span>{bookmarkDescription.length.toLocaleString('th-TH')} / 5,000</span>
              </div>
            </form>
          </section>
        ) : viewMode === 'favorites' ? (
          <section className="editor-panel" aria-label="รายละเอียดรายการโปรด">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">รายการโปรด</span>
                {activeFavorite && (
                  <p className="updated-label">
                    {activeFavorite.itemType === 'note' ? 'โน้ต' : 'บุ๊กมาร์ก'} · เพิ่มเมื่อ {formatDate(activeFavorite.createdAt)}
                  </p>
                )}
              </div>
              {activeFavorite && (
                <div className="editor-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void openFavorite(activeFavorite)}
                  >
                    เปิดรายการ
                  </button>
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    disabled={favoriteBusy}
                    onClick={() => void toggleFavorite(activeFavorite.itemType, activeFavorite.itemId, true)}
                  >
                    นำออกจากรายการโปรด
                  </button>
                </div>
              )}
            </div>
            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            {activeFavorite ? (
              <article className="favorite-preview">
                <h2>{activeFavorite.title}</h2>
                <p className="favorite-subtitle">{activeFavorite.subtitle || 'ไม่มีรายละเอียด'}</p>
                <dl className="file-facts">
                  <div>
                    <dt>ประเภท</dt>
                    <dd>{activeFavorite.itemType === 'note' ? 'โน้ต' : 'บุ๊กมาร์ก'}</dd>
                  </div>
                  <div>
                    <dt>แก้ไขล่าสุด</dt>
                    <dd>{formatDate(activeFavorite.updatedAt)}</dd>
                  </div>
                </dl>
              </article>
            ) : (
              <div className="empty-state trash-empty">
                <span className="empty-icon" aria-hidden="true">★</span>
                <strong>เลือกรายการโปรด</strong>
                <span>รายการที่คุณทำเครื่องหมายดาวจะแสดงที่นี่</span>
              </div>
            )}
          </section>
        ) : viewMode === 'files' ? (
          <section className="editor-panel" aria-label="รายละเอียดไฟล์">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">พื้นที่จัดเก็บไฟล์</span>
                {activeFile && <p className="updated-label">อัปโหลดเมื่อ {formatDate(activeFile.createdAt)}</p>}
              </div>
              {activeFile && (
                <div className="editor-actions">
                  <a className="button button-primary" href={activeFile.downloadUrl} download={activeFile.displayName}>
                    ดาวน์โหลด
                  </a>
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    onClick={() => void handleDeleteFile(activeFile)}
                  >
                    ลบไฟล์
                  </button>
                </div>
              )}
            </div>
            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            {activeFile ? (
              <article className="favorite-preview">
                <h2 className="file-title">{activeFile.displayName}</h2>
                <dl className="file-facts">
                  <div>
                    <dt>ขนาด</dt>
                    <dd>{formatBytes(activeFile.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>ชนิดไฟล์ที่ตรวจพบ</dt>
                    <dd>{activeFile.mediaType}</dd>
                  </div>
                  <div>
                    <dt>SHA-256</dt>
                    <dd><code>{activeFile.sha256}</code></dd>
                  </div>
                </dl>
                <p className="file-note">
                  ไฟล์ถูกเก็บในพื้นที่ส่วนตัวของคุณ ระบบตรวจชนิดไฟล์จากเนื้อหาและไม่แสดงไฟล์ที่อาจเป็นอันตรายแบบฝังในหน้าเว็บ
                </p>
              </article>
            ) : (
              <div className="empty-state trash-empty">
                <span className="empty-icon" aria-hidden="true">▤</span>
                <strong>เลือกไฟล์</strong>
                <span>อัปโหลดไฟล์แล้วเลือกจากรายการด้านซ้ายเพื่อดูรายละเอียด</span>
              </div>
            )}
          </section>
        ) : viewMode === 'all' ? (
          <section className="editor-panel" aria-label="ภาพรวมทั้งหมด">
            <div className="empty-state trash-empty">
              <span className="empty-icon" aria-hidden="true">▦</span>
              <strong>เลือกรายการจากทั้งหมด</strong>
              <span>โน้ต ลิงก์ และไฟล์จะเปิดในมุมมองของแต่ละประเภท</span>
            </div>
          </section>
        ) : (
          <section className="editor-panel trash-panel" aria-label="จัดการโน้ตในถังขยะ">
            <p className="trash-retention" role="note">
              หมายเหตุ: นโยบายเก็บถังขยะ 30 วันเป็นข้อมูลเตือนเท่านั้น ระบบไม่ลบโน้ตอัตโนมัติ
            </p>
            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            {activeTrashNote ? (
              <>
                <div className="editor-toolbar">
                  <div>
                    <span className="eyebrow">รายการในถังขยะ</span>
                    <p className="updated-label">ย้ายเมื่อ {formatDate(activeTrashNote.updatedAt)}</p>
                  </div>
                  <div className="editor-actions">
                    <button className="button button-quiet" type="button" onClick={handleRestore} disabled={saveBusy}>
                      {saveBusy ? 'กำลังดำเนินการ…' : 'กู้คืน'}
                    </button>
                    <button
                      className="button button-danger-quiet"
                      type="button"
                      onClick={() => setPermanentDeleteOpen(true)}
                      disabled={saveBusy}
                    >
                      ลบถาวร
                    </button>
                  </div>
                </div>
                <article className="trash-preview">
                  <h2>{activeTrashNote.title}</h2>
                  <p>{activeTrashNote.content || 'ไม่มีเนื้อหา'}</p>
                </article>
              </>
            ) : (
              <div className="empty-state trash-empty">
                <span className="empty-icon" aria-hidden="true">⌫</span>
                <strong>เลือกโน้ตที่ต้องการจัดการ</strong>
                <span>กู้คืนหรือเลือกลบถาวรได้จากรายการด้านซ้าย</span>
              </div>
            )}
          </section>
        )}
        </div>
      </div>

      {themeOpen && (
        <div className="dialog-backdrop" onClick={() => setThemeOpen(false)}>
          <section
            className="studio-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Theme and Color Studio"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="popover-head">
              <h2>Theme & Color Studio</h2>
              <button className="icon-button" type="button" aria-label="ปิด" onClick={() => setThemeOpen(false)}>×</button>
            </div>
            <div className="theme-grid">
              {themes.map((item) => (
                <button
                  className={`theme-swatch${theme === item.name ? ' is-active' : ''}`}
                  key={item.name}
                  type="button"
                  onClick={() => setTheme(item.name)}
                >
                  <span className="swatch-dot" style={{ background: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mode-toggle">
              <button
                className={`button ${themeMode === 'light' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setThemeMode('light')}
              >
                Light
              </button>
              <button
                className={`button ${themeMode === 'dark' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setThemeMode('dark')}
              >
                Dark
              </button>
            </div>
          </section>
        </div>
      )}

      {profileOpen && (
        <div className="dialog-backdrop" onClick={() => setProfileOpen(false)}>
          <section
            className="studio-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="โปรไฟล์ของฉัน"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="popover-head">
              <h2>โปรไฟล์ของฉัน</h2>
              <button className="icon-button" type="button" aria-label="ปิด" onClick={() => setProfileOpen(false)}>×</button>
            </div>
            <form className="profile-form" onSubmit={saveProfile}>
              <label>
                ชื่อที่แสดง
                <input
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  placeholder={user?.username ?? ''}
                  maxLength={80}
                />
              </label>
              <label>
                สเตตัสประจำวัน
                <input
                  value={profile.status}
                  onChange={(event) => setProfile({ ...profile, status: event.target.value })}
                  maxLength={120}
                />
              </label>
              <div className="avatar-row">
                <span className="avatar profile-avatar large">
                  {profile.avatarFileId ? (
                    <img src={`/api/files/${profile.avatarFileId}`} alt="" />
                  ) : (
                    profile.avatarPreset || (profile.name || user?.username || 'P').slice(0, 1)
                  )}
                </span>
                <select
                  value={profile.avatarPreset}
                  onChange={(event) => setProfile({ ...profile, avatarPreset: event.target.value })}
                  aria-label="อวตารสำเร็จรูป"
                >
                  {['🌿', '🌙', '☀️', '🦊', '🐼', '🌸', '💙', '⭐'].map((preset) => (
                    <option value={preset} key={preset}>{preset}</option>
                  ))}
                </select>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => profileAvatarInputRef.current?.click()}
                >
                  อัปโหลดรูป
                </button>
                <input
                  ref={profileAvatarInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleProfileAvatarUpload(event)}
                />
              </div>
              <button className="button button-primary" type="submit">บันทึกโปรไฟล์</button>
            </form>
          </section>
        </div>
      )}

      {commandOpen && (
        <div className="dialog-backdrop" onClick={() => setCommandOpen(false)}>
          <section
            className="command-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="ค้นหาด่วน"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="command-input-row">
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => {
                  setCommandQuery(event.target.value);
                  setCommandBusy(true);
                  setCommandResults(null);
                }}
                placeholder="ค้นหาโน้ต บุคคล ของที่ชอบ แจ้งเตือน…"
                maxLength={120}
              />
              <button className="icon-button" type="button" aria-label="ปิด" onClick={() => setCommandOpen(false)}>×</button>
            </div>
            {commandBusy && <p className="sidebar-hint">กำลังค้นหา…</p>}
            {commandResults && (
              <div className="command-results">
                {commandResults.notes.length === 0
                  && commandResults.people.length === 0
                  && commandResults.reminders.length === 0 && (
                    <p className="sidebar-hint">ไม่พบผลลัพธ์</p>
                  )}
                {commandResults.notes.map((note) => (
                  <button className="command-item" type="button" key={`note-${note.id}`} onClick={() => navigateCommand('note', note.id)}>
                    <span className="entry-kind">โน้ต</span>
                    <span>{note.title}</span>
                  </button>
                ))}
                {commandResults.people.map((person) => (
                  <button className="command-item" type="button" key={`person-${person.id}`} onClick={() => navigateCommand('person', person.id)}>
                    <span className="entry-kind bookmark">บุคคล</span>
                    <span>{person.name}{person.roleLabel ? ` · ${person.roleLabel}` : ''}</span>
                  </button>
                ))}
                {commandResults.reminders.map((reminder) => (
                  <button className="command-item" type="button" key={`reminder-${reminder.id}`} onClick={() => navigateCommand('reminder', reminder.id)}>
                    <span className="entry-kind file">แจ้งเตือน</span>
                    <span>{reminder.title} · {reminder.targetDate}</span>
                  </button>
                ))}
              </div>
            )}
            {!commandResults && !commandBusy && (
              <p className="sidebar-hint">พิมพ์ชื่อโน้ต บุคคล หรือวันสำคัญ — กด Esc เพื่อปิด</p>
            )}
          </section>
        </div>
      )}

      <div className="toast-stack" role="region" aria-label="การแจ้งเตือน">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{toast.message}</span>
            <button
              className="icon-button toast-close"
              type="button"
              aria-label="ปิดการแจ้งเตือน"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {permanentDeleteOpen && activeTrashNote && (
        <div className="dialog-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="permanent-delete-title"
            aria-describedby="permanent-delete-description"
          >
            <span className="eyebrow">ยืนยันการลบ</span>
            <h2 id="permanent-delete-title">ลบโน้ตนี้ถาวรหรือไม่?</h2>
            <p id="permanent-delete-description">
              “{activeTrashNote.title}” จะถูกลบและไม่สามารถกู้คืนได้ การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            {notesError && <p className="form-error" role="alert">{notesError}</p>}
            <div className="editor-actions">
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setPermanentDeleteOpen(false)}
                disabled={saveBusy}
              >
                ยกเลิก
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={handlePermanentDelete}
                disabled={saveBusy}
              >
                {saveBusy ? 'กำลังลบ…' : 'ยืนยันลบถาวร'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
