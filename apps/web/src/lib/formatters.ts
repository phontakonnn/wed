import type {
  Task,
  ReminderCategory,
  LifeArea,
  VaultCategory,
  LibraryCategory,
  LibraryStatus,
} from '../api';

export function fileIcon(mediaType: string, name: string): string {
  if (mediaType.startsWith('image/')) return 'IMG';
  if (mediaType === 'application/pdf') return 'PDF';
  if (mediaType.startsWith('video/')) return 'VID';
  if (mediaType.startsWith('audio/')) return 'AUD';
  if (mediaType.startsWith('text/')) return 'TXT';
  const extension = name.split('.').pop()?.toUpperCase() ?? '';
  return extension.length > 0 && extension.length <= 4 ? extension : 'FILE';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

export function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function daysUntilNext(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [, month, day] = iso.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export function taskPriorityLabel(priority: Task['priority']): string {
  return priority === 'urgent' ? 'ด่วนมาก'
    : priority === 'high' ? 'สำคัญ'
      : priority === 'low' ? 'ไม่เร่ง' : 'ปกติ';
}

export function taskStatusLabel(status: Task['status']): string {
  return status === 'doing' ? 'กำลังทำ'
    : status === 'waiting' ? 'รออยู่'
      : status === 'done' ? 'เสร็จแล้ว'
        : status === 'cancelled' ? 'ยกเลิก' : 'ต้องทำ';
}

export function reminderCategoryLabel(category: ReminderCategory): string {
  return category === 'birthday' ? 'วันเกิด'
    : category === 'anniversary' ? 'วันครบรอบ'
      : category === 'health' ? 'สุขภาพ'
        : category === 'backup' ? 'แผนสำรอง'
          : 'อื่น ๆ';
}

export function lifeAreaLabel(area: LifeArea): string {
  return area === 'health' ? 'สุขภาพ'
    : area === 'focus_work' ? 'งานโฟกัส'
      : area === 'family' ? 'ครอบครัว/แฟน'
        : area === 'growth' ? 'พัฒนาตัวเอง'
          : 'อื่น ๆ';
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(timestamp));
}

/** Category tint used by badges, so each kind of record is recognisable at a glance. */
export function vaultTone(category: VaultCategory): string {
  if (category === 'ทรัพย์สิน & บ้าน') return 'asset';
  if (category === 'รอบบิลรายเดือน') return 'bill';
  return 'paper';
}

export function libraryTone(category: LibraryCategory): string {
  if (category === 'หนังสือ & คอร์สเรียน') return 'book';
  if (category === 'โพยคำสั่ง & สูตร') return 'cheat';
  return 'sop';
}

export function libraryStatusTone(status: LibraryStatus): string {
  if (status === 'กำลังศึกษา') return 'studying';
  if (status === 'สรุปจบแล้ว') return 'done';
  return 'active';
}

/** Whole days from today to an ISO date; negative means already past. */
export function daysUntilIso(iso: string | null): number | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}
