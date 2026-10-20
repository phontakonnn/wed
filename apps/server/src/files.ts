/**
 * File storage primitives.
 *
 * Storage layout (see docs/ARCHITECTURE.md and docs/SCHEMA.md):
 * - Upload bytes stream to `DATA_DIR/tmp/<uuid>.part` and are hashed while they arrive.
 * - A completed upload is fsynced and atomically renamed to
 *   `DATA_DIR/objects/<first two id characters>/<uuid>`.
 * - The database row is written only after the object is in place.
 *
 * The client filename is metadata only. It is never used to build a filesystem path.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, fsyncSync, mkdirSync, openSync, closeSync, renameSync, rmSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';

export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
export const MAX_CONCURRENT_UPLOADS = 2;

const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const WINDOWS_INVALID_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/u;

export class FileStorageError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'FileStorageError';
    this.statusCode = statusCode;
  }
}

export function maxUploadBytes(): number {
  const configured = process.env.MAX_UPLOAD_BYTES;
  if (!configured) return DEFAULT_MAX_UPLOAD_BYTES;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('MAX_UPLOAD_BYTES must be a positive integer');
  }
  return value;
}

/**
 * Validate a client-supplied display name.
 *
 * Returns the NFC-normalized name, or null when the name is unusable. The caller must reject
 * rather than repair an invalid name: silently stripping separators turns an attack into a
 * different, unexpected filename.
 */
export function normalizeDisplayName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0) return null;
  if (WINDOWS_INVALID_CHARACTERS.test(raw)) return null;

  const name = raw.normalize('NFC');
  if (name.length === 0 || name === '.' || name === '..') return null;
  if (name.endsWith('.') || name.endsWith(' ')) return null;
  // UTF-16 code units, matching the Windows component limit.
  if (name.length > 255) return null;

  const base = name.split('.')[0];
  if (WINDOWS_RESERVED_BASENAME.test(base)) return null;
  return name;
}

export function decodeFileNameHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return normalizeDisplayName(decoded);
}

const INLINE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
]);

/**
 * Server-side media detection from magic bytes.
 *
 * The client-declared Content-Type is never authoritative. Anything that is not positively
 * identified stays `application/octet-stream` and is served as an attachment.
 */
export function detectMediaType(head: Buffer): string {
  const startsWith = (bytes: number[], offset = 0): boolean =>
    head.length >= offset + bytes.length && bytes.every((byte, index) => head[offset + index] === byte);
  const ascii = (text: string, offset = 0): boolean =>
    head.length >= offset + text.length && head.subarray(offset, offset + text.length).toString('latin1') === text;

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii('GIF87a') || ascii('GIF89a')) return 'image/gif';
  if (ascii('RIFF') && ascii('WEBP', 8)) return 'image/webp';
  if (ascii('RIFF') && ascii('WAVE', 8)) return 'audio/wav';
  if (ascii('OggS')) return 'audio/ogg';
  if (ascii('ID3')) return 'audio/mpeg';
  if (startsWith([0xff, 0xfb]) || startsWith([0xff, 0xf3]) || startsWith([0xff, 0xf2])) return 'audio/mpeg';
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii('%PDF-')) return 'application/pdf';
  if (ascii('ftyp', 4)) {
    const brand = head.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'dash', 'avc1'].includes(brand)) return 'video/mp4';
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

export function isInlineMediaType(mediaType: string): boolean {
  return INLINE_MEDIA_TYPES.has(mediaType);
}

export function objectPath(dataDirectory: string, objectKey: string): string {
  return join(dataDirectory, 'objects', objectKey.slice(0, 2), objectKey);
}

export function objectsRoot(dataDirectory: string): string {
  return join(dataDirectory, 'objects');
}

/**
 * Refuse an upload that would leave the volume below the reserve.
 *
 * The reserve is `max(MAX_UPLOAD_BYTES, 5% of the volume)`, scaled down from the 10 GiB design
 * default because the MVP limit is 1 GiB per file.
 */
export function assertFreeSpace(dataDirectory: string, declaredSize: number): void {
  const stats = statfsSync(dataDirectory);
  const total = Number(stats.blocks) * Number(stats.bsize);
  const available = Number(stats.bavail) * Number(stats.bsize);
  const reserve = Math.max(maxUploadBytes(), Math.ceil(total * 0.05));
  if (available - declaredSize < reserve) {
    throw new FileStorageError('พื้นที่ดิสก์ไม่เพียงพอสำหรับการอัปโหลด', 507);
  }
}

export interface StoredUpload {
  sizeBytes: number;
  sha256: string;
  mediaType: string;
}

