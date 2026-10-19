import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
const Database = serverRequire('better-sqlite3');
const NOTE_COUNT = 10_000;
const ACCURACY_COUNT = 200;
const SHORT_SCAN_LIMIT = 1_000;
const RESULT_LIMIT = 200;
const WARMUP_ROUNDS = 100;
const MEASURE_ROUNDS = 100;
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });

const topics = [
  {
    name: 'finance',
    title: 'วางแผนการเงินประจำเดือน',
    body: 'ตรวจงบประมาณ ค่าใช้จ่าย และยอดคงเหลือก่อนสรุปยอด',
    details: ['กันเงินออมก่อนใช้', 'บันทึกค่าเช่าและค่าน้ำ', 'เก็บใบเสร็จซื้อของเข้าบ้าน'],
  },
  {
    name: 'cooking',
    title: 'บันทึกเมนูอาหาร',
    body: 'ต้มน้ำให้เดือดแล้วเตรียมกาแฟกับอาหารเช้า',
    details: ['ลดน้ำตาลในสูตร', 'จดปริมาณข้าวและผัก', 'เตรียมรายการซื้อของสด'],
  },
  {
    name: 'garden',
    title: 'ดูแลสวนหลังบ้าน',
    body: 'รดน้ำต้นไม้ตอนเช้าและจดการเติบโตของใบอ่อน',
    details: ['ย้ายกระถางไปรับแดด', 'เติมปุ๋ยหมักรอบโคน', 'ตัดกิ่งแห้งออกจากแปลง'],
  },
  {
    name: 'travel',
    title: 'เตรียมแผนเดินทาง',
    body: 'ตรวจตั๋วรถและจองที่พักก่อนเดินทางในวันหยุดยาว',
    details: ['เช็กพยากรณ์อากาศ', 'เตรียมยาและเอกสาร', 'จดร้านอาหารใกล้สถานี'],
  },
  {
    name: 'health',
    title: 'บันทึกสุขภาพประจำวัน',
    body: 'พักสายตา ดื่มน้ำ และสังเกตอาการปวดหัวหลังทำงาน',
    details: ['เดินยืดเส้นช่วงบ่าย', 'นอนให้ครบเจ็ดชั่วโมง', 'จดเวลารับประทานยา'],
  },
  {
    name: 'project',
    title: 'ติดตามงานโครงการ',
    body: 'แบ่งงานเป็นขั้นตอนและทบทวนแผนก่อนส่งสรุปให้ทีม',
    details: ['เช็กกำหนดส่งในปฏิทิน', 'บันทึกความเสี่ยงที่พบ', 'ระบุผู้รับผิดชอบแต่ละงาน'],
  },
  {
    name: 'work',
    title: 'สรุปงานประจำสัปดาห์',
    body: 'หลัง meeting วันจันทร์ให้ส่งสรุปงานและกำหนดเวลาติดตาม',
    details: ['จดประเด็นจากลูกค้า', 'ทบทวนรายการที่ยังค้าง', 'นัดหมายทีมในรอบถัดไป'],
  },
  {
    name: 'study',
    title: 'ทบทวนบทเรียนภาษา',
    body: 'อ่านบันทึกบทเรียนและฝึกเขียนคำศัพท์ใหม่ทุกเย็น',
    details: ['ทำสรุปหนึ่งหน้ากระดาษ', 'ทบทวนคำที่ยังจำไม่ได้', 'พักสั้นระหว่างอ่านหนังสือ'],
  },
  {
    name: 'family',
    title: 'นัดหมายของครอบครัว',
    body: 'จดวันนัดและเตรียมของใช้ก่อนเดินทางไปพบญาติ',
    details: ['โทรยืนยันเวลากับทุกคน', 'ซื้อผลไม้ไปฝาก', 'บันทึกเบอร์ติดต่อฉุกเฉิน'],
  },
  {
    name: 'technology',
    title: 'บันทึกงานระบบและ API',
    body: 'ตรวจ API token และจดผลทดสอบก่อนปล่อย version ใหม่',
    details: ['สำรอง config ก่อนแก้', 'ตรวจ log หลัง deploy', 'ทดสอบ login บนเครื่องสำรอง'],
  },
];

