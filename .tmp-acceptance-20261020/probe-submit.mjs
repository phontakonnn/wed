// Probe why the schedule inline forms do not submit.
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3461';
const PORT = 9335;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-probe-${Date.now()}`;

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
    await session.setViewport(1600, 1000);
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

    console.log('STRUCT:', JSON.stringify(await session.evaluate(`(() => {
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const form = card.querySelector('.inline-form');
      return {
        formTag: form.tagName,
        formCount: document.querySelectorAll('.schedule-panel form').length,
        nestedForms: document.querySelectorAll('form form').length,
        parentChain: (() => { const chain = []; let node = form; while (node && chain.length < 8) { chain.push(node.tagName + '.' + (node.className || '')); node = node.parentElement; } return chain; })(),
        buttons: [...form.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), type: b.type, disabled: b.disabled })),
      };
    })()`), null, 2));

    // instrument: does a native submit event reach the form?
    await session.evaluate(`(() => {
      window.__submitSeen = 0;
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const form = card.querySelector('.inline-form');
      form.addEventListener('submit', () => { window.__submitSeen += 1; }, true);
      return true;
    })()`);

    const clicked = await session.evaluate(`(() => {
      ${SET_VALUE}
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const inputs = [...card.querySelectorAll('.inline-form input')];
      __setValue(inputs[0], '06:30 - 07:30');
      __setValue(inputs[1], 'วิ่งออกกำลังกาย');
      return { values: inputs.map((n) => n.value) };
    })()`);
    console.log('FILLED:', JSON.stringify(clicked));
    await delay(300);

    const submitAttempt = await session.evaluate(`(() => {
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const form = card.querySelector('.inline-form');
      const before = window.__submitSeen;
      const button = form.querySelector('button');
      button.click();
      return { before, afterClick: window.__submitSeen, valid: form.checkValidity() };
    })()`);
    await delay(1200);
    console.log('CLICK SUBMIT:', JSON.stringify(submitAttempt));
    console.log('STATE1:', JSON.stringify(await session.evaluate(`(() => ({
      seen: window.__submitSeen,
      error: document.querySelector('.schedule-panel .form-error')?.textContent?.trim() ?? '',
      notice: document.querySelector('.schedule-panel .form-notice')?.textContent?.trim() ?? '',
      items: document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li').length,
    }))()`)));

    // force a native submit
    await session.evaluate(`(() => {
      const card = document.querySelectorAll('.schedule-panel .life-card')[1];
      const form = card.querySelector('.inline-form');
      form.requestSubmit();
      return true;
    })()`);
    await delay(1500);
    console.log('STATE2:', JSON.stringify(await session.evaluate(`(() => ({
      seen: window.__submitSeen,
      error: document.querySelector('.schedule-panel .form-error')?.textContent?.trim() ?? '',
      notice: document.querySelector('.schedule-panel .form-notice')?.textContent?.trim() ?? '',
      items: document.querySelectorAll('.schedule-panel .life-card:nth-child(2) .life-list li').length,
    }))()`)));
    console.log('POSTS:', JSON.stringify(session.requests.filter((r) => r.method === 'POST').map((r) => r.url), null, 2));
  } finally {
    chrome.child.kill();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('PROBE FAILED:', error.message);
  process.exit(1);
});
