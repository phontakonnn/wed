// Seeds the BK drill staging DATA_DIR over HTTP so the backup contains real rows and a real object.
const BASE = 'http://127.0.0.1:3498';
const USER = 'bk-admin';
const PASS = 'BK!2026-drill';
const headers = {
  'Content-Type': 'application/json',
  Origin: BASE,
  Host: new URL(BASE).host,
  'X-PKH-Request': '1',
};

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ username: USER, password: PASS }),
});
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')])
  .map((value) => value.split(';')[0])
  .join('; ');

const send = async (method, path, body) => {
  const requestHeaders = { ...headers, cookie };
  if (body === undefined) delete requestHeaders['Content-Type'];
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};

const note = (await send('POST', '/api/notes', {
  title: 'BK drill note',
  content: 'เนื้อหาสำหรับทดสอบการกู้คืนจาก backup',
})).note;
const vault = (await send('POST', '/api/vault', {
  title: 'กรมธรรม์สำหรับ drill',
  category: 'เอกสาร & ประกัน',
  keyValue: 'BK-DRILL-0001',
  renewalOrExpiryDate: '2027-01-31',
})).item;
const library = (await send('POST', '/api/library', {
  title: 'SOP สำหรับ drill',
  keyTakeaways: '1) ทดสอบ\n2) กู้คืน',
  content: 'ขั้นตอนทดสอบการกู้คืน',
})).item;

const upload = await fetch(`${BASE}/api/files`, {
  method: 'POST',
  headers: {
    cookie,
    Origin: BASE,
    Host: new URL(BASE).host,
    'X-PKH-Request': '1',
    'x-file-name': encodeURIComponent('bk-drill-attachment.txt'),
    'content-type': 'application/octet-stream',
  },
  body: Buffer.from('object bytes that must survive backup and restore\n', 'utf8'),
});
if (!upload.ok) throw new Error(`upload ${upload.status} ${await upload.text()}`);
const file = (await upload.json()).file;

await send('POST', `/api/entities/vault/${vault.id}/files`, { fileId: file.id });
await send('POST', `/api/entities/library/${library.id}/files`, { fileId: file.id });

console.log(JSON.stringify({
  noteId: note.id,
  vaultId: vault.id,
  libraryId: library.id,
  fileId: file.id,
  fileName: file.displayName,
  sizeBytes: file.sizeBytes,
}, null, 2));
