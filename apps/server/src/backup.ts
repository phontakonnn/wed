/**
 * Backup and restore for the SQLite database.
 *
 * Design constraints (see docs/BACKUP.md):
 * - The database runs in WAL mode, so committed data may live only in the `-wal` file.
 *   Backups therefore use SQLite's Online Backup API (`database.backup()`), never a file copy.
 * - Every backup is checksummed and described by a sidecar manifest, so silent corruption is
 *   detectable before a restore overwrites anything.
 * - Restore is destructive and offline. It refuses to run when the database still looks open,
 *   keeps an automatic pre-restore safety copy, and verifies the result.
 *
 * This module deliberately does not import or touch authentication, session, or CSRF code.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  appendFileSync,
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import type { SqliteDatabase } from './database.js';

type SqliteHandle = InstanceType<typeof Database>;

export const BACKUP_FORMAT_VERSION = 1;
export const DEFAULT_RETENTION = 7;
export const DEFAULT_DATABASE_FILENAME = 'knowledge.sqlite3';

const ENCRYPTION_MAGIC = Buffer.from('PKHBAK01');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_TAG_BYTES = 16;
const ENCRYPTION_HEADER_BYTES = ENCRYPTION_MAGIC.length + ENCRYPTION_IV_BYTES;
const BACKUP_NAME_PATTERN = /^knowledge-\d{8}T\d{9}Z-[0-9a-f]{8}\.sqlite3$/;
const MANIFEST_SUFFIX = '.manifest.json';
const PARTIAL_SUFFIX = '.partial';
const BASE_REQUIRED_TABLES = ['users', 'sessions', 'schema_migrations'] as const;

function requiredTablesForSchema(schemaVersions: number[]): string[] {
  const required: string[] = [...BASE_REQUIRED_TABLES];
  if (schemaVersions.includes(2)) required.push('notes', 'notes_fts');
  if (schemaVersions.includes(3)) required.push('notes_fts_trigram');
  if (schemaVersions.includes(4)) required.push('bookmarks');
  if (schemaVersions.includes(5)) {
    required.push('categories', 'tags', 'note_categories', 'note_tags');
  }
  if (schemaVersions.includes(6)) required.push('favorites');
  if (schemaVersions.includes(7)) required.push('files');
  if (schemaVersions.includes(8)) {
    required.push('people', 'note_people', 'reminders', 'life_timeblocks', 'habits');
  }
  if (schemaVersions.includes(9)) {
    required.push('goals', 'projects', 'tasks', 'task_checklist_items', 'inbox_items');
  }
  if (schemaVersions.includes(10)) {
    required.push('habit_logs');
  }
  if (schemaVersions.includes(11)) {
    required.push('entity_files');
  }
  if (schemaVersions.includes(12)) {
    required.push('vault_items', 'library_items');
  }
  if (schemaVersions.includes(14)) {
    required.push('note_versions');
  }
  return required;
}

export interface ObjectsFileEntry {
  /** Logical path inside the live object store, POSIX separators. Never an absolute path. */
  path: string;
  /** Plaintext size and hash; these are what a restore must reproduce. */
  sizeBytes: number;
  sha256: string;
  /** Path inside the snapshot directory (adds `.enc` when the snapshot is encrypted). */
  storedPath: string;
  storedSizeBytes: number;
  storedSha256: string;
}

export interface ObjectsManifest {
  /** Basename of the snapshot directory that sits next to the backup file. */
  directory: string;
  /**
   * 1 (implicit for older manifests) = plaintext tree with no inventory.
   * 2 = explicit inventory; `encryption` present means every stored file is encrypted.
   */
  formatVersion?: number;
  fileCount: number;
  totalBytes: number;
  treeSha256: string;
  encryption?: {
    algorithm: typeof ENCRYPTION_ALGORITHM;
    formatVersion: 1;
    /** Identifier of the key used, when the operator configured one. Never the key itself. */
    keyId?: string;
  };
  files?: ObjectsFileEntry[];
}

interface ObjectsSummary {
  fileCount: number;
  totalBytes: number;
  treeSha256: string;
}

const OBJECTS_SUFFIX = '.objects';
const OBJECTS_PARTIAL_SUFFIX = '.objects.partial';
const OBJECTS_FORMAT_INVENTORY = 2;
const OBJECTS_ENCRYPTED_SUFFIX = '.enc';

/** Relative POSIX-style paths of every file under `root`, sorted for a stable tree hash. */
function listTreeFiles(root: string, prefix = ''): string[] {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listTreeFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function hashTree(root: string): Promise<ObjectsSummary> {
  const hash = createHash('sha256');
  let fileCount = 0;
  let totalBytes = 0;
  for (const relative of listTreeFiles(root)) {
    const path = join(root, relative);
    const size = statSync(path).size;
    const digest = await sha256File(path);
    fileCount += 1;
    totalBytes += size;
    hash.update(`${relative}\n${size}\n${digest}\n`);
  }
  return { fileCount, totalBytes, treeSha256: hash.digest('hex') };
}

function copyTree(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const relative of listTreeFiles(source)) {
    const target = join(destination, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, relative), target);
  }
}

