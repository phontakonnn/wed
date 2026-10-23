/**
 * Mobile layout audit.
 *
 * The app needs a signed-in session for the full shell, and the API server is
 * not installed in every environment, so this script:
 *   1. audits the public routes (login, design system) at phone sizes, and
 *   2. mounts the real bottom-nav / FAB markup inside the running app so the
 *      production cascade (App.css + shell.css + tokens) is measured for real.
 *
 * Run: node e2e/mobile-audit.mjs [url]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = join(tmpdir(), 'pkh-mobile-audit');
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-390', width: 390, height: 844, dsf: 3 },
  { name: 'android-360', width: 360, height: 740, dsf: 2 },
  { name: 'iphone-se-320', width: 320, height: 568, dsf: 2 },
];

/** Injected markup mirrors apps/web/src/components/MobileBottomNav.tsx. */
const SHELL_MARKUP = `
  <div class="mobile-fab-container" id="audit-fab">
    <div class="mobile-fab-menu">
      <button class="fab-item" type="button"><span class="fab-item-icon">+</span><span class="fab-item-label">โน้ตใหม่</span></button>
      <button class="fab-item" type="button"><span class="fab-item-icon">+</span><span class="fab-item-label">เข้าสู่ Inbox</span></button>
      <button class="fab-item" type="button"><span class="fab-item-icon">+</span><span class="fab-item-label">เพิ่มงานที่ต้องทำ</span></button>
    </div>
    <button class="mobile-fab-button" type="button" aria-label="เปิดเมนูสร้างใหม่">+</button>
  </div>
  <nav class="mobile-bottom-nav" id="audit-nav" aria-label="เมนูหลักสำหรับมือถือ">
    <button type="button" class="bottom-nav-item is-active"><span class="bottom-nav-icon">H</span><span class="bottom-nav-label">ภาพรวมวันนี้</span></button>
    <button type="button" class="bottom-nav-item"><span class="bottom-nav-icon">N</span><span class="bottom-nav-label">โน้ต</span></button>
    <button type="button" class="bottom-nav-item"><span class="bottom-nav-icon">I<span class="bottom-nav-badge">12</span></span><span class="bottom-nav-label">กล่องขาเข้า</span></button>
    <button type="button" class="bottom-nav-item"><span class="bottom-nav-icon">T<span class="bottom-nav-badge">3</span></span><span class="bottom-nav-label">งาน</span></button>
    <button type="button" class="bottom-nav-item"><span class="bottom-nav-icon">M</span><span class="bottom-nav-label">เพิ่มเติม</span></button>
  </nav>
`;

const collect = () => {
  // `innerWidth` can widen in mobile emulation when the page overflows, so the
  // scroll-containing element is the honest reference.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };

  const overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  }

  const small = [];
  const interactive = 'button, a[href], input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(interactive)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      small.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 50),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }

  const fields = [...document.querySelectorAll('input, textarea, select')]
    .filter(visible)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      font: parseFloat(getComputedStyle(el).fontSize),
    }))
    .filter((f) => !['checkbox', 'radio', 'range', 'color', 'file'].includes(f.type));

  const nav = document.getElementById('audit-nav');
  const fab = document.getElementById('audit-fab');
  const navRect = nav ? nav.getBoundingClientRect() : null;
  const fabRect = fab ? fab.getBoundingClientRect() : null;

  return {
    viewport: { w: vw, h: vh },
    scroll: {
      docW: document.documentElement.scrollWidth,
      bodyW: document.body.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    },    overflowCount: overflow.length,
    overflow: overflow.slice(0, 15),
    smallTargetCount: small.length,
    smallTargets: small.slice(0, 20),
    fieldsBelow16: fields.filter((f) => f.font < 16),
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
    colorScheme: document.querySelector('meta[name="color-scheme"]')?.content ?? null,
    nav: navRect
      ? {
          height: Math.round(navRect.height),
          top: Math.round(navRect.top),
          bottomGap: Math.round(vh - navRect.bottom),
          display: getComputedStyle(nav).display,
          gridCols: getComputedStyle(nav).gridTemplateColumns,
        }
      : null,
    fab: fabRect ? { bottomGapToNav: navRect ? Math.round(navRect.top - fabRect.bottom) : null, size: Math.round(fabRect.width) } : null,
  };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { base: BASE, generatedAt: new Date().toISOString(), devices: [] };

for (const dev of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dsf,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const entry = { device: dev.name, routes: {} };

  for (const route of ['/', '/design-system']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    entry.routes[route] = await page.evaluate(collect);
    await page.screenshot({ path: join(OUT, `${dev.name}${route === '/' ? '-login' : '-design-system'}.png`), fullPage: false });
  }

  // Modal demo on the design-system route: sizing, scroll containment, close target.
  await page.goto(BASE + '/design-system', { waitUntil: 'networkidle' }).catch(() => {});
  const modalTrigger = page.getByRole('button', { name: /Modal/i }).first();
  if (await modalTrigger.count()) {
    await modalTrigger.scrollIntoViewIfNeeded();
    await modalTrigger.click().catch(() => {});
    await page.waitForTimeout(400);
    entry.modal = await page.evaluate(() => {
      const box = document.querySelector('.pkh-modal-container');
      const close = document.querySelector('.pkh-modal-close');
      const body = document.querySelector('.pkh-modal-body');
      if (!box) return null;
      const r = box.getBoundingClientRect();
      const c = close?.getBoundingClientRect();
      const b = body?.getBoundingClientRect();
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        size: { w: Math.round(r.width), h: Math.round(r.height) },
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        withinViewport: r.top >= 0 && r.bottom <= window.innerHeight,
        bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
        bodyHeight: b ? Math.round(b.height) : null,
        close: c ? { w: Math.round(c.width), h: Math.round(c.height) } : null,
      };
    });
    await page.screenshot({ path: join(OUT, `${dev.name}-modal.png`) });
    await page.keyboard.press('Escape').catch(() => {});
  }

  // Mount the real mobile shell markup on the login route (no auth needed).
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});  await page.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html);
    document.documentElement.dataset.theme = 'light';
  }, SHELL_MARKUP);
  await page.waitForTimeout(300);
  entry.shellLight = await page.evaluate(collect);
  await page.screenshot({ path: join(OUT, `${dev.name}-shell-light.png`) });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.mode = 'dark';
  });
  await page.waitForTimeout(200);
  entry.shellDark = await page.evaluate(collect);
  await page.screenshot({ path: join(OUT, `${dev.name}-shell-dark.png`) });

  await context.close();
  report.devices.push(entry);
}

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('\nScreenshots + report: ' + OUT);
