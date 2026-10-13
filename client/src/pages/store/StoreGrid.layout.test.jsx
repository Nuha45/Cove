// @vitest-environment node
// jsdom has no layout engine, so this test measures the real product grid in headless Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StoreProductCard } from '../../components/storefront/StoreSections';
import { STOREFRONT_THEMES, storeThemeProps, normalizeAppearance } from '../../utils/storefrontAppearance';

// 360 is the CSS width of most Android phones (Honor, Vivo, Samsung); 320 covers small phones and
// Android's larger "display size" setting. iPhones are 375-430.
const PHONE_WIDTHS = [320, 360, 375, 390, 430];

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

// A tall photo: the card must still show it as a square.
const TALL_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect width="300" height="900" fill="#c96"/></svg>',
)}`;

const PRODUCTS = [
  { id: 'p1', name: 'Handwoven Kanchipuram Silk Saree with Zari Border', category: 'Sarees', price: 12499, images: [TALL_IMAGE], available: true, stockAvailability: 'In stock' },
  { id: 'p2', name: 'Ring', category: '', price: 450, images: [], available: false, stockAvailability: 'Out of stock' },
  { id: 'p3', name: 'Terracotta Jhumka Earrings', category: 'Jewellery', price: 899, images: [TALL_IMAGE], available: true, stockAvailability: 'Only 2 left' },
  { id: 'p4', name: 'Candle', category: 'Home', price: 299, images: [], available: true, stockAvailability: 'In stock' },
];

function storeGridPage(theme) {
  const appearance = normalizeAppearance({ theme });
  const { style, ...attrs } = storeThemeProps(appearance);
  const cards = renderToStaticMarkup(
    <MemoryRouter>
      {PRODUCTS.map((product) => (
        <StoreProductCard key={product.id} product={product} currency="INR" to={`/store/shop/product/${product.id}`} />
      ))}
    </MemoryRouter>,
  );
  const attrText = Object.entries(attrs).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}="${value}"`).join(' ');
  const styleText = Object.entries(style).map(([key, value]) => `${key}:${value}`).join(';');
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<style>${css}</style></head><body><div class="public-store" ${attrText} style="${styleText}">`
    + `<main class="store-main"><section class="store-catalog"><div class="store-grid">${cards}</div></section></main>`
    + '</div></body></html>';
}

const MEASURE = `(() => {
  const width = document.documentElement.clientWidth;
  const cards = [...document.querySelectorAll('.store-product-card')].map((card) => {
    const box = card.getBoundingClientRect();
    const media = card.querySelector('img, .store-thumb-fallback').getBoundingClientRect();
    return { left: Math.round(box.left), right: box.right, width: box.width, mediaWidth: media.width, mediaHeight: media.height };
  });
  return {
    width,
    overflowX: document.documentElement.scrollWidth - width,
    columns: new Set(cards.map((card) => card.left)).size,
    cards,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  };
})()`;

describe('forced dark mode opt-out', () => {
  it('declares a light-only color scheme in the page head, before any CSS loads', () => {
    const indexHtml = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
    expect(indexHtml).toMatch(/<meta name="color-scheme" content="only light"\s*\/?>/);
  });
});

describe.skipIf(!canRun)('storefront product grid at phone and desktop widths (headless Chrome)', () => {
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

  async function measure(theme, width, mobile = true) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: mobile ? 3 : 1, mobile }, sessionId);
    const html = JSON.stringify(storeGridPage(theme));
    await send('Runtime.evaluate', { expression: `document.open(); document.write(${html}); document.close();` }, sessionId);
    const { result } = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true }, sessionId);
    return result.value;
  }

  beforeAll(async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'cove-grid-'));
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

  for (const { id: theme } of STOREFRONT_THEMES) {
    for (const width of PHONE_WIDTHS) {
      it(`shows two square-image columns without sideways scrolling at ${width}px (${theme} theme)`, async () => {
        const layout = await measure(theme, width);

        expect(layout.width).toBe(width);
        expect(layout.overflowX).toBe(0);
        expect(layout.columns).toBe(2);
        for (const card of layout.cards) {
          expect(card.right).toBeLessThanOrEqual(width);
          expect(card.width).toBeLessThan(width / 2);
          expect(Math.abs(card.mediaHeight - card.mediaWidth)).toBeLessThanOrEqual(1);
        }
      }, 15000);
    }
  }

  it('keeps several fixed-width columns on desktop', async () => {
    const layout = await measure('warm', 1280, false);

    expect(layout.overflowX).toBe(0);
    expect(layout.columns).toBe(4);
    for (const card of layout.cards) {
      expect(card.width).toBeLessThanOrEqual(180);
      expect(Math.abs(card.mediaHeight - card.mediaWidth)).toBeLessThanOrEqual(1);
    }
  }, 15000);

  it('opts the page out of browser-forced dark mode', async () => {
    const layout = await measure('warm', 360);
    expect(layout.colorScheme.split(/\s+/).sort()).toEqual(['light', 'only']);
  }, 15000);
});
