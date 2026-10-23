import { describe, expect, it } from 'vitest';
import { UNSAFE_URL, isSafeUrl, sanitizeHref, withProtocol } from './safeUrl';

describe('safeUrl', () => {
  it('allows http, https, mailto and tel', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/a?b=c')).toBe(true);
    expect(isSafeUrl('mailto:me@example.com')).toBe(true);
    expect(isSafeUrl('tel:+661234567')).toBe(true);
  });

  it('allows relative anchors but not protocol-relative urls', () => {
    expect(isSafeUrl('#section')).toBe(true);
    expect(isSafeUrl('/notes/1')).toBe(true);
    expect(isSafeUrl('//evil.example')).toBe(false);
  });

  it('rejects script and data schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('falls back to a dead anchor for unsafe or empty values', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBe(UNSAFE_URL);
    expect(sanitizeHref('')).toBe(UNSAFE_URL);
    expect(sanitizeHref(null)).toBe(UNSAFE_URL);
    expect(sanitizeHref('https://example.com')).toBe('https://example.com');
  });

  it('adds https:// to bare domains', () => {
    expect(withProtocol('example.com')).toBe('https://example.com');
    expect(withProtocol('https://example.com')).toBe('https://example.com');
    expect(withProtocol('mailto:me@example.com')).toBe('mailto:me@example.com');
  });
});
