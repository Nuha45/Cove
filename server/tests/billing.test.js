const { describe, it, before, after, beforeEach } = require('node:test');
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
const { signToken } = require('../services/tokenService');
const razorpayService = require('../services/razorpayService');
const { COVE_PRO } = require('../utils/covePlan');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'BillingTest1';
const createdBusinessIds = [];

let server;
let base;
let createCalls = 0;

function uniqueEmail(label) {
  return `phase8a-${label}-${stamp}@example.com`;
}

async function api(method, path, { token, body, headers, rawBody } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
      ...headers,
    },
    body: rawBody !== undefined
      ? rawBody
      : body !== undefined ? JSON.stringify(body) : undefined,
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
  return { status: response.status, data, text };
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
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
  };
}

function signWebhook(rawBody) {
  return crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody))
    .digest('hex');
}

describe('billing', { timeout: 180000 }, () => {
  let owner;
  let other;

  before(async () => {
    await connectTestDB();
    razorpayService.setClientForTests({
      subscriptions: {
        create: async (payload) => {
          createCalls += 1;
          assert.equal(payload.plan_id, env.razorpay.planId);
          assert.equal(payload.plan_id !== 'plan_from_client', true);
          return {
            id: `sub_test_${stamp}_${createCalls}_${Math.random().toString(16).slice(2, 8)}`,
            plan_id: payload.plan_id,
            status: 'created',
            customer_id: `cust_test_${createCalls}_${Math.random().toString(16).slice(2, 6)}`,
            current_start: null,
            current_end: null,
          };
        },
        cancel: async (id) => ({ id, status: 'cancelled' }),
      },
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
  });

  after(async () => {
    razorpayService.resetClientForTests();
    if (createdBusinessIds.length) {
      await Subscription.deleteMany({ businessId: { $in: createdBusinessIds } });
      // The database is shared with real environments: only remove events this run created.
      await WebhookEvent.deleteMany({ eventId: { $regex: stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  beforeEach(() => {
    createCalls = 0;
  });

  it('requires auth and isolates billing by business', async () => {
    const unauth = await api('GET', '/api/billing');
    assert.equal(unauth.status, 401);

    const mine = await api('GET', '/api/billing', { token: owner.token });
    assert.equal(mine.status, 200, JSON.stringify(mine.data));
    assert.equal(mine.data.plan.amount, 599);
    assert.equal(mine.data.plan.amountPaise, COVE_PRO.amountPaise);
    assert.equal(mine.data.subscription.status, 'trialing');
    assert.ok(mine.data.subscription.trialEndAt);
    assert.equal(mine.data.checkout.keyId, env.razorpay.keyId);
    assert.equal(JSON.stringify(mine.data).includes(env.razorpay.keySecret), false);
    assert.equal(JSON.stringify(mine.data).includes(env.razorpay.webhookSecret), false);

    const otherBilling = await api('GET', '/api/billing', { token: other.token });
    assert.equal(otherBilling.status, 200);
    assert.notEqual(otherBilling.data.subscription.id, mine.data.subscription.id);

    const forged = await api('GET', '/api/billing?businessId=' + other.businessId, {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
    });
    assert.equal(forged.status, 200);
    assert.equal(forged.data.subscription.id, mine.data.subscription.id);
  });

  it('creates a provider subscription with server plan and blocks duplicates', async () => {
    const created = await api('POST', '/api/billing/subscription', {
      token: owner.token,
      body: {
        businessId: String(other.businessId),
        planId: 'plan_from_client',
        amount: 1,
        status: 'active',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.checkout.amount, 599);
    assert.equal(created.data.checkout.currency, 'INR');
    assert.ok(created.data.checkout.subscriptionId.startsWith('sub_'));
    assert.equal(createCalls, 1);

    const saved = await Subscription.findOne({ businessId: owner.businessId });
    assert.equal(saved.providerSubscriptionId, created.data.checkout.subscriptionId);
    assert.equal(saved.providerPlanId, env.razorpay.planId);

    const retry = await api('POST', '/api/billing/subscription', {
      token: owner.token,
      body: { planId: 'plan_from_client', amount: 0 },
    });
    assert.equal(retry.status, 201, JSON.stringify(retry.data));
    assert.equal(retry.data.checkout.subscriptionId, created.data.checkout.subscriptionId);
    assert.equal(createCalls, 1);

    const failing = await registerTenant('failing');
    razorpayService.setClientForTests({
      subscriptions: {
        create: async () => {
          const err = new Error('provider down');
          err.error = { description: 'Provider unavailable' };
          throw err;
        },
        cancel: async () => ({ status: 'cancelled' }),
      },
    });
    const failed = await api('POST', '/api/billing/subscription', { token: failing.token, body: {} });
    assert.equal(failed.status, 502);

    razorpayService.setClientForTests({
      subscriptions: {
        create: async (payload) => {
          createCalls += 1;
          return {
            id: `sub_test_${stamp}_${createCalls}_${Math.random().toString(16).slice(2, 8)}`,
            plan_id: payload.plan_id,
            status: 'created',
            customer_id: `cust_test_${createCalls}_${Math.random().toString(16).slice(2, 6)}`,
          };
        },
        cancel: async (id) => ({ id, status: 'cancelled' }),
      },
    });
  });

  it('verifies webhooks, is idempotent, and updates subscription lifecycle', async () => {
    const sub = await Subscription.findOne({ businessId: owner.businessId });
    assert.ok(sub.providerSubscriptionId);

    const bodyObj = {
      id: `evt_${stamp}_activate`,
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: sub.providerSubscriptionId,
            plan_id: env.razorpay.planId,
            status: 'active',
            customer_id: 'cust_live',
            current_start: Math.floor(Date.now() / 1000),
            current_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          },
        },
      },
    };
    const raw = JSON.stringify(bodyObj);
    const bad = await api('POST', '/api/webhooks/razorpay', {
      rawBody: raw,
      headers: {
        'x-razorpay-signature': 'invalid',
        'x-razorpay-event-id': bodyObj.id,
      },
    });
    assert.equal(bad.status, 400);

    const good = await api('POST', '/api/webhooks/razorpay', {
      rawBody: raw,
      headers: {
        'x-razorpay-signature': signWebhook(raw),
        'x-razorpay-event-id': bodyObj.id,
      },
    });
    assert.equal(good.status, 200, JSON.stringify(good.data));
    const after = await Subscription.findOne({ businessId: owner.businessId });
    assert.equal(after.status, 'active');

    const dup = await api('POST', '/api/webhooks/razorpay', {
      rawBody: raw,
      headers: {
        'x-razorpay-signature': signWebhook(raw),
        'x-razorpay-event-id': bodyObj.id,
      },
    });
    assert.equal(dup.status, 200);
    assert.equal(dup.data.duplicate, true);
    assert.equal(await WebhookEvent.countDocuments({ eventId: bodyObj.id }), 1);

    async function sendEvent(event, status, eventId) {
      const payload = {
        id: eventId,
        event,
        payload: {
          subscription: {
            entity: {
              id: sub.providerSubscriptionId,
              plan_id: env.razorpay.planId,
              status,
              current_start: Math.floor(Date.now() / 1000),
              current_end: Math.floor(Date.now() / 1000) + 86400,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      return api('POST', '/api/webhooks/razorpay', {
        rawBody,
        headers: {
          'x-razorpay-signature': signWebhook(rawBody),
          'x-razorpay-event-id': eventId,
        },
      });
    }

    assert.equal((await sendEvent('subscription.charged', 'active', `evt_${stamp}_charged`)).status, 200);
    assert.equal((await Subscription.findOne({ businessId: owner.businessId })).status, 'active');

    assert.equal((await sendEvent('subscription.pending', 'pending', `evt_${stamp}_pending`)).status, 200);
    assert.equal((await Subscription.findOne({ businessId: owner.businessId })).status, 'past_due');

    assert.equal((await sendEvent('subscription.halted', 'halted', `evt_${stamp}_halted`)).status, 200);
    assert.equal((await Subscription.findOne({ businessId: owner.businessId })).status, 'halted');

    const unknownSub = {
      id: `evt_${stamp}_unknown_sub`,
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_does_not_exist', status: 'active' } } },
    };
    const unknownRaw = JSON.stringify(unknownSub);
    const unknownRes = await api('POST', '/api/webhooks/razorpay', {
      rawBody: unknownRaw,
      headers: {
        'x-razorpay-signature': signWebhook(unknownRaw),
        'x-razorpay-event-id': unknownSub.id,
      },
    });
    assert.equal(unknownRes.status, 200);

    const ignored = {
      id: `evt_${stamp}_ignored`,
      event: 'payment.authorized',
      payload: {},
    };
    const ignoredRaw = JSON.stringify(ignored);
    const ignoredRes = await api('POST', '/api/webhooks/razorpay', {
      rawBody: ignoredRaw,
      headers: {
        'x-razorpay-signature': signWebhook(ignoredRaw),
        'x-razorpay-event-id': ignored.id,
      },
    });
    assert.equal(ignoredRes.status, 200);
    assert.equal(ignoredRes.data.ignored, true);

    const malformed = await api('POST', '/api/webhooks/razorpay', {
      rawBody: '{not-json',
      headers: {
        'x-razorpay-signature': signWebhook('{not-json'),
        'x-razorpay-event-id': 'evt_bad',
      },
    });
    assert.equal(malformed.status, 400);

    assert.equal((await sendEvent('subscription.cancelled', 'cancelled', `evt_${stamp}_cancel_wh`)).status, 200);
    assert.equal((await Subscription.findOne({ businessId: owner.businessId })).status, 'cancelled');
  });

  it('cancels an uncharged trial checkout through the seller API and keeps the trial', async () => {
    const started = await api('POST', '/api/billing/subscription', { token: other.token, body: {} });
    assert.equal(started.status, 201, JSON.stringify(started.data));

    const cancelled = await api('POST', '/api/billing/subscription/cancel', {
      token: other.token,
      body: { providerSubscriptionId: 'sub_forged_from_client' },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.equal(cancelled.data.subscription.status, 'trialing');
    assert.equal(cancelled.data.subscription.hasProviderSubscription, false);
    assert.ok(cancelled.data.subscription.cancelledAt);

    const again = await api('POST', '/api/billing/subscription/cancel', { token: other.token, body: {} });
    assert.equal(again.status, 400);

    const stillThere = await Subscription.findOne({ businessId: other.businessId });
    assert.ok(stillThere);
    assert.equal(stillThere.status, 'trialing');
    assert.ok(stillThere.trialEndAt > new Date());
  });

  it('keeps trial dates server-controlled and prevents a second trial row', async () => {
    const first = await Subscription.findOne({ businessId: owner.businessId });
    const trialEnd = first.trialEndAt;
    assert.ok(trialEnd);

    const billing = await api('GET', '/api/billing', { token: owner.token });
    assert.equal(billing.status, 200);
    assert.equal(new Date(billing.data.subscription.trialEndAt).getTime(), new Date(trialEnd).getTime());

    const count = await Subscription.countDocuments({ businessId: owner.businessId });
    assert.equal(count, 1);

    // Existing business without granting new trial: getOrCreate for a fresh id is tested via register only once.
    assert.equal(first.trialUsed, true);
  });
});
