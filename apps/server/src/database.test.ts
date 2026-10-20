import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      .toEqual([
        { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 },
        { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 },
        { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 },
      ]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()).toEqual({ name: 'sessions' });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'notes_fts'").get())
      .toEqual({ name: 'notes_fts' });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'notes_fts_trigram'").get())
      .toEqual({ name: 'notes_fts_trigram' });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'bookmarks'").get())
      .toEqual({ name: 'bookmarks' });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'categories'").get())
      .toEqual({ name: 'categories' });
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

  it('backfills active existing notes and keeps the trigram index in sync on migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-search-migration-test-'));
    temporaryDirectories.push(directory);
    const migrationDirectory = join(directory, 'migrations');
    const priorMigrationDirectory = join(directory, 'prior-migrations');
    mkdirSync(migrationDirectory);
    mkdirSync(priorMigrationDirectory);
    for (const file of ['001_initial.sql', '002_notes.sql', '003_notes_search.sql']) {
      copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(migrationDirectory, file));
      if (file !== '003_notes_search.sql') {
        copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(priorMigrationDirectory, file));
      }
    }
    const database = new Database(':memory:');
    database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    applyMigrations(database, priorMigrationDirectory);
    database.prepare(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)
    `).run('search-owner', 'search-owner', 'test-hash', Date.now());
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('existing-active', 'search-owner', 'NFD title', 'Cafe\u0301 in existing note', 1, 1, null);
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('existing-trash', 'search-owner', 'Deleted note', 'Café hidden', 1, 1, 1);

    applyMigrations(database, migrationDirectory);

    const trigramSearch = database.prepare(`
      SELECT note_id FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ?
    `);
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    expect(trigramSearch.all('"Café"')).toEqual([{ note_id: 'existing-active' }]);
    expect(trigramSearch.all('"hidden"')).toEqual([]);

    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('after-migration', 'search-owner', 'Fresh', 'Original phrase', 2, 2);
    expect(trigramSearch.all('"Original phrase"')).toEqual([{ note_id: 'after-migration' }]);

    database.prepare('UPDATE notes SET content = ? WHERE id = ?')
      .run('Changed phrase', 'after-migration');
    expect(trigramSearch.all('"Original phrase"')).toEqual([]);
    expect(trigramSearch.all('"Changed phrase"')).toEqual([{ note_id: 'after-migration' }]);

    database.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(3, 'after-migration');
    expect(trigramSearch.all('"Changed phrase"')).toEqual([]);
    database.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run('after-migration');
    expect(trigramSearch.all('"Changed phrase"')).toEqual([{ note_id: 'after-migration' }]);
    database.prepare('DELETE FROM notes WHERE id = ?').run('after-migration');
    expect(trigramSearch.all('"Changed phrase"')).toEqual([]);
    database.close();
  });

  it('adds bookmarks without changing existing user and note rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-bookmarks-migration-test-'));
    temporaryDirectories.push(directory);
    const currentMigrations = join(directory, 'current');
    const priorMigrations = join(directory, 'prior');
    mkdirSync(currentMigrations);
    mkdirSync(priorMigrations);
    const files = ['001_initial.sql', '002_notes.sql', '003_notes_search.sql', '004_bookmarks.sql'];
    for (const file of files) {
      copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(currentMigrations, file));
      if (file !== '004_bookmarks.sql') {
        copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(priorMigrations, file));
      }
    }
    const database = new Database(':memory:');
    database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    applyMigrations(database, priorMigrations);
    database.prepare(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)
    `).run('bookmark-owner', 'bookmark-owner', 'test-hash', 1);
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('old-note', 'bookmark-owner', 'Existing', 'Keep this note', 1, 1);

    applyMigrations(database, currentMigrations);

    expect(database.prepare('SELECT title, content FROM notes WHERE id = ?').get('old-note'))
      .toEqual({ title: 'Existing', content: 'Keep this note' });
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
    expect(database.prepare("PRAGMA foreign_key_list('bookmarks')").all()).toHaveLength(1);
    database.close();
  });

  it('adds categories, tags and owner-enforced note relations without changing existing data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-taxonomy-migration-test-'));
    temporaryDirectories.push(directory);
    const currentMigrations = join(directory, 'current');
    const priorMigrations = join(directory, 'prior');
    mkdirSync(currentMigrations);
    mkdirSync(priorMigrations);
    const files = [
      '001_initial.sql',
      '002_notes.sql',
      '003_notes_search.sql',
      '004_bookmarks.sql',
      '005_categories_tags.sql',
    ];
    for (const file of files) {
      copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(currentMigrations, file));
      if (file !== '005_categories_tags.sql') {
        copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(priorMigrations, file));
      }
    }
    const database = new Database(':memory:');
    database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    database.pragma('foreign_keys = ON');
    applyMigrations(database, priorMigrations);
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('taxonomy-owner', 'taxonomy-owner', 'test-hash', 1);
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('taxonomy-note', 'taxonomy-owner', 'Keep', 'Existing content', 1, 1);

    applyMigrations(database, currentMigrations);
    const categoryId = 'category-owner-a';
    const tagId = 'tag-owner-a';
    database.prepare('INSERT INTO categories (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
      .run(categoryId, 'taxonomy-owner', 'Work');
    database.prepare('INSERT INTO tags (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
      .run(tagId, 'taxonomy-owner', 'Important');
    database.prepare('INSERT INTO note_categories (note_id, category_id, owner_id) VALUES (?, ?, ?)')
      .run('taxonomy-note', categoryId, 'taxonomy-owner');
    database.prepare('INSERT INTO note_tags (note_id, tag_id, owner_id) VALUES (?, ?, ?)')
      .run('taxonomy-note', tagId, 'taxonomy-owner');

    expect(database.prepare('SELECT title, content FROM notes WHERE id = ?').get('taxonomy-note'))
      .toEqual({ title: 'Keep', content: 'Existing content' });
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
    expect(() => database.prepare(
      'INSERT INTO note_categories (note_id, category_id, owner_id) VALUES (?, ?, ?)',
    ).run('taxonomy-note', categoryId, 'missing-owner')).toThrow(/owner mismatch/);
    database.prepare('DELETE FROM notes WHERE id = ?').run('taxonomy-note');
    expect(database.prepare('SELECT * FROM note_categories').all()).toEqual([]);
    expect(database.prepare('SELECT * FROM note_tags').all()).toEqual([]);
    database.close();
  });

  it('adds favorites, file metadata and Life OS tables without changing existing data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pkh-favorites-files-migration-test-'));
    temporaryDirectories.push(directory);
    const currentMigrations = join(directory, 'current');
    const priorMigrations = join(directory, 'prior');
    mkdirSync(currentMigrations);
    mkdirSync(priorMigrations);
    const files = [
      '001_initial.sql',
      '002_notes.sql',
      '003_notes_search.sql',
      '004_bookmarks.sql',
      '005_categories_tags.sql',
      '006_favorites.sql',
      '007_files.sql',
      '008_life_os_people_and_schedule.sql',
      '009_work_core.sql',
      '010_habit_logs_and_reminder_recurrence.sql',
      '011_entity_files.sql',
      '012_vault_and_library.sql',
      '013_custom_categories.sql',
    ];
    for (const file of files) {
      copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(currentMigrations, file));
      if (file !== '006_favorites.sql' && file !== '007_files.sql'
        && file !== '008_life_os_people_and_schedule.sql' && file !== '009_work_core.sql'
        && file !== '010_habit_logs_and_reminder_recurrence.sql' && file !== '011_entity_files.sql'
        && file !== '012_vault_and_library.sql' && file !== '013_custom_categories.sql') {
        copyFileSync(new URL(`../migrations/${file}`, import.meta.url), join(priorMigrations, file));
      }
    }
    const database = new Database(':memory:');
    database.function('nfc', { deterministic: true }, (value: string | null) => value?.normalize('NFC') ?? null);
    database.pragma('foreign_keys = ON');
    applyMigrations(database, priorMigrations);
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run('migration-owner', 'migration-owner', 'test-hash', 1);
    database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('migration-note', 'migration-owner', 'Keep', 'Existing content', 1, 1);
    database.prepare(`
      INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('migration-bookmark', 'migration-owner', 'Keep', 'https://example.com', '', 1, 1);

    applyMigrations(database, currentMigrations);

    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([
        { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 },
        { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 },
        { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 },
      ]);
    expect(database.prepare('SELECT title, content FROM notes WHERE id = ?').get('migration-note'))
      .toEqual({ title: 'Keep', content: 'Existing content' });

    database.prepare('INSERT INTO favorites (owner_id, item_type, item_id, created_at) VALUES (?, ?, ?, 1)')
      .run('migration-owner', 'note', 'migration-note');
    expect(database.prepare('SELECT COUNT(*) AS count FROM favorites').get()).toEqual({ count: 1 });
    expect(() => database.prepare(
      'INSERT INTO favorites (owner_id, item_type, item_id, created_at) VALUES (?, ?, ?, 1)',
    ).run('missing-owner', 'note', 'migration-note')).toThrow(/owner mismatch/);

    database.prepare('DELETE FROM bookmarks WHERE id = ?').run('migration-bookmark');
    database.prepare('INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      .run('file-1', 'migration-owner', 'a.png', 10, 'a'.repeat(64), 'image/png', 'file-1');
    expect(database.prepare("PRAGMA foreign_key_list('files')").all()).toHaveLength(2);
    expect(() => database.prepare(
      'INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    ).run('file-2', 'missing-owner', 'b.png', 10, 'b'.repeat(64), 'image/png', 'file-2')).toThrow();

    database.prepare(`
      INSERT INTO people (id, owner_id, name, relationship_group, role_label, birthday_or_anniversary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('person-1', 'migration-owner', 'คุณแม่', 'family', 'คุณแม่', '1960-05-20');
    database.prepare('INSERT INTO note_people (note_id, person_id, owner_id) VALUES (?, ?, ?)')
      .run('migration-note', 'person-1', 'migration-owner');
    database.prepare(`
      INSERT INTO reminders (id, owner_id, title, target_date, category, linked_person_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('reminder-1', 'migration-owner', 'วันเกิดคุณแม่', '2026-05-20', 'birthday', 'person-1');
    database.prepare(`
      INSERT INTO life_timeblocks (id, owner_id, block_date, time_range, title, life_area, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('block-1', 'migration-owner', '2026-10-20', '06:30 - 07:30', 'ออกกำลังกาย', 'health');
    database.prepare(`
      INSERT INTO habits (id, owner_id, title, current_count, daily_target, unit, streak_days, created_at, updated_at)
      VALUES (?, ?, ?, 0, 8, 'แก้ว', 0, 1, 1)
    `).run('habit-1', 'migration-owner', 'ดื่มน้ำ');

    expect(database.prepare('SELECT COUNT(*) AS count FROM people').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM note_people').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM reminders').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM life_timeblocks').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM habits').get()).toEqual({ count: 1 });
    expect(() => database.prepare(
      'INSERT INTO note_people (note_id, person_id, owner_id) VALUES (?, ?, ?)',
    ).run('migration-note', 'person-1', 'missing-owner')).toThrow(/owner mismatch/);
    expect(() => database.prepare(`
      INSERT INTO reminders (id, owner_id, title, target_date, category, linked_person_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('reminder-2', 'missing-owner', 'x', '2026-05-20', 'other', 'person-1')).toThrow();

    // --- schema 9: goals / projects / tasks / checklist / inbox
    database.prepare(`
      INSERT INTO goals (id, owner_id, title, target_value, current_value, unit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('goal-1', 'migration-owner', 'อ่านหนังสือ 24 เล่ม', 24, 6, 'เล่ม');
    database.prepare(`
      INSERT INTO projects (id, owner_id, name, goal_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1)
    `).run('project-1', 'migration-owner', 'อ่านให้จบปีนี้', 'goal-1');
    database.prepare(`
      INSERT INTO tasks (id, owner_id, title, project_id, goal_id, person_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run('task-1', 'migration-owner', 'อ่านบทที่ 1', 'project-1', 'goal-1', 'person-1');
    database.prepare(`
      INSERT INTO task_checklist_items (id, task_id, owner_id, title, is_done, position, created_at)
      VALUES (?, ?, ?, ?, 1, 0, 1)
    `).run('check-1', 'task-1', 'migration-owner', 'จดสรุป');
    database.prepare(`
      INSERT INTO inbox_items (id, owner_id, body, kind, status, created_at, updated_at)
      VALUES (?, ?, ?, 'text', 'new', 1, 1)
    `).run('inbox-1', 'migration-owner', 'ไอเดียที่ยังไม่ได้จัดหมวด');

    expect(database.prepare('SELECT COUNT(*) AS count FROM goals').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM projects').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM task_checklist_items').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM inbox_items').get()).toEqual({ count: 1 });

    expect(() => database.prepare(`
      INSERT INTO projects (id, owner_id, name, goal_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1)
    `).run('project-2', 'missing-owner', 'ข้ามเจ้าของ', 'goal-1')).toThrow(/owner mismatch/);
    expect(() => database.prepare(`
      INSERT INTO tasks (id, owner_id, title, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1)
    `).run('task-2', 'missing-owner', 'ข้ามเจ้าของ', 'project-1')).toThrow(/owner mismatch/);
    expect(() => database.prepare(`
      INSERT INTO task_checklist_items (id, task_id, owner_id, title, created_at)
      VALUES (?, ?, ?, ?, 1)
    `).run('check-2', 'task-1', 'missing-owner', 'ข้ามเจ้าของ')).toThrow(/owner mismatch/);
    expect(() => database.prepare(`
      INSERT INTO inbox_items (id, owner_id, body, converted_type, converted_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run('inbox-2', 'migration-owner', 'x', 'task', null)).toThrow();

    // deleting the project keeps the task but drops the link
    database.prepare('DELETE FROM projects WHERE id = ?').run('project-1');
    expect(database.prepare('SELECT project_id, goal_id FROM tasks WHERE id = ?').get('task-1'))
      .toEqual({ project_id: null, goal_id: 'goal-1' });
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
