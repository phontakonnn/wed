import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const initialMigrationPath = fileURLToPath(new URL('../migrations/001_initial.sql', import.meta.url));
const initialMigration = readFileSync(initialMigrationPath, 'utf8');

export function openDatabase(filename: string): Database.Database {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') {
    database.pragma('journal_mode = WAL');
  }

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const applied = database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(1);
    if (!applied) {
      const migrate = database.transaction(() => {
        database.exec(initialMigration);
        database.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        ).run(1, 'initial_auth_schema', Date.now());
      });
      migrate();
    }

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function openDataDatabase(dataDirectory: string): Database.Database {
  if (!isAbsolute(dataDirectory)) {
    throw new Error('DATA_DIR must be an absolute path');
  }
  const root = resolve(dataDirectory);
  const databaseDirectory = join(root, 'db');
  mkdirSync(databaseDirectory, { recursive: true });
  return openDatabase(join(databaseDirectory, 'knowledge.sqlite3'));
}

export function inTransaction<T>(database: Database.Database, operation: () => T): T {
  return database.transaction(operation)();
}

export type SqliteDatabase = Database.Database;
