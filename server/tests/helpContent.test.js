const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

describe('help content', () => {
  it('loads short seller-facing help categories', async () => {
    const fileUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'client', 'src', 'content', 'helpArticles.js')
    ).href;
    const { HELP_CATEGORIES } = await import(fileUrl);
    assert.ok(Array.isArray(HELP_CATEGORIES));
    assert.ok(HELP_CATEGORIES.length >= 5);
    for (const category of HELP_CATEGORIES) {
      assert.ok(category.title);
      assert.ok(category.articles.length >= 1);
      for (const article of category.articles) {
        assert.ok(article.title);
        assert.ok(article.body.length > 40);
        assert.ok(article.body.length < 500);
      }
    }
  });
});
