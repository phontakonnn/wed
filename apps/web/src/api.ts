export interface User {
  id: string;
  username: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaxonomyItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export type RelationshipGroup = 'family' | 'partner' | 'friend';
export type LifeArea = 'health' | 'focus_work' | 'family' | 'growth' | 'other';
export type ReminderCategory = 'birthday' | 'anniversary' | 'health' | 'backup' | 'other';

export interface Person {
  id: string;
  name: string;
  relationshipGroup: RelationshipGroup;
  roleLabel: string;
  avatarFileId: string | null;
  avatarPreset: string | null;
  birthdayOrAnniversary: string;
  phone: string;
  favoritesAndLikes: string;
  allergiesAndMedical: string;
  giftIdeasAndSizes: string;
  memo: string;
  createdAt: number;
  updatedAt: number;
  noteCount?: number;
}

export interface PersonPage {
  people: Person[];
  page: number;
  pageSize: number;
  total: number;
}

export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Reminder {
  id: string;
  title: string;
  recurrence?: ReminderRecurrence;
  recurrenceAnchorDate?: string | null;
  snoozedUntil?: string | null;
  effectiveDate?: string;
  lastCompletedAt?: number | null;
  targetDate: string;
  category: ReminderCategory;
  priority: 'low' | 'normal' | 'high';
  linkedPersonId: string | null;
  linkedPersonName: string | null;
  isCompleted: number;
  notifyDaysBefore: number;
  createdAt: number;
  updatedAt: number;
}

export interface Timeblock {
  id: string;
  blockDate: string;
  timeRange: string;
  title: string;
  lifeArea: LifeArea;
  isDone: number;
  createdAt: number;
  updatedAt: number;
}

export interface HabitHistoryDay {
  date: string;
  count: number | null;
  metTarget: boolean | null;
}

export interface HabitHistory {
  habit: Habit;
  from: string;
  to: string;
  trackingStartDate: string | null;
  days: HabitHistoryDay[];
  summary: {
    daysTracked: number;
    daysLogged: number;
    daysMetTarget: number;
    currentStreak: number;
    bestStreak: number;
    weekly: { from: string; to: string; daysTracked: number; daysLogged: number; daysMetTarget: number };
    monthly: { from: string; to: string; daysTracked: number; daysLogged: number; daysMetTarget: number };
  };
}

export interface HabitsHistory {
  today: string;
  from: string;
  to: string;
  habits: Array<{ habitId: string; days: HabitHistoryDay[]; weekLogged: number; weekMetTarget: number }>;
}

export interface Habit {
  id: string;
  title: string;
  trackingStartDate?: string | null;
  legacyCurrentCount?: number;
  legacyStreakDays?: number;
  currentCount: number;
  dailyTarget: number;
  unit: string;
  streakDays: number;
  lastCheckedDate: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SearchResults {
  tasks?: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null }>;
  projects?: Array<{ id: string; name: string; status: string; dueDate: string | null }>;
  goals?: Array<{ id: string; title: string; status: string; metric: string; targetValue: number | null; currentValue: number }>;
  notes: Note[];
  people: Person[];
  reminders: Reminder[];
  query: string;
}

export interface NoteTaxonomy {
  categories: Array<Pick<TaxonomyItem, 'id' | 'name'>>;
  tags: Array<Pick<TaxonomyItem, 'id' | 'name'>>;
  people: Array<Pick<Person, 'id' | 'name' | 'roleLabel' | 'avatarFileId' | 'avatarPreset'>>;
}

export interface TaxonomyPage {
  categories?: TaxonomyItem[];
  tags?: TaxonomyItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotePage {
  notes: Note[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BookmarkPage {
  bookmarks: Bookmark[];
  page: number;
  pageSize: number;
  total: number;
}

export type TrashPage = NotePage;

export type FavoriteItemType = 'note' | 'bookmark';

export interface Favorite {
  itemType: FavoriteItemType;
  itemId: string;
  title: string;
  subtitle: string;
  createdAt: number;
  updatedAt: number;
}

export interface FavoritePage {
  favorites: Favorite[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StoredFile {
  id: string;
  displayName: string;
  sizeBytes: number;
  sha256: string;
  mediaType: string;
  createdAt: number;
  downloadUrl: string;
}

export interface FilePage {
  files: StoredFile[];
  page: number;
  pageSize: number;
  total: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  if (method !== 'GET') headers.set('x-pkh-request', '1');
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (response.status === 204) return null;

  let payload: { error?: string; message?: string };
  try {
    payload = await response.json() as { error?: string; message?: string };
  } catch {
    throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่อ่านไม่ได้', response.status);
  }
  if (!response.ok) {
    throw new ApiError(payload.error ?? payload.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อ', response.status);
  }
  return payload as T;
}

export async function getCurrentUser(): Promise<User> {
  const result = await request<{ user: User }>('/api/auth/me');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.user;
}

export async function login(username: string, password: string): Promise<User> {
  const result = await request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.user;
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function listNotes(page: number, pageSize = 20): Promise<NotePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<NotePage>(`/api/notes?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function listBookmarks(page: number, pageSize = 50): Promise<BookmarkPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<BookmarkPage>(`/api/bookmarks?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function searchNotes(queryText: string, page: number, pageSize = 50): Promise<NotePage> {
  const query = new URLSearchParams({
    q: queryText,
    page: String(page),
    pageSize: String(pageSize),
  });
  const result = await request<NotePage>(`/api/notes/search?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function listTrash(page: number, pageSize = 50): Promise<TrashPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<TrashPage>(`/api/notes/trash?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function saveNote(
  noteId: string | null,
  title: string,
  content: string,
): Promise<Note> {
  const result = await request<{ note: Note }>(
    noteId ? `/api/notes/${encodeURIComponent(noteId)}` : '/api/notes',
    {
      method: noteId ? 'PATCH' : 'POST',
      body: JSON.stringify({ title, content }),
    },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
}

export async function saveBookmark(
  bookmarkId: string | null,
  title: string,
  url: string,
  description: string,
): Promise<Bookmark> {
  const result = await request<{ bookmark: Bookmark }>(
    bookmarkId ? `/api/bookmarks/${encodeURIComponent(bookmarkId)}` : '/api/bookmarks',
    {
      method: bookmarkId ? 'PATCH' : 'POST',
      body: JSON.stringify({ title, url, description }),
    },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.bookmark;
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await request(`/api/bookmarks/${encodeURIComponent(bookmarkId)}`, { method: 'DELETE' });
}

export async function listCategories(page = 1, pageSize = 50): Promise<TaxonomyPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<TaxonomyPage & { categories: TaxonomyItem[] }>(`/api/categories?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function listTags(page = 1, pageSize = 50): Promise<TaxonomyPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<TaxonomyPage & { tags: TaxonomyItem[] }>(`/api/tags?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function saveTaxonomyItem(
  kind: 'categories' | 'tags',
  itemId: string | null,
  name: string,
): Promise<TaxonomyItem> {
  const result = await request<{ category?: TaxonomyItem; tag?: TaxonomyItem }>(
    itemId ? `/api/${kind}/${encodeURIComponent(itemId)}` : `/api/${kind}`,
    {
      method: itemId ? 'PATCH' : 'POST',
      body: JSON.stringify({ name }),
    },
  );
  const item = kind === 'categories' ? result?.category : result?.tag;
  if (!item) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return item;
}

export async function deleteTaxonomyItem(
  kind: 'categories' | 'tags',
  itemId: string,
): Promise<void> {
  await request(`/api/${kind}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export async function getNoteTaxonomy(noteId: string): Promise<NoteTaxonomy> {
  const result = await request<NoteTaxonomy>(
    `/api/notes/${encodeURIComponent(noteId)}/taxonomy`,
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function saveNoteTaxonomy(
  noteId: string,
  categoryIds: string[],
  tagIds: string[],
  personIds: string[] = [],
): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(noteId)}/taxonomy`, {
    method: 'PUT',
    body: JSON.stringify({ categoryIds, tagIds, personIds }),
  });
}

export async function listPeople(
  page = 1,
  pageSize = 50,
  group?: RelationshipGroup,
  q = '',
): Promise<PersonPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (group) query.set('group', group);
  if (q) query.set('q', q);
  const result = await request<PersonPage>(`/api/people?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createPerson(payload: Partial<Person> & { name: string; relationshipGroup: RelationshipGroup }): Promise<Person> {
  const result = await request<{ person: Person }>('/api/people', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.person;
}

export async function updatePerson(personId: string, payload: Partial<Person>): Promise<Person> {
  const result = await request<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.person;
}

export async function deletePerson(personId: string): Promise<void> {
  await request(`/api/people/${encodeURIComponent(personId)}`, { method: 'DELETE' });
}

export async function getPersonNotes(personId: string): Promise<Note[]> {
  const result = await request<{ notes: Note[] }>(`/api/people/${encodeURIComponent(personId)}/notes`);
  return result?.notes ?? [];
}

export async function listReminders(params: { from?: string; to?: string; completed?: boolean } = {}): Promise<Reminder[]> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.completed !== undefined) query.set('completed', String(params.completed));
  const result = await request<{ reminders: Reminder[] }>(`/api/reminders?${query}`);
  return result?.reminders ?? [];
}

export async function listUpcomingReminders(days = 45): Promise<Reminder[]> {
  const result = await request<{ reminders: Reminder[] }>(`/api/reminders/upcoming?days=${days}`);
  return result?.reminders ?? [];
}

export async function createReminder(payload: Partial<Reminder> & { title: string; targetDate: string; category: ReminderCategory }): Promise<Reminder> {
  const result = await request<{ reminder: Reminder }>('/api/reminders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.reminder;
}

export async function updateReminder(reminderId: string, payload: Partial<Reminder>): Promise<Reminder> {
  const result = await request<{ reminder: Reminder }>(`/api/reminders/${encodeURIComponent(reminderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.reminder;
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await request(`/api/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' });
}

export async function listTimeblocks(date: string): Promise<Timeblock[]> {
  const result = await request<{ blocks: Timeblock[] }>(`/api/timeblocks?date=${encodeURIComponent(date)}`);
  return result?.blocks ?? [];
}

export async function createTimeblock(payload: { blockDate: string; timeRange: string; title: string; lifeArea: LifeArea }): Promise<Timeblock> {
  const result = await request<{ block: Timeblock }>('/api/timeblocks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.block;
}

export async function updateTimeblock(blockId: string, payload: Partial<Timeblock>): Promise<Timeblock> {
  const result = await request<{ block: Timeblock }>(`/api/timeblocks/${encodeURIComponent(blockId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.block;
}

export async function deleteTimeblock(blockId: string): Promise<void> {
  await request(`/api/timeblocks/${encodeURIComponent(blockId)}`, { method: 'DELETE' });
}

export async function listHabits(): Promise<Habit[]> {
  const result = await request<{ habits: Habit[] }>('/api/habits');
  return result?.habits ?? [];
}

export async function createHabit(payload: { title: string; dailyTarget?: number; unit?: string }): Promise<Habit> {
  const result = await request<{ habit: Habit }>('/api/habits', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.habit;
}

export async function checkHabit(habitId: string, date: string): Promise<Habit> {
  const result = await request<{ habit: Habit }>(`/api/habits/${encodeURIComponent(habitId)}/check`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.habit;
}

export async function deleteHabit(habitId: string): Promise<void> {
  await request(`/api/habits/${encodeURIComponent(habitId)}`, { method: 'DELETE' });
}

export async function searchAll(q: string, limit = 8): Promise<SearchResults> {
  const query = new URLSearchParams({ q, limit: String(limit) });
  const result = await request<SearchResults>(`/api/search?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function restoreNote(noteId: string): Promise<Note> {
  const result = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(noteId)}/restore`, {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(noteId)}/permanent`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true }),
  });
}

export async function getNote(noteId: string): Promise<Note> {
  const result = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(noteId)}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function listFavorites(page = 1, pageSize = 50): Promise<FavoritePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<FavoritePage>(`/api/favorites?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getFavoriteStatus(
  itemType: FavoriteItemType,
  itemId: string,
): Promise<boolean> {
  const result = await request<{ favorited: boolean }>(
    `/api/favorites/${itemType}/${encodeURIComponent(itemId)}`,
  );
  return result?.favorited ?? false;
}

export async function addFavorite(itemType: FavoriteItemType, itemId: string): Promise<void> {
  await request(`/api/favorites/${itemType}/${encodeURIComponent(itemId)}`, { method: 'PUT' });
}

export async function removeFavorite(itemType: FavoriteItemType, itemId: string): Promise<void> {
  await request(`/api/favorites/${itemType}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export async function listFiles(page = 1, pageSize = 50): Promise<FilePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<FilePage>(`/api/files?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function uploadFile(file: File): Promise<StoredFile> {
  const headers = new Headers();
  headers.set('x-pkh-request', '1');
  headers.set('x-file-name', encodeURIComponent(file.name));
  headers.set('content-type', 'application/octet-stream');

  const response = await fetch('/api/files', {
    method: 'POST',
    headers,
    body: file,
    credentials: 'same-origin',
  });
  let payload: { error?: string; file?: StoredFile };
  try {
    payload = await response.json() as { error?: string; file?: StoredFile };
  } catch {
    throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่อ่านไม่ได้', response.status);
  }
  if (!response.ok || !payload.file) {
    throw new ApiError(payload.error ?? 'อัปโหลดไฟล์ไม่สำเร็จ', response.status);
  }
  return payload.file;
}

export async function deleteFile(fileId: string): Promise<void> {
  await request(`/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- work core

export type TaskStatus = 'todo' | 'doing' | 'waiting' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'done' | 'archived';
export type GoalStatus = 'active' | 'achieved' | 'dropped';
export type GoalHorizon = 'week' | 'month' | 'quarter' | 'year' | 'life';
export type InboxKind = 'text' | 'url' | 'file' | 'task' | 'reminder';
export type InboxStatus = 'new' | 'triaged' | 'archived';
export type ConvertTarget = 'note' | 'task' | 'project' | 'bookmark' | 'reminder';

export interface InboxItem {
  id: string;
  body: string;
  kind: InboxKind;
  status: InboxStatus;
  convertedType: ConvertTarget | null;
  convertedId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  projectId: string | null;
  projectName: string | null;
  goalId: string | null;
  goalTitle: string | null;
  personId: string | null;
  personName: string | null;
  recurrence: Recurrence;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  checklistTotal: number;
  checklistDone: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  outcome: string;
  status: ProjectStatus;
  area: string;
  goalId: string | null;
  goalTitle: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  taskTotal: number;
  taskDone: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  metric: string;
  targetValue: number | null;
  currentValue: number;
  unit: string;
  horizon: GoalHorizon;
  status: GoalStatus;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  activeProjects: number;
  progressPercent: number | null;
}

export interface InboxPage {
  items: InboxItem[];
  page: number;
  pageSize: number;
  total: number;
  newCount: number;
}

export async function listInbox(status: InboxStatus | 'all' = 'new', page = 1, pageSize = 50): Promise<InboxPage> {
  const query = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  const result = await request<InboxPage>(`/api/inbox?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createInboxItem(body: string, kind?: InboxKind): Promise<InboxItem> {
  const result = await request<{ item: InboxItem }>('/api/inbox', {
    method: 'POST',
    body: JSON.stringify({ body, ...(kind ? { kind } : {}) }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function updateInboxItem(
  itemId: string,
  payload: { body?: string; kind?: InboxKind; status?: InboxStatus },
): Promise<InboxItem> {
  const result = await request<{ item: InboxItem }>(`/api/inbox/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function deleteInboxItem(itemId: string): Promise<void> {
  await request<void>(`/api/inbox/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export async function convertInboxItem(
  itemId: string,
  target: ConvertTarget,
  extra: { title?: string; url?: string; targetDate?: string } = {},
): Promise<{ item: InboxItem; targetId: string }> {
  const result = await request<{ item: InboxItem; target: ConvertTarget; targetId: string }>(
    `/api/inbox/${encodeURIComponent(itemId)}/convert`,
    { method: 'POST', body: JSON.stringify({ target, ...extra }) },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return { item: result.item, targetId: result.targetId };
}

export async function listTasks(params: {
  status?: TaskStatus | 'open' | 'all';
  due?: 'today' | 'overdue' | 'week' | 'none';
  projectId?: string;
  goalId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ tasks: Task[]; total: number; today: string }> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.due) query.set('due', params.due);
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.goalId) query.set('goalId', params.goalId);
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 50));
  const result = await request<{ tasks: Task[]; total: number; today: string }>(`/api/tasks?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getTodayTasks(): Promise<{
  today: string;
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
}> {
  const result = await request<{ today: string; overdue: Task[]; dueToday: Task[]; upcoming: Task[] }>('/api/tasks/today');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createTask(payload: {
  title: string;
  detail?: string;
  priority?: TaskPriority;
  dueDate?: string;
  startDate?: string;
  projectId?: string | null;
  goalId?: string | null;
  personId?: string | null;
  recurrence?: Recurrence;
}): Promise<Task> {
  const result = await request<{ task: Task }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.task;
}

export async function updateTask(
  taskId: string,
  payload: Partial<Pick<Task, 'title' | 'detail' | 'status' | 'priority' | 'dueDate' | 'startDate' | 'recurrence'>> & {
    projectId?: string | null;
    goalId?: string | null;
    personId?: string | null;
  },
): Promise<{ task: Task; nextTask: Task | null }> {
  const result = await request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteTask(taskId: string): Promise<void> {
  await request<void>(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

export async function listProjects(status: ProjectStatus | 'all' = 'active'): Promise<Project[]> {
  const query = new URLSearchParams({ status });
  const result = await request<{ projects: Project[] }>(`/api/projects?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.projects;
}

export async function createProject(payload: {
  name: string;
  description?: string;
  outcome?: string;
  status?: ProjectStatus;
  area?: string;
  goalId?: string | null;
  startDate?: string;
  dueDate?: string;
}): Promise<Project> {
  const result = await request<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.project;
}

export async function updateProject(projectId: string, payload: Record<string, unknown>): Promise<Project> {
  const result = await request<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await request<void>(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
}

export async function listGoals(status: GoalStatus | 'all' = 'active'): Promise<Goal[]> {
  const query = new URLSearchParams({ status });
  const result = await request<{ goals: Goal[] }>(`/api/goals?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.goals;
}

export async function createGoal(payload: {
  title: string;
  description?: string;
  metric?: string;
  targetValue?: number | null;
  currentValue?: number;
  unit?: string;
  horizon?: GoalHorizon;
  dueDate?: string;
}): Promise<Goal> {
  const result = await request<{ goal: Goal }>('/api/goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.goal;
}

export async function updateGoal(goalId: string, payload: Record<string, unknown>): Promise<Goal> {
  const result = await request<{ goal: Goal }>(`/api/goals/${encodeURIComponent(goalId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.goal;
}

export async function deleteGoal(goalId: string): Promise<void> {
  await request<void>(`/api/goals/${encodeURIComponent(goalId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- dashboard

export interface DashboardCounts {
  dueToday: number;
  overdue: number;
  openTasks: number;
  reminders: number;
  inbox: number;
  projects: number;
  goals: number;
  habitsOutstanding: number;
  notes: number;
  upcomingWindowEnd: string;
}

export interface DashboardHabit extends Habit {
  weekLogged: number;
  weekMetTarget: number;
}

export interface DashboardData {
  today: string;
  counts: DashboardCounts;
  tasks: { dueToday: Task[]; overdue: Task[] };
  reminders: Reminder[];
  timeblocks: { blocks: Timeblock[]; done: number; total: number };
  projects: Project[];
  goals: Goal[];
  habits: DashboardHabit[];
  inbox: { newCount: number; items: InboxItem[] };
  notes: Array<{ id: string; title: string; updatedAt: number }>;
}

export async function getDashboard(): Promise<DashboardData> {
  const result = await request<DashboardData>('/api/dashboard');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

// ---------------------------------------------------------------- habit logs

export async function getHabitsHistory(days = 7): Promise<HabitsHistory> {
  const query = new URLSearchParams({ days: String(days) });
  const result = await request<HabitsHistory>(`/api/habits/history?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getHabitHistory(habitId: string, days = 30): Promise<HabitHistory> {
  const query = new URLSearchParams({ days: String(days) });
  const result = await request<HabitHistory>(`/api/habits/${encodeURIComponent(habitId)}/history?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function setHabitLog(
  habitId: string,
  logDate: string,
  count: number,
): Promise<{ habit: Habit; log: { id: string; count: number; logDate: string } | null }> {
  const result = await request<{ habit: Habit; log: { id: string; count: number; logDate: string } | null }>(
    `/api/habits/${encodeURIComponent(habitId)}/logs/${encodeURIComponent(logDate)}`,
    { method: 'PUT', body: JSON.stringify({ count }) },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function snoozeReminder(
  reminderId: string,
  days: number,
  from?: string,
): Promise<{ reminder: Reminder; snoozedFrom: string; snoozedUntil: string }> {
  const result = await request<{ reminder: Reminder; snoozedFrom: string; snoozedUntil: string }>(
    `/api/reminders/${encodeURIComponent(reminderId)}/snooze`,
    { method: 'POST', body: JSON.stringify(from ? { days, from } : { days }) },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}
