import { describe, expect, it } from 'vitest';
import {
  clampProfileText,
  MAX_AVATAR_CHARS,
  MAX_DISPLAY_NAME,
  validateAvatarDataUrl,
} from './profileValidation';

describe('validateAvatarDataUrl', () => {
  it('accepts the image data URLs the profile screen produces', () => {
    expect(validateAvatarDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(validateAvatarDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBeNull();
    expect(validateAvatarDataUrl('data:image/webp;base64,UklGRg==')).toBeNull();
    expect(validateAvatarDataUrl('data:image/gif;base64,R0lGODlh')).toBeNull();
  });

  it('allows clearing the avatar', () => {
    expect(validateAvatarDataUrl('')).toBeNull();
  });

  it('rejects anything that is not an image data URL', () => {
    // A remote URL or an SVG would either leak a request or execute script.
    expect(validateAvatarDataUrl('https://example.com/me.png')).not.toBeNull();
    expect(validateAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).not.toBeNull();
    expect(validateAvatarDataUrl('data:text/html;base64,PHNjcmlwdD4=')).not.toBeNull();
    expect(validateAvatarDataUrl('javascript:alert(1)')).not.toBeNull();
  });

  it('rejects an avatar that would push the document near the 1 MiB limit', () => {
    const huge = `data:image/png;base64,${'A'.repeat(MAX_AVATAR_CHARS)}`;
    expect(validateAvatarDataUrl(huge)).toContain('ใหญ่เกินไป');
  });
});

describe('clampProfileText', () => {
  it('trims whitespace and caps length', () => {
    expect(clampProfileText('  สมชาย  ', MAX_DISPLAY_NAME)).toBe('สมชาย');
    expect(clampProfileText('x'.repeat(200), MAX_DISPLAY_NAME)).toHaveLength(MAX_DISPLAY_NAME);
  });

  it('returns null for non-strings so callers can skip the field entirely', () => {
    expect(clampProfileText(undefined, 10)).toBeNull();
    expect(clampProfileText(42, 10)).toBeNull();
  });
});
