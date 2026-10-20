// Batch 4 acceptance seed: creates content for the 5 attachment modules and all 8 search buckets.
// Talks to the API with fetch so Thai text stays UTF-8 (curl through the Windows shell mangles it).
const BASE = process.env.BASE ?? 'http://127.0.0.1:3494';
const USER = process.env.SEED_USER ?? 'b4-admin';
const PASS = process.env.SEED_PASS ?? 'B4!2026-demo';

const headers = {
  'Content-Type': 'application/json',
  Origin: BASE,
  Host: new URL(BASE).host,
  'X-PKH-Request': '1',
};

function localDate(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')])
    .map((value) => value.split(';')[0])
    .join('; ');

  const send = async (method, path, body) => {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...headers, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };

  const upload = async (name, text) => {
    const response = await fetch(`${BASE}/api/files`, {
      method: 'POST',
      headers: {
        cookie,
        Origin: BASE,
        Host: new URL(BASE).host,
        'X-PKH-Request': '1',
        'x-file-name': encodeURIComponent(name),
        'content-type': 'application/octet-stream',
      },
      body: Buffer.from(text, 'utf8'),
    });
    if (!response.ok) throw new Error(`upload ${name} -> ${response.status} ${await response.text()}`);
    const payload = await response.json();
    return payload.file;
  };

  const noteA = (await send('POST', '/api/notes', { title: 'B4 โน้ตทดสอบการแนบไฟล์', content: 'เนื้อหาทดสอบ B4 สำหรับการแนบไฟล์' })).note;
  const noteB = (await send('POST', '/api/notes', { title: 'B4 ประชุมทีมประจำสัปดาห์', content: 'วาระประชุม B4 และสรุปงาน' })).note;
  const taskNear = (await send('POST', '/api/tasks', {
    title: 'B4 งานด่วนสัปดาห์นี้',
    priority: 'high',
    dueDate: localDate(3),
  })).task;
  const taskFar = (await send('POST', '/api/tasks', {
    title: 'B4 งานไกลเดือนหน้า',
    priority: 'low',
    dueDate: localDate(40),
  })).task;
  const project = (await send('POST', '/api/projects', {
    name: 'B4 โปรเจกต์อัลฟา',
    description: 'โปรเจกต์สำหรับทดสอบไฟล์แนบ',
    dueDate: localDate(5),
  })).project;
  const goal = (await send('POST', '/api/goals', {
    title: 'B4 เป้าหมายรายได้',
    metric: 'รายได้',
    targetValue: 100000,
    currentValue: 25000,
    dueDate: localDate(30),
  })).goal;
  const person = (await send('POST', '/api/people', {
    name: 'B4 สมชาย ทดสอบ',
    relationshipGroup: 'friend',
    roleLabel: 'เพื่อนร่วมงาน',
  })).person;
  const bookmark = (await send('POST', '/api/bookmarks', {
    title: 'B4 เอกสารอ้างอิง',
    url: 'https://example.com/b4',
    description: 'ลิงก์อ้างอิงสำหรับการทดสอบ B4',
  })).bookmark;
  const reminder = (await send('POST', '/api/reminders', {
    title: 'B4 แจ้งเตือนประชุม',
    targetDate: localDate(3),
    category: 'other',
  })).reminder;

  const fileAlpha = await upload('b4-alpha.txt', 'alpha content for batch 4 acceptance\n');
  const fileBeta = await upload('b4-beta.txt', 'beta content for batch 4 acceptance\n');
  const fileGamma = await upload('b4-gamma.txt', 'gamma content for batch 4 acceptance\n');

  const manifest = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    dates: { today: localDate(0), plus3: localDate(3), plus5: localDate(5), plus30: localDate(30), plus40: localDate(40) },
    ids: {
      noteA: noteA.id,
      noteB: noteB.id,
      taskNear: taskNear.id,
      taskFar: taskFar.id,
      project: project.id,
      goal: goal.id,
      person: person.id,
      bookmark: bookmark.id,
      reminder: reminder.id,
      fileAlpha: fileAlpha.id,
      fileBeta: fileBeta.id,
      fileGamma: fileGamma.id,
    },
    names: {
      noteA: noteA.title,
      taskNear: taskNear.title,
      taskFar: taskFar.title,
      project: project.name,
      goal: goal.title,
      person: person.name,
      bookmark: bookmark.title,
      reminder: reminder.title,
      fileAlpha: fileAlpha.displayName,
    },
  };
  console.log(JSON.stringify(manifest, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
