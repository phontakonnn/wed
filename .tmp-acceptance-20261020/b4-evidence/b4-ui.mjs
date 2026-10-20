// Batch 4 acceptance: entity attachments (5 modules) + search filter controls (8 buckets, from/to).
// Evidence only — this file never touches production data directories.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from '../cdp.mjs';

const BASE = 'http://127.0.0.1:3494';
const ROOT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020';
const OUT = `${ROOT}/b4-evidence`;
const PORT = 9364;
const PROFILE = `${ROOT}/profile-b4-${Date.now()}`;
const UPLOAD_FILE = `${OUT}/b4-uploaded.txt`;

mkdirSync(OUT, { recursive: true });
writeFileSync(UPLOAD_FILE, 'uploaded during batch 4 acceptance\n', 'utf8');

const manifest = JSON.parse(readFileSync(`${OUT}/seed-manifest.json`, 'utf8'));
const N = manifest.names;
const D = manifest.dates;

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
D.plus6 = shiftDate(D.today, 6);
D.plus9 = shiftDate(D.today, 9);

const results = [];
const failures = [];
const record = (id, status, detail) => {
  results.push({ id, status, detail });
  if (status !== 'PASS') failures.push(id);
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

async function shot(session, name) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await session.screenshot(`${OUT}/${name}.png`);
      return true;
    } catch {
      await delay(500);
    }
  }
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
  await delay(150);
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

async function navTo(session, label) {
  await clickText(session, '.primary-nav .nav-item', label);
  await delay(700);
}

const ATTACH_STATE = `(() => {
  const panel = document.querySelector('.entity-attachments');
  if (!panel) return null;
  const items = [...panel.querySelectorAll('.entity-attachment-item')];
  return {
    count: items.length,
    names: items.map((n) => n.querySelector('.entity-attachment-link span:nth-of-type(2)')?.textContent?.trim() ?? ''),
    hrefs: items.map((n) => n.querySelector('.entity-attachment-link')?.getAttribute('href') ?? ''),
    options: [...panel.querySelectorAll('select option')].map((o) => o.textContent.trim()),
    empty: !!panel.querySelector('.entity-attachments-empty'),
    error: panel.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
    notice: panel.querySelector('[role="status"]')?.textContent?.trim() ?? '',
    heading: panel.querySelector('strong')?.textContent?.trim() ?? '',
  };
})()`;

async function attachState(session) {
  return session.evaluate(ATTACH_STATE);
}

