import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations, inTransaction, openDatabase, type SqliteDatabase } from './database.js';

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
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()).toEqual({ name: 'sessions' });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'notes_fts'").get())
      .toEqual({ name: 'notes_fts' });
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

  it('applies later migrations without changing previously stored rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-migration-test-'));
    temporaryDirectories.push(directory);
    const migrationDirectory = join(directory, 'migrations');
    mkdirSync(migrationDirectory);
    writeFileSync(join(migrationDirectory, '001_initial.sql'), `
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL);
    `);
    const database = new Database(':memory:');

    applyMigrations(database, migrationDirectory);
    database.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('existing-user', 'admin');
    writeFileSync(join(migrationDirectory, '002_notes.sql'), `
      CREATE TABLE notes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
    `);

    applyMigrations(database, migrationDirectory);

    expect(database.prepare('SELECT id, username FROM users').all()).toEqual([
      { id: 'existing-user', username: 'admin' },
    ]);
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }]);
    database.close();
  });

  it('rejects missing migration versions before applying any migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-migration-gap-test-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, '001_initial.sql'), 'CREATE TABLE first_migration (id INTEGER);');
    writeFileSync(join(directory, '003_later.sql'), 'CREATE TABLE third_migration (id INTEGER);');
    const database = new Database(':memory:');

    expect(() => applyMigrations(database, directory)).toThrow(/sequential/);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'first_migration'").get())
      .toBeUndefined();
    database.close();
  });

  it('rolls back a migration that fails before recording its version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-migration-rollback-test-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, '001_initial.sql'), `
      CREATE TABLE migration_probe (id INTEGER);
      THIS IS NOT VALID SQL;
    `);
    const database = new Database(':memory:');

    expect(() => applyMigrations(database, directory)).toThrow();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_probe'").get())
      .toBeUndefined();
    expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual([]);
    database.close();
  });
});
