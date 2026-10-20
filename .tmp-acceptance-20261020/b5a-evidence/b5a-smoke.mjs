// B5A live smoke: vault/library over HTTP, then confirm a backup/restore round-trip.
// Usage: node b5a-smoke.mjs seed|check|delete
const BASE = process.env.BASE ?? 'http://127.0.0.1:3496';
const USER = process.env.SEED_USER ?? 'b5a-admin';
const PASS = process.env.SEED_PASS ?? 'B5A!2026-demo';
const phase = process.argv[2] ?? 'check';

const headers = {
  'Content-Type': 'application/json',
  Origin: BASE,
  Host: new URL(BASE).host,
  'X-PKH-Request': '1',
};

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!response.ok) throw new Error(`login ${response.status}`);
  return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')])
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function main() {
  const cookie = await login();
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

  if (phase === 'seed') {
    const vault = (await send('POST', '/api/vault', {
      title: 'กรมธรรม์รถยนต์',
      category: 'เอกสาร & ประกัน',
      keyValue: 'POL-2026-000123',
      physicalLocation: 'ลิ้นชักชั้น 2',
      renewalOrExpiryDate: '2027-03-15',
      amountText: '18,500 บาท/ปี',
      isFavorite: true,
    })).item;
    const library = (await send('POST', '/api/library', {
      title: 'SOP เปิดร้าน',
      category: 'คู่มือชีวิต & SOP',
      status: 'ใช้งานประจำ',
      keyTakeaways: 'เปิดไฟ ตรวจสต็อก เปิดลิ้นชัก',
      content: 'ขั้นตอนที่ 1 เปิดไฟ\nขั้นตอนที่ 2 ตรวจสต็อก',
    })).item;

    const upload = await fetch(`${BASE}/api/files`, {
      method: 'POST',
      headers: {
        cookie,
        Origin: BASE,
        Host: new URL(BASE).host,
        'X-PKH-Request': '1',
        'x-file-name': encodeURIComponent('b5a-policy.txt'),
        'content-type': 'application/octet-stream',
      },
      body: Buffer.from('policy scan for b5a\n', 'utf8'),
    });
    if (!upload.ok) throw new Error(`upload ${upload.status} ${await upload.text()}`);
    const file = (await upload.json()).file;

    await send('POST', `/api/entities/vault/${vault.id}/files`, { fileId: file.id });
    await send('POST', `/api/entities/library/${library.id}/files`, { fileId: file.id });

    const manifest = { vaultId: vault.id, libraryId: library.id, fileId: file.id, title: vault.title };
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (phase === 'delete') {
    const manifest = JSON.parse(process.env.MANIFEST ?? '{}');
    await send('DELETE', `/api/vault/${manifest.vaultId}`);
    await send('DELETE', `/api/library/${manifest.libraryId}`);
    const vaultList = await send('GET', '/api/vault');
    const libraryList = await send('GET', '/api/library');
    console.log(JSON.stringify({
      vaultTotal: vaultList.total,
      libraryTotal: libraryList.total,
    }, null, 2));
    return;
  }

  // check
  const vaultList = await send('GET', '/api/vault');
  const libraryList = await send('GET', '/api/library');
  const search = await send('GET', `/api/search?q=${encodeURIComponent('กรมธรรม์')}&types=vault,library`);
  const vaultFiles = vaultList.items[0]
    ? await send('GET', `/api/entities/vault/${vaultList.items[0].id}/files`)
    : { files: [] };
  const libraryFiles = libraryList.items[0]
    ? await send('GET', `/api/entities/library/${libraryList.items[0].id}/files`)
    : { files: [] };
  console.log(JSON.stringify({
    vaultTotal: vaultList.total,
    vault: vaultList.items[0] ?? null,
    vaultFiles: vaultFiles.files.map((file) => file.displayName),
    libraryTotal: libraryList.total,
    library: libraryList.items[0]
      ? {
        title: libraryList.items[0].title,
        status: libraryList.items[0].status,
        takeaways: libraryList.items[0].keyTakeaways,
      }
      : null,
    libraryFiles: libraryFiles.files.map((file) => file.displayName),
    searchVault: search.vault.length,
    searchLibrary: search.library.length,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
