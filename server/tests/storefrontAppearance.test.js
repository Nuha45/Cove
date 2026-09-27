const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCoverFocus,
  publicAppearance,
  DEFAULT_COVER_FOCUS,
} = require('../utils/storefrontAppearance');

describe('storefront cover focus helpers', () => {
  it('clamps and rounds focus values to 0–100', () => {
    assert.equal(normalizeCoverFocus(50), 50);
    assert.equal(normalizeCoverFocus(-10), 0);
    assert.equal(normalizeCoverFocus(140), 100);
    assert.equal(normalizeCoverFocus('37.6'), 38);
    assert.equal(normalizeCoverFocus(undefined), DEFAULT_COVER_FOCUS);
    assert.equal(normalizeCoverFocus('nope'), DEFAULT_COVER_FOCUS);
  });

  it('includes cover focus in public appearance', () => {
    const appearance = publicAppearance({
      storefrontTheme: 'warm',
      storefrontAccent: '#FF7A3D',
      storefrontCoverImage: '/uploads/covers/abc/banner.jpg',
      storefrontCoverFocusX: 20,
      storefrontCoverFocusY: 70,
    });
    assert.equal(appearance.coverImage, '/uploads/covers/abc/banner.jpg');
    assert.equal(appearance.coverFocusX, 20);
    assert.equal(appearance.coverFocusY, 70);
  });

  it('defaults missing focus to center', () => {
    const appearance = publicAppearance({
      storefrontTheme: 'minimal',
      storefrontAccent: '#3F6F5B',
      storefrontCoverImage: '',
    });
    assert.equal(appearance.coverFocusX, 50);
    assert.equal(appearance.coverFocusY, 50);
  });
});
