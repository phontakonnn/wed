import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBackup,
  resolveKeyRing,
  restoreBackup,
  selectBackupKey,
  verifyBackup,
} from './backup.js';
import { openDataDatabase, type SqliteDatabase } from './database.js';

const databases: SqliteDatabase[] = [];
const directories: string[] = [];
const ENV_NAMES = [
  'BACKUP_ENCRYPTION_KEY',
  'BACKUP_ENCRYPTION_KEY_ID',
  'BACKUP_ENCRYPTION_KEY_RING',
  'BACKUP_ENCRYPTION_REQUIRED',
] as const;
const savedEnv = new Map<string, string | undefined>();

function key(seed: number): string {
  return Buffer.alloc(32, seed).toString('base64');
}

function createDataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pkh-keys-'));
  directories.push(directory);
  return directory;
}

function openLiveDatabase(dataDirectory: string): SqliteDatabase {
  const database = openDataDatabase(dataDirectory);
  databases.push(database);
  return database;
}

function insertUser(database: SqliteDatabase, id: string): void {
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, id, 'test-hash', 1);
}

const objectId = 'ffffffff-6666-4666-8666-666666666666';

function writeObject(dataDirectory: string, content = 'key-ring-object'): string {
  const path = join(dataDirectory, 'objects', objectId.slice(0, 2), objectId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function readManifest(path: string) {
  return JSON.parse(readFileSync(`${path}.manifest.json`, 'utf8')) as {
    encryption?: { algorithm: string; formatVersion: number; keyId?: string };
    objects?: { encryption?: { algorithm: string; formatVersion: number; keyId?: string } };
  };
}

beforeEach(() => {
  for (const name of ENV_NAMES) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = savedEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Already closed.
    }
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('key ring resolution', () => {
  it('returns no key when nothing is configured', () => {
    const ring = resolveKeyRing(undefined, {});
    expect(ring.activeKey).toBeNull();
    expect(ring.activeKeyId).toBeNull();
    expect(ring.keys.size).toBe(0);
  });

  it('fails closed when encryption is required but no key exists', () => {
    expect(() => resolveKeyRing(undefined, { BACKUP_ENCRYPTION_REQUIRED: 'true' }))
      .toThrow(/BACKUP_ENCRYPTION_KEY is required/);
    expect(() => resolveKeyRing(undefined, {
      BACKUP_ENCRYPTION_REQUIRED: 'true',
      BACKUP_ENCRYPTION_KEY_RING: JSON.stringify({ old: key(1) }),
    })).toThrow(/BACKUP_ENCRYPTION_KEY is required/);
  });

  it('rejects malformed key material and key ids without echoing the secret', () => {
    const secret = 'not-a-valid-key-material';
    expect(() => resolveKeyRing(secret, {})).toThrow(/canonical base64/);
    try {
      resolveKeyRing(secret, {});
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
    expect(() => resolveKeyRing(key(1), { BACKUP_ENCRYPTION_KEY_ID: 'bad id!' }))
      .toThrow(/must match/);
    expect(() => resolveKeyRing(undefined, { BACKUP_ENCRYPTION_KEY_ID: 'orphan-id' }))
      .toThrow(/requires BACKUP_ENCRYPTION_KEY/);
  });

  it('rejects malformed rings and mismatched active entries', () => {
    expect(() => resolveKeyRing(undefined, { BACKUP_ENCRYPTION_KEY_RING: '{not json' }))
      .toThrow(/JSON object/);
    expect(() => resolveKeyRing(undefined, { BACKUP_ENCRYPTION_KEY_RING: '[]' }))
      .toThrow(/JSON object/);
    expect(() => resolveKeyRing(undefined, { BACKUP_ENCRYPTION_KEY_RING: JSON.stringify({ old: 5 }) }))
      .toThrow(/must be a base64 string/);
    expect(() => resolveKeyRing(key(1), {
      BACKUP_ENCRYPTION_KEY_ID: 'same-id',
      BACKUP_ENCRYPTION_KEY_RING: JSON.stringify({ 'same-id': key(2) }),
    })).toThrow(/does not match BACKUP_ENCRYPTION_KEY/);
  });

  it('registers the active key in the ring and selects by id only', () => {
    const ring = resolveKeyRing(key(1), {
      BACKUP_ENCRYPTION_KEY_ID: 'current',
      BACKUP_ENCRYPTION_KEY_RING: JSON.stringify({ old: key(2) }),
    });
    expect(ring.activeKeyId).toBe('current');
    expect([...ring.keys.keys()].sort()).toEqual(['current', 'old']);
    expect(selectBackupKey(ring, 'old')?.equals(Buffer.alloc(32, 2))).toBe(true);
    expect(selectBackupKey(ring, 'current')?.equals(Buffer.alloc(32, 1))).toBe(true);
    expect(selectBackupKey(ring, 'missing')).toBeNull();
    expect(selectBackupKey(ring, undefined)?.equals(Buffer.alloc(32, 1))).toBe(true);
  });

  it('accepts an explicit key override without an id', () => {
    const ring = resolveKeyRing(key(3), { BACKUP_ENCRYPTION_KEY_ID: undefined });
    expect(ring.activeKey?.equals(Buffer.alloc(32, 3))).toBe(true);
    expect(ring.activeKeyId).toBeNull();
  });
});

describe('key ids in backups', () => {
  function setupBackup() {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1');
    writeObject(dataDirectory);
    return { dataDirectory, database };
  }

  it('records the key id in the database and object manifests', async () => {
    const { dataDirectory, database } = setupBackup();
    process.env.BACKUP_ENCRYPTION_KEY = key(1);
    process.env.BACKUP_ENCRYPTION_KEY_ID = '2026-10';

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });
    const manifest = readManifest(backup.path);
    expect(manifest.encryption).toEqual({ algorithm: 'aes-256-gcm', formatVersion: 1, keyId: '2026-10' });
    expect(manifest.objects?.encryption).toEqual({
      algorithm: 'aes-256-gcm',
      formatVersion: 1,
      keyId: '2026-10',
    });
  });

  it('verifies an older backup through the key ring after rotation', async () => {
    const { dataDirectory, database } = setupBackup();
    process.env.BACKUP_ENCRYPTION_KEY = key(1);
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'old';
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    // Rotate: a new active key, old key retained only for decryption.
    process.env.BACKUP_ENCRYPTION_KEY = key(2);
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'new';
    process.env.BACKUP_ENCRYPTION_KEY_RING = JSON.stringify({ old: key(1) });

    const verified = await verifyBackup(backup.path);
    expect(verified.problems).toEqual([]);
    expect(verified.ok).toBe(true);

    rmSync(join(dataDirectory, 'objects', objectId.slice(0, 2), objectId));
    database.close();
    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory });
    expect(restored.objectsRestored).toBe(1);
    expect(readFileSync(join(dataDirectory, 'objects', objectId.slice(0, 2), objectId), 'utf8'))
      .toBe('key-ring-object');
  });

  it('fails with a key-id message when the ring does not contain the required key', async () => {
    const { dataDirectory, database } = setupBackup();
    process.env.BACKUP_ENCRYPTION_KEY = key(1);
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'old';
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    process.env.BACKUP_ENCRYPTION_KEY = key(2);
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'new';
    delete process.env.BACKUP_ENCRYPTION_KEY_RING;

    const verified = await verifyBackup(backup.path);
    expect(verified.ok).toBe(false);
    expect(verified.problems.join(' ')).toMatch(/No backup key is configured for key id old/);
    // No key material leaks into the result.
    expect(verified.problems.join(' ')).not.toContain(key(1));
    expect(verified.problems.join(' ')).not.toContain(key(2));
  });

  it('rejects a backup whose object key id differs from the database key id', async () => {
    const { dataDirectory, database } = setupBackup();
    process.env.BACKUP_ENCRYPTION_KEY = key(1);
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'same';
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    const manifest = JSON.parse(readFileSync(`${backup.path}.manifest.json`, 'utf8')) as {
      objects: { encryption: { keyId: string } };
    };
    manifest.objects.encryption.keyId = 'other';
    writeFileSync(`${backup.path}.manifest.json`, JSON.stringify(manifest), 'utf8');

    const verified = await verifyBackup(backup.path);
    expect(verified.ok).toBe(false);
    expect(verified.problems.join(' ')).toMatch(/different key ids/);
  });

  it('never writes key material into the manifest', async () => {
    const { dataDirectory, database } = setupBackup();
    const active = key(9);
    process.env.BACKUP_ENCRYPTION_KEY = active;
    process.env.BACKUP_ENCRYPTION_KEY_ID = 'audit';
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });
    const raw = readFileSync(`${backup.path}.manifest.json`, 'utf8');
    expect(raw).not.toContain(active);
    expect(raw).not.toContain(Buffer.alloc(32, 9).toString('hex'));
  });

  it('produces a random IV per object rather than reusing one', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLiveDatabase(dataDirectory);
    insertUser(database, 'user-1');
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    for (const id of ids) {
      const path = join(dataDirectory, 'objects', id.slice(0, 2), id);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `content-${id}`);
    }
    process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
    });

    const ivs = ids.map((id) =>
      readFileSync(join(backup.objectsPath as string, id.slice(0, 2), `${id}.enc`)).subarray(8, 20).toString('hex'));
    expect(ivs[0]).not.toBe(ivs[1]);
    expect(createHash('sha256').update(ivs.join('')).digest('hex')).not.toBe('');
  });
});
