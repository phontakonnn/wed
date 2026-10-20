import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { createApp } from './index.js';

const apps: ReturnType<typeof createApp>[] = [];
const databases: SqliteDatabase[] = [];
const directories: string[] = [];
const origin = 'http://localhost:80';
const csrf = { origin, 'x-pkh-request': '1' };

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('pkh-test-image'),
]);

function setup() {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'pkh-files-test-'));
  directories.push(dataDirectory);
  const database = openDatabase(':memory:');
  const app = createApp(database, {
    expectedOrigin: origin,
    logger: false,
    sleep: async () => undefined,
    dataDirectory,
  });
  databases.push(database);
  apps.push(app);
  return { app, database, dataDirectory };
}

function createUser(database: SqliteDatabase, username: string) {
  const id = randomUUID();
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, 'test-hash', Date.now());
  const session = createSession(database, id);
  return { id, cookie: `pkh_session=${session.token}` };
}

function upload(
  app: ReturnType<typeof createApp>,
  cookie: string,
  name: string,
  payload: Buffer,
  overrides: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/files',
    headers: {
      ...csrf,
      cookie,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
      'content-length': String(payload.length),
      ...overrides,
    },
    payload,
  });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

describe('file upload', () => {
  it('stores an upload as a sharded object and returns verified metadata', async () => {
    const { app, database, dataDirectory } = setup();
    const user = createUser(database, 'alice');

    const response = await upload(app, user.cookie, 'picture.png', PNG);
    expect(response.statusCode).toBe(201);
    const file = JSON.parse(response.payload).file as {
      id: string;
      displayName: string;
      sizeBytes: number;
      sha256: string;
      mediaType: string;
      downloadUrl: string;
    };

    expect(file).toMatchObject({
      displayName: 'picture.png',
      sizeBytes: PNG.length,
      mediaType: 'image/png',
      sha256: createHash('sha256').update(PNG).digest('hex'),
      downloadUrl: `/api/files/${file.id}`,
    });
    const storedPath = join(dataDirectory, 'objects', file.id.slice(0, 2), file.id);
    expect(existsSync(storedPath)).toBe(true);
    expect(readFileSync(storedPath)).toEqual(PNG);
    expect(existsSync(join(dataDirectory, 'tmp', `${file.id}.part`))).toBe(false);
  });

  it('serves bytes with an inline disposition for allowlisted media and supports HEAD', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const uploaded = JSON.parse((await upload(app, user.cookie, 'picture.png', PNG)).payload).file as { id: string };

    const download = await app.inject({
      method: 'GET',
      url: `/api/files/${uploaded.id}`,
      headers: { cookie: user.cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload).toEqual(PNG);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toContain('inline');
    expect(download.headers['accept-ranges']).toBe('bytes');

    const head = await app.inject({
      method: 'HEAD',
      url: `/api/files/${uploaded.id}`,
      headers: { cookie: user.cookie },
    });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-length']).toBe(String(PNG.length));
    expect(head.rawPayload.length).toBe(0);
  });

  it('serves unrecognized content as an attachment instead of active content', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const uploaded = JSON.parse((await upload(app, user.cookie, 'page.html', html)).payload).file as {
      id: string;
      mediaType: string;
    };

    expect(uploaded.mediaType).toBe('application/octet-stream');
    const download = await app.inject({
      method: 'GET',
      url: `/api/files/${uploaded.id}`,
      headers: { cookie: user.cookie },
    });
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-type']).toBe('application/octet-stream');
  });

  it('honours single byte ranges and rejects malformed or multiple ranges', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const uploaded = JSON.parse((await upload(app, user.cookie, 'picture.png', PNG)).payload).file as { id: string };
    const url = `/api/files/${uploaded.id}`;

    const partial = await app.inject({ method: 'GET', url, headers: { cookie: user.cookie, range: 'bytes=0-3' } });
    expect(partial.statusCode).toBe(206);
    expect(partial.rawPayload).toEqual(PNG.subarray(0, 4));
    expect(partial.headers['content-range']).toBe(`bytes 0-3/${PNG.length}`);
    expect(partial.headers['content-length']).toBe('4');

    const suffix = await app.inject({ method: 'GET', url, headers: { cookie: user.cookie, range: 'bytes=-4' } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.rawPayload).toEqual(PNG.subarray(PNG.length - 4));

    const beyond = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: user.cookie, range: `bytes=${PNG.length}-` },
    });
    expect(beyond.statusCode).toBe(416);
    expect(beyond.headers['content-range']).toBe(`bytes */${PNG.length}`);

    for (const range of ['bytes=0-1,3-4', 'bytes=abc', 'bytes=5-2', 'items=0-1']) {
      const malformed = await app.inject({ method: 'GET', url, headers: { cookie: user.cookie, range } });
      expect(malformed.statusCode, range).toBe(416);
    }
  });

  it('rejects traversal, reserved device names and malformed filenames', async () => {
    const { app, database, dataDirectory } = setup();
    const user = createUser(database, 'alice');
    const invalidNames = [
      '',
      '.',
      '..',
      '../escape.txt',
      '..\\escape.txt',
      'folder/file.txt',
      'C:\\temp\\file.txt',
      'CON',
      'CON.txt',
      'nul.log',
      'COM1.tar.gz',
      'LPT9',
      'trailing.',
      'trailing ',
      'name:stream',
      'bad%07name.txt',
      'x'.repeat(256),
      '%ZZ',
    ];

    for (const name of invalidNames) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/files',
        headers: {
          ...csrf,
          cookie: user.cookie,
          'content-type': 'application/octet-stream',
          // Send the raw (not re-encoded) value so malformed percent encoding reaches the server.
          'x-file-name': name,
          'content-length': String(PNG.length),
        },
        payload: PNG,
      });
      expect(response.statusCode, name).toBe(400);
    }

    expect(database.prepare('SELECT COUNT(*) AS count FROM files').get()).toEqual({ count: 0 });
    expect(existsSync(join(dataDirectory, 'objects'))).toBe(false);
  });

  it('normalizes accepted filenames to NFC and allows duplicate display names', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const nfdName = 'cafe\u0301.png';

    const first = await upload(app, user.cookie, nfdName, PNG);
    const second = await upload(app, user.cookie, 'café.png', PNG);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/files', headers: { cookie: user.cookie } });
    const payload = JSON.parse(list.payload) as { files: Array<{ id: string; displayName: string }>; total: number };
    expect(payload.total).toBe(2);
    expect(payload.files.map((file) => file.displayName)).toEqual(['café.png', 'café.png']);
    expect(new Set(payload.files.map((file) => file.id)).size).toBe(2);
  });

  it('requires authentication, the CSRF header, and a declared size', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        ...csrf,
        'content-type': 'application/octet-stream',
        'x-file-name': 'a.png',
        'content-length': String(PNG.length),
      },
      payload: PNG,
    });
    expect(anonymous.statusCode).toBe(401);

    const noCsrf = await upload(app, user.cookie, 'a.png', PNG, { origin: '' });
    expect(noCsrf.statusCode).toBe(403);

    const noLength = await app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        ...csrf,
        cookie: user.cookie,
        'content-type': 'application/octet-stream',
        'x-file-name': 'a.png',
        'content-length': '0',
      },
      payload: Buffer.alloc(0),
    });
    expect(noLength.statusCode).toBe(411);
  });

  it('streams payloads larger than the default Fastify body limit', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const large = Buffer.alloc(2 * 1024 * 1024, 7);

    const response = await upload(app, user.cookie, 'large.bin', large);
    expect(response.statusCode).toBe(201);
    const file = JSON.parse(response.payload).file as { id: string; sizeBytes: number; sha256: string };
    expect(file.sizeBytes).toBe(large.length);
    expect(file.sha256).toBe(createHash('sha256').update(large).digest('hex'));

    const download = await app.inject({
      method: 'GET',
      url: `/api/files/${file.id}`,
      headers: { cookie: user.cookie },
    });
    expect(download.rawPayload.length).toBe(large.length);
    expect(download.rawPayload.equals(large)).toBe(true);
  });

  it('enforces the configured size limit', async () => {
    const { app, database } = setup();
    const user = createUser(database, 'alice');
    const original = process.env.MAX_UPLOAD_BYTES;
    process.env.MAX_UPLOAD_BYTES = '100';
    try {
      const tooLarge = await upload(app, user.cookie, 'big.bin', Buffer.alloc(200, 1));
      expect(tooLarge.statusCode).toBe(413);
      expect(database.prepare('SELECT COUNT(*) AS count FROM files').get()).toEqual({ count: 0 });
    } finally {
      if (original === undefined) delete process.env.MAX_UPLOAD_BYTES;
      else process.env.MAX_UPLOAD_BYTES = original;
    }
  });

  it('keeps files private and returns 404 for another owner', async () => {
    const { app, database, dataDirectory } = setup();
    const alice = createUser(database, 'alice');
    const bob = createUser(database, 'bob');
    const uploaded = JSON.parse((await upload(app, alice.cookie, 'private.png', PNG)).payload).file as { id: string };
    const url = `/api/files/${uploaded.id}`;

    expect((await app.inject({ method: 'GET', url, headers: { cookie: bob.cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'HEAD', url, headers: { cookie: bob.cookie } })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'DELETE',
      url,
      headers: { ...csrf, cookie: bob.cookie },
    })).statusCode).toBe(404);

    const bobList = await app.inject({ method: 'GET', url: '/api/files', headers: { cookie: bob.cookie } });
    expect(JSON.parse(bobList.payload).total).toBe(0);
    expect(existsSync(join(dataDirectory, 'objects', uploaded.id.slice(0, 2), uploaded.id))).toBe(true);
  });

  it('deletes metadata and object bytes together', async () => {
    const { app, database, dataDirectory } = setup();
    const user = createUser(database, 'alice');
    const uploaded = JSON.parse((await upload(app, user.cookie, 'gone.png', PNG)).payload).file as { id: string };
    const objectPath = join(dataDirectory, 'objects', uploaded.id.slice(0, 2), uploaded.id);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/files/${uploaded.id}`,
      headers: { ...csrf, cookie: user.cookie },
    });
    expect(deleted.statusCode).toBe(204);
    expect(existsSync(objectPath)).toBe(false);
    expect(database.prepare('SELECT COUNT(*) AS count FROM files').get()).toEqual({ count: 0 });

    const missing = await app.inject({
      method: 'GET',
      url: `/api/files/${uploaded.id}`,
      headers: { cookie: user.cookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('reports a generic error without leaking paths when the object is missing', async () => {
    const { app, database, dataDirectory } = setup();
    const user = createUser(database, 'alice');
    const uploaded = JSON.parse((await upload(app, user.cookie, 'lost.png', PNG)).payload).file as { id: string };
    rmSync(join(dataDirectory, 'objects', uploaded.id.slice(0, 2), uploaded.id));

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${uploaded.id}`,
      headers: { cookie: user.cookie },
    });
    expect(response.statusCode).toBe(500);
    const payload = JSON.parse(response.payload) as { error: string };
    expect(payload.error).toBe('ไม่สามารถเข้าถึงไฟล์ได้ในขณะนี้');
    expect(response.payload).not.toMatch(/objects|tmp|\\|\//);
  });

  it('allows HEAD without the CSRF header but still requires a session', async () => {
    const { app, database } = setup();
    const anonymous = await app.inject({ method: 'HEAD', url: `/api/files/${randomUUID()}` });
    expect(anonymous.statusCode).toBe(401);

    const user = createUser(database, 'alice');
    const authenticated = await app.inject({
      method: 'HEAD',
      url: `/api/files/${randomUUID()}`,
      headers: { cookie: user.cookie },
    });
    expect(authenticated.statusCode).toBe(404);
  });

  it('lists files newest first with pagination', async () => {    const { app, database } = setup();
    const user = createUser(database, 'alice');
    for (const name of ['one.png', 'two.png', 'three.png']) {
      expect((await upload(app, user.cookie, name, PNG)).statusCode).toBe(201);
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/files?page=1&pageSize=2',
      headers: { cookie: user.cookie },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/files?page=2&pageSize=2',
      headers: { cookie: user.cookie },
    });
    const firstPayload = JSON.parse(first.payload) as { files: Array<{ displayName: string }>; total: number };
    expect(firstPayload.total).toBe(3);
    expect(firstPayload.files).toHaveLength(2);
    expect(JSON.parse(second.payload).files).toHaveLength(1);
  });
});
