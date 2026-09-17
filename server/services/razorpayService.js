const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { COVE_PRO } = require('../utils/covePlan');

let client;

function getClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new ApiError(503, 'Billing is not configured yet. Please try again later.');
  }
  if (!env.razorpay.planId) {
    throw new ApiError(503, 'Cove Pro plan is not configured yet. Please try again later.');
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }
  return client;
}

// Tests inject a fake client so we never hit the live Razorpay API.
function setClientForTests(fake) {
  client = fake;
}

function resetClientForTests() {
  client = undefined;
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = env.razorpay.webhookSecret;
  if (!secret) {
    throw new ApiError(503, 'Webhook verification is not configured.');
  }
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const received = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

async function createSubscription({
  startAtUnix,
  expireByUnix,
  notes = {},
  totalCount = 120,
}) {
  const api = getClient();
  // Plan ID and amount come only from server config / Razorpay dashboard plan — never the client.
  const payload = {
    plan_id: env.razorpay.planId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: {
      ...notes,
      cove_plan: COVE_PRO.name,
      cove_amount_paise: String(COVE_PRO.amountPaise),
    },
  };
  if (startAtUnix) payload.start_at = startAtUnix;
  if (expireByUnix) payload.expire_by = expireByUnix;

  try {
    return await api.subscriptions.create(payload);
  } catch (err) {
    const message = err?.error?.description || err?.message || 'Could not start checkout with the payment provider.';
    throw new ApiError(502, message);
  }
}

async function cancelSubscription(providerSubscriptionId, { cancelAtCycleEnd = false } = {}) {
  const api = getClient();
  try {
    return await api.subscriptions.cancel(providerSubscriptionId, cancelAtCycleEnd);
  } catch (err) {
    const message = err?.error?.description || err?.message || 'Could not cancel the subscription.';
    throw new ApiError(502, message);
  }
}

module.exports = {
  getClient,
  setClientForTests,
  resetClientForTests,
  verifyWebhookSignature,
  createSubscription,
  cancelSubscription,
};
