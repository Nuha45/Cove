// Hosting runs on UTC; day buckets must still follow the shop's analytics time zone.
process.env.TZ = 'UTC';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const { resolveRange } = require('../utils/dateRange');
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
const password = 'AnalyticsTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `phase8c-${label}-${stamp}@example.com`;
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
      phone: '9876543210',
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

function orderBody(productId, quantity, extras = {}) {
  return {
    customer: {
      name: extras.customerName || 'Analytics Buyer',
      phone: extras.phone || '9876500001',
      email: extras.email || '',
    },
    items: [{ productId, quantity }],
    deliveryMethod: extras.deliveryMethod || 'Pickup',
    deliveryAddress: extras.deliveryAddress || '',
    notes: extras.notes || '',
    ...extras.body,
  };
}

describe('analytics', { timeout: 180000 }, () => {
  let owner;
  let other;
  let necklace;
  let ring;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');

    necklace = await addProduct(owner.token, {
      name: 'Analytics Necklace',
      price: 200,
      stockQuantity: 50,
      status: 'Active',
    });
    ring = await addProduct(owner.token, {
      name: 'Analytics Ring',
      price: 150,
      stockQuantity: 50,
      status: 'Active',
    });
    const otherProduct = await addProduct(other.token, {
      name: 'Other Analytics Item',
      price: 999,
      stockQuantity: 10,
      status: 'Active',
    });

    const first = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(necklace.id, 3, { customerName: 'Aisha Shah', phone: '9876511111' }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.data));

    const second = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(ring.id, 2, { customerName: 'Aisha Shah', phone: '9876511111' }),
    });
    assert.equal(second.status, 201, JSON.stringify(second.data));

    const confirmed = await api('PATCH', `/api/orders/${second.data.order.id}`, {
      token: owner.token,
      body: { status: 'Confirmed' },
    });
    assert.equal(confirmed.status, 200);

    const cancelled = await api('POST', '/api/orders', {
      token: owner.token,
      body: orderBody(necklace.id, 4, { customerName: 'Cancel Me', phone: '9876522222' }),
    });
    assert.equal(cancelled.status, 201, JSON.stringify(cancelled.data));
    const cancelPatch = await api('PATCH', `/api/orders/${cancelled.data.order.id}`, {
      token: owner.token,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelPatch.status, 200);

    const otherOrder = await api('POST', '/api/orders', {
      token: other.token,
      body: orderBody(otherProduct.id, 5, { customerName: 'Other Buyer', phone: '9876533333' }),
    });
    assert.equal(otherOrder.status, 201, JSON.stringify(otherOrder.data));

    const wantNew = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: {
        name: 'Want New',
        phone: '9876544444',
        request: 'Looking for a gold version of the necklace.',
        quantity: 1,
      },
    });
    assert.equal(wantNew.status, 201, JSON.stringify(wantNew.data));

    const wantProgress = await api('POST', `/api/store/${owner.slug}/wants`, {
      body: {
        name: 'Want Progress',
        phone: '9876555555',
        request: 'Need custom sizing for the ring.',
        quantity: 1,
      },
    });
    assert.equal(wantProgress.status, 201);

    const listed = await api('GET', '/api/customer-wants', { token: owner.token });
    const progressWant = listed.data.wants.find((item) => item.request.includes('custom sizing'));
    assert.ok(progressWant);
    const patched = await api('PATCH', `/api/customer-wants/${progressWant.id}`, {
      token: owner.token,
      body: { status: 'In Progress' },
    });
    assert.equal(patched.status, 200);
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

  it('rejects unauthenticated requests', async () => {
    const response = await api('GET', '/api/analytics');
    assert.equal(response.status, 401);
  });

  it('returns business-scoped analytics and ignores client businessId', async () => {
    const response = await api('GET', '/api/analytics', {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const analytics = response.data.analytics;
    assert.ok(analytics);

    // 3 necklace @ 200 + 2 ring @ 150 = 900. Cancelled 4*200 ignored. Other shop ignored.
    assert.equal(analytics.summary.totalSales, 900);
    assert.equal(analytics.summary.totalOrders, 3);
    assert.equal(analytics.summary.salesToday, 900);
    assert.equal(analytics.summary.salesThisWeek, 900);
    assert.equal(analytics.summary.salesThisMonth, 900);
    assert.equal(analytics.summary.totalCustomers, 2);
    assert.equal(analytics.summary.customerWants, 2);

    assert.equal(analytics.orderStatus.New, 1);
    assert.equal(analytics.orderStatus.Confirmed, 1);
    assert.equal(analytics.orderStatus.Cancelled, 1);
    assert.equal(analytics.orderStatus.Preparing, 0);

    assert.equal(analytics.customers.total, 2);
    assert.equal(analytics.customers.new, 1);
    assert.equal(analytics.customers.returning, 1);

    assert.equal(analytics.customerWants.total, 2);
    assert.equal(analytics.customerWants.New, 1);
    assert.equal(analytics.customerWants['In Progress'], 1);

    assert.equal(analytics.topProducts.length >= 2, true);
    assert.equal(analytics.topProducts[0].name, 'Analytics Necklace');
    assert.equal(analytics.topProducts[0].quantitySold, 3);
    assert.equal(analytics.topProducts[1].name, 'Analytics Ring');
    assert.equal(analytics.topProducts[1].quantitySold, 2);

    assert.equal(analytics.salesTrend.length, 7);
    const today = analytics.salesTrend[analytics.salesTrend.length - 1];
    assert.equal(today.sales, 900);
    assert.equal(today.orders, 2);

    const forged = await api('GET', `/api/analytics?businessId=${other.businessId}`, {
      token: owner.token,
    });
    assert.equal(forged.status, 200);
    assert.equal(forged.data.analytics.summary.totalSales, 900);
  });

  it('counts an order just after local midnight as today on a UTC server', async () => {
    const seller = await registerTenant('localday');
    const mug = await addProduct(seller.token, { name: 'Midnight Mug', price: 100, stockQuantity: 5, status: 'Active' });
    const placed = await api('POST', '/api/orders', { token: seller.token, body: orderBody(mug.id, 1) });
    assert.equal(placed.status, 201, JSON.stringify(placed.data));
    const localToday = resolveRange({ range: 'today' }, { timeZone: env.analyticsTimeZone });
    const createdAt = new Date(Math.min(localToday.start.getTime() + 60 * 1000, Date.now()));
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(placed.data.order.id) },
      { $set: { createdAt } }
    );

    const response = await api('GET', '/api/analytics', { token: seller.token });
    assert.equal(response.status, 200);
    assert.equal(response.data.analytics.summary.salesToday, 100);
    const trendToday = response.data.analytics.salesTrend.at(-1);
    assert.equal(trendToday.date, localToday.to);
    assert.equal(trendToday.sales, 100);
  });
});
