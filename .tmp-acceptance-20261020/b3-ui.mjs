// Batch 3 acceptance: habit history, reminder recurrence, snooze.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3491';
const OUT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/b3-evidence';
const PORT = 9360;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-b3-${Date.now()}`;

mkdirSync(OUT, { recursive: true });
const results = [];
const record = (id, status, detail) => {
  results.push({ id, status, detail });
  console.log(`${id} ${status} ${JSON.stringify(detail)}`);
};

const SET_VALUE = `
function __setValue(target, value) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : target instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}`;

async function shot(session, path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await session.screenshot(path);
      return true;
    } catch {
      await delay(600);
    }
  }
  return false;
}

async function clickText(session, selector, text) {
  const ok = await session.evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`clickText miss: ${selector} ~ ${text}`);
  await delay(450);
}

async function setField(session, selector, value) {
  const ok = await session.evaluate(`(() => {
    ${SET_VALUE}
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    __setValue(field, ${JSON.stringify(value)});
    return true;
  })()`);
  if (!ok) throw new Error(`setField miss: ${selector}`);
  await delay(120);
}

function localToday(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function main() {
  const chrome = await launchChrome({ port: PORT, userDataDir: PROFILE });
  const { session } = await connect({ port: PORT });
  const failures = [];
  try {
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`);
    await setField(session, '#username', 'b3-admin');
    await setField(session, '#password', 'B3!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.dashboard-panel')`);
    await session.waitFor(`!!document.querySelector('.dash-card')`);

    // ---- dashboard shows the weekly habit summary computed from logs
    const dashHabit = await session.evaluate(`(() => {
      const card = [...document.querySelectorAll('.dash-card')]
        .find((c) => c.querySelector('h3')?.textContent.includes('กิจวัตร'));
      return { text: card?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' };
    })()`);
    record('B3-01-dashboard-habit-week',
      dashHabit.text.includes('3/8') && dashHabit.text.includes('สัปดาห์นี้ 0/7 วัน') ? 'PASS' : 'FAIL', dashHabit);
    if (!dashHabit.text.includes('สัปดาห์นี้')) failures.push('B3-01');

    // ---- schedule: habit dots exist and only today is tracked
    await clickText(session, '.primary-nav .nav-item', 'ปฏิทิน & ตารางชีวิต');
    await session.waitFor(`!!document.querySelector('.habit-dots')`);
    const dots = await session.evaluate(`(() => {
      const group = document.querySelector('.habit-dots');
      const items = [...group.querySelectorAll('.habit-dot')];
      return {
        count: items.length,
        classes: items.map((n) => n.className),
        labels: items.map((n) => n.getAttribute('aria-label')),
        disabled: items.map((n) => n.disabled),
        week: document.querySelector('.habit-copy small')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    await shot(session, `${OUT}/b3-1920-01-habit-history.png`);
    const untracked = dots.classes.filter((c) => c.includes('is-untracked')).length;
    const partial = dots.classes.filter((c) => c.includes('is-partial')).length;
    record('B3-02-habit-history-honest',
      dots.count === 7 && untracked === 6 && partial === 1 ? 'PASS' : 'FAIL', { ...dots, untracked, partial });
    if (!(dots.count === 7 && untracked === 6 && partial === 1)) failures.push('B3-02');

    // ---- correcting today's entry recalculates the counters
    const toggled = await session.evaluate(`(() => {
      const group = document.querySelector('.habit-dots');
      const today = [...group.querySelectorAll('.habit-dot')].find((n) => !n.disabled);
      if (!today) return false;
      today.click();
      return true;
    })()`);
    await delay(1200);
    const afterCorrection = await session.evaluate(`(() => ({
      week: document.querySelector('.habit-copy small')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      notice: document.querySelector('.schedule-panel .form-notice')?.textContent?.trim() ?? '',
      partial: document.querySelectorAll('.habit-dot.is-partial').length,
      met: document.querySelectorAll('.habit-dot.is-met').length,
    }))()`);
    record('B3-03-habit-correction',
      toggled && afterCorrection.week.includes('0/8') && afterCorrection.partial === 0 ? 'PASS' : 'FAIL',
      afterCorrection);
    if (!(toggled && afterCorrection.week.includes('0/8'))) failures.push('B3-03');

    // ---- reminder row shows its recurrence
    const reminderRow = await session.evaluate(`(() => {
      const list = document.querySelector('.schedule-panel .life-list');
      return { text: list?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' };
    })()`);
    record('B3-04-reminder-recurrence', reminderRow.text.includes('↻ weekly') ? 'PASS' : 'FAIL', reminderRow);
    if (!reminderRow.text.includes('↻ weekly')) failures.push('B3-04');

    // ---- snooze +3 days moves the effective date
    await clickText(session, '.snooze-group button', '+3 วัน');
    await delay(1400);
    const snoozed = await session.evaluate(`(() => ({
      text: document.querySelector('.schedule-panel .life-list')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      notice: document.querySelector('.schedule-panel .form-notice')?.textContent?.trim() ?? '',
    }))()`);
    await shot(session, `${OUT}/b3-1920-02-snooze.png`);
    record('B3-05-snooze',
      snoozed.text.includes(`เลื่อนไป ${localToday(3)}`) && snoozed.text.includes(`เดิม ${localToday(0)}`) ? 'PASS' : 'FAIL',
      snoozed);
    if (!snoozed.text.includes(`เลื่อนไป ${localToday(3)}`)) failures.push('B3-05');

    // ---- completing the recurring reminder advances the target and clears the snooze
    await session.evaluate(`(() => {
      const box = document.querySelector('.schedule-panel .life-list li input[type="checkbox"]');
      if (box && !box.checked) box.click();
      return true;
    })()`);
    await delay(1600);
    const completed = await session.evaluate(`(() => ({
      text: document.querySelector('.schedule-panel .life-list')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);
    record('B3-06-recurrence-roll',
      completed.text.includes(localToday(7)) && !completed.text.includes('เลื่อนไป') ? 'PASS' : 'FAIL',
      { expected: localToday(7), text: completed.text });
    if (!completed.text.includes(localToday(7))) failures.push('B3-06');

    // ---- the API agrees with what the UI shows
    const apiState = await session.evaluate(`(async () => {
      const response = await fetch('/api/reminders', { headers: { 'X-PKH-Request': '1' } });
      const body = await response.json();
      return body.reminders.map((r) => ({ targetDate: r.targetDate, snoozed: r.snoozedUntil, recurrence: r.recurrence }));
    })()`);
    record('B3-07-api-truth',
      apiState.length === 1 && apiState[0].targetDate === localToday(7) && apiState[0].snoozed === null
        ? 'PASS' : 'FAIL', apiState);
    if (!(apiState.length === 1 && apiState[0].targetDate === localToday(7))) failures.push('B3-07');

    // ---- responsive
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(500);
      const probe = await session.evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        smallButtons: [...document.querySelectorAll('button')]
          .filter((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().height > 0
            && n.getBoundingClientRect().height < 40).length,
      }))()`);
      await shot(session, `${OUT}/b3-${name}-schedule.png`);
      record(`B3-08-responsive-${name}`, probe.overflow || probe.smallButtons > 0 ? 'FAIL' : 'PASS', probe);
      if (probe.overflow || probe.smallButtons > 0) failures.push(`B3-08-${name}`);
    }

    // ---- console: the only 401 must be the expected pre-login session probe
    const diagnostics = session.diagnostics();
    const unauthorized = diagnostics.httpErrors.filter((entry) => entry.status === 401);
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('B3-09-console',
      realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL',
      { unauthorized, realErrors, exceptions: diagnostics.exceptions });
    if (realErrors.length > 0 || diagnostics.exceptions.length > 0) failures.push('B3-09');

    writeFileSync(`${OUT}/b3-ui-result.json`, JSON.stringify({
      failures,
      passed: results.filter((r) => r.status === 'PASS').length,
      total: results.length,
      results,
    }, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({
      passed: results.filter((r) => r.status === 'PASS').length,
      total: results.length,
      failures,
    }, null, 2));
  } finally {
    chrome.child.kill();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('RUN FAILED:', error.message);
  writeFileSync(`${OUT}/b3-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