const openings = [
  'บันทึกสิ่งที่ต้องทำไว้เพื่อกลับมาตรวจอีกครั้ง',
  'วันนี้ได้คุยกับทีมและจดรายละเอียดที่สำคัญ',
  'รวบรวมข้อมูลจากหลายแหล่งก่อนตัดสินใจ',
  'ตั้งเป้าหมายเล็ก ๆ ให้ทำเสร็จภายในสัปดาห์นี้',
  'หลังจากลองทำแล้วพบจุดที่ควรปรับปรุง',
];
const closings = [
  'เก็บรายละเอียดไว้ในสมุดเพื่อไม่ให้ลืม',
  'ครั้งหน้าจะตรวจผลและปรับแผนตามข้อมูลจริง',
  'แบ่งเวลาให้เหมาะสมและค่อยทำทีละขั้น',
  'ถ้ามีข้อมูลเพิ่มให้กลับมาแก้บันทึกนี้',
];

function makeAccuracyCorpus() {
  const records = [];
  for (const topic of topics) {
    for (let variant = 0; variant < 20; variant += 1) {
      const details = topic.details[variant % topic.details.length];
      const extra = topic.name === 'finance' && variant === 0
        ? ' จ่ายค่าบริการ 12000 บาทในปี 2569'
        : topic.name === 'work' && variant === 0
          ? ' project ส่งสรุปหลังคุยกับทีม'
          : topic.name === 'work' && variant === 1
            ? ' บันทึกคำว่า Café ไว้ในรายการ'
          : topic.name === 'project' && variant === 0
            ? ' จดว่าเป็นการจดบันทึกต่อเนื่องไม่มีช่องว่าง'
            : topic.name === 'study' && variant === 0
              ? ' คำลงท้ายบางประโยคมีเครื่องหมาย ๆ'
              : '';
      records.push({
        id: records.length + 1,
        title: `${topic.title} ฉบับที่ ${variant + 1}`,
        content: `${openings[variant % openings.length]} ${topic.body} ${details}${extra} ${closings[variant % closings.length]}`,
        topic: topic.name,
      });
    }
  }
  assert.equal(records.length, ACCURACY_COUNT);
  return records;
}

const accuracyCorpus = makeAccuracyCorpus();
const queryCases = [
  { name: 'partial Thai word', query: 'งบประมา' },
  { name: 'middle of sentence', query: 'ก่อนสรุปยอด' },
  { name: 'joined phrase without spaces', query: 'ไม่มีช่องว่าง' },
  { name: 'three-code-point common word', query: 'ที่' },
  { name: 'single Thai character', query: 'ก' },
  { name: 'no matching text', query: 'ควอนตัมสีม่วง' },
  { name: 'Thai tone/mark: mai tho', query: 'น้ำ' },
  { name: 'Thai mai ek and tone mark', query: 'ค่าเช่า' },
  { name: 'NFC composed query', query: 'Café' },
  { name: 'NFD decomposed query', query: 'Cafe\u0301' },
  { name: 'English mixed with Thai', query: 'meeting วันจันทร์' },
  { name: 'numeric value', query: '12000 บาท' },
  { name: 'another short Thai substring', query: 'กา' },
  { name: 'repetition mark', query: 'ๆ' },
  { name: 'English partial word', query: 'meet' },
  { name: 'travel phrase in sentence', query: 'ก่อนเดินทาง' },
  { name: 'garden compound word', query: 'รดน้ำต้นไม้' },
  { name: 'English technical phrase', query: 'API token' },
  { name: 'four-digit year', query: '2569' },
  { name: 'joined Thai phrase', query: 'ทบทวนแผน' },
  { name: 'short query with tone mark', query: 'ก่' },
];

const performanceQueries = [
  'งบประมาณ',
  'กาแฟ',
  'รดน้ำต้นไม้',
  'วันหยุดยาว',
  'ปวดหัว',
  'ทบทวนแผน',
  'meeting วันจันทร์',
  'ที่',
];

function tokenize(value) {
  return [...segmenter.segment(value.normalize('NFC'))]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment.normalize('NFC'));
}

