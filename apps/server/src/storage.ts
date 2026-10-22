/**
 * Storage reconciliation for `DATA_DIR/objects` and `DATA_DIR/tmp`.
 *
 * Read-only by default. The only mutating operation is quarantine: files are *moved* to
 * `DATA_DIR/quarantine/<stamp>/` with a JSON record of what moved and why. Nothing is ever
 * deleted, and a file is only moved when ownership is unambiguous.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { SqliteDatabase } from './database.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_STALE_TEMP_MS = 24 * 60 * 60 * 1000;

export interface MissingObject {
  id: string;
  expectedPath: string;
}

export interface OrphanObject {
  path: string;
  sizeBytes: number;
}

export interface HashMismatch {
  id: string;
  expected: string;
  actual: string;
}

export interface SizeMismatch {
  id: string;
  expected: number;
  actual: number;
}

export interface TempFile {
  path: string;
  sizeBytes: number;
  ageMs: number;
}

export interface StorageReport {
  dataDirectory: string;
  filesRows: number;
  objectFiles: number;
  missingObjects: MissingObject[];
  orphanObjects: OrphanObject[];
  unexpectedFiles: string[];
  invalidHashes: HashMismatch[];
  sizeMismatches: SizeMismatch[];
  duplicateObjectKeys: string[];
  staleTempFiles: TempFile[];
  activeTempFiles: TempFile[];
  hashVerified: boolean;
}

export interface InspectOptions {
  now?: number;
  staleTempMs?: number;
  /** Skip content hashing for a fast metadata-only pass. */
  skipHashes?: boolean;
}

