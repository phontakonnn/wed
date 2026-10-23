/**
 * One place that decides whether a URL taken from user data may end up in an
 * `href`. React escapes text, but it does not sanitise URLs: a bookmark saved
 * as `javascript:alert(1)` would still run on click. Everything user-supplied
 * must pass through here.
 */

const ALLOWED_SCHEMES = /^(https?:|mailto:|tel:)/i;
const SAFE_RELATIVE = /^(#|\/(?!\/))/;

export const UNSAFE_URL = '#unsafe-link';

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Relative anchors and app-absolute paths are fine; `//host` is not, because
  // it silently becomes protocol-relative to an external origin.
  if (SAFE_RELATIVE.test(trimmed)) return true;
  if (ALLOWED_SCHEMES.test(trimmed)) return true;
  return false;
}

/** Returns the URL when it is safe to put in an href, otherwise a dead anchor. */
export function sanitizeHref(url: string | null | undefined): string {
  if (!url) return UNSAFE_URL;
  return isSafeUrl(url) ? url.trim() : UNSAFE_URL;
}

/** Adds https:// to a bare domain so bookmarks open instead of resolving relative. */
export function withProtocol(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || SAFE_RELATIVE.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