export interface StoreUploadOptions {
  dataDirectory: string;
  objectKey: string;
  declaredSize: number;
  stream: AsyncIterable<Buffer>;
  maxBytes?: number;
}

/**
 * Stream an upload to a temporary file, hash it, then publish it as an object.
 *
 * The temporary file is removed on every failure path, so a partial upload never becomes visible
 * as an object.
 */
export async function storeUpload(options: StoreUploadOptions): Promise<StoredUpload> {
  const { dataDirectory, objectKey, declaredSize } = options;
  const limit = options.maxBytes ?? maxUploadBytes();
  if (declaredSize > limit) {
    throw new FileStorageError('ไฟล์มีขนาดใหญ่เกินกำหนด', 413);
  }

  const temporaryDirectory = join(dataDirectory, 'tmp');
  mkdirSync(temporaryDirectory, { recursive: true });
  const temporaryPath = join(temporaryDirectory, `${objectKey}.part`);

  const hash = createHash('sha256');
  const headChunks: Buffer[] = [];
  let headLength = 0;
  let size = 0;

  const output = createWriteStream(temporaryPath, { flags: 'wx' });
  try {
    for await (const chunk of options.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > limit) {
        throw new FileStorageError('ไฟล์มีขนาดใหญ่เกินกำหนด', 413);
      }
      if (headLength < 32) {
        headChunks.push(buffer.subarray(0, 32 - headLength));
        headLength += Math.min(buffer.length, 32 - headLength);
      }
      hash.update(buffer);
      if (!output.write(buffer)) await once(output, 'drain');
    }
    await new Promise<void>((resolve, reject) => {
      output.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    output.destroy();
    rmSync(temporaryPath, { force: true });
    if (error instanceof FileStorageError) throw error;
    throw new FileStorageError('การอัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง', 400);
  }

  if (size === 0) {
    rmSync(temporaryPath, { force: true });
    throw new FileStorageError('ไฟล์ว่างเปล่าไม่สามารถอัปโหลดได้', 400);
  }
  if (size !== declaredSize) {
    rmSync(temporaryPath, { force: true });
    throw new FileStorageError('ขนาดไฟล์ไม่ตรงกับที่แจ้งไว้', 400);
  }

  const mediaType = detectMediaType(Buffer.concat(headChunks));
  const sha256 = hash.digest('hex');
  const destination = objectPath(dataDirectory, objectKey);

  try {
    const descriptor = openSync(temporaryPath, 'r+');
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    mkdirSync(join(dataDirectory, 'objects', objectKey.slice(0, 2)), { recursive: true });
    renameSync(temporaryPath, destination);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw new FileStorageError('ไม่สามารถบันทึกไฟล์ลงพื้นที่จัดเก็บได้', 500);
  }

  return { sizeBytes: size, sha256, mediaType };
}

export function deleteObject(dataDirectory: string, objectKey: string): boolean {
  const path = objectPath(dataDirectory, objectKey);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

export function objectExists(dataDirectory: string, objectKey: string): boolean {
  return existsSync(objectPath(dataDirectory, objectKey));
}

export function objectSize(dataDirectory: string, objectKey: string): number {
  return statSync(objectPath(dataDirectory, objectKey)).size;
}

export function readObject(
  dataDirectory: string,
  objectKey: string,
  range?: { start: number; end: number },
): NodeJS.ReadableStream {
  return createReadStream(objectPath(dataDirectory, objectKey), range);
}

export type RangeResult = { start: number; end: number } | 'invalid' | 'unsatisfiable';

/**
 * Parse a single byte range. Multiple ranges are rejected consistently with 416, matching the
 * documented policy; they are never silently collapsed into the first range.
 */
export function parseRange(header: string | undefined, size: number): RangeResult | null {
  if (header === undefined) return null;
  const value = header.trim();
  if (!value.startsWith('bytes=')) return 'invalid';
  const specification = value.slice('bytes='.length);
  if (specification.includes(',')) return 'invalid';

  const match = /^(\d*)-(\d*)$/.exec(specification);
  if (!match) return 'invalid';
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return 'invalid';

  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'unsatisfiable';
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start)) return 'invalid';
  if (start >= size) return 'unsatisfiable';

  if (rawEnd === '') return { start, end: size - 1 };
  const end = Number(rawEnd);
  if (!Number.isSafeInteger(end)) return 'invalid';
  if (end < start) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

/** RFC 5987 / RFC 6266 disposition with an ASCII fallback for legacy clients. */
export function contentDisposition(displayName: string, inline: boolean): string {
  const fallback = displayName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(displayName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