function removeTree(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** Return `base` or the first `base-N` that does not exist; never deletes an existing path. */
function uniquePath(base: string): string {
  if (!existsSync(base)) return base;
  let attempt = 1;
  let candidate = `${base}-${attempt}`;
  while (existsSync(candidate)) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes('\\') || value.startsWith('/') || isAbsolute(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function inventoryTreeHash(entries: ObjectsFileEntry[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => left.storedPath.localeCompare(right.storedPath))) {
    hash.update(`${entry.storedPath}\n${entry.storedSizeBytes}\n${entry.storedSha256}\n`);
  }
  return hash.digest('hex');
}

/**
 * Build the snapshot from the live object store.
 *
 * Encryption is applied while streaming source → cipher → destination, so no plaintext copy of an
 * object is ever written to a temporary location. Each object gets a fresh random IV; the GCM tag
 * is appended to that file, exactly like the database backup envelope.
 */
async function snapshotObjects(
  sourceDirectory: string,
  destinationDirectory: string,
  key: Buffer | null,
  keyId: string | null = null,
): Promise<ObjectsManifest | null> {
  const files = listTreeFiles(sourceDirectory);
  if (files.length === 0) return null;

  mkdirSync(destinationDirectory, { recursive: true });
  const entries: ObjectsFileEntry[] = [];

  for (const relative of files) {
    const source = join(sourceDirectory, relative);
    const storedPath = key ? `${relative}${OBJECTS_ENCRYPTED_SUFFIX}` : relative;
    const destination = join(destinationDirectory, storedPath);
    mkdirSync(dirname(destination), { recursive: true });

    if (key) await encryptFile(source, destination, key);
    else copyFileSync(source, destination);

    entries.push({
      path: relative,
      sizeBytes: statSync(source).size,
      sha256: await sha256File(source),
      storedPath,
      storedSizeBytes: statSync(destination).size,
      storedSha256: await sha256File(destination),
    });
  }

  return {
    directory: basename(destinationDirectory),
    formatVersion: OBJECTS_FORMAT_INVENTORY,
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.sizeBytes, 0),
    treeSha256: inventoryTreeHash(entries),
    ...(key
      ? {
        encryption: {
          algorithm: ENCRYPTION_ALGORITHM,
          formatVersion: 1 as const,
          ...(keyId ? { keyId } : {}),
        },
      }
      : {}),
    files: entries,
  };
}

/**
 * Verify a snapshot against its manifest.
 *
 * A count/size match is not treated as proof: every stored file is hashed, and every encrypted
 * file is decrypted (to a hash sink, not to disk) to confirm the plaintext hash recorded at
 * backup time. Extra files are reported, so nothing can be added to a backup unnoticed.
 */
async function verifyObjectSnapshot(
  manifest: ObjectsManifest,
  backupPath: string,
  key: Buffer | null,
): Promise<string[]> {
  const problems: string[] = [];
  const directory = manifest.directory;
  if (!directory || basename(directory) !== directory) {
    return ['Object snapshot path is not a plain directory name'];
  }
  const root = join(dirname(backupPath), directory);
  if (!existsSync(root)) return ['Object snapshot directory is missing'];

  const entries = manifest.files;
  if (!entries || manifest.formatVersion !== OBJECTS_FORMAT_INVENTORY) {
    // Legacy plaintext snapshot written before per-file inventory existed.
    const summary = await hashTree(root);
    if (summary.fileCount !== manifest.fileCount) {
      problems.push(`Object count mismatch: manifest ${manifest.fileCount}, snapshot ${summary.fileCount}`);
    }
    if (summary.totalBytes !== manifest.totalBytes) {
      problems.push(
        `Object size mismatch: manifest ${manifest.totalBytes} bytes, snapshot ${summary.totalBytes} bytes`,
      );
    }
    if (summary.treeSha256 !== manifest.treeSha256) {
      problems.push('Object snapshot content does not match the manifest');
    }
    return problems;
  }

  if (manifest.encryption) {
    if (manifest.encryption.algorithm !== ENCRYPTION_ALGORITHM ||
      manifest.encryption.formatVersion !== 1) {
      problems.push('Unsupported object snapshot encryption format');
    }
    if (!key) {
      problems.push('The object snapshot is encrypted; configure BACKUP_ENCRYPTION_KEY to verify it');
    }
  }

  const actualFiles = new Set(listTreeFiles(root));
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path) || !isSafeRelativePath(entry.storedPath)) {
      problems.push(`Object inventory contains an unsafe path: ${entry.path}`);
      continue;
    }
    const expectedStoredPath = manifest.encryption
      ? `${entry.path}${OBJECTS_ENCRYPTED_SUFFIX}`
      : entry.path;
    if (entry.storedPath !== expectedStoredPath) {
      problems.push(`Object inventory stored path does not match its logical path: ${entry.path}`);
    }
    if (seen.has(entry.storedPath)) {
      problems.push(`Object inventory contains a duplicate entry: ${entry.path}`);
      continue;
    }
    seen.add(entry.storedPath);
    totalBytes += entry.sizeBytes;

    const storedPath = join(root, entry.storedPath);
    if (!existsSync(storedPath)) {
      problems.push(`Object is missing from the snapshot: ${entry.path}`);
      continue;
    }
    if (statSync(storedPath).size !== entry.storedSizeBytes) {
      problems.push(`Stored object size mismatch: ${entry.path}`);
      continue;
    }
    if (await sha256File(storedPath) !== entry.storedSha256) {
      problems.push(`Stored object checksum mismatch: ${entry.path}`);
      continue;
    }

    if (manifest.encryption) {
      if (!key) continue;
      try {
        const decrypted = await decryptToHash(storedPath, key);
        if (decrypted.sizeBytes !== entry.sizeBytes || decrypted.sha256 !== entry.sha256) {
          problems.push(`Decrypted object does not match the manifest: ${entry.path}`);
        }
      } catch (error) {
        problems.push(
          `Cannot decrypt object ${entry.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (entry.storedSha256 !== entry.sha256 || entry.storedSizeBytes !== entry.sizeBytes) {
      problems.push(`Plaintext object inventory is inconsistent: ${entry.path}`);
    }
  }

  for (const stored of actualFiles) {
    if (!seen.has(stored)) problems.push(`Object snapshot contains an unexpected file: ${stored}`);
  }

  if (manifest.fileCount !== entries.length) {
    problems.push(`Object count mismatch: manifest ${manifest.fileCount}, inventory ${entries.length}`);
  }
  if (manifest.totalBytes !== totalBytes) {
    problems.push(
      `Object size mismatch: manifest ${manifest.totalBytes} bytes, inventory ${totalBytes} bytes`,
    );
  }
  if (inventoryTreeHash(entries) !== manifest.treeSha256) {
    problems.push('Object snapshot content does not match the manifest');
  }

  return problems;
}

/** Write the snapshot into a staging directory, verifying every object as it lands. */
async function materializeObjectSnapshot(
  manifest: ObjectsManifest,
  sourceRoot: string,
  destinationRoot: string,
  key: Buffer | null,
): Promise<number> {
  const entries = manifest.files;
  if (!entries || manifest.formatVersion !== OBJECTS_FORMAT_INVENTORY) {
    copyTree(sourceRoot, destinationRoot);
    return manifest.fileCount;
  }
  if (manifest.encryption && !key) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required to restore this backup');
  }

  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path) || !isSafeRelativePath(entry.storedPath)) {
      throw new Error('Object inventory contains an unsafe path');
    }
    const destination = join(destinationRoot, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    const source = join(sourceRoot, entry.storedPath);

    if (manifest.encryption && key) {
      await decryptFileVerified(source, destination, key, entry);
    } else {
      copyFileSync(source, destination);
      if (statSync(destination).size !== entry.sizeBytes ||
        await sha256File(destination) !== entry.sha256) {
        removeIfPresent(destination);
        throw new Error(`Restored object does not match the manifest: ${entry.path}`);
      }
    }
  }
  return entries.length;
}

export interface BackupManifest {
  formatVersion: number;
  createdAt: string;
  createdAtMs: number;
  file: string;
  sizeBytes: number;
  sha256: string;
  schemaVersions: number[];
  sqliteVersion: string;
  integrityCheck: string;
  foreignKeyViolations: number;
  encryption?: {
    algorithm: typeof ENCRYPTION_ALGORITHM;
    formatVersion: 1;
    /** Identifier of the key used, when the operator configured one. Never the key itself. */
    keyId?: string;
  };
  /** Present only when the backup captured `DATA_DIR/objects`. */
  objects?: ObjectsManifest;
}

export interface BackupResult {
  path: string;
  manifestPath: string;
  manifest: BackupManifest;
  objectsPath: string | null;
  pruned: string[];
}

export interface BackupEntry {
  path: string;
  file: string;
  sizeBytes: number;
  createdAtMs: number | null;
  hasManifest: boolean;
  objectFiles: number | null;
}

export interface VerifyOptions {
  /** When false, the manifest is not required (used for pre-restore safety copies). */
  requireManifest?: boolean;
  encryptionKey?: string;
}

export interface VerifyResult {
  ok: boolean;
  path: string;
  problems: string[];
  /** Non-fatal findings, e.g. orphan objects that have no metadata row. */
  warnings: string[];
  manifest: BackupManifest | null;
}

export interface CreateBackupOptions {
  database: SqliteDatabase;
  backupDirectory: string;
  /**
   * When set, `DATA_DIR/objects` is copied next to the database backup so a restore can return
   * file metadata and file bytes together.
   */
  dataDirectory?: string;
  keep?: number;
  prune?: boolean;
  now?: Date;
  encryptionKey?: string;
}

export interface RestoreOptions {
  backupPath: string;
  dataDirectory: string;
  now?: Date;
  /**
   * Skip the `-shm` in-use check. Only for an operator who has positively confirmed that the
   * server process is stopped (for example after a crash left a stale shm file behind).
   */
  force?: boolean;
  encryptionKey?: string;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface BackupKeyRing {
  activeKey: Buffer | null;
  activeKeyId: string | null;
  /** Additional decryption keys, keyed by id. Never contains anything but 32-byte keys. */
  keys: Map<string, Buffer>;
}

function parseKeyMaterial(value: string, name: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error(`${name} must be a canonical base64-encoded 32-byte key`);
  }
  return key;
}

function parseKeyId(value: string, name: string): string {
  if (!KEY_ID_PATTERN.test(value)) {
    throw new Error(`${name} must match [A-Za-z0-9._-]{1,64}`);
  }
  return value;
}

/**
 * Resolve the active key plus an optional ring of older keys.
 *
 * - `BACKUP_ENCRYPTION_KEY` + optional `BACKUP_ENCRYPTION_KEY_ID` is the key used for new backups.
 * - `BACKUP_ENCRYPTION_KEY_RING` is an optional JSON object `{ "<id>": "<base64 key>" }` used only
 *   to decrypt older backups whose manifest names a different key id. It never becomes the active
 *   key and never causes a re-encryption.
 * - `BACKUP_ENCRYPTION_REQUIRED=true` fails closed when no active key is configured.
 *
 * No key material is ever returned in error messages or written to a manifest.
 */
export function resolveKeyRing(activeKeyOverride?: string, env = process.env): BackupKeyRing {
  const requiredSetting = env.BACKUP_ENCRYPTION_REQUIRED;
  if (requiredSetting !== undefined && requiredSetting !== '' &&
    requiredSetting !== 'true' && requiredSetting !== 'false') {
    throw new Error('BACKUP_ENCRYPTION_REQUIRED must be true or false');
  }

  let activeKey: Buffer | null = null;
  let activeKeyId: string | null = null;
  const rawActive = activeKeyOverride ?? env.BACKUP_ENCRYPTION_KEY;
  if (rawActive) {
    activeKey = parseKeyMaterial(rawActive, 'BACKUP_ENCRYPTION_KEY');
    if (env.BACKUP_ENCRYPTION_KEY_ID) {
      activeKeyId = parseKeyId(env.BACKUP_ENCRYPTION_KEY_ID, 'BACKUP_ENCRYPTION_KEY_ID');
    }
  } else if (env.BACKUP_ENCRYPTION_KEY_ID) {
    throw new Error('BACKUP_ENCRYPTION_KEY_ID requires BACKUP_ENCRYPTION_KEY');
  }

  const keys = new Map<string, Buffer>();
  const rawRing = env.BACKUP_ENCRYPTION_KEY_RING;
  if (rawRing) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawRing);
    } catch {
      throw new Error('BACKUP_ENCRYPTION_KEY_RING must be a JSON object of key id to base64 key');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('BACKUP_ENCRYPTION_KEY_RING must be a JSON object of key id to base64 key');
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error(`BACKUP_ENCRYPTION_KEY_RING entry ${id} must be a base64 string`);
      }
      keys.set(parseKeyId(id, 'BACKUP_ENCRYPTION_KEY_RING key id'), parseKeyMaterial(value, `BACKUP_ENCRYPTION_KEY_RING entry ${id}`));
    }
  }

  if (activeKey && activeKeyId) {
    const existing = keys.get(activeKeyId);
    if (existing && !existing.equals(activeKey)) {
      throw new Error('The key ring entry for the active key id does not match BACKUP_ENCRYPTION_KEY');
    }
    keys.set(activeKeyId, activeKey);
  }

  if (!activeKey && requiredSetting === 'true') {
    throw new Error('BACKUP_ENCRYPTION_KEY is required when BACKUP_ENCRYPTION_REQUIRED=true');
  }

  return { activeKey, activeKeyId, keys };
}

/**
 * Pick the key that can decrypt a manifest. A manifest with a key id must have that id in the ring
 * (or as the active key); we never silently try unrelated keys.
 */
export function selectBackupKey(ring: BackupKeyRing, keyId: string | undefined): Buffer | null {
  if (keyId) return ring.keys.get(keyId) ?? null;
  return ring.activeKey;
}

async function encryptFile(sourcePath: string, destinationPath: string, key: Buffer): Promise<void> {
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const output = createWriteStream(destinationPath, { flags: 'wx' });
  output.write(Buffer.concat([ENCRYPTION_MAGIC, iv]));
  await pipeline(createReadStream(sourcePath), cipher, output);
  appendFileSync(destinationPath, cipher.getAuthTag());
}

interface EncryptionEnvelope {
  iv: Buffer;
  tag: Buffer;
  payloadStart: number;
  payloadEnd: number;
}

/**
 * Parse the shared `PKHBAK01` envelope: magic, 12-byte IV, ciphertext, 16-byte GCM tag.
 * Used for the database file and for every encrypted object, so there is one crypto format.
 */
function readEncryptionEnvelope(sourcePath: string): EncryptionEnvelope {
  const size = statSync(sourcePath).size;
  if (size <= ENCRYPTION_HEADER_BYTES + ENCRYPTION_TAG_BYTES) {
    throw new Error('Encrypted backup is truncated');
  }

  const descriptor = openSync(sourcePath, 'r');
  const header = Buffer.alloc(ENCRYPTION_HEADER_BYTES);
  const tag = Buffer.alloc(ENCRYPTION_TAG_BYTES);
  try {
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length ||
      readSync(descriptor, tag, 0, tag.length, size - tag.length) !== tag.length) {
      throw new Error('Encrypted backup is truncated');
    }
  } finally {
    closeSync(descriptor);
  }
  if (!header.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)) {
    throw new Error('Encrypted backup format is invalid');
  }

  return {
    iv: header.subarray(ENCRYPTION_MAGIC.length),
    tag,
    payloadStart: ENCRYPTION_HEADER_BYTES,
    payloadEnd: size - ENCRYPTION_TAG_BYTES - 1,
  };
}

async function decryptFile(sourcePath: string, destinationPath: string, key: Buffer): Promise<void> {
  const envelope = readEncryptionEnvelope(sourcePath);
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  const output = createWriteStream(destinationPath, { flags: 'wx' });
  try {
    await pipeline(
      createReadStream(sourcePath, { start: envelope.payloadStart, end: envelope.payloadEnd }),
      decipher,
      output,
    );
  } catch (error) {
    removeIfPresent(destinationPath);
    throw new Error('Encrypted backup authentication failed', { cause: error });
  }
}

/**
 * Decrypt to memory-less sinks only. Verification uses this so an encrypted object is never
 * written to disk as plaintext just to be checked.
 */
async function decryptToHash(sourcePath: string, key: Buffer): Promise<{ sizeBytes: number; sha256: string }> {
  const envelope = readEncryptionEnvelope(sourcePath);
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  const hash = createHash('sha256');
  let sizeBytes = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      callback();
    },
  });
  try {
    await pipeline(
      createReadStream(sourcePath, { start: envelope.payloadStart, end: envelope.payloadEnd }),
      decipher,
      sink,
    );
  } catch (error) {
    throw new Error('Encrypted object authentication failed', { cause: error });
  }
  return { sizeBytes, sha256: hash.digest('hex') };
}

/** Decrypt into a staging path and verify plaintext size/hash before the file is accepted. */
async function decryptFileVerified(
  sourcePath: string,
  destinationPath: string,
  key: Buffer,
  expected: { sizeBytes: number; sha256: string },
): Promise<void> {
  const envelope = readEncryptionEnvelope(sourcePath);
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  const hash = createHash('sha256');
  let sizeBytes = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      callback(null, chunk);
    },
  });
  const output = createWriteStream(destinationPath, { flags: 'wx' });
  try {
    await pipeline(
      createReadStream(sourcePath, { start: envelope.payloadStart, end: envelope.payloadEnd }),
      decipher,
      verifier,
      output,
    );
  } catch (error) {
    removeIfPresent(destinationPath);
    throw new Error('Encrypted object authentication failed', { cause: error });
  }
  if (sizeBytes !== expected.sizeBytes || hash.digest('hex') !== expected.sha256) {
    removeIfPresent(destinationPath);
    throw new Error('Decrypted object does not match the manifest');
  }
}

async function updateEncryptedManifest(
  manifest: BackupManifest,
  encryptedPath: string,
  keyId: string | null = null,
): Promise<void> {
  manifest.sizeBytes = statSync(encryptedPath).size;
  manifest.sha256 = await sha256File(encryptedPath);
  manifest.encryption = {
    algorithm: ENCRYPTION_ALGORITHM,
    formatVersion: 1,
    ...(keyId ? { keyId } : {}),
  };
}

export interface RestoreResult {
  databasePath: string;
  safetyCopyPath: string | null;
  schemaVersions: number[];
  objectsRestored: number;
  objectsSafetyPath: string | null;
}

interface Inspection {
  integrityCheck: string;
  foreignKeyViolations: number;
  schemaVersions: number[];
  sqliteVersion: string;
  tables: Set<string>;
}

/** `2026-10-19T13:45:12.123Z` -> `20261019T134512123Z` (fixed width, sorts chronologically). */
function utcStamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${iso.slice(20, 23)}Z`;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function flushToDisk(path: string): void {
  const descriptor = openSync(path, 'r+');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function removeIfPresent(path: string): void {
  rmSync(path, { force: true });
}

/**
 * Best-effort private scratch directory.
 *
 * On POSIX the mode is 0700; on Windows `chmod` only toggles the read-only bit and real
 * protection comes from the per-user ACL on %LOCALAPPDATA%\Temp. This narrows exposure but does
 * **not** guarantee that a plaintext staging file disappears after a crash or power loss.
 */
function createPrivateTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    chmodSync(directory, 0o700);
  } catch {
    // Not supported on this platform/filesystem; ACLs still apply.
  }
  return directory;
}

/** Best-effort 0600 for a plaintext staging file; ignored where POSIX modes do not apply. */
function restrictFilePermissions(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    // Not supported on this platform/filesystem.
  }
}

/**
 * Build the manifest for a database file that has already been written.
 * Throws if the file fails integrity checks, so an invalid artefact never gets a manifest.
 */
async function buildManifest(path: string, createdAt: Date, fileName = basename(path)): Promise<BackupManifest> {
  const inspection = inspectDatabaseFile(path);
  if (inspection.integrityCheck !== 'ok') {
    throw new Error(`Backup failed integrity_check: ${inspection.integrityCheck}`);
  }
  if (inspection.foreignKeyViolations !== 0) {
    throw new Error(`Backup has ${inspection.foreignKeyViolations} foreign key violation(s)`);
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    createdAtMs: createdAt.getTime(),
    file: fileName,
    sizeBytes: statSync(path).size,
    sha256: await sha256File(path),
    schemaVersions: inspection.schemaVersions,
    sqliteVersion: inspection.sqliteVersion,
    integrityCheck: inspection.integrityCheck,
    foreignKeyViolations: inspection.foreignKeyViolations,
  };
}

/**
 * Read-only structural inspection. Never migrates or writes.
 *
 * SQLite creates `-shm`/`-wal` sidecars when a read-only connection opens a WAL database and does
 * not always remove them on close. Those leftovers would later look like "the server is still
 * running" to `assertDatabaseIsClosed()`, so any sidecar that did not exist before this inspection
 * is removed afterwards. A sidecar that already existed (a live server) is never touched.
 */
function inspectDatabaseFile(path: string): Inspection {
  const shmPath = `${path}-shm`;
  const walPath = `${path}-wal`;
  const hadShm = existsSync(shmPath);
  const hadWal = existsSync(walPath);

  const database = new Database(path, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    const integrityCheck = String(database.pragma('integrity_check', { simple: true }));
    const foreignKeyViolations = (database.pragma('foreign_key_check') as unknown[]).length;
    const versionRows = database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;
    const tableRows = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const versionRow = database.prepare('SELECT sqlite_version() AS version').get() as { version: string };

    const schemaVersions = versionRows.map((row) => row.version);
    for (let index = 0; index < schemaVersions.length; index += 1) {
      if (schemaVersions[index] !== index + 1) {
        throw new Error(`Schema migration history is not sequential at version ${schemaVersions[index]}`);
      }
    }

    return {
      integrityCheck,
      foreignKeyViolations,
      schemaVersions,
      sqliteVersion: String(versionRow.version),
      tables: new Set(tableRows.map((row) => row.name)),
    };
  } finally {
    database.close();
    if (!hadShm) removeIfPresent(shmPath);
    if (!hadWal && existsSync(walPath) && statSync(walPath).size === 0) removeIfPresent(walPath);
  }
}

function assertAbsolute(name: string, value: string): string {
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return resolve(value);
}

function assertRetention(keep: number): void {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error('Retention must be a positive integer');
  }
}

