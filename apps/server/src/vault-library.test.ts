import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const origin = 'http://localhost:80';
const csrf = { origin, 'x-pkh-request': '1' };

function setup() {
  const database = openDatabase(':memory:');
  const app = createApp(database, { expectedOrigin: origin, logger: false, sleep: async () => undefined });
  databases.push(database);
  apps.push(app);
  return { app, database };
}

function createUser(database: SqliteDatabase, username: string) {
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, 'test-hash', Date.now());
  const session = createSession(database, id);
  return { id, cookie: `pkh_session=${session.token}` };
}

function createFile(database: SqliteDatabase, ownerId: string, name: string) {
  const id = randomUUID();
  database.prepare(`
    INSERT INTO files (id, owner_id, display_name, size_bytes, sha256, media_type, object_key, created_at)
    VALUES (?, ?, ?, 12, ?, 'text/plain', ?, ?)
  `).run(id, ownerId, name, 'a'.repeat(64), id, Date.now());
  return id;
}

type App = ReturnType<typeof createApp>;

const post = (app: App, url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, headers: { ...csrf, cookie }, payload });
const put = (app: App, url: string, cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url, headers: { ...csrf, cookie }, payload });
const get = (app: App, url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const del = (app: App, url: string, cookie: string) =>
  app.inject({ method: 'DELETE', url, headers: { ...csrf, cookie } });

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('personal vault', () => {
  it('creates a record with every field and returns it as stored', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const created = await post(app, '/api/vault', user.cookie, {
      title: 'กรมธรรม์รถยนต์',
      category: 'เอกสาร & ประกัน',
      keyValue: 'POL-2026-000123',
      physicalLocation: 'ลิ้นชักชั้น 2 ห้องนอน',
      renewalOrExpiryDate: '2027-03-15',
      amountText: '18,500 บาท/ปี',
      notes: 'ต่ออายุออนไลน์ได้',
      isFavorite: true,
    });
    expect(created.statusCode).toBe(201);
    const item = created.json().item;
    expect(item).toMatchObject({
      title: 'กรมธรรม์รถยนต์',
      category: 'เอกสาร & ประกัน',
      keyValue: 'POL-2026-000123',
      physicalLocation: 'ลิ้นชักชั้น 2 ห้องนอน',
      renewalOrExpiryDate: '2027-03-15',
      amountText: '18,500 บาท/ปี',
      notes: 'ต่ออายุออนไลน์ได้',
      isFavorite: true,
    });
    expect(typeof item.createdAt).toBe('number');
    expect(item.updatedAt).toBe(item.createdAt);
  });

  it('applies defaults for a title-only record', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const created = await post(app, '/api/vault', user.cookie, { title: 'จักรยาน' });
    expect(created.statusCode).toBe(201);
    expect(created.json().item).toMatchObject({
      category: 'เอกสาร & ประกัน',
      keyValue: '',
      physicalLocation: '',
      renewalOrExpiryDate: null,
      amountText: '',
      notes: '',
      isFavorite: false,
    });
  });

  it('rejects a bad category, a blank title and an impossible date', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    expect((await post(app, '/api/vault', user.cookie, { title: 'x', category: 'อื่น ๆ' })).statusCode).toBe(400);
    expect((await post(app, '/api/vault', user.cookie, { title: '   ' })).statusCode).toBe(400);
    // The schema pattern accepts 2026-13-01, so the calendar check has to catch it.
    expect((await post(app, '/api/vault', user.cookie, {
      title: 'x', renewalOrExpiryDate: '2026-13-01',
    })).statusCode).toBe(400);
    expect((await post(app, '/api/vault', user.cookie, {
      title: 'x', unexpected: 1,
    })).statusCode).toBe(400);
  });

  it('filters by category and searches code, place, amount and notes', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    await post(app, '/api/vault', user.cookie, {
      title: 'ประกันชีวิต', category: 'เอกสาร & ประกัน', keyValue: 'LIFE-778899',
      renewalOrExpiryDate: '2027-02-01',
    });
    await post(app, '/api/vault', user.cookie, {
      title: 'ค่าอินเทอร์เน็ต', category: 'รอบบิลรายเดือน', amountText: '599 บาท', physicalLocation: 'จ่ายผ่านแอป',
    });
    await post(app, '/api/vault', user.cookie, {
      title: 'โฉนดที่ดิน', category: 'ทรัพย์สิน & บ้าน', notes: 'เก็บในตู้เซฟธนาคาร',
    });

    const monthly = await get(app, '/api/vault?category=' + encodeURIComponent('รอบบิลรายเดือน'), user.cookie);
    expect(monthly.statusCode).toBe(200);
    expect(monthly.json().total).toBe(1);
    expect(monthly.json().items[0].title).toBe('ค่าอินเทอร์เน็ต');

    const byCode = await get(app, '/api/vault?q=LIFE-77', user.cookie);
    expect(byCode.json().items.map((row: { title: string }) => row.title)).toEqual(['ประกันชีวิต']);

    const byNotes = await get(app, '/api/vault?q=' + encodeURIComponent('ตู้เซฟ'), user.cookie);
    expect(byNotes.json().items.map((row: { title: string }) => row.title)).toEqual(['โฉนดที่ดิน']);

    const all = await get(app, '/api/vault', user.cookie);
    expect(all.json().total).toBe(3);
    // The dated record sorts first; the two undated ones follow.
    expect(all.json().items[0].title).toBe('ประกันชีวิต');
    expect(all.json().items.slice(1).every((row: { renewalOrExpiryDate: string | null }) =>
      row.renewalOrExpiryDate === null)).toBe(true);
  });

  it('updates only the fields that were sent and can clear a date', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const created = await post(app, '/api/vault', user.cookie, {
      title: 'ประกันบ้าน', keyValue: 'HOME-1', renewalOrExpiryDate: '2027-01-10', amountText: '9,900',
    });
    const id = created.json().item.id;

    const updated = await put(app, `/api/vault/${id}`, user.cookie, { amountText: '10,500' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().item).toMatchObject({
      title: 'ประกันบ้าน',
      keyValue: 'HOME-1',
      renewalOrExpiryDate: '2027-01-10',
      amountText: '10,500',
    });

    const cleared = await put(app, `/api/vault/${id}`, user.cookie, { renewalOrExpiryDate: '' });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().item.renewalOrExpiryDate).toBeNull();
    expect(cleared.json().item.keyValue).toBe('HOME-1');

    expect((await put(app, `/api/vault/${id}`, user.cookie, {})).statusCode).toBe(400);
    expect((await put(app, `/api/vault/${randomUUID()}`, user.cookie, { title: 'x' })).statusCode).toBe(404);
  });

  it('deletes a record and its file links, leaving the file itself', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'policy.pdf');

    const created = await post(app, '/api/vault', user.cookie, { title: 'กรมธรรม์' });
    const id = created.json().item.id;
    expect((await post(app, `/api/entities/vault/${id}/files`, user.cookie, { fileId })).statusCode).toBe(201);

    expect((await del(app, `/api/vault/${id}`, user.cookie)).statusCode).toBe(204);
    expect((await get(app, `/api/vault/${id}`, user.cookie)).statusCode).toBe(404);
    expect(database.prepare("SELECT COUNT(*) AS count FROM entity_files WHERE entity_type = 'vault'").get())
      .toEqual({ count: 1 });
    await app.inject({ method: 'DELETE', url: `/api/trash/vault/${id}/permanent`, headers: { ...csrf, cookie: user.cookie } });
    expect(database.prepare("SELECT COUNT(*) AS count FROM entity_files WHERE entity_type = 'vault'").get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM files WHERE id = ?').get(fileId)).toEqual({ count: 1 });
    expect((await del(app, `/api/vault/${id}`, user.cookie)).statusCode).toBe(404);
  });

  it('keeps one account out of another account\'s vault', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    const created = await post(app, '/api/vault', alice.cookie, { title: 'ของอลิซ' });
    const id = created.json().item.id;

    expect((await get(app, '/api/vault', bob.cookie)).json().total).toBe(0);
    expect((await get(app, `/api/vault/${id}`, bob.cookie)).statusCode).toBe(404);
    expect((await put(app, `/api/vault/${id}`, bob.cookie, { title: 'แก้' })).statusCode).toBe(404);
    expect((await del(app, `/api/vault/${id}`, bob.cookie)).statusCode).toBe(404);
    expect((await get(app, `/api/vault/${id}`, alice.cookie)).json().item.title).toBe('ของอลิซ');
  });

  it('requires a session for every vault route', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'GET', url: '/api/vault' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/vault', headers: csrf, payload: { title: 'x' } })).statusCode)
      .toBe(401);
  });
});

