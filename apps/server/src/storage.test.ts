import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from './database.js';
import {
  inspectStorage,
  quarantineStorage,
  reportHasProblems,
  setFileAge,
} from './storage.js';

const databases: SqliteDatabase[] = [];
const directories: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-storage-'));
  directories.push(dataDirectory);
  const database = openDatabase(':memory:');
  databases.push(database);
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('owner-1', 'owner-1', 'test-hash', 1);
  return { dataDirectory, database };
}

function writeObject(dataDirectory: string, id: string, content: string): { path: string; size: number; sha: string } {
  const path = join(dataDirectory, 'objects', id.slice(0, 2), id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return {
    path,
    size: Buffer.byteLength(content),
    sha: createHash('sha256').update(content).digest('hex'),
  };
}

function insertFile(
  database: SqliteDatabase,
  id: string,
  object: { size: number; sha: string },
): void {
  database.prepare(`
    INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'owner-1', 'file.bin', object.size, object.sha, 'application/octet-stream', id, 1);
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('storage inspection', () => {
  it('reports a consistent store as clean', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    const object = writeObject(dataDirectory, id, 'consistent-content');
    insertFile(database, id, object);

    const report = await inspectStorage(database, dataDirectory);

    expect(report.filesRows).toBe(1);
    expect(report.objectFiles).toBe(1);
    expect(reportHasProblems(report)).toBe(false);
    expect(report.invalidHashes).toEqual([]);
  });

  it('detects a metadata row whose object is missing', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    insertFile(database, id, { size: 5, sha: 'a'.repeat(64) });

    const report = await inspectStorage(database, dataDirectory);

    expect(report.missingObjects).toEqual([{ id, expectedPath: `${id.slice(0, 2)}/${id}` }]);
    expect(reportHasProblems(report)).toBe(true);
  });

  it('detects an object with no metadata row', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    writeObject(dataDirectory, id, 'orphan-content');

    const report = await inspectStorage(database, dataDirectory);

    expect(report.orphanObjects).toHaveLength(1);
    expect(report.orphanObjects[0].path).toBe(`objects/${id.slice(0, 2)}/${id}`);
    expect(reportHasProblems(report)).toBe(true);
  });

  it('detects size and hash mismatches without conflating them', async () => {
    const { dataDirectory, database } = setup();
    const sizeId = randomUUID();
    const hashId = randomUUID();
    const sizeObject = writeObject(dataDirectory, sizeId, '1234567890');
    insertFile(database, sizeId, { size: sizeObject.size + 5, sha: sizeObject.sha });

    const hashObject = writeObject(dataDirectory, hashId, 'abcdefghij');
    insertFile(database, hashId, {
      size: hashObject.size,
      sha: createHash('sha256').update('different').digest('hex'),
    });

    const report = await inspectStorage(database, dataDirectory);

    expect(report.sizeMismatches.map((item) => item.id)).toEqual([sizeId]);
    expect(report.invalidHashes.map((item) => item.id)).toEqual([hashId]);
  });

  it('reports unexpected paths and never treats them as orphans', async () => {
    const { dataDirectory, database } = setup();
    mkdirSync(join(dataDirectory, 'objects', 'aa'), { recursive: true });
    writeFileSync(join(dataDirectory, 'objects', 'aa', 'not-a-uuid.bin'), 'unknown');

    const report = await inspectStorage(database, dataDirectory);

    expect(report.unexpectedFiles).toContain('objects/aa/not-a-uuid.bin');
    expect(report.orphanObjects).toEqual([]);
  });

  it('separates stale temporary files from active ones', async () => {
    const { dataDirectory, database } = setup();
    const now = Date.now();
    mkdirSync(join(dataDirectory, 'tmp'), { recursive: true });
    const stale = join(dataDirectory, 'tmp', 'stale.part');
    const active = join(dataDirectory, 'tmp', 'active.part');
    writeFileSync(stale, 'stale');
    writeFileSync(active, 'active');
    setFileAge(stale, 2 * DAY, now);

    const report = await inspectStorage(database, dataDirectory, { now });

    expect(report.staleTempFiles.map((item) => item.path)).toEqual(['tmp/stale.part']);
    expect(report.activeTempFiles.map((item) => item.path)).toEqual(['tmp/active.part']);
  });

  it('detects duplicate object keys when the constraint is absent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-storage-dup-'));
    directories.push(directory);
    const database = new Database(':memory:');
    databases.push(database as unknown as SqliteDatabase);
    database.exec('CREATE TABLE files (id TEXT PRIMARY KEY, object_key TEXT, size_bytes INTEGER, sha256 TEXT)');
    database.prepare('INSERT INTO files VALUES (?, ?, ?, ?)').run('id-1', 'shared-key', 1, 'a'.repeat(64));
    database.prepare('INSERT INTO files VALUES (?, ?, ?, ?)').run('id-2', 'shared-key', 1, 'b'.repeat(64));

    const report = await inspectStorage(database as unknown as SqliteDatabase, directory);

    expect(report.duplicateObjectKeys).toEqual(['shared-key']);
  });

  it('skips hashing when asked for a fast metadata pass', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    const object = writeObject(dataDirectory, id, 'content');
    insertFile(database, id, { size: object.size, sha: 'f'.repeat(64) });

    const report = await inspectStorage(database, dataDirectory, { skipHashes: true });

    expect(report.hashVerified).toBe(false);
    expect(report.invalidHashes).toEqual([]);
  });
});

describe('quarantine', () => {
  it('moves orphan objects and stale temp files without deleting anything', async () => {
    const { dataDirectory, database } = setup();
    const validId = randomUUID();
    const orphanId = randomUUID();
    const valid = writeObject(dataDirectory, validId, 'keep-me');
    insertFile(database, validId, valid);
    const orphan = writeObject(dataDirectory, orphanId, 'orphan');
    mkdirSync(join(dataDirectory, 'tmp'), { recursive: true });
    const stale = join(dataDirectory, 'tmp', 'stale.part');
    writeFileSync(stale, 'stale');
    setFileAge(stale, 2 * DAY);

    const report = await inspectStorage(database, dataDirectory);
    const result = await quarantineStorage(dataDirectory, report, { database });

    expect(result.movedObjects).toHaveLength(1);
    expect(result.movedTempFiles).toHaveLength(1);
    expect(existsSync(orphan.path)).toBe(false);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(valid.path)).toBe(true);
    expect(statSync(valid.path).size).toBe(valid.size);

    const record = JSON.parse(readFileSync(join(result.quarantineDirectory, 'quarantine.json'), 'utf8')) as {
      movedObjects: string[];
      movedTempFiles: string[];
    };
    expect(record.movedObjects).toHaveLength(1);
    expect(record.movedTempFiles).toHaveLength(1);
    expect(existsSync(join(result.quarantineDirectory, record.movedObjects[0]))).toBe(true);
  });

  it('skips a file that gained a metadata row after the scan', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    const object = writeObject(dataDirectory, id, 'racing-orphan');

    const report = await inspectStorage(database, dataDirectory);
    expect(report.orphanObjects).toHaveLength(1);

    insertFile(database, id, object);
    const result = await quarantineStorage(dataDirectory, report, { database });

    expect(result.movedObjects).toHaveLength(0);
    expect(result.skipped.join(' ')).toMatch(/metadata row appeared/);
    expect(existsSync(object.path)).toBe(true);
  });

  it('does nothing when the store is clean', async () => {
    const { dataDirectory, database } = setup();
    const id = randomUUID();
    insertFile(database, id, writeObject(dataDirectory, id, 'clean'));

    const report = await inspectStorage(database, dataDirectory);
    const result = await quarantineStorage(dataDirectory, report, { database });

    expect(result.movedObjects).toEqual([]);
    expect(result.movedTempFiles).toEqual([]);
    expect(existsSync(result.quarantineDirectory)).toBe(true);
  });
});
