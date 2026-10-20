// Focused debug run for the schedule panel forms.
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3461';
const PORT = 9334;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-debug-${Date.now()}`;

const SET_VALUE = `
function __setValue(target, value) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : target instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}`;

async function main() {
  const chrome = await launchChrome({ port: PORT, userDataDir: PROFILE });
  const { session } = await connect({ port: PORT });
  try {
    await session.setViewport(1920, 1080);
    await session.goto(`${BASE}/`);
    await session.waitFor(`!!document.querySelector('#username')`);
    await session.evaluate(`(() => {
      ${SET_VALUE}
      __setValue(document.querySelector('#username'), 'lifeos-admin');
      __setValue(document.querySelector('#password'), 'LifeOs!2026-demo');
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('เข้าสู่ระบบ')).click();
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.profile-card')`);

    await session.evaluate(`(() => {
      [...document.querySelectorAll('.primary-nav .nav-item')].find((b) => b.textContent.includes('ตารางชีวิต')).click();
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.schedule-panel')`);

    console.log('FORM STRUCTURE:', JSON.stringify(await session.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.schedule-panel .life-card')];
      return cards.map((card) => ({
        heading: card.querySelector('h3')?.textContent?.trim(),
        fields: [...card.querySelectorAll('.inline-form input, .inline-form select')].map((node, index) => ({
          index, tag: node.tagName, type: node.type, required: node.required, placeholder: node.placeholder, value: node.value,
        })),
        listItems: card.querySelectorAll('.life-list li, .habit-list li').length,
      }));
    })()`), null, 2));

    // fill the timeblock form via label-free direct selectors and report state
    const filled = await session.evaluate(`(() => {
      ${SET_VALUE}
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const inputs = [...card.querySelectorAll('.inline-form input')];
      __setValue(inputs[0], '06:30 - 07:30');
      __setValue(inputs[1], 'วิ่งออกกำลังกาย');
      return { after: inputs.map((node) => node.value), count: inputs.length };
    })()`);
    console.log('FILLED:', JSON.stringify(filled));
    await delay(300);

    const submitState = await session.evaluate(`(() => {
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const form = card.querySelector('.inline-form');
      const button = form.querySelector('button');
      const validity = [...form.querySelectorAll('input')].map((node) => ({ value: node.value, valid: node.validity.valid, missing: node.validity.valueMissing }));
      button.click();
      return { buttonText: button.textContent.trim(), buttonType: button.type, validity, formValid: form.checkValidity() };
    })()`);
    console.log('SUBMIT:', JSON.stringify(submitState));
    await delay(1500);

    console.log('AFTER:', JSON.stringify(await session.evaluate(`(() => ({
      error: document.querySelector('.schedule-panel .form-error')?.textContent?.trim() ?? '',
      notice: document.querySelector('.schedule-panel .form-notice')?.textContent?.trim() ?? '',
      items: [...document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim()),
      cardCount: document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li').length,
      allListSelectors: [...document.querySelectorAll('.schedule-panel .life-list, .schedule-panel .habit-list')].map((n) => n.className),
    }))()`), null, 2));

    console.log('API REQUESTS:', JSON.stringify(session.requests.filter((r) => (r.url || '').includes('/api/')), null, 2));
    console.log('BUTTON STATE:', JSON.stringify(await session.evaluate(`(() => {
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const button = card.querySelector('.inline-form button');
      return { disabled: button.disabled, hasOnClick: !!button.onclick, outer: button.outerHTML };
    })()`)));
    console.log('HTTP:', JSON.stringify(session.diagnostics().httpErrors, null, 2));
    console.log('REQUESTS:', JSON.stringify(session.diagnostics().consoleErrors, null, 2));
    await session.screenshot('C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/lifeos-evidence/debug-schedule.png');
  } finally {
    chrome.child.kill();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('DEBUG FAILED:', error.message);
  process.exit(1);
});
