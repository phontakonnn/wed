import type {
  SearchBucketType,
  VaultCategory,
  LibraryCategory,
  LibraryStatus,
} from '../api';
import type { VaultDraft, LibraryDraft } from '../types';

export const ALL_SEARCH_TYPES: SearchBucketType[] = [
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

export const SEARCH_TYPE_LABELS: Array<{ type: SearchBucketType; label: string }> = [
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

export const VAULT_CATEGORIES: VaultCategory[] = ['เอกสาร & ประกัน', 'ทรัพย์สิน & บ้าน', 'รอบบิลรายเดือน'];
export const LIBRARY_CATEGORIES: LibraryCategory[] = ['คู่มือชีวิต & SOP', 'หนังสือ & คอร์สเรียน', 'โพยคำสั่ง & สูตร'];
export const LIBRARY_STATUSES: LibraryStatus[] = ['ใช้งานประจำ', 'กำลังศึกษา', 'สรุปจบแล้ว'];

export const emptyVaultDraft: VaultDraft = {
  title: '',
  category: VAULT_CATEGORIES[0],
  keyValue: '',
  physicalLocation: '',
  renewalOrExpiryDate: '',
  amountText: '',
  notes: '',
};

export const emptyLibraryDraft: LibraryDraft = {
  title: '',
  category: LIBRARY_CATEGORIES[0],
  status: LIBRARY_STATUSES[0],
  sourceUrlOrAuthor: '',
  keyTakeaways: '',
  content: '',
};
