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
  linkEntityFile,
  listEntityFiles,
  unlinkEntityFile,
  uploadFile,
  listVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  listLibraryItems,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  type AttachmentEntityType,
  type EntityLinkedFile,
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
  getCustomCategoryItems,
  linkItemToCustomCategory,
  unlinkItemFromCustomCategory,
  getItemCustomCategory,
  setItemCustomCategory,
  type CustomCategory,
  type CustomCategoryItemsResult,
} from './api';
import {
  type NotesView,
  type SidebarNavItem,
  loadSidebarNav,
  saveSidebarNav,
  resetSidebarNav,
} from './sidebarNav';
import './App.css';

type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'unavailable';
// NotesView is imported from ./sidebarNav
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

const ALL_SEARCH_TYPES: SearchBucketType[] = [
  'notes',
  'tasks',
  'projects',
  'goals',
  'people',
  'reminders',
  'bookmarks',
  'files',
  'vault',
  'library',
];

const SEARCH_TYPE_LABELS: Array<{ type: SearchBucketType; label: string }> = [
  { type: 'notes', label: 'โน้ต' },
  { type: 'tasks', label: 'งาน' },
  { type: 'projects', label: 'โปรเจกต์' },
  { type: 'goals', label: 'เป้าหมาย' },
  { type: 'people', label: 'บุคคล' },
  { type: 'reminders', label: 'แจ้งเตือน' },
  { type: 'bookmarks', label: 'บุ๊กมาร์ก' },
  { type: 'files', label: 'ไฟล์' },
  { type: 'vault', label: 'คลังสำคัญ' },
  { type: 'library', label: 'ห้องสมุด' },
];

const VAULT_CATEGORIES: VaultCategory[] = ['เอกสาร & ประกัน', 'ทรัพย์สิน & บ้าน', 'รอบบิลรายเดือน'];
const LIBRARY_CATEGORIES: LibraryCategory[] = ['คู่มือชีวิต & SOP', 'หนังสือ & คอร์สเรียน', 'โพยคำสั่ง & สูตร'];
const LIBRARY_STATUSES: LibraryStatus[] = ['ใช้งานประจำ', 'กำลังศึกษา', 'สรุปจบแล้ว'];

/** Category tint used by badges, so each kind of record is recognisable at a glance. */
function vaultTone(category: VaultCategory): string {
  if (category === 'ทรัพย์สิน & บ้าน') return 'asset';
  if (category === 'รอบบิลรายเดือน') return 'bill';
  return 'paper';
}

function libraryTone(category: LibraryCategory): string {
  if (category === 'หนังสือ & คอร์สเรียน') return 'book';
  if (category === 'โพยคำสั่ง & สูตร') return 'cheat';
  return 'sop';
}

function libraryStatusTone(status: LibraryStatus): string {
  if (status === 'กำลังศึกษา') return 'studying';
  if (status === 'สรุปจบแล้ว') return 'done';
  return 'active';
}

/** Whole days from today to an ISO date; negative means already past. */
function daysUntilIso(iso: string | null): number | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

interface VaultDraft {
  title: string;
  category: VaultCategory;
  keyValue: string;
  physicalLocation: string;
  renewalOrExpiryDate: string;
  amountText: string;
  notes: string;
}

const emptyVaultDraft: VaultDraft = {
  title: '',
  category: VAULT_CATEGORIES[0],
  keyValue: '',
  physicalLocation: '',
  renewalOrExpiryDate: '',
  amountText: '',
  notes: '',
};

interface LibraryDraft {
  title: string;
  category: LibraryCategory;
  status: LibraryStatus;
  sourceUrlOrAuthor: string;
  keyTakeaways: string;
  content: string;
}

const emptyLibraryDraft: LibraryDraft = {
  title: '',
  category: LIBRARY_CATEGORIES[0],
  status: LIBRARY_STATUSES[0],
  sourceUrlOrAuthor: '',
  keyTakeaways: '',
  content: '',
};

