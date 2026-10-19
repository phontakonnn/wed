import { afterEach, describe, expect, it } from 'vitest';
import { cpus, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const origin = 'http://localhost:80';
const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];

const templates = [
  { title: 'แผนงบประมาณ', content: 'ตรวจค่าใช้จ่ายโครงการก่อนสรุปยอด รวม 12000 บาท' },
  { title: 'กำหนดการเดินทาง', content: 'ก่อนเดินทางตรวจตั๋วและที่พัก' },
  { title: 'ภาษาไทย', content: 'ประโยคที่ไม่มีช่องว่างตรงกลาง' },
  { title: 'ประชุมทีม', content: 'ทีมจะ review API token ใน meeting วันจันทร์' },
  { title: 'ร้านกาแฟ', content: 'จด Café และ Cafe\u0301 สำหรับทดสอบ normalization' },
  { title: 'ต้นไม้', content: 'รดน้ำต้นไม้ทุกเย็น' },
  { title: 'การค้นข้อมูล', content: 'ค้นหาคำว่า กา ในข้อความยาว' },
  { title: 'ค่าเช่า', content: 'น้ำดื่ม น้ำประปา และค่าเช่ารายเดือน' },
  { title: 'หนังสือ', content: 'สรุปบทเรียนจากการอ่าน' },
  { title: 'แผนงาน', content: 'ทำรายการงานประจำสัปดาห์และอ่านซ้ำ ๆ' },
  { title: 'หัวข้อ partial', content: 'ติดตามงบประมาและค่าใช้จ่าย' },
  { title: 'บันทึกหลากหลาย', content: 'ข้อความทั่วไปไม่มีคำค้นเฉพาะ' },
  { title: 'เครื่องหมาย', content: 'x+y quote"mark colon:mark AND OR NOT star* caret^ minus- (group)' },
  { title: 'ค่าตัวเลข', content: 'ปี 2026 จ่าย 12000 บาท' },
  { title: 'ภาษาไทย', content: 'การอ่านภาษาไทยมีรูปสะกดหลากหลาย' },
  { title: 'ทีม product', content: 'สรุปการสนทนาและ action item' },
  { title: 'สวน', content: 'ดูแลสวน รดน้ำต้นไม้' },
  { title: 'สัมภาษณ์', content: 'เตรียมคำถามสัมภาษณ์งาน' },
  { title: 'บทความ', content: 'บันทึกไอเดียเขียนบทความ emoji 🙂🙂' },
  { title: 'ท่องเที่ยว', content: 'วางแผนก่อนเดินทางไกล' },
];

const queryCases = [
  'งบประมา',
  'ก่อนสรุปยอด',
  'ไม่มีช่องว่าง',
  'กา',
  'ก',
  'ดาวอังคารสีม่วง',
  'น้ำ',
  'ค่าเช่า',
  'Café',
  'Cafe\u0301',
  'meeting วันจันทร์',
  '12000 บาท',
  'ๆ',
  'meet',
  'ก่อนเดินทาง',
  'รดน้ำต้นไม้',
  'API token',
  'x+y',
  'quote"mark',
  'AND OR NOT',
  'star* caret^ minus- (group)',
  'colon:mark',
  '🙂🙂',
  'budget" OR *',
];

