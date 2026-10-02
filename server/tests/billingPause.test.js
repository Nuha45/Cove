const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

// Fake values for this process only. Razorpay is never called: a stub client is injected below.
process.env.RAZORPAY_KEY_ID = 'rzp_test_pause_key';
process.env.RAZORPAY_KEY_SECRET = 'pause_test_secret_value_24680';
process.env.RAZORPAY_WEBHOOK_SECRET = 'pause_webhook_secret_test';
process.env.RAZORPAY_PRO_PLAN_ID = 'plan_test_pause_pro_599';
process.env.RAZORPAY_ADVANCED_PLAN_ID = 'plan_test_pause_advanced_899';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'true';
process.env.PUBLIC_SITE_URL = 'https://pause.cove.test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const WebhookEvent = require('../models/WebhookEvent');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const EmailDelivery = require('../models/EmailDelivery');
const StoreEvent = require('../models/StoreEvent');
const razorpayService = require('../services/razorpayService');
const { signToken } = require('../services/tokenService');
const { PAST_DUE_GRACE_DAYS } = require('../utils/entitlements');

const DAY_MS = 24 * 60 * 60 * 1000;
const PRO_PLAN = 'plan_test_pause_pro_599';
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'PauseTest12345';
const createdBusinessIds = [];
const SELLER_PAUSED = 'Your trial has ended. Choose a plan to reopen your Cove store.';

let server;
let base;
let eventSeq = 0;
const subs = new Map();

function fakeClient() {
  return {
    subscriptions: {
      create: async (payload) => {
        const id = `sub_pause_${stamp.replace(/[^a-z0-9]/gi, '')}_${subs.size + 1}`;
        const sub = { id, plan_id: payload.plan_id, status: 'created', customer_id: `cust_${id}` };
        subs.set(id, sub);
        return { ...sub };
      },
      update: async (id, payload) => {
        const sub = subs.get(id);
        if (payload.schedule_change_at === 'now') sub.plan_id = payload.plan_id;
        return { ...sub };
      },
      cancelScheduledChanges: async (id) => ({ ...subs.get(id) }),
      cancel: async (id, atCycleEnd) => {
        const sub = subs.get(id) || { id };
        if (!atCycleEnd) sub.status = 'cancelled';
        return { ...sub };
      },
    },
  };
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
  if (text && (response.headers.get('content-type') || '').includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data, text };
}

async function registerTenant(label) {
  const email = `pause-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Pause ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  await Business.updateOne(
    { _id: user.businessId },
    { $set: { phone: '9876500000', email: `shop-${label}-${stamp}@example.com`, paymentUpiId: 'pause@upi', paymentQrEnabled: true } }
  );
  const product = await Product.create({
    businessId: user.businessId,
    name: `${label} Ring`,
    price: 250,
    stockQuantity: 10,
    status: 'Active',
  });
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    slug: business.slug,
    productId: String(product._id),
  };
}

function signWebhook(rawBody) {
  return crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
}

async function sendWebhook(event, entity, { createdAt = new Date() } = {}) {
  eventSeq += 1;
  const eventId = `evt_pause_${stamp}_${eventSeq}`;
  const raw = JSON.stringify({
    id: eventId,
    event,
    created_at: Math.floor(createdAt.getTime() / 1000),
    payload: { subscription: { entity } },
  });
  const response = await fetch(`${base}/api/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signWebhook(raw),
      'x-razorpay-event-id': eventId,
    },
    body: raw,
  });
  assert.equal(response.status, 200, await response.text());
}

function periodEntity(sub, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: sub.providerSubscriptionId,
    plan_id: sub.providerPlanId,
    status: 'active',
    current_start: now,
    current_end: now + 30 * 24 * 3600,
    ...overrides,
  };
}

async function subscriptionOf(tenant) {
  return Subscription.findOne({ businessId: tenant.businessId });
}

async function expireTrial(tenant) {
  await Subscription.updateOne(
    { businessId: tenant.businessId },
    { $set: { trialEndAt: new Date(Date.now() - 60 * 1000) } }
  );
}

async function activatePaidPlan(tenant, planKey) {
  await expireTrial(tenant);
  const started = await api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: planKey } });
  assert.equal(started.status, 201, JSON.stringify(started.data));
  await sendWebhook('subscription.activated', periodEntity(await subscriptionOf(tenant)));
  return subscriptionOf(tenant);
}