function exactExpected(query) {
  const normalized = query.normalize('NFC');
  return accuracyCorpus
    .filter((note) => `${note.title} ${note.content}`.normalize('NFC').includes(normalized))
    .map((note) => note.id);
}

const expectedByQuery = queryCases.map((testCase) => ({
  ...testCase,
  originalQuery: testCase.query,
  query: testCase.query.normalize('NFC'),
  expectedIds: exactExpected(testCase.query),
  codePoints: [...testCase.query].length,
}));

assert.ok(Intl.Segmenter.supportedLocalesOf(['th']).includes('th'));
assert.ok(tokenize('ภาษาไทยไม่มีช่องว่าง').includes('ภาษา'));
assert.ok(tokenize('ภาษาไทยไม่มีช่องว่าง').includes('ไทย'));
assert.ok(expectedByQuery.some((testCase) => testCase.expectedIds.length === 0));
assert.ok(expectedByQuery.filter((testCase) => testCase.codePoints < 3).length >= 4);
assert.notEqual(
  expectedByQuery.find((testCase) => testCase.name === 'NFC composed query').originalQuery,
  expectedByQuery.find((testCase) => testCase.name === 'NFD decomposed query').originalQuery,
);
assert.deepEqual(
  expectedByQuery.find((testCase) => testCase.name === 'NFC composed query').expectedIds,
  expectedByQuery.find((testCase) => testCase.name === 'NFD decomposed query').expectedIds,
);

function createIndex(database, mode, notes) {
  const ftsRows = mode === 'hybrid' ? ['trigram_fts', 'token_fts'] : [`${mode}_fts`];
  const startedAt = performance.now();
  for (const name of ftsRows) {
    database.exec(`CREATE VIRTUAL TABLE ${name} USING fts5(title, content, tokenize=${name === 'trigram_fts' ? "'trigram'" : "'unicode61'"})`);
  }

  const trigramInsert = ftsRows.includes('trigram_fts')
    ? database.prepare('INSERT INTO trigram_fts(rowid, title, content) VALUES (?, ?, ?)')
    : null;
  const tokenInsert = ftsRows.includes('token_fts')
    ? database.prepare('INSERT INTO token_fts(rowid, title, content) VALUES (?, ?, ?)')
    : ftsRows.includes('tokenized_fts')
      ? database.prepare('INSERT INTO tokenized_fts(rowid, title, content) VALUES (?, ?, ?)')
      : null;

  if (mode === 'trigram') {
    database.exec(`
      INSERT INTO trigram_fts(rowid, title, content)
      SELECT id, title, content FROM notes
    `);
  } else if (mode === 'tokenized') {
    const insertRows = database.transaction(() => {
      for (const note of notes) {
        tokenInsert.run(note.id, tokenize(note.title).join(' '), tokenize(note.content).join(' '));
      }
    });
    insertRows();
  } else {
    const insertRows = database.transaction(() => {
      for (const note of notes) {
        trigramInsert.run(note.id, note.title, note.content);
        tokenInsert.run(note.id, tokenize(note.title).join(' '), tokenize(note.content).join(' '));
      }
    });
    insertRows();
  }
  return performance.now() - startedAt;
}

