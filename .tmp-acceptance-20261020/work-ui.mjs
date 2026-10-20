// Temporary smoke test for the work-core UI (inbox, tasks, projects, goals).
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3471';
const OUT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/work-evidence';
const PORT = 9341;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-work-${Date.now()}`;

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

async function clickText(session, selector, text) {
  const ok = await session.evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`clickText miss: ${selector} ~ ${text}`);
  await delay(400);
}

async function shot(session, path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await session.screenshot(path);
      return true;
    } catch {
      await delay(700);
    }
  }
  console.warn('screenshot skipped:', path);
  return false;
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

async function main() {
  const chrome = await launchChrome({ port: PORT, userDataDir: PROFILE });
  const { session } = await connect({ port: PORT });
  const failures = [];
  try {
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`);
    await setField(session, '#username', 'work-admin');
    await setField(session, '#password', 'Work!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.profile-card')`);

    // ---- inbox capture
    await clickText(session, '.primary-nav .nav-item', 'กล่องขาเข้า');
    await session.waitFor(`!!document.querySelector('.work-panel')`);
    await setField(session, '.capture-form textarea', 'โทรหาช่างแอร์เรื่องล้างแอร์');
    await clickText(session, '.capture-form button', 'เก็บเข้ากล่อง');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`, { label: 'inbox item' });
    const inboxState = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      text: document.querySelector('.work-row strong')?.textContent?.trim() ?? '',
      actions: [...document.querySelectorAll('.work-row .text-button')].map((n) => n.textContent.trim()),
      notice: document.querySelector('.work-panel .form-notice')?.textContent?.trim() ?? '',
      count: document.querySelector('.work-panel .updated-label')?.textContent?.trim() ?? '',
    }))()`);
    await shot(session, `${OUT}/work-1920-01-inbox.png`);
    record('W-01-inbox-capture', inboxState.rows === 1 && inboxState.text.includes('ช่างแอร์') ? 'PASS' : 'FAIL', inboxState);
    if (inboxState.rows !== 1) failures.push('W-01');

    // ---- convert to task
    await clickText(session, '.work-row .text-button', 'เป็นงาน');
    await delay(900);
    const afterConvert = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      notice: document.querySelector('.work-panel .form-notice')?.textContent?.trim() ?? '',
      empty: document.body.textContent.includes('กล่องขาเข้าว่าง'),
    }))()`);
    record('W-02-inbox-convert', afterConvert.rows === 0 ? 'PASS' : 'FAIL', afterConvert);
    if (afterConvert.rows !== 0) failures.push('W-02');

    // ---- tasks view: the converted task is there
    await clickText(session, '.primary-nav .nav-item', 'งานที่ต้องทำ');
    await session.waitFor(`!!document.querySelector('[aria-label="งานที่ต้องทำ"]')`);
    const tasksState = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      text: document.querySelector('.work-row strong')?.textContent?.trim() ?? '',
      filters: [...document.querySelectorAll('.mode-toggle button')].map((n) => n.textContent.trim()),
    }))()`);
    record('W-03-task-from-inbox', tasksState.rows === 1 && tasksState.text.includes('ช่างแอร์') ? 'PASS' : 'FAIL', tasksState);
    if (tasksState.rows !== 1) failures.push('W-03');

    // ---- add a second task with a due date and recurrence
    await setField(session, '.work-panel .inline-form input[placeholder="ชื่องาน"]', 'ทบทวนแผนสัปดาห์');
    await setField(session, '.work-panel .inline-form input[type="date"]', '2026-10-22');
    await setField(session, '.work-panel .inline-form select[aria-label="การทำซ้ำ"]', 'weekly');
    await clickText(session, '.work-panel .inline-form button', 'เพิ่ม');
    await session.waitFor(`document.querySelectorAll('.work-row').length === 2`, { label: 'second task' });
    const twoTasks = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      titles: [...document.querySelectorAll('.work-row strong')].map((n) => n.textContent.trim()),
      meta: [...document.querySelectorAll('.work-row .work-row-meta')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim()),
    }))()`);
    record('W-04-task-create', twoTasks.rows === 2 ? 'PASS' : 'FAIL', twoTasks);
    if (twoTasks.rows !== 2) failures.push('W-04');

    // ---- complete the recurring task: next occurrence must appear
    const completed = await session.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.work-row')];
      const target = rows.find((row) => row.textContent.includes('ทบทวนแผนสัปดาห์'));
      const box = target?.querySelector('input[type="checkbox"]');
      if (!box) return false;
      box.click();
      return true;
    })()`);
    await delay(1200);
    const afterComplete = await session.evaluate(`(() => ({
      notice: document.querySelector('.work-panel .form-notice')?.textContent?.trim() ?? '',
      rows: document.querySelectorAll('.work-row').length,
      titles: [...document.querySelectorAll('.work-row strong')].map((n) => n.textContent.trim()),
    }))()`);
    record('W-05-task-recurrence',
      completed && afterComplete.rows === 2 && afterComplete.notice.includes('รอบถัดไป') ? 'PASS' : 'FAIL',
      afterComplete);
    if (!(completed && afterComplete.notice.includes('รอบถัดไป'))) failures.push('W-05');

    // ---- done filter shows the completed row
    await clickText(session, '.mode-toggle button', 'เสร็จแล้ว');
    await delay(900);
    const doneFilter = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      titles: [...document.querySelectorAll('.work-row strong')].map((n) => n.textContent.trim()),
      doneClass: document.querySelectorAll('.work-row.is-done').length,
    }))()`);
    record('W-06-task-filter', doneFilter.rows === 1 && doneFilter.doneClass === 1 ? 'PASS' : 'FAIL', doneFilter);
    if (doneFilter.rows !== 1) failures.push('W-06');

    // ---- projects
    await clickText(session, '.primary-nav .nav-item', 'โปรเจกต์');
    await session.waitFor(`!!document.querySelector('[aria-label="โปรเจกต์"]')`);
    await setField(session, '.work-panel .person-form input[type="text"], .work-panel .person-form input:not([type])', 'ปรับปรุงบ้าน');
    await setField(session, '.work-panel .person-form textarea', 'ทุกห้องเรียบร้อยและไม่มีของค้าง');
    await clickText(session, '.work-panel .person-form button', 'สร้างโปรเจกต์');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`, { label: 'project created' });
    const projectState = await session.evaluate(`(() => ({
      rows: document.querySelectorAll('.work-row').length,
      text: document.querySelector('.work-row')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      notice: document.querySelector('.work-panel .form-notice')?.textContent?.trim() ?? '',
    }))()`);
    await shot(session, `${OUT}/work-1920-02-projects.png`);
    record('W-07-project-create', projectState.rows === 1 && projectState.text.includes('ปรับปรุงบ้าน') ? 'PASS' : 'FAIL', projectState);
    if (projectState.rows !== 1) failures.push('W-07');

    // ---- goals
    await clickText(session, '.primary-nav .nav-item', 'เป้าหมาย');
    await session.waitFor(`!!document.querySelector('[aria-label="เป้าหมาย"]')`);
    await setField(session, '.work-panel .person-form input:not([type])', 'อ่านหนังสือ 24 เล่ม');
    await setField(session, '.work-panel .person-form input[placeholder="เล่ม / ครั้ง / บาท"]', 'เล่ม');
    await setField(session, '.work-panel .person-form input[placeholder^="เช่น"]', 'จำนวนเล่มที่อ่านจบในปีนี้');
    await setField(session, '.work-panel .person-form input[type="number"]', '24');
    await clickText(session, '.work-panel .person-form button', 'เพิ่มเป้าหมาย');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`, { label: 'goal created' });
    const goalBefore = await session.evaluate(`(() => ({
      text: document.querySelector('.work-row')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      hasPercent: (document.querySelector('.work-row')?.textContent ?? '').includes('%'),
    }))()`);
    await clickText(session, '.work-row .text-button', '+1');
    await delay(900);
    await clickText(session, '.work-row .text-button', '+1');
    await delay(900);
    const goalAfter = await session.evaluate(`(() => ({
      text: document.querySelector('.work-row')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      barWidth: document.querySelector('.work-row .progress-track span')?.style?.width ?? '',
    }))()`);
    await shot(session, `${OUT}/work-1920-03-goals.png`);
    record('W-08-goal-progress',
      goalBefore.hasPercent && goalAfter.text.includes('2/24') ? 'PASS' : 'FAIL',
      { goalBefore, goalAfter });
    if (!goalAfter.text.includes('2/24')) failures.push('W-08');

    // ---- persistence after reload
    await session.reload();
    await session.waitFor(`!!document.querySelector('.profile-card')`);
    await clickText(session, '.primary-nav .nav-item', 'เป้าหมาย');
    await delay(900);
    const afterReload = await session.evaluate(`(() => ({
      goals: document.querySelectorAll('.work-row').length,
      text: document.querySelector('.work-row')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);
    record('W-09-reload', afterReload.goals === 1 && afterReload.text.includes('2/24') ? 'PASS' : 'FAIL', afterReload);
    if (!(afterReload.goals === 1 && afterReload.text.includes('2/24'))) failures.push('W-09');

    // ---- responsive
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(500);
      const probe = await session.evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        smallButtons: [...document.querySelectorAll('button')]
          .filter((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 40).length,
      }))()`);
      await shot(session, `${OUT}/work-${name}-goals.png`);
      record(`W-10-responsive-${name}`, probe.overflow ? 'FAIL' : 'PASS', probe);
      if (probe.overflow) failures.push(`W-10-${name}`);
    }

    const diagnostics = session.diagnostics();
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('W-11-console', realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL', diagnostics);
    if (realErrors.length > 0 || diagnostics.exceptions.length > 0) failures.push('W-11');

    writeFileSync(`${OUT}/work-ui-result.json`, JSON.stringify({
      failures,
      passed: results.filter((r) => r.status === 'PASS').length,
      total: results.length,
      results,
    }, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({ passed: results.filter((r) => r.status === 'PASS').length, total: results.length, failures }, null, 2));
  } finally {
    chrome.child.kill();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('RUN FAILED:', error.message);
  writeFileSync(`${OUT}/work-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
