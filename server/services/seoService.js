const Business = require('../models/Business');
const Product = require('../models/Product');
const billingService = require('./billingService');

// sitemaps.org limit per file.
const MAX_URLS = 50000;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function buildSitemapXml(siteUrl, entries) {
  const origin = String(siteUrl).replace(/\/+$/, '');
  const urls = entries.slice(0, MAX_URLS).map((entry) => {
    const lastmod = isoDate(entry.lastmod);
    return [
      '  <url>',
      `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      '  </url>',
    ].filter(Boolean).join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

// Only public, indexable pages: the Cove homepage, legal pages, live storefront homes and their active product pages.
// Shops closed by the seller or paused for billing are left out.
async function sitemapEntries() {
  const sitePages = ['/', '/terms', '/privacy', '/refund-policy'].map((path) => ({ path }));
  const candidates = await Business.find({ storefrontActive: { $ne: false }, archivedAt: null })
    .select('slug updatedAt')
    .sort({ createdAt: 1 })
    .limit(MAX_URLS)
    .lean();
  const paused = await billingService.pausedBusinessIds(candidates.map((item) => item._id));
  const businesses = candidates.filter((item) => !paused.has(String(item._id)));
  if (!businesses.length) return sitePages;

  const slugById = new Map(businesses.map((item) => [String(item._id), item.slug]));
  const products = await Product.find({
    businessId: { $in: businesses.map((item) => item._id) },
    status: 'Active',
  })
    .select('businessId updatedAt')
    .sort({ createdAt: 1 })
    .limit(MAX_URLS)
    .lean();

  const entries = [...sitePages, ...businesses.map((item) => ({
    path: `/store/${encodeURIComponent(item.slug)}`,
    lastmod: item.updatedAt,
  }))];
  products.forEach((item) => {
    const slug = slugById.get(String(item.businessId));
    if (!slug) return;
    entries.push({
      path: `/store/${encodeURIComponent(slug)}/product/${item._id}`,
      lastmod: item.updatedAt,
    });
  });
  return entries.slice(0, MAX_URLS);
}

module.exports = { buildSitemapXml, sitemapEntries, escapeXml, MAX_URLS };
