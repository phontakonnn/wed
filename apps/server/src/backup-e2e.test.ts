import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup, restoreBackup, verifyBackup } from './backup.js';
import { openDataDatabase, type SqliteDatabase } from './database.js';

const databases: SqliteDatabase[] = [];
const directories: string[] = [];
const key = Buffer.alloc(32, 17).toString('base64');

const ids = {
  userA: 'aaaaaaaa-0000-4000-8000-000000000001',
  userB: 'bbbbbbbb-0000-4000-8000-000000000002',
  noteA: 'aaaaaaaa-0000-4000-8000-00000000000a',
  noteB: 'bbbbbbbb-0000-4000-8000-00000000000b',
  bookmarkA: 'aaaaaaaa-0000-4000-8000-0000000000ba',
  bookmarkB: 'bbbbbbbb-0000-4000-8000-0000000000bb',
  categoryA: 'aaaaaaaa-0000-4000-8000-0000000000ca',
  categoryB: 'bbbbbbbb-0000-4000-8000-0000000000cb',
  tagA: 'aaaaaaaa-0000-4000-8000-0000000000aa',
  fileA: 'aaaaaaaa-0000-4000-8000-0000000000fa',
  fileB: 'bbbbbbbb-0000-4000-8000-0000000000fb',
} as const;

const contents = {
  fileA: Buffer.from('owner-a-private-file'),
  fileB: Buffer.from('owner-b-private-file'),
};

function createDataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pkh-e2e-'));
  directories.push(directory);
  return directory;
}

function openLive(dataDirectory: string): SqliteDatabase {
  const database = openDataDatabase(dataDirectory);
  databases.push(database);
  return database;
}

