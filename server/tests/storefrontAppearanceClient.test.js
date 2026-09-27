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
});
