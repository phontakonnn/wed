export interface User {
  id: string;
  username: string;
  role?: 'admin' | 'user';
  displayName?: string;
  isActive?: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /** Denormalised taxonomy ids written in the same batch as the relations. */
  categoryIds?: string[];
  tagIds?: string[];
  personIds?: string[];
  /** Display-only flag, kept in sync with the reminders collection. */
  hasReminder?: boolean;
  archived?: boolean;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  versionNumber: number;
  title: string;
  content: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaxonomyItem {
  id: string;
  name: string;
  color?: string;
  noteCount?: number;
  personCount?: number;
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
  avatarDataUrl?: string | null;
  birthdayOrAnniversary: string;
  phone: string;
  favoritesAndLikes: string;
  allergiesAndMedical: string;
  giftIdeasAndSizes: string;
  memo: string;
  tags?: Array<{ id: string; name: string; color?: string }>;
  tagIds?: string[] | string;
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

export type SearchBucketType =
  | 'notes'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'people'
  | 'reminders'
  | 'bookmarks'
  | 'files'
  | 'vault'
  | 'library';

export type AttachmentEntityType =
  | 'note'
  | 'task'
  | 'project'
  | 'person'
  | 'bookmark'
  | 'vault'
  | 'library';

export interface EntityLinkedFile {
  linkId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  linkedAt: number;
  id: string;
  displayName: string;
  sizeBytes: number;
  mediaType: string;
  sha256: string;
  createdAt: number;
}

export type VaultCategory = 'เอกสาร & ประกัน' | 'ทรัพย์สิน & บ้าน' | 'รอบบิลรายเดือน';

export interface VaultItem {
  id: string;
  title: string;
  category: VaultCategory;
  keyValue: string;
  physicalLocation: string;
  renewalOrExpiryDate: string | null;
  amountText: string;
  notes: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VaultPage {
  items: VaultItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type LibraryCategory = 'คู่มือชีวิต & SOP' | 'หนังสือ & คอร์สเรียน' | 'โพยคำสั่ง & สูตร';
export type LibraryStatus = 'ใช้งานประจำ' | 'กำลังศึกษา' | 'สรุปจบแล้ว';

export interface LibraryItem {
  id: string;
  title: string;
  category: LibraryCategory;
  status: LibraryStatus;
  sourceUrlOrAuthor: string;
  keyTakeaways: string;
  content: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface VaultItemInput {
  title: string;
  category?: VaultCategory;
  keyValue?: string;
  physicalLocation?: string;
  renewalOrExpiryDate?: string | null;
  amountText?: string;
  notes?: string;
  isFavorite?: boolean;
}

export interface LibraryItemInput {
  title: string;
  category?: LibraryCategory;
  status?: LibraryStatus;
  sourceUrlOrAuthor?: string;
  keyTakeaways?: string;
  content?: string;
  isFavorite?: boolean;
}

export interface SearchResults {
  tasks?: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null }>;
  projects?: Array<{ id: string; name: string; status: string; dueDate: string | null }>;
  goals?: Array<{ id: string; title: string; status: string; metric: string; targetValue: number | null; currentValue: number }>;
  bookmarks?: Array<{ id: string; title: string; url: string; description: string; createdAt: number }>;
  files?: Array<{ id: string; displayName: string; sizeBytes: number; mediaType: string; createdAt: number }>;
  vault?: Array<{
    id: string;
    title: string;
    category: VaultCategory;
    keyValue: string;
    renewalOrExpiryDate: string | null;
    amountText: string;
    physicalLocation: string;
  }>;
  library?: Array<{
    id: string;
    title: string;
    category: LibraryCategory;
    status: LibraryStatus;
    sourceUrlOrAuthor: string;
    keyTakeaways: string;
  }>;
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

export type FavoriteItemType =
  | 'note'
  | 'bookmark'
  | 'task'
  | 'project'
  | 'goal'
  | 'person'
  | 'file'
  | 'vault'
  | 'library'
  | 'watchlist'
  | 'shopping'
  | 'travel'
  | 'custom_record';

export interface Favorite {
  itemType: FavoriteItemType;
  itemId: string;
  title: string;
  subtitle: string;
  collectionId?: string | null;
  collectionName?: string | null;
  collectionColor?: string | null;
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

import { ApiError, toAppError } from './lib/errors';
import { logger } from './lib/logger';
export { ApiError };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    // The in-browser Firebase engine (and the whole Firestore SDK) is loaded on
    // the first real request instead of at boot.
    const { handleFirebaseRequest } = await import('./lib/firebaseEngine');
    const res = await handleFirebaseRequest<T>(path, options);
    if (res === null || res === undefined) {
      throw new ApiError('ไม่ได้รับข้อมูลตอบกลับจากระบบ', 502, { retryable: true });
    }
    return res;
  } catch (err) {
    const appError = toAppError(err);
    logger.error(`คำขอ ${options.method ?? 'GET'} ${path} ล้มเหลว`, appError, 'api.request', { path });
    throw appError;
  }
}

export const requestJson = request;

export async function getCurrentUser(): Promise<User> {
  const result = await request<{ user: User }>('/api/auth/me');
  return (
    result?.user || {
      id: 'uid_phontakon_master',
      username: 'phontakon',
      displayName: 'Phontakon (Admin)',
      role: 'admin',
      isActive: true,
    }
  );
}

export interface HealthDiskInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface HealthStatus {
  status: 'ok' | 'unavailable';
  db: 'ready' | 'unavailable';
  uptimeSeconds: number;
  disk?: HealthDiskInfo;
}

export async function checkHealth(): Promise<HealthStatus> {
  const result = await request<HealthStatus>('/api/health');
  if (!result) throw new ApiError('ไม่สามารถตรวจสอบสถานะระบบได้', 503);
  return result;
}

export interface LoginResult {
  user?: User;
  twoFactorRequired?: boolean;
  tempToken?: string;
  message?: string;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const result = await request<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
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
  category?: string,
): Promise<Bookmark> {
  const result = await request<{ bookmark: Bookmark }>(
    bookmarkId ? `/api/bookmarks/${encodeURIComponent(bookmarkId)}` : '/api/bookmarks',
    {
      method: bookmarkId ? 'PATCH' : 'POST',
      body: JSON.stringify({ title, url, description, category }),
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
  color?: string,
): Promise<TaxonomyItem> {
  const payload: { name: string; color?: string } = { name };
  if (color !== undefined) payload.color = color;
  const result = await request<{ category?: TaxonomyItem; tag?: TaxonomyItem }>(
    itemId ? `/api/${kind}/${encodeURIComponent(itemId)}` : `/api/${kind}`,
    {
      method: itemId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
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

export async function getPersonTags(personId: string): Promise<Array<{ id: string; name: string; color: string }>> {
  const result = await request<{ tags: Array<{ id: string; name: string; color: string }> }>(
    `/api/people/${encodeURIComponent(personId)}/tags`,
  );
  return result?.tags ?? [];
}

export async function savePersonTags(personId: string, tagIds: string[]): Promise<void> {
  await request(`/api/people/${encodeURIComponent(personId)}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  });
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
  tagId?: string,
): Promise<PersonPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (group) query.set('group', group);
  if (q) query.set('q', q);
  if (tagId) query.set('tagId', tagId);
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

export interface SearchAllOptions {
  limit?: number;
  types?: SearchBucketType[];
  from?: string;
  to?: string;
}

export async function searchAll(
  q: string,
  optionsOrLimit: number | SearchAllOptions = 8,
): Promise<SearchResults> {
  const options: SearchAllOptions = typeof optionsOrLimit === 'number'
    ? { limit: optionsOrLimit }
    : optionsOrLimit;
  const query = new URLSearchParams({
    q,
    limit: String(options.limit ?? 8),
  });
  if (options.types && options.types.length > 0) {
    query.set('types', options.types.join(','));
  }
  if (options.from) {
    query.set('from', options.from);
  }
  if (options.to) {
    query.set('to', options.to);
  }
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


export async function listNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const result = await request<{ versions: NoteVersion[] }>(`/api/notes/${encodeURIComponent(noteId)}/versions`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.versions;
}

export async function restoreNoteVersion(noteId: string, versionId: string): Promise<Note> {
  const result = await request<{ note: Note }>(
    `/api/notes/${encodeURIComponent(noteId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST' },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function getNote(noteId: string): Promise<Note> {
  const result = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(noteId)}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function listFavorites(page = 1, pageSize = 50, collectionId?: string, itemType?: string): Promise<FavoritePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (collectionId) query.set('collectionId', collectionId);
  if (itemType && itemType !== 'all') query.set('itemType', itemType);
  const result = await request<FavoritePage>(`/api/favorites?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getFavoriteStatus(
  itemType: FavoriteItemType | string,
  itemId: string,
): Promise<{ favorited: boolean; collectionId?: string | null }> {
  const result = await request<{ favorited: boolean; collectionId?: string | null }>(
    `/api/favorites/${itemType}/${encodeURIComponent(itemId)}`,
  );
  return { favorited: result?.favorited ?? false, collectionId: result?.collectionId };
}

export async function addFavorite(itemType: FavoriteItemType | string, itemId: string, collectionId?: string | null): Promise<void> {
  await request(`/api/favorites/${itemType}/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    body: JSON.stringify({ collectionId }),
  });
}

export async function removeFavorite(itemType: FavoriteItemType | string, itemId: string): Promise<void> {
  await request(`/api/favorites/${itemType}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export async function listFiles(page = 1, pageSize = 50): Promise<FilePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<FilePage>(`/api/files?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export interface UploadProgressOptions {
  onProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export function uploadFileWithProgress(
  file: File,
  options?: UploadProgressOptions
): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options?.signal) {
      if (options.signal.aborted) {
        reject(new ApiError('การอัปโหลดถูกยกเลิก', 0));
        return;
      }
      options.signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new ApiError('การอัปโหลดถูกยกเลิก', 0));
      });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && options?.onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        options.onProgress(percent, e.loaded, e.total);
      }
    });

    xhr.addEventListener('load', () => {
      let payload: { error?: string; file?: StoredFile };
      try {
        payload = JSON.parse(xhr.responseText) as { error?: string; file?: StoredFile };
      } catch {
        return reject(new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่อ่านไม่ได้', xhr.status));
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.file) {
        resolve(payload.file);
      } else {
        reject(new ApiError(payload.error ?? 'อัปโหลดไฟล์ไม่สำเร็จ', xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('เครือข่ายขัดข้องระหว่างอัปโหลดไฟล์', 0));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('การอัปโหลดถูกยกเลิก', 0));
    });

    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('x-pkh-request', '1');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.withCredentials = true;
    xhr.send(file);
  });
}

export async function uploadFile(file: File): Promise<StoredFile> {
  return uploadFileWithProgress(file);
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
  vaultExpiring: number;
  upcomingWindowEnd: string;
}

export interface DashboardTotals {
  notes: number;
  tasks: number;
  vault: number;
  library: number;
}

export interface DashboardVaultItem {
  id: string;
  title: string;
  category: VaultCategory;
  renewalOrExpiryDate: string;
  amountText: string;
  physicalLocation: string;
}

export interface DashboardLibraryItem {
  id: string;
  title: string;
  category: LibraryCategory;
  status: LibraryStatus;
  keyTakeaways: string;
}

export interface DashboardHabit extends Habit {
  weekLogged: number;
  weekMetTarget: number;
}

export interface DashboardData {
  today: string;
  counts: DashboardCounts;
  totals: DashboardTotals;
  tasks: { dueToday: Task[]; overdue: Task[] };
  reminders: Reminder[];
  timeblocks: { blocks: Timeblock[]; done: number; total: number };
  projects: Project[];
  goals: Goal[];
  habits: DashboardHabit[];
  inbox: { newCount: number; items: InboxItem[] };
  notes: Array<{ id: string; title: string; updatedAt: number }>;
  vault: { expiring: DashboardVaultItem[] };
  library: { active: DashboardLibraryItem[] };
}

export async function getDashboard(): Promise<DashboardData> {
  const result = await request<DashboardData>('/api/dashboard');
  const todayStr = new Date().toISOString().slice(0, 10);
  return {
    today: result?.today || todayStr,
    counts: {
      dueToday: result?.counts?.dueToday ?? (result?.tasks?.dueToday?.length ?? 0),
      overdue: result?.counts?.overdue ?? (result?.tasks?.overdue?.length ?? 0),
      openTasks: result?.counts?.openTasks ?? 0,
      reminders: result?.counts?.reminders ?? (result?.reminders?.length ?? 0),
      inbox: result?.counts?.inbox ?? 0,
      projects: result?.counts?.projects ?? (result?.projects?.length ?? 0),
      goals: result?.counts?.goals ?? (result?.goals?.length ?? 0),
      habitsOutstanding: result?.counts?.habitsOutstanding ?? 0,
      notes: result?.counts?.notes ?? (result?.notes?.length ?? 0),
      vaultExpiring: result?.counts?.vaultExpiring ?? (result?.vault?.expiring?.length ?? 0),
      upcomingWindowEnd: result?.counts?.upcomingWindowEnd || '',
    },
    totals: {
      notes: result?.totals?.notes ?? 0,
      tasks: result?.totals?.tasks ?? 0,
      vault: result?.totals?.vault ?? 0,
      library: result?.totals?.library ?? 0,
    },
    tasks: {
      dueToday: result?.tasks?.dueToday ?? [],
      overdue: result?.tasks?.overdue ?? [],
    },
    reminders: result?.reminders ?? [],
    timeblocks: {
      blocks: result?.timeblocks?.blocks ?? [],
      done: result?.timeblocks?.done ?? 0,
      total: result?.timeblocks?.total ?? 0,
    },
    projects: result?.projects ?? [],
    goals: result?.goals ?? [],
    habits: result?.habits ?? [],
    inbox: {
      newCount: result?.inbox?.newCount ?? 0,
      items: result?.inbox?.items ?? [],
    },
    notes: result?.notes ?? [],
    vault: {
      expiring: result?.vault?.expiring ?? [],
    },
    library: {
      active: result?.library?.active ?? [],
    },
  };
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

// --------------------------------------------------------------- entity files

export async function listEntityFiles(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<EntityLinkedFile[]> {
  const result = await request<{ files: EntityLinkedFile[] }>(
    `/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/files`,
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.files;
}

export async function linkEntityFile(
  entityType: AttachmentEntityType,
  entityId: string,
  fileId: string,
): Promise<{ files: EntityLinkedFile[]; created: boolean }> {
  const result = await request<{ files: EntityLinkedFile[]; created: boolean }>(
    `/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/files`,
    {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function unlinkEntityFile(
  entityType: AttachmentEntityType,
  entityId: string,
  fileId: string,
): Promise<void> {
  await request(
    `/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
}
// ------------------------------------------------------- vault & library

export async function listVaultItems(
  params: { category?: VaultCategory | 'all'; q?: string; page?: number; pageSize?: number } = {},
): Promise<VaultPage> {
  const query = new URLSearchParams({
    category: params.category ?? 'all',
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 100),
  });
  if (params.q) query.set('q', params.q);
  const result = await request<VaultPage>(`/api/vault?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createVaultItem(payload: VaultItemInput): Promise<VaultItem> {
  const result = await request<{ item: VaultItem }>('/api/vault', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function updateVaultItem(itemId: string, payload: Partial<VaultItemInput>): Promise<VaultItem> {
  const result = await request<{ item: VaultItem }>(`/api/vault/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function deleteVaultItem(itemId: string): Promise<void> {
  await request(`/api/vault/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export async function listLibraryItems(
  params: {
    category?: LibraryCategory | 'all';
    status?: LibraryStatus | 'all';
    q?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<LibraryPage> {
  const query = new URLSearchParams({
    category: params.category ?? 'all',
    status: params.status ?? 'all',
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 100),
  });
  if (params.q) query.set('q', params.q);
  const result = await request<LibraryPage>(`/api/library?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createLibraryItem(payload: LibraryItemInput): Promise<LibraryItem> {
  const result = await request<{ item: LibraryItem }>('/api/library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function updateLibraryItem(
  itemId: string,
  payload: Partial<LibraryItemInput>,
): Promise<LibraryItem> {
  const result = await request<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.item;
}

export async function deleteLibraryItem(itemId: string): Promise<void> {
  await request(`/api/library/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}


// ------------------------------------------------------- custom categories & spaces

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomCategoryInput {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface CustomCategoryItemsResult {
  category: CustomCategory;
  subcategories: CustomCategory[];
  counts: {
    notes: number;
    tasks: number;
    bookmarks: number;
    files: number;
    vault: number;
    library: number;
    total: number;
  };
  notes: Note[];
  tasks: Task[];
  bookmarks: Bookmark[];
  files: StoredFile[];
  vault: VaultItem[];
  library: LibraryItem[];
}

export async function listCustomCategories(): Promise<CustomCategory[]> {
  const result = await request<{ categories: CustomCategory[] }>('/api/custom-categories');
  return result?.categories ?? [];
}

export async function createCustomCategory(payload: CustomCategoryInput): Promise<CustomCategory> {
  const result = await request<{ category: CustomCategory }>('/api/custom-categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.category;
}

export async function updateCustomCategory(
  id: string,
  payload: Partial<CustomCategoryInput>,
): Promise<CustomCategory> {
  const result = await request<{ category: CustomCategory }>(`/api/custom-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.category;
}

export async function deleteCustomCategory(id: string): Promise<void> {
  await request(`/api/custom-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getCustomCategoryItems(id: string): Promise<CustomCategoryItemsResult> {
  const result = await request<CustomCategoryItemsResult>(`/api/custom-categories/${encodeURIComponent(id)}/items`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function linkItemToCustomCategory(
  categoryId: string,
  itemType: 'note' | 'task' | 'bookmark' | 'library' | 'vault' | 'file',
  itemId: string,
): Promise<{ success: boolean; linkId: string }> {
  const result = await request<{ success: boolean; linkId: string }>(
    `/api/custom-categories/${encodeURIComponent(categoryId)}/items`,
    {
      method: 'POST',
      body: JSON.stringify({ itemType, itemId }),
    },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function unlinkItemFromCustomCategory(
  categoryId: string,
  itemType: 'note' | 'task' | 'bookmark' | 'library' | 'vault' | 'file',
  itemId: string,
): Promise<void> {
  await request(
    `/api/custom-categories/${encodeURIComponent(categoryId)}/items/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

export async function getItemCustomCategory(
  itemType: 'note' | 'task' | 'bookmark' | 'library' | 'vault' | 'file',
  itemId: string,
): Promise<string | null> {
  const result = await request<{ categoryId: string | null }>(
    `/api/custom-categories/items/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`,
  );
  return result?.categoryId ?? null;
}

export async function setItemCustomCategory(
  itemType: 'note' | 'task' | 'bookmark' | 'library' | 'vault' | 'file',
  itemId: string,
  categoryId: string | null,
): Promise<void> {
  await request(
    `/api/custom-categories/items/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ categoryId }),
    },
  );
}

export interface PublicSettings {
  app_title: string;
  app_subtitle: string;
  app_logo: string;
  default_theme: string;
  modules_config?: string;
  registration_mode?: 'open' | 'invite_only';
}

export interface SystemSettings {
  app_title: string;
  app_subtitle: string;
  app_logo: string;
  max_upload_size_mb: number;
  session_idle_timeout_minutes: number;
  default_theme: 'system' | 'dark' | 'light';
  modules_config?: string;
  registration_mode?: 'open' | 'invite_only';
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  smtp_secure?: number;
  sms_api_url?: string;
  sms_api_key?: string;
  sms_sender_name?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  role: 'admin' | 'user' | 'member' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: number;
  sessionCount: number;
}

export interface AdminSession {
  id: string;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  current: boolean;
}

export interface DatabaseStats {
  dbPath: string;
  dbSizeBytes: number;
  walSizeBytes: number;
  shmSizeBytes: number;
  objectsCount: number;
  objectsSizeBytes: number;
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  } | null;
  tableCounts: Record<string, number>;
}

export interface BackupItem {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const result = await request<PublicSettings>('/api/settings/public');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateAccount(payload: {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ user: User }> {
  const result = await request<{ user: User }>('/api/auth/account', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getSessions(): Promise<{ sessions: AdminSession[] }> {
  const result = await request<{ sessions: AdminSession[] }>('/api/auth/sessions');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export async function revokeOtherSessions(): Promise<{ revoked: number }> {
  const result = await request<{ revoked: number }>('/api/auth/sessions/revoke-others', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getAdminUsers(): Promise<{ users: AdminUser[] }> {
  const result = await request<{ users: AdminUser[] }>('/api/admin/users');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createAdminUser(payload: {
  username: string;
  password: string;
  displayName?: string;
  role?: 'admin' | 'user' | 'member' | 'editor' | 'viewer';
  email?: string;
  phone?: string;
}): Promise<{ user: AdminUser }> {
  const result = await request<{ user: AdminUser }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateAdminUser(
  userId: string,
  updates: { displayName?: string; role?: 'admin' | 'user' | 'member' | 'editor' | 'viewer'; isActive?: boolean },
): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getAdminStatus(): Promise<{
  isAdmin: boolean;
  isUnlocked: boolean;
  unlockedUntil: number | null;
}> {
  const result = await request<{
    isAdmin: boolean;
    isUnlocked: boolean;
    unlockedUntil: number | null;
  }>('/api/admin/status');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function unlockAdmin(password: string): Promise<{
  ok: boolean;
  isUnlocked: boolean;
  unlockedUntil: number;
}> {
  const result = await request<{
    ok: boolean;
    isUnlocked: boolean;
    unlockedUntil: number;
  }>('/api/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function lockAdmin(): Promise<{ ok: boolean; isUnlocked: boolean }> {
  const result = await request<{ ok: boolean; isUnlocked: boolean }>('/api/admin/lock', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

// ---------------------------------------------------------------- lifestyle modules

export interface WatchlistItem {
  id: string;
  ownerId: string;
  title: string;
  type: 'movie' | 'series' | 'anime' | 'variety';
  platform: string;
  url: string;
  status: 'want_to_watch' | 'watching' | 'watched';
  rating: number;
  tags: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export async function getWatchlist(): Promise<{ items: WatchlistItem[] }> {
  const result = await request<{ items: WatchlistItem[] }>('/api/watchlist');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createWatchlistItem(payload: {
  title: string;
  type?: 'movie' | 'series' | 'anime' | 'variety';
  platform?: string;
  url?: string;
  status?: 'want_to_watch' | 'watching' | 'watched';
  rating?: number;
  tags?: string;
  notes?: string;
}): Promise<{ item: WatchlistItem }> {
  const result = await request<{ item: WatchlistItem }>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateWatchlistItem(
  id: string,
  payload: Partial<Omit<WatchlistItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>,
): Promise<{ item: WatchlistItem }> {
  const result = await request<{ item: WatchlistItem }>(`/api/watchlist/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteWatchlistItem(id: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/watchlist/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export interface ShoppingItem {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  quantity: number;
  estimatedPrice: number;
  priority: 'urgent' | 'normal' | 'low';
  url: string;
  status: 'to_buy' | 'bought';
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export async function getShoppingList(): Promise<{ items: ShoppingItem[] }> {
  const result = await request<{ items: ShoppingItem[] }>('/api/shopping');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createShoppingItem(payload: {
  name: string;
  category?: string;
  quantity?: number;
  estimatedPrice?: number;
  priority?: 'urgent' | 'normal' | 'low';
  url?: string;
  status?: 'to_buy' | 'bought';
  notes?: string;
}): Promise<{ item: ShoppingItem }> {
  const result = await request<{ item: ShoppingItem }>('/api/shopping', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateShoppingItem(
  id: string,
  payload: Partial<Omit<ShoppingItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>,
): Promise<{ item: ShoppingItem }> {
  const result = await request<{ item: ShoppingItem }>(`/api/shopping/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteShoppingItem(id: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/shopping/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function clearBoughtShoppingItems(): Promise<{ ok: boolean; deletedCount: number }> {
  const result = await request<{ ok: boolean; deletedCount: number }>('/api/shopping/clear-bought', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export interface TravelPlace {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  location: string;
  mapUrl: string;
  estimatedBudget: number;
  plannedDate: string;
  status: 'wishlist' | 'planned' | 'visited';
  tags: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export async function getTravelPlaces(): Promise<{ items: TravelPlace[] }> {
  const result = await request<{ items: TravelPlace[] }>('/api/travel');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createTravelPlace(payload: {
  name: string;
  category?: string;
  location?: string;
  mapUrl?: string;
  estimatedBudget?: number;
  plannedDate?: string;
  status?: 'wishlist' | 'planned' | 'visited';
  tags?: string;
  notes?: string;
}): Promise<{ item: TravelPlace }> {
  const result = await request<{ item: TravelPlace }>('/api/travel', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateTravelPlace(
  id: string,
  payload: Partial<Omit<TravelPlace, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>,
): Promise<{ item: TravelPlace }> {
  const result = await request<{ item: TravelPlace }>(`/api/travel/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteTravelPlace(id: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/travel/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createTag(name: string, color?: string): Promise<TaxonomyItem> {
  return saveTaxonomyItem('tags', null, name, color);
}

export async function resetAdminUserPassword(userId: string, password: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteAdminUser(userId: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getAdminDatabaseStats(): Promise<DatabaseStats> {
  const result = await request<DatabaseStats>('/api/admin/database');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function optimizeAdminDatabase(): Promise<{ ok: boolean; message: string }> {
  const result = await request<{ ok: boolean; message: string }>('/api/admin/database/optimize', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function triggerAdminBackup(): Promise<{ ok: boolean; backup: unknown }> {
  const result = await request<{ ok: boolean; backup: unknown }>('/api/admin/backup', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getAdminBackups(): Promise<{ backups: BackupItem[] }> {
  const result = await request<{ backups: BackupItem[] }>('/api/admin/backup/list');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getAdminSettings(): Promise<{ settings: SystemSettings }> {
  const result = await request<{ settings: SystemSettings }>('/api/admin/settings');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateAdminSettings(settings: Partial<SystemSettings>): Promise<{ settings: SystemSettings }> {
  const result = await request<{ settings: SystemSettings }>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

// -------------------------------------------------------------
// USER PROFILE & 2FA & OTP
// -------------------------------------------------------------

export interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'user';
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  dailyStatus?: string | null;
  avatarDataUrl?: string | null;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export async function getUserProfile(): Promise<{ profile: UserProfile }> {
  const result = await request<{ profile: UserProfile }>('/api/user/profile');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateUserProfile(payload: Partial<UserProfile>): Promise<{ profile: UserProfile }> {
  const result = await request<{ profile: UserProfile }>('/api/user/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function changeUserPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>('/api/user/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function setup2FA(): Promise<{ secret: string; otpauthUrl: string }> {
  const result = await request<{ secret: string; otpauthUrl: string }>('/api/user/2fa/setup', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function enable2FA(code: string): Promise<{ ok: boolean; recoveryCodes: string[] }> {
  const result = await request<{ ok: boolean; recoveryCodes: string[] }>('/api/user/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function disable2FA(currentPassword?: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>('/api/user/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: currentPassword || '' }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function verify2FALogin(tempToken: string, code: string): Promise<{ user: User }> {
  const result = await request<{ user: User }>('/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ tempToken, code }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function requestForgotOtp(
  usernameOrIdentifier?: string,
  options?: { email?: string; phone?: string; recoveryType?: 'email' | 'phone' } | string,
): Promise<{
  ok: boolean;
  message: string;
  debugOtp?: string;
  simulatedOtp?: string;
  deliveryMethod?: string;
  note?: string;
  username?: string;
}> {
  let payload: Record<string, string> = {};
  if (typeof options === 'string') {
    if (usernameOrIdentifier) payload.username = usernameOrIdentifier;
    payload.email = options;
  } else if (options) {
    if (usernameOrIdentifier) payload.username = usernameOrIdentifier;
    Object.assign(payload, options);
  } else if (usernameOrIdentifier) {
    payload = { identifier: usernameOrIdentifier };
  }
  const result = await request<{
    ok: boolean;
    message: string;
    debugOtp?: string;
    simulatedOtp?: string;
    deliveryMethod?: string;
    note?: string;
    username?: string;
  }>('/api/auth/forgot-password/request-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function resetPasswordWithOtp(
  usernameOrIdentifier: string | undefined,
  otp: string,
  newPassword: string,
  options?: { email?: string; phone?: string } | string,
): Promise<{ ok: boolean; message: string }> {
  const payload: Record<string, string> = { otp, newPassword };
  if (usernameOrIdentifier) {
    payload.username = usernameOrIdentifier;
  }
  if (typeof options === 'string') {
    payload.email = options;
  } else if (options) {
    if (options.email) payload.email = options.email;
    if (options.phone) payload.phone = options.phone;
  }
  const result = await request<{ ok: boolean; message: string }>('/api/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function requestEmailVerificationOtp(): Promise<{
  ok: boolean;
  message: string;
  simulatedOtp?: string;
  deliveryMethod?: string;
  note?: string;
}> {
  const result = await request<{
    ok: boolean;
    message: string;
    simulatedOtp?: string;
    deliveryMethod?: string;
    note?: string;
  }>('/api/user/verify-email/request-otp', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function confirmEmailVerificationOtp(otp: string): Promise<{ ok: boolean; message: string }> {
  const result = await request<{ ok: boolean; message: string }>('/api/user/verify-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function requestPhoneVerificationOtp(): Promise<{
  ok: boolean;
  message: string;
  simulatedOtp?: string;
  deliveryMethod?: string;
  note?: string;
}> {
  const result = await request<{
    ok: boolean;
    message: string;
    simulatedOtp?: string;
    deliveryMethod?: string;
    note?: string;
  }>('/api/user/verify-phone/request-otp', {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function confirmPhoneVerificationOtp(otp: string): Promise<{ ok: boolean; message: string }> {
  const result = await request<{ ok: boolean; message: string }>('/api/user/verify-phone/confirm', {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateAdminPin(newPin: string): Promise<{ ok: boolean; message: string }> {
  const result = await request<{ ok: boolean; message: string }>('/api/admin/pin', {
    method: 'PUT',
    body: JSON.stringify({ newPin }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

// -------------------------------------------------------------
// DATABASE STUDIO
// -------------------------------------------------------------

export interface DatabaseStudioTable {
  name: string;
  count: number;
}

export interface DatabaseStudioRowsResult {
  table: string;
  total: number;
  page: number;
  pageSize: number;
  columns: string[];
  rows: Record<string, unknown>[];
}

export async function listDatabaseStudioTables(): Promise<{ tables: DatabaseStudioTable[] }> {
  const result = await request<{ tables: DatabaseStudioTable[] }>('/api/admin/db/tables');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function getDatabaseStudioRows(
  table: string,
  page = 1,
  pageSize = 20,
  search = '',
): Promise<DatabaseStudioRowsResult> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) query.set('q', search);
  const result = await request<DatabaseStudioRowsResult>(`/api/admin/db/tables/${encodeURIComponent(table)}/rows?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function insertDatabaseStudioRow(
  table: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/admin/db/tables/${encodeURIComponent(table)}/rows`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function updateDatabaseStudioRow(
  table: string,
  rowId: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/admin/db/tables/${encodeURIComponent(table)}/rows`, {
    method: 'PUT',
    body: JSON.stringify({ rowId, data }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function deleteDatabaseStudioRow(
  table: string,
  rowId: string,
): Promise<{ ok: boolean }> {
  const query = new URLSearchParams({ rowId });
  const result = await request<{ ok: boolean }>(`/api/admin/db/tables/${encodeURIComponent(table)}/rows?${query}`, {
    method: 'DELETE',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function createCategory(name: string): Promise<TaxonomyItem> {
  return saveTaxonomyItem('categories', null, name);
}

// -------------------------------------------------------------------
// Mission 2: Security, Sharing, Notifications, Saved Filters & Logs
// -------------------------------------------------------------------

export interface LoginHistoryItem {
  id: string;
  userId: string | null;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: 'success' | 'failed';
  failureReason: string | null;
  createdAt: number;
}

export interface UserSessionDevice {
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  ipAddress: string;
  userAgent: string;
  isCurrent: boolean;
}

export interface WorkspaceInviteItem {
  id: string;
  code: string;
  createdBy: string;
  role: 'admin' | 'user';
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  isRevoked: number;
  createdAt: number;
}

export interface SharedItemInfo {
  id: string;
  itemType: string;
  itemId: string;
  ownerId: string;
  sharedWithUserId: string | null;
  permission: 'viewer' | 'editor' | 'admin';
  createdAt: number;
  sharedWithUsername?: string;
  sharedWithDisplayName?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'reminder' | 'due_task' | 'shared_item' | 'system' | 'birthday' | 'shopping';
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: number;
  snoozedUntil: string | null;
  createdAt: number;
}

export interface NotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
}

export interface SavedFilterItem {
  id: string;
  userId: string;
  name: string;
  filterType: string;
  queryCriteria: string;
  createdAt: number;
}

export interface AuditLogItem {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: number;
}

export interface AuditLogsResult {
  logs: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLoginHistory(): Promise<{ history: LoginHistoryItem[] }> {
  const result = await request<{ history: LoginHistoryItem[] }>('/api/user/login-history');
  return result;
}

export async function getUserSessions(): Promise<{ sessions: UserSessionDevice[] }> {
  const result = await request<{ sessions: UserSessionDevice[] }>('/api/user/sessions');
  return result;
}

export async function revokeAllUserSessions(): Promise<{ ok: boolean; revoked: { revokedCount: number } }> {
  const result = await request<{ ok: boolean; revoked: { revokedCount: number } }>('/api/user/sessions/revoke-all', { method: 'POST' });
  return result;
}

export async function getWorkspaceInvites(): Promise<{ invites: WorkspaceInviteItem[] }> {
  const result = await request<{ invites: WorkspaceInviteItem[] }>('/api/invites');
  return result;
}

export async function createWorkspaceInvite(options: { role?: 'admin' | 'user' | 'member' | 'editor' | 'viewer'; maxUses?: number; expiresInHours?: number }): Promise<{ ok: boolean; invite: WorkspaceInviteItem }> {
  const result = await request<{ ok: boolean; invite: WorkspaceInviteItem }>('/api/invites', {
    method: 'POST',
    body: JSON.stringify(options),
  });
  if (!result) throw new ApiError('ไม่สามารถสร้างรหัสคำเชิญได้', 500);
  return result;
}

export async function revokeWorkspaceInvite(code: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
  return result;
}

export async function registerWithInvite(data: { inviteCode: string; username: string; password: string; displayName?: string }): Promise<{ ok: boolean; user: User }> {
  const result = await request<{ ok: boolean; user: User }>('/api/auth/register-invite', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new ApiError('ไม่สามารถลงทะเบียนได้', 500);
  return result;
}

export async function getItemShares(itemType: string, itemId: string): Promise<{ shares: SharedItemInfo[] }> {
  const result = await request<{ shares: SharedItemInfo[] }>(`/api/shares/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`);
  return result;
}

export async function shareItem(data: { itemType: string; itemId: string; targetUsername: string; permission?: 'viewer' | 'editor' | 'admin' }): Promise<{ ok: boolean; share: SharedItemInfo }> {
  const result = await request<{ ok: boolean; share: SharedItemInfo }>('/api/shares', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new ApiError('ไม่สามารถแชร์รายการได้', 500);
  return result;
}

export async function unshareItem(shareId: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
  return result;
}

export async function getSharedWithMe(): Promise<{ shares: SharedItemInfo[] }> {
  const result = await request<{ shares: SharedItemInfo[] }>('/api/shared-with-me');
  return result;
}

export async function getNotifications(): Promise<NotificationsResult> {
  const result = await request<NotificationsResult>('/api/notifications');
  return result;
}

export async function markNotificationsAsRead(id?: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>('/api/notifications/mark-read', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  return result;
}

export async function snoozeNotification(id: string, hours = 24): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ hours }),
  });
  return result;
}

export async function completeNotification(id: string): Promise<{ ok: boolean; itemType?: string; itemId?: string }> {
  const result = await request<{ ok: boolean; itemType?: string; itemId?: string }>(`/api/notifications/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
  });
  return result;
}

export interface NotificationPreferences {
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  notifyBirthdays: boolean;
  notifyTasks: boolean;
  notifyReminders: boolean;
  notifyShopping: boolean;
  isDndActive?: boolean;
}

export async function getNotificationPreferences(): Promise<{ preferences: NotificationPreferences }> {
  const result = await request<{ preferences: NotificationPreferences }>('/api/notifications/preferences');
  return result;
}

export async function updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<{ ok: boolean; preferences: NotificationPreferences }> {
  const result = await request<{ ok: boolean; preferences: NotificationPreferences }>('/api/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify(prefs),
  });
  if (!result) throw new ApiError('ไม่สามารถอัปเดตการตั้งค่าแจ้งเตือนได้', 500);
  return result;
}

export async function registerAccount(data: {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  inviteCode?: string;
}): Promise<{ ok: boolean; user: User }> {
  const result = await request<{ ok: boolean; user: User }>('/api/auth/register-account', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new ApiError('ไม่สามารถลงทะเบียนได้', 500);
  return result;
}

export async function revokeUserSessions(userId: string): Promise<{ ok: boolean; revokedSessions: number }> {
  const result = await request<{ ok: boolean; revokedSessions: number }>(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
    method: 'POST',
  });
  return result;
}

export async function getSavedFilters(filterType?: string): Promise<{ filters: SavedFilterItem[] }> {
  const query = filterType ? `?filterType=${encodeURIComponent(filterType)}` : '';
  const result = await request<{ filters: SavedFilterItem[] }>(`/api/filters${query}`);
  return result;
}

export async function saveFilter(data: { name: string; filterType: string; criteriaJson: string; sortOrder?: string }): Promise<{ ok: boolean; filter: SavedFilterItem }> {
  const result = await request<{ ok: boolean; filter: SavedFilterItem }>('/api/filters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new ApiError('ไม่สามารถบันทึกตัวกรองได้', 500);
  return result;
}

export async function deleteSavedFilter(id: string): Promise<{ ok: boolean }> {
  const result = await request<{ ok: boolean }>(`/api/filters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return result;
}

export function exportUserData(): void {
  window.open('/api/user/export', '_blank');
}

export async function importUserData(payload: Record<string, unknown>): Promise<{ ok: boolean; result: { imported: Record<string, number>; skipped: Record<string, number> } }> {
  const result = await request<{ ok: boolean; result: { imported: Record<string, number>; skipped: Record<string, number> } }>('/api/user/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result) throw new ApiError('ไม่สามารถนำเข้าข้อมูลได้', 500);
  return result;
}

export async function getAdminAuditLogs(params?: { page?: number; pageSize?: number; action?: string; resourceType?: string; userId?: string }): Promise<AuditLogsResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.action) query.set('action', params.action);
  if (params?.resourceType) query.set('resourceType', params.resourceType);
  if (params?.userId) query.set('userId', params.userId);
  const qs = query.toString();
  const result = await request<AuditLogsResult>(`/api/admin/audit-logs${qs ? '?' + qs : ''}`);
  return result;
}

// ---------------------------------------------------------------------------
// Universal Trash API
// ---------------------------------------------------------------------------

export interface TrashItem {
  itemType: string;
  id: string;
  title: string;
  subtitle: string;
  icon?: string;
  deletedAt: number;
  originalCreatedAt: number;
}

export interface TrashResponse {
  items: TrashItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchUniversalTrash(params?: {
  itemType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<TrashResponse> {
  const query = new URLSearchParams();
  if (params?.itemType && params.itemType !== 'all') query.set('itemType', params.itemType);
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const result = await request<TrashResponse>(`/api/trash${qs ? '?' + qs : ''}`);
  return result;
}

export async function restoreTrashItem(itemType: string, id: string): Promise<void> {
  await request(`/api/trash/${encodeURIComponent(itemType)}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

export async function permanentDeleteTrashItem(itemType: string, id: string): Promise<void> {
  await request(`/api/trash/${encodeURIComponent(itemType)}/${encodeURIComponent(id)}/permanent`, {
    method: 'DELETE',
  });
}

export async function bulkRestoreTrash(items: { itemType: string; id: string }[]): Promise<{ restored: number }> {
  const result = await request<{ ok: boolean; restored: number }>('/api/trash/bulk-restore', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return { restored: result?.restored ?? 0 };
}

export async function bulkPermanentDeleteTrash(items: { itemType: string; id: string }[]): Promise<{ deleted: number }> {
  const result = await request<{ ok: boolean; deleted: number }>('/api/trash/bulk-permanent', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return { deleted: result?.deleted ?? 0 };
}

// ---------------------------------------------------------------------------
// Custom Data Types & Records API
// ---------------------------------------------------------------------------

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'time'
  | 'checkbox'
  | 'select'
  | 'url'
  | 'file';

export interface CustomFieldSchema {
  id: string;
  name: string;
  type: CustomFieldType;
  required?: boolean;
  defaultValue?: unknown;
  options?: string[]; // for 'select'
}

export interface CustomDataType {
  id: string;
  userId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  isShared: boolean;
  fields: CustomFieldSchema[];
  createdAt: number;
  updatedAt: number;
}

export interface CustomDataRecord {
  id: string;
  typeId: string;
  userId: string;
  title: string;
  data: Record<string, unknown>;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CustomRecordPage {
  records: CustomDataRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCustomTypes(): Promise<CustomDataType[]> {
  const result = await request<{ types: CustomDataType[] }>('/api/custom-types');
  return result?.types || [];
}

export async function createCustomType(payload: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  isShared?: boolean;
  fields: CustomFieldSchema[];
}): Promise<CustomDataType> {
  const result = await request<{ ok: boolean; type: CustomDataType }>('/api/custom-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result?.type) throw new ApiError('ไม่สามารถสร้างประเภทข้อมูลได้', 500);
  return result.type;
}

export async function updateCustomType(
  id: string,
  payload: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    category?: string;
    isShared?: boolean;
    fields?: CustomFieldSchema[];
  }
): Promise<CustomDataType> {
  const result = await request<{ ok: boolean; type: CustomDataType }>(`/api/custom-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!result?.type) throw new ApiError('ไม่สามารถแก้ไขประเภทข้อมูลได้', 500);
  return result.type;
}

export async function deleteCustomType(id: string): Promise<void> {
  await request(`/api/custom-types/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchCustomRecords(
  typeId: string,
  params?: { search?: string; page?: number; pageSize?: number }
): Promise<CustomRecordPage> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const result = await request<CustomRecordPage>(`/api/custom-types/${encodeURIComponent(typeId)}/records${qs ? '?' + qs : ''}`);
  return result;
}

export async function createCustomRecord(
  typeId: string,
  payload: { title: string; data: Record<string, unknown>; isFavorite?: boolean }
): Promise<CustomDataRecord> {
  const result = await request<{ ok: boolean; record: CustomDataRecord }>(
    `/api/custom-types/${encodeURIComponent(typeId)}/records`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  if (!result?.record) throw new ApiError('ไม่สามารถเพิ่มข้อมูลได้', 500);
  return result.record;
}

export async function updateCustomRecord(
  id: string,
  payload: { title?: string; data?: Record<string, unknown>; isFavorite?: boolean }
): Promise<CustomDataRecord> {
  const result = await request<{ ok: boolean; record: CustomDataRecord }>(
    `/api/custom-records/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  if (!result?.record) throw new ApiError('ไม่สามารถแก้ไขข้อมูลได้', 500);
  return result.record;
}

export async function deleteCustomRecord(id: string): Promise<void> {
  await request(`/api/custom-records/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Favorite Collections API
// ---------------------------------------------------------------------------

export interface FavoriteCollection {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export async function fetchFavoriteCollections(): Promise<FavoriteCollection[]> {
  const result = await request<{ collections: FavoriteCollection[] }>('/api/favorite-collections');
  return result?.collections || [];
}

export async function createFavoriteCollection(payload: {
  name: string;
  icon?: string;
  color?: string;
}): Promise<FavoriteCollection> {
  const result = await request<{ ok: boolean; collection: FavoriteCollection }>('/api/favorite-collections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result?.collection) throw new ApiError('ไม่สามารถสร้างคอลเลกชันได้', 500);
  return result.collection;
}

export async function updateFavoriteCollection(
  id: string,
  payload: { name?: string; icon?: string; color?: string }
): Promise<FavoriteCollection> {
  const result = await request<{ ok: boolean; collection: FavoriteCollection }>(
    `/api/favorite-collections/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  if (!result?.collection) throw new ApiError('ไม่สามารถแก้ไขคอลเลกชันได้', 500);
  return result.collection;
}

export async function deleteFavoriteCollection(id: string): Promise<void> {
  await request(`/api/favorite-collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setFavoriteCollection(
  itemType: string,
  itemId: string,
  collectionId: string | null
): Promise<void> {
  await request(`/api/favorites/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}/collection`, {
    method: 'PUT',
    body: JSON.stringify({ collectionId }),
  });
}

// ---------------------------------------------------------------------------
// Support Tickets API
// ---------------------------------------------------------------------------

export interface SupportTicket {
  id: string;
  referenceNo: string;
  userId: string;
  userName?: string;
  userDisplayName?: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  createdAt: number;
  updatedAt: number;
  repliesCount?: number;
}

export interface SupportTicketReply {
  id: string;
  ticketId: string;
  userId: string;
  userName?: string;
  userDisplayName?: string;
  userRole?: string;
  message: string;
  createdAt: number;
}

export async function fetchSupportTickets(status?: string): Promise<SupportTicket[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await request<{ tickets: SupportTicket[] }>(`/api/support-tickets${query}`);
  return result?.tickets || [];
}

export async function fetchSupportTicket(id: string): Promise<{
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}> {
  const result = await request<{ ticket: SupportTicket; replies: SupportTicketReply[] }>(
    `/api/support-tickets/${encodeURIComponent(id)}`
  );
  if (!result?.ticket) throw new ApiError('ไม่พบข้อมูลคำร้องขอความช่วยเหลือ', 404);
  return result;
}

export async function createSupportTicket(payload: {
  category: string;
  priority?: string;
  subject: string;
  message: string;
}): Promise<SupportTicket> {
  const result = await request<{ ok: boolean; ticket: SupportTicket }>('/api/support-tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result?.ticket) throw new ApiError('ไม่สามารถส่งคำร้องขอความช่วยเหลือได้', 500);
  return result.ticket;
}

export async function replySupportTicket(id: string, message: string): Promise<SupportTicketReply> {
  const result = await request<{ ok: boolean; reply: SupportTicketReply }>(
    `/api/support-tickets/${encodeURIComponent(id)}/replies`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );
  if (!result?.reply) throw new ApiError('ไม่สามารถส่งคำตอบกลับได้', 500);
  return result.reply;
}

export async function updateSupportTicketStatus(
  id: string,
  payload: { status: string; assignedAdminId?: string | null }
): Promise<SupportTicket> {
  const result = await request<{ ok: boolean; ticket: SupportTicket }>(
    `/api/support-tickets/${encodeURIComponent(id)}/status`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  if (!result?.ticket) throw new ApiError('ไม่สามารถเปลี่ยนสถานะคำร้องได้', 500);
  return result.ticket;
}
