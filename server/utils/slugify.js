const Business = require('../models/Business');

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug || 'shop';
}

async function uniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (await Business.exists({ slug })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

module.exports = { slugify, uniqueSlug };
