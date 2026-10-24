/**
 * Validation for the fields the profile screen writes to `users/{uid}`.
 *
 * Kept separate from the Firebase engine so the rules can be unit-tested
 * without mocking Firestore or Auth.
 */

/** A Firestore document caps at 1 MiB; keep the avatar well below that. */
export const MAX_AVATAR_CHARS = 500_000;

export const MAX_DISPLAY_NAME = 80;
export const MAX_BIO = 500;
export const MAX_DAILY_STATUS = 160;
export const MAX_EMAIL = 200;
export const MAX_PHONE = 40;

const AVATAR_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * Returns a Thai error message when the avatar is unacceptable, or `null` when
 * it is fine. An empty string means "remove the avatar" and is always allowed.
 */
export function validateAvatarDataUrl(value: string): string | null {
  if (!value) return null;
  if (!AVATAR_DATA_URL.test(value)) return 'รูปโปรไฟล์ต้องเป็นไฟล์ภาพ (png, jpg, webp หรือ gif)';
  if (value.length > MAX_AVATAR_CHARS) return 'รูปโปรไฟล์ใหญ่เกินไป (ต้องไม่เกิน ~350 KB)';
  return null;
}

/** Trims and caps a free-text profile field. `null`/`undefined` pass through. */
export function clampProfileText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, max);
}
