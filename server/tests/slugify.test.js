const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('../utils/slugify');

const STORE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('slugify', () => {
  it('never ends a shop link with a hyphen when a long name is cut', () => {
    const slug = slugify('Sri Lakshmi Venkateswara Handloom Saree Emporium');
    assert.equal(slug, 'sri-lakshmi-venkateswara-handloom-saree');
    assert.match(slug, STORE_SLUG);
    assert.match(`${slug}-2`, STORE_SLUG);
  });

  it('produces links the storefront accepts', () => {
    for (const name of ['Asha’s Crafts & Co.', '  --Clay Studio--  ', 'A'.repeat(39) + ' B', 'दुकान']) {
      assert.match(slugify(name), STORE_SLUG, name);
    }
  });
});