function createSearch(database, mode) {
  const queryTrigram = mode === 'tokenized' ? null : database.prepare(`
    SELECT n.id
    FROM trigram_fts AS f
    JOIN notes AS n ON n.id = f.rowid
    WHERE trigram_fts MATCH ?
      AND (? IS NULL OR n.id <= ?)
    ORDER BY n.id DESC
    LIMIT ${RESULT_LIMIT}
  `);
  const queryTokenized = mode === 'trigram' ? null : (table, phrase, maxId) => database.prepare(`
    SELECT n.id
    FROM ${table} AS f
    JOIN notes AS n ON n.id = f.rowid
    WHERE ${table} MATCH ?
      AND (? IS NULL OR n.id <= ?)
    ORDER BY n.id DESC
    LIMIT ${RESULT_LIMIT}
  `).all(phrase, maxId, maxId);
  const queryShortFallback = mode === 'tokenized' ? null : database.prepare(`
    WITH candidates AS MATERIALIZED (
      SELECT id, title, content
      FROM notes
      WHERE (? IS NULL OR id <= ?)
      ORDER BY id DESC
      LIMIT ${SHORT_SCAN_LIMIT}
    )
    SELECT id, title, content
    FROM candidates
    ORDER BY id DESC
  `);
  const exact = database.prepare('SELECT id, title, content FROM notes WHERE id = ?');

  const tokenPhrase = (query) => {
    const words = tokenize(query);
    return words.length === 0 ? null : `"${words.join(' ').replaceAll('"', '""')}"`;
  };
  const literalPhrase = (query) => `"${query.replaceAll('"', '""')}"`;

  return (rawQuery, maxId = null) => {
    const query = rawQuery.normalize('NFC');
    const short = [...query].length < 3;
    if (mode === 'trigram' && !short) {
      return queryTrigram.all(literalPhrase(query), maxId, maxId).map((row) => row.id);
    }
    if (mode === 'trigram' && short) {
      return queryShortFallback.all(maxId, maxId)
        .filter((row) => `${row.title} ${row.content}`.normalize('NFC').includes(query))
        .slice(0, RESULT_LIMIT)
        .map((row) => row.id);
    }
    if (mode === 'tokenized') {
      const phrase = tokenPhrase(query);
      return phrase
        ? queryTokenized('tokenized_fts', phrase, maxId)
          .map((row) => row.id)
          .filter((id) => {
            const row = exact.get(id);
            return row && `${row.title} ${row.content}`.normalize('NFC').includes(query);
          })
        : [];
    }
    if (short) {
      const phrase = tokenPhrase(query);
      const tokenIds = phrase
        ? queryTokenized('token_fts', phrase, maxId).map((row) => row.id)
        : [];
      const tokenMatches = tokenIds
        .map((id) => exact.get(id))
        .filter((row) => row && `${row.title} ${row.content}`.normalize('NFC').includes(query))
        .map((row) => row.id);
      const fallbackIds = queryShortFallback.all(maxId, maxId)
        .filter((row) => `${row.title} ${row.content}`.normalize('NFC').includes(query))
        .map((row) => row.id);
      return [...new Set([...tokenMatches, ...fallbackIds])].sort((a, b) => b - a).slice(0, RESULT_LIMIT);
    }

    const trigramIds = queryTrigram.all(literalPhrase(query), maxId, maxId).map((row) => row.id);
    const phrase = tokenPhrase(query);
    const tokenIds = phrase ? queryTokenized('token_fts', phrase, maxId).map((row) => row.id) : [];
    const candidates = [...new Set([...trigramIds, ...tokenIds])];
    return candidates
      .map((id) => exact.get(id))
      .filter((row) => row && `${row.title} ${row.content}`.normalize('NFC').includes(query))
      .map((row) => row.id)
      .sort((a, b) => b - a)
      .slice(0, RESULT_LIMIT);
  };
}

function measureAccuracy(search) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const cases = [];
  for (const testCase of expectedByQuery) {
    const foundIds = search(testCase.originalQuery, ACCURACY_COUNT);
    const expected = new Set(testCase.expectedIds);
    const found = new Set(foundIds);
    if (expected.size === 0) assert.equal(found.size, 0, `Unexpected hit for ${testCase.name}`);
    const tp = [...found].filter((id) => expected.has(id)).length;
    const fp = [...found].filter((id) => !expected.has(id)).length;
    const fn = [...expected].filter((id) => !found.has(id)).length;
    truePositive += tp;
    falsePositive += fp;
    falseNegative += fn;
    cases.push({
      name: testCase.name,
      query: testCase.originalQuery,
      codePoints: testCase.codePoints,
      expected: expected.size,
      found: found.size,
      precision: found.size === 0 ? (expected.size === 0 ? 1 : 0) : tp / found.size,
      recall: expected.size === 0 ? 1 : tp / expected.size,
      missedIds: [...expected].filter((id) => !found.has(id)).slice(0, 8),
      falsePositiveIds: [...found].filter((id) => !expected.has(id)).slice(0, 8),
    });
  }
  const precision = truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);
  const recall = truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);
  return {
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall),
    meets95PercentPrecisionAndRecall: precision >= 0.95 && recall >= 0.95,
    cases,
  };
}

