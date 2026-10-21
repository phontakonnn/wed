import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { verifyBackup } from './backup.js';
import { applyMigrations, type SqliteDatabase } from './database.js';
import { openDataDatabaseSafely } from './safe-open.js';

const databases: SqliteDatabase[] = [];
const directories: string[] = [];

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function createPriorSchemaDatabase(dataDirectory: string): string {
  const databaseDirectory = join(dataDirectory, 'db');
  const oldMigrationsDirectory = join(dataDirectory, 'old-migrations');
  mkdirSync(databaseDirectory);
  mkdirSync(oldMigrationsDirectory);
  for (const migration of ['001_initial.sql', '002_notes.sql']) {
    copyFileSync(new URL(`../migrations/${migration}`, import.meta.url), join(oldMigrationsDirectory, migration));
  }

  const databasePath = join(databaseDirectory, 'knowledge.sqlite3');
  const prior = new Database(databasePath);
  prior.pragma('foreign_keys = ON');
  applyMigrations(prior, oldMigrationsDirectory);
  prior.prepare(`
    INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)
  `).run('safe-owner', 'safe-owner', 'test-hash', Date.now());
  prior.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('prior-note', 'safe-owner', 'Before migration', 'Preserve this record', 1, 1);
  prior.close();
  return databasePath;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('safe database startup', () => {
  it('verifies a pre-migration backup before applying pending migrations to existing user data', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-safe-open-'));
    directories.push(dataDirectory);
    createPriorSchemaDatabase(dataDirectory);

    const result = await openDataDatabaseSafely(dataDirectory);
    databases.push(result.database);

    expect(result.preMigrationBackupPath).not.toBeNull();
    if (!result.preMigrationBackupPath) throw new Error('Expected a pre-migration backup');
    const verification = await verifyBackup(result.preMigrationBackupPath);
    expect(verification.ok).toBe(true);
    expect(verification.manifest?.schemaVersions).toEqual([1, 2]);
    expect(result.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([
        { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 },
        { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 },
        { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 },
      ]);
    expect(result.database.prepare('SELECT content FROM notes WHERE id = ?').get('prior-note'))
      .toEqual({ content: 'Preserve this record' });
  });

  it('upgrades a schema-8 data directory to the latest schema without losing Life OS rows', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-safe-open-v8-'));
    directories.push(dataDirectory);
    const databaseDirectory = join(dataDirectory, 'db');
    const v8Migrations = join(dataDirectory, 'v8-migrations');
    mkdirSync(databaseDirectory);
    mkdirSync(v8Migrations);
    for (const migration of [
      '001_initial.sql',
      '002_notes.sql',
      '003_notes_search.sql',
      '004_bookmarks.sql',
      '005_categories_tags.sql',
      '006_favorites.sql',
      '007_files.sql',
      '008_life_os_people_and_schedule.sql',
    ]) {
      copyFileSync(new URL(`../migrations/${migration}`, import.meta.url), join(v8Migrations, migration));
    }

    const prior = new Database(join(databaseDirectory, 'knowledge.sqlite3'));
    prior.pragma('foreign_keys = ON');
    prior.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    applyMigrations(prior, v8Migrations);
    expect(prior.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 8 });

    const now = Date.now();
    prior.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('v8-owner', 'v8-owner', 'test-hash', now);
    prior.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('v8-note', 'v8-owner', 'โน้ตก่อนอัปเกรด', 'ต้องอยู่ต่อหลัง migration', now, now);
    prior.prepare(`
      INSERT INTO people (id, owner_id, name, relationship_group, role_label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('v8-person', 'v8-owner', 'คุณยาย', 'family', 'คุณยาย', now, now);
    prior.prepare(`
      INSERT INTO reminders (id, owner_id, title, target_date, category, linked_person_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('v8-reminder', 'v8-owner', 'วันเกิดคุณยาย', '2026-11-01', 'birthday', 'v8-person', now, now);
    prior.prepare(`
      INSERT INTO habits (id, owner_id, title, current_count, daily_target, unit, streak_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('v8-habit', 'v8-owner', 'เดิน 30 นาที', 2, 1, 'ครั้ง', 3, now, now);
    // A habit that was checked today: its counter is evidence for today, so the migration must turn
    // it into today's log AND keep the counter consistent with that log.
    prior.prepare(`
      INSERT INTO habits (id, owner_id, title, current_count, daily_target, unit, streak_days,
        last_checked_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('v8-habit-today', 'v8-owner', 'ดื่มน้ำ', 3, 8, 'แก้ว', 5, todayIso(), now, now);
    prior.close();

    const result = await openDataDatabaseSafely(dataDirectory);
    databases.push(result.database);

    expect(result.preMigrationBackupPath).not.toBeNull();
    if (!result.preMigrationBackupPath) throw new Error('Expected a pre-migration backup');
    const verification = await verifyBackup(result.preMigrationBackupPath);
    expect(verification.ok).toBe(true);
    expect(verification.manifest?.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get())
      .toEqual({ version: 14 });
    // Existing rows survive untouched.
    expect(result.database.prepare('SELECT title, content FROM notes WHERE id = ?').get('v8-note'))
      .toEqual({ title: 'โน้ตก่อนอัปเกรด', content: 'ต้องอยู่ต่อหลัง migration' });
    expect(result.database.prepare('SELECT name FROM people WHERE id = ?').get('v8-person'))
      .toEqual({ name: 'คุณยาย' });
    expect(result.database.prepare('SELECT linked_person_id AS personId FROM reminders WHERE id = ?').get('v8-reminder'))
      .toEqual({ personId: 'v8-person' });
    // Batch 3 moves the counters into history: the old values are preserved as legacy fields, the
    // live counters restart from logs, and no log is invented for a day the system never observed.
    expect(result.database.prepare(`
      SELECT current_count AS count, streak_days AS streak,
        legacy_current_count AS legacyCount, legacy_streak_days AS legacyStreak,
        tracking_start_date AS trackingStart
      FROM habits WHERE id = ?`).get('v8-habit')).toMatchObject({
      count: 0,
      streak: 0,
      legacyCount: 2,
      legacyStreak: 3,
    });
    expect(result.database.prepare('SELECT COUNT(*) AS count FROM habit_logs').get()).toEqual({ count: 1 });
    expect(result.database.prepare(`
      SELECT log_date AS logDate, count, target_snapshot AS target FROM habit_logs WHERE habit_id = ?
    `).get('v8-habit-today')).toEqual({ logDate: todayIso(), count: 3, target: 8 });
    // The counter must agree with the log, not stay at zero.
    expect(result.database.prepare(`
      SELECT current_count AS count, streak_days AS streak, legacy_streak_days AS legacyStreak
      FROM habits WHERE id = ?
    `).get('v8-habit-today')).toEqual({ count: 3, streak: 0, legacyStreak: 5 });
    // The new tables exist and are usable immediately.
    result.database.prepare(`
      INSERT INTO tasks (id, owner_id, title, person_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('v8-task', 'v8-owner', 'โทรหาคุณยาย', 'v8-person', now, now);
    expect(result.database.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
    expect(result.database.prepare('SELECT COUNT(*) AS count FROM inbox_items').get()).toEqual({ count: 0 });
  });

  it('does not migrate existing user data if a pre-migration backup cannot be created', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-safe-open-fail-'));
    directories.push(dataDirectory);
    const databasePath = createPriorSchemaDatabase(dataDirectory);
    const backupPath = join(dataDirectory, 'backup-is-a-file');
    writeFileSync(backupPath, 'not a directory');
    const originalBackupDirectory = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = backupPath;

    try {
      await expect(openDataDatabaseSafely(dataDirectory)).rejects.toThrow();
    } finally {
      if (originalBackupDirectory === undefined) delete process.env.BACKUP_DIR;
      else process.env.BACKUP_DIR = originalBackupDirectory;
    }

    const unchanged = new Database(databasePath, { readonly: true });
    try {
      expect(unchanged.pragma('journal_mode', { simple: true })).toBe('delete');
      expect(unchanged.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
        .toEqual([{ version: 1 }, { version: 2 }]);
      expect(unchanged.prepare('SELECT content FROM notes WHERE id = ?').get('prior-note'))
        .toEqual({ content: 'Preserve this record' });
    } finally {
      unchanged.close();
    }
  });

  // Migration 012 rebuilds `entity_files` to widen its CHECK constraint. A rebuild that copies
  // nothing would silently drop every existing attachment, so this proves the rows survive.
  it('keeps existing file links when a populated schema-11 directory upgrades to 12', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-safe-open-v11-'));
    directories.push(dataDirectory);
    const databaseDirectory = join(dataDirectory, 'db');
    const oldMigrationsDirectory = join(dataDirectory, 'v11-migrations');
    mkdirSync(databaseDirectory);
    mkdirSync(oldMigrationsDirectory);
    for (const migration of [
      '001_initial.sql', '002_notes.sql', '003_notes_search.sql', '004_bookmarks.sql',
      '005_categories_tags.sql', '006_favorites.sql', '007_files.sql',
      '008_life_os_people_and_schedule.sql', '009_work_core.sql',
      '010_habit_logs_and_reminder_recurrence.sql', '011_entity_files.sql',
    ]) {
      copyFileSync(new URL(`../migrations/${migration}`, import.meta.url), join(oldMigrationsDirectory, migration));
    }

    const prior = new Database(join(databaseDirectory, 'knowledge.sqlite3'));
    prior.pragma('foreign_keys = ON');
    prior.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    applyMigrations(prior, oldMigrationsDirectory);
    const now = Date.now();
    prior.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('v11-owner', 'v11-owner', 'test-hash', now);
    prior.prepare('INSERT INTO notes (id, owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('v11-note', 'v11-owner', 'โน้ตก่อนอัปเกรด', 'ต้องอยู่ต่อ', now, now);
    prior.prepare(`
      INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('v11-file', 'v11-owner', 'policy.pdf', 10, 'b'.repeat(64), 'application/pdf', 'v11-file', now);
    // The pre-migration backup verifies the object snapshot, so the bytes must exist too.
    mkdirSync(join(dataDirectory, 'objects', 'v1'), { recursive: true });
    writeFileSync(join(dataDirectory, 'objects', 'v1', 'v11-file'), 'pdf-bytes!');
    prior.prepare(`
      INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
      VALUES (?, ?, 'note', ?, ?, ?)
    `).run('v11-link', 'v11-owner', 'v11-note', 'v11-file', now);
    prior.close();

    const result = await openDataDatabaseSafely(dataDirectory);
    databases.push(result.database);

    expect(result.preMigrationBackupPath).not.toBeNull();
    if (!result.preMigrationBackupPath) throw new Error('Expected a pre-migration backup');
    const verification = await verifyBackup(result.preMigrationBackupPath);
    expect(verification.ok).toBe(true);
    expect(verification.manifest?.schemaVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    expect(result.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get())
      .toEqual({ version: 14 });
    expect(result.database.prepare('SELECT entity_type, entity_id, file_id FROM entity_files').all())
      .toEqual([{ entity_type: 'note', entity_id: 'v11-note', file_id: 'v11-file' }]);

    // The widened CHECK now accepts the two new entity types, and the trigger still validates ids.
    expect(result.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('vault_items', 'library_items') ORDER BY name").all())
      .toEqual([{ name: 'library_items' }, { name: 'vault_items' }]);
    expect(result.database.prepare('SELECT COUNT(*) AS count FROM vault_items').get()).toEqual({ count: 0 });
    result.database.prepare(`
      INSERT INTO vault_items (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).run('v12-vault', 'v11-owner', 'กรมธรรม์', now, now);
    expect(() => result.database.prepare(`
      INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
      VALUES (?, ?, 'vault', ?, ?, ?)
    `).run('v12-link', 'v11-owner', 'v12-vault', 'v11-file', now)).not.toThrow();
    expect(() => result.database.prepare(`
      INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
      VALUES (?, ?, 'vault', ?, ?, ?)
    `).run('v12-bad-link', 'v11-owner', 'missing-vault', 'v11-file', now)).toThrow(/owner mismatch/);
  });
});
