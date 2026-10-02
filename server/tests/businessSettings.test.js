const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const OrderCounter = require('../models/OrderCounter');
const Business = require('../models/Business');
const { signToken } = require('../services/tokenService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'SettingsTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase7-${label}-${stamp}@example.com`;
}

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data };
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    slug: business.slug,
  };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

describe('businessSettings', { timeout: 180000 }, () => {
  let owner;
  let other;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await CustomerWant.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Order.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Product.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Customer.deleteMany({ businessId: { $in: createdBusinessIds } });
      await OrderCounter.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('lets an authenticated seller read and update their own settings', async () => {
    const unauthGet = await api('GET', '/api/business/settings');
    assert.equal(unauthGet.status, 401);

    const unauthPatch = await api('PATCH', '/api/business/settings', {
      body: { name: 'Hacked' },
    });
    assert.equal(unauthPatch.status, 401);

    const settings = await api('GET', '/api/business/settings', { token: owner.token });
    assert.equal(settings.status, 200, JSON.stringify(settings.data));
    assert.equal(settings.data.business.slug, owner.slug);
    assert.equal(settings.data.business.currency, 'INR');
    assert.equal(settings.data.business.pickupEnabled, true);
    assert.equal(settings.data.business.deliveryEnabled, true);
    assert.equal(settings.data.business.deliveryFee, 0);
    assert.equal(settings.data.business.storefrontActive, true);
    assert.equal(settings.data.business.ownerId, undefined);

    const updated = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        name: 'Aisha Jewelry Co',
        description: 'Handmade jewelry',
        phone: '9876500001',
        email: 'shop@example.com',
        currency: 'INR',
        pickupEnabled: true,
        deliveryEnabled: true,
        deliveryFee: 40,
        storefrontActive: true,
        businessId: String(other.businessId),
      },
      headers: { 'x-business-id': String(other.businessId) },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.business.name, 'Aisha Jewelry Co');
    assert.equal(updated.data.business.deliveryFee, 40);
    assert.equal(updated.data.business.id, String(owner.businessId));

    const otherSettings = await api('GET', '/api/business/settings', { token: other.token });
    assert.equal(otherSettings.data.business.name.includes('other'), true);
    assert.notEqual(otherSettings.data.business.deliveryFee, 40);
  });

  it('rejects invalid settings and duplicate slugs', async () => {
    const badSlug = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { slug: 'Bad Slug!!' },
    });
    assert.equal(badSlug.status, 400);

    const taken = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { slug: other.slug },
    });
    assert.equal(taken.status, 409, JSON.stringify(taken.data));

    const negativeFee = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { deliveryFee: -5 },
    });
    assert.equal(negativeFee.status, 400);

    const badCurrency = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { currency: 'XYZ' },
    });
    assert.equal(badCurrency.status, 400);

    const emptyName = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { name: '' },
    });
    assert.equal(emptyName.status, 400);

    const nextSlug = `aisha-settings-${stamp.slice(-6)}`;
    const slugOk = await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { slug: nextSlug },
    });
    assert.equal(slugOk.status, 200, JSON.stringify(slugOk.data));
    assert.equal(slugOk.data.business.slug, nextSlug);
    owner.slug = nextSlug;

    const store = await api('GET', `/api/store/${nextSlug}`);
    assert.equal(store.status, 200);
    assert.equal(store.data.business.slug, nextSlug);
    assert.equal(store.data.business.deliveryFee, 40);
    assert.equal(JSON.stringify(store.data).includes(String(owner.businessId)), false);
    assert.equal(store.data.business.ownerId, undefined);
  });

  it('applies storefront ordering rules from business settings', async () => {
    const product = await addProduct(owner.token, {
      name: 'Pearl Studs',
      price: 100,
      stockQuantity: 5,
    });

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: {
        deliveryFee: 40,
        pickupEnabled: true,
        deliveryEnabled: true,
        storefrontActive: true,
      },
    });

    const delivery = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Aisha', phone: '9876511111' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Delivery',
        deliveryAddress: '12 Palm Street',
        deliveryFee: 0,
        total: 1,
        businessId: String(other.businessId),
      },
    });
    assert.equal(delivery.status, 201, JSON.stringify(delivery.data));
    assert.equal(delivery.data.order.deliveryFee, 40);
    assert.equal(delivery.data.order.total, 140);
    assert.equal(delivery.data.order.deliveryMethod, 'Delivery');

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { pickupEnabled: false, deliveryEnabled: true },
    });

    const blockedPickup = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Guest', phone: '9876511112' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(blockedPickup.status, 400);

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { pickupEnabled: true, deliveryEnabled: false },
    });

    const blockedDelivery = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Guest', phone: '9876511113' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Delivery',
        deliveryAddress: '12 Palm Street',
      },
    });
    assert.equal(blockedDelivery.status, 400);

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { pickupEnabled: false, deliveryEnabled: false },
    });

    const bothDisabled = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Guest', phone: '9876511114' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(bothDisabled.status, 403);

    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { pickupEnabled: true, deliveryEnabled: true, storefrontActive: false },
    });

    const inactiveStore = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(inactiveStore.status, 200);
    assert.equal(inactiveStore.data.business.storefrontActive, false);
    assert.equal(inactiveStore.data.products.length, 0);

    const inactiveOrder = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Guest', phone: '9876511115' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(inactiveOrder.status, 403);

    // Restore so later cleanup and browsing stay healthy.
    await api('PATCH', '/api/business/settings', {
      token: owner.token,
      body: { storefrontActive: true, pickupEnabled: true, deliveryEnabled: true },
    });
  });

  it('keeps stored product prices unchanged when the store currency changes', async () => {
    const product = await addProduct(other.token, { name: 'Gold Hoops', price: 1250.5, stockQuantity: 3 });
    assert.equal(product.price, 1250.5);

    for (const currency of ['AED', 'USD', 'GBP', 'EUR', 'INR']) {
      const switched = await api('PATCH', '/api/business/settings', { token: other.token, body: { currency } });
      assert.equal(switched.status, 200, JSON.stringify(switched.data));
      assert.equal(switched.data.business.currency, currency);

      const stored = await Product.findById(product.id).lean();
      assert.equal(stored.price, 1250.5);

      const store = await api('GET', `/api/store/${other.slug}`);
      assert.equal(store.status, 200);
      assert.equal(store.data.business.currency, currency);
      assert.equal(store.data.products.find((item) => item.id === product.id).price, 1250.5);
    }
  });
});
