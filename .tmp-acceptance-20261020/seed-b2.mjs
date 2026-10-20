// Seeds the batch-2 demo account through the HTTP API using Node's UTF-8-safe fetch.
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3481';
const USER = process.env.SEED_USER ?? 'b2-admin';
const PASS = process.env.SEED_PASS ?? 'B2!2026-demo';

const headers = {
  'Content-Type': 'application/json',
  Origin: BASE,
  Host: new URL(BASE).host,
  'X-PKH-Request': '1',
};

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')])
    .map((value) => value.split(';')[0])
    .join('; ');

  const send = async (path, body) => {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { ...headers, cookie },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path} -> ${response.status} ${await response.text()}`);
    return response.json();
  };

  await send('/api/notes', { title: 'โน้ตทดสอบ autosave', content: 'เนื้อหาเริ่มต้น' });
  await delay(30);
  await send('/api/tasks', { title: 'งานครบกำหนดวันนี้', dueDate: new Date().toISOString().slice(0, 10) });
  await send('/api/goals', { title: 'อ่านหนังสือ 24 เล่ม', metric: 'จำนวนเล่มที่อ่านจบ', targetValue: 24, currentValue: 6, unit: 'เล่ม' });
  // A goal with no numeric target: the UI must not invent a percentage for it.
  await send('/api/goals', { title: 'มีเวลาอ่านหนังสือมากขึ้น', metric: 'จดบันทึกทุกสัปดาห์' });
  await send('/api/projects', { name: 'อ่านให้จบปีนี้', outcome: 'อ่านครบ 24 เล่ม' });
  console.log('seeded');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
