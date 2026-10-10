const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

// Fake values for this process only. Razorpay is never called: a stub client is injected below.
process.env.RAZORPAY_KEY_ID = 'rzp_test_subscription_key';
process.env.RAZORPAY_KEY_SECRET = 'subscription_test_secret_value_987654';
process.env.RAZORPAY_WEBHOOK_SECRET = 'subscription_webhook_secret_test';
process.env.RAZORPAY_PRO_PLAN_ID = 'plan_test_pro_599';
process.env.RAZORPAY_ADVANCED_PLAN_ID = 'plan_test_advanced_899';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'false';

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
const Invoice = require('../models/Invoice');
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const ReceiptCounter = require('../models/ReceiptCounter');
const Notification = require('../models/Notification');
const EmailDelivery = require('../models/EmailDelivery');
const StoreEvent = require('../models/StoreEvent');
const razorpayService = require('../services/razorpayService');
const { signToken } = require('../services/tokenService');
const { TRIAL_DAYS } = require('../utils/covePlan');
const {
  hasAdvancedFeatures,
  hasPaidAccess,
  inRunningTrial,
  trialEnded,
  PAST_DUE_GRACE_DAYS,
} = require('../utils/entitlements');
const { mapRazorpayStatus } = require('../utils/subscriptionStatus');

const DAY_MS = 24 * 60 * 60 * 1000;
const PRO_PLAN = 'plan_test_pro_599';
const ADVANCED_PLAN = 'plan_test_advanced_899';
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'SubscriptionTest1';
const createdBusinessIds = [];

let server;
let base;
let eventSeq = 0;

const razorpay = {
  subs: new Map(),
  invoices: new Map(),
  payments: new Map(),
  calls: [],
  reset() {
    this.calls = [];
  },
  count(method) {
    return this.calls.filter((call) => call.method === method).length;
  },
};

function fakeClient() {
  return {
    subscriptions: {
      create: async (payload) => {
        const id = `sub_${stamp.replace(/[^a-z0-9]/gi, '')}_${razorpay.subs.size + 1}`;
        const sub = { id, plan_id: payload.plan_id, status: 'created', customer_id: `cust_${id}` };
        razorpay.subs.set(id, sub);
        razorpay.calls.push({ method: 'create', payload });
        return { ...sub };
      },
      update: async (id, payload) => {
        razorpay.calls.push({ method: 'update', id, payload });
        const sub = razorpay.subs.get(id);
        if (payload.schedule_change_at === 'now') sub.plan_id = payload.plan_id;
        return { ...sub };
      },
      cancelScheduledChanges: async (id) => {
        razorpay.calls.push({ method: 'cancelScheduledChanges', id });
        return { ...razorpay.subs.get(id) };
      },
      cancel: async (id, atCycleEnd) => {
        razorpay.calls.push({ method: 'cancel', id, atCycleEnd });
        const sub = razorpay.subs.get(id) || { id };
        if (!atCycleEnd) sub.status = 'cancelled';
        return { ...sub };
      },
    },
    invoices: {
      fetch: async (id) => {
        razorpay.calls.push({ method: 'invoices.fetch', id });
        if (!razorpay.invoices.has(id)) throw unknownId();
        return { ...razorpay.invoices.get(id) };
      },
      all: async (params = {}) => {
        razorpay.calls.push({ method: 'invoices.all', params });
        const matching = [...razorpay.invoices.values()]
          .filter((invoice) => !params.subscription_id || invoice.subscription_id === params.subscription_id);
        const skip = Number(params.skip) || 0;
        const items = matching.slice(skip, skip + (Number(params.count) || 10)).map((invoice) => ({ ...invoice }));
        return { entity: 'collection', count: items.length, items };
      },
    },
    payments: {
      fetch: async (id) => {
        razorpay.calls.push({ method: 'payments.fetch', id });
        if (!razorpay.payments.has(id)) throw unknownId();
        return { ...razorpay.payments.get(id) };
      },
    },
  };
}

function unknownId() {
  return Object.assign(new Error('The id provided does not exist'), {
    statusCode: 400,
    error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' },
  });
}

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
  if (text && (response.headers.get('content-type') || '').includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data, text, headers: response.headers };
}