describe('knowledge library', () => {
  it('creates an entry with defaults and the full payload', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const minimal = await post(app, '/api/library', user.cookie, { title: 'วิธีปิดแก๊ส' });
    expect(minimal.statusCode).toBe(201);
    expect(minimal.json().item).toMatchObject({
      category: 'คู่มือชีวิต & SOP',
      status: 'ใช้งานประจำ',
      sourceUrlOrAuthor: '',
      keyTakeaways: '',
      content: '',
      isFavorite: false,
    });

    const full = await post(app, '/api/library', user.cookie, {
      title: 'Atomic Habits',
      category: 'หนังสือ & คอร์สเรียน',
      status: 'สรุปจบแล้ว',
      sourceUrlOrAuthor: 'James Clear',
      keyTakeaways: '1) ระบบดีกว่าการตั้งเป้า 2) ทำให้ชัดเจน 3) ทำให้ง่าย',
      content: 'สรุปทีละบท…',
      isFavorite: true,
    });
    expect(full.statusCode).toBe(201);
    expect(full.json().item).toMatchObject({
      category: 'หนังสือ & คอร์สเรียน',
      status: 'สรุปจบแล้ว',
      sourceUrlOrAuthor: 'James Clear',
      isFavorite: true,
    });
  });

  it('rejects an unknown category, an unknown status and a blank title', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    expect((await post(app, '/api/library', user.cookie, { title: 'x', category: 'นิตยสาร' })).statusCode).toBe(400);
    expect((await post(app, '/api/library', user.cookie, { title: 'x', status: 'อ่านจบ' })).statusCode).toBe(400);
    expect((await post(app, '/api/library', user.cookie, { title: '' })).statusCode).toBe(400);
  });

  it('filters by category and status, and searches takeaways and content', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    await post(app, '/api/library', user.cookie, {
      title: 'ปิดน้ำก่อนออกจากบ้าน', status: 'ใช้งานประจำ', keyTakeaways: 'เช็กแก๊สและปลั๊ก',
    });
    await post(app, '/api/library', user.cookie, {
      title: 'คอร์สเรียนภาษาอังกฤษ', category: 'หนังสือ & คอร์สเรียน', status: 'กำลังศึกษา',
    });
    await post(app, '/api/library', user.cookie, {
      title: 'คำสั่ง git ที่ใช้บ่อย', category: 'โพยคำสั่ง & สูตร', content: 'git status, git rebase -i',
    });

    const studying = await get(app, '/api/library?status=' + encodeURIComponent('กำลังศึกษา'), user.cookie);
    expect(studying.json().total).toBe(1);
    expect(studying.json().items[0].title).toBe('คอร์สเรียนภาษาอังกฤษ');

    const cheats = await get(app, '/api/library?category=' + encodeURIComponent('โพยคำสั่ง & สูตร'), user.cookie);
    expect(cheats.json().items.map((row: { title: string }) => row.title)).toEqual(['คำสั่ง git ที่ใช้บ่อย']);

    const byTakeaway = await get(app, '/api/library?q=' + encodeURIComponent('ปลั๊ก'), user.cookie);
    expect(byTakeaway.json().items.map((row: { title: string }) => row.title)).toEqual(['ปิดน้ำก่อนออกจากบ้าน']);

    const byContent = await get(app, '/api/library?q=rebase', user.cookie);
    expect(byContent.json().items.map((row: { title: string }) => row.title)).toEqual(['คำสั่ง git ที่ใช้บ่อย']);
  });

  it('updates fields, moves status and deletes with its links', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'sop.pdf');

    const created = await post(app, '/api/library', user.cookie, { title: 'SOP เปิดร้าน' });
    const id = created.json().item.id;
    expect((await post(app, `/api/entities/library/${id}/files`, user.cookie, { fileId })).statusCode).toBe(201);

    const updated = await put(app, `/api/library/${id}`, user.cookie, {
      status: 'สรุปจบแล้ว', keyTakeaways: 'เปิดไฟ ตรวจสต็อก เปิดลิ้นชัก',
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().item).toMatchObject({
      title: 'SOP เปิดร้าน',
      status: 'สรุปจบแล้ว',
      keyTakeaways: 'เปิดไฟ ตรวจสต็อก เปิดลิ้นชัก',
    });

    expect((await put(app, `/api/library/${id}`, user.cookie, { status: 'ไม่รู้จัก' })).statusCode).toBe(400);

    expect((await del(app, `/api/library/${id}`, user.cookie)).statusCode).toBe(204);
    expect(database.prepare("SELECT COUNT(*) AS count FROM entity_files WHERE entity_type = 'library'").get())
      .toEqual({ count: 1 });
    await app.inject({ method: 'DELETE', url: `/api/trash/library/${id}/permanent`, headers: { ...csrf, cookie: user.cookie } });
    expect(database.prepare("SELECT COUNT(*) AS count FROM entity_files WHERE entity_type = 'library'").get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM files WHERE id = ?').get(fileId)).toEqual({ count: 1 });
  });

  it('keeps one account out of another account\'s library', async () => {
    const { app, database } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');

    const created = await post(app, '/api/library', alice.cookie, { title: 'ของอลิซ' });
    const id = created.json().item.id;

    expect((await get(app, '/api/library', bob.cookie)).json().total).toBe(0);
    expect((await get(app, `/api/library/${id}`, bob.cookie)).statusCode).toBe(404);
    expect((await put(app, `/api/library/${id}`, bob.cookie, { title: 'แก้' })).statusCode).toBe(404);
    expect((await del(app, `/api/library/${id}`, bob.cookie)).statusCode).toBe(404);
  });
});