function percentile(sortedValues, percentileValue) {
  return sortedValues[Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1)];
}

function measureLatency(search) {
  for (const query of performanceQueries) {
    for (let index = 0; index < WARMUP_ROUNDS; index += 1) search(query);
  }
  const samples = [];
  for (const query of performanceQueries) {
    for (let index = 0; index < MEASURE_ROUNDS; index += 1) {
      const start = performance.now();
      search(query);
      samples.push(performance.now() - start);
    }
  }
  samples.sort((a, b) => a - b);
  return {
    queryCount: performanceQueries.length,
    warmupRoundsPerQuery: WARMUP_ROUNDS,
    measuredRoundsPerQuery: MEASURE_ROUNDS,
    samples: samples.length,
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
  };
}

function databaseIndexBytes(database, tablePrefix) {
  return database.prepare(`
    SELECT COALESCE(SUM(pgsize), 0) AS bytes
    FROM dbstat
    WHERE name LIKE ?
  `).get(`${tablePrefix}%`).bytes;
}

const tempDirectory = mkdtempSync(join(tmpdir(), 'pkh-thai-search-'));
const modes = ['trigram', 'tokenized', 'hybrid'];
const report = {
  test: 'Thai Notes search strategy evaluation',
  generatedAt: new Date().toISOString(),
  corpus: {
    accuracyNotes: accuracyCorpus.length,
    performanceNotes: NOTE_COUNT,
    queryCases: queryCases.length,
    expectedResultsAreLiteralNfcSubstringOracle: true,
    performanceQueries,
  },
  runtime: {
    node: process.version,
    icu: process.versions.icu,
    unicode: process.versions.unicode,
    sqliteDriver: serverRequire('better-sqlite3/package.json').version,
    sqlite: null,
    thaiLocaleSupported: Intl.Segmenter.supportedLocalesOf(['th']).includes('th'),
    thaiSegmenterSample: tokenize('ภาษาไทยไม่มีช่องว่าง'),
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    tempDatabaseOnly: true,
  },
  measurement: {
    latencyClock: 'node:perf_hooks performance.now()',
    latencyIncludesResultMaterialization: true,
    indexSize: 'SQLite dbstat page-size sum for FTS table and shadow tables; excludes notes table',
    insertUpdate: '250 indexed writes/updates in one synchronous transaction; mean per operation',
    queryResultLimit: RESULT_LIMIT,
    shortQueryScanLimit: SHORT_SCAN_LIMIT,
  },
  strategies: {},
};

assert.ok(report.runtime.thaiLocaleSupported);
const probe = new Database(':memory:');
try {
  report.runtime.sqlite = probe.prepare('SELECT sqlite_version() AS version').get().version;
  probe.exec("CREATE VIRTUAL TABLE trigram_probe USING fts5(content, tokenize='trigram')");
  probe.prepare('INSERT INTO trigram_probe(content) VALUES (?)')
    .run('ภาษาไทยสำหรับทดสอบค้นหา');
  assert.equal(
    probe.prepare('SELECT COUNT(*) AS count FROM trigram_probe WHERE trigram_probe MATCH ?')
      .get('ภาษา').count,
    1,
  );
  assert.equal(
    probe.prepare('SELECT COUNT(*) AS count FROM trigram_probe WHERE trigram_probe MATCH ?')
      .get('ทด').count,
    0,
  );
  report.runtime.trigramTokenizerAvailable = true;
  report.runtime.shortTrigramMatchCount = 0;
} finally {
  probe.close();
}

const performanceCorpus = Array.from({ length: NOTE_COUNT }, (_, index) => {
  const base = accuracyCorpus[index % accuracyCorpus.length];
  const round = Math.floor(index / accuracyCorpus.length) + 1;
  return {
    id: index + 1,
    title: round === 1 ? base.title : `${base.title} รอบที่ ${round}`,
    content: round === 1
      ? base.content
      : `${base.content} รอบที่ ${round} บันทึกงานลำดับ ${index + 1} เพื่อทดสอบการค้นหา`,
  };
});

