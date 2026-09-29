const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Product = require('../models/Product');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { setAuthCookie } = require('../services/tokenService');
const { buildSitemapXml } = require('../services/seoService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const uploadName = `deploy-check-${stamp}.txt`;
const uploadPath = path.join(__dirname, '..', 'uploads', uploadName);
const createdBusinessIds = [];
const originalSiteUrl = env.publicSiteUrl;

let server;
let base;

async function request(method, urlPath, { token, body } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

describe('deployment readiness', { timeout: 120000 }, () => {
  let seller;

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
    fs.writeFileSync(uploadPath, 'ok');

    const email = `deploy-${stamp}@example.com`;
    const registered = await request('POST', '/api/auth/register', {
      body: {
        name: 'Deploy Owner',
        email,
        password: 'DeployTest123',
        businessName: `Deploy Shop ${stamp.slice(-6)}`,
        category: 'Jewelry & Accessories',
      },
    });
    assert.equal(registered.status, 201, registered.text);
    const user = await User.findOne({ email });
    const business = await Business.findById(user.businessId);
    createdBusinessIds.push(user.businessId);
    seller = { businessId: business._id, slug: business.slug };
  });

  after(async () => {
    env.publicSiteUrl = originalSiteUrl;
    fs.rmSync(uploadPath, { force: true });
    if (createdBusinessIds.length) {
      const filter = { businessId: { $in: createdBusinessIds } };
      await Product.deleteMany(filter);
      await Notification.deleteMany(filter);
      await Subscription.deleteMany(filter);
      await User.deleteMany(filter);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('reports healthy when the database is connected', async () => {
    const response = await request('GET', '/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), { status: 'ok', database: 'connected' });
  });

  it('lets another origin embed uploaded images', async () => {
    const response = await request('GET', `/uploads/${uploadName}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  });

  it('keeps same-origin resource policy on API responses', async () => {
    const response = await request('GET', '/api/health');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  });

  it('marks the auth cookie secure whenever SameSite=None', () => {
    const originalSameSite = env.cookieSameSite;
    let captured;
    const res = { cookie: (name, value, options) => { captured = options; } };
    try {
      env.cookieSameSite = 'none';
      setAuthCookie(res, 'token');
      assert.equal(captured.httpOnly, true);
      assert.equal(captured.sameSite, 'none');
      assert.equal(captured.secure, true);
    } finally {
      env.cookieSameSite = originalSameSite;
    }
  });

  it('escapes sitemap URLs and includes lastmod', () => {
    const xml = buildSitemapXml('https://shop.test/', [
      { path: '/store/a&b', lastmod: '2026-01-02T03:04:05.000Z' },
      { path: '/store/plain', lastmod: 'not a date' },
    ]);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<loc>https:\/\/shop\.test\/store\/a&amp;b<\/loc>/);
    assert.match(xml, /<lastmod>2026-01-02T03:04:05.000Z<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/shop\.test\/store\/plain<\/loc>\n {2}<\/url>/);
  });

  it('returns 404 for the sitemap until PUBLIC_SITE_URL is set', async () => {
    env.publicSiteUrl = '';
    const response = await request('GET', '/api/seo/sitemap.xml');
    assert.equal(response.status, 404);
  });

  it('lists live storefronts and active products only', async () => {
    const product = await Product.create({
      businessId: seller.businessId,
      name: 'Sitemap Ring',
      price: 100,
      stockQuantity: 5,
      status: 'Active',
    });
    const archived = await Product.create({
      businessId: seller.businessId,
      name: 'Hidden Ring',
      price: 100,
      stockQuantity: 5,
      status: 'Archived',
    });

    env.publicSiteUrl = 'https://shop.test';
    const live = await request('GET', '/api/seo/sitemap.xml');
    assert.equal(live.status, 200);
    assert.match(live.headers.get('content-type'), /application\/xml/);
    assert.ok(live.text.includes('<loc>https://shop.test/</loc>'));
    for (const page of ['/terms', '/privacy', '/refund-policy']) {
      assert.ok(live.text.includes(`<loc>https://shop.test${page}</loc>`), page);
    }
    assert.ok(live.text.includes(`<loc>https://shop.test/store/${seller.slug}</loc>`));
    assert.ok(live.text.includes(`/store/${seller.slug}/product/${product._id}</loc>`));
    assert.ok(!live.text.includes(String(archived._id)));

    await Business.updateOne({ _id: seller.businessId }, { $set: { storefrontActive: false } });
    const paused = await request('GET', '/api/seo/sitemap.xml');
    assert.equal(paused.status, 200);
    assert.ok(!paused.text.includes(`/store/${seller.slug}<`));
    assert.ok(!paused.text.includes(String(product._id)));
  });
});

describe('client SEO helpers', () => {
  let seo;
  let robots;

  before(async () => {
    const utils = path.join(__dirname, '..', '..', 'client', 'src', 'utils');
    seo = await import(pathToFileURL(path.join(utils, 'seo.js')).href);
    robots = await import(pathToFileURL(path.join(utils, 'robots.js')).href);
  });

  it('only indexes the homepage, legal, storefront and product pages', () => {
    assert.equal(seo.isIndexablePath('/'), true);
    for (const page of ['/terms', '/privacy', '/refund-policy']) {
      assert.equal(seo.isIndexablePath(page), true, page);
    }
    assert.equal(seo.isIndexablePath('/store/nuha'), true);
    assert.equal(seo.isIndexablePath('/store/nuha/product/abc123'), true);
    for (const pathname of [
      '/store/nuha/cart',
      '/store/nuha/checkout',
      '/store/nuha/order/CV-1',
      '/store/nuha/want',
      '/store/nuha/want-board',
      '/dashboard',
      '/admin',
      '/login',
      '/register',
      '/billing',
      '/marketing',
    ]) {
      assert.equal(seo.isIndexablePath(pathname), false, pathname);
    }
  });

  it('never uses local origins for canonical URLs in production builds', () => {
    assert.equal(seo.normalizeSiteOrigin('http://localhost:5173', { production: true }), '');
    assert.equal(seo.normalizeSiteOrigin('http://localhost:5173'), 'http://localhost:5173');
    assert.equal(seo.normalizeSiteOrigin('https://shop.test/path/'), 'https://shop.test');
    assert.equal(seo.normalizeSiteOrigin('not a url'), '');
    assert.equal(seo.absoluteUrl('/store/nuha', ''), '');
  });

  it('builds product structured data from real fields only', () => {
    const data = seo.productJsonLd(
      { name: 'Ring', description: '', price: 1200, category: 'Rings', available: false },
      { name: 'Nuha', currency: 'INR' },
      { url: '', images: [] }
    );
    assert.equal(data['@type'], 'Product');
    assert.equal(data.offers.price, '1200.00');
    assert.equal(data.offers.priceCurrency, 'INR');
    assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
    assert.equal('description' in data, false);
    assert.equal('image' in data, false);
    assert.equal('url' in data.offers, false);
    assert.equal('aggregateRating' in data, false);
  });

  it('builds store structured data without empty fields', () => {
    const data = seo.storeJsonLd({ name: 'Nuha', city: 'Kochi', currency: 'INR', phone: '' });
    assert.equal(data['@type'], 'Store');
    assert.deepEqual(data.address, { '@type': 'PostalAddress', addressLocality: 'Kochi' });
    assert.equal('telephone' in data, false);
  });

  it('escapes structured data for inline script tags', () => {
    assert.equal(seo.serializeJsonLd({ name: '</script>' }).includes('</script>'), false);
  });

  it('truncates descriptions on a word boundary', () => {
    const text = seo.truncate('word '.repeat(60), 50);
    assert.ok(text.length <= 50);
    assert.ok(text.endsWith('…'));
  });

  it('blocks private areas in robots.txt and only adds a real sitemap URL', () => {
    const plain = robots.buildRobotsTxt();
    assert.match(plain, /Disallow: \/dashboard/);
    assert.match(plain, /Disallow: \/admin/);
    assert.match(plain, /Disallow: \/api\//);
    assert.match(plain, /Allow: \/store\//);
    assert.match(plain, /Allow: \/api\/seo\/sitemap\.xml/);
    assert.equal(plain.includes('Sitemap:'), false);
    assert.equal(plain.includes('/store/'.concat('cart')), false);

    assert.equal(robots.buildRobotsTxt({ sitemapUrl: 'http://localhost:5000/api/seo/sitemap.xml' }).includes('Sitemap:'), false);
    assert.match(
      robots.buildRobotsTxt({ sitemapUrl: 'https://api.shop.test/api/seo/sitemap.xml' }),
      /Sitemap: https:\/\/api\.shop\.test\/api\/seo\/sitemap\.xml/
    );
  });
});