function setup() {
  const database = openDatabase(':memory:');
  const app = createApp(database, { expectedOrigin: origin, logger: false });
  databases.push(database);
  apps.push(app);
  const ownerId = 'search-owner';
  database.prepare(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(ownerId, ownerId, 'test-hash', Date.now());
  const session = createSession(database, ownerId);
  const headers = { cookie: `pkh_session=${session.token}` };
  const insertNote = database.prepare(`
    INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const corpus = Array.from({ length: 200 }, (_, index) => {
    const template = templates[index % templates.length];
    const note = {
      id: `fixture-${String(index).padStart(3, '0')}`,
      title: `บันทึก ${template.title}`,
      content: template.content,
    };
    insertNote.run(note.id, ownerId, note.title, note.content, index, index, null);
    return note;
  });
  return { app, database, ownerId, headers, corpus };
}

function searchUrl(query: string, parameters: Record<string, string> = {}): string {
  const search = new URLSearchParams({ q: query, ...parameters });
  return `/api/notes/search?${search}`;
}

function oracleIds(corpus: Array<{ id: string; title: string; content: string }>, query: string): Set<string> {
  const normalizedQuery = query.trim().normalize('NFC');
  return new Set(corpus.filter((note) => (
    `${note.title} ${note.content}`.normalize('NFC').includes(normalizedQuery)
  )).map((note) => note.id));
}

function sortedPercentile(samples: number[], percentile: number): number {
  const values = [...samples].sort((left, right) => left - right);
  return values[Math.ceil(values.length * percentile) - 1];
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
});

describe('Notes search API', () => {
  it('matches the fixed note corpus for Thai, NFC/NFD, mixed text, numbers, and FTS syntax', async () => {
    const { app, headers, corpus } = setup();

    for (const query of queryCases) {
      const response = await app.inject({
        method: 'GET',
        url: searchUrl(query, { pageSize: '200' }),
        headers,
      });
      expect(response.statusCode, `${query}: ${response.payload}`).toBe(200);
      const page = JSON.parse(response.payload) as {
        notes: Array<{ id: string }>;
        page: number;
        pageSize: number;
        total: number;
      };
      const expectedIds = oracleIds(corpus, query);
      expect(page.total, query).toBe(expectedIds.size);
      expect(new Set(page.notes.map((note) => note.id)), query).toEqual(expectedIds);
      expect(page).toMatchObject({ page: 1, pageSize: 200 });
    }
  });

  it('requires a session, validates query and pagination, and keeps GET search CSRF-safe', async () => {
    const { app, headers } = setup();
    let anonymousStatusCode: number | undefined;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      const anonymous = await app.inject({ method: 'GET', url: searchUrl('งบประมาณ') });
      anonymousStatusCode = anonymous.statusCode;
    }
    const validGetWithoutCsrfHeaders = await app.inject({
      method: 'GET',
      url: searchUrl('งบประมาณ'),
      headers,
    });
    const blank = await app.inject({ method: 'GET', url: searchUrl('   '), headers });
    const missingQuery = await app.inject({ method: 'GET', url: '/api/notes/search', headers });
    const invalidPage = await app.inject({
      method: 'GET',
      url: searchUrl('งบประมาณ', { page: '0' }),
      headers,
    });
    const excessivePageSize = await app.inject({
      method: 'GET',
      url: searchUrl('งบประมาณ', { pageSize: '201' }),
      headers,
    });
    const extraParameter = await app.inject({
      method: 'GET',
      url: `${searchUrl('งบประมาณ')}&owner=someone-else`,
      headers,
    });

    expect(anonymousStatusCode).toBe(401);
    expect(validGetWithoutCsrfHeaders.statusCode).toBe(200);
    expect(JSON.parse(validGetWithoutCsrfHeaders.payload)).toMatchObject({ page: 1, pageSize: 50 });
    expect(blank.statusCode).toBe(400);
    expect(missingQuery.statusCode).toBe(400);
    expect(invalidPage.statusCode).toBe(400);
    expect(excessivePageSize.statusCode).toBe(400);
    expect(extraParameter.statusCode).toBe(400);
    expect(blank.payload).not.toMatch(/stack|[A-Z]:\\|apps[\\/]server/iu);
  });

  it('returns a generic error when the search index is unavailable', async () => {
    const { app, database, headers } = setup();
    database.exec('DROP TABLE notes_fts_trigram');

    const response = await app.inject({
      method: 'GET',
      url: searchUrl('งบประมาณ'),
      headers,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'ไม่สามารถค้นหาโน้ตได้ในขณะนี้' });
    expect(response.payload).not.toMatch(/stack|[A-Z]:\\|apps[\\/]server/iu);
  });

  it('isolates owners and excludes trashed notes while paginating to a maximum of 200', async () => {
    const { app, database, ownerId, headers, corpus } = setup();
    database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run('other-owner', 'other-owner', 'test-hash', Date.now());
    const insert = database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('other-match', 'other-owner', 'Private', 'unique-marker', 1, 1, null);
    insert.run('trashed-match', ownerId, 'Private', 'unique-marker', 2, 2, 2);
    const hiddenResults = await app.inject({
      method: 'GET',
      url: searchUrl('unique-marker'),
      headers,
    });
    expect(JSON.parse(hiddenResults.payload)).toMatchObject({ total: 0, notes: [] });

    const firstPage = await app.inject({
      method: 'GET',
      url: searchUrl('บันทึก', { page: '1', pageSize: '50' }),
      headers,
    });
    const secondPage = await app.inject({
      method: 'GET',
      url: searchUrl('บันทึก', { page: '2', pageSize: '50' }),
      headers,
    });
    const maxPage = await app.inject({
      method: 'GET',
      url: searchUrl('บันทึก', { page: '1', pageSize: '200' }),
      headers,
    });
    const beyondEnd = await app.inject({
      method: 'GET',
      url: searchUrl('บันทึก', { page: '5', pageSize: '50' }),
      headers,
    });

    expect(JSON.parse(firstPage.payload)).toMatchObject({ page: 1, pageSize: 50, total: 200 });
    expect(JSON.parse(firstPage.payload).notes).toHaveLength(50);
    expect(JSON.parse(secondPage.payload).notes).toHaveLength(50);
    expect(JSON.parse(maxPage.payload).notes).toHaveLength(200);
    expect(new Set(JSON.parse(maxPage.payload).notes.map((note: { id: string }) => note.id))).toHaveLength(200);
    expect(JSON.parse(beyondEnd.payload)).toMatchObject({ page: 5, pageSize: 50, total: 200, notes: [] });
    expect(oracleIds(corpus, 'บันทึก').size).toBe(200);
  });

  it('enforces the search endpoint rate limit', async () => {
    const { app, headers } = setup();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: searchUrl('งบประมาณ'),
        headers,
      });
      lastStatus = response.statusCode;
      if (attempt < 60) expect(lastStatus).toBe(200);
      else {
        expect(lastStatus).toBe(429);
        expect(response.json()).toEqual({
          statusCode: 429,
          error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
        });
        expect(response.headers['retry-after']).toBeDefined();
        expect(response.payload).not.toMatch(/stack|[A-Z]:\\|apps[\\/]server/iu);
      }
    }
  });

  it('measures both search paths through the local HTTP API on a temporary 10,000-note corpus', async () => {
    const database = openDatabase(':memory:');
    databases.push(database);
    const ownerId = 'benchmark-owner';
    database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(ownerId, ownerId, 'test-hash', Date.now());
    database.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run('benchmark-other', 'benchmark-other', 'test-hash', Date.now());
    const session = createSession(database, ownerId);
    const insert = database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const createCorpus = database.transaction(() => {
      for (let index = 0; index < 10_000; index += 1) {
        const ownerIndex = index % 50;
        const noteOwner = ownerIndex === 49 ? 'benchmark-other' : ownerId;
        const deletedAt = ownerIndex === 48 ? 1 : null;
        insert.run(
          `benchmark-${String(index).padStart(5, '0')}`,
          noteOwner,
          `บันทึก ${index} งบประมาณ`,
          `วางแผนค่าใช้จ่ายโครงการและประชุมทีม กาแฟ ${index % 2 === 0 ? 'ภาษาไทย' : 'รายละเอียด'}`,
          index,
          index,
          deletedAt,
        );
      }
    });
    createCorpus();

    const makeApp = () => {
      const app = createApp(database, { expectedOrigin: origin, logger: false });
      apps.push(app);
      return app;
    };
    const trigramApp = makeApp();
    const fallbackApp = makeApp();
    await Promise.all([
      trigramApp.listen({ port: 0, host: '127.0.0.1' }),
      fallbackApp.listen({ port: 0, host: '127.0.0.1' }),
    ]);
    const trigramAddress = trigramApp.server.address();
    const fallbackAddress = fallbackApp.server.address();
    if (!trigramAddress || typeof trigramAddress === 'string' || !fallbackAddress || typeof fallbackAddress === 'string') {
      throw new Error('The temporary benchmark HTTP servers did not bind to loopback ports');
    }

    async function measure(
      baseUrl: string,
      queries: string[],
    ): Promise<{ p50Ms: number; p95Ms: number; samples: number; resultCount: number }> {
      const timings: number[] = [];
      let resultCount = 0;
      for (let index = 0; index < 50; index += 1) {
        const query = queries[index % queries.length];
        const startedAt = performance.now();
        const response = await fetch(`${baseUrl}${searchUrl(query)}`, {
          headers: { cookie: `pkh_session=${session.token}` },
        });
        const result = await response.json() as { total: number; pageSize: number };
        const elapsedMs = performance.now() - startedAt;
        if (!response.ok) throw new Error(`HTTP search benchmark returned ${response.status}`);
        if (result.pageSize !== 50) throw new Error('Search benchmark did not use the default page size');
        resultCount = result.total;
        if (index >= 10) timings.push(elapsedMs);
      }
      return {
        p50Ms: sortedPercentile(timings, 0.5),
        p95Ms: sortedPercentile(timings, 0.95),
        samples: timings.length,
        resultCount,
      };
    }

    const trigram = await measure(
      `http://127.0.0.1:${trigramAddress.port}`,
      ['งบประมาณ'],
    );
    const fullScan = await measure(
      `http://127.0.0.1:${fallbackAddress.port}`,
      ['ก', 'กา'],
    );
    const benchmark = {
      baseline: {
        platform: process.platform,
        release: release(),
        node: process.version,
        icu: process.versions.icu,
        unicode: process.versions.unicode,
        sqlite: database.prepare('SELECT sqlite_version() AS version').get() as { version: string },
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        ramBytes: totalmem(),
        totalRows: 10_000,
        activeOwnerRows: 9_600,
        trashedOwnerRows: 200,
        otherOwnerRows: 200,
        warmupRequestsPerPath: 10,
        measuredRequestsPerPath: 40,
        transport: 'HTTP fetch to temporary 127.0.0.1 port',
      },
      trigram,
      fullScan,
    };
    console.info(`SEARCH_HTTP_BENCHMARK ${JSON.stringify(benchmark)}`);
    expect(trigram.samples).toBe(40);
    expect(fullScan.samples).toBe(40);
    expect(trigram.resultCount).toBe(9_600);
    expect(fullScan.resultCount).toBeGreaterThan(0);
  }, 60_000);
});
