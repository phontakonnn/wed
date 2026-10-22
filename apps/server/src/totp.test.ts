import { describe, expect, it } from 'vitest';
import { generateTotpSecret, generateTotpCode, verifyTotpCode, generateRecoveryCodes } from './totp.js';

describe('TOTP Two-Factor Authentication', () => {
  it('generates a valid 16-character base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(16);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates a 6-digit code and verifies successfully', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);
    expect(code).toHaveLength(6);
    expect(verifyTotpCode(code, secret, now)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode('000000', secret)).toBe(false);
  });

  it('generates 6 recovery codes in PKH-XXXX-XXXX format', () => {
    const codes = generateRecoveryCodes(6);
    expect(codes).toHaveLength(6);
    for (const code of codes) {
      expect(/^PKH-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code)).toBe(true);
    }
  });
});
