// Temporary CDP harness for PKH acceptance runs.
// Uses only Node built-ins (fetch + WebSocket) so it adds no dependencies.
// Connects straight to a page target socket (no session multiplexing).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function launchChrome({ port, userDataDir, width = 1920, height = 1080 }) {
  rmSync(userDataDir, { recursive: true, force: true });
  mkdirSync(userDataDir, { recursive: true });
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let version = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch {
      /* not ready yet */
    }
    await delay(250);
  }
  if (!version) {
    child.kill();
    throw new Error('Chrome DevTools endpoint did not become ready');
  }
  return { child, version };
}

export class Session {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.exceptions = [];
    this.httpErrors = [];
    this.requests = [];
    socket.addEventListener('message', (event) => this.handleMessage(JSON.parse(event.data)));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }

  handleMessage(message) {
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
      else entry.resolve(message.result);
      return;
    }
    const { method, params } = message;
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args || [])
        .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description || arg.type))
        .join(' ');
      if (params.type === 'error') this.consoleErrors.push({ type: 'console', text });
      else if (params.type === 'warning') this.consoleWarnings.push({ type: 'console', text });
    } else if (method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails || {};
      this.exceptions.push({
        text: details.exception?.description || details.text || 'exception',
        url: details.url,
        line: details.lineNumber,
      });
    } else if (method === 'Log.entryAdded') {
      const entry = params.entry || {};
      if (entry.level === 'error') this.consoleErrors.push({ type: entry.source, text: entry.text, url: entry.url });
      else if (entry.level === 'warning') this.consoleWarnings.push({ type: entry.source, text: entry.text, url: entry.url });
    } else if (method === 'Network.requestWillBeSent') {
      this.requests.push({ url: params.request?.url, method: params.request?.method });
    } else if (method === 'Network.responseReceived') {
      const status = params.response?.status ?? 0;
      if (status >= 400) this.httpErrors.push({ status, url: params.response?.url });
    }
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
  }

  async setViewport(width, height, { mobile = false } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await delay(1000);
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: true });
    await delay(1300);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(`evaluate failed: ${details.exception?.description || details.text}`);
    }
    return result.result?.value;
  }

  async waitFor(expression, { timeout = 15000, interval = 200, label = expression } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch {
        /* element not ready */
      }
      await delay(interval);
    }
    throw new Error(`waitFor timeout: ${label}`);
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  diagnostics() {
    return {
      consoleErrors: this.consoleErrors,
      consoleWarnings: this.consoleWarnings,
      exceptions: this.exceptions,
      httpErrors: this.httpErrors.filter((entry) => !/\/api\/auth\/me$/.test(entry.url || '')),
    };
  }
}

export async function connect({ port }) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) {
    const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    page = await created.json();
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('no page target with a debugger socket');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('page websocket failed')), { once: true });
  });

  const session = new Session(socket);
  await session.init();
  return { session, targetId: page.id, close: () => socket.close() };
}
