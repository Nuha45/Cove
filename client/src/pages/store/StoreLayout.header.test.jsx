// @vitest-environment node
// jsdom has no layout engine, so this test measures the real header in headless Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoreLayout from './StoreLayout';

const LONG_NAME = 'Sri Lakshmi Venkateswara Handloom Saree Emporium';
const PHONE_WIDTHS = [375, 390, 412];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
const canRun = Boolean(chromePath) && typeof WebSocket === 'function';

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

function renderMarkup(element) {
  // React Router's Link warns about useLayoutEffect on the server; only static HTML is needed here.
  const originalError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    originalError(...args);
  };
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = originalError;
  }
}

function storePage(business) {
  const markup = renderMarkup(
    <MemoryRouter initialEntries={['/store/test-shop']}>
      <Routes>
        <Route path="/store/:slug" element={<StoreLayout business={business} />} />
      </Routes>
    </MemoryRouter>
  );
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<style>${css}</style></head><body>${markup}</body></html>`;
}

const MEASURE = `(() => {
  const width = document.documentElement.clientWidth;
  const name = document.querySelector('.store-brand strong');
  const nameBox = name.getBoundingClientRect();
  const cartBox = document.querySelector('.store-cart-link').getBoundingClientRect();
  return {
    width,
    overflowX: document.documentElement.scrollWidth - width,
    nameRight: nameBox.right,
    cartLeft: cartBox.left,
    cartRight: cartBox.right,
    truncated: name.scrollWidth > name.clientWidth,
  };
})()`;

describe.skipIf(!canRun)('storefront header at phone widths (headless Chrome)', () => {
  let browser;
  let profileDir;
  let socket;
  let sessionId;
  let nextId = 0;
  const pending = new Map();

  function send(method, params = {}, session) {
    nextId += 1;
    const id = nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      socket.send(JSON.stringify({ id, method, params, sessionId: session }));
    });
  }

  async function measure(business, width) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);
    const html = JSON.stringify(storePage(business));
    await send('Runtime.evaluate', { expression: `document.open(); document.write(${html}); document.close();` }, sessionId);
    const { result } = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true }, sessionId);
    return result.value;
  }

  beforeAll(async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'cove-header-'));
    browser = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore' });

    const portFile = join(profileDir, 'DevToolsActivePort');
    for (let attempt = 0; attempt < 150 && !existsSync(portFile); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    };

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  }, 30000);

  afterAll(async () => {
    socket?.close();
    browser?.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (profileDir) rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  for (const theme of ['warm', 'bold']) {
    for (const width of PHONE_WIDTHS) {
      it(`truncates a long shop name before the Cart button at ${width}px (${theme} theme)`, async () => {
        const layout = await measure({ name: LONG_NAME, city: 'Chennai', storefrontTheme: theme }, width);

        expect(layout.width).toBe(width);
        expect(layout.overflowX).toBe(0);
        expect(layout.truncated).toBe(true);
        expect(layout.nameRight).toBeLessThanOrEqual(layout.cartLeft);
        expect(layout.cartRight).toBeLessThanOrEqual(width);
      }, 15000);
    }
  }

  it('shows a short shop name in full', async () => {
    const layout = await measure({ name: 'Asha Bakes', city: 'Pune' }, 375);

    expect(layout.overflowX).toBe(0);
    expect(layout.truncated).toBe(false);
    expect(layout.nameRight).toBeLessThanOrEqual(layout.cartLeft);
  }, 15000);
});
