// Batch 2 acceptance: dashboard, autosave, toasts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3482';
const OUT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/b2-evidence';
const PORT = 9352;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-b2-${Date.now()}`;

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
  await delay(400);
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
    await setField(session, '#username', 'b2-admin');
    await setField(session, '#password', 'B2!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.profile-card')`);

    // ---- dashboard is the landing view
    await session.waitFor(`!!document.querySelector('.dashboard-panel')`, { label: 'dashboard panel' });
    await session.waitFor(`!!document.querySelector('.dash-card')`, { label: 'dashboard cards' });
    const dash = await session.evaluate(`(() => ({
      activeNav: document.querySelector('.primary-nav .nav-item.is-active')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      cards: [...document.querySelectorAll('.dash-card h3')].map((n) => n.textContent.trim()),
      stats: [...document.querySelectorAll('.dash-stat')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim()),
      cardText: [...document.querySelectorAll('.dash-card')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90)),
    }))()`);
    await shot(session, `${OUT}/b2-1920-01-dashboard.png`);
    record('B2-01-dashboard-landing',
      dash.cards.length >= 7 && dash.activeNav.includes('ภาพรวมวันนี้') ? 'PASS' : 'FAIL', dash);
    if (!(dash.cards.length >= 7 && dash.activeNav.includes('ภาพรวมวันนี้'))) failures.push('B2-01');

    // ---- counts come from the API, not from the DOM
    const apiCounts = await session.evaluate(`(async () => {
      const response = await fetch('/api/dashboard', { headers: { 'X-PKH-Request': '1' } });
      const body = await response.json();
      return body.counts;
    })()`);
    const domCounts = await session.evaluate(`(() => {
      const values = [...document.querySelectorAll('.dash-stat strong')].map((n) => Number(n.textContent.trim()));
      return { dueToday: values[0], overdue: values[1], inbox: values[2], habits: values[3] };
    })()`);
    record('B2-02-counts-match-api',
      domCounts.dueToday === apiCounts.dueToday && domCounts.overdue === apiCounts.overdue
        && domCounts.inbox === apiCounts.inbox && domCounts.habits === apiCounts.habitsOutstanding
        ? 'PASS' : 'FAIL',
      { apiCounts, domCounts });
    if (domCounts.dueToday !== apiCounts.dueToday) failures.push('B2-02');

    // ---- no invented percentage for a goal without a target
    const goalState = await session.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.dash-card')];
      const goalCard = cards.find((c) => c.querySelector('h3')?.textContent.includes('เป้าหมาย'));
      return { text: goalCard?.textContent?.replace(/\\s+/g, ' ').trim() ?? '' };
    })()`);
    const goalWithTarget = goalState.text.includes('6/24') && goalState.text.includes('25%');
    const goalWithoutTarget = goalState.text.includes('ยังไม่มีตัวชี้วัด');
    record('B2-03-goal-percent-honesty', goalWithTarget && goalWithoutTarget ? 'PASS' : 'FAIL', {
      goalWithTarget, goalWithoutTarget, text: goalState.text,
    });
    if (!(goalWithTarget && goalWithoutTarget)) failures.push('B2-03');

    // ---- toast on task creation
    await clickText(session, '.primary-nav .nav-item', 'งานที่ต้องทำ');
    await session.waitFor(`!!document.querySelector('[aria-label="งานที่ต้องทำ"]')`);
    await setField(session, '.work-panel .inline-form input[placeholder="ชื่องาน"]', 'งานทดสอบ toast');
    await setField(session, '.work-panel .inline-form input[type="date"]', '2026-10-20');
    await clickText(session, '.work-panel .inline-form button', 'เพิ่ม');
    await session.waitFor(`!!document.querySelector('.toast')`, { label: 'toast visible' });
    const toastState = await session.evaluate(`(() => {
      const toast = document.querySelector('.toast');
      return {
        text: toast?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        role: toast?.getAttribute('role') ?? '',
        kind: toast?.className ?? '',
        closeLabel: toast?.querySelector('button')?.getAttribute('aria-label') ?? '',
      };
    })()`);
    await shot(session, `${OUT}/b2-1920-02-toast.png`);
    record('B2-04-toast-success',
      toastState.text.includes('เพิ่มงานแล้ว') && toastState.role === 'status' && toastState.kind.includes('toast-success')
        ? 'PASS' : 'FAIL', toastState);
    if (!toastState.text.includes('เพิ่มงานแล้ว')) failures.push('B2-04');

    // ---- autosave: type in an existing note and wait for the saved state
    await clickText(session, '.primary-nav .nav-item', 'โน้ตของฉัน');
    await delay(700);
    await clickText(session, '.note-list .note-list-item', 'โน้ตทดสอบ autosave');
    await session.waitFor(`!!document.querySelector('textarea[aria-label="เนื้อหาโน้ต"]')`);
    const beforeSave = await session.evaluate(`document.querySelector('.save-state')?.textContent?.trim() ?? ''`);
    await setField(session, 'textarea[aria-label="เนื้อหาโน้ต"]', 'เนื้อหาที่พิมพ์เพิ่มเพื่อทดสอบ autosave');
    const afterTyping = await session.evaluate(`document.querySelector('.save-state')?.textContent?.trim() ?? ''`);
    await session.waitFor(`(document.querySelector('.save-state')?.textContent || '').includes('บันทึกแล้ว')`, {
      label: 'autosave saved state',
      timeout: 12000,
    });
    const savedState = await session.evaluate(`document.querySelector('.save-state')?.textContent?.trim() ?? ''`);
    await shot(session, `${OUT}/b2-1920-03-autosave.png`);
    record('B2-05-autosave-saved',
      afterTyping === '' && savedState.includes('บันทึกแล้ว') ? 'PASS' : 'FAIL',
      { beforeSave, afterTyping, savedState });
    if (!savedState.includes('บันทึกแล้ว')) failures.push('B2-05');

    // ---- the autosaved text survives a reload (proves it reached the backend)
    await session.reload();
    await session.waitFor(`!!document.querySelector('.profile-card')`);
    await clickText(session, '.primary-nav .nav-item', 'โน้ตของฉัน');
    await delay(900);
    await clickText(session, '.note-list .note-list-item', 'โน้ตทดสอบ autosave');
    await session.waitFor(`!!document.querySelector('textarea[aria-label="เนื้อหาโน้ต"]')`);
    const persisted = await session.evaluate(`document.querySelector('textarea[aria-label="เนื้อหาโน้ต"]')?.value ?? ''`);
    record('B2-06-autosave-persisted',
      persisted === 'เนื้อหาที่พิมพ์เพิ่มเพื่อทดสอบ autosave' ? 'PASS' : 'FAIL', { persisted });
    if (persisted !== 'เนื้อหาที่พิมพ์เพิ่มเพื่อทดสอบ autosave') failures.push('B2-06');

    // ---- dashboard reflects the new task after the reload
    await clickText(session, '.primary-nav .nav-item', 'ภาพรวมวันนี้');
    await session.waitFor(`!!document.querySelector('.dash-card')`);
    await delay(600);
    const afterReload = await session.evaluate(`(() => ({
      stats: [...document.querySelectorAll('.dash-stat strong')].map((n) => Number(n.textContent.trim())),
      taskText: [...document.querySelectorAll('.dash-card')]
        .find((c) => c.querySelector('h3')?.textContent.includes('งานของวันนี้'))
        ?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);
    record('B2-07-dashboard-refresh',
      afterReload.stats[0] === 2 && afterReload.taskText.includes('งานทดสอบ toast') ? 'PASS' : 'FAIL', afterReload);
    if (!(afterReload.stats[0] === 2 && afterReload.taskText.includes('งานทดสอบ toast'))) failures.push('B2-07');

    // ---- responsive
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(500);
      const probe = await session.evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        smallButtons: [...document.querySelectorAll('button')]
          .filter((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().height > 0
            && n.getBoundingClientRect().height < 40).length,
        cards: document.querySelectorAll('.dash-card').length,
      }))()`);
      await shot(session, `${OUT}/b2-${name}-dashboard.png`);
      record(`B2-08-responsive-${name}`, probe.overflow || probe.smallButtons > 0 ? 'FAIL' : 'PASS', probe);
      if (probe.overflow || probe.smallButtons > 0) failures.push(`B2-08-${name}`);
    }

    // ---- reduced motion stylesheet rule exists
    const reducedMotion = await session.evaluate(`(() => {
      const found = [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) => rule.conditionText?.includes('prefers-reduced-motion'));
        } catch { return false; }
      });
      return found;
    })()`);
    record('B2-09-reduced-motion', reducedMotion ? 'PASS' : 'FAIL', { reducedMotion });
    if (!reducedMotion) failures.push('B2-09');

    const diagnostics = session.diagnostics();
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('B2-10-console', realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL', diagnostics);
    if (realErrors.length > 0 || diagnostics.exceptions.length > 0) failures.push('B2-10');

    writeFileSync(`${OUT}/b2-ui-result.json`, JSON.stringify({
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
  writeFileSync(`${OUT}/b2-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
