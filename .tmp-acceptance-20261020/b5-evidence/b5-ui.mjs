// Batch 5B acceptance: Vault + Library UI, 10-bucket command palette, themes, responsive.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from '../cdp.mjs';

const BASE = 'http://127.0.0.1:3497';
const ROOT = 'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020';
const OUT = `${ROOT}/b5-evidence`;
const PORT = 9366;
const PROFILE = `${ROOT}/profile-b5-${Date.now()}`;
const UPLOAD_FILE = `${OUT}/b5-attachment.txt`;

mkdirSync(OUT, { recursive: true });
writeFileSync(UPLOAD_FILE, 'attachment for batch 5b acceptance\n', 'utf8');

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
  await delay(120);
}

async function clickExact(session, selector, text) {
  const ok = await session.evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`clickExact miss: ${selector} ~ ${text}`);
  await delay(400);
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
  await delay(500);
}

async function navTo(session, label) {
  await clickText(session, '.primary-nav .nav-item', label);
  await delay(900);
}

/** Real mouse press: element.click() from evaluate() carries no user activation. */
async function realClickText(session, selector, text) {
  const point = await session.evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}));
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (!point) throw new Error(`realClickText miss: ${text}`);
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await delay(600);
}

const toastText = `(() => [...document.querySelectorAll('.toast')]
  .map((n) => n.textContent.replace(/\\s+/g, ' ').trim()).join(' | '))()`;

