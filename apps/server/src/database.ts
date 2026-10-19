import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const MIGRATION_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

interface Migration {
  version: number;
  name: string;
  path: string;
}

function discoverMigrations(directory: string): Migration[] {
  const migrations = readdirSync(directory)
    .map((file) => {
      const match = MIGRATION_PATTERN.exec(file);
      if (!match) {
        if (file.endsWith('.sql')) throw new Error(`Invalid migration filename: ${file}`);
        return null;
      }
      return {
        version: Number(match[1]),
        name: match[2],
        path: join(directory, file),
      };
    })
    .filter((migration): migration is Migration => migration !== null)
    .sort((left, right) => left.version - right.version);

  for (let index = 0; index < migrations.length; index += 1) {
    if (migrations[index].version !== index + 1) {
      throw new Error(`Migration versions must be sequential starting at 001 (missing ${String(index + 1).padStart(3, '0')})`);
    }
  }
  return migrations;
}

export function applyMigrations(database: Database.Database, directory = migrationsDirectory): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const migrations = discoverMigrations(directory);
  const appliedRows = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as
    Array<{ version: number }>;
  for (let index = 0; index < appliedRows.length; index += 1) {
    if (appliedRows[index].version !== index + 1) {
      throw new Error(`Applied migration history is not sequential at version ${appliedRows[index].version}`);
    }
  }
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const latestApplied = Math.max(0, ...appliedVersions);
  const latestAvailable = migrations.at(-1)?.version ?? 0;
  if (latestApplied > latestAvailable) {
    throw new Error(`Database schema version ${latestApplied} is newer than the latest available migration ${latestAvailable}`);
  }

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    const sql = readFileSync(migration.path, 'utf8');
    const migrationName = migration.version === 1 && migration.name === 'initial'
      ? 'initial_auth_schema'
      : migration.name;
    const migrate = database.transaction(() => {
      database.exec(sql);
      database.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migrationName, Date.now());
    });
    migrate();
  }
}

export function openDatabase(filename: string): Database.Database {
  const database = new Database(filename);
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    if (filename !== ':memory:') {
      database.pragma('journal_mode = WAL');
    }
    applyMigrations(database);
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