function writeObject(dataDirectory: string, id: string, bytes: Buffer): void {
  const path = join(dataDirectory, 'objects', id.slice(0, 2), id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function seed(database: SqliteDatabase, dataDirectory: string): void {
  const now = Date.now();
  const user = database.prepare(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  );
  user.run(ids.userA, 'owner-a', 'test-hash', now);
  user.run(ids.userB, 'owner-b', 'test-hash', now);

  database.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ids.noteA, ids.userA, 'A note', 'A content', now, now);
  database.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ids.noteB, ids.userB, 'B note', 'B content', now, now);

  database.prepare(`
    INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ids.bookmarkA, ids.userA, 'A bookmark', 'https://example.com/a', 'desc a', now, now);
  database.prepare(`
    INSERT INTO bookmarks (id, owner_id, title, url, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ids.bookmarkB, ids.userB, 'B bookmark', 'https://example.com/b', 'desc b', now, now);

  database.prepare('INSERT INTO categories (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(ids.categoryA, ids.userA, 'Work', now, now);
  database.prepare('INSERT INTO categories (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(ids.categoryB, ids.userB, 'Personal', now, now);
  database.prepare('INSERT INTO tags (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(ids.tagA, ids.userA, 'urgent', now, now);

  database.prepare('INSERT INTO note_categories (note_id, category_id, owner_id) VALUES (?, ?, ?)')
    .run(ids.noteA, ids.categoryA, ids.userA);
  database.prepare('INSERT INTO note_categories (note_id, category_id, owner_id) VALUES (?, ?, ?)')
    .run(ids.noteB, ids.categoryB, ids.userB);
  database.prepare('INSERT INTO note_tags (note_id, tag_id, owner_id) VALUES (?, ?, ?)')
    .run(ids.noteA, ids.tagA, ids.userA);

  const favorite = database.prepare(
    'INSERT INTO favorites (owner_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)',
  );
  favorite.run(ids.userA, 'note', ids.noteA, now);
  favorite.run(ids.userA, 'bookmark', ids.bookmarkA, now);
  favorite.run(ids.userB, 'note', ids.noteB, now);

  database.prepare(`
    INSERT INTO people (id, owner_id, name, relationship_group, role_label, birthday_or_anniversary,
      phone, favorites_and_likes, allergies_and_medical, gift_ideas_and_sizes, memo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000001', ids.userA, 'คุณแม่', 'family', 'คุณแม่',
    '1960-05-20', '0800000000', 'ชอบกาแฟดำ', 'แพ้กุ้ง', 'ไซส์ M', 'โน้ตถึงคุณแม่', now, now);
  database.prepare('INSERT INTO note_people (note_id, person_id, owner_id) VALUES (?, ?, ?)')
    .run(ids.noteA, 'eeeeeeee-0000-4000-8000-000000000001', ids.userA);
  database.prepare(`
    INSERT INTO reminders (id, owner_id, title, target_date, category, priority, linked_person_id,
      is_completed, notify_days_before, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000002', ids.userA, 'วันเกิดคุณแม่', '2026-05-20',
    'birthday', 'high', 'eeeeeeee-0000-4000-8000-000000000001', 0, 14, now, now);
  database.prepare(`
    INSERT INTO life_timeblocks (id, owner_id, block_date, time_range, title, life_area, is_done, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000003', ids.userA, '2026-10-20', '06:30 - 07:30',
    'ออกกำลังกาย', 'health', 1, now, now);
  database.prepare(`
    INSERT INTO habits (id, owner_id, title, current_count, daily_target, unit, streak_days,
      last_checked_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000004', ids.userA, 'ดื่มน้ำ', 3, 8, 'แก้ว', 4,
    '2026-10-20', now, now);

  database.prepare(`
    INSERT INTO goals (id, owner_id, title, description, metric, target_value, current_value, unit,
      horizon, status, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000005', ids.userA, 'อ่านหนังสือ 24 เล่ม', 'อ่านให้จบปีนี้',
    'จำนวนเล่มที่อ่านจบ', 24, 6, 'เล่ม', 'year', 'active', '2026-12-31', now, now);
  database.prepare(`
    INSERT INTO projects (id, owner_id, name, description, outcome, status, area, goal_id,
      start_date, due_date, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000006', ids.userA, 'อ่านให้จบปีนี้', 'โปรเจกต์อ่านหนังสือ',
    'อ่านครบ 24 เล่ม', 'active', 'พัฒนาตัวเอง', 'eeeeeeee-0000-4000-8000-000000000005',
    '2026-01-01', '2026-12-31', null, now, now);
  database.prepare(`
    INSERT INTO tasks (id, owner_id, title, detail, status, priority, due_date, start_date,
      project_id, goal_id, person_id, recurrence, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000007', ids.userA, 'อ่านบทที่ 3', 'จดสรุปไว้ในโน้ต',
    'doing', 'high', '2026-10-25', null,
    'eeeeeeee-0000-4000-8000-000000000006', 'eeeeeeee-0000-4000-8000-000000000005',
    'eeeeeeee-0000-4000-8000-000000000001', 'weekly', null, now, now);
  database.prepare(`
    INSERT INTO task_checklist_items (id, task_id, owner_id, title, is_done, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000008', 'eeeeeeee-0000-4000-8000-000000000007',
    ids.userA, 'จดสรุป', 1, 0, now);
  database.prepare(`
    INSERT INTO inbox_items (id, owner_id, body, kind, status, converted_type, converted_id,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000009', ids.userA, 'ไอเดียที่ยังไม่ได้จัดหมวด',
    'text', 'new', null, null, now, now);

  database.prepare(`
    INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000010', ids.userA,
    'eeeeeeee-0000-4000-8000-000000000004', '2026-10-20', 3, 8, now, now);
  database.prepare(`
    INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000011', ids.userA,
    'eeeeeeee-0000-4000-8000-000000000004', '2026-10-19', 8, 8, now, now);
  database.prepare(`
    UPDATE reminders SET recurrence = 'yearly', recurrence_anchor_date = '2026-05-20',
      snoozed_until = '2026-05-22', last_completed_at = ? WHERE id = ?
  `).run(now, 'eeeeeeee-0000-4000-8000-000000000002');

  const file = database.prepare(`
    INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [id, owner, name, bytes] of [
    [ids.fileA, ids.userA, 'a.txt', contents.fileA],
    [ids.fileB, ids.userB, 'b.txt', contents.fileB],
  ] as const) {
    writeObject(dataDirectory, id, bytes);
    file.run(id, owner, name, bytes.length, createHash('sha256').update(bytes).digest('hex'), 'text/plain', id, now);
  }

  database.prepare(`
    INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
    VALUES (?, ?, 'note', ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000012', ids.userA, ids.noteA, ids.fileA, now);

  database.prepare(`
    INSERT INTO vault_items (id, owner_id, title, category, key_value, physical_location,
      renewal_or_expiry_date, amount_text, notes, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000013', ids.userA, 'กรมธรรม์รถยนต์', 'เอกสาร & ประกัน',
    'POL-2026-000123', 'ลิ้นชักชั้น 2', '2027-03-15', '18,500 บาท/ปี', 'ต่ออายุออนไลน์ได้', 1, now, now);
  database.prepare(`
    INSERT INTO vault_items (id, owner_id, title, category, key_value, physical_location,
      renewal_or_expiry_date, amount_text, notes, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000014', ids.userB, 'โฉนดที่ดิน', 'ทรัพย์สิน & บ้าน',
    'DEED-0001', 'ตู้เซฟธนาคาร', null, '', '', 0, now, now);

  database.prepare(`
    INSERT INTO library_items (id, owner_id, title, category, status, source_url_or_author,
      key_takeaways, content, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000015', ids.userA, 'SOP เปิดร้าน', 'คู่มือชีวิต & SOP',
    'ใช้งานประจำ', 'ทำเอง', 'เปิดไฟ ตรวจสต็อก', 'ขั้นตอนที่ 1 …', 0, now, now);
  database.prepare(`
    INSERT INTO library_items (id, owner_id, title, category, status, source_url_or_author,
      key_takeaways, content, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('eeeeeeee-0000-4000-8000-000000000016', ids.userB, 'คู่มือเครื่องซักผ้า', 'คู่มือชีวิต & SOP',
    'ใช้งานประจำ', 'LG', 'แยกผ้าขาว-สี', 'กดปุ่มเริ่ม', 0, now, now);

  const entityFile = database.prepare(`
    INSERT INTO entity_files (id, owner_id, entity_type, entity_id, file_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  entityFile.run('eeeeeeee-0000-4000-8000-000000000017', ids.userA, 'vault',
    'eeeeeeee-0000-4000-8000-000000000013', ids.fileA, now);
  entityFile.run('eeeeeeee-0000-4000-8000-000000000018', ids.userA, 'library',
    'eeeeeeee-0000-4000-8000-000000000015', ids.fileA, now);
}

function destroyContent(database: SqliteDatabase, dataDirectory: string): void {
  for (const table of ['entity_files', 'habit_logs', 'inbox_items', 'task_checklist_items', 'tasks', 'projects', 'goals', 'favorites', 'note_people', 'reminders', 'life_timeblocks', 'habits', 'note_tags', 'note_categories', 'vault_items', 'library_items', 'files', 'tags', 'categories', 'bookmarks', 'notes', 'people', 'users']) {
    database.prepare(`DELETE FROM ${table}`).run();
  }
  rmSync(join(dataDirectory, 'objects'), { recursive: true, force: true });
}

function snapshotState(database: SqliteDatabase): Record<string, number> {
  const count = (table: string) =>
    (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  return {
    users: count('users'),
    notes: count('notes'),
    bookmarks: count('bookmarks'),
    categories: count('categories'),
    tags: count('tags'),
    noteCategories: count('note_categories'),
    noteTags: count('note_tags'),
    favorites: count('favorites'),
    files: count('files'),
    people: count('people'),
    notePeople: count('note_people'),
    reminders: count('reminders'),
    timeblocks: count('life_timeblocks'),
    habits: count('habits'),
    goals: count('goals'),
    projects: count('projects'),
    tasks: count('tasks'),
    checklist: count('task_checklist_items'),
    inbox: count('inbox_items'),
    habitLogs: count('habit_logs'),
    entityFiles: count('entity_files'),
    vault: count('vault_items'),
    library: count('library_items'),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Already closed.
    }
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('end-to-end backup and restore', () => {
  it('restores every data type, relation, checksum and owner boundary', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLive(dataDirectory);
    seed(database, dataDirectory);
    const before = snapshotState(database);

    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
      encryptionKey: key,
    });
    expect(backup.manifest.objects?.fileCount).toBe(2);
    expect((await verifyBackup(backup.path, { encryptionKey: key })).ok).toBe(true);

    destroyContent(database, dataDirectory);
    expect(snapshotState(database).notes).toBe(0);
    database.close();

    const restored = await restoreBackup({ backupPath: backup.path, dataDirectory, encryptionKey: key });
    expect(restored.objectsRestored).toBe(2);
    expect(restored.safetyCopyPath).not.toBeNull();

    const reopened = openLive(dataDirectory);
    expect(snapshotState(reopened)).toEqual(before);

    // Content, not just counts.
    expect(reopened.prepare('SELECT title, content FROM notes WHERE id = ?').get(ids.noteA))
      .toEqual({ title: 'A note', content: 'A content' });
    expect(reopened.prepare('SELECT url FROM bookmarks WHERE id = ?').get(ids.bookmarkB))
      .toEqual({ url: 'https://example.com/b' });

    // Relations survive and stay owner-scoped.
    expect(reopened.prepare(`
      SELECT c.name FROM note_categories nc JOIN categories c ON c.id = nc.category_id
      WHERE nc.note_id = ? AND nc.owner_id = ?
    `).all(ids.noteA, ids.userA)).toEqual([{ name: 'Work' }]);
    expect(reopened.prepare(`
      SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = ? AND nt.owner_id = ?
    `).all(ids.noteA, ids.userA)).toEqual([{ name: 'urgent' }]);
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM note_categories WHERE owner_id = ?')
      .get(ids.userB)).toEqual({ count: 1 });
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM note_categories WHERE owner_id = ? AND note_id = ?')
      .get(ids.userB, ids.noteA)).toEqual({ count: 0 });

    // Favorites point at the right items and owner.
    const favorites = reopened.prepare(
      'SELECT owner_id, item_type, item_id FROM favorites ORDER BY owner_id, item_type',
    ).all() as Array<{ owner_id: string; item_type: string; item_id: string }>;
    expect(favorites).toHaveLength(3);
    expect(favorites).toContainEqual({ owner_id: ids.userA, item_type: 'note', item_id: ids.noteA });
    expect(favorites).toContainEqual({ owner_id: ids.userA, item_type: 'bookmark', item_id: ids.bookmarkA });
    expect(favorites).toContainEqual({ owner_id: ids.userB, item_type: 'note', item_id: ids.noteB });

    // Metadata matches bytes for both owners.
    const files = reopened.prepare('SELECT id, owner_id, size_bytes, sha256 FROM files ORDER BY id').all() as Array<{
      id: string; owner_id: string; size_bytes: number; sha256: string;
    }>;
    expect(files).toHaveLength(2);
    for (const row of files) {
      const expected = row.id === ids.fileA ? contents.fileA : contents.fileB;
      const objectPath = join(dataDirectory, 'objects', row.id.slice(0, 2), row.id);
      expect(existsSync(objectPath)).toBe(true);
      expect(statSync(objectPath).size).toBe(row.size_bytes);
      expect(readFileSync(objectPath)).toEqual(expected);
      expect(createHash('sha256').update(readFileSync(objectPath)).digest('hex')).toBe(row.sha256);
    }

    // Life OS tables and their links.
    expect(reopened.prepare('SELECT name, favorites_and_likes FROM people WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000001'))
      .toEqual({ name: 'คุณแม่', favorites_and_likes: 'ชอบกาแฟดำ' });
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM note_people WHERE note_id = ? AND person_id = ?')
      .get(ids.noteA, 'eeeeeeee-0000-4000-8000-000000000001')).toEqual({ count: 1 });
    expect(reopened.prepare('SELECT title, linked_person_id AS personId FROM reminders WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000002'))
      .toEqual({ title: 'วันเกิดคุณแม่', personId: 'eeeeeeee-0000-4000-8000-000000000001' });
    expect(reopened.prepare('SELECT is_done AS isDone FROM life_timeblocks WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000003')).toEqual({ isDone: 1 });
    expect(reopened.prepare('SELECT current_count AS currentCount, streak_days AS streakDays FROM habits WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000004')).toEqual({ currentCount: 3, streakDays: 4 });

    // Work core tables and the relations between them.
    expect(reopened.prepare('SELECT title, target_value AS targetValue, current_value AS currentValue FROM goals WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000005'))
      .toEqual({ title: 'อ่านหนังสือ 24 เล่ม', targetValue: 24, currentValue: 6 });
    expect(reopened.prepare('SELECT name, goal_id AS goalId FROM projects WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000006'))
      .toEqual({ name: 'อ่านให้จบปีนี้', goalId: 'eeeeeeee-0000-4000-8000-000000000005' });
    expect(reopened.prepare(`
      SELECT title, project_id AS projectId, goal_id AS goalId, person_id AS personId, recurrence
      FROM tasks WHERE id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000007')).toEqual({
      title: 'อ่านบทที่ 3',
      projectId: 'eeeeeeee-0000-4000-8000-000000000006',
      goalId: 'eeeeeeee-0000-4000-8000-000000000005',
      personId: 'eeeeeeee-0000-4000-8000-000000000001',
      recurrence: 'weekly',
    });
    expect(reopened.prepare('SELECT title, is_done AS isDone FROM task_checklist_items WHERE task_id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000007')).toEqual({ title: 'จดสรุป', isDone: 1 });
    expect(reopened.prepare('SELECT body, status FROM inbox_items WHERE id = ?')
      .get('eeeeeeee-0000-4000-8000-000000000009'))
      .toEqual({ body: 'ไอเดียที่ยังไม่ได้จัดหมวด', status: 'new' });

    // Habit history and reminder recurrence survive the round trip with their relations intact.
    expect(reopened.prepare(`
      SELECT COUNT(*) AS count FROM habit_logs WHERE habit_id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000004')).toEqual({ count: 2 });
    expect(reopened.prepare(`
      SELECT log_date AS logDate, count, target_snapshot AS target
      FROM habit_logs WHERE id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000011'))
      .toEqual({ logDate: '2026-10-19', count: 8, target: 8 });
    expect(reopened.prepare(`
      SELECT recurrence, recurrence_anchor_date AS anchor, snoozed_until AS snoozed
      FROM reminders WHERE id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000002'))
      .toEqual({ recurrence: 'yearly', anchor: '2026-05-20', snoozed: '2026-05-22' });

    // Vault and library rows come back with their content, not just their counts.
    expect(reopened.prepare(`
      SELECT title, category, key_value AS keyValue, renewal_or_expiry_date AS renewal, is_favorite AS favorite
      FROM vault_items WHERE id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000013')).toEqual({
      title: 'กรมธรรม์รถยนต์',
      category: 'เอกสาร & ประกัน',
      keyValue: 'POL-2026-000123',
      renewal: '2027-03-15',
      favorite: 1,
    });
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM vault_items WHERE owner_id = ?').get(ids.userB))
      .toEqual({ count: 1 });
    expect(reopened.prepare(`
      SELECT title, status, key_takeaways AS takeaways FROM library_items WHERE id = ?
    `).get('eeeeeeee-0000-4000-8000-000000000015')).toEqual({
      title: 'SOP เปิดร้าน',
      status: 'ใช้งานประจำ',
      takeaways: 'เปิดไฟ ตรวจสต็อก',
    });

    // Every file link survives with both sides intact and the object bytes still match.
    const links = reopened.prepare(`
      SELECT entity_type AS entityType, entity_id AS entityId, file_id AS fileId
      FROM entity_files WHERE owner_id = ? ORDER BY entity_type
    `).all(ids.userA);
    expect(links).toEqual([
      { entityType: 'library', entityId: 'eeeeeeee-0000-4000-8000-000000000015', fileId: ids.fileA },
      { entityType: 'note', entityId: ids.noteA, fileId: ids.fileA },
      { entityType: 'vault', entityId: 'eeeeeeee-0000-4000-8000-000000000013', fileId: ids.fileA },
    ]);

    // The safety copy is itself a complete, verifiable rollback point.
    const safety = await verifyBackup(restored.safetyCopyPath as string, { encryptionKey: key });
    expect(safety.problems).toEqual([]);
    expect(safety.ok).toBe(true);
  });

  it('rejects a tampered backup without touching live data', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLive(dataDirectory);
    seed(database, dataDirectory);
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
      encryptionKey: key,
    });

    const tamperedDirectory = join(dataDirectory, 'tampered');
    mkdirSync(tamperedDirectory, { recursive: true });
    const tamperedPath = join(tamperedDirectory, backup.path.split(/[\\/]/).pop() as string);
    cpSync(backup.path, tamperedPath);
    cpSync(`${backup.path}.manifest.json`, `${tamperedPath}.manifest.json`);
    cpSync(backup.objectsPath as string, `${tamperedPath}.objects`, { recursive: true });
    const encryptedObject = join(tamperedPath + '.objects', ids.fileA.slice(0, 2), `${ids.fileA}.enc`);
    const bytes = readFileSync(encryptedObject);
    bytes[20] = bytes[20] ^ 0xff;
    writeFileSync(encryptedObject, bytes);

    const verification = await verifyBackup(tamperedPath, { encryptionKey: key });
    expect(verification.ok).toBe(false);

    const before = snapshotState(database);
    database.close();
    await expect(
      restoreBackup({ backupPath: tamperedPath, dataDirectory, encryptionKey: key }),
    ).rejects.toThrow(/failed verification/i);

    const reopened = openLive(dataDirectory);
    expect(snapshotState(reopened)).toEqual(before);
    expect(readFileSync(join(dataDirectory, 'objects', ids.fileA.slice(0, 2), ids.fileA))).toEqual(contents.fileA);
  });

  it('rolls the object store back when the database cannot be replaced', async () => {
    const dataDirectory = createDataDirectory();
    const database = openLive(dataDirectory);
    seed(database, dataDirectory);
    const backup = await createBackup({
      database,
      backupDirectory: join(dataDirectory, 'backups'),
      dataDirectory,
      encryptionKey: key,
    });

    // A second connection keeps the live database file open. With `force`, restore skips the
    // in-use precheck, swaps objects, and then fails to rename over the open database.
    const blocker = new Database(join(dataDirectory, 'db', 'knowledge.sqlite3'), { timeout: 500 });
    databases.push(blocker as unknown as SqliteDatabase);
    const marker = join(dataDirectory, 'objects', 'zz', 'rollback-marker');
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, 'live-object');

    let failed = false;
    try {
      await restoreBackup({ backupPath: backup.path, dataDirectory, force: true, encryptionKey: key });
    } catch {
      failed = true;
    } finally {
      blocker.close();
    }

    // Windows refuses the rename over a file another handle holds open, so the failure lands after
    // the object store has already been replaced; the rollback must put it back.
    expect(failed).toBe(true);
    expect(readFileSync(marker, 'utf8')).toBe('live-object');
    expect(readFileSync(join(dataDirectory, 'objects', ids.fileA.slice(0, 2), ids.fileA))).toEqual(contents.fileA);
  });
});
