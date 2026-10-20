// Temporary Life OS UI acceptance run for PKH.
// Drives the production build served by the Fastify app at 127.0.0.1:3461.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3463';
const OUT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/lifeos-evidence';
const DEBUG_PORT = 9337;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-lifeos-${Date.now()}`;

mkdirSync(OUT, { recursive: true });

const results = [];
function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`${id} ${status} ${JSON.stringify(detail)}`);
}

const SET_VALUE = `
function __setValue(target, value) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : target instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor.set.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}`;

async function clickText(session, selector, text, { index = 0 } = {}) {
  const clicked = await session.evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter((node) => node.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}));
    const node = nodes[${index}];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`clickText miss: ${selector} ~ ${text}`);
  await delay(320);
  return clicked;
}

async function clickSelector(session, selector) {
  const clicked = await session.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`clickSelector miss: ${selector}`);
  await delay(320);
}

async function setLabeled(session, scope, labelPrefix, value) {
  const ok = await session.evaluate(`(() => {
    ${SET_VALUE}
    const scope = document.querySelector(${JSON.stringify(scope)});
    if (!scope) return 'no-scope';
    const label = [...scope.querySelectorAll('label')]
      .find((node) => node.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(labelPrefix)}));
    if (!label) return 'no-label';
    const field = label.querySelector('input, textarea, select');
    if (!field) return 'no-field';
    __setValue(field, ${JSON.stringify(value)});
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error(`setLabeled ${labelPrefix}: ${ok}`);
  await delay(120);
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

const layoutProbe = `(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x) };
  };
  const visible = (node) => node.offsetParent !== null || node.getClientRects().length > 0;
  const smallButtons = [...document.querySelectorAll('button')]
    .filter((node) => visible(node) && node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 40)
    .map((node) => ({ text: node.textContent.trim().slice(0, 24), h: Math.round(node.getBoundingClientRect().height), cls: node.className }));
  const tinyText = [...document.querySelectorAll('p, span, small, strong, label, li, button, input, textarea, h1, h2, h3')]
    .filter((node) => visible(node) && node.textContent.trim().length > 0)
    .map((node) => ({ size: parseFloat(getComputedStyle(node).fontSize), cls: node.className, tag: node.tagName, sample: node.textContent.trim().slice(0, 20) }))
    .filter((entry) => entry.size < 14);
  return {
    viewport: { w: innerWidth, h: innerHeight },
    docScrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    sidebar: rect('.app-sidebar'),
    list: rect('.list-panel'),
    detail: rect('.detail-panel'),
    smallButtons: smallButtons.slice(0, 8),
    smallButtonCount: smallButtons.length,
    tinyTextCount: tinyText.length,
    tinyText: tinyText.slice(0, 6),
    theme: document.documentElement.dataset.theme || null,
    mode: document.documentElement.dataset.mode || null,
  };
})()`;