function order(tenant) {
  return {
    customer: { name: 'Asha', phone: '9876512345' },
    items: [{ productId: tenant.productId, quantity: 1 }],
    deliveryMethod: 'Pickup',
    paymentMethod: 'pay_on_pickup',
  };
}

async function storeIsOpen(tenant) {
  const storefront = await api('GET', `/api/store/${tenant.slug}`);
  assert.equal(storefront.status, 200);
  return storefront.data.business.paused !== true && storefront.data.products.length > 0;
}

async function assertPaused(tenant) {
  const storefront = await api('GET', `/api/store/${tenant.slug}`);
  assert.equal(storefront.status, 200);
  assert.equal(storefront.data.business.paused, true);
  assert.equal(storefront.data.business.storefrontActive, false);
  assert.deepEqual(storefront.data.products, []);
  assert.deepEqual(storefront.data.categories, []);

  const product = await api('GET', `/api/store/${tenant.slug}/products/${tenant.productId}`);
  assert.equal(product.status, 403);
  const created = await api('POST', `/api/store/${tenant.slug}/orders`, { body: order(tenant) });
  assert.equal(created.status, 403);
  assert.equal(created.data.errors[0].message, 'store_paused');
}

describe('billing required, security and AI removal', { timeout: 300000 }, () => {
  before(async () => {
    await connectTestDB();
    razorpayService.setClientForTests(fakeClient());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    razorpayService.resetClientForTests();
    if (createdBusinessIds.length) {
      const scope = { businessId: { $in: createdBusinessIds } };
      await Promise.all([
        StoreEvent.deleteMany(scope),
        Invoice.deleteMany(scope),
        EmailDelivery.deleteMany(scope),
        Notification.deleteMany(scope),
        Order.deleteMany(scope),
        Customer.deleteMany(scope),
        CustomerWant.deleteMany(scope),
        Product.deleteMany(scope),
        OrderCounter.deleteMany(scope),
        Subscription.deleteMany(scope),
        User.deleteMany(scope),
      ]);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    await WebhookEvent.deleteMany({ eventId: { $regex: `^evt_pause_${stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  describe('paused store and plan reopen', () => {
    it('keeps the store open for customers during the 7-day trial', async () => {
      const seller = await registerTenant('trial');
      assert.equal(env.enforceBilling, true);
      assert.equal(await storeIsOpen(seller), true);
      const created = await api('POST', `/api/store/${seller.slug}/orders`, { body: order(seller) });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.store.paused, false);
      assert.equal(billing.data.trial.active, true);
    });
  
    it('pauses the public store when the trial ends and blocks every customer action on the server', async () => {
      const seller = await registerTenant('expired');
      const placed = await api('POST', `/api/store/${seller.slug}/orders`, { body: order(seller) });
      assert.equal(placed.status, 201);
      const token = placed.data.confirmationToken;
      const want = await CustomerWant.create({
        businessId: seller.businessId,
        name: 'Board Fan',
        phone: '9876512399',
        phoneNormalized: '9876512399',
        request: 'Silver anklet',
        boardApproved: true,
        shareOnBoardOptIn: true,
      });
      await expireTrial(seller);
  
      await assertPaused(seller);
  
      // Paused payload is branding only: no contact, payment, product or internal details.
      const storefront = await api('GET', `/api/store/${seller.slug}`);
      const serialized = JSON.stringify(storefront.data);
      for (const leaked of ['9876500000', `shop-expired-${stamp}`, 'pause@upi', seller.email, String(seller.businessId), 'Ring', 'payments', 'plan', 'trial']) {
        assert.equal(serialized.includes(leaked), false, `paused storefront leaked "${leaked}"`);
      }
  
      // Direct API calls cannot sneak past the pause, whatever the request claims.
      const forged = await api('POST', `/api/store/${seller.slug}/orders`, {
        body: { ...order(seller), businessId: String(seller.businessId), plan: 'advanced', status: 'active' },
        headers: { 'x-plan': 'advanced', 'x-trial': 'true', cookie: 'plan=advanced; trial=true' },
      });
      assert.equal(forged.status, 403);
      const forgedQuery = await api('POST', `/api/store/${seller.slug}/orders?plan=advanced&paused=false`, { body: order(seller) });
      assert.equal(forgedQuery.status, 403);
  
      const payment = await api('POST', `/api/store/${seller.slug}/orders/confirm/${token}/payment`, {
        body: { paymentReference: 'UTR123456' },
      });
      assert.equal(payment.status, 403);
      const confirmation = await api('GET', `/api/store/${seller.slug}/orders/confirm/${token}`);
      assert.equal(confirmation.status, 200);
      assert.equal(confirmation.data.business.paused, true);
      assert.equal(confirmation.data.business.payments.hasConfiguredMethod, false);
      assert.equal(JSON.stringify(confirmation.data).includes('pause@upi'), false);
  
      const newWant = await api('POST', `/api/store/${seller.slug}/wants`, {
        body: { name: 'Req', phone: '9876512300', request: 'Gold hoops' },
      });
      assert.equal(newWant.status, 403);
      assert.equal((await api('GET', `/api/store/${seller.slug}/want-board`)).status, 403);
      const vote = await api('POST', `/api/store/${seller.slug}/want-board/${want._id}/votes`, { body: {} });
      assert.equal(vote.status, 403);
  
      const before = await StoreEvent.countDocuments({ businessId: seller.businessId });
      const tracked = await api('POST', `/api/store/${seller.slug}/events`, {
        body: { type: 'visit', visitorId: `pause-visitor-${stamp.replace(/[^a-z0-9]/gi, '')}`.slice(0, 60) },
      });
      assert.equal(tracked.status, 202);
      assert.equal(await StoreEvent.countDocuments({ businessId: seller.businessId }), before);
  
      const sitemap = await api('GET', '/api/seo/sitemap.xml');
      assert.equal(sitemap.status, 200);
      assert.equal(sitemap.text.includes(`/store/${seller.slug}`), false);
  
      // Data is preserved.
      assert.equal(await Order.countDocuments({ businessId: seller.businessId }), 1);
      assert.equal(await Product.countDocuments({ businessId: seller.businessId }), 1);
    });
  
    it('a paused store shows only a Basic-safe look, never saved Cove Plus appearance', async () => {
      const seller = await registerTenant('pausedlook');
      const saved = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: { storefrontTheme: 'bold', storefrontAccent: '#1F2937', storefrontBackground: '#EDF2EC' },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      await expireTrial(seller);
      await assertPaused(seller);
      const storefront = await api('GET', `/api/store/${seller.slug}`);
      assert.equal(storefront.data.business.appearance.theme, 'warm');
      assert.equal(storefront.data.business.appearance.accent, '#FF7A3D');
      assert.equal(storefront.data.business.appearance.background, '');
      assert.equal(storefront.text.includes('#EDF2EC'), false);
      assert.equal(storefront.text.includes('#1F2937'), false);
    });

    it('lets the seller log in and use Billing, settings and existing data while paused', async () => {
      const seller = await registerTenant('seller');
      await api('POST', `/api/store/${seller.slug}/orders`, { body: order(seller) });
      await expireTrial(seller);
  
      const login = await api('POST', '/api/auth/login', { body: { email: seller.email, password } });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      assert.equal((await api('GET', '/api/auth/me', { token: seller.token })).status, 200);
  
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.status, 200);
      assert.equal(billing.data.store.paused, true);
      assert.equal(billing.data.store.reason, 'trial_ended');
      assert.equal(billing.data.trial.ended, true);
      assert.deepEqual(billing.data.plans.map((plan) => [plan.name, plan.amount]), [['Cove Basic', 599], ['Cove Plus', 899]]);
  
      assert.equal((await api('GET', '/api/business/settings', { token: seller.token })).status, 200);
      assert.equal((await api('GET', '/api/products', { token: seller.token })).status, 200);
      const orders = await api('GET', '/api/orders', { token: seller.token });
      assert.equal(orders.status, 200);
      assert.equal(orders.data.orders.length, 1);
      assert.equal((await api('GET', '/api/customers', { token: seller.token })).status, 200);
      const edit = await api('PATCH', `/api/products/${seller.productId}`, { token: seller.token, body: { price: 300 } });
      assert.equal(edit.status, 200);
  
      const manual = await api('POST', '/api/orders', { token: seller.token, body: order(seller) });
      assert.equal(manual.status, 403);
      assert.equal(manual.data.message, SELLER_PAUSED);
    });
  
    it('Cove Basic ₹599 reopens the store; Cove Plus features stay locked', async () => {
      const seller = await registerTenant('basic');
      await expireTrial(seller);
      await assertPaused(seller);
      const sub = await activatePaidPlan(seller, 'pro');
      assert.equal(sub.status, 'active');
      assert.equal(await storeIsOpen(seller), true);
      assert.equal((await api('POST', `/api/store/${seller.slug}/orders`, { body: order(seller) })).status, 201);
      assert.equal((await api('GET', '/api/invoices', { token: seller.token })).status, 403);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.plan.name, 'Cove Basic');
      assert.equal(billing.data.store.paused, false);
    });
  
    it('Cove Plus ₹899 reopens the store with Cove Plus features', async () => {
      const seller = await registerTenant('plus');
      await expireTrial(seller);
      await activatePaidPlan(seller, 'advanced');
      assert.equal(await storeIsOpen(seller), true);
      assert.equal((await api('GET', '/api/invoices', { token: seller.token })).status, 200);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.plan.name, 'Cove Plus');
    });
  
    it('upgrade and scheduled downgrade keep the store open throughout', async () => {
      const seller = await registerTenant('switch');
      const sub = await activatePaidPlan(seller, 'pro');
      const upgraded = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(upgraded.status, 201);
      assert.match(upgraded.data.planChange.message, /Cove Plus/);
      assert.equal(await storeIsOpen(seller), true);
  
      const downgrade = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      assert.equal(downgrade.status, 201);
      assert.equal(downgrade.data.planChange.applied, false);
      assert.match(downgrade.data.planChange.message, /Cove Basic/);
      assert.equal(await storeIsOpen(seller), true);
      await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: PRO_PLAN }));
      assert.equal((await subscriptionOf(seller)).plan, 'pro');
      assert.equal(await storeIsOpen(seller), true);
    });
  
    it('cancellation keeps the store open until the paid period ends, then pauses it', async () => {
      const seller = await registerTenant('cancel');
      const sub = await activatePaidPlan(seller, 'pro');
      const cancelled = await api('POST', '/api/billing/subscription/cancel', { token: seller.token, body: {} });
      assert.equal(cancelled.status, 200);
      assert.equal(await storeIsOpen(seller), true);
      await Subscription.updateOne({ businessId: seller.businessId }, { $set: { currentPeriodEndAt: new Date(Date.now() - 1000) } });
      await assertPaused(seller);
      await sendWebhook('subscription.cancelled', periodEntity(sub, { status: 'cancelled' }));
      await assertPaused(seller);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.store.paused, true);
      // A paid plan ended: this seller is not told their trial ended.
      assert.equal(billing.data.store.reason, 'billing_required');
      const manual = await api('POST', '/api/orders', { token: seller.token, body: order(seller) });
      assert.equal(manual.data.message, 'Your Cove store is paused. Choose a plan to reopen your Cove store.');
    });
  
    it('past due keeps the store open during the grace period and pauses it after', async () => {
      const seller = await registerTenant('pastdue');
      const sub = await activatePaidPlan(seller, 'pro');
      await sendWebhook('subscription.pending', periodEntity(sub, { status: 'pending' }), { createdAt: new Date(Date.now() + 1000) });
      assert.equal((await subscriptionOf(seller)).status, 'past_due');
      assert.equal(await storeIsOpen(seller), true);
      await Subscription.updateOne(
        { businessId: seller.businessId },
        { $set: { pastDueSince: new Date(Date.now() - (PAST_DUE_GRACE_DAYS + 1) * DAY_MS) } }
      );
      await assertPaused(seller);
    });
  
    it('halted pauses the store; reactivation with a new subscription reopens it', async () => {
      const seller = await registerTenant('halted');
      const sub = await activatePaidPlan(seller, 'pro');
      await sendWebhook('subscription.halted', periodEntity(sub, { status: 'halted' }), { createdAt: new Date(Date.now() + 1000) });
      assert.equal((await subscriptionOf(seller)).status, 'halted');
      await assertPaused(seller);
  
      const restarted = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(restarted.status, 201, JSON.stringify(restarted.data));
      // Checkout alone does not reopen the store: only a verified webhook does.
      await assertPaused(seller);
      const fresh = await subscriptionOf(seller);
      assert.notEqual(fresh.providerSubscriptionId, sub.providerSubscriptionId);
      await sendWebhook('subscription.activated', periodEntity(fresh), { createdAt: new Date(Date.now() + 2000) });
      assert.equal((await subscriptionOf(seller)).status, 'active');
      assert.equal(await storeIsOpen(seller), true);
    });
  
    it('a shop the seller closed stays closed even with a paid plan', async () => {
      const seller = await registerTenant('closed');
      await activatePaidPlan(seller, 'pro');
      await Business.updateOne({ _id: seller.businessId }, { $set: { storefrontActive: false } });
      const storefront = await api('GET', `/api/store/${seller.slug}`);
      assert.equal(storefront.data.business.storefrontActive, false);
      assert.equal(storefront.data.business.paused, undefined);
      assert.equal((await api('POST', `/api/store/${seller.slug}/orders`, { body: order(seller) })).status, 403);
    });
    });
  
  describe('security hardening', () => {
    let seller;
  
    before(async () => {
      seller = await registerTenant('security');
    });
  
    it('refuses cookie-authenticated writes from a foreign or opaque origin (CSRF)', async () => {
      for (const origin of ['https://evil.example', 'null']) {
        // eslint-disable-next-line no-await-in-loop
        const blocked = await api('POST', '/api/billing/subscription', {
          token: seller.token,
          body: {},
          headers: { origin },
        });
        assert.equal(blocked.status, 403, origin);
      }
      const viaReferer = await api('PATCH', `/api/products/${seller.productId}`, {
        token: seller.token,
        body: { price: 1 },
        headers: { referer: 'https://evil.example/page' },
      });
      assert.equal(viaReferer.status, 403);
      assert.equal((await Product.findById(seller.productId)).price, 250);
      const logout = await api('POST', '/api/auth/logout', { token: seller.token, headers: { origin: 'https://evil.example' } });
      assert.equal(logout.status, 403);
      assert.equal((await Subscription.findOne({ businessId: seller.businessId })).providerSubscriptionId, '');
  
      const allowed = await api('PATCH', `/api/products/${seller.productId}`, {
        token: seller.token,
        body: { price: 260 },
        headers: { origin: 'http://localhost:5173' },
      });
      assert.equal(allowed.status, 200);
      // Reads are never blocked.
      assert.equal((await api('GET', '/api/products', { token: seller.token, headers: { origin: 'https://evil.example' } })).status, 200);
    });
  
    it('strips Mongo operators and prototype keys from input', async () => {
      const login = await api('POST', '/api/auth/login', {
        body: { email: { $ne: null }, password: { $ne: null } },
      });
      assert.notEqual(login.status, 200);
      const polluted = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: JSON.parse('{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}},"city":"Kochi"}'),
      });
      assert.equal(polluted.status, 200, JSON.stringify(polluted.data));
      assert.equal({}.isAdmin, undefined);
      assert.equal({}.x, undefined);
      const store = await api('GET', `/api/store/${seller.slug}?category[$ne]=zzz`);
      assert.equal(store.status, 200);
    });
  
    it('does not expose internal error details', async () => {
      const bad = await api('GET', '/api/orders/not-an-id', { token: seller.token });
      assert.equal(bad.status, 400);
      assert.equal(/stack|mongo|cast/i.test(bad.text), false);
      const parse = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":',
      });
      assert.equal(parse.status, 400);
      assert.equal(/SyntaxError|at JSON/.test(await parse.text()), false);
    });
  
    it('AI marketing is gone: no route, no plan feature, no config', async () => {
      for (const path of ['/api/marketing', '/api/marketing/status', '/api/marketing/generate']) {
        // eslint-disable-next-line no-await-in-loop
        const response = await api(path.endsWith('generate') ? 'POST' : 'GET', path, { token: seller.token, body: path.endsWith('generate') ? {} : undefined });
        assert.equal(response.status, 404, path);
      }
      assert.equal(env.ai, undefined);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(/\bAI\b|openai|marketing/i.test(JSON.stringify(billing.data)), false);
    });
    });
  });