function localDate(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function main() {
  const chrome = await launchChrome({ port: PORT, userDataDir: PROFILE });
  const { session } = await connect({ port: PORT });
  try {
    await session.send('Browser.grantPermissions', {
      origin: BASE,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    });
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`);
    await setField(session, '#username', 'b5-admin');
    await setField(session, '#password', 'B5!2026-demo');
    await clickText(session, 'button', 'เข้าสู่ระบบ');
    await session.waitFor(`!!document.querySelector('.dashboard-panel')`);
    record('B5-00-login', 'PASS', { ok: true });

    // ------------------------------------------------------------- vault
    await navTo(session, 'คลังสำคัญ & ทรัพย์สิน');
    await session.waitFor(`!!document.querySelector('.vault-panel')`);
    const vaultEmpty = await session.evaluate(`(() => ({
      panel: !!document.querySelector('.vault-panel'),
      addButton: !!document.querySelector('.list-add-button'),
      hint: document.querySelector('.vault-list .sidebar-hint')?.textContent?.trim() ?? '',
      active: document.querySelector('.primary-nav .nav-item.is-active')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);
    record('B5-V1-vault-view-opens', vaultEmpty.panel && vaultEmpty.addButton && vaultEmpty.active.includes('Vault')
      ? 'PASS' : 'FAIL', vaultEmpty);
    await shot(session, 'b5-1920-01-vault-empty');

    await setField(session, '.vault-form input[placeholder^="เช่น กรมธรรม์รถยนต์"]', 'B5 กรมธรรม์รถยนต์');
    await setField(session, '.vault-form select', 'เอกสาร & ประกัน');
    await setField(session, '.vault-form input[placeholder^="เลขกรมธรรม์"]', 'POL-B5-998877');
    await setField(session, '.vault-form input[placeholder^="เช่น ลิ้นชัก"]', 'ลิ้นชักชั้น 2 ห้องนอน');
    await setField(session, '.vault-form input[type="date"]', localDate(12));
    await setField(session, '.vault-form input[placeholder^="เช่น 18,500"]', '18,500 บาท/ปี');
    await setField(session, '.vault-form textarea', 'ต่ออายุออนไลน์ได้ที่เว็บบริษัท');
    await clickExact(session, '.vault-form button[type="submit"]', 'เพิ่มเข้าคลัง');
    await delay(1500);
    const created = await session.evaluate(`(() => {
      const card = document.querySelector('.vault-card');
      return {
        cards: document.querySelectorAll('.vault-card').length,
        title: card?.querySelector('strong')?.textContent?.trim() ?? '',
        badge: card?.querySelector('.category-badge')?.textContent?.trim() ?? '',
        code: card?.querySelector('.vault-code')?.textContent?.trim() ?? '',
        due: card?.querySelector('.vault-due')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        urgent: !!card?.querySelector('.vault-due.is-urgent'),
        place: card?.querySelector('.vault-place')?.textContent?.trim() ?? '',
        toast: ${toastText},
        attachments: !!document.querySelector('.entity-attachments'),
      };
    })()`);
    record('B5-V2-vault-create',
      created.cards === 1 && created.title === 'B5 กรมธรรม์รถยนต์'
        && created.badge === 'เอกสาร & ประกัน' && created.code.includes('POL-B5-998877')
        && created.urgent && created.toast.includes('เพิ่มรายการเข้าคลังแล้ว')
        && created.attachments ? 'PASS' : 'FAIL', created);
    await shot(session, 'b5-1920-02-vault-created');

    // edit
    await setField(session, '.vault-form input[placeholder^="เช่น 18,500"]', '19,900 บาท/ปี');
    await clickExact(session, '.vault-form button[type="submit"]', 'บันทึกการแก้ไข');
    await delay(1400);
    const edited = await session.evaluate(`(() => ({
      amount: document.querySelector('.vault-card .vault-amount')?.textContent?.trim() ?? '',
      toast: ${toastText},
    }))()`);
    record('B5-V3-vault-edit', edited.amount === '19,900 บาท/ปี' && edited.toast.includes('บันทึกการแก้ไขแล้ว')
      ? 'PASS' : 'FAIL', edited);

    // copy key (a real mouse press + focused page, otherwise the clipboard API is refused)
    await session.send('Page.bringToFront');
    await realClickText(session, '.vault-panel button', 'คัดลอกเลขสำคัญ');
    await delay(700);
    const copied = await session.evaluate(`(async () => ({
      toast: ${toastText},
      clipboard: await navigator.clipboard.readText().catch(() => ''),
    }))()`);
    record('B5-V4-vault-copy-key',
      copied.toast.includes('คัดลอกลงคลิปบอร์ดแล้ว') && copied.clipboard === 'POL-B5-998877' ? 'PASS' : 'FAIL', copied);

    // send to reminders
    await clickText(session, '.vault-panel button', 'ส่งวันครบกำหนดเข้าปฏิทินแจ้งเตือน');
    await delay(1500);
    const reminderState = await session.evaluate(`(async () => {
      const response = await fetch('/api/reminders', { headers: { 'X-PKH-Request': '1' } });
      const body = await response.json();
      return {
        toast: ${toastText},
        titles: body.reminders.map((r) => r.title),
        dates: body.reminders.map((r) => r.targetDate),
      };
    })()`);
    record('B5-V5-vault-to-reminders',
      reminderState.titles.some((title) => title.includes('B5 กรมธรรม์รถยนต์'))
        && reminderState.dates.includes(localDate(12))
        && reminderState.toast.includes('ส่งวันครบกำหนดเข้าปฏิทินแจ้งเตือนแล้ว') ? 'PASS' : 'FAIL', reminderState);

    // attach a file through the picker
    await session.send('DOM.enable');
    const doc = await session.send('DOM.getDocument', { depth: -1 });
    const inputNode = await session.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '.entity-attachments input[type=file]',
    });
    if (!inputNode.nodeId) throw new Error('attachment input missing');
    await session.send('DOM.setFileInputFiles', { files: [UPLOAD_FILE], nodeId: inputNode.nodeId });
    await delay(2000);
    const attached = await session.evaluate(`(() => ({
      count: document.querySelectorAll('.entity-attachment-item').length,
      name: document.querySelector('.entity-attachment-link span:nth-of-type(2)')?.textContent?.trim() ?? '',
      href: document.querySelector('.entity-attachment-link')?.getAttribute('href') ?? '',
    }))()`);
    record('B5-V6-vault-attach-file',
      attached.count === 1 && attached.name === 'b5-attachment.txt' && attached.href.startsWith('/api/files/')
        ? 'PASS' : 'FAIL', attached);
    await shot(session, 'b5-1920-03-vault-attached');

    // ----------------------------------------------------------- library
    await navTo(session, 'ห้องสมุด & คู่มือชีวิต');
    await session.waitFor(`!!document.querySelector('.library-panel')`);
    await setField(session, '.library-form input[placeholder^="เช่น วิธีปิดน้ำ"]', 'B5 SOP เปิดร้าน');
    await setField(session, '.library-form select', 'คู่มือชีวิต & SOP');
    await setField(session, '.library-form input[placeholder^="ลิงก์ ชื่อหนังสือ"]', 'ทำเอง / ทีมร้าน');
    await setField(session, '.library-form textarea[placeholder^="1) …"]', '1) เปิดไฟหน้าร้าน\n2) ตรวจสต็อกของสด\n3) เปิดลิ้นชักเก็บเงิน');
    await setField(session, '.library-form textarea[placeholder^="ขั้นตอนที่ 1"]', 'ขั้นตอนที่ 1 เปิดไฟ\nขั้นตอนที่ 2 ตรวจสต็อก\nขั้นตอนที่ 3 เปิดลิ้นชัก');
    await clickExact(session, '.library-form button[type="submit"]', 'เพิ่มเข้าห้องสมุด');
    await delay(1500);
    const libraryCreated = await session.evaluate(`(() => ({
      cards: document.querySelectorAll('.library-card').length,
      title: document.querySelector('.library-card strong')?.textContent?.trim() ?? '',
      status: document.querySelector('.library-card .status-badge')?.textContent?.trim() ?? '',
      category: document.querySelector('.library-card .category-badge')?.textContent?.trim() ?? '',
      takeaways: [...document.querySelectorAll('.takeaway-list li')].map((n) => n.textContent.trim()),
      boxTitle: document.querySelector('.takeaway-head strong')?.textContent?.trim() ?? '',
      attachments: !!document.querySelector('.entity-attachments'),
      toast: ${toastText},
    }))()`);
    record('B5-L1-library-create',
      libraryCreated.cards === 1 && libraryCreated.title === 'B5 SOP เปิดร้าน'
        && libraryCreated.status === 'ใช้งานประจำ'
        && libraryCreated.takeaways.length === 3
        && libraryCreated.boxTitle.includes('แก่นสำคัญ 3 ข้อ')
        && libraryCreated.attachments && libraryCreated.toast.includes('เพิ่มความรู้เข้าห้องสมุดแล้ว')
        ? 'PASS' : 'FAIL', libraryCreated);
    await shot(session, 'b5-1920-04-library-created');

    // edit: status + takeaways
    const selects = await session.evaluate(`(() => [...document.querySelectorAll('.library-form select')].map((s) => s.value))()`);
    await session.evaluate(`(() => {
      ${SET_VALUE}
      const selects = document.querySelectorAll('.library-form select');
      __setValue(selects[1], 'สรุปจบแล้ว');
      return true;
    })()`);
    await delay(200);
    await setField(session, '.library-form textarea[placeholder^="1) …"]', '1) เปิดไฟทุกครั้ง\n2) เช็กสต็อกก่อนเที่ยง');
    await clickExact(session, '.library-form button[type="submit"]', 'บันทึกการแก้ไข');
    await delay(1500);
    const libraryEdited = await session.evaluate(`(() => ({
      status: document.querySelector('.library-card .status-badge')?.textContent?.trim() ?? '',
      takeaways: [...document.querySelectorAll('.takeaway-list li')].map((n) => n.textContent.trim()),
      toast: ${toastText},
    }))()`);
    record('B5-L2-library-edit',
      libraryEdited.status === 'สรุปจบแล้ว' && libraryEdited.takeaways.length === 2
        && libraryEdited.toast.includes('บันทึกการแก้ไขแล้ว') ? 'PASS' : 'FAIL',
      { ...libraryEdited, originalStatus: selects[1] });

    // attach file to library
    const doc2 = await session.send('DOM.getDocument', { depth: -1 });
    const inputNode2 = await session.send('DOM.querySelector', {
      nodeId: doc2.root.nodeId,
      selector: '.entity-attachments input[type=file]',
    });
    await session.send('DOM.setFileInputFiles', { files: [UPLOAD_FILE], nodeId: inputNode2.nodeId });
    await delay(2000);
    const libraryAttached = await session.evaluate(`(() => ({
      count: document.querySelectorAll('.entity-attachment-item').length,
      name: document.querySelector('.entity-attachment-link span:nth-of-type(2)')?.textContent?.trim() ?? '',
    }))()`);
    record('B5-L3-library-attach-file',
      libraryAttached.count === 1 && libraryAttached.name === 'b5-attachment.txt' ? 'PASS' : 'FAIL', libraryAttached);
    await shot(session, 'b5-1920-05-library-attached');

    // ------------------------------------------------- command palette 10
    await session.evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.command-dialog')`);
    await delay(300);
    const chips = await session.evaluate(`(() => ({
      count: document.querySelectorAll('.command-type-chip').length,
      labels: [...document.querySelectorAll('.command-type-chip')].map((c) => c.textContent.trim()),
      pressed: [...document.querySelectorAll('.command-type-chip')].filter((c) => c.getAttribute('aria-pressed') === 'true').length,
      counter: document.querySelector('.command-filter-head .sidebar-hint')?.textContent?.trim() ?? '',
    }))()`);
    record('B5-C1-ten-type-chips',
      chips.count === 10 && chips.pressed === 10 && chips.counter.includes('10/10')
        && chips.labels.includes('คลังสำคัญ') && chips.labels.includes('ห้องสมุด') ? 'PASS' : 'FAIL', chips);
    await shot(session, 'b5-1920-06-command-ten-chips');

    await setField(session, '.command-input-row input', 'B5');
    await delay(1200);
    const paletteResults = await session.evaluate(`(() => ({
      kinds: [...new Set([...document.querySelectorAll('.command-item .entry-kind')].map((n) => n.textContent.trim()))],
      total: document.querySelectorAll('.command-item').length,
      vaultItem: [...document.querySelectorAll('.command-item')].some((n) => n.textContent.includes('B5 กรมธรรม์รถยนต์')),
      libraryItem: [...document.querySelectorAll('.command-item')].some((n) => n.textContent.includes('B5 SOP เปิดร้าน')),
    }))()`);
    record('B5-C2-search-vault-and-library',
      paletteResults.kinds.includes('คลังสำคัญ') && paletteResults.kinds.includes('ห้องสมุด')
        && paletteResults.vaultItem && paletteResults.libraryItem ? 'PASS' : 'FAIL', paletteResults);
    await shot(session, 'b5-1920-07-command-results');

    // navigate to vault hit
    await session.evaluate(`(() => {
      const item = [...document.querySelectorAll('.command-item')]
        .find((n) => n.querySelector('.entry-kind')?.textContent?.trim() === 'คลังสำคัญ');
      item.click();
      return true;
    })()`);
    await delay(1500);
    const vaultNav = await session.evaluate(`(() => ({
      active: document.querySelector('.primary-nav .nav-item.is-active')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      title: document.querySelector('.vault-form input[placeholder^="เช่น กรมธรรม์รถยนต์"]')?.value ?? '',
      dialog: !!document.querySelector('.command-dialog'),
    }))()`);
    record('B5-C3-navigate-vault',
      !vaultNav.dialog && vaultNav.active.includes('Vault') && vaultNav.title === 'B5 กรมธรรม์รถยนต์'
        ? 'PASS' : 'FAIL', vaultNav);

    // navigate to library hit
    await session.evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.command-dialog')`);
    await setField(session, '.command-input-row input', 'B5');
    await delay(1200);
    await session.evaluate(`(() => {
      const item = [...document.querySelectorAll('.command-item')]
        .find((n) => n.querySelector('.entry-kind')?.textContent?.trim() === 'ห้องสมุด');
      item.click();
      return true;
    })()`);
    await delay(1500);
    const libraryNav = await session.evaluate(`(() => ({
      active: document.querySelector('.primary-nav .nav-item.is-active')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      title: document.querySelector('.library-form input[placeholder^="เช่น วิธีปิดน้ำ"]')?.value ?? '',
    }))()`);
    record('B5-C4-navigate-library',
      libraryNav.active.includes('Library') && libraryNav.title === 'B5 SOP เปิดร้าน' ? 'PASS' : 'FAIL', libraryNav);

    // ------------------------------------------------------------ themes
    const themeResults = [];
    for (const [label, expected] of [
      ['Emerald', 'emerald'], ['Indigo', 'indigo'], ['Rose', 'rose'], ['Amber', 'amber'], ['Violet', 'violet'],
    ]) {
      await session.evaluate(`(() => {
        document.querySelector('.theme-button, [aria-label="ธีมและสี"]')?.click();
        return true;
      })()`);
      await delay(400);
      await session.waitFor(`!!document.querySelector('.theme-grid')`);
      await clickText(session, '.theme-swatch', label);
      await delay(400);
      const state = await session.evaluate(`(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          theme: document.documentElement.dataset.theme,
          green: style.getPropertyValue('--green').trim(),
          accent: style.getPropertyValue('--accent-2').trim(),
          glow: style.getPropertyValue('--accent-glow').trim(),
          takeawayBg: getComputedStyle(document.querySelector('.takeaway-box')).backgroundImage.slice(0, 40),
        };
      })()`);
      themeResults.push({ label, ...state });
      await shot(session, `b5-1920-08-theme-${expected}`);
      await session.evaluate(`(() => {
        document.querySelector('.studio-dialog .icon-button')?.click();
        return true;
      })()`);
      await delay(300);
      if (state.theme !== expected || !state.accent || !state.glow) {
        record(`B5-T-${expected}`, 'FAIL', state);
      }
    }
    record('B5-T1-five-themes',
      themeResults.length === 5 && themeResults.every((t) => t.accent && t.glow && t.takeawayBg.includes('linear-gradient'))
        ? 'PASS' : 'FAIL', themeResults);

    // -------------------------------------------------------- responsive
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(600);
      const probe = await session.evaluate(`(() => {
        const buttons = [...document.querySelectorAll('button, .chip-add, a.button')]
          .filter((n) => n.getClientRects().length > 0);
        const small = buttons.filter((n) => {
          const box = n.getBoundingClientRect();
          return box.height > 0 && (box.height < 40 || box.width < 40);
        }).map((n) => ({ text: n.textContent.trim().slice(0, 20), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) }));
        const inputs = [...document.querySelectorAll('.vault-form input, .vault-form select, .vault-form textarea, .library-form input, .library-form select, .library-form textarea')]
          .filter((n) => n.getClientRects().length > 0);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth,
          smallButtons: small.slice(0, 6),
          smallInputs: inputs.filter((n) => n.getBoundingClientRect().height < 40).length,
        };
      })()`);
      await shot(session, `b5-${name}-01-library`);
      record(`B5-R1-${name}-library`,
        !probe.overflow && probe.smallButtons.length === 0 && probe.smallInputs === 0 ? 'PASS' : 'FAIL', probe);
    }

    // command palette at each width
    for (const [width, height, name] of [[1280, 900, '1280'], [768, 1024, '768'], [390, 844, '390']]) {
      await session.setViewport(width, height, { mobile: width < 500 });
      await delay(500);
      await session.evaluate(`(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        return true;
      })()`);
      await session.waitFor(`!!document.querySelector('.command-dialog')`);
      await setField(session, '.command-input-row input', 'B5');
      await delay(1100);
      const probe = await session.evaluate(`(() => {
        const dialog = document.querySelector('.command-dialog');
        const buttons = [...dialog.querySelectorAll('button')].filter((n) => n.getClientRects().length > 0);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          dialogOverflowX: dialog.scrollWidth > dialog.clientWidth + 1,
          smallButtons: buttons.filter((n) => {
            const box = n.getBoundingClientRect();
            return box.height > 0 && (box.height < 40 || box.width < 40);
          }).length,
          chips: dialog.querySelectorAll('.command-type-chip').length,
        };
      })()`);
      await shot(session, `b5-${name}-02-command`);
      record(`B5-R2-${name}-command`,
        !probe.overflow && !probe.dialogOverflowX && probe.smallButtons === 0 && probe.chips === 10 ? 'PASS' : 'FAIL', probe);
      await session.evaluate(`(() => {
        document.querySelector('.command-dialog .icon-button')?.click();
        return true;
      })()`);
      await delay(300);
    }

    // ------------------------------------------------------------- delete
    await session.setViewport(1920, 1080);
    await delay(400);
    await navTo(session, 'ห้องสมุด & คู่มือชีวิต');
    await clickText(session, '.library-card', 'B5 SOP เปิดร้าน');
    await delay(600);
    await clickExact(session, '.library-panel button', 'ลบรายการ');
    await delay(1500);
    const libraryDeleted = await session.evaluate(`(() => ({
      cards: document.querySelectorAll('.library-card').length,
      toast: ${toastText},
    }))()`);
    record('B5-L4-library-delete',
      libraryDeleted.cards === 0 && libraryDeleted.toast.includes('ลบรายการออกจากห้องสมุดแล้ว') ? 'PASS' : 'FAIL', libraryDeleted);

    await navTo(session, 'คลังสำคัญ & ทรัพย์สิน');
    await clickText(session, '.vault-card', 'B5 กรมธรรม์รถยนต์');
    await delay(600);
    await clickExact(session, '.vault-panel button', 'ลบรายการ');
    await delay(1500);
    const vaultDeleted = await session.evaluate(`(() => ({
      cards: document.querySelectorAll('.vault-card').length,
      toast: ${toastText},
    }))()`);
    record('B5-V7-vault-delete',
      vaultDeleted.cards === 0 && vaultDeleted.toast.includes('ลบรายการออกจากคลังแล้ว') ? 'PASS' : 'FAIL', vaultDeleted);

    const diagnostics = session.diagnostics();
    const realErrors = diagnostics.consoleErrors.filter((entry) => !/401|Unauthorized/i.test(entry.text));
    record('B5-X1-console-clean',
      realErrors.length === 0 && diagnostics.exceptions.length === 0 ? 'PASS' : 'FAIL',
      { realErrors, exceptions: diagnostics.exceptions, httpErrors: diagnostics.httpErrors });

    writeFileSync(`${OUT}/b5-ui-result.json`, JSON.stringify({
      generatedAt: new Date().toISOString(),
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
  writeFileSync(`${OUT}/b5-ui-result.json`, JSON.stringify({ error: error.message, results }, null, 2));
  process.exit(1);
});