async function registerTenant(label) {
  const email = `subscription-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Subs ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { email, token: signToken(user), businessId: user.businessId, slug: business.slug };
}

function signWebhook(rawBody) {
  return crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
}

async function sendWebhook(event, entity, { id, createdAt = new Date(), signature, payment } = {}) {
  eventSeq += 1;
  const eventId = id || `evt_${stamp}_${eventSeq}`;
  const raw = JSON.stringify({
    id: eventId,
    event,
    created_at: Math.floor(createdAt.getTime() / 1000),
    payload: { subscription: { entity }, ...(payment ? { payment: { entity: payment } } : {}) },
  });
  const response = await api('POST', '/api/webhooks/razorpay', {
    rawBody: raw,
    headers: {
      'x-razorpay-signature': signature === undefined ? signWebhook(raw) : signature,
      'x-razorpay-event-id': eventId,
    },
  });
  return { ...response, eventId };
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

// Every Advanced-only endpoint, called straight at the API.
async function advancedStatuses(token, extra = {}) {
  const paths = [
    ['GET', '/api/analytics/performance?range=7d'],
    ['GET', '/api/analytics/products?range=7d'],
    ['GET', '/api/analytics/sales-report?range=7d'],
    ['GET', '/api/analytics/export/orders.csv?range=7d'],
    ['GET', '/api/invoices'],
    ['GET', '/api/products/inventory'],
    ['GET', '/api/products/export.csv'],
  ];
  const results = {};
  for (const [method, path] of paths) {
    // eslint-disable-next-line no-await-in-loop
    results[path] = (await api(method, path, { token, ...extra })).status;
  }
  return results;
}

function assertAll(results, expected) {
  for (const [path, status] of Object.entries(results)) {
    assert.equal(status, expected, `${path} returned ${status}, expected ${expected}`);
  }
}

// Paid-plan state without real money: checkout via the stub, then a signed "activated" webhook.
async function activatePaidPlan(tenant, planKey) {
  await expireTrial(tenant);
  const started = await api('POST', '/api/billing/subscription', { token: tenant.token, body: { plan: planKey } });
  assert.equal(started.status, 201, JSON.stringify(started.data));
  const sub = await subscriptionOf(tenant);
  assert.equal(sub.status, 'incomplete');
  const activated = await sendWebhook('subscription.activated', periodEntity(sub));
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  return subscriptionOf(tenant);
}

describe('subscriptions, 7-day trial and plan access', { timeout: 240000 }, () => {
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
        SubscriptionReceipt.deleteMany(scope),
        EmailDelivery.deleteMany(scope),
        Notification.deleteMany(scope),
        Order.deleteMany(scope),
        Customer.deleteMany(scope),
        Product.deleteMany(scope),
        OrderCounter.deleteMany(scope),
        Subscription.deleteMany(scope),
        User.deleteMany(scope),
      ]);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    await WebhookEvent.deleteMany({ eventId: { $regex: `^evt_${stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  describe('entitlement rules', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const later = (days) => new Date(now.getTime() + days * DAY_MS);

    it('grants Advanced only while the trial is actually running', () => {
      assert.equal(TRIAL_DAYS, 7);
      assert.equal(inRunningTrial({ status: 'trialing', trialEndAt: later(1) }, now), true);
      assert.equal(inRunningTrial({ status: 'trialing', trialEndAt: later(-1) }, now), false);
      assert.equal(inRunningTrial({ status: 'trialing', trialEndAt: null }, now), false);
      assert.equal(hasAdvancedFeatures({ status: 'trialing', plan: 'pro', trialEndAt: later(1) }, now), true);
      assert.equal(trialEnded({ status: 'incomplete', trialEndAt: later(-1) }, now), true);
      assert.equal(trialEnded({ status: 'trialing', trialEndAt: later(1) }, now), false);
    });

    it('does not keep a lapsed trial checkout on Advanced', () => {
      const lapsed = {
        status: 'trialing',
        plan: 'advanced',
        trialEndAt: later(-3),
        providerSubscriptionId: 'sub_x',
        lastProviderStatus: 'created',
      };
      assert.equal(hasAdvancedFeatures(lapsed, now), false);
      // Card authenticated, first charge in flight: short grace only.
      assert.equal(hasAdvancedFeatures({ ...lapsed, lastProviderStatus: 'authenticated', trialEndAt: later(-0.1) }, now), true);
      assert.equal(hasAdvancedFeatures({ ...lapsed, lastProviderStatus: 'authenticated', trialEndAt: later(-2) }, now), false);
    });

    it('applies paid access rules for active, past due, cancelled and halted', () => {
      const active = { status: 'active', plan: 'advanced', currentPeriodEndAt: later(10) };
      assert.equal(hasAdvancedFeatures(active, now), true);
      assert.equal(hasAdvancedFeatures({ ...active, plan: 'pro' }, now), false);
      assert.equal(hasPaidAccess({ ...active, plan: 'pro' }, now), true);
      assert.equal(hasAdvancedFeatures({ ...active, cancelAtPeriodEnd: true }, now), true);
      assert.equal(hasAdvancedFeatures({ ...active, cancelAtPeriodEnd: true, currentPeriodEndAt: later(-1) }, now), false);
      const pastDue = { status: 'past_due', plan: 'advanced', pastDueSince: later(-2) };
      assert.equal(hasAdvancedFeatures(pastDue, now), true);
      assert.equal(hasAdvancedFeatures({ ...pastDue, pastDueSince: later(-PAST_DUE_GRACE_DAYS - 1) }, now), false);
      assert.equal(hasAdvancedFeatures({ status: 'past_due', plan: 'advanced' }, now), false);
      assert.equal(hasAdvancedFeatures({ status: 'halted', plan: 'advanced' }, now), false);
      assert.equal(hasAdvancedFeatures({ status: 'cancelled', plan: 'advanced' }, now), false);
      assert.equal(hasAdvancedFeatures({ status: 'incomplete', plan: 'advanced' }, now), false);
      assert.equal(hasAdvancedFeatures(null, now), false);
    });

    it('maps Razorpay states onto Cove statuses', () => {
      assert.equal(mapRazorpayStatus('active'), 'active');
      assert.equal(mapRazorpayStatus('pending'), 'past_due');
      assert.equal(mapRazorpayStatus('halted'), 'halted');
      assert.equal(mapRazorpayStatus('cancelled'), 'cancelled');
      assert.equal(mapRazorpayStatus('completed'), 'cancelled');
      assert.equal(mapRazorpayStatus('expired'), 'cancelled');
      assert.equal(mapRazorpayStatus('authenticated', { trialEndAt: later(2), now }), 'trialing');
      assert.equal(mapRazorpayStatus('authenticated', { trialEndAt: later(-2), now }), 'incomplete');
      assert.equal(mapRazorpayStatus('created', { now }), 'incomplete');
    });
  });

  describe('journey', () => {
    it('A: a new seller gets a 7-day Cove Plus trial when the shop is created', async () => {
      const seller = await registerTenant('new');
      const sub = await subscriptionOf(seller);
      assert.equal(sub.status, 'trialing');
      assert.equal(sub.trialUsed, true);
      assert.equal(sub.trialEndAt.getTime() - sub.trialStartAt.getTime(), 7 * DAY_MS);
      assert.ok(Math.abs(sub.trialStartAt.getTime() - Date.now()) < 60 * 1000);
      assert.equal(sub.providerSubscriptionId, '');

      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.status, 200);
      assert.equal(billing.data.trial.active, true);
      assert.equal(billing.data.trial.days, 7);
      assert.equal(billing.data.trial.ended, false);
      assert.equal(billing.data.entitlements.advanced, true);
      assert.deepEqual(billing.data.plans.map((plan) => [plan.key, plan.name, plan.amount]), [['pro', 'Cove Basic', 599], ['advanced', 'Cove Plus', 899]]);
      const serialized = JSON.stringify(billing.data);
      for (const secret of [env.razorpay.keySecret, env.razorpay.webhookSecret, PRO_PLAN, ADVANCED_PLAN]) {
        assert.equal(serialized.includes(secret), false, 'billing response leaked a server-only value');
      }
    });

    it('rejects incomplete seller details at signup on the server', async () => {
      const missing = await api('POST', '/api/auth/register', {
        body: { name: 'No Shop', email: `subscription-noshop-${stamp}@example.com`, password },
      });
      assert.equal(missing.status, 400);
      assert.equal(await User.countDocuments({ email: `subscription-noshop-${stamp}@example.com` }), 0);
    });

    it('B: Cove Plus and Cove Basic features work during the trial', async () => {
      const seller = await registerTenant('trial');
      assertAll(await advancedStatuses(seller.token), 200);
      const product = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Trial Ring', price: 300, stockQuantity: 5, status: 'Active' },
      });
      assert.equal(product.status, 201);
      const bulk = await api('POST', '/api/products/bulk', {
        token: seller.token,
        body: { ids: [product.data.product.id], action: 'adjustStock', value: 2 },
      });
      assert.equal(bulk.status, 200, JSON.stringify(bulk.data));
      const settings = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: { lowStockThreshold: 3, storefrontAnnouncement: 'Trial week' },
      });
      assert.equal(settings.status, 200, JSON.stringify(settings.data));
      // AI marketing was removed from Cove entirely.
      assert.equal((await api('GET', '/api/marketing/status', { token: seller.token })).status, 404);
    });

    it('C: trial expiry removes Cove Plus on the server, whatever the browser claims', async () => {
      const seller = await registerTenant('expired');
      await expireTrial(seller);

      assertAll(await advancedStatuses(seller.token), 403);
      const forged = await advancedStatuses(seller.token, {
        headers: {
          'x-plan': 'advanced',
          'x-trial': 'true',
          'x-business-id': String(seller.businessId),
          cookie: `cove_token=${seller.token}; plan=advanced; trial=true`,
        },
      });
      assertAll(forged, 403);
      const query = await api('GET', '/api/analytics/performance?range=7d&advanced=true&plan=advanced', { token: seller.token });
      assert.equal(query.status, 403);
      const advancedSetting = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: { lowStockThreshold: 3 },
      });
      assert.equal(advancedSetting.status, 403);
      assert.match(advancedSetting.data.message, /Cove Plus/);

      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.subscription.status, 'incomplete');
      assert.equal(billing.data.trial.ended, true);
      assert.equal(billing.data.entitlements.advanced, false);
      assert.equal(billing.data.entitlements.paid, false);
      assert.equal(billing.data.plans.length, 2);

      // Base (Pro-level) features are not locked by the trial ending.
      const product = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'After Trial Ring', price: 300, stockQuantity: 5, status: 'Active' },
      });
      assert.equal(product.status, 201);
      assert.equal((await api('GET', '/api/products', { token: seller.token })).status, 200);
      assert.equal((await api('GET', '/api/analytics', { token: seller.token })).status, 200);

      // The client cannot restart or extend the trial.
      const tamper = await api('POST', '/api/billing/subscription', {
        token: seller.token,
        body: { plan: 'enterprise', trialEndAt: new Date(Date.now() + 30 * DAY_MS).toISOString() },
      });
      assert.equal(tamper.status, 400);
      const after = await subscriptionOf(seller);
      assert.ok(after.trialEndAt < new Date());
    });

    it('does not grant a paid plan until a verified webhook confirms it', async () => {
      const seller = await registerTenant('unpaid');
      await expireTrial(seller);
      razorpay.reset();
      const started = await api('POST', '/api/billing/subscription', {
        token: seller.token,
        body: { plan: 'advanced', status: 'active', amount: 1, businessId: 'someone-else' },
      });
      assert.equal(started.status, 201);
      assert.equal(started.data.checkout.amount, 899);
      assert.equal(razorpay.calls[0].payload.plan_id, ADVANCED_PLAN);
      assert.equal(razorpay.calls[0].payload.start_at, undefined);
      assert.equal(started.data.subscription.status, 'incomplete');
      assertAll(await advancedStatuses(seller.token), 403);

      const unsigned = await sendWebhook('subscription.activated', periodEntity(await subscriptionOf(seller)), { signature: 'forged' });
      assert.equal(unsigned.status, 400);
      const missing = await sendWebhook('subscription.activated', periodEntity(await subscriptionOf(seller)), { signature: '' });
      assert.equal(missing.status, 400);
      assert.equal((await subscriptionOf(seller)).status, 'incomplete');
      assertAll(await advancedStatuses(seller.token), 403);
    });

    it('D: Cove Basic ₹599 keeps base features and leaves Cove Plus locked', async () => {
      const seller = await registerTenant('pro');
      const sub = await activatePaidPlan(seller, 'pro');
      assert.equal(sub.status, 'active');
      assert.equal(sub.plan, 'pro');
      assertAll(await advancedStatuses(seller.token), 403);
      const product = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Pro Ring', price: 300, stockQuantity: 5, status: 'Active' },
      });
      assert.equal(product.status, 201);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.plan.amount, 599);
      assert.equal(billing.data.entitlements.paid, true);
      assert.equal(billing.data.entitlements.advanced, false);
      assert.equal(billing.data.trial.ended, false);
    });

    it('E: Cove Plus ₹899 unlocks Cove Plus features', async () => {
      const seller = await registerTenant('adv');
      const sub = await activatePaidPlan(seller, 'advanced');
      assert.equal(sub.plan, 'advanced');
      assert.equal(sub.status, 'active');
      assertAll(await advancedStatuses(seller.token), 200);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.plan.amount, 899);
      assert.equal(billing.data.entitlements.advanced, true);
    });

    it('upgrades Cove Basic → Cove Plus on the same Razorpay subscription', async () => {
      const seller = await registerTenant('upgrade');
      const before = await activatePaidPlan(seller, 'pro');
      razorpay.reset();
      const upgraded = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(upgraded.status, 201, JSON.stringify(upgraded.data));
      assert.equal(upgraded.data.planChange.applied, true);
      assert.equal(razorpay.count('create'), 0);
      assert.equal(razorpay.calls[0].payload.schedule_change_at, 'now');
      const after = await subscriptionOf(seller);
      assert.equal(after.providerSubscriptionId, before.providerSubscriptionId);
      assert.equal(after.plan, 'advanced');
      assertAll(await advancedStatuses(seller.token), 200);

      const again = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(again.status, 409);
    });

    it('downgrades Cove Plus → Cove Basic at the end of the paid cycle', async () => {
      const seller = await registerTenant('downgrade');
      const sub = await activatePaidPlan(seller, 'advanced');
      razorpay.reset();

      const scheduled = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      assert.equal(scheduled.status, 201);
      assert.equal(scheduled.data.planChange.applied, false);
      assert.equal(razorpay.calls[0].payload.schedule_change_at, 'cycle_end');
      let current = await subscriptionOf(seller);
      assert.equal(current.plan, 'advanced');
      assert.equal(current.scheduledPlan, 'pro');
      assertAll(await advancedStatuses(seller.token), 200);

      const duplicate = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      assert.equal(duplicate.status, 409);

      const keep = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(keep.status, 201);
      assert.equal(razorpay.count('cancelScheduledChanges'), 1);
      assert.equal((await subscriptionOf(seller)).scheduledPlan, '');

      await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      const applied = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: PRO_PLAN }));
      assert.equal(applied.status, 200);
      current = await subscriptionOf(seller);
      assert.equal(current.plan, 'pro');
      assert.equal(current.scheduledPlan, '');
      assert.equal(current.status, 'active');
      assertAll(await advancedStatuses(seller.token), 403);
      assert.equal(razorpay.count('create'), 0);
    });

    it('cancellation stops renewal but keeps the paid period', async () => {
      const seller = await registerTenant('cancel');
      const sub = await activatePaidPlan(seller, 'advanced');
      razorpay.reset();

      const cancelled = await api('POST', '/api/billing/subscription/cancel', { token: seller.token, body: {} });
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
      assert.equal(razorpay.calls[0].atCycleEnd, true);
      assert.equal(cancelled.data.subscription.status, 'active');
      assert.equal(cancelled.data.subscription.cancelAtPeriodEnd, true);
      assertAll(await advancedStatuses(seller.token), 200);

      assert.equal((await api('POST', '/api/billing/subscription/cancel', { token: seller.token, body: {} })).status, 400);
      assert.equal((await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } })).status, 409);

      // If the period passes before Razorpay's webhook arrives, access still ends.
      await Subscription.updateOne({ businessId: seller.businessId }, { $set: { currentPeriodEndAt: new Date(Date.now() - 1000) } });
      assertAll(await advancedStatuses(seller.token), 403);

      const ended = await sendWebhook('subscription.cancelled', periodEntity(sub, { status: 'cancelled', ended_at: Math.floor(Date.now() / 1000) }));
      assert.equal(ended.status, 200);
      const final = await subscriptionOf(seller);
      assert.equal(final.status, 'cancelled');
      assert.equal(final.cancelAtPeriodEnd, false);
      assertAll(await advancedStatuses(seller.token), 403);
    });

    it('lets a seller whose subscription ended subscribe again with one new subscription', async () => {
      const seller = await registerTenant('resubscribe');
      const sub = await activatePaidPlan(seller, 'pro');
      await sendWebhook('subscription.cancelled', periodEntity(sub, { status: 'cancelled' }));
      razorpay.reset();
      const again = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(again.status, 201);
      assert.equal(razorpay.count('create'), 1);
      const current = await subscriptionOf(seller);
      assert.notEqual(current.providerSubscriptionId, sub.providerSubscriptionId);
      assert.equal(current.status, 'incomplete');
      assert.equal(current.lastProviderEventAt, null);
      assertAll(await advancedStatuses(seller.token), 403);
    });

    it('trial checkout: card set up during the trial, no Advanced if the trial ends unpaid', async () => {
      const seller = await registerTenant('trialcheckout');
      razorpay.reset();
      const started = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      assert.equal(started.status, 201);
      const trialEnd = (await subscriptionOf(seller)).trialEndAt;
      assert.equal(razorpay.calls[0].payload.start_at, Math.floor(trialEnd.getTime() / 1000));

      // Switching plans mid-trial replaces the uncharged subscription instead of adding a second one.
      const switched = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(switched.status, 201);
      assert.equal(razorpay.count('cancel'), 1);
      assert.equal(razorpay.count('create'), 2);
      assert.notEqual(switched.data.checkout.subscriptionId, started.data.checkout.subscriptionId);
      assert.equal((await subscriptionOf(seller)).status, 'trialing');

      await expireTrial(seller);
      assertAll(await advancedStatuses(seller.token), 403);
      const billing = await api('GET', '/api/billing', { token: seller.token });
      assert.equal(billing.data.subscription.status, 'incomplete');
      assert.equal(billing.data.trial.ended, true);
    });

    it('G: webhook lifecycle — pending, grace, charged, halted, stale, duplicate, ended', async () => {
      const seller = await registerTenant('lifecycle');
      const sub = await activatePaidPlan(seller, 'advanced');
      const t0 = Date.now();

      const pending = await sendWebhook('subscription.pending', periodEntity(sub, { status: 'pending' }), { createdAt: new Date(t0 + 1000) });
      assert.equal(pending.status, 200);
      let current = await subscriptionOf(seller);
      assert.equal(current.status, 'past_due');
      assert.ok(current.pastDueSince);
      assertAll(await advancedStatuses(seller.token), 200);

      await Subscription.updateOne(
        { businessId: seller.businessId },
        { $set: { pastDueSince: new Date(Date.now() - (PAST_DUE_GRACE_DAYS + 1) * DAY_MS) } }
      );
      assertAll(await advancedStatuses(seller.token), 403);

      const charged = await sendWebhook('subscription.charged', periodEntity(sub), { createdAt: new Date(t0 + 2000) });
      assert.equal(charged.status, 200);
      current = await subscriptionOf(seller);
      assert.equal(current.status, 'active');
      assert.equal(current.pastDueSince, null);
      assertAll(await advancedStatuses(seller.token), 200);

      const duplicate = await sendWebhook('subscription.charged', periodEntity(sub), { id: charged.eventId, createdAt: new Date(t0 + 2000) });
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(await WebhookEvent.countDocuments({ eventId: charged.eventId }), 1);

      const halted = await sendWebhook('subscription.halted', periodEntity(sub, { status: 'halted' }), { createdAt: new Date(t0 + 3000) });
      assert.equal(halted.status, 200);
      assert.equal((await subscriptionOf(seller)).status, 'halted');
      assertAll(await advancedStatuses(seller.token), 403);

      // A retry of an older event must not undo the halt.
      const stale = await sendWebhook('subscription.charged', periodEntity(sub), { createdAt: new Date(t0 + 1500) });
      assert.equal(stale.status, 200);
      assert.equal((await subscriptionOf(seller)).status, 'halted');

      const cancelled = await sendWebhook('subscription.cancelled', periodEntity(sub, { status: 'cancelled' }), { createdAt: new Date(t0 + 4000) });
      assert.equal(cancelled.status, 200);
      const late = await sendWebhook('subscription.activated', periodEntity(sub), { createdAt: new Date(t0 + 5000) });
      assert.equal(late.status, 200);
      current = await subscriptionOf(seller);
      assert.equal(current.status, 'cancelled');
      assertAll(await advancedStatuses(seller.token), 403);
    });

    it('releases a webhook claim when processing fails so the retry is applied', async () => {
      const seller = await registerTenant('retry');
      await expireTrial(seller);
      await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      const sub = await subscriptionOf(seller);

      const originalSave = Subscription.prototype.save;
      let failed = false;
      Subscription.prototype.save = function failingSave(...args) {
        if (!failed && this.providerSubscriptionId === sub.providerSubscriptionId) {
          failed = true;
          return Promise.reject(new Error('simulated database outage'));
        }
        return originalSave.apply(this, args);
      };
      let first;
      try {
        first = await sendWebhook('subscription.activated', periodEntity(sub), { id: `evt_${stamp}_retry` });
      } finally {
        Subscription.prototype.save = originalSave;
      }
      assert.equal(first.status, 500);
      assert.equal(await WebhookEvent.countDocuments({ eventId: `evt_${stamp}_retry` }), 0);

      const retry = await sendWebhook('subscription.activated', periodEntity(sub), { id: `evt_${stamp}_retry` });
      assert.equal(retry.status, 200);
      assert.notEqual(retry.data.duplicate, true);
      assert.equal((await subscriptionOf(seller)).status, 'active');
    });

    it('F: sellers cannot reach another shop\'s data', async () => {
      const shopA = await registerTenant('isoa');
      const shopB = await registerTenant('isob');
      const product = await api('POST', '/api/products', {
        token: shopA.token,
        body: { name: 'Private Bangle', price: 500, stockQuantity: 5, status: 'Active' },
      });
      const productId = product.data.product.id;
      const order = await api('POST', `/api/store/${shopA.slug}/orders`, {
        body: { customer: { name: 'Asha', phone: '9876512345' }, items: [{ productId, quantity: 1 }], deliveryMethod: 'Pickup' },
      });
      assert.equal(order.status, 201, JSON.stringify(order.data));
      const orderId = String((await Order.findOne({ businessId: shopA.businessId }).select('_id'))._id);
      const invoice = await api('GET', `/api/orders/${orderId}/invoice`, { token: shopA.token });
      assert.equal(invoice.status, 200);
      const invoiceId = invoice.data.invoice.id;

      assert.equal((await api('GET', `/api/orders/${orderId}`, { token: shopB.token })).status, 404);
      assert.equal((await api('GET', `/api/orders/${orderId}/invoice`, { token: shopB.token })).status, 404);
      assert.equal((await api('GET', `/api/invoices/${invoiceId}/pdf`, { token: shopB.token })).status, 404);
      assert.equal((await api('GET', `/api/products/${productId}`, { token: shopB.token })).status, 404);
      const edit = await api('PATCH', `/api/products/${productId}`, { token: shopB.token, body: { price: 1 } });
      assert.equal(edit.status, 404);
      assert.equal((await Product.findById(productId)).price, 500);

      const report = await api('GET', `/api/analytics/sales-report?range=7d&businessId=${shopA.businessId}`, {
        token: shopB.token,
        headers: { 'x-business-id': String(shopA.businessId) },
      });
      assert.equal(report.status, 200);
      assert.equal(JSON.stringify(report.data).includes(order.data.order.orderNumber), false);
      const csv = await api('GET', `/api/products/export.csv?sellerId=${shopA.businessId}`, { token: shopB.token });
      assert.equal(csv.status, 200);
      assert.equal(csv.text.includes('Private Bangle'), false);

      const token = order.data.confirmationToken;
      assert.equal((await api('GET', `/api/store/${shopB.slug}/orders/confirm/${token}/invoice`)).status, 404);
    });
  });

  describe('subscription receipts', () => {
    let paymentSeq = 0;
    function paymentEntity(overrides = {}) {
      paymentSeq += 1;
      return {
        id: `pay_${stamp.replace(/[^a-z0-9]/gi, '')}_${paymentSeq}`,
        entity: 'payment',
        amount: 89900,
        currency: 'INR',
        status: 'captured',
        captured: true,
        method: 'upi',
        created_at: Math.floor(Date.now() / 1000),
        ...overrides,
      };
    }
    const receiptsFor = (tenant) => SubscriptionReceipt.find({ businessId: tenant.businessId }).sort({ createdAt: 1 }).lean();
    const receiptSeq = (receipt) => Number(receipt.receiptNumber.slice(3));

    it('records one receipt for each captured charge, numbered in a Cove-wide sequence', async () => {
      const seller = await registerTenant('receipt');
      const sub = await activatePaidPlan(seller, 'advanced');
      assert.equal((await receiptsFor(seller)).length, 0, 'an activation without a payment is not a receipt');

      const first = paymentEntity({ created_at: 1791000000 });
      const charged = await sendWebhook(
        'subscription.charged',
        periodEntity(sub, { current_start: 1791000000, current_end: 1793592000 }),
        { payment: first }
      );
      assert.equal(charged.status, 200, JSON.stringify(charged.data));
      let receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 1);
      const [receipt] = receipts;
      assert.equal(String(receipt.subscriptionId), String(sub._id));
      assert.equal(receipt.providerSubscriptionId, sub.providerSubscriptionId);
      assert.equal(receipt.providerPaymentId, first.id);
      assert.equal(receipt.plan, 'advanced');
      assert.equal(receipt.amountPaise, 89900);
      assert.equal(receipt.currency, 'INR');
      assert.equal(receipt.paidAt.getTime(), 1791000000 * 1000);
      assert.equal(receipt.periodStartAt.getTime(), 1791000000 * 1000);
      assert.equal(receipt.periodEndAt.getTime(), 1793592000 * 1000);
      assert.match(receipt.receiptNumber, /^CR-\d{6,}$/);
      assert.equal((await subscriptionOf(seller)).status, 'active');

      await sendWebhook('subscription.charged', periodEntity(sub), { payment: paymentEntity() });
      receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 2);
      assert.ok(receiptSeq(receipts[1]) > receiptSeq(receipts[0]));
      // Shop order and invoice numbering is untouched.
      assert.equal(await OrderCounter.countDocuments({ businessId: seller.businessId }), 0);
    });

    it('creates one receipt when activated and charged carry the same payment, and on replays', async () => {
      const seller = await registerTenant('receiptdup');
      await expireTrial(seller);
      const started = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'pro' } });
      assert.equal(started.status, 201, JSON.stringify(started.data));
      const sub = await subscriptionOf(seller);
      const payment = paymentEntity({ amount: 59900 });
      const entity = periodEntity(sub);

      const [activated, charged] = await Promise.all([
        sendWebhook('subscription.activated', entity, { payment }),
        sendWebhook('subscription.charged', entity, { payment }),
      ]);
      assert.equal(activated.status, 200, JSON.stringify(activated.data));
      assert.equal(charged.status, 200, JSON.stringify(charged.data));

      const replay = await sendWebhook('subscription.charged', entity, { payment, id: charged.eventId });
      assert.equal(replay.data.duplicate, true);
      const redelivered = await sendWebhook('subscription.charged', entity, { payment });
      assert.equal(redelivered.status, 200, JSON.stringify(redelivered.data));

      const receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].providerPaymentId, payment.id);
      assert.equal(receipts[0].plan, 'pro');
      assert.equal(receipts[0].amountPaise, 59900);
      assert.equal((await subscriptionOf(seller)).status, 'active');
    });

    it('never records pending, failed or authorized payments, or a plan change without a charge', async () => {
      const seller = await registerTenant('receiptnone');
      const sub = await activatePaidPlan(seller, 'pro');
      for (const status of ['created', 'authorized', 'failed', 'refunded']) {
        // eslint-disable-next-line no-await-in-loop
        const res = await sendWebhook('subscription.charged', periodEntity(sub), {
          payment: paymentEntity({ status, captured: false, amount: 59900 }),
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
      }

      const upgraded = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(upgraded.status, 201, JSON.stringify(upgraded.data));
      const updated = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }));
      assert.equal(updated.status, 200);
      assert.equal((await subscriptionOf(seller)).plan, 'advanced');

      const pending = await sendWebhook('subscription.pending', periodEntity(sub, { status: 'pending', plan_id: ADVANCED_PLAN }), {
        payment: paymentEntity({ status: 'failed', captured: false }),
      });
      assert.equal(pending.status, 200);
      assert.equal((await subscriptionOf(seller)).status, 'past_due');

      assert.equal((await receiptsFor(seller)).length, 0);
    });

    it('does not record the card authorization made during a trial', async () => {
      const seller = await registerTenant('receipttrial');
      const started = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(started.status, 201, JSON.stringify(started.data));
      const sub = await subscriptionOf(seller);
      assert.equal(sub.status, 'trialing');

      const entity = periodEntity(sub, { status: 'authenticated', current_start: null, current_end: null });
      const authorized = await sendWebhook('subscription.authenticated', entity, {
        payment: paymentEntity({ status: 'authorized', captured: false, amount: 500 }),
      });
      assert.equal(authorized.status, 200);
      // Even a captured mandate check on authentication is not a subscription payment.
      const verified = await sendWebhook('subscription.authenticated', entity, { payment: paymentEntity({ amount: 500 }) });
      assert.equal(verified.status, 200);

      assert.equal((await subscriptionOf(seller)).status, 'trialing');
      assert.equal((await receiptsFor(seller)).length, 0);
    });

    it('ignores captured payments for subscriptions Cove does not hold', async () => {
      const paid = await registerTenant('receiptother');
      await activatePaidPlan(paid, 'pro');
      const tag = stamp.replace(/[^a-z0-9]/gi, '');

      const unknown = paymentEntity();
      const res = await sendWebhook('subscription.charged', { id: `sub_unknown_${tag}`, plan_id: PRO_PLAN, status: 'active' }, { payment: unknown });
      assert.equal(res.status, 200);

      // A second Razorpay subscription naming a shop that already pays is not adopted, so no receipt either.
      const second = paymentEntity();
      const other = await sendWebhook('subscription.charged', {
        id: `sub_second_${tag}`,
        plan_id: PRO_PLAN,
        status: 'active',
        notes: { businessId: String(paid.businessId) },
      }, { payment: second });
      assert.equal(other.status, 200);

      assert.equal(await SubscriptionReceipt.countDocuments({ providerPaymentId: { $in: [unknown.id, second.id] } }), 0);
      assert.equal((await receiptsFor(paid)).length, 0);
    });
  });

  describe('Razorpay subscription invoices', () => {
    const tag = stamp.replace(/[^a-z0-9]/gi, '');
    let paymentSeq = 0;
    let invoiceSeq = 0;

    function paymentEntity(overrides = {}) {
      paymentSeq += 1;
      return {
        id: `pay_inv${tag}_${paymentSeq}`,
        entity: 'payment',
        amount: 59900,
        currency: 'INR',
        status: 'captured',
        captured: true,
        method: 'card',
        created_at: Math.floor(Date.now() / 1000),
        ...overrides,
      };
    }

    // What Razorpay's payments API returns for this payment.
    function seedPayment(payment) {
      razorpay.payments.set(payment.id, { ...payment });
      return payment;
    }

    // A paid Razorpay invoice for `payment` on `sub`, as the Invoices API returns it.
    function seedInvoice(sub, payment, overrides = {}) {
      invoiceSeq += 1;
      const invoice = {
        id: `inv_${tag}${invoiceSeq}`,
        entity: 'invoice',
        type: 'invoice',
        subscription_id: sub.providerSubscriptionId,
        payment_id: payment.id,
        status: 'paid',
        amount: payment.amount,
        amount_paid: payment.amount,
        currency: 'INR',
        paid_at: payment.created_at,
        billing_start: payment.created_at,
        billing_end: payment.created_at + 30 * 24 * 3600,
        short_url: `https://rzp.io/i/${tag}${invoiceSeq}`,
        ...overrides,
      };
      razorpay.invoices.set(invoice.id, invoice);
      return invoice;
    }

    const receiptsFor = (tenant) => SubscriptionReceipt.find({ businessId: tenant.businessId }).sort({ createdAt: 1 }).lean();
    const invoicePath = (receipt) => `/api/billing/receipts/${receipt._id}/invoice`;
    const counterSeq = async () => (await ReceiptCounter.findById('subscription').lean())?.seq || 0;

    it('stores Razorpay\'s invoice id and fills it in later without a second receipt or number', async () => {
      const seller = await registerTenant('invlink');
      const sub = await activatePaidPlan(seller, 'pro');
      const payment = paymentEntity();

      await sendWebhook('subscription.activated', periodEntity(sub), { payment });
      const [first] = await receiptsFor(seller);
      assert.equal(first.providerInvoiceId, '');
      const seqBefore = await counterSeq();

      const invoiceId = `inv_${tag}link`;
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: { ...payment, invoice_id: invoiceId } });
      // A stored invoice id is never replaced.
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: { ...payment, invoice_id: `inv_${tag}other` } });
      // Malformed ids are ignored.
      const second = paymentEntity({ invoice_id: 'https://rzp.io/i/not-an-id' });
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: second });

      const receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 2);
      assert.equal(receipts[0].receiptNumber, first.receiptNumber);
      assert.equal(receipts[0].providerInvoiceId, invoiceId);
      assert.equal(receipts[1].providerInvoiceId, '');
      assert.equal(await counterSeq(), seqBefore + 1, 'only the second payment used a receipt number');
    });

    it('lists only the signed-in shop\'s payments and opens their paid Razorpay invoice', async () => {
      const shopA = await registerTenant('invowner');
      const shopB = await registerTenant('invother');
      const sub = await activatePaidPlan(shopA, 'advanced');
      const payment = seedPayment(paymentEntity({ amount: 89900 }));
      const invoice = seedInvoice(sub, payment);
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: { ...payment, invoice_id: invoice.id } });
      const [receipt] = await receiptsFor(shopA);

      const listA = await api('GET', '/api/billing/receipts', { token: shopA.token });
      assert.equal(listA.status, 200, JSON.stringify(listA.data));
      assert.equal(listA.data.total, 1);
      const [item] = listA.data.receipts;
      assert.deepEqual(Object.keys(item).sort(), [
        'amount', 'amountPaise', 'currency', 'id', 'invoiceAvailable', 'invoiceLookupAvailable', 'paidAt',
        'periodEndAt', 'periodStartAt', 'plan', 'planName', 'receiptNumber',
      ]);
      assert.equal(item.id, String(receipt._id));
      assert.equal(item.plan, 'advanced');
      assert.equal(item.planName, 'Cove Plus');
      assert.equal(item.amountPaise, 89900);
      assert.equal(item.amount, 899);
      assert.equal(item.currency, 'INR');
      assert.equal(item.invoiceAvailable, true);
      assert.equal(item.invoiceLookupAvailable, false);
      const serialized = JSON.stringify(listA.data);
      for (const hidden of [payment.id, invoice.id, sub.providerSubscriptionId, 'rzp.io', env.razorpay.keySecret]) {
        assert.equal(serialized.includes(hidden), false, `receipt list exposed ${hidden}`);
      }

      const listB = await api('GET', '/api/billing/receipts', { token: shopB.token });
      assert.equal(listB.status, 200);
      assert.equal(listB.data.total, 0);
      assert.equal((await api('GET', '/api/billing/receipts')).status, 401);

      razorpay.reset();
      const foreign = await api('GET', invoicePath(receipt), { token: shopB.token });
      assert.equal(foreign.status, 404);
      assert.equal(foreign.data.url, undefined);
      assert.equal(razorpay.calls.length, 0, 'another shop\'s request never reaches Razorpay');

      // Nor can another shop start, or use up, a lookup for a receipt without a stored invoice id.
      const unlinked = paymentEntity();
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: unlinked });
      const unlinkedReceipt = await SubscriptionReceipt.findOne({ providerPaymentId: unlinked.id }).lean();
      razorpay.reset();
      assert.equal((await api('GET', invoicePath(unlinkedReceipt), { token: shopB.token })).status, 404);
      assert.equal(razorpay.calls.length, 0, 'another shop cannot start an invoice lookup');
      assert.equal((await SubscriptionReceipt.findById(unlinkedReceipt._id).lean()).invoiceLookupAt, null);

      assert.equal((await api('GET', '/api/billing/receipts/not-an-id/invoice', { token: shopA.token })).status, 404);
      assert.equal((await api('GET', invoicePath(receipt))).status, 401);

      const opened = await api('GET', invoicePath(receipt), { token: shopA.token });
      assert.equal(opened.status, 200, JSON.stringify(opened.data));
      assert.deepEqual(opened.data, { url: invoice.short_url });
    });

    it('refuses unpaid invoices, mismatched ids and URLs outside rzp.io', async () => {
      const seller = await registerTenant('invcheck');
      const sub = await activatePaidPlan(seller, 'pro');
      const payment = seedPayment(paymentEntity());
      const invoice = seedInvoice(sub, payment);
      await sendWebhook('subscription.charged', periodEntity(sub), { payment: { ...payment, invoice_id: invoice.id } });
      const [receipt] = await receiptsFor(seller);

      const openWith = async (overrides) => {
        razorpay.invoices.set(invoice.id, { ...invoice, ...overrides });
        return api('GET', invoicePath(receipt), { token: seller.token });
      };
      const refused = [
        ['issued', { status: 'issued' }],
        ['partially paid', { status: 'partially_paid' }],
        ['cancelled', { status: 'cancelled' }],
        ['another payment', { payment_id: `pay_inv${tag}_elsewhere` }],
        ['another subscription', { subscription_id: `sub_inv${tag}_elsewhere` }],
        ['plain http', { short_url: 'http://rzp.io/i/abc123' }],
        ['another host', { short_url: 'https://evil.example/i/abc123' }],
        ['lookalike host', { short_url: 'https://rzp.io.evil.example/i/abc123' }],
        ['dashboard link', { short_url: `https://dashboard.razorpay.com/app/invoices/${invoice.id}` }],
        ['credentials in url', { short_url: 'https://user:secret@rzp.io/i/abc123' }],
        ['custom port', { short_url: 'https://rzp.io:8443/i/abc123' }],
        ['no url', { short_url: null }],
      ];
      for (const [label, overrides] of refused) {
        // eslint-disable-next-line no-await-in-loop
        const res = await openWith(overrides);
        assert.equal(res.status, 404, label);
        assert.equal(res.data.url, undefined, label);
      }

      razorpay.invoices.delete(invoice.id);
      assert.equal((await api('GET', invoicePath(receipt), { token: seller.token })).status, 404, 'unknown invoice');

      const valid = await openWith({});
      assert.equal(valid.status, 200);
      assert.equal(valid.data.url, invoice.short_url);
    });

    it('finds the invoice through the payment, then the subscription\'s invoices, when no id was stored', async () => {
      const seller = await registerTenant('invfallback');
      const sub = await activatePaidPlan(seller, 'pro');

      const viaPayment = paymentEntity();
      const invoiceA = seedInvoice(sub, viaPayment);
      seedPayment({ ...viaPayment, invoice_id: invoiceA.id });
      const viaList = seedPayment(paymentEntity());
      const invoiceB = seedInvoice(sub, viaList);
      const orphan = seedPayment(paymentEntity());

      for (const payment of [viaPayment, viaList, orphan]) {
        // eslint-disable-next-line no-await-in-loop
        await sendWebhook('subscription.charged', periodEntity(sub), { payment });
      }
      const receiptOf = async (payment) => SubscriptionReceipt.findOne({ providerPaymentId: payment.id }).lean();
      const listed = await api('GET', '/api/billing/receipts', { token: seller.token });
      assert.deepEqual(listed.data.receipts.map((item) => item.invoiceAvailable), [false, false, false]);
      assert.deepEqual(listed.data.receipts.map((item) => item.invoiceLookupAvailable), [true, true, true]);

      const openedA = await api('GET', invoicePath(await receiptOf(viaPayment)), { token: seller.token });
      assert.equal(openedA.status, 200, JSON.stringify(openedA.data));
      assert.equal(openedA.data.url, invoiceA.short_url);
      const openedB = await api('GET', invoicePath(await receiptOf(viaList)), { token: seller.token });
      assert.equal(openedB.status, 200, JSON.stringify(openedB.data));
      assert.equal(openedB.data.url, invoiceB.short_url);
      assert.equal((await api('GET', invoicePath(await receiptOf(orphan)), { token: seller.token })).status, 404);

      assert.equal((await receiptOf(viaPayment)).providerInvoiceId, invoiceA.id);
      assert.equal((await receiptOf(viaList)).providerInvoiceId, invoiceB.id);
      assert.equal((await receiptOf(orphan)).providerInvoiceId, '');
      assert.equal((await receiptsFor(seller)).length, 3);
    });

    it('looks up a missing invoice id once per cooldown and retries after an outage', async () => {
      const seller = await registerTenant('invlookup');
      const sub = await activatePaidPlan(seller, 'pro');
      const payment = seedPayment(paymentEntity());
      await sendWebhook('subscription.charged', periodEntity(sub), { payment });
      const receiptOf = () => SubscriptionReceipt.findOne({ providerPaymentId: payment.id }).lean();
      const receipt = await receiptOf();
      const listItem = async () => (await api('GET', '/api/billing/receipts', { token: seller.token })).data.receipts[0];

      const listed = await listItem();
      assert.equal(listed.invoiceAvailable, false);
      assert.equal(listed.invoiceLookupAvailable, true);

      // Razorpay is down: the seller gets a 502 and can retry at once.
      const client = razorpayService.getClient();
      const fetchPayment = client.payments.fetch;
      client.payments.fetch = async () => {
        throw Object.assign(new Error('Razorpay unavailable'), { statusCode: 503 });
      };
      let outage;
      try {
        outage = await api('GET', invoicePath(receipt), { token: seller.token });
      } finally {
        client.payments.fetch = fetchPayment;
      }
      assert.equal(outage.status, 502);
      assert.equal((await receiptOf()).invoiceLookupAt, null);

      // Razorpay has no invoice yet: one lookup, then nothing until the cooldown ends.
      razorpay.reset();
      const missing = await api('GET', invoicePath(receipt), { token: seller.token });
      assert.equal(missing.status, 404);
      assert.equal(missing.data.url, undefined);
      assert.match(missing.data.message, /not issued an invoice/);
      assert.ok(razorpay.calls.length > 0);
      assert.ok((await receiptOf()).invoiceLookupAt instanceof Date);
      assert.equal((await listItem()).invoiceLookupAvailable, false);

      const invoice = seedInvoice(sub, payment);
      razorpay.reset();
      const repeat = await api('GET', invoicePath(receipt), { token: seller.token });
      assert.equal(repeat.status, 404);
      assert.equal(razorpay.calls.length, 0, 'no Razorpay calls during the cooldown');

      // After the cooldown the invoice is found, verified and stored.
      await SubscriptionReceipt.updateOne(
        { _id: receipt._id },
        { $set: { invoiceLookupAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } }
      );
      assert.equal((await listItem()).invoiceLookupAvailable, true);
      const found = await api('GET', invoicePath(receipt), { token: seller.token });
      assert.equal(found.status, 200, JSON.stringify(found.data));
      assert.deepEqual(found.data, { url: invoice.short_url });
      assert.equal(found.headers.get('cache-control'), 'no-store');
      assert.equal((await receiptOf()).providerInvoiceId, invoice.id);

      const after = await listItem();
      assert.equal(after.invoiceAvailable, true);
      assert.equal(after.invoiceLookupAvailable, false);
      const serialized = JSON.stringify(after);
      for (const hidden of [payment.id, invoice.id, sub.providerSubscriptionId, 'rzp.io']) {
        assert.equal(serialized.includes(hidden), false, `receipt list exposed ${hidden}`);
      }
    });

    it('never leaves an invoice lookup blocked after an exception, a database failure or a wrong clock', async () => {
      const seller = await registerTenant('invstuck');
      const sub = await activatePaidPlan(seller, 'pro');
      const payment = seedPayment(paymentEntity());
      await sendWebhook('subscription.charged', periodEntity(sub), { payment });
      const invoice = seedInvoice(sub, payment);
      const receiptOf = () => SubscriptionReceipt.findOne({ providerPaymentId: payment.id }).lean();
      const receipt = await receiptOf();
      const open = () => api('GET', invoicePath(receipt), { token: seller.token });
      const lookupAvailable = async () => (
        await api('GET', '/api/billing/receipts', { token: seller.token })
      ).data.receipts[0].invoiceLookupAvailable;
      const setLookupAt = (date) => SubscriptionReceipt.updateOne({ _id: receipt._id }, { $set: { invoiceLookupAt: date } });
      const hour = 60 * 60 * 1000;

      // An unexpected exception during the lookup.
      const fetchPayment = razorpayService.fetchPayment;
      razorpayService.fetchPayment = async () => {
        throw new Error('unexpected');
      };
      let crashed;
      try {
        crashed = await open();
      } finally {
        razorpayService.fetchPayment = fetchPayment;
      }
      assert.equal(crashed.status, 500);
      assert.equal(crashed.data.url, undefined);
      assert.equal((await receiptOf()).invoiceLookupAt, null);

      // The invoice is verified but storing its id fails.
      const findOneAndUpdate = SubscriptionReceipt.findOneAndUpdate;
      let writes = 0;
      SubscriptionReceipt.findOneAndUpdate = function failSecondWrite(...args) {
        writes += 1;
        if (writes === 2) return Promise.reject(new Error('database unavailable'));
        return findOneAndUpdate.apply(this, args);
      };
      let dbFailure;
      try {
        dbFailure = await open();
      } finally {
        SubscriptionReceipt.findOneAndUpdate = findOneAndUpdate;
      }
      assert.equal(writes, 2, 'the lookup was claimed, then linking failed');
      assert.equal(dbFailure.status, 500);
      assert.equal(dbFailure.data.url, undefined);
      let stored = await receiptOf();
      assert.equal(stored.invoiceLookupAt, null);
      assert.equal(stored.providerInvoiceId, '');
      assert.equal(await lookupAvailable(), true);

      // A Razorpay outage after an earlier, expired lookup restores that earlier time.
      const earlier = new Date(Date.now() - 2 * hour);
      await setLookupAt(earlier);
      const client = razorpayService.getClient();
      const listInvoices = client.invoices.all;
      client.invoices.all = async () => {
        throw Object.assign(new Error('Razorpay unavailable'), { statusCode: 503 });
      };
      let outage;
      try {
        outage = await open();
      } finally {
        client.invoices.all = listInvoices;
      }
      assert.equal(outage.status, 502);
      assert.equal((await receiptOf()).invoiceLookupAt.getTime(), earlier.getTime());
      assert.equal(await lookupAvailable(), true);

      // A lookup a little in the future (clock skew within one cooldown) still blocks.
      await setLookupAt(new Date(Date.now() + 10 * 60 * 1000));
      assert.equal(await lookupAvailable(), false);
      razorpay.reset();
      assert.equal((await open()).status, 404);
      assert.equal(razorpay.calls.length, 0);

      // One further ahead than a cooldown cannot block lookups beyond it.
      await setLookupAt(new Date(Date.now() + 24 * hour));
      assert.equal(await lookupAvailable(), true);
      const found = await open();
      assert.equal(found.status, 200, JSON.stringify(found.data));
      assert.equal(found.data.url, invoice.short_url);
      stored = await receiptOf();
      assert.equal(stored.providerInvoiceId, invoice.id);
      assert.equal(await lookupAvailable(), false);
    });

    it('records a captured upgrade charge reported on subscription.updated, once', async () => {
      const seller = await registerTenant('invupgrade');
      const sub = await activatePaidPlan(seller, 'pro');
      const now = Math.floor(Date.now() / 1000);

      // Invoices that must never become receipts: unpaid, refunded, and paid long before this update.
      seedInvoice(sub, seedPayment(paymentEntity({ amount: 30000 })), { status: 'issued' });
      seedInvoice(sub, seedPayment(paymentEntity({ amount: 30000, status: 'refunded', captured: false })));
      seedInvoice(sub, seedPayment(paymentEntity({ created_at: now - 40 * 24 * 3600 })));

      const upgraded = await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      assert.equal(upgraded.status, 201, JSON.stringify(upgraded.data));
      const charge = seedPayment(paymentEntity({ amount: 15000, created_at: now }));
      const invoice = seedInvoice(sub, charge, { billing_start: now, billing_end: now + 20 * 24 * 3600 });

      // Razorpay's documented subscription.updated payload carries no payment.
      const updated = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }));
      assert.equal(updated.status, 200, JSON.stringify(updated.data));
      let receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].providerPaymentId, charge.id);
      assert.equal(receipts[0].providerInvoiceId, invoice.id);
      assert.equal(receipts[0].amountPaise, 15000);
      assert.equal(receipts[0].plan, 'advanced');
      assert.equal(receipts[0].paidAt.getTime(), now * 1000);
      assert.equal(receipts[0].periodStartAt.getTime(), now * 1000);
      assert.equal(receipts[0].periodEndAt.getTime(), (now + 20 * 24 * 3600) * 1000);
      const current = await subscriptionOf(seller);
      assert.equal(current.plan, 'advanced');
      assert.equal(current.status, 'active');

      const replay = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }), { id: updated.eventId });
      assert.equal(replay.data.duplicate, true);
      await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }));
      await sendWebhook('subscription.charged', periodEntity(sub, { plan_id: ADVANCED_PLAN }), {
        payment: { ...charge, invoice_id: invoice.id },
      });
      receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 1);

      // When the update does carry its captured payment, that payment is recorded directly.
      const direct = paymentEntity({ amount: 12000, invoice_id: `inv_${tag}direct` });
      const withPayment = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }), { payment: direct });
      assert.equal(withPayment.status, 200);
      receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 2);
      assert.equal(receipts[1].providerPaymentId, direct.id);
      assert.equal(receipts[1].providerInvoiceId, direct.invoice_id);
      assert.equal(receipts[1].amountPaise, 12000);
    });

    it('fails the subscription.updated webhook when Razorpay cannot be asked, so the retry records the charge', async () => {
      const seller = await registerTenant('invretry');
      const sub = await activatePaidPlan(seller, 'pro');
      await api('POST', '/api/billing/subscription', { token: seller.token, body: { plan: 'advanced' } });
      const charge = seedPayment(paymentEntity({ amount: 15000 }));
      seedInvoice(sub, charge);

      const client = razorpayService.getClient();
      const listInvoices = client.invoices.all;
      client.invoices.all = async () => {
        throw Object.assign(new Error('Razorpay unavailable'), { statusCode: 503 });
      };
      let first;
      try {
        first = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }), { id: `evt_${stamp}_invretry` });
      } finally {
        client.invoices.all = listInvoices;
      }
      assert.equal(first.status, 502);
      assert.equal(await WebhookEvent.countDocuments({ eventId: `evt_${stamp}_invretry` }), 0);
      assert.equal((await subscriptionOf(seller)).plan, 'advanced', 'the plan change itself is still applied');
      assert.equal((await receiptsFor(seller)).length, 0);

      const retry = await sendWebhook('subscription.updated', periodEntity(sub, { plan_id: ADVANCED_PLAN }), { id: `evt_${stamp}_invretry` });
      assert.equal(retry.status, 200, JSON.stringify(retry.data));
      const receipts = await receiptsFor(seller);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].providerPaymentId, charge.id);
    });
  });
});
