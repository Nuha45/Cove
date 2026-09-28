const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Product = require('../models/Product');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const imageStorage = require('../services/imageStorage');
const { signToken } = require('../services/tokenService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createdBusinessIds = [];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/cove\//;

let server;
let base;

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

async function registerTenant(label) {
  const email = `images-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password: 'ImagesTest123',
      businessName: `${label} Images ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOne({ email });
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: String(user.businessId) };
}

function publicIdOf(url) {
  return /\/image\/upload\/v\d+\/(.+)\.[a-z0-9]+$/.exec(url)[1];
}

describe('Cloudinary image storage', { timeout: 120000 }, () => {
  let seller;
  let other;

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    seller = await registerTenant('seller');
    other = await registerTenant('other');
  });

  after(async () => {
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

  it('uploads product images and stores the secure URL', async () => {
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Cloud Ring', price: 100, stockQuantity: 3, status: 'Active', images: [PNG] },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const [url] = created.data.product.images;
    assert.match(url, CLOUDINARY_URL);
    assert.ok(url.includes(`/cove/products/${seller.businessId}/`));

    const stored = await Product.findById(created.data.product.id).lean();
    assert.deepEqual(stored.images, [url]);
  });

  it('keeps, replaces, and removes product images without breaking the record', async () => {
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Swap Ring', price: 100, stockQuantity: 3, images: [PNG, PNG] },
    });
    const [first, second] = created.data.product.images;
    const productId = created.data.product.id;

    const replaced = await api('PATCH', `/api/products/${productId}`, {
      token: seller.token,
      body: { images: [first, PNG] },
    });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data));
    assert.equal(replaced.data.product.images[0], first);
    assert.notEqual(replaced.data.product.images[1], second);
    assert.ok(imageStorage.memory.deleted.includes(publicIdOf(second)));

    const cleared = await api('PATCH', `/api/products/${productId}`, {
      token: seller.token,
      body: { images: [] },
    });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
    assert.deepEqual(cleared.data.product.images, []);
    assert.ok(imageStorage.memory.deleted.includes(publicIdOf(first)));
  });

  it('keeps legacy /uploads paths on existing records', async () => {
    const legacy = `/uploads/products/${seller.businessId}/11111111-2222-4333-8444-555555555555.jpg`;
    const product = await Product.create({
      businessId: seller.businessId,
      name: 'Legacy Ring',
      price: 100,
      stockQuantity: 1,
      images: [legacy],
    });

    const updated = await api('PATCH', `/api/products/${product.id}`, {
      token: seller.token,
      body: { images: [legacy, PNG] },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.product.images[0], legacy);
    assert.match(updated.data.product.images[1], CLOUDINARY_URL);
  });

  it('rejects image URLs that Cove did not upload for this shop', async () => {
    const foreign = await api('POST', '/api/products', {
      token: other.token,
      body: { name: 'Other Ring', price: 100, stockQuantity: 1, images: [PNG] },
    });
    const otherUrl = foreign.data.product.images[0];

    for (const images of [[otherUrl], ['https://evil.example/ring.png'], ['https://res.cloudinary.com/someone-else/image/upload/v1/x.png']]) {
      const response = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Stolen Ring', price: 100, stockQuantity: 1, images },
      });
      assert.equal(response.status, 400, images[0]);
    }

    const logo = await api('PATCH', '/api/business/settings', {
      token: seller.token,
      body: { logo: 'https://evil.example/logo.png' },
    });
    assert.equal(logo.status, 400);
  });

  for (const { field, kind } of [
    { field: 'logo', kind: 'logos' },
    { field: 'storefrontCoverImage', kind: 'covers' },
    { field: 'paymentQrImage', kind: 'payment-qr' },
  ]) {
    it(`uploads, replaces, and clears the ${field}`, async () => {
      const first = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: PNG } });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      const firstUrl = first.data.business[field];
      assert.match(firstUrl, CLOUDINARY_URL);
      assert.ok(firstUrl.includes(`/cove/${kind}/${seller.businessId}/`));
      assert.equal((await Business.findById(seller.businessId).lean())[field], firstUrl);

      const kept = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: firstUrl } });
      assert.equal(kept.data.business[field], firstUrl);

      const second = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: PNG } });
      const secondUrl = second.data.business[field];
      assert.notEqual(secondUrl, firstUrl);
      assert.ok(imageStorage.memory.deleted.includes(publicIdOf(firstUrl)));

      const cleared = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: '' } });
      assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
      assert.equal(cleared.data.business[field], '');
      assert.ok(imageStorage.memory.deleted.includes(publicIdOf(secondUrl)));
    });
  }

  it('refuses uploads with a clear error when Cloudinary is not configured', async () => {
    const saved = { storage: env.imageStorage, cloudinary: { ...env.cloudinary } };
    env.imageStorage = 'cloudinary';
    env.cloudinary.cloudName = '';
    env.cloudinary.apiKey = '';
    env.cloudinary.apiSecret = '';
    const originalError = console.error;
    console.error = () => {};
    try {
      const before = (await Business.findById(seller.businessId).lean()).logo;
      const response = await api('PATCH', '/api/business/settings', { token: seller.token, body: { logo: PNG } });
      assert.equal(response.status, 503);
      assert.match(response.data.message, /not set up/i);
      assert.equal((await Business.findById(seller.businessId).lean()).logo, before);
    } finally {
      console.error = originalError;
      env.imageStorage = saved.storage;
      Object.assign(env.cloudinary, saved.cloudinary);
    }
  });
});
