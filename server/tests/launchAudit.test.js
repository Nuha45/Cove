const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_cove_key';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'cove_test_secret_value_123456';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'cove_webhook_secret_test';
process.env.RAZORPAY_PLAN_ID = process.env.RAZORPAY_PLAN_ID || 'plan_cove_pro_test';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'false';

const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const WebhookEvent = require('../models/WebhookEvent');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const OrderCounter = require('../models/OrderCounter');
const { signToken } = require('../services/tokenService');
const razorpayService = require('../services/razorpayService');
const { flattenQuery } = require('../middleware/sanitizeInput');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createdBusinessIds = [];
const DAY = 24 * 60 * 60 * 1000;

let server;
let base;
let createCalls = 0;
let createDelayMs = 0;

async function api(method, path, { token, body, headers, rawBody } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
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
  const email = `audit-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password: 'AuditTest1',
      businessName: `${label} Audit ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: user.businessId, slug: business.slug };
}

function fakeRazorpay() {
  return {
    subscriptions: {
      create: async (payload) => {
        createCalls += 1;
        if (createDelayMs) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
        return {
          id: `sub_audit_${stamp}_${createCalls}_${Math.random().toString(16).slice(2, 8)}`,
          plan_id: payload.plan_id,
          status: 'created',
          customer_id: `cust_audit_${createCalls}`,
        };
      },
      cancel: async (id) => ({ id, status: 'cancelled' }),
    },
  };
}

function signWebhook(rawBody) {
  return crypto.createHmac('sha256', env.razorpay.webhookSecret).update(Buffer.from(rawBody)).digest('hex');
}

async function sendWebhook(event, entity, label) {
  const eventId = `evt_${stamp}_${label}`;
  const rawBody = JSON.stringify({ id: eventId, event, payload: { subscription: { entity } } });
  return api('POST', '/api/webhooks/razorpay', {
    rawBody,
    headers: { 'x-razorpay-signature': signWebhook(rawBody), 'x-razorpay-event-id': eventId },
  });
}

