// Button-height and overflow probe for the work views, on the existing demo data.
import { setTimeout as delay } from 'node:timers/promises';
import { launchChrome, connect } from './cdp.mjs';

const BASE = 'http://127.0.0.1:3471';
const PORT = 9342;
const PROFILE = `C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-probe2-${Date.now()}`;

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
      __setValue(document.querySelector('#username'), 'work-admin');
      __setValue(document.querySelector('#password'), 'Work!2026-demo');
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('เข้าสู่ระบบ')).click();
      return true;
    })()`);
    await session.waitFor(`!!document.querySelector('.profile-card')`);

    for (const view of ['กล่องขาเข้า', 'งานที่ต้องทำ', 'โปรเจกต์', 'เป้าหมาย']) {
      await session.evaluate(`(() => {
        const node = [...document.querySelectorAll('.primary-nav .nav-item')]
          .find((n) => n.textContent.includes(${JSON.stringify(view)}));
        node?.click();
        return true;
      })()`);
      await delay(900);
      for (const [width, height] of [[1920, 1080], [1280, 900], [768, 1024], [390, 844]]) {
        await session.setViewport(width, height, { mobile: width < 500 });
        await delay(350);
        const probe = await session.evaluate(`(() => {
          const small = [...document.querySelectorAll('button')]
            .filter((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().height > 0
              && n.getBoundingClientRect().height < 40)
            .map((n) => ({ text: n.textContent.trim().slice(0, 20), h: Math.round(n.getBoundingClientRect().height) }));
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            smallCount: small.length,
            small,
          };
        })()`);
        console.log(`${view} @${width}: ${JSON.stringify(probe)}`);
      }
    }
  } finally {
    chrome.child.kill();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('PROBE FAILED:', error.message);
  process.exit(1);
});
