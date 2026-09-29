const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

describe('client storefront appearance helpers', () => {
  let appearance;

  before(async () => {
    const fileUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'storefrontAppearance.js')
    ).href;
    appearance = await import(fileUrl);
  });

  it('builds object-position from focus fields', () => {
    assert.equal(
      appearance.coverObjectPosition({ coverFocusX: 15, coverFocusY: 80 }),
      '15% 80%'
    );
    assert.equal(appearance.coverObjectPosition({}), '50% 50%');
  });

  it('reads focus from business or nested appearance', () => {
    const fromFlat = appearance.appearanceFromBusiness({
      storefrontTheme: 'warm',
      storefrontAccent: '#FF7A3D',
      storefrontCoverImage: '/uploads/covers/x/y.jpg',
      storefrontCoverFocusX: 10,
      storefrontCoverFocusY: 90,
    });
    assert.equal(fromFlat.coverFocusX, 10);
    assert.equal(fromFlat.coverFocusY, 90);

    const fromNested = appearance.appearanceFromBusiness({
      appearance: {
        theme: 'editorial',
        accent: '#b6504a',
        coverImage: '/uploads/covers/x/z.jpg',
        coverFocusX: 25,
        coverFocusY: 40,
      },
    });
    assert.equal(fromNested.coverFocusX, 25);
    assert.equal(fromNested.coverFocusY, 40);
  });

  it('keeps the three Basic themes and six accents, and adds Modern and Bold as Plus', () => {
    const basicThemes = appearance.STOREFRONT_THEMES.filter((item) => !item.plus).map((item) => item.id);
    const plusThemes = appearance.STOREFRONT_THEMES.filter((item) => item.plus).map((item) => item.id);
    assert.deepEqual(basicThemes, ['warm', 'minimal', 'editorial']);
    assert.deepEqual(plusThemes, ['modern', 'bold']);
    assert.equal(appearance.STOREFRONT_ACCENTS.length, 6);
  });

  it('matches the server color presets exactly', async () => {
    // eslint-disable-next-line global-require
    const server = require('../utils/storefrontAppearance');
    const values = (list) => list.map((item) => item.value);
    assert.deepEqual(values(appearance.STOREFRONT_ACCENTS), values(server.STOREFRONT_ACCENTS));
    assert.deepEqual(values(appearance.PLUS_STOREFRONT_ACCENTS), values(server.PLUS_STOREFRONT_ACCENTS));
    assert.deepEqual(values(appearance.STOREFRONT_BACKGROUNDS), values(server.STOREFRONT_BACKGROUNDS));
    assert.deepEqual(appearance.STOREFRONT_THEMES.map((item) => item.id), server.STOREFRONT_THEMES);
  });

  it('normalizes Plus values and drops anything unknown', () => {
    const plus = appearance.normalizeAppearance({ theme: 'bold', accent: '#1f2937', background: '#edf2ec' });
    assert.equal(plus.theme, 'bold');
    assert.equal(plus.accent, '#1F2937');
    assert.equal(plus.background, '#EDF2EC');
    const junk = appearance.normalizeAppearance({ theme: 'neon', accent: 'red', background: 'url(x)' });
    assert.equal(junk.theme, 'warm');
    assert.equal(junk.accent, '#FF7A3D');
    assert.equal(junk.background, '');
  });

  it('previews a Basic-safe look when Cove Plus is not active', () => {
    const saved = { theme: 'modern', accent: '#1F2937', background: '#EDF2EC' };
    assert.deepEqual(appearance.effectiveAppearance(saved, true), saved);
    const basic = appearance.effectiveAppearance(saved, false);
    assert.equal(basic.theme, 'warm');
    assert.equal(basic.accent, '#FF7A3D');
    assert.equal(basic.background, '');
    const basicChoice = appearance.effectiveAppearance({ theme: 'editorial', accent: '#3F6F5B', background: '' }, false);
    assert.equal(basicChoice.theme, 'editorial');
    assert.equal(basicChoice.accent, '#3F6F5B');
    assert.equal(appearance.hasPlusAppearance(saved), true);
    assert.equal(appearance.hasPlusAppearance(basicChoice), false);
  });

  it('builds the same storefront root props for desktop and mobile previews', () => {
    const props = appearance.storeThemeProps({ theme: 'bold', accent: '#1F2937', background: '#EDF2EC' });
    assert.equal(props['data-theme'], 'bold');
    assert.equal(props['data-bg'], 'custom');
    assert.equal(props.style['--store-accent'], '#1F2937');
    assert.equal(props.style['--store-bg'], '#EDF2EC');
    const plain = appearance.storeThemeProps({ theme: 'warm', accent: '#FF7A3D', background: '' });
    assert.equal(plain['data-bg'], undefined);
    assert.equal(plain.style['--store-bg'], undefined);
  });
});