/**
 * Refuse to touch a database that another connection still has open.
 *
 * Presence of a `-shm` file is not enough: a read-only inspection leaves one behind even after the
 * connection is closed. What distinguishes a live connection is that the file is memory-mapped, and
 * Windows refuses to delete a mapped file (EBUSY). So: try to delete the sidecar. Success means no
 * connection is attached and the stale file is gone; failure means the server is still running.
 * `BEGIN EXCLUSIVE` is kept as a second check for an active writer.
 */
function assertDatabaseIsClosed(databasePath: string): void {
  const shmPath = `${databasePath}-shm`;

  if (existsSync(shmPath)) {
    try {
      rmSync(shmPath);
    } catch {
      throw new Error(
        'The database appears to be in use (its -shm file is locked). Stop the server before restoring.',
      );
    }
  }

  let probe: SqliteHandle | null = null;
  try {
    probe = new Database(databasePath, { timeout: 500 });
    probe.exec('BEGIN EXCLUSIVE');
    probe.exec('ROLLBACK');
  } catch {
    throw new Error('The database is locked by another connection. Stop the server before restoring.');
  } finally {
    probe?.close();
  }
}

/** Rename without deleting the destination on failure; callers must preserve their rollback copy. */
export function replaceFile(source: string, destination: string): void {
  renameSync(source, destination);
}

