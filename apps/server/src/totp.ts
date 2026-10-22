import { createHmac, randomBytes } from 'node:crypto';

// Standard Base32 character set (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const charIndex = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (charIndex === -1) continue;

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random 16-character Base32 secret for TOTP
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(10)).slice(0, 16);
}

/**
 * Generate a 6-digit TOTP code for a secret and timestamp (RFC 6238)
 */
export function generateTotpCode(secret: string, timestampMs = Date.now(), stepSeconds = 30): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify a 6-digit TOTP code with +-1 step window for clock tolerance
 */
export function verifyTotpCode(code: string, secret: string, timestampMs = Date.now(), stepSeconds = 30): boolean {
  if (!code || !secret) return false;
  const normalizedCode = code.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  for (let window = -1; window <= 1; window++) {
    const checkTime = timestampMs + window * stepSeconds * 1000;
    const expected = generateTotpCode(secret, checkTime, stepSeconds);
    if (expected === normalizedCode) return true;
  }
  return false;
}

/**
 * Generate 6 one-time Recovery Codes: e.g. PKH-XXXX-XXXX
 */
export function generateRecoveryCodes(count = 6): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const p1 = randomBytes(2).toString('hex').toUpperCase();
    const p2 = randomBytes(2).toString('hex').toUpperCase();
    codes.push(`PKH-${p1}-${p2}`);
  }
  return codes;
}
