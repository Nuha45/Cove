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
const password = 'WantTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase6-${label}-${stamp}@example.com`;
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

describe('customerWants', { timeout: 180000 }, () => {
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

  it('accepts public requests and matches existing customers by phone', async () => {
    const product = await addProduct(owner.token, {
      name: 'Pearl Necklace',
      price: 350,
      stockQuantity: 3,
    });

    const order = await api('POST', `/api/store/${owner.slug}/orders`, {
      body: {
        customer: { name: 'Aisha Shah', phone: '9876543210', email: 'aisha@example.com' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryMethod: 'Pickup',
      },
    });
    assert.equal(order.status, 201, JSON.stringify(order.data));

    const customers = await api('GET', '/api/customers?search=9876543210', { token: owner.token });
    assert.equal(customers.data.total, 1);
    const aishaId = customers.data.customers[0].id;

    const created = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: {
        name: 'Aisha',
        phone: '+91 98765 43210',
        email: 'aisha.want@example.com',
        request: 'I want a silver version of the Pearl Necklace.',
        quantity: 2,
        notes: 'For a wedding',
        businessId: String(other.businessId),
        customerId: String(other.businessId),
        status: 'Fulfilled',
        sellerNotes: 'Should never save',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.match(created.data.message, /request received/i);
    assert.equal(created.data.id, undefined);
    assert.equal(created.data.businessId, undefined);
    assert.equal(created.data.customerId, undefined);
    assert.equal(JSON.stringify(created.data).includes('Should never save'), false);

    const listed = await api('GET', '/api/customer-wants', { token: owner.token });
    assert.equal(listed.status, 200);
    assert.equal(listed.data.total >= 1, true);
    const want = listed.data.wants.find((item) => item.request.includes('silver version'));
    assert.ok(want);
    assert.equal(want.customerId, aishaId);
    assert.equal(want.status, 'New');
    assert.equal(want.quantity, 2);
    assert.equal(want.sellerNotes, '');

    const otherWant = await api('POST', `/api/store/${other.slug}/wants`, {
      body: {
        name: 'Other Aisha',
        phone: '9876543210',
        request: 'Different shop request',
      },
    });
    assert.equal(otherWant.status, 201);
    const otherList = await api('GET', '/api/customer-wants', { token: other.token });
    const matchedOther = otherList.data.wants.find((item) => item.request === 'Different shop request');
    assert.ok(matchedOther);
    assert.equal(matchedOther.customerId, null);

    const updated = await api('PATCH', `/api/customer-wants/${want.id}`, {
      token: owner.token,
      body: {
        status: 'In Progress',
        sellerNotes: 'Check silver stock',
        businessId: String(other.businessId),
        customerId: String(other.businessId),
      },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.want.status, 'In Progress');
    assert.equal(updated.data.want.sellerNotes, 'Check silver stock');

    const store = await api('GET', `/api/store/${owner.slug}`);
    assert.equal(JSON.stringify(store.data).includes('Check silver stock'), false);
    assert.equal(JSON.stringify(store.data).includes('silver version'), false);

    const fulfilled = await api('PATCH', `/api/customer-wants/${want.id}`, {
      token: owner.token,
      body: { status: 'Fulfilled' },
    });
    assert.equal(fulfilled.status, 200);
    assert.equal(fulfilled.data.want.status, 'Fulfilled');
  });

  it('validates public submissions and isolates seller access', async () => {
    const missingSlug = await api('POST', '/api/store/no-such-shop-zzzz/wants', {
      body: { name: 'Aisha', phone: '9000011111', request: 'Anything' },
    });
    assert.equal(missingSlug.status, 404);

    const noName = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: { phone: '9000011111', request: 'Need gold' },
    });
    assert.equal(noName.status, 400);

    const noPhone = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: { name: 'Aisha', request: 'Need gold' },
    });
    assert.equal(noPhone.status, 400);

    const noRequest = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: { name: 'Aisha', phone: '9000011111' },
    });
    assert.equal(noRequest.status, 400);

    const badEmail = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: { name: 'Aisha', phone: '9000011111', request: 'Need gold', email: 'not-an-email' },
    });
    assert.equal(badEmail.status, 400);

    const badQty = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: { name: 'Aisha', phone: '9000011111', request: 'Need gold', quantity: 0 },
    });
    assert.equal(badQty.status, 400);

    const created = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: {
        name: 'Private Guest',
        phone: '9000022222',
        request: 'Need crochet flowers',
      },
    });
    assert.equal(created.status, 201);

    const ownerList = await api('GET', `/api/customer-wants?businessId=${other.businessId}`, {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
    });
    assert.equal(ownerList.status, 200);
    const owned = ownerList.data.wants.find((item) => item.request === 'Need crochet flowers');
    assert.ok(owned);

    const otherList = await api('GET', '/api/customer-wants', { token: other.token });
    assert.equal(otherList.data.wants.some((item) => item.id === owned.id), false);

    const crossGet = await api('GET', `/api/customer-wants/${owned.id}`, { token: other.token });
    assert.equal(crossGet.status, 404);

    const crossPatch = await api('PATCH', `/api/customer-wants/${owned.id}`, {
      token: other.token,
      body: { status: 'Closed', businessId: String(owner.businessId) },
    });
    assert.equal(crossPatch.status, 404);

    const unauth = await Promise.all([
      api('GET', '/api/customer-wants'),
      api('GET', `/api/customer-wants/${owned.id}`),
      api('PATCH', `/api/customer-wants/${owned.id}`, { body: { status: 'Closed' } }),
    ]);
    unauth.forEach((response) => assert.equal(response.status, 401));

    const badStatus = await api('PATCH', `/api/customer-wants/${owned.id}`, {
      token: owner.token,
      body: { status: 'Shipped' },
    });
    assert.equal(badStatus.status, 400);

    const badId = await api('GET', '/api/customer-wants/not-an-id', { token: owner.token });
    assert.equal(badId.status, 400);
  });

  it('rate limits public want submissions', async () => {
    const results = [];
    for (let i = 0; i < 25; i += 1) {
      // Unique phones avoid unrelated collisions; the limiter is keyed by IP.
      // eslint-disable-next-line no-await-in-loop
      const response = await api('POST', `/api/store/${owner.slug}/wants`, {
        body: {
          name: `Limiter ${i}`,
          phone: `91111${String(10000 + i).slice(-5)}`,
          request: `Rate limit probe ${i}`,
        },
      });
      results.push(response.status);
    }
    assert.equal(results.includes(429), true, JSON.stringify(results.slice(-5)));
    assert.equal(results.filter((status) => status === 201).length >= 1, true);
  });
});