function walkFiles(root: string, prefix = ''): string[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walkFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

interface FileRow {
  id: string;
  objectKey: string;
  sizeBytes: number;
  sha256: string;
}

function readFileRows(database: SqliteDatabase): FileRow[] {
  return database.prepare(`
    SELECT id, object_key AS objectKey, size_bytes AS sizeBytes, sha256
    FROM files ORDER BY id
  `).all() as FileRow[];
}

function canonicalObjectPath(id: string): string {
  return `${id.slice(0, 2)}/${id}`;
}

/**
 * Compare metadata rows, the object tree, and the upload scratch directory.
 * Never changes anything.
 */
export async function inspectStorage(
  database: SqliteDatabase,
  dataDirectory: string,
  options: InspectOptions = {},
): Promise<StorageReport> {
  const root = resolve(dataDirectory);
  const objectsRoot = join(root, 'objects');
  const tempRoot = join(root, 'tmp');
  const now = options.now ?? Date.now();
  const staleTempMs = options.staleTempMs ?? DEFAULT_STALE_TEMP_MS;
  const skipHashes = options.skipHashes ?? false;

  const rows = readFileRows(database);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const objectFiles = walkFiles(objectsRoot);
  const objectPathSet = new Set(objectFiles);

  const report: StorageReport = {
    dataDirectory: root,
    filesRows: rows.length,
    objectFiles: objectFiles.length,
    missingObjects: [],
    orphanObjects: [],
    unexpectedFiles: [],
    invalidHashes: [],
    sizeMismatches: [],
    duplicateObjectKeys: [],
    staleTempFiles: [],
    activeTempFiles: [],
    hashVerified: !skipHashes,
  };

  const expectedPaths = new Set<string>();
  for (const row of rows) {
    const expectedPath = canonicalObjectPath(row.id);
    expectedPaths.add(expectedPath);
    if (row.objectKey !== row.id) {
      report.unexpectedFiles.push(`metadata:${row.id} has object_key ${row.objectKey}`);
    }
    const absolute = join(objectsRoot, expectedPath);
    if (!objectPathSet.has(expectedPath) || !existsSync(absolute)) {
      report.missingObjects.push({ id: row.id, expectedPath });
      continue;
    }
    const size = statSync(absolute).size;
    if (size !== row.sizeBytes) {
      report.sizeMismatches.push({ id: row.id, expected: row.sizeBytes, actual: size });
      continue;
    }
    if (!skipHashes) {
      const actual = await sha256File(absolute);
      if (actual !== row.sha256) {
        report.invalidHashes.push({ id: row.id, expected: row.sha256, actual });
      }
    }
  }

  for (const relativePath of objectFiles) {
    const [shard, name] = relativePath.split('/');
    const canonical = UUID_PATTERN.test(name ?? '') && shard === name.slice(0, 2);
    if (!canonical) {
      report.unexpectedFiles.push(`objects/${relativePath}`);
      continue;
    }
    if (!rowById.has(name) && !expectedPaths.has(relativePath)) {
      report.orphanObjects.push({
        path: `objects/${relativePath}`,
        sizeBytes: statSync(join(objectsRoot, relativePath)).size,
      });
    }
  }

  const keyCounts = new Map<string, number>();
  for (const row of rows) keyCounts.set(row.objectKey, (keyCounts.get(row.objectKey) ?? 0) + 1);
  for (const [key, count] of keyCounts) {
    if (count > 1) report.duplicateObjectKeys.push(key);
  }

  for (const relativePath of walkFiles(tempRoot)) {
    const absolute = join(tempRoot, relativePath);
    const stats = statSync(absolute);
    const entry: TempFile = {
      path: `tmp/${relativePath}`,
      sizeBytes: stats.size,
      ageMs: Math.max(0, now - stats.mtimeMs),
    };
    if (stats.mtimeMs < now - staleTempMs) report.staleTempFiles.push(entry);
    else report.activeTempFiles.push(entry);
  }

  return report;
}

export function reportHasProblems(report: StorageReport): boolean {
  return report.missingObjects.length > 0
    || report.orphanObjects.length > 0
    || report.unexpectedFiles.length > 0
    || report.invalidHashes.length > 0
    || report.sizeMismatches.length > 0
    || report.duplicateObjectKeys.length > 0
    || report.staleTempFiles.length > 0;
}

export interface QuarantineResult {
  quarantineDirectory: string;
  movedObjects: string[];
  movedTempFiles: string[];
  skipped: string[];
}

export interface QuarantineOptions {
  now?: Date;
  /** Re-scan immediately before moving; a file that gained a metadata row is skipped. */
  database: SqliteDatabase;
}

/**
 * Move orphan objects and stale temporary files into a quarantine directory.
 *
 * This never deletes and never touches a file that is still referenced by `files`, that has an
 * unexpected path, or that is newer than the stale threshold. Deletion is intentionally not
 * implemented; an operator reviews the quarantine directory and removes it deliberately.
 */
export async function quarantineStorage(
  dataDirectory: string,
  report: StorageReport,
  options: QuarantineOptions,
): Promise<QuarantineResult> {
  const root = resolve(dataDirectory);
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const quarantineDirectory = join(root, 'quarantine', stamp);
  const result: QuarantineResult = {
    quarantineDirectory,
    movedObjects: [],
    movedTempFiles: [],
    skipped: [],
  };

  const referenced = new Set(
    (options.database.prepare('SELECT id FROM files').all() as Array<{ id: string }>).map((row) => row.id),
  );

  const move = (sourceRelative: string): string | null => {
    const source = join(root, sourceRelative);
    if (!existsSync(source)) return null;
    const destination = join(quarantineDirectory, sourceRelative);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    return destination;
  };

  for (const orphan of report.orphanObjects) {
    const name = orphan.path.split('/').pop() ?? '';
    if (referenced.has(name)) {
      result.skipped.push(`${orphan.path} (metadata row appeared)`);
      continue;
    }
    const moved = move(orphan.path);
    if (moved) result.movedObjects.push(moved);
    else result.skipped.push(`${orphan.path} (already gone)`);
  }

  for (const temp of report.staleTempFiles) {
    const moved = move(temp.path);
    if (moved) result.movedTempFiles.push(moved);
    else result.skipped.push(`${temp.path} (already gone)`);
  }

  const record = {
    createdAt: (options.now ?? new Date()).toISOString(),
    dataDirectory: root,
    movedObjects: result.movedObjects.map((path) => relative(quarantineDirectory, path).split(sep).join('/')),
    movedTempFiles: result.movedTempFiles.map((path) => relative(quarantineDirectory, path).split(sep).join('/')),
    skipped: result.skipped,
    note: 'Files were moved, not deleted. Review before removing this directory.',
  };
  mkdirSync(quarantineDirectory, { recursive: true });
  writeFileSync(join(quarantineDirectory, 'quarantine.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return result;
}

/** Test helper: age a file so the stale-temp check can be exercised deterministically. */
export function setFileAge(path: string, ageMs: number, now = Date.now()): void {
  const seconds = (now - ageMs) / 1000;
  utimesSync(path, seconds, seconds);
}
