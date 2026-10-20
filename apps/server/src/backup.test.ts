import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, listBackups, replaceFile, restoreBackup, verifyBackup } from './backup.js';
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
  it('preserves an existing destination when atomic rename fails', () => {
    const directory = createDataDirectory();
    const destination = join(directory, 'existing.backup');
    writeFileSync(destination, 'preserve this file');

    expect(() => replaceFile(join(directory, 'missing.partial'), destination)).toThrow();
    expect(readFileSync(destination, 'utf8')).toBe('preserve this file');
  });

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
    expect(manifest.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(manifest.integrityCheck).toBe('ok');

    const verification = await verifyBackup(backup.path);
    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it('encrypts backups and restore safety copies with authenticated AES-GCM', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    const key = Buffer.alloc(32, 23).toString('base64');
    const originalRequired = process.env.BACKUP_ENCRYPTION_REQUIRED;
    const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
    delete process.env.BACKUP_ENCRYPTION_REQUIRED;
    delete process.env.BACKUP_ENCRYPTION_KEY;

    try {
      const backup = await createBackup({
        database,
        backupDirectory: join(dataDirectory, 'backups'),
        encryptionKey: key,
      });
      const manifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as {
        encryption?: { algorithm: string; formatVersion: number };
      };
      expect(readFileSync(backup.path).subarray(0, 16).toString('utf8')).not.toContain('SQLite format 3');
      expect(manifest.encryption).toEqual({ algorithm: 'aes-256-gcm', formatVersion: 1 });
      expect((await verifyBackup(backup.path)).ok).toBe(false);
      expect((await verifyBackup(backup.path, { encryptionKey: Buffer.alloc(32, 24).toString('base64') })).ok)
        .toBe(false);
      expect((await verifyBackup(backup.path, { encryptionKey: key })).ok).toBe(true);

      database.close();
      const restored = await restoreBackup({ backupPath: backup.path, dataDirectory, encryptionKey: key });
      expect(readUsernames(restored.databasePath)).toEqual(['alice']);
      expect(restored.safetyCopyPath).not.toBeNull();
      if (!restored.safetyCopyPath) throw new Error('Expected a restore safety copy');
      expect((await verifyBackup(restored.safetyCopyPath, { encryptionKey: key })).ok).toBe(true);
    } finally {
      if (originalRequired === undefined) delete process.env.BACKUP_ENCRYPTION_REQUIRED;
      else process.env.BACKUP_ENCRYPTION_REQUIRED = originalRequired;
      if (originalKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
      else process.env.BACKUP_ENCRYPTION_KEY = originalKey;
    }
  });

  it('refuses plaintext backup creation when encryption is required but no key is configured', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    const backupDirectory = join(dataDirectory, 'backups');
    const originalRequired = process.env.BACKUP_ENCRYPTION_REQUIRED;
    const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_REQUIRED = 'true';
    delete process.env.BACKUP_ENCRYPTION_KEY;

    try {
      await expect(createBackup({ database, backupDirectory })).rejects.toThrow(/BACKUP_ENCRYPTION_KEY is required/);
      expect(existsSync(backupDirectory)).toBe(false);
    } finally {
      if (originalRequired === undefined) delete process.env.BACKUP_ENCRYPTION_REQUIRED;
      else process.env.BACKUP_ENCRYPTION_REQUIRED = originalRequired;
      if (originalKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
      else process.env.BACKUP_ENCRYPTION_KEY = originalKey;
    }
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

    expect(result.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
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

describe('object snapshots', () => {
  const objectId = 'aaaaaaaa-1111-4111-8111-111111111111';

  function writeObject(dataDirectory: string, content = 'file-bytes'): string {
    const path = join(dataDirectory, 'objects', objectId.slice(0, 2), objectId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  }

  it('captures stored objects and restores them together with the database', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    const objectPath = writeObject(dataDirectory);

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    expect(backup.manifest.objects).toMatchObject({ fileCount: 1, totalBytes: 10 });
    expect(backup.objectsPath).not.toBeNull();
    expect(existsSync(backup.objectsPath as string)).toBe(true);
    expect((await verifyBackup(backup.path)).ok).toBe(true);

    rmSync(objectPath);
    database.close();

    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory });
    expect(restored.objectsRestored).toBe(1);
    expect(restored.objectsSafetyPath).not.toBeNull();
    expect(readFileSync(objectPath, 'utf8')).toBe('file-bytes');
    expect(readUsernames(restored.databasePath)).toEqual(['alice']);
  });

  it('detects an object snapshot that changed after the backup was written', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    writeObject(dataDirectory);

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });
    // Same length, different bytes: only the tree hash can catch this.
    writeFileSync(join(backup.objectsPath as string, objectId.slice(0, 2), objectId), 'tamperedXX');

    const verification = await verifyBackup(backup.path);
    expect(verification.ok).toBe(false);
    // The per-file inventory reports the precise offending object, which is stricter than the
    // previous whole-tree message; either form proves the change was detected.
    expect(verification.problems.join(' ')).toMatch(/Stored object checksum mismatch|Object snapshot content does not match/);
  });

  it('makes the restore safety copy a complete rollback for database and files', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    const objectPath = writeObject(dataDirectory, 'original-bytes');

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    // Change the live object store before restoring, so the safety copy must capture it.
    rmSync(objectPath);
    const markerPath = join(dataDirectory, 'objects', 'zz', 'marker.txt');
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, 'pre-restore-marker');
    database.close();

    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory });
    expect(readFileSync(objectPath, 'utf8')).toBe('original-bytes');
    expect(existsSync(markerPath)).toBe(false);

    const safetyCopy = restored.safetyCopyPath as string;
    const safetyVerification = await verifyBackup(safetyCopy);
    expect(safetyVerification.ok).toBe(true);
    expect(safetyVerification.manifest?.objects?.fileCount).toBe(1);

    // One command rolls back both the database and the object store.
    const rollback = await restoreBackup({ backupPath: safetyCopy, dataDirectory });
    expect(readFileSync(markerPath, 'utf8')).toBe('pre-restore-marker');
    expect(existsSync(objectPath)).toBe(false);
    expect(rollback.objectsRestored).toBe(1);
  });

  it('prunes object snapshots together with the backups they belong to', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    writeObject(dataDirectory);
    const backupDirectory = join(dataDirectory, 'backups');

    const snapshots: string[] = [];
    for (const day of ['01', '02', '03']) {
      const backup = await createBackup({
        database,
        backupDirectory,
        dataDirectory,
        keep: 10,
        now: new Date(`2026-10-${day}T00:00:00.000Z`),
      });
      snapshots.push(backup.objectsPath as string);
    }

    await createBackup({
      database,
      backupDirectory,
      dataDirectory,
      keep: 2,
      now: new Date('2026-10-04T00:00:00.000Z'),
    });

    expect(existsSync(snapshots[0])).toBe(false);
    expect(existsSync(snapshots[1])).toBe(false);
    expect(existsSync(snapshots[2])).toBe(true);
  });

  it('omits objects when no data directory is supplied', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    writeObject(dataDirectory);

    const backup = await createBackup({ database, backupDirectory: join(dataDirectory, 'backups') });

    expect(backup.manifest.objects).toBeUndefined();
    expect(backup.objectsPath).toBeNull();
    expect((await verifyBackup(backup.path)).ok).toBe(true);
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

describe('encrypted object snapshots', () => {
  const objectId = 'bbbbbbbb-2222-4222-8222-222222222222';
  const key = Buffer.alloc(32, 41).toString('base64');
  const wrongKey = Buffer.alloc(32, 42).toString('base64');

  function writeObject(dataDirectory: string, content = 'secret-file-bytes'): string {
    const path = join(dataDirectory, 'objects', objectId.slice(0, 2), objectId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  }

  function readManifest(path: string) {
    return JSON.parse(readFileSync(`${path}.manifest.json`, 'utf8')) as {
      encryption?: { algorithm: string; formatVersion: number };
      objects?: {
        directory: string;
        formatVersion?: number;
        fileCount: number;
        totalBytes: number;
        treeSha256: string;
        encryption?: { algorithm: string; formatVersion: number };
        files?: Array<{
          path: string;
          sizeBytes: number;
          sha256: string;
          storedPath: string;
          storedSizeBytes: number;
          storedSha256: string;
        }>;
      };
    };
  }

  function writeManifest(path: string, manifest: unknown): void {
    writeFileSync(`${path}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  function listFilesRecursive(root: string, prefix = ''): string[] {
    const entries = readdirSync(join(root, prefix), { withFileTypes: true });
    return entries.flatMap((entry) => {
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFilesRecursive(root, child) : [child];
    });
  }

  function recomputeTreeHash(manifest: ReturnType<typeof readManifest>): string {
    const hash = createHash('sha256');
    const files = [...(manifest.objects?.files ?? [])].sort((left, right) =>
      left.storedPath.localeCompare(right.storedPath));
    for (const entry of files) {
      hash.update(`${entry.storedPath}\n${entry.storedSizeBytes}\n${entry.storedSha256}\n`);
    }
    return hash.digest('hex');
  }

  async function createEncryptedBackup() {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    writeObject(dataDirectory);
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
      encryptionKey: key,
    });
    return { dataDirectory, database, backup };
  }

  beforeEach(() => {
    delete process.env.BACKUP_ENCRYPTION_REQUIRED;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  it('encrypts every object and verifies the whole set with the key', async () => {
    const { backup } = await createEncryptedBackup();
    const manifest = readManifest(backup.path);

    expect(manifest.encryption).toEqual({ algorithm: 'aes-256-gcm', formatVersion: 1 });
    expect(manifest.objects?.encryption).toEqual({ algorithm: 'aes-256-gcm', formatVersion: 1 });
    expect(manifest.objects?.formatVersion).toBe(2);
    expect(manifest.objects?.fileCount).toBe(1);

    const storedPath = join(backup.objectsPath as string, objectId.slice(0, 2), `${objectId}.enc`);
    expect(existsSync(storedPath)).toBe(true);
    const stored = readFileSync(storedPath);
    expect(stored.subarray(0, 8).toString('latin1')).toBe('PKHBAK01');
    expect(stored.includes(Buffer.from('secret-file-bytes'))).toBe(false);

    const verified = await verifyBackup(backup.path, { encryptionKey: key });
    expect(verified.problems).toEqual([]);
    expect(verified.ok).toBe(true);

    const noKey = await verifyBackup(backup.path);
    expect(noKey.ok).toBe(false);
    expect(noKey.problems.join(' ')).toMatch(/encrypted/i);

    const badKey = await verifyBackup(backup.path, { encryptionKey: wrongKey });
    expect(badKey.ok).toBe(false);
    expect(badKey.problems.join(' ')).toMatch(/authentication failed|Cannot decrypt/i);
  });

  it('restores encrypted objects and rejects a wrong key before touching the store', async () => {
    const { dataDirectory, database, backup } = await createEncryptedBackup();
    const objectPath = join(dataDirectory, 'objects', objectId.slice(0, 2), objectId);
    const original = readFileSync(objectPath);
    rmSync(objectPath);
    database.close();

    await expect(
      restoreBackup({ backupPath: backup.path, dataDirectory, encryptionKey: wrongKey }),
    ).rejects.toThrow(/failed verification/i);
    expect(existsSync(objectPath)).toBe(false);

    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory, encryptionKey: key });
    expect(restored.objectsRestored).toBe(1);
    expect(readFileSync(objectPath)).toEqual(original);
  });

  it('detects a tampered ciphertext through the GCM tag', async () => {
    const { backup } = await createEncryptedBackup();
    const storedPath = join(backup.objectsPath as string, objectId.slice(0, 2), `${objectId}.enc`);
    const stored = readFileSync(storedPath);
    stored[20] = stored[20] ^ 0xff;
    writeFileSync(storedPath, stored);

    const manifest = readManifest(backup.path);
    const entry = manifest.objects?.files?.[0];
    if (!entry) throw new Error('Expected an object inventory entry');
    entry.storedSizeBytes = statSync(storedPath).size;
    entry.storedSha256 = createHash('sha256').update(stored).digest('hex');
    if (manifest.objects) manifest.objects.treeSha256 = recomputeTreeHash(manifest);
    writeManifest(backup.path, manifest);

    const verification = await verifyBackup(backup.path, { encryptionKey: key });
    expect(verification.ok).toBe(false);
    expect(verification.problems.join(' ')).toMatch(/authentication failed|Cannot decrypt/i);
  });

  it('detects a truncated encrypted object', async () => {
    const { backup } = await createEncryptedBackup();
    const storedPath = join(backup.objectsPath as string, objectId.slice(0, 2), `${objectId}.enc`);
    const stored = readFileSync(storedPath);
    writeFileSync(storedPath, stored.subarray(0, stored.length - 4));

    const verification = await verifyBackup(backup.path, { encryptionKey: key });
    expect(verification.ok).toBe(false);
    expect(verification.problems.join(' ')).toMatch(/size mismatch/i);
  });

  it('detects a manifest that no longer matches the decrypted object', async () => {
    const { backup } = await createEncryptedBackup();
    const manifest = readManifest(backup.path);
    const entry = manifest.objects?.files?.[0];
    if (!entry) throw new Error('Expected an object inventory entry');
    entry.sha256 = 'f'.repeat(64);
    writeManifest(backup.path, manifest);

    const verification = await verifyBackup(backup.path, { encryptionKey: key });
    expect(verification.ok).toBe(false);
    expect(verification.problems.join(' ')).toMatch(/Decrypted object does not match/);
  });

  it('detects missing and unexpected files in the snapshot', async () => {
    const { backup } = await createEncryptedBackup();
    const root = backup.objectsPath as string;

    writeFileSync(join(root, 'unexpected.bin'), 'not part of the backup');
    const withExtra = await verifyBackup(backup.path, { encryptionKey: key });
    expect(withExtra.ok).toBe(false);
    expect(withExtra.problems.join(' ')).toMatch(/unexpected file/i);

    rmSync(join(root, 'unexpected.bin'));
    rmSync(join(root, objectId.slice(0, 2), `${objectId}.enc`));
    const withMissing = await verifyBackup(backup.path, { encryptionKey: key });
    expect(withMissing.ok).toBe(false);
    expect(withMissing.problems.join(' ')).toMatch(/missing from the snapshot/i);
  });

  it('refuses a backup whose database references a file with no object', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    database.prepare(`
      INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cccccccc-3333-4333-8333-333333333333', 'user-1', 'lost.png', 10, 'c'.repeat(64), 'image/png', 'cccccccc-3333-4333-8333-333333333333', Date.now());

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
      encryptionKey: key,
    });
    const verification = await verifyBackup(backup.path, { encryptionKey: key });
    expect(verification.ok).toBe(false);
    expect(verification.problems.join(' ')).toMatch(/no object snapshot|no object in the snapshot/i);
  });

  it('still verifies a legacy plaintext manifest without an inventory', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1', 'alice');
    writeObject(dataDirectory);
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    const manifest = readManifest(backup.path);
    if (!manifest.objects) throw new Error('Expected an object snapshot');
    delete manifest.objects.formatVersion;
    delete manifest.objects.files;
    writeManifest(backup.path, manifest);

    const verification = await verifyBackup(backup.path);
    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it('keeps the restore safety copy encrypted and fully rollback-capable', async () => {
    const { dataDirectory, database, backup } = await createEncryptedBackup();
    const objectPath = join(dataDirectory, 'objects', objectId.slice(0, 2), objectId);

    // Replace the live object so the pre-restore state differs from the backup.
    writeFileSync(objectPath, 'pre-restore-plaintext');
    database.close();

    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory, encryptionKey: key });
    const safetyCopy = restored.safetyCopyPath as string;
    const safetyManifest = readManifest(safetyCopy);
    expect(safetyManifest.objects?.encryption).toEqual({ algorithm: 'aes-256-gcm', formatVersion: 1 });
    expect(safetyManifest.objects?.formatVersion).toBe(2);

    const safetyObjects = join(dirname(safetyCopy), safetyManifest.objects?.directory ?? '');
    const storedFiles = listFilesRecursive(safetyObjects);
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0].endsWith('.enc')).toBe(true);
    expect(readFileSync(join(safetyObjects, storedFiles[0])).includes(Buffer.from('pre-restore-plaintext'))).toBe(false);

    const verification = await verifyBackup(safetyCopy, { encryptionKey: key });
    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);

    // One command rolls back both halves of the safety copy.
    await restoreBackup({ backupPath: safetyCopy, dataDirectory, encryptionKey: key });
    expect(readFileSync(objectPath, 'utf8')).toBe('pre-restore-plaintext');
  });

  it('does not create upload scratch files during verification', async () => {
    const { dataDirectory, backup } = await createEncryptedBackup();
    const tmpDirectory = join(dataDirectory, 'tmp');
    rmSync(tmpDirectory, { recursive: true, force: true });

    expect((await verifyBackup(backup.path, { encryptionKey: key })).ok).toBe(true);
    expect(existsSync(tmpDirectory)).toBe(false);
  });
});
