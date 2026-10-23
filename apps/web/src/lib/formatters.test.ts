import { describe, expect, it } from 'vitest';
import { daysUntilIso, errorMessage, fileIcon, formatBytes, localToday } from './formatters';

describe('formatters', () => {
  it('formats byte sizes with binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GiB');
  });

  it('derives a short icon label from media type and extension', () => {
    expect(fileIcon('image/png', 'a.png')).toBe('IMG');
    expect(fileIcon('application/pdf', 'a.pdf')).toBe('PDF');
    expect(fileIcon('application/octet-stream', 'archive.zip')).toBe('ZIP');
    expect(fileIcon('application/octet-stream', 'no-extension')).toBe('FILE');
  });

  it('returns a readable Thai fallback for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  });

  it('computes ISO day offsets', () => {
    const today = localToday();
    expect(daysUntilIso(today)).toBe(0);
    expect(daysUntilIso(null)).toBeNull();
    expect(daysUntilIso('not-a-date')).toBeNull();
  });
});