describe('attachments and search for the new modules', () => {
  it('links files to vault and library entities and refuses unknown ids', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'scan.jpg');

    const vault = (await post(app, '/api/vault', user.cookie, { title: 'สัญญาเช่า' })).json().item.id;
    const library = (await post(app, '/api/library', user.cookie, { title: 'คู่มือเครื่องซักผ้า' })).json().item.id;

    for (const [type, id] of [['vault', vault], ['library', library]] as const) {
      const linked = await post(app, `/api/entities/${type}/${id}/files`, user.cookie, { fileId });
      expect(linked.statusCode).toBe(201);
      const listed = await get(app, `/api/entities/${type}/${id}/files`, user.cookie);
      expect(listed.json().files.map((row: { displayName: string }) => row.displayName)).toEqual(['scan.jpg']);
    }

    // The link trigger validates the polymorphic id against the right table.
    expect((await post(app, '/api/entities/vault/' + randomUUID() + '/files', user.cookie, { fileId })).statusCode)
      .toBe(404);
    expect((await post(app, '/api/entities/library/' + vault + '/files', user.cookie, { fileId })).statusCode)
      .toBe(404);
  });

  it('removes a link without removing the file', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const fileId = createFile(database, user.id, 'deed.pdf');
    const id = (await post(app, '/api/vault', user.cookie, { title: 'โฉนด' })).json().item.id;

    await post(app, `/api/entities/vault/${id}/files`, user.cookie, { fileId });
    const removed = await del(app, `/api/entities/vault/${id}/files/${fileId}`, user.cookie);
    expect(removed.statusCode).toBe(204);
    expect((await get(app, `/api/entities/vault/${id}/files`, user.cookie)).json().files).toHaveLength(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM files WHERE id = ?').get(fileId)).toEqual({ count: 1 });
  });

  it('searches the two new buckets through types=vault,library', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    await post(app, '/api/vault', user.cookie, { title: 'ประกันสุขภาพปี 2569', keyValue: 'HLT-5566' });
    await post(app, '/api/library', user.cookie, { title: 'วิธีจ่ายบิลออนไลน์', content: 'ขั้นตอนที่ 1 เปิดแอป' });

    const both = await get(app, '/api/search?q=' + encodeURIComponent('บิล') + '&types=vault,library', user.cookie);
    expect(both.statusCode).toBe(200);
    expect(both.json().library).toHaveLength(1);
    expect(both.json().vault).toHaveLength(0);
    expect(both.json().notes).toHaveLength(0);

    const byCode = await get(app, '/api/search?q=HLT-55&types=vault', user.cookie);
    expect(byCode.json().vault).toHaveLength(1);
    expect(byCode.json().vault[0]).toMatchObject({ title: 'ประกันสุขภาพปี 2569', keyValue: 'HLT-5566' });
    expect(byCode.json().library).toHaveLength(0);

    const everything = await get(app, '/api/search?q=' + encodeURIComponent('ประกัน'), user.cookie);
    expect(everything.json().vault).toHaveLength(1);
  });

  it('applies from/to inside SQL for vault renewal dates and library updates', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    await post(app, '/api/vault', user.cookie, {
      title: 'ต่อภาษีรถ', renewalOrExpiryDate: '2026-11-01',
    });
    await post(app, '/api/vault', user.cookie, {
      title: 'ต่อประกันบ้าน', renewalOrExpiryDate: '2027-06-01',
    });
    await post(app, '/api/vault', user.cookie, { title: 'จักรยานไม่มีวันต่ออายุ' });

    const ranged = await get(app, '/api/search?q=' + encodeURIComponent('ต่อ') + '&types=vault&from=2026-10-01&to=2026-12-31',
      user.cookie);
    expect(ranged.statusCode).toBe(200);
    expect(ranged.json().vault.map((row: { title: string }) => row.title)).toEqual(['ต่อภาษีรถ']);

    const inverted = await get(app, '/api/search?q=x&types=vault&from=2026-12-31&to=2026-01-01', user.cookie);
    expect(inverted.statusCode).toBe(400);

    // Library dates come from updated_at, so an old row must fall outside a narrow window.
    const old = Date.parse('2026-01-05T10:00:00');
    database.prepare(`
      INSERT INTO library_items (id, owner_id, title, category, status, source_url_or_author,
        key_takeaways, content, is_favorite, created_at, updated_at)
      VALUES (?, ?, 'บันทึกเก่า', 'คู่มือชีวิต & SOP', 'ใช้งานประจำ', '', '', '', 0, ?, ?)
    `).run(randomUUID(), user.id, old, old);
    await post(app, '/api/library', user.cookie, { title: 'บันทึกใหม่' });

    const libraryRange = await get(app, '/api/search?q=' + encodeURIComponent('บันทึก')
      + '&types=library&from=2025-12-01&to=2025-12-31', user.cookie);
    expect(libraryRange.json().library).toHaveLength(0);

    const libraryAll = await get(app, '/api/search?q=' + encodeURIComponent('บันทึก') + '&types=library', user.cookie);
    expect(libraryAll.json().library).toHaveLength(2);
  });

  it('rejects an unsupported bucket name', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const response = await get(app, '/api/search?q=x&types=vaults', user.cookie);
    expect(response.statusCode).toBe(400);
  });
});