function measureFullScanFallback() {
  const filename = join(tempDirectory, 'short-query-full-scan.sqlite');
  const database = new Database(filename);
  const ownerId = 'benchmark-owner';
  const shortQueries = [
    { name: 'single Thai character', query: 'ก' },
    { name: 'single repetition mark', query: 'ๆ' },
    { name: 'two-character Thai substring', query: 'กา' },
    { name: 'two-character partial word', query: 'งบ' },
    { name: 'single NFC accented character over NFD text', query: 'é' },
    { name: 'NFD two-code-point query over NFD text', query: 'e\u0301' },
    { name: 'no matching short query', query: 'zz' },
  ];
  const pageSize = 50;

  try {
    database.pragma('journal_mode = DELETE');
    database.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX notes_owner_deleted_id_idx
        ON notes(owner_id, deleted_at, id DESC);
    `);
    database.function('nfc', { deterministic: true }, (value) => String(value).normalize('NFC'));
    const insert = database.prepare(`
      INSERT INTO notes (id, owner_id, title, content, deleted_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const indexedCorpus = performanceCorpus.map((note, index) => {
      const ownership = index % 50;
      const isDeleted = ownership === 48;
      return {
        ...note,
        ownerId: ownership < 49 ? ownerId : 'other-owner',
        deletedAt: isDeleted ? 1 : null,
        content: index % 701 === 0 ? `${note.content} Café`.normalize('NFD') : note.content,
      };
    });
    database.transaction(() => {
      for (const note of indexedCorpus) {
        insert.run(note.id, note.ownerId, note.title, note.content, note.deletedAt);
      }
    })();

    const countMatches = database.prepare(`
      SELECT COUNT(*) AS total
      FROM notes
      WHERE owner_id = ?
        AND deleted_at IS NULL
        AND instr(nfc(title) || ' ' || nfc(content), nfc(?)) > 0
    `);
    const pageMatches = database.prepare(`
      SELECT id
      FROM notes
      WHERE owner_id = ?
        AND deleted_at IS NULL
        AND instr(nfc(title) || ' ' || nfc(content), nfc(?)) > 0
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);
    const search = (rawQuery, page = 1) => {
      const query = rawQuery.normalize('NFC');
      const total = countMatches.get(ownerId, query).total;
      const notes = pageMatches.all(ownerId, query, pageSize, (page - 1) * pageSize);
      return { notes, page, pageSize, total };
    };
    const candidateCount = database.prepare(`
      SELECT COUNT(*) AS total
      FROM notes
      WHERE owner_id = ? AND deleted_at IS NULL
    `).get(ownerId).total;
    assert.equal(indexedCorpus.length, NOTE_COUNT);
    assert.equal(candidateCount, NOTE_COUNT * 0.96);

    const expectedMatches = (rawQuery) => {
      const query = rawQuery.normalize('NFC');
      return indexedCorpus
        .filter((note) => note.ownerId === ownerId && note.deletedAt === null)
        .filter((note) => `${note.title} ${note.content}`.normalize('NFC').includes(query))
        .sort((left, right) => right.id - left.id)
        .map((note) => note.id);
    };
    const cases = shortQueries.map(({ name, query }) => {
      assert.ok([...query.normalize('NFC')].length < 3, `${name} must be shorter than 3 code points`);
      const expected = expectedMatches(query);
      const firstPage = search(query, 1);
      const secondPage = search(query, 2);
      assert.equal(firstPage.total, expected.length, `${name}: total count`);
      const lastPage = Math.max(1, Math.ceil(expected.length / pageSize));
      for (const page of new Set([1, 2, lastPage])) {
        const actual = search(query, page);
        assert.deepEqual(
          actual.notes.map((note) => note.id),
          expected.slice((page - 1) * pageSize, page * pageSize),
          `${name}: page ${page}`,
        );
      }
      assert.deepEqual(secondPage.notes.map((note) => note.id), expected.slice(pageSize, pageSize * 2));
      assert.equal(search(query, lastPage + 1).notes.length, 0);
      return {
        name,
        query,
        codePoints: [...query].length,
        expectedMatches: expected.length,
        actualMatches: firstPage.total,
        firstPageReturned: firstPage.notes.length,
        secondPageReturned: secondPage.notes.length,
      };
    });
    const warmupRoundsPerQuery = WARMUP_ROUNDS;
    const measuredRoundsPerQuery = MEASURE_ROUNDS;
    for (const { query } of shortQueries) {
      for (let round = 0; round < warmupRoundsPerQuery; round += 1) search(query);
    }
    const samples = [];
    for (const { query } of shortQueries) {
      for (let round = 0; round < measuredRoundsPerQuery; round += 1) {
        const startedAt = performance.now();
        search(query);
        samples.push(performance.now() - startedAt);
      }
    }
    samples.sort((left, right) => left - right);
    return {
      corpusNotes: NOTE_COUNT,
      activeNotesForOwner: candidateCount,
      deletedOwnerNotesExcluded: NOTE_COUNT * 0.02,
      otherOwnerNotesExcluded: NOTE_COUNT * 0.02,
      pageSize,
      method: 'SQLite instr() over title/content with an NFC scalar function; two bounded SQL queries (count and requested page), owner_id and deleted_at filters applied in SQLite',
      normalization: 'NFC applied to query, title, and content during each full scan',
      latencyClock: 'node:perf_hooks performance.now(); includes count and page query execution/materialization',
      warmupRoundsPerQuery,
      measuredRoundsPerQuery,
      samples: samples.length,
      p50Ms: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      queries: cases,
      precision: 1,
      recall: 1,
    };
  } finally {
    database.close();
  }
}

try {
  for (const mode of modes) {
    const filename = join(tempDirectory, `${mode}.sqlite`);
    const database = new Database(filename);
    try {
      database.pragma('journal_mode = DELETE');
      database.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL
        );
      `);
      const insertNote = database.prepare('INSERT INTO notes(id, title, content) VALUES (?, ?, ?)');
      const insertCorpus = database.transaction(() => {
        for (const note of performanceCorpus) insertNote.run(note.id, note.title, note.content);
      });
      insertCorpus();
      database.exec('VACUUM');
      const baseFileBytes = statSync(filename).size;
      const indexBuildMs = createIndex(database, mode, performanceCorpus);
      database.exec('VACUUM');
      const totalFileBytes = statSync(filename).size;
      const indexBytes = mode === 'trigram'
        ? databaseIndexBytes(database, 'trigram_fts')
        : mode === 'tokenized'
          ? databaseIndexBytes(database, 'tokenized_fts')
          : databaseIndexBytes(database, 'trigram_fts') + databaseIndexBytes(database, 'token_fts');

      const search = createSearch(database, mode);
      const accuracy = measureAccuracy(search);
      const latency = measureLatency(search);
      const shortArchiveCases = ['ๆ', 'กา'].map((query) => {
        const normalized = query.normalize('NFC');
        const allExpected = performanceCorpus
          .filter((note) => `${note.title} ${note.content}`.normalize('NFC').includes(normalized))
          .map((note) => note.id);
        const recentExpected = performanceCorpus
          .slice(-SHORT_SCAN_LIMIT)
          .filter((note) => `${note.title} ${note.content}`.normalize('NFC').includes(normalized));
        const found = search(query);
        assert.ok([...normalized].length < 3);
        assert.ok(found.length <= RESULT_LIMIT);
        if (mode !== 'tokenized') {
          assert.ok(found.every((id) => id > NOTE_COUNT - SHORT_SCAN_LIMIT));
        }
        return {
          query,
          codePoints: [...normalized].length,
          expectedAcrossArchive: allExpected.length,
          expectedInRecentScanWindow: recentExpected.length,
          returned: found.length,
          recallAcrossArchive: allExpected.length === 0 ? 1 : found.length / allExpected.length,
          searchIsCompleteAcrossArchive: found.length === allExpected.length,
        };
      });
      if (mode === 'tokenized') {
        assert.ok(accuracy.recall < 0.95);
      } else {
        assert.ok(accuracy.precision >= 0.95);
        assert.ok(accuracy.recall >= 0.95);
      }
      assert.ok(shortArchiveCases.every((testCase) => testCase.recallAcrossArchive < 0.95));
      const shortArchiveRecallPass = shortArchiveCases
        .every((testCase) => testCase.recallAcrossArchive >= 0.95);
      const ids = Array.from({ length: 250 }, (_, index) => NOTE_COUNT - index);
      const selectForWrite = database.prepare('SELECT id, title, content FROM notes WHERE id = ?');
      const updateNote = database.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ?');
      const insertTrigram = mode === 'trigram' || mode === 'hybrid'
        ? database.prepare('INSERT INTO trigram_fts(rowid, title, content) VALUES (?, ?, ?)')
        : null;
      const deleteTrigram = mode === 'trigram' || mode === 'hybrid'
        ? database.prepare('DELETE FROM trigram_fts WHERE rowid = ?')
        : null;
      const tokenTable = mode === 'hybrid' ? 'token_fts' : 'tokenized_fts';
      const insertToken = mode === 'tokenized' || mode === 'hybrid'
        ? database.prepare(`INSERT INTO ${tokenTable}(rowid, title, content) VALUES (?, ?, ?)`)
        : null;
      const deleteToken = mode === 'tokenized' || mode === 'hybrid'
        ? database.prepare(`DELETE FROM ${tokenTable} WHERE rowid = ?`)
        : null;
      const bulkWriteMs = (update) => {
        const startedAt = performance.now();
        const transaction = database.transaction(() => {
          for (const id of ids) {
            const old = selectForWrite.get(id);
            const title = update ? `${old.title} ปรับปรุง` : `บันทึกเพิ่ม ${id}`;
            const content = update ? `${old.content} เนื้อหาที่แก้ไข` : `ข้อความใหม่สำหรับทดสอบ ${id}`;
            if (update) {
              updateNote.run(title, content, id);
            } else {
              insertNote.run(NOTE_COUNT + id, title, content);
            }
            if (mode === 'trigram' || mode === 'hybrid') {
              if (update) deleteTrigram.run(id);
              insertTrigram.run(update ? id : NOTE_COUNT + id, title, content);
            }
            if (mode === 'tokenized' || mode === 'hybrid') {
              if (update) deleteToken.run(id);
              insertToken.run(
                update ? id : NOTE_COUNT + id,
                tokenize(title).join(' '),
                tokenize(content).join(' '),
              );
            }
          }
        });
        transaction();
        return performance.now() - startedAt;
      };
      const insert250Ms = bulkWriteMs(false);
      const update250Ms = bulkWriteMs(true);

      report.strategies[mode] = {
        indexBuildMs,
        baseDatabaseBytes: baseFileBytes,
        totalDatabaseBytes: totalFileBytes,
        ftsIndexBytes: indexBytes,
        ftsIndexKiB: indexBytes / 1024,
        accuracy: {
          precision: accuracy.precision,
          recall: accuracy.recall,
          f1: accuracy.f1,
          meets95PercentPrecisionAndRecall: accuracy.meets95PercentPrecisionAndRecall,
          meets95PercentIncludingShortArchiveCases:
            accuracy.meets95PercentPrecisionAndRecall && shortArchiveRecallPass,
          casesBelow95Percent: accuracy.cases
            .filter((testCase) => testCase.recall < 0.95 || testCase.precision < 0.95)
            .map(({ name, query, expected, found, precision, recall, missedIds, falsePositiveIds }) => ({
              name, query, expected, found, precision, recall, missedIds, falsePositiveIds,
            })),
        },
        latency,
        insert250: { totalMs: insert250Ms, meanMsPerNote: insert250Ms / ids.length },
        update250: { totalMs: update250Ms, meanMsPerNote: update250Ms / ids.length },
        shortQueryCases: accuracy.cases
          .filter((testCase) => testCase.codePoints < 3)
          .map(({ name, query, codePoints, expected, found, precision, recall }) => ({
            name, query, codePoints, expected, found, precision, recall,
          })),
        shortArchiveCases,
      };
    } finally {
      database.close();
    }
  }
  report.fullScanFallback = measureFullScanFallback();
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