async function main() {
  const chrome = await launchChrome({ port: DEBUG_PORT, userDataDir: PROFILE, width: 1920, height: 1080 });
  const { session } = await connect({ port: DEBUG_PORT });
  const failures = [];

  try {
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`, { label: 'login form' });
    record('L-00-login-view', 'PASS', { bodyHasLogin: await session.evaluate(`document.body.textContent.includes('เข้าสู่ระบบ')`) });

    // ---- login ----
    await setField(session, '#username', 'lifeos-admin');
    await setField(session, '#password', 'LifeOs!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.app-shell')`, { label: 'app shell' });
    await session.waitFor(`!!document.querySelector('.profile-card')`, { label: 'profile card' });
    record('L-01-login', 'PASS', await session.evaluate(`(() => ({
      shell: !!document.querySelector('.app-shell'),
      account: document.querySelector('.account-label')?.textContent?.trim(),
      profileName: document.querySelector('.profile-copy strong')?.textContent?.trim(),
      theme: document.documentElement.dataset.theme,
      mode: document.documentElement.dataset.mode,
    }))()`));

    // ---- 1920 baseline before screenshots ----
    let probe1920 = await session.evaluate(layoutProbe);
    await session.screenshot(`${OUT}/lifeos-1920-01-notes.png`);
    record('L-02-shell-1920', probe1920.horizontalOverflow ? 'FAIL' : 'PASS', probe1920);
    if (probe1920.horizontalOverflow) failures.push('L-02');

    // ---- People: create ----
    await clickText(session, 'button', '＋ บุคคล');
    await session.waitFor(`!!document.querySelector('.people-panel')`, { label: 'people panel' });
    await setLabeled(session, '.person-form', 'ชื่อ', 'คุณแม่สมศรี');
    await setLabeled(session, '.person-form', 'กลุ่มความสัมพันธ์', 'family');
    await setLabeled(session, '.person-form', 'บทบาท', 'คุณแม่');
    await setLabeled(session, '.person-form', 'วันเกิด', '2026-10-30');
    await setLabeled(session, '.person-form', 'เบอร์โทร', '081-234-5678');
    await setLabeled(session, '.person-form', 'ของที่ชอบ', 'ชอบดอกไม้สีขาว ชอบทานส้มตำไม่ใส่ถั่ว');
    await setLabeled(session, '.person-form', 'แพ้อะไร', 'แพ้กุ้ง แพ้เพนิซิลิน');
    await setLabeled(session, '.person-form', 'ไซส์', 'ไซส์เสื้อ M รองเท้า 37 อยากได้ผ้าพันคอ');
    await setLabeled(session, '.person-form', 'บันทึกเพิ่มเติม', 'ชอบโทรหาช่วงเย็น');
    await clickText(session, '.person-form button', 'บันทึก');
    await session.waitFor(`(document.querySelector('.people-panel .form-notice')?.textContent || '').length > 0`, { label: 'person saved notice' });
    const personState = await session.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.people-list .person-card, .people-list > *')];
      return {
        notice: document.querySelector('.form-notice')?.textContent?.trim() ?? '',
        listCount: document.querySelectorAll('.people-list > *').length,
        listText: document.querySelector('.people-list')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 220) ?? '',
        title: document.querySelector('.people-panel .panel-title')?.textContent?.trim() ?? '',
        countdown: document.querySelector('.people-panel .updated-label')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        avatar: document.querySelector('.person-hero .avatar')?.textContent?.trim() ?? '',
        linkedNotes: document.querySelector('.linked-notes')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 80) ?? '',
      };
    })()`);
    record('L-03-person-create', personState.listCount > 0 && personState.title.includes('สมศรี') ? 'PASS' : 'FAIL', personState);
    if (!(personState.listCount > 0 && personState.title.includes('สมศรี'))) failures.push('L-03');
    await session.screenshot(`${OUT}/lifeos-1920-02-person.png`);

    // ---- People: avatar preset ----
    await setLabeled(session, '.person-form', 'อวตาร', '🌸');
    await clickText(session, '.person-form button', 'บันทึก');
    await delay(700);
    const avatarAfterPreset = await session.evaluate(`(() => ({
      hero: document.querySelector('.person-hero .avatar')?.textContent?.trim() ?? '',
      listFirst: document.querySelector('.people-list > * .avatar')?.textContent?.trim() ?? '',
      notice: document.querySelector('.form-notice')?.textContent?.trim() ?? '',
    }))()`);
    record('L-04-person-avatar-preset', avatarAfterPreset.hero.includes('🌸') ? 'PASS' : 'FAIL', avatarAfterPreset);
    if (!avatarAfterPreset.hero.includes('🌸')) failures.push('L-04');

    // ---- People: reminder for person ----
    await clickText(session, '.people-panel button', 'ตั้งแจ้งเตือนวันสำคัญ');
    await delay(800);
    const reminderForPerson = await session.evaluate(`(() => ({
      notice: document.querySelector('.form-notice')?.textContent?.trim() ?? '',
      badge: document.querySelector('.notification-badge')?.textContent?.trim() ?? '',
    }))()`);
    await clickSelector(session, 'button[aria-label="แจ้งเตือนวันสำคัญ"]');
    await delay(400);
    const bellState = await session.evaluate(`(() => ({
      popover: !!document.querySelector('.notification-popover'),
      items: [...document.querySelectorAll('.notification-item')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-03-bell.png`);
    record('L-05-reminder-for-person', bellState.items.length > 0 ? 'PASS' : 'FAIL', { reminderForPerson, bellState });
    if (bellState.items.length === 0) failures.push('L-05');
    await clickSelector(session, '.notification-popover .text-button');
    await delay(300);

    // ---- Schedule panel ----
    await clickText(session, '.primary-nav .nav-item', 'ตารางชีวิต');
    await session.waitFor(`!!document.querySelector('.schedule-panel')`, { label: 'schedule panel' });
    await setField(session, '.schedule-panel .life-card:nth-child(2) .inline-form input:nth-child(1)', '06:30 - 07:30');
    await setField(session, '.schedule-panel .life-card:nth-child(2) .inline-form input:nth-child(2)', 'วิ่งออกกำลังกาย');
    await clickText(session, '.schedule-panel .life-card:nth-child(2) .inline-form button', 'เพิ่ม');
    await session.waitFor(`document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li').length > 0`, { label: 'timeblock added' });
    // toggle the first checkbox instead of deleting
    await session.evaluate(`(() => {
      const box = document.querySelector('.schedule-panel .life-card:nth-child(2) .life-list li input[type="checkbox"]');
      if (box && !box.checked) box.click();
      return true;
    })()`);
    await delay(700);

    await setField(session, '.schedule-panel .life-card:nth-child(3) .inline-form input:nth-child(1)', 'ดื่มน้ำ');
    await setField(session, '.schedule-panel .life-card:nth-child(3) .inline-form input[type="number"]', '8');
    await setField(session, '.schedule-panel .life-card:nth-child(3) .inline-form input:nth-child(3)', 'แก้ว');
    await clickText(session, '.schedule-panel .life-card:nth-child(3) .inline-form button', 'เพิ่ม');
    await session.waitFor(`document.querySelectorAll('.habit-list li').length > 0`, { label: 'habit added' });
    const beforePlus = await session.evaluate(`document.querySelector('.habit-list li small')?.textContent?.trim() ?? ''`);
    await clickText(session, '.habit-list li button', '+1');
    await delay(600);
    await clickText(session, '.habit-list li button', '+1');
    await delay(700);
    const scheduleState = await session.evaluate(`(() => ({
      reminderCount: document.querySelectorAll('.schedule-panel .life-card:nth-child(1) .life-list li').length,
      reminderText: document.querySelector('.schedule-panel .life-card:nth-child(1) .life-list')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 160) ?? '',
      blockCount: document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li').length,
      blockDone: document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li.is-done').length,
      blockText: document.querySelector('.schedule-panel .life-card:nth-child(2) .life-list')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? '',
      habitText: document.querySelector('.habit-list li small')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      habitCount: document.querySelectorAll('.habit-list li').length,
      summary: document.querySelector('.schedule-panel .note-count')?.textContent?.trim() ?? '',
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-04-schedule.png`);
    record('L-06-schedule', scheduleState.habitCount > 0 && scheduleState.blockCount > 0 ? 'PASS' : 'FAIL', {
      beforePlus, scheduleState,
    });
    if (!(scheduleState.habitCount > 0 && scheduleState.blockCount > 0)) failures.push('L-06');
    const habitNumber = (text) => {
      const match = /^(\d+)\//.exec(text || '');
      return match ? Number(match[1]) : null;
    };
    const habitBefore = habitNumber(beforePlus);
    const habitAfter = habitNumber(scheduleState.habitText);
    const habitProgressed = habitBefore !== null && habitAfter !== null && habitAfter === habitBefore + 2;
    record('L-07-habit-plus-one', habitProgressed ? 'PASS' : 'FAIL', { beforePlus, after: scheduleState.habitText, habitBefore, habitAfter });
    if (!habitProgressed) failures.push('L-07');

    // ---- Command palette ----
    await session.evaluate(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.command-dialog')`, { label: 'command palette' });
    await setField(session, '.command-dialog input', 'แพ้กุ้ง');
    await session.waitFor(`!!document.querySelector('.command-results')`, { label: 'command results' });
    await delay(600);
    const commandState = await session.evaluate(`(() => ({
      open: !!document.querySelector('.command-dialog'),
      items: [...document.querySelectorAll('.command-item')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
      empty: document.querySelector('.command-results')?.textContent?.includes('ไม่พบผลลัพธ์') ?? false,
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-05-command.png`);
    record('L-08-command-palette', commandState.items.some((item) => item.includes('สมศรี')) ? 'PASS' : 'FAIL', commandState);
    if (!commandState.items.some((item) => item.includes('สมศรี'))) failures.push('L-08');

    // navigate from command result to the person
    await clickText(session, '.command-item', 'สมศรี');
    await delay(800);
    const afterCommandNav = await session.evaluate(`(() => ({
      paletteClosed: !document.querySelector('.command-dialog'),
      view: document.querySelector('.list-panel')?.getAttribute('aria-label') ?? '',
      title: document.querySelector('.people-panel .panel-title')?.textContent?.trim() ?? '',
    }))()`);
    record('L-09-command-navigate', afterCommandNav.paletteClosed && afterCommandNav.title.includes('สมศรี') ? 'PASS' : 'FAIL', afterCommandNav);
    if (!(afterCommandNav.paletteClosed && afterCommandNav.title.includes('สมศรี'))) failures.push('L-09');

    // ---- Themes ----
    const themeObservations = [];
    for (const label of ['Emerald Forest', 'Royal Indigo', 'Rose Quartz', 'Amber Sunset', 'Midnight Violet']) {
      await clickSelector(session, 'button[aria-label="ธีมและสี"]');
      await session.waitFor(`!!document.querySelector('.studio-dialog')`, { label: 'theme studio' });
      await clickText(session, '.theme-swatch', label);
      await delay(250);
      const observed = await session.evaluate(`(() => ({
        theme: document.documentElement.dataset.theme,
        stored: localStorage.getItem('pkh.theme'),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
        accentSoft: getComputedStyle(document.documentElement).getPropertyValue('--green-soft').trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        active: document.querySelector('.theme-swatch.is-active')?.textContent?.trim() ?? '',
      }))()`);
      themeObservations.push({ label, ...observed });
      await clickSelector(session, '.studio-dialog .icon-button');
      await delay(250);
    }
    const distinctAccents = new Set(themeObservations.map((entry) => entry.accent)).size;
    record('L-10-themes', distinctAccents === 5 ? 'PASS' : 'FAIL', { distinctAccents, themeObservations });
    if (distinctAccents !== 5) failures.push('L-10');

    // ---- Dark mode ----
    await clickSelector(session, 'button[aria-label="ธีมและสี"]');
    await session.waitFor(`!!document.querySelector('.studio-dialog')`, { label: 'theme studio' });
    await clickText(session, '.mode-toggle button', 'Dark');
    await delay(350);
    const darkState = await session.evaluate(`(() => ({
      mode: document.documentElement.dataset.mode,
      stored: localStorage.getItem('pkh.themeMode'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      textColor: getComputedStyle(document.body).color,
      sidebarBg: getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor,
    }))()`);
    await clickSelector(session, '.studio-dialog .icon-button');
    await delay(300);
    await session.screenshot(`${OUT}/lifeos-1920-06-dark.png`);
    const darkLuminance = (() => {
      const match = /rgba?\((\d+), (\d+), (\d+)/.exec(darkState.bodyBg) || [];
      return match.length ? Number(match[1]) + Number(match[2]) + Number(match[3]) : null;
    })();
    const textLuminance = (() => {
      const match = /rgba?\((\d+), (\d+), (\d+)/.exec(darkState.textColor) || [];
      return match.length ? Number(match[1]) + Number(match[2]) + Number(match[3]) : null;
    })();
    record('L-11-dark-mode',
      darkState.mode === 'dark' && darkLuminance !== null && textLuminance !== null && darkLuminance < textLuminance ? 'PASS' : 'FAIL',
      { ...darkState, darkLuminance, textLuminance });
    if (!(darkState.mode === 'dark' && darkLuminance < textLuminance)) failures.push('L-11');

    // back to light + emerald
    await clickSelector(session, 'button[aria-label="ธีมและสี"]');
    await clickText(session, '.mode-toggle button', 'Light');
    await delay(200);
    await clickText(session, '.theme-swatch', 'Emerald Forest');
    await delay(200);
    await clickSelector(session, '.studio-dialog .icon-button');
    await delay(300);

    // ---- Profile modal ----
    await clickSelector(session, '.profile-card');
    await session.waitFor(`!!document.querySelector('.profile-form')`, { label: 'profile form' });
    await setLabeled(session, '.profile-form', 'ชื่อที่แสดง', 'เจ้าของคลัง');
    await setLabeled(session, '.profile-form', 'สเตตัสประจำวัน', 'วันนี้โฟกัสงานเขียน');
    await setField(session, '.profile-form select[aria-label="อวตารสำเร็จรูป"]', '🦊');
    await clickText(session, '.profile-form button', 'บันทึกโปรไฟล์');
    await delay(600);
    const profileState = await session.evaluate(`(() => ({
      dialogClosed: !document.querySelector('.profile-form'),
      name: document.querySelector('.profile-copy strong')?.textContent?.trim() ?? '',
      status: document.querySelector('.profile-copy small')?.textContent?.trim() ?? '',
      avatar: document.querySelector('.profile-card .avatar')?.textContent?.trim() ?? '',
      progressWidth: document.querySelector('.profile-progress span')?.style?.width ?? '',
      meta: document.querySelector('.profile-meta')?.textContent?.trim() ?? '',
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-07-profile.png`);
    record('L-12-profile',
      profileState.name === 'เจ้าของคลัง' && profileState.status.includes('โฟกัส') && profileState.avatar.includes('🦊') ? 'PASS' : 'FAIL',
      profileState);
    if (!(profileState.name === 'เจ้าของคลัง' && profileState.status.includes('โฟกัส'))) failures.push('L-12');

    // ---- Note with person chip ----
    await clickText(session, '.primary-nav .nav-item', 'โน้ต');
    await delay(500);
    await clickText(session, '.sidebar-actions button', 'เขียนโน้ต');
    await delay(400);
    await setField(session, 'input[aria-label="หัวข้อโน้ต"]', 'ของขวัญวันเกิดคุณแม่');
    await setField(session, 'textarea[aria-label="เนื้อหาโน้ต"]', 'ซื้อผ้าพันคอสีขาว ไซส์ M ก่อนวันที่ 30 ตุลาคม');
    await clickText(session, '.note-chips .chip-add', '＋ บุคคล');
    await delay(300);
    const chipPickerState = await session.evaluate(`(() => ({
      open: !!document.querySelector('.chip-popover'),
      text: document.querySelector('.chip-popover')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? '',
    }))()`);
    // pick the person chip inside the open picker
    const personChipClicked = await session.evaluate(`(() => {
      const options = [...document.querySelectorAll('.chip-popover .taxonomy-choice')];
      const option = options.find((node) => node.textContent.includes('สมศรี'));
      if (!option) return false;
      const box = option.querySelector('input[type="checkbox"]');
      if (!box) return false;
      box.click();
      return true;
    })()`);
    await delay(300);
    await clickText(session, 'button', 'บันทึก');
    await delay(900);
    const noteState = await session.evaluate(`(() => ({
      chips: [...document.querySelectorAll('.note-chips .chip')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
      title: document.querySelector('input[aria-label="หัวข้อโน้ต"]')?.value ?? '',
      listText: document.querySelector('.note-list')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? '',
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-08-note-person-chip.png`);
    record('L-13-note-person-chip',
      personChipClicked && noteState.chips.some((chip) => chip.includes('สมศรี')) ? 'PASS' : 'FAIL',
      { chipPickerState, personChipClicked, noteState });
    if (!(personChipClicked && noteState.chips.some((chip) => chip.includes('สมศรี')))) failures.push('L-13');

    // ---- Focus mode ----
    await clickSelector(session, 'button[aria-label="โหมดโฟกัส"]');
    await delay(400);
    const focusState = await session.evaluate(`(() => {
      const shell = document.querySelector('.app-shell');
      const sidebar = document.querySelector('.app-sidebar');
      const box = sidebar ? sidebar.getBoundingClientRect() : null;
      return {
        focusClass: shell?.classList.contains('focus-mode') ?? false,
        sidebarWidth: box ? Math.round(box.width) : null,
        sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
        detailWidth: Math.round(document.querySelector('.detail-panel')?.getBoundingClientRect().width ?? 0),
      };
    })()`);
    await session.screenshot(`${OUT}/lifeos-1920-09-focus.png`);
    record('L-14-focus-mode', focusState.focusClass && (focusState.sidebarWidth === 0 || focusState.sidebarDisplay === 'none') ? 'PASS' : 'FAIL', focusState);
    if (!(focusState.focusClass && (focusState.sidebarWidth === 0 || focusState.sidebarDisplay === 'none'))) failures.push('L-14');
    await clickSelector(session, 'button[aria-label="ออกจากโหมดโฟกัส"]');
    await delay(400);

    // ---- responsive 1280 ----
    await session.setViewport(1280, 900);
    await delay(500);
    const probe1280 = await session.evaluate(layoutProbe);
    await session.screenshot(`${OUT}/lifeos-1280-01-notes.png`);
    record('L-15-responsive-1280', probe1280.horizontalOverflow ? 'FAIL' : 'PASS', probe1280);
    if (probe1280.horizontalOverflow) failures.push('L-15');

    await clickText(session, '.primary-nav .nav-item', 'ตารางชีวิต');
    await delay(600);
    const probe1280schedule = await session.evaluate(layoutProbe);
    await session.screenshot(`${OUT}/lifeos-1280-02-schedule.png`);
    record('L-16-responsive-1280-schedule', probe1280schedule.horizontalOverflow ? 'FAIL' : 'PASS', probe1280schedule);
    if (probe1280schedule.horizontalOverflow) failures.push('L-16');

    // ---- responsive 768 ----
    await session.setViewport(768, 1024);
    await delay(500);
    const probe768 = await session.evaluate(layoutProbe);
    await session.screenshot(`${OUT}/lifeos-768-01-schedule.png`);
    record('L-17-responsive-768', probe768.horizontalOverflow ? 'FAIL' : 'PASS', probe768);
    if (probe768.horizontalOverflow) failures.push('L-17');

    // ---- responsive 390 (mobile) ----
    await session.setViewport(390, 844, { mobile: true });
    await delay(600);
    const probe390 = await session.evaluate(layoutProbe);
    await session.screenshot(`${OUT}/lifeos-390-01-list.png`);
    record('L-18-responsive-390', probe390.horizontalOverflow ? 'FAIL' : 'PASS', probe390);
    if (probe390.horizontalOverflow) failures.push('L-18');

    // drawer
    await clickSelector(session, 'button[aria-label="เปิดเมนู"]');
    await delay(500);
    const drawerState = await session.evaluate(`(() => {
      const sidebar = document.querySelector('.app-sidebar');
      const box = sidebar.getBoundingClientRect();
      return {
        open: sidebar.classList.contains('is-open'),
        x: Math.round(box.x),
        w: Math.round(box.width),
        backdrop: !!document.querySelector('.sidebar-backdrop'),
        profileVisible: !!document.querySelector('.profile-card')?.getClientRects().length,
      };
    })()`);
    await session.screenshot(`${OUT}/lifeos-390-02-drawer.png`);
    record('L-19-mobile-drawer', drawerState.open && drawerState.x >= 0 && drawerState.backdrop ? 'PASS' : 'FAIL', drawerState);
    if (!(drawerState.open && drawerState.x >= 0 && drawerState.backdrop)) failures.push('L-19');

    // navigate to people from drawer -> list first
    await clickText(session, '.primary-nav .nav-item', 'บุคคลสำคัญ');
    await delay(700);
    const mobileList = await session.evaluate(`(() => ({
      drawerClosed: !document.querySelector('.app-sidebar')?.classList.contains('is-open'),
      listWidth: Math.round(document.querySelector('.list-panel')?.getBoundingClientRect().width ?? 0),
      cards: [...document.querySelectorAll('.person-card')].map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
    }))()`);
    record('L-19b-mobile-list', mobileList.drawerClosed && mobileList.cards.length > 0 ? 'PASS' : 'FAIL', mobileList);
    if (!(mobileList.drawerClosed && mobileList.cards.length > 0)) failures.push('L-19b');
    await clickSelector(session, '.person-card');
    await delay(700);
    const mobileDetail = await session.evaluate(`(() => {
      const detail = document.querySelector('.detail-panel');
      const box = detail.getBoundingClientRect();
      return {
        isOpen: detail.classList.contains('is-open'),
        x: Math.round(box.x),
        w: Math.round(box.width),
        h: Math.round(box.height),
        backVisible: !!document.querySelector('.detail-back')?.getClientRects().length,
        title: document.querySelector('.people-panel .panel-title')?.textContent?.trim() ?? '',
        drawerClosed: !document.querySelector('.app-sidebar')?.classList.contains('is-open'),
      };
    })()`);
    await session.screenshot(`${OUT}/lifeos-390-03-person-detail.png`);
    record('L-20-mobile-detail', mobileDetail.isOpen && mobileDetail.backVisible && mobileDetail.x === 0 ? 'PASS' : 'FAIL', mobileDetail);
    if (!(mobileDetail.isOpen && mobileDetail.backVisible)) failures.push('L-20');

    await clickSelector(session, '.detail-back');
    await delay(500);
    const backState = await session.evaluate(`(() => {
      const detail = document.querySelector('.detail-panel');
      return { isOpen: detail.classList.contains('is-open'), x: Math.round(detail.getBoundingClientRect().x) };
    })()`);
    await session.screenshot(`${OUT}/lifeos-390-04-back.png`);
    record('L-21-mobile-back', !backState.isOpen ? 'PASS' : 'FAIL', backState);
    if (backState.isOpen) failures.push('L-21');

    // ---- diagnostics across the whole run ----
    const diagnostics = session.diagnostics();
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('L-22-console', realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL', diagnostics);
    if (realErrors.length > 0 || diagnostics.exceptions.length > 0) failures.push('L-22');

    // CSP header + document policy observed in the browser
    const security = await session.evaluate(`(async () => {
      const response = await fetch('/', { method: 'GET', cache: 'no-store' });
      return {
        status: response.status,
        csp: response.headers.get('content-security-policy'),
        referrerPolicy: response.headers.get('referrer-policy'),
        xFrameOptions: response.headers.get('x-frame-options'),
        xContentTypeOptions: response.headers.get('x-content-type-options'),
        permissionsPolicy: response.headers.get('permissions-policy'),
        hasMetaCsp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        dataTheme: document.documentElement.dataset.theme,
        dataMode: document.documentElement.dataset.mode,
        storedTheme: localStorage.getItem('pkh.theme'),
        storedMode: localStorage.getItem('pkh.themeMode'),
        storedProfile: localStorage.getItem('pkh.profile'),
      };
    })()`);
    const cspOk = typeof security.csp === 'string'
      && security.csp.includes("default-src 'self'")
      && security.csp.includes("frame-ancestors 'none'")
      && security.csp.includes("img-src 'self' data:");
    const storedOk = security.storedTheme === 'emerald' && security.storedMode === 'light';
    record('L-23-headers-and-storage', cspOk && storedOk && security.xFrameOptions === 'DENY' ? 'PASS' : 'FAIL', security);
    if (!(cspOk && storedOk)) failures.push('L-23');

    // reload to prove persistence survives a fresh document
    await session.setViewport(1920, 1080);
    await session.reload();
    await session.waitFor(`!!document.querySelector('.profile-card')`, { label: 'reload shell' });
    await clickText(session, '.primary-nav .nav-item', 'บุคคลสำคัญ');
    await delay(900);
    const afterReload = await session.evaluate(`(() => ({
      theme: document.documentElement.dataset.theme,
      mode: document.documentElement.dataset.mode,
      name: document.querySelector('.profile-copy strong')?.textContent?.trim() ?? '',
      people: document.querySelectorAll('.people-list > *').length,
      firstPerson: document.querySelector('.people-list > *')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);
    await session.screenshot(`${OUT}/lifeos-1920-10-after-reload.png`);
    record('L-24-reload-persistence',
      afterReload.theme === 'emerald' && afterReload.mode === 'light' && afterReload.people > 0 && afterReload.name === 'เจ้าของคลัง' ? 'PASS' : 'FAIL',
      afterReload);
    if (!(afterReload.theme === 'emerald' && afterReload.people > 0 && afterReload.name === 'เจ้าของคลัง')) failures.push('L-24');

    const summary = {
      base: BASE,
      chrome: chrome.version['User-Agent'],
      failures,
      passed: results.filter((entry) => entry.status === 'PASS').length,
      total: results.length,
      results,
    };
    writeFileSync(`${OUT}/lifeos-ui-result.json`, JSON.stringify(summary, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({ passed: summary.passed, total: summary.total, failures }, null, 2));
  } finally {
    chrome.child.kill();
  }
}

main().catch((error) => {
  console.error('RUN FAILED:', error.message);
  writeFileSync(`${OUT}/lifeos-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