function writeManifestAtomic(manifestPath: string, manifest: BackupManifest): void {
  const temporaryPath = `${manifestPath}${PARTIAL_SUFFIX}`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  flushToDisk(temporaryPath);
  replaceFile(temporaryPath, manifestPath);
}

/**
 * Delete backups beyond `keep`, newest first.
 * Only files matching the backup naming pattern are considered; anything else in the directory
 * is left alone.
 */
export function pruneBackups(backupDirectory: string, keep: number, protectedPath?: string): string[] {
  assertRetention(keep);
  if (!existsSync(backupDirectory)) return [];

  const directory = resolve(backupDirectory);
  const protectedName = protectedPath ? basename(protectedPath) : null;
  const candidates = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const retained = candidates.slice(0, keep);
  if (protectedName && !retained.includes(protectedName)) retained.push(protectedName);

  const pruned: string[] = [];
  for (const name of candidates) {
    if (retained.includes(name)) continue;
    removeIfPresent(join(directory, name));
    removeIfPresent(join(directory, `${name}${MANIFEST_SUFFIX}`));
    removeTree(join(directory, `${name}${OBJECTS_SUFFIX}`));
    pruned.push(name);
  }
  return pruned;
}

export function listBackups(backupDirectory: string): BackupEntry[] {
  if (!existsSync(backupDirectory)) return [];
  const directory = resolve(backupDirectory);

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => {
      const path = join(directory, entry.name);
      const manifestPath = `${path}${MANIFEST_SUFFIX}`;
      let createdAtMs: number | null = null;
      let objectFiles: number | null = null;
      const hasManifest = existsSync(manifestPath);
      if (hasManifest) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
          createdAtMs = typeof manifest.createdAtMs === 'number' ? manifest.createdAtMs : null;
          objectFiles = typeof manifest.objects?.fileCount === 'number' ? manifest.objects.fileCount : null;
        } catch {
          createdAtMs = null;
        }
      }
      return { path, file: entry.name, sizeBytes: statSync(path).size, createdAtMs, hasManifest, objectFiles };
    })
    .sort((left, right) => right.file.localeCompare(left.file));
}