describe('launch audit fixes', { timeout: 180000 }, () => {
  before(async () => {
    await connectTestDB();
    razorpayService.setClientForTests(fakeRazorpay());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    razorpayService.resetClientForTests();
    if (createdBusinessIds.length) {
      const ids = { $in: createdBusinessIds };
      await Order.deleteMany({ businessId: ids });
      await Product.deleteMany({ businessId: ids });
      await Customer.deleteMany({ businessId: ids });
      await OrderCounter.deleteMany({ businessId: ids });
      await Subscription.deleteMany({ businessId: ids });
      await WebhookEvent.deleteMany({ eventId: { $regex: stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } });
      await User.deleteMany({ businessId: ids });
      await Business.deleteMany({ _id: ids });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('lets a seller resubscribe after a cancelled period ends even if the final webhook was missed', async () => {
    const tenant = await registerTenant('lapsed');
    await Subscription.updateOne({ businessId: tenant.businessId }, {
      $set: {
        status: 'active',
        plan: 'pro',
        providerSubscriptionId: `sub_old_${stamp}`,
        lastProviderStatus: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEndAt: new Date(Date.now() - DAY),
        trialEndAt: new Date(Date.now() - 40 * DAY),
      },
    });

    createCalls = 0;
    const result = await api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: 'pro' } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(createCalls, 1);
    const saved = await Subscription.findOne({ businessId: tenant.businessId });
    assert.notEqual(saved.providerSubscriptionId, `sub_old_${stamp}`);
    assert.equal(saved.cancelAtPeriodEnd, false);
  });

  it('still blocks a new plan while a cancelled subscription has paid time left', async () => {
    const tenant = await registerTenant('ending');
    await Subscription.updateOne({ businessId: tenant.businessId }, {
      $set: {
        status: 'active',
        plan: 'pro',
        providerSubscriptionId: `sub_ending_${stamp}`,
        cancelAtPeriodEnd: true,
        currentPeriodEndAt: new Date(Date.now() + 5 * DAY),
      },
    });
    const result = await api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: 'advanced' } });
    assert.equal(result.status, 409);
  });

  it('creates only one Razorpay subscription when two checkouts start at once', async () => {
    const tenant = await registerTenant('race');
    createCalls = 0;
    createDelayMs = 150;
    try {
      const [first, second] = await Promise.all([
        api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: 'pro' } }),
        api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: 'pro' } }),
      ]);
      assert.equal(first.status, 201, JSON.stringify(first.data));
      assert.equal(second.status, 201, JSON.stringify(second.data));
      assert.equal(createCalls, 1);
      assert.equal(first.data.checkout.subscriptionId, second.data.checkout.subscriptionId);
    } finally {
      createDelayMs = 0;
    }
  });

  it('adopts a paid subscription Cove created for a shop that lost track of it, but never replaces live access', async () => {
    const orphaned = await registerTenant('orphan');
    await Subscription.updateOne({ businessId: orphaned.businessId }, {
      $set: { status: 'cancelled', providerSubscriptionId: '', lastProviderStatus: 'cancelled', trialEndAt: new Date(Date.now() - DAY) },
    });
    const now = Math.floor(Date.now() / 1000);
    const adopted = await sendWebhook('subscription.activated', {
      id: `sub_orphan_${stamp}`,
      plan_id: env.razorpay.planId,
      status: 'active',
      current_start: now,
      current_end: now + 30 * 86400,
      notes: { businessId: String(orphaned.businessId) },
    }, 'orphan');
    assert.equal(adopted.status, 200, JSON.stringify(adopted.data));
    const saved = await Subscription.findOne({ businessId: orphaned.businessId });
    assert.equal(saved.providerSubscriptionId, `sub_orphan_${stamp}`);
    assert.equal(saved.status, 'active');

    const live = await registerTenant('live');
    await Subscription.updateOne({ businessId: live.businessId }, {
      $set: { status: 'active', providerSubscriptionId: `sub_live_${stamp}`, currentPeriodEndAt: new Date(Date.now() + 20 * DAY) },
    });
    await sendWebhook('subscription.activated', {
      id: `sub_second_${stamp}`,
      plan_id: env.razorpay.planId,
      status: 'active',
      notes: { businessId: String(live.businessId) },
    }, 'second');
    const untouched = await Subscription.findOne({ businessId: live.businessId });
    assert.equal(untouched.providerSubscriptionId, `sub_live_${stamp}`);
  });

  it('does not show raw Razorpay error text to sellers', async () => {
    const tenant = await registerTenant('provider-error');
    razorpayService.setClientForTests({
      subscriptions: {
        create: async () => {
          const err = new Error('boom');
          err.error = { description: 'The api key plan_internal_xyz is invalid' };
          throw err;
        },
        cancel: async () => ({ status: 'cancelled' }),
      },
    });
    try {
      const result = await api('POST', '/api/billing/subscription', { token: tenant.token, body: {} });
      assert.equal(result.status, 502);
      assert.equal(JSON.stringify(result.data).includes('plan_internal_xyz'), false);
      assert.match(result.data.message, /try again/i);
    } finally {
      razorpayService.setClientForTests(fakeRazorpay());
    }
  });

  it('returns the same order when a storefront checkout is retried with the same key', async () => {
    const tenant = await registerTenant('idem');
    const created = await api('POST', '/api/products', {
      token: tenant.token,
      body: { name: 'Audit Bracelet', price: 250, stockQuantity: 5, status: 'Active' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const productId = created.data.product.id;
    const checkoutKey = crypto.randomBytes(24).toString('hex');
    const body = {
      customer: { name: 'Retry Shopper', phone: '9876501234' },
      items: [{ productId, quantity: 2 }],
      deliveryMethod: 'Pickup',
      checkoutKey,
    };

    const first = await api('POST', `/api/store/${tenant.slug}/orders`, { body });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const retry = await api('POST', `/api/store/${tenant.slug}/orders`, { body });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.order.orderNumber, first.data.order.orderNumber);
    assert.equal(retry.data.confirmationToken, first.data.confirmationToken);

    assert.equal(await Order.countDocuments({ businessId: tenant.businessId }), 1);
    const product = await Product.findById(productId);
    assert.equal(product.stockQuantity, 3);

    const confirmation = await api('GET', `/api/store/${tenant.slug}/orders/confirm/${first.data.confirmationToken}`);
    assert.equal(confirmation.status, 200, JSON.stringify(confirmation.data));
    assert.equal(confirmation.data.order.orderNumber, first.data.order.orderNumber);

    const fresh = await api('POST', `/api/store/${tenant.slug}/orders`, {
      body: { ...body, checkoutKey: crypto.randomBytes(24).toString('hex') },
    });
    assert.equal(fresh.status, 201);
    assert.notEqual(fresh.data.order.orderNumber, first.data.order.orderNumber);

    const badKey = await api('POST', `/api/store/${tenant.slug}/orders`, { body: { ...body, checkoutKey: 'short' } });
    assert.equal(badKey.status, 400);
  });

  it('treats repeated query parameters as a single value instead of failing', async () => {
    const tenant = await registerTenant('query');
    const store = await api('GET', `/api/store/${tenant.slug}?search=a&search=b`);
    assert.equal(store.status, 200, JSON.stringify(store.data));
    const products = await api('GET', '/api/products?search=a&search=b&status[x]=1', { token: tenant.token });
    assert.equal(products.status, 200, JSON.stringify(products.data));

    assert.deepEqual(flattenQuery({ a: ['1', '2'], b: { c: '1' }, d: 'x' }), { a: '2', d: 'x' });
  });

  it('accepts a product with four maximum-size images', async () => {
    const tenant = await registerTenant('images');
    const image = `data:image/png;base64,${'A'.repeat(650000)}`;
    const result = await api('POST', '/api/products', {
      token: tenant.token,
      body: { name: 'Big Images', price: 10, stockQuantity: 1, images: [image, image, image, image] },
    });
    assert.notEqual(result.status, 500);
    assert.notEqual(result.data.message, 'That upload is too large. Please use a smaller image.');
  });
});
