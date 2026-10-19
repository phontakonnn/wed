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
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import type { SqliteDatabase } from './database.js';

type SqliteHandle = InstanceType<typeof Database>;

export const BACKUP_FORMAT_VERSION = 1;
export const DEFAULT_RETENTION = 7;
export const DEFAULT_DATABASE_FILENAME = 'knowledge.sqlite3';

const BACKUP_NAME_PATTERN = /^knowledge-\d{8}T\d{9}Z-[0-9a-f]{8}\.sqlite3$/;
const MANIFEST_SUFFIX = '.manifest.json';
const PARTIAL_SUFFIX = '.partial';
const REQUIRED_TABLES = ['users', 'sessions', 'schema_migrations'] as const;

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
}

export interface BackupResult {
  path: string;
  manifestPath: string;
  manifest: BackupManifest;
  pruned: string[];
}

export interface BackupEntry {
  path: string;
  file: string;
  sizeBytes: number;
  createdAtMs: number | null;
  hasManifest: boolean;
}

export interface VerifyOptions {
  /** When false, the manifest is not required (used for pre-restore safety copies). */
  requireManifest?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  path: string;
  problems: string[];
  manifest: BackupManifest | null;
}

export interface CreateBackupOptions {
  database: SqliteDatabase;
  backupDirectory: string;
  keep?: number;
  now?: Date;
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
}

export interface RestoreResult {
  databasePath: string;
  safetyCopyPath: string | null;
  schemaVersions: number[];
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

    return {
      integrityCheck,
      foreignKeyViolations,
      schemaVersions: versionRows.map((row) => row.version),
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

/** Rename over an existing file, with a remove-and-rename fallback for Windows edge cases. */
function replaceFile(source: string, destination: string): void {
  try {
    renameSync(source, destination);
  } catch {
    removeIfPresent(destination);
    renameSync(source, destination);
  }
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
      const hasManifest = existsSync(manifestPath);
      if (hasManifest) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
          createdAtMs = typeof manifest.createdAtMs === 'number' ? manifest.createdAtMs : null;
        } catch {
          createdAtMs = null;
        }
      }
      return { path, file: entry.name, sizeBytes: statSync(path).size, createdAtMs, hasManifest };
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
  mkdirSync(directory, { recursive: true });

  const createdAt = options.now ?? new Date();
  const fileName = `knowledge-${utcStamp(createdAt)}-${randomBytes(4).toString('hex')}.sqlite3`;
  const finalPath = join(directory, fileName);
  const manifestPath = `${finalPath}${MANIFEST_SUFFIX}`;
  const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;

  if (existsSync(finalPath)) {
    throw new Error(`A backup with this name already exists: ${fileName}`);
  }

  try {
    await options.database.backup(partialPath);

    const manifest = await buildManifest(partialPath, createdAt, fileName);
    flushToDisk(partialPath);
    replaceFile(partialPath, finalPath);
    writeManifestAtomic(manifestPath, manifest);

    return {
      path: finalPath,
      manifestPath,
      manifest,
      pruned: pruneBackups(directory, keep, finalPath),
    };
  } catch (error) {
    removeIfPresent(partialPath);
    throw error;
  }
}

/** Verify a backup without modifying it. */
export async function verifyBackup(backupPath: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const requireManifest = options.requireManifest ?? true;
  const path = resolve(backupPath);
  const problems: string[] = [];

  if (!existsSync(path)) {
    return { ok: false, path, problems: ['Backup file not found'], manifest: null };
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

  try {
    const inspection = inspectDatabaseFile(path);
    if (inspection.integrityCheck !== 'ok') {
      problems.push(`integrity_check returned: ${inspection.integrityCheck}`);
    }
    if (inspection.foreignKeyViolations !== 0) {
      problems.push(`foreign_key_check reported ${inspection.foreignKeyViolations} violation(s)`);
    }
    for (const table of REQUIRED_TABLES) {
      if (!inspection.tables.has(table)) problems.push(`Required table is missing: ${table}`);
    }
    if (manifest && inspection.schemaVersions.join(',') !== manifest.schemaVersions.join(',')) {
      problems.push(
        `Schema versions differ: manifest [${manifest.schemaVersions.join(', ')}], file [${inspection.schemaVersions.join(', ')}]`,
      );
    }
  } catch (error) {
    problems.push(`Cannot read backup as a SQLite database: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: problems.length === 0, path, problems, manifest };
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

  const verification = await verifyBackup(backupPath);
  if (!verification.ok) {
    throw new Error(`Backup failed verification: ${verification.problems.join('; ')}`);
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
    const current = new Database(databasePath, { timeout: 5000 });
    try {
      // Online Backup API, so uncheckpointed WAL content is included in the safety copy.
      await current.backup(safetyCopyPath);
    } finally {
      current.close();
    }
    // Give the safety copy its own manifest so it can be verified and restored by this same CLI.
    // Without this, rolling back a bad restore would require a manual file copy.
    flushToDisk(safetyCopyPath);
    writeManifestAtomic(`${safetyCopyPath}${MANIFEST_SUFFIX}`, await buildManifest(safetyCopyPath, options.now ?? new Date()));
  }

  copyFileSync(backupPath, partialPath);
  flushToDisk(partialPath);

  removeIfPresent(`${databasePath}-wal`);
  removeIfPresent(`${databasePath}-shm`);
  replaceFile(partialPath, databasePath);

  try {
    const inspection = inspectDatabaseFile(databasePath);
    if (inspection.integrityCheck !== 'ok') {
      throw new Error(`Restored database failed integrity_check: ${inspection.integrityCheck}`);
    }
    for (const table of REQUIRED_TABLES) {
      if (!inspection.tables.has(table)) {
        throw new Error(`Restored database is missing required table: ${table}`);
      }
    }
    return { databasePath, safetyCopyPath, schemaVersions: inspection.schemaVersions };
  } catch (error) {
    if (safetyCopyPath) {
      removeIfPresent(`${databasePath}-wal`);
      removeIfPresent(`${databasePath}-shm`);
      copyFileSync(safetyCopyPath, partialPath);
      replaceFile(partialPath, databasePath);
    }
    throw error;
  }
}