/**
 * Create a consistent snapshot of a live database.
 * Safe to run while the server is serving requests.
 */
export async function createBackup(options: CreateBackupOptions): Promise<BackupResult> {
  const keep = options.keep ?? DEFAULT_RETENTION;
  assertRetention(keep);
  const directory = assertAbsolute('BACKUP_DIR', options.backupDirectory);
  const keyRing = resolveKeyRing(options.encryptionKey);
  const key = keyRing.activeKey;
  const keyId = keyRing.activeKeyId;
  mkdirSync(directory, { recursive: true });

  const createdAt = options.now ?? new Date();
  const fileName = `knowledge-${utcStamp(createdAt)}-${randomBytes(4).toString('hex')}.sqlite3`;
  const finalPath = join(directory, fileName);
  const manifestPath = `${finalPath}${MANIFEST_SUFFIX}`;
  if (existsSync(finalPath)) {
    throw new Error(`A backup with this name already exists: ${fileName}`);
  }

  const temporaryDirectory = key ? createPrivateTempDirectory('pkh-backup-create-') : null;
  const partialPath = temporaryDirectory
    ? join(temporaryDirectory, DEFAULT_DATABASE_FILENAME)
    : `${finalPath}${PARTIAL_SUFFIX}`;
  const encryptedPartialPath = `${partialPath}.enc`;
  const finalizedEncryptedPartialPath = `${finalPath}${PARTIAL_SUFFIX}.enc`;
  let backupFinalized = false;

  try {
    await options.database.backup(partialPath);
    if (key) restrictFilePermissions(partialPath);

    const manifest = await buildManifest(partialPath, createdAt, fileName);
    let objectsPath: string | null = null;
    const objectsSource = options.dataDirectory
      ? join(resolve(options.dataDirectory), 'objects')
      : null;
    if (objectsSource && existsSync(objectsSource)) {
      const partialObjectsPath = `${finalPath}${OBJECTS_PARTIAL_SUFFIX}`;
      removeTree(partialObjectsPath);
      const snapshot = await snapshotObjects(objectsSource, partialObjectsPath, key, keyId);
      if (snapshot) {
        objectsPath = `${finalPath}${OBJECTS_SUFFIX}`;
        // The manifest must describe the final directory name, not the partial one.
        snapshot.directory = basename(objectsPath);
        replaceFile(partialObjectsPath, objectsPath);
        manifest.objects = snapshot;
      } else {
        removeTree(partialObjectsPath);
      }
    }
    if (key) {
      await encryptFile(partialPath, finalizedEncryptedPartialPath, key);
      removeIfPresent(partialPath);
      await updateEncryptedManifest(manifest, finalizedEncryptedPartialPath, keyId);
      flushToDisk(finalizedEncryptedPartialPath);
      replaceFile(finalizedEncryptedPartialPath, finalPath);
    } else {
      flushToDisk(partialPath);
      replaceFile(partialPath, finalPath);
    }
    writeManifestAtomic(manifestPath, manifest);
    backupFinalized = true;

    return {
      path: finalPath,
      manifestPath,
      manifest,
      objectsPath,
      pruned: options.prune === false ? [] : pruneBackups(directory, keep, finalPath),
    };
  } catch (error) {
    removeIfPresent(partialPath);
    removeIfPresent(encryptedPartialPath);
    removeIfPresent(finalizedEncryptedPartialPath);
    removeTree(`${finalPath}${OBJECTS_PARTIAL_SUFFIX}`);
    if (!backupFinalized) {
      removeIfPresent(finalPath);
      removeIfPresent(manifestPath);
      removeIfPresent(`${manifestPath}${PARTIAL_SUFFIX}`);
      removeTree(`${finalPath}${OBJECTS_SUFFIX}`);
    }
    throw error;
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function readBackupFileIds(path: string, schemaVersions: number[]): string[] {
  if (!schemaVersions.includes(7)) return [];
  // A backup keeps the source database's WAL header, so a read-only open can leave sidecars.
  // Remove only the ones this call created.
  const shmPath = `${path}-shm`;
  const walPath = `${path}-wal`;
  const hadShm = existsSync(shmPath);
  const hadWal = existsSync(walPath);

  const database = new Database(path, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    return (database.prepare('SELECT id FROM files').all() as Array<{ id: string }>).map((row) => row.id);
  } finally {
    database.close();
    if (!hadShm) removeIfPresent(shmPath);
    if (!hadWal && existsSync(walPath) && statSync(walPath).size === 0) removeIfPresent(walPath);
  }
}

/** Verify a backup without modifying it. */
export async function verifyBackup(backupPath: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const requireManifest = options.requireManifest ?? true;
  const path = resolve(backupPath);
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(path)) {
    return { ok: false, path, problems: ['Backup file not found'], warnings, manifest: null };
  }

  const manifestPath = `${path}${MANIFEST_SUFFIX}`;
  let manifest: BackupManifest | null = null;

  if (!existsSync(manifestPath)) {
    if (requireManifest) problems.push('Manifest is missing');
  } else {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
    } catch {
      problems.push('Manifest is not valid JSON');
    }
  }

  if (manifest) {
    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
      problems.push(`Unsupported manifest formatVersion: ${manifest.formatVersion}`);
    }
    if (manifest.file !== basename(path)) {
      problems.push('Manifest file name does not match the backup file name');
    }

    const sizeBytes = statSync(path).size;
    if (manifest.sizeBytes !== sizeBytes) {
      problems.push(`Size mismatch: manifest ${manifest.sizeBytes} bytes, file ${sizeBytes} bytes`);
    }

    const sha256 = await sha256File(path);
    if (manifest.sha256 !== sha256) {
      problems.push('SHA-256 mismatch: the file changed after the backup was written');
    }
  }

  let inspectionPath = path;
  let temporaryDirectory: string | null = null;
  try {
    const needsKey = Boolean(manifest?.encryption || manifest?.objects?.encryption);
    const keyRing = needsKey ? resolveKeyRing(options.encryptionKey) : null;
    const key = keyRing
      ? selectBackupKey(keyRing, manifest?.encryption?.keyId)
      : null;

    if (manifest?.encryption) {
      if (manifest.encryption.algorithm !== ENCRYPTION_ALGORITHM ||
        manifest.encryption.formatVersion !== 1) {
        problems.push('Unsupported backup encryption format');
      } else if (!key) {
        problems.push(
          manifest.encryption.keyId
            ? `No backup key is configured for key id ${manifest.encryption.keyId}`
            : 'This backup is encrypted; configure BACKUP_ENCRYPTION_KEY to verify it',
        );
      } else {
        temporaryDirectory = mkdtempSync(join(tmpdir(), 'pkh-backup-verify-'));
        inspectionPath = join(temporaryDirectory, DEFAULT_DATABASE_FILENAME);
        await decryptFile(path, inspectionPath, key);
      }
    }

    if (problems.length > 0 && manifest?.encryption && inspectionPath === path) {
      return { ok: false, path, problems, warnings, manifest };
    }

    const inspection = inspectDatabaseFile(inspectionPath);
    if (inspection.integrityCheck !== 'ok') {
      problems.push(`integrity_check returned: ${inspection.integrityCheck}`);
    }
    if (inspection.foreignKeyViolations !== 0) {
      problems.push(`foreign_key_check reported ${inspection.foreignKeyViolations} violation(s)`);
    }
    for (const table of requiredTablesForSchema(inspection.schemaVersions)) {
      if (!inspection.tables.has(table)) problems.push(`Required table is missing: ${table}`);
    }
    if (manifest && inspection.schemaVersions.join(',') !== manifest.schemaVersions.join(',')) {
      problems.push(
        `Schema versions differ: manifest [${manifest.schemaVersions.join(', ')}], file [${inspection.schemaVersions.join(', ')}]`,
      );
    }

    const fileIds = readBackupFileIds(inspectionPath, inspection.schemaVersions);
    if (manifest?.objects) {
      // The whole set must share one encryption policy; a plaintext object snapshot next to an
      // encrypted database is exactly the gap this check exists to prevent.
      if (manifest.encryption && !manifest.objects.encryption) {
        problems.push('The database backup is encrypted but its object snapshot is not');
      }
      if (!manifest.encryption && manifest.objects.encryption) {
        problems.push('The object snapshot is encrypted but the database backup is not');
      }
      if (manifest.encryption?.keyId && manifest.objects.encryption?.keyId &&
        manifest.encryption.keyId !== manifest.objects.encryption.keyId) {
        problems.push('The database and object snapshot were encrypted with different key ids');
      }
      problems.push(...await verifyObjectSnapshot(manifest.objects, path, key));

      const inventory = manifest.objects.files;
      if (fileIds.length > 0 && !inventory) {
        problems.push(`Backup database references ${fileIds.length} file(s) but has no object inventory`);
      } else if (inventory) {
        const paths = new Set(inventory.map((entry) => entry.path));
        const missing = fileIds.filter((id) => !paths.has(`${id.slice(0, 2)}/${id}`));
        if (missing.length > 0) {
          problems.push(
            `Backup database references ${missing.length} file(s) with no object in the snapshot`,
          );
        }
        if (inventory.length > fileIds.length) {
          warnings.push(
            `${inventory.length - fileIds.length} object(s) in the snapshot have no file metadata row`,
          );
        }
      }
    } else if (manifest && fileIds.length > 0) {
      problems.push(
        `Backup database references ${fileIds.length} file(s) but the backup has no object snapshot`,
      );
    }
  } catch (error) {
    problems.push(`Cannot read backup as a SQLite database: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  return { ok: problems.length === 0, path, problems, warnings, manifest };
}

/**
 * Replace the live database with a verified backup.
 *
 * Preconditions enforced here: the backup verifies, and no connection appears to hold the target
 * database. The caller is still responsible for actually stopping the server.
 */
export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const backupPath = resolve(options.backupPath);
  const dataDirectory = assertAbsolute('DATA_DIR', options.dataDirectory);

  const verification = await verifyBackup(backupPath, { encryptionKey: options.encryptionKey });
  if (!verification.ok) {
    throw new Error(`Backup failed verification: ${verification.problems.join('; ')}`);
  }
  const keyRing = resolveKeyRing(options.encryptionKey);
  const key = selectBackupKey(keyRing, verification.manifest?.encryption?.keyId);
  // The safety copy must record the key that actually encrypted it, which may be an older ring key.
  const selectedKeyId = verification.manifest?.encryption?.keyId ?? keyRing.activeKeyId;
  if (verification.manifest?.encryption && !key) {
    throw new Error(
      verification.manifest.encryption.keyId
        ? `No backup key is configured for key id ${verification.manifest.encryption.keyId}`
        : 'BACKUP_ENCRYPTION_KEY is required to restore this backup',
    );
  }

  const databaseDirectory = join(dataDirectory, 'db');
  mkdirSync(databaseDirectory, { recursive: true });
  const databasePath = join(databaseDirectory, DEFAULT_DATABASE_FILENAME);
  const stamp = utcStamp(options.now ?? new Date());
  const partialPath = join(databaseDirectory, `${DEFAULT_DATABASE_FILENAME}.restore-partial-${stamp}`);

  let safetyCopyPath: string | null = null;

  if (existsSync(databasePath) && !options.force) {
    assertDatabaseIsClosed(databasePath);
  }

  if (existsSync(databasePath)) {
    safetyCopyPath = join(databaseDirectory, `${DEFAULT_DATABASE_FILENAME}.pre-restore-${stamp}`);
    let attempt = 1;
    while (existsSync(safetyCopyPath) || existsSync(`${safetyCopyPath}${MANIFEST_SUFFIX}`)) {
      attempt += 1;
      safetyCopyPath = join(databaseDirectory, `${DEFAULT_DATABASE_FILENAME}.pre-restore-${stamp}-${attempt}`);
    }
    const safetyTemporaryDirectory = key ? createPrivateTempDirectory('pkh-restore-safety-') : null;
    const safetyPartialPath = safetyTemporaryDirectory
      ? join(safetyTemporaryDirectory, DEFAULT_DATABASE_FILENAME)
      : `${safetyCopyPath}${PARTIAL_SUFFIX}`;
    const safetyEncryptedPartialPath = `${safetyCopyPath}${PARTIAL_SUFFIX}.enc`;
    try {
      const current = new Database(databasePath, { timeout: 5000 });
      try {
        // Online Backup API, so uncheckpointed WAL content is included in the safety copy.
        await current.backup(safetyPartialPath);
        if (key) restrictFilePermissions(safetyPartialPath);
      } finally {
        current.close();
      }

      const safetyManifest = await buildManifest(
        safetyPartialPath,
        options.now ?? new Date(),
        basename(safetyCopyPath),
      );
      if (key) {
        await encryptFile(safetyPartialPath, safetyEncryptedPartialPath, key);
        removeIfPresent(safetyPartialPath);
        await updateEncryptedManifest(safetyManifest, safetyEncryptedPartialPath, selectedKeyId);
        flushToDisk(safetyEncryptedPartialPath);
        replaceFile(safetyEncryptedPartialPath, safetyCopyPath);
      } else {
        flushToDisk(safetyPartialPath);
        replaceFile(safetyPartialPath, safetyCopyPath);
      }
      writeManifestAtomic(`${safetyCopyPath}${MANIFEST_SUFFIX}`, safetyManifest);
    } catch (error) {
      removeIfPresent(safetyPartialPath);
      removeIfPresent(safetyEncryptedPartialPath);
      removeIfPresent(safetyCopyPath);
      removeIfPresent(`${safetyCopyPath}${MANIFEST_SUFFIX}`);
      throw error;
    } finally {
      if (safetyTemporaryDirectory) {
        rmSync(safetyTemporaryDirectory, { recursive: true, force: true });
      }
    }
  }

  let objectsRestored = 0;
  let objectsSafetyPath: string | null = null;
  let rollbackDirectory: string | null = null;
  let safetyObjectsSnapshot: ObjectsManifest | null = null;
  const objectsBackupPath = verification.manifest?.objects
    ? join(dirname(backupPath), verification.manifest.objects.directory)
    : null;

  if (objectsBackupPath) {
    const liveObjectsPath = join(dataDirectory, 'objects');
    const hasLiveObjects = existsSync(liveObjectsPath);
    const safetyCopyManifestPath = safetyCopyPath ? `${safetyCopyPath}${MANIFEST_SUFFIX}` : null;

    // Park the current plaintext store first. It is the immediate rollback if anything below fails.
    if (hasLiveObjects) {
      rollbackDirectory = uniquePath(join(dataDirectory, `objects.rollback-${stamp}`));
      try {
        renameSync(liveObjectsPath, rollbackDirectory);
        objectsSafetyPath = rollbackDirectory;
      } catch (error) {
        rollbackDirectory = null;
        throw new Error('Could not preserve the current object store before restoring', { cause: error });
      }
    }

    // The safety copy must use the same encryption policy as the backup being restored; a
    // plaintext object directory next to an encrypted database is rejected by verification.
    if (safetyCopyManifestPath && rollbackDirectory) {
      const snapshotTarget = uniquePath(`${safetyCopyPath}${OBJECTS_SUFFIX}`);
      const snapshotPartial = `${snapshotTarget}${PARTIAL_SUFFIX}`;
      try {
        removeTree(snapshotPartial);
        const snapshot = await snapshotObjects(rollbackDirectory, snapshotPartial, key, selectedKeyId);
        if (snapshot) {
          snapshot.directory = basename(snapshotTarget);
          replaceFile(snapshotPartial, snapshotTarget);
          safetyObjectsSnapshot = snapshot;
          objectsSafetyPath = snapshotTarget;
        } else {
          removeTree(snapshotPartial);
        }
      } catch (error) {
        removeTree(snapshotPartial);
        removeTree(liveObjectsPath);
        renameSync(rollbackDirectory, liveObjectsPath);
        rollbackDirectory = null;
        throw new Error(
          'Could not build the safety object snapshot; the previous store was left in place',
          { cause: error },
        );
      }
    }

    const objectsPartialPath = join(dataDirectory, `objects.restore-partial-${stamp}`);
    try {
      removeTree(objectsPartialPath);
      if (!verification.manifest?.objects) throw new Error('Object manifest disappeared during restore');
      objectsRestored = await materializeObjectSnapshot(
        verification.manifest.objects,
        objectsBackupPath,
        objectsPartialPath,
        key,
      );
      renameSync(objectsPartialPath, liveObjectsPath);
    } catch (error) {
      removeTree(objectsPartialPath);
      removeTree(liveObjectsPath);
      if (rollbackDirectory) {
        renameSync(rollbackDirectory, liveObjectsPath);
        rollbackDirectory = null;
        objectsSafetyPath = null;
      }
      throw new Error('Restoring stored files failed; the previous object store was left in place', {
        cause: error,
      });
    }
  }

  try {
    if (verification.manifest?.encryption) {
      if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is required to restore this backup');
      await decryptFile(backupPath, partialPath, key);
      restrictFilePermissions(partialPath);
    } else {
      copyFileSync(backupPath, partialPath);
    }
    flushToDisk(partialPath);

    removeIfPresent(`${databasePath}-wal`);
    removeIfPresent(`${databasePath}-shm`);
    replaceFile(partialPath, databasePath);

    try {
      const inspection = inspectDatabaseFile(databasePath);
      if (inspection.integrityCheck !== 'ok') {
        throw new Error(`Restored database failed integrity_check: ${inspection.integrityCheck}`);
      }
      for (const table of requiredTablesForSchema(inspection.schemaVersions)) {
        if (!inspection.tables.has(table)) {
          throw new Error(`Restored database is missing required table: ${table}`);
        }
      }
      // The restore is complete, so the safety copy is now a database + files rollback point.
      if (safetyCopyPath && safetyObjectsSnapshot) {
        try {
          const safetyManifestPath = `${safetyCopyPath}${MANIFEST_SUFFIX}`;
          const safetyManifest = JSON.parse(readFileSync(safetyManifestPath, 'utf8')) as BackupManifest;
          safetyManifest.objects = safetyObjectsSnapshot;
          writeManifestAtomic(safetyManifestPath, safetyManifest);
          // The safety copy now holds the rollback; drop the plaintext duplicate.
          if (rollbackDirectory) {
            removeTree(rollbackDirectory);
            rollbackDirectory = null;
          }
        } catch (error) {
          // Keep the plaintext rollback directory, and point the operator at it.
          objectsSafetyPath = rollbackDirectory ?? objectsSafetyPath;
          console.warn(
            `Restore succeeded but the safety copy could not record its object snapshot: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return {
        databasePath,
        safetyCopyPath,
        schemaVersions: inspection.schemaVersions,
        objectsRestored,
        objectsSafetyPath,
      };
    } catch (error) {
      if (safetyCopyPath) {
        removeIfPresent(`${databasePath}-wal`);
        removeIfPresent(`${databasePath}-shm`);
        if (key) await decryptFile(safetyCopyPath, partialPath, key);
        else copyFileSync(safetyCopyPath, partialPath);
        replaceFile(partialPath, databasePath);
      }
      throw error;
    }
  } catch (error) {
    if (objectsBackupPath) {
      removeTree(join(dataDirectory, 'objects'));
      if (rollbackDirectory) {
        renameSync(rollbackDirectory, join(dataDirectory, 'objects'));
        rollbackDirectory = null;
        objectsSafetyPath = null;
      }
      objectsRestored = 0;
    }
    throw error;
  }
}
