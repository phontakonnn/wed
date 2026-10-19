import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup, listBackups, restoreBackup, verifyBackup } from './backup.js';
import { openDataDatabase, type SqliteDatabase } from './database.js';

const databases: SqliteDatabase[] = [];
const directories: string[] = [];

function createDataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pkh-backup-'));
  directories.push(directory);
  return directory;
}

function openLiveDatabase(dataDirectory: string): SqliteDatabase {
  const database = openDataDatabase(dataDirectory);
  databases.push(database);
  return database;
}

function insertUser(database: SqliteDatabase, id: string, username: string): void {
  database
    .prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, 'scrypt$test$placeholder', Date.now());
}

function readUsernames(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare('SELECT username FROM users ORDER BY username').all() as Array<{ username: string }>)
      .map((row) => row.username);
  } finally {
    database.close();
  }
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Already closed by the test.
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('backup', () => {
  it('captures writes that are still only in the WAL file', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');

    expect(existsSync(join(dataDirectory, 'db', 'knowledge.sqlite3-wal'))).toBe(true);

    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });

    // A naive copy of knowledge.sqlite3 would miss this row.
    expect(readUsernames(backup.path)).toEqual(['alice']);
  });

  it('writes a manifest whose size and checksum match the backup file', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');

    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });
    const manifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as {
      formatVersion: number;
      sizeBytes: number;
      sha256: string;
      schemaVersions: number[];
      integrityCheck: string;
    };

    expect(manifest.formatVersion).toBe(1);
    expect(manifest.sizeBytes).toBe(statSync(backup.path).size);
    expect(manifest.sha256).toBe(createHash('sha256').update(readFileSync(backup.path)).digest('hex'));
    expect(manifest.schemaVersions).toEqual([1, 2, 3]);
    expect(manifest.integrityCheck).toBe('ok');

    const verification = await verifyBackup(backup.path);
    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it('detects a backup that changed after it was written', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });

    appendFileSync(backup.path, Buffer.from([0x00]));

    const verification = await verifyBackup(backup.path);
    expect(verification.ok).toBe(false);
    expect(verification.problems.join(' ')).toMatch(/SHA-256 mismatch/);
  });
});

describe('restore', () => {
  it('restores a backup over the live database and keeps a verified safety copy', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');

    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });

    database.prepare('DELETE FROM users').run();
    insertUser(database, 'user-2', 'bob');
    database.close();

    const result = await restoreBackup({ backupPath: backup.path, dataDirectory });

    expect(result.schemaVersions).toEqual([1, 2, 3]);
    expect(readUsernames(result.databasePath)).toEqual(['alice']);
    expect(result.safetyCopyPath).not.toBeNull();
    expect(existsSync(result.safetyCopyPath as string)).toBe(true);

    const safetyVerification = await verifyBackup(result.safetyCopyPath as string);
    expect(safetyVerification.problems).toEqual([]);
    expect(safetyVerification.ok).toBe(true);

    // The safety copy must be restorable by the same CLI, otherwise a bad restore cannot be undone.
    const rollback = await restoreBackup({ backupPath: result.safetyCopyPath as string, dataDirectory });
    expect(readUsernames(rollback.databasePath)).toEqual(['bob']);
  });

  it('refuses to restore while the database still has an open connection', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });

    await expect(restoreBackup({ backupPath: backup.path, dataDirectory })).rejects.toThrow(/in use/i);
    expect(readUsernames(backup.path)).toEqual([]);
  });

  it('refuses a backup whose manifest is missing', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });
    rmSync(backup.manifestPath);

    const verification = await verifyBackup(backup.path);
    expect(verification.ok).toBe(false);
    expect(verification.problems).toContain('Manifest is missing');

    await expect(restoreBackup({ backupPath: backup.path, dataDirectory })).rejects.toThrow(/failed verification/i);
  });
});

describe('retention', () => {
  it('keeps the newest backups and leaves unrelated files alone', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    const backupDirectory = join(dataDirectory, 'backups');

    for (const day of ['01', '02', '03']) {
      await createBackup({
        database,
        backupDirectory,
        keep: 10,
        now: new Date(`2026-10-${day}T00:00:00.000Z`),
      });
    }

    const unrelated = join(backupDirectory, 'notes.txt');
    writeFileSync(unrelated, 'keep me');
    expect(listBackups(backupDirectory)).toHaveLength(3);

    const result = await createBackup({
      database,
      backupDirectory,
      keep: 2,
      now: new Date('2026-10-04T00:00:00.000Z'),
    });

    expect(result.pruned).toHaveLength(2);
    expect(listBackups(backupDirectory)).toHaveLength(2);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(result.path)).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);
  });
});