async function pickFile(session, label) {
  const ok = await session.evaluate(`(() => {
    const sel = document.querySelector('.entity-attachments select');
    if (!sel) return false;
    const opt = [...sel.options].find((o) => o.textContent.includes(${JSON.stringify(label)}));
    if (!opt) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`pickFile miss: ${label}`);
  await delay(200);
}

async function pressAttach(session) {
  const ok = await session.evaluate(`(() => {
    const panel = document.querySelector('.entity-attachments');
    const button = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'แนบไฟล์');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!ok) throw new Error('pressAttach miss');
  await delay(900);
}

async function unlinkByName(session, name) {
  const ok = await session.evaluate(`(() => {
    const panel = document.querySelector('.entity-attachments');
    const item = [...panel.querySelectorAll('.entity-attachment-item')]
      .find((n) => n.textContent.includes(${JSON.stringify(name)}));
    if (!item) return false;
    const button = [...item.querySelectorAll('button')].find((b) => b.textContent.trim() === 'เอาออก');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!ok) throw new Error(`unlinkByName miss: ${name}`);
  await delay(900);
}

async function libraryFileIds(session) {
  return session.evaluate(`(async () => {
    const response = await fetch('/api/files?page=1&pageSize=100', { headers: { 'X-PKH-Request': '1' } });
    const body = await response.json();
    return body.files.map((file) => ({ id: file.id, name: file.displayName }));
  })()`);
}

async function openCommand(session) {
  await session.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    return true;
  })()`);
  await session.waitFor(`!!document.querySelector('.command-dialog')`);
  await delay(250);
}

async function commandQuery(session, text) {
  await setField(session, '.command-input-row input', text);
  await delay(900);
}

async function commandState(session) {
  return session.evaluate(`(() => {
    const dialog = document.querySelector('.command-dialog');
    if (!dialog) return null;
    return {
      chips: [...dialog.querySelectorAll('.command-type-chip')].map((c) => ({
        label: c.textContent.trim(),
        pressed: c.getAttribute('aria-pressed') === 'true',
      })),
      countLabel: dialog.querySelector('.command-filter-head .sidebar-hint')?.textContent?.trim() ?? '',
      from: dialog.querySelector('input[aria-label="ตั้งแต่วันที่"]')?.value ?? '',
      to: dialog.querySelector('input[aria-label="ถึงวันที่"]')?.value ?? '',
      alert: dialog.querySelector('[role="alert"]')?.textContent?.trim() ?? '',
      items: [...dialog.querySelectorAll('.command-item')].map((item) => ({
        kind: item.querySelector('.entry-kind')?.textContent?.trim() ?? '',
        text: item.textContent.replace(/\\s+/g, ' ').trim(),
      })),
      empty: dialog.textContent.includes('ไม่พบผลลัพธ์ที่ตรงกับคำค้นหาและตัวกรอง'),
      hasVault: /vault|คลังสมุด/i.test(dialog.textContent),
    };
  })()`);
}

async function closeCommand(session) {
  await session.evaluate(`(() => {
    document.querySelector('.command-dialog .icon-button')?.click();
    return true;
  })()`);
  await delay(300);
}

async function clickChip(session, label) {
  const ok = await session.evaluate(`(() => {
    const chip = [...document.querySelectorAll('.command-type-chip')]
      .find((c) => c.textContent.trim() === ${JSON.stringify(label)});
    if (!chip) return false;
    chip.click();
    return true;
  })()`);
  if (!ok) throw new Error(`clickChip miss: ${label}`);
  await delay(800);
}

async function searchRequests(session) {
  return session.requests.filter((entry) => entry.url.includes('/api/search')).length;
}

async function main() {
  const chrome = await launchChrome({ port: PORT, userDataDir: PROFILE });
  const { session } = await connect({ port: PORT });
  try {
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`);
    await setField(session, '#username', 'b4-admin');
    await setField(session, '#password', 'B4!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.dashboard-panel')`);
    record('B4-00-login', 'PASS', { view: 'dashboard' });

    // ============================================================ attachments
    await navTo(session, 'โน้ตของฉัน');
    await clickText(session, '.note-list-item', N.noteA);
    await session.waitFor(`!!document.querySelector('.entity-attachments')`);
    const noteInitial = await attachState(session);
    record('B4-A1-note-panel-empty', noteInitial && noteInitial.empty && noteInitial.count === 0 ? 'PASS' : 'FAIL', noteInitial);
    await shot(session, 'b4-1920-01-note-attachments-empty');

    await pickFile(session, N.fileAlpha);
    await pressAttach(session);
    const noteLinked = await attachState(session);
    record('B4-A2-note-link-existing',
      noteLinked.count === 1 && noteLinked.names[0] === N.fileAlpha
        && noteLinked.hrefs[0] === `/api/files/${manifest.ids.fileAlpha}` ? 'PASS' : 'FAIL', noteLinked);
    await shot(session, 'b4-1920-02-note-attachments-linked');

    await unlinkByName(session, N.fileAlpha);
    const noteUnlinked = await attachState(session);
    const libraryAfterUnlink = await libraryFileIds(session);
    record('B4-A3-note-unlink-keeps-file',
      noteUnlinked.count === 0 && noteUnlinked.empty
        && libraryAfterUnlink.some((file) => file.id === manifest.ids.fileAlpha) ? 'PASS' : 'FAIL',
      { panel: noteUnlinked, libraryHasFile: libraryAfterUnlink.some((f) => f.id === manifest.ids.fileAlpha) });

    // upload-and-attach through the real file input
    await session.send('DOM.enable');
    const doc = await session.send('DOM.getDocument', { depth: -1 });
    const inputNode = await session.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '.entity-attachments input[type=file]',
    });
    if (!inputNode.nodeId) throw new Error('upload input not found');
    await session.send('DOM.setFileInputFiles', { files: [UPLOAD_FILE], nodeId: inputNode.nodeId });
    await delay(1800);
    const afterUpload = await attachState(session);
    const libraryAfterUpload = await libraryFileIds(session);
    const uploadedFile = libraryAfterUpload.find((file) => file.name === 'b4-uploaded.txt');
    record('B4-A4-note-upload-and-link',
      afterUpload.count === 1 && afterUpload.names[0] === 'b4-uploaded.txt' && !!uploadedFile
        && afterUpload.hrefs[0] === `/api/files/${uploadedFile?.id}` ? 'PASS' : 'FAIL',
      { panel: afterUpload, uploaded: uploadedFile });
    await shot(session, 'b4-1920-03-note-uploaded-attachment');

    // tasks
    await navTo(session, 'งานที่ต้องทำ');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`);
    const taskScoped = await session.evaluate(`(() => {
      const row = [...document.querySelectorAll('.work-row')].find((r) => r.textContent.includes(${JSON.stringify(N.taskNear)}));
      return row ? !!row.querySelector('.entity-attachments') : false;
    })()`);
    await session.evaluate(`(() => {
      const row = [...document.querySelectorAll('.work-row')].find((r) => r.textContent.includes(${JSON.stringify(N.taskNear)}));
      row.scrollIntoView({ block: 'center' });
      return true;
    })()`);
    await delay(300);
    await pickFile(session, 'b4-beta.txt');
    await pressAttach(session);
    const taskLinked = await attachState(session);
    record('B4-A5-task-link', taskScoped && taskLinked.count === 1 && taskLinked.names[0] === 'b4-beta.txt' ? 'PASS' : 'FAIL',
      { scoped: taskScoped, panel: taskLinked });
    await shot(session, 'b4-1920-04-task-attachment');

    // projects
    await navTo(session, 'โปรเจกต์');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`);
    await session.evaluate(`(() => {
      const row = [...document.querySelectorAll('.work-row')].find((r) => r.textContent.includes(${JSON.stringify(N.project)}));
      row.scrollIntoView({ block: 'center' });
      return true;
    })()`);
    await delay(300);
    await pickFile(session, 'b4-gamma.txt');
    await pressAttach(session);
    const projectLinked = await attachState(session);
    record('B4-A6-project-link', projectLinked.count === 1 && projectLinked.names[0] === 'b4-gamma.txt' ? 'PASS' : 'FAIL', projectLinked);
    await shot(session, 'b4-1920-05-project-attachment');

    // people
    await navTo(session, 'บุคคลสำคัญ');
    await session.waitFor(`!!document.querySelector('.person-card')`);
    await clickText(session, '.person-card', N.person);
    await session.waitFor(`!!document.querySelector('.entity-attachments')`);
    await pickFile(session, N.fileAlpha);
    await pressAttach(session);
    const personLinked = await attachState(session);
    record('B4-A7-person-link', personLinked.count === 1 && personLinked.names[0] === N.fileAlpha ? 'PASS' : 'FAIL', personLinked);
    await shot(session, 'b4-1920-06-person-attachment');

    // bookmarks
    await navTo(session, 'บุ๊กมาร์ก');
    await delay(600);
    await clickText(session, 'button', N.bookmark);
    await session.waitFor(`!!document.querySelector('.entity-attachments')`);
    await pickFile(session, 'b4-uploaded.txt');
    await pressAttach(session);
    const bookmarkLinked = await attachState(session);
    record('B4-A8-bookmark-link',
      bookmarkLinked.count === 1 && bookmarkLinked.names[0] === 'b4-uploaded.txt' ? 'PASS' : 'FAIL', bookmarkLinked);
    await shot(session, 'b4-1920-07-bookmark-attachment');

    // persistence across reload (task attachment)
    await session.reload();
    await session.waitFor(`!!document.querySelector('.primary-nav')`);
    await navTo(session, 'งานที่ต้องทำ');
    await session.waitFor(`document.querySelectorAll('.work-row').length > 0`);
    const persisted = await session.evaluate(`(async () => {
      const response = await fetch('/api/entities/task/${manifest.ids.taskNear}/files', { headers: { 'X-PKH-Request': '1' } });
      const body = await response.json();
      return body.files.map((file) => file.displayName);
    })()`);
    record('B4-A9-persist-after-reload', persisted.includes('b4-beta.txt') ? 'PASS' : 'FAIL', persisted);

    // ============================================================ search filters
    await openCommand(session);
    const initial = await commandState(session);
    const expectedLabels = ['โน้ต', 'งาน', 'โปรเจกต์', 'เป้าหมาย', 'บุคคล', 'แจ้งเตือน', 'บุ๊กมาร์ก', 'ไฟล์'];
    record('B4-S1-eight-chips-default-on',
      initial.chips.length === 8
        && expectedLabels.every((label) => initial.chips.some((chip) => chip.label === label))
        && initial.chips.every((chip) => chip.pressed)
        && initial.countLabel.includes('8/8')
        && !initial.hasVault ? 'PASS' : 'FAIL', initial.chips);
    await shot(session, 'b4-1920-08-command-default-filters');

    await commandQuery(session, 'B4');
    const allResults = await commandState(session);
    const kinds = [...new Set(allResults.items.map((item) => item.kind))];
    record('B4-S2-all-eight-buckets',
      expectedLabels.every((label) => kinds.includes(label)) ? 'PASS' : 'FAIL',
      { kinds, total: allResults.items.length });
    await shot(session, 'b4-1920-09-command-all-results');

    // isolate tasks
    for (const label of ['โน้ต', 'โปรเจกต์', 'เป้าหมาย', 'บุคคล', 'แจ้งเตือน', 'บุ๊กมาร์ก', 'ไฟล์']) {
      await clickChip(session, label);
    }
    const tasksOnly = await commandState(session);
    const tasksOnlyKinds = [...new Set(tasksOnly.items.map((item) => item.kind))];
    record('B4-S3-types-filter-tasks-only',
      tasksOnlyKinds.length === 1 && tasksOnlyKinds[0] === 'งาน'
        && tasksOnly.items.some((item) => item.text.includes(N.taskNear))
        && tasksOnly.items.some((item) => item.text.includes(N.taskFar))
        && tasksOnly.countLabel.includes('1/8') ? 'PASS' : 'FAIL',
      { kinds: tasksOnlyKinds, count: tasksOnly.countLabel, items: tasksOnly.items.map((i) => i.text) });
    await shot(session, 'b4-1920-10-command-tasks-only');

    // date range keeps only the near task
    await setField(session, 'input[aria-label="ตั้งแต่วันที่"]', D.today);
    await setField(session, 'input[aria-label="ถึงวันที่"]', D.plus3);
    await delay(900);
    const ranged = await commandState(session);
    record('B4-S4-date-range-narrows',
      ranged.items.some((item) => item.text.includes(N.taskNear))
        && !ranged.items.some((item) => item.text.includes(N.taskFar))
        && ranged.from === D.today && ranged.to === D.plus3 ? 'PASS' : 'FAIL',
      { from: ranged.from, to: ranged.to, items: ranged.items.map((i) => i.text) });
    await shot(session, 'b4-1920-11-command-date-range');

    // range that excludes everything -> empty state (no task falls between +6 and +9 days)
    await setField(session, 'input[aria-label="ตั้งแต่วันที่"]', D.plus6);
    await setField(session, 'input[aria-label="ถึงวันที่"]', D.plus9);
    await delay(1000);
    const emptyRange = await commandState(session);
    record('B4-S5-date-range-empty-state',
      emptyRange.empty && emptyRange.items.length === 0 ? 'PASS' : 'FAIL',
      { from: emptyRange.from, to: emptyRange.to, empty: emptyRange.empty, items: emptyRange.items.map((i) => i.text) });

    // invalid range: alert, no API call
    const beforeInvalid = await searchRequests(session);
    await setField(session, 'input[aria-label="ตั้งแต่วันที่"]', D.plus40);
    await setField(session, 'input[aria-label="ถึงวันที่"]', D.today);
    await delay(1200);
    const afterInvalid = await searchRequests(session);
    const invalid = await commandState(session);
    record('B4-S6-invalid-range-blocks-request',
      invalid.alert.includes('ช่วงวันที่ไม่ถูกต้อง') && afterInvalid === beforeInvalid
        && invalid.items.length === 0 ? 'PASS' : 'FAIL',
      { alert: invalid.alert, searchRequestsBefore: beforeInvalid, searchRequestsAfter: afterInvalid });
    await shot(session, 'b4-1920-12-command-invalid-range');

    // clear filter restores defaults
    await clickText(session, '.command-filter-head button', 'ล้างตัวกรอง');
    await delay(900);
    const cleared = await commandState(session);
    record('B4-S7-clear-filter-restores-defaults',
      cleared.from === '' && cleared.to === '' && cleared.chips.filter((chip) => chip.pressed).length === 8
        && cleared.alert === '' ? 'PASS' : 'FAIL',
      { from: cleared.from, to: cleared.to, pressed: cleared.chips.filter((c) => c.pressed).length, alert: cleared.alert });

    // empty result state for an unmatched query
    await commandQuery(session, 'zzzz-no-match-zzzz');
    const noMatch = await commandState(session);
    record('B4-S8-empty-state', noMatch.empty && noMatch.items.length === 0 ? 'PASS' : 'FAIL', { empty: noMatch.empty });
    await shot(session, 'b4-1920-13-command-empty');

    // navigateCommand for all eight buckets
    const navCases = [
      { label: 'โน้ต', target: N.noteA, view: 'โน้ตของฉัน' },
      { label: 'งาน', target: N.taskNear, view: 'งานที่ต้องทำ' },
      { label: 'โปรเจกต์', target: N.project, view: 'โปรเจกต์' },
      { label: 'เป้าหมาย', target: N.goal, view: 'เป้าหมาย' },
      { label: 'บุคคล', target: N.person, view: 'บุคคลสำคัญ' },
      { label: 'แจ้งเตือน', target: N.reminder, view: 'ปฏิทิน & ตารางชีวิต' },
      { label: 'บุ๊กมาร์ก', target: N.bookmark, view: 'บุ๊กมาร์ก' },
      { label: 'ไฟล์', target: 'b4-alpha.txt', view: 'คลังไฟล์' },
    ];
    for (const [index, testCase] of navCases.entries()) {
      await navTo(session, 'ภาพรวมวันนี้');
      await openCommand(session);
      await commandQuery(session, 'B4');
      const clicked = await session.evaluate(`(() => {
        const item = [...document.querySelectorAll('.command-item')]
          .find((n) => n.querySelector('.entry-kind')?.textContent?.trim() === ${JSON.stringify(testCase.label)}
            && n.textContent.includes(${JSON.stringify(testCase.target)}));
        if (!item) return false;
        item.click();
        return true;
      })()`);
      await delay(1000);
      const active = await session.evaluate(`(() => ({
        active: document.querySelector('.primary-nav .nav-item.is-active')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        dialogOpen: !!document.querySelector('.command-dialog'),
      }))()`);
      record(`B4-S9.${index + 1}-navigate-${testCase.label}`,
        clicked && !active.dialogOpen && active.active.includes(testCase.view) ? 'PASS' : 'FAIL',
        { clicked, ...active, expectedView: testCase.view });
    }

    // ============================================================ responsive
    await navTo(session, 'โน้ตของฉัน');
    await clickText(session, '.note-list-item', N.noteA);
    await delay(700);
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(500);
      const probe = await session.evaluate(`(() => {
        const panel = document.querySelector('.entity-attachments');
        const buttons = [...document.querySelectorAll('button')]
          .filter((n) => n.getClientRects().length > 0);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth,
          smallButtons: buttons.filter((n) => {
            const rect = n.getBoundingClientRect();
            return rect.height > 0 && (rect.height < 40 || rect.width < 40);
          }).map((n) => ({ text: n.textContent.trim().slice(0, 24), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) })),
          panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
        };
      })()`);
      await shot(session, `b4-${name}-01-note-attachments`);
      record(`B4-R1-${name}-attachments`,
        !probe.overflow && probe.smallButtons.length === 0 && !probe.panelOverflow ? 'PASS' : 'FAIL', probe);
    }

    // command dialog responsive with results + filters visible
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(400);
      await openCommand(session);
      await commandQuery(session, 'B4');
      const probe = await session.evaluate(`(() => {
        const dialog = document.querySelector('.command-dialog');
        const rect = dialog.getBoundingClientRect();
        const buttons = [...dialog.querySelectorAll('button')].filter((n) => n.getClientRects().length > 0);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          dialogOverflowX: dialog.scrollWidth > dialog.clientWidth + 1,
          dialogRight: Math.round(rect.right),
          innerWidth,
          smallButtons: buttons.filter((n) => {
            const box = n.getBoundingClientRect();
            return box.height > 0 && (box.height < 40 || box.width < 40);
          }).map((n) => ({ text: n.textContent.trim().slice(0, 20), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) })),
          chips: dialog.querySelectorAll('.command-type-chip').length,
          results: dialog.querySelectorAll('.command-item').length,
        };
      })()`);
      await shot(session, `b4-${name}-02-command-filters`);
      record(`B4-R2-${name}-command`,
        !probe.overflow && !probe.dialogOverflowX && probe.dialogRight <= probe.innerWidth + 1
          && probe.smallButtons.length === 0 && probe.chips === 8 ? 'PASS' : 'FAIL', probe);
      await closeCommand(session);
    }

    // ============================================================ console
    const diagnostics = session.diagnostics();
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('B4-C1-console-clean',
      realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL',
      { realErrors, exceptions: diagnostics.exceptions, httpErrors: diagnostics.httpErrors });

    writeFileSync(`${OUT}/b4-ui-result.json`, JSON.stringify({
      generatedAt: new Date().toISOString(),
      base: BASE,
      passed: results.filter((r) => r.status === 'PASS').length,
      total: results.length,
      failures,
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
  writeFileSync(`${OUT}/b4-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