function EntityAttachments({
  entityType,
  entityId,
  availableFiles,
  onFilesChanged,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  availableFiles: StoredFile[];
  onFilesChanged: () => void;
}) {
  const [linkedFiles, setLinkedFiles] = useState<EntityLinkedFile[]>([]);
  const [libraryFiles, setLibraryFiles] = useState<StoredFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // The parent only keeps its file list while the library view is open, so the picker
    // loads the same library itself instead of depending on the current view.
    let active = true;
    listFiles(1, 100)
      .then((page) => {
        if (active) setLibraryFiles(page.files);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listEntityFiles(entityType, entityId)
      .then((items) => {
        if (!active) return;
        setLinkedFiles(items);
        setSelectedFileId('');
        setError('');
        setNotice('');
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  const mergedFiles = [...availableFiles, ...libraryFiles].filter(
    (file, index, all) => all.findIndex((item) => item.id === file.id) === index,
  );
  const attachableFiles = mergedFiles.filter(
    (file) => !linkedFiles.some((linked) => linked.id === file.id),
  );

  async function handleLinkExisting() {
    if (!selectedFileId) {
      setError('กรุณาเลือกไฟล์ที่ต้องการแนบ');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await linkEntityFile(entityType, entityId, selectedFileId);
      setLinkedFiles(result.files);
      setSelectedFileId('');
      setNotice(result.created ? 'แนบไฟล์แล้ว' : 'ไฟล์นี้แนบอยู่แล้ว');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAndLink(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const uploaded = await uploadFile(file);
      const result = await linkEntityFile(entityType, entityId, uploaded.id);
      setLibraryFiles((current) => (current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]));
      setLinkedFiles(result.files);
      setNotice('อัปโหลดและแนบไฟล์แล้ว');
      onFilesChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink(fileId: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await unlinkEntityFile(entityType, entityId, fileId);
      setLinkedFiles((current) => current.filter((item) => item.id !== fileId));
      setNotice('เอาไฟล์แนบออกแล้ว (ไฟล์ในคลังยังอยู่ครบ)');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="entity-attachments" aria-label="ไฟล์แนบ">
      <div className="entity-attachments-head">
        <strong>ไฟล์แนบ ({linkedFiles.length})</strong>
        <div className="entity-attachments-controls">
          <select
            aria-label="เลือกไฟล์ที่มีอยู่เพื่อแนบ"
            value={selectedFileId}
            disabled={busy || attachableFiles.length === 0}
            onChange={(event) => setSelectedFileId(event.target.value)}
          >
            <option value="">
              {attachableFiles.length === 0 ? 'ไม่มีไฟล์อื่นให้เลือกแนบ' : 'เลือกไฟล์จากคลัง…'}
            </option>
            {attachableFiles.map((file) => (
              <option value={file.id} key={file.id}>
                {file.displayName} ({formatBytes(file.sizeBytes)})
              </option>
            ))}
          </select>
          <button
            className="button button-quiet"
            type="button"
            disabled={busy || !selectedFileId}
            onClick={() => void handleLinkExisting()}
          >
            แนบไฟล์
          </button>
          <button
            className="button button-quiet"
            type="button"
            disabled={busy}
            onClick={() => uploadInputRef.current?.click()}
          >
            อัปโหลดแล้วแนบ
          </button>
          <input
            ref={uploadInputRef}
            className="visually-hidden"
            type="file"
            aria-label="อัปโหลดไฟล์เพื่อแนบ"
            onChange={(event) => void handleUploadAndLink(event)}
          />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {linkedFiles.length === 0 ? (
        <p className="sidebar-hint entity-attachments-empty">ยังไม่มีไฟล์แนบกับรายการนี้</p>
      ) : (
        <ul className="entity-attachments-list" aria-label="รายการไฟล์แนบ">
          {linkedFiles.map((file) => (
            <li className="entity-attachment-item" key={file.id}>
              <a
                className="entity-attachment-link"
                href={`/api/files/${encodeURIComponent(file.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="entry-kind file">{fileIcon(file.mediaType, file.displayName)}</span>
                <span>{file.displayName}</span>
                <small>({formatBytes(file.sizeBytes)})</small>
              </a>
              <button
                className="text-button danger-text"
                type="button"
                disabled={busy}
                onClick={() => void handleUnlink(file.id)}
              >
                เอาออก
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
      listFiles(1, 100),
    ]).then(([peoplePage, reminderList, upcoming, habitList, blocks, week, filePage]) => {
      if (!active) return;
      setPeople(peoplePage.people);
      setReminders(reminderList);
      setUpcomingReminders(upcoming);
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
        const newBm = await saveBookmark(null, quickAddTitle.trim(), quickAddContentOrUrl.trim() || 'https://', '');
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
      // refresh items
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
      setVaultNotice(activeVault ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการเข้าคลังแล้ว');
      pushToast('success', activeVault ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการเข้าคลังแล้ว');
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
      setLibraryNotice(activeLibrary ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มความรู้เข้าห้องสมุดแล้ว');
      pushToast('success', activeLibrary ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มความรู้เข้าห้องสมุดแล้ว');
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
      | 'vault' | 'library',
    id: string,
  ) {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandResults(null);
    setCommandError('');
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
      if (activeBookmarkCustomCatId !== undefined) {
        try {
          await setItemCustomCategory('bookmark', saved.id, activeBookmarkCustomCatId);
        } catch {
          // ignore error
        }
      }
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
// menuItems is replaced by customizable sidebarNav

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
            <small className="profile-meta">{todayDone}/{todayBlocks.length} ช่วงวันนี้</small>
          </button>

          <nav className="primary-nav" aria-label="เมนูหลัก">
            {sidebarNav.filter((item) => item.enabled).map((item) => (
              <button
                key={item.id}
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

          <div className="nav-customize-wrap">
            <button
              className="nav-customize-btn"
              type="button"
              onClick={() => {
                setTempNavConfig(sidebarNav.map((item) => ({ ...item })));
                setCustomizeNavOpen(true);
              }}
              title="ปรับแต่งลำดับ เปลี่ยนชื่อ หรือซ่อนเมนู"
            >
              <span>⚙️</span>
              <span>ตั้งค่าเมนู (Customize Sidebar)</span>
            </button>
          </div>

          <div className="sidebar-section custom-categories-section">
            <div className="sidebar-section-head">
              <h2>หมวดหมู่ของฉัน</h2>
              <button
                className="text-button"
                type="button"
                onClick={() => openCreateCategoryModal(null)}
                title="สร้างหมวดหมู่ใหม่"
              >
                ＋ เพิ่ม
              </button>
            </div>
            {customCategoriesBusy ? (
              <p className="sidebar-hint">กำลังโหลดหมวดหมู่…</p>
            ) : customCategories.length === 0 ? (
              <p className="sidebar-hint">ยังไม่มีหมวดหมู่ — กด + เพิ่ม เพื่อจัดหมวดหมู่ข้อมูล</p>
            ) : (
              <div className="custom-category-tree" aria-label="รายการหมวดหมู่ของฉัน">
                {customCategories.filter((c) => !c.parentId).map((cat) => {
                  const children = customCategories.filter((sub) => sub.parentId === cat.id);
                  const isCatActive = viewMode === 'custom-category' && selectedCustomCategoryId === cat.id;
                  return (
                    <div key={cat.id}>
                      <div className={`custom-category-row${isCatActive ? ' is-active' : ''}`}>
                        <button
                          className="custom-category-btn"
                          type="button"
                          onClick={() => selectCustomCategory(cat.id)}
                        >
                          <span className="category-icon">{cat.icon}</span>
                          <span className="custom-color-dot" style={{ backgroundColor: cat.color }} />
                          <span className="category-title">{cat.name}</span>
                          <span className="category-badge-count">{cat.itemCount ?? 0}</span>
                        </button>
                        <div className="category-row-actions">
                          <button
                            className="category-mini-btn"
                            type="button"
                            title="สร้างหมวดย่อย"
                            onClick={(e) => { e.stopPropagation(); openCreateCategoryModal(cat.id); }}
                          >
                            ＋
                          </button>
                          <button
                            className="category-mini-btn"
                            type="button"
                            title="แก้ไขหมวดหมู่"
                            onClick={(e) => openEditCategoryModal(cat, e)}
                          >
                            ✎
                          </button>
                          <button
                            className="category-mini-btn danger"
                            type="button"
                            title="ลบหมวดหมู่"
                            onClick={(e) => handleDeleteCategory(cat, e)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {children.length > 0 && (
                        <div className="custom-category-sub">
                          {children.map((sub) => {
                            const isSubActive = viewMode === 'custom-category' && selectedCustomCategoryId === sub.id;
                            return (
                              <div key={sub.id} className={`custom-category-row${isSubActive ? ' is-active' : ''}`}>
                                <button
                                  className="custom-category-btn"
                                  type="button"
                                  onClick={() => selectCustomCategory(sub.id)}
                                >
                                  <span className="category-icon">{sub.icon}</span>
                                  <span className="custom-color-dot" style={{ backgroundColor: sub.color }} />
                                  <span className="category-title">{sub.name}</span>
                                  <span className="category-badge-count">{sub.itemCount ?? 0}</span>
                                </button>
                                <div className="category-row-actions">
                                  <button
                                    className="category-mini-btn"
                                    type="button"
                                    title="แก้ไขหมวดย่อย"
                                    onClick={(e) => openEditCategoryModal(sub, e)}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="category-mini-btn danger"
                                    type="button"
                                    title="ลบหมวดย่อย"
                                    onClick={(e) => handleDeleteCategory(sub, e)}
                                  >
                                    ×
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

          {viewMode === 'vault' && (
            <div className="search-control list-search">
              <label htmlFor="vault-search">ค้นหาในคลังสำคัญ</label>
              <div className="search-input-row">
                <input
                  id="vault-search"
                  type="search"
                  value={vaultQuery}
                  onChange={(event) => {
                    setVaultBusy(true);
                    setVaultQuery(event.target.value);
                  }}
                  maxLength={120}
                  placeholder="ชื่อ รหัส สถานที่เก็บ หรือยอดเงิน…"
                />
                {vaultQuery && (
                  <button
                    className="button button-quiet search-clear"
                    type="button"
                    onClick={() => {
                      setVaultBusy(true);
                      setVaultQuery('');
                    }}
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <div className="filter-chips" role="group" aria-label="กรองหมวดหมู่คลังสำคัญ">
                {(['all', ...VAULT_CATEGORIES] as Array<VaultCategory | 'all'>).map((value) => (
                  <button
                    className={`chip-add${vaultCategory === value ? ' is-open' : ''}`}
                    key={value}
                    type="button"
                    aria-pressed={vaultCategory === value}
                    onClick={() => {
                      setVaultBusy(true);
                      setVaultCategory(value);
                    }}
                  >
                    {value === 'all' ? 'ทั้งหมด' : value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'library' && (
            <div className="search-control list-search">
              <label htmlFor="library-search">ค้นหาในห้องสมุด</label>
              <div className="search-input-row">
                <input
                  id="library-search"
                  type="search"
                  value={libraryQuery}
                  onChange={(event) => {
                    setLibraryBusy(true);
                    setLibraryQuery(event.target.value);
                  }}
                  maxLength={120}
                  placeholder="ชื่อเรื่อง แก่นสำคัญ หรือขั้นตอน…"
                />
                {libraryQuery && (
                  <button
                    className="button button-quiet search-clear"
                    type="button"
                    onClick={() => {
                      setLibraryBusy(true);
                      setLibraryQuery('');
                    }}
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <div className="filter-chips" role="group" aria-label="กรองหมวดหมู่ห้องสมุด">
                {(['all', ...LIBRARY_CATEGORIES] as Array<LibraryCategory | 'all'>).map((value) => (
                  <button
                    className={`chip-add${libraryCategory === value ? ' is-open' : ''}`}
                    key={value}
                    type="button"
                    aria-pressed={libraryCategory === value}
                    onClick={() => {
                      setLibraryBusy(true);
                      setLibraryCategory(value);
                    }}
                  >
                    {value === 'all' ? 'ทั้งหมด' : value}
                  </button>
                ))}
              </div>
              <div className="filter-chips status-chips" role="group" aria-label="กรองสถานะ">
                {(['all', ...LIBRARY_STATUSES] as Array<LibraryStatus | 'all'>).map((value) => (
                  <button
                    className={`chip-add${libraryStatus === value ? ' is-open' : ''}`}
                    key={value}
                    type="button"
                    aria-pressed={libraryStatus === value}
                    onClick={() => {
                      setLibraryBusy(true);
                      setLibraryStatus(value);
                    }}
                  >
                    {value === 'all' ? 'ทุกสถานะ' : value}
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

            {viewMode === 'custom-category' ? (
              <div className="work-list" aria-label="สรุปหมวดหมู่">
                {customCategoryDataBusy ? (
                  <p className="sidebar-hint">กำลังโหลดข้อมูลในหมวดหมู่…</p>
                ) : !customCategoryData ? (
                  <p className="sidebar-hint">ไม่พบข้อมูลหมวดหมู่นี้</p>
                ) : (
                  <>
                    <div className="dash-stat">
                      <strong>{customCategoryData.counts.total}</strong>
                      <span>รายการทั้งหมดในหมวดนี้</span>
                    </div>
                    {customCategoryData.subcategories.length > 0 && (
                      <div className="sidebar-section" style={{ padding: '0 4px', marginTop: '10px' }}>
                        <span className="sidebar-hint">หมวดหมู่ย่อย ({customCategoryData.subcategories.length}):</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                          {customCategoryData.subcategories.map((sub) => (
                            <button
                              key={sub.id}
                              className="button button-quiet"
                              type="button"
                              style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
                              onClick={() => selectCustomCategory(sub.id)}
                            >
                              <span>{sub.icon}</span>
                              <span style={{ flex: 1 }}>{sub.name}</span>
                              <small>({sub.itemCount ?? 0})</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="quick-add-grid" style={{ marginTop: '16px' }}>
                      <button className="button button-primary" type="button" onClick={() => setQuickAddCatOpen(true)}>
                        ＋ เพิ่มข้อมูลในหมวดนี้
                      </button>
                      <button className="button button-quiet" type="button" onClick={() => openCreateCategoryModal(selectedCustomCategoryId)}>
                        ＋ หมวดย่อย
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : viewMode === 'all' ? (
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
                      <select
                        className="task-cat-select"
                        style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)' }}
                        aria-label="เปลี่ยนหมวดหมู่"
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          try {
                            await setItemCustomCategory('task', task.id, val);
                            pushToast('success', 'อัปเดตหมวดหมู่ของงานแล้ว');
                            setRefreshKey((k) => k + 1);
                          } catch (err) {
                            pushToast('error', errorMessage(err));
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="">📁 ย้ายหมวด</option>
                        {customCategories.map((c) => (
                          <option value={c.id} key={c.id}>{c.parentId ? '↳ ' : ''}{c.icon} {c.name}</option>
                        ))}
                      </select>
                      <button className="text-button danger-text" type="button" disabled={tasksBusy} onClick={() => void removeTask(task)}>ลบ</button>
                    </div>
                    <EntityAttachments
                      entityType="task"
                      entityId={task.id}
                      availableFiles={files}
                      onFilesChanged={() => setRefreshKey((key) => key + 1)}
                    />
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
                      <EntityAttachments
                        entityType="project"
                        entityId={project.id}
                        availableFiles={files}
                        onFilesChanged={() => setRefreshKey((key) => key + 1)}
                      />
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
                          <img src={`/api/files/${person.avatarFileId}`} alt="" loading="lazy" decoding="async" />
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
            ) : viewMode === 'vault' ? (
              <div className="vault-list" aria-label="รายการในคลังสำคัญ">
                <button className="button button-primary list-add-button" type="button" onClick={startNewVaultItem}>
                  ＋ เพิ่มรายการเข้าคลัง
                </button>
                {vaultItems.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีรายการในคลัง — เริ่มจากเอกสารสำคัญหรือทรัพย์สินชิ้นแรก</p>
                ) : vaultItems.map((item) => {
                  const days = daysUntilIso(item.renewalOrExpiryDate);
                  const urgent = days !== null && days <= 30;
                  return (
                    <button
                      className={`vault-card${activeVault?.id === item.id ? ' is-active' : ''}`}
                      key={item.id}
                      type="button"
                      onClick={() => selectVaultItem(item)}
                    >
                      <span className="vault-card-head">
                        <strong>{item.title}</strong>
                        <span className={`category-badge tone-${vaultTone(item.category)}`}>{item.category}</span>
                      </span>
                      {item.keyValue && <span className="vault-code">🔑 {item.keyValue}</span>}
                      <span className="vault-meta">
                        {item.renewalOrExpiryDate ? (
                          <span className={`vault-due${urgent ? ' is-urgent' : ''}`}>
                            📅 {item.renewalOrExpiryDate}
                            {days !== null && days < 0 ? ' · เกินกำหนดแล้ว' : ''}
                            {days !== null && days >= 0 && days <= 30 ? ` · อีก ${days} วัน` : ''}
                          </span>
                        ) : (
                          <span className="vault-due is-empty">ไม่มีวันครบกำหนด</span>
                        )}
                        {item.amountText && <span className="vault-amount">{item.amountText}</span>}
                      </span>
                      {item.physicalLocation && <span className="vault-place">📍 {item.physicalLocation}</span>}
                    </button>
                  );
                })}
              </div>
            ) : viewMode === 'library' ? (
              <div className="library-list" aria-label="รายการในห้องสมุด">
                <button className="button button-primary list-add-button" type="button" onClick={startNewLibraryItem}>
                  ＋ เพิ่มความรู้ใหม่
                </button>
                {libraryItems.length === 0 ? (
                  <p className="sidebar-hint">ยังไม่มีคู่มือ — เก็บ SOP แรกที่อยากจำให้ขึ้นใจ</p>
                ) : libraryItems.map((item) => (
                  <button
                    className={`library-card${activeLibrary?.id === item.id ? ' is-active' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => selectLibraryItem(item)}
                  >
                    <span className="library-card-head">
                      <strong>{item.title}</strong>
                      <span className={`status-badge tone-${libraryStatusTone(item.status)}`}>{item.status}</span>
                    </span>
                    <span className={`category-badge tone-${libraryTone(item.category)}`}>{item.category}</span>
                    {item.keyTakeaways && <span className="library-preview">{item.keyTakeaways}</span>}
                    {item.sourceUrlOrAuthor && <span className="library-source">↗ {item.sourceUrlOrAuthor}</span>}
                  </button>
                ))}
              </div>
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
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMediaLightboxFile(file);
                        }}
                      >
                        👁️ ดูตัวอย่าง
                      </button>
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
        {viewMode === 'custom-category' ? (
          <section className="editor-panel custom-category-panel" aria-label="หมวดหมู่ของฉัน">
            {customCategoryDataBusy ? (
              <p className="sidebar-hint">กำลังโหลดข้อมูลในหมวดหมู่…</p>
            ) : !customCategoryData ? (
              <p className="sidebar-hint">ไม่พบหมวดหมู่ที่เลือก</p>
            ) : (
              <div>
                <div className="category-header-wrap">
                  <div className="category-meta-info">
                    <span className="category-large-icon" style={{ borderTop: `3px solid ${customCategoryData.category.color}` }}>
                      {customCategoryData.category.icon}
                    </span>
                    <div>
                      <span className="eyebrow" style={{ color: customCategoryData.category.color }}>
                        หมวดหมู่ของฉัน {customCategoryData.category.parentId ? '· หมวดย่อย' : ''}
                      </span>
                      <h2 className="panel-title" style={{ margin: '2px 0 4px' }}>
                        {customCategoryData.category.name}
                      </h2>
                      <p className="updated-label">
                        รวม {customCategoryData.counts.total} รายการ · สร้างเมื่อ {formatDate(customCategoryData.category.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="category-actions-bar">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => setQuickAddCatOpen(true)}
                    >
                      ＋ เพิ่มข้อมูลในหมวดนี้
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => openCreateCategoryModal(customCategoryData.category.id)}
                    >
                      ＋ หมวดย่อย
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => openEditCategoryModal(customCategoryData.category)}
                    >
                      ✎ แก้ไขหมวด
                    </button>
                    <button
                      className="button button-quiet danger-text"
                      type="button"
                      onClick={() => handleDeleteCategory(customCategoryData.category)}
                    >
                      ลบหมวด
                    </button>
                  </div>
                </div>

                {customCategoryData.subcategories.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-muted)' }}>
                      หมวดหมู่ย่อย ({customCategoryData.subcategories.length})
                    </h3>
                    <div className="category-subcards">
                      {customCategoryData.subcategories.map((sub) => (
                        <div
                          key={sub.id}
                          className="category-subcard"
                          onClick={() => selectCustomCategory(sub.id)}
                        >
                          <span style={{ fontSize: '20px' }}>{sub.icon}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <strong style={{ display: 'block', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sub.name}
                            </strong>
                            <small style={{ color: 'var(--text-muted)' }}>{sub.itemCount ?? 0} รายการ</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="category-filter-tabs">
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'all' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('all')}
                  >
                    ทั้งหมด ({customCategoryData.counts.total})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'note' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('note')}
                  >
                    📝 โน้ต ({customCategoryData.counts.notes})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'task' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('task')}
                  >
                    ☑️ งาน ({customCategoryData.counts.tasks})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'bookmark' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('bookmark')}
                  >
                    ↗️ ลิงก์ ({customCategoryData.counts.bookmarks})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'file' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('file')}
                  >
                    📁 ไฟล์ ({customCategoryData.counts.files})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'vault' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('vault')}
                  >
                    🔐 คลังสำคัญ ({customCategoryData.counts.vault})
                  </button>
                  <button
                    className={`category-filter-tab${customCategoryFilter === 'library' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setCustomCategoryFilter('library')}
                  >
                    📚 คู่มือ ({customCategoryData.counts.library})
                  </button>
                </div>

                {customCategoryData.counts.total === 0 ? (
                  <div className="empty-state" style={{ padding: '40px 20px', border: '1px dashed var(--line)', borderRadius: '8px' }}>
                    <span className="empty-icon">{customCategoryData.category.icon}</span>
                    <strong>ยังไม่มีข้อมูลในหมวดหมู่นี้</strong>
                    <span>กดปุ่ม "+ เพิ่มข้อมูลในหมวดนี้" เพื่อสร้างโน้ต งาน ลิงก์ หรือไฟล์ใหม่ลงในหมวดหมู่นี้โดยตรง</span>
                  </div>
                ) : (
                  <div className="category-grid-container">
                    {(customCategoryFilter === 'all' || customCategoryFilter === 'note') &&
                      customCategoryData.notes.map((note) => (
                        <div key={`cat-note-${note.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">📝 โน้ต</span>
                              <button
                                className="text-button danger-text"
                                type="button"
                                title="เอาออกจากหมวด"
                                onClick={() => handleUnlinkCategoryItem('note', note.id)}
                              >
                                ถอดออก
                              </button>
                            </div>
                            <strong style={{ display: 'block', fontSize: '15px', marginTop: '6px' }}>{note.title}</strong>
                            <p className="category-card-body">{note.content || 'ไม่มีเนื้อหาข้อความ'}</p>
                          </div>
                          <div className="category-card-meta">
                            <span>{formatDate(note.updatedAt)}</span>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => {
                                setViewMode('notes');
                                void openNoteById(note.id);
                              }}
                            >
                              เปิดอ่าน/แก้ไข →
                            </button>
                          </div>
                        </div>
                      ))}

                    {(customCategoryFilter === 'all' || customCategoryFilter === 'task') &&
                      customCategoryData.tasks.map((task) => (
                        <div key={`cat-task-${task.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">☑️ งาน</span>
                              <span style={{ fontSize: '12px', color: task.priority === 'urgent' ? 'var(--danger)' : 'var(--text-muted)' }}>
                                {taskPriorityLabel(task.priority)}
                              </span>
                            </div>
                            <strong style={{ display: 'block', fontSize: '15px', marginTop: '6px', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                              {task.title}
                            </strong>
                            {task.detail && <p className="category-card-body">{task.detail}</p>}
                          </div>
                          <div className="category-card-meta">
                            <span>{task.dueDate ? `กำหนด ${task.dueDate}` : taskStatusLabel(task.status)}</span>
                            <button
                              className="text-button danger-text"
                              type="button"
                              onClick={() => handleUnlinkCategoryItem('task', task.id)}
                            >
                              ถอดออก
                            </button>
                          </div>
                        </div>
                      ))}

                    {(customCategoryFilter === 'all' || customCategoryFilter === 'bookmark') &&
                      customCategoryData.bookmarks.map((bm) => (
                        <div key={`cat-bm-${bm.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">↗️ ลิงก์</span>
                              <button
                                className="text-button danger-text"
                                type="button"
                                onClick={() => handleUnlinkCategoryItem('bookmark', bm.id)}
                              >
                                ถอดออก
                              </button>
                            </div>
                            <strong style={{ display: 'block', fontSize: '15px', marginTop: '6px' }}>{bm.title}</strong>
                            {bm.description && <p className="category-card-body">{bm.description}</p>}
                          </div>
                          <div className="category-card-meta">
                            <a href={bm.url} target="_blank" rel="noreferrer" className="text-button" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                              {bm.url} ↗
                            </a>
                          </div>
                        </div>
                      ))}

                    {(customCategoryFilter === 'all' || customCategoryFilter === 'file') &&
                      customCategoryData.files.map((file) => (
                        <div key={`cat-file-${file.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">📁 {fileIcon(file.mediaType, file.displayName)}</span>
                              <button
                                className="text-button danger-text"
                                type="button"
                                onClick={() => handleUnlinkCategoryItem('file', file.id)}
                              >
                                ถอดออก
                              </button>
                            </div>
                            {file.mediaType.startsWith('image/') && (
                              <img
                                src={`/api/files/${file.id}`}
                                alt={file.displayName}
                                loading="lazy"
                                decoding="async"
                                style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '4px', marginTop: '6px', cursor: 'pointer' }}
                                onClick={() => setMediaLightboxFile(file)}
                              />
                            )}
                            <strong
                              style={{ display: 'block', fontSize: '14px', marginTop: '6px', wordBreak: 'break-all', cursor: 'pointer' }}
                              onClick={() => setMediaLightboxFile(file)}
                            >
                              {file.displayName}
                            </strong>
                          </div>
                          <div className="category-card-meta">
                            <span>{formatBytes(file.sizeBytes)}</span>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => setMediaLightboxFile(file)}
                            >
                              เล่น/ดูตัวอย่าง →
                            </button>
                          </div>
                        </div>
                      ))}

                    {(customCategoryFilter === 'all' || customCategoryFilter === 'vault') &&
                      customCategoryData.vault.map((v) => (
                        <div key={`cat-vault-${v.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">🔐 {v.category}</span>
                              <button
                                className="text-button danger-text"
                                type="button"
                                onClick={() => handleUnlinkCategoryItem('vault', v.id)}
                              >
                                ถอดออก
                              </button>
                            </div>
                            <strong style={{ display: 'block', fontSize: '15px', marginTop: '6px' }}>{v.title}</strong>
                            {v.keyValue && <p style={{ fontSize: '13px', margin: '4px 0', fontFamily: 'monospace' }}>{v.keyValue}</p>}
                            {v.notes && <p className="category-card-body">{v.notes}</p>}
                          </div>
                          <div className="category-card-meta">
                            <span>{v.renewalOrExpiryDate ? `หมดอายุ ${v.renewalOrExpiryDate}` : ''}</span>
                            <button className="text-button" type="button" onClick={() => navigateCommand('vault', v.id)}>
                              ดูรายละเอียด →
                            </button>
                          </div>
                        </div>
                      ))}

                    {(customCategoryFilter === 'all' || customCategoryFilter === 'library') &&
                      customCategoryData.library.map((lib) => (
                        <div key={`cat-lib-${lib.id}`} className="category-card">
                          <div>
                            <div className="category-card-head">
                              <span className="category-card-tag">📚 {lib.category}</span>
                              <button
                                className="text-button danger-text"
                                type="button"
                                onClick={() => handleUnlinkCategoryItem('library', lib.id)}
                              >
                                ถอดออก
                              </button>
                            </div>
                            <strong style={{ display: 'block', fontSize: '15px', marginTop: '6px' }}>{lib.title}</strong>
                            {lib.keyTakeaways && <p className="category-card-body">{lib.keyTakeaways}</p>}
                          </div>
                          <div className="category-card-meta">
                            <span>{lib.status}</span>
                            <button className="text-button" type="button" onClick={() => navigateCommand('library', lib.id)}>
                              ดูรายละเอียด →
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : viewMode === 'home' ? (
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
                <section className="dash-card dash-stats">
                  <div className="dash-card-head">
                    <h3>สถิติภาพรวม</h3>
                    <span className="dash-stats-hint">ทุกโมดูล</span>
                  </div>
                  <div className="dash-stat-grid">
                    <button className="dash-stat-tile" type="button" onClick={() => switchView('notes')}>
                      <strong>{dashboard.totals.notes}</strong>
                      <span>โน้ต</span>
                    </button>
                    <button className="dash-stat-tile" type="button" onClick={() => switchView('tasks')}>
                      <strong>{dashboard.totals.tasks}</strong>
                      <span>งานที่ยังเปิด</span>
                    </button>
                    <button className="dash-stat-tile" type="button" onClick={() => switchView('vault')}>
                      <strong>{dashboard.totals.vault}</strong>
                      <span>รายการในคลัง</span>
                    </button>
                    <button className="dash-stat-tile" type="button" onClick={() => switchView('library')}>
                      <strong>{dashboard.totals.library}</strong>
                      <span>คู่มือในห้องสมุด</span>
                    </button>
                  </div>
                </section>

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
                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>เอกสาร/ทรัพย์สินที่ใกล้หมดอายุ</h3>
                    <button className="text-button" type="button" onClick={() => switchView('vault')}>ไปที่คลัง →</button>
                  </div>
                  {dashboard.vault.expiring.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีรายการที่ต้องต่ออายุภายใน 60 วัน</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.vault.expiring.map((item) => {
                        const days = daysUntilIso(item.renewalOrExpiryDate);
                        const urgent = days !== null && days <= 30;
                        return (
                          <li key={item.id} className={urgent ? 'is-warn' : undefined}>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => navigateCommand('vault', item.id)}
                            >
                              {item.title}
                            </button>
                            <small className={urgent ? 'dash-due is-urgent' : 'dash-due'}>
                              {days !== null && days < 0
                                ? `เกินกำหนด ${Math.abs(days)} วัน`
                                : `อีก ${days ?? 0} วัน`}
                              {' · '}
                              {item.renewalOrExpiryDate}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="dash-card">
                  <div className="dash-card-head">
                    <h3>คู่มือที่ใช้งานประจำ</h3>
                    <button className="text-button" type="button" onClick={() => switchView('library')}>ไปที่ห้องสมุด →</button>
                  </div>
                  {dashboard.library.active.length === 0 ? (
                    <p className="dash-empty">ยังไม่มีคู่มือที่ตั้งสถานะเป็น “ใช้งานประจำ”</p>
                  ) : (
                    <ul className="dash-list">
                      {dashboard.library.active.map((item) => (
                        <li key={item.id}>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => navigateCommand('library', item.id)}
                          >
                            {item.title}
                          </button>
                          <small>
                            {item.keyTakeaways
                              ? item.keyTakeaways.split('\n').map((line) => line.trim()).filter(Boolean)[0]
                              : item.category}
                          </small>
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
        ) : viewMode === 'vault' ? (
          <section className="editor-panel vault-panel" aria-label="แก้ไขข้อมูลคลังสำคัญ">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Personal Vault</span>
                <h2 className="panel-title">{activeVault ? 'แก้ไขข้อมูลในคลัง' : 'เพิ่มรายการเข้าคลัง'}</h2>
                <p className="updated-label">
                  {activeVault
                    ? `แก้ไขล่าสุด ${formatDate(activeVault.updatedAt)}`
                    : 'เก็บเลขสำคัญไว้ให้กดคัดลอกได้ทันทีเมื่อต้องใช้'}
                </p>
              </div>
              {activeVault && (
                <div className="editor-actions">
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => void copyVaultKey(activeVault, vaultDraft.keyValue)}
                  >
                    📋 คัดลอกเลขสำคัญ
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => void sendVaultItemToReminders(activeVault)}
                  >
                    📅 ส่งวันครบกำหนดเข้าปฏิทินแจ้งเตือน
                  </button>
                </div>
              )}
            </div>
            {vaultError && <p className="form-error editor-error" role="alert">{vaultError}</p>}
            {vaultNotice && <p className="form-notice" role="status">{vaultNotice}</p>}
            <form className="vault-form" onSubmit={saveVaultItem}>
              <label>
                ชื่อรายการ
                <input
                  value={vaultDraft.title}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, title: event.target.value })}
                  maxLength={200}
                  placeholder="เช่น กรมธรรม์รถยนต์, โฉนดที่ดิน, ค่าเน็ตรายเดือน"
                />
              </label>
              <label>
                หมวดหมู่
                <select
                  value={vaultDraft.category}
                  onChange={(event) => setVaultDraft({
                    ...vaultDraft,
                    category: event.target.value as VaultCategory,
                  })}
                >
                  {VAULT_CATEGORIES.map((category) => (
                    <option value={category} key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                หมวดหมู่ของฉัน (Custom Space)
                <select
                  value={vaultCustomCatId}
                  onChange={(event) => setVaultCustomCatId(event.target.value)}
                >
                  <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                  {customCategories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.parentId ? '  ↳ ' : ''}{category.icon} {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                รหัส / เลขสำคัญ
                <input
                  value={vaultDraft.keyValue}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, keyValue: event.target.value })}
                  maxLength={200}
                  placeholder="เลขกรมธรรม์ Serial หรือรหัสที่ต้องใช้บ่อย"
                />
              </label>
              <label>
                สถานที่เก็บตัวจริง
                <input
                  value={vaultDraft.physicalLocation}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, physicalLocation: event.target.value })}
                  maxLength={200}
                  placeholder="เช่น ลิ้นชักชั้น 2, ตู้เซฟธนาคาร"
                />
              </label>
              <label>
                วันหมดอายุ / วันต่ออายุ
                <input
                  type="date"
                  value={vaultDraft.renewalOrExpiryDate}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, renewalOrExpiryDate: event.target.value })}
                />
              </label>
              <label>
                ยอดเงิน / ค่าใช้จ่าย
                <input
                  value={vaultDraft.amountText}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, amountText: event.target.value })}
                  maxLength={120}
                  placeholder="เช่น 18,500 บาท/ปี"
                />
              </label>
              <label className="span-2">
                บันทึกเพิ่มเติม
                <textarea
                  value={vaultDraft.notes}
                  onChange={(event) => setVaultDraft({ ...vaultDraft, notes: event.target.value })}
                  rows={4}
                  maxLength={5000}
                  placeholder="เงื่อนไข เบอร์ติดต่อเจ้าหน้าที่ หรือขั้นตอนต่ออายุ"
                />
              </label>
              <div className="editor-actions">
                <button className="button button-primary" type="submit" disabled={vaultBusy}>
                  {vaultBusy ? 'กำลังบันทึก…' : activeVault ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าคลัง'}
                </button>
                {activeVault && (
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    disabled={vaultBusy}
                    onClick={() => void removeVaultItem(activeVault)}
                  >
                    ลบรายการ
                  </button>
                )}
              </div>
            </form>
            {activeVault ? (
              <EntityAttachments
                entityType="vault"
                entityId={activeVault.id}
                availableFiles={files}
                onFilesChanged={() => setRefreshKey((key) => key + 1)}
              />
            ) : (
              <p className="sidebar-hint">บันทึกรายการก่อน แล้วจึงแนบไฟล์กรมธรรม์หรือใบเสร็จได้</p>
            )}
          </section>
        ) : viewMode === 'library' ? (
          <section className="editor-panel library-panel" aria-label="แก้ไขความรู้ในห้องสมุด">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Knowledge Library &amp; SOPs</span>
                <h2 className="panel-title">{activeLibrary ? 'แก้ไขความรู้' : 'เพิ่มความรู้ใหม่'}</h2>
                <p className="updated-label">
                  {activeLibrary
                    ? `แก้ไขล่าสุด ${formatDate(activeLibrary.updatedAt)}`
                    : 'เก็บขั้นตอนไว้ให้หยิบใช้ได้ใน 10 วินาที'}
                </p>
              </div>
            </div>
            {libraryError && <p className="form-error editor-error" role="alert">{libraryError}</p>}
            {libraryNotice && <p className="form-notice" role="status">{libraryNotice}</p>}
            <form className="library-form" onSubmit={saveLibraryItem}>
              <label>
                ชื่อเรื่อง
                <input
                  value={libraryDraft.title}
                  onChange={(event) => setLibraryDraft({ ...libraryDraft, title: event.target.value })}
                  maxLength={200}
                  placeholder="เช่น วิธีปิดน้ำ-แก๊สก่อนออกจากบ้าน"
                />
              </label>
              <label>
                หมวดหมู่
                <select
                  value={libraryDraft.category}
                  onChange={(event) => setLibraryDraft({
                    ...libraryDraft,
                    category: event.target.value as LibraryCategory,
                  })}
                >
                  {LIBRARY_CATEGORIES.map((category) => (
                    <option value={category} key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                สถานะ
                <select
                  value={libraryDraft.status}
                  onChange={(event) => setLibraryDraft({
                    ...libraryDraft,
                    status: event.target.value as LibraryStatus,
                  })}
                >
                  {LIBRARY_STATUSES.map((status) => (
                    <option value={status} key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                หมวดหมู่ของฉัน (Custom Space)
                <select
                  value={libraryCustomCatId}
                  onChange={(event) => setLibraryCustomCatId(event.target.value)}
                >
                  <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                  {customCategories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.parentId ? '  ↳ ' : ''}{category.icon} {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                แหล่งที่มา / ผู้แต่ง
                <input
                  value={libraryDraft.sourceUrlOrAuthor}
                  onChange={(event) => setLibraryDraft({ ...libraryDraft, sourceUrlOrAuthor: event.target.value })}
                  maxLength={500}
                  placeholder="ลิงก์ ชื่อหนังสือ หรือชื่อผู้สอน"
                />
              </label>

              <div className="takeaway-box span-2">
                <div className="takeaway-head">
                  <span aria-hidden="true">💡</span>
                  <strong>แก่นสำคัญ 3 ข้อ (Key Takeaways)</strong>
                </div>
                {libraryDraft.keyTakeaways.trim() && (
                  <ul className="takeaway-list" aria-label="แก่นสำคัญที่บันทึกไว้">
                    {libraryDraft.keyTakeaways
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                  </ul>
                )}
                <label>
                  เขียนแก่นสำคัญ (บรรทัดละข้อ)
                  <textarea
                    value={libraryDraft.keyTakeaways}
                    onChange={(event) => setLibraryDraft({ ...libraryDraft, keyTakeaways: event.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder={'1) …\n2) …\n3) …'}
                  />
                </label>
              </div>

              <label className="span-2">
                เนื้อหาขั้นตอน (SOP) หรือสรุปละเอียด
                <textarea
                  value={libraryDraft.content}
                  onChange={(event) => setLibraryDraft({ ...libraryDraft, content: event.target.value })}
                  rows={10}
                  maxLength={20000}
                  placeholder={'ขั้นตอนที่ 1 …\nขั้นตอนที่ 2 …'}
                />
              </label>
              <div className="editor-actions">
                <button className="button button-primary" type="submit" disabled={libraryBusy}>
                  {libraryBusy ? 'กำลังบันทึก…' : activeLibrary ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าห้องสมุด'}
                </button>
                {activeLibrary && (
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    disabled={libraryBusy}
                    onClick={() => void removeLibraryItem(activeLibrary)}
                  >
                    ลบรายการ
                  </button>
                )}
              </div>
            </form>
            {activeLibrary ? (
              <EntityAttachments
                entityType="library"
                entityId={activeLibrary.id}
                availableFiles={files}
                onFilesChanged={() => setRefreshKey((key) => key + 1)}
              />
            ) : (
              <p className="sidebar-hint">บันทึกความรู้ก่อน แล้วจึงแนบไฟล์คู่มือหรือเอกสารประกอบได้</p>
            )}
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
                id="quick-task-title"
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
              <select
                value={taskDraftCustomCatId}
                onChange={(event) => setTaskDraftCustomCatId(event.target.value)}
                aria-label="หมวดหมู่ของฉัน"
              >
                <option value="">📁 ไม่ผูกหมวดหมู่</option>
                {customCategories.map((c) => (
                  <option value={c.id} key={c.id}>{c.parentId ? '  ↳ ' : ''}{c.icon} {c.name}</option>
                ))}
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
                    <img src={`/api/files/${personDraft.avatarFileId}`} alt="" loading="lazy" decoding="async" />
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
            {activePerson && (
              <EntityAttachments
                entityType="person"
                entityId={activePerson.id}
                availableFiles={files}
                onFilesChanged={() => setRefreshKey((key) => key + 1)}
              />
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
                <div className="custom-category-select-wrap" style={{ margin: '6px 0', width: '100%' }}>
                  <label className="custom-cat-label">
                    <span>📁 หมวดหมู่ของฉัน:</span>
                    <select
                      value={activeNoteCustomCatId || ''}
                      onChange={async (e) => {
                        const newCatId = e.target.value || null;
                        setActiveNoteCustomCatId(newCatId);
                        if (activeNote) {
                          try {
                            await setItemCustomCategory('note', activeNote.id, newCatId);
                            pushToast('success', 'อัปเดตหมวดหมู่ของโน้ตแล้ว');
                          } catch (err) {
                            pushToast('error', errorMessage(err));
                          }
                        }
                      }}
                    >
                      <option value="">-- ไม่ระบุหมวดหมู่ (None) --</option>
                      {customCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parentId ? '  ↳ ' : ''}{c.icon} {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
            {activeNote && (
              <EntityAttachments
                entityType="note"
                entityId={activeNote.id}
                availableFiles={files}
                onFilesChanged={() => setRefreshKey((key) => key + 1)}
              />
            )}
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
              <div className="custom-category-select-wrap">
                <label className="custom-cat-label">
                  <span>📁 หมวดหมู่ของฉัน:</span>
                  <select
                    value={activeBookmarkCustomCatId || ''}
                    onChange={async (e) => {
                      const newCatId = e.target.value || null;
                      setActiveBookmarkCustomCatId(newCatId);
                      if (activeBookmark) {
                        try {
                          await setItemCustomCategory('bookmark', activeBookmark.id, newCatId);
                          pushToast('success', 'อัปเดตหมวดหมู่ของลิงก์แล้ว');
                        } catch (err) {
                          pushToast('error', errorMessage(err));
                        }
                      }
                    }}
                  >
                    <option value="">-- ไม่ระบุหมวดหมู่ (None) --</option>
                    {customCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parentId ? '  ↳ ' : ''}{c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="editor-footer">
                <span>ข้อมูลลิงก์กรอกและจัดเก็บในเครื่องนี้เท่านั้น</span>
                <span>{bookmarkDescription.length.toLocaleString('th-TH')} / 5,000</span>
              </div>
            </form>
            {activeBookmark && (
              <EntityAttachments
                entityType="bookmark"
                entityId={activeBookmark.id}
                availableFiles={files}
                onFilesChanged={() => setRefreshKey((key) => key + 1)}
              />
            )}
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
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => setMediaLightboxFile(activeFile)}
                  >
                    👁️ เล่น / ดูตัวอย่าง
                  </button>
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
                <div className="custom-category-select-wrap">
                  <label className="custom-cat-label">
                    <span>📁 หมวดหมู่ของฉัน:</span>
                    <select
                      value={fileCustomCatId || ''}
                      onChange={async (e) => {
                        const newCatId = e.target.value || null;
                        setFileCustomCatId(newCatId);
                        if (activeFile) {
                          try {
                            await setItemCustomCategory('file', activeFile.id, newCatId);
                            pushToast('success', 'อัปเดตหมวดหมู่ของไฟล์แล้ว');
                          } catch (err) {
                            pushToast('error', errorMessage(err));
                          }
                        }
                      }}
                    >
                      <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                      {customCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parentId ? '  ↳ ' : ''}{c.icon} {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                    <img src={`/api/files/${profile.avatarFileId}`} alt="" loading="lazy" decoding="async" />
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
                  const next = event.target.value;
                  setCommandQuery(next);
                  setCommandError('');
                  setCommandResults(null);
                  setCommandBusy(Boolean(next.trim()) && !(commandFrom && commandTo && commandFrom > commandTo));
                }}
                placeholder="ค้นหาโน้ต งาน โปรเจกต์ เป้าหมาย บุคคล แจ้งเตือน บุ๊กมาร์ก ไฟล์ คลังสำคัญ ห้องสมุด…"
                maxLength={120}
              />
              <button className="icon-button" type="button" aria-label="ปิด" onClick={() => setCommandOpen(false)}>×</button>
            </div>
            <div className="command-filters" aria-label="ตัวกรองการค้นหา">
              <div className="command-filter-head">
                <span className="sidebar-hint">ประเภทข้อมูล ({commandTypes.length}/{SEARCH_TYPE_LABELS.length})</span>
                <button className="text-button" type="button" onClick={resetCommandFilters}>
                  ล้างตัวกรอง
                </button>
              </div>
              <div className="command-type-chips" role="group" aria-label="เลือกประเภทข้อมูลที่ต้องการค้นหา">
                {SEARCH_TYPE_LABELS.map(({ type, label }) => {
                  const selected = commandTypes.includes(type);
                  return (
                    <button
                      key={type}
                      className={`button ${selected ? 'button-primary' : 'button-quiet'} command-type-chip`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCommandType(type)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="command-date-row">
                <label>
                  ตั้งแต่วันที่
                  <input
                    type="date"
                    aria-label="ตั้งแต่วันที่"
                    value={commandFrom}
                    onChange={(event) => {
                      const nextFrom = event.target.value;
                      setCommandFrom(nextFrom);
                      setCommandError('');
                      if (commandQuery.trim() && !(nextFrom && commandTo && nextFrom > commandTo)) {
                        setCommandBusy(true);
                      } else {
                        setCommandBusy(false);
                      }
                    }}
                  />
                </label>
                <label>
                  ถึงวันที่
                  <input
                    type="date"
                    aria-label="ถึงวันที่"
                    value={commandTo}
                    onChange={(event) => {
                      const nextTo = event.target.value;
                      setCommandTo(nextTo);
                      setCommandError('');
                      if (commandQuery.trim() && !(commandFrom && nextTo && commandFrom > nextTo)) {
                        setCommandBusy(true);
                      } else {
                        setCommandBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            {(commandFrom && commandTo && commandFrom > commandTo
              ? 'ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด'
              : commandError) && (
              <p className="form-error" role="alert">
                {commandFrom && commandTo && commandFrom > commandTo
                  ? 'ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด'
                  : commandError}
              </p>
            )}
            {commandBusy && <p className="sidebar-hint">กำลังค้นหา…</p>}
            {commandResults && !(commandFrom && commandTo && commandFrom > commandTo) && (
              <div className="command-results">
                {commandResults.notes.length === 0
                  && (commandResults.tasks?.length ?? 0) === 0
                  && (commandResults.projects?.length ?? 0) === 0
                  && (commandResults.goals?.length ?? 0) === 0
                  && commandResults.people.length === 0
                  && commandResults.reminders.length === 0
                  && (commandResults.bookmarks?.length ?? 0) === 0
                  && (commandResults.files?.length ?? 0) === 0
                  && (commandResults.vault?.length ?? 0) === 0
                  && (commandResults.library?.length ?? 0) === 0 && (
                    <p className="sidebar-hint">ไม่พบผลลัพธ์ที่ตรงกับคำค้นหาและตัวกรอง</p>
                  )}
                {commandResults.notes.map((note) => (
                  <button className="command-item" type="button" key={`note-${note.id}`} onClick={() => navigateCommand('note', note.id)}>
                    <span className="entry-kind">โน้ต</span>
                    <span>{note.title}</span>
                  </button>
                ))}
                {(commandResults.tasks ?? []).map((task) => (
                  <button className="command-item" type="button" key={`task-${task.id}`} onClick={() => navigateCommand('task', task.id)}>
                    <span className="entry-kind">งาน</span>
                    <span>{task.title}{task.dueDate ? ` · ${task.dueDate}` : ''}</span>
                  </button>
                ))}
                {(commandResults.projects ?? []).map((project) => (
                  <button className="command-item" type="button" key={`project-${project.id}`} onClick={() => navigateCommand('project', project.id)}>
                    <span className="entry-kind">โปรเจกต์</span>
                    <span>{project.name}{project.dueDate ? ` · ${project.dueDate}` : ''}</span>
                  </button>
                ))}
                {(commandResults.goals ?? []).map((goal) => (
                  <button className="command-item" type="button" key={`goal-${goal.id}`} onClick={() => navigateCommand('goal', goal.id)}>
                    <span className="entry-kind">เป้าหมาย</span>
                    <span>{goal.title}</span>
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
                {(commandResults.bookmarks ?? []).map((bookmark) => (
                  <button className="command-item" type="button" key={`bookmark-${bookmark.id}`} onClick={() => navigateCommand('bookmark', bookmark.id)}>
                    <span className="entry-kind bookmark">บุ๊กมาร์ก</span>
                    <span>{bookmark.title}</span>
                  </button>
                ))}
                {(commandResults.files ?? []).map((file) => (
                  <button className="command-item" type="button" key={`file-${file.id}`} onClick={() => navigateCommand('file', file.id)}>
                    <span className="entry-kind file">ไฟล์</span>
                    <span>{file.displayName} · {formatBytes(file.sizeBytes)}</span>
                  </button>
                ))}
                {(commandResults.vault ?? []).map((item) => (
                  <button className="command-item" type="button" key={`vault-${item.id}`} onClick={() => navigateCommand('vault', item.id)}>
                    <span className="entry-kind vault">คลังสำคัญ</span>
                    <span>
                      {item.title}
                      {item.renewalOrExpiryDate ? ` · ${item.renewalOrExpiryDate}` : ''}
                      {item.keyValue ? ` · ${item.keyValue}` : ''}
                    </span>
                  </button>
                ))}
                {(commandResults.library ?? []).map((item) => (
                  <button className="command-item" type="button" key={`library-${item.id}`} onClick={() => navigateCommand('library', item.id)}>
                    <span className="entry-kind library">ห้องสมุด</span>
                    <span>{item.title} · {item.status}</span>
                  </button>
                ))}
              </div>
            )}
            {!commandResults && !commandBusy && !commandError && (
              <p className="sidebar-hint">พิมพ์คำค้นหาและเลือกตัวกรองด้านบน — กด Esc เพื่อปิด</p>
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
          {/* Modal: Customize Sidebar */}
      {customizeNavOpen && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            style={{ maxWidth: '540px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-nav-title"
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">ตั้งค่าส่วนตัว</span>
                <h2 id="customize-nav-title">⚙️ ตั้งค่าแถบเมนู (Customize Sidebar)</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิด"
                onClick={() => setCustomizeNavOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="sidebar-hint" style={{ margin: '4px 0 12px' }}>
              เปลี่ยนชื่อเมนู เปิด/ปิด (ซ่อน) เมนูที่ไม่ได้ใช้งาน หรือจัดลำดับขึ้น-ลงตามความต้องการของคุณ
            </p>
            <div className="nav-edit-list">
              {tempNavConfig.map((item, index) => (
                <div key={item.id} className={`nav-edit-row${item.enabled ? '' : ' is-disabled'}`}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title={item.enabled ? 'คลิกเพื่อซ่อนเมนู' : 'คลิกเพื่อแสดงเมนู'}>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => toggleNavItem(index)}
                    />
                  </label>
                  <span className="nav-edit-icon" aria-hidden="true">{item.icon}</span>
                  <input
                    className="nav-edit-input"
                    type="text"
                    value={item.label}
                    placeholder={item.defaultLabel}
                    disabled={!item.enabled}
                    onChange={(e) => updateNavItemLabel(index, e.target.value)}
                  />
                  <div className="nav-edit-actions">
                    <button
                      className="button button-quiet"
                      style={{ padding: '2px 8px', fontSize: '13px' }}
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveNavItem(index, 'up')}
                      title="เลื่อนขึ้น"
                    >
                      ▲
                    </button>
                    <button
                      className="button button-quiet"
                      style={{ padding: '2px 8px', fontSize: '13px' }}
                      type="button"
                      disabled={index === tempNavConfig.length - 1}
                      onClick={() => moveNavItem(index, 'down')}
                      title="เลื่อนลง"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="editor-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
              <button
                className="button button-quiet"
                type="button"
                onClick={handleResetNavConfig}
              >
                รีเซ็ตเป็นค่าเริ่มต้น
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setCustomizeNavOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={handleSaveNavConfig}
                >
                  บันทึกการตั้งค่า
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Create / Edit Custom Category */}
      {categoryModal && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            style={{ maxWidth: '460px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">หมวดหมู่และหัวข้อ</span>
                <h2 id="category-modal-title">
                  {categoryModal.mode === 'create'
                    ? (categoryModal.parentId ? '➕ สร้างหมวดหมู่ย่อย' : '📁 สร้างหมวดหมู่ใหม่')
                    : '✎ แก้ไขหมวดหมู่'}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิด"
                disabled={categoryModalBusy}
                onClick={() => setCategoryModal(null)}
              >
                ×
              </button>
            </div>
            {categoryModalError && <p className="form-error" role="alert">{categoryModalError}</p>}
            <form onSubmit={(e) => { e.preventDefault(); void handleSaveCategory(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              <label>
                ชื่อหมวดหมู่
                <input
                  required
                  type="text"
                  maxLength={120}
                  value={categoryDraft.name}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                  placeholder="เช่น การเงิน & การลงทุน, งานวิจัย, สูตรอาหาร..."
                  autoFocus
                />
              </label>

              <label>
                ไอคอน / Emoji
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    maxLength={8}
                    style={{ width: '64px', textAlign: 'center', fontSize: '18px' }}
                    value={categoryDraft.icon}
                    onChange={(e) => setCategoryDraft({ ...categoryDraft, icon: e.target.value })}
                  />
                  <div className="emoji-preset-bar">
                    {['📁', '💼', '💰', '🎯', '🚀', '💡', '📚', '🩺', '🏠', '🌿', '🎨', '⚙️', '⭐'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="emoji-preset-btn"
                        onClick={() => setCategoryDraft({ ...categoryDraft, icon: emoji })}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </label>

              <label>
                สีประจำหมวดหมู่
                <div className="color-preset-bar">
                  <input
                    type="color"
                    value={categoryDraft.color}
                    onChange={(e) => setCategoryDraft({ ...categoryDraft, color: e.target.value })}
                    style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
                  />
                  {['#3f7658', '#4f5fa8', '#a85a72', '#a8742c', '#6b4f9e', '#0284c7', '#059669', '#dc2626'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      className={`color-preset-btn${categoryDraft.color === col ? ' is-active' : ''}`}
                      style={{ backgroundColor: col }}
                      onClick={() => setCategoryDraft({ ...categoryDraft, color: col })}
                      title={col}
                    />
                  ))}
                </div>
              </label>

              {customCategories.length > 0 && categoryModal.mode === 'create' && (
                <label>
                  หมวดหมู่หลัก (ถ้าต้องการสร้างเป็นหมวดย่อย)
                  <select
                    value={categoryDraft.parentId ?? ''}
                    onChange={(e) => setCategoryDraft({ ...categoryDraft, parentId: e.target.value || null })}
                  >
                    <option value="">ไม่มี (หมวดหมู่ระดับบนสุด)</option>
                    {customCategories.filter((c) => !c.parentId).map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="editor-actions" style={{ marginTop: '8px' }}>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={categoryModalBusy}
                  onClick={() => setCategoryModal(null)}
                >
                  ยกเลิก
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={categoryModalBusy}
                >
                  {categoryModalBusy ? 'กำลังบันทึก…' : 'บันทึกหมวดหมู่'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal: Quick Add into Category */}
      {quickAddCatOpen && selectedCustomCategoryId && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            style={{ maxWidth: '640px', width: '100%' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-cat-title"
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">{customCategoryData?.category.name}</span>
                <h2 id="quick-add-cat-title">＋ เพิ่มข้อมูลในหมวดนี้</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิด"
                disabled={quickAddBusy}
                onClick={() => setQuickAddCatOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Type selector tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '12px 0 16px' }}>
              <button
                className={`button ${quickAddType === 'note' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('note')}
              >
                📝 โน้ต
              </button>
              <button
                className={`button ${quickAddType === 'task' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('task')}
              >
                ☑️ งาน
              </button>
              <button
                className={`button ${quickAddType === 'bookmark' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('bookmark')}
              >
                ↗️ ลิงก์
              </button>
              <button
                className={`button ${quickAddType === 'file' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('file')}
              >
                📁 อัปโหลดไฟล์
              </button>
              <button
                className={`button ${quickAddType === 'vault' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('vault')}
              >
                🔐 คลังสำคัญ
              </button>
              <button
                className={`button ${quickAddType === 'library' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('library')}
              >
                📚 คู่มือ
              </button>
              <button
                className={`button ${quickAddType === 'attach' ? 'button-primary' : 'button-quiet'}`}
                type="button"
                onClick={() => setQuickAddType('attach')}
              >
                🔗 ข้อมูลเดิม
              </button>
            </div>

            {/* Tab: Attach Existing Items */}
            {quickAddType === 'attach' ? (
              <div className="attach-existing-container">
                <input
                  type="search"
                  placeholder="ค้นหาข้อมูลที่มีอยู่แล้ว..."
                  value={attachSearchQuery}
                  onChange={(e) => setAttachSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
                <div className="attach-existing-filters">
                  {(['all', 'note', 'task', 'bookmark', 'file', 'vault', 'library'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`button ${attachTypeFilter === filter ? 'button-primary' : 'button-quiet'}`}
                      onClick={() => setAttachTypeFilter(filter)}
                    >
                      {filter === 'all' ? 'ทั้งหมด' : filter === 'note' ? '📝 โน้ต' : filter === 'task' ? '☑️ งาน' : filter === 'bookmark' ? '↗️ ลิงก์' : filter === 'file' ? '📁 ไฟล์' : filter === 'vault' ? '🔐 คลังสำคัญ' : '📚 คู่มือ'}
                    </button>
                  ))}
                </div>
                <div className="attach-existing-list">
                  {(() => {
                    const query = attachSearchQuery.trim().toLowerCase();
                    const candidates: Array<{ itemType: 'note' | 'task' | 'bookmark' | 'file' | 'vault' | 'library'; id: string; title: string; subtitle: string }> = [];

                    if (attachTypeFilter === 'all' || attachTypeFilter === 'note') {
                      notes.forEach((n) => {
                        if (!query || n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)) {
                          candidates.push({ itemType: 'note', id: n.id, title: n.title, subtitle: 'โน้ต' });
                        }
                      });
                    }
                    if (attachTypeFilter === 'all' || attachTypeFilter === 'task') {
                      tasks.forEach((t) => {
                        if (!query || t.title.toLowerCase().includes(query) || (t.detail && t.detail.toLowerCase().includes(query))) {
                          candidates.push({ itemType: 'task', id: t.id, title: t.title, subtitle: `งาน (${taskStatusLabel(t.status)})` });
                        }
                      });
                    }
                    if (attachTypeFilter === 'all' || attachTypeFilter === 'bookmark') {
                      bookmarks.forEach((b) => {
                        if (!query || b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) {
                          candidates.push({ itemType: 'bookmark', id: b.id, title: b.title, subtitle: b.url });
                        }
                      });
                    }
                    if (attachTypeFilter === 'all' || attachTypeFilter === 'file') {
                      files.forEach((f) => {
                        if (!query || f.displayName.toLowerCase().includes(query) || f.mediaType.toLowerCase().includes(query)) {
                          candidates.push({ itemType: 'file', id: f.id, title: f.displayName, subtitle: `${formatBytes(f.sizeBytes)} · ${f.mediaType}` });
                        }
                      });
                    }
                    if (attachTypeFilter === 'all' || attachTypeFilter === 'vault') {
                      vaultItems.forEach((v) => {
                        if (!query || v.title.toLowerCase().includes(query) || v.keyValue.toLowerCase().includes(query)) {
                          candidates.push({ itemType: 'vault', id: v.id, title: v.title, subtitle: `คลังสำคัญ: ${v.category}` });
                        }
                      });
                    }
                    if (attachTypeFilter === 'all' || attachTypeFilter === 'library') {
                      libraryItems.forEach((l) => {
                        if (!query || l.title.toLowerCase().includes(query) || (l.sourceUrlOrAuthor && l.sourceUrlOrAuthor.toLowerCase().includes(query))) {
                          candidates.push({ itemType: 'library', id: l.id, title: l.title, subtitle: `ห้องสมุด: ${l.category}` });
                        }
                      });
                    }

                    if (candidates.length === 0) {
                      return <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>ไม่พบข้อมูลที่ตรงกับคำค้นหา</p>;
                    }

                    const isLinked = (type: string, id: string) => {
                      if (!customCategoryData) return false;
                      if (type === 'note') return customCategoryData.notes.some((x) => x.id === id);
                      if (type === 'task') return customCategoryData.tasks.some((x) => x.id === id);
                      if (type === 'bookmark') return customCategoryData.bookmarks.some((x) => x.id === id);
                      if (type === 'file') return customCategoryData.files.some((x) => x.id === id);
                      if (type === 'vault') return customCategoryData.vault.some((x) => x.id === id);
                      if (type === 'library') return customCategoryData.library.some((x) => x.id === id);
                      return false;
                    };

                    return candidates.slice(0, 50).map((cand) => {
                      const linked = isLinked(cand.itemType, cand.id);
                      const key = `${cand.itemType}:${cand.id}`;
                      const busy = attachBusyId === key;
                      return (
                        <div key={key} className="attach-item-row">
                          <div className="attach-item-info">
                            <strong>{cand.title}</strong>
                            <span>{cand.subtitle}</span>
                          </div>
                          {linked ? (
                            <span style={{ fontSize: '12px', color: 'var(--accent, #38a169)', fontWeight: 600 }}>ผูกอยู่แล้ว ✓</span>
                          ) : (
                            <button
                              className="button button-quiet"
                              type="button"
                              disabled={busy}
                              style={{ fontSize: '12px', padding: '4px 8px' }}
                              onClick={() => void handleLinkExistingItem(cand.itemType, cand.id)}
                            >
                              {busy ? 'กำลังผูก…' : '＋ ผูกเข้าหมวดนี้'}
                            </button>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="editor-actions" style={{ marginTop: '12px' }}>
                  <button className="button button-quiet" type="button" onClick={() => setQuickAddCatOpen(false)}>
                    ปิดหน้าต่าง
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleQuickAddIntoCategory} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Form fields based on quickAddType */}
                {quickAddType === 'file' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label>
                      เลือกไฟล์ (รูปภาพ, วิดีโอขนาดใหญ่ MP4/MOV/WebM, เสียง MP3/WAV, PDF, เอกสาร)
                      <input
                        required
                        type="file"
                        onChange={(e) => setCatUploadFile(e.target.files?.[0] || null)}
                        style={{ marginTop: '6px' }}
                      />
                    </label>
                    {catUploadFile && (
                      <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '13px' }}>
                        <div><strong>ชื่อไฟล์:</strong> {catUploadFile.name}</div>
                        <div><strong>ขนาด:</strong> {formatBytes(catUploadFile.size)}</div>
                        <div><strong>ชนิดไฟล์:</strong> {catUploadFile.type || 'ไม่ระบุ'}</div>
                      </div>
                    )}
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      ⚡ ไฟล์ขนาดใหญ่จะถูกบันทึกตรงลงดิสก์และสตรีมมิ่งผ่าน HTTP Range Requests รองรับการเปิดดูและกรอวิดีโอ (Seek) ได้ทันทีโดยไม่เปลืองหน่วยความจำ
                    </p>
                  </div>
                ) : quickAddType === 'vault' ? (
                  <>
                    <label>
                      ชื่อรายการทรัพย์สิน / เอกสารสำคัญ
                      <input
                        required
                        type="text"
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        placeholder="เช่น กรมธรรม์ประกันสุขภาพ, โฉนดที่ดิน, สัญญาเช่า"
                        autoFocus
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <label>
                        หมวดหมู่คลัง
                        <select
                          value={quickAddVaultCategory}
                          onChange={(e) => setQuickAddVaultCategory(e.target.value as VaultCategory)}
                        >
                          {VAULT_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        รหัส / เลขสำคัญ
                        <input
                          type="text"
                          value={quickAddVaultKey}
                          onChange={(e) => setQuickAddVaultKey(e.target.value)}
                          placeholder="เลขกรมธรรม์, Serial..."
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <label>
                        สถานที่เก็บตัวจริง
                        <input
                          type="text"
                          value={quickAddVaultLocation}
                          onChange={(e) => setQuickAddVaultLocation(e.target.value)}
                          placeholder="เช่น ตู้เซฟห้องนอน..."
                        />
                      </label>
                      <label>
                        วันหมดอายุ / ต่ออายุ
                        <input
                          type="date"
                          value={quickAddVaultExpiry}
                          onChange={(e) => setQuickAddVaultExpiry(e.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      ยอดเงิน / ค่าใช้จ่าย (ถ้ามี)
                      <input
                        type="text"
                        value={quickAddVaultAmount}
                        onChange={(e) => setQuickAddVaultAmount(e.target.value)}
                        placeholder="เช่น 15,000 บาท/ปี"
                      />
                    </label>
                    <label>
                      บันทึกเพิ่มเติม
                      <textarea
                        rows={2}
                        value={quickAddContentOrUrl}
                        onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                        placeholder="เงื่อนไขหรือรายละเอียดเพิ่มเติม..."
                      />
                    </label>
                  </>
                ) : quickAddType === 'library' ? (
                  <>
                    <label>
                      ชื่อเรื่อง / ชื่อคู่มือ
                      <input
                        required
                        type="text"
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        placeholder="เช่น คู่มือการใช้งานระบบ, สรุปหนังสือ Deep Work"
                        autoFocus
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <label>
                        หมวดหมู่ห้องสมุด
                        <select
                          value={quickAddLibraryCategory}
                          onChange={(e) => setQuickAddLibraryCategory(e.target.value as LibraryCategory)}
                        >
                          {LIBRARY_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        สถานะ
                        <select
                          value={quickAddLibraryStatus}
                          onChange={(e) => setQuickAddLibraryStatus(e.target.value as LibraryStatus)}
                        >
                          {LIBRARY_STATUSES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      แหล่งที่มา / ผู้แต่ง
                      <input
                        type="text"
                        value={quickAddLibrarySource}
                        onChange={(e) => setQuickAddLibrarySource(e.target.value)}
                        placeholder="ลิงก์ URL หรือชื่อผู้เขียน..."
                      />
                    </label>
                    <label>
                      แก่นสำคัญ / สาระที่ต้องจำ (Key Takeaways)
                      <textarea
                        rows={3}
                        value={quickAddContentOrUrl}
                        onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                        placeholder="สิ่งที่ได้เรียนรู้หรือขั้นตอนสำคัญ..."
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      {quickAddType === 'note' ? 'หัวข้อโน้ต' : quickAddType === 'task' ? 'ชื่องาน' : 'ชื่อลิงก์ / เว็บไซต์'}
                      <input
                        required
                        type="text"
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        placeholder={quickAddType === 'note' ? 'หัวข้อโน้ต...' : quickAddType === 'task' ? 'สิ่งที่ต้องทำ...' : 'ชื่อเว็บไซต์...'}
                        autoFocus
                      />
                    </label>

                    {quickAddType === 'note' && (
                      <label>
                        เนื้อหาโน้ต
                        <textarea
                          rows={4}
                          value={quickAddContentOrUrl}
                          onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                          placeholder="เขียนเนื้อหาหรือรายละเอียด..."
                        />
                      </label>
                    )}

                    {quickAddType === 'task' && (
                      <label>
                        รายละเอียดงาน (เพิ่มเติม)
                        <textarea
                          rows={3}
                          value={quickAddContentOrUrl}
                          onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                          placeholder="รายละเอียดเพิ่มเติมของงานนี้..."
                        />
                      </label>
                    )}

                    {quickAddType === 'bookmark' && (
                      <label>
                        URL ลิงก์
                        <input
                          required
                          type="url"
                          value={quickAddContentOrUrl}
                          onChange={(e) => setQuickAddContentOrUrl(e.target.value)}
                          placeholder="https://example.com"
                        />
                      </label>
                    )}
                  </>
                )}

                <div className="editor-actions" style={{ marginTop: '8px' }}>
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={quickAddBusy}
                    onClick={() => setQuickAddCatOpen(false)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={quickAddBusy}
                  >
                    {quickAddBusy ? 'กำลังบันทึก…' : 'เพิ่มลงในหมวดหมู่'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* Media Lightbox Player Modal */}
      {mediaLightboxFile && (
        <div className="media-lightbox-backdrop" onClick={() => setMediaLightboxFile(null)}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="media-lightbox-header">
              <div className="media-lightbox-title">
                <span style={{ fontSize: '20px' }}>{fileIcon(mediaLightboxFile.mediaType, mediaLightboxFile.displayName)}</span>
                <strong>{mediaLightboxFile.displayName}</strong>
                <span className="media-lightbox-meta">({formatBytes(mediaLightboxFile.sizeBytes)})</span>
              </div>
              <div className="media-lightbox-actions">
                <a
                  className="button button-quiet"
                  href={mediaLightboxFile.downloadUrl}
                  download={mediaLightboxFile.displayName}
                >
                  ⬇️ ดาวน์โหลด
                </a>
                <button
                  className="media-lightbox-close"
                  type="button"
                  aria-label="ปิด (Escape)"
                  onClick={() => setMediaLightboxFile(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="media-lightbox-body">
              {mediaLightboxFile.mediaType.startsWith('image/') ? (
                <img
                  src={mediaLightboxFile.downloadUrl}
                  alt={mediaLightboxFile.displayName}
                  className="lightbox-img"
                  loading="lazy"
                  decoding="async"
                />
              ) : mediaLightboxFile.mediaType.startsWith('video/') ||
                mediaLightboxFile.displayName.endsWith('.mp4') ||
                mediaLightboxFile.displayName.endsWith('.webm') ||
                mediaLightboxFile.displayName.endsWith('.mov') ? (
                <video
                  src={mediaLightboxFile.downloadUrl}
                  controls
                  autoPlay
                  playsInline
                  className="lightbox-video"
                >
                  เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ
                </video>
              ) : mediaLightboxFile.mediaType.startsWith('audio/') ||
                mediaLightboxFile.displayName.endsWith('.mp3') ||
                mediaLightboxFile.displayName.endsWith('.wav') ||
                mediaLightboxFile.displayName.endsWith('.m4a') ? (
                <div className="lightbox-audio-wrapper">
                  <span style={{ fontSize: '48px' }}>🎵</span>
                  <strong style={{ fontSize: '16px' }}>{mediaLightboxFile.displayName}</strong>
                  <audio src={mediaLightboxFile.downloadUrl} controls autoPlay className="lightbox-audio" />
                </div>
              ) : mediaLightboxFile.mediaType === 'application/pdf' || mediaLightboxFile.displayName.endsWith('.pdf') ? (
                <iframe
                  src={mediaLightboxFile.downloadUrl}
                  title={mediaLightboxFile.displayName}
                  className="lightbox-pdf"
                />
              ) : (
                <div className="lightbox-fallback">
                  <span style={{ fontSize: '48px' }}>📄</span>
                  <p>ไฟล์นี้ไม่รองรับการเล่นสดบนเว็บ ({mediaLightboxFile.mediaType})</p>
                  <a className="button button-primary" href={mediaLightboxFile.downloadUrl} download={mediaLightboxFile.displayName}>
                    ดาวน์โหลดไฟล์ลงเครื่อง
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
