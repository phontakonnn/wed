// Seeds the Batch 3 acceptance account through the HTTP API (UTF-8 safe).
const BASE = process.env.BASE ?? 'http://127.0.0.1:3491';
const USER = process.env.SEED_USER ?? 'b3-admin';
const PASS = process.env.SEED_PASS ?? 'B3!2026-demo';

const headers = {
  'Content-Type': 'application/json',
  Origin: BASE,
  Host: new URL(BASE).host,
  'X-PKH-Request': '1',
};

function localToday(offset = 0) {
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

  const habit = await send('/api/habits', { title: 'ดื่มน้ำ', dailyTarget: 8, unit: 'แก้ว' });
  for (let index = 0; index < 3; index += 1) {
    await send(`/api/habits/${habit.habit.id}/check`, {});
  }

  await send('/api/reminders', {
    title: 'ต่อประกันรถ',
    targetDate: localToday(0),
    category: 'other',
    recurrence: 'weekly',
    notifyDaysBefore: 7,
  });

  console.log('seeded');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
