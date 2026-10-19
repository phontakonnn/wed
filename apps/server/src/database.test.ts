import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inTransaction, openDatabase, type SqliteDatabase } from './database.js';

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

function createDatabase(filename = ':memory:') {
  const database = openDatabase(filename);
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite setup', () => {
  it('applies the versioned schema and enables foreign keys', () => {
    const database = createDatabase();

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()).toEqual({ name: 'sessions' });
  });

  it('uses WAL mode for file-backed databases', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-db-test-'));
    temporaryDirectories.push(directory);
    const database = createDatabase(join(directory, 'test.db'));

    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(database.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('rolls back a failed transaction', () => {
    const database = createDatabase();
    database.exec('CREATE TABLE transaction_probe (value INTEGER NOT NULL)');

    expect(() => inTransaction(database, () => {
      database.prepare('INSERT INTO transaction_probe (value) VALUES (?)').run(1);
      throw new Error('force rollback');
    })).toThrow('force rollback');
    expect(database.prepare('SELECT value FROM transaction_probe').all()).toEqual([]);
  });
});
